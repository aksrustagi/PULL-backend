/**
 * Bracket Battles Types
 *
 * Types for tournament bracket competitions including
 * NCAA, NFL playoffs, and any tournament-style events.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const TournamentTypeSchema = z.enum([
  "ncaa_mens_basketball",
  "ncaa_womens_basketball",
  "nfl_playoffs",
  "nba_playoffs",
  "mlb_playoffs",
  "nhl_playoffs",
  "world_cup",
  "champions_league",
  "custom",
]);

export type TournamentType = z.infer<typeof TournamentTypeSchema>;

export const BracketStatusSchema = z.enum([
  "draft",           // User is still editing
  "submitted",       // Locked in before deadline
  "active",          // Tournament in progress
  "completed",       // Tournament finished
  "cancelled",       // Bracket cancelled
]);

export type BracketStatus = z.infer<typeof BracketStatusSchema>;

export const PoolTypeSchema = z.enum([
  "free",            // No entry fee
  "paid",            // Fixed entry fee
  "tiered",          // Multiple entry tiers
  "private",         // Invite-only pool
]);

export type PoolType = z.infer<typeof PoolTypeSchema>;

export const ScoringSystemSchema = z.enum([
  "standard",        // Points per correct pick
  "weighted",        // More points for later rounds
  "upset_bonus",     // Bonus for picking upsets
  "seed_weighted",   // Points based on seed difference
  "progressive",     // Points increase each round
]);

export type ScoringSystem = z.infer<typeof ScoringSystemSchema>;

// ============================================================================
// TOURNAMENT TYPES
// ============================================================================

/**
 * Tournament - the actual sporting event
 */
export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  season: string;
  year: number;

  // Structure
  totalTeams: number;
  totalRounds: number;
  format: TournamentFormat;

  // Teams
  teams: TournamentTeam[];
  seeds: Map<string, number>;     // teamId -> seed

  // Games
  games: TournamentGame[];

  // Timing
  startDate: number;
  endDate: number;
  bracketDeadline: number;        // When brackets lock

  // Status
  status: "upcoming" | "in_progress" | "completed";
  currentRound: number;

  // Metadata
  imageUrl?: string;
  description?: string;

  createdAt: number;
  updatedAt: number;
}

export interface TournamentFormat {
  type: "single_elimination" | "double_elimination" | "round_robin" | "group_stage";
  regions?: string[];             // For NCAA-style regionals
  playInGames?: boolean;          // First Four in NCAA
  wildcards?: number;             // Wildcard teams
}

export interface TournamentTeam {
  id: string;
  name: string;
  abbreviation: string;
  seed: number;
  region?: string;
  logoUrl?: string;
  record?: string;                // e.g., "28-5"
  conference?: string;
  isEliminated: boolean;
}

export interface TournamentGame {
  id: string;
  tournamentId: string;
  round: number;
  roundName: string;              // e.g., "Sweet Sixteen"
  region?: string;
  gameNumber: number;             // Position in bracket

  // Teams
  team1Id?: string;               // null if TBD
  team2Id?: string;
  team1Seed?: number;
  team2Seed?: number;

  // Result
  winnerId?: string;
  team1Score?: number;
  team2Score?: number;
  isComplete: boolean;

  // Timing
  scheduledAt?: number;
  completedAt?: number;

  // Next game
  nextGameId?: string;
  nextGameSlot?: "team1" | "team2";
}

// ============================================================================
// BRACKET TYPES
// ============================================================================

/**
 * Bracket - user's tournament predictions
 */
export interface Bracket {
  id: string;
  userId: string;
  username: string;
  tournamentId: string;
  poolId?: string;

  // Bracket name
  name: string;
  isPublic: boolean;

  // Picks
  picks: BracketPick[];
  champion?: string;              // Team ID

  // Scoring
  status: BracketStatus;
  totalPoints: number;
  maxPossiblePoints: number;
  correctPicks: number;
  incorrectPicks: number;
  pendingPicks: number;

  // Ranking
  rank?: number;
  percentile?: number;

  // Progress tracking
  roundScores: Map<number, number>;

  // Timestamps
  createdAt: number;
  submittedAt?: number;
  lastModifiedAt: number;
}

export interface BracketPick {
  gameId: string;
  round: number;
  pickedTeamId: string;
  pickedTeamSeed: number;
  result?: "correct" | "incorrect" | "pending";
  pointsEarned?: number;
  earnedAt?: number;
}

/**
 * Bracket Pool - competition among multiple brackets
 */
export interface BracketPool {
  id: string;
  name: string;
  description?: string;
  tournamentId: string;

  // Pool type
  poolType: PoolType;
  isPublic: boolean;
  requiresInvite: boolean;
  inviteCode?: string;

  // Entry
  entryFee: number;
  maxEntries: number;
  entriesPerUser: number;
  currentEntries: number;

  // Prize pool
  prizePool: number;
  prizeStructure: PrizeStructure[];
  guaranteedPrizePool?: number;

  // Scoring
  scoringSystem: ScoringSystem;
  scoringConfig: ScoringConfig;

  // Participants
  creatorId: string;
  participants: string[];         // User IDs
  brackets: string[];             // Bracket IDs

  // Tiebreaker
  tiebreakerType: "total_points" | "final_score" | "first_correct";
  tiebreakerQuestion?: string;    // e.g., "Total points in championship game"

  // Status
  status: "open" | "locked" | "in_progress" | "completed" | "cancelled";

  // Special features
  perfectBracketBonus?: number;
  upsetBonusEnabled: boolean;
  latePicksPenalty?: number;      // Point deduction for late submissions

  // Timestamps
  createdAt: number;
  locksAt: number;
  completedAt?: number;
}

export interface PrizeStructure {
  place: number | string;         // 1, 2, 3 or "4-10"
  percentage?: number;            // Percentage of pool
  fixedAmount?: number;           // Fixed prize amount
  description?: string;
}

export interface ScoringConfig {
  pointsPerRound: number[];       // Points for each round [round1, round2, ...]
  upsetMultiplier: number;        // Multiplier for upset picks
  seedDifferenceBonus: number;    // Bonus per seed difference
  perfectRoundBonus: number;      // Bonus for perfect round
  championBonus: number;          // Bonus for correct champion
  finalFourBonus: number;         // Bonus per Final Four team
}

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

export interface BracketLeaderboardEntry {
  rank: number;
  previousRank?: number;
  bracketId: string;
  userId: string;
  username: string;
  bracketName: string;
  avatarUrl?: string;

  // Scoring
  totalPoints: number;
  maxPossiblePoints: number;
  correctPicks: number;
  champion?: string;
  championAlive: boolean;

  // Round breakdown
  roundScores: { round: number; points: number; correct: number }[];

  // Tiebreaker
  tiebreakerAnswer?: number | string;
}

export interface PoolLeaderboard {
  poolId: string;
  tournamentId: string;
  entries: BracketLeaderboardEntry[];
  totalEntries: number;
  updatedAt: number;
  currentRound: number;
  gamesRemaining: number;
}

// ============================================================================
// LIVE SCORING
// ============================================================================

export interface LiveScoringUpdate {
  tournamentId: string;
  gameId: string;
  winnerId: string;
  affectedBrackets: AffectedBracket[];
  timestamp: number;
}

export interface AffectedBracket {
  bracketId: string;
  userId: string;
  pointsChange: number;
  newTotal: number;
  isCorrect: boolean;
  maxPossibleChange: number;
  newMaxPossible: number;
}

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const CreateBracketSchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1).max(50),
  poolId: z.string().optional(),
  isPublic: z.boolean().default(true),
});

export type CreateBracketInput = z.infer<typeof CreateBracketSchema>;

export const UpdateBracketSchema = z.object({
  bracketId: z.string(),
  picks: z.array(z.object({
    gameId: z.string(),
    pickedTeamId: z.string(),
  })),
  champion: z.string().optional(),
});

export type UpdateBracketInput = z.infer<typeof UpdateBracketSchema>;

export const SubmitBracketSchema = z.object({
  bracketId: z.string(),
  tiebreakerAnswer: z.union([z.number(), z.string()]).optional(),
});

export type SubmitBracketInput = z.infer<typeof SubmitBracketSchema>;

export const CreatePoolSchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  poolType: PoolTypeSchema,
  isPublic: z.boolean().default(true),
  entryFee: z.number().min(0),
  maxEntries: z.number().min(2).max(10000).default(1000),
  entriesPerUser: z.number().min(1).max(10).default(1),
  scoringSystem: ScoringSystemSchema.default("weighted"),
  upsetBonusEnabled: z.boolean().default(true),
  perfectBracketBonus: z.number().optional(),
  tiebreakerQuestion: z.string().optional(),
});

export type CreatePoolInput = z.infer<typeof CreatePoolSchema>;

export const JoinPoolSchema = z.object({
  poolId: z.string(),
  bracketId: z.string(),
  inviteCode: z.string().optional(),
});

export type JoinPoolInput = z.infer<typeof JoinPoolSchema>;
