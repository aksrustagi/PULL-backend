/**
 * Circuit Breaker Service
 *
 * Protects the PULL trading platform from cascading failures when external
 * services become unavailable. Implements the standard circuit breaker pattern
 * with configurable thresholds, recovery timeouts, and fallback support.
 *
 * Protected services:
 * - Kalshi (prediction market trading)
 * - Massive (crypto/RWA order execution)
 * - Stripe (payments)
 * - Persona (KYC/identity verification)
 * - Plaid (banking/ACH)
 * - Matrix (messaging/chat)
 * - Nylas (email)
 * - Fireblocks (digital asset custody)
 *
 * @example Basic usage
 * ```typescript
 * import { getCircuitBreaker } from '@pull/core/services/circuit-breaker';
 *
 * const breaker = getCircuitBreaker('kalshi');
 * const markets = await breaker.execute(
 *   () => kalshiClient.getMarkets(),
 *   { fallback: () => cachedMarkets },
 * );
 * ```
 *
 * @example Health monitoring
 * ```typescript
 * import { getHealthStatus } from '@pull/core/services/circuit-breaker';
 *
 * const health = getHealthStatus();
 * if (!health.healthy) {
 *   console.warn('Degraded services:', Object.entries(health.services)
 *     .filter(([, s]) => !s.healthy)
 *     .map(([name]) => name));
 * }
 * ```
 *
 * @example Global event handling
 * ```typescript
 * import { setGlobalCallbacks } from '@pull/core/services/circuit-breaker';
 *
 * setGlobalCallbacks({
 *   onOpen: (service, metrics) => {
 *     alertOps(`Circuit OPEN for ${service}`, metrics);
 *   },
 *   onClose: (service) => {
 *     alertOps(`Circuit recovered for ${service}`);
 *   },
 * });
 * ```
 */

// Core implementation
export { CircuitBreaker } from "./circuit-breaker";

// Registry
export {
  getCircuitBreaker,
  createCircuitBreaker,
  getHealthStatus,
  resetAll,
  resetService,
  removeCircuitBreaker,
  getRegisteredServices,
  getServiceDefaults,
  getAllServiceDefaults,
  initializeAll,
  destroyAll,
  checkAllHealth,
  setGlobalCallbacks,
} from "./registry";

// Types
export { CircuitBreakerState, CircuitBreakerOpenError, CircuitBreakerTimeoutError } from "./types";

export type {
  ExternalService,
  CircuitBreakerConfig,
  CircuitBreakerCallbacks,
  CircuitBreakerMetrics,
  CircuitBreakerExecuteOptions,
  CircuitBreakerHealth,
  CircuitBreakerRegistryHealth,
  ServiceCircuitBreakerDefaults,
} from "./types";
