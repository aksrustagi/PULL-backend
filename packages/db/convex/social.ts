/**
 * Social Trading Functions
 * Queries and mutations for follows, copy trading, and leaderboards
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// RATE LIMITING HELPERS
// ============================================================================

const RATE_LIMITS = {
  follow: { maxPerHour: 50, maxPerDay: 200 },
  copy: { maxPerHour: 10, maxPerDay: 30 },
};

// ============================================================================
// FOLLOW QUERIES
// ============================================================================

/**
 * Get all followers of a user with their stats
 */
export const getFollowers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
      .collect();

    // Get follower details and stats
    const followersWithStats = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followerId);
        const stats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) => q.eq("userId", follow.followerId))
          .first();

        // Check if this follower is also copying
        const copySettings = await ctx.db
          .query("copySettings")
          .withIndex("by_copier_trader", (q) =>
            q.eq("copierId", follow.followerId).eq("traderId", args.userId)
          )
          .first();

        return {
          followId: follow._id,
          followerId: follow.followerId,
          follower: user
            ? {
                id: user._id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              }
            : null,
          notifications: follow.notifications,
          isCopying: copySettings?.active ?? false,
          stats: stats
            ? {
                totalReturn: stats.totalReturn,
                return30d: stats.return30d,
                winRate: stats.winRate,
                followerCount: stats.followerCount,
              }
            : null,
          followedAt: follow.createdAt,
        };
      })
    );

    return followersWithStats.filter((f) => f.follower !== null);
  },
});

/**
 * Get all traders a user is following
 */
export const getFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .collect();

    const followingWithStats = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followedId);
        const stats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) => q.eq("userId", follow.followedId))
          .first();

        // Get copy settings if any
        const copySettings = await ctx.db
          .query("copySettings")
          .withIndex("by_copier_trader", (q) =>
            q.eq("copierId", args.userId).eq("traderId", follow.followedId)
          )
          .first();

        // Get recent activity (last 5 trades)
        const recentTrades = await ctx.db
          .query("trades")
          .withIndex("by_user", (q) => q.eq("userId", follow.followedId))
          .order("desc")
          .take(5);

        return {
          followId: follow._id,
          traderId: follow.followedId,
          trader: user
            ? {
                id: user._id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              }
            : null,
          notifications: follow.notifications,
          copySettings: copySettings
            ? {
                active: copySettings.active,
                allocationPercent: copySettings.allocationPercent,
                totalCopied: copySettings.totalCopied,
                totalPnL: copySettings.totalPnL,
              }
            : null,
          stats: stats
            ? {
                totalReturn: stats.totalReturn,
                return30d: stats.return30d,
                return7d: stats.return7d,
                return24h: stats.return24h,
                sharpeRatio: stats.sharpeRatio,
                winRate: stats.winRate,
                maxDrawdown: stats.maxDrawdown,
                followerCount: stats.followerCount,
                copierCount: stats.copierCount,
              }
            : null,
          recentActivity: recentTrades.map((t) => ({
            symbol: t.symbol,
            side: t.side,
            quantity: t.quantity,
            price: t.price,
            executedAt: t.executedAt,
          })),
          followedAt: follow.createdAt,
        };
      })
    );

    return followingWithStats.filter((f) => f.trader !== null);
  },
});

/**
 * Check if user is following another user
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
      .first();

    return {
      isFollowing: follow !== null,
      notifications: follow?.notifications ?? false,
      followId: follow?._id ?? null,
    };
  },
});

// ============================================================================
// TRADER STATS QUERIES
// ============================================================================

/**
 * Get full stats for a trader
 */
export const getTraderStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!stats) {
      return null;
    }

    const user = await ctx.db.get(args.userId);

    // Get top traded markets
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const marketVolume: Record<string, number> = {};
    trades.forEach((trade) => {
      marketVolume[trade.symbol] =
        (marketVolume[trade.symbol] || 0) + trade.notionalValue;
    });

    const topMarkets = Object.entries(marketVolume)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([symbol, volume]) => ({ symbol, volume }));

    return {
      userId: stats.userId,
      user: user
        ? {
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            kycTier: user.kycTier,
          }
        : null,
      returns: {
        total: stats.totalReturn,
        return30d: stats.return30d,
        return7d: stats.return7d,
        return24h: stats.return24h,
      },
      risk: {
        sharpeRatio: stats.sharpeRatio,
        sortinoRatio: stats.sortinoRatio,
        maxDrawdown: stats.maxDrawdown,
        currentDrawdown: stats.currentDrawdown,
      },
      performance: {
        winRate: stats.winRate,
        avgWin: stats.avgWin,
        avgLoss: stats.avgLoss,
        profitFactor:
          stats.avgLoss !== 0
            ? (stats.avgWin * stats.winRate) /
              (stats.avgLoss * (1 - stats.winRate))
            : 0,
      },
      activity: {
        totalTrades: stats.totalTrades,
        profitableTrades: stats.profitableTrades,
        avgHoldingPeriod: stats.avgHoldingPeriod,
      },
      social: {
        followerCount: stats.followerCount,
        copierCount: stats.copierCount,
      },
      topMarkets,
      lastCalculated: stats.lastCalculated,
    };
  },
});

/**
 * Get paginated leaderboard
 */
export const getLeaderboard = query({
  args: {
    sortBy: v.union(
      v.literal("return30d"),
      v.literal("sharpeRatio"),
      v.literal("followers"),
      v.literal("winRate")
    ),
    timeframe: v.union(
      v.literal("24h"),
      v.literal("7d"),
      v.literal("30d"),
      v.literal("all")
    ),
    minTrades: v.number(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    // Build query based on sort criteria
    let statsQuery;
    switch (args.sortBy) {
      case "return30d":
        statsQuery = ctx.db
          .query("traderStats")
          .withIndex("by_return30d")
          .order("desc");
        break;
      case "sharpeRatio":
        statsQuery = ctx.db
          .query("traderStats")
          .withIndex("by_sharpeRatio")
          .order("desc");
        break;
      case "followers":
        statsQuery = ctx.db
          .query("traderStats")
          .withIndex("by_followers")
          .order("desc");
        break;
      case "winRate":
        statsQuery = ctx.db
          .query("traderStats")
          .withIndex("by_winRate")
          .order("desc");
        break;
      default:
        statsQuery = ctx.db
          .query("traderStats")
          .withIndex("by_return30d")
          .order("desc");
    }

    // Get all stats and filter
    const allStats = await statsQuery.collect();

    // Filter by minimum trades
    const filteredStats = allStats.filter(
      (s) => s.totalTrades >= args.minTrades
    );

    // Apply pagination
    const paginatedStats = filteredStats.slice(
      args.offset,
      args.offset + args.limit
    );

    // Enrich with user data
    const leaderboard = await Promise.all(
      paginatedStats.map(async (stats, index) => {
        const user = await ctx.db.get(stats.userId);

        // Determine relevant return based on timeframe
        let relevantReturn;
        switch (args.timeframe) {
          case "24h":
            relevantReturn = stats.return24h;
            break;
          case "7d":
            relevantReturn = stats.return7d;
            break;
          case "30d":
            relevantReturn = stats.return30d;
            break;
          case "all":
          default:
            relevantReturn = stats.totalReturn;
        }

        return {
          rank: args.offset + index + 1,
          userId: stats.userId,
          user: user
            ? {
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              }
            : null,
          returns: {
            timeframeReturn: relevantReturn,
            totalReturn: stats.totalReturn,
            return30d: stats.return30d,
          },
          sharpeRatio: stats.sharpeRatio,
          maxDrawdown: stats.maxDrawdown,
          winRate: stats.winRate,
          totalTrades: stats.totalTrades,
          followerCount: stats.followerCount,
          copierCount: stats.copierCount,
        };
      })
    );

    return {
      traders: leaderboard.filter((t) => t.user !== null),
      total: filteredStats.length,
      hasMore: args.offset + args.limit < filteredStats.length,
    };
  },
});

// ============================================================================
// COPY TRADING QUERIES
// ============================================================================

/**
 * Get user's copy settings for all traders they copy
 */
export const getCopySettings = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_copier", (q) => q.eq("copierId", args.userId))
      .collect();

    const enrichedSettings = await Promise.all(
      settings.map(async (setting) => {
        const trader = await ctx.db.get(setting.traderId);
        const traderStats = await ctx.db
          .query("traderStats")
          .withIndex("by_user", (q) => q.eq("userId", setting.traderId))
          .first();

        // Get recent copy trades
        const recentCopyTrades = await ctx.db
          .query("copyTrades")
          .withIndex("by_settings", (q) => q.eq("copySettingsId", setting._id))
          .order("desc")
          .take(10);

        return {
          id: setting._id,
          traderId: setting.traderId,
          trader: trader
            ? {
                username: trader.username,
                displayName: trader.displayName,
                avatarUrl: trader.avatarUrl,
              }
            : null,
          traderStats: traderStats
            ? {
                return30d: traderStats.return30d,
                winRate: traderStats.winRate,
                sharpeRatio: traderStats.sharpeRatio,
              }
            : null,
          settings: {
            allocationPercent: setting.allocationPercent,
            maxPositionSize: setting.maxPositionSize,
            minPositionSize: setting.minPositionSize,
            excludeMarketTypes: setting.excludeMarketTypes,
          },
          active: setting.active,
          performance: {
            totalCopied: setting.totalCopied,
            totalPnL: setting.totalPnL,
            returnPercent:
              setting.totalCopied > 0
                ? (setting.totalPnL / setting.totalCopied) * 100
                : 0,
          },
          recentTrades: recentCopyTrades.map((ct) => ({
            symbol: ct.symbol,
            side: ct.side,
            quantity: ct.copiedQuantity,
            price: ct.copiedPrice,
            status: ct.status,
            pnl: ct.pnl,
            createdAt: ct.createdAt,
          })),
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt,
        };
      })
    );

    return enrichedSettings.filter((s) => s.trader !== null);
  },
});

/**
 * Get all copiers of a trader
 */
export const getCopiers = query({
  args: { traderId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_trader", (q) => q.eq("traderId", args.traderId))
      .collect();

    // Only show active copiers
    const activeCopiers = settings.filter((s) => s.active);

    const copierDetails = await Promise.all(
      activeCopiers.map(async (setting) => {
        const copier = await ctx.db.get(setting.copierId);

        return {
          copierId: setting.copierId,
          copier: copier
            ? {
                username: copier.username,
                displayName: copier.displayName,
                avatarUrl: copier.avatarUrl,
              }
            : null,
          allocationPercent: setting.allocationPercent,
          totalCopied: setting.totalCopied,
          totalPnL: setting.totalPnL,
          copyingSince: setting.createdAt,
        };
      })
    );

    return {
      copiers: copierDetails.filter((c) => c.copier !== null),
      totalCopiers: activeCopiers.length,
      totalAllocation: activeCopiers.reduce(
        (sum, s) => sum + s.allocationPercent,
        0
      ),
    };
  },
});

/**
 * Get trader positions with delay logic for non-followers
 */
export const getTraderPositions = query({
  args: {
    traderId: v.id("users"),
    viewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Check if viewer follows the trader
    let isFollower = false;
    if (args.viewerId) {
      const follow = await ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) =>
          q.eq("followerId", args.viewerId).eq("followedId", args.traderId)
        )
        .first();
      isFollower = follow !== null;
    }

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.traderId))
      .collect();

    const now = Date.now();
    const DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

    // If not a follower, only show positions opened more than 24h ago
    const filteredPositions = isFollower
      ? positions
      : positions.filter((p) => now - p.openedAt > DELAY_MS);

    return {
      positions: filteredPositions.map((p) => ({
        id: p._id,
        symbol: p.symbol,
        assetClass: p.assetClass,
        side: p.side,
        quantity: p.quantity,
        averageEntryPrice: p.averageEntryPrice,
        currentPrice: p.currentPrice,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPercent:
          p.costBasis !== 0 ? (p.unrealizedPnL / p.costBasis) * 100 : 0,
        openedAt: p.openedAt,
      })),
      isFollower,
      isDelayed: !isFollower,
      delayHours: isFollower ? 0 : 24,
    };
  },
});

// ============================================================================
// FOLLOW MUTATIONS
// ============================================================================

/**
 * Follow a trader
 */
export const follow = mutation({
  args: {
    followerId: v.id("users"),
    followedId: v.id("users"),
    notifications: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Can't follow yourself
    if (args.followerId === args.followedId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if already following
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.followerId).eq("followedId", args.followedId)
      )
      .first();

    if (existing) {
      throw new Error("Already following this user");
    }

    // Rate limit check - count follows in last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentFollows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.followerId))
      .filter((q) => q.gte(q.field("createdAt"), oneHourAgo))
      .collect();

    if (recentFollows.length >= RATE_LIMITS.follow.maxPerHour) {
      throw new Error("Rate limit exceeded. Try again later.");
    }

    // Verify both users exist
    const follower = await ctx.db.get(args.followerId);
    const followed = await ctx.db.get(args.followedId);

    if (!follower || !followed) {
      throw new Error("User not found");
    }

    // Create follow relationship
    const followId = await ctx.db.insert("follows", {
      followerId: args.followerId,
      followedId: args.followedId,
      notifications: args.notifications,
      createdAt: Date.now(),
    });

    // Update follower count in trader stats
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.followedId))
      .first();

    if (traderStats) {
      await ctx.db.patch(traderStats._id, {
        followerCount: traderStats.followerCount + 1,
      });
    }

    return { followId };
  },
});

/**
 * Unfollow a trader
 */
export const unfollow = mutation({
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
      .first();

    if (!follow) {
      throw new Error("Not following this user");
    }

    // Also deactivate any copy settings
    const copySettings = await ctx.db
      .query("copySettings")
      .withIndex("by_copier_trader", (q) =>
        q.eq("copierId", args.followerId).eq("traderId", args.followedId)
      )
      .first();

    if (copySettings && copySettings.active) {
      await ctx.db.patch(copySettings._id, {
        active: false,
        updatedAt: Date.now(),
      });

      // Update copier count
      const traderStats = await ctx.db
        .query("traderStats")
        .withIndex("by_user", (q) => q.eq("userId", args.followedId))
        .first();

      if (traderStats && traderStats.copierCount > 0) {
        await ctx.db.patch(traderStats._id, {
          copierCount: traderStats.copierCount - 1,
        });
      }
    }

    await ctx.db.delete(follow._id);

    // Update follower count
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.followedId))
      .first();

    if (traderStats && traderStats.followerCount > 0) {
      await ctx.db.patch(traderStats._id, {
        followerCount: traderStats.followerCount - 1,
      });
    }

    return { success: true };
  },
});

/**
 * Update notification settings for a follow
 */
export const updateFollowNotifications = mutation({
  args: {
    followerId: v.id("users"),
    followedId: v.id("users"),
    notifications: v.boolean(),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.followerId).eq("followedId", args.followedId)
      )
      .first();

    if (!follow) {
      throw new Error("Not following this user");
    }

    await ctx.db.patch(follow._id, {
      notifications: args.notifications,
    });

    return { success: true };
  },
});

// ============================================================================
// COPY TRADING MUTATIONS
// ============================================================================

/**
 * Activate copy trading for a trader
 */
export const activateCopy = mutation({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
    allocationPercent: v.number(),
    maxPositionSize: v.number(),
    minPositionSize: v.number(),
    excludeMarketTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate
    if (args.copierId === args.traderId) {
      throw new Error("Cannot copy yourself");
    }

    if (args.allocationPercent <= 0 || args.allocationPercent > 100) {
      throw new Error("Allocation must be between 0 and 100%");
    }

    if (args.minPositionSize > args.maxPositionSize) {
      throw new Error("Min position size cannot exceed max position size");
    }

    // Must be following to copy
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) =>
        q.eq("followerId", args.copierId).eq("followedId", args.traderId)
      )
      .first();

    if (!follow) {
      throw new Error("Must follow a trader before copying");
    }

    // Check copier's balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.copierId).eq("assetType", "usd").eq("assetId", "usd")
      )
      .first();

    if (!balance || balance.available < args.minPositionSize) {
      throw new Error("Insufficient balance for copy trading");
    }

    // Check existing copy settings
    let copySettings = await ctx.db
      .query("copySettings")
      .withIndex("by_copier_trader", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .first();

    const now = Date.now();

    if (copySettings) {
      // Update existing settings
      await ctx.db.patch(copySettings._id, {
        allocationPercent: args.allocationPercent,
        maxPositionSize: args.maxPositionSize,
        minPositionSize: args.minPositionSize,
        excludeMarketTypes: args.excludeMarketTypes,
        active: true,
        updatedAt: now,
      });
    } else {
      // Create new copy settings
      copySettings = {
        _id: await ctx.db.insert("copySettings", {
          copierId: args.copierId,
          traderId: args.traderId,
          allocationPercent: args.allocationPercent,
          maxPositionSize: args.maxPositionSize,
          minPositionSize: args.minPositionSize,
          excludeMarketTypes: args.excludeMarketTypes,
          active: true,
          totalCopied: 0,
          totalPnL: 0,
          createdAt: now,
          updatedAt: now,
        }),
      } as any;

      // Update copier count
      const traderStats = await ctx.db
        .query("traderStats")
        .withIndex("by_user", (q) => q.eq("userId", args.traderId))
        .first();

      if (traderStats) {
        await ctx.db.patch(traderStats._id, {
          copierCount: traderStats.copierCount + 1,
        });
      }
    }

    return { copySettingsId: copySettings._id };
  },
});

/**
 * Update copy settings
 */
export const updateCopySettings = mutation({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
    allocationPercent: v.optional(v.number()),
    maxPositionSize: v.optional(v.number()),
    minPositionSize: v.optional(v.number()),
    excludeMarketTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const copySettings = await ctx.db
      .query("copySettings")
      .withIndex("by_copier_trader", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .first();

    if (!copySettings) {
      throw new Error("Copy settings not found");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.allocationPercent !== undefined) {
      if (args.allocationPercent <= 0 || args.allocationPercent > 100) {
        throw new Error("Allocation must be between 0 and 100%");
      }
      updates.allocationPercent = args.allocationPercent;
    }

    if (args.maxPositionSize !== undefined) {
      updates.maxPositionSize = args.maxPositionSize;
    }

    if (args.minPositionSize !== undefined) {
      updates.minPositionSize = args.minPositionSize;
    }

    if (args.excludeMarketTypes !== undefined) {
      updates.excludeMarketTypes = args.excludeMarketTypes;
    }

    // Validate min/max
    const finalMin = updates.minPositionSize ?? copySettings.minPositionSize;
    const finalMax = updates.maxPositionSize ?? copySettings.maxPositionSize;
    if (finalMin > finalMax) {
      throw new Error("Min position size cannot exceed max position size");
    }

    await ctx.db.patch(copySettings._id, updates);

    return { success: true };
  },
});

/**
 * Deactivate copy trading
 */
export const deactivateCopy = mutation({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const copySettings = await ctx.db
      .query("copySettings")
      .withIndex("by_copier_trader", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .first();

    if (!copySettings) {
      throw new Error("Copy settings not found");
    }

    if (!copySettings.active) {
      throw new Error("Copy trading is already inactive");
    }

    await ctx.db.patch(copySettings._id, {
      active: false,
      updatedAt: Date.now(),
    });

    // Update copier count
    const traderStats = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.traderId))
      .first();

    if (traderStats && traderStats.copierCount > 0) {
      await ctx.db.patch(traderStats._id, {
        copierCount: traderStats.copierCount - 1,
      });
    }

    return { success: true };
  },
});

// ============================================================================
// INTERNAL MUTATIONS (for workflows)
// ============================================================================

/**
 * Update trader stats (called by Temporal workflow)
 */
export const updateTraderStats = internalMutation({
  args: {
    userId: v.id("users"),
    stats: v.object({
      totalReturn: v.number(),
      return30d: v.number(),
      return7d: v.number(),
      return24h: v.number(),
      sharpeRatio: v.number(),
      sortinoRatio: v.number(),
      maxDrawdown: v.number(),
      currentDrawdown: v.number(),
      winRate: v.number(),
      avgWin: v.number(),
      avgLoss: v.number(),
      totalTrades: v.number(),
      profitableTrades: v.number(),
      avgHoldingPeriod: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("traderStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args.stats,
        lastCalculated: now,
      });
    } else {
      // Get follower and copier counts
      const followers = await ctx.db
        .query("follows")
        .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
        .collect();

      const copiers = await ctx.db
        .query("copySettings")
        .withIndex("by_trader", (q) => q.eq("traderId", args.userId))
        .filter((q) => q.eq(q.field("active"), true))
        .collect();

      await ctx.db.insert("traderStats", {
        userId: args.userId,
        ...args.stats,
        followerCount: followers.length,
        copierCount: copiers.length,
        lastCalculated: now,
      });
    }
  },
});

/**
 * Record a copy trade
 */
export const recordCopyTrade = internalMutation({
  args: {
    copySettingsId: v.id("copySettings"),
    copierId: v.id("users"),
    traderId: v.id("users"),
    originalOrderId: v.id("orders"),
    copiedOrderId: v.optional(v.id("orders")),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    originalQuantity: v.number(),
    copiedQuantity: v.number(),
    originalPrice: v.number(),
    copiedPrice: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("executed"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    skipReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const copyTradeId = await ctx.db.insert("copyTrades", {
      ...args,
      pnl: undefined,
      createdAt: Date.now(),
      executedAt: args.status === "executed" ? Date.now() : undefined,
    });

    // Update copy settings totals if executed
    if (args.status === "executed" && args.copiedPrice) {
      const copySettings = await ctx.db.get(args.copySettingsId);
      if (copySettings) {
        await ctx.db.patch(args.copySettingsId, {
          totalCopied:
            copySettings.totalCopied + args.copiedQuantity * args.copiedPrice,
          updatedAt: Date.now(),
        });
      }
    }

    return { copyTradeId };
  },
});

/**
 * Record fraud flag
 */
export const recordFraudFlag = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("wash_trading"),
      v.literal("circular_copying"),
      v.literal("pump_and_dump"),
      v.literal("fake_followers"),
      v.literal("other")
    ),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    evidence: v.any(),
  },
  handler: async (ctx, args) => {
    // Check for existing unresolved flag of same type
    const existing = await ctx.db
      .query("fraudFlags")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), args.type),
          q.neq(q.field("status"), "dismissed"),
          q.neq(q.field("status"), "confirmed")
        )
      )
      .first();

    if (existing) {
      // Update existing flag with new evidence
      await ctx.db.patch(existing._id, {
        evidence: { ...existing.evidence, ...args.evidence },
        severity: args.severity,
        detectedAt: Date.now(),
      });
      return { flagId: existing._id };
    }

    const flagId = await ctx.db.insert("fraudFlags", {
      userId: args.userId,
      type: args.type,
      severity: args.severity,
      status: "detected",
      evidence: args.evidence,
      detectedAt: Date.now(),
    });

    // If critical severity, auto-disable copy features
    if (args.severity === "critical") {
      const copySettings = await ctx.db
        .query("copySettings")
        .withIndex("by_trader", (q) => q.eq("traderId", args.userId))
        .filter((q) => q.eq(q.field("active"), true))
        .collect();

      for (const settings of copySettings) {
        await ctx.db.patch(settings._id, {
          active: false,
          updatedAt: Date.now(),
        });
      }
    }

    return { flagId };
  },
});

/**
 * Get active copiers for a trader (used by copy trade workflow)
 */
export const getActiveCopiers = query({
  args: { traderId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("copySettings")
      .withIndex("by_trader", (q) => q.eq("traderId", args.traderId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const copierDetails = await Promise.all(
      settings.map(async (s) => {
        // Get copier's balance
        const balance = await ctx.db
          .query("balances")
          .withIndex("by_user_asset", (q) =>
            q.eq("userId", s.copierId).eq("assetType", "usd").eq("assetId", "usd")
          )
          .first();

        return {
          copySettingsId: s._id,
          copierId: s.copierId,
          allocationPercent: s.allocationPercent,
          maxPositionSize: s.maxPositionSize,
          minPositionSize: s.minPositionSize,
          excludeMarketTypes: s.excludeMarketTypes,
          availableBalance: balance?.available ?? 0,
        };
      })
    );

    return copierDetails;
  },
});
