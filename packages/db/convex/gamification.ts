import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Advanced Gamification System for PULL
 * Points, Streaks, Quests, Tiers, and Achievements
 */

// ============================================================================
// CONSTANTS & SEED DATA
// ============================================================================

export const POINTS_CONFIG = [
  {
    actionType: "daily_login",
    basePoints: 5,
    description: "Daily login bonus",
    multiplierRules: { streakMultiplier: 0.1, maxMultiplier: 3 },
    dailyLimit: 1,
  },
  {
    actionType: "first_trade",
    basePoints: 10,
    description: "First trade of the day",
    multiplierRules: null,
    dailyLimit: 1,
  },
  {
    actionType: "trade_volume",
    basePoints: 1,
    description: "Points per $10 trade volume",
    multiplierRules: { per: 10 },
    dailyLimit: null,
  },
  {
    actionType: "prediction_correct",
    basePoints: 50,
    description: "Correct prediction reward",
    multiplierRules: { profitMultiplier: 0.01 },
    dailyLimit: null,
  },
  {
    actionType: "prediction_streak",
    basePoints: 25,
    description: "Prediction winning streak bonus",
    multiplierRules: { streakMultiplier: 0.5 },
    dailyLimit: null,
  },
  {
    actionType: "referral_signup",
    basePoints: 100,
    description: "New referral signed up",
    multiplierRules: null,
    dailyLimit: null,
  },
  {
    actionType: "referral_kyc",
    basePoints: 500,
    description: "Referral completed KYC",
    multiplierRules: null,
    dailyLimit: null,
  },
  {
    actionType: "referral_first_trade",
    basePoints: 200,
    description: "Referral made first trade",
    multiplierRules: null,
    dailyLimit: null,
  },
  {
    actionType: "referral_volume",
    basePoints: 0.5,
    description: "Points per $10 referral trading volume",
    multiplierRules: { per: 10, cap: 1000 },
    dailyLimit: null,
  },
  {
    actionType: "content_upvote",
    basePoints: 5,
    description: "Content received upvote",
    multiplierRules: null,
    dailyLimit: 50,
  },
  {
    actionType: "helpful_answer",
    basePoints: 25,
    description: "Answer marked as helpful",
    multiplierRules: null,
    dailyLimit: 10,
  },
  {
    actionType: "copied_trade_profit",
    basePoints: 0.1,
    description: "Points per dollar profit from copied trades",
    multiplierRules: { perDollar: true },
    dailyLimit: null,
  },
  {
    actionType: "quest_complete",
    basePoints: 0,
    description: "Quest completion (variable per quest)",
    multiplierRules: null,
    dailyLimit: null,
  },
  {
    actionType: "achievement_unlock",
    basePoints: 0,
    description: "Achievement unlock (variable per achievement)",
    multiplierRules: null,
    dailyLimit: null,
  },
  {
    actionType: "market_explorer",
    basePoints: 1,
    description: "Points per unique market viewed",
    multiplierRules: null,
    dailyLimit: 20,
  },
  {
    actionType: "social_message",
    basePoints: 2,
    description: "Chat message sent",
    multiplierRules: null,
    dailyLimit: 25,
  },
  {
    actionType: "ai_signal_review",
    basePoints: 5,
    description: "Reviewed AI trading signal",
    multiplierRules: null,
    dailyLimit: 10,
  },
];

export const TIER_CONFIG = {
  bronze: {
    threshold: 0,
    feeDiscount: 0,
    aiCredits: 10,
    copyTrading: false,
    prioritySupport: false,
    revenueShare: 0,
    pointsMultiplier: 1.0,
    color: "#CD7F32",
    icon: "🥉",
  },
  silver: {
    threshold: 1000,
    feeDiscount: 0.1,
    aiCredits: 50,
    copyTrading: false,
    prioritySupport: false,
    revenueShare: 0,
    pointsMultiplier: 1.1,
    color: "#C0C0C0",
    icon: "🥈",
  },
  gold: {
    threshold: 10000,
    feeDiscount: 0.2,
    aiCredits: 200,
    copyTrading: true,
    prioritySupport: false,
    revenueShare: 0,
    pointsMultiplier: 1.25,
    color: "#FFD700",
    icon: "🥇",
  },
  platinum: {
    threshold: 100000,
    feeDiscount: 0.3,
    aiCredits: 1000,
    copyTrading: true,
    prioritySupport: true,
    revenueShare: 0,
    pointsMultiplier: 1.5,
    color: "#E5E4E2",
    icon: "💎",
  },
  diamond: {
    threshold: 500000,
    feeDiscount: 0.5,
    aiCredits: -1, // unlimited
    copyTrading: true,
    prioritySupport: true,
    revenueShare: 0.01, // 1% of platform fees from their referrals
    pointsMultiplier: 2.0,
    color: "#B9F2FF",
    icon: "💠",
  },
} as const;

export const DAILY_QUESTS = [
  {
    questId: "early_bird",
    title: "Early Bird",
    description: "Log in before 9am local time",
    type: "daily" as const,
    requirements: { type: "login_before", hour: 9 },
    pointsReward: 10,
  },
  {
    questId: "active_trader",
    title: "Active Trader",
    description: "Make 3 trades today",
    type: "daily" as const,
    requirements: { type: "trades_count", target: 3 },
    pointsReward: 25,
  },
  {
    questId: "market_explorer",
    title: "Market Explorer",
    description: "View 10 different markets",
    type: "daily" as const,
    requirements: { type: "markets_viewed", target: 10 },
    pointsReward: 15,
  },
  {
    questId: "social_butterfly",
    title: "Social Butterfly",
    description: "Send 5 messages in chat",
    type: "daily" as const,
    requirements: { type: "messages_sent", target: 5 },
    pointsReward: 10,
  },
  {
    questId: "signal_seeker",
    title: "Signal Seeker",
    description: "Review 3 AI signals",
    type: "daily" as const,
    requirements: { type: "signals_reviewed", target: 3 },
    pointsReward: 15,
  },
];

export const WEEKLY_QUESTS = [
  {
    questId: "diversifier",
    title: "Diversifier",
    description: "Trade in 3 different categories this week",
    type: "weekly" as const,
    requirements: { type: "categories_traded", target: 3 },
    pointsReward: 100,
  },
  {
    questId: "winning_streak",
    title: "Winning Streak",
    description: "Win 5 predictions in a row",
    type: "weekly" as const,
    requirements: { type: "prediction_streak", target: 5 },
    pointsReward: 200,
  },
  {
    questId: "community_builder",
    title: "Community Builder",
    description: "Gain 10 followers this week",
    type: "weekly" as const,
    requirements: { type: "followers_gained", target: 10 },
    pointsReward: 150,
  },
  {
    questId: "referral_champion",
    title: "Referral Champion",
    description: "Refer 1 new user who completes KYC",
    type: "weekly" as const,
    requirements: { type: "referral_kyc", target: 1 },
    pointsReward: 500,
  },
  {
    questId: "volume_king",
    title: "Volume King",
    description: "Trade $1,000 in volume this week",
    type: "weekly" as const,
    requirements: { type: "trade_volume", target: 1000 },
    pointsReward: 100,
  },
];

export const ACHIEVEMENTS = [
  {
    achievementId: "first_blood",
    title: "First Blood",
    description: "Make your first trade",
    icon: "⚔️",
    category: "trading",
    requirement: { type: "total_trades", target: 1 },
    rarity: "common" as const,
    pointsReward: 50,
  },
  {
    achievementId: "oracle",
    title: "Oracle",
    description: "10 correct predictions",
    icon: "🔮",
    category: "trading",
    requirement: { type: "correct_predictions", target: 10 },
    rarity: "common" as const,
    pointsReward: 200,
  },
  {
    achievementId: "seer",
    title: "Seer",
    description: "50 correct predictions",
    icon: "👁️",
    category: "trading",
    requirement: { type: "correct_predictions", target: 50 },
    rarity: "rare" as const,
    pointsReward: 500,
  },
  {
    achievementId: "prophet",
    title: "Prophet",
    description: "100 correct predictions",
    icon: "🌟",
    category: "trading",
    requirement: { type: "correct_predictions", target: 100 },
    rarity: "epic" as const,
    pointsReward: 1000,
  },
  {
    achievementId: "fortune_teller",
    title: "Fortune Teller",
    description: "90% win rate over 20+ trades",
    icon: "🎰",
    category: "trading",
    requirement: { type: "win_rate", target: 0.9, minTrades: 20 },
    rarity: "legendary" as const,
    pointsReward: 2000,
  },
  {
    achievementId: "influencer",
    title: "Influencer",
    description: "Reach 100 followers",
    icon: "📢",
    category: "social",
    requirement: { type: "followers", target: 100 },
    rarity: "rare" as const,
    pointsReward: 500,
  },
  {
    achievementId: "guru",
    title: "Guru",
    description: "Reach 1000 followers",
    icon: "🧘",
    category: "social",
    requirement: { type: "followers", target: 1000 },
    rarity: "epic" as const,
    pointsReward: 2000,
  },
  {
    achievementId: "whale",
    title: "Whale",
    description: "$100,000 lifetime volume",
    icon: "🐋",
    category: "trading",
    requirement: { type: "lifetime_volume", target: 100000 },
    rarity: "rare" as const,
    pointsReward: 1000,
  },
  {
    achievementId: "diversified",
    title: "Diversified",
    description: "Hold positions in 10 different markets",
    icon: "🎯",
    category: "trading",
    requirement: { type: "unique_markets", target: 10 },
    rarity: "common" as const,
    pointsReward: 200,
  },
  {
    achievementId: "diamond_hands",
    title: "Diamond Hands",
    description: "Hold a winning position for 30+ days",
    icon: "💎",
    category: "trading",
    requirement: { type: "hold_duration", target: 30, mustBeWinning: true },
    rarity: "rare" as const,
    pointsReward: 300,
  },
  {
    achievementId: "early_adopter",
    title: "Early Adopter",
    description: "Account created in first month",
    icon: "🚀",
    category: "special",
    requirement: { type: "early_signup", daysFromLaunch: 30 },
    rarity: "legendary" as const,
    pointsReward: 1000,
  },
  {
    achievementId: "streak_master_7",
    title: "Streak Master",
    description: "7-day login streak",
    icon: "🔥",
    category: "streak",
    requirement: { type: "login_streak", target: 7 },
    rarity: "common" as const,
    pointsReward: 100,
  },
  {
    achievementId: "streak_legend_30",
    title: "Streak Legend",
    description: "30-day login streak",
    icon: "🔥🔥",
    category: "streak",
    requirement: { type: "login_streak", target: 30 },
    rarity: "rare" as const,
    pointsReward: 500,
  },
  {
    achievementId: "streak_titan_100",
    title: "Streak Titan",
    description: "100-day login streak",
    icon: "🔥🔥🔥",
    category: "streak",
    requirement: { type: "login_streak", target: 100 },
    rarity: "epic" as const,
    pointsReward: 2000,
  },
  {
    achievementId: "referral_starter",
    title: "Referral Starter",
    description: "Refer your first user",
    icon: "🤝",
    category: "referral",
    requirement: { type: "referrals", target: 1 },
    rarity: "common" as const,
    pointsReward: 100,
  },
  {
    achievementId: "referral_pro",
    title: "Referral Pro",
    description: "Refer 10 users",
    icon: "🌐",
    category: "referral",
    requirement: { type: "referrals", target: 10 },
    rarity: "rare" as const,
    pointsReward: 1000,
  },
  {
    achievementId: "referral_master",
    title: "Referral Master",
    description: "Refer 50 users",
    icon: "👑",
    category: "referral",
    requirement: { type: "referrals", target: 50 },
    rarity: "epic" as const,
    pointsReward: 5000,
  },
];

// ============================================================================
// SEED DATA MUTATIONS
// ============================================================================

/**
 * Seed points configuration
 */
export const seedPointsConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existingConfigs = await ctx.db.query("pointsConfig").collect();

    if (existingConfigs.length > 0) {
      return { message: "Points config already seeded", count: existingConfigs.length };
    }

    for (const config of POINTS_CONFIG) {
      await ctx.db.insert("pointsConfig", {
        actionType: config.actionType,
        basePoints: config.basePoints,
        description: config.description,
        multiplierRules: config.multiplierRules,
        dailyLimit: config.dailyLimit ?? undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { message: "Points config seeded", count: POINTS_CONFIG.length };
  },
});

/**
 * Seed quests
 */
export const seedQuests = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existingQuests = await ctx.db.query("quests").collect();

    if (existingQuests.length > 0) {
      return { message: "Quests already seeded", count: existingQuests.length };
    }

    const allQuests = [...DAILY_QUESTS, ...WEEKLY_QUESTS];
    let order = 0;

    for (const quest of allQuests) {
      await ctx.db.insert("quests", {
        questId: quest.questId,
        title: quest.title,
        description: quest.description,
        type: quest.type,
        requirements: quest.requirements,
        pointsReward: quest.pointsReward,
        bonusReward: undefined,
        startsAt: undefined,
        expiresAt: undefined,
        maxCompletions: quest.type === "daily" ? 1 : quest.type === "weekly" ? 1 : undefined,
        active: true,
        sortOrder: order++,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { message: "Quests seeded", count: allQuests.length };
  },
});

/**
 * Seed achievements
 */
export const seedAchievements = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existingAchievements = await ctx.db.query("achievements").collect();

    if (existingAchievements.length > 0) {
      return { message: "Achievements already seeded", count: existingAchievements.length };
    }

    let order = 0;
    for (const achievement of ACHIEVEMENTS) {
      await ctx.db.insert("achievements", {
        achievementId: achievement.achievementId,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
        requirement: achievement.requirement,
        rarity: achievement.rarity,
        pointsReward: achievement.pointsReward,
        tokenReward: undefined,
        isSecret: false,
        sortOrder: order++,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { message: "Achievements seeded", count: ACHIEVEMENTS.length };
  },
});

// ============================================================================
// POINTS QUERIES
// ============================================================================

/**
 * Get points configuration for an action
 */
export const getPointsConfig = query({
  args: { actionType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pointsConfig")
      .withIndex("by_actionType", (q) => q.eq("actionType", args.actionType))
      .unique();
  },
});

/**
 * Get all active points configurations
 */
export const getAllPointsConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("pointsConfig")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

/**
 * Get comprehensive rewards summary for a user
 */
export const getRewardsSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    // Get tier info
    const tier = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // Get active streaks
    const streaks = await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get recent earnings (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentTransactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("createdAt"), sevenDaysAgo))
      .collect();

    const recentEarnings = recentTransactions
      .filter((t) => t.amount > 0 && t.status === "completed")
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate tier progress
    const currentTierName = tier?.currentTier ?? "bronze";
    const lifetimePoints = tier?.lifetimePoints ?? 0;
    const tierConfig = TIER_CONFIG[currentTierName];
    const nextTierName = getNextTierName(currentTierName);
    const nextTierConfig = nextTierName ? TIER_CONFIG[nextTierName] : null;
    const pointsToNextTier = nextTierConfig
      ? Math.max(0, nextTierConfig.threshold - lifetimePoints)
      : 0;
    const tierProgress = nextTierConfig
      ? Math.min(
          100,
          ((lifetimePoints - tierConfig.threshold) /
            (nextTierConfig.threshold - tierConfig.threshold)) *
            100
        )
      : 100;

    return {
      pointsBalance: balance?.available ?? 0,
      pendingPoints: balance?.pending ?? 0,
      lifetimePoints,
      currentTier: currentTierName,
      tierProgress,
      pointsToNextTier,
      nextTier: nextTierName,
      tierBenefits: tierConfig,
      activeStreaks: streaks.map((s) => ({
        type: s.streakType,
        count: s.currentCount,
        multiplier: s.currentMultiplier,
        longestCount: s.longestCount,
        lastActionAt: s.lastActionAt,
      })),
      recentEarnings,
      currentMonthPoints: tier?.currentMonthPoints ?? 0,
    };
  },
});

/**
 * Get points history with pagination
 */
export const getPointsHistory = query({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let queryBuilder = ctx.db.query("pointsTransactions");

    if (args.type) {
      queryBuilder = queryBuilder.withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", args.type!)
      );
    } else {
      queryBuilder = queryBuilder.withIndex("by_user", (q) => q.eq("userId", args.userId));
    }

    let results = await queryBuilder.order("desc").collect();

    // Apply cursor-based pagination
    if (args.cursor) {
      results = results.filter((r) => r.createdAt < args.cursor!);
    }

    const items = results.slice(0, limit);
    const hasMore = results.length > limit;
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;

    return {
      items,
      hasMore,
      nextCursor,
    };
  },
});

// ============================================================================
// STREAK QUERIES & MUTATIONS
// ============================================================================

/**
 * Get user streak for a specific type
 */
export const getStreak = query({
  args: {
    userId: v.id("users"),
    streakType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streaks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("streakType", args.streakType)
      )
      .unique();
  },
});

/**
 * Update streak for a user action
 */
export const updateStreak = mutation({
  args: {
    userId: v.id("users"),
    streakType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 2 * oneDayMs;

    const existing = await ctx.db
      .query("streaks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("streakType", args.streakType)
      )
      .unique();

    if (existing) {
      const timeSinceLastAction = now - existing.lastActionAt;

      // Check if same day (already actioned today)
      const lastDate = new Date(existing.lastActionAt).toDateString();
      const todayDate = new Date(now).toDateString();

      if (lastDate === todayDate) {
        // Already updated today, no change
        return {
          updated: false,
          currentCount: existing.currentCount,
          multiplier: existing.currentMultiplier,
          message: "Already updated today",
        };
      }

      if (timeSinceLastAction <= twoDaysMs) {
        // Continue streak
        const newCount = existing.currentCount + 1;
        const newMultiplier = calculateStreakMultiplier(args.streakType, newCount);
        const longestCount = Math.max(existing.longestCount, newCount);

        await ctx.db.patch(existing._id, {
          currentCount: newCount,
          longestCount,
          lastActionAt: now,
          currentMultiplier: newMultiplier,
          updatedAt: now,
        });

        return {
          updated: true,
          currentCount: newCount,
          multiplier: newMultiplier,
          longestCount,
          streakContinued: true,
        };
      } else {
        // Streak broken, reset
        const newMultiplier = calculateStreakMultiplier(args.streakType, 1);

        await ctx.db.patch(existing._id, {
          currentCount: 1,
          lastActionAt: now,
          currentMultiplier: newMultiplier,
          updatedAt: now,
        });

        return {
          updated: true,
          currentCount: 1,
          multiplier: newMultiplier,
          longestCount: existing.longestCount,
          streakBroken: true,
          previousStreak: existing.currentCount,
        };
      }
    } else {
      // New streak
      const newMultiplier = calculateStreakMultiplier(args.streakType, 1);

      await ctx.db.insert("streaks", {
        userId: args.userId,
        streakType: args.streakType,
        currentCount: 1,
        longestCount: 1,
        lastActionAt: now,
        currentMultiplier: newMultiplier,
        createdAt: now,
        updatedAt: now,
      });

      return {
        updated: true,
        currentCount: 1,
        multiplier: newMultiplier,
        longestCount: 1,
        isNew: true,
      };
    }
  },
});

// ============================================================================
// QUEST QUERIES & MUTATIONS
// ============================================================================

/**
 * Get active quests for a user
 */
export const getActiveQuests = query({
  args: {
    userId: v.id("users"),
    type: v.optional(
      v.union(v.literal("daily"), v.literal("weekly"), v.literal("achievement"), v.literal("seasonal"))
    ),
  },
  handler: async (ctx, args) => {
    // Get all active quests
    let questsQuery = ctx.db.query("quests");

    if (args.type) {
      questsQuery = questsQuery.withIndex("by_type_active", (q) =>
        q.eq("type", args.type!).eq("active", true)
      );
    } else {
      questsQuery = questsQuery.withIndex("by_active", (q) => q.eq("active", true));
    }

    const quests = await questsQuery.collect();

    // Get user's progress on these quests
    const userQuests = await ctx.db
      .query("userQuests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const userQuestMap = new Map(userQuests.map((uq) => [uq.questId.toString(), uq]));

    return quests.map((quest) => {
      const userQuest = userQuestMap.get(quest._id.toString());
      return {
        ...quest,
        progress: userQuest?.progress ?? initializeQuestProgress(quest.requirements),
        completed: userQuest?.completed ?? false,
        claimed: userQuest?.claimed ?? false,
        startedAt: userQuest?.startedAt,
        completedAt: userQuest?.completedAt,
      };
    });
  },
});

/**
 * Update quest progress
 */
export const updateQuestProgress = mutation({
  args: {
    userId: v.id("users"),
    questId: v.id("quests"),
    progressUpdate: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const quest = await ctx.db.get(args.questId);
    if (!quest || !quest.active) {
      throw new Error("Quest not found or inactive");
    }

    // Check expiry
    if (quest.expiresAt && quest.expiresAt < now) {
      throw new Error("Quest has expired");
    }

    const existingProgress = await ctx.db
      .query("userQuests")
      .withIndex("by_user_quest", (q) => q.eq("userId", args.userId).eq("questId", args.questId))
      .unique();

    if (existingProgress?.completed) {
      return { message: "Quest already completed", completed: true };
    }

    // Merge progress
    const currentProgress = existingProgress?.progress ?? initializeQuestProgress(quest.requirements);
    const newProgress = mergeQuestProgress(currentProgress, args.progressUpdate);

    // Check if quest is completed
    const isCompleted = checkQuestCompletion(quest.requirements, newProgress);

    if (existingProgress) {
      await ctx.db.patch(existingProgress._id, {
        progress: newProgress,
        completed: isCompleted,
        completedAt: isCompleted ? now : undefined,
      });
    } else {
      await ctx.db.insert("userQuests", {
        userId: args.userId,
        questId: args.questId,
        progress: newProgress,
        completed: isCompleted,
        claimed: false,
        startedAt: now,
        completedAt: isCompleted ? now : undefined,
      });
    }

    return {
      progress: newProgress,
      completed: isCompleted,
      pointsReward: isCompleted ? quest.pointsReward : 0,
    };
  },
});

/**
 * Claim quest reward
 */
export const claimQuestReward = mutation({
  args: {
    userId: v.id("users"),
    questId: v.id("quests"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const quest = await ctx.db.get(args.questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    const userQuest = await ctx.db
      .query("userQuests")
      .withIndex("by_user_quest", (q) => q.eq("userId", args.userId).eq("questId", args.questId))
      .unique();

    if (!userQuest) {
      throw new Error("Quest not started");
    }

    if (!userQuest.completed) {
      throw new Error("Quest not completed");
    }

    if (userQuest.claimed) {
      throw new Error("Quest reward already claimed");
    }

    // Mark as claimed
    await ctx.db.patch(userQuest._id, {
      claimed: true,
      claimedAt: now,
    });

    // Credit points
    const pointsResult = await creditPoints(ctx, {
      userId: args.userId,
      amount: quest.pointsReward,
      type: "quest_complete",
      description: `Completed quest: ${quest.title}`,
      referenceType: "quests",
      referenceId: quest._id,
    });

    // Award bonus reward if any
    if (quest.bonusReward) {
      // Handle bonus rewards (badges, titles, etc.)
      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "quest.bonus_awarded",
        resourceType: "quests",
        resourceId: quest._id,
        metadata: { bonusReward: quest.bonusReward },
        timestamp: now,
      });
    }

    return {
      pointsEarned: quest.pointsReward,
      newBalance: pointsResult.newBalance,
      bonusReward: quest.bonusReward,
    };
  },
});

// ============================================================================
// TIER QUERIES & MUTATIONS
// ============================================================================

/**
 * Get user tier information
 */
export const getUserTier = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tier = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!tier) {
      return {
        currentTier: "bronze" as const,
        lifetimePoints: 0,
        currentMonthPoints: 0,
        benefits: TIER_CONFIG.bronze,
        nextTier: "silver",
        pointsToNextTier: TIER_CONFIG.silver.threshold,
        progress: 0,
      };
    }

    const nextTierName = getNextTierName(tier.currentTier);
    const nextTierConfig = nextTierName ? TIER_CONFIG[nextTierName] : null;
    const currentTierConfig = TIER_CONFIG[tier.currentTier];

    const progress = nextTierConfig
      ? Math.min(
          100,
          ((tier.lifetimePoints - currentTierConfig.threshold) /
            (nextTierConfig.threshold - currentTierConfig.threshold)) *
            100
        )
      : 100;

    return {
      currentTier: tier.currentTier,
      lifetimePoints: tier.lifetimePoints,
      currentMonthPoints: tier.currentMonthPoints,
      benefits: tier.benefits ?? currentTierConfig,
      tierAchievedAt: tier.tierAchievedAt,
      tierExpiresAt: tier.tierExpiresAt,
      nextTier: nextTierName,
      pointsToNextTier: nextTierConfig
        ? Math.max(0, nextTierConfig.threshold - tier.lifetimePoints)
        : 0,
      progress,
      lastActivityAt: tier.lastActivityAt,
    };
  },
});

/**
 * Update user tier based on points
 */
export const updateUserTier = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const tier = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!tier) {
      return { message: "No tier record found" };
    }

    const newTierName = getTierForPoints(tier.lifetimePoints);
    const oldTierName = tier.currentTier;

    if (newTierName !== oldTierName) {
      const newTierConfig = TIER_CONFIG[newTierName];

      await ctx.db.patch(tier._id, {
        currentTier: newTierName,
        benefits: newTierConfig,
        tierAchievedAt: now,
        updatedAt: now,
      });

      // Log tier change
      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "tier.upgraded",
        resourceType: "tiers",
        resourceId: tier._id,
        changes: { from: oldTierName, to: newTierName },
        timestamp: now,
      });

      return {
        upgraded: true,
        oldTier: oldTierName,
        newTier: newTierName,
        benefits: newTierConfig,
      };
    }

    return { upgraded: false, currentTier: oldTierName };
  },
});

/**
 * Initialize user tier record
 */
export const initializeUserTier = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      return { message: "Tier already initialized", tier: existing };
    }

    const tierId = await ctx.db.insert("tiers", {
      userId: args.userId,
      currentTier: "bronze",
      lifetimePoints: 0,
      currentMonthPoints: 0,
      tierAchievedAt: now,
      tierExpiresAt: undefined,
      benefits: TIER_CONFIG.bronze,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { message: "Tier initialized", tierId };
  },
});

// ============================================================================
// ACHIEVEMENT QUERIES & MUTATIONS
// ============================================================================

/**
 * Get all achievements with user progress
 */
export const getAchievements = query({
  args: {
    userId: v.id("users"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let achievementsQuery = ctx.db.query("achievements");

    if (args.category) {
      achievementsQuery = achievementsQuery.withIndex("by_category", (q) =>
        q.eq("category", args.category!)
      );
    }

    const achievements = await achievementsQuery
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    // Get user's unlocked achievements
    const userAchievements = await ctx.db
      .query("userAchievements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const unlockedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId.toString(), ua])
    );

    return achievements.map((achievement) => {
      const userAchievement = unlockedMap.get(achievement._id.toString());
      return {
        ...achievement,
        unlocked: !!userAchievement,
        unlockedAt: userAchievement?.unlockedAt,
        displayed: userAchievement?.displayed ?? false,
        progress: userAchievement?.progress,
      };
    });
  },
});

/**
 * Check and unlock achievements for a user
 */
export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.id("users"),
    stats: v.any(), // User stats to check against requirements
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const unlocked: Array<{ achievementId: string; title: string; pointsReward: number }> = [];

    // Get all active achievements
    const achievements = await ctx.db
      .query("achievements")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    // Get user's already unlocked achievements
    const userAchievements = await ctx.db
      .query("userAchievements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const unlockedIds = new Set(userAchievements.map((ua) => ua.achievementId.toString()));

    for (const achievement of achievements) {
      if (unlockedIds.has(achievement._id.toString())) {
        continue; // Already unlocked
      }

      if (checkAchievementRequirement(achievement.requirement, args.stats)) {
        // Unlock achievement
        await ctx.db.insert("userAchievements", {
          userId: args.userId,
          achievementId: achievement._id,
          unlockedAt: now,
          displayed: false,
          progress: args.stats,
        });

        // Credit points
        await creditPoints(ctx, {
          userId: args.userId,
          amount: achievement.pointsReward,
          type: "achievement_unlock",
          description: `Unlocked achievement: ${achievement.title}`,
          referenceType: "achievements",
          referenceId: achievement._id,
        });

        unlocked.push({
          achievementId: achievement.achievementId,
          title: achievement.title,
          pointsReward: achievement.pointsReward,
        });

        // Log achievement
        await ctx.db.insert("auditLog", {
          userId: args.userId,
          action: "achievement.unlocked",
          resourceType: "achievements",
          resourceId: achievement._id,
          metadata: { achievementId: achievement.achievementId, title: achievement.title },
          timestamp: now,
        });
      }
    }

    return { unlocked, count: unlocked.length };
  },
});

/**
 * Toggle achievement display on profile
 */
export const toggleAchievementDisplay = mutation({
  args: {
    userId: v.id("users"),
    achievementId: v.id("achievements"),
    displayed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userAchievement = await ctx.db
      .query("userAchievements")
      .withIndex("by_user_achievement", (q) =>
        q.eq("userId", args.userId).eq("achievementId", args.achievementId)
      )
      .unique();

    if (!userAchievement) {
      throw new Error("Achievement not unlocked");
    }

    await ctx.db.patch(userAchievement._id, {
      displayed: args.displayed,
    });

    return { success: true };
  },
});

// ============================================================================
// LEADERBOARD QUERIES
// ============================================================================

/**
 * Get leaderboard
 */
export const getLeaderboard = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    type: v.optional(
      v.union(
        v.literal("points"),
        v.literal("trading_volume"),
        v.literal("pnl"),
        v.literal("referrals"),
        v.literal("streak")
      )
    ),
    tierFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const type = args.type ?? "points";
    const limit = args.limit ?? 100;

    // Check for cached snapshot
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_period_type", (q) => q.eq("period", args.period).eq("type", type))
      .filter((q) =>
        args.tierFilter
          ? q.eq(q.field("tierFilter"), args.tierFilter)
          : q.eq(q.field("tierFilter"), undefined)
      )
      .first();

    if (snapshot && snapshot.expiresAt > Date.now()) {
      return {
        entries: snapshot.entries.slice(0, limit),
        totalParticipants: snapshot.totalParticipants,
        generatedAt: snapshot.generatedAt,
        cached: true,
      };
    }

    // Generate fresh leaderboard (for points type)
    if (type === "points") {
      const balances = await ctx.db
        .query("balances")
        .filter((q) =>
          q.and(
            q.eq(q.field("assetType"), "points"),
            q.eq(q.field("assetId"), "PULL_POINTS")
          )
        )
        .collect();

      // Sort by available points
      const sorted = balances.sort((a, b) => b.available - a.available);
      const top = sorted.slice(0, limit);

      // Enrich with user data
      const entries = await Promise.all(
        top.map(async (balance, index) => {
          const user = await ctx.db.get(balance.userId);
          const tier = await ctx.db
            .query("tiers")
            .withIndex("by_user", (q) => q.eq("userId", balance.userId))
            .unique();

          return {
            rank: index + 1,
            userId: balance.userId,
            username: user?.username ?? user?.displayName ?? "Anonymous",
            avatarUrl: user?.avatarUrl,
            score: balance.available,
            tier: tier?.currentTier ?? "bronze",
          };
        })
      );

      // Filter by tier if specified
      const filteredEntries = args.tierFilter
        ? entries.filter((e) => e.tier === args.tierFilter)
        : entries;

      return {
        entries: filteredEntries,
        totalParticipants: sorted.length,
        generatedAt: Date.now(),
        cached: false,
      };
    }

    return {
      entries: [],
      totalParticipants: 0,
      generatedAt: Date.now(),
      cached: false,
    };
  },
});

// ============================================================================
// ANTI-GAMING MUTATIONS
// ============================================================================

/**
 * Check velocity limits before earning points
 */
export const checkVelocityLimits = query({
  args: {
    userId: v.id("users"),
    actionType: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("pointsConfig")
      .withIndex("by_actionType", (q) => q.eq("actionType", args.actionType))
      .unique();

    if (!config || !config.dailyLimit) {
      return { allowed: true, remaining: null };
    }

    const today = new Date().toISOString().split("T")[0];
    const dailyCount = await ctx.db
      .query("dailyActionCounts")
      .withIndex("by_user_action_date", (q) =>
        q.eq("userId", args.userId).eq("actionType", args.actionType).eq("date", today!)
      )
      .unique();

    const currentCount = dailyCount?.count ?? 0;
    const remaining = config.dailyLimit - currentCount;

    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      dailyLimit: config.dailyLimit,
      currentCount,
    };
  },
});

/**
 * Increment daily action count
 */
export const incrementDailyAction = mutation({
  args: {
    userId: v.id("users"),
    actionType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0]!;

    const existing = await ctx.db
      .query("dailyActionCounts")
      .withIndex("by_user_action_date", (q) =>
        q.eq("userId", args.userId).eq("actionType", args.actionType).eq("date", today)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        lastActionAt: now,
      });
      return { count: existing.count + 1 };
    } else {
      await ctx.db.insert("dailyActionCounts", {
        userId: args.userId,
        actionType: args.actionType,
        date: today,
        count: 1,
        lastActionAt: now,
      });
      return { count: 1 };
    }
  },
});

/**
 * Flag suspicious activity
 */
export const flagSuspiciousActivity = mutation({
  args: {
    userId: v.id("users"),
    flagType: v.string(),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    description: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const flagId = await ctx.db.insert("antiGamingFlags", {
      userId: args.userId,
      flagType: args.flagType,
      severity: args.severity,
      description: args.description,
      metadata: args.metadata,
      resolved: false,
      createdAt: now,
    });

    // Log to audit
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "antigaming.flagged",
      resourceType: "antiGamingFlags",
      resourceId: flagId,
      metadata: {
        flagType: args.flagType,
        severity: args.severity,
      },
      timestamp: now,
    });

    return { flagId };
  },
});

// ============================================================================
// POINTS EARNING MUTATION
// ============================================================================

/**
 * Process points earning with all checks and multipliers
 */
export const processPointsEarning = mutation({
  args: {
    userId: v.id("users"),
    actionType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Get points config
    const config = await ctx.db
      .query("pointsConfig")
      .withIndex("by_actionType", (q) => q.eq("actionType", args.actionType))
      .unique();

    if (!config || !config.active) {
      throw new Error(`Points config not found or inactive for action: ${args.actionType}`);
    }

    // 2. Check daily limit
    if (config.dailyLimit) {
      const today = new Date().toISOString().split("T")[0]!;
      const dailyCount = await ctx.db
        .query("dailyActionCounts")
        .withIndex("by_user_action_date", (q) =>
          q.eq("userId", args.userId).eq("actionType", args.actionType).eq("date", today)
        )
        .unique();

      if (dailyCount && dailyCount.count >= config.dailyLimit) {
        return {
          success: false,
          message: "Daily limit exceeded",
          pointsEarned: 0,
        };
      }

      // Increment daily count
      if (dailyCount) {
        await ctx.db.patch(dailyCount._id, {
          count: dailyCount.count + 1,
          lastActionAt: now,
        });
      } else {
        await ctx.db.insert("dailyActionCounts", {
          userId: args.userId,
          actionType: args.actionType,
          date: today,
          count: 1,
          lastActionAt: now,
        });
      }
    }

    // 3. Calculate base points
    let basePoints = config.basePoints;

    // Apply metadata-based calculations
    if (config.multiplierRules && args.metadata) {
      const rules = config.multiplierRules as Record<string, number | boolean>;

      if (rules.per && args.metadata.amount) {
        basePoints = Math.floor((args.metadata.amount / rules.per) * config.basePoints);
      }

      if (rules.perDollar && args.metadata.profit) {
        basePoints = Math.floor(args.metadata.profit * config.basePoints);
      }

      if (rules.profitMultiplier && args.metadata.profit) {
        basePoints += Math.floor(args.metadata.profit * (rules.profitMultiplier as number));
      }

      if (rules.cap) {
        basePoints = Math.min(basePoints, rules.cap as number);
      }
    }

    // 4. Get streak multiplier
    let streakMultiplier = 1.0;
    if (
      config.multiplierRules &&
      (config.multiplierRules as Record<string, number>).streakMultiplier
    ) {
      const streak = await ctx.db
        .query("streaks")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("streakType", args.actionType)
        )
        .unique();

      if (streak) {
        const rules = config.multiplierRules as Record<string, number>;
        streakMultiplier = 1 + streak.currentCount * rules.streakMultiplier;
        if (rules.maxMultiplier) {
          streakMultiplier = Math.min(streakMultiplier, rules.maxMultiplier);
        }
      }
    }

    // 5. Get tier multiplier
    let tierMultiplier = 1.0;
    const tier = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (tier) {
      tierMultiplier = TIER_CONFIG[tier.currentTier].pointsMultiplier;
    }

    // 6. Calculate final points
    const totalMultiplier = streakMultiplier * tierMultiplier;
    const finalPoints = Math.floor(basePoints * totalMultiplier);

    // 7. Credit points
    const result = await creditPoints(ctx, {
      userId: args.userId,
      amount: finalPoints,
      type: args.actionType,
      description: config.description,
      baseAmount: basePoints,
      multiplierApplied: totalMultiplier,
      referenceType: args.metadata?.referenceType,
      referenceId: args.metadata?.referenceId,
    });

    // 8. Update streak
    await ctx.db
      .query("streaks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("streakType", args.actionType)
      )
      .unique()
      .then(async (existing) => {
        const oneDayMs = 24 * 60 * 60 * 1000;
        const twoDaysMs = 2 * oneDayMs;

        if (existing) {
          const timeSinceLastAction = now - existing.lastActionAt;
          const lastDate = new Date(existing.lastActionAt).toDateString();
          const todayDate = new Date(now).toDateString();

          if (lastDate !== todayDate) {
            if (timeSinceLastAction <= twoDaysMs) {
              const newCount = existing.currentCount + 1;
              await ctx.db.patch(existing._id, {
                currentCount: newCount,
                longestCount: Math.max(existing.longestCount, newCount),
                lastActionAt: now,
                currentMultiplier: calculateStreakMultiplier(args.actionType, newCount),
                updatedAt: now,
              });
            } else {
              await ctx.db.patch(existing._id, {
                currentCount: 1,
                lastActionAt: now,
                currentMultiplier: 1.0,
                updatedAt: now,
              });
            }
          }
        } else {
          await ctx.db.insert("streaks", {
            userId: args.userId,
            streakType: args.actionType,
            currentCount: 1,
            longestCount: 1,
            lastActionAt: now,
            currentMultiplier: 1.0,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

    // 9. Update tier
    if (tier) {
      const newLifetimePoints = tier.lifetimePoints + finalPoints;
      const newMonthPoints = tier.currentMonthPoints + finalPoints;
      const newTierName = getTierForPoints(newLifetimePoints);

      await ctx.db.patch(tier._id, {
        lifetimePoints: newLifetimePoints,
        currentMonthPoints: newMonthPoints,
        currentTier: newTierName,
        benefits: TIER_CONFIG[newTierName],
        lastActivityAt: now,
        updatedAt: now,
        ...(newTierName !== tier.currentTier ? { tierAchievedAt: now } : {}),
      });
    }

    return {
      success: true,
      pointsEarned: finalPoints,
      basePoints,
      multiplier: totalMultiplier,
      newBalance: result.newBalance,
      streakBonus: streakMultiplier > 1,
      tierBonus: tierMultiplier > 1,
    };
  },
});

// ============================================================================
// DAILY/WEEKLY RESET MUTATIONS (Called by Temporal)
// ============================================================================

/**
 * Reset daily quest progress
 */
export const resetDailyQuests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all daily quests
    const dailyQuests = await ctx.db
      .query("quests")
      .withIndex("by_type_active", (q) => q.eq("type", "daily").eq("active", true))
      .collect();

    const questIds = dailyQuests.map((q) => q._id);

    // Reset user progress for daily quests
    const userQuests = await ctx.db.query("userQuests").collect();

    let resetCount = 0;
    for (const uq of userQuests) {
      if (questIds.includes(uq.questId)) {
        await ctx.db.patch(uq._id, {
          progress: initializeQuestProgress(
            dailyQuests.find((q) => q._id === uq.questId)?.requirements ?? {}
          ),
          completed: false,
          claimed: false,
          startedAt: now,
          completedAt: undefined,
          claimedAt: undefined,
        });
        resetCount++;
      }
    }

    return { resetCount, questCount: dailyQuests.length };
  },
});

/**
 * Reset weekly quest progress
 */
export const resetWeeklyQuests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all weekly quests
    const weeklyQuests = await ctx.db
      .query("quests")
      .withIndex("by_type_active", (q) => q.eq("type", "weekly").eq("active", true))
      .collect();

    const questIds = weeklyQuests.map((q) => q._id);

    // Reset user progress for weekly quests
    const userQuests = await ctx.db.query("userQuests").collect();

    let resetCount = 0;
    for (const uq of userQuests) {
      if (questIds.includes(uq.questId)) {
        await ctx.db.patch(uq._id, {
          progress: initializeQuestProgress(
            weeklyQuests.find((q) => q._id === uq.questId)?.requirements ?? {}
          ),
          completed: false,
          claimed: false,
          startedAt: now,
          completedAt: undefined,
          claimedAt: undefined,
        });
        resetCount++;
      }
    }

    return { resetCount, questCount: weeklyQuests.length };
  },
});

/**
 * Check broken streaks
 */
export const checkBrokenStreaks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    // Find all streaks that haven't been updated in 2 days
    const allStreaks = await ctx.db.query("streaks").collect();

    const brokenStreaks = allStreaks.filter((s) => s.lastActionAt < twoDaysAgo);

    let brokenCount = 0;
    for (const streak of brokenStreaks) {
      if (streak.currentCount > 0) {
        await ctx.db.patch(streak._id, {
          currentCount: 0,
          currentMultiplier: 1.0,
          updatedAt: now,
        });
        brokenCount++;
      }
    }

    return { brokenCount, totalChecked: allStreaks.length };
  },
});

/**
 * Process monthly point decay
 */
export const processMonthlyDecay = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

    const tiers = await ctx.db.query("tiers").collect();

    let decayedCount = 0;
    const tierChanges: Array<{ userId: Id<"users">; from: string; to: string }> = [];

    for (const tier of tiers) {
      if (tier.lifetimePoints <= 1000) continue;

      let decayPercent = 0;
      if (tier.lastActivityAt < sixtyDaysAgo) {
        decayPercent = 0.2; // 20% decay
      } else if (tier.lastActivityAt < thirtyDaysAgo) {
        decayPercent = 0.1; // 10% decay
      }

      if (decayPercent > 0) {
        const decayAmount = Math.floor(tier.lifetimePoints * decayPercent);
        const newLifetimePoints = tier.lifetimePoints - decayAmount;
        const newTierName = getTierForPoints(newLifetimePoints);

        if (newTierName !== tier.currentTier) {
          tierChanges.push({
            userId: tier.userId,
            from: tier.currentTier,
            to: newTierName,
          });
        }

        await ctx.db.patch(tier._id, {
          lifetimePoints: newLifetimePoints,
          currentTier: newTierName,
          benefits: TIER_CONFIG[newTierName],
          currentMonthPoints: 0, // Reset monthly
          updatedAt: now,
        });

        // Log decay
        await ctx.db.insert("auditLog", {
          userId: tier.userId,
          action: "points.decay",
          resourceType: "tiers",
          resourceId: tier._id,
          metadata: {
            decayPercent,
            decayAmount,
            newLifetimePoints,
          },
          timestamp: now,
        });

        decayedCount++;
      } else {
        // Just reset monthly points
        await ctx.db.patch(tier._id, {
          currentMonthPoints: 0,
          updatedAt: now,
        });
      }
    }

    return { decayedCount, tierChanges };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

type TierName = "bronze" | "silver" | "gold" | "platinum" | "diamond";

function getTierForPoints(points: number): TierName {
  if (points >= TIER_CONFIG.diamond.threshold) return "diamond";
  if (points >= TIER_CONFIG.platinum.threshold) return "platinum";
  if (points >= TIER_CONFIG.gold.threshold) return "gold";
  if (points >= TIER_CONFIG.silver.threshold) return "silver";
  return "bronze";
}

function getNextTierName(current: TierName): TierName | null {
  const order: TierName[] = ["bronze", "silver", "gold", "platinum", "diamond"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1]! : null;
}

function calculateStreakMultiplier(streakType: string, count: number): number {
  // Different streak types can have different multiplier curves
  const baseMultiplier = 0.1;
  const maxMultiplier = 3.0;

  const multiplier = 1 + count * baseMultiplier;
  return Math.min(multiplier, maxMultiplier);
}

function initializeQuestProgress(requirements: Record<string, unknown>): Record<string, number> {
  const progress: Record<string, number> = {};

  if (requirements.type === "trades_count") {
    progress.current = 0;
  } else if (requirements.type === "markets_viewed") {
    progress.current = 0;
  } else if (requirements.type === "messages_sent") {
    progress.current = 0;
  } else if (requirements.type === "signals_reviewed") {
    progress.current = 0;
  } else if (requirements.type === "categories_traded") {
    progress.current = 0;
  } else if (requirements.type === "prediction_streak") {
    progress.current = 0;
  } else if (requirements.type === "followers_gained") {
    progress.current = 0;
  } else if (requirements.type === "referral_kyc") {
    progress.current = 0;
  } else if (requirements.type === "trade_volume") {
    progress.current = 0;
  } else if (requirements.type === "login_before") {
    progress.completed = 0;
  } else {
    progress.current = 0;
  }

  return progress;
}

function mergeQuestProgress(
  current: Record<string, number>,
  update: Record<string, number>
): Record<string, number> {
  const merged = { ...current };

  for (const key of Object.keys(update)) {
    if (key === "increment") {
      merged.current = (merged.current ?? 0) + (update.increment ?? 0);
    } else if (key === "set") {
      merged.current = update.set ?? 0;
    } else if (key === "completed") {
      merged.completed = update.completed ?? 0;
    } else {
      merged[key] = (merged[key] ?? 0) + (update[key] ?? 0);
    }
  }

  return merged;
}

function checkQuestCompletion(
  requirements: Record<string, unknown>,
  progress: Record<string, number>
): boolean {
  const reqType = requirements.type as string;
  const target = requirements.target as number | undefined;

  if (reqType === "login_before") {
    return (progress.completed ?? 0) >= 1;
  }

  if (target !== undefined) {
    return (progress.current ?? 0) >= target;
  }

  return false;
}

function checkAchievementRequirement(
  requirement: Record<string, unknown>,
  stats: Record<string, number>
): boolean {
  const reqType = requirement.type as string;
  const target = requirement.target as number | undefined;

  switch (reqType) {
    case "total_trades":
      return (stats.totalTrades ?? 0) >= (target ?? 0);
    case "correct_predictions":
      return (stats.correctPredictions ?? 0) >= (target ?? 0);
    case "win_rate": {
      const minTrades = requirement.minTrades as number | undefined;
      if ((stats.totalTrades ?? 0) < (minTrades ?? 0)) return false;
      const winRate = (stats.correctPredictions ?? 0) / (stats.totalTrades || 1);
      return winRate >= (target ?? 0);
    }
    case "followers":
      return (stats.followers ?? 0) >= (target ?? 0);
    case "lifetime_volume":
      return (stats.lifetimeVolume ?? 0) >= (target ?? 0);
    case "unique_markets":
      return (stats.uniqueMarkets ?? 0) >= (target ?? 0);
    case "hold_duration": {
      if (requirement.mustBeWinning && !stats.hasWinningPosition) return false;
      return (stats.longestHoldDays ?? 0) >= (target ?? 0);
    }
    case "login_streak":
      return (stats.loginStreak ?? 0) >= (target ?? 0);
    case "referrals":
      return (stats.referrals ?? 0) >= (target ?? 0);
    case "early_signup": {
      const daysFromLaunch = requirement.daysFromLaunch as number | undefined;
      return (stats.accountAgeDays ?? Infinity) <= (daysFromLaunch ?? 0);
    }
    default:
      return false;
  }
}

async function creditPoints(
  ctx: {
    db: {
      query: (table: string) => {
        withIndex: (
          name: string,
          fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown
        ) => {
          unique: () => Promise<{
            _id: Id<"balances">;
            available: number;
            pending: number;
          } | null>;
        };
      };
      get: (id: Id<"balances">) => Promise<{
        _id: Id<"balances">;
        available: number;
        pending: number;
      } | null>;
      patch: (
        id: Id<"balances">,
        data: Record<string, unknown>
      ) => Promise<void>;
      insert: (table: string, data: Record<string, unknown>) => Promise<Id<"balances"> | Id<"pointsTransactions">>;
    };
  },
  args: {
    userId: Id<"users">;
    amount: number;
    type: string;
    description: string;
    baseAmount?: number;
    multiplierApplied?: number;
    referenceType?: string;
    referenceId?: Id<"quests"> | Id<"achievements"> | string;
  }
): Promise<{ transactionId: Id<"pointsTransactions">; newBalance: number }> {
  const now = Date.now();

  // Get or create balance
  let balance = await ctx.db
    .query("balances")
    .withIndex("by_user_asset", (q: { eq: (field: string, value: unknown) => unknown }) =>
      q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
    )
    .unique();

  if (balance) {
    await ctx.db.patch(balance._id, {
      available: balance.available + args.amount,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("balances", {
      userId: args.userId,
      assetType: "points",
      assetId: "PULL_POINTS",
      symbol: "PTS",
      available: args.amount,
      held: 0,
      pending: 0,
      updatedAt: now,
    });
  }

  const newBalance = (balance?.available ?? 0) + args.amount;

  // Record transaction
  const txId = (await ctx.db.insert("pointsTransactions", {
    userId: args.userId,
    type: args.type,
    amount: args.amount,
    balance: newBalance,
    status: "completed",
    description: args.description,
    referenceType: args.referenceType,
    referenceId: args.referenceId?.toString(),
    baseAmount: args.baseAmount,
    multiplierApplied: args.multiplierApplied,
    createdAt: now,
    completedAt: now,
  })) as Id<"pointsTransactions">;

  return { transactionId: txId, newBalance };
}
