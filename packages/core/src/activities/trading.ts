/**
 * Trading Activities
 * Activities for order execution workflows with Convex integration
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { Context } from "@temporalio/activity";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Types
// ============================================================================

export interface KYCValidationResult {
  valid: boolean;
  reason?: string;
}

export interface BuyingPowerResult {
  sufficient: boolean;
  available: number;
  held: number;
  total: number;
}

export interface OrderSubmissionResult {
  externalOrderId: string;
  status: "submitted" | "rejected";
  reason?: string;
}

export interface OrderStatusResult {
  status: "pending" | "partially_filled" | "filled" | "cancelled" | "rejected";
  filled?: number;
  averagePrice?: number;
  reason?: string;
}

export interface OrderFillResult {
  tradeId: string;
  quantity: number;
  price: number;
  fee: number;
}

// ============================================================================
// KYC Validation Activities
// ============================================================================

/**
 * Validate user KYC status for trading
 */
export async function validateUserKYC(userId: string): Promise<KYCValidationResult> {
  console.log(`[Trading Activity] Validating KYC for user ${userId}`);

  try {
    const user = await convex.query(api.users.getById, { id: userId as any });

    if (!user) {
      return { valid: false, reason: "User not found" };
    }

    if (user.status === "suspended") {
      return { valid: false, reason: "Account suspended" };
    }

    if (user.kycTier === "none") {
      return { valid: false, reason: "KYC verification required before trading" };
    }

    if (user.kycStatus !== "approved" && user.kycStatus !== "email_verified") {
      return { valid: false, reason: `KYC status is ${user.kycStatus}. Please complete verification.` };
    }

    return { valid: true };
  } catch (error) {
    console.error("[Trading Activity] KYC validation error:", error);
    return { valid: false, reason: "Failed to validate KYC status" };
  }
}

/**
 * Validate KYC status for specific asset type
 */
export async function validateKYCForAssetType(
  userId: string,
  assetType: "prediction" | "rwa" | "crypto"
): Promise<KYCValidationResult> {
  console.log(`[Trading Activity] Validating KYC for ${userId}, asset type: ${assetType}`);

  const user = await convex.query(api.users.getById, { id: userId as any });

  if (!user) {
    return { valid: false, reason: "User not found" };
  }

  if (user.status === "suspended") {
    return { valid: false, reason: "Account suspended" };
  }

  // Define KYC requirements per asset type
  const kycRequirements: Record<string, string[]> = {
    prediction: ["basic", "verified", "premium", "institutional"],
    rwa: ["verified", "premium", "institutional"],
    crypto: ["basic", "verified", "premium", "institutional"],
  };

  const allowedTiers = kycRequirements[assetType] || [];

  if (!allowedTiers.includes(user.kycTier)) {
    return {
      valid: false,
      reason: `${assetType} trading requires ${allowedTiers[0]} KYC tier or higher. Current tier: ${user.kycTier}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Buying Power Activities
// ============================================================================

/**
 * Check user's buying power for an order
 */
export async function checkBuyingPower(
  userId: string,
  amount: number
): Promise<BuyingPowerResult> {
  console.log(`[Trading Activity] Checking buying power for ${userId}, required: $${amount}`);

  try {
    const balance = await convex.query(api.balances.getBuyingPower, { userId: userId as any });

    return {
      sufficient: balance.available >= amount,
      available: balance.available,
      held: balance.held,
      total: balance.total,
    };
  } catch (error) {
    console.error("[Trading Activity] Buying power check error:", error);
    return {
      sufficient: false,
      available: 0,
      held: 0,
      total: 0,
    };
  }
}

/**
 * Hold buying power for an order
 */
export async function holdBuyingPower(
  userId: string,
  orderId: string,
  amount: number
): Promise<{ holdId: string; amount: number }> {
  console.log(`[Trading Activity] Holding $${amount} for order ${orderId}`);

  await convex.mutation(api.balances.hold, {
    userId: userId as any,
    assetType: "usd",
    assetId: "USD",
    amount,
    referenceType: "order",
    referenceId: orderId,
  });

  return {
    holdId: `hold_${orderId}`,
    amount,
  };
}

/**
 * Release buying power hold
 */
export async function releaseBuyingPower(
  userId: string,
  holdId: string,
  amount: number
): Promise<void> {
  console.log(`[Trading Activity] Releasing $${amount} from hold ${holdId}`);

  // Extract order ID from hold ID if present
  const referenceId = holdId.replace("hold_", "");

  await convex.mutation(api.balances.releaseHold, {
    userId: userId as any,
    assetType: "usd",
    assetId: "USD",
    amount,
    returnToAvailable: true,
    referenceType: "order",
    referenceId,
  });
}

// ============================================================================
// Order Submission Activities
// ============================================================================

/**
 * Submit order to exchange (Massive/Kalshi API)
 */
export async function submitOrderToExchange(orderId: string): Promise<OrderSubmissionResult> {
  console.log(`[Trading Activity] Submitting order ${orderId} to exchange`);

  try {
    // Get order details from Convex
    const order = await convex.query(api.orders.getById, { id: orderId as any });

    if (!order) {
      return {
        externalOrderId: "",
        status: "rejected",
        reason: "Order not found",
      };
    }

    // TODO: Replace with actual Kalshi/Massive API call
    // Example Kalshi API call:
    // const response = await fetch(`${process.env.KALSHI_API_URL}/v2/orders`, {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     ticker: order.symbol,
    //     side: order.side === "buy" ? "yes" : "no",
    //     type: order.type,
    //     count: order.quantity,
    //     ...(order.price && { yes_price: Math.round(order.price * 100) }),
    //   }),
    // });

    // Simulate order submission for now
    const externalOrderId = `EXT-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Update order in Convex with external order ID
    await convex.mutation(api.orders.update, {
      id: orderId as any,
      status: "submitted",
      externalOrderId,
    });

    return {
      externalOrderId,
      status: "submitted",
    };
  } catch (error) {
    console.error("[Trading Activity] Order submission error:", error);
    return {
      externalOrderId: "",
      status: "rejected",
      reason: error instanceof Error ? error.message : "Order submission failed",
    };
  }
}

/**
 * Poll order status from exchange
 */
export async function pollOrderStatus(
  orderId: string,
  externalOrderId: string
): Promise<OrderStatusResult> {
  console.log(`[Trading Activity] Polling order status: ${externalOrderId}`);

  // Heartbeat for long-running activity
  Context.current().heartbeat(`Polling ${externalOrderId}`);

  try {
    // Get order from Convex
    const order = await convex.query(api.orders.getById, { id: orderId as any });

    if (!order) {
      throw new Error("Order not found");
    }

    // TODO: Replace with actual Kalshi/Massive API call
    // const response = await fetch(
    //   `${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}`,
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
    //     },
    //   }
    // );
    // const data = await response.json();

    // Simulate order fill with 80% probability
    const random = Math.random();

    if (random < 0.8) {
      return {
        status: "filled",
        filled: order.quantity,
        averagePrice: order.price ?? 0.5,
      };
    }

    return { status: "pending" };
  } catch (error) {
    console.error("[Trading Activity] Poll order status error:", error);
    return { status: "pending" };
  }
}

/**
 * Get order fills from exchange
 */
export async function getOrderFills(externalOrderId: string): Promise<OrderFillResult[]> {
  console.log(`[Trading Activity] Getting fills for order ${externalOrderId}`);

  // TODO: Replace with actual Kalshi/Massive API call
  // const response = await fetch(
  //   `${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}/fills`,
  //   {
  //     headers: {
  //       Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
  //     },
  //   }
  // );

  // Simulated response
  return [
    {
      tradeId: `fill_${crypto.randomUUID()}`,
      quantity: 100,
      price: 0.5,
      fee: 0.01,
    },
  ];
}

// ============================================================================
// Order Fill Recording Activities
// ============================================================================

/**
 * Record order fill in Convex
 */
export async function recordOrderFill(
  orderId: string,
  quantity: number,
  price: number,
  fee: number
): Promise<string> {
  console.log(`[Trading Activity] Recording fill for order ${orderId}: ${quantity} @ $${price}`);

  try {
    const tradeId = await convex.mutation(api.orders.recordTrade, {
      orderId: orderId as any,
      quantity,
      price,
      fee,
      liquidity: "taker",
    });

    return tradeId;
  } catch (error) {
    console.error("[Trading Activity] Record fill error:", error);
    throw error;
  }
}

/**
 * Update order status in Convex
 */
export async function updateOrderStatus(
  orderId: string,
  status: "pending" | "submitted" | "accepted" | "partial_fill" | "filled" | "cancelled" | "rejected" | "expired",
  externalOrderId?: string,
  filledQuantity?: number,
  averagePrice?: number
): Promise<void> {
  console.log(`[Trading Activity] Updating order ${orderId} status to ${status}`);

  await convex.mutation(api.orders.update, {
    id: orderId as any,
    status,
    externalOrderId,
    filledQuantity,
    averageFilledPrice: averagePrice,
  });
}

// ============================================================================
// Order Cancellation Activities
// ============================================================================

/**
 * Cancel order on exchange
 */
export async function cancelOrderOnExchange(externalOrderId: string): Promise<boolean> {
  console.log(`[Trading Activity] Cancelling order on exchange: ${externalOrderId}`);

  try {
    // TODO: Replace with actual Kalshi/Massive API call
    // await fetch(`${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}`, {
    //   method: "DELETE",
    //   headers: {
    //     Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
    //   },
    // });

    return true;
  } catch (error) {
    console.error("[Trading Activity] Cancel order error:", error);
    return false;
  }
}

/**
 * Cancel order in Convex
 */
export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  console.log(`[Trading Activity] Cancelling order ${orderId}`);

  await convex.mutation(api.orders.cancel, {
    id: orderId as any,
    reason,
  });
}

// ============================================================================
// Balance Update Activities
// ============================================================================

/**
 * Credit user balance
 */
export async function creditUserBalance(
  userId: string,
  assetType: "usd" | "crypto" | "prediction" | "rwa" | "points" | "token",
  assetId: string,
  symbol: string,
  amount: number,
  referenceType?: string,
  referenceId?: string
): Promise<void> {
  console.log(`[Trading Activity] Crediting ${amount} ${symbol} to ${userId}`);

  await convex.mutation(api.balances.credit, {
    userId: userId as any,
    assetType,
    assetId,
    symbol,
    amount,
    referenceType,
    referenceId,
  });
}

/**
 * Debit user balance
 */
export async function debitUserBalance(
  userId: string,
  assetType: "usd" | "crypto" | "prediction" | "rwa" | "points" | "token",
  assetId: string,
  amount: number,
  referenceType?: string,
  referenceId?: string
): Promise<void> {
  console.log(`[Trading Activity] Debiting ${amount} from ${userId}`);

  await convex.mutation(api.balances.debit, {
    userId: userId as any,
    assetType,
    assetId,
    amount,
    referenceType,
    referenceId,
  });
}

// ============================================================================
// Notification Activities
// ============================================================================

/**
 * Send order notification
 */
export async function sendOrderNotification(
  userId: string,
  orderId: string,
  type: "submitted" | "filled" | "cancelled" | "rejected",
  message?: string,
  details?: Record<string, unknown>
): Promise<void> {
  console.log(`[Trading Activity] Sending ${type} notification for order ${orderId}`);

  // TODO: Implement notification sending via push notification service or email
  // Could use Resend for email, Expo for push notifications, etc.

  const notificationMessages: Record<string, string> = {
    submitted: "Your order has been submitted to the exchange.",
    filled: `Your order has been filled${details?.filledQuantity ? ` for ${details.filledQuantity} shares` : ""}.`,
    cancelled: "Your order has been cancelled.",
    rejected: message ?? "Your order was rejected.",
  };

  console.log(`[Trading Activity] Notification: ${notificationMessages[type]}`);
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log for trading action
 */
export async function recordTradingAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Trading Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  // Audit logs are recorded in Convex via the mutation side effects
  // This activity is for explicit audit logging if needed
}
