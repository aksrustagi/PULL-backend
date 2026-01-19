/**
 * RWA (Real World Assets) Routes
 *
 * Handles fractional ownership of Pokemon cards and collectibles.
 * Integrates with CollectorCrypt for authentication and custody.
 */

import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env, RWAAsset } from "../types";

const rwaRouter = new Hono<Env>();

let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

/**
 * Get all RWA assets
 * GET /rwa/assets
 */
rwaRouter.get("/assets", async (c) => {
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  const assets = await convex.query(api.functions.rwa.listAssets, {
    category,
    limit,
  });

  return c.json({
    data: assets,
    meta: { total: assets.length, limit },
  });
});

/**
 * Search RWA assets
 * GET /rwa/assets/search
 */
rwaRouter.get("/assets/search", async (c) => {
  const query = c.req.query("q");

  if (!query || query.length < 2) {
    return c.json({ error: { message: "Query too short", code: "INVALID_QUERY" } }, 400);
  }

  const convex = getConvex();

  const assets = await convex.query(api.functions.rwa.searchAssets, {
    query,
    limit: 20,
  });

  return c.json({ data: assets });
});

/**
 * Get single RWA asset
 * GET /rwa/assets/:assetId
 */
rwaRouter.get("/assets/:assetId", async (c) => {
  const { assetId } = c.req.param();

  const convex = getConvex();

  const asset = await convex.query(api.functions.rwa.getByAssetId, { assetId });

  if (!asset) {
    return c.json({ error: { message: "Asset not found", code: "ASSET_NOT_FOUND" } }, 404);
  }

  return c.json({ data: asset });
});

/**
 * Get user's RWA holdings
 * GET /rwa/holdings
 */
rwaRouter.get("/holdings", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const holdings = await convex.query(api.functions.rwa.getUserHoldings, {
    userId: userId as any,
  });

  return c.json({ data: holdings });
});

/**
 * Get asset price history
 * GET /rwa/assets/:assetId/history
 */
rwaRouter.get("/assets/:assetId/history", async (c) => {
  const { assetId } = c.req.param();
  const period = c.req.query("period") || "7d";

  const convex = getConvex();

  const history = await convex.query(api.functions.rwa.getPriceHistory, {
    assetId,
    period,
  });

  return c.json({ data: history });
});

/**
 * Get trending RWA assets
 * GET /rwa/trending
 */
rwaRouter.get("/trending", async (c) => {
  const limit = parseInt(c.req.query("limit") || "10", 10);

  const convex = getConvex();

  const assets = await convex.query(api.functions.rwa.getTrending, { limit });

  return c.json({ data: assets });
});

export { rwaRouter };
