/**
 * Massive Trading API Types
 * Types for crypto/RWA order execution
 */

// ============================================================================
// Order Types
// ============================================================================

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type OrderStatus =
  | "pending"
  | "accepted"
  | "partial"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

export interface MassiveOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  clientOrderId?: string;
  timeInForce?: TimeInForce;
  postOnly?: boolean;
  reduceOnly?: boolean;
  metadata?: Record<string, string>;
}

export interface MassiveOrder {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  averagePrice?: number;
  fees: number;
  feeCurrency: string;
  timeInForce: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  createdAt: string;
  updatedAt: string;
  filledAt?: string;
  canceledAt?: string;
  metadata?: Record<string, string>;
}

export interface MassiveFill {
  fillId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
  feeCurrency: string;
  liquidity: "maker" | "taker";
  timestamp: string;
}

// ============================================================================
// Position Types
// ============================================================================

export interface MassivePosition {
  symbol: string;
  side: "long" | "short" | "none";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  marginUsed: number;
  liquidationPrice?: number;
  updatedAt: string;
}

// ============================================================================
// Account Types
// ============================================================================

export interface MassiveBalance {
  currency: string;
  available: number;
  held: number;
  total: number;
}

export interface MassiveAccount {
  accountId: string;
  accountType: "spot" | "margin" | "futures";
  balances: MassiveBalance[];
  buyingPower: number;
  equity: number;
  marginUsed: number;
  marginAvailable: number;
  maintenanceMargin: number;
  leverage: number;
  updatedAt: string;
}

// ============================================================================
// Market Data Types
// ============================================================================

export interface MassiveTicker {
  symbol: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  last: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: string;
}

export interface MassiveOrderbook {
  symbol: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  timestamp: string;
}

export interface MassiveMarket {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  status: "active" | "inactive" | "maintenance";
  minOrderSize: number;
  maxOrderSize: number;
  tickSize: number;
  stepSize: number;
  makerFee: number;
  takerFee: number;
}

// ============================================================================
// RWA Types
// ============================================================================

export interface RWAAsset {
  assetId: string;
  symbol: string;
  name: string;
  type: "real_estate" | "commodities" | "art" | "collectibles" | "other";
  tokenAddress?: string;
  blockchain?: string;
  totalSupply: number;
  circulatingSupply: number;
  navPerToken: number;
  lastValuationDate: string;
  custodian: string;
  metadata: Record<string, unknown>;
}

export interface RWATransfer {
  transferId: string;
  assetId: string;
  from: string;
  to: string;
  quantity: number;
  status: "pending" | "processing" | "completed" | "failed";
  txHash?: string;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface MassiveWebhookPayload {
  event: "order.created" | "order.filled" | "order.canceled" | "position.updated" | "transfer.completed";
  timestamp: string;
  data: MassiveOrder | MassivePosition | RWATransfer;
}

// ============================================================================
// Error Types
// ============================================================================

export class MassiveApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MassiveApiError";
  }
}
