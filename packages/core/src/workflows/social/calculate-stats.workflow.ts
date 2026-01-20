/**
 * Calculate Trader Stats Workflow
 * Calculates trading performance metrics for leaderboard
 * Scheduled: Daily at 2am UTC
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry configuration
const {
  getAllTradersForStatsUpdate,
  getTradesForPeriod,
  calculateReturns,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateWinLossStats,
  updateTraderStats,
  recalculateLeaderboardPositions,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Longer timeout for batch operations
const { batchUpdateTraderStats } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "2 minutes",
  },
});

// Risk-free rate for Sharpe ratio calculation (5% annual)
const RISK_FREE_RATE = 0.05;

// Input types
export interface CalculateStatsInput {
  userId?: string; // Specific user or undefined for all users
  fullRecalculation?: boolean; // If true, recalculate all-time stats
}

export interface CalculateStatsStatus {
  status: "initializing" | "calculating" | "updating" | "completed" | "failed";
  processedUsers: number;
  totalUsers: number;
  currentUserId?: string;
  failureReason?: string;
  startedAt: string;
  completedAt?: string;
}

// Queries
export const getStatsCalculationStatus = defineQuery<CalculateStatsStatus>(
  "getStatsCalculationStatus"
);

/**
 * Calculate Trader Stats Workflow
 * Computes returns, risk metrics, and win rates for traders
 */
export async function calculateTraderStatsWorkflow(
  input: CalculateStatsInput
): Promise<CalculateStatsStatus> {
  const { userId, fullRecalculation = false } = input;

  // Initialize status
  const status: CalculateStatsStatus = {
    status: "initializing",
    processedUsers: 0,
    totalUsers: 0,
    startedAt: new Date().toISOString(),
  };

  // Set up query handler
  setHandler(getStatsCalculationStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Get list of traders to process
    // =========================================================================
    let userIds: string[];

    if (userId) {
      // Process single user
      userIds = [userId];
    } else {
      // Get all users with trading activity
      userIds = await getAllTradersForStatsUpdate();
    }

    status.totalUsers = userIds.length;
    status.status = "calculating";

    if (userIds.length === 0) {
      status.status = "completed";
      status.completedAt = new Date().toISOString();
      return status;
    }

    // =========================================================================
    // Step 2: Calculate stats for each trader
    // =========================================================================
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const statsUpdates: Array<{
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
    }> = [];

    // Process users in batches to avoid overwhelming the system
    const BATCH_SIZE = 50;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (traderId) => {
          status.currentUserId = traderId;

          try {
            // Get trades for different periods
            const [allTrades, trades30d, trades7d, trades24h] = await Promise.all([
              getTradesForPeriod(traderId, 0, now), // All time
              getTradesForPeriod(traderId, thirtyDaysAgo, now),
              getTradesForPeriod(traderId, sevenDaysAgo, now),
              getTradesForPeriod(traderId, oneDayAgo, now),
            ]);

            // Skip users with no trades
            if (allTrades.length === 0) {
              status.processedUsers++;
              return;
            }

            // Calculate returns for each period
            const [totalReturn, return30d, return7d, return24h] = await Promise.all([
              calculateReturns(allTrades, 0, now),
              calculateReturns(trades30d, thirtyDaysAgo, now),
              calculateReturns(trades7d, sevenDaysAgo, now),
              calculateReturns(trades24h, oneDayAgo, now),
            ]);

            // Calculate risk metrics
            const [sharpeRatio, sortinoRatio] = await Promise.all([
              calculateSharpeRatio(trades30d, RISK_FREE_RATE),
              calculateSortinoRatio(trades30d, RISK_FREE_RATE),
            ]);

            // Calculate drawdown
            const drawdownData = await calculateMaxDrawdown(allTrades);

            // Calculate win/loss stats
            const winLossStats = await calculateWinLossStats(allTrades);

            statsUpdates.push({
              userId: traderId,
              stats: {
                totalReturn,
                return30d,
                return7d,
                return24h,
                sharpeRatio,
                sortinoRatio,
                maxDrawdown: drawdownData.maxDrawdown,
                currentDrawdown: drawdownData.currentDrawdown,
                winRate: winLossStats.winRate,
                avgWin: winLossStats.avgWin,
                avgLoss: winLossStats.avgLoss,
                totalTrades: allTrades.length,
                profitableTrades: winLossStats.profitableTrades,
                avgHoldingPeriod: winLossStats.avgHoldingPeriod,
              },
            });

            status.processedUsers++;
          } catch (error) {
            // Log error but continue processing other users
            console.error(`Failed to calculate stats for ${traderId}:`, error);
            status.processedUsers++;
          }
        })
      );

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < userIds.length) {
        await sleep("500 milliseconds");
      }
    }

    // =========================================================================
    // Step 3: Batch update all trader stats
    // =========================================================================
    status.status = "updating";

    if (statsUpdates.length > 0) {
      await batchUpdateTraderStats(statsUpdates);
    }

    // =========================================================================
    // Step 4: Recalculate leaderboard positions
    // =========================================================================
    await recalculateLeaderboardPositions();

    // Log completion
    await recordAuditLog({
      userId: "system",
      action: "trader_stats_calculated",
      resourceType: "leaderboard",
      resourceId: "daily",
      metadata: {
        processedUsers: status.processedUsers,
        totalUsers: status.totalUsers,
        statsUpdated: statsUpdates.length,
      },
    });

    status.status = "completed";
    status.completedAt = new Date().toISOString();

    return status;
  } catch (error) {
    status.status = "failed";
    status.failureReason = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId: "system",
      action: "trader_stats_calculation_failed",
      resourceType: "leaderboard",
      resourceId: "daily",
      metadata: {
        error: status.failureReason,
        processedUsers: status.processedUsers,
        totalUsers: status.totalUsers,
      },
    });

    throw ApplicationFailure.nonRetryable(
      `Stats calculation failed: ${status.failureReason}`
    );
  }
}
