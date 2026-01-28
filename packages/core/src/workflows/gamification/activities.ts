/**
 * Gamification Activities
 * All activities for gamification workflows (points, streaks, quests, tiers, achievements)
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
// ============================================================================

export interface PointsConfig {
  actionType: string;
  basePoints: number;
  description: string;
  multiplierRules?: {
    streakMultiplier?: number;
    maxMultiplier?: number;
    per?: number;
    perDollar?: boolean;
    profitMultiplier?: number;
    cap?: number;
  };
  dailyLimit?: number;
  active: boolean;
}

export interface StreakInfo {
  currentCount: number;
  longestCount: number;
  lastActionAt: number;
  currentMultiplier: number;
}

export interface TierInfo {
  currentTier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  lifetimePoints: number;
  currentMonthPoints: number;
  benefits: TierBenefits;
}

export interface TierBenefits {
  threshold: number;
  feeDiscount: number;
  aiCredits: number;
  copyTrading: boolean;
  prioritySupport: boolean;
  revenueShare: number;
  pointsMultiplier: number;
}

export interface Achievement {
  _id: string;
  achievementId: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement: Record<string, unknown>;
  rarity: "common" | "rare" | "epic" | "legendary";
  pointsReward: number;
}

export interface UserStats {
  totalTrades: number;
  correctPredictions: number;
  followers: number;
  lifetimeVolume: number;
  uniqueMarkets: number;
  longestHoldDays: number;
  hasWinningPosition: boolean;
  loginStreak: number;
  referrals: number;
  accountAgeDays: number;
}

export interface AntiGamingResult {
  flagged: boolean;
  flagType?: string;
  severity?: "low" | "medium" | "high" | "critical";
  reason?: string;
}

// Tier multipliers
const TIER_MULTIPLIERS: Record<string, number> = {
  bronze: 1.0,
  silver: 1.1,
  gold: 1.25,
  platinum: 1.5,
  diamond: 2.0,
};

// ============================================================================
// Points Configuration Activities
// ============================================================================

/**
 * Get points configuration for an action type
 */
export async function getPointsConfig(actionType: string): Promise<PointsConfig | null> {
  console.log(`[Gamification Activity] Getting points config for: ${actionType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const configs: Record<string, PointsConfig> = {
    daily_login: {
      actionType: "daily_login",
      basePoints: 5,
      description: "Daily login bonus",
      multiplierRules: { streakMultiplier: 0.1, maxMultiplier: 3 },
      dailyLimit: 1,
      active: true,
    },
    trade_volume: {
      actionType: "trade_volume",
      basePoints: 1,
      description: "Points per $10 trade volume",
      multiplierRules: { per: 10 },
      active: true,
    },
    prediction_correct: {
      actionType: "prediction_correct",
      basePoints: 50,
      description: "Correct prediction reward",
      multiplierRules: { profitMultiplier: 0.01 },
      active: true,
    },
  };

  return configs[actionType] ?? null;
}

// ============================================================================
// Daily Limit Activities
// ============================================================================

/**
 * Check if user has exceeded daily limit for an action
 */
export async function checkDailyLimit(
  userId: string,
  actionType: string,
  limit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  console.log(`[Gamification Activity] Checking daily limit for ${userId}, action: ${actionType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { allowed: true, currentCount: 0 };
}

/**
 * Increment daily action count
 */
export async function incrementDailyAction(userId: string, actionType: string): Promise<void> {
  console.log(`[Gamification Activity] Incrementing daily action for ${userId}, action: ${actionType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Points Calculation Activities
// ============================================================================

/**
 * Calculate base points for an action
 */
export async function calculateBasePoints(input: {
  actionType: string;
  config: PointsConfig;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const { config, metadata } = input;
  console.log(`[Gamification Activity] Calculating base points for: ${input.actionType}`);

  let basePoints = config.basePoints;

  if (config.multiplierRules && metadata) {
    // Per-unit calculations (e.g., per $10 volume)
    if (config.multiplierRules.per && metadata.amount) {
      basePoints = Math.floor(
        ((metadata.amount as number) / config.multiplierRules.per) * config.basePoints
      );
    }

    // Per-dollar profit calculations
    if (config.multiplierRules.perDollar && metadata.profit) {
      basePoints = Math.floor((metadata.profit as number) * config.basePoints);
    }

    // Profit multiplier bonus
    if (config.multiplierRules.profitMultiplier && metadata.profit) {
      basePoints += Math.floor(
        (metadata.profit as number) * config.multiplierRules.profitMultiplier
      );
    }

    // Apply cap if specified
    if (config.multiplierRules.cap) {
      basePoints = Math.min(basePoints, config.multiplierRules.cap);
    }
  }

  return basePoints;
}

// ============================================================================
// Streak Activities
// ============================================================================

/**
 * Get user's streak information
 */
export async function getUserStreak(userId: string, streakType: string): Promise<StreakInfo> {
  console.log(`[Gamification Activity] Getting streak for ${userId}, type: ${streakType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    currentCount: 7,
    longestCount: 30,
    lastActionAt: Date.now() - 24 * 60 * 60 * 1000,
    currentMultiplier: 1.7,
  };
}

/**
 * Apply streak multiplier to points
 */
export async function applyStreakMultiplier(input: {
  basePoints: number;
  streakCount: number;
  multiplierRate: number;
  maxMultiplier: number;
}): Promise<{ points: number; multiplier: number }> {
  const { basePoints, streakCount, multiplierRate, maxMultiplier } = input;

  const multiplier = Math.min(1 + streakCount * multiplierRate, maxMultiplier);
  const points = Math.floor(basePoints * multiplier);

  return { points, multiplier };
}

/**
 * Update user streak
 */
export async function updateUserStreak(
  userId: string,
  streakType: string
): Promise<{ updated: boolean; currentCount: number; streakBroken?: boolean }> {
  console.log(`[Gamification Activity] Updating streak for ${userId}, type: ${streakType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { updated: true, currentCount: 8 };
}

// ============================================================================
// Tier Activities
// ============================================================================

/**
 * Get user's tier information
 */
export async function getUserTier(userId: string): Promise<TierInfo> {
  console.log(`[Gamification Activity] Getting tier for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    currentTier: "gold",
    lifetimePoints: 15000,
    currentMonthPoints: 2500,
    benefits: {
      threshold: 10000,
      feeDiscount: 0.2,
      aiCredits: 200,
      copyTrading: true,
      prioritySupport: false,
      revenueShare: 0,
      pointsMultiplier: 1.25,
    },
  };
}

/**
 * Apply tier multiplier to points
 */
export async function applyTierMultiplier(input: {
  basePoints: number;
  tierName: string;
}): Promise<{ points: number; multiplier: number }> {
  const { basePoints, tierName } = input;

  const multiplier = TIER_MULTIPLIERS[tierName] ?? 1.0;
  const points = Math.floor(basePoints * multiplier);

  return { points, multiplier };
}

/**
 * Update tier points
 */
export async function updateTierPoints(userId: string, pointsEarned: number): Promise<void> {
  console.log(`[Gamification Activity] Updating tier points for ${userId}: +${pointsEarned}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Check if user should be upgraded to a new tier
 */
export async function checkTierUpgrade(
  userId: string
): Promise<{ shouldUpgrade: boolean; newTier?: string }> {
  console.log(`[Gamification Activity] Checking tier upgrade for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { shouldUpgrade: false };
}

/**
 * Upgrade user's tier
 */
export async function upgradeTier(userId: string, newTier: string): Promise<void> {
  console.log(`[Gamification Activity] Upgrading ${userId} to tier: ${newTier}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Points Credit Activities
// ============================================================================

/**
 * Credit points to user account
 */
export async function creditPointsToUser(input: {
  userId: string;
  amount: number;
  actionType: string;
  description: string;
  baseAmount?: number;
  multiplierApplied?: number;
  referenceType?: string;
  referenceId?: string;
}): Promise<{ transactionId: string; newBalance: number }> {
  console.log(`[Gamification Activity] Crediting ${input.amount} points to ${input.userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    transactionId: `pts_${Date.now()}`,
    newBalance: 5000 + input.amount,
  };
}

// ============================================================================
// Quest Activities
// ============================================================================

/**
 * Update quest progress based on action
 */
export async function updateQuestProgress(input: {
  userId: string;
  actionType: string;
  metadata?: Record<string, unknown>;
  pointsEarned: number;
}): Promise<{ updatedQuests: string[] }> {
  console.log(`[Gamification Activity] Updating quest progress for ${input.userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  // Map action types to quest requirement types
  const actionToQuestMap: Record<string, string> = {
    daily_login: "login_before",
    trade_volume: "trade_volume",
    prediction_correct: "prediction_streak",
    market_explorer: "markets_viewed",
    social_message: "messages_sent",
    ai_signal_review: "signals_reviewed",
  };

  const questType = actionToQuestMap[input.actionType];
  if (!questType) {
    return { updatedQuests: [] };
  }

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { updatedQuests: [] };
}

// ============================================================================
// Achievement Activities
// ============================================================================

/**
 * Get user stats for achievement checking
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  console.log(`[Gamification Activity] Getting user stats for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    totalTrades: 150,
    correctPredictions: 45,
    followers: 75,
    lifetimeVolume: 25000,
    uniqueMarkets: 8,
    longestHoldDays: 25,
    hasWinningPosition: true,
    loginStreak: 7,
    referrals: 3,
    accountAgeDays: 45,
  };
}

/**
 * Get all locked achievements for a user
 */
export async function getLockedAchievements(userId: string): Promise<Achievement[]> {
  console.log(`[Gamification Activity] Getting locked achievements for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return [];
}

/**
 * Check if user meets achievement requirement
 */
export async function checkAchievementRequirement(input: {
  requirement: Record<string, unknown>;
  userStats: UserStats;
  triggerAction: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const { requirement, userStats } = input;
  const reqType = requirement.type as string;
  const target = requirement.target as number;

  switch (reqType) {
    case "total_trades":
      return userStats.totalTrades >= target;
    case "correct_predictions":
      return userStats.correctPredictions >= target;
    case "win_rate": {
      const minTrades = requirement.minTrades as number;
      if (userStats.totalTrades < minTrades) return false;
      const winRate = userStats.correctPredictions / userStats.totalTrades;
      return winRate >= target;
    }
    case "followers":
      return userStats.followers >= target;
    case "lifetime_volume":
      return userStats.lifetimeVolume >= target;
    case "unique_markets":
      return userStats.uniqueMarkets >= target;
    case "hold_duration":
      if (requirement.mustBeWinning && !userStats.hasWinningPosition) return false;
      return userStats.longestHoldDays >= target;
    case "login_streak":
      return userStats.loginStreak >= target;
    case "referrals":
      return userStats.referrals >= target;
    default:
      return false;
  }
}

/**
 * Unlock an achievement for a user
 */
export async function unlockAchievement(input: {
  userId: string;
  achievementId: string;
  progress?: UserStats;
  pointsReward?: number;
}): Promise<void> {
  console.log(`[Gamification Activity] Unlocking achievement ${input.achievementId} for ${input.userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Check user achievements (long-running activity)
 */
export async function checkUserAchievements(input: {
  userId: string;
  triggerAction: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  newlyUnlocked: Array<{
    id: string;
    title: string;
    pointsReward: number;
  }>;
}> {
  console.log(`[Gamification Activity] Checking achievements for ${input.userId}`);

  Context.current().heartbeat("Starting achievement check");

  const stats = await getUserStats(input.userId);
  const locked = await getLockedAchievements(input.userId);
  const newlyUnlocked: Array<{ id: string; title: string; pointsReward: number }> = [];

  for (let i = 0; i < locked.length; i++) {
    const achievement = locked[i]!;
    Context.current().heartbeat(`Checking achievement ${i + 1}/${locked.length}`);

    const meets = await checkAchievementRequirement({
      requirement: achievement.requirement,
      userStats: stats,
      triggerAction: input.triggerAction,
      metadata: input.metadata,
    });

    if (meets) {
      newlyUnlocked.push({
        id: achievement._id,
        title: achievement.title,
        pointsReward: achievement.pointsReward,
      });
    }
  }

  return { newlyUnlocked };
}

// ============================================================================
// Anti-Gaming Activities
// ============================================================================

/**
 * Check anti-gaming rules
 */
export async function checkAntiGamingRules(input: {
  userId: string;
  actionType: string;
  metadata?: Record<string, unknown>;
  recentActionsWindow: number;
}): Promise<AntiGamingResult> {
  console.log(`[Gamification Activity] Checking anti-gaming rules for ${input.userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag

  // Example checks:
  // 1. Too many actions in short period
  // 2. Suspicious patterns (always same time, same amounts)
  // 3. Bot-like behavior
  // 4. Geographic anomalies

  return { flagged: false };
}

/**
 * Flag suspicious activity
 */
export async function flagSuspiciousActivity(input: {
  userId: string;
  flagType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  metadata: Record<string, unknown>;
}): Promise<{ flagId: string }> {
  console.log(`[Gamification Activity] Flagging suspicious activity for ${input.userId}: ${input.flagType}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { flagId: `flag_${Date.now()}` };
}

// ============================================================================
// Notification Activities
// ============================================================================

/**
 * Send notification to user
 */
export async function sendNotification(input: {
  userId: string;
  type: string;
  data: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Gamification Activity] Sending notification to ${input.userId}: ${input.type}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Send bulk notifications
 */
export async function sendBulkNotifications(input: {
  userIds: string[];
  type: string;
  data: Record<string, unknown>;
}): Promise<{ sent: number; failed: number }> {
  console.log(`[Gamification Activity] Sending bulk notifications: ${input.userIds.length} users`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { sent: input.userIds.length, failed: 0 };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log entry
 */
export async function recordAuditLog(input: {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Gamification Activity] Audit: ${input.action} on ${input.resourceType}/${input.resourceId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Daily Reset Activities
// ============================================================================

/**
 * Reset all daily quest progress
 */
export async function resetAllDailyQuestProgress(): Promise<{ resetCount: number }> {
  console.log(`[Gamification Activity] Resetting all daily quest progress`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { resetCount: 0 };
}

/**
 * Check and mark broken streaks
 */
export async function checkAndMarkBrokenStreaks(): Promise<{
  brokenCount: number;
  totalChecked: number;
}> {
  console.log(`[Gamification Activity] Checking broken streaks`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { brokenCount: 0, totalChecked: 0 };
}

/**
 * Generate daily quests
 */
export async function generateDailyQuests(): Promise<{ questCount: number }> {
  console.log(`[Gamification Activity] Generating daily quests`);

  // Daily quests are predefined, this rotates/activates them
  return { questCount: 5 };
}

/**
 * Get users who need streak reminders
 */
export async function getActiveUsersForReminders(input: {
  minStreakCount: number;
  lastActivityBefore: number;
}): Promise<Array<{ userId: string; streakCount: number; email?: string }>> {
  console.log(`[Gamification Activity] Getting users for streak reminders`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return [];
}

// ============================================================================
// Weekly Reset Activities
// ============================================================================

/**
 * Reset all weekly quest progress
 */
export async function resetAllWeeklyQuestProgress(): Promise<{ resetCount: number }> {
  console.log(`[Gamification Activity] Resetting all weekly quest progress`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { resetCount: 0 };
}

/**
 * Generate weekly quests
 */
export async function generateWeeklyQuests(): Promise<{ questCount: number }> {
  console.log(`[Gamification Activity] Generating weekly quests`);

  return { questCount: 5 };
}

/**
 * Prepare weekly summaries for all users
 */
export async function prepareWeeklySummaries(): Promise<{
  users: Array<{
    userId: string;
    email: string;
    pointsEarned: number;
    questsCompleted: number;
    achievementsUnlocked: number;
    rank: number;
    rankChange: number;
  }>;
  weekStartDate: string;
  weekEndDate: string;
}> {
  console.log(`[Gamification Activity] Preparing weekly summaries`);

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    users: [],
    weekStartDate: weekStart.toISOString(),
    weekEndDate: now.toISOString(),
  };
}

/**
 * Send weekly summary emails
 */
export async function sendWeeklySummaryEmails(input: {
  users: Array<{
    userId: string;
    email: string;
    pointsEarned: number;
    questsCompleted: number;
    achievementsUnlocked: number;
    rank: number;
    rankChange: number;
  }>;
  weekStartDate: string;
  weekEndDate: string;
}): Promise<{ sent: number; failed: number }> {
  console.log(`[Gamification Activity] Sending weekly summary emails: ${input.users.length} users`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { sent: input.users.length, failed: 0 };
}

// ============================================================================
// Monthly Decay Activities
// ============================================================================

/**
 * Get inactive users eligible for point decay
 */
export async function getInactiveUsersForDecay(input: {
  minPoints: number;
  inactivityDays: number;
}): Promise<
  Array<{
    userId: string;
    lifetimePoints: number;
    lastActivityAt: number;
    inactiveDays: number;
  }>
> {
  console.log(`[Gamification Activity] Getting inactive users for decay`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return [];
}

/**
 * Apply point decay to a user
 */
export async function applyPointDecay(input: {
  userId: string;
  currentPoints: number;
  decayPercent: number;
  reason: string;
}): Promise<{ pointsDecayed: number; newPoints: number }> {
  console.log(`[Gamification Activity] Applying ${input.decayPercent * 100}% decay to ${input.userId}`);

  const decayAmount = Math.floor(input.currentPoints * input.decayPercent);
  const newPoints = input.currentPoints - decayAmount;

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag

  return { pointsDecayed: decayAmount, newPoints };
}

/**
 * Recalculate user tier after decay
 */
export async function recalculateTier(userId: string): Promise<{
  changed: boolean;
  previousTier?: string;
  newTier?: string;
}> {
  console.log(`[Gamification Activity] Recalculating tier for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { changed: false };
}

/**
 * Send tier change notification
 */
export async function sendTierChangeNotification(input: {
  userId: string;
  previousTier: string;
  newTier: string;
  reason: string;
}): Promise<void> {
  console.log(
    `[Gamification Activity] Sending tier change notification to ${input.userId}: ${input.previousTier} -> ${input.newTier}`
  );

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Archive old point transactions
 */
export async function archiveOldPointTransactions(input: {
  olderThanDays: number;
  batchSize: number;
}): Promise<{ archivedCount: number }> {
  console.log(`[Gamification Activity] Archiving transactions older than ${input.olderThanDays} days`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { archivedCount: 0 };
}

/**
 * Generate monthly report
 */
export async function generateMonthlyReport(input: {
  month: string;
  usersDecayed: number;
  totalPointsDecayed: number;
  tierDowngrades: number;
  transactionsArchived: number;
}): Promise<void> {
  console.log(`[Gamification Activity] Generating monthly report for ${input.month}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Leaderboard Activities
// ============================================================================

/**
 * Update leaderboard snapshot
 */
export async function updateLeaderboardSnapshot(input: {
  period: "daily" | "weekly" | "monthly" | "alltime";
  types: string[];
}): Promise<void> {
  console.log(`[Gamification Activity] Updating ${input.period} leaderboard snapshots`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Archive old leaderboards
 */
export async function archiveOldLeaderboards(input: {
  period: string;
  keepRecent: number;
}): Promise<void> {
  console.log(`[Gamification Activity] Archiving old ${input.period} leaderboards, keeping ${input.keepRecent}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Streak Reminder Activities
// ============================================================================

/**
 * Send streak reminders to users
 */
export async function sendStreakReminders(userIds: string[]): Promise<{ sent: number }> {
  console.log(`[Gamification Activity] Sending streak reminders to ${userIds.length} users`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { sent: userIds.length };
}
