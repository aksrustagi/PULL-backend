/**
 * Copy Trading Activities for Temporal workflows
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TraderStatsData {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  tradingVolume: number;
}

export interface TradeData {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  pnl: number;
  executedAt: number;
}

export interface CopySettingsData {
  id: string;
  userId: string;
  traderId: string;
  allocationPct: number;
  maxPositionSize: number;
  active: boolean;
  minTradeSize?: number;
  excludedAssets?: string[];
}

export interface OrderData {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
}

export interface BalanceData {
  available: number;
  held: number;
}

// ============================================================================
// TRADER STATS ACTIVITIES
// ============================================================================

/**
 * Fetch trades for a user within a time period
 */
export async function fetchUserTrades(
  userId: string,
  periodStart: number,
  periodEnd: number
): Promise<TradeData[]> {
  console.log(`Fetching trades for user ${userId} from ${periodStart} to ${periodEnd}`);

  // TODO: Call Convex query to get trades
  // const trades = await convex.query(api.trades.getByUserAndPeriod, {
  //   userId,
  //   startTime: periodStart,
  //   endTime: periodEnd,
  // });

  // Mock implementation
  return [];
}

/**
 * Calculate performance statistics from trades
 */
export async function calculateStats(
  trades: TradeData[]
): Promise<TraderStatsData> {
  console.log(`Calculating stats from ${trades.length} trades`);

  if (trades.length === 0) {
    return {
      totalReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalTrades: 0,
      profitableTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      tradingVolume: 0,
    };
  }

  // Calculate trading statistics
  const profitableTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl < 0);

  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalVolume = trades.reduce((sum, t) => sum + t.quantity * t.price, 0);

  const grossProfit = profitableTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  const avgWin =
    profitableTrades.length > 0
      ? grossProfit / profitableTrades.length
      : 0;
  const avgLoss =
    losingTrades.length > 0
      ? grossLoss / losingTrades.length
      : 0;

  // Calculate Sharpe Ratio (simplified)
  const returns = trades.map((t) => t.pnl / (t.quantity * t.price));
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Calculate max drawdown (simplified)
  let peak = 0;
  let maxDrawdown = 0;
  let cumReturn = 0;
  for (const trade of trades) {
    cumReturn += trade.pnl;
    if (cumReturn > peak) peak = cumReturn;
    const drawdown = (peak - cumReturn) / (peak || 1);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    totalReturn: totalVolume > 0 ? (totalPnL / totalVolume) * 100 : 0,
    sharpeRatio,
    maxDrawdown: maxDrawdown * 100,
    winRate: trades.length > 0 ? (profitableTrades.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    profitableTrades: profitableTrades.length,
    averageWin: avgWin,
    averageLoss: avgLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    tradingVolume: totalVolume,
  };
}

/**
 * Save trader stats to database
 */
export async function saveTraderStats(
  userId: string,
  stats: TraderStatsData,
  periodStart: number,
  periodEnd: number
): Promise<string> {
  console.log(`Saving trader stats for user ${userId}`);

  // TODO: Call Convex mutation
  // const statsId = await convex.mutation(api.copyTrading.upsertTraderStats, {
  //   userId,
  //   ...stats,
  //   periodStart,
  //   periodEnd,
  // });

  return `stats_${userId}`;
}

// ============================================================================
// COPY TRADE ACTIVITIES
// ============================================================================

/**
 * Get active copy settings for a trader
 */
export async function getActiveCopiers(
  traderId: string
): Promise<CopySettingsData[]> {
  console.log(`Getting active copiers for trader ${traderId}`);

  // TODO: Call Convex query
  // const copiers = await convex.query(api.copyTrading.getCopiers, {
  //   traderId,
  // });

  return [];
}

/**
 * Get user balance for copy trade sizing
 */
export async function getUserBalance(userId: string): Promise<BalanceData> {
  console.log(`Getting balance for user ${userId}`);

  // TODO: Call Convex query
  // const balance = await convex.query(api.balances.getByUserAndAsset, {
  //   userId,
  //   assetType: "usd",
  //   assetId: "USD",
  // });

  return {
    available: 0,
    held: 0,
  };
}

/**
 * Calculate copy trade size based on settings and balance
 */
export async function calculateCopyTradeSize(
  originalQuantity: number,
  originalPrice: number,
  copySettings: CopySettingsData,
  userBalance: BalanceData
): Promise<{
  quantity: number;
  scaleFactor: number;
  canExecute: boolean;
  reason?: string;
}> {
  console.log(`Calculating copy trade size for settings ${copySettings.id}`);

  const originalValue = originalQuantity * originalPrice;

  // Check minimum trade size
  if (
    copySettings.minTradeSize &&
    originalValue < copySettings.minTradeSize
  ) {
    return {
      quantity: 0,
      scaleFactor: 0,
      canExecute: false,
      reason: "Trade below minimum size threshold",
    };
  }

  // Calculate available allocation
  const totalPortfolio = userBalance.available + userBalance.held;
  const maxAllocation = (totalPortfolio * copySettings.allocationPct) / 100;

  // Apply max position size limit
  const maxValue = Math.min(maxAllocation, copySettings.maxPositionSize);

  // Calculate the trade value and scale factor
  const copyValue = Math.min(originalValue, maxValue);
  const scaleFactor = copyValue / originalValue;
  const copyQuantity = originalQuantity * scaleFactor;

  // Check if user has sufficient balance
  if (copyValue > userBalance.available) {
    return {
      quantity: 0,
      scaleFactor: 0,
      canExecute: false,
      reason: "Insufficient balance",
    };
  }

  return {
    quantity: copyQuantity,
    scaleFactor,
    canExecute: true,
  };
}

/**
 * Create a copy order
 */
export async function createCopyOrder(
  userId: string,
  originalOrder: OrderData,
  quantity: number
): Promise<string> {
  console.log(`Creating copy order for user ${userId}`);

  // TODO: Call Convex mutation to create order
  // const orderId = await convex.mutation(api.orders.create, {
  //   userId,
  //   symbol: originalOrder.symbol,
  //   side: originalOrder.side,
  //   type: originalOrder.type,
  //   quantity,
  //   price: originalOrder.price,
  //   metadata: {
  //     isCopyTrade: true,
  //     originalOrderId: originalOrder.id,
  //   },
  // });

  return `order_${crypto.randomUUID()}`;
}

/**
 * Record a copy trade
 */
export async function recordCopyTrade(
  userId: string,
  traderId: string,
  originalOrderId: string,
  copiedOrderId: string,
  copySettingsId: string,
  originalQuantity: number,
  copiedQuantity: number,
  scaleFactor: number
): Promise<string> {
  console.log(`Recording copy trade for user ${userId}`);

  // TODO: Call Convex mutation
  // const copyTradeId = await convex.mutation(api.copyTrading.createCopyTrade, {
  //   userId,
  //   traderId,
  //   originalOrderId,
  //   copiedOrderId,
  //   copySettingsId,
  //   originalQuantity,
  //   copiedQuantity,
  //   scaleFactor,
  // });

  return `copy_trade_${crypto.randomUUID()}`;
}

/**
 * Update copy trade status
 */
export async function updateCopyTradeStatus(
  copyTradeId: string,
  status: "pending" | "executed" | "partial" | "failed" | "cancelled",
  failureReason?: string
): Promise<void> {
  console.log(`Updating copy trade ${copyTradeId} status to ${status}`);

  // TODO: Call Convex mutation
  // await convex.mutation(api.copyTrading.updateCopyTradeStatus, {
  //   copyTradeId,
  //   status,
  //   failureReason,
  // });
}

/**
 * Send copy trade notification
 */
export async function sendCopyTradeNotification(
  userId: string,
  type: "executed" | "failed",
  details: {
    traderId: string;
    symbol: string;
    side: string;
    quantity: number;
    failureReason?: string;
  }
): Promise<void> {
  console.log(`Sending ${type} notification to user ${userId}`);

  // TODO: Send push notification or email
}

// ============================================================================
// LEADERBOARD ACTIVITIES
// ============================================================================

/**
 * Get all traders with stats
 */
export async function getAllTraderStats(): Promise<
  Array<{ userId: string; stats: TraderStatsData }>
> {
  console.log("Getting all trader stats");

  // TODO: Call Convex query
  // const allStats = await convex.query(api.copyTrading.getAllTraderStats);

  return [];
}

/**
 * Update leaderboard rankings
 */
export async function updateLeaderboardRankings(): Promise<number> {
  console.log("Updating leaderboard rankings");

  // TODO: Call Convex mutation
  // const count = await convex.mutation(api.copyTrading.updateLeaderboardRanks);

  return 0;
}

/**
 * Send leaderboard update notification to top traders
 */
export async function notifyTopTraders(
  topTraders: Array<{ userId: string; rank: number; totalReturn: number }>
): Promise<void> {
  console.log(`Notifying ${topTraders.length} top traders`);

  // TODO: Send notifications to traders about their ranking
  for (const trader of topTraders) {
    console.log(
      `Trader ${trader.userId} is now ranked #${trader.rank} with ${trader.totalReturn}% return`
    );
  }
}

/**
 * Archive old stats for historical tracking
 */
export async function archiveOldStats(
  beforeTimestamp: number
): Promise<number> {
  console.log(`Archiving stats before ${beforeTimestamp}`);

  // TODO: Call Convex mutation to archive old stats

  return 0;
}

// ============================================================================
// UTILITY ACTIVITIES
// ============================================================================

/**
 * Check if asset is excluded from copying
 */
export async function isAssetExcluded(
  copySettingsId: string,
  symbol: string
): Promise<boolean> {
  console.log(`Checking if ${symbol} is excluded for settings ${copySettingsId}`);

  // TODO: Call Convex query
  // const settings = await convex.query(api.copyTrading.getCopySettingsById, {
  //   id: copySettingsId,
  // });
  // return settings?.excludedAssets?.includes(symbol) ?? false;

  return false;
}

/**
 * Get order details
 */
export async function getOrderDetails(orderId: string): Promise<OrderData | null> {
  console.log(`Getting order details for ${orderId}`);

  // TODO: Call Convex query
  // return await convex.query(api.orders.getById, { id: orderId });

  return null;
}

/**
 * Validate copy trade eligibility
 */
export async function validateCopyEligibility(
  userId: string,
  traderId: string
): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  console.log(`Validating copy eligibility for user ${userId} -> trader ${traderId}`);

  // TODO: Check various conditions:
  // 1. User is following the trader
  // 2. User has active copy settings
  // 3. User KYC status allows copy trading
  // 4. No circular copying (trader isn't copying the user)

  return {
    eligible: true,
  };
}
