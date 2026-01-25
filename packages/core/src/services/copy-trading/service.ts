/**
 * Copy Trading Service
 *
 * Manages copy trading relationships, subscriptions, and execution.
 */

import {
  type CopyTradingProfile,
  type TraderPerformance,
  type CopySubscription,
  type CopyTrade,
  type CopierInfo,
  type LeaderInfo,
  type TraderReview,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
  type UpdateProfileInput,
  type CreateReviewInput,
  type CopyStatus,
  type TraderTier,
} from "./types";
import { CopyExecutor } from "./executor";

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CopyTradingService {
  private profiles: Map<string, CopyTradingProfile> = new Map();
  private subscriptions: Map<string, CopySubscription> = new Map();
  private copyTrades: Map<string, CopyTrade> = new Map();
  private reviews: Map<string, TraderReview> = new Map();
  private executor: CopyExecutor;

  constructor() {
    this.executor = new CopyExecutor();
    this.initializeSampleProfiles();
  }

  // ============================================================================
  // PROFILE MANAGEMENT
  // ============================================================================

  /**
   * Get or create copy trading profile
   */
  async getProfile(userId: string): Promise<CopyTradingProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  /**
   * Create copy trading profile
   */
  async createProfile(
    userId: string,
    username: string,
    input?: Partial<UpdateProfileInput>
  ): Promise<CopyTradingProfile> {
    const profile: CopyTradingProfile = {
      userId,
      username,
      displayName: input?.displayName ?? username,
      bio: input?.bio,
      isAcceptingCopiers: input?.isAcceptingCopiers ?? false,
      tier: "rising_star",
      performanceFee: input?.performanceFee ?? 10,
      subscriptionFee: input?.subscriptionFee,
      minCopyAmount: input?.minCopyAmount ?? 10,
      maxCopiers: input?.maxCopiers,
      totalCopiers: 0,
      totalAUM: 0,
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      avgReturn: 0,
      followers: 0,
      rating: 0,
      reviewCount: 0,
      tradingStyle: input?.tradingStyle ?? [],
      preferredMarkets: input?.preferredMarkets ?? [],
      riskLevel: "medium",
      avgHoldingTime: "Unknown",
      return30d: 0,
      return90d: 0,
      return1y: 0,
      returnAllTime: 0,
      maxDrawdown: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.profiles.set(userId, profile);
    return profile;
  }

  /**
   * Update copy trading profile
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput
  ): Promise<CopyTradingProfile> {
    let profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    if (input.displayName !== undefined) profile.displayName = input.displayName;
    if (input.bio !== undefined) profile.bio = input.bio;
    if (input.isAcceptingCopiers !== undefined) profile.isAcceptingCopiers = input.isAcceptingCopiers;
    if (input.performanceFee !== undefined) profile.performanceFee = input.performanceFee;
    if (input.subscriptionFee !== undefined) profile.subscriptionFee = input.subscriptionFee;
    if (input.minCopyAmount !== undefined) profile.minCopyAmount = input.minCopyAmount;
    if (input.maxCopiers !== undefined) profile.maxCopiers = input.maxCopiers;
    if (input.tradingStyle !== undefined) profile.tradingStyle = input.tradingStyle;
    if (input.preferredMarkets !== undefined) profile.preferredMarkets = input.preferredMarkets;

    profile.updatedAt = Date.now();
    this.profiles.set(userId, profile);

    return profile;
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Create copy subscription (follow a trader)
   */
  async createSubscription(
    copierId: string,
    input: CreateSubscriptionInput
  ): Promise<CopySubscription> {
    // Validate trader exists and is accepting copiers
    const traderProfile = this.profiles.get(input.traderId);
    if (!traderProfile) {
      throw new Error("Trader not found");
    }

    if (!traderProfile.isAcceptingCopiers) {
      throw new Error("Trader is not accepting new copiers");
    }

    if (input.allocatedCapital < traderProfile.minCopyAmount) {
      throw new Error(`Minimum copy amount is ${traderProfile.minCopyAmount}`);
    }

    // Check max copiers limit
    if (traderProfile.maxCopiers) {
      const currentCopiers = Array.from(this.subscriptions.values()).filter(
        (s) => s.traderId === input.traderId && s.status === "active"
      ).length;
      if (currentCopiers >= traderProfile.maxCopiers) {
        throw new Error("Trader has reached maximum copiers");
      }
    }

    // Check if already copying this trader
    const existingSubscription = Array.from(this.subscriptions.values()).find(
      (s) => s.copierId === copierId && s.traderId === input.traderId && s.status === "active"
    );
    if (existingSubscription) {
      throw new Error("Already copying this trader");
    }

    const subscription: CopySubscription = {
      id: `copy_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      copierId,
      traderId: input.traderId,
      status: "active",
      copyMode: input.copyMode,
      fixedAmount: input.fixedAmount,
      portfolioPercentage: input.portfolioPercentage,
      copyRatio: input.copyRatio,
      maxPositionSize: input.maxPositionSize,
      maxDailyLoss: input.maxDailyLoss,
      maxTotalExposure: input.maxTotalExposure,
      stopLossPercent: input.stopLossPercent,
      takeProfitPercent: input.takeProfitPercent,
      copyAssetClasses: input.copyAssetClasses,
      excludedMarkets: input.excludedMarkets ?? [],
      copyDelaySeconds: input.copyDelaySeconds,
      totalCopiedTrades: 0,
      successfulCopies: 0,
      failedCopies: 0,
      totalPnL: 0,
      totalFeePaid: 0,
      allocatedCapital: input.allocatedCapital,
      currentValue: input.allocatedCapital,
      subscribedAt: Date.now(),
    };

    this.subscriptions.set(subscription.id, subscription);

    // Update trader profile
    traderProfile.totalCopiers += 1;
    traderProfile.totalAUM += input.allocatedCapital;
    this.profiles.set(input.traderId, traderProfile);

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<CopySubscription | null> {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  /**
   * Get subscriptions (as copier)
   */
  async getCopierSubscriptions(
    copierId: string,
    status?: CopyStatus
  ): Promise<CopySubscription[]> {
    const subs = Array.from(this.subscriptions.values()).filter(
      (s) => s.copierId === copierId && (!status || s.status === status)
    );
    return subs;
  }

  /**
   * Get copiers (as trader)
   */
  async getTraderCopiers(
    traderId: string,
    status?: CopyStatus
  ): Promise<CopySubscription[]> {
    const subs = Array.from(this.subscriptions.values()).filter(
      (s) => s.traderId === traderId && (!status || s.status === status)
    );
    return subs;
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    subscriptionId: string,
    copierId: string,
    input: UpdateSubscriptionInput
  ): Promise<CopySubscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.copierId !== copierId) {
      throw new Error("Unauthorized");
    }

    // Update fields
    Object.assign(subscription, {
      ...input,
      updatedAt: Date.now(),
    });

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(subscriptionId: string, copierId: string): Promise<CopySubscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.copierId !== copierId) {
      throw new Error("Unauthorized");
    }

    if (subscription.status !== "active") {
      throw new Error("Subscription is not active");
    }

    subscription.status = "paused";
    subscription.pausedAt = Date.now();

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(subscriptionId: string, copierId: string): Promise<CopySubscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.copierId !== copierId) {
      throw new Error("Unauthorized");
    }

    if (subscription.status !== "paused") {
      throw new Error("Subscription is not paused");
    }

    subscription.status = "active";
    subscription.pausedAt = undefined;

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, copierId: string): Promise<CopySubscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.copierId !== copierId) {
      throw new Error("Unauthorized");
    }

    subscription.status = "stopped";
    subscription.cancelledAt = Date.now();

    this.subscriptions.set(subscriptionId, subscription);

    // Update trader profile
    const profile = this.profiles.get(subscription.traderId);
    if (profile) {
      profile.totalCopiers = Math.max(0, profile.totalCopiers - 1);
      profile.totalAUM = Math.max(0, profile.totalAUM - subscription.allocatedCapital);
      this.profiles.set(subscription.traderId, profile);
    }

    return subscription;
  }

  // ============================================================================
  // COPY EXECUTION
  // ============================================================================

  /**
   * Process a trade for copy (called when leader places trade)
   */
  async processLeaderTrade(
    traderId: string,
    trade: {
      id: string;
      marketId: string;
      marketTitle: string;
      side: "yes" | "no" | "buy" | "sell";
      amount: number;
      odds: number;
    }
  ): Promise<CopyTrade[]> {
    const activeSubscriptions = await this.getTraderCopiers(traderId, "active");
    const copyTrades: CopyTrade[] = [];

    for (const subscription of activeSubscriptions) {
      // Check if this market type should be copied
      // (simplified - in production, check against subscription filters)

      try {
        const copyTrade = await this.executor.executeCopy(subscription, trade);
        this.copyTrades.set(copyTrade.id, copyTrade);
        copyTrades.push(copyTrade);

        // Update subscription stats
        subscription.totalCopiedTrades += 1;
        subscription.successfulCopies += 1;
        subscription.lastCopyAt = Date.now();
        this.subscriptions.set(subscription.id, subscription);
      } catch (error) {
        // Log failed copy
        const failedTrade: CopyTrade = {
          id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          subscriptionId: subscription.id,
          copierId: subscription.copierId,
          traderId,
          originalTradeId: trade.id,
          originalAmount: trade.amount,
          originalOdds: trade.odds,
          copiedAmount: 0,
          copiedOdds: trade.odds,
          marketId: trade.marketId,
          marketTitle: trade.marketTitle,
          side: trade.side,
          status: "failed",
          failureReason: error instanceof Error ? error.message : "Unknown error",
          copyDelay: 0,
          createdAt: Date.now(),
        };

        this.copyTrades.set(failedTrade.id, failedTrade);
        copyTrades.push(failedTrade);

        subscription.failedCopies += 1;
        this.subscriptions.set(subscription.id, subscription);
      }
    }

    return copyTrades;
  }

  /**
   * Get copy trades for a subscription
   */
  async getSubscriptionTrades(
    subscriptionId: string,
    limit: number = 50
  ): Promise<CopyTrade[]> {
    return Array.from(this.copyTrades.values())
      .filter((t) => t.subscriptionId === subscriptionId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // ============================================================================
  // REVIEWS
  // ============================================================================

  /**
   * Create a review for a trader
   */
  async createReview(
    reviewerId: string,
    reviewerUsername: string,
    input: CreateReviewInput
  ): Promise<TraderReview> {
    // Verify reviewer has copied this trader
    const subscription = Array.from(this.subscriptions.values()).find(
      (s) => s.copierId === reviewerId && s.traderId === input.traderId
    );

    if (!subscription) {
      throw new Error("Must have copied this trader to leave a review");
    }

    const periodCopied = Math.floor(
      (Date.now() - subscription.subscribedAt) / (24 * 60 * 60 * 1000)
    );

    const review: TraderReview = {
      id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      traderId: input.traderId,
      reviewerId,
      reviewerUsername,
      rating: input.rating,
      title: input.title,
      content: input.content,
      periodCopied,
      pnlDuringPeriod: subscription.totalPnL,
      tradesCopied: subscription.totalCopiedTrades,
      isVerified: true,
      isHelpful: 0,
      isReported: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.reviews.set(review.id, review);

    // Update trader profile rating
    await this.updateTraderRating(input.traderId);

    return review;
  }

  /**
   * Get reviews for a trader
   */
  async getTraderReviews(traderId: string): Promise<TraderReview[]> {
    return Array.from(this.reviews.values())
      .filter((r) => r.traderId === traderId && !r.isReported)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private async updateTraderRating(traderId: string): Promise<void> {
    const reviews = await this.getTraderReviews(traderId);
    const profile = this.profiles.get(traderId);

    if (profile && reviews.length > 0) {
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      profile.rating = Math.round(avgRating * 10) / 10;
      profile.reviewCount = reviews.length;
      this.profiles.set(traderId, profile);
    }
  }

  // ============================================================================
  // PERFORMANCE TRACKING
  // ============================================================================

  /**
   * Get trader performance metrics
   */
  async getTraderPerformance(
    traderId: string,
    period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time"
  ): Promise<TraderPerformance> {
    const profile = this.profiles.get(traderId);

    // In production, calculate from actual trade history
    return {
      userId: traderId,
      period,
      absoluteReturn: profile?.returnAllTime ?? 0,
      percentageReturn: (profile?.returnAllTime ?? 0) * 100,
      sharpeRatio: 1.5,
      sortinoRatio: 2.0,
      totalTrades: profile?.totalTrades ?? 0,
      winningTrades: Math.floor((profile?.totalTrades ?? 0) * (profile?.winRate ?? 0)),
      losingTrades: Math.floor((profile?.totalTrades ?? 0) * (1 - (profile?.winRate ?? 0))),
      winRate: profile?.winRate ?? 0,
      avgWin: 25,
      avgLoss: 15,
      largestWin: 500,
      largestLoss: 200,
      profitFactor: profile?.profitFactor ?? 0,
      maxDrawdown: profile?.maxDrawdown ?? 0,
      avgDrawdown: (profile?.maxDrawdown ?? 0) * 0.5,
      volatility: 0.15,
      beta: 1.0,
      profitableDays: 20,
      profitableWeeks: 4,
      profitableMonths: 1,
      longestWinStreak: 8,
      longestLossStreak: 3,
      currentStreak: 3,
      currentStreakType: "win",
      copierPnL: profile?.totalAUM ?? 0 * 0.05,
      copierWinRate: profile?.winRate ?? 0,
      calculatedAt: Date.now(),
    };
  }

  // ============================================================================
  // TIER MANAGEMENT
  // ============================================================================

  /**
   * Calculate and update trader tier
   */
  async updateTraderTier(traderId: string): Promise<TraderTier> {
    const profile = this.profiles.get(traderId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    // Tier criteria
    let tier: TraderTier = "rising_star";

    if (
      profile.totalTrades >= 100 &&
      profile.winRate >= 0.55 &&
      profile.totalCopiers >= 10
    ) {
      tier = "established";
    }

    if (
      profile.totalTrades >= 500 &&
      profile.winRate >= 0.58 &&
      profile.totalCopiers >= 50 &&
      profile.profitFactor >= 1.5
    ) {
      tier = "expert";
    }

    if (
      profile.totalTrades >= 1000 &&
      profile.winRate >= 0.60 &&
      profile.totalCopiers >= 100 &&
      profile.profitFactor >= 2.0 &&
      profile.rating >= 4.5
    ) {
      tier = "elite";
    }

    if (
      profile.totalTrades >= 2500 &&
      profile.winRate >= 0.65 &&
      profile.totalCopiers >= 500 &&
      profile.profitFactor >= 2.5 &&
      profile.rating >= 4.8 &&
      profile.returnAllTime >= 0.5
    ) {
      tier = "legend";
    }

    profile.tier = tier;
    profile.updatedAt = Date.now();
    this.profiles.set(traderId, profile);

    return tier;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeSampleProfiles(): void {
    const sampleProfiles: Partial<CopyTradingProfile>[] = [
      {
        userId: "trader_1",
        username: "SharpEdge",
        displayName: "Sharp Edge",
        bio: "Professional sports bettor with 10+ years experience. Specializing in NBA and NFL.",
        isAcceptingCopiers: true,
        tier: "elite",
        performanceFee: 15,
        minCopyAmount: 100,
        totalCopiers: 156,
        totalAUM: 250000,
        totalTrades: 1250,
        winRate: 0.62,
        profitFactor: 2.1,
        avgReturn: 0.08,
        followers: 2500,
        rating: 4.8,
        reviewCount: 89,
        tradingStyle: ["value_betting", "sharp_money"],
        preferredMarkets: ["nba", "nfl"],
        riskLevel: "medium",
        avgHoldingTime: "Game duration",
        return30d: 0.12,
        return90d: 0.28,
        return1y: 0.45,
        returnAllTime: 0.85,
        maxDrawdown: 0.15,
      },
      {
        userId: "trader_2",
        username: "ParlayKing",
        displayName: "The Parlay King",
        bio: "High-risk, high-reward parlay specialist. Not for the faint of heart!",
        isAcceptingCopiers: true,
        tier: "expert",
        performanceFee: 20,
        minCopyAmount: 50,
        totalCopiers: 89,
        totalAUM: 75000,
        totalTrades: 850,
        winRate: 0.35,
        profitFactor: 3.2,
        avgReturn: 0.15,
        followers: 1500,
        rating: 4.5,
        reviewCount: 45,
        tradingStyle: ["parlays", "longshots"],
        preferredMarkets: ["nfl", "mlb", "nba"],
        riskLevel: "high",
        avgHoldingTime: "1-4 hours",
        return30d: 0.25,
        return90d: 0.45,
        return1y: 0.78,
        returnAllTime: 1.2,
        maxDrawdown: 0.35,
      },
      {
        userId: "trader_3",
        username: "SteadyEddie",
        displayName: "Steady Eddie",
        bio: "Conservative, consistent returns. Low-risk approach with focus on bankroll management.",
        isAcceptingCopiers: true,
        tier: "established",
        performanceFee: 10,
        minCopyAmount: 25,
        totalCopiers: 245,
        totalAUM: 500000,
        totalTrades: 2100,
        winRate: 0.58,
        profitFactor: 1.8,
        avgReturn: 0.03,
        followers: 3200,
        rating: 4.9,
        reviewCount: 156,
        tradingStyle: ["value_betting", "bankroll_management"],
        preferredMarkets: ["nba", "nfl", "mlb"],
        riskLevel: "low",
        avgHoldingTime: "Game duration",
        return30d: 0.05,
        return90d: 0.12,
        return1y: 0.25,
        returnAllTime: 0.42,
        maxDrawdown: 0.08,
      },
    ];

    for (const profile of sampleProfiles) {
      this.profiles.set(profile.userId!, {
        ...profile,
        createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      } as CopyTradingProfile);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let copyTradingService: CopyTradingService | null = null;

export function getCopyTradingService(): CopyTradingService {
  if (!copyTradingService) {
    copyTradingService = new CopyTradingService();
  }
  return copyTradingService;
}

export function createCopyTradingService(): CopyTradingService {
  return new CopyTradingService();
}
