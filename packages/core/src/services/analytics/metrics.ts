/**
 * Growth Metrics Calculator
 * Calculate key metrics for acquisition, engagement, retention, and revenue
 */

import { ConvexHttpClient } from 'convex/browser';

// ============================================================================
// Types
// ============================================================================

export interface MetricsConfig {
  convexClient: ConvexHttpClient;
  timezone?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface MetricValue {
  value: number;
  previousValue?: number;
  change?: number;
  changePercent?: number;
}

export interface DailyMetrics {
  date: string;
  dau: number;
  newSignups: number;
  kycCompletions: number;
  firstDeposits: number;
  firstTrades: number;
  totalTrades: number;
  totalVolume: number;
  totalDeposits: number;
  activeTraders: number;
  avgSessionDuration: number;
  avgTradesPerUser: number;
  referrals: number;
}

export interface RetentionCohort {
  cohortDate: string;
  cohortSize: number;
  retentionByDay: Record<number, number>; // day -> percentage
}

export interface FunnelMetrics {
  steps: FunnelStep[];
  overallConversion: number;
}

export interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropoffRate: number;
}

export interface GrowthDriver {
  name: string;
  impact: number;
  trend: 'up' | 'down' | 'stable';
  description: string;
}

export interface UserLifetimeMetrics {
  userId: string;
  signupDate: Date;
  totalDeposits: number;
  totalWithdrawals: number;
  totalVolume: number;
  totalTrades: number;
  totalFees: number;
  estimatedLtv: number;
  daysSinceSignup: number;
  lastActiveAt?: Date;
  churnRisk: 'low' | 'medium' | 'high';
}

export interface EngagementMetrics {
  dauMauRatio: number;
  avgSessionDuration: number;
  avgSessionsPerDay: number;
  avgTradesPerActiveUser: number;
  featureAdoption: FeatureAdoption[];
  streakStats: StreakStats;
}

export interface FeatureAdoption {
  feature: string;
  adoptionRate: number;
  activeUsers: number;
}

export interface StreakStats {
  avgStreakLength: number;
  maxStreakLength: number;
  usersWithActiveStreak: number;
  streakMaintenanceRate: number;
}

export interface RevenueMetrics {
  totalVolume: number;
  totalFees: number;
  avgRevenuePerUser: number;
  avgRevenuePerTrade: number;
  estimatedLtv: number;
  paybackPeriodDays: number;
}

export interface SocialMetrics {
  followsPerUser: number;
  copyTradingAdoption: number;
  messagesPerUser: number;
  viralCoefficient: number;
  referralConversionRate: number;
}

// ============================================================================
// Metrics Calculator Class
// ============================================================================

export class MetricsCalculator {
  private convex: ConvexHttpClient;
  private timezone: string;

  constructor(config: MetricsConfig) {
    this.convex = config.convexClient;
    this.timezone = config.timezone || 'UTC';
  }

  // ============================================================================
  // Active Users
  // ============================================================================

  /**
   * Calculate Daily Active Users for a given date
   */
  async calculateDAU(date: Date): Promise<number> {
    const startOfDay = this.getStartOfDay(date);
    const endOfDay = this.getEndOfDay(date);

    const result = await this.convex.query('analyticsEvents:getActiveUsers' as any, {
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    });

    return result?.count ?? 0;
  }

  /**
   * Calculate Weekly Active Users
   */
  async calculateWAU(date: Date): Promise<number> {
    const endOfWeek = this.getEndOfDay(date);
    const startOfWeek = new Date(endOfWeek);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const result = await this.convex.query('analyticsEvents:getActiveUsers' as any, {
      startTime: startOfWeek.getTime(),
      endTime: endOfWeek.getTime(),
    });

    return result?.count ?? 0;
  }

  /**
   * Calculate Monthly Active Users
   */
  async calculateMAU(date: Date): Promise<number> {
    const endOfMonth = this.getEndOfDay(date);
    const startOfMonth = new Date(endOfMonth);
    startOfMonth.setDate(startOfMonth.getDate() - 30);

    const result = await this.convex.query('analyticsEvents:getActiveUsers' as any, {
      startTime: startOfMonth.getTime(),
      endTime: endOfMonth.getTime(),
    });

    return result?.count ?? 0;
  }

  // ============================================================================
  // Retention
  // ============================================================================

  /**
   * Calculate retention for a cohort at a specific day
   */
  async calculateRetention(cohortDate: Date, day: number): Promise<number> {
    const cohortStart = this.getStartOfDay(cohortDate);
    const cohortEnd = this.getEndOfDay(cohortDate);

    // Get users who signed up on the cohort date
    const cohortUsers = await this.convex.query('analyticsEvents:getCohortUsers' as any, {
      startTime: cohortStart.getTime(),
      endTime: cohortEnd.getTime(),
      eventType: 'user.signed_up',
    });

    if (!cohortUsers?.userIds?.length) {
      return 0;
    }

    // Check how many were active on day N
    const targetDate = new Date(cohortDate);
    targetDate.setDate(targetDate.getDate() + day);

    const activeOnDay = await this.convex.query('analyticsEvents:getRetainedUsers' as any, {
      userIds: cohortUsers.userIds,
      startTime: this.getStartOfDay(targetDate).getTime(),
      endTime: this.getEndOfDay(targetDate).getTime(),
    });

    return (activeOnDay?.count ?? 0) / cohortUsers.userIds.length;
  }

  /**
   * Calculate full retention curve for a cohort
   */
  async calculateRetentionCurve(cohortDate: Date, days: number[] = [1, 7, 14, 30]): Promise<RetentionCohort> {
    const retentionByDay: Record<number, number> = {};

    // Get cohort size
    const cohortStart = this.getStartOfDay(cohortDate);
    const cohortEnd = this.getEndOfDay(cohortDate);
    const cohortUsers = await this.convex.query('analyticsEvents:getCohortUsers' as any, {
      startTime: cohortStart.getTime(),
      endTime: cohortEnd.getTime(),
      eventType: 'user.signed_up',
    });

    const cohortSize = cohortUsers?.userIds?.length ?? 0;

    for (const day of days) {
      retentionByDay[day] = await this.calculateRetention(cohortDate, day);
    }

    return {
      cohortDate: cohortDate.toISOString().split('T')[0],
      cohortSize,
      retentionByDay,
    };
  }

  // ============================================================================
  // Conversion Funnel
  // ============================================================================

  /**
   * Calculate conversion funnel metrics
   */
  async calculateConversionFunnel(range: DateRange): Promise<FunnelMetrics> {
    const steps = [
      { name: 'Signup', event: 'user.signed_up' },
      { name: 'Email Verified', event: 'funnel.onboarding_step', filter: { step: 'verify', completed: true } },
      { name: 'KYC Started', event: 'user.kyc_started' },
      { name: 'KYC Completed', event: 'user.kyc_completed' },
      { name: 'First Deposit', event: 'user.first_deposit' },
      { name: 'First Trade', event: 'user.first_trade' },
    ];

    const funnelSteps: FunnelStep[] = [];
    let previousCount = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const count = await this.convex.query('analyticsEvents:countEvents' as any, {
        eventType: step.event,
        startTime: range.start.getTime(),
        endTime: range.end.getTime(),
        filter: step.filter,
      });

      const currentCount = count?.count ?? 0;
      const conversionRate = previousCount > 0 ? currentCount / previousCount : 1;
      const dropoffRate = 1 - conversionRate;

      funnelSteps.push({
        name: step.name,
        count: currentCount,
        conversionRate: i === 0 ? 1 : conversionRate,
        dropoffRate: i === 0 ? 0 : dropoffRate,
      });

      previousCount = currentCount;
    }

    const firstCount = funnelSteps[0]?.count || 0;
    const lastCount = funnelSteps[funnelSteps.length - 1]?.count || 0;
    const overallConversion = firstCount > 0 ? lastCount / firstCount : 0;

    return {
      steps: funnelSteps,
      overallConversion,
    };
  }

  // ============================================================================
  // Lifetime Value
  // ============================================================================

  /**
   * Calculate estimated LTV for a user
   */
  async calculateLTV(userId: string): Promise<number> {
    const userMetrics = await this.convex.query('analyticsEvents:getUserMetrics' as any, {
      userId,
    });

    if (!userMetrics) {
      return 0;
    }

    const daysSinceSignup = userMetrics.daysSinceSignup || 1;
    const totalRevenue = userMetrics.totalFees || 0;

    // Simple LTV calculation: project based on current revenue rate
    const dailyRevenue = totalRevenue / daysSinceSignup;
    const projectedDays = 365; // Project 1 year
    const estimatedLtv = dailyRevenue * projectedDays;

    return estimatedLtv;
  }

  /**
   * Calculate average LTV across all users
   */
  async calculateAverageLTV(range?: DateRange): Promise<number> {
    const result = await this.convex.query('analyticsEvents:getAverageLTV' as any, {
      startTime: range?.start.getTime(),
      endTime: range?.end.getTime(),
    });

    return result?.averageLtv ?? 0;
  }

  // ============================================================================
  // Viral Coefficient
  // ============================================================================

  /**
   * Calculate viral coefficient (K-factor)
   * K = invites per user * conversion rate of invites
   */
  async calculateViralCoefficient(period: 'day' | 'week' | 'month'): Promise<number> {
    const now = new Date();
    const start = new Date(now);

    switch (period) {
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        break;
    }

    const result = await this.convex.query('analyticsEvents:getViralMetrics' as any, {
      startTime: start.getTime(),
      endTime: now.getTime(),
    });

    if (!result) {
      return 0;
    }

    const { activeUsers, referralsSent, referralsConverted } = result;

    if (activeUsers === 0 || referralsSent === 0) {
      return 0;
    }

    const invitesPerUser = referralsSent / activeUsers;
    const conversionRate = referralsConverted / referralsSent;

    return invitesPerUser * conversionRate;
  }

  // ============================================================================
  // Engagement Metrics
  // ============================================================================

  /**
   * Calculate DAU/MAU ratio (stickiness)
   */
  async calculateStickiness(date: Date): Promise<number> {
    const dau = await this.calculateDAU(date);
    const mau = await this.calculateMAU(date);

    return mau > 0 ? dau / mau : 0;
  }

  /**
   * Get comprehensive engagement metrics
   */
  async getEngagementMetrics(range: DateRange): Promise<EngagementMetrics> {
    const result = await this.convex.query('analyticsEvents:getEngagementMetrics' as any, {
      startTime: range.start.getTime(),
      endTime: range.end.getTime(),
    });

    if (!result) {
      return {
        dauMauRatio: 0,
        avgSessionDuration: 0,
        avgSessionsPerDay: 0,
        avgTradesPerActiveUser: 0,
        featureAdoption: [],
        streakStats: {
          avgStreakLength: 0,
          maxStreakLength: 0,
          usersWithActiveStreak: 0,
          streakMaintenanceRate: 0,
        },
      };
    }

    return result;
  }

  // ============================================================================
  // Revenue Metrics
  // ============================================================================

  /**
   * Get comprehensive revenue metrics
   */
  async getRevenueMetrics(range: DateRange): Promise<RevenueMetrics> {
    const result = await this.convex.query('analyticsEvents:getRevenueMetrics' as any, {
      startTime: range.start.getTime(),
      endTime: range.end.getTime(),
    });

    if (!result) {
      return {
        totalVolume: 0,
        totalFees: 0,
        avgRevenuePerUser: 0,
        avgRevenuePerTrade: 0,
        estimatedLtv: 0,
        paybackPeriodDays: 0,
      };
    }

    return result;
  }

  // ============================================================================
  // Social Metrics
  // ============================================================================

  /**
   * Get comprehensive social metrics
   */
  async getSocialMetrics(range: DateRange): Promise<SocialMetrics> {
    const result = await this.convex.query('analyticsEvents:getSocialMetrics' as any, {
      startTime: range.start.getTime(),
      endTime: range.end.getTime(),
    });

    if (!result) {
      return {
        followsPerUser: 0,
        copyTradingAdoption: 0,
        messagesPerUser: 0,
        viralCoefficient: 0,
        referralConversionRate: 0,
      };
    }

    return result;
  }

  // ============================================================================
  // Growth Drivers
  // ============================================================================

  /**
   * Identify top growth drivers
   */
  async getTopGrowthDrivers(): Promise<GrowthDriver[]> {
    const now = new Date();
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const previousWeek = new Date(lastWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);

    // Compare key metrics between periods
    const currentMetrics = await this.getDailyMetricsForRange({
      start: lastWeek,
      end: now,
    });

    const previousMetrics = await this.getDailyMetricsForRange({
      start: previousWeek,
      end: lastWeek,
    });

    const drivers: GrowthDriver[] = [];

    // Analyze referrals
    const currentReferrals = currentMetrics.reduce((sum, m) => sum + m.referrals, 0);
    const previousReferrals = previousMetrics.reduce((sum, m) => sum + m.referrals, 0);
    const referralChange = previousReferrals > 0
      ? (currentReferrals - previousReferrals) / previousReferrals
      : 0;

    drivers.push({
      name: 'Referral Program',
      impact: Math.abs(referralChange) * 100,
      trend: referralChange > 0.05 ? 'up' : referralChange < -0.05 ? 'down' : 'stable',
      description: `Referrals ${referralChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(referralChange * 100).toFixed(1)}%`,
    });

    // Analyze KYC completion
    const currentKyc = currentMetrics.reduce((sum, m) => sum + m.kycCompletions, 0);
    const previousKyc = previousMetrics.reduce((sum, m) => sum + m.kycCompletions, 0);
    const kycChange = previousKyc > 0 ? (currentKyc - previousKyc) / previousKyc : 0;

    drivers.push({
      name: 'KYC Completion',
      impact: Math.abs(kycChange) * 100,
      trend: kycChange > 0.05 ? 'up' : kycChange < -0.05 ? 'down' : 'stable',
      description: `KYC completions ${kycChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(kycChange * 100).toFixed(1)}%`,
    });

    // Analyze first deposits
    const currentDeposits = currentMetrics.reduce((sum, m) => sum + m.firstDeposits, 0);
    const previousDeposits = previousMetrics.reduce((sum, m) => sum + m.firstDeposits, 0);
    const depositChange = previousDeposits > 0
      ? (currentDeposits - previousDeposits) / previousDeposits
      : 0;

    drivers.push({
      name: 'First Deposits',
      impact: Math.abs(depositChange) * 100,
      trend: depositChange > 0.05 ? 'up' : depositChange < -0.05 ? 'down' : 'stable',
      description: `First deposits ${depositChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(depositChange * 100).toFixed(1)}%`,
    });

    // Analyze trading volume
    const currentVolume = currentMetrics.reduce((sum, m) => sum + m.totalVolume, 0);
    const previousVolume = previousMetrics.reduce((sum, m) => sum + m.totalVolume, 0);
    const volumeChange = previousVolume > 0
      ? (currentVolume - previousVolume) / previousVolume
      : 0;

    drivers.push({
      name: 'Trading Volume',
      impact: Math.abs(volumeChange) * 100,
      trend: volumeChange > 0.05 ? 'up' : volumeChange < -0.05 ? 'down' : 'stable',
      description: `Volume ${volumeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(volumeChange * 100).toFixed(1)}%`,
    });

    // Sort by impact
    return drivers.sort((a, b) => b.impact - a.impact);
  }

  // ============================================================================
  // Daily Metrics Aggregation
  // ============================================================================

  /**
   * Calculate all daily metrics for a date
   */
  async calculateDailyMetrics(date: Date): Promise<DailyMetrics> {
    const startOfDay = this.getStartOfDay(date);
    const endOfDay = this.getEndOfDay(date);

    const [
      dau,
      signups,
      kycCompletions,
      firstDeposits,
      firstTrades,
      trades,
      volume,
      deposits,
      sessions,
      referrals,
    ] = await Promise.all([
      this.calculateDAU(date),
      this.countEvents('user.signed_up', startOfDay, endOfDay),
      this.countEvents('user.kyc_completed', startOfDay, endOfDay),
      this.countEvents('user.first_deposit', startOfDay, endOfDay),
      this.countEvents('user.first_trade', startOfDay, endOfDay),
      this.countEvents('trade.order_filled', startOfDay, endOfDay),
      this.sumEventProperty('trade.order_filled', 'amount', startOfDay, endOfDay),
      this.sumEventProperty('funnel.deposit_completed', 'amount', startOfDay, endOfDay),
      this.getSessionMetrics(startOfDay, endOfDay),
      this.countEventsWithProperty('user.signed_up', 'referralCode', startOfDay, endOfDay),
    ]);

    const activeTraders = await this.countUniqueUsers('trade.order_placed', startOfDay, endOfDay);

    return {
      date: date.toISOString().split('T')[0],
      dau,
      newSignups: signups,
      kycCompletions,
      firstDeposits,
      firstTrades,
      totalTrades: trades,
      totalVolume: volume,
      totalDeposits: deposits,
      activeTraders,
      avgSessionDuration: sessions.avgDuration,
      avgTradesPerUser: activeTraders > 0 ? trades / activeTraders : 0,
      referrals,
    };
  }

  /**
   * Get daily metrics for a date range
   */
  async getDailyMetricsForRange(range: DateRange): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const current = new Date(range.start);

    while (current <= range.end) {
      const dailyMetrics = await this.calculateDailyMetrics(current);
      metrics.push(dailyMetrics);
      current.setDate(current.getDate() + 1);
    }

    return metrics;
  }

  // ============================================================================
  // Anomaly Detection
  // ============================================================================

  /**
   * Detect anomalies in metrics
   */
  async detectAnomalies(metrics: DailyMetrics): Promise<Array<{ metric: string; severity: 'low' | 'medium' | 'high'; message: string }>> {
    const anomalies: Array<{ metric: string; severity: 'low' | 'medium' | 'high'; message: string }> = [];

    // Get historical averages
    const historicalAvg = await this.getHistoricalAverages(30);

    // Check DAU
    if (historicalAvg.dau > 0) {
      const dauDeviation = (metrics.dau - historicalAvg.dau) / historicalAvg.dau;
      if (dauDeviation < -0.3) {
        anomalies.push({
          metric: 'DAU',
          severity: dauDeviation < -0.5 ? 'high' : 'medium',
          message: `DAU dropped ${Math.abs(dauDeviation * 100).toFixed(1)}% below average`,
        });
      } else if (dauDeviation > 0.5) {
        anomalies.push({
          metric: 'DAU',
          severity: 'low',
          message: `DAU increased ${(dauDeviation * 100).toFixed(1)}% above average`,
        });
      }
    }

    // Check signups
    if (historicalAvg.signups > 0) {
      const signupDeviation = (metrics.newSignups - historicalAvg.signups) / historicalAvg.signups;
      if (signupDeviation < -0.4) {
        anomalies.push({
          metric: 'Signups',
          severity: signupDeviation < -0.6 ? 'high' : 'medium',
          message: `Signups dropped ${Math.abs(signupDeviation * 100).toFixed(1)}% below average`,
        });
      }
    }

    // Check volume
    if (historicalAvg.volume > 0) {
      const volumeDeviation = (metrics.totalVolume - historicalAvg.volume) / historicalAvg.volume;
      if (volumeDeviation < -0.5) {
        anomalies.push({
          metric: 'Volume',
          severity: volumeDeviation < -0.7 ? 'high' : 'medium',
          message: `Trading volume dropped ${Math.abs(volumeDeviation * 100).toFixed(1)}% below average`,
        });
      }
    }

    return anomalies;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getEndOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private async countEvents(eventType: string, start: Date, end: Date): Promise<number> {
    const result = await this.convex.query('analyticsEvents:countEvents' as any, {
      eventType,
      startTime: start.getTime(),
      endTime: end.getTime(),
    });
    return result?.count ?? 0;
  }

  private async countEventsWithProperty(
    eventType: string,
    property: string,
    start: Date,
    end: Date
  ): Promise<number> {
    const result = await this.convex.query('analyticsEvents:countEventsWithProperty' as any, {
      eventType,
      property,
      startTime: start.getTime(),
      endTime: end.getTime(),
    });
    return result?.count ?? 0;
  }

  private async sumEventProperty(
    eventType: string,
    property: string,
    start: Date,
    end: Date
  ): Promise<number> {
    const result = await this.convex.query('analyticsEvents:sumEventProperty' as any, {
      eventType,
      property,
      startTime: start.getTime(),
      endTime: end.getTime(),
    });
    return result?.sum ?? 0;
  }

  private async countUniqueUsers(eventType: string, start: Date, end: Date): Promise<number> {
    const result = await this.convex.query('analyticsEvents:countUniqueUsers' as any, {
      eventType,
      startTime: start.getTime(),
      endTime: end.getTime(),
    });
    return result?.count ?? 0;
  }

  private async getSessionMetrics(start: Date, end: Date): Promise<{ avgDuration: number }> {
    const result = await this.convex.query('analyticsEvents:getSessionMetrics' as any, {
      startTime: start.getTime(),
      endTime: end.getTime(),
    });
    return result ?? { avgDuration: 0 };
  }

  private async getHistoricalAverages(days: number): Promise<{ dau: number; signups: number; volume: number }> {
    const result = await this.convex.query('analyticsEvents:getHistoricalAverages' as any, {
      days,
    });
    return result ?? { dau: 0, signups: 0, volume: 0 };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMetricsCalculator(config: MetricsConfig): MetricsCalculator {
  return new MetricsCalculator(config);
}
