import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { presenceService } from "@pull/core/services/presence";

const app = new Hono<Env>();

const heartbeatSchema = z.object({
  roomId: z.string(),
  cursor: z.object({
    x: z.number(),
    y: z.number(),
    elementId: z.string().optional(),
  }).optional(),
  status: z.enum(["active", "idle", "away"]).default("active"),
});

const joinRoomSchema = z.object({
  roomId: z.string(),
  roomType: z.enum(["roster", "trade", "waiver", "draft", "lineup"]),
  sport: z.enum(["nfl", "nba", "mlb", "golf", "ncaa"]),
});

/**
 * POST /api/v1/presence/heartbeat
 * Send presence heartbeat
 */
app.post("/heartbeat", zValidator("json", heartbeatSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");

  await presenceService.sendHeartbeat({
    userId,
    roomId: body.roomId,
    cursor: body.cursor,
    status: body.status,
  });

  return c.json({
    success: true,
    data: { message: "Heartbeat received" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/presence/room/:roomId
 * Get all users present in a room
 */
app.get("/room/:roomId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const roomId = c.req.param("roomId");
  const presence = await presenceService.getRoomPresence(roomId);

  return c.json({
    success: true,
    data: { roomId, users: presence },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/presence/join
 * Join a room
 */
app.post("/join", zValidator("json", joinRoomSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  await presenceService.joinRoom(userId, body.roomId, body.roomType, body.sport);

  return c.json({
    success: true,
    data: { message: "Joined room" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/presence/leave
 * Leave a room
 */
app.post("/leave", zValidator("json", z.object({ roomId: z.string() })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  await presenceService.leaveRoom(userId, body.roomId);

  return c.json({
    success: true,
    data: { message: "Left room" },
    timestamp: new Date().toISOString(),
  });
});

export default app;
