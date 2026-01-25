/**
 * Prediction Games Types
 * Free-to-play pick'em games with real prizes
 */

import { z } from "zod";

// ============================================================================
// ENUMS & SCHEMAS
// ============================================================================

export const GameTypeSchema = z.enum([
  "pick_em",          // Pick winners (ATS or straight up)
  "over_under",       // Pick totals
  "prop_picks",       // Pick prop outcomes
  "survivor",         // Pick one team per week, can't repeat
  "bracket",          // Tournament bracket
  "streak",           // Consecutive correct picks
  "perfect_week",     // Get all picks right in a period
  "head_to_head",     // 1v1 against another player
  "confidence",       // Rank picks by confidence
]);

export type GameType = z.infer<typeof GameTypeSchema>;

export const GameStatusSchema = z.enum([
  "draft",            // Being set up
  "upcoming",         // Published, accepting entries
  "live",             // Picks locked, games in progress
  "scoring",          // Games complete, calculating scores
  "complete",         // Final scores, prizes awarded
  "cancelled",        // Game cancelled
]);

export type GameStatus = z.infer<typeof GameStatusSchema>;

export const FrequencySchema = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "season_long",
  "one_time",
]);

export type Frequency = z.infer<typeof FrequencySchema>;

export const PickStatusSchema = z.enum([
  "pending",          // Not yet resolved
  "correct",          // Pick was correct
  "incorrect",        // Pick was wrong
  "push",             // No action (tie/cancelled)
  "void",             // Game cancelled
]);

export type PickStatus = z.infer<typeof PickStatusSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface PredictionGame {
  id: string;

  // Basic info
  name: string;
  description: string;
  type: GameType;
  sport: string;
  league: string;
  status: GameStatus;

  // Timing
  frequency: Frequency;
  periodName: string;          // e.g., "Week 12", "Day 1"
  entryOpenTime: number;
  entryCloseTime: number;
  startTime: number;
  endTime: number;

  // Picks
  picks: GamePick[];
  minPicks?: number;
  maxPicks?: number;
  requireAllPicks: boolean;

  // Rules
  rules: GameRules;
  scoringRules: ScoringRules;

  // Prizes
  prizePool: PrizePool;
  conversionOffer?: ConversionOffer;

  // Participants
  entryCount: number;
  maxEntries?: number;
  entriesPerUser: number;

  // Sponsorship
  sponsor?: GameSponsor;

  // Settings
  isPublic: boolean;
  isFeatured: boolean;
  tags: string[];

  createdAt: number;
  updatedAt: number;
}

export interface GamePick {
  id: string;
  gameId: string;

  // Event info
  eventId: string;
  eventName: string;
  startTime: number;

  // Pick options
  type: "moneyline" | "spread" | "total" | "prop" | "custom";
  question: string;              // e.g., "Who will win?"
  options: PickOption[];

  // Line info
  spread?: number;
  total?: number;

  // Status
  status: PickStatus;
  correctOptionId?: string;
  resultValue?: number;          // For totals

  // Scoring
  basePoints: number;
  bonusMultiplier?: number;

  // Order
  sortOrder: number;
  isLocked: boolean;
  lockedAt?: number;
}

export interface PickOption {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  odds?: number;                 // For display purposes
  isCorrect?: boolean;
}

export interface GameRules {
  allowLateEntry: boolean;
  allowPickChanges: boolean;
  pickChangeDeadline?: number;
  tiebreaker?: TiebreakerRule;
  eliminationOnWrong?: boolean;  // For survivor
  confidencePoints?: boolean;     // For confidence pools
}

export interface TiebreakerRule {
  type: "total_score" | "margin" | "time" | "random";
  eventId?: string;
  question?: string;
}

export interface ScoringRules {
  pointsPerCorrect: number;
  pointsPerIncorrect: number;
  bonusForStreak: Record<number, number>;  // Streak length -> bonus
  bonusForPerfect: number;
  confidenceMultiplier?: boolean;
  upsetBonus?: boolean;
  upsetBonusMultiplier?: number;
}

// ============================================================================
// PRIZE TYPES
// ============================================================================

export interface PrizePool {
  totalValue: number;
  currency: "usd" | "tokens" | "free_bets";
  distribution: PrizeDistribution[];
  guaranteedPrizes: boolean;
  minEntriesRequired?: number;
}

export interface PrizeDistribution {
  rank: number | string;          // 1, 2, 3 or "4-10"
  prize: Prize;
  winnersCount?: number;          // For ranges
}

export interface Prize {
  type: "cash" | "tokens" | "free_bet" | "merchandise" | "experience" | "entry";
  value: number;
  description: string;
  imageUrl?: string;
}

export interface ConversionOffer {
  id: string;
  type: "deposit_match" | "free_bet" | "odds_boost" | "risk_free";
  headline: string;
  description: string;

  // Offer details
  value: number;
  maxValue?: number;
  minDeposit?: number;
  rollover?: number;

  // Eligibility
  newUsersOnly: boolean;
  minRank?: number;              // Min rank to qualify
  requiresDeposit: boolean;

  // Validity
  expiresAt: number;
  termsUrl: string;
}

export interface GameSponsor {
  name: string;
  logoUrl: string;
  website?: string;
  tagline?: string;
}

// ============================================================================
// ENTRY & PICKS
// ============================================================================

export interface GameEntry {
  id: string;
  gameId: string;
  userId: string;
  username: string;

  // Picks
  picks: UserPick[];
  totalPicks: number;
  completedPicks: number;

  // Tiebreaker
  tiebreakerAnswer?: number | string;

  // Scoring
  score: number;
  correctPicks: number;
  incorrectPicks: number;
  pendingPicks: number;
  streak: number;
  longestStreak: number;

  // Rank
  rank?: number;
  percentile?: number;
  prizeWon?: Prize;

  // Status
  isEliminated: boolean;
  eliminatedAt?: number;
  eliminationRound?: number;

  // Entry tracking
  entryNumber: number;           // For multiple entries
  submittedAt?: number;
  lastUpdatedAt: number;

  createdAt: number;
}

export interface UserPick {
  pickId: string;
  selectedOptionId: string;
  selectedOptionName: string;
  confidence?: number;           // 1-N for confidence pools

  // Result
  status: PickStatus;
  pointsEarned: number;
  bonusEarned: number;

  // Timing
  madeAt: number;
  lockedAt?: number;
}

// ============================================================================
// LEADERBOARD
// ============================================================================

export interface GameLeaderboard {
  gameId: string;
  lastUpdatedAt: number;

  entries: LeaderboardEntry[];
  totalEntries: number;

  // User's position (if authenticated)
  userEntry?: LeaderboardEntry;
  userRank?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;

  // Scores
  score: number;
  correctPicks: number;
  totalPicks: number;
  accuracy: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;

  // Status
  isEliminated: boolean;
  prizeEligible: boolean;
  prize?: Prize;

  // Movement
  rankChange?: number;           // Positive = moved up
}

// ============================================================================
// STREAK TYPES
// ============================================================================

export interface StreakChallenge {
  id: string;
  name: string;
  description: string;
  sport: string;

  // Rules
  targetStreak: number;
  currentPick: StreakPick;
  upcomingPicks: StreakPick[];

  // Prize
  prizePerMilestone: Record<number, Prize>;
  grandPrize: Prize;

  // Global stats
  activeParticipants: number;
  longestActiveStreak: number;
  longestAllTimeStreak: number;

  // Timing
  resetsAt: number;              // Daily reset time
  isActive: boolean;
}

export interface StreakPick {
  id: string;
  eventId: string;
  eventName: string;
  startTime: number;
  question: string;
  options: PickOption[];
  minOdds?: number;              // Minimum odds requirement
}

export interface UserStreak {
  id: string;
  challengeId: string;
  userId: string;
  username: string;

  // Streak
  currentStreak: number;
  longestStreak: number;
  totalPicks: number;
  correctPicks: number;

  // Current pick
  currentPickId?: string;
  currentSelection?: string;
  currentStatus: "pending" | "locked" | "won" | "lost";

  // Prizes
  prizesWon: Prize[];
  totalPrizeValue: number;

  // History
  pickHistory: StreakPickHistory[];

  lastUpdatedAt: number;
}

export interface StreakPickHistory {
  pickId: string;
  eventName: string;
  selection: string;
  result: "correct" | "incorrect" | "push";
  streakBefore: number;
  streakAfter: number;
  prizeWon?: Prize;
  timestamp: number;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateGameRequest {
  name: string;
  description: string;
  type: GameType;
  sport: string;
  league: string;
  frequency: Frequency;
  periodName: string;
  entryOpenTime: number;
  entryCloseTime: number;
  startTime: number;
  endTime: number;
  picks: CreatePickRequest[];
  rules?: Partial<GameRules>;
  scoringRules?: Partial<ScoringRules>;
  prizePool: PrizePool;
  entriesPerUser?: number;
  maxEntries?: number;
  isPublic?: boolean;
}

export interface CreatePickRequest {
  eventId: string;
  eventName: string;
  startTime: number;
  type: GamePick["type"];
  question: string;
  options: Array<{ name: string; description?: string }>;
  spread?: number;
  total?: number;
  basePoints?: number;
}

export interface SubmitEntryRequest {
  gameId: string;
  picks: Array<{
    pickId: string;
    selectedOptionId: string;
    confidence?: number;
  }>;
  tiebreakerAnswer?: number | string;
}

export interface UpdatePicksRequest {
  entryId: string;
  picks: Array<{
    pickId: string;
    selectedOptionId: string;
    confidence?: number;
  }>;
}

export interface GameSearchFilters {
  type?: GameType;
  sport?: string;
  league?: string;
  status?: GameStatus;
  frequency?: Frequency;
  isFeatured?: boolean;
  hasFreePrizes?: boolean;
}

export interface GameListResponse {
  games: PredictionGame[];
  total: number;
  hasMore: boolean;
  cursor?: string;
}
