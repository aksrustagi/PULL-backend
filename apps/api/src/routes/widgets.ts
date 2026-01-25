import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { secondScreenService } from "@pull/core/services/second-screen";

const app = new Hono<Env>();

/**
 * GET /api/v1/widgets/home-screen
 * Get home screen widget data
 */
app.get("/home-screen", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const widgetType = c.req.query("type") ?? "lineup";
  
  const validTypes = ["lineup", "matchup", "player_alert", "league_standings"];
  if (!validTypes.includes(widgetType)) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid widget type" } }, 400);
  }

  const widget = await secondScreenService.getHomeScreenWidgetData(
    userId,
    widgetType as "lineup" | "matchup" | "player_alert" | "league_standings"
  );

  return c.json({
    success: true,
    data: widget,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/widgets/watch-complications
 * Get Apple Watch complication data
 */
app.get("/watch-complications", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const complications = await secondScreenService.getWatchComplications(userId);

  return c.json({
    success: true,
    data: { complications },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/tv/dashboard
 * Get TV dashboard layout
 */
app.get("/tv/dashboard", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const sport = c.req.query("sport") ?? "nfl";

  const dashboard = await secondScreenService.getTVDashboard(userId, sport);

  return c.json({
    success: true,
    data: dashboard,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/widgets/carplay/update
 * Send CarPlay audio update
 */
app.post("/carplay/update", zValidator("json", z.object({
  message: z.string(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
})), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { message, priority } = c.req.valid("json");
  const update = await secondScreenService.sendCarPlayUpdate(userId, message, priority);

  return c.json({
    success: true,
    data: update,
    timestamp: new Date().toISOString(),
  });
});

export default app;
