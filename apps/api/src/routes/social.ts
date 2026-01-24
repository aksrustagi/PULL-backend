/**
 * Social Trading API Routes
 * REST endpoints for social trading graph features
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { convexSocial, convexAudit } from "../lib/convex";

const app = new Hono<Env>();

// ============================================================================
// Follow/Unfollow Routes
// ============================================================================

const followTraderSchema = z.object({
  traderId: z.string(),
  notificationsEnabled: z.boolean().default(true),
  positionVisibility: z.enum(["all", "entry_only", "none"]).default("all"),
});

const updateFollowSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  positionVisibility: z.enum(["all", "entry_only", "none"]).optional(),
});

/**
 * Follow a trader
 */
app.post("/follow", zValidator("json", followTraderSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const followId = await convexSocial.follow({
      followerId: userId,
      followeeId: body.traderId,
      notificationsEnabled: body.notificationsEnabled,
      positionVisibility: body.positionVisibility,
    });

    // Log audit event
    await convexAudit.log({
      userId,
      action: "follow_trader",
      resourceType: "follow",
      resourceId: followId as string,
      metadata: { traderId: body.traderId },
      requestId,
    });

    return c.json({
      success: true,
      data: {
        id: followId,
        followerId: userId,
        followeeId: body.traderId,
        notificationsEnabled: body.notificationsEnabled,
        positionVisibility: body.positionVisibility,
        followedAt: new Date().toISOString(),
        isActive: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Follow trader error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FOLLOW_FAILED",
          message: error instanceof Error ? error.message : "Failed to follow trader",
        },
      },
      400
    );
  }
});

/**
 * Unfollow a trader
 */
app.delete("/follow/:traderId", async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.unfollow({
      followerId: userId,
      followeeId: traderId,
    });

    await convexAudit.log({
      userId,
      action: "unfollow_trader",
      resourceType: "follow",
      resourceId: traderId,
      metadata: { traderId },
      requestId,
    });

    return c.json({
      success: true,
      data: { unfollowed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unfollow trader error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "UNFOLLOW_FAILED",
          message: error instanceof Error ? error.message : "Failed to unfollow trader",
        },
      },
      400
    );
  }
});

/**
 * Update follow settings
 */
app.patch("/follow/:traderId", zValidator("json", updateFollowSchema), async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.updateFollowSettings({
      followerId: userId,
      followeeId: traderId,
      ...body,
    });

    return c.json({
      success: true,
      data: { ...body, updated: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update follow settings error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update settings",
        },
      },
      400
    );
  }
});

/**
 * Get followers
 */
app.get("/followers", async (c) => {
  const userId = c.get("userId");
  const targetId = c.req.query("userId") ?? userId;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  try {
    const result = await convexSocial.getFollowers({
      userId: targetId!,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get followers error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch followers",
        },
      },
      500
    );
  }
});

/**
 * Get following
 */
app.get("/following", async (c) => {
  const userId = c.get("userId");
  const targetId = c.req.query("userId") ?? userId;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  try {
    const result = await convexSocial.getFollowing({
      userId: targetId!,
      limit,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get following error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch following",
        },
      },
      500
    );
  }
});

/**
 * Check if following
 */
app.get("/follow/check/:traderId", async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const result = await convexSocial.isFollowing({
      followerId: userId,
      followeeId: traderId,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Check following error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "CHECK_FAILED",
          message: "Failed to check following status",
        },
      },
      500
    );
  }
});

// ============================================================================
// Trader Profile Routes
// ============================================================================

const updateProfileSchema = z.object({
  isPublic: z.boolean().optional(),
  allowCopyTrading: z.boolean().optional(),
  allowAutoCopy: z.boolean().optional(),
  copyTradingFee: z.number().min(0).max(50).optional(),
  performanceFee: z.number().min(0).max(50).optional(),
  bio: z.string().max(500).optional(),
  tradingStyle: z.string().max(200).optional(),
  tradingPhilosophy: z.string().max(1000).optional(),
  riskProfile: z.enum(["conservative", "moderate", "aggressive", "very_aggressive"]).optional(),
  preferredAssets: z.array(z.string()).optional(),
  twitterHandle: z.string().optional(),
  discordHandle: z.string().optional(),
  telegramHandle: z.string().optional(),
  websiteUrl: z.string().url().optional(),
});

/**
 * Get trader profile
 */
app.get("/traders/:traderId", async (c) => {
  const traderId = c.req.param("traderId");
  const userId = c.get("userId");

  try {
    const [profile, stats, reputation] = await Promise.all([
      convexSocial.getTraderProfile(traderId),
      convexSocial.getTraderStats({ userId: traderId, period: "all_time" }),
      convexSocial.getTraderReputation(traderId),
    ]);

    return c.json({
      success: true,
      data: {
        userId: traderId,
        profile,
        stats,
        reputation,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get trader profile error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch trader profile",
        },
      },
      500
    );
  }
});

/**
 * Update my trader profile
 */
app.patch("/traders/me", zValidator("json", updateProfileSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.upsertTraderProfile({
      userId,
      ...body,
    });

    return c.json({
      success: true,
      data: { ...body, updated: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update trader profile error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to update trader profile",
        },
      },
      500
    );
  }
});

/**
 * Get trader stats
 */
app.get("/traders/:traderId/stats", async (c) => {
  const traderId = c.req.param("traderId");
  const period = c.req.query("period") ?? "all_time";

  try {
    const stats = await convexSocial.getTraderStats({
      userId: traderId,
      period: period as any,
    });

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get trader stats error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch trader stats",
        },
      },
      500
    );
  }
});

/**
 * Get trader reputation
 */
app.get("/traders/:traderId/reputation", async (c) => {
  const traderId = c.req.param("traderId");

  try {
    const reputation = await convexSocial.getTraderReputation(traderId);

    return c.json({
      success: true,
      data: reputation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get trader reputation error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch trader reputation",
        },
      },
      500
    );
  }
});

/**
 * Search traders
 */
app.get("/traders/search", async (c) => {
  const query = c.req.query("q");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Implement trader search
  return c.json({
    success: true,
    data: { traders: [], total: 0 },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get recommended traders
 */
app.get("/traders/recommended", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // TODO: Implement with SocialGraphService
  return c.json({
    success: true,
    data: { recommendations: [] },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trending traders
 */
app.get("/traders/trending", async (c) => {
  const period = c.req.query("period") ?? "week";
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // TODO: Implement with SocialGraphService
  return c.json({
    success: true,
    data: { traders: [] },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Copy Trading Routes
// ============================================================================

const createCopySubscriptionSchema = z.object({
  traderId: z.string(),
  copyMode: z.enum(["fixed_amount", "percentage_portfolio", "proportional", "fixed_ratio"]),
  fixedAmount: z.number().positive().optional(),
  portfolioPercentage: z.number().min(1).max(100).optional(),
  copyRatio: z.number().positive().optional(),
  maxPositionSize: z.number().positive(),
  maxDailyLoss: z.number().positive(),
  maxTotalExposure: z.number().positive(),
  stopLossPercent: z.number().positive().optional(),
  takeProfitPercent: z.number().positive().optional(),
  copyAssetClasses: z.array(z.enum(["crypto", "prediction", "rwa"])),
  excludedSymbols: z.array(z.string()).optional(),
  copyDelaySeconds: z.number().min(0).default(0),
});

const updateCopySubscriptionSchema = createCopySubscriptionSchema.partial().omit({ traderId: true });

/**
 * Create copy trading subscription
 */
app.post("/copy/subscribe", zValidator("json", createCopySubscriptionSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const subscriptionId = await convexSocial.activateCopyTrading({
      copierId: userId,
      traderId: body.traderId,
      copyMode: body.copyMode,
      fixedAmount: body.fixedAmount,
      portfolioPercentage: body.portfolioPercentage,
      copyRatio: body.copyRatio,
      maxPositionSize: body.maxPositionSize,
      maxDailyLoss: body.maxDailyLoss,
      maxTotalExposure: body.maxTotalExposure,
      stopLossPercent: body.stopLossPercent,
      takeProfitPercent: body.takeProfitPercent,
      copyAssetClasses: body.copyAssetClasses,
      excludedSymbols: body.excludedSymbols,
      copyDelaySeconds: body.copyDelaySeconds,
    });

    await convexAudit.log({
      userId,
      action: "activate_copy_trading",
      resourceType: "copy_subscription",
      resourceId: subscriptionId as string,
      metadata: { traderId: body.traderId, copyMode: body.copyMode },
      requestId,
    });

    return c.json({
      success: true,
      data: {
        id: subscriptionId,
        copierId: userId,
        ...body,
        status: "active",
        subscribedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Create copy subscription error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "SUBSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to create copy subscription",
        },
      },
      400
    );
  }
});

/**
 * Get my copy subscriptions (as copier)
 */
app.get("/copy/subscriptions", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const result = await convexSocial.getMyCopySubscriptions({
      copierId: userId,
      status: status as any,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get copy subscriptions error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch copy subscriptions",
        },
      },
      500
    );
  }
});

/**
 * Get my copiers (as trader)
 */
app.get("/copy/copiers", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status") ?? "active";

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const result = await convexSocial.getMyCopiers({
      traderId: userId,
      status,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get my copiers error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch copiers",
        },
      },
      500
    );
  }
});

/**
 * Update copy subscription
 */
app.patch(
  "/copy/subscriptions/:subscriptionId",
  zValidator("json", updateCopySubscriptionSchema),
  async (c) => {
    const userId = c.get("userId");
    const subscriptionId = c.req.param("subscriptionId");
    const body = c.req.valid("json");

    if (!userId) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
        401
      );
    }

    try {
      await convexSocial.updateCopySettings({
        subscriptionId,
        ...body,
      });

      return c.json({
        success: true,
        data: { id: subscriptionId, ...body, updated: true },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Update copy subscription error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update copy subscription",
          },
        },
        400
      );
    }
  }
);

/**
 * Pause copy subscription
 */
app.post("/copy/subscriptions/:subscriptionId/pause", async (c) => {
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.pauseCopyTrading(subscriptionId);

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "paused" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Pause copy subscription error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "PAUSE_FAILED",
          message: "Failed to pause copy subscription",
        },
      },
      400
    );
  }
});

/**
 * Resume copy subscription
 */
app.post("/copy/subscriptions/:subscriptionId/resume", async (c) => {
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.resumeCopyTrading(subscriptionId);

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "active" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Resume copy subscription error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "RESUME_FAILED",
          message: "Failed to resume copy subscription",
        },
      },
      400
    );
  }
});

/**
 * Cancel copy subscription
 */
app.delete("/copy/subscriptions/:subscriptionId", async (c) => {
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await convexSocial.deactivateCopyTrading(subscriptionId);

    await convexAudit.log({
      userId,
      action: "cancel_copy_trading",
      resourceType: "copy_subscription",
      resourceId: subscriptionId,
      requestId,
    });

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "cancelled" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cancel copy subscription error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "CANCEL_FAILED",
          message: "Failed to cancel copy subscription",
        },
      },
      400
    );
  }
});

/**
 * Get copy trades for a subscription
 */
app.get("/copy/subscriptions/:subscriptionId/trades", async (c) => {
  const subscriptionId = c.req.param("subscriptionId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  try {
    const result = await convexSocial.getCopyTrades({
      subscriptionId,
      limit,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get copy trades error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch copy trades",
        },
      },
      500
    );
  }
});

/**
 * Get copy trading analytics
 */
app.get("/copy/subscriptions/:subscriptionId/analytics", async (c) => {
  const subscriptionId = c.req.param("subscriptionId");
  const period = c.req.query("period") ?? "all_time";

  // TODO: Implement with CopyTradingService
  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Leaderboard Routes
// ============================================================================

/**
 * Get leaderboard
 */
app.get("/leaderboards/:type/:period", async (c) => {
  const type = c.req.param("type");
  const period = c.req.param("period");
  const assetClass = c.req.query("assetClass");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  try {
    const result = await convexSocial.getLeaderboard({
      leaderboardType: type as any,
      period: period as any,
      assetClass,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch leaderboard",
        },
      },
      500
    );
  }
});

/**
 * Get my leaderboard position
 */
app.get("/leaderboards/:type/:period/my-rank", async (c) => {
  const userId = c.get("userId");
  const type = c.req.param("type");
  const period = c.req.param("period");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const rank = await convexSocial.getMyLeaderboardRank({
      userId,
      leaderboardType: type,
      period,
    });

    return c.json({
      success: true,
      data: rank,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get my leaderboard rank error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch leaderboard rank",
        },
      },
      500
    );
  }
});

/**
 * Get my leaderboard history
 */
app.get("/leaderboards/history", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type") ?? "pnl_percent";
  const period = c.req.query("period") ?? "weekly";
  const limit = parseInt(c.req.query("limit") ?? "30", 10);

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with LeaderboardService
  return c.json({
    success: true,
    data: { history: [] },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Trading Rooms Routes
// ============================================================================

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["public", "private", "premium", "exclusive"]),
  accessLevel: z.enum(["open", "request_to_join", "invite_only", "subscription"]),
  subscriptionPrice: z.number().positive().optional(),
  subscriptionPeriod: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  tradingFocus: z.array(z.string()).optional(),
  assetClasses: z.array(z.enum(["crypto", "prediction", "rwa"])).optional(),
});

const sendMessageSchema = z.object({
  type: z.enum(["text", "position_share", "trade_share", "analysis", "alert"]),
  content: z.string().min(1).max(4000),
  sharedData: z
    .object({
      positionId: z.string().optional(),
      orderId: z.string().optional(),
      tradeId: z.string().optional(),
      symbol: z.string(),
      side: z.enum(["buy", "sell", "long", "short"]),
      quantity: z.number().optional(),
      price: z.number().optional(),
      pnl: z.number().optional(),
      pnlPercent: z.number().optional(),
    })
    .optional(),
  replyToId: z.string().optional(),
});

/**
 * Create trading room
 */
app.post("/rooms", zValidator("json", createRoomSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  const roomId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: roomId,
      ownerId: userId,
      ...body,
      memberCount: 1,
      status: "active",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get room by ID
 */
app.get("/rooms/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  const userId = c.get("userId");

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search rooms
 */
app.get("/rooms", async (c) => {
  const query = c.req.query("q");
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { rooms: [] },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get my rooms
 */
app.get("/rooms/me", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { rooms: [] },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get popular rooms
 */
app.get("/rooms/popular", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { rooms: [] },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Join room
 */
app.post("/rooms/:roomId/join", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { roomId, userId, status: "active" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Leave room
 */
app.post("/rooms/:roomId/leave", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { left: true },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get room messages
 */
app.get("/rooms/:roomId/messages", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  return c.json({
    success: true,
    data: { messages: [], cursor: undefined },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Send message to room
 */
app.post("/rooms/:roomId/messages", zValidator("json", sendMessageSchema), async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with TradingRoomService
  const messageId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: messageId,
      roomId,
      senderId: userId,
      ...body,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Activity Feed Routes
// ============================================================================

/**
 * Get activity feed
 */
app.get("/feed", async (c) => {
  const userId = c.get("userId");
  const feedType = c.req.query("type") ?? "following";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const cursor = c.req.query("cursor");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with SocialGraphService
  return c.json({
    success: true,
    data: { items: [], cursor: undefined, hasMore: false },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get notifications
 */
app.get("/notifications", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const unreadOnly = c.req.query("unreadOnly") === "true";

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with SocialGraphService
  return c.json({
    success: true,
    data: { items: [], unreadCount: 0 },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Mark notifications as read
 */
app.post("/notifications/mark-read", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ itemIds?: string[]; all?: boolean }>();

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement with SocialGraphService
  return c.json({
    success: true,
    data: { marked: true },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Position Comments Routes
// ============================================================================

const createCommentSchema = z.object({
  positionId: z.string().optional(),
  orderId: z.string().optional(),
  tradeId: z.string().optional(),
  content: z.string().min(1).max(2000),
  contentType: z.enum(["text", "analysis", "thesis", "update", "exit_rationale"]).default("text"),
  parentCommentId: z.string().optional(),
});

/**
 * Create position comment
 */
app.post("/comments", zValidator("json", createCommentSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement comment creation
  const commentId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: commentId,
      authorId: userId,
      ...body,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get comments for a position
 */
app.get("/comments/position/:positionId", async (c) => {
  const positionId = c.req.param("positionId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Implement comment fetching
  return c.json({
    success: true,
    data: { comments: [] },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Like a comment
 */
app.post("/comments/:commentId/like", async (c) => {
  const userId = c.get("userId");
  const commentId = c.req.param("commentId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement like
  return c.json({
    success: true,
    data: { liked: true },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Unlike a comment
 */
app.delete("/comments/:commentId/like", async (c) => {
  const userId = c.get("userId");
  const commentId = c.req.param("commentId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  // TODO: Implement unlike
  return c.json({
    success: true,
    data: { unliked: true },
    timestamp: new Date().toISOString(),
  });
});

export { app as socialRoutes };
