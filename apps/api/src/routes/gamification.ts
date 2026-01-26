import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { getConvexClient } from "../lib/convex";
import { api } from "@pull/db/convex/_generated/api";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().optional(),
});

const periodSchema = z.enum(["daily", "weekly", "monthly", "alltime"]);

const tierSchema = z.enum(["bronze", "silver", "gold", "platinum", "diamond"]);

const questTypeSchema = z.enum(["daily", "weekly", "achievement", "seasonal"]);

const redeemSchema = z.object({
  type: z.enum(["fee_discount", "token_conversion", "sweepstakes", "item"]),
  amount: z.number().positive(),
  itemId: z.string().optional(),
  walletAddress: z.string().optional(),
});

const claimQuestSchema = z.object({
  questId: z.string(),
});

const toggleAchievementDisplaySchema = z.object({
  achievementId: z.string(),
  displayed: z.boolean(),
});

// ============================================================================
// GET /rewards/summary
// Comprehensive rewards summary including points, tier, streaks, and recent earnings
// ============================================================================

app.get("/summary", async (c) => {
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

  try {
    const convex = getConvexClient();
    const summary = await convex.query(api.gamification.getRewardsSummary, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch rewards summary";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
      },
      500
    );
  }
});

// ============================================================================
// GET /rewards/history
// Paginated point transactions with filtering
// ============================================================================

app.get("/history", zValidator("query", paginationSchema.extend({
  type: z.string().optional(),
  dateFrom: z.coerce.number().optional(),
  dateTo: z.coerce.number().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor, type, dateFrom, dateTo } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const result = await convex.query(api.gamification.getPointsHistory, {
      userId: userId as Id<"users">,
      type,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: {
        items: result.items,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch points history";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
      },
      500
    );
  }
});

// ============================================================================
// GET /rewards/quests
// Active quests with progress
// ============================================================================

app.get("/quests", zValidator("query", z.object({
  type: questTypeSchema.optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { type } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const quests = await convex.query(api.gamification.getActiveQuests, {
      userId: userId as Id<"users">,
      type: type as "daily" | "weekly" | "achievement" | "seasonal" | undefined,
    });

    // Group quests by type if no specific type is requested
    if (!type) {
      const grouped = {
        daily: quests.filter((q: { type: string }) => q.type === "daily"),
        weekly: quests.filter((q: { type: string }) => q.type === "weekly"),
        achievement: quests.filter((q: { type: string }) => q.type === "achievement"),
        seasonal: quests.filter((q: { type: string }) => q.type === "seasonal"),
      };
      return c.json({
        success: true,
        data: grouped,
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      data: quests,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch quests";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
      },
      500
    );
  }
});

// ============================================================================
// POST /rewards/quests/:questId/claim
// Claim completed quest reward
// ============================================================================

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

  if (!questId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "Quest ID required" },
      },
      400
    );
  }

  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.gamification.claimQuestReward, {
      userId: userId as Id<"users">,
      questId: questId as Id<"quests">,
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to claim quest reward";
    return c.json(
      {
        success: false,
        error: { code: "CLAIM_FAILED", message },
      },
      400
    );
  }
});

// ============================================================================
// GET /rewards/achievements
// All achievements with user progress
// ============================================================================

app.get("/achievements", zValidator("query", z.object({
  category: z.string().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { category } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const achievements = await convex.query(api.gamification.getAchievements, {
      userId: userId as Id<"users">,
      category,
    });

    // Group by category
    const grouped = achievements.reduce((acc: Record<string, typeof achievements>, a: { category: string }) => {
      if (!acc[a.category]) {
        acc[a.category] = [];
      }
      acc[a.category].push(a);
      return acc;
    }, {} as Record<string, typeof achievements>);

    // Calculate stats
    const stats = {
      total: achievements.length,
      unlocked: achievements.filter((a: { unlocked: boolean }) => a.unlocked).length,
      common: achievements.filter((a: { rarity: string }) => a.rarity === "common").length,
      rare: achievements.filter((a: { rarity: string }) => a.rarity === "rare").length,
      epic: achievements.filter((a: { rarity: string }) => a.rarity === "epic").length,
      legendary: achievements.filter((a: { rarity: string }) => a.rarity === "legendary").length,
    };

    return c.json({
      success: true,
      data: {
        achievements,
        byCategory: grouped,
        stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch achievements";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
      },
      500
    );
  }
});

// ============================================================================
// PATCH /rewards/achievements/:achievementId/display
// Toggle achievement display on profile
// ============================================================================

app.patch("/achievements/:achievementId/display", zValidator("json", z.object({
  displayed: z.boolean(),
})), async (c) => {
  const userId = c.get("userId");
  const achievementId = c.req.param("achievementId");
  const { displayed } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    await convex.mutation(api.gamification.toggleAchievementDisplay, {
      userId: userId as Id<"users">,
      achievementId: achievementId as Id<"achievements">,
      displayed,
    });

    return c.json({
      success: true,
      data: { achievementId, displayed },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to toggle achievement display";
    return c.json(
      {
        success: false,
        error: { code: "UPDATE_FAILED", message },
      },
      400
    );
  }
});

// ============================================================================
// GET /rewards/leaderboard
// Points leaderboard with filtering
// ============================================================================

app.get("/leaderboard", zValidator("query", z.object({
  period: periodSchema.default("weekly"),
  type: z.enum(["points", "trading_volume", "pnl", "referrals", "streak"]).default("points"),
  tier: tierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
})), async (c) => {
  const userId = c.get("userId");
  const { period, type, tier, limit } = c.req.valid("query");

  // TODO: Call Convex query gamification.getLeaderboard
  const leaderboard = {
    entries: [
      {
        rank: 1,
        userId: "user_001",
        username: "TradeKing",
        avatarUrl: null,
        score: 125000,
        tier: "diamond",
        change: 0,
      },
      {
        rank: 2,
        userId: "user_002",
        username: "CryptoSage",
        avatarUrl: null,
        score: 98500,
        tier: "platinum",
        change: 1,
      },
      {
        rank: 3,
        userId: "user_003",
        username: "PredictionPro",
        avatarUrl: null,
        score: 87200,
        tier: "platinum",
        change: -1,
      },
    ],
    totalParticipants: 15420,
    generatedAt: Date.now() - 300000,
    cached: true,
    userRank: userId ? {
      rank: 156,
      score: 15250,
      tier: "gold",
      percentile: 99,
    } : undefined,
  };

  return c.json({
    success: true,
    data: leaderboard,
    meta: {
      period,
      type,
      tierFilter: tier,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /rewards/redeem
// Process redemption (fee discount, token conversion, sweepstakes, item)
// ============================================================================

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

  // Validate wallet address for token conversion
  if (body.type === "token_conversion") {
    if (!body.walletAddress) {
      return c.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "Wallet address required for token conversion" },
        },
        400
      );
    }

    // Basic Ethereum address validation
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(body.walletAddress)) {
      return c.json(
        {
          success: false,
          error: { code: "INVALID_WALLET", message: "Invalid Ethereum wallet address" },
        },
        400
      );
    }
  }

  // TODO: Process redemption based on type
  // - fee_discount: Apply discount to next trade
  // - token_conversion: Start Temporal workflow to convert points to tokens
  // - sweepstakes: Enter user into sweepstakes
  // - item: Redeem for physical/digital item

  const result = {
    redemptionId: `red_${Date.now()}`,
    type: body.type,
    pointsSpent: body.amount,
    newBalance: 14250, // Example
    status: "processing",
    details: body.type === "token_conversion"
      ? {
          tokensToReceive: body.amount / 1000, // 1000 points = 1 token
          walletAddress: body.walletAddress,
          estimatedTime: "5-10 minutes",
        }
      : body.type === "fee_discount"
      ? {
          discountPercent: body.amount / 100, // 100 points = 1% discount
          validUntil: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        }
      : undefined,
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /rewards/shop
// Available redemption options
// ============================================================================

app.get("/shop", zValidator("query", z.object({
  category: z.string().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { category } = c.req.valid("query");

  // TODO: Fetch from Convex
  const shopItems = {
    fee_discounts: [
      {
        id: "fee_5",
        name: "5% Fee Discount",
        description: "Get 5% off trading fees for your next 10 trades",
        pointsCost: 500,
        type: "fee_discount",
        value: 5,
        available: true,
      },
      {
        id: "fee_10",
        name: "10% Fee Discount",
        description: "Get 10% off trading fees for your next 10 trades",
        pointsCost: 900,
        type: "fee_discount",
        value: 10,
        available: true,
      },
      {
        id: "fee_25",
        name: "25% Fee Discount",
        description: "Get 25% off trading fees for your next 10 trades",
        pointsCost: 2000,
        type: "fee_discount",
        value: 25,
        available: true,
        minTier: "gold",
      },
    ],
    token_conversion: [
      {
        id: "token_convert",
        name: "Convert to $PULL Tokens",
        description: "Convert your points to $PULL tokens at a rate of 1000:1",
        pointsCost: 1000,
        type: "token_conversion",
        rate: 1000,
        minAmount: 1000,
        available: true,
      },
    ],
    sweepstakes: [
      {
        id: "sweep_iphone",
        name: "iPhone 16 Pro Sweepstakes",
        description: "Enter for a chance to win an iPhone 16 Pro",
        pointsCost: 100,
        type: "sweepstakes",
        entriesPerPurchase: 1,
        drawDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
        totalEntries: 15420,
        available: true,
      },
    ],
    merchandise: [
      {
        id: "merch_tshirt",
        name: "PULL T-Shirt",
        description: "Premium cotton t-shirt with PULL logo",
        pointsCost: 5000,
        type: "item",
        stock: 50,
        available: true,
        requiresShipping: true,
      },
      {
        id: "merch_hoodie",
        name: "PULL Hoodie",
        description: "Premium pullover hoodie with PULL logo",
        pointsCost: 10000,
        type: "item",
        stock: 25,
        available: true,
        requiresShipping: true,
        minTier: "silver",
      },
    ],
  };

  return c.json({
    success: true,
    data: shopItems,
    conversionRate: {
      pointsToToken: 1000,
      pointsToUsd: 100, // 100 points = $1
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /rewards/streaks
// Detailed streak information
// ============================================================================

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

  // TODO: Call Convex query to get all user streaks
  const streaks = [
    {
      type: "login",
      title: "Login Streak",
      currentCount: 7,
      longestCount: 30,
      currentMultiplier: 1.7,
      maxMultiplier: 3.0,
      lastActionAt: Date.now() - 3600000,
      nextMilestone: 14,
      nextMilestoneReward: 140, // 14 * 10 points
      status: "active",
    },
    {
      type: "trading",
      title: "Trading Streak",
      currentCount: 3,
      longestCount: 15,
      currentMultiplier: 1.3,
      maxMultiplier: 2.5,
      lastActionAt: Date.now() - 7200000,
      nextMilestone: 7,
      nextMilestoneReward: 70,
      status: "active",
    },
    {
      type: "prediction_correct",
      title: "Prediction Winning Streak",
      currentCount: 0,
      longestCount: 8,
      currentMultiplier: 1.0,
      maxMultiplier: 5.0,
      lastActionAt: Date.now() - 172800000,
      nextMilestone: 3,
      nextMilestoneReward: 75,
      status: "broken",
    },
  ];

  return c.json({
    success: true,
    data: {
      streaks,
      milestones: [3, 7, 14, 30, 60, 90, 100, 365],
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /rewards/tier
// Detailed tier information and benefits comparison
// ============================================================================

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

  // TODO: Call Convex query gamification.getUserTier
  const tierInfo = {
    current: {
      tier: "gold",
      lifetimePoints: 15250,
      currentMonthPoints: 5400,
      achievedAt: Date.now() - 2592000000,
      expiresAt: null,
    },
    progress: {
      toNextTier: 84750,
      percentage: 15.25,
      nextTier: "platinum",
    },
    benefits: {
      bronze: {
        threshold: 0,
        feeDiscount: 0,
        aiCredits: 10,
        copyTrading: false,
        prioritySupport: false,
        revenueShare: 0,
        pointsMultiplier: 1.0,
        color: "#CD7F32",
        icon: "🥉",
      },
      silver: {
        threshold: 1000,
        feeDiscount: 0.1,
        aiCredits: 50,
        copyTrading: false,
        prioritySupport: false,
        revenueShare: 0,
        pointsMultiplier: 1.1,
        color: "#C0C0C0",
        icon: "🥈",
      },
      gold: {
        threshold: 10000,
        feeDiscount: 0.2,
        aiCredits: 200,
        copyTrading: true,
        prioritySupport: false,
        revenueShare: 0,
        pointsMultiplier: 1.25,
        color: "#FFD700",
        icon: "🥇",
        current: true,
      },
      platinum: {
        threshold: 100000,
        feeDiscount: 0.3,
        aiCredits: 1000,
        copyTrading: true,
        prioritySupport: true,
        revenueShare: 0,
        pointsMultiplier: 1.5,
        color: "#E5E4E2",
        icon: "💎",
      },
      diamond: {
        threshold: 500000,
        feeDiscount: 0.5,
        aiCredits: -1, // unlimited
        copyTrading: true,
        prioritySupport: true,
        revenueShare: 0.01,
        pointsMultiplier: 2.0,
        color: "#B9F2FF",
        icon: "💠",
      },
    },
    decay: {
      inactivityDays: 0,
      daysUntilDecay: null,
      decayPercent: null,
    },
  };

  return c.json({
    success: true,
    data: tierInfo,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /rewards/earn
// Manually trigger points earning (for testing/admin)
// ============================================================================

app.post("/earn", zValidator("json", z.object({
  actionType: z.string(),
  metadata: z.record(z.unknown()).optional(),
})), async (c) => {
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

  // TODO: Start Temporal workflow processPointsEarningWorkflow
  const result = {
    workflowId: `pts_${Date.now()}`,
    pointsEarned: 50,
    basePoints: 40,
    multiplier: 1.25,
    newBalance: 15300,
    streakBonus: false,
    tierBonus: true,
    achievementsUnlocked: [],
    questsUpdated: [],
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export { app as gamificationRoutes };
