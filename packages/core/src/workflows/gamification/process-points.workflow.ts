/**
 * Process Points Earning Workflow
 * Advanced points processing with streak multipliers, tier bonuses, quest progress, and achievement checks
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry configuration
const {
  getPointsConfig,
  checkDailyLimit,
  incrementDailyAction,
  calculateBasePoints,
  getUserStreak,
  applyStreakMultiplier,
  updateUserStreak,
  getUserTier,
  applyTierMultiplier,
  creditPointsToUser,
  updateTierPoints,
  checkTierUpgrade,
  upgradeTier,
  updateQuestProgress,
  checkAchievements,
  unlockAchievement,
  checkAntiGamingRules,
  flagSuspiciousActivity,
  sendNotification,
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

// Long-running activity for achievement checks
const longActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

// Workflow input
export interface ProcessPointsInput {
  userId: string;
  actionType: string;
  metadata?: {
    amount?: number;
    profit?: number;
    referenceType?: string;
    referenceId?: string;
    [key: string]: unknown;
  };
}

// Workflow status
export interface ProcessPointsStatus {
  workflowId: string;
  status: "validating" | "calculating" | "crediting" | "updating" | "completed" | "failed";
  actionType: string;
  basePoints: number;
  streakMultiplier: number;
  tierMultiplier: number;
  totalPoints: number;
  newBalance: number;
  streakUpdated: boolean;
  currentStreak: number;
  tierUpgraded: boolean;
  newTier?: string;
  questsUpdated: string[];
  achievementsUnlocked: string[];
  antiGamingFlag?: string;
  errorMessage?: string;
}

// Query for status
export const getProcessPointsStatus = defineQuery<ProcessPointsStatus>("getProcessPointsStatus");

/**
 * Process Points Earning Workflow
 * Comprehensive workflow for earning points with all multipliers and checks
 */
export async function processPointsEarningWorkflow(
  input: ProcessPointsInput
): Promise<ProcessPointsStatus> {
  const { userId, actionType, metadata } = input;
  const workflowId = `pts_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Initialize status
  const status: ProcessPointsStatus = {
    workflowId,
    status: "validating",
    actionType,
    basePoints: 0,
    streakMultiplier: 1.0,
    tierMultiplier: 1.0,
    totalPoints: 0,
    newBalance: 0,
    streakUpdated: false,
    currentStreak: 0,
    tierUpgraded: false,
    questsUpdated: [],
    achievementsUnlocked: [],
  };

  // Set up query handler
  setHandler(getProcessPointsStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Get points configuration for action
    // =========================================================================
    const config = await getPointsConfig(actionType);
    if (!config || !config.active) {
      status.status = "failed";
      status.errorMessage = `Points config not found or inactive for: ${actionType}`;
      return status;
    }

    // =========================================================================
    // Step 2: Check daily limit (if applicable)
    // =========================================================================
    if (config.dailyLimit) {
      const limitCheck = await checkDailyLimit(userId, actionType, config.dailyLimit);
      if (!limitCheck.allowed) {
        status.status = "failed";
        status.errorMessage = `Daily limit exceeded for ${actionType}. Limit: ${config.dailyLimit}, Used: ${limitCheck.currentCount}`;
        return status;
      }
    }

    // =========================================================================
    // Step 3: Anti-gaming checks
    // =========================================================================
    status.status = "validating";
    const antiGamingResult = await checkAntiGamingRules({
      userId,
      actionType,
      metadata,
      recentActionsWindow: 3600000, // 1 hour
    });

    if (antiGamingResult.flagged) {
      await flagSuspiciousActivity({
        userId,
        flagType: antiGamingResult.flagType!,
        severity: antiGamingResult.severity!,
        description: antiGamingResult.reason!,
        metadata: { actionType, ...metadata },
      });

      if (antiGamingResult.severity === "critical" || antiGamingResult.severity === "high") {
        status.status = "failed";
        status.antiGamingFlag = antiGamingResult.flagType;
        status.errorMessage = `Action blocked due to suspicious activity: ${antiGamingResult.reason}`;
        return status;
      }

      status.antiGamingFlag = antiGamingResult.flagType;
    }

    // =========================================================================
    // Step 4: Calculate base points
    // =========================================================================
    status.status = "calculating";
    status.basePoints = await calculateBasePoints({
      actionType,
      config,
      metadata,
    });

    // =========================================================================
    // Step 5: Get and apply streak multiplier
    // =========================================================================
    const streakInfo = await getUserStreak(userId, actionType);
    status.currentStreak = streakInfo.currentCount;

    if (config.multiplierRules?.streakMultiplier) {
      const streakResult = await applyStreakMultiplier({
        basePoints: status.basePoints,
        streakCount: streakInfo.currentCount,
        multiplierRate: config.multiplierRules.streakMultiplier,
        maxMultiplier: config.multiplierRules.maxMultiplier ?? 3.0,
      });
      status.streakMultiplier = streakResult.multiplier;
    }

    // =========================================================================
    // Step 6: Get and apply tier multiplier
    // =========================================================================
    const tierInfo = await getUserTier(userId);
    const tierResult = await applyTierMultiplier({
      basePoints: status.basePoints,
      tierName: tierInfo.currentTier,
    });
    status.tierMultiplier = tierResult.multiplier;

    // =========================================================================
    // Step 7: Calculate total points
    // =========================================================================
    status.totalPoints = Math.floor(
      status.basePoints * status.streakMultiplier * status.tierMultiplier
    );

    // Ensure we don't award 0 points for valid actions
    if (status.totalPoints === 0 && config.basePoints > 0) {
      status.totalPoints = 1;
    }

    // =========================================================================
    // Step 8: Credit points to user
    // =========================================================================
    status.status = "crediting";
    const creditResult = await creditPointsToUser({
      userId,
      amount: status.totalPoints,
      actionType,
      description: config.description,
      baseAmount: status.basePoints,
      multiplierApplied: status.streakMultiplier * status.tierMultiplier,
      referenceType: metadata?.referenceType,
      referenceId: metadata?.referenceId,
    });
    status.newBalance = creditResult.newBalance;

    // Increment daily action count
    if (config.dailyLimit) {
      await incrementDailyAction(userId, actionType);
    }

    // =========================================================================
    // Step 9: Update streak
    // =========================================================================
    status.status = "updating";
    const streakUpdate = await updateUserStreak(userId, actionType);
    status.streakUpdated = streakUpdate.updated;
    status.currentStreak = streakUpdate.currentCount;

    // =========================================================================
    // Step 10: Update tier points and check for upgrade
    // =========================================================================
    await updateTierPoints(userId, status.totalPoints);

    const upgradeCheck = await checkTierUpgrade(userId);
    if (upgradeCheck.shouldUpgrade) {
      await upgradeTier(userId, upgradeCheck.newTier!);
      status.tierUpgraded = true;
      status.newTier = upgradeCheck.newTier;
    }

    // =========================================================================
    // Step 11: Update quest progress
    // =========================================================================
    const questUpdates = await updateQuestProgress({
      userId,
      actionType,
      metadata,
      pointsEarned: status.totalPoints,
    });
    status.questsUpdated = questUpdates.updatedQuests;

    // =========================================================================
    // Step 12: Check achievements
    // =========================================================================
    const achievementResult = await longActivities.checkUserAchievements({
      userId,
      triggerAction: actionType,
      metadata,
    });

    for (const achievement of achievementResult.newlyUnlocked) {
      await unlockAchievement({
        userId,
        achievementId: achievement.id,
        pointsReward: achievement.pointsReward,
      });
      status.achievementsUnlocked.push(achievement.title);
    }

    // =========================================================================
    // Step 13: Send notifications
    // =========================================================================
    await sendNotification({
      userId,
      type: "points_earned",
      data: {
        actionType,
        points: status.totalPoints,
        newBalance: status.newBalance,
        streakBonus: status.streakMultiplier > 1,
        tierBonus: status.tierMultiplier > 1,
        tierUpgraded: status.tierUpgraded,
        newTier: status.newTier,
        achievementsUnlocked: status.achievementsUnlocked,
      },
    });

    // =========================================================================
    // Step 14: Record audit log
    // =========================================================================
    await recordAuditLog({
      userId,
      action: "points.earned",
      resourceType: "pointsTransactions",
      resourceId: creditResult.transactionId,
      metadata: {
        actionType,
        basePoints: status.basePoints,
        totalPoints: status.totalPoints,
        multipliers: {
          streak: status.streakMultiplier,
          tier: status.tierMultiplier,
        },
        tierUpgraded: status.tierUpgraded,
        achievementsUnlocked: status.achievementsUnlocked.length,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId,
      action: "points.earn_failed",
      resourceType: "points",
      resourceId: workflowId,
      metadata: {
        error: status.errorMessage,
        actionType,
      },
    });

    throw error;
  }
}
