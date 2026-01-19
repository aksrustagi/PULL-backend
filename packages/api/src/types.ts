/**
 * API Type Definitions
 *
 * Types used across the API including Hono environment bindings.
 */

import type { Context } from "hono";

/**
 * Hono environment bindings
 */
export type Env = {
  Variables: {
    // Authentication
    userId: string;
    accountId: string;
    email: string;
    kycTier: string;
    kycStatus: string;
    authMethod: "jwt" | "api_key";
    isAdmin?: boolean;

    // Request context
    requestId: string;
  };
  Bindings: {
    // Environment variables (for Cloudflare Workers compatibility)
    JWT_SECRET: string;
    CONVEX_URL: string;
    TEMPORAL_ADDRESS: string;
    MASSIVE_API_KEY: string;
    MASSIVE_API_SECRET: string;
    MASSIVE_BASE_URL: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
  };
};

/**
 * Authenticated context helper type
 */
export type AuthenticatedContext = Context<Env> & {
  get(key: "userId"): string;
  get(key: "accountId"): string;
  get(key: "email"): string;
  get(key: "kycTier"): string;
  get(key: "kycStatus"): string;
};

/**
 * API Error response
 */
export interface ApiError {
  error: {
    message: string;
    code: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * API Success response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

/**
 * Pagination params
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Common order types
 */
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type OrderStatus =
  | "pending"
  | "submitted"
  | "partial"
  | "filled"
  | "cancelled"
  | "rejected"
  | "failed";
export type AssetType = "prediction" | "crypto" | "rwa";

/**
 * KYC Types
 */
export type KYCTier = "none" | "basic" | "enhanced" | "accredited";
export type KYCStatus = "pending" | "in_progress" | "approved" | "rejected" | "review";

/**
 * Order input schema type
 */
export interface CreateOrderInput {
  assetType: AssetType;
  assetId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
}

/**
 * Order response type
 */
export interface OrderResponse {
  orderId: string;
  externalOrderId?: string;
  status: OrderStatus;
  assetType: AssetType;
  assetId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  filledQuantity: number;
  avgPrice: number;
  fees: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Portfolio position
 */
export interface Position {
  assetId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

/**
 * Portfolio summary
 */
export interface PortfolioSummary {
  totalValue: number;
  totalCash: number;
  totalInvested: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  positions: Position[];
  allocation: {
    cash: number;
    crypto: number;
    predictions: number;
    rwa: number;
  };
}

/**
 * Prediction market event
 */
export interface PredictionEvent {
  eventId: string;
  title: string;
  description: string;
  category: string;
  outcomes: {
    id: string;
    name: string;
    currentPrice: number;
    volume24h: number;
  }[];
  status: "upcoming" | "open" | "closed" | "resolved";
  resolutionDate: string;
  totalVolume: number;
  volume24h: number;
}

/**
 * RWA Asset
 */
export interface RWAAsset {
  assetId: string;
  category: string;
  name: string;
  description: string;
  imageUrl: string;
  grading?: {
    service: string;
    grade: string;
    certNumber: string;
  };
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  totalValuation: number;
  priceChange24h: number;
}

/**
 * Points transaction
 */
export interface PointsTransaction {
  id: string;
  amount: number;
  type: "earn" | "redeem";
  source: string;
  description: string;
  createdAt: string;
}

/**
 * User rewards status
 */
export interface RewardsStatus {
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  currentStreak: number;
  tierLevel: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  tierProgress: number;
  nextTierAt: number;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | "persona.inquiry.completed"
  | "persona.inquiry.failed"
  | "checkr.report.completed"
  | "nylas.message.created"
  | "massive.order.filled"
  | "massive.order.cancelled"
  | "stripe.payment.succeeded"
  | "plaid.transactions.sync";
