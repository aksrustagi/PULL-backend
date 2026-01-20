import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

/**
 * Get points balance
 */
app.get("/balance", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      available: 0,
      pending: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
      tier: "bronze",
      nextTier: "silver",
      pointsToNextTier: 10000,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get points history
 */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get available rewards
 */
app.get("/catalog", async (c) => {
  const category = c.req.query("category");
  const featured = c.req.query("featured") === "true";

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Process redemption via Convex

  return c.json({
    success: true,
    data: {
      redemptionId: crypto.randomUUID(),
      rewardId: body.rewardId,
      status: "pending",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get leaderboard
 */
app.get("/leaderboard", async (c) => {
  const period = c.req.query("period") ?? "weekly";
  const limit = parseInt(c.req.query("limit") ?? "100", 10);

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Claim daily streak bonus
 */
app.post("/daily-streak", async (c) => {
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

  // TODO: Process via Convex

  return c.json({
    success: true,
    data: {
      bonusAmount: 10,
      streakDays: 1,
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as rewardsRoutes };
