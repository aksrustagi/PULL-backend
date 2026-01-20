/**
 * Asset Listing Workflow
 * Handles the process of listing RWA assets (Pokemon cards) for fractional ownership
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  verifyAssetOwnership,
  verifyGradingCertificate,
  getCurrentMarketPrice,
  validateListingDetails,
  createAssetRecord,
  createListingRecord,
  uploadAssetImages,
  notifyPotentialBuyers,
  sendListingNotification,
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

// Extended timeout for grading verification
const { verifyWithGradingCompany } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface AssetListingInput {
  sellerId: string;
  assetType: "pokemon_card" | "sports_card" | "collectible";
  assetDetails: {
    name: string;
    grade: string;
    gradingCompany: "PSA" | "BGS" | "CGC";
    certNumber: string;
    images: string[];
    description?: string;
    year?: number;
    setName?: string;
    cardNumber?: string;
  };
  totalShares: number;
  pricePerShare: number;
}

// Listing status type
export interface ListingStatus {
  listingId?: string;
  assetId?: string;
  status:
    | "validating"
    | "verifying_ownership"
    | "verifying_grading"
    | "pricing"
    | "creating_listing"
    | "notifying_buyers"
    | "active"
    | "rejected"
    | "failed";
  ownershipVerified: boolean;
  gradingVerified: boolean;
  marketPrice?: number;
  totalValue?: number;
  failureReason?: string;
}

// Signals
export const cancelListingSignal = defineSignal("cancelListing");

// Queries
export const getListingStatusQuery = defineQuery<ListingStatus>("getListingStatus");

/**
 * Asset Listing Workflow
 */
export async function assetListingWorkflow(
  input: AssetListingInput
): Promise<{ listingId: string; status: ListingStatus }> {
  const { sellerId, assetType, assetDetails, totalShares, pricePerShare } = input;

  // Generate IDs
  const assetId = `asset_${crypto.randomUUID()}`;
  const listingId = `listing_${crypto.randomUUID()}`;

  // Initialize status
  const status: ListingStatus = {
    listingId,
    assetId,
    status: "validating",
    ownershipVerified: false,
    gradingVerified: false,
  };

  // Set up query handler
  setHandler(getListingStatusQuery, () => status);

  // Track cancellation
  let cancellationRequested = false;
  setHandler(cancelListingSignal, () => {
    cancellationRequested = true;
  });

  try {
    // Log listing attempt
    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_started",
      resourceType: "listing",
      resourceId: listingId,
      metadata: { assetType, certNumber: assetDetails.certNumber },
    });

    // =========================================================================
    // Step 1: Validate listing details
    // =========================================================================
    const validation = await validateListingDetails({
      assetType,
      assetDetails,
      totalShares,
      pricePerShare,
    });

    if (!validation.valid) {
      status.status = "rejected";
      status.failureReason = validation.reason;
      throw ApplicationFailure.nonRetryable(`Validation failed: ${validation.reason}`);
    }

    // =========================================================================
    // Step 2: Verify asset ownership
    // =========================================================================
    status.status = "verifying_ownership";

    const ownershipResult = await verifyAssetOwnership(
      sellerId,
      assetDetails.gradingCompany,
      assetDetails.certNumber
    );

    if (!ownershipResult.verified) {
      status.status = "rejected";
      status.failureReason = "Unable to verify asset ownership";
      await sendListingNotification(sellerId, listingId, "rejected", "Unable to verify asset ownership");
      throw ApplicationFailure.nonRetryable("Ownership verification failed");
    }

    status.ownershipVerified = true;

    // =========================================================================
    // Step 3: Verify grading certificate
    // =========================================================================
    status.status = "verifying_grading";

    const gradingResult = await verifyGradingCertificate({
      gradingCompany: assetDetails.gradingCompany,
      certNumber: assetDetails.certNumber,
      expectedGrade: assetDetails.grade,
      cardName: assetDetails.name,
    });

    if (!gradingResult.verified) {
      status.status = "rejected";
      status.failureReason = `Grading verification failed: ${gradingResult.reason}`;
      await sendListingNotification(sellerId, listingId, "rejected", gradingResult.reason);
      throw ApplicationFailure.nonRetryable("Grading verification failed");
    }

    // Optionally verify directly with grading company
    if (gradingResult.requiresDirectVerification) {
      const directVerification = await verifyWithGradingCompany(
        assetDetails.gradingCompany,
        assetDetails.certNumber
      );

      if (!directVerification.verified) {
        status.status = "rejected";
        status.failureReason = "Direct grading company verification failed";
        throw ApplicationFailure.nonRetryable("Direct grading verification failed");
      }
    }

    status.gradingVerified = true;

    // =========================================================================
    // Step 4: Get current market price
    // =========================================================================
    status.status = "pricing";

    const marketPrice = await getCurrentMarketPrice({
      cardName: assetDetails.name,
      grade: assetDetails.grade,
      gradingCompany: assetDetails.gradingCompany,
      year: assetDetails.year,
      setName: assetDetails.setName,
    });

    status.marketPrice = marketPrice.price;
    status.totalValue = totalShares * pricePerShare;

    // Validate pricing is reasonable (within 50% of market price)
    const priceRatio = status.totalValue / marketPrice.price;
    if (priceRatio > 1.5 || priceRatio < 0.5) {
      // Allow but flag for review
      await recordAuditLog({
        userId: sellerId,
        action: "asset_listing_price_flagged",
        resourceType: "listing",
        resourceId: listingId,
        metadata: {
          listingPrice: status.totalValue,
          marketPrice: marketPrice.price,
          priceRatio,
        },
      });
    }

    // Check for cancellation
    if (cancellationRequested) {
      status.status = "rejected";
      status.failureReason = "Listing cancelled by seller";
      return { listingId, status };
    }

    // =========================================================================
    // Step 5: Create asset and listing records
    // =========================================================================
    status.status = "creating_listing";

    // Upload images
    const imageUrls = await uploadAssetImages(assetId, assetDetails.images);

    // Create asset record
    await createAssetRecord({
      assetId,
      sellerId,
      assetType,
      name: assetDetails.name,
      grade: assetDetails.grade,
      gradingCompany: assetDetails.gradingCompany,
      certNumber: assetDetails.certNumber,
      imageUrls,
      description: assetDetails.description,
      year: assetDetails.year,
      setName: assetDetails.setName,
      cardNumber: assetDetails.cardNumber,
      marketPrice: marketPrice.price,
    });

    // Create listing record
    await createListingRecord({
      listingId,
      assetId,
      sellerId,
      totalShares,
      availableShares: totalShares,
      pricePerShare,
      totalValue: status.totalValue,
    });

    // =========================================================================
    // Step 6: Notify potential buyers
    // =========================================================================
    status.status = "notifying_buyers";

    await notifyPotentialBuyers({
      listingId,
      assetId,
      assetType,
      cardName: assetDetails.name,
      grade: assetDetails.grade,
      pricePerShare,
      totalShares,
    });

    // Send success notification to seller
    await sendListingNotification(
      sellerId,
      listingId,
      "active",
      `Your ${assetDetails.name} (${assetDetails.grade}) has been listed!`
    );

    // =========================================================================
    // Step 7: Finalize
    // =========================================================================
    status.status = "active";

    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_completed",
      resourceType: "listing",
      resourceId: listingId,
      metadata: {
        assetId,
        totalShares,
        pricePerShare,
        totalValue: status.totalValue,
      },
    });

    return { listingId, status };
  } catch (error) {
    if (status.status !== "rejected") {
      status.status = "failed";
      status.failureReason = error instanceof Error ? error.message : String(error);
    }

    await recordAuditLog({
      userId: sellerId,
      action: "asset_listing_failed",
      resourceType: "listing",
      resourceId: listingId,
      metadata: { error: status.failureReason },
    });

    throw error;
  }
}
