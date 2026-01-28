/**
 * Viral Growth API Routes
 *
 * REST endpoints for killer features 11-15:
 * - Market Maker Mode
 * - Bracket Battles
 * - Achievement System
 * - Copy Trading
 * - Daily Challenges
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { api } from "@pull/db/convex/_generated/api";
import { toUserId } from "../lib/convex-types";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// ============================================================================
// MARKET MAKER ROUTES
// ============================================================================

const createPositionSchema = z.object({
  marketId: z.string(),
  capital: z.number().positive(),
  riskLevel: z.enum(["conservative", "moderate", "aggressive", "custom"]).optional(),
  bidSpread: z.number().min(0.001).max(0.5).optional(),
  askSpread: z.number().min(0.001).max(0.5).optional(),
  maxPositionSize: z.number().positive(),
  stopLossPercent: z.number().min(0.01).max(0.5).optional(),
});

const updatePositionSchema = z.object({
  bidSpread: z.number().min(0.001).max(0.5).optional(),
  askSpread: z.number().min(0.001).max(0.5).optional(),
  maxPositionSize: z.number().positive().optional(),
  stopLossPercent: z.number().min(0.01).max(0.5).optional(),
});

/**
 * Create market maker position
 * NOTE: Market maker Convex operations not yet implemented
 */
app.post("/market-maker/positions", requireFeature("marketMaker"), zValidator("json", createPositionSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Market maker feature requires Convex schema implementation
  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker positions coming soon" }
  }, 501);
});

/**
 * Get user's market maker positions
 */
app.get("/market-maker/positions", requireFeature("marketMaker"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker positions coming soon" }
  }, 501);
});

/**
 * Update market maker position
 */
app.patch("/market-maker/positions/:positionId", requireFeature("marketMaker"), zValidator("json", updatePositionSchema), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker positions coming soon" }
  }, 501);
});

/**
 * Pause market maker position
 */
app.post("/market-maker/positions/:positionId/pause", requireFeature("marketMaker"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker positions coming soon" }
  }, 501);
});

/**
 * Stop market maker position
 */
app.post("/market-maker/positions/:positionId/stop", requireFeature("marketMaker"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker positions coming soon" }
  }, 501);
});

/**
 * Get market maker statistics
 */
app.get("/market-maker/stats", requireFeature("marketMaker"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker stats coming soon" }
  }, 501);
});

/**
 * Get liquidity pools
 */
app.get("/market-maker/pools", requireFeature("marketMaker"), async (c) => {
  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker pools coming soon" }
  }, 501);
});

/**
 * Join a liquidity pool
 */
app.post("/market-maker/pools/:poolId/join", requireFeature("marketMaker"), zValidator("json", z.object({ amount: z.number().positive() })), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Market maker pools coming soon" }
  }, 501);
});

// ============================================================================
// BRACKET BATTLES ROUTES
// ============================================================================

const createBracketSchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1).max(50),
  poolId: z.string().optional(),
  isPublic: z.boolean().default(true),
});

const updateBracketSchema = z.object({
  picks: z.array(z.object({
    gameId: z.string(),
    pickedTeamId: z.string(),
  })),
  champion: z.string().optional(),
});

const createPoolSchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  poolType: z.enum(["free", "paid", "tiered", "private"]),
  isPublic: z.boolean().default(true),
  entryFee: z.number().min(0),
  maxEntries: z.number().min(2).max(10000).default(1000),
  scoringSystem: z.enum(["standard", "weighted", "upset_bonus", "seed_weighted", "progressive"]).default("weighted"),
});

/**
 * Get tournaments
 */
app.get("/brackets/tournaments", requireFeature("bracketBattles"), async (c) => {
  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Get tournament details
 */
app.get("/brackets/tournaments/:tournamentId", requireFeature("bracketBattles"), async (c) => {
  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Create bracket
 */
app.post("/brackets", requireFeature("bracketBattles"), zValidator("json", createBracketSchema), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Update bracket picks
 */
app.patch("/brackets/:bracketId", requireFeature("bracketBattles"), zValidator("json", updateBracketSchema), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Submit bracket
 */
app.post("/brackets/:bracketId/submit", requireFeature("bracketBattles"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Get user's brackets
 */
app.get("/brackets/me", requireFeature("bracketBattles"), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Create bracket pool
 */
app.post("/brackets/pools", requireFeature("bracketBattles"), zValidator("json", createPoolSchema), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Get pool leaderboard
 */
app.get("/brackets/pools/:poolId/leaderboard", requireFeature("bracketBattles"), async (c) => {
  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

/**
 * Join bracket pool
 */
app.post("/brackets/pools/:poolId/join", requireFeature("bracketBattles"), zValidator("json", z.object({ bracketId: z.string(), inviteCode: z.string().optional() })), async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  return c.json({
    success: false,
    error: { code: "NOT_IMPLEMENTED", message: "Bracket battles coming soon" }
  }, 501);
});

// ============================================================================
// ACHIEVEMENT SYSTEM ROUTES
// ============================================================================

/**
 * Get all achievements
 */
app.get("/achievements", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const category = c.req.query("category");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const achievements = await convex.query(api.gamification.getAchievements, {
    userId: toUserId(userId),
    category: category || undefined,
  });

  // Group by category
  const byCategory: Record<string, typeof achievements> = {};
  for (const achievement of achievements) {
    const cat = achievement.category;
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(achievement);
  }

  return c.json({
    success: true,
    data: { achievements, byCategory },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get user's achievements
 */
app.get("/achievements/me", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const achievements = await convex.query(api.gamification.getAchievements, {
    userId: toUserId(userId),
  });

  // Filter to only unlocked achievements
  const unlockedAchievements = achievements.filter((a) => a.unlocked);

  return c.json({
    success: true,
    data: unlockedAchievements,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get achievement statistics
 */
app.get("/achievements/stats", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const achievements = await convex.query(api.gamification.getAchievements, {
    userId: toUserId(userId),
  });

  const totalUnlocked = achievements.filter((a) => a.unlocked).length;
  const totalAvailable = achievements.length;
  const totalPoints = achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + (a.pointsReward ?? 0), 0);

  const stats = {
    userId,
    totalUnlocked,
    totalAvailable,
    percentComplete: totalAvailable > 0 ? Math.round((totalUnlocked / totalAvailable) * 100) : 0,
    totalPoints,
  };

  return c.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

/**
 * Claim achievement rewards
 * NOTE: Achievements auto-claim rewards on unlock in gamification.ts
 */
app.post("/achievements/:achievementId/claim", async (c) => {
  const userId = c.get("userId");
  const achievementId = c.req.param("achievementId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Achievement rewards are auto-credited on unlock
  return c.json({
    success: true,
    data: { achievementId, message: "Rewards are automatically credited when achievements are unlocked" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Update achievement display
 */
app.patch("/achievements/:achievementId/display", zValidator("json", z.object({ isDisplayed: z.boolean(), displayOrder: z.number().optional() })), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const achievementId = c.req.param("achievementId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  await convex.mutation(api.gamification.toggleAchievementDisplay, {
    userId: toUserId(userId),
    achievementId: achievementId as any,
    displayed: body.isDisplayed,
  });

  return c.json({
    success: true,
    data: { achievementId, ...body, updated: true },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get achievement leaderboard
 */
app.get("/achievements/leaderboard", async (c) => {
  const convex = c.get("convex");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);

  const leaderboard = await convex.query(api.gamification.getLeaderboard, {
    period: "alltime",
    type: "points",
    limit,
  });

  return c.json({
    success: true,
    data: leaderboard.entries,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// COPY TRADING ROUTES
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
  copyAssetClasses: z.array(z.string()).min(1),
  allocatedCapital: z.number().positive(),
});

const updateCopySubscriptionSchema = createCopySubscriptionSchema.partial().omit({ traderId: true });

/**
 * Get copy trading leaderboard
 */
app.get("/copy-trading/leaderboard", async (c) => {
  const convex = c.get("convex");
  const type = c.req.query("type") ?? "pnl_percent";
  const period = c.req.query("period") ?? "monthly";
  const limit = parseInt(c.req.query("limit") ?? "100", 10);

  const leaderboard = await convex.query(api.social.queries.getLeaderboard, {
    leaderboardType: type as "pnl" | "pnl_percent" | "sharpe_ratio" | "win_rate" | "total_trades" | "followers" | "copiers" | "reputation",
    period: period as "daily" | "weekly" | "monthly" | "all_time",
    limit,
  });

  return c.json({
    success: true,
    data: leaderboard,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search traders
 */
app.get("/copy-trading/traders/search", async (c) => {
  const convex = c.get("convex");
  const query = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  const traders = await convex.query(api.social.queries.searchTraders, {
    query,
    limit,
  });

  return c.json({ success: true, data: traders, timestamp: new Date().toISOString() });
});

/**
 * Get recommended traders
 */
app.get("/copy-trading/traders/recommended", async (c) => {
  const convex = c.get("convex");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  const traders = await convex.query(api.social.queries.getTrendingTraders, {
    period: "weekly",
    limit,
  });

  return c.json({ success: true, data: traders, timestamp: new Date().toISOString() });
});

/**
 * Get trader profile
 */
app.get("/copy-trading/traders/:traderId", async (c) => {
  const convex = c.get("convex");
  const traderId = c.req.param("traderId");

  const profile = await convex.query(api.social.queries.getTraderProfile, {
    userId: toUserId(traderId),
  });

  if (!profile) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Trader not found" } }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...profile,
      isAcceptingCopiers: profile.profile?.allowCopyTrading ?? false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trader performance
 */
app.get("/copy-trading/traders/:traderId/performance", async (c) => {
  const convex = c.get("convex");
  const traderId = c.req.param("traderId");
  const period = c.req.query("period") ?? "all_time";

  const stats = await convex.query(api.social.queries.getTraderStats, {
    userId: toUserId(traderId),
    period: period as "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time",
  });

  return c.json({
    success: true,
    data: {
      userId: traderId,
      period,
      winRate: stats?.winRate ?? 0,
      returnPercent: stats?.totalPnLPercent ?? 0,
      totalTrades: stats?.totalTrades ?? 0,
      sharpeRatio: stats?.sharpeRatio ?? 0,
      maxDrawdown: stats?.maxDrawdownPercent ?? 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Create copy subscription
 */
app.post("/copy-trading/subscribe", zValidator("json", createCopySubscriptionSchema), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const subscriptionId = await convex.mutation(api.social.mutations.createCopySubscription, {
    copierId: toUserId(userId),
    traderId: toUserId(body.traderId),
    copyMode: body.copyMode,
    fixedAmount: body.fixedAmount,
    portfolioPercentage: body.portfolioPercentage,
    copyRatio: body.copyRatio,
    maxPositionSize: body.maxPositionSize,
    maxDailyLoss: body.maxDailyLoss,
    maxTotalExposure: body.maxTotalExposure,
    copyAssetClasses: body.copyAssetClasses,
  });

  return c.json({
    success: true,
    data: { id: subscriptionId, copierId: userId, ...body, status: "active" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get my subscriptions
 */
app.get("/copy-trading/subscriptions", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const status = c.req.query("status") as "pending" | "active" | "paused" | "stopped" | "cancelled" | undefined;

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const subscriptions = await convex.query(api.social.queries.getCopySubscriptions, {
    copierId: toUserId(userId),
    status,
  });

  return c.json({ success: true, data: subscriptions, timestamp: new Date().toISOString() });
});

/**
 * Update subscription
 */
app.patch("/copy-trading/subscriptions/:subscriptionId", zValidator("json", updateCopySubscriptionSchema), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  await convex.mutation(api.social.mutations.updateCopySubscription, {
    subscriptionId: subscriptionId as any,
    ...body,
  });

  return c.json({
    success: true,
    data: { id: subscriptionId, ...body, updated: true },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Pause subscription
 */
app.post("/copy-trading/subscriptions/:subscriptionId/pause", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  await convex.mutation(api.social.mutations.pauseCopySubscription, {
    subscriptionId: subscriptionId as any,
  });

  return c.json({
    success: true,
    data: { id: subscriptionId, status: "paused" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Resume subscription
 */
app.post("/copy-trading/subscriptions/:subscriptionId/resume", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  await convex.mutation(api.social.mutations.resumeCopySubscription, {
    subscriptionId: subscriptionId as any,
  });

  return c.json({
    success: true,
    data: { id: subscriptionId, status: "active" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Cancel subscription
 */
app.delete("/copy-trading/subscriptions/:subscriptionId", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const subscriptionId = c.req.param("subscriptionId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  await convex.mutation(api.social.mutations.cancelCopySubscription, {
    subscriptionId: subscriptionId as any,
  });

  return c.json({
    success: true,
    data: { id: subscriptionId, status: "cancelled" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get copy trades
 */
app.get("/copy-trading/subscriptions/:subscriptionId/trades", async (c) => {
  const convex = c.get("convex");
  const subscriptionId = c.req.param("subscriptionId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const result = await convex.query(api.social.queries.getCopyTrades, {
    subscriptionId: subscriptionId as any,
    limit,
  });

  return c.json({ success: true, data: result.trades, timestamp: new Date().toISOString() });
});

// ============================================================================
// DAILY CHALLENGES ROUTES
// ============================================================================

/**
 * Get daily challenges
 */
app.get("/challenges/daily", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const quests = await convex.query(api.gamification.getActiveQuests, {
    userId: toUserId(userId),
    type: "daily",
  });

  return c.json({ success: true, data: quests, timestamp: new Date().toISOString() });
});

/**
 * Get weekly challenges
 */
app.get("/challenges/weekly", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const quests = await convex.query(api.gamification.getActiveQuests, {
    userId: toUserId(userId),
    type: "weekly",
  });

  return c.json({ success: true, data: quests, timestamp: new Date().toISOString() });
});

/**
 * Get active challenges
 */
app.get("/challenges/active", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const quests = await convex.query(api.gamification.getActiveQuests, {
    userId: toUserId(userId),
  });

  // Filter to quests that have been started but not completed
  const activeQuests = quests.filter((q) => q.startedAt && !q.completed);

  return c.json({ success: true, data: activeQuests, timestamp: new Date().toISOString() });
});

/**
 * Get completed challenges
 */
app.get("/challenges/completed", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const quests = await convex.query(api.gamification.getActiveQuests, {
    userId: toUserId(userId),
  });

  // Filter to completed quests
  const completedQuests = quests.filter((q) => q.completed);

  return c.json({ success: true, data: completedQuests, timestamp: new Date().toISOString() });
});

/**
 * Start a challenge
 * NOTE: Quests auto-start on first progress update
 */
app.post("/challenges/:challengeId/start", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const challengeId = c.req.param("challengeId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Initialize quest progress with 0
  await convex.mutation(api.gamification.updateQuestProgress, {
    userId: toUserId(userId),
    questId: challengeId as any,
    progressUpdate: { current: 0 },
  });

  return c.json({
    success: true,
    data: {
      challengeId,
      userId,
      status: "active",
      progress: { current: 0 },
      startedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Claim challenge rewards
 */
app.post("/challenges/:questId/claim", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const questId = c.req.param("questId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const result = await convex.mutation(api.gamification.claimQuestReward, {
    userId: toUserId(userId),
    questId: questId as any,
  });

  return c.json({
    success: true,
    data: {
      questId,
      pointsEarned: result.pointsEarned,
      newBalance: result.newBalance,
      bonusReward: result.bonusReward,
      claimed: true,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get challenge statistics
 */
app.get("/challenges/stats", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const quests = await convex.query(api.gamification.getActiveQuests, {
    userId: toUserId(userId),
  });

  const streakData = await convex.query(api.gamification.getStreak, {
    userId: toUserId(userId),
    streakType: "daily_login",
  });

  const completedQuests = quests.filter((q) => q.completed);
  const claimedQuests = quests.filter((q) => q.claimed);
  const totalPointsEarned = quests
    .filter((q) => q.claimed)
    .reduce((sum, q) => sum + (q.pointsReward ?? 0), 0);

  const stats = {
    totalCompleted: completedQuests.length,
    totalClaimed: claimedQuests.length,
    totalPointsEarned,
    currentStreak: streakData?.currentCount ?? 0,
    longestStreak: streakData?.longestCount ?? 0,
    completionRate: quests.length > 0 ? completedQuests.length / quests.length : 0,
  };

  return c.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

/**
 * Get available rewards
 */
app.get("/challenges/rewards", async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const summary = await convex.query(api.gamification.getRewardsSummary, {
    userId: toUserId(userId),
  });

  const tierMultiplier = summary.tierBenefits?.pointsMultiplier ?? 1;
  const streakMultiplier = summary.activeStreaks.reduce(
    (max, s) => Math.max(max, s.multiplier),
    1
  );

  const rewards = {
    pointsBalance: summary.pointsBalance,
    pendingPoints: summary.pendingPoints,
    currentTier: summary.currentTier,
    tierProgress: summary.tierProgress,
    pointsToNextTier: summary.pointsToNextTier,
    currentPointsMultiplier: tierMultiplier * streakMultiplier,
    activeStreaks: summary.activeStreaks,
  };

  return c.json({ success: true, data: rewards, timestamp: new Date().toISOString() });
});

export { app as viralGrowthRoutes };
