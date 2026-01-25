/**
 * Redeem Points Workflow
 * Handles points redemption for various rewards
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getUserPointsBalance,
  getRewardDetails,
  validateRedemptionEligibility,
  debitPoints,
  processRedemption,
  enterSweepstakes,
  shipPrize,
  applyFeeDiscount,
  recordRedemption,
  sendRedemptionNotification,
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
export interface RedeemPointsInput {
  userId: string;
  rewardId: string;
  pointsCost: number;
  redemptionType: "sweepstakes" | "prize" | "token" | "fee_discount";
  shippingAddress?: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  discountDetails?: {
    orderId: string;
    discountPercent: number;
  };
}

// Redemption status type
export interface RedemptionStatus {
  redemptionId: string;
  status:
    | "validating"
    | "debiting"
    | "processing"
    | "fulfilling"
    | "completed"
    | "rejected"
    | "failed";
  rewardId: string;
  redemptionType: string;
  pointsCost: number;
  pointsBalance: number;
  fulfillmentDetails?: Record<string, unknown>;
  failureReason?: string;
}

// Queries
export const getRedemptionStatusQuery = defineQuery<RedemptionStatus>("getRedemptionStatus");

/**
 * Redeem Points Workflow
 */
export async function redeemPointsWorkflow(
  input: RedeemPointsInput
): Promise<RedemptionStatus> {
  const { userId, rewardId, pointsCost, redemptionType, shippingAddress, discountDetails } = input;

  // Generate redemption ID
  const redemptionId = `redeem_${crypto.randomUUID()}`;

  // Initialize status
  const status: RedemptionStatus = {
    redemptionId,
    status: "validating",
    rewardId,
    redemptionType,
    pointsCost,
    pointsBalance: 0,
  };

  // Set up query handler
  setHandler(getRedemptionStatusQuery, () => status);

  try {
    // Log redemption attempt
    await recordAuditLog({
      userId,
      action: "redemption_started",
      resourceType: "redemption",
      resourceId: redemptionId,
      metadata: { rewardId, redemptionType, pointsCost },
    });

    // =========================================================================
    // Step 1: Validate eligibility
    // =========================================================================
    const [pointsBalance, reward, eligibility] = await Promise.all([
      getUserPointsBalance(userId),
      getRewardDetails(rewardId),
      validateRedemptionEligibility(userId, rewardId),
    ]);

    status.pointsBalance = pointsBalance;

    // Check points balance
    if (pointsBalance < pointsCost) {
      status.status = "rejected";
      status.failureReason = `Insufficient points. Have ${pointsBalance}, need ${pointsCost}`;
      throw ApplicationFailure.nonRetryable("Insufficient points balance");
    }

    // Check eligibility
    if (!eligibility.eligible) {
      status.status = "rejected";
      status.failureReason = eligibility.reason;
      throw ApplicationFailure.nonRetryable(`Not eligible: ${eligibility.reason}`);
    }

    // Check reward availability
    if (!reward.available) {
      status.status = "rejected";
      status.failureReason = "Reward no longer available";
      throw ApplicationFailure.nonRetryable("Reward not available");
    }

    // Validate shipping address for physical prizes
    if (redemptionType === "prize" && reward.requiresShipping && !shippingAddress) {
      status.status = "rejected";
      status.failureReason = "Shipping address required for this prize";
      throw ApplicationFailure.nonRetryable("Shipping address required");
    }

    // =========================================================================
    // Step 2: Debit points
    // =========================================================================
    status.status = "debiting";

    await debitPoints({
      userId,
      amount: pointsCost,
      redemptionId,
      rewardId,
      description: `Redeemed for ${reward.name}`,
    });

    status.pointsBalance = pointsBalance - pointsCost;

    // =========================================================================
    // Step 3: Process redemption by type
    // =========================================================================
    status.status = "processing";

    let fulfillmentResult: Record<string, unknown> = {};

    switch (redemptionType) {
      case "sweepstakes":
        // Enter user into sweepstakes drawing
        fulfillmentResult = await enterSweepstakes({
          userId,
          redemptionId,
          sweepstakesId: reward.sweepstakesId!,
          entries: reward.entriesPerRedemption ?? 1,
        });
        break;

      case "prize":
        // Initiate prize shipping
        fulfillmentResult = await shipPrize({
          userId,
          redemptionId,
          prizeId: reward.prizeId!,
          shippingAddress: shippingAddress!,
        });
        break;

      case "fee_discount":
        // Apply fee discount to order
        fulfillmentResult = await applyFeeDiscount({
          userId,
          redemptionId,
          orderId: discountDetails!.orderId,
          discountPercent: discountDetails!.discountPercent,
        });
        break;

      case "token":
        // Token conversion is handled by a separate workflow
        fulfillmentResult = {
          note: "Token conversion will be processed separately",
          conversionWorkflowTriggered: true,
        };
        break;

      default:
        throw ApplicationFailure.nonRetryable(`Unknown redemption type: ${redemptionType}`);
    }

    status.fulfillmentDetails = fulfillmentResult;

    // =========================================================================
    // Step 4: Record redemption
    // =========================================================================
    status.status = "fulfilling";

    await recordRedemption({
      redemptionId,
      userId,
      rewardId,
      redemptionType,
      pointsCost,
      fulfillmentDetails: fulfillmentResult,
    });

    // =========================================================================
    // Step 5: Send notification
    // =========================================================================
    await sendRedemptionNotification(userId, {
      type: "redemption_complete",
      redemptionId,
      rewardName: reward.name,
      redemptionType,
      pointsSpent: pointsCost,
      remainingBalance: status.pointsBalance,
      fulfillmentDetails: fulfillmentResult,
    });

    // =========================================================================
    // Step 6: Finalize
    // =========================================================================
    status.status = "completed";

    await recordAuditLog({
      userId,
      action: "redemption_completed",
      resourceType: "redemption",
      resourceId: redemptionId,
      metadata: {
        rewardId,
        redemptionType,
        pointsCost,
        fulfillmentDetails: fulfillmentResult,
      },
    });

    return status;
  } catch (error) {
    if (status.status !== "rejected") {
      status.status = "failed";
      status.failureReason = error instanceof Error ? error.message : String(error);
    }

    // Compensation: refund points if already debited
    if (status.status === "processing" || status.status === "fulfilling") {
      try {
        // Credit points back by debiting a negative amount (refund)
        await debitPoints(userId, -pointsCost, `refund_${redemptionId}`);
        await recordAuditLog({
          userId,
          action: "points_refunded",
          resourceType: "redemption",
          resourceId: redemptionId,
          metadata: { amount: pointsCost, reason: status.failureReason },
        });
      } catch (refundError) {
        // Log refund failure for manual reconciliation
        await recordAuditLog({
          userId,
          action: "points_refund_failed",
          resourceType: "redemption",
          resourceId: redemptionId,
          metadata: {
            amount: pointsCost,
            refundError: refundError instanceof Error ? refundError.message : String(refundError),
          },
        });
      }
    }

    await recordAuditLog({
      userId,
      action: "redemption_failed",
      resourceType: "redemption",
      resourceId: redemptionId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}
