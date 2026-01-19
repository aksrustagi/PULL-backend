/**
 * Trading Activities
 * All activities for trading-related workflows
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
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
// KYC Validation Activities
// ============================================================================

/**
 * Validate KYC status for trade type
 */
export async function validateKYCStatus(
  userId: string,
  assetType: "prediction" | "rwa" | "crypto"
): Promise<KYCValidation> {
  console.log(`[Trading Activity] Validating KYC for ${userId}, asset type: ${assetType}`);

  // TODO: Call Convex query to check user KYC status
  // Different asset types may require different KYC levels
  const kycRequirements: Record<string, string[]> = {
    prediction: ["basic", "enhanced", "accredited"],
    rwa: ["enhanced", "accredited"],
    crypto: ["basic", "enhanced", "accredited"],
  };

  // Simulated check
  return { allowed: true };
}

// ============================================================================
// Buying Power Activities
// ============================================================================

/**
 * Check user's buying power
 */
export async function checkBuyingPower(
  userId: string,
  assetType: string
): Promise<BuyingPower> {
  console.log(`[Trading Activity] Checking buying power for ${userId}`);

  // TODO: Call Convex query
  return {
    available: 10000,
    held: 0,
    total: 10000,
  };
}

/**
 * Hold buying power for order
 */
export async function holdBuyingPower(
  userId: string,
  orderId: string,
  amount: number
): Promise<HoldResult> {
  console.log(`[Trading Activity] Holding $${amount} for order ${orderId}`);

  // TODO: Call Convex mutation
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

  // TODO: Call Convex mutation
}

// ============================================================================
// Order Execution Activities
// ============================================================================

/**
 * Submit order to Kalshi exchange
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

  // TODO: Call Kalshi API via MassiveClient
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

  return {
    externalOrderId: data.order?.order_id ?? `kalshi_${crypto.randomUUID()}`,
    status: "submitted",
  };
}

/**
 * Poll order status from exchange
 */
export async function pollOrderStatus(externalOrderId: string): Promise<OrderPollResult> {
  console.log(`[Trading Activity] Polling order status: ${externalOrderId}`);

  Context.current().heartbeat(`Polling ${externalOrderId}`);

  // TODO: Call Kalshi API to check order status
  const response = await fetch(
    `${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    return {
      status: "pending",
      fills: [],
    };
  }

  const data = await response.json();

  // Map Kalshi status to our status
  const statusMap: Record<string, OrderPollResult["status"]> = {
    resting: "pending",
    canceled: "cancelled",
    executed: "filled",
    pending: "pending",
  };

  return {
    status: statusMap[data.order?.status] ?? "pending",
    fills: data.order?.fills?.map((f: { count: number; price: number; created_time: string }) => ({
      quantity: f.count,
      price: f.price / 100,
      timestamp: f.created_time,
    })) ?? [],
  };
}

/**
 * Cancel order on Kalshi
 */
export async function cancelKalshiOrder(externalOrderId: string): Promise<void> {
  console.log(`[Trading Activity] Cancelling order: ${externalOrderId}`);

  // TODO: Call Kalshi API
  await fetch(`${process.env.KALSHI_API_URL}/v2/orders/${externalOrderId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
    },
  });
}

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

  // TODO: Call Convex mutation to record settlement
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

  // TODO: Call Convex mutation
}

// ============================================================================
// Settlement Activities
// ============================================================================

/**
 * Get event details
 */
export async function getEventDetails(eventId: string): Promise<EventDetails> {
  console.log(`[Trading Activity] Getting event details: ${eventId}`);

  // TODO: Call Convex query
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

  // TODO: Call Convex query
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
    const payout = isWinner ? pos.quantity * 1 : 0; // $1 per contract for winners
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

  // TODO: Call Convex mutation
}

/**
 * Mark event as settled
 */
export async function markEventSettled(eventId: string, outcome: string): Promise<void> {
  console.log(`[Trading Activity] Marking event ${eventId} as settled: ${outcome}`);

  // TODO: Call Convex mutation
}

// ============================================================================
// Balance Activities
// ============================================================================

/**
 * Credit user balance
 */
export async function creditUserBalance(
  userId: string,
  currency: string,
  amount: number,
  description: string
): Promise<void> {
  console.log(`[Trading Activity] Crediting ${amount} ${currency} to ${userId}`);

  // TODO: Call Convex mutation
}

/**
 * Debit user balance
 */
export async function debitUserBalance(
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  console.log(`[Trading Activity] Debiting ${amount} from ${userId}`);

  // TODO: Call Convex mutation
}

/**
 * Hold user balance
 */
export async function holdUserBalance(
  userId: string,
  amount: number,
  reference: string
): Promise<HoldResult> {
  console.log(`[Trading Activity] Holding ${amount} for ${userId}`);

  return {
    holdId: `hold_${reference}`,
    amount,
  };
}

/**
 * Release user hold
 */
export async function releaseUserHold(userId: string, holdId: string): Promise<void> {
  console.log(`[Trading Activity] Releasing hold ${holdId}`);

  // TODO: Call Convex mutation
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

  // Validate minimum/maximum amounts
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

  // TODO: Call Plaid API
  return { transferId: `ach_${crypto.randomUUID()}` };
}

/**
 * Check transfer status
 */
export async function checkTransferStatus(transferId: string): Promise<TransferStatus> {
  console.log(`[Trading Activity] Checking transfer status: ${transferId}`);

  // TODO: Call Plaid API
  return { status: "settled" };
}

/**
 * Monitor transfer status with heartbeat
 */
export async function monitorTransferStatus(transferId: string): Promise<TransferStatus> {
  Context.current().heartbeat(`Monitoring ${transferId}`);

  // TODO: Long-running monitoring
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

  // TODO: Call Convex mutation
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

  // TODO: Call Convex mutation
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

  // TODO: Check user balance
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

  // TODO: Integrate with fraud detection service
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

  // TODO: Send 2FA via preferred method (SMS, authenticator app, etc.)
}

/**
 * Verify 2FA code
 */
export async function verify2FACode(userId: string, code: string): Promise<boolean> {
  console.log(`[Trading Activity] Verifying 2FA code for ${userId}`);

  // TODO: Verify against user's 2FA secret
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

  // TODO: Call Plaid API
  return { transferId: `ach_${crypto.randomUUID()}` };
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
  console.log(`[Trading Activity] Sending order notification: ${type} for ${orderId}`);

  // TODO: Send notification via preferred channel
}

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

  // TODO: Send notification
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

  // TODO: Send notification
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

  // TODO: Send notification
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Trading Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  // TODO: Call Convex mutation to log audit event
}
