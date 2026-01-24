/**
 * Generate Daily Insights Workflow
 * Runs daily to generate personalized insights for all active users
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  fetchActiveUsers,
  fetchUserPositions,
  fetchRecentSignalsForUser,
  fetchCorrelationPairs,
  fetchMarketHistory,
  calculateMarketCorrelation,
  explainCorrelation,
  generateDailyInsight,
  storeUserInsight,
  storeCorrelation,
  sendInsightNotification,
  recordSignalAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "60 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "60 seconds",
  },
});

// Workflow status type
export interface DailyInsightsStatus {
  runId: string;
  status: "gathering_data" | "calculating_correlations" | "generating_insights" | "completed" | "failed";
  lastRunAt: string;
  usersProcessed: number;
  insightsGenerated: number;
  correlationsCalculated: number;
  notificationsSent: number;
  errors: Array<{ userId?: string; error: string }>;
}

// Configuration
const DAILY_RUN_HOUR = 6; // 6 AM
const CORRELATION_TIME_WINDOW = "24h";
const CORRELATION_LOOKBACK_HOURS = 168; // 7 days

// Queries
export const getStatusQuery = defineQuery<DailyInsightsStatus>("getStatus");

/**
 * Calculate milliseconds until next run at specified hour
 */
function msUntilNextRun(targetHour: number): number {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(targetHour, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

/**
 * Generate Daily Insights Workflow
 * Generates personalized daily insights for all active users
 */
export async function generateDailyInsightsWorkflow(): Promise<DailyInsightsStatus> {
  const runId = `daily_insights_${new Date().toISOString().split("T")[0]}`;

  // Initialize status
  const status: DailyInsightsStatus = {
    runId,
    status: "gathering_data",
    lastRunAt: new Date().toISOString(),
    usersProcessed: 0,
    insightsGenerated: 0,
    correlationsCalculated: 0,
    notificationsSent: 0,
    errors: [],
  };

  // Set up query handler
  setHandler(getStatusQuery, () => status);

  try {
    await recordSignalAuditLog({
      action: "daily_insights_started",
      signalId: runId,
      signalType: "daily_digest",
      metadata: { startTime: status.lastRunAt },
    });

    // =========================================================================
    // Step 1: Calculate market correlations
    // =========================================================================
    status.status = "calculating_correlations";

    const correlationPairs = await fetchCorrelationPairs();

    for (const pair of correlationPairs) {
      try {
        // Fetch historical data for both markets
        const [historyA, historyB] = await Promise.all([
          fetchMarketHistory(pair.marketA, CORRELATION_LOOKBACK_HOURS),
          fetchMarketHistory(pair.marketB, CORRELATION_LOOKBACK_HOURS),
        ]);

        if (historyA.length > 10 && historyB.length > 10) {
          // Calculate correlation
          const correlation = await calculateMarketCorrelation(historyA, historyB);

          // Get AI explanation for significant correlations
          if (correlation.strength !== "weak") {
            const explanation = await explainCorrelation(
              correlation,
              `Prediction market: ${pair.marketA}`,
              `Asset: ${pair.marketB}`
            );
            correlation.aiExplanation = explanation;
          }

          // Store correlation
          await storeCorrelation(correlation, "price", CORRELATION_TIME_WINDOW);
          status.correlationsCalculated++;
        }
      } catch (error) {
        status.errors.push({
          error: `Correlation ${pair.marketA}-${pair.marketB}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // =========================================================================
    // Step 2: Generate user insights
    // =========================================================================
    status.status = "generating_insights";

    const activeUsers = await fetchActiveUsers();

    for (const userId of activeUsers) {
      try {
        // Fetch user's context
        const [positions, recentSignals] = await Promise.all([
          fetchUserPositions(userId),
          fetchRecentSignalsForUser(userId),
        ]);

        // Skip users with no positions
        if (positions.length === 0) {
          status.usersProcessed++;
          continue;
        }

        // Generate market summary based on their positions
        const marketSummary = `User holds ${positions.length} positions across ${[...new Set(positions.map((p) => p.symbol))].length} unique assets. Total P&L: $${positions.reduce((sum, p) => sum + p.pnl, 0).toFixed(2)}`;

        // Generate personalized insight
        const insight = await generateDailyInsight({
          userId,
          positions,
          recentSignals,
          marketSummary,
        });

        // Store the insight
        const insightId = await storeUserInsight(insight);
        status.insightsGenerated++;

        // Send notification for high-priority insights
        if (insight.priority === "high" || insight.priority === "urgent") {
          await sendInsightNotification({
            userId,
            insightId,
            title: insight.title,
            priority: insight.priority,
          });
          status.notificationsSent++;
        }

        status.usersProcessed++;
      } catch (error) {
        status.errors.push({
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // =========================================================================
    // Step 3: Complete and schedule next run
    // =========================================================================
    status.status = "completed";
    status.lastRunAt = new Date().toISOString();

    await recordSignalAuditLog({
      action: "daily_insights_completed",
      signalId: runId,
      signalType: "daily_digest",
      metadata: {
        usersProcessed: status.usersProcessed,
        insightsGenerated: status.insightsGenerated,
        correlationsCalculated: status.correlationsCalculated,
        notificationsSent: status.notificationsSent,
        errors: status.errors.length,
      },
    });

    // Wait until next scheduled run time
    const msToNextRun = msUntilNextRun(DAILY_RUN_HOUR);
    await sleep(msToNextRun);

    // Continue as new for next day's run
    await continueAsNew<typeof generateDailyInsightsWorkflow>();

    return status;
  } catch (error) {
    status.status = "failed";

    await recordSignalAuditLog({
      action: "daily_insights_failed",
      signalId: runId,
      signalType: "daily_digest",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        usersProcessed: status.usersProcessed,
      },
    });

    // Still schedule next run even on failure
    const msToNextRun = msUntilNextRun(DAILY_RUN_HOUR);
    await sleep(msToNextRun);
    await continueAsNew<typeof generateDailyInsightsWorkflow>();

    throw error;
  }
}
