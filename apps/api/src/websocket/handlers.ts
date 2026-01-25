/**
 * WebSocket Message Handlers
 * Handles incoming WebSocket messages and routes them to appropriate handlers
 */

import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "./server";
import { getBroadcastManager, type BroadcastMessage } from "./broadcast";
import {
  canSubscribeToChannel,
  canAddSubscription,
  reauthenticate,
  createAuthenticatedUser,
  type WebSocketPermissions,
} from "./auth";

// ============================================================================
// Types
// ============================================================================

export interface IncomingMessage {
  id?: string | number;
  type: string;
  channel?: string;
  channels?: string[];
  data?: unknown;
  token?: string;
}

export interface OutgoingMessage {
  id?: string | number;
  type: string;
  channel?: string;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export type MessageHandler = (
  ws: ServerWebSocket<WebSocketData>,
  message: IncomingMessage
) => Promise<void> | void;

// ============================================================================
// Message Type Handlers
// ============================================================================

const handlers: Map<string, MessageHandler> = new Map();

/**
 * Register a message handler
 */
export function registerHandler(type: string, handler: MessageHandler): void {
  handlers.set(type, handler);
}

/**
 * Handle incoming message
 */
export async function handleMessage(
  ws: ServerWebSocket<WebSocketData>,
  rawMessage: string | Buffer
): Promise<void> {
  const broadcast = getBroadcastManager();
  broadcast.recordIncomingMessage(ws.data.connectionId);

  let message: IncomingMessage;

  try {
    const messageStr = typeof rawMessage === "string" ? rawMessage : rawMessage.toString();
    message = JSON.parse(messageStr);
  } catch (error) {
    sendError(ws, "PARSE_ERROR", "Invalid JSON message");
    return;
  }

  if (!message.type) {
    sendError(ws, "INVALID_MESSAGE", "Message type is required", message.id);
    return;
  }

  const handler = handlers.get(message.type);
  if (!handler) {
    sendError(ws, "UNKNOWN_TYPE", `Unknown message type: ${message.type}`, message.id);
    return;
  }

  try {
    await handler(ws, message);
  } catch (error) {
    console.error(`[WS Handler] Error handling ${message.type}:`, error);
    sendError(ws, "HANDLER_ERROR", "Internal handler error", message.id);
  }
}

// ============================================================================
// Built-in Handlers
// ============================================================================

/**
 * Handle ping messages (heartbeat)
 */
registerHandler("ping", (ws, message) => {
  sendResponse(ws, "pong", { serverTime: Date.now() }, message.id);
});

/**
 * Handle subscribe messages
 */
registerHandler("subscribe", async (ws, message) => {
  const broadcast = getBroadcastManager();
  const channels = message.channels ?? (message.channel ? [message.channel] : []);

  if (channels.length === 0) {
    sendError(ws, "INVALID_SUBSCRIBE", "No channels specified", message.id);
    return;
  }

  const permissions = ws.data.permissions;
  const currentSubs = broadcast.getSubscriptions(ws.data.connectionId);
  const subscribed: string[] = [];
  const failed: Array<{ channel: string; reason: string }> = [];

  for (const channel of channels) {
    // Check permission
    if (!canSubscribeToChannel(permissions, channel)) {
      failed.push({ channel, reason: "Permission denied" });
      continue;
    }

    // Check subscription limit
    if (!canAddSubscription(permissions, currentSubs.length + subscribed.length)) {
      failed.push({ channel, reason: "Subscription limit reached" });
      continue;
    }

    // Already subscribed
    if (broadcast.isSubscribed(ws.data.connectionId, channel)) {
      subscribed.push(channel); // Count as success
      continue;
    }

    // Subscribe
    if (broadcast.subscribe(ws.data.connectionId, channel)) {
      subscribed.push(channel);
    } else {
      failed.push({ channel, reason: "Subscription failed" });
    }
  }

  sendResponse(
    ws,
    "subscribed",
    {
      subscribed,
      failed: failed.length > 0 ? failed : undefined,
      totalSubscriptions: broadcast.getSubscriptions(ws.data.connectionId).length,
    },
    message.id
  );
});

/**
 * Handle unsubscribe messages
 */
registerHandler("unsubscribe", (ws, message) => {
  const broadcast = getBroadcastManager();
  const channels = message.channels ?? (message.channel ? [message.channel] : []);

  if (channels.length === 0) {
    sendError(ws, "INVALID_UNSUBSCRIBE", "No channels specified", message.id);
    return;
  }

  const unsubscribed: string[] = [];

  for (const channel of channels) {
    if (broadcast.unsubscribe(ws.data.connectionId, channel)) {
      unsubscribed.push(channel);
    }
  }

  sendResponse(
    ws,
    "unsubscribed",
    {
      unsubscribed,
      totalSubscriptions: broadcast.getSubscriptions(ws.data.connectionId).length,
    },
    message.id
  );
});

/**
 * Handle get subscriptions request
 */
registerHandler("getSubscriptions", (ws, message) => {
  const broadcast = getBroadcastManager();
  const subscriptions = broadcast.getSubscriptions(ws.data.connectionId);

  sendResponse(
    ws,
    "subscriptions",
    {
      subscriptions,
      count: subscriptions.length,
      limit: ws.data.permissions.maxSubscriptions,
    },
    message.id
  );
});

/**
 * Handle authentication/re-authentication
 */
registerHandler("auth", async (ws, message) => {
  if (!message.token) {
    sendError(ws, "AUTH_REQUIRED", "Token is required", message.id);
    return;
  }

  const currentUser = ws.data.userId
    ? {
        userId: ws.data.userId,
        permissions: ws.data.permissions,
        authenticatedAt: ws.data.connectedAt,
        expiresAt: Date.now() + 3600000,
      }
    : null;

  const result = await reauthenticate(currentUser, message.token);

  if (result.authenticated && result.userId && result.permissions) {
    // Update connection data
    ws.data.userId = result.userId;
    ws.data.permissions = result.permissions;
    ws.data.authenticated = true;

    sendResponse(
      ws,
      "authenticated",
      {
        userId: result.userId,
        permissions: {
          canSubscribePublic: result.permissions.canSubscribePublic,
          canSubscribePrivate: result.permissions.canSubscribePrivate,
          maxSubscriptions: result.permissions.maxSubscriptions,
        },
      },
      message.id
    );
  } else {
    sendError(ws, "AUTH_FAILED", result.error ?? "Authentication failed", message.id);
  }
});

/**
 * Handle connection info request
 */
registerHandler("info", (ws, message) => {
  const broadcast = getBroadcastManager();
  const stats = broadcast.getClientStats(ws.data.connectionId);

  sendResponse(
    ws,
    "info",
    {
      connectionId: ws.data.connectionId,
      userId: ws.data.userId,
      authenticated: ws.data.authenticated,
      connectedAt: ws.data.connectedAt,
      subscriptionCount: stats?.subscriptions.length ?? 0,
      messagesReceived: stats?.messagesReceived ?? 0,
      messagesSent: stats?.messagesSent ?? 0,
      permissions: {
        canSubscribePublic: ws.data.permissions.canSubscribePublic,
        canSubscribePrivate: ws.data.permissions.canSubscribePrivate,
        maxSubscriptions: ws.data.permissions.maxSubscriptions,
      },
    },
    message.id
  );
});

// ============================================================================
// Market Data Handlers
// ============================================================================

/**
 * Subscribe to market price updates
 */
registerHandler("subscribeMarket", (ws, message) => {
  const marketId = message.data as string;
  if (!marketId) {
    sendError(ws, "INVALID_MARKET", "Market ID is required", message.id);
    return;
  }

  const channels = [
    `price:kalshi:${marketId}`,
    `price:odds-api:${marketId}`,
    `orderbook:kalshi:${marketId}`,
    `trade:kalshi:${marketId}`,
  ];

  // Reuse subscribe handler
  handlers.get("subscribe")!(ws, { type: "subscribe", channels, id: message.id });
});

/**
 * Subscribe to sport odds updates
 */
registerHandler("subscribeSport", (ws, message) => {
  const sport = message.data as string;
  if (!sport) {
    sendError(ws, "INVALID_SPORT", "Sport is required", message.id);
    return;
  }

  const channel = `odds:${sport}:*`;

  handlers.get("subscribe")!(ws, { type: "subscribe", channel, id: message.id });
});

/**
 * Get latest price for a market
 */
registerHandler("getPrice", async (ws, message) => {
  const { marketId, source } = message.data as { marketId: string; source?: string };

  if (!marketId) {
    sendError(ws, "INVALID_REQUEST", "Market ID is required", message.id);
    return;
  }

  // This would typically fetch from Redis or cache
  // For now, return a placeholder response
  sendResponse(
    ws,
    "price",
    {
      marketId,
      source: source ?? "kalshi",
      price: null,
      message: "Price data not available. Subscribe to receive real-time updates.",
    },
    message.id
  );
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send a response message
 */
export function sendResponse(
  ws: ServerWebSocket<WebSocketData>,
  type: string,
  data: unknown,
  id?: string | number
): void {
  const response: OutgoingMessage = {
    type,
    data,
    timestamp: Date.now(),
  };

  if (id !== undefined) {
    response.id = id;
  }

  ws.send(JSON.stringify(response));
}

/**
 * Send an error message
 */
export function sendError(
  ws: ServerWebSocket<WebSocketData>,
  code: string,
  message: string,
  id?: string | number
): void {
  const response: OutgoingMessage = {
    type: "error",
    error: code,
    data: { message },
    timestamp: Date.now(),
  };

  if (id !== undefined) {
    response.id = id;
  }

  ws.send(JSON.stringify(response));
}

/**
 * Broadcast a message to a channel
 */
export function broadcastToChannel(channel: string, type: string, data: unknown): number {
  const broadcast = getBroadcastManager();
  const message: BroadcastMessage = {
    type,
    channel,
    data,
    timestamp: Date.now(),
  };

  return broadcast.broadcast(channel, message);
}

/**
 * Broadcast a message to a user
 */
export function broadcastToUser(userId: string, type: string, data: unknown): number {
  const broadcast = getBroadcastManager();
  const message: BroadcastMessage = {
    type,
    channel: `user:${userId}`,
    data,
    timestamp: Date.now(),
  };

  return broadcast.sendToUser(userId, message);
}

// ============================================================================
// Export
// ============================================================================

export default {
  handleMessage,
  registerHandler,
  sendResponse,
  sendError,
  broadcastToChannel,
  broadcastToUser,
};
