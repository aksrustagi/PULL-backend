/**
 * Quest and Achievement Workflows
 * Handles daily quest assignment, quest completion, and achievement tracking
 */

import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./gamification-activities";

// Activity proxies
const {
  // Quest operations
  getActiveQuestDefinitions,
  assignQuestsToUser,
  getActiveUserQuests,
  completeQuest,
  claimQuestReward,
  expireQuests,
  // Achievement operations
  checkAchievementUnlock,
  unlockAchievement,
  claimAchievementReward,
  getUnclaimedAchievements,
  // Points operations
  creditPoints,
  // Token operations
  creditTokens,
  // Notifications
  sendQuestAssignedNotification,
  sendQuestCompletionNotification,
  sendQuestExpiredNotification,
  sendAchievementUnlockedNotification,
  // Audit
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// QUEST WORKFLOWS
// ============================================================================

// ----------------------------------------------------------------------------
// Daily Quest Assignment
// ----------------------------------------------------------------------------

export interface AssignDailyQuestsInput {
  userId: string;
  questCount?: number;
  forceReassign?: boolean;
}

export interface AssignDailyQuestsStatus {
  workflowId: string;
  status: "assigning" | "completed" | "failed";
  userId: string;
  questsAssigned: string[];
  questDetails: Array<{
    questId: string;
    name: string;
    targetValue: number;
    pointsReward: number;
    expiresAt: number;
  }>;
  error?: string;
}

export const getAssignDailyQuestsStatusQuery = defineQuery<AssignDailyQuestsStatus>(
  "getAssignDailyQuestsStatus"
);

/**
 * Assign daily quests to a user
 */
export async function assignDailyQuestsWorkflow(
  input: AssignDailyQuestsInput
): Promise<AssignDailyQuestsStatus> {
  const { userId, questCount = 3, forceReassign = false } = input;

  const workflowId = `quest_assign_${userId}_${crypto.randomUUID()}`;

  const status: AssignDailyQuestsStatus = {
    workflowId,
    status: "assigning",
    userId,
    questsAssigned: [],
    questDetails: [],
  };

  setHandler(getAssignDailyQuestsStatusQuery, () => status);

  try {
    // Check for existing active quests
    const activeQuests = await getActiveUserQuests(userId, "daily");

    if (activeQuests.length > 0 && !forceReassign) {
      // User already has daily quests
      status.status = "completed";
      status.questsAssigned = activeQuests.map((q) => q.questId);
      status.questDetails = activeQuests.map((q) => ({
        questId: q.questId,
        name: q.name,
        targetValue: q.targetValue,
        pointsReward: q.pointsReward,
        expiresAt: q.expiresAt,
      }));
      return status;
    }

    // Get available daily quest definitions
    const questDefs = await getActiveQuestDefinitions("daily");

    // Randomly select quests
    const shuffled = questDefs.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questCount, shuffled.length));

    // Assign quests to user
    const assignedQuests = await assignQuestsToUser(userId, selected);

    status.questsAssigned = assignedQuests.map((q) => q.questId);
    status.questDetails = assignedQuests.map((q) => ({
      questId: q.questId,
      name: q.name,
      targetValue: q.targetValue,
      pointsReward: q.pointsReward,
      expiresAt: q.expiresAt,
    }));

    // Send notification
    await sendQuestAssignedNotification(userId, {
      quests: status.questDetails,
      totalPotentialPoints: status.questDetails.reduce(
        (sum, q) => sum + q.pointsReward,
        0
      ),
    });

    // Record audit
    await recordAuditLog({
      userId,
      action: "daily_quests_assigned",
      resourceType: "quests",
      resourceId: workflowId,
      metadata: {
        questCount: status.questsAssigned.length,
        questIds: status.questsAssigned,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Quest Completion
// ----------------------------------------------------------------------------

export interface CompleteQuestInput {
  userId: string;
  questId: string;
  autoClaim?: boolean;
}

export interface CompleteQuestStatus {
  workflowId: string;
  status: "completing" | "claiming" | "completed" | "failed";
  userId: string;
  questId: string;
  questName: string;
  progress: number;
  targetValue: number;
  isCompleted: boolean;
  isClaimed: boolean;
  rewards?: {
    points: number;
    tokens?: number;
    badge?: string;
  };
  error?: string;
}

export const getCompleteQuestStatusQuery = defineQuery<CompleteQuestStatus>(
  "getCompleteQuestStatus"
);

/**
 * Complete a quest and optionally claim rewards
 */
export async function completeQuestWorkflow(
  input: CompleteQuestInput
): Promise<CompleteQuestStatus> {
  const { userId, questId, autoClaim = true } = input;

  const workflowId = `quest_complete_${questId}_${crypto.randomUUID()}`;

  const status: CompleteQuestStatus = {
    workflowId,
    status: "completing",
    userId,
    questId,
    questName: "",
    progress: 0,
    targetValue: 0,
    isCompleted: false,
    isClaimed: false,
  };

  setHandler(getCompleteQuestStatusQuery, () => status);

  try {
    // Complete the quest
    const result = await completeQuest(userId, questId);

    status.questName = result.questName;
    status.progress = result.progress;
    status.targetValue = result.targetValue;
    status.isCompleted = result.isCompleted;

    if (!result.isCompleted) {
      status.status = "completed";
      return status;
    }

    // Send completion notification
    await sendQuestCompletionNotification(userId, {
      questId,
      questName: result.questName,
      rewards: result.rewards,
    });

    // Auto-claim if requested
    if (autoClaim) {
      status.status = "claiming";

      const claimResult = await claimQuestReward(userId, questId);

      // Credit rewards
      if (claimResult.points > 0) {
        await creditPoints({
          userId,
          amount: claimResult.points,
          action: "quest_completed",
          transactionId: workflowId,
          metadata: { questId, questName: result.questName },
        });
      }

      if (claimResult.tokens && claimResult.tokens > 0) {
        await creditTokens(userId, claimResult.tokens, workflowId);
      }

      status.isClaimed = true;
      status.rewards = {
        points: claimResult.points,
        tokens: claimResult.tokens,
        badge: claimResult.badge,
      };
    }

    // Record audit
    await recordAuditLog({
      userId,
      action: "quest_completed",
      resourceType: "quests",
      resourceId: questId,
      metadata: {
        questName: result.questName,
        rewards: status.rewards,
        autoClaimed: autoClaim,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Scheduled Quest Expiry
// ----------------------------------------------------------------------------

export interface ExpireQuestsInput {
  batchSize?: number;
}

export interface ExpireQuestsStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  totalExpired: number;
  usersAffected: number;
  notificationsSent: number;
  errors: string[];
}

export const getExpireQuestsStatusQuery = defineQuery<ExpireQuestsStatus>(
  "getExpireQuestsStatus"
);

/**
 * Expire overdue quests
 */
export async function expireQuestsWorkflow(
  input: ExpireQuestsInput = {}
): Promise<ExpireQuestsStatus> {
  const { batchSize = 100 } = input;

  const runId = `quest_expire_${crypto.randomUUID()}`;

  const status: ExpireQuestsStatus = {
    runId,
    status: "running",
    startedAt: Date.now(),
    totalExpired: 0,
    usersAffected: 0,
    notificationsSent: 0,
    errors: [],
  };

  setHandler(getExpireQuestsStatusQuery, () => status);

  try {
    const result = await expireQuests(batchSize);

    status.totalExpired = result.expiredCount;
    status.usersAffected = result.usersAffected;

    // Send notifications
    for (const userId of result.userIds) {
      try {
        await sendQuestExpiredNotification(userId, {
          expiredCount: result.questsByUser[userId]?.length ?? 0,
        });
        status.notificationsSent++;
      } catch (error) {
        status.errors.push(
          `Failed to notify ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    await recordAuditLog({
      userId: "system",
      action: "quests_expired",
      resourceType: "system",
      resourceId: runId,
      metadata: {
        totalExpired: status.totalExpired,
        usersAffected: status.usersAffected,
      },
    });

    status.status = "completed";
    status.completedAt = Date.now();
    return status;
  } catch (error) {
    status.status = "failed";
    status.errors.push(
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

// ============================================================================
// ACHIEVEMENT WORKFLOWS
// ============================================================================

// ----------------------------------------------------------------------------
// Check and Unlock Achievement
// ----------------------------------------------------------------------------

export interface CheckAchievementInput {
  userId: string;
  achievementType: string;
  currentValue: number;
  metadata?: Record<string, unknown>;
}

export interface CheckAchievementStatus {
  workflowId: string;
  status: "checking" | "unlocking" | "completed" | "failed";
  userId: string;
  achievementType: string;
  achievementsChecked: number;
  achievementsUnlocked: string[];
  totalRewards: {
    points: number;
    tokens: number;
  };
  error?: string;
}

export const getCheckAchievementStatusQuery = defineQuery<CheckAchievementStatus>(
  "getCheckAchievementStatus"
);

/**
 * Check if user has unlocked any achievements based on current value
 */
export async function checkAchievementWorkflow(
  input: CheckAchievementInput
): Promise<CheckAchievementStatus> {
  const { userId, achievementType, currentValue, metadata = {} } = input;

  const workflowId = `achievement_check_${userId}_${crypto.randomUUID()}`;

  const status: CheckAchievementStatus = {
    workflowId,
    status: "checking",
    userId,
    achievementType,
    achievementsChecked: 0,
    achievementsUnlocked: [],
    totalRewards: { points: 0, tokens: 0 },
  };

  setHandler(getCheckAchievementStatusQuery, () => status);

  try {
    // Check which achievements are unlocked
    const checkResult = await checkAchievementUnlock(
      userId,
      achievementType,
      currentValue
    );

    status.achievementsChecked = checkResult.checked;

    if (checkResult.unlocked.length === 0) {
      status.status = "completed";
      return status;
    }

    // Unlock each achievement
    status.status = "unlocking";

    for (const achievement of checkResult.unlocked) {
      try {
        const unlockResult = await unlockAchievement(userId, achievement.id);

        // Auto-claim reward
        const claimResult = await claimAchievementReward(userId, achievement.id);

        // Credit rewards
        if (claimResult.points > 0) {
          await creditPoints({
            userId,
            amount: claimResult.points,
            action: "achievement_unlocked",
            transactionId: `${workflowId}_${achievement.id}`,
            metadata: {
              achievementId: achievement.id,
              achievementName: achievement.name,
            },
          });
          status.totalRewards.points += claimResult.points;
        }

        if (claimResult.tokens && claimResult.tokens > 0) {
          await creditTokens(userId, claimResult.tokens, workflowId);
          status.totalRewards.tokens += claimResult.tokens;
        }

        status.achievementsUnlocked.push(achievement.id);

        // Send notification
        await sendAchievementUnlockedNotification(userId, {
          achievementId: achievement.id,
          achievementName: achievement.name,
          rarity: achievement.rarity,
          rewards: {
            points: claimResult.points,
            tokens: claimResult.tokens,
          },
        });
      } catch (error) {
        // Log error but continue with other achievements
        console.error(
          `Failed to unlock achievement ${achievement.id}:`,
          error
        );
      }
    }

    // Record audit
    await recordAuditLog({
      userId,
      action: "achievements_unlocked",
      resourceType: "achievements",
      resourceId: workflowId,
      metadata: {
        achievementType,
        currentValue,
        unlockedCount: status.achievementsUnlocked.length,
        totalRewards: status.totalRewards,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Claim Pending Achievements
// ----------------------------------------------------------------------------

export interface ClaimPendingAchievementsInput {
  userId: string;
}

export interface ClaimPendingAchievementsStatus {
  workflowId: string;
  status: "claiming" | "completed" | "failed";
  userId: string;
  achievementsClaimed: string[];
  totalRewards: {
    points: number;
    tokens: number;
  };
  error?: string;
}

export const getClaimPendingAchievementsStatusQuery =
  defineQuery<ClaimPendingAchievementsStatus>(
    "getClaimPendingAchievementsStatus"
  );

/**
 * Claim all pending unclaimed achievements for a user
 */
export async function claimPendingAchievementsWorkflow(
  input: ClaimPendingAchievementsInput
): Promise<ClaimPendingAchievementsStatus> {
  const { userId } = input;

  const workflowId = `achievement_claim_${userId}_${crypto.randomUUID()}`;

  const status: ClaimPendingAchievementsStatus = {
    workflowId,
    status: "claiming",
    userId,
    achievementsClaimed: [],
    totalRewards: { points: 0, tokens: 0 },
  };

  setHandler(getClaimPendingAchievementsStatusQuery, () => status);

  try {
    // Get unclaimed achievements
    const unclaimed = await getUnclaimedAchievements(userId);

    for (const achievement of unclaimed) {
      const claimResult = await claimAchievementReward(userId, achievement.id);

      // Credit rewards
      if (claimResult.points > 0) {
        await creditPoints({
          userId,
          amount: claimResult.points,
          action: "achievement_claimed",
          transactionId: `${workflowId}_${achievement.id}`,
          metadata: { achievementId: achievement.id },
        });
        status.totalRewards.points += claimResult.points;
      }

      if (claimResult.tokens && claimResult.tokens > 0) {
        await creditTokens(userId, claimResult.tokens, workflowId);
        status.totalRewards.tokens += claimResult.tokens;
      }

      status.achievementsClaimed.push(achievement.id);
    }

    await recordAuditLog({
      userId,
      action: "achievements_claimed",
      resourceType: "achievements",
      resourceId: workflowId,
      metadata: {
        claimedCount: status.achievementsClaimed.length,
        totalRewards: status.totalRewards,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ============================================================================
// SCHEDULED WORKFLOWS
// ============================================================================

/**
 * Scheduled workflow to assign daily quests and expire old ones
 */
export async function scheduledQuestMaintenanceWorkflow(): Promise<void> {
  // Expire old quests
  await expireQuestsWorkflow({ batchSize: 500 });

  // Wait until next day
  await sleep(24 * 60 * 60 * 1000);

  // Continue as new
  await continueAsNew<typeof scheduledQuestMaintenanceWorkflow>();
}
