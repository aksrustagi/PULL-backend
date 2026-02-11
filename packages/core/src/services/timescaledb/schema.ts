/**
 * TimescaleDB Drizzle ORM Schema - PULL Time-Series Data
 *
 * These tables are converted to hypertables via the SQL migration.
 * Drizzle defines the column structure; TimescaleDB handles partitioning.
 *
 * Naming convention:
 * - Tables use snake_case
 * - All time-series tables have a `time` column as the partitioning key
 * - Numeric money fields use numeric(19,4)
 * - Numeric quantity fields use numeric(19,8) for crypto precision
 *
 * Hypertable chunk intervals (set in migration):
 * - price_ticks: 1 day (high volume, small retention)
 * - ohlcv_*: continuous aggregates (auto-managed)
 * - portfolio_snapshots: 7 days
 * - market_events: 1 day
 * - trading_volume: 1 day
 * - order_book_snapshots: 1 hour (very high volume)
 * - user_activity: 7 days
 * - system_metrics: 1 day
 */

import {
  pgTable,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// Table: price_ticks
// Raw price data from all sources (crypto exchanges, prediction markets, RWA)
// This is the highest-volume table — expect millions of rows per day
// ============================================================================

export const priceTicks = pgTable(
  "price_ticks",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    // Asset identification
    symbol: varchar("symbol", { length: 50 }).notNull(), // e.g., 'BTC-USD', 'KXBTC-24FEB', 'RWA-NYC-APT-001'
    source: varchar("source", { length: 50 }).notNull(), // 'massive', 'kalshi', 'alpaca', 'chainlink'

    // Price data (numeric, never float)
    price: numeric("price", { precision: 19, scale: 4 }).notNull(),
    volume: numeric("volume", { precision: 19, scale: 8 }).notNull().default("0"),

    // Bid/ask spread (optional — available for order-book-backed markets)
    bidPrice: numeric("bid_price", { precision: 19, scale: 4 }),
    askPrice: numeric("ask_price", { precision: 19, scale: 4 }),
    bidSize: numeric("bid_size", { precision: 19, scale: 8 }),
    askSize: numeric("ask_size", { precision: 19, scale: 8 }),

    // External reference
    tradeId: varchar("trade_id", { length: 255 }),

    // Flexible metadata (market-specific fields)
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    // Primary query pattern: symbol + time range
    index("idx_price_ticks_symbol_time").on(table.symbol, table.time),
    // Source filtering
    index("idx_price_ticks_source_time").on(table.source, table.time),
    // Dedup external trades
    uniqueIndex("idx_price_ticks_source_trade_id").on(table.source, table.tradeId),
  ]
);

// ============================================================================
// Table: portfolio_snapshots
// Periodic snapshots of user portfolio values for P&L charting
// Typically captured every 15 minutes for active users, hourly for others
// ============================================================================

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    userId: varchar("user_id", { length: 255 }).notNull(),

    // Portfolio valuation
    totalValueUsd: numeric("total_value_usd", { precision: 19, scale: 4 }).notNull(),
    cashBalanceUsd: numeric("cash_balance_usd", { precision: 19, scale: 4 }).notNull(),
    investedValueUsd: numeric("invested_value_usd", { precision: 19, scale: 4 }).notNull(),

    // P&L
    unrealizedPnlUsd: numeric("unrealized_pnl_usd", { precision: 19, scale: 4 }).notNull().default("0"),
    realizedPnlUsd: numeric("realized_pnl_usd", { precision: 19, scale: 4 }).notNull().default("0"),

    // Day change
    dayChangeUsd: numeric("day_change_usd", { precision: 19, scale: 4 }).notNull().default("0"),
    dayChangePct: numeric("day_change_pct", { precision: 8, scale: 4 }).notNull().default("0"),

    // Position breakdown
    positionCount: integer("position_count").notNull().default(0),
    positions: jsonb("positions").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_portfolio_snapshots_user_time").on(table.userId, table.time),
  ]
);

// ============================================================================
// Table: market_events
// Prediction market odds changes, resolutions, crypto listing events, etc.
// ============================================================================

export const marketEvents = pgTable(
  "market_events",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    marketId: varchar("market_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'odds_change', 'resolution', 'listing', 'delisting', 'halt', 'resume'
    symbol: varchar("symbol", { length: 50 }).notNull(),

    // Price/odds at time of event
    price: numeric("price", { precision: 19, scale: 4 }),
    previousPrice: numeric("previous_price", { precision: 19, scale: 4 }),

    // Market state
    volume: numeric("volume", { precision: 19, scale: 4 }),
    openInterest: numeric("open_interest", { precision: 19, scale: 4 }),

    // Event-specific data
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_market_events_market_time").on(table.marketId, table.time),
    index("idx_market_events_type_time").on(table.eventType, table.time),
    index("idx_market_events_symbol_time").on(table.symbol, table.time),
  ]
);

// ============================================================================
// Table: trading_volume
// Aggregated trading volume per symbol per time interval
// Fed by Kafka trade events, not real-time computed
// ============================================================================

export const tradingVolume = pgTable(
  "trading_volume",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    symbol: varchar("symbol", { length: 50 }).notNull(),
    marketType: varchar("market_type", { length: 20 }).notNull(), // 'prediction', 'crypto', 'rwa'

    // Volume metrics
    tradeCount: integer("trade_count").notNull().default(0),
    buyVolume: numeric("buy_volume", { precision: 19, scale: 8 }).notNull().default("0"),
    sellVolume: numeric("sell_volume", { precision: 19, scale: 8 }).notNull().default("0"),
    totalVolume: numeric("total_volume", { precision: 19, scale: 8 }).notNull().default("0"),
    notionalVolumeUsd: numeric("notional_volume_usd", { precision: 19, scale: 4 }).notNull().default("0"),

    // Price range in this interval
    highPrice: numeric("high_price", { precision: 19, scale: 4 }),
    lowPrice: numeric("low_price", { precision: 19, scale: 4 }),
    vwap: numeric("vwap", { precision: 19, scale: 4 }),

    // Unique traders
    uniqueBuyers: integer("unique_buyers").notNull().default(0),
    uniqueSellers: integer("unique_sellers").notNull().default(0),
  },
  (table) => [
    index("idx_trading_volume_symbol_time").on(table.symbol, table.time),
    index("idx_trading_volume_market_time").on(table.marketType, table.time),
  ]
);

// ============================================================================
// Table: order_book_snapshots
// L2 order book depth at regular intervals (every 1-5 seconds for active markets)
// ============================================================================

export const orderBookSnapshots = pgTable(
  "order_book_snapshots",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    symbol: varchar("symbol", { length: 50 }).notNull(),
    source: varchar("source", { length: 50 }).notNull(),

    // Best bid/ask
    bestBid: numeric("best_bid", { precision: 19, scale: 4 }),
    bestAsk: numeric("best_ask", { precision: 19, scale: 4 }),
    spread: numeric("spread", { precision: 19, scale: 4 }),
    spreadPct: numeric("spread_pct", { precision: 8, scale: 4 }),
    midPrice: numeric("mid_price", { precision: 19, scale: 4 }),

    // Depth metrics
    bidDepth5: numeric("bid_depth_5", { precision: 19, scale: 8 }), // Total size within 5 levels
    askDepth5: numeric("ask_depth_5", { precision: 19, scale: 8 }),
    bidDepth10: numeric("bid_depth_10", { precision: 19, scale: 8 }),
    askDepth10: numeric("ask_depth_10", { precision: 19, scale: 8 }),

    // Full L2 snapshot (top 20 levels)
    bids: jsonb("bids").$type<Array<[string, string]>>(), // [[price, size], ...]
    asks: jsonb("asks").$type<Array<[string, string]>>(),
  },
  (table) => [
    index("idx_order_book_symbol_time").on(table.symbol, table.time),
  ]
);

// ============================================================================
// Table: user_activity
// Time-series of user engagement events for analytics and retention
// ============================================================================

export const userActivity = pgTable(
  "user_activity",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    userId: varchar("user_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'login', 'trade', 'deposit', 'prediction', 'message', 'fantasy_pick'
    eventCategory: varchar("event_category", { length: 50 }).notNull(), // 'trading', 'social', 'gaming', 'finance', 'onboarding'

    // Event context
    symbol: varchar("symbol", { length: 50 }),
    marketType: varchar("market_type", { length: 20 }),
    amount: numeric("amount", { precision: 19, scale: 4 }),

    // Session tracking
    sessionId: varchar("session_id", { length: 255 }),
    platform: varchar("platform", { length: 20 }), // 'ios', 'android', 'web'

    // Flexible payload
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_user_activity_user_time").on(table.userId, table.time),
    index("idx_user_activity_type_time").on(table.eventType, table.time),
    index("idx_user_activity_category_time").on(table.eventCategory, table.time),
  ]
);

// ============================================================================
// Table: system_metrics
// Internal system performance metrics (API latency, queue depth, error rates)
// ============================================================================

export const systemMetrics = pgTable(
  "system_metrics",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),

    metricName: varchar("metric_name", { length: 100 }).notNull(), // 'api.latency', 'queue.depth', 'error.rate', 'circuit_breaker.state'
    value: numeric("value", { precision: 19, scale: 4 }).notNull(),

    // Dimensional tags for filtering
    tags: jsonb("tags").$type<Record<string, string>>(),

    // Unit for display
    unit: varchar("unit", { length: 20 }), // 'ms', 'count', 'percent', 'bytes'
  },
  (table) => [
    index("idx_system_metrics_name_time").on(table.metricName, table.time),
  ]
);
