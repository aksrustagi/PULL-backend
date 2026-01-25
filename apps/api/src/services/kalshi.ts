/**
 * Kalshi API Client for PULL
 * Implements the full Kalshi trading API with RSA-PSS signing
 */

import { webcrypto } from "crypto";
import { getLogger } from "@pull/core/services";

const logger = getLogger().child({ service: "kalshi" });

// Configuration
const KALSHI_BASE_URL =
  process.env.KALSHI_BASE_URL ?? "https://trading-api.kalshi.com/trade-api/v2";
const KALSHI_WS_URL =
  process.env.KALSHI_WS_URL ?? "wss://trading-api.kalshi.com/trade-api/ws/v2";

/**
 * Kalshi API response types
 */
export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  open_interest: number;
  result?: string;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  category: string;
  mutually_exclusive: boolean;
  markets: KalshiMarket[];
}

export interface KalshiOrderbook {
  ticker: string;
  yes_bids: { price: number; quantity: number }[];
  yes_asks: { price: number; quantity: number }[];
  no_bids: { price: number; quantity: number }[];
  no_asks: { price: number; quantity: number }[];
}

export interface KalshiOrder {
  order_id: string;
  user_id: string;
  ticker: string;
  status: string;
  yes_price?: number;
  no_price?: number;
  side: "yes" | "no";
  action: "buy" | "sell";
  type: "market" | "limit";
  count: number;
  remaining_count: number;
  created_time: string;
  expiration_time?: string;
}

export interface KalshiPosition {
  ticker: string;
  event_ticker: string;
  market_exposure: number;
  total_traded: number;
  realized_pnl: number;
  position: number;
  resting_order_count: number;
}

export interface KalshiFill {
  trade_id: string;
  order_id: string;
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  count: number;
  yes_price?: number;
  no_price?: number;
  is_taker: boolean;
  created_time: string;
}

export interface KalshiBalance {
  balance: number;
  available_balance: number;
  payout_available: number;
}

/**
 * Order creation parameters
 */
export interface CreateOrderParams {
  ticker: string;
  client_order_id?: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  type: "market" | "limit";
  count: number;
  yes_price?: number;
  no_price?: number;
  expiration_ts?: number;
  sell_position_floor?: number;
  buy_max_cost?: number;
}

/**
 * Kalshi API Client
 */
export class KalshiClient {
  private apiKey: string;
  private privateKey: CryptoKey | null = null;
  private privateKeyPem: string;
  private memberId: string | null = null;

  constructor(apiKey: string, privateKeyPem: string) {
    this.apiKey = apiKey;
    this.privateKeyPem = privateKeyPem;
  }

  /**
   * Initialize the client (load private key)
   */
  async initialize(): Promise<void> {
    this.privateKey = await this.importPrivateKey(this.privateKeyPem);
  }

  /**
   * Import RSA private key from PEM format
   */
  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    // Remove PEM headers and decode base64
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
      .replace(/-----END RSA PRIVATE KEY-----/, "")
      .replace(/\s/g, "");

    const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

    return await webcrypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      {
        name: "RSA-PSS",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
  }

  /**
   * Generate RSA-PSS signature for request
   */
  private async signRequest(
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): Promise<string> {
    if (!this.privateKey) {
      throw new Error("Client not initialized. Call initialize() first.");
    }

    const message = `${timestamp}${method}${path}${body ?? ""}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const signature = await webcrypto.subtle.sign(
      {
        name: "RSA-PSS",
        saltLength: 32,
      },
      this.privateKey,
      data
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Make authenticated request to Kalshi API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const signature = await this.signRequest(timestamp, method, path, bodyStr);

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": this.apiKey,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
    };

    const response = await fetch(`${KALSHI_BASE_URL}${path}`, {
      method,
      headers,
      body: bodyStr,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new KalshiApiError(
        response.status,
        (error as { message?: string }).message ?? "API request failed",
        error
      );
    }

    return response.json() as Promise<T>;
  }

  // =========================================================================
  // Market Data Endpoints
  // =========================================================================

  /**
   * Get available markets
   */
  async getMarkets(params?: {
    limit?: number;
    cursor?: string;
    event_ticker?: string;
    series_ticker?: string;
    status?: string;
  }): Promise<{ markets: KalshiMarket[]; cursor: string }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.cursor) queryParams.set("cursor", params.cursor);
    if (params?.event_ticker)
      queryParams.set("event_ticker", params.event_ticker);
    if (params?.series_ticker)
      queryParams.set("series_ticker", params.series_ticker);
    if (params?.status) queryParams.set("status", params.status);

    const path = `/markets${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    return this.request<{ markets: KalshiMarket[]; cursor: string }>(
      "GET",
      path
    );
  }

  /**
   * Get a single market by ticker
   */
  async getMarket(ticker: string): Promise<{ market: KalshiMarket }> {
    return this.request<{ market: KalshiMarket }>("GET", `/markets/${ticker}`);
  }

  /**
   * Get orderbook for a market
   */
  async getOrderbook(ticker: string, depth?: number): Promise<KalshiOrderbook> {
    const path = `/markets/${ticker}/orderbook${depth ? `?depth=${depth}` : ""}`;
    return this.request<KalshiOrderbook>("GET", path);
  }

  /**
   * Get events
   */
  async getEvents(params?: {
    limit?: number;
    cursor?: string;
    status?: string;
    series_ticker?: string;
  }): Promise<{ events: KalshiEvent[]; cursor: string }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.cursor) queryParams.set("cursor", params.cursor);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.series_ticker)
      queryParams.set("series_ticker", params.series_ticker);

    const path = `/events${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    return this.request<{ events: KalshiEvent[]; cursor: string }>("GET", path);
  }

  /**
   * Get a single event by ticker
   */
  async getEvent(eventTicker: string): Promise<{ event: KalshiEvent }> {
    return this.request<{ event: KalshiEvent }>("GET", `/events/${eventTicker}`);
  }

  // =========================================================================
  // Trading Endpoints
  // =========================================================================

  /**
   * Create a new order
   */
  async createOrder(params: CreateOrderParams): Promise<{ order: KalshiOrder }> {
    return this.request<{ order: KalshiOrder }>("POST", "/portfolio/orders", params);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ order: KalshiOrder }> {
    return this.request<{ order: KalshiOrder }>(
      "DELETE",
      `/portfolio/orders/${orderId}`
    );
  }

  /**
   * Amend an order
   */
  async amendOrder(
    orderId: string,
    changes: { count?: number; yes_price?: number; no_price?: number }
  ): Promise<{ order: KalshiOrder }> {
    return this.request<{ order: KalshiOrder }>(
      "PATCH",
      `/portfolio/orders/${orderId}`,
      changes
    );
  }

  /**
   * Get user orders
   */
  async getOrders(params?: {
    ticker?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ orders: KalshiOrder[]; cursor: string }> {
    const queryParams = new URLSearchParams();
    if (params?.ticker) queryParams.set("ticker", params.ticker);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.cursor) queryParams.set("cursor", params.cursor);

    const path = `/portfolio/orders${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    return this.request<{ orders: KalshiOrder[]; cursor: string }>("GET", path);
  }

  /**
   * Get a single order
   */
  async getOrder(orderId: string): Promise<{ order: KalshiOrder }> {
    return this.request<{ order: KalshiOrder }>(
      "GET",
      `/portfolio/orders/${orderId}`
    );
  }

  /**
   * Get user positions
   */
  async getPositions(params?: {
    ticker?: string;
    event_ticker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ market_positions: KalshiPosition[]; cursor: string }> {
    const queryParams = new URLSearchParams();
    if (params?.ticker) queryParams.set("ticker", params.ticker);
    if (params?.event_ticker)
      queryParams.set("event_ticker", params.event_ticker);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.cursor) queryParams.set("cursor", params.cursor);

    const path = `/portfolio/positions${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    return this.request<{ market_positions: KalshiPosition[]; cursor: string }>(
      "GET",
      path
    );
  }

  /**
   * Get fills/executions
   */
  async getFills(params?: {
    ticker?: string;
    order_id?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ fills: KalshiFill[]; cursor: string }> {
    const queryParams = new URLSearchParams();
    if (params?.ticker) queryParams.set("ticker", params.ticker);
    if (params?.order_id) queryParams.set("order_id", params.order_id);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.cursor) queryParams.set("cursor", params.cursor);

    const path = `/portfolio/fills${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    return this.request<{ fills: KalshiFill[]; cursor: string }>("GET", path);
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<KalshiBalance> {
    return this.request<KalshiBalance>("GET", "/portfolio/balance");
  }

  // =========================================================================
  // WebSocket Connection
  // =========================================================================

  /**
   * Create WebSocket connection for real-time data
   */
  connectWebSocket(): KalshiWebSocket {
    return new KalshiWebSocket(KALSHI_WS_URL, this.apiKey, this.privateKey!);
  }
}

/**
 * Kalshi WebSocket client for real-time data
 */
export class KalshiWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private apiKey: string;
  private privateKey: CryptoKey;
  private subscriptions: Map<string, Set<string>> = new Map();
  private messageHandlers: Map<string, (data: unknown) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url: string, apiKey: string, privateKey: CryptoKey) {
    this.url = url;
    this.apiKey = apiKey;
    this.privateKey = privateKey;
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = async () => {
        console.log("Kalshi WebSocket connected");
        await this.authenticate();
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data as string));
      };

      this.ws.onerror = (error) => {
        console.error("Kalshi WebSocket error:", error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("Kalshi WebSocket closed");
        this.attemptReconnect();
      };
    });
  }

  /**
   * Authenticate the WebSocket connection
   */
  private async authenticate(): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${timestamp}GET/trade-api/ws/v2`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const signature = await webcrypto.subtle.sign(
      { name: "RSA-PSS", saltLength: 32 },
      this.privateKey,
      data
    );

    const signatureBase64 = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    );

    this.send({
      type: "auth",
      params: {
        api_key: this.apiKey,
        timestamp,
        signature: signatureBase64,
      },
    });
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeOrderbook(
    tickers: string[],
    onUpdate: (data: KalshiOrderbook) => void
  ): void {
    this.subscriptions.set("orderbook_delta", new Set(tickers));
    this.messageHandlers.set("orderbook_delta", onUpdate as (data: unknown) => void);

    this.send({
      type: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: tickers,
      },
    });
  }

  /**
   * Subscribe to order updates (user's orders)
   */
  subscribeOrders(onUpdate: (data: KalshiOrder) => void): void {
    this.messageHandlers.set("order", onUpdate as (data: unknown) => void);

    this.send({
      type: "subscribe",
      params: {
        channels: ["order_fill"],
      },
    });
  }

  /**
   * Subscribe to fill updates
   */
  subscribeFills(onFill: (data: KalshiFill) => void): void {
    this.messageHandlers.set("fill", onFill as (data: unknown) => void);

    this.send({
      type: "subscribe",
      params: {
        channels: ["fill"],
      },
    });
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.messageHandlers.delete(channel);

    this.send({
      type: "unsubscribe",
      params: {
        channels: [channel],
      },
    });
  }

  /**
   * Send message through WebSocket
   */
  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: { type: string; msg: unknown }): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.msg);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts})`);
      this.connect().catch(console.error);
    }, delay);
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

/**
 * Kalshi API Error
 */
export class KalshiApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "KalshiApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Create and initialize a Kalshi client
 */
export async function createKalshiClient(): Promise<KalshiClient | null> {
  const apiKey = process.env.KALSHI_API_KEY;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    console.warn("Kalshi credentials not configured");
    return null;
  }

  const client = new KalshiClient(apiKey, privateKey);
  await client.initialize();
  return client;
}

// Singleton instance
let kalshiClientInstance: KalshiClient | null = null;

/**
 * Get the Kalshi client singleton
 */
export async function getKalshiClient(): Promise<KalshiClient | null> {
  if (!kalshiClientInstance) {
    kalshiClientInstance = await createKalshiClient();
  }
  return kalshiClientInstance;
}
