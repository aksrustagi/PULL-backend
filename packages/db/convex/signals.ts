import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * AI Signal Detection - Convex queries and mutations
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_QUERY_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;

// ============================================================================
// SIGNAL QUERIES
// ============================================================================

/**
 * Get signals for a user with filtering
 */
export const getSignals = query({
  args: {
    userId: v.id("users"),
    types: v.optional(v.array(v.string())),
    minConfidence: v.optional(v.number()),
    urgency: v.optional(v.string()),
    unseenOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? DEFAULT_QUERY_LIMIT;

    // Get user signals
    let userSignalsQuery;
    if (args.unseenOnly) {
      userSignalsQuery = ctx.db
        .query("userSignals")
        .withIndex("by_user_unseen", (q) =>
          q.eq("userId", args.userId).eq("seen", false)
        );
    } else {
      userSignalsQuery = ctx.db
        .query("userSignals")
        .withIndex("by_user", (q) => q.eq("userId", args.userId));
    }

    const userSignals = await userSignalsQuery
      .order("desc")
      .take(limit * 2); // Fetch more to allow for filtering

    // Get full signal details
    const signals = await Promise.all(
      userSignals.map(async (us) => {
        const signal = await ctx.db.get(us.signalId);
        if (!signal) return null;

        // Apply filters
        if (args.types && args.types.length > 0) {
          if (!args.types.includes(signal.type)) return null;
        }
        if (args.minConfidence && signal.confidence < args.minConfidence) {
          return null;
        }
        if (args.urgency && signal.urgency !== args.urgency) {
          return null;
        }

        return {
          ...signal,
          userSignal: {
            relevanceScore: us.relevanceScore,
            seen: us.seen,
            dismissed: us.dismissed,
            actedOn: us.actedOn,
          },
        };
      })
    );

    return signals.filter(Boolean).slice(0, limit);
  },
});

/**
 * Get signal by ID with full details
 */
export const getSignalById = query({
  args: {
    id: v.id("signals"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const signal = await ctx.db.get(args.id);
    if (!signal) return null;

    let userSignal = null;
    if (args.userId) {
      userSignal = await ctx.db
        .query("userSignals")
        .withIndex("by_signal", (q) => q.eq("signalId", args.id))
        .filter((q) => q.eq(q.field("userId"), args.userId))
        .unique();
    }

    // Get related market data
    const relatedMarkets = await Promise.all(
      signal.relatedMarkets.map(async (ticker) => {
        const market = await ctx.db
          .query("predictionMarkets")
          .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
          .unique();
        return market;
      })
    );

    return {
      ...signal,
      userSignal: userSignal
        ? {
            relevanceScore: userSignal.relevanceScore,
            seen: userSignal.seen,
            dismissed: userSignal.dismissed,
            actedOn: userSignal.actedOn,
          }
        : null,
      markets: relatedMarkets.filter(Boolean),
    };
  },
});

/**
 * Search signals
 */
export const searchSignals = query({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    urgency: v.optional(v.string()),
    sentiment: v.optional(v.string()),
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
        if (args.urgency) {
          search = search.eq("urgency", args.urgency as "high");
        }
        if (args.sentiment) {
          search = search.eq("sentiment", args.sentiment as "bullish");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? DEFAULT_SEARCH_LIMIT);
  },
});

/**
 * Get signals by type
 */
export const getSignalsByType = query({
  args: {
    type: v.union(
      v.literal("email"),
      v.literal("social"),
      v.literal("market"),
      v.literal("news"),
      v.literal("correlation")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signals")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .order("desc")
      .take(args.limit ?? DEFAULT_QUERY_LIMIT);
  },
});

/**
 * Get high urgency signals
 */
export const getHighUrgencySignals = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_urgency", (q) => q.eq("urgency", "high"))
      .order("desc")
      .take(args.limit ?? DEFAULT_SEARCH_LIMIT);

    // Get user signal status for each
    const withStatus = await Promise.all(
      signals.map(async (signal) => {
        const userSignal = await ctx.db
          .query("userSignals")
          .withIndex("by_signal", (q) => q.eq("signalId", signal._id))
          .filter((q) => q.eq(q.field("userId"), args.userId))
          .unique();

        return {
          ...signal,
          seen: userSignal?.seen ?? false,
          dismissed: userSignal?.dismissed ?? false,
        };
      })
    );

    return withStatus.filter((s) => !s.dismissed);
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
    activeOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query;
    if (args.activeOnly) {
      query = ctx.db
        .query("userInsights")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", args.userId).eq("dismissed", false)
        );
    } else {
      query = ctx.db
        .query("userInsights")
        .withIndex("by_user", (q) => q.eq("userId", args.userId));
    }

    let insights = await query.order("desc").take(args.limit ?? DEFAULT_SEARCH_LIMIT);

    if (args.type) {
      insights = insights.filter((i) => i.insightType === args.type);
    }

    // Sort by priority within results
    return insights.sort((a, b) => b.priority - a.priority);
  },
});

/**
 * Get today's insights (morning briefing)
 */
export const getTodayInsights = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const insights = await ctx.db
      .query("userInsights")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);

    return insights.filter((i) => i.createdAt >= todayTimestamp);
  },
});

// ============================================================================
// CORRELATION QUERIES
// ============================================================================

/**
 * Get correlated markets for a given market
 */
export const getCorrelatedMarkets = query({
  args: {
    marketTicker: v.string(),
    minCorrelation: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minCorr = args.minCorrelation ?? 0.5;

    // Get correlations where this market is marketA
    const correlationsA = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_marketA", (q) => q.eq("marketA", args.marketTicker))
      .collect();

    // Get correlations where this market is marketB
    const correlationsB = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_marketB", (q) => q.eq("marketB", args.marketTicker))
      .collect();

    // Combine and normalize
    const allCorrelations = [
      ...correlationsA.map((c) => ({
        market: c.marketB,
        correlation: c.correlation,
        sampleSize: c.sampleSize,
        pValue: c.pValue,
        updatedAt: c.updatedAt,
      })),
      ...correlationsB.map((c) => ({
        market: c.marketA,
        correlation: c.correlation,
        sampleSize: c.sampleSize,
        pValue: c.pValue,
        updatedAt: c.updatedAt,
      })),
    ];

    // Filter by minimum correlation and sort by absolute correlation
    return allCorrelations
      .filter((c) => Math.abs(c.correlation) >= minCorr)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, args.limit ?? DEFAULT_SEARCH_LIMIT);
  },
});

/**
 * Get strongest correlations overall
 */
export const getStrongestCorrelations = query({
  args: {
    limit: v.optional(v.number()),
    positive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const correlations = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_correlation")
      .order("desc")
      .take(200);

    let filtered = correlations;
    if (args.positive !== undefined) {
      filtered = correlations.filter((c) =>
        args.positive ? c.correlation > 0 : c.correlation < 0
      );
    }

    return filtered
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, args.limit ?? DEFAULT_SEARCH_LIMIT);
  },
});

// ============================================================================
// PREFERENCE QUERIES
// ============================================================================

/**
 * Get user signal preferences
 */
export const getUserPreferences = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userSignalPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // Return defaults if no preferences set
    if (!prefs) {
      return {
        emailAnalysisEnabled: false, // Opt-in by default
        socialAnalysisEnabled: true,
        marketAlertsEnabled: true,
        dailyInsightsEnabled: true,
        pushNotificationsEnabled: true,
        minConfidenceThreshold: 50,
        preferredUrgencyLevel: "all" as const,
        interests: [],
        excludedMarkets: [],
        timezone: "UTC",
      };
    }

    return prefs;
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
    signalId: v.string(),
    type: v.union(
      v.literal("email"),
      v.literal("social"),
      v.literal("market"),
      v.literal("news"),
      v.literal("correlation")
    ),
    source: v.string(),
    title: v.string(),
    description: v.string(),
    confidence: v.number(),
    sentiment: v.union(
      v.literal("bullish"),
      v.literal("bearish"),
      v.literal("neutral")
    ),
    urgency: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    relatedMarkets: v.array(v.string()),
    relatedAssets: v.array(v.string()),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for duplicate signal
    const existing = await ctx.db
      .query("signals")
      .withIndex("by_signalId", (q) => q.eq("signalId", args.signalId))
      .unique();

    if (existing) {
      return existing._id;
    }

    const signalId = await ctx.db.insert("signals", {
      ...args,
      createdAt: now,
    });

    return signalId;
  },
});

/**
 * Create user signal (link signal to user)
 */
export const createUserSignal = mutation({
  args: {
    userId: v.id("users"),
    signalId: v.id("signals"),
    relevanceScore: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if already exists
    const existing = await ctx.db
      .query("userSignals")
      .withIndex("by_signal", (q) => q.eq("signalId", args.signalId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("userSignals", {
      userId: args.userId,
      signalId: args.signalId,
      relevanceScore: args.relevanceScore,
      seen: false,
      dismissed: false,
      actedOn: false,
      createdAt: now,
    });
  },
});

/**
 * Mark signal as seen
 */
export const markSignalSeen = mutation({
  args: {
    signalId: v.id("signals"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userSignal = await ctx.db
      .query("userSignals")
      .withIndex("by_signal", (q) => q.eq("signalId", args.signalId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();

    if (userSignal) {
      await ctx.db.patch(userSignal._id, { seen: true });
      return userSignal._id;
    }

    return null;
  },
});

/**
 * Dismiss signal
 */
export const dismissSignal = mutation({
  args: {
    signalId: v.id("signals"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userSignal = await ctx.db
      .query("userSignals")
      .withIndex("by_signal", (q) => q.eq("signalId", args.signalId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();

    if (userSignal) {
      await ctx.db.patch(userSignal._id, { dismissed: true, seen: true });
      return userSignal._id;
    }

    return null;
  },
});

/**
 * Mark signal as acted upon
 */
export const markSignalActed = mutation({
  args: {
    signalId: v.id("signals"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userSignal = await ctx.db
      .query("userSignals")
      .withIndex("by_signal", (q) => q.eq("signalId", args.signalId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();

    if (userSignal) {
      await ctx.db.patch(userSignal._id, { actedOn: true, seen: true });
      return userSignal._id;
    }

    return null;
  },
});

// ============================================================================
// INSIGHT MUTATIONS
// ============================================================================

/**
 * Create user insight
 */
export const createUserInsight = mutation({
  args: {
    userId: v.id("users"),
    insightType: v.string(),
    title: v.string(),
    content: v.string(),
    priority: v.number(),
    relatedSignals: v.array(v.id("signals")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("userInsights", {
      ...args,
      dismissed: false,
      createdAt: now,
    });
  },
});

/**
 * Dismiss insight
 */
export const dismissInsight = mutation({
  args: {
    insightId: v.id("userInsights"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight || insight.userId !== args.userId) {
      throw new Error("Insight not found");
    }

    await ctx.db.patch(args.insightId, { dismissed: true });
    return args.insightId;
  },
});

// ============================================================================
// CORRELATION MUTATIONS
// ============================================================================

/**
 * Upsert market correlation
 */
export const upsertCorrelation = mutation({
  args: {
    marketA: v.string(),
    marketB: v.string(),
    correlation: v.number(),
    sampleSize: v.number(),
    pValue: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Always store with alphabetically first market as marketA
    const [mktA, mktB] =
      args.marketA < args.marketB
        ? [args.marketA, args.marketB]
        : [args.marketB, args.marketA];

    const existing = await ctx.db
      .query("marketCorrelations")
      .withIndex("by_pair", (q) => q.eq("marketA", mktA).eq("marketB", mktB))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        correlation: args.correlation,
        sampleSize: args.sampleSize,
        pValue: args.pValue,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("marketCorrelations", {
      marketA: mktA,
      marketB: mktB,
      correlation: args.correlation,
      sampleSize: args.sampleSize,
      pValue: args.pValue,
      updatedAt: now,
    });
  },
});

// ============================================================================
// PREFERENCE MUTATIONS
// ============================================================================

/**
 * Update user signal preferences
 */
export const updatePreferences = mutation({
  args: {
    userId: v.id("users"),
    emailAnalysisEnabled: v.optional(v.boolean()),
    socialAnalysisEnabled: v.optional(v.boolean()),
    marketAlertsEnabled: v.optional(v.boolean()),
    dailyInsightsEnabled: v.optional(v.boolean()),
    pushNotificationsEnabled: v.optional(v.boolean()),
    minConfidenceThreshold: v.optional(v.number()),
    preferredUrgencyLevel: v.optional(
      v.union(v.literal("all"), v.literal("medium_high"), v.literal("high_only"))
    ),
    interests: v.optional(v.array(v.string())),
    excludedMarkets: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { userId, ...updates } = args;

    const existing = await ctx.db
      .query("userSignalPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...updates,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create with defaults
    return await ctx.db.insert("userSignalPreferences", {
      userId,
      emailAnalysisEnabled: updates.emailAnalysisEnabled ?? false,
      socialAnalysisEnabled: updates.socialAnalysisEnabled ?? true,
      marketAlertsEnabled: updates.marketAlertsEnabled ?? true,
      dailyInsightsEnabled: updates.dailyInsightsEnabled ?? true,
      pushNotificationsEnabled: updates.pushNotificationsEnabled ?? true,
      minConfidenceThreshold: updates.minConfidenceThreshold ?? 50,
      preferredUrgencyLevel: updates.preferredUrgencyLevel ?? "all",
      interests: updates.interests ?? [],
      excludedMarkets: updates.excludedMarkets ?? [],
      timezone: updates.timezone ?? "UTC",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// PROCESSING LOG MUTATIONS
// ============================================================================

/**
 * Log processed signal source
 */
export const logProcessedSource = mutation({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
    userId: v.optional(v.id("users")),
    signalsGenerated: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("signalProcessingLog", {
      ...args,
      processedAt: now,
    });
  },
});

/**
 * Check if source was already processed
 */
export const wasSourceProcessed = query({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("signalProcessingLog")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .unique();

    return existing !== null;
  },
});

// ============================================================================
// STATS QUERIES
// ============================================================================

/**
 * Get signal stats for user
 */
export const getSignalStats = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userSignals = await ctx.db
      .query("userSignals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const unseenCount = userSignals.filter((s) => !s.seen && !s.dismissed).length;
    const actedOnCount = userSignals.filter((s) => s.actedOn).length;

    // Get high urgency unseen
    const highUrgencyUnseen = await Promise.all(
      userSignals
        .filter((s) => !s.seen && !s.dismissed)
        .map(async (us) => {
          const signal = await ctx.db.get(us.signalId);
          return signal?.urgency === "high" ? 1 : 0;
        })
    );

    const activeInsights = await ctx.db
      .query("userInsights")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("dismissed", false)
      )
      .collect();

    return {
      totalSignals: userSignals.length,
      unseenSignals: unseenCount,
      highUrgencyUnseen: highUrgencyUnseen.reduce((a, b) => a + b, 0),
      actedOnCount,
      activeInsights: activeInsights.length,
      actionRate:
        userSignals.length > 0
          ? Math.round((actedOnCount / userSignals.length) * 100)
          : 0,
    };
  },
});
