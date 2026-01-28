import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { socialGraphService } from "@pull/core/services/social-graph";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// Protect all social graph routes - feature is not production-ready
app.use("*", requireFeature("social_graph", "Social Graph"));

const importContactsSchema = z.object({
  source: z.enum(["google", "apple", "csv"]),
  contacts: z.array(z.any()), // Feature protected by feature flag - Convex integration pending
});

const searchLeaguesSchema = z.object({
  sport: z.enum(["nfl", "nba", "mlb", "golf", "ncaa"]).optional(),
  buyInMin: z.number().optional(),
  buyInMax: z.number().optional(),
  competitivenessLevel: z.enum(["casual", "competitive", "hardcore"]).optional(),
  minReputation: z.number().min(0).max(100).optional(),
  openSpotsOnly: z.boolean().default(true),
});

/**
 * GET /api/v1/social/connections
 * Get user's connections
 */
app.get("/connections", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const connections = await socialGraphService.getConnections(userId);

  return c.json({
    success: true,
    data: { connections },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/social/import-contacts
 * Import contacts to find friends
 */
app.post("/import-contacts", zValidator("json", importContactsSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { source, contacts } = c.req.valid("json");
  const importResult = await socialGraphService.importContacts(userId, source, contacts);

  return c.json({
    success: true,
    data: importResult,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/social/league-recommendations
 * Get personalized league recommendations
 */
app.get("/league-recommendations", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const recommendations = await socialGraphService.getLeagueRecommendations(userId);

  return c.json({
    success: true,
    data: { recommendations },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/social/suggestions
 * Get friend-of-friend suggestions
 */
app.get("/suggestions", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const suggestions = await socialGraphService.getFriendOfFriendSuggestions(userId);

  return c.json({
    success: true,
    data: { suggestions },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/social/search-leagues
 * Search public leagues with filters
 */
app.post("/search-leagues", zValidator("json", searchLeaguesSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const filters = c.req.valid("json");
  const leagues = await socialGraphService.searchPublicLeagues(filters);

  return c.json({
    success: true,
    data: { leagues },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/social/reputation/:leagueId
 * Get league reputation score
 */
app.get("/reputation/:leagueId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const leagueId = c.req.param("leagueId");
  const reputation = await socialGraphService.getLeagueReputation(leagueId);

  return c.json({
    success: true,
    data: reputation,
    timestamp: new Date().toISOString(),
  });
});

export default app;
