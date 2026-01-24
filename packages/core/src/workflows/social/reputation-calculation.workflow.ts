/**
 * Reputation Calculation Workflow
 * Calculates and updates trader stats and reputation scores
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  continueAsNew,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  getTraderTrades,
  calculateTraderStats,
  storeTraderStats,
  getReputationMetrics,
  calculateReputationScore,
  storeReputationScore,
  awardBadge,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface ReputationCalculationInput {
  userId: string;
  calculateStats?: boolean;
  calculateReputation?: boolean;
  periods?: Array<"daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time">;
}

// Calculation status
export interface ReputationCalculationStatus {
  userId: string;
  phase: "idle" | "calculating_stats" | "calculating_reputation" | "awarding_badges" | "complete" | "failed";
  statsCalculated: string[];
  reputationCalculated: boolean;
  badgesAwarded: string[];
  error?: string;
}

// Queries
export const getCalculationStatusQuery = defineQuery<ReputationCalculationStatus>("getCalculationStatus");

/**
 * Reputation Calculation Workflow
 * Calculates trader statistics and reputation score
 */
export async function reputationCalculationWorkflow(
  input: ReputationCalculationInput
): Promise<ReputationCalculationStatus> {
  const {
    userId,
    calculateStats = true,
    calculateReputation = true,
    periods = ["daily", "weekly", "monthly", "all_time"],
  } = input;

  const status: ReputationCalculationStatus = {
    userId,
    phase: "idle",
    statsCalculated: [],
    reputationCalculated: false,
    badgesAwarded: [],
  };

  // Set up query handler
  setHandler(getCalculationStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Calculate stats for each period
    // =========================================================================
    if (calculateStats) {
      status.phase = "calculating_stats";

      for (const period of periods) {
        const { start, end } = getPeriodRange(period);

        // Get trades for period
        const trades = await getTraderTrades({
          userId,
          periodStart: start,
          periodEnd: end,
        });

        // Skip if insufficient trades
        if (trades.length < 10) {
          continue;
        }

        // Calculate stats
        const stats = await calculateTraderStats({
          userId,
          period,
          trades,
        });

        // Store stats
        await storeTraderStats(stats);

        status.statsCalculated.push(period);
      }
    }

    // =========================================================================
    // Step 2: Calculate reputation score
    // =========================================================================
    if (calculateReputation) {
      status.phase = "calculating_reputation";

      // Get all metrics needed for reputation
      const metrics = await getReputationMetrics(userId);

      // Calculate reputation score
      const reputation = await calculateReputationScore(metrics);

      // Store reputation
      await storeReputationScore(reputation);

      status.reputationCalculated = true;

      // =========================================================================
      // Step 3: Check and award badges
      // =========================================================================
      status.phase = "awarding_badges";

      const badgesToAward = checkBadgeEligibility(metrics, reputation.badges || []);

      for (const badge of badgesToAward) {
        await awardBadge({
          userId,
          badgeType: badge.type,
          badgeName: badge.name,
        });
        status.badgesAwarded.push(badge.type);
      }
    }

    status.phase = "complete";

    await recordAuditLog({
      userId,
      action: "reputation_calculated",
      resourceType: "reputation",
      resourceId: userId,
      metadata: {
        statsCalculated: status.statsCalculated,
        reputationCalculated: status.reputationCalculated,
        badgesAwarded: status.badgesAwarded,
      },
    });

    return status;
  } catch (error) {
    status.phase = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId,
      action: "reputation_calculation_failed",
      resourceType: "reputation",
      resourceId: userId,
      metadata: { error: status.error },
    });

    throw error;
  }
}

/**
 * Batch Reputation Calculation Workflow
 * Calculates reputation for multiple users
 */
export interface BatchReputationInput {
  userIds: string[];
  calculateStats?: boolean;
  calculateReputation?: boolean;
  periods?: Array<"daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time">;
}

export async function batchReputationCalculationWorkflow(
  input: BatchReputationInput
): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const { userIds, calculateStats, calculateReputation, periods } = input;

  let processed = 0;
  let successful = 0;
  let failed = 0;

  // Process in batches to manage memory
  const batchSize = 50;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    for (const userId of batch) {
      try {
        await reputationCalculationWorkflow({
          userId,
          calculateStats,
          calculateReputation,
          periods,
        });
        successful++;
      } catch (error) {
        failed++;
      }
      processed++;
    }

    // Continue as new to avoid history bloat for large batches
    if (i + batchSize < userIds.length) {
      await sleep("1 second");
    }
  }

  return { processed, successful, failed };
}

/**
 * Scheduled Reputation Update Workflow
 * Runs periodically to update all trader reputations
 */
export interface ScheduledReputationInput {
  period: "daily" | "weekly" | "monthly";
  batchSize?: number;
  delayBetweenBatches?: string;
}

export async function scheduledReputationUpdateWorkflow(
  input: ScheduledReputationInput
): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
}> {
  const { period, batchSize = 100, delayBetweenBatches = "5 seconds" } = input;

  // This would be implemented to:
  // 1. Get all active traders from database
  // 2. Process in batches
  // 3. Continue as new for long-running operations

  // Placeholder implementation
  return {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
  };
}

// Helper functions

function getPeriodRange(period: string): { start: number; end: number } {
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

    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
      start = quarterStart.getTime();
      break;

    case "yearly":
      const yearStart = new Date(now.getFullYear(), 0, 1);
      start = yearStart.getTime();
      break;

    case "all_time":
    default:
      start = 0;
  }

  return { start, end };
}

function checkBadgeEligibility(
  metrics: {
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
    followersCount: number;
    copierCount: number;
    accountAge: number;
    positionsShared: number;
    isVerified: boolean;
    totalPnLPercent: number;
  },
  existingBadges: Array<{ type: string }>
): Array<{ type: string; name: string }> {
  const existingTypes = new Set(existingBadges.map((b) => b.type));
  const badgesToAward: Array<{ type: string; name: string }> = [];

  // Check each badge requirement
  const badges: Array<{
    type: string;
    name: string;
    check: () => boolean;
  }> = [
    {
      type: "verified_trader",
      name: "Verified Trader",
      check: () => metrics.isVerified,
    },
    {
      type: "consistent_winner",
      name: "Consistent Winner",
      check: () => metrics.winRate >= 0.6 && metrics.totalTrades >= 100,
    },
    {
      type: "risk_manager",
      name: "Risk Manager",
      check: () => metrics.maxDrawdown <= 10 && metrics.sharpeRatio >= 1.5,
    },
    {
      type: "high_volume",
      name: "High Volume Trader",
      check: () => metrics.totalTrades >= 1000,
    },
    {
      type: "community_leader",
      name: "Community Leader",
      check: () => metrics.followersCount >= 1000 && metrics.positionsShared >= 100,
    },
    {
      type: "early_adopter",
      name: "Early Adopter",
      check: () => metrics.accountAge >= 365,
    },
    {
      type: "profitable_streak",
      name: "Profitable Streak",
      check: () => metrics.totalPnLPercent >= 50,
    },
    {
      type: "low_drawdown",
      name: "Low Drawdown Master",
      check: () => metrics.maxDrawdown <= 5 && metrics.totalTrades >= 50,
    },
  ];

  for (const badge of badges) {
    if (!existingTypes.has(badge.type) && badge.check()) {
      badgesToAward.push({ type: badge.type, name: badge.name });
    }
  }

  return badgesToAward;
}
