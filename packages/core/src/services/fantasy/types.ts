/**
 * Fantasy Football - Type Definitions
 */

// =============================================================================
// SCORING TYPES
// =============================================================================

export type ScoringType = "ppr" | "half_ppr" | "standard";

export interface ScoringRules {
  // Passing
  passingYardsPerPoint: number;
  passingTd: number;
  interception: number;

  // Rushing
  rushingYardsPerPoint: number;
  rushingTd: number;

  // Receiving
  receivingYardsPerPoint: number;
  receivingTd: number;
  reception: number;

  // Misc offense
  fumble: number;
  twoPointConversion: number;

  // Kicking
  fgMade: number;
  fgMissed: number;
  fg40_49: number;
  fg50Plus: number;
  extraPoint: number;

  // Defense
  sack: number;
  defenseInterception: number;
  fumbleRecovery: number;
  defenseTd: number;
  safety: number;
  blockedKick: number;
  pointsAllowed0: number;
  pointsAllowed1_6: number;
  pointsAllowed7_13: number;
  pointsAllowed14_20: number;
  pointsAllowed21_27: number;
  pointsAllowed28_34: number;
  pointsAllowed35Plus: number;
}

export const DEFAULT_PPR_RULES: ScoringRules = {
  passingYardsPerPoint: 0.04,
  passingTd: 4,
  interception: -2,
  rushingYardsPerPoint: 0.1,
  rushingTd: 6,
  receivingYardsPerPoint: 0.1,
  receivingTd: 6,
  reception: 1,
  fumble: -2,
  twoPointConversion: 2,
  fgMade: 3,
  fgMissed: -1,
  fg40_49: 4,
  fg50Plus: 5,
  extraPoint: 1,
  sack: 1,
  defenseInterception: 2,
  fumbleRecovery: 2,
  defenseTd: 6,
  safety: 2,
  blockedKick: 2,
  pointsAllowed0: 10,
  pointsAllowed1_6: 7,
  pointsAllowed7_13: 4,
  pointsAllowed14_20: 1,
  pointsAllowed21_27: 0,
  pointsAllowed28_34: -1,
  pointsAllowed35Plus: -4,
};

export const DEFAULT_HALF_PPR_RULES: ScoringRules = {
  ...DEFAULT_PPR_RULES,
  reception: 0.5,
};

export const DEFAULT_STANDARD_RULES: ScoringRules = {
  ...DEFAULT_PPR_RULES,
  reception: 0,
};

export function getScoringRules(type: ScoringType): ScoringRules {
  switch (type) {
    case "ppr":
      return DEFAULT_PPR_RULES;
    case "half_ppr":
      return DEFAULT_HALF_PPR_RULES;
    case "standard":
      return DEFAULT_STANDARD_RULES;
    default:
      return DEFAULT_PPR_RULES;
  }
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
  | "probable"
  | "suspended"
  | "practice_squad"
  | "free_agent";

export interface PlayerStats {
  // Passing
  passingAttempts: number;
  passingCompletions: number;
  passingYards: number;
  passingTouchdowns: number;
  interceptions: number;
  sacks: number;
  sackYardsLost: number;

  // Rushing
  rushingAttempts: number;
  rushingYards: number;
  rushingTouchdowns: number;

  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;

  // Misc
  fumbles: number;
  fumblesLost: number;
  twoPointConversions: number;

  // Kicking
  fgAttempts: number;
  fgMade: number;
  fg0_39: number;
  fg40_49: number;
  fg50Plus: number;
  xpAttempts: number;
  xpMade: number;

  // Defense (for DEF position)
  defSacks: number;
  defInterceptions: number;
  defFumbleRecoveries: number;
  defTouchdowns: number;
  defSafeties: number;
  defBlockedKicks: number;
  defPointsAllowed: number;
  defYardsAllowed: number;
}

export const EMPTY_STATS: PlayerStats = {
  passingAttempts: 0,
  passingCompletions: 0,
  passingYards: 0,
  passingTouchdowns: 0,
  interceptions: 0,
  sacks: 0,
  sackYardsLost: 0,
  rushingAttempts: 0,
  rushingYards: 0,
  rushingTouchdowns: 0,
  targets: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTouchdowns: 0,
  fumbles: 0,
  fumblesLost: 0,
  twoPointConversions: 0,
  fgAttempts: 0,
  fgMade: 0,
  fg0_39: 0,
  fg40_49: 0,
  fg50Plus: 0,
  xpAttempts: 0,
  xpMade: 0,
  defSacks: 0,
  defInterceptions: 0,
  defFumbleRecoveries: 0,
  defTouchdowns: 0,
  defSafeties: 0,
  defBlockedKicks: 0,
  defPointsAllowed: 0,
  defYardsAllowed: 0,
};

export interface Player {
  id: string;
  externalId: string;
  name: string;
  firstName: string;
  lastName: string;
  position: Position;
  nflTeam: string;
  nflTeamId?: string;
  jerseyNumber?: number;
  headshotUrl?: string;
  status: PlayerStatus;
  injuryStatus?: string;
  injuryBodyPart?: string;
  byeWeek: number;
  experience?: number;
  age?: number;
  college?: string;
  percentOwned: number;
  percentStarted: number;
  adp?: number;
  projectedPoints: number;
  seasonPoints: number;
  averagePoints: number;
}

export interface PlayerProjection {
  playerId: string;
  week: number;
  season: string;
  projectedStats: Partial<PlayerStats>;
  projectedPoints: number;
  projectedPointsPpr: number;
  projectedPointsHalfPpr: number;
  floor: number;
  ceiling: number;
  confidence: number;
}

// =============================================================================
// ROSTER TYPES
// =============================================================================

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

export const STARTER_SLOTS: RosterSlot[] = [
  "QB",
  "RB1",
  "RB2",
  "WR1",
  "WR2",
  "TE",
  "FLEX",
  "K",
  "DEF",
];

export const BENCH_SLOTS: RosterSlot[] = [
  "BN1",
  "BN2",
  "BN3",
  "BN4",
  "BN5",
  "BN6",
];

export interface RosterPositions {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  k: number;
  def: number;
  bench: number;
  ir: number;
}

export const DEFAULT_ROSTER_POSITIONS: RosterPositions = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  k: 1,
  def: 1,
  bench: 6,
  ir: 1,
};

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
  entries: RosterEntry[];
  totalProjected: number;
  totalActual: number;
}

// =============================================================================
// LEAGUE TYPES
// =============================================================================

export type DraftType = "snake" | "auction" | "dynasty" | "keeper";

export type LeagueStatus =
  | "pre_draft"
  | "drafting"
  | "active"
  | "playoffs"
  | "complete"
  | "archived";

export type WaiverType = "faab" | "rolling" | "reverse_standings";

export interface LeagueSettings {
  scoringType: ScoringType;
  scoringRules: ScoringRules;
  draftType: DraftType;
  maxTeams: number;
  rosterPositions: RosterPositions;
  waiverType: WaiverType;
  waiverBudget: number;
  waiverProcessDay: number;
  tradeDeadlineWeek?: number;
  tradeReviewPeriodHours: number;
  vetoVotesRequired: number;
  regularSeasonWeeks: number;
  playoffTeams: number;
  playoffWeeks: number;
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  scoringType: "ppr",
  scoringRules: DEFAULT_PPR_RULES,
  draftType: "snake",
  maxTeams: 12,
  rosterPositions: DEFAULT_ROSTER_POSITIONS,
  waiverType: "faab",
  waiverBudget: 100,
  waiverProcessDay: 3, // Wednesday
  tradeDeadlineWeek: 12,
  tradeReviewPeriodHours: 24,
  vetoVotesRequired: 4,
  regularSeasonWeeks: 14,
  playoffTeams: 6,
  playoffWeeks: 3,
};

export interface League {
  id: string;
  name: string;
  description?: string;
  commissionerId: string;
  inviteCode: string;
  logoUrl?: string;
  settings: LeagueSettings;
  season: string;
  currentWeek: number;
  status: LeagueStatus;
  currentTeams: number;
  matrixRoomId?: string;
  draftScheduledAt?: number;
  draftCompletedAt?: number;
  createdAt: number;
  updatedAt: number;
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
  draftPosition?: number;
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
// MATCHUP TYPES
// =============================================================================

export type MatchupStatus = "scheduled" | "in_progress" | "final";

export interface Matchup {
  id: string;
  leagueId: string;
  season: string;
  week: number;
  teamA: Team;
  teamB: Team;
  teamAScore: number;
  teamBScore: number;
  teamAProjected: number;
  teamBProjected: number;
  status: MatchupStatus;
  isPlayoff: boolean;
  playoffRound?: number;
  winnerId?: string;
  isTie: boolean;
  margin: number;
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
  initiatorId: string;
  initiatorTeamId: string;
  status: TransactionStatus;
  details: TransactionDetails;
  vetoVotes: number;
  approveVotes: number;
  processAfter?: number;
  processedAt?: number;
  rejectionReason?: string;
  createdAt: number;
}

export interface TransactionDetails {
  // For add/drop
  addPlayerId?: string;
  addPlayerName?: string;
  dropPlayerId?: string;
  dropPlayerName?: string;

  // For waiver
  waiverPriority?: number;
  faabBid?: number;
  waiverType?: string;

  // For trade
  tradePartnerTeamId?: string;
  tradePartnerUserId?: string;
  playersOffered?: string[];
  playersRequested?: string[];
  draftPicksOffered?: string[];
  draftPicksRequested?: string[];
  faabOffered?: number;
  faabRequested?: number;

  // For commissioner action
  actionType?: string;
  reason?: string;
}

// =============================================================================
// DRAFT TYPES
// =============================================================================

export type DraftStatus =
  | "scheduled"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

export interface Draft {
  id: string;
  leagueId: string;
  type: DraftType;
  status: DraftStatus;
  secondsPerPick: number;
  auctionBudget?: number;
  draftOrder: string[];
  currentRound: number;
  currentPick: number;
  currentTeamId?: string;
  pickDeadline?: number;
  totalPicks: number;
  completedPicks: number;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface DraftPick {
  id: string;
  draftId: string;
  leagueId: string;
  teamId: string;
  playerId: string;
  round: number;
  pick: number;
  overallPick: number;
  auctionAmount?: number;
  isAutoPick: boolean;
  autoPickReason?: string;
  playerName: string;
  playerPosition: string;
  playerTeam: string;
  adpAtDraft?: number;
  pickedAt: number;
}

// =============================================================================
// MARKET TYPES
// =============================================================================

export type MarketType =
  | "matchup"
  | "league_winner"
  | "player_prop"
  | "weekly_high_score"
  | "division_winner"
  | "over_under"
  | "custom";

export type MarketStatus =
  | "pending"
  | "open"
  | "locked"
  | "settled"
  | "cancelled"
  | "voided";

export interface MarketOutcome {
  id: string;
  label: string;
  description?: string;
  odds: number;
  impliedProbability: number;
  totalVolume: number;
}

export interface FantasyMarket {
  id: string;
  leagueId?: string;
  type: MarketType;
  title: string;
  description: string;
  imageUrl?: string;
  referenceType?: "matchup" | "player" | "team" | "league";
  referenceId?: string;
  week?: number;
  season: string;
  outcomes: MarketOutcome[];
  liquidityParameter: number;
  totalLiquidity: number;
  totalVolume: number;
  status: MarketStatus;
  winningOutcomeId?: string;
  settlementValue?: number;
  opensAt: number;
  closesAt: number;
  settlesAt?: number;
  createdBy: string;
  createdAt: number;
}

export type BetStatus =
  | "pending"
  | "active"
  | "won"
  | "lost"
  | "cashed_out"
  | "voided"
  | "refunded";

export interface Bet {
  id: string;
  userId: string;
  marketId: string;
  leagueId?: string;
  outcomeId: string;
  outcomeLabel: string;
  amount: number;
  oddsAtPlacement: number;
  impliedProbabilityAtPlacement: number;
  potentialPayout: number;
  status: BetStatus;
  settledAmount?: number;
  profitLoss?: number;
  settledAt?: number;
  cashedOutAmount?: number;
  cashedOutAt?: number;
  placedAt: number;
}
