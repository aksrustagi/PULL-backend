/**
 * Token & Rewards Types for PULL Super App
 * Covers points, rewards, staking, and $PULL token
 */

/** Points transaction types */
export type PointsTransactionType =
  | "earn_trading"
  | "earn_referral"
  | "earn_streak"
  | "earn_achievement"
  | "earn_challenge"
  | "earn_bonus"
  | "earn_airdrop"
  | "redeem_reward"
  | "redeem_sweepstakes"
  | "transfer_out"
  | "transfer_in"
  | "expire"
  | "adjustment"
  | "bridge_to_token";

/** Points transaction status */
export type PointsTransactionStatus = "pending" | "completed" | "failed" | "reversed";

/** Points transaction record */
export interface PointsTransaction {
  id: string;
  userId: string;
  type: PointsTransactionType;
  amount: number;
  balance: number;
  status: PointsTransactionStatus;
  description: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

/** User points balance */
export interface PointsBalance {
  userId: string;
  available: number;
  pending: number;
  lifetime: number;
  expiringSoon: number;
  expiringAt?: Date;
  tier: RewardTier;
  tierProgress: number;
  nextTierAt?: number;
  streakDays: number;
  lastStreakAt?: Date;
  updatedAt: Date;
}

/** Reward tiers */
export type RewardTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

/** Tier configuration */
export interface TierConfig {
  tier: RewardTier;
  minPoints: number;
  maxPoints?: number;
  multiplier: number;
  benefits: TierBenefit[];
  color: string;
  icon: string;
}

/** Tier benefits */
export interface TierBenefit {
  id: string;
  name: string;
  description: string;
  value?: string;
}

/** Available reward */
export interface Reward {
  id: string;
  name: string;
  description: string;
  category: RewardCategory;
  type: RewardType;
  pointsCost: number;
  cashValue?: number;
  stock?: number;
  maxPerUser?: number;
  minTier?: RewardTier;
  imageUrl?: string;
  terms?: string;
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  createdAt: Date;
}

/** Reward categories */
export type RewardCategory =
  | "cash"
  | "crypto"
  | "merchandise"
  | "experience"
  | "trading_bonus"
  | "fee_discount"
  | "nft"
  | "partner"
  | "sweepstakes";

/** Reward types */
export type RewardType =
  | "instant"
  | "physical"
  | "digital"
  | "credit"
  | "entry";

/** Reward redemption */
export interface Redemption {
  id: string;
  userId: string;
  rewardId: string;
  rewardName: string;
  pointsSpent: number;
  quantity: number;
  status: RedemptionStatus;
  fulfillmentType: FulfillmentType;
  fulfillmentDetails?: FulfillmentDetails;
  shippingAddress?: ShippingAddress;
  trackingNumber?: string;
  notes?: string;
  redeemedAt: Date;
  fulfilledAt?: Date;
  expiresAt?: Date;
}

/** Redemption status */
export type RedemptionStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "failed";

/** Fulfillment type */
export type FulfillmentType = "digital" | "physical" | "credit" | "manual";

/** Fulfillment details */
export interface FulfillmentDetails {
  code?: string;
  url?: string;
  instructions?: string;
  expiresAt?: Date;
}

/** Shipping address */
export interface ShippingAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

/** Sweepstakes entry */
export interface SweepstakesEntry {
  id: string;
  userId: string;
  sweepstakesId: string;
  entries: number;
  pointsSpent: number;
  isWinner: boolean;
  prizeWon?: string;
  enteredAt: Date;
}

/** Sweepstakes */
export interface Sweepstakes {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  prizes: SweepstakesPrize[];
  pointsPerEntry: number;
  maxEntriesPerUser?: number;
  totalEntries: number;
  startDate: Date;
  endDate: Date;
  drawDate: Date;
  status: "upcoming" | "active" | "drawing" | "completed" | "cancelled";
  winners?: SweepstakesWinner[];
  rules?: string;
  createdAt: Date;
}

/** Sweepstakes prize */
export interface SweepstakesPrize {
  id: string;
  name: string;
  description: string;
  value: number;
  quantity: number;
  imageUrl?: string;
}

/** Sweepstakes winner */
export interface SweepstakesWinner {
  userId: string;
  prizeId: string;
  prizeName: string;
  entryId: string;
  wonAt: Date;
  claimed: boolean;
  claimedAt?: Date;
}

/** Token balance */
export interface TokenBalance {
  userId: string;
  walletAddress: string;
  balance: number;
  stakedBalance: number;
  vestedBalance: number;
  claimableBalance: number;
  totalEarned: number;
  totalBridged: number;
  updatedAt: Date;
}

/** Token transaction */
export interface TokenTransaction {
  id: string;
  userId: string;
  walletAddress: string;
  type: TokenTransactionType;
  amount: number;
  txHash?: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  gasUsed?: number;
  fee?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  confirmedAt?: Date;
}

/** Token transaction types */
export type TokenTransactionType =
  | "bridge_in"
  | "bridge_out"
  | "stake"
  | "unstake"
  | "claim_rewards"
  | "vest"
  | "unvest"
  | "transfer_in"
  | "transfer_out"
  | "airdrop";

/** Staking position */
export interface StakingPosition {
  id: string;
  userId: string;
  walletAddress: string;
  poolId: string;
  poolName: string;
  stakedAmount: number;
  shares: number;
  rewards: number;
  claimableRewards: number;
  apy: number;
  lockPeriod?: number;
  lockedUntil?: Date;
  autoCompound: boolean;
  stakedAt: Date;
  lastClaimAt?: Date;
  updatedAt: Date;
}

/** Staking pool */
export interface StakingPool {
  id: string;
  name: string;
  description: string;
  tokenAddress: string;
  rewardTokenAddress: string;
  totalStaked: number;
  totalRewards: number;
  apy: number;
  minStake: number;
  maxStake?: number;
  lockPeriod?: number;
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
}

/** Vesting schedule */
export interface VestingSchedule {
  id: string;
  userId: string;
  walletAddress: string;
  totalAmount: number;
  claimedAmount: number;
  remainingAmount: number;
  startDate: Date;
  endDate: Date;
  cliffDate?: Date;
  vestingPeriod: "linear" | "cliff" | "milestone";
  milestones?: VestingMilestone[];
  nextUnlockAt?: Date;
  nextUnlockAmount?: number;
  createdAt: Date;
}

/** Vesting milestone */
export interface VestingMilestone {
  id: string;
  date: Date;
  amount: number;
  percentage: number;
  claimed: boolean;
  claimedAt?: Date;
}

/** Achievement */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  imageUrl?: string;
  pointsReward: number;
  tokenReward?: number;
  requirement: AchievementRequirement;
  isSecret: boolean;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  createdAt: Date;
}

/** Achievement categories */
export type AchievementCategory =
  | "trading"
  | "social"
  | "streak"
  | "milestone"
  | "special"
  | "referral";

/** Achievement requirement */
export interface AchievementRequirement {
  type: string;
  target: number;
  current?: number;
  metadata?: Record<string, unknown>;
}

/** User achievement */
export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  achievement: Achievement;
  progress: number;
  isCompleted: boolean;
  completedAt?: Date;
  claimedAt?: Date;
}

/** Leaderboard entry */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  score: number;
  change?: number;
  tier?: RewardTier;
}

/** Leaderboard */
export interface Leaderboard {
  id: string;
  name: string;
  type: "points" | "trading_volume" | "pnl" | "referrals" | "streak";
  period: "daily" | "weekly" | "monthly" | "alltime";
  entries: LeaderboardEntry[];
  totalParticipants: number;
  updatedAt: Date;
}

// ============================================================================
// GAMIFICATION TYPES
// ============================================================================

/** Points configuration for action types */
export interface PointsConfig {
  actionType: string;
  basePoints: number;
  description: string;
  multiplierRules?: {
    streakMultiplier?: number;
    maxMultiplier?: number;
    per?: number;
    perDollar?: boolean;
    profitMultiplier?: number;
    cap?: number;
  };
  dailyLimit?: number;
  active: boolean;
}

/** Streak types */
export type StreakType = "login" | "trading" | "prediction_correct";

/** User streak record */
export interface UserStreak {
  id: string;
  userId: string;
  streakType: StreakType | string;
  currentCount: number;
  longestCount: number;
  lastActionAt: Date;
  currentMultiplier: number;
}

/** Quest types */
export type QuestType = "daily" | "weekly" | "achievement" | "seasonal";

/** Quest requirement types */
export type QuestRequirementType =
  | "login_before"
  | "trades_count"
  | "markets_viewed"
  | "messages_sent"
  | "signals_reviewed"
  | "categories_traded"
  | "prediction_streak"
  | "followers_gained"
  | "referral_kyc"
  | "trade_volume";

/** Quest requirement */
export interface QuestRequirement {
  type: QuestRequirementType | string;
  target?: number;
  hour?: number;
  [key: string]: unknown;
}

/** Quest progress */
export interface QuestProgress {
  current?: number;
  completed?: number;
  [key: string]: unknown;
}

/** Quest definition */
export interface Quest {
  id: string;
  questId: string;
  title: string;
  description: string;
  type: QuestType;
  requirements: QuestRequirement;
  pointsReward: number;
  bonusReward?: {
    type: string;
    name: string;
    [key: string]: unknown;
  };
  startsAt?: Date;
  expiresAt?: Date;
  maxCompletions?: number;
  active: boolean;
}

/** User quest progress */
export interface UserQuest {
  id: string;
  oderId: string;
  questId: string;
  quest: Quest;
  progress: QuestProgress;
  completed: boolean;
  claimed: boolean;
  startedAt: Date;
  completedAt?: Date;
  claimedAt?: Date;
}

/** Tier benefit configuration */
export interface TierBenefitConfig {
  threshold: number;
  feeDiscount: number;
  aiCredits: number;
  copyTrading: boolean;
  prioritySupport: boolean;
  revenueShare: number;
  pointsMultiplier: number;
  color: string;
  icon: string;
}

/** User tier record */
export interface UserTier {
  id: string;
  userId: string;
  currentTier: RewardTier;
  lifetimePoints: number;
  currentMonthPoints: number;
  tierAchievedAt: Date;
  tierExpiresAt?: Date;
  benefits: TierBenefitConfig;
  lastActivityAt: Date;
}

/** Achievement rarity */
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

/** Achievement requirement */
export interface AchievementRequirementDef {
  type: string;
  target?: number;
  minTrades?: number;
  mustBeWinning?: boolean;
  daysFromLaunch?: number;
  [key: string]: unknown;
}

/** Achievement definition */
export interface AchievementDef {
  id: string;
  achievementId: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  requirement: AchievementRequirementDef;
  rarity: AchievementRarity;
  pointsReward: number;
  tokenReward?: number;
  isSecret?: boolean;
  active: boolean;
}

/** User achievement unlock */
export interface UserAchievementUnlock {
  id: string;
  userId: string;
  achievementId: string;
  achievement: AchievementDef;
  unlockedAt: Date;
  displayed: boolean;
  progress?: Record<string, number>;
  claimedAt?: Date;
}

/** Daily action count for velocity limits */
export interface DailyActionCount {
  id: string;
  userId: string;
  actionType: string;
  date: string;
  count: number;
  lastActionAt: Date;
}

/** Anti-gaming flag severity */
export type AntiGamingFlagSeverity = "low" | "medium" | "high" | "critical";

/** Anti-gaming flag */
export interface AntiGamingFlag {
  id: string;
  userId: string;
  flagType: string;
  severity: AntiGamingFlagSeverity;
  description: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

/** Rewards summary for dashboard */
export interface RewardsSummary {
  pointsBalance: number;
  pendingPoints: number;
  lifetimePoints: number;
  currentTier: RewardTier;
  tierProgress: number;
  pointsToNextTier: number;
  nextTier: RewardTier | null;
  tierBenefits: TierBenefitConfig;
  activeStreaks: Array<{
    type: string;
    count: number;
    multiplier: number;
    longestCount: number;
    lastActionAt: number;
  }>;
  recentEarnings: number;
  currentMonthPoints: number;
  decayWarning?: {
    daysUntilDecay: number;
    decayPercent: number;
  } | null;
}

/** Points earning result */
export interface PointsEarningResult {
  success: boolean;
  pointsEarned: number;
  basePoints: number;
  multiplier: number;
  newBalance: number;
  streakBonus: boolean;
  tierBonus: boolean;
  achievementsUnlocked: string[];
  questsUpdated: string[];
  errorMessage?: string;
}

/** Redemption type */
export type RedemptionType = "fee_discount" | "token_conversion" | "sweepstakes" | "item";

/** Redemption request */
export interface RedemptionRequest {
  type: RedemptionType;
  amount: number;
  itemId?: string;
  walletAddress?: string;
  shippingAddress?: ShippingAddress;
}

/** Redemption result */
export interface RedemptionResult {
  redemptionId: string;
  type: RedemptionType;
  pointsSpent: number;
  newBalance: number;
  status: "pending" | "processing" | "completed" | "failed";
  details?: {
    tokensToReceive?: number;
    walletAddress?: string;
    estimatedTime?: string;
    discountPercent?: number;
    validUntil?: number;
    entries?: number;
  };
}

/** Shop item */
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: RedemptionType;
  value?: number;
  stock?: number;
  available: boolean;
  minTier?: RewardTier;
  requiresShipping?: boolean;
  imageUrl?: string;
  rate?: number;
  minAmount?: number;
  entriesPerPurchase?: number;
  drawDate?: number;
  totalEntries?: number;
}
