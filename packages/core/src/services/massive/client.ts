/**
 * Massive Trading API Client
 * Client for crypto/RWA order execution
 */

import * as crypto from "crypto";
import type {
  MassiveOrderRequest,
  MassiveOrder,
  MassiveFill,
  MassivePosition,
  MassiveAccount,
  MassiveTicker,
  MassiveOrderbook,
  MassiveMarket,
  RWAAsset,
  RWATransfer,
  MassiveWebhookPayload,
} from "./types";
import { MassiveApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface MassiveClientConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  wsUrl?: string;
  webhookSecret?: string;
  timeout?: number;
  maxRetries?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_BASE_URL = "https://api.massive.com";
const DEFAULT_WS_URL = "wss://ws.massive.com";

// ============================================================================
// Massive Client
// ============================================================================

export class MassiveClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly webhookSecret?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(config: MassiveClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.wsUrl = config.wsUrl ?? DEFAULT_WS_URL;
    this.webhookSecret = config.webhookSecret;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Massive] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Massive] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Massive] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Massive] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Authentication & Signing
  // ==========================================================================

  /**
   * Generate HMAC signature for authenticated requests
   */
  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    body: string = ""
  ): string {
    const message = `${timestamp}${method.toUpperCase()}${path}${body}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(message)
      .digest("hex");
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    authenticated: boolean = true
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (authenticated) {
      const signature = this.generateSignature(timestamp, method, endpoint, bodyStr);
      headers["X-API-Key"] = this.apiKey;
      headers["X-Timestamp"] = timestamp;
      headers["X-Signature"] = signature;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? bodyStr : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new MassiveApiError(
            errorBody.message ?? `HTTP ${response.status}`,
            response.status,
            errorBody.code,
            errorBody.details
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof MassiveApiError) {
          // Don't retry on 4xx errors (except 429)
          if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
            throw error;
          }

          // Rate limit - exponential backoff
          if (error.statusCode === 429 && attempt < this.maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
            this.logger.warn(`Rate limited, waiting ${waitTime}ms`, { attempt });
            await this.sleep(waitTime);
            continue;
          }
        }

        // Retry on network errors
        if (attempt < this.maxRetries) {
          const waitTime = 1000 * Math.pow(2, attempt);
          this.logger.warn(`Request failed, retrying in ${waitTime}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(waitTime);
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return "";

    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

    return entries.length > 0 ? `?${entries.join("&")}` : "";
  }

  // ==========================================================================
  // Order Methods
  // ==========================================================================

  /**
   * Submit a new order
   */
  async submitOrder(order: MassiveOrderRequest): Promise<MassiveOrder> {
    this.logger.info("Submitting order", {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
    });

    const response = await this.request<{ order: MassiveOrder }>(
      "POST",
      "/v1/orders",
      order
    );

    this.logger.info("Order submitted", { orderId: response.order.orderId });
    return response.order;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<MassiveOrder> {
    const response = await this.request<{ order: MassiveOrder }>(
      "GET",
      `/v1/orders/${orderId}`
    );
    return response.order;
  }

  /**
   * Get order by client order ID
   */
  async getOrderByClientId(clientOrderId: string): Promise<MassiveOrder> {
    const response = await this.request<{ order: MassiveOrder }>(
      "GET",
      `/v1/orders/client/${clientOrderId}`
    );
    return response.order;
  }

  /**
   * List orders with optional filters
   */
  async getOrders(params?: {
    symbol?: string;
    status?: string;
    side?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ orders: MassiveOrder[]; cursor?: string }> {
    const queryString = this.buildQueryString(params);
    return this.request<{ orders: MassiveOrder[]; cursor?: string }>(
      "GET",
      `/v1/orders${queryString}`
    );
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<MassiveOrder> {
    this.logger.info("Canceling order", { orderId });

    const response = await this.request<{ order: MassiveOrder }>(
      "DELETE",
      `/v1/orders/${orderId}`
    );

    this.logger.info("Order canceled", { orderId });
    return response.order;
  }

  /**
   * Cancel all open orders
   */
  async cancelAllOrders(symbol?: string): Promise<{ canceled: string[] }> {
    this.logger.info("Canceling all orders", { symbol });

    const endpoint = symbol
      ? `/v1/orders?symbol=${encodeURIComponent(symbol)}`
      : "/v1/orders";

    const response = await this.request<{ canceled: string[] }>("DELETE", endpoint);

    this.logger.info("Orders canceled", { count: response.canceled.length });
    return response;
  }

  /**
   * Amend an existing order
   */
  async amendOrder(
    orderId: string,
    changes: { price?: number; quantity?: number; stopPrice?: number }
  ): Promise<MassiveOrder> {
    this.logger.info("Amending order", { orderId, changes });

    const response = await this.request<{ order: MassiveOrder }>(
      "PATCH",
      `/v1/orders/${orderId}`,
      changes
    );

    return response.order;
  }

  // ==========================================================================
  // Fill Methods
  // ==========================================================================

  /**
   * Get fills for an order
   */
  async getOrderFills(orderId: string): Promise<MassiveFill[]> {
    const response = await this.request<{ fills: MassiveFill[] }>(
      "GET",
      `/v1/orders/${orderId}/fills`
    );
    return response.fills;
  }

  /**
   * Get all fills with optional filters
   */
  async getFills(params?: {
    symbol?: string;
    orderId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ fills: MassiveFill[]; cursor?: string }> {
    const queryString = this.buildQueryString(params);
    return this.request<{ fills: MassiveFill[]; cursor?: string }>(
      "GET",
      `/v1/account/fills${queryString}`
    );
  }

  // ==========================================================================
  // Position Methods
  // ==========================================================================

  /**
   * Get all positions
   */
  async getPositions(): Promise<MassivePosition[]> {
    const response = await this.request<{ positions: MassivePosition[] }>(
      "GET",
      "/v1/positions"
    );
    return response.positions;
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol: string): Promise<MassivePosition | null> {
    try {
      const response = await this.request<{ position: MassivePosition }>(
        "GET",
        `/v1/positions/${symbol}`
      );
      return response.position;
    } catch (error) {
      if (error instanceof MassiveApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Close a position
   */
  async closePosition(symbol: string): Promise<MassiveOrder> {
    this.logger.info("Closing position", { symbol });

    const response = await this.request<{ order: MassiveOrder }>(
      "POST",
      `/v1/positions/${symbol}/close`
    );

    return response.order;
  }

  // ==========================================================================
  // Account Methods
  // ==========================================================================

  /**
   * Get account details
   */
  async getAccount(): Promise<MassiveAccount> {
    const response = await this.request<{ account: MassiveAccount }>(
      "GET",
      "/v1/account"
    );
    return response.account;
  }

  /**
   * Get account balance summary
   */
  async getBalance(): Promise<{
    cash: number;
    buyingPower: number;
    equity: number;
  }> {
    const account = await this.getAccount();
    return {
      cash: account.balances.find((b) => b.currency === "USD")?.available ?? 0,
      buyingPower: account.buyingPower,
      equity: account.equity,
    };
  }

  // ==========================================================================
  // Market Data Methods
  // ==========================================================================

  /**
   * Get ticker for a symbol
   */
  async getTicker(symbol: string): Promise<MassiveTicker> {
    const response = await this.request<{ ticker: MassiveTicker }>(
      "GET",
      `/v1/markets/${symbol}/ticker`,
      undefined,
      false
    );
    return response.ticker;
  }

  /**
   * Get orderbook for a symbol
   */
  async getOrderbook(symbol: string, depth: number = 20): Promise<MassiveOrderbook> {
    const response = await this.request<{ orderbook: MassiveOrderbook }>(
      "GET",
      `/v1/markets/${symbol}/orderbook?depth=${depth}`,
      undefined,
      false
    );
    return response.orderbook;
  }

  /**
   * Get all available markets
   */
  async getMarkets(): Promise<MassiveMarket[]> {
    const response = await this.request<{ markets: MassiveMarket[] }>(
      "GET",
      "/v1/markets",
      undefined,
      false
    );
    return response.markets;
  }

  /**
   * Get market details
   */
  async getMarket(symbol: string): Promise<MassiveMarket> {
    const response = await this.request<{ market: MassiveMarket }>(
      "GET",
      `/v1/markets/${symbol}`,
      undefined,
      false
    );
    return response.market;
  }

  // ==========================================================================
  // RWA Methods
  // ==========================================================================

  /**
   * Get available RWA assets
   */
  async getRWAAssets(): Promise<RWAAsset[]> {
    const response = await this.request<{ assets: RWAAsset[] }>(
      "GET",
      "/v1/rwa/assets"
    );
    return response.assets;
  }

  /**
   * Get RWA asset by ID
   */
  async getRWAAsset(assetId: string): Promise<RWAAsset> {
    const response = await this.request<{ asset: RWAAsset }>(
      "GET",
      `/v1/rwa/assets/${assetId}`
    );
    return response.asset;
  }

  /**
   * Initiate RWA transfer
   */
  async initiateRWATransfer(params: {
    assetId: string;
    to: string;
    quantity: number;
  }): Promise<RWATransfer> {
    this.logger.info("Initiating RWA transfer", params);

    const response = await this.request<{ transfer: RWATransfer }>(
      "POST",
      "/v1/rwa/transfers",
      params
    );

    this.logger.info("RWA transfer initiated", { transferId: response.transfer.transferId });
    return response.transfer;
  }

  /**
   * Get RWA transfer status
   */
  async getRWATransfer(transferId: string): Promise<RWATransfer> {
    const response = await this.request<{ transfer: RWATransfer }>(
      "GET",
      `/v1/rwa/transfers/${transferId}`
    );
    return response.transfer;
  }

  /**
   * List RWA transfers
   */
  async getRWATransfers(params?: {
    assetId?: string;
    status?: string;
    limit?: number;
  }): Promise<RWATransfer[]> {
    const queryString = this.buildQueryString(params);
    const response = await this.request<{ transfers: RWATransfer[] }>(
      "GET",
      `/v1/rwa/transfers${queryString}`
    );
    return response.transfers;
  }

  // ==========================================================================
  // Webhook Verification
  // ==========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
    timestamp: string
  ): { valid: boolean; payload?: MassiveWebhookPayload } {
    if (!this.webhookSecret) {
      this.logger.warn("Webhook secret not configured");
      return { valid: false };
    }

    try {
      const body = typeof payload === "string" ? payload : payload.toString("utf8");

      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex");

      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature, "hex")
      );

      if (valid) {
        const parsedPayload = JSON.parse(body) as MassiveWebhookPayload;
        this.logger.debug("Webhook verified", { event: parsedPayload.event });
        return { valid: true, payload: parsedPayload };
      }

      this.logger.warn("Webhook signature mismatch");
      return { valid: false };
    } catch (error) {
      this.logger.error("Webhook verification failed", { error });
      return { valid: false };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get WebSocket URL for real-time data
   */
  getWebSocketUrl(): string {
    return this.wsUrl;
  }

  /**
   * Paginate through all orders
   */
  async *paginateOrders(
    params?: Omit<Parameters<typeof this.getOrders>[0], "cursor">
  ): AsyncGenerator<MassiveOrder> {
    let cursor: string | undefined;

    do {
      const response = await this.getOrders({ ...params, cursor });
      for (const order of response.orders) {
        yield order;
      }
      cursor = response.cursor;
    } while (cursor);
  }

  /**
   * Paginate through all fills
   */
  async *paginateFills(
    params?: Omit<Parameters<typeof this.getFills>[0], "cursor">
  ): AsyncGenerator<MassiveFill> {
    let cursor: string | undefined;

    do {
      const response = await this.getFills({ ...params, cursor });
      for (const fill of response.fills) {
        yield fill;
      }
      cursor = response.cursor;
    } while (cursor);
  }
}

// ============================================================================
// Simple Client Factory
// ============================================================================

/**
 * Create a Massive client from environment variables
 */
export function createMassiveClient(): MassiveClient {
  const apiKey = process.env.MASSIVE_API_KEY;
  const apiSecret = process.env.MASSIVE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("MASSIVE_API_KEY and MASSIVE_API_SECRET environment variables are required");
  }

  return new MassiveClient({
    apiKey,
    apiSecret,
    baseUrl: process.env.MASSIVE_BASE_URL,
    wsUrl: process.env.MASSIVE_WS_URL,
    webhookSecret: process.env.MASSIVE_WEBHOOK_SECRET,
  });
}

/**
 * Simple functional client for quick usage
 */
export const massiveClient = {
  async submitOrder(order: MassiveOrderRequest): Promise<MassiveOrder> {
    const client = createMassiveClient();
    return client.submitOrder(order);
  },

  async getOrder(orderId: string): Promise<MassiveOrder> {
    const client = createMassiveClient();
    return client.getOrder(orderId);
  },

  async cancelOrder(orderId: string): Promise<MassiveOrder> {
    const client = createMassiveClient();
    return client.cancelOrder(orderId);
  },

  async getPositions(): Promise<MassivePosition[]> {
    const client = createMassiveClient();
    return client.getPositions();
  },

  async getBalance(): Promise<{ cash: number; buyingPower: number; equity: number }> {
    const client = createMassiveClient();
    return client.getBalance();
  },
};

export default MassiveClient;
