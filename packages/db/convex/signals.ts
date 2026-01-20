import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * AI Signal Detection queries and mutations for PULL
 */

// ============================================================================
// SIGNAL QUERIES
// ============================================================================

/**
 * Get active signals
 */
export const getActiveSignals = query({
  args: {
    type: v.optional(v.string()),
    severity: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db.query("signals");

    if (args.type) {
      queryBuilder = queryBuilder.withIndex("by_type", (q) =>
        q.eq("type", args.type as "email").eq("status", "active")
      );
    } else {
      queryBuilder = queryBuilder.withIndex("by_status", (q) =>
        q.eq("status", "active")
      );
    }

    const signals = await queryBuilder.order("desc").take(args.limit ?? 50);

    // Filter by severity if specified
    if (args.severity) {
      return signals.filter((s) => s.severity === args.severity);
    }

    return signals;
  },
});

/**
 * Get signal by ID
 */
export const getSignal = query({
  args: { signalId: v.id("signals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.signalId);
  },
});

/**
 * Get signals by related market
 */
export const getSignalsByMarket = query({
  args: {
    market: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_status", (q) =>
        q.eq("status", (args.status as "active") ?? "active")
      )
      .order("desc")
      .take(args.limit ?? 100);

    return signals.filter((s) => s.relatedMarkets.includes(args.market));
  },
});

/**
 * Search signals
 */
export const searchSignals = query({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    severity: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("signals")
      .withSearchIndex("search_signals", (q) => {
        let search = q.search("title", args.query);
        if (args.type) {
          search = search.eq("type", args.type as "email");
        }
        if (args.status) {
          search = search.eq("status", args.status as "active");
        }
        if (args.severity) {
          search = search.eq("severity", args.severity as "high");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * Get recent signals for a specific source
 */
export const getSignalsBySource = query({
  args: {
    source: v.string(),
    hours: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - (args.hours ?? 24) * 60 * 60 * 1000;

    const signals = await ctx.db
      .query("signals")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .order("desc")
      .take(args.limit ?? 100);

    return signals.filter((s) => s.createdAt > cutoffTime);
  },
});

// ============================================================================
// SIGNAL MUTATIONS
// ============================================================================

/**
 * Create a new signal
 */
export const createSignal = mutation({
  args: {
    type: v.union(
      v.literal("email"),
      v.literal("news"),
      v.literal("market"),
      v.literal("social"),
      v.literal("on_chain"),
      v.literal("sentiment"),
      v.literal("unusual_activity"),
      v.literal("correlation")
    ),
    source: v.string(),
    sourceId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    confidence: v.number(),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    relatedMarkets: v.array(v.string()),
    relatedEvents: v.array(v.string()),
    sentiment: v.optional(
      v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral"))
    ),
    priceImpact: v.optional(v.number()),
    timeHorizon: v.optional(v.string()),
    actionSuggestion: v.optional(v.string()),
    aiAnalysis: v.optional(v.string()),
    aiConfidenceFactors: v.optional(v.array(v.string())),
    rawData: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const signalId = await ctx.db.insert("signals", {
      type: args.type,
      source: args.source,
      sourceId: args.sourceId,
      title: args.title,
      description: args.description,
      confidence: args.confidence,
      severity: args.severity,
      relatedMarkets: args.relatedMarkets,
      relatedEvents: args.relatedEvents,
      sentiment: args.sentiment,
      priceImpact: args.priceImpact,
      timeHorizon: args.timeHorizon,
      actionSuggestion: args.actionSuggestion,
      aiAnalysis: args.aiAnalysis,
      aiConfidenceFactors: args.aiConfidenceFactors,
      rawData: args.rawData,
      status: "active",
      expiresAt: args.expiresAt,
      detectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Log signal creation
    await ctx.db.insert("auditLog", {
      action: "signals.created",
      resourceType: "signals",
      resourceId: signalId,
      metadata: {
        type: args.type,
        source: args.source,
        severity: args.severity,
        markets: args.relatedMarkets,
      },
      timestamp: now,
    });

    return signalId;
  },
});

/**
 * Acknowledge a signal
 */
export const acknowledgeSignal = mutation({
  args: { signalId: v.id("signals") },
  handler: async (ctx, args) => {
    const signal = await ctx.db.get(args.signalId);
    if (!signal) {
      throw new Error("Signal not found");
    }

    await ctx.db.patch(args.signalId, {
      status: "acknowledged",
      updatedAt: Date.now(),
    });

    return args.signalId;
  },
});

/**
 * Invalidate a signal
 */
export const invalidateSignal = mutation({
  args: {
    signalId: v.id("signals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const signal = await ctx.db.get(args.signalId);
    if (!signal) {
      throw new Error("Signal not found");
    }

    const now = Date.now();

    await ctx.db.patch(args.signalId, {
      status: "invalidated",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "signals.invalidated",
      resourceType: "signals",
      resourceId: args.signalId,
      metadata: { reason: args.reason },
      timestamp: now,
    });

    return args.signalId;
  },
});

/**
 * Expire old signals
 */
export const expireOldSignals = mutation({
  args: { olderThanHours: v.number() },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.olderThanHours * 60 * 60 * 1000;

    const oldSignals = await ctx.db
      .query("signals")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();

    let expiredCount = 0;

    for (const signal of oldSignals) {
      await ctx.db.patch(signal._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
      expiredCount++;
    }

    return expiredCount;
  },
});

// ============================================================================
// USER INSIGHT QUERIES
// ============================================================================

/**
 * Get user insights
 */
export const getUserInsights = query({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    dismissed: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db.query("userInsights");

    if (args.type) {
      queryBuilder = queryBuilder.withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("insightType", args.type as "daily_digest")
      );
    } else if (args.dismissed !== undefined) {
      queryBuilder = queryBuilder.withIndex("by_user_dismissed", (q) =>
        q.eq("userId", args.userId).eq("dismissed", args.dismissed!)
      );
    } else {
      queryBuilder = queryBuilder.withIndex("by_user", (q) =>
        q.eq("userId", args.userId)
      );
    }

    return await queryBuilder.order("desc").take(args.limit ?? 20);
  },
});

/**
 * Get insight by ID
 */
export const getInsight = query({
  args: { insightId: v.id("userInsights") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.insightId);
  },
});

/**
 * Get undismissed insights count
 */
export const getUndismissedInsightsCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const insights = await ctx.db
      .query("userInsights")
      .withIndex("by_user_dismissed", (q) =>
        q.eq("userId", args.userId).eq("dismissed", false)
      )
      .collect();

    return insights.length;
  },
});

// ============================================================================
// USER INSIGHT MUTATIONS
// ============================================================================

/**
 * Create a user insight
 */
export const createUserInsight = mutation({
  args: {
    userId: v.id("users"),
    insightType: v.union(
      v.literal("portfolio_analysis"),
      v.literal("market_opportunity"),
      v.literal("risk_alert"),
      v.literal("trading_pattern"),
      v.literal("performance_summary"),
      v.literal("recommendation"),
      v.literal("correlation_alert"),
      v.literal("daily_digest"),
      v.literal("weekly_summary")
    ),
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
    relatedSignals: v.array(v.id("signals")),
    relatedMarkets: v.array(v.string()),
    relatedPositions: v.array(v.id("positions")),
    confidence: v.number(),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const insightId = await ctx.db.insert("userInsights", {
      userId: args.userId,
      insightType: args.insightType,
      title: args.title,
      content: args.content,
      summary: args.summary,
      relatedSignals: args.relatedSignals,
      relatedMarkets: args.relatedMarkets,
      relatedPositions: args.relatedPositions,
      confidence: args.confidence,
      priority: args.priority,
      dismissed: false,
      validFrom: now,
      validUntil: args.validUntil,
      isExpired: false,
      createdAt: now,
      updatedAt: now,
    });

    return insightId;
  },
});

/**
 * Mark insight as viewed
 */
export const markInsightViewed = mutation({
  args: { insightId: v.id("userInsights") },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight) {
      throw new Error("Insight not found");
    }

    await ctx.db.patch(args.insightId, {
      viewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return args.insightId;
  },
});

/**
 * Dismiss insight
 */
export const dismissInsight = mutation({
  args: { insightId: v.id("userInsights") },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight) {
      throw new Error("Insight not found");
    }

    const now = Date.now();

    await ctx.db.patch(args.insightId, {
      dismissed: true,
      dismissedAt: now,
      updatedAt: now,
    });

    return args.insightId;
  },
});

/**
 * Record insight feedback
 */
export const recordInsightFeedback = mutation({
  args: {
    insightId: v.id("userInsights"),
    feedback: v.union(v.literal("helpful"), v.literal("not_helpful"), v.literal("neutral")),
    actionTaken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight) {
      throw new Error("Insight not found");
    }

    const now = Date.now();

    await ctx.db.patch(args.insightId, {
      feedback: args.feedback,
      actionTaken: args.actionTaken,
      actionTakenAt: args.actionTaken ? now : undefined,
      updatedAt: now,
    });

    // Log feedback for ML training
    await ctx.db.insert("auditLog", {
      userId: insight.userId,
      action: "insights.feedback",
      resourceType: "userInsights",
      resourceId: args.insightId,
      metadata: {
        insightType: insight.insightType,
        feedback: args.feedback,
        actionTaken: args.actionTaken,
      },
      timestamp: now,
    });

    return args.insightId;
  },
});

// ============================================================================
// MARKET CORRELATION QUERIES
// ============================================================================

/**
 * Get market correlations
 */
export const getCorrelations = query({
  args: {
    market: v.optional(v.string()),
    correlationType: v.optional(v.string()),
    strength: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db.query("marketCorrelations");

    if (args.market) {
      // Get correlations involving this market (as either A or B)
      const correlationsA = await ctx.db
        .query("marketCorrelations")
        .withIndex("by_market_a", (q) => q.eq("marketA", args.market!))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      const correlationsB = await ctx.db
        .query("marketCorrelations")
        .withIndex("by_market_b", (q) => q.eq("marketB", args.market!))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      const allCorrelations = [...correlationsA, ...correlationsB];

      // Sort by absolute correlation value (descending)
      allCorrelations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

      return allCorrelations.slice(0, args.limit ?? 50);
    }

    if (args.strength) {
      queryBuilder = queryBuilder.withIndex("by_strength", (q) =>
        q.eq("strength", args.strength as "strong").eq("isActive", true)
      );
    } else if (args.correlationType) {
      queryBuilder = queryBuilder.withIndex("by_correlation_type", (q) =>
        q.eq("correlationType", args.correlationType as "price").eq("isActive", true)
      );
    }

    return await queryBuilder.order("desc").take(args.limit ?? 50);
  },
});

/**
 * Get correlation between two specific markets
 */
export const getCorrelationPair = query({
  args: {
    marketA: v.string(),
    marketB: v.string(),
    correlationType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check both directions
    const correlation = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_markets", (q) =>
        q.eq("marketA", args.marketA).eq("marketB", args.marketB)
      )
      .filter((q) =>
        args.correlationType
          ? q.eq(q.field("correlationType"), args.correlationType)
          : true
      )
      .unique();

    if (correlation) {
      return correlation;
    }

    // Check reverse direction
    return await ctx.db
      .query("marketCorrelations")
      .withIndex("by_markets", (q) =>
        q.eq("marketA", args.marketB).eq("marketB", args.marketA)
      )
      .filter((q) =>
        args.correlationType
          ? q.eq(q.field("correlationType"), args.correlationType)
          : true
      )
      .unique();
  },
});

// ============================================================================
// MARKET CORRELATION MUTATIONS
// ============================================================================

/**
 * Upsert market correlation
 */
export const upsertCorrelation = mutation({
  args: {
    marketA: v.string(),
    marketB: v.string(),
    marketAType: v.union(
      v.literal("prediction"),
      v.literal("crypto"),
      v.literal("stock"),
      v.literal("rwa")
    ),
    marketBType: v.union(
      v.literal("prediction"),
      v.literal("crypto"),
      v.literal("stock"),
      v.literal("rwa")
    ),
    correlation: v.number(),
    correlationType: v.union(
      v.literal("price"),
      v.literal("volume"),
      v.literal("sentiment"),
      v.literal("news")
    ),
    strength: v.union(
      v.literal("weak"),
      v.literal("moderate"),
      v.literal("strong"),
      v.literal("very_strong")
    ),
    sampleSize: v.number(),
    timeWindow: v.string(),
    pValue: v.optional(v.number()),
    rSquared: v.optional(v.number()),
    standardError: v.optional(v.number()),
    aiExplanation: v.optional(v.string()),
    causalFactors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if correlation exists
    const existing = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_markets", (q) =>
        q.eq("marketA", args.marketA).eq("marketB", args.marketB)
      )
      .filter((q) => q.eq(q.field("correlationType"), args.correlationType))
      .unique();

    if (existing) {
      // Update existing correlation
      await ctx.db.patch(existing._id, {
        correlation: args.correlation,
        strength: args.strength,
        sampleSize: args.sampleSize,
        timeWindow: args.timeWindow,
        pValue: args.pValue,
        rSquared: args.rSquared,
        standardError: args.standardError,
        previousCorrelation: existing.correlation,
        correlationChange: args.correlation - existing.correlation,
        trend:
          args.correlation > existing.correlation
            ? "increasing"
            : args.correlation < existing.correlation
              ? "decreasing"
              : "stable",
        aiExplanation: args.aiExplanation ?? existing.aiExplanation,
        causalFactors: args.causalFactors ?? existing.causalFactors,
        lastCalculatedAt: now,
        updatedAt: now,
      });

      return existing._id;
    }

    // Create new correlation
    const correlationId = await ctx.db.insert("marketCorrelations", {
      marketA: args.marketA,
      marketB: args.marketB,
      marketAType: args.marketAType,
      marketBType: args.marketBType,
      correlation: args.correlation,
      correlationType: args.correlationType,
      strength: args.strength,
      sampleSize: args.sampleSize,
      timeWindow: args.timeWindow,
      pValue: args.pValue,
      rSquared: args.rSquared,
      standardError: args.standardError,
      aiExplanation: args.aiExplanation,
      causalFactors: args.causalFactors,
      isActive: true,
      lastCalculatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return correlationId;
  },
});

/**
 * Deactivate stale correlations
 */
export const deactivateStaleCorrelations = mutation({
  args: { staleHours: v.number() },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.staleHours * 60 * 60 * 1000;

    const staleCorrelations = await ctx.db
      .query("marketCorrelations")
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.lt(q.field("lastCalculatedAt"), cutoffTime)
        )
      )
      .collect();

    let deactivatedCount = 0;

    for (const correlation of staleCorrelations) {
      await ctx.db.patch(correlation._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
      deactivatedCount++;
    }

    return deactivatedCount;
  },
});
