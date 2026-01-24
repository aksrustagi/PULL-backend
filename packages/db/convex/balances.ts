import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, authenticatedMutation, systemMutation, adminMutation } from "./lib/auth";

/**
 * Balance queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all balances for the authenticated user
 */
export const getByUser = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get balance by authenticated user and asset
 */
export const getByUserAndAsset = authenticatedQuery({
  args: {
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", userId)
          .eq("assetType", args.assetType)
          .eq("assetId", args.assetId)
      )
      .unique();
  },
});

/**
 * Get USD buying power for the authenticated user
 */
export const getBuyingPower = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const usdBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
      )
      .unique();

    return {
      available: usdBalance?.available ?? 0,
      held: usdBalance?.held ?? 0,
      pending: usdBalance?.pending ?? 0,
      total: (usdBalance?.available ?? 0) + (usdBalance?.held ?? 0),
    };
  },
});

/**
 * Get portfolio summary for the authenticated user
 */
export const getPortfolioSummary = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Calculate totals by asset type
    const usdBalance = balances.find(
      (b) => b.assetType === "usd" && b.assetId === "USD"
    );
    const pointsBalance = balances.find(
      (b) => b.assetType === "points" && b.assetId === "PULL_POINTS"
    );

    const totalPositionValue = positions.reduce((sum, p) => {
      return sum + p.quantity * p.currentPrice;
    }, 0);

    const totalUnrealizedPnL = positions.reduce((sum, p) => {
      return sum + p.unrealizedPnL;
    }, 0);

    const totalRealizedPnL = positions.reduce((sum, p) => {
      return sum + p.realizedPnL;
    }, 0);

    return {
      cashBalance: usdBalance?.available ?? 0,
      cashHeld: usdBalance?.held ?? 0,
      positionValue: totalPositionValue,
      portfolioValue: (usdBalance?.available ?? 0) + totalPositionValue,
      unrealizedPnL: totalUnrealizedPnL,
      realizedPnL: totalRealizedPnL,
      pointsBalance: pointsBalance?.available ?? 0,
      positionCount: positions.length,
      breakdown: {
        crypto: positions
          .filter((p) => p.assetClass === "crypto")
          .reduce((sum, p) => sum + p.quantity * p.currentPrice, 0),
        prediction: positions
          .filter((p) => p.assetClass === "prediction")
          .reduce((sum, p) => sum + p.quantity * p.currentPrice, 0),
        rwa: positions
          .filter((p) => p.assetClass === "rwa")
          .reduce((sum, p) => sum + p.quantity * p.currentPrice, 0),
      },
    };
  },
});

// ============================================================================
// SYSTEM MUTATIONS (trading engine / webhooks)
// ============================================================================

/**
 * Credit balance (add funds) - system only
 */
export const credit = systemMutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    symbol: v.string(),
    amount: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new Error("Credit amount must be positive");
    }

    const now = Date.now();

    // Get or create balance record
    let balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", args.assetType)
          .eq("assetId", args.assetId)
      )
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: balance.available + args.amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("balances", {
        userId: args.userId,
        assetType: args.assetType,
        assetId: args.assetId,
        symbol: args.symbol,
        available: args.amount,
        held: 0,
        pending: 0,
        updatedAt: now,
      });
    }

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "balance.credit",
      resourceType: "balances",
      resourceId: args.assetId,
      metadata: {
        assetType: args.assetType,
        amount: args.amount,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      },
      timestamp: now,
    });

    return { success: true, amount: args.amount };
  },
});

/**
 * Debit balance (remove funds) - system only
 */
export const debit = systemMutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    amount: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new Error("Debit amount must be positive");
    }

    const now = Date.now();

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
      throw new Error("Balance not found");
    }

    if (balance.available < args.amount) {
      throw new Error("Insufficient balance");
    }

    await ctx.db.patch(balance._id, {
      available: balance.available - args.amount,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "balance.debit",
      resourceType: "balances",
      resourceId: args.assetId,
      metadata: {
        assetType: args.assetType,
        amount: args.amount,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      },
      timestamp: now,
    });

    return { success: true, amount: args.amount };
  },
});

/**
 * Place hold on balance - system only
 */
export const hold = systemMutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    amount: v.number(),
    referenceType: v.string(),
    referenceId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new Error("Hold amount must be positive");
    }

    const now = Date.now();

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
      throw new Error("Balance not found");
    }

    if (balance.available < args.amount) {
      throw new Error("Insufficient available balance for hold");
    }

    await ctx.db.patch(balance._id, {
      available: balance.available - args.amount,
      held: balance.held + args.amount,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "balance.hold",
      resourceType: "balances",
      resourceId: args.assetId,
      metadata: {
        assetType: args.assetType,
        amount: args.amount,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      },
      timestamp: now,
    });

    return { success: true, amount: args.amount };
  },
});

/**
 * Release hold on balance - system only
 */
export const releaseHold = systemMutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    amount: v.number(),
    returnToAvailable: v.boolean(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new Error("Release amount must be positive");
    }

    const now = Date.now();

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
      throw new Error("Balance not found");
    }

    if (balance.held < args.amount) {
      throw new Error("Insufficient held balance");
    }

    const updates: Record<string, number> = {
      held: balance.held - args.amount,
      updatedAt: now,
    };

    if (args.returnToAvailable) {
      updates.available = balance.available + args.amount;
    }

    await ctx.db.patch(balance._id, updates);

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "balance.release_hold",
      resourceType: "balances",
      resourceId: args.assetId,
      metadata: {
        assetType: args.assetType,
        amount: args.amount,
        returnToAvailable: args.returnToAvailable,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      },
      timestamp: now,
    });

    return { success: true, amount: args.amount };
  },
});

/**
 * Complete deposit - system only (called by payment webhook)
 */
export const completeDeposit = systemMutation({
  args: {
    depositId: v.id("deposits"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) {
      throw new Error("Deposit not found");
    }

    if (deposit.status !== "pending" && deposit.status !== "processing") {
      throw new Error("Deposit cannot be completed");
    }

    // Update deposit status
    await ctx.db.patch(args.depositId, {
      status: "completed",
      completedAt: now,
    });

    // Credit balance
    let balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", deposit.userId)
          .eq("assetType", "usd")
          .eq("assetId", "USD")
      )
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: balance.available + deposit.netAmount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("balances", {
        userId: deposit.userId,
        assetType: "usd",
        assetId: "USD",
        symbol: "USD",
        available: deposit.netAmount,
        held: 0,
        pending: 0,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      userId: deposit.userId,
      action: "deposit.completed",
      resourceType: "deposits",
      resourceId: args.depositId,
      metadata: { amount: deposit.netAmount, method: deposit.method },
      timestamp: now,
    });

    return { success: true };
  },
});

// ============================================================================
// AUTHENTICATED MUTATIONS (user-facing)
// ============================================================================

/**
 * Record deposit - authenticated user only
 */
export const recordDeposit = authenticatedMutation({
  args: {
    method: v.union(
      v.literal("bank_transfer"),
      v.literal("wire"),
      v.literal("crypto"),
      v.literal("card")
    ),
    amount: v.number(),
    currency: v.string(),
    fee: v.number(),
    externalId: v.optional(v.string()),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();
    const netAmount = args.amount - args.fee;

    const depositId = await ctx.db.insert("deposits", {
      userId,
      method: args.method,
      status: "pending",
      amount: args.amount,
      currency: args.currency,
      fee: args.fee,
      netAmount,
      externalId: args.externalId,
      txHash: args.txHash,
      createdAt: now,
    });

    return depositId;
  },
});

/**
 * Record withdrawal request - authenticated user only
 */
export const recordWithdrawal = authenticatedMutation({
  args: {
    method: v.union(
      v.literal("bank_transfer"),
      v.literal("wire"),
      v.literal("crypto")
    ),
    amount: v.number(),
    currency: v.string(),
    fee: v.number(),
    destination: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();
    const netAmount = args.amount - args.fee;

    // Check available balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", userId)
          .eq("assetType", "usd")
          .eq("assetId", "USD")
      )
      .unique();

    if (!balance || balance.available < args.amount) {
      throw new Error("Insufficient balance for withdrawal");
    }

    // Place hold on funds
    await ctx.db.patch(balance._id, {
      available: balance.available - args.amount,
      held: balance.held + args.amount,
      updatedAt: now,
    });

    const withdrawalId = await ctx.db.insert("withdrawals", {
      userId,
      method: args.method,
      status: "pending",
      amount: args.amount,
      currency: args.currency,
      fee: args.fee,
      netAmount,
      destination: args.destination,
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId,
      action: "withdrawal.requested",
      resourceType: "withdrawals",
      resourceId: withdrawalId,
      metadata: { amount: args.amount, destination: args.destination },
      timestamp: now,
    });

    return withdrawalId;
  },
});

// ============================================================================
// ADMIN MUTATIONS
// ============================================================================

/**
 * Reconcile balance (admin only)
 */
export const reconcile = adminMutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    expectedAvailable: v.number(),
    expectedHeld: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

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
      throw new Error("Balance not found");
    }

    const adjustment = {
      availableDiff: args.expectedAvailable - balance.available,
      heldDiff: args.expectedHeld - balance.held,
    };

    await ctx.db.patch(balance._id, {
      available: args.expectedAvailable,
      held: args.expectedHeld,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "balance.reconciled",
      resourceType: "balances",
      resourceId: args.assetId,
      changes: {
        old: { available: balance.available, held: balance.held },
        new: { available: args.expectedAvailable, held: args.expectedHeld },
      },
      metadata: { reason: args.reason, adjustment },
      timestamp: now,
    });

    return { success: true, adjustment };
  },
});
