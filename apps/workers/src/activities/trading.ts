/**
 * Trading Activities for Temporal workflows
 */

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

  // TODO: Call Massive API
  // const response = await fetch('https://api.massive.com/v1/orders', {...});

  return {
    externalOrderId: `massive_${crypto.randomUUID()}`,
    status: "accepted",
  };
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

  // TODO: Call Massive API

  return {
    status: "filled",
    filledQuantity: 100,
    averagePrice: 50.25,
  };
}

/**
 * Cancel order with Massive
 */
export async function cancelOrderWithMassive(
  externalOrderId: string
): Promise<{ success: boolean; message?: string }> {
  console.log(`Cancelling order ${externalOrderId}`);

  // TODO: Call Massive API

  return { success: true };
}

/**
 * Get fills for order from Massive
 */
export async function getOrderFills(
  externalOrderId: string
): Promise<OrderFill[]> {
  console.log(`Getting fills for order ${externalOrderId}`);

  // TODO: Call Massive API

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

/**
 * Update order in Convex
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  externalOrderId?: string,
  filledQuantity?: number,
  averagePrice?: number
): Promise<void> {
  console.log(`Updating order ${orderId}: status=${status}`);

  // TODO: Call Convex mutation
}

/**
 * Record trade in Convex
 */
export async function recordTrade(
  orderId: string,
  fill: OrderFill
): Promise<void> {
  console.log(`Recording trade for order ${orderId}`);

  // TODO: Call Convex mutation
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

  // TODO: Call Convex mutation
}

/**
 * Send order notification
 */
export async function sendOrderNotification(
  userId: string,
  orderId: string,
  type: "submitted" | "filled" | "cancelled" | "rejected",
  details: Record<string, unknown>
): Promise<void> {
  console.log(`Sending ${type} notification for order ${orderId}`);

  // TODO: Send push notification / email
}
