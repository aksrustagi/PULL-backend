/**
 * Order Management Functions
 *
 * Handles order creation, updates, and queries for trading.
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
 * Get orders for a user
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

/**
 * Get recent orders for a user
 */
export const getRecent = query({
  args: {
    userId: v.id("users"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
  },
});

/**
 * Get open orders for a user
 */
export const getOpenOrders = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const pendingOrders = await ctx.db
      .query("orders")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();

    const submittedOrders = await ctx.db
      .query("orders")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "submitted")
      )
      .collect();

    const partialOrders = await ctx.db
      .query("orders")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "partial")
      )
      .collect();

    return [...pendingOrders, ...submittedOrders, ...partialOrders];
  },
});

/**
 * Get order by ID
 */
export const getById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

/**
 * Get order by external ID (from execution venue)
 */
export const getByExternalId = query({
  args: { externalOrderId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_externalOrderId", (q) =>
        q.eq("externalOrderId", args.externalOrderId)
      )
      .unique();
  },
});

/**
 * Get order by Temporal workflow ID
 */
export const getByWorkflowId = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_temporalWorkflowId", (q) =>
        q.eq("temporalWorkflowId", args.workflowId)
      )
      .unique();
  },
});

/**
 * Get order history for an asset
 */
export const getHistoryByAsset = query({
  args: {
    userId: v.id("users"),
    assetId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("orders")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetId", args.assetId)
      )
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new order
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    assetType: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    assetId: v.string(),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    orderType: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop"),
      v.literal("stop_limit")
    ),
    quantity: v.number(),
    limitPrice: v.optional(v.number()),
    stopPrice: v.optional(v.number()),
    temporalWorkflowId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate order parameters
    if (args.orderType === "limit" && !args.limitPrice) {
      throw new Error("Limit price required for limit orders");
    }
    if (
      (args.orderType === "stop" || args.orderType === "stop_limit") &&
      !args.stopPrice
    ) {
      throw new Error("Stop price required for stop orders");
    }

    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      assetType: args.assetType,
      assetId: args.assetId,
      symbol: args.symbol,
      side: args.side,
      orderType: args.orderType,
      quantity: args.quantity,
      limitPrice: args.limitPrice,
      stopPrice: args.stopPrice,
      status: "pending",
      filledQuantity: 0,
      remainingQuantity: args.quantity,
      avgFillPrice: 0,
      fees: 0,
      feesCurrency: "USD",
      temporalWorkflowId: args.temporalWorkflowId,
      createdAt: now,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "user",
      action: "order_created",
      category: "trading",
      resourceType: "order",
      resourceId: orderId,
      description: `${args.side.toUpperCase()} ${args.quantity} ${args.symbol}`,
      metadata: {
        assetType: args.assetType,
        assetId: args.assetId,
        side: args.side,
        orderType: args.orderType,
        quantity: args.quantity,
        limitPrice: args.limitPrice,
      },
      temporalWorkflowId: args.temporalWorkflowId,
      timestamp: now,
    });

    return orderId;
  },
});

/**
 * Update order status
 */
export const updateStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("partial"),
      v.literal("filled"),
      v.literal("cancelled"),
      v.literal("rejected"),
      v.literal("expired"),
      v.literal("failed")
    ),
    externalOrderId: v.optional(v.string()),
    executionVenue: v.optional(v.string()),
    filledQuantity: v.optional(v.number()),
    avgFillPrice: v.optional(v.number()),
    fees: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.externalOrderId) {
      updates.externalOrderId = args.externalOrderId;
    }
    if (args.executionVenue) {
      updates.executionVenue = args.executionVenue;
    }
    if (args.filledQuantity !== undefined) {
      updates.filledQuantity = args.filledQuantity;
      updates.remainingQuantity = order.quantity - args.filledQuantity;
    }
    if (args.avgFillPrice !== undefined) {
      updates.avgFillPrice = args.avgFillPrice;
    }
    if (args.fees !== undefined) {
      updates.fees = args.fees;
    }

    // Set status-specific timestamps
    if (args.status === "submitted" && !order.submittedAt) {
      updates.submittedAt = now;
    }
    if (args.status === "filled") {
      updates.filledAt = now;
    }
    if (args.status === "cancelled") {
      updates.cancelledAt = now;
    }

    await ctx.db.patch(args.orderId, updates);

    // Log status change
    await ctx.db.insert("auditLog", {
      userId: order.userId,
      actorType: "system",
      action: "order_status_updated",
      category: "trading",
      resourceType: "order",
      resourceId: args.orderId,
      description: `Order status: ${order.status} -> ${args.status}`,
      previousState: { status: order.status },
      newState: { status: args.status },
      metadata: {
        filledQuantity: args.filledQuantity,
        avgFillPrice: args.avgFillPrice,
      },
      temporalWorkflowId: order.temporalWorkflowId,
      timestamp: now,
    });

    return true;
  },
});

/**
 * Record a trade execution
 */
export const recordTrade = internalMutation({
  args: {
    orderId: v.id("orders"),
    quantity: v.number(),
    price: v.number(),
    fees: v.number(),
    externalTradeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    // Create trade record
    const tradeId = await ctx.db.insert("trades", {
      orderId: args.orderId,
      userId: order.userId,
      assetId: order.assetId,
      side: order.side,
      quantity: args.quantity,
      price: args.price,
      value: args.quantity * args.price,
      fees: args.fees,
      settlementStatus: "pending",
      externalTradeId: args.externalTradeId,
      executedAt: now,
    });

    // Update order with new fill information
    const newFilledQuantity = order.filledQuantity + args.quantity;
    const totalValue = order.avgFillPrice * order.filledQuantity + args.price * args.quantity;
    const newAvgPrice = totalValue / newFilledQuantity;

    await ctx.db.patch(args.orderId, {
      filledQuantity: newFilledQuantity,
      remainingQuantity: order.quantity - newFilledQuantity,
      avgFillPrice: newAvgPrice,
      fees: order.fees + args.fees,
      status: newFilledQuantity >= order.quantity ? "filled" : "partial",
      filledAt: newFilledQuantity >= order.quantity ? now : undefined,
      updatedAt: now,
    });

    return tradeId;
  },
});

/**
 * Cancel an order
 */
export const cancel = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    // Only allow cancellation of pending/submitted/partial orders
    if (!["pending", "submitted", "partial"].includes(order.status)) {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    const now = Date.now();

    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    // Log cancellation
    await ctx.db.insert("auditLog", {
      userId: order.userId,
      actorType: "user",
      action: "order_cancelled",
      category: "trading",
      resourceType: "order",
      resourceId: args.orderId,
      description: `Order cancelled${args.reason ? `: ${args.reason}` : ""}`,
      metadata: {
        reason: args.reason,
        filledQuantity: order.filledQuantity,
      },
      temporalWorkflowId: order.temporalWorkflowId,
      timestamp: now,
    });

    return true;
  },
});

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

export const getByIdInternal = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

export const getRecentInternal = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
  },
});
