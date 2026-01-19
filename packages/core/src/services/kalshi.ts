/**
 * Kalshi API Client for prediction markets
 */

import { z } from "zod";

const kalshiMarketSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  status: z.string(),
  yes_bid: z.number(),
  yes_ask: z.number(),
  no_bid: z.number(),
  no_ask: z.number(),
  volume: z.number(),
  open_interest: z.number(),
});

export type KalshiMarket = z.infer<typeof kalshiMarketSchema>;

export interface KalshiOrderRequest {
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  count: number;
  type: "market" | "limit";
  yes_price?: number;
  no_price?: number;
}

export interface KalshiConfig {
  apiKey: string;
  apiSecret?: string;
  baseUrl?: string;
}

export class KalshiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: KalshiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://trading-api.kalshi.com/trade-api/v2";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kalshi API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get all markets
   */
  async getMarkets(params?: {
    status?: string;
    series_ticker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ markets: KalshiMarket[]; cursor?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.series_ticker)
      searchParams.set("series_ticker", params.series_ticker);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.cursor) searchParams.set("cursor", params.cursor);

    const query = searchParams.toString();
    const endpoint = `/markets${query ? `?${query}` : ""}`;

    return this.request(endpoint);
  }

  /**
   * Get single market
   */
  async getMarket(ticker: string): Promise<KalshiMarket> {
    return this.request(`/markets/${ticker}`);
  }

  /**
   * Get market orderbook
   */
  async getOrderbook(ticker: string): Promise<{
    yes: Array<{ price: number; quantity: number }>;
    no: Array<{ price: number; quantity: number }>;
  }> {
    return this.request(`/markets/${ticker}/orderbook`);
  }

  /**
   * Place an order
   */
  async createOrder(order: KalshiOrderRequest): Promise<{
    order_id: string;
    status: string;
  }> {
    return this.request("/portfolio/orders", {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    return this.request(`/portfolio/orders/${orderId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get user orders
   */
  async getOrders(params?: {
    ticker?: string;
    status?: string;
  }): Promise<{ orders: unknown[] }> {
    const searchParams = new URLSearchParams();
    if (params?.ticker) searchParams.set("ticker", params.ticker);
    if (params?.status) searchParams.set("status", params.status);

    const query = searchParams.toString();
    const endpoint = `/portfolio/orders${query ? `?${query}` : ""}`;

    return this.request(endpoint);
  }

  /**
   * Get user positions
   */
  async getPositions(): Promise<{ positions: unknown[] }> {
    return this.request("/portfolio/positions");
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number }> {
    return this.request("/portfolio/balance");
  }
}
