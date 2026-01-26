/**
 * Gamification Activities
 * All activities for the advanced points economy system
 */

import { Context } from "@temporalio/activity";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { Id } from "@pull/db/convex/_generated/dataModel";
import { NotificationClient } from "../../services/notifications/client";

// Initialize Convex client
const getConvexClient = () => {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL environment variable is not set");
  }
  return new ConvexHttpClient(url);
};

// Initialize Notification client
const getNotificationClient = () => {
  return new NotificationClient({
    provider: process.env.NOTIFICATION_PROVIDER as "firebase" | "onesignal" | "both" ?? "firebase",
    firebase: process.env.FIREBASE_PROJECT_ID ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
      privateKey: process.env.FIREBASE_PRIVATE_KEY ?? "",
    } : undefined,
    oneSignal: process.env.ONESIGNAL_APP_ID ? {
      appId: process.env.ONESIGNAL_APP_ID,
      apiKey: process.env.ONESIGNAL_API_KEY ?? "",
    } : undefined,
  });
};

// ============================================================================
// Types
// ============================================================================

export interface PointsConfig {
  actionType: string;
  basePoints: number;
  description: string;
  category: string;
  multipliers: {
    tierBonus: boolean;
    streakBonus: boolean;
    volumeBonus: boolean;
    seasonalBonus: boolean;
  };
  conditions?: {
    minAmount?: number;
    maxDaily?: number;
    requiresKyc?: boolean;
    requiredTier?: string;
  };
  cooldownSeconds: number;
  isActive: boolean;
}

export interface UserTier {
  tierLevel: string;
  lifetimePoints: number;
  multiplier: number;
  nextTier?: string;
  pointsToNextTier: number;
}

export interface UserStreak {
  streakType: string;
  currentCount: number;
  longestCount: number;
  lastActionAt: number;
  lastActionDate: string;
  multiplierActive: boolean;
  frozenUntil?: number;
}

export interface Multiplier {
  id: string;
  name: string;
  multiplierValue: number;
  appliesTo: string[];
  startTime: number;
  endTime: number;
}

export interface TierBenefit {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface Quest {
  questId: string;
  name: string;
  targetValue: number;
  pointsReward: number;
  expiresAt: number;
}

export interface Achievement {
  id: string;
  name: string;
  rarity: string;
  pointsReward: number;
  tokenReward?: number;
}

// ============================================================================
// POINTS CONFIG ACTIVITIES
// ============================================================================

/**
 * Get points configuration for an action
 */
export async function getPointsConfig(action: string): Promise<PointsConfig | null> {
  console.log(`[Gamification Activity] Getting points config for action: ${action}`);

  // Default configurations
  const defaultConfigs: Record<string, PointsConfig> = {
    daily_login: {
      actionType: "daily_login",
      basePoints: 10,
      description: "Daily login bonus",
      category: "engagement",
      multipliers: { tierBonus: true, streakBonus: true, volumeBonus: false, seasonalBonus: true },
      cooldownSeconds: 86400,
      isActive: true,
    },
    trade_executed: {
      actionType: "trade_executed",
      basePoints: 5,
      description: "Points for executing a trade",
      category: "trading",
      multipliers: { tierBonus: true, streakBonus: true, volumeBonus: true, seasonalBonus: true },
      cooldownSeconds: 0,
      isActive: true,
    },
    deposit: {
      actionType: "deposit",
      basePoints: 50,
      description: "Points for making a deposit",
      category: "trading",
      multipliers: { tierBonus: true, streakBonus: false, volumeBonus: true, seasonalBonus: true },
      cooldownSeconds: 0,
      isActive: true,
    },
    referral_signup: {
      actionType: "referral_signup",
      basePoints: 100,
      description: "Points for successful referral",
      category: "referral",
      multipliers: { tierBonus: true, streakBonus: false, volumeBonus: false, seasonalBonus: true },
      cooldownSeconds: 0,
      isActive: true,
    },
    rwa_purchase: {
      actionType: "rwa_purchase",
      basePoints: 15,
      description: "Points for RWA purchase",
      category: "trading",
      multipliers: { tierBonus: true, streakBonus: true, volumeBonus: true, seasonalBonus: true },
      cooldownSeconds: 0,
      isActive: true,
    },
    prediction_win: {
      actionType: "prediction_win",
      basePoints: 25,
      description: "Points for winning a prediction",
      category: "trading",
      multipliers: { tierBonus: true, streakBonus: true, volumeBonus: false, seasonalBonus: true },
      cooldownSeconds: 0,
      isActive: true,
    },
    quest_completed: {
      actionType: "quest_completed",
      basePoints: 0, // Quest defines its own reward
      description: "Quest completion reward",
      category: "engagement",
      multipliers: { tierBonus: false, streakBonus: false, volumeBonus: false, seasonalBonus: false },
      cooldownSeconds: 0,
      isActive: true,
    },
    achievement_unlocked: {
      actionType: "achievement_unlocked",
      basePoints: 0, // Achievement defines its own reward
      description: "Achievement unlock reward",
      category: "milestone",
      multipliers: { tierBonus: false, streakBonus: false, volumeBonus: false, seasonalBonus: false },
      cooldownSeconds: 0,
      isActive: true,
    },
  };

  return defaultConfigs[action] ?? null;
}

// ============================================================================
// POINTS BALANCE ACTIVITIES
// ============================================================================

/**
 * Get user's points balance
 */
export async function getUserPointsBalance(userId: string): Promise<number> {
  console.log(`[Gamification Activity] Getting points balance for ${userId}`);

  try {
    const convex = getConvexClient();
    const balance = await convex.query(api.rewards.getBalance, {
      userId: userId as Id<"users">,
    });
    return balance?.available ?? 0;
  } catch (error) {
    console.error(`[Gamification Activity] Error getting points balance:`, error);
    throw error;
  }
}

/**
 * Credit points to user
 */
export async function creditPoints(input: {
  userId: string;
  amount: number;
  action: string;
  transactionId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Gamification Activity] Crediting ${input.amount} points to ${input.userId}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.rewards.awardPoints, {
      userId: input.userId as Id<"users">,
      type: mapActionToType(input.action),
      amount: input.amount,
      description: `Points earned for ${input.action}`,
      referenceType: "transaction",
      referenceId: input.transactionId,
      metadata: input.metadata,
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error crediting points:`, error);
    throw error;
  }
}

// Helper to map action types to valid reward types
function mapActionToType(action: string): "trade" | "referral" | "signup" | "daily_login" | "daily_streak" | "deposit" | "achievement" | "promo" | "admin_adjustment" | "other" {
  const actionMap: Record<string, "trade" | "referral" | "signup" | "daily_login" | "daily_streak" | "deposit" | "achievement" | "promo" | "admin_adjustment" | "other"> = {
    daily_login: "daily_login",
    trade_executed: "trade",
    deposit: "deposit",
    referral_signup: "referral",
    rwa_purchase: "trade",
    prediction_win: "trade",
    quest_completed: "achievement",
    achievement_unlocked: "achievement",
  };
  return actionMap[action] ?? "other";
}

/**
 * Record points transaction
 */
export async function recordPointsTransaction(input: {
  userId: string;
  transactionId: string;
  type: string;
  amount: number;
  balance: number;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Gamification Activity] Recording transaction ${input.transactionId}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.audit.log, {
      userId: input.userId as Id<"users">,
      action: "points.transaction",
      resourceType: "pointsTransactions",
      resourceId: input.transactionId,
      metadata: {
        type: input.type,
        amount: input.amount,
        balance: input.balance,
        description: input.description,
        ...input.metadata,
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error recording transaction:`, error);
    throw error;
  }
}

// ============================================================================
// TIER ACTIVITIES
// ============================================================================

/**
 * Get user's current tier
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  console.log(`[Gamification Activity] Getting tier for ${userId}`);

  try {
    const convex = getConvexClient();
    const tierInfo = await convex.query(api.gamification.getUserTier, {
      userId: userId as Id<"users">,
    });

    const tierMultipliers: Record<string, number> = {
      bronze: 1.0,
      silver: 1.1,
      gold: 1.25,
      platinum: 1.5,
      diamond: 2.0,
    };

    return {
      tierLevel: tierInfo.currentTier,
      lifetimePoints: tierInfo.lifetimePoints,
      multiplier: tierMultipliers[tierInfo.currentTier] ?? 1.0,
      nextTier: tierInfo.nextTier ?? undefined,
      pointsToNextTier: tierInfo.pointsToNextTier,
    };
  } catch (error) {
    console.error(`[Gamification Activity] Error getting tier:`, error);
    // Return default tier on error
    return {
      tierLevel: "bronze",
      lifetimePoints: 0,
      multiplier: 1.0,
      nextTier: "silver",
      pointsToNextTier: 1000,
    };
  }
}

/**
 * Get user's lifetime points
 */
export async function getUserLifetimePoints(userId: string): Promise<number> {
  console.log(`[Gamification Activity] Getting lifetime points for ${userId}`);

  try {
    const convex = getConvexClient();
    const tierInfo = await convex.query(api.gamification.getUserTier, {
      userId: userId as Id<"users">,
    });
    return tierInfo.lifetimePoints;
  } catch (error) {
    console.error(`[Gamification Activity] Error getting lifetime points:`, error);
    return 0;
  }
}

/**
 * Calculate tier for given points
 */
export async function calculateTierForPoints(points: number): Promise<{
  tier: string;
  multiplier: number;
}> {
  const tiers = [
    { tier: "diamond", points: 100000, multiplier: 2.5 },
    { tier: "platinum", points: 50000, multiplier: 2.0 },
    { tier: "gold", points: 25000, multiplier: 1.5 },
    { tier: "silver", points: 10000, multiplier: 1.25 },
    { tier: "bronze", points: 0, multiplier: 1.0 },
  ];

  for (const t of tiers) {
    if (points >= t.points) {
      return { tier: t.tier, multiplier: t.multiplier };
    }
  }

  return { tier: "bronze", multiplier: 1.0 };
}

/**
 * Check if user should be upgraded to a new tier
 */
export async function checkTierUpgrade(
  userId: string,
  currentBalance: number
): Promise<{ shouldUpgrade: boolean; newTier?: string; newMultiplier?: number }> {
  console.log(`[Gamification Activity] Checking tier upgrade for ${userId}`);

  const currentTier = await getUserTier(userId);
  const calculated = await calculateTierForPoints(currentBalance);

  const tierOrder = ["bronze", "silver", "gold", "platinum", "diamond"];
  const currentIndex = tierOrder.indexOf(currentTier.tierLevel);
  const newIndex = tierOrder.indexOf(calculated.tier);

  if (newIndex > currentIndex) {
    return {
      shouldUpgrade: true,
      newTier: calculated.tier,
      newMultiplier: calculated.multiplier,
    };
  }

  return { shouldUpgrade: false };
}

/**
 * Update user's tier
 */
export async function updateUserTier(
  userId: string,
  newTier: string,
  lifetimePoints: number
): Promise<void> {
  console.log(`[Gamification Activity] Updating tier for ${userId} to ${newTier}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.gamification.updateUserTier, {
      userId: userId as Id<"users">,
    });

    // Log the tier upgrade
    await convex.mutation(api.audit.log, {
      userId: userId as Id<"users">,
      action: "tier.upgraded",
      resourceType: "tiers",
      resourceId: userId,
      metadata: {
        newTier,
        lifetimePoints,
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error updating tier:`, error);
    throw error;
  }
}

/**
 * Get tier benefits
 */
export async function getTierBenefits(tier: string): Promise<TierBenefit[]> {
  const benefits: Record<string, TierBenefit[]> = {
    bronze: [
      { id: "basic_support", name: "Basic Support", description: "Email support", type: "support" },
    ],
    silver: [
      { id: "basic_support", name: "Basic Support", description: "Email support", type: "support" },
      { id: "silver_badge", name: "Silver Badge", description: "Profile badge", type: "badge" },
    ],
    gold: [
      { id: "priority_support", name: "Priority Support", description: "24h response", type: "support" },
      { id: "gold_badge", name: "Gold Badge", description: "Profile badge", type: "badge" },
      { id: "early_access", name: "Early Access", description: "New features", type: "access" },
    ],
    platinum: [
      { id: "vip_support", name: "VIP Support", description: "4h response", type: "support" },
      { id: "platinum_badge", name: "Platinum Badge", description: "Profile badge", type: "badge" },
      { id: "early_access", name: "Early Access", description: "New features", type: "access" },
      { id: "fee_discount", name: "Fee Discount", description: "10% off fees", type: "discount" },
    ],
    diamond: [
      { id: "dedicated_support", name: "Dedicated Support", description: "1h response", type: "support" },
      { id: "diamond_badge", name: "Diamond Badge", description: "Profile badge", type: "badge" },
      { id: "early_access", name: "Early Access", description: "New features", type: "access" },
      { id: "fee_discount", name: "Fee Discount", description: "25% off fees", type: "discount" },
      { id: "exclusive_events", name: "Exclusive Events", description: "VIP events", type: "access" },
    ],
  };

  return benefits[tier] ?? [];
}

/**
 * Grant tier benefits to user
 */
export async function grantTierBenefits(
  userId: string,
  benefit: TierBenefit
): Promise<void> {
  console.log(`[Gamification Activity] Granting benefit ${benefit.name} to ${userId}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.audit.log, {
      userId: userId as Id<"users">,
      action: "tier.benefit_granted",
      resourceType: "tierBenefits",
      resourceId: benefit.id,
      metadata: {
        benefitName: benefit.name,
        benefitType: benefit.type,
        description: benefit.description,
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error granting benefit:`, error);
    throw error;
  }
}

/**
 * Revoke tier benefits from user
 */
export async function revokeTierBenefits(
  userId: string,
  benefit: TierBenefit
): Promise<void> {
  console.log(`[Gamification Activity] Revoking benefit ${benefit.name} from ${userId}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.audit.log, {
      userId: userId as Id<"users">,
      action: "tier.benefit_revoked",
      resourceType: "tierBenefits",
      resourceId: benefit.id,
      metadata: {
        benefitName: benefit.name,
        benefitType: benefit.type,
        description: benefit.description,
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error revoking benefit:`, error);
    throw error;
  }
}

// ============================================================================
// STREAK ACTIVITIES
// ============================================================================

/**
 * Get user streak by type
 */
export async function getUserStreak(
  userId: string,
  streakType: string | null
): Promise<UserStreak | null> {
  console.log(`[Gamification Activity] Getting streak for ${userId}, type: ${streakType}`);

  if (!streakType) return null;

  try {
    const convex = getConvexClient();
    const streak = await convex.query(api.gamification.getStreak, {
      userId: userId as Id<"users">,
      streakType,
    });

    if (!streak) {
      return null;
    }

    return {
      streakType: streak.streakType,
      currentCount: streak.currentCount,
      longestCount: streak.longestCount,
      lastActionAt: streak.lastActionAt,
      lastActionDate: new Date(streak.lastActionAt).toISOString().split("T")[0]!,
      multiplierActive: streak.currentMultiplier > 1.0,
      frozenUntil: streak.frozenUntil,
    };
  } catch (error) {
    console.error(`[Gamification Activity] Error getting streak:`, error);
    return null;
  }
}

/**
 * Get streak multiplier based on streak count
 */
export async function getStreakMultiplier(streakCount: number): Promise<number> {
  if (streakCount >= 30) return 2.0;
  if (streakCount >= 14) return 1.5;
  if (streakCount >= 7) return 1.25;
  return 1.0;
}

/**
 * Update user streak
 */
export async function updateStreak(
  userId: string,
  streakType: string
): Promise<{ currentCount: number; wasReset: boolean; isNewRecord: boolean }> {
  console.log(`[Gamification Activity] Updating streak for ${userId}, type: ${streakType}`);

  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.gamification.updateStreak, {
      userId: userId as Id<"users">,
      streakType,
    });

    return {
      currentCount: result.currentCount,
      wasReset: result.streakBroken ?? false,
      isNewRecord: result.currentCount === result.longestCount && result.currentCount > 1,
    };
  } catch (error) {
    console.error(`[Gamification Activity] Error updating streak:`, error);
    throw error;
  }
}

/**
 * Get all potentially broken streaks
 */
export async function getAllBrokenStreaks(): Promise<
  Array<{
    userId: string;
    streakType: string;
    currentCount: number;
    longestCount: number;
    lastActionAt: number;
    frozenUntil?: number;
  }>
> {
  console.log(`[Gamification Activity] Getting all broken streaks`);

  try {
    const convex = getConvexClient();
    // Call internal mutation to check and get broken streaks
    const result = await convex.mutation(api.gamification.checkBrokenStreaks, {});

    // Return empty array as the mutation handles the reset internally
    // In a real scenario, we might have a query that returns streaks about to break
    return [];
  } catch (error) {
    console.error(`[Gamification Activity] Error getting broken streaks:`, error);
    return [];
  }
}

/**
 * Reset a streak
 */
export async function resetStreak(userId: string, streakType: string): Promise<void> {
  console.log(`[Gamification Activity] Resetting streak for ${userId}, type: ${streakType}`);

  try {
    const convex = getConvexClient();
    // Update streak with a reset - the mutation handles reset logic when streak is broken
    await convex.mutation(api.audit.log, {
      userId: userId as Id<"users">,
      action: "streak.reset",
      resourceType: "streaks",
      resourceId: `${userId}_${streakType}`,
      metadata: {
        streakType,
        resetAt: Date.now(),
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error resetting streak:`, error);
    throw error;
  }
}

/**
 * Get users who need streak expiry warnings
 */
export async function getStreakExpiryNotifications(): Promise<
  Array<{
    userId: string;
    streakType: string;
    currentCount: number;
    expiresIn: number;
  }>
> {
  console.log(`[Gamification Activity] Getting streak expiry notifications`);

  try {
    // Query for streaks that are about to expire (e.g., within 6 hours of breaking)
    // This would require a custom Convex query - for now return empty
    // In production, implement a query that finds streaks where:
    // lastActionAt < (now - 18 hours) AND lastActionAt > (now - 24 hours)
    return [];
  } catch (error) {
    console.error(`[Gamification Activity] Error getting streak expiry notifications:`, error);
    return [];
  }
}

// ============================================================================
// MULTIPLIER ACTIVITIES
// ============================================================================

/**
 * Get active multipliers for user
 */
export async function getActiveMultipliers(userId: string): Promise<Multiplier[]> {
  console.log(`[Gamification Activity] Getting multipliers for ${userId}`);

  try {
    const convex = getConvexClient();
    const tierInfo = await convex.query(api.gamification.getUserTier, {
      userId: userId as Id<"users">,
    });

    const multipliers: Multiplier[] = [];
    const now = Date.now();

    // Add tier multiplier if applicable
    if (tierInfo.benefits?.pointsMultiplier && tierInfo.benefits.pointsMultiplier > 1) {
      multipliers.push({
        id: `tier_${tierInfo.currentTier}`,
        name: `${tierInfo.currentTier.charAt(0).toUpperCase() + tierInfo.currentTier.slice(1)} Tier Bonus`,
        multiplierValue: tierInfo.benefits.pointsMultiplier,
        appliesTo: ["all"],
        startTime: 0,
        endTime: Number.MAX_SAFE_INTEGER,
      });
    }

    return multipliers;
  } catch (error) {
    console.error(`[Gamification Activity] Error getting multipliers:`, error);
    return [];
  }
}

/**
 * Record multiplier usage
 */
export async function recordMultiplierUsage(
  userId: string,
  multiplierName: string,
  transactionId: string
): Promise<void> {
  console.log(`[Gamification Activity] Recording multiplier usage: ${multiplierName}`);

  try {
    const convex = getConvexClient();
    await convex.mutation(api.audit.log, {
      userId: userId as Id<"users">,
      action: "multiplier.used",
      resourceType: "multipliers",
      resourceId: multiplierName,
      metadata: {
        multiplierName,
        transactionId,
        usedAt: Date.now(),
      },
    });
  } catch (error) {
    console.error(`[Gamification Activity] Error recording multiplier usage:`, error);
    throw error;
  }
}

// ============================================================================
// QUEST ACTIVITIES
// ============================================================================

/**
 * Get active quest definitions
 */
export async function getActiveQuestDefinitions(category: string): Promise<Quest[]> {
  console.log(`[Gamification Activity] Getting quest definitions for category: ${category}`);
  // TODO: Call Convex query
  return [];
}

/**
 * Get active user quests
 */
export async function getActiveUserQuests(
  userId: string,
  category?: string
): Promise<Quest[]> {
  console.log(`[Gamification Activity] Getting active quests for ${userId}`);
  // TODO: Call Convex query
  return [];
}

/**
 * Assign quests to user
 */
export async function assignQuestsToUser(
  userId: string,
  quests: Quest[]
): Promise<Quest[]> {
  console.log(`[Gamification Activity] Assigning ${quests.length} quests to ${userId}`);
  // TODO: Call Convex mutation
  return quests;
}

/**
 * Update quest progress
 */
export async function updateQuestProgress(
  userId: string,
  questType: string,
  incrementValue: number
): Promise<{ updated: string[]; completed: string[] }> {
  console.log(`[Gamification Activity] Updating quest progress for ${userId}`);
  // TODO: Call Convex mutation
  return { updated: [], completed: [] };
}

/**
 * Complete a quest
 */
export async function completeQuest(
  userId: string,
  questId: string
): Promise<{
  questName: string;
  progress: number;
  targetValue: number;
  isCompleted: boolean;
  rewards: { points: number; tokens?: number; badge?: string };
}> {
  console.log(`[Gamification Activity] Completing quest ${questId} for ${userId}`);
  // TODO: Call Convex mutation
  return {
    questName: "Test Quest",
    progress: 10,
    targetValue: 10,
    isCompleted: true,
    rewards: { points: 100 },
  };
}

/**
 * Claim quest reward
 */
export async function claimQuestReward(
  userId: string,
  questId: string
): Promise<{ points: number; tokens?: number; badge?: string }> {
  console.log(`[Gamification Activity] Claiming quest reward ${questId} for ${userId}`);
  // TODO: Call Convex mutation
  return { points: 100 };
}

/**
 * Expire old quests
 */
export async function expireQuests(batchSize: number): Promise<{
  expiredCount: number;
  usersAffected: number;
  userIds: string[];
  questsByUser: Record<string, string[]>;
}> {
  console.log(`[Gamification Activity] Expiring quests, batch size: ${batchSize}`);
  // TODO: Call Convex mutation
  return { expiredCount: 0, usersAffected: 0, userIds: [], questsByUser: {} };
}

// ============================================================================
// ACHIEVEMENT ACTIVITIES
// ============================================================================

/**
 * Check if achievements should be unlocked
 */
export async function checkAchievementUnlock(
  userId: string,
  achievementType: string,
  currentValue: number
): Promise<{ checked: number; unlocked: Achievement[] }> {
  console.log(`[Gamification Activity] Checking achievements for ${userId}`);
  // TODO: Call Convex query
  return { checked: 0, unlocked: [] };
}

/**
 * Unlock an achievement
 */
export async function unlockAchievement(
  userId: string,
  achievementId: string
): Promise<void> {
  console.log(`[Gamification Activity] Unlocking achievement ${achievementId} for ${userId}`);
  // TODO: Call Convex mutation
}

/**
 * Claim achievement reward
 */
export async function claimAchievementReward(
  userId: string,
  achievementId: string
): Promise<{ points: number; tokens?: number }> {
  console.log(`[Gamification Activity] Claiming achievement ${achievementId} for ${userId}`);
  // TODO: Call Convex mutation
  return { points: 50 };
}

/**
 * Get unclaimed achievements
 */
export async function getUnclaimedAchievements(
  userId: string
): Promise<Achievement[]> {
  console.log(`[Gamification Activity] Getting unclaimed achievements for ${userId}`);
  // TODO: Call Convex query
  return [];
}

/**
 * Update achievement progress
 */
export async function updateAchievementProgress(
  userId: string,
  achievementType: string,
  currentValue: number
): Promise<{ updated: string[]; unlocked: string[] }> {
  console.log(`[Gamification Activity] Updating achievement progress for ${userId}`);
  // TODO: Call Convex mutation
  return { updated: [], unlocked: [] };
}

// ============================================================================
// COMPETITION ACTIVITIES
// ============================================================================

/**
 * Get competition details
 */
export async function getCompetition(competitionId: string): Promise<{
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  prizePool: number;
  prizeDistribution: Array<{
    rankStart: number;
    rankEnd: number;
    pointsPrize: number;
    tokenPrize?: number;
    specialPrize?: string;
  }>;
  participantCount: number;
  totalVolume: number;
  status: string;
} | null> {
  console.log(`[Gamification Activity] Getting competition: ${competitionId}`);
  // TODO: Call Convex query
  return null;
}

/**
 * Create a competition
 */
export async function createCompetition(input: {
  competitionId: string;
  name: string;
  description: string;
  type: string;
  scoringType: string;
  startTime: number;
  endTime: number;
  prizePool: number;
  prizeDistribution: Array<{
    rankStart: number;
    rankEnd: number;
    pointsPrize: number;
    tokenPrize?: number;
  }>;
}): Promise<{ id: string }> {
  console.log(`[Gamification Activity] Creating competition: ${input.competitionId}`);
  // TODO: Call Convex mutation
  return { id: input.competitionId };
}

/**
 * Start a competition
 */
export async function startCompetition(competitionId: string): Promise<void> {
  console.log(`[Gamification Activity] Starting competition: ${competitionId}`);
  // TODO: Call Convex mutation
}

/**
 * End a competition
 */
export async function endCompetition(competitionId: string): Promise<void> {
  console.log(`[Gamification Activity] Ending competition: ${competitionId}`);
  // TODO: Call Convex mutation
}

/**
 * Get all active competitions
 */
export async function getAllActiveCompetitions(): Promise<string[]> {
  console.log(`[Gamification Activity] Getting all active competitions`);
  // TODO: Call Convex query
  return [];
}

/**
 * Join a competition
 */
export async function joinCompetition(
  userId: string,
  competitionId: string
): Promise<{ initialRank: number }> {
  console.log(`[Gamification Activity] User ${userId} joining competition ${competitionId}`);
  // TODO: Call Convex mutation
  return { initialRank: 0 };
}

/**
 * Leave a competition
 */
export async function leaveCompetition(
  userId: string,
  competitionId: string
): Promise<void> {
  console.log(`[Gamification Activity] User ${userId} leaving competition ${competitionId}`);
  // TODO: Call Convex mutation
}

/**
 * Update participant score
 */
export async function updateParticipantScore(
  userId: string,
  competitionId: string,
  scoreIncrement: number,
  activityType: string
): Promise<{
  previousScore: number;
  newScore: number;
  previousRank?: number;
  newRank?: number;
}> {
  console.log(`[Gamification Activity] Updating score for ${userId} in ${competitionId}`);
  // TODO: Call Convex mutation
  return { previousScore: 0, newScore: scoreIncrement };
}

/**
 * Update competition score from workflow
 */
export async function updateCompetitionScore(
  userId: string,
  action: string,
  points: number,
  metadata: Record<string, unknown>
): Promise<{ updated: boolean }> {
  console.log(`[Gamification Activity] Updating competition score for ${userId}`);
  // TODO: Call Convex mutation for all active competitions
  return { updated: false };
}

/**
 * Get competition leaderboard
 */
export async function getCompetitionLeaderboard(
  competitionId: string,
  limit: number
): Promise<
  Array<{
    rank: number;
    userId: string;
    username?: string;
    score: number;
  }>
> {
  console.log(`[Gamification Activity] Getting leaderboard for ${competitionId}`);
  // TODO: Call Convex query
  return [];
}

/**
 * Update leaderboard ranks
 */
export async function updateLeaderboardRanks(competitionId: string): Promise<void> {
  console.log(`[Gamification Activity] Updating leaderboard ranks for ${competitionId}`);
  // TODO: Call Convex mutation
}

/**
 * Calculate prize distribution
 */
export async function calculatePrizeDistribution(
  competitionId: string,
  prizeDistribution: Array<{
    rankStart: number;
    rankEnd: number;
    pointsPrize: number;
    tokenPrize?: number;
    specialPrize?: string;
  }>,
  leaderboard: Array<{ rank: number; userId: string; score: number }>
): Promise<
  Array<{
    userId: string;
    rank: number;
    pointsPrize: number;
    tokenPrize?: number;
    specialPrize?: string;
  }>
> {
  console.log(`[Gamification Activity] Calculating prizes for ${competitionId}`);

  const prizes: Array<{
    userId: string;
    rank: number;
    pointsPrize: number;
    tokenPrize?: number;
    specialPrize?: string;
  }> = [];

  for (const participant of leaderboard) {
    const prizeConfig = prizeDistribution.find(
      (p) => participant.rank >= p.rankStart && participant.rank <= p.rankEnd
    );

    if (prizeConfig) {
      prizes.push({
        userId: participant.userId,
        rank: participant.rank,
        pointsPrize: prizeConfig.pointsPrize,
        tokenPrize: prizeConfig.tokenPrize,
        specialPrize: prizeConfig.specialPrize,
      });
    }
  }

  return prizes;
}

/**
 * Award prizes to winners
 */
export async function awardPrizes(
  competitionId: string,
  userId: string,
  prizes: {
    rank: number;
    points: number;
    tokens?: number;
    special?: string;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Awarding prizes to ${userId} in ${competitionId}`);
  // TODO: Call Convex mutation
}

/**
 * Claim competition prize
 */
export async function claimCompetitionPrize(
  userId: string,
  competitionId: string
): Promise<{ points: number; tokens?: number; special?: string }> {
  console.log(`[Gamification Activity] Claiming prize for ${userId} in ${competitionId}`);
  // TODO: Call Convex mutation
  return { points: 0 };
}

// ============================================================================
// DEPRECIATION ACTIVITIES
// ============================================================================

/**
 * Get inactive user balances
 */
export async function getInactiveUserBalances(input: {
  inactivityDays: number;
  maxInactivityDays?: number;
  minBalance: number;
}): Promise<
  Array<{
    userId: string;
    available: number;
    tierLevel?: string;
    hasActiveStaking?: boolean;
    hasActivePremium?: boolean;
  }>
> {
  console.log(`[Gamification Activity] Getting inactive user balances`);
  // TODO: Call Convex query
  return [];
}

/**
 * Depreciate user points
 */
export async function depreciateUserPoints(input: {
  userId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  console.log(`[Gamification Activity] Depreciating ${input.amount} points for ${input.userId}`);
  // TODO: Call Convex mutation
}

/**
 * Get depreciation configuration
 */
export async function getDepreciationConfig(): Promise<{
  rate: number;
  minThreshold: number;
  inactivityDays: number;
}> {
  return {
    rate: 0.05,
    minThreshold: 1000,
    inactivityDays: 90,
  };
}

// ============================================================================
// TOKEN ACTIVITIES
// ============================================================================

/**
 * Credit tokens to user
 */
export async function creditTokens(
  userId: string,
  amount: number,
  transactionId: string
): Promise<void> {
  console.log(`[Gamification Activity] Crediting ${amount} tokens to ${userId}`);
  // TODO: Call Convex mutation or blockchain interaction
}

// ============================================================================
// NOTIFICATION ACTIVITIES
// ============================================================================

/**
 * Send points notification
 */
export async function sendPointsNotification(
  userId: string,
  data: {
    type: string;
    action: string;
    points: number;
    newBalance: number;
    multipliers?: unknown;
    tierUpgraded?: boolean;
    newTier?: string;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending points notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send tier upgrade notification
 */
export async function sendTierUpgradeNotification(
  userId: string,
  data: {
    previousTier: string;
    newTier: string;
    newMultiplier: number;
    newBenefits?: string[];
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending tier upgrade notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send tier downgrade warning
 */
export async function sendTierDowngradeWarning(
  userId: string,
  data: {
    currentTier: string;
    pointsNeeded: number;
    daysUntilDowngrade: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending tier downgrade warning to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send tier downgrade notification
 */
export async function sendTierDowngradeNotification(
  userId: string,
  data: {
    previousTier: string;
    newTier: string;
    newMultiplier: number;
    lostBenefits: string[];
    pointsToRecover: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending tier downgrade notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send tier maintained notification
 */
export async function sendTierMaintainedNotification(
  userId: string,
  data: {
    tier: string;
    periodPoints: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending tier maintained notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send streak notification
 */
export async function sendStreakNotification(
  userId: string,
  data: {
    streakType: string;
    days: number;
    bonusPoints: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending streak notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send streak expiry warning
 */
export async function sendStreakExpiryWarning(
  userId: string,
  data: {
    streakType: string;
    currentCount: number;
    expiresIn: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending streak expiry warning to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send streak broken notification
 */
export async function sendStreakBrokenNotification(
  userId: string,
  data: {
    streakType: string;
    previousCount: number;
    longestCount: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending streak broken notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send quest assigned notification
 */
export async function sendQuestAssignedNotification(
  userId: string,
  data: {
    quests: Array<{
      questId: string;
      name: string;
      pointsReward: number;
    }>;
    totalPotentialPoints: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending quest assigned notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send quest completion notification
 */
export async function sendQuestCompletionNotification(
  userId: string,
  data: string | { questId: string; questName: string; rewards: unknown }
): Promise<void> {
  console.log(`[Gamification Activity] Sending quest completion notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send quest expired notification
 */
export async function sendQuestExpiredNotification(
  userId: string,
  data: {
    expiredCount: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending quest expired notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send achievement unlocked notification
 */
export async function sendAchievementUnlockedNotification(
  userId: string,
  data: {
    achievementId: string;
    achievementName: string;
    rarity: string;
    rewards: { points: number; tokens?: number };
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending achievement notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send achievement notification (simple version)
 */
export async function sendAchievementNotification(
  userId: string,
  achievementId: string
): Promise<void> {
  console.log(`[Gamification Activity] Sending achievement notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send competition start notification
 */
export async function sendCompetitionStartNotification(
  competitionId: string,
  data: {
    competitionName: string;
    endTime: number;
    prizePool: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending competition start notification`);
  // TODO: Send push notification to all participants
}

/**
 * Send competition end notification
 */
export async function sendCompetitionEndNotification(
  competitionId: string,
  data: {
    competitionName: string;
    totalParticipants: number;
    totalVolume: number;
    winners: Array<{ rank: number; userId: string; score: number }>;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending competition end notification`);
  // TODO: Send push notification to all participants
}

/**
 * Send rank change notification
 */
export async function sendRankChangeNotification(
  userId: string,
  data: {
    competitionId: string;
    previousRank: number;
    newRank: number;
    score: number;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending rank change notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send prize won notification
 */
export async function sendPrizeWonNotification(
  userId: string,
  data: {
    competitionId: string;
    competitionName: string;
    rank: number;
    prizes: { points: number; tokens?: number; special?: string };
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending prize won notification to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send leaderboard update notification
 */
export async function sendLeaderboardUpdateNotification(
  competitionId: string,
  topUsers: Array<{ rank: number; userId: string; score: number }>
): Promise<void> {
  console.log(`[Gamification Activity] Sending leaderboard update notification`);
  // TODO: Send push notification
}

/**
 * Send depreciation warning
 */
export async function sendDepreciationWarning(
  userId: string,
  data: {
    currentBalance: number;
    potentialDepreciation: number;
    daysUntilDepreciation: number;
    actionRequired: string;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending depreciation warning to ${userId}`);
  // TODO: Send push notification
}

/**
 * Send depreciation notification
 */
export async function sendDepreciationNotification(
  userId: string,
  data: {
    depreciatedAmount: number;
    newBalance: number;
    reason: string;
    nextDepreciationDate: string;
  }
): Promise<void> {
  console.log(`[Gamification Activity] Sending depreciation notification to ${userId}`);
  // TODO: Send push notification
}

// ============================================================================
// AUDIT ACTIVITIES
// ============================================================================

/**
 * Record audit log
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Gamification Activity] Audit: ${event.action} on ${event.resourceType}/${event.resourceId}`);
  // TODO: Call Convex mutation
}

/**
 * Schedule next run (for scheduled workflows)
 */
export async function scheduleNextRun(
  workflowType: string,
  nextRunTime: number
): Promise<void> {
  console.log(`[Gamification Activity] Scheduling next ${workflowType} run at ${new Date(nextRunTime)}`);
  // TODO: Implement scheduling logic
}
