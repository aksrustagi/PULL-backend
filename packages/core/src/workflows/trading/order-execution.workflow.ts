/**
 * Order Execution Workflow
 * Handles the complete lifecycle of a trading order using new activities
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";

import type * as activities from "../../activities/trading";

// Activity proxies with retry policies
const {
  validateUserKYC,
  validateKYCForAssetType,
  checkBuyingPower,
  holdBuyingPower,
  releaseBuyingPower,
  submitOrderToExchange,
  pollOrderStatus,
  recordOrderFill,
  updateOrderStatus,
  cancelOrderOnExchange,
  sendOrderNotification,
  recordTradingAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Activities with longer timeout for order polling
const pollActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 1.5,
    maximumAttempts: 5,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface OrderExecutionInput {
  orderId: string;
  userId: string;
  assetType: "prediction" | "rwa" | "crypto";
  assetId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  estimatedCost: number;
}

// Order status type
export interface OrderStatus {
  orderId: string;
  externalOrderId?: string;
  status:
    | "validating"
    | "holding_funds"
    | "submitted"
    | "pending"
    | "partially_filled"
    | "filled"
    | "cancelled"
    | "rejected"
    | "failed";
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice?: number;
  totalCost?: number;
  holdAmount?: number;
  fills: Array<{
    quantity: number;
    price: number;
    fee: number;
    timestamp: string;
  }>;
  failureReason?: string;
  cancellationRequested: boolean;
}

// Signals
export const cancelSignal = defineSignal("cancel");
export const cancelOrderSignal = defineSignal("cancelOrder");

// Queries
export const getOrderStatusQuery = defineQuery<OrderStatus>("getOrderStatus");

// Simplified workflow interface for basic use cases
export interface OrderWorkflowInput {
  orderId: string;
  userId: string;
  estimatedCost: number;
}

/**
 * Simplified Order Execution Workflow
 * For basic order execution with KYC validation and buying power check
 */
export async function orderExecutionWorkflow(
  input: OrderWorkflowInput
): Promise<{ success: boolean; message: string }> {
  let cancelled = false;
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  // 1. Validate KYC
  const kycResult = await validateUserKYC(input.userId);
  if (!kycResult.valid) {
    return { success: false, message: kycResult.reason ?? "KYC validation failed" };
  }

  // 2. Check buying power
  const buyingPower = await checkBuyingPower(input.userId, input.estimatedCost);
  if (!buyingPower.sufficient) {
    return { success: false, message: "Insufficient buying power" };
  }

  // Check for cancellation
  if (cancelled) {
    return { success: false, message: "Order cancelled" };
  }

  // 3. Submit to exchange
  const submission = await submitOrderToExchange(input.orderId);

  if (submission.status === "rejected") {
    return { success: false, message: submission.reason ?? "Order rejected by exchange" };
  }

  // 4. Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (attempts < maxAttempts && !cancelled) {
    const status = await pollActivities.pollOrderStatus(input.orderId, submission.externalOrderId);

    if (status.status === "filled" && status.filled) {
      // Record the fill
      await recordOrderFill(input.orderId, status.filled, status.averagePrice ?? 0, 0);
      return { success: true, message: "Order filled" };
    }

    if (status.status === "cancelled" || status.status === "rejected") {
      return { success: false, message: `Order ${status.status}` };
    }

    await sleep("5 seconds");
    attempts++;
  }

  // Cancelled or timed out
  if (cancelled) {
    await cancelOrderOnExchange(submission.externalOrderId);
    return { success: false, message: "Order cancelled by user" };
  }

  return { success: false, message: "Order timed out" };
}

/**
 * Full Order Execution Workflow
 * Complete lifecycle management with detailed status tracking
 */
export async function fullOrderExecutionWorkflow(
  input: OrderExecutionInput
): Promise<{ orderId: string; status: OrderStatus }> {
  const { orderId, userId, assetType, assetId, side, orderType, quantity, limitPrice, estimatedCost } = input;

  // Initialize status
  const status: OrderStatus = {
    orderId,
    status: "validating",
    filledQuantity: 0,
    remainingQuantity: quantity,
    fills: [],
    cancellationRequested: false,
  };

  // Set up query handler
  setHandler(getOrderStatusQuery, () => status);

  // Set up cancellation signal handler
  setHandler(cancelOrderSignal, () => {
    status.cancellationRequested = true;
  });

  try {
    // =========================================================================
    // Step 1: Validate KYC status for trade type
    // =========================================================================
    await recordTradingAuditLog({
      userId,
      action: "order_submitted",
      resourceType: "order",
      resourceId: orderId,
      metadata: { assetType, assetId, side, orderType, quantity, limitPrice },
    });

    const kycValidation = await validateKYCForAssetType(userId, assetType);

    if (!kycValidation.valid) {
      status.status = "rejected";
      status.failureReason = kycValidation.reason;
      await sendOrderNotification(userId, orderId, "rejected", kycValidation.reason);
      throw ApplicationFailure.nonRetryable(`KYC validation failed: ${kycValidation.reason}`);
    }

    // =========================================================================
    // Step 2: Check and hold buying power
    // =========================================================================
    status.status = "holding_funds";

    const buyingPower = await checkBuyingPower(userId, estimatedCost);

    if (!buyingPower.sufficient) {
      status.status = "rejected";
      status.failureReason = "Insufficient buying power";
      await sendOrderNotification(userId, orderId, "rejected", "Insufficient buying power");
      throw ApplicationFailure.nonRetryable("Insufficient buying power");
    }

    // Place hold on funds
    const hold = await holdBuyingPower(userId, orderId, estimatedCost);
    status.holdAmount = hold.amount;

    // =========================================================================
    // Step 3: Submit order to exchange (with cancellation check)
    // =========================================================================
    if (status.cancellationRequested) {
      await handleCancellation(userId, orderId, status, hold.holdId);
      return { orderId, status };
    }

    status.status = "submitted";

    const submission = await submitOrderToExchange(orderId);

    if (submission.status === "rejected") {
      status.status = "rejected";
      status.failureReason = submission.reason;
      await releaseBuyingPower(userId, hold.holdId, hold.amount);
      await sendOrderNotification(userId, orderId, "rejected", submission.reason);
      throw ApplicationFailure.nonRetryable(`Order rejected: ${submission.reason}`);
    }

    status.externalOrderId = submission.externalOrderId;
    status.status = "pending";

    await sendOrderNotification(userId, orderId, "submitted");

    // =========================================================================
    // Step 4: Poll for execution (with cancellation support)
    // =========================================================================
    let orderComplete = false;
    let pollAttempts = 0;
    const maxPollAttempts = 60; // 5 minutes with 5 second intervals

    while (!orderComplete && pollAttempts < maxPollAttempts) {
      // Check for cancellation request
      if (status.cancellationRequested) {
        await handleCancellation(userId, orderId, status, hold.holdId, submission.externalOrderId);
        return { orderId, status };
      }

      // Poll order status with cancellation scope
      try {
        const pollResult = await CancellationScope.nonCancellable(async () => {
          return pollActivities.pollOrderStatus(orderId, submission.externalOrderId);
        });

        // Handle fills
        if (pollResult.status === "filled" && pollResult.filled) {
          status.filledQuantity = pollResult.filled;
          status.remainingQuantity = quantity - pollResult.filled;
          status.averagePrice = pollResult.averagePrice;
          status.totalCost = (pollResult.averagePrice ?? 0) * pollResult.filled;

          // Record the fill
          await recordOrderFill(orderId, pollResult.filled, pollResult.averagePrice ?? 0, 0);

          status.fills.push({
            quantity: pollResult.filled,
            price: pollResult.averagePrice ?? 0,
            fee: 0,
            timestamp: new Date().toISOString(),
          });
        }

        // Check if order is complete
        if (
          pollResult.status === "filled" ||
          pollResult.status === "cancelled" ||
          pollResult.status === "rejected"
        ) {
          status.status = pollResult.status as "filled" | "cancelled" | "rejected";
          orderComplete = true;

          if (pollResult.status === "rejected") {
            status.failureReason = pollResult.reason;
          }
        } else if (pollResult.status === "partially_filled") {
          status.status = "partially_filled";
        }
      } catch (error) {
        if (isCancellation(error)) {
          throw error;
        }
        // Log error but continue polling
        console.error("Poll error:", error);
      }

      if (!orderComplete) {
        // Wait before next poll
        await sleep("5 seconds");
        pollAttempts++;
      }
    }

    // =========================================================================
    // Step 5: Settle order and update balances
    // =========================================================================
    if (status.status === "filled" || status.filledQuantity > 0) {
      // Release unused hold
      const usedAmount = status.totalCost ?? 0;
      const unusedHold = (status.holdAmount ?? 0) - usedAmount;

      if (unusedHold > 0) {
        await releaseBuyingPower(userId, hold.holdId, unusedHold);
      }

      // Send fill notification
      await sendOrderNotification(userId, orderId, "filled", undefined, {
        filledQuantity: status.filledQuantity,
        averagePrice: status.averagePrice,
      });
    } else {
      // Order was cancelled/rejected with no fills - release entire hold
      await releaseBuyingPower(userId, hold.holdId, status.holdAmount!);
      await sendOrderNotification(userId, orderId, status.status, status.failureReason);
    }

    // =========================================================================
    // Step 6: Record audit log
    // =========================================================================
    await recordTradingAuditLog({
      userId,
      action: "order_completed",
      resourceType: "order",
      resourceId: orderId,
      metadata: {
        status: status.status,
        filledQuantity: status.filledQuantity,
        averagePrice: status.averagePrice,
        totalCost: status.totalCost,
      },
    });

    return { orderId, status };
  } catch (error) {
    // Handle workflow failure
    status.status = "failed";
    status.failureReason = error instanceof Error ? error.message : String(error);

    // Attempt to release any held funds
    if (status.holdAmount) {
      try {
        await releaseBuyingPower(userId, `hold_${orderId}`, status.holdAmount);
      } catch (releaseError) {
        console.error("Failed to release hold:", releaseError);
      }
    }

    await recordTradingAuditLog({
      userId,
      action: "order_failed",
      resourceType: "order",
      resourceId: orderId,
      metadata: {
        error: status.failureReason,
      },
    });

    throw error;
  }
}

// Helper function to handle order cancellation
async function handleCancellation(
  userId: string,
  orderId: string,
  status: OrderStatus,
  holdId: string,
  externalOrderId?: string
): Promise<void> {
  status.status = "cancelled";

  // Cancel on exchange if submitted
  if (externalOrderId) {
    await cancelOrderOnExchange(externalOrderId);
  }

  // Release any unfilled hold
  if (status.holdAmount) {
    const usedAmount = status.totalCost ?? 0;
    const unusedHold = status.holdAmount - usedAmount;

    if (unusedHold > 0) {
      await releaseBuyingPower(userId, holdId, unusedHold);
    }
  }

  await sendOrderNotification(userId, orderId, "cancelled");

  await recordTradingAuditLog({
    userId,
    action: "order_cancelled",
    resourceType: "order",
    resourceId: orderId,
    metadata: {
      filledQuantity: status.filledQuantity,
      remainingQuantity: status.remainingQuantity,
    },
  });
}
