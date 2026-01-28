import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// Protect all insurance routes - feature is not production-ready
app.use("*", requireFeature("insurance", "Insurance"));

// ============================================================================
// Validation Schemas
// ============================================================================

const insuranceTypeSchema = z.enum([
  "close_loss",
  "push_protection",
  "half_point",
  "bad_beat",
  "overtime_loss",
  "garbage_time",
]);

const purchaseInsuranceSchema = z.object({
  betId: z.string(),
  productId: z.string(),
  coverageAmount: z.number().positive(),
});

const claimInsuranceSchema = z.object({
  policyId: z.string(),
  claimReason: z.string().min(10).max(500),
  evidence: z.array(z.string()).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// ============================================================================
// GET /insurance/products
// Get available insurance products
// ============================================================================

app.get("/products", async (c) => {
  const userId = c.get("userId");

  // Feature protected by feature flag - Convex integration pending
  const products = [
    {
      id: "prod_close_loss",
      type: "close_loss" as const,
      name: "Close Loss Protection",
      description: "Get your stake back if you lose by 1 point or less",
      premiumRate: 0.08, // 8% of stake
      maxCoverage: 1000,
      minOdds: 1.5,
      maxOdds: 5.0,
      eligibleBetTypes: ["spread", "total", "moneyline"],
      eligibleSports: ["nba", "nfl", "mlb", "nhl"],
      active: true,
      popularityRank: 1,
    },
    {
      id: "prod_push_protection",
      type: "push_protection" as const,
      name: "Push Protection",
      description: "Get paid on pushes instead of getting stake returned",
      premiumRate: 0.05, // 5% of stake
      maxCoverage: 2000,
      minOdds: 1.3,
      maxOdds: 3.0,
      eligibleBetTypes: ["spread", "total"],
      eligibleSports: ["nba", "nfl", "ncaaf", "ncaab"],
      active: true,
      popularityRank: 2,
    },
    {
      id: "prod_half_point",
      type: "half_point" as const,
      name: "Half-Point Coverage",
      description: "Win if you would have won with a half-point better line",
      premiumRate: 0.12, // 12% of stake
      maxCoverage: 500,
      minOdds: 1.8,
      maxOdds: 2.2,
      eligibleBetTypes: ["spread"],
      eligibleSports: ["nba", "nfl"],
      active: true,
      popularityRank: 3,
    },
    {
      id: "prod_bad_beat",
      type: "bad_beat" as const,
      name: "Bad Beat Insurance",
      description: "Protection against devastating last-minute losses",
      premiumRate: 0.15, // 15% of stake
      maxCoverage: 5000,
      minOdds: 1.5,
      maxOdds: 10.0,
      eligibleBetTypes: ["spread", "moneyline", "total"],
      eligibleSports: ["nba", "nfl", "mlb"],
      active: true,
      popularityRank: 4,
    },
    {
      id: "prod_overtime_loss",
      type: "overtime_loss" as const,
      name: "Overtime Loss Protection",
      description: "Get refunded if your team loses in overtime",
      premiumRate: 0.10, // 10% of stake
      maxCoverage: 1000,
      minOdds: 1.5,
      maxOdds: 4.0,
      eligibleBetTypes: ["moneyline"],
      eligibleSports: ["nba", "nfl", "nhl"],
      active: true,
      popularityRank: 5,
    },
    {
      id: "prod_garbage_time",
      type: "garbage_time" as const,
      name: "Garbage Time Coverage",
      description: "Coverage for late-game meaningless points affecting your bet",
      premiumRate: 0.07, // 7% of stake
      maxCoverage: 750,
      minOdds: 1.8,
      maxOdds: 3.0,
      eligibleBetTypes: ["spread", "total"],
      eligibleSports: ["nba", "nfl"],
      active: true,
      popularityRank: 6,
    },
  ];

  return c.json({
    success: true,
    data: products,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/quote
// Get insurance quote for a specific bet
// ============================================================================

app.get("/quote", zValidator("query", z.object({
  betId: z.string(),
  productId: z.string(),
  coverageAmount: z.coerce.number().positive().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { betId, productId, coverageAmount } = c.req.valid("query");

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
  const quote = {
    betId,
    productId,
    productName: "Close Loss Protection",
    stake: 100,
    odds: 2.0,
    sport: "nba",
    betType: "spread",
    coverageAmount: coverageAmount || 100,
    basePremium: 8.00,
    oddsAdjustment: 0.50, // Higher odds = higher risk
    vipDiscount: -0.40, // Gold tier = 5% discount
    finalPremium: 8.10,
    maxPayout: 100,
    eligible: true,
    eligibilityReason: null,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    quoteId: `quote_${Date.now()}`,
  };

  return c.json({
    success: true,
    data: quote,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /insurance/purchase
// Purchase insurance for a bet
// ============================================================================

app.post("/purchase", zValidator("json", purchaseInsuranceSchema), async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  const policy = {
    policyId: `pol_${Date.now()}`,
    betId: body.betId,
    productId: body.productId,
    productName: "Close Loss Protection",
    coverageAmount: body.coverageAmount,
    premiumPaid: 8.10,
    status: "active" as const,
    purchasedAt: Date.now(),
    expiresAt: null, // Expires when bet settles
    terms: {
      triggerCondition: "Loss by 1 point or less",
      payoutAmount: body.coverageAmount,
      claimDeadline: "24 hours after bet settlement",
    },
  };

  return c.json({
    success: true,
    data: policy,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/policies
// Get user's insurance policies
// ============================================================================

app.get("/policies", zValidator("query", paginationSchema.extend({
  status: z.enum(["active", "claimed", "expired", "cancelled"]).optional(),
})), async (c) => {
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
  const policies = [
    {
      policyId: "pol_001",
      betId: "bet_123",
      productType: "close_loss" as const,
      productName: "Close Loss Protection",
      coverageAmount: 100,
      premiumPaid: 8.10,
      status: "active" as const,
      purchasedAt: Date.now() - 3600000,
      betDetails: {
        event: "Lakers vs Celtics",
        selection: "Lakers -3.5",
        odds: 1.91,
        stake: 100,
        status: "pending",
      },
    },
    {
      policyId: "pol_002",
      betId: "bet_122",
      productType: "push_protection" as const,
      productName: "Push Protection",
      coverageAmount: 50,
      premiumPaid: 2.50,
      status: "claimed" as const,
      purchasedAt: Date.now() - 86400000,
      claimedAt: Date.now() - 43200000,
      claimPayout: 50,
      betDetails: {
        event: "Chiefs vs Eagles",
        selection: "Chiefs -7",
        odds: 1.91,
        stake: 50,
        status: "push",
      },
    },
    {
      policyId: "pol_003",
      betId: "bet_121",
      productType: "bad_beat" as const,
      productName: "Bad Beat Insurance",
      coverageAmount: 200,
      premiumPaid: 30.00,
      status: "expired" as const,
      purchasedAt: Date.now() - 172800000,
      expiredAt: Date.now() - 86400000,
      betDetails: {
        event: "Patriots vs Bills",
        selection: "Patriots ML",
        odds: 2.50,
        stake: 200,
        status: "won",
      },
    },
  ];

  const filteredPolicies = status
    ? policies.filter((p) => p.status === status)
    : policies;

  return c.json({
    success: true,
    data: {
      items: filteredPolicies,
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/policies/:policyId
// Get specific policy details
// ============================================================================

app.get("/policies/:policyId", async (c) => {
  const userId = c.get("userId");
  const policyId = c.req.param("policyId");

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
  const policy = {
    policyId,
    betId: "bet_123",
    productType: "close_loss" as const,
    productName: "Close Loss Protection",
    coverageAmount: 100,
    premiumPaid: 8.10,
    status: "active" as const,
    purchasedAt: Date.now() - 3600000,
    terms: {
      triggerCondition: "Loss by 1 point or less",
      payoutAmount: 100,
      claimDeadline: "24 hours after bet settlement",
      exclusions: [
        "Player prop bets",
        "Live/in-play bets",
        "Bets placed after game start",
      ],
    },
    betDetails: {
      event: "Lakers vs Celtics",
      selection: "Lakers -3.5",
      odds: 1.91,
      stake: 100,
      status: "pending",
      eventDate: Date.now() + 7200000,
    },
    claimHistory: [],
  };

  return c.json({
    success: true,
    data: policy,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /insurance/claim
// Submit an insurance claim
// ============================================================================

app.post("/claim", zValidator("json", claimInsuranceSchema), async (c) => {
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

  // Feature protected by feature flag - Convex integration pending
  const claim = {
    claimId: `clm_${Date.now()}`,
    policyId: body.policyId,
    status: "pending_review" as const,
    submittedAt: Date.now(),
    reason: body.claimReason,
    evidence: body.evidence || [],
    estimatedReviewTime: "1-2 hours",
    message: "Your claim has been submitted and is under review",
  };

  return c.json({
    success: true,
    data: claim,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/claims
// Get user's claim history
// ============================================================================

app.get("/claims", zValidator("query", paginationSchema.extend({
  status: z.enum(["pending_review", "approved", "denied", "paid"]).optional(),
})), async (c) => {
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
  const claims = [
    {
      claimId: "clm_001",
      policyId: "pol_002",
      productType: "push_protection" as const,
      status: "paid" as const,
      submittedAt: Date.now() - 86400000,
      reviewedAt: Date.now() - 84600000,
      paidAt: Date.now() - 82800000,
      amount: 50,
      reason: "Game ended in a push with Chiefs at -7",
    },
    {
      claimId: "clm_002",
      policyId: "pol_004",
      productType: "close_loss" as const,
      status: "denied" as const,
      submittedAt: Date.now() - 172800000,
      reviewedAt: Date.now() - 168000000,
      denialReason: "Loss margin exceeded 1 point threshold (lost by 3)",
    },
  ];

  const filteredClaims = status
    ? claims.filter((cl) => cl.status === status)
    : claims;

  return c.json({
    success: true,
    data: {
      items: filteredClaims,
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/credits
// Get user's insurance credit balance
// ============================================================================

app.get("/credits", async (c) => {
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
  const credits = {
    balance: 25.00,
    lifetimeEarned: 75.00,
    lifetimeUsed: 50.00,
    pendingCredits: 0,
    expiringCredits: {
      amount: 10.00,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    recentTransactions: [
      {
        type: "earned" as const,
        amount: 25.00,
        reason: "Claim payout (Push Protection)",
        date: Date.now() - 86400000,
      },
      {
        type: "used" as const,
        amount: -8.10,
        reason: "Insurance premium payment",
        date: Date.now() - 172800000,
      },
    ],
  };

  return c.json({
    success: true,
    data: credits,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /insurance/stats
// Get user's insurance statistics
// ============================================================================

app.get("/stats", async (c) => {
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
  const stats = {
    totalPolicies: 15,
    activePolicies: 3,
    totalPremiumsPaid: 145.50,
    totalClaimsPaid: 125.00,
    claimSuccessRate: 0.667, // 66.7%
    avgPremiumPerPolicy: 9.70,
    mostUsedProduct: "close_loss",
    savingsFromInsurance: 125.00 - 145.50, // Net cost/benefit
    monthlyStats: [
      { month: "2024-01", policies: 5, premiums: 48.50, claims: 50.00 },
      { month: "2024-02", policies: 6, premiums: 52.00, claims: 0 },
      { month: "2024-03", policies: 4, premiums: 45.00, claims: 75.00 },
    ],
  };

  return c.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

export { app as insuranceRoutes };
