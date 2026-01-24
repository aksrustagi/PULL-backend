/**
 * Order Execution Workflow
 * Handles the complete lifecycle of a trading order
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
  uuid4,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  validateKYCStatus,
  checkBuyingPower,
  holdBuyingPower,
  releaseBuyingPower,
  submitOrderToKalshi,
  cancelKalshiOrder,
  settleOrder,
  updateConvexBalances,
  sendOrderNotification,
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

// Activities with longer timeout for order polling
const { pollOrderStatus } = proxyActivities<typeof activities>({
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
  userId: string;
  assetType: "prediction" | "rwa" | "crypto";
  assetId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
}

// Order status type
export interface OrderStatus {
  orderId?: string;
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
    timestamp: string;
  }>;
  failureReason?: string;
  cancellationRequested: boolean;
}

// Signals
export const cancelOrderSignal = defineSignal("cancelOrder");

// Queries
export const getOrderStatusQuery = defineQuery<OrderStatus>("getOrderStatus");

/**
 * Order Execution Workflow
 */
export async function orderExecutionWorkflow(
  input: OrderExecutionInput
): Promise<{ orderId: string; status: OrderStatus }> {
  const { userId, assetType, assetId, side, orderType, quantity, limitPrice } = input;

  // Generate order ID
  const orderId = `ord_${uuid4()}`;

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
    await recordAuditLog({
      userId,
      action: "order_submitted",
      resourceType: "order",
      resourceId: orderId,
      metadata: { assetType, assetId, side, orderType, quantity, limitPrice },
    });

    const kycValidation = await validateKYCStatus(userId, assetType);

    if (!kycValidation.allowed) {
      status.status = "rejected";
      status.failureReason = kycValidation.reason;
      await sendOrderNotification(userId, orderId, "rejected", kycValidation.reason);
      throw ApplicationFailure.nonRetryable(`KYC validation failed: ${kycValidation.reason}`);
    }

    // =========================================================================
    // Step 2: Check and hold buying power
    // =========================================================================
    status.status = "holding_funds";

    const buyingPower = await checkBuyingPower(userId, assetType);
    const estimatedCost = calculateEstimatedCost(side, orderType, quantity, limitPrice);

    if (buyingPower.available < estimatedCost) {
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
      await handleCancellation(userId, orderId, status, hold.holdId, undefined, input);
      return { orderId, status };
    }

    status.status = "submitted";

    const submission = await submitOrderToKalshi({
      userId,
      orderId,
      assetId,
      side,
      orderType,
      quantity,
      limitPrice,
    });

    status.externalOrderId = submission.externalOrderId;
    status.status = "pending";

    await sendOrderNotification(userId, orderId, "submitted");

    // =========================================================================
    // Step 4: Poll for execution (with cancellation support and exponential backoff)
    // =========================================================================
    let orderComplete = false;
    const MAX_POLL_ITERATIONS = 720; // Max ~1 hour of polling
    let pollCount = 0;
    let currentBackoff = 1; // Start with 1 second

    while (!orderComplete && pollCount < MAX_POLL_ITERATIONS) {
      pollCount++;
      // Check for cancellation request
      if (status.cancellationRequested) {
        await handleCancellation(
          userId,
          orderId,
          status,
          hold.holdId,
          submission.externalOrderId,
          input
        );
        return { orderId, status };
      }

      // Poll order status with cancellation scope
      try {
        const pollResult = await CancellationScope.nonCancellable(async () => {
          return pollOrderStatus(submission.externalOrderId);
        });

        // Update fills
        if (pollResult.fills.length > status.fills.length) {
          const newFills = pollResult.fills.slice(status.fills.length);
          status.fills.push(...newFills);

          // Calculate filled quantity and average price
          status.filledQuantity = status.fills.reduce((sum, f) => sum + f.quantity, 0);
          status.remainingQuantity = quantity - status.filledQuantity;

          const totalValue = status.fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
          status.averagePrice = totalValue / status.filledQuantity;
          status.totalCost = totalValue;

          if (status.filledQuantity > 0 && status.filledQuantity < quantity) {
            status.status = "partially_filled";
          }
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
        }
      } catch (error) {
        if (isCancellation(error)) {
          throw error;
        }
        // Continue polling on non-cancellation errors
      }

      if (!orderComplete) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        // Reduces system load while maintaining responsiveness
        const sleepSeconds = Math.min(currentBackoff, 30);
        await sleep(`${sleepSeconds} seconds`);
        currentBackoff = Math.min(currentBackoff * 2, 30);
      }
    }

    // =========================================================================
    // Step 5: Settle order and update balances
    // =========================================================================
    if (status.status === "filled" || status.filledQuantity > 0) {
      // Settle the filled portion
      await settleOrder({
        userId,
        orderId,
        assetId,
        side,
        filledQuantity: status.filledQuantity,
        averagePrice: status.averagePrice!,
        totalCost: status.totalCost!,
      });

      // Update Convex balances
      await updateConvexBalances({
        userId,
        orderId,
        assetId,
        side,
        quantity: status.filledQuantity,
        price: status.averagePrice!,
      });

      // Release unused hold
      const usedAmount = status.totalCost!;
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
    await recordAuditLog({
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

    // Attempt to release any held funds (use orderId-based hold reference)
    if (status.holdAmount) {
      try {
        await releaseBuyingPower(userId, orderId, status.holdAmount);
      } catch {
        // Best-effort release; will be reconciled by the system
      }
    }

    await recordAuditLog({
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

// Helper function to calculate estimated cost
function calculateEstimatedCost(
  side: "buy" | "sell",
  orderType: "market" | "limit",
  quantity: number,
  limitPrice?: number
): number {
  if (side === "sell") {
    return 0; // No funds needed for sell orders (will use position)
  }

  if (orderType === "limit" && limitPrice) {
    return quantity * limitPrice;
  }

  // For market orders, estimate with a buffer
  const estimatedPrice = 0.5; // Default for prediction markets (0-1 range)
  return quantity * estimatedPrice * 1.1; // 10% buffer
}

// Helper function to handle order cancellation
async function handleCancellation(
  userId: string,
  orderId: string,
  status: OrderStatus,
  holdId: string,
  externalOrderId?: string,
  input?: OrderExecutionInput
): Promise<void> {
  status.status = "cancelled";

  // Cancel on exchange if submitted
  if (externalOrderId) {
    await cancelKalshiOrder(externalOrderId);
  }

  // Release any unfilled hold
  if (status.holdAmount) {
    const usedAmount = status.totalCost ?? 0;
    const unusedHold = status.holdAmount - usedAmount;

    if (unusedHold > 0) {
      await releaseBuyingPower(userId, holdId, unusedHold);
    }
  }

  // Settle any partial fills
  if (status.filledQuantity > 0) {
    await settleOrder({
      userId,
      orderId,
      assetId: input?.assetId ?? "",
      side: input?.side ?? "buy",
      filledQuantity: status.filledQuantity,
      averagePrice: status.averagePrice!,
      totalCost: status.totalCost!,
    });
  }

  await sendOrderNotification(userId, orderId, "cancelled");

  await recordAuditLog({
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
