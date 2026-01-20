/**
 * Reputation Service
 * Calculates and manages trader reputation scores based on verified track record
 */

import type {
  ReputationScore,
  ReputationTier,
  ReputationBadge,
  TraderStats,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface ReputationServiceConfig {
  // Score weights (must sum to 1.0)
  weights: {
    performance: number;
    consistency: number;
    riskManagement: number;
    transparency: number;
    social: number;
    longevity: number;
  };
  // Tier thresholds
  tierThresholds: {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
    diamond: number;
    legend: number;
  };
  // Badge requirements
  badgeRequirements: Record<string, BadgeRequirement>;
  logger?: Logger;
}

interface BadgeRequirement {
  name: string;
  check: (metrics: ReputationMetrics) => boolean;
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

interface ReputationMetrics {
  // From trader stats
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  totalPnLPercent: number;
  volatility: number;

  // Social metrics
  followersCount: number;
  copierCount: number;

  // Activity metrics
  accountAge: number; // days
  tradingDays: number;
  positionsShared: number;
  commentsCount: number;

  // Trust metrics
  fraudAlertCount: number;
  suspiciousActivityCount: number;
  isVerified: boolean;
}

const DEFAULT_CONFIG: ReputationServiceConfig = {
  weights: {
    performance: 0.25,
    consistency: 0.20,
    riskManagement: 0.20,
    transparency: 0.10,
    social: 0.10,
    longevity: 0.15,
  },
  tierThresholds: {
    bronze: 0,
    silver: 200,
    gold: 400,
    platinum: 600,
    diamond: 800,
    legend: 950,
  },
  badgeRequirements: {},
};

// ============================================================================
// Reputation Service
// ============================================================================

export class ReputationService {
  private readonly config: ReputationServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<ReputationServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();

    // Set up default badge requirements
    this.setupBadgeRequirements();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Reputation] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Reputation] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Reputation] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Reputation] ${msg}`, meta),
    };
  }

  private setupBadgeRequirements(): void {
    this.config.badgeRequirements = {
      verified_trader: {
        name: "Verified Trader",
        check: (m) => m.isVerified,
      },
      consistent_winner: {
        name: "Consistent Winner",
        check: (m) => m.winRate >= 0.6 && m.totalTrades >= 100,
      },
      risk_manager: {
        name: "Risk Manager",
        check: (m) => m.maxDrawdown <= 10 && m.sharpeRatio >= 1.5,
      },
      high_volume: {
        name: "High Volume Trader",
        check: (m) => m.totalTrades >= 1000,
      },
      community_leader: {
        name: "Community Leader",
        check: (m) => m.followersCount >= 1000 && m.positionsShared >= 100,
      },
      early_adopter: {
        name: "Early Adopter",
        check: (m) => m.accountAge >= 365,
      },
      top_10: {
        name: "Top 10 Trader",
        check: () => false, // Set by leaderboard service
      },
      top_100: {
        name: "Top 100 Trader",
        check: () => false, // Set by leaderboard service
      },
      profitable_streak: {
        name: "Profitable Streak",
        check: (m) => m.totalPnLPercent >= 50,
      },
      low_drawdown: {
        name: "Low Drawdown Master",
        check: (m) => m.maxDrawdown <= 5 && m.totalTrades >= 50,
      },
    };
  }

  // ==========================================================================
  // Score Calculation
  // ==========================================================================

  /**
   * Calculate reputation score for a trader
   */
  async calculateReputation(userId: string): Promise<ReputationScore> {
    // Gather all metrics
    const metrics = await this.gatherMetrics(userId);

    // Calculate component scores (0-100)
    const performanceScore = this.calculatePerformanceScore(metrics);
    const consistencyScore = this.calculateConsistencyScore(metrics);
    const riskManagementScore = this.calculateRiskManagementScore(metrics);
    const transparencyScore = this.calculateTransparencyScore(metrics);
    const socialScore = this.calculateSocialScore(metrics);
    const longevityScore = this.calculateLongevityScore(metrics);

    // Calculate overall score (0-1000)
    const overallScore = Math.round(
      (performanceScore * this.config.weights.performance +
        consistencyScore * this.config.weights.consistency +
        riskManagementScore * this.config.weights.riskManagement +
        transparencyScore * this.config.weights.transparency +
        socialScore * this.config.weights.social +
        longevityScore * this.config.weights.longevity) *
        10
    );

    // Determine tier
    const tier = this.determineTier(overallScore);

    // Calculate badges
    const existingScore = await this.getReputation(userId);
    const badges = this.calculateBadges(metrics, existingScore?.badges ?? []);

    // Calculate fraud risk
    const fraudRiskScore = this.calculateFraudRiskScore(metrics);

    const now = Date.now();
    const reputation: ReputationScore = {
      id: userId,
      userId,
      overallScore,
      performanceScore,
      consistencyScore,
      riskManagementScore,
      transparencyScore,
      socialScore,
      longevityScore,
      tier,
      badges,
      verifiedReturns: metrics.isVerified,
      fraudRiskScore,
      suspiciousActivityCount: metrics.suspiciousActivityCount,
      calculatedAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Store the reputation
    await this.db.mutation("reputationScores:upsert", reputation);

    this.logger.info("Reputation calculated", {
      userId,
      overallScore,
      tier,
      badgeCount: badges.length,
    });

    return reputation;
  }

  /**
   * Get cached reputation for a trader
   */
  async getReputation(userId: string): Promise<ReputationScore | null> {
    return await this.db.query("reputationScores:get", { userId });
  }

  /**
   * Gather all metrics needed for calculation
   */
  private async gatherMetrics(userId: string): Promise<ReputationMetrics> {
    // Get trader stats
    const stats = await this.db.query<TraderStats | null>("traderStats:get", {
      userId,
      period: "all_time",
    });

    // Get profile info
    const profile = await this.db.query<{
      followersCount: number;
      copierCount: number;
      createdAt: number;
      isVerified: boolean;
    }>("traderProfiles:get", { userId });

    // Get activity metrics
    const activityStats = await this.db.query<{
      positionsShared: number;
      commentsCount: number;
      tradingDays: number;
    }>("socialActivity:getActivityStats", { userId });

    // Get fraud alerts
    const fraudStats = await this.db.query<{
      alertCount: number;
      suspiciousActivityCount: number;
    }>("fraudAlerts:getStats", { userId });

    const accountAge = profile
      ? Math.floor((Date.now() - profile.createdAt) / (24 * 60 * 60 * 1000))
      : 0;

    return {
      winRate: stats?.winRate ?? 0,
      sharpeRatio: stats?.sharpeRatio ?? 0,
      sortinoRatio: stats?.sortinoRatio ?? 0,
      maxDrawdown: stats?.maxDrawdownPercent ?? 0,
      totalTrades: stats?.totalTrades ?? 0,
      totalPnLPercent: stats?.totalPnLPercent ?? 0,
      volatility: stats?.volatility ?? 0,
      followersCount: profile?.followersCount ?? 0,
      copierCount: profile?.copierCount ?? 0,
      accountAge,
      tradingDays: activityStats?.tradingDays ?? 0,
      positionsShared: activityStats?.positionsShared ?? 0,
      commentsCount: activityStats?.commentsCount ?? 0,
      fraudAlertCount: fraudStats?.alertCount ?? 0,
      suspiciousActivityCount: fraudStats?.suspiciousActivityCount ?? 0,
      isVerified: profile?.isVerified ?? false,
    };
  }

  /**
   * Calculate performance score (0-100)
   * Based on returns, win rate, and P&L
   */
  private calculatePerformanceScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Win rate contribution (max 30 points)
    score += Math.min(30, metrics.winRate * 50);

    // Total P&L contribution (max 40 points)
    // Positive returns up to 100% get full points
    const pnlScore = Math.min(40, Math.max(0, metrics.totalPnLPercent) * 0.4);
    score += pnlScore;

    // Sharpe ratio contribution (max 30 points)
    // Sharpe > 2 gets full points
    const sharpeScore = Math.min(30, Math.max(0, metrics.sharpeRatio * 15));
    score += sharpeScore;

    return Math.min(100, score);
  }

  /**
   * Calculate consistency score (0-100)
   * Based on volatility and streak patterns
   */
  private calculateConsistencyScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Lower volatility is better (max 50 points)
    // Volatility < 10% gets full points
    const volScore = Math.max(0, 50 - metrics.volatility * 2);
    score += volScore;

    // Trading frequency (max 25 points)
    // More trading days = more consistency
    const freqScore = Math.min(25, metrics.tradingDays / 10);
    score += freqScore;

    // Trade count (max 25 points)
    const tradeScore = Math.min(25, metrics.totalTrades / 40);
    score += tradeScore;

    return Math.min(100, score);
  }

  /**
   * Calculate risk management score (0-100)
   * Based on drawdown and risk-adjusted returns
   */
  private calculateRiskManagementScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Max drawdown (max 40 points)
    // Lower drawdown is better; 0% = 40 points, 50% = 0 points
    const ddScore = Math.max(0, 40 - metrics.maxDrawdown * 0.8);
    score += ddScore;

    // Sortino ratio (max 30 points)
    // Higher is better; 2+ gets full points
    const sortinoScore = Math.min(30, Math.max(0, metrics.sortinoRatio * 15));
    score += sortinoScore;

    // Sharpe ratio (max 30 points)
    const sharpeScore = Math.min(30, Math.max(0, metrics.sharpeRatio * 15));
    score += sharpeScore;

    return Math.min(100, score);
  }

  /**
   * Calculate transparency score (0-100)
   * Based on position sharing and verification
   */
  private calculateTransparencyScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Verified status (40 points)
    if (metrics.isVerified) {
      score += 40;
    }

    // Positions shared (max 30 points)
    const shareScore = Math.min(30, metrics.positionsShared / 3);
    score += shareScore;

    // Comments/engagement (max 30 points)
    const commentScore = Math.min(30, metrics.commentsCount / 10);
    score += commentScore;

    return Math.min(100, score);
  }

  /**
   * Calculate social score (0-100)
   * Based on followers and copiers
   */
  private calculateSocialScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Followers (max 50 points)
    // Log scale: 1000 followers = 50 points
    const followerScore = Math.min(50, Math.log10(metrics.followersCount + 1) * 16.67);
    score += followerScore;

    // Copiers (max 50 points)
    // Log scale: 100 copiers = 50 points
    const copierScore = Math.min(50, Math.log10(metrics.copierCount + 1) * 25);
    score += copierScore;

    return Math.min(100, score);
  }

  /**
   * Calculate longevity score (0-100)
   * Based on account age and activity
   */
  private calculateLongevityScore(metrics: ReputationMetrics): number {
    let score = 0;

    // Account age (max 50 points)
    // 2 years = full points
    const ageScore = Math.min(50, metrics.accountAge / 14.6);
    score += ageScore;

    // Active trading days (max 50 points)
    // 500 trading days = full points
    const activityScore = Math.min(50, metrics.tradingDays / 10);
    score += activityScore;

    return Math.min(100, score);
  }

  /**
   * Calculate fraud risk score (0-100, lower is better)
   */
  private calculateFraudRiskScore(metrics: ReputationMetrics): number {
    let riskScore = 0;

    // Fraud alerts (major impact)
    riskScore += metrics.fraudAlertCount * 20;

    // Suspicious activity
    riskScore += metrics.suspiciousActivityCount * 5;

    // Abnormally high win rate with many trades is suspicious
    if (metrics.winRate > 0.8 && metrics.totalTrades > 100) {
      riskScore += 15;
    }

    // Very low drawdown with high returns is suspicious
    if (metrics.maxDrawdown < 2 && metrics.totalPnLPercent > 100) {
      riskScore += 10;
    }

    return Math.min(100, riskScore);
  }

  /**
   * Determine tier based on overall score
   */
  private determineTier(score: number): ReputationTier {
    const { tierThresholds } = this.config;

    if (score >= tierThresholds.legend) return "legend";
    if (score >= tierThresholds.diamond) return "diamond";
    if (score >= tierThresholds.platinum) return "platinum";
    if (score >= tierThresholds.gold) return "gold";
    if (score >= tierThresholds.silver) return "silver";
    return "bronze";
  }

  /**
   * Calculate and update badges
   */
  private calculateBadges(
    metrics: ReputationMetrics,
    existingBadges: ReputationBadge[]
  ): ReputationBadge[] {
    const badges: ReputationBadge[] = [...existingBadges];
    const existingTypes = new Set(existingBadges.map((b) => b.type));
    const now = Date.now();

    for (const [type, requirement] of Object.entries(this.config.badgeRequirements)) {
      if (!existingTypes.has(type) && requirement.check(metrics)) {
        badges.push({
          type,
          name: requirement.name,
          earnedAt: new Date(now),
        });
      }
    }

    return badges;
  }

  // ==========================================================================
  // Badge Management
  // ==========================================================================

  /**
   * Award a specific badge to a user
   */
  async awardBadge(userId: string, badgeType: string, badgeName: string): Promise<void> {
    const reputation = await this.getReputation(userId);

    if (!reputation) {
      throw new ReputationError("Reputation not found", "NOT_FOUND");
    }

    const existingBadge = reputation.badges.find((b) => b.type === badgeType);
    if (existingBadge) {
      this.logger.debug("Badge already awarded", { userId, badgeType });
      return;
    }

    const badges = [
      ...reputation.badges,
      { type: badgeType, name: badgeName, earnedAt: new Date() },
    ];

    await this.db.mutation("reputationScores:updateBadges", {
      userId,
      badges,
    });

    this.logger.info("Badge awarded", { userId, badgeType, badgeName });
  }

  /**
   * Revoke a badge from a user
   */
  async revokeBadge(userId: string, badgeType: string): Promise<void> {
    const reputation = await this.getReputation(userId);

    if (!reputation) {
      throw new ReputationError("Reputation not found", "NOT_FOUND");
    }

    const badges = reputation.badges.filter((b) => b.type !== badgeType);

    await this.db.mutation("reputationScores:updateBadges", {
      userId,
      badges,
    });

    this.logger.info("Badge revoked", { userId, badgeType });
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Recalculate reputation for all traders
   */
  async recalculateAllReputations(): Promise<number> {
    const traders = await this.db.query<{ userId: string }[]>("traderProfiles:getAllActive", {});

    let calculated = 0;

    for (const trader of traders) {
      try {
        await this.calculateReputation(trader.userId);
        calculated++;
      } catch (error) {
        this.logger.error("Failed to calculate reputation", {
          userId: trader.userId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.logger.info("Batch reputation calculation complete", {
      calculated,
      total: traders.length,
    });

    return calculated;
  }

  /**
   * Get traders by tier
   */
  async getTradersByTier(
    tier: ReputationTier,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ traders: ReputationScore[]; cursor?: string }> {
    return await this.db.query("reputationScores:getByTier", {
      tier,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }
}

// ============================================================================
// Errors
// ============================================================================

export class ReputationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "ReputationError";
  }
}

export default ReputationService;
