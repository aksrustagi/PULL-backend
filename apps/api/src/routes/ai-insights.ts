/**
 * AI Insights API Routes
 *
 * Premium sports insights powered by AI
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../index";
import {
  getAIInsightsService,
  SportTypeSchema,
  InsightCategorySchema,
  INSIGHT_BUNDLES,
  InsightTier,
} from "@pull/core/services/ai-insights";

const app = new Hono<Env>();

// ============================================================================
// SCHEMAS
// ============================================================================

const GenerateInsightSchema = z.object({
  sport: SportTypeSchema,
  category: InsightCategorySchema,
  context: z.record(z.unknown()).optional(),
});

const GetFeedSchema = z.object({
  sport: SportTypeSchema,
  category: InsightCategorySchema,
  limit: z.number().min(1).max(50).default(10),
  cursor: z.string().optional(),
});

const PurchaseInsightSchema = z.object({
  insightId: z.string(),
});

const PurchaseBundleSchema = z.object({
  bundleId: z.string(),
  context: z.record(z.unknown()).optional(),
});

const UpdatePreferencesSchema = z.object({
  sports: z.array(SportTypeSchema),
  categories: z.array(InsightCategorySchema),
  notificationEnabled: z.boolean(),
  emailDigest: z.enum(["none", "daily", "weekly"]),
  priceAlerts: z.boolean(),
  movementThreshold: z.number().min(0).max(100),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserTier(userId: string): Promise<InsightTier> {
  // TODO: Fetch from database
  return "free";
}

async function getUserCredits(userId: string): Promise<number> {
  // TODO: Fetch from database
  return 5;
}

async function deductCredits(userId: string, amount: number): Promise<boolean> {
  // TODO: Implement credit deduction
  return true;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /ai-insights/bundles
 * Get available insight bundles
 */
app.get("/bundles", async (c) => {
  const sport = c.req.query("sport");

  const bundles = sport
    ? INSIGHT_BUNDLES.filter((b) => b.sport === sport)
    : INSIGHT_BUNDLES;

  return c.json({
    success: true,
    data: bundles,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ai-insights/bundles/:id
 * Get a specific bundle
 */
app.get("/bundles/:id", async (c) => {
  const bundleId = c.req.param("id");
  const bundle = INSIGHT_BUNDLES.find((b) => b.id === bundleId);

  if (!bundle) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Bundle not found" },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: bundle,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /ai-insights/generate
 * Generate a single insight
 */
app.post(
  "/generate",
  zValidator("json", GenerateInsightSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401
      );
    }

    const service = getAIInsightsService();
    const userTier = await getUserTier(userId);

    try {
      const insight = await service.generateInsight(
        {
          sport: body.sport,
          category: body.category,
          context: body.context ?? {},
          userId,
        },
        userTier
      );

      return c.json({
        success: true,
        data: insight,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to generate insight:", error);
      return c.json(
        {
          success: false,
          error: { code: "GENERATION_FAILED", message: "Failed to generate insight" },
        },
        500
      );
    }
  }
);

/**
 * GET /ai-insights/feed
 * Get insight feed for a sport/category
 */
app.get("/feed", zValidator("query", GetFeedSchema), async (c) => {
  const userId = c.get("userId");
  const query = c.req.valid("query");

  const service = getAIInsightsService();
  const userTier = userId ? await getUserTier(userId) : "free";

  try {
    const feed = await service.getFeed(
      query.sport,
      query.category,
      userTier,
      query.limit,
      query.cursor
    );

    return c.json({
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get feed:", error);
    return c.json(
      {
        success: false,
        error: { code: "FEED_ERROR", message: "Failed to get insight feed" },
      },
      500
    );
  }
});

/**
 * GET /ai-insights/personalized
 * Get personalized insight feed for user
 */
app.get("/personalized", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401
    );
  }

  const service = getAIInsightsService();
  const userTier = await getUserTier(userId);

  // TODO: Get preferences from database
  const preferences = {
    userId,
    sports: ["nfl" as const, "ncaa_basketball" as const],
    categories: ["nfl_start_sit" as const, "ncaa_bracket_prediction" as const],
    notificationEnabled: true,
    emailDigest: "daily" as const,
    priceAlerts: true,
    movementThreshold: 5,
  };

  try {
    const insights = await service.getPersonalizedFeed(
      userId,
      preferences,
      userTier,
      20
    );

    return c.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get personalized feed:", error);
    return c.json(
      {
        success: false,
        error: { code: "FEED_ERROR", message: "Failed to get personalized feed" },
      },
      500
    );
  }
});

/**
 * POST /ai-insights/purchase
 * Purchase (unlock) a single insight
 */
app.post(
  "/purchase",
  zValidator("json", PurchaseInsightSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401
      );
    }

    const service = getAIInsightsService();

    // TODO: Get insight from database
    const insightCost = 10; // Example cost
    const userCredits = await getUserCredits(userId);

    if (userCredits < insightCost) {
      return c.json(
        {
          success: false,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: `You need ${insightCost} credits but only have ${userCredits}`,
          },
          meta: {
            required: insightCost,
            available: userCredits,
          },
        },
        402
      );
    }

    const deducted = await deductCredits(userId, insightCost);
    if (!deducted) {
      return c.json(
        {
          success: false,
          error: { code: "PAYMENT_FAILED", message: "Failed to process payment" },
        },
        500
      );
    }

    // TODO: Record purchase and unlock insight

    return c.json({
      success: true,
      data: {
        insightId: body.insightId,
        creditsSpent: insightCost,
        remainingCredits: userCredits - insightCost,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * POST /ai-insights/purchase-bundle
 * Purchase a bundle of insights
 */
app.post(
  "/purchase-bundle",
  zValidator("json", PurchaseBundleSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401
      );
    }

    const service = getAIInsightsService();
    const bundle = service.getBundle(body.bundleId);

    if (!bundle) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Bundle not found" },
        },
        404
      );
    }

    const userCredits = await getUserCredits(userId);

    if (userCredits < bundle.creditCost) {
      return c.json(
        {
          success: false,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: `You need ${bundle.creditCost} credits but only have ${userCredits}`,
          },
          meta: {
            required: bundle.creditCost,
            available: userCredits,
            cashAlternative: bundle.cashPrice,
          },
        },
        402
      );
    }

    const deducted = await deductCredits(userId, bundle.creditCost);
    if (!deducted) {
      return c.json(
        {
          success: false,
          error: { code: "PAYMENT_FAILED", message: "Failed to process payment" },
        },
        500
      );
    }

    const userTier = await getUserTier(userId);

    try {
      const insights = await service.generateBundleInsights(
        bundle,
        body.context ?? {},
        userTier
      );

      return c.json({
        success: true,
        data: {
          bundle,
          insights,
          creditsSpent: bundle.creditCost,
          remainingCredits: userCredits - bundle.creditCost,
          expiresAt: Date.now() + bundle.validDays * 24 * 60 * 60 * 1000,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to generate bundle insights:", error);
      // Refund credits
      // TODO: Implement refund
      return c.json(
        {
          success: false,
          error: { code: "GENERATION_FAILED", message: "Failed to generate bundle" },
        },
        500
      );
    }
  }
);

/**
 * GET /ai-insights/credits
 * Get user's credit balance
 */
app.get("/credits", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401
    );
  }

  const credits = await getUserCredits(userId);
  const tier = await getUserTier(userId);

  return c.json({
    success: true,
    data: {
      balance: credits,
      tier,
      // TODO: Get from database
      monthlyAllocation: tier === "free" ? 5 : tier === "standard" ? 50 : 200,
      usedThisMonth: 0,
      expiresAt: null,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ai-insights/purchases
 * Get user's purchase history
 */
app.get("/purchases", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401
    );
  }

  // TODO: Fetch from database
  const purchases: Array<{
    id: string;
    type: "insight" | "bundle";
    name: string;
    creditsSpent: number;
    purchasedAt: number;
    expiresAt: number;
  }> = [];

  return c.json({
    success: true,
    data: purchases,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ai-insights/preferences
 * Get user's insight preferences
 */
app.get("/preferences", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401
    );
  }

  // TODO: Fetch from database
  const preferences = {
    sports: ["nfl", "ncaa_basketball"],
    categories: ["nfl_start_sit", "ncaa_bracket_prediction"],
    notificationEnabled: true,
    emailDigest: "daily",
    priceAlerts: true,
    movementThreshold: 5,
  };

  return c.json({
    success: true,
    data: preferences,
    timestamp: new Date().toISOString(),
  });
});

/**
 * PUT /ai-insights/preferences
 * Update user's insight preferences
 */
app.put(
  "/preferences",
  zValidator("json", UpdatePreferencesSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401
      );
    }

    // TODO: Save to database

    return c.json({
      success: true,
      data: body,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * GET /ai-insights/subscription-plans
 * Get available subscription plans
 */
app.get("/subscription-plans", async (c) => {
  const plans = [
    {
      id: "free",
      name: "Free",
      price: 0,
      credits: 5,
      tier: "free",
      features: [
        "5 free insights per month",
        "Basic analysis",
        "Delayed updates",
      ],
    },
    {
      id: "starter",
      name: "Starter",
      price: 9.99,
      credits: 50,
      tier: "standard",
      features: [
        "50 credits per month",
        "Real-time insights",
        "Priority generation",
        "Email digest",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: 29.99,
      credits: 200,
      tier: "premium",
      features: [
        "200 credits per month",
        "Premium AI analysis",
        "All sport bundles",
        "Price alerts",
        "Odds movement tracking",
      ],
    },
    {
      id: "elite",
      name: "Elite",
      price: 99.99,
      credits: -1, // Unlimited
      tier: "elite",
      features: [
        "Unlimited insights",
        "Expert-level analysis",
        "1-on-1 analyst chat",
        "Custom alerts",
        "API access",
        "Priority support",
      ],
    },
  ];

  return c.json({
    success: true,
    data: plans,
    timestamp: new Date().toISOString(),
  });
});

export { app as aiInsightsRoutes };
