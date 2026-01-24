/**
 * Depreciate Points Workflow
 * Monthly scheduled workflow to depreciate inactive points
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
  getInactiveUserBalances,
  depreciateUserPoints,
  getDepreciationConfig,
  sendDepreciationWarning,
  sendDepreciationNotification,
  recordPointsTransaction,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
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

export interface DepreciatePointsInput {
  /** Depreciation rate (0.0 - 1.0), e.g., 0.05 = 5% */
  depreciationRate?: number;
  /** Minimum points balance to be subject to depreciation */
  minPointsThreshold?: number;
  /** Days of inactivity before depreciation applies */
  inactivityDays?: number;
  /** Batch size for processing */
  batchSize?: number;
  /** Whether to send notifications */
  sendNotifications?: boolean;
  /** Dry run mode - calculate but don't apply */
  dryRun?: boolean;
}

export interface DepreciatePointsStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  // Configuration
  depreciationRate: number;
  minPointsThreshold: number;
  inactivityDays: number;
  // Results
  totalUsersChecked: number;
  usersAffected: number;
  usersExempt: number;
  totalPointsDepreciated: number;
  totalPointsPreserved: number;
  // Batch info
  currentBatch: number;
  totalBatches: number;
  // Notifications
  warningsSent: number;
  notificationsSent: number;
  // Errors
  errors: string[];
}

export interface UserDepreciationResult {
  userId: string;
  previousBalance: number;
  depreciatedAmount: number;
  newBalance: number;
  reason: string;
}

// Queries
export const getDepreciatePointsStatusQuery = defineQuery<DepreciatePointsStatus>(
  "getDepreciatePointsStatus"
);

// ============================================================================
// Main Workflow
// ============================================================================

export async function depreciatePointsWorkflow(
  input: DepreciatePointsInput = {}
): Promise<DepreciatePointsStatus> {
  const {
    depreciationRate = 0.05, // 5% monthly
    minPointsThreshold = 1000,
    inactivityDays = 90,
    batchSize = 100,
    sendNotifications = true,
    dryRun = false,
  } = input;

  const runId = `depreciate_${crypto.randomUUID()}`;

  const status: DepreciatePointsStatus = {
    runId,
    status: "running",
    startedAt: Date.now(),
    depreciationRate,
    minPointsThreshold,
    inactivityDays,
    totalUsersChecked: 0,
    usersAffected: 0,
    usersExempt: 0,
    totalPointsDepreciated: 0,
    totalPointsPreserved: 0,
    currentBatch: 0,
    totalBatches: 0,
    warningsSent: 0,
    notificationsSent: 0,
    errors: [],
  };

  setHandler(getDepreciatePointsStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get all inactive user balances
    // =========================================================================
    const inactiveBalances = await getInactiveUserBalances({
      inactivityDays,
      minBalance: minPointsThreshold,
    });

    const totalUsers = inactiveBalances.length;
    status.totalBatches = Math.ceil(totalUsers / batchSize);

    const results: UserDepreciationResult[] = [];

    // =========================================================================
    // Step 2: Process users in batches
    // =========================================================================
    for (let i = 0; i < totalUsers; i += batchSize) {
      status.currentBatch = Math.floor(i / batchSize) + 1;
      const batch = inactiveBalances.slice(i, i + batchSize);

      for (const userBalance of batch) {
        try {
          status.totalUsersChecked++;

          // Check exemptions (diamond tier, recent activity, etc.)
          if (await isExemptFromDepreciation(userBalance)) {
            status.usersExempt++;
            status.totalPointsPreserved += userBalance.available;
            continue;
          }

          // Calculate depreciation
          const depreciationAmount = Math.floor(
            userBalance.available * depreciationRate
          );

          // Skip if depreciation would be less than 1 point
          if (depreciationAmount < 1) {
            status.usersExempt++;
            status.totalPointsPreserved += userBalance.available;
            continue;
          }

          const newBalance = userBalance.available - depreciationAmount;

          // Apply depreciation if not dry run
          if (!dryRun) {
            await depreciateUserPoints({
              userId: userBalance.userId,
              amount: depreciationAmount,
              reason: `Monthly inactivity depreciation (${inactivityDays}+ days inactive)`,
            });

            // Record transaction
            await recordPointsTransaction({
              userId: userBalance.userId,
              transactionId: `${runId}_${userBalance.userId}`,
              type: "depreciation",
              amount: -depreciationAmount,
              balance: newBalance,
              description: `Points depreciation: ${depreciationRate * 100}% for ${inactivityDays}+ days inactivity`,
              metadata: {
                depreciationRate,
                inactivityDays,
                runId,
              },
            });

            // Send notification
            if (sendNotifications) {
              await sendDepreciationNotification(userBalance.userId, {
                depreciatedAmount: depreciationAmount,
                newBalance,
                reason: `${inactivityDays}+ days of inactivity`,
                nextDepreciationDate: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000
                ).toISOString(),
              });
              status.notificationsSent++;
            }
          }

          results.push({
            userId: userBalance.userId,
            previousBalance: userBalance.available,
            depreciatedAmount: depreciationAmount,
            newBalance,
            reason: "inactivity",
          });

          status.usersAffected++;
          status.totalPointsDepreciated += depreciationAmount;
        } catch (error) {
          status.errors.push(
            `Failed to process user ${userBalance.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Delay between batches
      await sleep(100);
    }

    // =========================================================================
    // Step 3: Send warnings to users approaching inactivity threshold
    // =========================================================================
    if (sendNotifications && !dryRun) {
      const warningDays = inactivityDays - 7; // Warn 7 days before
      const usersToWarn = await getInactiveUserBalances({
        inactivityDays: warningDays,
        maxInactivityDays: inactivityDays - 1,
        minBalance: minPointsThreshold,
      });

      for (const userBalance of usersToWarn) {
        try {
          const potentialDepreciation = Math.floor(
            userBalance.available * depreciationRate
          );

          await sendDepreciationWarning(userBalance.userId, {
            currentBalance: userBalance.available,
            potentialDepreciation,
            daysUntilDepreciation: inactivityDays - warningDays,
            actionRequired: "Log in or make a trade to preserve your points",
          });
          status.warningsSent++;
        } catch (error) {
          status.errors.push(
            `Failed to send warning to ${userBalance.userId}: ${
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
      action: "points_depreciation",
      resourceType: "system",
      resourceId: runId,
      metadata: {
        depreciationRate,
        minPointsThreshold,
        inactivityDays,
        totalUsersChecked: status.totalUsersChecked,
        usersAffected: status.usersAffected,
        totalPointsDepreciated: status.totalPointsDepreciated,
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
      action: "points_depreciation_failed",
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
// Helper Functions
// ============================================================================

async function isExemptFromDepreciation(userBalance: {
  userId: string;
  tierLevel?: string;
  hasActiveStaking?: boolean;
  hasActivePremium?: boolean;
}): Promise<boolean> {
  // Diamond tier users are exempt
  if (userBalance.tierLevel === "diamond") {
    return true;
  }

  // Users with active staking are exempt
  if (userBalance.hasActiveStaking) {
    return true;
  }

  // Premium subscribers are exempt
  if (userBalance.hasActivePremium) {
    return true;
  }

  return false;
}

// ============================================================================
// Scheduled Workflow
// ============================================================================

export interface ScheduledDepreciatePointsInput {
  intervalDays?: number;
  depreciationRate?: number;
  minPointsThreshold?: number;
  inactivityDays?: number;
}

/**
 * Long-running scheduled workflow that depreciates points monthly
 */
export async function scheduledDepreciatePointsWorkflow(
  input: ScheduledDepreciatePointsInput = {}
): Promise<void> {
  const {
    intervalDays = 30, // Monthly
    depreciationRate = 0.05,
    minPointsThreshold = 1000,
    inactivityDays = 90,
  } = input;

  // Run the depreciation
  await depreciatePointsWorkflow({
    depreciationRate,
    minPointsThreshold,
    inactivityDays,
    sendNotifications: true,
    dryRun: false,
  });

  // Wait for next run
  await sleep(intervalDays * 24 * 60 * 60 * 1000);

  // Continue as new
  await continueAsNew<typeof scheduledDepreciatePointsWorkflow>({
    intervalDays,
    depreciationRate,
    minPointsThreshold,
    inactivityDays,
  });
}
