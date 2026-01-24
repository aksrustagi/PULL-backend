/**
 * Process Points Earning Workflow
 * Enhanced workflow with full multiplier support, quest progress, and achievement tracking
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./gamification-activities";

// Activity proxies with retry policies
const {
  // Points operations
  getPointsConfig,
  getUserPointsBalance,
  creditPoints,
  recordPointsTransaction,
  // Tier operations
  getUserTier,
  updateUserTier,
  checkTierUpgrade,
  // Streak operations
  getUserStreak,
  updateStreak,
  getStreakMultiplier,
  // Quest operations
  updateQuestProgress,
  // Achievement operations
  updateAchievementProgress,
  // Multiplier operations
  getActiveMultipliers,
  recordMultiplierUsage,
  // Competition operations
  updateCompetitionScore,
  // Notifications
  sendPointsNotification,
  sendTierUpgradeNotification,
  sendStreakNotification,
  sendQuestCompletionNotification,
  sendAchievementNotification,
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
// Types
// ============================================================================

export interface ProcessPointsEarningInput {
  userId: string;
  action: string;
  metadata?: {
    amount?: number;
    tradeValue?: number;
    depositAmount?: number;
    referralUserId?: string;
    assetId?: string;
    orderId?: string;
    [key: string]: unknown;
  };
  source?: string;
  idempotencyKey?: string;
}

export interface MultiplierBreakdown {
  base: number;
  tier: { name: string; value: number };
  streak: { days: number; value: number };
  volume: { threshold: string; value: number };
  seasonal: { eventName?: string; value: number };
  promotional: Array<{ name: string; value: number }>;
  total: number;
}

export interface ProcessPointsEarningStatus {
  transactionId: string;
  status: "validating" | "calculating" | "crediting" | "updating" | "completed" | "failed";
  action: string;
  // Points calculation
  basePoints: number;
  multipliers: MultiplierBreakdown;
  finalPoints: number;
  newBalance: number;
  // Side effects
  tierUpdate?: { upgraded: boolean; newTier?: string; previousTier?: string };
  streakUpdate?: { type: string; newCount: number; wasReset: boolean; bonusPoints: number };
  questsUpdated: string[];
  questsCompleted: string[];
  achievementsUnlocked: string[];
  competitionScoreUpdated: boolean;
  // Metadata
  processedAt?: number;
  error?: string;
}

// Queries
export const getProcessPointsStatusQuery = defineQuery<ProcessPointsEarningStatus>(
  "getProcessPointsStatus"
);

// ============================================================================
// Main Workflow
// ============================================================================

export async function processPointsEarningWorkflow(
  input: ProcessPointsEarningInput
): Promise<ProcessPointsEarningStatus> {
  const { userId, action, metadata = {}, source = "api" } = input;

  // Generate transaction ID
  const transactionId = input.idempotencyKey ?? `pts_${crypto.randomUUID()}`;

  // Initialize status
  const status: ProcessPointsEarningStatus = {
    transactionId,
    status: "validating",
    action,
    basePoints: 0,
    multipliers: {
      base: 1,
      tier: { name: "bronze", value: 1.0 },
      streak: { days: 0, value: 1.0 },
      volume: { threshold: "none", value: 1.0 },
      seasonal: { value: 1.0 },
      promotional: [],
      total: 1.0,
    },
    finalPoints: 0,
    newBalance: 0,
    questsUpdated: [],
    questsCompleted: [],
    achievementsUnlocked: [],
    competitionScoreUpdated: false,
  };

  // Set up query handler
  setHandler(getProcessPointsStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Validate and get points config
    // =========================================================================
    const pointsConfig = await getPointsConfig(action);

    if (!pointsConfig || !pointsConfig.isActive) {
      throw new Error(`Invalid or inactive action: ${action}`);
    }

    // Check cooldown (handled by activity)
    // Check daily limits (handled by activity)
    // Check KYC requirements (handled by activity)
    // Check tier requirements (handled by activity)

    status.basePoints = pointsConfig.basePoints;

    // =========================================================================
    // Step 2: Calculate base points with context modifiers
    // =========================================================================
    status.status = "calculating";

    // Apply context-specific bonuses
    let contextMultiplier = 1.0;

    if (action === "trade_executed" && metadata.tradeValue) {
      const tradeValue = metadata.tradeValue as number;
      if (tradeValue >= 10000) {
        contextMultiplier = 5.0;
        status.multipliers.volume = { threshold: "$10,000+", value: 5.0 };
      } else if (tradeValue >= 1000) {
        contextMultiplier = 3.0;
        status.multipliers.volume = { threshold: "$1,000+", value: 3.0 };
      } else if (tradeValue >= 100) {
        contextMultiplier = 2.0;
        status.multipliers.volume = { threshold: "$100+", value: 2.0 };
      }
    }

    if (action === "deposit" && metadata.depositAmount) {
      const amount = metadata.depositAmount as number;
      if (amount >= 50000) {
        contextMultiplier = 10.0;
        status.multipliers.volume = { threshold: "$50,000+", value: 10.0 };
      } else if (amount >= 10000) {
        contextMultiplier = 5.0;
        status.multipliers.volume = { threshold: "$10,000+", value: 5.0 };
      } else if (amount >= 1000) {
        contextMultiplier = 2.0;
        status.multipliers.volume = { threshold: "$1,000+", value: 2.0 };
      }
    }

    // =========================================================================
    // Step 3: Get user state and apply multipliers
    // =========================================================================
    const [currentBalance, userTier, userStreaks, activeMultipliers] = await Promise.all([
      getUserPointsBalance(userId),
      getUserTier(userId),
      getUserStreak(userId, getStreakTypeForAction(action)),
      getActiveMultipliers(userId),
    ]);

    // Tier multiplier
    if (pointsConfig.multipliers.tierBonus) {
      const tierMultipliers: Record<string, number> = {
        bronze: 1.0,
        silver: 1.25,
        gold: 1.5,
        platinum: 2.0,
        diamond: 2.5,
      };
      const tierValue = tierMultipliers[userTier.tierLevel] ?? 1.0;
      status.multipliers.tier = { name: userTier.tierLevel, value: tierValue };
    }

    // Streak multiplier
    if (pointsConfig.multipliers.streakBonus && userStreaks) {
      const streakMultiplier = await getStreakMultiplier(userStreaks.currentCount);
      status.multipliers.streak = {
        days: userStreaks.currentCount,
        value: streakMultiplier,
      };
    }

    // Seasonal/promotional multipliers
    if (pointsConfig.multipliers.seasonalBonus) {
      for (const multiplier of activeMultipliers) {
        if (multiplier.appliesTo.includes(action) || multiplier.appliesTo.includes("all")) {
          status.multipliers.promotional.push({
            name: multiplier.name,
            value: multiplier.multiplierValue,
          });
        }
      }
    }

    // Calculate total multiplier
    status.multipliers.total =
      status.multipliers.tier.value *
      status.multipliers.streak.value *
      status.multipliers.volume.value *
      status.multipliers.promotional.reduce((acc, p) => acc * p.value, 1.0);

    // Calculate final points
    status.finalPoints = Math.floor(
      status.basePoints * contextMultiplier * status.multipliers.total
    );

    // =========================================================================
    // Step 4: Credit points
    // =========================================================================
    status.status = "crediting";

    await creditPoints({
      userId,
      amount: status.finalPoints,
      action,
      transactionId,
      metadata: {
        basePoints: status.basePoints,
        multipliers: status.multipliers,
        source,
        ...metadata,
      },
    });

    status.newBalance = currentBalance + status.finalPoints;

    // Record transaction
    await recordPointsTransaction({
      userId,
      transactionId,
      type: `earn_${action}`,
      amount: status.finalPoints,
      balance: status.newBalance,
      description: `Earned ${status.finalPoints} points for ${action}`,
      metadata: {
        basePoints: status.basePoints,
        multipliers: status.multipliers,
      },
    });

    // =========================================================================
    // Step 5: Update streaks
    // =========================================================================
    status.status = "updating";

    const streakType = getStreakTypeForAction(action);
    if (streakType) {
      const streakResult = await updateStreak(userId, streakType);
      status.streakUpdate = {
        type: streakType,
        newCount: streakResult.currentCount,
        wasReset: streakResult.wasReset,
        bonusPoints: 0,
      };

      // Award streak milestones
      const milestones = [7, 14, 30, 60, 90, 180, 365];
      if (milestones.includes(streakResult.currentCount) && !streakResult.wasReset) {
        const streakBonus = streakResult.currentCount * 10;

        await creditPoints({
          userId,
          amount: streakBonus,
          action: "streak_bonus",
          transactionId: `${transactionId}_streak`,
          metadata: { streakDays: streakResult.currentCount, streakType },
        });

        status.streakUpdate.bonusPoints = streakBonus;
        status.finalPoints += streakBonus;
        status.newBalance += streakBonus;

        await sendStreakNotification(userId, {
          streakType,
          days: streakResult.currentCount,
          bonusPoints: streakBonus,
        });
      }
    }

    // =========================================================================
    // Step 6: Check tier upgrade
    // =========================================================================
    const tierCheck = await checkTierUpgrade(userId, status.newBalance);

    if (tierCheck.shouldUpgrade) {
      await updateUserTier(userId, tierCheck.newTier!, status.newBalance);

      status.tierUpdate = {
        upgraded: true,
        newTier: tierCheck.newTier,
        previousTier: userTier.tierLevel,
      };

      await sendTierUpgradeNotification(userId, {
        previousTier: userTier.tierLevel,
        newTier: tierCheck.newTier!,
        newMultiplier: tierCheck.newMultiplier!,
      });
    } else {
      status.tierUpdate = { upgraded: false };
    }

    // =========================================================================
    // Step 7: Update quest progress
    // =========================================================================
    const questType = getQuestTypeForAction(action);
    if (questType) {
      const incrementValue = getQuestIncrementValue(action, metadata);
      const questResult = await updateQuestProgress(userId, questType, incrementValue);

      status.questsUpdated = questResult.updated;
      status.questsCompleted = questResult.completed;

      // Send notifications for completed quests
      for (const questId of questResult.completed) {
        await sendQuestCompletionNotification(userId, questId);
      }
    }

    // =========================================================================
    // Step 8: Update achievement progress
    // =========================================================================
    const achievementType = getAchievementTypeForAction(action);
    if (achievementType) {
      const achievementResult = await updateAchievementProgress(
        userId,
        achievementType,
        getAchievementValue(action, metadata, status.newBalance)
      );

      status.achievementsUnlocked = achievementResult.unlocked;

      // Send notifications for unlocked achievements
      for (const achievementId of achievementResult.unlocked) {
        await sendAchievementNotification(userId, achievementId);
      }
    }

    // =========================================================================
    // Step 9: Update competition scores (if applicable)
    // =========================================================================
    const competitionScoreResult = await updateCompetitionScore(
      userId,
      action,
      status.finalPoints,
      metadata
    );
    status.competitionScoreUpdated = competitionScoreResult.updated;

    // =========================================================================
    // Step 10: Record multiplier usage for promotional events
    // =========================================================================
    for (const promo of status.multipliers.promotional) {
      await recordMultiplierUsage(userId, promo.name, transactionId);
    }

    // =========================================================================
    // Step 11: Send final notification
    // =========================================================================
    await sendPointsNotification(userId, {
      type: "points_earned",
      action,
      points: status.finalPoints,
      newBalance: status.newBalance,
      multipliers: status.multipliers,
      tierUpgraded: status.tierUpdate?.upgraded,
      newTier: status.tierUpdate?.newTier,
    });

    // =========================================================================
    // Step 12: Record audit log
    // =========================================================================
    await recordAuditLog({
      userId,
      action: "points_earned",
      resourceType: "points",
      resourceId: transactionId,
      metadata: {
        action: status.action,
        basePoints: status.basePoints,
        finalPoints: status.finalPoints,
        multipliers: status.multipliers,
        tierUpdate: status.tierUpdate,
        streakUpdate: status.streakUpdate,
        questsCompleted: status.questsCompleted,
        achievementsUnlocked: status.achievementsUnlocked,
      },
    });

    status.status = "completed";
    status.processedAt = Date.now();

    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId,
      action: "points_earn_failed",
      resourceType: "points",
      resourceId: transactionId,
      metadata: {
        error: status.error,
        action: status.action,
      },
    });

    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStreakTypeForAction(action: string): string | null {
  const mapping: Record<string, string> = {
    daily_login: "daily_login",
    trade_executed: "daily_trade",
    deposit: "weekly_deposit",
    prediction_win: "prediction_win",
    rwa_purchase: "rwa_purchase",
  };
  return mapping[action] ?? null;
}

function getQuestTypeForAction(action: string): string | null {
  const mapping: Record<string, string> = {
    trade_executed: "trade_count",
    deposit: "deposit",
    referral_signup: "referral",
    prediction_win: "prediction_win",
    rwa_purchase: "rwa_purchase",
    social_share: "social_share",
    profile_completed: "profile_complete",
  };
  return mapping[action] ?? null;
}

function getQuestIncrementValue(
  action: string,
  metadata: Record<string, unknown>
): number {
  if (action === "trade_executed") {
    return metadata.tradeValue ? Number(metadata.tradeValue) : 1;
  }
  if (action === "deposit") {
    return metadata.depositAmount ? Number(metadata.depositAmount) : 1;
  }
  return 1;
}

function getAchievementTypeForAction(action: string): string | null {
  const mapping: Record<string, string> = {
    trade_executed: "total_trades",
    deposit: "total_deposits",
    referral_signup: "total_referrals",
    daily_login: "login_streak",
    prediction_win: "prediction_wins",
    rwa_purchase: "rwa_purchases",
  };
  return mapping[action] ?? null;
}

function getAchievementValue(
  action: string,
  metadata: Record<string, unknown>,
  currentBalance: number
): number {
  // For lifetime achievements, use cumulative values
  if (action === "daily_login" || action === "trade_executed") {
    return metadata.cumulativeCount ? Number(metadata.cumulativeCount) : 1;
  }
  // For points-based achievements
  if (action === "points_milestone") {
    return currentBalance;
  }
  return 1;
}
