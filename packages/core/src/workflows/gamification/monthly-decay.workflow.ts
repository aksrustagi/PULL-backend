/**
 * Monthly Decay Workflow
 * Handles point decay for inactive users, tier recalculation, and archive old transactions
 * Triggered: cron "0 0 1 * *" (1st of month at midnight UTC)
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getInactiveUsers,
  applyPointDecay,
  recalculateTier,
  sendTierChangeNotification,
  archiveOldTransactions,
  generateMonthlyReport,
  updateLeaderboardSnapshot,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Batch activities
const batchActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 hours",
  heartbeatTimeout: "10 minutes",
  retry: {
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

// Decay configuration
const DECAY_CONFIG = {
  minPointsForDecay: 1000,
  inactivityThresholds: [
    { days: 30, decayPercent: 0.1 }, // 10% decay after 30 days inactive
    { days: 60, decayPercent: 0.2 }, // 20% decay after 60 days inactive
    { days: 90, decayPercent: 0.3 }, // 30% decay after 90 days inactive
  ],
  maxDecayPercent: 0.3,
};

// Workflow status
export interface MonthlyDecayStatus {
  workflowId: string;
  status: "initializing" | "identifying_inactive" | "applying_decay" | "recalculating_tiers" | "sending_notifications" | "archiving" | "generating_report" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  usersProcessed: number;
  pointsDecayed: number;
  tierChanges: Array<{ userId: string; from: string; to: string }>;
  notificationsSent: number;
  transactionsArchived: number;
  errorMessage?: string;
  progress: {
    phase: string;
    current: number;
    total: number;
  };
}

// Query
export const getMonthlyDecayStatus = defineQuery<MonthlyDecayStatus>("getMonthlyDecayStatus");

/**
 * Monthly Decay Workflow
 */
export async function monthlyDecayWorkflow(): Promise<MonthlyDecayStatus> {
  const workflowId = `monthly_decay_${Date.now()}`;
  const startedAt = Date.now();

  const status: MonthlyDecayStatus = {
    workflowId,
    status: "initializing",
    startedAt,
    usersProcessed: 0,
    pointsDecayed: 0,
    tierChanges: [],
    notificationsSent: 0,
    transactionsArchived: 0,
    progress: {
      phase: "initializing",
      current: 0,
      total: 6,
    },
  };

  setHandler(getMonthlyDecayStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Identify inactive users eligible for decay
    // =========================================================================
    status.status = "identifying_inactive";
    status.progress = { phase: "Identifying inactive users", current: 1, total: 6 };

    const inactiveUsers = await batchActivities.getInactiveUsersForDecay({
      minPoints: DECAY_CONFIG.minPointsForDecay,
      inactivityDays: 30,
    });

    await recordAuditLog({
      action: "monthly_decay.users_identified",
      resourceType: "system",
      resourceId: workflowId,
      metadata: { inactiveUserCount: inactiveUsers.length },
    });

    // =========================================================================
    // Step 2: Apply point decay based on inactivity period
    // =========================================================================
    status.status = "applying_decay";
    status.progress = { phase: "Applying point decay", current: 2, total: 6 };

    const batchSize = 50;
    let totalDecayed = 0;

    for (let i = 0; i < inactiveUsers.length; i += batchSize) {
      const batch = inactiveUsers.slice(i, i + batchSize);

      for (const user of batch) {
        // Determine decay percentage based on inactivity
        let decayPercent = 0;
        for (const threshold of DECAY_CONFIG.inactivityThresholds) {
          if (user.inactiveDays >= threshold.days) {
            decayPercent = threshold.decayPercent;
          }
        }

        if (decayPercent > 0) {
          const decayResult = await applyPointDecay({
            userId: user.userId,
            currentPoints: user.lifetimePoints,
            decayPercent,
            reason: `${user.inactiveDays} days of inactivity`,
          });

          totalDecayed += decayResult.pointsDecayed;
          status.usersProcessed++;
        }
      }

      // Progress update
      await sleep(500);
    }

    status.pointsDecayed = totalDecayed;

    // =========================================================================
    // Step 3: Recalculate tiers for decayed users
    // =========================================================================
    status.status = "recalculating_tiers";
    status.progress = { phase: "Recalculating tiers", current: 3, total: 6 };

    const tierChanges: Array<{ userId: string; from: string; to: string }> = [];

    for (let i = 0; i < inactiveUsers.length; i += batchSize) {
      const batch = inactiveUsers.slice(i, i + batchSize);

      for (const user of batch) {
        const tierResult = await recalculateTier(user.userId);

        if (tierResult.changed) {
          tierChanges.push({
            userId: user.userId,
            from: tierResult.previousTier!,
            to: tierResult.newTier!,
          });
        }
      }

      await sleep(500);
    }

    status.tierChanges = tierChanges;

    // =========================================================================
    // Step 4: Send tier change notifications
    // =========================================================================
    status.status = "sending_notifications";
    status.progress = { phase: "Sending notifications", current: 4, total: 6 };

    let notificationsSent = 0;

    for (const change of tierChanges) {
      await sendTierChangeNotification({
        userId: change.userId,
        previousTier: change.from,
        newTier: change.to,
        reason: "inactivity_decay",
      });
      notificationsSent++;

      // Rate limiting
      if (notificationsSent % 20 === 0) {
        await sleep(1000);
      }
    }

    status.notificationsSent = notificationsSent;

    // =========================================================================
    // Step 5: Archive old point transactions (older than 1 year)
    // =========================================================================
    status.status = "archiving";
    status.progress = { phase: "Archiving old transactions", current: 5, total: 6 };

    const archiveResult = await batchActivities.archiveOldPointTransactions({
      olderThanDays: 365,
      batchSize: 1000,
    });

    status.transactionsArchived = archiveResult.archivedCount;

    // =========================================================================
    // Step 6: Generate monthly report
    // =========================================================================
    status.status = "generating_report";
    status.progress = { phase: "Generating monthly report", current: 6, total: 6 };

    await generateMonthlyReport({
      month: new Date().toISOString().slice(0, 7), // YYYY-MM format
      usersDecayed: status.usersProcessed,
      totalPointsDecayed: status.pointsDecayed,
      tierDowngrades: tierChanges.length,
      transactionsArchived: status.transactionsArchived,
    });

    // Update monthly leaderboard
    await updateLeaderboardSnapshot({
      period: "monthly",
      types: ["points", "trading_volume", "pnl", "referrals"],
    });

    // =========================================================================
    // Complete
    // =========================================================================
    status.status = "completed";
    status.completedAt = Date.now();
    status.progress = { phase: "completed", current: 6, total: 6 };

    await recordAuditLog({
      action: "monthly_decay.completed",
      resourceType: "system",
      resourceId: workflowId,
      metadata: {
        usersProcessed: status.usersProcessed,
        pointsDecayed: status.pointsDecayed,
        tierChanges: tierChanges.length,
        notificationsSent: status.notificationsSent,
        transactionsArchived: status.transactionsArchived,
        duration: status.completedAt - startedAt,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";
    status.completedAt = Date.now();
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "monthly_decay.failed",
      resourceType: "system",
      resourceId: workflowId,
      metadata: {
        error: status.errorMessage,
        phase: status.progress.phase,
      },
    });

    throw error;
  }
}
