/**
 * Social Trading Activities for Temporal workflows
 * Activities for trader stats, copy trading, fraud detection, and reputation calculation
 */

import { ConvexHttpClient } from "convex/browser";
import { randomUUID } from "crypto";

const convexUrl = process.env.CONVEX_URL || "";
const convex = new ConvexHttpClient(convexUrl);

// ============================================================================
// TRADER STATS ACTIVITIES
// ============================================================================

export interface TraderStats {
  userId: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";
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
  riskScore?: number;
  diversificationScore?: number;
  consistencyScore?: number;
}

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  entryTime: number;
  exitTime?: number;
  status: "open" | "closed";
}

/**
 * Fetch trades for a user within a period
 */
export async function fetchUserTrades(
  userId: string,
  periodStart: number,
  periodEnd: number
): Promise<Trade[]> {
  console.log(`Fetching trades for user ${userId} from ${periodStart} to ${periodEnd}`);
  
  // TODO: Query Convex for trades
  // const trades = await convex.query(api.trades.getByUserAndPeriod, {
  //   userId,
  //   startTime: periodStart,
  //   endTime: periodEnd,
  // });
  
  return [];
}

/**
 * Calculate trader statistics from trades
 */
export async function calculateTraderStats(
  userId: string,
  period: TraderStats["period"],
  periodStart: number,
  periodEnd: number
): Promise<TraderStats> {
  console.log(`Calculating stats for user ${userId}, period ${period}`);

  const trades = await fetchUserTrades(userId, periodStart, periodEnd);
  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl !== undefined);

  if (closedTrades.length === 0) {
    return getEmptyStats(userId, period, periodStart, periodEnd);
  }

  // Basic metrics
  const winningTrades = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
  const losingTrades = closedTrades.filter((t) => (t.pnl ?? 0) < 0);
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const totalVolume = closedTrades.reduce((sum, t) => sum + t.quantity * t.entryPrice, 0);

  // Win/loss metrics
  const avgWinAmount = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / winningTrades.length
    : 0;
  const avgLossAmount = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / losingTrades.length
    : 0;
  const largestWin = winningTrades.length > 0
    ? Math.max(...winningTrades.map((t) => t.pnl ?? 0))
    : 0;
  const largestLoss = losingTrades.length > 0
    ? Math.min(...losingTrades.map((t) => t.pnl ?? 0))
    : 0;

  // Streak calculation
  const streaks = calculateStreaks(closedTrades);

  // Risk metrics
  const returns = closedTrades.map((t) => t.pnlPercent ?? 0);
  const sharpeRatio = calculateSharpeRatio(returns);
  const sortinoRatio = calculateSortinoRatio(returns);
  const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(closedTrades);
  const volatility = calculateVolatility(returns);
  const calmarRatio = totalPnL / (Math.abs(maxDrawdown) || 1);

  // Holding period
  const avgHoldingPeriod = closedTrades
    .filter((t) => t.exitTime && t.entryTime)
    .reduce((sum, t) => sum + ((t.exitTime ?? 0) - t.entryTime), 0) / closedTrades.length;

  // Enhanced metrics
  const riskScore = calculateRiskScore(volatility, maxDrawdownPercent, sharpeRatio);
  const diversificationScore = calculateDiversificationScore(closedTrades);
  const consistencyScore = calculateConsistencyScore(returns);

  return {
    userId,
    period,
    periodStart,
    periodEnd,
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0,
    totalPnL,
    totalPnLPercent: totalVolume > 0 ? (totalPnL / totalVolume) * 100 : 0,
    avgPnLPerTrade: totalPnL / closedTrades.length,
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
    avgPositionSize: totalVolume / closedTrades.length,
    avgHoldingPeriod,
    currentWinStreak: streaks.currentWinStreak,
    currentLossStreak: streaks.currentLossStreak,
    longestWinStreak: streaks.longestWinStreak,
    longestLossStreak: streaks.longestLossStreak,
    riskScore,
    diversificationScore,
    consistencyScore,
  };
}

/**
 * Save trader stats to Convex
 */
export async function saveTraderStats(stats: TraderStats): Promise<void> {
  console.log(`Saving stats for user ${stats.userId}, period ${stats.period}`);
  
  // TODO: Save to Convex using mutation
  // await convex.mutation(api.social.mutations.upsertTraderStats, stats);
}

// ============================================================================
// COPY TRADING ACTIVITIES
// ============================================================================

export interface CopyTradeParams {
  subscriptionId: string;
  copierId: string;
  traderId: string;
  originalOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  originalQuantity: number;
  originalPrice: number;
}

export interface CopyTradeResult {
  success: boolean;
  copyOrderId?: string;
  copyQuantity: number;
  copyPrice?: number;
  slippage?: number;
  skipReason?: string;
  failureReason?: string;
  copyFee: number;
  performanceFee: number;
}

/**
 * Calculate copy trade size based on subscription settings
 */
export async function calculateCopySize(
  subscriptionId: string,
  originalQuantity: number,
  originalPrice: number
): Promise<number> {
  console.log(`Calculating copy size for subscription ${subscriptionId}`);

  // TODO: Fetch subscription settings from Convex
  // const subscription = await convex.query(api.social.queries.getCopySubscription, {
  //   subscriptionId,
  // });

  // Placeholder - return 50% of original size
  return originalQuantity * 0.5;
}

/**
 * Apply risk controls to copy trade
 */
export async function applyRiskControls(
  subscriptionId: string,
  symbol: string,
  side: "buy" | "sell",
  quantity: number,
  price: number
): Promise<{ allowed: boolean; reason?: string }> {
  console.log(`Applying risk controls for subscription ${subscriptionId}`);

  // TODO: Fetch subscription settings and check limits
  // - Max position size
  // - Max daily loss
  // - Max total exposure
  // - Asset class filters
  // - Excluded symbols

  return { allowed: true };
}

/**
 * Execute copy trade
 */
export async function executeCopyTrade(
  params: CopyTradeParams,
  copyQuantity: number
): Promise<CopyTradeResult> {
  console.log(`Executing copy trade for ${params.symbol}`);

  try {
    // TODO: Place order through trading system
    // const orderResult = await placeOrder({...});

    // Calculate fees (placeholder)
    const tradeValue = copyQuantity * params.originalPrice;
    const copyFee = tradeValue * 0.001; // 0.1% copy fee
    const performanceFee = 0; // Calculated on close

    return {
      success: true,
      copyOrderId: `copy_order_${randomUUID()}`,
      copyQuantity,
      copyPrice: params.originalPrice,
      slippage: 0,
      copyFee,
      performanceFee,
    };
  } catch (error) {
    return {
      success: false,
      copyQuantity: 0,
      failureReason: error instanceof Error ? error.message : "Unknown error",
      copyFee: 0,
      performanceFee: 0,
    };
  }
}

/**
 * Record copy trade execution
 */
export async function recordCopyTrade(
  params: CopyTradeParams,
  result: CopyTradeResult
): Promise<void> {
  console.log(`Recording copy trade for subscription ${params.subscriptionId}`);

  // TODO: Call Convex mutation to record copy trade
  // await convex.mutation(api.social.mutations.recordCopyTrade, {
  //   subscriptionId: params.subscriptionId,
  //   copierId: params.copierId,
  //   traderId: params.traderId,
  //   originalOrderId: params.originalOrderId,
  //   symbol: params.symbol,
  //   side: params.side,
  //   originalQuantity: params.originalQuantity,
  //   originalPrice: params.originalPrice,
  //   copyQuantity: result.copyQuantity,
  //   copyPrice: result.copyPrice,
  //   copyOrderId: result.copyOrderId,
  //   status: result.success ? "filled" : "failed",
  //   skipReason: result.skipReason,
  //   failureReason: result.failureReason,
  //   slippage: result.slippage ?? 0,
  //   copyFee: result.copyFee,
  //   performanceFee: result.performanceFee,
  // });
}

// ============================================================================
// FRAUD DETECTION ACTIVITIES
// ============================================================================

export interface FraudAlert {
  userId: string;
  alertType: "wash_trading" | "manipulation" | "front_running" | "fake_performance" | "collusion" | "unusual_activity" | "bot_behavior";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  evidence: any[];
}

/**
 * Detect wash trading patterns
 */
export async function detectWashTrading(userId: string): Promise<FraudAlert | null> {
  console.log(`Detecting wash trading for user ${userId}`);

  // TODO: Analyze trades for:
  // - Self-trading patterns
  // - Matched buy/sell orders
  // - Circular trading patterns
  // - Abnormal fill rates

  return null;
}

/**
 * Detect front-running
 */
export async function detectFrontRunning(userId: string): Promise<FraudAlert | null> {
  console.log(`Detecting front-running for user ${userId}`);

  // TODO: Analyze copy trades for:
  // - Trader placing orders before copiers
  // - Abnormal slippage on copy trades
  // - Pattern of price movement after trader's entry

  return null;
}

/**
 * Detect unusual volume
 */
export async function detectUnusualVolume(userId: string): Promise<FraudAlert | null> {
  console.log(`Detecting unusual volume for user ${userId}`);

  // TODO: Analyze for:
  // - Sudden spike in trading volume
  // - Volume inconsistent with account size
  // - Coordinated volume spikes

  return null;
}

/**
 * Detect performance manipulation
 */
export async function detectPerformanceManipulation(
  userId: string
): Promise<FraudAlert | null> {
  console.log(`Detecting performance manipulation for user ${userId}`);

  // TODO: Analyze for:
  // - Artificially inflating returns
  // - Hiding losses
  // - Cherry-picking trades
  // - Fake followers/copiers

  return null;
}

/**
 * Save fraud alert
 */
export async function saveFraudAlert(alert: FraudAlert): Promise<void> {
  console.log(`Saving fraud alert for user ${alert.userId}: ${alert.alertType}`);

  // TODO: Save to Convex
  // await convex.mutation(api.social.mutations.createFraudAlert, alert);
}

// ============================================================================
// REPUTATION CALCULATION ACTIVITIES
// ============================================================================

export interface ReputationScore {
  userId: string;
  overallScore: number;
  performanceScore: number;
  consistencyScore: number;
  riskManagementScore: number;
  transparencyScore: number;
  socialScore: number;
  longevityScore: number;
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend";
  badges: Array<{ type: string; name: string; earnedAt: number }>;
}

/**
 * Calculate reputation scores
 */
export async function calculateReputation(userId: string): Promise<ReputationScore> {
  console.log(`Calculating reputation for user ${userId}`);

  // TODO: Fetch user data and calculate scores
  // - Performance score: based on returns, Sharpe ratio, win rate
  // - Consistency score: variance in returns, streak patterns
  // - Risk management score: drawdown, volatility, risk controls
  // - Transparency score: verified returns, audited, public profile
  // - Social score: followers, copiers, engagement
  // - Longevity score: account age, trading history

  const performanceScore = 75;
  const consistencyScore = 70;
  const riskManagementScore = 80;
  const transparencyScore = 60;
  const socialScore = 65;
  const longevityScore = 50;

  const overallScore =
    (performanceScore * 0.3 +
      consistencyScore * 0.2 +
      riskManagementScore * 0.2 +
      transparencyScore * 0.1 +
      socialScore * 0.1 +
      longevityScore * 0.1) *
    10; // Scale to 0-1000

  const tier = getTierFromScore(overallScore);
  const badges = calculateBadges(userId, {
    performanceScore,
    consistencyScore,
    riskManagementScore,
    transparencyScore,
    socialScore,
    longevityScore,
  });

  return {
    userId,
    overallScore,
    performanceScore,
    consistencyScore,
    riskManagementScore,
    transparencyScore,
    socialScore,
    longevityScore,
    tier,
    badges,
  };
}

/**
 * Save reputation scores
 */
export async function saveReputation(reputation: ReputationScore): Promise<void> {
  console.log(`Saving reputation for user ${reputation.userId}`);

  // TODO: Save to Convex
  // await convex.mutation(api.social.mutations.upsertReputationScore, reputation);
}

// ============================================================================
// LEADERBOARD ACTIVITIES
// ============================================================================

/**
 * Generate leaderboard snapshot
 */
export async function generateLeaderboardSnapshot(
  leaderboardType: string,
  period: string,
  periodStart: number,
  periodEnd: number
): Promise<void> {
  console.log(`Generating leaderboard snapshot: ${leaderboardType} - ${period}`);

  // TODO: Query trader stats for period and rank users
  // TODO: Save snapshot to Convex
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEmptyStats(
  userId: string,
  period: TraderStats["period"],
  periodStart: number,
  periodEnd: number
): TraderStats {
  return {
    userId,
    period,
    periodStart,
    periodEnd,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPnL: 0,
    totalPnLPercent: 0,
    avgPnLPerTrade: 0,
    avgWinAmount: 0,
    avgLossAmount: 0,
    largestWin: 0,
    largestLoss: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    volatility: 0,
    calmarRatio: 0,
    totalVolume: 0,
    avgPositionSize: 0,
    avgHoldingPeriod: 0,
    currentWinStreak: 0,
    currentLossStreak: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
  };
}

function calculateStreaks(trades: Trade[]) {
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;

  for (const trade of trades) {
    if ((trade.pnl ?? 0) > 0) {
      tempWinStreak++;
      tempLossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
    } else if ((trade.pnl ?? 0) < 0) {
      tempLossStreak++;
      tempWinStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, tempLossStreak);
    }
  }

  currentWinStreak = tempWinStreak;
  currentLossStreak = tempLossStreak;

  return { currentWinStreak, currentLossStreak, longestWinStreak, longestLossStreak };
}

function calculateSharpeRatio(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > 0 ? avgReturn / stdDev : 0;
}

function calculateSortinoRatio(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const negativeReturns = returns.filter((r) => r < 0);
  
  if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;
  
  const downside = Math.sqrt(
    negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
  );
  
  return downside > 0 ? avgReturn / downside : 0;
}

function calculateMaxDrawdown(trades: Trade[]): { maxDrawdown: number; maxDrawdownPercent: number } {
  let peak = 0;
  let maxDrawdown = 0;
  let cumulativePnL = 0;

  for (const trade of trades) {
    cumulativePnL += trade.pnl ?? 0;
    peak = Math.max(peak, cumulativePnL);
    maxDrawdown = Math.min(maxDrawdown, cumulativePnL - peak);
  }

  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  return { maxDrawdown, maxDrawdownPercent };
}

function calculateVolatility(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

function calculateRiskScore(volatility: number, maxDrawdown: number, sharpeRatio: number): number {
  // Lower is better - normalize to 0-100 scale
  const volScore = Math.min(100, volatility * 10);
  const ddScore = Math.min(100, Math.abs(maxDrawdown));
  const sharpeScore = Math.max(0, 100 - sharpeRatio * 20);
  
  return (volScore + ddScore + sharpeScore) / 3;
}

function calculateDiversificationScore(trades: Trade[]): number {
  const symbols = new Set(trades.map((t) => t.symbol));
  const uniqueSymbols = symbols.size;
  
  // More symbols = better diversification (max 100)
  return Math.min(100, uniqueSymbols * 10);
}

function calculateConsistencyScore(returns: number[]): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const coefficientOfVariation = Math.abs(avgReturn) > 0 ? Math.sqrt(variance) / Math.abs(avgReturn) : Infinity;
  
  // Lower variation = higher consistency (invert and normalize to 0-100)
  return Math.max(0, 100 - Math.min(100, coefficientOfVariation * 100));
}

function getTierFromScore(score: number): ReputationScore["tier"] {
  if (score >= 900) return "legend";
  if (score >= 800) return "diamond";
  if (score >= 700) return "platinum";
  if (score >= 600) return "gold";
  if (score >= 500) return "silver";
  return "bronze";
}

function calculateBadges(
  userId: string,
  scores: Omit<ReputationScore, "userId" | "overallScore" | "tier" | "badges">
): Array<{ type: string; name: string; earnedAt: number }> {
  const badges: Array<{ type: string; name: string; earnedAt: number }> = [];
  const now = Date.now();

  if (scores.performanceScore >= 90) {
    badges.push({ type: "performance", name: "Top Performer", earnedAt: now });
  }
  if (scores.consistencyScore >= 90) {
    badges.push({ type: "consistency", name: "Consistent Trader", earnedAt: now });
  }
  if (scores.riskManagementScore >= 90) {
    badges.push({ type: "risk", name: "Risk Master", earnedAt: now });
  }

  return badges;
}
