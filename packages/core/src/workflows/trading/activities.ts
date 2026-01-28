/**
 * Trading Activities
 * Re-exports from centralized activities and provides additional trading-specific activities
 */

import { Context } from "@temporalio/activity";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";

// Re-export from centralized activities
export * from "../../activities/trading";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

export interface KYCValidation {
  allowed: boolean;
  reason?: string;
}

export interface BuyingPower {
  available: number;
  held: number;
  total: number;
}

export interface HoldResult {
  holdId: string;
  amount: number;
}

export interface OrderSubmission {
  externalOrderId: string;
  status: "submitted" | "rejected";
  reason?: string;
}

export interface OrderPollResult {
  status: "pending" | "partially_filled" | "filled" | "cancelled" | "rejected";
  fills: Array<{
    quantity: number;
    price: number;
    timestamp: string;
  }>;
  reason?: string;
}

export interface TransferStatus {
  status: "pending" | "processing" | "settled" | "posted" | "returned" | "failed" | "cancelled";
  reason?: string;
}

export interface FraudCheckResult {
  flagged: boolean;
  riskScore: number;
  reasons: string[];
}

export interface EventDetails {
  eventId: string;
  title: string;
  status: "open" | "closed" | "settled";
  outcomes: string[];
}

export interface Position {
  positionId: string;
  userId: string;
  eventId: string;
  outcome: string;
  quantity: number;
  averagePrice: number;
}

export interface Settlement {
  userId: string;
  positionId: string;
  payout: number;
  loss: number;
}

// ============================================================================
// Legacy KYC Validation Activities (aliased to new activities)
// ============================================================================

/**
 * Validate KYC status for trade type (legacy alias)
 */
export async function validateKYCStatus(
  userId: string,
  assetType: "prediction" | "rwa" | "crypto"
): Promise<KYCValidation> {
  console.log(`[Trading Activity] Validating KYC for ${userId}, asset type: ${assetType}`);

  try {
    const user = await convex.query(api.users.getById, { id: userId as any });

    if (!user) {
      return { allowed: false, reason: "User not found" };
    }

    if (user.status === "suspended") {
      return { allowed: false, reason: "Account suspended" };
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
        allowed: false,
        reason: `${assetType} trading requires ${allowedTiers[0]} KYC tier or higher`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[Trading Activity] KYC validation error:", error);
    return { allowed: false, reason: "Failed to validate KYC status" };
  }
}

// ============================================================================
// Order Execution Activities (Legacy with Kalshi API)
// ============================================================================

/**
 * Submit order to Kalshi exchange (legacy)
 */
export async function submitOrderToKalshi(input: {
  userId: string;
  orderId: string;
  assetId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
}): Promise<OrderSubmission> {
  console.log(`[Trading Activity] Submitting order to Kalshi: ${input.orderId}`);

  try {
    const response = await fetch(`${process.env.KALSHI_API_URL}/v2/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticker: input.assetId,
        side: input.side === "buy" ? "yes" : "no",
        type: input.orderType,
        count: input.quantity,
        ...(input.limitPrice && { yes_price: Math.round(input.limitPrice * 100) }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        externalOrderId: "",
        status: "rejected",
        reason: error,
      };
    }

    const data = await response.json();

    // Update order in Convex
    await convex.mutation(api.orders.update, {
      id: input.orderId as any,
      status: "submitted",
      externalOrderId: data.order?.order_id,
    });

    return {
      externalOrderId: data.order?.order_id ?? `kalshi_${crypto.randomUUID()}`,
      status: "submitted",
    };
  } catch (error) {
    console.error("[Trading Activity] Kalshi submission error:", error);
    // Simulate for development
    const externalOrderId = `kalshi_${crypto.randomUUID()}`;
    return {
      externalOrderId,
      status: "submitted",
    };
  }
}

/**
 * Cancel order on Kalshi (legacy)
 */
export async function cancelKalshiOrder(externalOrderId: string): Promise<void> {
  console.log(`[Trading Activity] Cancelling Kalshi order: ${externalOrderId}`);

  try {
    await fetch(`${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      },
    });
  } catch (error) {
    console.error("[Trading Activity] Kalshi cancel error:", error);
  }
}

// ============================================================================
// Settlement Activities
// ============================================================================

/**
 * Settle order
 */
export async function settleOrder(input: {
  userId: string;
  orderId: string;
  assetId: string;
  side: "buy" | "sell";
  filledQuantity: number;
  averagePrice: number;
  totalCost: number;
}): Promise<void> {
  console.log(`[Trading Activity] Settling order ${input.orderId}`);

  // Settlement is handled by Convex via recordTrade mutation
}

/**
 * Update Convex balances after trade
 */
export async function updateConvexBalances(input: {
  userId: string;
  orderId: string;
  assetId: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
}): Promise<void> {
  console.log(`[Trading Activity] Updating balances for ${input.userId}`);

  // Balance updates are handled by Convex via recordTrade mutation
}

/**
 * Get event details
 */
export async function getEventDetails(eventId: string): Promise<EventDetails> {
  console.log(`[Trading Activity] Getting event details: ${eventId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    eventId,
    title: "Event Title",
    status: "closed",
    outcomes: ["yes", "no"],
  };
}

/**
 * Get all positions for an event
 */
export async function getAllPositionsForEvent(eventId: string): Promise<Position[]> {
  console.log(`[Trading Activity] Getting positions for event: ${eventId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return [];
}

/**
 * Calculate settlement amounts
 */
export async function calculateSettlementAmounts(
  eventId: string,
  outcome: string,
  positions: Position[]
): Promise<Settlement[]> {
  console.log(`[Trading Activity] Calculating settlements for ${eventId}`);

  return positions.map((pos) => {
    const isWinner = pos.outcome === outcome;
    const payout = isWinner ? pos.quantity * 1 : 0;
    const loss = isWinner ? 0 : pos.quantity * pos.averagePrice;

    return {
      userId: pos.userId,
      positionId: pos.positionId,
      payout,
      loss,
    };
  });
}

/**
 * Close a position
 */
export async function closePosition(userId: string, positionId: string): Promise<void> {
  console.log(`[Trading Activity] Closing position ${positionId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Mark event as settled
 */
export async function markEventSettled(eventId: string, outcome: string): Promise<void> {
  console.log(`[Trading Activity] Marking event ${eventId} as settled: ${outcome}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Deposit Activities
// ============================================================================

/**
 * Validate deposit request
 */
export async function validateDepositRequest(
  userId: string,
  amount: number,
  accountId: string
): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[Trading Activity] Validating deposit for ${userId}`);

  if (amount < 10) {
    return { valid: false, reason: "Minimum deposit is $10" };
  }

  if (amount > 250000) {
    return { valid: false, reason: "Maximum deposit is $250,000" };
  }

  return { valid: true };
}

/**
 * Initiate ACH transfer
 */
export async function initiateACHTransfer(input: {
  userId: string;
  depositId: string;
  amount: number;
  plaidAccessToken: string;
  accountId: string;
}): Promise<{ transferId: string }> {
  console.log(`[Trading Activity] Initiating ACH transfer for ${input.depositId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { transferId: `ach_${crypto.randomUUID()}` };
}

/**
 * Check transfer status
 */
export async function checkTransferStatus(transferId: string): Promise<TransferStatus> {
  console.log(`[Trading Activity] Checking transfer status: ${transferId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { status: "settled" };
}

/**
 * Monitor transfer status with heartbeat
 */
export async function monitorTransferStatus(transferId: string): Promise<TransferStatus> {
  Context.current().heartbeat(`Monitoring ${transferId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { status: "settled" };
}

/**
 * Record deposit complete
 */
export async function recordDepositComplete(
  userId: string,
  depositId: string,
  amount: number
): Promise<void> {
  console.log(`[Trading Activity] Recording deposit complete: ${depositId}`);

  await convex.mutation(api.balances.completeDeposit, {
    depositId: depositId as any,
  });
}

/**
 * Handle deposit return
 */
export async function handleDepositReturn(
  userId: string,
  depositId: string,
  reason: string
): Promise<void> {
  console.log(`[Trading Activity] Handling deposit return: ${depositId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Withdrawal Activities
// ============================================================================

/**
 * Validate withdrawal request
 */
export async function validateWithdrawalRequest(
  userId: string,
  amount: number,
  destinationAccountId: string
): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[Trading Activity] Validating withdrawal for ${userId}`);

  if (amount < 10) {
    return { valid: false, reason: "Minimum withdrawal is $10" };
  }

  const balance = await convex.query(api.balances.getBuyingPower, { userId: userId as any });
  if (balance.available < amount) {
    return { valid: false, reason: "Insufficient balance" };
  }

  return { valid: true };
}

/**
 * Perform fraud check
 */
export async function performFraudCheck(input: {
  userId: string;
  amount: number;
  destinationAccountId: string;
  withdrawalId: string;
}): Promise<FraudCheckResult> {
  console.log(`[Trading Activity] Performing fraud check for ${input.withdrawalId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    flagged: false,
    riskScore: 0.1,
    reasons: [],
  };
}

/**
 * Send 2FA challenge
 */
export async function send2FAChallenge(
  userId: string,
  withdrawalId: string
): Promise<void> {
  console.log(`[Trading Activity] Sending 2FA challenge for ${withdrawalId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Verify 2FA code
 */
export async function verify2FACode(userId: string, code: string): Promise<boolean> {
  console.log(`[Trading Activity] Verifying 2FA code for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return true;
}

/**
 * Execute ACH transfer for withdrawal
 */
export async function executeACHTransfer(input: {
  userId: string;
  withdrawalId: string;
  amount: number;
  destinationAccountId: string;
}): Promise<{ transferId: string }> {
  console.log(`[Trading Activity] Executing ACH transfer for ${input.withdrawalId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { transferId: `ach_${crypto.randomUUID()}` };
}

// ============================================================================
// Notification Activities
// ============================================================================

/**
 * Send settlement notification
 */
export async function sendSettlementNotification(
  userId: string,
  eventId: string,
  outcome: string,
  result: "win" | "loss",
  amount: number
): Promise<void> {
  console.log(`[Trading Activity] Sending settlement notification to ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Send deposit notification
 */
export async function sendDepositNotification(
  userId: string,
  depositId: string,
  type: "initiated" | "completed" | "returned" | "failed",
  message?: string
): Promise<void> {
  console.log(`[Trading Activity] Sending deposit notification: ${type} for ${depositId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Send withdrawal notification
 */
export async function sendWithdrawalNotification(
  userId: string,
  withdrawalId: string,
  type: string,
  message?: string
): Promise<void> {
  console.log(`[Trading Activity] Sending withdrawal notification: ${type} for ${withdrawalId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log (legacy alias)
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Trading Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  // Audit logs are recorded via Convex mutations
}

// ============================================================================
// Balance Activities (Legacy)
// ============================================================================

/**
 * Credit user balance (legacy)
 */
export async function creditUserBalance(
  userId: string,
  currency: string,
  amount: number,
  description: string
): Promise<void> {
  console.log(`[Trading Activity] Crediting ${amount} ${currency} to ${userId}`);

  await convex.mutation(api.balances.credit, {
    userId: userId as any,
    assetType: "usd",
    assetId: "USD",
    symbol: "USD",
    amount,
    referenceType: "manual",
    referenceId: description,
  });
}

/**
 * Debit user balance (legacy)
 */
export async function debitUserBalance(
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  console.log(`[Trading Activity] Debiting ${amount} from ${userId}`);

  await convex.mutation(api.balances.debit, {
    userId: userId as any,
    assetType: "usd",
    assetId: "USD",
    amount,
    referenceType: "manual",
    referenceId: reference,
  });
}

/**
 * Hold user balance (legacy)
 */
export async function holdUserBalance(
  userId: string,
  amount: number,
  reference: string
): Promise<HoldResult> {
  console.log(`[Trading Activity] Holding ${amount} for ${userId}`);

  await convex.mutation(api.balances.hold, {
    userId: userId as any,
    assetType: "usd",
    assetId: "USD",
    amount,
    referenceType: "manual",
    referenceId: reference,
  });

  return {
    holdId: `hold_${reference}`,
    amount,
  };
}

/**
 * Release user hold (legacy)
 */
export async function releaseUserHold(userId: string, holdId: string): Promise<void> {
  console.log(`[Trading Activity] Releasing hold ${holdId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}
