/**
 * AI Copilot API Routes
 * REST endpoints for personal AI betting assistant
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  AskCopilotRequestSchema,
  GetInsightsRequestSchema,
  AnalyzeBetRequestSchema,
  GetEVOpportunitiesRequestSchema,
  UpdatePreferencesRequestSchema,
  ProvideFeedbackRequestSchema,
  InsightTypeSchema,
  ConfidenceLevelSchema,
  CopilotTierSchema,
} from "@pull/core/services/ai-copilot";

const app = new Hono<Env>();

// ============================================================================
// PROFILE
// ============================================================================

/**
 * Get copilot profile
 */
app.get("/profile", async (c) => {
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
        tier: "free",
        isActive: true,
        preferences: {
          enableAlerts: true,
          alertTypes: ["ev_opportunity", "risk_warning", "streak_alert"],
          minConfidence: "medium",
          minEVPercent: 3,
          preferredSports: [],
          preferredMarkets: [],
          excludedMarkets: [],
          riskTolerance: "moderate",
          maxSingleBet: 100,
          maxDailyExposure: 500,
          bankrollManagement: true,
          pushEnabled: true,
          emailDigest: "daily",
        },
        insightsGenerated: 0,
        insightsActedOn: 0,
        successfulInsights: 0,
        accuracyRate: 0,
        dailyQueriesUsed: 0,
        dailyQueryLimit: 5,
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_PROFILE_FAILED",
          message: error instanceof Error ? error.message : "Failed to get profile",
        },
      },
      500
    );
  }
});

/**
 * Update copilot preferences
 */
app.patch("/preferences", zValidator("json", UpdatePreferencesRequestSchema), async (c) => {
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
      data: { updated: true, preferences: body.preferences },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_PREFERENCES_FAILED",
          message: error instanceof Error ? error.message : "Failed to update preferences",
        },
      },
      500
    );
  }
});

/**
 * Upgrade copilot tier
 */
app.post("/upgrade", zValidator("json", z.object({ tier: CopilotTierSchema })), async (c) => {
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
      data: { tier: body.tier, upgraded: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UPGRADE_FAILED",
          message: error instanceof Error ? error.message : "Failed to upgrade",
        },
      },
      500
    );
  }
});

// ============================================================================
// ASK / CHAT
// ============================================================================

/**
 * Ask the AI copilot
 */
app.post("/ask", zValidator("json", AskCopilotRequestSchema), async (c) => {
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
        answer: "I've analyzed your question and here's my recommendation...",
        insights: [],
        confidence: "medium",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "ASK_FAILED",
          message: error instanceof Error ? error.message : "Failed to process question",
        },
      },
      500
    );
  }
});

/**
 * Get conversation history
 */
app.get("/conversations", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { conversations: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_CONVERSATIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get conversations",
        },
      },
      500
    );
  }
});

// ============================================================================
// INSIGHTS
// ============================================================================

/**
 * Get AI-generated insights
 */
app.get("/insights", async (c) => {
  const userId = c.get("userId");
  const types = c.req.query("types")?.split(",");
  const minConfidence = c.req.query("minConfidence");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

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
        insights: [],
        totalCount: 0,
        hasMore: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_INSIGHTS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get insights",
        },
      },
      500
    );
  }
});

/**
 * Refresh insights (generate new)
 */
app.post("/insights/refresh", async (c) => {
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
      data: { insights: [], refreshedAt: Date.now() },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "REFRESH_INSIGHTS_FAILED",
          message: error instanceof Error ? error.message : "Failed to refresh insights",
        },
      },
      500
    );
  }
});

/**
 * Get specific insight
 */
app.get("/insights/:insightId", async (c) => {
  const userId = c.get("userId");
  const insightId = c.req.param("insightId");

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
          code: "GET_INSIGHT_FAILED",
          message: error instanceof Error ? error.message : "Failed to get insight",
        },
      },
      500
    );
  }
});

// ============================================================================
// BET ANALYSIS
// ============================================================================

/**
 * Analyze a potential bet
 */
app.post("/analyze-bet", zValidator("json", AnalyzeBetRequestSchema), async (c) => {
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
        recommendation: "caution",
        evAnalysis: {
          expectedValue: 0,
          evPercent: 0,
          impliedProbability: 0.5,
          trueProbability: 0.5,
          edgePercent: 0,
          kellyStake: 0,
          halfKellyStake: 0,
          breakdownFactors: [],
        },
        riskAssessment: {
          overallRisk: "medium",
          riskScore: 50,
          factors: [],
          mitigations: [],
          maxRecommendedStake: body.stake,
        },
        insights: [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "ANALYZE_BET_FAILED",
          message: error instanceof Error ? error.message : "Failed to analyze bet",
        },
      },
      500
    );
  }
});

// ============================================================================
// EV OPPORTUNITIES
// ============================================================================

/**
 * Get +EV opportunities
 */
app.get("/ev-opportunities", async (c) => {
  const userId = c.get("userId");
  const categories = c.req.query("categories")?.split(",");
  const minEV = parseFloat(c.req.query("minEV") ?? "0");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

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
        opportunities: [],
        totalFound: 0,
        lastScanned: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_EV_OPPORTUNITIES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get EV opportunities",
        },
      },
      500
    );
  }
});

/**
 * Analyze specific EV opportunity
 */
app.get("/ev-opportunities/:opportunityId", async (c) => {
  const userId = c.get("userId");
  const opportunityId = c.req.param("opportunityId");

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
          code: "GET_OPPORTUNITY_FAILED",
          message: error instanceof Error ? error.message : "Failed to get opportunity",
        },
      },
      500
    );
  }
});

// ============================================================================
// BETTING PROFILE
// ============================================================================

/**
 * Get betting profile analysis
 */
app.get("/betting-profile", async (c) => {
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
        totalBets: 0,
        totalWon: 0,
        totalLost: 0,
        winRate: 0,
        roi: 0,
        profitLoss: 0,
        categoryPerformance: {},
        patterns: [],
        avgBetSize: 0,
        avgOdds: 0,
        bettingFrequency: "casual",
        tiltRisk: "low",
        chasingLosses: false,
        currentStreak: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
        analyzedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_BETTING_PROFILE_FAILED",
          message: error instanceof Error ? error.message : "Failed to get betting profile",
        },
      },
      500
    );
  }
});

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Get alerts
 */
app.get("/alerts", async (c) => {
  const userId = c.get("userId");
  const unreadOnly = c.req.query("unreadOnly") === "true";

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { alerts: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_ALERTS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get alerts",
        },
      },
      500
    );
  }
});

/**
 * Mark alert as read
 */
app.post("/alerts/:alertId/read", async (c) => {
  const userId = c.get("userId");
  const alertId = c.req.param("alertId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { read: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "MARK_READ_FAILED",
          message: error instanceof Error ? error.message : "Failed to mark as read",
        },
      },
      500
    );
  }
});

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Provide feedback on an insight
 */
app.post("/feedback", zValidator("json", ProvideFeedbackRequestSchema), async (c) => {
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
      data: { recorded: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "PROVIDE_FEEDBACK_FAILED",
          message: error instanceof Error ? error.message : "Failed to provide feedback",
        },
      },
      500
    );
  }
});

export { app as aiCopilotRoutes };
