/**
 * Sports Data Service Types
 *
 * Types for ESPN and SportsRadar API integrations
 */

// =============================================================================
// NFL TYPES
// =============================================================================

export interface NFLTeam {
  id: string;
  abbreviation: string;
  name: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  color?: string;
  alternateColor?: string;
  logoUrl?: string;
  conference: string;
  division: string;
  byeWeek: number;
}

export interface NFLPlayer {
  id: string;
  espnId?: string;
  sportsRadarId?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  position: string;
  positionAbbreviation: string;
  jerseyNumber?: number;
  teamId?: string;
  teamAbbreviation?: string;
  teamName?: string;
  height?: string;
  weight?: number;
  age?: number;
  dateOfBirth?: string;
  college?: string;
  experience?: number;
  status: string;
  injuryStatus?: string;
  injuryBodyPart?: string;
  injuryDescription?: string;
  headshotUrl?: string;
  byeWeek: number;
}

export interface NFLGame {
  id: string;
  espnId?: string;
  season: string;
  seasonType: "preseason" | "regular" | "postseason";
  week: number;
  date: string;
  startTime: string;
  status: GameStatus;
  quarter?: number;
  timeRemaining?: string;
  possession?: string;
  homeTeam: NFLTeamScore;
  awayTeam: NFLTeamScore;
  venue?: string;
  weather?: GameWeather;
  odds?: GameOdds;
  broadcasts?: string[];
}

export interface NFLTeamScore {
  teamId: string;
  abbreviation: string;
  name: string;
  score: number;
  record?: string;
  logoUrl?: string;
  quarterScores?: number[];
}

export type GameStatus =
  | "scheduled"
  | "pregame"
  | "in_progress"
  | "halftime"
  | "end_period"
  | "final"
  | "final_overtime"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "delayed";

export interface GameWeather {
  temperature?: number;
  condition?: string;
  humidity?: number;
  windSpeed?: number;
  windDirection?: string;
}

export interface GameOdds {
  spread?: number;
  spreadFavorite?: string;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
}

// =============================================================================
// PLAYER STATS TYPES
// =============================================================================

export interface ESPNPlayerStats {
  playerId: string;
  gameId?: string;
  season: string;
  week: number;
  opponent?: string;
  isHome?: boolean;
  gameStatus?: string;

  // Raw stats from ESPN
  stats: Record<string, number>;

  // Parsed stats
  passing?: PassingStats;
  rushing?: RushingStats;
  receiving?: ReceivingStats;
  kicking?: KickingStats;
  defense?: DefenseStats;
  fumbles?: FumbleStats;

  // Fantasy points (pre-calculated by ESPN)
  fantasyPoints?: number;
  fantasyPointsPpr?: number;
}

export interface PassingStats {
  attempts: number;
  completions: number;
  yards: number;
  touchdowns: number;
  interceptions: number;
  sacks: number;
  sackYards: number;
  qbRating?: number;
  completionPercentage?: number;
}

export interface RushingStats {
  attempts: number;
  yards: number;
  touchdowns: number;
  yardsPerAttempt?: number;
  longRush?: number;
}

export interface ReceivingStats {
  targets: number;
  receptions: number;
  yards: number;
  touchdowns: number;
  yardsPerReception?: number;
  longReception?: number;
}

export interface KickingStats {
  fgAttempts: number;
  fgMade: number;
  fgLong?: number;
  fg0_39: number;
  fg40_49: number;
  fg50Plus: number;
  xpAttempts: number;
  xpMade: number;
}

export interface DefenseStats {
  sacks: number;
  interceptions: number;
  fumbleRecoveries: number;
  touchdowns: number;
  safeties: number;
  blockedKicks: number;
  pointsAllowed: number;
  yardsAllowed: number;
  passYardsAllowed?: number;
  rushYardsAllowed?: number;
}

export interface FumbleStats {
  fumbles: number;
  fumblesLost: number;
}

// =============================================================================
// PROJECTION TYPES
// =============================================================================

export interface PlayerProjection {
  playerId: string;
  name: string;
  position: string;
  team: string;
  opponent?: string;
  week: number;
  season: string;

  // Projected stats
  projectedStats: Partial<ESPNPlayerStats>;

  // Fantasy points projections
  projectedPoints: number;
  projectedPointsPpr: number;
  projectedPointsHalfPpr: number;

  // Confidence
  floor: number;
  ceiling: number;
  stdDev?: number;

  // Source
  source: "espn" | "sportsradar" | "consensus" | "internal";
  updatedAt: number;
}

// =============================================================================
// ESPN API RESPONSE TYPES
// =============================================================================

export interface ESPNScoreboardResponse {
  leagues: Array<{
    id: string;
    name: string;
    abbreviation: string;
    season: {
      year: number;
      type: number;
      name: string;
    };
    calendarType: string;
    calendarIsWhitelist: boolean;
    calendarStartDate: string;
    calendarEndDate: string;
  }>;
  season: {
    type: number;
    year: number;
  };
  week: {
    number: number;
  };
  events: ESPNEvent[];
}

export interface ESPNEvent {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
    slug: string;
  };
  week: {
    number: number;
  };
  competitions: ESPNCompetition[];
  status: {
    clock: number;
    displayClock: string;
    period: number;
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
      description: string;
      detail: string;
      shortDetail: string;
    };
  };
}

export interface ESPNCompetition {
  id: string;
  uid: string;
  date: string;
  attendance?: number;
  type: {
    id: string;
    abbreviation: string;
  };
  timeValid: boolean;
  neutralSite: boolean;
  conferenceCompetition: boolean;
  playByPlayAvailable: boolean;
  recent: boolean;
  venue?: {
    id: string;
    fullName: string;
    address: {
      city: string;
      state: string;
    };
    indoor: boolean;
  };
  competitors: ESPNCompetitor[];
  odds?: Array<{
    provider: {
      id: string;
      name: string;
      priority: number;
    };
    details: string;
    overUnder: number;
    spread: number;
    overOdds?: number;
    underOdds?: number;
    homeTeamOdds?: {
      moneyLine: number;
    };
    awayTeamOdds?: {
      moneyLine: number;
    };
  }>;
  broadcasts?: Array<{
    market: string;
    names: string[];
  }>;
}

export interface ESPNCompetitor {
  id: string;
  uid: string;
  type: string;
  order: number;
  homeAway: "home" | "away";
  winner?: boolean;
  team: {
    id: string;
    uid: string;
    location: string;
    name: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    color?: string;
    alternateColor?: string;
    logo?: string;
  };
  score: string;
  linescores?: Array<{
    value: number;
  }>;
  statistics?: Array<{
    name: string;
    abbreviation: string;
    displayValue: string;
  }>;
  records?: Array<{
    name: string;
    abbreviation: string;
    type: string;
    summary: string;
  }>;
}

export interface ESPNTeamRosterResponse {
  team: {
    id: string;
    abbreviation: string;
    location: string;
    name: string;
    displayName: string;
    shortDisplayName: string;
    color: string;
    alternateColor: string;
    logo: string;
  };
  athletes: ESPNAthlete[];
}

export interface ESPNAthlete {
  id: string;
  uid: string;
  guid: string;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  shortName: string;
  weight?: number;
  displayWeight?: string;
  height?: number;
  displayHeight?: string;
  age?: number;
  dateOfBirth?: string;
  jersey?: string;
  position: {
    id: string;
    name: string;
    displayName: string;
    abbreviation: string;
  };
  college?: {
    id: string;
    name: string;
    shortName: string;
  };
  experience?: {
    years: number;
  };
  status?: {
    id: string;
    name: string;
    type: string;
    abbreviation: string;
  };
  injuries?: Array<{
    status: string;
    date: string;
    type?: {
      id: string;
      name: string;
      description: string;
      abbreviation: string;
    };
    details?: {
      fantasyStatus?: {
        description: string;
        abbreviation: string;
      };
      side?: string;
      returnDate?: string;
      type: string;
      location: string;
      detail: string;
    };
  }>;
  headshot?: {
    href: string;
    alt: string;
  };
}

// =============================================================================
// CACHE CONFIG
// =============================================================================

export interface CacheConfig {
  // TTL in seconds
  scoreboardTtl: number;
  rosterTtl: number;
  playerStatsTtl: number;
  projectionsTtl: number;

  // During games
  liveScoresTtl: number;
  liveStatsTtl: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  scoreboardTtl: 60, // 1 minute
  rosterTtl: 3600, // 1 hour
  playerStatsTtl: 300, // 5 minutes
  projectionsTtl: 14400, // 4 hours

  // During games - more frequent updates
  liveScoresTtl: 30, // 30 seconds
  liveStatsTtl: 60, // 1 minute
};
