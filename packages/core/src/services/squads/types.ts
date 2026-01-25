/**
 * Squad Mode Types
 * Teams of 3-5 friends pooling predictions and competing against other squads
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const MIN_SQUAD_SIZE = 3;
export const MAX_SQUAD_SIZE = 5;
export const MAX_SQUADS_PER_USER = 3;
export const SQUAD_WAR_DURATION_HOURS = 24;

export const SquadRoleSchema = z.enum([
  "captain",      // Can manage squad, start wars
  "co_captain",   // Can invite members, submit predictions
  "member",       // Can submit predictions
]);

export type SquadRole = z.infer<typeof SquadRoleSchema>;

export const SquadStatusSchema = z.enum([
  "active",
  "disbanded",
  "suspended",
]);

export type SquadStatus = z.infer<typeof SquadStatusSchema>;

export const MemberStatusSchema = z.enum([
  "active",
  "invited",
  "left",
  "kicked",
  "suspended",
]);

export type MemberStatus = z.infer<typeof MemberStatusSchema>;

export const SquadTierSchema = z.enum([
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "elite",
]);

export type SquadTier = z.infer<typeof SquadTierSchema>;

export const WarStatusSchema = z.enum([
  "pending",        // Waiting for opponent to accept
  "matching",       // In matchmaking queue
  "matched",        // Opponent found
  "preparation",    // Prep phase before predictions
  "active",         // War in progress
  "voting",         // Squad members voting on predictions
  "awaiting_results", // Predictions locked, awaiting resolution
  "resolved",       // Results determined
  "completed",      // Rewards distributed
  "cancelled",      // Cancelled before start
  "forfeited",      // One squad forfeited
]);

export type WarStatus = z.infer<typeof WarStatusSchema>;

export const WarTypeSchema = z.enum([
  "friendly",       // No stakes
  "ranked",         // Affects squad ranking
  "cash",           // Real money stakes
  "tournament",     // Part of a tournament
]);

export type WarType = z.infer<typeof WarTypeSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Squad {
  id: string;
  name: string;
  tag: string; // 3-5 char unique tag
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  status: SquadStatus;
  tier: SquadTier;

  // Members
  captainId: string;
  members: SquadMember[];
  memberCount: number;
  maxMembers: number;

  // Settings
  isPublic: boolean;
  requiresApproval: boolean;
  minKycTier: "none" | "basic" | "verified";

  // Stats
  stats: SquadStats;
  seasonStats: SquadSeasonStats;

  // Pool
  poolBalance: number;
  poolCurrency: "USD" | "USDC";
  contributionHistory: PoolContribution[];

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface SquadMember {
  id: string;
  squadId: string;
  userId: string;
  username?: string;
  avatarUrl?: string;
  role: SquadRole;
  status: MemberStatus;

  // Contribution
  contributedAmount: number;
  sharePercent: number; // Their share of winnings

  // Stats within squad
  predictionsSubmitted: number;
  correctPredictions: number;
  warsParticipated: number;
  mvpCount: number;

  // Timestamps
  joinedAt: number;
  lastActiveAt: number;
}

export interface SquadStats {
  totalWars: number;
  warsWon: number;
  warsLost: number;
  warsTied: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
  totalPredictions: number;
  correctPredictions: number;
  predictionAccuracy: number;
  totalEarnings: number;
  totalContributed: number;
  netProfit: number;
  rank: number;
  eloRating: number;
}

export interface SquadSeasonStats {
  seasonId: string;
  seasonName: string;
  warsWon: number;
  warsLost: number;
  points: number;
  rank: number;
  tier: SquadTier;
}

export interface PoolContribution {
  id: string;
  squadId: string;
  userId: string;
  amount: number;
  type: "deposit" | "withdrawal" | "winnings" | "loss";
  description: string;
  createdAt: number;
}

// ============================================================================
// SQUAD WAR TYPES
// ============================================================================

export interface SquadWar {
  id: string;
  type: WarType;
  status: WarStatus;

  // Participants
  challengerSquadId: string;
  defenderSquadId?: string;
  challengerSquad?: Squad;
  defenderSquad?: Squad;

  // Stakes
  stakePerSquad: number;
  totalPot: number;
  currency: "USD" | "USDC";

  // Predictions
  marketIds: string[];
  markets: WarMarket[];
  roundCount: number;
  currentRound: number;
  rounds: WarRound[];

  // Scoring
  challengerScore: number;
  defenderScore: number;
  winnerSquadId?: string;
  isTie: boolean;

  // MVP
  mvpUserId?: string;
  mvpStats?: {
    correctPredictions: number;
    totalPredictions: number;
    accuracy: number;
  };

  // Chat
  chatEnabled: boolean;
  chatMessages: SquadWarMessage[];

  // Timestamps
  createdAt: number;
  prepStartsAt?: number;
  startsAt?: number;
  endsAt?: number;
  resolvedAt?: number;
  completedAt?: number;
}

export interface WarMarket {
  marketId: string;
  ticker: string;
  title: string;
  closeTime: number;
  outcome?: string; // Resolved outcome
}

export interface WarRound {
  roundNumber: number;
  marketId: string;
  marketTitle: string;
  status: "pending" | "voting" | "locked" | "resolved";

  // Squad predictions (after voting)
  challengerPrediction?: SquadPrediction;
  defenderPrediction?: SquadPrediction;

  // Member votes
  challengerVotes: PredictionVote[];
  defenderVotes: PredictionVote[];

  winnerId?: string; // Winning squad ID
  startedAt?: number;
  lockedAt?: number;
  resolvedAt?: number;
}

export interface SquadPrediction {
  id: string;
  warId: string;
  roundNumber: number;
  squadId: string;
  outcome: string;
  confidence: number; // 1-100
  votingMethod: "majority" | "captain_override" | "unanimous";
  lockedAt: number;
}

export interface PredictionVote {
  id: string;
  warId: string;
  roundNumber: number;
  squadId: string;
  userId: string;
  outcome: string;
  confidence: number;
  votedAt: number;
}

export interface SquadWarMessage {
  id: string;
  warId: string;
  squadId: string;
  userId: string;
  message: string;
  isSystem: boolean;
  createdAt: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export const CreateSquadRequestSchema = z.object({
  name: z.string().min(3).max(30),
  tag: z.string().min(3).max(5).regex(/^[A-Z0-9]+$/),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  maxMembers: z.number().min(MIN_SQUAD_SIZE).max(MAX_SQUAD_SIZE).default(MAX_SQUAD_SIZE),
});

export type CreateSquadRequest = z.infer<typeof CreateSquadRequestSchema>;

export interface CreateSquadResponse {
  squad: Squad;
  inviteCode: string;
  shareLink: string;
}

export const InviteMemberRequestSchema = z.object({
  squadId: z.string(),
  userId: z.string(),
  role: SquadRoleSchema.optional().default("member"),
});

export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;

export const JoinSquadRequestSchema = z.object({
  squadId: z.string().optional(),
  inviteCode: z.string().optional(),
});

export type JoinSquadRequest = z.infer<typeof JoinSquadRequestSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  squadId: z.string(),
  memberId: z.string(),
  newRole: SquadRoleSchema,
});

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export const ContributeToPoolRequestSchema = z.object({
  squadId: z.string(),
  amount: z.number().positive(),
});

export type ContributeToPoolRequest = z.infer<typeof ContributeToPoolRequestSchema>;

export const StartWarRequestSchema = z.object({
  challengerSquadId: z.string(),
  defenderSquadId: z.string().optional(), // Optional for matchmaking
  type: WarTypeSchema,
  stakePerSquad: z.number().min(0),
  marketIds: z.array(z.string()).min(1).max(5),
  roundCount: z.number().min(1).max(5).optional(),
});

export type StartWarRequest = z.infer<typeof StartWarRequestSchema>;

export interface StartWarResponse {
  war: SquadWar;
  shareLink: string;
}

export const SubmitVoteRequestSchema = z.object({
  warId: z.string(),
  roundNumber: z.number().min(1),
  outcome: z.string(),
  confidence: z.number().min(1).max(100).optional(),
});

export type SubmitVoteRequest = z.infer<typeof SubmitVoteRequestSchema>;

export const GetSquadsRequestSchema = z.object({
  tier: SquadTierSchema.optional(),
  isPublic: z.boolean().optional(),
  searchQuery: z.string().optional(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type GetSquadsRequest = z.infer<typeof GetSquadsRequestSchema>;

export interface GetSquadsResponse {
  squads: Squad[];
  nextCursor?: string;
  hasMore: boolean;
}

export const GetWarsRequestSchema = z.object({
  squadId: z.string().optional(),
  status: z.array(WarStatusSchema).optional(),
  type: WarTypeSchema.optional(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type GetWarsRequest = z.infer<typeof GetWarsRequestSchema>;

export interface GetWarsResponse {
  wars: SquadWar[];
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================================================
// LIVE UPDATES
// ============================================================================

export type SquadEvent =
  | { type: "member_joined"; squadId: string; member: SquadMember }
  | { type: "member_left"; squadId: string; userId: string }
  | { type: "member_role_changed"; squadId: string; memberId: string; newRole: SquadRole }
  | { type: "pool_contribution"; squadId: string; contribution: PoolContribution }
  | { type: "war_created"; war: SquadWar }
  | { type: "war_accepted"; war: SquadWar }
  | { type: "vote_submitted"; warId: string; squadId: string; roundNumber: number }
  | { type: "round_locked"; warId: string; roundNumber: number }
  | { type: "round_resolved"; warId: string; roundNumber: number; winnerId?: string }
  | { type: "war_resolved"; war: SquadWar }
  | { type: "war_chat"; message: SquadWarMessage };

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

export interface SquadLeaderboardEntry {
  rank: number;
  previousRank?: number;
  squad: {
    id: string;
    name: string;
    tag: string;
    avatarUrl?: string;
    tier: SquadTier;
  };
  stats: SquadStats;
  change: number; // Rank change
}

export interface SquadLeaderboard {
  id: string;
  period: "daily" | "weekly" | "monthly" | "season" | "all_time";
  entries: SquadLeaderboardEntry[];
  generatedAt: number;
}

// ============================================================================
// SEASON TYPES
// ============================================================================

export interface SquadSeason {
  id: string;
  name: string;
  startDate: number;
  endDate: number;
  isActive: boolean;
  rewards: SeasonReward[];
}

export interface SeasonReward {
  tier: SquadTier;
  minRank?: number;
  maxRank?: number;
  reward: {
    type: "cash" | "badge" | "exclusive_skin" | "multiplier";
    value: number;
    description: string;
  };
}
