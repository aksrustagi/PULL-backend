/**
 * Leaderboard Service
 * Generates and manages trader leaderboards
 */

import type {
  LeaderboardSnapshot,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardPeriod,
  LeaderboardQuery,
  UserLeaderboardPosition,
  ReputationTier,
  AssetClass,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface LeaderboardServiceConfig {
  maxEntriesPerLeaderboard: number;
  minTradesForQualification: number;
  cacheExpiryMs: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface TraderWithStats {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  tier?: ReputationTier;
  totalPnL: number;
  totalPnLPercent: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  followersCount: number;
  copierCount: number;
  reputationScore: number;
}

const DEFAULT_CONFIG: LeaderboardServiceConfig = {
  maxEntriesPerLeaderboard: 100,
  minTradesForQualification: 10,
  cacheExpiryMs: 300000, // 5 minutes
};

// ============================================================================
// Leaderboard Service
// ============================================================================

export class LeaderboardService {
  private readonly config: LeaderboardServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<LeaderboardServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Leaderboard] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Leaderboard] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Leaderboard] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Leaderboard] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Leaderboard Generation
  // ==========================================================================

  /**
   * Generate a leaderboard snapshot
   */
  async generateLeaderboard(
    type: LeaderboardType,
    period: LeaderboardPeriod,
    assetClass?: AssetClass
  ): Promise<LeaderboardSnapshot> {
    const { start, end } = this.getPeriodRange(period);

    // Get traders with their stats for the period
    const traders = await this.getQualifiedTraders(period, assetClass);

    // Sort by the leaderboard metric
    const sortedTraders = this.sortByMetric(traders, type);

    // Get previous rankings for comparison
    const previousSnapshot = await this.getPreviousSnapshot(type, period, assetClass);
    const previousRankings = this.buildPreviousRankMap(previousSnapshot);

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = sortedTraders
      .slice(0, this.config.maxEntriesPerLeaderboard)
      .map((trader, index) => {
        const rank = index + 1;
        const value = this.getMetricValue(trader, type);
        const previousRank = previousRankings.get(trader.userId);
        const previousEntry = previousSnapshot?.entries.find((e) => e.userId === trader.userId);

        return {
          rank,
          previousRank,
          userId: trader.userId,
          username: trader.username,
          displayName: trader.displayName,
          avatarUrl: trader.avatarUrl,
          value,
          change: previousEntry ? value - previousEntry.value : undefined,
          changePercent: previousEntry && previousEntry.value !== 0
            ? ((value - previousEntry.value) / Math.abs(previousEntry.value)) * 100
            : undefined,
          tier: trader.tier,
          isVerified: trader.isVerified,
        };
      });

    const now = Date.now();
    const snapshot: LeaderboardSnapshot = {
      id: `${type}_${period}_${start}`,
      leaderboardType: type,
      period,
      assetClass,
      periodStart: new Date(start),
      periodEnd: new Date(end),
      entries,
      totalParticipants: traders.length,
      minQualifyingValue: entries.length > 0 ? entries[entries.length - 1].value : undefined,
      calculatedAt: new Date(now),
      createdAt: new Date(now),
    };

    // Store the snapshot
    await this.db.mutation("leaderboardSnapshots:upsert", snapshot);

    // Update user leaderboard history
    await this.updateUserHistory(snapshot);

    // Award badges for top performers
    await this.awardLeaderboardBadges(entries, type);

    this.logger.info("Leaderboard generated", {
      type,
      period,
      entries: entries.length,
      totalParticipants: traders.length,
    });

    return snapshot;
  }

  /**
   * Get a leaderboard (cached or generate fresh)
   */
  async getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardSnapshot | null> {
    // Check for cached snapshot
    const cached = await this.getCachedSnapshot(query.type, query.period, query.assetClass);

    if (cached) {
      const age = Date.now() - cached.calculatedAt.getTime();
      if (age < this.config.cacheExpiryMs) {
        // Return paginated results
        return this.paginateSnapshot(cached, query.limit, query.offset);
      }
    }

    // Generate fresh leaderboard
    const fresh = await this.generateLeaderboard(query.type, query.period, query.assetClass);
    return this.paginateSnapshot(fresh, query.limit, query.offset);
  }

  /**
   * Get multiple leaderboards at once
   */
  async getMultipleLeaderboards(
    queries: LeaderboardQuery[]
  ): Promise<Map<string, LeaderboardSnapshot | null>> {
    const results = new Map<string, LeaderboardSnapshot | null>();

    await Promise.all(
      queries.map(async (query) => {
        const key = `${query.type}_${query.period}_${query.assetClass ?? "all"}`;
        const snapshot = await this.getLeaderboard(query);
        results.set(key, snapshot);
      })
    );

    return results;
  }

  /**
   * Get user's rank on a leaderboard
   */
  async getUserRank(
    userId: string,
    type: LeaderboardType,
    period: LeaderboardPeriod,
    assetClass?: AssetClass
  ): Promise<{
    rank: number;
    value: number;
    percentile: number;
    totalParticipants: number;
  } | null> {
    const snapshot = await this.getCachedSnapshot(type, period, assetClass);

    if (!snapshot) {
      return null;
    }

    const entry = snapshot.entries.find((e) => e.userId === userId);

    if (!entry) {
      // User not in top 100, calculate actual rank
      return this.calculateUserRank(userId, type, period, assetClass, snapshot.totalParticipants);
    }

    return {
      rank: entry.rank,
      value: entry.value,
      percentile: ((snapshot.totalParticipants - entry.rank + 1) / snapshot.totalParticipants) * 100,
      totalParticipants: snapshot.totalParticipants,
    };
  }

  /**
   * Get user's leaderboard history
   */
  async getUserHistory(
    userId: string,
    type: LeaderboardType,
    period: LeaderboardPeriod,
    options?: { limit?: number }
  ): Promise<UserLeaderboardPosition[]> {
    return await this.db.query("userLeaderboardHistory:getByUser", {
      userId,
      leaderboardType: type,
      period,
      limit: options?.limit ?? 30,
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getQualifiedTraders(
    period: LeaderboardPeriod,
    assetClass?: AssetClass
  ): Promise<TraderWithStats[]> {
    return await this.db.query("traderStats:getQualifiedTraders", {
      period,
      assetClass,
      minTrades: this.config.minTradesForQualification,
    });
  }

  private sortByMetric(traders: TraderWithStats[], type: LeaderboardType): TraderWithStats[] {
    return [...traders].sort((a, b) => {
      const aValue = this.getMetricValue(a, type);
      const bValue = this.getMetricValue(b, type);
      return bValue - aValue; // Descending
    });
  }

  private getMetricValue(trader: TraderWithStats, type: LeaderboardType): number {
    switch (type) {
      case "pnl":
        return trader.totalPnL;
      case "pnl_percent":
        return trader.totalPnLPercent;
      case "sharpe_ratio":
        return trader.sharpeRatio;
      case "win_rate":
        return trader.winRate;
      case "total_trades":
        return trader.totalTrades;
      case "followers":
        return trader.followersCount;
      case "copiers":
        return trader.copierCount;
      case "reputation":
        return trader.reputationScore;
      default:
        return 0;
    }
  }

  private async getPreviousSnapshot(
    type: LeaderboardType,
    period: LeaderboardPeriod,
    assetClass?: AssetClass
  ): Promise<LeaderboardSnapshot | null> {
    return await this.db.query("leaderboardSnapshots:getPrevious", {
      leaderboardType: type,
      period,
      assetClass,
    });
  }

  private async getCachedSnapshot(
    type: LeaderboardType,
    period: LeaderboardPeriod,
    assetClass?: AssetClass
  ): Promise<LeaderboardSnapshot | null> {
    const { start } = this.getPeriodRange(period);

    return await this.db.query("leaderboardSnapshots:get", {
      leaderboardType: type,
      period,
      periodStart: start,
      assetClass,
    });
  }

  private buildPreviousRankMap(snapshot: LeaderboardSnapshot | null): Map<string, number> {
    const map = new Map<string, number>();

    if (snapshot) {
      for (const entry of snapshot.entries) {
        map.set(entry.userId, entry.rank);
      }
    }

    return map;
  }

  private paginateSnapshot(
    snapshot: LeaderboardSnapshot,
    limit?: number,
    offset?: number
  ): LeaderboardSnapshot {
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;

    return {
      ...snapshot,
      entries: snapshot.entries.slice(start, end),
    };
  }

  private async calculateUserRank(
    userId: string,
    type: LeaderboardType,
    period: LeaderboardPeriod,
    assetClass: AssetClass | undefined,
    totalParticipants: number
  ): Promise<{
    rank: number;
    value: number;
    percentile: number;
    totalParticipants: number;
  } | null> {
    // Get user's stats
    const userStats = await this.db.query<TraderWithStats | null>("traderStats:getWithProfile", {
      userId,
      period,
      assetClass,
    });

    if (!userStats) {
      return null;
    }

    const userValue = this.getMetricValue(userStats, type);

    // Count how many traders have a higher value
    const higherCount = await this.db.query<number>("traderStats:countHigherThan", {
      type,
      period,
      assetClass,
      value: userValue,
    });

    const rank = higherCount + 1;

    return {
      rank,
      value: userValue,
      percentile: ((totalParticipants - rank + 1) / totalParticipants) * 100,
      totalParticipants,
    };
  }

  private async updateUserHistory(snapshot: LeaderboardSnapshot): Promise<void> {
    const historyEntries = snapshot.entries.map((entry) => ({
      userId: entry.userId,
      leaderboardType: snapshot.leaderboardType,
      period: snapshot.period,
      rank: entry.rank,
      value: entry.value,
      percentile: ((snapshot.totalParticipants - entry.rank + 1) / snapshot.totalParticipants) * 100,
      snapshotId: snapshot.id,
      periodStart: snapshot.periodStart.getTime(),
      recordedAt: Date.now(),
    }));

    if (historyEntries.length > 0) {
      await this.db.mutation("userLeaderboardHistory:batchInsert", {
        entries: historyEntries,
      });
    }
  }

  private async awardLeaderboardBadges(
    entries: LeaderboardEntry[],
    type: LeaderboardType
  ): Promise<void> {
    // Award top 10 badge
    const top10 = entries.slice(0, 10);
    for (const entry of top10) {
      await this.db.mutation("reputationScores:awardBadge", {
        userId: entry.userId,
        badgeType: "top_10",
        badgeName: `Top 10 ${this.getLeaderboardName(type)}`,
      });
    }

    // Award top 100 badge
    const top100 = entries.slice(10, 100);
    for (const entry of top100) {
      await this.db.mutation("reputationScores:awardBadge", {
        userId: entry.userId,
        badgeType: "top_100",
        badgeName: `Top 100 ${this.getLeaderboardName(type)}`,
      });
    }
  }

  private getLeaderboardName(type: LeaderboardType): string {
    const names: Record<LeaderboardType, string> = {
      pnl: "P&L",
      pnl_percent: "ROI",
      sharpe_ratio: "Sharpe Ratio",
      win_rate: "Win Rate",
      total_trades: "Most Active",
      followers: "Most Followed",
      copiers: "Most Copied",
      reputation: "Reputation",
    };
    return names[type];
  }

  private getPeriodRange(period: LeaderboardPeriod): { start: number; end: number } {
    const now = new Date();
    const end = now.getTime();
    let start: number;

    switch (period) {
      case "daily":
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        start = today.getTime();
        break;

      case "weekly":
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        start = weekStart.getTime();
        break;

      case "monthly":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        start = monthStart.getTime();
        break;

      case "all_time":
        start = 0;
        break;

      default:
        start = 0;
    }

    return { start, end };
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Generate all leaderboards for a period
   */
  async generateAllLeaderboards(period: LeaderboardPeriod): Promise<void> {
    const types: LeaderboardType[] = [
      "pnl",
      "pnl_percent",
      "sharpe_ratio",
      "win_rate",
      "total_trades",
      "followers",
      "copiers",
      "reputation",
    ];

    for (const type of types) {
      try {
        await this.generateLeaderboard(type, period);
      } catch (error) {
        this.logger.error("Failed to generate leaderboard", {
          type,
          period,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.logger.info("All leaderboards generated for period", { period });
  }

  /**
   * Generate leaderboards for all periods
   */
  async generateAllPeriodLeaderboards(): Promise<void> {
    const periods: LeaderboardPeriod[] = ["daily", "weekly", "monthly", "all_time"];

    for (const period of periods) {
      await this.generateAllLeaderboards(period);
    }

    this.logger.info("All leaderboards generated for all periods");
  }
}

export default LeaderboardService;
