/**
 * ClickHouse Analytics Types
 * Types for analytics, fast aggregations, and time-series data
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ClickHouseClientConfig {
  host: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  protocol?: "http" | "https";
  timeout?: number;
  maxRetries?: number;
  compression?: boolean;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryParams {
  query: string;
  params?: Record<string, unknown>;
  format?: QueryFormat;
}

export type QueryFormat =
  | "JSON"
  | "JSONEachRow"
  | "JSONCompact"
  | "CSV"
  | "TSV"
  | "TabSeparated";

export interface QueryResult<T = Record<string, unknown>> {
  data: T[];
  statistics: QueryStatistics;
  rows: number;
  rows_before_limit_at_least?: number;
}

export interface QueryStatistics {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
}

// ============================================================================
// Analytics Event Types
// ============================================================================

export interface AnalyticsEvent {
  event_id: string;
  event_name: string;
  user_id?: string;
  session_id?: string;
  timestamp: Date;
  properties: Record<string, unknown>;
  context: EventContext;
}

export interface EventContext {
  ip?: string;
  user_agent?: string;
  page_url?: string;
  referrer?: string;
  locale?: string;
  timezone?: string;
  device_type?: "desktop" | "mobile" | "tablet";
  os?: string;
  browser?: string;
  app_version?: string;
}

// ============================================================================
// Trading Analytics Types
// ============================================================================

export interface TradeAnalytics {
  trade_id: string;
  user_id: string;
  symbol: string;
  asset_type: "crypto" | "prediction" | "rwa";
  side: "buy" | "sell";
  quantity: number;
  price: number;
  total_value: number;
  fee: number;
  timestamp: Date;
  execution_time_ms: number;
}

export interface VolumeMetrics {
  period: string;
  total_volume: number;
  trade_count: number;
  unique_traders: number;
  avg_trade_size: number;
  top_symbols: Array<{ symbol: string; volume: number }>;
}

export interface UserTradingMetrics {
  user_id: string;
  total_trades: number;
  total_volume: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_trade_size: number;
  most_traded_symbol: string;
  first_trade_at: Date;
  last_trade_at: Date;
}

// ============================================================================
// Aggregation Types
// ============================================================================

export type TimeGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

export interface TimeSeriesQuery {
  metric: string;
  startTime: Date;
  endTime: Date;
  granularity: TimeGranularity;
  filters?: Record<string, unknown>;
  groupBy?: string[];
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AggregationResult {
  groupKey: string;
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  percentile_50?: number;
  percentile_90?: number;
  percentile_99?: number;
}

// ============================================================================
// Funnel & Cohort Types
// ============================================================================

export interface FunnelStep {
  name: string;
  event_name: string;
  filters?: Record<string, unknown>;
}

export interface FunnelAnalysis {
  steps: FunnelStep[];
  startDate: Date;
  endDate: Date;
  results: FunnelResult[];
}

export interface FunnelResult {
  step_name: string;
  users_entered: number;
  users_completed: number;
  conversion_rate: number;
  avg_time_to_convert_seconds: number;
}

export interface CohortDefinition {
  name: string;
  cohort_date_field: string;
  activity_event: string;
  granularity: TimeGranularity;
  startDate: Date;
  endDate: Date;
}

export interface CohortResult {
  cohort_date: Date;
  cohort_size: number;
  retention: number[]; // Array of retention rates per period
}

// ============================================================================
// Insert Types
// ============================================================================

export interface InsertParams<T> {
  table: string;
  values: T[];
  columns?: string[];
}

export interface InsertResult {
  rows_inserted: number;
  execution_time_ms: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class ClickHouseError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly query?: string
  ) {
    super(message);
    this.name = "ClickHouseError";
  }
}
