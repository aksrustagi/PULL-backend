/**
 * Cloudflare Durable Object for WebSocket Connection Management
 * Provides distributed state management for WebSocket connections
 */

import type {
  WSMessage,
  WSAuthMessage,
  ConnectionInfo,
  BroadcastOptions,
} from "@pull/types";

// ============================================================================
// Types
// ============================================================================

interface ConnectionState {
  connectionId: string;
  userId?: string;
  authenticated: boolean;
  connectedAt: number;
  authenticatedAt?: number;
  lastPingAt: number;
  lastPongAt: number;
  metadata: Record<string, unknown>;
}

interface BroadcastRequest {
  channel: string;
  message: unknown;
  options?: BroadcastOptions;
}

interface SendToUserRequest {
  userId: string;
  message: unknown;
}

interface AuthenticateRequest {
  connectionId: string;
  userId: string;
}

// ============================================================================
// Durable Object State Interface
// ============================================================================

export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  get<T>(keys: string[]): Promise<Map<string, T>>;
  put(key: string, value: unknown): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

// ============================================================================
// Connection Durable Object
// ============================================================================

export class ConnectionDO {
  // State
  private state: DurableObjectState;
  private env: Record<string, unknown>;

  // In-memory connection tracking
  private connections: Map<string, WebSocket> = new Map();
  private connectionStates: Map<string, ConnectionState> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // channel -> connectionIds
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> connectionIds

  // Timers
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Config
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly HEARTBEAT_TIMEOUT = 10000;
  private readonly STALE_TIMEOUT = 120000;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.state = state;
    this.env = env;

    // Start background tasks
    this.startHeartbeat();
    this.startCleanup();
  }

  // ==========================================================================
  // HTTP Handler
  // ==========================================================================

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // REST API endpoints
    switch (url.pathname) {
      case "/broadcast":
        return this.handleBroadcast(request);

      case "/send-to-user":
        return this.handleSendToUser(request);

      case "/authenticate":
        return this.handleAuthenticate(request);

      case "/stats":
        return this.handleStats();

      case "/health":
        return this.handleHealth();

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ==========================================================================
  // WebSocket Handling
  // ==========================================================================

  private handleWebSocketUpgrade(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    server.accept();

    // Generate connection ID
    const connectionId = crypto.randomUUID();

    // Initialize connection state
    const now = Date.now();
    const state: ConnectionState = {
      connectionId,
      authenticated: false,
      connectedAt: now,
      lastPingAt: now,
      lastPongAt: now,
      metadata: {},
    };

    // Store connection
    this.connections.set(connectionId, server);
    this.connectionStates.set(connectionId, state);

    // Set up event handlers
    server.addEventListener("message", (event) => {
      this.handleMessage(connectionId, event.data as string);
    });

    server.addEventListener("close", (event) => {
      this.handleDisconnect(connectionId, event.code, event.reason);
    });

    server.addEventListener("error", () => {
      this.handleDisconnect(connectionId, 1011, "Internal error");
    });

    // Send welcome message
    this.sendTo(connectionId, {
      type: "connected",
      connectionId,
      timestamp: now,
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private handleMessage(connectionId: string, data: string): void {
    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    // Update activity
    state.lastPongAt = Date.now();

    let message: WSMessage;
    try {
      message = JSON.parse(data);
    } catch {
      this.sendError(connectionId, "INVALID_JSON", "Failed to parse message");
      return;
    }

    switch (message.type) {
      case "auth":
        this.handleAuth(connectionId, message as WSAuthMessage);
        break;

      case "subscribe":
        this.handleSubscribe(connectionId, message.channel!);
        break;

      case "unsubscribe":
        this.handleUnsubscribe(connectionId, message.channel!);
        break;

      case "ping":
        this.handlePing(connectionId);
        break;

      case "pong":
        // Already updated lastPongAt
        break;

      case "message":
        this.handleChannelMessage(connectionId, message);
        break;

      default:
        this.sendError(connectionId, "UNKNOWN_TYPE", `Unknown message type: ${message.type}`);
    }
  }

  private async handleAuth(connectionId: string, message: WSAuthMessage): Promise<void> {
    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    try {
      // Verify token (simplified - use proper JWT verification in production)
      const payload = this.verifyToken(message.token);

      // Update state
      state.userId = payload.sub;
      state.authenticated = true;
      state.authenticatedAt = Date.now();

      // Track user connections
      if (!this.userConnections.has(payload.sub)) {
        this.userConnections.set(payload.sub, new Set());
      }
      this.userConnections.get(payload.sub)!.add(connectionId);

      // Send success
      this.sendTo(connectionId, {
        type: "ack",
        id: "auth",
        success: true,
        timestamp: Date.now(),
      });

      this.sendTo(connectionId, {
        type: "authenticated",
        userId: payload.sub,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendTo(connectionId, {
        type: "ack",
        id: "auth",
        success: false,
        error: "Invalid token",
        timestamp: Date.now(),
      });
    }
  }

  private handleSubscribe(connectionId: string, channel: string): void {
    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    // Validate channel
    if (!this.isValidChannel(channel)) {
      this.sendError(connectionId, "INVALID_CHANNEL", `Invalid channel: ${channel}`);
      return;
    }

    // Check user channel authorization
    if (this.isUserChannel(channel)) {
      const channelUserId = this.extractUserIdFromChannel(channel);
      if (!state.authenticated || state.userId !== channelUserId) {
        this.sendError(connectionId, "UNAUTHORIZED", "Cannot subscribe to this channel");
        return;
      }
    }

    // Add to subscriptions
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(connectionId);

    // Send ack
    this.sendTo(connectionId, {
      type: "ack",
      id: "subscribe",
      success: true,
      channel,
      timestamp: Date.now(),
    });
  }

  private handleUnsubscribe(connectionId: string, channel: string): void {
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }

    this.sendTo(connectionId, {
      type: "ack",
      id: "unsubscribe",
      success: true,
      channel,
      timestamp: Date.now(),
    });
  }

  private handlePing(connectionId: string): void {
    const state = this.connectionStates.get(connectionId);
    if (state) {
      state.lastPingAt = Date.now();
    }

    this.sendTo(connectionId, {
      type: "pong",
      timestamp: Date.now(),
    });
  }

  private handleChannelMessage(connectionId: string, message: WSMessage): void {
    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    if (!message.channel) {
      this.sendError(connectionId, "MISSING_CHANNEL", "Channel required");
      return;
    }

    // Only allow chat messages
    if (!message.channel.startsWith("chat:")) {
      this.sendError(connectionId, "INVALID_CHANNEL", "Can only send to chat channels");
      return;
    }

    // Require authentication
    if (!state.authenticated) {
      this.sendError(connectionId, "AUTH_REQUIRED", "Authentication required");
      return;
    }

    // Broadcast to channel
    this.broadcast(message.channel, {
      type: "chat",
      roomId: message.channel.replace("chat:", ""),
      senderId: state.userId,
      content: message.data,
      timestamp: Date.now(),
    }, { excludeConnectionIds: [connectionId] });
  }

  private handleDisconnect(connectionId: string, code: number, reason: string): void {
    const state = this.connectionStates.get(connectionId);

    // Remove from user connections
    if (state?.userId) {
      const userConns = this.userConnections.get(state.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(state.userId);
        }
      }
    }

    // Remove from all subscriptions
    for (const [channel, subscribers] of this.subscriptions) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }

    // Clean up
    this.connections.delete(connectionId);
    this.connectionStates.delete(connectionId);
  }

  // ==========================================================================
  // REST API Handlers
  // ==========================================================================

  private async handleBroadcast(request: Request): Promise<Response> {
    const body = await request.json() as BroadcastRequest;

    if (!body.channel || !body.message) {
      return new Response(JSON.stringify({ error: "channel and message required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sentCount = this.broadcast(body.channel, body.message, body.options);

    return new Response(JSON.stringify({ success: true, sentCount }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleSendToUser(request: Request): Promise<Response> {
    const body = await request.json() as SendToUserRequest;

    if (!body.userId || !body.message) {
      return new Response(JSON.stringify({ error: "userId and message required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sentCount = this.sendToUser(body.userId, body.message);

    return new Response(JSON.stringify({ success: true, sentCount }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleAuthenticate(request: Request): Promise<Response> {
    const body = await request.json() as AuthenticateRequest;

    if (!body.connectionId || !body.userId) {
      return new Response(JSON.stringify({ error: "connectionId and userId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const state = this.connectionStates.get(body.connectionId);
    if (!state) {
      return new Response(JSON.stringify({ error: "Connection not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    state.userId = body.userId;
    state.authenticated = true;
    state.authenticatedAt = Date.now();

    if (!this.userConnections.has(body.userId)) {
      this.userConnections.set(body.userId, new Set());
    }
    this.userConnections.get(body.userId)!.add(body.connectionId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private handleStats(): Response {
    const stats = {
      connections: {
        total: this.connections.size,
        authenticated: Array.from(this.connectionStates.values()).filter((s) => s.authenticated).length,
      },
      users: {
        online: this.userConnections.size,
      },
      channels: {
        active: this.subscriptions.size,
        subscriptions: Object.fromEntries(
          Array.from(this.subscriptions.entries()).map(([k, v]) => [k, v.size])
        ),
      },
      timestamp: Date.now(),
    };

    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private handleHealth(): Response {
    return new Response(JSON.stringify({
      status: "healthy",
      connections: this.connections.size,
      timestamp: Date.now(),
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ==========================================================================
  // Broadcasting
  // ==========================================================================

  private broadcast(channel: string, message: unknown, options: BroadcastOptions = {}): number {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    const payload = JSON.stringify({
      channel,
      data: message,
      timestamp: Date.now(),
    });

    let sentCount = 0;

    for (const connectionId of subscribers) {
      // Check exclusions
      if (options.excludeConnectionIds?.includes(connectionId)) {
        continue;
      }

      const state = this.connectionStates.get(connectionId);
      if (!state) continue;

      if (options.excludeUserIds?.includes(state.userId ?? "")) {
        continue;
      }

      if (options.onlyUserIds && !options.onlyUserIds.includes(state.userId ?? "")) {
        continue;
      }

      const ws = this.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          sentCount++;
        } catch {
          // Connection might be closing
        }
      }
    }

    return sentCount;
  }

  private sendToUser(userId: string, message: unknown): number {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds || connectionIds.size === 0) {
      return 0;
    }

    const payload = JSON.stringify({
      data: message,
      timestamp: Date.now(),
    });

    let sentCount = 0;

    for (const connectionId of connectionIds) {
      const ws = this.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          sentCount++;
        } catch {
          // Connection might be closing
        }
      }
    }

    return sentCount;
  }

  private sendTo(connectionId: string, message: unknown): void {
    const ws = this.connections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        // Connection might be closing
      }
    }
  }

  private sendError(connectionId: string, code: string, message: string): void {
    this.sendTo(connectionId, {
      type: "error",
      code,
      message,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // Background Tasks
  // ==========================================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const pingPayload = JSON.stringify({
        type: "ping",
        timestamp: now,
      });

      for (const [connectionId, ws] of this.connections) {
        const state = this.connectionStates.get(connectionId);
        if (!state) continue;

        // Check for timeout
        if (now - state.lastPongAt > this.HEARTBEAT_TIMEOUT) {
          this.handleDisconnect(connectionId, 4002, "Heartbeat timeout");
          continue;
        }

        // Send ping
        state.lastPingAt = now;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(pingPayload);
          } catch {
            // Ignore
          }
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [connectionId, state] of this.connectionStates) {
        if (now - state.lastPongAt > this.STALE_TIMEOUT) {
          const ws = this.connections.get(connectionId);
          if (ws) {
            ws.close(4003, "Connection stale");
          }
          this.handleDisconnect(connectionId, 4003, "Connection stale");
        }
      }
    }, this.STALE_TIMEOUT / 2);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private verifyToken(token: string): { sub: string } {
    // Simplified token verification - use proper JWT in production
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const payload = JSON.parse(atob(parts[1]));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("Token expired");
    }

    return payload;
  }

  private isValidChannel(channel: string): boolean {
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

  private isUserChannel(channel: string): boolean {
    return (
      channel.startsWith("orders:") ||
      channel.startsWith("fills:") ||
      channel.startsWith("portfolio:") ||
      channel.startsWith("notifications:") ||
      channel.startsWith("signals:")
    );
  }

  private extractUserIdFromChannel(channel: string): string | null {
    const match = channel.match(/^(?:orders|fills|portfolio|notifications|signals):(.+)$/);
    return match ? match[1] : null;
  }
}

export default ConnectionDO;
