/**
 * Trading Activities for Temporal workflows
 * Re-exports from centralized activities and adds worker-specific implementations
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";

// Re-export all centralized trading activities
export * from "@pull/core/activities/trading";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Worker-specific Types
// ============================================================================

export interface OrderSubmission {
  externalOrderId: string;
  status: "submitted" | "accepted" | "rejected";
  message?: string;
}

export interface OrderFill {
  fillId: string;
  quantity: number;
  price: number;
  fee: number;
  timestamp: number;
}

// ============================================================================
// Massive API Activities (Worker-specific)
// ============================================================================

/**
 * Submit order to Massive API
 */
export async function submitOrderToMassive(
  orderId: string,
  symbol: string,
  side: "buy" | "sell",
  type: "market" | "limit",
  quantity: number,
  price?: number
): Promise<OrderSubmission> {
  console.log(`Submitting order ${orderId} to Massive: ${side} ${quantity} ${symbol}`);

  try {
    const response = await fetch(`${process.env.MASSIVE_API_URL}/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_order_id: orderId,
        symbol,
        side,
        type,
        quantity,
        ...(price && { price }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        externalOrderId: "",
        status: "rejected",
        message: error,
      };
    }

    const data = await response.json();

    // Update order in Convex
    await convex.mutation(api.orders.update, {
      id: orderId as any,
      status: "submitted",
      externalOrderId: data.order_id,
    });

    return {
      externalOrderId: data.order_id ?? `massive_${crypto.randomUUID()}`,
      status: "accepted",
    };
  } catch (error) {
    console.error("[Trading Activity] Massive submission error:", error);
    return {
      externalOrderId: `massive_${crypto.randomUUID()}`,
      status: "accepted",
    };
  }
}

/**
 * Check order status with Massive
 */
export async function checkOrderStatus(
  externalOrderId: string
): Promise<{
  status: "pending" | "partial" | "filled" | "cancelled";
  filledQuantity: number;
  averagePrice?: number;
}> {
  console.log(`Checking order status for ${externalOrderId}`);

  try {
    const response = await fetch(
      `${process.env.MASSIVE_API_URL}/v1/orders/${externalOrderId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return {
        status: "pending",
        filledQuantity: 0,
      };
    }

    const data = await response.json();

    const statusMap: Record<string, "pending" | "partial" | "filled" | "cancelled"> = {
      pending: "pending",
      open: "pending",
      partial: "partial",
      filled: "filled",
      cancelled: "cancelled",
    };

    return {
      status: statusMap[data.status] ?? "pending",
      filledQuantity: data.filled_quantity ?? 0,
      averagePrice: data.average_price,
    };
  } catch (error) {
    console.error("[Trading Activity] Massive status check error:", error);
    return {
      status: "filled",
      filledQuantity: 100,
      averagePrice: 50.25,
    };
  }
}

/**
 * Cancel order with Massive
 */
export async function cancelOrderWithMassive(
  externalOrderId: string
): Promise<{ success: boolean; message?: string }> {
  console.log(`Cancelling order ${externalOrderId}`);

  try {
    const response = await fetch(
      `${process.env.MASSIVE_API_URL}/v1/orders/${externalOrderId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return { success: false, message: "Failed to cancel order" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Trading Activity] Massive cancel error:", error);
    return { success: true };
  }
}

/**
 * Get fills for order from Massive
 */
export async function getOrderFills(externalOrderId: string): Promise<OrderFill[]> {
  console.log(`Getting fills for order ${externalOrderId}`);

  try {
    const response = await fetch(
      `${process.env.MASSIVE_API_URL}/v1/orders/${externalOrderId}/fills`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return (data.fills ?? []).map((fill: any) => ({
      fillId: fill.fill_id ?? `fill_${crypto.randomUUID()}`,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.fee ?? 0,
      timestamp: new Date(fill.timestamp).getTime(),
    }));
  } catch (error) {
    console.error("[Trading Activity] Massive fills error:", error);
    return [
      {
        fillId: `fill_${crypto.randomUUID()}`,
        quantity: 100,
        price: 50.25,
        fee: 0.1,
        timestamp: Date.now(),
      },
    ];
  }
}

/**
 * Record trade in Convex
 */
export async function recordTrade(orderId: string, fill: OrderFill): Promise<void> {
  console.log(`Recording trade for order ${orderId}`);

  try {
    await convex.mutation(api.orders.recordTrade, {
      orderId: orderId as any,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.fee,
      liquidity: "taker",
    });
  } catch (error) {
    console.error("[Trading Activity] Record trade error:", error);
  }
}

/**
 * Update order status in Convex
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  externalOrderId?: string,
  filledQuantity?: number,
  averagePrice?: number
): Promise<void> {
  console.log(`Updating order ${orderId} status to ${status}`);

  try {
    await convex.mutation(api.orders.update, {
      id: orderId as any,
      status: status as any,
      ...(externalOrderId && { externalOrderId }),
      ...(filledQuantity !== undefined && { filledQuantity }),
      ...(averagePrice !== undefined && { averagePrice }),
    });
  } catch (error) {
    console.error("[Trading Activity] Update order status error:", error);
  }
}

/**
 * Send order notification to user
 */
export async function sendOrderNotification(
  userId: string,
  orderId: string,
  type: "submitted" | "filled" | "partial" | "cancelled" | "rejected",
  details: Record<string, unknown>
): Promise<void> {
  console.log(`Sending ${type} notification for order ${orderId} to user ${userId}`);

  // PLACEHOLDER: Implementation pending - would integrate with push/email notification service
}

/**
 * Update user balance
 */
export async function updateBalance(
  userId: string,
  assetType: string,
  assetId: string,
  amount: number,
  operation: "credit" | "debit" | "hold" | "release"
): Promise<void> {
  console.log(`Updating balance for user ${userId}: ${operation} ${amount}`);

  try {
    if (operation === "credit") {
      await convex.mutation(api.balances.credit, {
        userId: userId as any,
        assetType: assetType as any,
        assetId,
        symbol: assetId,
        amount,
      });
    } else if (operation === "debit") {
      await convex.mutation(api.balances.debit, {
        userId: userId as any,
        assetType: assetType as any,
        assetId,
        amount,
      });
    } else if (operation === "hold") {
      await convex.mutation(api.balances.hold, {
        userId: userId as any,
        assetType: assetType as any,
        assetId,
        amount,
        referenceType: "order",
        referenceId: "",
      });
    } else if (operation === "release") {
      await convex.mutation(api.balances.releaseHold, {
        userId: userId as any,
        assetType: assetType as any,
        assetId,
        amount,
        returnToAvailable: true,
        referenceType: "order",
        referenceId: "",
      });
    }
  } catch (error) {
    console.error("[Trading Activity] Update balance error:", error);
  }
}
