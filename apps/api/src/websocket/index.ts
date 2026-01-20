/**
 * PULL WebSocket Handler
 * Hono-based WebSocket endpoint for real-time communication
 */

import { Hono } from "hono";
import { jwt } from "hono/jwt";
import type { Context } from "hono";
import type {
  WSMessage,
  WSAuthMessage,
  WSSubscribeMessage,
  WSUnsubscribeMessage,
  WSChannel,
} from "@pull/types";
import { WebSocketManager, getWebSocketManager } from "@pull/core/services/realtime/manager";
import { KalshiBridge } from "@pull/core/services/realtime/kalshi-bridge";

// ============================================================================
// Types
// ============================================================================

interface Env {
  JWT_SECRET: string;
  KALSHI_API_KEY?: string;
  KALSHI_PRIVATE_KEY?: string;
  CONNECTION_DO: DurableObjectNamespace;
}

interface JWTPayload {
  sub: string;
  email?: string;
  exp: number;
  iat: number;
}

interface WebSocketContext {
  connectionId: string;
  userId?: string;
  authenticated: boolean;
  subscriptions: Set<string>;
  lastActivity: number;
}

// ============================================================================
// WebSocket App
// ============================================================================

const wsApp = new Hono<{ Bindings: Env }>();

// WebSocket Manager singleton
let wsManager: WebSocketManager | null = null;
let kalshiBridge: KalshiBridge | null = null;

/**
 * Initialize WebSocket infrastructure
 */
function initializeWebSocket(env: Env): WebSocketManager {
  if (!wsManager) {
    wsManager = getWebSocketManager({
      heartbeatInterval: 30000,
      heartbeatTimeout: 10000,
      staleConnectionTimeout: 120000,
      maxConnectionsPerUser: 5,
      maxSubscriptionsPerConnection: 50,
      enableMetrics: true,
    });

    wsManager.start();

    // Initialize Kalshi bridge if credentials provided
    if (env.KALSHI_API_KEY && env.KALSHI_PRIVATE_KEY) {
      kalshiBridge = new KalshiBridge({
        kalshiConfig: {
          apiKeyId: env.KALSHI_API_KEY,
          privateKey: env.KALSHI_PRIVATE_KEY,
        },
        manager: wsManager,
      });

      kalshiBridge.connect().catch((error) => {
        console.error("Failed to connect Kalshi bridge:", error);
      });
    }
  }

  return wsManager;
}

// ============================================================================
// WebSocket Upgrade Endpoint
// ============================================================================

/**
 * WebSocket upgrade endpoint
 * GET /ws?token=<jwt_token>
 */
wsApp.get("/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");

  if (upgradeHeader !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }

  const manager = initializeWebSocket(c.env);

  // Get token from query param (optional for initial connection)
  const token = c.req.query("token");
  let userId: string | undefined;

  // Validate token if provided
  if (token) {
    try {
      const payload = await verifyToken(token, c.env.JWT_SECRET);
      userId = payload.sub;
    } catch (error) {
      console.warn("Invalid token provided:", error);
      // Allow connection but unauthenticated
    }
  }

  // Create WebSocket pair
  const { 0: client, 1: server } = new WebSocketPair();

  // Accept the WebSocket connection
  server.accept();

  // Create connection context
  const connectionId = crypto.randomUUID();
  const context: WebSocketContext = {
    connectionId,
    userId,
    authenticated: !!userId,
    subscriptions: new Set(),
    lastActivity: Date.now(),
  };

  // Register connection with manager
  manager.handleConnection(server as unknown as WebSocket, connectionId);

  // Authenticate if we have a valid user
  if (userId) {
    manager.authenticateConnection(connectionId, userId);
  }

  // Set up message handler
  server.addEventListener("message", (event) => {
    handleMessage(server, context, event.data as string, manager, c.env);
  });

  // Set up close handler
  server.addEventListener("close", (event) => {
    handleClose(context, event.code, event.reason, manager);
  });

  // Set up error handler
  server.addEventListener("error", (event) => {
    console.error("WebSocket error:", event);
  });

  // Send welcome message
  server.send(
    JSON.stringify({
      type: "connected",
      connectionId,
      authenticated: context.authenticated,
      timestamp: Date.now(),
    })
  );

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(
  ws: WebSocket,
  context: WebSocketContext,
  data: string,
  manager: WebSocketManager,
  env: Env
): void {
  context.lastActivity = Date.now();
  manager.trackMessageReceived(data.length);

  let message: WSMessage;

  try {
    message = JSON.parse(data);
  } catch (error) {
    sendError(ws, "INVALID_JSON", "Failed to parse message");
    return;
  }

  switch (message.type) {
    case "auth":
      handleAuth(ws, context, message as WSAuthMessage, manager, env);
      break;

    case "subscribe":
      handleSubscribe(ws, context, message as WSSubscribeMessage, manager);
      break;

    case "unsubscribe":
      handleUnsubscribe(ws, context, message as WSUnsubscribeMessage, manager);
      break;

    case "ping":
      handlePing(ws, context, manager);
      break;

    case "pong":
      manager.handlePong(context.connectionId);
      break;

    case "message":
      handleChannelMessage(ws, context, message, manager);
      break;

    default:
      sendError(ws, "UNKNOWN_TYPE", `Unknown message type: ${message.type}`);
  }
}

/**
 * Handle authentication message
 */
async function handleAuth(
  ws: WebSocket,
  context: WebSocketContext,
  message: WSAuthMessage,
  manager: WebSocketManager,
  env: Env
): Promise<void> {
  if (context.authenticated) {
    sendAck(ws, "auth", true);
    return;
  }

  try {
    const payload = await verifyToken(message.token, env.JWT_SECRET);
    context.userId = payload.sub;
    context.authenticated = true;

    manager.authenticateConnection(context.connectionId, payload.sub);

    sendAck(ws, "auth", true);

    ws.send(
      JSON.stringify({
        type: "authenticated",
        userId: payload.sub,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    sendAck(ws, "auth", false, "Invalid or expired token");
  }
}

/**
 * Handle subscribe message
 */
function handleSubscribe(
  ws: WebSocket,
  context: WebSocketContext,
  message: WSSubscribeMessage,
  manager: WebSocketManager
): void {
  const channel = message.channel;

  // Validate channel format
  if (!isValidChannel(channel)) {
    sendError(ws, "INVALID_CHANNEL", `Invalid channel format: ${channel}`);
    return;
  }

  // Check if user-specific channel requires authentication
  if (isUserChannel(channel)) {
    const channelUserId = extractUserIdFromChannel(channel);

    if (!context.authenticated) {
      sendError(ws, "AUTH_REQUIRED", "Authentication required for this channel");
      return;
    }

    if (channelUserId !== context.userId) {
      sendError(ws, "UNAUTHORIZED", "Cannot subscribe to another user's channel");
      return;
    }
  }

  // Subscribe via manager
  const success = manager.subscribe(context.connectionId, channel);

  if (success) {
    context.subscriptions.add(channel);

    // If subscribing to a market channel, notify Kalshi bridge
    if (channel.startsWith("market:") && kalshiBridge) {
      const ticker = channel.replace("market:", "");
      kalshiBridge.subscribeMarket(ticker).catch((error) => {
        console.error("Failed to subscribe to Kalshi market:", error);
      });
    }

    sendAck(ws, "subscribe", true, undefined, channel);
  } else {
    sendError(ws, "SUBSCRIBE_FAILED", `Failed to subscribe to ${channel}`);
  }
}

/**
 * Handle unsubscribe message
 */
function handleUnsubscribe(
  ws: WebSocket,
  context: WebSocketContext,
  message: WSUnsubscribeMessage,
  manager: WebSocketManager
): void {
  const channel = message.channel;

  const success = manager.unsubscribe(context.connectionId, channel);

  if (success) {
    context.subscriptions.delete(channel);

    // If unsubscribing from a market channel, notify Kalshi bridge
    if (channel.startsWith("market:") && kalshiBridge) {
      const ticker = channel.replace("market:", "");
      kalshiBridge.unsubscribeMarket(ticker).catch((error) => {
        console.error("Failed to unsubscribe from Kalshi market:", error);
      });
    }

    sendAck(ws, "unsubscribe", true, undefined, channel);
  } else {
    sendAck(ws, "unsubscribe", false, "Not subscribed to channel", channel);
  }
}

/**
 * Handle ping message
 */
function handlePing(
  ws: WebSocket,
  context: WebSocketContext,
  manager: WebSocketManager
): void {
  manager.handlePing(context.connectionId);
}

/**
 * Handle channel message (e.g., chat)
 */
function handleChannelMessage(
  ws: WebSocket,
  context: WebSocketContext,
  message: WSMessage,
  manager: WebSocketManager
): void {
  if (!message.channel) {
    sendError(ws, "MISSING_CHANNEL", "Channel required for message");
    return;
  }

  // Only allow sending to chat channels
  if (!message.channel.startsWith("chat:")) {
    sendError(ws, "INVALID_CHANNEL", "Can only send messages to chat channels");
    return;
  }

  // Require authentication for chat
  if (!context.authenticated) {
    sendError(ws, "AUTH_REQUIRED", "Authentication required to send messages");
    return;
  }

  // Broadcast message to channel
  manager.broadcast(
    message.channel,
    {
      type: "chat",
      roomId: message.channel.replace("chat:", ""),
      senderId: context.userId,
      content: message.data,
      timestamp: Date.now(),
    },
    { excludeConnectionIds: [context.connectionId] }
  );
}

/**
 * Handle connection close
 */
function handleClose(
  context: WebSocketContext,
  code: number,
  reason: string,
  manager: WebSocketManager
): void {
  console.log("WebSocket closed:", { connectionId: context.connectionId, code, reason });

  // Unsubscribe from all market channels in Kalshi bridge
  if (kalshiBridge) {
    for (const channel of context.subscriptions) {
      if (channel.startsWith("market:")) {
        const ticker = channel.replace("market:", "");
        kalshiBridge.unsubscribeMarket(ticker).catch(() => {});
      }
    }
  }

  manager.handleDisconnection(context.connectionId, code, reason);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify JWT token
 */
async function verifyToken(token: string, secret: string): Promise<JWTPayload> {
  // Simple JWT verification - in production use a proper library
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const payload = JSON.parse(atob(parts[1])) as JWTPayload;

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  // In production, verify signature with secret
  // For now, trust the payload
  return payload;
}

/**
 * Send error message
 */
function sendError(ws: WebSocket, code: string, message: string, channel?: string): void {
  ws.send(
    JSON.stringify({
      type: "error",
      code,
      message,
      channel,
      timestamp: Date.now(),
    })
  );
}

/**
 * Send acknowledgment message
 */
function sendAck(
  ws: WebSocket,
  action: string,
  success: boolean,
  error?: string,
  channel?: string
): void {
  ws.send(
    JSON.stringify({
      type: "ack",
      id: action,
      success,
      error,
      channel,
      timestamp: Date.now(),
    })
  );
}

/**
 * Check if channel is valid
 */
function isValidChannel(channel: string): boolean {
  const validPatterns = [
    /^market:.+$/,
    /^markets$/,
    /^orders:.+$/,
    /^fills:.+$/,
    /^portfolio:.+$/,
    /^chat:.+$/,
    /^notifications:.+$/,
    /^signals:.+$/,
    /^leaderboard$/,
    /^presence:.+$/,
  ];

  return validPatterns.some((pattern) => pattern.test(channel));
}

/**
 * Check if channel is user-specific
 */
function isUserChannel(channel: string): boolean {
  return (
    channel.startsWith("orders:") ||
    channel.startsWith("fills:") ||
    channel.startsWith("portfolio:") ||
    channel.startsWith("notifications:") ||
    channel.startsWith("signals:")
  );
}

/**
 * Extract user ID from channel
 */
function extractUserIdFromChannel(channel: string): string | null {
  const match = channel.match(/^(?:orders|fills|portfolio|notifications|signals):(.+)$/);
  return match ? match[1] : null;
}

// ============================================================================
// REST Endpoints for WebSocket Management
// ============================================================================

/**
 * Get WebSocket stats
 * GET /ws/stats
 */
wsApp.get("/ws/stats", (c) => {
  if (!wsManager) {
    return c.json({ error: "WebSocket not initialized" }, 500);
  }

  const metrics = wsManager.getMetrics();

  return c.json({
    connections: {
      total: metrics.totalConnections,
      authenticated: metrics.authenticatedConnections,
    },
    messages: {
      received: metrics.messagesReceived,
      sent: metrics.messagesSent,
    },
    bytes: {
      received: metrics.bytesReceived,
      sent: metrics.bytesSent,
    },
    latency: {
      average: metrics.averageLatency,
    },
    channels: {
      active: wsManager.getActiveChannels().length,
      subscriptions: metrics.subscriptionCounts,
    },
    kalshi: {
      connected: kalshiBridge?.isKalshiConnected() ?? false,
      markets: kalshiBridge?.getSubscribedMarkets().length ?? 0,
    },
  });
});

/**
 * Broadcast message to channel (internal API)
 * POST /ws/broadcast
 */
wsApp.post("/ws/broadcast", async (c) => {
  if (!wsManager) {
    return c.json({ error: "WebSocket not initialized" }, 500);
  }

  const body = await c.req.json<{ channel: string; message: unknown }>();

  if (!body.channel || !body.message) {
    return c.json({ error: "channel and message required" }, 400);
  }

  const sentCount = wsManager.broadcast(body.channel, body.message);

  return c.json({ success: true, sentCount });
});

/**
 * Send message to user (internal API)
 * POST /ws/send-to-user
 */
wsApp.post("/ws/send-to-user", async (c) => {
  if (!wsManager) {
    return c.json({ error: "WebSocket not initialized" }, 500);
  }

  const body = await c.req.json<{ userId: string; message: unknown }>();

  if (!body.userId || !body.message) {
    return c.json({ error: "userId and message required" }, 400);
  }

  const sentCount = wsManager.sendToUser(body.userId, body.message);

  return c.json({ success: true, sentCount });
});

/**
 * Health check
 * GET /ws/health
 */
wsApp.get("/ws/health", (c) => {
  return c.json({
    status: "healthy",
    websocket: wsManager ? "running" : "not_initialized",
    kalshi: kalshiBridge?.isKalshiConnected() ? "connected" : "disconnected",
    timestamp: Date.now(),
  });
});

export default wsApp;
export { wsApp, initializeWebSocket };
