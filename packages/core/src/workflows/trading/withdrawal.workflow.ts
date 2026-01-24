/**
 * Withdrawal Workflow
 * Handles withdrawal requests with fraud checks and cooling periods
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  ApplicationFailure,
  uuid4,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  validateWithdrawalRequest,
  performFraudCheck,
  holdUserBalance,
  releaseUserHold,
  debitUserBalance,
  creditUserBalance,
  executeACHTransfer,
  checkTransferStatus,
  send2FAChallenge,
  verify2FACode,
  sendWithdrawalNotification,
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

// Workflow input type
export interface WithdrawalInput {
  userId: string;
  amount: number;
  destinationAccountId: string;
}

// Withdrawal status type
export interface WithdrawalStatus {
  withdrawalId: string;
  status:
    | "validating"
    | "fraud_check"
    | "cooling_period"
    | "awaiting_2fa"
    | "executing"
    | "pending"
    | "completed"
    | "rejected"
    | "cancelled"
    | "failed";
  amount: number;
  holdId?: string;
  transferId?: string;
  coolingPeriodEnds?: string;
  requires2FA: boolean;
  twoFAVerified: boolean;
  completedAt?: string;
  failureReason?: string;
}

// Configuration
const LARGE_WITHDRAWAL_THRESHOLD = 10000; // $10,000
const COOLING_PERIOD_HOURS = 24;

// Signals
export const twoFAVerifiedSignal = defineSignal<[{ code: string }]>("twoFAVerified");
export const cancelWithdrawalSignal = defineSignal("cancelWithdrawal");

// Queries
export const getWithdrawalStatusQuery = defineQuery<WithdrawalStatus>("getWithdrawalStatus");

/**
 * Withdrawal Workflow
 */
export async function withdrawalWorkflow(
  input: WithdrawalInput
): Promise<WithdrawalStatus> {
  const { userId, amount, destinationAccountId } = input;

  // Generate withdrawal ID
  const withdrawalId = `wth_${uuid4()}`;

  // Initialize status
  const status: WithdrawalStatus = {
    withdrawalId,
    status: "validating",
    amount,
    requires2FA: amount >= LARGE_WITHDRAWAL_THRESHOLD,
    twoFAVerified: false,
  };

  // Set up query handler
  setHandler(getWithdrawalStatusQuery, () => status);

  // Track signals
  let twoFACode: string | undefined;
  let cancellationRequested = false;

  setHandler(twoFAVerifiedSignal, ({ code }) => {
    twoFACode = code;
  });

  setHandler(cancelWithdrawalSignal, () => {
    cancellationRequested = true;
  });

  try {
    // Log withdrawal initiation
    await recordAuditLog({
      userId,
      action: "withdrawal_initiated",
      resourceType: "withdrawal",
      resourceId: withdrawalId,
      metadata: { amount, destinationAccountId },
    });

    // =========================================================================
    // Step 1: Validate withdrawal request
    // =========================================================================
    const validation = await validateWithdrawalRequest(
      userId,
      amount,
      destinationAccountId
    );

    if (!validation.valid) {
      status.status = "rejected";
      status.failureReason = validation.reason;
      await sendWithdrawalNotification(userId, withdrawalId, "rejected", validation.reason);
      throw ApplicationFailure.nonRetryable(`Withdrawal validation failed: ${validation.reason}`);
    }

    // =========================================================================
    // Step 2: Perform fraud check
    // =========================================================================
    status.status = "fraud_check";

    const fraudCheck = await performFraudCheck({
      userId,
      amount,
      destinationAccountId,
      withdrawalId,
    });

    if (fraudCheck.flagged) {
      status.status = "rejected";
      status.failureReason = "Flagged by fraud detection";
      await sendWithdrawalNotification(
        userId,
        withdrawalId,
        "rejected",
        "Your withdrawal request requires manual review. Please contact support."
      );

      await recordAuditLog({
        userId,
        action: "withdrawal_fraud_flagged",
        resourceType: "withdrawal",
        resourceId: withdrawalId,
        metadata: { riskScore: fraudCheck.riskScore, reasons: fraudCheck.reasons },
      });

      throw ApplicationFailure.nonRetryable("Withdrawal flagged by fraud detection");
    }

    // =========================================================================
    // Step 3: Hold funds
    // =========================================================================
    const hold = await holdUserBalance(userId, amount, withdrawalId);
    status.holdId = hold.holdId;

    // =========================================================================
    // Step 4: Cooling period for large withdrawals
    // =========================================================================
    if (amount >= LARGE_WITHDRAWAL_THRESHOLD) {
      status.status = "cooling_period";
      const coolingEnds = new Date(Date.now() + COOLING_PERIOD_HOURS * 60 * 60 * 1000);
      status.coolingPeriodEnds = coolingEnds.toISOString();

      await sendWithdrawalNotification(
        userId,
        withdrawalId,
        "cooling_period",
        `Your withdrawal of $${amount.toFixed(2)} will be processed after a ${COOLING_PERIOD_HOURS}-hour cooling period.`
      );

      // Wait for cooling period (with cancellation check)
      const coolingComplete = await condition(
        () => cancellationRequested,
        `${COOLING_PERIOD_HOURS} hours`
      );

      if (cancellationRequested) {
        await handleCancellation(userId, withdrawalId, status, hold.holdId);
        return status;
      }
    }

    // Check for cancellation
    if (cancellationRequested) {
      await handleCancellation(userId, withdrawalId, status, hold.holdId);
      return status;
    }

    // =========================================================================
    // Step 5: 2FA verification for large withdrawals
    // =========================================================================
    if (status.requires2FA) {
      status.status = "awaiting_2fa";

      // Send 2FA challenge
      await send2FAChallenge(userId, withdrawalId);

      await sendWithdrawalNotification(
        userId,
        withdrawalId,
        "2fa_required",
        "Please verify this withdrawal with your 2FA code."
      );

      // Wait for 2FA verification (15 minute timeout)
      const verified = await condition(
        () => twoFACode !== undefined || cancellationRequested,
        "15 minutes"
      );

      if (cancellationRequested) {
        await handleCancellation(userId, withdrawalId, status, hold.holdId);
        return status;
      }

      if (!verified || !twoFACode) {
        status.status = "cancelled";
        status.failureReason = "2FA verification timeout";
        await releaseUserHold(userId, hold.holdId);
        await sendWithdrawalNotification(
          userId,
          withdrawalId,
          "cancelled",
          "Withdrawal cancelled due to 2FA timeout."
        );
        throw ApplicationFailure.nonRetryable("2FA verification timeout");
      }

      // Verify 2FA code
      const codeValid = await verify2FACode(userId, twoFACode);

      if (!codeValid) {
        status.status = "rejected";
        status.failureReason = "Invalid 2FA code";
        await releaseUserHold(userId, hold.holdId);
        await sendWithdrawalNotification(
          userId,
          withdrawalId,
          "rejected",
          "Invalid 2FA code provided."
        );
        throw ApplicationFailure.nonRetryable("Invalid 2FA code");
      }

      status.twoFAVerified = true;
    }

    // =========================================================================
    // Step 6: Execute transfer
    // =========================================================================
    status.status = "executing";

    // Debit user balance (convert hold to debit)
    await debitUserBalance(userId, amount, withdrawalId);

    // Execute ACH transfer
    const transfer = await executeACHTransfer({
      userId,
      withdrawalId,
      amount,
      destinationAccountId,
    });

    status.transferId = transfer.transferId;
    status.status = "pending";

    await sendWithdrawalNotification(
      userId,
      withdrawalId,
      "processing",
      `Your withdrawal of $${amount.toFixed(2)} is being processed.`
    );

    // =========================================================================
    // Step 7: Monitor transfer status
    // =========================================================================
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
        status.status = "failed";
        status.failureReason = transferStatus.reason ?? "Transfer failed";

        // Refund the user for failed transfer
        await creditUserBalance(userId, amount, withdrawalId);
        await sendWithdrawalNotification(
          userId,
          withdrawalId,
          "refunded",
          `Your withdrawal of $${amount.toFixed(2)} has been refunded due to a failed transfer.`
        );
      }
    }

    // =========================================================================
    // Step 8: Finalize
    // =========================================================================
    if (status.status === "completed") {
      await sendWithdrawalNotification(
        userId,
        withdrawalId,
        "completed",
        `Your withdrawal of $${amount.toFixed(2)} has been completed.`
      );

      await recordAuditLog({
        userId,
        action: "withdrawal_completed",
        resourceType: "withdrawal",
        resourceId: withdrawalId,
        metadata: { amount, transferId: transfer.transferId },
      });
    }

    return status;
  } catch (error) {
    if (status.status !== "rejected" && status.status !== "cancelled") {
      status.status = "failed";
      status.failureReason = error instanceof Error ? error.message : String(error);
    }

    // Release hold if still active
    if (status.holdId && status.status !== "executing" && status.status !== "completed") {
      try {
        await releaseUserHold(userId, status.holdId);
      } catch (releaseError) {
        // Error will be handled by the workflow retry mechanism
      }
    }

    await recordAuditLog({
      userId,
      action: "withdrawal_failed",
      resourceType: "withdrawal",
      resourceId: withdrawalId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}

// Helper function to handle cancellation
async function handleCancellation(
  userId: string,
  withdrawalId: string,
  status: WithdrawalStatus,
  holdId: string
): Promise<void> {
  status.status = "cancelled";

  // Release hold
  await releaseUserHold(userId, holdId);

  await sendWithdrawalNotification(
    userId,
    withdrawalId,
    "cancelled",
    "Your withdrawal has been cancelled."
  );

  await recordAuditLog({
    userId,
    action: "withdrawal_cancelled",
    resourceType: "withdrawal",
    resourceId: withdrawalId,
    metadata: {},
  });
}
