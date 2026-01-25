import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { visionService } from "@pull/core/services/vision";

const app = new Hono<Env>();

const analyzeScreenshotSchema = z.object({
  imageUrl: z.string().url(),
  analysisType: z.enum(["trade_screenshot", "jersey_scan", "tv_sync", "lineup_screenshot"]),
  sport: z.enum(["nfl", "nba", "mlb", "golf", "ncaa"]).optional(),
});

/**
 * POST /api/v1/vision/screenshot-to-trade
 * Parse trade from screenshot
 */
app.post("/screenshot-to-trade", zValidator("json", analyzeScreenshotSchema.omit({ analysisType: true })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { imageUrl, sport } = c.req.valid("json");

  const result = await visionService.parseTradeScreenshot(imageUrl, userId);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/vision/jersey-scan
 * Scan jersey and get player stats
 */
app.post("/jersey-scan", zValidator("json", z.object({ imageUrl: z.string().url() })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { imageUrl } = c.req.valid("json");
  const result = await visionService.scanJersey(imageUrl, userId);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/vision/tv-sync
 * Sync with TV broadcast
 */
app.post("/tv-sync", zValidator("json", z.object({ imageUrl: z.string().url() })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { imageUrl } = c.req.valid("json");
  const result = await visionService.syncWithTV(imageUrl, userId);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/vision/analyze
 * Generic screenshot analysis
 */
app.post("/analyze", zValidator("json", analyzeScreenshotSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const analysis = await visionService.analyzeScreenshot({
    ...body,
    userId,
  });

  return c.json({
    success: true,
    data: analysis,
    timestamp: new Date().toISOString(),
  });
});

export default app;
