/**
 * Market Data Activities
 * Updates Convex with real-time data from Kalshi WebSocket
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Types
// ============================================================================

export interface PriceUpdate {
  ticker: string;
  price: number;
  change24h?: number;
  changePercent24h?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
}

export interface OrderbookUpdate {
  ticker: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
  spread?: number;
  midPrice?: number;
}

export interface TradeUpdate {
  ticker: string;
  tradeId: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  timestamp: number;
}

// ============================================================================
// Activities - Called by Temporal workflow
// ============================================================================

/**
 * Update market price in Convex
 * This triggers real-time updates to all subscribed clients
 */
export async function updateMarketPrice(data: PriceUpdate): Promise<void> {
  await convex.mutation(api.marketData.updatePrice, {
    ticker: data.ticker,
    price: data.price,
    change24h: data.change24h,
    changePercent24h: data.changePercent24h,
    volume24h: data.volume24h,
    high24h: data.high24h,
    low24h: data.low24h,
  });
}

/**
 * Update market orderbook in Convex
 */
export async function updateMarketOrderbook(data: OrderbookUpdate): Promise<void> {
  await convex.mutation(api.marketData.updateOrderbook, {
    ticker: data.ticker,
    bids: data.bids,
    asks: data.asks,
    spread: data.spread,
    midPrice: data.midPrice,
  });
}

/**
 * Insert market trade in Convex
 */
export async function insertMarketTrade(data: TradeUpdate): Promise<void> {
  await convex.mutation(api.marketData.insertTrade, {
    ticker: data.ticker,
    tradeId: data.tradeId,
    price: data.price,
    size: data.size,
    side: data.side,
    timestamp: data.timestamp,
  });
}

/**
 * Clean up old trades for a market
 */
export async function cleanupOldTrades(ticker: string, keepCount: number = 1000): Promise<number> {
  const deleted = await convex.mutation(api.marketData.cleanupOldTrades, {
    ticker,
    keepCount,
  });
  return deleted as number;
}
