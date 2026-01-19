/**
 * Earn Points Workflow
 * Handles points earning for user actions with multipliers and tier upgrades
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getUserPointsBalance,
  getUserTier,
  getUserStreak,
  calculatePointsForAction,
  getActiveMultipliers,
  creditPoints,
  updateUserStreak,
  checkTierUpgrade,
  upgradeTier,
  sendPointsNotification,
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

// Workflow input type
export interface EarnPointsInput {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

// Points action types
export type PointsAction =
  | "daily_login"
  | "trade_executed"
  | "deposit"
  | "referral_signup"
  | "referral_trade"
  | "rwa_purchase"
  | "email_connected"
  | "profile_completed"
  | "kyc_upgraded"
  | "streak_bonus";

// Base points per action
const BASE_POINTS: Record<PointsAction, number> = {
  daily_login: 10,
  trade_executed: 5,
  deposit: 50,
  referral_signup: 100,
  referral_trade: 25,
  rwa_purchase: 15,
  email_connected: 25,
  profile_completed: 50,
  kyc_upgraded: 100,
  streak_bonus: 20,
};

// Tier multipliers
const TIER_MULTIPLIERS: Record<string, number> = {
  bronze: 1.0,
  silver: 1.25,
  gold: 1.5,
  platinum: 2.0,
  diamond: 2.5,
};

// Earn points status type
export interface EarnPointsStatus {
  transactionId: string;
  status: "calculating" | "crediting" | "completed" | "failed";
  action: string;
  basePoints: number;
  tierMultiplier: number;
  streakMultiplier: number;
  bonusMultiplier: number;
  totalPoints: number;
  newBalance: number;
  tierUpgraded: boolean;
  newTier?: string;
  streakUpdated: boolean;
  currentStreak: number;
}

// Queries
export const getEarnPointsStatusQuery = defineQuery<EarnPointsStatus>("getEarnPointsStatus");

/**
 * Earn Points Workflow
 */
export async function earnPointsWorkflow(
  input: EarnPointsInput
): Promise<EarnPointsStatus> {
  const { userId, action, metadata } = input;

  // Generate transaction ID
  const transactionId = `pts_${crypto.randomUUID()}`;

  // Initialize status
  const status: EarnPointsStatus = {
    transactionId,
    status: "calculating",
    action,
    basePoints: 0,
    tierMultiplier: 1.0,
    streakMultiplier: 1.0,
    bonusMultiplier: 1.0,
    totalPoints: 0,
    newBalance: 0,
    tierUpgraded: false,
    streakUpdated: false,
    currentStreak: 0,
  };

  // Set up query handler
  setHandler(getEarnPointsStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get user's current state
    // =========================================================================
    const [currentBalance, userTier, userStreak, activeMultipliers] = await Promise.all([
      getUserPointsBalance(userId),
      getUserTier(userId),
      getUserStreak(userId),
      getActiveMultipliers(userId),
    ]);

    status.currentStreak = userStreak.currentStreak;

    // =========================================================================
    // Step 2: Calculate base points
    // =========================================================================
    const basePoints = await calculatePointsForAction(action as PointsAction, metadata);
    status.basePoints = basePoints;

    // =========================================================================
    // Step 3: Apply multipliers
    // =========================================================================

    // Tier multiplier
    status.tierMultiplier = TIER_MULTIPLIERS[userTier.tier] ?? 1.0;

    // Streak multiplier (increases with consecutive days)
    if (userStreak.currentStreak >= 30) {
      status.streakMultiplier = 2.0;
    } else if (userStreak.currentStreak >= 14) {
      status.streakMultiplier = 1.5;
    } else if (userStreak.currentStreak >= 7) {
      status.streakMultiplier = 1.25;
    }

    // Bonus multipliers (promotional, special events, etc.)
    for (const multiplier of activeMultipliers) {
      if (multiplier.appliesTo.includes(action) || multiplier.appliesTo.includes("all")) {
        status.bonusMultiplier *= multiplier.value;
      }
    }

    // Calculate total points
    status.totalPoints = Math.floor(
      status.basePoints *
        status.tierMultiplier *
        status.streakMultiplier *
        status.bonusMultiplier
    );

    // =========================================================================
    // Step 4: Credit points
    // =========================================================================
    status.status = "crediting";

    await creditPoints({
      userId,
      amount: status.totalPoints,
      action,
      transactionId,
      metadata: {
        basePoints: status.basePoints,
        tierMultiplier: status.tierMultiplier,
        streakMultiplier: status.streakMultiplier,
        bonusMultiplier: status.bonusMultiplier,
        ...metadata,
      },
    });

    status.newBalance = currentBalance + status.totalPoints;

    // =========================================================================
    // Step 5: Update streak (for daily login)
    // =========================================================================
    if (action === "daily_login") {
      const streakResult = await updateUserStreak(userId);
      status.streakUpdated = true;
      status.currentStreak = streakResult.newStreak;

      // Award streak bonus for milestones
      if ([7, 14, 30, 60, 90].includes(streakResult.newStreak)) {
        const bonusPoints = streakResult.newStreak * 10;
        await creditPoints({
          userId,
          amount: bonusPoints,
          action: "streak_bonus",
          transactionId: `${transactionId}_streak`,
          metadata: { streakDays: streakResult.newStreak },
        });
        status.totalPoints += bonusPoints;
        status.newBalance += bonusPoints;
      }
    }

    // =========================================================================
    // Step 6: Check for tier upgrade
    // =========================================================================
    const tierCheck = await checkTierUpgrade(userId, status.newBalance);

    if (tierCheck.shouldUpgrade) {
      await upgradeTier(userId, tierCheck.newTier!);
      status.tierUpgraded = true;
      status.newTier = tierCheck.newTier;
    }

    // =========================================================================
    // Step 7: Send notification
    // =========================================================================
    await sendPointsNotification(userId, {
      type: "points_earned",
      points: status.totalPoints,
      action,
      newBalance: status.newBalance,
      tierUpgraded: status.tierUpgraded,
      newTier: status.newTier,
    });

    // =========================================================================
    // Step 8: Record audit log
    // =========================================================================
    await recordAuditLog({
      userId,
      action: "points_earned",
      resourceType: "points",
      resourceId: transactionId,
      metadata: {
        action: status.action,
        points: status.totalPoints,
        newBalance: status.newBalance,
        tierUpgraded: status.tierUpgraded,
      },
    });

    status.status = "completed";

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId,
      action: "points_earn_failed",
      resourceType: "points",
      resourceId: transactionId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
