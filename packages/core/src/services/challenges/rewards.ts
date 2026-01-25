/**
 * Challenge Rewards Processor
 *
 * Handles processing and distribution of challenge rewards.
 */

import { type ChallengeReward, type ChallengeDifficulty } from "./types";

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

export interface RewardMultiplier {
  type: "points" | "xp" | "all";
  value: number;
  source: string;
  expiresAt: number;
}

export interface FreeBetReward {
  id: string;
  amount: number;
  source: string;
  expiresAt: number;
  usedAt?: number;
}

export interface UserChallengeRewards {
  userId: string;
  totalPointsEarned: number;
  totalTokensEarned: number;
  totalXpEarned: number;
  freeBets: FreeBetReward[];
  badges: string[];
  activeMultipliers: RewardMultiplier[];
  sweepstakesEntries: { sweepstakesId: string; entries: number }[];
}

// ============================================================================
// REWARDS PROCESSOR
// ============================================================================

export class ChallengeRewardsProcessor {
  private userRewards: Map<string, UserChallengeRewards> = new Map();

  private readonly DIFFICULTY_MULTIPLIERS: Record<ChallengeDifficulty, number> = {
    easy: 1.0,
    medium: 1.25,
    hard: 1.5,
    extreme: 2.0,
  };

  // ============================================================================
  // REWARD PROCESSING
  // ============================================================================

  /**
   * Process challenge rewards
   */
  async processRewards(
    userId: string,
    rewards: ChallengeReward[],
    difficulty?: ChallengeDifficulty,
    isBonus: boolean = false
  ): Promise<ProcessedReward[]> {
    const userRewards = this.getOrCreateUserRewards(userId);
    const processedRewards: ProcessedReward[] = [];
    const now = Date.now();

    const multiplier = difficulty ? this.DIFFICULTY_MULTIPLIERS[difficulty] : 1.0;
    const bonusMultiplier = isBonus ? 1.5 : 1.0;

    for (const reward of rewards) {
      const processed = await this.processReward(
        userId,
        reward,
        userRewards,
        multiplier * bonusMultiplier
      );
      processedRewards.push(processed);
    }

    this.userRewards.set(userId, userRewards);
    return processedRewards;
  }

  /**
   * Process a single reward
   */
  private async processReward(
    userId: string,
    reward: ChallengeReward,
    userRewards: UserChallengeRewards,
    multiplier: number
  ): Promise<ProcessedReward> {
    const now = Date.now();
    let value = reward.value;

    switch (reward.type) {
      case "points":
        const points = Math.floor((value as number) * multiplier);
        userRewards.totalPointsEarned += points;
        return {
          type: "points",
          value: points,
          description: reward.description,
          appliedAt: now,
        };

      case "tokens":
        const tokens = Math.floor((value as number) * multiplier);
        userRewards.totalTokensEarned += tokens;
        return {
          type: "tokens",
          value: tokens,
          description: reward.description,
          appliedAt: now,
        };

      case "xp":
        const xp = Math.floor((value as number) * multiplier);
        userRewards.totalXpEarned += xp;
        return {
          type: "xp",
          value: xp,
          description: reward.description,
          appliedAt: now,
        };

      case "free_bet":
        const freeBet: FreeBetReward = {
          id: `fb_${now}_${Math.random().toString(36).substr(2, 9)}`,
          amount: value as number,
          source: reward.description,
          expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
        };
        userRewards.freeBets.push(freeBet);
        return {
          type: "free_bet",
          value: freeBet.amount,
          description: reward.description,
          appliedAt: now,
          expiresAt: freeBet.expiresAt,
        };

      case "multiplier":
        const expiresAt = reward.duration
          ? now + (reward.duration * 1000)
          : now + 24 * 60 * 60 * 1000; // Default 24h

        const mult: RewardMultiplier = {
          type: "points",
          value: value as number,
          source: reward.description,
          expiresAt,
        };
        userRewards.activeMultipliers.push(mult);
        return {
          type: "multiplier",
          value: mult.value,
          description: reward.description,
          appliedAt: now,
          expiresAt,
        };

      case "badge":
        if (!userRewards.badges.includes(value as string)) {
          userRewards.badges.push(value as string);
        }
        return {
          type: "badge",
          value,
          description: reward.description,
          appliedAt: now,
        };

      case "entry":
        // Sweepstakes entry
        return {
          type: "entry",
          value,
          description: reward.description,
          appliedAt: now,
        };

      default:
        return {
          type: reward.type,
          value,
          description: reward.description,
          appliedAt: now,
        };
    }
  }

  // ============================================================================
  // USER REWARDS MANAGEMENT
  // ============================================================================

  /**
   * Get user's challenge rewards
   */
  async getUserRewards(userId: string): Promise<UserChallengeRewards> {
    const rewards = this.getOrCreateUserRewards(userId);
    this.cleanupExpired(rewards);
    return rewards;
  }

  /**
   * Get or create user rewards
   */
  private getOrCreateUserRewards(userId: string): UserChallengeRewards {
    let rewards = this.userRewards.get(userId);
    if (!rewards) {
      rewards = {
        userId,
        totalPointsEarned: 0,
        totalTokensEarned: 0,
        totalXpEarned: 0,
        freeBets: [],
        badges: [],
        activeMultipliers: [],
        sweepstakesEntries: [],
      };
      this.userRewards.set(userId, rewards);
    }
    return rewards;
  }

  /**
   * Cleanup expired rewards
   */
  private cleanupExpired(rewards: UserChallengeRewards): void {
    const now = Date.now();
    rewards.freeBets = rewards.freeBets.filter(
      (fb) => fb.expiresAt > now && !fb.usedAt
    );
    rewards.activeMultipliers = rewards.activeMultipliers.filter(
      (m) => m.expiresAt > now
    );
  }

  // ============================================================================
  // FREE BETS
  // ============================================================================

  /**
   * Get available free bets
   */
  async getAvailableFreeBets(userId: string): Promise<FreeBetReward[]> {
    const rewards = await this.getUserRewards(userId);
    const now = Date.now();
    return rewards.freeBets.filter((fb) => !fb.usedAt && fb.expiresAt > now);
  }

  /**
   * Use a free bet
   */
  async useFreeBet(userId: string, freeBetId: string, betId: string): Promise<boolean> {
    const rewards = this.userRewards.get(userId);
    if (!rewards) return false;

    const freeBet = rewards.freeBets.find(
      (fb) => fb.id === freeBetId && !fb.usedAt && fb.expiresAt > Date.now()
    );
    if (!freeBet) return false;

    freeBet.usedAt = Date.now();
    this.userRewards.set(userId, rewards);
    return true;
  }

  // ============================================================================
  // MULTIPLIERS
  // ============================================================================

  /**
   * Get active multiplier
   */
  async getActiveMultiplier(userId: string, type: "points" | "xp" | "all"): Promise<number> {
    const rewards = await this.getUserRewards(userId);
    const now = Date.now();

    const activeMultipliers = rewards.activeMultipliers.filter(
      (m) => (m.type === type || m.type === "all") && m.expiresAt > now
    );

    if (activeMultipliers.length === 0) return 1.0;

    return activeMultipliers.reduce((total, m) => total * m.value, 1.0);
  }

  /**
   * Get all active multipliers
   */
  async getActiveMultipliers(userId: string): Promise<RewardMultiplier[]> {
    const rewards = await this.getUserRewards(userId);
    const now = Date.now();
    return rewards.activeMultipliers.filter((m) => m.expiresAt > now);
  }

  // ============================================================================
  // BADGES
  // ============================================================================

  /**
   * Get user's badges
   */
  async getBadges(userId: string): Promise<string[]> {
    const rewards = await this.getUserRewards(userId);
    return rewards.badges;
  }

  /**
   * Check if user has badge
   */
  async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    const rewards = await this.getUserRewards(userId);
    return rewards.badges.includes(badgeId);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get rewards summary
   */
  async getRewardsSummary(userId: string): Promise<{
    totalPointsEarned: number;
    totalTokensEarned: number;
    totalXpEarned: number;
    availableFreeBets: number;
    totalFreeBetValue: number;
    activeBadges: number;
    activeMultipliers: number;
    currentPointsMultiplier: number;
  }> {
    const rewards = await this.getUserRewards(userId);
    const now = Date.now();

    const availableFreeBets = rewards.freeBets.filter(
      (fb) => !fb.usedAt && fb.expiresAt > now
    );

    const activeMultipliers = rewards.activeMultipliers.filter(
      (m) => m.expiresAt > now
    );

    const currentPointsMultiplier = activeMultipliers
      .filter((m) => m.type === "points" || m.type === "all")
      .reduce((total, m) => total * m.value, 1.0);

    return {
      totalPointsEarned: rewards.totalPointsEarned,
      totalTokensEarned: rewards.totalTokensEarned,
      totalXpEarned: rewards.totalXpEarned,
      availableFreeBets: availableFreeBets.length,
      totalFreeBetValue: availableFreeBets.reduce((sum, fb) => sum + fb.amount, 0),
      activeBadges: rewards.badges.length,
      activeMultipliers: activeMultipliers.length,
      currentPointsMultiplier,
    };
  }

  // ============================================================================
  // REWARD CATALOG
  // ============================================================================

  /**
   * Get challenge reward catalog
   */
  getRewardCatalog(): {
    pointsRewards: { value: number; description: string }[];
    tokenRewards: { value: number; description: string }[];
    freeBetRewards: { value: number; description: string; expiryDays: number }[];
    multiplierRewards: { value: number; duration: string; description: string }[];
    badgeRewards: { id: string; name: string; description: string }[];
  } {
    return {
      pointsRewards: [
        { value: 25, description: "Small points bonus" },
        { value: 50, description: "Standard points reward" },
        { value: 100, description: "Medium points reward" },
        { value: 250, description: "Large points reward" },
        { value: 500, description: "Major points reward" },
        { value: 1000, description: "Jackpot points reward" },
      ],
      tokenRewards: [
        { value: 1, description: "1 PULL token" },
        { value: 5, description: "5 PULL tokens" },
        { value: 10, description: "10 PULL tokens" },
      ],
      freeBetRewards: [
        { value: 5, description: "$5 free bet", expiryDays: 30 },
        { value: 10, description: "$10 free bet", expiryDays: 30 },
        { value: 25, description: "$25 free bet", expiryDays: 30 },
        { value: 50, description: "$50 free bet", expiryDays: 30 },
      ],
      multiplierRewards: [
        { value: 1.25, duration: "1 hour", description: "1.25x points boost" },
        { value: 1.5, duration: "1 hour", description: "1.5x points boost" },
        { value: 2.0, duration: "1 hour", description: "2x points boost" },
        { value: 1.5, duration: "24 hours", description: "1.5x points for 24h" },
      ],
      badgeRewards: [
        { id: "daily_warrior", name: "Daily Warrior", description: "Complete 7 daily challenges in a row" },
        { id: "challenge_master", name: "Challenge Master", description: "Complete 50 challenges" },
        { id: "underdog_hunter", name: "Underdog Hunter", description: "Win at high odds" },
        { id: "parlay_master", name: "Parlay Master", description: "Win multiple parlays" },
        { id: "streak_king", name: "Streak King", description: "Achieve a major win streak" },
      ],
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let challengeRewardsProcessor: ChallengeRewardsProcessor | null = null;

export function getChallengeRewardsProcessor(): ChallengeRewardsProcessor {
  if (!challengeRewardsProcessor) {
    challengeRewardsProcessor = new ChallengeRewardsProcessor();
  }
  return challengeRewardsProcessor;
}

export function createChallengeRewardsProcessor(): ChallengeRewardsProcessor {
  return new ChallengeRewardsProcessor();
}
