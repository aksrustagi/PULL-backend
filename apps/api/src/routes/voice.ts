import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { voiceService } from "@pull/core/services/voice";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// Protect all voice routes - feature is not production-ready
app.use("*", requireFeature("voice_commands", "Voice Commands"));

const voiceCommandSchema = z.object({
  audioUrl: z.string().url().optional(),
  sport: z.enum(["nfl", "nba", "mlb", "golf", "ncaa"]),
  leagueId: z.string().optional(),
  teamId: z.string().optional(),
});

const textToSpeechSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  format: z.enum(["mp3", "wav", "opus"]).default("mp3"),
});

/**
 * POST /api/v1/voice/command
 * Process voice command
 */
app.post("/command", zValidator("json", voiceCommandSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");

  // Handle multipart/form-data for audio upload
  // For now, we support URL reference
  const command = await voiceService.processVoiceCommand({
    ...body,
    audioBuffer: undefined, // Feature protected by feature flag - Convex integration pending
  });

  return c.json({
    success: true,
    data: command,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/voice/recap/:date
 * Get audio recap for a specific date
 */
app.get("/recap/:date", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const date = c.req.param("date");
  const sport = c.req.query("sport") ?? "nfl";
  const leagueId = c.req.query("leagueId");

  if (!leagueId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "leagueId required" } }, 400);
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid date format" } }, 400);
  }

  const recap = await voiceService.generateAudioRecap(
    userId,
    sport,
    leagueId,
    "daily",
    parsedDate
  );

  return c.json({
    success: true,
    data: recap,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/voice/text-to-speech
 * Convert text to speech
 */
app.post("/text-to-speech", zValidator("json", textToSpeechSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const result = await voiceService.textToSpeech(body);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export default app;
