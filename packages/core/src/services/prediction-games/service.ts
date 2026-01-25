/**
 * Prediction Games Service
 * Create and manage free-to-play pick'em games
 */

import type {
  PredictionGame,
  GameEntry,
  GamePick,
  UserPick,
  GameType,
  GameStatus,
  PickStatus,
  Frequency,
  GameLeaderboard,
  StreakChallenge,
  UserStreak,
  ConversionOffer,
  Prize,
  CreateGameRequest,
  SubmitEntryRequest,
  UpdatePicksRequest,
  GameSearchFilters,
  GameListResponse,
} from "./types";
import { PredictionScoringEngine, createPredictionScoringEngine } from "./scoring";
import { PredictionLeaderboardService, createPredictionLeaderboardService } from "./leaderboard";

// ============================================================================
// PREDICTION GAMES SERVICE
// ============================================================================

export class PredictionGamesService {
  private games: Map<string, PredictionGame> = new Map();
  private entries: Map<string, GameEntry[]> = new Map();
  private streakChallenges: Map<string, StreakChallenge> = new Map();
  private userStreaks: Map<string, UserStreak[]> = new Map();

  private scoringEngine: PredictionScoringEngine;
  private leaderboardService: PredictionLeaderboardService;

  constructor() {
    this.scoringEngine = createPredictionScoringEngine();
    this.leaderboardService = createPredictionLeaderboardService();
    this.initializeSampleGames();
  }

  // ==========================================================================
  // GAME MANAGEMENT
  // ==========================================================================

  /**
   * Create a new prediction game
   */
  async createGame(request: CreateGameRequest): Promise<PredictionGame> {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build picks
    const picks: GamePick[] = request.picks.map((p, index) => ({
      id: `pick_${gameId}_${index}`,
      gameId,
      eventId: p.eventId,
      eventName: p.eventName,
      startTime: p.startTime,
      type: p.type,
      question: p.question,
      options: p.options.map((opt, optIndex) => ({
        id: `opt_${gameId}_${index}_${optIndex}`,
        name: opt.name,
        description: opt.description,
      })),
      spread: p.spread,
      total: p.total,
      basePoints: p.basePoints ?? 10,
      status: "pending",
      sortOrder: index,
      isLocked: false,
    }));

    const game: PredictionGame = {
      id: gameId,
      name: request.name,
      description: request.description,
      type: request.type,
      sport: request.sport,
      league: request.league,
      status: "draft",
      frequency: request.frequency,
      periodName: request.periodName,
      entryOpenTime: request.entryOpenTime,
      entryCloseTime: request.entryCloseTime,
      startTime: request.startTime,
      endTime: request.endTime,
      picks,
      requireAllPicks: true,
      rules: {
        allowLateEntry: false,
        allowPickChanges: true,
        ...request.rules,
      },
      scoringRules: {
        pointsPerCorrect: 10,
        pointsPerIncorrect: 0,
        bonusForStreak: { 3: 5, 5: 15, 7: 30 },
        bonusForPerfect: 100,
        ...request.scoringRules,
      },
      prizePool: request.prizePool,
      entryCount: 0,
      entriesPerUser: request.entriesPerUser ?? 1,
      maxEntries: request.maxEntries,
      isPublic: request.isPublic ?? true,
      isFeatured: false,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.games.set(gameId, game);
    this.entries.set(gameId, []);

    return game;
  }

  /**
   * Publish a game (make it available for entries)
   */
  async publishGame(gameId: string): Promise<PredictionGame> {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    if (game.status !== "draft") {
      throw new Error("Only draft games can be published");
    }

    game.status = "upcoming";
    game.updatedAt = Date.now();
    this.games.set(gameId, game);

    return game;
  }

  /**
   * Update game status based on time
   */
  async updateGameStatus(gameId: string): Promise<PredictionGame> {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const now = Date.now();

    // Check for status transitions
    if (game.status === "upcoming" && now >= game.startTime) {
      game.status = "live";

      // Lock all picks
      for (const pick of game.picks) {
        pick.isLocked = true;
        pick.lockedAt = now;
      }
    }

    if (game.status === "live" && now >= game.endTime) {
      game.status = "scoring";
    }

    game.updatedAt = now;
    this.games.set(gameId, game);

    return game;
  }

  /**
   * Lock a specific pick (when event starts)
   */
  async lockPick(gameId: string, pickId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const pick = game.picks.find((p) => p.id === pickId);
    if (!pick) throw new Error("Pick not found");

    pick.isLocked = true;
    pick.lockedAt = Date.now();
    game.updatedAt = Date.now();

    this.games.set(gameId, game);
  }

  /**
   * Resolve a pick (set correct answer)
   */
  async resolvePick(
    gameId: string,
    pickId: string,
    correctOptionId: string,
    resultValue?: number
  ): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const pick = game.picks.find((p) => p.id === pickId);
    if (!pick) throw new Error("Pick not found");

    pick.status = "correct"; // Will be used to mark as resolved
    pick.correctOptionId = correctOptionId;
    pick.resultValue = resultValue;

    // Mark correct option
    for (const option of pick.options) {
      option.isCorrect = option.id === correctOptionId;
    }

    game.updatedAt = Date.now();
    this.games.set(gameId, game);

    // Re-score all entries
    await this.scoreGame(gameId);
  }

  /**
   * Score all entries for a game
   */
  async scoreGame(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const gameEntries = this.entries.get(gameId) ?? [];

    // Score entries
    const scoredEntries = this.scoringEngine.scoreGame(game, gameEntries);

    // Update entries
    this.entries.set(gameId, scoredEntries);

    // Update leaderboard
    this.leaderboardService.buildLeaderboard(game, scoredEntries);

    // Check if game is complete
    const allPicksResolved = game.picks.every((p) => p.status !== "pending");
    if (allPicksResolved && game.status === "scoring") {
      game.status = "complete";

      // Distribute prizes
      this.scoringEngine.distributePrizes(scoredEntries, game);
    }

    game.updatedAt = Date.now();
    this.games.set(gameId, game);
  }

  // ==========================================================================
  // ENTRIES & PICKS
  // ==========================================================================

  /**
   * Submit an entry to a game
   */
  async submitEntry(
    userId: string,
    username: string,
    request: SubmitEntryRequest
  ): Promise<GameEntry> {
    const game = this.games.get(request.gameId);
    if (!game) throw new Error("Game not found");

    // Validate game is accepting entries
    const now = Date.now();
    if (now < game.entryOpenTime) {
      throw new Error("Entries not yet open");
    }
    if (now > game.entryCloseTime && !game.rules.allowLateEntry) {
      throw new Error("Entry period has closed");
    }

    // Check max entries
    if (game.maxEntries && game.entryCount >= game.maxEntries) {
      throw new Error("Maximum entries reached");
    }

    // Check user's existing entries
    const gameEntries = this.entries.get(request.gameId) ?? [];
    const userEntries = gameEntries.filter((e) => e.userId === userId);
    if (userEntries.length >= game.entriesPerUser) {
      throw new Error("Maximum entries per user reached");
    }

    // Validate picks
    const userPicks: UserPick[] = [];
    for (const pickRequest of request.picks) {
      const gamePick = game.picks.find((p) => p.id === pickRequest.pickId);
      if (!gamePick) {
        throw new Error(`Invalid pick: ${pickRequest.pickId}`);
      }

      if (gamePick.isLocked) {
        throw new Error(`Pick is locked: ${gamePick.question}`);
      }

      const selectedOption = gamePick.options.find(
        (o) => o.id === pickRequest.selectedOptionId
      );
      if (!selectedOption) {
        throw new Error(`Invalid selection for: ${gamePick.question}`);
      }

      userPicks.push({
        pickId: pickRequest.pickId,
        selectedOptionId: pickRequest.selectedOptionId,
        selectedOptionName: selectedOption.name,
        confidence: pickRequest.confidence,
        status: "pending",
        pointsEarned: 0,
        bonusEarned: 0,
        madeAt: now,
      });
    }

    // Create entry
    const entryId = `entry_${request.gameId}_${userId}_${userEntries.length + 1}`;
    const entry: GameEntry = {
      id: entryId,
      gameId: request.gameId,
      userId,
      username,
      picks: userPicks,
      totalPicks: game.picks.length,
      completedPicks: userPicks.length,
      tiebreakerAnswer: request.tiebreakerAnswer,
      score: 0,
      correctPicks: 0,
      incorrectPicks: 0,
      pendingPicks: userPicks.length,
      streak: 0,
      longestStreak: 0,
      isEliminated: false,
      entryNumber: userEntries.length + 1,
      submittedAt: now,
      lastUpdatedAt: now,
      createdAt: now,
    };

    gameEntries.push(entry);
    this.entries.set(request.gameId, gameEntries);

    // Update game entry count
    game.entryCount = gameEntries.length;
    game.updatedAt = now;
    this.games.set(request.gameId, game);

    // Update leaderboard
    this.leaderboardService.buildLeaderboard(game, gameEntries);

    return entry;
  }

  /**
   * Update picks for an entry
   */
  async updatePicks(
    userId: string,
    request: UpdatePicksRequest
  ): Promise<GameEntry> {
    const gameEntries = this.entries.get(request.entryId.split("_")[1]) ?? [];
    const entry = gameEntries.find(
      (e) => e.id === request.entryId && e.userId === userId
    );
    if (!entry) throw new Error("Entry not found");

    const game = this.games.get(entry.gameId);
    if (!game) throw new Error("Game not found");

    if (!game.rules.allowPickChanges) {
      throw new Error("Pick changes not allowed");
    }

    const now = Date.now();
    if (game.rules.pickChangeDeadline && now > game.rules.pickChangeDeadline) {
      throw new Error("Pick change deadline has passed");
    }

    // Update picks
    for (const pickUpdate of request.picks) {
      const userPick = entry.picks.find((p) => p.pickId === pickUpdate.pickId);
      const gamePick = game.picks.find((p) => p.id === pickUpdate.pickId);

      if (!userPick || !gamePick) continue;

      if (gamePick.isLocked) {
        throw new Error(`Pick is locked: ${gamePick.question}`);
      }

      const selectedOption = gamePick.options.find(
        (o) => o.id === pickUpdate.selectedOptionId
      );
      if (!selectedOption) {
        throw new Error(`Invalid selection for: ${gamePick.question}`);
      }

      userPick.selectedOptionId = pickUpdate.selectedOptionId;
      userPick.selectedOptionName = selectedOption.name;
      userPick.confidence = pickUpdate.confidence;
      userPick.madeAt = now;
    }

    entry.lastUpdatedAt = now;

    // Update in storage
    const entryIndex = gameEntries.findIndex((e) => e.id === entry.id);
    gameEntries[entryIndex] = entry;
    this.entries.set(entry.gameId, gameEntries);

    return entry;
  }

  /**
   * Get user's entry for a game
   */
  getEntry(gameId: string, userId: string): GameEntry | null {
    const gameEntries = this.entries.get(gameId) ?? [];
    return gameEntries.find((e) => e.userId === userId) ?? null;
  }

  /**
   * Get all entries for a user
   */
  getUserEntries(userId: string): GameEntry[] {
    const allEntries: GameEntry[] = [];
    for (const [_, entries] of this.entries) {
      allEntries.push(...entries.filter((e) => e.userId === userId));
    }
    return allEntries.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ==========================================================================
  // DISCOVERY
  // ==========================================================================

  /**
   * Get game by ID
   */
  getGame(gameId: string): PredictionGame | null {
    return this.games.get(gameId) ?? null;
  }

  /**
   * Search/list games
   */
  searchGames(
    filters: GameSearchFilters,
    limit: number = 20,
    cursor?: string
  ): GameListResponse {
    let games = Array.from(this.games.values());

    // Apply filters
    if (filters.type) {
      games = games.filter((g) => g.type === filters.type);
    }
    if (filters.sport) {
      games = games.filter((g) => g.sport.toLowerCase() === filters.sport!.toLowerCase());
    }
    if (filters.league) {
      games = games.filter((g) => g.league.toLowerCase() === filters.league!.toLowerCase());
    }
    if (filters.status) {
      games = games.filter((g) => g.status === filters.status);
    }
    if (filters.frequency) {
      games = games.filter((g) => g.frequency === filters.frequency);
    }
    if (filters.isFeatured !== undefined) {
      games = games.filter((g) => g.isFeatured === filters.isFeatured);
    }
    if (filters.hasFreePrizes) {
      games = games.filter((g) => g.prizePool.totalValue > 0);
    }

    // Only show public games
    games = games.filter((g) => g.isPublic && g.status !== "draft" && g.status !== "cancelled");

    // Sort by featured, then by start time
    games.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) {
        return a.isFeatured ? -1 : 1;
      }
      return a.startTime - b.startTime;
    });

    // Pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedGames = games.slice(startIndex, startIndex + limit);

    return {
      games: paginatedGames,
      total: games.length,
      hasMore: startIndex + limit < games.length,
      cursor: startIndex + limit < games.length ? String(startIndex + limit) : undefined,
    };
  }

  /**
   * Get featured games
   */
  getFeaturedGames(limit: number = 5): PredictionGame[] {
    return Array.from(this.games.values())
      .filter((g) => g.isFeatured && g.isPublic && (g.status === "upcoming" || g.status === "live"))
      .slice(0, limit);
  }

  /**
   * Get games for a specific sport
   */
  getGamesBySport(sport: string, limit: number = 10): PredictionGame[] {
    return Array.from(this.games.values())
      .filter(
        (g) => g.sport.toLowerCase() === sport.toLowerCase() &&
          g.isPublic &&
          (g.status === "upcoming" || g.status === "live")
      )
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, limit);
  }

  // ==========================================================================
  // LEADERBOARDS
  // ==========================================================================

  /**
   * Get leaderboard for a game
   */
  getLeaderboard(
    gameId: string,
    options?: { limit?: number; offset?: number; userId?: string }
  ): GameLeaderboard | null {
    return this.leaderboardService.getLeaderboard(gameId, options);
  }

  /**
   * Get entries around a user
   */
  getEntriesAroundUser(gameId: string, userId: string, range?: number) {
    return this.leaderboardService.getEntriesAroundUser(gameId, userId, range);
  }

  // ==========================================================================
  // STREAKS
  // ==========================================================================

  /**
   * Get active streak challenges
   */
  getStreakChallenges(): StreakChallenge[] {
    return Array.from(this.streakChallenges.values()).filter((c) => c.isActive);
  }

  /**
   * Get user's streak
   */
  getUserStreak(challengeId: string, userId: string): UserStreak | null {
    const userStreaks = this.userStreaks.get(userId) ?? [];
    return userStreaks.find((s) => s.challengeId === challengeId) ?? null;
  }

  /**
   * Submit streak pick
   */
  async submitStreakPick(
    challengeId: string,
    userId: string,
    username: string,
    pickId: string,
    selectedOptionId: string
  ): Promise<UserStreak> {
    const challenge = this.streakChallenges.get(challengeId);
    if (!challenge) throw new Error("Challenge not found");

    if (challenge.currentPick.id !== pickId) {
      throw new Error("Invalid pick for current round");
    }

    // Get or create user streak
    let userStreaks = this.userStreaks.get(userId) ?? [];
    let streak = userStreaks.find((s) => s.challengeId === challengeId);

    if (!streak) {
      streak = {
        id: `streak_${challengeId}_${userId}`,
        challengeId,
        userId,
        username,
        currentStreak: 0,
        longestStreak: 0,
        totalPicks: 0,
        correctPicks: 0,
        currentStatus: "pending",
        prizesWon: [],
        totalPrizeValue: 0,
        pickHistory: [],
        lastUpdatedAt: Date.now(),
      };
      userStreaks.push(streak);
    }

    if (streak.currentStatus === "locked" || streak.currentStatus === "lost") {
      throw new Error("Pick already made for this round or streak is broken");
    }

    const selectedOption = challenge.currentPick.options.find(
      (o) => o.id === selectedOptionId
    );
    if (!selectedOption) {
      throw new Error("Invalid selection");
    }

    streak.currentPickId = pickId;
    streak.currentSelection = selectedOption.name;
    streak.currentStatus = "locked";
    streak.totalPicks++;
    streak.lastUpdatedAt = Date.now();

    this.userStreaks.set(userId, userStreaks);

    return streak;
  }

  /**
   * Resolve streak pick
   */
  async resolveStreakPick(
    challengeId: string,
    correctOptionId: string
  ): Promise<void> {
    const challenge = this.streakChallenges.get(challengeId);
    if (!challenge) throw new Error("Challenge not found");

    // Update all user streaks
    for (const [userId, userStreaks] of this.userStreaks) {
      const streak = userStreaks.find((s) => s.challengeId === challengeId);
      if (!streak || streak.currentStatus !== "locked") continue;

      const selectedOption = challenge.currentPick.options.find(
        (o) => o.name === streak.currentSelection
      );

      const isCorrect = selectedOption?.id === correctOptionId;

      const historyEntry = {
        pickId: streak.currentPickId!,
        eventName: challenge.currentPick.eventName,
        selection: streak.currentSelection!,
        result: isCorrect ? "correct" as const : "incorrect" as const,
        streakBefore: streak.currentStreak,
        streakAfter: isCorrect ? streak.currentStreak + 1 : 0,
        timestamp: Date.now(),
      };

      if (isCorrect) {
        streak.currentStreak++;
        streak.correctPicks++;
        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
        streak.currentStatus = "won";

        // Check for milestone prizes
        const milestonePrize = challenge.prizePerMilestone[streak.currentStreak];
        if (milestonePrize) {
          streak.prizesWon.push(milestonePrize);
          streak.totalPrizeValue += milestonePrize.value;
          historyEntry.prizeWon = milestonePrize;
        }

        // Check for grand prize
        if (streak.currentStreak >= challenge.targetStreak) {
          streak.prizesWon.push(challenge.grandPrize);
          streak.totalPrizeValue += challenge.grandPrize.value;
        }
      } else {
        streak.currentStreak = 0;
        streak.currentStatus = "lost";
      }

      streak.pickHistory.push(historyEntry);
      streak.currentPickId = undefined;
      streak.currentSelection = undefined;
      streak.lastUpdatedAt = Date.now();
    }
  }

  // ==========================================================================
  // CONVERSION OFFERS
  // ==========================================================================

  /**
   * Get conversion offer for user based on game performance
   */
  getConversionOffer(
    gameId: string,
    userId: string
  ): ConversionOffer | null {
    const game = this.games.get(gameId);
    if (!game?.conversionOffer) return null;

    const entry = this.getEntry(gameId, userId);
    if (!entry) return null;

    // Check if user meets rank requirement
    if (game.conversionOffer.minRank && entry.rank !== undefined) {
      if (entry.rank > game.conversionOffer.minRank) {
        return null;
      }
    }

    return game.conversionOffer;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Initialize sample games
   */
  private initializeSampleGames(): void {
    // Create a sample weekly NFL pick'em
    const sampleGame: PredictionGame = {
      id: "game_weekly_nfl",
      name: "NFL Weekly Pick'em",
      description: "Pick all NFL games against the spread",
      type: "pick_em",
      sport: "nfl",
      league: "NFL",
      status: "upcoming",
      frequency: "weekly",
      periodName: "Week 12",
      entryOpenTime: Date.now(),
      entryCloseTime: Date.now() + 86400000 * 3,
      startTime: Date.now() + 86400000 * 4,
      endTime: Date.now() + 86400000 * 7,
      picks: [],
      requireAllPicks: true,
      rules: {
        allowLateEntry: true,
        allowPickChanges: true,
      },
      scoringRules: {
        pointsPerCorrect: 10,
        pointsPerIncorrect: 0,
        bonusForStreak: { 3: 5, 5: 15, 7: 30 },
        bonusForPerfect: 100,
      },
      prizePool: {
        totalValue: 1000,
        currency: "tokens",
        distribution: [
          { rank: 1, prize: { type: "tokens", value: 500, description: "1st Place" } },
          { rank: 2, prize: { type: "tokens", value: 300, description: "2nd Place" } },
          { rank: 3, prize: { type: "tokens", value: 200, description: "3rd Place" } },
        ],
        guaranteedPrizes: true,
      },
      conversionOffer: {
        id: "offer_deposit_match",
        type: "deposit_match",
        headline: "100% Deposit Match!",
        description: "Make your first deposit and we'll match it up to $100",
        value: 100,
        maxValue: 100,
        minDeposit: 10,
        rollover: 5,
        newUsersOnly: true,
        requiresDeposit: true,
        expiresAt: Date.now() + 86400000 * 7,
        termsUrl: "/terms/deposit-match",
      },
      entryCount: 0,
      entriesPerUser: 1,
      isPublic: true,
      isFeatured: true,
      tags: ["nfl", "weekly", "free"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.games.set(sampleGame.id, sampleGame);
    this.entries.set(sampleGame.id, []);

    // Create a streak challenge
    const streakChallenge: StreakChallenge = {
      id: "streak_nfl_daily",
      name: "NFL Daily Streak",
      description: "Pick one NFL winner each day. Build your streak!",
      sport: "nfl",
      targetStreak: 10,
      currentPick: {
        id: "streak_pick_1",
        eventId: "event_1",
        eventName: "Chiefs vs Raiders",
        startTime: Date.now() + 86400000,
        question: "Who will win?",
        options: [
          { id: "opt_chiefs", name: "Chiefs" },
          { id: "opt_raiders", name: "Raiders" },
        ],
        minOdds: -300,
      },
      upcomingPicks: [],
      prizePerMilestone: {
        3: { type: "tokens", value: 25, description: "3-Game Streak" },
        5: { type: "tokens", value: 50, description: "5-Game Streak" },
        7: { type: "free_bet", value: 10, description: "7-Game Streak" },
      },
      grandPrize: { type: "cash", value: 100, description: "10-Game Perfect Streak" },
      activeParticipants: 0,
      longestActiveStreak: 0,
      longestAllTimeStreak: 0,
      resetsAt: Date.now() + 86400000,
      isActive: true,
    };

    this.streakChallenges.set(streakChallenge.id, streakChallenge);
  }

  /**
   * Get scoring engine
   */
  getScoringEngine(): PredictionScoringEngine {
    return this.scoringEngine;
  }

  /**
   * Get leaderboard service
   */
  getLeaderboardService(): PredictionLeaderboardService {
    return this.leaderboardService;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPredictionGamesService(): PredictionGamesService {
  return new PredictionGamesService();
}
