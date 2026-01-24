import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Social Trading Queries and Mutations
 * Functions for social graph, copy trading, leaderboards, and trading rooms
 */

// ============================================================================
// FOLLOW/UNFOLLOW QUERIES
// ============================================================================

/**
 * Get followers for a trader
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
      .take(limit);

    const followers = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followerId);
        return {
          userId: follow.followerId,
          username: user?.username,
          displayName: user?.displayName,
          avatarUrl: user?.avatarUrl,
          followedAt: follow.followedAt,
          notificationsEnabled: follow.notificationsEnabled,
          positionVisibility: follow.positionVisibility,
        };
      })
    );

    return {
      followers,
      total: follows.length,
    };
  },
});

/**
 * Get traders a user is following
 */
export const getFollowing = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) =>
        q.eq("followerId", args.userId).eq("isActive", true)
      )
      .take(limit);

    const following = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followeeId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", follow.followeeId))
          .unique();

        return {
          userId: follow.followeeId,
          username: user?.username,
          displayName: user?.displayName,
          avatarUrl: user?.avatarUrl,
          followedAt: follow.followedAt,
          notificationsEnabled: follow.notificationsEnabled,
          positionVisibility: follow.positionVisibility,
          isPublic: profile?.isPublic ?? false,
          allowCopyTrading: profile?.allowCopyTrading ?? false,
        };
      })
    );

    return {
      following,
      total: follows.length,
    };
  },
});

/**
 * Check if user is following a trader
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
      follow: follow
        ? {
            notificationsEnabled: follow.notificationsEnabled,
            positionVisibility: follow.positionVisibility,
            followedAt: follow.followedAt,
          }
        : null,
    };
  },
});

// ============================================================================
// FOLLOW/UNFOLLOW MUTATIONS
// ============================================================================

/**
 * Follow a trader
 */
export const follow = mutation({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
    notificationsEnabled: v.optional(v.boolean()),
    positionVisibility: v.optional(
      v.union(v.literal("all"), v.literal("entry_only"), v.literal("none"))
    ),
  },
  handler: async (ctx, args) => {
    // Cannot follow yourself
    if (args.followerId === args.followeeId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if already following
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .unique();

    if (existing?.isActive) {
      throw new Error("Already following this trader");
    }

    const now = Date.now();

    if (existing && !existing.isActive) {
      // Reactivate existing follow
      await ctx.db.patch(existing._id, {
        isActive: true,
        followedAt: now,
        unfollowedAt: undefined,
        notificationsEnabled: args.notificationsEnabled ?? true,
        positionVisibility: args.positionVisibility ?? "all",
      });
      return existing._id;
    }

    // Create new follow
    const followId = await ctx.db.insert("follows", {
      followerId: args.followerId,
      followeeId: args.followeeId,
      notificationsEnabled: args.notificationsEnabled ?? true,
      positionVisibility: args.positionVisibility ?? "all",
      followedAt: now,
      isActive: true,
    });

    // Create activity feed item
    await ctx.db.insert("socialActivity", {
      actorId: args.followerId,
      type: "follow",
      targetType: "user",
      targetId: args.followeeId,
      data: {
        followeeId: args.followeeId,
      },
      visibility: "public",
      relatedUserIds: [args.followeeId],
      createdAt: now,
    });

    return followId;
  },
});

/**
 * Unfollow a trader
 */
export const unfollow = mutation({
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

    if (!follow) {
      throw new Error("Not following this trader");
    }

    await ctx.db.patch(follow._id, {
      isActive: false,
      unfollowedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update follow settings
 */
export const updateFollowSettings = mutation({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
    notificationsEnabled: v.optional(v.boolean()),
    positionVisibility: v.optional(
      v.union(v.literal("all"), v.literal("entry_only"), v.literal("none"))
    ),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    if (!follow) {
      throw new Error("Not following this trader");
    }

    const updates: Record<string, unknown> = {};
    if (args.notificationsEnabled !== undefined) {
      updates.notificationsEnabled = args.notificationsEnabled;
    }
    if (args.positionVisibility !== undefined) {
      updates.positionVisibility = args.positionVisibility;
    }

    await ctx.db.patch(follow._id, updates);

    return { success: true };
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
    const profile = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    return profile;
  },
});

/**
 * Get trader stats
 */
export const getTraderStats = query({
  args: {
    userId: v.id("users"),
    period: v.optional(
      v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("yearly"),
        v.literal("all_time")
      )
    ),
  },
  handler: async (ctx, args) => {
    const period = args.period ?? "all_time";

    const stats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId).eq("period", period))
      .order("desc")
      .first();

    return stats;
  },
});

/**
 * Get trader reputation
 */
export const getTraderReputation = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const reputation = await ctx.db
      .query("reputationScores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    return reputation;
  },
});

// ============================================================================
// TRADER PROFILE MUTATIONS
// ============================================================================

/**
 * Create or update trader profile
 */
export const upsertTraderProfile = mutation({
  args: {
    userId: v.id("users"),
    isPublic: v.optional(v.boolean()),
    allowCopyTrading: v.optional(v.boolean()),
    allowAutoCopy: v.optional(v.boolean()),
    copyTradingFee: v.optional(v.number()),
    performanceFee: v.optional(v.number()),
    bio: v.optional(v.string()),
    tradingStyle: v.optional(v.string()),
    tradingPhilosophy: v.optional(v.string()),
    riskProfile: v.optional(
      v.union(
        v.literal("conservative"),
        v.literal("moderate"),
        v.literal("aggressive"),
        v.literal("very_aggressive")
      )
    ),
    preferredAssets: v.optional(v.array(v.string())),
    twitterHandle: v.optional(v.string()),
    discordHandle: v.optional(v.string()),
    telegramHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();

    if (existing) {
      // Update existing profile
      const updates: Record<string, unknown> = { updatedAt: now };
      Object.keys(args).forEach((key) => {
        if (key !== "userId" && args[key as keyof typeof args] !== undefined) {
          updates[key] = args[key as keyof typeof args];
        }
      });

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Create new profile
    const profileId = await ctx.db.insert("traderProfiles", {
      userId: args.userId,
      isPublic: args.isPublic ?? false,
      allowCopyTrading: args.allowCopyTrading ?? false,
      allowAutoCopy: args.allowAutoCopy ?? false,
      copyTradingFee: args.copyTradingFee ?? 0,
      performanceFee: args.performanceFee ?? 0,
      bio: args.bio,
      tradingStyle: args.tradingStyle,
      tradingPhilosophy: args.tradingPhilosophy,
      riskProfile: args.riskProfile,
      preferredAssets: args.preferredAssets ?? [],
      twitterHandle: args.twitterHandle,
      discordHandle: args.discordHandle,
      telegramHandle: args.telegramHandle,
      websiteUrl: args.websiteUrl,
      isVerified: false,
      verificationBadges: [],
      createdAt: now,
      updatedAt: now,
    });

    return profileId;
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
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_type_period", (q) =>
        q
          .eq("leaderboardType", args.leaderboardType)
          .eq("period", args.period)
      )
      .order("desc")
      .first();

    if (!snapshot) {
      return {
        leaderboardType: args.leaderboardType,
        period: args.period,
        entries: [],
        totalParticipants: 0,
      };
    }

    const offset = args.offset ?? 0;
    const limit = args.limit ?? 100;
    const entries = snapshot.entries.slice(offset, offset + limit);

    return {
      leaderboardType: args.leaderboardType,
      period: args.period,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      entries,
      totalParticipants: snapshot.totalParticipants,
    };
  },
});

/**
 * Get user's leaderboard position
 */
export const getMyLeaderboardRank = query({
  args: {
    userId: v.id("users"),
    leaderboardType: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("userLeaderboardHistory")
      .withIndex("by_user", (q) =>
        q
          .eq("userId", args.userId)
          .eq("leaderboardType", args.leaderboardType)
          .eq("period", args.period)
      )
      .order("desc")
      .first();

    return history;
  },
});

// ============================================================================
// COPY TRADING QUERIES
// ============================================================================

/**
 * Get copy trading settings for a user
 */
export const getCopySettings = query({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_pair", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .unique();

    return subscription;
  },
});

/**
 * Get all copy subscriptions for a copier
 */
export const getMyCopySubscriptions = query({
  args: {
    copierId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("paused"),
        v.literal("stopped"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_copier", (q) => q.eq("copierId", args.copierId));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const subscriptions = await query.collect();

    // Enrich with trader info
    const enriched = await Promise.all(
      subscriptions.map(async (sub) => {
        const trader = await ctx.db.get(sub.traderId);
        const profile = await ctx.db
          .query("traderProfiles")
          .withIndex("by_user", (q) => q.eq("userId", sub.traderId))
          .unique();

        return {
          ...sub,
          trader: {
            userId: sub.traderId,
            username: trader?.username,
            displayName: trader?.displayName,
            avatarUrl: trader?.avatarUrl,
          },
          traderProfile: profile,
        };
      })
    );

    return { subscriptions: enriched };
  },
});

/**
 * Get copiers for a trader
 */
export const getMyCopiers = query({
  args: {
    traderId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "active";
    
    const subscriptions = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_trader", (q) => 
        q.eq("traderId", args.traderId).eq("status", status as any)
      )
      .collect();

    const copiers = await Promise.all(
      subscriptions.map(async (sub) => {
        const copier = await ctx.db.get(sub.copierId);
        return {
          userId: sub.copierId,
          username: copier?.username,
          displayName: copier?.displayName,
          avatarUrl: copier?.avatarUrl,
          subscribedAt: sub.subscribedAt,
          totalCopiedTrades: sub.totalCopiedTrades,
          totalPnL: sub.totalPnL,
          subscriptionId: sub._id,
        };
      })
    );

    return {
      copiers,
      total: copiers.length,
    };
  },
});

/**
 * Get copy trades for a subscription
 */
export const getCopyTrades = query({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const trades = await ctx.db
      .query("copyTrades")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .order("desc")
      .take(limit);

    return { trades };
  },
});

// ============================================================================
// COPY TRADING MUTATIONS
// ============================================================================

/**
 * Activate copy trading for a trader
 */
export const activateCopyTrading = mutation({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
    copyMode: v.union(
      v.literal("fixed_amount"),
      v.literal("percentage_portfolio"),
      v.literal("proportional"),
      v.literal("fixed_ratio")
    ),
    fixedAmount: v.optional(v.number()),
    portfolioPercentage: v.optional(v.number()),
    copyRatio: v.optional(v.number()),
    maxPositionSize: v.number(),
    maxDailyLoss: v.number(),
    maxTotalExposure: v.number(),
    stopLossPercent: v.optional(v.number()),
    takeProfitPercent: v.optional(v.number()),
    copyAssetClasses: v.array(v.string()),
    excludedSymbols: v.optional(v.array(v.string())),
    copyDelaySeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if trader allows copy trading
    const traderProfile = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.traderId))
      .unique();

    if (!traderProfile?.allowCopyTrading) {
      throw new Error("This trader does not allow copy trading");
    }

    // Check for existing subscription
    const existing = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_pair", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .unique();

    if (existing) {
      throw new Error("Copy trading subscription already exists for this trader");
    }

    const now = Date.now();

    // Create subscription
    const subscriptionId = await ctx.db.insert("copyTradingSubscriptions", {
      copierId: args.copierId,
      traderId: args.traderId,
      status: "active",
      copyMode: args.copyMode,
      fixedAmount: args.fixedAmount,
      portfolioPercentage: args.portfolioPercentage,
      copyRatio: args.copyRatio,
      maxPositionSize: args.maxPositionSize,
      maxDailyLoss: args.maxDailyLoss,
      maxTotalExposure: args.maxTotalExposure,
      stopLossPercent: args.stopLossPercent,
      takeProfitPercent: args.takeProfitPercent,
      copyAssetClasses: args.copyAssetClasses,
      excludedSymbols: args.excludedSymbols ?? [],
      copyDelaySeconds: args.copyDelaySeconds ?? 0,
      totalCopiedTrades: 0,
      totalPnL: 0,
      totalFeesPaid: 0,
      subscribedAt: now,
      updatedAt: now,
    });

    return subscriptionId;
  },
});

/**
 * Deactivate copy trading
 */
export const deactivateCopyTrading = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update copy trading settings
 */
export const updateCopySettings = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
    copyMode: v.optional(
      v.union(
        v.literal("fixed_amount"),
        v.literal("percentage_portfolio"),
        v.literal("proportional"),
        v.literal("fixed_ratio")
      )
    ),
    fixedAmount: v.optional(v.number()),
    portfolioPercentage: v.optional(v.number()),
    copyRatio: v.optional(v.number()),
    maxPositionSize: v.optional(v.number()),
    maxDailyLoss: v.optional(v.number()),
    maxTotalExposure: v.optional(v.number()),
    stopLossPercent: v.optional(v.number()),
    takeProfitPercent: v.optional(v.number()),
    copyAssetClasses: v.optional(v.array(v.string())),
    excludedSymbols: v.optional(v.array(v.string())),
    copyDelaySeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    Object.keys(args).forEach((key) => {
      if (key !== "subscriptionId" && args[key as keyof typeof args] !== undefined) {
        updates[key] = args[key as keyof typeof args];
      }
    });

    await ctx.db.patch(args.subscriptionId, updates);

    return { success: true };
  },
});

/**
 * Pause copy trading subscription
 */
export const pauseCopyTrading = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "paused",
      pausedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Resume copy trading subscription
 */
export const resumeCopyTrading = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.status !== "paused") {
      throw new Error("Subscription is not paused");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "active",
      pausedAt: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
