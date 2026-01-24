import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Gamification System - Quests, Streaks, Tiers, Achievements, Competitions
 */

// ============================================================================
// POINTS CONFIG
// ============================================================================

/**
 * Get points config for an action
 */
export const getPointsConfig = query({
  args: { actionType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pointsConfig")
      .withIndex("by_action", (q) => q.eq("actionType", args.actionType))
      .unique();
  },
});

/**
 * Get all active points configs
 */
export const getAllPointsConfigs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("pointsConfig")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Create or update points config
 */
export const upsertPointsConfig = mutation({
  args: {
    actionType: v.string(),
    basePoints: v.number(),
    description: v.string(),
    category: v.union(
      v.literal("trading"),
      v.literal("social"),
      v.literal("engagement"),
      v.literal("milestone"),
      v.literal("referral"),
      v.literal("special")
    ),
    multipliers: v.object({
      tierBonus: v.boolean(),
      streakBonus: v.boolean(),
      volumeBonus: v.boolean(),
      seasonalBonus: v.boolean(),
    }),
    conditions: v.optional(
      v.object({
        minAmount: v.optional(v.number()),
        maxDaily: v.optional(v.number()),
        requiresKyc: v.optional(v.boolean()),
        requiredTier: v.optional(v.string()),
      })
    ),
    cooldownSeconds: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pointsConfig")
      .withIndex("by_action", (q) => q.eq("actionType", args.actionType))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pointsConfig", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// STREAKS
// ============================================================================

/**
 * Get user streak by type
 */
export const getUserStreak = query({
  args: {
    userId: v.id("users"),
    streakType: v.union(
      v.literal("daily_login"),
      v.literal("daily_trade"),
      v.literal("weekly_deposit"),
      v.literal("prediction_win"),
      v.literal("rwa_purchase")
    ),
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
 * Get all user streaks
 */
export const getAllUserStreaks = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Update or create user streak
 */
export const updateStreak = mutation({
  args: {
    userId: v.id("users"),
    streakType: v.union(
      v.literal("daily_login"),
      v.literal("daily_trade"),
      v.literal("weekly_deposit"),
      v.literal("prediction_win"),
      v.literal("rwa_purchase")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0]!;
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

    const existing = await ctx.db
      .query("streaks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("streakType", args.streakType)
      )
      .unique();

    if (existing) {
      // Already updated today
      if (existing.lastActionDate === today) {
        return {
          streakId: existing._id,
          currentCount: existing.currentCount,
          wasReset: false,
          isNewRecord: false,
        };
      }

      // Check if streak continues or resets
      const continuesStreak = existing.lastActionDate === yesterday ||
        (existing.frozenUntil && existing.frozenUntil > now);

      const newCount = continuesStreak ? existing.currentCount + 1 : 1;
      const isNewRecord = newCount > existing.longestCount;

      await ctx.db.patch(existing._id, {
        currentCount: newCount,
        longestCount: isNewRecord ? newCount : existing.longestCount,
        lastActionAt: now,
        lastActionDate: today,
        multiplierActive: newCount >= 7,
        multiplierExpiresAt: newCount >= 7 ? now + 24 * 60 * 60 * 1000 : undefined,
        updatedAt: now,
      });

      return {
        streakId: existing._id,
        currentCount: newCount,
        wasReset: !continuesStreak,
        isNewRecord,
      };
    }

    // Create new streak
    const streakId = await ctx.db.insert("streaks", {
      userId: args.userId,
      streakType: args.streakType,
      currentCount: 1,
      longestCount: 1,
      lastActionAt: now,
      lastActionDate: today,
      multiplierActive: false,
      createdAt: now,
      updatedAt: now,
    });

    return {
      streakId,
      currentCount: 1,
      wasReset: false,
      isNewRecord: true,
    };
  },
});

/**
 * Freeze streak (premium feature)
 */
export const freezeStreak = mutation({
  args: {
    userId: v.id("users"),
    streakType: v.union(
      v.literal("daily_login"),
      v.literal("daily_trade"),
      v.literal("weekly_deposit"),
      v.literal("prediction_win"),
      v.literal("rwa_purchase")
    ),
    durationDays: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("streaks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("streakType", args.streakType)
      )
      .unique();

    if (!existing) {
      throw new Error("Streak not found");
    }

    await ctx.db.patch(existing._id, {
      frozenUntil: now + args.durationDays * 24 * 60 * 60 * 1000,
      updatedAt: now,
    });

    return { success: true, frozenUntil: now + args.durationDays * 24 * 60 * 60 * 1000 };
  },
});

/**
 * Check and reset broken streaks (called by scheduled job)
 */
export const checkBrokenStreaks = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

    // Get all streaks that haven't been updated in the last day
    const allStreaks = await ctx.db.query("streaks").collect();

    let resetCount = 0;
    for (const streak of allStreaks) {
      // Skip frozen streaks
      if (streak.frozenUntil && streak.frozenUntil > now) {
        continue;
      }

      // Check if streak is broken (not updated yesterday or today)
      if (streak.lastActionDate < twoDaysAgo && streak.currentCount > 0) {
        await ctx.db.patch(streak._id, {
          currentCount: 0,
          multiplierActive: false,
          multiplierExpiresAt: undefined,
          updatedAt: now,
        });
        resetCount++;
      }
    }

    return { resetCount };
  },
});

// ============================================================================
// QUESTS
// ============================================================================

/**
 * Get active quests for user
 */
export const getActiveQuests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const quests = await ctx.db
      .query("quests")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();

    // Enrich with quest definitions
    const enrichedQuests = await Promise.all(
      quests.map(async (quest) => {
        const definition = await ctx.db.get(quest.questDefinitionId);
        return { ...quest, definition };
      })
    );

    return enrichedQuests;
  },
});

/**
 * Get available quest definitions
 */
export const getQuestDefinitions = query({
  args: {
    category: v.optional(
      v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("special")
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      return await ctx.db
        .query("questDefinitions")
        .withIndex("by_category", (q) =>
          q.eq("category", args.category!).eq("isActive", true)
        )
        .collect();
    }

    return await ctx.db
      .query("questDefinitions")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Start a quest for user
 */
export const startQuest = mutation({
  args: {
    userId: v.id("users"),
    questDefinitionId: v.id("questDefinitions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const definition = await ctx.db.get(args.questDefinitionId);
    if (!definition) {
      throw new Error("Quest definition not found");
    }

    if (!definition.isActive) {
      throw new Error("Quest is not active");
    }

    // Check if user already has this quest active
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_user_quest", (q) =>
        q.eq("userId", args.userId).eq("questId", definition.questId)
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "completed")
        )
      )
      .first();

    if (existing) {
      throw new Error("Quest already started or completed");
    }

    const expiresAt = now + definition.expiresAfterHours * 60 * 60 * 1000;

    const questId = await ctx.db.insert("quests", {
      userId: args.userId,
      questDefinitionId: args.questDefinitionId,
      questId: definition.questId,
      progress: 0,
      targetValue: definition.targetValue,
      progressPercentage: 0,
      status: "active",
      startedAt: now,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return { questId, expiresAt };
  },
});

/**
 * Update quest progress
 */
export const updateQuestProgress = mutation({
  args: {
    userId: v.id("users"),
    questType: v.string(),
    incrementValue: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find active quests matching this type
    const activeQuests = await ctx.db
      .query("quests")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();

    const updated: string[] = [];
    const completed: string[] = [];

    for (const quest of activeQuests) {
      // Check if expired
      if (quest.expiresAt < now) {
        await ctx.db.patch(quest._id, {
          status: "expired",
          updatedAt: now,
        });
        continue;
      }

      const definition = await ctx.db.get(quest.questDefinitionId);
      if (!definition || definition.type !== args.questType) {
        continue;
      }

      const newProgress = Math.min(
        quest.progress + args.incrementValue,
        quest.targetValue
      );
      const progressPercentage = Math.floor(
        (newProgress / quest.targetValue) * 100
      );
      const isCompleted = newProgress >= quest.targetValue;

      await ctx.db.patch(quest._id, {
        progress: newProgress,
        progressPercentage,
        status: isCompleted ? "completed" : "active",
        completedAt: isCompleted ? now : undefined,
        updatedAt: now,
      });

      updated.push(quest.questId);
      if (isCompleted) {
        completed.push(quest.questId);
      }
    }

    return { updated, completed };
  },
});

/**
 * Claim quest rewards
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

    if (quest.userId !== args.userId) {
      throw new Error("Quest does not belong to user");
    }

    if (quest.status !== "completed") {
      throw new Error("Quest is not completed");
    }

    const definition = await ctx.db.get(quest.questDefinitionId);
    if (!definition) {
      throw new Error("Quest definition not found");
    }

    // Update quest as claimed
    await ctx.db.patch(args.questId, {
      status: "claimed",
      claimedAt: now,
      pointsEarned: definition.pointsReward,
      tokensEarned: definition.tokenReward,
      badgeEarned: definition.badgeReward,
      updatedAt: now,
    });

    // Note: Actual points/token crediting happens in workflow

    return {
      pointsReward: definition.pointsReward,
      tokenReward: definition.tokenReward,
      badgeReward: definition.badgeReward,
    };
  },
});

/**
 * Assign daily quests to user
 */
export const assignDailyQuests = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0]!;

    // Check if already assigned today
    const todayQuests = await ctx.db
      .query("quests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => {
        const questDate = new Date(q.field("startedAt")).toISOString().split("T")[0]!;
        return q.eq(questDate, today);
      })
      .first();

    if (todayQuests) {
      return { assigned: false, reason: "Already assigned today" };
    }

    // Get daily quest definitions
    const dailyQuests = await ctx.db
      .query("questDefinitions")
      .withIndex("by_category", (q) =>
        q.eq("category", "daily").eq("isActive", true)
      )
      .collect();

    // Randomly select 3 daily quests
    const shuffled = dailyQuests.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    const assignedIds: string[] = [];
    for (const definition of selected) {
      const expiresAt = now + definition.expiresAfterHours * 60 * 60 * 1000;

      const questId = await ctx.db.insert("quests", {
        userId: args.userId,
        questDefinitionId: definition._id,
        questId: definition.questId,
        progress: 0,
        targetValue: definition.targetValue,
        progressPercentage: 0,
        status: "active",
        startedAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      assignedIds.push(questId);
    }

    return { assigned: true, questIds: assignedIds };
  },
});

// ============================================================================
// TIERS
// ============================================================================

/**
 * Get user tier
 */
export const getUserTier = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Initialize or update user tier
 */
export const updateUserTier = mutation({
  args: {
    userId: v.id("users"),
    lifetimePoints: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Calculate tier from lifetime points
    const tierThresholds = [
      { tier: "diamond" as const, points: 100000, multiplier: 2.5 },
      { tier: "platinum" as const, points: 50000, multiplier: 2.0 },
      { tier: "gold" as const, points: 25000, multiplier: 1.5 },
      { tier: "silver" as const, points: 10000, multiplier: 1.25 },
      { tier: "bronze" as const, points: 0, multiplier: 1.0 },
    ];

    const currentTierInfo = tierThresholds.find(
      (t) => args.lifetimePoints >= t.points
    )!;

    const nextTierInfo = tierThresholds.find(
      (t) => t.points > args.lifetimePoints
    );

    const existing = await ctx.db
      .query("tiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const tierData = {
      tierLevel: currentTierInfo.tier,
      lifetimePoints: args.lifetimePoints,
      currentPeriodPoints: args.lifetimePoints, // Could track separately
      multiplier: currentTierInfo.multiplier,
      nextTier: nextTierInfo?.tier,
      pointsToNextTier: nextTierInfo
        ? nextTierInfo.points - args.lifetimePoints
        : 0,
      tierDowngradeWarning: false,
      updatedAt: now,
    };

    if (existing) {
      const upgraded = tierThresholds.indexOf(
        tierThresholds.find((t) => t.tier === existing.tierLevel)!
      ) > tierThresholds.indexOf(currentTierInfo);

      await ctx.db.patch(existing._id, {
        ...tierData,
        previousTier: upgraded ? existing.tierLevel : existing.previousTier,
        tierAchievedAt: upgraded ? now : existing.tierAchievedAt,
      });

      return {
        tierId: existing._id,
        tier: currentTierInfo.tier,
        upgraded,
        previousTier: existing.tierLevel,
      };
    }

    const tierId = await ctx.db.insert("tiers", {
      userId: args.userId,
      ...tierData,
      tierAchievedAt: now,
      benefitsUsed: {
        freeWithdrawals: 0,
        prioritySupport: false,
        exclusiveRewards: 0,
      },
      createdAt: now,
    });

    return {
      tierId,
      tier: currentTierInfo.tier,
      upgraded: false,
      previousTier: undefined,
    };
  },
});

/**
 * Check tier downgrade warnings
 */
export const checkTierDowngrades = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    // Get tiers that might expire soon
    const expiringTiers = await ctx.db
      .query("tiers")
      .withIndex("by_expiry", (q) => q.lt("tierExpiresAt", thirtyDaysFromNow))
      .collect();

    let warningCount = 0;
    for (const tier of expiringTiers) {
      if (!tier.tierDowngradeWarning) {
        await ctx.db.patch(tier._id, {
          tierDowngradeWarning: true,
          updatedAt: now,
        });
        warningCount++;
      }
    }

    return { warningCount };
  },
});

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

/**
 * Get user achievements
 */
export const getUserAchievements = query({
  args: {
    userId: v.id("users"),
    unlockedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("userAchievements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    const achievements = await query.collect();

    // Enrich with definitions
    const enrichedAchievements = await Promise.all(
      achievements
        .filter((a) => !args.unlockedOnly || a.isUnlocked)
        .map(async (achievement) => {
          const definition = await ctx.db.get(achievement.achievementDefinitionId);
          return { ...achievement, definition };
        })
    );

    return enrichedAchievements;
  },
});

/**
 * Get achievement definitions
 */
export const getAchievementDefinitions = query({
  args: {
    category: v.optional(v.string()),
    includeSecret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let achievements = await ctx.db
      .query("achievementDefinitions")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (args.category) {
      achievements = achievements.filter((a) => a.category === args.category);
    }

    if (!args.includeSecret) {
      achievements = achievements.filter((a) => !a.isSecret);
    }

    return achievements;
  },
});

/**
 * Update achievement progress
 */
export const updateAchievementProgress = mutation({
  args: {
    userId: v.id("users"),
    requirementType: v.string(),
    currentValue: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find matching achievement definitions
    const definitions = await ctx.db
      .query("achievementDefinitions")
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("requirementType"), args.requirementType)
        )
      )
      .collect();

    const updated: string[] = [];
    const unlocked: string[] = [];

    for (const definition of definitions) {
      // Get or create user achievement record
      let userAchievement = await ctx.db
        .query("userAchievements")
        .withIndex("by_user_achievement", (q) =>
          q.eq("userId", args.userId).eq("achievementId", definition.achievementId)
        )
        .unique();

      if (!userAchievement) {
        const id = await ctx.db.insert("userAchievements", {
          userId: args.userId,
          achievementDefinitionId: definition._id,
          achievementId: definition.achievementId,
          progress: 0,
          targetValue: definition.requirementValue,
          progressPercentage: 0,
          isUnlocked: false,
          createdAt: now,
          updatedAt: now,
        });
        userAchievement = await ctx.db.get(id);
      }

      if (!userAchievement || userAchievement.isUnlocked) {
        continue;
      }

      const newProgress = Math.min(args.currentValue, definition.requirementValue);
      const progressPercentage = Math.floor(
        (newProgress / definition.requirementValue) * 100
      );
      const isUnlocked = newProgress >= definition.requirementValue;

      await ctx.db.patch(userAchievement._id, {
        progress: newProgress,
        progressPercentage,
        isUnlocked,
        unlockedAt: isUnlocked ? now : undefined,
        updatedAt: now,
      });

      updated.push(definition.achievementId);
      if (isUnlocked) {
        unlocked.push(definition.achievementId);
      }
    }

    return { updated, unlocked };
  },
});

/**
 * Claim achievement reward
 */
export const claimAchievementReward = mutation({
  args: {
    userId: v.id("users"),
    userAchievementId: v.id("userAchievements"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const userAchievement = await ctx.db.get(args.userAchievementId);
    if (!userAchievement) {
      throw new Error("Achievement not found");
    }

    if (userAchievement.userId !== args.userId) {
      throw new Error("Achievement does not belong to user");
    }

    if (!userAchievement.isUnlocked) {
      throw new Error("Achievement not unlocked");
    }

    if (userAchievement.claimedAt) {
      throw new Error("Already claimed");
    }

    const definition = await ctx.db.get(userAchievement.achievementDefinitionId);
    if (!definition) {
      throw new Error("Achievement definition not found");
    }

    await ctx.db.patch(args.userAchievementId, {
      claimedAt: now,
      pointsEarned: definition.pointsReward,
      tokensEarned: definition.tokenReward,
      updatedAt: now,
    });

    return {
      pointsReward: definition.pointsReward,
      tokenReward: definition.tokenReward,
    };
  },
});

// ============================================================================
// COMPETITIONS
// ============================================================================

/**
 * Get active competitions
 */
export const getActiveCompetitions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("competitions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

/**
 * Get competition details
 */
export const getCompetition = query({
  args: { competitionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("competitions")
      .withIndex("by_competition_id", (q) =>
        q.eq("competitionId", args.competitionId)
      )
      .unique();
  },
});

/**
 * Get competition leaderboard
 */
export const getCompetitionLeaderboard = query({
  args: {
    competitionId: v.id("competitions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const participants = await ctx.db
      .query("competitionParticipants")
      .withIndex("by_competition", (q) => q.eq("competitionId", args.competitionId))
      .collect();

    // Sort by score descending
    const sorted = participants
      .filter((p) => p.isActive && !p.isDisqualified)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.limit ?? 100);

    // Enrich with user data
    const leaderboard = await Promise.all(
      sorted.map(async (participant, index) => {
        const user = await ctx.db.get(participant.userId);
        return {
          rank: index + 1,
          userId: participant.userId,
          username: user?.username ?? user?.displayName ?? "Anonymous",
          avatarUrl: user?.avatarUrl,
          score: participant.score,
          previousRank: participant.previousRank,
          rankChange: participant.previousRank
            ? participant.previousRank - (index + 1)
            : 0,
        };
      })
    );

    return leaderboard;
  },
});

/**
 * Join competition
 */
export const joinCompetition = mutation({
  args: {
    userId: v.id("users"),
    competitionId: v.id("competitions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const competition = await ctx.db.get(args.competitionId);
    if (!competition) {
      throw new Error("Competition not found");
    }

    if (competition.status !== "active" && competition.status !== "upcoming") {
      throw new Error("Competition is not open for registration");
    }

    if (competition.maxParticipants && competition.participantCount >= competition.maxParticipants) {
      throw new Error("Competition is full");
    }

    // Check if already joined
    const existing = await ctx.db
      .query("competitionParticipants")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", args.userId)
      )
      .unique();

    if (existing) {
      throw new Error("Already joined this competition");
    }

    // TODO: Check tier requirement and entry fee

    const participantId = await ctx.db.insert("competitionParticipants", {
      competitionId: args.competitionId,
      userId: args.userId,
      score: 0,
      lastActivityAt: now,
      activityCount: 0,
      prizeClaimed: false,
      isActive: true,
      isDisqualified: false,
      joinedAt: now,
      updatedAt: now,
    });

    // Update participant count
    await ctx.db.patch(args.competitionId, {
      participantCount: competition.participantCount + 1,
      updatedAt: now,
    });

    return { participantId };
  },
});

/**
 * Update competition score
 */
export const updateCompetitionScore = mutation({
  args: {
    userId: v.id("users"),
    competitionId: v.id("competitions"),
    scoreIncrement: v.number(),
    activityType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const competition = await ctx.db.get(args.competitionId);
    if (!competition || competition.status !== "active") {
      return { updated: false, reason: "Competition not active" };
    }

    const participant = await ctx.db
      .query("competitionParticipants")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", args.userId)
      )
      .unique();

    if (!participant || !participant.isActive || participant.isDisqualified) {
      return { updated: false, reason: "Not an active participant" };
    }

    const newScore = participant.score + args.scoreIncrement;

    await ctx.db.patch(participant._id, {
      score: newScore,
      lastActivityAt: now,
      activityCount: participant.activityCount + 1,
      updatedAt: now,
    });

    // Update competition volume if applicable
    if (args.activityType === "trade_volume") {
      await ctx.db.patch(args.competitionId, {
        totalVolume: competition.totalVolume + args.scoreIncrement,
        updatedAt: now,
      });
    }

    return { updated: true, newScore };
  },
});

/**
 * Finalize competition and distribute prizes
 */
export const finalizeCompetition = mutation({
  args: {
    competitionId: v.id("competitions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const competition = await ctx.db.get(args.competitionId);
    if (!competition) {
      throw new Error("Competition not found");
    }

    if (competition.status !== "active") {
      throw new Error("Competition is not active");
    }

    // Update to calculating status
    await ctx.db.patch(args.competitionId, {
      status: "calculating",
      updatedAt: now,
    });

    // Get all participants sorted by score
    const participants = await ctx.db
      .query("competitionParticipants")
      .withIndex("by_competition", (q) => q.eq("competitionId", args.competitionId))
      .collect();

    const sorted = participants
      .filter((p) => p.isActive && !p.isDisqualified)
      .sort((a, b) => b.score - a.score);

    // Assign ranks and prizes
    for (let i = 0; i < sorted.length; i++) {
      const participant = sorted[i]!;
      const rank = i + 1;

      // Find applicable prize
      const prize = competition.prizeDistribution.find(
        (p) => rank >= p.rankStart && rank <= p.rankEnd
      );

      await ctx.db.patch(participant._id, {
        rank,
        prizeWon: prize?.pointsPrize,
        prizeTokens: prize?.tokenPrize,
        specialPrize: prize?.specialPrize,
        updatedAt: now,
      });
    }

    // Mark competition as completed
    await ctx.db.patch(args.competitionId, {
      status: "completed",
      resultsTime: now,
      updatedAt: now,
    });

    return { winnersCount: sorted.length };
  },
});

/**
 * Claim competition prize
 */
export const claimCompetitionPrize = mutation({
  args: {
    userId: v.id("users"),
    competitionId: v.id("competitions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const participant = await ctx.db
      .query("competitionParticipants")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", args.userId)
      )
      .unique();

    if (!participant) {
      throw new Error("Not a participant");
    }

    if (participant.prizeClaimed) {
      throw new Error("Prize already claimed");
    }

    if (!participant.prizeWon && !participant.prizeTokens) {
      throw new Error("No prize won");
    }

    await ctx.db.patch(participant._id, {
      prizeClaimed: true,
      prizeClaimedAt: now,
      updatedAt: now,
    });

    return {
      pointsPrize: participant.prizeWon,
      tokenPrize: participant.prizeTokens,
      specialPrize: participant.specialPrize,
    };
  },
});

// ============================================================================
// MULTIPLIER EVENTS
// ============================================================================

/**
 * Get active multiplier events
 */
export const getActiveMultipliers = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();

    const multipliers = await ctx.db
      .query("multiplierEvents")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter to only active time-wise
    return multipliers.filter(
      (m) => m.startTime <= now && m.endTime >= now
    );
  },
});

/**
 * Create multiplier event
 */
export const createMultiplierEvent = mutation({
  args: {
    eventId: v.string(),
    name: v.string(),
    description: v.string(),
    multiplierValue: v.number(),
    appliesTo: v.array(v.string()),
    appliesToTiers: v.optional(v.array(v.string())),
    startTime: v.number(),
    endTime: v.number(),
    maxUsesPerUser: v.optional(v.number()),
    maxTotalUses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("multiplierEvents", {
      ...args,
      currentUses: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// POINTS DEPRECIATION
// ============================================================================

/**
 * Process points depreciation (called monthly)
 */
export const depreciatePoints = mutation({
  args: {
    depreciationRate: v.number(), // e.g., 0.05 for 5%
    minPointsThreshold: v.number(), // Don't depreciate below this
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get all user point balances
    const balances = await ctx.db
      .query("balances")
      .filter((q) =>
        q.and(
          q.eq(q.field("assetType"), "points"),
          q.eq(q.field("assetId"), "PULL_POINTS")
        )
      )
      .collect();

    let depreciated = 0;
    let totalDepreciation = 0;

    for (const balance of balances) {
      if (balance.available <= args.minPointsThreshold) {
        continue;
      }

      const depreciationAmount = Math.floor(
        balance.available * args.depreciationRate
      );

      if (depreciationAmount > 0) {
        const newBalance = balance.available - depreciationAmount;

        await ctx.db.patch(balance._id, {
          available: newBalance,
          updatedAt: now,
        });

        // Record transaction
        await ctx.db.insert("pointsTransactions", {
          userId: balance.userId,
          type: "depreciation",
          amount: -depreciationAmount,
          balance: newBalance,
          status: "completed",
          description: `Monthly points depreciation (${args.depreciationRate * 100}%)`,
          createdAt: now,
          completedAt: now,
        });

        depreciated++;
        totalDepreciation += depreciationAmount;
      }
    }

    return { usersAffected: depreciated, totalDepreciation };
  },
});
