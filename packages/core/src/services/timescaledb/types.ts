/**
 * TimescaleDB TypeScript Types
 *
 * Inferred from the Drizzle ORM schema + domain-specific types
 * for time-series operations.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  priceTicks,
  portfolioSnapshots,
  marketEvents,
  tradingVolume,
  orderBookSnapshots,
  userActivity,
  systemMetrics,
} from "./schema";

// ============================================================================
// Table Types (inferred from schema)
// ============================================================================

export type PriceTick = InferSelectModel<typeof priceTicks>;
export type InsertPriceTick = InferInsertModel<typeof priceTicks>;

export type PortfolioSnapshot = InferSelectModel<typeof portfolioSnapshots>;
export type InsertPortfolioSnapshot = InferInsertModel<typeof portfolioSnapshots>;

export type MarketEvent = InferSelectModel<typeof marketEvents>;
export type InsertMarketEvent = InferInsertModel<typeof marketEvents>;

export type TradingVolume = InferSelectModel<typeof tradingVolume>;
export type InsertTradingVolume = InferInsertModel<typeof tradingVolume>;

export type OrderBookSnapshot = InferSelectModel<typeof orderBookSnapshots>;
export type InsertOrderBookSnapshot = InferInsertModel<typeof orderBookSnapshots>;

export type UserActivity = InferSelectModel<typeof userActivity>;
export type InsertUserActivity = InferInsertModel<typeof userActivity>;

export type SystemMetric = InferSelectModel<typeof systemMetrics>;
export type InsertSystemMetric = InferInsertModel<typeof systemMetrics>;

// ============================================================================
// OHLCV Candle (returned by continuous aggregates)
// ============================================================================

export interface OHLCVCandle {
  bucket: Date;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  tradeCount: number;
  vwap: string;
}

export type CandleInterval =
  | "1 minute"
  | "5 minutes"
  | "15 minutes"
  | "1 hour"
  | "1 day";

// ============================================================================
// Query Parameter Types
// ============================================================================

export interface TimeRangeQuery {
  from: Date;
  to?: Date;
  limit?: number;
}

export interface SymbolTimeRangeQuery extends TimeRangeQuery {
  symbol: string;
}

export interface CandleQuery extends SymbolTimeRangeQuery {
  interval: CandleInterval;
}

export interface PortfolioHistoryQuery extends TimeRangeQuery {
  userId: string;
  interval: "1 hour" | "1 day" | "1 week";
}

export interface VolumeSummary {
  totalVolume: string;
  tradeCount: number;
  vwap: string;
  high: string;
  low: string;
}

// ============================================================================
// Aggregation Result Types
// ============================================================================

export interface PortfolioHistoryPoint {
  bucket: Date;
  avgTotalValue: string;
  avgCashBalance: string;
  avgInvestedValue: string;
  avgUnrealizedPnl: string;
}

export interface MarketSummary {
  symbol: string;
  lastPrice: string;
  change24h: string;
  changePct24h: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  tradeCount24h: number;
}

export interface UserActivitySummary {
  userId: string;
  period: string;
  totalEvents: number;
  tradingEvents: number;
  socialEvents: number;
  gamingEvents: number;
  uniqueSessions: number;
  platforms: string[];
}

// ============================================================================
// Health Check
// ============================================================================

export interface TimescaleHealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  poolSize?: number;
  poolIdle?: number;
  poolWaiting?: number;
  timescaleVersion?: string;
  error?: string;
}

// ============================================================================
// Event Type Constants
// ============================================================================

export const MARKET_EVENT_TYPES = [
  "odds_change",
  "resolution",
  "listing",
  "delisting",
  "halt",
  "resume",
  "settlement",
  "expiry",
] as const;

export const USER_ACTIVITY_TYPES = [
  "login",
  "trade",
  "deposit",
  "withdrawal",
  "prediction",
  "message",
  "fantasy_pick",
  "fantasy_lineup",
  "squad_join",
  "battle_enter",
  "nft_mint",
  "token_swap",
  "referral",
] as const;

export const USER_ACTIVITY_CATEGORIES = [
  "trading",
  "social",
  "gaming",
  "finance",
  "onboarding",
  "messaging",
  "fantasy",
] as const;

export const PRICE_SOURCES = [
  "massive",
  "kalshi",
  "alpaca",
  "chainlink",
  "coingecko",
  "binance",
  "internal",
] as const;

export const SYSTEM_METRIC_NAMES = [
  "api.latency",
  "api.request_count",
  "api.error_rate",
  "queue.depth",
  "queue.processing_time",
  "circuit_breaker.state",
  "circuit_breaker.failure_rate",
  "db.query_time",
  "db.connection_count",
  "cache.hit_rate",
  "trade.execution_time",
  "trade.settlement_time",
  "websocket.connections",
  "websocket.messages_per_sec",
] as const;
