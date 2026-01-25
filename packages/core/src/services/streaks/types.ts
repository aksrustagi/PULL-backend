/**
 * Streak Multipliers Types
 * Consecutive win tracking with escalating multipliers
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const MIN_MULTIPLIER = 1.0;
export const MAX_MULTIPLIER = 3.0;
export const BASE_STREAK_THRESHOLD = 3; // Wins needed to start multiplier

export const StreakTypeSchema = z.enum([
  "win",              // Consecutive wins
  "category",         // Wins in specific category
  "odds_range",       // Wins at specific odds
  "daily",            // Daily win streak
  "weekly",           // Weekly performance streak
  "perfect_day",      // All wins in a day
]);

export type StreakType = z.infer<typeof StreakTypeSchema>;

export const StreakStatusSchema = z.enum([
  "active",           // Currently running
  "broken",           // Streak ended
  "paused",           // Protected/paused
  "completed",        // Milestone reached
]);

export type StreakStatus = z.infer<typeof StreakStatusSchema>;

export const ProtectionTypeSchema = z.enum([
  "single_loss",      // Protects against one loss
  "two_loss",         // Protects against two losses
  "time_based",       // Protects for X hours
  "insurance",        // Partial protection (refund %)
]);

export type ProtectionType = z.infer<typeof ProtectionTypeSchema>;

export const MilestoneTypeSchema = z.enum([
  "streak_3",         // 3 win streak
  "streak_5",         // 5 win streak
  "streak_10",        // 10 win streak
  "streak_20",        // 20 win streak
  "streak_50",        // 50 win streak
  "streak_100",       // 100 win streak (legendary)
  "multiplier_2x",    // Reached 2x multiplier
  "multiplier_3x",    // Reached max multiplier
  "weekly_7",         // 7 wins in a week
  "perfect_week",     // 7/7 wins
]);

export type MilestoneType = z.infer<typeof MilestoneTypeSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface UserStreak {
  id: string;
  userId: string;
  type: StreakType;
  status: StreakStatus;

  // Current streak stats
  currentStreak: number;
  longestStreak: number;
  currentMultiplier: number;

  // Bet tracking
  streakBetIds: string[];
  totalStreakWinnings: number;
  totalMultiplierBonus: number;

  // Category-specific
  category?: string;
  oddsRange?: { min: number; max: number };

  // Protection
  isProtected: boolean;
  protection?: StreakProtection;

  // Timestamps
  startedAt: number;
  lastWinAt?: number;
  brokenAt?: number;
  updatedAt: number;
}

export interface StreakProtection {
  id: string;
  streakId: string;
  userId: string;
  type: ProtectionType;

  // Protection details
  usesRemaining: number;
  maxUses: number;
  refundPercent?: number; // For insurance type
  expiresAt?: number;

  // Cost
  purchasePrice: number;
  purchasedAt: number;

  // Usage
  usedCount: number;
  savedStreaks: number;
  lastUsedAt?: number;
}

export interface MultiplierTier {
  streakLength: number;
  multiplier: number;
  name: string;
  color: string;
  icon: string;
}

export interface StreakMilestone {
  id: string;
  userId: string;
  streakId: string;
  type: MilestoneType;
  streakLength: number;
  multiplier: number;

  // Rewards
  rewards: MilestoneReward[];
  claimed: boolean;
  claimedAt?: number;

  achievedAt: number;
}

export interface MilestoneReward {
  type: "cash" | "bonus" | "protection" | "badge" | "multiplier_boost";
  value: number;
  description: string;
}

export interface StreakLeaderboardEntry {
  rank: number;
  userId: string;
  username?: string;
  avatarUrl?: string;
  currentStreak: number;
  longestStreak: number;
  currentMultiplier: number;
  totalBonusEarned: number;
}

// ============================================================================
// MULTIPLIER TIERS
// ============================================================================

export const MULTIPLIER_TIERS: MultiplierTier[] = [
  { streakLength: 0, multiplier: 1.0, name: "Base", color: "#6B7280", icon: "fire" },
  { streakLength: 3, multiplier: 1.1, name: "Heating Up", color: "#F59E0B", icon: "fire" },
  { streakLength: 5, multiplier: 1.25, name: "On Fire", color: "#EF4444", icon: "fire" },
  { streakLength: 7, multiplier: 1.5, name: "Blazing", color: "#DC2626", icon: "fire" },
  { streakLength: 10, multiplier: 1.75, name: "Inferno", color: "#B91C1C", icon: "flame" },
  { streakLength: 15, multiplier: 2.0, name: "Legendary", color: "#7C3AED", icon: "crown" },
  { streakLength: 20, multiplier: 2.25, name: "Mythic", color: "#6D28D9", icon: "crown" },
  { streakLength: 30, multiplier: 2.5, name: "Godlike", color: "#4C1D95", icon: "star" },
  { streakLength: 50, multiplier: 2.75, name: "Immortal", color: "#1F2937", icon: "star" },
  { streakLength: 100, multiplier: 3.0, name: "GOAT", color: "#FFD700", icon: "trophy" },
];

// ============================================================================
// PROTECTION PRICING
// ============================================================================

export interface ProtectionPricing {
  type: ProtectionType;
  basePrice: number;
  pricePerStreakLevel: number;
  description: string;
}

export const PROTECTION_PRICING: ProtectionPricing[] = [
  {
    type: "single_loss",
    basePrice: 5,
    pricePerStreakLevel: 1,
    description: "Protects your streak from one loss",
  },
  {
    type: "two_loss",
    basePrice: 12,
    pricePerStreakLevel: 2,
    description: "Protects your streak from two losses",
  },
  {
    type: "time_based",
    basePrice: 8,
    pricePerStreakLevel: 1.5,
    description: "Protects your streak for 24 hours",
  },
  {
    type: "insurance",
    basePrice: 3,
    pricePerStreakLevel: 0.5,
    description: "Refunds 50% of your stake on a loss",
  },
];

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export const GetStreakRequestSchema = z.object({
  type: StreakTypeSchema.optional(),
  category: z.string().optional(),
});

export type GetStreakRequest = z.infer<typeof GetStreakRequestSchema>;

export interface GetStreakResponse {
  streak: UserStreak;
  currentTier: MultiplierTier;
  nextTier: MultiplierTier | null;
  winsToNextTier: number;
  availableMilestones: StreakMilestone[];
}

export const RecordBetResultRequestSchema = z.object({
  betId: z.string(),
  outcome: z.enum(["won", "lost", "push", "void"]),
  winnings: z.number().optional(),
  category: z.string().optional(),
  odds: z.number().optional(),
});

export type RecordBetResultRequest = z.infer<typeof RecordBetResultRequestSchema>;

export interface RecordBetResultResponse {
  streak: UserStreak;
  multiplierApplied: number;
  bonusAmount: number;
  milestoneAchieved?: StreakMilestone;
  protectionUsed: boolean;
  streakBroken: boolean;
}

export const PurchaseProtectionRequestSchema = z.object({
  streakId: z.string(),
  type: ProtectionTypeSchema,
});

export type PurchaseProtectionRequest = z.infer<typeof PurchaseProtectionRequestSchema>;

export interface PurchaseProtectionResponse {
  protection: StreakProtection;
  price: number;
  streak: UserStreak;
}

export const ClaimMilestoneRequestSchema = z.object({
  milestoneId: z.string(),
});

export type ClaimMilestoneRequest = z.infer<typeof ClaimMilestoneRequestSchema>;

export interface ClaimMilestoneResponse {
  milestone: StreakMilestone;
  rewards: MilestoneReward[];
  totalValue: number;
}

export const GetLeaderboardRequestSchema = z.object({
  type: StreakTypeSchema.optional(),
  period: z.enum(["daily", "weekly", "monthly", "all_time"]).default("all_time"),
  limit: z.number().min(1).max(100).default(50),
});

export type GetLeaderboardRequest = z.infer<typeof GetLeaderboardRequestSchema>;

export interface GetLeaderboardResponse {
  entries: StreakLeaderboardEntry[];
  userRank?: number;
  userEntry?: StreakLeaderboardEntry;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type StreakEvent =
  | { type: "streak_started"; streak: UserStreak }
  | { type: "streak_extended"; streak: UserStreak; newLength: number }
  | { type: "multiplier_increased"; streak: UserStreak; oldMultiplier: number; newMultiplier: number }
  | { type: "milestone_achieved"; milestone: StreakMilestone }
  | { type: "streak_protected"; streak: UserStreak; protection: StreakProtection }
  | { type: "streak_broken"; streak: UserStreak; finalLength: number }
  | { type: "protection_used"; streak: UserStreak; protection: StreakProtection };

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface StreakAnalytics {
  userId: string;
  totalStreaks: number;
  activeStreaks: number;
  brokenStreaks: number;
  averageStreakLength: number;
  longestStreak: number;
  totalBonusEarned: number;
  totalProtectionsPurchased: number;
  protectionsUsed: number;
  protectionsSaved: number; // Value of streaks saved
  milestonesAchieved: number;
  favoriteCategory?: string;
}

export interface GlobalStreakStats {
  activeStreaks: number;
  totalBonusesPaidToday: number;
  longestActiveStreak: number;
  averageStreakLength: number;
  topStreakers: StreakLeaderboardEntry[];
}
