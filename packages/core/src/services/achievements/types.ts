/**
 * Achievement System Types
 *
 * Types for gamification achievements including unlock conditions,
 * tracking, rewards, and display.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const AchievementCategorySchema = z.enum([
  "betting",           // Betting-related achievements
  "winning",           // Win-related achievements
  "streak",            // Streak achievements
  "volume",            // Volume/amount achievements
  "social",            // Social and referral achievements
  "special",           // Special/event achievements
  "milestone",         // Account milestone achievements
  "skill",             // Skill-based achievements
  "loyalty",           // Loyalty/engagement achievements
]);

export type AchievementCategory = z.infer<typeof AchievementCategorySchema>;

export const AchievementRaritySchema = z.enum([
  "common",            // Easy to unlock
  "uncommon",          // Moderate difficulty
  "rare",              // Challenging
  "epic",              // Very challenging
  "legendary",         // Extremely rare
  "mythic",            // Near impossible
]);

export type AchievementRarity = z.infer<typeof AchievementRaritySchema>;

export const AchievementTriggerSchema = z.enum([
  "bet_placed",        // When a bet is placed
  "bet_won",           // When a bet is won
  "bet_lost",          // When a bet is lost
  "streak_updated",    // When streak changes
  "referral_complete", // When referral completes
  "deposit_made",      // When deposit is made
  "withdrawal_made",   // When withdrawal is made
  "profile_updated",   // When profile is updated
  "login",             // On login
  "daily_check",       // Daily scheduled check
  "manual",            // Manually triggered
]);

export type AchievementTrigger = z.infer<typeof AchievementTriggerSchema>;

// ============================================================================
// ACHIEVEMENT DEFINITIONS
// ============================================================================

/**
 * Achievement Definition - template for an achievement
 */
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;

  // Display
  icon: string;               // Emoji or icon name
  iconUrl?: string;           // Custom icon URL
  badgeColor: string;         // Badge background color
  animation?: string;         // Unlock animation type

  // Unlock conditions
  trigger: AchievementTrigger;
  conditions: AchievementCondition[];
  conditionLogic: "all" | "any";

  // Progress tracking
  hasProgress: boolean;
  progressTarget?: number;
  progressUnit?: string;

  // Rewards
  rewards: AchievementReward[];

  // Metadata
  isHidden: boolean;          // Hidden until unlocked
  isLimited: boolean;         // Time-limited achievement
  availableFrom?: number;     // Start timestamp
  availableUntil?: number;    // End timestamp
  maxUnlocks?: number;        // Total unlocks allowed (for limited)

  // Tiers
  hasTiers: boolean;
  tiers?: AchievementTier[];

  // Prerequisites
  prerequisites?: string[];   // Required achievement IDs

  createdAt: number;
  updatedAt: number;
}

export interface AchievementCondition {
  type: string;               // Condition type (e.g., "total_bets", "win_rate")
  operator: "eq" | "gt" | "gte" | "lt" | "lte" | "between";
  value: number | [number, number];
  timeframe?: "all_time" | "daily" | "weekly" | "monthly" | "yearly";
  filter?: Record<string, any>;  // Additional filters
}

export interface AchievementReward {
  type: "points" | "tokens" | "badge" | "title" | "multiplier" | "free_bet" | "unlock";
  value: number | string;
  duration?: number;          // For temporary rewards (in seconds)
  description: string;
}

export interface AchievementTier {
  tier: number;
  name: string;
  target: number;
  rewards: AchievementReward[];
  icon?: string;
}

// ============================================================================
// USER ACHIEVEMENTS
// ============================================================================

/**
 * User Achievement - user's progress/unlock of an achievement
 */
export interface UserAchievement {
  id: string;
  oderId: string;
  achievementId: string;

  // Status
  status: "locked" | "in_progress" | "unlocked";
  unlockedAt?: number;

  // Progress
  currentProgress: number;
  targetProgress: number;
  progressPercent: number;

  // Tiers (for tiered achievements)
  currentTier?: number;
  tierProgress?: TierProgress[];

  // Rewards
  rewardsClaimed: boolean;
  rewardsClaimedAt?: number;

  // Display
  isDisplayed: boolean;       // Shown on profile
  displayOrder?: number;

  // Tracking
  firstProgressAt?: number;
  lastProgressAt?: number;
  progressHistory: ProgressEntry[];

  createdAt: number;
  updatedAt: number;
}

export interface TierProgress {
  tier: number;
  progress: number;
  target: number;
  unlocked: boolean;
  unlockedAt?: number;
  rewardsClaimed: boolean;
}

export interface ProgressEntry {
  timestamp: number;
  progress: number;
  delta: number;
  source?: string;
}

// ============================================================================
// ACHIEVEMENT EVENTS
// ============================================================================

export interface AchievementUnlockEvent {
  userId: string;
  achievementId: string;
  achievementName: string;
  rarity: AchievementRarity;
  rewards: AchievementReward[];
  unlockedAt: number;
  trigger: string;
  isFirst?: boolean;          // First person to unlock
  globalUnlockCount?: number; // How many have unlocked
}

export interface AchievementProgressEvent {
  userId: string;
  achievementId: string;
  previousProgress: number;
  newProgress: number;
  target: number;
  progressPercent: number;
  source: string;
  timestamp: number;
}

// ============================================================================
// ACHIEVEMENT SHOWCASE
// ============================================================================

export interface AchievementShowcase {
  userId: string;
  displayedAchievements: string[];  // Achievement IDs
  featuredAchievement?: string;
  totalPoints: number;
  achievementScore: number;
  rareAchievementsCount: number;
  lastUnlockedAt?: number;
}

export interface AchievementStats {
  userId: string;
  totalUnlocked: number;
  totalAvailable: number;
  percentComplete: number;
  byCategory: Record<AchievementCategory, { unlocked: number; total: number }>;
  byRarity: Record<AchievementRarity, { unlocked: number; total: number }>;
  totalPoints: number;
  rank?: number;
  percentile?: number;
}

// ============================================================================
// LEADERBOARD
// ============================================================================

export interface AchievementLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  achievementScore: number;
  totalUnlocked: number;
  rareCount: number;
  epicCount: number;
  legendaryCount: number;
  featuredAchievements: string[];
}

// ============================================================================
// PRE-DEFINED ACHIEVEMENTS
// ============================================================================

export const ACHIEVEMENT_DEFINITIONS: Omit<AchievementDefinition, "createdAt" | "updatedAt">[] = [
  // ============ BETTING ACHIEVEMENTS ============
  {
    id: "first_bet",
    name: "First Bet",
    description: "Place your first bet on the platform",
    category: "betting",
    rarity: "common",
    icon: "1",
    badgeColor: "#4CAF50",
    trigger: "bet_placed",
    conditions: [{ type: "total_bets", operator: "gte", value: 1 }],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 100, description: "100 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "first_win",
    name: "First Win",
    description: "Win your first bet",
    category: "winning",
    rarity: "common",
    icon: "W",
    badgeColor: "#2196F3",
    trigger: "bet_won",
    conditions: [{ type: "total_wins", operator: "gte", value: 1 }],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 150, description: "150 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["first_bet"],
  },
  {
    id: "parlay_king",
    name: "Parlay King",
    description: "Win a 5-leg parlay bet",
    category: "skill",
    rarity: "rare",
    icon: "K",
    badgeColor: "#9C27B0",
    trigger: "bet_won",
    conditions: [
      { type: "parlay_legs_won", operator: "gte", value: 5 },
    ],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 1000, description: "1000 bonus points" },
      { type: "badge", value: "parlay_crown", description: "Parlay King badge" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: true,
    tiers: [
      { tier: 1, name: "Parlay Prince", target: 3, rewards: [{ type: "points", value: 250, description: "250 points" }] },
      { tier: 2, name: "Parlay King", target: 5, rewards: [{ type: "points", value: 500, description: "500 points" }] },
      { tier: 3, name: "Parlay Emperor", target: 7, rewards: [{ type: "points", value: 1000, description: "1000 points" }] },
      { tier: 4, name: "Parlay God", target: 10, rewards: [{ type: "points", value: 2500, description: "2500 points" }] },
    ],
  },

  // ============ STREAK ACHIEVEMENTS ============
  {
    id: "streak_5",
    name: "Hot Streak",
    description: "Win 5 bets in a row",
    category: "streak",
    rarity: "uncommon",
    icon: "5",
    badgeColor: "#FF5722",
    trigger: "streak_updated",
    conditions: [{ type: "win_streak", operator: "gte", value: 5 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 5,
    progressUnit: "wins",
    rewards: [
      { type: "points", value: 500, description: "500 bonus points" },
      { type: "multiplier", value: 1.5, duration: 86400, description: "1.5x points for 24 hours" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "streak_10",
    name: "On Fire",
    description: "Win 10 bets in a row",
    category: "streak",
    rarity: "rare",
    icon: "10",
    badgeColor: "#FF9800",
    trigger: "streak_updated",
    conditions: [{ type: "win_streak", operator: "gte", value: 10 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 10,
    progressUnit: "wins",
    rewards: [
      { type: "points", value: 2000, description: "2000 bonus points" },
      { type: "title", value: "The Streak Master", description: "Exclusive title" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["streak_5"],
  },
  {
    id: "streak_20",
    name: "Unstoppable",
    description: "Win 20 bets in a row",
    category: "streak",
    rarity: "legendary",
    icon: "20",
    badgeColor: "#E91E63",
    trigger: "streak_updated",
    conditions: [{ type: "win_streak", operator: "gte", value: 20 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 20,
    progressUnit: "wins",
    rewards: [
      { type: "points", value: 10000, description: "10000 bonus points" },
      { type: "free_bet", value: 100, description: "$100 free bet" },
      { type: "badge", value: "unstoppable", description: "Unstoppable badge" },
    ],
    isHidden: true,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["streak_10"],
  },

  // ============ REFERRAL ACHIEVEMENTS ============
  {
    id: "first_referral",
    name: "Social Butterfly",
    description: "Refer your first friend who places a bet",
    category: "social",
    rarity: "common",
    icon: "R",
    badgeColor: "#00BCD4",
    trigger: "referral_complete",
    conditions: [{ type: "successful_referrals", operator: "gte", value: 1 }],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 500, description: "500 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "referral_master",
    name: "Referral Master",
    description: "Refer 10 friends who place bets",
    category: "social",
    rarity: "rare",
    icon: "RM",
    badgeColor: "#3F51B5",
    trigger: "referral_complete",
    conditions: [{ type: "successful_referrals", operator: "gte", value: 10 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 10,
    progressUnit: "referrals",
    rewards: [
      { type: "points", value: 5000, description: "5000 bonus points" },
      { type: "title", value: "The Networker", description: "Exclusive title" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: true,
    tiers: [
      { tier: 1, name: "Connector", target: 3, rewards: [{ type: "points", value: 500, description: "500 points" }] },
      { tier: 2, name: "Influencer", target: 5, rewards: [{ type: "points", value: 1000, description: "1000 points" }] },
      { tier: 3, name: "Referral Master", target: 10, rewards: [{ type: "points", value: 2500, description: "2500 points" }] },
      { tier: 4, name: "Ambassador", target: 25, rewards: [{ type: "points", value: 10000, description: "10000 points" }] },
    ],
    prerequisites: ["first_referral"],
  },

  // ============ VOLUME ACHIEVEMENTS ============
  {
    id: "volume_100",
    name: "Getting Started",
    description: "Wager $100 in total",
    category: "volume",
    rarity: "common",
    icon: "$",
    badgeColor: "#8BC34A",
    trigger: "bet_placed",
    conditions: [{ type: "total_wagered", operator: "gte", value: 100 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 100,
    progressUnit: "dollars",
    rewards: [
      { type: "points", value: 100, description: "100 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "volume_1000",
    name: "Serious Player",
    description: "Wager $1,000 in total",
    category: "volume",
    rarity: "uncommon",
    icon: "$$",
    badgeColor: "#4CAF50",
    trigger: "bet_placed",
    conditions: [{ type: "total_wagered", operator: "gte", value: 1000 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 1000,
    progressUnit: "dollars",
    rewards: [
      { type: "points", value: 500, description: "500 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["volume_100"],
  },
  {
    id: "volume_10000",
    name: "High Roller",
    description: "Wager $10,000 in total",
    category: "volume",
    rarity: "rare",
    icon: "$$$",
    badgeColor: "#FFC107",
    trigger: "bet_placed",
    conditions: [{ type: "total_wagered", operator: "gte", value: 10000 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 10000,
    progressUnit: "dollars",
    rewards: [
      { type: "points", value: 2500, description: "2500 bonus points" },
      { type: "badge", value: "high_roller", description: "High Roller badge" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["volume_1000"],
  },
  {
    id: "volume_100000",
    name: "Whale",
    description: "Wager $100,000 in total",
    category: "volume",
    rarity: "legendary",
    icon: "W",
    badgeColor: "#673AB7",
    trigger: "bet_placed",
    conditions: [{ type: "total_wagered", operator: "gte", value: 100000 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 100000,
    progressUnit: "dollars",
    rewards: [
      { type: "points", value: 25000, description: "25000 bonus points" },
      { type: "title", value: "The Whale", description: "Legendary title" },
      { type: "badge", value: "whale", description: "Whale badge" },
    ],
    isHidden: true,
    isLimited: false,
    hasTiers: false,
    prerequisites: ["volume_10000"],
  },

  // ============ SPECIAL ACHIEVEMENTS ============
  {
    id: "early_adopter",
    name: "Early Adopter",
    description: "Join the platform in its first year",
    category: "special",
    rarity: "rare",
    icon: "EA",
    badgeColor: "#607D8B",
    trigger: "manual",
    conditions: [],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 1000, description: "1000 bonus points" },
      { type: "badge", value: "early_adopter", description: "Exclusive Early Adopter badge" },
    ],
    isHidden: false,
    isLimited: true,
    hasTiers: false,
  },
  {
    id: "march_madness_2024",
    name: "March Madness 2024",
    description: "Participate in the 2024 March Madness bracket challenge",
    category: "special",
    rarity: "uncommon",
    icon: "MM",
    badgeColor: "#FF5722",
    trigger: "manual",
    conditions: [],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 500, description: "500 bonus points" },
    ],
    isHidden: false,
    isLimited: true,
    hasTiers: false,
  },

  // ============ MILESTONE ACHIEVEMENTS ============
  {
    id: "verified_account",
    name: "Verified",
    description: "Complete identity verification",
    category: "milestone",
    rarity: "common",
    icon: "V",
    badgeColor: "#2196F3",
    trigger: "profile_updated",
    conditions: [{ type: "kyc_complete", operator: "eq", value: 1 }],
    conditionLogic: "all",
    hasProgress: false,
    rewards: [
      { type: "points", value: 250, description: "250 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "profile_complete",
    name: "Complete Profile",
    description: "Fill out all profile fields",
    category: "milestone",
    rarity: "common",
    icon: "P",
    badgeColor: "#9E9E9E",
    trigger: "profile_updated",
    conditions: [{ type: "profile_completion", operator: "eq", value: 100 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 100,
    progressUnit: "percent",
    rewards: [
      { type: "points", value: 100, description: "100 bonus points" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
  {
    id: "anniversary_1",
    name: "One Year Anniversary",
    description: "Be a member for 1 year",
    category: "loyalty",
    rarity: "rare",
    icon: "1Y",
    badgeColor: "#FFD700",
    trigger: "daily_check",
    conditions: [{ type: "account_age_days", operator: "gte", value: 365 }],
    conditionLogic: "all",
    hasProgress: true,
    progressTarget: 365,
    progressUnit: "days",
    rewards: [
      { type: "points", value: 5000, description: "5000 bonus points" },
      { type: "badge", value: "anniversary_1", description: "1 Year Anniversary badge" },
    ],
    isHidden: false,
    isLimited: false,
    hasTiers: false,
  },
];

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const UpdateAchievementDisplaySchema = z.object({
  achievementId: z.string(),
  isDisplayed: z.boolean(),
  displayOrder: z.number().optional(),
});

export type UpdateAchievementDisplayInput = z.infer<typeof UpdateAchievementDisplaySchema>;

export const ClaimAchievementRewardsSchema = z.object({
  userAchievementId: z.string(),
  tier: z.number().optional(), // For tiered achievements
});

export type ClaimAchievementRewardsInput = z.infer<typeof ClaimAchievementRewardsSchema>;
