/**
 * RWA Purchase Workflow
 * Handles fractional share purchases of RWA assets
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
  getListingDetails,
  validateBuyerKYC,
  checkBuyerBuyingPower,
  holdBuyerFunds,
  releaseBuyerFunds,
  reserveShares,
  releaseShares,
  executePurchase,
  transferOwnership,
  creditSellerBalance,
  updateListingAvailability,
  sendPurchaseNotification,
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
export interface RWAPurchaseInput {
  listingId: string;
  buyerId: string;
  shares: number;
}

// Purchase status type
export interface PurchaseStatus {
  purchaseId: string;
  listingId: string;
  status:
    | "validating"
    | "checking_kyc"
    | "reserving_shares"
    | "holding_funds"
    | "executing"
    | "transferring_ownership"
    | "completed"
    | "rejected"
    | "failed";
  shares: number;
  pricePerShare?: number;
  totalCost?: number;
  kycVerified: boolean;
  fundsHeld: boolean;
  sharesReserved: boolean;
  ownershipTransferred: boolean;
  failureReason?: string;
}

// Queries
export const getPurchaseStatusQuery = defineQuery<PurchaseStatus>("getPurchaseStatus");

/**
 * RWA Purchase Workflow
 */
export async function rwaPurchaseWorkflow(
  input: RWAPurchaseInput
): Promise<{ purchaseId: string; status: PurchaseStatus }> {
  const { listingId, buyerId, shares } = input;

  // Generate purchase ID
  const purchaseId = `purchase_${crypto.randomUUID()}`;

  // Initialize status
  const status: PurchaseStatus = {
    purchaseId,
    listingId,
    status: "validating",
    shares,
    kycVerified: false,
    fundsHeld: false,
    sharesReserved: false,
    ownershipTransferred: false,
  };

  // Set up query handler
  setHandler(getPurchaseStatusQuery, () => status);

  let holdId: string | undefined;
  let reservationId: string | undefined;

  try {
    // Log purchase attempt
    await recordAuditLog({
      userId: buyerId,
      action: "rwa_purchase_started",
      resourceType: "purchase",
      resourceId: purchaseId,
      metadata: { listingId, shares },
    });

    // =========================================================================
    // Step 1: Get listing details and validate
    // =========================================================================
    const listing = await getListingDetails(listingId);

    if (!listing.active) {
      status.status = "rejected";
      status.failureReason = "Listing is no longer active";
      throw ApplicationFailure.nonRetryable("Listing not active");
    }

    if (listing.availableShares < shares) {
      status.status = "rejected";
      status.failureReason = `Only ${listing.availableShares} shares available`;
      throw ApplicationFailure.nonRetryable("Insufficient shares available");
    }

    if (listing.sellerId === buyerId) {
      status.status = "rejected";
      status.failureReason = "Cannot purchase your own listing";
      throw ApplicationFailure.nonRetryable("Cannot purchase own listing");
    }

    status.pricePerShare = listing.pricePerShare;
    status.totalCost = shares * listing.pricePerShare;

    // =========================================================================
    // Step 2: Validate buyer KYC
    // =========================================================================
    status.status = "checking_kyc";

    // Check if accredited status required for high-value purchases
    const requiresAccredited = status.totalCost >= 10000;

    const kycResult = await validateBuyerKYC(buyerId, requiresAccredited);

    if (!kycResult.valid) {
      status.status = "rejected";
      status.failureReason = kycResult.reason;
      await sendPurchaseNotification(buyerId, purchaseId, "rejected", kycResult.reason);
      throw ApplicationFailure.nonRetryable(`KYC validation failed: ${kycResult.reason}`);
    }

    status.kycVerified = true;

    // =========================================================================
    // Step 3: Check buying power
    // =========================================================================
    const buyingPower = await checkBuyerBuyingPower(buyerId);

    if (buyingPower.available < status.totalCost) {
      status.status = "rejected";
      status.failureReason = "Insufficient buying power";
      await sendPurchaseNotification(buyerId, purchaseId, "rejected", "Insufficient buying power");
      throw ApplicationFailure.nonRetryable("Insufficient buying power");
    }

    // =========================================================================
    // Step 4: Reserve shares
    // =========================================================================
    status.status = "reserving_shares";

    const reservation = await reserveShares(listingId, shares, purchaseId);
    reservationId = reservation.reservationId;
    status.sharesReserved = true;

    // =========================================================================
    // Step 5: Hold buyer funds
    // =========================================================================
    status.status = "holding_funds";

    const hold = await holdBuyerFunds(buyerId, status.totalCost, purchaseId);
    holdId = hold.holdId;
    status.fundsHeld = true;

    // =========================================================================
    // Step 6: Execute purchase
    // =========================================================================
    status.status = "executing";

    await executePurchase({
      purchaseId,
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      shares,
      pricePerShare: listing.pricePerShare,
      totalCost: status.totalCost,
    });

    // =========================================================================
    // Step 7: Transfer ownership
    // =========================================================================
    status.status = "transferring_ownership";

    await transferOwnership({
      assetId: listing.assetId,
      fromUserId: listing.sellerId,
      toUserId: buyerId,
      shares,
      purchaseId,
    });

    status.ownershipTransferred = true;

    // =========================================================================
    // Step 8: Credit seller and update listing
    // =========================================================================

    // Credit seller balance (minus platform fee)
    const platformFeeRate = 0.025; // 2.5% platform fee
    const platformFee = status.totalCost * platformFeeRate;
    const sellerProceeds = status.totalCost - platformFee;

    await creditSellerBalance(
      listing.sellerId,
      sellerProceeds,
      `Sale of ${shares} shares - ${listing.assetName}`
    );

    // Update listing availability
    await updateListingAvailability(listingId, -shares);

    // =========================================================================
    // Step 9: Send confirmations
    // =========================================================================
    status.status = "completed";

    // Notify buyer
    await sendPurchaseNotification(
      buyerId,
      purchaseId,
      "completed",
      `You now own ${shares} shares of ${listing.assetName}!`
    );

    // Notify seller
    await sendPurchaseNotification(
      listing.sellerId,
      purchaseId,
      "sale_completed",
      `You sold ${shares} shares of ${listing.assetName} for $${sellerProceeds.toFixed(2)}`
    );

    // =========================================================================
    // Step 10: Finalize
    // =========================================================================
    await recordAuditLog({
      userId: buyerId,
      action: "rwa_purchase_completed",
      resourceType: "purchase",
      resourceId: purchaseId,
      metadata: {
        listingId,
        assetId: listing.assetId,
        shares,
        totalCost: status.totalCost,
        platformFee,
      },
    });

    return { purchaseId, status };
  } catch (error) {
    // Compensation logic
    if (status.status !== "rejected") {
      status.status = "failed";
      status.failureReason = error instanceof Error ? error.message : String(error);
    }

    // Release shares reservation
    if (reservationId && status.sharesReserved) {
      try {
        await releaseShares(reservationId);
      } catch (releaseError) {
        console.error("Failed to release shares:", releaseError);
      }
    }

    // Release held funds
    if (holdId && status.fundsHeld && !status.ownershipTransferred) {
      try {
        await releaseBuyerFunds(buyerId, holdId);
      } catch (releaseError) {
        console.error("Failed to release funds:", releaseError);
      }
    }

    await recordAuditLog({
      userId: buyerId,
      action: "rwa_purchase_failed",
      resourceType: "purchase",
      resourceId: purchaseId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}
