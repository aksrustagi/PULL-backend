import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { aiTradeAdvisorService } from "@pull/core/services/ai-trade-advisor";

const app = new Hono<Env>();

const analyzeTradeSchema = z.object({
  tradeId: z.string().optional(),
  sport: z.enum(["nfl", "nba", "mlb", "golf", "ncaa"]),
  leagueId: z.string(),
  teamIdOffering: z.string(),
  teamIdReceiving: z.string(),
  playersOffered: z.array(z.string()),
  playersReceived: z.array(z.string()),
  picksOffered: z.array(z.object({
    year: z.number(),
    round: z.number(),
    overallPick: z.number().optional(),
    originalTeamId: z.string(),
  })).optional(),
  picksReceived: z.array(z.object({
    year: z.number(),
    round: z.number(),
    overallPick: z.number().optional(),
    originalTeamId: z.string(),
  })).optional(),
  naturalLanguageQuery: z.string().optional(),
});

const counterOfferSchema = z.object({
  originalTradeId: z.string(),
  constraints: z.object({
    maxPlayers: z.number().optional(),
    positions: z.array(z.string()).optional(),
    excludePlayerIds: z.array(z.string()).optional(),
  }).optional(),
});

/**
 * POST /api/v1/trade-advisor/analyze
 * Analyze a trade for fairness and value
 */
app.post("/analyze", zValidator("json", analyzeTradeSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const analysis = await aiTradeAdvisorService.analyzeTrade(body);

  return c.json({
    success: true,
    data: analysis,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/trade-advisor/counter-offer
 * Generate counter-offer suggestions
 */
app.post("/counter-offer", zValidator("json", counterOfferSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const suggestions = await aiTradeAdvisorService.generateCounterOffer(body);

  return c.json({
    success: true,
    data: { suggestions },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/trade-advisor/collusion-check
 * Check trade for collusion
 */
app.post("/collusion-check", zValidator("json", z.object({ tradeId: z.string() })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { tradeId } = c.req.valid("json");
  const result = await aiTradeAdvisorService.detectCollusion(tradeId);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/trade-advisor/veto-probability/:tradeId
 * Predict veto likelihood
 */
app.get("/veto-probability/:tradeId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const tradeId = c.req.param("tradeId");
  const prediction = await aiTradeAdvisorService.predictVetoProbability(tradeId);

  return c.json({
    success: true,
    data: prediction,
    timestamp: new Date().toISOString(),
  });
});

export default app;
