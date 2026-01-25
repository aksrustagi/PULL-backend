/**
 * Engagement & Retention Mechanics
 * Streaks, season passes, achievements, and rewards
 */

export interface UserStreak {
  userId: string;
  currentStreak: number; // Consecutive days
  longestStreak: number;
  lastLoginDate: Date;
  multiplier: number; // XP multiplier based on streak
  rewards: StreakReward[];
}

export interface StreakReward {
  day: number;
  rewardType: 'xp' | 'credits' | 'cosmetic' | 'early_access';
  rewardValue: string;
  claimed: boolean;
}

export interface SeasonPass {
  passId: string;
  userId: string;
  season: string; // e.g., "2024-nfl"
  tier: 'free' | 'premium';
  currentLevel: number;
  currentXP: number;
  xpToNextLevel: number;
  rewards: SeasonPassReward[];
  purchasedAt?: Date;
  expiresAt: Date;
}

export interface SeasonPassReward {
  level: number;
  tier: 'free' | 'premium';
  rewardType: 'cosmetic' | 'credits' | 'early_access' | 'badge' | 'nft';
  rewardId: string;
  rewardName: string;
  claimed: boolean;
}

export interface Achievement {
  achievementId: string;
  name: string;
  description: string;
  icon: string;
  category: 'trading' | 'social' | 'performance' | 'participation' | 'special';
  sport?: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa' | 'all';
  xpReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  criteria: unknown; // JSON criteria for unlocking
}

export interface UserAchievement {
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  progress?: number; // For multi-step achievements
}

export interface YearInReview {
  reviewId: string;
  userId: string;
  year: number;
  stats: {
    totalGamesPlayed: number;
    totalWinnings: number;
    winRate: number;
    bestFinish: string;
    favoritePlayer: string;
    biggestWin: number;
    totalTrades: number;
    leaguesJoined: number;
  };
  highlights: string[];
  shareableImageUrl?: string;
  createdAt: Date;
}

export interface LeagueTrophy {
  trophyId: string;
  leagueId: string;
  seasonId: string;
  winnerId: string;
  trophyType: 'champion' | 'runner_up' | 'third_place' | 'most_points' | 'best_trade';
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  mintedNFT?: {
    tokenId: string;
    contractAddress: string;
    blockchain: 'ethereum' | 'polygon';
    tokenUri: string;
  };
  createdAt: Date;
}

export interface DailyChallenge {
  challengeId: string;
  date: Date;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  title: string;
  description: string;
  xpReward: number;
  criteria: unknown;
}

export interface RevengeGameAlert {
  alertId: string;
  userId: string;
  playerId: string;
  playerName: string;
  formerTeam: string;
  currentTeam: string;
  gameDate: Date;
  notificationSent: boolean;
}

export interface EngagementConfig {
  streakMultipliers: { [days: number]: number };
  dailyXpCap: number;
  seasonPassPriceUSD: number;
}
