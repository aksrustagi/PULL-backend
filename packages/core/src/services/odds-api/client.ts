/**
 * The Odds API Client
 * Client for fetching sports betting odds data
 */

import type {
  OddsApiClientConfig,
  Sport,
  SportKey,
  Event,
  Score,
  GetOddsParams,
  GetScoresParams,
  RateLimitInfo,
  Logger,
  OddsUpdate,
  NormalizedMarket,
  NormalizedOutcome,
  MarketKey,
  DEFAULT_REGIONS,
  DEFAULT_MARKETS,
} from "./types";
import { OddsApiError } from "./types";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASE_URL = "https://api.the-odds-api.com/v4";

// ============================================================================
// Odds API Client
// ============================================================================

export class OddsApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;
  private lastRateLimitInfo: RateLimitInfo | null = null;

  constructor(config: OddsApiClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[OddsAPI] ${msg}`, meta),
      info: (msg, meta) => console.info(`[OddsAPI] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[OddsAPI] ${msg}`, meta),
      error: (msg, meta) => console.error(`[OddsAPI] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // HTTP Request Handler
  // ==========================================================================

  private async makeRequest<T>(
    path: string,
    params: Record<string, string | string[] | undefined> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add API key
    url.searchParams.set("apiKey", this.apiKey);

    // Add other params
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(","));
        } else {
          url.searchParams.set(key, value);
        }
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Extract rate limit info
        this.lastRateLimitInfo = {
          requestsRemaining: parseInt(
            response.headers.get("x-requests-remaining") ?? "0",
            10
          ),
          requestsUsed: parseInt(
            response.headers.get("x-requests-used") ?? "0",
            10
          ),
        };

        if (!response.ok) {
          const errorBody = await response.text();
          throw new OddsApiError(
            `HTTP ${response.status}: ${errorBody}`,
            "HTTP_ERROR",
            response.status
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 4xx errors (except 429)
        if (error instanceof OddsApiError) {
          if (
            error.statusCode &&
            error.statusCode >= 400 &&
            error.statusCode < 500 &&
            error.statusCode !== 429
          ) {
            throw error;
          }
        }

        // Handle rate limiting
        if (error instanceof OddsApiError && error.statusCode === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
          this.logger.warn(`Rate limited, waiting ${waitTime}ms`, { attempt });
          await this.sleep(waitTime);
          continue;
        }

        // Retry on network errors
        if (attempt < this.maxRetries) {
          const waitTime = 1000 * Math.pow(2, attempt);
          this.logger.warn(`Request failed, retrying in ${waitTime}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(waitTime);
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // API Methods
  // ==========================================================================

  /**
   * Get list of available sports
   */
  async getSports(): Promise<Sport[]> {
    try {
      return await this.makeRequest<Sport[]>("/sports");
    } catch (error) {
      this.logger.error("Failed to get sports", { error });
      throw error;
    }
  }

  /**
   * Get odds for a specific sport
   */
  async getOdds(params: GetOddsParams): Promise<Event[]> {
    try {
      const queryParams: Record<string, string | string[] | undefined> = {
        regions: params.regions ?? ["us"],
        markets: params.markets ?? ["h2h", "spreads", "totals"],
        oddsFormat: params.oddsFormat ?? "decimal",
        eventIds: params.eventIds,
        bookmakers: params.bookmakers,
        commenceTimeFrom: params.commenceTimeFrom,
        commenceTimeTo: params.commenceTimeTo,
      };

      return await this.makeRequest<Event[]>(
        `/sports/${params.sport}/odds`,
        queryParams
      );
    } catch (error) {
      this.logger.error("Failed to get odds", { sport: params.sport, error });
      throw error;
    }
  }

  /**
   * Get odds for multiple sports
   */
  async getOddsMultipleSports(
    sports: SportKey[],
    options: Omit<GetOddsParams, "sport"> = {}
  ): Promise<Map<SportKey, Event[]>> {
    const results = new Map<SportKey, Event[]>();

    await Promise.all(
      sports.map(async (sport) => {
        try {
          const events = await this.getOdds({ ...options, sport });
          results.set(sport, events);
        } catch (error) {
          this.logger.error("Failed to get odds for sport", { sport, error });
          results.set(sport, []);
        }
      })
    );

    return results;
  }

  /**
   * Get live and upcoming events for a sport
   */
  async getEvents(sport: SportKey): Promise<Event[]> {
    try {
      return await this.makeRequest<Event[]>(`/sports/${sport}/events`);
    } catch (error) {
      this.logger.error("Failed to get events", { sport, error });
      throw error;
    }
  }

  /**
   * Get scores for a sport
   */
  async getScores(params: GetScoresParams): Promise<Score[]> {
    try {
      const queryParams: Record<string, string | undefined> = {
        daysFrom: params.daysFrom?.toString(),
        eventIds: params.eventIds?.join(","),
      };

      return await this.makeRequest<Score[]>(
        `/sports/${params.sport}/scores`,
        queryParams
      );
    } catch (error) {
      this.logger.error("Failed to get scores", { sport: params.sport, error });
      throw error;
    }
  }

  /**
   * Get historical odds (requires paid plan)
   */
  async getHistoricalOdds(
    sport: SportKey,
    date: string,
    eventId?: string
  ): Promise<Event[]> {
    try {
      const queryParams: Record<string, string | undefined> = {
        date,
        eventIds: eventId,
      };

      return await this.makeRequest<Event[]>(
        `/historical/sports/${sport}/odds`,
        queryParams
      );
    } catch (error) {
      this.logger.error("Failed to get historical odds", { sport, date, error });
      throw error;
    }
  }

  // ==========================================================================
  // Normalized Data Methods
  // ==========================================================================

  /**
   * Get normalized odds updates for a sport
   */
  async getNormalizedOdds(params: GetOddsParams): Promise<OddsUpdate[]> {
    const events = await this.getOdds(params);
    return events.map((event) => this.normalizeEvent(event));
  }

  /**
   * Normalize a single event to our internal format
   */
  normalizeEvent(event: Event): OddsUpdate {
    const markets: NormalizedMarket[] = [];

    if (event.bookmakers) {
      for (const bookmaker of event.bookmakers) {
        for (const market of bookmaker.markets) {
          markets.push({
            type: market.key,
            bookmaker: bookmaker.key,
            outcomes: market.outcomes.map((outcome) =>
              this.normalizeOutcome(outcome)
            ),
            lastUpdate: market.last_update,
          });
        }
      }
    }

    return {
      eventId: event.id,
      sportKey: event.sport_key,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      markets,
      timestamp: Date.now(),
    };
  }

  /**
   * Normalize outcome with calculated probabilities
   */
  private normalizeOutcome(outcome: {
    name: string;
    price: number;
    point?: number;
  }): NormalizedOutcome {
    const decimalOdds = outcome.price;
    const impliedProbability = (1 / decimalOdds) * 100;
    const americanOdds = this.decimalToAmerican(decimalOdds);

    return {
      name: outcome.name,
      odds: decimalOdds,
      impliedProbability: Math.round(impliedProbability * 100) / 100,
      point: outcome.point,
      americanOdds,
    };
  }

  /**
   * Convert decimal odds to American format
   */
  private decimalToAmerican(decimal: number): number {
    if (decimal >= 2) {
      return Math.round((decimal - 1) * 100);
    } else {
      return Math.round(-100 / (decimal - 1));
    }
  }

  // ==========================================================================
  // Best Odds Methods
  // ==========================================================================

  /**
   * Get best odds across bookmakers for an event
   */
  async getBestOdds(
    sport: SportKey,
    eventId: string,
    market: MarketKey = "h2h"
  ): Promise<Map<string, NormalizedOutcome & { bookmaker: string }>> {
    const events = await this.getOdds({
      sport,
      eventIds: [eventId],
      markets: [market],
    });

    const bestOdds = new Map<string, NormalizedOutcome & { bookmaker: string }>();

    const event = events[0];
    if (!event?.bookmakers) return bestOdds;

    for (const bookmaker of event.bookmakers) {
      for (const mkt of bookmaker.markets) {
        if (mkt.key !== market) continue;

        for (const outcome of mkt.outcomes) {
          const normalized = this.normalizeOutcome(outcome);
          const key = outcome.point
            ? `${outcome.name}:${outcome.point}`
            : outcome.name;

          const current = bestOdds.get(key);
          if (!current || normalized.odds > current.odds) {
            bestOdds.set(key, { ...normalized, bookmaker: bookmaker.key });
          }
        }
      }
    }

    return bestOdds;
  }

  /**
   * Find arbitrage opportunities
   */
  async findArbitrage(
    sport: SportKey,
    eventId: string
  ): Promise<{
    hasArbitrage: boolean;
    margin: number;
    opportunities: Array<{
      outcome: string;
      bookmaker: string;
      odds: number;
      stake: number;
    }>;
  } | null> {
    const events = await this.getOdds({
      sport,
      eventIds: [eventId],
      markets: ["h2h"],
    });

    const event = events[0];
    if (!event?.bookmakers) return null;

    // Find best odds for each outcome
    const bestOdds: Record<string, { odds: number; bookmaker: string }> = {};

    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        if (market.key !== "h2h") continue;

        for (const outcome of market.outcomes) {
          if (
            !bestOdds[outcome.name] ||
            outcome.price > bestOdds[outcome.name].odds
          ) {
            bestOdds[outcome.name] = {
              odds: outcome.price,
              bookmaker: bookmaker.key,
            };
          }
        }
      }
    }

    const outcomes = Object.keys(bestOdds);
    if (outcomes.length < 2) return null;

    // Calculate total implied probability
    const totalImplied = outcomes.reduce((sum, outcome) => {
      return sum + 1 / bestOdds[outcome].odds;
    }, 0);

    const hasArbitrage = totalImplied < 1;
    const margin = (1 - totalImplied) * 100;

    // Calculate optimal stakes (for $100 total stake)
    const totalStake = 100;
    const opportunities = outcomes.map((outcome) => {
      const stake = (totalStake * (1 / bestOdds[outcome].odds)) / totalImplied;
      return {
        outcome,
        bookmaker: bestOdds[outcome].bookmaker,
        odds: bestOdds[outcome].odds,
        stake: Math.round(stake * 100) / 100,
      };
    });

    return {
      hasArbitrage,
      margin: Math.round(margin * 100) / 100,
      opportunities,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get rate limit info from last request
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getSports();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get upcoming events count by sport
   */
  async getUpcomingEventsCount(): Promise<Map<SportKey, number>> {
    const sports = await this.getSports();
    const counts = new Map<SportKey, number>();

    await Promise.all(
      sports
        .filter((s) => s.active)
        .map(async (sport) => {
          try {
            const events = await this.getEvents(sport.key);
            counts.set(sport.key, events.length);
          } catch {
            counts.set(sport.key, 0);
          }
        })
    );

    return counts;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let clientInstance: OddsApiClient | null = null;

export function getOddsApiClient(config?: OddsApiClientConfig): OddsApiClient {
  if (!clientInstance && config) {
    clientInstance = new OddsApiClient(config);
  }

  if (!clientInstance) {
    throw new Error("OddsApiClient not initialized. Call with config first.");
  }

  return clientInstance;
}

export function initOddsApiClient(config: OddsApiClientConfig): OddsApiClient {
  clientInstance = new OddsApiClient(config);
  return clientInstance;
}

export default OddsApiClient;
