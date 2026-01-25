/**
 * Streak Multipliers Service
 * Main service for tracking and calculating streak bonuses
 */

import {
  UserStreak,
  StreakType,
  StreakStatus,
  StreakProtection,
  ProtectionType,
  StreakMilestone,
  MilestoneType,
  MilestoneReward,
  StreakLeaderboardEntry,
  StreakAnalytics,
  GlobalStreakStats,
  MultiplierTier,
  MULTIPLIER_TIERS,
  PROTECTION_PRICING,
  BASE_STREAK_THRESHOLD,
  GetStreakRequest,
  GetStreakResponse,
  RecordBetResultRequest,
  RecordBetResultResponse,
  PurchaseProtectionRequest,
  PurchaseProtectionResponse,
  ClaimMilestoneRequest,
  ClaimMilestoneResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  StreakEvent,
} from "./types";
import { MultiplierCalculator, getMultiplierCalculator } from "./multipliers";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface StreaksServiceConfig {
  enableProtection: boolean;
  enableMilestones: boolean;
  enableLeaderboard: boolean;
  maxProtectionsPerStreak: number;
  milestoneRewardMultiplier: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface EventEmitter {
  emit(event: string, data: StreakEvent): void;
}

const DEFAULT_CONFIG: StreaksServiceConfig = {
  enableProtection: true,
  enableMilestones: true,
  enableLeaderboard: true,
  maxProtectionsPerStreak: 3,
  milestoneRewardMultiplier: 1.0,
};

// ============================================================================
// STREAKS SERVICE
// ============================================================================

export class StreaksService {
  private readonly config: StreaksServiceConfig;
  private readonly db: ConvexClient;
  private readonly events: EventEmitter;
  private readonly calculator: MultiplierCalculator;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    events: EventEmitter,
    config?: Partial<StreaksServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.events = events;
    this.calculator = getMultiplierCalculator();
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Streaks] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Streaks] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Streaks] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Streaks] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // STREAK MANAGEMENT
  // ==========================================================================

  async getStreak(userId: string, request: GetStreakRequest = {}): Promise<GetStreakResponse> {
    let streak = await this.db.query<UserStreak | null>("userStreaks:get", {
      userId,
      type: request.type ?? "win",
      category: request.category,
    });

    if (!streak) {
      streak = await this.createStreak(userId, request.type ?? "win", request.category);
    }

    const currentTier = this.calculator.getTier(streak.currentStreak);
    const nextTier = this.calculator.getNextTier(streak.currentStreak);
    const winsToNextTier = this.calculator.getWinsToNextTier(streak.currentStreak);

    const availableMilestones = await this.getUnclaimedMilestones(userId, streak.id);

    return {
      streak,
      currentTier,
      nextTier,
      winsToNextTier,
      availableMilestones,
    };
  }

  async getUserStreaks(userId: string): Promise<UserStreak[]> {
    return await this.db.query<UserStreak[]>("userStreaks:getAllByUser", { userId });
  }

  private async createStreak(
    userId: string,
    type: StreakType,
    category?: string
  ): Promise<UserStreak> {
    const now = Date.now();

    const streak: UserStreak = {
      id: this.generateId(),
      userId,
      type,
      status: "active",
      currentStreak: 0,
      longestStreak: 0,
      currentMultiplier: 1.0,
      streakBetIds: [],
      totalStreakWinnings: 0,
      totalMultiplierBonus: 0,
      category,
      isProtected: false,
      startedAt: now,
      updatedAt: now,
    };

    await this.db.mutation("userStreaks:create", { streak });

    return streak;
  }

  // ==========================================================================
  // BET RESULT PROCESSING
  // ==========================================================================

  async recordBetResult(
    userId: string,
    request: RecordBetResultRequest
  ): Promise<RecordBetResultResponse> {
    // Get or create the appropriate streak
    const { streak } = await this.getStreak(userId, {
      type: request.category ? "category" : "win",
      category: request.category,
    });

    let updatedStreak: UserStreak;
    let multiplierApplied = 1.0;
    let bonusAmount = 0;
    let milestoneAchieved: StreakMilestone | undefined;
    let protectionUsed = false;
    let streakBroken = false;

    if (request.outcome === "won") {
      // Extend streak
      const result = await this.extendStreak(streak, request.betId, request.winnings ?? 0);
      updatedStreak = result.streak;
      multiplierApplied = result.multiplier;
      bonusAmount = result.bonusAmount;
      milestoneAchieved = result.milestone;
    } else if (request.outcome === "lost") {
      // Check for protection
      const protectionResult = await this.checkAndUseProtection(streak);

      if (protectionResult.protected) {
        protectionUsed = true;
        updatedStreak = protectionResult.streak;
      } else {
        // Break streak
        updatedStreak = await this.breakStreak(streak);
        streakBroken = true;
      }
    } else {
      // Push or void - no change
      updatedStreak = streak;
    }

    return {
      streak: updatedStreak,
      multiplierApplied,
      bonusAmount,
      milestoneAchieved,
      protectionUsed,
      streakBroken,
    };
  }

  private async extendStreak(
    streak: UserStreak,
    betId: string,
    winnings: number
  ): Promise<{
    streak: UserStreak;
    multiplier: number;
    bonusAmount: number;
    milestone?: StreakMilestone;
  }> {
    const newStreakLength = streak.currentStreak + 1;
    const oldMultiplier = streak.currentMultiplier;

    // Calculate new multiplier
    const { multiplier, bonusAmount } = this.calculator.calculateBonus(
      winnings,
      newStreakLength,
      streak.type,
      {
        category: streak.category,
        oddsRange: streak.oddsRange,
      }
    );

    const now = Date.now();

    // Update streak
    const updatedStreak = await this.db.mutation<UserStreak>("userStreaks:extend", {
      streakId: streak.id,
      betId,
      newLength: newStreakLength,
      newMultiplier: multiplier,
      winnings,
      bonusAmount,
      longestStreak: Math.max(streak.longestStreak, newStreakLength),
      updatedAt: now,
      lastWinAt: now,
    });

    // Emit events
    this.events.emit("streak", {
      type: "streak_extended",
      streak: updatedStreak,
      newLength: newStreakLength,
    });

    if (multiplier > oldMultiplier) {
      this.events.emit("streak", {
        type: "multiplier_increased",
        streak: updatedStreak,
        oldMultiplier,
        newMultiplier: multiplier,
      });
    }

    // Check for milestones
    let milestone: StreakMilestone | undefined;
    if (this.config.enableMilestones) {
      milestone = await this.checkMilestones(updatedStreak);
    }

    this.logger.info("Streak extended", {
      userId: streak.userId,
      streakId: streak.id,
      newLength: newStreakLength,
      multiplier,
      bonusAmount,
    });

    return {
      streak: updatedStreak,
      multiplier,
      bonusAmount,
      milestone,
    };
  }

  private async breakStreak(streak: UserStreak): Promise<UserStreak> {
    const now = Date.now();

    const updatedStreak = await this.db.mutation<UserStreak>("userStreaks:break", {
      streakId: streak.id,
      brokenAt: now,
      updatedAt: now,
    });

    // Create new fresh streak
    await this.createStreak(streak.userId, streak.type, streak.category);

    this.events.emit("streak", {
      type: "streak_broken",
      streak: updatedStreak,
      finalLength: streak.currentStreak,
    });

    this.logger.info("Streak broken", {
      userId: streak.userId,
      streakId: streak.id,
      finalLength: streak.currentStreak,
    });

    return updatedStreak;
  }

  // ==========================================================================
  // PROTECTION
  // ==========================================================================

  async purchaseProtection(
    userId: string,
    request: PurchaseProtectionRequest
  ): Promise<PurchaseProtectionResponse> {
    if (!this.config.enableProtection) {
      throw new Error("Streak protection is not enabled");
    }

    const streak = await this.db.query<UserStreak | null>("userStreaks:get", {
      streakId: request.streakId,
    });

    if (!streak || streak.userId !== userId) {
      throw new Error("Streak not found");
    }

    if (streak.status !== "active") {
      throw new Error("Can only protect active streaks");
    }

    // Check existing protections
    const existingProtections = await this.db.query<StreakProtection[]>(
      "streakProtections:getByStreak",
      { streakId: streak.id }
    );

    const activeProtections = existingProtections.filter(
      (p) => p.usesRemaining > 0 && (!p.expiresAt || p.expiresAt > Date.now())
    );

    if (activeProtections.length >= this.config.maxProtectionsPerStreak) {
      throw new Error(`Maximum ${this.config.maxProtectionsPerStreak} protections per streak`);
    }

    // Calculate price
    const pricing = PROTECTION_PRICING.find((p) => p.type === request.type);
    if (!pricing) {
      throw new Error("Invalid protection type");
    }

    const price = pricing.basePrice + pricing.pricePerStreakLevel * streak.currentStreak;

    // Check user balance
    const hasBalance = await this.checkUserBalance(userId, price);
    if (!hasBalance) {
      throw new Error("Insufficient balance");
    }

    // Deduct payment
    await this.deductBalance(userId, price);

    const now = Date.now();
    const protection: StreakProtection = {
      id: this.generateId(),
      streakId: streak.id,
      userId,
      type: request.type,
      usesRemaining: request.type === "two_loss" ? 2 : 1,
      maxUses: request.type === "two_loss" ? 2 : 1,
      refundPercent: request.type === "insurance" ? 50 : undefined,
      expiresAt: request.type === "time_based" ? now + 24 * 60 * 60 * 1000 : undefined,
      purchasePrice: price,
      purchasedAt: now,
      usedCount: 0,
      savedStreaks: 0,
    };

    await this.db.mutation("streakProtections:create", { protection });

    // Update streak
    const updatedStreak = await this.db.mutation<UserStreak>("userStreaks:update", {
      streakId: streak.id,
      updates: {
        isProtected: true,
        protection,
        updatedAt: now,
      },
    });

    this.events.emit("streak", {
      type: "streak_protected",
      streak: updatedStreak,
      protection,
    });

    this.logger.info("Protection purchased", {
      userId,
      streakId: streak.id,
      type: request.type,
      price,
    });

    return {
      protection,
      price,
      streak: updatedStreak,
    };
  }

  private async checkAndUseProtection(streak: UserStreak): Promise<{
    protected: boolean;
    streak: UserStreak;
    protection?: StreakProtection;
  }> {
    if (!streak.isProtected || !streak.protection) {
      return { protected: false, streak };
    }

    const protection = streak.protection;
    const now = Date.now();

    // Check if protection is valid
    if (protection.usesRemaining <= 0) {
      return { protected: false, streak };
    }

    if (protection.expiresAt && protection.expiresAt < now) {
      return { protected: false, streak };
    }

    // Use protection
    const updatedProtection = await this.db.mutation<StreakProtection>(
      "streakProtections:use",
      {
        protectionId: protection.id,
        usedAt: now,
      }
    );

    // Calculate streak value saved
    const streakValue = this.calculator.calculateStreakValue(
      streak.currentStreak,
      streak.totalStreakWinnings / Math.max(streak.currentStreak, 1),
      0.5
    );

    await this.db.mutation("streakProtections:recordSave", {
      protectionId: protection.id,
      valueSaved: streakValue.potentialValue,
    });

    // Update streak protection status
    const hasRemainingUses = updatedProtection.usesRemaining > 0;
    const updatedStreak = await this.db.mutation<UserStreak>("userStreaks:update", {
      streakId: streak.id,
      updates: {
        isProtected: hasRemainingUses,
        protection: hasRemainingUses ? updatedProtection : undefined,
        updatedAt: now,
      },
    });

    this.events.emit("streak", {
      type: "protection_used",
      streak: updatedStreak,
      protection: updatedProtection,
    });

    this.logger.info("Protection used", {
      userId: streak.userId,
      streakId: streak.id,
      protectionId: protection.id,
      remainingUses: updatedProtection.usesRemaining,
    });

    return {
      protected: true,
      streak: updatedStreak,
      protection: updatedProtection,
    };
  }

  // ==========================================================================
  // MILESTONES
  // ==========================================================================

  private async checkMilestones(streak: UserStreak): Promise<StreakMilestone | undefined> {
    const milestoneThresholds: Array<{ length: number; type: MilestoneType }> = [
      { length: 3, type: "streak_3" },
      { length: 5, type: "streak_5" },
      { length: 10, type: "streak_10" },
      { length: 20, type: "streak_20" },
      { length: 50, type: "streak_50" },
      { length: 100, type: "streak_100" },
    ];

    const matchingMilestone = milestoneThresholds.find(
      (m) => m.length === streak.currentStreak
    );

    if (!matchingMilestone) {
      return undefined;
    }

    // Check if already achieved
    const existing = await this.db.query<StreakMilestone | null>(
      "streakMilestones:getByType",
      {
        userId: streak.userId,
        streakId: streak.id,
        type: matchingMilestone.type,
      }
    );

    if (existing) {
      return undefined;
    }

    // Create milestone
    const rewards = this.getMilestoneRewards(matchingMilestone.type, streak.currentMultiplier);

    const milestone: StreakMilestone = {
      id: this.generateId(),
      userId: streak.userId,
      streakId: streak.id,
      type: matchingMilestone.type,
      streakLength: streak.currentStreak,
      multiplier: streak.currentMultiplier,
      rewards,
      claimed: false,
      achievedAt: Date.now(),
    };

    await this.db.mutation("streakMilestones:create", { milestone });

    this.events.emit("streak", {
      type: "milestone_achieved",
      milestone,
    });

    this.logger.info("Milestone achieved", {
      userId: streak.userId,
      type: matchingMilestone.type,
      streakLength: streak.currentStreak,
    });

    return milestone;
  }

  private getMilestoneRewards(type: MilestoneType, multiplier: number): MilestoneReward[] {
    const baseRewards: Record<MilestoneType, MilestoneReward[]> = {
      streak_3: [
        { type: "bonus", value: 5, description: "$5 bonus credit" },
      ],
      streak_5: [
        { type: "bonus", value: 15, description: "$15 bonus credit" },
        { type: "badge", value: 1, description: "5-Streak Badge" },
      ],
      streak_10: [
        { type: "cash", value: 25, description: "$25 cash reward" },
        { type: "protection", value: 1, description: "Free streak protection" },
        { type: "badge", value: 1, description: "10-Streak Badge" },
      ],
      streak_20: [
        { type: "cash", value: 100, description: "$100 cash reward" },
        { type: "protection", value: 2, description: "2 free streak protections" },
        { type: "badge", value: 1, description: "Elite Streaker Badge" },
      ],
      streak_50: [
        { type: "cash", value: 500, description: "$500 cash reward" },
        { type: "multiplier_boost", value: 0.1, description: "Permanent +0.1x multiplier" },
        { type: "badge", value: 1, description: "Legendary Streaker Badge" },
      ],
      streak_100: [
        { type: "cash", value: 2500, description: "$2,500 cash reward" },
        { type: "multiplier_boost", value: 0.25, description: "Permanent +0.25x multiplier" },
        { type: "badge", value: 1, description: "GOAT Badge" },
      ],
      multiplier_2x: [
        { type: "bonus", value: 20, description: "$20 bonus credit" },
      ],
      multiplier_3x: [
        { type: "cash", value: 50, description: "$50 cash reward" },
      ],
      weekly_7: [
        { type: "bonus", value: 10, description: "$10 weekly bonus" },
      ],
      perfect_week: [
        { type: "cash", value: 75, description: "$75 perfect week bonus" },
        { type: "badge", value: 1, description: "Perfect Week Badge" },
      ],
    };

    const rewards = baseRewards[type] ?? [];

    // Apply multiplier to reward values
    return rewards.map((r) => ({
      ...r,
      value: r.type === "cash" || r.type === "bonus"
        ? Math.round(r.value * this.config.milestoneRewardMultiplier)
        : r.value,
    }));
  }

  async claimMilestone(
    userId: string,
    request: ClaimMilestoneRequest
  ): Promise<ClaimMilestoneResponse> {
    const milestone = await this.db.query<StreakMilestone | null>(
      "streakMilestones:get",
      { milestoneId: request.milestoneId }
    );

    if (!milestone || milestone.userId !== userId) {
      throw new Error("Milestone not found");
    }

    if (milestone.claimed) {
      throw new Error("Milestone already claimed");
    }

    // Process rewards
    let totalValue = 0;

    for (const reward of milestone.rewards) {
      switch (reward.type) {
        case "cash":
        case "bonus":
          await this.creditBalance(userId, reward.value, reward.type);
          totalValue += reward.value;
          break;
        case "protection":
          // Grant free protection
          break;
        case "badge":
          await this.awardBadge(userId, milestone.type);
          break;
        case "multiplier_boost":
          await this.applyPermanentBoost(userId, reward.value);
          break;
      }
    }

    // Mark as claimed
    await this.db.mutation("streakMilestones:claim", {
      milestoneId: request.milestoneId,
      claimedAt: Date.now(),
    });

    this.logger.info("Milestone claimed", {
      userId,
      milestoneId: request.milestoneId,
      totalValue,
    });

    return {
      milestone: { ...milestone, claimed: true, claimedAt: Date.now() },
      rewards: milestone.rewards,
      totalValue,
    };
  }

  private async getUnclaimedMilestones(
    userId: string,
    streakId: string
  ): Promise<StreakMilestone[]> {
    return await this.db.query<StreakMilestone[]>("streakMilestones:getUnclaimed", {
      userId,
      streakId,
    });
  }

  // ==========================================================================
  // LEADERBOARD
  // ==========================================================================

  async getLeaderboard(request: GetLeaderboardRequest): Promise<GetLeaderboardResponse> {
    if (!this.config.enableLeaderboard) {
      return { entries: [] };
    }

    const entries = await this.db.query<StreakLeaderboardEntry[]>(
      "streakLeaderboards:get",
      {
        type: request.type,
        period: request.period,
        limit: request.limit,
      }
    );

    return { entries };
  }

  async getUserLeaderboardPosition(
    userId: string,
    type?: StreakType,
    period: "daily" | "weekly" | "monthly" | "all_time" = "all_time"
  ): Promise<{ rank: number; entry: StreakLeaderboardEntry } | null> {
    return await this.db.query("streakLeaderboards:getUserPosition", {
      userId,
      type,
      period,
    });
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  async getAnalytics(userId: string): Promise<StreakAnalytics> {
    const streaks = await this.getUserStreaks(userId);
    const protections = await this.db.query<StreakProtection[]>(
      "streakProtections:getByUser",
      { userId }
    );
    const milestones = await this.db.query<StreakMilestone[]>(
      "streakMilestones:getByUser",
      { userId }
    );

    const activeStreaks = streaks.filter((s) => s.status === "active");
    const brokenStreaks = streaks.filter((s) => s.status === "broken");

    return {
      userId,
      totalStreaks: streaks.length,
      activeStreaks: activeStreaks.length,
      brokenStreaks: brokenStreaks.length,
      averageStreakLength:
        streaks.length > 0
          ? streaks.reduce((sum, s) => sum + s.longestStreak, 0) / streaks.length
          : 0,
      longestStreak: Math.max(...streaks.map((s) => s.longestStreak), 0),
      totalBonusEarned: streaks.reduce((sum, s) => sum + s.totalMultiplierBonus, 0),
      totalProtectionsPurchased: protections.length,
      protectionsUsed: protections.filter((p) => p.usedCount > 0).length,
      protectionsSaved: protections.reduce((sum, p) => sum + p.savedStreaks, 0),
      milestonesAchieved: milestones.length,
    };
  }

  async getGlobalStats(): Promise<GlobalStreakStats> {
    return await this.db.query<GlobalStreakStats>("streakStats:getGlobal", {});
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async checkUserBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.db.query<{ available: number }>("balances:get", {
      userId,
      assetType: "usd",
    });
    return balance ? balance.available >= amount : false;
  }

  private async deductBalance(userId: string, amount: number): Promise<void> {
    await this.db.mutation("balances:deduct", {
      userId,
      assetType: "usd",
      amount,
      reason: "streak_protection",
    });
  }

  private async creditBalance(
    userId: string,
    amount: number,
    type: "cash" | "bonus"
  ): Promise<void> {
    await this.db.mutation("balances:credit", {
      userId,
      assetType: type === "cash" ? "usd" : "bonus",
      amount,
      reason: "streak_milestone",
    });
  }

  private async awardBadge(userId: string, milestoneType: MilestoneType): Promise<void> {
    await this.db.mutation("badges:award", {
      userId,
      badgeType: `streak_${milestoneType}`,
      awardedAt: Date.now(),
    });
  }

  private async applyPermanentBoost(userId: string, boost: number): Promise<void> {
    await this.db.mutation("userBoosts:add", {
      userId,
      boostType: "multiplier",
      value: boost,
      isPermanent: true,
      createdAt: Date.now(),
    });
  }

  private generateId(): string {
    return `streak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: StreaksService | null = null;

export function getStreaksService(
  db: ConvexClient,
  events: EventEmitter
): StreaksService {
  if (!serviceInstance) {
    serviceInstance = new StreaksService(db, events);
  }
  return serviceInstance;
}

export function createStreaksService(
  db: ConvexClient,
  events: EventEmitter,
  config?: Partial<StreaksServiceConfig>
): StreaksService {
  return new StreaksService(db, events, config);
}
