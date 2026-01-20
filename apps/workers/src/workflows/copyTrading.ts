import {
  proxyActivities,
  sleep,
  continueAsNew,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities/copyTrading";

const {
  fetchUserTrades,
  calculateStats,
  saveTraderStats,
  getActiveCopiers,
  getUserBalance,
  calculateCopyTradeSize,
  createCopyOrder,
  recordCopyTrade,
  updateCopyTradeStatus,
  sendCopyTradeNotification,
  getAllTraderStats,
  updateLeaderboardRankings,
  notifyTopTraders,
  isAssetExcluded,
  getOrderDetails,
  validateCopyEligibility,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    backoffCoefficient: 2,
  },
});

// ============================================================================
// CALCULATE TRADER STATS WORKFLOW (Daily)
// ============================================================================

export interface CalculateTraderStatsParams {
  userId: string;
  periodStart: number;
  periodEnd: number;
}

export interface CalculateTraderStatsResult {
  success: boolean;
  statsId?: string;
  tradesAnalyzed: number;
  stats?: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  };
  error?: string;
}

/**
 * Workflow to calculate and update trader statistics
 * Runs daily for each active trader
 */
export async function calculateTraderStatsWorkflow(
  params: CalculateTraderStatsParams
): Promise<CalculateTraderStatsResult> {
  const { userId, periodStart, periodEnd } = params;

  try {
    // Step 1: Fetch all trades for the period
    const trades = await fetchUserTrades(userId, periodStart, periodEnd);

    if (trades.length === 0) {
      return {
        success: true,
        tradesAnalyzed: 0,
        stats: {
          totalReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
        },
      };
    }

    // Step 2: Calculate statistics
    const stats = await calculateStats(trades);

    // Step 3: Save to database
    const statsId = await saveTraderStats(userId, stats, periodStart, periodEnd);

    return {
      success: true,
      statsId,
      tradesAnalyzed: trades.length,
      stats: {
        totalReturn: stats.totalReturn,
        sharpeRatio: stats.sharpeRatio,
        maxDrawdown: stats.maxDrawdown,
        winRate: stats.winRate,
      },
    };
  } catch (error) {
    return {
      success: false,
      tradesAnalyzed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// EXECUTE COPY TRADE WORKFLOW (Triggered on leader trade)
// ============================================================================

export interface ExecuteCopyTradeParams {
  originalOrderId: string;
  traderId: string;
}

export interface CopyTradeExecution {
  userId: string;
  copyTradeId: string;
  copiedOrderId: string;
  status: "executed" | "failed" | "skipped";
  quantity: number;
  scaleFactor: number;
  failureReason?: string;
}

export interface ExecuteCopyTradeResult {
  success: boolean;
  originalOrderId: string;
  traderId: string;
  copyTrades: CopyTradeExecution[];
  totalExecuted: number;
  totalFailed: number;
  totalSkipped: number;
}

/**
 * Workflow to execute copy trades when a leader places a trade
 */
export async function executeCopyTradeWorkflow(
  params: ExecuteCopyTradeParams
): Promise<ExecuteCopyTradeResult> {
  const { originalOrderId, traderId } = params;
  const copyTrades: CopyTradeExecution[] = [];

  // Step 1: Get the original order details
  const originalOrder = await getOrderDetails(originalOrderId);

  if (!originalOrder) {
    return {
      success: false,
      originalOrderId,
      traderId,
      copyTrades: [],
      totalExecuted: 0,
      totalFailed: 0,
      totalSkipped: 0,
    };
  }

  // Step 2: Get all active copiers for this trader
  const copiers = await getActiveCopiers(traderId);

  if (copiers.length === 0) {
    return {
      success: true,
      originalOrderId,
      traderId,
      copyTrades: [],
      totalExecuted: 0,
      totalFailed: 0,
      totalSkipped: 0,
    };
  }

  // Step 3: Process each copier
  for (const copySettings of copiers) {
    try {
      // Check if asset is excluded
      const excluded = await isAssetExcluded(copySettings.id, originalOrder.symbol);
      if (excluded) {
        copyTrades.push({
          userId: copySettings.userId,
          copyTradeId: "",
          copiedOrderId: "",
          status: "skipped",
          quantity: 0,
          scaleFactor: 0,
          failureReason: "Asset excluded from copy settings",
        });
        continue;
      }

      // Validate eligibility
      const eligibility = await validateCopyEligibility(
        copySettings.userId,
        traderId
      );
      if (!eligibility.eligible) {
        copyTrades.push({
          userId: copySettings.userId,
          copyTradeId: "",
          copiedOrderId: "",
          status: "skipped",
          quantity: 0,
          scaleFactor: 0,
          failureReason: eligibility.reason,
        });
        continue;
      }

      // Get user balance
      const balance = await getUserBalance(copySettings.userId);

      // Calculate trade size
      const sizeResult = await calculateCopyTradeSize(
        originalOrder.quantity,
        originalOrder.price ?? 0,
        copySettings,
        balance
      );

      if (!sizeResult.canExecute) {
        copyTrades.push({
          userId: copySettings.userId,
          copyTradeId: "",
          copiedOrderId: "",
          status: "skipped",
          quantity: 0,
          scaleFactor: 0,
          failureReason: sizeResult.reason,
        });
        continue;
      }

      // Create the copy order
      const copiedOrderId = await createCopyOrder(
        copySettings.userId,
        originalOrder,
        sizeResult.quantity
      );

      // Record the copy trade
      const copyTradeId = await recordCopyTrade(
        copySettings.userId,
        traderId,
        originalOrderId,
        copiedOrderId,
        copySettings.id,
        originalOrder.quantity,
        sizeResult.quantity,
        sizeResult.scaleFactor
      );

      // Update status to executed
      await updateCopyTradeStatus(copyTradeId, "executed");

      // Send notification
      await sendCopyTradeNotification(copySettings.userId, "executed", {
        traderId,
        symbol: originalOrder.symbol,
        side: originalOrder.side,
        quantity: sizeResult.quantity,
      });

      copyTrades.push({
        userId: copySettings.userId,
        copyTradeId,
        copiedOrderId,
        status: "executed",
        quantity: sizeResult.quantity,
        scaleFactor: sizeResult.scaleFactor,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Send failure notification
      await sendCopyTradeNotification(copySettings.userId, "failed", {
        traderId,
        symbol: originalOrder.symbol,
        side: originalOrder.side,
        quantity: 0,
        failureReason: errorMessage,
      });

      copyTrades.push({
        userId: copySettings.userId,
        copyTradeId: "",
        copiedOrderId: "",
        status: "failed",
        quantity: 0,
        scaleFactor: 0,
        failureReason: errorMessage,
      });
    }
  }

  // Calculate summary
  const totalExecuted = copyTrades.filter((ct) => ct.status === "executed").length;
  const totalFailed = copyTrades.filter((ct) => ct.status === "failed").length;
  const totalSkipped = copyTrades.filter((ct) => ct.status === "skipped").length;

  return {
    success: true,
    originalOrderId,
    traderId,
    copyTrades,
    totalExecuted,
    totalFailed,
    totalSkipped,
  };
}

// ============================================================================
// UPDATE LEADERBOARD WORKFLOW (Hourly)
// ============================================================================

export interface UpdateLeaderboardParams {
  notifyTopN?: number;
}

export interface UpdateLeaderboardResult {
  success: boolean;
  tradersUpdated: number;
  topTraders: Array<{
    userId: string;
    rank: number;
    totalReturn: number;
  }>;
  error?: string;
}

/**
 * Workflow to update the trader leaderboard
 * Runs hourly to recalculate rankings
 */
export async function updateLeaderboardWorkflow(
  params: UpdateLeaderboardParams = {}
): Promise<UpdateLeaderboardResult> {
  const { notifyTopN = 10 } = params;

  try {
    // Step 1: Get all trader stats
    const allStats = await getAllTraderStats();

    if (allStats.length === 0) {
      return {
        success: true,
        tradersUpdated: 0,
        topTraders: [],
      };
    }

    // Step 2: Update rankings in database
    const tradersUpdated = await updateLeaderboardRankings();

    // Step 3: Get top traders for notifications
    const sortedTraders = allStats
      .sort((a, b) => b.stats.totalReturn - a.stats.totalReturn)
      .slice(0, notifyTopN)
      .map((trader, index) => ({
        userId: trader.userId,
        rank: index + 1,
        totalReturn: trader.stats.totalReturn,
      }));

    // Step 4: Notify top traders
    await notifyTopTraders(sortedTraders);

    return {
      success: true,
      tradersUpdated,
      topTraders: sortedTraders,
    };
  } catch (error) {
    return {
      success: false,
      tradersUpdated: 0,
      topTraders: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// BATCH STATS CALCULATION WORKFLOW (Daily - processes all traders)
// ============================================================================

export interface BatchStatsCalculationParams {
  periodDays?: number;
}

export interface BatchStatsCalculationResult {
  success: boolean;
  tradersProcessed: number;
  successful: number;
  failed: number;
}

/**
 * Workflow to calculate stats for all active traders
 * Runs daily as a scheduled workflow
 */
export async function batchStatsCalculationWorkflow(
  params: BatchStatsCalculationParams = {}
): Promise<BatchStatsCalculationResult> {
  const { periodDays = 30 } = params;

  const now = Date.now();
  const periodStart = now - periodDays * 24 * 60 * 60 * 1000;
  const periodEnd = now;

  // Get all traders with active copiers or followers
  const allStats = await getAllTraderStats();
  const traderIds = allStats.map((s) => s.userId);

  let successful = 0;
  let failed = 0;

  // Process traders in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < traderIds.length; i += batchSize) {
    const batch = traderIds.slice(i, i + batchSize);

    // Process batch concurrently using Promise.all pattern
    const results = await Promise.all(
      batch.map(async (userId) => {
        try {
          const trades = await fetchUserTrades(userId, periodStart, periodEnd);
          const stats = await calculateStats(trades);
          await saveTraderStats(userId, stats, periodStart, periodEnd);
          return true;
        } catch {
          return false;
        }
      })
    );

    successful += results.filter((r) => r).length;
    failed += results.filter((r) => !r).length;

    // Small delay between batches to prevent rate limiting
    if (i + batchSize < traderIds.length) {
      await sleep("1 second");
    }
  }

  // Update leaderboard after all stats are calculated
  await updateLeaderboardRankings();

  return {
    success: true,
    tradersProcessed: traderIds.length,
    successful,
    failed,
  };
}

// ============================================================================
// SCHEDULED LEADERBOARD UPDATE WORKFLOW (Long-running)
// ============================================================================

// Signal to manually trigger an update
export const triggerLeaderboardUpdateSignal = defineSignal("triggerUpdate");

/**
 * Long-running scheduled workflow that updates leaderboard hourly
 * Uses continueAsNew to prevent history growth
 */
export async function scheduledLeaderboardUpdateWorkflow(): Promise<void> {
  let updateTriggered = false;

  // Set up signal handler for manual triggers
  setHandler(triggerLeaderboardUpdateSignal, () => {
    updateTriggered = true;
  });

  // Wait for either 1 hour or a manual trigger
  const waitResult = await Promise.race([
    sleep("1 hour").then(() => "timeout"),
    new Promise<string>((resolve) => {
      const checkInterval = setInterval(() => {
        if (updateTriggered) {
          clearInterval(checkInterval);
          resolve("triggered");
        }
      }, 1000);
    }),
  ]);

  // Perform the leaderboard update
  await updateLeaderboardWorkflow({ notifyTopN: 10 });

  // Continue as new to prevent history from growing
  await continueAsNew<typeof scheduledLeaderboardUpdateWorkflow>();
}
