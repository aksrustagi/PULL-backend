import { Hono } from "hono";
import type { Env } from "../index";
import { convex, api } from "../lib/convex";
import { parseIntSafe } from "../utils/validation";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

/**
 * Get prediction events
 */
app.get("/events", async (c) => {
  const status = c.req.query("status");
  const category = c.req.query("category");
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const events = await convex.query(api.predictions.getEvents, {
      status: status || undefined,
      category: category || undefined,
      limit,
    });

    return c.json({
      success: true,
      data: events,
      pagination: {
        page: 1,
        pageSize: limit,
        totalItems: events.length,
        totalPages: 1,
        hasNextPage: events.length === limit,
        hasPreviousPage: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching prediction events:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch prediction events",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get event by ticker
 */
app.get("/events/:ticker", async (c) => {
  const ticker = c.req.param("ticker");

  try {
    const event = await convex.query(api.predictions.getEventByTicker, {
      ticker,
    });

    if (!event) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Event with ticker "${ticker}" not found`,
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching event ${ticker}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch event details",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Search events
 */
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const status = c.req.query("status");
  const category = c.req.query("category");
  const limit = parseIntSafe(c.req.query("limit"), 20);

  if (!query.trim()) {
    return c.json({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const events = await convex.query(api.predictions.searchEvents, {
      query,
      status: status || undefined,
      category: category || undefined,
      limit,
    });

    return c.json({
      success: true,
      data: events,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error searching events:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message: "Failed to search events",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get user's prediction positions
 */
app.get("/positions", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        },
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const positions = await convex.query(api.predictions.getUserPositions, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: positions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching user positions:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch positions",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get categories
 */
app.get("/categories", async (c) => {
  try {
    const categories = await convex.query(api.predictions.getCategories, {});

    // Provide default categories if none exist in the database
    if (!categories || categories.length === 0) {
      return c.json({
        success: true,
        data: [
          { id: "politics", name: "Politics", count: 0 },
          { id: "sports", name: "Sports", count: 0 },
          { id: "entertainment", name: "Entertainment", count: 0 },
          { id: "crypto", name: "Crypto", count: 0 },
          { id: "finance", name: "Finance", count: 0 },
          { id: "science", name: "Science", count: 0 },
          { id: "weather", name: "Weather", count: 0 },
          { id: "technology", name: "Technology", count: 0 },
        ],
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      data: categories,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    // Return default categories on error
    return c.json({
      success: true,
      data: [
        { id: "politics", name: "Politics", count: 0 },
        { id: "sports", name: "Sports", count: 0 },
        { id: "entertainment", name: "Entertainment", count: 0 },
        { id: "crypto", name: "Crypto", count: 0 },
        { id: "finance", name: "Finance", count: 0 },
        { id: "science", name: "Science", count: 0 },
        { id: "weather", name: "Weather", count: 0 },
        { id: "technology", name: "Technology", count: 0 },
      ],
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get markets for an event
 */
app.get("/events/:ticker/markets", async (c) => {
  const ticker = c.req.param("ticker");

  try {
    // First get the event to get its ID
    const event = await convex.query(api.predictions.getEventByTicker, {
      ticker,
    });

    if (!event) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Event with ticker "${ticker}" not found`,
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Markets are already included in getEventByTicker response
    return c.json({
      success: true,
      data: event.markets ?? [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching markets for event ${ticker}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch markets",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get market by ticker
 */
app.get("/markets/:ticker", async (c) => {
  const ticker = c.req.param("ticker");

  try {
    const market = await convex.query(api.predictions.getMarketByTicker, {
      ticker,
    });

    if (!market) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Market with ticker "${ticker}" not found`,
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: market,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching market ${ticker}:`, error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch market details",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as predictionsRoutes };
