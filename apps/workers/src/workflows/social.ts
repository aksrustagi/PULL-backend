import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities/social";

const {
  // Trader stats
  calculateTraderStats,
  saveTraderStats,
  
  // Copy trading
  calculateCopySize,
  applyRiskControls,
  executeCopyTrade,
  recordCopyTrade,
  
  // Fraud detection
  detectWashTrading,
  detectFrontRunning,
  detectUnusualVolume,
  detectPerformanceManipulation,
  saveFraudAlert,
  
  // Reputation
  calculateReputation,
  saveReputation,
  
  // Leaderboard
  generateLeaderboardSnapshot,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

// ============================================================================
// TRADER STATS WORKFLOW
// ============================================================================

export interface TraderStatsWorkflowParams {
  userId: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";
  periodStart: number;
  periodEnd: number;
}

/**
 * Calculate and update trader statistics
 */
export async function calculateTraderStatsWorkflow(
  params: TraderStatsWorkflowParams
): Promise<{ success: boolean; error?: string }> {
  try {
    // Calculate stats from trades
    const stats = await calculateTraderStats(
      params.userId,
      params.period,
      params.periodStart,
      params.periodEnd
    );

    // Save stats to database
    await saveTraderStats(stats);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Batch calculate stats for multiple users
 */
export async function batchCalculateStatsWorkflow(params: {
  userIds: string[];
  period: TraderStatsWorkflowParams["period"];
  periodStart: number;
  periodEnd: number;
}): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const userId of params.userIds) {
    try {
      await calculateTraderStatsWorkflow({
        userId,
        period: params.period,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      });
      processed++;
    } catch (error) {
      console.error(`Failed to calculate stats for user ${userId}:`, error);
      failed++;
    }

    // Small delay to avoid overwhelming the system
    await sleep("100ms");
  }

  return { processed, failed };
}

// ============================================================================
// COPY TRADING WORKFLOW
// ============================================================================

export interface CopyTradingWorkflowParams {
  subscriptionId: string;
  copierId: string;
  traderId: string;
  originalOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  originalQuantity: number;
  originalPrice: number;
  delaySeconds?: number;
}

// Signal to cancel copy trade
export const cancelCopyTradeSignal = defineSignal("cancelCopyTrade");

/**
 * Execute copy trade with risk controls and delay
 */
export async function copyTradeExecutionWorkflow(
  params: CopyTradingWorkflowParams
): Promise<{
  success: boolean;
  copyOrderId?: string;
  skipReason?: string;
  failureReason?: string;
}> {
  let cancelled = false;

  // Set up cancellation signal handler
  setHandler(cancelCopyTradeSignal, () => {
    cancelled = true;
  });

  try {
    // Apply delay if configured
    if (params.delaySeconds && params.delaySeconds > 0) {
      await sleep(`${params.delaySeconds}s`);
      
      // Check if cancelled during delay
      if (cancelled) {
        await recordCopyTrade(params, {
          success: false,
          copyQuantity: 0,
          skipReason: "Cancelled during delay",
          copyFee: 0,
          performanceFee: 0,
        });
        
        return {
          success: false,
          skipReason: "Cancelled during delay",
        };
      }
    }

    // Calculate copy size based on subscription settings
    const copyQuantity = await calculateCopySize(
      params.subscriptionId,
      params.originalQuantity,
      params.originalPrice
    );

    // Apply risk controls
    const riskCheck = await applyRiskControls(
      params.subscriptionId,
      params.symbol,
      params.side,
      copyQuantity,
      params.originalPrice
    );

    if (!riskCheck.allowed) {
      await recordCopyTrade(params, {
        success: false,
        copyQuantity: 0,
        skipReason: riskCheck.reason || "Risk controls failed",
        copyFee: 0,
        performanceFee: 0,
      });

      return {
        success: false,
        skipReason: riskCheck.reason || "Risk controls failed",
      };
    }

    // Execute the copy trade
    const result = await executeCopyTrade(params, copyQuantity);

    // Record the execution
    await recordCopyTrade(params, result);

    return {
      success: result.success,
      copyOrderId: result.copyOrderId,
      failureReason: result.failureReason,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error";
    
    await recordCopyTrade(params, {
      success: false,
      copyQuantity: 0,
      failureReason,
      copyFee: 0,
      performanceFee: 0,
    });

    return {
      success: false,
      failureReason,
    };
  }
}

/**
 * Monitor new trades and trigger copy trades for active subscriptions
 */
export async function copyTradingMonitorWorkflow(params: {
  traderId: string;
  orderId: string;
}): Promise<{ copiesTriggered: number }> {
  // TODO: Query active subscriptions for this trader
  // For now, return 0 as placeholder
  
  return { copiesTriggered: 0 };
}

// ============================================================================
// FRAUD DETECTION WORKFLOW
// ============================================================================

export interface FraudDetectionWorkflowParams {
  userId: string;
  checkTypes?: Array<
    "wash_trading" | "front_running" | "unusual_volume" | "performance_manipulation"
  >;
}

/**
 * Run fraud detection checks on a user
 */
export async function fraudDetectionWorkflow(
  params: FraudDetectionWorkflowParams
): Promise<{
  alertsGenerated: number;
  checksCompleted: number;
}> {
  const checkTypes = params.checkTypes || [
    "wash_trading",
    "front_running",
    "unusual_volume",
    "performance_manipulation",
  ];

  let alertsGenerated = 0;
  let checksCompleted = 0;

  for (const checkType of checkTypes) {
    try {
      let alert = null;

      switch (checkType) {
        case "wash_trading":
          alert = await detectWashTrading(params.userId);
          break;
        case "front_running":
          alert = await detectFrontRunning(params.userId);
          break;
        case "unusual_volume":
          alert = await detectUnusualVolume(params.userId);
          break;
        case "performance_manipulation":
          alert = await detectPerformanceManipulation(params.userId);
          break;
      }

      if (alert) {
        await saveFraudAlert(alert);
        alertsGenerated++;
      }

      checksCompleted++;
    } catch (error) {
      console.error(`Failed to run ${checkType} check for user ${params.userId}:`, error);
    }

    // Small delay between checks
    await sleep("500ms");
  }

  return { alertsGenerated, checksCompleted };
}

/**
 * Scheduled batch fraud detection for all traders
 */
export async function batchFraudDetectionWorkflow(params: {
  userIds: string[];
}): Promise<{
  processed: number;
  totalAlerts: number;
}> {
  let processed = 0;
  let totalAlerts = 0;

  for (const userId of params.userIds) {
    try {
      const result = await fraudDetectionWorkflow({ userId });
      totalAlerts += result.alertsGenerated;
      processed++;
    } catch (error) {
      console.error(`Failed fraud detection for user ${userId}:`, error);
    }

    // Delay to avoid overwhelming the system
    await sleep("1s");
  }

  return { processed, totalAlerts };
}

// ============================================================================
// REPUTATION CALCULATION WORKFLOW
// ============================================================================

export interface ReputationWorkflowParams {
  userId: string;
  recalculateStats?: boolean;
}

/**
 * Calculate and update trader reputation
 */
export async function calculateReputationWorkflow(
  params: ReputationWorkflowParams
): Promise<{
  success: boolean;
  tier?: string;
  overallScore?: number;
  error?: string;
}> {
  try {
    // Optionally recalculate stats first
    if (params.recalculateStats) {
      const now = Date.now();
      await calculateTraderStats(
        params.userId,
        "all_time",
        0,
        now
      );
    }

    // Calculate reputation
    const reputation = await calculateReputation(params.userId);

    // Save reputation
    await saveReputation(reputation);

    return {
      success: true,
      tier: reputation.tier,
      overallScore: reputation.overallScore,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Batch reputation calculation
 */
export async function batchReputationWorkflow(params: {
  userIds: string[];
}): Promise<{
  processed: number;
  failed: number;
}> {
  let processed = 0;
  let failed = 0;

  for (const userId of params.userIds) {
    try {
      await calculateReputationWorkflow({ userId });
      processed++;
    } catch (error) {
      console.error(`Failed reputation calculation for user ${userId}:`, error);
      failed++;
    }

    await sleep("100ms");
  }

  return { processed, failed };
}

// ============================================================================
// LEADERBOARD WORKFLOW
// ============================================================================

export interface LeaderboardWorkflowParams {
  leaderboardType:
    | "pnl"
    | "pnl_percent"
    | "sharpe_ratio"
    | "win_rate"
    | "total_trades"
    | "followers"
    | "copiers"
    | "reputation";
  period: "daily" | "weekly" | "monthly" | "all_time";
  periodStart: number;
  periodEnd: number;
  assetClass?: string;
}

/**
 * Generate leaderboard snapshot
 */
export async function generateLeaderboardWorkflow(
  params: LeaderboardWorkflowParams
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await generateLeaderboardSnapshot(
      params.leaderboardType,
      params.period,
      params.periodStart,
      params.periodEnd
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Scheduled leaderboard generation for all types and periods
 */
export async function scheduledLeaderboardWorkflow(): Promise<{
  generated: number;
  failed: number;
}> {
  const now = Date.now();
  const types: LeaderboardWorkflowParams["leaderboardType"][] = [
    "pnl_percent",
    "sharpe_ratio",
    "win_rate",
    "reputation",
  ];
  const periods: LeaderboardWorkflowParams["period"][] = ["daily", "weekly", "monthly", "all_time"];

  let generated = 0;
  let failed = 0;

  for (const type of types) {
    for (const period of periods) {
      try {
        const { periodStart, periodEnd } = getPeriodRange(period, now);
        
        await generateLeaderboardWorkflow({
          leaderboardType: type,
          period,
          periodStart,
          periodEnd,
        });
        
        generated++;
      } catch (error) {
        console.error(`Failed to generate leaderboard ${type}-${period}:`, error);
        failed++;
      }

      await sleep("500ms");
    }
  }

  return { generated, failed };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPeriodRange(
  period: "daily" | "weekly" | "monthly" | "all_time",
  now: number
): { periodStart: number; periodEnd: number } {
  const endTime = now;
  let startTime: number;

  switch (period) {
    case "daily":
      startTime = now - 24 * 60 * 60 * 1000; // 1 day
      break;
    case "weekly":
      startTime = now - 7 * 24 * 60 * 60 * 1000; // 7 days
      break;
    case "monthly":
      startTime = now - 30 * 24 * 60 * 60 * 1000; // 30 days
      break;
    case "all_time":
      startTime = 0;
      break;
  }

  return { periodStart: startTime, periodEnd: endTime };
}
