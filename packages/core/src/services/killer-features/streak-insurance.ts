/**
 * KILLER FEATURE #1: Streak Insurance
 *
 * Protects users' winning streaks with automatic insurance.
 * If a user is on a hot streak (3+ wins), their next loss is partially refunded.
 *
 * WHY IT KILLS:
 * - Reduces loss aversion (biggest barrier to betting)
 * - Encourages continued play after losses
 * - Creates emotional investment in maintaining streaks
 * - Viral: "I'm on a 7 game streak with insurance!"
 *
 * K-FACTOR BOOST:
 * - Shareable streak badges
 * - Leaderboard for longest active streaks
 * - Streak notifications to friends
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const StreakTypeSchema = z.enum([
  "win_streak",           // Consecutive wins
  "cover_streak",         // Consecutive ATS covers
  "over_streak",          // Consecutive overs hitting
  "under_streak",         // Consecutive unders hitting
  "parlay_streak",        // Consecutive parlay wins
  "prediction_streak",    // Prediction market correct picks
  "bracket_streak",       // Consecutive bracket picks correct
]);

export type StreakType = z.infer<typeof StreakTypeSchema>;

export interface StreakInsuranceConfig {
  minStreakForInsurance: number;      // Minimum streak to qualify
  insurancePercentages: number[];     // % refund at each streak level [3, 4, 5, 6, 7+]
  maxInsuranceAmount: number;         // Cap on insurance payout
  cooldownAfterClaim: number;         // Hours before eligible again
  streakBonuses: StreakBonus[];       // Bonuses at streak milestones
}

export interface StreakBonus {
  streakLength: number;
  bonusType: "credits" | "free_bet" | "boost" | "badge" | "sweepstakes_entries";
  amount: number;
  description: string;
}

export interface UserStreak {
  userId: string;
  streakType: StreakType;
  currentStreak: number;
  longestStreak: number;
  isInsured: boolean;
  insuranceLevel: number;
  lastBetId?: string;
  lastBetResult?: "win" | "loss" | "push";
  streakStartedAt: number;
  insuranceClaimedAt?: number;
  updatedAt: number;
}

export interface StreakInsuranceClaim {
  id: string;
  userId: string;
  streakType: StreakType;
  streakLengthAtClaim: number;
  betId: string;
  originalLoss: number;
  insurancePercentage: number;
  insurancePayout: number;
  claimedAt: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_STREAK_INSURANCE_CONFIG: StreakInsuranceConfig = {
  minStreakForInsurance: 3,
  insurancePercentages: [25, 35, 50, 65, 80], // 3, 4, 5, 6, 7+ wins
  maxInsuranceAmount: 500,
  cooldownAfterClaim: 24,
  streakBonuses: [
    { streakLength: 3, bonusType: "badge", amount: 1, description: "Hot Hand Badge 🔥" },
    { streakLength: 5, bonusType: "credits", amount: 10, description: "5 Win Streak - 10 Bonus Credits" },
    { streakLength: 7, bonusType: "free_bet", amount: 25, description: "7 Win Streak - $25 Free Bet" },
    { streakLength: 10, bonusType: "sweepstakes_entries", amount: 100, description: "10 Win Streak - 100 Sweepstakes Entries" },
    { streakLength: 15, bonusType: "boost", amount: 50, description: "15 Win Streak - 50% Odds Boost" },
  ],
};

// ============================================================================
// STREAK INSURANCE SERVICE
// ============================================================================

export class StreakInsuranceService {
  private config: StreakInsuranceConfig;

  constructor(config: StreakInsuranceConfig = DEFAULT_STREAK_INSURANCE_CONFIG) {
    this.config = config;
  }

  /**
   * Update streak after bet result
   */
  updateStreak(
    currentStreak: UserStreak,
    betResult: "win" | "loss" | "push",
    betId: string
  ): { streak: UserStreak; claim?: StreakInsuranceClaim; bonus?: StreakBonus } {
    let newStreak: UserStreak;
    let claim: StreakInsuranceClaim | undefined;
    let bonus: StreakBonus | undefined;

    if (betResult === "push") {
      // Pushes don't affect streak
      return {
        streak: {
          ...currentStreak,
          lastBetId: betId,
          lastBetResult: "push",
          updatedAt: Date.now(),
        },
      };
    }

    if (betResult === "win") {
      const newStreakLength = currentStreak.currentStreak + 1;
      newStreak = {
        ...currentStreak,
        currentStreak: newStreakLength,
        longestStreak: Math.max(currentStreak.longestStreak, newStreakLength),
        isInsured: newStreakLength >= this.config.minStreakForInsurance,
        insuranceLevel: this.getInsuranceLevel(newStreakLength),
        lastBetId: betId,
        lastBetResult: "win",
        streakStartedAt: currentStreak.currentStreak === 0 ? Date.now() : currentStreak.streakStartedAt,
        updatedAt: Date.now(),
      };

      // Check for milestone bonus
      bonus = this.config.streakBonuses.find(b => b.streakLength === newStreakLength);
    } else {
      // Loss - streak ends
      newStreak = {
        ...currentStreak,
        currentStreak: 0,
        isInsured: false,
        insuranceLevel: 0,
        lastBetId: betId,
        lastBetResult: "loss",
        updatedAt: Date.now(),
      };
    }

    return { streak: newStreak, claim, bonus };
  }

  /**
   * Process insurance claim on loss
   */
  processInsuranceClaim(
    streak: UserStreak,
    lostBetAmount: number,
    betId: string
  ): StreakInsuranceClaim | null {
    if (!streak.isInsured || streak.currentStreak < this.config.minStreakForInsurance) {
      return null;
    }

    // Check cooldown
    if (streak.insuranceClaimedAt) {
      const hoursSinceClaim = (Date.now() - streak.insuranceClaimedAt) / (1000 * 60 * 60);
      if (hoursSinceClaim < this.config.cooldownAfterClaim) {
        return null;
      }
    }

    const insurancePercentage = this.getInsurancePercentage(streak.currentStreak);
    const insurancePayout = Math.min(
      lostBetAmount * (insurancePercentage / 100),
      this.config.maxInsuranceAmount
    );

    return {
      id: `insurance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: streak.userId,
      streakType: streak.streakType,
      streakLengthAtClaim: streak.currentStreak,
      betId,
      originalLoss: lostBetAmount,
      insurancePercentage,
      insurancePayout,
      claimedAt: Date.now(),
    };
  }

  /**
   * Get insurance level (0-4) based on streak length
   */
  private getInsuranceLevel(streakLength: number): number {
    if (streakLength < this.config.minStreakForInsurance) return 0;
    const level = streakLength - this.config.minStreakForInsurance;
    return Math.min(level, this.config.insurancePercentages.length - 1);
  }

  /**
   * Get insurance percentage based on streak length
   */
  private getInsurancePercentage(streakLength: number): number {
    const level = this.getInsuranceLevel(streakLength);
    return this.config.insurancePercentages[level];
  }

  /**
   * Get streak leaderboard
   */
  getStreakLeaderboard(
    streaks: UserStreak[],
    streakType?: StreakType,
    limit: number = 100
  ): Array<{
    rank: number;
    userId: string;
    currentStreak: number;
    longestStreak: number;
    isInsured: boolean;
    insuranceLevel: number;
  }> {
    let filtered = streakType
      ? streaks.filter(s => s.streakType === streakType)
      : streaks;

    filtered = filtered
      .filter(s => s.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);

    return filtered.map((streak, index) => ({
      rank: index + 1,
      userId: streak.userId,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      isInsured: streak.isInsured,
      insuranceLevel: streak.insuranceLevel,
    }));
  }

  /**
   * Generate shareable streak card
   */
  generateStreakCard(streak: UserStreak): {
    title: string;
    description: string;
    shareText: string;
    imageUrl?: string;
  } {
    const fireEmoji = "🔥".repeat(Math.min(streak.currentStreak, 10));

    return {
      title: `${streak.currentStreak} Win Streak! ${fireEmoji}`,
      description: streak.isInsured
        ? `Protected with ${this.getInsurancePercentage(streak.currentStreak)}% Streak Insurance`
        : `${this.config.minStreakForInsurance - streak.currentStreak} more wins to unlock insurance!`,
      shareText: `I'm on a ${streak.currentStreak} game winning streak on PULL! ${fireEmoji} My next loss is ${streak.isInsured ? `${this.getInsurancePercentage(streak.currentStreak)}% insured` : "almost insured"}! Join me: pull.app/join`,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createStreakInsuranceService(config?: StreakInsuranceConfig): StreakInsuranceService {
  return new StreakInsuranceService(config);
}
