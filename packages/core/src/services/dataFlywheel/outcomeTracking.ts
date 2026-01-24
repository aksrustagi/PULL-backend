/**
 * Outcome Data Tracking Service
 *
 * Tracks and analyzes:
 * - Which signals actually predicted moves
 * - Which traders have real alpha
 * - Which content drove engagement
 * - Which onboarding flows converted
 */

import type {
  SignalOutcome,
  TraderAlpha,
  ContentOutcome,
  FunnelAnalytics,
  AlphaCategory,
} from "./types";
import { StatisticalUtils } from "./crossAssetCorrelations";

// ============================================================================
// Signal Performance Tracker
// ============================================================================

export class SignalPerformanceTracker {
  /**
   * Record a new signal for tracking
   */
  createSignalRecord(
    signalId: string,
    signalType: string,
    signalSource: string,
    assetClass: string,
    symbol: string,
    direction: "long" | "short",
    confidence: number,
    priceAtSignal: number
  ): Omit<SignalOutcome, "outcomes" | "overallCorrect" | "usersActedOn" | "averageUserPnL"> {
    return {
      signalId,
      signalType,
      assetClass,
      symbol,
      direction,
      priceAtSignal,
    };
  }

  /**
   * Update signal outcome with price data
   */
  updateSignalOutcome(
    signal: SignalOutcome,
    timeframe: "1h" | "4h" | "24h" | "7d" | "30d",
    currentPrice: number
  ): SignalOutcome {
    const returnPercent =
      ((currentPrice - signal.priceAtSignal) / signal.priceAtSignal) * 100;

    // Determine if direction was correct
    const priceWentUp = returnPercent > 0;
    const correct =
      (signal.direction === "long" && priceWentUp) ||
      (signal.direction === "short" && !priceWentUp);

    const outcome = {
      price: currentPrice,
      returnPercent,
      correct,
    };

    return {
      ...signal,
      outcomes: {
        ...signal.outcomes,
        [timeframe]: outcome,
      },
    };
  }

  /**
   * Calculate overall signal correctness
   */
  evaluateSignalOverall(signal: SignalOutcome): SignalOutcome {
    const timeframes = ["1h", "4h", "24h", "7d", "30d"] as const;
    let correctCount = 0;
    let totalCount = 0;
    let maxReturn = -Infinity;
    let maxDrawdown = 0;

    for (const tf of timeframes) {
      const outcome = signal.outcomes[tf];
      if (outcome) {
        totalCount++;
        if (outcome.correct) correctCount++;
        if (outcome.returnPercent > maxReturn) maxReturn = outcome.returnPercent;

        // Track drawdown (worst return for longs, best return for shorts)
        if (signal.direction === "long" && outcome.returnPercent < 0) {
          maxDrawdown = Math.max(maxDrawdown, Math.abs(outcome.returnPercent));
        } else if (signal.direction === "short" && outcome.returnPercent > 0) {
          maxDrawdown = Math.max(maxDrawdown, outcome.returnPercent);
        }
      }
    }

    return {
      ...signal,
      overallCorrect: totalCount > 0 ? correctCount / totalCount > 0.5 : undefined,
      maxReturn: maxReturn === -Infinity ? undefined : maxReturn,
      maxDrawdown,
    };
  }

  /**
   * Aggregate signal performance by type/source
   */
  aggregateSignalPerformance(
    signals: SignalOutcome[]
  ): Array<{
    signalType: string;
    totalSignals: number;
    correctRate: number;
    avgReturn: number;
    avgUsersActedOn: number;
  }> {
    const byType = new Map<
      string,
      {
        count: number;
        correctCount: number;
        totalReturn: number;
        totalUsers: number;
      }
    >();

    for (const signal of signals) {
      const stats = byType.get(signal.signalType) || {
        count: 0,
        correctCount: 0,
        totalReturn: 0,
        totalUsers: 0,
      };

      stats.count++;
      if (signal.overallCorrect) stats.correctCount++;
      if (signal.maxReturn !== undefined) stats.totalReturn += signal.maxReturn;
      stats.totalUsers += signal.usersActedOn;

      byType.set(signal.signalType, stats);
    }

    return Array.from(byType.entries())
      .map(([signalType, stats]) => ({
        signalType,
        totalSignals: stats.count,
        correctRate: stats.count > 0 ? stats.correctCount / stats.count : 0,
        avgReturn: stats.count > 0 ? stats.totalReturn / stats.count : 0,
        avgUsersActedOn: stats.count > 0 ? stats.totalUsers / stats.count : 0,
      }))
      .sort((a, b) => b.correctRate - a.correctRate);
  }

  /**
   * Rank signal sources by historical accuracy
   */
  rankSignalSources(
    signals: SignalOutcome[]
  ): Array<{
    signalSource: string;
    accuracy: number;
    totalSignals: number;
    avgUserAdoption: number;
    profitability: number;
  }> {
    // Group signals by their source (derived from signalType for now)
    const bySource = new Map<
      string,
      { correct: number; total: number; users: number; returns: number }
    >();

    for (const signal of signals) {
      const source = signal.signalType; // Would extract actual source
      const stats = bySource.get(source) || {
        correct: 0,
        total: 0,
        users: 0,
        returns: 0,
      };

      stats.total++;
      if (signal.overallCorrect) stats.correct++;
      stats.users += signal.usersActedOn;
      if (signal.maxReturn !== undefined) stats.returns += signal.maxReturn;

      bySource.set(source, stats);
    }

    return Array.from(bySource.entries())
      .map(([source, stats]) => ({
        signalSource: source,
        accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
        totalSignals: stats.total,
        avgUserAdoption: stats.total > 0 ? stats.users / stats.total : 0,
        profitability: stats.total > 0 ? stats.returns / stats.total : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }
}

// ============================================================================
// Trader Alpha Analyzer
// ============================================================================

export class TraderAlphaAnalyzer {
  /**
   * Analyze if a trader has statistically significant alpha
   */
  analyzeTraderAlpha(
    userId: string,
    trades: Array<{
      pnl: number;
      timestamp: number;
      benchmarkReturn?: number;
    }>,
    portfolioValues: Array<{ timestamp: number; value: number }>,
    benchmarkReturns?: number[]
  ): TraderAlpha {
    if (trades.length < 30) {
      return this.createInsufficientDataResult(userId);
    }

    const pnls = trades.map((t) => t.pnl);
    const returns = this.calculateMonthlyReturns(portfolioValues);

    // Calculate basic statistics
    const meanReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
    const stdDev = StatisticalUtils.standardDeviation(returns);

    // Calculate Sharpe Ratio (assuming 0% risk-free rate)
    const sharpeRatio = stdDev > 0 ? (meanReturn * 12) / (stdDev * Math.sqrt(12)) : 0;

    // Calculate alpha vs benchmark
    const alphaScore = this.calculateAlphaScore(returns, benchmarkReturns);

    // Perform statistical significance test
    const { hasAlpha, skillLuckRatio } = this.testStatisticalSignificance(
      returns,
      benchmarkReturns
    );

    // Calculate consistency
    const consistencyScore = this.calculateConsistency(returns);

    // Categorize alpha
    const alphaCategory = this.categorizeAlpha(alphaScore, hasAlpha, trades.length);

    return {
      userId,
      alphaScore,
      hasStatisticalAlpha: hasAlpha,
      alphaCategory,
      sharpeRatio,
      consistencyScore,
      skillLuckRatio,
    };
  }

  /**
   * Calculate monthly returns from portfolio values
   */
  private calculateMonthlyReturns(
    portfolioValues: Array<{ timestamp: number; value: number }>
  ): number[] {
    if (portfolioValues.length < 2) return [];

    const sorted = [...portfolioValues].sort((a, b) => a.timestamp - b.timestamp);
    const returns: number[] = [];

    // Group by month
    const byMonth = new Map<string, number[]>();
    for (const { timestamp, value } of sorted) {
      const date = new Date(timestamp);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, []);
      }
      byMonth.get(monthKey)!.push(value);
    }

    // Calculate monthly returns
    const months = [...byMonth.keys()].sort();
    for (let i = 1; i < months.length; i++) {
      const prevMonth = byMonth.get(months[i - 1])!;
      const currMonth = byMonth.get(months[i])!;

      const prevValue = prevMonth[prevMonth.length - 1];
      const currValue = currMonth[currMonth.length - 1];

      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    return returns;
  }

  /**
   * Calculate alpha score
   */
  private calculateAlphaScore(
    returns: number[],
    benchmarkReturns?: number[]
  ): number {
    if (returns.length === 0) return 0;

    const traderMean = returns.reduce((a, b) => a + b, 0) / returns.length;

    if (benchmarkReturns && benchmarkReturns.length > 0) {
      const benchMean =
        benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
      return (traderMean - benchMean) * 1200; // Annualized, scaled to -100 to 100
    }

    // Without benchmark, use absolute returns
    return traderMean * 1200;
  }

  /**
   * Test for statistical significance of alpha
   */
  private testStatisticalSignificance(
    returns: number[],
    benchmarkReturns?: number[]
  ): { hasAlpha: boolean; skillLuckRatio: number } {
    if (returns.length < 12) {
      return { hasAlpha: false, skillLuckRatio: 0 };
    }

    // Calculate excess returns
    const excessReturns = benchmarkReturns
      ? returns.map((r, i) => r - (benchmarkReturns[i] || 0))
      : returns;

    const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const stdDev = StatisticalUtils.standardDeviation(excessReturns);

    // T-test for mean > 0
    const tStat =
      stdDev > 0 ? (mean / stdDev) * Math.sqrt(excessReturns.length) : 0;

    // Approximately: t > 2 is significant at 95% level
    const hasAlpha = tStat > 2;

    // Skill/luck ratio based on information ratio
    const skillLuckRatio = Math.min(Math.max(tStat / 4, 0), 1);

    return { hasAlpha, skillLuckRatio };
  }

  /**
   * Calculate consistency score
   */
  private calculateConsistency(returns: number[]): number {
    if (returns.length === 0) return 0;

    const profitableMonths = returns.filter((r) => r > 0).length;
    const consistencyRate = profitableMonths / returns.length;

    // Bonus for low variance
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const cv = Math.abs(StatisticalUtils.standardDeviation(returns) / mean);
    const varianceBonus = Math.max(0, 1 - cv);

    return (consistencyRate * 70 + varianceBonus * 30);
  }

  /**
   * Categorize alpha level
   */
  private categorizeAlpha(
    alphaScore: number,
    hasStatisticalAlpha: boolean,
    sampleSize: number
  ): AlphaCategory {
    if (sampleSize < 30) return "insufficient_data";

    if (!hasStatisticalAlpha) {
      return alphaScore < 0 ? "negative_alpha" : "no_alpha";
    }

    if (alphaScore > 50) return "significant_alpha";
    if (alphaScore > 10) return "marginal_alpha";
    return "no_alpha";
  }

  /**
   * Create result for insufficient data
   */
  private createInsufficientDataResult(userId: string): TraderAlpha {
    return {
      userId,
      alphaScore: 0,
      hasStatisticalAlpha: false,
      alphaCategory: "insufficient_data",
      consistencyScore: 0,
      skillLuckRatio: 0,
    };
  }

  /**
   * Rank traders by alpha
   */
  rankTradersByAlpha(
    traders: TraderAlpha[]
  ): Array<TraderAlpha & { rank: number }> {
    const validTraders = traders.filter(
      (t) => t.alphaCategory !== "insufficient_data"
    );

    return validTraders
      .sort((a, b) => b.alphaScore - a.alphaScore)
      .map((trader, index) => ({
        ...trader,
        rank: index + 1,
      }));
  }
}

// ============================================================================
// Content Engagement Analyzer
// ============================================================================

export class ContentEngagementAnalyzer {
  /**
   * Analyze content engagement outcomes
   */
  analyzeContentEngagement(
    contentId: string,
    contentType: string,
    authorId: string,
    engagementData: {
      views: number;
      uniqueViewers: number;
      reactions: number;
      replies: number;
      shares: number;
    },
    tradingOutcomes?: {
      viewersWhoTraded: number;
      totalTradingVolume: number;
      totalPnL: number;
    }
  ): ContentOutcome {
    const totalEngagement =
      engagementData.reactions + engagementData.replies + engagementData.shares;
    const engagementRate =
      engagementData.uniqueViewers > 0
        ? totalEngagement / engagementData.uniqueViewers
        : 0;

    const viewerTradingConversion = tradingOutcomes
      ? engagementData.uniqueViewers > 0
        ? tradingOutcomes.viewersWhoTraded / engagementData.uniqueViewers
        : 0
      : 0;

    const avgViewerPnL = tradingOutcomes?.viewersWhoTraded
      ? tradingOutcomes.totalPnL / tradingOutcomes.viewersWhoTraded
      : undefined;

    return {
      contentId,
      contentType,
      authorId,
      totalViews: engagementData.views,
      engagementRate,
      viewersWhoTraded: tradingOutcomes?.viewersWhoTraded || 0,
      tradingVolumeGenerated: tradingOutcomes?.totalTradingVolume || 0,
      averageViewerPnL: avgViewerPnL,
    };
  }

  /**
   * Identify content that drives trading activity
   */
  identifyTradingDrivers(
    contentOutcomes: ContentOutcome[]
  ): Array<{
    contentId: string;
    contentType: string;
    tradingImpactScore: number;
    characteristics: string[];
  }> {
    const tradingDrivers = contentOutcomes
      .filter((c) => c.viewersWhoTraded > 0)
      .map((content) => {
        // Calculate trading impact score
        const conversionScore = (content.viewersWhoTraded / content.totalViews) * 40;
        const volumeScore = Math.min(content.tradingVolumeGenerated / 10000, 1) * 30;
        const profitabilityScore =
          content.averageViewerPnL !== undefined && content.averageViewerPnL > 0
            ? 30
            : 0;

        const tradingImpactScore = conversionScore + volumeScore + profitabilityScore;

        // Identify characteristics
        const characteristics: string[] = [];
        if (content.engagementRate > 0.1) characteristics.push("high_engagement");
        if (content.viewersWhoTraded > 10) characteristics.push("many_traders");
        if (content.averageViewerPnL !== undefined && content.averageViewerPnL > 0)
          characteristics.push("profitable_signal");

        return {
          contentId: content.contentId,
          contentType: content.contentType,
          tradingImpactScore,
          characteristics,
        };
      })
      .sort((a, b) => b.tradingImpactScore - a.tradingImpactScore);

    return tradingDrivers;
  }

  /**
   * Analyze content creator effectiveness
   */
  analyzeCreatorEffectiveness(
    contentOutcomes: ContentOutcome[]
  ): Array<{
    authorId: string;
    totalContent: number;
    avgEngagementRate: number;
    totalTradingVolume: number;
    avgViewerPnL: number | null;
    effectivenessScore: number;
  }> {
    const byAuthor = new Map<
      string,
      {
        count: number;
        totalEngagement: number;
        totalViews: number;
        totalVolume: number;
        pnlSum: number;
        pnlCount: number;
      }
    >();

    for (const content of contentOutcomes) {
      const stats = byAuthor.get(content.authorId) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
        totalVolume: 0,
        pnlSum: 0,
        pnlCount: 0,
      };

      stats.count++;
      stats.totalEngagement += content.engagementRate * content.totalViews;
      stats.totalViews += content.totalViews;
      stats.totalVolume += content.tradingVolumeGenerated;

      if (content.averageViewerPnL !== undefined) {
        stats.pnlSum += content.averageViewerPnL;
        stats.pnlCount++;
      }

      byAuthor.set(content.authorId, stats);
    }

    return Array.from(byAuthor.entries())
      .map(([authorId, stats]) => {
        const avgEngagement =
          stats.totalViews > 0 ? stats.totalEngagement / stats.totalViews : 0;
        const avgPnL = stats.pnlCount > 0 ? stats.pnlSum / stats.pnlCount : null;

        // Effectiveness score based on engagement + trading impact
        const engagementScore = avgEngagement * 40;
        const volumeScore = Math.min(stats.totalVolume / 100000, 1) * 30;
        const pnlScore = avgPnL !== null && avgPnL > 0 ? 30 : 0;

        return {
          authorId,
          totalContent: stats.count,
          avgEngagementRate: avgEngagement,
          totalTradingVolume: stats.totalVolume,
          avgViewerPnL: avgPnL,
          effectivenessScore: engagementScore + volumeScore + pnlScore,
        };
      })
      .sort((a, b) => b.effectivenessScore - a.effectivenessScore);
  }
}

// ============================================================================
// Onboarding Funnel Analyzer
// ============================================================================

export class OnboardingFunnelAnalyzer {
  /**
   * Analyze onboarding funnel performance
   */
  analyzeFunnel(
    funnelId: string,
    funnelName: string,
    steps: Array<{
      stepName: string;
      usersEntered: number;
      usersCompleted: number;
      avgTimeSeconds: number;
    }>,
    completedUserOutcomes?: Array<{
      userId: string;
      firstTradeTime?: number;
      thirtyDayRetained: boolean;
      ltv?: number;
    }>
  ): FunnelAnalytics {
    const totalStarted = steps[0]?.usersEntered || 0;
    const totalCompleted = steps[steps.length - 1]?.usersCompleted || 0;

    // Calculate step metrics
    const stepMetrics = steps.map((step, index) => {
      const prevCompleted = index > 0 ? steps[index - 1].usersCompleted : step.usersEntered;
      const dropoffRate = prevCompleted > 0 ? 1 - step.usersCompleted / prevCompleted : 0;

      return {
        stepName: step.stepName,
        completed: step.usersCompleted,
        dropoffRate,
        avgTimeSeconds: step.avgTimeSeconds,
      };
    });

    // Find biggest dropoff
    const biggestDropoff = stepMetrics.reduce(
      (max, step) => (step.dropoffRate > max.dropoffRate ? step : max),
      stepMetrics[0]
    );

    // Analyze completed user outcomes
    let completerFirstTradeTime = 0;
    let completer30dRetention = 0;

    if (completedUserOutcomes && completedUserOutcomes.length > 0) {
      const withFirstTrade = completedUserOutcomes.filter((u) => u.firstTradeTime);
      completerFirstTradeTime =
        withFirstTrade.length > 0
          ? withFirstTrade.reduce((sum, u) => sum + (u.firstTradeTime || 0), 0) /
            withFirstTrade.length
          : 0;

      completer30dRetention =
        completedUserOutcomes.filter((u) => u.thirtyDayRetained).length /
        completedUserOutcomes.length;
    }

    return {
      funnelId,
      funnelName,
      totalStarted,
      totalCompleted,
      overallConversionRate: totalStarted > 0 ? totalCompleted / totalStarted : 0,
      biggestDropoffStep: biggestDropoff.stepName,
      completerFirstTradeTime,
      completer30dRetention,
    };
  }

  /**
   * Compare funnel variants (A/B testing)
   */
  compareFunnelVariants(
    controlFunnel: FunnelAnalytics,
    testFunnel: FunnelAnalytics
  ): {
    conversionLift: number;
    retentionLift: number;
    isStatisticallySignificant: boolean;
    winner: "control" | "test" | "tie";
    insights: string[];
  } {
    const conversionLift =
      controlFunnel.overallConversionRate > 0
        ? (testFunnel.overallConversionRate - controlFunnel.overallConversionRate) /
          controlFunnel.overallConversionRate
        : 0;

    const retentionLift =
      controlFunnel.completer30dRetention > 0
        ? (testFunnel.completer30dRetention - controlFunnel.completer30dRetention) /
          controlFunnel.completer30dRetention
        : 0;

    // Simplified statistical significance check
    const totalSamples =
      controlFunnel.totalStarted + testFunnel.totalStarted;
    const isStatisticallySignificant =
      totalSamples > 1000 && Math.abs(conversionLift) > 0.05;

    // Determine winner
    let winner: "control" | "test" | "tie" = "tie";
    if (isStatisticallySignificant) {
      if (conversionLift > 0.05 && retentionLift >= 0) {
        winner = "test";
      } else if (conversionLift < -0.05 && retentionLift <= 0) {
        winner = "control";
      }
    }

    // Generate insights
    const insights: string[] = [];
    if (Math.abs(conversionLift) > 0.1) {
      insights.push(
        `${(conversionLift * 100).toFixed(1)}% conversion ${conversionLift > 0 ? "increase" : "decrease"} in test variant`
      );
    }
    if (
      testFunnel.biggestDropoffStep !== controlFunnel.biggestDropoffStep
    ) {
      insights.push(
        `Different dropoff points: control at "${controlFunnel.biggestDropoffStep}", test at "${testFunnel.biggestDropoffStep}"`
      );
    }
    if (Math.abs(retentionLift) > 0.05) {
      insights.push(
        `${(retentionLift * 100).toFixed(1)}% retention ${retentionLift > 0 ? "improvement" : "decline"} in test variant`
      );
    }

    return {
      conversionLift,
      retentionLift,
      isStatisticallySignificant,
      winner,
      insights,
    };
  }

  /**
   * Generate funnel optimization recommendations
   */
  generateOptimizationRecommendations(
    funnel: FunnelAnalytics
  ): string[] {
    const recommendations: string[] = [];

    // Low conversion rate
    if (funnel.overallConversionRate < 0.3) {
      recommendations.push(
        "Overall conversion rate is below 30%. Consider simplifying the onboarding flow."
      );
    }

    // Slow time to first trade
    if (funnel.completerFirstTradeTime > 7 * 24 * 60 * 60 * 1000) {
      recommendations.push(
        "Users take over a week to make first trade. Add trading prompts and incentives in onboarding."
      );
    }

    // Low retention
    if (funnel.completer30dRetention < 0.4) {
      recommendations.push(
        "30-day retention below 40%. Focus on engagement features and re-activation campaigns."
      );
    }

    // Specific step issues
    recommendations.push(
      `Focus optimization efforts on "${funnel.biggestDropoffStep}" step which has the highest dropoff.`
    );

    return recommendations;
  }
}

// ============================================================================
// Export singleton instances
// ============================================================================

export const signalPerformanceTracker = new SignalPerformanceTracker();
export const traderAlphaAnalyzer = new TraderAlphaAnalyzer();
export const contentEngagementAnalyzer = new ContentEngagementAnalyzer();
export const onboardingFunnelAnalyzer = new OnboardingFunnelAnalyzer();
