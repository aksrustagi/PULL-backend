import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities/rewards";

const {
  awardPoints,
  deductPoints,
  getPointsBalance,
  processReferralBonus,
  calculateTradingPoints,
  processDailyStreak,
  fulfillRedemption,
  sendRewardNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

interface TradePointsParams {
  userId: string;
  tradeId: string;
  tradeVolume: number;
  assetClass: string;
}

/**
 * Award points for a completed trade
 */
export async function tradePointsWorkflow(
  params: TradePointsParams
): Promise<{ pointsAwarded: number }> {
  const { userId, tradeId, tradeVolume, assetClass } = params;

  // Calculate points based on trade volume and asset class
  const points = await calculateTradingPoints(userId, tradeVolume, assetClass);

  if (points > 0) {
    await awardPoints(
      userId,
      points,
      "earn_trading",
      `Points earned for ${assetClass} trade`,
      "trades",
      tradeId
    );

    await sendRewardNotification(userId, "earned", {
      type: "trading",
      points,
      tradeId,
    });
  }

  return { pointsAwarded: points };
}

interface ReferralBonusParams {
  referrerId: string;
  referredUserId: string;
}

/**
 * Process referral bonus when new user completes onboarding
 */
export async function referralBonusWorkflow(
  params: ReferralBonusParams
): Promise<{ success: boolean }> {
  const { referrerId, referredUserId } = params;

  const referrerBonus = 500; // Points for referrer
  const referredBonus = 250; // Points for new user

  await processReferralBonus(
    referrerId,
    referredUserId,
    referrerBonus,
    referredBonus
  );

  // Notify both users
  await sendRewardNotification(referrerId, "earned", {
    type: "referral",
    points: referrerBonus,
    referredUserId,
  });

  await sendRewardNotification(referredUserId, "earned", {
    type: "welcome_bonus",
    points: referredBonus,
    referrerId,
  });

  return { success: true };
}

interface DailyStreakParams {
  userId: string;
  currentStreak: number;
}

/**
 * Process daily login streak
 */
export async function dailyStreakWorkflow(
  params: DailyStreakParams
): Promise<{ bonusPoints: number; newStreak: number }> {
  const { userId, currentStreak } = params;

  const result = await processDailyStreak(userId, currentStreak);

  await sendRewardNotification(userId, "earned", {
    type: "streak",
    points: result.bonusPoints,
    streakDays: result.newStreak,
  });

  return result;
}

interface RedemptionFulfillmentParams {
  redemptionId: string;
  userId: string;
  rewardId: string;
  rewardType: "digital" | "physical" | "credit";
  pointsCost: number;
}

/**
 * Fulfill a reward redemption
 */
export async function redemptionFulfillmentWorkflow(
  params: RedemptionFulfillmentParams
): Promise<{ success: boolean; fulfillmentDetails?: Record<string, unknown> }> {
  const { redemptionId, userId, rewardType, pointsCost } = params;

  // Verify user has sufficient balance
  const balance = await getPointsBalance(userId);

  if (balance < pointsCost) {
    return { success: false };
  }

  // Deduct points
  await deductPoints(
    userId,
    pointsCost,
    "redeem_reward",
    "Reward redemption",
    "redemptions",
    redemptionId
  );

  // Fulfill based on type
  const fulfillment = await fulfillRedemption(redemptionId, rewardType);

  if (!fulfillment.success) {
    // Refund points if fulfillment fails
    await awardPoints(
      userId,
      pointsCost,
      "adjustment",
      "Refund for failed redemption",
      "redemptions",
      redemptionId
    );

    return { success: false };
  }

  // Notify user
  await sendRewardNotification(userId, "fulfilled", {
    redemptionId,
    ...fulfillment,
  });

  return {
    success: true,
    fulfillmentDetails: fulfillment,
  };
}

interface PointsExpirationParams {
  userId: string;
  transactionIds: string[];
  expiringAmount: number;
}

/**
 * Handle points expiration (run on schedule)
 */
export async function pointsExpirationWorkflow(
  params: PointsExpirationParams
): Promise<{ expiredAmount: number }> {
  const { userId, expiringAmount } = params;

  // Send warning notification first
  await sendRewardNotification(userId, "earned", {
    type: "expiration_warning",
    amount: expiringAmount,
    daysRemaining: 7,
  });

  // Wait before expiring
  await sleep("7 days");

  // Check if points were used
  const currentBalance = await getPointsBalance(userId);

  // Only expire if they still have excess points
  if (currentBalance >= expiringAmount) {
    await deductPoints(
      userId,
      expiringAmount,
      "expire",
      "Points expired due to inactivity",
      undefined,
      undefined
    );

    return { expiredAmount: expiringAmount };
  }

  return { expiredAmount: 0 };
}
