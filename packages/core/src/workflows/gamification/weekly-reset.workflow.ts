/**
 * Weekly Reset Workflow
 * Handles weekly quest reset, weekly summary emails, and leaderboard updates
 * Triggered: cron "0 0 * * 1" (Monday midnight UTC)
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
  resetWeeklyQuestProgress,
  generateWeeklyQuests,
  getWeeklySummaryData,
  sendWeeklySummaryEmails,
  updateLeaderboardSnapshot,
  archiveOldLeaderboards,
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

// Batch activities for large operations
const batchActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 hour",
  heartbeatTimeout: "5 minutes",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

// Workflow status
export interface WeeklyResetStatus {
  workflowId: string;
  status: "initializing" | "resetting_quests" | "generating_quests" | "preparing_summaries" | "sending_emails" | "updating_leaderboards" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  questsReset: number;
  newWeeklyQuests: number;
  emailsSent: number;
  leaderboardsUpdated: number;
  errorMessage?: string;
  progress: {
    phase: string;
    current: number;
    total: number;
  };
}

// Query
export const getWeeklyResetStatus = defineQuery<WeeklyResetStatus>("getWeeklyResetStatus");

/**
 * Weekly Reset Workflow
 */
export async function weeklyResetWorkflow(): Promise<WeeklyResetStatus> {
  const workflowId = `weekly_reset_${Date.now()}`;
  const startedAt = Date.now();

  const status: WeeklyResetStatus = {
    workflowId,
    status: "initializing",
    startedAt,
    questsReset: 0,
    newWeeklyQuests: 0,
    emailsSent: 0,
    leaderboardsUpdated: 0,
    progress: {
      phase: "initializing",
      current: 0,
      total: 5,
    },
  };

  setHandler(getWeeklyResetStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Reset weekly quest progress
    // =========================================================================
    status.status = "resetting_quests";
    status.progress = { phase: "Resetting weekly quests", current: 1, total: 5 };

    const resetResult = await batchActivities.resetAllWeeklyQuestProgress();
    status.questsReset = resetResult.resetCount;

    await recordAuditLog({
      action: "weekly_reset.quests_reset",
      resourceType: "quests",
      resourceId: workflowId,
      metadata: { resetCount: resetResult.resetCount },
    });

    // =========================================================================
    // Step 2: Generate new weekly quests
    // =========================================================================
    status.status = "generating_quests";
    status.progress = { phase: "Generating weekly quests", current: 2, total: 5 };

    const questGenResult = await generateWeeklyQuests();
    status.newWeeklyQuests = questGenResult.questCount;

    // =========================================================================
    // Step 3: Prepare weekly summary data
    // =========================================================================
    status.status = "preparing_summaries";
    status.progress = { phase: "Preparing weekly summaries", current: 3, total: 5 };

    const summaryData = await batchActivities.prepareWeeklySummaries();

    // =========================================================================
    // Step 4: Send weekly summary emails
    // =========================================================================
    status.status = "sending_emails";
    status.progress = { phase: "Sending weekly summary emails", current: 4, total: 5 };

    const batchSize = 50;
    let emailsSent = 0;

    for (let i = 0; i < summaryData.users.length; i += batchSize) {
      const batch = summaryData.users.slice(i, i + batchSize);

      const emailResult = await sendWeeklySummaryEmails({
        users: batch,
        weekStartDate: summaryData.weekStartDate,
        weekEndDate: summaryData.weekEndDate,
      });

      emailsSent += emailResult.sent;

      // Rate limiting
      await sleep(2000);
    }

    status.emailsSent = emailsSent;

    // =========================================================================
    // Step 5: Update weekly leaderboard
    // =========================================================================
    status.status = "updating_leaderboards";
    status.progress = { phase: "Updating leaderboards", current: 5, total: 5 };

    await updateLeaderboardSnapshot({
      period: "weekly",
      types: ["points", "trading_volume", "pnl", "referrals", "streak"],
    });

    // Archive old weekly leaderboards (keep last 12 weeks)
    await archiveOldLeaderboards({
      period: "weekly",
      keepRecent: 12,
    });

    status.leaderboardsUpdated = 5;

    // =========================================================================
    // Complete
    // =========================================================================
    status.status = "completed";
    status.completedAt = Date.now();
    status.progress = { phase: "completed", current: 5, total: 5 };

    await recordAuditLog({
      action: "weekly_reset.completed",
      resourceType: "system",
      resourceId: workflowId,
      metadata: {
        questsReset: status.questsReset,
        newWeeklyQuests: status.newWeeklyQuests,
        emailsSent: status.emailsSent,
        leaderboardsUpdated: status.leaderboardsUpdated,
        duration: status.completedAt - startedAt,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";
    status.completedAt = Date.now();
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "weekly_reset.failed",
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
