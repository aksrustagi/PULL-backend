/**
 * NUCLEAR GROWTH FEATURE #5: Creator Economy
 *
 * Let expert bettors monetize their picks and build audiences.
 * Think OnlyFans meets sports betting.
 *
 * WHY IT'S NUCLEAR:
 * - Creators bring their audiences
 * - Revenue share creates loyalty
 * - Content drives organic growth
 * - Experts validate the platform
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const CreatorTierSchema = z.enum([
  "rising",       // New creator, building audience
  "established",  // 100+ subscribers
  "verified",     // Platform verified expert
  "elite",        // Top 1% of creators
  "partner",      // Official partner
]);

export type CreatorTier = z.infer<typeof CreatorTierSchema>;

export const ContentTypeSchema = z.enum([
  "pick",           // Single pick with analysis
  "parlay",         // Parlay card
  "breakdown",      // Full game breakdown
  "model",          // Statistical model output
  "live_play",      // Live betting play
  "tutorial",       // Educational content
  "recap",          // Results recap
  "ama",            // Ask me anything
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export interface Creator {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;

  // Status
  tier: CreatorTier;
  isVerified: boolean;
  verifiedSports: string[];

  // Subscription
  subscriptionPrice: number; // Monthly
  subscriptionCount: number;
  lifetimeSubscribers: number;

  // Revenue
  totalRevenue: number;
  monthlyRevenue: number;
  payoutRate: number; // % of subscription they keep

  // Performance
  stats: CreatorStats;
  badges: CreatorBadge[];

  // Social
  followers: number;
  following: number;

  // Settings
  acceptsTips: boolean;
  minimumTip: number;
  offersFreeContent: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface CreatorStats {
  // Overall
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  units: number;
  streak: number;
  bestStreak: number;

  // By sport
  bySport: Record<string, SportStats>;

  // By bet type
  byBetType: Record<string, {
    picks: number;
    winRate: number;
    roi: number;
  }>;

  // Time-based
  last7Days: PeriodStats;
  last30Days: PeriodStats;
  last90Days: PeriodStats;
  thisYear: PeriodStats;
}

export interface SportStats {
  sport: string;
  picks: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  units: number;
}

export interface PeriodStats {
  picks: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  units: number;
}

export interface CreatorBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
}

export interface CreatorContent {
  id: string;
  creatorId: string;
  type: ContentType;

  // Content
  title: string;
  body: string;
  mediaUrls?: string[];

  // Pick details (if applicable)
  pick?: ContentPick;
  parlay?: ContentPick[];

  // Access
  isPremium: boolean;
  previewText?: string;

  // Engagement
  views: number;
  likes: number;
  comments: number;
  shares: number;
  tails: number;

  // Performance (after settlement)
  result?: "win" | "loss" | "push" | "pending";
  settledAt?: number;

  createdAt: number;
  updatedAt: number;
}

export interface ContentPick {
  sport: string;
  league: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: number;

  market: string;
  selection: string;
  odds: number;

  confidence: 1 | 2 | 3 | 4 | 5;
  units: number;
  analysis?: string;
}

export interface Subscription {
  id: string;
  creatorId: string;
  subscriberId: string;
  subscriberUsername: string;

  // Plan
  plan: "monthly" | "quarterly" | "yearly";
  price: number;
  discount?: number;

  // Status
  status: "active" | "cancelled" | "expired" | "paused";
  autoRenew: boolean;

  // Dates
  startedAt: number;
  expiresAt: number;
  cancelledAt?: number;
}

export interface CreatorTip {
  id: string;
  creatorId: string;
  tipperId: string;
  tipperUsername: string;

  amount: number;
  message?: string;
  contentId?: string;

  createdAt: number;
}

export interface CreatorPayout {
  id: string;
  creatorId: string;

  amount: number;
  fees: number;
  netAmount: number;

  period: {
    start: number;
    end: number;
  };

  // Breakdown
  subscriptionRevenue: number;
  tipRevenue: number;

  // Status
  status: "pending" | "processing" | "completed" | "failed";
  paidAt?: number;
  paymentMethod?: string;

  createdAt: number;
}

export interface CreatorAnalytics {
  creatorId: string;
  period: "day" | "week" | "month" | "year";

  // Growth
  newSubscribers: number;
  churnedSubscribers: number;
  netGrowth: number;
  growthRate: number;

  // Revenue
  revenue: number;
  tips: number;
  averageSubscriptionValue: number;

  // Content performance
  contentPublished: number;
  totalViews: number;
  totalEngagement: number;
  topContent: Array<{ contentId: string; views: number; engagement: number }>;

  // Pick performance
  picksPosted: number;
  pickWinRate: number;
  pickRoi: number;
  picksFollowed: number;
}

export interface CreatorLeaderboard {
  period: "day" | "week" | "month" | "year" | "all_time";
  category: "roi" | "units" | "win_rate" | "subscribers" | "engagement";

  entries: Array<{
    rank: number;
    creatorId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    tier: CreatorTier;
    isVerified: boolean;
    value: number;
    change?: number;
  }>;
}

// ============================================================================
// CREATOR TIERS CONFIG
// ============================================================================

export const CREATOR_TIER_CONFIG: Record<CreatorTier, {
  name: string;
  requirements: string[];
  payoutRate: number;
  maxSubscriptionPrice: number;
  features: string[];
}> = {
  rising: {
    name: "Rising",
    requirements: ["New creator"],
    payoutRate: 0.70, // 70%
    maxSubscriptionPrice: 29.99,
    features: [
      "Basic analytics",
      "5 posts per day",
      "Standard support",
    ],
  },
  established: {
    name: "Established",
    requirements: ["100+ subscribers", "30+ posts"],
    payoutRate: 0.75,
    maxSubscriptionPrice: 49.99,
    features: [
      "Advanced analytics",
      "20 posts per day",
      "Priority support",
      "Custom profile",
    ],
  },
  verified: {
    name: "Verified",
    requirements: ["Platform verification", "Track record audit"],
    payoutRate: 0.80,
    maxSubscriptionPrice: 99.99,
    features: [
      "Verified badge",
      "Unlimited posts",
      "Featured placement",
      "Discord access",
    ],
  },
  elite: {
    name: "Elite",
    requirements: ["Top 1% performance", "500+ subscribers"],
    payoutRate: 0.85,
    maxSubscriptionPrice: 199.99,
    features: [
      "Elite badge",
      "Homepage feature",
      "Personal account manager",
      "Early access to features",
    ],
  },
  partner: {
    name: "Partner",
    requirements: ["Official partnership agreement"],
    payoutRate: 0.90,
    maxSubscriptionPrice: 499.99,
    features: [
      "Partner badge",
      "Custom revenue deals",
      "Co-marketing",
      "API access",
      "White-label options",
    ],
  },
};

// ============================================================================
// CREATOR ECONOMY SERVICE
// ============================================================================

export class CreatorEconomyService {
  /**
   * Create a creator profile
   */
  createCreator(
    userId: string,
    username: string,
    displayName: string,
    options: {
      bio?: string;
      subscriptionPrice?: number;
    } = {}
  ): Creator {
    return {
      id: `creator_${userId}`,
      userId,
      username,
      displayName,
      bio: options.bio,
      tier: "rising",
      isVerified: false,
      verifiedSports: [],
      subscriptionPrice: options.subscriptionPrice ?? 9.99,
      subscriptionCount: 0,
      lifetimeSubscribers: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      payoutRate: CREATOR_TIER_CONFIG.rising.payoutRate,
      stats: this.initializeStats(),
      badges: [],
      followers: 0,
      following: 0,
      acceptsTips: true,
      minimumTip: 1,
      offersFreeContent: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Create content
   */
  createContent(
    creatorId: string,
    type: ContentType,
    content: {
      title: string;
      body: string;
      mediaUrls?: string[];
      pick?: ContentPick;
      parlay?: ContentPick[];
      isPremium?: boolean;
      previewText?: string;
    }
  ): CreatorContent {
    return {
      id: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      creatorId,
      type,
      title: content.title,
      body: content.body,
      mediaUrls: content.mediaUrls,
      pick: content.pick,
      parlay: content.parlay,
      isPremium: content.isPremium ?? false,
      previewText: content.previewText,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      tails: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Subscribe to creator
   */
  subscribe(
    creatorId: string,
    subscriber: { userId: string; username: string },
    plan: "monthly" | "quarterly" | "yearly",
    price: number
  ): Subscription {
    const durations: Record<string, number> = {
      monthly: 30 * 24 * 60 * 60 * 1000,
      quarterly: 90 * 24 * 60 * 60 * 1000,
      yearly: 365 * 24 * 60 * 60 * 1000,
    };

    const discounts: Record<string, number> = {
      monthly: 0,
      quarterly: 0.10,
      yearly: 0.20,
    };

    return {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      creatorId,
      subscriberId: subscriber.userId,
      subscriberUsername: subscriber.username,
      plan,
      price: price * (1 - discounts[plan]),
      discount: discounts[plan],
      status: "active",
      autoRenew: true,
      startedAt: Date.now(),
      expiresAt: Date.now() + durations[plan],
    };
  }

  /**
   * Process tip
   */
  processTip(
    creatorId: string,
    tipper: { userId: string; username: string },
    amount: number,
    message?: string,
    contentId?: string
  ): CreatorTip {
    return {
      id: `tip_${Date.now()}`,
      creatorId,
      tipperId: tipper.userId,
      tipperUsername: tipper.username,
      amount,
      message,
      contentId,
      createdAt: Date.now(),
    };
  }

  /**
   * Calculate payout
   */
  calculatePayout(
    creator: Creator,
    subscriptions: Subscription[],
    tips: CreatorTip[],
    periodStart: number,
    periodEnd: number
  ): CreatorPayout {
    const activeSubscriptions = subscriptions.filter(
      s => s.status === "active" && s.startedAt <= periodEnd
    );

    const periodTips = tips.filter(
      t => t.createdAt >= periodStart && t.createdAt <= periodEnd
    );

    const subscriptionRevenue = activeSubscriptions.reduce(
      (sum, s) => sum + s.price,
      0
    );

    const tipRevenue = periodTips.reduce(
      (sum, t) => sum + t.amount,
      0
    );

    const grossAmount = subscriptionRevenue + tipRevenue;
    const netAmount = grossAmount * creator.payoutRate;
    const fees = grossAmount - netAmount;

    return {
      id: `payout_${Date.now()}`,
      creatorId: creator.id,
      amount: grossAmount,
      fees,
      netAmount,
      period: { start: periodStart, end: periodEnd },
      subscriptionRevenue,
      tipRevenue,
      status: "pending",
      createdAt: Date.now(),
    };
  }

  /**
   * Update creator stats from pick result
   */
  updateStats(
    stats: CreatorStats,
    pick: ContentPick,
    result: "win" | "loss" | "push"
  ): CreatorStats {
    const newStats = { ...stats };

    newStats.totalPicks++;
    if (result === "win") {
      newStats.wins++;
      newStats.units += pick.units * this.calculateProfit(pick.odds, pick.units);
      newStats.streak = newStats.streak >= 0 ? newStats.streak + 1 : 1;
    } else if (result === "loss") {
      newStats.losses++;
      newStats.units -= pick.units;
      newStats.streak = newStats.streak <= 0 ? newStats.streak - 1 : -1;
    } else {
      newStats.pushes++;
    }

    newStats.bestStreak = Math.max(newStats.bestStreak, newStats.streak);
    newStats.winRate = (newStats.wins / (newStats.wins + newStats.losses)) * 100;
    newStats.roi = (newStats.units / newStats.totalPicks) * 100;

    // Update sport stats
    const sport = pick.sport;
    if (!newStats.bySport[sport]) {
      newStats.bySport[sport] = {
        sport,
        picks: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        roi: 0,
        units: 0,
      };
    }

    const sportStats = newStats.bySport[sport];
    sportStats.picks++;
    if (result === "win") {
      sportStats.wins++;
      sportStats.units += pick.units * this.calculateProfit(pick.odds, pick.units);
    } else if (result === "loss") {
      sportStats.losses++;
      sportStats.units -= pick.units;
    }
    sportStats.winRate = (sportStats.wins / (sportStats.wins + sportStats.losses)) * 100;
    sportStats.roi = (sportStats.units / sportStats.picks) * 100;

    return newStats;
  }

  /**
   * Get creator leaderboard
   */
  getLeaderboard(
    creators: Creator[],
    category: CreatorLeaderboard["category"],
    period: CreatorLeaderboard["period"],
    limit: number = 50
  ): CreatorLeaderboard {
    const sorted = creators
      .map(creator => {
        let value: number;
        switch (category) {
          case "roi":
            value = creator.stats.roi;
            break;
          case "units":
            value = creator.stats.units;
            break;
          case "win_rate":
            value = creator.stats.winRate;
            break;
          case "subscribers":
            value = creator.subscriptionCount;
            break;
          case "engagement":
            value = creator.followers;
            break;
          default:
            value = 0;
        }
        return { creator, value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    return {
      period,
      category,
      entries: sorted.map((entry, idx) => ({
        rank: idx + 1,
        creatorId: entry.creator.id,
        username: entry.creator.username,
        displayName: entry.creator.displayName,
        avatarUrl: entry.creator.avatarUrl,
        tier: entry.creator.tier,
        isVerified: entry.creator.isVerified,
        value: entry.value,
      })),
    };
  }

  /**
   * Check tier upgrade eligibility
   */
  checkTierUpgrade(creator: Creator): {
    eligible: boolean;
    nextTier?: CreatorTier;
    requirements?: string[];
  } {
    const currentTierIndex = Object.keys(CREATOR_TIER_CONFIG).indexOf(creator.tier);
    const tiers = Object.keys(CREATOR_TIER_CONFIG) as CreatorTier[];

    if (currentTierIndex >= tiers.length - 1) {
      return { eligible: false };
    }

    const nextTier = tiers[currentTierIndex + 1];
    const config = CREATOR_TIER_CONFIG[nextTier];

    // Check requirements (simplified)
    let eligible = true;
    const unmetRequirements: string[] = [];

    if (nextTier === "established") {
      if (creator.subscriptionCount < 100) {
        eligible = false;
        unmetRequirements.push(`Need 100+ subscribers (have ${creator.subscriptionCount})`);
      }
    } else if (nextTier === "elite") {
      if (creator.subscriptionCount < 500) {
        eligible = false;
        unmetRequirements.push(`Need 500+ subscribers (have ${creator.subscriptionCount})`);
      }
    }

    return {
      eligible,
      nextTier: eligible ? nextTier : undefined,
      requirements: unmetRequirements.length > 0 ? unmetRequirements : undefined,
    };
  }

  private initializeStats(): CreatorStats {
    const emptyPeriod: PeriodStats = {
      picks: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      roi: 0,
      units: 0,
    };

    return {
      totalPicks: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      roi: 0,
      units: 0,
      streak: 0,
      bestStreak: 0,
      bySport: {},
      byBetType: {},
      last7Days: { ...emptyPeriod },
      last30Days: { ...emptyPeriod },
      last90Days: { ...emptyPeriod },
      thisYear: { ...emptyPeriod },
    };
  }

  private calculateProfit(americanOdds: number, units: number): number {
    if (americanOdds > 0) {
      return (americanOdds / 100) * units;
    }
    return (100 / Math.abs(americanOdds)) * units;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createCreatorEconomyService(): CreatorEconomyService {
  return new CreatorEconomyService();
}
