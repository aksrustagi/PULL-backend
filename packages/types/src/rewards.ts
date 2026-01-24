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
// ADVANCED POINTS ECONOMY TYPES
// ============================================================================

/** Points Config - Action configuration */
export interface PointsConfig {
  id: string;
  actionType: PointsActionType;
  basePoints: number;
  description: string;
  category: PointsCategory;
  multipliers: MultiplierConfig;
  conditions?: PointsConditions;
  cooldownSeconds: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Points action types */
export type PointsActionType =
  | "daily_login"
  | "trade_executed"
  | "deposit"
  | "withdrawal"
  | "referral_signup"
  | "referral_trade"
  | "referral_deposit"
  | "rwa_purchase"
  | "rwa_sale"
  | "prediction_win"
  | "prediction_trade"
  | "email_connected"
  | "profile_completed"
  | "kyc_upgraded"
  | "streak_bonus"
  | "quest_completed"
  | "achievement_unlocked"
  | "competition_win"
  | "social_share"
  | "feedback_submitted";

/** Points category */
export type PointsCategory =
  | "trading"
  | "social"
  | "engagement"
  | "milestone"
  | "referral"
  | "special";

/** Multiplier configuration */
export interface MultiplierConfig {
  tierBonus: boolean;
  streakBonus: boolean;
  volumeBonus: boolean;
  seasonalBonus: boolean;
}

/** Points earning conditions */
export interface PointsConditions {
  minAmount?: number;
  maxDaily?: number;
  requiresKyc?: boolean;
  requiredTier?: RewardTier;
}

/** Streak types */
export type StreakType =
  | "daily_login"
  | "daily_trade"
  | "weekly_deposit"
  | "prediction_win"
  | "rwa_purchase";

/** User streak */
export interface UserStreak {
  id: string;
  userId: string;
  streakType: StreakType;
  currentCount: number;
  longestCount: number;
  lastActionAt: Date;
  lastActionDate: string;
  multiplierActive: boolean;
  multiplierExpiresAt?: Date;
  frozenUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Streak update result */
export interface StreakUpdateResult {
  streakId: string;
  currentCount: number;
  wasReset: boolean;
  isNewRecord: boolean;
  bonusPoints?: number;
}

/** Quest definition */
export interface QuestDefinition {
  id: string;
  questId: string;
  name: string;
  description: string;
  category: QuestCategory;
  type: QuestType;
  targetValue: number;
  targetMetric: string;
  pointsReward: number;
  bonusMultiplier?: number;
  tokenReward?: number;
  badgeReward?: string;
  minTier?: RewardTier;
  maxCompletions?: number;
  expiresAfterHours: number;
  imageUrl?: string;
  order: number;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Quest category */
export type QuestCategory = "daily" | "weekly" | "monthly" | "special";

/** Quest type */
export type QuestType =
  | "trade_count"
  | "trade_volume"
  | "deposit"
  | "login_streak"
  | "referral"
  | "prediction_win"
  | "rwa_purchase"
  | "social_share"
  | "profile_complete"
  | "custom";

/** User quest */
export interface UserQuest {
  id: string;
  userId: string;
  questDefinitionId: string;
  questId: string;
  progress: number;
  targetValue: number;
  progressPercentage: number;
  status: QuestStatus;
  startedAt: Date;
  completedAt?: Date;
  claimedAt?: Date;
  expiresAt: Date;
  pointsEarned?: number;
  tokensEarned?: number;
  badgeEarned?: string;
  definition?: QuestDefinition;
  createdAt: Date;
  updatedAt: Date;
}

/** Quest status */
export type QuestStatus =
  | "active"
  | "completed"
  | "claimed"
  | "expired"
  | "abandoned";

/** User tier record */
export interface UserTierRecord {
  id: string;
  userId: string;
  tierLevel: RewardTier;
  lifetimePoints: number;
  currentPeriodPoints: number;
  tierAchievedAt: Date;
  tierExpiresAt?: Date;
  multiplier: number;
  benefitsUsed: TierBenefitsUsed;
  nextTier?: RewardTier;
  pointsToNextTier: number;
  previousTier?: RewardTier;
  tierDowngradeWarning: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Tier benefits usage tracking */
export interface TierBenefitsUsed {
  freeWithdrawals: number;
  prioritySupport: boolean;
  exclusiveRewards: number;
}

/** Tier thresholds */
export const TIER_THRESHOLDS: Record<RewardTier, number> = {
  bronze: 0,
  silver: 10000,
  gold: 25000,
  platinum: 50000,
  diamond: 100000,
};

/** Tier multipliers */
export const TIER_MULTIPLIERS: Record<RewardTier, number> = {
  bronze: 1.0,
  silver: 1.25,
  gold: 1.5,
  platinum: 2.0,
  diamond: 2.5,
};

/** Achievement definition */
export interface AchievementDefinition {
  id: string;
  achievementId: string;
  name: string;
  description: string;
  category: AchievementCategory;
  requirementType: string;
  requirementValue: number;
  requirementMetadata?: Record<string, unknown>;
  pointsReward: number;
  tokenReward?: number;
  badgeUrl?: string;
  imageUrl?: string;
  rarity: AchievementRarity;
  isSecret: boolean;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Achievement rarity */
export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

/** User achievement record */
export interface UserAchievementRecord {
  id: string;
  userId: string;
  achievementDefinitionId: string;
  achievementId: string;
  progress: number;
  targetValue: number;
  progressPercentage: number;
  isUnlocked: boolean;
  unlockedAt?: Date;
  claimedAt?: Date;
  pointsEarned?: number;
  tokensEarned?: number;
  definition?: AchievementDefinition;
  createdAt: Date;
  updatedAt: Date;
}

/** Competition definition */
export interface Competition {
  id: string;
  competitionId: string;
  name: string;
  description: string;
  type: CompetitionType;
  scoringType: CompetitionScoringType;
  startTime: Date;
  endTime: Date;
  resultsTime?: Date;
  prizePool: number;
  prizeDistribution: PrizeDistribution[];
  minTier?: RewardTier;
  entryFee?: number;
  maxParticipants?: number;
  participantCount: number;
  totalVolume: number;
  status: CompetitionStatus;
  imageUrl?: string;
  bannerUrl?: string;
  rules?: string;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Competition type */
export type CompetitionType =
  | "seasonal"
  | "weekly"
  | "monthly"
  | "special_event"
  | "tournament";

/** Competition scoring type */
export type CompetitionScoringType =
  | "points_earned"
  | "trading_volume"
  | "pnl"
  | "referrals"
  | "streak_days"
  | "quests_completed";

/** Competition status */
export type CompetitionStatus =
  | "upcoming"
  | "active"
  | "calculating"
  | "completed"
  | "cancelled";

/** Prize distribution */
export interface PrizeDistribution {
  rankStart: number;
  rankEnd: number;
  pointsPrize: number;
  tokenPrize?: number;
  specialPrize?: string;
}

/** Competition participant */
export interface CompetitionParticipant {
  id: string;
  competitionId: string;
  userId: string;
  score: number;
  rank?: number;
  previousRank?: number;
  rankChange?: number;
  lastActivityAt: Date;
  activityCount: number;
  prizeWon?: number;
  prizeTokens?: number;
  specialPrize?: string;
  prizeClaimed: boolean;
  prizeClaimedAt?: Date;
  isActive: boolean;
  isDisqualified: boolean;
  disqualificationReason?: string;
  joinedAt: Date;
  updatedAt: Date;
}

/** Multiplier event */
export interface MultiplierEvent {
  id: string;
  eventId: string;
  name: string;
  description: string;
  multiplierValue: number;
  appliesTo: string[];
  appliesToTiers?: RewardTier[];
  startTime: Date;
  endTime: Date;
  maxUsesPerUser?: number;
  maxTotalUses?: number;
  currentUses: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Points depreciation result */
export interface DepreciationResult {
  usersAffected: number;
  totalDepreciation: number;
  processedAt: Date;
}

/** Gamification dashboard data */
export interface GamificationDashboard {
  tier: UserTierRecord;
  streaks: UserStreak[];
  activeQuests: UserQuest[];
  recentAchievements: UserAchievementRecord[];
  activeCompetitions: Competition[];
  multiplierEvents: MultiplierEvent[];
  dailyProgress: {
    pointsEarned: number;
    questsCompleted: number;
    streaksContinued: number;
  };
}
