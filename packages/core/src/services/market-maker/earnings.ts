/**
 * Market Maker Earnings Calculator
 *
 * Calculates spread earnings, projections, and provides
 * analytics for market maker performance.
 */

import {
  type MarketMakerPosition,
  type MarketMakerFill,
  type MarketMakerStats,
  type LiquidityPool,
  type PoolContribution,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface EarningsProjection {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  assumptions: ProjectionAssumptions;
}

export interface ProjectionAssumptions {
  averageSpread: number;
  expectedVolume: number;
  fillRate: number;
  feeRate: number;
  volatilityFactor: number;
}

export interface EarningsBreakdown {
  spreadIncome: number;
  volumeRebates: number;
  poolDistributions: number;
  referralBonuses: number;
  totalGross: number;
  tradingFees: number;
  platformFees: number;
  totalNet: number;
}

export interface PerformanceMetrics {
  roi: number;
  roiAnnualized: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  expectancy: number;
}

export interface EarningsHistory {
  date: string;
  earnings: number;
  volume: number;
  trades: number;
  cumulativeEarnings: number;
}

// ============================================================================
// EARNINGS CALCULATOR
// ============================================================================

export class EarningsCalculator {
  private readonly FEE_RATE = 0.001;          // 0.1% trading fee
  private readonly PLATFORM_FEE = 0.05;       // 5% platform fee on earnings
  private readonly VOLUME_REBATE_TIERS = [
    { threshold: 100000, rebate: 0.0001 },    // 0.01% for $100k+
    { threshold: 500000, rebate: 0.0002 },    // 0.02% for $500k+
    { threshold: 1000000, rebate: 0.0003 },   // 0.03% for $1M+
    { threshold: 5000000, rebate: 0.0005 },   // 0.05% for $5M+
  ];

  // ============================================================================
  // SPREAD EARNINGS
  // ============================================================================

  /**
   * Calculate spread earned from a fill
   */
  calculateSpreadEarned(
    fillPrice: number,
    midPrice: number,
    quantity: number,
    side: "bid" | "ask"
  ): number {
    const priceDiff = side === "bid"
      ? midPrice - fillPrice
      : fillPrice - midPrice;

    return Math.max(0, priceDiff * quantity);
  }

  /**
   * Calculate expected spread per trade
   */
  calculateExpectedSpread(
    bidSpread: number,
    askSpread: number,
    quantity: number,
    price: number
  ): number {
    const avgSpread = (bidSpread + askSpread) / 2;
    return avgSpread * quantity * price;
  }

  /**
   * Calculate trading fees for a fill
   */
  calculateTradingFees(quantity: number, price: number): number {
    return quantity * price * this.FEE_RATE;
  }

  /**
   * Calculate net earnings after all fees
   */
  calculateNetEarnings(
    grossEarnings: number,
    tradingFees: number,
    applyPlatformFee: boolean = true
  ): number {
    const afterTradingFees = grossEarnings - tradingFees;
    if (applyPlatformFee && afterTradingFees > 0) {
      return afterTradingFees * (1 - this.PLATFORM_FEE);
    }
    return afterTradingFees;
  }

  // ============================================================================
  // VOLUME REBATES
  // ============================================================================

  /**
   * Calculate volume rebate for a given volume
   */
  calculateVolumeRebate(volume: number): number {
    let rebateRate = 0;
    for (const tier of this.VOLUME_REBATE_TIERS) {
      if (volume >= tier.threshold) {
        rebateRate = tier.rebate;
      }
    }
    return volume * rebateRate;
  }

  /**
   * Get current rebate tier
   */
  getRebateTier(volume: number): { tier: string; rebateRate: number; nextTier?: { threshold: number; rebateRate: number } } {
    let currentTier = { tier: "Base", rebateRate: 0 };
    let nextTier: { threshold: number; rebateRate: number } | undefined;

    for (let i = 0; i < this.VOLUME_REBATE_TIERS.length; i++) {
      if (volume >= this.VOLUME_REBATE_TIERS[i].threshold) {
        currentTier = {
          tier: this.getTierName(this.VOLUME_REBATE_TIERS[i].threshold),
          rebateRate: this.VOLUME_REBATE_TIERS[i].rebate,
        };
        nextTier = this.VOLUME_REBATE_TIERS[i + 1]
          ? {
              threshold: this.VOLUME_REBATE_TIERS[i + 1].threshold,
              rebateRate: this.VOLUME_REBATE_TIERS[i + 1].rebate
            }
          : undefined;
      }
    }

    return { ...currentTier, nextTier };
  }

  private getTierName(threshold: number): string {
    switch (threshold) {
      case 100000: return "Silver";
      case 500000: return "Gold";
      case 1000000: return "Platinum";
      case 5000000: return "Diamond";
      default: return "Base";
    }
  }

  // ============================================================================
  // PROJECTIONS
  // ============================================================================

  /**
   * Project earnings based on current performance
   */
  projectEarnings(
    stats: MarketMakerStats,
    capital: number
  ): EarningsProjection {
    const assumptions: ProjectionAssumptions = {
      averageSpread: stats.averageSpread || 0.02,
      expectedVolume: stats.totalVolume / Math.max(this.getPeriodDays(stats.period), 1),
      fillRate: stats.totalTrades > 0 ? 0.85 : 0.5,
      feeRate: this.FEE_RATE,
      volatilityFactor: 1.0,
    };

    // Calculate daily expected earnings
    const dailyVolume = assumptions.expectedVolume;
    const dailyGross = dailyVolume * assumptions.averageSpread * assumptions.fillRate;
    const dailyFees = dailyVolume * assumptions.feeRate;
    const dailyNet = this.calculateNetEarnings(dailyGross, dailyFees);

    return {
      daily: dailyNet,
      weekly: dailyNet * 7,
      monthly: dailyNet * 30,
      yearly: dailyNet * 365,
      assumptions,
    };
  }

  /**
   * Calculate potential APY for a position
   */
  calculatePotentialAPY(
    capital: number,
    averageSpread: number,
    expectedDailyVolume: number,
    fillRate: number = 0.85
  ): number {
    const dailyGross = expectedDailyVolume * averageSpread * fillRate;
    const dailyFees = expectedDailyVolume * this.FEE_RATE;
    const dailyNet = this.calculateNetEarnings(dailyGross, dailyFees);
    const yearlyNet = dailyNet * 365;

    return yearlyNet / capital;
  }

  private getPeriodDays(period: string): number {
    switch (period) {
      case "daily": return 1;
      case "weekly": return 7;
      case "monthly": return 30;
      case "all_time": return 365;
      default: return 1;
    }
  }

  // ============================================================================
  // EARNINGS BREAKDOWN
  // ============================================================================

  /**
   * Get detailed earnings breakdown
   */
  getEarningsBreakdown(
    fills: MarketMakerFill[],
    poolContributions: PoolContribution[],
    referralEarnings: number = 0
  ): EarningsBreakdown {
    const spreadIncome = fills.reduce((sum, f) => sum + f.spreadEarned, 0);
    const tradingFees = fills.reduce((sum, f) => sum + f.fees, 0);
    const totalVolume = fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
    const volumeRebates = this.calculateVolumeRebate(totalVolume);

    const poolDistributions = poolContributions.reduce(
      (sum, c) => sum + c.totalEarnings,
      0
    );

    const totalGross = spreadIncome + volumeRebates + poolDistributions + referralEarnings;
    const platformFees = Math.max(0, (totalGross - tradingFees) * this.PLATFORM_FEE);
    const totalNet = totalGross - tradingFees - platformFees;

    return {
      spreadIncome,
      volumeRebates,
      poolDistributions,
      referralBonuses: referralEarnings,
      totalGross,
      tradingFees,
      platformFees,
      totalNet,
    };
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  /**
   * Calculate comprehensive performance metrics
   */
  calculatePerformanceMetrics(
    positions: MarketMakerPosition[],
    fills: MarketMakerFill[],
    daysActive: number
  ): PerformanceMetrics {
    const totalCapital = positions.reduce((sum, p) => sum + p.initialCapital, 0);
    const currentCapital = positions.reduce((sum, p) => sum + p.currentCapital, 0);
    const totalEarnings = positions.reduce((sum, p) => sum + p.totalEarnings, 0);

    // ROI calculations
    const roi = totalCapital > 0 ? (currentCapital - totalCapital) / totalCapital : 0;
    const roiAnnualized = daysActive > 0
      ? Math.pow(1 + roi, 365 / daysActive) - 1
      : 0;

    // Win/Loss analysis
    const winningFills = fills.filter(f => f.netProfit > 0);
    const losingFills = fills.filter(f => f.netProfit <= 0);
    const winRate = fills.length > 0 ? winningFills.length / fills.length : 0;

    const averageWin = winningFills.length > 0
      ? winningFills.reduce((sum, f) => sum + f.netProfit, 0) / winningFills.length
      : 0;
    const averageLoss = losingFills.length > 0
      ? Math.abs(losingFills.reduce((sum, f) => sum + f.netProfit, 0) / losingFills.length)
      : 0;

    // Profit factor
    const grossProfit = winningFills.reduce((sum, f) => sum + f.netProfit, 0);
    const grossLoss = Math.abs(losingFills.reduce((sum, f) => sum + f.netProfit, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy
    const expectancy = (winRate * averageWin) - ((1 - winRate) * averageLoss);

    // Max drawdown
    const maxDrawdown = positions.reduce((max, p) => {
      const dd = (p.initialCapital - p.currentCapital) / p.initialCapital;
      return Math.max(max, dd);
    }, 0);

    // Risk-adjusted metrics (simplified)
    const returns = fills.map(f => f.netProfit / totalCapital);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = this.calculateStdDev(returns);
    const sharpeRatio = stdDev > 0 ? (avgReturn * 365 - 0.04) / (stdDev * Math.sqrt(365)) : 0;

    const downsideReturns = returns.filter(r => r < 0);
    const downsideStdDev = this.calculateStdDev(downsideReturns);
    const sortinoRatio = downsideStdDev > 0
      ? (avgReturn * 365 - 0.04) / (downsideStdDev * Math.sqrt(365))
      : sharpeRatio;

    const calmarRatio = maxDrawdown > 0 ? roiAnnualized / maxDrawdown : 0;

    return {
      roi,
      roiAnnualized,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      expectancy,
    };
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  // ============================================================================
  // EARNINGS HISTORY
  // ============================================================================

  /**
   * Generate earnings history for charting
   */
  generateEarningsHistory(
    fills: MarketMakerFill[],
    days: number = 30
  ): EarningsHistory[] {
    const history: EarningsHistory[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    let cumulativeEarnings = 0;

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs;
      const dayEnd = now - i * dayMs;

      const dayFills = fills.filter(
        f => f.executedAt >= dayStart && f.executedAt < dayEnd
      );

      const dayEarnings = dayFills.reduce((sum, f) => sum + f.netProfit, 0);
      const dayVolume = dayFills.reduce((sum, f) => sum + f.quantity * f.price, 0);
      cumulativeEarnings += dayEarnings;

      history.push({
        date: new Date(dayStart).toISOString().split("T")[0],
        earnings: dayEarnings,
        volume: dayVolume,
        trades: dayFills.length,
        cumulativeEarnings,
      });
    }

    return history;
  }

  // ============================================================================
  // POOL EARNINGS
  // ============================================================================

  /**
   * Calculate earnings distribution for a pool
   */
  calculatePoolDistribution(
    pool: LiquidityPool,
    contributions: PoolContribution[],
    periodEarnings: number
  ): Map<string, number> {
    const distributions = new Map<string, number>();

    // Deduct fees
    const managementFee = pool.totalCapital * (pool.managementFee / 365); // Daily management fee
    const performanceFee = periodEarnings > 0 ? periodEarnings * pool.performanceFee : 0;
    const netEarnings = periodEarnings - managementFee - performanceFee;

    if (netEarnings <= 0) {
      // No distribution if earnings are negative
      for (const contrib of contributions) {
        distributions.set(contrib.userId, 0);
      }
      return distributions;
    }

    // Distribute proportionally
    for (const contrib of contributions) {
      if (contrib.status === "active") {
        const share = contrib.sharePercent / 100;
        const earnings = netEarnings * share;
        distributions.set(contrib.userId, earnings);
      }
    }

    return distributions;
  }

  /**
   * Calculate pool APY
   */
  calculatePoolAPY(pool: LiquidityPool): number {
    const dailyReturn = pool.totalEarnings / pool.totalCapital /
      Math.max(1, (Date.now() - pool.createdAt) / (24 * 60 * 60 * 1000));
    return dailyReturn * 365;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let earningsCalculator: EarningsCalculator | null = null;

export function getEarningsCalculator(): EarningsCalculator {
  if (!earningsCalculator) {
    earningsCalculator = new EarningsCalculator();
  }
  return earningsCalculator;
}

export function createEarningsCalculator(): EarningsCalculator {
  return new EarningsCalculator();
}
