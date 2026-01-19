/**
 * Rewards Routes
 *
 * Handles points balance, transactions, redemptions, and sweepstakes.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env, RewardsStatus, PointsTransaction } from "../types";

const rewardsRouter = new Hono<Env>();

let temporal: TemporalClient | null = null;
let convex: ConvexHttpClient | null = null;

async function getTemporalClient(): Promise<TemporalClient> {
  if (!temporal) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    });
    temporal = new TemporalClient({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || "default",
    });
  }
  return temporal;
}

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const redeemSchema = z.object({
  redemptionType: z.enum([
    "sweepstakes_entry",
    "prize_purchase",
    "pull_token_conversion",
    "fee_discount",
    "premium_feature",
  ]),
  itemId: z.string().optional(),
  pointsCost: z.number().positive(),
  quantity: z.number().positive().optional().default(1),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Get rewards status
 * GET /rewards/status
 */
rewardsRouter.get("/status", async (c) => {
  const userId = c.get("userId");
  const convex = getConvex();

  const user = await convex.query(api.functions.users.getById, {
    id: userId as any,
  });

  if (!user) {
    return c.json(
      {
        error: {
          message: "User not found",
          code: "USER_NOT_FOUND",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  const stats = await convex.query(api.functions.rewards.getStats, {
    userId: userId as any,
  });

  // Calculate tier
  const tierThresholds = {
    bronze: 0,
    silver: 1000,
    gold: 5000,
    platinum: 25000,
    diamond: 100000,
  };

  let tierLevel: keyof typeof tierThresholds = "bronze";
  let nextTierAt = tierThresholds.silver;

  for (const [tier, threshold] of Object.entries(tierThresholds)) {
    if (stats.lifetimeEarned >= threshold) {
      tierLevel = tier as keyof typeof tierThresholds;
    } else {
      nextTierAt = threshold;
      break;
    }
  }

  const tierProgress =
    tierLevel === "diamond"
      ? 100
      : ((stats.lifetimeEarned - tierThresholds[tierLevel]) /
          (nextTierAt - tierThresholds[tierLevel])) *
        100;

  return c.json({
    data: {
      pointsBalance: user.pointsBalance,
      lifetimeEarned: stats.lifetimeEarned,
      lifetimeRedeemed: stats.lifetimeRedeemed,
      currentStreak: stats.currentStreak,
      tierLevel,
      tierProgress: Math.round(tierProgress),
      nextTierAt,
    } as RewardsStatus,
  });
});

/**
 * Get points transaction history
 * GET /rewards/transactions
 */
rewardsRouter.get("/transactions", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type") as "earn" | "redeem" | undefined;
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  const transactions = await convex.query(api.functions.rewards.getTransactions, {
    userId: userId as any,
    type,
    limit,
  });

  return c.json({
    data: transactions.map((t: any) => ({
      id: t._id,
      amount: t.amount,
      type: t.type,
      source: t.source,
      description: t.description,
      createdAt: new Date(t.createdAt).toISOString(),
    })),
    meta: {
      total: transactions.length,
      limit,
    },
  });
});

/**
 * Redeem points
 * POST /rewards/redeem
 */
rewardsRouter.post("/redeem", zValidator("json", redeemSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const convex = getConvex();

  // Check balance
  const user = await convex.query(api.functions.users.getById, {
    id: userId as any,
  });

  if (!user || user.pointsBalance < body.pointsCost) {
    return c.json(
      {
        error: {
          message: "Insufficient points balance",
          code: "INSUFFICIENT_POINTS",
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  // Start redemption workflow
  const temporal = await getTemporalClient();
  const workflowId = `redeem-${userId}-${Date.now()}`;

  const handle = await temporal.workflow.start("RedeemPointsWorkflow", {
    taskQueue: "rewards",
    workflowId,
    args: [
      {
        userId,
        ...body,
      },
    ],
  });

  // Wait for result (redemptions are usually fast)
  const result = await handle.result();

  if (!result.success) {
    return c.json(
      {
        error: {
          message: result.error || "Redemption failed",
          code: "REDEMPTION_FAILED",
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  return c.json({
    data: {
      redemptionId: result.redemptionId,
      newBalance: result.newBalance,
      tokensReceived: result.tokensReceived,
      message: "Points redeemed successfully",
    },
  });
});

/**
 * Get available sweepstakes
 * GET /rewards/sweepstakes
 */
rewardsRouter.get("/sweepstakes", async (c) => {
  const status = c.req.query("status") as "upcoming" | "active" | "closed" | undefined;

  const convex = getConvex();

  const sweepstakes = await convex.query(api.functions.rewards.getSweepstakes, {
    status,
  });

  return c.json({
    data: sweepstakes,
  });
});

/**
 * Get user's sweepstakes entries
 * GET /rewards/sweepstakes/entries
 */
rewardsRouter.get("/sweepstakes/entries", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const entries = await convex.query(api.functions.rewards.getUserEntries, {
    userId: userId as any,
  });

  return c.json({
    data: entries,
  });
});

/**
 * Get achievements
 * GET /rewards/achievements
 */
rewardsRouter.get("/achievements", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const achievements = await convex.query(api.functions.rewards.getAchievements, {
    userId: userId as any,
  });

  return c.json({
    data: achievements,
  });
});

/**
 * Get leaderboard
 * GET /rewards/leaderboard
 */
rewardsRouter.get("/leaderboard", async (c) => {
  const period = c.req.query("period") as "daily" | "weekly" | "monthly" | "allTime" || "weekly";
  const limit = parseInt(c.req.query("limit") || "100", 10);

  const convex = getConvex();

  const leaderboard = await convex.query(api.functions.rewards.getLeaderboard, {
    period,
    limit,
  });

  return c.json({
    data: leaderboard,
    meta: {
      period,
      limit,
    },
  });
});

/**
 * Get conversion rate for $PULL tokens
 * GET /rewards/conversion-rate
 */
rewardsRouter.get("/conversion-rate", async (c) => {
  // Points to $PULL conversion rate
  const pointsPerToken = 1000;
  const minConversion = 1000; // Minimum 1000 points (1 token)

  return c.json({
    data: {
      pointsPerToken,
      minConversion,
      currentRate: 1 / pointsPerToken,
      estimatedGas: "0.01", // Estimated gas in MATIC
    },
  });
});

export { rewardsRouter };
