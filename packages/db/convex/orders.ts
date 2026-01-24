import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Order queries and mutations for PULL
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safely get the version of an order for optimistic concurrency control
 */
function getOrderVersion(order: Record<string, unknown>): number {
  return (order.version as number | undefined) ?? 0;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get order by ID
 */
export const getById = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get orders by user
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get open orders for user
 */
export const getOpenOrders = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return orders.filter((o) =>
      ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
    );
  },
});

/**
 * Get orders by status
 */
export const getByStatus = query({
  args: {
    userId: v.id("users"),
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
    return await ctx.db
      .query("orders")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", args.status)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get order history with filters
 */
export const getOrderHistory = query({
  args: {
    userId: v.id("users"),
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
    let orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
 */
export const getOrderWithFills = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

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
 */
export const getByExternalId = query({
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
export const create = mutation({
  args: {
    userId: v.id("users"),
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

    // Calculate estimated cost for buys
    let estimatedCost = 0;
    if (args.side === "buy") {
      const priceToUse = args.price ?? args.stopPrice ?? 0;
      estimatedCost = args.quantity * priceToUse;

      // Check buying power
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", args.userId).eq("assetType", "usd").eq("assetId", "USD")
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
      // For sells, check position
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", args.userId)
            .eq("assetClass", args.assetClass)
            .eq("symbol", args.symbol)
        )
        .unique();

      if (!position || position.quantity < args.quantity) {
        throw new Error("Insufficient position to sell");
      }
    }

    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
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
      userId: args.userId,
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
 */
export const cancel = mutation({
  args: {
    id: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const order = await ctx.db.get(args.id);
    if (!order) {
      throw new Error("Order not found");
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
 * Uses optimistic concurrency control with version field to detect concurrent modifications
 */
export const recordTrade = mutation({
  args: {
    orderId: v.id("orders"),
    externalTradeId: v.optional(v.string()),
    quantity: v.number(),
    price: v.number(),
    fee: v.number(),
    liquidity: v.union(v.literal("maker"), v.literal("taker")),
    expectedVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const MAX_RETRIES = 3;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      const order = await ctx.db.get(args.orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      // Initialize version if not present (for backwards compatibility)
      const currentVersion = getOrderVersion(order as Record<string, unknown>);

      // If expectedVersion is provided, verify it matches
      if (args.expectedVersion !== undefined && args.expectedVersion !== currentVersion) {
        throw new Error(
          `Concurrent modification detected. Expected version ${args.expectedVersion}, but found ${currentVersion}. Please retry with the latest version.`
        );
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

      // Update order with version check
      const newFilledQuantity = order.filledQuantity + args.quantity;
      const isFullyFilled = newFilledQuantity >= order.quantity;

      // Calculate new average price
      const totalFilled =
        order.filledQuantity * (order.averageFilledPrice ?? 0) +
        args.quantity * args.price;
      const newAvgPrice = totalFilled / newFilledQuantity;

      // Re-fetch order to verify version hasn't changed during our processing
      const orderCheck = await ctx.db.get(args.orderId);
      if (!orderCheck) {
        // Order was deleted during processing
        throw new Error("Order was deleted during trade processing");
      }

      const checkVersion = getOrderVersion(orderCheck as Record<string, unknown>);
      if (checkVersion !== currentVersion) {
        // Version changed, another transaction modified the order
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          throw new Error(
            `Concurrent modification detected after ${MAX_RETRIES} retries. Order version changed from ${currentVersion} to ${checkVersion}. Please retry.`
          );
        }
        // Continue to retry
        continue;
      }

      await ctx.db.patch(args.orderId, {
        status: isFullyFilled ? "filled" : "partial_fill",
        filledQuantity: newFilledQuantity,
        remainingQuantity: order.quantity - newFilledQuantity,
        averageFilledPrice: newAvgPrice,
        fees: order.fees + args.fee,
        filledAt: isFullyFilled ? now : undefined,
        updatedAt: now,
        version: currentVersion + 1,
      } as Record<string, unknown>);

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
          version: currentVersion + 1,
        },
        timestamp: now,
      });

      // Successfully processed, break out of retry loop
      return tradeId;
    }

    // Should never reach here due to MAX_RETRIES check in loop
    throw new Error("Failed to record trade after maximum retries");
  },
});
