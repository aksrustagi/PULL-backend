/**
 * Check Achievements Workflow
 * Triggered by user actions to check and unlock achievements
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getUserStats,
  getLockedAchievements,
  checkAchievementRequirement,
  unlockAchievement,
  creditPointsToUser,
  sendNotification,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Workflow input
export interface CheckAchievementsInput {
  userId: string;
  triggerAction: string;
  metadata?: Record<string, unknown>;
}

// Workflow result
export interface CheckAchievementsResult {
  workflowId: string;
  status: "checking" | "completed" | "failed";
  achievementsChecked: number;
  achievementsUnlocked: Array<{
    achievementId: string;
    title: string;
    description: string;
    icon: string;
    rarity: string;
    pointsReward: number;
  }>;
  totalPointsAwarded: number;
  errorMessage?: string;
}

// Query
export const getCheckAchievementsStatus = defineQuery<CheckAchievementsResult>("getCheckAchievementsStatus");

/**
 * Check Achievements Workflow
 */
export async function checkAchievementsWorkflow(
  input: CheckAchievementsInput
): Promise<CheckAchievementsResult> {
  const { userId, triggerAction, metadata } = input;
  const workflowId = `achieve_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const result: CheckAchievementsResult = {
    workflowId,
    status: "checking",
    achievementsChecked: 0,
    achievementsUnlocked: [],
    totalPointsAwarded: 0,
  };

  setHandler(getCheckAchievementsStatus, () => result);

  try {
    // =========================================================================
    // Step 1: Get user's current stats
    // =========================================================================
    const userStats = await getUserStats(userId);

    // =========================================================================
    // Step 2: Get all locked achievements for this user
    // =========================================================================
    const lockedAchievements = await getLockedAchievements(userId);
    result.achievementsChecked = lockedAchievements.length;

    // =========================================================================
    // Step 3: Check each achievement requirement
    // =========================================================================
    for (const achievement of lockedAchievements) {
      const meetsRequirement = await checkAchievementRequirement({
        requirement: achievement.requirement,
        userStats,
        triggerAction,
        metadata,
      });

      if (meetsRequirement) {
        // =========================================================================
        // Step 4: Unlock achievement
        // =========================================================================
        await unlockAchievement({
          userId,
          achievementId: achievement._id,
          progress: userStats,
        });

        // =========================================================================
        // Step 5: Credit points reward
        // =========================================================================
        if (achievement.pointsReward > 0) {
          await creditPointsToUser({
            userId,
            amount: achievement.pointsReward,
            actionType: "achievement_unlock",
            description: `Unlocked achievement: ${achievement.title}`,
            referenceType: "achievements",
            referenceId: achievement._id,
          });
          result.totalPointsAwarded += achievement.pointsReward;
        }

        // Add to unlocked list
        result.achievementsUnlocked.push({
          achievementId: achievement.achievementId,
          title: achievement.title,
          description: achievement.description,
          icon: achievement.icon,
          rarity: achievement.rarity,
          pointsReward: achievement.pointsReward,
        });

        // =========================================================================
        // Step 6: Send notification
        // =========================================================================
        await sendNotification({
          userId,
          type: "achievement_unlocked",
          data: {
            achievementId: achievement.achievementId,
            title: achievement.title,
            description: achievement.description,
            icon: achievement.icon,
            rarity: achievement.rarity,
            pointsReward: achievement.pointsReward,
          },
        });

        // =========================================================================
        // Step 7: Record audit log
        // =========================================================================
        await recordAuditLog({
          userId,
          action: "achievement.unlocked",
          resourceType: "achievements",
          resourceId: achievement._id,
          metadata: {
            achievementId: achievement.achievementId,
            title: achievement.title,
            rarity: achievement.rarity,
            pointsReward: achievement.pointsReward,
            triggerAction,
          },
        });
      }
    }

    result.status = "completed";
    return result;
  } catch (error) {
    result.status = "failed";
    result.errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

/**
 * Batch Check Achievements Workflow
 * For processing multiple users at once (e.g., after a trade settlement)
 */
export interface BatchCheckAchievementsInput {
  userIds: string[];
  triggerAction: string;
  metadata?: Record<string, unknown>;
}

export interface BatchCheckAchievementsResult {
  workflowId: string;
  status: "processing" | "completed" | "failed";
  usersProcessed: number;
  totalAchievementsUnlocked: number;
  totalPointsAwarded: number;
  userResults: Array<{
    userId: string;
    achievementsUnlocked: number;
    pointsAwarded: number;
  }>;
  errorMessage?: string;
}

export const getBatchCheckStatus = defineQuery<BatchCheckAchievementsResult>("getBatchCheckStatus");

export async function batchCheckAchievementsWorkflow(
  input: BatchCheckAchievementsInput
): Promise<BatchCheckAchievementsResult> {
  const { userIds, triggerAction, metadata } = input;
  const workflowId = `batch_achieve_${Date.now()}`;

  const result: BatchCheckAchievementsResult = {
    workflowId,
    status: "processing",
    usersProcessed: 0,
    totalAchievementsUnlocked: 0,
    totalPointsAwarded: 0,
    userResults: [],
  };

  setHandler(getBatchCheckStatus, () => result);

  try {
    for (const userId of userIds) {
      try {
        const userResult = await checkAchievementsWorkflow({
          userId,
          triggerAction,
          metadata,
        });

        result.userResults.push({
          userId,
          achievementsUnlocked: userResult.achievementsUnlocked.length,
          pointsAwarded: userResult.totalPointsAwarded,
        });

        result.totalAchievementsUnlocked += userResult.achievementsUnlocked.length;
        result.totalPointsAwarded += userResult.totalPointsAwarded;
      } catch {
        // Log error but continue with other users
        result.userResults.push({
          userId,
          achievementsUnlocked: 0,
          pointsAwarded: 0,
        });
      }

      result.usersProcessed++;
    }

    result.status = "completed";
    return result;
  } catch (error) {
    result.status = "failed";
    result.errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
