/**
 * Circuit Breaker Registry
 *
 * Global registry managing circuit breakers for all external services
 * used by the PULL trading platform. Provides pre-configured defaults
 * tuned to each service's criticality and expected failure characteristics.
 *
 * Service tiers:
 * - Trading critical (Kalshi, Massive, Fireblocks): Tight thresholds, fast recovery
 * - Payment critical (Stripe): Tight thresholds, moderate recovery
 * - Infrastructure (Matrix): Moderate thresholds, moderate recovery
 * - Non-critical (Persona, Plaid, Nylas): Relaxed thresholds, slow recovery
 *
 * @example
 * ```typescript
 * import { getCircuitBreaker, getHealthStatus, resetAll } from '@pull/core/services/circuit-breaker';
 *
 * // Get a circuit breaker for Kalshi
 * const breaker = getCircuitBreaker('kalshi');
 * const markets = await breaker.execute(() => kalshiClient.getMarkets());
 *
 * // Check all circuit breaker health
 * const health = getHealthStatus();
 * console.log(health.healthy); // false if any circuit is open
 *
 * // Reset all circuit breakers (operational override)
 * resetAll();
 * ```
 */

import { CircuitBreaker } from "./circuit-breaker";
import { CircuitBreakerState } from "./types";
import type {
  ExternalService,
  CircuitBreakerConfig,
  CircuitBreakerCallbacks,
  CircuitBreakerRegistryHealth,
  CircuitBreakerHealth,
  ServiceCircuitBreakerDefaults,
} from "./types";

// ---------------------------------------------------------------------------
// Service defaults
// ---------------------------------------------------------------------------

/**
 * Pre-configured defaults for each external service.
 *
 * These values are tuned based on:
 * - Service criticality (trading > payments > compliance > messaging)
 * - Expected failure patterns (transient vs sustained outages)
 * - Recovery characteristics (fast failover vs manual intervention)
 * - User impact (blocking trades vs delayed KYC)
 */
const SERVICE_DEFAULTS: Record<ExternalService, ServiceCircuitBreakerDefaults> = {
  kalshi: {
    service: "kalshi",
    config: {
      failureThreshold: 5,
      failureWindowMs: 60_000,
      recoveryTimeoutMs: 30_000,
      successThreshold: 3,
      halfOpenMaxRequests: 1,
      requestTimeoutMs: 10_000,
    },
    description:
      "Trading critical - prediction market order execution. " +
      "Tight thresholds to protect users from stale quotes and failed trades.",
  },

  massive: {
    service: "massive",
    config: {
      failureThreshold: 5,
      failureWindowMs: 60_000,
      recoveryTimeoutMs: 30_000,
      successThreshold: 3,
      halfOpenMaxRequests: 1,
      requestTimeoutMs: 10_000,
    },
    description:
      "Trading critical - crypto/RWA order execution. " +
      "Matches Kalshi thresholds for consistent trading behavior.",
  },

  stripe: {
    service: "stripe",
    config: {
      failureThreshold: 3,
      failureWindowMs: 120_000,
      recoveryTimeoutMs: 60_000,
      successThreshold: 2,
      halfOpenMaxRequests: 1,
      requestTimeoutMs: 15_000,
    },
    description:
      "Payment critical - deposits, withdrawals, and payouts. " +
      "Lower threshold because payment failures erode user trust rapidly.",
  },

  persona: {
    service: "persona",
    config: {
      failureThreshold: 10,
      failureWindowMs: 300_000,
      recoveryTimeoutMs: 120_000,
      successThreshold: 2,
      halfOpenMaxRequests: 2,
      requestTimeoutMs: 30_000,
    },
    description:
      "KYC/identity verification - less urgent than trading. " +
      "Higher tolerance because KYC can be retried and queued.",
  },

  plaid: {
    service: "plaid",
    config: {
      failureThreshold: 10,
      failureWindowMs: 300_000,
      recoveryTimeoutMs: 120_000,
      successThreshold: 2,
      halfOpenMaxRequests: 2,
      requestTimeoutMs: 20_000,
    },
    description:
      "Banking/ACH integration - bank linking and balance checks. " +
      "Higher tolerance as bank operations are inherently slower.",
  },

  matrix: {
    service: "matrix",
    config: {
      failureThreshold: 10,
      failureWindowMs: 120_000,
      recoveryTimeoutMs: 60_000,
      successThreshold: 3,
      halfOpenMaxRequests: 3,
      requestTimeoutMs: 10_000,
    },
    description:
      "Messaging/chat infrastructure. " +
      "Moderate thresholds - messaging degradation is noticeable but not trade-blocking.",
  },

  nylas: {
    service: "nylas",
    config: {
      failureThreshold: 10,
      failureWindowMs: 300_000,
      recoveryTimeoutMs: 120_000,
      successThreshold: 2,
      halfOpenMaxRequests: 2,
      requestTimeoutMs: 15_000,
    },
    description:
      "Email integration. " +
      "Relaxed thresholds - emails can be queued and retried.",
  },

  fireblocks: {
    service: "fireblocks",
    config: {
      failureThreshold: 3,
      failureWindowMs: 60_000,
      recoveryTimeoutMs: 30_000,
      successThreshold: 2,
      halfOpenMaxRequests: 1,
      requestTimeoutMs: 15_000,
    },
    description:
      "Digital asset custody - wallet operations and transfers. " +
      "Tight thresholds because custody failures can result in stuck funds.",
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Internal map of service name -> CircuitBreaker instance
 */
const registry = new Map<ExternalService, CircuitBreaker>();

/**
 * Global callbacks applied to all circuit breakers in the registry.
 * Individual breaker callbacks are merged with these.
 */
let globalCallbacks: CircuitBreakerCallbacks = {};

/**
 * Set global callbacks that apply to every circuit breaker in the registry.
 * These are merged (not replaced) with any per-breaker callbacks.
 */
export function setGlobalCallbacks(callbacks: CircuitBreakerCallbacks): void {
  globalCallbacks = { ...globalCallbacks, ...callbacks };

  // Apply to existing breakers
  for (const breaker of registry.values()) {
    breaker.setCallbacks(buildMergedCallbacks(globalCallbacks));
  }
}

/**
 * Get or create a circuit breaker for a specific external service.
 *
 * On first call for a service, creates a new CircuitBreaker with the
 * pre-configured defaults. Subsequent calls return the same instance.
 *
 * @param service - The external service identifier
 * @param overrides - Optional config overrides for this specific breaker
 * @returns The CircuitBreaker instance for the service
 */
export function getCircuitBreaker(
  service: ExternalService,
  overrides?: Partial<Omit<CircuitBreakerConfig, "name">>,
): CircuitBreaker {
  let breaker = registry.get(service);

  if (!breaker) {
    const defaults = SERVICE_DEFAULTS[service];
    if (!defaults) {
      throw new Error(
        `No circuit breaker defaults configured for service "${service}". ` +
        `Valid services: ${Object.keys(SERVICE_DEFAULTS).join(", ")}`,
      );
    }

    const config: CircuitBreakerConfig = {
      name: service,
      ...defaults.config,
      ...overrides,
    };

    breaker = new CircuitBreaker(config, buildMergedCallbacks(globalCallbacks));
    registry.set(service, breaker);
  }

  return breaker;
}

/**
 * Create a circuit breaker with fully custom configuration.
 * This is for services not in the default list or for advanced use cases.
 *
 * If a breaker already exists for the given name and it matches an ExternalService,
 * the existing one is destroyed and replaced.
 *
 * @param config - Full circuit breaker configuration
 * @param callbacks - Optional event callbacks
 * @returns The new CircuitBreaker instance
 */
export function createCircuitBreaker(
  config: CircuitBreakerConfig,
  callbacks?: CircuitBreakerCallbacks,
): CircuitBreaker {
  const serviceName = config.name as ExternalService;

  // Clean up existing breaker if present
  const existing = registry.get(serviceName);
  if (existing) {
    existing.destroy();
  }

  const mergedCallbacks = buildMergedCallbacks(globalCallbacks, callbacks);
  const breaker = new CircuitBreaker(config, mergedCallbacks);
  registry.set(serviceName, breaker);

  return breaker;
}

/**
 * Get the aggregate health status of all registered circuit breakers.
 *
 * @returns Health status including per-service details and overall summary
 */
export function getHealthStatus(): CircuitBreakerRegistryHealth {
  const services: Record<string, CircuitBreakerHealth> = {};
  let closedCount = 0;
  let openCount = 0;
  let halfOpenCount = 0;

  for (const [service, breaker] of registry.entries()) {
    const health = breaker.getHealth();
    services[service] = health;

    switch (health.state) {
      case CircuitBreakerState.CLOSED:
        closedCount++;
        break;
      case CircuitBreakerState.OPEN:
        openCount++;
        break;
      case CircuitBreakerState.HALF_OPEN:
        halfOpenCount++;
        break;
    }
  }

  const total = registry.size;

  return {
    healthy: openCount === 0 && halfOpenCount === 0,
    summary: {
      total,
      closed: closedCount,
      open: openCount,
      halfOpen: halfOpenCount,
    },
    services,
    timestamp: Date.now(),
  };
}

/**
 * Reset all registered circuit breakers to their initial CLOSED state.
 * Use for operational recovery after a widespread outage.
 */
export function resetAll(): void {
  for (const breaker of registry.values()) {
    breaker.reset();
  }
}

/**
 * Reset a specific service's circuit breaker to CLOSED state.
 *
 * @param service - The service to reset
 * @returns true if the breaker was found and reset, false if not registered
 */
export function resetService(service: ExternalService): boolean {
  const breaker = registry.get(service);
  if (breaker) {
    breaker.reset();
    return true;
  }
  return false;
}

/**
 * Remove a circuit breaker from the registry and clean up its resources.
 *
 * @param service - The service whose breaker should be removed
 * @returns true if the breaker was found and removed
 */
export function removeCircuitBreaker(service: ExternalService): boolean {
  const breaker = registry.get(service);
  if (breaker) {
    breaker.destroy();
    registry.delete(service);
    return true;
  }
  return false;
}

/**
 * Get the list of all currently registered services.
 */
export function getRegisteredServices(): ExternalService[] {
  return Array.from(registry.keys());
}

/**
 * Get the pre-configured defaults for a service.
 */
export function getServiceDefaults(
  service: ExternalService,
): ServiceCircuitBreakerDefaults | undefined {
  return SERVICE_DEFAULTS[service];
}

/**
 * Get all available service default configurations.
 */
export function getAllServiceDefaults(): Record<ExternalService, ServiceCircuitBreakerDefaults> {
  return { ...SERVICE_DEFAULTS };
}

/**
 * Initialize all circuit breakers eagerly.
 * By default, breakers are created lazily on first use. Call this at startup
 * to ensure all breakers exist before traffic arrives.
 *
 * @param services - Optional subset of services to initialize. Defaults to all.
 * @returns Map of service names to their CircuitBreaker instances
 */
export function initializeAll(
  services?: ExternalService[],
): Map<ExternalService, CircuitBreaker> {
  const targets = services ?? (Object.keys(SERVICE_DEFAULTS) as ExternalService[]);

  for (const service of targets) {
    getCircuitBreaker(service);
  }

  return new Map(registry);
}

/**
 * Destroy all circuit breakers and clear the registry.
 * Use during graceful shutdown.
 */
export function destroyAll(): void {
  for (const breaker of registry.values()) {
    breaker.destroy();
  }
  registry.clear();
  globalCallbacks = {};
}

/**
 * Run health checks on all registered circuit breakers concurrently.
 *
 * @returns Map of service names to health check results
 */
export async function checkAllHealth(): Promise<Map<ExternalService, boolean>> {
  const results = new Map<ExternalService, boolean>();

  const entries = Array.from(registry.entries());
  const checks = await Promise.allSettled(
    entries.map(async ([service, breaker]) => ({
      service,
      healthy: await breaker.checkHealth(),
    })),
  );

  for (const result of checks) {
    if (result.status === "fulfilled") {
      results.set(result.value.service, result.value.healthy);
    } else {
      // If the health check itself throws, mark as unhealthy
      // We need to find which service this was for
      const index = checks.indexOf(result);
      if (index >= 0 && index < entries.length) {
        results.set(entries[index][0], false);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build merged callbacks combining global and per-breaker callbacks.
 * Per-breaker callbacks take precedence.
 */
function buildMergedCallbacks(
  global: CircuitBreakerCallbacks,
  perBreaker?: CircuitBreakerCallbacks,
): CircuitBreakerCallbacks {
  if (!perBreaker) return { ...global };

  return {
    onOpen: chainCallbacks(global.onOpen, perBreaker.onOpen),
    onClose: chainCallbacks(global.onClose, perBreaker.onClose),
    onHalfOpen: chainCallbacks(global.onHalfOpen, perBreaker.onHalfOpen),
    onStateChange: chainStateChangeCallbacks(
      global.onStateChange,
      perBreaker.onStateChange,
    ),
    onReject: chainSimpleCallbacks(global.onReject, perBreaker.onReject),
    onSuccess: chainSuccessCallbacks(global.onSuccess, perBreaker.onSuccess),
    onFailure: chainFailureCallbacks(global.onFailure, perBreaker.onFailure),
  };
}

function chainCallbacks(
  a?: CircuitBreakerCallbacks["onOpen"],
  b?: CircuitBreakerCallbacks["onOpen"],
): CircuitBreakerCallbacks["onOpen"] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (service, metrics) => {
    a(service, metrics);
    b(service, metrics);
  };
}

function chainStateChangeCallbacks(
  a?: CircuitBreakerCallbacks["onStateChange"],
  b?: CircuitBreakerCallbacks["onStateChange"],
): CircuitBreakerCallbacks["onStateChange"] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (service, from, to, metrics) => {
    a(service, from, to, metrics);
    b(service, from, to, metrics);
  };
}

function chainSimpleCallbacks(
  a?: CircuitBreakerCallbacks["onReject"],
  b?: CircuitBreakerCallbacks["onReject"],
): CircuitBreakerCallbacks["onReject"] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (service) => {
    a(service);
    b(service);
  };
}

function chainSuccessCallbacks(
  a?: CircuitBreakerCallbacks["onSuccess"],
  b?: CircuitBreakerCallbacks["onSuccess"],
): CircuitBreakerCallbacks["onSuccess"] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (service, durationMs) => {
    a(service, durationMs);
    b(service, durationMs);
  };
}

function chainFailureCallbacks(
  a?: CircuitBreakerCallbacks["onFailure"],
  b?: CircuitBreakerCallbacks["onFailure"],
): CircuitBreakerCallbacks["onFailure"] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (service, error) => {
    a(service, error);
    b(service, error);
  };
}
