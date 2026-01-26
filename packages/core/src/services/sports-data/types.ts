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

// =============================================================================
// NBA TYPES
// =============================================================================

export interface NBATeam {
  id: string;
  abbreviation: string;
  name: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  color?: string;
  alternateColor?: string;
  logoUrl?: string;
  conference: "Eastern" | "Western";
  division: string;
}

export interface NBAPlayer {
  id: string;
  espnId?: string;
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
}

export interface NBAGame {
  id: string;
  espnId?: string;
  season: string;
  seasonType: "preseason" | "regular" | "postseason";
  date: string;
  startTime: string;
  status: NBAGameStatus;
  period?: number;
  timeRemaining?: string;
  homeTeam: NBATeamScore;
  awayTeam: NBATeamScore;
  venue?: string;
  attendance?: number;
  odds?: NBAGameOdds;
  broadcasts?: string[];
  seriesInfo?: NBASeriesInfo;
}

export type NBAGameStatus =
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

export interface NBATeamScore {
  teamId: string;
  abbreviation: string;
  name: string;
  score: number;
  record?: string;
  logoUrl?: string;
  periodScores?: number[];
}

export interface NBAGameOdds {
  spread?: number;
  spreadFavorite?: string;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
}

export interface NBASeriesInfo {
  seriesId: string;
  round: number;
  roundName: string;
  homeWins: number;
  awayWins: number;
  gameNumber: number;
  status: "in_progress" | "complete";
}

export interface NBAStanding {
  teamId: string;
  team: NBATeam;
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
  gamesBehind: number;
  homeRecord: string;
  awayRecord: string;
  lastTen: string;
  streak: string;
  playoffSeed?: number;
  clinched?: "playoffs" | "division" | "conference" | "eliminated";
}

export interface NBAPlayoffBracket {
  season: string;
  east: NBAConferenceBracket;
  west: NBAConferenceBracket;
  finals: NBAPlayoffSeries | null;
  champion: NBATeam | null;
}

export interface NBAConferenceBracket {
  firstRound: NBAPlayoffSeries[];
  secondRound: NBAPlayoffSeries[];
  conferenceFinals: NBAPlayoffSeries | null;
}

export interface NBAPlayoffSeries {
  id: string;
  round: number;
  roundName: string;
  conference: "Eastern" | "Western" | "Finals";
  higherSeed: NBAPlayoffTeam;
  lowerSeed: NBAPlayoffTeam;
  status: "scheduled" | "in_progress" | "complete";
  winner?: string;
  games: NBAPlayoffGame[];
}

export interface NBAPlayoffTeam {
  teamId: string;
  team: NBATeam;
  seed: number;
  wins: number;
}

export interface NBAPlayoffGame {
  gameNumber: number;
  gameId?: string;
  date?: string;
  status: "scheduled" | "in_progress" | "complete";
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  winner?: string;
}

export interface NBAPlayerStats {
  playerId: string;
  playerName: string;
  teamId?: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  plusMinus?: number;
}

export interface NBAInjuryReport {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbreviation: string;
  position: string;
  status: "out" | "doubtful" | "questionable" | "probable" | "day-to-day";
  bodyPart?: string;
  description?: string;
  updatedAt: string;
}

export interface NBAMarket {
  id: string;
  type: NBAMarketType;
  status: "open" | "locked" | "settled";
  gameId?: string;
  seriesId?: string;
  playerId?: string;
  description: string;
  outcomes: NBAMarketOutcome[];
  closesAt?: string;
  settledAt?: string;
  result?: string;
}

export type NBAMarketType =
  | "game_winner"
  | "game_spread"
  | "game_total"
  | "series_winner"
  | "series_length"
  | "conference_winner"
  | "finals_winner"
  | "finals_mvp"
  | "player_points"
  | "player_rebounds"
  | "player_assists";

export interface NBAMarketOutcome {
  id: string;
  name: string;
  price: number;
  point?: number;
}

// ESPN API Response Types for NBA
export interface ESPNNBAScoreboardResponse {
  leagues: Array<{
    id: string;
    name: string;
    abbreviation: string;
    season: {
      year: number;
      type: number;
      name: string;
    };
  }>;
  season: {
    type: number;
    year: number;
  };
  day: {
    date: string;
  };
  events: ESPNNBAEvent[];
}

export interface ESPNNBAEvent {
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
  competitions: ESPNNBACompetition[];
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

export interface ESPNNBACompetition {
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
  competitors: ESPNNBACompetitor[];
  odds?: Array<{
    provider: {
      id: string;
      name: string;
      priority: number;
    };
    details: string;
    overUnder: number;
    spread: number;
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
  series?: {
    type: string;
    title: string;
    summary: string;
    completed: boolean;
    totalCompetitions: number;
    competitors: Array<{
      id: string;
      uid: string;
      wins: number;
      seriesRecord: string;
    }>;
  };
}

export interface ESPNNBACompetitor {
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

export interface ESPNNBATeamRosterResponse {
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
  athletes: ESPNNBAAthlete[];
}

export interface ESPNNBAAthlete {
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

export interface ESPNNBAStandingsResponse {
  uid: string;
  id: string;
  name: string;
  abbreviation: string;
  children: Array<{
    uid: string;
    id: string;
    name: string;
    abbreviation: string;
    standings: {
      id: string;
      name: string;
      displayName: string;
      season: number;
      seasonType: number;
      entries: Array<{
        team: {
          id: string;
          uid: string;
          location: string;
          name: string;
          abbreviation: string;
          displayName: string;
          shortDisplayName: string;
          logo: string;
        };
        stats: Array<{
          name: string;
          displayName: string;
          shortDisplayName: string;
          description: string;
          abbreviation: string;
          type: string;
          value: number;
          displayValue: string;
        }>;
      }>;
    };
  }>;
}
