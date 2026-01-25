/**
 * KILLER FEATURE #2: Social Betting & Copy Trading
 *
 * Follow top bettors, copy their picks, and compete with friends.
 * Creates a social network layer over prediction markets.
 *
 * WHY IT KILLS:
 * - Leverages social proof (biggest conversion driver)
 * - Creates influencer ecosystem
 * - FOMO from seeing friends win
 * - Reduced decision paralysis by following experts
 *
 * K-FACTOR BOOST:
 * - Invite friends to follow you
 * - Public leaderboards with handles
 * - Shareable win receipts
 * - Challenge friends to H2H
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const BettorTierSchema = z.enum([
  "rookie",        // < 50 bets
  "regular",       // 50-200 bets
  "sharp",         // 200+ bets, > 52% win rate
  "pro",           // 500+ bets, > 54% win rate
  "elite",         // 1000+ bets, > 55% win rate, verified
  "legend",        // Top 100 all-time
]);

export type BettorTier = z.infer<typeof BettorTierSchema>;

export interface BettorProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  tier: BettorTier;
  isVerified: boolean;
  isPro: boolean;

  // Stats
  totalBets: number;
  winRate: number;
  roi: number;
  avgOdds: number;
  profitLoss: number;
  streak: number;
  longestStreak: number;

  // By sport
  sportStats: Record<string, SportStats>;

  // Social
  followers: number;
  following: number;
  copiers: number;

  // Badges
  badges: Badge[];

  // Settings
  allowCopying: boolean;
  copyFee?: number; // % of winnings to tip
  isPublic: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface SportStats {
  sport: string;
  bets: number;
  winRate: number;
  roi: number;
  profitLoss: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  earnedAt: number;
}

export interface Follow {
  followerId: string;
  followingId: string;
  followedAt: number;
  notifications: boolean;
}

export interface CopySettings {
  userId: string;
  copyingUserId: string;
  isActive: boolean;
  copyPercentage: number; // % of their bet size
  maxBetSize: number;
  minOdds?: number;
  maxOdds?: number;
  sports?: string[];
  betTypes?: string[];
  autoApprove: boolean; // Auto-place or require confirmation
  dailyLimit?: number;
  startedAt: number;
  lastCopiedAt?: number;
}

export interface CopiedBet {
  id: string;
  originalBetId: string;
  originalUserId: string;
  copierUserId: string;
  amount: number;
  originalAmount: number;
  status: "pending" | "placed" | "won" | "lost" | "skipped";
  skipReason?: string;
  result?: "win" | "loss" | "push";
  profitLoss?: number;
  copiedAt: number;
}

export interface Challenge {
  id: string;
  challengerId: string;
  challengedId: string;
  type: "h2h" | "best_of" | "roi" | "streak";
  sport?: string;
  numBets?: number;
  duration?: number; // hours
  stake?: number;
  status: "pending" | "accepted" | "active" | "complete" | "declined" | "expired";
  challengerScore: number;
  challengedScore: number;
  winnerId?: string;
  createdAt: number;
  acceptedAt?: number;
  completedAt?: number;
}

export interface PublicBet {
  betId: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  tier: BettorTier;
  sport: string;
  event: string;
  pick: string;
  odds: number;
  amount?: number; // Hidden if user chooses
  confidence?: "lock" | "strong" | "lean";
  analysis?: string;
  likes: number;
  copies: number;
  result?: "win" | "loss" | "push" | "pending";
  postedAt: number;
}

// ============================================================================
// SOCIAL BETTING SERVICE
// ============================================================================

export class SocialBettingService {
  /**
   * Calculate bettor tier based on stats
   */
  calculateTier(stats: {
    totalBets: number;
    winRate: number;
    isVerified: boolean;
    allTimeRank?: number;
  }): BettorTier {
    if (stats.allTimeRank && stats.allTimeRank <= 100) return "legend";
    if (stats.totalBets >= 1000 && stats.winRate >= 0.55 && stats.isVerified) return "elite";
    if (stats.totalBets >= 500 && stats.winRate >= 0.54) return "pro";
    if (stats.totalBets >= 200 && stats.winRate >= 0.52) return "sharp";
    if (stats.totalBets >= 50) return "regular";
    return "rookie";
  }

  /**
   * Get top bettors leaderboard
   */
  getLeaderboard(
    profiles: BettorProfile[],
    options: {
      sortBy: "roi" | "winRate" | "profitLoss" | "streak" | "copiers";
      sport?: string;
      timeframe?: "day" | "week" | "month" | "all";
      minBets?: number;
      limit?: number;
    }
  ): Array<BettorProfile & { rank: number }> {
    let filtered = profiles.filter(p => p.isPublic);

    if (options.minBets) {
      filtered = filtered.filter(p => p.totalBets >= options.minBets!);
    }

    if (options.sport) {
      filtered = filtered.filter(p => p.sportStats[options.sport!]?.bets > 0);
    }

    const sortFn = (a: BettorProfile, b: BettorProfile) => {
      switch (options.sortBy) {
        case "roi": return b.roi - a.roi;
        case "winRate": return b.winRate - a.winRate;
        case "profitLoss": return b.profitLoss - a.profitLoss;
        case "streak": return b.streak - a.streak;
        case "copiers": return b.copiers - a.copiers;
        default: return b.profitLoss - a.profitLoss;
      }
    };

    return filtered
      .sort(sortFn)
      .slice(0, options.limit ?? 100)
      .map((profile, index) => ({
        ...profile,
        rank: index + 1,
      }));
  }

  /**
   * Process a copy bet
   */
  processCopyBet(
    originalBet: {
      id: string;
      userId: string;
      amount: number;
      odds: number;
      sport: string;
      betType: string;
    },
    copySettings: CopySettings,
    copierBalance: number
  ): CopiedBet | { skipped: true; reason: string } {
    // Check if copy is active
    if (!copySettings.isActive) {
      return { skipped: true, reason: "Copy trading is paused" };
    }

    // Check sport filter
    if (copySettings.sports?.length && !copySettings.sports.includes(originalBet.sport)) {
      return { skipped: true, reason: "Sport not in filter" };
    }

    // Check bet type filter
    if (copySettings.betTypes?.length && !copySettings.betTypes.includes(originalBet.betType)) {
      return { skipped: true, reason: "Bet type not in filter" };
    }

    // Check odds range
    if (copySettings.minOdds && originalBet.odds < copySettings.minOdds) {
      return { skipped: true, reason: "Odds below minimum" };
    }
    if (copySettings.maxOdds && originalBet.odds > copySettings.maxOdds) {
      return { skipped: true, reason: "Odds above maximum" };
    }

    // Calculate copy amount
    let copyAmount = originalBet.amount * (copySettings.copyPercentage / 100);
    copyAmount = Math.min(copyAmount, copySettings.maxBetSize);
    copyAmount = Math.min(copyAmount, copierBalance);

    if (copyAmount < 1) {
      return { skipped: true, reason: "Copy amount too small" };
    }

    return {
      id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalBetId: originalBet.id,
      originalUserId: originalBet.userId,
      copierUserId: copySettings.userId,
      amount: copyAmount,
      originalAmount: originalBet.amount,
      status: copySettings.autoApprove ? "placed" : "pending",
      copiedAt: Date.now(),
    };
  }

  /**
   * Create a challenge between users
   */
  createChallenge(
    challengerId: string,
    challengedId: string,
    options: {
      type: Challenge["type"];
      sport?: string;
      numBets?: number;
      duration?: number;
      stake?: number;
    }
  ): Challenge {
    return {
      id: `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      challengerId,
      challengedId,
      type: options.type,
      sport: options.sport,
      numBets: options.numBets,
      duration: options.duration,
      stake: options.stake,
      status: "pending",
      challengerScore: 0,
      challengedScore: 0,
      createdAt: Date.now(),
    };
  }

  /**
   * Generate shareable bet slip
   */
  generateShareableBetSlip(bet: PublicBet): {
    title: string;
    description: string;
    shareUrl: string;
    shareText: string;
  } {
    const resultEmoji = bet.result === "win" ? "✅" : bet.result === "loss" ? "❌" : "⏳";
    const confidenceEmoji = bet.confidence === "lock" ? "🔒" : bet.confidence === "strong" ? "💪" : "🤔";

    return {
      title: `${bet.username}'s Pick ${resultEmoji}`,
      description: `${bet.event}: ${bet.pick} (${this.formatOdds(bet.odds)})`,
      shareUrl: `https://pull.app/picks/${bet.betId}`,
      shareText: `${confidenceEmoji} ${bet.username} ${bet.result === "win" ? "CASHED" : "picked"} ${bet.pick} ${bet.result === "win" ? `and won! ${resultEmoji}` : ""}\n\nSee the pick: pull.app/picks/${bet.betId}`,
    };
  }

  /**
   * Get recommended bettors to follow
   */
  getRecommendedBettors(
    userProfile: BettorProfile,
    allProfiles: BettorProfile[],
    limit: number = 10
  ): BettorProfile[] {
    // Find bettors with similar sport preferences but better stats
    const userSports = Object.keys(userProfile.sportStats);

    return allProfiles
      .filter(p => p.userId !== userProfile.userId)
      .filter(p => p.isPublic && p.allowCopying)
      .filter(p => p.winRate > userProfile.winRate)
      .filter(p => {
        const theirSports = Object.keys(p.sportStats);
        return userSports.some(s => theirSports.includes(s));
      })
      .sort((a, b) => {
        // Score by relevance + performance
        const aScore = a.winRate * 100 + a.copiers / 10;
        const bScore = b.winRate * 100 + b.copiers / 10;
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  private formatOdds(odds: number): string {
    return odds > 0 ? `+${odds}` : `${odds}`;
  }
}

// ============================================================================
// EARNED BADGES
// ============================================================================

export const SOCIAL_BETTING_BADGES: Badge[] = [
  {
    id: "first_follow",
    name: "Social Butterfly",
    description: "Followed your first bettor",
    icon: "🦋",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "10_followers",
    name: "Rising Star",
    description: "Gained 10 followers",
    icon: "⭐",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "100_followers",
    name: "Influencer",
    description: "Gained 100 followers",
    icon: "🌟",
    rarity: "rare",
    earnedAt: 0,
  },
  {
    id: "1000_followers",
    name: "Celebrity",
    description: "Gained 1,000 followers",
    icon: "👑",
    rarity: "epic",
    earnedAt: 0,
  },
  {
    id: "first_copied",
    name: "Trendsetter",
    description: "Someone copied your bet",
    icon: "📋",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "100_copies",
    name: "Pied Piper",
    description: "Your bets have been copied 100 times",
    icon: "🎺",
    rarity: "rare",
    earnedAt: 0,
  },
  {
    id: "challenge_won",
    name: "Challenger",
    description: "Won your first H2H challenge",
    icon: "⚔️",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "10_challenges_won",
    name: "Gladiator",
    description: "Won 10 H2H challenges",
    icon: "🏛️",
    rarity: "rare",
    earnedAt: 0,
  },
  {
    id: "sharp_status",
    name: "Sharp",
    description: "Achieved Sharp bettor status",
    icon: "🎯",
    rarity: "epic",
    earnedAt: 0,
  },
  {
    id: "legend_status",
    name: "Legend",
    description: "Reached Top 100 all-time",
    icon: "🏆",
    rarity: "legendary",
    earnedAt: 0,
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createSocialBettingService(): SocialBettingService {
  return new SocialBettingService();
}
