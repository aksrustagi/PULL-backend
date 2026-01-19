/**
 * Prediction Markets Routes
 *
 * Handles prediction market events, positions, and trading.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env, PredictionEvent } from "../types";

const predictionsRouter = new Hono<Env>();

let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Get all prediction events
 * GET /predictions/events
 */
predictionsRouter.get("/events", async (c) => {
  const category = c.req.query("category");
  const status = c.req.query("status") as "upcoming" | "open" | "closed" | "resolved" | undefined;
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  const events = await convex.query(api.functions.predictions.listEvents, {
    category,
    status,
    limit,
  });

  return c.json({
    data: events,
    meta: {
      total: events.length,
      limit,
    },
  });
});

/**
 * Search prediction events
 * GET /predictions/events/search
 */
predictionsRouter.get("/events/search", async (c) => {
  const query = c.req.query("q");

  if (!query || query.length < 2) {
    return c.json(
      {
        error: {
          message: "Search query must be at least 2 characters",
          code: "INVALID_QUERY",
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  const convex = getConvex();

  const events = await convex.query(api.functions.predictions.searchEvents, {
    query,
    limit: 20,
  });

  return c.json({
    data: events,
  });
});

/**
 * Get single prediction event
 * GET /predictions/events/:eventId
 */
predictionsRouter.get("/events/:eventId", async (c) => {
  const { eventId } = c.req.param();

  const convex = getConvex();

  const event = await convex.query(api.functions.predictions.getByEventId, {
    eventId,
  });

  if (!event) {
    return c.json(
      {
        error: {
          message: "Event not found",
          code: "EVENT_NOT_FOUND",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  return c.json({
    data: event,
  });
});

/**
 * Get event order book
 * GET /predictions/events/:eventId/orderbook
 */
predictionsRouter.get("/events/:eventId/orderbook", async (c) => {
  const { eventId } = c.req.param();
  const outcomeId = c.req.query("outcomeId");

  const convex = getConvex();

  const orderbook = await convex.query(api.functions.predictions.getOrderBook, {
    eventId,
    outcomeId,
  });

  return c.json({
    data: orderbook,
  });
});

/**
 * Get user's prediction positions
 * GET /predictions/positions
 */
predictionsRouter.get("/positions", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status") as "open" | "settled" | undefined;

  const convex = getConvex();

  const positions = await convex.query(api.functions.predictions.getUserPositions, {
    userId: userId as any,
    status,
  });

  return c.json({
    data: positions,
  });
});

/**
 * Get position for specific event
 * GET /predictions/positions/:eventId
 */
predictionsRouter.get("/positions/:eventId", async (c) => {
  const userId = c.get("userId");
  const { eventId } = c.req.param();

  const convex = getConvex();

  const position = await convex.query(api.functions.predictions.getPosition, {
    userId: userId as any,
    eventId,
  });

  return c.json({
    data: position,
  });
});

/**
 * Get prediction market categories
 * GET /predictions/categories
 */
predictionsRouter.get("/categories", async (c) => {
  const convex = getConvex();

  const categories = await convex.query(api.functions.predictions.getCategories, {});

  return c.json({
    data: categories,
  });
});

/**
 * Get trending events
 * GET /predictions/trending
 */
predictionsRouter.get("/trending", async (c) => {
  const limit = parseInt(c.req.query("limit") || "10", 10);

  const convex = getConvex();

  const events = await convex.query(api.functions.predictions.getTrending, {
    limit,
  });

  return c.json({
    data: events,
  });
});

/**
 * Get user's prediction history
 * GET /predictions/history
 */
predictionsRouter.get("/history", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  const history = await convex.query(api.functions.predictions.getUserHistory, {
    userId: userId as any,
    limit,
  });

  return c.json({
    data: history,
    meta: {
      total: history.length,
      limit,
    },
  });
});

export { predictionsRouter };
