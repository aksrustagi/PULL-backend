import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { parseIntSafe } from "../utils/validation";
import { convex, api } from "../lib/convex";

const app = new Hono<Env>();

/**
 * Get points balance
 */
app.get("/balance", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const balance = await convex.query(api.rewards.getBalance, {
      userId: userId as any,
    });

    return c.json({
      success: true,
      data: balance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching balance:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch balance" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get points history
 */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const type = c.req.query("type");
  const limit = parseIntSafe(c.req.query("limit"), 50);
  const offset = parseIntSafe(c.req.query("offset"), 0);
  const page = parseIntSafe(c.req.query("page"), 1);

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const calculatedOffset = offset || (page - 1) * limit;

    const result = await convex.query(api.rewards.getHistory, {
      userId: userId as any,
      type: type || undefined,
      limit,
      offset: calculatedOffset,
    });

    const totalPages = Math.ceil(result.total / limit);
    const currentPage = Math.floor(calculatedOffset / limit) + 1;

    return c.json({
      success: true,
      data: result.transactions,
      pagination: {
        page: currentPage,
        pageSize: limit,
        totalItems: result.total,
        totalPages,
        hasNextPage: result.hasMore,
        hasPreviousPage: currentPage > 1,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching history:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch points history" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get available rewards
 */
app.get("/catalog", async (c) => {
  const category = c.req.query("category");
  const featured = c.req.query("featured") === "true";
  const requestId = c.get("requestId");

  try {
    const rewards = await convex.query(api.rewards.getCatalog, {
      category: category || undefined,
      featured: featured || undefined,
    });

    return c.json({
      success: true,
      data: rewards,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching catalog:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch rewards catalog" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

const redeemSchema = z.object({
  rewardId: z.string(),
  quantity: z.number().int().positive().default(1),
  shippingAddress: z
    .object({
      name: z.string(),
      addressLine1: z.string(),
      addressLine2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
    })
    .optional(),
});

/**
 * Redeem points for a reward
 */
app.post("/redeem", zValidator("json", redeemSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const result = await convex.mutation(api.rewards.redeem, {
      userId: userId as any,
      rewardId: body.rewardId as any,
      quantity: body.quantity,
      shippingAddress: body.shippingAddress,
    });

    return c.json({
      success: true,
      data: {
        redemptionId: result.redemptionId,
        rewardId: body.rewardId,
        status: result.status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error redeeming reward:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Handle specific error cases
    if (errorMessage.includes("Insufficient points")) {
      return c.json(
        {
          success: false,
          error: { code: "INSUFFICIENT_POINTS", message: "You do not have enough points for this reward" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    if (errorMessage.includes("out of stock")) {
      return c.json(
        {
          success: false,
          error: { code: "OUT_OF_STOCK", message: "This reward is currently out of stock" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    if (errorMessage.includes("not found")) {
      return c.json(
        {
          success: false,
          error: { code: "REWARD_NOT_FOUND", message: "Reward not found" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    if (errorMessage.includes("not active")) {
      return c.json(
        {
          success: false,
          error: { code: "REWARD_INACTIVE", message: "This reward is no longer available" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: { code: "REDEEM_FAILED", message: "Failed to redeem reward" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get leaderboard
 */
app.get("/leaderboard", async (c) => {
  const period = c.req.query("period") ?? "weekly";
  const limit = parseIntSafe(c.req.query("limit"), 100);
  const requestId = c.get("requestId");

  try {
    const leaderboard = await convex.query(api.rewards.getLeaderboard, {
      period,
      limit,
    });

    return c.json({
      success: true,
      data: leaderboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching leaderboard:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch leaderboard" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Claim daily streak bonus
 */
app.post("/daily-streak", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const result = await convex.mutation(api.rewards.claimDailyStreak, {
      userId: userId as any,
    });

    return c.json({
      success: true,
      data: {
        bonusAmount: result.bonusAmount,
        streakDays: result.streakDays,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error claiming daily streak:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("Already claimed today")) {
      return c.json(
        {
          success: false,
          error: { code: "ALREADY_CLAIMED", message: "You have already claimed your daily streak bonus today" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: { code: "CLAIM_FAILED", message: "Failed to claim daily streak bonus" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as rewardsRoutes };
