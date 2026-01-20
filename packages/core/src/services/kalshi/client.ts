/**
 * Kalshi API Client
 * Complete client for interacting with the Kalshi prediction market API
 */

import * as crypto from "crypto";
import type {
  ExchangeStatus,
  Market,
  MarketsResponse,
  GetMarketsParams,
  Event,
  EventsResponse,
  GetEventsParams,
  Series,
  Orderbook,
  Trade,
  TradesResponse,
  GetTradesParams,
  Balance,
  Position,
  PositionsResponse,
  GetPositionsParams,
  Order,
  OrdersResponse,
  GetOrdersParams,
  CreateOrderParams,
  CreateOrderResponse,
  BatchCreateOrdersParams,
  BatchCreateOrdersResponse,
  AmendOrderParams,
  DecreaseOrderParams,
  Fill,
  FillsResponse,
  GetFillsParams,
  RateLimitInfo,
} from "./types";
import { KalshiApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface KalshiClientConfig {
  apiKeyId: string;
  privateKey: string; // PEM format
  baseUrl?: string;
  demoMode?: boolean;
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

const DEFAULT_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
const DEMO_BASE_URL = "https://demo-api.kalshi.co/trade-api/v2";

// ============================================================================
// Kalshi Client
// ============================================================================

export class KalshiClient {
  private readonly apiKeyId: string;
  private readonly privateKey: string;
  private readonly baseUrl: string;
  private readonly demoMode: boolean;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;
  private lastRateLimitInfo: RateLimitInfo | null = null;

  constructor(config: KalshiClientConfig) {
    this.apiKeyId = config.apiKeyId;
    this.privateKey = config.privateKey;
    this.demoMode = config.demoMode ?? false;
    this.baseUrl = config.baseUrl ?? (this.demoMode ? DEMO_BASE_URL : DEFAULT_BASE_URL);
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Kalshi] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Kalshi] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Kalshi] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Kalshi] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Authentication & Request Signing
  // ==========================================================================

  /**
   * Generate RSA-PSS signature for authenticated requests
   */
  private signRequest(method: string, path: string, timestamp: number): string {
    const message = `${timestamp}${method.toUpperCase()}${path}`;

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

    return signature;
  }

  /**
   * Execute HTTP request with retry logic
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>,
    authenticated: boolean = true
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        if (authenticated) {
          const signature = this.signRequest(method, path, timestamp);
          headers["KALSHI-ACCESS-KEY"] = this.apiKeyId;
          headers["KALSHI-ACCESS-SIGNATURE"] = signature;
          headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp.toString();
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Extract rate limit info
        this.lastRateLimitInfo = {
          limit: parseInt(response.headers.get("X-RateLimit-Limit") ?? "0", 10),
          remaining: parseInt(response.headers.get("X-RateLimit-Remaining") ?? "0", 10),
          reset: parseInt(response.headers.get("X-RateLimit-Reset") ?? "0", 10),
        };

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new KalshiApiError(
            errorBody.message ?? `HTTP ${response.status}`,
            errorBody.code ?? "UNKNOWN_ERROR",
            response.status,
            errorBody.details
          );
        }

        const result = await response.json();
        return result as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 4xx errors (except 429)
        if (error instanceof KalshiApiError) {
          if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
            throw error;
          }
        }

        // Handle rate limiting with exponential backoff
        if (error instanceof KalshiApiError && error.statusCode === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
          this.logger.warn(`Rate limited, waiting ${waitTime}ms before retry`, { attempt });
          await this.sleep(waitTime);
          continue;
        }

        // Retry on network errors and 5xx
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

  /**
   * Normalize Kalshi API errors
   */
  private handleError(error: unknown): never {
    if (error instanceof KalshiApiError) {
      this.logger.error("Kalshi API error", {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
      throw error;
    }

    if (error instanceof Error) {
      this.logger.error("Unexpected error", { message: error.message });
      throw new KalshiApiError(error.message, "INTERNAL_ERROR", 500);
    }

    throw new KalshiApiError("Unknown error", "UNKNOWN_ERROR", 500);
  }

  /**
   * Get current rate limit info
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  // ==========================================================================
  // Market Data (Public - No Auth Required)
  // ==========================================================================

  /**
   * Get exchange status
   */
  async getExchangeStatus(): Promise<ExchangeStatus> {
    try {
      return await this.makeRequest<ExchangeStatus>("GET", "/exchange/status", undefined, false);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get list of markets with optional filters
   */
  async getMarkets(params?: GetMarketsParams): Promise<MarketsResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const path = `/markets${queryParams}`;
      return await this.makeRequest<MarketsResponse>("GET", path, undefined, false);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get single market details
   */
  async getMarket(ticker: string): Promise<Market> {
    try {
      const response = await this.makeRequest<{ market: Market }>(
        "GET",
        `/markets/${ticker}`,
        undefined,
        false
      );
      return response.market;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get current orderbook for a market
   */
  async getMarketOrderbook(ticker: string, depth?: number): Promise<Orderbook> {
    try {
      const queryParams = depth ? `?depth=${depth}` : "";
      const response = await this.makeRequest<{ orderbook: Orderbook }>(
        "GET",
        `/markets/${ticker}/orderbook${queryParams}`,
        undefined,
        false
      );
      return response.orderbook;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get list of events
   */
  async getEvents(params?: GetEventsParams): Promise<EventsResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const path = `/events${queryParams}`;
      return await this.makeRequest<EventsResponse>("GET", path, undefined, false);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get single event details
   */
  async getEvent(eventTicker: string, withNestedMarkets?: boolean): Promise<Event> {
    try {
      const queryParams = withNestedMarkets ? "?with_nested_markets=true" : "";
      const response = await this.makeRequest<{ event: Event }>(
        "GET",
        `/events/${eventTicker}${queryParams}`,
        undefined,
        false
      );
      return response.event;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get series info
   */
  async getSeries(seriesTicker: string): Promise<Series> {
    try {
      const response = await this.makeRequest<{ series: Series }>(
        "GET",
        `/series/${seriesTicker}`,
        undefined,
        false
      );
      return response.series;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get recent trades for a market
   */
  async getTrades(ticker: string, params?: Omit<GetTradesParams, "ticker">): Promise<TradesResponse> {
    try {
      const queryParams = this.buildQueryString({ ...params, ticker });
      const path = `/markets/${ticker}/trades${queryParams}`;
      return await this.makeRequest<TradesResponse>("GET", path, undefined, false);
    } catch (error) {
      this.handleError(error);
    }
  }

  // ==========================================================================
  // Portfolio (Authenticated)
  // ==========================================================================

  /**
   * Get account balance
   */
  async getBalance(): Promise<Balance> {
    try {
      return await this.makeRequest<Balance>("GET", "/portfolio/balance");
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get current positions
   */
  async getPositions(params?: GetPositionsParams): Promise<PositionsResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const path = `/portfolio/positions${queryParams}`;
      return await this.makeRequest<PositionsResponse>("GET", path);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get orders with optional filters
   */
  async getOrders(params?: GetOrdersParams): Promise<OrdersResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const path = `/portfolio/orders${queryParams}`;
      return await this.makeRequest<OrdersResponse>("GET", path);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId: string): Promise<Order> {
    try {
      const response = await this.makeRequest<{ order: Order }>(
        "GET",
        `/portfolio/orders/${orderId}`
      );
      return response.order;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get trade fills
   */
  async getFills(params?: GetFillsParams): Promise<FillsResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const path = `/portfolio/fills${queryParams}`;
      return await this.makeRequest<FillsResponse>("GET", path);
    } catch (error) {
      this.handleError(error);
    }
  }

  // ==========================================================================
  // Trading (Authenticated)
  // ==========================================================================

  /**
   * Place a new order
   */
  async createOrder(order: CreateOrderParams): Promise<Order> {
    try {
      const response = await this.makeRequest<CreateOrderResponse>(
        "POST",
        "/portfolio/orders",
        order as unknown as Record<string, unknown>
      );
      this.logger.info("Order created", { orderId: response.order.order_id, ticker: order.ticker });
      return response.order;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Submit multiple orders in a batch
   */
  async batchCreateOrders(params: BatchCreateOrdersParams): Promise<Order[]> {
    try {
      const response = await this.makeRequest<BatchCreateOrdersResponse>(
        "POST",
        "/portfolio/orders/batched",
        params as unknown as Record<string, unknown>
      );
      this.logger.info("Batch orders created", { count: response.orders.length });
      return response.orders;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cancel a single order
   */
  async cancelOrder(orderId: string): Promise<Order> {
    try {
      const response = await this.makeRequest<{ order: Order }>(
        "DELETE",
        `/portfolio/orders/${orderId}`
      );
      this.logger.info("Order canceled", { orderId });
      return response.order;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cancel multiple orders in a batch
   */
  async batchCancelOrders(orderIds: string[]): Promise<{ canceled: string[]; failed: string[] }> {
    try {
      const response = await this.makeRequest<{ canceled: string[]; failed: string[] }>(
        "DELETE",
        "/portfolio/orders/batched",
        { order_ids: orderIds }
      );
      this.logger.info("Batch cancel completed", {
        canceled: response.canceled.length,
        failed: response.failed.length,
      });
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Amend an existing order (change price or quantity)
   */
  async amendOrder(orderId: string, changes: AmendOrderParams): Promise<Order> {
    try {
      const response = await this.makeRequest<{ order: Order }>(
        "POST",
        `/portfolio/orders/${orderId}/amend`,
        changes as Record<string, unknown>
      );
      this.logger.info("Order amended", { orderId, changes });
      return response.order;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Decrease order size
   */
  async decreaseOrder(orderId: string, reduceBy: number): Promise<Order> {
    try {
      const response = await this.makeRequest<{ order: Order }>(
        "POST",
        `/portfolio/orders/${orderId}/decrease`,
        { reduce_by: reduceBy }
      );
      this.logger.info("Order decreased", { orderId, reduceBy });
      return response.order;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Build query string from params object
   */
  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return "";

    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join("&");
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      });

    return entries.length > 0 ? `?${entries.join("&")}` : "";
  }

  /**
   * Paginate through all results
   */
  async *paginateMarkets(params?: Omit<GetMarketsParams, "cursor">): AsyncGenerator<Market> {
    let cursor: string | null = null;

    do {
      const response = await this.getMarkets({ ...params, cursor: cursor ?? undefined });
      for (const market of response.markets) {
        yield market;
      }
      cursor = response.cursor;
    } while (cursor);
  }

  /**
   * Paginate through all orders
   */
  async *paginateOrders(params?: Omit<GetOrdersParams, "cursor">): AsyncGenerator<Order> {
    let cursor: string | null = null;

    do {
      const response = await this.getOrders({ ...params, cursor: cursor ?? undefined });
      for (const order of response.orders) {
        yield order;
      }
      cursor = response.cursor;
    } while (cursor);
  }

  /**
   * Paginate through all fills
   */
  async *paginateFills(params?: Omit<GetFillsParams, "cursor">): AsyncGenerator<Fill> {
    let cursor: string | null = null;

    do {
      const response = await this.getFills({ ...params, cursor: cursor ?? undefined });
      for (const fill of response.fills) {
        yield fill;
      }
      cursor = response.cursor;
    } while (cursor);
  }
}

export default KalshiClient;
