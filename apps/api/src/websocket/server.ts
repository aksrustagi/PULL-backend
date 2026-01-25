/**
 * WebSocket Server
 * Bun WebSocket server for real-time data feeds
 */

import type { ServerWebSocket, WebSocketHandler } from "bun";
import {
  authenticateFromQuery,
  authenticateFromProtocol,
  type WebSocketPermissions,
  type WebSocketAuthResult,
} from "./auth";
import { getBroadcastManager, initBroadcastManager, type BroadcastManager } from "./broadcast";
import { handleMessage, sendResponse, sendError } from "./handlers";
import { initRedisPubSub, type RedisPubSub, type PriceUpdate } from "@pull/core/services/redis";

// ============================================================================
// Types
// ============================================================================

export interface WebSocketData {
  connectionId: string;
  userId?: string;
  authenticated: boolean;
  permissions: WebSocketPermissions;
  connectedAt: number;
  lastPingAt: number;
  ip: string;
}

export interface WebSocketServerConfig {
  port?: number;
  path?: string;
  pingInterval?: number;
  idleTimeout?: number;
  maxPayloadLength?: number;
  perMessageDeflate?: boolean;
  redisUrl?: string;
  redisToken?: string;
}

export interface WebSocketServerStats {
  connections: number;
  authenticated: number;
  channels: number;
  uptime: number;
  messagesIn: number;
  messagesOut: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<WebSocketServerConfig> = {
  port: 3002,
  path: "/ws",
  pingInterval: 30000,
  idleTimeout: 120,
  maxPayloadLength: 64 * 1024, // 64KB
  perMessageDeflate: true,
  redisUrl: process.env.REDIS_URL ?? "",
  redisToken: process.env.REDIS_TOKEN ?? "",
};

// ============================================================================
// WebSocket Server Class
// ============================================================================

export class WebSocketServer {
  private readonly config: Required<WebSocketServerConfig>;
  private broadcast: BroadcastManager;
  private pubsub: RedisPubSub | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private messageCountIn: number = 0;
  private messageCountOut: number = 0;

  constructor(config: WebSocketServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.broadcast = initBroadcastManager();
  }

  // ==========================================================================
  // Server Lifecycle
  // ==========================================================================

  /**
   * Get WebSocket handler for Bun server
   */
  getHandler(): WebSocketHandler<WebSocketData> {
    return {
      open: (ws) => this.handleOpen(ws),
      message: (ws, message) => this.handleMessageWrapper(ws, message),
      close: (ws, code, reason) => this.handleClose(ws, code, reason),
      ping: (ws, data) => this.handlePing(ws),
      pong: (ws, data) => this.handlePong(ws),
    };
  }

  /**
   * Start the WebSocket server components
   */
  async start(): Promise<void> {
    this.startTime = Date.now();

    // Initialize Redis Pub/Sub if configured
    if (this.config.redisUrl) {
      this.pubsub = initRedisPubSub({
        url: this.config.redisUrl,
        token: this.config.redisToken,
        keyPrefix: "pull:realtime:",
      });

      await this.pubsub.connect();
      this.setupPubSubBridge();
    }

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingAllConnections();
    }, this.config.pingInterval);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.broadcast.cleanupStaleConnections(this.config.idleTimeout * 1000);
    }, 60000);

    console.log(`[WebSocket] Server components started`);
  }

  /**
   * Stop the WebSocket server components
   */
  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.pubsub) {
      this.pubsub.disconnect();
      this.pubsub = null;
    }

    this.broadcast.closeAll("Server shutdown");

    console.log(`[WebSocket] Server components stopped`);
  }

  // ==========================================================================
  // Connection Handlers
  // ==========================================================================

  /**
   * Handle new WebSocket connection
   */
  private async handleOpen(ws: ServerWebSocket<WebSocketData>): Promise<void> {
    console.log(`[WebSocket] New connection: ${ws.data.connectionId}`);

    // Register with broadcast manager
    this.broadcast.registerConnection(ws);

    // Send welcome message
    sendResponse(ws, "connected", {
      connectionId: ws.data.connectionId,
      authenticated: ws.data.authenticated,
      userId: ws.data.userId,
      serverTime: Date.now(),
      permissions: {
        canSubscribePublic: ws.data.permissions.canSubscribePublic,
        canSubscribePrivate: ws.data.permissions.canSubscribePrivate,
        maxSubscriptions: ws.data.permissions.maxSubscriptions,
      },
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessageWrapper(
    ws: ServerWebSocket<WebSocketData>,
    message: string | Buffer
  ): Promise<void> {
    this.messageCountIn++;
    await handleMessage(ws, message);
  }

  /**
   * Handle connection close
   */
  private handleClose(
    ws: ServerWebSocket<WebSocketData>,
    code: number,
    reason: string
  ): void {
    console.log(
      `[WebSocket] Connection closed: ${ws.data.connectionId} (${code}: ${reason})`
    );
    this.broadcast.unregisterConnection(ws.data.connectionId);
  }

  /**
   * Handle ping frame
   */
  private handlePing(ws: ServerWebSocket<WebSocketData>): void {
    ws.data.lastPingAt = Date.now();
  }

  /**
   * Handle pong frame
   */
  private handlePong(ws: ServerWebSocket<WebSocketData>): void {
    ws.data.lastPingAt = Date.now();
  }

  // ==========================================================================
  // Upgrade Handler (for HTTP server integration)
  // ==========================================================================

  /**
   * Handle WebSocket upgrade request
   */
  async handleUpgrade(
    request: Request,
    server: { upgrade: (req: Request, options: { data: WebSocketData }) => boolean }
  ): Promise<Response | undefined> {
    const url = new URL(request.url);

    // Check path
    if (url.pathname !== this.config.path) {
      return undefined; // Not a WebSocket request
    }

    // Authenticate
    let authResult: WebSocketAuthResult;

    // Try query parameter first
    authResult = await authenticateFromQuery(url);

    // If not authenticated, try protocol header
    if (!authResult.authenticated) {
      const protocols = request.headers.get("Sec-WebSocket-Protocol");
      if (protocols) {
        authResult = await authenticateFromProtocol(protocols.split(",").map((p) => p.trim()));
      }
    }

    // Create connection data
    const connectionId = crypto.randomUUID();
    const data: WebSocketData = {
      connectionId,
      userId: authResult.userId,
      authenticated: authResult.authenticated,
      permissions: authResult.permissions ?? {
        canSubscribePublic: true,
        canSubscribePrivate: false,
        canSubscribeAdmin: false,
        maxSubscriptions: 10,
      },
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      ip: request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
    };

    // Upgrade the connection
    const success = server.upgrade(request, { data });

    if (success) {
      return undefined; // Upgrade successful
    }

    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  // ==========================================================================
  // Redis Pub/Sub Bridge
  // ==========================================================================

  /**
   * Set up bridge between Redis Pub/Sub and WebSocket broadcast
   */
  private setupPubSubBridge(): void {
    if (!this.pubsub) return;

    // Subscribe to all price updates
    this.pubsub.subscribe<PriceUpdate>("price:*", (message) => {
      this.broadcast.broadcast(message.channel, {
        type: "price",
        channel: message.channel,
        data: message.data,
        timestamp: message.timestamp,
      });
      this.messageCountOut++;
    });

    // Subscribe to orderbook updates
    this.pubsub.subscribe("orderbook:*", (message) => {
      this.broadcast.broadcast(message.channel, {
        type: "orderbook",
        channel: message.channel,
        data: message.data,
        timestamp: message.timestamp,
      });
      this.messageCountOut++;
    });

    // Subscribe to trade updates
    this.pubsub.subscribe("trade:*", (message) => {
      this.broadcast.broadcast(message.channel, {
        type: "trade",
        channel: message.channel,
        data: message.data,
        timestamp: message.timestamp,
      });
      this.messageCountOut++;
    });

    // Subscribe to odds updates
    this.pubsub.subscribe("odds:*", (message) => {
      this.broadcast.broadcast(message.channel, {
        type: "odds",
        channel: message.channel,
        data: message.data,
        timestamp: message.timestamp,
      });
      this.messageCountOut++;
    });

    // Subscribe to market status updates
    this.pubsub.subscribe("market-status:*", (message) => {
      this.broadcast.broadcast(message.channel, {
        type: "market-status",
        channel: message.channel,
        data: message.data,
        timestamp: message.timestamp,
      });
      this.messageCountOut++;
    });

    console.log("[WebSocket] Redis Pub/Sub bridge established");
  }

  // ==========================================================================
  // Ping/Pong
  // ==========================================================================

  /**
   * Ping all connections for health check
   */
  private pingAllConnections(): void {
    const stats = this.broadcast.getGlobalStats();

    for (let i = 0; i < stats.totalConnections; i++) {
      // The broadcast manager will handle the actual pinging
      // This is just a trigger for the cleanup process
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Broadcast message to a channel
   */
  broadcastToChannel(channel: string, type: string, data: unknown): number {
    const count = this.broadcast.broadcast(channel, {
      type,
      channel,
      data,
      timestamp: Date.now(),
    });
    this.messageCountOut += count;
    return count;
  }

  /**
   * Broadcast message to a user
   */
  broadcastToUser(userId: string, type: string, data: unknown): number {
    const count = this.broadcast.sendToUser(userId, {
      type,
      channel: `user:${userId}`,
      data,
      timestamp: Date.now(),
    });
    this.messageCountOut += count;
    return count;
  }

  /**
   * Broadcast message to all connections
   */
  broadcastAll(type: string, data: unknown): number {
    const count = this.broadcast.broadcastAll({
      type,
      channel: "broadcast",
      data,
      timestamp: Date.now(),
    });
    this.messageCountOut += count;
    return count;
  }

  /**
   * Get server statistics
   */
  getStats(): WebSocketServerStats {
    const globalStats = this.broadcast.getGlobalStats();

    return {
      connections: globalStats.totalConnections,
      authenticated: globalStats.uniqueUsers,
      channels: globalStats.totalChannels,
      uptime: Date.now() - this.startTime,
      messagesIn: this.messageCountIn,
      messagesOut: this.messageCountOut,
    };
  }

  /**
   * Get broadcast manager for advanced operations
   */
  getBroadcast(): BroadcastManager {
    return this.broadcast;
  }

  /**
   * Get Redis Pub/Sub client
   */
  getPubSub(): RedisPubSub | null {
    return this.pubsub;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let serverInstance: WebSocketServer | null = null;

export function getWebSocketServer(): WebSocketServer {
  if (!serverInstance) {
    throw new Error("WebSocket server not initialized");
  }
  return serverInstance;
}

export function initWebSocketServer(config?: WebSocketServerConfig): WebSocketServer {
  serverInstance = new WebSocketServer(config);
  return serverInstance;
}

export default WebSocketServer;
