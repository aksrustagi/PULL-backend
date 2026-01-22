/**
 * Fantasy Markets Mobile - Type Definitions
 */

// =============================================================================
// API TYPES
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  timestamp: string;
}

// =============================================================================
// USER TYPES
// =============================================================================

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  walletBalance: number;
  createdAt: number;
}

// =============================================================================
// LEAGUE TYPES
// =============================================================================

export type ScoringType = "ppr" | "half_ppr" | "standard";
export type DraftType = "snake" | "auction" | "dynasty" | "keeper";
export type LeagueStatus = "pre_draft" | "drafting" | "active" | "playoffs" | "complete";

export interface League {
  id: string;
  name: string;
  description?: string;
  commissionerId: string;
  inviteCode: string;
  logoUrl?: string;
  scoringType: ScoringType;
  draftType: DraftType;
  maxTeams: number;
  currentTeams: number;
  season: string;
  currentWeek: number;
  status: LeagueStatus;
  matrixRoomId?: string;
  createdAt: number;
}

export interface LeagueStanding {
  teamId: string;
  teamName: string;
  ownerName: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string;
  playoffSeed?: number;
}

// =============================================================================
// TEAM TYPES
// =============================================================================

export interface Team {
  id: string;
  leagueId: string;
  ownerId: string;
  ownerName: string;
  name: string;
  logoUrl?: string;
  waiverPriority: number;
  faabBudget: number;
  faabSpent: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank?: number;
  playoffSeed?: number;
  isEliminated: boolean;
  isPlayoffBound: boolean;
  projectedPoints: number;
  currentWeekPoints: number;
  streak: string;
}

// =============================================================================
// PLAYER TYPES
// =============================================================================

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export type PlayerStatus =
  | "active"
  | "injured_reserve"
  | "out"
  | "doubtful"
  | "questionable"
  | "probable";

export interface Player {
  id: string;
  externalId: string;
  name: string;
  firstName: string;
  lastName: string;
  position: Position;
  team: string;
  teamId?: string;
  status: PlayerStatus;
  injuryStatus?: string;
  headshotUrl?: string;
  byeWeek: number;
  projectedPoints: number;
  seasonPoints: number;
  averagePoints: number;
  percentOwned: number;
  percentStarted: number;
}

export type RosterSlot =
  | "QB"
  | "RB1"
  | "RB2"
  | "WR1"
  | "WR2"
  | "TE"
  | "FLEX"
  | "K"
  | "DEF"
  | "BN1"
  | "BN2"
  | "BN3"
  | "BN4"
  | "BN5"
  | "BN6"
  | "IR";

export interface RosterEntry {
  playerId: string;
  player: Player;
  slot: RosterSlot;
  isStarter: boolean;
  isLocked: boolean;
  projectedPoints: number;
  actualPoints?: number;
}

export interface Roster {
  teamId: string;
  leagueId: string;
  week: number;
  entries: RosterEntry[];
  totalProjected: number;
  totalActual: number;
}

// =============================================================================
// MATCHUP TYPES
// =============================================================================

export type MatchupStatus = "scheduled" | "in_progress" | "final";

export interface Matchup {
  id: string;
  leagueId: string;
  week: number;
  status: MatchupStatus;
  team: MatchupTeam;
  opponent: MatchupTeam;
  isPlayoff: boolean;
  winProbability: number;
}

export interface MatchupTeam {
  id: string;
  name: string;
  score: number;
  projected: number;
  roster: RosterEntry[];
}

// =============================================================================
// MARKET TYPES
// =============================================================================

export type MarketType =
  | "matchup"
  | "league_winner"
  | "player_prop"
  | "weekly_high_score"
  | "over_under"
  | "custom";
export type MarketStatus = "open" | "locked" | "settled" | "cancelled" | "voided";

export interface MarketOutcome {
  id: string;
  label: string;
  description?: string;
  odds: number;
  displayOdds: string;
  impliedProbability: number;
  totalVolume: number;
}

export interface Market {
  id: string;
  leagueId?: string;
  type: MarketType;
  title: string;
  description: string;
  imageUrl?: string;
  outcomes: MarketOutcome[];
  totalVolume: number;
  totalLiquidity: number;
  status: MarketStatus;
  closesAt: number;
  settlesAt?: number;
  winningOutcomeId?: string;
}

export type BetStatus = "active" | "won" | "lost" | "cashed_out" | "voided" | "refunded";

export interface Bet {
  id: string;
  marketId: string;
  market?: Market;
  outcomeId: string;
  outcomeLabel: string;
  amount: number;
  oddsAtPlacement: number;
  displayOdds: string;
  impliedProbability: number;
  potentialPayout: number;
  currentValue?: number;
  status: BetStatus;
  settledAmount?: number;
  profitLoss?: number;
  placedAt: number;
  settledAt?: number;
  cashedOutAt?: number;
}

// =============================================================================
// TRANSACTION TYPES
// =============================================================================

export type TransactionType =
  | "add"
  | "drop"
  | "waiver_claim"
  | "trade"
  | "commissioner_action";
export type TransactionStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled"
  | "vetoed";

export interface Transaction {
  id: string;
  leagueId: string;
  type: TransactionType;
  status: TransactionStatus;
  initiatorName: string;
  teamName: string;
  details: {
    addPlayerName?: string;
    dropPlayerName?: string;
    faabBid?: number;
    tradePartnerName?: string;
    playersOffered?: string[];
    playersRequested?: string[];
  };
  createdAt: number;
  processedAt?: number;
}

// =============================================================================
// NFL TYPES
// =============================================================================

export interface NFLTeam {
  id: string;
  abbreviation: string;
  name: string;
  displayName: string;
  conference: string;
  division: string;
  byeWeek: number;
}

export interface NFLGame {
  id: string;
  week: number;
  date: string;
  startTime: string;
  status: string;
  quarter?: number;
  timeRemaining?: string;
  homeTeam: NFLTeamScore;
  awayTeam: NFLTeamScore;
  venue?: string;
}

export interface NFLTeamScore {
  teamId: string;
  abbreviation: string;
  name: string;
  score: number;
  record?: string;
}

// =============================================================================
// CHAT TYPES
// =============================================================================

export interface ChatRoom {
  id: string;
  matrixRoomId: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  contentType: string;
  body: string;
  formattedBody?: string;
  timestamp: number;
  isEdited: boolean;
  replyToId?: string;
}
