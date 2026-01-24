/**
 * Trader Stats Service
 * Calculates and manages trader performance statistics from actual trades
 */

import type {
  TraderStats,
  TraderStatsSnapshot,
  StatsPeriod,
  AssetBreakdown,
  AssetClassStats,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface TraderStatsServiceConfig {
  minTradesForStats: number;
  riskFreeRate: number; // Annual risk-free rate for Sharpe calculation
  tradingDaysPerYear: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface TradeRecord {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  pnl: number;
  pnlPercent: number;
  assetClass: "crypto" | "prediction" | "rwa";
  executedAt: number;
  settledAt?: number;
}

const DEFAULT_CONFIG: TraderStatsServiceConfig = {
  minTradesForStats: 10,
  riskFreeRate: 0.05, // 5% annual
  tradingDaysPerYear: 252,
};

// ============================================================================
// Trader Stats Service
// ============================================================================

export class TraderStatsService {
  private readonly config: TraderStatsServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<TraderStatsServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[TraderStats] ${msg}`, meta),
      info: (msg, meta) => console.info(`[TraderStats] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[TraderStats] ${msg}`, meta),
      error: (msg, meta) => console.error(`[TraderStats] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Stats Calculation
  // ==========================================================================

  /**
   * Calculate stats for a trader for a specific period
   */
  async calculateStats(userId: string, period: StatsPeriod): Promise<TraderStats> {
    const { start, end } = this.getPeriodRange(period);

    // Get trades for the period
    const trades = await this.db.query<TradeRecord[]>("trades:getByUserAndPeriod", {
      userId,
      startTime: start,
      endTime: end,
    });

    if (trades.length < this.config.minTradesForStats) {
      this.logger.debug("Not enough trades for stats", {
        userId,
        period,
        tradeCount: trades.length,
        minRequired: this.config.minTradesForStats,
      });
    }

    // Calculate all metrics
    const stats = this.computeStats(userId, period, start, end, trades);

    // Store the stats
    await this.db.mutation("traderStats:upsert", stats);

    this.logger.info("Stats calculated", {
      userId,
      period,
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      sharpeRatio: stats.sharpeRatio,
    });

    return stats;
  }

  /**
   * Calculate stats for all periods
   */
  async calculateAllPeriodStats(userId: string): Promise<TraderStats[]> {
    const periods: StatsPeriod[] = ["daily", "weekly", "monthly", "quarterly", "yearly", "all_time"];
    const results: TraderStats[] = [];

    for (const period of periods) {
      try {
        const stats = await this.calculateStats(userId, period);
        results.push(stats);
      } catch (error) {
        this.logger.error("Failed to calculate stats for period", {
          userId,
          period,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Get cached stats for a trader
   */
  async getStats(userId: string, period: StatsPeriod): Promise<TraderStats | null> {
    return await this.db.query("traderStats:get", {
      userId,
      period,
    });
  }

  /**
   * Get stats snapshot for display
   */
  async getStatsSnapshot(userId: string, period: StatsPeriod = "all_time"): Promise<TraderStatsSnapshot | null> {
    const stats = await this.getStats(userId, period);

    if (!stats) return null;

    return {
      winRate: stats.winRate,
      totalPnL: stats.totalPnL,
      totalPnLPercent: stats.totalPnLPercent,
      sharpeRatio: stats.sharpeRatio,
      maxDrawdown: stats.maxDrawdown,
      totalTrades: stats.totalTrades,
      avgHoldingPeriod: stats.avgHoldingPeriod,
    };
  }

  /**
   * Compute stats from trade records
   */
  private computeStats(
    userId: string,
    period: StatsPeriod,
    periodStart: number,
    periodEnd: number,
    trades: TradeRecord[]
  ): TraderStats {
    const now = Date.now();

    if (trades.length === 0) {
      return this.createEmptyStats(userId, period, periodStart, periodEnd, now);
    }

    // Basic trade counts
    const winningTrades = trades.filter((t) => t.pnl > 0);
    const losingTrades = trades.filter((t) => t.pnl < 0);

    // P&L calculations
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalCost = trades.reduce((sum, t) => sum + t.quantity * t.price, 0);
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    const avgPnLPerTrade = totalPnL / trades.length;

    // Win/Loss amounts
    const avgWinAmount = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
      : 0;
    const avgLossAmount = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losingTrades.length
      : 0;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map((t) => t.pnl))
      : 0;
    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map((t) => t.pnl))
      : 0;

    // Volume calculations
    const totalVolume = trades.reduce((sum, t) => sum + t.quantity * t.price, 0);
    const avgPositionSize = totalVolume / trades.length;

    // Calculate risk metrics
    const returns = this.calculateDailyReturns(trades);
    const { sharpeRatio, sortinoRatio, volatility } = this.calculateRiskMetrics(returns);
    const { maxDrawdown, maxDrawdownPercent } = this.calculateDrawdown(trades);
    const calmarRatio = maxDrawdownPercent > 0 ? totalPnLPercent / maxDrawdownPercent : 0;

    // Streak calculations
    const streaks = this.calculateStreaks(trades);

    // Holding period (for positions that have been closed)
    const avgHoldingPeriod = this.calculateAvgHoldingPeriod(trades);

    // Asset breakdown
    const assetBreakdown = this.calculateAssetBreakdown(trades);

    return {
      id: `${userId}_${period}`,
      userId,
      period,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
      totalPnL,
      totalPnLPercent,
      avgPnLPerTrade,
      avgWinAmount,
      avgLossAmount,
      largestWin,
      largestLoss,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPercent,
      volatility,
      calmarRatio,
      totalVolume,
      avgPositionSize,
      avgHoldingPeriod,
      currentWinStreak: streaks.currentWinStreak,
      currentLossStreak: streaks.currentLossStreak,
      longestWinStreak: streaks.longestWinStreak,
      longestLossStreak: streaks.longestLossStreak,
      assetBreakdown,
      calculatedAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  private createEmptyStats(
    userId: string,
    period: StatsPeriod,
    periodStart: number,
    periodEnd: number,
    now: number
  ): TraderStats {
    return {
      id: `${userId}_${period}`,
      userId,
      period,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      avgPnLPerTrade: 0,
      avgWinAmount: 0,
      avgLossAmount: 0,
      largestWin: 0,
      largestLoss: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      volatility: 0,
      calmarRatio: 0,
      totalVolume: 0,
      avgPositionSize: 0,
      avgHoldingPeriod: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      assetBreakdown: undefined,
      calculatedAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Calculate daily returns from trades
   */
  private calculateDailyReturns(trades: TradeRecord[]): number[] {
    if (trades.length === 0) return [];

    // Group trades by day
    const dailyPnL = new Map<string, number>();

    for (const trade of trades) {
      const day = new Date(trade.executedAt).toISOString().split("T")[0];
      dailyPnL.set(day, (dailyPnL.get(day) ?? 0) + trade.pnl);
    }

    // Calculate returns (simplified as PnL percentage)
    return Array.from(dailyPnL.values());
  }

  /**
   * Calculate Sharpe ratio, Sortino ratio, and volatility
   */
  private calculateRiskMetrics(returns: number[]): {
    sharpeRatio: number;
    sortinoRatio: number;
    volatility: number;
  } {
    if (returns.length < 2) {
      return { sharpeRatio: 0, sortinoRatio: 0, volatility: 0 };
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Annualize
    const annualizationFactor = Math.sqrt(this.config.tradingDaysPerYear);
    const annualizedReturn = mean * this.config.tradingDaysPerYear;
    const annualizedVolatility = volatility * annualizationFactor;

    // Sharpe Ratio
    const sharpeRatio = annualizedVolatility > 0
      ? (annualizedReturn - this.config.riskFreeRate) / annualizedVolatility
      : 0;

    // Sortino Ratio (only considers downside volatility)
    const negativeReturns = returns.filter((r) => r < 0);
    const downsideVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance) * annualizationFactor;

    const sortinoRatio = downsideDeviation > 0
      ? (annualizedReturn - this.config.riskFreeRate) / downsideDeviation
      : 0;

    return { sharpeRatio, sortinoRatio, volatility: annualizedVolatility };
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateDrawdown(trades: TradeRecord[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
  } {
    if (trades.length === 0) {
      return { maxDrawdown: 0, maxDrawdownPercent: 0 };
    }

    // Sort by execution time
    const sortedTrades = [...trades].sort((a, b) => a.executedAt - b.executedAt);

    // Calculate cumulative P&L
    let peak = 0;
    let cumPnL = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const trade of sortedTrades) {
      cumPnL += trade.pnl;

      if (cumPnL > peak) {
        peak = cumPnL;
      }

      const drawdown = peak - cumPnL;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * Calculate win/loss streaks
   */
  private calculateStreaks(trades: TradeRecord[]): {
    currentWinStreak: number;
    currentLossStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
  } {
    if (trades.length === 0) {
      return {
        currentWinStreak: 0,
        currentLossStreak: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
      };
    }

    // Sort by execution time
    const sortedTrades = [...trades].sort((a, b) => a.executedAt - b.executedAt);

    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    for (const trade of sortedTrades) {
      if (trade.pnl > 0) {
        tempWinStreak++;
        tempLossStreak = 0;
        longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
      } else if (trade.pnl < 0) {
        tempLossStreak++;
        tempWinStreak = 0;
        longestLossStreak = Math.max(longestLossStreak, tempLossStreak);
      }
    }

    // Current streaks
    const lastTrade = sortedTrades[sortedTrades.length - 1];
    if (lastTrade.pnl > 0) {
      currentWinStreak = tempWinStreak;
    } else if (lastTrade.pnl < 0) {
      currentLossStreak = tempLossStreak;
    }

    return {
      currentWinStreak,
      currentLossStreak,
      longestWinStreak,
      longestLossStreak,
    };
  }

  /**
   * Calculate average holding period
   */
  private calculateAvgHoldingPeriod(trades: TradeRecord[]): number {
    // This would need position data to calculate properly
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Calculate breakdown by asset class
   */
  private calculateAssetBreakdown(trades: TradeRecord[]): AssetBreakdown {
    const breakdown: AssetBreakdown = {};

    const assetClasses = ["crypto", "prediction", "rwa"] as const;

    for (const assetClass of assetClasses) {
      const assetTrades = trades.filter((t) => t.assetClass === assetClass);

      if (assetTrades.length === 0) continue;

      const winningTrades = assetTrades.filter((t) => t.pnl > 0);
      const pnl = assetTrades.reduce((sum, t) => sum + t.pnl, 0);
      const volume = assetTrades.reduce((sum, t) => sum + t.quantity * t.price, 0);

      breakdown[assetClass] = {
        tradeCount: assetTrades.length,
        volume,
        pnl,
        pnlPercent: volume > 0 ? (pnl / volume) * 100 : 0,
        winRate: assetTrades.length > 0 ? winningTrades.length / assetTrades.length : 0,
      };
    }

    return breakdown;
  }

  /**
   * Get period date range
   */
  private getPeriodRange(period: StatsPeriod): { start: number; end: number } {
    const now = new Date();
    const end = now.getTime();

    let start: number;

    switch (period) {
      case "daily":
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        start = today.getTime();
        break;

      case "weekly":
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        start = weekStart.getTime();
        break;

      case "monthly":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        start = monthStart.getTime();
        break;

      case "quarterly":
        const quarter = Math.floor(now.getMonth() / 3);
        const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
        start = quarterStart.getTime();
        break;

      case "yearly":
        const yearStart = new Date(now.getFullYear(), 0, 1);
        start = yearStart.getTime();
        break;

      case "all_time":
        start = 0;
        break;

      default:
        start = 0;
    }

    return { start, end };
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Recalculate stats for all traders
   */
  async recalculateAllTraderStats(period: StatsPeriod): Promise<number> {
    const traders = await this.db.query<{ userId: string }[]>("traderProfiles:getAllActive", {});

    let calculated = 0;

    for (const trader of traders) {
      try {
        await this.calculateStats(trader.userId, period);
        calculated++;
      } catch (error) {
        this.logger.error("Failed to calculate stats", {
          userId: trader.userId,
          period,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.logger.info("Batch stats calculation complete", {
      period,
      calculated,
      total: traders.length,
    });

    return calculated;
  }

  /**
   * Update stats incrementally when a new trade occurs
   */
  async onTradeExecuted(
    userId: string,
    trade: TradeRecord
  ): Promise<void> {
    // Mark stats as stale
    await this.db.mutation("traderStats:markStale", {
      userId,
    });

    // Optionally recalculate immediately for important periods
    await this.calculateStats(userId, "daily");
  }
}

export default TraderStatsService;
