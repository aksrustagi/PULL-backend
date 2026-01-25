import type {
  UserStreak,
  SeasonPass,
  Achievement,
  UserAchievement,
  YearInReview,
  LeagueTrophy,
  DailyChallenge,
  RevengeGameAlert,
  EngagementConfig,
} from './types';

/**
 * EngagementService - Retention mechanics and rewards
 * Manages streaks, season passes, achievements, and special events
 */
export class EngagementService {
  private static instance: EngagementService;
  private config: EngagementConfig;

  private constructor(config: Partial<EngagementConfig> = {}) {
    this.config = {
      streakMultipliers: config.streakMultipliers ?? {
        3: 1.5,
        7: 2.0,
        14: 2.5,
        30: 3.0,
      },
      dailyXpCap: config.dailyXpCap ?? 1000,
      seasonPassPriceUSD: config.seasonPassPriceUSD ?? 9.99,
    };
  }

  static getInstance(config?: Partial<EngagementConfig>): EngagementService {
    if (!EngagementService.instance) {
      EngagementService.instance = new EngagementService(config);
    }
    return EngagementService.instance;
  }

  async updateStreak(userId: string): Promise<UserStreak> {
    // TODO: Update login streak
    // 1. Check last login date
    // 2. If yesterday, increment streak
    // 3. If today, return current
    // 4. If before yesterday, reset streak
    // 5. Apply multiplier based on streak length

    return {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: new Date(),
      multiplier: 1,
      rewards: [],
    };
  }

  async getSeasonPass(userId: string, season: string): Promise<SeasonPass> {
    // TODO: Get or create season pass for user
    return {
      passId: crypto.randomUUID(),
      userId,
      season,
      tier: 'free',
      currentLevel: 1,
      currentXP: 0,
      xpToNextLevel: 100,
      rewards: [],
      expiresAt: new Date(),
    };
  }

  async addXP(userId: string, amount: number, source: string): Promise<{ newXP: number; leveledUp: boolean }> {
    // TODO: Add XP and check for level up
    // 1. Apply streak multiplier
    // 2. Check daily cap
    // 3. Add XP to season pass
    // 4. Check if leveled up
    // 5. Unlock rewards if leveled up

    return { newXP: 0, leveledUp: false };
  }

  async unlockAchievement(userId: string, achievementId: string): Promise<UserAchievement> {
    // TODO: Unlock achievement for user
    // 1. Check if already unlocked
    // 2. Award XP
    // 3. Trigger notification

    return {
      userId,
      achievementId,
      unlockedAt: new Date(),
    };
  }

  async checkAchievements(userId: string, event: unknown): Promise<Achievement[]> {
    // TODO: Check if event triggered any achievements
    // Examples:
    // - "Made 10 trades" achievement
    // - "Won 5 leagues" achievement
    // - "Perfect season" achievement
    return [];
  }

  async generateYearInReview(userId: string, year: number): Promise<YearInReview> {
    // TODO: Generate shareable year-in-review
    // 1. Aggregate stats for the year
    // 2. Find highlights (biggest win, best finish, etc.)
    // 3. Generate shareable image/infographic
    // 4. Return data + image URL

    return {
      reviewId: crypto.randomUUID(),
      userId,
      year,
      stats: {
        totalGamesPlayed: 0,
        totalWinnings: 0,
        winRate: 0,
        bestFinish: 'N/A',
        favoritePlayer: 'N/A',
        biggestWin: 0,
        totalTrades: 0,
        leaguesJoined: 0,
      },
      highlights: [],
      createdAt: new Date(),
    };
  }

  async mintChampionshipTrophy(leagueId: string, seasonId: string, winnerId: string): Promise<LeagueTrophy> {
    // TODO: Mint NFT trophy for championship
    // 1. Generate unique trophy metadata
    // 2. Mint NFT on blockchain (optional)
    // 3. Store trophy data
    // 4. Award to winner

    return {
      trophyId: crypto.randomUUID(),
      leagueId,
      seasonId,
      winnerId,
      trophyType: 'champion',
      sport: 'nfl',
      createdAt: new Date(),
    };
  }

  async getDailyChallenge(sport: string, date: Date): Promise<DailyChallenge | null> {
    // TODO: Get daily challenge for sport
    // Examples:
    // - "Start a QB who throws for 300+ yards"
    // - "Make a trade today"
    // - "Set your optimal lineup"
    return null;
  }

  async detectRevengeGames(userId: string): Promise<RevengeGameAlert[]> {
    // TODO: Detect when player faces former team
    // 1. Get user's roster
    // 2. Check upcoming games
    // 3. Match player current team vs opponent
    // 4. Create alerts for revenge games

    return [];
  }

  private calculateStreakMultiplier(streakDays: number): number {
    // Find highest applicable multiplier
    const multipliers = Object.entries(this.config.streakMultipliers)
      .map(([days, mult]) => ({ days: parseInt(days), mult }))
      .sort((a, b) => b.days - a.days);

    for (const { days, mult } of multipliers) {
      if (streakDays >= days) {
        return mult;
      }
    }
    return 1;
  }
}

export const engagementService = EngagementService.getInstance();
