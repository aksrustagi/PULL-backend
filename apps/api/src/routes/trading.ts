import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { getConvexClient } from "../lib/convex";
import { api } from "@pull/db/convex/_generated/api";
import { toUserId, toOrderId } from "../lib/convex-types";

const app = new Hono<Env>();

const createOrderSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9_.-]+$/),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]),
  quantity: z.number().positive().max(1000000),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("gtc"),
  assetClass: z.enum(["crypto", "prediction", "rwa"]).default("prediction"),
  clientOrderId: z.string().max(64).optional(),
}).refine(
  (data) => {
    if (data.type === "limit" || data.type === "stop_limit") return data.price !== undefined;
    if (data.type === "stop" || data.type === "stop_limit") return data.stopPrice !== undefined;
    return true;
  },
  { message: "Limit orders require price, stop orders require stopPrice" }
);

/**
 * Create a new order
 */
app.post("/orders", zValidator("json", createOrderSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    // Create order via Convex
    const result = await convex.mutation(api.orders.createOrder, {
      userId: toUserId(userId),
      assetClass: body.assetClass,
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      price: body.price,
      stopPrice: body.stopPrice,
      timeInForce: body.timeInForce,
      clientOrderId: body.clientOrderId,
    });

    return c.json({
      success: true,
      data: {
        orderId: result.orderId,
        status: result.status,
        estimatedCost: result.estimatedCost,
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        timeInForce: body.timeInForce,
        createdAt: new Date().toISOString(),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    return c.json(
      {
        success: false,
        error: { code: "ORDER_FAILED", message },
        requestId,
      },
      400
    );
  }
});

/**
 * Get orders for user
 */
app.get("/orders", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status") as "pending" | "submitted" | "accepted" | "partial_fill" | "filled" | "cancelled" | "rejected" | "expired" | undefined;
  const assetClass = c.req.query("assetClass") as "crypto" | "prediction" | "stock" | "rwa" | undefined;
  const symbol = c.req.query("symbol");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query(api.orders.getOrders, {
      status,
      assetClass,
      symbol,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result.orders,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch orders";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Get order by ID
 */
app.get("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const order = await convex.query(api.orders.getOrderById, {
      orderId: toOrderId(orderId),
    });

    if (!order) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Order not found" },
          requestId,
        },
        404
      );
    }

    return c.json({
      success: true,
      data: order,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Cancel order
 */
app.delete("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const reason = c.req.query("reason");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const result = await convex.mutation(api.orders.cancelOrder, {
      orderId: toOrderId(orderId),
      reason,
    });

    return c.json({
      success: true,
      data: {
        orderId: result.orderId,
        status: result.status,
        cancelledAt: result.cancelledAt,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel order";
    return c.json(
      {
        success: false,
        error: { code: "CANCEL_FAILED", message },
        requestId,
      },
      400
    );
  }
});

/**
 * Get order with fills/trades
 */
app.get("/orders/:orderId/fills", async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const order = await convex.query(api.orders.getOrderWithFills, {
      orderId: toOrderId(orderId),
    });

    if (!order) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Order not found" },
          requestId,
        },
        404
      );
    }

    return c.json({
      success: true,
      data: order,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order fills";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Get portfolio positions
 */
app.get("/portfolio", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const positions = await convex.query(api.positions.getByUser, {});

    // Calculate summary
    let totalValue = 0;
    let totalCost = 0;
    let totalUnrealizedPnL = 0;
    let totalRealizedPnL = 0;

    for (const pos of positions) {
      totalValue += pos.quantity * pos.currentPrice;
      totalCost += pos.costBasis;
      totalUnrealizedPnL += pos.unrealizedPnL;
      totalRealizedPnL += pos.realizedPnL;
    }

    return c.json({
      success: true,
      data: {
        positions,
        summary: {
          totalValue,
          totalCost,
          totalUnrealizedPnL,
          totalRealizedPnL,
          positionCount: positions.length,
        },
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch portfolio";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Get buying power
 */
app.get("/buying-power", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const balances = await convex.query(api.balances.getByUser, {
      userId: toUserId(userId),
    });

    // Find USD balance
    const usdBalance = balances.find(
      (b: any) => b.assetType === "usd" && b.assetId === "USD"
    );

    return c.json({
      success: true,
      data: {
        available: usdBalance?.available ?? 0,
        held: usdBalance?.held ?? 0,
        pending: usdBalance?.pending ?? 0,
        total: (usdBalance?.available ?? 0) + (usdBalance?.held ?? 0) + (usdBalance?.pending ?? 0),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch buying power";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Get trade history
 */
app.get("/trades", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const trades = await convex.query(api.trades.getByUser, {
      limit,
    });

    return c.json({
      success: true,
      data: trades,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trades";
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message },
        requestId,
      },
      500
    );
  }
});

/**
 * Fill order (for instant execution)
 */
app.post("/orders/:orderId/fill", zValidator("json", z.object({
  quantity: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().min(0).optional(),
})), async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    const result = await convex.mutation(api.orders.fillOrder, {
      orderId: toOrderId(orderId),
      quantity: body.quantity,
      price: body.price,
      fee: body.fee,
    });

    return c.json({
      success: true,
      data: result,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fill order";
    return c.json(
      {
        success: false,
        error: { code: "FILL_FAILED", message },
        requestId,
      },
      400
    );
  }
});

export { app as tradingRoutes };
