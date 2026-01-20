/**
 * Social Trading Activities
 * All activities for social trading workflows
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
// ============================================================================

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  notionalValue: number;
  pnl: number;
  executedAt: number;
  settledAt?: number;
}

export interface CopierSettings {
  copySettingsId: string;
  copierId: string;
  allocationPercent: number;
  maxPositionSize: number;
  minPositionSize: number;
  excludeMarketTypes: string[];
}

export interface WashTradingResult {
  detected: boolean;
  occurrences: number;
  suspiciousTrades: Array<{
    buyOrderId: string;
    sellOrderId: string;
    timestamp: number;
  }>;
  totalVolume: number;
}

export interface CircularCopyResult {
  detected: boolean;
  chains: Array<string[]>;
  involvedUsers: string[];
}

export interface PumpAndDumpResult {
  detected: boolean;
  suspiciousTrades: Trade[];
  priceImpact: number;
  followerGain: number;
  impactedCopiers: number;
  traderPnL: number;
}

export interface FakeFollowerResult {
  detected: boolean;
  totalFollowers: number;
  fakeFollowers: number;
  fakePercent: number;
  suspiciousAccounts: string[];
}

export interface OrderResult {
  orderId: string;
  status: "submitted" | "filled" | "partial_fill" | "rejected" | "cancelled";
  filledQuantity: number;
  averagePrice: number;
  reason?: string;
}

// ============================================================================
// Trader Stats Activities
// ============================================================================

/**
 * Get all traders that need stats update
 */
export async function getAllTradersForStatsUpdate(): Promise<string[]> {
  console.log("[Social Activity] Getting all traders for stats update");

  // TODO: Call Convex query to get users with trading activity
  // This should return user IDs that have traded in the last period

  return [];
}

/**
 * Get trades for a specific period
 */
export async function getTradesForPeriod(
  userId: string,
  startDate: number,
  endDate: number
): Promise<Trade[]> {
  console.log(
    `[Social Activity] Getting trades for ${userId} from ${startDate} to ${endDate}`
  );
  Context.current().heartbeat(`Fetching trades for ${userId}`);

  // TODO: Call Convex query
  return [];
}

/**
 * Calculate time-weighted returns
 */
export async function calculateReturns(
  trades: Trade[],
  startDate: number,
  endDate: number
): Promise<number> {
  console.log(`[Social Activity] Calculating returns for ${trades.length} trades`);

  if (trades.length === 0) return 0;

  // Calculate total P&L
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalInvested = trades
    .filter((t) => t.side === "buy")
    .reduce((sum, t) => sum + t.notionalValue, 0);

  if (totalInvested === 0) return 0;

  // Simple return calculation
  return (totalPnL / totalInvested) * 100;
}

/**
 * Calculate Sharpe Ratio
 * Sharpe = (Return - RiskFreeRate) / StdDev(Returns)
 */
export async function calculateSharpeRatio(
  trades: Trade[],
  riskFreeRate: number
): Promise<number> {
  console.log(`[Social Activity] Calculating Sharpe ratio`);

  if (trades.length < 2) return 0;

  // Group trades by day to get daily returns
  const dailyReturns = getDailyReturns(trades);

  if (dailyReturns.length < 2) return 0;

  // Calculate average return
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;

  // Calculate standard deviation
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize (assume 252 trading days)
  const annualizedReturn = avgReturn * 252;
  const annualizedStdDev = stdDev * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

/**
 * Calculate Sortino Ratio
 * Similar to Sharpe but only considers downside deviation
 */
export async function calculateSortinoRatio(
  trades: Trade[],
  riskFreeRate: number
): Promise<number> {
  console.log(`[Social Activity] Calculating Sortino ratio`);

  if (trades.length < 2) return 0;

  const dailyReturns = getDailyReturns(trades);

  if (dailyReturns.length < 2) return 0;

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;

  // Calculate downside deviation (only negative returns)
  const negativeReturns = dailyReturns.filter((r) => r < 0);
  if (negativeReturns.length === 0) return 999; // Perfect performance

  const downsideVariance =
    negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) /
    negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) return 999;

  // Annualize
  const annualizedReturn = avgReturn * 252;
  const annualizedDownside = downsideDeviation * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedDownside;
}

/**
 * Calculate max drawdown from equity curve
 */
export async function calculateMaxDrawdown(
  trades: Trade[]
): Promise<{ maxDrawdown: number; currentDrawdown: number }> {
  console.log(`[Social Activity] Calculating max drawdown`);

  if (trades.length === 0) {
    return { maxDrawdown: 0, currentDrawdown: 0 };
  }

  // Sort trades by execution time
  const sortedTrades = [...trades].sort((a, b) => a.executedAt - b.executedAt);

  // Build equity curve
  let equity = 10000; // Starting balance assumption
  let peak = equity;
  let maxDrawdown = 0;

  for (const trade of sortedTrades) {
    equity += trade.pnl;

    if (equity > peak) {
      peak = equity;
    }

    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const currentDrawdown = ((peak - equity) / peak) * 100;

  return {
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    currentDrawdown: Math.round(currentDrawdown * 100) / 100,
  };
}

/**
 * Calculate win/loss statistics
 */
export async function calculateWinLossStats(trades: Trade[]): Promise<{
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitableTrades: number;
  avgHoldingPeriod: number;
}> {
  console.log(`[Social Activity] Calculating win/loss stats`);

  if (trades.length === 0) {
    return {
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitableTrades: 0,
      avgHoldingPeriod: 0,
    };
  }

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);

  const winRate = (winners.length / trades.length) * 100;
  const avgWin =
    winners.length > 0
      ? winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length
      : 0;
  const avgLoss =
    losers.length > 0
      ? Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length)
      : 0;

  // Calculate average holding period (in hours)
  let totalHoldingTime = 0;
  let holdingCount = 0;

  for (const trade of trades) {
    if (trade.settledAt && trade.executedAt) {
      totalHoldingTime += trade.settledAt - trade.executedAt;
      holdingCount++;
    }
  }

  const avgHoldingPeriod =
    holdingCount > 0 ? totalHoldingTime / holdingCount / (1000 * 60 * 60) : 0;

  return {
    winRate: Math.round(winRate * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitableTrades: winners.length,
    avgHoldingPeriod: Math.round(avgHoldingPeriod * 10) / 10,
  };
}

/**
 * Update trader stats in Convex
 */
export async function updateTraderStats(
  userId: string,
  stats: {
    totalReturn: number;
    return30d: number;
    return7d: number;
    return24h: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    currentDrawdown: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    totalTrades: number;
    profitableTrades: number;
    avgHoldingPeriod: number;
  }
): Promise<void> {
  console.log(`[Social Activity] Updating trader stats for ${userId}`);

  // TODO: Call Convex mutation - updateTraderStats
}

/**
 * Batch update trader stats
 */
export async function batchUpdateTraderStats(
  updates: Array<{
    userId: string;
    stats: {
      totalReturn: number;
      return30d: number;
      return7d: number;
      return24h: number;
      sharpeRatio: number;
      sortinoRatio: number;
      maxDrawdown: number;
      currentDrawdown: number;
      winRate: number;
      avgWin: number;
      avgLoss: number;
      totalTrades: number;
      profitableTrades: number;
      avgHoldingPeriod: number;
    };
  }>
): Promise<void> {
  console.log(`[Social Activity] Batch updating ${updates.length} trader stats`);
  Context.current().heartbeat(`Batch update: ${updates.length} traders`);

  // TODO: Call Convex mutation in batches
  for (const update of updates) {
    await updateTraderStats(update.userId, update.stats);
  }
}

/**
 * Recalculate leaderboard positions
 */
export async function recalculateLeaderboardPositions(): Promise<void> {
  console.log(`[Social Activity] Recalculating leaderboard positions`);

  // TODO: This could trigger cache invalidation or ranking updates
}

// ============================================================================
// Copy Trading Activities
// ============================================================================

/**
 * Get all active copiers for a trader
 */
export async function getActiveCopiers(traderId: string): Promise<CopierSettings[]> {
  console.log(`[Social Activity] Getting active copiers for ${traderId}`);

  // TODO: Call Convex query - getActiveCopiers
  return [];
}

/**
 * Get trade details
 */
export async function getTradeDetails(
  tradeId: string
): Promise<Trade | null> {
  console.log(`[Social Activity] Getting trade details for ${tradeId}`);

  // TODO: Call Convex query
  return null;
}

/**
 * Check if market type is excluded
 */
export async function checkMarketTypeExcluded(
  marketType: string,
  excludeList: string[]
): Promise<boolean> {
  return excludeList.includes(marketType);
}

/**
 * Calculate copy position size
 */
export async function calculateCopyPositionSize(
  originalQuantity: number,
  originalPrice: number,
  allocationPercent: number,
  portfolioValue: number,
  maxPositionSize: number,
  minPositionSize: number
): Promise<{ quantity: number; positionValue: number }> {
  // Calculate target position based on allocation
  const targetAllocation = portfolioValue * (allocationPercent / 100);
  const originalPositionValue = originalQuantity * originalPrice;

  // Scale position to allocation
  let positionValue = (originalPositionValue / portfolioValue) * targetAllocation;

  // Apply limits
  if (positionValue > maxPositionSize) {
    positionValue = maxPositionSize;
  }

  if (positionValue < minPositionSize) {
    return { quantity: 0, positionValue: 0 };
  }

  const quantity = Math.floor(positionValue / originalPrice);

  return {
    quantity,
    positionValue: quantity * originalPrice,
  };
}

/**
 * Check copier balance
 */
export async function checkCopierBalance(
  copierId: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; available: number }> {
  console.log(`[Social Activity] Checking balance for ${copierId}`);

  // TODO: Call Convex query
  return {
    sufficient: true,
    available: 10000,
  };
}

/**
 * Get copier's total portfolio value
 */
export async function getCopierPortfolioValue(copierId: string): Promise<number> {
  console.log(`[Social Activity] Getting portfolio value for ${copierId}`);

  // TODO: Call Convex query to sum up:
  // - Cash balance
  // - Open positions value

  return 10000; // Default for now
}

/**
 * Execute copy order
 */
export async function executeCopierOrder(input: {
  copierId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  originalTradeId: string;
  originalTraderId: string;
}): Promise<OrderResult> {
  console.log(
    `[Social Activity] Executing copy order for ${input.copierId}: ${input.side} ${input.quantity} ${input.symbol}`
  );

  // TODO: Trigger OrderExecutionWorkflow
  // Tag order as copy trade for analytics

  return {
    orderId: `copy_order_${crypto.randomUUID()}`,
    status: "filled",
    filledQuantity: input.quantity,
    averagePrice: input.price,
  };
}

/**
 * Record copy trade in Convex
 */
export async function recordCopyTrade(input: {
  copySettingsId: string;
  copierId: string;
  traderId: string;
  originalOrderId: string;
  copiedOrderId?: string;
  symbol: string;
  side: "buy" | "sell";
  originalQuantity: number;
  copiedQuantity: number;
  originalPrice: number;
  copiedPrice?: number;
  status: "pending" | "executed" | "partial" | "failed" | "skipped";
  skipReason?: string;
}): Promise<void> {
  console.log(
    `[Social Activity] Recording copy trade: ${input.status} for ${input.copierId}`
  );

  // TODO: Call Convex mutation - recordCopyTrade
}

/**
 * Update copy settings stats
 */
export async function updateCopySettingsStats(
  copySettingsId: string,
  copiedAmount: number
): Promise<void> {
  console.log(
    `[Social Activity] Updating copy settings ${copySettingsId}: +$${copiedAmount}`
  );

  // TODO: Call Convex mutation to update totalCopied
}

/**
 * Send copy notification to user
 */
export async function sendCopyNotification(input: {
  copierId: string;
  traderId: string;
  tradeId: string;
  symbol: string;
  side: "buy" | "sell";
  copiedQuantity: number;
  copiedPrice: number;
}): Promise<void> {
  console.log(`[Social Activity] Sending copy notification to ${input.copierId}`);

  // TODO: Send push notification / in-app notification
}

// ============================================================================
// Fraud Detection Activities
// ============================================================================

/**
 * Get all active traders for fraud scan
 */
export async function getAllActiveTraders(): Promise<string[]> {
  console.log(`[Social Activity] Getting all active traders for fraud scan`);

  // TODO: Call Convex query
  return [];
}

/**
 * Detect wash trading
 */
export async function detectWashTrading(
  userId: string,
  lookbackDays: number
): Promise<WashTradingResult> {
  console.log(`[Social Activity] Detecting wash trading for ${userId}`);
  Context.current().heartbeat(`Wash trading check: ${userId}`);

  // TODO: Query trades and look for:
  // - Buy/sell pairs of same asset within short time window
  // - Unusual volume patterns
  // - Self-matching (if exchange provides counterparty info)

  return {
    detected: false,
    occurrences: 0,
    suspiciousTrades: [],
    totalVolume: 0,
  };
}

/**
 * Detect circular copying (A copies B, B copies A)
 */
export async function detectCircularCopying(
  userId: string,
  maxChainLength: number
): Promise<CircularCopyResult> {
  console.log(`[Social Activity] Detecting circular copying for ${userId}`);

  // TODO: Build copy relationship graph
  // - Get users this trader copies
  // - For each, check if they copy back to original user
  // - Check for longer chains (A->B->C->A)

  return {
    detected: false,
    chains: [],
    involvedUsers: [],
  };
}

/**
 * Detect pump and dump schemes
 */
export async function detectPumpAndDump(
  userId: string,
  thresholds: {
    positionSizeMultiple: number;
    priceImpactPercent: number;
    followerGainThreshold: number;
  }
): Promise<PumpAndDumpResult> {
  console.log(`[Social Activity] Detecting pump and dump for ${userId}`);
  Context.current().heartbeat(`Pump and dump check: ${userId}`);

  // TODO: Look for patterns:
  // - Large position build-up
  // - Increased social promotion / leaderboard visibility
  // - Rapid follower/copier gain
  // - Exit trade at peak with significant profit
  // - Copiers left holding losing positions

  return {
    detected: false,
    suspiciousTrades: [],
    priceImpact: 0,
    followerGain: 0,
    impactedCopiers: 0,
    traderPnL: 0,
  };
}

/**
 * Detect fake followers
 */
export async function detectFakeFollowers(
  userId: string,
  thresholds: {
    minFollowers: number;
    inactiveThreshold: number;
    minAccountAgeDays: number;
  }
): Promise<FakeFollowerResult> {
  console.log(`[Social Activity] Detecting fake followers for ${userId}`);

  // TODO: Analyze follower accounts:
  // - Account age
  // - Trading activity
  // - Following patterns (following many traders but no activity)
  // - Email verification status

  return {
    detected: false,
    totalFollowers: 0,
    fakeFollowers: 0,
    fakePercent: 0,
    suspiciousAccounts: [],
  };
}

/**
 * Record fraud flag
 */
export async function recordFraudFlag(input: {
  userId: string;
  type: "wash_trading" | "circular_copying" | "pump_and_dump" | "fake_followers";
  severity: "low" | "medium" | "high" | "critical";
  evidence: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Social Activity] Recording fraud flag for ${input.userId}: ${input.type}`);

  // TODO: Call Convex mutation - recordFraudFlag
}

/**
 * Disable copy features for a user
 */
export async function disableCopyFeatures(userId: string): Promise<void> {
  console.log(`[Social Activity] Disabling copy features for ${userId}`);

  // TODO:
  // - Deactivate all copy settings where user is trader
  // - Prevent new copiers
  // - Update user flags
}

/**
 * Send fraud alert to admin
 */
export async function sendFraudAlert(input: {
  type: string;
  userId: string;
  severity: string;
  evidence: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Social Activity] Sending fraud alert: ${input.type} for ${input.userId}`);

  // TODO: Send alert via:
  // - Admin notification
  // - Slack/Discord webhook
  // - Email to compliance team
}

/**
 * Analyze user trades for fraud patterns
 */
export async function analyzeUserTradesForFraud(
  userId: string
): Promise<{
  washTrading: boolean;
  pumpAndDump: boolean;
  anomalies: string[];
}> {
  console.log(`[Social Activity] Analyzing trades for fraud: ${userId}`);
  Context.current().heartbeat(`Fraud analysis: ${userId}`);

  // TODO: Comprehensive trade analysis

  return {
    washTrading: false,
    pumpAndDump: false,
    anomalies: [],
  };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log entry
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(
    `[Social Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`
  );

  // TODO: Call Convex mutation to log audit event
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group trades by day and calculate daily returns
 */
function getDailyReturns(trades: Trade[]): number[] {
  if (trades.length === 0) return [];

  // Sort by execution time
  const sorted = [...trades].sort((a, b) => a.executedAt - b.executedAt);

  // Group by day
  const dailyPnL: Map<string, { pnl: number; invested: number }> = new Map();

  for (const trade of sorted) {
    const day = new Date(trade.executedAt).toISOString().split("T")[0];
    const existing = dailyPnL.get(day) || { pnl: 0, invested: 0 };

    existing.pnl += trade.pnl;
    if (trade.side === "buy") {
      existing.invested += trade.notionalValue;
    }

    dailyPnL.set(day, existing);
  }

  // Calculate returns for each day
  const returns: number[] = [];
  let cumulativeInvested = 0;

  for (const [, data] of dailyPnL) {
    cumulativeInvested += data.invested;
    if (cumulativeInvested > 0) {
      returns.push((data.pnl / cumulativeInvested) * 100);
    }
  }

  return returns;
}
