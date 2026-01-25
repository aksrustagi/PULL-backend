/**
 * Copy Trade Workflow
 * Handles the execution of a copy trade from a trader's position
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
  CancellationScope,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import type { AssetClass, CopyTradingSubscription } from "@pull/types";

// Activity proxies with retry policies
const {
  getSubscription,
  validateCopyTrade,
  calculateCopyQuantity,
  executeCopyOrder,
  updateCopyTrade,
  chargeCopyFees,
  sendCopyTradeNotification,
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

// Workflow input type
export interface CopyTradeInput {
  subscriptionId: string;
  copierId: string;
  traderId: string;
  originalOrderId: string;
  originalTradeId?: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  assetClass: AssetClass;
}

// Copy trade status
export interface CopyTradeStatus {
  copyTradeId?: string;
  status:
    | "pending"
    | "validating"
    | "calculating"
    | "executing"
    | "filled"
    | "partial_fill"
    | "failed"
    | "skipped"
    | "cancelled";
  copyQuantity: number;
  copyPrice?: number;
  copyOrderId?: string;
  skipReason?: string;
  failureReason?: string;
  fees?: {
    copyFee: number;
    platformFee: number;
  };
}

// Signals
export const cancelCopyTradeSignal = defineSignal("cancelCopyTrade");

// Queries
export const getCopyTradeStatusQuery = defineQuery<CopyTradeStatus>("getCopyTradeStatus");

/**
 * Copy Trade Workflow
 * Executes a copy trade based on a trader's original trade
 */
export async function copyTradeWorkflow(input: CopyTradeInput): Promise<{
  copyTradeId: string;
  status: CopyTradeStatus;
}> {
  const {
    subscriptionId,
    copierId,
    traderId,
    originalOrderId,
    originalTradeId,
    symbol,
    side,
    quantity,
    price,
    assetClass,
  } = input;

  const copyTradeId = `ct_${crypto.randomUUID()}`;

  // Initialize status
  const status: CopyTradeStatus = {
    copyTradeId,
    status: "pending",
    copyQuantity: 0,
  };

  let isCancelled = false;

  // Set up query handler
  setHandler(getCopyTradeStatusQuery, () => status);

  // Set up cancellation signal handler
  setHandler(cancelCopyTradeSignal, () => {
    isCancelled = true;
  });

  try {
    // =========================================================================
    // Step 1: Get subscription and validate
    // =========================================================================
    status.status = "validating";

    await recordAuditLog({
      userId: copierId,
      action: "copy_trade_started",
      resourceType: "copy_trade",
      resourceId: copyTradeId,
      metadata: {
        traderId,
        symbol,
        side,
        originalQuantity: quantity,
        originalPrice: price,
      },
    });

    const subscription = await getSubscription(subscriptionId);

    // Check subscription is active
    if (subscription.status !== "active") {
      status.status = "skipped";
      status.skipReason = "Subscription not active";
      await updateCopyTrade(copyTradeId, {
        status: "skipped",
        skipReason: status.skipReason,
      });
      return { copyTradeId, status };
    }

    // Validate the trade
    const validation = await validateCopyTrade({
      subscription,
      symbol,
      assetClass,
      tradeValue: quantity * price,
    });

    if (!validation.valid) {
      status.status = "skipped";
      status.skipReason = validation.skipReason;

      await updateCopyTrade(copyTradeId, {
        status: "skipped",
        skipReason: validation.skipReason,
      });

      await recordAuditLog({
        userId: copierId,
        action: "copy_trade_skipped",
        resourceType: "copy_trade",
        resourceId: copyTradeId,
        metadata: { skipReason: validation.skipReason },
      });

      return { copyTradeId, status };
    }

    // =========================================================================
    // Step 2: Apply copy delay if configured
    // =========================================================================
    if (subscription.copyDelaySeconds > 0) {
      await sleep(`${subscription.copyDelaySeconds} seconds`);
    }

    // Check for cancellation
    if (isCancelled) {
      status.status = "cancelled";
      await updateCopyTrade(copyTradeId, { status: "cancelled" });
      return { copyTradeId, status };
    }

    // =========================================================================
    // Step 3: Calculate copy quantity
    // =========================================================================
    status.status = "calculating";

    const copyQuantity = await calculateCopyQuantity({
      subscription,
      originalQuantity: quantity,
      originalPrice: price,
    });

    if (copyQuantity <= 0) {
      status.status = "skipped";
      status.skipReason = "Copy quantity too small";
      await updateCopyTrade(copyTradeId, {
        status: "skipped",
        skipReason: status.skipReason,
      });
      return { copyTradeId, status };
    }

    status.copyQuantity = copyQuantity;

    // =========================================================================
    // Step 4: Execute copy order
    // =========================================================================
    if (isCancelled) {
      status.status = "cancelled";
      await updateCopyTrade(copyTradeId, { status: "cancelled" });
      return { copyTradeId, status };
    }

    status.status = "executing";

    const execution = await CancellationScope.nonCancellable(async () => {
      return executeCopyOrder({
        copierId,
        copyTradeId,
        symbol,
        side,
        quantity: copyQuantity,
        traderId,
      });
    });

    status.copyOrderId = execution.orderId;
    status.copyPrice = execution.fillPrice;

    if (execution.status === "filled") {
      status.status = "filled";
    } else if (execution.status === "partial_fill") {
      status.status = "partial_fill";
    } else {
      status.status = "failed";
      status.failureReason = "Order execution failed";
    }

    // =========================================================================
    // Step 5: Calculate and charge fees
    // =========================================================================
    if (status.status === "filled" || status.status === "partial_fill") {
      const tradeValue = status.copyQuantity * (status.copyPrice ?? price);

      // Get trader profile for fee rates
      const profile = await getSubscription(subscriptionId).then((s) => ({
        copyTradingFee: s.copyMode === "fixed_amount" ? 0.5 : 1, // Placeholder
      }));

      const fees = await chargeCopyFees({
        copyTradeId,
        copierId,
        traderId,
        tradeValue,
        copyTradingFee: profile.copyTradingFee,
      });

      status.fees = fees;
    }

    // =========================================================================
    // Step 6: Update copy trade record and send notification
    // =========================================================================
    await updateCopyTrade(copyTradeId, {
      status: status.status,
      copyOrderId: status.copyOrderId,
      copyPrice: status.copyPrice,
      copyQuantity: status.copyQuantity,
      copyFee: status.fees?.copyFee ?? 0,
      performanceFee: 0,
      copyExecutedAt: new Date(),
    });

    await sendCopyTradeNotification({
      copierId,
      traderId,
      symbol,
      side,
      quantity: status.copyQuantity,
      status: status.status,
    });

    await recordAuditLog({
      userId: copierId,
      action: "copy_trade_completed",
      resourceType: "copy_trade",
      resourceId: copyTradeId,
      metadata: {
        status: status.status,
        copyQuantity: status.copyQuantity,
        copyPrice: status.copyPrice,
        fees: status.fees,
      },
    });

    return { copyTradeId, status };
  } catch (error) {
    status.status = "failed";
    status.failureReason = error instanceof Error ? error.message : String(error);

    await updateCopyTrade(copyTradeId, {
      status: "failed",
      failureReason: status.failureReason,
    });

    await recordAuditLog({
      userId: copierId,
      action: "copy_trade_failed",
      resourceType: "copy_trade",
      resourceId: copyTradeId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}

/**
 * Batch Copy Trade Workflow
 * Processes copy trades for multiple subscribers of a trader
 */
export interface BatchCopyTradeInput {
  traderId: string;
  originalOrderId: string;
  originalTradeId?: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  assetClass: AssetClass;
  subscriptionIds: string[];
}

export async function batchCopyTradeWorkflow(input: BatchCopyTradeInput): Promise<{
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}> {
  const {
    traderId,
    originalOrderId,
    originalTradeId,
    symbol,
    side,
    quantity,
    price,
    assetClass,
    subscriptionIds,
  } = input;

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Process each subscription sequentially to avoid overwhelming the system
  for (const subscriptionId of subscriptionIds) {
    try {
      const subscription = await getSubscription(subscriptionId);

      const result = await copyTradeWorkflow({
        subscriptionId,
        copierId: subscription.copierId,
        traderId,
        originalOrderId,
        originalTradeId,
        symbol,
        side,
        quantity,
        price,
        assetClass,
      });

      processed++;

      if (result.status.status === "filled" || result.status.status === "partial_fill") {
        successful++;
      } else if (result.status.status === "skipped") {
        skipped++;
      } else {
        failed++;
      }
    } catch (error) {
      processed++;
      failed++;
    }

    // Small delay between copies to spread load
    await sleep("100 milliseconds");
  }

  await recordAuditLog({
    action: "batch_copy_trade_completed",
    resourceType: "batch_copy_trade",
    resourceId: originalOrderId,
    metadata: { processed, successful, failed, skipped },
  });

  return { processed, successful, failed, skipped };
}
