import { Hono } from "hono";
import type { Env } from "../index";

const app = new Hono<Env>();

/**
 * Get prediction events
 */
app.get("/events", async (c) => {
  const status = c.req.query("status") ?? "open";
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

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
 * Get event by ticker
 */
app.get("/events/:ticker", async (c) => {
  const ticker = c.req.param("ticker");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      ticker,
      title: "Event title",
      status: "open",
      markets: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search events
 */
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Search via Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get user's prediction positions
 */
app.get("/positions", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get categories
 */
app.get("/categories", async (c) => {
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
});

export { app as predictionsRoutes };
