/**
 * ESPN Sports Data Client
 *
 * Fetches NFL data from ESPN's unofficial public API.
 * Includes caching and rate limiting to avoid getting blocked.
 */

import {
  type NFLTeam,
  type NFLPlayer,
  type NFLGame,
  type ESPNScoreboardResponse,
  type ESPNTeamRosterResponse,
  type ESPNEvent,
  type ESPNAthlete,
  type ESPNPlayerStats,
  type PlayerProjection,
  type CacheConfig,
  DEFAULT_CACHE_CONFIG,
} from "./types";

// =============================================================================
// ESPN API ENDPOINTS
// =============================================================================

const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_CORE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

const ENDPOINTS = {
  scoreboard: `${ESPN_BASE_URL}/scoreboard`,
  teams: `${ESPN_BASE_URL}/teams`,
  teamRoster: (teamId: string) => `${ESPN_BASE_URL}/teams/${teamId}/roster`,
  teamSchedule: (teamId: string) => `${ESPN_BASE_URL}/teams/${teamId}/schedule`,
  player: (playerId: string) => `${ESPN_CORE_URL}/athletes/${playerId}`,
  playerStats: (playerId: string) =>
    `${ESPN_CORE_URL}/athletes/${playerId}/statistics`,
  playerProjections: (playerId: string) =>
    `${ESPN_CORE_URL}/athletes/${playerId}/projections`,
  news: `${ESPN_BASE_URL}/news`,
};

// =============================================================================
// NFL TEAM DATA
// =============================================================================

export const NFL_TEAMS: NFLTeam[] = [
  { id: "1", abbreviation: "ATL", name: "Falcons", displayName: "Atlanta Falcons", shortDisplayName: "Falcons", location: "Atlanta", conference: "NFC", division: "South", byeWeek: 12 },
  { id: "2", abbreviation: "BUF", name: "Bills", displayName: "Buffalo Bills", shortDisplayName: "Bills", location: "Buffalo", conference: "AFC", division: "East", byeWeek: 12 },
  { id: "3", abbreviation: "CHI", name: "Bears", displayName: "Chicago Bears", shortDisplayName: "Bears", location: "Chicago", conference: "NFC", division: "North", byeWeek: 7 },
  { id: "4", abbreviation: "CIN", name: "Bengals", displayName: "Cincinnati Bengals", shortDisplayName: "Bengals", location: "Cincinnati", conference: "AFC", division: "North", byeWeek: 12 },
  { id: "5", abbreviation: "CLE", name: "Browns", displayName: "Cleveland Browns", shortDisplayName: "Browns", location: "Cleveland", conference: "AFC", division: "North", byeWeek: 10 },
  { id: "6", abbreviation: "DAL", name: "Cowboys", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", location: "Dallas", conference: "NFC", division: "East", byeWeek: 7 },
  { id: "7", abbreviation: "DEN", name: "Broncos", displayName: "Denver Broncos", shortDisplayName: "Broncos", location: "Denver", conference: "AFC", division: "West", byeWeek: 14 },
  { id: "8", abbreviation: "DET", name: "Lions", displayName: "Detroit Lions", shortDisplayName: "Lions", location: "Detroit", conference: "NFC", division: "North", byeWeek: 5 },
  { id: "9", abbreviation: "GB", name: "Packers", displayName: "Green Bay Packers", shortDisplayName: "Packers", location: "Green Bay", conference: "NFC", division: "North", byeWeek: 10 },
  { id: "10", abbreviation: "TEN", name: "Titans", displayName: "Tennessee Titans", shortDisplayName: "Titans", location: "Tennessee", conference: "AFC", division: "South", byeWeek: 5 },
  { id: "11", abbreviation: "IND", name: "Colts", displayName: "Indianapolis Colts", shortDisplayName: "Colts", location: "Indianapolis", conference: "AFC", division: "South", byeWeek: 14 },
  { id: "12", abbreviation: "KC", name: "Chiefs", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", location: "Kansas City", conference: "AFC", division: "West", byeWeek: 6 },
  { id: "13", abbreviation: "LV", name: "Raiders", displayName: "Las Vegas Raiders", shortDisplayName: "Raiders", location: "Las Vegas", conference: "AFC", division: "West", byeWeek: 10 },
  { id: "14", abbreviation: "LAR", name: "Rams", displayName: "Los Angeles Rams", shortDisplayName: "Rams", location: "Los Angeles", conference: "NFC", division: "West", byeWeek: 6 },
  { id: "15", abbreviation: "MIA", name: "Dolphins", displayName: "Miami Dolphins", shortDisplayName: "Dolphins", location: "Miami", conference: "AFC", division: "East", byeWeek: 6 },
  { id: "16", abbreviation: "MIN", name: "Vikings", displayName: "Minnesota Vikings", shortDisplayName: "Vikings", location: "Minnesota", conference: "NFC", division: "North", byeWeek: 6 },
  { id: "17", abbreviation: "NE", name: "Patriots", displayName: "New England Patriots", shortDisplayName: "Patriots", location: "New England", conference: "AFC", division: "East", byeWeek: 14 },
  { id: "18", abbreviation: "NO", name: "Saints", displayName: "New Orleans Saints", shortDisplayName: "Saints", location: "New Orleans", conference: "NFC", division: "South", byeWeek: 12 },
  { id: "19", abbreviation: "NYG", name: "Giants", displayName: "New York Giants", shortDisplayName: "Giants", location: "New York", conference: "NFC", division: "East", byeWeek: 11 },
  { id: "20", abbreviation: "NYJ", name: "Jets", displayName: "New York Jets", shortDisplayName: "Jets", location: "New York", conference: "AFC", division: "East", byeWeek: 12 },
  { id: "21", abbreviation: "PHI", name: "Eagles", displayName: "Philadelphia Eagles", shortDisplayName: "Eagles", location: "Philadelphia", conference: "NFC", division: "East", byeWeek: 5 },
  { id: "22", abbreviation: "ARI", name: "Cardinals", displayName: "Arizona Cardinals", shortDisplayName: "Cardinals", location: "Arizona", conference: "NFC", division: "West", byeWeek: 11 },
  { id: "23", abbreviation: "PIT", name: "Steelers", displayName: "Pittsburgh Steelers", shortDisplayName: "Steelers", location: "Pittsburgh", conference: "AFC", division: "North", byeWeek: 9 },
  { id: "24", abbreviation: "LAC", name: "Chargers", displayName: "Los Angeles Chargers", shortDisplayName: "Chargers", location: "Los Angeles", conference: "AFC", division: "West", byeWeek: 5 },
  { id: "25", abbreviation: "SF", name: "49ers", displayName: "San Francisco 49ers", shortDisplayName: "49ers", location: "San Francisco", conference: "NFC", division: "West", byeWeek: 9 },
  { id: "26", abbreviation: "SEA", name: "Seahawks", displayName: "Seattle Seahawks", shortDisplayName: "Seahawks", location: "Seattle", conference: "NFC", division: "West", byeWeek: 10 },
  { id: "27", abbreviation: "TB", name: "Buccaneers", displayName: "Tampa Bay Buccaneers", shortDisplayName: "Buccaneers", location: "Tampa Bay", conference: "NFC", division: "South", byeWeek: 11 },
  { id: "28", abbreviation: "WAS", name: "Commanders", displayName: "Washington Commanders", shortDisplayName: "Commanders", location: "Washington", conference: "NFC", division: "East", byeWeek: 14 },
  { id: "29", abbreviation: "CAR", name: "Panthers", displayName: "Carolina Panthers", shortDisplayName: "Panthers", location: "Carolina", conference: "NFC", division: "South", byeWeek: 11 },
  { id: "30", abbreviation: "JAX", name: "Jaguars", displayName: "Jacksonville Jaguars", shortDisplayName: "Jaguars", location: "Jacksonville", conference: "AFC", division: "South", byeWeek: 12 },
  { id: "33", abbreviation: "BAL", name: "Ravens", displayName: "Baltimore Ravens", shortDisplayName: "Ravens", location: "Baltimore", conference: "AFC", division: "North", byeWeek: 14 },
  { id: "34", abbreviation: "HOU", name: "Texans", displayName: "Houston Texans", shortDisplayName: "Texans", location: "Houston", conference: "AFC", division: "South", byeWeek: 14 },
];

// =============================================================================
// CACHE IMPLEMENTATION
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// RATE LIMITER
// =============================================================================

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 30, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((t) => t > now - this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.windowMs - now;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this.requests.push(now);
  }
}

// =============================================================================
// ESPN CLIENT
// =============================================================================

export class ESPNClient {
  private cache: InMemoryCache;
  private rateLimiter: RateLimiter;
  private cacheConfig: CacheConfig;

  constructor(cacheConfig: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.cache = new InMemoryCache();
    this.rateLimiter = new RateLimiter(30, 60000); // 30 requests per minute
    this.cacheConfig = cacheConfig;
  }

  private async fetch<T>(url: string, cacheKey: string, ttl: number): Promise<T> {
    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Rate limit
    await this.rateLimiter.acquire();

    // Fetch from ESPN
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; FantasyFootball/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T;

    // Cache the result
    this.cache.set(cacheKey, data, ttl);

    return data;
  }

  /**
   * Get current NFL scoreboard (all games for current week)
   */
  async getScoreboard(week?: number, season?: number): Promise<NFLGame[]> {
    let url = ENDPOINTS.scoreboard;
    const params = new URLSearchParams();
    if (week) params.append("week", week.toString());
    if (season) params.append("season", season.toString());
    if (params.toString()) url += `?${params.toString()}`;

    const cacheKey = `scoreboard:${week || "current"}:${season || "current"}`;
    const response = await this.fetch<ESPNScoreboardResponse>(
      url,
      cacheKey,
      this.cacheConfig.scoreboardTtl
    );

    return response.events.map((event) => this.parseGame(event));
  }

  /**
   * Get live scores (shorter cache TTL)
   */
  async getLiveScores(): Promise<NFLGame[]> {
    const cacheKey = "scoreboard:live";
    const response = await this.fetch<ESPNScoreboardResponse>(
      ENDPOINTS.scoreboard,
      cacheKey,
      this.cacheConfig.liveScoresTtl
    );

    return response.events
      .filter((event) => {
        const status = event.status.type.state;
        return status === "in" || status === "pre";
      })
      .map((event) => this.parseGame(event));
  }

  /**
   * Get team roster
   */
  async getTeamRoster(teamId: string): Promise<NFLPlayer[]> {
    const cacheKey = `roster:${teamId}`;
    const response = await this.fetch<ESPNTeamRosterResponse>(
      ENDPOINTS.teamRoster(teamId),
      cacheKey,
      this.cacheConfig.rosterTtl
    );

    const team = NFL_TEAMS.find((t) => t.id === teamId);

    return response.athletes.map((athlete) =>
      this.parsePlayer(athlete, team)
    );
  }

  /**
   * Get all NFL players (fetches all team rosters)
   */
  async getAllPlayers(): Promise<NFLPlayer[]> {
    const allPlayers: NFLPlayer[] = [];

    // Fetch rosters in batches to avoid rate limiting
    const batchSize = 4;
    for (let i = 0; i < NFL_TEAMS.length; i += batchSize) {
      const batch = NFL_TEAMS.slice(i, i + batchSize);
      const rosters = await Promise.all(
        batch.map((team) => this.getTeamRoster(team.id))
      );
      allPlayers.push(...rosters.flat());

      // Small delay between batches
      if (i + batchSize < NFL_TEAMS.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return allPlayers;
  }

  /**
   * Search players by name
   */
  async searchPlayers(query: string, position?: string): Promise<NFLPlayer[]> {
    // Get all players and filter locally (ESPN doesn't have a search endpoint)
    const allPlayers = await this.getAllPlayers();
    const normalizedQuery = query.toLowerCase();

    return allPlayers.filter((player) => {
      const nameMatch = player.fullName.toLowerCase().includes(normalizedQuery);
      const positionMatch = !position || player.position === position;
      return nameMatch && positionMatch;
    });
  }

  /**
   * Get players by position
   */
  async getPlayersByPosition(position: string): Promise<NFLPlayer[]> {
    const allPlayers = await this.getAllPlayers();
    return allPlayers.filter((player) => player.position === position);
  }

  /**
   * Get NFL teams
   */
  getTeams(): NFLTeam[] {
    return NFL_TEAMS;
  }

  /**
   * Get team by ID or abbreviation
   */
  getTeam(idOrAbbr: string): NFLTeam | undefined {
    return NFL_TEAMS.find(
      (t) =>
        t.id === idOrAbbr ||
        t.abbreviation.toLowerCase() === idOrAbbr.toLowerCase()
    );
  }

  /**
   * Get games for a specific team
   */
  async getTeamGames(teamId: string, season?: number): Promise<NFLGame[]> {
    const allGames = await this.getScoreboard(undefined, season);
    return allGames.filter(
      (game) =>
        game.homeTeam.teamId === teamId || game.awayTeam.teamId === teamId
    );
  }

  /**
   * Parse ESPN event to NFLGame
   */
  private parseGame(event: ESPNEvent): NFLGame {
    const competition = event.competitions[0];
    const homeCompetitor = competition.competitors.find(
      (c) => c.homeAway === "home"
    )!;
    const awayCompetitor = competition.competitors.find(
      (c) => c.homeAway === "away"
    )!;

    let status: NFLGame["status"] = "scheduled";
    switch (event.status.type.state) {
      case "pre":
        status = "scheduled";
        break;
      case "in":
        status = event.status.period === 2 ? "halftime" : "in_progress";
        break;
      case "post":
        status = event.status.type.description.includes("Overtime")
          ? "final_overtime"
          : "final";
        break;
    }

    const odds = competition.odds?.[0];

    return {
      id: event.id,
      espnId: event.id,
      season: event.season.year.toString(),
      seasonType:
        event.season.type === 1
          ? "preseason"
          : event.season.type === 2
            ? "regular"
            : "postseason",
      week: event.week.number,
      date: event.date.split("T")[0],
      startTime: event.date,
      status,
      quarter: event.status.period,
      timeRemaining: event.status.displayClock,
      homeTeam: {
        teamId: homeCompetitor.team.id,
        abbreviation: homeCompetitor.team.abbreviation,
        name: homeCompetitor.team.displayName,
        score: parseInt(homeCompetitor.score) || 0,
        record: homeCompetitor.records?.[0]?.summary,
        logoUrl: homeCompetitor.team.logo,
        quarterScores: homeCompetitor.linescores?.map((l) => l.value),
      },
      awayTeam: {
        teamId: awayCompetitor.team.id,
        abbreviation: awayCompetitor.team.abbreviation,
        name: awayCompetitor.team.displayName,
        score: parseInt(awayCompetitor.score) || 0,
        record: awayCompetitor.records?.[0]?.summary,
        logoUrl: awayCompetitor.team.logo,
        quarterScores: awayCompetitor.linescores?.map((l) => l.value),
      },
      venue: competition.venue?.fullName,
      odds: odds
        ? {
            spread: odds.spread,
            spreadFavorite: odds.details?.split(" ")[0],
            overUnder: odds.overUnder,
            moneylineHome: odds.homeTeamOdds?.moneyLine,
            moneylineAway: odds.awayTeamOdds?.moneyLine,
          }
        : undefined,
      broadcasts: competition.broadcasts?.flatMap((b) => b.names),
    };
  }

  /**
   * Parse ESPN athlete to NFLPlayer
   */
  private parsePlayer(athlete: ESPNAthlete, team?: NFLTeam): NFLPlayer {
    const injury = athlete.injuries?.[0];

    let status: NFLPlayer["status"] = "active";
    if (athlete.status?.type === "injured-reserve") {
      status = "injured_reserve";
    } else if (injury) {
      const injuryStatus = injury.status?.toLowerCase() || "";
      if (injuryStatus.includes("out")) status = "out";
      else if (injuryStatus.includes("doubtful")) status = "doubtful";
      else if (injuryStatus.includes("questionable")) status = "questionable";
      else if (injuryStatus.includes("probable")) status = "probable";
    }

    return {
      id: athlete.id,
      espnId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      fullName: athlete.fullName,
      displayName: athlete.displayName,
      position: athlete.position.abbreviation,
      positionAbbreviation: athlete.position.abbreviation,
      jerseyNumber: athlete.jersey ? parseInt(athlete.jersey) : undefined,
      teamId: team?.id,
      teamAbbreviation: team?.abbreviation,
      teamName: team?.displayName,
      height: athlete.displayHeight,
      weight: athlete.weight,
      age: athlete.age,
      dateOfBirth: athlete.dateOfBirth,
      college: athlete.college?.name,
      experience: athlete.experience?.years,
      status,
      injuryStatus: injury?.status,
      injuryBodyPart: injury?.details?.location,
      injuryDescription: injury?.details?.detail,
      headshotUrl: athlete.headshot?.href,
      byeWeek: team?.byeWeek || 0,
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear specific cache entry
   */
  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }
}

// Singleton instance
let espnClient: ESPNClient | null = null;

export function getESPNClient(config?: CacheConfig): ESPNClient {
  if (!espnClient) {
    espnClient = new ESPNClient(config);
  }
  return espnClient;
}
