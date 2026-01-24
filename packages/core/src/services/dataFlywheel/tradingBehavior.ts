/**
 * Trading Behavior Data Collection Service
 *
 * Collects and analyzes:
 * - Order flow patterns
 * - Time-of-day preferences
 * - Risk tolerance (position sizing)
 * - Win/loss patterns by market type
 * - Reaction to news events
 */

import type {
  TradingSessionData,
  OrderFlowPattern,
  RiskMetrics,
  TradingPatternType,
  RiskCategory,
  AggregationWindow,
} from "./types";

// ============================================================================
// Trading Session Tracking
// ============================================================================

export class TradingSessionTracker {
  private activeSessions: Map<string, TradingSessionData> = new Map();

  /**
   * Start a new trading session for a user
   */
  startSession(userId: string, deviceType?: string, timezone?: string): string {
    const sessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const session: TradingSessionData = {
      userId,
      sessionId,
      startedAt: Date.now(),
      ordersPlaced: 0,
      ordersFilled: 0,
      ordersCancelled: 0,
      totalVolume: 0,
      totalPnL: 0,
      deviceType,
      timezone,
    };

    this.activeSessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * Record an order event within a session
   */
  recordOrderEvent(
    sessionId: string,
    event: {
      type: "placed" | "filled" | "cancelled";
      volume?: number;
      pnl?: number;
    }
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    switch (event.type) {
      case "placed":
        session.ordersPlaced++;
        break;
      case "filled":
        session.ordersFilled++;
        if (event.volume) session.totalVolume += event.volume;
        if (event.pnl) session.totalPnL += event.pnl;
        break;
      case "cancelled":
        session.ordersCancelled++;
        break;
    }
  }

  /**
   * End a trading session and return final data
   */
  endSession(sessionId: string): TradingSessionData | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    session.endedAt = Date.now();
    this.activeSessions.delete(sessionId);

    return session;
  }

  /**
   * Get active session for a user
   */
  getActiveSession(userId: string): TradingSessionData | null {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }
}

// ============================================================================
// Order Flow Pattern Analysis
// ============================================================================

export class OrderFlowAnalyzer {
  /**
   * Analyze a user's order history to identify trading patterns
   */
  analyzeOrderFlowPattern(
    userId: string,
    orders: Array<{
      createdAt: number;
      type: string;
      side: string;
      quantity: number;
      filledQuantity: number;
      price?: number;
      status: string;
      executedAt?: number;
    }>,
    trades: Array<{
      executedAt: number;
      side: string;
      quantity: number;
      price: number;
      pnl?: number;
    }>
  ): OrderFlowPattern {
    const filledOrders = orders.filter((o) => o.status === "filled");

    // Analyze time preferences
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);

    for (const order of filledOrders) {
      const date = new Date(order.createdAt);
      hourCounts[date.getUTCHours()]++;
      dayCounts[date.getUTCDay()]++;
    }

    // Find preferred hours (above average)
    const avgHourCount = hourCounts.reduce((a, b) => a + b, 0) / 24;
    const preferredHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count > avgHourCount)
      .map((h) => h.hour);

    // Find preferred days
    const avgDayCount = dayCounts.reduce((a, b) => a + b, 0) / 7;
    const preferredDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter((d) => d.count > avgDayCount)
      .map((d) => d.day);

    // Analyze order characteristics
    const orderSizes = filledOrders.map((o) => o.filledQuantity);
    const avgOrderSize = orderSizes.length > 0
      ? orderSizes.reduce((a, b) => a + b, 0) / orderSizes.length
      : 0;
    const limitOrders = filledOrders.filter((o) => o.type === "limit").length;
    const limitOrderRatio = filledOrders.length > 0 ? limitOrders / filledOrders.length : 0;

    // Analyze holding periods
    const holdingPeriods = this.calculateHoldingPeriods(trades);
    const avgHoldingPeriod = holdingPeriods.length > 0
      ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length
      : 0;

    // Determine pattern type
    const patternType = this.classifyTradingPattern({
      avgHoldingPeriod,
      tradingFrequency: filledOrders.length / 30, // per day over 30 days
      limitOrderRatio,
    });

    return {
      userId,
      patternType,
      preferredTradingHours: preferredHours,
      preferredTradingDays: preferredDays,
      averageSessionDuration: 0, // Would need session data
      tradingFrequency: filledOrders.length / 30,
      averageOrderSize: avgOrderSize,
      limitOrderRatio,
      averageHoldingPeriod: avgHoldingPeriod,
      confidence: Math.min(filledOrders.length / 100, 1), // More orders = higher confidence
    };
  }

  /**
   * Calculate holding periods from trades
   */
  private calculateHoldingPeriods(
    trades: Array<{
      executedAt: number;
      side: string;
      quantity: number;
    }>
  ): number[] {
    // Group trades by position entry/exit
    const periods: number[] = [];
    const positions: Map<string, number> = new Map(); // symbol -> entry time

    // Simplified: track buy->sell sequences
    let lastBuyTime: number | null = null;

    for (const trade of trades.sort((a, b) => a.executedAt - b.executedAt)) {
      if (trade.side === "buy") {
        lastBuyTime = trade.executedAt;
      } else if (trade.side === "sell" && lastBuyTime !== null) {
        periods.push((trade.executedAt - lastBuyTime) / 1000); // seconds
        lastBuyTime = null;
      }
    }

    return periods;
  }

  /**
   * Classify trading pattern based on behavior metrics
   */
  private classifyTradingPattern(metrics: {
    avgHoldingPeriod: number;
    tradingFrequency: number;
    limitOrderRatio: number;
  }): TradingPatternType {
    const { avgHoldingPeriod, tradingFrequency, limitOrderRatio } = metrics;

    // Scalper: Very short holds, high frequency
    if (avgHoldingPeriod < 300 && tradingFrequency > 20) {
      return "scalper";
    }

    // Market maker: High limit order ratio, high frequency
    if (limitOrderRatio > 0.9 && tradingFrequency > 10) {
      return "market_maker";
    }

    // Position trader: Long holds, low frequency
    if (avgHoldingPeriod > 86400 && tradingFrequency < 1) {
      return "position_trader";
    }

    // Swing trader: Medium holds
    if (avgHoldingPeriod > 3600 && avgHoldingPeriod < 604800) {
      return "swing_trader";
    }

    // Momentum chaser: Market orders, follows trends
    if (limitOrderRatio < 0.2 && tradingFrequency > 5) {
      return "momentum_chaser";
    }

    return "unknown";
  }
}

// ============================================================================
// Risk Tolerance Analysis
// ============================================================================

export class RiskToleranceAnalyzer {
  /**
   * Analyze a user's risk tolerance based on their trading history
   */
  analyzeRiskTolerance(
    userId: string,
    positions: Array<{
      costBasis: number;
      unrealizedPnL: number;
      realizedPnL: number;
    }>,
    portfolioValue: number,
    trades: Array<{
      pnl: number;
      notionalValue: number;
    }>
  ): RiskMetrics {
    // Calculate position sizes as percentage of portfolio
    const positionSizePercents = positions.map(
      (p) => (p.costBasis / portfolioValue) * 100
    );

    const avgPositionSize = positionSizePercents.length > 0
      ? positionSizePercents.reduce((a, b) => a + b, 0) / positionSizePercents.length
      : 0;
    const maxPositionSize = positionSizePercents.length > 0
      ? Math.max(...positionSizePercents)
      : 0;

    // Calculate win/loss metrics
    const winningTrades = trades.filter((t) => t.pnl > 0);
    const losingTrades = trades.filter((t) => t.pnl < 0);

    const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((a, b) => a + b.pnl, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((a, b) => a + b.pnl, 0) / losingTrades.length)
      : 0;

    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;

    // Calculate drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades);

    // Calculate risk score (1-100)
    const riskScore = this.calculateRiskScore({
      avgPositionSize,
      maxPositionSize,
      maxDrawdown,
      winLossRatio,
    });

    // Categorize risk level
    const riskCategory = this.categorizeRisk(riskScore);

    return {
      userId,
      riskScore,
      riskCategory,
      averagePositionSizePercent: avgPositionSize,
      maxPositionSizePercent: maxPositionSize,
      maxHistoricalDrawdown: maxDrawdown,
      winLossRatio,
      profitFactor,
    };
  }

  /**
   * Calculate maximum drawdown from trade history
   */
  private calculateMaxDrawdown(
    trades: Array<{ pnl: number }>
  ): number {
    if (trades.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    for (const trade of trades) {
      runningPnL += trade.pnl;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak > 0 ? (peak - runningPnL) / peak : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown * 100; // As percentage
  }

  /**
   * Calculate composite risk score
   */
  private calculateRiskScore(metrics: {
    avgPositionSize: number;
    maxPositionSize: number;
    maxDrawdown: number;
    winLossRatio: number;
  }): number {
    const { avgPositionSize, maxPositionSize, maxDrawdown } = metrics;

    // Higher position sizes and drawdowns = higher risk
    let score = 0;

    // Position size contribution (0-40)
    score += Math.min(avgPositionSize * 2, 40);

    // Max position concentration (0-30)
    score += Math.min(maxPositionSize, 30);

    // Max drawdown contribution (0-30)
    score += Math.min(maxDrawdown * 0.6, 30);

    return Math.min(Math.max(score, 1), 100);
  }

  /**
   * Categorize risk level based on score
   */
  private categorizeRisk(score: number): RiskCategory {
    if (score < 25) return "conservative";
    if (score < 50) return "moderate";
    if (score < 75) return "aggressive";
    return "very_aggressive";
  }
}

// ============================================================================
// Market Performance Analysis
// ============================================================================

export class MarketPerformanceAnalyzer {
  /**
   * Analyze user performance by market type
   */
  analyzePerformanceByMarket(
    userId: string,
    trades: Array<{
      assetClass: string;
      symbol: string;
      category?: string;
      pnl: number;
      volume: number;
      executedAt: number;
      holdingPeriod?: number;
    }>
  ): Array<{
    assetClass: string;
    category?: string;
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    averagePnL: number;
    edgeScore: number;
  }> {
    // Group trades by asset class and category
    const groupedTrades = new Map<string, typeof trades>();

    for (const trade of trades) {
      const key = `${trade.assetClass}:${trade.category || "all"}`;
      if (!groupedTrades.has(key)) {
        groupedTrades.set(key, []);
      }
      groupedTrades.get(key)!.push(trade);
    }

    // Analyze each group
    const results: Array<{
      assetClass: string;
      category?: string;
      totalTrades: number;
      winRate: number;
      totalPnL: number;
      averagePnL: number;
      edgeScore: number;
    }> = [];

    for (const [key, groupTrades] of groupedTrades) {
      const [assetClass, category] = key.split(":");

      const winningTrades = groupTrades.filter((t) => t.pnl > 0);
      const totalPnL = groupTrades.reduce((sum, t) => sum + t.pnl, 0);
      const winRate = groupTrades.length > 0 ? winningTrades.length / groupTrades.length : 0;

      // Calculate edge score (0-100)
      // Based on: win rate, consistency, sample size
      const edgeScore = this.calculateEdgeScore(groupTrades);

      results.push({
        assetClass,
        category: category !== "all" ? category : undefined,
        totalTrades: groupTrades.length,
        winRate,
        totalPnL,
        averagePnL: groupTrades.length > 0 ? totalPnL / groupTrades.length : 0,
        edgeScore,
      });
    }

    return results;
  }

  /**
   * Calculate statistical edge score
   */
  private calculateEdgeScore(trades: Array<{ pnl: number }>): number {
    if (trades.length < 10) return 0; // Insufficient data

    const pnls = trades.map((t) => t.pnl);
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);

    // T-statistic for mean > 0
    const tStat = stdDev > 0 ? (mean / stdDev) * Math.sqrt(trades.length) : 0;

    // Convert to edge score (0-100)
    // t-stat of 2 ~ 95% confidence
    const edgeScore = Math.min(Math.max((tStat / 4) * 100, 0), 100);

    return edgeScore;
  }
}

// ============================================================================
// News Reaction Pattern Analysis
// ============================================================================

export class NewsReactionAnalyzer {
  /**
   * Analyze how a user reacts to news events
   */
  analyzeNewsReactions(
    userId: string,
    newsEvents: Array<{
      eventId: string;
      timestamp: number;
      newsType: string;
      source: string;
      assets: string[];
      sentiment: number;
    }>,
    userTrades: Array<{
      executedAt: number;
      symbol: string;
      side: string;
      pnl: number;
    }>
  ): {
    averageReactionTimeSeconds: number;
    reactionSpeedCategory: "very_fast" | "fast" | "moderate" | "slow" | "no_reaction";
    newsTradeWinRate: number;
    nonNewsTradeWinRate: number;
    reactionsByNewsType: Record<string, { trades: number; winRate: number; avgPnL: number }>;
  } {
    const reactionTimes: number[] = [];
    const newsRelatedTrades: Array<{ pnl: number; newsType: string }> = [];
    const nonNewsTrades: Array<{ pnl: number }> = [];

    // For each news event, find trades within 30 minutes
    for (const news of newsEvents) {
      const windowStart = news.timestamp;
      const windowEnd = news.timestamp + 30 * 60 * 1000; // 30 min window

      const relatedTrades = userTrades.filter(
        (t) =>
          t.executedAt >= windowStart &&
          t.executedAt <= windowEnd &&
          news.assets.includes(t.symbol)
      );

      if (relatedTrades.length > 0) {
        const firstTrade = relatedTrades.sort((a, b) => a.executedAt - b.executedAt)[0];
        reactionTimes.push((firstTrade.executedAt - news.timestamp) / 1000);

        for (const trade of relatedTrades) {
          newsRelatedTrades.push({ pnl: trade.pnl, newsType: news.newsType });
        }
      }
    }

    // Identify non-news trades
    const newsTradeTimestamps = new Set(
      newsRelatedTrades.map(() => 0) // Would need actual timestamps
    );
    for (const trade of userTrades) {
      // Simplified: if not matched to news, it's non-news
      if (!newsTradeTimestamps.has(trade.executedAt)) {
        nonNewsTrades.push({ pnl: trade.pnl });
      }
    }

    // Calculate metrics
    const avgReactionTime = reactionTimes.length > 0
      ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
      : 0;

    const newsWinRate = newsRelatedTrades.length > 0
      ? newsRelatedTrades.filter((t) => t.pnl > 0).length / newsRelatedTrades.length
      : 0;

    const nonNewsWinRate = nonNewsTrades.length > 0
      ? nonNewsTrades.filter((t) => t.pnl > 0).length / nonNewsTrades.length
      : 0;

    // Group by news type
    const byType: Record<string, { trades: number; winRate: number; avgPnL: number }> = {};
    for (const trade of newsRelatedTrades) {
      if (!byType[trade.newsType]) {
        byType[trade.newsType] = { trades: 0, winRate: 0, avgPnL: 0 };
      }
      byType[trade.newsType].trades++;
    }

    // Categorize reaction speed
    let speedCategory: "very_fast" | "fast" | "moderate" | "slow" | "no_reaction";
    if (reactionTimes.length === 0) {
      speedCategory = "no_reaction";
    } else if (avgReactionTime < 30) {
      speedCategory = "very_fast";
    } else if (avgReactionTime < 120) {
      speedCategory = "fast";
    } else if (avgReactionTime < 600) {
      speedCategory = "moderate";
    } else {
      speedCategory = "slow";
    }

    return {
      averageReactionTimeSeconds: avgReactionTime,
      reactionSpeedCategory: speedCategory,
      newsTradeWinRate: newsWinRate,
      nonNewsTradeWinRate: nonNewsWinRate,
      reactionsByNewsType: byType,
    };
  }
}

// ============================================================================
// Export singleton instances
// ============================================================================

export const tradingSessionTracker = new TradingSessionTracker();
export const orderFlowAnalyzer = new OrderFlowAnalyzer();
export const riskToleranceAnalyzer = new RiskToleranceAnalyzer();
export const marketPerformanceAnalyzer = new MarketPerformanceAnalyzer();
export const newsReactionAnalyzer = new NewsReactionAnalyzer();
