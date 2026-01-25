/**
 * Parlay Odds Calculator
 * Real-time odds calculation and conversion
 */

import type {
  ParlayLeg,
  Parlay,
  ParlayBonus,
  OddsFormat,
  ParlayOddsResponse,
} from "./types";

// ============================================================================
// ODDS CONVERTER
// ============================================================================

export class OddsConverter {
  /**
   * Convert American odds to decimal
   */
  americanToDecimal(american: number): number {
    if (american > 0) {
      return american / 100 + 1;
    } else {
      return 100 / Math.abs(american) + 1;
    }
  }

  /**
   * Convert decimal odds to American
   */
  decimalToAmerican(decimal: number): number {
    if (decimal >= 2) {
      return Math.round((decimal - 1) * 100);
    } else {
      return Math.round(-100 / (decimal - 1));
    }
  }

  /**
   * Convert American odds to fractional
   */
  americanToFractional(american: number): string {
    const decimal = this.americanToDecimal(american);
    return this.decimalToFractional(decimal);
  }

  /**
   * Convert decimal odds to fractional
   */
  decimalToFractional(decimal: number): string {
    const profit = decimal - 1;

    // Common fractions
    const fractions: Array<[number, string]> = [
      [0.1, "1/10"],
      [0.2, "1/5"],
      [0.25, "1/4"],
      [0.33, "1/3"],
      [0.4, "2/5"],
      [0.5, "1/2"],
      [0.6, "3/5"],
      [0.67, "2/3"],
      [0.8, "4/5"],
      [0.9, "9/10"],
      [1.0, "1/1"],
      [1.2, "6/5"],
      [1.25, "5/4"],
      [1.33, "4/3"],
      [1.5, "3/2"],
      [1.67, "5/3"],
      [1.8, "9/5"],
      [2.0, "2/1"],
      [2.5, "5/2"],
      [3.0, "3/1"],
      [4.0, "4/1"],
      [5.0, "5/1"],
      [6.0, "6/1"],
      [7.0, "7/1"],
      [8.0, "8/1"],
      [9.0, "9/1"],
      [10.0, "10/1"],
    ];

    // Find closest fraction
    let closest = fractions[0];
    let minDiff = Math.abs(profit - fractions[0][0]);

    for (const [value, str] of fractions) {
      const diff = Math.abs(profit - value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = [value, str];
      }
    }

    return closest[1];
  }

  /**
   * Calculate implied probability from American odds
   */
  impliedProbability(american: number): number {
    if (american > 0) {
      return 100 / (american + 100);
    } else {
      return Math.abs(american) / (Math.abs(american) + 100);
    }
  }

  /**
   * Calculate American odds from implied probability
   */
  probabilityToAmerican(probability: number): number {
    if (probability >= 0.5) {
      return Math.round(-100 * probability / (1 - probability));
    } else {
      return Math.round(100 * (1 - probability) / probability);
    }
  }

  /**
   * Format odds based on format preference
   */
  formatOdds(american: number, format: OddsFormat): string {
    switch (format) {
      case "american":
        return american > 0 ? `+${american}` : String(american);
      case "decimal":
        return this.americanToDecimal(american).toFixed(2);
      case "fractional":
        return this.americanToFractional(american);
      default:
        return american > 0 ? `+${american}` : String(american);
    }
  }
}

// ============================================================================
// PARLAY ODDS CALCULATOR
// ============================================================================

export class ParlayOddsCalculator {
  private converter = new OddsConverter();

  // Parlay bonus tiers
  private bonusTiers: Array<{ minLegs: number; bonus: number }> = [
    { minLegs: 3, bonus: 0 },
    { minLegs: 4, bonus: 10 },
    { minLegs: 5, bonus: 20 },
    { minLegs: 6, bonus: 30 },
    { minLegs: 7, bonus: 40 },
    { minLegs: 8, bonus: 50 },
    { minLegs: 9, bonus: 60 },
    { minLegs: 10, bonus: 70 },
  ];

  /**
   * Calculate combined odds for parlay legs
   */
  calculateCombinedOdds(legs: ParlayLeg[]): {
    americanOdds: number;
    decimalOdds: number;
    impliedProbability: number;
  } {
    if (legs.length === 0) {
      return { americanOdds: 0, decimalOdds: 1, impliedProbability: 1 };
    }

    // Calculate combined decimal odds
    let combinedDecimal = 1;
    let combinedProbability = 1;

    for (const leg of legs) {
      combinedDecimal *= leg.decimalOdds;
      combinedProbability *= leg.impliedProbability;
    }

    // Convert back to American
    const americanOdds = this.converter.decimalToAmerican(combinedDecimal);

    return {
      americanOdds,
      decimalOdds: combinedDecimal,
      impliedProbability: combinedProbability,
    };
  }

  /**
   * Calculate potential payout
   */
  calculatePayout(stake: number, decimalOdds: number): number {
    return stake * decimalOdds;
  }

  /**
   * Calculate parlay bonus
   */
  calculateParlayBonus(
    legCount: number,
    stake: number,
    basePayout: number
  ): ParlayBonus | undefined {
    // Find applicable tier
    let applicableTier = this.bonusTiers[0];
    for (const tier of this.bonusTiers) {
      if (legCount >= tier.minLegs) {
        applicableTier = tier;
      }
    }

    if (applicableTier.bonus === 0) {
      return undefined;
    }

    const bonusPercentage = applicableTier.bonus;
    const profit = basePayout - stake;
    const bonusAmount = profit * (bonusPercentage / 100);

    return {
      type: "percentage",
      value: bonusPercentage,
      minLegs: applicableTier.minLegs,
      description: `${bonusPercentage}% parlay bonus for ${legCount}+ legs`,
      bonusAmount,
      bonusPercentage,
    };
  }

  /**
   * Calculate full parlay odds response
   */
  calculateParlayOdds(
    legs: ParlayLeg[],
    stake: number,
    previousOdds?: number
  ): ParlayOddsResponse {
    const { americanOdds, decimalOdds, impliedProbability } =
      this.calculateCombinedOdds(legs);

    const basePayout = this.calculatePayout(stake, decimalOdds);
    const bonus = this.calculateParlayBonus(legs.length, stake, basePayout);
    const totalPayout = basePayout + (bonus?.bonusAmount ?? 0);

    // Check for odds changes
    const hasOddsChanged = previousOdds !== undefined && previousOdds !== americanOdds;
    const changedLegs = legs
      .filter((leg) => leg.odds !== leg.originalOdds)
      .map((leg) => leg.id);

    return {
      combinedOdds: americanOdds,
      decimalOdds,
      fractionalOdds: this.converter.americanToFractional(americanOdds),
      impliedProbability,
      potentialPayout: totalPayout,
      parlayBonus: bonus,
      hasOddsChanged: hasOddsChanged || changedLegs.length > 0,
      changedLegs,
    };
  }

  /**
   * Calculate cashout value
   */
  calculateCashoutValue(
    parlay: Parlay,
    currentOddsMultiplier: number = 1
  ): number | null {
    if (parlay.status === "won" || parlay.status === "lost") {
      return null;
    }

    // Get remaining legs (pending or live)
    const remainingLegs = parlay.legs.filter(
      (leg) => leg.status === "pending" || leg.status === "live"
    );
    const wonLegs = parlay.legs.filter((leg) => leg.status === "won");
    const pushedLegs = parlay.legs.filter((leg) => leg.status === "push");

    // If no remaining legs, full cashout
    if (remainingLegs.length === 0) {
      // Calculate payout based on won legs only
      let decimalOdds = 1;
      for (const leg of wonLegs) {
        decimalOdds *= leg.decimalOdds;
      }
      return parlay.stake * decimalOdds;
    }

    // Calculate current value based on:
    // 1. Already won legs (locked in value)
    // 2. Remaining legs (risk adjusted)

    let wonDecimalOdds = 1;
    for (const leg of wonLegs) {
      wonDecimalOdds *= leg.decimalOdds;
    }

    let remainingDecimalOdds = 1;
    let remainingProbability = 1;
    for (const leg of remainingLegs) {
      remainingDecimalOdds *= leg.decimalOdds;
      remainingProbability *= leg.impliedProbability;
    }

    // Expected value calculation
    const currentValue = parlay.stake * wonDecimalOdds;
    const remainingExpectedValue = currentValue * remainingProbability * remainingDecimalOdds;

    // Apply house edge (typically 5-10%)
    const houseEdge = 0.92;

    // Calculate cashout value
    // Mix of current locked value and expected remaining value
    const cashoutValue = (currentValue * 0.3 + remainingExpectedValue * 0.7) * houseEdge * currentOddsMultiplier;

    // Ensure cashout is at least some portion of original stake
    const minCashout = parlay.stake * 0.1;
    const maxCashout = parlay.potentialPayout * 0.95;

    return Math.min(maxCashout, Math.max(minCashout, cashoutValue));
  }

  /**
   * Calculate expected value of a parlay
   */
  calculateExpectedValue(
    stake: number,
    potentialPayout: number,
    trueProbability: number
  ): number {
    // EV = (Probability of Win × Potential Profit) - (Probability of Loss × Stake)
    const profit = potentialPayout - stake;
    const ev = trueProbability * profit - (1 - trueProbability) * stake;
    return ev;
  }

  /**
   * Check if legs are correlated (same game)
   */
  areLegsCorrelated(leg1: ParlayLeg, leg2: ParlayLeg): boolean {
    return leg1.eventId === leg2.eventId;
  }

  /**
   * Calculate correlation adjustment
   */
  calculateCorrelationAdjustment(legs: ParlayLeg[]): number {
    // Group legs by event
    const eventGroups = new Map<string, ParlayLeg[]>();
    for (const leg of legs) {
      const existing = eventGroups.get(leg.eventId) ?? [];
      existing.push(leg);
      eventGroups.set(leg.eventId, existing);
    }

    // Calculate adjustment based on correlated legs
    let adjustment = 1.0;
    for (const [_, eventLegs] of eventGroups) {
      if (eventLegs.length > 1) {
        // Correlated legs typically reduce odds by 5-15%
        adjustment *= 0.95 ** (eventLegs.length - 1);
      }
    }

    return adjustment;
  }

  /**
   * Adjust odds for juice/vig
   */
  deJuiceOdds(odds: number): number {
    // Estimate true probability by removing ~5% vig
    const impliedProb = this.converter.impliedProbability(odds);
    const trueProb = impliedProb / 1.05; // Remove estimated vig
    return this.converter.probabilityToAmerican(trueProb);
  }

  /**
   * Get odds converter instance
   */
  getConverter(): OddsConverter {
    return this.converter;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createOddsCalculator(): ParlayOddsCalculator {
  return new ParlayOddsCalculator();
}

export function createOddsConverter(): OddsConverter {
  return new OddsConverter();
}
