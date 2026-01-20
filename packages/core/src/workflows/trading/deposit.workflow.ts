/**
 * Deposit Workflow
 * Handles ACH deposits via Plaid
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  validateDepositRequest,
  initiateACHTransfer,
  checkTransferStatus,
  creditUserBalance,
  recordDepositComplete,
  sendDepositNotification,
  recordAuditLog,
  handleDepositReturn,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Longer timeout for transfer monitoring
const { monitorTransferStatus } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "2 minutes",
  },
});

// Workflow input type
export interface DepositInput {
  userId: string;
  amount: number;
  plaidAccessToken: string;
  accountId: string;
}

// Deposit status type
export interface DepositStatus {
  depositId: string;
  status:
    | "validating"
    | "initiating"
    | "pending"
    | "processing"
    | "completed"
    | "returned"
    | "failed";
  amount: number;
  transferId?: string;
  completedAt?: string;
  failureReason?: string;
}

// Queries
export const getDepositStatusQuery = defineQuery<DepositStatus>("getDepositStatus");

/**
 * Deposit Workflow
 */
export async function depositWorkflow(input: DepositInput): Promise<DepositStatus> {
  const { userId, amount, plaidAccessToken, accountId } = input;

  // Generate deposit ID
  const depositId = `dep_${crypto.randomUUID()}`;

  // Initialize status
  const status: DepositStatus = {
    depositId,
    status: "validating",
    amount,
  };

  // Set up query handler
  setHandler(getDepositStatusQuery, () => status);

  try {
    // Log deposit initiation
    await recordAuditLog({
      userId,
      action: "deposit_initiated",
      resourceType: "deposit",
      resourceId: depositId,
      metadata: { amount, accountId },
    });

    // =========================================================================
    // Step 1: Validate deposit request
    // =========================================================================
    const validation = await validateDepositRequest(userId, amount, accountId);

    if (!validation.valid) {
      status.status = "failed";
      status.failureReason = validation.reason;
      await sendDepositNotification(userId, depositId, "failed", validation.reason);
      throw ApplicationFailure.nonRetryable(`Deposit validation failed: ${validation.reason}`);
    }

    // =========================================================================
    // Step 2: Initiate ACH transfer via Plaid
    // =========================================================================
    status.status = "initiating";

    const transfer = await initiateACHTransfer({
      userId,
      depositId,
      amount,
      plaidAccessToken,
      accountId,
    });

    status.transferId = transfer.transferId;
    status.status = "pending";

    await sendDepositNotification(userId, depositId, "initiated");

    // =========================================================================
    // Step 3: Monitor transfer status
    // =========================================================================
    status.status = "processing";

    // Poll for transfer completion (ACH typically takes 1-5 business days)
    const maxAttempts = 120; // Check every hour for up to 5 days
    let attempts = 0;
    let transferComplete = false;

    while (!transferComplete && attempts < maxAttempts) {
      await sleep("1 hour");
      attempts++;

      const transferStatus = await checkTransferStatus(transfer.transferId);

      if (transferStatus.status === "settled" || transferStatus.status === "posted") {
        transferComplete = true;
        status.status = "completed";
        status.completedAt = new Date().toISOString();
      } else if (transferStatus.status === "returned" || transferStatus.status === "failed") {
        transferComplete = true;
        status.status = "returned";
        status.failureReason = transferStatus.reason ?? "Transfer returned/failed";
      } else if (transferStatus.status === "cancelled") {
        transferComplete = true;
        status.status = "failed";
        status.failureReason = "Transfer cancelled";
      }
    }

    if (!transferComplete) {
      status.status = "failed";
      status.failureReason = "Transfer timeout";
      throw ApplicationFailure.nonRetryable("Deposit transfer timeout");
    }

    // =========================================================================
    // Step 4: Credit balance or handle return
    // =========================================================================
    if (status.status === "completed") {
      // Credit user balance
      await creditUserBalance(
        userId,
        "USD",
        amount,
        `ACH Deposit ${depositId}`
      );

      // Record deposit complete
      await recordDepositComplete(userId, depositId, amount);

      // Send success notification
      await sendDepositNotification(userId, depositId, "completed");

      await recordAuditLog({
        userId,
        action: "deposit_completed",
        resourceType: "deposit",
        resourceId: depositId,
        metadata: { amount, transferId: transfer.transferId },
      });
    } else if (status.status === "returned") {
      // Handle return
      await handleDepositReturn(userId, depositId, status.failureReason!);

      // Send return notification
      await sendDepositNotification(userId, depositId, "returned", status.failureReason);

      await recordAuditLog({
        userId,
        action: "deposit_returned",
        resourceType: "deposit",
        resourceId: depositId,
        metadata: { reason: status.failureReason },
      });
    }

    return status;
  } catch (error) {
    status.status = "failed";
    status.failureReason = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId,
      action: "deposit_failed",
      resourceType: "deposit",
      resourceId: depositId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}
