/**
 * Convex Client for PULL API
 * Provides a typed interface for interacting with Convex from the API server
 */

import { ConvexHttpClient } from "convex/browser";
import { api as generatedApi } from "@pull/db/convex/_generated/api";

// Re-export api for typed access
export const api = generatedApi;

// Convex URL from environment
const CONVEX_URL = process.env.CONVEX_URL ?? "";

// Create singleton client
let convexClient: ConvexHttpClient | null = null;

/**
 * Get the Convex HTTP client instance
 */
export function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    if (!CONVEX_URL) {
      throw new Error("CONVEX_URL environment variable is not set");
    }
    convexClient = new ConvexHttpClient(CONVEX_URL);
  }
  return convexClient;
}

// Export singleton instance for easy import
export const convex = {
  query: <T>(fn: any, args: Record<string, unknown>) => {
    const client = getConvexClient();
    return client.query(fn, args) as Promise<T>;
  },
  mutation: <T>(fn: any, args: Record<string, unknown>) => {
    const client = getConvexClient();
    return client.mutation(fn, args) as Promise<T>;
  },
};

/**
 * Typed query helper
 */
export async function convexQuery<T>(
  query: string,
  args: Record<string, unknown>
): Promise<T> {
  const client = getConvexClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (client.query as any)(query, args);
}

/**
 * Typed mutation helper
 */
export async function convexMutation<T>(
  mutation: string,
  args: Record<string, unknown>
): Promise<T> {
  const client = getConvexClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (client.mutation as any)(mutation, args);
}

/**
 * User-related Convex operations
 */
export const convexUsers = {
  getById: (id: string) => convexQuery("users:getById", { id }),
  getByEmail: (email: string) => convexQuery("users:getByEmail", { email }),
  getByWalletAddress: (walletAddress: string) =>
    convexQuery("users:getByWalletAddress", { walletAddress }),
  create: (args: {
    email: string;
    authProvider: "email" | "google" | "apple" | "wallet";
    displayName?: string;
    walletAddress?: string;
    referredBy?: string;
    passwordHash?: string;
  }) => convexMutation("users:create", args),
  update: (args: { id: string; [key: string]: unknown }) =>
    convexMutation("users:update", args),
  verifyEmail: (id: string) => convexMutation("users:verifyEmail", { id }),
  updateLastLogin: (id: string) =>
    convexMutation("users:updateLastLogin", { id }),
  updateKYCStatus: (args: {
    id: string;
    kycStatus: string;
    kycTier?: string;
  }) => convexMutation("users:updateKYCStatus", args),
  connectWallet: (args: { id: string; walletAddress: string }) =>
    convexMutation("users:connectWallet", args),
};

/**
 * Auth-related Convex operations
 */
export const convexAuth = {
  getUserForAuth: (email: string) =>
    convexQuery<{
      id: string;
      email: string;
      passwordHash?: string;
      status: "active" | "inactive" | "suspended" | "closed";
      emailVerified: boolean;
      displayName?: string;
      kycStatus: string;
      kycTier: string;
    } | null>("auth:getUserForAuth", { email }),

  getUserById: (id: string) =>
    convexQuery<{
      id: string;
      email: string;
      displayName?: string;
      emailVerified: boolean;
      kycStatus: string;
      kycTier: string;
      status: string;
    } | null>("auth:getUserById", { id }),

  validateCredentials: (email: string) =>
    convexQuery<{
      id: string;
      email: string;
      passwordHash?: string;
      status: string;
      emailVerified: boolean;
    } | null>("auth:validateCredentials", { email }),

  recordLoginAttempt: (args: {
    userId?: string;
    email: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
    failureReason?: string;
  }) => convexMutation("auth:recordLoginAttempt", args),

  createEmailVerificationToken: (args: {
    userId: string;
    token: string;
    expiresAt: number;
  }) => convexMutation("auth:createEmailVerificationToken", args),

  validateEmailVerificationToken: (token: string) =>
    convexMutation<{
      valid: boolean;
      error?: string;
      userId?: string;
      email?: string;
      displayName?: string;
    }>("auth:validateEmailVerificationToken", { token }),

  canResendVerificationEmail: (userId: string) =>
    convexQuery<{
      canResend: boolean;
      reason?: string;
      remainingSeconds?: number;
    }>("auth:canResendVerificationEmail", { userId }),

  createPasswordResetToken: (args: {
    userId: string;
    token: string;
    expiresAt: number;
  }) => convexMutation("auth:createPasswordResetToken", args),

  validatePasswordResetToken: (token: string) =>
    convexMutation<{
      valid: boolean;
      error?: string;
      userId?: string;
    }>("auth:validatePasswordResetToken", { token }),

  updatePassword: (args: { userId: string; passwordHash: string }) =>
    convexMutation("auth:updatePassword", args),
};

/**
 * Balance-related Convex operations
 */
export const convexBalances = {
  getByUser: (userId: string) => convexQuery("balances:getByUser", { userId }),
  getBuyingPower: (userId: string) =>
    convexQuery("balances:getBuyingPower", { userId }),
  getPortfolioSummary: (userId: string) =>
    convexQuery("balances:getPortfolioSummary", { userId }),
  credit: (args: {
    userId: string;
    assetType: string;
    assetId: string;
    symbol: string;
    amount: number;
  }) => convexMutation("balances:credit", args),
  debit: (args: {
    userId: string;
    assetType: string;
    assetId: string;
    amount: number;
  }) => convexMutation("balances:debit", args),
};

/**
 * Order-related Convex operations
 */
export const convexOrders = {
  getById: (id: string) => convexQuery("orders:getById", { id }),
  getByUser: (userId: string, limit?: number) =>
    convexQuery("orders:getByUser", { userId, limit }),
  getOpenOrders: (userId: string) =>
    convexQuery("orders:getOpenOrders", { userId }),
  create: (args: {
    userId: string;
    assetClass: "crypto" | "prediction" | "rwa";
    symbol: string;
    side: "buy" | "sell";
    type: "market" | "limit" | "stop" | "stop_limit";
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce: "day" | "gtc" | "ioc" | "fok";
  }) => convexMutation("orders:create", args),
  update: (args: { id: string; [key: string]: unknown }) =>
    convexMutation("orders:update", args),
  cancel: (id: string, reason?: string) =>
    convexMutation("orders:cancel", { id, reason }),
};

/**
 * Prediction-related Convex operations
 */
export const convexPredictions = {
  getEvents: (args?: { status?: string; category?: string; limit?: number }) =>
    convexQuery("predictions:getEvents", args ?? {}),
  getEventByTicker: (ticker: string) =>
    convexQuery("predictions:getEventByTicker", { ticker }),
  searchEvents: (args: { query: string; limit?: number }) =>
    convexQuery("predictions:searchEvents", args),
  syncEvents: (events: unknown[]) =>
    convexMutation("predictions:syncEvents", { events }),
  syncMarkets: (eventId: string, markets: unknown[]) =>
    convexMutation("predictions:syncMarkets", { eventId, markets }),
};

/**
 * Points-related Convex operations
 */
export const convexPoints = {
  getBalance: (userId: string) => convexQuery("points:getBalance", { userId }),
  getTransactions: (userId: string, limit?: number) =>
    convexQuery("points:getTransactions", { userId, limit }),
  getLeaderboard: (
    period: "daily" | "weekly" | "monthly" | "alltime",
    limit?: number
  ) => convexQuery("points:getLeaderboard", { period, limit }),
  earnPoints: (args: {
    userId: string;
    amount: number;
    type: string;
    description: string;
  }) => convexMutation("points:earnPoints", args),
};

/**
 * Audit log operations
 */
export const convexAudit = {
  log: (args: {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }) => convexMutation("audit:log", { ...args, timestamp: Date.now() }),
};

/**
 * Webhook event operations
 */
export const convexWebhooks = {
  logEvent: (args: {
    source: string;
    eventType: string;
    externalId?: string;
    payload: unknown;
  }) =>
    convexMutation("webhookEvents:log", {
      ...args,
      status: "received",
      receivedAt: Date.now(),
    }),
  updateStatus: (args: {
    id: string;
    status: "processing" | "processed" | "failed";
    error?: string;
  }) =>
    convexMutation("webhookEvents:updateStatus", {
      ...args,
      processedAt: Date.now(),
    }),
};
