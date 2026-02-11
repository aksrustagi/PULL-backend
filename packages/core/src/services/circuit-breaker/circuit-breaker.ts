/**
 * Circuit Breaker Implementation
 *
 * Protects the PULL trading platform from cascading failures when external
 * services (Kalshi, Massive, Stripe, Persona, Plaid, Matrix, Nylas, Fireblocks)
 * become unavailable or degrade.
 *
 * Implements the standard circuit breaker pattern with three states:
 * - CLOSED: Normal operation. Requests flow through and failures are tracked.
 * - OPEN: Service is down. Requests are rejected immediately with an optional fallback.
 * - HALF_OPEN: Recovery testing. A limited number of requests are allowed through
 *   to determine if the service has recovered.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   name: 'kalshi',
 *   failureThreshold: 5,
 *   failureWindowMs: 60_000,
 *   recoveryTimeoutMs: 30_000,
 *   successThreshold: 3,
 *   halfOpenMaxRequests: 1,
 * });
 *
 * const result = await breaker.execute(
 *   () => kalshiClient.getMarkets(),
 *   { fallback: () => cachedMarkets },
 * );
 * ```
 */

import {
  CircuitBreakerState,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
} from "./types";
import type {
  CircuitBreakerConfig,
  CircuitBreakerCallbacks,
  CircuitBreakerMetrics,
  CircuitBreakerExecuteOptions,
  CircuitBreakerHealth,
} from "./types";

/**
 * Tracked failure with timestamp for windowed failure counting
 */
interface TrackedFailure {
  timestamp: number;
  error: Error;
}

/**
 * Response time sample for computing averages
 */
interface ResponseTimeSample {
  timestamp: number;
  durationMs: number;
}

/** Maximum number of response time samples to retain for averaging */
const MAX_RESPONSE_SAMPLES = 100;

/** Default request timeout if not specified in config */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Circuit Breaker
 *
 * Thread-safe (single-threaded Node.js context) implementation of the circuit
 * breaker pattern. Each instance protects a single external service.
 */
export class CircuitBreaker {
  private readonly config: Readonly<CircuitBreakerConfig>;
  private callbacks: CircuitBreakerCallbacks;

  // State
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: TrackedFailure[] = [];
  private consecutiveSuccesses: number = 0;
  private halfOpenActiveRequests: number = 0;

  // Lifetime counters
  private totalRequests: number = 0;
  private totalSuccesses: number = 0;
  private totalFailures: number = 0;
  private totalRejections: number = 0;

  // Timestamps
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastOpenedTime: number | null = null;
  private lastClosedTime: number | null = null;

  // Recovery timer
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // Response time tracking
  private responseSamples: ResponseTimeSample[] = [];

  // Health check
  private healthCheckFn: (() => Promise<boolean>) | null = null;

  constructor(config: CircuitBreakerConfig, callbacks: CircuitBreakerCallbacks = {}) {
    this.config = Object.freeze({ ...config });
    this.callbacks = callbacks;
    this.lastClosedTime = Date.now();
  }

  /**
   * Get the service name this circuit breaker protects
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Get the current state of the circuit breaker
   */
  get currentState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if the circuit is allowing requests through
   */
  get isAvailable(): boolean {
    return this.state === CircuitBreakerState.CLOSED || this.state === CircuitBreakerState.HALF_OPEN;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * If the circuit is CLOSED, the function executes normally.
   * If the circuit is OPEN, the fallback is invoked (if provided) or an error is thrown.
   * If the circuit is HALF_OPEN, a limited number of requests are allowed through.
   *
   * @param fn - The async function to execute (e.g., an API call)
   * @param options - Optional fallback, timeout, and context
   * @returns The result of fn or the fallback
   * @throws CircuitBreakerOpenError if circuit is open and no fallback provided
   * @throws CircuitBreakerTimeoutError if the request exceeds the timeout
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: CircuitBreakerExecuteOptions<T> = {},
  ): Promise<T> {
    this.totalRequests++;

    // Check if circuit should allow this request
    if (!this.shouldAllowRequest()) {
      return this.handleRejection(options);
    }

    // Track half-open in-flight requests
    const isHalfOpen = this.state === CircuitBreakerState.HALF_OPEN;
    if (isHalfOpen) {
      this.halfOpenActiveRequests++;
    }

    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    try {
      const result = await this.executeWithTimeout(fn, timeoutMs);
      const durationMs = Date.now() - startTime;

      this.recordSuccess(durationMs);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if this error should be counted as a circuit breaker failure
      if (this.config.isFailure && !this.config.isFailure(err)) {
        // Error is not considered a circuit-breaking failure (e.g., 4xx client error)
        const durationMs = Date.now() - startTime;
        this.recordResponseTime(durationMs);
        throw err;
      }

      this.recordFailure(err);
      throw err;
    } finally {
      if (isHalfOpen) {
        this.halfOpenActiveRequests = Math.max(0, this.halfOpenActiveRequests - 1);
      }
    }
  }

  /**
   * Register event callbacks for state transitions and request outcomes.
   * Merges with any existing callbacks.
   */
  setCallbacks(callbacks: CircuitBreakerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Register a health check function. When set, the circuit breaker can
   * proactively test service health during the OPEN -> HALF_OPEN transition.
   */
  setHealthCheck(fn: () => Promise<boolean>): void {
    this.healthCheckFn = fn;
  }

  /**
   * Manually force the circuit to a specific state.
   * Use with caution -- primarily for operational overrides and testing.
   */
  forceState(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.transitionTo(newState);
  }

  /**
   * Reset the circuit breaker to its initial CLOSED state.
   * Clears all failure history, counters, and timers.
   */
  reset(): void {
    this.clearRecoveryTimer();

    const oldState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failures = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenActiveRequests = 0;
    this.totalRequests = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalRejections = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.lastOpenedTime = null;
    this.lastClosedTime = Date.now();
    this.responseSamples = [];

    if (oldState !== CircuitBreakerState.CLOSED) {
      this.emitStateChange(oldState, CircuitBreakerState.CLOSED);
    }
  }

  /**
   * Get a snapshot of the current metrics.
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.getWindowedFailureCount(),
      successCount: this.totalSuccesses,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastOpenedTime: this.lastOpenedTime,
      lastClosedTime: this.lastClosedTime,
      averageResponseTimeMs: this.getAverageResponseTime(),
      halfOpenRequests: this.halfOpenActiveRequests,
      successRate: this.totalRequests > 0
        ? this.totalSuccesses / this.totalRequests
        : 1.0,
    };
  }

  /**
   * Get the health status of this circuit breaker.
   */
  getHealth(): CircuitBreakerHealth {
    const now = Date.now();
    const metrics = this.getMetrics();

    return {
      service: this.config.name,
      state: this.state,
      healthy: this.state === CircuitBreakerState.CLOSED,
      failureCount: metrics.failureCount,
      successRate: metrics.successRate,
      timeSinceLastFailureMs: this.lastFailureTime !== null
        ? now - this.lastFailureTime
        : null,
      timeSinceOpenedMs: this.lastOpenedTime !== null
        ? now - this.lastOpenedTime
        : null,
      metrics,
    };
  }

  /**
   * Proactively run the health check (if registered) to test service availability.
   * Returns true if the service is healthy, false otherwise.
   * If no health check is registered, returns the current circuit state assumption.
   */
  async checkHealth(): Promise<boolean> {
    if (!this.healthCheckFn) {
      return this.state === CircuitBreakerState.CLOSED;
    }

    try {
      const healthy = await this.healthCheckFn();
      if (healthy && this.state === CircuitBreakerState.OPEN) {
        // Service recovered, transition to half-open for gradual recovery
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
      return healthy;
    } catch {
      return false;
    }
  }

  /**
   * Destroy this circuit breaker, cleaning up any timers.
   */
  destroy(): void {
    this.clearRecoveryTimer();
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Determine whether a request should be allowed through based on current state.
   */
  private shouldAllowRequest(): boolean {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Only allow up to halfOpenMaxRequests concurrent requests
        return this.halfOpenActiveRequests < this.config.halfOpenMaxRequests;

      default:
        return false;
    }
  }

  /**
   * Handle a rejected request (circuit is OPEN).
   */
  private async handleRejection<T>(
    options: CircuitBreakerExecuteOptions<T>,
  ): Promise<T> {
    this.totalRejections++;
    this.callbacks.onReject?.(this.config.name);

    if (options.fallback) {
      return options.fallback();
    }

    throw new CircuitBreakerOpenError(
      this.config.name,
      this.state,
      this.getMetrics(),
    );
  }

  /**
   * Execute a function with a timeout.
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs > 0 && timeoutMs < Infinity) {
        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(
              new CircuitBreakerTimeoutError(this.config.name, timeoutMs),
            );
          }
        }, timeoutMs);
      }

      fn().then(
        (result) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(result);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            reject(error);
          }
        },
      );
    });
  }

  /**
   * Record a successful request.
   */
  private recordSuccess(durationMs: number): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.recordResponseTime(durationMs);

    this.callbacks.onSuccess?.(this.config.name, durationMs);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    }
  }

  /**
   * Record a failed request.
   */
  private recordFailure(error: Error): void {
    const now = Date.now();
    this.totalFailures++;
    this.lastFailureTime = now;

    this.callbacks.onFailure?.(this.config.name, error);

    this.failures.push({ timestamp: now, error });
    this.pruneFailures(now);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately re-opens the circuit
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we've exceeded the failure threshold
      const windowedFailures = this.getWindowedFailureCount();
      if (windowedFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
      }
    }
  }

  /**
   * Transition to a new state, emitting appropriate events.
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;

    switch (newState) {
      case CircuitBreakerState.OPEN:
        this.lastOpenedTime = Date.now();
        this.consecutiveSuccesses = 0;
        this.halfOpenActiveRequests = 0;
        this.scheduleRecovery();
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.consecutiveSuccesses = 0;
        this.halfOpenActiveRequests = 0;
        this.clearRecoveryTimer();
        break;

      case CircuitBreakerState.CLOSED:
        this.lastClosedTime = Date.now();
        this.failures = [];
        this.consecutiveSuccesses = 0;
        this.halfOpenActiveRequests = 0;
        this.clearRecoveryTimer();
        break;
    }

    this.emitStateChange(oldState, newState);
  }

  /**
   * Emit state change events to callbacks.
   */
  private emitStateChange(
    from: CircuitBreakerState,
    to: CircuitBreakerState,
  ): void {
    const metrics = this.getMetrics();

    this.callbacks.onStateChange?.(this.config.name, from, to, metrics);

    switch (to) {
      case CircuitBreakerState.OPEN:
        this.callbacks.onOpen?.(this.config.name, metrics);
        break;
      case CircuitBreakerState.CLOSED:
        this.callbacks.onClose?.(this.config.name, metrics);
        break;
      case CircuitBreakerState.HALF_OPEN:
        this.callbacks.onHalfOpen?.(this.config.name, metrics);
        break;
    }
  }

  /**
   * Schedule the transition from OPEN to HALF_OPEN after the recovery timeout.
   */
  private scheduleRecovery(): void {
    this.clearRecoveryTimer();

    this.recoveryTimer = setTimeout(async () => {
      this.recoveryTimer = null;

      if (this.state !== CircuitBreakerState.OPEN) return;

      // If a health check is registered, test it before transitioning
      if (this.healthCheckFn) {
        try {
          const healthy = await this.healthCheckFn();
          if (healthy) {
            this.transitionTo(CircuitBreakerState.HALF_OPEN);
          } else {
            // Service still unhealthy, schedule another recovery attempt
            this.scheduleRecovery();
          }
        } catch {
          // Health check failed, schedule another recovery attempt
          this.scheduleRecovery();
        }
      } else {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
    }, this.config.recoveryTimeoutMs);

    // Prevent the timer from keeping the Node.js process alive
    if (this.recoveryTimer) {
      (this.recoveryTimer as unknown as { unref?: () => void }).unref?.();
    }
  }

  /**
   * Clear the recovery timer.
   */
  private clearRecoveryTimer(): void {
    if (this.recoveryTimer !== null) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  /**
   * Count failures within the configured window.
   */
  private getWindowedFailureCount(): number {
    const now = Date.now();
    this.pruneFailures(now);
    return this.failures.length;
  }

  /**
   * Remove failures that are outside the failure window.
   */
  private pruneFailures(now: number): void {
    const windowStart = now - this.config.failureWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp >= windowStart);
  }

  /**
   * Record a response time sample.
   */
  private recordResponseTime(durationMs: number): void {
    this.responseSamples.push({
      timestamp: Date.now(),
      durationMs,
    });

    // Evict oldest samples when we exceed the maximum
    if (this.responseSamples.length > MAX_RESPONSE_SAMPLES) {
      this.responseSamples = this.responseSamples.slice(-MAX_RESPONSE_SAMPLES);
    }
  }

  /**
   * Calculate the average response time from recent samples.
   */
  private getAverageResponseTime(): number {
    if (this.responseSamples.length === 0) return 0;

    const sum = this.responseSamples.reduce((acc, s) => acc + s.durationMs, 0);
    return sum / this.responseSamples.length;
  }
}
