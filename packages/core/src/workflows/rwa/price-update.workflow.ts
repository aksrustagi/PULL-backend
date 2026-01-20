/**
 * Price Update Workflow
 * Scheduled workflow to update RWA asset valuations
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
  getAllActiveAssets,
  fetchPriceFromPriceTracker,
  updateAssetValuation,
  detectPriceMovement,
  sendPriceAlerts,
  recordPriceHistory,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Batch processing activities
const { fetchBatchPrices } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Configuration
const SIGNIFICANT_PRICE_CHANGE_THRESHOLD = 0.1; // 10%
const BATCH_SIZE = 50;

// Price update status type
export interface PriceUpdateStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  totalAssets: number;
  processedAssets: number;
  updatedAssets: number;
  significantChanges: number;
  errors: Array<{ assetId: string; error: string }>;
  startedAt: string;
  completedAt?: string;
}

// Queries
export const getPriceUpdateStatusQuery = defineQuery<PriceUpdateStatus>("getPriceUpdateStatus");

/**
 * Price Update Workflow (Scheduled)
 */
export async function priceUpdateWorkflow(): Promise<PriceUpdateStatus> {
  // Generate run ID
  const runId = `price_update_${Date.now()}`;

  // Initialize status
  const status: PriceUpdateStatus = {
    runId,
    status: "running",
    totalAssets: 0,
    processedAssets: 0,
    updatedAssets: 0,
    significantChanges: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };

  // Set up query handler
  setHandler(getPriceUpdateStatusQuery, () => status);

  try {
    // Log run start
    await recordAuditLog({
      userId: "system",
      action: "price_update_started",
      resourceType: "price_update",
      resourceId: runId,
      metadata: {},
    });

    // =========================================================================
    // Step 1: Get all active assets
    // =========================================================================
    const assets = await getAllActiveAssets();
    status.totalAssets = assets.length;

    if (assets.length === 0) {
      status.status = "completed";
      status.completedAt = new Date().toISOString();
      return status;
    }

    // =========================================================================
    // Step 2: Process assets in batches
    // =========================================================================
    const alertsToSend: Array<{
      userId: string;
      assetId: string;
      assetName: string;
      previousPrice: number;
      newPrice: number;
      changePercent: number;
    }> = [];

    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
      const batch = assets.slice(i, i + BATCH_SIZE);

      // Fetch prices for batch
      const priceResults = await fetchBatchPrices(
        batch.map((a) => ({
          assetId: a.assetId,
          cardName: a.name,
          grade: a.grade,
          gradingCompany: a.gradingCompany,
          year: a.year,
          setName: a.setName,
        }))
      );

      // Process each result
      for (const result of priceResults) {
        try {
          const asset = batch.find((a) => a.assetId === result.assetId);
          if (!asset) continue;

          if (result.error) {
            status.errors.push({
              assetId: result.assetId,
              error: result.error,
            });
            continue;
          }

          if (result.price === null || result.price === undefined) {
            continue;
          }

          // Calculate price change
          const previousPrice = asset.currentPrice;
          const newPrice = result.price;
          const changePercent = previousPrice > 0
            ? (newPrice - previousPrice) / previousPrice
            : 0;

          // Update asset valuation
          await updateAssetValuation(result.assetId, newPrice, {
            source: result.source,
            timestamp: new Date().toISOString(),
            previousPrice,
            changePercent,
          });

          // Record price history
          await recordPriceHistory({
            assetId: result.assetId,
            price: newPrice,
            source: result.source,
            timestamp: new Date().toISOString(),
          });

          status.updatedAssets++;

          // Check for significant price movement
          if (Math.abs(changePercent) >= SIGNIFICANT_PRICE_CHANGE_THRESHOLD) {
            status.significantChanges++;

            // Detect price movement and get affected users
            const affectedUsers = await detectPriceMovement(result.assetId);

            for (const userId of affectedUsers) {
              alertsToSend.push({
                userId,
                assetId: result.assetId,
                assetName: asset.name,
                previousPrice,
                newPrice,
                changePercent,
              });
            }
          }
        } catch (error) {
          status.errors.push({
            assetId: result.assetId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        status.processedAssets++;
      }

      // Small delay between batches to avoid rate limiting
      await sleep("1 second");
    }

    // =========================================================================
    // Step 3: Send price alerts
    // =========================================================================
    if (alertsToSend.length > 0) {
      await sendPriceAlerts(alertsToSend);
    }

    // =========================================================================
    // Step 4: Finalize
    // =========================================================================
    status.status = "completed";
    status.completedAt = new Date().toISOString();

    await recordAuditLog({
      userId: "system",
      action: "price_update_completed",
      resourceType: "price_update",
      resourceId: runId,
      metadata: {
        totalAssets: status.totalAssets,
        updatedAssets: status.updatedAssets,
        significantChanges: status.significantChanges,
        errors: status.errors.length,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: "system",
      action: "price_update_failed",
      resourceType: "price_update",
      resourceId: runId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        processedAssets: status.processedAssets,
      },
    });

    throw error;
  }
}
