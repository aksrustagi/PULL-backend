/**
 * Bracket Battles Service
 *
 * Manages tournament brackets, pools, and competitions.
 */

import {
  type Tournament,
  type TournamentGame,
  type Bracket,
  type BracketPick,
  type BracketPool,
  type BracketLeaderboardEntry,
  type PoolLeaderboard,
  type LiveScoringUpdate,
  type CreateBracketInput,
  type UpdateBracketInput,
  type SubmitBracketInput,
  type CreatePoolInput,
  type JoinPoolInput,
  type ScoringConfig,
  type BracketStatus,
} from "./types";
import { BracketScoringEngine } from "./scoring";

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class BracketService {
  private tournaments: Map<string, Tournament> = new Map();
  private brackets: Map<string, Bracket> = new Map();
  private pools: Map<string, BracketPool> = new Map();
  private scoringEngine: BracketScoringEngine;

  constructor() {
    this.scoringEngine = new BracketScoringEngine();
    this.initializeSampleTournament();
  }

  // ============================================================================
  // TOURNAMENT MANAGEMENT
  // ============================================================================

  /**
   * Get all active tournaments
   */
  async getTournaments(
    status?: "upcoming" | "in_progress" | "completed"
  ): Promise<Tournament[]> {
    const tournaments = Array.from(this.tournaments.values());
    if (status) {
      return tournaments.filter((t) => t.status === status);
    }
    return tournaments;
  }

  /**
   * Get tournament by ID
   */
  async getTournament(tournamentId: string): Promise<Tournament | null> {
    return this.tournaments.get(tournamentId) ?? null;
  }

  /**
   * Get tournament games for a specific round
   */
  async getTournamentGames(
    tournamentId: string,
    round?: number
  ): Promise<TournamentGame[]> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return [];

    if (round !== undefined) {
      return tournament.games.filter((g) => g.round === round);
    }
    return tournament.games;
  }

  /**
   * Update game result (admin/system function)
   */
  async updateGameResult(
    tournamentId: string,
    gameId: string,
    winnerId: string,
    team1Score: number,
    team2Score: number
  ): Promise<LiveScoringUpdate> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const game = tournament.games.find((g) => g.id === gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    // Update game
    game.winnerId = winnerId;
    game.team1Score = team1Score;
    game.team2Score = team2Score;
    game.isComplete = true;
    game.completedAt = Date.now();

    // Update team elimination status
    const loserId = game.team1Id === winnerId ? game.team2Id : game.team1Id;
    const loser = tournament.teams.find((t) => t.id === loserId);
    if (loser) {
      loser.isEliminated = true;
    }

    // Advance winner to next game
    if (game.nextGameId) {
      const nextGame = tournament.games.find((g) => g.id === game.nextGameId);
      if (nextGame && game.nextGameSlot) {
        if (game.nextGameSlot === "team1") {
          nextGame.team1Id = winnerId;
          nextGame.team1Seed = game.team1Id === winnerId ? game.team1Seed : game.team2Seed;
        } else {
          nextGame.team2Id = winnerId;
          nextGame.team2Seed = game.team1Id === winnerId ? game.team1Seed : game.team2Seed;
        }
      }
    }

    this.tournaments.set(tournamentId, tournament);

    // Score all affected brackets
    const affectedBrackets = await this.scoreGameResult(tournamentId, gameId, winnerId);

    return {
      tournamentId,
      gameId,
      winnerId,
      affectedBrackets,
      timestamp: Date.now(),
    };
  }

  // ============================================================================
  // BRACKET MANAGEMENT
  // ============================================================================

  /**
   * Create a new bracket
   */
  async createBracket(
    userId: string,
    username: string,
    input: CreateBracketInput
  ): Promise<Bracket> {
    const tournament = this.tournaments.get(input.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    // Check deadline
    if (Date.now() > tournament.bracketDeadline) {
      throw new Error("Bracket deadline has passed");
    }

    const bracket: Bracket = {
      id: `bracket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      tournamentId: input.tournamentId,
      poolId: input.poolId,
      name: input.name,
      isPublic: input.isPublic,
      picks: [],
      status: "draft",
      totalPoints: 0,
      maxPossiblePoints: this.scoringEngine.calculateMaxPossiblePoints(tournament),
      correctPicks: 0,
      incorrectPicks: 0,
      pendingPicks: 0,
      roundScores: new Map(),
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    };

    this.brackets.set(bracket.id, bracket);
    return bracket;
  }

  /**
   * Update bracket picks
   */
  async updateBracket(
    userId: string,
    input: UpdateBracketInput
  ): Promise<Bracket> {
    const bracket = this.brackets.get(input.bracketId);
    if (!bracket) {
      throw new Error("Bracket not found");
    }

    if (bracket.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (bracket.status !== "draft") {
      throw new Error("Bracket is already submitted");
    }

    const tournament = this.tournaments.get(bracket.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (Date.now() > tournament.bracketDeadline) {
      throw new Error("Bracket deadline has passed");
    }

    // Validate and update picks
    const newPicks: BracketPick[] = [];
    for (const pick of input.picks) {
      const game = tournament.games.find((g) => g.id === pick.gameId);
      if (!game) continue;

      // Validate team is in the game
      if (pick.pickedTeamId !== game.team1Id && pick.pickedTeamId !== game.team2Id) {
        // Team not in game yet, skip
        continue;
      }

      const team = tournament.teams.find((t) => t.id === pick.pickedTeamId);
      newPicks.push({
        gameId: pick.gameId,
        round: game.round,
        pickedTeamId: pick.pickedTeamId,
        pickedTeamSeed: team?.seed ?? 0,
        result: "pending",
      });
    }

    bracket.picks = newPicks;
    bracket.champion = input.champion;
    bracket.pendingPicks = newPicks.length;
    bracket.lastModifiedAt = Date.now();

    this.brackets.set(bracket.id, bracket);
    return bracket;
  }

  /**
   * Submit bracket (lock picks)
   */
  async submitBracket(
    userId: string,
    input: SubmitBracketInput
  ): Promise<Bracket> {
    const bracket = this.brackets.get(input.bracketId);
    if (!bracket) {
      throw new Error("Bracket not found");
    }

    if (bracket.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (bracket.status !== "draft") {
      throw new Error("Bracket is already submitted");
    }

    const tournament = this.tournaments.get(bracket.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (Date.now() > tournament.bracketDeadline) {
      throw new Error("Bracket deadline has passed");
    }

    // Validate all picks are made
    const totalGames = tournament.games.length;
    if (bracket.picks.length < totalGames) {
      throw new Error(`Please complete all ${totalGames} picks`);
    }

    if (!bracket.champion) {
      throw new Error("Please select a champion");
    }

    bracket.status = "submitted";
    bracket.submittedAt = Date.now();

    this.brackets.set(bracket.id, bracket);
    return bracket;
  }

  /**
   * Get user's brackets
   */
  async getUserBrackets(
    userId: string,
    tournamentId?: string
  ): Promise<Bracket[]> {
    const brackets = Array.from(this.brackets.values()).filter(
      (b) => b.userId === userId && (!tournamentId || b.tournamentId === tournamentId)
    );
    return brackets;
  }

  /**
   * Get bracket by ID
   */
  async getBracket(bracketId: string): Promise<Bracket | null> {
    return this.brackets.get(bracketId) ?? null;
  }

  /**
   * Get public brackets for a tournament
   */
  async getPublicBrackets(
    tournamentId: string,
    limit: number = 50
  ): Promise<Bracket[]> {
    return Array.from(this.brackets.values())
      .filter((b) => b.tournamentId === tournamentId && b.isPublic && b.status !== "draft")
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit);
  }

  // ============================================================================
  // POOL MANAGEMENT
  // ============================================================================

  /**
   * Create a bracket pool
   */
  async createPool(userId: string, input: CreatePoolInput): Promise<BracketPool> {
    const tournament = this.tournaments.get(input.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const defaultScoringConfig: ScoringConfig = {
      pointsPerRound: [1, 2, 4, 8, 16, 32], // March Madness style
      upsetMultiplier: 1.5,
      seedDifferenceBonus: 0.5,
      perfectRoundBonus: 10,
      championBonus: 20,
      finalFourBonus: 5,
    };

    const pool: BracketPool = {
      id: `pool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: input.name,
      description: input.description,
      tournamentId: input.tournamentId,
      poolType: input.poolType,
      isPublic: input.isPublic,
      requiresInvite: !input.isPublic,
      inviteCode: !input.isPublic
        ? Math.random().toString(36).substr(2, 8).toUpperCase()
        : undefined,
      entryFee: input.entryFee,
      maxEntries: input.maxEntries,
      entriesPerUser: input.entriesPerUser,
      currentEntries: 0,
      prizePool: 0,
      prizeStructure: this.getDefaultPrizeStructure(input.entryFee),
      scoringSystem: input.scoringSystem,
      scoringConfig: defaultScoringConfig,
      creatorId: userId,
      participants: [],
      brackets: [],
      tiebreakerType: "total_points",
      tiebreakerQuestion: input.tiebreakerQuestion ?? "Total combined score of championship game",
      status: "open",
      upsetBonusEnabled: input.upsetBonusEnabled,
      perfectBracketBonus: input.perfectBracketBonus,
      createdAt: Date.now(),
      locksAt: tournament.bracketDeadline,
    };

    this.pools.set(pool.id, pool);
    return pool;
  }

  /**
   * Join a bracket pool
   */
  async joinPool(userId: string, input: JoinPoolInput): Promise<BracketPool> {
    const pool = this.pools.get(input.poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    if (pool.status !== "open") {
      throw new Error("Pool is not accepting entries");
    }

    if (pool.currentEntries >= pool.maxEntries) {
      throw new Error("Pool is full");
    }

    // Check invite code for private pools
    if (pool.requiresInvite && pool.inviteCode !== input.inviteCode) {
      throw new Error("Invalid invite code");
    }

    // Check entries per user
    const userBracketsInPool = pool.brackets.filter((bracketId) => {
      const bracket = this.brackets.get(bracketId);
      return bracket?.userId === userId;
    });

    if (userBracketsInPool.length >= pool.entriesPerUser) {
      throw new Error(`Maximum ${pool.entriesPerUser} entries per user`);
    }

    // Verify bracket belongs to user and tournament
    const bracket = this.brackets.get(input.bracketId);
    if (!bracket || bracket.userId !== userId) {
      throw new Error("Invalid bracket");
    }

    if (bracket.tournamentId !== pool.tournamentId) {
      throw new Error("Bracket is for a different tournament");
    }

    if (bracket.status !== "submitted") {
      throw new Error("Bracket must be submitted first");
    }

    // Add to pool
    if (!pool.participants.includes(userId)) {
      pool.participants.push(userId);
    }
    pool.brackets.push(input.bracketId);
    pool.currentEntries += 1;
    pool.prizePool += pool.entryFee;

    // Update bracket
    bracket.poolId = pool.id;
    this.brackets.set(bracket.id, bracket);

    this.pools.set(pool.id, pool);
    return pool;
  }

  /**
   * Get pools for a tournament
   */
  async getPoolsForTournament(
    tournamentId: string,
    isPublic?: boolean
  ): Promise<BracketPool[]> {
    return Array.from(this.pools.values()).filter(
      (p) => p.tournamentId === tournamentId && (isPublic === undefined || p.isPublic === isPublic)
    );
  }

  /**
   * Get pool by ID
   */
  async getPool(poolId: string): Promise<BracketPool | null> {
    return this.pools.get(poolId) ?? null;
  }

  /**
   * Get pool leaderboard
   */
  async getPoolLeaderboard(poolId: string): Promise<PoolLeaderboard> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    const tournament = this.tournaments.get(pool.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const entries: BracketLeaderboardEntry[] = [];

    for (const bracketId of pool.brackets) {
      const bracket = this.brackets.get(bracketId);
      if (!bracket) continue;

      const championTeam = tournament.teams.find((t) => t.id === bracket.champion);

      entries.push({
        rank: 0, // Will be calculated
        bracketId: bracket.id,
        userId: bracket.userId,
        username: bracket.username,
        bracketName: bracket.name,
        totalPoints: bracket.totalPoints,
        maxPossiblePoints: bracket.maxPossiblePoints,
        correctPicks: bracket.correctPicks,
        champion: championTeam?.name,
        championAlive: championTeam ? !championTeam.isEliminated : false,
        roundScores: Array.from(bracket.roundScores.entries()).map(([round, points]) => ({
          round,
          points,
          correct: bracket.picks.filter((p) => p.round === round && p.result === "correct").length,
        })),
      });
    }

    // Sort and assign ranks
    entries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      // Tiebreaker: more correct picks
      return b.correctPicks - a.correctPicks;
    });

    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const gamesRemaining = tournament.games.filter((g) => !g.isComplete).length;

    return {
      poolId,
      tournamentId: pool.tournamentId,
      entries,
      totalEntries: entries.length,
      updatedAt: Date.now(),
      currentRound: tournament.currentRound,
      gamesRemaining,
    };
  }

  // ============================================================================
  // SCORING
  // ============================================================================

  /**
   * Score a game result for all affected brackets
   */
  private async scoreGameResult(
    tournamentId: string,
    gameId: string,
    winnerId: string
  ): Promise<{ bracketId: string; userId: string; pointsChange: number; newTotal: number; isCorrect: boolean; maxPossibleChange: number; newMaxPossible: number }[]> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return [];

    const game = tournament.games.find((g) => g.id === gameId);
    if (!game) return [];

    const affectedBrackets: { bracketId: string; userId: string; pointsChange: number; newTotal: number; isCorrect: boolean; maxPossibleChange: number; newMaxPossible: number }[] = [];

    const brackets = Array.from(this.brackets.values()).filter(
      (b) => b.tournamentId === tournamentId && b.status !== "draft"
    );

    for (const bracket of brackets) {
      const pick = bracket.picks.find((p) => p.gameId === gameId);
      if (!pick) continue;

      const isCorrect = pick.pickedTeamId === winnerId;
      const pool = bracket.poolId ? this.pools.get(bracket.poolId) : null;
      const scoringConfig = pool?.scoringConfig ?? this.getDefaultScoringConfig();

      // Calculate points for this game
      const pointsEarned = isCorrect
        ? this.scoringEngine.calculatePointsForPick(
            pick,
            game,
            tournament,
            scoringConfig,
            pool?.upsetBonusEnabled ?? true
          )
        : 0;

      // Update pick result
      pick.result = isCorrect ? "correct" : "incorrect";
      pick.pointsEarned = pointsEarned;
      pick.earnedAt = Date.now();

      // Update bracket totals
      const previousTotal = bracket.totalPoints;
      bracket.totalPoints += pointsEarned;

      if (isCorrect) {
        bracket.correctPicks += 1;
      } else {
        bracket.incorrectPicks += 1;

        // Reduce max possible for lost picks in future rounds
        const lostPotential = this.scoringEngine.calculateLostPotential(
          pick,
          tournament,
          scoringConfig
        );
        bracket.maxPossiblePoints -= lostPotential;
      }

      bracket.pendingPicks -= 1;

      // Update round score
      const currentRoundScore = bracket.roundScores.get(game.round) ?? 0;
      bracket.roundScores.set(game.round, currentRoundScore + pointsEarned);

      this.brackets.set(bracket.id, bracket);

      affectedBrackets.push({
        bracketId: bracket.id,
        userId: bracket.userId,
        pointsChange: pointsEarned,
        newTotal: bracket.totalPoints,
        isCorrect,
        maxPossibleChange: isCorrect ? 0 : -this.scoringEngine.calculateLostPotential(pick, tournament, scoringConfig),
        newMaxPossible: bracket.maxPossiblePoints,
      });
    }

    return affectedBrackets;
  }

  // ============================================================================
  // PERFECT BRACKET TRACKING
  // ============================================================================

  /**
   * Get brackets with perfect scores so far
   */
  async getPerfectBrackets(tournamentId: string): Promise<Bracket[]> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return [];

    const completedGames = tournament.games.filter((g) => g.isComplete).length;

    return Array.from(this.brackets.values()).filter(
      (b) =>
        b.tournamentId === tournamentId &&
        b.status !== "draft" &&
        b.correctPicks === completedGames &&
        b.incorrectPicks === 0
    );
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getDefaultPrizeStructure(entryFee: number): { place: number | string; percentage: number }[] {
    if (entryFee === 0) {
      return [
        { place: 1, percentage: 100 },
      ];
    }

    return [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 25 },
      { place: 3, percentage: 15 },
      { place: "4-5", percentage: 10 },
    ];
  }

  private getDefaultScoringConfig(): ScoringConfig {
    return {
      pointsPerRound: [1, 2, 4, 8, 16, 32],
      upsetMultiplier: 1.0,
      seedDifferenceBonus: 0,
      perfectRoundBonus: 0,
      championBonus: 0,
      finalFourBonus: 0,
    };
  }

  /**
   * Initialize sample tournament for testing
   */
  private initializeSampleTournament(): void {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    const tournament: Tournament = {
      id: "ncaa_2024_mens",
      name: "2024 NCAA Men's Basketball Tournament",
      type: "ncaa_mens_basketball",
      season: "2023-24",
      year: 2024,
      totalTeams: 64,
      totalRounds: 6,
      format: {
        type: "single_elimination",
        regions: ["East", "West", "South", "Midwest"],
        playInGames: true,
      },
      teams: this.generateSampleTeams(),
      seeds: new Map(),
      games: this.generateSampleGames(),
      startDate: now + oneWeek,
      endDate: now + 4 * oneWeek,
      bracketDeadline: now + oneWeek - 24 * 60 * 60 * 1000,
      status: "upcoming",
      currentRound: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.tournaments.set(tournament.id, tournament);
  }

  private generateSampleTeams(): { id: string; name: string; abbreviation: string; seed: number; region: string; isEliminated: boolean }[] {
    const regions = ["East", "West", "South", "Midwest"];
    const teams: { id: string; name: string; abbreviation: string; seed: number; region: string; isEliminated: boolean }[] = [];

    const teamNames = [
      "UConn", "Houston", "Purdue", "North Carolina", "Arizona", "Kansas", "Marquette", "Duke",
      "Tennessee", "Creighton", "Kentucky", "Gonzaga", "Alabama", "Illinois", "Iowa State", "Auburn"
    ];

    regions.forEach((region, regionIndex) => {
      for (let seed = 1; seed <= 16; seed++) {
        const teamIndex = (regionIndex * 4 + Math.min(seed - 1, 3)) % teamNames.length;
        teams.push({
          id: `team_${region.toLowerCase()}_${seed}`,
          name: `${teamNames[teamIndex]} (${region})`,
          abbreviation: teamNames[teamIndex].substring(0, 4).toUpperCase(),
          seed,
          region,
          isEliminated: false,
        });
      }
    });

    return teams;
  }

  private generateSampleGames(): TournamentGame[] {
    const games: TournamentGame[] = [];
    const regions = ["East", "West", "South", "Midwest"];
    const roundNames = ["First Round", "Second Round", "Sweet Sixteen", "Elite Eight", "Final Four", "Championship"];

    let gameNumber = 0;

    // Generate games for each round
    regions.forEach((region) => {
      // First round: 8 games per region
      for (let i = 0; i < 8; i++) {
        games.push({
          id: `game_r1_${region.toLowerCase()}_${i}`,
          tournamentId: "ncaa_2024_mens",
          round: 1,
          roundName: roundNames[0],
          region,
          gameNumber: gameNumber++,
          team1Id: `team_${region.toLowerCase()}_${i + 1}`,
          team2Id: `team_${region.toLowerCase()}_${16 - i}`,
          team1Seed: i + 1,
          team2Seed: 16 - i,
          isComplete: false,
          nextGameId: `game_r2_${region.toLowerCase()}_${Math.floor(i / 2)}`,
          nextGameSlot: i % 2 === 0 ? "team1" : "team2",
        });
      }

      // Second round: 4 games per region
      for (let i = 0; i < 4; i++) {
        games.push({
          id: `game_r2_${region.toLowerCase()}_${i}`,
          tournamentId: "ncaa_2024_mens",
          round: 2,
          roundName: roundNames[1],
          region,
          gameNumber: gameNumber++,
          isComplete: false,
          nextGameId: `game_r3_${region.toLowerCase()}_${Math.floor(i / 2)}`,
          nextGameSlot: i % 2 === 0 ? "team1" : "team2",
        });
      }

      // Sweet Sixteen: 2 games per region
      for (let i = 0; i < 2; i++) {
        games.push({
          id: `game_r3_${region.toLowerCase()}_${i}`,
          tournamentId: "ncaa_2024_mens",
          round: 3,
          roundName: roundNames[2],
          region,
          gameNumber: gameNumber++,
          isComplete: false,
          nextGameId: `game_r4_${region.toLowerCase()}_0`,
          nextGameSlot: i === 0 ? "team1" : "team2",
        });
      }

      // Elite Eight: 1 game per region
      games.push({
        id: `game_r4_${region.toLowerCase()}_0`,
        tournamentId: "ncaa_2024_mens",
        round: 4,
        roundName: roundNames[3],
        region,
        gameNumber: gameNumber++,
        isComplete: false,
        nextGameId: region === "East" || region === "West" ? "game_r5_0" : "game_r5_1",
        nextGameSlot: region === "East" || region === "South" ? "team1" : "team2",
      });
    });

    // Final Four: 2 games
    games.push({
      id: "game_r5_0",
      tournamentId: "ncaa_2024_mens",
      round: 5,
      roundName: roundNames[4],
      gameNumber: gameNumber++,
      isComplete: false,
      nextGameId: "game_r6_0",
      nextGameSlot: "team1",
    });

    games.push({
      id: "game_r5_1",
      tournamentId: "ncaa_2024_mens",
      round: 5,
      roundName: roundNames[4],
      gameNumber: gameNumber++,
      isComplete: false,
      nextGameId: "game_r6_0",
      nextGameSlot: "team2",
    });

    // Championship: 1 game
    games.push({
      id: "game_r6_0",
      tournamentId: "ncaa_2024_mens",
      round: 6,
      roundName: roundNames[5],
      gameNumber: gameNumber++,
      isComplete: false,
    });

    return games;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let bracketService: BracketService | null = null;

export function getBracketService(): BracketService {
  if (!bracketService) {
    bracketService = new BracketService();
  }
  return bracketService;
}

export function createBracketService(): BracketService {
  return new BracketService();
}
