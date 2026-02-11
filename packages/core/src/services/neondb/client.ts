/**
 * NeonDB Client - Serverless PostgreSQL for PULL Financial System of Record
 *
 * Neon provides serverless Postgres with:
 * - Autoscaling compute
 * - Branching for dev/staging
 * - Connection pooling via @neondatabase/serverless
 * - Sub-10ms cold starts
 *
 * This is the SOURCE OF TRUTH for all financial data.
 * Convex is the real-time projection layer.
 *
 * Two client modes:
 * 1. HTTP client (`db`) - For serverless/edge environments (one-shot queries, no persistent connection)
 * 2. Pooled client (`poolDb`) - For long-running services (API server, workers, background jobs)
 *
 * Use `db` in:
 *   - Edge functions (Vercel, Cloudflare Workers)
 *   - Serverless API routes
 *   - Any short-lived execution context
 *
 * Use `poolDb` in:
 *   - Express/Fastify API servers
 *   - Background workers (Inngest, Bull)
 *   - Migration scripts
 *   - Anything with a persistent process
 */

import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// ============================================================================
// Configuration
// ============================================================================

// Enable connection caching for edge/serverless environments.
// This reuses the underlying WebSocket connection across invocations
// when the execution context persists (e.g., warm Lambda).
neonConfig.fetchConnectionCache = true;

// Default local development connection string
const DEV_DATABASE_URL = "postgresql://localhost:5432/pull_dev";

// Environment validation - fail hard in production if no connection string
const DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "FATAL: NEON_DATABASE_URL is required in production. " +
    "Set it to your Neon connection string: postgresql://user:pass@host/db?sslmode=require"
  );
}

const connectionString = DATABASE_URL || DEV_DATABASE_URL;

// ============================================================================
// HTTP Client (Serverless/Edge)
// ============================================================================

/**
 * Raw Neon SQL tagged-template client for one-shot queries.
 * Use this for raw SQL when Drizzle ORM is overkill.
 *
 * @example
 * ```ts
 * const result = await sql`SELECT balance FROM accounts WHERE id = ${accountId}`;
 * ```
 */
export const sql = neon(connectionString);

/**
 * Drizzle ORM client over Neon HTTP.
 * Best for serverless/edge - no persistent connection required.
 *
 * @example
 * ```ts
 * const accounts = await db.query.financialAccounts.findMany({
 *   where: eq(financialAccounts.userId, userId),
 * });
 * ```
 */
export const db = drizzle(sql, { schema });

// ============================================================================
// Pooled Client (Long-Running Services)
// ============================================================================

/** Singleton pool instance - lazily initialized */
let poolInstance: Pool | null = null;

/**
 * Get the connection pool singleton.
 * Creates the pool on first call with production-tuned settings.
 *
 * Pool configuration rationale:
 * - max: 20 - Neon's default compute allows ~100 connections;
 *   we leave headroom for other services and branches
 * - idleTimeoutMillis: 30s - Release idle connections quickly
 *   (Neon charges for active compute time)
 * - connectionTimeoutMillis: 10s - Fail fast if pool is exhausted
 */
export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString,
      max: parseInt(process.env.NEON_POOL_MAX || "20", 10),
      idleTimeoutMillis: parseInt(process.env.NEON_POOL_IDLE_TIMEOUT || "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.NEON_POOL_CONNECT_TIMEOUT || "10000", 10),
    });

    // Log pool errors but don't crash - let callers handle failures
    poolInstance.on("error", (err: Error) => {
      console.error("[NeonDB Pool] Unexpected error on idle client:", err.message);
    });
  }
  return poolInstance;
}

/**
 * Drizzle ORM client over Neon connection pool.
 * Best for long-running services with many queries.
 *
 * @example
 * ```ts
 * const result = await poolDb
 *   .select()
 *   .from(schema.ledgerEntries)
 *   .where(eq(schema.ledgerEntries.accountId, accountId))
 *   .orderBy(desc(schema.ledgerEntries.sequenceNumber))
 *   .limit(100);
 * ```
 */
export const poolDb = drizzlePool(getPool(), { schema });

// ============================================================================
// Transaction Helper
// ============================================================================

/**
 * Execute a function within a serializable database transaction.
 * This is CRITICAL for financial operations to ensure consistency.
 *
 * Uses SERIALIZABLE isolation level to prevent:
 * - Dirty reads
 * - Non-repeatable reads
 * - Phantom reads
 * - Write skew
 *
 * Callers must handle serialization failures (error code 40001)
 * by retrying the entire transaction.
 *
 * @example
 * ```ts
 * const result = await withSerializableTransaction(async (tx) => {
 *   const [account] = await tx
 *     .select()
 *     .from(financialAccounts)
 *     .where(eq(financialAccounts.id, accountId))
 *     .for("update");
 *
 *   // ... do financial operations ...
 *
 *   return { success: true };
 * });
 * ```
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Parameters<Parameters<typeof poolDb.transaction>[0]>[0]) => Promise<T>,
  options?: {
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.retryDelayMs ?? 50;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await poolDb.transaction(fn, {
        isolationLevel: "serializable",
      });
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for serialization failure (PostgreSQL error code 40001)
      const pgError = error as { code?: string };
      if (pgError.code === "40001" && attempt < maxRetries) {
        // Exponential backoff with jitter for serialization retries
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * baseDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Non-serialization errors or exhausted retries: throw immediately
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error("Transaction failed after all retries");
}

// ============================================================================
// Health Check
// ============================================================================

export interface NeonHealthStatus {
  healthy: boolean;
  latencyMs: number;
  poolSize?: number;
  poolIdle?: number;
  poolWaiting?: number;
  error?: string;
}

/**
 * Check NeonDB health and connection latency.
 * Useful for /health endpoints and monitoring.
 *
 * @example
 * ```ts
 * const health = await checkNeonHealth();
 * if (!health.healthy) {
 *   alertOps("NeonDB is down!", health);
 * }
 * ```
 */
export async function checkNeonHealth(): Promise<NeonHealthStatus> {
  const start = Date.now();
  try {
    // Execute a simple query to verify connectivity
    await sql`SELECT 1 AS health_check`;

    const latencyMs = Date.now() - start;

    // Include pool stats if pool is initialized
    const poolStats = poolInstance
      ? {
          poolSize: poolInstance.totalCount,
          poolIdle: poolInstance.idleCount,
          poolWaiting: poolInstance.waitingCount,
        }
      : {};

    return {
      healthy: true,
      latencyMs,
      ...poolStats,
    };
  } catch (error: unknown) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Gracefully close the connection pool.
 * Call this during application shutdown to drain connections cleanly.
 *
 * @example
 * ```ts
 * process.on("SIGTERM", async () => {
 *   await closeNeonPool();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeNeonPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { schema };
