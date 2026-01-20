import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Prediction market queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all active prediction events
 */
export const getEvents = query({
  args: {
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("predictionEvents");

    if (args.status && args.category) {
      query = query.withIndex("by_category", (q) =>
        q.eq("category", args.category!).eq("status", args.status as "open")
      );
    } else if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status as "open")
      );
    }

    return await query.order("desc").take(args.limit ?? 50);
  },
});

/**
 * Get event by ticker
 */
export const getEventByTicker = query({
  args: { ticker: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("predictionEvents")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (!event) return null;

    // Get markets/outcomes for this event
    const markets = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    return {
      ...event,
      markets,
    };
  },
});

/**
 * Get event by external ID
 */
export const getEventByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("predictionEvents")
      .withIndex("by_external", (q) => q.eq("externalId", args.externalId))
      .unique();
  },
});

/**
 * Search events
 */
export const searchEvents = query({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("predictionEvents")
      .withSearchIndex("search_events", (q) => {
        let search = q.search("title", args.query);
        if (args.status) {
          search = search.eq("status", args.status as "open");
        }
        if (args.category) {
          search = search.eq("category", args.category);
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * Get markets for an event
 */
export const getMarkets = query({
  args: { eventId: v.id("predictionEvents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("predictionMarkets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

/**
 * Get market by ticker
 */
export const getMarketByTicker = query({
  args: { ticker: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();
  },
});

/**
 * Get categories with event counts
 */
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("predictionEvents").collect();
    const categoryCounts: Record<string, number> = {};

    for (const event of events) {
      categoryCounts[event.category] = (categoryCounts[event.category] ?? 0) + 1;
    }

    return Object.entries(categoryCounts).map(([id, count]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      count,
    }));
  },
});

/**
 * Get user's prediction positions
 */
export const getUserPositions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("assetClass"), "prediction"))
      .collect();

    // Enrich with event data
    const enrichedPositions = await Promise.all(
      positions.map(async (position) => {
        const market = await ctx.db
          .query("predictionMarkets")
          .withIndex("by_ticker", (q) => q.eq("ticker", position.symbol))
          .unique();

        let event = null;
        if (market) {
          event = await ctx.db.get(market.eventId);
        }

        return {
          ...position,
          market,
          event,
        };
      })
    );

    return enrichedPositions;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Sync/upsert prediction events from external source
 */
export const syncEvents = mutation({
  args: {
    events: v.array(
      v.object({
        externalId: v.string(),
        ticker: v.string(),
        title: v.string(),
        description: v.string(),
        category: v.string(),
        subcategory: v.optional(v.string()),
        status: v.string(),
        openTime: v.number(),
        closeTime: v.number(),
        expirationTime: v.number(),
        volume: v.number(),
        openInterest: v.number(),
        tags: v.array(v.string()),
        imageUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const eventData of args.events) {
      const existing = await ctx.db
        .query("predictionEvents")
        .withIndex("by_external", (q) => q.eq("externalId", eventData.externalId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: eventData.title,
          description: eventData.description,
          status: eventData.status as "open",
          volume: eventData.volume,
          openInterest: eventData.openInterest,
          syncedAt: now,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("predictionEvents", {
          externalId: eventData.externalId,
          ticker: eventData.ticker,
          title: eventData.title,
          description: eventData.description,
          category: eventData.category,
          subcategory: eventData.subcategory,
          status: eventData.status as "open",
          openTime: eventData.openTime,
          closeTime: eventData.closeTime,
          expirationTime: eventData.expirationTime,
          volume: eventData.volume,
          openInterest: eventData.openInterest,
          tags: eventData.tags,
          imageUrl: eventData.imageUrl,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return { created, updated };
  },
});

/**
 * Sync/upsert prediction markets
 */
export const syncMarkets = mutation({
  args: {
    eventId: v.id("predictionEvents"),
    markets: v.array(
      v.object({
        externalId: v.string(),
        ticker: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        probability: v.number(),
        yesPrice: v.number(),
        noPrice: v.number(),
        yesVolume: v.number(),
        noVolume: v.number(),
        openInterest: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const marketData of args.markets) {
      const existing = await ctx.db
        .query("predictionMarkets")
        .withIndex("by_ticker", (q) => q.eq("ticker", marketData.ticker))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          probability: marketData.probability,
          yesPrice: marketData.yesPrice,
          noPrice: marketData.noPrice,
          yesVolume: marketData.yesVolume,
          noVolume: marketData.noVolume,
          openInterest: marketData.openInterest,
          syncedAt: now,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("predictionMarkets", {
          eventId: args.eventId,
          externalId: marketData.externalId,
          ticker: marketData.ticker,
          name: marketData.name,
          description: marketData.description,
          probability: marketData.probability,
          yesPrice: marketData.yesPrice,
          noPrice: marketData.noPrice,
          yesVolume: marketData.yesVolume,
          noVolume: marketData.noVolume,
          openInterest: marketData.openInterest,
          syncedAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return { created, updated };
  },
});

/**
 * Cache orderbook for a market
 */
export const cacheOrderbook = mutation({
  args: {
    ticker: v.string(),
    yesPrice: v.number(),
    noPrice: v.number(),
    openInterest: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (!market) {
      throw new Error("Market not found");
    }

    await ctx.db.patch(market._id, {
      yesPrice: args.yesPrice,
      noPrice: args.noPrice,
      openInterest: args.openInterest,
      probability: args.yesPrice,
      syncedAt: now,
      updatedAt: now,
    });

    return market._id;
  },
});

/**
 * Settle an event
 */
export const settleEvent = mutation({
  args: {
    eventId: v.id("predictionEvents"),
    winningOutcomeId: v.string(),
    settlementValue: v.number(),
    resolutionDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    // Update event status
    await ctx.db.patch(args.eventId, {
      status: "settled",
      winningOutcomeId: args.winningOutcomeId,
      settlementValue: args.settlementValue,
      resolutionDetails: args.resolutionDetails,
      settledAt: now,
      updatedAt: now,
    });

    // Update markets
    const markets = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    for (const market of markets) {
      const isWinner = market.externalId === args.winningOutcomeId;
      await ctx.db.patch(market._id, {
        isWinner,
        settlementPrice: isWinner ? 1 : 0,
        updatedAt: now,
      });
    }

    // TODO: Process position settlements

    await ctx.db.insert("auditLog", {
      action: "prediction.event_settled",
      resourceType: "predictionEvents",
      resourceId: args.eventId,
      metadata: {
        ticker: event.ticker,
        winningOutcomeId: args.winningOutcomeId,
        settlementValue: args.settlementValue,
      },
      timestamp: now,
    });

    return args.eventId;
  },
});
