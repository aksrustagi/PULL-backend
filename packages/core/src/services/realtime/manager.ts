/**
 * WebSocket Manager
 * Handles connection management, subscriptions, and message broadcasting
 */

import type {
  WSMessage,
  ConnectionInfo,
  ConnectionMetrics,
  BroadcastOptions,
  ChannelInfo,
  WSEventMap,
} from "@pull/types";
import { TypedEventEmitter } from "./event-emitter";

// ============================================================================
// Types
// ============================================================================

export interface WebSocketManagerConfig {
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  staleConnectionTimeout?: number;
  maxConnectionsPerUser?: number;
  maxSubscriptionsPerConnection?: number;
  enableMetrics?: boolean;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ManagedConnection {
  ws: WebSocket;
  connectionId: string;
  userId?: string;
  authenticatedAt?: number;
  connectedAt: number;
  lastPingAt: number;
  lastPongAt: number;
  subscriptions: Set<string>;
  metadata: Record<string, unknown>;
}

// ============================================================================
// WebSocket Manager Class
// ============================================================================

export class WebSocketManager extends TypedEventEmitter<WSEventMap> {
  private readonly config: Required<WebSocketManagerConfig>;
  private readonly logger: Logger;

  // Connection storage
  private connections: Map<string, ManagedConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> connectionIds
  private channelSubscriptions: Map<string, Set<string>> = new Map(); // channel -> connectionIds

  // Metrics
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    authenticatedConnections: 0,
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    averageLatency: 0,
    subscriptionCounts: {},
  };

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WebSocketManagerConfig = {}) {
    super();

    this.config = {
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10000,
      staleConnectionTimeout: config.staleConnectionTimeout ?? 120000,
      maxConnectionsPerUser: config.maxConnectionsPerUser ?? 5,
      maxSubscriptionsPerConnection: config.maxSubscriptionsPerConnection ?? 50,
      enableMetrics: config.enableMetrics ?? true,
      logger: config.logger ?? this.createDefaultLogger(),
    };

    this.logger = this.config.logger;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[WSManager] ${msg}`, meta ?? ""),
      info: (msg, meta) => console.info(`[WSManager] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[WSManager] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[WSManager] ${msg}`, meta ?? ""),
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the manager (heartbeat and cleanup timers)
   */
  start(): void {
    this.logger.info("Starting WebSocket Manager");

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatInterval);

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConnections();
    }, this.config.staleConnectionTimeout / 2);
  }

  /**
   * Stop the manager and close all connections
   */
  stop(): void {
    this.logger.info("Stopping WebSocket Manager");

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all connections
    for (const [connectionId] of this.connections) {
      this.handleDisconnection(connectionId, 1001, "Server shutdown");
    }
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws: WebSocket, connectionId?: string): string {
    const id = connectionId ?? crypto.randomUUID();
    const now = Date.now();

    const connection: ManagedConnection = {
      ws,
      connectionId: id,
      connectedAt: now,
      lastPingAt: now,
      lastPongAt: now,
      subscriptions: new Set(),
      metadata: {},
    };

    this.connections.set(id, connection);
    this.metrics.totalConnections++;

    this.logger.info("New connection", { connectionId: id });

    this.emit("connected", { connectionId: id });

    return id;
  }

  /**
   * Authenticate a connection with a user ID
   */
  authenticateConnection(connectionId: string, userId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn("Cannot authenticate: connection not found", { connectionId });
      return false;
    }

    // Check max connections per user
    const existingConnections = this.userConnections.get(userId);
    if (existingConnections && existingConnections.size >= this.config.maxConnectionsPerUser) {
      this.logger.warn("Max connections per user exceeded", { userId, current: existingConnections.size });

      // Close oldest connection
      const oldestConnectionId = existingConnections.values().next().value;
      if (oldestConnectionId) {
        this.handleDisconnection(oldestConnectionId, 4001, "Max connections exceeded");
      }
    }

    connection.userId = userId;
    connection.authenticatedAt = Date.now();

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    this.metrics.authenticatedConnections++;

    this.logger.info("Connection authenticated", { connectionId, userId });

    this.emit("authenticated", { userId });

    return true;
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(connectionId: string, code?: number, reason?: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from user connections
    if (connection.userId) {
      const userConns = this.userConnections.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
      this.metrics.authenticatedConnections--;
    }

    // Remove from channel subscriptions
    for (const channel of connection.subscriptions) {
      const channelSubs = this.channelSubscriptions.get(channel);
      if (channelSubs) {
        channelSubs.delete(connectionId);
        if (channelSubs.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }
      this.updateSubscriptionCount(channel);
    }

    // Close WebSocket if still open
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close(code ?? 1000, reason ?? "Connection closed");
    }

    // Remove connection
    this.connections.delete(connectionId);
    this.metrics.totalConnections--;

    this.logger.info("Connection closed", { connectionId, code, reason });

    this.emit("disconnected", { code: code ?? 1000, reason: reason ?? "Connection closed" });
  }

  /**
   * Get connection info
   */
  getConnectionInfo(connectionId: string): ConnectionInfo | null {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    return {
      connectionId: connection.connectionId,
      userId: connection.userId,
      state: connection.userId ? "authenticated" : "connected",
      connectedAt: connection.connectedAt,
      authenticatedAt: connection.authenticatedAt,
      lastPingAt: connection.lastPingAt,
      lastPongAt: connection.lastPongAt,
      latency: connection.lastPongAt - connection.lastPingAt,
      subscriptions: Array.from(connection.subscriptions),
      metadata: connection.metadata,
    };
  }

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  /**
   * Subscribe a connection to a channel
   */
  subscribe(connectionId: string, channel: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn("Cannot subscribe: connection not found", { connectionId });
      return false;
    }

    // Check if user-specific channel requires authentication
    if (this.isUserChannel(channel)) {
      const channelUserId = this.extractUserIdFromChannel(channel);
      if (!connection.userId || connection.userId !== channelUserId) {
        this.logger.warn("Cannot subscribe to user channel: unauthorized", {
          connectionId,
          channel,
          userId: connection.userId,
        });
        return false;
      }
    }

    // Check max subscriptions
    if (connection.subscriptions.size >= this.config.maxSubscriptionsPerConnection) {
      this.logger.warn("Max subscriptions per connection exceeded", {
        connectionId,
        current: connection.subscriptions.size,
      });
      return false;
    }

    // Add to connection subscriptions
    connection.subscriptions.add(channel);

    // Add to channel subscriptions
    if (!this.channelSubscriptions.has(channel)) {
      this.channelSubscriptions.set(channel, new Set());
    }
    this.channelSubscriptions.get(channel)!.add(connectionId);

    this.updateSubscriptionCount(channel);

    this.logger.debug("Subscribed to channel", { connectionId, channel });

    this.emit("subscribed", { channel });

    return true;
  }

  /**
   * Unsubscribe a connection from a channel
   */
  unsubscribe(connectionId: string, channel: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Remove from connection subscriptions
    connection.subscriptions.delete(channel);

    // Remove from channel subscriptions
    const channelSubs = this.channelSubscriptions.get(channel);
    if (channelSubs) {
      channelSubs.delete(connectionId);
      if (channelSubs.size === 0) {
        this.channelSubscriptions.delete(channel);
      }
    }

    this.updateSubscriptionCount(channel);

    this.logger.debug("Unsubscribed from channel", { connectionId, channel });

    this.emit("unsubscribed", { channel });

    return true;
  }

  /**
   * Get all subscribers for a channel
   */
  getSubscribers(channel: string): Set<string> {
    return this.channelSubscriptions.get(channel) ?? new Set();
  }

  /**
   * Get channel info
   */
  getChannelInfo(channel: string): ChannelInfo | null {
    const subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers) return null;

    return {
      channel,
      subscriberCount: subscribers.size,
      createdAt: 0, // Would need to track this separately
      lastActivityAt: Date.now(),
    };
  }

  // ==========================================================================
  // Broadcasting
  // ==========================================================================

  /**
   * Broadcast a message to all subscribers of a channel
   */
  broadcast(channel: string, message: unknown, options: BroadcastOptions = {}): number {
    const subscribers = this.channelSubscriptions.get(channel);
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

      const connection = this.connections.get(connectionId);
      if (!connection) continue;

      if (options.excludeUserIds?.includes(connection.userId ?? "")) {
        continue;
      }

      if (options.onlyUserIds && !options.onlyUserIds.includes(connection.userId ?? "")) {
        continue;
      }

      if (this.sendToConnection(connectionId, payload)) {
        sentCount++;
      }
    }

    this.logger.debug("Broadcast message", { channel, sentCount, totalSubscribers: subscribers.size });

    return sentCount;
  }

  /**
   * Send a message to a specific user (all their connections)
   */
  sendToUser(userId: string, message: unknown): number {
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
      if (this.sendToConnection(connectionId, payload)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Send a message to a specific connection
   */
  sendToConnection(connectionId: string, payload: string | Record<string, unknown>): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = typeof payload === "string" ? payload : JSON.stringify(payload);
      connection.ws.send(data);

      if (this.config.enableMetrics) {
        this.metrics.messagesSent++;
        this.metrics.bytesSent += data.length;
      }

      return true;
    } catch (error) {
      this.logger.error("Failed to send message", { connectionId, error });
      return false;
    }
  }

  /**
   * Broadcast to all connections
   */
  broadcastAll(message: unknown, options: BroadcastOptions = {}): number {
    const payload = JSON.stringify({
      data: message,
      timestamp: Date.now(),
    });

    let sentCount = 0;

    for (const [connectionId, connection] of this.connections) {
      if (options.excludeConnectionIds?.includes(connectionId)) {
        continue;
      }

      if (options.excludeUserIds?.includes(connection.userId ?? "")) {
        continue;
      }

      if (options.onlyUserIds && !options.onlyUserIds.includes(connection.userId ?? "")) {
        continue;
      }

      if (this.sendToConnection(connectionId, payload)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  // ==========================================================================
  // Heartbeat & Health
  // ==========================================================================

  /**
   * Handle ping from a client
   */
  handlePing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastPongAt = Date.now();

    // Send pong response
    this.sendToConnection(connectionId, {
      type: "pong",
      timestamp: Date.now(),
    });
  }

  /**
   * Handle pong from a client
   */
  handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastPongAt = Date.now();

    // Update latency metrics
    if (this.config.enableMetrics) {
      const latency = connection.lastPongAt - connection.lastPingAt;
      this.metrics.averageLatency =
        (this.metrics.averageLatency * 0.9) + (latency * 0.1);
    }
  }

  /**
   * Send heartbeat pings to all connections
   */
  private sendHeartbeats(): void {
    const now = Date.now();
    const pingPayload = JSON.stringify({
      type: "ping",
      timestamp: now,
    });

    for (const [connectionId, connection] of this.connections) {
      // Check for stale connection (no pong received after ping)
      if (now - connection.lastPongAt > this.config.heartbeatTimeout) {
        this.logger.warn("Connection heartbeat timeout", { connectionId });
        this.handleDisconnection(connectionId, 4002, "Heartbeat timeout");
        continue;
      }

      connection.lastPingAt = now;
      this.sendToConnection(connectionId, pingPayload);
    }
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(): void {
    const now = Date.now();
    const staleTimeout = this.config.staleConnectionTimeout;

    for (const [connectionId, connection] of this.connections) {
      // Check if connection is stale
      if (now - connection.lastPongAt > staleTimeout) {
        this.logger.info("Removing stale connection", {
          connectionId,
          lastActivity: now - connection.lastPongAt,
        });
        this.handleDisconnection(connectionId, 4003, "Connection stale");
      }
    }
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Get current metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Track received message
   */
  trackMessageReceived(bytes: number): void {
    if (this.config.enableMetrics) {
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += bytes;
    }
  }

  private updateSubscriptionCount(channel: string): void {
    const subscribers = this.channelSubscriptions.get(channel);
    if (subscribers) {
      this.metrics.subscriptionCounts[channel] = subscribers.size;
    } else {
      delete this.metrics.subscriptionCounts[channel];
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Check if a channel is user-specific (requires authentication)
   */
  private isUserChannel(channel: string): boolean {
    return (
      channel.startsWith("orders:") ||
      channel.startsWith("fills:") ||
      channel.startsWith("portfolio:") ||
      channel.startsWith("notifications:") ||
      channel.startsWith("signals:")
    );
  }

  /**
   * Extract user ID from a user-specific channel
   */
  private extractUserIdFromChannel(channel: string): string | null {
    const match = channel.match(/^(?:orders|fills|portfolio|notifications|signals):(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    const connections = this.userConnections.get(userId);
    return connections !== undefined && connections.size > 0;
  }

  /**
   * Get online user count
   */
  getOnlineUserCount(): number {
    return this.userConnections.size;
  }

  /**
   * Get all connection IDs for a user
   */
  getUserConnections(userId: string): string[] {
    const connections = this.userConnections.get(userId);
    return connections ? Array.from(connections) : [];
  }

  /**
   * Get total connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.channelSubscriptions.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: WebSocketManager | null = null;

/**
 * Get the singleton WebSocket manager instance
 */
export function getWebSocketManager(config?: WebSocketManagerConfig): WebSocketManager {
  if (!managerInstance) {
    managerInstance = new WebSocketManager(config);
  }
  return managerInstance;
}

/**
 * Create a new WebSocket manager instance (for testing or multiple instances)
 */
export function createWebSocketManager(config?: WebSocketManagerConfig): WebSocketManager {
  return new WebSocketManager(config);
}

export default WebSocketManager;
