import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Copy Trading queries and mutations for PULL
 * Handles follows, copy settings, trader stats, and copy trades
 */

// ============================================================================
// FOLLOWS QUERIES
// ============================================================================

/**
 * Check if user follows another user
 */
export const isFollowing = query({
  args: {
    followerId: v.id("users"),
    followedId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.followerId).eq("followedId", args.followedId)
      )
      .unique();
    return !!follow;
  },
});

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
      .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    // Get follower user details
    const followerIds = items.map((f) => f.followerId);
    const followers = await Promise.all(
      followerIds.map((id) => ctx.db.get(id))
    );

    return {
      followers: items.map((follow, index) => ({
        ...follow,
        follower: followers[index],
      })),
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?._id : undefined,
    };
  },
});

/**
 * Get users that a user is following
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
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    // Get followed user details
    const followedIds = items.map((f) => f.followedId);
    const followedUsers = await Promise.all(
      followedIds.map((id) => ctx.db.get(id))
    );

    return {
      following: items.map((follow, index) => ({
        ...follow,
        followed: followedUsers[index],
      })),
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?._id : undefined,
    };
  },
});

/**
 * Get follower and following counts for a user
 */
export const getFollowCounts = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
      .collect();

    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .collect();

    return {
      followerCount: followers.length,
      followingCount: following.length,
    };
  },
});

// ============================================================================
// FOLLOWS MUTATIONS
// ============================================================================

/**
 * Follow a user
 */
export const follow = mutation({
  args: {
    followerId: v.id("users"),
    followedId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.followerId === args.followedId) {
      throw new Error("Cannot follow yourself");
    }

    const now = Date.now();

    // Check if already following
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.followerId).eq("followedId", args.followedId)
      )
      .unique();

    if (existing) {
      throw new Error("Already following this user");
    }

    // Verify both users exist
    const [follower, followed] = await Promise.all([
      ctx.db.get(args.followerId),
      ctx.db.get(args.followedId),
    ]);

    if (!follower || !followed) {
      throw new Error("User not found");
    }

    const followId = await ctx.db.insert("follows", {
      followerId: args.followerId,
      followedId: args.followedId,
      createdAt: now,
    });

    // Update trader stats follower count
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.followedId))
      .unique();

    if (traderStats) {
      await ctx.db.patch(traderStats._id, {
        followerCount: traderStats.followerCount + 1,
        updatedAt: now,
      });
    }

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.followerId,
      action: "social.followed",
      resourceType: "follows",
      resourceId: followId,
      metadata: { followedId: args.followedId },
      timestamp: now,
    });

    return followId;
  },
});

/**
 * Unfollow a user
 */
export const unfollow = mutation({
  args: {
    followerId: v.id("users"),
    followedId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const follow = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.followerId).eq("followedId", args.followedId)
      )
      .unique();

    if (!follow) {
      throw new Error("Not following this user");
    }

    await ctx.db.delete(follow._id);

    // Update trader stats follower count
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.followedId))
      .unique();

    if (traderStats && traderStats.followerCount > 0) {
      await ctx.db.patch(traderStats._id, {
        followerCount: traderStats.followerCount - 1,
        updatedAt: now,
      });
    }

    // Deactivate any copy settings
    const copySettings = await ctx.db
      .query("copySettings")
      .withIndex("by_user_trader", (q) =>
        q.eq("userId", args.followerId).eq("traderId", args.followedId)
      )
      .unique();

    if (copySettings && copySettings.active) {
      await ctx.db.patch(copySettings._id, {
        active: false,
        updatedAt: now,
      });
    }

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.followerId,
      action: "social.unfollowed",
      resourceType: "follows",
      resourceId: follow._id,
      metadata: { followedId: args.followedId },
      timestamp: now,
    });

    return follow._id;
  },
});

// ============================================================================
// COPY SETTINGS QUERIES
// ============================================================================

/**
 * Get copy settings for a user-trader pair
 */
export const getCopySettings = query({
  args: {
    userId: v.id("users"),
    traderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("copySettings")
      .withIndex("by_user_trader", (q) =>
        q.eq("userId", args.userId).eq("traderId", args.traderId)
      )
      .unique();
  },
});

/**
 * Get all active copy settings for a user
 */
export const getActiveCopySettings = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    // Get trader details
    const traderIds = settings.map((s) => s.traderId);
    const traders = await Promise.all(traderIds.map((id) => ctx.db.get(id)));

    return settings.map((setting, index) => ({
      ...setting,
      trader: traders[index],
    }));
  },
});

/**
 * Get all copiers for a trader
 */
export const getCopiers = query({
  args: {
    traderId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_trader", (q) => q.eq("traderId", args.traderId))
      .filter((q) => q.eq(q.field("active"), true))
      .take(limit);

    // Get copier details
    const userIds = settings.map((s) => s.userId);
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));

    return settings.map((setting, index) => ({
      ...setting,
      user: users[index],
    }));
  },
});

// ============================================================================
// COPY SETTINGS MUTATIONS
// ============================================================================

/**
 * Create or update copy settings
 */
export const upsertCopySettings = mutation({
  args: {
    userId: v.id("users"),
    traderId: v.id("users"),
    allocationPct: v.number(),
    maxPositionSize: v.number(),
    active: v.boolean(),
    riskLevel: v.optional(
      v.union(
        v.literal("conservative"),
        v.literal("moderate"),
        v.literal("aggressive")
      )
    ),
    copyStopLoss: v.optional(v.boolean()),
    copyTakeProfit: v.optional(v.boolean()),
    minTradeSize: v.optional(v.number()),
    excludedAssets: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (args.userId === args.traderId) {
      throw new Error("Cannot copy your own trades");
    }

    if (args.allocationPct < 0 || args.allocationPct > 100) {
      throw new Error("Allocation percentage must be between 0 and 100");
    }

    if (args.maxPositionSize < 0) {
      throw new Error("Max position size must be positive");
    }

    const now = Date.now();

    // Check if user is following the trader
    const isFollowing = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.userId).eq("traderId", args.traderId)
      )
      .unique();

    if (!isFollowing) {
      throw new Error("Must follow trader before copying");
    }

    const existing = await ctx.db
      .query("copySettings")
      .withIndex("by_user_trader", (q) =>
        q.eq("userId", args.userId).eq("traderId", args.traderId)
      )
      .unique();

    const wasActive = existing?.active ?? false;
    const isNowActive = args.active;

    if (existing) {
      await ctx.db.patch(existing._id, {
        allocationPct: args.allocationPct,
        maxPositionSize: args.maxPositionSize,
        active: args.active,
        riskLevel: args.riskLevel,
        copyStopLoss: args.copyStopLoss,
        copyTakeProfit: args.copyTakeProfit,
        minTradeSize: args.minTradeSize,
        excludedAssets: args.excludedAssets,
        updatedAt: now,
      });

      // Update copier count if active status changed
      if (wasActive !== isNowActive) {
        const traderStats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) => q.eq("userId", args.traderId))
          .unique();

        if (traderStats) {
          await ctx.db.patch(traderStats._id, {
            copierCount: isNowActive
              ? traderStats.copierCount + 1
              : Math.max(0, traderStats.copierCount - 1),
            updatedAt: now,
          });
        }
      }

      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "copyTrading.settings_updated",
        resourceType: "copySettings",
        resourceId: existing._id,
        changes: args,
        timestamp: now,
      });

      return existing._id;
    }

    const settingsId = await ctx.db.insert("copySettings", {
      userId: args.userId,
      traderId: args.traderId,
      allocationPct: args.allocationPct,
      maxPositionSize: args.maxPositionSize,
      active: args.active,
      riskLevel: args.riskLevel,
      copyStopLoss: args.copyStopLoss,
      copyTakeProfit: args.copyTakeProfit,
      minTradeSize: args.minTradeSize,
      excludedAssets: args.excludedAssets,
      createdAt: now,
      updatedAt: now,
    });

    // Update copier count if activating
    if (isNowActive) {
      const traderStats = await ctx.db
        .query("traderStats")
        .withIndex("by_user", (q) => q.eq("userId", args.traderId))
        .unique();

      if (traderStats) {
        await ctx.db.patch(traderStats._id, {
          copierCount: traderStats.copierCount + 1,
          updatedAt: now,
        });
      }
    }

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "copyTrading.settings_created",
      resourceType: "copySettings",
      resourceId: settingsId,
      metadata: args,
      timestamp: now,
    });

    return settingsId;
  },
});

/**
 * Deactivate copy settings
 */
export const deactivateCopySettings = mutation({
  args: {
    userId: v.id("users"),
    traderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_user_trader", (q) =>
        q.eq("userId", args.userId).eq("traderId", args.traderId)
      )
      .unique();

    if (!settings) {
      throw new Error("Copy settings not found");
    }

    if (!settings.active) {
      return settings._id;
    }

    await ctx.db.patch(settings._id, {
      active: false,
      updatedAt: now,
    });

    // Update copier count
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.traderId))
      .unique();

    if (traderStats && traderStats.copierCount > 0) {
      await ctx.db.patch(traderStats._id, {
        copierCount: traderStats.copierCount - 1,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "copyTrading.deactivated",
      resourceType: "copySettings",
      resourceId: settings._id,
      timestamp: now,
    });

    return settings._id;
  },
});

// ============================================================================
// TRADER STATS QUERIES
// ============================================================================

/**
 * Get trader stats by user ID
 */
export const getTraderStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!stats) return null;

    // Get user details
    const user = await ctx.db.get(args.userId);

    return {
      ...stats,
      user,
    };
  },
});

/**
 * Get leaderboard with pagination
 */
export const getLeaderboard = query({
  args: {
    sortBy: v.optional(
      v.union(
        v.literal("totalReturn"),
        v.literal("sharpeRatio"),
        v.literal("winRate"),
        v.literal("followerCount")
      )
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    const sortBy = args.sortBy ?? "totalReturn";

    // Get all trader stats and sort
    const allStats = await ctx.db.query("traderStats").collect();

    // Sort by the specified field
    const sorted = allStats.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return bVal - aVal;
    });

    // Paginate
    const paginated = sorted.slice(offset, offset + limit);

    // Get user details for each trader
    const userIds = paginated.map((s) => s.userId);
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));

    const leaderboard = paginated.map((stats, index) => ({
      ...stats,
      user: users[index],
      rank: offset + index + 1,
    }));

    return {
      leaderboard,
      total: allStats.length,
      hasMore: offset + limit < allStats.length,
    };
  },
});

/**
 * Search traders by performance criteria
 */
export const searchTraders = query({
  args: {
    minReturn: v.optional(v.number()),
    minWinRate: v.optional(v.number()),
    minSharpeRatio: v.optional(v.number()),
    maxDrawdown: v.optional(v.number()),
    tier: v.optional(
      v.union(
        v.literal("bronze"),
        v.literal("silver"),
        v.literal("gold"),
        v.literal("platinum"),
        v.literal("diamond")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let allStats = await ctx.db.query("traderStats").collect();

    // Apply filters
    if (args.minReturn !== undefined) {
      allStats = allStats.filter((s) => s.totalReturn >= args.minReturn!);
    }
    if (args.minWinRate !== undefined) {
      allStats = allStats.filter((s) => s.winRate >= args.minWinRate!);
    }
    if (args.minSharpeRatio !== undefined) {
      allStats = allStats.filter((s) => s.sharpeRatio >= args.minSharpeRatio!);
    }
    if (args.maxDrawdown !== undefined) {
      allStats = allStats.filter((s) => s.maxDrawdown <= args.maxDrawdown!);
    }
    if (args.tier !== undefined) {
      allStats = allStats.filter((s) => s.tier === args.tier);
    }

    // Sort by total return and limit
    const sorted = allStats
      .sort((a, b) => b.totalReturn - a.totalReturn)
      .slice(0, limit);

    // Get user details
    const userIds = sorted.map((s) => s.userId);
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));

    return sorted.map((stats, index) => ({
      ...stats,
      user: users[index],
    }));
  },
});

// ============================================================================
// TRADER STATS MUTATIONS
// ============================================================================

/**
 * Create or update trader stats
 */
export const upsertTraderStats = mutation({
  args: {
    userId: v.id("users"),
    totalReturn: v.number(),
    sharpeRatio: v.number(),
    maxDrawdown: v.number(),
    winRate: v.number(),
    totalTrades: v.number(),
    profitableTrades: v.number(),
    averageWin: v.number(),
    averageLoss: v.number(),
    profitFactor: v.number(),
    tradingVolume: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { userId, ...statsData } = args;

    const existing = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Calculate tier based on performance
    const tier = calculateTier(args.totalReturn, args.sharpeRatio, args.winRate);

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...statsData,
        tier,
        updatedAt: now,
      });
      return existing._id;
    }

    // Get initial follower and copier counts
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followed", (q) => q.eq("followedId", userId))
      .collect();

    const copiers = await ctx.db
      .query("copySettings")
      .withIndex("by_trader", (q) => q.eq("traderId", userId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const statsId = await ctx.db.insert("traderStats", {
      userId,
      ...statsData,
      followerCount: followers.length,
      copierCount: copiers.length,
      tier,
      updatedAt: now,
    });

    return statsId;
  },
});

/**
 * Update leaderboard ranks
 */
export const updateLeaderboardRanks = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all trader stats sorted by total return
    const allStats = await ctx.db.query("traderStats").collect();
    const sorted = allStats.sort((a, b) => b.totalReturn - a.totalReturn);

    // Update ranks
    for (let i = 0; i < sorted.length; i++) {
      await ctx.db.patch(sorted[i]._id, {
        rank: i + 1,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "copyTrading.leaderboard_updated",
      resourceType: "traderStats",
      resourceId: "leaderboard",
      metadata: { tradersUpdated: sorted.length },
      timestamp: now,
    });

    return sorted.length;
  },
});

// ============================================================================
// COPY TRADES QUERIES
// ============================================================================

/**
 * Get copy trades for a user
 */
export const getCopyTrades = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("partial"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let query = ctx.db
      .query("copyTrades")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const trades = await query.order("desc").take(limit);

    // Get related orders and traders
    const result = await Promise.all(
      trades.map(async (trade) => {
        const [trader, originalOrder, copiedOrder] = await Promise.all([
          ctx.db.get(trade.traderId),
          ctx.db.get(trade.originalOrderId),
          ctx.db.get(trade.copiedOrderId),
        ]);
        return {
          ...trade,
          trader,
          originalOrder,
          copiedOrder,
        };
      })
    );

    return result;
  },
});

/**
 * Get copy trades originating from a trader's order
 */
export const getCopyTradesByOriginalOrder = query({
  args: { originalOrderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("copyTrades")
      .withIndex("by_original_order", (q) =>
        q.eq("originalOrderId", args.originalOrderId)
      )
      .collect();
  },
});

// ============================================================================
// COPY TRADES MUTATIONS
// ============================================================================

/**
 * Create a copy trade record
 */
export const createCopyTrade = mutation({
  args: {
    userId: v.id("users"),
    traderId: v.id("users"),
    originalOrderId: v.id("orders"),
    copiedOrderId: v.id("orders"),
    copySettingsId: v.id("copySettings"),
    originalQuantity: v.number(),
    copiedQuantity: v.number(),
    scaleFactor: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const copyTradeId = await ctx.db.insert("copyTrades", {
      ...args,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "copyTrading.trade_created",
      resourceType: "copyTrades",
      resourceId: copyTradeId,
      metadata: {
        traderId: args.traderId,
        originalOrderId: args.originalOrderId,
        scaleFactor: args.scaleFactor,
      },
      timestamp: now,
    });

    return copyTradeId;
  },
});

/**
 * Update copy trade status
 */
export const updateCopyTradeStatus = mutation({
  args: {
    copyTradeId: v.id("copyTrades"),
    status: v.union(
      v.literal("pending"),
      v.literal("executed"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const copyTrade = await ctx.db.get(args.copyTradeId);
    if (!copyTrade) {
      throw new Error("Copy trade not found");
    }

    await ctx.db.patch(args.copyTradeId, {
      status: args.status,
      failureReason: args.failureReason,
      executedAt: args.status === "executed" ? now : undefined,
    });

    await ctx.db.insert("auditLog", {
      userId: copyTrade.userId,
      action: "copyTrading.trade_status_updated",
      resourceType: "copyTrades",
      resourceId: args.copyTradeId,
      changes: {
        oldStatus: copyTrade.status,
        newStatus: args.status,
        failureReason: args.failureReason,
      },
      timestamp: now,
    });

    return args.copyTradeId;
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function calculateTier(
  totalReturn: number,
  sharpeRatio: number,
  winRate: number
): "bronze" | "silver" | "gold" | "platinum" | "diamond" {
  const score = totalReturn * 0.4 + sharpeRatio * 30 + winRate * 0.3;

  if (score >= 100) return "diamond";
  if (score >= 75) return "platinum";
  if (score >= 50) return "gold";
  if (score >= 25) return "silver";
  return "bronze";
}
