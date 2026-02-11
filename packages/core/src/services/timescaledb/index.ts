/**
 * TimescaleDB - PULL Time-Series Analytics & Market Data
 *
 * PostgreSQL + TimescaleDB extension for all time-series workloads:
 * - Price ticks and OHLCV candles (crypto, prediction markets, RWA)
 * - Portfolio value history (P&L charting)
 * - Trading volume analytics
 * - Order book depth snapshots
 * - User engagement time-series
 * - System performance metrics
 *
 * @example
 * ```ts
 * import {
 *   bulkInsertTicks,
 *   getCandles,
 *   getPortfolioHistory,
 *   insertPortfolioSnapshot,
 *   checkTimescaleHealth,
 * } from "@pull/core/services/timescaledb";
 *
 * // Insert price ticks (batch)
 * await bulkInsertTicks([
 *   { time: new Date(), symbol: 'BTC-USD', price: '67543.21', volume: '1.5', source: 'massive' },
 * ]);
 *
 * // Get 1-hour candles for the last 24h
 * const candles = await getCandles('BTC-USD', '1 hour', dayAgo, now);
 *
 * // Portfolio history for charting
 * const history = await getPortfolioHistory('user_123', '1 day', monthAgo);
 * ```
 */

// ============================================================================
// Client exports
// ============================================================================

export {
  // Connection pool
  getPool,
  closeTimescalePool,
  poolDb,

  // Raw SQL
  query,

  // Write operations
  bulkInsertTicks,
  insertPortfolioSnapshot,
  insertMarketEvent,
  insertSystemMetric,

  // Read operations
  getCandles,
  getVolumeSummary,
  getPortfolioHistory,

  // Health
  checkTimescaleHealth,

  // Schema
  schema,
} from "./client";

export type { TimescaleHealthStatus } from "./client";

// ============================================================================
// Schema exports
// ============================================================================

export {
  priceTicks,
  portfolioSnapshots,
  marketEvents,
  tradingVolume,
  orderBookSnapshots,
  userActivity,
  systemMetrics,
} from "./schema";

// ============================================================================
// Type exports
// ============================================================================

export type {
  PriceTick,
  InsertPriceTick,
  PortfolioSnapshot,
  InsertPortfolioSnapshot,
  MarketEvent,
  InsertMarketEvent,
  TradingVolume,
  InsertTradingVolume,
  OrderBookSnapshot,
  InsertOrderBookSnapshot,
  UserActivity,
  InsertUserActivity,
  SystemMetric,
  InsertSystemMetric,
  OHLCVCandle,
  CandleInterval,
  TimeRangeQuery,
  SymbolTimeRangeQuery,
  CandleQuery,
  PortfolioHistoryQuery,
  VolumeSummary,
  PortfolioHistoryPoint,
  MarketSummary,
  UserActivitySummary,
  TimescaleHealthCheckResult,
} from "./types";

export {
  MARKET_EVENT_TYPES,
  USER_ACTIVITY_TYPES,
  USER_ACTIVITY_CATEGORIES,
  PRICE_SOURCES,
  SYSTEM_METRIC_NAMES,
} from "./types";
