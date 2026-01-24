/**
 * Convex Client for PULL API
 * Provides a typed interface for interacting with Convex from the API server
 */

import { ConvexHttpClient } from "convex/browser";

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

/**
 * Social trading operations
 */
export const convexSocial = {
  // Follow/Unfollow
  follow: (args: {
    followerId: string;
    followeeId: string;
    notificationsEnabled?: boolean;
    positionVisibility?: "all" | "entry_only" | "none";
  }) => convexMutation("social:follow", args),
  unfollow: (args: { followerId: string; followeeId: string }) =>
    convexMutation("social:unfollow", args),
  updateFollowSettings: (args: {
    followerId: string;
    followeeId: string;
    notificationsEnabled?: boolean;
    positionVisibility?: "all" | "entry_only" | "none";
  }) => convexMutation("social:updateFollowSettings", args),
  getFollowers: (args: { userId: string; limit?: number; cursor?: string }) =>
    convexQuery("social:getFollowers", args),
  getFollowing: (args: { userId: string; limit?: number }) =>
    convexQuery("social:getFollowing", args),
  isFollowing: (args: { followerId: string; followeeId: string }) =>
    convexQuery("social:isFollowing", args),

  // Trader Profiles
  getTraderProfile: (userId: string) =>
    convexQuery("social:getTraderProfile", { userId }),
  getTraderStats: (args: {
    userId: string;
    period?:
      | "daily"
      | "weekly"
      | "monthly"
      | "quarterly"
      | "yearly"
      | "all_time";
  }) => convexQuery("social:getTraderStats", args),
  getTraderReputation: (userId: string) =>
    convexQuery("social:getTraderReputation", { userId }),
  upsertTraderProfile: (args: {
    userId: string;
    isPublic?: boolean;
    allowCopyTrading?: boolean;
    allowAutoCopy?: boolean;
    copyTradingFee?: number;
    performanceFee?: number;
    bio?: string;
    tradingStyle?: string;
    tradingPhilosophy?: string;
    riskProfile?: "conservative" | "moderate" | "aggressive" | "very_aggressive";
    preferredAssets?: string[];
    twitterHandle?: string;
    discordHandle?: string;
    telegramHandle?: string;
    websiteUrl?: string;
  }) => convexMutation("social:upsertTraderProfile", args),

  // Leaderboard
  getLeaderboard: (args: {
    leaderboardType:
      | "pnl"
      | "pnl_percent"
      | "sharpe_ratio"
      | "win_rate"
      | "total_trades"
      | "followers"
      | "copiers"
      | "reputation";
    period: "daily" | "weekly" | "monthly" | "all_time";
    assetClass?: string;
    limit?: number;
    offset?: number;
  }) => convexQuery("social:getLeaderboard", args),
  getMyLeaderboardRank: (args: {
    userId: string;
    leaderboardType: string;
    period: string;
  }) => convexQuery("social:getMyLeaderboardRank", args),

  // Copy Trading
  getCopySettings: (args: { copierId: string; traderId: string }) =>
    convexQuery("social:getCopySettings", args),
  getMyCopySubscriptions: (args: {
    copierId: string;
    status?:
      | "pending"
      | "active"
      | "paused"
      | "stopped"
      | "cancelled";
  }) => convexQuery("social:getMyCopySubscriptions", args),
  getMyCopiers: (args: { traderId: string; status?: string }) =>
    convexQuery("social:getMyCopiers", args),
  getCopyTrades: (args: { subscriptionId: string; limit?: number }) =>
    convexQuery("social:getCopyTrades", args),
  activateCopyTrading: (args: {
    copierId: string;
    traderId: string;
    copyMode: "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";
    fixedAmount?: number;
    portfolioPercentage?: number;
    copyRatio?: number;
    maxPositionSize: number;
    maxDailyLoss: number;
    maxTotalExposure: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
    copyAssetClasses: string[];
    excludedSymbols?: string[];
    copyDelaySeconds?: number;
  }) => convexMutation("social:activateCopyTrading", args),
  deactivateCopyTrading: (subscriptionId: string) =>
    convexMutation("social:deactivateCopyTrading", { subscriptionId }),
  updateCopySettings: (args: {
    subscriptionId: string;
    copyMode?: "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";
    fixedAmount?: number;
    portfolioPercentage?: number;
    copyRatio?: number;
    maxPositionSize?: number;
    maxDailyLoss?: number;
    maxTotalExposure?: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
    copyAssetClasses?: string[];
    excludedSymbols?: string[];
    copyDelaySeconds?: number;
  }) => convexMutation("social:updateCopySettings", args),
  pauseCopyTrading: (subscriptionId: string) =>
    convexMutation("social:pauseCopyTrading", { subscriptionId }),
  resumeCopyTrading: (subscriptionId: string) =>
    convexMutation("social:resumeCopyTrading", { subscriptionId }),
};
