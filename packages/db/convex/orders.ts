import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, authenticatedMutation, systemMutation } from "./lib/auth";

/**
 * Order queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get order by ID
 * Only returns the order if it belongs to the authenticated user.
 */
export const getById = authenticatedQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) return null;
    if (order.userId !== (ctx.userId as Id<"users">)) return null;
    return order;
  },
});

/**
 * Get orders by user
 */
export const getByUser = authenticatedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get open orders for user
 */
export const getOpenOrders = authenticatedQuery({
  args: {},
  handler: async (ctx, _args) => {
    const userId = ctx.userId as Id<"users">;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return orders.filter((o) =>
      ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
    );
  },
});

/**
 * Get orders by status
 */
export const getByStatus = authenticatedQuery({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("accepted"),
      v.literal("partial_fill"),
      v.literal("filled"),
      v.literal("cancelled"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("orders")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", args.status)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get order history with filters
 */
export const getOrderHistory = authenticatedQuery({
  args: {
    assetClass: v.optional(
      v.union(v.literal("crypto"), v.literal("prediction"), v.literal("rwa"))
    ),
    symbol: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    let orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Apply filters
    if (args.assetClass) {
      orders = orders.filter((o) => o.assetClass === args.assetClass);
    }
    if (args.symbol) {
      orders = orders.filter((o) => o.symbol === args.symbol);
    }
    if (args.startDate) {
      orders = orders.filter((o) => o.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      orders = orders.filter((o) => o.createdAt <= args.endDate!);
    }

    const total = orders.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    return {
      orders: orders.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get order with fills
 * Verifies the order belongs to the authenticated user.
 */
export const getOrderWithFills = authenticatedQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    if (order.userId !== userId) return null;

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return {
      ...order,
      fills: trades,
    };
  },
});

/**
 * Get order by external ID
 * System-only: used by internal services to look up orders by external ID.
 */
export const getByExternalId = systemMutation({
  args: { externalOrderId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_external", (q) =>
        q.eq("externalOrderId", args.externalOrderId)
      )
      .unique();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new order
 */
export const create = authenticatedMutation({
  args: {
    clientOrderId: v.optional(v.string()),
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    type: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop"),
      v.literal("stop_limit")
    ),
    quantity: v.number(),
    price: v.optional(v.number()),
    stopPrice: v.optional(v.number()),
    timeInForce: v.union(
      v.literal("day"),
      v.literal("gtc"),
      v.literal("ioc"),
      v.literal("fok")
    ),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate order parameters
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    if (args.type === "limit" && !args.price) {
      throw new Error("Limit orders require a price");
    }

    if ((args.type === "stop" || args.type === "stop_limit") && !args.stopPrice) {
      throw new Error("Stop orders require a stop price");
    }

    // Market orders MUST have a price for buy orders to prevent $0 holds
    if (args.type === "market" && args.side === "buy" && !args.price) {
      throw new Error("Market buy orders require an estimated price");
    }

    // Calculate estimated cost for buys
    let estimatedCost = 0;
    if (args.side === "buy") {
      const priceToUse = args.price ?? args.stopPrice;
      if (!priceToUse || priceToUse <= 0) {
        throw new Error("Buy orders require a valid price for fund holding");
      }
      estimatedCost = args.quantity * priceToUse;

      // Check buying power
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (!balance || balance.available < estimatedCost) {
        throw new Error("Insufficient buying power");
      }

      // Place hold on funds
      await ctx.db.patch(balance._id, {
        available: balance.available - estimatedCost,
        held: balance.held + estimatedCost,
        updatedAt: now,
      });
    } else {
      // For sells, check position AND lock it (prevent double-spend)
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", userId)
            .eq("assetClass", args.assetClass)
            .eq("symbol", args.symbol)
        )
        .unique();

      if (!position || position.quantity < args.quantity) {
        throw new Error("Insufficient position to sell");
      }

      // Check for existing open sell orders on this position to prevent double-spend
      const openSellOrders = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const pendingSellQuantity = openSellOrders
        .filter(
          (o) =>
            o.symbol === args.symbol &&
            o.assetClass === args.assetClass &&
            o.side === "sell" &&
            ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
        )
        .reduce((sum, o) => sum + o.remainingQuantity, 0);

      if (position.quantity - pendingSellQuantity < args.quantity) {
        throw new Error("Insufficient available position (shares already committed to pending sell orders)");
      }
    }

    const orderId = await ctx.db.insert("orders", {
      userId,
      clientOrderId: args.clientOrderId,
      assetClass: args.assetClass,
      symbol: args.symbol,
      side: args.side,
      type: args.type,
      status: "pending",
      quantity: args.quantity,
      filledQuantity: 0,
      remainingQuantity: args.quantity,
      price: args.price,
      stopPrice: args.stopPrice,
      timeInForce: args.timeInForce,
      fees: 0,
      feeCurrency: "USD",
      metadata: args.metadata,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "order.created",
      resourceType: "orders",
      resourceId: orderId,
      metadata: {
        symbol: args.symbol,
        side: args.side,
        type: args.type,
        quantity: args.quantity,
        price: args.price,
      },
      timestamp: now,
    });

    return orderId;
  },
});

/**
 * Update order status
 * System-only: called by the trading engine, not directly by users.
 */
export const update = mutation({
  args: {
    id: v.id("orders"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("submitted"),
        v.literal("accepted"),
        v.literal("partial_fill"),
        v.literal("filled"),
        v.literal("cancelled"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
    externalOrderId: v.optional(v.string()),
    filledQuantity: v.optional(v.number()),
    averageFilledPrice: v.optional(v.number()),
    fees: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { id, ...updates } = args;

    const order = await ctx.db.get(id);
    if (!order) {
      throw new Error("Order not found");
    }

    const patchData: Record<string, unknown> = { updatedAt: now };

    if (updates.status) {
      patchData.status = updates.status;
      if (updates.status === "submitted") {
        patchData.submittedAt = now;
      } else if (updates.status === "filled") {
        patchData.filledAt = now;
      } else if (updates.status === "cancelled") {
        patchData.cancelledAt = now;
      }
    }

    if (updates.externalOrderId) {
      patchData.externalOrderId = updates.externalOrderId;
    }

    if (updates.filledQuantity !== undefined) {
      patchData.filledQuantity = updates.filledQuantity;
      patchData.remainingQuantity = order.quantity - updates.filledQuantity;
    }

    if (updates.averageFilledPrice !== undefined) {
      patchData.averageFilledPrice = updates.averageFilledPrice;
    }

    if (updates.fees !== undefined) {
      patchData.fees = updates.fees;
    }

    await ctx.db.patch(id, patchData);

    await ctx.db.insert("auditLog", {
      userId: order.userId,
      action: "order.updated",
      resourceType: "orders",
      resourceId: id,
      changes: updates,
      timestamp: now,
    });

    return id;
  },
});

/**
 * Cancel order
 * Verifies the order belongs to the authenticated user before cancelling.
 */
export const cancel = authenticatedMutation({
  args: {
    id: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    const order = await ctx.db.get(args.id);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== userId) {
      throw new Error("Not authorized to cancel this order");
    }

    if (!["pending", "submitted", "accepted", "partial_fill"].includes(order.status)) {
      throw new Error("Order cannot be cancelled");
    }

    // Release held funds for buy orders
    if (order.side === "buy" && order.remainingQuantity > 0) {
      const holdAmount =
        order.remainingQuantity * (order.price ?? order.stopPrice ?? 0);

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetType", "usd")
            .eq("assetId", "USD")
        )
        .unique();

      if (balance) {
        await ctx.db.patch(balance._id, {
          available: balance.available + holdAmount,
          held: Math.max(0, balance.held - holdAmount),
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      metadata: {
        ...order.metadata,
        cancellationReason: args.reason,
      },
    });

    await ctx.db.insert("auditLog", {
      userId: order.userId,
      action: "order.cancelled",
      resourceType: "orders",
      resourceId: args.id,
      metadata: { reason: args.reason },
      timestamp: now,
    });

    return args.id;
  },
});

/**
 * Record a trade/fill
 * System-only: called by the trading engine, not directly by users.
 */
export const recordTrade = mutation({
  args: {
    orderId: v.id("orders"),
    externalTradeId: v.optional(v.string()),
    quantity: v.number(),
    price: v.number(),
    fee: v.number(),
    liquidity: v.union(v.literal("maker"), v.literal("taker")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const notionalValue = args.quantity * args.price;

    // Record the trade
    const tradeId = await ctx.db.insert("trades", {
      orderId: args.orderId,
      userId: order.userId,
      externalTradeId: args.externalTradeId,
      symbol: order.symbol,
      side: order.side,
      quantity: args.quantity,
      price: args.price,
      notionalValue,
      fee: args.fee,
      feeCurrency: "USD",
      liquidity: args.liquidity,
      executedAt: now,
      settlementStatus: "pending",
    });

    // Update order
    const newFilledQuantity = order.filledQuantity + args.quantity;
    const isFullyFilled = newFilledQuantity >= order.quantity;

    // Calculate new average price
    const totalFilled =
      order.filledQuantity * (order.averageFilledPrice ?? 0) +
      args.quantity * args.price;
    const newAvgPrice = totalFilled / newFilledQuantity;

    await ctx.db.patch(args.orderId, {
      status: isFullyFilled ? "filled" : "partial_fill",
      filledQuantity: newFilledQuantity,
      remainingQuantity: order.quantity - newFilledQuantity,
      averageFilledPrice: newAvgPrice,
      fees: order.fees + args.fee,
      filledAt: isFullyFilled ? now : undefined,
      updatedAt: now,
    });

    // Update balances and positions
    if (order.side === "buy") {
      // Release hold and debit actual cost
      const actualCost = notionalValue + args.fee;
      const estimatedCost = args.quantity * (order.price ?? order.stopPrice ?? args.price);

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetType", "usd")
            .eq("assetId", "USD")
        )
        .unique();

      if (balance) {
        const refund = Math.max(0, estimatedCost - actualCost);
        await ctx.db.patch(balance._id, {
          held: Math.max(0, balance.held - estimatedCost),
          available: balance.available + refund,
          updatedAt: now,
        });
      }

      // Update or create position
      let position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetClass", order.assetClass)
            .eq("symbol", order.symbol)
        )
        .unique();

      if (position) {
        const newQuantity = position.quantity + args.quantity;
        const newCostBasis = position.costBasis + notionalValue;
        const newAvgEntry = newCostBasis / newQuantity;

        await ctx.db.patch(position._id, {
          quantity: newQuantity,
          averageEntryPrice: newAvgEntry,
          costBasis: newCostBasis,
          currentPrice: args.price,
          unrealizedPnL:
            newQuantity * args.price - newCostBasis,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("positions", {
          userId: order.userId,
          assetClass: order.assetClass,
          symbol: order.symbol,
          side: "long",
          quantity: args.quantity,
          averageEntryPrice: args.price,
          currentPrice: args.price,
          costBasis: notionalValue,
          unrealizedPnL: 0,
          realizedPnL: 0,
          openedAt: now,
          updatedAt: now,
        });
      }
    } else {
      // Sell - credit proceeds and reduce position
      const proceeds = notionalValue - args.fee;

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
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

      // Update position
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetClass", order.assetClass)
            .eq("symbol", order.symbol)
        )
        .unique();

      if (position) {
        const newQuantity = position.quantity - args.quantity;
        const soldCostBasis =
          (args.quantity / position.quantity) * position.costBasis;
        const realizedPnL = notionalValue - soldCostBasis;

        if (newQuantity <= 0) {
          await ctx.db.delete(position._id);
        } else {
          await ctx.db.patch(position._id, {
            quantity: newQuantity,
            costBasis: position.costBasis - soldCostBasis,
            currentPrice: args.price,
            unrealizedPnL:
              newQuantity * args.price -
              (position.costBasis - soldCostBasis),
            realizedPnL: position.realizedPnL + realizedPnL,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.insert("auditLog", {
      userId: order.userId,
      action: "trade.executed",
      resourceType: "trades",
      resourceId: tradeId,
      metadata: {
        orderId: args.orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: args.quantity,
        price: args.price,
        notionalValue,
      },
      timestamp: now,
    });

    return tradeId;
  },
});

/**
 * Fill order - authenticated user order fill (e.g., for instant execution)
 * This is a convenience wrapper that creates a trade record.
 */
export const fillOrder = authenticatedMutation({
  args: {
    orderId: v.id("orders"),
    quantity: v.number(),
    price: v.number(),
    fee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate inputs
    if (args.quantity <= 0) {
      throw new Error("Fill quantity must be positive");
    }
    if (args.price <= 0) {
      throw new Error("Fill price must be positive");
    }

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Verify ownership
    if (order.userId !== userId) {
      throw new Error("Not authorized to fill this order");
    }

    // Verify order can be filled
    if (!["pending", "submitted", "accepted", "partial_fill"].includes(order.status)) {
      throw new Error("Order cannot be filled in current status: " + order.status);
    }

    // Verify fill quantity doesn't exceed remaining
    if (args.quantity > order.remainingQuantity) {
      throw new Error("Fill quantity exceeds remaining order quantity");
    }

    const fee = args.fee ?? 0;
    const notionalValue = args.quantity * args.price;

    // Record the trade
    const tradeId = await ctx.db.insert("trades", {
      orderId: args.orderId,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      quantity: args.quantity,
      price: args.price,
      notionalValue,
      fee,
      feeCurrency: "USD",
      liquidity: "taker",
      executedAt: now,
      settlementStatus: "pending",
    });

    // Update order
    const newFilledQuantity = order.filledQuantity + args.quantity;
    const isFullyFilled = newFilledQuantity >= order.quantity;

    // Calculate new average price
    const totalFilled =
      order.filledQuantity * (order.averageFilledPrice ?? 0) +
      args.quantity * args.price;
    const newAvgPrice = totalFilled / newFilledQuantity;

    await ctx.db.patch(args.orderId, {
      status: isFullyFilled ? "filled" : "partial_fill",
      filledQuantity: newFilledQuantity,
      remainingQuantity: order.quantity - newFilledQuantity,
      averageFilledPrice: newAvgPrice,
      fees: order.fees + fee,
      filledAt: isFullyFilled ? now : undefined,
      updatedAt: now,
    });

    // Update balances and positions
    if (order.side === "buy") {
      // Release hold and debit actual cost
      const actualCost = notionalValue + fee;
      const estimatedCost = args.quantity * (order.price ?? order.stopPrice ?? args.price);

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetType", "usd")
            .eq("assetId", "USD")
        )
        .unique();

      if (balance) {
        const refund = Math.max(0, estimatedCost - actualCost);
        await ctx.db.patch(balance._id, {
          held: Math.max(0, balance.held - estimatedCost),
          available: balance.available + refund,
          updatedAt: now,
        });
      }

      // Update or create position
      let position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetClass", order.assetClass)
            .eq("symbol", order.symbol)
        )
        .unique();

      if (position) {
        const newQuantity = position.quantity + args.quantity;
        const newCostBasis = position.costBasis + notionalValue;
        const newAvgEntry = newCostBasis / newQuantity;

        await ctx.db.patch(position._id, {
          quantity: newQuantity,
          averageEntryPrice: newAvgEntry,
          costBasis: newCostBasis,
          currentPrice: args.price,
          unrealizedPnL: newQuantity * args.price - newCostBasis,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("positions", {
          userId: order.userId,
          assetClass: order.assetClass,
          symbol: order.symbol,
          side: "long",
          quantity: args.quantity,
          averageEntryPrice: args.price,
          currentPrice: args.price,
          costBasis: notionalValue,
          unrealizedPnL: 0,
          realizedPnL: 0,
          openedAt: now,
          updatedAt: now,
        });
      }
    } else {
      // Sell - credit proceeds and reduce position
      const proceeds = notionalValue - fee;

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
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

      // Update position
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetClass", order.assetClass)
            .eq("symbol", order.symbol)
        )
        .unique();

      if (position) {
        const newQuantity = position.quantity - args.quantity;
        const soldCostBasis =
          (args.quantity / position.quantity) * position.costBasis;
        const realizedPnL = notionalValue - soldCostBasis;

        if (newQuantity <= 0) {
          await ctx.db.delete(position._id);
        } else {
          await ctx.db.patch(position._id, {
            quantity: newQuantity,
            costBasis: position.costBasis - soldCostBasis,
            currentPrice: args.price,
            unrealizedPnL:
              newQuantity * args.price - (position.costBasis - soldCostBasis),
            realizedPnL: position.realizedPnL + realizedPnL,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.insert("auditLog", {
      userId: order.userId,
      action: "order.filled",
      resourceType: "trades",
      resourceId: tradeId,
      metadata: {
        orderId: args.orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: args.quantity,
        price: args.price,
        notionalValue,
        isFullyFilled,
      },
      timestamp: now,
    });

    return {
      tradeId,
      orderId: args.orderId,
      filledQuantity: newFilledQuantity,
      remainingQuantity: order.quantity - newFilledQuantity,
      averageFilledPrice: newAvgPrice,
      status: isFullyFilled ? "filled" : "partial_fill",
    };
  },
});

/**
 * Get all orders for the authenticated user with optional filters
 */
export const getOrders = authenticatedQuery({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("submitted"),
        v.literal("accepted"),
        v.literal("partial_fill"),
        v.literal("filled"),
        v.literal("cancelled"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
    assetClass: v.optional(
      v.union(v.literal("crypto"), v.literal("prediction"), v.literal("rwa"))
    ),
    symbol: v.optional(v.string()),
    side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;

    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    } else {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    }

    // Apply additional filters
    if (args.assetClass) {
      orders = orders.filter((o) => o.assetClass === args.assetClass);
    }
    if (args.symbol) {
      orders = orders.filter((o) => o.symbol === args.symbol);
    }
    if (args.side) {
      orders = orders.filter((o) => o.side === args.side);
    }

    const total = orders.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    return {
      orders: orders.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get order by ID - alias for getById with explicit naming
 */
export const getOrderById = authenticatedQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    if (order.userId !== (ctx.userId as Id<"users">)) return null;
    return order;
  },
});

/**
 * Cancel order - alias for cancel with explicit naming
 */
export const cancelOrder = authenticatedMutation({
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== userId) {
      throw new Error("Not authorized to cancel this order");
    }

    if (!["pending", "submitted", "accepted", "partial_fill"].includes(order.status)) {
      throw new Error("Order cannot be cancelled in current status: " + order.status);
    }

    // Release held funds for buy orders
    if (order.side === "buy" && order.remainingQuantity > 0) {
      const holdAmount =
        order.remainingQuantity * (order.price ?? order.stopPrice ?? 0);

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", order.userId)
            .eq("assetType", "usd")
            .eq("assetId", "USD")
        )
        .unique();

      if (balance && holdAmount > 0) {
        await ctx.db.patch(balance._id, {
          available: balance.available + holdAmount,
          held: Math.max(0, balance.held - holdAmount),
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      metadata: {
        ...order.metadata,
        cancellationReason: args.reason,
      },
    });

    await ctx.db.insert("auditLog", {
      userId: order.userId,
      action: "order.cancelled",
      resourceType: "orders",
      resourceId: args.orderId,
      metadata: {
        reason: args.reason,
        releasedHold: order.side === "buy" ? order.remainingQuantity * (order.price ?? order.stopPrice ?? 0) : 0,
      },
      timestamp: now,
    });

    return {
      orderId: args.orderId,
      status: "cancelled",
      cancelledAt: now,
    };
  },
});

/**
 * Create order - alias for create with explicit naming
 */
export const createOrder = authenticatedMutation({
  args: {
    clientOrderId: v.optional(v.string()),
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    type: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop"),
      v.literal("stop_limit")
    ),
    quantity: v.number(),
    price: v.optional(v.number()),
    stopPrice: v.optional(v.number()),
    timeInForce: v.union(
      v.literal("day"),
      v.literal("gtc"),
      v.literal("ioc"),
      v.literal("fok")
    ),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate order parameters
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    if (args.type === "limit" && !args.price) {
      throw new Error("Limit orders require a price");
    }

    if ((args.type === "stop" || args.type === "stop_limit") && !args.stopPrice) {
      throw new Error("Stop orders require a stop price");
    }

    // Market orders MUST have a price for buy orders to prevent $0 holds
    if (args.type === "market" && args.side === "buy" && !args.price) {
      throw new Error("Market buy orders require an estimated price");
    }

    // Validate price is positive if provided
    if (args.price !== undefined && args.price <= 0) {
      throw new Error("Price must be positive");
    }

    if (args.stopPrice !== undefined && args.stopPrice <= 0) {
      throw new Error("Stop price must be positive");
    }

    // Calculate estimated cost for buys
    let estimatedCost = 0;
    if (args.side === "buy") {
      const priceToUse = args.price ?? args.stopPrice;
      if (!priceToUse || priceToUse <= 0) {
        throw new Error("Buy orders require a valid price for fund holding");
      }
      estimatedCost = args.quantity * priceToUse;

      // Check buying power
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (!balance || balance.available < estimatedCost) {
        throw new Error(
          `Insufficient buying power. Required: $${estimatedCost.toFixed(2)}, Available: $${(balance?.available ?? 0).toFixed(2)}`
        );
      }

      // Place hold on funds
      await ctx.db.patch(balance._id, {
        available: balance.available - estimatedCost,
        held: balance.held + estimatedCost,
        updatedAt: now,
      });
    } else {
      // For sells, check position AND lock it (prevent double-spend)
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", userId)
            .eq("assetClass", args.assetClass)
            .eq("symbol", args.symbol)
        )
        .unique();

      if (!position || position.quantity < args.quantity) {
        throw new Error(
          `Insufficient position to sell. Requested: ${args.quantity}, Available: ${position?.quantity ?? 0}`
        );
      }

      // Check for existing open sell orders on this position to prevent double-spend
      const openSellOrders = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const pendingSellQuantity = openSellOrders
        .filter(
          (o) =>
            o.symbol === args.symbol &&
            o.assetClass === args.assetClass &&
            o.side === "sell" &&
            ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
        )
        .reduce((sum, o) => sum + o.remainingQuantity, 0);

      if (position.quantity - pendingSellQuantity < args.quantity) {
        throw new Error(
          `Insufficient available position. Total: ${position.quantity}, Pending sells: ${pendingSellQuantity}, Available: ${position.quantity - pendingSellQuantity}`
        );
      }
    }

    const orderId = await ctx.db.insert("orders", {
      userId,
      clientOrderId: args.clientOrderId,
      assetClass: args.assetClass,
      symbol: args.symbol,
      side: args.side,
      type: args.type,
      status: "pending",
      quantity: args.quantity,
      filledQuantity: 0,
      remainingQuantity: args.quantity,
      price: args.price,
      stopPrice: args.stopPrice,
      timeInForce: args.timeInForce,
      fees: 0,
      feeCurrency: "USD",
      metadata: args.metadata,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "order.created",
      resourceType: "orders",
      resourceId: orderId,
      metadata: {
        symbol: args.symbol,
        side: args.side,
        type: args.type,
        quantity: args.quantity,
        price: args.price,
        estimatedCost: args.side === "buy" ? estimatedCost : undefined,
      },
      timestamp: now,
    });

    return {
      orderId,
      status: "pending",
      estimatedCost: args.side === "buy" ? estimatedCost : undefined,
    };
  },
});
