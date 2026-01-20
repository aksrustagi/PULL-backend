/**
 * Rewards Inngest Functions
 * Points earning, streaks, and redemptions
 */

import { inngest, CRON_SCHEDULES, DEFAULT_RETRY_CONFIG } from "../client";

// ============================================================================
// Points Configuration
// ============================================================================

const POINTS_CONFIG = {
  daily_login: { base: 10, firstTime: 50 },
  trade_completed: { base: 5, perDollar: 0.1, max: 100 },
  referral_signup: { base: 100, bonus: 50 },
  referral_trade: { base: 25, percent: 0.01, maxPercent: 50 },
  kyc_completed: { basic: 50, standard: 100, enhanced: 200, accredited: 500 },
  first_deposit: { base: 100, bonus: 50 },
  streak_bonus: { day3: 1.1, day7: 1.25, day14: 1.5, day30: 2.0 },
  challenge_completed: { easy: 25, medium: 50, hard: 100, epic: 250 },
  social_share: { base: 10, max_daily: 50 },
  email_connected: { base: 75 },
};

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 15000,
  diamond: 50000,
};

// ============================================================================
// Process Points Earning Function
// ============================================================================

/**
 * Process points earning for completed actions
 * Triggered by rewards/action.completed events
 */
export const processPointsEarning = inngest.createFunction(
  {
    id: "pull/rewards/process-points-earning",
    name: "Process Points Earning",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 10,
      key: "event.data.userId",
    },
  },
  { event: "rewards/action.completed" },
  async ({ event, step, logger }) => {
    const { userId, actionType, metadata } = event.data;

    logger.info("Processing points earning", { userId, actionType });

    // Step 1: Get user rewards profile
    const userProfile = await step.run("get-user-profile", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.rewards.getUserRewardsProfile, { userId });
      return {
        currentPoints: 1000,
        totalEarned: 5000,
        tier: "silver" as keyof typeof TIER_THRESHOLDS,
        streakDays: 5,
        lastLoginDate: new Date().toDateString(),
        multiplier: 1.0,
      };
    });

    // Step 2: Calculate base points
    const basePoints = await step.run("calculate-base-points", async () => {
      switch (actionType) {
        case "daily_login":
          // Check if first login ever
          const isFirst = userProfile.totalEarned === 0;
          return isFirst
            ? POINTS_CONFIG.daily_login.firstTime
            : POINTS_CONFIG.daily_login.base;

        case "trade_completed":
          const tradeAmount = (metadata?.amount as number) || 0;
          const tradePoints =
            POINTS_CONFIG.trade_completed.base +
            Math.floor(tradeAmount * POINTS_CONFIG.trade_completed.perDollar);
          return Math.min(tradePoints, POINTS_CONFIG.trade_completed.max);

        case "referral_signup":
          return POINTS_CONFIG.referral_signup.base;

        case "referral_trade":
          const refTradeAmount = (metadata?.amount as number) || 0;
          const refPoints = Math.floor(
            refTradeAmount * POINTS_CONFIG.referral_trade.percent
          );
          return Math.min(
            POINTS_CONFIG.referral_trade.base + refPoints,
            POINTS_CONFIG.referral_trade.maxPercent
          );

        case "kyc_completed":
          const kycTier = (metadata?.tier as keyof typeof POINTS_CONFIG.kyc_completed) || "basic";
          return POINTS_CONFIG.kyc_completed[kycTier];

        case "first_deposit":
          return POINTS_CONFIG.first_deposit.base;

        case "streak_bonus":
          // Calculated separately based on streak length
          return 0;

        case "challenge_completed":
          const difficulty = (metadata?.difficulty as keyof typeof POINTS_CONFIG.challenge_completed) || "easy";
          return POINTS_CONFIG.challenge_completed[difficulty];

        case "social_share":
          return POINTS_CONFIG.social_share.base;

        case "email_connected":
          return POINTS_CONFIG.email_connected.base;

        default:
          return 0;
      }
    });

    // Step 3: Apply multipliers
    const multipliedPoints = await step.run("apply-multipliers", async () => {
      let multiplier = 1.0;

      // Tier multiplier
      const tierMultipliers: Record<string, number> = {
        bronze: 1.0,
        silver: 1.1,
        gold: 1.25,
        platinum: 1.5,
        diamond: 2.0,
      };
      multiplier *= tierMultipliers[userProfile.tier] || 1.0;

      // Streak multiplier (for applicable actions)
      if (["daily_login", "trade_completed"].includes(actionType)) {
        const streakDays = userProfile.streakDays;
        if (streakDays >= 30) multiplier *= POINTS_CONFIG.streak_bonus.day30;
        else if (streakDays >= 14) multiplier *= POINTS_CONFIG.streak_bonus.day14;
        else if (streakDays >= 7) multiplier *= POINTS_CONFIG.streak_bonus.day7;
        else if (streakDays >= 3) multiplier *= POINTS_CONFIG.streak_bonus.day3;
      }

      // Apply user's personal multiplier (from promotions, etc.)
      multiplier *= userProfile.multiplier;

      return Math.floor(basePoints * multiplier);
    });

    // Step 4: Credit points to user
    const newBalance = await step.run("credit-points", async () => {
      // In production: update in Convex
      // return await convex.mutation(api.rewards.creditPoints, {
      //   userId,
      //   points: multipliedPoints,
      //   actionType,
      //   metadata,
      // });
      return userProfile.currentPoints + multipliedPoints;
    });

    // Step 5: Check for tier upgrades
    const tierUpgrade = await step.run("check-tier-upgrade", async () => {
      const totalPoints = userProfile.totalEarned + multipliedPoints;

      const tiers = Object.entries(TIER_THRESHOLDS)
        .sort(([, a], [, b]) => b - a);

      for (const [tier, threshold] of tiers) {
        if (totalPoints >= threshold && tier !== userProfile.tier) {
          // Check if this is actually an upgrade
          const currentThreshold = TIER_THRESHOLDS[userProfile.tier];
          if (threshold > currentThreshold) {
            return {
              upgraded: true,
              oldTier: userProfile.tier,
              newTier: tier,
            };
          }
        }
      }

      return { upgraded: false };
    });

    // Step 6: Send tier upgrade event if applicable
    if (tierUpgrade.upgraded) {
      await step.sendEvent("tier-upgrade", {
        name: "rewards/tier.upgraded",
        data: {
          userId,
          oldTier: tierUpgrade.oldTier!,
          newTier: tierUpgrade.newTier!,
          benefits: getTierBenefits(tierUpgrade.newTier!),
        },
      });
    }

    // Step 7: Send points credited event
    await step.sendEvent("points-credited", {
      name: "rewards/points.credited",
      data: {
        userId,
        points: multipliedPoints,
        reason: actionType,
        newBalance,
      },
    });

    // Step 8: Log the transaction
    await step.run("log-transaction", async () => {
      // In production: insert transaction log
      // await convex.mutation(api.rewards.logTransaction, {
      //   userId,
      //   type: "earn",
      //   actionType,
      //   basePoints,
      //   multipliedPoints,
      //   metadata,
      //   timestamp: Date.now(),
      // });
    });

    return {
      userId,
      actionType,
      basePoints,
      earnedPoints: multipliedPoints,
      newBalance,
      tierUpgrade: tierUpgrade.upgraded ? tierUpgrade.newTier : null,
    };
  }
);

// ============================================================================
// Check Streaks Function
// ============================================================================

/**
 * Check login streaks and award bonuses
 * Runs daily at midnight
 */
export const checkStreaks = inngest.createFunction(
  {
    id: "pull/rewards/check-streaks",
    name: "Check Streaks",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 1,
    },
  },
  { cron: CRON_SCHEDULES.DAILY_MIDNIGHT },
  async ({ step, logger }) => {
    logger.info("Starting daily streak check");

    // Step 1: Get all users with active streaks
    const usersWithStreaks = await step.run("get-users-with-streaks", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.rewards.getUsersWithActiveStreaks);
      return [] as Array<{
        userId: string;
        streakDays: number;
        lastLoginDate: string;
        email: string;
      }>;
    });

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let maintained = 0;
    let broken = 0;
    let bonusAwarded = 0;

    // Step 2: Process each user
    for (const user of usersWithStreaks) {
      const result = await step.run(`process-streak-${user.userId}`, async () => {
        // Check if user logged in yesterday
        if (user.lastLoginDate === yesterday) {
          // Streak continues - check for milestone bonuses
          const newStreakDays = user.streakDays + 1;
          const milestones = [7, 14, 30, 60, 90, 180, 365];

          let bonusPoints = 0;
          if (milestones.includes(newStreakDays)) {
            // Award milestone bonus
            bonusPoints = newStreakDays * 5; // 5 points per day at milestone
          }

          return {
            status: "maintained",
            newStreakDays,
            bonusPoints,
          };
        } else if (user.lastLoginDate !== today) {
          // Streak broken
          return {
            status: "broken",
            newStreakDays: 0,
            bonusPoints: 0,
          };
        }

        return {
          status: "same",
          newStreakDays: user.streakDays,
          bonusPoints: 0,
        };
      });

      if (result.status === "maintained") {
        maintained++;
        if (result.bonusPoints > 0) {
          bonusAwarded++;
          // Send bonus points event
          await step.sendEvent(`streak-bonus-${user.userId}`, {
            name: "rewards/action.completed",
            data: {
              userId: user.userId,
              actionType: "streak_bonus",
              metadata: {
                streakDays: result.newStreakDays,
                bonusPoints: result.bonusPoints,
              },
            },
          });
        }
      } else if (result.status === "broken") {
        broken++;
      }

      // Update streak in database
      await step.run(`update-streak-${user.userId}`, async () => {
        // In production: update in Convex
        // await convex.mutation(api.rewards.updateStreak, {
        //   userId: user.userId,
        //   streakDays: result.newStreakDays,
        // });
      });
    }

    // Step 3: Send streak reminders to users who might break their streak
    await step.run("send-streak-reminders", async () => {
      // In production: find users who haven't logged in today but have streaks
      // const atRiskUsers = await convex.query(api.rewards.getStreaksAtRisk);
      //
      // for (const user of atRiskUsers) {
      //   await sendEvent({
      //     name: "notification/send",
      //     data: {
      //       userId: user.userId,
      //       type: "streak_reminder",
      //       title: "Don't lose your streak!",
      //       body: `You have a ${user.streakDays} day streak. Log in to keep it going!`,
      //       channels: ["push", "email"],
      //     },
      //   });
      // }
    });

    return {
      totalChecked: usersWithStreaks.length,
      maintained,
      broken,
      bonusAwarded,
      checkedAt: Date.now(),
    };
  }
);

// ============================================================================
// Process Redemption Function
// ============================================================================

/**
 * Process rewards redemption requests
 */
export const processRedemption = inngest.createFunction(
  {
    id: "pull/rewards/process-redemption",
    name: "Process Redemption",
    retries: DEFAULT_RETRY_CONFIG.attempts,
  },
  { event: "rewards/redemption.requested" },
  async ({ event, step, logger }) => {
    const { userId, redemptionId, itemId, pointsCost } = event.data;

    logger.info("Processing redemption", { userId, redemptionId, itemId });

    // Step 1: Validate user has enough points
    const validation = await step.run("validate-redemption", async () => {
      // In production: check balance and item availability
      // const balance = await convex.query(api.rewards.getPointsBalance, { userId });
      // const item = await convex.query(api.rewards.getCatalogItem, { itemId });
      return {
        hasEnoughPoints: true,
        itemAvailable: true,
        currentBalance: 5000,
      };
    });

    if (!validation.hasEnoughPoints) {
      await step.run("mark-failed-insufficient", async () => {
        // await convex.mutation(api.rewards.updateRedemptionStatus, {
        //   redemptionId,
        //   status: "failed",
        //   reason: "insufficient_points",
        // });
      });
      return { success: false, reason: "insufficient_points" };
    }

    if (!validation.itemAvailable) {
      await step.run("mark-failed-unavailable", async () => {
        // await convex.mutation(api.rewards.updateRedemptionStatus, {
        //   redemptionId,
        //   status: "failed",
        //   reason: "item_unavailable",
        // });
      });
      return { success: false, reason: "item_unavailable" };
    }

    // Step 2: Deduct points
    await step.run("deduct-points", async () => {
      // In production: deduct in Convex
      // await convex.mutation(api.rewards.deductPoints, {
      //   userId,
      //   points: pointsCost,
      //   redemptionId,
      // });
    });

    // Step 3: Fulfill redemption based on item type
    const fulfillment = await step.run("fulfill-redemption", async () => {
      // In production: process based on item type
      // Could be: discount code, crypto transfer, merchandise, etc.
      return {
        fulfilled: true,
        fulfillmentData: {
          code: `PULL-${redemptionId.slice(0, 8).toUpperCase()}`,
        },
      };
    });

    // Step 4: Update redemption status
    await step.run("update-status", async () => {
      // await convex.mutation(api.rewards.updateRedemptionStatus, {
      //   redemptionId,
      //   status: "completed",
      //   fulfillmentData: fulfillment.fulfillmentData,
      // });
    });

    // Step 5: Notify user
    await step.sendEvent("notify-redemption", {
      name: "notification/send",
      data: {
        userId,
        type: "order_filled", // Reusing notification type
        title: "Redemption Complete",
        body: `Your reward has been processed!`,
        data: { redemptionId, itemId },
        channels: ["in_app", "email"],
      },
    });

    return {
      success: true,
      redemptionId,
      newBalance: validation.currentBalance - pointsCost,
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function getTierBenefits(tier: string): string[] {
  const benefits: Record<string, string[]> = {
    bronze: ["Earn 1x points on all actions"],
    silver: ["1.1x points multiplier", "Early access to new features"],
    gold: [
      "1.25x points multiplier",
      "Priority support",
      "Exclusive market insights",
    ],
    platinum: [
      "1.5x points multiplier",
      "VIP support",
      "Reduced trading fees",
      "Monthly bonus points",
    ],
    diamond: [
      "2x points multiplier",
      "Personal account manager",
      "Zero trading fees",
      "Exclusive events access",
      "Early IPO access",
    ],
  };

  return benefits[tier] || [];
}

// ============================================================================
// Export Functions
// ============================================================================

export const rewardsFunctions = [
  processPointsEarning,
  checkStreaks,
  processRedemption,
];
