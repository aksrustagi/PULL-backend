/**
 * Streaks API Routes
 * REST endpoints for streak multipliers and protection
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  GetStreakRequestSchema,
  RecordBetResultRequestSchema,
  PurchaseProtectionRequestSchema,
  ClaimMilestoneRequestSchema,
  GetLeaderboardRequestSchema,
  StreakTypeSchema,
  ProtectionTypeSchema,
  MULTIPLIER_TIERS,
  PROTECTION_PRICING,
} from "@pull/core/services/streaks";

const app = new Hono<Env>();

// ============================================================================
// STREAK MANAGEMENT
// ============================================================================

/**
 * Get current streak
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type") ?? "win";
  const category = c.req.query("category");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const currentTier = MULTIPLIER_TIERS[0];
    const nextTier = MULTIPLIER_TIERS[1];

    return c.json({
      success: true,
      data: {
        streak: {
          id: crypto.randomUUID(),
          userId,
          type,
          status: "active",
          currentStreak: 0,
          longestStreak: 0,
          currentMultiplier: 1.0,
          streakBetIds: [],
          totalStreakWinnings: 0,
          totalMultiplierBonus: 0,
          category,
          isProtected: false,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        currentTier,
        nextTier,
        winsToNextTier: nextTier.streakLength,
        availableMilestones: [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STREAK_FAILED",
          message: error instanceof Error ? error.message : "Failed to get streak",
        },
      },
      500
    );
  }
});

/**
 * Get all user streaks
 */
app.get("/all", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { streaks: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STREAKS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get streaks",
        },
      },
      500
    );
  }
});

/**
 * Record bet result (updates streak)
 */
app.post("/record", zValidator("json", RecordBetResultRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        streak: {
          id: crypto.randomUUID(),
          userId,
          type: "win",
          status: "active",
          currentStreak: body.outcome === "won" ? 1 : 0,
          longestStreak: body.outcome === "won" ? 1 : 0,
          currentMultiplier: 1.0,
          streakBetIds: [body.betId],
          totalStreakWinnings: body.winnings ?? 0,
          totalMultiplierBonus: 0,
          isProtected: false,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        multiplierApplied: 1.0,
        bonusAmount: 0,
        protectionUsed: false,
        streakBroken: body.outcome === "lost",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "RECORD_RESULT_FAILED",
          message: error instanceof Error ? error.message : "Failed to record result",
        },
      },
      500
    );
  }
});

// ============================================================================
// MULTIPLIER INFO
// ============================================================================

/**
 * Get multiplier tiers
 */
app.get("/tiers", async (c) => {
  try {
    return c.json({
      success: true,
      data: { tiers: MULTIPLIER_TIERS },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_TIERS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get tiers",
        },
      },
      500
    );
  }
});

/**
 * Calculate potential bonus
 */
app.get("/calculate", async (c) => {
  const userId = c.get("userId");
  const potentialWinnings = parseFloat(c.req.query("winnings") ?? "100");
  const currentStreak = parseInt(c.req.query("streak") ?? "0", 10);

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    // Find current tier
    let currentTier = MULTIPLIER_TIERS[0];
    for (const tier of MULTIPLIER_TIERS) {
      if (currentStreak >= tier.streakLength) {
        currentTier = tier;
      }
    }

    // Find next tier
    let nextTier = MULTIPLIER_TIERS[0];
    for (const tier of MULTIPLIER_TIERS) {
      if (currentStreak + 1 >= tier.streakLength) {
        nextTier = tier;
      }
    }

    return c.json({
      success: true,
      data: {
        currentMultiplier: currentTier.multiplier,
        nextMultiplier: nextTier.multiplier,
        currentBonus: potentialWinnings * (currentTier.multiplier - 1),
        nextBonus: potentialWinnings * (nextTier.multiplier - 1),
        multiplierIncrease: nextTier.multiplier - currentTier.multiplier,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CALCULATE_BONUS_FAILED",
          message: error instanceof Error ? error.message : "Failed to calculate bonus",
        },
      },
      500
    );
  }
});

// ============================================================================
// PROTECTION
// ============================================================================

/**
 * Get protection pricing
 */
app.get("/protection/pricing", async (c) => {
  const userId = c.get("userId");
  const streakId = c.req.query("streakId");

  try {
    return c.json({
      success: true,
      data: { pricing: PROTECTION_PRICING },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_PRICING_FAILED",
          message: error instanceof Error ? error.message : "Failed to get pricing",
        },
      },
      500
    );
  }
});

/**
 * Purchase streak protection
 */
app.post("/protection/purchase", zValidator("json", PurchaseProtectionRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const pricing = PROTECTION_PRICING.find((p) => p.type === body.type);
    const price = pricing?.basePrice ?? 5;

    return c.json({
      success: true,
      data: {
        protection: {
          id: crypto.randomUUID(),
          streakId: body.streakId,
          userId,
          type: body.type,
          usesRemaining: body.type === "two_loss" ? 2 : 1,
          maxUses: body.type === "two_loss" ? 2 : 1,
          refundPercent: body.type === "insurance" ? 50 : undefined,
          purchasePrice: price,
          purchasedAt: Date.now(),
          usedCount: 0,
          savedStreaks: 0,
        },
        price,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "PURCHASE_PROTECTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to purchase protection",
        },
      },
      500
    );
  }
});

/**
 * Get active protections
 */
app.get("/protection", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { protections: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_PROTECTIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get protections",
        },
      },
      500
    );
  }
});

// ============================================================================
// MILESTONES
// ============================================================================

/**
 * Get milestones
 */
app.get("/milestones", async (c) => {
  const userId = c.get("userId");
  const claimed = c.req.query("claimed");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { milestones: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_MILESTONES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get milestones",
        },
      },
      500
    );
  }
});

/**
 * Claim a milestone
 */
app.post("/milestones/:milestoneId/claim", async (c) => {
  const userId = c.get("userId");
  const milestoneId = c.req.param("milestoneId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        milestone: {
          id: milestoneId,
          userId,
          claimed: true,
          claimedAt: Date.now(),
        },
        rewards: [],
        totalValue: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CLAIM_MILESTONE_FAILED",
          message: error instanceof Error ? error.message : "Failed to claim milestone",
        },
      },
      500
    );
  }
});

// ============================================================================
// LEADERBOARD
// ============================================================================

/**
 * Get streak leaderboard
 */
app.get("/leaderboard/:period", async (c) => {
  const period = c.req.param("period") as "daily" | "weekly" | "monthly" | "all_time";
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  try {
    return c.json({
      success: true,
      data: {
        entries: [],
        period,
      },
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
app.get("/leaderboard/:period/me", async (c) => {
  const userId = c.get("userId");
  const period = c.req.param("period") as "daily" | "weekly" | "monthly" | "all_time";

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_POSITION_FAILED",
          message: error instanceof Error ? error.message : "Failed to get position",
        },
      },
      500
    );
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get streak analytics
 */
app.get("/analytics", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        userId,
        totalStreaks: 0,
        activeStreaks: 0,
        brokenStreaks: 0,
        averageStreakLength: 0,
        longestStreak: 0,
        totalBonusEarned: 0,
        totalProtectionsPurchased: 0,
        protectionsUsed: 0,
        protectionsSaved: 0,
        milestonesAchieved: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_ANALYTICS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get analytics",
        },
      },
      500
    );
  }
});

/**
 * Get global streak stats
 */
app.get("/stats/global", async (c) => {
  try {
    return c.json({
      success: true,
      data: {
        activeStreaks: 0,
        totalBonusesPaidToday: 0,
        longestActiveStreak: 0,
        averageStreakLength: 0,
        topStreakers: [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_GLOBAL_STATS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get global stats",
        },
      },
      500
    );
  }
});

export { app as streaksRoutes };
