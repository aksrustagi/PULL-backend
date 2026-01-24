/**
 * Market Data - Real-time market data from Kalshi
 * Updated by Temporal worker, consumed via Convex subscriptions
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// QUERIES - Clients subscribe to these for real-time updates
// ============================================================================

/**
 * Get current price for a market
 * Clients use: const price = useQuery(api.marketData.getPrice, { ticker: "BTC-USD" })
 */
export const getPrice = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const data = await ctx.db
      .query("marketPrices")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .first();

    if (!data) return null;

    return {
      ticker: data.ticker,
      price: data.price,
      change24h: data.change24h,
      changePercent24h: data.changePercent24h,
      volume24h: data.volume24h,
      high24h: data.high24h,
      low24h: data.low24h,
      timestamp: data.updatedAt,
    };
  },
});

/**
 * Get orderbook for a market
 * Clients use: const orderbook = useQuery(api.marketData.getOrderbook, { ticker: "BTC-USD" })
 */
export const getOrderbook = query({
  args: { ticker: v.string(), depth: v.optional(v.number()) },
  handler: async (ctx, { ticker, depth = 10 }) => {
    const data = await ctx.db
      .query("marketOrderbooks")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .first();

    if (!data) return null;

    return {
      ticker: data.ticker,
      bids: data.bids.slice(0, depth),
      asks: data.asks.slice(0, depth),
      spread: data.spread,
      midPrice: data.midPrice,
      timestamp: data.updatedAt,
    };
  },
});

/**
 * Get recent trades for a market
 * Clients use: const trades = useQuery(api.marketData.getRecentTrades, { ticker: "BTC-USD", limit: 20 })
 */
export const getRecentTrades = query({
  args: { ticker: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { ticker, limit = 50 }) => {
    const trades = await ctx.db
      .query("marketTrades")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .order("desc")
      .take(limit);

    return trades.map((t) => ({
      id: t._id,
      ticker: t.ticker,
      price: t.price,
      size: t.size,
      side: t.side,
      timestamp: t.timestamp,
    }));
  },
});

/**
 * Get all active market prices
 * Clients use: const prices = useQuery(api.marketData.getAllPrices)
 */
export const getAllPrices = query({
  args: {},
  handler: async (ctx) => {
    const prices = await ctx.db
      .query("marketPrices")
      .withIndex("by_updated", (q) => q.gt("updatedAt", Date.now() - 60000)) // Active in last minute
      .collect();

    return prices.map((p) => ({
      ticker: p.ticker,
      price: p.price,
      change24h: p.change24h,
      changePercent24h: p.changePercent24h,
      volume24h: p.volume24h,
      timestamp: p.updatedAt,
    }));
  },
});

// ============================================================================
// MUTATIONS - Called by Temporal worker to update data
// ============================================================================

/**
 * Update market price
 * Called by: Temporal worker when Kalshi sends price update
 */
export const updatePrice = mutation({
  args: {
    ticker: v.string(),
    price: v.number(),
    change24h: v.optional(v.number()),
    changePercent24h: v.optional(v.number()),
    volume24h: v.optional(v.number()),
    high24h: v.optional(v.number()),
    low24h: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketPrices")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        price: args.price,
        change24h: args.change24h ?? existing.change24h,
        changePercent24h: args.changePercent24h ?? existing.changePercent24h,
        volume24h: args.volume24h ?? existing.volume24h,
        high24h: args.high24h ?? existing.high24h,
        low24h: args.low24h ?? existing.low24h,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("marketPrices", {
      ticker: args.ticker,
      price: args.price,
      change24h: args.change24h ?? 0,
      changePercent24h: args.changePercent24h ?? 0,
      volume24h: args.volume24h ?? 0,
      high24h: args.high24h,
      low24h: args.low24h,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update orderbook
 * Called by: Temporal worker when Kalshi sends orderbook delta
 */
export const updateOrderbook = mutation({
  args: {
    ticker: v.string(),
    bids: v.array(v.array(v.number())), // [[price, size], ...]
    asks: v.array(v.array(v.number())),
    spread: v.optional(v.number()),
    midPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketOrderbooks")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .first();

    const now = Date.now();
    const bestBid = args.bids[0]?.[0];
    const bestAsk = args.asks[0]?.[0];
    const spread = bestBid && bestAsk ? bestAsk - bestBid : args.spread;
    const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : args.midPrice;

    if (existing) {
      await ctx.db.patch(existing._id, {
        bids: args.bids,
        asks: args.asks,
        spread,
        midPrice,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("marketOrderbooks", {
      ticker: args.ticker,
      bids: args.bids,
      asks: args.asks,
      spread,
      midPrice,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Insert trade
 * Called by: Temporal worker when Kalshi sends trade
 */
export const insertTrade = mutation({
  args: {
    ticker: v.string(),
    tradeId: v.string(),
    price: v.number(),
    size: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if trade already exists
    const existing = await ctx.db
      .query("marketTrades")
      .withIndex("by_trade_id", (q) => q.eq("tradeId", args.tradeId))
      .first();

    if (existing) {
      return existing._id; // Idempotent
    }

    return await ctx.db.insert("marketTrades", {
      ticker: args.ticker,
      tradeId: args.tradeId,
      price: args.price,
      size: args.size,
      side: args.side,
      timestamp: args.timestamp,
      createdAt: Date.now(),
    });
  },
});

/**
 * Clean up old trades (keep last 1000 per market)
 * Called by: Scheduled Temporal workflow
 */
export const cleanupOldTrades = mutation({
  args: { ticker: v.string(), keepCount: v.optional(v.number()) },
  handler: async (ctx, { ticker, keepCount = 1000 }) => {
    const trades = await ctx.db
      .query("marketTrades")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .order("desc")
      .collect();

    if (trades.length <= keepCount) {
      return 0; // Nothing to delete
    }

    const toDelete = trades.slice(keepCount);
    let deletedCount = 0;

    for (const trade of toDelete) {
      await ctx.db.delete(trade._id);
      deletedCount++;
    }

    return deletedCount;
  },
});
