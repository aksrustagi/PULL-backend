/**
 * Social Trading Activities for Temporal workflows
 * Activities for copy trading, stats calculation, leaderboards, and reputation
 */

import { ConvexHttpClient } from "convex/browser";

// Convex client
const CONVEX_URL = process.env.CONVEX_URL ?? "";
let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    if (!CONVEX_URL) {
      throw new Error("CONVEX_URL environment variable is not set");
    }
    convexClient = new ConvexHttpClient(CONVEX_URL);
  }
  return convexClient;
}

async function convexQuery<T>(query: string, args: Record<string, unknown>): Promise<T> {
  const client = getConvexClient();
  return await (client.query as any)(query, args);
}

async function convexMutation<T>(mutation: string, args: Record<string, unknown>): Promise<T> {
  const client = getConvexClient();
  return await (client.mutation as any)(mutation, args);
}

// ============================================================================
// Copy Trading Activities
// ============================================================================

export interface CopyTradingSubscription {
  _id: string;
  copierId: string;
  traderId: string;
  status: string;
  copyMode: string;
  fixedAmount?: number;
  portfolioPercentage?: number;
  copyRatio?: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTotalExposure: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  copyAssetClasses: string[];
  excludedSymbols: string[];
  copyDelaySeconds: number;
}

/**
 * Get copy trading subscription
 */
export async function getSubscription(subscriptionId: string): Promise<CopyTradingSubscription> {
  console.log(`Getting subscription: ${subscriptionId}`);
  
  const subscription = await convexQuery<CopyTradingSubscription>(
    "copyTradingSubscriptions:get",
    { id: subscriptionId }
  );
  
  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }
  
  return subscription;
}

/**
 * Validate if copy trade should be executed
 */
export async function validateCopyTrade(input: {
  subscription: CopyTradingSubscription;
  symbol: string;
  assetClass: string;
  tradeValue: number;
}): Promise<{ valid: boolean; skipReason?: string }> {
  const { subscription, symbol, assetClass, tradeValue } = input;

  // Check asset class is allowed
  if (!subscription.copyAssetClasses.includes(assetClass)) {
    return { valid: false, skipReason: "Asset class not allowed" };
  }

  // Check symbol is not excluded
  if (subscription.excludedSymbols.includes(symbol)) {
    return { valid: false, skipReason: "Symbol excluded" };
  }

  // Check position size
  if (tradeValue > subscription.maxPositionSize) {
    return { valid: false, skipReason: "Position size exceeded" };
  }

  // Check daily loss limit
  const dailyStats = await convexQuery<{ totalPnL: number }>(
    "copyTrades:getDailyStats",
    {
      subscriptionId: subscription._id,
      date: new Date().toISOString().split("T")[0],
    }
  ).catch(() => ({ totalPnL: 0 }));

  if (dailyStats.totalPnL < -subscription.maxDailyLoss) {
    return { valid: false, skipReason: "Daily loss limit reached" };
  }

  return { valid: true };
}

/**
 * Calculate copy trade quantity
 */
export async function calculateCopyQuantity(input: {
  subscription: CopyTradingSubscription;
  originalQuantity: number;
  originalPrice: number;
}): Promise<number> {
  const { subscription, originalQuantity, originalPrice } = input;

  switch (subscription.copyMode) {
    case "fixed_amount":
      return (subscription.fixedAmount ?? 0) / originalPrice;

    case "percentage_portfolio":
      // Get copier's portfolio value
      const portfolioValue = await convexQuery<{ totalValue: number }>(
        "balances:getPortfolioSummary",
        { userId: subscription.copierId }
      ).then(summary => summary.totalValue).catch(() => 10000);
      
      const amount = (portfolioValue * (subscription.portfolioPercentage ?? 0)) / 100;
      return amount / originalPrice;

    case "proportional":
      // Would calculate based on trader/copier portfolio ratio
      // For now, use a simplified approach
      return originalQuantity * 0.5;

    case "fixed_ratio":
      return originalQuantity * (subscription.copyRatio ?? 1);

    default:
      return 0;
  }
}

/**
 * Execute copy trade order
 */
export async function executeCopyOrder(input: {
  copierId: string;
  copyTradeId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  traderId: string;
}): Promise<{ orderId: string; status: string; fillPrice?: number }> {
  console.log(`Executing copy order for ${input.copierId}: ${input.side} ${input.quantity} ${input.symbol}`);

  // Create order in Convex
  const orderId = await convexMutation<string>("orders:create", {
    userId: input.copierId,
    assetClass: "crypto", // Would be determined from context
    symbol: input.symbol,
    side: input.side,
    type: "market",
    quantity: input.quantity,
    timeInForce: "ioc",
    metadata: {
      copyTradeId: input.copyTradeId,
      copiedFrom: input.traderId,
    },
  });

  // In a real implementation, this would:
  // 1. Submit order to exchange
  // 2. Wait for fill
  // 3. Return actual fill price
  
  return {
    orderId,
    status: "filled",
    fillPrice: 100, // Placeholder
  };
}

/**
 * Update copy trade record
 */
export async function updateCopyTrade(
  copyTradeId: string,
  updates: Record<string, unknown>
): Promise<void> {
  console.log(`Updating copy trade ${copyTradeId}`);
  
  await convexMutation("copyTrades:update", {
    id: copyTradeId,
    ...updates,
  });
}

/**
 * Calculate and charge copy trading fees
 */
export async function chargeCopyFees(input: {
  copyTradeId: string;
  copierId: string;
  traderId: string;
  tradeValue: number;
  copyTradingFee: number;
}): Promise<{ copyFee: number; platformFee: number }> {
  const { copyTradeId, copierId, traderId, tradeValue, copyTradingFee } = input;
  
  // Calculate fees
  const copyFee = (tradeValue * copyTradingFee) / 100;
  const platformFee = copyFee * 0.2; // Platform takes 20%
  const traderFee = copyFee * 0.8; // Trader gets 80%

  // Debit from copier
  await convexMutation("balances:debit", {
    userId: copierId,
    assetType: "fiat",
    assetId: "USD",
    amount: copyFee,
    reason: `Copy trading fee for ${copyTradeId}`,
  });

  // Credit to trader
  await convexMutation("balances:credit", {
    userId: traderId,
    assetType: "fiat",
    assetId: "USD",
    symbol: "USD",
    amount: traderFee,
    reason: `Copy trading fee from ${copyTradeId}`,
  });

  return { copyFee, platformFee };
}

/**
 * Send copy trade notification
 */
export async function sendCopyTradeNotification(input: {
  copierId: string;
  traderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  status: string;
}): Promise<void> {
  console.log(`Sending copy trade notification to ${input.copierId}`);
  
  // In a real implementation, this would send a push notification
  // For now, just log
}

// ============================================================================
// Trader Stats Activities
// ============================================================================

export interface Trade {
  _id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  pnl: number;
  pnlPercent: number;
  assetClass: string;
  executedAt: number;
}

/**
 * Get trader's trades for stats calculation
 */
export async function getTraderTrades(input: {
  userId: string;
  periodStart: number;
  periodEnd: number;
}): Promise<Trade[]> {
  console.log(`Getting trades for user ${input.userId} from ${input.periodStart} to ${input.periodEnd}`);
  
  const trades = await convexQuery<Trade[]>("trades:getByUserAndPeriod", {
    userId: input.userId,
    startTime: input.periodStart,
    endTime: input.periodEnd,
  });

  return trades;
}

/**
 * Calculate trader stats from trades
 */
export async function calculateTraderStats(input: {
  userId: string;
  period: string;
  periodStart: number;
  periodEnd: number;
  trades: Trade[];
}): Promise<{
  userId: string;
  period: string;
  periodStart: number;
  periodEnd: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalPnLPercent: number;
  avgPnLPerTrade: number;
  avgWinAmount: number;
  avgLossAmount: number;
  largestWin: number;
  largestLoss: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  volatility: number;
  calmarRatio: number;
  totalVolume: number;
  avgPositionSize: number;
  avgHoldingPeriod: number;
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
}> {
  const { userId, period, periodStart, periodEnd, trades } = input;

  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalPnLPercent = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const totalVolume = trades.reduce((sum, t) => sum + (t.quantity * t.price), 0);

  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
  const avgPnLPerTrade = trades.length > 0 ? totalPnL / trades.length : 0;
  const avgWinAmount = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLossAmount = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
  const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
  const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

  // Calculate volatility (standard deviation of returns)
  const avgReturn = totalPnLPercent / trades.length;
  const variance = trades.reduce((sum, t) => sum + Math.pow(t.pnlPercent - avgReturn, 2), 0) / trades.length;
  const volatility = Math.sqrt(variance);

  // Sharpe ratio (assuming 0% risk-free rate)
  const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

  // Sortino ratio (downside deviation)
  const downsideReturns = trades.filter(t => t.pnlPercent < 0).map(t => t.pnlPercent);
  const downsideVariance = downsideReturns.length > 0 
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDeviation > 0 ? avgReturn / downsideDeviation : 0;

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  
  for (const trade of trades) {
    runningPnL += trade.pnl;
    if (runningPnL > peak) {
      peak = runningPnL;
    }
    const drawdown = peak - runningPnL;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  // Calmar ratio (return / max drawdown)
  const calmarRatio = maxDrawdown > 0 ? totalPnL / maxDrawdown : 0;

  // Calculate streaks
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let currentStreak = 0;
  let lastWasWin = false;

  for (const trade of trades) {
    const isWin = trade.pnl > 0;
    if (isWin === lastWasWin) {
      currentStreak++;
    } else {
      currentStreak = 1;
      lastWasWin = isWin;
    }

    if (isWin) {
      currentWinStreak = currentStreak;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      currentLossStreak = 0;
    } else {
      currentLossStreak = currentStreak;
      longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      currentWinStreak = 0;
    }
  }

  return {
    userId,
    period,
    periodStart,
    periodEnd,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    totalPnL,
    totalPnLPercent,
    avgPnLPerTrade,
    avgWinAmount,
    avgLossAmount,
    largestWin,
    largestLoss,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    maxDrawdownPercent,
    volatility,
    calmarRatio,
    totalVolume,
    avgPositionSize: totalVolume / trades.length,
    avgHoldingPeriod: 0, // Would calculate from position data
    currentWinStreak,
    currentLossStreak,
    longestWinStreak,
    longestLossStreak,
  };
}

/**
 * Store trader stats
 */
export async function storeTraderStats(stats: {
  userId: string;
  period: string;
  periodStart: number;
  periodEnd: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalPnLPercent: number;
  avgPnLPerTrade: number;
  avgWinAmount: number;
  avgLossAmount: number;
  largestWin: number;
  largestLoss: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  volatility: number;
  calmarRatio: number;
  totalVolume: number;
  avgPositionSize: number;
  avgHoldingPeriod: number;
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
}): Promise<void> {
  console.log(`Storing trader stats for ${stats.userId}, period: ${stats.period}`);
  
  await convexMutation("traderStats:upsert", {
    ...stats,
    calculatedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// ============================================================================
// Leaderboard Activities
// ============================================================================

/**
 * Get qualified traders for leaderboard
 */
export async function getQualifiedTraders(input: {
  period: string;
  assetClass?: string;
  minTrades: number;
}): Promise<Array<{
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  tier?: string;
  value: number;
}>> {
  console.log(`Getting qualified traders for leaderboard: ${input.period}`);
  
  // Would query database for users with stats
  const stats = await convexQuery<any[]>("traderStats:getByPeriod", {
    period: input.period,
    minTrades: input.minTrades,
  });

  return stats.map(s => ({
    userId: s.userId,
    username: s.username,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    isVerified: s.isVerified,
    tier: s.tier,
    value: s.totalPnLPercent,
  }));
}

/**
 * Store leaderboard snapshot
 */
export async function storeLeaderboardSnapshot(snapshot: {
  leaderboardType: string;
  period: string;
  assetClass?: string;
  periodStart: number;
  periodEnd: number;
  entries: Array<{
    rank: number;
    previousRank?: number;
    userId: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    value: number;
    change?: number;
    changePercent?: number;
    tier?: string;
    isVerified: boolean;
  }>;
  totalParticipants: number;
}): Promise<string> {
  console.log(`Storing leaderboard snapshot: ${snapshot.leaderboardType} / ${snapshot.period}`);
  
  const snapshotId = await convexMutation<string>("leaderboardSnapshots:create", {
    ...snapshot,
    calculatedAt: Date.now(),
    createdAt: Date.now(),
  });
  
  return snapshotId;
}

/**
 * Update user leaderboard history
 */
export async function updateUserLeaderboardHistory(input: {
  entries: Array<{
    userId: string;
    leaderboardType: string;
    period: string;
    rank: number;
    value: number;
    percentile: number;
    snapshotId: string;
    periodStart: number;
  }>;
}): Promise<void> {
  console.log(`Updating leaderboard history for ${input.entries.length} users`);
  
  // Batch insert
  for (const entry of input.entries) {
    await convexMutation("userLeaderboardHistory:create", {
      ...entry,
      recordedAt: Date.now(),
    });
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Record audit log entry
 */
export async function recordAuditLog(input: {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`Audit log: ${input.action} on ${input.resourceType}/${input.resourceId}`);
  
  await convexMutation("audit:log", {
    ...input,
    timestamp: Date.now(),
  });
}
