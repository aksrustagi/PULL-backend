/**
 * Analytics Types
 * Core type definitions for analytics tracking, events, metrics, and pipeline integrations
 * Includes Segment, BigQuery, and Metabase integration types
 */

// ============================================================================
// Configuration Types (Pipeline)
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
// Event Types
// ============================================================================

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  anonymousId?: string;
  properties: Record<string, any>;
  timestamp: number;
  context: EventContext;
}

export interface EventContext {
  page?: string;
  path?: string;
  referrer?: string;
  search?: string;
  title?: string;
  url?: string;
  userAgent?: string;
  ip?: string;
  locale?: string;
  timezone?: string;
  campaign?: CampaignContext;
  device?: DeviceContext;
  session?: SessionContext;
  app?: AppContext;
}

export interface CampaignContext {
  source?: string;
  medium?: string;
  name?: string;
  term?: string;
  content?: string;
}

export interface DeviceContext {
  id?: string;
  advertisingId?: string;
  manufacturer?: string;
  model?: string;
  name?: string;
  type?: 'mobile' | 'tablet' | 'desktop';
  token?: string;
  os?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface SessionContext {
  id: string;
  startedAt: number;
  pageViews: number;
}

export interface AppContext {
  name?: string;
  version?: string;
  build?: string;
  namespace?: string;
}

// ============================================================================
// Segment Payload Types
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
// Analytics Event Types (Domain-Specific - Pipeline)
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
// User Lifecycle Events (Tracker)
// ============================================================================

export interface UserSignedUpProperties {
  method: 'email' | 'wallet' | 'google' | 'apple';
  referralCode?: string;
  referrerId?: string;
  source?: string;
}

export interface UserLoggedInProperties {
  method: 'email' | 'wallet' | 'google' | 'apple' | 'session';
}

export interface UserKycStartedProperties {
  tier: 'basic' | 'intermediate' | 'advanced';
}

export interface UserKycCompletedProperties {
  tier: 'basic' | 'intermediate' | 'advanced';
  durationSeconds: number;
  provider: string;
}

export interface UserFirstDepositProperties {
  amount: number;
  currency: string;
  method: 'bank' | 'card' | 'crypto' | 'wire';
}

export interface UserFirstTradeProperties {
  marketType: 'crypto' | 'prediction' | 'rwa';
  amount: number;
  ticker: string;
}

// ============================================================================
// Trading Events (Tracker)
// ============================================================================

export interface TradeOrderPlacedProperties {
  ticker: string;
  side: 'buy' | 'sell';
  amount: number;
  type: 'market' | 'limit' | 'stop';
  marketType: 'crypto' | 'prediction' | 'rwa';
  price?: number;
}

export interface TradeOrderFilledProperties {
  ticker: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  pnl?: number;
  fees: number;
  marketType: 'crypto' | 'prediction' | 'rwa';
  fillTime?: number;
}

export interface TradePositionClosedProperties {
  ticker: string;
  pnl: number;
  pnlPercent: number;
  holdingPeriodSeconds: number;
  marketType: 'crypto' | 'prediction' | 'rwa';
}

// ============================================================================
// Social Events
// ============================================================================

export interface SocialFollowedProperties {
  traderId: string;
  traderUsername?: string;
  traderTier?: string;
}

export interface SocialCopyStartedProperties {
  traderId: string;
  allocation: number;
  allocationPercent: number;
  maxPositions?: number;
}

export interface SocialCopyTradeExecutedProperties {
  traderId: string;
  ticker: string;
  amount: number;
  side: 'buy' | 'sell';
  delay?: number;
}

// ============================================================================
// Engagement Events
// ============================================================================

export interface EngagementQuestCompletedProperties {
  questId: string;
  questType: 'daily' | 'weekly' | 'milestone' | 'special';
  questName: string;
  pointsEarned: number;
}

export interface EngagementAchievementUnlockedProperties {
  achievementId: string;
  achievementName: string;
  category: string;
  pointsEarned: number;
}

export interface EngagementStreakMaintainedProperties {
  streakType: 'login' | 'trading' | 'deposit';
  count: number;
  bonusMultiplier?: number;
}

export interface EngagementPointsEarnedProperties {
  actionType: string;
  amount: number;
  multiplier?: number;
  source: string;
}

// ============================================================================
// Signal Events
// ============================================================================

export interface SignalViewedProperties {
  signalId: string;
  signalType: 'market' | 'social' | 'ai' | 'news';
  ticker?: string;
}

export interface SignalActedOnProperties {
  signalId: string;
  action: 'trade' | 'follow' | 'dismiss' | 'save';
  signalType: 'market' | 'social' | 'ai' | 'news';
  tradeAmount?: number;
}

// ============================================================================
// Funnel Events
// ============================================================================

export interface FunnelOnboardingStepProperties {
  step: 'email' | 'verify' | 'kyc' | 'agreements' | 'funding' | 'complete';
  stepNumber: number;
  completed: boolean;
  timeSpentSeconds?: number;
}

export interface FunnelDepositStartedProperties {
  method?: 'bank' | 'card' | 'crypto' | 'wire';
  amount?: number;
}

export interface FunnelDepositCompletedProperties {
  amount: number;
  currency: string;
  method: 'bank' | 'card' | 'crypto' | 'wire';
  processingTimeSeconds?: number;
}

export interface FunnelTradingStartedProperties {
  marketType: 'crypto' | 'prediction' | 'rwa';
  entryPoint?: string;
}

// ============================================================================
// Page View & Identity
// ============================================================================

export interface PageViewProperties {
  path: string;
  title?: string;
  referrer?: string;
  search?: string;
  loadTimeMs?: number;
}

export interface IdentifyTraits {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: number;
  kycTier?: string;
  kycStatus?: string;
  totalDeposits?: number;
  totalTrades?: number;
  totalVolume?: number;
  referralCode?: string;
  tier?: string;
  pointsBalance?: number;
  isVerified?: boolean;
}

// ============================================================================
// Tracker Configuration
// ============================================================================

export interface AnalyticsConfig {
  /** Flush interval in milliseconds */
  flushInterval: number;
  /** Maximum events to batch before flush */
  maxBatchSize: number;
  /** Enable debug logging */
  debug: boolean;
  /** Destinations to send events to */
  destinations: AnalyticsDestination[];
  /** Fields to redact for privacy */
  redactFields: string[];
  /** Enable GDPR compliance mode */
  gdprMode: boolean;
  /** Anonymous ID cookie/storage key */
  anonymousIdKey: string;
}

export interface AnalyticsDestination {
  name: string;
  type: 'convex' | 'segment' | 'amplitude' | 'mixpanel' | 'posthog' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
}

// ============================================================================
// Event Names (for type-safe tracking)
// ============================================================================

export const EVENT_NAMES = {
  // User lifecycle
  USER_SIGNED_UP: 'user.signed_up',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_KYC_STARTED: 'user.kyc_started',
  USER_KYC_COMPLETED: 'user.kyc_completed',
  USER_FIRST_DEPOSIT: 'user.first_deposit',
  USER_FIRST_TRADE: 'user.first_trade',
  USER_PROFILE_UPDATED: 'user.profile_updated',

  // Trading
  TRADE_ORDER_PLACED: 'trade.order_placed',
  TRADE_ORDER_FILLED: 'trade.order_filled',
  TRADE_ORDER_CANCELLED: 'trade.order_cancelled',
  TRADE_POSITION_OPENED: 'trade.position_opened',
  TRADE_POSITION_CLOSED: 'trade.position_closed',

  // Social
  SOCIAL_FOLLOWED: 'social.followed',
  SOCIAL_UNFOLLOWED: 'social.unfollowed',
  SOCIAL_COPY_STARTED: 'social.copy_started',
  SOCIAL_COPY_STOPPED: 'social.copy_stopped',
  SOCIAL_COPY_TRADE_EXECUTED: 'social.copy_trade_executed',
  SOCIAL_MESSAGE_SENT: 'social.message_sent',

  // Engagement
  ENGAGEMENT_QUEST_STARTED: 'engagement.quest_started',
  ENGAGEMENT_QUEST_COMPLETED: 'engagement.quest_completed',
  ENGAGEMENT_ACHIEVEMENT_UNLOCKED: 'engagement.achievement_unlocked',
  ENGAGEMENT_STREAK_MAINTAINED: 'engagement.streak_maintained',
  ENGAGEMENT_STREAK_BROKEN: 'engagement.streak_broken',
  ENGAGEMENT_POINTS_EARNED: 'engagement.points_earned',
  ENGAGEMENT_POINTS_REDEEMED: 'engagement.points_redeemed',

  // Signals
  SIGNAL_VIEWED: 'signal.viewed',
  SIGNAL_ACTED_ON: 'signal.acted_on',
  SIGNAL_DISMISSED: 'signal.dismissed',

  // Funnel
  FUNNEL_ONBOARDING_STEP: 'funnel.onboarding_step',
  FUNNEL_DEPOSIT_STARTED: 'funnel.deposit_started',
  FUNNEL_DEPOSIT_COMPLETED: 'funnel.deposit_completed',
  FUNNEL_TRADING_STARTED: 'funnel.trading_started',

  // Page & Session
  PAGE_VIEWED: 'page.viewed',
  SESSION_STARTED: 'session.started',
  SESSION_ENDED: 'session.ended',

  // Errors
  ERROR_OCCURRED: 'error.occurred',
  ERROR_RECOVERED: 'error.recovered',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

// ============================================================================
// Privacy & GDPR
// ============================================================================

export interface GdprConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  timestamp: number;
  version: string;
}

export interface AnonymizationConfig {
  hashUserIds: boolean;
  removeIp: boolean;
  truncateUserAgent: boolean;
  redactPii: boolean;
  redactFields: string[];
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface EventBatch {
  events: AnalyticsEvent[];
  sentAt: number;
  batchId: string;
}

export interface BatchResult {
  batchId: string;
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors?: string[];
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
