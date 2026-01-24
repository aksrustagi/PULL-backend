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

    // Process position settlements for all positions related to this event's markets
    const marketTickers = markets.map((m) => m.ticker);
    let settledPositions = 0;
    let totalPayout = 0;

    for (const market of markets) {
      // Find all positions for this market
      const positions = await ctx.db
        .query("positions")
        .filter((q) =>
          q.and(
            q.eq(q.field("assetClass"), "prediction"),
            q.eq(q.field("symbol"), market.ticker)
          )
        )
        .collect();

      for (const position of positions) {
        // Calculate payout based on whether position wins
        // Long position wins if market is the winner
        // Short position wins if market is NOT the winner
        const positionWins =
          (position.side === "long" && market.isWinner) ||
          (position.side === "short" && !market.isWinner);

        const payout = positionWins ? position.quantity * 100 : 0;
        const costBasis = position.costBasis;
        const realizedPnL = payout - costBasis;

        // Credit user's USD balance with payout
        if (payout > 0) {
          const existingBalance = await ctx.db
            .query("balances")
            .withIndex("by_user_asset", (q) =>
              q.eq("userId", position.userId).eq("assetType", "usd").eq("assetId", "USD")
            )
            .unique();

          if (existingBalance) {
            await ctx.db.patch(existingBalance._id, {
              available: existingBalance.available + payout,
              updatedAt: now,
            });
          } else {
            await ctx.db.insert("balances", {
              userId: position.userId,
              assetType: "usd",
              assetId: "USD",
              symbol: "USD",
              available: payout,
              held: 0,
              pending: 0,
              updatedAt: now,
            });
          }
        }

        // Update position with settlement info (set quantity to 0 to mark as settled)
        await ctx.db.patch(position._id, {
          quantity: 0,
          currentPrice: market.isWinner ? 100 : 0,
          realizedPnL: position.realizedPnL + realizedPnL,
          unrealizedPnL: 0,
          updatedAt: now,
        });

        // Record the settlement in trades table
        // First create a synthetic order for the settlement
        const orderId = await ctx.db.insert("orders", {
          userId: position.userId,
          clientOrderId: `settlement-${position._id}-${now}`,
          assetClass: "prediction",
          symbol: position.symbol,
          side: "sell",
          type: "market",
          status: "filled",
          quantity: position.quantity,
          filledQuantity: position.quantity,
          remainingQuantity: 0,
          price: market.isWinner ? 100 : 0,
          averageFilledPrice: market.isWinner ? 100 : 0,
          timeInForce: "gtc",
          fees: 0,
          feeCurrency: "USD",
          metadata: {
            settlementType: "event_resolution",
            eventId: args.eventId,
            winningOutcomeId: args.winningOutcomeId,
            positionWon: positionWins,
          },
          filledAt: now,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.db.insert("trades", {
          orderId,
          userId: position.userId,
          externalTradeId: `settlement-${position._id}`,
          symbol: position.symbol,
          side: "sell",
          quantity: position.quantity,
          price: market.isWinner ? 100 : 0,
          notionalValue: payout,
          fee: 0,
          feeCurrency: "USD",
          liquidity: "taker",
          executedAt: now,
          settledAt: now,
          settlementStatus: "settled",
        });

        // Log individual position settlement
        await ctx.db.insert("auditLog", {
          userId: position.userId,
          action: "prediction.position_settled",
          resourceType: "positions",
          resourceId: position._id,
          metadata: {
            symbol: position.symbol,
            side: position.side,
            quantity: position.quantity,
            payout,
            realizedPnL,
            eventId: args.eventId,
            winningOutcomeId: args.winningOutcomeId,
          },
          timestamp: now,
        });

        settledPositions++;
        totalPayout += payout;
      }
    }

    await ctx.db.insert("auditLog", {
      action: "prediction.event_settled",
      resourceType: "predictionEvents",
      resourceId: args.eventId,
      metadata: {
        ticker: event.ticker,
        winningOutcomeId: args.winningOutcomeId,
        settlementValue: args.settlementValue,
        settledPositions,
        totalPayout,
      },
      timestamp: now,
    });

    return args.eventId;
  },
});

/**
 * Settle a single position
 */
export const settlePosition = mutation({
  args: {
    positionId: v.id("positions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get the position
    const position = await ctx.db.get(args.positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    if (position.assetClass !== "prediction") {
      throw new Error("Only prediction positions can be settled");
    }

    if (position.quantity === 0) {
      throw new Error("Position already settled");
    }

    // Get the market for this position
    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", position.symbol))
      .unique();

    if (!market) {
      throw new Error("Market not found");
    }

    // Get the event to check if it's settled
    const event = await ctx.db.get(market.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.status !== "settled") {
      throw new Error("Event has not been settled yet");
    }

    // Calculate payout based on whether position wins
    // Long position wins if market is the winner
    // Short position wins if market is NOT the winner
    const positionWins =
      (position.side === "long" && market.isWinner) ||
      (position.side === "short" && !market.isWinner);

    const payout = positionWins ? position.quantity * 100 : 0;
    const costBasis = position.costBasis;
    const realizedPnL = payout - costBasis;

    // Credit user's USD balance with payout
    if (payout > 0) {
      const existingBalance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", position.userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (existingBalance) {
        await ctx.db.patch(existingBalance._id, {
          available: existingBalance.available + payout,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("balances", {
          userId: position.userId,
          assetType: "usd",
          assetId: "USD",
          symbol: "USD",
          available: payout,
          held: 0,
          pending: 0,
          updatedAt: now,
        });
      }
    }

    // Update position with settlement info (set quantity to 0 to mark as settled)
    await ctx.db.patch(args.positionId, {
      quantity: 0,
      currentPrice: market.isWinner ? 100 : 0,
      realizedPnL: position.realizedPnL + realizedPnL,
      unrealizedPnL: 0,
      updatedAt: now,
    });

    // Record the settlement in trades table
    const orderId = await ctx.db.insert("orders", {
      userId: position.userId,
      clientOrderId: `settlement-${args.positionId}-${now}`,
      assetClass: "prediction",
      symbol: position.symbol,
      side: "sell",
      type: "market",
      status: "filled",
      quantity: position.quantity,
      filledQuantity: position.quantity,
      remainingQuantity: 0,
      price: market.isWinner ? 100 : 0,
      averageFilledPrice: market.isWinner ? 100 : 0,
      timeInForce: "gtc",
      fees: 0,
      feeCurrency: "USD",
      metadata: {
        settlementType: "event_resolution",
        eventId: market.eventId,
        winningOutcomeId: event.winningOutcomeId,
        positionWon: positionWins,
      },
      filledAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("trades", {
      orderId,
      userId: position.userId,
      externalTradeId: `settlement-${args.positionId}`,
      symbol: position.symbol,
      side: "sell",
      quantity: position.quantity,
      price: market.isWinner ? 100 : 0,
      notionalValue: payout,
      fee: 0,
      feeCurrency: "USD",
      liquidity: "taker",
      executedAt: now,
      settledAt: now,
      settlementStatus: "settled",
    });

    // Log to audit
    await ctx.db.insert("auditLog", {
      userId: position.userId,
      action: "prediction.position_settled",
      resourceType: "positions",
      resourceId: args.positionId,
      metadata: {
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
        payout,
        realizedPnL,
        eventId: market.eventId,
        winningOutcomeId: event.winningOutcomeId,
        positionWon: positionWins,
      },
      timestamp: now,
    });

    return {
      positionId: args.positionId,
      payout,
      realizedPnL,
      positionWon: positionWins,
    };
  },
});
