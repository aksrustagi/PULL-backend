import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// FOLLOW ENDPOINTS
// ============================================================================

/**
 * Follow a user
 * POST /social/follow/:userId
 */
app.post("/follow/:userId", async (c) => {
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

  if (currentUserId === targetUserId) {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: "Cannot follow yourself" },
      },
      400
    );
  }

  // TODO: Call Convex mutation - copyTrading.follow
  // const followId = await convex.mutation(api.copyTrading.follow, {
  //   followerId: currentUserId,
  //   followedId: targetUserId,
  // });

  return c.json({
    success: true,
    data: {
      followerId: currentUserId,
      followedId: targetUserId,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Unfollow a user
 * DELETE /social/follow/:userId
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

  // TODO: Call Convex mutation - copyTrading.unfollow
  // await convex.mutation(api.copyTrading.unfollow, {
  //   followerId: currentUserId,
  //   followedId: targetUserId,
  // });

  return c.json({
    success: true,
    data: {
      followerId: currentUserId,
      followedId: targetUserId,
      unfollowedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get followers of the current user
 * GET /social/followers
 */
app.get("/followers", async (c) => {
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

  // TODO: Call Convex query - copyTrading.getFollowers
  // const result = await convex.query(api.copyTrading.getFollowers, {
  //   userId,
  //   limit,
  //   cursor,
  // });

  return c.json({
    success: true,
    data: {
      followers: [],
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get users the current user is following
 * GET /social/following
 */
app.get("/following", async (c) => {
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

  // TODO: Call Convex query - copyTrading.getFollowing
  // const result = await convex.query(api.copyTrading.getFollowing, {
  //   userId,
  //   limit,
  //   cursor,
  // });

  return c.json({
    success: true,
    data: {
      following: [],
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// COPY SETTINGS ENDPOINTS
// ============================================================================

const copySettingsSchema = z.object({
  traderId: z.string(),
  allocationPct: z.number().min(0).max(100),
  maxPositionSize: z.number().positive(),
  active: z.boolean(),
  riskLevel: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  copyStopLoss: z.boolean().optional(),
  copyTakeProfit: z.boolean().optional(),
  minTradeSize: z.number().positive().optional(),
  excludedAssets: z.array(z.string()).optional(),
});

/**
 * Create or update copy settings
 * POST /social/copy-settings
 */
app.post(
  "/copy-settings",
  zValidator("json", copySettingsSchema),
  async (c) => {
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
          error: { code: "BAD_REQUEST", message: "Cannot copy your own trades" },
        },
        400
      );
    }

    // TODO: Call Convex mutation - copyTrading.upsertCopySettings
    // const settingsId = await convex.mutation(api.copyTrading.upsertCopySettings, {
    //   userId,
    //   ...body,
    // });

    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        userId,
        ...body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Get copy settings for current user
 * GET /social/copy-settings
 */
app.get("/copy-settings", async (c) => {
  const userId = c.get("userId");
  const traderId = c.req.query("traderId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  if (traderId) {
    // Get settings for a specific trader
    // TODO: Call Convex query - copyTrading.getCopySettings
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  }

  // Get all active copy settings
  // TODO: Call Convex query - copyTrading.getActiveCopySettings
  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Deactivate copy settings for a trader
 * DELETE /social/copy-settings/:traderId
 */
app.delete("/copy-settings/:traderId", async (c) => {
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

  // TODO: Call Convex mutation - copyTrading.deactivateCopySettings
  // await convex.mutation(api.copyTrading.deactivateCopySettings, {
  //   userId,
  //   traderId,
  // });

  return c.json({
    success: true,
    data: {
      userId,
      traderId,
      deactivatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// LEADERBOARD ENDPOINT
// ============================================================================

/**
 * Get trader leaderboard
 * GET /social/leaderboard
 */
app.get("/leaderboard", async (c) => {
  const sortBy = c.req.query("sortBy") as
    | "totalReturn"
    | "sharpeRatio"
    | "winRate"
    | "followerCount"
    | undefined;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // TODO: Call Convex query - copyTrading.getLeaderboard
  // const result = await convex.query(api.copyTrading.getLeaderboard, {
  //   sortBy,
  //   limit,
  //   offset,
  // });

  return c.json({
    success: true,
    data: {
      leaderboard: [],
      total: 0,
      hasMore: false,
    },
    pagination: {
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: offset > 0,
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as socialRoutes };
