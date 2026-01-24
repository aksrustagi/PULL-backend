/**
 * Token Conversion Workflow
 * Handles conversion of points to $PULL tokens
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ApplicationFailure,
  uuid4,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getUserPointsBalance,
  getTokenConversionRate,
  validateWalletAddress,
  debitPoints,
  creditPoints,
  initiateTokenMint,
  checkMintTransaction,
  creditTokenBalance,
  burnPoints,
  sendTokenNotification,
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

// Extended timeout for blockchain operations
const { waitForMintConfirmation } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "1 minute",
  },
});

// Workflow input type
export interface TokenConversionInput {
  userId: string;
  pointsAmount: number;
  walletAddress: string;
}

// Conversion status type
export interface TokenConversionStatus {
  conversionId: string;
  status:
    | "validating"
    | "debiting_points"
    | "minting"
    | "confirming"
    | "crediting"
    | "completed"
    | "failed";
  pointsAmount: number;
  conversionRate: number;
  tokenAmount: number;
  walletAddress: string;
  transactionHash?: string;
  blockNumber?: number;
  failureReason?: string;
}

// Configuration
const MIN_CONVERSION_POINTS = 1000;
const MAX_CONVERSION_POINTS = 1000000;

// Signals
export const conversionConfirmedSignal = defineSignal<[{ txHash: string; blockNumber: number }]>("conversionConfirmed");

// Queries
export const getConversionStatusQuery = defineQuery<TokenConversionStatus>("getConversionStatus");

/**
 * Token Conversion Workflow
 */
export async function tokenConversionWorkflow(
  input: TokenConversionInput
): Promise<TokenConversionStatus> {
  const { userId, pointsAmount, walletAddress } = input;

  // Generate conversion ID
  const conversionId = `conv_${uuid4()}`;

  // Initialize status
  const status: TokenConversionStatus = {
    conversionId,
    status: "validating",
    pointsAmount,
    conversionRate: 0,
    tokenAmount: 0,
    walletAddress,
  };

  // Set up query handler
  setHandler(getConversionStatusQuery, () => status);

  // Track signal data
  let mintConfirmation: { txHash: string; blockNumber: number } | undefined;

  setHandler(conversionConfirmedSignal, (data) => {
    mintConfirmation = data;
  });

  try {
    // Log conversion attempt
    await recordAuditLog({
      userId,
      action: "token_conversion_started",
      resourceType: "conversion",
      resourceId: conversionId,
      metadata: { pointsAmount, walletAddress },
    });

    // =========================================================================
    // Step 1: Validate conversion request
    // =========================================================================

    // Validate points amount
    if (pointsAmount < MIN_CONVERSION_POINTS) {
      status.status = "failed";
      status.failureReason = `Minimum conversion is ${MIN_CONVERSION_POINTS} points`;
      throw ApplicationFailure.nonRetryable(`Minimum conversion is ${MIN_CONVERSION_POINTS} points`);
    }

    if (pointsAmount > MAX_CONVERSION_POINTS) {
      status.status = "failed";
      status.failureReason = `Maximum conversion is ${MAX_CONVERSION_POINTS} points`;
      throw ApplicationFailure.nonRetryable(`Maximum conversion is ${MAX_CONVERSION_POINTS} points`);
    }

    // Validate wallet address
    const walletValidation = await validateWalletAddress(walletAddress);

    if (!walletValidation.valid) {
      status.status = "failed";
      status.failureReason = `Invalid wallet address: ${walletValidation.reason}`;
      throw ApplicationFailure.nonRetryable("Invalid wallet address");
    }

    // Check points balance
    const pointsBalance = await getUserPointsBalance(userId);

    if (pointsBalance < pointsAmount) {
      status.status = "failed";
      status.failureReason = `Insufficient points. Have ${pointsBalance}, need ${pointsAmount}`;
      throw ApplicationFailure.nonRetryable("Insufficient points balance");
    }

    // =========================================================================
    // Step 2: Get conversion rate and calculate token amount
    // =========================================================================
    const conversionRate = await getTokenConversionRate();
    status.conversionRate = conversionRate.rate;
    status.tokenAmount = pointsAmount * conversionRate.rate;

    // =========================================================================
    // Step 3: Debit points (hold for conversion)
    // =========================================================================
    status.status = "debiting_points";

    await debitPoints({
      userId,
      amount: pointsAmount,
      redemptionId: conversionId,
      rewardId: "token_conversion",
      description: `Token conversion: ${pointsAmount} points → ${status.tokenAmount.toFixed(4)} $PULL`,
    });

    // =========================================================================
    // Step 4: Initiate token mint on-chain
    // =========================================================================
    status.status = "minting";

    const mintResult = await initiateTokenMint({
      conversionId,
      walletAddress,
      tokenAmount: status.tokenAmount,
      pointsAmount,
      userId,
    });

    status.transactionHash = mintResult.transactionHash;

    // =========================================================================
    // Step 5: Wait for blockchain confirmation
    // =========================================================================
    status.status = "confirming";

    // Wait for mint confirmation with timeout
    const confirmed = await condition(
      () => mintConfirmation !== undefined,
      "5 minutes"
    );

    let finalTxHash = status.transactionHash;
    let blockNumber: number | undefined;

    if (confirmed && mintConfirmation) {
      finalTxHash = mintConfirmation.txHash;
      blockNumber = mintConfirmation.blockNumber;
    } else {
      // Poll for confirmation
      const txStatus = await waitForMintConfirmation(status.transactionHash!);

      if (!txStatus.confirmed) {
        // Transaction failed or timed out - need to handle compensation
        status.status = "failed";
        status.failureReason = "Token mint transaction failed or timed out";

        // Refund points for failed mint
        await creditPoints({
          userId,
          amount: pointsAmount,
          description: `Refund: Token conversion ${conversionId} failed`,
          referenceType: "conversion",
          referenceId: conversionId,
        });

        await sendTokenNotification(userId, {
          type: "conversion_failed",
          conversionId,
          pointsRefunded: pointsAmount,
          reason: "Token mint transaction failed or timed out",
        });
        throw ApplicationFailure.nonRetryable("Token mint failed");
      }

      finalTxHash = txStatus.txHash;
      blockNumber = txStatus.blockNumber;
    }

    status.transactionHash = finalTxHash;
    status.blockNumber = blockNumber;

    // =========================================================================
    // Step 6: Credit token balance in Convex
    // =========================================================================
    status.status = "crediting";

    await creditTokenBalance({
      userId,
      amount: status.tokenAmount,
      conversionId,
      transactionHash: finalTxHash,
    });

    // =========================================================================
    // Step 7: Burn points (finalize conversion)
    // =========================================================================
    await burnPoints({
      userId,
      amount: pointsAmount,
      conversionId,
      reason: "Converted to $PULL tokens",
    });

    // =========================================================================
    // Step 8: Send notification
    // =========================================================================
    await sendTokenNotification(userId, {
      type: "conversion_complete",
      conversionId,
      pointsConverted: pointsAmount,
      tokensReceived: status.tokenAmount,
      transactionHash: finalTxHash,
      walletAddress,
    });

    // =========================================================================
    // Step 9: Finalize
    // =========================================================================
    status.status = "completed";

    await recordAuditLog({
      userId,
      action: "token_conversion_completed",
      resourceType: "conversion",
      resourceId: conversionId,
      metadata: {
        pointsAmount,
        tokenAmount: status.tokenAmount,
        conversionRate: status.conversionRate,
        transactionHash: finalTxHash,
        blockNumber,
      },
    });

    return status;
  } catch (error) {
    if (status.status !== "failed") {
      status.status = "failed";
      status.failureReason = error instanceof Error ? error.message : String(error);
    }

    await recordAuditLog({
      userId,
      action: "token_conversion_failed",
      resourceType: "conversion",
      resourceId: conversionId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}
