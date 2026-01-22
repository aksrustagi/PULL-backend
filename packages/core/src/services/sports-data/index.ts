/**
 * Sports Data Service
 *
 * Unified interface for fetching NFL data from ESPN and SportsRadar.
 */

export * from "./types";
export * from "./espn";

import { ESPNClient, getESPNClient, NFL_TEAMS } from "./espn";
import type {
  NFLTeam,
  NFLPlayer,
  NFLGame,
  PlayerProjection,
  CacheConfig,
} from "./types";

/**
 * Sports Data Service
 *
 * Provides a unified interface for fetching NFL data,
 * with automatic fallback between data sources.
 */
export class SportsDataService {
  private espnClient: ESPNClient;

  constructor(cacheConfig?: CacheConfig) {
    this.espnClient = getESPNClient(cacheConfig);
  }

  // ===========================================================================
  // TEAMS
  // ===========================================================================

  /**
   * Get all NFL teams
   */
  getTeams(): NFLTeam[] {
    return NFL_TEAMS;
  }

  /**
   * Get team by ID or abbreviation
   */
  getTeam(idOrAbbr: string): NFLTeam | undefined {
    return this.espnClient.getTeam(idOrAbbr);
  }

  /**
   * Get teams by conference
   */
  getTeamsByConference(conference: "AFC" | "NFC"): NFLTeam[] {
    return NFL_TEAMS.filter((t) => t.conference === conference);
  }

  /**
   * Get teams by division
   */
  getTeamsByDivision(division: string): NFLTeam[] {
    return NFL_TEAMS.filter((t) => t.division === division);
  }

  // ===========================================================================
  // PLAYERS
  // ===========================================================================

  /**
   * Get all NFL players
   */
  async getAllPlayers(): Promise<NFLPlayer[]> {
    return this.espnClient.getAllPlayers();
  }

  /**
   * Get team roster
   */
  async getTeamRoster(teamId: string): Promise<NFLPlayer[]> {
    return this.espnClient.getTeamRoster(teamId);
  }

  /**
   * Search players by name
   */
  async searchPlayers(query: string, position?: string): Promise<NFLPlayer[]> {
    return this.espnClient.searchPlayers(query, position);
  }

  /**
   * Get players by position
   */
  async getPlayersByPosition(position: string): Promise<NFLPlayer[]> {
    return this.espnClient.getPlayersByPosition(position);
  }

  /**
   * Get fantasy-relevant players (skill positions)
   */
  async getFantasyPlayers(): Promise<NFLPlayer[]> {
    const allPlayers = await this.espnClient.getAllPlayers();
    const fantasyPositions = ["QB", "RB", "WR", "TE", "K", "PK"];
    return allPlayers.filter((p) => fantasyPositions.includes(p.position));
  }

  // ===========================================================================
  // GAMES
  // ===========================================================================

  /**
   * Get current week's games
   */
  async getCurrentWeekGames(): Promise<NFLGame[]> {
    return this.espnClient.getScoreboard();
  }

  /**
   * Get games for a specific week
   */
  async getWeekGames(week: number, season?: number): Promise<NFLGame[]> {
    return this.espnClient.getScoreboard(week, season);
  }

  /**
   * Get live game scores
   */
  async getLiveScores(): Promise<NFLGame[]> {
    return this.espnClient.getLiveScores();
  }

  /**
   * Get games for a specific team
   */
  async getTeamGames(teamId: string, season?: number): Promise<NFLGame[]> {
    return this.espnClient.getTeamGames(teamId, season);
  }

  /**
   * Get games in progress
   */
  async getGamesInProgress(): Promise<NFLGame[]> {
    const games = await this.espnClient.getScoreboard();
    return games.filter(
      (g) => g.status === "in_progress" || g.status === "halftime"
    );
  }

  /**
   * Check if any games are currently in progress
   */
  async areGamesInProgress(): Promise<boolean> {
    const games = await this.getGamesInProgress();
    return games.length > 0;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get current NFL week
   */
  async getCurrentWeek(): Promise<number> {
    const games = await this.espnClient.getScoreboard();
    if (games.length === 0) return 1;
    return games[0].week;
  }

  /**
   * Get current NFL season
   */
  async getCurrentSeason(): Promise<string> {
    const games = await this.espnClient.getScoreboard();
    if (games.length === 0) {
      return new Date().getFullYear().toString();
    }
    return games[0].season;
  }

  /**
   * Get teams on bye for a given week
   */
  getTeamsOnBye(week: number): NFLTeam[] {
    return NFL_TEAMS.filter((t) => t.byeWeek === week);
  }

  /**
   * Get players on bye for a given week
   */
  async getPlayersOnBye(week: number): Promise<NFLPlayer[]> {
    const teamsOnBye = this.getTeamsOnBye(week);
    const byeTeamIds = new Set(teamsOnBye.map((t) => t.id));

    const allPlayers = await this.getAllPlayers();
    return allPlayers.filter((p) => p.teamId && byeTeamIds.has(p.teamId));
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.espnClient.clearCache();
  }
}

// Singleton instance
let sportsDataService: SportsDataService | null = null;

export function getSportsDataService(config?: CacheConfig): SportsDataService {
  if (!sportsDataService) {
    sportsDataService = new SportsDataService(config);
  }
  return sportsDataService;
}
