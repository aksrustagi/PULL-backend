/**
 * Bracket Scoring Engine
 *
 * Handles all scoring calculations for bracket competitions
 * including standard, weighted, upset bonus, and custom scoring.
 */

import {
  type Tournament,
  type TournamentGame,
  type Bracket,
  type BracketPick,
  type ScoringConfig,
  type ScoringSystem,
} from "./types";

// ============================================================================
// SCORING ENGINE
// ============================================================================

export class BracketScoringEngine {
  // ============================================================================
  // CORE SCORING
  // ============================================================================

  /**
   * Calculate points for a single correct pick
   */
  calculatePointsForPick(
    pick: BracketPick,
    game: TournamentGame,
    tournament: Tournament,
    config: ScoringConfig,
    upsetBonusEnabled: boolean
  ): number {
    let points = 0;

    // Base points for round
    const roundIndex = Math.min(pick.round - 1, config.pointsPerRound.length - 1);
    points = config.pointsPerRound[roundIndex];

    // Upset bonus
    if (upsetBonusEnabled && this.isUpset(game, pick.pickedTeamId)) {
      points *= config.upsetMultiplier;

      // Seed difference bonus
      const seedDiff = this.getSeedDifference(game, pick.pickedTeamId);
      if (seedDiff > 0) {
        points += seedDiff * config.seedDifferenceBonus;
      }
    }

    return Math.round(points * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Check if a pick is an upset
   */
  isUpset(game: TournamentGame, winnerId: string): boolean {
    if (!game.team1Seed || !game.team2Seed) return false;

    const winnerSeed = game.team1Id === winnerId ? game.team1Seed : game.team2Seed;
    const loserSeed = game.team1Id === winnerId ? game.team2Seed : game.team1Seed;

    return winnerSeed > loserSeed;
  }

  /**
   * Get seed difference for upset bonus
   */
  getSeedDifference(game: TournamentGame, winnerId: string): number {
    if (!game.team1Seed || !game.team2Seed) return 0;

    const winnerSeed = game.team1Id === winnerId ? game.team1Seed : game.team2Seed;
    const loserSeed = game.team1Id === winnerId ? game.team2Seed : game.team1Seed;

    return Math.max(0, winnerSeed - loserSeed);
  }

  /**
   * Calculate lost potential when a pick is wrong
   */
  calculateLostPotential(
    pick: BracketPick,
    tournament: Tournament,
    config: ScoringConfig
  ): number {
    let lostPoints = 0;
    const totalRounds = tournament.totalRounds;

    // Calculate points that could have been earned in future rounds
    // if this team had won and continued winning
    for (let round = pick.round; round <= totalRounds; round++) {
      const roundIndex = Math.min(round - 1, config.pointsPerRound.length - 1);
      lostPoints += config.pointsPerRound[roundIndex];
    }

    return lostPoints;
  }

  // ============================================================================
  // BRACKET SCORING
  // ============================================================================

  /**
   * Calculate total score for a bracket
   */
  calculateBracketScore(
    bracket: Bracket,
    tournament: Tournament,
    config: ScoringConfig,
    upsetBonusEnabled: boolean
  ): { total: number; byRound: Map<number, number> } {
    let total = 0;
    const byRound = new Map<number, number>();

    for (const pick of bracket.picks) {
      if (pick.result !== "correct") continue;

      const game = tournament.games.find((g) => g.id === pick.gameId);
      if (!game) continue;

      const points = this.calculatePointsForPick(
        pick,
        game,
        tournament,
        config,
        upsetBonusEnabled
      );

      total += points;

      const roundTotal = byRound.get(pick.round) ?? 0;
      byRound.set(pick.round, roundTotal + points);
    }

    // Check for champion bonus
    if (bracket.champion) {
      const championGame = tournament.games.find((g) => g.round === tournament.totalRounds);
      if (championGame?.winnerId === bracket.champion) {
        total += config.championBonus;
      }
    }

    // Check for Final Four bonus
    const finalFourRound = tournament.totalRounds - 1;
    const finalFourPicks = bracket.picks.filter(
      (p) => p.round === finalFourRound && p.result === "correct"
    );
    total += finalFourPicks.length * config.finalFourBonus;

    // Check for perfect round bonus
    for (const [round, roundScore] of byRound.entries()) {
      const gamesInRound = tournament.games.filter((g) => g.round === round).length;
      const correctInRound = bracket.picks.filter(
        (p) => p.round === round && p.result === "correct"
      ).length;

      if (correctInRound === gamesInRound) {
        total += config.perfectRoundBonus;
        byRound.set(round, roundScore + config.perfectRoundBonus);
      }
    }

    return { total, byRound };
  }

  /**
   * Calculate maximum possible points for a tournament
   */
  calculateMaxPossiblePoints(tournament: Tournament): number {
    const config: ScoringConfig = {
      pointsPerRound: [1, 2, 4, 8, 16, 32],
      upsetMultiplier: 1.0,
      seedDifferenceBonus: 0,
      perfectRoundBonus: 0,
      championBonus: 0,
      finalFourBonus: 0,
    };

    let total = 0;

    for (let round = 1; round <= tournament.totalRounds; round++) {
      const gamesInRound = this.getGamesInRound(tournament.totalTeams, round);
      const roundIndex = Math.min(round - 1, config.pointsPerRound.length - 1);
      total += gamesInRound * config.pointsPerRound[roundIndex];
    }

    return total;
  }

  /**
   * Calculate remaining possible points for a bracket
   */
  calculateRemainingPossible(
    bracket: Bracket,
    tournament: Tournament,
    config: ScoringConfig
  ): number {
    let remaining = 0;

    // For each pending pick
    for (const pick of bracket.picks) {
      if (pick.result !== "pending") continue;

      const game = tournament.games.find((g) => g.id === pick.gameId);
      if (!game || game.isComplete) continue;

      // Check if picked team is still alive
      const team = tournament.teams.find((t) => t.id === pick.pickedTeamId);
      if (team?.isEliminated) continue;

      // Add base points
      const roundIndex = Math.min(pick.round - 1, config.pointsPerRound.length - 1);
      remaining += config.pointsPerRound[roundIndex];
    }

    // Add champion bonus if champion is still alive
    if (bracket.champion) {
      const champion = tournament.teams.find((t) => t.id === bracket.champion);
      if (champion && !champion.isEliminated) {
        remaining += config.championBonus;
      }
    }

    return remaining;
  }

  /**
   * Get number of games in a round
   */
  private getGamesInRound(totalTeams: number, round: number): number {
    return totalTeams / Math.pow(2, round);
  }

  // ============================================================================
  // SCORING SYSTEM PRESETS
  // ============================================================================

  /**
   * Get preset scoring configuration
   */
  getPresetScoringConfig(system: ScoringSystem): ScoringConfig {
    switch (system) {
      case "standard":
        return {
          pointsPerRound: [1, 1, 1, 1, 1, 1],
          upsetMultiplier: 1.0,
          seedDifferenceBonus: 0,
          perfectRoundBonus: 0,
          championBonus: 0,
          finalFourBonus: 0,
        };

      case "weighted":
        return {
          pointsPerRound: [1, 2, 4, 8, 16, 32],
          upsetMultiplier: 1.0,
          seedDifferenceBonus: 0,
          perfectRoundBonus: 0,
          championBonus: 0,
          finalFourBonus: 0,
        };

      case "upset_bonus":
        return {
          pointsPerRound: [1, 2, 4, 8, 16, 32],
          upsetMultiplier: 1.5,
          seedDifferenceBonus: 0.5,
          perfectRoundBonus: 0,
          championBonus: 0,
          finalFourBonus: 0,
        };

      case "seed_weighted":
        return {
          pointsPerRound: [1, 2, 4, 8, 16, 32],
          upsetMultiplier: 1.0,
          seedDifferenceBonus: 1.0,
          perfectRoundBonus: 0,
          championBonus: 0,
          finalFourBonus: 0,
        };

      case "progressive":
        return {
          pointsPerRound: [2, 3, 5, 8, 13, 21], // Fibonacci-ish
          upsetMultiplier: 1.25,
          seedDifferenceBonus: 0.25,
          perfectRoundBonus: 10,
          championBonus: 20,
          finalFourBonus: 5,
        };

      default:
        return this.getPresetScoringConfig("weighted");
    }
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Calculate bracket analytics
   */
  calculateBracketAnalytics(
    bracket: Bracket,
    tournament: Tournament,
    allBrackets: Bracket[]
  ): BracketAnalytics {
    const correctPicks = bracket.picks.filter((p) => p.result === "correct");
    const incorrectPicks = bracket.picks.filter((p) => p.result === "incorrect");
    const pendingPicks = bracket.picks.filter((p) => p.result === "pending");

    // Calculate percentile
    const sortedBrackets = [...allBrackets].sort((a, b) => b.totalPoints - a.totalPoints);
    const rank = sortedBrackets.findIndex((b) => b.id === bracket.id) + 1;
    const percentile = Math.round((1 - rank / allBrackets.length) * 100);

    // Unique picks (picks that < 20% of brackets have)
    const uniquePicks: BracketPick[] = [];
    for (const pick of bracket.picks) {
      const pickCount = allBrackets.filter((b) =>
        b.picks.some((p) => p.gameId === pick.gameId && p.pickedTeamId === pick.pickedTeamId)
      ).length;
      const pickPercentage = pickCount / allBrackets.length;
      if (pickPercentage < 0.2) {
        uniquePicks.push(pick);
      }
    }

    // Calculate upset success rate
    const upsetPicks = bracket.picks.filter((p) => {
      const game = tournament.games.find((g) => g.id === p.gameId);
      return game && this.isUpset(game, p.pickedTeamId);
    });
    const correctUpsets = upsetPicks.filter((p) => p.result === "correct");
    const upsetSuccessRate = upsetPicks.length > 0
      ? correctUpsets.length / upsetPicks.length
      : 0;

    // Round-by-round accuracy
    const roundAccuracy: { round: number; correct: number; total: number; accuracy: number }[] = [];
    for (let round = 1; round <= tournament.totalRounds; round++) {
      const roundPicks = bracket.picks.filter((p) => p.round === round);
      const correctInRound = roundPicks.filter((p) => p.result === "correct").length;
      const decidedInRound = roundPicks.filter((p) => p.result !== "pending").length;

      if (decidedInRound > 0) {
        roundAccuracy.push({
          round,
          correct: correctInRound,
          total: decidedInRound,
          accuracy: correctInRound / decidedInRound,
        });
      }
    }

    return {
      bracketId: bracket.id,
      rank,
      percentile,
      correctCount: correctPicks.length,
      incorrectCount: incorrectPicks.length,
      pendingCount: pendingPicks.length,
      upsetsPicked: upsetPicks.length,
      upsetsCorrect: correctUpsets.length,
      upsetSuccessRate,
      uniquePicks: uniquePicks.length,
      roundAccuracy,
      championAlive: bracket.champion
        ? !tournament.teams.find((t) => t.id === bracket.champion)?.isEliminated
        : false,
    };
  }
}

export interface BracketAnalytics {
  bracketId: string;
  rank: number;
  percentile: number;
  correctCount: number;
  incorrectCount: number;
  pendingCount: number;
  upsetsPicked: number;
  upsetsCorrect: number;
  upsetSuccessRate: number;
  uniquePicks: number;
  roundAccuracy: { round: number; correct: number; total: number; accuracy: number }[];
  championAlive: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

let scoringEngine: BracketScoringEngine | null = null;

export function getScoringEngine(): BracketScoringEngine {
  if (!scoringEngine) {
    scoringEngine = new BracketScoringEngine();
  }
  return scoringEngine;
}

export function createScoringEngine(): BracketScoringEngine {
  return new BracketScoringEngine();
}
