import { Hono } from "hono";
import type { Env } from "../index";

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

  // TODO: Fetch from Convex using signals:getSignals
  // const signals = await convex.query(api.signals.getSignals, {
  //   userId,
  //   types,
  //   minConfidence,
  //   unseenOnly: unseen,
  //   limit,
  // });

  return c.json({
    success: true,
    data: {
      signals: [],
      pagination: {
        limit,
        hasMore: false,
      },
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getSignalById
  // const signal = await convex.query(api.signals.getSignalById, {
  //   id: signalId,
  //   userId,
  // });

  // if (!signal) {
  //   return c.json({
  //     success: false,
  //     error: { code: "NOT_FOUND", message: "Signal not found" },
  //     timestamp: new Date().toISOString(),
  //   }, 404);
  // }

  return c.json({
    success: true,
    data: {
      signal: null,
      relatedMarkets: [],
      userActions: {
        seen: false,
        dismissed: false,
        actedOn: false,
      },
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation signals:markSignalSeen
  // await convex.mutation(api.signals.markSignalSeen, {
  //   signalId,
  //   userId,
  // });

  return c.json({
    success: true,
    data: { signalId, seen: true },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation signals:dismissSignal
  // await convex.mutation(api.signals.dismissSignal, {
  //   signalId,
  //   userId,
  // });

  return c.json({
    success: true,
    data: { signalId, dismissed: true },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation signals:markSignalActed
  // await convex.mutation(api.signals.markSignalActed, {
  //   signalId,
  //   userId,
  // });

  return c.json({
    success: true,
    data: { signalId, actedOn: true },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getUserInsights
  // const insights = await convex.query(api.signals.getUserInsights, {
  //   userId,
  //   type,
  //   activeOnly: true,
  //   limit,
  // });

  return c.json({
    success: true,
    data: {
      insights: [],
      todayBriefing: null,
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getTodayInsights
  // const insights = await convex.query(api.signals.getTodayInsights, {
  //   userId,
  // });

  return c.json({
    success: true,
    data: {
      greeting: "Good morning!",
      summary: "No insights available yet.",
      insights: [],
      generatedAt: null,
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation signals:dismissInsight
  // await convex.mutation(api.signals.dismissInsight, {
  //   insightId,
  //   userId,
  // });

  return c.json({
    success: true,
    data: { insightId, dismissed: true },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getCorrelatedMarkets
  // const correlations = await convex.query(api.signals.getCorrelatedMarkets, {
  //   marketTicker: ticker,
  //   minCorrelation,
  //   limit,
  // });

  return c.json({
    success: true,
    data: {
      market: ticker,
      correlations: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get strongest correlations overall
 */
app.get("/correlations", async (c) => {
  const positive = c.req.query("positive");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Fetch from Convex using signals:getStrongestCorrelations
  // const correlations = await convex.query(api.signals.getStrongestCorrelations, {
  //   limit,
  //   positive: positive === "true" ? true : positive === "false" ? false : undefined,
  // });

  return c.json({
    success: true,
    data: {
      correlations: [],
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getUserPreferences
  // const preferences = await convex.query(api.signals.getUserPreferences, {
  //   userId,
  // });

  return c.json({
    success: true,
    data: {
      emailAnalysisEnabled: false,
      socialAnalysisEnabled: true,
      marketAlertsEnabled: true,
      dailyInsightsEnabled: true,
      pushNotificationsEnabled: true,
      minConfidenceThreshold: 50,
      preferredUrgencyLevel: "all",
      interests: [],
      excludedMarkets: [],
      timezone: "UTC",
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Call Convex mutation signals:updatePreferences
  // await convex.mutation(api.signals.updatePreferences, {
  //   userId,
  //   ...updates,
  // });

  return c.json({
    success: true,
    data: { updated: true },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Fetch from Convex using signals:getSignalStats
  // const stats = await convex.query(api.signals.getSignalStats, {
  //   userId,
  // });

  return c.json({
    success: true,
    data: {
      totalSignals: 0,
      unseenSignals: 0,
      highUrgencyUnseen: 0,
      actedOnCount: 0,
      activeInsights: 0,
      actionRate: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as signalsRoutes };
