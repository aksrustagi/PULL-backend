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
