import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Social Trading Graph - Query Functions
 * Queries for follows, trader profiles, stats, leaderboards, copy trading, and activity feeds
 */

// ============================================================================
// FOLLOW QUERIES
// ============================================================================

/**
 * Get followers for a user
 */
export const getFollowers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_followee", (q) =>
        q.eq("followeeId", args.userId).eq("isActive", true)
      )
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;

    // Fetch follower user data
    const followers = await Promise.all(
      items.map(async (follow) => {
        const user = await ctx.db.get(follow.followerId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", follow.followerId))
          .unique();
        
        return {
          ...follow,
          follower: user,
          traderProfile: profile,
        };
      })
    );

    return {
      followers,
      hasMore,
      nextCursor: hasMore ? items[limit - 1]._id : undefined,
    };
  },
});

/**
 * Get following for a user
 */
export const getFollowing = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) =>
        q.eq("followerId", args.userId).eq("isActive", true)
      )
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;

    // Fetch following user data
    const following = await Promise.all(
      items.map(async (follow) => {
        const user = await ctx.db.get(follow.followeeId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", follow.followeeId))
          .unique();
        
        const stats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) =>
            q.eq("userId", follow.followeeId).eq("period", "all_time")
          )
          .unique();
        
        return {
          ...follow,
          trader: user,
          traderProfile: profile,
          stats,
        };
      })
    );

    return {
      following,
      hasMore,
      nextCursor: hasMore ? items[limit - 1]._id : undefined,
    };
  },
});

/**
 * Check if user is following another user
 */
export const isFollowing = query({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    return {
      isFollowing: !!follow,
      follow,
    };
  },
});

/**
 * Get follower/following counts
 */
export const getFollowCounts = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followee", (q) =>
        q.eq("followeeId", args.userId).eq("isActive", true)
      )
      .collect();

    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) =>
        q.eq("followerId", args.userId).eq("isActive", true)
      )
      .collect();

    return {
      followersCount: followers.length,
      followingCount: following.length,
    };
  },
});

// ============================================================================
// TRADER PROFILE QUERIES
// ============================================================================

/**
 * Get trader profile
 */
export const getTraderProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const reputation = await ctx.db
      .query("reputationScores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const stats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) =>
        q.eq("userId", args.userId).eq("period", "all_time")
      )
      .unique();

    // Get follower counts
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followee", (q) =>
        q.eq("followeeId", args.userId).eq("isActive", true)
      )
      .collect();

    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) =>
        q.eq("followerId", args.userId).eq("isActive", true)
      )
      .collect();

    // Get copier count
    const copiers = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_trader", (q) =>
        q.eq("traderId", args.userId).eq("status", "active")
      )
      .collect();

    return {
      user,
      profile,
      reputation,
      stats,
      followersCount: followers.length,
      followingCount: following.length,
      copiersCount: copiers.length,
    };
  },
});

/**
 * Search traders
 */
export const searchTraders = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    // Search by username/displayName using filter instead of search index
    // Note: For production, consider adding a search index to schema
    const allUsers = await ctx.db
      .query("users")
      .filter((q) => 
        q.or(
          q.like(q.field("displayName"), args.query),
          q.like(q.field("username"), args.query)
        )
      )
      .take(limit);

    // Get trader profiles for found users
    const traders = await Promise.all(
      allUsers.map(async (user) => {
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique();

        const stats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) =>
            q.eq("userId", user._id).eq("period", "all_time")
          )
          .unique();

        const reputation = await ctx.db
          .query("reputationScores")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique();

        return {
          user,
          profile,
          stats,
          reputation,
        };
      })
    );

    // Filter to only public traders
    return traders.filter((t) => t.profile?.isPublic);
  },
});

/**
 * Get trending traders
 */
export const getTrendingTraders = query({
  args: {
    period: v.optional(v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const period = args.period ?? "weekly";
    const limit = args.limit ?? 10;

    // Get traders with best recent performance
    const stats = await ctx.db
      .query("traderStats")
      .withIndex("by_period", (q) => q.eq("period", period))
      .order("desc")
      .take(limit * 5); // Get more to filter

    // Filter to positive PnL and public profiles
    const topStats = stats
      .filter((s) => s.totalPnLPercent > 0)
      .sort((a, b) => b.totalPnLPercent - a.totalPnLPercent)
      .slice(0, limit);

    // Fetch full trader data
    const traders = await Promise.all(
      topStats.map(async (stat) => {
        const user = await ctx.db.get(stat.userId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", stat.userId))
          .unique();

        const reputation = await ctx.db
          .query("reputationScores")
          .withIndex("by_user", (q) => q.eq("userId", stat.userId))
          .unique();

        return {
          user,
          profile,
          stats: stat,
          reputation,
        };
      })
    );

    return traders.filter((t) => t.profile?.isPublic);
  },
});

// ============================================================================
// TRADER STATS QUERIES
// ============================================================================

/**
 * Get trader stats for a specific period
 */
export const getTraderStats = query({
  args: {
    userId: v.id("users"),
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
      v.literal("all_time")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) =>
        q.eq("userId", args.userId).eq("period", args.period)
      )
      .order("desc")
      .first();
  },
});

/**
 * Get trader stats history
 */
export const getTraderStatsHistory = query({
  args: {
    userId: v.id("users"),
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;
    
    return await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) =>
        q.eq("userId", args.userId).eq("period", args.period)
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Get trader reputation
 */
export const getTraderReputation = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reputationScores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

// ============================================================================
// LEADERBOARD QUERIES
// ============================================================================

/**
 * Get leaderboard
 */
export const getLeaderboard = query({
  args: {
    leaderboardType: v.union(
      v.literal("pnl"),
      v.literal("pnl_percent"),
      v.literal("sharpe_ratio"),
      v.literal("win_rate"),
      v.literal("total_trades"),
      v.literal("followers"),
      v.literal("copiers"),
      v.literal("reputation")
    ),
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("all_time")
    ),
    assetClass: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const offset = args.offset ?? 0;

    // Get latest snapshot for this leaderboard type
    const snapshots = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_type_period", (q) =>
        q.eq("leaderboardType", args.leaderboardType).eq("period", args.period)
      )
      .order("desc")
      .take(1);

    if (snapshots.length === 0) {
      return {
        leaderboardType: args.leaderboardType,
        period: args.period,
        entries: [],
        totalParticipants: 0,
      };
    }

    const snapshot = snapshots[0];
    const entries = snapshot.entries.slice(offset, offset + limit);

    return {
      leaderboardType: args.leaderboardType,
      period: args.period,
      assetClass: args.assetClass,
      entries,
      totalParticipants: snapshot.totalParticipants,
      calculatedAt: snapshot.calculatedAt,
    };
  },
});

/**
 * Get my leaderboard rank
 */
export const getMyLeaderboardRank = query({
  args: {
    userId: v.id("users"),
    leaderboardType: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    // Get latest snapshot
    const snapshots = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_type_period", (q) =>
        q.eq("leaderboardType", args.leaderboardType as any).eq("period", args.period as any)
      )
      .order("desc")
      .take(1);

    if (snapshots.length === 0) return null;

    const snapshot = snapshots[0];
    const entry = snapshot.entries.find((e) => e.userId === args.userId);

    return entry ?? null;
  },
});

/**
 * Get leaderboard history for a user
 */
export const getLeaderboardHistory = query({
  args: {
    userId: v.id("users"),
    leaderboardType: v.string(),
    period: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;
    
    return await ctx.db
      .query("userLeaderboardHistory")
      .withIndex("by_user", (q) =>
        q.eq("userId", args.userId)
          .eq("leaderboardType", args.leaderboardType)
          .eq("period", args.period)
      )
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// COPY TRADING QUERIES
// ============================================================================

/**
 * Get copy trading subscriptions (as copier)
 */
export const getCopySubscriptions = query({
  args: {
    copierId: v.id("users"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("cancelled")
    )),
  },
  handler: async (ctx, args) => {
    let subscriptions;

    if (args.status) {
      subscriptions = await ctx.db
        .query("copyTradingSubscriptions")
        .withIndex("by_copier", (q) =>
          q.eq("copierId", args.copierId).eq("status", args.status)
        )
        .collect();
    } else {
      subscriptions = await ctx.db
        .query("copyTradingSubscriptions")
        .withIndex("by_copier", (q) => q.eq("copierId", args.copierId))
        .collect();
    }

    // Fetch trader data
    return await Promise.all(
      subscriptions.map(async (sub) => {
        const trader = await ctx.db.get(sub.traderId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", sub.traderId))
          .unique();

        const stats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) =>
            q.eq("userId", sub.traderId).eq("period", "all_time")
          )
          .unique();

        return {
          ...sub,
          trader,
          traderProfile: profile,
          traderStats: stats,
        };
      })
    );
  },
});

/**
 * Get copiers (as trader being copied)
 */
export const getCopiers = query({
  args: {
    traderId: v.id("users"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("cancelled")
    )),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "active";
    
    const subscriptions = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_trader", (q) =>
        q.eq("traderId", args.traderId).eq("status", status)
      )
      .collect();

    // Fetch copier data
    return await Promise.all(
      subscriptions.map(async (sub) => {
        const copier = await ctx.db.get(sub.copierId);
        return {
          ...sub,
          copier,
        };
      })
    );
  },
});

/**
 * Get copy trades for a subscription
 */
export const getCopyTrades = query({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const trades = await ctx.db
      .query("copyTrades")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .order("desc")
      .take(limit + 1);

    const hasMore = trades.length > limit;
    const items = hasMore ? trades.slice(0, limit) : trades;

    return {
      trades: items,
      hasMore,
      nextCursor: hasMore ? items[limit - 1]._id : undefined,
    };
  },
});

/**
 * Get copy subscription by ID
 */
export const getCopySubscription = query({
  args: { subscriptionId: v.id("copyTradingSubscriptions") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return null;

    const trader = await ctx.db.get(subscription.traderId);
    const copier = await ctx.db.get(subscription.copierId);

    return {
      ...subscription,
      trader,
      copier,
    };
  },
});

// ============================================================================
// ACTIVITY FEED QUERIES
// ============================================================================

/**
 * Get activity feed
 */
export const getActivityFeed = query({
  args: {
    userId: v.id("users"),
    feedType: v.union(
      v.literal("following"),
      v.literal("discover"),
      v.literal("notifications")
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const feedItems = await ctx.db
      .query("userFeedCache")
      .withIndex("by_user_feed", (q) =>
        q.eq("userId", args.userId).eq("feedType", args.feedType)
      )
      .order("desc")
      .take(limit + 1);

    const hasMore = feedItems.length > limit;
    const items = hasMore ? feedItems.slice(0, limit) : feedItems;

    return {
      items,
      hasMore,
      nextCursor: hasMore ? items[limit - 1]._id : undefined,
    };
  },
});

/**
 * Get notifications
 */
export const getNotifications = query({
  args: {
    userId: v.id("users"),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    let query = ctx.db
      .query("userFeedCache")
      .withIndex("by_user_feed", (q) =>
        q.eq("userId", args.userId).eq("feedType", "notifications")
      );

    if (args.unreadOnly) {
      query = ctx.db
        .query("userFeedCache")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", args.userId)
            .eq("feedType", "notifications")
            .eq("isRead", false)
        );
    }

    const items = await query.order("desc").take(limit);

    // Count unread
    const unread = await ctx.db
      .query("userFeedCache")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", args.userId)
          .eq("feedType", "notifications")
          .eq("isRead", false)
      )
      .collect();

    return {
      items,
      unreadCount: unread.length,
    };
  },
});

// ============================================================================
// POSITION COMMENTS QUERIES
// ============================================================================

/**
 * Get comments for a position
 */
export const getPositionComments = query({
  args: {
    positionId: v.id("positions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const comments = await ctx.db
      .query("positionComments")
      .withIndex("by_position", (q) =>
        q.eq("positionId", args.positionId).eq("isDeleted", false)
      )
      .order("desc")
      .take(limit);

    // Fetch author data
    return await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        
        // Get like count
        const likes = await ctx.db
          .query("commentLikes")
          .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
          .collect();

        return {
          ...comment,
          author,
          likesCount: likes.length,
        };
      })
    );
  },
});

/**
 * Get comments for an order
 */
export const getOrderComments = query({
  args: {
    orderId: v.id("orders"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const comments = await ctx.db
      .query("positionComments")
      .withIndex("by_order", (q) =>
        q.eq("orderId", args.orderId).eq("isDeleted", false)
      )
      .order("desc")
      .take(limit);

    // Fetch author data
    return await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        
        const likes = await ctx.db
          .query("commentLikes")
          .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
          .collect();

        return {
          ...comment,
          author,
          likesCount: likes.length,
        };
      })
    );
  },
});

/**
 * Check if user liked a comment
 */
export const hasLikedComment = query({
  args: {
    commentId: v.id("positionComments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const like = await ctx.db
      .query("commentLikes")
      .withIndex("by_pair", (q) =>
        q.eq("commentId", args.commentId).eq("userId", args.userId)
      )
      .unique();

    return !!like;
  },
});

// ============================================================================
// FRAUD DETECTION QUERIES
// ============================================================================

/**
 * Get fraud alerts for a user
 */
export const getFraudAlerts = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("investigating"),
      v.literal("confirmed"),
      v.literal("dismissed"),
      v.literal("resolved")
    )),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("fraudAlerts");

    if (args.status) {
      query = query.withIndex("by_user", (q) =>
        q.eq("userId", args.userId).eq("status", args.status)
      );
    } else {
      query = query.withIndex("by_user", (q) => q.eq("userId", args.userId));
    }

    return await query.order("desc").take(100);
  },
});

/**
 * Get trading patterns for a user
 */
export const getTradingPatterns = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tradingPatterns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
  },
});
