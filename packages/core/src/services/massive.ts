/**
 * Massive API Client for order execution
 */

export interface MassiveOrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  clientOrderId?: string;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
}

export interface MassiveOrder {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  status: "pending" | "accepted" | "partial" | "filled" | "cancelled" | "rejected";
  quantity: number;
  filledQuantity: number;
  price?: number;
  averagePrice?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MassiveConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  wsUrl?: string;
}

export class MassiveClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private wsUrl: string;

  constructor(config: MassiveConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? "https://api.massive.com";
    this.wsUrl = config.wsUrl ?? "wss://ws.massive.com";
  }

  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    body: string = ""
  ): string {
    const message = `${timestamp}${method}${path}${body}`;
    const crypto = require("crypto");
    return crypto.createHmac("sha256", this.apiSecret).update(message).digest("hex");
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const signature = this.generateSignature(timestamp, method, endpoint, bodyStr);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "X-Timestamp": timestamp,
          "X-Signature": signature,
        },
        body: body ? bodyStr : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Massive API error: ${response.status} - ${error}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Submit an order
   */
  async submitOrder(order: MassiveOrderRequest): Promise<MassiveOrder> {
    return this.request("POST", "/v1/orders", order);
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<MassiveOrder> {
    return this.request("GET", `/v1/orders/${orderId}`);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/v1/orders/${orderId}`);
  }

  /**
   * Get all orders
   */
  async getOrders(params?: {
    symbol?: string;
    status?: string;
    limit?: number;
  }): Promise<{ orders: MassiveOrder[] }> {
    const searchParams = new URLSearchParams();
    if (params?.symbol) searchParams.set("symbol", params.symbol);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    return this.request("GET", `/v1/orders${query ? `?${query}` : ""}`);
  }

  /**
   * Get positions
   */
  async getPositions(): Promise<{ positions: unknown[] }> {
    return this.request("GET", "/v1/positions");
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{
    cash: number;
    buyingPower: number;
    equity: number;
  }> {
    return this.request("GET", "/v1/account/balance");
  }

  /**
   * Get trade fills
   */
  async getFills(orderId?: string): Promise<{ fills: unknown[] }> {
    const endpoint = orderId
      ? `/v1/orders/${orderId}/fills`
      : "/v1/account/fills";
    return this.request("GET", endpoint);
  }
}
