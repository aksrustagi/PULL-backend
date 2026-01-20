/**
 * Kalshi WebSocket Bridge
 * Connects to Kalshi WebSocket and fans out data to PULL clients
 */

import type {
  PriceUpdate,
  OrderbookUpdate,
  OrderbookDelta,
  TradeUpdate,
  OrderUpdate,
  FillUpdate,
} from "@pull/types";
import { KalshiWebSocket, type KalshiWebSocketConfig } from "../kalshi/websocket";
import type {
  OrderbookDeltaMessage,
  TickerMessage,
  TradeMessage,
  FillMessage,
  OrderUpdateMessage,
} from "../kalshi/types";
import { WebSocketManager } from "./manager";
import { TypedEventEmitter } from "./event-emitter";

// ============================================================================
// Types
// ============================================================================

export interface KalshiBridgeConfig {
  kalshiConfig: KalshiWebSocketConfig;
  manager: WebSocketManager;
  enableOrderbook?: boolean;
  enableTicker?: boolean;
  enableTrades?: boolean;
  enableFills?: boolean;
  enableOrders?: boolean;
  orderbookDepth?: number;
  priceUpdateThrottle?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface MarketState {
  ticker: string;
  lastPrice?: number;
  lastPriceUpdate?: number;
  bids: Map<number, number>; // price -> size
  asks: Map<number, number>; // price -> size
  volume24h: number;
  high24h?: number;
  low24h?: number;
  subscriberCount: number;
}

interface KalshiBridgeEvents {
  connected: { authenticated: boolean };
  disconnected: { code: number; reason: string };
  error: Error;
  market_subscribed: { ticker: string };
  market_unsubscribed: { ticker: string };
  price_update: PriceUpdate;
  orderbook_update: OrderbookUpdate;
  trade: TradeUpdate;
}

// ============================================================================
// Kalshi Bridge Class
// ============================================================================

export class KalshiBridge extends TypedEventEmitter<KalshiBridgeEvents> {
  private readonly config: Required<Omit<KalshiBridgeConfig, "kalshiConfig" | "manager">> & {
    kalshiConfig: KalshiWebSocketConfig;
    manager: WebSocketManager;
  };
  private readonly logger: Logger;
  private readonly kalshiWs: KalshiWebSocket;
  private readonly manager: WebSocketManager;

  // Market state management
  private marketStates: Map<string, MarketState> = new Map();
  private subscribedMarkets: Set<string> = new Set();

  // Throttling
  private lastPriceUpdates: Map<string, number> = new Map();

  // Connection state
  private isConnected: boolean = false;
  private isAuthenticated: boolean = false;

  constructor(config: KalshiBridgeConfig) {
    super();

    this.config = {
      kalshiConfig: config.kalshiConfig,
      manager: config.manager,
      enableOrderbook: config.enableOrderbook ?? true,
      enableTicker: config.enableTicker ?? true,
      enableTrades: config.enableTrades ?? true,
      enableFills: config.enableFills ?? true,
      enableOrders: config.enableOrders ?? true,
      orderbookDepth: config.orderbookDepth ?? 10,
      priceUpdateThrottle: config.priceUpdateThrottle ?? 100, // ms
      logger: config.logger ?? this.createDefaultLogger(),
    };

    this.logger = this.config.logger;
    this.manager = config.manager;
    this.kalshiWs = new KalshiWebSocket(config.kalshiConfig);

    this.setupKalshiHandlers();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[KalshiBridge] ${msg}`, meta ?? ""),
      info: (msg, meta) => console.info(`[KalshiBridge] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[KalshiBridge] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[KalshiBridge] ${msg}`, meta ?? ""),
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to Kalshi WebSocket
   */
  async connect(): Promise<void> {
    this.logger.info("Connecting to Kalshi WebSocket");

    try {
      await this.kalshiWs.connect();
    } catch (error) {
      this.logger.error("Failed to connect to Kalshi", { error });
      throw error;
    }
  }

  /**
   * Disconnect from Kalshi WebSocket
   */
  disconnect(): void {
    this.logger.info("Disconnecting from Kalshi WebSocket");
    this.kalshiWs.disconnect();
    this.marketStates.clear();
    this.subscribedMarkets.clear();
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  /**
   * Check if connected to Kalshi
   */
  isKalshiConnected(): boolean {
    return this.isConnected;
  }

  // ==========================================================================
  // Kalshi Event Handlers
  // ==========================================================================

  private setupKalshiHandlers(): void {
    // Connection events
    this.kalshiWs.on("connected", ({ authenticated }) => {
      this.isConnected = true;
      this.isAuthenticated = authenticated;
      this.logger.info("Connected to Kalshi", { authenticated });

      // Resubscribe to all markets
      this.resubscribeAllMarkets();

      this.emit("connected", { authenticated });
    });

    this.kalshiWs.on("disconnected", ({ code, reason }) => {
      this.isConnected = false;
      this.isAuthenticated = false;
      this.logger.info("Disconnected from Kalshi", { code, reason });
      this.emit("disconnected", { code, reason });
    });

    this.kalshiWs.on("error", (error) => {
      this.logger.error("Kalshi WebSocket error", { error });
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    });

    // Market data events
    if (this.config.enableOrderbook) {
      this.kalshiWs.on("orderbook_delta", (data) => {
        this.handleOrderbookDelta(data);
      });
    }

    if (this.config.enableTicker) {
      this.kalshiWs.on("ticker", (data) => {
        this.handleTicker(data);
      });
    }

    if (this.config.enableTrades) {
      this.kalshiWs.on("trade", (data) => {
        this.handleTrade(data);
      });
    }

    // User events (require authentication)
    if (this.config.enableFills) {
      this.kalshiWs.on("fill", (data) => {
        this.handleFill(data);
      });
    }

    if (this.config.enableOrders) {
      this.kalshiWs.on("order", (data) => {
        this.handleOrder(data);
      });
    }
  }

  // ==========================================================================
  // Market Subscription Management
  // ==========================================================================

  /**
   * Subscribe to a market
   */
  async subscribeMarket(ticker: string): Promise<void> {
    if (this.subscribedMarkets.has(ticker)) {
      const state = this.marketStates.get(ticker);
      if (state) {
        state.subscriberCount++;
      }
      return;
    }

    this.logger.info("Subscribing to market", { ticker });

    // Initialize market state
    this.marketStates.set(ticker, {
      ticker,
      bids: new Map(),
      asks: new Map(),
      volume24h: 0,
      subscriberCount: 1,
    });

    this.subscribedMarkets.add(ticker);

    if (!this.isConnected) {
      this.logger.debug("Not connected, market will be subscribed on connect", { ticker });
      return;
    }

    try {
      // Subscribe to orderbook delta
      if (this.config.enableOrderbook) {
        await this.kalshiWs.subscribe("orderbook_delta", { market_tickers: [ticker] });
      }

      // Subscribe to ticker
      if (this.config.enableTicker) {
        await this.kalshiWs.subscribe("ticker", { market_tickers: [ticker] });
      }

      // Subscribe to trades
      if (this.config.enableTrades) {
        await this.kalshiWs.subscribe("trade", { market_tickers: [ticker] });
      }

      this.emit("market_subscribed", { ticker });
    } catch (error) {
      this.logger.error("Failed to subscribe to market", { ticker, error });
      throw error;
    }
  }

  /**
   * Unsubscribe from a market
   */
  async unsubscribeMarket(ticker: string): Promise<void> {
    const state = this.marketStates.get(ticker);
    if (!state) {
      return;
    }

    state.subscriberCount--;

    // Only fully unsubscribe if no more subscribers
    if (state.subscriberCount > 0) {
      return;
    }

    this.logger.info("Unsubscribing from market", { ticker });

    this.subscribedMarkets.delete(ticker);
    this.marketStates.delete(ticker);

    if (!this.isConnected) {
      return;
    }

    try {
      if (this.config.enableOrderbook) {
        await this.kalshiWs.unsubscribe("orderbook_delta", { market_tickers: [ticker] });
      }

      if (this.config.enableTicker) {
        await this.kalshiWs.unsubscribe("ticker", { market_tickers: [ticker] });
      }

      if (this.config.enableTrades) {
        await this.kalshiWs.unsubscribe("trade", { market_tickers: [ticker] });
      }

      this.emit("market_unsubscribed", { ticker });
    } catch (error) {
      this.logger.error("Failed to unsubscribe from market", { ticker, error });
    }
  }

  /**
   * Resubscribe to all markets after reconnection
   */
  private async resubscribeAllMarkets(): Promise<void> {
    const tickers = Array.from(this.subscribedMarkets);
    if (tickers.length === 0) {
      return;
    }

    this.logger.info("Resubscribing to markets", { count: tickers.length });

    try {
      if (this.config.enableOrderbook) {
        await this.kalshiWs.subscribe("orderbook_delta", { market_tickers: tickers });
      }

      if (this.config.enableTicker) {
        await this.kalshiWs.subscribe("ticker", { market_tickers: tickers });
      }

      if (this.config.enableTrades) {
        await this.kalshiWs.subscribe("trade", { market_tickers: tickers });
      }
    } catch (error) {
      this.logger.error("Failed to resubscribe to markets", { error });
    }
  }

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  /**
   * Handle orderbook delta from Kalshi
   */
  private handleOrderbookDelta(data: OrderbookDeltaMessage["msg"]): void {
    const ticker = data.market_ticker;
    const state = this.marketStates.get(ticker);

    if (!state) {
      return;
    }

    // Update local orderbook state
    const side = data.side === "yes" ? state.bids : state.asks;

    if (data.delta === 0) {
      // Remove price level
      side.delete(data.price);
    } else {
      // Update price level
      side.set(data.price, data.delta);
    }

    // Broadcast delta to PULL clients
    const delta: OrderbookDelta = {
      type: "orderbook_delta",
      ticker,
      side: data.side === "yes" ? "bid" : "ask",
      price: data.price / 100, // Convert cents to dollars
      size: data.delta,
      timestamp: Date.now(),
    };

    this.manager.broadcast(`market:${ticker}`, delta);

    // Periodically broadcast full orderbook
    this.broadcastOrderbookUpdate(ticker);
  }

  /**
   * Handle ticker update from Kalshi
   */
  private handleTicker(data: TickerMessage["msg"]): void {
    const ticker = data.market_ticker;
    const state = this.marketStates.get(ticker);

    if (!state) {
      return;
    }

    const now = Date.now();
    const lastUpdate = this.lastPriceUpdates.get(ticker) ?? 0;

    // Throttle price updates
    if (now - lastUpdate < this.config.priceUpdateThrottle) {
      return;
    }

    this.lastPriceUpdates.set(ticker, now);

    const price = data.yes_bid / 100; // Convert cents to dollars
    const previousPrice = state.lastPrice;

    // Update state
    state.lastPrice = price;
    state.lastPriceUpdate = now;
    state.volume24h = data.volume ?? state.volume24h;

    // Calculate 24h change
    const change24h = previousPrice ? price - previousPrice : 0;
    const changePercent24h = previousPrice ? ((price - previousPrice) / previousPrice) * 100 : 0;

    // Broadcast price update
    this.broadcastPriceUpdate(ticker, price, change24h, changePercent24h);
  }

  /**
   * Handle trade from Kalshi
   */
  private handleTrade(data: TradeMessage["msg"]): void {
    const ticker = data.market_ticker;

    const trade: TradeUpdate = {
      type: "trade",
      ticker,
      tradeId: data.trade_id,
      price: data.yes_price / 100,
      size: data.count,
      side: data.taker_side === "yes" ? "buy" : "sell",
      timestamp: new Date(data.created_time).getTime(),
    };

    // Broadcast to market channel
    this.manager.broadcast(`market:${ticker}`, trade);

    // Broadcast to all markets channel
    this.manager.broadcast("markets", trade);

    this.emit("trade", trade);
  }

  /**
   * Handle fill notification from Kalshi
   */
  private handleFill(data: FillMessage["msg"]): void {
    const userId = data.member_id;

    const fill: FillUpdate = {
      type: "fill",
      fillId: data.trade_id,
      orderId: data.order_id,
      ticker: data.ticker,
      side: data.side === "yes" ? "buy" : "sell",
      price: data.yes_price / 100,
      quantity: data.count,
      fee: 0, // Would need to calculate from fee structure
      timestamp: new Date(data.created_time).getTime(),
    };

    // Broadcast to user's fills channel
    this.manager.broadcast(`fills:${userId}`, fill);
  }

  /**
   * Handle order update from Kalshi
   */
  private handleOrder(data: OrderUpdateMessage["msg"]): void {
    const userId = data.member_id;

    const order: OrderUpdate = {
      type: "order",
      orderId: data.order_id,
      ticker: data.ticker,
      status: this.mapKalshiOrderStatus(data.status),
      side: data.side === "yes" ? "buy" : "sell",
      orderType: data.type === "limit" ? "limit" : "market",
      price: data.yes_price ? data.yes_price / 100 : undefined,
      quantity: data.count,
      filledQty: data.filled_count ?? 0,
      remainingQty: data.remaining_count ?? data.count,
      avgPrice: data.yes_price ? data.yes_price / 100 : undefined,
      createdAt: new Date(data.created_time).getTime(),
      updatedAt: Date.now(),
      timestamp: Date.now(),
    };

    // Broadcast to user's orders channel
    this.manager.broadcast(`orders:${userId}`, order);
  }

  // ==========================================================================
  // Broadcast Helpers
  // ==========================================================================

  /**
   * Broadcast price update to PULL clients
   */
  broadcastPriceUpdate(
    ticker: string,
    price: number,
    change24h: number = 0,
    changePercent24h: number = 0
  ): void {
    const state = this.marketStates.get(ticker);

    const priceUpdate: PriceUpdate = {
      type: "price",
      ticker,
      price,
      change24h,
      changePercent24h,
      volume24h: state?.volume24h ?? 0,
      high24h: state?.high24h,
      low24h: state?.low24h,
      timestamp: Date.now(),
    };

    // Broadcast to market-specific channel
    this.manager.broadcast(`market:${ticker}`, priceUpdate);

    // Broadcast to all markets channel
    this.manager.broadcast("markets", priceUpdate);

    this.emit("price_update", priceUpdate);
  }

  /**
   * Broadcast orderbook update to PULL clients
   */
  broadcastOrderbookUpdate(ticker: string): void {
    const state = this.marketStates.get(ticker);
    if (!state) return;

    // Convert maps to sorted arrays
    const bids = Array.from(state.bids.entries())
      .map(([price, size]) => [price / 100, size] as [number, number])
      .sort((a, b) => b[0] - a[0])
      .slice(0, this.config.orderbookDepth);

    const asks = Array.from(state.asks.entries())
      .map(([price, size]) => [price / 100, size] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .slice(0, this.config.orderbookDepth);

    // Calculate spread and mid price
    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];
    const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;
    const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;

    const orderbookUpdate: OrderbookUpdate = {
      type: "orderbook",
      ticker,
      bids,
      asks,
      spread,
      midPrice,
      timestamp: Date.now(),
    };

    this.manager.broadcast(`market:${ticker}`, orderbookUpdate);

    this.emit("orderbook_update", orderbookUpdate);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Map Kalshi order status to PULL order status
   */
  private mapKalshiOrderStatus(
    status: string
  ): "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected" {
    switch (status) {
      case "pending":
        return "pending";
      case "resting":
        return "open";
      case "executed":
        return "filled";
      case "canceled":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * Get market state
   */
  getMarketState(ticker: string): MarketState | undefined {
    return this.marketStates.get(ticker);
  }

  /**
   * Get all subscribed markets
   */
  getSubscribedMarkets(): string[] {
    return Array.from(this.subscribedMarkets);
  }

  /**
   * Get current price for a market
   */
  getCurrentPrice(ticker: string): number | undefined {
    return this.marketStates.get(ticker)?.lastPrice;
  }

  /**
   * Get orderbook for a market
   */
  getOrderbook(ticker: string): { bids: [number, number][]; asks: [number, number][] } | undefined {
    const state = this.marketStates.get(ticker);
    if (!state) return undefined;

    const bids = Array.from(state.bids.entries())
      .map(([price, size]) => [price / 100, size] as [number, number])
      .sort((a, b) => b[0] - a[0]);

    const asks = Array.from(state.asks.entries())
      .map(([price, size]) => [price / 100, size] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    return { bids, asks };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Kalshi bridge instance
 */
export function createKalshiBridge(config: KalshiBridgeConfig): KalshiBridge {
  return new KalshiBridge(config);
}

export default KalshiBridge;
