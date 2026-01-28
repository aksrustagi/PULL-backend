/**
 * Social Trading API Routes
 * REST endpoints for social trading graph features
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  socialGraphService,
  traderStatsService,
  copyTradingService,
  leaderboardService,
  positionCommentsService,
  reputationService,
} from "../services/social";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// Protect all social trading routes - feature is not production-ready
app.use("*", requireFeature("social_trading", "Social Trading"));

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

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const followId = await socialGraphService.follow({
      followerId: userId,
      followeeId: body.traderId,
      notificationsEnabled: body.notificationsEnabled,
      positionVisibility: body.positionVisibility,
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
    return c.json(
      {
        success: false,
        error: {
          code: "FOLLOW_FAILED",
          message: error instanceof Error ? error.message : "Failed to follow trader",
        },
      },
      500
    );
  }
});

/**
 * Unfollow a trader
 */
app.delete("/follow/:traderId", async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.param("traderId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await socialGraphService.unfollow({
      followerId: userId,
      followeeId: traderId,
    });

    return c.json({
      success: true,
      data: { unfollowed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNFOLLOW_FAILED",
          message: error instanceof Error ? error.message : "Failed to unfollow trader",
        },
      },
      500
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
    await socialGraphService.updateFollowSettings({
      followerId: userId,
      followeeId: traderId,
      notificationsEnabled: body.notificationsEnabled,
      positionVisibility: body.positionVisibility,
    });

    return c.json({
      success: true,
      data: { ...body, updated: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_SETTINGS_FAILED",
          message: error instanceof Error ? error.message : "Failed to update follow settings",
        },
      },
      500
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

  if (!targetId) {
    return c.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "User ID is required" } },
      400
    );
  }

  try {
    const result = await socialGraphService.getFollowers({
      userId: targetId,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_FOLLOWERS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get followers",
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
  const cursor = c.req.query("cursor");

  if (!targetId) {
    return c.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "User ID is required" } },
      400
    );
  }

  try {
    const result = await socialGraphService.getFollowing({
      userId: targetId,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_FOLLOWING_FAILED",
          message: error instanceof Error ? error.message : "Failed to get following",
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
    const isFollowing = await socialGraphService.isFollowing({
      followerId: userId,
      followeeId: traderId,
    });

    return c.json({
      success: true,
      data: { isFollowing },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CHECK_FOLLOWING_FAILED",
          message: error instanceof Error ? error.message : "Failed to check following status",
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
    const profile = await traderStatsService.getTraderProfile(traderId);

    return c.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_PROFILE_FAILED",
          message: error instanceof Error ? error.message : "Failed to get trader profile",
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
    await traderStatsService.updateTraderProfile({
      userId,
      ...body,
    });

    return c.json({
      success: true,
      data: { ...body, updated: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_PROFILE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update trader profile",
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
    const stats = await traderStatsService.getTraderStats({
      userId: traderId,
      period: period as "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time",
    });

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STATS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get trader stats",
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
    const reputation = await reputationService.getReputation(traderId);

    return c.json({
      success: true,
      data: reputation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_REPUTATION_FAILED",
          message: error instanceof Error ? error.message : "Failed to get trader reputation",
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

  if (!query) {
    return c.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "Search query is required" } },
      400
    );
  }

  try {
    const traders = await traderStatsService.searchTraders({
      query,
      limit,
    });

    return c.json({
      success: true,
      data: traders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to search traders",
        },
      },
      500
    );
  }
});

/**
 * Get recommended traders
 */
app.get("/traders/recommended", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  try {
    const traders = await traderStatsService.getTrendingTraders({
      period: "weekly",
      limit,
    });

    return c.json({
      success: true,
      data: traders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_RECOMMENDATIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get recommended traders",
        },
      },
      500
    );
  }
});

/**
 * Get trending traders
 */
app.get("/traders/trending", async (c) => {
  const period = c.req.query("period") ?? "weekly";
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  try {
    const traders = await traderStatsService.getTrendingTraders({
      period: period as "daily" | "weekly" | "monthly",
      limit,
    });

    return c.json({
      success: true,
      data: traders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_TRENDING_FAILED",
          message: error instanceof Error ? error.message : "Failed to get trending traders",
        },
      },
      500
    );
  }
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

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const subscriptionId = await copyTradingService.createSubscription({
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
    return c.json(
      {
        success: false,
        error: {
          code: "CREATE_SUBSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to create copy subscription",
        },
      },
      500
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
    const subscriptions = await copyTradingService.getSubscriptions({
      copierId: userId,
      status: status as "pending" | "active" | "paused" | "stopped" | "cancelled" | undefined,
    });

    return c.json({
      success: true,
      data: subscriptions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_SUBSCRIPTIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get copy subscriptions",
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
    const copiers = await copyTradingService.getCopiers({
      traderId: userId,
      status: status as "pending" | "active" | "paused" | "stopped" | "cancelled",
    });

    return c.json({
      success: true,
      data: copiers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_COPIERS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get copiers",
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
      await copyTradingService.updateSubscription(subscriptionId, body);

      return c.json({
        success: true,
        data: { id: subscriptionId, ...body, updated: true },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: "UPDATE_SUBSCRIPTION_FAILED",
            message: error instanceof Error ? error.message : "Failed to update copy subscription",
          },
        },
        500
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
    await copyTradingService.pauseSubscription(subscriptionId);

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "paused" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "PAUSE_SUBSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to pause copy subscription",
        },
      },
      500
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
    await copyTradingService.resumeSubscription(subscriptionId);

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "active" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "RESUME_SUBSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to resume copy subscription",
        },
      },
      500
    );
  }
});

/**
 * Cancel copy subscription
 */
app.delete("/copy/subscriptions/:subscriptionId", async (c) => {
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    await copyTradingService.cancelSubscription(subscriptionId);

    return c.json({
      success: true,
      data: { id: subscriptionId, status: "cancelled" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CANCEL_SUBSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to cancel copy subscription",
        },
      },
      500
    );
  }
});

/**
 * Get copy trades for a subscription
 */
app.get("/copy/subscriptions/:subscriptionId/trades", async (c) => {
  const subscriptionId = c.req.param("subscriptionId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  try {
    const trades = await copyTradingService.getCopyTrades({
      subscriptionId,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: trades,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_TRADES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get copy trades",
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

  try {
    const subscription = await copyTradingService.getSubscription(subscriptionId);

    return c.json({
      success: true,
      data: subscription,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_ANALYTICS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get copy trading analytics",
        },
      },
      500
    );
  }
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
    const leaderboard = await leaderboardService.getLeaderboard({
      leaderboardType: type as "pnl" | "pnl_percent" | "sharpe_ratio" | "win_rate" | "total_trades" | "followers" | "copiers" | "reputation",
      period: period as "daily" | "weekly" | "monthly" | "all_time",
      assetClass,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: leaderboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_LEADERBOARD_FAILED",
          message: error instanceof Error ? error.message : "Failed to get leaderboard",
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
    const rank = await leaderboardService.getMyRank({
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
    return c.json(
      {
        success: false,
        error: {
          code: "GET_RANK_FAILED",
          message: error instanceof Error ? error.message : "Failed to get leaderboard rank",
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

  try {
    const history = await leaderboardService.getLeaderboardHistory({
      userId,
      leaderboardType: type,
      period,
      limit,
    });

    return c.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_HISTORY_FAILED",
          message: error instanceof Error ? error.message : "Failed to get leaderboard history",
        },
      },
      500
    );
  }
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  // Feature protected by feature flag - Convex integration pending
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

  try {
    const feed = await socialGraphService.getActivityFeed({
      userId,
      feedType: feedType as "following" | "discover" | "notifications",
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_FEED_FAILED",
          message: error instanceof Error ? error.message : "Failed to get activity feed",
        },
      },
      500
    );
  }
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

  try {
    const notifications = await socialGraphService.getNotifications({
      userId,
      unreadOnly,
      limit,
    });

    return c.json({
      success: true,
      data: notifications,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_NOTIFICATIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get notifications",
        },
      },
      500
    );
  }
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

  try {
    await socialGraphService.markNotificationsRead({
      userId,
      itemIds: body.itemIds,
      all: body.all,
    });

    return c.json({
      success: true,
      data: { marked: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "MARK_READ_FAILED",
          message: error instanceof Error ? error.message : "Failed to mark notifications as read",
        },
      },
      500
    );
  }
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

  try {
    const commentId = await positionCommentsService.createComment({
      authorId: userId,
      traderId: userId,
      positionId: body.positionId,
      orderId: body.orderId,
      tradeId: body.tradeId,
      content: body.content,
      contentType: body.contentType,
      parentCommentId: body.parentCommentId,
    });

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
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CREATE_COMMENT_FAILED",
          message: error instanceof Error ? error.message : "Failed to create comment",
        },
      },
      500
    );
  }
});

/**
 * Get comments for a position
 */
app.get("/comments/position/:positionId", async (c) => {
  const positionId = c.req.param("positionId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  try {
    const comments = await positionCommentsService.getPositionComments({
      positionId,
      limit,
    });

    return c.json({
      success: true,
      data: comments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_COMMENTS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get comments",
        },
      },
      500
    );
  }
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

  try {
    await positionCommentsService.likeComment({
      commentId,
      userId,
    });

    return c.json({
      success: true,
      data: { liked: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "LIKE_COMMENT_FAILED",
          message: error instanceof Error ? error.message : "Failed to like comment",
        },
      },
      500
    );
  }
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

  try {
    await positionCommentsService.unlikeComment({
      commentId,
      userId,
    });

    return c.json({
      success: true,
      data: { unliked: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNLIKE_COMMENT_FAILED",
          message: error instanceof Error ? error.message : "Failed to unlike comment",
        },
      },
      500
    );
  }
});

export { app as socialRoutes };
