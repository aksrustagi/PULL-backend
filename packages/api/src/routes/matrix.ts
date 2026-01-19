/**
 * Matrix Messaging Routes
 *
 * Federated encrypted messaging with bridges to Discord, Telegram, Slack.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env } from "../types";

const matrixRouter = new Hono<Env>();

let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

/**
 * Get user's Matrix credentials
 * GET /matrix/credentials
 */
matrixRouter.get("/credentials", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();
  const user = await convex.query(api.functions.users.getById, { id: userId as any });

  if (!user?.matrixUserId) {
    return c.json({ error: { message: "Matrix not connected", code: "MATRIX_NOT_CONNECTED" } }, 404);
  }

  return c.json({
    data: {
      userId: user.matrixUserId,
      homeserver: process.env.MATRIX_HOMESERVER_URL,
    },
  });
});

/**
 * Get user's rooms
 * GET /matrix/rooms
 */
matrixRouter.get("/rooms", async (c) => {
  const userId = c.get("userId");

  const convex = getConvex();

  const memberships = await convex.query(api.functions.matrix.getUserRooms, {
    userId: userId as any,
  });

  return c.json({ data: memberships });
});

/**
 * Get room details
 * GET /matrix/rooms/:roomId
 */
matrixRouter.get("/rooms/:roomId", async (c) => {
  const { roomId } = c.req.param();

  const convex = getConvex();

  const room = await convex.query(api.functions.matrix.getRoomDetails, {
    roomId: decodeURIComponent(roomId),
  });

  if (!room) {
    return c.json({ error: { message: "Room not found", code: "ROOM_NOT_FOUND" } }, 404);
  }

  return c.json({ data: room });
});

/**
 * Get room messages (cached)
 * GET /matrix/rooms/:roomId/messages
 */
matrixRouter.get("/rooms/:roomId/messages", async (c) => {
  const { roomId } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const before = c.req.query("before");

  const convex = getConvex();

  const messages = await convex.query(api.functions.matrix.getRoomMessages, {
    roomId: decodeURIComponent(roomId),
    limit,
    before,
  });

  return c.json({
    data: messages,
    meta: { limit },
  });
});

/**
 * Search messages
 * GET /matrix/search
 */
matrixRouter.get("/search", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");
  const roomId = c.req.query("roomId");

  if (!query || query.length < 2) {
    return c.json({ error: { message: "Query too short", code: "INVALID_QUERY" } }, 400);
  }

  const convex = getConvex();

  const messages = await convex.query(api.functions.matrix.searchMessages, {
    userId: userId as any,
    query,
    roomId: roomId ? decodeURIComponent(roomId) : undefined,
    limit: 20,
  });

  return c.json({ data: messages });
});

/**
 * Create trading room for an asset
 * POST /matrix/rooms/trading
 */
matrixRouter.post(
  "/rooms/trading",
  zValidator(
    "json",
    z.object({
      assetId: z.string(),
      assetType: z.enum(["prediction", "crypto", "rwa"]),
      name: z.string().min(1).max(100),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Create room via Matrix admin API
    const roomResponse = await fetch(
      `${process.env.MATRIX_HOMESERVER_URL}/_matrix/client/v3/createRoom`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MATRIX_ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: body.name,
          topic: `Trading discussion for ${body.assetId}`,
          preset: "public_chat",
          room_alias_name: `trading-${body.assetId}`,
        }),
      }
    );

    if (!roomResponse.ok) {
      return c.json({ error: { message: "Failed to create room", code: "ROOM_CREATION_FAILED" } }, 500);
    }

    const roomData = await roomResponse.json();

    // Cache room in Convex
    const convex = getConvex();
    await convex.mutation(api.functions.matrix.cacheRoom, {
      roomId: roomData.room_id,
      name: body.name,
      type: "trading_room",
      linkedAssetId: body.assetId,
      linkedAssetType: body.assetType,
    });

    return c.json({
      data: {
        roomId: roomData.room_id,
        name: body.name,
      },
    });
  }
);

export { matrixRouter };
