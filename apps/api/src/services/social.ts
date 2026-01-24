/**
 * Social Trading Services for PULL API
 * Service layer for social trading graph features
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db";

const convexUrl = process.env.CONVEX_URL || "";
const convex = new ConvexHttpClient(convexUrl);

// ============================================================================
// SOCIAL GRAPH SERVICE
// ============================================================================

export class SocialGraphService {
  /**
   * Follow a trader
   */
  async follow(params: {
    followerId: string;
    followeeId: string;
    notificationsEnabled?: boolean;
    positionVisibility?: "all" | "entry_only" | "none";
  }) {
    return await convex.mutation(api.social.mutations.follow, {
      followerId: params.followerId as any,
      followeeId: params.followeeId as any,
      notificationsEnabled: params.notificationsEnabled,
      positionVisibility: params.positionVisibility,
    });
  }

  /**
   * Unfollow a trader
   */
  async unfollow(params: {
    followerId: string;
    followeeId: string;
  }) {
    return await convex.mutation(api.social.mutations.unfollow, {
      followerId: params.followerId as any,
      followeeId: params.followeeId as any,
    });
  }

  /**
   * Update follow settings
   */
  async updateFollowSettings(params: {
    followerId: string;
    followeeId: string;
    notificationsEnabled?: boolean;
    positionVisibility?: "all" | "entry_only" | "none";
  }) {
    return await convex.mutation(api.social.mutations.updateFollowSettings, {
      followerId: params.followerId as any,
      followeeId: params.followeeId as any,
      notificationsEnabled: params.notificationsEnabled,
      positionVisibility: params.positionVisibility,
    });
  }

  /**
   * Get followers for a user
   */
  async getFollowers(params: {
    userId: string;
    limit?: number;
    cursor?: string;
  }) {
    return await convex.query(api.social.queries.getFollowers, {
      userId: params.userId as any,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Get following for a user
   */
  async getFollowing(params: {
    userId: string;
    limit?: number;
    cursor?: string;
  }) {
    return await convex.query(api.social.queries.getFollowing, {
      userId: params.userId as any,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Check if following
   */
  async isFollowing(params: {
    followerId: string;
    followeeId: string;
  }) {
    return await convex.query(api.social.queries.isFollowing, {
      followerId: params.followerId as any,
      followeeId: params.followeeId as any,
    });
  }

  /**
   * Get follower/following counts
   */
  async getFollowCounts(userId: string) {
    return await convex.query(api.social.queries.getFollowCounts, {
      userId: userId as any,
    });
  }

  /**
   * Get activity feed
   */
  async getActivityFeed(params: {
    userId: string;
    feedType: "following" | "discover" | "notifications";
    limit?: number;
    cursor?: string;
  }) {
    return await convex.query(api.social.queries.getActivityFeed, {
      userId: params.userId as any,
      feedType: params.feedType,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Get notifications
   */
  async getNotifications(params: {
    userId: string;
    unreadOnly?: boolean;
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getNotifications, {
      userId: params.userId as any,
      unreadOnly: params.unreadOnly,
      limit: params.limit,
    });
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsRead(params: {
    userId: string;
    itemIds?: string[];
    all?: boolean;
  }) {
    return await convex.mutation(api.social.mutations.markNotificationsRead, {
      userId: params.userId as any,
      itemIds: params.itemIds as any,
      all: params.all,
    });
  }
}

// ============================================================================
// TRADER STATS SERVICE
// ============================================================================

export class TraderStatsService {
  /**
   * Get trader profile
   */
  async getTraderProfile(userId: string) {
    return await convex.query(api.social.queries.getTraderProfile, {
      userId: userId as any,
    });
  }

  /**
   * Update trader profile
   */
  async updateTraderProfile(params: {
    userId: string;
    isPublic?: boolean;
    allowCopyTrading?: boolean;
    allowAutoCopy?: boolean;
    copyTradingFee?: number;
    performanceFee?: number;
    bio?: string;
    tradingStyle?: string;
    tradingPhilosophy?: string;
    riskProfile?: "conservative" | "moderate" | "aggressive" | "very_aggressive";
    preferredAssets?: string[];
    twitterHandle?: string;
    discordHandle?: string;
    telegramHandle?: string;
    websiteUrl?: string;
  }) {
    return await convex.mutation(api.social.mutations.upsertTraderProfile, {
      userId: params.userId as any,
      isPublic: params.isPublic,
      allowCopyTrading: params.allowCopyTrading,
      allowAutoCopy: params.allowAutoCopy,
      copyTradingFee: params.copyTradingFee,
      performanceFee: params.performanceFee,
      bio: params.bio,
      tradingStyle: params.tradingStyle,
      tradingPhilosophy: params.tradingPhilosophy,
      riskProfile: params.riskProfile,
      preferredAssets: params.preferredAssets,
      twitterHandle: params.twitterHandle,
      discordHandle: params.discordHandle,
      telegramHandle: params.telegramHandle,
      websiteUrl: params.websiteUrl,
    });
  }

  /**
   * Get trader stats
   */
  async getTraderStats(params: {
    userId: string;
    period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";
  }) {
    return await convex.query(api.social.queries.getTraderStats, {
      userId: params.userId as any,
      period: params.period,
    });
  }

  /**
   * Get trader stats history
   */
  async getTraderStatsHistory(params: {
    userId: string;
    period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getTraderStatsHistory, {
      userId: params.userId as any,
      period: params.period,
      limit: params.limit,
    });
  }

  /**
   * Get trader reputation
   */
  async getTraderReputation(userId: string) {
    return await convex.query(api.social.queries.getTraderReputation, {
      userId: userId as any,
    });
  }

  /**
   * Search traders
   */
  async searchTraders(params: {
    query: string;
    limit?: number;
  }) {
    return await convex.query(api.social.queries.searchTraders, {
      query: params.query,
      limit: params.limit,
    });
  }

  /**
   * Get trending traders
   */
  async getTrendingTraders(params?: {
    period?: "daily" | "weekly" | "monthly";
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getTrendingTraders, {
      period: params?.period,
      limit: params?.limit,
    });
  }
}

// ============================================================================
// COPY TRADING SERVICE
// ============================================================================

export class CopyTradingService {
  /**
   * Create copy trading subscription
   */
  async createSubscription(params: {
    copierId: string;
    traderId: string;
    copyMode: "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";
    fixedAmount?: number;
    portfolioPercentage?: number;
    copyRatio?: number;
    maxPositionSize: number;
    maxDailyLoss: number;
    maxTotalExposure: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
    copyAssetClasses: string[];
    excludedSymbols?: string[];
    copyDelaySeconds?: number;
  }) {
    return await convex.mutation(api.social.mutations.createCopySubscription, {
      copierId: params.copierId as any,
      traderId: params.traderId as any,
      copyMode: params.copyMode,
      fixedAmount: params.fixedAmount,
      portfolioPercentage: params.portfolioPercentage,
      copyRatio: params.copyRatio,
      maxPositionSize: params.maxPositionSize,
      maxDailyLoss: params.maxDailyLoss,
      maxTotalExposure: params.maxTotalExposure,
      stopLossPercent: params.stopLossPercent,
      takeProfitPercent: params.takeProfitPercent,
      copyAssetClasses: params.copyAssetClasses,
      excludedSymbols: params.excludedSymbols,
      copyDelaySeconds: params.copyDelaySeconds,
    });
  }

  /**
   * Update copy trading subscription
   */
  async updateSubscription(
    subscriptionId: string,
    params: {
      copyMode?: "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";
      fixedAmount?: number;
      portfolioPercentage?: number;
      copyRatio?: number;
      maxPositionSize?: number;
      maxDailyLoss?: number;
      maxTotalExposure?: number;
      stopLossPercent?: number;
      takeProfitPercent?: number;
      copyAssetClasses?: string[];
      excludedSymbols?: string[];
      copyDelaySeconds?: number;
    }
  ) {
    return await convex.mutation(api.social.mutations.updateCopySubscription, {
      subscriptionId: subscriptionId as any,
      ...params,
    });
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(subscriptionId: string) {
    return await convex.mutation(api.social.mutations.pauseCopySubscription, {
      subscriptionId: subscriptionId as any,
    });
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(subscriptionId: string) {
    return await convex.mutation(api.social.mutations.resumeCopySubscription, {
      subscriptionId: subscriptionId as any,
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    return await convex.mutation(api.social.mutations.cancelCopySubscription, {
      subscriptionId: subscriptionId as any,
    });
  }

  /**
   * Get subscriptions (as copier)
   */
  async getSubscriptions(params: {
    copierId: string;
    status?: "pending" | "active" | "paused" | "stopped" | "cancelled";
  }) {
    return await convex.query(api.social.queries.getCopySubscriptions, {
      copierId: params.copierId as any,
      status: params.status,
    });
  }

  /**
   * Get copiers (as trader)
   */
  async getCopiers(params: {
    traderId: string;
    status?: "pending" | "active" | "paused" | "stopped" | "cancelled";
  }) {
    return await convex.query(api.social.queries.getCopiers, {
      traderId: params.traderId as any,
      status: params.status,
    });
  }

  /**
   * Get copy trades
   */
  async getCopyTrades(params: {
    subscriptionId: string;
    limit?: number;
    cursor?: string;
  }) {
    return await convex.query(api.social.queries.getCopyTrades, {
      subscriptionId: params.subscriptionId as any,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string) {
    return await convex.query(api.social.queries.getCopySubscription, {
      subscriptionId: subscriptionId as any,
    });
  }
}

// ============================================================================
// LEADERBOARD SERVICE
// ============================================================================

export class LeaderboardService {
  /**
   * Get leaderboard
   */
  async getLeaderboard(params: {
    leaderboardType:
      | "pnl"
      | "pnl_percent"
      | "sharpe_ratio"
      | "win_rate"
      | "total_trades"
      | "followers"
      | "copiers"
      | "reputation";
    period: "daily" | "weekly" | "monthly" | "all_time";
    assetClass?: string;
    limit?: number;
    offset?: number;
  }) {
    return await convex.query(api.social.queries.getLeaderboard, {
      leaderboardType: params.leaderboardType,
      period: params.period,
      assetClass: params.assetClass,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * Get my leaderboard rank
   */
  async getMyRank(params: {
    userId: string;
    leaderboardType: string;
    period: string;
  }) {
    return await convex.query(api.social.queries.getMyLeaderboardRank, {
      userId: params.userId as any,
      leaderboardType: params.leaderboardType,
      period: params.period,
    });
  }

  /**
   * Get leaderboard history
   */
  async getLeaderboardHistory(params: {
    userId: string;
    leaderboardType: string;
    period: string;
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getLeaderboardHistory, {
      userId: params.userId as any,
      leaderboardType: params.leaderboardType,
      period: params.period,
      limit: params.limit,
    });
  }
}

// ============================================================================
// POSITION COMMENTS SERVICE
// ============================================================================

export class PositionCommentsService {
  /**
   * Create comment
   */
  async createComment(params: {
    authorId: string;
    traderId: string;
    positionId?: string;
    orderId?: string;
    tradeId?: string;
    content: string;
    contentType?: "text" | "analysis" | "thesis" | "update" | "exit_rationale";
    parentCommentId?: string;
  }) {
    return await convex.mutation(api.social.mutations.createComment, {
      authorId: params.authorId as any,
      traderId: params.traderId as any,
      positionId: params.positionId as any,
      orderId: params.orderId as any,
      tradeId: params.tradeId as any,
      content: params.content,
      contentType: params.contentType,
      parentCommentId: params.parentCommentId as any,
    });
  }

  /**
   * Like comment
   */
  async likeComment(params: {
    commentId: string;
    userId: string;
  }) {
    return await convex.mutation(api.social.mutations.likeComment, {
      commentId: params.commentId as any,
      userId: params.userId as any,
    });
  }

  /**
   * Unlike comment
   */
  async unlikeComment(params: {
    commentId: string;
    userId: string;
  }) {
    return await convex.mutation(api.social.mutations.unlikeComment, {
      commentId: params.commentId as any,
      userId: params.userId as any,
    });
  }

  /**
   * Delete comment
   */
  async deleteComment(params: {
    commentId: string;
    userId: string;
  }) {
    return await convex.mutation(api.social.mutations.deleteComment, {
      commentId: params.commentId as any,
      userId: params.userId as any,
    });
  }

  /**
   * Get position comments
   */
  async getPositionComments(params: {
    positionId: string;
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getPositionComments, {
      positionId: params.positionId as any,
      limit: params.limit,
    });
  }

  /**
   * Get order comments
   */
  async getOrderComments(params: {
    orderId: string;
    limit?: number;
  }) {
    return await convex.query(api.social.queries.getOrderComments, {
      orderId: params.orderId as any,
      limit: params.limit,
    });
  }

  /**
   * Check if user liked comment
   */
  async hasLikedComment(params: {
    commentId: string;
    userId: string;
  }) {
    return await convex.query(api.social.queries.hasLikedComment, {
      commentId: params.commentId as any,
      userId: params.userId as any,
    });
  }
}

// ============================================================================
// REPUTATION SERVICE
// ============================================================================

export class ReputationService {
  /**
   * Get trader reputation
   */
  async getReputation(userId: string) {
    return await convex.query(api.social.queries.getTraderReputation, {
      userId: userId as any,
    });
  }

  /**
   * Get fraud alerts
   */
  async getFraudAlerts(params: {
    userId: string;
    status?: "pending" | "investigating" | "confirmed" | "dismissed" | "resolved";
  }) {
    return await convex.query(api.social.queries.getFraudAlerts, {
      userId: params.userId as any,
      status: params.status,
    });
  }

  /**
   * Get trading patterns
   */
  async getTradingPatterns(userId: string) {
    return await convex.query(api.social.queries.getTradingPatterns, {
      userId: userId as any,
    });
  }
}

// Export service instances
export const socialGraphService = new SocialGraphService();
export const traderStatsService = new TraderStatsService();
export const copyTradingService = new CopyTradingService();
export const leaderboardService = new LeaderboardService();
export const positionCommentsService = new PositionCommentsService();
export const reputationService = new ReputationService();
