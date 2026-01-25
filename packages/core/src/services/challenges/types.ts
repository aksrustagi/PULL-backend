/**
 * Daily Challenges Types
 *
 * Types for the daily challenge system that provides users
 * with daily, weekly, and special challenges for engagement.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const ChallengeTypeSchema = z.enum([
  "daily",              // Resets every day
  "weekly",             // Resets every week
  "special",            // Limited-time special events
  "seasonal",           // Seasonal challenges
  "milestone",          // One-time milestone challenges
]);

export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

export const ChallengeCategorySchema = z.enum([
  "betting",            // Bet on specific sports/markets
  "winning",            // Win-based challenges
  "odds",               // Hit certain odds
  "streak",             // Maintain streaks
  "volume",             // Volume-based challenges
  "social",             // Social engagement challenges
  "exploration",        // Try new features
  "skill",              // Skill-based challenges
]);

export type ChallengeCategory = z.infer<typeof ChallengeCategorySchema>;

export const ChallengeDifficultySchema = z.enum([
  "easy",               // 90%+ completion rate
  "medium",             // 50-90% completion rate
  "hard",               // 20-50% completion rate
  "extreme",            // <20% completion rate
]);

export type ChallengeDifficulty = z.infer<typeof ChallengeDifficultySchema>;

export const ChallengeStatusSchema = z.enum([
  "locked",             // Not yet available
  "available",          // Ready to start
  "active",             // In progress
  "completed",          // Successfully completed
  "failed",             // Failed to complete
  "expired",            // Time expired
  "claimed",            // Rewards claimed
]);

export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

// ============================================================================
// CHALLENGE DEFINITIONS
// ============================================================================

/**
 * Challenge Definition - template for a challenge
 */
export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  shortDescription: string;

  // Type and category
  type: ChallengeType;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;

  // Requirements
  requirements: ChallengeRequirement[];
  requirementLogic: "all" | "any";

  // Rewards
  rewards: ChallengeReward[];
  bonusRewards?: ChallengeReward[];     // For early completion, etc.

  // Timing
  duration: number;                      // Duration in seconds
  cooldown?: number;                     // Cooldown before can be retried

  // Display
  icon: string;
  color: string;
  bannerUrl?: string;

  // Availability
  isActive: boolean;
  startsAt?: number;
  endsAt?: number;
  maxCompletions?: number;              // Total times can be completed
  maxCompletionsPerUser?: number;       // Times per user

  // Prerequisites
  prerequisites?: string[];             // Required challenge IDs
  minLevel?: number;
  minTier?: string;

  // Tags
  tags: string[];
  sport?: string;                       // Specific sport if applicable

  createdAt: number;
  updatedAt: number;
}

export interface ChallengeRequirement {
  type: RequirementType;
  target: number;
  description: string;
  filter?: Record<string, any>;         // Additional filters
  timeframe?: "challenge" | "session" | "all_time";
}

export type RequirementType =
  | "bets_placed"
  | "bets_won"
  | "bets_on_sport"
  | "minimum_odds"
  | "minimum_stake"
  | "total_stake"
  | "total_winnings"
  | "parlay_legs"
  | "win_streak"
  | "unique_sports"
  | "unique_markets"
  | "referrals"
  | "follows"
  | "comments"
  | "shares"
  | "ai_insights_viewed"
  | "brackets_submitted"
  | "copy_trading_started"
  | "custom";

export interface ChallengeReward {
  type: "points" | "tokens" | "free_bet" | "multiplier" | "badge" | "xp" | "entry";
  value: number | string;
  description: string;
  duration?: number;                    // For temporary rewards
}

// ============================================================================
// USER CHALLENGES
// ============================================================================

/**
 * User Challenge - user's instance of a challenge
 */
export interface UserChallenge {
  id: string;
  oderId: string;
  challengeId: string;

  // Status
  status: ChallengeStatus;

  // Progress
  progress: ChallengeProgress[];
  overallProgress: number;              // 0-100 percentage
  isComplete: boolean;

  // Timing
  startedAt: number;
  expiresAt: number;
  completedAt?: number;
  claimedAt?: number;

  // Rewards
  rewardsClaimed: boolean;
  bonusEarned: boolean;                 // If bonus requirements met

  // Attempts
  attemptNumber: number;

  createdAt: number;
  updatedAt: number;
}

export interface ChallengeProgress {
  requirementIndex: number;
  current: number;
  target: number;
  isComplete: boolean;
  lastUpdatedAt: number;
}

// ============================================================================
// CHALLENGE EVENTS
// ============================================================================

export interface ChallengeProgressEvent {
  userId: string;
  challengeId: string;
  userChallengeId: string;
  requirementIndex: number;
  previousProgress: number;
  newProgress: number;
  target: number;
  source: string;
  timestamp: number;
}

export interface ChallengeCompletionEvent {
  userId: string;
  challengeId: string;
  userChallengeId: string;
  challengeName: string;
  rewards: ChallengeReward[];
  bonusEarned: boolean;
  completedAt: number;
  timeToComplete: number;               // Seconds
}

// ============================================================================
// CHALLENGE TEMPLATES
// ============================================================================

export const DAILY_CHALLENGE_TEMPLATES: Omit<ChallengeDefinition, "id" | "createdAt" | "updatedAt">[] = [
  // ============ BETTING CHALLENGES ============
  {
    name: "Daily Bettor",
    description: "Place 3 bets today on any sport or market",
    shortDescription: "Place 3 bets",
    type: "daily",
    category: "betting",
    difficulty: "easy",
    requirements: [
      { type: "bets_placed", target: 3, description: "Place 3 bets", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 50, description: "50 points" },
    ],
    duration: 86400,
    icon: "ticket",
    color: "#4CAF50",
    isActive: true,
    tags: ["daily", "betting"],
  },
  {
    name: "Sport Explorer",
    description: "Bet on 3 different sports today",
    shortDescription: "Bet on 3 sports",
    type: "daily",
    category: "exploration",
    difficulty: "medium",
    requirements: [
      { type: "unique_sports", target: 3, description: "Bet on 3 different sports", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 75, description: "75 points" },
      { type: "xp", value: 25, description: "25 XP" },
    ],
    duration: 86400,
    icon: "sports",
    color: "#2196F3",
    isActive: true,
    tags: ["daily", "exploration"],
  },
  {
    name: "High Roller",
    description: "Place a bet of $50 or more",
    shortDescription: "Place $50+ bet",
    type: "daily",
    category: "volume",
    difficulty: "medium",
    requirements: [
      { type: "minimum_stake", target: 50, description: "Place a $50+ bet", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 100, description: "100 points" },
    ],
    duration: 86400,
    icon: "money",
    color: "#FFC107",
    isActive: true,
    tags: ["daily", "volume"],
  },

  // ============ ODDS CHALLENGES ============
  {
    name: "Long Shot",
    description: "Place a bet at +300 odds or higher",
    shortDescription: "Bet at +300 odds",
    type: "daily",
    category: "odds",
    difficulty: "easy",
    requirements: [
      { type: "minimum_odds", target: 4.0, description: "Bet at +300 odds or higher", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 50, description: "50 points" },
    ],
    duration: 86400,
    icon: "target",
    color: "#9C27B0",
    isActive: true,
    tags: ["daily", "odds"],
  },
  {
    name: "Underdog Hunter",
    description: "Win a bet at +200 odds or higher",
    shortDescription: "Win at +200 odds",
    type: "daily",
    category: "odds",
    difficulty: "hard",
    requirements: [
      { type: "bets_won", target: 1, description: "Win at +200 odds or higher", timeframe: "challenge", filter: { minOdds: 3.0 } },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 200, description: "200 points" },
      { type: "badge", value: "underdog_hunter", description: "Underdog Hunter badge" },
    ],
    duration: 86400,
    icon: "bolt",
    color: "#E91E63",
    isActive: true,
    tags: ["daily", "odds", "winning"],
  },

  // ============ STREAK CHALLENGES ============
  {
    name: "Hot Hand",
    description: "Win 3 bets in a row today",
    shortDescription: "3 wins in a row",
    type: "daily",
    category: "streak",
    difficulty: "hard",
    requirements: [
      { type: "win_streak", target: 3, description: "Win 3 consecutive bets", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 150, description: "150 points" },
      { type: "multiplier", value: 1.5, duration: 3600, description: "1.5x points for 1 hour" },
    ],
    duration: 86400,
    icon: "fire",
    color: "#FF5722",
    isActive: true,
    tags: ["daily", "streak"],
  },

  // ============ SOCIAL CHALLENGES ============
  {
    name: "Social Butterfly",
    description: "Follow 3 new traders today",
    shortDescription: "Follow 3 traders",
    type: "daily",
    category: "social",
    difficulty: "easy",
    requirements: [
      { type: "follows", target: 3, description: "Follow 3 new traders", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 30, description: "30 points" },
    ],
    duration: 86400,
    icon: "users",
    color: "#00BCD4",
    isActive: true,
    tags: ["daily", "social"],
  },
  {
    name: "Spread the Word",
    description: "Share a winning bet on social media",
    shortDescription: "Share a win",
    type: "daily",
    category: "social",
    difficulty: "easy",
    requirements: [
      { type: "shares", target: 1, description: "Share a winning bet", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 25, description: "25 points" },
    ],
    duration: 86400,
    icon: "share",
    color: "#3F51B5",
    isActive: true,
    tags: ["daily", "social"],
  },

  // ============ VOLUME CHALLENGES ============
  {
    name: "Volume King",
    description: "Wager a total of $100 today",
    shortDescription: "Wager $100 total",
    type: "daily",
    category: "volume",
    difficulty: "medium",
    requirements: [
      { type: "total_stake", target: 100, description: "Wager $100 total", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 100, description: "100 points" },
    ],
    duration: 86400,
    icon: "chart",
    color: "#8BC34A",
    isActive: true,
    tags: ["daily", "volume"],
  },
];

export const WEEKLY_CHALLENGE_TEMPLATES: Omit<ChallengeDefinition, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Weekly Warrior",
    description: "Place 20 bets this week across any sports",
    shortDescription: "Place 20 bets",
    type: "weekly",
    category: "betting",
    difficulty: "medium",
    requirements: [
      { type: "bets_placed", target: 20, description: "Place 20 bets", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 300, description: "300 points" },
      { type: "free_bet", value: 10, description: "$10 free bet" },
    ],
    duration: 604800, // 7 days
    icon: "calendar",
    color: "#673AB7",
    isActive: true,
    tags: ["weekly", "betting"],
  },
  {
    name: "Parlay Master",
    description: "Win 3 parlay bets this week",
    shortDescription: "Win 3 parlays",
    type: "weekly",
    category: "skill",
    difficulty: "hard",
    requirements: [
      { type: "bets_won", target: 3, description: "Win 3 parlay bets", timeframe: "challenge", filter: { betType: "parlay" } },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 500, description: "500 points" },
      { type: "badge", value: "parlay_master", description: "Parlay Master badge" },
    ],
    duration: 604800,
    icon: "layers",
    color: "#9C27B0",
    isActive: true,
    tags: ["weekly", "skill", "parlay"],
  },
  {
    name: "Profit Week",
    description: "End the week with $100+ in net profits",
    shortDescription: "Profit $100+",
    type: "weekly",
    category: "winning",
    difficulty: "hard",
    requirements: [
      { type: "total_winnings", target: 100, description: "Net profit of $100+", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 750, description: "750 points" },
      { type: "multiplier", value: 2.0, duration: 86400, description: "2x points for 24 hours" },
    ],
    duration: 604800,
    icon: "trending-up",
    color: "#4CAF50",
    isActive: true,
    tags: ["weekly", "winning"],
  },
  {
    name: "Community Builder",
    description: "Refer 2 friends who place bets this week",
    shortDescription: "Refer 2 friends",
    type: "weekly",
    category: "social",
    difficulty: "hard",
    requirements: [
      { type: "referrals", target: 2, description: "Refer 2 friends who bet", timeframe: "challenge" },
    ],
    requirementLogic: "all",
    rewards: [
      { type: "points", value: 1000, description: "1000 points" },
      { type: "tokens", value: 5, description: "5 PULL tokens" },
    ],
    duration: 604800,
    icon: "users-plus",
    color: "#FF5722",
    isActive: true,
    tags: ["weekly", "social", "referral"],
  },
];

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const StartChallengeSchema = z.object({
  challengeId: z.string(),
});

export type StartChallengeInput = z.infer<typeof StartChallengeSchema>;

export const ClaimRewardsSchema = z.object({
  userChallengeId: z.string(),
});

export type ClaimRewardsInput = z.infer<typeof ClaimRewardsSchema>;
