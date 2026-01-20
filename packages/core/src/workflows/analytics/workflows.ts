/**
 * Analytics Temporal Workflows
 * Scheduled workflows for daily metrics, retention calculation, and weekly reports
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  condition,
} from '@temporalio/workflow';

import type * as activities from './activities';

// ============================================================================
// Activity Proxies
// ============================================================================

const {
  calculateDailyMetrics,
  storeDailyMetrics,
  calculateCohortRetention,
  updateRetentionMetrics,
  generateWeeklyReport,
  sendWeeklyReportNotification,
  checkExperimentStatus,
  cleanupOldEvents,
  sendAnomalyAlerts,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: '30s',
  },
});

// ============================================================================
// Signals and Queries
// ============================================================================

export const cancelWorkflowSignal = defineSignal('cancelWorkflow');
export const getStatusQuery = defineQuery<string>('getStatus');

// ============================================================================
// Daily Metrics Workflow
// ============================================================================

export interface DailyMetricsInput {
  convexUrl: string;
  date?: string; // YYYY-MM-DD, defaults to yesterday
  alertRecipients?: string[];
}

export interface DailyMetricsResult {
  date: string;
  metricsStored: boolean;
  anomaliesDetected: number;
  alertsSent: boolean;
}

/**
 * Calculate and store daily metrics
 * Trigger: cron "0 1 * * *" (1am UTC daily)
 */
export async function calculateDailyMetricsWorkflow(
  input: DailyMetricsInput
): Promise<DailyMetricsResult> {
  let status = 'starting';
  let cancelled = false;

  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
  });

  setHandler(getStatusQuery, () => status);

  // Determine date (default to yesterday)
  const date = input.date || getYesterdayDate();
  status = `calculating metrics for ${date}`;

  // Calculate daily metrics
  const metrics = await calculateDailyMetrics(input.convexUrl, date);
  status = 'storing metrics';

  // Store metrics
  await storeDailyMetrics(input.convexUrl, metrics);

  // Check for anomalies and send alerts
  let alertsSent = false;
  if (metrics.anomalies.length > 0 && input.alertRecipients?.length) {
    status = 'sending anomaly alerts';
    await sendAnomalyAlerts(metrics.anomalies, input.alertRecipients);
    alertsSent = true;
  }

  status = 'completed';

  return {
    date,
    metricsStored: true,
    anomaliesDetected: metrics.anomalies.length,
    alertsSent,
  };
}

// ============================================================================
// Cohort Retention Workflow
// ============================================================================

export interface CohortRetentionInput {
  convexUrl: string;
  cohortDates?: string[]; // YYYY-MM-DD dates, defaults to last 30 cohorts
}

export interface CohortRetentionResult {
  cohortsProcessed: number;
  retentionData: Array<{
    cohortDate: string;
    d1Retention: number;
    d7Retention: number;
    d30Retention: number;
  }>;
}

/**
 * Calculate retention for cohorts
 * Trigger: cron "0 2 * * *" (2am UTC daily)
 */
export async function updateCohortRetentionWorkflow(
  input: CohortRetentionInput
): Promise<CohortRetentionResult> {
  let status = 'starting';
  let cancelled = false;

  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
  });

  setHandler(getStatusQuery, () => status);

  // Determine cohort dates (default to last 30 days)
  const cohortDates = input.cohortDates || getLast30Days();

  const retentionData: Array<{
    cohortDate: string;
    d1Retention: number;
    d7Retention: number;
    d30Retention: number;
  }> = [];

  // Process each cohort
  for (let i = 0; i < cohortDates.length; i++) {
    if (cancelled) {
      status = 'cancelled';
      break;
    }

    const cohortDate = cohortDates[i];
    status = `processing cohort ${i + 1}/${cohortDates.length}: ${cohortDate}`;

    try {
      const retention = await calculateCohortRetention(input.convexUrl, cohortDate);
      await updateRetentionMetrics(input.convexUrl, cohortDate, retention);

      retentionData.push({
        cohortDate,
        d1Retention: retention.d1Retention,
        d7Retention: retention.d7Retention,
        d30Retention: retention.d30Retention,
      });
    } catch (error) {
      console.error(`Failed to process cohort ${cohortDate}:`, error);
    }

    // Small delay between cohorts to avoid overloading
    await sleep('100ms');
  }

  status = 'completed';

  return {
    cohortsProcessed: retentionData.length,
    retentionData,
  };
}

// ============================================================================
// Weekly Report Workflow
// ============================================================================

export interface WeeklyReportInput {
  convexUrl: string;
  weekEndDate?: string; // YYYY-MM-DD, defaults to yesterday
  recipients: string[];
}

export interface WeeklyReportWorkflowResult {
  weekStart: string;
  weekEnd: string;
  reportGenerated: boolean;
  notificationsSent: boolean;
  insightsCount: number;
}

/**
 * Generate and send weekly report
 * Trigger: cron "0 8 * * 1" (Monday 8am UTC)
 */
export async function generateWeeklyReportWorkflow(
  input: WeeklyReportInput
): Promise<WeeklyReportWorkflowResult> {
  let status = 'starting';

  setHandler(getStatusQuery, () => status);

  // Determine week end date (default to yesterday/Sunday)
  const weekEndDate = input.weekEndDate || getYesterdayDate();
  status = `generating report for week ending ${weekEndDate}`;

  // Generate report
  const report = await generateWeeklyReport(input.convexUrl, weekEndDate);
  status = 'sending notifications';

  // Send report
  await sendWeeklyReportNotification(report, input.recipients);

  status = 'completed';

  return {
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    reportGenerated: true,
    notificationsSent: true,
    insightsCount: report.insights.length,
  };
}

// ============================================================================
// Experiment Monitoring Workflow
// ============================================================================

export interface ExperimentMonitoringInput {
  convexUrl: string;
  experimentIds: string[];
  alertRecipients?: string[];
}

export interface ExperimentMonitoringResult {
  experimentsChecked: number;
  experimentsWithWinner: number;
  experimentsToStop: string[];
  experimentsToReview: string[];
}

/**
 * Monitor running experiments for statistical significance
 * Trigger: cron "0 */4 * * *" (every 4 hours)
 */
export async function monitorExperimentsWorkflow(
  input: ExperimentMonitoringInput
): Promise<ExperimentMonitoringResult> {
  let status = 'starting';

  setHandler(getStatusQuery, () => status);

  const experimentsToStop: string[] = [];
  const experimentsToReview: string[] = [];
  let experimentsWithWinner = 0;

  for (const experimentId of input.experimentIds) {
    status = `checking experiment ${experimentId}`;

    try {
      const result = await checkExperimentStatus(input.convexUrl, experimentId);

      if (result.winner) {
        experimentsWithWinner++;
      }

      if (result.recommendedAction === 'stop_winner') {
        experimentsToStop.push(experimentId);
      } else if (result.recommendedAction === 'inconclusive') {
        experimentsToReview.push(experimentId);
      }
    } catch (error) {
      console.error(`Failed to check experiment ${experimentId}:`, error);
    }
  }

  status = 'completed';

  return {
    experimentsChecked: input.experimentIds.length,
    experimentsWithWinner,
    experimentsToStop,
    experimentsToReview,
  };
}

// ============================================================================
// Data Cleanup Workflow
// ============================================================================

export interface DataCleanupInput {
  convexUrl: string;
  retentionDays: number; // How many days of data to keep
}

export interface DataCleanupResult {
  eventsDeleted: number;
  cleanupDate: string;
}

/**
 * Clean up old analytics data
 * Trigger: cron "0 3 * * *" (3am UTC daily)
 */
export async function dataCleanupWorkflow(
  input: DataCleanupInput
): Promise<DataCleanupResult> {
  let status = 'starting cleanup';

  setHandler(getStatusQuery, () => status);

  status = `deleting events older than ${input.retentionDays} days`;

  const result = await cleanupOldEvents(input.convexUrl, input.retentionDays);

  status = 'completed';

  return {
    eventsDeleted: result.deletedCount,
    cleanupDate: new Date().toISOString().split('T')[0],
  };
}

// ============================================================================
// Continuous Analytics Workflow (Long-running)
// ============================================================================

export interface ContinuousAnalyticsInput {
  convexUrl: string;
  alertRecipients: string[];
  weeklyReportRecipients: string[];
  dataRetentionDays: number;
}

/**
 * Long-running workflow that orchestrates all analytics jobs
 * This can run as a continuous workflow or be scheduled
 */
export async function continuousAnalyticsWorkflow(
  input: ContinuousAnalyticsInput
): Promise<void> {
  let status = 'running';
  let cancelled = false;

  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
    status = 'cancelling';
  });

  setHandler(getStatusQuery, () => status);

  while (!cancelled) {
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday

    // 1am UTC - Daily metrics
    if (hour === 1) {
      status = 'running daily metrics';
      await calculateDailyMetricsWorkflow({
        convexUrl: input.convexUrl,
        alertRecipients: input.alertRecipients,
      });
    }

    // 2am UTC - Cohort retention
    if (hour === 2) {
      status = 'running cohort retention';
      await updateCohortRetentionWorkflow({
        convexUrl: input.convexUrl,
      });
    }

    // 3am UTC - Data cleanup
    if (hour === 3) {
      status = 'running data cleanup';
      await dataCleanupWorkflow({
        convexUrl: input.convexUrl,
        retentionDays: input.dataRetentionDays,
      });
    }

    // Monday 8am UTC - Weekly report
    if (dayOfWeek === 1 && hour === 8) {
      status = 'generating weekly report';
      await generateWeeklyReportWorkflow({
        convexUrl: input.convexUrl,
        recipients: input.weeklyReportRecipients,
      });
    }

    status = 'waiting for next scheduled job';

    // Sleep for 1 hour before checking again
    await sleep('1 hour');
  }

  status = 'cancelled';
}

// ============================================================================
// Helper Functions
// ============================================================================

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function getLast30Days(): string[] {
  const dates: string[] = [];
  const today = new Date();

  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}
