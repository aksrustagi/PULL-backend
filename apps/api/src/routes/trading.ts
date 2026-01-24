/**
 * Trading Routes for PULL API
 * Full Kalshi API integration for prediction market trading
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { getKalshiClient } from "../services/kalshi";
import { convexOrders, convexBalances, convexPredictions, convexAudit } from "../lib/convex";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const createOrderSchema = z.object({
  ticker: z.string().min(1, "Ticker is required"),
  side: z.enum(["yes", "no"], { required_error: "Side must be 'yes' or 'no'" }),
  action: z.enum(["buy", "sell"], { required_error: "Action must be 'buy' or 'sell'" }),
  type: z.enum(["market", "limit"]).default("limit"),
  count: z.number().int().positive("Count must be a positive integer"),
  yesPrice: z.number().min(1).max(99).optional(),
  noPrice: z.number().min(1).max(99).optional(),
  clientOrderId: z.string().optional(),
  expirationTs: z.number().optional(),
});

const amendOrderSchema = z.object({
  count: z.number().int().positive().optional(),
  yesPrice: z.number().min(1).max(99).optional(),
  noPrice: z.number().min(1).max(99).optional(),
});

const getOrdersSchema = z.object({
  ticker: z.string().optional(),
  status: z.enum(["resting", "canceled", "executed", "pending"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const getMarketsSchema = z.object({
  eventTicker: z.string().optional(),
  seriesTicker: z.string().optional(),
  status: z.enum(["open", "closed", "settled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

// ============================================================================
// Market Data Routes
// ============================================================================

/**
 * GET /trading/markets
 * Get available prediction markets
 */
app.get("/markets", zValidator("query", getMarketsSchema), async (c) => {
  const requestId = c.get("requestId");
  const { eventTicker, seriesTicker, status, limit, cursor } = c.req.valid("query");

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      // Fallback to cached data from Convex
      const events = await convexPredictions.getEvents({ status, limit });
      return c.json({
        success: true,
        data: { markets: events, cursor: null },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await kalshi.getMarkets({
      event_ticker: eventTicker,
      series_ticker: seriesTicker,
      status,
      limit,
      cursor,
    });

    // Cache markets in Convex for offline access
    // This would typically be done via a background job

    return c.json({
      success: true,
      data: {
        markets: result.markets,
        cursor: result.cursor,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get markets error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch markets",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/markets/:ticker
 * Get single market with orderbook
 */
app.get("/markets/:ticker", async (c) => {
  const requestId = c.get("requestId");
  const ticker = c.req.param("ticker");

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      const cached = await convexPredictions.getMarketByTicker(ticker);
      if (cached) {
        return c.json({
          success: true,
          data: { market: cached },
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Market not found" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    const [marketResult, orderbookResult] = await Promise.all([
      kalshi.getMarket(ticker),
      kalshi.getOrderbook(ticker, 10),
    ]);

    return c.json({
      success: true,
      data: {
        market: marketResult.market,
        orderbook: orderbookResult,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get market error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch market details",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/markets/:ticker/orderbook
 * Get orderbook for a market
 */
app.get("/markets/:ticker/orderbook", async (c) => {
  const requestId = c.get("requestId");
  const ticker = c.req.param("ticker");
  const depth = parseInt(c.req.query("depth") ?? "10", 10);

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      return c.json(
        {
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Trading service unavailable" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    const orderbook = await kalshi.getOrderbook(ticker, depth);

    return c.json({
      success: true,
      data: { orderbook },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get orderbook error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch orderbook",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/events
 * Get prediction events
 */
app.get("/events", async (c) => {
  const requestId = c.get("requestId");
  const status = c.req.query("status");
  const seriesTicker = c.req.query("seriesTicker");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      const cached = await convexPredictions.getEvents({ status, limit });
      return c.json({
        success: true,
        data: { events: cached, cursor: null },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await kalshi.getEvents({
      status,
      series_ticker: seriesTicker,
      limit,
      cursor,
    });

    return c.json({
      success: true,
      data: {
        events: result.events,
        cursor: result.cursor,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get events error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch events",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Order Routes
// ============================================================================

/**
 * POST /trading/orders
 * Create a new order
 */
app.post("/orders", zValidator("json", createOrderSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Validate limit order has a price
    if (body.type === "limit") {
      if (body.side === "yes" && !body.yesPrice) {
        return c.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Yes price required for limit orders on yes side" },
            requestId,
            timestamp: new Date().toISOString(),
          },
          400
        );
      }
      if (body.side === "no" && !body.noPrice) {
        return c.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "No price required for limit orders on no side" },
            requestId,
            timestamp: new Date().toISOString(),
          },
          400
        );
      }
    }

    // Check user's buying power
    const buyingPower = await convexBalances.getBuyingPower(userId);
    const orderCost = body.count * (body.yesPrice ?? body.noPrice ?? 50); // Cents per contract

    if (body.action === "buy" && (buyingPower as { available: number })?.available < orderCost) {
      return c.json(
        {
          success: false,
          error: { code: "INSUFFICIENT_FUNDS", message: "Insufficient buying power" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    // Create order in Convex first
    const convexOrderId = await convexOrders.create({
      userId,
      assetClass: "prediction",
      symbol: body.ticker,
      side: body.action,
      type: body.type,
      quantity: body.count,
      price: body.yesPrice ?? body.noPrice,
      timeInForce: "gtc",
    });

    // Submit to Kalshi
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      // Mark order as pending manual submission
      await convexOrders.update({
        id: convexOrderId as string,
        status: "pending",
      });

      return c.json({
        success: true,
        data: {
          id: convexOrderId,
          status: "pending",
          message: "Order queued for submission",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const kalshiResult = await kalshi.createOrder({
      ticker: body.ticker,
      client_order_id: body.clientOrderId ?? convexOrderId as string,
      side: body.side,
      action: body.action,
      type: body.type,
      count: body.count,
      yes_price: body.yesPrice,
      no_price: body.noPrice,
      expiration_ts: body.expirationTs,
    });

    // Update Convex order with Kalshi order ID
    await convexOrders.update({
      id: convexOrderId as string,
      externalOrderId: kalshiResult.order.order_id,
      status: kalshiResult.order.status === "resting" ? "accepted" : "submitted",
    });

    // Log audit event
    await convexAudit.log({
      userId,
      action: "trading.order_created",
      resourceType: "orders",
      resourceId: convexOrderId as string,
      metadata: {
        ticker: body.ticker,
        side: body.side,
        action: body.action,
        count: body.count,
        kalshiOrderId: kalshiResult.order.order_id,
      },
      requestId,
    });

    return c.json({
      success: true,
      data: {
        id: convexOrderId,
        kalshiOrderId: kalshiResult.order.order_id,
        ...kalshiResult.order,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Create order error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "ORDER_FAILED",
          message: error instanceof Error ? error.message : "Failed to create order",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/orders
 * Get user orders
 */
app.get("/orders", zValidator("query", getOrdersSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const { ticker, status, limit, cursor } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Try Kalshi first for real-time data
    const kalshi = await getKalshiClient();
    if (kalshi) {
      const result = await kalshi.getOrders({ ticker, status, limit, cursor });
      return c.json({
        success: true,
        data: {
          orders: result.orders,
          cursor: result.cursor,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Fallback to Convex
    const orders = await convexOrders.getByUser(userId, limit);
    return c.json({
      success: true,
      data: {
        orders,
        cursor: null,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch orders",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/orders/:orderId
 * Get single order
 */
app.get("/orders/:orderId", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const orderId = c.req.param("orderId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const kalshi = await getKalshiClient();
    if (kalshi) {
      const result = await kalshi.getOrder(orderId);
      return c.json({
        success: true,
        data: { order: result.order },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const order = await convexOrders.getById(orderId);
    if (!order) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Order not found" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { order },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get order error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch order",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * PATCH /trading/orders/:orderId
 * Amend an order
 */
app.patch("/orders/:orderId", zValidator("json", amendOrderSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const orderId = c.req.param("orderId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      return c.json(
        {
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Trading service unavailable" },
          requestId,
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    const result = await kalshi.amendOrder(orderId, {
      count: body.count,
      yes_price: body.yesPrice,
      no_price: body.noPrice,
    });

    // Log audit event
    await convexAudit.log({
      userId,
      action: "trading.order_amended",
      resourceType: "orders",
      resourceId: orderId,
      metadata: body,
      requestId,
    });

    return c.json({
      success: true,
      data: { order: result.order },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Amend order error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "AMEND_FAILED",
          message: error instanceof Error ? error.message : "Failed to amend order",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * DELETE /trading/orders/:orderId
 * Cancel an order
 */
app.delete("/orders/:orderId", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const orderId = c.req.param("orderId");
  const reason = c.req.query("reason");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const kalshi = await getKalshiClient();
    if (kalshi) {
      const result = await kalshi.cancelOrder(orderId);

      // Update Convex order
      const convexOrder = (await convexOrders.getByExternalId(orderId)) as { _id: string } | null;
      if (convexOrder) {
        await convexOrders.cancel(convexOrder._id, reason);
      }

      // Log audit event
      await convexAudit.log({
        userId,
        action: "trading.order_cancelled",
        resourceType: "orders",
        resourceId: orderId,
        metadata: { reason },
        requestId,
      });

      return c.json({
        success: true,
        data: { order: result.order },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Cancel in Convex only
    await convexOrders.cancel(orderId, reason);

    return c.json({
      success: true,
      data: {
        id: orderId,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "CANCEL_FAILED",
          message: error instanceof Error ? error.message : "Failed to cancel order",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Position & Portfolio Routes
// ============================================================================

/**
 * GET /trading/positions
 * Get user positions
 */
app.get("/positions", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const ticker = c.req.query("ticker");
  const eventTicker = c.req.query("eventTicker");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const kalshi = await getKalshiClient();
    if (kalshi) {
      const result = await kalshi.getPositions({
        ticker,
        event_ticker: eventTicker,
      });

      return c.json({
        success: true,
        data: {
          positions: result.market_positions,
          cursor: result.cursor,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Fallback to Convex positions
    const positions = await convexPredictions.getUserPositions(userId);
    return c.json({
      success: true,
      data: { positions, cursor: null },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get positions error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch positions",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/portfolio
 * Get portfolio summary
 */
app.get("/portfolio", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const [balanceResult, positionsResult] = await Promise.all([
      convexBalances.getPortfolioSummary(userId),
      convexPredictions.getUserPositions(userId),
    ]);

    const balance = balanceResult as {
      totalValue: number;
      totalCost: number;
      unrealizedPnL: number;
      realizedPnL: number;
    } | null;

    const positions = positionsResult as unknown[];

    return c.json({
      success: true,
      data: {
        summary: {
          totalValue: balance?.totalValue ?? 0,
          totalCost: balance?.totalCost ?? 0,
          unrealizedPnL: balance?.unrealizedPnL ?? 0,
          realizedPnL: balance?.realizedPnL ?? 0,
          positionCount: positions?.length ?? 0,
        },
        positions,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get portfolio error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch portfolio",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/buying-power
 * Get user buying power
 */
app.get("/buying-power", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Try Kalshi first
    const kalshi = await getKalshiClient();
    if (kalshi) {
      const balance = await kalshi.getBalance();
      return c.json({
        success: true,
        data: {
          available: balance.available_balance,
          total: balance.balance,
          payoutAvailable: balance.payout_available,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Fallback to Convex
    const balance = await convexBalances.getBuyingPower(userId);
    const balanceData = balance as {
      available: number;
      held: number;
      pending: number;
    } | null;

    return c.json({
      success: true,
      data: {
        available: balanceData?.available ?? 0,
        held: balanceData?.held ?? 0,
        pending: balanceData?.pending ?? 0,
        total: (balanceData?.available ?? 0) + (balanceData?.held ?? 0),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get buying power error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch buying power",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/fills
 * Get trade fills/executions
 */
app.get("/fills", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const ticker = c.req.query("ticker");
  const orderId = c.req.query("orderId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const kalshi = await getKalshiClient();
    if (!kalshi) {
      return c.json({
        success: true,
        data: { fills: [], cursor: null },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await kalshi.getFills({
      ticker,
      order_id: orderId,
      limit,
    });

    return c.json({
      success: true,
      data: {
        fills: result.fills,
        cursor: result.cursor,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get fills error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch fills",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /trading/history
 * Get trade history
 */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Get fills from Kalshi
    const kalshi = await getKalshiClient();
    const fills = kalshi ? (await kalshi.getFills({ limit })).fills : [];

    return c.json({
      success: true,
      data: {
        trades: fills,
        pagination: {
          limit,
          offset,
          hasMore: fills.length === limit,
        },
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get history error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch trade history",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as tradingRoutes };
