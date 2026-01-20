/**
 * Detect Fraud Workflow
 * Scheduled workflow to detect suspicious trading activity
 * Runs every 6 hours
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getAllActiveTraders,
  detectWashTrading,
  detectCircularCopying,
  detectPumpAndDump,
  detectFakeFollowers,
  recordFraudFlag,
  disableCopyFeatures,
  sendFraudAlert,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Longer timeout for batch fraud analysis
const { analyzeUserTradesForFraud } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
    maximumInterval: "1 minute",
  },
});

// Fraud detection thresholds
const THRESHOLDS = {
  washTrading: {
    minOccurrences: 3, // Min self-trades in period
    lookbackDays: 7,
  },
  circularCopying: {
    maxChainLength: 2, // A copies B copies A
  },
  pumpAndDump: {
    positionSizeMultiple: 10, // Unusual position size increase
    priceImpactPercent: 5, // Price movement after position
    followerGainThreshold: 50, // New followers gained
  },
  fakeFollowers: {
    inactiveFollowerPercent: 80, // % of followers with no trades
    minFollowers: 100, // Min followers to check
    accountAgeMinDays: 7, // Min account age to count as real
  },
};

// Input types
export interface DetectFraudInput {
  userId?: string; // Specific user or undefined for all
}

export interface FraudDetection {
  userId: string;
  type: "wash_trading" | "circular_copying" | "pump_and_dump" | "fake_followers";
  severity: "low" | "medium" | "high" | "critical";
  evidence: Record<string, unknown>;
  detectedAt: string;
}

export interface DetectFraudStatus {
  status: "initializing" | "scanning" | "analyzing" | "completed" | "failed";
  processedUsers: number;
  totalUsers: number;
  detections: FraudDetection[];
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
}

// Queries
export const getFraudDetectionStatus = defineQuery<DetectFraudStatus>(
  "getFraudDetectionStatus"
);

/**
 * Detect Fraud Workflow
 * Scans for various types of fraudulent activity
 */
export async function detectFraudWorkflow(
  input: DetectFraudInput
): Promise<DetectFraudStatus> {
  const { userId } = input;

  // Initialize status
  const status: DetectFraudStatus = {
    status: "initializing",
    processedUsers: 0,
    totalUsers: 0,
    detections: [],
    startedAt: new Date().toISOString(),
  };

  // Set up query handler
  setHandler(getFraudDetectionStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Get list of users to scan
    // =========================================================================
    let userIds: string[];

    if (userId) {
      userIds = [userId];
    } else {
      // Get all active traders and users with copiers
      userIds = await getAllActiveTraders();
    }

    status.totalUsers = userIds.length;
    status.status = "scanning";

    if (userIds.length === 0) {
      status.status = "completed";
      status.completedAt = new Date().toISOString();
      return status;
    }

    // Log fraud detection run start
    await recordAuditLog({
      userId: "system",
      action: "fraud_detection_started",
      resourceType: "fraud_detection",
      resourceId: new Date().toISOString(),
      metadata: {
        targetUser: userId ?? "all",
        totalUsers: userIds.length,
      },
    });

    // =========================================================================
    // Step 2: Scan for wash trading
    // =========================================================================
    status.status = "analyzing";
    const washTradingDetections: FraudDetection[] = [];

    // Process in batches
    const BATCH_SIZE = 25;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (traderId) => {
          try {
            const washTradingResult = await detectWashTrading(
              traderId,
              THRESHOLDS.washTrading.lookbackDays
            );

            if (
              washTradingResult.detected &&
              washTradingResult.occurrences >= THRESHOLDS.washTrading.minOccurrences
            ) {
              // Determine severity based on occurrences
              let severity: "low" | "medium" | "high" | "critical" = "low";
              if (washTradingResult.occurrences >= 10) severity = "critical";
              else if (washTradingResult.occurrences >= 7) severity = "high";
              else if (washTradingResult.occurrences >= 5) severity = "medium";

              const detection: FraudDetection = {
                userId: traderId,
                type: "wash_trading",
                severity,
                evidence: {
                  occurrences: washTradingResult.occurrences,
                  trades: washTradingResult.suspiciousTrades,
                  totalVolume: washTradingResult.totalVolume,
                },
                detectedAt: new Date().toISOString(),
              };

              washTradingDetections.push(detection);

              // Record in database
              await recordFraudFlag({
                userId: traderId,
                type: "wash_trading",
                severity,
                evidence: detection.evidence,
              });

              // Auto-disable copy features for critical
              if (severity === "critical") {
                await disableCopyFeatures(traderId);
                await sendFraudAlert({
                  type: "wash_trading",
                  userId: traderId,
                  severity,
                  evidence: detection.evidence,
                });
              }
            }

            status.processedUsers++;
          } catch (error) {
            console.error(`Wash trading detection failed for ${traderId}:`, error);
            status.processedUsers++;
          }
        })
      );

      // Small delay between batches
      if (i + BATCH_SIZE < userIds.length) {
        await sleep("200 milliseconds");
      }
    }

    status.detections.push(...washTradingDetections);

    // =========================================================================
    // Step 3: Scan for circular copying
    // =========================================================================
    const circularCopyDetections: FraudDetection[] = [];

    // Reset counter for this scan
    status.processedUsers = 0;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (traderId) => {
          try {
            const circularResult = await detectCircularCopying(
              traderId,
              THRESHOLDS.circularCopying.maxChainLength
            );

            if (circularResult.detected) {
              const detection: FraudDetection = {
                userId: traderId,
                type: "circular_copying",
                severity: "high", // Circular copying is always high severity
                evidence: {
                  chains: circularResult.chains,
                  involvedUsers: circularResult.involvedUsers,
                },
                detectedAt: new Date().toISOString(),
              };

              circularCopyDetections.push(detection);

              await recordFraudFlag({
                userId: traderId,
                type: "circular_copying",
                severity: "high",
                evidence: detection.evidence,
              });

              // Disable copy features for all involved users
              for (const involvedUser of circularResult.involvedUsers) {
                await disableCopyFeatures(involvedUser);
              }

              await sendFraudAlert({
                type: "circular_copying",
                userId: traderId,
                severity: "high",
                evidence: detection.evidence,
              });
            }

            status.processedUsers++;
          } catch (error) {
            console.error(`Circular copy detection failed for ${traderId}:`, error);
            status.processedUsers++;
          }
        })
      );

      if (i + BATCH_SIZE < userIds.length) {
        await sleep("200 milliseconds");
      }
    }

    status.detections.push(...circularCopyDetections);

    // =========================================================================
    // Step 4: Scan for pump and dump
    // =========================================================================
    const pumpAndDumpDetections: FraudDetection[] = [];
    status.processedUsers = 0;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (traderId) => {
          try {
            const pumpDumpResult = await detectPumpAndDump(traderId, {
              positionSizeMultiple: THRESHOLDS.pumpAndDump.positionSizeMultiple,
              priceImpactPercent: THRESHOLDS.pumpAndDump.priceImpactPercent,
              followerGainThreshold: THRESHOLDS.pumpAndDump.followerGainThreshold,
            });

            if (pumpDumpResult.detected) {
              let severity: "low" | "medium" | "high" | "critical" = "medium";
              if (pumpDumpResult.impactedCopiers > 50) severity = "critical";
              else if (pumpDumpResult.impactedCopiers > 20) severity = "high";

              const detection: FraudDetection = {
                userId: traderId,
                type: "pump_and_dump",
                severity,
                evidence: {
                  suspiciousTrades: pumpDumpResult.suspiciousTrades,
                  priceImpact: pumpDumpResult.priceImpact,
                  followerGain: pumpDumpResult.followerGain,
                  impactedCopiers: pumpDumpResult.impactedCopiers,
                  totalPnL: pumpDumpResult.traderPnL,
                },
                detectedAt: new Date().toISOString(),
              };

              pumpAndDumpDetections.push(detection);

              await recordFraudFlag({
                userId: traderId,
                type: "pump_and_dump",
                severity,
                evidence: detection.evidence,
              });

              if (severity === "critical" || severity === "high") {
                await disableCopyFeatures(traderId);
                await sendFraudAlert({
                  type: "pump_and_dump",
                  userId: traderId,
                  severity,
                  evidence: detection.evidence,
                });
              }
            }

            status.processedUsers++;
          } catch (error) {
            console.error(`Pump and dump detection failed for ${traderId}:`, error);
            status.processedUsers++;
          }
        })
      );

      if (i + BATCH_SIZE < userIds.length) {
        await sleep("200 milliseconds");
      }
    }

    status.detections.push(...pumpAndDumpDetections);

    // =========================================================================
    // Step 5: Scan for fake followers
    // =========================================================================
    const fakeFollowerDetections: FraudDetection[] = [];
    status.processedUsers = 0;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (traderId) => {
          try {
            const fakeFollowerResult = await detectFakeFollowers(traderId, {
              minFollowers: THRESHOLDS.fakeFollowers.minFollowers,
              inactiveThreshold: THRESHOLDS.fakeFollowers.inactiveFollowerPercent,
              minAccountAgeDays: THRESHOLDS.fakeFollowers.accountAgeMinDays,
            });

            if (fakeFollowerResult.detected) {
              let severity: "low" | "medium" | "high" | "critical" = "low";
              if (fakeFollowerResult.fakePercent > 90) severity = "critical";
              else if (fakeFollowerResult.fakePercent > 80) severity = "high";
              else if (fakeFollowerResult.fakePercent > 70) severity = "medium";

              const detection: FraudDetection = {
                userId: traderId,
                type: "fake_followers",
                severity,
                evidence: {
                  totalFollowers: fakeFollowerResult.totalFollowers,
                  fakeFollowers: fakeFollowerResult.fakeFollowers,
                  fakePercent: fakeFollowerResult.fakePercent,
                  suspiciousAccounts: fakeFollowerResult.suspiciousAccounts,
                },
                detectedAt: new Date().toISOString(),
              };

              fakeFollowerDetections.push(detection);

              await recordFraudFlag({
                userId: traderId,
                type: "fake_followers",
                severity,
                evidence: detection.evidence,
              });

              if (severity === "critical") {
                await sendFraudAlert({
                  type: "fake_followers",
                  userId: traderId,
                  severity,
                  evidence: detection.evidence,
                });
              }
            }

            status.processedUsers++;
          } catch (error) {
            console.error(`Fake follower detection failed for ${traderId}:`, error);
            status.processedUsers++;
          }
        })
      );

      if (i + BATCH_SIZE < userIds.length) {
        await sleep("200 milliseconds");
      }
    }

    status.detections.push(...fakeFollowerDetections);

    // =========================================================================
    // Step 6: Complete and log results
    // =========================================================================
    await recordAuditLog({
      userId: "system",
      action: "fraud_detection_completed",
      resourceType: "fraud_detection",
      resourceId: new Date().toISOString(),
      metadata: {
        totalUsers: userIds.length,
        detectionCount: status.detections.length,
        byType: {
          washTrading: washTradingDetections.length,
          circularCopying: circularCopyDetections.length,
          pumpAndDump: pumpAndDumpDetections.length,
          fakeFollowers: fakeFollowerDetections.length,
        },
        bySeverity: {
          critical: status.detections.filter((d) => d.severity === "critical").length,
          high: status.detections.filter((d) => d.severity === "high").length,
          medium: status.detections.filter((d) => d.severity === "medium").length,
          low: status.detections.filter((d) => d.severity === "low").length,
        },
      },
    });

    status.status = "completed";
    status.completedAt = new Date().toISOString();

    return status;
  } catch (error) {
    status.status = "failed";
    status.failureReason = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId: "system",
      action: "fraud_detection_failed",
      resourceType: "fraud_detection",
      resourceId: new Date().toISOString(),
      metadata: {
        error: status.failureReason,
        processedUsers: status.processedUsers,
        totalUsers: status.totalUsers,
      },
    });

    throw ApplicationFailure.nonRetryable(
      `Fraud detection failed: ${status.failureReason}`
    );
  }
}
