/**
 * Data Aggregation Workflow
 * Periodically aggregates trading behavior, social signals, and other flywheel data
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  continueAsNew,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  // Trading behavior aggregation
  aggregateTradingSessions,
  analyzeOrderFlowPatterns,
  calculateRiskMetrics,
  analyzeMarketPerformance,
  analyzeNewsReactions,

  // Social signal aggregation
  aggregateSocialGraph,
  analyzeCopyTrading,
  aggregateChatSentiment,
  analyzeViralContent,
  calculateCommunityConviction,
  generateLeaderboards,

  // Email intelligence (with consent check)
  analyzeNewsletterCorrelations,
  analyzeCalendarCorrelations,
  rankInformationSources,

  // Cross-asset correlations
  calculateCrossAssetCorrelations,
  detectMarketRegimes,
  analyzeAlternativeData,

  // Outcome tracking
  trackSignalPerformance,
  analyzeTraderAlpha,
  analyzeContentEngagement,
  analyzeFunnelConversions,

  // Signal generation
  generateSignals,
  deliverSignals,

  // Utility
  recordAuditLog,
  sendAdminNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "5 minutes",
  },
});

// Workflow input type
export interface DataAggregationInput {
  aggregationType:
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly";
  windowStart?: number;
  windowEnd?: number;
  specificTasks?: string[];
}

// Aggregation status type
export interface AggregationStatus {
  startedAt: number;
  completedTasks: string[];
  failedTasks: Array<{ task: string; error: string }>;
  currentTask: string | null;
  metricsGenerated: number;
  signalsGenerated: number;
  isComplete: boolean;
}

// Signals
export const pauseAggregationSignal = defineSignal("pauseAggregation");
export const resumeAggregationSignal = defineSignal("resumeAggregation");

// Queries
export const getAggregationStatusQuery = defineQuery<AggregationStatus>("getAggregationStatus");

/**
 * Main Data Aggregation Workflow
 * Runs on a schedule to aggregate flywheel data
 */
export async function dataAggregationWorkflow(
  input: DataAggregationInput
): Promise<AggregationStatus> {
  const { aggregationType, specificTasks } = input;

  // Calculate window
  const windowEnd = input.windowEnd || Date.now();
  const windowStart = input.windowStart || calculateWindowStart(aggregationType, windowEnd);

  // Initialize status
  const status: AggregationStatus = {
    startedAt: Date.now(),
    completedTasks: [],
    failedTasks: [],
    currentTask: null,
    metricsGenerated: 0,
    signalsGenerated: 0,
    isComplete: false,
  };

  let isPaused = false;

  // Set up handlers
  setHandler(getAggregationStatusQuery, () => status);
  setHandler(pauseAggregationSignal, () => {
    isPaused = true;
  });
  setHandler(resumeAggregationSignal, () => {
    isPaused = false;
  });

  // Define tasks based on aggregation type
  const tasks = specificTasks || getTasksForAggregationType(aggregationType);

  // Record start
  await recordAuditLog({
    userId: undefined,
    action: "data_aggregation_started",
    resourceType: "aggregation",
    resourceId: `agg_${aggregationType}_${windowStart}`,
    metadata: {
      aggregationType,
      windowStart,
      windowEnd,
      tasks,
    },
  });

  // Execute tasks
  for (const task of tasks) {
    // Check pause state
    while (isPaused) {
      await sleep("1 minute");
    }

    status.currentTask = task;

    try {
      const result = await executeTask(task, windowStart, windowEnd);
      status.completedTasks.push(task);
      status.metricsGenerated += result.metricsGenerated || 0;
      status.signalsGenerated += result.signalsGenerated || 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      status.failedTasks.push({ task, error: errorMessage });

      // Continue with other tasks unless critical
      if (isCriticalTask(task)) {
        throw ApplicationFailure.nonRetryable(`Critical task failed: ${task} - ${errorMessage}`);
      }
    }
  }

  status.currentTask = null;
  status.isComplete = true;

  // Record completion
  await recordAuditLog({
    userId: undefined,
    action: "data_aggregation_completed",
    resourceType: "aggregation",
    resourceId: `agg_${aggregationType}_${windowStart}`,
    metadata: {
      completedTasks: status.completedTasks.length,
      failedTasks: status.failedTasks.length,
      metricsGenerated: status.metricsGenerated,
      signalsGenerated: status.signalsGenerated,
    },
  });

  // Notify if there were failures
  if (status.failedTasks.length > 0) {
    await sendAdminNotification({
      type: "aggregation_partial_failure",
      message: `Data aggregation had ${status.failedTasks.length} failed tasks`,
      metadata: { failedTasks: status.failedTasks },
    });
  }

  return status;
}

/**
 * Continuous Signal Generation Workflow
 * Runs continuously to generate real-time signals
 */
export async function continuousSignalGenerationWorkflow(
  input: { batchSize: number; intervalMs: number }
): Promise<void> {
  const { batchSize, intervalMs } = input;
  let iteration = 0;

  while (iteration < 1000) {
    // Run 1000 iterations then continue as new
    try {
      // Generate signals from latest data
      const signals = await generateSignals({
        windowMs: intervalMs * 2, // Look back 2 intervals
        minConfidence: 0.6,
      });

      if (signals.length > 0) {
        // Deliver to subscribers
        await deliverSignals({
          signals: signals.slice(0, batchSize),
          deliveryType: "real_time",
        });
      }
    } catch (error) {
      console.error("Signal generation error:", error);
      // Continue despite errors
    }

    await sleep(intervalMs);
    iteration++;
  }

  // Continue as new to prevent history growth
  await continueAsNew<typeof continuousSignalGenerationWorkflow>({
    batchSize,
    intervalMs,
  });
}

/**
 * Periodic Leaderboard Update Workflow
 */
export async function leaderboardUpdateWorkflow(
  input: { leaderboardTypes: string[] }
): Promise<{ updated: string[]; errors: string[] }> {
  const updated: string[] = [];
  const errors: string[] = [];

  for (const leaderboardType of input.leaderboardTypes) {
    try {
      await generateLeaderboards({
        leaderboardType,
        assetClass: undefined,
        category: undefined,
      });
      updated.push(leaderboardType);
    } catch (error) {
      errors.push(`${leaderboardType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { updated, errors };
}

/**
 * Correlation Discovery Workflow
 * Runs weekly to discover new cross-asset correlations
 */
export async function correlationDiscoveryWorkflow(
  input: { lookbackDays: number; minCorrelation: number }
): Promise<{
  newCorrelations: number;
  updatedCorrelations: number;
  significantFindings: string[];
}> {
  const { lookbackDays, minCorrelation } = input;
  const windowEnd = Date.now();
  const windowStart = windowEnd - lookbackDays * 24 * 60 * 60 * 1000;

  let newCorrelations = 0;
  let updatedCorrelations = 0;
  const significantFindings: string[] = [];

  // Step 1: Calculate cross-asset correlations
  const crossAssetResult = await calculateCrossAssetCorrelations({
    windowStart,
    windowEnd,
    minCorrelation,
  });

  newCorrelations += crossAssetResult.newCorrelations;
  updatedCorrelations += crossAssetResult.updatedCorrelations;
  significantFindings.push(...crossAssetResult.significantFindings);

  // Step 2: Analyze alternative data correlations
  const altDataResult = await analyzeAlternativeData({
    windowStart,
    windowEnd,
    dataTypes: [
      "pokemon_prices",
      "weather_data",
      "sports_betting",
      "social_sentiment",
    ],
  });

  newCorrelations += altDataResult.newCorrelations;
  significantFindings.push(...altDataResult.significantFindings);

  // Step 3: Detect market regimes
  await detectMarketRegimes({
    windowStart,
    windowEnd,
    assetClasses: ["crypto", "prediction", "rwa"],
  });

  // Record findings
  await recordAuditLog({
    userId: undefined,
    action: "correlation_discovery_completed",
    resourceType: "correlation",
    resourceId: `corr_discovery_${windowStart}`,
    metadata: {
      newCorrelations,
      updatedCorrelations,
      significantFindingsCount: significantFindings.length,
    },
  });

  // Notify about significant discoveries
  if (significantFindings.length > 0) {
    await sendAdminNotification({
      type: "significant_correlations_discovered",
      message: `Found ${significantFindings.length} significant correlations`,
      metadata: { findings: significantFindings.slice(0, 10) },
    });
  }

  return { newCorrelations, updatedCorrelations, significantFindings };
}

/**
 * Trader Alpha Analysis Workflow
 * Runs monthly to identify traders with real alpha
 */
export async function traderAlphaAnalysisWorkflow(
  input: { minTrades: number; lookbackMonths: number }
): Promise<{
  analyzedTraders: number;
  tradersWithAlpha: number;
  topTraders: string[];
}> {
  const result = await analyzeTraderAlpha({
    minTrades: input.minTrades,
    lookbackMs: input.lookbackMonths * 30 * 24 * 60 * 60 * 1000,
  });

  return {
    analyzedTraders: result.analyzedTraders,
    tradersWithAlpha: result.tradersWithAlpha,
    topTraders: result.topTraderIds.slice(0, 20),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateWindowStart(
  aggregationType: DataAggregationInput["aggregationType"],
  windowEnd: number
): number {
  switch (aggregationType) {
    case "hourly":
      return windowEnd - 60 * 60 * 1000;
    case "daily":
      return windowEnd - 24 * 60 * 60 * 1000;
    case "weekly":
      return windowEnd - 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return windowEnd - 30 * 24 * 60 * 60 * 1000;
  }
}

function getTasksForAggregationType(
  aggregationType: DataAggregationInput["aggregationType"]
): string[] {
  const baseTasks = [
    "trading_sessions",
    "chat_sentiment",
    "community_conviction",
    "signal_performance",
  ];

  const dailyTasks = [
    ...baseTasks,
    "order_flow_patterns",
    "risk_metrics",
    "social_graph",
    "copy_trading",
    "viral_content",
    "leaderboards",
  ];

  const weeklyTasks = [
    ...dailyTasks,
    "market_performance",
    "news_reactions",
    "newsletter_correlations",
    "calendar_correlations",
    "information_sources",
    "cross_asset_correlations",
    "alternative_data",
    "content_engagement",
    "funnel_conversions",
  ];

  const monthlyTasks = [
    ...weeklyTasks,
    "trader_alpha",
    "market_regimes",
  ];

  switch (aggregationType) {
    case "hourly":
      return baseTasks;
    case "daily":
      return dailyTasks;
    case "weekly":
      return weeklyTasks;
    case "monthly":
      return monthlyTasks;
  }
}

function isCriticalTask(task: string): boolean {
  // Tasks that should stop the workflow if they fail
  return ["trading_sessions", "signal_performance"].includes(task);
}

async function executeTask(
  task: string,
  windowStart: number,
  windowEnd: number
): Promise<{ metricsGenerated?: number; signalsGenerated?: number }> {
  switch (task) {
    // Trading behavior
    case "trading_sessions":
      return aggregateTradingSessions({ windowStart, windowEnd });
    case "order_flow_patterns":
      return analyzeOrderFlowPatterns({ windowStart, windowEnd });
    case "risk_metrics":
      return calculateRiskMetrics({ windowStart, windowEnd });
    case "market_performance":
      return analyzeMarketPerformance({ windowStart, windowEnd });
    case "news_reactions":
      return analyzeNewsReactions({ windowStart, windowEnd });

    // Social signals
    case "social_graph":
      return aggregateSocialGraph({ windowStart, windowEnd });
    case "copy_trading":
      return analyzeCopyTrading({ windowStart, windowEnd });
    case "chat_sentiment":
      return aggregateChatSentiment({ windowStart, windowEnd });
    case "viral_content":
      return analyzeViralContent({ windowStart, windowEnd });
    case "community_conviction":
      return calculateCommunityConviction({ windowStart, windowEnd });
    case "leaderboards":
      return generateLeaderboards({
        leaderboardType: "all",
        assetClass: undefined,
        category: undefined,
      });

    // Email intelligence
    case "newsletter_correlations":
      return analyzeNewsletterCorrelations({ windowStart, windowEnd });
    case "calendar_correlations":
      return analyzeCalendarCorrelations({ windowStart, windowEnd });
    case "information_sources":
      return rankInformationSources({ windowStart, windowEnd });

    // Cross-asset correlations
    case "cross_asset_correlations":
      return calculateCrossAssetCorrelations({
        windowStart,
        windowEnd,
        minCorrelation: 0.3,
      });
    case "market_regimes":
      return detectMarketRegimes({
        windowStart,
        windowEnd,
        assetClasses: ["crypto", "prediction", "rwa"],
      });
    case "alternative_data":
      return analyzeAlternativeData({
        windowStart,
        windowEnd,
        dataTypes: ["pokemon_prices", "sports_betting", "social_sentiment"],
      });

    // Outcome tracking
    case "signal_performance":
      return trackSignalPerformance({ windowStart, windowEnd });
    case "trader_alpha":
      return analyzeTraderAlpha({
        minTrades: 30,
        lookbackMs: windowEnd - windowStart,
      });
    case "content_engagement":
      return analyzeContentEngagement({ windowStart, windowEnd });
    case "funnel_conversions":
      return analyzeFunnelConversions({ windowStart, windowEnd });

    default:
      throw new Error(`Unknown task: ${task}`);
  }
}
