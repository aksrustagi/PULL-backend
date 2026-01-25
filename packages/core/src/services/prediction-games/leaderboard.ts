/**
 * Prediction Games Leaderboard
 * Track standings, movements, and history
 */

import type {
  PredictionGame,
  GameEntry,
  GameLeaderboard,
  LeaderboardEntry,
  Prize,
} from "./types";

// ============================================================================
// LEADERBOARD SERVICE
// ============================================================================

export class PredictionLeaderboardService {
  private leaderboards: Map<string, GameLeaderboard> = new Map();
  private historyCache: Map<string, LeaderboardSnapshot[]> = new Map();

  /**
   * Build/update leaderboard for a game
   */
  buildLeaderboard(game: PredictionGame, entries: GameEntry[]): GameLeaderboard {
    // Get previous leaderboard for rank changes
    const previousLeaderboard = this.leaderboards.get(game.id);
    const previousRanks = new Map<string, number>();
    if (previousLeaderboard) {
      for (const entry of previousLeaderboard.entries) {
        previousRanks.set(entry.userId, entry.rank);
      }
    }

    // Build entries sorted by rank
    const leaderboardEntries = entries
      .filter((e) => e.rank !== undefined)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .map((entry) => this.entryToLeaderboardEntry(entry, game, previousRanks));

    const leaderboard: GameLeaderboard = {
      gameId: game.id,
      lastUpdatedAt: Date.now(),
      entries: leaderboardEntries,
      totalEntries: entries.length,
    };

    this.leaderboards.set(game.id, leaderboard);

    // Store snapshot for history
    this.storeSnapshot(game.id, leaderboard);

    return leaderboard;
  }

  /**
   * Get leaderboard with optional pagination
   */
  getLeaderboard(
    gameId: string,
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
    } = {}
  ): GameLeaderboard | null {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return null;

    const { limit = 100, offset = 0, userId } = options;

    // Get paginated entries
    const paginatedEntries = leaderboard.entries.slice(offset, offset + limit);

    // Find user's entry if requested
    let userEntry: LeaderboardEntry | undefined;
    let userRank: number | undefined;

    if (userId) {
      userEntry = leaderboard.entries.find((e) => e.userId === userId);
      userRank = userEntry?.rank;
    }

    return {
      ...leaderboard,
      entries: paginatedEntries,
      userEntry,
      userRank,
    };
  }

  /**
   * Get entries around a specific user
   */
  getEntriesAroundUser(
    gameId: string,
    userId: string,
    range: number = 5
  ): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return [];

    const userIndex = leaderboard.entries.findIndex((e) => e.userId === userId);
    if (userIndex === -1) return [];

    const start = Math.max(0, userIndex - range);
    const end = Math.min(leaderboard.entries.length, userIndex + range + 1);

    return leaderboard.entries.slice(start, end);
  }

  /**
   * Get top performers
   */
  getTopPerformers(gameId: string, limit: number = 10): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return [];

    return leaderboard.entries.slice(0, limit);
  }

  /**
   * Get biggest movers (positive movement)
   */
  getBiggestMovers(gameId: string, limit: number = 10): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return [];

    return [...leaderboard.entries]
      .filter((e) => e.rankChange !== undefined && e.rankChange > 0)
      .sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))
      .slice(0, limit);
  }

  /**
   * Get users on hot streaks
   */
  getHotStreaks(gameId: string, minStreak: number = 3, limit: number = 10): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return [];

    return [...leaderboard.entries]
      .filter((e) => e.currentStreak >= minStreak)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);
  }

  /**
   * Get prize winners
   */
  getPrizeWinners(gameId: string): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return [];

    return leaderboard.entries.filter((e) => e.prize !== undefined);
  }

  /**
   * Convert GameEntry to LeaderboardEntry
   */
  private entryToLeaderboardEntry(
    entry: GameEntry,
    game: PredictionGame,
    previousRanks: Map<string, number>
  ): LeaderboardEntry {
    const previousRank = previousRanks.get(entry.userId);
    const rankChange = previousRank !== undefined && entry.rank !== undefined
      ? previousRank - entry.rank  // Positive = moved up
      : undefined;

    // Determine prize eligibility
    const prizeEligible = this.isPrizeEligible(entry, game);
    const prize = this.determinePrize(entry.rank ?? 999, game);

    return {
      rank: entry.rank ?? 0,
      userId: entry.userId,
      username: entry.username,
      score: entry.score,
      correctPicks: entry.correctPicks,
      totalPicks: entry.totalPicks,
      accuracy: entry.totalPicks > 0
        ? Math.round((entry.correctPicks / entry.totalPicks) * 100 * 10) / 10
        : 0,
      currentStreak: entry.streak,
      longestStreak: entry.longestStreak,
      isEliminated: entry.isEliminated,
      prizeEligible,
      prize,
      rankChange,
    };
  }

  /**
   * Check if entry is prize eligible
   */
  private isPrizeEligible(entry: GameEntry, game: PredictionGame): boolean {
    // Must have completed required picks
    if (game.requireAllPicks && entry.completedPicks < entry.totalPicks) {
      return false;
    }

    // Must not be eliminated
    if (entry.isEliminated) {
      return false;
    }

    // Must be within prize range
    const maxPrizeRank = this.getMaxPrizeRank(game);
    if (entry.rank !== undefined && entry.rank > maxPrizeRank) {
      return false;
    }

    return true;
  }

  /**
   * Determine prize for a rank
   */
  private determinePrize(rank: number, game: PredictionGame): Prize | undefined {
    for (const dist of game.prizePool.distribution) {
      const { startRank, endRank } = this.parseRankRange(dist.rank);
      if (rank >= startRank && rank <= endRank) {
        return dist.prize;
      }
    }
    return undefined;
  }

  /**
   * Get maximum rank that wins a prize
   */
  private getMaxPrizeRank(game: PredictionGame): number {
    let maxRank = 0;
    for (const dist of game.prizePool.distribution) {
      const { endRank } = this.parseRankRange(dist.rank);
      maxRank = Math.max(maxRank, endRank);
    }
    return maxRank;
  }

  /**
   * Parse rank specification
   */
  private parseRankRange(rank: number | string): { startRank: number; endRank: number } {
    if (typeof rank === "number") {
      return { startRank: rank, endRank: rank };
    }

    const parts = rank.split("-").map(Number);
    if (parts.length === 2) {
      return { startRank: parts[0], endRank: parts[1] };
    }

    return { startRank: Number(rank), endRank: Number(rank) };
  }

  /**
   * Store snapshot for history tracking
   */
  private storeSnapshot(gameId: string, leaderboard: GameLeaderboard): void {
    const history = this.historyCache.get(gameId) ?? [];

    // Only store periodic snapshots (e.g., every 15 minutes)
    const lastSnapshot = history[history.length - 1];
    if (lastSnapshot && Date.now() - lastSnapshot.timestamp < 15 * 60 * 1000) {
      return;
    }

    const snapshot: LeaderboardSnapshot = {
      timestamp: Date.now(),
      topEntries: leaderboard.entries.slice(0, 20).map((e) => ({
        userId: e.userId,
        username: e.username,
        rank: e.rank,
        score: e.score,
      })),
    };

    history.push(snapshot);

    // Keep last 48 snapshots (12 hours at 15-minute intervals)
    if (history.length > 48) {
      history.shift();
    }

    this.historyCache.set(gameId, history);
  }

  /**
   * Get leaderboard history for a user
   */
  getLeaderboardHistory(
    gameId: string,
    userId: string
  ): Array<{ timestamp: number; rank: number; score: number }> {
    const history = this.historyCache.get(gameId) ?? [];

    return history
      .map((snapshot) => {
        const entry = snapshot.topEntries.find((e) => e.userId === userId);
        return entry
          ? { timestamp: snapshot.timestamp, rank: entry.rank, score: entry.score }
          : null;
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }

  /**
   * Get global stats for a game
   */
  getGameStats(gameId: string): GameStats | null {
    const leaderboard = this.leaderboards.get(gameId);
    if (!leaderboard) return null;

    const entries = leaderboard.entries;
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        averageScore: 0,
        averageAccuracy: 0,
        highestScore: 0,
        longestStreak: 0,
        perfectEntries: 0,
        eliminatedCount: 0,
      };
    }

    const totalScore = entries.reduce((sum, e) => sum + e.score, 0);
    const totalAccuracy = entries.reduce((sum, e) => sum + e.accuracy, 0);
    const perfectEntries = entries.filter(
      (e) => e.correctPicks === e.totalPicks && e.totalPicks > 0
    ).length;
    const eliminatedCount = entries.filter((e) => e.isEliminated).length;

    return {
      totalEntries: entries.length,
      averageScore: Math.round(totalScore / entries.length),
      averageAccuracy: Math.round((totalAccuracy / entries.length) * 10) / 10,
      highestScore: entries[0]?.score ?? 0,
      longestStreak: Math.max(...entries.map((e) => e.longestStreak)),
      perfectEntries,
      eliminatedCount,
    };
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardSnapshot {
  timestamp: number;
  topEntries: Array<{
    userId: string;
    username: string;
    rank: number;
    score: number;
  }>;
}

interface GameStats {
  totalEntries: number;
  averageScore: number;
  averageAccuracy: number;
  highestScore: number;
  longestStreak: number;
  perfectEntries: number;
  eliminatedCount: number;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPredictionLeaderboardService(): PredictionLeaderboardService {
  return new PredictionLeaderboardService();
}
