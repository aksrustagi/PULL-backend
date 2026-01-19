/**
 * Massive API Client
 *
 * Integration with Massive API for order execution and market data.
 * Supports both REST API and WebSocket for real-time data.
 */

import { EventEmitter } from "events";

// =============================================================================
// TYPES
// =============================================================================

export interface MassiveConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  wsUrl: string;
  testMode?: boolean;
}

export interface MassiveOrder {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  quantity: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  clientOrderId?: string;
}

export interface MassiveOrderResponse {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  quantity: string;
  executedQty: string;
  price?: string;
  avgPrice?: string;
  commission?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookUpdate {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface TradeUpdate {
  symbol: string;
  tradeId: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}

export interface TickerUpdate {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

// =============================================================================
// MASSIVE CLIENT
// =============================================================================

export class MassiveClient extends EventEmitter {
  private config: MassiveConfig;
  private ws: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private wsMaxReconnectAttempts = 5;
  private subscriptions = new Map<string, Set<(data: unknown) => void>>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MassiveConfig) {
    super();
    this.config = config;
  }

  // ===========================================================================
  // REST API - Orders
  // ===========================================================================

  /**
   * Submit a new order
   */
  async submitOrder(order: MassiveOrder): Promise<MassiveOrderResponse> {
    const response = await this.request("POST", "/v1/orders", order);
    return response as MassiveOrderResponse;
  }

  /**
   * Get order status by ID
   */
  async getOrder(orderId: string): Promise<MassiveOrderResponse> {
    const response = await this.request("GET", `/v1/orders/${orderId}`);
    return response as MassiveOrderResponse;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    const response = await this.request("DELETE", `/v1/orders/${orderId}`);
    return response as { success: boolean };
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(symbol?: string): Promise<MassiveOrderResponse[]> {
    const params = symbol ? `?symbol=${symbol}` : "";
    const response = await this.request("GET", `/v1/orders/open${params}`);
    return response as MassiveOrderResponse[];
  }

  /**
   * Get order history
   */
  async getOrderHistory(params?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<MassiveOrderResponse[]> {
    const queryParams = new URLSearchParams();
    if (params?.symbol) queryParams.set("symbol", params.symbol);
    if (params?.startTime) queryParams.set("startTime", params.startTime.toString());
    if (params?.endTime) queryParams.set("endTime", params.endTime.toString());
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/orders/history${query}`);
    return response as MassiveOrderResponse[];
  }

  // ===========================================================================
  // REST API - Market Data
  // ===========================================================================

  /**
   * Get current ticker for a symbol
   */
  async getTicker(symbol: string): Promise<TickerUpdate> {
    const response = await this.request("GET", `/v1/ticker/${symbol}`);
    return response as TickerUpdate;
  }

  /**
   * Get all tickers
   */
  async getAllTickers(): Promise<TickerUpdate[]> {
    const response = await this.request("GET", "/v1/tickers");
    return response as TickerUpdate[];
  }

  /**
   * Get order book for a symbol
   */
  async getOrderBook(symbol: string, depth = 20): Promise<OrderBookUpdate> {
    const response = await this.request("GET", `/v1/orderbook/${symbol}?depth=${depth}`);
    return response as OrderBookUpdate;
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(symbol: string, limit = 50): Promise<TradeUpdate[]> {
    const response = await this.request("GET", `/v1/trades/${symbol}?limit=${limit}`);
    return response as TradeUpdate[];
  }

  /**
   * Get asset information
   */
  async getAsset(assetId: string): Promise<{
    id: string;
    symbol: string;
    name: string;
    price: string;
    minOrderSize: string;
    maxOrderSize: string;
    priceIncrement: string;
    sizeIncrement: string;
    tradingEnabled: boolean;
  }> {
    const response = await this.request("GET", `/v1/assets/${assetId}`);
    return response as any;
  }

  // ===========================================================================
  // REST API - Account
  // ===========================================================================

  /**
   * Get account balances
   */
  async getBalances(): Promise<
    Array<{
      asset: string;
      available: string;
      locked: string;
    }>
  > {
    const response = await this.request("GET", "/v1/account/balances");
    return response as any[];
  }

  // ===========================================================================
  // WebSocket - Real-time Data
  // ===========================================================================

  /**
   * Connect to WebSocket for real-time data
   */
  async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.onopen = () => {
          console.log("[Massive WS] Connected");
          this.wsReconnectAttempts = 0;

          // Authenticate
          this.sendWsMessage({
            type: "auth",
            apiKey: this.config.apiKey,
            signature: this.signRequest({ timestamp: Date.now() }),
            timestamp: Date.now(),
          });

          // Start ping interval
          this.pingInterval = setInterval(() => {
            this.sendWsMessage({ type: "ping" });
          }, 30000);

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string);
            this.handleWsMessage(message);
          } catch (error) {
            console.error("[Massive WS] Parse error:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[Massive WS] Error:", error);
          this.emit("error", error);
        };

        this.ws.onclose = () => {
          console.log("[Massive WS] Disconnected");
          this.cleanup();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to order book updates
   */
  subscribeOrderBook(symbol: string, callback: (data: OrderBookUpdate) => void): void {
    this.subscribe(`orderbook:${symbol}`, callback);
    this.sendWsMessage({
      type: "subscribe",
      channel: "orderbook",
      symbol,
    });
  }

  /**
   * Subscribe to trade updates
   */
  subscribeTrades(symbol: string, callback: (data: TradeUpdate) => void): void {
    this.subscribe(`trades:${symbol}`, callback);
    this.sendWsMessage({
      type: "subscribe",
      channel: "trades",
      symbol,
    });
  }

  /**
   * Subscribe to ticker updates
   */
  subscribeTicker(symbol: string, callback: (data: TickerUpdate) => void): void {
    this.subscribe(`ticker:${symbol}`, callback);
    this.sendWsMessage({
      type: "subscribe",
      channel: "ticker",
      symbol,
    });
  }

  /**
   * Subscribe to user order updates
   */
  subscribeUserOrders(callback: (data: MassiveOrderResponse) => void): void {
    this.subscribe("user:orders", callback);
    this.sendWsMessage({
      type: "subscribe",
      channel: "user_orders",
    });
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.sendWsMessage({
      type: "unsubscribe",
      channel,
    });
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const timestamp = Date.now();
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
      "X-Timestamp": timestamp.toString(),
      "X-Signature": this.signRequest({ method, path, body, timestamp }),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Massive API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private signRequest(data: unknown): string {
    const crypto = require("crypto");
    const payload = JSON.stringify(data);
    return crypto
      .createHmac("sha256", this.config.apiSecret)
      .update(payload)
      .digest("hex");
  }

  private sendWsMessage(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleWsMessage(message: {
    type: string;
    channel?: string;
    data?: unknown;
  }): void {
    switch (message.type) {
      case "auth":
        console.log("[Massive WS] Authenticated");
        this.emit("authenticated");
        break;

      case "pong":
        // Heartbeat response
        break;

      case "orderbook":
      case "trades":
      case "ticker":
        if (message.channel) {
          const callbacks = this.subscriptions.get(message.channel);
          callbacks?.forEach((cb) => cb(message.data));
        }
        break;

      case "user_orders":
        const orderCallbacks = this.subscriptions.get("user:orders");
        orderCallbacks?.forEach((cb) => cb(message.data));
        this.emit("orderUpdate", message.data);
        break;

      case "error":
        console.error("[Massive WS] Error:", message.data);
        this.emit("error", message.data);
        break;
    }
  }

  private subscribe(channel: string, callback: (data: any) => void): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
      this.wsReconnectAttempts++;
      const delay = Math.pow(2, this.wsReconnectAttempts) * 1000;
      console.log(`[Massive WS] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);

      setTimeout(() => {
        this.connectWebSocket().catch((error) => {
          console.error("[Massive WS] Reconnect failed:", error);
        });
      }, delay);
    } else {
      console.error("[Massive WS] Max reconnect attempts reached");
      this.emit("disconnected");
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let massiveClient: MassiveClient | null = null;

export function getMassiveClient(): MassiveClient {
  if (!massiveClient) {
    massiveClient = new MassiveClient({
      apiKey: process.env.MASSIVE_API_KEY!,
      apiSecret: process.env.MASSIVE_API_SECRET!,
      baseUrl: process.env.MASSIVE_BASE_URL!,
      wsUrl: process.env.MASSIVE_WS_URL!,
      testMode: process.env.NODE_ENV !== "production",
    });
  }
  return massiveClient;
}
