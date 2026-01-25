/**
 * Redis Pub/Sub Service
 * Real-time message publishing and subscription for market data feeds
 */

import { EventEmitter } from "events";
import type { Logger, PubSubMessage, MessageHandler } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface RedisPubSubConfig {
  url: string;
  token?: string;
  keyPrefix?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  logger?: Logger;
}

export interface PriceUpdate {
  marketId: string;
  source: "kalshi" | "odds-api" | "polymarket";
  yesPrice: number;
  noPrice?: number;
  volume?: number;
  openInterest?: number;
  timestamp: number;
}

export interface OrderbookUpdate {
  marketId: string;
  source: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: number;
}

export interface TradeUpdate {
  marketId: string;
  source: string;
  tradeId: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}

export interface MarketStatusUpdate {
  marketId: string;
  source: string;
  status: "open" | "closed" | "suspended" | "settled";
  result?: "yes" | "no" | "void";
  timestamp: number;
}

export type DataFeedChannel =
  | "price"
  | "orderbook"
  | "trade"
  | "market-status"
  | "odds";

export interface ChannelSubscription {
  channel: DataFeedChannel;
  marketId?: string;
  source?: string;
}

// ============================================================================
// Redis Pub/Sub Client
// ============================================================================

export class RedisPubSub extends EventEmitter {
  private readonly url: string;
  private readonly token: string;
  private readonly keyPrefix: string;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly logger: Logger;

  private subscriptions: Map<string, Set<MessageHandler>> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;

  constructor(config: RedisPubSubConfig) {
    super();
    this.url = config.url;
    this.token = config.token ?? "";
    this.keyPrefix = config.keyPrefix ?? "pull:pubsub:";
    this.reconnectInterval = config.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[RedisPubSub] ${msg}`, meta),
      info: (msg, meta) => console.info(`[RedisPubSub] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[RedisPubSub] ${msg}`, meta),
      error: (msg, meta) => console.error(`[RedisPubSub] ${msg}`, meta),
    };
  }

  private getChannelKey(channel: string): string {
    return `${this.keyPrefix}${channel}`;
  }

  // ==========================================================================
  // HTTP-based Pub/Sub (Upstash compatible)
  // ==========================================================================

  private async execute<T>(command: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Redis error: ${response.statusText}`);
      }

      const result = await response.json();
      return result.result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ==========================================================================
  // Publishing
  // ==========================================================================

  /**
   * Publish a message to a channel
   */
  async publish<T>(channel: string, data: T): Promise<number> {
    const message: PubSubMessage<T> = {
      channel,
      data,
      timestamp: Date.now(),
    };

    const key = this.getChannelKey(channel);
    const serialized = JSON.stringify(message);

    try {
      const subscribers = await this.execute<number>(["PUBLISH", key, serialized]);
      this.logger.debug("Published message", { channel, subscribers });

      // Also store in a list for history (with TTL)
      await this.execute(["LPUSH", `${key}:history`, serialized]);
      await this.execute(["LTRIM", `${key}:history`, 0, 99]); // Keep last 100 messages
      await this.execute(["EXPIRE", `${key}:history`, 3600]); // 1 hour TTL

      return subscribers;
    } catch (error) {
      this.logger.error("Failed to publish message", { channel, error });
      throw error;
    }
  }

  /**
   * Publish price update
   */
  async publishPrice(update: PriceUpdate): Promise<number> {
    const channel = `price:${update.source}:${update.marketId}`;
    return this.publish(channel, update);
  }

  /**
   * Publish orderbook update
   */
  async publishOrderbook(update: OrderbookUpdate): Promise<number> {
    const channel = `orderbook:${update.source}:${update.marketId}`;
    return this.publish(channel, update);
  }

  /**
   * Publish trade update
   */
  async publishTrade(update: TradeUpdate): Promise<number> {
    const channel = `trade:${update.source}:${update.marketId}`;
    return this.publish(channel, update);
  }

  /**
   * Publish market status update
   */
  async publishMarketStatus(update: MarketStatusUpdate): Promise<number> {
    const channel = `market-status:${update.source}:${update.marketId}`;
    return this.publish(channel, update);
  }

  /**
   * Batch publish multiple updates
   */
  async publishBatch<T>(updates: Array<{ channel: string; data: T }>): Promise<void> {
    const commands = updates.map(({ channel, data }) => {
      const message: PubSubMessage<T> = {
        channel,
        data,
        timestamp: Date.now(),
      };
      return ["PUBLISH", this.getChannelKey(channel), JSON.stringify(message)];
    });

    try {
      await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
      });

      this.logger.debug("Batch published messages", { count: updates.length });
    } catch (error) {
      this.logger.error("Failed to batch publish", { error });
      throw error;
    }
  }

  // ==========================================================================
  // Subscription (Polling-based for Upstash REST API)
  // ==========================================================================

  /**
   * Subscribe to a channel using polling
   * Note: Upstash REST API doesn't support true pub/sub, so we use polling
   */
  subscribe<T = unknown>(channel: string, handler: MessageHandler<T>): () => void {
    const key = this.getChannelKey(channel);

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
      this.startPolling(key);
    }

    this.subscriptions.get(key)!.add(handler as MessageHandler);
    this.logger.info("Subscribed to channel", { channel });

    // Return unsubscribe function
    return () => {
      this.unsubscribe(channel, handler);
    };
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe<T = unknown>(channel: string, handler: MessageHandler<T>): void {
    const key = this.getChannelKey(channel);
    const handlers = this.subscriptions.get(key);

    if (handlers) {
      handlers.delete(handler as MessageHandler);

      if (handlers.size === 0) {
        this.subscriptions.delete(key);
        this.stopPolling(key);
      }
    }

    this.logger.info("Unsubscribed from channel", { channel });
  }

  /**
   * Subscribe to price updates for a market
   */
  subscribeToPrice(
    marketId: string,
    source: string,
    handler: MessageHandler<PriceUpdate>
  ): () => void {
    return this.subscribe(`price:${source}:${marketId}`, handler);
  }

  /**
   * Subscribe to all price updates from a source
   */
  subscribeToAllPrices(
    source: string,
    handler: MessageHandler<PriceUpdate>
  ): () => void {
    return this.subscribe(`price:${source}:*`, handler);
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeToOrderbook(
    marketId: string,
    source: string,
    handler: MessageHandler<OrderbookUpdate>
  ): () => void {
    return this.subscribe(`orderbook:${source}:${marketId}`, handler);
  }

  /**
   * Subscribe to trades
   */
  subscribeToTrades(
    marketId: string,
    source: string,
    handler: MessageHandler<TradeUpdate>
  ): () => void {
    return this.subscribe(`trade:${source}:${marketId}`, handler);
  }

  // ==========================================================================
  // Polling Implementation
  // ==========================================================================

  private startPolling(key: string): void {
    if (this.pollingIntervals.has(key)) return;

    let lastTimestamp = Date.now();

    const poll = async () => {
      try {
        // Get recent messages from history list
        const messages = await this.execute<string[]>([
          "LRANGE",
          `${key}:history`,
          0,
          9, // Get last 10 messages
        ]);

        if (messages && messages.length > 0) {
          const handlers = this.subscriptions.get(key);
          if (handlers) {
            for (const msg of messages.reverse()) {
              try {
                const parsed = JSON.parse(msg) as PubSubMessage;
                if (parsed.timestamp > lastTimestamp) {
                  lastTimestamp = parsed.timestamp;
                  for (const handler of handlers) {
                    try {
                      await handler(parsed);
                    } catch (error) {
                      this.logger.error("Handler error", { error });
                    }
                  }
                }
              } catch (e) {
                // Skip malformed messages
              }
            }
          }
        }
      } catch (error) {
        this.logger.error("Polling error", { key, error });
      }
    };

    // Poll every 100ms for near real-time updates
    const interval = setInterval(poll, 100);
    this.pollingIntervals.set(key, interval);

    // Initial poll
    poll();
  }

  private stopPolling(key: string): void {
    const interval = this.pollingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
    }
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect and start subscriptions
   */
  async connect(): Promise<void> {
    try {
      // Test connection with PING
      const result = await this.execute<string>(["PING"]);
      if (result === "PONG") {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.info("Connected to Redis Pub/Sub");
        this.emit("connected");
      }
    } catch (error) {
      this.logger.error("Failed to connect", { error });
      this.handleReconnect();
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.isConnected = false;

    // Stop all polling
    for (const [key] of this.pollingIntervals) {
      this.stopPolling(key);
    }

    this.subscriptions.clear();
    this.logger.info("Disconnected from Redis Pub/Sub");
    this.emit("disconnected");
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("Max reconnection attempts reached");
      this.emit("error", new Error("Max reconnection attempts reached"));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    this.logger.info(`Reconnecting in ${delay}ms`, {
      attempt: this.reconnectAttempts,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error("Reconnection failed", { error });
      });
    }, delay);
  }

  // ==========================================================================
  // History & Utility
  // ==========================================================================

  /**
   * Get recent messages for a channel
   */
  async getHistory<T>(channel: string, limit: number = 100): Promise<PubSubMessage<T>[]> {
    const key = this.getChannelKey(channel);
    const messages = await this.execute<string[]>([
      "LRANGE",
      `${key}:history`,
      0,
      limit - 1,
    ]);

    return messages
      .map((msg) => {
        try {
          return JSON.parse(msg) as PubSubMessage<T>;
        } catch {
          return null;
        }
      })
      .filter((msg): msg is PubSubMessage<T> => msg !== null);
  }

  /**
   * Get latest price for a market
   */
  async getLatestPrice(marketId: string, source: string): Promise<PriceUpdate | null> {
    const history = await this.getHistory<PriceUpdate>(`price:${source}:${marketId}`, 1);
    return history[0]?.data ?? null;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.execute<string>(["PING"]);
      return result === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Get active subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Check if connected
   */
  isConnectedStatus(): boolean {
    return this.isConnected;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let pubsubInstance: RedisPubSub | null = null;

export function getRedisPubSub(config?: RedisPubSubConfig): RedisPubSub {
  if (!pubsubInstance && config) {
    pubsubInstance = new RedisPubSub(config);
  }

  if (!pubsubInstance) {
    throw new Error("RedisPubSub not initialized. Call with config first.");
  }

  return pubsubInstance;
}

export function initRedisPubSub(config: RedisPubSubConfig): RedisPubSub {
  pubsubInstance = new RedisPubSub(config);
  return pubsubInstance;
}

export default RedisPubSub;
