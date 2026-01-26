import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { engagementService } from "@pull/core/services/engagement";
import { requireFeature } from "../lib/feature-flags";
import { getConvexClient, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";
import { getLogger } from "@pull/core/services";

const logger = getLogger("engagement");

const app = new Hono<Env>();

// Protect advanced engagement routes - viral growth features are not production-ready
app.use("*", requireFeature("viral_growth", "Engagement & Gamification"));

const claimDailySchema = z.object({
  challengeId: z.string().optional(),
});

/**
 * GET /api/v1/engagement/streak
 * Get user's current streak
 */
app.get("/streak", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const streak = await engagementService.updateStreak(userId);

  return c.json({
    success: true,
    data: streak,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/engagement/claim-daily
 * Claim daily challenge reward
 */
app.post("/claim-daily", zValidator("json", claimDailySchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { challengeId } = c.req.valid("json");

  try {
    const convex = getConvexClient();

    // Get today's date key for idempotency
    const today = new Date().toISOString().split("T")[0];
    const claimKey = challengeId ?? `daily-${today}`;

    // Check if already claimed today
    const existingClaim = await convex.query(api.rewards.getDailyClaim, {
      userId: userId as Id<"users">,
      claimKey,
    });

    if (existingClaim) {
      return c.json({
        success: false,
        error: { code: "ALREADY_CLAIMED", message: "Daily challenge already claimed" },
        timestamp: new Date().toISOString(),
      }, 400);
    }

    // Get challenge details (if specific challenge requested)
    let xpReward = 50; // Default daily XP
    let challengeName = "Daily Login";

    if (challengeId) {
      const challenge = await convex.query(api.rewards.getChallenge, {
        challengeId: challengeId as Id<"challenges">,
      });

      if (!challenge) {
        return c.json({
          success: false,
          error: { code: "CHALLENGE_NOT_FOUND", message: "Challenge not found" },
          timestamp: new Date().toISOString(),
        }, 404);
      }

      // Verify challenge is completable
      if (challenge.status !== "active") {
        return c.json({
          success: false,
          error: { code: "CHALLENGE_INACTIVE", message: "Challenge is not active" },
          timestamp: new Date().toISOString(),
        }, 400);
      }

      xpReward = challenge.xpReward ?? 50;
      challengeName = challenge.name ?? "Daily Challenge";
    }

    // Record the claim
    await convex.mutation(api.rewards.recordDailyClaim, {
      userId: userId as Id<"users">,
      claimKey,
      xpEarned: xpReward,
      challengeId: challengeId as Id<"challenges"> | undefined,
    });

    // Award XP
    await engagementService.addXP(userId, xpReward, "daily_challenge");

    logger.info("Daily challenge claimed", { userId, challengeId, xpReward });

    return c.json({
      success: true,
      data: {
        xpEarned: xpReward,
        challengeName,
        message: "Daily challenge claimed successfully",
        claimedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to claim daily challenge", { userId, challengeId, error });
    return c.json({
      success: false,
      error: { code: "CLAIM_FAILED", message: error instanceof Error ? error.message : "Failed to claim challenge" },
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * GET /api/v1/engagement/season-pass
 * Get season pass progress
 */
app.get("/season-pass", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const season = c.req.query("season") ?? "2024";
  const seasonPass = await engagementService.getSeasonPass(userId, season);

  return c.json({
    success: true,
    data: seasonPass,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/engagement/year-in-review
 * Generate year-in-review
 */
app.get("/year-in-review", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const year = parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);

  if (isNaN(year)) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid year" } }, 400);
  }

  const review = await engagementService.generateYearInReview(userId, year);

  return c.json({
    success: true,
    data: review,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/engagement/mint-trophy
 * Mint championship NFT trophy
 */
app.post("/mint-trophy", zValidator("json", z.object({
  leagueId: z.string(),
  seasonId: z.string(),
  trophyType: z.enum(["champion", "runner_up", "third_place", "most_points", "best_trade"]).default("champion"),
})), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { leagueId, seasonId, trophyType } = c.req.valid("json");

  // TODO: Verify user is eligible for this trophy
  const trophy = await engagementService.mintChampionshipTrophy(leagueId, seasonId, userId);

  return c.json({
    success: true,
    data: trophy,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/engagement/daily-challenges
 * Get daily challenges
 */
app.get("/daily-challenges", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const sport = c.req.query("sport") ?? "nfl";
  const date = new Date();

  const challenge = await engagementService.getDailyChallenge(sport, date);

  return c.json({
    success: true,
    data: { challenge },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/engagement/revenge-games
 * Get upcoming revenge games for user's players
 */
app.get("/revenge-games", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const alerts = await engagementService.detectRevengeGames(userId);

  return c.json({
    success: true,
    data: { alerts },
    timestamp: new Date().toISOString(),
  });
});

export default app;
