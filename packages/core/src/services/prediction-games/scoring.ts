/**
 * Prediction Games Scoring Engine
 * Calculate scores, streaks, and bonuses
 */

import type {
  PredictionGame,
  GameEntry,
  GamePick,
  UserPick,
  PickStatus,
  ScoringRules,
  Prize,
} from "./types";

// ============================================================================
// SCORING ENGINE
// ============================================================================

export class PredictionScoringEngine {
  private defaultRules: ScoringRules = {
    pointsPerCorrect: 10,
    pointsPerIncorrect: 0,
    bonusForStreak: {
      3: 5,
      5: 15,
      7: 30,
      10: 50,
    },
    bonusForPerfect: 100,
    confidenceMultiplier: false,
    upsetBonus: true,
    upsetBonusMultiplier: 1.5,
  };

  /**
   * Score all entries for a game
   */
  scoreGame(game: PredictionGame, entries: GameEntry[]): GameEntry[] {
    const rules = { ...this.defaultRules, ...game.scoringRules };

    // Score each entry
    const scoredEntries = entries.map((entry) =>
      this.scoreEntry(entry, game.picks, rules)
    );

    // Calculate ranks
    const rankedEntries = this.calculateRanks(scoredEntries, game);

    return rankedEntries;
  }

  /**
   * Score a single entry
   */
  scoreEntry(
    entry: GameEntry,
    picks: GamePick[],
    rules: ScoringRules
  ): GameEntry {
    let totalScore = 0;
    let correctPicks = 0;
    let incorrectPicks = 0;
    let pendingPicks = 0;
    let currentStreak = 0;
    let longestStreak = entry.longestStreak;

    // Process picks in order
    const pickMap = new Map(picks.map((p) => [p.id, p]));

    for (const userPick of entry.picks) {
      const gamePick = pickMap.get(userPick.pickId);
      if (!gamePick) continue;

      // Determine pick result
      const status = this.determinePickStatus(userPick, gamePick);
      userPick.status = status;

      // Calculate points
      const { points, bonus } = this.calculatePickPoints(
        userPick,
        gamePick,
        status,
        rules,
        currentStreak
      );

      userPick.pointsEarned = points;
      userPick.bonusEarned = bonus;
      totalScore += points + bonus;

      // Update counters
      if (status === "correct") {
        correctPicks++;
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (status === "incorrect") {
        incorrectPicks++;
        currentStreak = 0;
      } else if (status === "pending") {
        pendingPicks++;
      }
      // Push/void don't affect streak or counts
    }

    // Perfect bonus
    if (correctPicks === entry.picks.length && entry.picks.length > 0 && pendingPicks === 0) {
      totalScore += rules.bonusForPerfect;
    }

    return {
      ...entry,
      score: totalScore,
      correctPicks,
      incorrectPicks,
      pendingPicks,
      streak: currentStreak,
      longestStreak,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * Determine the status of a pick
   */
  private determinePickStatus(userPick: UserPick, gamePick: GamePick): PickStatus {
    // If game pick isn't resolved yet
    if (gamePick.status === "pending") {
      return "pending";
    }

    // If game was voided
    if (gamePick.status === "void") {
      return "void";
    }

    // Check if user's selection was correct
    if (gamePick.correctOptionId === userPick.selectedOptionId) {
      return "correct";
    }

    // Push if no winner (shouldn't normally happen in prediction games)
    if (gamePick.status === "push") {
      return "push";
    }

    return "incorrect";
  }

  /**
   * Calculate points for a single pick
   */
  private calculatePickPoints(
    userPick: UserPick,
    gamePick: GamePick,
    status: PickStatus,
    rules: ScoringRules,
    currentStreak: number
  ): { points: number; bonus: number } {
    if (status !== "correct") {
      return { points: rules.pointsPerIncorrect, bonus: 0 };
    }

    let points = gamePick.basePoints ?? rules.pointsPerCorrect;
    let bonus = 0;

    // Confidence multiplier
    if (rules.confidenceMultiplier && userPick.confidence) {
      points = Math.round(points * (userPick.confidence / 5)); // Assuming 1-10 scale
    }

    // Bonus multiplier on pick
    if (gamePick.bonusMultiplier) {
      points = Math.round(points * gamePick.bonusMultiplier);
    }

    // Streak bonus
    const nextStreak = currentStreak + 1;
    if (rules.bonusForStreak[nextStreak]) {
      bonus += rules.bonusForStreak[nextStreak];
    }

    // Upset bonus (if the option had long odds)
    if (rules.upsetBonus && rules.upsetBonusMultiplier) {
      const selectedOption = gamePick.options.find(
        (o) => o.id === userPick.selectedOptionId
      );
      if (selectedOption?.odds && selectedOption.odds > 200) {
        bonus += Math.round(points * (rules.upsetBonusMultiplier - 1));
      }
    }

    return { points, bonus };
  }

  /**
   * Calculate ranks for all entries
   */
  private calculateRanks(entries: GameEntry[], game: PredictionGame): GameEntry[] {
    // Sort by score (desc), then by tiebreaker if applicable
    const sorted = [...entries].sort((a, b) => {
      // Primary: Score
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // Secondary: Correct picks
      if (b.correctPicks !== a.correctPicks) {
        return b.correctPicks - a.correctPicks;
      }

      // Tertiary: Longest streak
      if (b.longestStreak !== a.longestStreak) {
        return b.longestStreak - a.longestStreak;
      }

      // Tiebreaker answer if available
      if (game.rules.tiebreaker && a.tiebreakerAnswer && b.tiebreakerAnswer) {
        return this.compareTiebreakers(a, b, game);
      }

      // Finally: Earlier submission time
      return (a.submittedAt ?? a.createdAt) - (b.submittedAt ?? b.createdAt);
    });

    // Assign ranks (handle ties)
    let currentRank = 1;
    let previousScore = -1;
    let sameRankCount = 0;

    return sorted.map((entry, index) => {
      if (entry.score !== previousScore) {
        currentRank = index + 1;
        sameRankCount = 0;
      } else {
        sameRankCount++;
      }
      previousScore = entry.score;

      // Calculate percentile
      const percentile = Math.round(((sorted.length - index) / sorted.length) * 100);

      return {
        ...entry,
        rank: currentRank,
        percentile,
      };
    });
  }

  /**
   * Compare tiebreaker answers
   */
  private compareTiebreakers(
    a: GameEntry,
    b: GameEntry,
    game: PredictionGame
  ): number {
    const tiebreaker = game.rules.tiebreaker;
    if (!tiebreaker) return 0;

    // For score-based tiebreakers, find the actual result
    // (Would need to be populated after game ends)
    const actualValue = 0; // Would be set from game resolution

    const aDiff = Math.abs(Number(a.tiebreakerAnswer) - actualValue);
    const bDiff = Math.abs(Number(b.tiebreakerAnswer) - actualValue);

    return aDiff - bDiff; // Closer guess wins
  }

  /**
   * Distribute prizes based on ranks
   */
  distributePrizes(
    entries: GameEntry[],
    game: PredictionGame
  ): Map<string, Prize> {
    const prizeMap = new Map<string, Prize>();

    if (entries.length < (game.prizePool.minEntriesRequired ?? 0)) {
      return prizeMap; // Not enough entries, no prizes
    }

    for (const dist of game.prizePool.distribution) {
      // Parse rank (could be single number or range like "4-10")
      const { startRank, endRank } = this.parseRankRange(dist.rank);

      // Find entries in this rank range
      const eligibleEntries = entries.filter(
        (e) => e.rank !== undefined && e.rank >= startRank && e.rank <= endRank && !e.isEliminated
      );

      for (const entry of eligibleEntries) {
        prizeMap.set(entry.id, dist.prize);
        entry.prizeWon = dist.prize;
      }
    }

    return prizeMap;
  }

  /**
   * Parse rank specification
   */
  private parseRankRange(rank: number | string): { startRank: number; endRank: number } {
    if (typeof rank === "number") {
      return { startRank: rank, endRank: rank };
    }

    // Handle range like "4-10"
    const parts = rank.split("-").map(Number);
    if (parts.length === 2) {
      return { startRank: parts[0], endRank: parts[1] };
    }

    return { startRank: Number(rank), endRank: Number(rank) };
  }

  /**
   * Calculate streak milestone prizes
   */
  calculateStreakPrizes(
    currentStreak: number,
    milestones: Record<number, Prize>
  ): Prize[] {
    const prizes: Prize[] = [];

    for (const [milestone, prize] of Object.entries(milestones)) {
      const milestoneNum = Number(milestone);
      if (currentStreak >= milestoneNum) {
        prizes.push(prize);
      }
    }

    return prizes;
  }

  /**
   * Check if entry is eliminated (for survivor games)
   */
  isEliminated(entry: GameEntry, rules: ScoringRules): boolean {
    // Survivor mode: one wrong pick eliminates you
    if (entry.incorrectPicks > 0) {
      return true;
    }

    return false;
  }

  /**
   * Calculate accuracy percentage
   */
  calculateAccuracy(correct: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((correct / total) * 100 * 10) / 10; // One decimal place
  }

  /**
   * Get scoring summary for display
   */
  getScoringSummary(entry: GameEntry): {
    totalScore: number;
    breakdown: Array<{ label: string; points: number }>;
    accuracy: string;
    streakBonus: number;
  } {
    let basePoints = 0;
    let bonusPoints = 0;

    for (const pick of entry.picks) {
      basePoints += pick.pointsEarned;
      bonusPoints += pick.bonusEarned;
    }

    return {
      totalScore: entry.score,
      breakdown: [
        { label: "Correct Picks", points: basePoints },
        { label: "Streak Bonuses", points: bonusPoints },
      ],
      accuracy: `${this.calculateAccuracy(entry.correctPicks, entry.totalPicks)}%`,
      streakBonus: bonusPoints,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPredictionScoringEngine(): PredictionScoringEngine {
  return new PredictionScoringEngine();
}
