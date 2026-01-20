/**
 * Inngest Event Definitions
 * All event types and payload schemas for PULL
 */

import { z } from "zod";

// ============================================================================
// Email Events
// ============================================================================

export const EmailSyncRequestedSchema = z.object({
  name: z.literal("email/sync.requested"),
  data: z.object({
    userId: z.string(),
    grantId: z.string(),
    fullSync: z.boolean().optional().default(false),
  }),
});

export const EmailReceivedSchema = z.object({
  name: z.literal("email/received"),
  data: z.object({
    userId: z.string(),
    grantId: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    from: z.string(),
    subject: z.string(),
    snippet: z.string(),
    receivedAt: z.number(),
  }),
});

export const EmailTriagedSchema = z.object({
  name: z.literal("email/triaged"),
  data: z.object({
    userId: z.string(),
    messageId: z.string(),
    priority: z.enum(["urgent", "important", "normal", "low"]),
    category: z.string(),
    tradingSignal: z.boolean().optional(),
  }),
});

// ============================================================================
// Trading Events
// ============================================================================

export const OrderPlacedSchema = z.object({
  name: z.literal("trading/order.placed"),
  data: z.object({
    userId: z.string(),
    orderId: z.string(),
    ticker: z.string(),
    side: z.enum(["yes", "no"]),
    action: z.enum(["buy", "sell"]),
    quantity: z.number(),
    price: z.number(),
  }),
});

export const OrderFilledSchema = z.object({
  name: z.literal("trading/order.filled"),
  data: z.object({
    userId: z.string(),
    orderId: z.string(),
    ticker: z.string(),
    fillPrice: z.number(),
    fillQuantity: z.number(),
    totalCost: z.number(),
  }),
});

export const MarketSettledSchema = z.object({
  name: z.literal("trading/market.settled"),
  data: z.object({
    ticker: z.string(),
    result: z.enum(["yes", "no"]),
    settledAt: z.number(),
  }),
});

export const PriceAlertTriggeredSchema = z.object({
  name: z.literal("trading/price-alert.triggered"),
  data: z.object({
    userId: z.string(),
    alertId: z.string(),
    ticker: z.string(),
    targetPrice: z.number(),
    currentPrice: z.number(),
    direction: z.enum(["above", "below"]),
  }),
});

// ============================================================================
// RWA Events
// ============================================================================

export const RWAPurchaseCompletedSchema = z.object({
  name: z.literal("rwa/purchase.completed"),
  data: z.object({
    userId: z.string(),
    assetId: z.string(),
    shares: z.number(),
    pricePerShare: z.number(),
    totalCost: z.number(),
  }),
});

export const RWAPriceUpdatedSchema = z.object({
  name: z.literal("rwa/price.updated"),
  data: z.object({
    assetId: z.string(),
    oldPrice: z.number(),
    newPrice: z.number(),
    changePercent: z.number(),
  }),
});

export const RWAAssetListedSchema = z.object({
  name: z.literal("rwa/asset.listed"),
  data: z.object({
    assetId: z.string(),
    name: z.string(),
    totalShares: z.number(),
    pricePerShare: z.number(),
  }),
});

// ============================================================================
// Rewards Events
// ============================================================================

export const RewardsActionCompletedSchema = z.object({
  name: z.literal("rewards/action.completed"),
  data: z.object({
    userId: z.string(),
    actionType: z.enum([
      "daily_login",
      "trade_completed",
      "referral_signup",
      "referral_trade",
      "kyc_completed",
      "first_deposit",
      "streak_bonus",
      "challenge_completed",
      "social_share",
      "email_connected",
    ]),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const RewardsPointsCreditedSchema = z.object({
  name: z.literal("rewards/points.credited"),
  data: z.object({
    userId: z.string(),
    points: z.number(),
    reason: z.string(),
    newBalance: z.number(),
  }),
});

export const RewardsTierUpgradedSchema = z.object({
  name: z.literal("rewards/tier.upgraded"),
  data: z.object({
    userId: z.string(),
    oldTier: z.string(),
    newTier: z.string(),
    benefits: z.array(z.string()),
  }),
});

export const RewardsRedemptionRequestedSchema = z.object({
  name: z.literal("rewards/redemption.requested"),
  data: z.object({
    userId: z.string(),
    redemptionId: z.string(),
    itemId: z.string(),
    pointsCost: z.number(),
  }),
});

// ============================================================================
// Notification Events
// ============================================================================

export const NotificationSendSchema = z.object({
  name: z.literal("notification/send"),
  data: z.object({
    userId: z.string(),
    type: z.enum([
      "order_filled",
      "market_settled",
      "price_alert",
      "deposit_confirmed",
      "withdrawal_completed",
      "kyc_approved",
      "kyc_rejected",
      "tier_upgraded",
      "streak_reminder",
      "urgent_email",
      "rwa_price_change",
      "new_market",
    ]),
    title: z.string(),
    body: z.string(),
    data: z.record(z.unknown()).optional(),
    channels: z.array(z.enum(["push", "email", "in_app", "sms"])).optional(),
  }),
});

export const NotificationDeliveredSchema = z.object({
  name: z.literal("notification/delivered"),
  data: z.object({
    userId: z.string(),
    notificationId: z.string(),
    channel: z.enum(["push", "email", "in_app", "sms"]),
    deliveredAt: z.number(),
  }),
});

// ============================================================================
// User Events
// ============================================================================

export const UserCreatedSchema = z.object({
  name: z.literal("user/created"),
  data: z.object({
    userId: z.string(),
    email: z.string(),
    referralCode: z.string().optional(),
  }),
});

export const UserKYCCompletedSchema = z.object({
  name: z.literal("user/kyc.completed"),
  data: z.object({
    userId: z.string(),
    tier: z.enum(["basic", "standard", "enhanced", "accredited"]),
    inquiryId: z.string(),
  }),
});

export const UserDepositCompletedSchema = z.object({
  name: z.literal("user/deposit.completed"),
  data: z.object({
    userId: z.string(),
    amount: z.number(),
    transferId: z.string(),
    method: z.enum(["ach", "wire", "crypto"]),
  }),
});

export const UserWithdrawalCompletedSchema = z.object({
  name: z.literal("user/withdrawal.completed"),
  data: z.object({
    userId: z.string(),
    amount: z.number(),
    transferId: z.string(),
    method: z.enum(["ach", "wire", "crypto"]),
  }),
});

// ============================================================================
// Compliance Events
// ============================================================================

export const ComplianceKYCExpiringSchema = z.object({
  name: z.literal("compliance/kyc.expiring"),
  data: z.object({
    userId: z.string(),
    expiresAt: z.number(),
    daysUntilExpiry: z.number(),
  }),
});

export const ComplianceWatchlistHitSchema = z.object({
  name: z.literal("compliance/watchlist.hit"),
  data: z.object({
    userId: z.string(),
    matchType: z.string(),
    matchScore: z.number(),
    source: z.string(),
  }),
});

// ============================================================================
// System Events
// ============================================================================

export const SystemHealthCheckSchema = z.object({
  name: z.literal("system/health.check"),
  data: z.object({
    service: z.string(),
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    details: z.record(z.unknown()).optional(),
  }),
});

// ============================================================================
// Event Types Union
// ============================================================================

export type EmailSyncRequested = z.infer<typeof EmailSyncRequestedSchema>;
export type EmailReceived = z.infer<typeof EmailReceivedSchema>;
export type EmailTriaged = z.infer<typeof EmailTriagedSchema>;
export type OrderPlaced = z.infer<typeof OrderPlacedSchema>;
export type OrderFilled = z.infer<typeof OrderFilledSchema>;
export type MarketSettled = z.infer<typeof MarketSettledSchema>;
export type PriceAlertTriggered = z.infer<typeof PriceAlertTriggeredSchema>;
export type RWAPurchaseCompleted = z.infer<typeof RWAPurchaseCompletedSchema>;
export type RWAPriceUpdated = z.infer<typeof RWAPriceUpdatedSchema>;
export type RWAAssetListed = z.infer<typeof RWAAssetListedSchema>;
export type RewardsActionCompleted = z.infer<typeof RewardsActionCompletedSchema>;
export type RewardsPointsCredited = z.infer<typeof RewardsPointsCreditedSchema>;
export type RewardsTierUpgraded = z.infer<typeof RewardsTierUpgradedSchema>;
export type RewardsRedemptionRequested = z.infer<typeof RewardsRedemptionRequestedSchema>;
export type NotificationSend = z.infer<typeof NotificationSendSchema>;
export type NotificationDelivered = z.infer<typeof NotificationDeliveredSchema>;
export type UserCreated = z.infer<typeof UserCreatedSchema>;
export type UserKYCCompleted = z.infer<typeof UserKYCCompletedSchema>;
export type UserDepositCompleted = z.infer<typeof UserDepositCompletedSchema>;
export type UserWithdrawalCompleted = z.infer<typeof UserWithdrawalCompletedSchema>;
export type ComplianceKYCExpiring = z.infer<typeof ComplianceKYCExpiringSchema>;
export type ComplianceWatchlistHit = z.infer<typeof ComplianceWatchlistHitSchema>;
export type SystemHealthCheck = z.infer<typeof SystemHealthCheckSchema>;

// All events type
export type PullEvent =
  | EmailSyncRequested
  | EmailReceived
  | EmailTriaged
  | OrderPlaced
  | OrderFilled
  | MarketSettled
  | PriceAlertTriggered
  | RWAPurchaseCompleted
  | RWAPriceUpdated
  | RWAAssetListed
  | RewardsActionCompleted
  | RewardsPointsCredited
  | RewardsTierUpgraded
  | RewardsRedemptionRequested
  | NotificationSend
  | NotificationDelivered
  | UserCreated
  | UserKYCCompleted
  | UserDepositCompleted
  | UserWithdrawalCompleted
  | ComplianceKYCExpiring
  | ComplianceWatchlistHit
  | SystemHealthCheck;

// Event name literals for type safety
export type PullEventName = PullEvent["name"];

// Helper to get event data type by name
export type EventDataByName<T extends PullEventName> = Extract<
  PullEvent,
  { name: T }
>["data"];
