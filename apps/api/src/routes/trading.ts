import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { parseIntSafe } from "../utils/validation";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

const createOrderSchema = z.object({
  assetClass: z.enum(["crypto", "prediction", "rwa"]),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("gtc"),
  clientOrderId: z.string().optional(),
  expiresAt: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const getOrdersQuerySchema = z.object({
  status: z
    .enum([
      "pending",
      "submitted",
      "accepted",
      "partial_fill",
      "filled",
      "cancelled",
      "rejected",
      "expired",
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * Helper function to validate userId and return appropriate error response
 */
function requireUserId(c: any): { userId: Id<"users"> } | null {
  const userId = c.get("userId");

  if (!userId) {
    return null;
  }

  return { userId: userId as Id<"users"> };
}

/**
 * Create a new order
 */
app.post("/orders", zValidator("json", createOrderSchema), async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  const body = c.req.valid("json");

  try {
    // Validate order type requirements
    if (body.type === "limit" && !body.price) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Limit orders require a price",
          },
        },
        400
      );
    }

    if (
      (body.type === "stop" || body.type === "stop_limit") &&
      !body.stopPrice
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Stop orders require a stop price",
          },
        },
        400
      );
    }

    // Create order in Convex
    const orderId = await convex.mutation(api.orders.create, {
      userId: auth.userId,
      assetClass: body.assetClass,
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      price: body.price,
      stopPrice: body.stopPrice,
      timeInForce: body.timeInForce,
      clientOrderId: body.clientOrderId,
      expiresAt: body.expiresAt,
      metadata: body.metadata,
    });

    // TODO: Start Temporal workflow for order execution
    // const workflowId = await temporalClient.workflow.start(executeOrder, {
    //   taskQueue: "trading",
    //   workflowId: `order-${orderId}`,
    //   args: [{ orderId, userId: auth.userId }],
    // });

    // Fetch the created order to return full details
    const order = await convex.query(api.orders.getById, { id: orderId });

    return c.json({
      success: true,
      data: {
        id: orderId,
        ...order,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create order";

    // Check for specific error types
    if (
      message.includes("Insufficient buying power") ||
      message.includes("Insufficient position")
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "INSUFFICIENT_FUNDS",
            message,
          },
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: "ORDER_CREATION_FAILED",
          message,
        },
      },
      500
    );
  }
});

/**
 * Get orders for user
 */
app.get("/orders", zValidator("query", getOrdersQuerySchema), async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  const query = c.req.valid("query");

  try {
    let orders;
    let total: number;

    if (query.status) {
      // Use getByStatus when filtering by status
      orders = await convex.query(api.orders.getByStatus, {
        userId: auth.userId,
        status: query.status,
        limit: query.limit,
      });
      total = orders.length;
    } else {
      // Use getOrderHistory for general queries with pagination
      const result = await convex.query(api.orders.getOrderHistory, {
        userId: auth.userId,
        limit: query.limit,
        offset: query.offset,
      });
      orders = result.orders;
      total = result.total;
    }

    const pageSize = query.limit;
    const currentPage = Math.floor(query.offset / pageSize) + 1;
    const totalPages = Math.ceil(total / pageSize);

    return c.json({
      success: true,
      data: orders,
      pagination: {
        page: currentPage,
        pageSize,
        totalItems: total,
        totalPages,
        hasNextPage: query.offset + pageSize < total,
        hasPreviousPage: query.offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch orders";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
      },
      500
    );
  }
});

/**
 * Get order by ID
 */
app.get("/orders/:orderId", async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  const orderId = c.req.param("orderId") as Id<"orders">;

  try {
    // Fetch order with fills
    const orderWithFills = await convex.query(api.orders.getOrderWithFills, {
      orderId,
    });

    if (!orderWithFills) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
        },
        404
      );
    }

    // Verify user owns the order
    if (orderWithFills.userId !== auth.userId) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this order",
          },
        },
        403
      );
    }

    return c.json({
      success: true,
      data: orderWithFills,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch order";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
      },
      500
    );
  }
});

/**
 * Cancel order
 */
app.delete("/orders/:orderId", async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  const orderId = c.req.param("orderId") as Id<"orders">;

  try {
    // First fetch the order to verify ownership
    const order = await convex.query(api.orders.getById, { id: orderId });

    if (!order) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
        },
        404
      );
    }

    // Verify user owns the order
    if (order.userId !== auth.userId) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this order",
          },
        },
        403
      );
    }

    // Cancel the order
    await convex.mutation(api.orders.cancel, {
      id: orderId,
      reason: "User requested cancellation",
    });

    // Fetch updated order
    const cancelledOrder = await convex.query(api.orders.getById, {
      id: orderId,
    });

    return c.json({
      success: true,
      data: {
        id: orderId,
        ...cancelledOrder,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel order";

    // Check for specific error types
    if (message.includes("cannot be cancelled")) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_STATE",
            message,
          },
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: "CANCEL_FAILED",
          message,
        },
      },
      500
    );
  }
});

/**
 * Get portfolio positions
 */
app.get("/portfolio", async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Optional asset class filter
  const assetClassParam = c.req.query("assetClass") as
    | "crypto"
    | "prediction"
    | "rwa"
    | undefined;

  try {
    // Get portfolio positions from Convex
    const portfolio = await convex.query(api.positions.getPortfolioPositions, {
      userId: auth.userId,
      assetClass: assetClassParam,
    });

    return c.json({
      success: true,
      data: {
        positions: portfolio.positions,
        summary: {
          totalValue: portfolio.summary.totalValue,
          totalCost: portfolio.summary.totalCost,
          totalUnrealizedPnL: portfolio.summary.totalUnrealizedPnL,
          totalRealizedPnL: portfolio.summary.totalRealizedPnL,
          totalPnLPercent: portfolio.summary.totalPnLPercent,
          positionCount: portfolio.summary.positionCount,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch portfolio";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
      },
      500
    );
  }
});

/**
 * Get buying power
 */
app.get("/buying-power", async (c) => {
  const auth = requireUserId(c);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    // Get buying power from Convex
    const buyingPower = await convex.query(api.balances.getBuyingPower, {
      userId: auth.userId,
    });

    return c.json({
      success: true,
      data: {
        available: buyingPower.available,
        held: buyingPower.held,
        pending: buyingPower.pending,
        total: buyingPower.total,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch buying power";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
      },
      500
    );
  }
});

export { app as tradingRoutes };
