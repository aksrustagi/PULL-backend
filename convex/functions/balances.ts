/**
 * Balance Management Functions
 *
 * Handles user balances across all asset types including
 * cash, crypto, prediction positions, RWAs, and $PULL tokens.
 */

import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "../_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all balances for a user
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get balance for specific asset
 */
export const getByUserAsset = query({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("cash"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("pull_token")
    ),
    assetId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", args.assetType)
          .eq("assetId", args.assetId)
      )
      .unique();
  },
});

/**
 * Get user's cash balance
 */
export const getCashBalance = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "cash").eq("assetId", "USD")
      )
      .unique();

    return balance?.available ?? 0;
  },
});

/**
 * Get user's buying power (available cash minus holds)
 */
export const getBuyingPower = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const cashBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "cash").eq("assetId", "USD")
      )
      .unique();

    if (!cashBalance) return 0;

    // Get active holds
    const activeHolds = await ctx.db
      .query("buyingPowerHolds")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const totalHeld = activeHolds.reduce((sum, hold) => sum + hold.amount, 0);

    return cashBalance.available - totalHeld;
  },
});

/**
 * Get portfolio summary
 */
export const getPortfolioSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const summary = {
      totalValue: 0,
      cash: 0,
      crypto: 0,
      predictions: 0,
      rwa: 0,
      pullToken: 0,
      positions: [] as Array<{
        assetId: string;
        symbol: string;
        name: string;
        assetType: string;
        quantity: number;
        value: number;
        priceChange24h: number;
      }>,
    };

    for (const balance of balances) {
      const value = balance.totalValue;
      summary.totalValue += value;

      switch (balance.assetType) {
        case "cash":
          summary.cash += value;
          break;
        case "crypto":
          summary.crypto += value;
          break;
        case "prediction":
          summary.predictions += value;
          break;
        case "rwa":
          summary.rwa += value;
          break;
        case "pull_token":
          summary.pullToken += value;
          break;
      }

      // Add non-zero positions
      if (balance.available > 0 && balance.assetType !== "cash") {
        summary.positions.push({
          assetId: balance.assetId,
          symbol: balance.symbol,
          name: balance.name,
          assetType: balance.assetType,
          quantity: balance.available,
          value: balance.totalValue,
          priceChange24h: 0, // Would come from market data
        });
      }
    }

    return summary;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Update balance after trade execution
 */
export const updateAfterTrade = internalMutation({
  args: {
    userId: v.id("users"),
    assetId: v.string(),
    assetType: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
    name: v.string(),
    quantityDelta: v.number(),
    cashDelta: v.number(),
    currentPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Update asset balance
    const assetBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", args.assetType)
          .eq("assetId", args.assetId)
      )
      .unique();

    if (assetBalance) {
      const newAvailable = assetBalance.available + args.quantityDelta;
      await ctx.db.patch(assetBalance._id, {
        available: newAvailable,
        currentPrice: args.currentPrice,
        totalValue: newAvailable * args.currentPrice,
        updatedAt: now,
      });
    } else if (args.quantityDelta > 0) {
      // Create new balance record
      await ctx.db.insert("balances", {
        userId: args.userId,
        assetType: args.assetType,
        assetId: args.assetId,
        symbol: args.symbol,
        name: args.name,
        available: args.quantityDelta,
        held: 0,
        pending: 0,
        staked: 0,
        currentPrice: args.currentPrice,
        totalValue: args.quantityDelta * args.currentPrice,
        updatedAt: now,
      });
    }

    // Update cash balance
    const cashBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "cash").eq("assetId", "USD")
      )
      .unique();

    if (cashBalance) {
      await ctx.db.patch(cashBalance._id, {
        available: cashBalance.available + args.cashDelta,
        totalValue: cashBalance.available + args.cashDelta,
        updatedAt: now,
      });

      // Update user's cached cash balance
      await ctx.db.patch(args.userId, {
        cashBalance: cashBalance.available + args.cashDelta,
        updatedAt: now,
      });
    }

    return true;
  },
});

/**
 * Place hold on buying power for pending order
 */
export const createHold = internalMutation({
  args: {
    userId: v.id("users"),
    orderId: v.optional(v.id("orders")),
    amount: v.number(),
    currency: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const holdId = await ctx.db.insert("buyingPowerHolds", {
      userId: args.userId,
      orderId: args.orderId,
      amount: args.amount,
      currency: args.currency,
      reason: args.reason,
      status: "active",
      createdAt: now,
    });

    return holdId;
  },
});

/**
 * Release hold on buying power
 */
export const releaseHold = internalMutation({
  args: {
    holdId: v.id("buyingPowerHolds"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.holdId, {
      status: "released",
      releasedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Apply hold (convert to actual balance change)
 */
export const applyHold = internalMutation({
  args: {
    holdId: v.id("buyingPowerHolds"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.holdId, {
      status: "applied",
      releasedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Deposit funds (internal - called after payment processing)
 */
export const deposit = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    source: v.string(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get or create cash balance
    let cashBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "cash")
          .eq("assetId", args.currency)
      )
      .unique();

    if (cashBalance) {
      await ctx.db.patch(cashBalance._id, {
        available: cashBalance.available + args.amount,
        totalValue: cashBalance.available + args.amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("balances", {
        userId: args.userId,
        assetType: "cash",
        assetId: args.currency,
        symbol: args.currency,
        name: args.currency === "USD" ? "US Dollar" : args.currency,
        available: args.amount,
        held: 0,
        pending: 0,
        staked: 0,
        currentPrice: 1,
        totalValue: args.amount,
        updatedAt: now,
      });
    }

    // Update user's cached balance
    const user = await ctx.db.get(args.userId);
    if (user) {
      await ctx.db.patch(args.userId, {
        cashBalance: user.cashBalance + args.amount,
        updatedAt: now,
      });
    }

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "system",
      action: "funds_deposited",
      category: "funds",
      resourceType: "balance",
      resourceId: args.userId,
      description: `Deposited ${args.amount} ${args.currency}`,
      metadata: {
        amount: args.amount,
        currency: args.currency,
        source: args.source,
        externalId: args.externalId,
      },
      timestamp: now,
    });

    return true;
  },
});

/**
 * Withdraw funds (internal - initiates withdrawal)
 */
export const withdraw = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    destination: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const cashBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "cash")
          .eq("assetId", args.currency)
      )
      .unique();

    if (!cashBalance || cashBalance.available < args.amount) {
      throw new Error("Insufficient balance for withdrawal");
    }

    // Deduct from available, add to pending
    await ctx.db.patch(cashBalance._id, {
      available: cashBalance.available - args.amount,
      pending: cashBalance.pending + args.amount,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "user",
      action: "withdrawal_initiated",
      category: "funds",
      resourceType: "balance",
      resourceId: args.userId,
      description: `Withdrawal initiated: ${args.amount} ${args.currency}`,
      metadata: {
        amount: args.amount,
        currency: args.currency,
        destination: args.destination,
      },
      timestamp: now,
    });

    return true;
  },
});

/**
 * Update prices for user's positions (called periodically)
 */
export const updatePrices = internalMutation({
  args: {
    updates: v.array(
      v.object({
        assetId: v.string(),
        currentPrice: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const update of args.updates) {
      // Get all balances for this asset
      const balances = await ctx.db
        .query("balances")
        .withIndex("by_assetId", (q) => q.eq("assetId", update.assetId))
        .collect();

      for (const balance of balances) {
        await ctx.db.patch(balance._id, {
          currentPrice: update.currentPrice,
          totalValue: balance.available * update.currentPrice,
          updatedAt: now,
        });
      }
    }

    return true;
  },
});

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

export const getByUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const checkSufficientBalance = internalQuery({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("cash"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("pull_token")
    ),
    assetId: v.string(),
    requiredAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", args.assetType)
          .eq("assetId", args.assetId)
      )
      .unique();

    if (!balance) {
      return { sufficient: false, available: 0 };
    }

    return {
      sufficient: balance.available >= args.requiredAmount,
      available: balance.available,
    };
  },
});
