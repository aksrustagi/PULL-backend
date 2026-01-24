/**
 * Analytics Workflow Activities
 * Activities for analytics jobs including metrics calculation, reporting, and anomaly detection
 */

import { ConvexHttpClient } from 'convex/browser';

// ============================================================================
// Types
// ============================================================================

export interface DailyMetricsResult {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  newSignups: number;
  kycCompletions: number;
  firstDeposits: number;
  firstTrades: number;
  totalTrades: number;
  totalVolume: number;
  totalDeposits: number;
  totalWithdrawals: number;
  activeTraders: number;
  avgSessionDuration: number;
  avgTradesPerUser: number;
  referrals: number;
  totalFees: number;
  anomalies: Array<{
    metric: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;
}

export interface RetentionResult {
  cohortDate: string;
  cohortSize: number;
  d1Retention: number;
  d7Retention: number;
  d30Retention: number;
}

export interface WeeklyReportResult {
  weekStart: string;
  weekEnd: string;
  metrics: {
    avgDau: number;
    dauChange: number;
    newSignups: number;
    signupsChange: number;
    totalVolume: number;
    volumeChange: number;
    totalFees: number;
    feesChange: number;
    avgRetention: number;
  };
  topGrowthDrivers: Array<{
    name: string;
    impact: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  insights: string[];
  generatedAt: string;
}

export interface ExperimentCheckResult {
  experimentId: string;
  name: string;
  status: string;
  daysRunning: number;
  sampleSize: number;
  statisticalSignificance: number;
  recommendedAction: string;
  winner?: string;
}

// ============================================================================
// Activity Implementations
// ============================================================================

/**
 * Calculate daily metrics for a given date
 */
export async function calculateDailyMetrics(
  convexUrl: string,
  date: string
): Promise<DailyMetricsResult> {
  const convex = new ConvexHttpClient(convexUrl);

  const dateObj = new Date(date);
  const startOfDay = new Date(dateObj);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setHours(23, 59, 59, 999);

  // Calculate DAU
  const dauResult = await convex.query('analyticsEvents:getActiveUsers' as any, {
    startTime: startOfDay.getTime(),
    endTime: endOfDay.getTime(),
  });
  const dau = dauResult?.count ?? 0;

  // Calculate WAU (7 days)
  const weekStart = new Date(endOfDay);
  weekStart.setDate(weekStart.getDate() - 7);
  const wauResult = await convex.query('analyticsEvents:getActiveUsers' as any, {
    startTime: weekStart.getTime(),
    endTime: endOfDay.getTime(),
  });
  const wau = wauResult?.count ?? 0;

  // Calculate MAU (30 days)
  const monthStart = new Date(endOfDay);
  monthStart.setDate(monthStart.getDate() - 30);
  const mauResult = await convex.query('analyticsEvents:getActiveUsers' as any, {
    startTime: monthStart.getTime(),
    endTime: endOfDay.getTime(),
  });
  const mau = mauResult?.count ?? 0;

  // Count various events
  const countEvent = async (eventType: string): Promise<number> => {
    const result = await convex.query('analyticsEvents:countEvents' as any, {
      eventType,
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    });
    return result?.count ?? 0;
  };

  const sumProperty = async (eventType: string, property: string): Promise<number> => {
    const result = await convex.query('analyticsEvents:sumEventProperty' as any, {
      eventType,
      property,
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    });
    return result?.sum ?? 0;
  };

  const countUniqueUsers = async (eventType: string): Promise<number> => {
    const result = await convex.query('analyticsEvents:countUniqueUsers' as any, {
      eventType,
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    });
    return result?.count ?? 0;
  };

  const countWithProperty = async (eventType: string, property: string): Promise<number> => {
    const result = await convex.query('analyticsEvents:countEventsWithProperty' as any, {
      eventType,
      property,
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    });
    return result?.count ?? 0;
  };

  const [
    newSignups,
    kycCompletions,
    firstDeposits,
    firstTrades,
    totalTrades,
    totalVolume,
    totalDeposits,
    totalWithdrawals,
    totalFees,
    activeTraders,
    referrals,
    sessionMetrics,
  ] = await Promise.all([
    countEvent('user.signed_up'),
    countEvent('user.kyc_completed'),
    countEvent('user.first_deposit'),
    countEvent('user.first_trade'),
    countEvent('trade.order_filled'),
    sumProperty('trade.order_filled', 'amount'),
    sumProperty('funnel.deposit_completed', 'amount'),
    sumProperty('withdrawal.completed', 'amount'),
    sumProperty('trade.order_filled', 'fees'),
    countUniqueUsers('trade.order_placed'),
    countWithProperty('user.signed_up', 'referralCode'),
    convex.query('analyticsEvents:getSessionMetrics' as any, {
      startTime: startOfDay.getTime(),
      endTime: endOfDay.getTime(),
    }),
  ]);

  // Detect anomalies
  const historicalAvg = await convex.query('analyticsEvents:getHistoricalAverages' as any, {
    days: 30,
  });

  const anomalies: Array<{ metric: string; severity: 'low' | 'medium' | 'high'; message: string }> = [];

  if (historicalAvg) {
    // Check DAU anomaly
    if (historicalAvg.dau > 0) {
      const dauDeviation = (dau - historicalAvg.dau) / historicalAvg.dau;
      if (dauDeviation < -0.3) {
        anomalies.push({
          metric: 'DAU',
          severity: dauDeviation < -0.5 ? 'high' : 'medium',
          message: `DAU dropped ${Math.abs(dauDeviation * 100).toFixed(1)}% below 30-day average`,
        });
      } else if (dauDeviation > 0.5) {
        anomalies.push({
          metric: 'DAU',
          severity: 'low',
          message: `DAU increased ${(dauDeviation * 100).toFixed(1)}% above 30-day average`,
        });
      }
    }

    // Check signups anomaly
    if (historicalAvg.signups > 0) {
      const signupDeviation = (newSignups - historicalAvg.signups) / historicalAvg.signups;
      if (signupDeviation < -0.4) {
        anomalies.push({
          metric: 'Signups',
          severity: signupDeviation < -0.6 ? 'high' : 'medium',
          message: `Signups dropped ${Math.abs(signupDeviation * 100).toFixed(1)}% below 30-day average`,
        });
      }
    }

    // Check volume anomaly
    if (historicalAvg.volume > 0) {
      const volumeDeviation = (totalVolume - historicalAvg.volume) / historicalAvg.volume;
      if (volumeDeviation < -0.5) {
        anomalies.push({
          metric: 'Volume',
          severity: volumeDeviation < -0.7 ? 'high' : 'medium',
          message: `Trading volume dropped ${Math.abs(volumeDeviation * 100).toFixed(1)}% below 30-day average`,
        });
      }
    }
  }

  const avgSessionDuration = sessionMetrics?.avgDuration ?? 0;
  const avgTradesPerUser = activeTraders > 0 ? totalTrades / activeTraders : 0;

  return {
    date,
    dau,
    wau,
    mau,
    newSignups,
    kycCompletions,
    firstDeposits,
    firstTrades,
    totalTrades,
    totalVolume,
    totalDeposits,
    totalWithdrawals,
    activeTraders,
    avgSessionDuration,
    avgTradesPerUser,
    referrals,
    totalFees,
    anomalies,
  };
}

/**
 * Store daily metrics in the database
 */
export async function storeDailyMetrics(
  convexUrl: string,
  metrics: DailyMetricsResult
): Promise<void> {
  const convex = new ConvexHttpClient(convexUrl);

  await convex.mutation('dailyMetrics:store' as any, {
    ...metrics,
    totalWithdrawals: metrics.totalWithdrawals,
  });
}

/**
 * Calculate retention for a cohort
 */
export async function calculateCohortRetention(
  convexUrl: string,
  cohortDate: string
): Promise<RetentionResult> {
  const convex = new ConvexHttpClient(convexUrl);

  const cohortDateObj = new Date(cohortDate);
  const cohortStart = new Date(cohortDateObj);
  cohortStart.setHours(0, 0, 0, 0);
  const cohortEnd = new Date(cohortDateObj);
  cohortEnd.setHours(23, 59, 59, 999);

  // Get cohort users
  const cohortUsers = await convex.query('analyticsEvents:getCohortUsers' as any, {
    startTime: cohortStart.getTime(),
    endTime: cohortEnd.getTime(),
    eventType: 'user.signed_up',
  });

  const userIds = cohortUsers?.userIds ?? [];
  const cohortSize = userIds.length;

  if (cohortSize === 0) {
    return {
      cohortDate,
      cohortSize: 0,
      d1Retention: 0,
      d7Retention: 0,
      d30Retention: 0,
    };
  }

  // Calculate retention for each day
  const calculateDayRetention = async (day: number): Promise<number> => {
    const targetDate = new Date(cohortDateObj);
    targetDate.setDate(targetDate.getDate() + day);

    const targetStart = new Date(targetDate);
    targetStart.setHours(0, 0, 0, 0);
    const targetEnd = new Date(targetDate);
    targetEnd.setHours(23, 59, 59, 999);

    const retained = await convex.query('analyticsEvents:getRetainedUsers' as any, {
      userIds,
      startTime: targetStart.getTime(),
      endTime: targetEnd.getTime(),
    });

    return (retained?.count ?? 0) / cohortSize;
  };

  const [d1Retention, d7Retention, d30Retention] = await Promise.all([
    calculateDayRetention(1),
    calculateDayRetention(7),
    calculateDayRetention(30),
  ]);

  return {
    cohortDate,
    cohortSize,
    d1Retention,
    d7Retention,
    d30Retention,
  };
}

/**
 * Update retention metrics in daily metrics table
 */
export async function updateRetentionMetrics(
  convexUrl: string,
  cohortDate: string,
  retention: RetentionResult
): Promise<void> {
  const convex = new ConvexHttpClient(convexUrl);

  await convex.mutation('dailyMetrics:updateRetention' as any, {
    date: cohortDate,
    d1Retention: retention.d1Retention,
    d7Retention: retention.d7Retention,
    d30Retention: retention.d30Retention,
  });
}

/**
 * Generate weekly report
 */
export async function generateWeeklyReport(
  convexUrl: string,
  weekEndDate: string
): Promise<WeeklyReportResult> {
  const convex = new ConvexHttpClient(convexUrl);

  const weekEnd = new Date(weekEndDate);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  // Get metrics for both weeks
  const currentWeekMetrics = await convex.query('dailyMetrics:getByDateRange' as any, {
    startDate: weekStart.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0],
  });

  const previousWeekMetrics = await convex.query('dailyMetrics:getByDateRange' as any, {
    startDate: prevWeekStart.toISOString().split('T')[0],
    endDate: prevWeekEnd.toISOString().split('T')[0],
  });

  // Calculate aggregates
  const aggregate = (metrics: any[], field: string) =>
    metrics.reduce((sum, m) => sum + (m[field] || 0), 0);

  const average = (metrics: any[], field: string) =>
    metrics.length > 0 ? aggregate(metrics, field) / metrics.length : 0;

  const currentDauSum = aggregate(currentWeekMetrics, 'dau');
  const previousDauSum = aggregate(previousWeekMetrics, 'dau');
  const avgDau = average(currentWeekMetrics, 'dau');
  const dauChange = previousDauSum > 0 ? (currentDauSum - previousDauSum) / previousDauSum : 0;

  const currentSignups = aggregate(currentWeekMetrics, 'newSignups');
  const previousSignups = aggregate(previousWeekMetrics, 'newSignups');
  const signupsChange = previousSignups > 0 ? (currentSignups - previousSignups) / previousSignups : 0;

  const currentVolume = aggregate(currentWeekMetrics, 'totalVolume');
  const previousVolume = aggregate(previousWeekMetrics, 'totalVolume');
  const volumeChange = previousVolume > 0 ? (currentVolume - previousVolume) / previousVolume : 0;

  const currentFees = aggregate(currentWeekMetrics, 'totalFees');
  const previousFees = aggregate(previousWeekMetrics, 'totalFees');
  const feesChange = previousFees > 0 ? (currentFees - previousFees) / previousFees : 0;

  const avgRetention = average(currentWeekMetrics, 'd7Retention');

  // Identify growth drivers
  const topGrowthDrivers: Array<{ name: string; impact: number; trend: 'up' | 'down' | 'stable' }> = [];

  if (Math.abs(signupsChange) > 0.05) {
    topGrowthDrivers.push({
      name: 'User Signups',
      impact: Math.abs(signupsChange * 100),
      trend: signupsChange > 0.05 ? 'up' : signupsChange < -0.05 ? 'down' : 'stable',
    });
  }

  if (Math.abs(volumeChange) > 0.05) {
    topGrowthDrivers.push({
      name: 'Trading Volume',
      impact: Math.abs(volumeChange * 100),
      trend: volumeChange > 0.05 ? 'up' : volumeChange < -0.05 ? 'down' : 'stable',
    });
  }

  const currentReferrals = aggregate(currentWeekMetrics, 'referrals');
  const previousReferrals = aggregate(previousWeekMetrics, 'referrals');
  const referralChange = previousReferrals > 0 ? (currentReferrals - previousReferrals) / previousReferrals : 0;

  if (Math.abs(referralChange) > 0.05) {
    topGrowthDrivers.push({
      name: 'Referral Program',
      impact: Math.abs(referralChange * 100),
      trend: referralChange > 0.05 ? 'up' : referralChange < -0.05 ? 'down' : 'stable',
    });
  }

  // Sort by impact
  topGrowthDrivers.sort((a, b) => b.impact - a.impact);

  // Generate insights
  const insights: string[] = [];

  if (dauChange > 0.1) {
    insights.push(`Strong user growth: DAU increased ${(dauChange * 100).toFixed(1)}% week-over-week`);
  } else if (dauChange < -0.1) {
    insights.push(`Declining engagement: DAU decreased ${Math.abs(dauChange * 100).toFixed(1)}% week-over-week`);
  }

  if (volumeChange > 0.2) {
    insights.push(`Trading surge: Volume up ${(volumeChange * 100).toFixed(1)}% from last week`);
  }

  if (avgRetention > 0.3) {
    insights.push(`Healthy retention: D7 retention at ${(avgRetention * 100).toFixed(1)}%`);
  } else if (avgRetention < 0.15 && avgRetention > 0) {
    insights.push(`Retention concern: D7 retention at ${(avgRetention * 100).toFixed(1)}% - consider onboarding improvements`);
  }

  if (referralChange > 0.2) {
    insights.push(`Referral program momentum: ${(referralChange * 100).toFixed(1)}% increase in referrals`);
  }

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
    metrics: {
      avgDau,
      dauChange,
      newSignups: currentSignups,
      signupsChange,
      totalVolume: currentVolume,
      volumeChange,
      totalFees: currentFees,
      feesChange,
      avgRetention,
    },
    topGrowthDrivers,
    insights,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Send weekly report notification
 */
export async function sendWeeklyReportNotification(
  report: WeeklyReportResult,
  recipients: string[]
): Promise<void> {
  // In production, this would send via email, Slack, etc.
  console.log('Sending weekly report to:', recipients);
  console.log('Report:', JSON.stringify(report, null, 2));
}

/**
 * Check experiment status and results
 */
export async function checkExperimentStatus(
  convexUrl: string,
  experimentId: string
): Promise<ExperimentCheckResult> {
  const convex = new ConvexHttpClient(convexUrl);

  const experiment = await convex.query('experiments:getById' as any, { id: experimentId });
  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`);
  }

  const stats = await convex.query('experimentEvents:getStats' as any, { experimentId });

  const sampleSize = stats.reduce((sum: number, s: any) => sum + (s.exposures || 0), 0);
  const daysRunning = Math.ceil(
    (Date.now() - experiment.startDate) / (1000 * 60 * 60 * 24)
  );

  // Simple statistical significance calculation
  let statisticalSignificance = 0;
  let winner: string | undefined;

  if (stats.length >= 2) {
    const control = stats.find((s: any) => {
      const variant = experiment.variants.find((v: any) => v.id === s.variantId);
      return variant?.isControl;
    });

    if (control && control.exposures > 0) {
      const controlRate = control.conversionRate;

      for (const variant of stats) {
        if (variant.variantId !== control.variantId && variant.exposures > 0) {
          const variantRate = variant.conversionRate;
          const lift = controlRate > 0 ? (variantRate - controlRate) / controlRate : 0;

          if (lift > 0.05 && variant.exposures >= 100) {
            statisticalSignificance = Math.min(0.95, variant.exposures / 1000);
            if (statisticalSignificance > 0.9) {
              winner = variant.variantId;
            }
          }
        }
      }
    }
  }

  // Determine recommended action
  let recommendedAction: string;
  if (sampleSize < (experiment.minimumSampleSize || 0)) {
    recommendedAction = 'continue';
  } else if (winner) {
    recommendedAction = 'stop_winner';
  } else if (daysRunning > (experiment.minimumRunDuration || 14) * 2) {
    recommendedAction = 'inconclusive';
  } else {
    recommendedAction = 'continue';
  }

  return {
    experimentId,
    name: experiment.name,
    status: experiment.status,
    daysRunning,
    sampleSize,
    statisticalSignificance,
    recommendedAction,
    winner,
  };
}

/**
 * Clean up old analytics events (data retention)
 */
export async function cleanupOldEvents(
  convexUrl: string,
  retentionDays: number
): Promise<{ deletedCount: number }> {
  const convex = new ConvexHttpClient(convexUrl);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await convex.mutation('analyticsEvents:deleteOldEvents' as any, {
    beforeTimestamp: cutoffDate.getTime(),
  });

  return { deletedCount: result?.deletedCount ?? 0 };
}

/**
 * Send anomaly alerts
 */
export async function sendAnomalyAlerts(
  anomalies: Array<{
    metric: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>,
  recipients: string[]
): Promise<void> {
  const highSeverity = anomalies.filter((a) => a.severity === 'high');
  const mediumSeverity = anomalies.filter((a) => a.severity === 'medium');

  if (highSeverity.length > 0 || mediumSeverity.length > 0) {
    console.log('Sending anomaly alerts to:', recipients);
    console.log('High severity:', highSeverity);
    console.log('Medium severity:', mediumSeverity);
    // In production, this would send via PagerDuty, Slack, email, etc.
  }
}
