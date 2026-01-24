/**
 * Social Trading Workflows
 * Workflows for trader stats calculation, leaderboard updates, and reputation
 */

import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities/social";

// Activity proxies with retry policies
const {
  getTraderTrades,
  calculateTraderStats,
  storeTraderStats,
  getQualifiedTraders,
  storeLeaderboardSnapshot,
  updateUserLeaderboardHistory,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// Trader Stats Calculation Workflow
// ============================================================================

export interface TraderStatsCalculationInput {
  userId: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";
  periodStart: number;
  periodEnd: number;
}

/**
 * Calculate and store trader stats for a period
 */
export async function calculateTraderStatsWorkflow(
  input: TraderStatsCalculationInput
): Promise<{ success: boolean; stats: any }> {
  const { userId, period, periodStart, periodEnd } = input;

  try {
    await recordAuditLog({
      userId,
      action: "stats_calculation_started",
      resourceType: "trader_stats",
      resourceId: `${userId}_${period}`,
      metadata: { period, periodStart, periodEnd },
    });

    // Get all trades for the period
    const trades = await getTraderTrades({
      userId,
      periodStart,
      periodEnd,
    });

    // Calculate stats from trades
    const stats = await calculateTraderStats({
      userId,
      period,
      periodStart,
      periodEnd,
      trades,
    });

    // Store stats
    await storeTraderStats(stats);

    await recordAuditLog({
      userId,
      action: "stats_calculation_completed",
      resourceType: "trader_stats",
      resourceId: `${userId}_${period}`,
      metadata: {
        totalTrades: stats.totalTrades,
        totalPnL: stats.totalPnL,
        winRate: stats.winRate,
      },
    });

    return { success: true, stats };
  } catch (error) {
    await recordAuditLog({
      userId,
      action: "stats_calculation_failed",
      resourceType: "trader_stats",
      resourceId: `${userId}_${period}`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

/**
 * Batch calculate stats for multiple traders
 */
export interface BatchStatsCalculationInput {
  userIds: string[];
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";
  periodStart: number;
  periodEnd: number;
}

export async function batchCalculateTraderStatsWorkflow(
  input: BatchStatsCalculationInput
): Promise<{ processed: number; successful: number; failed: number }> {
  const { userIds, period, periodStart, periodEnd } = input;

  let processed = 0;
  let successful = 0;
  let failed = 0;

  // Process each trader sequentially to avoid overwhelming the system
  for (const userId of userIds) {
    try {
      await calculateTraderStatsWorkflow({
        userId,
        period,
        periodStart,
        periodEnd,
      });

      processed++;
      successful++;
    } catch (error) {
      processed++;
      failed++;
    }

    // Small delay between calculations
    await sleep("100 milliseconds");
  }

  await recordAuditLog({
    action: "batch_stats_calculation_completed",
    resourceType: "batch_stats",
    resourceId: `batch_${period}_${periodStart}`,
    metadata: { processed, successful, failed },
  });

  return { processed, successful, failed };
}

// ============================================================================
// Leaderboard Update Workflow
// ============================================================================

export interface LeaderboardUpdateInput {
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
  periodStart: number;
  periodEnd: number;
  assetClass?: string;
  minTrades?: number;
}

/**
 * Update leaderboard for a specific type and period
 */
export async function updateLeaderboardWorkflow(
  input: LeaderboardUpdateInput
): Promise<{ success: boolean; entriesCount: number }> {
  const { leaderboardType, period, periodStart, periodEnd, assetClass, minTrades } = input;

  try {
    await recordAuditLog({
      action: "leaderboard_update_started",
      resourceType: "leaderboard",
      resourceId: `${leaderboardType}_${period}`,
      metadata: { leaderboardType, period, assetClass },
    });

    // Get qualified traders
    const traders = await getQualifiedTraders({
      period,
      assetClass,
      minTrades: minTrades ?? 5,
    });

    // Sort traders based on leaderboard type
    const sortedTraders = [...traders].sort((a, b) => b.value - a.value);

    // Take top 100
    const topTraders = sortedTraders.slice(0, 100);

    // Build leaderboard entries
    const entries = topTraders.map((trader, index) => ({
      rank: index + 1,
      previousRank: undefined, // Would compare with previous snapshot
      userId: trader.userId,
      username: trader.username,
      displayName: trader.displayName,
      avatarUrl: trader.avatarUrl,
      value: trader.value,
      change: undefined,
      changePercent: undefined,
      tier: trader.tier,
      isVerified: trader.isVerified,
    }));

    // Create snapshot
    const snapshot = {
      leaderboardType,
      period,
      assetClass,
      periodStart,
      periodEnd,
      entries,
      totalParticipants: traders.length,
    };

    // Store snapshot
    const snapshotId = await storeLeaderboardSnapshot(snapshot);

    // Update user leaderboard history
    const historyEntries = entries.map((entry) => ({
      userId: entry.userId,
      leaderboardType,
      period,
      rank: entry.rank,
      value: entry.value,
      percentile: (entry.rank / traders.length) * 100,
      snapshotId,
      periodStart,
    }));

    await updateUserLeaderboardHistory({ entries: historyEntries });

    await recordAuditLog({
      action: "leaderboard_update_completed",
      resourceType: "leaderboard",
      resourceId: `${leaderboardType}_${period}`,
      metadata: {
        entriesCount: entries.length,
        totalParticipants: traders.length,
      },
    });

    return { success: true, entriesCount: entries.length };
  } catch (error) {
    await recordAuditLog({
      action: "leaderboard_update_failed",
      resourceType: "leaderboard",
      resourceId: `${leaderboardType}_${period}`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

/**
 * Update all leaderboards for a period
 */
export interface UpdateAllLeaderboardsInput {
  period: "daily" | "weekly" | "monthly" | "all_time";
  periodStart: number;
  periodEnd: number;
}

export async function updateAllLeaderboardsWorkflow(
  input: UpdateAllLeaderboardsInput
): Promise<{ processed: number; successful: number; failed: number }> {
  const { period, periodStart, periodEnd } = input;

  const leaderboardTypes = [
    "pnl",
    "pnl_percent",
    "sharpe_ratio",
    "win_rate",
    "total_trades",
  ] as const;

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const leaderboardType of leaderboardTypes) {
    try {
      await updateLeaderboardWorkflow({
        leaderboardType,
        period,
        periodStart,
        periodEnd,
      });

      processed++;
      successful++;
    } catch (error) {
      processed++;
      failed++;
    }

    // Small delay between leaderboard updates
    await sleep("500 milliseconds");
  }

  await recordAuditLog({
    action: "all_leaderboards_updated",
    resourceType: "leaderboards",
    resourceId: `all_${period}`,
    metadata: { processed, successful, failed },
  });

  return { processed, successful, failed };
}

// ============================================================================
// Scheduled Workflows
// ============================================================================

/**
 * Daily stats calculation workflow (scheduled)
 * Runs daily to calculate previous day's stats for all active traders
 */
export async function dailyStatsCalculationWorkflow(): Promise<void> {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  const periodEnd = now - (now % oneDayMs); // Start of today
  const periodStart = periodEnd - oneDayMs; // Start of yesterday

  // This would typically get active traders from database
  // For now, just log
  await recordAuditLog({
    action: "daily_stats_calculation_triggered",
    resourceType: "scheduled_workflow",
    resourceId: "daily_stats",
    metadata: { periodStart, periodEnd },
  });

  // Would call batchCalculateTraderStatsWorkflow with actual user IDs
}

/**
 * Weekly leaderboard update workflow (scheduled)
 * Runs weekly to update all leaderboards
 */
export async function weeklyLeaderboardUpdateWorkflow(): Promise<void> {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  
  const periodEnd = now - (now % oneWeekMs);
  const periodStart = periodEnd - oneWeekMs;

  await updateAllLeaderboardsWorkflow({
    period: "weekly",
    periodStart,
    periodEnd,
  });
}
