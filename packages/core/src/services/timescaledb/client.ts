/**
 * TimescaleDB Client - Time-Series Database for PULL Analytics & Market Data
 *
 * TimescaleDB is a PostgreSQL extension for time-series data, providing:
 * - Hypertables: Automatic time-based partitioning
 * - Continuous aggregates: Materialized views that auto-refresh (OHLCV candles, etc.)
 * - Compression: 90%+ storage savings on historical data
 * - Retention policies: Auto-drop old raw data while keeping aggregates
 * - Full SQL: Unlike InfluxDB/QuestDB, it's just PostgreSQL
 *
 * Use cases in PULL:
 * - Price ticks (crypto, prediction markets, RWA)
 * - OHLCV candlestick data (1m, 5m, 15m, 1h, 1d)
 * - Portfolio value snapshots
 * - Trading volume / VWAP analytics
 * - Order book depth snapshots
 * - User engagement metrics over time
 * - System performance metrics
 *
 * Two client modes (same pattern as NeonDB):
 * 1. Raw SQL client (`sql`) - For bulk inserts and time-series queries
 * 2. Pooled Drizzle client (`poolDb`) - For ORM-based queries
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// ============================================================================
// Configuration
// ============================================================================

const DEV_DATABASE_URL = "postgresql://localhost:5433/pull_timeseries";

const DATABASE_URL = process.env.TIMESCALEDB_URL;

if (!DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "FATAL: TIMESCALEDB_URL is required in production. " +
      "Set it to your TimescaleDB connection string: postgresql://user:pass@host:5433/pull_timeseries?sslmode=require"
  );
}

const connectionString = DATABASE_URL || DEV_DATABASE_URL;

// ============================================================================
// Connection Pool
// ============================================================================

let poolInstance: Pool | null = null;

/**
 * Get the TimescaleDB connection pool singleton.
 *
 * Pool configuration rationale:
 * - max: 30 - Time-series writes are high-throughput; need more connections
 * - idleTimeoutMillis: 20s - Release idle connections faster (batch writes are bursty)
 * - connectionTimeoutMillis: 10s - Fail fast if pool is exhausted
 * - statement_timeout: 30s - Time-series queries can scan large ranges
 */
export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString,
      max: parseInt(process.env.TIMESCALEDB_POOL_MAX || "30", 10),
      idleTimeoutMillis: parseInt(
        process.env.TIMESCALEDB_POOL_IDLE_TIMEOUT || "20000",
        10
      ),
      connectionTimeoutMillis: parseInt(
        process.env.TIMESCALEDB_POOL_CONNECT_TIMEOUT || "10000",
        10
      ),
    });

    poolInstance.on("error", (err: Error) => {
      console.error(
        "[TimescaleDB Pool] Unexpected error on idle client:",
        err.message
      );
    });
  }
  return poolInstance;
}

/**
 * Drizzle ORM client over TimescaleDB connection pool.
 */
export const poolDb = drizzle(getPool(), { schema });

// ============================================================================
// Raw SQL Helpers for Time-Series Operations
// ============================================================================

/**
 * Execute a raw SQL query against TimescaleDB.
 * Use for bulk inserts, time_bucket queries, and continuous aggregate refreshes.
 *
 * @example
 * ```ts
 * const candles = await query(
 *   `SELECT time_bucket('1 hour', time) AS bucket,
 *          symbol,
 *          first(price, time) AS open,
 *          max(price) AS high,
 *          min(price) AS low,
 *          last(price, time) AS close,
 *          sum(volume) AS volume
 *   FROM price_ticks
 *   WHERE symbol = $1 AND time > NOW() - INTERVAL '24 hours'
 *   GROUP BY bucket, symbol
 *   ORDER BY bucket DESC`,
 *   ['BTC-USD']
 * );
 * ```
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/**
 * Bulk insert price ticks using PostgreSQL COPY-like performance.
 * Uses multi-row INSERT with unnest for ~10x faster batch inserts.
 *
 * @example
 * ```ts
 * await bulkInsertTicks([
 *   { time: new Date(), symbol: 'BTC-USD', price: '67543.21', volume: '1.5', source: 'massive' },
 *   { time: new Date(), symbol: 'ETH-USD', price: '3421.50', volume: '10.0', source: 'massive' },
 * ]);
 * ```
 */
export async function bulkInsertTicks(
  ticks: Array<{
    time: Date;
    symbol: string;
    price: string;
    volume: string;
    source: string;
    bidPrice?: string;
    askPrice?: string;
    bidSize?: string;
    askSize?: string;
    tradeId?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<number> {
  if (ticks.length === 0) return 0;

  const pool = getPool();

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const tick of ticks) {
    placeholders.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
    );
    values.push(
      tick.time,
      tick.symbol,
      tick.price,
      tick.volume,
      tick.source,
      tick.bidPrice ?? null,
      tick.askPrice ?? null,
      tick.bidSize ?? null,
      tick.askSize ?? null,
      tick.tradeId ?? null,
      tick.metadata ? JSON.stringify(tick.metadata) : null
    );
  }

  const sql = `
    INSERT INTO price_ticks (time, symbol, price, volume, source, bid_price, ask_price, bid_size, ask_size, trade_id, metadata)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT DO NOTHING
  `;

  const result = await pool.query(sql, values);
  return result.rowCount ?? 0;
}

/**
 * Insert a portfolio snapshot for a user.
 */
export async function insertPortfolioSnapshot(snapshot: {
  time: Date;
  userId: string;
  totalValueUsd: string;
  cashBalanceUsd: string;
  investedValueUsd: string;
  unrealizedPnlUsd: string;
  realizedPnlUsd: string;
  dayChangeUsd: string;
  dayChangePct: string;
  positionCount: number;
  positions?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO portfolio_snapshots
      (time, user_id, total_value_usd, cash_balance_usd, invested_value_usd,
       unrealized_pnl_usd, realized_pnl_usd, day_change_usd, day_change_pct,
       position_count, positions)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      snapshot.time,
      snapshot.userId,
      snapshot.totalValueUsd,
      snapshot.cashBalanceUsd,
      snapshot.investedValueUsd,
      snapshot.unrealizedPnlUsd,
      snapshot.realizedPnlUsd,
      snapshot.dayChangeUsd,
      snapshot.dayChangePct,
      snapshot.positionCount,
      snapshot.positions ? JSON.stringify(snapshot.positions) : null,
    ]
  );
}

/**
 * Insert a market event (prediction market resolution, odds change, etc.)
 */
export async function insertMarketEvent(event: {
  time: Date;
  marketId: string;
  eventType: string;
  symbol: string;
  price?: string;
  previousPrice?: string;
  volume?: string;
  openInterest?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO market_events
      (time, market_id, event_type, symbol, price, previous_price, volume, open_interest, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.time,
      event.marketId,
      event.eventType,
      event.symbol,
      event.price ?? null,
      event.previousPrice ?? null,
      event.volume ?? null,
      event.openInterest ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ]
  );
}

/**
 * Insert a system metric (API latency, queue depth, error rate, etc.)
 */
export async function insertSystemMetric(metric: {
  time: Date;
  metricName: string;
  value: number;
  tags?: Record<string, string>;
  unit?: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO system_metrics (time, metric_name, value, tags, unit)
    VALUES ($1, $2, $3, $4, $5)`,
    [
      metric.time,
      metric.metricName,
      metric.value,
      metric.tags ? JSON.stringify(metric.tags) : null,
      metric.unit ?? null,
    ]
  );
}

/**
 * Query OHLCV candles from the continuous aggregate.
 *
 * @param symbol - Trading pair (e.g., 'BTC-USD')
 * @param interval - Time bucket ('1 minute', '5 minutes', '1 hour', '1 day')
 * @param from - Start time
 * @param to - End time (defaults to now)
 * @param limit - Max candles to return (default 500)
 */
export async function getCandles(
  symbol: string,
  interval: "1 minute" | "5 minutes" | "15 minutes" | "1 hour" | "1 day",
  from: Date,
  to?: Date,
  limit = 500
): Promise<
  Array<{
    bucket: Date;
    symbol: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    tradeCount: number;
    vwap: string;
  }>
> {
  // Map interval names to continuous aggregate table names
  const tableMap: Record<string, string> = {
    "1 minute": "ohlcv_1m",
    "5 minutes": "ohlcv_5m",
    "15 minutes": "ohlcv_15m",
    "1 hour": "ohlcv_1h",
    "1 day": "ohlcv_1d",
  };

  const table = tableMap[interval];
  if (!table) {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  return query(
    `SELECT bucket, symbol, open, high, low, close, volume, trade_count AS "tradeCount", vwap
     FROM ${table}
     WHERE symbol = $1 AND bucket >= $2 AND bucket <= $3
     ORDER BY bucket DESC
     LIMIT $4`,
    [symbol, from, to ?? new Date(), limit]
  );
}

/**
 * Get trading volume summary for a time range.
 */
export async function getVolumeSummary(
  symbol: string,
  from: Date,
  to?: Date
): Promise<{
  totalVolume: string;
  tradeCount: number;
  vwap: string;
  high: string;
  low: string;
} | null> {
  const rows = await query<{
    totalVolume: string;
    tradeCount: string;
    vwap: string;
    high: string;
    low: string;
  }>(
    `SELECT
       SUM(volume) AS "totalVolume",
       COUNT(*) AS "tradeCount",
       CASE WHEN SUM(volume) > 0
         THEN (SUM(price::numeric * volume::numeric) / SUM(volume::numeric))::text
         ELSE '0'
       END AS vwap,
       MAX(price) AS high,
       MIN(price) AS low
     FROM price_ticks
     WHERE symbol = $1 AND time >= $2 AND time <= $3`,
    [symbol, from, to ?? new Date()]
  );

  if (!rows[0] || rows[0].tradeCount === "0") return null;

  return {
    totalVolume: rows[0].totalVolume,
    tradeCount: parseInt(rows[0].tradeCount, 10),
    vwap: rows[0].vwap,
    high: rows[0].high,
    low: rows[0].low,
  };
}

/**
 * Get portfolio value history for charting.
 */
export async function getPortfolioHistory(
  userId: string,
  interval: "1 hour" | "1 day" | "1 week",
  from: Date,
  to?: Date,
  limit = 500
): Promise<
  Array<{
    bucket: Date;
    avgTotalValue: string;
    avgCashBalance: string;
    avgInvestedValue: string;
    avgUnrealizedPnl: string;
  }>
> {
  return query(
    `SELECT
       time_bucket($1::interval, time) AS bucket,
       AVG(total_value_usd::numeric)::text AS "avgTotalValue",
       AVG(cash_balance_usd::numeric)::text AS "avgCashBalance",
       AVG(invested_value_usd::numeric)::text AS "avgInvestedValue",
       AVG(unrealized_pnl_usd::numeric)::text AS "avgUnrealizedPnl"
     FROM portfolio_snapshots
     WHERE user_id = $2 AND time >= $3 AND time <= $4
     GROUP BY bucket
     ORDER BY bucket DESC
     LIMIT $5`,
    [interval, userId, from, to ?? new Date(), limit]
  );
}

// ============================================================================
// Health Check
// ============================================================================

export interface TimescaleHealthStatus {
  healthy: boolean;
  latencyMs: number;
  poolSize?: number;
  poolIdle?: number;
  poolWaiting?: number;
  timescaleVersion?: string;
  error?: string;
}

/**
 * Check TimescaleDB health, connectivity, and extension status.
 */
export async function checkTimescaleHealth(): Promise<TimescaleHealthStatus> {
  const start = Date.now();
  try {
    const rows = await query<{ version: string }>(
      "SELECT extversion AS version FROM pg_extension WHERE extname = 'timescaledb'"
    );

    const latencyMs = Date.now() - start;
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
      timescaleVersion: rows[0]?.version ?? "unknown",
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
 * Gracefully close the TimescaleDB connection pool.
 */
export async function closeTimescalePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { schema };
