/**
 * ESPN NBA Data Client
 *
 * Fetches NBA data from ESPN's unofficial public API.
 * Includes caching and rate limiting to avoid getting blocked.
 */

import {
  type NBATeam,
  type NBAPlayer,
  type NBAGame,
  type NBAStanding,
  type NBAPlayoffBracket,
  type NBAPlayoffSeries,
  type NBAInjuryReport,
  type NBAPlayerStats,
  type ESPNNBAScoreboardResponse,
  type ESPNNBATeamRosterResponse,
  type ESPNNBAEvent,
  type ESPNNBAAthlete,
  type ESPNNBAStandingsResponse,
  type CacheConfig,
  DEFAULT_CACHE_CONFIG,
} from "./types";

// =============================================================================
// ESPN API ENDPOINTS
// =============================================================================

const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_CORE_URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";

const ENDPOINTS = {
  scoreboard: `${ESPN_BASE_URL}/scoreboard`,
  teams: `${ESPN_BASE_URL}/teams`,
  teamRoster: (teamId: string) => `${ESPN_BASE_URL}/teams/${teamId}/roster`,
  teamSchedule: (teamId: string) => `${ESPN_BASE_URL}/teams/${teamId}/schedule`,
  standings: `${ESPN_BASE_URL}/standings`,
  player: (playerId: string) => `${ESPN_CORE_URL}/athletes/${playerId}`,
  playerStats: (playerId: string) =>
    `${ESPN_CORE_URL}/athletes/${playerId}/statistics`,
  news: `${ESPN_BASE_URL}/news`,
  injuries: `${ESPN_BASE_URL}/injuries`,
};

// =============================================================================
// NBA TEAM DATA
// =============================================================================

export const NBA_TEAMS: NBATeam[] = [
  // Eastern Conference - Atlantic Division
  { id: "2", abbreviation: "BOS", name: "Celtics", displayName: "Boston Celtics", shortDisplayName: "Celtics", location: "Boston", conference: "Eastern", division: "Atlantic" },
  { id: "17", abbreviation: "BKN", name: "Nets", displayName: "Brooklyn Nets", shortDisplayName: "Nets", location: "Brooklyn", conference: "Eastern", division: "Atlantic" },
  { id: "18", abbreviation: "NY", name: "Knicks", displayName: "New York Knicks", shortDisplayName: "Knicks", location: "New York", conference: "Eastern", division: "Atlantic" },
  { id: "20", abbreviation: "PHI", name: "76ers", displayName: "Philadelphia 76ers", shortDisplayName: "76ers", location: "Philadelphia", conference: "Eastern", division: "Atlantic" },
  { id: "28", abbreviation: "TOR", name: "Raptors", displayName: "Toronto Raptors", shortDisplayName: "Raptors", location: "Toronto", conference: "Eastern", division: "Atlantic" },

  // Eastern Conference - Central Division
  { id: "4", abbreviation: "CHI", name: "Bulls", displayName: "Chicago Bulls", shortDisplayName: "Bulls", location: "Chicago", conference: "Eastern", division: "Central" },
  { id: "5", abbreviation: "CLE", name: "Cavaliers", displayName: "Cleveland Cavaliers", shortDisplayName: "Cavaliers", location: "Cleveland", conference: "Eastern", division: "Central" },
  { id: "8", abbreviation: "DET", name: "Pistons", displayName: "Detroit Pistons", shortDisplayName: "Pistons", location: "Detroit", conference: "Eastern", division: "Central" },
  { id: "11", abbreviation: "IND", name: "Pacers", displayName: "Indiana Pacers", shortDisplayName: "Pacers", location: "Indiana", conference: "Eastern", division: "Central" },
  { id: "15", abbreviation: "MIL", name: "Bucks", displayName: "Milwaukee Bucks", shortDisplayName: "Bucks", location: "Milwaukee", conference: "Eastern", division: "Central" },

  // Eastern Conference - Southeast Division
  { id: "1", abbreviation: "ATL", name: "Hawks", displayName: "Atlanta Hawks", shortDisplayName: "Hawks", location: "Atlanta", conference: "Eastern", division: "Southeast" },
  { id: "3", abbreviation: "CHA", name: "Hornets", displayName: "Charlotte Hornets", shortDisplayName: "Hornets", location: "Charlotte", conference: "Eastern", division: "Southeast" },
  { id: "14", abbreviation: "MIA", name: "Heat", displayName: "Miami Heat", shortDisplayName: "Heat", location: "Miami", conference: "Eastern", division: "Southeast" },
  { id: "19", abbreviation: "ORL", name: "Magic", displayName: "Orlando Magic", shortDisplayName: "Magic", location: "Orlando", conference: "Eastern", division: "Southeast" },
  { id: "27", abbreviation: "WAS", name: "Wizards", displayName: "Washington Wizards", shortDisplayName: "Wizards", location: "Washington", conference: "Eastern", division: "Southeast" },

  // Western Conference - Northwest Division
  { id: "7", abbreviation: "DEN", name: "Nuggets", displayName: "Denver Nuggets", shortDisplayName: "Nuggets", location: "Denver", conference: "Western", division: "Northwest" },
  { id: "16", abbreviation: "MIN", name: "Timberwolves", displayName: "Minnesota Timberwolves", shortDisplayName: "Timberwolves", location: "Minnesota", conference: "Western", division: "Northwest" },
  { id: "22", abbreviation: "OKC", name: "Thunder", displayName: "Oklahoma City Thunder", shortDisplayName: "Thunder", location: "Oklahoma City", conference: "Western", division: "Northwest" },
  { id: "21", abbreviation: "POR", name: "Trail Blazers", displayName: "Portland Trail Blazers", shortDisplayName: "Trail Blazers", location: "Portland", conference: "Western", division: "Northwest" },
  { id: "26", abbreviation: "UTA", name: "Jazz", displayName: "Utah Jazz", shortDisplayName: "Jazz", location: "Utah", conference: "Western", division: "Northwest" },

  // Western Conference - Pacific Division
  { id: "9", abbreviation: "GS", name: "Warriors", displayName: "Golden State Warriors", shortDisplayName: "Warriors", location: "Golden State", conference: "Western", division: "Pacific" },
  { id: "12", abbreviation: "LAC", name: "Clippers", displayName: "LA Clippers", shortDisplayName: "Clippers", location: "Los Angeles", conference: "Western", division: "Pacific" },
  { id: "13", abbreviation: "LAL", name: "Lakers", displayName: "Los Angeles Lakers", shortDisplayName: "Lakers", location: "Los Angeles", conference: "Western", division: "Pacific" },
  { id: "23", abbreviation: "PHX", name: "Suns", displayName: "Phoenix Suns", shortDisplayName: "Suns", location: "Phoenix", conference: "Western", division: "Pacific" },
  { id: "24", abbreviation: "SAC", name: "Kings", displayName: "Sacramento Kings", shortDisplayName: "Kings", location: "Sacramento", conference: "Western", division: "Pacific" },

  // Western Conference - Southwest Division
  { id: "6", abbreviation: "DAL", name: "Mavericks", displayName: "Dallas Mavericks", shortDisplayName: "Mavericks", location: "Dallas", conference: "Western", division: "Southwest" },
  { id: "10", abbreviation: "HOU", name: "Rockets", displayName: "Houston Rockets", shortDisplayName: "Rockets", location: "Houston", conference: "Western", division: "Southwest" },
  { id: "29", abbreviation: "MEM", name: "Grizzlies", displayName: "Memphis Grizzlies", shortDisplayName: "Grizzlies", location: "Memphis", conference: "Western", division: "Southwest" },
  { id: "30", abbreviation: "NOP", name: "Pelicans", displayName: "New Orleans Pelicans", shortDisplayName: "Pelicans", location: "New Orleans", conference: "Western", division: "Southwest" },
  { id: "25", abbreviation: "SA", name: "Spurs", displayName: "San Antonio Spurs", shortDisplayName: "Spurs", location: "San Antonio", conference: "Western", division: "Southwest" },
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
// NBA ESPN CLIENT
// =============================================================================

export class NBAESPNClient {
  private cache: InMemoryCache;
  private rateLimiter: RateLimiter;
  private cacheConfig: CacheConfig;

  constructor(cacheConfig: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.cache = new InMemoryCache();
    this.rateLimiter = new RateLimiter(30, 60000);
    this.cacheConfig = cacheConfig;
  }

  private async fetch<T>(url: string, cacheKey: string, ttl: number): Promise<T> {
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.rateLimiter.acquire();

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; SportsDataService/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T;
    this.cache.set(cacheKey, data, ttl);

    return data;
  }

  // ===========================================================================
  // TEAMS
  // ===========================================================================

  getTeams(): NBATeam[] {
    return NBA_TEAMS;
  }

  getTeam(idOrAbbr: string): NBATeam | undefined {
    return NBA_TEAMS.find(
      (t) =>
        t.id === idOrAbbr ||
        t.abbreviation.toLowerCase() === idOrAbbr.toLowerCase()
    );
  }

  getTeamsByConference(conference: "Eastern" | "Western"): NBATeam[] {
    return NBA_TEAMS.filter((t) => t.conference === conference);
  }

  getTeamsByDivision(division: string): NBATeam[] {
    return NBA_TEAMS.filter((t) => t.division === division);
  }

  // ===========================================================================
  // GAMES / SCOREBOARD
  // ===========================================================================

  async getScoreboard(date?: string): Promise<NBAGame[]> {
    let url = ENDPOINTS.scoreboard;
    if (date) {
      url += `?dates=${date.replace(/-/g, "")}`;
    }

    const cacheKey = `nba:scoreboard:${date || "today"}`;
    const response = await this.fetch<ESPNNBAScoreboardResponse>(
      url,
      cacheKey,
      this.cacheConfig.scoreboardTtl
    );

    return response.events.map((event) => this.parseGame(event));
  }

  async getLiveGames(): Promise<NBAGame[]> {
    const cacheKey = "nba:scoreboard:live";
    const response = await this.fetch<ESPNNBAScoreboardResponse>(
      ENDPOINTS.scoreboard,
      cacheKey,
      this.cacheConfig.liveScoresTtl
    );

    return response.events
      .filter((event) => {
        const status = event.status.type.state;
        return status === "in";
      })
      .map((event) => this.parseGame(event));
  }

  async getGameById(gameId: string): Promise<NBAGame | null> {
    const games = await this.getScoreboard();
    return games.find((g) => g.id === gameId) || null;
  }

  async getTeamGames(teamId: string): Promise<NBAGame[]> {
    const cacheKey = `nba:team:${teamId}:schedule`;
    try {
      const response = await this.fetch<{ events: ESPNNBAEvent[] }>(
        ENDPOINTS.teamSchedule(teamId),
        cacheKey,
        this.cacheConfig.scoreboardTtl * 5
      );
      return response.events.map((event) => this.parseGame(event));
    } catch {
      // Fallback to filtering from scoreboard
      const games = await this.getScoreboard();
      return games.filter(
        (g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId
      );
    }
  }

  // ===========================================================================
  // PLAYERS / ROSTERS
  // ===========================================================================

  async getTeamRoster(teamId: string): Promise<NBAPlayer[]> {
    const cacheKey = `nba:roster:${teamId}`;
    const response = await this.fetch<ESPNNBATeamRosterResponse>(
      ENDPOINTS.teamRoster(teamId),
      cacheKey,
      this.cacheConfig.rosterTtl
    );

    const team = NBA_TEAMS.find((t) => t.id === teamId);
    return response.athletes.map((athlete) => this.parsePlayer(athlete, team));
  }

  async getAllPlayers(): Promise<NBAPlayer[]> {
    const allPlayers: NBAPlayer[] = [];
    const batchSize = 5;

    for (let i = 0; i < NBA_TEAMS.length; i += batchSize) {
      const batch = NBA_TEAMS.slice(i, i + batchSize);
      const rosters = await Promise.all(
        batch.map((team) => this.getTeamRoster(team.id).catch(() => []))
      );
      allPlayers.push(...rosters.flat());

      if (i + batchSize < NBA_TEAMS.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return allPlayers;
  }

  async searchPlayers(query: string, position?: string): Promise<NBAPlayer[]> {
    const allPlayers = await this.getAllPlayers();
    const normalizedQuery = query.toLowerCase();

    return allPlayers.filter((player) => {
      const nameMatch = player.fullName.toLowerCase().includes(normalizedQuery);
      const positionMatch = !position || player.position === position;
      return nameMatch && positionMatch;
    });
  }

  async getPlayerById(playerId: string): Promise<NBAPlayer | null> {
    const allPlayers = await this.getAllPlayers();
    return allPlayers.find((p) => p.id === playerId) || null;
  }

  // ===========================================================================
  // STANDINGS
  // ===========================================================================

  async getStandings(): Promise<{ east: NBAStanding[]; west: NBAStanding[] }> {
    const cacheKey = "nba:standings";
    try {
      const response = await this.fetch<ESPNNBAStandingsResponse>(
        ENDPOINTS.standings,
        cacheKey,
        this.cacheConfig.scoreboardTtl * 10
      );

      const east: NBAStanding[] = [];
      const west: NBAStanding[] = [];

      for (const conference of response.children || []) {
        const isEast = conference.name.toLowerCase().includes("east");
        const standings = conference.standings?.entries || [];

        for (let i = 0; i < standings.length; i++) {
          const entry = standings[i];
          const team = NBA_TEAMS.find((t) => t.id === entry.team.id);
          if (!team) continue;

          const getStatValue = (name: string): number => {
            const stat = entry.stats.find((s) => s.name === name);
            return stat?.value ?? 0;
          };

          const getStatDisplay = (name: string): string => {
            const stat = entry.stats.find((s) => s.name === name);
            return stat?.displayValue ?? "-";
          };

          const standing: NBAStanding = {
            teamId: entry.team.id,
            team,
            rank: i + 1,
            wins: getStatValue("wins"),
            losses: getStatValue("losses"),
            winPct: getStatValue("winPercent"),
            gamesBehind: getStatValue("gamesBehind"),
            homeRecord: getStatDisplay("Home"),
            awayRecord: getStatDisplay("Road"),
            lastTen: getStatDisplay("Last Ten Games"),
            streak: getStatDisplay("streak"),
            playoffSeed: i < 10 ? i + 1 : undefined,
          };

          if (isEast) {
            east.push(standing);
          } else {
            west.push(standing);
          }
        }
      }

      return { east, west };
    } catch {
      // Return empty standings on error
      return { east: [], west: [] };
    }
  }

  // ===========================================================================
  // PLAYOFFS
  // ===========================================================================

  async getPlayoffBracket(season?: string): Promise<NBAPlayoffBracket> {
    // ESPN doesn't have a direct playoff bracket endpoint
    // We construct it from postseason games
    const currentSeason = season || new Date().getFullYear().toString();

    const bracket: NBAPlayoffBracket = {
      season: currentSeason,
      east: {
        firstRound: [],
        secondRound: [],
        conferenceFinals: null,
      },
      west: {
        firstRound: [],
        secondRound: [],
        conferenceFinals: null,
      },
      finals: null,
      champion: null,
    };

    // Try to fetch playoff data from scoreboard with postseason filter
    try {
      const games = await this.getScoreboard();
      const playoffGames = games.filter((g) => g.seasonType === "postseason");

      // Group games by series info if available
      for (const game of playoffGames) {
        if (game.seriesInfo) {
          // Process series info
          // This is a simplified version - real implementation would need
          // more sophisticated series tracking
        }
      }
    } catch {
      // Return empty bracket on error
    }

    return bracket;
  }

  async getPlayoffSeries(): Promise<NBAPlayoffSeries[]> {
    // Placeholder - would need to construct from game data
    return [];
  }

  // ===========================================================================
  // INJURIES
  // ===========================================================================

  async getInjuryReport(teamId?: string): Promise<NBAInjuryReport[]> {
    const cacheKey = `nba:injuries:${teamId || "all"}`;
    try {
      const response = await this.fetch<{ resultSets?: any[]; teams?: any[] }>(
        ENDPOINTS.injuries,
        cacheKey,
        this.cacheConfig.playerStatsTtl
      );

      const injuries: NBAInjuryReport[] = [];
      const teams = response.resultSets || response.teams || [];

      for (const teamData of teams) {
        if (teamId && teamData.team?.id !== teamId) continue;

        const teamInjuries = teamData.injuries || [];
        for (const injury of teamInjuries) {
          injuries.push({
            playerId: injury.athlete?.id || "",
            playerName: injury.athlete?.fullName || "",
            teamId: teamData.team?.id || "",
            teamAbbreviation: teamData.team?.abbreviation || "",
            position: injury.athlete?.position?.abbreviation || "",
            status: this.mapInjuryStatus(injury.status),
            bodyPart: injury.details?.location,
            description: injury.longComment || injury.shortComment,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      return injuries;
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // PLAYER STATS
  // ===========================================================================

  async getPlayerStats(playerId: string): Promise<NBAPlayerStats | null> {
    const cacheKey = `nba:player:${playerId}:stats`;
    try {
      const player = await this.getPlayerById(playerId);
      if (!player) return null;

      // ESPN player stats endpoint
      const response = await this.fetch<any>(
        ENDPOINTS.playerStats(playerId),
        cacheKey,
        this.cacheConfig.playerStatsTtl
      );

      // Parse stats from ESPN response
      const splits = response.splits?.categories?.[0]?.stats || [];
      const getStatValue = (name: string): number => {
        const stat = splits.find((s: any) => s.name === name);
        return stat?.value ?? 0;
      };

      return {
        playerId,
        playerName: player.fullName,
        teamId: player.teamId,
        gamesPlayed: getStatValue("gamesPlayed"),
        minutesPerGame: getStatValue("avgMinutes"),
        pointsPerGame: getStatValue("avgPoints"),
        reboundsPerGame: getStatValue("avgRebounds"),
        assistsPerGame: getStatValue("avgAssists"),
        stealsPerGame: getStatValue("avgSteals"),
        blocksPerGame: getStatValue("avgBlocks"),
        turnoversPerGame: getStatValue("avgTurnovers"),
        fieldGoalPct: getStatValue("fieldGoalPct"),
        threePointPct: getStatValue("threePointFieldGoalPct"),
        freeThrowPct: getStatValue("freeThrowPct"),
        plusMinus: getStatValue("plusMinus"),
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // BOX SCORES
  // ===========================================================================

  async getBoxScore(gameId: string): Promise<any> {
    const cacheKey = `nba:boxscore:${gameId}`;
    try {
      const url = `${ESPN_BASE_URL}/summary?event=${gameId}`;
      const response = await this.fetch<any>(
        url,
        cacheKey,
        this.cacheConfig.liveStatsTtl
      );
      return response;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // PARSING HELPERS
  // ===========================================================================

  private parseGame(event: ESPNNBAEvent): NBAGame {
    const competition = event.competitions[0];
    const homeCompetitor = competition.competitors.find(
      (c) => c.homeAway === "home"
    )!;
    const awayCompetitor = competition.competitors.find(
      (c) => c.homeAway === "away"
    )!;

    let status: NBAGame["status"] = "scheduled";
    switch (event.status.type.state) {
      case "pre":
        status = "scheduled";
        break;
      case "in":
        status = event.status.period === 2 ? "halftime" : "in_progress";
        break;
      case "post":
        status = event.status.type.description.includes("OT")
          ? "final_overtime"
          : "final";
        break;
    }

    const odds = competition.odds?.[0];
    const series = competition.series;

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
      date: event.date.split("T")[0],
      startTime: event.date,
      status,
      period: event.status.period,
      timeRemaining: event.status.displayClock,
      homeTeam: {
        teamId: homeCompetitor.team.id,
        abbreviation: homeCompetitor.team.abbreviation,
        name: homeCompetitor.team.displayName,
        score: parseInt(homeCompetitor.score) || 0,
        record: homeCompetitor.records?.[0]?.summary,
        logoUrl: homeCompetitor.team.logo,
        periodScores: homeCompetitor.linescores?.map((l) => l.value),
      },
      awayTeam: {
        teamId: awayCompetitor.team.id,
        abbreviation: awayCompetitor.team.abbreviation,
        name: awayCompetitor.team.displayName,
        score: parseInt(awayCompetitor.score) || 0,
        record: awayCompetitor.records?.[0]?.summary,
        logoUrl: awayCompetitor.team.logo,
        periodScores: awayCompetitor.linescores?.map((l) => l.value),
      },
      venue: competition.venue?.fullName,
      attendance: competition.attendance,
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
      seriesInfo: series
        ? {
            seriesId: `${event.season.year}-${competition.id}`,
            round: 1, // Would need to parse from series.title
            roundName: series.title || "",
            homeWins: series.competitors?.find((c) => c.id === homeCompetitor.team.id)?.wins || 0,
            awayWins: series.competitors?.find((c) => c.id === awayCompetitor.team.id)?.wins || 0,
            gameNumber: series.totalCompetitions || 1,
            status: series.completed ? "complete" : "in_progress",
          }
        : undefined,
    };
  }

  private parsePlayer(athlete: ESPNNBAAthlete, team?: NBATeam): NBAPlayer {
    const injury = athlete.injuries?.[0];

    let status: NBAPlayer["status"] = "active";
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
    };
  }

  private mapInjuryStatus(status: string): NBAInjuryReport["status"] {
    const s = (status || "").toLowerCase();
    if (s.includes("out")) return "out";
    if (s.includes("doubtful")) return "doubtful";
    if (s.includes("questionable")) return "questionable";
    if (s.includes("probable")) return "probable";
    if (s.includes("day-to-day") || s.includes("dtd")) return "day-to-day";
    return "questionable";
  }

  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  clearCache(): void {
    this.cache.clear();
  }

  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }
}

// =============================================================================
// NBA DATA SERVICE
// =============================================================================

export class NBADataService {
  private espnClient: NBAESPNClient;

  constructor(cacheConfig?: CacheConfig) {
    this.espnClient = getNBAESPNClient(cacheConfig);
  }

  // Teams
  getTeams(): NBATeam[] {
    return this.espnClient.getTeams();
  }

  getTeam(idOrAbbr: string): NBATeam | undefined {
    return this.espnClient.getTeam(idOrAbbr);
  }

  getTeamsByConference(conference: "Eastern" | "Western"): NBATeam[] {
    return this.espnClient.getTeamsByConference(conference);
  }

  getTeamsByDivision(division: string): NBATeam[] {
    return this.espnClient.getTeamsByDivision(division);
  }

  // Games
  async getGames(options?: { date?: string; teamId?: string }): Promise<NBAGame[]> {
    if (options?.teamId) {
      return this.espnClient.getTeamGames(options.teamId);
    }
    return this.espnClient.getScoreboard(options?.date);
  }

  async getLiveGames(): Promise<NBAGame[]> {
    return this.espnClient.getLiveGames();
  }

  async getGameById(gameId: string): Promise<NBAGame | null> {
    return this.espnClient.getGameById(gameId);
  }

  async getBoxScore(gameId: string): Promise<any> {
    return this.espnClient.getBoxScore(gameId);
  }

  // Players
  async getTeamRoster(teamId: string): Promise<NBAPlayer[]> {
    return this.espnClient.getTeamRoster(teamId);
  }

  async getAllPlayers(): Promise<NBAPlayer[]> {
    return this.espnClient.getAllPlayers();
  }

  async searchPlayers(query: string, position?: string): Promise<NBAPlayer[]> {
    return this.espnClient.searchPlayers(query, position);
  }

  async getPlayerById(playerId: string): Promise<NBAPlayer | null> {
    return this.espnClient.getPlayerById(playerId);
  }

  async getPlayerStats(playerId: string): Promise<NBAPlayerStats | null> {
    return this.espnClient.getPlayerStats(playerId);
  }

  // Standings
  async getStandings(): Promise<{ east: NBAStanding[]; west: NBAStanding[] }> {
    return this.espnClient.getStandings();
  }

  // Playoffs
  async getPlayoffBracket(season?: string): Promise<NBAPlayoffBracket> {
    return this.espnClient.getPlayoffBracket(season);
  }

  async getPlayoffSeries(): Promise<NBAPlayoffSeries[]> {
    return this.espnClient.getPlayoffSeries();
  }

  // Injuries
  async getInjuryReport(teamId?: string): Promise<NBAInjuryReport[]> {
    return this.espnClient.getInjuryReport(teamId);
  }

  // Cache
  clearCache(): void {
    this.espnClient.clearCache();
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

let nbaESPNClient: NBAESPNClient | null = null;
let nbaDataService: NBADataService | null = null;

export function getNBAESPNClient(config?: CacheConfig): NBAESPNClient {
  if (!nbaESPNClient) {
    nbaESPNClient = new NBAESPNClient(config);
  }
  return nbaESPNClient;
}

export function getNBADataService(config?: CacheConfig): NBADataService {
  if (!nbaDataService) {
    nbaDataService = new NBADataService(config);
  }
  return nbaDataService;
}
