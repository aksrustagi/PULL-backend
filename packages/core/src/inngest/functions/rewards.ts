/**
 * Rewards Inngest Functions
 *
 * Event-driven functions for points earning, streaks, and tier management.
 */

import { NonRetryableError } from "inngest";
import {
  inngest,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
} from "../client";
import { EVENT_NAMES } from "../events";
import type { RewardsActionCompletedPayload } from "../events";

// =============================================================================
// Types
// =============================================================================

type RewardActionType =
  | "trade_executed"
  | "rwa_purchased"
  | "kyc_completed"
  | "referral_signup"
  | "daily_login"
  | "email_triaged"
  | "market_prediction"
  | "streak_milestone"
  | "tier_upgrade";

interface UserRewards {
  userId: string;
  points: number;
  lifetimePoints: number;
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  tierMultiplier: number;
  currentStreak: number;
  longestStreak: number;
  lastLoginDate?: string;
  streakFreezeAvailable: boolean;
  streakFreezeUsedAt?: string;
}

interface PointsTransaction {
  id: string;
  userId: string;
  actionType: RewardActionType;
  actionId: string;
  basePoints: number;
  multiplier: number;
  bonusPoints: number;
  totalPoints: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface TierConfig {
  tier: UserRewards["tier"];
  minLifetimePoints: number;
  multiplier: number;
  benefits: string[];
}

// =============================================================================
// Constants
// =============================================================================

const POINTS_CONFIG: Record<RewardActionType, number> = {
  trade_executed: 50,
  rwa_purchased: 100,
  kyc_completed: 500,
  referral_signup: 250,
  daily_login: 10,
  email_triaged: 5,
  market_prediction: 25,
  streak_milestone: 100, // Per milestone (7 days, 30 days, etc.)
  tier_upgrade: 200,
};

const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

const TIER_CONFIG: TierConfig[] = [
  {
    tier: "bronze",
    minLifetimePoints: 0,
    multiplier: 1.0,
    benefits: ["Basic access"],
  },
  {
    tier: "silver",
    minLifetimePoints: 1000,
    multiplier: 1.1,
    benefits: ["Basic access", "Priority support"],
  },
  {
    tier: "gold",
    minLifetimePoints: 5000,
    multiplier: 1.25,
    benefits: ["Basic access", "Priority support", "Reduced fees"],
  },
  {
    tier: "platinum",
    minLifetimePoints: 25000,
    multiplier: 1.5,
    benefits: ["All gold benefits", "Exclusive markets", "Early access"],
  },
  {
    tier: "diamond",
    minLifetimePoints: 100000,
    multiplier: 2.0,
    benefits: ["All platinum benefits", "Personal manager", "VIP events"],
  },
];

// =============================================================================
// Service Interfaces
// =============================================================================

interface ConvexService {
  // User rewards
  getUserRewards(userId: string): Promise<UserRewards | null>;
  updateUserRewards(
    userId: string,
    updates: Partial<UserRewards>
  ): Promise<void>;
  createPointsTransaction(
    transaction: Omit<PointsTransaction, "id" | "createdAt">
  ): Promise<string>;

  // Streak operations
  getAllActiveStreaks(): Promise<
    Array<{
      userId: string;
      currentStreak: number;
      lastLoginDate: string;
      streakFreezeAvailable: boolean;
    }>
  >;
  resetStreak(userId: string): Promise<void>;
  incrementStreak(userId: string): Promise<number>;

  // Tier operations
  getUserTier(userId: string): Promise<UserRewards["tier"]>;
  updateUserTier(userId: string, tier: UserRewards["tier"]): Promise<void>;
}

interface NotificationService {
  sendRewardNotification(params: {
    userId: string;
    type: "points_earned" | "tier_upgrade" | "streak_milestone" | "streak_broken";
    title: string;
    body: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

// =============================================================================
// Service Factory
// =============================================================================

interface Services {
  convex: ConvexService;
  notifications: NotificationService;
}

function getServices(): Services {
  return {
    convex: {
      async getUserRewards() {
        throw new Error("ConvexService not configured");
      },
      async updateUserRewards() {
        throw new Error("ConvexService not configured");
      },
      async createPointsTransaction() {
        throw new Error("ConvexService not configured");
      },
      async getAllActiveStreaks() {
        throw new Error("ConvexService not configured");
      },
      async resetStreak() {
        throw new Error("ConvexService not configured");
      },
      async incrementStreak() {
        throw new Error("ConvexService not configured");
      },
      async getUserTier() {
        throw new Error("ConvexService not configured");
      },
      async updateUserTier() {
        throw new Error("ConvexService not configured");
      },
    },
    notifications: {
      async sendRewardNotification() {
        throw new Error("NotificationService not configured");
      },
    },
  };
}

let servicesOverride: Services | null = null;

export function setServices(services: Services): void {
  servicesOverride = services;
}

export function clearServices(): void {
  servicesOverride = null;
}

function services(): Services {
  return servicesOverride ?? getServices();
}

// =============================================================================
// Helper Functions
// =============================================================================

function getTierForPoints(lifetimePoints: number): TierConfig {
  // Find the highest tier the user qualifies for
  for (let i = TIER_CONFIG.length - 1; i >= 0; i--) {
    if (lifetimePoints >= TIER_CONFIG[i].minLifetimePoints) {
      return TIER_CONFIG[i];
    }
  }
  return TIER_CONFIG[0];
}

function getStreakBonus(streak: number): number {
  // Bonus points based on streak length
  if (streak >= 365) return 50;
  if (streak >= 180) return 40;
  if (streak >= 90) return 30;
  if (streak >= 60) return 20;
  if (streak >= 30) return 15;
  if (streak >= 14) return 10;
  if (streak >= 7) return 5;
  return 0;
}

function isStreakMilestone(streak: number): boolean {
  return STREAK_MILESTONES.includes(streak);
}

// =============================================================================
// processPointsEarning Function
// =============================================================================

/**
 * Processes points earning when a user completes an action.
 *
 * Triggers:
 * - Event: "rewards/action.completed"
 *
 * Process:
 * 1. Calculate base points for action type
 * 2. Apply tier multiplier
 * 3. Apply any bonuses (streak, promotional, etc.)
 * 4. Credit points to user
 * 5. Check for tier upgrades
 */
export const processPointsEarning = inngest.createFunction(
  {
    id: "process-points-earning",
    name: "Process Points Earning",
    retries: RETRY_CONFIGS.critical.attempts, // Critical for user trust
    concurrency: [
      CONCURRENCY_CONFIGS.high,
      // Per-user concurrency to prevent race conditions
      {
        limit: 1,
        key: "event.data.userId",
        scope: "fn",
      },
    ],
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "process-points-earning",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.critical.attempts,
      });
    },
  },
  { event: EVENT_NAMES.REWARDS_ACTION_COMPLETED },
  async ({ event, step, logger }) => {
    const data = event.data as RewardsActionCompletedPayload;
    const { convex, notifications } = services();

    logger.info(`Processing points for user ${data.userId}, action: ${data.actionType}`);

    // Step 1: Get user's current rewards state
    const userRewards = await step.run("get-user-rewards", async () => {
      const rewards = await convex.getUserRewards(data.userId);

      if (!rewards) {
        // Initialize new user rewards
        const initialRewards: UserRewards = {
          userId: data.userId,
          points: 0,
          lifetimePoints: 0,
          tier: "bronze",
          tierMultiplier: 1.0,
          currentStreak: 0,
          longestStreak: 0,
          streakFreezeAvailable: false,
        };

        await convex.updateUserRewards(data.userId, initialRewards);
        return initialRewards;
      }

      return rewards;
    });

    // Step 2: Calculate points
    const pointsCalculation = await step.run("calculate-points", async () => {
      const basePoints = POINTS_CONFIG[data.actionType] ?? 0;

      if (basePoints === 0) {
        throw new NonRetryableError(
          `Unknown action type: ${data.actionType}`,
          "UNKNOWN_ACTION_TYPE"
        );
      }

      // Apply tier multiplier
      const tierMultiplier = userRewards.tierMultiplier;

      // Calculate streak bonus (only for daily_login)
      const streakBonus =
        data.actionType === "daily_login"
          ? getStreakBonus(userRewards.currentStreak)
          : 0;

      // Check for promotional multipliers in metadata
      const promoMultiplier =
        typeof data.metadata?.promoMultiplier === "number"
          ? data.metadata.promoMultiplier
          : 1;

      const totalMultiplier = tierMultiplier * promoMultiplier;
      const multipliedPoints = Math.floor(basePoints * totalMultiplier);
      const totalPoints = multipliedPoints + streakBonus;

      return {
        basePoints,
        multiplier: totalMultiplier,
        bonusPoints: streakBonus,
        totalPoints,
      };
    });

    // Step 3: Create transaction and credit points
    const transactionId = await step.run("credit-points", async () => {
      // Create transaction record
      const txId = await convex.createPointsTransaction({
        userId: data.userId,
        actionType: data.actionType,
        actionId: data.actionId,
        basePoints: pointsCalculation.basePoints,
        multiplier: pointsCalculation.multiplier,
        bonusPoints: pointsCalculation.bonusPoints,
        totalPoints: pointsCalculation.totalPoints,
        metadata: data.metadata,
      });

      // Update user points
      await convex.updateUserRewards(data.userId, {
        points: userRewards.points + pointsCalculation.totalPoints,
        lifetimePoints: userRewards.lifetimePoints + pointsCalculation.totalPoints,
      });

      return txId;
    });

    // Step 4: Check for tier upgrade
    const tierUpgrade = await step.run("check-tier-upgrade", async () => {
      const newLifetimePoints =
        userRewards.lifetimePoints + pointsCalculation.totalPoints;
      const newTierConfig = getTierForPoints(newLifetimePoints);

      if (newTierConfig.tier !== userRewards.tier) {
        // Upgrade tier
        await convex.updateUserRewards(data.userId, {
          tier: newTierConfig.tier,
          tierMultiplier: newTierConfig.multiplier,
        });

        // Send tier upgrade notification
        await notifications.sendRewardNotification({
          userId: data.userId,
          type: "tier_upgrade",
          title: `Congratulations! You've reached ${newTierConfig.tier.toUpperCase()} tier!`,
          body: `Your new multiplier is ${newTierConfig.multiplier}x. Benefits: ${newTierConfig.benefits.join(", ")}`,
          data: {
            previousTier: userRewards.tier,
            newTier: newTierConfig.tier,
            multiplier: newTierConfig.multiplier,
          },
        });

        // Award tier upgrade bonus points
        await inngest.send({
          name: EVENT_NAMES.REWARDS_ACTION_COMPLETED,
          data: {
            userId: data.userId,
            actionType: "tier_upgrade",
            actionId: `tier_upgrade_${newTierConfig.tier}_${Date.now()}`,
            metadata: {
              previousTier: userRewards.tier,
              newTier: newTierConfig.tier,
            },
            timestamp: new Date().toISOString(),
          },
        });

        return {
          upgraded: true,
          previousTier: userRewards.tier,
          newTier: newTierConfig.tier,
        };
      }

      return { upgraded: false };
    });

    // Step 5: Send points earned notification
    await step.run("send-notification", async () => {
      await notifications.sendRewardNotification({
        userId: data.userId,
        type: "points_earned",
        title: `+${pointsCalculation.totalPoints} points earned!`,
        body: `You earned points for: ${data.actionType.replace(/_/g, " ")}`,
        data: {
          transactionId,
          actionType: data.actionType,
          points: pointsCalculation.totalPoints,
          breakdown: pointsCalculation,
        },
      });
    });

    logger.info(
      `Points processed: ${pointsCalculation.totalPoints} for ${data.actionType}`
    );

    return {
      transactionId,
      pointsEarned: pointsCalculation.totalPoints,
      breakdown: pointsCalculation,
      tierUpgrade: tierUpgrade.upgraded ? tierUpgrade : null,
      newTotalPoints: userRewards.points + pointsCalculation.totalPoints,
    };
  }
);

// =============================================================================
// checkStreaks Function
// =============================================================================

/**
 * Checks and updates user login streaks.
 *
 * Triggers:
 * - Cron: Daily at midnight
 *
 * Process:
 * 1. Check all user login streaks
 * 2. Award streak bonuses for maintained streaks
 * 3. Reset broken streaks (unless freeze available)
 */
export const checkStreaks = inngest.createFunction(
  {
    id: "check-streaks",
    name: "Check Streaks",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [{ limit: 1 }], // Single instance
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "check-streaks",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { cron: "0 0 * * *" }, // Daily at midnight
  async ({ step, logger }) => {
    const { convex, notifications } = services();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let streaksChecked = 0;
    let streaksMaintained = 0;
    let streaksBroken = 0;
    let streaksUsedFreeze = 0;
    let milestonesAwarded = 0;

    // Step 1: Get all users with active streaks
    const activeStreaks = await step.run("get-active-streaks", async () => {
      return convex.getAllActiveStreaks();
    });

    logger.info(`Checking ${activeStreaks.length} active streaks`);
    streaksChecked = activeStreaks.length;

    // Step 2: Process each user's streak
    for (const userStreak of activeStreaks) {
      await step.run(`check-streak-${userStreak.userId}`, async () => {
        const lastLogin = new Date(userStreak.lastLoginDate);
        lastLogin.setHours(0, 0, 0, 0);

        const daysSinceLogin = Math.floor(
          (today.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceLogin === 0) {
          // User logged in today - streak maintained
          streaksMaintained++;

          // Check for streak milestones
          if (isStreakMilestone(userStreak.currentStreak)) {
            milestonesAwarded++;

            // Award milestone points
            await inngest.send({
              name: EVENT_NAMES.REWARDS_ACTION_COMPLETED,
              data: {
                userId: userStreak.userId,
                actionType: "streak_milestone" as RewardActionType,
                actionId: `streak_milestone_${userStreak.currentStreak}_${Date.now()}`,
                metadata: {
                  streakDays: userStreak.currentStreak,
                },
                timestamp: new Date().toISOString(),
              },
            });

            // Send milestone notification
            await notifications.sendRewardNotification({
              userId: userStreak.userId,
              type: "streak_milestone",
              title: `${userStreak.currentStreak} Day Streak! 🔥`,
              body: `Amazing! You've maintained a ${userStreak.currentStreak} day login streak!`,
              data: {
                streakDays: userStreak.currentStreak,
              },
            });
          }
        } else if (daysSinceLogin === 1) {
          // User missed today but logged in yesterday - still valid
          streaksMaintained++;
        } else if (daysSinceLogin > 1) {
          // Streak broken - check for freeze
          if (userStreak.streakFreezeAvailable) {
            // Use streak freeze
            streaksUsedFreeze++;
            await convex.updateUserRewards(userStreak.userId, {
              streakFreezeAvailable: false,
              streakFreezeUsedAt: new Date().toISOString(),
            });

            await notifications.sendRewardNotification({
              userId: userStreak.userId,
              type: "streak_milestone", // Reusing for freeze notification
              title: "Streak Freeze Used! ❄️",
              body: `Your ${userStreak.currentStreak} day streak was saved by a freeze!`,
              data: {
                streakDays: userStreak.currentStreak,
                frozenAt: today.toISOString(),
              },
            });
          } else {
            // Reset streak
            streaksBroken++;
            await convex.resetStreak(userStreak.userId);

            await notifications.sendRewardNotification({
              userId: userStreak.userId,
              type: "streak_broken",
              title: "Streak Broken 💔",
              body: `Your ${userStreak.currentStreak} day streak has ended. Log in today to start a new one!`,
              data: {
                previousStreak: userStreak.currentStreak,
                brokenAt: today.toISOString(),
              },
            });
          }
        }
      });
    }

    logger.info(
      `Streak check complete: ${streaksMaintained} maintained, ${streaksBroken} broken, ${streaksUsedFreeze} used freeze`
    );

    return {
      streaksChecked,
      streaksMaintained,
      streaksBroken,
      streaksUsedFreeze,
      milestonesAwarded,
    };
  }
);

// =============================================================================
// Exports
// =============================================================================

export const rewardsFunctions = [processPointsEarning, checkStreaks];
