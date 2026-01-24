/**
 * Check Streaks Workflow
 * Daily scheduled workflow to check and reset broken streaks
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./gamification-activities";

// Activity proxies
const {
  getAllBrokenStreaks,
  resetStreak,
  getStreakExpiryNotifications,
  sendStreakExpiryWarning,
  sendStreakBrokenNotification,
  recordAuditLog,
  scheduleNextRun,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// Types
// ============================================================================

export interface CheckStreaksInput {
  batchSize?: number;
  sendNotifications?: boolean;
  dryRun?: boolean;
}

export interface CheckStreaksStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  // Results
  totalChecked: number;
  streaksReset: number;
  streaksPreserved: number;
  warningsSent: number;
  notificationsSent: number;
  // Batch info
  currentBatch: number;
  totalBatches: number;
  // Errors
  errors: string[];
}

// Queries
export const getCheckStreaksStatusQuery = defineQuery<CheckStreaksStatus>(
  "getCheckStreaksStatus"
);

// ============================================================================
// Main Workflow
// ============================================================================

export async function checkStreaksWorkflow(
  input: CheckStreaksInput = {}
): Promise<CheckStreaksStatus> {
  const { batchSize = 100, sendNotifications = true, dryRun = false } = input;

  const runId = `streak_check_${crypto.randomUUID()}`;

  const status: CheckStreaksStatus = {
    runId,
    status: "running",
    startedAt: Date.now(),
    totalChecked: 0,
    streaksReset: 0,
    streaksPreserved: 0,
    warningsSent: 0,
    notificationsSent: 0,
    currentBatch: 0,
    totalBatches: 0,
    errors: [],
  };

  setHandler(getCheckStreaksStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get all potentially broken streaks
    // =========================================================================
    const brokenStreaks = await getAllBrokenStreaks();
    const totalStreaks = brokenStreaks.length;

    status.totalBatches = Math.ceil(totalStreaks / batchSize);

    // =========================================================================
    // Step 2: Process streaks in batches
    // =========================================================================
    for (let i = 0; i < totalStreaks; i += batchSize) {
      status.currentBatch = Math.floor(i / batchSize) + 1;
      const batch = brokenStreaks.slice(i, i + batchSize);

      for (const streak of batch) {
        try {
          status.totalChecked++;

          // Check if streak is frozen
          if (streak.frozenUntil && streak.frozenUntil > Date.now()) {
            status.streaksPreserved++;
            continue;
          }

          // Check if streak is actually broken (no activity in last 2 days)
          const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
          const isActuallyBroken = streak.lastActionAt < twoDaysAgo;

          if (isActuallyBroken && streak.currentCount > 0) {
            if (!dryRun) {
              await resetStreak(streak.userId, streak.streakType);

              if (sendNotifications) {
                await sendStreakBrokenNotification(streak.userId, {
                  streakType: streak.streakType,
                  previousCount: streak.currentCount,
                  longestCount: streak.longestCount,
                });
                status.notificationsSent++;
              }
            }
            status.streaksReset++;
          } else {
            status.streaksPreserved++;
          }
        } catch (error) {
          status.errors.push(
            `Failed to process streak for user ${streak.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Small delay between batches to avoid overwhelming the system
      await sleep(100);
    }

    // =========================================================================
    // Step 3: Send expiry warnings (streaks about to break)
    // =========================================================================
    if (sendNotifications && !dryRun) {
      const expiryWarnings = await getStreakExpiryNotifications();

      for (const warning of expiryWarnings) {
        try {
          await sendStreakExpiryWarning(warning.userId, {
            streakType: warning.streakType,
            currentCount: warning.currentCount,
            expiresIn: warning.expiresIn,
          });
          status.warningsSent++;
        } catch (error) {
          status.errors.push(
            `Failed to send expiry warning to ${warning.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    // =========================================================================
    // Step 4: Record audit log
    // =========================================================================
    await recordAuditLog({
      userId: "system",
      action: "streaks_checked",
      resourceType: "system",
      resourceId: runId,
      metadata: {
        totalChecked: status.totalChecked,
        streaksReset: status.streaksReset,
        streaksPreserved: status.streaksPreserved,
        warningsSent: status.warningsSent,
        dryRun,
      },
    });

    status.status = "completed";
    status.completedAt = Date.now();

    return status;
  } catch (error) {
    status.status = "failed";
    status.errors.push(
      `Workflow failed: ${error instanceof Error ? error.message : String(error)}`
    );

    await recordAuditLog({
      userId: "system",
      action: "streaks_check_failed",
      resourceType: "system",
      resourceId: runId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// ============================================================================
// Continuous Scheduled Workflow
// ============================================================================

export interface ScheduledCheckStreaksInput {
  intervalHours?: number;
  batchSize?: number;
}

/**
 * Long-running scheduled workflow that checks streaks daily
 * Uses continueAsNew for infinite execution
 */
export async function scheduledCheckStreaksWorkflow(
  input: ScheduledCheckStreaksInput = {}
): Promise<void> {
  const { intervalHours = 24, batchSize = 100 } = input;

  // Run the check
  await checkStreaksWorkflow({ batchSize, sendNotifications: true, dryRun: false });

  // Wait for next run
  await sleep(intervalHours * 60 * 60 * 1000);

  // Continue as new to avoid history growth
  await continueAsNew<typeof scheduledCheckStreaksWorkflow>({
    intervalHours,
    batchSize,
  });
}
