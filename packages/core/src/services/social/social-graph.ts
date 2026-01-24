/**
 * Social Graph Service
 * Handles follow/unfollow relationships, activity feeds, and social discovery
 */

import type {
  Follow,
  FollowWithDetails,
  UserSummary,
  SocialActivity,
  FeedItem,
  FeedQuery,
  SocialActivityType,
  ActivityVisibility,
  TraderSearchFilters,
  TraderSearchResult,
  TraderRecommendation,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface SocialGraphServiceConfig {
  maxFollowsPerUser: number;
  activityFeedLimit: number;
  recommendationLimit: number;
  feedCacheTTL: number;
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

const DEFAULT_CONFIG: SocialGraphServiceConfig = {
  maxFollowsPerUser: 1000,
  activityFeedLimit: 100,
  recommendationLimit: 20,
  feedCacheTTL: 300000, // 5 minutes
};

// ============================================================================
// Social Graph Service
// ============================================================================

export class SocialGraphService {
  private readonly config: SocialGraphServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<SocialGraphServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[SocialGraph] ${msg}`, meta),
      info: (msg, meta) => console.info(`[SocialGraph] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[SocialGraph] ${msg}`, meta),
      error: (msg, meta) => console.error(`[SocialGraph] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Follow/Unfollow Operations
  // ==========================================================================

  /**
   * Follow a trader
   */
  async followTrader(
    followerId: string,
    followeeId: string,
    options?: {
      notificationsEnabled?: boolean;
      positionVisibility?: "all" | "entry_only" | "none";
    }
  ): Promise<Follow> {
    // Validate not following self
    if (followerId === followeeId) {
      throw new SocialGraphError("Cannot follow yourself", "SELF_FOLLOW_NOT_ALLOWED");
    }

    // Check existing follow
    const existingFollow = await this.db.query<Follow | null>("follows:getByPair", {
      followerId,
      followeeId,
    });

    if (existingFollow?.isActive) {
      throw new SocialGraphError("Already following this trader", "ALREADY_FOLLOWING");
    }

    // Check follow limit
    const followCount = await this.db.query<number>("follows:countByFollower", {
      followerId,
      isActive: true,
    });

    if (followCount >= this.config.maxFollowsPerUser) {
      throw new SocialGraphError(
        `Cannot follow more than ${this.config.maxFollowsPerUser} traders`,
        "MAX_FOLLOWS_EXCEEDED"
      );
    }

    // Create or reactivate follow
    const now = Date.now();
    const follow = await this.db.mutation<Follow>("follows:upsert", {
      followerId,
      followeeId,
      notificationsEnabled: options?.notificationsEnabled ?? true,
      positionVisibility: options?.positionVisibility ?? "all",
      followedAt: now,
      isActive: true,
    });

    // Create activity
    await this.createActivity({
      actorId: followerId,
      type: "follow",
      targetType: "user",
      targetId: followeeId,
      data: { followeeId },
      visibility: "followers",
      relatedUserIds: [followeeId],
    });

    // Update follower/following counts
    await this.updateFollowCounts(followerId, followeeId);

    this.logger.info("User followed trader", { followerId, followeeId });
    return follow;
  }

  /**
   * Unfollow a trader
   */
  async unfollowTrader(followerId: string, followeeId: string): Promise<void> {
    const follow = await this.db.query<Follow | null>("follows:getByPair", {
      followerId,
      followeeId,
    });

    if (!follow?.isActive) {
      throw new SocialGraphError("Not following this trader", "NOT_FOLLOWING");
    }

    await this.db.mutation("follows:update", {
      id: follow.id,
      isActive: false,
      unfollowedAt: Date.now(),
    });

    // Update follower/following counts
    await this.updateFollowCounts(followerId, followeeId);

    this.logger.info("User unfollowed trader", { followerId, followeeId });
  }

  /**
   * Update follow settings
   */
  async updateFollowSettings(
    followerId: string,
    followeeId: string,
    settings: {
      notificationsEnabled?: boolean;
      positionVisibility?: "all" | "entry_only" | "none";
    }
  ): Promise<Follow> {
    const follow = await this.db.query<Follow | null>("follows:getByPair", {
      followerId,
      followeeId,
    });

    if (!follow?.isActive) {
      throw new SocialGraphError("Not following this trader", "NOT_FOLLOWING");
    }

    return await this.db.mutation<Follow>("follows:update", {
      id: follow.id,
      ...settings,
    });
  }

  /**
   * Check if user is following another user
   */
  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const follow = await this.db.query<Follow | null>("follows:getByPair", {
      followerId,
      followeeId,
    });
    return follow?.isActive ?? false;
  }

  /**
   * Get followers of a user
   */
  async getFollowers(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ followers: FollowWithDetails[]; cursor?: string }> {
    return await this.db.query("follows:getFollowers", {
      userId,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Get users that a user is following
   */
  async getFollowing(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ following: FollowWithDetails[]; cursor?: string }> {
    return await this.db.query("follows:getFollowing", {
      userId,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Get follow counts for a user
   */
  async getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
    const [followers, following] = await Promise.all([
      this.db.query<number>("follows:countByFollowee", { userId, isActive: true }),
      this.db.query<number>("follows:countByFollower", { userId, isActive: true }),
    ]);
    return { followers, following };
  }

  private async updateFollowCounts(followerId: string, followeeId: string): Promise<void> {
    // Update follower count for followee
    const followerCount = await this.db.query<number>("follows:countByFollowee", {
      userId: followeeId,
      isActive: true,
    });
    await this.db.mutation("traderProfiles:updateCounts", {
      userId: followeeId,
      followersCount: followerCount,
    });

    // Update following count for follower
    const followingCount = await this.db.query<number>("follows:countByFollower", {
      userId: followerId,
      isActive: true,
    });
    await this.db.mutation("traderProfiles:updateCounts", {
      userId: followerId,
      followingCount: followingCount,
    });
  }

  // ==========================================================================
  // Activity Feed Operations
  // ==========================================================================

  /**
   * Create a social activity
   */
  async createActivity(activity: {
    actorId: string;
    type: SocialActivityType;
    targetType?: string;
    targetId?: string;
    data: unknown;
    visibility: ActivityVisibility;
    relatedUserIds: string[];
    expiresAt?: number;
  }): Promise<SocialActivity> {
    const now = Date.now();

    const created = await this.db.mutation<SocialActivity>("socialActivity:create", {
      ...activity,
      createdAt: now,
    });

    // Fan out to followers' feeds if visibility allows
    if (activity.visibility !== "private") {
      await this.fanOutToFeeds(created);
    }

    return created;
  }

  /**
   * Fan out activity to followers' feeds
   */
  private async fanOutToFeeds(activity: SocialActivity): Promise<void> {
    // Get followers
    const { followers } = await this.getFollowers(activity.actorId, { limit: 1000 });

    // Create feed items for each follower
    const feedItems = followers.map((f) => ({
      userId: f.followerId,
      activityId: activity.id,
      actorId: activity.actorId,
      feedType: "following" as const,
      type: activity.type,
      data: activity.data,
      isRead: false,
      activityAt: activity.createdAt.getTime(),
      cachedAt: Date.now(),
    }));

    // Batch insert
    if (feedItems.length > 0) {
      await this.db.mutation("userFeedCache:batchInsert", { items: feedItems });
    }

    // Also add to related users' notification feeds
    const notificationItems = activity.relatedUserIds
      .filter((id) => id !== activity.actorId)
      .map((userId) => ({
        userId,
        activityId: activity.id,
        actorId: activity.actorId,
        feedType: "notifications" as const,
        type: activity.type,
        data: activity.data,
        isRead: false,
        activityAt: activity.createdAt.getTime(),
        cachedAt: Date.now(),
      }));

    if (notificationItems.length > 0) {
      await this.db.mutation("userFeedCache:batchInsert", { items: notificationItems });
    }
  }

  /**
   * Get user's feed
   */
  async getFeed(userId: string, query: FeedQuery): Promise<{
    items: FeedItem[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 20;

    const result = await this.db.query<{
      items: FeedItem[];
      cursor?: string;
    }>("userFeedCache:getFeed", {
      userId,
      feedType: query.feedType,
      limit: limit + 1, // Fetch one extra to check hasMore
      cursor: query.cursor,
      unreadOnly: query.unreadOnly,
    });

    const hasMore = result.items.length > limit;
    const items = hasMore ? result.items.slice(0, limit) : result.items;

    // Enrich with actor details
    const enrichedItems = await this.enrichFeedItems(items);

    return {
      items: enrichedItems,
      cursor: result.cursor,
      hasMore,
    };
  }

  /**
   * Mark feed items as read
   */
  async markAsRead(userId: string, itemIds: string[]): Promise<void> {
    await this.db.mutation("userFeedCache:markAsRead", {
      userId,
      itemIds,
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await this.db.query<number>("userFeedCache:countUnread", {
      userId,
      feedType: "notifications",
    });
  }

  private async enrichFeedItems(items: FeedItem[]): Promise<FeedItem[]> {
    const actorIds = [...new Set(items.map((i) => i.actorId))];
    const actors = await this.db.query<UserSummary[]>("users:getBySummary", {
      userIds: actorIds,
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return items.map((item) => ({
      ...item,
      actor: actorMap.get(item.actorId),
    }));
  }

  // ==========================================================================
  // Discovery & Recommendations
  // ==========================================================================

  /**
   * Search for traders
   */
  async searchTraders(
    userId: string,
    filters: TraderSearchFilters,
    options?: { limit?: number; offset?: number }
  ): Promise<TraderSearchResult[]> {
    const results = await this.db.query<TraderSearchResult[]>("traderProfiles:search", {
      userId,
      filters,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
    });

    return results;
  }

  /**
   * Get recommended traders for a user
   */
  async getRecommendedTraders(
    userId: string,
    options?: { limit?: number }
  ): Promise<TraderRecommendation[]> {
    const limit = options?.limit ?? this.config.recommendationLimit;

    // Get user's current follows
    const { following } = await this.getFollowing(userId, { limit: 100 });
    const followingIds = new Set(following.map((f) => f.followeeId));

    // Strategy 1: Traders followed by people you follow
    const followersOfFollowing = await this.db.query<TraderRecommendation[]>(
      "recommendations:followersOfFollowing",
      {
        userId,
        followingIds: Array.from(followingIds),
        limit: Math.ceil(limit / 2),
      }
    );

    // Strategy 2: Top performing traders not yet followed
    const topPerformers = await this.db.query<TraderRecommendation[]>(
      "recommendations:topPerformers",
      {
        userId,
        excludeIds: Array.from(followingIds),
        limit: Math.ceil(limit / 2),
      }
    );

    // Merge and deduplicate
    const seen = new Set<string>();
    const recommendations: TraderRecommendation[] = [];

    for (const rec of [...followersOfFollowing, ...topPerformers]) {
      if (!seen.has(rec.trader.userId) && rec.trader.userId !== userId) {
        seen.add(rec.trader.userId);
        recommendations.push(rec);
      }
      if (recommendations.length >= limit) break;
    }

    return recommendations;
  }

  /**
   * Get trending traders (most followed recently)
   */
  async getTrendingTraders(options?: {
    period?: "day" | "week" | "month";
    limit?: number;
  }): Promise<UserSummary[]> {
    const period = options?.period ?? "week";
    const limit = options?.limit ?? 10;

    const periodMs =
      period === "day"
        ? 24 * 60 * 60 * 1000
        : period === "week"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

    const since = Date.now() - periodMs;

    return await this.db.query<UserSummary[]>("follows:getTrending", {
      since,
      limit,
    });
  }

  /**
   * Get mutual connections between two users
   */
  async getMutualConnections(
    userId1: string,
    userId2: string,
    options?: { limit?: number }
  ): Promise<UserSummary[]> {
    return await this.db.query<UserSummary[]>("follows:getMutual", {
      userId1,
      userId2,
      limit: options?.limit ?? 10,
    });
  }

  // ==========================================================================
  // Position Sharing & Visibility
  // ==========================================================================

  /**
   * Check if user can view another user's positions
   */
  async canViewPositions(
    viewerId: string,
    traderId: string
  ): Promise<{ canView: boolean; visibility: "all" | "entry_only" | "none" }> {
    // Check if viewer is following trader
    const follow = await this.db.query<Follow | null>("follows:getByPair", {
      followerId: viewerId,
      followeeId: traderId,
    });

    if (!follow?.isActive) {
      // Check if trader's profile is public
      const profile = await this.db.query<{ isPublic: boolean } | null>("traderProfiles:get", {
        userId: traderId,
      });

      if (!profile?.isPublic) {
        return { canView: false, visibility: "none" };
      }

      // Public profile, but limited visibility for non-followers
      return { canView: true, visibility: "entry_only" };
    }

    return { canView: true, visibility: follow.positionVisibility };
  }

  /**
   * Get positions of traders a user follows (for feed)
   */
  async getFollowedTradersPositions(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{
    positions: Array<{
      traderId: string;
      trader: UserSummary;
      positions: Array<{
        id: string;
        symbol: string;
        side: "long" | "short";
        quantity: number;
        entryPrice?: number;
        currentPrice: number;
        pnl: number;
        pnlPercent: number;
        openedAt: Date;
      }>;
    }>;
    cursor?: string;
  }> {
    return await this.db.query("socialPositions:getFollowedPositions", {
      userId,
      limit: options?.limit ?? 20,
      cursor: options?.cursor,
    });
  }
}

// ============================================================================
// Errors
// ============================================================================

export class SocialGraphError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "SocialGraphError";
  }
}

export default SocialGraphService;
