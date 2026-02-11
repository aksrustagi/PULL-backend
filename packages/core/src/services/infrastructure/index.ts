/**
 * PULL Infrastructure Layer
 *
 * Central initialization and health checking for all infrastructure services.
 * This module provides a unified interface for starting, stopping, and
 * monitoring all backend infrastructure.
 *
 * Architecture (post-audit):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │                   API / Workers                      │
 *   ├─────────────────────────────────────────────────────┤
 *   │  Circuit Breakers → External APIs (Kalshi, Stripe)  │
 *   │  State Machines  → Order/KYC/Payment lifecycle      │
 *   │  Error Catalog   → Consistent error responses       │
 *   ├─────────────────────────────────────────────────────┤
 *   │               Infrastructure Layer                   │
 *   ├───────┬──────┬───────────┬────────┬────────────────┤
 *   │NeonDB │Tiger-│TimescaleDB│ Kafka  │  Observability  │
 *   │(Fin.  │Beetle│(Time-     │ (Event │ Sentry/Grafana  │
 *   │Ledger)│(Acct)│ Series)   │  Bus)  │ PostHog/OTel    │
 *   ├───────┼──────┼───────────┼────────┼────────────────┤
 *   │  BullMQ (Jobs) │ Convex (Real-time) │ Redis (Cache) │
 *   └────────────────┴────────────────────┴───────────────┘
 *
 * Data flow for financial operations:
 *   1. API receives order → validates via State Machine
 *   2. TigerBeetle: Hold funds (debit pending)
 *   3. External API: Execute trade (via Circuit Breaker)
 *   4. TigerBeetle: Settle funds (credit/debit posted)
 *   5. NeonDB: Record trade details (system of record)
 *   6. Convex: Update real-time portfolio view
 *   7. Kafka: Publish trade event
 *   8. BullMQ: Queue settlement confirmation email
 *   9. PostHog: Track trade analytics
 *  10. Sentry: Monitor for errors
 */

export interface InfraHealthStatus {
  service: string;
  healthy: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
}

export interface InfraStatus {
  overall: "healthy" | "degraded" | "unhealthy";
  services: InfraHealthStatus[];
  timestamp: string;
}

/**
 * Check health of all infrastructure services
 */
export async function checkInfraHealth(): Promise<InfraStatus> {
  const checks: Promise<InfraHealthStatus>[] = [];

  // NeonDB health check
  checks.push(
    safeHealthCheck("neondb", async () => {
      const { checkNeonHealth } = await import("../neondb/client");
      return checkNeonHealth();
    })
  );

  // TigerBeetle health check
  checks.push(
    safeHealthCheck("tigerbeetle", async () => {
      const { healthCheck } = await import("../tigerbeetle/client");
      return healthCheck();
    })
  );

  // TimescaleDB health check
  checks.push(
    safeHealthCheck("timescaledb", async () => {
      const { checkTimescaleHealth } = await import("../timescaledb/client");
      return checkTimescaleHealth();
    })
  );

  // Circuit Breaker status
  checks.push(
    safeHealthCheck("circuit-breakers", async () => {
      const { getHealthStatus } = await import("../circuit-breaker/registry");
      const status = getHealthStatus();
      const allClosed = Object.values(status).every(
        (s: any) => s.state === "CLOSED"
      );
      return { healthy: allClosed, latencyMs: 0, details: status };
    })
  );

  const results = await Promise.all(checks);

  const unhealthyCount = results.filter((r) => !r.healthy).length;
  const overall: InfraStatus["overall"] =
    unhealthyCount === 0
      ? "healthy"
      : unhealthyCount <= 2
        ? "degraded"
        : "unhealthy";

  return {
    overall,
    services: results,
    timestamp: new Date().toISOString(),
  };
}

async function safeHealthCheck(
  service: string,
  check: () => Promise<{ healthy: boolean; latencyMs: number; details?: Record<string, unknown> }>
): Promise<InfraHealthStatus> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      check(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), 5000)
      ),
    ]);
    return { service, ...result };
  } catch {
    return { service, healthy: false, latencyMs: Date.now() - start };
  }
}

/**
 * Initialize all infrastructure services
 * Called once at API server startup
 */
export async function initializeInfrastructure(): Promise<void> {
  // Services initialize lazily on first use.
  // This function validates that required env vars are present.
  const requiredInProd = [
    "NEON_DATABASE_URL",
    "TIMESCALEDB_URL",
    "TIGERBEETLE_ADDRESSES",
    "POSTHOG_API_KEY",
    "UPSTASH_KAFKA_URL",
  ];

  if (process.env.NODE_ENV === "production") {
    const missing = requiredInProd.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      console.warn(
        `[infra] WARNING: Missing production infrastructure vars: ${missing.join(", ")}. ` +
        "Some features will be degraded."
      );
    }
  }
}

/**
 * Graceful shutdown of all infrastructure services
 */
export async function shutdownInfrastructure(): Promise<void> {
  const shutdowns: Promise<void>[] = [];

  shutdowns.push(
    (async () => {
      try {
        const { closeNeonPool } = await import("../neondb/client");
        await closeNeonPool();
      } catch { /* service may not be initialized */ }
    })()
  );

  shutdowns.push(
    (async () => {
      try {
        const { closeTimescalePool } = await import("../timescaledb/client");
        await closeTimescalePool();
      } catch { /* service may not be initialized */ }
    })()
  );

  shutdowns.push(
    (async () => {
      try {
        const { shutdown } = await import("../posthog/client");
        await shutdown();
      } catch { /* service may not be initialized */ }
    })()
  );

  await Promise.allSettled(shutdowns);
}
