/**
 * VIP Tiers - Type Definitions
 * Premium tier system with cashback and exclusive benefits
 */

// ============================================================================
// VIP Tier Levels
// ============================================================================

export type VIPTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "black";

export interface VIPTierConfig {
  tier: VIPTier;
  name: string;
  volumeThreshold: number;
  cashbackPercent: number;
  benefits: TierBenefits;
  color: string;
  icon: string;
  badgeUrl?: string;
}

export interface TierBenefits {
  // Financial
  cashbackPercent: number;
  feeDiscount: number;
  maxDailyWithdrawal: number;
  withdrawalPriority: "standard" | "fast" | "instant";
  withdrawalFeeWaivers: number;

  // Support
  supportLevel: "community" | "email" | "priority" | "dedicated" | "concierge";
  dedicatedManager: boolean;
  responseTimeHours: number;

  // Trading
  maxPositionSize: number;
  advancedOrderTypes: boolean;
  apiRateLimit: number;

  // Exclusive
  exclusivePromos: boolean;
  earlyAccess: boolean;
  vipEvents: boolean;
  nftDrops: boolean;
  betaFeatures: boolean;

  // Social
  verifiedBadge: boolean;
  profileHighlight: boolean;
  customEmojis: boolean;

  // Rewards
  pointsMultiplier: number;
  bonusInsuranceCredits: number;
}

// ============================================================================
// User VIP Status
// ============================================================================

export interface UserVIPStatus {
  userId: string;
  currentTier: VIPTier;
  previousTier?: VIPTier;
  lifetimeVolume: number;
  currentPeriodVolume: number;
  periodStartDate: Date;
  periodEndDate: Date;
  nextTier?: VIPTier;
  volumeToNextTier?: number;
  percentToNextTier?: number;
  tierAchievedAt: Date;
  tierExpiresAt?: Date;
  benefits: TierBenefits;
  isGracePeriod: boolean;
  gracePeriodEndsAt?: Date;
}

export interface VIPProgress {
  currentTier: VIPTier;
  currentVolume: number;
  nextTier: VIPTier | null;
  nextTierThreshold: number | null;
  volumeNeeded: number | null;
  percentComplete: number;
  projectedTier: VIPTier;
  projectedDate?: Date;
  weeklyVolumeAvg: number;
  monthlyVolumeAvg: number;
}

// ============================================================================
// Cashback
// ============================================================================

export interface CashbackTransaction {
  id: string;
  userId: string;
  tier: VIPTier;
  tradeId: string;
  tradingVolume: number;
  cashbackPercent: number;
  cashbackAmount: number;
  status: "pending" | "credited" | "expired" | "cancelled";
  creditedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CashbackSummary {
  userId: string;
  totalCashbackEarned: number;
  totalCashbackPending: number;
  currentMonthCashback: number;
  currentWeekCashback: number;
  lifetimeTradingVolume: number;
  averageCashbackPercent: number;
  lastCashbackAt?: Date;
  transactions: CashbackTransaction[];
}

// ============================================================================
// Tier Upgrades/Downgrades
// ============================================================================

export interface TierChange {
  id: string;
  userId: string;
  previousTier: VIPTier;
  newTier: VIPTier;
  changeType: "upgrade" | "downgrade" | "maintain";
  reason: "volume_threshold" | "manual_adjustment" | "promo" | "grace_period_end";
  volumeAtChange: number;
  effectiveAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface TierReview {
  userId: string;
  reviewPeriodStart: Date;
  reviewPeriodEnd: Date;
  periodVolume: number;
  currentTier: VIPTier;
  qualifyingTier: VIPTier;
  recommendation: "upgrade" | "downgrade" | "maintain";
  gracePeriodEligible: boolean;
  notes?: string;
}

// ============================================================================
// VIP Events & Rewards
// ============================================================================

export interface VIPEvent {
  id: string;
  name: string;
  description: string;
  type: "virtual" | "in_person" | "exclusive_market" | "nft_drop" | "promotion";
  minimumTier: VIPTier;
  startTime: Date;
  endTime: Date;
  location?: string;
  virtualLink?: string;
  maxAttendees?: number;
  currentAttendees: number;
  rewards?: VIPEventReward[];
  status: "upcoming" | "active" | "completed" | "cancelled";
  createdAt: Date;
}

export interface VIPEventReward {
  type: "points" | "cashback_boost" | "free_bets" | "merchandise" | "nft";
  amount?: number;
  description: string;
  itemId?: string;
}

export interface VIPEventRegistration {
  id: string;
  eventId: string;
  userId: string;
  userTier: VIPTier;
  status: "registered" | "attended" | "no_show" | "cancelled";
  registeredAt: Date;
  attendedAt?: Date;
  rewardsGranted: VIPEventReward[];
}

// ============================================================================
// Service Types
// ============================================================================

export interface CalculateTierParams {
  userId: string;
  volume: number;
  forceRecalculate?: boolean;
}

export interface UpgradeTierParams {
  userId: string;
  newTier: VIPTier;
  reason: "volume_threshold" | "manual_adjustment" | "promo";
  adminId?: string;
  notes?: string;
}

export interface ProcessCashbackParams {
  userId: string;
  tradeId: string;
  tradingVolume: number;
}

export interface GetVIPStatusParams {
  userId: string;
  includeHistory?: boolean;
}

export interface GetCashbackHistoryParams {
  userId: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface RegisterForEventParams {
  userId: string;
  eventId: string;
}

// ============================================================================
// Tier Definitions (Static Config)
// ============================================================================

export const VIP_TIER_CONFIGS: Record<VIPTier, VIPTierConfig> = {
  bronze: {
    tier: "bronze",
    name: "Bronze",
    volumeThreshold: 0,
    cashbackPercent: 0.5,
    color: "#CD7F32",
    icon: "bronze-badge",
    benefits: {
      cashbackPercent: 0.5,
      feeDiscount: 0,
      maxDailyWithdrawal: 5000,
      withdrawalPriority: "standard",
      withdrawalFeeWaivers: 0,
      supportLevel: "community",
      dedicatedManager: false,
      responseTimeHours: 48,
      maxPositionSize: 10000,
      advancedOrderTypes: false,
      apiRateLimit: 100,
      exclusivePromos: false,
      earlyAccess: false,
      vipEvents: false,
      nftDrops: false,
      betaFeatures: false,
      verifiedBadge: false,
      profileHighlight: false,
      customEmojis: false,
      pointsMultiplier: 1.0,
      bonusInsuranceCredits: 0,
    },
  },
  silver: {
    tier: "silver",
    name: "Silver",
    volumeThreshold: 1000,
    cashbackPercent: 1.0,
    color: "#C0C0C0",
    icon: "silver-badge",
    benefits: {
      cashbackPercent: 1.0,
      feeDiscount: 0.1,
      maxDailyWithdrawal: 10000,
      withdrawalPriority: "fast",
      withdrawalFeeWaivers: 2,
      supportLevel: "email",
      dedicatedManager: false,
      responseTimeHours: 24,
      maxPositionSize: 25000,
      advancedOrderTypes: true,
      apiRateLimit: 200,
      exclusivePromos: false,
      earlyAccess: false,
      vipEvents: false,
      nftDrops: false,
      betaFeatures: false,
      verifiedBadge: false,
      profileHighlight: false,
      customEmojis: false,
      pointsMultiplier: 1.1,
      bonusInsuranceCredits: 1,
    },
  },
  gold: {
    tier: "gold",
    name: "Gold",
    volumeThreshold: 5000,
    cashbackPercent: 1.5,
    color: "#FFD700",
    icon: "gold-badge",
    benefits: {
      cashbackPercent: 1.5,
      feeDiscount: 0.2,
      maxDailyWithdrawal: 25000,
      withdrawalPriority: "fast",
      withdrawalFeeWaivers: 4,
      supportLevel: "priority",
      dedicatedManager: false,
      responseTimeHours: 12,
      maxPositionSize: 50000,
      advancedOrderTypes: true,
      apiRateLimit: 500,
      exclusivePromos: true,
      earlyAccess: false,
      vipEvents: false,
      nftDrops: false,
      betaFeatures: true,
      verifiedBadge: true,
      profileHighlight: false,
      customEmojis: false,
      pointsMultiplier: 1.25,
      bonusInsuranceCredits: 2,
    },
  },
  platinum: {
    tier: "platinum",
    name: "Platinum",
    volumeThreshold: 25000,
    cashbackPercent: 2.0,
    color: "#E5E4E2",
    icon: "platinum-badge",
    benefits: {
      cashbackPercent: 2.0,
      feeDiscount: 0.3,
      maxDailyWithdrawal: 50000,
      withdrawalPriority: "instant",
      withdrawalFeeWaivers: 8,
      supportLevel: "priority",
      dedicatedManager: false,
      responseTimeHours: 4,
      maxPositionSize: 100000,
      advancedOrderTypes: true,
      apiRateLimit: 1000,
      exclusivePromos: true,
      earlyAccess: true,
      vipEvents: true,
      nftDrops: false,
      betaFeatures: true,
      verifiedBadge: true,
      profileHighlight: true,
      customEmojis: true,
      pointsMultiplier: 1.5,
      bonusInsuranceCredits: 5,
    },
  },
  diamond: {
    tier: "diamond",
    name: "Diamond",
    volumeThreshold: 100000,
    cashbackPercent: 3.0,
    color: "#B9F2FF",
    icon: "diamond-badge",
    benefits: {
      cashbackPercent: 3.0,
      feeDiscount: 0.4,
      maxDailyWithdrawal: 100000,
      withdrawalPriority: "instant",
      withdrawalFeeWaivers: 16,
      supportLevel: "dedicated",
      dedicatedManager: true,
      responseTimeHours: 1,
      maxPositionSize: 250000,
      advancedOrderTypes: true,
      apiRateLimit: 2000,
      exclusivePromos: true,
      earlyAccess: true,
      vipEvents: true,
      nftDrops: true,
      betaFeatures: true,
      verifiedBadge: true,
      profileHighlight: true,
      customEmojis: true,
      pointsMultiplier: 2.0,
      bonusInsuranceCredits: 10,
    },
  },
  black: {
    tier: "black",
    name: "Black",
    volumeThreshold: 500000,
    cashbackPercent: 5.0,
    color: "#1A1A1A",
    icon: "black-badge",
    benefits: {
      cashbackPercent: 5.0,
      feeDiscount: 0.5,
      maxDailyWithdrawal: 500000,
      withdrawalPriority: "instant",
      withdrawalFeeWaivers: -1, // unlimited
      supportLevel: "concierge",
      dedicatedManager: true,
      responseTimeHours: 0.5,
      maxPositionSize: 1000000,
      advancedOrderTypes: true,
      apiRateLimit: 5000,
      exclusivePromos: true,
      earlyAccess: true,
      vipEvents: true,
      nftDrops: true,
      betaFeatures: true,
      verifiedBadge: true,
      profileHighlight: true,
      customEmojis: true,
      pointsMultiplier: 3.0,
      bonusInsuranceCredits: 25,
    },
  },
};

// Ordered tiers for comparison
export const VIP_TIER_ORDER: VIPTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "black",
];
