/**
 * Achievement Service
 *
 * Manages achievement definitions, user progress, unlocks, and rewards.
 */

import {
  type AchievementDefinition,
  type UserAchievement,
  type AchievementUnlockEvent,
  type AchievementProgressEvent,
  type AchievementStats,
  type AchievementShowcase,
  type AchievementLeaderboardEntry,
  type AchievementCategory,
  type AchievementRarity,
  type AchievementTrigger,
  type UpdateAchievementDisplayInput,
  type ClaimAchievementRewardsInput,
  ACHIEVEMENT_DEFINITIONS,
} from "./types";
import { AchievementRewardsProcessor } from "./rewards";

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class AchievementService {
  private definitions: Map<string, AchievementDefinition> = new Map();
  private userAchievements: Map<string, Map<string, UserAchievement>> = new Map();
  private rewardsProcessor: AchievementRewardsProcessor;

  constructor() {
    this.rewardsProcessor = new AchievementRewardsProcessor();
    this.initializeDefinitions();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeDefinitions(): void {
    const now = Date.now();
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      this.definitions.set(def.id, {
        ...def,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ============================================================================
  // ACHIEVEMENT DEFINITIONS
  // ============================================================================

  /**
   * Get all achievement definitions
   */
  async getDefinitions(
    options?: {
      category?: AchievementCategory;
      rarity?: AchievementRarity;
      includeHidden?: boolean;
      includeExpired?: boolean;
    }
  ): Promise<AchievementDefinition[]> {
    let definitions = Array.from(this.definitions.values());

    if (options?.category) {
      definitions = definitions.filter((d) => d.category === options.category);
    }

    if (options?.rarity) {
      definitions = definitions.filter((d) => d.rarity === options.rarity);
    }

    if (!options?.includeHidden) {
      definitions = definitions.filter((d) => !d.isHidden);
    }

    if (!options?.includeExpired) {
      const now = Date.now();
      definitions = definitions.filter(
        (d) => !d.availableUntil || d.availableUntil > now
      );
    }

    return definitions;
  }

  /**
   * Get achievement definition by ID
   */
  async getDefinition(achievementId: string): Promise<AchievementDefinition | null> {
    return this.definitions.get(achievementId) ?? null;
  }

  // ============================================================================
  // USER ACHIEVEMENTS
  // ============================================================================

  /**
   * Get user's achievements
   */
  async getUserAchievements(
    userId: string,
    options?: {
      status?: "locked" | "in_progress" | "unlocked";
      category?: AchievementCategory;
    }
  ): Promise<UserAchievement[]> {
    const userMap = this.userAchievements.get(userId);
    if (!userMap) {
      // Initialize achievements for new user
      await this.initializeUserAchievements(userId);
      return this.getUserAchievements(userId, options);
    }

    let achievements = Array.from(userMap.values());

    if (options?.status) {
      achievements = achievements.filter((a) => a.status === options.status);
    }

    if (options?.category) {
      achievements = achievements.filter((a) => {
        const def = this.definitions.get(a.achievementId);
        return def?.category === options.category;
      });
    }

    return achievements;
  }

  /**
   * Initialize achievements for a new user
   */
  private async initializeUserAchievements(userId: string): Promise<void> {
    const userMap = new Map<string, UserAchievement>();

    for (const def of this.definitions.values()) {
      const achievement: UserAchievement = {
        id: `ua_${userId}_${def.id}`,
        oderId: userId,
        achievementId: def.id,
        status: "locked",
        currentProgress: 0,
        targetProgress: def.progressTarget ?? 1,
        progressPercent: 0,
        rewardsClaimed: false,
        isDisplayed: false,
        progressHistory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Initialize tiers if applicable
      if (def.hasTiers && def.tiers) {
        achievement.currentTier = 0;
        achievement.tierProgress = def.tiers.map((t) => ({
          tier: t.tier,
          progress: 0,
          target: t.target,
          unlocked: false,
          rewardsClaimed: false,
        }));
      }

      userMap.set(def.id, achievement);
    }

    this.userAchievements.set(userId, userMap);
  }

  /**
   * Get user achievement by ID
   */
  async getUserAchievement(
    userId: string,
    achievementId: string
  ): Promise<UserAchievement | null> {
    const userMap = this.userAchievements.get(userId);
    return userMap?.get(achievementId) ?? null;
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

  /**
   * Update achievement progress
   */
  async updateProgress(
    userId: string,
    achievementId: string,
    progress: number,
    source: string
  ): Promise<AchievementProgressEvent | AchievementUnlockEvent | null> {
    const userMap = this.userAchievements.get(userId);
    if (!userMap) {
      await this.initializeUserAchievements(userId);
      return this.updateProgress(userId, achievementId, progress, source);
    }

    const achievement = userMap.get(achievementId);
    if (!achievement) return null;

    const definition = this.definitions.get(achievementId);
    if (!definition) return null;

    // Already unlocked (non-tiered)
    if (achievement.status === "unlocked" && !definition.hasTiers) {
      return null;
    }

    const previousProgress = achievement.currentProgress;
    achievement.currentProgress = progress;
    achievement.progressPercent = Math.min(
      100,
      (progress / achievement.targetProgress) * 100
    );

    // Record progress history
    achievement.progressHistory.push({
      timestamp: Date.now(),
      progress,
      delta: progress - previousProgress,
      source,
    });

    if (!achievement.firstProgressAt && progress > 0) {
      achievement.firstProgressAt = Date.now();
    }
    achievement.lastProgressAt = Date.now();
    achievement.updatedAt = Date.now();

    // Update status
    if (achievement.status === "locked" && progress > 0) {
      achievement.status = "in_progress";
    }

    // Check for tier unlocks
    if (definition.hasTiers && achievement.tierProgress) {
      for (const tierProg of achievement.tierProgress) {
        if (!tierProg.unlocked && progress >= tierProg.target) {
          tierProg.unlocked = true;
          tierProg.unlockedAt = Date.now();
          tierProg.progress = tierProg.target;
          achievement.currentTier = tierProg.tier;
        } else {
          tierProg.progress = Math.min(progress, tierProg.target);
        }
      }
    }

    // Check for full unlock
    if (progress >= achievement.targetProgress) {
      achievement.status = "unlocked";
      achievement.unlockedAt = Date.now();

      userMap.set(achievementId, achievement);

      // Generate unlock event
      return {
        userId,
        achievementId,
        achievementName: definition.name,
        rarity: definition.rarity,
        rewards: definition.rewards,
        unlockedAt: achievement.unlockedAt,
        trigger: source,
      };
    }

    userMap.set(achievementId, achievement);

    // Generate progress event
    return {
      userId,
      achievementId,
      previousProgress,
      newProgress: progress,
      target: achievement.targetProgress,
      progressPercent: achievement.progressPercent,
      source,
      timestamp: Date.now(),
    };
  }

  /**
   * Process trigger event
   */
  async processTrigger(
    userId: string,
    trigger: AchievementTrigger,
    context: Record<string, any>
  ): Promise<(AchievementProgressEvent | AchievementUnlockEvent)[]> {
    const events: (AchievementProgressEvent | AchievementUnlockEvent)[] = [];

    const definitions = Array.from(this.definitions.values()).filter(
      (d) => d.trigger === trigger
    );

    for (const def of definitions) {
      // Check conditions
      const { met, progress } = await this.checkConditions(userId, def, context);

      if (met || progress > 0) {
        const event = await this.updateProgress(userId, def.id, progress, trigger);
        if (event) {
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Check achievement conditions
   */
  private async checkConditions(
    userId: string,
    definition: AchievementDefinition,
    context: Record<string, any>
  ): Promise<{ met: boolean; progress: number }> {
    // Extract relevant values from context
    const contextValues = context;

    let allMet = true;
    let anyMet = false;
    let maxProgress = 0;

    for (const condition of definition.conditions) {
      const value = contextValues[condition.type] ?? 0;
      const target = Array.isArray(condition.value) ? condition.value[1] : condition.value;

      let conditionMet = false;
      switch (condition.operator) {
        case "eq":
          conditionMet = value === target;
          break;
        case "gt":
          conditionMet = value > (condition.value as number);
          break;
        case "gte":
          conditionMet = value >= (condition.value as number);
          break;
        case "lt":
          conditionMet = value < (condition.value as number);
          break;
        case "lte":
          conditionMet = value <= (condition.value as number);
          break;
        case "between":
          const [min, max] = condition.value as [number, number];
          conditionMet = value >= min && value <= max;
          break;
      }

      if (conditionMet) {
        anyMet = true;
      } else {
        allMet = false;
      }

      // Calculate progress
      if (definition.hasProgress && typeof condition.value === "number") {
        maxProgress = Math.max(maxProgress, Math.min(value, condition.value));
      }
    }

    const met = definition.conditionLogic === "all" ? allMet : anyMet;
    return { met, progress: definition.hasProgress ? maxProgress : (met ? 1 : 0) };
  }

  // ============================================================================
  // REWARDS
  // ============================================================================

  /**
   * Claim achievement rewards
   */
  async claimRewards(
    userId: string,
    input: ClaimAchievementRewardsInput
  ): Promise<{ success: boolean; rewards: { type: string; value: any }[] }> {
    const achievement = await this.getUserAchievementById(input.userAchievementId);
    if (!achievement || achievement.oderId !== userId) {
      throw new Error("Achievement not found");
    }

    const definition = this.definitions.get(achievement.achievementId);
    if (!definition) {
      throw new Error("Achievement definition not found");
    }

    // Check if already claimed
    if (input.tier !== undefined) {
      // Tiered achievement
      const tierProgress = achievement.tierProgress?.find((t) => t.tier === input.tier);
      if (!tierProgress) throw new Error("Tier not found");
      if (!tierProgress.unlocked) throw new Error("Tier not unlocked");
      if (tierProgress.rewardsClaimed) throw new Error("Rewards already claimed");

      const tier = definition.tiers?.find((t) => t.tier === input.tier);
      if (!tier) throw new Error("Tier definition not found");

      // Process rewards
      const processedRewards = await this.rewardsProcessor.processRewards(
        userId,
        tier.rewards
      );

      // Mark as claimed
      tierProgress.rewardsClaimed = true;
      await this.saveUserAchievement(achievement);

      return { success: true, rewards: processedRewards };
    } else {
      // Non-tiered achievement
      if (achievement.status !== "unlocked") {
        throw new Error("Achievement not unlocked");
      }
      if (achievement.rewardsClaimed) {
        throw new Error("Rewards already claimed");
      }

      // Process rewards
      const processedRewards = await this.rewardsProcessor.processRewards(
        userId,
        definition.rewards
      );

      // Mark as claimed
      achievement.rewardsClaimed = true;
      achievement.rewardsClaimedAt = Date.now();
      await this.saveUserAchievement(achievement);

      return { success: true, rewards: processedRewards };
    }
  }

  // ============================================================================
  // DISPLAY SETTINGS
  // ============================================================================

  /**
   * Update achievement display settings
   */
  async updateDisplaySettings(
    userId: string,
    input: UpdateAchievementDisplayInput
  ): Promise<UserAchievement> {
    const userMap = this.userAchievements.get(userId);
    if (!userMap) {
      throw new Error("User achievements not found");
    }

    const achievement = userMap.get(input.achievementId);
    if (!achievement) {
      throw new Error("Achievement not found");
    }

    if (achievement.status !== "unlocked") {
      throw new Error("Can only display unlocked achievements");
    }

    achievement.isDisplayed = input.isDisplayed;
    if (input.displayOrder !== undefined) {
      achievement.displayOrder = input.displayOrder;
    }
    achievement.updatedAt = Date.now();

    userMap.set(input.achievementId, achievement);
    return achievement;
  }

  /**
   * Get user's showcase
   */
  async getShowcase(userId: string): Promise<AchievementShowcase> {
    const userMap = this.userAchievements.get(userId);
    if (!userMap) {
      return {
        userId,
        displayedAchievements: [],
        totalPoints: 0,
        achievementScore: 0,
        rareAchievementsCount: 0,
      };
    }

    const displayed = Array.from(userMap.values())
      .filter((a) => a.isDisplayed)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((a) => a.achievementId);

    const unlocked = Array.from(userMap.values()).filter(
      (a) => a.status === "unlocked"
    );

    const rareCount = unlocked.filter((a) => {
      const def = this.definitions.get(a.achievementId);
      return def && ["rare", "epic", "legendary", "mythic"].includes(def.rarity);
    }).length;

    const totalPoints = this.calculateAchievementScore(unlocked);

    const lastUnlocked = unlocked.reduce<UserAchievement | null>((latest, curr) => {
      if (!latest || (curr.unlockedAt ?? 0) > (latest.unlockedAt ?? 0)) {
        return curr;
      }
      return latest;
    }, null);

    return {
      userId,
      displayedAchievements: displayed,
      totalPoints,
      achievementScore: totalPoints,
      rareAchievementsCount: rareCount,
      lastUnlockedAt: lastUnlocked?.unlockedAt,
    };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get user's achievement statistics
   */
  async getStats(userId: string): Promise<AchievementStats> {
    const userMap = this.userAchievements.get(userId);
    const allDefs = Array.from(this.definitions.values());

    const byCategory: Record<AchievementCategory, { unlocked: number; total: number }> = {
      betting: { unlocked: 0, total: 0 },
      winning: { unlocked: 0, total: 0 },
      streak: { unlocked: 0, total: 0 },
      volume: { unlocked: 0, total: 0 },
      social: { unlocked: 0, total: 0 },
      special: { unlocked: 0, total: 0 },
      milestone: { unlocked: 0, total: 0 },
      skill: { unlocked: 0, total: 0 },
      loyalty: { unlocked: 0, total: 0 },
    };

    const byRarity: Record<AchievementRarity, { unlocked: number; total: number }> = {
      common: { unlocked: 0, total: 0 },
      uncommon: { unlocked: 0, total: 0 },
      rare: { unlocked: 0, total: 0 },
      epic: { unlocked: 0, total: 0 },
      legendary: { unlocked: 0, total: 0 },
      mythic: { unlocked: 0, total: 0 },
    };

    let totalUnlocked = 0;
    let totalPoints = 0;

    for (const def of allDefs) {
      byCategory[def.category].total++;
      byRarity[def.rarity].total++;

      const userAch = userMap?.get(def.id);
      if (userAch?.status === "unlocked") {
        totalUnlocked++;
        byCategory[def.category].unlocked++;
        byRarity[def.rarity].unlocked++;
        totalPoints += this.getPointsForRarity(def.rarity);
      }
    }

    return {
      userId,
      totalUnlocked,
      totalAvailable: allDefs.length,
      percentComplete: (totalUnlocked / allDefs.length) * 100,
      byCategory,
      byRarity,
      totalPoints,
    };
  }

  // ============================================================================
  // LEADERBOARD
  // ============================================================================

  /**
   * Get achievement leaderboard
   */
  async getLeaderboard(limit: number = 100): Promise<AchievementLeaderboardEntry[]> {
    const entries: AchievementLeaderboardEntry[] = [];

    for (const [userId, userMap] of this.userAchievements.entries()) {
      const unlocked = Array.from(userMap.values()).filter(
        (a) => a.status === "unlocked"
      );

      const score = this.calculateAchievementScore(unlocked);

      const rarityCounts = { rare: 0, epic: 0, legendary: 0 };
      for (const ach of unlocked) {
        const def = this.definitions.get(ach.achievementId);
        if (def) {
          if (def.rarity === "rare") rarityCounts.rare++;
          if (def.rarity === "epic") rarityCounts.epic++;
          if (def.rarity === "legendary" || def.rarity === "mythic") {
            rarityCounts.legendary++;
          }
        }
      }

      const displayed = unlocked
        .filter((a) => a.isDisplayed)
        .slice(0, 5)
        .map((a) => a.achievementId);

      entries.push({
        rank: 0,
        userId,
        username: `User_${userId.slice(-4)}`, // Placeholder
        achievementScore: score,
        totalUnlocked: unlocked.length,
        rareCount: rarityCounts.rare,
        epicCount: rarityCounts.epic,
        legendaryCount: rarityCounts.legendary,
        featuredAchievements: displayed,
      });
    }

    // Sort and assign ranks
    entries.sort((a, b) => b.achievementScore - a.achievementScore);
    entries.forEach((e, i) => (e.rank = i + 1));

    return entries.slice(0, limit);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private calculateAchievementScore(achievements: UserAchievement[]): number {
    let score = 0;
    for (const ach of achievements) {
      const def = this.definitions.get(ach.achievementId);
      if (def) {
        score += this.getPointsForRarity(def.rarity);
      }
    }
    return score;
  }

  private getPointsForRarity(rarity: AchievementRarity): number {
    switch (rarity) {
      case "common": return 10;
      case "uncommon": return 25;
      case "rare": return 50;
      case "epic": return 100;
      case "legendary": return 250;
      case "mythic": return 500;
    }
  }

  private async getUserAchievementById(id: string): Promise<UserAchievement | null> {
    for (const userMap of this.userAchievements.values()) {
      for (const ach of userMap.values()) {
        if (ach.id === id) return ach;
      }
    }
    return null;
  }

  private async saveUserAchievement(achievement: UserAchievement): Promise<void> {
    const userMap = this.userAchievements.get(achievement.oderId);
    if (userMap) {
      userMap.set(achievement.achievementId, achievement);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let achievementService: AchievementService | null = null;

export function getAchievementService(): AchievementService {
  if (!achievementService) {
    achievementService = new AchievementService();
  }
  return achievementService;
}

export function createAchievementService(): AchievementService {
  return new AchievementService();
}
