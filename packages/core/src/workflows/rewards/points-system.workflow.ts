/**
 * Points & Rewards System Workflow
 *
 * Manages the PULL rewards ecosystem:
 * - Points earning for various actions
 * - Points redemption for prizes, sweepstakes, and $PULL tokens
 * - Achievement tracking
 * - Referral bonuses
 * - Streak multipliers
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "./activities";

// Activity proxies
const {
  getUserPointsBalance,
  calculatePointsEarned,
  creditPoints,
  debitPoints,
  checkRedemptionEligibility,
  processRedemption,
  convertPointsToPullTokens,
  checkAchievementProgress,
  unlockAchievement,
  processReferralBonus,
  getStreakMultiplier,
  recordRewardEvent,
  sendRewardNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

// =============================================================================
// QUERIES
// =============================================================================

export const getPointsStatusQuery = defineQuery<PointsStatus>("getPointsStatus");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Points earning configuration by action type
 */
export const POINTS_CONFIG = {
  // Trading actions
  trade_executed: {
    base: 10,
    perDollar: 0.1,
    description: "Completed a trade",
  },
  prediction_correct: {
    base: 50,
    perDollar: 0.5,
    description: "Correct prediction market outcome",
  },
  prediction_placed: {
    base: 5,
    perDollar: 0.05,
    description: "Placed prediction market order",
  },

  // Engagement actions
  daily_login: {
    base: 5,
    streakMultiplier: true,
    maxStreak: 30,
    description: "Daily login bonus",
  },
  profile_completed: {
    base: 100,
    oneTime: true,
    description: "Completed profile setup",
  },
  kyc_completed: {
    base: 250,
    oneTime: true,
    description: "Completed KYC verification",
  },

  // Social actions
  referral_signup: {
    base: 500,
    description: "Friend signed up with your code",
  },
  referral_kyc_complete: {
    base: 250,
    description: "Referred friend completed KYC",
  },
  referral_first_trade: {
    base: 100,
    description: "Referred friend made first trade",
  },
  social_share: {
    base: 10,
    dailyLimit: 50,
    description: "Shared content on social media",
  },

  // Fantasy sports
  fantasy_entry: {
    base: 5,
    perDollar: 0.05,
    description: "Entered fantasy contest",
  },
  fantasy_win: {
    base: 100,
    perDollar: 0.25,
    description: "Won fantasy contest",
  },

  // Email intelligence
  email_processed: {
    base: 1,
    dailyLimit: 100,
    description: "Email triaged by AI",
  },

  // RWA trading
  rwa_purchase: {
    base: 25,
    perDollar: 0.2,
    description: "Purchased fractional RWA",
  },

  // Misc
  survey_completed: {
    base: 50,
    description: "Completed feedback survey",
  },
  app_review: {
    base: 100,
    oneTime: true,
    description: "Left app store review",
  },
} as const;

export type PointsActionType = keyof typeof POINTS_CONFIG;

export interface PointsAction {
  userId: string;
  actionType: PointsActionType;
  metadata?: {
    tradeValue?: number;
    referralCode?: string;
    referredUserId?: string;
    contestId?: string;
    assetId?: string;
    [key: string]: unknown;
  };
}

export interface PointsEarned {
  basePoints: number;
  multiplier: number;
  bonusPoints: number;
  totalPoints: number;
  newBalance: number;
  streakDays?: number;
  achievementsUnlocked?: string[];
}

export interface PointsStatus {
  userId: string;
  currentBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  currentStreak: number;
  tierLevel: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  tierProgress: number;
  nextTierAt: number;
}

export interface RedemptionInput {
  userId: string;
  redemptionType:
    | "sweepstakes_entry"
    | "prize_purchase"
    | "pull_token_conversion"
    | "fee_discount"
    | "premium_feature";
  itemId?: string;
  pointsCost: number;
  quantity?: number;
}

export interface RedemptionResult {
  success: boolean;
  newBalance: number;
  redemptionId?: string;
  tokensReceived?: number;
  error?: string;
}

// =============================================================================
// EARN POINTS WORKFLOW
// =============================================================================

export async function EarnPointsWorkflow(action: PointsAction): Promise<PointsEarned> {
  const config = POINTS_CONFIG[action.actionType];

  // Get current user status
  const userStatus = await getUserPointsBalance({ userId: action.userId });

  // Calculate base points
  let basePoints = config.base;

  // Apply per-dollar multiplier if applicable
  if ("perDollar" in config && action.metadata?.tradeValue) {
    basePoints += Math.floor(action.metadata.tradeValue * config.perDollar);
  }

  // Calculate multiplier (streak, tier, etc.)
  let multiplier = 1.0;

  // Apply streak multiplier for daily login
  if ("streakMultiplier" in config && config.streakMultiplier) {
    const streakData = await getStreakMultiplier({ userId: action.userId });
    multiplier = Math.min(1 + streakData.currentStreak * 0.1, 4.0); // Max 4x
  }

  // Apply tier multiplier
  const tierMultipliers: Record<string, number> = {
    bronze: 1.0,
    silver: 1.1,
    gold: 1.25,
    platinum: 1.5,
    diamond: 2.0,
  };
  multiplier *= tierMultipliers[userStatus.tierLevel] || 1.0;

  // Calculate bonus points (random bonus chance)
  let bonusPoints = 0;
  if (Math.random() < 0.05) {
    // 5% chance of bonus
    bonusPoints = Math.floor(basePoints * 0.5);
  }

  // Calculate total
  const totalPoints = Math.floor(basePoints * multiplier) + bonusPoints;

  // Credit points to user
  const newBalance = await creditPoints({
    userId: action.userId,
    amount: totalPoints,
    source: action.actionType,
    sourceId: action.metadata?.assetId || action.metadata?.contestId,
    description: config.description,
    breakdown: {
      basePoints,
      multiplier,
      bonusPoints,
    },
  });

  // Record event for analytics
  await recordRewardEvent({
    userId: action.userId,
    eventType: "points_earned",
    amount: totalPoints,
    source: action.actionType,
    metadata: {
      ...action.metadata,
      breakdown: { basePoints, multiplier, bonusPoints },
    },
  });

  // Check for achievement progress
  const achievementsUnlocked: string[] = [];
  const achievementCheck = await checkAchievementProgress({
    userId: action.userId,
    actionType: action.actionType,
    totalPoints,
  });

  for (const achievement of achievementCheck.newAchievements) {
    await unlockAchievement({
      userId: action.userId,
      achievementId: achievement.id,
      pointsBonus: achievement.points,
    });
    achievementsUnlocked.push(achievement.name);
  }

  // Send notification for significant point earnings
  if (totalPoints >= 50 || achievementsUnlocked.length > 0) {
    await sendRewardNotification({
      userId: action.userId,
      type: "points_earned",
      title:
        achievementsUnlocked.length > 0
          ? `Achievement Unlocked! +${totalPoints} points`
          : `+${totalPoints} points earned!`,
      message:
        achievementsUnlocked.length > 0
          ? `You unlocked: ${achievementsUnlocked.join(", ")}`
          : config.description,
    });
  }

  return {
    basePoints,
    multiplier,
    bonusPoints,
    totalPoints,
    newBalance,
    achievementsUnlocked:
      achievementsUnlocked.length > 0 ? achievementsUnlocked : undefined,
  };
}

// =============================================================================
// REDEEM POINTS WORKFLOW
// =============================================================================

export async function RedeemPointsWorkflow(
  input: RedemptionInput
): Promise<RedemptionResult> {
  // Check eligibility
  const eligibility = await checkRedemptionEligibility({
    userId: input.userId,
    redemptionType: input.redemptionType,
    itemId: input.itemId,
    pointsCost: input.pointsCost,
  });

  if (!eligibility.allowed) {
    return {
      success: false,
      newBalance: eligibility.currentBalance,
      error: eligibility.reason,
    };
  }

  // Process based on redemption type
  let redemptionId: string | undefined;
  let tokensReceived: number | undefined;

  try {
    switch (input.redemptionType) {
      case "pull_token_conversion":
        // Convert points to $PULL tokens
        const conversionRate = 1000; // 1000 points = 1 $PULL
        tokensReceived = input.pointsCost / conversionRate;

        const tokenResult = await convertPointsToPullTokens({
          userId: input.userId,
          points: input.pointsCost,
          tokensToMint: tokensReceived,
        });

        redemptionId = tokenResult.transactionId;
        break;

      case "sweepstakes_entry":
        const entriesCount = input.quantity || 1;
        const sweepstakesResult = await processRedemption({
          userId: input.userId,
          redemptionType: input.redemptionType,
          itemId: input.itemId!,
          pointsCost: input.pointsCost,
          metadata: { entriesCount },
        });
        redemptionId = sweepstakesResult.redemptionId;
        break;

      default:
        const generalResult = await processRedemption({
          userId: input.userId,
          redemptionType: input.redemptionType,
          itemId: input.itemId,
          pointsCost: input.pointsCost,
        });
        redemptionId = generalResult.redemptionId;
    }

    // Debit points from user
    const newBalance = await debitPoints({
      userId: input.userId,
      amount: input.pointsCost,
      reason: `Redemption: ${input.redemptionType}`,
      redemptionId,
    });

    // Record event
    await recordRewardEvent({
      userId: input.userId,
      eventType: "points_redeemed",
      amount: input.pointsCost,
      source: input.redemptionType,
      metadata: {
        itemId: input.itemId,
        redemptionId,
        tokensReceived,
      },
    });

    // Send notification
    await sendRewardNotification({
      userId: input.userId,
      type: "redemption_complete",
      title: "Points Redeemed!",
      message:
        input.redemptionType === "pull_token_conversion"
          ? `You received ${tokensReceived} $PULL tokens!`
          : `Successfully redeemed ${input.pointsCost} points`,
    });

    return {
      success: true,
      newBalance,
      redemptionId,
      tokensReceived,
    };
  } catch (error) {
    // Record failed redemption
    await recordRewardEvent({
      userId: input.userId,
      eventType: "redemption_failed",
      amount: input.pointsCost,
      source: input.redemptionType,
      metadata: { error: String(error) },
    });

    return {
      success: false,
      newBalance: eligibility.currentBalance,
      error: `Redemption failed: ${error}`,
    };
  }
}

// =============================================================================
// REFERRAL BONUS WORKFLOW
// =============================================================================

export interface ReferralBonusInput {
  referrerId: string;
  referredUserId: string;
  milestone: "signup" | "kyc_complete" | "first_trade";
}

export async function ReferralBonusWorkflow(
  input: ReferralBonusInput
): Promise<void> {
  const bonusConfig = {
    signup: { referrer: 500, referred: 250 },
    kyc_complete: { referrer: 250, referred: 100 },
    first_trade: { referrer: 100, referred: 50 },
  };

  const bonus = bonusConfig[input.milestone];

  // Credit referrer
  await processReferralBonus({
    userId: input.referrerId,
    amount: bonus.referrer,
    milestone: input.milestone,
    isReferrer: true,
    relatedUserId: input.referredUserId,
  });

  // Credit referred user
  await processReferralBonus({
    userId: input.referredUserId,
    amount: bonus.referred,
    milestone: input.milestone,
    isReferrer: false,
    relatedUserId: input.referrerId,
  });

  // Send notifications
  await Promise.all([
    sendRewardNotification({
      userId: input.referrerId,
      type: "referral_bonus",
      title: "Referral Bonus!",
      message: `Your friend completed ${input.milestone.replace("_", " ")}! +${bonus.referrer} points`,
    }),
    sendRewardNotification({
      userId: input.referredUserId,
      type: "referral_bonus",
      title: "Welcome Bonus!",
      message: `You earned ${bonus.referred} points for ${input.milestone.replace("_", " ")}!`,
    }),
  ]);
}

// =============================================================================
// DAILY STREAK WORKFLOW
// =============================================================================

export interface DailyStreakInput {
  userId: string;
}

export async function DailyStreakWorkflow(
  input: DailyStreakInput
): Promise<{ streakDays: number; pointsEarned: number }> {
  // This workflow runs daily for active users
  const streakData = await getStreakMultiplier({ userId: input.userId });

  // Credit daily login points with streak multiplier
  const result = await EarnPointsWorkflow({
    userId: input.userId,
    actionType: "daily_login",
  });

  // Check for streak milestones
  const streakMilestones = [7, 14, 30, 60, 90, 180, 365];
  const newStreak = streakData.currentStreak + 1;

  if (streakMilestones.includes(newStreak)) {
    // Award milestone bonus
    const milestoneBonus = newStreak * 10;
    await creditPoints({
      userId: input.userId,
      amount: milestoneBonus,
      source: "streak_milestone",
      description: `${newStreak}-day streak milestone!`,
    });

    await sendRewardNotification({
      userId: input.userId,
      type: "streak_milestone",
      title: `${newStreak}-Day Streak! 🔥`,
      message: `Amazing! You've logged in ${newStreak} days in a row. +${milestoneBonus} bonus points!`,
    });
  }

  return {
    streakDays: newStreak,
    pointsEarned: result.totalPoints,
  };
}
