/**
 * Trading Types for PULL Super App
 * Covers orders, positions, trades, markets, and prediction events
 */

/** Order types available */
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";

/** Order side (direction) */
export type OrderSide = "buy" | "sell";

/** Order status lifecycle */
export type OrderStatus =
  | "pending"
  | "submitted"
  | "accepted"
  | "partial_fill"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";

/** Time in force options */
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

/** Asset class for trading */
export type AssetClass = "crypto" | "prediction" | "rwa";

/** Base order interface */
export interface Order {
  id: string;
  userId: string;
  clientOrderId?: string;
  externalOrderId?: string;
  assetClass: AssetClass;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  trailingPercent?: number;
  averageFilledPrice?: number;
  timeInForce: TimeInForce;
  expiresAt?: Date;
  fees: number;
  feeCurrency: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  filledAt?: Date;
  cancelledAt?: Date;
}

/** Trade/execution record */
export interface Trade {
  id: string;
  orderId: string;
  userId: string;
  externalTradeId?: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  notionalValue: number;
  fee: number;
  feeCurrency: string;
  executedAt: Date;
  settledAt?: Date;
  settlementStatus: "pending" | "settled" | "failed";
}

/** Order fill information */
export interface Fill {
  id: string;
  orderId: string;
  tradeId: string;
  quantity: number;
  price: number;
  fee: number;
  feeCurrency: string;
  liquidity: "maker" | "taker";
  executedAt: Date;
}

/** Current position */
export interface Position {
  id: string;
  userId: string;
  assetClass: AssetClass;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  openedAt: Date;
  updatedAt: Date;
}

/** Market status */
export type MarketStatus = "open" | "closed" | "pre_market" | "post_market" | "halted";

/** Market information */
export interface Market {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  status: MarketStatus;
  tradeable: boolean;
  marginable: boolean;
  shortable: boolean;
  minOrderSize: number;
  maxOrderSize: number;
  stepSize: number;
  tickSize: number;
  openTime?: string;
  closeTime?: string;
  timezone?: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  updatedAt: Date;
}

/** Orderbook level */
export interface OrderbookLevel {
  price: number;
  quantity: number;
  orderCount?: number;
}

/** Orderbook snapshot */
export interface Orderbook {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  spreadPercent: number;
  midPrice: number;
  timestamp: Date;
}

/** Prediction market event status */
export type PredictionEventStatus =
  | "upcoming"
  | "open"
  | "trading_halted"
  | "closed"
  | "settled"
  | "cancelled";

/** Prediction market event */
export interface PredictionEvent {
  id: string;
  externalId?: string;
  ticker: string;
  title: string;
  description: string;
  category: PredictionCategory;
  subcategory?: string;
  status: PredictionEventStatus;
  outcomes: PredictionOutcome[];
  resolutionSource?: string;
  resolutionDetails?: string;
  settlementValue?: number;
  winningOutcomeId?: string;
  openTime: Date;
  closeTime: Date;
  expirationTime: Date;
  settledAt?: Date;
  volume: number;
  openInterest: number;
  tags: string[];
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Prediction categories */
export type PredictionCategory =
  | "politics"
  | "sports"
  | "entertainment"
  | "crypto"
  | "finance"
  | "science"
  | "weather"
  | "technology"
  | "other";

/** Prediction outcome (YES/NO contract) */
export interface PredictionOutcome {
  id: string;
  eventId: string;
  name: string;
  ticker: string;
  description?: string;
  probability: number;
  yesPrice: number;
  noPrice: number;
  yesVolume: number;
  noVolume: number;
  openInterest: number;
  isWinner?: boolean;
  settlementPrice?: number;
}

/** User's prediction position */
export interface PredictionPosition {
  id: string;
  userId: string;
  eventId: string;
  outcomeId: string;
  side: "yes" | "no";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  settledPnL?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Price alert configuration */
export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  assetClass: AssetClass;
  condition: "above" | "below" | "crosses";
  targetPrice: number;
  currentPrice: number;
  triggered: boolean;
  triggeredAt?: Date;
  notificationSent: boolean;
  createdAt: Date;
  expiresAt?: Date;
}
