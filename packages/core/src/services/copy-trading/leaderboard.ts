/**
 * Copy Trading Leaderboard
 *
 * Manages trader rankings and leaderboards for copy trading.
 */

import {
  type CopyTradingProfile,
  type TraderPerformance,
  type TraderTier,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  rankChange?: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  tier: TraderTier;

  // Performance metrics
  returnPercent: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  sharpeRatio: number;

  // Copy stats
  totalCopiers: number;
  totalAUM: number;
  copierPnL: number;

  // Social
  rating: number;
  reviewCount: number;

  // Fees
  performanceFee: number;

  // Badges
  badges: string[];
}

export interface LeaderboardConfig {
  type: LeaderboardType;
  period: LeaderboardPeriod;
  minTrades?: number;
  minCopiers?: number;
  tierFilter?: TraderTier[];
  marketFilter?: string[];
}

export type LeaderboardType =
  | "return"
  | "win_rate"
  | "profit_factor"
  | "copiers"
  | "aum"
  | "rating"
  | "sharpe_ratio"
  | "consistency";

export type LeaderboardPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "all_time";

export interface LeaderboardStats {
  totalTraders: number;
  qualifiedTraders: number;
  avgReturn: number;
  avgWinRate: number;
  avgCopiers: number;
  topPerformerReturn: number;
  lastUpdated: number;
}

// ============================================================================
// LEADERBOARD SERVICE
// ============================================================================

export class CopyTradingLeaderboard {
  private profiles: Map<string, CopyTradingProfile> = new Map();
  private cachedLeaderboards: Map<string, { entries: LeaderboardEntry[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ============================================================================
  // LEADERBOARD GENERATION
  // ============================================================================

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    config: LeaderboardConfig,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ entries: LeaderboardEntry[]; stats: LeaderboardStats }> {
    const cacheKey = this.getCacheKey(config);
    const cached = this.cachedLeaderboards.get(cacheKey);

    let entries: LeaderboardEntry[];

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      entries = cached.entries;
    } else {
      entries = await this.generateLeaderboard(config);
      this.cachedLeaderboards.set(cacheKey, { entries, timestamp: Date.now() });
    }

    const stats = this.calculateStats(entries);
    const paginatedEntries = entries.slice(offset, offset + limit);

    return { entries: paginatedEntries, stats };
  }

  /**
   * Generate leaderboard entries
   */
  private async generateLeaderboard(config: LeaderboardConfig): Promise<LeaderboardEntry[]> {
    let traders = Array.from(this.profiles.values());

    // Apply filters
    if (config.minTrades) {
      traders = traders.filter((t) => t.totalTrades >= config.minTrades!);
    }

    if (config.minCopiers) {
      traders = traders.filter((t) => t.totalCopiers >= config.minCopiers!);
    }

    if (config.tierFilter && config.tierFilter.length > 0) {
      traders = traders.filter((t) => config.tierFilter!.includes(t.tier));
    }

    // Convert to entries
    const entries: LeaderboardEntry[] = traders.map((t) => ({
      rank: 0,
      userId: t.userId,
      username: t.username,
      displayName: t.displayName,
      avatarUrl: t.avatarUrl,
      tier: t.tier,
      returnPercent: this.getReturnForPeriod(t, config.period),
      winRate: t.winRate,
      profitFactor: t.profitFactor,
      totalTrades: t.totalTrades,
      sharpeRatio: 1.5, // Mock - calculate from actual data
      totalCopiers: t.totalCopiers,
      totalAUM: t.totalAUM,
      copierPnL: t.totalAUM * 0.05, // Mock
      rating: t.rating,
      reviewCount: t.reviewCount,
      performanceFee: t.performanceFee,
      badges: this.getBadges(t),
    }));

    // Sort by type
    this.sortByType(entries, config.type);

    // Assign ranks
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  /**
   * Sort entries by leaderboard type
   */
  private sortByType(entries: LeaderboardEntry[], type: LeaderboardType): void {
    switch (type) {
      case "return":
        entries.sort((a, b) => b.returnPercent - a.returnPercent);
        break;
      case "win_rate":
        entries.sort((a, b) => b.winRate - a.winRate);
        break;
      case "profit_factor":
        entries.sort((a, b) => b.profitFactor - a.profitFactor);
        break;
      case "copiers":
        entries.sort((a, b) => b.totalCopiers - a.totalCopiers);
        break;
      case "aum":
        entries.sort((a, b) => b.totalAUM - a.totalAUM);
        break;
      case "rating":
        entries.sort((a, b) => {
          // Weight by review count
          const aScore = a.rating * Math.min(a.reviewCount / 10, 1);
          const bScore = b.rating * Math.min(b.reviewCount / 10, 1);
          return bScore - aScore;
        });
        break;
      case "sharpe_ratio":
        entries.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
        break;
      case "consistency":
        // Sort by combination of win rate and profit factor
        entries.sort((a, b) => {
          const aScore = a.winRate * 0.5 + a.profitFactor * 0.5;
          const bScore = b.winRate * 0.5 + b.profitFactor * 0.5;
          return bScore - aScore;
        });
        break;
    }
  }

  // ============================================================================
  // TRADER SEARCH & DISCOVERY
  // ============================================================================

  /**
   * Search for traders
   */
  async searchTraders(
    query: string,
    filters?: {
      tier?: TraderTier[];
      minWinRate?: number;
      maxFee?: number;
      tradingStyle?: string[];
      preferredMarkets?: string[];
    },
    limit: number = 20
  ): Promise<LeaderboardEntry[]> {
    let traders = Array.from(this.profiles.values());

    // Text search
    const lowerQuery = query.toLowerCase();
    traders = traders.filter(
      (t) =>
        t.username.toLowerCase().includes(lowerQuery) ||
        t.displayName.toLowerCase().includes(lowerQuery) ||
        t.bio?.toLowerCase().includes(lowerQuery)
    );

    // Apply filters
    if (filters?.tier && filters.tier.length > 0) {
      traders = traders.filter((t) => filters.tier!.includes(t.tier));
    }

    if (filters?.minWinRate) {
      traders = traders.filter((t) => t.winRate >= filters.minWinRate!);
    }

    if (filters?.maxFee) {
      traders = traders.filter((t) => t.performanceFee <= filters.maxFee!);
    }

    if (filters?.tradingStyle && filters.tradingStyle.length > 0) {
      traders = traders.filter((t) =>
        t.tradingStyle.some((s) => filters.tradingStyle!.includes(s))
      );
    }

    if (filters?.preferredMarkets && filters.preferredMarkets.length > 0) {
      traders = traders.filter((t) =>
        t.preferredMarkets.some((m) => filters.preferredMarkets!.includes(m))
      );
    }

    // Convert to entries
    const entries: LeaderboardEntry[] = traders.slice(0, limit).map((t, i) => ({
      rank: i + 1,
      userId: t.userId,
      username: t.username,
      displayName: t.displayName,
      avatarUrl: t.avatarUrl,
      tier: t.tier,
      returnPercent: t.returnAllTime,
      winRate: t.winRate,
      profitFactor: t.profitFactor,
      totalTrades: t.totalTrades,
      sharpeRatio: 1.5,
      totalCopiers: t.totalCopiers,
      totalAUM: t.totalAUM,
      copierPnL: t.totalAUM * 0.05,
      rating: t.rating,
      reviewCount: t.reviewCount,
      performanceFee: t.performanceFee,
      badges: this.getBadges(t),
    }));

    return entries;
  }

  /**
   * Get recommended traders for a user
   */
  async getRecommendedTraders(
    userId: string,
    preferences?: {
      riskLevel?: "low" | "medium" | "high";
      preferredMarkets?: string[];
      maxFee?: number;
    },
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    let traders = Array.from(this.profiles.values());

    // Filter by accepting copiers
    traders = traders.filter((t) => t.isAcceptingCopiers);

    // Apply preferences
    if (preferences?.riskLevel) {
      traders = traders.filter((t) => t.riskLevel === preferences.riskLevel);
    }

    if (preferences?.preferredMarkets && preferences.preferredMarkets.length > 0) {
      traders = traders.filter((t) =>
        t.preferredMarkets.some((m) => preferences.preferredMarkets!.includes(m))
      );
    }

    if (preferences?.maxFee) {
      traders = traders.filter((t) => t.performanceFee <= preferences.maxFee!);
    }

    // Score and sort
    const scored = traders.map((t) => ({
      trader: t,
      score: this.calculateRecommendationScore(t),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Convert to entries
    const entries: LeaderboardEntry[] = scored.slice(0, limit).map((s, i) => ({
      rank: i + 1,
      userId: s.trader.userId,
      username: s.trader.username,
      displayName: s.trader.displayName,
      avatarUrl: s.trader.avatarUrl,
      tier: s.trader.tier,
      returnPercent: s.trader.returnAllTime,
      winRate: s.trader.winRate,
      profitFactor: s.trader.profitFactor,
      totalTrades: s.trader.totalTrades,
      sharpeRatio: 1.5,
      totalCopiers: s.trader.totalCopiers,
      totalAUM: s.trader.totalAUM,
      copierPnL: s.trader.totalAUM * 0.05,
      rating: s.trader.rating,
      reviewCount: s.trader.reviewCount,
      performanceFee: s.trader.performanceFee,
      badges: this.getBadges(s.trader),
    }));

    return entries;
  }

  /**
   * Calculate recommendation score
   */
  private calculateRecommendationScore(profile: CopyTradingProfile): number {
    let score = 0;

    // Performance weight (40%)
    score += profile.winRate * 20;
    score += Math.min(profile.profitFactor / 3, 1) * 20;

    // Popularity weight (20%)
    score += Math.min(profile.totalCopiers / 100, 1) * 10;
    score += Math.min(profile.totalAUM / 100000, 1) * 10;

    // Rating weight (20%)
    score += (profile.rating / 5) * 15;
    score += Math.min(profile.reviewCount / 50, 1) * 5;

    // Tier weight (10%)
    const tierScores: Record<TraderTier, number> = {
      rising_star: 2,
      established: 4,
      expert: 6,
      elite: 8,
      legend: 10,
    };
    score += tierScores[profile.tier];

    // Activity weight (10%)
    score += Math.min(profile.totalTrades / 1000, 1) * 10;

    return score;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getReturnForPeriod(profile: CopyTradingProfile, period: LeaderboardPeriod): number {
    switch (period) {
      case "daily":
        return profile.return30d / 30;
      case "weekly":
        return profile.return30d / 4;
      case "monthly":
        return profile.return30d;
      case "quarterly":
        return profile.return90d;
      case "yearly":
        return profile.return1y;
      case "all_time":
        return profile.returnAllTime;
    }
  }

  private getBadges(profile: CopyTradingProfile): string[] {
    const badges: string[] = [];

    if (profile.tier === "elite" || profile.tier === "legend") {
      badges.push("top_trader");
    }

    if (profile.winRate >= 0.6) {
      badges.push("high_win_rate");
    }

    if (profile.totalCopiers >= 100) {
      badges.push("popular");
    }

    if (profile.rating >= 4.8 && profile.reviewCount >= 50) {
      badges.push("highly_rated");
    }

    if (profile.maxDrawdown <= 0.1) {
      badges.push("low_risk");
    }

    if (profile.verifiedAt) {
      badges.push("verified");
    }

    return badges;
  }

  private getCacheKey(config: LeaderboardConfig): string {
    return `${config.type}_${config.period}_${config.minTrades ?? 0}_${config.minCopiers ?? 0}`;
  }

  private calculateStats(entries: LeaderboardEntry[]): LeaderboardStats {
    if (entries.length === 0) {
      return {
        totalTraders: 0,
        qualifiedTraders: 0,
        avgReturn: 0,
        avgWinRate: 0,
        avgCopiers: 0,
        topPerformerReturn: 0,
        lastUpdated: Date.now(),
      };
    }

    const avgReturn = entries.reduce((sum, e) => sum + e.returnPercent, 0) / entries.length;
    const avgWinRate = entries.reduce((sum, e) => sum + e.winRate, 0) / entries.length;
    const avgCopiers = entries.reduce((sum, e) => sum + e.totalCopiers, 0) / entries.length;

    return {
      totalTraders: this.profiles.size,
      qualifiedTraders: entries.length,
      avgReturn,
      avgWinRate,
      avgCopiers,
      topPerformerReturn: entries[0]?.returnPercent ?? 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Register profiles for leaderboard tracking
   */
  registerProfiles(profiles: CopyTradingProfile[]): void {
    for (const profile of profiles) {
      this.profiles.set(profile.userId, profile);
    }
    this.cachedLeaderboards.clear();
  }

  /**
   * Update a single profile
   */
  updateProfile(profile: CopyTradingProfile): void {
    this.profiles.set(profile.userId, profile);
    this.cachedLeaderboards.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let copyTradingLeaderboard: CopyTradingLeaderboard | null = null;

export function getCopyTradingLeaderboard(): CopyTradingLeaderboard {
  if (!copyTradingLeaderboard) {
    copyTradingLeaderboard = new CopyTradingLeaderboard();
  }
  return copyTradingLeaderboard;
}

export function createCopyTradingLeaderboard(): CopyTradingLeaderboard {
  return new CopyTradingLeaderboard();
}
