/**
 * WebSocket Broadcast Service
 * Manages broadcasting messages to connected clients
 */

import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "./server";

// ============================================================================
// Types
// ============================================================================

export interface BroadcastMessage {
  type: string;
  channel: string;
  data: unknown;
  timestamp: number;
}

export interface SubscriptionInfo {
  channel: string;
  subscribedAt: number;
  messageCount: number;
}

export interface ClientStats {
  connectionId: string;
  userId?: string;
  subscriptions: SubscriptionInfo[];
  messagesReceived: number;
  messagesSent: number;
  connectedAt: number;
  lastActivityAt: number;
}

// ============================================================================
// Broadcast Manager
// ============================================================================

export class BroadcastManager {
  // Channel -> Set of connection IDs
  private channels: Map<string, Set<string>> = new Map();

  // Connection ID -> WebSocket
  private connections: Map<string, ServerWebSocket<WebSocketData>> = new Map();

  // Connection ID -> Subscriptions
  private subscriptions: Map<string, Set<string>> = new Map();

  // Connection ID -> Stats
  private stats: Map<string, ClientStats> = new Map();

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Register a new WebSocket connection
   */
  registerConnection(ws: ServerWebSocket<WebSocketData>): void {
    const { connectionId, userId } = ws.data;

    this.connections.set(connectionId, ws);
    this.subscriptions.set(connectionId, new Set());
    this.stats.set(connectionId, {
      connectionId,
      userId,
      subscriptions: [],
      messagesReceived: 0,
      messagesSent: 0,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    console.log(`[Broadcast] Connection registered: ${connectionId}`);
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(connectionId: string): void {
    // Remove from all channels
    const subs = this.subscriptions.get(connectionId);
    if (subs) {
      for (const channel of subs) {
        this.removeFromChannel(connectionId, channel);
      }
    }

    this.connections.delete(connectionId);
    this.subscriptions.delete(connectionId);
    this.stats.delete(connectionId);

    console.log(`[Broadcast] Connection unregistered: ${connectionId}`);
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ServerWebSocket<WebSocketData> | undefined {
    return this.connections.get(connectionId);
  }

  // ============================================================================
  // Channel Subscription
  // ============================================================================

  /**
   * Subscribe a connection to a channel
   */
  subscribe(connectionId: string, channel: string): boolean {
    // Ensure connection exists
    if (!this.connections.has(connectionId)) {
      return false;
    }

    // Add to channel
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(connectionId);

    // Track subscription
    this.subscriptions.get(connectionId)?.add(channel);

    // Update stats
    const stats = this.stats.get(connectionId);
    if (stats) {
      stats.subscriptions.push({
        channel,
        subscribedAt: Date.now(),
        messageCount: 0,
      });
      stats.lastActivityAt = Date.now();
    }

    console.log(`[Broadcast] ${connectionId} subscribed to ${channel}`);
    return true;
  }

  /**
   * Unsubscribe a connection from a channel
   */
  unsubscribe(connectionId: string, channel: string): boolean {
    const removed = this.removeFromChannel(connectionId, channel);

    if (removed) {
      this.subscriptions.get(connectionId)?.delete(channel);

      // Update stats
      const stats = this.stats.get(connectionId);
      if (stats) {
        stats.subscriptions = stats.subscriptions.filter((s) => s.channel !== channel);
        stats.lastActivityAt = Date.now();
      }

      console.log(`[Broadcast] ${connectionId} unsubscribed from ${channel}`);
    }

    return removed;
  }

  /**
   * Remove connection from a channel
   */
  private removeFromChannel(connectionId: string, channel: string): boolean {
    const subscribers = this.channels.get(channel);
    if (!subscribers) return false;

    const removed = subscribers.delete(connectionId);

    // Clean up empty channels
    if (subscribers.size === 0) {
      this.channels.delete(channel);
    }

    return removed;
  }

  /**
   * Get all channels a connection is subscribed to
   */
  getSubscriptions(connectionId: string): string[] {
    return Array.from(this.subscriptions.get(connectionId) ?? []);
  }

  /**
   * Get subscriber count for a channel
   */
  getSubscriberCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  /**
   * Check if connection is subscribed to channel
   */
  isSubscribed(connectionId: string, channel: string): boolean {
    return this.subscriptions.get(connectionId)?.has(channel) ?? false;
  }

  // ============================================================================
  // Broadcasting
  // ============================================================================

  /**
   * Broadcast message to all subscribers of a channel
   */
  broadcast(channel: string, message: BroadcastMessage): number {
    const subscribers = this.channels.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    const payload = JSON.stringify(message);
    let sent = 0;

    for (const connectionId of subscribers) {
      const ws = this.connections.get(connectionId);
      if (ws) {
        try {
          ws.send(payload);
          sent++;

          // Update stats
          const stats = this.stats.get(connectionId);
          if (stats) {
            stats.messagesSent++;
            stats.lastActivityAt = Date.now();

            const subStats = stats.subscriptions.find((s) => s.channel === channel);
            if (subStats) {
              subStats.messageCount++;
            }
          }
        } catch (error) {
          console.error(`[Broadcast] Failed to send to ${connectionId}:`, error);
        }
      }
    }

    return sent;
  }

  /**
   * Broadcast to multiple channels
   */
  broadcastMultiple(channels: string[], message: Omit<BroadcastMessage, "channel">): number {
    let totalSent = 0;

    for (const channel of channels) {
      const sent = this.broadcast(channel, { ...message, channel });
      totalSent += sent;
    }

    return totalSent;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastAll(message: BroadcastMessage): number {
    const payload = JSON.stringify(message);
    let sent = 0;

    for (const [connectionId, ws] of this.connections) {
      try {
        ws.send(payload);
        sent++;

        const stats = this.stats.get(connectionId);
        if (stats) {
          stats.messagesSent++;
          stats.lastActivityAt = Date.now();
        }
      } catch (error) {
        console.error(`[Broadcast] Failed to send to ${connectionId}:`, error);
      }
    }

    return sent;
  }

  /**
   * Send message to a specific connection
   */
  sendTo(connectionId: string, message: BroadcastMessage): boolean {
    const ws = this.connections.get(connectionId);
    if (!ws) return false;

    try {
      ws.send(JSON.stringify(message));

      const stats = this.stats.get(connectionId);
      if (stats) {
        stats.messagesSent++;
        stats.lastActivityAt = Date.now();
      }

      return true;
    } catch (error) {
      console.error(`[Broadcast] Failed to send to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Send message to a specific user (all their connections)
   */
  sendToUser(userId: string, message: BroadcastMessage): number {
    let sent = 0;

    for (const [connectionId, ws] of this.connections) {
      if (ws.data.userId === userId) {
        if (this.sendTo(connectionId, message)) {
          sent++;
        }
      }
    }

    return sent;
  }

  // ============================================================================
  // Pattern-based Broadcasting
  // ============================================================================

  /**
   * Broadcast to channels matching a pattern
   */
  broadcastToPattern(pattern: string, message: Omit<BroadcastMessage, "channel">): number {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    let totalSent = 0;

    for (const channel of this.channels.keys()) {
      if (regex.test(channel)) {
        totalSent += this.broadcast(channel, { ...message, channel });
      }
    }

    return totalSent;
  }

  /**
   * Get channels matching a pattern
   */
  getChannelsByPattern(pattern: string): string[] {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return Array.from(this.channels.keys()).filter((c) => regex.test(c));
  }

  // ============================================================================
  // Statistics & Monitoring
  // ============================================================================

  /**
   * Get statistics for a connection
   */
  getClientStats(connectionId: string): ClientStats | undefined {
    return this.stats.get(connectionId);
  }

  /**
   * Get all connections for a user
   */
  getUserConnections(userId: string): string[] {
    const connections: string[] = [];

    for (const [connectionId, ws] of this.connections) {
      if (ws.data.userId === userId) {
        connections.push(connectionId);
      }
    }

    return connections;
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    totalConnections: number;
    totalChannels: number;
    totalSubscriptions: number;
    uniqueUsers: number;
    channelStats: Array<{ channel: string; subscribers: number }>;
  } {
    const uniqueUsers = new Set<string>();
    let totalSubscriptions = 0;

    for (const ws of this.connections.values()) {
      if (ws.data.userId) {
        uniqueUsers.add(ws.data.userId);
      }
    }

    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.size;
    }

    const channelStats = Array.from(this.channels.entries())
      .map(([channel, subs]) => ({ channel, subscribers: subs.size }))
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, 20); // Top 20 channels

    return {
      totalConnections: this.connections.size,
      totalChannels: this.channels.size,
      totalSubscriptions,
      uniqueUsers: uniqueUsers.size,
      channelStats,
    };
  }

  /**
   * Record incoming message
   */
  recordIncomingMessage(connectionId: string): void {
    const stats = this.stats.get(connectionId);
    if (stats) {
      stats.messagesReceived++;
      stats.lastActivityAt = Date.now();
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(maxIdleMs: number = 300000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [connectionId, stats] of this.stats) {
      if (now - stats.lastActivityAt > maxIdleMs) {
        const ws = this.connections.get(connectionId);
        if (ws) {
          ws.close(1000, "Idle timeout");
        }
        this.unregisterConnection(connectionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Broadcast] Cleaned up ${cleaned} stale connections`);
    }

    return cleaned;
  }

  /**
   * Close all connections
   */
  closeAll(reason: string = "Server shutdown"): void {
    for (const ws of this.connections.values()) {
      try {
        ws.close(1000, reason);
      } catch {
        // Ignore errors during shutdown
      }
    }

    this.channels.clear();
    this.connections.clear();
    this.subscriptions.clear();
    this.stats.clear();

    console.log("[Broadcast] All connections closed");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let broadcastManager: BroadcastManager | null = null;

export function getBroadcastManager(): BroadcastManager {
  if (!broadcastManager) {
    broadcastManager = new BroadcastManager();
  }
  return broadcastManager;
}

export function initBroadcastManager(): BroadcastManager {
  broadcastManager = new BroadcastManager();
  return broadcastManager;
}

export default BroadcastManager;
