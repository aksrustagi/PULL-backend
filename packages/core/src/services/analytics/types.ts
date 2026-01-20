/**
 * Analytics Pipeline Types
 * Types for Segment, BigQuery, and Metabase integrations
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface AnalyticsClientConfig {
  segment?: SegmentConfig;
  bigQuery?: BigQueryConfig;
  metabase?: MetabaseConfig;
  batchSize?: number;
  flushInterval?: number;
  logger?: Logger;
}

export interface SegmentConfig {
  writeKey: string;
  dataPlaneUrl?: string;
  flushAt?: number;
  flushInterval?: number;
}

export interface BigQueryConfig {
  projectId: string;
  datasetId: string;
  credentials: {
    clientEmail: string;
    privateKey: string;
  };
  location?: string;
}

export interface MetabaseConfig {
  instanceUrl: string;
  apiKey: string;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Segment Event Types
// ============================================================================

export interface IdentifyPayload {
  userId: string;
  traits?: UserTraits;
  context?: EventContext;
  timestamp?: Date;
}

export interface UserTraits {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatar?: string;
  createdAt?: Date;
  plan?: string;
  kycStatus?: string;
  totalTrades?: number;
  totalVolume?: number;
  [key: string]: unknown;
}

export interface TrackPayload {
  userId: string;
  event: string;
  properties?: EventProperties;
  context?: EventContext;
  timestamp?: Date;
}

export interface EventProperties {
  [key: string]: unknown;
}

export interface EventContext {
  ip?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  page?: PageContext;
  device?: DeviceContext;
  campaign?: CampaignContext;
  app?: AppContext;
}

export interface PageContext {
  path?: string;
  referrer?: string;
  search?: string;
  title?: string;
  url?: string;
}

export interface DeviceContext {
  id?: string;
  advertisingId?: string;
  manufacturer?: string;
  model?: string;
  name?: string;
  type?: string;
  token?: string;
}

export interface CampaignContext {
  name?: string;
  source?: string;
  medium?: string;
  term?: string;
  content?: string;
}

export interface AppContext {
  name?: string;
  version?: string;
  build?: string;
  namespace?: string;
}

export interface PagePayload {
  userId?: string;
  anonymousId?: string;
  name?: string;
  category?: string;
  properties?: PageProperties;
  context?: EventContext;
  timestamp?: Date;
}

export interface PageProperties {
  path?: string;
  referrer?: string;
  search?: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface GroupPayload {
  userId: string;
  groupId: string;
  traits?: GroupTraits;
  context?: EventContext;
  timestamp?: Date;
}

export interface GroupTraits {
  name?: string;
  industry?: string;
  employees?: number;
  plan?: string;
  [key: string]: unknown;
}

export interface AliasPayload {
  previousId: string;
  userId: string;
  context?: EventContext;
  timestamp?: Date;
}

// ============================================================================
// Standard Event Types
// ============================================================================

export type StandardEvent =
  // Core events
  | "Signed Up"
  | "Signed In"
  | "Signed Out"
  | "Account Created"
  | "Account Deleted"
  // Onboarding
  | "Onboarding Started"
  | "Onboarding Step Completed"
  | "Onboarding Completed"
  | "KYC Submitted"
  | "KYC Approved"
  | "KYC Rejected"
  // Trading
  | "Order Placed"
  | "Order Filled"
  | "Order Cancelled"
  | "Position Opened"
  | "Position Closed"
  | "Trade Executed"
  // Deposits/Withdrawals
  | "Deposit Initiated"
  | "Deposit Completed"
  | "Withdrawal Initiated"
  | "Withdrawal Completed"
  // Markets
  | "Market Viewed"
  | "Market Searched"
  | "Watchlist Added"
  | "Watchlist Removed"
  // Rewards
  | "Points Earned"
  | "Reward Claimed"
  | "Streak Updated"
  // Engagement
  | "Feature Used"
  | "Button Clicked"
  | "Form Submitted"
  | "Error Encountered";

// ============================================================================
// BigQuery Types
// ============================================================================

export interface BigQueryTable {
  tableId: string;
  datasetId: string;
  schema: BigQueryField[];
  partitioning?: PartitionConfig;
  clustering?: string[];
}

export interface BigQueryField {
  name: string;
  type: BigQueryFieldType;
  mode?: "NULLABLE" | "REQUIRED" | "REPEATED";
  description?: string;
  fields?: BigQueryField[]; // For RECORD types
}

export type BigQueryFieldType =
  | "STRING"
  | "BYTES"
  | "INTEGER"
  | "INT64"
  | "FLOAT"
  | "FLOAT64"
  | "NUMERIC"
  | "BIGNUMERIC"
  | "BOOLEAN"
  | "BOOL"
  | "TIMESTAMP"
  | "DATE"
  | "TIME"
  | "DATETIME"
  | "GEOGRAPHY"
  | "RECORD"
  | "STRUCT"
  | "JSON";

export interface PartitionConfig {
  type: "DAY" | "HOUR" | "MONTH" | "YEAR";
  field: string;
  expirationMs?: number;
}

export interface BigQueryInsertResult {
  success: boolean;
  insertedRows: number;
  errors?: BigQueryInsertError[];
}

export interface BigQueryInsertError {
  index: number;
  errors: Array<{ reason: string; message: string }>;
}

export interface BigQueryQueryResult<T = Record<string, unknown>> {
  rows: T[];
  totalRows: number;
  schema: BigQueryField[];
  jobId: string;
  cacheHit: boolean;
}

// ============================================================================
// Metabase Types
// ============================================================================

export interface MetabaseQuestion {
  id: number;
  name: string;
  description?: string;
  displayType: MetabaseDisplayType;
  query: MetabaseQuery;
  visualization_settings: Record<string, unknown>;
}

export type MetabaseDisplayType =
  | "table"
  | "bar"
  | "line"
  | "area"
  | "row"
  | "pie"
  | "scalar"
  | "progress"
  | "gauge"
  | "funnel"
  | "map"
  | "scatter";

export interface MetabaseQuery {
  database?: number;
  type: "query" | "native";
  query?: {
    "source-table"?: number;
    aggregation?: unknown[];
    breakout?: unknown[];
    filter?: unknown[];
    "order-by"?: unknown[];
    limit?: number;
  };
  native?: {
    query: string;
    "template-tags"?: Record<string, MetabaseTemplateTag>;
  };
}

export interface MetabaseTemplateTag {
  id: string;
  name: string;
  "display-name": string;
  type: "text" | "number" | "date" | "dimension";
  required?: boolean;
  default?: unknown;
}

export interface MetabaseDashboard {
  id: number;
  name: string;
  description?: string;
  cards: MetabaseDashboardCard[];
}

export interface MetabaseDashboardCard {
  id: number;
  card_id: number;
  row: number;
  col: number;
  size_x: number;
  size_y: number;
  parameter_mappings?: unknown[];
}

export interface MetabaseQueryResult {
  data: {
    rows: unknown[][];
    cols: Array<{ name: string; display_name: string; base_type: string }>;
    native_form?: { query: string };
  };
  row_count: number;
  status: "completed" | "failed";
  error?: string;
}

// ============================================================================
// Analytics Event Types (Domain-Specific)
// ============================================================================

// User events
export interface UserSignedUpEvent {
  event: "Signed Up";
  properties: {
    signup_method: "email" | "google" | "apple" | "wallet";
    referral_code?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
}

// Trading events
export interface OrderPlacedEvent {
  event: "Order Placed";
  properties: {
    order_id: string;
    market_id: string;
    market_title: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    order_type: "market" | "limit";
    asset_type: "crypto" | "prediction" | "rwa";
  };
}

export interface TradeExecutedEvent {
  event: "Trade Executed";
  properties: {
    trade_id: string;
    order_id: string;
    market_id: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    total_value: number;
    fee: number;
    execution_time_ms: number;
  };
}

// Market events
export interface MarketViewedEvent {
  event: "Market Viewed";
  properties: {
    market_id: string;
    market_title: string;
    category: string;
    source: "search" | "browse" | "recommendation" | "link" | "notification";
    position?: number;
  };
}

// Reward events
export interface PointsEarnedEvent {
  event: "Points Earned";
  properties: {
    points: number;
    action: string;
    total_points: number;
    level: number;
  };
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  dimensions?: Record<string, string>;
  tags?: string[];
}

export interface MetricAggregation {
  metric: string;
  aggregation: "sum" | "avg" | "min" | "max" | "count" | "p50" | "p90" | "p99";
  value: number;
  period: {
    start: Date;
    end: Date;
    granularity: "minute" | "hour" | "day" | "week" | "month";
  };
  dimensions?: Record<string, string>;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardDefinition {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  filters?: DashboardFilter[];
  refreshInterval?: number;
}

export interface DashboardWidget {
  id: string;
  type: "chart" | "metric" | "table" | "text";
  title: string;
  query: string;
  position: { x: number; y: number; w: number; h: number };
  visualization?: Record<string, unknown>;
}

export interface DashboardFilter {
  id: string;
  name: string;
  type: "date_range" | "select" | "multi_select" | "text";
  field: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
}

// ============================================================================
// Error Types
// ============================================================================

export class AnalyticsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = "AnalyticsError";
  }
}
