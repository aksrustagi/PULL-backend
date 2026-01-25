/**
 * Multiplier Calculator Service
 * Handles multiplier calculations and tier progression
 */

import {
  MultiplierTier,
  MULTIPLIER_TIERS,
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
  StreakType,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface MultiplierConfig {
  baseMultiplier: number;
  maxMultiplier: number;
  categoryBonus: number; // Extra % for category-specific streaks
  oddsRangeBonus: number; // Extra % for odds-range streaks
  weeklyBonus: number; // Bonus for weekly performance
  compoundingEnabled: boolean;
  diminishingReturns: boolean;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_CONFIG: MultiplierConfig = {
  baseMultiplier: MIN_MULTIPLIER,
  maxMultiplier: MAX_MULTIPLIER,
  categoryBonus: 0.05, // 5% bonus for category streaks
  oddsRangeBonus: 0.1, // 10% bonus for underdog streaks
  weeklyBonus: 0.15, // 15% bonus for weekly consistency
  compoundingEnabled: true,
  diminishingReturns: true,
};

// ============================================================================
// MULTIPLIER CALCULATOR
// ============================================================================

export class MultiplierCalculator {
  private readonly config: MultiplierConfig;
  private readonly logger?: Logger;

  constructor(config?: Partial<MultiplierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config?.logger;
  }

  // ==========================================================================
  // TIER CALCULATION
  // ==========================================================================

  /**
   * Get the current multiplier tier for a streak length
   */
  getTier(streakLength: number): MultiplierTier {
    // Find the highest tier the streak qualifies for
    for (let i = MULTIPLIER_TIERS.length - 1; i >= 0; i--) {
      if (streakLength >= MULTIPLIER_TIERS[i].streakLength) {
        return MULTIPLIER_TIERS[i];
      }
    }

    return MULTIPLIER_TIERS[0];
  }

  /**
   * Get the next tier after current
   */
  getNextTier(streakLength: number): MultiplierTier | null {
    const currentTier = this.getTier(streakLength);
    const currentIndex = MULTIPLIER_TIERS.findIndex(
      (t) => t.streakLength === currentTier.streakLength
    );

    if (currentIndex < MULTIPLIER_TIERS.length - 1) {
      return MULTIPLIER_TIERS[currentIndex + 1];
    }

    return null;
  }

  /**
   * Get wins needed to reach next tier
   */
  getWinsToNextTier(streakLength: number): number {
    const nextTier = this.getNextTier(streakLength);

    if (!nextTier) {
      return 0; // Already at max tier
    }

    return nextTier.streakLength - streakLength;
  }

  /**
   * Get all tiers with progress info
   */
  getTierProgress(streakLength: number): Array<{
    tier: MultiplierTier;
    isReached: boolean;
    isCurrent: boolean;
    isNext: boolean;
    winsNeeded: number;
    progress: number;
  }> {
    const currentTier = this.getTier(streakLength);
    const nextTier = this.getNextTier(streakLength);

    return MULTIPLIER_TIERS.map((tier, index) => {
      const isReached = streakLength >= tier.streakLength;
      const isCurrent = tier.streakLength === currentTier.streakLength;
      const isNext = nextTier && tier.streakLength === nextTier.streakLength;

      let winsNeeded = 0;
      let progress = 0;

      if (!isReached) {
        winsNeeded = tier.streakLength - streakLength;
        const prevTier = index > 0 ? MULTIPLIER_TIERS[index - 1] : { streakLength: 0 };
        const tierRange = tier.streakLength - prevTier.streakLength;
        const streakInRange = Math.max(0, streakLength - prevTier.streakLength);
        progress = (streakInRange / tierRange) * 100;
      } else {
        progress = 100;
      }

      return {
        tier,
        isReached,
        isCurrent,
        isNext: isNext ?? false,
        winsNeeded,
        progress,
      };
    });
  }

  // ==========================================================================
  // MULTIPLIER CALCULATION
  // ==========================================================================

  /**
   * Calculate the base multiplier for a streak
   */
  calculateMultiplier(
    streakLength: number,
    streakType: StreakType = "win",
    options?: {
      category?: string;
      oddsRange?: { min: number; max: number };
      isWeeklyStreak?: boolean;
    }
  ): number {
    const tier = this.getTier(streakLength);
    let multiplier = tier.multiplier;

    // Apply type-specific bonuses
    if (streakType === "category" && options?.category) {
      multiplier *= 1 + this.config.categoryBonus;
    }

    if (streakType === "odds_range" && options?.oddsRange) {
      // Higher bonus for underdog streaks
      if (options.oddsRange.min >= 2.0) {
        multiplier *= 1 + this.config.oddsRangeBonus;
      }
    }

    if (options?.isWeeklyStreak) {
      multiplier *= 1 + this.config.weeklyBonus;
    }

    // Apply diminishing returns for very long streaks
    if (this.config.diminishingReturns && streakLength > 50) {
      const excessWins = streakLength - 50;
      const diminishingFactor = 1 / (1 + excessWins * 0.01);
      const bonusMultiplier = multiplier - 1;
      multiplier = 1 + bonusMultiplier * diminishingFactor;
    }

    // Cap at max multiplier
    return Math.min(multiplier, this.config.maxMultiplier);
  }

  /**
   * Calculate bonus amount for a winning bet
   */
  calculateBonus(
    baseWinnings: number,
    streakLength: number,
    streakType: StreakType = "win",
    options?: {
      category?: string;
      oddsRange?: { min: number; max: number };
      isWeeklyStreak?: boolean;
    }
  ): {
    multiplier: number;
    bonusAmount: number;
    totalWinnings: number;
    breakdown: BonusBreakdown;
  } {
    const multiplier = this.calculateMultiplier(streakLength, streakType, options);
    const bonusAmount = baseWinnings * (multiplier - 1);
    const totalWinnings = baseWinnings + bonusAmount;

    const breakdown = this.getBreakdown(multiplier, streakType, options);

    this.logger?.info("Bonus calculated", {
      baseWinnings,
      multiplier,
      bonusAmount,
      totalWinnings,
    });

    return {
      multiplier,
      bonusAmount,
      totalWinnings,
      breakdown,
    };
  }

  /**
   * Calculate potential bonus for a bet (before outcome)
   */
  calculatePotentialBonus(
    potentialWinnings: number,
    currentStreak: number,
    streakType: StreakType = "win"
  ): {
    currentMultiplier: number;
    nextMultiplier: number;
    currentBonus: number;
    nextBonus: number;
    multiplierIncrease: number;
  } {
    const currentMultiplier = this.calculateMultiplier(currentStreak, streakType);
    const nextMultiplier = this.calculateMultiplier(currentStreak + 1, streakType);

    const currentBonus = potentialWinnings * (currentMultiplier - 1);
    const nextBonus = potentialWinnings * (nextMultiplier - 1);

    return {
      currentMultiplier,
      nextMultiplier,
      currentBonus,
      nextBonus,
      multiplierIncrease: nextMultiplier - currentMultiplier,
    };
  }

  // ==========================================================================
  // COMPOUNDING
  // ==========================================================================

  /**
   * Calculate compounded multiplier across multiple wins
   */
  calculateCompoundedBonus(
    bets: Array<{ winnings: number; streakPosition: number }>,
    streakType: StreakType = "win"
  ): {
    totalBase: number;
    totalBonus: number;
    totalWinnings: number;
    averageMultiplier: number;
    breakdown: CompoundedBreakdown[];
  } {
    if (!this.config.compoundingEnabled) {
      // Simple addition without compounding
      let totalBase = 0;
      let totalBonus = 0;

      for (const bet of bets) {
        const { bonusAmount } = this.calculateBonus(
          bet.winnings,
          bet.streakPosition,
          streakType
        );
        totalBase += bet.winnings;
        totalBonus += bonusAmount;
      }

      return {
        totalBase,
        totalBonus,
        totalWinnings: totalBase + totalBonus,
        averageMultiplier: bets.length > 0 ? (totalBase + totalBonus) / totalBase : 1,
        breakdown: [],
      };
    }

    // With compounding, earlier wins get additional boost
    const breakdown: CompoundedBreakdown[] = [];
    let runningTotal = 0;

    for (const bet of bets) {
      const multiplier = this.calculateMultiplier(bet.streakPosition, streakType);
      const baseBonus = bet.winnings * (multiplier - 1);

      // Compound factor based on position in streak
      const compoundFactor = 1 + (bet.streakPosition - 1) * 0.02; // 2% per prior win
      const compoundedBonus = baseBonus * compoundFactor;

      breakdown.push({
        position: bet.streakPosition,
        baseWinnings: bet.winnings,
        multiplier,
        baseBonus,
        compoundFactor,
        compoundedBonus,
        runningTotal: runningTotal + bet.winnings + compoundedBonus,
      });

      runningTotal += bet.winnings + compoundedBonus;
    }

    const totalBase = bets.reduce((sum, b) => sum + b.winnings, 0);
    const totalBonus = breakdown.reduce((sum, b) => sum + b.compoundedBonus, 0);

    return {
      totalBase,
      totalBonus,
      totalWinnings: totalBase + totalBonus,
      averageMultiplier: totalBase > 0 ? (totalBase + totalBonus) / totalBase : 1,
      breakdown,
    };
  }

  // ==========================================================================
  // STREAK VALUE
  // ==========================================================================

  /**
   * Calculate the "value" of a streak for insurance/protection pricing
   */
  calculateStreakValue(
    streakLength: number,
    averageBetSize: number,
    averageWinRate: number = 0.5
  ): {
    currentValue: number;
    potentialValue: number;
    riskValue: number;
    suggestedProtectionPrice: number;
  } {
    const currentMultiplier = this.calculateMultiplier(streakLength);
    const nextMultiplier = this.calculateMultiplier(streakLength + 1);

    // Expected value of continuing vs. losing streak
    const expectedWinAmount = averageBetSize * currentMultiplier;
    const expectedFutureBonus = averageBetSize * (nextMultiplier - 1);

    // Value at risk = potential future bonuses
    const futureWins = Math.min(10, 20 - streakLength); // Project up to 10 more wins
    let potentialValue = 0;

    for (let i = 1; i <= futureWins; i++) {
      const futureMultiplier = this.calculateMultiplier(streakLength + i);
      potentialValue += averageBetSize * (futureMultiplier - 1) * Math.pow(averageWinRate, i);
    }

    // Risk value = potential loss if streak breaks
    const riskValue = potentialValue * (1 - averageWinRate);

    // Suggested protection price = fraction of risk value
    const suggestedProtectionPrice = riskValue * 0.3; // 30% of risk value

    return {
      currentValue: expectedWinAmount,
      potentialValue,
      riskValue,
      suggestedProtectionPrice: Math.max(1, Math.round(suggestedProtectionPrice * 100) / 100),
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private getBreakdown(
    multiplier: number,
    streakType: StreakType,
    options?: {
      category?: string;
      oddsRange?: { min: number; max: number };
      isWeeklyStreak?: boolean;
    }
  ): BonusBreakdown {
    const tier = MULTIPLIER_TIERS.find((t) => t.multiplier <= multiplier);
    let baseMultiplier = tier?.multiplier ?? 1;
    let categoryBonus = 0;
    let oddsBonus = 0;
    let weeklyBonus = 0;

    if (streakType === "category" && options?.category) {
      categoryBonus = this.config.categoryBonus;
    }

    if (streakType === "odds_range" && options?.oddsRange?.min && options.oddsRange.min >= 2.0) {
      oddsBonus = this.config.oddsRangeBonus;
    }

    if (options?.isWeeklyStreak) {
      weeklyBonus = this.config.weeklyBonus;
    }

    return {
      tierName: tier?.name ?? "Base",
      tierColor: tier?.color ?? "#6B7280",
      baseMultiplier,
      categoryBonus,
      oddsBonus,
      weeklyBonus,
      finalMultiplier: multiplier,
    };
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface BonusBreakdown {
  tierName: string;
  tierColor: string;
  baseMultiplier: number;
  categoryBonus: number;
  oddsBonus: number;
  weeklyBonus: number;
  finalMultiplier: number;
}

export interface CompoundedBreakdown {
  position: number;
  baseWinnings: number;
  multiplier: number;
  baseBonus: number;
  compoundFactor: number;
  compoundedBonus: number;
  runningTotal: number;
}

// ============================================================================
// FACTORY
// ============================================================================

let calculatorInstance: MultiplierCalculator | null = null;

export function getMultiplierCalculator(): MultiplierCalculator {
  if (!calculatorInstance) {
    calculatorInstance = new MultiplierCalculator();
  }
  return calculatorInstance;
}

export function createMultiplierCalculator(
  config?: Partial<MultiplierConfig>
): MultiplierCalculator {
  return new MultiplierCalculator(config);
}
