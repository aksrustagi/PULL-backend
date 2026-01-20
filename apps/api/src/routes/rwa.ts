import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

/**
 * Get RWA assets
 */
app.get("/assets", async (c) => {
  const type = c.req.query("type");
  const status = c.req.query("status") ?? "listed";
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
 * Get asset by ID
 */
app.get("/assets/:assetId", async (c) => {
  const assetId = c.req.param("assetId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      id: assetId,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search assets
 */
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Search via Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get active listings
 */
app.get("/listings", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get user's ownership
 */
app.get("/ownership", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

const purchaseSchema = z.object({
  listingId: z.string(),
  shares: z.number().int().positive(),
});

/**
 * Purchase shares
 */
app.post("/purchase", zValidator("json", purchaseSchema), async (c) => {
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

  // TODO: Process purchase via Convex

  return c.json({
    success: true,
    data: {
      listingId: body.listingId,
      shares: body.shares,
      status: "completed",
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as rwaRoutes };
