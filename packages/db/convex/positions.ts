import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, systemMutation } from "./lib/auth";

/**
 * Position queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all positions for a user
 */
export const getByUser = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get position by user and asset
 */
export const getByUserAndAsset = authenticatedQuery({
  args: {
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("positions")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", userId)
          .eq("assetClass", args.assetClass)
          .eq("symbol", args.symbol)
      )
      .unique();
  },
});

/**
 * Get portfolio positions with current prices
 */
export const getPortfolioPositions = authenticatedQuery({
  args: {
    assetClass: v.optional(
      v.union(v.literal("crypto"), v.literal("prediction"), v.literal("rwa"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    let positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (args.assetClass) {
      positions = positions.filter((p) => p.assetClass === args.assetClass);
    }

    // Calculate totals
    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice,
      0
    );
    const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalUnrealizedPnL = positions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0
    );
    const totalRealizedPnL = positions.reduce(
      (sum, p) => sum + p.realizedPnL,
      0
    );

    return {
      positions: positions.map((p) => ({
        ...p,
        marketValue: p.quantity * p.currentPrice,
        pnlPercent:
          p.costBasis > 0 ? (p.unrealizedPnL / p.costBasis) * 100 : 0,
        allocation: totalValue > 0 ? (p.quantity * p.currentPrice) / totalValue : 0,
      })),
      summary: {
        totalValue,
        totalCost,
        totalUnrealizedPnL,
        totalRealizedPnL,
        totalPnLPercent: totalCost > 0 ? (totalUnrealizedPnL / totalCost) * 100 : 0,
        positionCount: positions.length,
      },
    };
  },
});

/**
 * Get position by ID
 */
export const getById = authenticatedQuery({
  args: { id: v.id("positions") },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.id);
    if (!position) {
      return null;
    }
    if (position.userId !== ctx.userId) {
      return null;
    }
    return position;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Update position with new price
 */
export const updatePosition = systemMutation({
  args: {
    id: v.id("positions"),
    currentPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const position = await ctx.db.get(args.id);
    if (!position) {
      throw new Error("Position not found");
    }

    const marketValue = position.quantity * args.currentPrice;
    const unrealizedPnL = marketValue - position.costBasis;

    await ctx.db.patch(args.id, {
      currentPrice: args.currentPrice,
      unrealizedPnL,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Update multiple positions with new prices
 */
export const updatePrices = systemMutation({
  args: {
    updates: v.array(
      v.object({
        symbol: v.string(),
        assetClass: v.union(
          v.literal("crypto"),
          v.literal("prediction"),
          v.literal("rwa")
        ),
        currentPrice: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let updatedCount = 0;

    for (const update of args.updates) {
      // Get all positions for this symbol
      const positions = await ctx.db
        .query("positions")
        .withIndex("by_user_asset")
        .filter((q) =>
          q.and(
            q.eq(q.field("assetClass"), update.assetClass),
            q.eq(q.field("symbol"), update.symbol)
          )
        )
        .collect();

      for (const position of positions) {
        const marketValue = position.quantity * update.currentPrice;
        const unrealizedPnL = marketValue - position.costBasis;

        await ctx.db.patch(position._id, {
          currentPrice: update.currentPrice,
          unrealizedPnL,
          updatedAt: now,
        });
        updatedCount++;
      }
    }

    return { updatedCount };
  },
});

/**
 * Close position (sell all)
 */
export const closePosition = systemMutation({
  args: {
    id: v.id("positions"),
    exitPrice: v.number(),
    fee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const position = await ctx.db.get(args.id);
    if (!position) {
      throw new Error("Position not found");
    }

    const proceeds = position.quantity * args.exitPrice - (args.fee ?? 0);
    const realizedPnL = proceeds - position.costBasis;

    // Credit proceeds to balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", position.userId)
          .eq("assetType", "usd")
          .eq("assetId", "USD")
      )
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: balance.available + proceeds,
        updatedAt: now,
      });
    }

    // Delete position
    await ctx.db.delete(args.id);

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: position.userId,
      action: "position.closed",
      resourceType: "positions",
      resourceId: args.id,
      metadata: {
        symbol: position.symbol,
        quantity: position.quantity,
        exitPrice: args.exitPrice,
        realizedPnL,
        proceeds,
      },
      timestamp: now,
    });

    return { realizedPnL, proceeds };
  },
});

/**
 * Adjust position (for corporate actions, splits, etc.)
 */
export const adjustPosition = systemMutation({
  args: {
    id: v.id("positions"),
    quantityMultiplier: v.number(),
    priceMultiplier: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const position = await ctx.db.get(args.id);
    if (!position) {
      throw new Error("Position not found");
    }

    const newQuantity = position.quantity * args.quantityMultiplier;
    const newAvgPrice = position.averageEntryPrice * args.priceMultiplier;
    const newCurrentPrice = position.currentPrice * args.priceMultiplier;

    await ctx.db.patch(args.id, {
      quantity: newQuantity,
      averageEntryPrice: newAvgPrice,
      currentPrice: newCurrentPrice,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: position.userId,
      action: "position.adjusted",
      resourceType: "positions",
      resourceId: args.id,
      changes: {
        old: {
          quantity: position.quantity,
          averageEntryPrice: position.averageEntryPrice,
        },
        new: {
          quantity: newQuantity,
          averageEntryPrice: newAvgPrice,
        },
      },
      metadata: { reason: args.reason },
      timestamp: now,
    });

    return args.id;
  },
});
