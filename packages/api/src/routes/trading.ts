/**
 * Trading Routes
 *
 * Handles order creation, cancellation, and portfolio management.
 * Integrates with Temporal for order execution workflows.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { rateLimiters } from "../middleware/rate-limit";
import { isTradeWithinLimits, getTradingLimits } from "../middleware/kyc-gate";
import type { Env, OrderResponse, PortfolioSummary } from "../types";

// =============================================================================
// SETUP
// =============================================================================

const tradingRouter = new Hono<Env>();

// Temporal client (lazy initialization)
let temporalClient: TemporalClient | null = null;

async function getTemporalClient(): Promise<TemporalClient> {
  if (!temporalClient) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    });
    temporalClient = new TemporalClient({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || "default",
    });
  }
  return temporalClient;
}

// Convex client
let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createOrderSchema = z.object({
  assetType: z.enum(["prediction", "crypto", "rwa"]),
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit", "stop", "stop_limit"]),
  quantity: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).optional().default("day"),
});

const cancelOrderSchema = z.object({
  reason: z.string().max(200).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Create a new order
 * POST /trading/orders
 */
tradingRouter.post(
  "/orders",
  rateLimiters.trading,
  zValidator("json", createOrderSchema),
  async (c) => {
    const userId = c.get("userId");
    const accountId = c.get("accountId");
    const kycTier = c.get("kycTier") as "none" | "basic" | "enhanced" | "accredited";
    const body = c.req.valid("json");

    const convex = getConvex();

    // Check trading limits
    const limits = getTradingLimits(kycTier);

    // Get user's trading activity for limit checks
    const tradingActivity = await convex.query(api.functions.trading.getDailyActivity, {
      userId: userId as any,
    });

    // Estimate order value
    const estimatedPrice = body.limitPrice || body.quantity; // Simplified; real impl would fetch price
    const orderValue = body.quantity * estimatedPrice;

    // Validate against limits
    const limitCheck = isTradeWithinLimits(
      kycTier,
      body.assetType,
      orderValue,
      tradingActivity.dailyTotal,
      tradingActivity.weeklyTotal
    );

    if (!limitCheck.allowed) {
      return c.json(
        {
          error: {
            message: limitCheck.reason,
            code: "TRADING_LIMIT_EXCEEDED",
            requestId: c.get("requestId"),
          },
        },
        403
      );
    }

    // Start order execution workflow
    const temporal = await getTemporalClient();
    const workflowId = `order-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const handle = await temporal.workflow.start("OrderExecutionWorkflow", {
      taskQueue: "trading",
      workflowId,
      args: [
        {
          userId,
          accountId,
          ...body,
        },
      ],
    });

    // Create order record in Convex
    const orderId = await convex.mutation(api.functions.orders.create, {
      userId: userId as any,
      assetType: body.assetType,
      assetId: body.assetId,
      symbol: body.symbol,
      side: body.side,
      orderType: body.orderType,
      quantity: body.quantity,
      limitPrice: body.limitPrice,
      stopPrice: body.stopPrice,
      temporalWorkflowId: workflowId,
    });

    return c.json(
      {
        data: {
          orderId,
          workflowId,
          status: "pending",
          message: "Order submitted for execution",
        },
      },
      202
    );
  }
);

/**
 * Get order by ID
 * GET /trading/orders/:orderId
 */
tradingRouter.get("/orders/:orderId", async (c) => {
  const userId = c.get("userId");
  const { orderId } = c.req.param();

  const convex = getConvex();

  const order = await convex.query(api.functions.orders.getById, {
    orderId: orderId as any,
  });

  if (!order || order.userId !== userId) {
    return c.json(
      {
        error: {
          message: "Order not found",
          code: "ORDER_NOT_FOUND",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  return c.json({
    data: formatOrderResponse(order),
  });
});

/**
 * Get order status from workflow
 * GET /trading/orders/:orderId/status
 */
tradingRouter.get("/orders/:orderId/status", async (c) => {
  const userId = c.get("userId");
  const { orderId } = c.req.param();

  const convex = getConvex();

  // Get order to find workflow ID
  const order = await convex.query(api.functions.orders.getById, {
    orderId: orderId as any,
  });

  if (!order || order.userId !== userId) {
    return c.json(
      {
        error: {
          message: "Order not found",
          code: "ORDER_NOT_FOUND",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  if (!order.temporalWorkflowId) {
    return c.json({
      data: {
        orderId,
        status: order.status,
        filledQuantity: order.filledQuantity,
        avgPrice: order.avgFillPrice,
      },
    });
  }

  // Query workflow for real-time status
  try {
    const temporal = await getTemporalClient();
    const handle = temporal.workflow.getHandle(order.temporalWorkflowId);
    const status = await handle.query("getOrderStatus");

    return c.json({
      data: status,
    });
  } catch (error) {
    // Workflow may have completed
    return c.json({
      data: {
        orderId,
        status: order.status,
        filledQuantity: order.filledQuantity,
        avgPrice: order.avgFillPrice,
      },
    });
  }
});

/**
 * Cancel an order
 * DELETE /trading/orders/:orderId
 */
tradingRouter.delete(
  "/orders/:orderId",
  zValidator("json", cancelOrderSchema.optional()),
  async (c) => {
    const userId = c.get("userId");
    const { orderId } = c.req.param();
    const body = c.req.valid("json");

    const convex = getConvex();

    // Get order
    const order = await convex.query(api.functions.orders.getById, {
      orderId: orderId as any,
    });

    if (!order || order.userId !== userId) {
      return c.json(
        {
          error: {
            message: "Order not found",
            code: "ORDER_NOT_FOUND",
            requestId: c.get("requestId"),
          },
        },
        404
      );
    }

    // Check if order can be cancelled
    if (!["pending", "submitted", "partial"].includes(order.status)) {
      return c.json(
        {
          error: {
            message: `Cannot cancel order with status: ${order.status}`,
            code: "INVALID_ORDER_STATUS",
            requestId: c.get("requestId"),
          },
        },
        400
      );
    }

    // Signal workflow to cancel if running
    if (order.temporalWorkflowId) {
      try {
        const temporal = await getTemporalClient();
        const handle = temporal.workflow.getHandle(order.temporalWorkflowId);
        await handle.signal("cancelOrder", { reason: body?.reason });
      } catch (error) {
        console.log("Workflow signal failed, updating directly:", error);
      }
    }

    // Update order status
    await convex.mutation(api.functions.orders.cancel, {
      orderId: orderId as any,
      reason: body?.reason,
    });

    return c.json({
      data: {
        orderId,
        status: "cancelled",
        message: "Order cancellation requested",
      },
    });
  }
);

/**
 * Get all orders for user
 * GET /trading/orders
 */
tradingRouter.get("/orders", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  let orders;
  if (status === "open") {
    orders = await convex.query(api.functions.orders.getOpenOrders, {
      userId: userId as any,
    });
  } else {
    orders = await convex.query(api.functions.orders.getByUser, {
      userId: userId as any,
      limit,
    });
  }

  return c.json({
    data: orders.map(formatOrderResponse),
    meta: {
      total: orders.length,
      limit,
    },
  });
});

/**
 * Get portfolio summary
 * GET /trading/portfolio
 */
tradingRouter.get("/portfolio", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const portfolio = await convex.query(api.functions.balances.getPortfolioSummary, {
    userId: userId as any,
  });

  return c.json({
    data: portfolio as PortfolioSummary,
  });
});

/**
 * Get trading limits for user
 * GET /trading/limits
 */
tradingRouter.get("/limits", async (c) => {
  const userId = c.get("userId");
  const kycTier = c.get("kycTier") as "none" | "basic" | "enhanced" | "accredited";

  const convex = getConvex();

  const limits = getTradingLimits(kycTier);
  const activity = await convex.query(api.functions.trading.getDailyActivity, {
    userId: userId as any,
  });

  return c.json({
    data: {
      tier: kycTier,
      limits,
      usage: {
        dailyUsed: activity.dailyTotal,
        weeklyUsed: activity.weeklyTotal,
        dailyRemaining: limits.dailyLimit - activity.dailyTotal,
        weeklyRemaining: limits.weeklyLimit - activity.weeklyTotal,
      },
    },
  });
});

/**
 * Get buying power
 * GET /trading/buying-power
 */
tradingRouter.get("/buying-power", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const buyingPower = await convex.query(api.functions.balances.getBuyingPower, {
    userId: userId as any,
  });

  const cashBalance = await convex.query(api.functions.balances.getCashBalance, {
    userId: userId as any,
  });

  return c.json({
    data: {
      buyingPower,
      cashBalance,
      heldInOrders: cashBalance - buyingPower,
    },
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function formatOrderResponse(order: any): OrderResponse {
  return {
    orderId: order._id,
    externalOrderId: order.externalOrderId,
    status: order.status,
    assetType: order.assetType,
    assetId: order.assetId,
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    avgPrice: order.avgFillPrice,
    fees: order.fees,
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}

export { tradingRouter };
