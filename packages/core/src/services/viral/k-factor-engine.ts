/**
 * K-Factor Viral Growth Engine
 *
 * Maximize organic user acquisition through:
 * - Referral programs with tiered rewards
 * - Viral content generation
 * - Social proof mechanics
 * - FOMO-inducing features
 * - Share-worthy moments
 *
 * K-Factor = invites sent × conversion rate
 * Target: K > 1 (viral growth)
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const ReferralTierSchema = z.enum([
  "bronze",     // 0-4 referrals
  "silver",     // 5-14 referrals
  "gold",       // 15-29 referrals
  "platinum",   // 30-49 referrals
  "diamond",    // 50+ referrals
  "ambassador", // Special status
]);

export type ReferralTier = z.infer<typeof ReferralTierSchema>;

export interface ReferralProgram {
  id: string;
  userId: string;
  referralCode: string;
  customLink?: string;

  // Stats
  stats: ReferralStats;

  // Tier and rewards
  tier: ReferralTier;
  tierProgress: number; // Progress to next tier
  lifetimeEarnings: number;
  pendingEarnings: number;

  // Settings
  isActive: boolean;
  autoShare: boolean;
  sharePreferences: SharePreferences;

  createdAt: number;
}

export interface ReferralStats {
  totalClicks: number;
  totalSignups: number;
  totalDeposits: number;
  totalBets: number;
  conversionRate: number;

  // By source
  bySource: Record<string, { clicks: number; signups: number }>;

  // Time-based
  last7Days: { clicks: number; signups: number };
  last30Days: { clicks: number; signups: number };
}

export interface Referral {
  id: string;
  referrerId: string;
  refereeId: string;
  referralCode: string;
  source: string;

  // Status
  status: "pending" | "signed_up" | "deposited" | "qualified" | "rewarded";
  qualificationProgress: QualificationProgress;

  // Rewards
  referrerReward?: number;
  refereeReward?: number;
  rewardsPaid: boolean;

  // Dates
  clickedAt: number;
  signedUpAt?: number;
  depositedAt?: number;
  qualifiedAt?: number;
}

export interface QualificationProgress {
  requiredDeposit: number;
  actualDeposit: number;
  requiredBets: number;
  actualBets: number;
  requiredWagered: number;
  actualWagered: number;
  isQualified: boolean;
}

export interface SharePreferences {
  defaultMessage: string;
  showWinnings: boolean;
  showPicks: boolean;
  includeProfitLoss: boolean;
  autoShareWins: boolean;
  autoShareStreaks: boolean;
  autoShareAchievements: boolean;
}

export interface ShareableContent {
  id: string;
  userId: string;
  type: ShareableType;
  title: string;
  description: string;

  // Content
  imageUrl?: string;
  videoUrl?: string;
  stats?: Record<string, string | number>;

  // Social
  referralCode?: string;
  deepLink: string;
  shareUrl: string;

  // Platforms
  platforms: SharePlatform[];

  // Tracking
  shares: number;
  clicks: number;
  conversions: number;

  createdAt: number;
  expiresAt?: number;
}

export type ShareableType =
  | "win"
  | "streak"
  | "big_win"
  | "parlay_hit"
  | "bracket_score"
  | "achievement"
  | "leaderboard"
  | "challenge_win"
  | "cash_out"
  | "prediction"
  | "invite";

export interface SharePlatform {
  name: "twitter" | "facebook" | "instagram" | "tiktok" | "snapchat" | "sms" | "email" | "copy";
  isEnabled: boolean;
  shareText: string;
  hashtags?: string[];
  imageSize?: { width: number; height: number };
}

export interface ViralMoment {
  id: string;
  userId: string;
  type: ViralMomentType;

  // Details
  title: string;
  description: string;
  magnitude: number; // How impressive (0-100)

  // Content
  cardData: ViralCardData;

  // Virality metrics
  shareScore: number; // How likely to be shared
  fomo_factor: number; // How much FOMO it creates

  createdAt: number;
}

export type ViralMomentType =
  | "massive_parlay"     // 5+ leg parlay hit
  | "longshot_win"       // +1000 or longer
  | "perfect_bracket"    // All picks correct
  | "streak_milestone"   // Hit streak milestone
  | "comeback_win"       // Was way down, cashed out or won
  | "squad_victory"      // Squad battle win
  | "challenge_domination"; // Crushed a challenge

export interface ViralCardData {
  template: string;
  primaryStat: { label: string; value: string };
  secondaryStats?: Array<{ label: string; value: string }>;
  backgroundColor: string;
  accentColor: string;
  badgeText?: string;
  username: string;
  avatarUrl?: string;
  timestamp: number;
}

export interface SocialProof {
  type: "recent_wins" | "active_users" | "big_wins" | "trending" | "friend_activity";
  title: string;
  items: SocialProofItem[];
  updatedAt: number;
}

export interface SocialProofItem {
  userId?: string;
  username: string;
  avatarUrl?: string;
  action: string;
  value?: string;
  timestamp: number;
}

// ============================================================================
// K-FACTOR ENGINE
// ============================================================================

export class KFactorEngine {
  /**
   * Calculate referral tier based on successful referrals
   */
  calculateTier(successfulReferrals: number): {
    tier: ReferralTier;
    progress: number;
    nextTierAt: number;
  } {
    const tiers: Array<{ tier: ReferralTier; min: number; max: number }> = [
      { tier: "bronze", min: 0, max: 4 },
      { tier: "silver", min: 5, max: 14 },
      { tier: "gold", min: 15, max: 29 },
      { tier: "platinum", min: 30, max: 49 },
      { tier: "diamond", min: 50, max: Infinity },
    ];

    for (const t of tiers) {
      if (successfulReferrals >= t.min && successfulReferrals <= t.max) {
        const range = t.max === Infinity ? 50 : t.max - t.min + 1;
        const progress = (successfulReferrals - t.min) / range;

        return {
          tier: t.tier,
          progress: Math.min(progress, 1),
          nextTierAt: t.max === Infinity ? -1 : t.max + 1,
        };
      }
    }

    return { tier: "bronze", progress: 0, nextTierAt: 5 };
  }

  /**
   * Get rewards for a tier
   */
  getTierRewards(tier: ReferralTier): {
    referrerBonus: number;
    refereeBonus: number;
    percentageBonus: number; // % of referee's losses (rev share)
    perks: string[];
  } {
    switch (tier) {
      case "bronze":
        return {
          referrerBonus: 10,
          refereeBonus: 10,
          percentageBonus: 0,
          perks: ["$10 per referral", "Basic referral link"],
        };
      case "silver":
        return {
          referrerBonus: 15,
          refereeBonus: 15,
          percentageBonus: 5,
          perks: ["$15 per referral", "5% rev share for 30 days", "Custom link"],
        };
      case "gold":
        return {
          referrerBonus: 25,
          refereeBonus: 20,
          percentageBonus: 10,
          perks: ["$25 per referral", "10% rev share for 60 days", "Priority support"],
        };
      case "platinum":
        return {
          referrerBonus: 40,
          refereeBonus: 25,
          percentageBonus: 15,
          perks: ["$40 per referral", "15% rev share for 90 days", "Exclusive promotions"],
        };
      case "diamond":
        return {
          referrerBonus: 50,
          refereeBonus: 30,
          percentageBonus: 20,
          perks: ["$50 per referral", "20% lifetime rev share", "VIP status", "Direct contact"],
        };
      case "ambassador":
        return {
          referrerBonus: 100,
          refereeBonus: 50,
          percentageBonus: 25,
          perks: ["$100 per referral", "25% lifetime rev share", "Brand partnership", "Exclusive events"],
        };
    }
  }

  /**
   * Generate referral code
   */
  generateReferralCode(username: string): string {
    const clean = username.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${clean}${random}`;
  }

  /**
   * Create shareable content
   */
  createShareableContent(
    userId: string,
    type: ShareableType,
    data: {
      title: string;
      description: string;
      stats?: Record<string, string | number>;
      imageUrl?: string;
    },
    referralCode: string
  ): ShareableContent {
    const baseUrl = "https://pull.app";
    const deepLink = `${baseUrl}/r/${referralCode}?t=${type}`;

    return {
      id: `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      title: data.title,
      description: data.description,
      stats: data.stats,
      imageUrl: data.imageUrl,
      referralCode,
      deepLink,
      shareUrl: deepLink,
      platforms: this.generatePlatformConfigs(type, data, referralCode),
      shares: 0,
      clicks: 0,
      conversions: 0,
      createdAt: Date.now(),
    };
  }

  /**
   * Detect viral moments
   */
  detectViralMoment(event: {
    type: "bet_won" | "parlay_hit" | "bracket_update" | "streak" | "cash_out";
    userId: string;
    username: string;
    odds?: number;
    amount?: number;
    payout?: number;
    legs?: number;
    streakLength?: number;
    bracketRank?: number;
    previousWinProb?: number;
    currentWinProb?: number;
  }): ViralMoment | null {
    // Check for massive parlay
    if (event.type === "parlay_hit" && event.legs && event.legs >= 5) {
      return this.createViralMoment(
        event.userId,
        event.username,
        "massive_parlay",
        {
          legs: event.legs,
          odds: event.odds,
          payout: event.payout,
        }
      );
    }

    // Check for longshot win
    if (event.type === "bet_won" && event.odds && event.odds >= 1000) {
      return this.createViralMoment(
        event.userId,
        event.username,
        "longshot_win",
        {
          odds: event.odds,
          payout: event.payout,
        }
      );
    }

    // Check for streak milestone
    if (event.type === "streak" && event.streakLength) {
      const milestones = [5, 10, 15, 20, 25];
      if (milestones.includes(event.streakLength)) {
        return this.createViralMoment(
          event.userId,
          event.username,
          "streak_milestone",
          {
            streakLength: event.streakLength,
          }
        );
      }
    }

    // Check for comeback cash out
    if (event.type === "cash_out" && event.previousWinProb && event.currentWinProb) {
      const swing = event.currentWinProb - event.previousWinProb;
      if (swing > 0.4) {
        return this.createViralMoment(
          event.userId,
          event.username,
          "comeback_win",
          {
            previousProb: event.previousWinProb,
            finalProb: event.currentWinProb,
            payout: event.payout,
          }
        );
      }
    }

    return null;
  }

  /**
   * Generate social proof feed
   */
  generateSocialProof(
    type: SocialProof["type"],
    data: Array<{
      userId?: string;
      username: string;
      avatarUrl?: string;
      action: string;
      value?: string;
      timestamp: number;
    }>
  ): SocialProof {
    const titles: Record<SocialProof["type"], string> = {
      recent_wins: "Recent Winners",
      active_users: "People Playing Now",
      big_wins: "Big Wins Today",
      trending: "Trending Picks",
      friend_activity: "Your Friends",
    };

    return {
      type,
      title: titles[type],
      items: data.map(d => ({
        userId: d.userId,
        username: d.username,
        avatarUrl: d.avatarUrl,
        action: d.action,
        value: d.value,
        timestamp: d.timestamp,
      })),
      updatedAt: Date.now(),
    };
  }

  /**
   * Calculate share score (likelihood of being shared)
   */
  calculateShareScore(event: {
    type: ShareableType;
    magnitude: number;
    userFollowers: number;
    previousShares: number;
  }): number {
    const typeWeights: Record<ShareableType, number> = {
      big_win: 0.9,
      parlay_hit: 0.85,
      streak: 0.7,
      win: 0.4,
      achievement: 0.6,
      leaderboard: 0.65,
      challenge_win: 0.75,
      cash_out: 0.5,
      bracket_score: 0.7,
      prediction: 0.3,
      invite: 0.2,
    };

    const baseScore = typeWeights[event.type] ?? 0.3;
    const magnitudeBoost = event.magnitude / 100 * 0.3;
    const socialBoost = Math.min(event.userFollowers / 1000, 0.2);
    const historyBoost = event.previousShares > 0 ? 0.1 : 0;

    return Math.min(1, baseScore + magnitudeBoost + socialBoost + historyBoost);
  }

  /**
   * Generate FOMO notification
   */
  generateFOMONotification(event: {
    type: "friend_win" | "trending_event" | "limited_time" | "leaderboard_close";
    data: Record<string, any>;
  }): {
    title: string;
    body: string;
    urgency: "low" | "medium" | "high";
    actionUrl: string;
  } {
    switch (event.type) {
      case "friend_win":
        return {
          title: `${event.data.friendName} just won! 🎉`,
          body: `They hit a ${event.data.odds} bet for $${event.data.payout}`,
          urgency: "medium",
          actionUrl: `/picks/${event.data.pickId}`,
        };
      case "trending_event":
        return {
          title: "Everyone's betting on this 🔥",
          body: `${event.data.betCount}+ people are on ${event.data.eventName}`,
          urgency: "high",
          actionUrl: `/events/${event.data.eventId}`,
        };
      case "limited_time":
        return {
          title: "Limited time offer! ⏰",
          body: event.data.offer,
          urgency: "high",
          actionUrl: event.data.url,
        };
      case "leaderboard_close":
        return {
          title: "You're so close! 📊",
          body: `Just ${event.data.pointsNeeded} points from ${event.data.position}!`,
          urgency: "medium",
          actionUrl: "/leaderboard",
        };
      default:
        return {
          title: "Check this out!",
          body: "Something exciting is happening",
          urgency: "low",
          actionUrl: "/",
        };
    }
  }

  /**
   * Get referral leaderboard
   */
  getReferralLeaderboard(
    programs: ReferralProgram[],
    limit: number = 50
  ): Array<ReferralProgram & { rank: number }> {
    return programs
      .filter(p => p.isActive)
      .sort((a, b) => b.stats.totalSignups - a.stats.totalSignups)
      .slice(0, limit)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
  }

  private createViralMoment(
    userId: string,
    username: string,
    type: ViralMomentType,
    data: Record<string, any>
  ): ViralMoment {
    const configs: Record<ViralMomentType, {
      title: string;
      description: string;
      magnitude: number;
      template: string;
      primaryLabel: string;
      colors: { bg: string; accent: string };
    }> = {
      massive_parlay: {
        title: "PARLAY KING! 👑",
        description: `${data.legs}-leg parlay CASHED!`,
        magnitude: Math.min(100, data.legs * 15),
        template: "parlay_win",
        primaryLabel: `${data.legs}-LEG PARLAY`,
        colors: { bg: "#1a1a2e", accent: "#ffd700" },
      },
      longshot_win: {
        title: "LONGSHOT LEGEND! 🎯",
        description: `Hit at +${data.odds}!`,
        magnitude: Math.min(100, data.odds / 50),
        template: "longshot",
        primaryLabel: `+${data.odds}`,
        colors: { bg: "#0d1b2a", accent: "#00ff88" },
      },
      perfect_bracket: {
        title: "PERFECT BRACKET! 🏆",
        description: "100% correct picks!",
        magnitude: 100,
        template: "bracket",
        primaryLabel: "PERFECT",
        colors: { bg: "#1b2838", accent: "#ff6b35" },
      },
      streak_milestone: {
        title: `${data.streakLength} STREAK! 🔥`,
        description: `${data.streakLength} wins in a row!`,
        magnitude: Math.min(100, data.streakLength * 8),
        template: "streak",
        primaryLabel: `${data.streakLength} WINS`,
        colors: { bg: "#2d132c", accent: "#ff4444" },
      },
      comeback_win: {
        title: "COMEBACK KING! 💪",
        description: "From the brink to victory!",
        magnitude: Math.min(100, (data.finalProb - data.previousProb) * 100),
        template: "comeback",
        primaryLabel: "COMEBACK",
        colors: { bg: "#1a1a2e", accent: "#4ecdc4" },
      },
      squad_victory: {
        title: "SQUAD WINS! ⚔️",
        description: "Team victory!",
        magnitude: 70,
        template: "squad",
        primaryLabel: "VICTORY",
        colors: { bg: "#16213e", accent: "#e94560" },
      },
      challenge_domination: {
        title: "CHALLENGE CRUSHED! 💥",
        description: "Dominated the competition!",
        magnitude: 75,
        template: "challenge",
        primaryLabel: "DOMINATED",
        colors: { bg: "#1a1a2e", accent: "#7b2cbf" },
      },
    };

    const config = configs[type];

    return {
      id: `viral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      title: config.title,
      description: config.description,
      magnitude: config.magnitude,
      cardData: {
        template: config.template,
        primaryStat: { label: config.primaryLabel, value: data.payout ? `$${data.payout}` : "" },
        backgroundColor: config.colors.bg,
        accentColor: config.colors.accent,
        username,
        timestamp: Date.now(),
      },
      shareScore: config.magnitude / 100,
      fomo_factor: config.magnitude / 100 * 0.8,
      createdAt: Date.now(),
    };
  }

  private generatePlatformConfigs(
    type: ShareableType,
    data: { title: string; description: string },
    referralCode: string
  ): SharePlatform[] {
    const baseText = `${data.title} - ${data.description}`;
    const url = `https://pull.app/r/${referralCode}`;

    return [
      {
        name: "twitter",
        isEnabled: true,
        shareText: `${baseText} 🎯\n\nJoin me on Pull: ${url}`,
        hashtags: ["sports", "betting", "winner"],
      },
      {
        name: "facebook",
        isEnabled: true,
        shareText: `${baseText}\n\nJoin me: ${url}`,
      },
      {
        name: "instagram",
        isEnabled: true,
        shareText: baseText,
        imageSize: { width: 1080, height: 1080 },
      },
      {
        name: "sms",
        isEnabled: true,
        shareText: `${baseText} Check it out: ${url}`,
      },
      {
        name: "copy",
        isEnabled: true,
        shareText: url,
      },
    ];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createKFactorEngine(): KFactorEngine {
  return new KFactorEngine();
}
