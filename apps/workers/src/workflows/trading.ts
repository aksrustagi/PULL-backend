import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";
import type * as activities from "../activities/trading";

const {
  submitOrderToMassive,
  checkOrderStatus,
  cancelOrderWithMassive,
  getOrderFills,
  updateOrderStatus,
  recordTrade,
  updateBalance,
  sendOrderNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

// Signal for order cancellation
export const cancelOrderSignal = defineSignal("cancelOrder");

interface OrderWorkflowParams {
  orderId: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  timeInForce: "day" | "gtc" | "ioc" | "fok";
}

/**
 * Order execution workflow
 */
export async function orderExecutionWorkflow(
  params: OrderWorkflowParams
): Promise<{
  success: boolean;
  status: string;
  filledQuantity: number;
  averagePrice?: number;
}> {
  const { orderId, userId, symbol, side, type, quantity, price, timeInForce } =
    params;

  let cancelled = false;
  let externalOrderId: string | undefined;

  // Set up cancellation signal handler
  setHandler(cancelOrderSignal, () => {
    cancelled = true;
  });

  try {
    // Step 1: Submit order to Massive
    await updateOrderStatus(orderId, "submitted");

    const submission = await submitOrderToMassive(
      orderId,
      symbol,
      side,
      type,
      quantity,
      price
    );

    if (submission.status === "rejected") {
      await updateOrderStatus(orderId, "rejected");
      await sendOrderNotification(userId, orderId, "rejected", {
        reason: submission.message,
      });
      return {
        success: false,
        status: "rejected",
        filledQuantity: 0,
      };
    }

    externalOrderId = submission.externalOrderId;
    await updateOrderStatus(orderId, "accepted", externalOrderId);

    // Step 2: Monitor order for fills
    let filledQuantity = 0;
    let averagePrice: number | undefined;
    let orderComplete = false;

    const maxPolls =
      timeInForce === "day"
        ? 6.5 * 60 // ~6.5 hours market hours
        : timeInForce === "gtc"
          ? 30 * 24 // 30 days
          : 1; // IOC/FOK are immediate

    for (let poll = 0; poll < maxPolls && !orderComplete && !cancelled; poll++) {
      // Check for cancellation
      if (cancelled) {
        break;
      }

      await sleep("10 seconds");

      const status = await checkOrderStatus(externalOrderId);

      if (status.filledQuantity > filledQuantity) {
        // Process new fills
        const fills = await getOrderFills(externalOrderId);

        for (const fill of fills) {
          await recordTrade(orderId, fill);
        }

        filledQuantity = status.filledQuantity;
        averagePrice = status.averagePrice;

        const fillStatus =
          filledQuantity >= quantity ? "filled" : "partial_fill";
        await updateOrderStatus(
          orderId,
          fillStatus,
          externalOrderId,
          filledQuantity,
          averagePrice
        );
      }

      if (
        status.status === "filled" ||
        status.status === "cancelled" ||
        filledQuantity >= quantity
      ) {
        orderComplete = true;
      }
    }

    // Handle cancellation if requested
    if (cancelled && !orderComplete && externalOrderId) {
      try {
        await CancellationScope.nonCancellable(async () => {
          await cancelOrderWithMassive(externalOrderId!);
          await updateOrderStatus(orderId, "cancelled", externalOrderId);
          await sendOrderNotification(userId, orderId, "cancelled", {
            filledQuantity,
          });

          // Release any remaining held funds for unfilled portion
          if (side === "buy" && filledQuantity < quantity) {
            const unfilledAmount = (quantity - filledQuantity) * (price ?? 0);
            await updateBalance(userId, "usd", "USD", unfilledAmount, "release");
          }
        });
      } catch (error) {
        console.error("Error cancelling order:", error);
      }

      return {
        success: filledQuantity > 0,
        status: "cancelled",
        filledQuantity,
        averagePrice,
      };
    }

    // Step 3: Final settlement
    const finalStatus = filledQuantity >= quantity ? "filled" : "partial_fill";
    await updateOrderStatus(
      orderId,
      finalStatus,
      externalOrderId,
      filledQuantity,
      averagePrice
    );

    if (filledQuantity > 0) {
      await sendOrderNotification(userId, orderId, "filled", {
        filledQuantity,
        averagePrice,
      });
    }

    return {
      success: filledQuantity > 0,
      status: finalStatus,
      filledQuantity,
      averagePrice,
    };
  } catch (error) {
    if (isCancellation(error)) {
      // Handle Temporal cancellation
      if (externalOrderId) {
        await cancelOrderWithMassive(externalOrderId);
      }
      await updateOrderStatus(orderId, "cancelled");
      throw error;
    }

    // Handle other errors
    await updateOrderStatus(orderId, "rejected");
    throw error;
  }
}
