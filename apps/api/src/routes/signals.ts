import { Hono } from "hono";
import type { Env } from "../index";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

// ============================================================================
// SIGNAL ENDPOINTS
// ============================================================================

/**
 * Get signals for the authenticated user
 * Query params: types[], minConfidence, limit, unseen
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  const typesParam = c.req.query("types");
  const types = typesParam ? typesParam.split(",") : undefined;
  const minConfidence = c.req.query("minConfidence")
    ? parseInt(c.req.query("minConfidence")!, 10)
    : undefined;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const unseen = c.req.query("unseen") === "true";

  try {
    const signals = await convex.query(api.signals.getSignals, {
      userId: userId as Id<"users">,
      types,
      minConfidence,
      unseenOnly: unseen,
      limit,
    });

    return c.json({
      success: true,
      data: {
        signals: signals ?? [],
        pagination: {
          limit,
          hasMore: (signals?.length ?? 0) === limit,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch signals",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get signal by ID with full details
 */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const signalId = c.req.param("id");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const signal = await convex.query(api.signals.getSignalById, {
      id: signalId as Id<"signals">,
      userId: userId as Id<"users">,
    });

    if (!signal) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Signal not found" },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        signal,
        relatedMarkets: signal.markets ?? [],
        userActions: signal.userSignal
          ? {
              seen: signal.userSignal.seen,
              dismissed: signal.userSignal.dismissed,
              actedOn: signal.userSignal.actedOn,
            }
          : {
              seen: false,
              dismissed: false,
              actedOn: false,
            },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching signal ${signalId}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch signal details",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Mark signal as seen
 */
app.post("/:id/seen", async (c) => {
  const userId = c.get("userId");
  const signalId = c.req.param("id");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const result = await convex.mutation(api.signals.markSignalSeen, {
      signalId: signalId as Id<"signals">,
      userId: userId as Id<"users">,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Signal not found or not assigned to user",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { signalId, seen: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error marking signal ${signalId} as seen:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to mark signal as seen",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Dismiss signal
 */
app.post("/:id/dismiss", async (c) => {
  const userId = c.get("userId");
  const signalId = c.req.param("id");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const result = await convex.mutation(api.signals.dismissSignal, {
      signalId: signalId as Id<"signals">,
      userId: userId as Id<"users">,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Signal not found or not assigned to user",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { signalId, dismissed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error dismissing signal ${signalId}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to dismiss signal",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Mark signal as acted on (for analytics)
 */
app.post("/:id/acted", async (c) => {
  const userId = c.get("userId");
  const signalId = c.req.param("id");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const result = await convex.mutation(api.signals.markSignalActed, {
      signalId: signalId as Id<"signals">,
      userId: userId as Id<"users">,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Signal not found or not assigned to user",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { signalId, actedOn: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error marking signal ${signalId} as acted:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to mark signal as acted on",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// INSIGHT ENDPOINTS
// ============================================================================

/**
 * Get personalized insights
 * Query params: type, limit
 */
app.get("/insights", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    const insights = await convex.query(api.signals.getUserInsights, {
      userId: userId as Id<"users">,
      type: type || undefined,
      activeOnly: true,
      limit,
    });

    // Get today's briefing if it exists
    const todayInsights = await convex.query(api.signals.getTodayInsights, {
      userId: userId as Id<"users">,
    });

    const todayBriefing =
      todayInsights && todayInsights.length > 0
        ? {
            count: todayInsights.length,
            highPriority: todayInsights.filter((i: { priority: number }) => i.priority >= 4).length,
            generatedAt: new Date().toISOString(),
          }
        : null;

    return c.json({
      success: true,
      data: {
        insights: insights ?? [],
        todayBriefing,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching insights:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch insights",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get today's morning briefing
 */
app.get("/insights/today", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const insights = await convex.query(api.signals.getTodayInsights, {
      userId: userId as Id<"users">,
    });

    // Generate a personalized greeting based on time of day
    const hour = new Date().getHours();
    let greeting = "Good morning!";
    if (hour >= 12 && hour < 17) {
      greeting = "Good afternoon!";
    } else if (hour >= 17) {
      greeting = "Good evening!";
    }

    // Generate summary based on insights
    let summary = "No insights available yet.";
    if (insights && insights.length > 0) {
      const highPriority = insights.filter((i: { priority: number }) => i.priority >= 4).length;
      if (highPriority > 0) {
        summary = `You have ${highPriority} high-priority insight${highPriority > 1 ? "s" : ""} and ${insights.length - highPriority} other insight${insights.length - highPriority !== 1 ? "s" : ""} today.`;
      } else {
        summary = `You have ${insights.length} insight${insights.length > 1 ? "s" : ""} to review today.`;
      }
    }

    return c.json({
      success: true,
      data: {
        greeting,
        summary,
        insights: insights ?? [],
        generatedAt: insights && insights.length > 0 ? new Date().toISOString() : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching today's insights:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch today's insights",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Dismiss insight
 */
app.post("/insights/:id/dismiss", async (c) => {
  const userId = c.get("userId");
  const insightId = c.req.param("id");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await convex.mutation(api.signals.dismissInsight, {
      insightId: insightId as Id<"userInsights">,
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: { insightId, dismissed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error dismissing insight ${insightId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Insight not found or does not belong to user",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to dismiss insight",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// CORRELATION ENDPOINTS
// ============================================================================

/**
 * Get correlated markets for a given market
 */
app.get("/correlations/:ticker", async (c) => {
  const ticker = c.req.param("ticker");
  const minCorrelation = c.req.query("minCorrelation")
    ? parseFloat(c.req.query("minCorrelation")!)
    : 0.5;
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    const correlations = await convex.query(api.signals.getCorrelatedMarkets, {
      marketTicker: ticker,
      minCorrelation,
      limit,
    });

    return c.json({
      success: true,
      data: {
        market: ticker,
        correlations: correlations ?? [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching correlations for ${ticker}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch correlated markets",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get strongest correlations overall
 */
app.get("/correlations", async (c) => {
  const positive = c.req.query("positive");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    const correlations = await convex.query(api.signals.getStrongestCorrelations, {
      limit,
      positive: positive === "true" ? true : positive === "false" ? false : undefined,
    });

    return c.json({
      success: true,
      data: {
        correlations: correlations ?? [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching strongest correlations:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch correlations",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// PREFERENCE ENDPOINTS
// ============================================================================

/**
 * Get user signal preferences
 */
app.get("/preferences", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const preferences = await convex.query(api.signals.getUserPreferences, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching signal preferences:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch preferences",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Update user signal preferences
 */
app.put("/preferences", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  const body = await c.req.json();

  // Validate preferences
  const validFields = [
    "emailAnalysisEnabled",
    "socialAnalysisEnabled",
    "marketAlertsEnabled",
    "dailyInsightsEnabled",
    "pushNotificationsEnabled",
    "minConfidenceThreshold",
    "preferredUrgencyLevel",
    "interests",
    "excludedMarkets",
    "timezone",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of validFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate preferredUrgencyLevel if provided
  if (
    updates.preferredUrgencyLevel &&
    !["all", "medium_high", "high_only"].includes(updates.preferredUrgencyLevel as string)
  ) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "preferredUrgencyLevel must be 'all', 'medium_high', or 'high_only'",
        },
        timestamp: new Date().toISOString(),
      },
      400
    );
  }

  // Validate minConfidenceThreshold if provided
  if (updates.minConfidenceThreshold !== undefined) {
    const threshold = updates.minConfidenceThreshold as number;
    if (typeof threshold !== "number" || threshold < 0 || threshold > 100) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "minConfidenceThreshold must be a number between 0 and 100",
          },
          timestamp: new Date().toISOString(),
        },
        400
      );
    }
  }

  try {
    await convex.mutation(api.signals.updatePreferences, {
      userId: userId as Id<"users">,
      ...updates,
    });

    // Fetch updated preferences to return
    const updatedPreferences = await convex.query(api.signals.getUserPreferences, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error updating signal preferences:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to update preferences",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// STATS ENDPOINT
// ============================================================================

/**
 * Get signal stats for user
 */
app.get("/stats", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const stats = await convex.query(api.signals.getSignalStats, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching signal stats:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch signal statistics",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as signalsRoutes };
