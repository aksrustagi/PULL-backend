import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { injuryPredictionService } from "@pull/core/services/injury-prediction";

const app = new Hono<Env>();

/**
 * GET /api/v1/injuries/risk/:playerId
 * Get injury risk score for a player
 */
app.get("/risk/:playerId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const playerId = c.req.param("playerId");
  const sport = c.req.query("sport") ?? "nfl";

  const riskScore = await injuryPredictionService.calculateRiskScore(playerId, sport);

  return c.json({
    success: true,
    data: riskScore,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/injuries/lineup-risk/:teamId
 * Get aggregate risk for a lineup
 */
app.get("/lineup-risk/:teamId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const playerIds = c.req.query("playerIds")?.split(",") ?? [];

  if (playerIds.length === 0) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "playerIds required" } }, 400);
  }

  const riskAssessment = await injuryPredictionService.getLineupRisk(teamId, playerIds);

  return c.json({
    success: true,
    data: riskAssessment,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/injuries/insurance-quote/:playerId
 * Get insurance quote for a player
 */
app.get("/insurance-quote/:playerId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const playerId = c.req.param("playerId");
  const duration = c.req.query("duration") ?? "week";

  if (!["game", "week", "month", "season"].includes(duration)) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid duration" } }, 400);
  }

  const quote = await injuryPredictionService.getInsuranceQuote(
    playerId,
    duration as "game" | "week" | "month" | "season"
  );

  return c.json({
    success: true,
    data: quote,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/injuries/history/:playerId
 * Get injury history for a player
 */
app.get("/history/:playerId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const playerId = c.req.param("playerId");
  const history = await injuryPredictionService.getInjuryHistory(playerId);

  return c.json({
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  });
});

export default app;
