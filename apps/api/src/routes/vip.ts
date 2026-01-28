import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// Protect all VIP routes - feature is not production-ready
app.use("*", requireFeature("vip", "VIP Program"));

// ============================================================================
// Validation Schemas
// ============================================================================

const vipTierSchema = z.enum(["bronze", "silver", "gold", "platinum", "diamond", "black"]);

const vipEventRegisterSchema = z.object({
  eventId: z.string(),
});

const cashbackHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(["pending", "credited", "expired"]).optional(),
});

// ============================================================================
// GET /vip/status
// Get current user's VIP status including tier, benefits, and progress
// ============================================================================

app.get("/status", async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  const status = {
    userId,
    tier: "gold" as const,
    tierAchievedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    lifetimeVolume: 75000,
    currentMonthVolume: 12500,
    volumeToNextTier: 175000,
    nextTier: "platinum" as const,
    progressPercentage: 30,
    benefits: {
      cashbackRate: 0.015, // 1.5%
      withdrawalPriority: "standard" as const,
      dedicatedManager: false,
      exclusivePromos: true,
      prioritySupport: true,
      maxDailyWithdrawal: 25000,
      feeDiscount: 0.15,
    },
    stats: {
      totalCashbackEarned: 1125,
      pendingCashback: 45.50,
      vipEventsAttended: 2,
    },
  };

  return c.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /vip/tiers
// Get all VIP tier details and requirements
// ============================================================================

app.get("/tiers", async (c) => {
  const userId = c.get("userId");

  // Feature protected by feature flag - Convex integration pending
  const tiers = {
    bronze: {
      name: "Bronze",
      volumeThreshold: 0,
      cashbackRate: 0.005, // 0.5%
      withdrawalPriority: "standard",
      withdrawalSpeed: "3-5 business days",
      maxDailyWithdrawal: 5000,
      feeDiscount: 0,
      dedicatedManager: false,
      exclusivePromos: false,
      prioritySupport: false,
      color: "#CD7F32",
      icon: "bronze_badge",
    },
    silver: {
      name: "Silver",
      volumeThreshold: 10000,
      cashbackRate: 0.0075, // 0.75%
      withdrawalPriority: "standard",
      withdrawalSpeed: "2-3 business days",
      maxDailyWithdrawal: 10000,
      feeDiscount: 0.05,
      dedicatedManager: false,
      exclusivePromos: false,
      prioritySupport: false,
      color: "#C0C0C0",
      icon: "silver_badge",
    },
    gold: {
      name: "Gold",
      volumeThreshold: 50000,
      cashbackRate: 0.015, // 1.5%
      withdrawalPriority: "priority",
      withdrawalSpeed: "1-2 business days",
      maxDailyWithdrawal: 25000,
      feeDiscount: 0.15,
      dedicatedManager: false,
      exclusivePromos: true,
      prioritySupport: true,
      color: "#FFD700",
      icon: "gold_badge",
      current: userId ? true : false,
    },
    platinum: {
      name: "Platinum",
      volumeThreshold: 250000,
      cashbackRate: 0.025, // 2.5%
      withdrawalPriority: "express",
      withdrawalSpeed: "Same day",
      maxDailyWithdrawal: 100000,
      feeDiscount: 0.25,
      dedicatedManager: true,
      exclusivePromos: true,
      prioritySupport: true,
      color: "#E5E4E2",
      icon: "platinum_badge",
    },
    diamond: {
      name: "Diamond",
      volumeThreshold: 500000,
      cashbackRate: 0.035, // 3.5%
      withdrawalPriority: "instant",
      withdrawalSpeed: "Within 2 hours",
      maxDailyWithdrawal: 500000,
      feeDiscount: 0.35,
      dedicatedManager: true,
      exclusivePromos: true,
      prioritySupport: true,
      color: "#B9F2FF",
      icon: "diamond_badge",
    },
    black: {
      name: "Black",
      volumeThreshold: 1000000,
      cashbackRate: 0.05, // 5%
      withdrawalPriority: "instant",
      withdrawalSpeed: "Instant",
      maxDailyWithdrawal: -1, // Unlimited
      feeDiscount: 0.50,
      dedicatedManager: true,
      exclusivePromos: true,
      prioritySupport: true,
      inviteOnly: true,
      color: "#1C1C1C",
      icon: "black_badge",
    },
  };

  return c.json({
    success: true,
    data: tiers,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /vip/cashback
// Get cashback history and pending amounts
// ============================================================================

app.get("/cashback", zValidator("query", cashbackHistorySchema), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor, status } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Feature protected by feature flag - Convex integration pending
  const cashbackHistory = {
    summary: {
      pendingAmount: 45.50,
      thisMonthEarned: 187.50,
      lifetimeEarned: 1125.00,
      currentRate: 0.015,
    },
    transactions: [
      {
        id: "cb_001",
        amount: 12.50,
        betAmount: 833.33,
        rate: 0.015,
        status: "pending" as const,
        createdAt: Date.now() - 3600000,
        creditedAt: null,
      },
      {
        id: "cb_002",
        amount: 33.00,
        betAmount: 2200.00,
        rate: 0.015,
        status: "pending" as const,
        createdAt: Date.now() - 86400000,
        creditedAt: null,
      },
      {
        id: "cb_003",
        amount: 75.00,
        betAmount: 5000.00,
        rate: 0.015,
        status: "credited" as const,
        createdAt: Date.now() - 172800000,
        creditedAt: Date.now() - 86400000,
      },
    ],
    hasMore: false,
    nextCursor: undefined,
  };

  return c.json({
    success: true,
    data: cashbackHistory,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /vip/cashback/claim
// Claim pending cashback (if instant claim is available for tier)
// ============================================================================

app.post("/cashback/claim", async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  const result = {
    claimedAmount: 45.50,
    newBalance: 1045.50,
    transactionId: `tx_${Date.now()}`,
    message: "Cashback credited to your account",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /vip/events
// Get upcoming VIP-exclusive events
// ============================================================================

app.get("/events", async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  const events = [
    {
      id: "evt_001",
      name: "Super Bowl LVIII VIP Watch Party",
      description: "Exclusive watch party with enhanced betting pools and prizes",
      type: "watch_party",
      minTier: "gold" as const,
      startsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      endsAt: Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000,
      maxParticipants: 100,
      currentParticipants: 45,
      isRegistered: false,
      prizes: [
        { place: 1, prize: "$5,000 Bonus" },
        { place: 2, prize: "$2,500 Bonus" },
        { place: 3, prize: "$1,000 Bonus" },
      ],
    },
    {
      id: "evt_002",
      name: "March Madness Bracket Challenge",
      description: "VIP-only bracket competition with 10x cashback",
      type: "tournament",
      minTier: "silver" as const,
      startsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      endsAt: Date.now() + 50 * 24 * 60 * 60 * 1000,
      maxParticipants: 500,
      currentParticipants: 128,
      isRegistered: true,
      prizes: [
        { place: 1, prize: "$25,000 Bonus" },
        { place: 2, prize: "$10,000 Bonus" },
        { place: 3, prize: "$5,000 Bonus" },
      ],
    },
  ];

  return c.json({
    success: true,
    data: events,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /vip/events/:eventId/register
// Register for a VIP event
// ============================================================================

app.post("/events/:eventId/register", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("eventId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  if (!eventId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "Event ID required" },
      },
      400
    );
  }

  // Feature protected by feature flag - Convex integration pending
  const result = {
    eventId,
    registrationId: `reg_${Date.now()}`,
    status: "confirmed",
    message: "You have been registered for this event",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /vip/benefits/compare
// Compare benefits between current tier and target tier
// ============================================================================

app.get("/benefits/compare", zValidator("query", z.object({
  targetTier: vipTierSchema,
})), async (c) => {
  const userId = c.get("userId");
  const { targetTier } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Feature protected by feature flag - Convex integration pending
  const comparison = {
    currentTier: "gold",
    targetTier,
    volumeRequired: targetTier === "platinum" ? 175000 : 425000,
    benefitsGained: [
      { benefit: "Cashback Rate", current: "1.5%", target: "2.5%", improvement: "+1.0%" },
      { benefit: "Withdrawal Speed", current: "1-2 days", target: "Same day", improvement: "Faster" },
      { benefit: "Dedicated Manager", current: false, target: true, improvement: "New benefit" },
      { benefit: "Max Daily Withdrawal", current: "$25,000", target: "$100,000", improvement: "+$75,000" },
    ],
    estimatedTimeToReach: "3-6 months at current pace",
    tips: [
      "Increase your betting volume to reach the next tier faster",
      "Focus on high-volume sports like NBA and NFL",
      "Participate in VIP events for bonus volume",
    ],
  };

  return c.json({
    success: true,
    data: comparison,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /vip/manager
// Get dedicated account manager info (for platinum+ tiers)
// ============================================================================

app.get("/manager", async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  // For demo, assume user is gold (no dedicated manager)
  const managerInfo = {
    hasManager: false,
    requiredTier: "platinum",
    message: "Dedicated account managers are available for Platinum tier and above",
    upgradeInfo: {
      volumeToUpgrade: 175000,
      currentVolume: 75000,
    },
  };

  return c.json({
    success: true,
    data: managerInfo,
    timestamp: new Date().toISOString(),
  });
});

export { app as vipRoutes };
