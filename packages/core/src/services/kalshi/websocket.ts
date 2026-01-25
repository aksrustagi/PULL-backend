/**
 * Kalshi WebSocket Client
 * Real-time market data and user updates via WebSocket
 */

import * as crypto from "crypto";
import { EventEmitter } from "events";
import type {
  WebSocketChannel,
  KalshiWebSocketMessage,
  OrderbookDeltaMessage,
  TickerMessage,
  TradeMessage,
  FillMessage,
  OrderUpdateMessage,
} from "./types";

// ============================================================================
// Types
// ============================================================================

export interface KalshiWebSocketConfig {
  apiKeyId?: string;
  privateKey?: string; // PEM format for authenticated channels
  baseUrl?: string;
  demoMode?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface Subscription {
  channel: WebSocketChannel;
  params: SubscriptionParams;
}

interface SubscriptionParams {
  market_tickers?: string[];
  event_tickers?: string[];
}

type WebSocketEventType =
  | "connected"
  | "disconnected"
  | "error"
  | "orderbook_delta"
  | "ticker"
  | "trade"
  | "fill"
  | "order"
  | "subscribed"
  | "unsubscribed";

type MessageHandler<T = unknown> = (data: T) => void;

const DEFAULT_WS_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
const DEMO_WS_URL = "wss://demo-api.kalshi.co/trade-api/ws/v2";

// ============================================================================
// Kalshi WebSocket Client
// ============================================================================

export class KalshiWebSocket extends EventEmitter {
  private readonly apiKeyId?: string;
  private readonly privateKey?: string;
  private readonly baseUrl: string;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatInterval: number;
  private readonly logger: Logger;

  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting: boolean = false;
  private isAuthenticated: boolean = false;
  private subscriptions: Map<string, Subscription> = new Map();
  private messageId: number = 0;
  private pendingMessages: Map<number, { resolve: Function; reject: Function }> = new Map();

  constructor(config: KalshiWebSocketConfig = {}) {
    super();
    this.apiKeyId = config.apiKeyId;
    this.privateKey = config.privateKey;
    this.baseUrl = config.baseUrl ?? (config.demoMode ? DEMO_WS_URL : DEFAULT_WS_URL);
    this.reconnectInterval = config.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[KalshiWS] ${msg}`, meta),
      info: (msg, meta) => console.info(`[KalshiWS] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[KalshiWS] ${msg}`, meta),
      error: (msg, meta) => console.error(`[KalshiWS] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Establish WebSocket connection
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.logger.debug("Already connected");
      return;
    }

    if (this.isConnecting) {
      this.logger.debug("Connection in progress");
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.logger.info("Connecting to Kalshi WebSocket", { url: this.baseUrl });
        this.ws = new WebSocket(this.baseUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.logger.info("WebSocket connected");

          // Start heartbeat
          this.startHeartbeat();

          // Authenticate if credentials provided
          if (this.apiKeyId && this.privateKey) {
            this.authenticate()
              .then(() => {
                this.emit("connected", { authenticated: true });
                this.resubscribeAll();
                resolve();
              })
              .catch((error) => {
                this.emit("connected", { authenticated: false });
                this.logger.warn("Authentication failed, continuing unauthenticated", { error });
                this.resubscribeAll();
                resolve();
              });
          } else {
            this.emit("connected", { authenticated: false });
            this.resubscribeAll();
            resolve();
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          this.logger.error("WebSocket error", { event });
          this.emit("error", event);
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          this.isAuthenticated = false;
          this.stopHeartbeat();
          // Reject all pending messages on disconnect to prevent memory leaks
          for (const [id, { reject: rejectFn }] of this.pendingMessages) {
            rejectFn(new Error(`WebSocket disconnected (code: ${event.code})`));
          }
          this.pendingMessages.clear();
          this.logger.info("WebSocket disconnected", {
            code: event.code,
            reason: event.reason,
          });
          this.emit("disconnected", { code: event.code, reason: event.reason });

          // Attempt reconnection if not a clean close
          if (event.code !== 1000) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        this.isConnecting = false;
        this.logger.error("Failed to create WebSocket", { error });
        reject(error);
      }
    });
  }

  /**
   * Clean disconnect from WebSocket
   */
  disconnect(): void {
    this.logger.info("Disconnecting WebSocket");
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.subscriptions.clear();
    this.pendingMessages.clear();
    this.isAuthenticated = false;
  }

  /**
   * Authenticate the WebSocket connection
   */
  private async authenticate(): Promise<void> {
    if (!this.apiKeyId || !this.privateKey) {
      throw new Error("API credentials required for authentication");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${timestamp}GET/trade-api/ws/v2`;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(message);
    sign.end();

    const signature = sign.sign(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      "base64"
    );

    const authMessage = {
      id: this.getNextMessageId(),
      cmd: "auth",
      params: {
        api_key: this.apiKeyId,
        timestamp: timestamp.toString(),
        signature,
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingMessages.delete(authMessage.id);
        reject(new Error("Authentication timeout"));
      }, 10000);

      this.pendingMessages.set(authMessage.id, {
        resolve: () => {
          clearTimeout(timeoutId);
          this.isAuthenticated = true;
          this.logger.info("WebSocket authenticated");
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.send(authMessage);
    });
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(): void {
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
      maxAttempts: this.maxReconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error("Reconnection failed", { error });
      });
    }, delay);
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private async resubscribeAll(): Promise<void> {
    for (const [, subscription] of this.subscriptions) {
      try {
        await this.subscribe(subscription.channel, subscription.params);
      } catch (error) {
        this.logger.error("Failed to resubscribe", {
          channel: subscription.channel,
          error,
        });
      }
    }
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ id: this.getNextMessageId(), cmd: "ping" });
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: WebSocketChannel, params: SubscriptionParams = {}): Promise<void> {
    const key = this.getSubscriptionKey(channel, params);

    // Check if auth is required for this channel
    const requiresAuth = channel === "fill" || channel === "order";
    if (requiresAuth && !this.isAuthenticated) {
      throw new Error(`Channel ${channel} requires authentication`);
    }

    const message = {
      id: this.getNextMessageId(),
      cmd: "subscribe",
      params: {
        channels: [channel],
        ...params,
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingMessages.delete(message.id);
        reject(new Error("Subscription timeout"));
      }, 10000);

      this.pendingMessages.set(message.id, {
        resolve: () => {
          clearTimeout(timeoutId);
          this.subscriptions.set(key, { channel, params });
          this.logger.debug("Subscribed to channel", { channel, params });
          this.emit("subscribed", { channel, params });
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.send(message);
    });
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: WebSocketChannel, params: SubscriptionParams = {}): Promise<void> {
    const key = this.getSubscriptionKey(channel, params);

    if (!this.subscriptions.has(key)) {
      this.logger.debug("Not subscribed to channel", { channel, params });
      return;
    }

    const message = {
      id: this.getNextMessageId(),
      cmd: "unsubscribe",
      params: {
        channels: [channel],
        ...params,
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingMessages.delete(message.id);
        reject(new Error("Unsubscription timeout"));
      }, 10000);

      this.pendingMessages.set(message.id, {
        resolve: () => {
          clearTimeout(timeoutId);
          this.subscriptions.delete(key);
          this.logger.debug("Unsubscribed from channel", { channel, params });
          this.emit("unsubscribed", { channel, params });
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.send(message);
    });
  }

  private getSubscriptionKey(channel: WebSocketChannel, params: SubscriptionParams): string {
    return `${channel}:${JSON.stringify(params)}`;
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle response to a command
      if (message.id !== undefined && this.pendingMessages.has(message.id)) {
        const { resolve, reject } = this.pendingMessages.get(message.id)!;
        this.pendingMessages.delete(message.id);

        if (message.error) {
          reject(new Error(message.error.msg || "Unknown error"));
        } else {
          resolve(message);
        }
        return;
      }

      // Handle pong
      if (message.type === "pong") {
        return;
      }

      // Handle channel messages
      if (message.type && message.msg) {
        this.handleChannelMessage(message as KalshiWebSocketMessage);
      }
    } catch (error) {
      this.logger.error("Failed to parse message", { data, error });
    }
  }

  private handleChannelMessage(message: KalshiWebSocketMessage): void {
    switch (message.type) {
      case "orderbook_delta":
        this.emit("orderbook_delta", (message as OrderbookDeltaMessage).msg);
        break;
      case "ticker":
        this.emit("ticker", (message as TickerMessage).msg);
        break;
      case "trade":
        this.emit("trade", (message as TradeMessage).msg);
        break;
      case "fill":
        this.emit("fill", (message as FillMessage).msg);
        break;
      case "order":
        this.emit("order", (message as OrderUpdateMessage).msg);
        break;
      default:
        this.logger.debug("Unknown message type", { message });
    }
  }

  // ==========================================================================
  // Event Handlers with Types
  // ==========================================================================

  /**
   * Add typed event listener
   */
  on(event: "connected", handler: MessageHandler<{ authenticated: boolean }>): this;
  on(event: "disconnected", handler: MessageHandler<{ code: number; reason: string }>): this;
  on(event: "error", handler: MessageHandler<Error | Event>): this;
  on(event: "orderbook_delta", handler: MessageHandler<OrderbookDeltaMessage["msg"]>): this;
  on(event: "ticker", handler: MessageHandler<TickerMessage["msg"]>): this;
  on(event: "trade", handler: MessageHandler<TradeMessage["msg"]>): this;
  on(event: "fill", handler: MessageHandler<FillMessage["msg"]>): this;
  on(event: "order", handler: MessageHandler<OrderUpdateMessage["msg"]>): this;
  on(event: "subscribed", handler: MessageHandler<{ channel: WebSocketChannel; params: SubscriptionParams }>): this;
  on(event: "unsubscribed", handler: MessageHandler<{ channel: WebSocketChannel; params: SubscriptionParams }>): this;
  on(event: WebSocketEventType, handler: MessageHandler): this {
    return super.on(event, handler);
  }

  /**
   * Add one-time typed event listener
   */
  once(event: "connected", handler: MessageHandler<{ authenticated: boolean }>): this;
  once(event: "disconnected", handler: MessageHandler<{ code: number; reason: string }>): this;
  once(event: "error", handler: MessageHandler<Error | Event>): this;
  once(event: WebSocketEventType, handler: MessageHandler): this {
    return super.once(event, handler);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  private getNextMessageId(): number {
    return ++this.messageId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if authenticated
   */
  isAuthenticatedConnection(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get current subscriptions
   */
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }
}

export default KalshiWebSocket;
