/**
 * Social Signal Data Collection Service
 *
 * Collects and analyzes:
 * - Who follows whom
 * - Which traders get copied
 * - Chat room sentiment by market
 * - Viral content patterns
 * - Community conviction signals
 */

import type {
  SocialFollow,
  TraderLeaderboardEntry,
  ChatSentiment,
  ViralContent,
  CommunityConvictionSignal,
  SentimentCategory,
  ConvictionDirection,
} from "./types";

// ============================================================================
// Social Graph Analysis
// ============================================================================

export class SocialGraphAnalyzer {
  /**
   * Analyze the social graph to identify influential traders
   */
  analyzeInfluentialTraders(
    follows: SocialFollow[],
    traderMetrics: Map<string, { pnl: number; winRate: number; volume: number }>
  ): Array<{
    userId: string;
    followerCount: number;
    copierCount: number;
    influenceScore: number;
    pnlRank?: number;
  }> {
    // Count followers and copiers per trader
    const traderStats = new Map<
      string,
      { followers: number; copiers: number; copyAllocation: number }
    >();

    for (const follow of follows) {
      if (!follow.followeeId) continue;

      const stats = traderStats.get(follow.followeeId) || {
        followers: 0,
        copiers: 0,
        copyAllocation: 0,
      };

      stats.followers++;
      if (follow.copyTradingEnabled) {
        stats.copiers++;
        stats.copyAllocation += follow.copyAllocation || 0;
      }

      traderStats.set(follow.followeeId, stats);
    }

    // Calculate influence scores
    const results: Array<{
      userId: string;
      followerCount: number;
      copierCount: number;
      influenceScore: number;
      pnlRank?: number;
    }> = [];

    for (const [userId, stats] of traderStats) {
      const metrics = traderMetrics.get(userId);

      // Influence score based on:
      // - Follower count (30%)
      // - Copier count (40%)
      // - Total copy allocation (30%)
      const maxFollowers = Math.max(...Array.from(traderStats.values()).map((s) => s.followers));
      const maxCopiers = Math.max(...Array.from(traderStats.values()).map((s) => s.copiers));
      const maxAllocation = Math.max(...Array.from(traderStats.values()).map((s) => s.copyAllocation));

      const normalizedFollowers = maxFollowers > 0 ? stats.followers / maxFollowers : 0;
      const normalizedCopiers = maxCopiers > 0 ? stats.copiers / maxCopiers : 0;
      const normalizedAllocation = maxAllocation > 0 ? stats.copyAllocation / maxAllocation : 0;

      const influenceScore =
        normalizedFollowers * 30 + normalizedCopiers * 40 + normalizedAllocation * 30;

      results.push({
        userId,
        followerCount: stats.followers,
        copierCount: stats.copiers,
        influenceScore,
      });
    }

    return results.sort((a, b) => b.influenceScore - a.influenceScore);
  }

  /**
   * Find traders with similar following patterns (collaborative filtering)
   */
  findSimilarTraders(
    targetUserId: string,
    follows: SocialFollow[]
  ): Array<{ userId: string; similarity: number }> {
    // Get who the target follows
    const targetFollows = new Set(
      follows.filter((f) => f.followerId === targetUserId).map((f) => f.followeeId)
    );

    // Find users with similar follow patterns
    const otherUsers = new Map<string, Set<string>>();
    for (const follow of follows) {
      if (follow.followerId === targetUserId) continue;

      if (!otherUsers.has(follow.followerId)) {
        otherUsers.set(follow.followerId, new Set());
      }
      otherUsers.get(follow.followerId)!.add(follow.followeeId);
    }

    // Calculate Jaccard similarity
    const similarities: Array<{ userId: string; similarity: number }> = [];

    for (const [userId, userFollows] of otherUsers) {
      const intersection = new Set(
        [...targetFollows].filter((x) => userFollows.has(x))
      );
      const union = new Set([...targetFollows, ...userFollows]);

      const similarity = union.size > 0 ? intersection.size / union.size : 0;

      if (similarity > 0.1) {
        // Minimum threshold
        similarities.push({ userId, similarity });
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 50);
  }

  /**
   * Identify emerging traders (growing follower count)
   */
  identifyEmergingTraders(
    historicalFollows: Array<SocialFollow & { timestamp: number }>,
    windowDays: number = 30
  ): Array<{
    userId: string;
    followerGrowthRate: number;
    newFollowers: number;
    momentum: number;
  }> {
    const now = Date.now();
    const windowStart = now - windowDays * 24 * 60 * 60 * 1000;

    // Count new followers in window
    const newFollowerCounts = new Map<string, number>();
    const totalFollowerCounts = new Map<string, number>();

    for (const follow of historicalFollows) {
      // Total followers
      totalFollowerCounts.set(
        follow.followeeId,
        (totalFollowerCounts.get(follow.followeeId) || 0) + 1
      );

      // New followers in window
      if (follow.timestamp >= windowStart) {
        newFollowerCounts.set(
          follow.followeeId,
          (newFollowerCounts.get(follow.followeeId) || 0) + 1
        );
      }
    }

    // Calculate growth rates
    const emerging: Array<{
      userId: string;
      followerGrowthRate: number;
      newFollowers: number;
      momentum: number;
    }> = [];

    for (const [userId, newCount] of newFollowerCounts) {
      const totalCount = totalFollowerCounts.get(userId) || 0;
      const existingCount = totalCount - newCount;

      // Growth rate as percentage of existing base
      const growthRate = existingCount > 0 ? (newCount / existingCount) * 100 : newCount * 100;

      // Momentum = new followers * growth rate
      const momentum = newCount * (growthRate / 100);

      if (newCount >= 5) {
        // Minimum threshold
        emerging.push({
          userId,
          followerGrowthRate: growthRate,
          newFollowers: newCount,
          momentum,
        });
      }
    }

    return emerging.sort((a, b) => b.momentum - a.momentum).slice(0, 100);
  }
}

// ============================================================================
// Copy Trading Analysis
// ============================================================================

export class CopyTradingAnalyzer {
  /**
   * Analyze copy trading effectiveness
   */
  analyzeCopyTradingPerformance(
    copyRecords: Array<{
      copierId: string;
      traderId: string;
      totalPnL: number;
      totalTradesCopied: number;
      startedAt: number;
      status: string;
    }>
  ): {
    topPerformingPairs: Array<{
      copierId: string;
      traderId: string;
      pnl: number;
      duration: number;
    }>;
    traderCopySuccess: Map<string, { avgCopierPnL: number; copierCount: number }>;
    avgCopyDuration: number;
    successRate: number;
  } {
    // Find top performing copy relationships
    const sortedByPnL = [...copyRecords].sort((a, b) => b.totalPnL - a.totalPnL);
    const topPerforming = sortedByPnL.slice(0, 20).map((r) => ({
      copierId: r.copierId,
      traderId: r.traderId,
      pnl: r.totalPnL,
      duration: Date.now() - r.startedAt,
    }));

    // Aggregate by trader
    const traderStats = new Map<string, { totalPnL: number; copierCount: number }>();
    for (const record of copyRecords) {
      const stats = traderStats.get(record.traderId) || { totalPnL: 0, copierCount: 0 };
      stats.totalPnL += record.totalPnL;
      stats.copierCount++;
      traderStats.set(record.traderId, stats);
    }

    const traderSuccess = new Map<string, { avgCopierPnL: number; copierCount: number }>();
    for (const [traderId, stats] of traderStats) {
      traderSuccess.set(traderId, {
        avgCopierPnL: stats.copierCount > 0 ? stats.totalPnL / stats.copierCount : 0,
        copierCount: stats.copierCount,
      });
    }

    // Calculate overall stats
    const activeCopies = copyRecords.filter((r) => r.status === "active");
    const avgDuration =
      activeCopies.length > 0
        ? activeCopies.reduce((sum, r) => sum + (Date.now() - r.startedAt), 0) /
          activeCopies.length
        : 0;

    const profitableCopies = copyRecords.filter((r) => r.totalPnL > 0);
    const successRate =
      copyRecords.length > 0 ? profitableCopies.length / copyRecords.length : 0;

    return {
      topPerformingPairs: topPerforming,
      traderCopySuccess: traderSuccess,
      avgCopyDuration: avgDuration,
      successRate,
    };
  }

  /**
   * Recommend traders to copy based on performance and compatibility
   */
  recommendTradersToCopy(
    userId: string,
    userRiskProfile: { riskScore: number; preferredAssets: string[] },
    availableTraders: Array<{
      traderId: string;
      pnl: number;
      winRate: number;
      riskScore: number;
      assetClasses: string[];
      copierCount: number;
      avgCopierPnL: number;
    }>
  ): Array<{
    traderId: string;
    compatibilityScore: number;
    expectedReturn: number;
    reasons: string[];
  }> {
    const recommendations: Array<{
      traderId: string;
      compatibilityScore: number;
      expectedReturn: number;
      reasons: string[];
    }> = [];

    for (const trader of availableTraders) {
      const reasons: string[] = [];

      // Risk compatibility (0-30 points)
      const riskDiff = Math.abs(trader.riskScore - userRiskProfile.riskScore);
      const riskCompatibility = Math.max(0, 30 - riskDiff * 0.3);
      if (riskCompatibility > 20) reasons.push("Similar risk tolerance");

      // Asset compatibility (0-25 points)
      const commonAssets = trader.assetClasses.filter((a) =>
        userRiskProfile.preferredAssets.includes(a)
      );
      const assetCompatibility = (commonAssets.length / Math.max(trader.assetClasses.length, 1)) * 25;
      if (assetCompatibility > 15) reasons.push("Trades your preferred assets");

      // Performance score (0-30 points)
      const performanceScore = Math.min(trader.winRate * 30, 30);
      if (trader.winRate > 0.55) reasons.push(`${(trader.winRate * 100).toFixed(0)}% win rate`);

      // Social proof (0-15 points)
      const socialProof = Math.min(trader.copierCount * 0.5, 15);
      if (trader.copierCount > 10) reasons.push(`${trader.copierCount} copiers trust this trader`);

      const compatibilityScore =
        riskCompatibility + assetCompatibility + performanceScore + socialProof;

      // Expected return based on historical copier performance
      const expectedReturn = trader.avgCopierPnL;

      if (compatibilityScore > 40) {
        recommendations.push({
          traderId: trader.traderId,
          compatibilityScore,
          expectedReturn,
          reasons,
        });
      }
    }

    return recommendations.sort((a, b) => b.compatibilityScore - a.compatibilityScore).slice(0, 10);
  }
}

// ============================================================================
// Chat Sentiment Analysis
// ============================================================================

export class ChatSentimentAnalyzer {
  private readonly bullishKeywords = [
    "moon",
    "bullish",
    "pump",
    "long",
    "buy",
    "accumulate",
    "breakout",
    "rally",
    "ath",
    "up",
    "green",
    "gains",
    "rocket",
    "lambo",
  ];

  private readonly bearishKeywords = [
    "dump",
    "bearish",
    "short",
    "sell",
    "crash",
    "drop",
    "down",
    "red",
    "rekt",
    "panic",
    "bottom",
    "dead",
    "rugpull",
    "scam",
  ];

  /**
   * Analyze sentiment from chat messages
   */
  analyzeChatSentiment(
    roomId: string,
    messages: Array<{
      senderId: string;
      body: string;
      timestamp: number;
    }>,
    associatedAsset?: { assetClass: string; symbol: string }
  ): ChatSentiment {
    let bullishScore = 0;
    let bearishScore = 0;
    const participants = new Set<string>();

    for (const message of messages) {
      participants.add(message.senderId);
      const lowerBody = message.body.toLowerCase();

      // Count keyword matches
      for (const keyword of this.bullishKeywords) {
        if (lowerBody.includes(keyword)) bullishScore++;
      }
      for (const keyword of this.bearishKeywords) {
        if (lowerBody.includes(keyword)) bearishScore++;
      }
    }

    const totalScore = bullishScore + bearishScore;
    const sentimentScore =
      totalScore > 0 ? (bullishScore - bearishScore) / totalScore : 0;

    const sentimentCategory = this.categorizeSentiment(sentimentScore);
    const convictionScore = this.calculateConvictionScore(
      messages.length,
      participants.size,
      totalScore
    );

    return {
      roomId,
      sentimentScore,
      sentimentCategory,
      convictionScore,
      messageCount: messages.length,
      uniqueParticipants: participants.size,
    };
  }

  /**
   * Categorize sentiment score into buckets
   */
  private categorizeSentiment(score: number): SentimentCategory {
    if (score < -0.6) return "very_bearish";
    if (score < -0.2) return "bearish";
    if (score < 0.2) return "neutral";
    if (score < 0.6) return "bullish";
    return "very_bullish";
  }

  /**
   * Calculate conviction score based on activity and consensus
   */
  private calculateConvictionScore(
    messageCount: number,
    participantCount: number,
    sentimentMentions: number
  ): number {
    // Higher activity = higher conviction
    const activityScore = Math.min(messageCount / 100, 1) * 40;

    // More participants = stronger signal
    const participationScore = Math.min(participantCount / 50, 1) * 30;

    // More sentiment keywords = clearer signal
    const clarityScore = Math.min(sentimentMentions / messageCount, 0.5) * 30;

    return activityScore + participationScore + clarityScore;
  }

  /**
   * Extract mentioned tickers/assets from messages
   */
  extractMentionedAssets(
    messages: Array<{ body: string }>,
    knownSymbols: string[]
  ): Map<string, number> {
    const mentions = new Map<string, number>();

    for (const message of messages) {
      const upperBody = message.body.toUpperCase();

      for (const symbol of knownSymbols) {
        // Look for $SYMBOL or standalone symbol
        const patterns = [`$${symbol}`, ` ${symbol} `, `${symbol}:`];
        for (const pattern of patterns) {
          if (upperBody.includes(pattern)) {
            mentions.set(symbol, (mentions.get(symbol) || 0) + 1);
          }
        }
      }
    }

    return mentions;
  }
}

// ============================================================================
// Viral Content Analysis
// ============================================================================

export class ViralContentAnalyzer {
  /**
   * Score content virality
   */
  scoreVirality(content: {
    contentId: string;
    contentType: string;
    authorId: string;
    viewCount: number;
    reactionCount: number;
    replyCount: number;
    shareCount: number;
    createdAt: number;
    authorFollowerCount: number;
  }): ViralContent {
    const ageHours = (Date.now() - content.createdAt) / (1000 * 60 * 60);

    // Engagement rate = (reactions + replies + shares) / views
    const engagementRate =
      content.viewCount > 0
        ? (content.reactionCount + content.replyCount + content.shareCount) /
          content.viewCount
        : 0;

    // Velocity = engagement per hour
    const velocity = ageHours > 0 ? engagementRate / ageHours : 0;

    // Reach factor = views / author followers (amplification)
    const reachFactor =
      content.authorFollowerCount > 0
        ? content.viewCount / content.authorFollowerCount
        : content.viewCount;

    // Composite virality score (0-100)
    const viralityScore = Math.min(
      engagementRate * 200 + // Engagement rate contribution
        velocity * 500 + // Velocity contribution
        Math.log10(content.shareCount + 1) * 20 + // Share contribution
        Math.min(reachFactor * 10, 30), // Reach contribution
      100
    );

    return {
      contentId: content.contentId,
      contentType: content.contentType as ViralContent["contentType"],
      authorId: content.authorId,
      viralityScore,
      viewCount: content.viewCount,
      shareCount: content.shareCount,
      tradingActivitySpike: false, // Would need trading data to determine
    };
  }

  /**
   * Identify viral content patterns
   */
  identifyViralPatterns(
    viralContent: ViralContent[]
  ): {
    topContentTypes: Array<{ type: string; avgViralityScore: number; count: number }>;
    topAuthors: Array<{ authorId: string; viralContentCount: number; avgScore: number }>;
    optimalPostingHours: number[];
  } {
    // Analyze by content type
    const byType = new Map<string, { totalScore: number; count: number }>();
    for (const content of viralContent) {
      const stats = byType.get(content.contentType) || { totalScore: 0, count: 0 };
      stats.totalScore += content.viralityScore;
      stats.count++;
      byType.set(content.contentType, stats);
    }

    const topTypes = Array.from(byType.entries())
      .map(([type, stats]) => ({
        type,
        avgViralityScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
        count: stats.count,
      }))
      .sort((a, b) => b.avgViralityScore - a.avgViralityScore);

    // Analyze by author
    const byAuthor = new Map<string, { totalScore: number; count: number }>();
    for (const content of viralContent) {
      const stats = byAuthor.get(content.authorId) || { totalScore: 0, count: 0 };
      stats.totalScore += content.viralityScore;
      stats.count++;
      byAuthor.set(content.authorId, stats);
    }

    const topAuthors = Array.from(byAuthor.entries())
      .map(([authorId, stats]) => ({
        authorId,
        viralContentCount: stats.count,
        avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
      }))
      .sort((a, b) => b.viralContentCount - a.viralContentCount)
      .slice(0, 20);

    return {
      topContentTypes: topTypes,
      topAuthors,
      optimalPostingHours: [9, 10, 11, 14, 15, 16], // Placeholder - would need timestamp analysis
    };
  }
}

// ============================================================================
// Community Conviction Analysis
// ============================================================================

export class CommunityConvictionAnalyzer {
  /**
   * Calculate community conviction for an asset
   */
  calculateCommunityConviction(
    assetClass: string,
    symbol: string,
    inputs: {
      chatSentiment: ChatSentiment[];
      recentTrades: Array<{ side: string; volume: number; userId: string }>;
      copyTradingFlow: Array<{ traderId: string; direction: string }>;
      socialMentions: number;
    }
  ): CommunityConvictionSignal {
    // Aggregate chat sentiment
    const avgChatSentiment =
      inputs.chatSentiment.length > 0
        ? inputs.chatSentiment.reduce((sum, s) => sum + s.sentimentScore, 0) /
          inputs.chatSentiment.length
        : 0;

    // Calculate trading flow direction
    let buyVolume = 0;
    let sellVolume = 0;
    const traders = new Set<string>();

    for (const trade of inputs.recentTrades) {
      traders.add(trade.userId);
      if (trade.side === "buy") {
        buyVolume += trade.volume;
      } else {
        sellVolume += trade.volume;
      }
    }

    const totalVolume = buyVolume + sellVolume;
    const tradingFlowScore =
      totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

    // Copy trading flow from top traders
    const bullishCopies = inputs.copyTradingFlow.filter(
      (c) => c.direction === "long"
    ).length;
    const bearishCopies = inputs.copyTradingFlow.filter(
      (c) => c.direction === "short"
    ).length;
    const copyFlowScore =
      bullishCopies + bearishCopies > 0
        ? (bullishCopies - bearishCopies) / (bullishCopies + bearishCopies)
        : 0;

    // Social mention score (normalized)
    const socialMentionScore = Math.min(inputs.socialMentions / 100, 1);

    // Combine scores (weighted average)
    const overallConviction =
      avgChatSentiment * 30 +
      tradingFlowScore * 40 +
      copyFlowScore * 20 +
      socialMentionScore * 10;

    // Determine direction
    const convictionDirection = this.getConvictionDirection(overallConviction);

    return {
      assetClass,
      symbol,
      overallConviction,
      convictionDirection,
      chatSentimentScore: avgChatSentiment * 100,
      tradingFlowScore: tradingFlowScore * 100,
      totalParticipants: traders.size,
    };
  }

  /**
   * Categorize conviction direction
   */
  private getConvictionDirection(score: number): ConvictionDirection {
    if (score < -60) return "strong_sell";
    if (score < -20) return "sell";
    if (score < 20) return "neutral";
    if (score < 60) return "buy";
    return "strong_buy";
  }

  /**
   * Detect extreme conviction levels (potential contrarian signals)
   */
  detectExtremeConviction(
    signals: CommunityConvictionSignal[]
  ): Array<{
    assetClass: string;
    symbol: string;
    extremeType: "max_bullish" | "max_bearish";
    conviction: number;
    historicalReversalRate?: number;
  }> {
    const extremes: Array<{
      assetClass: string;
      symbol: string;
      extremeType: "max_bullish" | "max_bearish";
      conviction: number;
    }> = [];

    for (const signal of signals) {
      if (signal.overallConviction > 80) {
        extremes.push({
          assetClass: signal.assetClass,
          symbol: signal.symbol,
          extremeType: "max_bullish",
          conviction: signal.overallConviction,
        });
      } else if (signal.overallConviction < -80) {
        extremes.push({
          assetClass: signal.assetClass,
          symbol: signal.symbol,
          extremeType: "max_bearish",
          conviction: signal.overallConviction,
        });
      }
    }

    return extremes;
  }
}

// ============================================================================
// Leaderboard Generator
// ============================================================================

export class LeaderboardGenerator {
  /**
   * Generate trader leaderboard
   */
  generateLeaderboard(
    traders: Array<{
      userId: string;
      totalPnL: number;
      winRate: number;
      totalTrades: number;
      totalVolume: number;
      maxDrawdown: number;
      isVerified: boolean;
    }>,
    socialData: Map<string, { followers: number; copiers: number }>,
    type: "daily" | "weekly" | "monthly" | "all_time"
  ): TraderLeaderboardEntry[] {
    // Score and rank traders
    const scoredTraders = traders.map((trader) => {
      const social = socialData.get(trader.userId) || { followers: 0, copiers: 0 };

      // Composite score:
      // - PnL (40%)
      // - Win rate (25%)
      // - Risk-adjusted (max drawdown) (20%)
      // - Social proof (15%)
      const pnlScore = Math.min(Math.max(trader.totalPnL / 10000, -100), 100);
      const winRateScore = trader.winRate * 100;
      const riskScore = 100 - Math.min(trader.maxDrawdown, 100);
      const socialScore = Math.min((social.followers + social.copiers * 5) / 10, 100);

      const compositeScore =
        pnlScore * 0.4 + winRateScore * 0.25 + riskScore * 0.2 + socialScore * 0.15;

      return {
        ...trader,
        ...social,
        compositeScore,
      };
    });

    // Sort and rank
    scoredTraders.sort((a, b) => b.compositeScore - a.compositeScore);

    return scoredTraders.map((trader, index) => ({
      userId: trader.userId,
      rank: index + 1,
      totalPnL: trader.totalPnL,
      winRate: trader.winRate,
      totalTrades: trader.totalTrades,
      followerCount: trader.followers,
      copierCount: trader.copiers,
      isVerified: trader.isVerified,
    }));
  }
}

// ============================================================================
// Export singleton instances
// ============================================================================

export const socialGraphAnalyzer = new SocialGraphAnalyzer();
export const copyTradingAnalyzer = new CopyTradingAnalyzer();
export const chatSentimentAnalyzer = new ChatSentimentAnalyzer();
export const viralContentAnalyzer = new ViralContentAnalyzer();
export const communityConvictionAnalyzer = new CommunityConvictionAnalyzer();
export const leaderboardGenerator = new LeaderboardGenerator();
