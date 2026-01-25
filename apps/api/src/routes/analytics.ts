import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { advancedAnalyticsService } from "@pull/core/services/analytics/advanced";

const app = new Hono<Env>();

/**
 * GET /api/v1/analytics/playoff-odds/:teamId
 * Run Monte Carlo simulation for playoff odds
 */
app.get("/playoff-odds/:teamId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const leagueId = c.req.query("leagueId");
  const sport = c.req.query("sport") ?? "nfl";

  if (!leagueId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "leagueId required" } }, 400);
  }

  const simulation = await advancedAnalyticsService.runPlayoffSimulation(teamId, leagueId, sport);

  return c.json({
    success: true,
    data: simulation,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/analytics/bench-analysis/:teamId
 * Get points left on bench analysis
 */
app.get("/bench-analysis/:teamId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const leagueId = c.req.query("leagueId");
  const season = c.req.query("season") ?? "2024";

  if (!leagueId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "leagueId required" } }, 400);
  }

  const analysis = await advancedAnalyticsService.analyzeBenchPoints(teamId, leagueId, season);

  return c.json({
    success: true,
    data: analysis,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/analytics/optimal-lineup/:teamId/:week
 * Get optimal lineup with hindsight
 */
app.get("/optimal-lineup/:teamId/:week", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const week = parseInt(c.req.param("week"), 10);

  if (isNaN(week) || week < 1 || week > 18) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid week" } }, 400);
  }

  const lineup = await advancedAnalyticsService.getOptimalLineup(teamId, week);

  return c.json({
    success: true,
    data: lineup,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/analytics/h2h-history/:teamId/:opponentId
 * Get head-to-head history
 */
app.get("/h2h-history/:teamId/:opponentId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const opponentId = c.req.param("opponentId");
  const leagueId = c.req.query("leagueId");

  if (!leagueId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "leagueId required" } }, 400);
  }

  const history = await advancedAnalyticsService.getHeadToHeadHistory(teamId, opponentId, leagueId);

  return c.json({
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/analytics/draft-grade/:teamId
 * Get hindsight draft grade
 */
app.get("/draft-grade/:teamId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const teamId = c.req.param("teamId");
  const leagueId = c.req.query("leagueId");
  const season = c.req.query("season") ?? "2024";

  if (!leagueId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "leagueId required" } }, 400);
  }

  const grade = await advancedAnalyticsService.gradeDraft(teamId, leagueId, season);

  return c.json({
    success: true,
    data: grade,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/analytics/player-trend/:playerId
 * Analyze player trend (trending up/down)
 */
app.get("/player-trend/:playerId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const playerId = c.req.param("playerId");
  const sport = c.req.query("sport") ?? "nfl";

  const trend = await advancedAnalyticsService.analyzePlayerTrend(playerId, sport);

  return c.json({
    success: true,
    data: trend,
    timestamp: new Date().toISOString(),
  });
});

export default app;
