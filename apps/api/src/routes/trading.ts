import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

const createOrderSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9_.-]+$/),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]),
  quantity: z.number().positive().max(1000000),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("gtc"),
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

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Implement order creation with Convex + Temporal workflow

  const orderId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: orderId,
      userId,
      ...body,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get orders for user
 */
app.get("/orders", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get order by ID
 */
app.get("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }
  // TODO: Verify order.userId === userId when fetching from Convex

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      id: orderId,
      status: "pending",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Cancel order
 */
app.delete("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }
  // TODO: Verify order.userId === userId when fetching from Convex

  // TODO: Cancel order via Temporal workflow

  return c.json({
    success: true,
    data: {
      id: orderId,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get portfolio positions
 */
app.get("/portfolio", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      positions: [],
      summary: {
        totalValue: 0,
        totalCost: 0,
        totalUnrealizedPnL: 0,
        totalRealizedPnL: 0,
        positionCount: 0,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get buying power
 */
app.get("/buying-power", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      available: 0,
      held: 0,
      pending: 0,
      total: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as tradingRoutes };
