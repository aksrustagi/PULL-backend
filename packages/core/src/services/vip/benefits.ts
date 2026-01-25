/**
 * VIP Benefits Calculator
 * Calculate and apply tier-specific benefits
 */

import {
  VIPTier,
  TierBenefits,
  VIPTierConfig,
  VIP_TIER_CONFIGS,
  VIP_TIER_ORDER,
  UserVIPStatus,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface VIPBenefitsConfig {
  gracePeriodDays: number;
  reviewPeriodDays: number;
  cashbackCreditDelayHours: number;
  cashbackExpirationDays: number;
}

const DEFAULT_CONFIG: VIPBenefitsConfig = {
  gracePeriodDays: 30,
  reviewPeriodDays: 30,
  cashbackCreditDelayHours: 24,
  cashbackExpirationDays: 90,
};

// ============================================================================
// Benefits Calculator
// ============================================================================

export class VIPBenefitsCalculator {
  private config: VIPBenefitsConfig;

  constructor(config?: Partial<VIPBenefitsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Tier Comparison
  // ==========================================================================

  /**
   * Get tier index for comparison
   */
  getTierIndex(tier: VIPTier): number {
    return VIP_TIER_ORDER.indexOf(tier);
  }

  /**
   * Compare two tiers
   */
  compareTiers(tier1: VIPTier, tier2: VIPTier): number {
    return this.getTierIndex(tier1) - this.getTierIndex(tier2);
  }

  /**
   * Check if tier1 is higher than tier2
   */
  isHigherTier(tier1: VIPTier, tier2: VIPTier): boolean {
    return this.compareTiers(tier1, tier2) > 0;
  }

  /**
   * Get next tier
   */
  getNextTier(currentTier: VIPTier): VIPTier | null {
    const currentIndex = this.getTierIndex(currentTier);
    if (currentIndex >= VIP_TIER_ORDER.length - 1) {
      return null;
    }
    return VIP_TIER_ORDER[currentIndex + 1];
  }

  /**
   * Get previous tier
   */
  getPreviousTier(currentTier: VIPTier): VIPTier | null {
    const currentIndex = this.getTierIndex(currentTier);
    if (currentIndex <= 0) {
      return null;
    }
    return VIP_TIER_ORDER[currentIndex - 1];
  }

  // ==========================================================================
  // Benefits Access
  // ==========================================================================

  /**
   * Get benefits for a tier
   */
  getTierBenefits(tier: VIPTier): TierBenefits {
    return VIP_TIER_CONFIGS[tier].benefits;
  }

  /**
   * Get full tier config
   */
  getTierConfig(tier: VIPTier): VIPTierConfig {
    return VIP_TIER_CONFIGS[tier];
  }

  /**
   * Get all tier configs
   */
  getAllTierConfigs(): VIPTierConfig[] {
    return VIP_TIER_ORDER.map((tier) => VIP_TIER_CONFIGS[tier]);
  }

  // ==========================================================================
  // Financial Benefits
  // ==========================================================================

  /**
   * Calculate cashback for a trade
   */
  calculateCashback(tier: VIPTier, tradingVolume: number): number {
    const benefits = this.getTierBenefits(tier);
    return (tradingVolume * benefits.cashbackPercent) / 100;
  }

  /**
   * Calculate fee after discount
   */
  calculateDiscountedFee(tier: VIPTier, baseFee: number): number {
    const benefits = this.getTierBenefits(tier);
    return baseFee * (1 - benefits.feeDiscount);
  }

  /**
   * Check if withdrawal fee should be waived
   */
  shouldWaiveWithdrawalFee(
    tier: VIPTier,
    currentMonthWaivers: number
  ): boolean {
    const benefits = this.getTierBenefits(tier);
    if (benefits.withdrawalFeeWaivers === -1) {
      return true; // unlimited
    }
    return currentMonthWaivers < benefits.withdrawalFeeWaivers;
  }

  /**
   * Check if withdrawal amount is within limit
   */
  isWithinWithdrawalLimit(tier: VIPTier, amount: number): boolean {
    const benefits = this.getTierBenefits(tier);
    return amount <= benefits.maxDailyWithdrawal;
  }

  /**
   * Get withdrawal processing priority
   */
  getWithdrawalPriority(tier: VIPTier): "standard" | "fast" | "instant" {
    return this.getTierBenefits(tier).withdrawalPriority;
  }

  // ==========================================================================
  // Trading Benefits
  // ==========================================================================

  /**
   * Check if position size is within limit
   */
  isWithinPositionLimit(tier: VIPTier, positionSize: number): boolean {
    const benefits = this.getTierBenefits(tier);
    return positionSize <= benefits.maxPositionSize;
  }

  /**
   * Get API rate limit
   */
  getApiRateLimit(tier: VIPTier): number {
    return this.getTierBenefits(tier).apiRateLimit;
  }

  /**
   * Check if advanced order types are available
   */
  hasAdvancedOrderTypes(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).advancedOrderTypes;
  }

  // ==========================================================================
  // Support Benefits
  // ==========================================================================

  /**
   * Get support level
   */
  getSupportLevel(
    tier: VIPTier
  ): "community" | "email" | "priority" | "dedicated" | "concierge" {
    return this.getTierBenefits(tier).supportLevel;
  }

  /**
   * Check if has dedicated manager
   */
  hasDedicatedManager(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).dedicatedManager;
  }

  /**
   * Get expected response time
   */
  getExpectedResponseTime(tier: VIPTier): number {
    return this.getTierBenefits(tier).responseTimeHours;
  }

  // ==========================================================================
  // Exclusive Benefits
  // ==========================================================================

  /**
   * Check if has access to exclusive promos
   */
  hasExclusivePromos(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).exclusivePromos;
  }

  /**
   * Check if has early access
   */
  hasEarlyAccess(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).earlyAccess;
  }

  /**
   * Check if can attend VIP events
   */
  canAttendVIPEvents(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).vipEvents;
  }

  /**
   * Check if eligible for NFT drops
   */
  isEligibleForNFTDrops(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).nftDrops;
  }

  /**
   * Check if has beta feature access
   */
  hasBetaFeatureAccess(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).betaFeatures;
  }

  // ==========================================================================
  // Social Benefits
  // ==========================================================================

  /**
   * Check if has verified badge
   */
  hasVerifiedBadge(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).verifiedBadge;
  }

  /**
   * Check if profile is highlighted
   */
  hasProfileHighlight(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).profileHighlight;
  }

  /**
   * Check if has custom emojis
   */
  hasCustomEmojis(tier: VIPTier): boolean {
    return this.getTierBenefits(tier).customEmojis;
  }

  // ==========================================================================
  // Rewards Benefits
  // ==========================================================================

  /**
   * Get points multiplier
   */
  getPointsMultiplier(tier: VIPTier): number {
    return this.getTierBenefits(tier).pointsMultiplier;
  }

  /**
   * Calculate points with multiplier
   */
  calculatePoints(tier: VIPTier, basePoints: number): number {
    return Math.floor(basePoints * this.getPointsMultiplier(tier));
  }

  /**
   * Get bonus insurance credits
   */
  getBonusInsuranceCredits(tier: VIPTier): number {
    return this.getTierBenefits(tier).bonusInsuranceCredits;
  }

  // ==========================================================================
  // Tier Qualification
  // ==========================================================================

  /**
   * Calculate qualifying tier based on volume
   */
  calculateQualifyingTier(volume: number): VIPTier {
    let qualifyingTier: VIPTier = "bronze";

    for (const tier of VIP_TIER_ORDER) {
      const config = VIP_TIER_CONFIGS[tier];
      if (volume >= config.volumeThreshold) {
        qualifyingTier = tier;
      } else {
        break;
      }
    }

    return qualifyingTier;
  }

  /**
   * Get volume needed for next tier
   */
  getVolumeToNextTier(currentVolume: number): {
    nextTier: VIPTier | null;
    volumeNeeded: number | null;
    percentComplete: number;
  } {
    const currentTier = this.calculateQualifyingTier(currentVolume);
    const nextTier = this.getNextTier(currentTier);

    if (!nextTier) {
      return {
        nextTier: null,
        volumeNeeded: null,
        percentComplete: 100,
      };
    }

    const currentThreshold = VIP_TIER_CONFIGS[currentTier].volumeThreshold;
    const nextThreshold = VIP_TIER_CONFIGS[nextTier].volumeThreshold;
    const volumeNeeded = nextThreshold - currentVolume;
    const tierRange = nextThreshold - currentThreshold;
    const progressInTier = currentVolume - currentThreshold;
    const percentComplete = Math.min((progressInTier / tierRange) * 100, 100);

    return {
      nextTier,
      volumeNeeded: Math.max(0, volumeNeeded),
      percentComplete,
    };
  }

  // ==========================================================================
  // Benefits Comparison
  // ==========================================================================

  /**
   * Compare benefits between two tiers
   */
  compareBenefits(
    currentTier: VIPTier,
    targetTier: VIPTier
  ): {
    category: string;
    benefit: string;
    current: string | number | boolean;
    target: string | number | boolean;
    improvement: string;
  }[] {
    const current = this.getTierBenefits(currentTier);
    const target = this.getTierBenefits(targetTier);
    const comparison: {
      category: string;
      benefit: string;
      current: string | number | boolean;
      target: string | number | boolean;
      improvement: string;
    }[] = [];

    // Financial
    comparison.push({
      category: "Financial",
      benefit: "Cashback",
      current: `${current.cashbackPercent}%`,
      target: `${target.cashbackPercent}%`,
      improvement: `+${(target.cashbackPercent - current.cashbackPercent).toFixed(1)}%`,
    });

    comparison.push({
      category: "Financial",
      benefit: "Fee Discount",
      current: `${(current.feeDiscount * 100).toFixed(0)}%`,
      target: `${(target.feeDiscount * 100).toFixed(0)}%`,
      improvement: `+${((target.feeDiscount - current.feeDiscount) * 100).toFixed(0)}%`,
    });

    comparison.push({
      category: "Financial",
      benefit: "Daily Withdrawal Limit",
      current: `$${current.maxDailyWithdrawal.toLocaleString()}`,
      target: `$${target.maxDailyWithdrawal.toLocaleString()}`,
      improvement: `+$${(target.maxDailyWithdrawal - current.maxDailyWithdrawal).toLocaleString()}`,
    });

    // Support
    comparison.push({
      category: "Support",
      benefit: "Support Level",
      current: current.supportLevel,
      target: target.supportLevel,
      improvement: current.supportLevel !== target.supportLevel ? "Upgraded" : "Same",
    });

    comparison.push({
      category: "Support",
      benefit: "Response Time",
      current: `${current.responseTimeHours}h`,
      target: `${target.responseTimeHours}h`,
      improvement: `-${current.responseTimeHours - target.responseTimeHours}h`,
    });

    // Rewards
    comparison.push({
      category: "Rewards",
      benefit: "Points Multiplier",
      current: `${current.pointsMultiplier}x`,
      target: `${target.pointsMultiplier}x`,
      improvement: `+${(target.pointsMultiplier - current.pointsMultiplier).toFixed(2)}x`,
    });

    // Trading
    comparison.push({
      category: "Trading",
      benefit: "Max Position Size",
      current: `$${current.maxPositionSize.toLocaleString()}`,
      target: `$${target.maxPositionSize.toLocaleString()}`,
      improvement: `+$${(target.maxPositionSize - current.maxPositionSize).toLocaleString()}`,
    });

    return comparison;
  }

  /**
   * Get benefits unlock summary for next tier
   */
  getUnlocksAtNextTier(currentTier: VIPTier): string[] {
    const nextTier = this.getNextTier(currentTier);
    if (!nextTier) return [];

    const current = this.getTierBenefits(currentTier);
    const next = this.getTierBenefits(nextTier);
    const unlocks: string[] = [];

    if (next.cashbackPercent > current.cashbackPercent) {
      unlocks.push(`${next.cashbackPercent}% cashback on all trades`);
    }

    if (next.dedicatedManager && !current.dedicatedManager) {
      unlocks.push("Dedicated account manager");
    }

    if (next.vipEvents && !current.vipEvents) {
      unlocks.push("Access to VIP events");
    }

    if (next.nftDrops && !current.nftDrops) {
      unlocks.push("Exclusive NFT drops");
    }

    if (next.verifiedBadge && !current.verifiedBadge) {
      unlocks.push("Verified profile badge");
    }

    if (next.withdrawalPriority !== current.withdrawalPriority) {
      unlocks.push(`${next.withdrawalPriority} withdrawals`);
    }

    return unlocks;
  }
}

// Export singleton instance
export const vipBenefitsCalculator = new VIPBenefitsCalculator();
