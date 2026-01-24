/**
 * Recommendation Engine Client
 * Personalized market recommendations using hybrid algorithms
 */

import type {
  RecommendationClientConfig,
  Logger,
  Market,
  MarketFeatures,
  UserProfile,
  RecommendationRequest,
  Recommendation,
  RecommendationReason,
  ReasonType,
  ScoringWeights,
  TrendingMarket,
  TrendingRequest,
  SimilarMarketsRequest,
  SimilarMarket,
  DiscoveryRequest,
  DiscoveryType,
  RecommendationFeedback,
  UserSimilarity,
} from "./types";
import { RecommendationError } from "./types";

// ============================================================================
// Default Scoring Weights
// ============================================================================

const DEFAULT_WEIGHTS: ScoringWeights = {
  contentSimilarity: 0.35,
  collaborativeFiltering: 0.25,
  popularity: 0.15,
  recency: 0.10,
  categoryAffinity: 0.10,
  volumeBoost: 0.05,
  diversityPenalty: 0.10,
};

// ============================================================================
// Recommendation Client
// ============================================================================

export class RecommendationClient {
  private readonly config: RecommendationClientConfig;
  private readonly logger: Logger;

  constructor(config: RecommendationClientConfig) {
    this.config = config;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Recommendations] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Recommendations] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Recommendations] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Recommendations] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Core Recommendation Methods
  // ==========================================================================

  /**
   * Get personalized recommendations for a user
   */
  async getRecommendations(
    request: RecommendationRequest,
    userProfile: UserProfile,
    candidateMarkets: Market[]
  ): Promise<Recommendation[]> {
    const { userId, limit = 20, filters, context } = request;

    this.logger.info("Generating recommendations", {
      userId,
      candidateCount: candidateMarkets.length,
    });

    // Filter candidates
    let filteredMarkets = this.applyFilters(candidateMarkets, filters);

    // Exclude already traded/watched markets
    const tradedMarketIds = new Set(
      userProfile.tradingHistory.map((t) => t.marketId)
    );
    filteredMarkets = filteredMarkets.filter(
      (m) => !tradedMarketIds.has(m.marketId)
    );

    // Score each market
    const scoredMarkets = await Promise.all(
      filteredMarkets.map(async (market) => {
        const { score, reasons } = await this.scoreMarket(
          market,
          userProfile,
          DEFAULT_WEIGHTS
        );
        return { market, score, reasons };
      })
    );

    // Sort by score and apply diversity
    const diversifiedResults = this.applyDiversity(scoredMarkets, limit);

    // Format results
    const recommendations: Recommendation[] = diversifiedResults.map(
      (result, index) => ({
        marketId: result.market.marketId,
        market: result.market,
        score: result.score,
        reasons: result.reasons,
        rank: index + 1,
      })
    );

    this.logger.info("Recommendations generated", {
      userId,
      count: recommendations.length,
    });

    return recommendations;
  }

  /**
   * Score a market for a user
   */
  private async scoreMarket(
    market: Market,
    userProfile: UserProfile,
    weights: ScoringWeights
  ): Promise<{ score: number; reasons: RecommendationReason[] }> {
    const reasons: RecommendationReason[] = [];
    let totalScore = 0;

    // Content similarity score
    const contentScore = this.calculateContentScore(market, userProfile);
    if (contentScore > 0.5) {
      reasons.push({
        type: "content_based",
        description: "Similar to markets you've traded",
        weight: contentScore * weights.contentSimilarity,
      });
    }
    totalScore += contentScore * weights.contentSimilarity;

    // Category affinity score
    const categoryScore = this.calculateCategoryAffinity(market, userProfile);
    if (categoryScore > 0.5) {
      reasons.push({
        type: "similar_to_traded",
        description: `Popular in ${market.category}`,
        weight: categoryScore * weights.categoryAffinity,
      });
    }
    totalScore += categoryScore * weights.categoryAffinity;

    // Popularity score
    const popularityScore = this.calculatePopularityScore(market);
    if (popularityScore > 0.7) {
      reasons.push({
        type: "high_volume",
        description: "High trading volume",
        weight: popularityScore * weights.popularity,
      });
    }
    totalScore += popularityScore * weights.popularity;

    // Recency score
    const recencyScore = this.calculateRecencyScore(market);
    if (recencyScore > 0.8) {
      reasons.push({
        type: "new_market",
        description: "Recently created market",
        weight: recencyScore * weights.recency,
      });
    }
    totalScore += recencyScore * weights.recency;

    // Closing soon bonus
    const closingSoonScore = this.calculateClosingSoonScore(market);
    if (closingSoonScore > 0.8) {
      reasons.push({
        type: "closing_soon",
        description: "Closing soon",
        weight: closingSoonScore * 0.1,
      });
      totalScore += closingSoonScore * 0.1;
    }

    // Volume boost
    const volumeBoost = Math.min(market.volume24h / 100000, 1);
    totalScore += volumeBoost * weights.volumeBoost;

    return { score: totalScore, reasons };
  }

  /**
   * Calculate content-based similarity score
   */
  private calculateContentScore(market: Market, userProfile: UserProfile): number {
    // Calculate based on tags overlap with user's trading history
    const userTags = new Set<string>();
    userProfile.tradingHistory.forEach((trade) => {
      // In production, fetch market tags from cache/database
      userTags.add(trade.category);
    });

    const marketTags = new Set(market.tags);
    const intersection = [...userTags].filter((tag) => marketTags.has(tag));

    if (userTags.size === 0) return 0.5; // Cold start - return neutral score

    return intersection.length / Math.max(userTags.size, 1);
  }

  /**
   * Calculate category affinity score
   */
  private calculateCategoryAffinity(
    market: Market,
    userProfile: UserProfile
  ): number {
    // Count trades per category
    const categoryCounts: Record<string, number> = {};
    let totalTrades = 0;

    userProfile.tradingHistory.forEach((trade) => {
      categoryCounts[trade.category] = (categoryCounts[trade.category] || 0) + 1;
      totalTrades++;
    });

    if (totalTrades === 0) return 0.5; // Cold start

    const categoryCount = categoryCounts[market.category] || 0;
    return categoryCount / totalTrades;
  }

  /**
   * Calculate popularity score based on volume
   */
  private calculatePopularityScore(market: Market): number {
    // Logarithmic scaling for volume
    const logVolume = Math.log10(market.totalVolume + 1);
    const maxLogVolume = 7; // Assuming max volume of 10M

    return Math.min(logVolume / maxLogVolume, 1);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(market: Market): number {
    const now = Date.now();
    const createdAt = market.createdAt.getTime();
    const ageHours = (now - createdAt) / (1000 * 60 * 60);

    // Decay function: 1 for new markets, decays over 168 hours (1 week)
    const decay = Math.exp(-ageHours / 168);

    return Math.max(decay, 0.1);
  }

  /**
   * Calculate closing soon score
   */
  private calculateClosingSoonScore(market: Market): number {
    const now = Date.now();
    const closeDate = market.closeDate.getTime();
    const hoursUntilClose = (closeDate - now) / (1000 * 60 * 60);

    if (hoursUntilClose <= 0) return 0; // Already closed
    if (hoursUntilClose <= 24) return 1; // Closing within 24 hours
    if (hoursUntilClose <= 72) return 0.8; // Closing within 3 days
    if (hoursUntilClose <= 168) return 0.5; // Closing within 1 week

    return 0;
  }

  /**
   * Apply diversity to results (avoid too many from same category)
   */
  private applyDiversity(
    scoredMarkets: Array<{ market: Market; score: number; reasons: RecommendationReason[] }>,
    limit: number
  ): Array<{ market: Market; score: number; reasons: RecommendationReason[] }> {
    // Sort by score
    const sorted = [...scoredMarkets].sort((a, b) => b.score - a.score);

    const result: typeof sorted = [];
    const categoryCounts: Record<string, number> = {};
    const maxPerCategory = Math.ceil(limit / 3); // Max 1/3 from same category

    for (const item of sorted) {
      if (result.length >= limit) break;

      const category = item.market.category;
      const currentCount = categoryCounts[category] || 0;

      if (currentCount < maxPerCategory) {
        result.push(item);
        categoryCounts[category] = currentCount + 1;
      }
    }

    // Fill remaining slots if needed
    if (result.length < limit) {
      const remaining = sorted.filter((item) => !result.includes(item));
      result.push(...remaining.slice(0, limit - result.length));
    }

    return result;
  }

  /**
   * Apply filters to candidate markets
   */
  private applyFilters(
    markets: Market[],
    filters?: RecommendationRequest["filters"]
  ): Market[] {
    if (!filters) return markets;

    return markets.filter((market) => {
      if (
        filters.categories?.length &&
        !filters.categories.includes(market.category)
      ) {
        return false;
      }
      if (filters.excludeMarketIds?.includes(market.marketId)) {
        return false;
      }
      if (filters.minVolume && market.totalVolume < filters.minVolume) {
        return false;
      }
      if (filters.maxCloseDate && market.closeDate > filters.maxCloseDate) {
        return false;
      }
      if (filters.minCloseDate && market.closeDate < filters.minCloseDate) {
        return false;
      }
      return true;
    });
  }

  // ==========================================================================
  // Trending Markets
  // ==========================================================================

  /**
   * Get trending markets
   */
  async getTrending(
    request: TrendingRequest,
    markets: Market[],
    volumeChanges: Record<string, number>
  ): Promise<TrendingMarket[]> {
    const { category, limit = 10 } = request;

    let filteredMarkets = markets;
    if (category) {
      filteredMarkets = markets.filter((m) => m.category === category);
    }

    const trendingMarkets = filteredMarkets.map((market) => {
      const volumeChange = volumeChanges[market.marketId] || 0;
      const trendScore = this.calculateTrendScore(market, volumeChange);

      return {
        marketId: market.marketId,
        market,
        trendScore,
        volumeChange24h: volumeChange,
        tradeCountChange24h: 0, // Would be calculated from actual data
        uniqueTradersChange24h: 0, // Would be calculated from actual data
      };
    });

    return trendingMarkets
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, limit);
  }

  /**
   * Calculate trend score
   */
  private calculateTrendScore(market: Market, volumeChange: number): number {
    // Combination of absolute volume and volume growth
    const volumeScore = Math.log10(market.volume24h + 1) / 6;
    const growthScore = Math.max(0, Math.min(1, volumeChange / 100));

    // Weight growth more heavily for trending
    return volumeScore * 0.4 + growthScore * 0.6;
  }

  // ==========================================================================
  // Similar Markets
  // ==========================================================================

  /**
   * Get similar markets to a given market
   */
  async getSimilarMarkets(
    request: SimilarMarketsRequest,
    sourceMarket: Market,
    candidateMarkets: Market[]
  ): Promise<SimilarMarket[]> {
    const { limit = 5, excludeCategories } = request;

    let candidates = candidateMarkets.filter(
      (m) => m.marketId !== sourceMarket.marketId
    );

    if (excludeCategories?.length) {
      candidates = candidates.filter(
        (m) => !excludeCategories.includes(m.category)
      );
    }

    const sourceTags = new Set(sourceMarket.tags);

    const similarMarkets = candidates.map((market) => {
      const marketTags = new Set(market.tags);
      const sharedTags = [...sourceTags].filter((tag) => marketTags.has(tag));

      // Calculate Jaccard similarity
      const union = new Set([...sourceTags, ...marketTags]);
      const similarity = sharedTags.length / union.size;

      // Boost same category
      const categoryBoost = market.category === sourceMarket.category ? 0.2 : 0;

      return {
        marketId: market.marketId,
        market,
        similarity: similarity + categoryBoost,
        sharedTags,
      };
    });

    return similarMarkets
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // ==========================================================================
  // Discovery
  // ==========================================================================

  /**
   * Get discovery recommendations by type
   */
  async getDiscovery(
    request: DiscoveryRequest,
    markets: Market[]
  ): Promise<Market[]> {
    const { type, limit = 10 } = request;

    switch (type) {
      case "new_markets":
        return this.getNewMarkets(markets, limit);

      case "closing_soon":
        return this.getClosingSoonMarkets(markets, limit);

      case "high_liquidity":
        return this.getHighLiquidityMarkets(markets, limit);

      case "underrated":
        return this.getUnderratedMarkets(markets, limit);

      case "diverse_picks":
        return this.getDiversePicks(markets, limit);

      default:
        return [];
    }
  }

  private getNewMarkets(markets: Market[], limit: number): Market[] {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return markets
      .filter((m) => m.createdAt.getTime() > oneDayAgo)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  private getClosingSoonMarkets(markets: Market[], limit: number): Market[] {
    const now = Date.now();
    const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;

    return markets
      .filter((m) => {
        const closeTime = m.closeDate.getTime();
        return closeTime > now && closeTime < threeDaysFromNow;
      })
      .sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
      .slice(0, limit);
  }

  private getHighLiquidityMarkets(markets: Market[], limit: number): Market[] {
    return [...markets]
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, limit);
  }

  private getUnderratedMarkets(markets: Market[], limit: number): Market[] {
    // Markets with high potential but low volume
    return markets
      .filter((m) => m.volume24h < 10000 && m.liquidity > 5000)
      .sort((a, b) => b.liquidity / (b.volume24h + 1) - a.liquidity / (a.volume24h + 1))
      .slice(0, limit);
  }

  private getDiversePicks(markets: Market[], limit: number): Market[] {
    // One from each category
    const categories = new Set(markets.map((m) => m.category));
    const picks: Market[] = [];

    for (const category of categories) {
      const categoryMarkets = markets.filter((m) => m.category === category);
      const topMarket = categoryMarkets.sort(
        (a, b) => b.totalVolume - a.totalVolume
      )[0];

      if (topMarket) {
        picks.push(topMarket);
      }

      if (picks.length >= limit) break;
    }

    return picks;
  }

  // ==========================================================================
  // Collaborative Filtering
  // ==========================================================================

  /**
   * Find similar users based on trading patterns
   */
  async findSimilarUsers(
    userId: string,
    userProfiles: UserProfile[],
    limit: number = 50
  ): Promise<UserSimilarity[]> {
    const targetProfile = userProfiles.find((p) => p.userId === userId);
    if (!targetProfile) return [];

    const targetMarkets = new Set(
      targetProfile.tradingHistory.map((t) => t.marketId)
    );

    const similarities = userProfiles
      .filter((p) => p.userId !== userId)
      .map((profile) => {
        const profileMarkets = new Set(
          profile.tradingHistory.map((t) => t.marketId)
        );

        // Calculate Jaccard similarity
        const intersection = [...targetMarkets].filter((m) =>
          profileMarkets.has(m)
        );
        const union = new Set([...targetMarkets, ...profileMarkets]);

        return {
          userId: profile.userId,
          similarity: intersection.length / union.size,
        };
      });

    return similarities
      .filter((s) => s.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // ==========================================================================
  // Feedback Processing
  // ==========================================================================

  /**
   * Process recommendation feedback for model improvement
   */
  async processFeedback(feedback: RecommendationFeedback): Promise<void> {
    this.logger.debug("Processing feedback", {
      userId: feedback.userId,
      marketId: feedback.marketId,
      type: feedback.feedbackType,
    });

    // In production, this would:
    // 1. Store feedback in analytics
    // 2. Update user preference embeddings
    // 3. Adjust recommendation weights if needed

    // Weight different feedback types
    const feedbackWeights: Record<string, number> = {
      trade: 1.0,
      watchlist_add: 0.7,
      click: 0.3,
      view: 0.1,
      dismiss: -0.3,
      not_interested: -0.7,
    };

    const weight = feedbackWeights[feedback.feedbackType] ?? 0;

    this.logger.info("Feedback processed", {
      userId: feedback.userId,
      marketId: feedback.marketId,
      weight,
    });
  }

  // ==========================================================================
  // Cold Start Handling
  // ==========================================================================

  /**
   * Get recommendations for new users (cold start)
   */
  async getColdStartRecommendations(
    markets: Market[],
    limit: number = 20
  ): Promise<Recommendation[]> {
    // For new users, recommend:
    // 1. Popular markets
    // 2. New markets
    // 3. Diverse categories

    const popular = [...markets]
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, Math.ceil(limit * 0.5));

    const newMarkets = this.getNewMarkets(markets, Math.ceil(limit * 0.3));
    const diverse = this.getDiversePicks(markets, Math.ceil(limit * 0.2));

    // Combine and deduplicate
    const combined = new Map<string, Market>();
    [...popular, ...newMarkets, ...diverse].forEach((m) => {
      if (!combined.has(m.marketId)) {
        combined.set(m.marketId, m);
      }
    });

    return [...combined.values()].slice(0, limit).map((market, index) => ({
      marketId: market.marketId,
      market,
      score: 1 - index * 0.01,
      reasons: [
        {
          type: "popular_in_segment" as ReasonType,
          description: "Popular among users",
          weight: 1,
        },
      ],
      rank: index + 1,
    }));
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    // Would check Pinecone and other dependencies
    return true;
  }
}

export default RecommendationClient;
