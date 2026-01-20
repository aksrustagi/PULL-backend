/**
 * Copy Trade Workflow
 * Executes copy trades when a followed trader places an order
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
  continueAsNew,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getActiveCopiers,
  getTradeDetails,
  checkMarketTypeExcluded,
  calculateCopyPositionSize,
  checkCopierBalance,
  getCopierPortfolioValue,
  recordCopyTrade,
  sendCopyNotification,
  recordAuditLog,
  updateCopySettingsStats,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Execute copy order (may take longer)
const { executeCopierOrder } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "1 minute",
  },
});

// Input types
export interface CopyTradeInput {
  tradeId: string;
  traderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  orderId: string;
  marketType?: string;
}

export interface CopyTradeResult {
  copierId: string;
  status: "executed" | "partial" | "skipped" | "failed";
  copiedQuantity?: number;
  copiedPrice?: number;
  copiedOrderId?: string;
  skipReason?: string;
  error?: string;
}

export interface CopyTradeStatus {
  tradeId: string;
  traderId: string;
  status: "processing" | "completed" | "failed";
  totalCopiers: number;
  processedCopiers: number;
  results: CopyTradeResult[];
  startedAt: string;
  completedAt?: string;
}

// Queries
export const getCopyTradeStatus = defineQuery<CopyTradeStatus>("getCopyTradeStatus");

/**
 * Copy Trade Workflow
 * Processes a trade from a leader to all active copiers
 */
export async function copyTradeWorkflow(
  input: CopyTradeInput
): Promise<CopyTradeStatus> {
  const { tradeId, traderId, symbol, side, quantity, price, orderId, marketType } = input;

  // Initialize status
  const status: CopyTradeStatus = {
    tradeId,
    traderId,
    status: "processing",
    totalCopiers: 0,
    processedCopiers: 0,
    results: [],
    startedAt: new Date().toISOString(),
  };

  // Set up query handler
  setHandler(getCopyTradeStatus, () => status);

  try {
    // =========================================================================
    // Step 1: Get all active copiers of this trader
    // =========================================================================
    const copiers = await getActiveCopiers(traderId);
    status.totalCopiers = copiers.length;

    if (copiers.length === 0) {
      status.status = "completed";
      status.completedAt = new Date().toISOString();
      return status;
    }

    // Log copy trade initiation
    await recordAuditLog({
      userId: traderId,
      action: "copy_trade_initiated",
      resourceType: "trade",
      resourceId: tradeId,
      metadata: {
        symbol,
        side,
        quantity,
        price,
        copierCount: copiers.length,
      },
    });

    // =========================================================================
    // Step 2: Process each copier
    // =========================================================================
    const copyResults: CopyTradeResult[] = [];

    // Process copiers in parallel batches
    const BATCH_SIZE = 10;

    for (let i = 0; i < copiers.length; i += BATCH_SIZE) {
      const batch = copiers.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (copier) => {
          const result: CopyTradeResult = {
            copierId: copier.copierId,
            status: "skipped",
          };

          try {
            // =========================================================
            // Check 1: Market type excluded?
            // =========================================================
            if (marketType && copier.excludeMarketTypes.includes(marketType)) {
              result.status = "skipped";
              result.skipReason = `Market type ${marketType} excluded`;

              // Record skipped copy trade
              await recordCopyTrade({
                copySettingsId: copier.copySettingsId,
                copierId: copier.copierId,
                traderId,
                originalOrderId: orderId,
                symbol,
                side,
                originalQuantity: quantity,
                copiedQuantity: 0,
                originalPrice: price,
                status: "skipped",
                skipReason: result.skipReason,
              });

              return result;
            }

            // =========================================================
            // Check 2: Calculate position size
            // =========================================================
            const portfolioValue = await getCopierPortfolioValue(copier.copierId);
            const targetSize = portfolioValue * (copier.allocationPercent / 100);

            // Calculate how much to copy based on allocation
            let copyQuantity = Math.floor(
              (quantity * targetSize) / (price * quantity)
            );

            // Apply position size limits
            const positionValue = copyQuantity * price;

            if (positionValue < copier.minPositionSize) {
              result.status = "skipped";
              result.skipReason = `Position size ${positionValue} below minimum ${copier.minPositionSize}`;

              await recordCopyTrade({
                copySettingsId: copier.copySettingsId,
                copierId: copier.copierId,
                traderId,
                originalOrderId: orderId,
                symbol,
                side,
                originalQuantity: quantity,
                copiedQuantity: 0,
                originalPrice: price,
                status: "skipped",
                skipReason: result.skipReason,
              });

              return result;
            }

            if (positionValue > copier.maxPositionSize) {
              // Cap at max position size
              copyQuantity = Math.floor(copier.maxPositionSize / price);
            }

            // =========================================================
            // Check 3: Copier balance
            // =========================================================
            const requiredBalance = copyQuantity * price;
            const balanceCheck = await checkCopierBalance(
              copier.copierId,
              requiredBalance
            );

            if (!balanceCheck.sufficient) {
              // Try partial copy if allowed
              if (balanceCheck.available > copier.minPositionSize) {
                copyQuantity = Math.floor(balanceCheck.available / price);
                result.status = "partial";
              } else {
                result.status = "skipped";
                result.skipReason = "Insufficient balance";

                await recordCopyTrade({
                  copySettingsId: copier.copySettingsId,
                  copierId: copier.copierId,
                  traderId,
                  originalOrderId: orderId,
                  symbol,
                  side,
                  originalQuantity: quantity,
                  copiedQuantity: 0,
                  originalPrice: price,
                  status: "skipped",
                  skipReason: result.skipReason,
                });

                return result;
              }
            }

            // =========================================================
            // Step 4: Execute copy order
            // =========================================================
            const orderResult = await executeCopierOrder({
              copierId: copier.copierId,
              symbol,
              side,
              quantity: copyQuantity,
              price, // Use same limit price as original
              originalTradeId: tradeId,
              originalTraderId: traderId,
            });

            if (orderResult.status === "filled" || orderResult.status === "partial_fill") {
              result.status = orderResult.status === "filled" ? "executed" : "partial";
              result.copiedQuantity = orderResult.filledQuantity;
              result.copiedPrice = orderResult.averagePrice;
              result.copiedOrderId = orderResult.orderId;

              // Record successful copy trade
              await recordCopyTrade({
                copySettingsId: copier.copySettingsId,
                copierId: copier.copierId,
                traderId,
                originalOrderId: orderId,
                copiedOrderId: orderResult.orderId,
                symbol,
                side,
                originalQuantity: quantity,
                copiedQuantity: orderResult.filledQuantity,
                originalPrice: price,
                copiedPrice: orderResult.averagePrice,
                status: result.status === "executed" ? "executed" : "partial",
              });

              // Update copy settings stats
              await updateCopySettingsStats(
                copier.copySettingsId,
                orderResult.filledQuantity * orderResult.averagePrice
              );

              // Send notification to copier
              await sendCopyNotification({
                copierId: copier.copierId,
                traderId,
                tradeId,
                symbol,
                side,
                copiedQuantity: orderResult.filledQuantity,
                copiedPrice: orderResult.averagePrice,
              });
            } else {
              result.status = "failed";
              result.error = orderResult.reason ?? "Order execution failed";

              await recordCopyTrade({
                copySettingsId: copier.copySettingsId,
                copierId: copier.copierId,
                traderId,
                originalOrderId: orderId,
                symbol,
                side,
                originalQuantity: quantity,
                copiedQuantity: 0,
                originalPrice: price,
                status: "failed",
                skipReason: result.error,
              });
            }
          } catch (error) {
            result.status = "failed";
            result.error = error instanceof Error ? error.message : String(error);

            // Record failed copy trade
            await recordCopyTrade({
              copySettingsId: copier.copySettingsId,
              copierId: copier.copierId,
              traderId,
              originalOrderId: orderId,
              symbol,
              side,
              originalQuantity: quantity,
              copiedQuantity: 0,
              originalPrice: price,
              status: "failed",
              skipReason: result.error,
            });
          }

          return result;
        })
      );

      copyResults.push(...batchResults);
      status.processedCopiers += batch.length;
      status.results = copyResults;

      // Small delay between batches
      if (i + BATCH_SIZE < copiers.length) {
        await sleep("100 milliseconds");
      }
    }

    // =========================================================================
    // Step 3: Aggregate results
    // =========================================================================
    const successfulCopies = copyResults.filter(
      (r) => r.status === "executed" || r.status === "partial"
    ).length;
    const failedCopies = copyResults.filter((r) => r.status === "failed").length;
    const skippedCopies = copyResults.filter((r) => r.status === "skipped").length;

    // Log completion
    await recordAuditLog({
      userId: traderId,
      action: "copy_trade_completed",
      resourceType: "trade",
      resourceId: tradeId,
      metadata: {
        totalCopiers: copiers.length,
        successfulCopies,
        failedCopies,
        skippedCopies,
      },
    });

    status.status = "completed";
    status.completedAt = new Date().toISOString();

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: traderId,
      action: "copy_trade_failed",
      resourceType: "trade",
      resourceId: tradeId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        processedCopiers: status.processedCopiers,
        totalCopiers: status.totalCopiers,
      },
    });

    throw ApplicationFailure.nonRetryable(
      `Copy trade workflow failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
