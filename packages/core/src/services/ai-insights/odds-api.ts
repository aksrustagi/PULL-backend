/**
 * Odds Live API Integration
 *
 * Real-time odds data from multiple sportsbooks for betting insights
 * and market analysis across all supported sports.
 */

import { z } from "zod";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const SportKeySchema = z.enum([
  // NFL
  "americanfootball_nfl",
  "americanfootball_ncaaf",

  // Basketball
  "basketball_nba",
  "basketball_ncaab",

  // Golf
  "golf_masters_tournament_winner",
  "golf_pga_championship_winner",
  "golf_us_open_winner",
  "golf_the_open_championship_winner",

  // MLB
  "baseball_mlb",

  // Soccer (bonus)
  "soccer_usa_mls",
]);

export type SportKey = z.infer<typeof SportKeySchema>;

export const MarketKeySchema = z.enum([
  "h2h",           // Moneyline
  "spreads",       // Point spreads
  "totals",        // Over/Under
  "outrights",     // Tournament winner
  "h2h_lay",       // Lay odds (exchanges)
  "alternate_spreads",
  "alternate_totals",
  "player_props",
  "team_props",
]);

export type MarketKey = z.infer<typeof MarketKeySchema>;

export const BookmakerKeySchema = z.enum([
  "fanduel",
  "draftkings",
  "betmgm",
  "caesars",
  "pointsbet",
  "barstool",
  "wynn",
  "betrivers",
  "superbook",
  "pinnacle",
  "bovada",
  "betonlineag",
]);

export type BookmakerKey = z.infer<typeof BookmakerKeySchema>;

export interface OddsApiConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface Event {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
}

export interface OddsMovement {
  bookmaker: string;
  market: string;
  outcome: string;
  openPrice: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  direction: "up" | "down" | "stable";
  timestamp: number;
}

export interface BestOdds {
  outcome: string;
  bestPrice: number;
  bookmaker: string;
  averagePrice: number;
  worstPrice: number;
  edgePercent: number;
}

export interface ArbitrageOpportunity {
  eventId: string;
  market: string;
  outcomes: Array<{
    outcome: string;
    bookmaker: string;
    price: number;
    stake: number;
  }>;
  totalStake: number;
  guaranteedProfit: number;
  profitPercent: number;
  expiresAt: number;
}

export interface PlayerProp {
  playerId: string;
  playerName: string;
  team: string;
  prop: string;
  line: number;
  overOdds: number;
  underOdds: number;
  bookmaker: string;
  lastUpdate: string;
}

// ============================================================================
// ODDS API CLIENT
// ============================================================================

export class OddsApiClient {
  private config: Required<OddsApiConfig>;

  constructor(config: OddsApiConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.the-odds-api.com/v4",
    };
  }

  // ============================================================================
  // SPORTS
  // ============================================================================

  async getSports(all: boolean = false): Promise<Sport[]> {
    const params = new URLSearchParams({
      apiKey: this.config.apiKey,
      all: all.toString(),
    });

    const response = await fetch(`${this.config.baseUrl}/sports?${params}`);
    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }
    return response.json();
  }

  // ============================================================================
  // ODDS
  // ============================================================================

  async getOdds(
    sportKey: SportKey,
    options: {
      regions?: string[];
      markets?: MarketKey[];
      bookmakers?: BookmakerKey[];
      oddsFormat?: "american" | "decimal";
      dateFormat?: "iso" | "unix";
    } = {}
  ): Promise<Event[]> {
    const params = new URLSearchParams({
      apiKey: this.config.apiKey,
      regions: (options.regions ?? ["us"]).join(","),
      markets: (options.markets ?? ["h2h", "spreads", "totals"]).join(","),
      oddsFormat: options.oddsFormat ?? "american",
      dateFormat: options.dateFormat ?? "iso",
    });

    if (options.bookmakers?.length) {
      params.set("bookmakers", options.bookmakers.join(","));
    }

    const response = await fetch(
      `${this.config.baseUrl}/sports/${sportKey}/odds?${params}`
    );

    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }

    return response.json();
  }

  async getEventOdds(
    sportKey: SportKey,
    eventId: string,
    options: {
      regions?: string[];
      markets?: MarketKey[];
      bookmakers?: BookmakerKey[];
      oddsFormat?: "american" | "decimal";
    } = {}
  ): Promise<Event> {
    const params = new URLSearchParams({
      apiKey: this.config.apiKey,
      regions: (options.regions ?? ["us"]).join(","),
      markets: (options.markets ?? ["h2h", "spreads", "totals"]).join(","),
      oddsFormat: options.oddsFormat ?? "american",
    });

    if (options.bookmakers?.length) {
      params.set("bookmakers", options.bookmakers.join(","));
    }

    const response = await fetch(
      `${this.config.baseUrl}/sports/${sportKey}/events/${eventId}/odds?${params}`
    );

    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }

    return response.json();
  }

  // ============================================================================
  // HISTORICAL ODDS
  // ============================================================================

  async getHistoricalOdds(
    sportKey: SportKey,
    eventId: string,
    date: string,
    options: {
      regions?: string[];
      markets?: MarketKey[];
      oddsFormat?: "american" | "decimal";
    } = {}
  ): Promise<Event> {
    const params = new URLSearchParams({
      apiKey: this.config.apiKey,
      regions: (options.regions ?? ["us"]).join(","),
      markets: (options.markets ?? ["h2h", "spreads", "totals"]).join(","),
      oddsFormat: options.oddsFormat ?? "american",
      date: date,
    });

    const response = await fetch(
      `${this.config.baseUrl}/historical/sports/${sportKey}/events/${eventId}/odds?${params}`
    );

    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }

    return response.json();
  }

  // ============================================================================
  // ANALYSIS METHODS
  // ============================================================================

  findBestOdds(event: Event, market: MarketKey): BestOdds[] {
    const outcomeOdds: Map<string, Array<{ bookmaker: string; price: number }>> = new Map();

    // Collect all odds for each outcome
    for (const bookmaker of event.bookmakers) {
      const marketData = bookmaker.markets.find(m => m.key === market);
      if (!marketData) continue;

      for (const outcome of marketData.outcomes) {
        const key = outcome.point !== undefined
          ? `${outcome.name}:${outcome.point}`
          : outcome.name;

        if (!outcomeOdds.has(key)) {
          outcomeOdds.set(key, []);
        }
        outcomeOdds.get(key)!.push({
          bookmaker: bookmaker.key,
          price: outcome.price,
        });
      }
    }

    // Calculate best odds for each outcome
    const results: BestOdds[] = [];
    for (const [outcome, odds] of outcomeOdds) {
      const sorted = [...odds].sort((a, b) => b.price - a.price);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const avg = odds.reduce((sum, o) => sum + o.price, 0) / odds.length;

      results.push({
        outcome,
        bestPrice: best.price,
        bookmaker: best.bookmaker,
        averagePrice: Math.round(avg),
        worstPrice: worst.price,
        edgePercent: this.calculateEdge(best.price, avg),
      });
    }

    return results;
  }

  findArbitrageOpportunities(
    event: Event,
    market: MarketKey,
    minProfitPercent: number = 0.5
  ): ArbitrageOpportunity | null {
    // Get best odds for each outcome
    const bestOdds = this.findBestOdds(event, market);

    if (bestOdds.length !== 2) {
      // Arbitrage calculation for 2-way markets only (for simplicity)
      return null;
    }

    // Convert American odds to decimal for calculation
    const decimalOdds = bestOdds.map(o => ({
      ...o,
      decimalPrice: this.americanToDecimal(o.bestPrice),
    }));

    // Calculate implied probability sum
    const impliedSum = decimalOdds.reduce(
      (sum, o) => sum + 1 / o.decimalPrice,
      0
    );

    // Arbitrage exists if implied sum < 1
    if (impliedSum >= 1) {
      return null;
    }

    const profitPercent = (1 - impliedSum) * 100;
    if (profitPercent < minProfitPercent) {
      return null;
    }

    // Calculate optimal stakes for $100 total
    const totalStake = 100;
    const stakes = decimalOdds.map(o => ({
      outcome: o.outcome,
      bookmaker: o.bookmaker,
      price: o.bestPrice,
      stake: (totalStake * (1 / o.decimalPrice)) / impliedSum,
    }));

    return {
      eventId: event.id,
      market,
      outcomes: stakes,
      totalStake,
      guaranteedProfit: totalStake * (1 / impliedSum - 1),
      profitPercent,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  calculateOddsMovement(
    currentEvent: Event,
    historicalEvent: Event,
    market: MarketKey
  ): OddsMovement[] {
    const movements: OddsMovement[] = [];

    for (const currentBookmaker of currentEvent.bookmakers) {
      const historicalBookmaker = historicalEvent.bookmakers.find(
        b => b.key === currentBookmaker.key
      );
      if (!historicalBookmaker) continue;

      const currentMarket = currentBookmaker.markets.find(m => m.key === market);
      const historicalMarket = historicalBookmaker.markets.find(m => m.key === market);
      if (!currentMarket || !historicalMarket) continue;

      for (const currentOutcome of currentMarket.outcomes) {
        const historicalOutcome = historicalMarket.outcomes.find(
          o => o.name === currentOutcome.name && o.point === currentOutcome.point
        );
        if (!historicalOutcome) continue;

        const change = currentOutcome.price - historicalOutcome.price;
        const changePercent = (change / Math.abs(historicalOutcome.price)) * 100;

        movements.push({
          bookmaker: currentBookmaker.key,
          market,
          outcome: currentOutcome.point !== undefined
            ? `${currentOutcome.name} ${currentOutcome.point}`
            : currentOutcome.name,
          openPrice: historicalOutcome.price,
          currentPrice: currentOutcome.price,
          change,
          changePercent,
          direction: change > 0 ? "up" : change < 0 ? "down" : "stable",
          timestamp: Date.now(),
        });
      }
    }

    return movements;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private americanToDecimal(american: number): number {
    if (american > 0) {
      return american / 100 + 1;
    } else {
      return 100 / Math.abs(american) + 1;
    }
  }

  private decimalToAmerican(decimal: number): number {
    if (decimal >= 2) {
      return (decimal - 1) * 100;
    } else {
      return -100 / (decimal - 1);
    }
  }

  private calculateEdge(bestPrice: number, avgPrice: number): number {
    const bestDecimal = this.americanToDecimal(bestPrice);
    const avgDecimal = this.americanToDecimal(avgPrice);
    return ((bestDecimal - avgDecimal) / avgDecimal) * 100;
  }

  impliedProbability(americanOdds: number): number {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  calculateEV(
    winProbability: number,
    americanOdds: number,
    stake: number = 100
  ): number {
    const decimal = this.americanToDecimal(americanOdds);
    const winAmount = stake * (decimal - 1);
    return winProbability * winAmount - (1 - winProbability) * stake;
  }
}

// ============================================================================
// SPECIALIZED SPORT CLIENTS
// ============================================================================

export class NFLOddsClient extends OddsApiClient {
  async getNFLGames(): Promise<Event[]> {
    return this.getOdds("americanfootball_nfl", {
      markets: ["h2h", "spreads", "totals"],
    });
  }

  async getNCAAFGames(): Promise<Event[]> {
    return this.getOdds("americanfootball_ncaaf", {
      markets: ["h2h", "spreads", "totals"],
    });
  }
}

export class NCAABasketballOddsClient extends OddsApiClient {
  async getMarchMadnessGames(): Promise<Event[]> {
    return this.getOdds("basketball_ncaab", {
      markets: ["h2h", "spreads", "totals"],
    });
  }

  async getTournamentOutrights(): Promise<Event[]> {
    // Note: Tournament outrights typically available closer to March
    return this.getOdds("basketball_ncaab", {
      markets: ["outrights"],
    });
  }
}

export class GolfOddsClient extends OddsApiClient {
  async getMastersOdds(): Promise<Event[]> {
    return this.getOdds("golf_masters_tournament_winner", {
      markets: ["outrights"],
    });
  }

  async getPGAChampionshipOdds(): Promise<Event[]> {
    return this.getOdds("golf_pga_championship_winner", {
      markets: ["outrights"],
    });
  }

  async getUSOpenOdds(): Promise<Event[]> {
    return this.getOdds("golf_us_open_winner", {
      markets: ["outrights"],
    });
  }

  async getOpenChampionshipOdds(): Promise<Event[]> {
    return this.getOdds("golf_the_open_championship_winner", {
      markets: ["outrights"],
    });
  }
}

export class NBAOddsClient extends OddsApiClient {
  async getNBAGames(): Promise<Event[]> {
    return this.getOdds("basketball_nba", {
      markets: ["h2h", "spreads", "totals"],
    });
  }

  async getPlayoffGames(): Promise<Event[]> {
    // Filter for playoff games based on date
    const games = await this.getNBAGames();
    // Playoff games typically April-June
    return games.filter(g => {
      const month = new Date(g.commence_time).getMonth();
      return month >= 3 && month <= 5; // April-June
    });
  }
}

export class MLBOddsClient extends OddsApiClient {
  async getMLBGames(): Promise<Event[]> {
    return this.getOdds("baseball_mlb", {
      markets: ["h2h", "spreads", "totals"],
    });
  }

  async getPlayoffGames(): Promise<Event[]> {
    const games = await this.getMLBGames();
    return games.filter(g => {
      const month = new Date(g.commence_time).getMonth();
      return month === 9; // October
    });
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let clientInstance: OddsApiClient | null = null;

export function getOddsApiClient(): OddsApiClient {
  if (!clientInstance) {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      throw new Error("ODDS_API_KEY environment variable is required");
    }
    clientInstance = new OddsApiClient({ apiKey });
  }
  return clientInstance;
}

export function createOddsApiClient(config: OddsApiConfig): OddsApiClient {
  return new OddsApiClient(config);
}

export function createNFLOddsClient(config: OddsApiConfig): NFLOddsClient {
  return new NFLOddsClient(config);
}

export function createNCAABasketballOddsClient(config: OddsApiConfig): NCAABasketballOddsClient {
  return new NCAABasketballOddsClient(config);
}

export function createGolfOddsClient(config: OddsApiConfig): GolfOddsClient {
  return new GolfOddsClient(config);
}

export function createNBAOddsClient(config: OddsApiConfig): NBAOddsClient {
  return new NBAOddsClient(config);
}

export function createMLBOddsClient(config: OddsApiConfig): MLBOddsClient {
  return new MLBOddsClient(config);
}
