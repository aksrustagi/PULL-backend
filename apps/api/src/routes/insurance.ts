import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";
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
  betAmount: z.number().positive(),
  betOdds: z.number().positive(),
  sport: z.string(),
  event: z.string(),
  market: z.string(),
  selection: z.string(),
});

const claimInsuranceSchema = z.object({
  policyId: z.string(),
  claimReason: z.string().min(10).max(500),
  evidence: z.array(z.string()).optional(),
  betResult: z.enum(["loss", "push", "partial_loss"]).optional(),
  actualMargin: z.number().optional(),
  eventOutcome: z.string().optional(),
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
  const requestId = c.get("requestId");
  const sport = c.req.query("sport");
  const betType = c.req.query("betType");

  try {
    const products = await convex.query(api.insurance.getProducts, {
      sport: sport || undefined,
      betType: betType || undefined,
      isActive: true,
    });

    return c.json({
      success: true,
      data: products,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching insurance products:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch insurance products" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/quote
// Get insurance quote for a specific bet
// ============================================================================

app.get("/quote", zValidator("query", z.object({
  betId: z.string(),
  productId: z.string(),
  betAmount: z.coerce.number().positive(),
  betOdds: z.coerce.number().positive(),
  sport: z.string(),
  coverageAmount: z.coerce.number().positive().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const { betId, productId, betAmount, betOdds, sport, coverageAmount } = c.req.valid("query");

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
    const result = await convex.query(api.insurance.getQuote, {
      userId: userId as Id<"users">,
      productId: productId as Id<"insuranceProducts">,
      betId,
      betAmount,
      betOdds,
      sport,
      coverageAmount,
    });

    if (!result.eligible) {
      return c.json({
        success: false,
        error: {
          code: "INELIGIBLE",
          message: result.eligibilityReason || "Not eligible for this insurance product",
        },
        timestamp: new Date().toISOString(),
      }, 400);
    }

    return c.json({
      success: true,
      data: result.quote,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching insurance quote:`, error);
    return c.json(
      {
        success: false,
        error: { code: "QUOTE_FAILED", message: "Failed to generate insurance quote" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// POST /insurance/purchase
// Purchase insurance for a bet
// ============================================================================

app.post("/purchase", zValidator("json", purchaseInsuranceSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
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

  try {
    // First get a quote to calculate the premium
    const quoteResult = await convex.query(api.insurance.getQuote, {
      userId: userId as Id<"users">,
      productId: body.productId as Id<"insuranceProducts">,
      betId: body.betId,
      betAmount: body.betAmount,
      betOdds: body.betOdds,
      sport: body.sport,
      coverageAmount: body.coverageAmount,
    });

    if (!quoteResult.eligible || !quoteResult.quote) {
      return c.json({
        success: false,
        error: {
          code: "INELIGIBLE",
          message: quoteResult.eligibilityReason || "Not eligible for this insurance product",
        },
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const quote = quoteResult.quote;

    // Purchase the policy
    const policy = await convex.mutation(api.insurance.purchasePolicy, {
      userId: userId as Id<"users">,
      productId: body.productId as Id<"insuranceProducts">,
      betId: body.betId,
      orderId: `ord_${Date.now()}`,
      coverageAmount: body.coverageAmount,
      premiumPaid: quote.finalPremium,
      premiumBreakdown: {
        basePremium: quote.basePremium,
        oddsAdjustment: quote.oddsAdjustment,
        vipDiscount: quote.vipDiscount,
        finalPremium: quote.finalPremium,
      },
      betAmount: body.betAmount,
      betOdds: body.betOdds,
      sport: body.sport,
      event: body.event,
      market: body.market,
      selection: body.selection,
    });

    return c.json({
      success: true,
      data: policy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error purchasing insurance:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("Insufficient balance")) {
      return c.json(
        {
          success: false,
          error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance for premium" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    if (errorMessage.includes("not found") || errorMessage.includes("inactive")) {
      return c.json(
        {
          success: false,
          error: { code: "PRODUCT_NOT_FOUND", message: "Insurance product not found or inactive" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json(
      {
        success: false,
        error: { code: "PURCHASE_FAILED", message: "Failed to purchase insurance" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/policies
// Get user's insurance policies
// ============================================================================

app.get("/policies", zValidator("query", paginationSchema.extend({
  status: z.enum(["active", "pending_claim", "claimed", "expired", "cancelled", "void"]).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
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

  try {
    // Convert cursor to offset for pagination
    const offset = cursor ? parseInt(cursor, 10) : 0;

    const result = await convex.query(api.insurance.getUserPolicies, {
      userId: userId as Id<"users">,
      status: status as any,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: {
        items: result.items,
        hasMore: result.hasMore,
        nextCursor: result.hasMore ? String(offset + limit) : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching policies:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch insurance policies" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/policies/:policyId
// Get specific policy details
// ============================================================================

app.get("/policies/:policyId", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
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

  try {
    const policy = await convex.query(api.insurance.getPolicyById, {
      policyId: policyId as Id<"insurancePolicies">,
      userId: userId as Id<"users">,
    });

    if (!policy) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Policy not found" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: policy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching policy:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch policy details" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// POST /insurance/claim
// Submit an insurance claim
// ============================================================================

app.post("/claim", zValidator("json", claimInsuranceSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
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

  try {
    const claim = await convex.mutation(api.insurance.submitClaim, {
      policyId: body.policyId as Id<"insurancePolicies">,
      userId: userId as Id<"users">,
      claimReason: body.claimReason,
      evidence: body.evidence,
      betResult: body.betResult,
      actualMargin: body.actualMargin,
      eventOutcome: body.eventOutcome,
    });

    return c.json({
      success: true,
      data: claim,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error submitting claim:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return c.json(
        {
          success: false,
          error: { code: "POLICY_NOT_FOUND", message: "Policy not found" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    if (errorMessage.includes("Unauthorized")) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "You do not own this policy" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    if (errorMessage.includes("not active")) {
      return c.json(
        {
          success: false,
          error: { code: "POLICY_NOT_ACTIVE", message: "Policy is not active" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    if (errorMessage.includes("expired")) {
      return c.json(
        {
          success: false,
          error: { code: "POLICY_EXPIRED", message: "Policy has expired" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: { code: "CLAIM_FAILED", message: "Failed to submit claim" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/claims
// Get user's claim history
// ============================================================================

app.get("/claims", zValidator("query", paginationSchema.extend({
  status: z.enum(["pending", "under_review", "approved", "denied", "paid", "disputed"]).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
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

  try {
    // Convert cursor to offset for pagination
    const offset = cursor ? parseInt(cursor, 10) : 0;

    const result = await convex.query(api.insurance.getUserClaims, {
      userId: userId as Id<"users">,
      status: status as any,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: {
        items: result.items,
        hasMore: result.hasMore,
        nextCursor: result.hasMore ? String(offset + limit) : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching claims:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch insurance claims" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/credits
// Get user's insurance credit balance
// ============================================================================

app.get("/credits", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

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
    const credits = await convex.query(api.insurance.getCreditBalance, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: credits,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching credits:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch insurance credits" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// GET /insurance/stats
// Get user's insurance statistics
// ============================================================================

app.get("/stats", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

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
    const stats = await convex.query(api.insurance.getUserStats, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error fetching stats:`, error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch insurance statistics" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as insuranceRoutes };
