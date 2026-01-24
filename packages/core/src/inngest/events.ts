/**
 * Inngest Event Definitions
 *
 * Centralized event type definitions for all PULL event-driven functions.
 * Each event has a strongly-typed payload schema.
 */

import { z } from "zod";

// =============================================================================
// Event Payload Schemas
// =============================================================================

// Email Events
export const emailSyncRequestedPayloadSchema = z.object({
  userId: z.string().uuid(),
  grantId: z.string(),
  fullSync: z.boolean().optional().default(false),
  folders: z.array(z.string()).optional(),
});

export const emailReceivedPayloadSchema = z.object({
  userId: z.string().uuid(),
  emailId: z.string(),
  grantId: z.string(),
  threadId: z.string().optional(),
  subject: z.string(),
  from: z.string().email(),
  receivedAt: z.string().datetime(),
  hasAttachments: z.boolean().default(false),
});

// Rewards Events
export const rewardsActionCompletedPayloadSchema = z.object({
  userId: z.string().uuid(),
  actionType: z.enum([
    "trade_executed",
    "rwa_purchased",
    "kyc_completed",
    "referral_signup",
    "daily_login",
    "email_triaged",
    "market_prediction",
    "streak_milestone",
    "tier_upgrade",
  ]),
  actionId: z.string(),
  metadata: z
    .record(z.unknown())
    .optional()
    .default({}),
  timestamp: z.string().datetime(),
});

// Notification Events
export const notificationSendPayloadSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum([
    "trade_executed",
    "trade_settled",
    "price_alert",
    "new_market",
    "urgent_email",
    "kyc_update",
    "reward_earned",
    "streak_reminder",
    "digest",
    "system",
  ]),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).optional(),
  channels: z
    .array(z.enum(["push", "email", "in_app"]))
    .optional()
    .default(["in_app"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  scheduledFor: z.string().datetime().optional(),
});

// Market Data Events
export const marketDataUpdatedPayloadSchema = z.object({
  marketId: z.string(),
  ticker: z.string(),
  previousPrice: z.number(),
  currentPrice: z.number(),
  priceChangePercent: z.number(),
  volume24h: z.number().optional(),
  timestamp: z.string().datetime(),
});

export const newMarketDetectedPayloadSchema = z.object({
  marketId: z.string(),
  ticker: z.string(),
  title: z.string(),
  category: z.string(),
  expirationDate: z.string().datetime().optional(),
  initialYesPrice: z.number(),
  relevanceScore: z.number().optional(),
});

// RWA Events
export const rwaPriceAlertPayloadSchema = z.object({
  assetId: z.string(),
  assetType: z.enum(["pokemon_card", "sports_card", "collectible", "other"]),
  assetName: z.string(),
  previousPrice: z.number(),
  currentPrice: z.number(),
  priceChangePercent: z.number(),
  affectedUserIds: z.array(z.string().uuid()),
});

// Compliance Events
export const kycExpiringPayloadSchema = z.object({
  userId: z.string().uuid(),
  kycId: z.string(),
  expirationDate: z.string().datetime(),
  daysUntilExpiration: z.number(),
  kycLevel: z.enum(["basic", "standard", "enhanced"]),
});

export const watchlistMatchPayloadSchema = z.object({
  userId: z.string().uuid(),
  matchType: z.enum(["sanctions", "pep", "adverse_media"]),
  matchScore: z.number(),
  matchDetails: z.string(),
  requiresReview: z.boolean(),
});

// Trading Signal Events
export const tradingSignalDetectedPayloadSchema = z.object({
  userId: z.string().uuid(),
  emailId: z.string(),
  signalType: z.enum(["buy", "sell", "hold", "alert"]),
  ticker: z.string().optional(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  source: z.string(),
});

// Portfolio Agent Events
export const portfolioStrategyExecutedPayloadSchema = z.object({
  userId: z.string(),
  strategyId: z.string(),
  type: z.enum(["dca", "rebalance", "stop_loss", "take_profit", "opportunistic_buy"]),
  result: z.enum(["success", "failed", "pending_approval"]),
  amount: z.number().optional(),
  symbol: z.string().optional(),
  timestamp: z.string().datetime(),
});

export const portfolioBriefGeneratedPayloadSchema = z.object({
  userId: z.string(),
  briefId: z.string(),
  headline: z.string(),
  opportunityCount: z.number(),
  riskAlertCount: z.number(),
  timestamp: z.string().datetime(),
});

// AI Signal Detection Events
export const emailSyncedPayloadSchema = z.object({
  emailId: z.string(),
  userId: z.string(),
  externalId: z.string(),
  from: z.string(),
  fromName: z.string().optional(),
  subject: z.string(),
  body: z.string().optional(),
  receivedAt: z.string(),
});

// =============================================================================
// Event Type Definitions
// =============================================================================

export type EmailSyncRequestedPayload = z.infer<typeof emailSyncRequestedPayloadSchema>;
export type EmailReceivedPayload = z.infer<typeof emailReceivedPayloadSchema>;
export type RewardsActionCompletedPayload = z.infer<typeof rewardsActionCompletedPayloadSchema>;
export type NotificationSendPayload = z.infer<typeof notificationSendPayloadSchema>;
export type MarketDataUpdatedPayload = z.infer<typeof marketDataUpdatedPayloadSchema>;
export type NewMarketDetectedPayload = z.infer<typeof newMarketDetectedPayloadSchema>;
export type RwaPriceAlertPayload = z.infer<typeof rwaPriceAlertPayloadSchema>;
export type KycExpiringPayload = z.infer<typeof kycExpiringPayloadSchema>;
export type WatchlistMatchPayload = z.infer<typeof watchlistMatchPayloadSchema>;
export type TradingSignalDetectedPayload = z.infer<typeof tradingSignalDetectedPayloadSchema>;
export type EmailSyncedPayload = z.infer<typeof emailSyncedPayloadSchema>;
export type PortfolioStrategyExecutedPayload = z.infer<typeof portfolioStrategyExecutedPayloadSchema>;
export type PortfolioBriefGeneratedPayload = z.infer<typeof portfolioBriefGeneratedPayloadSchema>;

// =============================================================================
// Inngest Event Map
// =============================================================================

/**
 * Complete event map for Inngest type inference.
 * Maps event names to their payload types.
 */
export interface InngestEvents {
  // Email events
  "email/sync.requested": {
    data: EmailSyncRequestedPayload;
  };
  "email/received": {
    data: EmailReceivedPayload;
  };

  // Rewards events
  "rewards/action.completed": {
    data: RewardsActionCompletedPayload;
  };

  // Notification events
  "notification/send": {
    data: NotificationSendPayload;
  };

  // Market data events
  "market-data/updated": {
    data: MarketDataUpdatedPayload;
  };
  "market-data/new-market": {
    data: NewMarketDetectedPayload;
  };

  // RWA events
  "rwa/price-alert": {
    data: RwaPriceAlertPayload;
  };

  // Compliance events
  "compliance/kyc-expiring": {
    data: KycExpiringPayload;
  };
  "compliance/watchlist-match": {
    data: WatchlistMatchPayload;
  };

  // Trading signals
  "trading/signal-detected": {
    data: TradingSignalDetectedPayload;
  };

  // AI Signal events
  "email/synced": {
    data: EmailSyncedPayload;
  };

  // Portfolio agent events
  "portfolio-agent/strategy.executed": {
    data: PortfolioStrategyExecutedPayload;
  };
  "portfolio-agent/brief.generated": {
    data: PortfolioBriefGeneratedPayload;
  };
}

// =============================================================================
// Event Name Constants
// =============================================================================

export const EVENT_NAMES = {
  EMAIL_SYNC_REQUESTED: "email/sync.requested",
  EMAIL_RECEIVED: "email/received",
  EMAIL_SYNCED: "email/synced",
  REWARDS_ACTION_COMPLETED: "rewards/action.completed",
  NOTIFICATION_SEND: "notification/send",
  MARKET_DATA_UPDATED: "market-data/updated",
  MARKET_DATA_NEW_MARKET: "market-data/new-market",
  RWA_PRICE_ALERT: "rwa/price-alert",
  COMPLIANCE_KYC_EXPIRING: "compliance/kyc-expiring",
  COMPLIANCE_WATCHLIST_MATCH: "compliance/watchlist-match",
  TRADING_SIGNAL_DETECTED: "trading/signal-detected",
  PORTFOLIO_STRATEGY_EXECUTED: "portfolio-agent/strategy.executed",
  PORTFOLIO_BRIEF_GENERATED: "portfolio-agent/brief.generated",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

// =============================================================================
// Event Helpers
// =============================================================================

/**
 * Type-safe event payload validator
 */
export function validateEventPayload<T extends keyof InngestEvents>(
  eventName: T,
  payload: unknown
): InngestEvents[T]["data"] {
  const schemas: Record<string, z.ZodSchema> = {
    "email/sync.requested": emailSyncRequestedPayloadSchema,
    "email/received": emailReceivedPayloadSchema,
    "email/synced": emailSyncedPayloadSchema,
    "rewards/action.completed": rewardsActionCompletedPayloadSchema,
    "notification/send": notificationSendPayloadSchema,
    "market-data/updated": marketDataUpdatedPayloadSchema,
    "market-data/new-market": newMarketDetectedPayloadSchema,
    "rwa/price-alert": rwaPriceAlertPayloadSchema,
    "compliance/kyc-expiring": kycExpiringPayloadSchema,
    "compliance/watchlist-match": watchlistMatchPayloadSchema,
    "trading/signal-detected": tradingSignalDetectedPayloadSchema,
    "portfolio-agent/strategy.executed": portfolioStrategyExecutedPayloadSchema,
    "portfolio-agent/brief.generated": portfolioBriefGeneratedPayloadSchema,
  };

  const schema = schemas[eventName];
  if (!schema) {
    throw new Error(`Unknown event: ${eventName}`);
  }

  return schema.parse(payload) as InngestEvents[T]["data"];
}

/**
 * Create a typed event payload
 */
export function createEvent<T extends keyof InngestEvents>(
  name: T,
  data: InngestEvents[T]["data"]
): { name: T; data: InngestEvents[T]["data"] } {
  return { name, data: validateEventPayload(name, data) };
}
