/**
 * Bet Insurance Pricing Engine
 * Calculate premiums and evaluate coverage eligibility
 */

import {
  InsuranceProduct,
  InsuranceType,
  PremiumRates,
  PremiumBreakdown,
  EligibilityRequirements,
  OddsTierRate,
  CalculatePremiumResult,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface PricingEngineConfig {
  defaultMarginOfSafety: number;
  maxPremiumPercent: number;
  minPremiumAmount: number;
  riskAdjustmentFactor: number;
}

const DEFAULT_CONFIG: PricingEngineConfig = {
  defaultMarginOfSafety: 1.1,
  maxPremiumPercent: 0.25,
  minPremiumAmount: 0.5,
  riskAdjustmentFactor: 1.0,
};

// ============================================================================
// Pricing Engine
// ============================================================================

export class InsurancePricingEngine {
  private config: PricingEngineConfig;

  constructor(config?: Partial<PricingEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Premium Calculation
  // ==========================================================================

  /**
   * Calculate premium for insurance
   */
  calculatePremium(params: {
    product: InsuranceProduct;
    betAmount: number;
    betOdds: number;
    sport: string;
    eventType: "pre_match" | "live";
    vipTier: string;
    creditsAvailable: number;
    useCredits: boolean;
  }): CalculatePremiumResult {
    const {
      product,
      betAmount,
      betOdds,
      sport,
      eventType,
      vipTier,
      creditsAvailable,
      useCredits,
    } = params;

    // Check eligibility first
    const eligibilityCheck = this.checkEligibility(product.eligibility, {
      betAmount,
      betOdds,
      sport,
    });

    if (!eligibilityCheck.eligible) {
      return {
        premium: 0,
        breakdown: this.getEmptyBreakdown(),
        coverageAmount: 0,
        eligible: false,
        ineligibilityReason: eligibilityCheck.reason,
        expiresAt: new Date(),
      };
    }

    // Calculate base premium
    const basePremium = betAmount * product.premiumRates.baseRate;

    // Apply odds adjustment
    const oddsAdjustment = this.calculateOddsAdjustment(
      basePremium,
      betOdds,
      product.premiumRates.oddsTiers
    );

    // Apply sport modifier
    const sportModifier = this.calculateSportModifier(
      basePremium + oddsAdjustment,
      sport,
      product.premiumRates.sportModifiers
    );

    // Apply event type modifier
    const eventTypeModifier = this.calculateEventTypeModifier(
      basePremium + oddsAdjustment + sportModifier,
      eventType,
      product.premiumRates.eventTypeModifiers
    );

    // Calculate subtotal before discounts
    const subtotal = basePremium + oddsAdjustment + sportModifier + eventTypeModifier;

    // Apply VIP discount
    const vipDiscountRate = product.premiumRates.vipDiscounts[vipTier] || 0;
    const vipDiscount = subtotal * vipDiscountRate;

    // Calculate credits to apply
    let creditsApplied = 0;
    if (useCredits && creditsAvailable > 0) {
      creditsApplied = Math.min(creditsAvailable, subtotal - vipDiscount);
    }

    // Calculate final premium
    let finalPremium = subtotal - vipDiscount - creditsApplied;

    // Apply min/max bounds
    finalPremium = Math.max(finalPremium, product.premiumRates.minPremium);
    finalPremium = Math.min(finalPremium, product.premiumRates.maxPremium);

    // Also cap at max percent of bet
    const maxByPercent = betAmount * this.config.maxPremiumPercent;
    finalPremium = Math.min(finalPremium, maxByPercent);

    // Calculate coverage amount
    const coverageAmount = this.calculateCoverageAmount(
      betAmount,
      product.coverageDetails.maxCoveragePercent,
      product.coverageDetails.maxCoverageAmount
    );

    // Calculate expiration (quote valid for 15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    return {
      premium: Math.round(finalPremium * 100) / 100,
      breakdown: {
        basePremium: Math.round(basePremium * 100) / 100,
        oddsAdjustment: Math.round(oddsAdjustment * 100) / 100,
        sportModifier: Math.round(sportModifier * 100) / 100,
        eventTypeModifier: Math.round(eventTypeModifier * 100) / 100,
        vipDiscount: Math.round(vipDiscount * 100) / 100,
        creditsApplied: Math.round(creditsApplied * 100) / 100,
        finalPremium: Math.round(finalPremium * 100) / 100,
      },
      coverageAmount: Math.round(coverageAmount * 100) / 100,
      eligible: true,
      expiresAt,
    };
  }

  /**
   * Calculate odds adjustment
   */
  private calculateOddsAdjustment(
    basePremium: number,
    odds: number,
    oddsTiers: OddsTierRate[]
  ): number {
    if (oddsTiers.length === 0) return 0;

    const tier = oddsTiers.find(t => odds >= t.minOdds && odds < t.maxOdds);
    if (!tier) {
      // Use highest tier multiplier for very high odds
      const highestTier = oddsTiers.reduce((prev, curr) =>
        curr.maxOdds > prev.maxOdds ? curr : prev
      );
      return basePremium * (highestTier.rateMultiplier - 1);
    }

    return basePremium * (tier.rateMultiplier - 1);
  }

  /**
   * Calculate sport-specific modifier
   */
  private calculateSportModifier(
    currentPremium: number,
    sport: string,
    modifiers: Record<string, number>
  ): number {
    const modifier = modifiers[sport.toLowerCase()] || 1.0;
    return currentPremium * (modifier - 1);
  }

  /**
   * Calculate event type modifier
   */
  private calculateEventTypeModifier(
    currentPremium: number,
    eventType: "pre_match" | "live",
    modifiers: Record<string, number>
  ): number {
    const modifier = modifiers[eventType] || 1.0;
    return currentPremium * (modifier - 1);
  }

  /**
   * Calculate coverage amount
   */
  private calculateCoverageAmount(
    betAmount: number,
    maxPercent: number,
    maxAmount: number
  ): number {
    const percentCoverage = betAmount * (maxPercent / 100);
    return Math.min(percentCoverage, maxAmount);
  }

  // ==========================================================================
  // Eligibility Check
  // ==========================================================================

  /**
   * Check if bet is eligible for insurance
   */
  checkEligibility(
    requirements: EligibilityRequirements,
    params: {
      betAmount: number;
      betOdds: number;
      sport: string;
      market?: string;
      betType?: string;
      eventId?: string;
    }
  ): { eligible: boolean; reason?: string } {
    const { betAmount, betOdds, sport, market, betType, eventId } = params;

    // Check bet amount
    if (betAmount < requirements.minBetAmount) {
      return {
        eligible: false,
        reason: `Minimum bet amount is $${requirements.minBetAmount}`,
      };
    }

    if (betAmount > requirements.maxBetAmount) {
      return {
        eligible: false,
        reason: `Maximum bet amount is $${requirements.maxBetAmount}`,
      };
    }

    // Check odds
    if (betOdds < requirements.minOdds) {
      return {
        eligible: false,
        reason: `Minimum odds are ${requirements.minOdds}`,
      };
    }

    if (betOdds > requirements.maxOdds) {
      return {
        eligible: false,
        reason: `Maximum odds are ${requirements.maxOdds}`,
      };
    }

    // Check sport eligibility
    if (requirements.eligibleSports.length > 0) {
      if (!requirements.eligibleSports.includes(sport.toLowerCase())) {
        return {
          eligible: false,
          reason: `Insurance not available for ${sport}`,
        };
      }
    }

    // Check market eligibility
    if (market && requirements.eligibleMarkets.length > 0) {
      if (!requirements.eligibleMarkets.includes(market.toLowerCase())) {
        return {
          eligible: false,
          reason: `Insurance not available for ${market} market`,
        };
      }
    }

    // Check bet type eligibility
    if (betType && requirements.eligibleBetTypes.length > 0) {
      if (!requirements.eligibleBetTypes.includes(betType.toLowerCase())) {
        return {
          eligible: false,
          reason: `Insurance not available for ${betType} bets`,
        };
      }
    }

    // Check excluded events
    if (eventId && requirements.excludedEvents?.includes(eventId)) {
      return {
        eligible: false,
        reason: "Insurance not available for this event",
      };
    }

    // Check blackout periods
    if (requirements.blackoutPeriods) {
      const now = new Date();
      for (const period of requirements.blackoutPeriods) {
        if (now >= period.startTime && now <= period.endTime) {
          return {
            eligible: false,
            reason: `Insurance unavailable: ${period.reason}`,
          };
        }
      }
    }

    return { eligible: true };
  }

  // ==========================================================================
  // Risk Assessment
  // ==========================================================================

  /**
   * Calculate expected loss ratio
   */
  calculateExpectedLossRatio(params: {
    insuranceType: InsuranceType;
    sport: string;
    market: string;
    historicalData?: {
      totalPolicies: number;
      totalClaims: number;
      totalPremiums: number;
      totalPayouts: number;
    };
  }): number {
    const { insuranceType, historicalData } = params;

    // Use historical data if available
    if (historicalData && historicalData.totalPremiums > 0) {
      return historicalData.totalPayouts / historicalData.totalPremiums;
    }

    // Default expected loss ratios by insurance type
    const defaultLossRatios: Record<InsuranceType, number> = {
      close_loss: 0.65,
      push_protection: 0.45,
      half_point: 0.55,
      overtime: 0.30,
      injury: 0.20,
      weather: 0.15,
      full_refund: 0.85,
    };

    return defaultLossRatios[insuranceType] || 0.50;
  }

  /**
   * Calculate risk-adjusted premium
   */
  calculateRiskAdjustedPremium(params: {
    basePremium: number;
    lossRatio: number;
    targetMargin: number;
    volatilityFactor: number;
  }): number {
    const { basePremium, lossRatio, targetMargin, volatilityFactor } = params;

    // Expected payout per unit premium
    const expectedPayout = basePremium * lossRatio;

    // Add margin for profit
    const marginAmount = basePremium * targetMargin;

    // Add volatility buffer
    const volatilityBuffer = basePremium * volatilityFactor * 0.1;

    return expectedPayout + marginAmount + volatilityBuffer;
  }

  // ==========================================================================
  // Batch Pricing
  // ==========================================================================

  /**
   * Calculate premium for multiple products (comparison)
   */
  calculateMultiplePremiums(params: {
    products: InsuranceProduct[];
    betAmount: number;
    betOdds: number;
    sport: string;
    eventType: "pre_match" | "live";
    vipTier: string;
    creditsAvailable: number;
  }): Map<string, CalculatePremiumResult> {
    const results = new Map<string, CalculatePremiumResult>();

    for (const product of params.products) {
      const result = this.calculatePremium({
        product,
        betAmount: params.betAmount,
        betOdds: params.betOdds,
        sport: params.sport,
        eventType: params.eventType,
        vipTier: params.vipTier,
        creditsAvailable: params.creditsAvailable,
        useCredits: false,
      });
      results.set(product.id, result);
    }

    return results;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getEmptyBreakdown(): PremiumBreakdown {
    return {
      basePremium: 0,
      oddsAdjustment: 0,
      sportModifier: 0,
      eventTypeModifier: 0,
      vipDiscount: 0,
      creditsApplied: 0,
      finalPremium: 0,
    };
  }

  /**
   * Convert American odds to decimal
   */
  americanToDecimal(americanOdds: number): number {
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    } else {
      return (100 / Math.abs(americanOdds)) + 1;
    }
  }

  /**
   * Convert decimal odds to implied probability
   */
  decimalToImpliedProbability(decimalOdds: number): number {
    return 1 / decimalOdds;
  }

  /**
   * Calculate breakeven win rate for insurance
   */
  calculateBreakevenWinRate(premium: number, coverage: number): number {
    // At what win rate does insurance become profitable?
    return premium / (premium + coverage);
  }
}

// Export singleton instance
export const insurancePricingEngine = new InsurancePricingEngine();
