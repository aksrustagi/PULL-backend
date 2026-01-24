/**
 * RWA (Real World Assets) Workflows
 * Re-exports RWA workflows for Temporal worker registration
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "../activities/rwa";

// Activity proxies
const {
  verifyAssetOwnership,
  verifyGradingCertificate,
  getMarketPrice,
  createListing,
  notifyPotentialBuyers,
  validateBuyerKYC,
  checkBuyingPower,
  holdFunds,
  executePurchase,
  transferOwnership,
  updateListingAvailability,
  creditSeller,
  sendPurchaseConfirmation,
  fetchPrices,
  updateAssetValuation,
  detectPriceMovement,
  sendPriceAlert,
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

// Extended timeout for external API calls
const { fetchAllAssetPrices } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "1 minute",
  },
});

// ============================================================================
// Asset Listing Workflow
// ============================================================================

export interface AssetListingInput {
  sellerId: string;
  assetType: "pokemon_card" | "sports_card" | "collectible";
  assetDetails: {
    name: string;
    grade: string;
    gradingCompany: "PSA" | "BGS" | "CGC";
    certNumber: string;
    images: string[];
  };
  totalShares: number;
  pricePerShare: number;
}

export interface AssetListingStatus {
  listingId?: string;
  status:
    | "validating"
    | "verifying_ownership"
    | "verifying_certificate"
    | "pricing"
    | "creating"
    | "completed"
    | "failed";
  marketPrice?: number;
  suggestedPrice?: number;
  rejectionReason?: string;
}

export const getAssetListingStatusQuery = defineQuery<AssetListingStatus>("getAssetListingStatus");

export async function assetListingWorkflow(
  input: AssetListingInput
): Promise<{ listingId: string; status: AssetListingStatus }> {
  const { sellerId, assetType, assetDetails, totalShares, pricePerShare } = input;

  const listingId = `listing_${crypto.randomUUID()}`;

  const status: AssetListingStatus = {
    listingId,
    status: "validating",
  };

  setHandler(getAssetListingStatusQuery, () => status);

  try {
    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_started",
      resourceType: "listing",
      resourceId: listingId,
      metadata: { assetType, totalShares, pricePerShare },
    });

    // Step 1: Verify asset ownership
    status.status = "verifying_ownership";

    const ownership = await verifyAssetOwnership({
      sellerId,
      certNumber: assetDetails.certNumber,
      gradingCompany: assetDetails.gradingCompany,
    });

    if (!ownership.verified) {
      status.status = "failed";
      status.rejectionReason = ownership.reason;
      throw ApplicationFailure.nonRetryable(`Ownership verification failed: ${ownership.reason}`);
    }

    // Step 2: Verify grading certificate
    status.status = "verifying_certificate";

    const certificate = await verifyGradingCertificate({
      certNumber: assetDetails.certNumber,
      gradingCompany: assetDetails.gradingCompany,
      expectedGrade: assetDetails.grade,
    });

    if (!certificate.valid) {
      status.status = "failed";
      status.rejectionReason = certificate.reason;
      throw ApplicationFailure.nonRetryable(`Certificate verification failed: ${certificate.reason}`);
    }

    // Step 3: Get market price
    status.status = "pricing";

    const marketPrice = await getMarketPrice({
      assetType,
      name: assetDetails.name,
      grade: assetDetails.grade,
      gradingCompany: assetDetails.gradingCompany,
    });

    status.marketPrice = marketPrice.price;
    status.suggestedPrice = marketPrice.price / totalShares;

    // Step 4: Create listing
    status.status = "creating";

    await createListing({
      listingId,
      sellerId,
      assetType,
      assetDetails: {
        ...assetDetails,
        verifiedGrade: certificate.grade,
        verifiedAt: new Date().toISOString(),
      },
      totalShares,
      availableShares: totalShares,
      pricePerShare,
      marketPrice: marketPrice.price,
      status: "active",
    });

    // Step 5: Notify potential buyers
    await notifyPotentialBuyers({
      listingId,
      assetType,
      assetName: assetDetails.name,
      grade: assetDetails.grade,
      pricePerShare,
      totalShares,
    });

    // Step 6: Finalize
    status.status = "completed";

    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_completed",
      resourceType: "listing",
      resourceId: listingId,
      metadata: {
        assetType,
        totalShares,
        pricePerShare,
        marketPrice: marketPrice.price,
      },
    });

    return { listingId, status };
  } catch (error) {
    if (status.status !== "failed") {
      status.status = "failed";
      status.rejectionReason = error instanceof Error ? error.message : String(error);
    }

    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_failed",
      resourceType: "listing",
      resourceId: listingId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// ============================================================================
// RWA Purchase Workflow
// ============================================================================

export interface RWAPurchaseInput {
  listingId: string;
  buyerId: string;
  shares: number;
}

export interface RWAPurchaseStatus {
  purchaseId?: string;
  status:
    | "validating"
    | "checking_kyc"
    | "checking_funds"
    | "holding_funds"
    | "executing"
    | "transferring"
    | "completing"
    | "completed"
    | "failed";
  totalCost?: number;
  rejectionReason?: string;
}

// Signals
export const purchaseCancelledSignal = defineSignal("purchaseCancelled");

export const getRWAPurchaseStatusQuery = defineQuery<RWAPurchaseStatus>("getRWAPurchaseStatus");

export async function rwaPurchaseWorkflow(
  input: RWAPurchaseInput
): Promise<{ purchaseId: string; status: RWAPurchaseStatus }> {
  const { listingId, buyerId, shares } = input;

  const purchaseId = `purchase_${crypto.randomUUID()}`;
  let cancelled = false;

  const status: RWAPurchaseStatus = {
    purchaseId,
    status: "validating",
  };

  setHandler(getRWAPurchaseStatusQuery, () => status);
  setHandler(purchaseCancelledSignal, () => {
    cancelled = true;
  });

  try {
    await recordAuditLog({
      userId: buyerId,
      action: "rwa_purchase_started",
      resourceType: "purchase",
      resourceId: purchaseId,
      metadata: { listingId, shares },
    });

    // Step 1: Validate buyer KYC (accredited for high value)
    status.status = "checking_kyc";

    const kycResult = await validateBuyerKYC({
      buyerId,
      listingId,
      shares,
    });

    if (!kycResult.valid) {
      status.status = "failed";
      status.rejectionReason = kycResult.reason;
      throw ApplicationFailure.nonRetryable(`KYC validation failed: ${kycResult.reason}`);
    }

    if (cancelled) {
      throw ApplicationFailure.nonRetryable("Purchase cancelled by user");
    }

    // Step 2: Check buying power
    status.status = "checking_funds";

    const buyingPower = await checkBuyingPower({
      buyerId,
      listingId,
      shares,
    });

    if (!buyingPower.sufficient) {
      status.status = "failed";
      status.rejectionReason = "Insufficient funds";
      throw ApplicationFailure.nonRetryable("Insufficient buying power");
    }

    status.totalCost = buyingPower.totalCost;

    if (cancelled) {
      throw ApplicationFailure.nonRetryable("Purchase cancelled by user");
    }

    // Step 3: Hold funds
    status.status = "holding_funds";

    const holdResult = await holdFunds({
      buyerId,
      purchaseId,
      amount: buyingPower.totalCost,
    });

    if (!holdResult.success) {
      status.status = "failed";
      status.rejectionReason = "Failed to hold funds";
      throw ApplicationFailure.nonRetryable("Failed to hold funds");
    }

    try {
      if (cancelled) {
        // Release the hold
        throw ApplicationFailure.nonRetryable("Purchase cancelled by user");
      }

      // Step 4: Execute purchase
      status.status = "executing";

      const purchaseResult = await executePurchase({
        purchaseId,
        listingId,
        buyerId,
        shares,
        totalCost: buyingPower.totalCost,
      });

      if (!purchaseResult.success) {
        throw ApplicationFailure.nonRetryable("Failed to execute purchase");
      }

      // Step 5: Transfer ownership records
      status.status = "transferring";

      await transferOwnership({
        purchaseId,
        listingId,
        buyerId,
        shares,
      });

      // Step 6: Update listing availability
      await updateListingAvailability({
        listingId,
        soldShares: shares,
      });

      // Step 7: Credit seller
      status.status = "completing";

      await creditSeller({
        listingId,
        amount: buyingPower.totalCost,
        purchaseId,
      });

      // Step 8: Send confirmations
      await sendPurchaseConfirmation({
        purchaseId,
        buyerId,
        listingId,
        shares,
        totalCost: buyingPower.totalCost,
      });

      // Step 9: Finalize
      status.status = "completed";

      await recordAuditLog({
        userId: buyerId,
        action: "rwa_purchase_completed",
        resourceType: "purchase",
        resourceId: purchaseId,
        metadata: {
          listingId,
          shares,
          totalCost: buyingPower.totalCost,
        },
      });

      return { purchaseId, status };
    } catch (error) {
      // Compensation: release held funds
      // Note: In production, this would be done in a non-cancellable scope

      await recordAuditLog({
        userId: buyerId,
        action: "rwa_purchase_compensating",
        resourceType: "purchase",
        resourceId: purchaseId,
        metadata: { error: "Releasing held funds" },
      });

      throw error;
    }
  } catch (error) {
    if (status.status !== "failed") {
      status.status = "failed";
      status.rejectionReason = error instanceof Error ? error.message : String(error);
    }

    await recordAuditLog({
      userId: buyerId,
      action: "rwa_purchase_failed",
      resourceType: "purchase",
      resourceId: purchaseId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// ============================================================================
// Price Update Workflow (Scheduled)
// ============================================================================

export interface PriceUpdateStatus {
  updateId: string;
  status: "fetching" | "updating" | "alerting" | "completed" | "failed";
  assetsUpdated: number;
  alertsSent: number;
  errors: Array<{ assetId: string; error: string }>;
}

export const getPriceUpdateStatusQuery = defineQuery<PriceUpdateStatus>("getPriceUpdateStatus");

export async function priceUpdateWorkflow(): Promise<PriceUpdateStatus> {
  const updateId = `price_update_${Date.now()}`;

  const status: PriceUpdateStatus = {
    updateId,
    status: "fetching",
    assetsUpdated: 0,
    alertsSent: 0,
    errors: [],
  };

  setHandler(getPriceUpdateStatusQuery, () => status);

  try {
    await recordAuditLog({
      userId: "system",
      action: "price_update_started",
      resourceType: "price_update",
      resourceId: updateId,
      metadata: {},
    });

    // Step 1: Fetch prices from external API
    const prices = await fetchAllAssetPrices();

    // Step 2: Update all asset valuations
    status.status = "updating";

    for (const asset of prices.assets) {
      try {
        const previousPrice = await updateAssetValuation({
          assetId: asset.assetId,
          newPrice: asset.price,
          source: asset.source,
          timestamp: new Date().toISOString(),
        });

        status.assetsUpdated++;

        // Step 3: Detect significant price movements
        const movement = await detectPriceMovement({
          assetId: asset.assetId,
          previousPrice: previousPrice.previousPrice,
          newPrice: asset.price,
          threshold: 0.05, // 5% threshold
        });

        if (movement.significant) {
          status.status = "alerting";

          await sendPriceAlert({
            assetId: asset.assetId,
            assetName: asset.name,
            previousPrice: previousPrice.previousPrice,
            newPrice: asset.price,
            changePercent: movement.changePercent,
            direction: movement.direction,
          });

          status.alertsSent++;
        }
      } catch (error) {
        status.errors.push({
          assetId: asset.assetId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 4: Finalize
    status.status = "completed";

    await recordAuditLog({
      userId: "system",
      action: "price_update_completed",
      resourceType: "price_update",
      resourceId: updateId,
      metadata: {
        assetsUpdated: status.assetsUpdated,
        alertsSent: status.alertsSent,
        errors: status.errors.length,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: "system",
      action: "price_update_failed",
      resourceType: "price_update",
      resourceId: updateId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
