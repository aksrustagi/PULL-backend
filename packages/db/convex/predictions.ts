import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticatedQuery, authenticatedMutation, systemMutation } from "./lib/auth";
import { Id } from "./_generated/dataModel";

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
export const getUserPositions = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
export const syncEvents = systemMutation({
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
export const syncMarkets = systemMutation({
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
export const cacheOrderbook = systemMutation({
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
export const settleEvent = systemMutation({
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

/**
 * Create a prediction market order - authenticated user
 * This is the main entry point for users to place prediction market orders
 */
export const createPredictionOrder = authenticatedMutation({
  args: {
    marketTicker: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    outcome: v.union(v.literal("yes"), v.literal("no")),
    type: v.union(v.literal("market"), v.literal("limit")),
    quantity: v.number(),
    price: v.optional(v.number()),
    timeInForce: v.optional(
      v.union(v.literal("day"), v.literal("gtc"), v.literal("ioc"), v.literal("fok"))
    ),
    clientOrderId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate inputs
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    if (args.type === "limit" && !args.price) {
      throw new Error("Limit orders require a price");
    }

    if (args.price !== undefined && (args.price < 0.01 || args.price > 0.99)) {
      throw new Error("Price must be between $0.01 and $0.99 for prediction markets");
    }

    // Get market info
    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.marketTicker))
      .unique();

    if (!market) {
      throw new Error("Market not found");
    }

    // Get event info
    const event = await ctx.db.get(market.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    // Check event status
    if (event.status !== "open") {
      throw new Error(`Cannot place orders on event with status: ${event.status}`);
    }

    // Check event hasn't closed
    if (event.closeTime < now) {
      throw new Error("Event has closed for trading");
    }

    // Determine order price
    // For market orders, use current market price
    // For YES: use yesPrice for buy, noPrice for sell (selling YES at noPrice complement)
    // For NO: use noPrice for buy, yesPrice for sell
    let orderPrice: number;
    if (args.type === "market") {
      if (args.outcome === "yes") {
        orderPrice = args.side === "buy" ? market.yesPrice : market.noPrice;
      } else {
        orderPrice = args.side === "buy" ? market.noPrice : market.yesPrice;
      }
    } else {
      orderPrice = args.price!;
    }

    // Calculate cost
    // In prediction markets, contracts pay $1 if correct, $0 if wrong
    // Cost = quantity * price (e.g., 10 contracts at $0.65 = $6.50)
    const estimatedCost = args.quantity * orderPrice;

    // Check buying power for buy orders
    if (args.side === "buy") {
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (!balance || balance.available < estimatedCost) {
        throw new Error(
          `Insufficient funds. Required: $${estimatedCost.toFixed(2)}, Available: $${(balance?.available ?? 0).toFixed(2)}`
        );
      }

      // Place hold on funds
      await ctx.db.patch(balance._id, {
        available: balance.available - estimatedCost,
        held: balance.held + estimatedCost,
        updatedAt: now,
      });
    } else {
      // For sell orders, check position exists
      // Construct the position symbol based on market ticker and outcome
      const positionSymbol = `${args.marketTicker}-${args.outcome.toUpperCase()}`;

      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetClass", "prediction").eq("symbol", positionSymbol)
        )
        .unique();

      // Also check with just the market ticker
      const positionAlt = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetClass", "prediction").eq("symbol", args.marketTicker)
        )
        .unique();

      const effectivePosition = position || positionAlt;

      if (!effectivePosition || effectivePosition.quantity < args.quantity) {
        throw new Error(
          `Insufficient position to sell. Requested: ${args.quantity}, Available: ${effectivePosition?.quantity ?? 0}`
        );
      }

      // Check for existing open sell orders to prevent double-spend
      const openSellOrders = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const pendingSellQuantity = openSellOrders
        .filter(
          (o) =>
            (o.symbol === positionSymbol || o.symbol === args.marketTicker) &&
            o.assetClass === "prediction" &&
            o.side === "sell" &&
            ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
        )
        .reduce((sum, o) => sum + o.remainingQuantity, 0);

      if (effectivePosition.quantity - pendingSellQuantity < args.quantity) {
        throw new Error(
          `Insufficient available position. Total: ${effectivePosition.quantity}, Pending sells: ${pendingSellQuantity}`
        );
      }
    }

    // Create the order
    const symbol = `${args.marketTicker}-${args.outcome.toUpperCase()}`;
    const orderId = await ctx.db.insert("orders", {
      userId,
      clientOrderId: args.clientOrderId,
      assetClass: "prediction",
      symbol,
      side: args.side,
      type: args.type,
      status: "pending",
      quantity: args.quantity,
      filledQuantity: 0,
      remainingQuantity: args.quantity,
      price: orderPrice,
      timeInForce: args.timeInForce ?? "gtc",
      fees: 0,
      feeCurrency: "USD",
      metadata: {
        ...args.metadata,
        marketTicker: args.marketTicker,
        outcome: args.outcome,
        eventId: market.eventId,
        eventTitle: event.title,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "prediction.order_created",
      resourceType: "orders",
      resourceId: orderId,
      metadata: {
        marketTicker: args.marketTicker,
        outcome: args.outcome,
        side: args.side,
        type: args.type,
        quantity: args.quantity,
        price: orderPrice,
        estimatedCost: args.side === "buy" ? estimatedCost : undefined,
      },
      timestamp: now,
    });

    return {
      orderId,
      symbol,
      side: args.side,
      outcome: args.outcome,
      type: args.type,
      quantity: args.quantity,
      price: orderPrice,
      estimatedCost: args.side === "buy" ? estimatedCost : undefined,
      status: "pending",
    };
  },
});

/**
 * Execute/fill a prediction order - simulates instant fill for market orders
 * This combines order creation with immediate fill for a seamless experience
 */
export const executePredictionOrder = authenticatedMutation({
  args: {
    marketTicker: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    outcome: v.union(v.literal("yes"), v.literal("no")),
    quantity: v.number(),
    maxPrice: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate inputs
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    // Get market info
    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.marketTicker))
      .unique();

    if (!market) {
      throw new Error("Market not found");
    }

    // Get event info
    const event = await ctx.db.get(market.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.status !== "open") {
      throw new Error(`Cannot trade on event with status: ${event.status}`);
    }

    if (event.closeTime < now) {
      throw new Error("Event has closed for trading");
    }

    // Determine execution price
    let executionPrice: number;
    if (args.outcome === "yes") {
      executionPrice = args.side === "buy" ? market.yesPrice : market.noPrice;
    } else {
      executionPrice = args.side === "buy" ? market.noPrice : market.yesPrice;
    }

    // Check max price constraint
    if (args.maxPrice !== undefined && args.side === "buy" && executionPrice > args.maxPrice) {
      throw new Error(
        `Execution price $${executionPrice.toFixed(2)} exceeds max price $${args.maxPrice.toFixed(2)}`
      );
    }

    const notionalValue = args.quantity * executionPrice;
    const fee = notionalValue * 0.01; // 1% fee

    const symbol = `${args.marketTicker}-${args.outcome.toUpperCase()}`;

    if (args.side === "buy") {
      // Check and debit funds
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      const totalCost = notionalValue + fee;
      if (!balance || balance.available < totalCost) {
        throw new Error(
          `Insufficient funds. Required: $${totalCost.toFixed(2)}, Available: $${(balance?.available ?? 0).toFixed(2)}`
        );
      }

      // Debit funds
      await ctx.db.patch(balance._id, {
        available: balance.available - totalCost,
        updatedAt: now,
      });

      // Create or update position
      const existingPosition = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetClass", "prediction").eq("symbol", symbol)
        )
        .unique();

      let positionId;
      if (existingPosition) {
        const newQuantity = existingPosition.quantity + args.quantity;
        const newCostBasis = existingPosition.costBasis + notionalValue;
        const newAvgEntry = newCostBasis / newQuantity;

        await ctx.db.patch(existingPosition._id, {
          quantity: newQuantity,
          averageEntryPrice: newAvgEntry,
          costBasis: newCostBasis,
          currentPrice: executionPrice,
          unrealizedPnL: newQuantity * executionPrice - newCostBasis,
          updatedAt: now,
        });
        positionId = existingPosition._id;
      } else {
        positionId = await ctx.db.insert("positions", {
          userId,
          assetClass: "prediction",
          symbol,
          side: "long",
          quantity: args.quantity,
          averageEntryPrice: executionPrice,
          currentPrice: executionPrice,
          costBasis: notionalValue,
          unrealizedPnL: 0,
          realizedPnL: 0,
          openedAt: now,
          updatedAt: now,
        });
      }

      // Create filled order record
      const orderId = await ctx.db.insert("orders", {
        userId,
        assetClass: "prediction",
        symbol,
        side: "buy",
        type: "market",
        status: "filled",
        quantity: args.quantity,
        filledQuantity: args.quantity,
        remainingQuantity: 0,
        price: executionPrice,
        averageFilledPrice: executionPrice,
        timeInForce: "ioc",
        fees: fee,
        feeCurrency: "USD",
        metadata: {
          ...args.metadata,
          marketTicker: args.marketTicker,
          outcome: args.outcome,
          eventId: market.eventId,
          instantFill: true,
        },
        filledAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Create trade record
      const tradeId = await ctx.db.insert("trades", {
        orderId,
        userId,
        symbol,
        side: "buy",
        quantity: args.quantity,
        price: executionPrice,
        notionalValue,
        fee,
        feeCurrency: "USD",
        liquidity: "taker",
        executedAt: now,
        settlementStatus: "pending",
      });

      // Log audit
      await ctx.db.insert("auditLog", {
        userId,
        action: "prediction.order_executed",
        resourceType: "trades",
        resourceId: tradeId,
        metadata: {
          marketTicker: args.marketTicker,
          outcome: args.outcome,
          side: "buy",
          quantity: args.quantity,
          price: executionPrice,
          totalCost,
          positionId,
        },
        timestamp: now,
      });

      return {
        orderId,
        tradeId,
        positionId,
        symbol,
        side: "buy",
        outcome: args.outcome,
        quantity: args.quantity,
        price: executionPrice,
        notionalValue,
        fee,
        totalCost,
        status: "filled",
      };
    } else {
      // SELL order
      const existingPosition = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetClass", "prediction").eq("symbol", symbol)
        )
        .unique();

      if (!existingPosition || existingPosition.quantity < args.quantity) {
        throw new Error(
          `Insufficient position. Requested: ${args.quantity}, Available: ${existingPosition?.quantity ?? 0}`
        );
      }

      const proceeds = notionalValue - fee;
      const soldCostBasis = (args.quantity / existingPosition.quantity) * existingPosition.costBasis;
      const realizedPnL = proceeds - soldCostBasis;

      // Credit proceeds
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (balance) {
        await ctx.db.patch(balance._id, {
          available: balance.available + proceeds,
          updatedAt: now,
        });
      }

      // Update or delete position
      const newQuantity = existingPosition.quantity - args.quantity;
      const newCostBasis = existingPosition.costBasis - soldCostBasis;

      if (newQuantity <= 0) {
        await ctx.db.delete(existingPosition._id);
      } else {
        await ctx.db.patch(existingPosition._id, {
          quantity: newQuantity,
          costBasis: newCostBasis,
          currentPrice: executionPrice,
          unrealizedPnL: newQuantity * executionPrice - newCostBasis,
          realizedPnL: existingPosition.realizedPnL + realizedPnL,
          updatedAt: now,
        });
      }

      // Create filled order record
      const orderId = await ctx.db.insert("orders", {
        userId,
        assetClass: "prediction",
        symbol,
        side: "sell",
        type: "market",
        status: "filled",
        quantity: args.quantity,
        filledQuantity: args.quantity,
        remainingQuantity: 0,
        price: executionPrice,
        averageFilledPrice: executionPrice,
        timeInForce: "ioc",
        fees: fee,
        feeCurrency: "USD",
        metadata: {
          ...args.metadata,
          marketTicker: args.marketTicker,
          outcome: args.outcome,
          eventId: market.eventId,
          instantFill: true,
        },
        filledAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Create trade record
      const tradeId = await ctx.db.insert("trades", {
        orderId,
        userId,
        symbol,
        side: "sell",
        quantity: args.quantity,
        price: executionPrice,
        notionalValue,
        fee,
        feeCurrency: "USD",
        liquidity: "taker",
        executedAt: now,
        settlementStatus: "pending",
      });

      // Log audit
      await ctx.db.insert("auditLog", {
        userId,
        action: "prediction.order_executed",
        resourceType: "trades",
        resourceId: tradeId,
        metadata: {
          marketTicker: args.marketTicker,
          outcome: args.outcome,
          side: "sell",
          quantity: args.quantity,
          price: executionPrice,
          proceeds,
          realizedPnL,
        },
        timestamp: now,
      });

      return {
        orderId,
        tradeId,
        symbol,
        side: "sell",
        outcome: args.outcome,
        quantity: args.quantity,
        price: executionPrice,
        notionalValue,
        fee,
        proceeds,
        realizedPnL,
        status: "filled",
      };
    }
  },
});

/**
 * Get prediction order book / depth for a market
 */
export const getMarketDepth = query({
  args: { ticker: v.string() },
  handler: async (ctx, args) => {
    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (!market) {
      throw new Error("Market not found");
    }

    const event = await ctx.db.get(market.eventId);

    // Get open orders for this market
    const yesOrders = await ctx.db
      .query("orders")
      .withIndex("by_symbol", (q) =>
        q.eq("symbol", `${args.ticker}-YES`).eq("status", "pending")
      )
      .collect();

    const noOrders = await ctx.db
      .query("orders")
      .withIndex("by_symbol", (q) =>
        q.eq("symbol", `${args.ticker}-NO`).eq("status", "pending")
      )
      .collect();

    // Aggregate bids and asks
    const yesBids: Record<number, number> = {};
    const yesAsks: Record<number, number> = {};
    const noBids: Record<number, number> = {};
    const noAsks: Record<number, number> = {};

    for (const order of yesOrders) {
      const price = order.price ?? 0;
      if (order.side === "buy") {
        yesBids[price] = (yesBids[price] ?? 0) + order.remainingQuantity;
      } else {
        yesAsks[price] = (yesAsks[price] ?? 0) + order.remainingQuantity;
      }
    }

    for (const order of noOrders) {
      const price = order.price ?? 0;
      if (order.side === "buy") {
        noBids[price] = (noBids[price] ?? 0) + order.remainingQuantity;
      } else {
        noAsks[price] = (noAsks[price] ?? 0) + order.remainingQuantity;
      }
    }

    return {
      ticker: args.ticker,
      eventTitle: event?.title,
      eventStatus: event?.status,
      yes: {
        price: market.yesPrice,
        bids: Object.entries(yesBids)
          .map(([price, quantity]) => ({ price: parseFloat(price), quantity }))
          .sort((a, b) => b.price - a.price),
        asks: Object.entries(yesAsks)
          .map(([price, quantity]) => ({ price: parseFloat(price), quantity }))
          .sort((a, b) => a.price - b.price),
      },
      no: {
        price: market.noPrice,
        bids: Object.entries(noBids)
          .map(([price, quantity]) => ({ price: parseFloat(price), quantity }))
          .sort((a, b) => b.price - a.price),
        asks: Object.entries(noAsks)
          .map(([price, quantity]) => ({ price: parseFloat(price), quantity }))
          .sort((a, b) => a.price - b.price),
      },
      volume: {
        yes: market.yesVolume,
        no: market.noVolume,
        total: market.yesVolume + market.noVolume,
      },
      openInterest: market.openInterest,
    };
  },
});
