import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// STREAKS
// ============================================================================

/**
 * Get all user streaks
 */
app.get("/streaks", async (c) => {
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

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      streaks: [
        {
          type: "daily_login",
          currentCount: 7,
          longestCount: 30,
          multiplierActive: true,
          multiplierValue: 1.25,
          lastActionAt: new Date().toISOString(),
        },
        {
          type: "daily_trade",
          currentCount: 3,
          longestCount: 15,
          multiplierActive: false,
          multiplierValue: 1.0,
          lastActionAt: new Date().toISOString(),
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get specific streak
 */
app.get("/streaks/:type", async (c) => {
  const userId = c.get("userId");
  const streakType = c.req.param("type");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      type: streakType,
      currentCount: 7,
      longestCount: 30,
      multiplierActive: true,
      multiplierValue: 1.25,
      lastActionAt: new Date().toISOString(),
      frozenUntil: null,
    },
    timestamp: new Date().toISOString(),
  });
});

const freezeStreakSchema = z.object({
  durationDays: z.number().int().min(1).max(7),
});

/**
 * Freeze a streak (premium feature)
 */
app.post("/streaks/:type/freeze", zValidator("json", freezeStreakSchema), async (c) => {
  const userId = c.get("userId");
  const streakType = c.req.param("type");
  const { durationDays } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Check if user has freeze available (tier benefit)
  // TODO: Process via Convex

  return c.json({
    success: true,
    data: {
      streakType,
      frozenUntil: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// QUESTS
// ============================================================================

/**
 * Get active quests
 */
app.get("/quests", async (c) => {
  const userId = c.get("userId");
  const category = c.req.query("category"); // daily, weekly, monthly, special

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      quests: [
        {
          id: "quest_1",
          questId: "daily_trade_3",
          name: "Make 3 trades today",
          description: "Complete 3 trades to earn bonus points",
          category: "daily",
          progress: 1,
          targetValue: 3,
          progressPercentage: 33,
          pointsReward: 50,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "quest_2",
          questId: "weekly_deposit",
          name: "Deposit $100 this week",
          description: "Make a deposit of at least $100",
          category: "weekly",
          progress: 0,
          targetValue: 100,
          progressPercentage: 0,
          pointsReward: 200,
          status: "active",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get available quest definitions
 */
app.get("/quests/available", async (c) => {
  const category = c.req.query("category");

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      quests: [],
    },
    timestamp: new Date().toISOString(),
  });
});

const startQuestSchema = z.object({
  questDefinitionId: z.string(),
});

/**
 * Start a quest
 */
app.post("/quests/start", zValidator("json", startQuestSchema), async (c) => {
  const userId = c.get("userId");
  const { questDefinitionId } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Start quest via Convex
  return c.json({
    success: true,
    data: {
      questId: crypto.randomUUID(),
      status: "active",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Claim quest reward
 */
app.post("/quests/:questId/claim", async (c) => {
  const userId = c.get("userId");
  const questId = c.req.param("questId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Claim via Convex/Temporal workflow
  return c.json({
    success: true,
    data: {
      questId,
      pointsEarned: 50,
      tokensEarned: null,
      badgeEarned: null,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// TIERS
// ============================================================================

/**
 * Get user tier details
 */
app.get("/tier", async (c) => {
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

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      tierLevel: "gold",
      lifetimePoints: 30000,
      currentPeriodPoints: 5000,
      multiplier: 1.5,
      nextTier: "platinum",
      pointsToNextTier: 20000,
      tierAchievedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      tierExpiresAt: null,
      benefits: [
        { id: "priority_support", name: "Priority Support", description: "24h response time" },
        { id: "gold_badge", name: "Gold Badge", description: "Exclusive profile badge" },
        { id: "early_access", name: "Early Access", description: "Access new features first" },
      ],
      benefitsUsed: {
        freeWithdrawals: 2,
        prioritySupport: true,
        exclusiveRewards: 1,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get tier benefits
 */
app.get("/tier/benefits", async (c) => {
  const tier = c.req.query("tier"); // Optional, defaults to all tiers

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      tiers: [
        {
          tier: "bronze",
          minPoints: 0,
          multiplier: 1.0,
          benefits: [
            { id: "basic_support", name: "Basic Support", description: "Email support" },
          ],
        },
        {
          tier: "silver",
          minPoints: 10000,
          multiplier: 1.25,
          benefits: [
            { id: "basic_support", name: "Basic Support", description: "Email support" },
            { id: "silver_badge", name: "Silver Badge", description: "Profile badge" },
          ],
        },
        {
          tier: "gold",
          minPoints: 25000,
          multiplier: 1.5,
          benefits: [
            { id: "priority_support", name: "Priority Support", description: "24h response" },
            { id: "gold_badge", name: "Gold Badge", description: "Profile badge" },
            { id: "early_access", name: "Early Access", description: "New features" },
          ],
        },
        {
          tier: "platinum",
          minPoints: 50000,
          multiplier: 2.0,
          benefits: [
            { id: "vip_support", name: "VIP Support", description: "4h response" },
            { id: "platinum_badge", name: "Platinum Badge", description: "Profile badge" },
            { id: "early_access", name: "Early Access", description: "New features" },
            { id: "fee_discount", name: "Fee Discount", description: "10% off fees" },
          ],
        },
        {
          tier: "diamond",
          minPoints: 100000,
          multiplier: 2.5,
          benefits: [
            { id: "dedicated_support", name: "Dedicated Support", description: "1h response" },
            { id: "diamond_badge", name: "Diamond Badge", description: "Profile badge" },
            { id: "early_access", name: "Early Access", description: "New features" },
            { id: "fee_discount", name: "Fee Discount", description: "25% off fees" },
            { id: "exclusive_events", name: "Exclusive Events", description: "VIP events" },
          ],
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

/**
 * Get user achievements
 */
app.get("/achievements", async (c) => {
  const userId = c.get("userId");
  const category = c.req.query("category");
  const unlockedOnly = c.req.query("unlocked") === "true";

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      achievements: [
        {
          id: "ach_1",
          achievementId: "first_trade",
          name: "First Trade",
          description: "Complete your first trade",
          category: "trading",
          rarity: "common",
          progress: 1,
          targetValue: 1,
          progressPercentage: 100,
          isUnlocked: true,
          unlockedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          claimedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          pointsReward: 50,
          imageUrl: null,
        },
        {
          id: "ach_2",
          achievementId: "streak_master",
          name: "Streak Master",
          description: "Maintain a 30-day login streak",
          category: "streak",
          rarity: "epic",
          progress: 7,
          targetValue: 30,
          progressPercentage: 23,
          isUnlocked: false,
          unlockedAt: null,
          claimedAt: null,
          pointsReward: 500,
          imageUrl: null,
        },
      ],
      stats: {
        total: 50,
        unlocked: 12,
        unlockedPercentage: 24,
        totalPointsEarned: 1500,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get achievement definitions
 */
app.get("/achievements/catalog", async (c) => {
  const category = c.req.query("category");
  const includeSecret = c.req.query("secret") === "true";

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      achievements: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Claim achievement reward
 */
app.post("/achievements/:achievementId/claim", async (c) => {
  const userId = c.get("userId");
  const achievementId = c.req.param("achievementId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Claim via Convex/Temporal workflow
  return c.json({
    success: true,
    data: {
      achievementId,
      pointsEarned: 50,
      tokensEarned: null,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// COMPETITIONS
// ============================================================================

/**
 * Get active competitions
 */
app.get("/competitions", async (c) => {
  const type = c.req.query("type"); // seasonal, weekly, monthly, special_event
  const status = c.req.query("status"); // upcoming, active, completed

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      competitions: [
        {
          id: "comp_1",
          competitionId: "season_2024_Q4",
          name: "Q4 2024 Championship",
          description: "Compete for the quarterly prize pool",
          type: "seasonal",
          scoringType: "points_earned",
          startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          prizePool: 1000000,
          participantCount: 5432,
          status: "active",
          isFeatured: true,
          imageUrl: null,
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get competition details
 */
app.get("/competitions/:competitionId", async (c) => {
  const competitionId = c.req.param("competitionId");

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      competition: {
        id: "comp_1",
        competitionId,
        name: "Q4 2024 Championship",
        description: "Compete for the quarterly prize pool",
        type: "seasonal",
        scoringType: "points_earned",
        startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        prizePool: 1000000,
        prizeDistribution: [
          { rankStart: 1, rankEnd: 1, pointsPrize: 300000, tokenPrize: 1000 },
          { rankStart: 2, rankEnd: 2, pointsPrize: 200000, tokenPrize: 500 },
          { rankStart: 3, rankEnd: 3, pointsPrize: 100000, tokenPrize: 250 },
          { rankStart: 4, rankEnd: 10, pointsPrize: 50000 },
          { rankStart: 11, rankEnd: 50, pointsPrize: 20000 },
          { rankStart: 51, rankEnd: 100, pointsPrize: 10000 },
        ],
        participantCount: 5432,
        totalVolume: 15000000,
        status: "active",
        rules: "Points are earned through trading, referrals, and completing quests.",
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get competition leaderboard
 */
app.get("/competitions/:competitionId/leaderboard", async (c) => {
  const competitionId = c.req.param("competitionId");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      leaderboard: [
        { rank: 1, userId: "user_1", username: "trader_king", score: 125000, avatarUrl: null },
        { rank: 2, userId: "user_2", username: "crypto_queen", score: 98000, avatarUrl: null },
        { rank: 3, userId: "user_3", username: "diamond_hands", score: 85000, avatarUrl: null },
      ],
      totalParticipants: 5432,
    },
    pagination: {
      offset,
      limit,
      totalItems: 5432,
      hasMore: offset + limit < 5432,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get user's competition status
 */
app.get("/competitions/:competitionId/status", async (c) => {
  const userId = c.get("userId");
  const competitionId = c.req.param("competitionId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      isParticipating: true,
      score: 15000,
      rank: 342,
      previousRank: 350,
      rankChange: 8,
      potentialPrize: {
        pointsPrize: 10000,
        tokenPrize: null,
      },
      joinedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Join a competition
 */
app.post("/competitions/:competitionId/join", async (c) => {
  const userId = c.get("userId");
  const competitionId = c.req.param("competitionId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Join via Temporal workflow
  return c.json({
    success: true,
    data: {
      competitionId,
      joined: true,
      initialRank: 5433,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Claim competition prize
 */
app.post("/competitions/:competitionId/claim", async (c) => {
  const userId = c.get("userId");
  const competitionId = c.req.param("competitionId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Claim via Temporal workflow
  return c.json({
    success: true,
    data: {
      competitionId,
      pointsWon: 10000,
      tokensWon: null,
      specialPrize: null,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// MULTIPLIERS
// ============================================================================

/**
 * Get active multiplier events
 */
app.get("/multipliers", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex
  return c.json({
    success: true,
    data: {
      multipliers: [
        {
          id: "mult_1",
          eventId: "double_points_weekend",
          name: "Double Points Weekend",
          description: "Earn 2x points on all trading activities",
          multiplierValue: 2.0,
          appliesTo: ["trade_executed", "prediction_win"],
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        },
      ],
      userMultipliers: {
        tier: { name: "gold", value: 1.5 },
        streak: { days: 7, value: 1.25 },
        promotional: [{ name: "Double Points Weekend", value: 2.0 }],
        total: 3.75,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GAMIFICATION DASHBOARD
// ============================================================================

/**
 * Get complete gamification dashboard
 */
app.get("/dashboard", async (c) => {
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

  // TODO: Fetch all data from Convex
  return c.json({
    success: true,
    data: {
      tier: {
        tierLevel: "gold",
        lifetimePoints: 30000,
        multiplier: 1.5,
        nextTier: "platinum",
        pointsToNextTier: 20000,
      },
      streaks: [
        { type: "daily_login", currentCount: 7, multiplierActive: true },
        { type: "daily_trade", currentCount: 3, multiplierActive: false },
      ],
      activeQuests: [
        { questId: "daily_trade_3", name: "Make 3 trades", progress: 1, targetValue: 3 },
      ],
      recentAchievements: [
        { achievementId: "first_trade", name: "First Trade", rarity: "common" },
      ],
      activeCompetitions: [
        { competitionId: "season_2024_Q4", name: "Q4 Championship", rank: 342 },
      ],
      multiplierEvents: [
        { name: "Double Points Weekend", value: 2.0 },
      ],
      dailyProgress: {
        pointsEarned: 250,
        questsCompleted: 1,
        streaksContinued: 2,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as gamificationRoutes };
