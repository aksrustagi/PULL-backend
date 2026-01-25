/**
 * The Odds API Types
 * Type definitions for sports betting odds data
 */

// ============================================================================
// Sport Types
// ============================================================================

export type SportKey =
  | "americanfootball_nfl"
  | "americanfootball_ncaaf"
  | "basketball_nba"
  | "basketball_ncaab"
  | "baseball_mlb"
  | "icehockey_nhl"
  | "soccer_epl"
  | "soccer_uefa_champs_league"
  | "golf_pga"
  | "mma_ufc"
  | "tennis_atp"
  | "tennis_wta";

export interface Sport {
  key: SportKey;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

// ============================================================================
// Event/Game Types
// ============================================================================

export interface Event {
  id: string;
  sport_key: SportKey;
  sport_title: string;
  commence_time: string; // ISO 8601
  home_team: string;
  away_team: string;
  bookmakers?: Bookmaker[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: MarketKey;
  last_update: string;
  outcomes: Outcome[];
}

export type MarketKey =
  | "h2h"           // Head to head (moneyline)
  | "spreads"       // Point spreads
  | "totals"        // Over/under totals
  | "outrights"     // Futures/outrights
  | "h2h_lay"       // Lay betting
  | "alternate_spreads"
  | "alternate_totals"
  | "btts"          // Both teams to score
  | "draw_no_bet"
  | "player_props";

export interface Outcome {
  name: string;
  price: number;      // Decimal odds
  point?: number;     // For spreads/totals
  description?: string;
}

// ============================================================================
// Odds Response Types
// ============================================================================

export interface OddsResponse {
  events: Event[];
  timestamp: number;
}

export interface OddsUpdate {
  eventId: string;
  sportKey: SportKey;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  markets: NormalizedMarket[];
  timestamp: number;
}

export interface NormalizedMarket {
  type: MarketKey;
  bookmaker: string;
  outcomes: NormalizedOutcome[];
  lastUpdate: string;
}

export interface NormalizedOutcome {
  name: string;
  odds: number;          // Decimal odds
  impliedProbability: number;  // 0-100
  point?: number;
  americanOdds: number;  // American format
}

// ============================================================================
// Historical Odds
// ============================================================================

export interface HistoricalOddsParams {
  sport: SportKey;
  eventId: string;
  date: string; // YYYY-MM-DD
  markets?: MarketKey[];
}

export interface HistoricalOddsResponse {
  timestamp: string;
  previous_timestamp: string;
  data: Event[];
}

// ============================================================================
// Scores/Results
// ============================================================================

export interface Score {
  id: string;
  sport_key: SportKey;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: TeamScore[] | null;
  last_update: string | null;
}

export interface TeamScore {
  name: string;
  score: string;
}

// ============================================================================
// API Client Types
// ============================================================================

export interface OddsApiClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface GetOddsParams {
  sport: SportKey;
  regions?: string[];    // us, uk, eu, au
  markets?: MarketKey[];
  oddsFormat?: "decimal" | "american";
  eventIds?: string[];
  bookmakers?: string[];
  commenceTimeFrom?: string;
  commenceTimeTo?: string;
}

export interface GetScoresParams {
  sport: SportKey;
  daysFrom?: number;
  eventIds?: string[];
}

export interface RateLimitInfo {
  requestsRemaining: number;
  requestsUsed: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class OddsApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OddsApiError";
  }
}

// ============================================================================
// Polling Types
// ============================================================================

export interface PollingConfig {
  sports: SportKey[];
  markets: MarketKey[];
  regions: string[];
  intervalMs: number;
  onUpdate: (updates: OddsUpdate[]) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface PollingState {
  isRunning: boolean;
  lastPollTime: number;
  pollCount: number;
  errorCount: number;
  lastError?: Error;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_REGIONS = ["us"];
export const DEFAULT_MARKETS: MarketKey[] = ["h2h", "spreads", "totals"];

export const SPORT_GROUPS = {
  NFL: "americanfootball_nfl",
  NCAAF: "americanfootball_ncaaf",
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  EPL: "soccer_epl",
  UCL: "soccer_uefa_champs_league",
  PGA: "golf_pga",
  UFC: "mma_ufc",
  ATP: "tennis_atp",
  WTA: "tennis_wta",
} as const;

// ============================================================================
// Utility Types
// ============================================================================

export interface CachedOdds {
  eventId: string;
  data: OddsUpdate;
  cachedAt: number;
  expiresAt: number;
}

export interface OddsChange {
  eventId: string;
  market: MarketKey;
  bookmaker: string;
  outcome: string;
  previousOdds: number;
  currentOdds: number;
  changePercent: number;
  timestamp: number;
}
