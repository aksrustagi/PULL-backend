/**
 * Daily Reset Workflow
 * Handles daily quest progress reset, streak checks, and notification generation
 * Triggered: cron "0 0 * * *" UTC (midnight daily)
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  resetDailyQuestProgress,
  checkBrokenStreaks,
  generateDailyQuests,
  sendStreakReminders,
  getActiveUsersForReminders,
  sendBulkNotifications,
  recordAuditLog,
  updateLeaderboardSnapshot,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Long-running batch activities
const batchActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

// Workflow status
export interface DailyResetStatus {
  workflowId: string;
  status: "initializing" | "resetting_quests" | "checking_streaks" | "generating_quests" | "sending_reminders" | "updating_leaderboard" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  questsReset: number;
  brokenStreaks: number;
  remindersSent: number;
  newDailyQuests: number;
  errorMessage?: string;
  progress: {
    phase: string;
    current: number;
    total: number;
  };
}

// Query
export const getDailyResetStatus = defineQuery<DailyResetStatus>("getDailyResetStatus");

/**
 * Daily Reset Workflow
 */
export async function dailyResetWorkflow(): Promise<DailyResetStatus> {
  const workflowId = `daily_reset_${Date.now()}`;
  const startedAt = Date.now();

  const status: DailyResetStatus = {
    workflowId,
    status: "initializing",
    startedAt,
    questsReset: 0,
    brokenStreaks: 0,
    remindersSent: 0,
    newDailyQuests: 0,
    progress: {
      phase: "initializing",
      current: 0,
      total: 5,
    },
  };

  setHandler(getDailyResetStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Reset daily quest progress for all users
    // =========================================================================
    status.status = "resetting_quests";
    status.progress = { phase: "Resetting daily quests", current: 1, total: 5 };

    const resetResult = await batchActivities.resetAllDailyQuestProgress();
    status.questsReset = resetResult.resetCount;

    await recordAuditLog({
      action: "daily_reset.quests_reset",
      resourceType: "quests",
      resourceId: workflowId,
      metadata: { resetCount: resetResult.resetCount },
    });

    // =========================================================================
    // Step 2: Check and mark broken streaks
    // =========================================================================
    status.status = "checking_streaks";
    status.progress = { phase: "Checking broken streaks", current: 2, total: 5 };

    const streakResult = await batchActivities.checkAndMarkBrokenStreaks();
    status.brokenStreaks = streakResult.brokenCount;

    await recordAuditLog({
      action: "daily_reset.streaks_checked",
      resourceType: "streaks",
      resourceId: workflowId,
      metadata: {
        brokenCount: streakResult.brokenCount,
        totalChecked: streakResult.totalChecked,
      },
    });

    // =========================================================================
    // Step 3: Generate/rotate new daily quests
    // =========================================================================
    status.status = "generating_quests";
    status.progress = { phase: "Generating daily quests", current: 3, total: 5 };

    const questGenResult = await generateDailyQuests();
    status.newDailyQuests = questGenResult.questCount;

    // =========================================================================
    // Step 4: Send "don't break your streak" reminders
    // =========================================================================
    status.status = "sending_reminders";
    status.progress = { phase: "Sending streak reminders", current: 4, total: 5 };

    // Get users with active streaks who haven't logged in today
    const usersForReminders = await getActiveUsersForReminders({
      minStreakCount: 3,
      lastActivityBefore: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
    });

    if (usersForReminders.length > 0) {
      // Process in batches to avoid overwhelming notification systems
      const batchSize = 100;
      let reminderCount = 0;

      for (let i = 0; i < usersForReminders.length; i += batchSize) {
        const batch = usersForReminders.slice(i, i + batchSize);

        await sendBulkNotifications({
          userIds: batch.map((u) => u.userId),
          type: "streak_reminder",
          data: {
            title: "Don't Break Your Streak!",
            body: "Log in today to keep your streak alive and earn bonus points!",
          },
        });

        reminderCount += batch.length;

        // Small delay between batches
        await sleep(1000);
      }

      status.remindersSent = reminderCount;
    }

    // =========================================================================
    // Step 5: Update daily leaderboard snapshot
    // =========================================================================
    status.status = "updating_leaderboard";
    status.progress = { phase: "Updating leaderboards", current: 5, total: 5 };

    await updateLeaderboardSnapshot({
      period: "daily",
      types: ["points", "trading_volume", "streak"],
    });

    // =========================================================================
    // Complete
    // =========================================================================
    status.status = "completed";
    status.completedAt = Date.now();
    status.progress = { phase: "completed", current: 5, total: 5 };

    await recordAuditLog({
      action: "daily_reset.completed",
      resourceType: "system",
      resourceId: workflowId,
      metadata: {
        questsReset: status.questsReset,
        brokenStreaks: status.brokenStreaks,
        remindersSent: status.remindersSent,
        duration: status.completedAt - startedAt,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";
    status.completedAt = Date.now();
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "daily_reset.failed",
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

/**
 * Signal handlers for manual intervention
 */
export const skipPhaseSignal = "skipPhase";
export const pauseWorkflowSignal = "pauseWorkflow";
export const resumeWorkflowSignal = "resumeWorkflow";
