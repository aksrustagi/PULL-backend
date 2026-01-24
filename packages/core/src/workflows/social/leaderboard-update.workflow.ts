/**
 * Leaderboard Update Workflow
 * Generates and updates leaderboard snapshots
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  getQualifiedTraders,
  getPreviousSnapshot,
  storeLeaderboardSnapshot,
  updateUserLeaderboardHistory,
  awardLeaderboardBadges,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "60 seconds",
  },
});

// Leaderboard types
type LeaderboardType =
  | "pnl"
  | "pnl_percent"
  | "sharpe_ratio"
  | "win_rate"
  | "total_trades"
  | "followers"
  | "copiers"
  | "reputation";

type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "all_time";

// Workflow input type
export interface LeaderboardUpdateInput {
  leaderboardType: LeaderboardType;
  period: LeaderboardPeriod;
  assetClass?: string;
  maxEntries?: number;
  minTrades?: number;
}

// Update status
export interface LeaderboardUpdateStatus {
  leaderboardType: LeaderboardType;
  period: LeaderboardPeriod;
  phase: "idle" | "fetching" | "sorting" | "comparing" | "storing" | "awarding" | "complete" | "failed";
  totalParticipants: number;
  entriesGenerated: number;
  badgesAwarded: number;
  error?: string;
}

// Queries
export const getUpdateStatusQuery = defineQuery<LeaderboardUpdateStatus>("getUpdateStatus");

/**
 * Leaderboard Update Workflow
 * Generates a leaderboard snapshot
 */
export async function leaderboardUpdateWorkflow(
  input: LeaderboardUpdateInput
): Promise<LeaderboardUpdateStatus> {
  const {
    leaderboardType,
    period,
    assetClass,
    maxEntries = 100,
    minTrades = 10,
  } = input;

  const status: LeaderboardUpdateStatus = {
    leaderboardType,
    period,
    phase: "idle",
    totalParticipants: 0,
    entriesGenerated: 0,
    badgesAwarded: 0,
  };

  // Set up query handler
  setHandler(getUpdateStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get qualified traders
    // =========================================================================
    status.phase = "fetching";

    const traders = await getQualifiedTraders({
      period,
      assetClass,
      minTrades,
    });

    status.totalParticipants = traders.length;

    if (traders.length === 0) {
      status.phase = "complete";
      return status;
    }

    // =========================================================================
    // Step 2: Sort by metric
    // =========================================================================
    status.phase = "sorting";

    const sortedTraders = sortByMetric(traders, leaderboardType);
    const topTraders = sortedTraders.slice(0, maxEntries);

    // =========================================================================
    // Step 3: Compare with previous snapshot
    // =========================================================================
    status.phase = "comparing";

    const previousSnapshot = await getPreviousSnapshot({
      leaderboardType,
      period,
      assetClass,
    });

    const previousRankings = new Map<string, number>();
    if (previousSnapshot?.entries) {
      for (const entry of previousSnapshot.entries) {
        previousRankings.set(entry.userId, entry.rank);
      }
    }

    // =========================================================================
    // Step 4: Build leaderboard entries
    // =========================================================================
    const { start, end } = getPeriodRange(period);
    const now = Date.now();

    const entries = topTraders.map((trader, index) => {
      const rank = index + 1;
      const value = getMetricValue(trader, leaderboardType);
      const previousRank = previousRankings.get(trader.userId);
      const previousEntry = previousSnapshot?.entries?.find(
        (e) => e.userId === trader.userId
      );

      return {
        rank,
        previousRank,
        userId: trader.userId,
        username: trader.username,
        displayName: trader.displayName,
        avatarUrl: trader.avatarUrl,
        value,
        change: previousEntry ? value - previousEntry.value : undefined,
        changePercent:
          previousEntry && previousEntry.value !== 0
            ? ((value - previousEntry.value) / Math.abs(previousEntry.value)) * 100
            : undefined,
        tier: trader.tier,
        isVerified: trader.isVerified,
      };
    });

    status.entriesGenerated = entries.length;

    // =========================================================================
    // Step 5: Store snapshot
    // =========================================================================
    status.phase = "storing";

    const snapshotId = `${leaderboardType}_${period}_${start}`;

    await storeLeaderboardSnapshot({
      id: snapshotId,
      leaderboardType,
      period,
      assetClass,
      periodStart: new Date(start),
      periodEnd: new Date(end),
      entries,
      totalParticipants: traders.length,
      minQualifyingValue: entries.length > 0 ? entries[entries.length - 1].value : undefined,
      calculatedAt: new Date(now),
      createdAt: new Date(now),
    });

    // Update user history
    const historyEntries = entries.map((entry) => ({
      userId: entry.userId,
      leaderboardType,
      period,
      rank: entry.rank,
      value: entry.value,
      percentile: ((traders.length - entry.rank + 1) / traders.length) * 100,
      snapshotId,
      periodStart: start,
    }));

    await updateUserLeaderboardHistory({ entries: historyEntries });

    // =========================================================================
    // Step 6: Award badges
    // =========================================================================
    status.phase = "awarding";

    // Award top 10 badges
    const top10 = entries.slice(0, 10).map((e) => ({ userId: e.userId, rank: e.rank }));
    await awardLeaderboardBadges({ topEntries: top10, leaderboardType });
    status.badgesAwarded += top10.length;

    status.phase = "complete";

    await recordAuditLog({
      action: "leaderboard_updated",
      resourceType: "leaderboard",
      resourceId: snapshotId,
      metadata: {
        leaderboardType,
        period,
        totalParticipants: traders.length,
        entriesGenerated: entries.length,
      },
    });

    return status;
  } catch (error) {
    status.phase = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "leaderboard_update_failed",
      resourceType: "leaderboard",
      resourceId: `${leaderboardType}_${period}`,
      metadata: { error: status.error },
    });

    throw error;
  }
}

/**
 * Full Leaderboard Update Workflow
 * Updates all leaderboards for a period
 */
export interface FullLeaderboardUpdateInput {
  period: LeaderboardPeriod;
  assetClass?: string;
}

export async function fullLeaderboardUpdateWorkflow(
  input: FullLeaderboardUpdateInput
): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const { period, assetClass } = input;

  const leaderboardTypes: LeaderboardType[] = [
    "pnl",
    "pnl_percent",
    "sharpe_ratio",
    "win_rate",
    "total_trades",
    "followers",
    "copiers",
    "reputation",
  ];

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const leaderboardType of leaderboardTypes) {
    try {
      await leaderboardUpdateWorkflow({
        leaderboardType,
        period,
        assetClass,
      });
      updated++;
    } catch (error) {
      failed++;
      errors.push(`${leaderboardType}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Small delay between updates
    await sleep("1 second");
  }

  await recordAuditLog({
    action: "full_leaderboard_update_completed",
    resourceType: "leaderboard",
    resourceId: `all_${period}`,
    metadata: { updated, failed, errors },
  });

  return { updated, failed, errors };
}

/**
 * Scheduled Leaderboard Update Workflow
 * Updates all periods
 */
export async function scheduledLeaderboardUpdateWorkflow(): Promise<{
  daily: { updated: number; failed: number };
  weekly: { updated: number; failed: number };
  monthly: { updated: number; failed: number };
  allTime: { updated: number; failed: number };
}> {
  const periods: LeaderboardPeriod[] = ["daily", "weekly", "monthly", "all_time"];
  const results: Record<string, { updated: number; failed: number }> = {};

  for (const period of periods) {
    const result = await fullLeaderboardUpdateWorkflow({ period });
    results[period.replace("_", "")] = {
      updated: result.updated,
      failed: result.failed,
    };

    await sleep("5 seconds");
  }

  return {
    daily: results.daily,
    weekly: results.weekly,
    monthly: results.monthly,
    allTime: results.alltime,
  };
}

// Helper functions

function sortByMetric(
  traders: Array<{
    userId: string;
    totalPnL: number;
    totalPnLPercent: number;
    sharpeRatio: number;
    winRate: number;
    totalTrades: number;
    followersCount: number;
    copierCount: number;
    reputationScore: number;
    [key: string]: unknown;
  }>,
  type: LeaderboardType
): typeof traders {
  return [...traders].sort((a, b) => {
    const aValue = getMetricValue(a, type);
    const bValue = getMetricValue(b, type);
    return bValue - aValue; // Descending
  });
}

function getMetricValue(
  trader: {
    totalPnL: number;
    totalPnLPercent: number;
    sharpeRatio: number;
    winRate: number;
    totalTrades: number;
    followersCount: number;
    copierCount: number;
    reputationScore: number;
  },
  type: LeaderboardType
): number {
  switch (type) {
    case "pnl":
      return trader.totalPnL;
    case "pnl_percent":
      return trader.totalPnLPercent;
    case "sharpe_ratio":
      return trader.sharpeRatio;
    case "win_rate":
      return trader.winRate;
    case "total_trades":
      return trader.totalTrades;
    case "followers":
      return trader.followersCount;
    case "copiers":
      return trader.copierCount;
    case "reputation":
      return trader.reputationScore;
    default:
      return 0;
  }
}

function getPeriodRange(period: LeaderboardPeriod): { start: number; end: number } {
  const now = new Date();
  const end = now.getTime();
  let start: number;

  switch (period) {
    case "daily":
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      start = today.getTime();
      break;

    case "weekly":
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      start = weekStart.getTime();
      break;

    case "monthly":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      start = monthStart.getTime();
      break;

    case "all_time":
    default:
      start = 0;
  }

  return { start, end };
}
