/**
 * Copy Trading Types
 *
 * Types for the copy trading system that allows users to follow
 * and automatically copy successful traders.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const CopyModeSchema = z.enum([
  "fixed_amount",         // Copy with fixed amount per trade
  "percentage_portfolio", // Copy as percentage of portfolio
  "proportional",         // Copy proportionally to leader's size
  "fixed_ratio",          // Fixed multiplier of leader's size
]);

export type CopyMode = z.infer<typeof CopyModeSchema>;

export const CopyStatusSchema = z.enum([
  "pending",              // Awaiting approval/setup
  "active",               // Actively copying
  "paused",               // Temporarily paused
  "stopped",              // Manually stopped
  "expired",              // Subscription expired
  "suspended",            // Suspended for risk/compliance
]);

export type CopyStatus = z.infer<typeof CopyStatusSchema>;

export const TraderTierSchema = z.enum([
  "rising_star",          // New traders with potential
  "established",          // Proven track record
  "expert",               // High-performance traders
  "elite",                // Top-tier traders
  "legend",               // Best of the best
]);

export type TraderTier = z.infer<typeof TraderTierSchema>;

// ============================================================================
// TRADER PROFILE
// ============================================================================

/**
 * Copy Trading Profile - trader's public profile for copy trading
 */
export interface CopyTradingProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;

  // Status
  isAcceptingCopiers: boolean;
  tier: TraderTier;
  verifiedAt?: number;

  // Fees
  performanceFee: number;         // Percentage of profits
  subscriptionFee?: number;       // Monthly fee
  minCopyAmount: number;
  maxCopiers?: number;

  // Stats (summary)
  totalCopiers: number;
  totalAUM: number;               // Assets under management (copied)
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgReturn: number;              // Average return per trade

  // Social
  followers: number;
  rating: number;                 // Out of 5
  reviewCount: number;

  // Trading style
  tradingStyle: string[];         // ["swing", "scalp", "long_term"]
  preferredMarkets: string[];     // ["sports", "crypto", "politics"]
  riskLevel: "low" | "medium" | "high";
  avgHoldingTime: string;         // "1-4 hours", "1-7 days", etc.

  // Performance (rolling)
  return30d: number;
  return90d: number;
  return1y: number;
  returnAllTime: number;
  maxDrawdown: number;

  createdAt: number;
  updatedAt: number;
}

/**
 * Trader Performance - detailed performance metrics
 */
export interface TraderPerformance {
  userId: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";

  // Returns
  absoluteReturn: number;
  percentageReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;

  // Trade stats
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;

  // Risk metrics
  maxDrawdown: number;
  avgDrawdown: number;
  volatility: number;
  beta: number;

  // Consistency
  profitableDays: number;
  profitableWeeks: number;
  profitableMonths: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  currentStreakType: "win" | "loss";

  // Copier metrics
  copierPnL: number;              // Total PnL of copiers
  copierWinRate: number;          // Win rate for copied trades

  calculatedAt: number;
}

// ============================================================================
// COPY SUBSCRIPTION
// ============================================================================

/**
 * Copy Subscription - follower's subscription to copy a trader
 */
export interface CopySubscription {
  id: string;
  copierId: string;
  traderId: string;

  // Status
  status: CopyStatus;

  // Copy settings
  copyMode: CopyMode;
  fixedAmount?: number;           // For fixed_amount mode
  portfolioPercentage?: number;   // For percentage_portfolio mode
  copyRatio?: number;             // For proportional/fixed_ratio mode

  // Risk controls
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTotalExposure: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;

  // Filters
  copyAssetClasses: string[];     // ["sports", "crypto", "prediction"]
  excludedMarkets: string[];
  minOdds?: number;
  maxOdds?: number;

  // Timing
  copyDelaySeconds: number;       // Delay before copying
  maxAgeSeconds?: number;         // Max age of trade to copy

  // Performance
  totalCopiedTrades: number;
  successfulCopies: number;
  failedCopies: number;
  totalPnL: number;
  totalFeePaid: number;

  // Capital
  allocatedCapital: number;
  currentValue: number;

  // Timestamps
  subscribedAt: number;
  lastCopyAt?: number;
  pausedAt?: number;
  cancelledAt?: number;
  expiresAt?: number;
}

/**
 * Copy Trade - individual copied trade
 */
export interface CopyTrade {
  id: string;
  subscriptionId: string;
  copierId: string;
  traderId: string;

  // Original trade reference
  originalTradeId: string;
  originalAmount: number;
  originalOdds: number;

  // Copied trade details
  copiedAmount: number;
  copiedOdds: number;
  marketId: string;
  marketTitle: string;
  side: "yes" | "no" | "buy" | "sell";

  // Status
  status: "pending" | "executed" | "partial" | "failed" | "cancelled";
  failureReason?: string;

  // Execution
  executedAt?: number;
  executionPrice?: number;
  slippage?: number;

  // Result
  result?: "win" | "loss" | "push" | "pending";
  pnl?: number;
  pnlPercent?: number;

  // Fees
  feeAmount?: number;
  feePercent?: number;

  // Timing
  copyDelay: number;              // Actual delay in ms
  createdAt: number;
  settledAt?: number;
}

// ============================================================================
// COPIER/LEADER RELATIONSHIP
// ============================================================================

export interface CopierInfo {
  id: string;
  subscriptionId: string;
  copierId: string;
  copierUsername: string;
  allocatedCapital: number;
  currentValue: number;
  totalPnL: number;
  totalFeesPaid: number;
  tradesCopied: number;
  status: CopyStatus;
  joinedAt: number;
}

export interface LeaderInfo {
  id: string;
  subscriptionId: string;
  traderId: string;
  traderUsername: string;
  profile: CopyTradingProfile;
  allocatedCapital: number;
  currentValue: number;
  totalPnL: number;
  totalFeesPaid: number;
  tradesCopied: number;
  status: CopyStatus;
  followedAt: number;
}

// ============================================================================
// REVIEWS & RATINGS
// ============================================================================

export interface TraderReview {
  id: string;
  traderId: string;
  reviewerId: string;
  reviewerUsername: string;

  rating: number;                 // 1-5
  title?: string;
  content: string;

  // Review metadata
  periodCopied: number;           // Days copied before review
  pnlDuringPeriod: number;
  tradesCopied: number;

  // Status
  isVerified: boolean;            // Verified copier
  isHelpful: number;              // Helpful votes
  isReported: boolean;

  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const CreateSubscriptionSchema = z.object({
  traderId: z.string(),
  copyMode: CopyModeSchema,
  fixedAmount: z.number().positive().optional(),
  portfolioPercentage: z.number().min(1).max(100).optional(),
  copyRatio: z.number().positive().optional(),
  maxPositionSize: z.number().positive(),
  maxDailyLoss: z.number().positive(),
  maxTotalExposure: z.number().positive(),
  stopLossPercent: z.number().positive().optional(),
  takeProfitPercent: z.number().positive().optional(),
  copyAssetClasses: z.array(z.string()).min(1),
  excludedMarkets: z.array(z.string()).optional().default([]),
  copyDelaySeconds: z.number().min(0).max(300).default(0),
  allocatedCapital: z.number().positive(),
});

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;

export const UpdateSubscriptionSchema = CreateSubscriptionSchema.partial().omit({
  traderId: true,
});

export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>;

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
  isAcceptingCopiers: z.boolean().optional(),
  performanceFee: z.number().min(0).max(50).optional(),
  subscriptionFee: z.number().min(0).optional(),
  minCopyAmount: z.number().positive().optional(),
  maxCopiers: z.number().positive().optional(),
  tradingStyle: z.array(z.string()).optional(),
  preferredMarkets: z.array(z.string()).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const CreateReviewSchema = z.object({
  traderId: z.string(),
  rating: z.number().min(1).max(5),
  title: z.string().max(100).optional(),
  content: z.string().min(10).max(2000),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
