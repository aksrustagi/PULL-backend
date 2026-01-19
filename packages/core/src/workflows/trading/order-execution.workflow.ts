/**
 * Order Execution Workflow
 *
 * Handles the complete lifecycle of a trade order:
 * 1. KYC validation
 * 2. Buying power check and hold
 * 3. Order submission to execution venue (Massive API)
 * 4. Order status polling
 * 5. Settlement and balance updates
 * 6. Notification and audit logging
 *
 * Supports cancellation at any point via signals.
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  ApplicationFailure,
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";
import type * as activities from "./activities";

// Activity proxies with appropriate timeouts
const {
  validateKYCStatus,
  checkBuyingPower,
  holdBuyingPower,
  releaseBuyingPower,
  getAssetInfo,
  validateOrderParams,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "500ms",
    maximumInterval: "10 seconds",
  },
});

// Order execution activities with longer timeouts
const {
  submitOrderToMassive,
  pollOrderStatus,
  cancelMassiveOrder,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    maximumAttempts: 5,
    initialInterval: "1 second",
    maximumInterval: "30 seconds",
  },
});

// Settlement activities
const {
  settleOrder,
  updateConvexBalances,
  sendOrderNotification,
  creditTradingPoints,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 5,
  },
});

// =============================================================================
// SIGNALS
// =============================================================================

export const cancelOrderSignal = defineSignal<[{ reason?: string }]>(
  "cancelOrder"
);
export const orderUpdateSignal = defineSignal<
  [{ status: string; filledQuantity: number; avgPrice: number }]
>("orderUpdate");

// =============================================================================
// QUERIES
// =============================================================================

export const getOrderStatusQuery = defineQuery<OrderStatus>("getOrderStatus");

// =============================================================================
// TYPES
// =============================================================================

export interface OrderInput {
  userId: string;
  accountId: string;
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  clientOrderId?: string;
}

export interface OrderStatus {
  orderId: string;
  externalOrderId?: string;
  status:
    | "validating"
    | "pending"
    | "submitted"
    | "partial"
    | "filled"
    | "cancelled"
    | "rejected"
    | "failed";
  filledQuantity: number;
  remainingQuantity: number;
  avgPrice: number;
  fees: number;
  estimatedValue: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  cancelReason?: string;
}

// =============================================================================
// MAIN WORKFLOW
// =============================================================================

export async function OrderExecutionWorkflow(
  input: OrderInput
): Promise<OrderStatus> {
  // Generate order ID
  const orderId = input.clientOrderId || `ORD-${Date.now()}-${randomString(8)}`;

  // Initialize status
  let status: OrderStatus = {
    orderId,
    status: "validating",
    filledQuantity: 0,
    remainingQuantity: input.quantity,
    avgPrice: 0,
    fees: 0,
    estimatedValue: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Cancellation state
  let cancelRequested = false;
  let cancelReason: string | undefined;
  let holdId: string | undefined;

  // Setup signal handlers
  setHandler(cancelOrderSignal, ({ reason }) => {
    cancelRequested = true;
    cancelReason = reason;
  });

  setHandler(orderUpdateSignal, (update) => {
    if (status.status === "submitted" || status.status === "partial") {
      status.filledQuantity = update.filledQuantity;
      status.avgPrice = update.avgPrice;
      status.remainingQuantity = input.quantity - update.filledQuantity;
      status.updatedAt = Date.now();

      if (update.status === "filled") {
        status.status = "filled";
      } else if (update.filledQuantity > 0) {
        status.status = "partial";
      }
    }
  });

  setHandler(getOrderStatusQuery, () => status);

  try {
    // ==========================================================================
    // Step 1: Validate KYC Status
    // ==========================================================================

    await recordAuditLog({
      userId: input.userId,
      orderId,
      event: "order_workflow_started",
      metadata: { input },
    });

    const kycCheck = await validateKYCStatus({
      userId: input.userId,
      assetType: input.assetType,
      tradeValue: input.quantity * (input.limitPrice || 0),
    });

    if (!kycCheck.allowed) {
      status.status = "rejected";
      status.errorMessage = `KYC validation failed: ${kycCheck.reason}`;
      await recordAuditLog({
        userId: input.userId,
        orderId,
        event: "order_rejected_kyc",
        metadata: { reason: kycCheck.reason },
      });
      return status;
    }

    // Check for cancellation
    if (cancelRequested) {
      status.status = "cancelled";
      status.cancelReason = cancelReason;
      return status;
    }

    // ==========================================================================
    // Step 2: Validate Order Parameters
    // ==========================================================================

    const assetInfo = await getAssetInfo({
      assetType: input.assetType,
      assetId: input.assetId,
    });

    const validationResult = await validateOrderParams({
      ...input,
      assetInfo,
    });

    if (!validationResult.valid) {
      status.status = "rejected";
      status.errorMessage = validationResult.error;
      return status;
    }

    // ==========================================================================
    // Step 3: Check and Hold Buying Power
    // ==========================================================================

    status.status = "pending";
    status.updatedAt = Date.now();

    const buyingPowerCheck = await checkBuyingPower({
      userId: input.userId,
      assetType: input.assetType,
      assetId: input.assetId,
      side: input.side,
      quantity: input.quantity,
      limitPrice: input.limitPrice,
      currentPrice: assetInfo.currentPrice,
    });

    if (!buyingPowerCheck.sufficient) {
      status.status = "rejected";
      status.errorMessage = `Insufficient buying power. Required: $${buyingPowerCheck.requiredAmount.toFixed(2)}, Available: $${buyingPowerCheck.availableAmount.toFixed(2)}`;
      await recordAuditLog({
        userId: input.userId,
        orderId,
        event: "order_rejected_insufficient_funds",
        metadata: buyingPowerCheck,
      });
      return status;
    }

    status.estimatedValue = buyingPowerCheck.requiredAmount;

    // Place hold on funds
    const holdResult = await holdBuyingPower({
      userId: input.userId,
      orderId,
      amount: buyingPowerCheck.requiredAmount,
      currency: "USD",
      reason: `Order ${orderId}: ${input.side} ${input.quantity} ${input.symbol}`,
    });

    holdId = holdResult.holdId;

    // Check for cancellation after hold
    if (cancelRequested) {
      await releaseBuyingPower({ holdId });
      status.status = "cancelled";
      status.cancelReason = cancelReason;
      return status;
    }

    // ==========================================================================
    // Step 4: Submit Order to Massive API
    // ==========================================================================

    status.status = "submitted";
    status.updatedAt = Date.now();

    let massiveOrder;
    try {
      massiveOrder = await submitOrderToMassive({
        orderId,
        assetType: input.assetType,
        assetId: input.assetId,
        symbol: input.symbol,
        side: input.side,
        orderType: input.orderType,
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        stopPrice: input.stopPrice,
        timeInForce: input.timeInForce || "day",
      });

      status.externalOrderId = massiveOrder.externalOrderId;
    } catch (error) {
      // Release hold on submission failure
      await releaseBuyingPower({ holdId });
      status.status = "failed";
      status.errorMessage = `Order submission failed: ${error}`;
      return status;
    }

    await recordAuditLog({
      userId: input.userId,
      orderId,
      event: "order_submitted",
      metadata: { externalOrderId: massiveOrder.externalOrderId },
    });

    // ==========================================================================
    // Step 5: Poll for Order Execution
    // ==========================================================================

    const maxPollingTime = 5 * 60 * 1000; // 5 minutes for market orders
    const pollingStartTime = Date.now();

    while (
      (status.status === "submitted" || status.status === "partial") &&
      Date.now() - pollingStartTime < maxPollingTime
    ) {
      // Check for cancellation
      if (cancelRequested) {
        try {
          await cancelMassiveOrder({
            externalOrderId: massiveOrder.externalOrderId,
          });
        } catch (cancelError) {
          // Order may have already filled
          console.log("Cancel attempt failed, checking final status");
        }
        break;
      }

      // Poll order status
      const orderUpdate = await pollOrderStatus({
        externalOrderId: massiveOrder.externalOrderId,
      });

      status.filledQuantity = orderUpdate.filledQuantity;
      status.remainingQuantity = input.quantity - orderUpdate.filledQuantity;
      status.avgPrice = orderUpdate.avgPrice;
      status.fees = orderUpdate.fees;
      status.updatedAt = Date.now();

      if (orderUpdate.status === "filled") {
        status.status = "filled";
        break;
      } else if (orderUpdate.status === "partial") {
        status.status = "partial";
      } else if (
        orderUpdate.status === "cancelled" ||
        orderUpdate.status === "rejected"
      ) {
        status.status = orderUpdate.status;
        status.errorMessage = orderUpdate.rejectReason;
        break;
      }

      // Wait before next poll, but check for cancellation signal
      await Promise.race([
        condition(() => cancelRequested, 1000),
        sleep("1 second"),
      ]);
    }

    // Handle timeout
    if (
      (status.status === "submitted" || status.status === "partial") &&
      Date.now() - pollingStartTime >= maxPollingTime
    ) {
      // For limit orders, this is fine - they stay open
      // For market orders, something is wrong
      if (input.orderType === "market" && status.filledQuantity === 0) {
        status.status = "failed";
        status.errorMessage = "Market order execution timeout";
      }
    }

    // ==========================================================================
    // Step 6: Settlement
    // ==========================================================================

    if (status.status === "filled" || status.status === "partial") {
      // Settle the order
      await settleOrder({
        orderId,
        userId: input.userId,
        assetType: input.assetType,
        assetId: input.assetId,
        symbol: input.symbol,
        side: input.side,
        filledQuantity: status.filledQuantity,
        avgPrice: status.avgPrice,
        fees: status.fees,
      });

      // Update balances in Convex
      const cashDelta =
        input.side === "buy"
          ? -(status.filledQuantity * status.avgPrice + status.fees)
          : status.filledQuantity * status.avgPrice - status.fees;

      await updateConvexBalances({
        userId: input.userId,
        assetType: input.assetType,
        assetId: input.assetId,
        symbol: input.symbol,
        name: assetInfo.name,
        quantityDelta:
          input.side === "buy" ? status.filledQuantity : -status.filledQuantity,
        cashDelta,
        currentPrice: status.avgPrice,
      });

      // Release any unused hold
      if (holdId) {
        await releaseBuyingPower({ holdId });
      }

      // Credit trading points
      await creditTradingPoints({
        userId: input.userId,
        orderId,
        tradeValue: status.filledQuantity * status.avgPrice,
        assetType: input.assetType,
      });

      await recordAuditLog({
        userId: input.userId,
        orderId,
        event: "order_settled",
        metadata: {
          filledQuantity: status.filledQuantity,
          avgPrice: status.avgPrice,
          fees: status.fees,
          cashDelta,
        },
      });
    } else if (status.status === "cancelled") {
      // Release hold on cancellation
      if (holdId) {
        await releaseBuyingPower({ holdId });
      }
      status.cancelReason = cancelReason || "User cancelled";

      await recordAuditLog({
        userId: input.userId,
        orderId,
        event: "order_cancelled",
        metadata: { reason: status.cancelReason },
      });
    } else if (status.status === "rejected" || status.status === "failed") {
      // Release hold on rejection/failure
      if (holdId) {
        await releaseBuyingPower({ holdId });
      }

      await recordAuditLog({
        userId: input.userId,
        orderId,
        event: "order_failed",
        metadata: { error: status.errorMessage },
      });
    }

    // ==========================================================================
    // Step 7: Send Notification
    // ==========================================================================

    const notificationMessage = buildNotificationMessage(input, status);
    await sendOrderNotification({
      userId: input.userId,
      orderId,
      status: status.status,
      message: notificationMessage,
    });

    return status;
  } catch (error) {
    // Handle unexpected errors
    if (holdId) {
      try {
        await releaseBuyingPower({ holdId });
      } catch {
        // Log but don't throw - hold release is best effort
      }
    }

    status.status = "failed";
    status.errorMessage = `Unexpected error: ${error}`;

    await recordAuditLog({
      userId: input.userId,
      orderId,
      event: "order_error",
      metadata: { error: String(error) },
    });

    throw error;
  }
}

// =============================================================================
// BATCH ORDER WORKFLOW
// =============================================================================

export interface BatchOrderInput {
  userId: string;
  accountId: string;
  orders: Omit<OrderInput, "userId" | "accountId">[];
}

export async function BatchOrderWorkflow(
  input: BatchOrderInput
): Promise<OrderStatus[]> {
  const results: OrderStatus[] = [];

  // Execute orders sequentially to avoid race conditions on balance
  for (const order of input.orders) {
    const result = await OrderExecutionWorkflow({
      ...order,
      userId: input.userId,
      accountId: input.accountId,
    });
    results.push(result);

    // If an order fails, continue with remaining orders
    // (user may want partial execution)
  }

  return results;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildNotificationMessage(
  input: OrderInput,
  status: OrderStatus
): string {
  const action = input.side === "buy" ? "Bought" : "Sold";

  switch (status.status) {
    case "filled":
      return `${action} ${status.filledQuantity} ${input.symbol} @ $${status.avgPrice.toFixed(2)}`;
    case "partial":
      return `Partially ${action.toLowerCase()} ${status.filledQuantity}/${input.quantity} ${input.symbol} @ $${status.avgPrice.toFixed(2)}`;
    case "cancelled":
      return `Order cancelled: ${input.side} ${input.quantity} ${input.symbol}`;
    case "rejected":
      return `Order rejected: ${status.errorMessage}`;
    case "failed":
      return `Order failed: ${status.errorMessage}`;
    default:
      return `Order ${status.status}: ${input.side} ${input.quantity} ${input.symbol}`;
  }
}
