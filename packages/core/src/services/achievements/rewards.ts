/**
 * Achievement Rewards Processor
 *
 * Handles processing and distribution of achievement rewards
 * including points, tokens, badges, titles, and special perks.
 */

import { type AchievementReward, type AchievementRarity } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessedReward {
  type: string;
  value: any;
  description: string;
  appliedAt: number;
  expiresAt?: number;
}

export interface UserRewardBalance {
  userId: string;
  points: number;
  tokens: number;
  badges: string[];
  titles: string[];
  activeMultipliers: ActiveMultiplier[];
  freeBets: FreeBet[];
  unlocks: string[];
}

export interface ActiveMultiplier {
  id: string;
  type: "points" | "xp" | "earnings";
  value: number;
  source: string;
  appliedAt: number;
  expiresAt: number;
}

export interface FreeBet {
  id: string;
  amount: number;
  source: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
  usedOnBetId?: string;
}

export interface RewardTier {
  rarity: AchievementRarity;
  pointsMultiplier: number;
  bonusRewards: AchievementReward[];
}

// ============================================================================
// REWARDS PROCESSOR
// ============================================================================

export class AchievementRewardsProcessor {
  private userBalances: Map<string, UserRewardBalance> = new Map();

  private readonly REWARD_TIERS: Record<AchievementRarity, RewardTier> = {
    common: {
      rarity: "common",
      pointsMultiplier: 1.0,
      bonusRewards: [],
    },
    uncommon: {
      rarity: "uncommon",
      pointsMultiplier: 1.25,
      bonusRewards: [],
    },
    rare: {
      rarity: "rare",
      pointsMultiplier: 1.5,
      bonusRewards: [
        { type: "points", value: 50, description: "Rare bonus" },
      ],
    },
    epic: {
      rarity: "epic",
      pointsMultiplier: 2.0,
      bonusRewards: [
        { type: "points", value: 100, description: "Epic bonus" },
      ],
    },
    legendary: {
      rarity: "legendary",
      pointsMultiplier: 3.0,
      bonusRewards: [
        { type: "points", value: 250, description: "Legendary bonus" },
        { type: "multiplier", value: 1.1, duration: 604800, description: "7-day 1.1x multiplier" },
      ],
    },
    mythic: {
      rarity: "mythic",
      pointsMultiplier: 5.0,
      bonusRewards: [
        { type: "points", value: 500, description: "Mythic bonus" },
        { type: "multiplier", value: 1.25, duration: 604800, description: "7-day 1.25x multiplier" },
        { type: "tokens", value: 10, description: "10 PULL tokens" },
      ],
    },
  };

  // ============================================================================
  // REWARD PROCESSING
  // ============================================================================

  /**
   * Process rewards for an achievement
   */
  async processRewards(
    userId: string,
    rewards: AchievementReward[],
    rarity?: AchievementRarity
  ): Promise<ProcessedReward[]> {
    const balance = this.getOrCreateBalance(userId);
    const processedRewards: ProcessedReward[] = [];
    const now = Date.now();

    // Apply rarity multiplier if applicable
    const tier = rarity ? this.REWARD_TIERS[rarity] : null;

    for (const reward of rewards) {
      const processed = await this.processReward(userId, reward, balance, tier?.pointsMultiplier ?? 1);
      processedRewards.push(processed);
    }

    // Apply bonus rewards for rarity
    if (tier) {
      for (const bonus of tier.bonusRewards) {
        const processed = await this.processReward(userId, bonus, balance, 1);
        processedRewards.push(processed);
      }
    }

    this.userBalances.set(userId, balance);
    return processedRewards;
  }

  /**
   * Process a single reward
   */
  private async processReward(
    userId: string,
    reward: AchievementReward,
    balance: UserRewardBalance,
    multiplier: number
  ): Promise<ProcessedReward> {
    const now = Date.now();
    let expiresAt: number | undefined;

    switch (reward.type) {
      case "points":
        const points = Math.floor((reward.value as number) * multiplier);
        balance.points += points;
        return {
          type: "points",
          value: points,
          description: reward.description,
          appliedAt: now,
        };

      case "tokens":
        balance.tokens += reward.value as number;
        return {
          type: "tokens",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
        };

      case "badge":
        if (!balance.badges.includes(reward.value as string)) {
          balance.badges.push(reward.value as string);
        }
        return {
          type: "badge",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
        };

      case "title":
        if (!balance.titles.includes(reward.value as string)) {
          balance.titles.push(reward.value as string);
        }
        return {
          type: "title",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
        };

      case "multiplier":
        expiresAt = reward.duration ? now + (reward.duration * 1000) : undefined;
        const existingMultiplier = balance.activeMultipliers.find(
          (m) => m.source === reward.description
        );
        if (!existingMultiplier) {
          balance.activeMultipliers.push({
            id: `mult_${now}_${Math.random().toString(36).substr(2, 9)}`,
            type: "points",
            value: reward.value as number,
            source: reward.description,
            appliedAt: now,
            expiresAt: expiresAt ?? now + 86400000, // Default 24h
          });
        }
        return {
          type: "multiplier",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
          expiresAt,
        };

      case "free_bet":
        expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
        balance.freeBets.push({
          id: `fb_${now}_${Math.random().toString(36).substr(2, 9)}`,
          amount: reward.value as number,
          source: reward.description,
          createdAt: now,
          expiresAt,
        });
        return {
          type: "free_bet",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
          expiresAt,
        };

      case "unlock":
        if (!balance.unlocks.includes(reward.value as string)) {
          balance.unlocks.push(reward.value as string);
        }
        return {
          type: "unlock",
          value: reward.value,
          description: reward.description,
          appliedAt: now,
        };

      default:
        return {
          type: reward.type,
          value: reward.value,
          description: reward.description,
          appliedAt: now,
        };
    }
  }

  // ============================================================================
  // BALANCE MANAGEMENT
  // ============================================================================

  /**
   * Get user's reward balance
   */
  async getBalance(userId: string): Promise<UserRewardBalance> {
    return this.getOrCreateBalance(userId);
  }

  /**
   * Get or create user balance
   */
  private getOrCreateBalance(userId: string): UserRewardBalance {
    let balance = this.userBalances.get(userId);
    if (!balance) {
      balance = {
        userId,
        points: 0,
        tokens: 0,
        badges: [],
        titles: [],
        activeMultipliers: [],
        freeBets: [],
        unlocks: [],
      };
      this.userBalances.set(userId, balance);
    }

    // Clean up expired items
    this.cleanupExpiredItems(balance);

    return balance;
  }

  /**
   * Clean up expired multipliers and free bets
   */
  private cleanupExpiredItems(balance: UserRewardBalance): void {
    const now = Date.now();

    balance.activeMultipliers = balance.activeMultipliers.filter(
      (m) => m.expiresAt > now
    );

    balance.freeBets = balance.freeBets.filter(
      (fb) => fb.expiresAt > now && !fb.usedAt
    );
  }

  // ============================================================================
  // MULTIPLIER HANDLING
  // ============================================================================

  /**
   * Get active points multiplier for user
   */
  async getActiveMultiplier(userId: string): Promise<number> {
    const balance = this.getOrCreateBalance(userId);
    const now = Date.now();

    // Get all active multipliers and multiply them together
    const activeMultipliers = balance.activeMultipliers.filter(
      (m) => m.type === "points" && m.expiresAt > now
    );

    if (activeMultipliers.length === 0) return 1.0;

    return activeMultipliers.reduce((total, m) => total * m.value, 1.0);
  }

  /**
   * Get all active multipliers
   */
  async getActiveMultipliers(userId: string): Promise<ActiveMultiplier[]> {
    const balance = this.getOrCreateBalance(userId);
    const now = Date.now();
    return balance.activeMultipliers.filter((m) => m.expiresAt > now);
  }

  // ============================================================================
  // FREE BETS
  // ============================================================================

  /**
   * Get available free bets
   */
  async getAvailableFreeBets(userId: string): Promise<FreeBet[]> {
    const balance = this.getOrCreateBalance(userId);
    const now = Date.now();
    return balance.freeBets.filter((fb) => !fb.usedAt && fb.expiresAt > now);
  }

  /**
   * Use a free bet
   */
  async useFreeBet(userId: string, freeBetId: string, betId: string): Promise<boolean> {
    const balance = this.userBalances.get(userId);
    if (!balance) return false;

    const freeBet = balance.freeBets.find(
      (fb) => fb.id === freeBetId && !fb.usedAt
    );
    if (!freeBet || freeBet.expiresAt < Date.now()) return false;

    freeBet.usedAt = Date.now();
    freeBet.usedOnBetId = betId;

    this.userBalances.set(userId, balance);
    return true;
  }

  // ============================================================================
  // BADGES & TITLES
  // ============================================================================

  /**
   * Get user's badges
   */
  async getBadges(userId: string): Promise<string[]> {
    const balance = this.getOrCreateBalance(userId);
    return balance.badges;
  }

  /**
   * Get user's titles
   */
  async getTitles(userId: string): Promise<string[]> {
    const balance = this.getOrCreateBalance(userId);
    return balance.titles;
  }

  /**
   * Check if user has a specific badge
   */
  async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    const balance = this.getOrCreateBalance(userId);
    return balance.badges.includes(badgeId);
  }

  /**
   * Check if user has a specific title
   */
  async hasTitle(userId: string, titleId: string): Promise<boolean> {
    const balance = this.getOrCreateBalance(userId);
    return balance.titles.includes(titleId);
  }

  // ============================================================================
  // UNLOCKS
  // ============================================================================

  /**
   * Check if user has unlocked a feature
   */
  async hasUnlock(userId: string, unlockId: string): Promise<boolean> {
    const balance = this.getOrCreateBalance(userId);
    return balance.unlocks.includes(unlockId);
  }

  /**
   * Get all unlocks for user
   */
  async getUnlocks(userId: string): Promise<string[]> {
    const balance = this.getOrCreateBalance(userId);
    return balance.unlocks;
  }

  // ============================================================================
  // REWARD CATALOG
  // ============================================================================

  /**
   * Get reward catalog with descriptions
   */
  getRewardCatalog(): {
    badges: { id: string; name: string; description: string; rarity: string }[];
    titles: { id: string; name: string; description: string }[];
    multipliers: { id: string; name: string; value: number; duration: string }[];
  } {
    return {
      badges: [
        { id: "early_adopter", name: "Early Adopter", description: "Joined during launch period", rarity: "rare" },
        { id: "parlay_crown", name: "Parlay Crown", description: "Won a 5+ leg parlay", rarity: "epic" },
        { id: "high_roller", name: "High Roller", description: "Wagered over $10,000", rarity: "rare" },
        { id: "whale", name: "Whale", description: "Wagered over $100,000", rarity: "legendary" },
        { id: "unstoppable", name: "Unstoppable", description: "20-game win streak", rarity: "legendary" },
        { id: "anniversary_1", name: "1 Year", description: "Member for 1 year", rarity: "rare" },
      ],
      titles: [
        { id: "The Streak Master", name: "The Streak Master", description: "Won 10+ bets in a row" },
        { id: "The Networker", name: "The Networker", description: "Referred 10+ friends" },
        { id: "The Whale", name: "The Whale", description: "Wagered $100,000+" },
        { id: "The Oracle", name: "The Oracle", description: "Legendary prediction accuracy" },
      ],
      multipliers: [
        { id: "1.1x_24h", name: "Small Boost", value: 1.1, duration: "24 hours" },
        { id: "1.25x_7d", name: "Weekly Boost", value: 1.25, duration: "7 days" },
        { id: "1.5x_24h", name: "Big Boost", value: 1.5, duration: "24 hours" },
        { id: "2x_24h", name: "Double Points", value: 2.0, duration: "24 hours" },
      ],
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let rewardsProcessor: AchievementRewardsProcessor | null = null;

export function getRewardsProcessor(): AchievementRewardsProcessor {
  if (!rewardsProcessor) {
    rewardsProcessor = new AchievementRewardsProcessor();
  }
  return rewardsProcessor;
}

export function createRewardsProcessor(): AchievementRewardsProcessor {
  return new AchievementRewardsProcessor();
}
