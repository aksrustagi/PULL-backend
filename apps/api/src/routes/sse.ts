/**
 * Server-Sent Events (SSE) Routes
 * Real-time data streaming for web clients that don't support WebSocket
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Env } from "../index";
import { verifyToken } from "../middleware/auth";
import { initRedisPubSub, type RedisPubSub, type PriceUpdate, type PubSubMessage } from "@pull/core/services/redis";

// ============================================================================
// Types
// ============================================================================

interface SSEConnection {
  id: string;
  userId?: string;
  subscriptions: Set<string>;
  controller: ReadableStreamDefaultController;
  lastEventId: number;
  connectedAt: number;
  lastPingAt: number;
}

interface SSEMessage {
  event: string;
  data: unknown;
  id?: string;
  retry?: number;
}

// ============================================================================
// SSE Manager
// ============================================================================

class SSEManager {
  private connections: Map<string, SSEConnection> = new Map();
  private pubsub: RedisPubSub | null = null;
  private eventId: number = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initializePubSub();
    this.startPingInterval();
  }

  private async initializePubSub(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn("[SSE] Redis URL not configured, SSE updates will be limited");
      return;
    }

    try {
      this.pubsub = initRedisPubSub({
        url: redisUrl,
        token: process.env.REDIS_TOKEN,
        keyPrefix: "pull:realtime:",
      });

      await this.pubsub.connect();

      // Subscribe to price updates and broadcast to SSE clients
      this.pubsub.subscribe<PriceUpdate>("price:*", (message) => {
        this.broadcastToChannel(message.channel, "price", message.data);
      });

      // Subscribe to odds updates
      this.pubsub.subscribe("odds:*", (message) => {
        this.broadcastToChannel(message.channel, "odds", message.data);
      });

      // Subscribe to trade updates
      this.pubsub.subscribe("trade:*", (message) => {
        this.broadcastToChannel(message.channel, "trade", message.data);
      });

      console.log("[SSE] Connected to Redis Pub/Sub");
    } catch (error) {
      console.error("[SSE] Failed to connect to Redis:", error);
    }
  }

  private startPingInterval(): void {
    // Send ping every 30 seconds to keep connections alive
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, conn] of this.connections) {
        try {
          this.sendEvent(conn, { event: "ping", data: { time: now } });
          conn.lastPingAt = now;
        } catch {
          // Connection is dead, remove it
          this.removeConnection(id);
        }
      }
    }, 30000);
  }

  registerConnection(conn: SSEConnection): void {
    this.connections.set(conn.id, conn);
    console.log(`[SSE] Connection registered: ${conn.id}`);
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
    console.log(`[SSE] Connection removed: ${id}`);
  }

  getConnection(id: string): SSEConnection | undefined {
    return this.connections.get(id);
  }

  subscribe(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    conn.subscriptions.add(channel);
    console.log(`[SSE] ${connectionId} subscribed to ${channel}`);
    return true;
  }

  unsubscribe(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    conn.subscriptions.delete(channel);
    console.log(`[SSE] ${connectionId} unsubscribed from ${channel}`);
    return true;
  }

  sendEvent(conn: SSEConnection, message: SSEMessage): void {
    const id = ++this.eventId;
    const lines: string[] = [];

    if (message.event) {
      lines.push(`event: ${message.event}`);
    }
    if (message.id ?? id) {
      lines.push(`id: ${message.id ?? id}`);
    }
    if (message.retry) {
      lines.push(`retry: ${message.retry}`);
    }

    const data = typeof message.data === "string"
      ? message.data
      : JSON.stringify(message.data);

    lines.push(`data: ${data}`);
    lines.push("", ""); // Double newline to end message

    const text = lines.join("\n");
    const encoder = new TextEncoder();
    conn.controller.enqueue(encoder.encode(text));
    conn.lastEventId = id;
  }

  broadcastToChannel(channel: string, event: string, data: unknown): number {
    let sent = 0;

    for (const conn of this.connections.values()) {
      // Check if subscribed to this channel or a matching pattern
      for (const sub of conn.subscriptions) {
        if (this.matchChannel(sub, channel)) {
          try {
            this.sendEvent(conn, { event, data: { channel, ...data as object } });
            sent++;
          } catch {
            // Connection is dead
          }
          break; // Only send once per connection
        }
      }
    }

    return sent;
  }

  private matchChannel(pattern: string, channel: string): boolean {
    if (pattern === channel) return true;

    // Support wildcard matching (e.g., "price:*" matches "price:kalshi:ABC")
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return channel.startsWith(prefix);
    }

    return false;
  }

  getStats(): {
    connections: number;
    subscriptions: number;
  } {
    let subscriptions = 0;
    for (const conn of this.connections.values()) {
      subscriptions += conn.subscriptions.size;
    }

    return {
      connections: this.connections.size,
      subscriptions,
    };
  }

  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.pubsub) {
      this.pubsub.disconnect();
    }
    this.connections.clear();
  }
}

// ============================================================================
// Singleton Manager
// ============================================================================

let sseManager: SSEManager | null = null;

function getSSEManager(): SSEManager {
  if (!sseManager) {
    sseManager = new SSEManager();
  }
  return sseManager;
}

// ============================================================================
// Routes
// ============================================================================

const app = new Hono<Env>();

/**
 * Main SSE endpoint
 * GET /sse/stream?channels=price:kalshi:*,odds:nfl:*
 */
app.get("/stream", async (c) => {
  const manager = getSSEManager();

  // Parse channels from query
  const channelsParam = c.req.query("channels") ?? "";
  const channels = channelsParam
    .split(",")
    .map((ch) => ch.trim())
    .filter((ch) => ch.length > 0);

  // Optional authentication
  const token = c.req.query("token") ?? c.req.header("Authorization")?.replace("Bearer ", "");
  let userId: string | undefined;

  if (token) {
    const auth = await verifyToken(token);
    userId = auth?.userId;
  }

  // Create connection ID
  const connectionId = crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    let conn: SSEConnection | null = null;

    try {
      // Set up SSE headers
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("X-SSE-Connection-Id", connectionId);

      // Create connection with a minimal controller interface
      conn = {
        id: connectionId,
        userId,
        subscriptions: new Set(channels),
        controller: {
          enqueue: (chunk: Uint8Array) => {
            const text = new TextDecoder().decode(chunk);
            // Parse SSE format and send via stream
            const lines = text.split("\n");
            let event = "message";
            let data = "";
            let id: string | undefined;

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                event = line.slice(7);
              } else if (line.startsWith("data: ")) {
                data = line.slice(6);
              } else if (line.startsWith("id: ")) {
                id = line.slice(4);
              }
            }

            if (data) {
              stream.writeSSE({ event, data, id });
            }
          },
        } as ReadableStreamDefaultController,
        lastEventId: 0,
        connectedAt: Date.now(),
        lastPingAt: Date.now(),
      };

      manager.registerConnection(conn);

      // Send connected event
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          connectionId,
          userId,
          subscriptions: channels,
          serverTime: Date.now(),
        }),
      });

      // Subscribe to requested channels
      for (const channel of channels) {
        manager.subscribe(connectionId, channel);
      }

      // Keep connection alive
      while (true) {
        // Check if connection is still in manager
        if (!manager.getConnection(connectionId)) {
          break;
        }

        // Sleep briefly to allow other events to process
        await stream.sleep(1000);
      }
    } catch (error) {
      console.error(`[SSE] Stream error for ${connectionId}:`, error);
    } finally {
      manager.removeConnection(connectionId);
    }
  });
});

/**
 * Subscribe to additional channels
 * POST /sse/subscribe
 */
app.post("/subscribe", async (c) => {
  const body = await c.req.json<{ connectionId: string; channels: string[] }>();
  const manager = getSSEManager();

  const conn = manager.getConnection(body.connectionId);
  if (!conn) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Connection not found" } },
      404
    );
  }

  const subscribed: string[] = [];
  for (const channel of body.channels) {
    if (manager.subscribe(body.connectionId, channel)) {
      subscribed.push(channel);
    }
  }

  return c.json({
    success: true,
    data: {
      subscribed,
      totalSubscriptions: conn.subscriptions.size,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Unsubscribe from channels
 * POST /sse/unsubscribe
 */
app.post("/unsubscribe", async (c) => {
  const body = await c.req.json<{ connectionId: string; channels: string[] }>();
  const manager = getSSEManager();

  const conn = manager.getConnection(body.connectionId);
  if (!conn) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Connection not found" } },
      404
    );
  }

  const unsubscribed: string[] = [];
  for (const channel of body.channels) {
    if (manager.unsubscribe(body.connectionId, channel)) {
      unsubscribed.push(channel);
    }
  }

  return c.json({
    success: true,
    data: {
      unsubscribed,
      totalSubscriptions: conn.subscriptions.size,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Market-specific SSE endpoint
 * GET /sse/markets/:marketId
 */
app.get("/markets/:marketId", async (c) => {
  const marketId = c.req.param("marketId");
  const manager = getSSEManager();

  const channels = [
    `price:kalshi:${marketId}`,
    `price:odds-api:${marketId}`,
    `orderbook:kalshi:${marketId}`,
    `trade:kalshi:${marketId}`,
  ];

  const connectionId = crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    const conn: SSEConnection = {
      id: connectionId,
      subscriptions: new Set(channels),
      controller: {
        enqueue: (chunk: Uint8Array) => {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split("\n");
          let event = "message";
          let data = "";
          let id: string | undefined;

          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
            else if (line.startsWith("id: ")) id = line.slice(4);
          }

          if (data) stream.writeSSE({ event, data, id });
        },
      } as ReadableStreamDefaultController,
      lastEventId: 0,
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
    };

    manager.registerConnection(conn);

    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          connectionId,
          marketId,
          subscriptions: channels,
        }),
      });

      for (const channel of channels) {
        manager.subscribe(connectionId, channel);
      }

      while (manager.getConnection(connectionId)) {
        await stream.sleep(1000);
      }
    } finally {
      manager.removeConnection(connectionId);
    }
  });
});

/**
 * Sport odds SSE endpoint
 * GET /sse/sports/:sport
 */
app.get("/sports/:sport", async (c) => {
  const sport = c.req.param("sport");
  const manager = getSSEManager();

  const channels = [`odds:${sport}:*`, `scores:${sport}:*`];
  const connectionId = crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    const conn: SSEConnection = {
      id: connectionId,
      subscriptions: new Set(channels),
      controller: {
        enqueue: (chunk: Uint8Array) => {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split("\n");
          let event = "message";
          let data = "";
          let id: string | undefined;

          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
            else if (line.startsWith("id: ")) id = line.slice(4);
          }

          if (data) stream.writeSSE({ event, data, id });
        },
      } as ReadableStreamDefaultController,
      lastEventId: 0,
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
    };

    manager.registerConnection(conn);

    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          connectionId,
          sport,
          subscriptions: channels,
        }),
      });

      for (const channel of channels) {
        manager.subscribe(connectionId, channel);
      }

      while (manager.getConnection(connectionId)) {
        await stream.sleep(1000);
      }
    } finally {
      manager.removeConnection(connectionId);
    }
  });
});

/**
 * Get SSE statistics
 * GET /sse/stats
 */
app.get("/stats", (c) => {
  const manager = getSSEManager();
  const stats = manager.getStats();

  return c.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health check
 * GET /sse/health
 */
app.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "healthy",
      type: "sse",
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as sseRoutes };
