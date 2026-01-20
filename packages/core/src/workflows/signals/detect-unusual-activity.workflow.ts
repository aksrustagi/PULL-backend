/**
 * Detect Unusual Activity Workflow
 * Runs every 5 minutes to detect unusual market patterns
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
  fetchActiveMarkets,
  fetchRecentTrades,
  analyzeUnusualActivity,
  classifyTraderBehavior,
  storeSignal,
  sendSignalAlert,
  expireOldSignals,
  recordSignalAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "60 seconds",
  },
});

// Workflow status type
export interface DetectUnusualActivityStatus {
  cycleId: string;
  status: "monitoring" | "analyzing" | "completed";
  lastRunAt: string;
  marketsAnalyzed: number;
  tradesAnalyzed: number;
  signalsGenerated: number;
  signalIds: string[];
  expiredSignals: number;
  consecutiveCycles: number;
}

// Configuration
const MONITORING_INTERVAL_MINUTES = 5;
const TRADE_LOOKBACK_MINUTES = 10;
const SIGNAL_EXPIRY_HOURS = 24;

// Queries
export const getStatusQuery = defineQuery<DetectUnusualActivityStatus>("getStatus");

/**
 * Detect Unusual Activity Workflow
 * Continuously monitors markets for unusual patterns
 */
export async function detectUnusualActivityWorkflow(
  previousCycles: number = 0
): Promise<DetectUnusualActivityStatus> {
  const cycleId = `unusual_activity_${Date.now()}`;

  // Initialize status
  const status: DetectUnusualActivityStatus = {
    cycleId,
    status: "monitoring",
    lastRunAt: new Date().toISOString(),
    marketsAnalyzed: 0,
    tradesAnalyzed: 0,
    signalsGenerated: 0,
    signalIds: [],
    expiredSignals: 0,
    consecutiveCycles: previousCycles + 1,
  };

  // Set up query handler
  setHandler(getStatusQuery, () => status);

  try {
    await recordSignalAuditLog({
      action: "unusual_activity_cycle_started",
      signalId: cycleId,
      signalType: "unusual_activity",
      metadata: { cycle: status.consecutiveCycles },
    });

    // =========================================================================
    // Step 1: Fetch current market data
    // =========================================================================
    status.status = "analyzing";
    const markets = await fetchActiveMarkets();
    status.marketsAnalyzed = markets.length;

    // =========================================================================
    // Step 2: Analyze markets for unusual activity
    // =========================================================================
    if (markets.length > 0) {
      const anomalies = await analyzeUnusualActivity(markets);

      // Store detected anomalies as signals
      for (const anomaly of anomalies) {
        try {
          const signalId = await storeSignal({
            ...anomaly,
            status: "active",
          } as any);

          status.signalsGenerated++;
          status.signalIds.push(signalId);

          // Alert on high/critical anomalies
          if (anomaly.severity === "high" || anomaly.severity === "critical") {
            // In production, notify subscribed users
            await recordSignalAuditLog({
              action: "critical_anomaly_detected",
              signalId,
              signalType: "unusual_activity",
              metadata: {
                market: anomaly.relatedMarkets[0],
                severity: anomaly.severity,
                priceImpact: anomaly.priceImpact,
              },
            });
          }
        } catch (error) {
          console.error("Failed to store anomaly:", error);
        }
      }
    }

    // =========================================================================
    // Step 3: Analyze recent trading patterns
    // =========================================================================
    const recentTrades = await fetchRecentTrades(TRADE_LOOKBACK_MINUTES);
    status.tradesAnalyzed = recentTrades.length;

    // Group trades by user for behavior analysis
    if (recentTrades.length > 0) {
      const tradesByUser = new Map<string, typeof recentTrades>();

      for (const trade of recentTrades) {
        const existing = tradesByUser.get(trade.userId) ?? [];
        existing.push(trade);
        tradesByUser.set(trade.userId, existing);
      }

      // Analyze traders with significant activity
      for (const [userId, trades] of tradesByUser.entries()) {
        if (trades.length >= 5) {
          // Minimum trades for meaningful analysis
          try {
            const behavior = await classifyTraderBehavior(trades);

            // Flag high-risk behavior patterns
            if (behavior.riskLevel === "high" && behavior.confidence > 0.7) {
              const signalId = await storeSignal({
                type: "unusual_activity",
                source: "trader_behavior",
                sourceId: userId,
                title: `High-Risk Trading Pattern: ${behavior.classification}`,
                description: behavior.insights,
                confidence: behavior.confidence,
                severity: "medium",
                relatedMarkets: [...new Set(trades.map((t) => t.symbol))],
                relatedEvents: [],
                aiAnalysis: `Classification: ${behavior.classification}. Patterns: ${behavior.patterns.join(", ")}`,
                aiConfidenceFactors: behavior.patterns,
              });

              status.signalsGenerated++;
              status.signalIds.push(signalId);
            }
          } catch (error) {
            console.error(`Failed to analyze trader ${userId}:`, error);
          }
        }
      }
    }

    // =========================================================================
    // Step 4: Cleanup expired signals
    // =========================================================================
    status.expiredSignals = await expireOldSignals(SIGNAL_EXPIRY_HOURS);

    // =========================================================================
    // Step 5: Complete cycle
    // =========================================================================
    status.status = "completed";
    status.lastRunAt = new Date().toISOString();

    await recordSignalAuditLog({
      action: "unusual_activity_cycle_completed",
      signalId: cycleId,
      signalType: "unusual_activity",
      metadata: {
        marketsAnalyzed: status.marketsAnalyzed,
        tradesAnalyzed: status.tradesAnalyzed,
        signalsGenerated: status.signalsGenerated,
        expiredSignals: status.expiredSignals,
        cycle: status.consecutiveCycles,
      },
    });

    // =========================================================================
    // Step 6: Schedule next run (continue as new)
    // =========================================================================
    await sleep(`${MONITORING_INTERVAL_MINUTES} minutes`);

    // Continue as new workflow to prevent history growth
    await continueAsNew<typeof detectUnusualActivityWorkflow>(status.consecutiveCycles);

    return status;
  } catch (error) {
    await recordSignalAuditLog({
      action: "unusual_activity_cycle_failed",
      signalId: cycleId,
      signalType: "unusual_activity",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        cycle: status.consecutiveCycles,
      },
    });

    // Even on error, continue to next cycle
    await sleep(`${MONITORING_INTERVAL_MINUTES} minutes`);
    await continueAsNew<typeof detectUnusualActivityWorkflow>(status.consecutiveCycles);

    throw error;
  }
}
