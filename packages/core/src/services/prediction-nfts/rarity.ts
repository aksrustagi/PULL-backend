/**
 * Prediction NFT Rarity Calculator
 * Calculate rarity scores based on bet characteristics
 */

import {
  NFTRarity,
  NFTCategory,
  RarityFactors,
  RARITY_THRESHOLDS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface RarityConfig {
  // Odds thresholds
  oddsMultiplierCaps: { odds: number; multiplier: number }[];

  // Payout thresholds
  payoutMultiplierCaps: { payout: number; multiplier: number }[];

  // Profit multiplier thresholds
  profitMultiplierCaps: { profit: number; multiplier: number }[];

  // Event significance modifiers
  eventSignificanceModifiers: Record<string, number>;

  // Category bonuses
  categoryBonuses: Record<NFTCategory, number>;

  // Weights for final calculation
  weights: {
    odds: number;
    payout: number;
    profit: number;
    eventSignificance: number;
    timing: number;
    streak: number;
    category: number;
  };
}

const DEFAULT_CONFIG: RarityConfig = {
  oddsMultiplierCaps: [
    { odds: 2.0, multiplier: 1 },
    { odds: 3.0, multiplier: 2 },
    { odds: 5.0, multiplier: 4 },
    { odds: 10.0, multiplier: 8 },
    { odds: 20.0, multiplier: 15 },
    { odds: 50.0, multiplier: 25 },
    { odds: 100.0, multiplier: 40 },
    { odds: Infinity, multiplier: 50 },
  ],

  payoutMultiplierCaps: [
    { payout: 100, multiplier: 1 },
    { payout: 500, multiplier: 3 },
    { payout: 1000, multiplier: 5 },
    { payout: 5000, multiplier: 10 },
    { payout: 10000, multiplier: 15 },
    { payout: 50000, multiplier: 25 },
    { payout: 100000, multiplier: 35 },
    { payout: Infinity, multiplier: 50 },
  ],

  profitMultiplierCaps: [
    { profit: 2, multiplier: 1 },
    { profit: 5, multiplier: 3 },
    { profit: 10, multiplier: 6 },
    { profit: 25, multiplier: 10 },
    { profit: 50, multiplier: 15 },
    { profit: 100, multiplier: 25 },
    { profit: Infinity, multiplier: 40 },
  ],

  eventSignificanceModifiers: {
    championship: 20,
    playoff: 15,
    finals: 25,
    super_bowl: 30,
    world_cup: 30,
    olympics: 25,
    all_star: 10,
    rivalry: 10,
    regular: 0,
  },

  categoryBonuses: {
    winning_bet: 0,
    perfect_parlay: 20,
    streak: 15,
    milestone: 10,
    event_special: 25,
    leaderboard: 15,
    achievement: 10,
  },

  weights: {
    odds: 0.25,
    payout: 0.20,
    profit: 0.20,
    eventSignificance: 0.15,
    timing: 0.05,
    streak: 0.05,
    category: 0.10,
  },
};

// ============================================================================
// Rarity Calculator
// ============================================================================

export class RarityCalculator {
  private config: RarityConfig;

  constructor(config?: Partial<RarityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Calculation
  // ==========================================================================

  /**
   * Calculate rarity score and factors for a bet
   */
  calculateRarity(params: {
    odds: number;
    stake: number;
    payout: number;
    profit: number;
    category: NFTCategory;
    eventType?: string;
    parlayLegs?: number;
    streakLength?: number;
    betPlacedAt?: Date;
    eventDate?: Date;
  }): { rarity: NFTRarity; score: number; factors: RarityFactors } {
    const {
      odds,
      stake,
      payout,
      profit,
      category,
      eventType = "regular",
      parlayLegs = 1,
      streakLength = 0,
      betPlacedAt,
      eventDate,
    } = params;

    // Calculate individual factors
    const oddsMultiplier = this.calculateOddsMultiplier(odds);
    const payoutMultiplier = this.calculatePayoutMultiplier(payout);
    const profitMultiplier = this.calculateProfitMultiplier(profit / stake);
    const eventSignificance = this.calculateEventSignificance(eventType);
    const timingBonus = this.calculateTimingBonus(betPlacedAt, eventDate);
    const streakBonus = this.calculateStreakBonus(streakLength);
    const categoryBonus = this.calculateCategoryBonus(category, parlayLegs);

    // Calculate weighted score
    const factors: RarityFactors = {
      oddsMultiplier,
      payoutMultiplier,
      profitMultiplier,
      eventSignificance,
      timingBonus,
      streakBonus,
      categoryBonus,
      total: 0,
    };

    const weightedScore =
      oddsMultiplier * this.config.weights.odds +
      payoutMultiplier * this.config.weights.payout +
      profitMultiplier * this.config.weights.profit +
      eventSignificance * this.config.weights.eventSignificance +
      timingBonus * this.config.weights.timing +
      streakBonus * this.config.weights.streak +
      categoryBonus * this.config.weights.category;

    // Normalize to 0-100 scale
    const normalizedScore = Math.min(100, Math.max(0, weightedScore));
    factors.total = normalizedScore;

    // Determine rarity tier
    const rarity = this.scoreToRarity(normalizedScore);

    return { rarity, score: normalizedScore, factors };
  }

  // ==========================================================================
  // Factor Calculations
  // ==========================================================================

  /**
   * Calculate odds multiplier
   */
  private calculateOddsMultiplier(odds: number): number {
    for (const cap of this.config.oddsMultiplierCaps) {
      if (odds <= cap.odds) {
        return cap.multiplier;
      }
    }
    return this.config.oddsMultiplierCaps[this.config.oddsMultiplierCaps.length - 1].multiplier;
  }

  /**
   * Calculate payout multiplier
   */
  private calculatePayoutMultiplier(payout: number): number {
    for (const cap of this.config.payoutMultiplierCaps) {
      if (payout <= cap.payout) {
        return cap.multiplier;
      }
    }
    return this.config.payoutMultiplierCaps[this.config.payoutMultiplierCaps.length - 1].multiplier;
  }

  /**
   * Calculate profit multiplier (ROI)
   */
  private calculateProfitMultiplier(profitRatio: number): number {
    for (const cap of this.config.profitMultiplierCaps) {
      if (profitRatio <= cap.profit) {
        return cap.multiplier;
      }
    }
    return this.config.profitMultiplierCaps[this.config.profitMultiplierCaps.length - 1].multiplier;
  }

  /**
   * Calculate event significance score
   */
  private calculateEventSignificance(eventType: string): number {
    return this.config.eventSignificanceModifiers[eventType.toLowerCase()] ?? 0;
  }

  /**
   * Calculate timing bonus (early bet = higher bonus)
   */
  private calculateTimingBonus(betPlacedAt?: Date, eventDate?: Date): number {
    if (!betPlacedAt || !eventDate) return 0;

    const hoursBeforeEvent = (eventDate.getTime() - betPlacedAt.getTime()) / (1000 * 60 * 60);

    if (hoursBeforeEvent > 168) return 15; // 7+ days early
    if (hoursBeforeEvent > 72) return 10;  // 3+ days early
    if (hoursBeforeEvent > 24) return 5;   // 1+ days early
    if (hoursBeforeEvent > 1) return 2;    // 1+ hours early
    return 0;
  }

  /**
   * Calculate streak bonus
   */
  private calculateStreakBonus(streakLength: number): number {
    if (streakLength >= 20) return 25;
    if (streakLength >= 15) return 20;
    if (streakLength >= 10) return 15;
    if (streakLength >= 7) return 10;
    if (streakLength >= 5) return 5;
    if (streakLength >= 3) return 2;
    return 0;
  }

  /**
   * Calculate category bonus
   */
  private calculateCategoryBonus(category: NFTCategory, parlayLegs: number = 1): number {
    let bonus = this.config.categoryBonuses[category] ?? 0;

    // Extra bonus for multi-leg parlays
    if (category === "perfect_parlay" && parlayLegs > 2) {
      bonus += (parlayLegs - 2) * 5; // +5 per leg beyond 2
    }

    return Math.min(50, bonus); // Cap at 50
  }

  // ==========================================================================
  // Rarity Determination
  // ==========================================================================

  /**
   * Convert score to rarity tier
   */
  scoreToRarity(score: number): NFTRarity {
    for (const [rarity, thresholds] of Object.entries(RARITY_THRESHOLDS) as [NFTRarity, { min: number; max: number }][]) {
      if (score >= thresholds.min && score < thresholds.max) {
        return rarity;
      }
    }
    return "mythic";
  }

  /**
   * Get rarity tier details
   */
  getRarityDetails(rarity: NFTRarity): {
    name: string;
    minScore: number;
    maxScore: number;
    dropRate: number;
    color: string;
  } {
    const thresholds = RARITY_THRESHOLDS[rarity];
    const colors: Record<NFTRarity, string> = {
      common: "#9CA3AF",
      uncommon: "#22C55E",
      rare: "#3B82F6",
      epic: "#8B5CF6",
      legendary: "#F59E0B",
      mythic: "#EF4444",
    };
    const dropRates: Record<NFTRarity, number> = {
      common: 50,
      uncommon: 25,
      rare: 15,
      epic: 7,
      legendary: 2.5,
      mythic: 0.5,
    };

    return {
      name: rarity.charAt(0).toUpperCase() + rarity.slice(1),
      minScore: thresholds.min,
      maxScore: thresholds.max,
      dropRate: dropRates[rarity],
      color: colors[rarity],
    };
  }

  /**
   * Estimate rarity distribution for a batch of potential NFTs
   */
  estimateRarityDistribution(bets: {
    odds: number;
    stake: number;
    payout: number;
    profit: number;
    category: NFTCategory;
  }[]): Record<NFTRarity, number> {
    const distribution: Record<NFTRarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0,
    };

    for (const bet of bets) {
      const { rarity } = this.calculateRarity(bet);
      distribution[rarity]++;
    }

    return distribution;
  }

  // ==========================================================================
  // Special Calculations
  // ==========================================================================

  /**
   * Calculate parlay rarity (higher for more legs)
   */
  calculateParlayRarity(params: {
    legs: { odds: number; won: boolean }[];
    totalOdds: number;
    stake: number;
    payout: number;
  }): { rarity: NFTRarity; score: number; factors: RarityFactors } {
    const { legs, totalOdds, stake, payout } = params;

    // Perfect parlay bonus
    const perfectParlay = legs.every(l => l.won);
    const legBonus = perfectParlay ? legs.length * 5 : 0;

    const baseRarity = this.calculateRarity({
      odds: totalOdds,
      stake,
      payout,
      profit: payout - stake,
      category: perfectParlay ? "perfect_parlay" : "winning_bet",
      parlayLegs: legs.length,
    });

    // Add leg bonus to score
    const adjustedScore = Math.min(100, baseRarity.score + legBonus);
    const adjustedRarity = this.scoreToRarity(adjustedScore);

    return {
      rarity: adjustedRarity,
      score: adjustedScore,
      factors: {
        ...baseRarity.factors,
        total: adjustedScore,
      },
    };
  }

  /**
   * Calculate milestone achievement rarity
   */
  calculateMilestoneRarity(params: {
    milestoneType: "bets" | "wins" | "profit" | "volume";
    milestoneValue: number;
    isRound: boolean;
  }): { rarity: NFTRarity; score: number } {
    const { milestoneType, milestoneValue, isRound } = params;

    // Base score from milestone value
    let baseScore = 0;
    switch (milestoneType) {
      case "bets":
        if (milestoneValue >= 10000) baseScore = 80;
        else if (milestoneValue >= 1000) baseScore = 60;
        else if (milestoneValue >= 500) baseScore = 45;
        else if (milestoneValue >= 100) baseScore = 30;
        else baseScore = 15;
        break;
      case "wins":
        if (milestoneValue >= 5000) baseScore = 85;
        else if (milestoneValue >= 1000) baseScore = 65;
        else if (milestoneValue >= 500) baseScore = 50;
        else if (milestoneValue >= 100) baseScore = 35;
        else baseScore = 20;
        break;
      case "profit":
        if (milestoneValue >= 100000) baseScore = 90;
        else if (milestoneValue >= 50000) baseScore = 75;
        else if (milestoneValue >= 10000) baseScore = 55;
        else if (milestoneValue >= 1000) baseScore = 35;
        else baseScore = 15;
        break;
      case "volume":
        if (milestoneValue >= 1000000) baseScore = 85;
        else if (milestoneValue >= 100000) baseScore = 65;
        else if (milestoneValue >= 10000) baseScore = 45;
        else if (milestoneValue >= 1000) baseScore = 25;
        else baseScore = 10;
        break;
    }

    // Bonus for round numbers
    const roundBonus = isRound ? 5 : 0;
    const finalScore = Math.min(100, baseScore + roundBonus);

    return {
      rarity: this.scoreToRarity(finalScore),
      score: finalScore,
    };
  }
}

// Export singleton instance
export const rarityCalculator = new RarityCalculator();
