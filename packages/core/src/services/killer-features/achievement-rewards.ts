/**
 * KILLER FEATURE #10: Achievement & Rewards System
 *
 * Comprehensive gamification with achievements, daily rewards,
 * XP system, and exclusive rewards/perks.
 *
 * WHY IT KILLS:
 * - Daily login incentives
 * - Progress = commitment
 * - Exclusive rewards create FOMO
 * - Completionist psychology
 *
 * K-FACTOR BOOST:
 * - Share achievements on social
 * - Achievement-based referral bonuses
 * - Leaderboard for achievement hunters
 * - Exclusive access for high achievers
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const AchievementCategorySchema = z.enum([
  "betting",        // Betting activity achievements
  "social",         // Social features achievements
  "streaks",        // Streak-related achievements
  "brackets",       // Bracket/tournament achievements
  "learning",       // Education/coaching achievements
  "loyalty",        // Login/engagement achievements
  "special",        // Limited-time/event achievements
  "legendary",      // Ultra-rare achievements
]);

export type AchievementCategory = z.infer<typeof AchievementCategorySchema>;

export const RewardTypeSchema = z.enum([
  "xp",             // Experience points
  "tokens",         // Platform currency
  "free_bet",       // Free bet credit
  "boost",          // Odds/cash-out boost
  "badge",          // Profile badge
  "avatar",         // Exclusive avatar/frame
  "access",         // Early/exclusive access
  "physical",       // Physical merchandise
  "cash",           // Real cash reward
]);

export type RewardType = z.infer<typeof RewardTypeSchema>;

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";

  // Requirements
  requirements: AchievementRequirement[];
  isSecret: boolean; // Hidden until unlocked

  // Rewards
  rewards: AchievementReward[];
  xpValue: number;

  // Tracking
  progressType: "count" | "streak" | "threshold" | "boolean";
  maxProgress?: number;

  // Timing
  isLimited: boolean;
  availableFrom?: number;
  availableUntil?: number;
}

export interface AchievementRequirement {
  type: string;
  value: number;
  description: string;
}

export interface AchievementReward {
  type: RewardType;
  value: number | string;
  description: string;
}

export interface UserAchievement {
  achievementId: string;
  userId: string;
  progress: number;
  maxProgress: number;
  isComplete: boolean;
  completedAt?: number;
  rewardsClaimed: boolean;
  claimedAt?: number;
}

export interface DailyReward {
  day: number;
  rewards: AchievementReward[];
  isBonusDay: boolean; // 7th day, 30th day, etc.
}

export interface UserDailyStreak {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastClaimDate: string; // YYYY-MM-DD
  totalDaysClaimed: number;
  currentMonthDays: number;

  // Milestones
  milestones: DailyMilestone[];
}

export interface DailyMilestone {
  days: number;
  reward: AchievementReward;
  claimed: boolean;
  claimedAt?: number;
}

export interface UserLevel {
  userId: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalXP: number;

  // Perks at current level
  perks: LevelPerk[];

  // Progress
  levelHistory: Array<{
    level: number;
    reachedAt: number;
    rewardsGained: AchievementReward[];
  }>;
}

export interface LevelPerk {
  level: number;
  name: string;
  description: string;
  type: "boost" | "access" | "limit_increase" | "discount" | "cosmetic";
  value: number | string;
  isActive: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  level: number;
  totalXP: number;
  achievementsUnlocked: number;
  totalAchievements: number;
  rank: number;
  badge?: string;
}

export interface SeasonPass {
  id: string;
  name: string;
  description: string;
  season: string;

  // Tiers
  freeTier: SeasonPassTier;
  premiumTier: SeasonPassTier;
  premiumPrice: number;

  // Progress
  totalLevels: number;
  xpPerLevel: number;

  // Timing
  startsAt: number;
  endsAt: number;
}

export interface SeasonPassTier {
  rewards: Array<{
    level: number;
    reward: AchievementReward;
  }>;
}

export interface UserSeasonPass {
  seasonPassId: string;
  userId: string;
  currentLevel: number;
  currentXP: number;
  isPremium: boolean;
  claimedRewards: number[];
  purchasedAt?: number;
}

// ============================================================================
// ACHIEVEMENT REWARDS SERVICE
// ============================================================================

export class AchievementRewardsService {
  /**
   * Calculate level from XP
   */
  calculateLevel(totalXP: number): {
    level: number;
    currentLevelXP: number;
    xpToNextLevel: number;
    progress: number;
  } {
    // XP formula: level N requires N * 100 XP
    // Level 1: 100 XP, Level 2: 200 XP, etc.
    let remainingXP = totalXP;
    let level = 1;

    while (remainingXP >= level * 100) {
      remainingXP -= level * 100;
      level++;
    }

    const xpForCurrentLevel = level * 100;
    const progress = remainingXP / xpForCurrentLevel;

    return {
      level,
      currentLevelXP: remainingXP,
      xpToNextLevel: xpForCurrentLevel - remainingXP,
      progress,
    };
  }

  /**
   * Get perks for a level
   */
  getLevelPerks(level: number): LevelPerk[] {
    const allPerks: LevelPerk[] = [
      { level: 5, name: "Beginner Boost", description: "+5% on all odds boosts", type: "boost", value: 5, isActive: false },
      { level: 10, name: "Early Access", description: "Early access to new features", type: "access", value: "beta", isActive: false },
      { level: 15, name: "Bet Limit+", description: "+$100 max bet limit", type: "limit_increase", value: 100, isActive: false },
      { level: 20, name: "VIP Frame", description: "Exclusive profile frame", type: "cosmetic", value: "vip_frame_1", isActive: false },
      { level: 25, name: "Pro Boost", description: "+10% on all odds boosts", type: "boost", value: 10, isActive: false },
      { level: 30, name: "Shop Discount", description: "10% off in rewards shop", type: "discount", value: 10, isActive: false },
      { level: 40, name: "Elite Access", description: "Access to elite-only contests", type: "access", value: "elite", isActive: false },
      { level: 50, name: "Legend Status", description: "Legendary profile badge", type: "cosmetic", value: "legend_badge", isActive: false },
    ];

    return allPerks.map(perk => ({
      ...perk,
      isActive: level >= perk.level,
    }));
  }

  /**
   * Generate daily rewards calendar
   */
  generateDailyRewards(daysInMonth: number = 30): DailyReward[] {
    const rewards: DailyReward[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const isBonusDay = day === 7 || day === 14 || day === 21 || day === 30;

      const baseReward: AchievementReward = {
        type: "tokens",
        value: 10 + Math.floor(day / 7) * 5,
        description: `${10 + Math.floor(day / 7) * 5} tokens`,
      };

      const dailyRewards: AchievementReward[] = [baseReward];

      if (isBonusDay) {
        if (day === 7) {
          dailyRewards.push({ type: "xp", value: 100, description: "100 bonus XP" });
        } else if (day === 14) {
          dailyRewards.push({ type: "free_bet", value: 5, description: "$5 free bet" });
        } else if (day === 21) {
          dailyRewards.push({ type: "boost", value: "odds_10", description: "10% odds boost" });
        } else if (day === 30) {
          dailyRewards.push(
            { type: "tokens", value: 100, description: "100 bonus tokens" },
            { type: "badge", value: "monthly_streak", description: "Monthly Streak badge" }
          );
        }
      }

      rewards.push({
        day,
        rewards: dailyRewards,
        isBonusDay,
      });
    }

    return rewards;
  }

  /**
   * Claim daily reward
   */
  claimDailyReward(
    streak: UserDailyStreak,
    today: string
  ): {
    success: boolean;
    rewards?: AchievementReward[];
    newStreak: UserDailyStreak;
    error?: string;
  } {
    // Check if already claimed today
    if (streak.lastClaimDate === today) {
      return {
        success: false,
        newStreak: streak,
        error: "Already claimed today",
      };
    }

    // Check if streak continues
    const yesterday = this.getYesterday(today);
    const streakContinues = streak.lastClaimDate === yesterday;

    const newStreak: UserDailyStreak = {
      ...streak,
      currentStreak: streakContinues ? streak.currentStreak + 1 : 1,
      longestStreak: Math.max(
        streak.longestStreak,
        streakContinues ? streak.currentStreak + 1 : 1
      ),
      lastClaimDate: today,
      totalDaysClaimed: streak.totalDaysClaimed + 1,
      currentMonthDays: this.isSameMonth(streak.lastClaimDate, today)
        ? streak.currentMonthDays + 1
        : 1,
    };

    // Get rewards for current day
    const dayRewards = this.generateDailyRewards();
    const todayReward = dayRewards[(newStreak.currentMonthDays - 1) % dayRewards.length];

    return {
      success: true,
      rewards: todayReward.rewards,
      newStreak,
    };
  }

  /**
   * Check achievement progress
   */
  checkAchievementProgress(
    achievement: Achievement,
    userStats: Record<string, number>
  ): { progress: number; isComplete: boolean } {
    let progress = 0;

    for (const req of achievement.requirements) {
      const statValue = userStats[req.type] ?? 0;
      const reqProgress = Math.min(statValue / req.value, 1);
      progress += reqProgress / achievement.requirements.length;
    }

    const isComplete = progress >= 1;
    const finalProgress = achievement.maxProgress
      ? Math.min(progress * achievement.maxProgress, achievement.maxProgress)
      : progress;

    return { progress: finalProgress, isComplete };
  }

  /**
   * Generate achievement leaderboard
   */
  generateLeaderboard(
    users: Array<{
      userId: string;
      username: string;
      avatarUrl?: string;
      totalXP: number;
      achievementsUnlocked: number;
    }>,
    totalAchievements: number,
    limit: number = 100
  ): LeaderboardEntry[] {
    return users
      .map(user => ({
        ...user,
        level: this.calculateLevel(user.totalXP).level,
        totalAchievements,
        rank: 0,
        badge: this.getBadgeForLevel(this.calculateLevel(user.totalXP).level),
      }))
      .sort((a, b) => b.totalXP - a.totalXP)
      .slice(0, limit)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  }

  /**
   * Create season pass
   */
  createSeasonPass(
    name: string,
    season: string,
    durationDays: number = 90
  ): SeasonPass {
    const now = Date.now();

    // Generate free tier rewards (every 5 levels)
    const freeRewards: SeasonPassTier["rewards"] = [];
    for (let level = 5; level <= 50; level += 5) {
      freeRewards.push({
        level,
        reward: {
          type: "tokens",
          value: level * 2,
          description: `${level * 2} tokens`,
        },
      });
    }

    // Generate premium tier rewards (every level)
    const premiumRewards: SeasonPassTier["rewards"] = [];
    for (let level = 1; level <= 50; level++) {
      let reward: AchievementReward;

      if (level % 10 === 0) {
        // Milestone levels get special rewards
        reward = {
          type: level === 50 ? "avatar" : "badge",
          value: `season_${season}_${level}`,
          description: level === 50 ? "Exclusive Season Avatar" : `Season ${level} Badge`,
        };
      } else if (level % 5 === 0) {
        reward = { type: "free_bet", value: 5, description: "$5 free bet" };
      } else {
        reward = { type: "tokens", value: 25, description: "25 tokens" };
      }

      premiumRewards.push({ level, reward });
    }

    return {
      id: `season_${season}`,
      name,
      description: `Season ${season} Battle Pass`,
      season,
      freeTier: { rewards: freeRewards },
      premiumTier: { rewards: premiumRewards },
      premiumPrice: 9.99,
      totalLevels: 50,
      xpPerLevel: 1000,
      startsAt: now,
      endsAt: now + (durationDays * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Get all achievements
   */
  getAllAchievements(): Achievement[] {
    return [
      // Betting achievements
      {
        id: "first_bet",
        name: "First Timer",
        description: "Place your first bet",
        category: "betting",
        icon: "🎯",
        rarity: "common",
        requirements: [{ type: "bets_placed", value: 1, description: "Place 1 bet" }],
        isSecret: false,
        rewards: [{ type: "xp", value: 50, description: "50 XP" }],
        xpValue: 50,
        progressType: "count",
        maxProgress: 1,
        isLimited: false,
      },
      {
        id: "century_club",
        name: "Century Club",
        description: "Place 100 bets",
        category: "betting",
        icon: "💯",
        rarity: "rare",
        requirements: [{ type: "bets_placed", value: 100, description: "Place 100 bets" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 500, description: "500 XP" },
          { type: "badge", value: "century_club", description: "Century Club badge" },
        ],
        xpValue: 500,
        progressType: "count",
        maxProgress: 100,
        isLimited: false,
      },
      {
        id: "big_winner",
        name: "Big Winner",
        description: "Win a bet with 10:1 odds or longer",
        category: "betting",
        icon: "🎰",
        rarity: "epic",
        requirements: [{ type: "longshot_wins", value: 1, description: "Win at +1000 odds" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 300, description: "300 XP" },
          { type: "tokens", value: 50, description: "50 tokens" },
        ],
        xpValue: 300,
        progressType: "count",
        maxProgress: 1,
        isLimited: false,
      },

      // Streak achievements
      {
        id: "hot_hand",
        name: "Hot Hand",
        description: "Win 5 bets in a row",
        category: "streaks",
        icon: "🔥",
        rarity: "uncommon",
        requirements: [{ type: "win_streak", value: 5, description: "5 win streak" }],
        isSecret: false,
        rewards: [{ type: "xp", value: 150, description: "150 XP" }],
        xpValue: 150,
        progressType: "streak",
        maxProgress: 5,
        isLimited: false,
      },
      {
        id: "unstoppable",
        name: "Unstoppable",
        description: "Win 10 bets in a row",
        category: "streaks",
        icon: "💪",
        rarity: "epic",
        requirements: [{ type: "win_streak", value: 10, description: "10 win streak" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 500, description: "500 XP" },
          { type: "free_bet", value: 10, description: "$10 free bet" },
        ],
        xpValue: 500,
        progressType: "streak",
        maxProgress: 10,
        isLimited: false,
      },

      // Social achievements
      {
        id: "social_butterfly",
        name: "Social Butterfly",
        description: "Follow 10 other bettors",
        category: "social",
        icon: "🦋",
        rarity: "common",
        requirements: [{ type: "following", value: 10, description: "Follow 10 users" }],
        isSecret: false,
        rewards: [{ type: "xp", value: 100, description: "100 XP" }],
        xpValue: 100,
        progressType: "count",
        maxProgress: 10,
        isLimited: false,
      },
      {
        id: "influencer",
        name: "Influencer",
        description: "Gain 100 followers",
        category: "social",
        icon: "⭐",
        rarity: "rare",
        requirements: [{ type: "followers", value: 100, description: "100 followers" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 400, description: "400 XP" },
          { type: "badge", value: "influencer", description: "Influencer badge" },
        ],
        xpValue: 400,
        progressType: "count",
        maxProgress: 100,
        isLimited: false,
      },

      // Bracket achievements
      {
        id: "bracket_master",
        name: "Bracket Master",
        description: "Complete a perfect first round",
        category: "brackets",
        icon: "🏀",
        rarity: "epic",
        requirements: [{ type: "perfect_first_round", value: 1, description: "Perfect first round" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 500, description: "500 XP" },
          { type: "tokens", value: 100, description: "100 tokens" },
        ],
        xpValue: 500,
        progressType: "boolean",
        isLimited: false,
      },

      // Loyalty achievements
      {
        id: "loyal_week",
        name: "Weekly Regular",
        description: "Log in 7 days in a row",
        category: "loyalty",
        icon: "📅",
        rarity: "uncommon",
        requirements: [{ type: "login_streak", value: 7, description: "7 day streak" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 200, description: "200 XP" },
          { type: "tokens", value: 25, description: "25 tokens" },
        ],
        xpValue: 200,
        progressType: "streak",
        maxProgress: 7,
        isLimited: false,
      },
      {
        id: "loyal_month",
        name: "Monthly Devotee",
        description: "Log in 30 days in a row",
        category: "loyalty",
        icon: "🌟",
        rarity: "epic",
        requirements: [{ type: "login_streak", value: 30, description: "30 day streak" }],
        isSecret: false,
        rewards: [
          { type: "xp", value: 1000, description: "1000 XP" },
          { type: "free_bet", value: 25, description: "$25 free bet" },
          { type: "badge", value: "devotee", description: "Devotee badge" },
        ],
        xpValue: 1000,
        progressType: "streak",
        maxProgress: 30,
        isLimited: false,
      },

      // Secret achievement
      {
        id: "the_prophecy",
        name: "The Prophecy",
        description: "???",
        category: "legendary",
        icon: "🔮",
        rarity: "legendary",
        requirements: [{ type: "perfect_bracket", value: 1, description: "Perfect bracket" }],
        isSecret: true,
        rewards: [
          { type: "xp", value: 10000, description: "10,000 XP" },
          { type: "cash", value: 1000, description: "$1,000 cash" },
          { type: "avatar", value: "oracle", description: "The Oracle avatar" },
        ],
        xpValue: 10000,
        progressType: "boolean",
        isLimited: false,
      },
    ];
  }

  private getYesterday(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  private isSameMonth(date1: string, date2: string): boolean {
    return date1.substring(0, 7) === date2.substring(0, 7);
  }

  private getBadgeForLevel(level: number): string | undefined {
    if (level >= 50) return "legend";
    if (level >= 30) return "elite";
    if (level >= 20) return "veteran";
    if (level >= 10) return "regular";
    return undefined;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAchievementRewardsService(): AchievementRewardsService {
  return new AchievementRewardsService();
}
