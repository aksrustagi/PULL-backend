import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

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

  // TODO: Call Convex query gamification.getRewardsSummary
  const summary = {
    pointsBalance: 15250,
    pendingPoints: 50,
    lifetimePoints: 28500,
    currentTier: "gold",
    tierProgress: 52.5,
    pointsToNextTier: 84750,
    nextTier: "platinum",
    tierBenefits: {
      feeDiscount: 0.2,
      aiCredits: 200,
      copyTrading: true,
      prioritySupport: false,
      revenueShare: 0,
      pointsMultiplier: 1.25,
    },
    activeStreaks: [
      {
        type: "login",
        count: 7,
        multiplier: 1.7,
        longestCount: 30,
        lastActionAt: Date.now() - 3600000,
      },
      {
        type: "trading",
        count: 3,
        multiplier: 1.3,
        longestCount: 15,
        lastActionAt: Date.now() - 7200000,
      },
    ],
    recentEarnings: 1250,
    currentMonthPoints: 5400,
    decayWarning: null, // or { daysUntilDecay: 15, decayPercent: 10 }
  };

  return c.json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex query gamification.getPointsHistory
  const transactions = [
    {
      id: "pts_001",
      type: "daily_login",
      amount: 15,
      balance: 15250,
      description: "Daily login streak bonus",
      multiplierApplied: 1.7,
      baseAmount: 5,
      createdAt: Date.now() - 3600000,
      status: "completed",
    },
    {
      id: "pts_002",
      type: "trade_volume",
      amount: 125,
      balance: 15235,
      description: "Points per $10 trade volume",
      multiplierApplied: 1.25,
      baseAmount: 100,
      referenceType: "trades",
      referenceId: "trade_123",
      createdAt: Date.now() - 86400000,
      status: "completed",
    },
  ];

  return c.json({
    success: true,
    data: {
      items: transactions,
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex query gamification.getActiveQuests
  const quests = {
    daily: [
      {
        _id: "quest_001",
        questId: "early_bird",
        title: "Early Bird",
        description: "Log in before 9am local time",
        type: "daily",
        requirements: { type: "login_before", hour: 9 },
        pointsReward: 10,
        progress: { completed: 0 },
        completed: false,
        claimed: false,
        expiresAt: Date.now() + 43200000, // 12 hours
      },
      {
        _id: "quest_002",
        questId: "active_trader",
        title: "Active Trader",
        description: "Make 3 trades today",
        type: "daily",
        requirements: { type: "trades_count", target: 3 },
        pointsReward: 25,
        progress: { current: 1 },
        completed: false,
        claimed: false,
        expiresAt: Date.now() + 43200000,
      },
      {
        _id: "quest_003",
        questId: "signal_seeker",
        title: "Signal Seeker",
        description: "Review 3 AI signals",
        type: "daily",
        requirements: { type: "signals_reviewed", target: 3 },
        pointsReward: 15,
        progress: { current: 3 },
        completed: true,
        claimed: false,
        completedAt: Date.now() - 1800000,
        expiresAt: Date.now() + 43200000,
      },
    ],
    weekly: [
      {
        _id: "quest_010",
        questId: "volume_king",
        title: "Volume King",
        description: "Trade $1,000 in volume this week",
        type: "weekly",
        requirements: { type: "trade_volume", target: 1000 },
        pointsReward: 100,
        progress: { current: 450 },
        completed: false,
        claimed: false,
        expiresAt: Date.now() + 345600000, // 4 days
      },
      {
        _id: "quest_011",
        questId: "winning_streak",
        title: "Winning Streak",
        description: "Win 5 predictions in a row",
        type: "weekly",
        requirements: { type: "prediction_streak", target: 5 },
        pointsReward: 200,
        progress: { current: 2 },
        completed: false,
        claimed: false,
        expiresAt: Date.now() + 345600000,
      },
    ],
  };

  // Filter by type if specified
  if (type && type !== "achievement" && type !== "seasonal") {
    return c.json({
      success: true,
      data: quests[type] ?? [],
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({
    success: true,
    data: quests,
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation gamification.claimQuestReward
  const result = {
    pointsEarned: 15,
    newBalance: 15265,
    bonusReward: null, // or { type: "badge", id: "badge_001", name: "Signal Master" }
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex query gamification.getAchievements
  const achievements = [
    {
      _id: "ach_001",
      achievementId: "first_blood",
      title: "First Blood",
      description: "Make your first trade",
      icon: "⚔️",
      category: "trading",
      requirement: { type: "total_trades", target: 1 },
      rarity: "common",
      pointsReward: 50,
      unlocked: true,
      unlockedAt: Date.now() - 2592000000,
      displayed: true,
    },
    {
      _id: "ach_002",
      achievementId: "oracle",
      title: "Oracle",
      description: "10 correct predictions",
      icon: "🔮",
      category: "trading",
      requirement: { type: "correct_predictions", target: 10 },
      rarity: "common",
      pointsReward: 200,
      unlocked: true,
      unlockedAt: Date.now() - 1296000000,
      displayed: false,
    },
    {
      _id: "ach_003",
      achievementId: "seer",
      title: "Seer",
      description: "50 correct predictions",
      icon: "👁️",
      category: "trading",
      requirement: { type: "correct_predictions", target: 50 },
      rarity: "rare",
      pointsReward: 500,
      unlocked: false,
      progress: { current: 35, target: 50 },
    },
    {
      _id: "ach_004",
      achievementId: "prophet",
      title: "Prophet",
      description: "100 correct predictions",
      icon: "🌟",
      category: "trading",
      requirement: { type: "correct_predictions", target: 100 },
      rarity: "epic",
      pointsReward: 1000,
      unlocked: false,
      progress: { current: 35, target: 100 },
    },
    {
      _id: "ach_005",
      achievementId: "fortune_teller",
      title: "Fortune Teller",
      description: "90% win rate over 20+ trades",
      icon: "🎰",
      category: "trading",
      requirement: { type: "win_rate", target: 0.9, minTrades: 20 },
      rarity: "legendary",
      pointsReward: 2000,
      unlocked: false,
      progress: { winRate: 0.72, trades: 45, targetWinRate: 0.9 },
    },
    {
      _id: "ach_006",
      achievementId: "streak_master_7",
      title: "Streak Master",
      description: "7-day login streak",
      icon: "🔥",
      category: "streak",
      requirement: { type: "login_streak", target: 7 },
      rarity: "common",
      pointsReward: 100,
      unlocked: true,
      unlockedAt: Date.now() - 86400000,
      displayed: true,
    },
  ];

  // Filter by category if specified
  const filteredAchievements = category
    ? achievements.filter((a) => a.category === category)
    : achievements;

  // Group by category
  const grouped = filteredAchievements.reduce((acc, a) => {
    if (!acc[a.category]) {
      acc[a.category] = [];
    }
    acc[a.category].push(a);
    return acc;
  }, {} as Record<string, typeof achievements>);

  return c.json({
    success: true,
    data: {
      achievements: filteredAchievements,
      byCategory: grouped,
      stats: {
        total: achievements.length,
        unlocked: achievements.filter((a) => a.unlocked).length,
        common: achievements.filter((a) => a.rarity === "common").length,
        rare: achievements.filter((a) => a.rarity === "rare").length,
        epic: achievements.filter((a) => a.rarity === "epic").length,
        legendary: achievements.filter((a) => a.rarity === "legendary").length,
      },
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation gamification.toggleAchievementDisplay

  return c.json({
    success: true,
    data: { achievementId, displayed },
    timestamp: new Date().toISOString(),
  });
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
