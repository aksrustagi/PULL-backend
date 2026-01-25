/**
 * Cash Battles Types
 * 1v1 head-to-head prediction duels with real money stakes
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const MIN_BATTLE_STAKE = 5; // $5 minimum
export const MAX_BATTLE_STAKE = 10000; // $10,000 maximum
export const BATTLE_EXPIRY_HOURS = 24; // Unaccepted battles expire after 24h
export const MATCHING_TIMEOUT_SECONDS = 30;
export const PLATFORM_FEE_PERCENT = 5; // 5% platform fee on winnings

export const BattleStatusSchema = z.enum([
  "pending",          // Created, waiting for opponent
  "matching",         // In matchmaking queue
  "matched",          // Opponent found, awaiting acceptance
  "accepted",         // Both parties accepted
  "active",           // Battle in progress
  "awaiting_results", // Predictions locked, waiting for resolution
  "resolved",         // Results determined
  "completed",        // Winnings distributed
  "cancelled",        // Cancelled before acceptance
  "expired",          // Expired without acceptance
  "disputed",         // Under dispute review
]);

export type BattleStatus = z.infer<typeof BattleStatusSchema>;

export const BattleTypeSchema = z.enum([
  "single",           // Single prediction
  "multi",            // Multiple predictions (best of X)
  "parlay",           // Parlay-style combined predictions
  "live",             // Live in-game predictions
  "speed",            // Quick 5-minute battles
]);

export type BattleType = z.infer<typeof BattleTypeSchema>;

export const BattleMatchTypeSchema = z.enum([
  "friend",           // Direct challenge to friend
  "random",           // Random matchmaking
  "ranked",           // Ranked matchmaking (skill-based)
  "open",             // Open lobby anyone can join
]);

export type BattleMatchType = z.infer<typeof BattleMatchTypeSchema>;

export const BattleCategorySchema = z.enum([
  "sports",
  "politics",
  "crypto",
  "entertainment",
  "finance",
  "weather",
  "custom",
]);

export type BattleCategory = z.infer<typeof BattleCategorySchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface CashBattle {
  id: string;
  creatorId: string;
  opponentId?: string;
  status: BattleStatus;
  type: BattleType;
  matchType: BattleMatchType;
  category: BattleCategory;

  // Stakes
  stake: number;
  currency: "USD" | "USDC";
  totalPot: number;
  platformFee: number;
  winnerPayout: number;

  // Predictions
  marketId: string;
  marketTicker: string;
  marketTitle: string;
  marketCloseTime: number;
  predictions: BattlePrediction[];

  // Multi-battle specific
  roundCount?: number;
  currentRound?: number;
  rounds?: BattleRound[];

  // Scoring
  creatorScore: number;
  opponentScore: number;
  winnerId?: string;
  isTie: boolean;

  // Chat
  chatEnabled: boolean;
  chatMessages: BattleChatMessage[];

  // Timestamps
  createdAt: number;
  matchedAt?: number;
  acceptedAt?: number;
  startedAt?: number;
  resolvedAt?: number;
  completedAt?: number;
  expiresAt: number;

  // Metadata
  isPrivate: boolean;
  spectatorCount: number;
  viewerIds: string[];
}

export interface BattlePrediction {
  id: string;
  battleId: string;
  roundNumber: number;
  userId: string;
  marketId: string;
  outcome: string; // "yes" | "no" or specific outcome
  confidence?: number; // 1-100
  lockedAt: number;
  isCorrect?: boolean;
  settledAt?: number;
}

export interface BattleRound {
  roundNumber: number;
  marketId: string;
  marketTitle: string;
  creatorPrediction?: BattlePrediction;
  opponentPrediction?: BattlePrediction;
  winnerId?: string;
  status: "pending" | "active" | "completed";
  startedAt?: number;
  completedAt?: number;
}

export interface BattleChatMessage {
  id: string;
  battleId: string;
  userId: string;
  message: string;
  isSystem: boolean;
  createdAt: number;
}

// ============================================================================
// MATCHMAKING TYPES
// ============================================================================

export interface MatchmakingQueue {
  id: string;
  userId: string;
  battleType: BattleType;
  category: BattleCategory;
  stakeRange: {
    min: number;
    max: number;
  };
  skillRange?: {
    min: number;
    max: number;
  };
  preferredMarkets?: string[];
  queuedAt: number;
  expiresAt: number;
  status: "queued" | "matched" | "expired" | "cancelled";
}

export interface MatchmakingResult {
  battleId: string;
  player1Id: string;
  player2Id: string;
  matchedAt: number;
  matchQuality: number; // 0-100 score
  factors: MatchmakingFactors;
}

export interface MatchmakingFactors {
  skillDifference: number;
  stakeDifference: number;
  waitTime: number;
  categoryMatch: boolean;
  marketOverlap: number;
}

// ============================================================================
// PLAYER STATS
// ============================================================================

export interface BattlePlayerStats {
  userId: string;
  totalBattles: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  winStreak: number;
  longestWinStreak: number;
  lossStreak: number;
  totalWagered: number;
  totalWon: number;
  totalLost: number;
  netProfit: number;
  roi: number;
  skillRating: number; // ELO-style rating
  rank: BattleRank;
  categoryStats: Record<BattleCategory, CategoryStats>;
  recentBattles: string[];
  favoriteOpponents: string[];
  nemesis?: string; // Most losses against
  bestMatch?: string; // Most wins against
}

export interface CategoryStats {
  battles: number;
  wins: number;
  winRate: number;
  profit: number;
}

export const BattleRankSchema = z.enum([
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "grandmaster",
  "legend",
]);

export type BattleRank = z.infer<typeof BattleRankSchema>;

export const RANK_THRESHOLDS: Record<BattleRank, number> = {
  bronze: 0,
  silver: 1000,
  gold: 1200,
  platinum: 1400,
  diamond: 1600,
  master: 1800,
  grandmaster: 2000,
  legend: 2200,
};

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export const CreateBattleRequestSchema = z.object({
  type: BattleTypeSchema.default("single"),
  matchType: BattleMatchTypeSchema,
  category: BattleCategorySchema,
  stake: z.number().min(MIN_BATTLE_STAKE).max(MAX_BATTLE_STAKE),
  currency: z.enum(["USD", "USDC"]).default("USD"),
  marketId: z.string(),
  opponentId: z.string().optional(), // Required for friend battles
  roundCount: z.number().min(1).max(5).optional(), // For multi-battles
  isPrivate: z.boolean().default(false),
  chatEnabled: z.boolean().default(true),
});

export type CreateBattleRequest = z.infer<typeof CreateBattleRequestSchema>;

export interface CreateBattleResponse {
  battle: CashBattle;
  matchmaking?: MatchmakingQueue; // If random matching
  shareLink: string;
}

export const AcceptBattleRequestSchema = z.object({
  battleId: z.string(),
});

export type AcceptBattleRequest = z.infer<typeof AcceptBattleRequestSchema>;

export const SubmitPredictionRequestSchema = z.object({
  battleId: z.string(),
  roundNumber: z.number().min(1).optional().default(1),
  outcome: z.string(),
  confidence: z.number().min(1).max(100).optional(),
});

export type SubmitPredictionRequest = z.infer<typeof SubmitPredictionRequestSchema>;

export const JoinMatchmakingRequestSchema = z.object({
  battleType: BattleTypeSchema.default("single"),
  category: BattleCategorySchema,
  stakeMin: z.number().min(MIN_BATTLE_STAKE),
  stakeMax: z.number().max(MAX_BATTLE_STAKE),
  preferredMarkets: z.array(z.string()).optional(),
  rankMatching: z.boolean().default(true),
});

export type JoinMatchmakingRequest = z.infer<typeof JoinMatchmakingRequestSchema>;

export interface JoinMatchmakingResponse {
  queueEntry: MatchmakingQueue;
  estimatedWaitTime: number; // Seconds
  playersInQueue: number;
}

export const GetBattlesRequestSchema = z.object({
  userId: z.string().optional(),
  status: z.array(BattleStatusSchema).optional(),
  category: BattleCategorySchema.optional(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type GetBattlesRequest = z.infer<typeof GetBattlesRequestSchema>;

export interface GetBattlesResponse {
  battles: CashBattle[];
  nextCursor?: string;
  hasMore: boolean;
}

export const SendChatMessageRequestSchema = z.object({
  battleId: z.string(),
  message: z.string().min(1).max(500),
});

export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequestSchema>;

// ============================================================================
// LIVE UPDATES
// ============================================================================

export type BattleEvent =
  | { type: "battle_created"; battle: CashBattle }
  | { type: "opponent_matched"; battle: CashBattle }
  | { type: "battle_accepted"; battle: CashBattle }
  | { type: "prediction_submitted"; battleId: string; userId: string; roundNumber: number }
  | { type: "round_completed"; battleId: string; roundNumber: number; winnerId?: string }
  | { type: "battle_resolved"; battle: CashBattle }
  | { type: "chat_message"; message: BattleChatMessage }
  | { type: "spectator_joined"; battleId: string; count: number }
  | { type: "battle_cancelled"; battleId: string; reason: string };

// ============================================================================
// DISPUTE TYPES
// ============================================================================

export const DisputeReasonSchema = z.enum([
  "market_error",
  "technical_issue",
  "suspicious_activity",
  "incorrect_resolution",
  "other",
]);

export type DisputeReason = z.infer<typeof DisputeReasonSchema>;

export interface BattleDispute {
  id: string;
  battleId: string;
  disputerId: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[];
  status: "pending" | "under_review" | "resolved" | "rejected";
  resolution?: string;
  resolvedBy?: string;
  createdAt: number;
  resolvedAt?: number;
}

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

export interface BattleLeaderboardEntry {
  rank: number;
  userId: string;
  username?: string;
  avatarUrl?: string;
  stats: BattlePlayerStats;
  change: number; // Rank change from previous period
}

export interface BattleLeaderboard {
  id: string;
  period: "daily" | "weekly" | "monthly" | "all_time";
  category?: BattleCategory;
  entries: BattleLeaderboardEntry[];
  generatedAt: number;
}
