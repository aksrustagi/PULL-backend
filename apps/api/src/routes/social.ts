/**
 * Social Trading Routes
 * Endpoints for follows, copy trading, and leaderboards
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const leaderboardQuerySchema = z.object({
  timeframe: z.enum(["24h", "7d", "30d", "all"]).default("30d"),
  sortBy: z.enum(["return30d", "sharpeRatio", "followers", "winRate"]).default("return30d"),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  minTrades: z.coerce.number().min(0).default(10),
});

const followSchema = z.object({
  notifications: z.boolean().default(true),
});

const copySettingsSchema = z.object({
  traderId: z.string().min(1),
  allocationPercent: z.number().min(1).max(100),
  maxPositionSize: z.number().positive(),
  minPositionSize: z.number().positive().optional().default(1),
  excludeMarketTypes: z.array(z.string()).default([]),
});

const updateCopySettingsSchema = z.object({
  allocationPercent: z.number().min(1).max(100).optional(),
  maxPositionSize: z.number().positive().optional(),
  minPositionSize: z.number().positive().optional(),
  excludeMarketTypes: z.array(z.string()).optional(),
});

// ============================================================================
// LEADERBOARD ENDPOINTS
// ============================================================================

/**
 * GET /social/leaderboard
 * Get paginated trader leaderboard with sorting options
 */
app.get("/leaderboard", zValidator("query", leaderboardQuerySchema), async (c) => {
  const { timeframe, sortBy, limit, offset, minTrades } = c.req.valid("query");

  // TODO: Call Convex query - getLeaderboard
  // const leaderboard = await convex.query(api.social.getLeaderboard, {
  //   sortBy,
  //   timeframe,
  //   minTrades,
  //   limit,
  //   offset,
  // });

  // Mock response
  const mockTraders = Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
    rank: offset + i + 1,
    userId: `user_${offset + i + 1}`,
    user: {
      username: `trader${offset + i + 1}`,
      displayName: `Pro Trader ${offset + i + 1}`,
      avatarUrl: null,
    },
    returns: {
      timeframeReturn: 25.5 - i * 2,
      totalReturn: 145.2 - i * 10,
      return30d: 25.5 - i * 2,
    },
    sharpeRatio: 2.5 - i * 0.1,
    maxDrawdown: 8.5 + i * 0.5,
    winRate: 68 - i,
    totalTrades: 250 - i * 15,
    followerCount: 1500 - i * 100,
    copierCount: 85 - i * 5,
  }));

  return c.json({
    success: true,
    data: {
      traders: mockTraders,
      total: 100,
      hasMore: offset + limit < 100,
    },
    meta: {
      timeframe,
      sortBy,
      minTrades,
    },
    pagination: {
      offset,
      limit,
      total: 100,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// FOLLOW ENDPOINTS
// ============================================================================

/**
 * GET /social/following
 * Get current user's followed traders
 */
app.get("/following", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query - getFollowing
  // const following = await convex.query(api.social.getFollowing, { userId });

  return c.json({
    success: true,
    data: {
      following: [],
      total: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /social/followers
 * Get current user's followers
 */
app.get("/followers", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query - getFollowers
  // const followers = await convex.query(api.social.getFollowers, { userId });

  return c.json({
    success: true,
    data: {
      followers: [],
      total: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /social/follow/:userId
 * Follow a trader
 */
app.post("/follow/:userId", zValidator("json", followSchema), async (c) => {
  const currentUserId = c.get("userId");
  const targetUserId = c.req.param("userId");
  const { notifications } = c.req.valid("json");

  if (!currentUserId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  if (currentUserId === targetUserId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "Cannot follow yourself" },
      },
      400
    );
  }

  // TODO: Call Convex mutation - follow
  // const result = await convex.mutation(api.social.follow, {
  //   followerId: currentUserId,
  //   followedId: targetUserId,
  //   notifications,
  // });

  return c.json({
    success: true,
    data: {
      followId: `follow_${crypto.randomUUID()}`,
      followerId: currentUserId,
      followedId: targetUserId,
      notifications,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /social/follow/:userId
 * Unfollow a trader
 */
app.delete("/follow/:userId", async (c) => {
  const currentUserId = c.get("userId");
  const targetUserId = c.req.param("userId");

  if (!currentUserId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation - unfollow
  // await convex.mutation(api.social.unfollow, {
  //   followerId: currentUserId,
  //   followedId: targetUserId,
  // });

  return c.json({
    success: true,
    data: {
      unfollowedId: targetUserId,
      unfollowedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// TRADER PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /traders/:userId/profile
 * Get public trader profile with stats
 */
app.get("/traders/:userId/profile", async (c) => {
  const traderId = c.req.param("userId");
  const viewerId = c.get("userId");

  // TODO: Call Convex query - getTraderStats
  // const stats = await convex.query(api.social.getTraderStats, { userId: traderId });

  // Mock response with full profile data
  const mockProfile = {
    userId: traderId,
    user: {
      username: "protader123",
      displayName: "Pro Trader",
      avatarUrl: null,
      kycTier: "verified",
      memberSince: "2024-01-15T00:00:00Z",
    },
    returns: {
      total: 145.2,
      return30d: 25.5,
      return7d: 8.3,
      return24h: 2.1,
    },
    risk: {
      sharpeRatio: 2.45,
      sortinoRatio: 3.12,
      maxDrawdown: 8.5,
      currentDrawdown: 2.1,
    },
    performance: {
      winRate: 68.5,
      avgWin: 125.5,
      avgLoss: 45.2,
      profitFactor: 2.78,
    },
    activity: {
      totalTrades: 248,
      profitableTrades: 170,
      avgHoldingPeriod: 4.5,
    },
    social: {
      followerCount: 1523,
      copierCount: 87,
    },
    topMarkets: [
      { symbol: "BTCUSD-DEC", volume: 125000 },
      { symbol: "ETHUSD-DEC", volume: 85000 },
      { symbol: "ELEC-24DEC", volume: 45000 },
    ],
    badges: [
      { id: "top_10", name: "Top 10 Trader", earnedAt: "2024-06-15T00:00:00Z" },
      { id: "consistent", name: "Consistent Performer", earnedAt: "2024-05-01T00:00:00Z" },
    ],
    lastCalculated: new Date().toISOString(),
  };

  // Check if viewer follows this trader
  let isFollowing = false;
  let isCopying = false;
  if (viewerId) {
    // TODO: Check follow/copy status
    // const followStatus = await convex.query(api.social.isFollowing, {
    //   followerId: viewerId,
    //   followedId: traderId,
    // });
    // isFollowing = followStatus.isFollowing;
  }

  return c.json({
    success: true,
    data: {
      ...mockProfile,
      viewerRelationship: {
        isFollowing,
        isCopying,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /traders/:userId/positions
 * Get trader's positions (delayed for non-followers)
 */
app.get("/traders/:userId/positions", async (c) => {
  const traderId = c.req.param("userId");
  const viewerId = c.get("userId");

  // TODO: Call Convex query - getTraderPositions
  // const positions = await convex.query(api.social.getTraderPositions, {
  //   traderId,
  //   viewerId,
  // });

  // Mock response
  const mockPositions = [
    {
      id: "pos_1",
      symbol: "BTCUSD-DEC",
      assetClass: "prediction",
      side: "long",
      quantity: 100,
      averageEntryPrice: 0.65,
      currentPrice: 0.72,
      unrealizedPnL: 7,
      unrealizedPnLPercent: 10.77,
      openedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Determine if viewer follows trader (affects delay)
  let isFollower = false;
  if (viewerId) {
    // TODO: Check follow status
  }

  return c.json({
    success: true,
    data: {
      positions: mockPositions,
      isFollower,
      isDelayed: !isFollower,
      delayHours: isFollower ? 0 : 24,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /traders/:userId/performance
 * Get trader's performance chart data
 */
app.get("/traders/:userId/performance", async (c) => {
  const traderId = c.req.param("userId");
  const timeframe = c.req.query("timeframe") || "30d";

  // TODO: Generate performance chart data from trades
  // This would aggregate trade P&L over time

  const now = Date.now();
  const points = 30;
  const interval = (timeframe === "7d" ? 7 : timeframe === "24h" ? 1 : 30) * 24 * 60 * 60 * 1000 / points;

  // Generate mock equity curve
  let equity = 10000;
  const chartData = Array.from({ length: points }, (_, i) => {
    const change = (Math.random() - 0.45) * 200; // Slight upward bias
    equity += change;
    return {
      timestamp: new Date(now - (points - i) * interval).toISOString(),
      equity: Math.round(equity * 100) / 100,
      dailyPnL: Math.round(change * 100) / 100,
    };
  });

  return c.json({
    success: true,
    data: {
      chartData,
      timeframe,
      startValue: 10000,
      endValue: equity,
      totalReturn: ((equity - 10000) / 10000) * 100,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// COPY TRADING ENDPOINTS
// ============================================================================

/**
 * GET /social/copy
 * Get current user's copy settings for all traders
 */
app.get("/copy", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query - getCopySettings
  // const settings = await convex.query(api.social.getCopySettings, { userId });

  return c.json({
    success: true,
    data: {
      copySettings: [],
      totalAllocation: 0,
      totalPnL: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /social/copiers
 * Get users copying the current user
 */
app.get("/copiers", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query - getCopiers
  // const copiers = await convex.query(api.social.getCopiers, { traderId: userId });

  return c.json({
    success: true,
    data: {
      copiers: [],
      totalCopiers: 0,
      totalAllocation: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /social/copy
 * Start copying a trader
 */
app.post("/copy", zValidator("json", copySettingsSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  if (userId === body.traderId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "Cannot copy yourself" },
      },
      400
    );
  }

  // Validate min/max position sizes
  if (body.minPositionSize && body.minPositionSize > body.maxPositionSize) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Minimum position size cannot exceed maximum",
        },
      },
      400
    );
  }

  // TODO: Check if following (required before copying)
  // TODO: Check balance
  // TODO: Call Convex mutation - activateCopy
  // const result = await convex.mutation(api.social.activateCopy, {
  //   copierId: userId,
  //   traderId: body.traderId,
  //   allocationPercent: body.allocationPercent,
  //   maxPositionSize: body.maxPositionSize,
  //   minPositionSize: body.minPositionSize ?? 1,
  //   excludeMarketTypes: body.excludeMarketTypes,
  // });

  return c.json({
    success: true,
    data: {
      copySettingsId: `copy_${crypto.randomUUID()}`,
      copierId: userId,
      traderId: body.traderId,
      settings: {
        allocationPercent: body.allocationPercent,
        maxPositionSize: body.maxPositionSize,
        minPositionSize: body.minPositionSize ?? 1,
        excludeMarketTypes: body.excludeMarketTypes,
      },
      active: true,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * PUT /social/copy/:traderId
 * Update copy settings for a trader
 */
app.put("/copy/:traderId", zValidator("json", updateCopySettingsSchema), async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation - updateCopySettings
  // await convex.mutation(api.social.updateCopySettings, {
  //   copierId: userId,
  //   traderId,
  //   ...body,
  // });

  return c.json({
    success: true,
    data: {
      traderId,
      updatedSettings: body,
      updatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /social/copy/:traderId
 * Stop copying a trader
 */
app.delete("/copy/:traderId", async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation - deactivateCopy
  // await convex.mutation(api.social.deactivateCopy, {
  //   copierId: userId,
  //   traderId,
  // });

  return c.json({
    success: true,
    data: {
      traderId,
      deactivatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ACTIVITY FEED ENDPOINTS
// ============================================================================

/**
 * GET /social/feed
 * Get activity feed of followed traders' moves
 */
app.get("/feed", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch trades from followed traders
  // Would need to get followed traders, then recent trades from each

  return c.json({
    success: true,
    data: {
      activities: [],
      nextCursor: null,
      hasMore: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /social/feed/:tradeId/copy
 * Quick copy a specific trade from the feed
 */
app.post("/feed/:tradeId/copy", async (c) => {
  const userId = c.get("userId");
  const tradeId = c.req.param("tradeId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Get trade details
  // TODO: Execute same trade for user via Temporal workflow

  return c.json({
    success: true,
    data: {
      originalTradeId: tradeId,
      copyOrderId: `order_${crypto.randomUUID()}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as socialRoutes };
