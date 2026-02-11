/**
 * Circuit Breaker Types
 *
 * Type definitions for the circuit breaker pattern implementation
 * that protects the PULL platform from cascading failures when
 * external services (Kalshi, Massive, Stripe, etc.) become unavailable.
 */

/**
 * Circuit breaker states following the standard pattern:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are rejected immediately
 * - HALF_OPEN: Testing if the service has recovered
 */
export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * External services protected by circuit breakers
 */
export type ExternalService =
  | "kalshi"
  | "massive"
  | "stripe"
  | "persona"
  | "plaid"
  | "matrix"
  | "nylas"
  | "fireblocks";

/**
 * Configuration for a circuit breaker instance
 */
export interface CircuitBreakerConfig {
  /** Human-readable name for the circuit breaker (typically the service name) */
  name: string;

  /** Number of failures required to trip the circuit from CLOSED to OPEN */
  failureThreshold: number;

  /** Time window in milliseconds over which failures are counted */
  failureWindowMs: number;

  /** Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN */
  recoveryTimeoutMs: number;

  /** Number of consecutive successes required to transition from HALF_OPEN to CLOSED */
  successThreshold: number;

  /**
   * Maximum number of concurrent requests allowed through in HALF_OPEN state.
   * Prevents overwhelming a recovering service.
   */
  halfOpenMaxRequests: number;

  /**
   * Optional timeout in milliseconds for individual requests passing through the circuit.
   * If a request exceeds this timeout, it is counted as a failure.
   */
  requestTimeoutMs?: number;

  /**
   * Whether to include specific error types as failures.
   * By default, all errors trip the circuit. Provide a function to filter
   * which errors should be counted as circuit breaker failures.
   *
   * For example, 4xx client errors should generally not trip the circuit,
   * while 5xx server errors and network timeouts should.
   */
  isFailure?: (error: Error) => boolean;
}

/**
 * Event callbacks for circuit breaker state transitions
 */
export interface CircuitBreakerCallbacks {
  /** Called when the circuit transitions to OPEN (service failing) */
  onOpen?: (serviceName: string, metrics: CircuitBreakerMetrics) => void;

  /** Called when the circuit transitions to CLOSED (service recovered) */
  onClose?: (serviceName: string, metrics: CircuitBreakerMetrics) => void;

  /** Called when the circuit transitions to HALF_OPEN (testing recovery) */
  onHalfOpen?: (serviceName: string, metrics: CircuitBreakerMetrics) => void;

  /** Called on every state transition */
  onStateChange?: (
    serviceName: string,
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    metrics: CircuitBreakerMetrics,
  ) => void;

  /** Called when a request is rejected because the circuit is OPEN */
  onReject?: (serviceName: string) => void;

  /** Called on each successful request */
  onSuccess?: (serviceName: string, durationMs: number) => void;

  /** Called on each failed request */
  onFailure?: (serviceName: string, error: Error) => void;
}

/**
 * Snapshot of circuit breaker metrics at a point in time
 */
export interface CircuitBreakerMetrics {
  /** Current state of the circuit */
  state: CircuitBreakerState;

  /** Total number of failures within the current failure window */
  failureCount: number;

  /** Total number of successes since last state transition */
  successCount: number;

  /** Consecutive successes in HALF_OPEN state */
  consecutiveSuccesses: number;

  /** Total number of requests since the circuit breaker was created */
  totalRequests: number;

  /** Total number of successful requests since creation */
  totalSuccesses: number;

  /** Total number of failed requests since creation */
  totalFailures: number;

  /** Total number of requests rejected (circuit OPEN) since creation */
  totalRejections: number;

  /** Timestamp of the last failure (epoch ms), or null if no failure recorded */
  lastFailureTime: number | null;

  /** Timestamp of the last success (epoch ms), or null if no success recorded */
  lastSuccessTime: number | null;

  /** Timestamp when the circuit was last opened (epoch ms), or null */
  lastOpenedTime: number | null;

  /** Timestamp when the circuit was last closed (epoch ms), or null */
  lastClosedTime: number | null;

  /** Average response time in milliseconds over recent requests */
  averageResponseTimeMs: number;

  /** Number of requests currently in-flight in HALF_OPEN state */
  halfOpenRequests: number;

  /** Success rate as a decimal (0.0 - 1.0) over total lifetime */
  successRate: number;
}

/**
 * Options for executing a request through the circuit breaker
 */
export interface CircuitBreakerExecuteOptions<T> {
  /**
   * Fallback function to invoke when the circuit is OPEN.
   * Use this to return cached data, default values, or graceful degradations.
   */
  fallback?: () => T | Promise<T>;

  /**
   * Override the default request timeout for this specific call.
   */
  timeoutMs?: number;

  /**
   * Additional context for logging and debugging.
   */
  context?: Record<string, unknown>;
}

/**
 * Health status of a single circuit breaker
 */
export interface CircuitBreakerHealth {
  /** Service name */
  service: string;

  /** Current state */
  state: CircuitBreakerState;

  /** Whether the service is considered healthy (CLOSED) */
  healthy: boolean;

  /** Current failure count within the window */
  failureCount: number;

  /** Success rate (0.0 - 1.0) */
  successRate: number;

  /** Time since last failure in milliseconds, or null if no failures */
  timeSinceLastFailureMs: number | null;

  /** Time since the circuit was opened in milliseconds, or null if not open */
  timeSinceOpenedMs: number | null;

  /** Full metrics snapshot */
  metrics: CircuitBreakerMetrics;
}

/**
 * Aggregate health status across all circuit breakers
 */
export interface CircuitBreakerRegistryHealth {
  /** Overall health - true only if all circuits are CLOSED */
  healthy: boolean;

  /** Number of services in each state */
  summary: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
  };

  /** Individual service health statuses */
  services: Record<string, CircuitBreakerHealth>;

  /** Timestamp of this health check */
  timestamp: number;
}

/**
 * Pre-configured defaults for each external service
 */
export interface ServiceCircuitBreakerDefaults {
  /** Service identifier */
  service: ExternalService;

  /** Configuration to use */
  config: Omit<CircuitBreakerConfig, "name">;

  /** Optional description of why these defaults were chosen */
  description?: string;
}

/**
 * Error thrown when a circuit breaker rejects a request
 */
export class CircuitBreakerOpenError extends Error {
  public readonly service: string;
  public readonly state: CircuitBreakerState;
  public readonly metrics: CircuitBreakerMetrics;

  constructor(service: string, state: CircuitBreakerState, metrics: CircuitBreakerMetrics) {
    super(
      `Circuit breaker for "${service}" is ${state}. ` +
      `Failures: ${metrics.failureCount}, ` +
      `Last failure: ${metrics.lastFailureTime ? new Date(metrics.lastFailureTime).toISOString() : "never"}.`,
    );
    this.name = "CircuitBreakerOpenError";
    this.service = service;
    this.state = state;
    this.metrics = metrics;
  }
}

/**
 * Error thrown when a request exceeds the circuit breaker timeout
 */
export class CircuitBreakerTimeoutError extends Error {
  public readonly service: string;
  public readonly timeoutMs: number;

  constructor(service: string, timeoutMs: number) {
    super(
      `Circuit breaker request for "${service}" timed out after ${timeoutMs}ms.`,
    );
    this.name = "CircuitBreakerTimeoutError";
    this.service = service;
    this.timeoutMs = timeoutMs;
  }
}
