import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { parseIntSafe } from "../utils/validation";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

/**
 * Get RWA assets
 */
app.get("/assets", async (c) => {
  const type = c.req.query("type");
  const status = c.req.query("status") ?? "listed";
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const assets = await convex.query(api.rwa.getAssets, {
      type: type || undefined,
      status,
      limit,
    });

    return c.json({
      success: true,
      data: assets,
      pagination: {
        page: 1,
        pageSize: limit,
        totalItems: assets.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching assets:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch assets",
        },
      },
      500
    );
  }
});

/**
 * Get asset by ID
 */
app.get("/assets/:assetId", async (c) => {
  const assetId = c.req.param("assetId");

  try {
    const asset = await convex.query(api.rwa.getById, {
      id: assetId as Id<"rwaAssets">,
    });

    if (!asset) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Asset not found" },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: asset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching asset:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch asset",
        },
      },
      500
    );
  }
});

/**
 * Search assets
 */
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const type = c.req.query("type");
  const limit = parseIntSafe(c.req.query("limit"), 20);

  if (!query.trim()) {
    return c.json({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const results = await convex.query(api.rwa.search, {
      query,
      type: type || undefined,
      limit,
    });

    return c.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error searching assets:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "SEARCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to search assets",
        },
      },
      500
    );
  }
});

/**
 * Get active listings
 */
app.get("/listings", async (c) => {
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const listings = await convex.query(api.rwa.getListings, {
      limit,
    });

    return c.json({
      success: true,
      data: listings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch listings",
        },
      },
      500
    );
  }
});

/**
 * Get user's ownership
 */
app.get("/ownership", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
    const ownership = await convex.query(api.rwa.getOwnership, {
      userId: userId as Id<"users">,
    });

    return c.json({
      success: true,
      data: ownership,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching ownership:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch ownership",
        },
      },
      500
    );
  }
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

  try {
    const result = await convex.mutation(api.rwa.purchase, {
      userId: userId as Id<"users">,
      listingId: body.listingId as Id<"rwaListings">,
      shares: body.shares,
    });

    return c.json({
      success: true,
      data: {
        listingId: body.listingId,
        shares: result.shares,
        totalCost: result.totalCost,
        status: "completed",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error purchasing shares:", error);

    // Handle specific error messages from Convex
    const errorMessage = error instanceof Error ? error.message : "Failed to process purchase";
    let statusCode = 500;
    let errorCode = "PURCHASE_ERROR";

    if (errorMessage.includes("not found")) {
      statusCode = 404;
      errorCode = "NOT_FOUND";
    } else if (errorMessage.includes("Insufficient") || errorMessage.includes("Not enough")) {
      statusCode = 400;
      errorCode = "INSUFFICIENT_FUNDS";
    } else if (errorMessage.includes("not active")) {
      statusCode = 400;
      errorCode = "LISTING_INACTIVE";
    }

    return c.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      },
      statusCode
    );
  }
});

export { app as rwaRoutes };
