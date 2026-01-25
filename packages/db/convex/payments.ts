import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, authenticatedMutation, systemMutation } from "./lib/auth";

/**
 * Payments module for Stripe integration
 * Handles deposits, withdrawals, and payment tracking
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get deposits for the authenticated user
 */
export const getDeposits = authenticatedQuery({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const limit = args.limit ?? 50;

    let query = ctx.db
      .query("deposits")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const deposits = await query.order("desc").take(limit);

    // Filter by status if provided
    if (args.status) {
      return deposits.filter((d) => d.status === args.status);
    }

    return deposits;
  },
});

/**
 * Get withdrawals for the authenticated user
 */
export const getWithdrawals = authenticatedQuery({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const limit = args.limit ?? 50;

    let query = ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const withdrawals = await query.order("desc").take(limit);

    // Filter by status if provided
    if (args.status) {
      return withdrawals.filter((w) => w.status === args.status);
    }

    return withdrawals;
  },
});

/**
 * Get deposit by ID
 */
export const getDepositById = authenticatedQuery({
  args: {
    depositId: v.id("deposits"),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const deposit = await ctx.db.get(args.depositId);

    if (!deposit || deposit.userId !== userId) {
      return null;
    }

    return deposit;
  },
});

/**
 * Get withdrawal by ID
 */
export const getWithdrawalById = authenticatedQuery({
  args: {
    withdrawalId: v.id("withdrawals"),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const withdrawal = await ctx.db.get(args.withdrawalId);

    if (!withdrawal || withdrawal.userId !== userId) {
      return null;
    }

    return withdrawal;
  },
});

// ============================================================================
// AUTHENTICATED MUTATIONS
// ============================================================================

/**
 * Set Stripe connected account ID for the user
 */
export const setStripeConnectedAccount = authenticatedMutation({
  args: {
    connectedAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Get current user
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Update user with connected account ID
    await ctx.db.patch(userId, {
      stripeConnectedAccountId: args.connectedAccountId,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId,
      action: "stripe.connected_account_linked",
      resourceType: "users",
      resourceId: userId,
      metadata: {
        connectedAccountId: args.connectedAccountId,
      },
      timestamp: now,
    });

    return { success: true };
  },
});

// ============================================================================
// SYSTEM MUTATIONS (Webhook handlers)
// ============================================================================

/**
 * Complete deposit by external ID (idempotent)
 * Called by Stripe webhook on checkout.session.completed
 */
export const completeDepositByExternalId = systemMutation({
  args: {
    externalId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find deposit by external ID (checkout session ID or payment intent ID)
    let deposit = await ctx.db
      .query("deposits")
      .filter((q) => q.eq(q.field("externalId"), args.externalId))
      .first();

    // If not found by session ID, try payment intent ID
    if (!deposit && args.stripePaymentIntentId) {
      deposit = await ctx.db
        .query("deposits")
        .filter((q) => q.eq(q.field("externalId"), args.stripePaymentIntentId))
        .first();
    }

    if (!deposit) {
      console.warn("Deposit not found for external ID:", args.externalId);
      throw new Error("Deposit not found");
    }

    // Idempotency check - if already completed, return success
    if (deposit.status === "completed") {
      console.log("Deposit already completed (idempotent):", deposit._id);
      return { success: true, alreadyCompleted: true };
    }

    // Only complete pending or processing deposits
    if (deposit.status !== "pending" && deposit.status !== "processing") {
      throw new Error(`Cannot complete deposit from status: ${deposit.status}`);
    }

    // Update deposit status
    await ctx.db.patch(deposit._id, {
      status: "completed",
      completedAt: now,
      metadata: {
        ...deposit.metadata,
        stripePaymentIntentId: args.stripePaymentIntentId,
        stripeCustomerId: args.stripeCustomerId,
      },
    });

    // Credit user's balance
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

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: deposit.userId,
      action: "deposit.completed",
      resourceType: "deposits",
      resourceId: deposit._id,
      metadata: {
        amount: deposit.amount,
        fee: deposit.fee,
        netAmount: deposit.netAmount,
        method: deposit.method,
        stripePaymentIntentId: args.stripePaymentIntentId,
      },
      timestamp: now,
    });

    console.log("Deposit completed:", {
      depositId: deposit._id,
      userId: deposit.userId,
      netAmount: deposit.netAmount,
    });

    return { success: true };
  },
});

/**
 * Mark deposit as failed
 * Called by Stripe webhook on payment_intent.payment_failed
 */
export const failDepositByExternalId = systemMutation({
  args: {
    externalId: v.string(),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find deposit by external ID
    const deposit = await ctx.db
      .query("deposits")
      .filter((q) => q.eq(q.field("externalId"), args.externalId))
      .first();

    if (!deposit) {
      console.warn("Deposit not found for external ID:", args.externalId);
      return { success: false, error: "Deposit not found" };
    }

    // Only fail pending or processing deposits
    if (deposit.status !== "pending" && deposit.status !== "processing") {
      return { success: true, alreadyProcessed: true };
    }

    // Update deposit status
    await ctx.db.patch(deposit._id, {
      status: "failed",
      metadata: {
        ...deposit.metadata,
        failureReason: args.failureReason,
        failedAt: now,
      },
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: deposit.userId,
      action: "deposit.failed",
      resourceType: "deposits",
      resourceId: deposit._id,
      metadata: {
        amount: deposit.amount,
        failureReason: args.failureReason,
      },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Complete withdrawal by payout ID
 * Called by Stripe webhook on payout.paid
 */
export const completeWithdrawalByPayoutId = systemMutation({
  args: {
    stripePayoutId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find withdrawal with this payout ID in metadata
    const withdrawals = await ctx.db.query("withdrawals").collect();
    const withdrawal = withdrawals.find(
      (w) => w.metadata?.stripePayoutId === args.stripePayoutId ||
             w.metadata?.stripeTransferId === args.stripePayoutId
    );

    if (!withdrawal) {
      console.warn("Withdrawal not found for payout ID:", args.stripePayoutId);
      return { success: false, error: "Withdrawal not found" };
    }

    // Idempotency check
    if (withdrawal.status === "completed") {
      return { success: true, alreadyCompleted: true };
    }

    // Update withdrawal status
    await ctx.db.patch(withdrawal._id, {
      status: "completed",
      completedAt: now,
    });

    // Release the held funds (they've been paid out)
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", withdrawal.userId)
          .eq("assetType", "usd")
          .eq("assetId", "USD")
      )
      .unique();

    if (balance && balance.held >= withdrawal.amount) {
      await ctx.db.patch(balance._id, {
        held: balance.held - withdrawal.amount,
        updatedAt: now,
      });
    }

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: withdrawal.userId,
      action: "withdrawal.completed",
      resourceType: "withdrawals",
      resourceId: withdrawal._id,
      metadata: {
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netAmount: withdrawal.netAmount,
        stripePayoutId: args.stripePayoutId,
      },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Mark withdrawal as failed
 * Called by Stripe webhook on payout.failed
 */
export const failWithdrawalByPayoutId = systemMutation({
  args: {
    stripePayoutId: v.string(),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find withdrawal with this payout ID in metadata
    const withdrawals = await ctx.db.query("withdrawals").collect();
    const withdrawal = withdrawals.find(
      (w) => w.metadata?.stripePayoutId === args.stripePayoutId ||
             w.metadata?.stripeTransferId === args.stripePayoutId
    );

    if (!withdrawal) {
      console.warn("Withdrawal not found for payout ID:", args.stripePayoutId);
      return { success: false, error: "Withdrawal not found" };
    }

    // Idempotency check
    if (withdrawal.status === "failed" || withdrawal.status === "completed") {
      return { success: true, alreadyProcessed: true };
    }

    // Update withdrawal status
    await ctx.db.patch(withdrawal._id, {
      status: "failed",
      metadata: {
        ...withdrawal.metadata,
        failureReason: args.failureReason,
        failedAt: now,
      },
    });

    // Return held funds to available balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", withdrawal.userId)
          .eq("assetType", "usd")
          .eq("assetId", "USD")
      )
      .unique();

    if (balance && balance.held >= withdrawal.amount) {
      await ctx.db.patch(balance._id, {
        available: balance.available + withdrawal.amount,
        held: balance.held - withdrawal.amount,
        updatedAt: now,
      });
    }

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: withdrawal.userId,
      action: "withdrawal.failed",
      resourceType: "withdrawals",
      resourceId: withdrawal._id,
      metadata: {
        amount: withdrawal.amount,
        failureReason: args.failureReason,
      },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Mark connected account as ready for payouts
 * Called by Stripe webhook on account.updated
 */
export const markConnectedAccountReady = systemMutation({
  args: {
    stripeConnectedAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find user with this connected account ID
    const users = await ctx.db.query("users").collect();
    const user = users.find(
      (u) => (u as any).stripeConnectedAccountId === args.stripeConnectedAccountId
    );

    if (!user) {
      console.warn("User not found for connected account:", args.stripeConnectedAccountId);
      return { success: false, error: "User not found" };
    }

    // Update user with payout readiness flag
    await ctx.db.patch(user._id, {
      stripePayoutsEnabled: true,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "stripe.payouts_enabled",
      resourceType: "users",
      resourceId: user._id,
      metadata: {
        connectedAccountId: args.stripeConnectedAccountId,
      },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Create a withdrawal record with transfer ID
 * Called after Stripe transfer is created
 */
export const createWithdrawalWithTransfer = systemMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    fee: v.number(),
    netAmount: v.number(),
    currency: v.string(),
    destination: v.string(),
    stripeTransferId: v.string(),
    method: v.union(v.literal("standard"), v.literal("instant")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create withdrawal record
    const withdrawalId = await ctx.db.insert("withdrawals", {
      userId: args.userId,
      method: "bank_transfer",
      status: "processing",
      amount: args.amount,
      currency: args.currency,
      fee: args.fee,
      netAmount: args.netAmount,
      destination: args.destination,
      metadata: {
        stripeTransferId: args.stripeTransferId,
        payoutMethod: args.method,
      },
      createdAt: now,
    });

    return { withdrawalId };
  },
});

/**
 * Update withdrawal with payout ID
 * Called when payout is initiated on connected account
 */
export const updateWithdrawalPayout = systemMutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    stripePayoutId: v.string(),
  },
  handler: async (ctx, args) => {
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    await ctx.db.patch(args.withdrawalId, {
      metadata: {
        ...withdrawal.metadata,
        stripePayoutId: args.stripePayoutId,
      },
    });

    return { success: true };
  },
});

/**
 * Store Stripe customer ID for user
 */
export const setStripeCustomerId = systemMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.userId, {
      stripeCustomerId: args.stripeCustomerId,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Get user by Stripe customer ID
 */
export const getUserByStripeCustomerId = query({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    return users.find((u) => (u as any).stripeCustomerId === args.stripeCustomerId) ?? null;
  },
});
