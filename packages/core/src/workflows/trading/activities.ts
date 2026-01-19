/**
 * Trading Workflow Activities
 *
 * Activities for order execution, balance management,
 * and integration with the Massive API trading system.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

// =============================================================================
// SERVICE CLIENTS
// =============================================================================

let convexClient: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convexClient) {
    convexClient = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convexClient;
}

// =============================================================================
// KYC VALIDATION
// =============================================================================

export interface ValidateKYCStatusInput {
  userId: string;
  assetType: "prediction" | "crypto" | "rwa";
  tradeValue: number;
}

export interface ValidateKYCStatusOutput {
  allowed: boolean;
  reason?: string;
  limits?: {
    daily: number;
    weekly: number;
    remaining: number;
  };
}

export async function validateKYCStatus(
  input: ValidateKYCStatusInput
): Promise<ValidateKYCStatusOutput> {
  const convex = getConvex();

  const user = await convex.query(api.functions.users.getByIdInternal, {
    id: input.userId as any,
  });

  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  if (user.kycStatus !== "approved") {
    return { allowed: false, reason: "KYC verification required" };
  }

  // Define limits by KYC tier
  const tierLimits: Record<string, { daily: number; weekly: number }> = {
    none: { daily: 0, weekly: 0 },
    basic: { daily: 1000, weekly: 5000 },
    enhanced: { daily: 10000, weekly: 50000 },
    accredited: { daily: 100000, weekly: 500000 },
  };

  const limits = tierLimits[user.kycTier];

  // Check asset-specific restrictions
  if (input.assetType === "prediction") {
    if (user.kycTier === "none") {
      return { allowed: false, reason: "KYC required for prediction markets" };
    }
  }

  if (input.assetType === "rwa") {
    if (user.kycTier === "none" || user.kycTier === "basic") {
      return {
        allowed: false,
        reason: "Enhanced KYC required for RWA trading",
      };
    }
  }

  // Check trade value against limits
  if (input.tradeValue > limits.daily) {
    return {
      allowed: false,
      reason: `Trade exceeds daily limit of $${limits.daily}`,
      limits: { ...limits, remaining: limits.daily },
    };
  }

  return {
    allowed: true,
    limits: { ...limits, remaining: limits.daily - input.tradeValue },
  };
}

// =============================================================================
// BUYING POWER
// =============================================================================

export interface CheckBuyingPowerInput {
  userId: string;
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  side: "buy" | "sell";
  quantity: number;
  limitPrice?: number;
  currentPrice: number;
}

export interface CheckBuyingPowerOutput {
  sufficient: boolean;
  requiredAmount: number;
  availableAmount: number;
}

export async function checkBuyingPower(
  input: CheckBuyingPowerInput
): Promise<CheckBuyingPowerOutput> {
  const convex = getConvex();

  // Calculate required amount
  const price = input.limitPrice || input.currentPrice;
  const baseAmount = input.quantity * price;
  const estimatedFees = baseAmount * 0.001; // 0.1% fee estimate
  const requiredAmount =
    input.side === "buy" ? baseAmount + estimatedFees : estimatedFees;

  if (input.side === "buy") {
    // Check cash balance
    const buyingPower = await convex.query(api.functions.balances.getBuyingPower, {
      userId: input.userId as any,
    });

    return {
      sufficient: buyingPower >= requiredAmount,
      requiredAmount,
      availableAmount: buyingPower,
    };
  } else {
    // Check asset balance for selling
    const balance = await convex.query(api.functions.balances.getByUserAsset, {
      userId: input.userId as any,
      assetType: input.assetType,
      assetId: input.assetId,
    });

    const availableQuantity = balance?.available || 0;

    return {
      sufficient: availableQuantity >= input.quantity,
      requiredAmount: input.quantity,
      availableAmount: availableQuantity,
    };
  }
}

export interface HoldBuyingPowerInput {
  userId: string;
  orderId: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface HoldBuyingPowerOutput {
  holdId: string;
}

export async function holdBuyingPower(
  input: HoldBuyingPowerInput
): Promise<HoldBuyingPowerOutput> {
  const convex = getConvex();

  const holdId = await convex.mutation(api.functions.balances.createHold, {
    userId: input.userId as any,
    orderId: input.orderId as any,
    amount: input.amount,
    currency: input.currency,
    reason: input.reason,
  });

  return { holdId };
}

export interface ReleaseBuyingPowerInput {
  holdId: string;
}

export async function releaseBuyingPower(
  input: ReleaseBuyingPowerInput
): Promise<boolean> {
  const convex = getConvex();

  await convex.mutation(api.functions.balances.releaseHold, {
    holdId: input.holdId as any,
  });

  return true;
}

// =============================================================================
// ASSET INFO
// =============================================================================

export interface GetAssetInfoInput {
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
}

export interface GetAssetInfoOutput {
  assetId: string;
  symbol: string;
  name: string;
  currentPrice: number;
  minOrderSize: number;
  maxOrderSize: number;
  priceIncrement: number;
  sizeIncrement: number;
  tradingEnabled: boolean;
}

export async function getAssetInfo(
  input: GetAssetInfoInput
): Promise<GetAssetInfoOutput> {
  // In production, this would fetch from the appropriate data source
  // based on asset type

  if (input.assetType === "prediction") {
    const convex = getConvex();
    const event = await convex.query(api.functions.predictions.getByEventId, {
      eventId: input.assetId,
    });

    if (!event) {
      throw new Error(`Prediction event not found: ${input.assetId}`);
    }

    return {
      assetId: input.assetId,
      symbol: input.assetId,
      name: event.title,
      currentPrice: event.outcomes[0]?.currentPrice || 0.5,
      minOrderSize: 1,
      maxOrderSize: 10000,
      priceIncrement: 0.01,
      sizeIncrement: 1,
      tradingEnabled: event.status === "open",
    };
  }

  if (input.assetType === "rwa") {
    const convex = getConvex();
    const asset = await convex.query(api.functions.rwa.getByAssetId, {
      assetId: input.assetId,
    });

    if (!asset) {
      throw new Error(`RWA asset not found: ${input.assetId}`);
    }

    return {
      assetId: input.assetId,
      symbol: asset.name.slice(0, 10).toUpperCase().replace(/\s/g, ""),
      name: asset.name,
      currentPrice: asset.currentPricePerShare,
      minOrderSize: asset.minPurchaseShares,
      maxOrderSize: asset.availableShares,
      priceIncrement: 0.01,
      sizeIncrement: 1,
      tradingEnabled: asset.status === "active",
    };
  }

  // Crypto - fetch from market data provider
  const response = await fetch(
    `${process.env.MASSIVE_BASE_URL}/v1/assets/${input.assetId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch asset info: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    assetId: data.id,
    symbol: data.symbol,
    name: data.name,
    currentPrice: parseFloat(data.price),
    minOrderSize: parseFloat(data.minOrderSize),
    maxOrderSize: parseFloat(data.maxOrderSize),
    priceIncrement: parseFloat(data.priceIncrement),
    sizeIncrement: parseFloat(data.sizeIncrement),
    tradingEnabled: data.tradingEnabled,
  };
}

// =============================================================================
// ORDER VALIDATION
// =============================================================================

export interface ValidateOrderParamsInput {
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  assetInfo: GetAssetInfoOutput;
}

export interface ValidateOrderParamsOutput {
  valid: boolean;
  error?: string;
}

export async function validateOrderParams(
  input: ValidateOrderParamsInput
): Promise<ValidateOrderParamsOutput> {
  const { assetInfo } = input;

  // Check trading enabled
  if (!assetInfo.tradingEnabled) {
    return { valid: false, error: "Trading is currently disabled for this asset" };
  }

  // Validate quantity
  if (input.quantity < assetInfo.minOrderSize) {
    return {
      valid: false,
      error: `Minimum order size is ${assetInfo.minOrderSize}`,
    };
  }

  if (input.quantity > assetInfo.maxOrderSize) {
    return {
      valid: false,
      error: `Maximum order size is ${assetInfo.maxOrderSize}`,
    };
  }

  // Validate size increment
  if (input.quantity % assetInfo.sizeIncrement !== 0) {
    return {
      valid: false,
      error: `Order size must be a multiple of ${assetInfo.sizeIncrement}`,
    };
  }

  // Validate limit price
  if (input.orderType === "limit" || input.orderType === "stop_limit") {
    if (!input.limitPrice || input.limitPrice <= 0) {
      return { valid: false, error: "Limit price is required" };
    }

    // Check price increment
    const priceRemainder =
      (input.limitPrice * 100) % (assetInfo.priceIncrement * 100);
    if (Math.abs(priceRemainder) > 0.001) {
      return {
        valid: false,
        error: `Price must be a multiple of ${assetInfo.priceIncrement}`,
      };
    }
  }

  // Validate stop price
  if (input.orderType === "stop" || input.orderType === "stop_limit") {
    if (!input.stopPrice || input.stopPrice <= 0) {
      return { valid: false, error: "Stop price is required" };
    }
  }

  return { valid: true };
}

// =============================================================================
// MASSIVE API INTEGRATION
// =============================================================================

export interface SubmitOrderToMassiveInput {
  orderId: string;
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: "day" | "gtc" | "ioc" | "fok";
}

export interface SubmitOrderToMassiveOutput {
  externalOrderId: string;
  status: string;
}

export async function submitOrderToMassive(
  input: SubmitOrderToMassiveInput
): Promise<SubmitOrderToMassiveOutput> {
  const response = await fetch(`${process.env.MASSIVE_BASE_URL}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
      "Content-Type": "application/json",
      "X-Client-Order-Id": input.orderId,
      "X-Signature": signRequest(input),
    },
    body: JSON.stringify({
      symbol: input.symbol,
      side: input.side,
      type: input.orderType,
      quantity: input.quantity.toString(),
      price: input.limitPrice?.toString(),
      stopPrice: input.stopPrice?.toString(),
      timeInForce: input.timeInForce,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Massive API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    externalOrderId: data.orderId,
    status: data.status,
  };
}

export interface PollOrderStatusInput {
  externalOrderId: string;
}

export interface PollOrderStatusOutput {
  status: "pending" | "submitted" | "partial" | "filled" | "cancelled" | "rejected";
  filledQuantity: number;
  avgPrice: number;
  fees: number;
  rejectReason?: string;
}

export async function pollOrderStatus(
  input: PollOrderStatusInput
): Promise<PollOrderStatusOutput> {
  const response = await fetch(
    `${process.env.MASSIVE_BASE_URL}/v1/orders/${input.externalOrderId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to poll order status: ${response.statusText}`);
  }

  const data = await response.json();

  // Map Massive status to our status
  const statusMap: Record<string, PollOrderStatusOutput["status"]> = {
    NEW: "pending",
    PENDING_NEW: "submitted",
    PARTIALLY_FILLED: "partial",
    FILLED: "filled",
    CANCELED: "cancelled",
    REJECTED: "rejected",
    EXPIRED: "cancelled",
  };

  return {
    status: statusMap[data.status] || "pending",
    filledQuantity: parseFloat(data.executedQty || "0"),
    avgPrice: parseFloat(data.avgPrice || "0"),
    fees: parseFloat(data.commission || "0"),
    rejectReason: data.rejectReason,
  };
}

export interface CancelMassiveOrderInput {
  externalOrderId: string;
}

export async function cancelMassiveOrder(
  input: CancelMassiveOrderInput
): Promise<boolean> {
  const response = await fetch(
    `${process.env.MASSIVE_BASE_URL}/v1/orders/${input.externalOrderId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to cancel order: ${response.statusText}`);
  }

  return true;
}

// =============================================================================
// SETTLEMENT
// =============================================================================

export interface SettleOrderInput {
  orderId: string;
  userId: string;
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  symbol: string;
  side: "buy" | "sell";
  filledQuantity: number;
  avgPrice: number;
  fees: number;
}

export async function settleOrder(input: SettleOrderInput): Promise<boolean> {
  const convex = getConvex();

  // Record the trade
  await convex.mutation(api.functions.orders.recordTrade, {
    orderId: input.orderId as any,
    quantity: input.filledQuantity,
    price: input.avgPrice,
    fees: input.fees,
  });

  return true;
}

export interface UpdateConvexBalancesInput {
  userId: string;
  assetType: "prediction" | "crypto" | "rwa";
  assetId: string;
  symbol: string;
  name: string;
  quantityDelta: number;
  cashDelta: number;
  currentPrice: number;
}

export async function updateConvexBalances(
  input: UpdateConvexBalancesInput
): Promise<boolean> {
  const convex = getConvex();

  await convex.mutation(api.functions.balances.updateAfterTrade, {
    userId: input.userId as any,
    assetType: input.assetType,
    assetId: input.assetId,
    symbol: input.symbol,
    name: input.name,
    quantityDelta: input.quantityDelta,
    cashDelta: input.cashDelta,
    currentPrice: input.currentPrice,
  });

  return true;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export interface SendOrderNotificationInput {
  userId: string;
  orderId: string;
  status: string;
  message: string;
}

export async function sendOrderNotification(
  input: SendOrderNotificationInput
): Promise<boolean> {
  const convex = getConvex();

  // Get user preferences
  const user = await convex.query(api.functions.users.getByIdInternal, {
    id: input.userId as any,
  });

  if (!user) return false;

  // Send push notification if enabled
  if (user.preferences.pushNotifications) {
    // Stream activity feed notification
    await fetch(`https://api.stream-io-api.com/api/v1.0/feed/notification/${input.userId}/`, {
      method: "POST",
      headers: {
        Authorization: process.env.STREAM_API_KEY!,
        "Content-Type": "application/json",
        "stream-auth-type": "jwt",
      },
      body: JSON.stringify({
        actor: "system",
        verb: "order_update",
        object: input.orderId,
        message: input.message,
        status: input.status,
      }),
    });
  }

  return true;
}

// =============================================================================
// POINTS
// =============================================================================

export interface CreditTradingPointsInput {
  userId: string;
  orderId: string;
  tradeValue: number;
  assetType: "prediction" | "crypto" | "rwa";
}

export async function creditTradingPoints(
  input: CreditTradingPointsInput
): Promise<boolean> {
  const convex = getConvex();

  // Calculate points based on trade value and asset type
  const pointsMultiplier: Record<string, number> = {
    prediction: 0.5, // 0.5 points per dollar
    crypto: 0.1, // 0.1 points per dollar
    rwa: 0.25, // 0.25 points per dollar
  };

  const basePoints = 10; // Base points for any trade
  const valuePoints = Math.floor(
    input.tradeValue * (pointsMultiplier[input.assetType] || 0.1)
  );
  const totalPoints = basePoints + valuePoints;

  await convex.mutation(api.functions.rewards.creditPoints, {
    userId: input.userId as any,
    amount: totalPoints,
    source: "trade_executed",
    sourceId: input.orderId,
    description: `Trading reward for ${input.assetType} trade`,
  });

  return true;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

export interface RecordAuditLogInput {
  userId: string;
  orderId: string;
  event: string;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(
  input: RecordAuditLogInput
): Promise<boolean> {
  const convex = getConvex();

  await convex.mutation(api.functions.audit.log, {
    userId: input.userId as any,
    action: input.event,
    category: "trading",
    resourceType: "order",
    resourceId: input.orderId,
    description: input.event.replace(/_/g, " "),
    metadata: input.metadata,
  });

  return true;
}

// =============================================================================
// HELPERS
// =============================================================================

function signRequest(data: unknown): string {
  const crypto = require("crypto");
  const payload = JSON.stringify(data) + Date.now();
  return crypto
    .createHmac("sha256", process.env.MASSIVE_API_SECRET!)
    .update(payload)
    .digest("hex");
}
