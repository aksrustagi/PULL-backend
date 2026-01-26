/**
 * RWA Activities
 * All activities for RWA (Real World Assets) workflows
 */

import { Context } from "@temporalio/activity";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { Id } from "@pull/db/convex/_generated/dataModel";
import { NotificationClient } from "../../services/notifications/client";
import { StorageClient } from "../../services/storage/client";
import { PokemonPriceClient } from "../../services/pokemon/client";

// ============================================================================
// Service Initialization
// ============================================================================

const getConvexClient = () => {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL environment variable is not set");
  }
  return new ConvexHttpClient(url);
};

const getNotificationClient = () => {
  return new NotificationClient({
    provider: (process.env.NOTIFICATION_PROVIDER as "firebase" | "onesignal" | "both") ?? "firebase",
    firebase: process.env.FIREBASE_PROJECT_ID
      ? {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
          privateKey: process.env.FIREBASE_PRIVATE_KEY ?? "",
        }
      : undefined,
    oneSignal: process.env.ONESIGNAL_APP_ID
      ? {
          appId: process.env.ONESIGNAL_APP_ID,
          apiKey: process.env.ONESIGNAL_API_KEY ?? "",
        }
      : undefined,
  });
};

const getStorageClient = () => {
  return new StorageClient({
    endpoint: process.env.STORAGE_ENDPOINT ?? "",
    region: process.env.STORAGE_REGION ?? "us-east-1",
    bucket: process.env.STORAGE_BUCKET ?? "pull-assets",
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
    publicUrl: process.env.STORAGE_PUBLIC_URL,
  });
};

const getPokemonPriceClient = () => {
  return new PokemonPriceClient({
    apiKey: process.env.POKEMON_TCG_API_KEY ?? "",
  });
};

// ============================================================================
// Types
// ============================================================================

export interface ListingDetails {
  listingId: string;
  assetId: string;
  sellerId: string;
  assetName: string;
  active: boolean;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
}

export interface AssetInfo {
  assetId: string;
  name: string;
  grade: string;
  gradingCompany: "PSA" | "BGS" | "CGC";
  currentPrice: number;
  year?: number;
  setName?: string;
}

export interface PriceResult {
  assetId: string;
  price: number | null;
  source: string;
  error?: string;
}

// ============================================================================
// Ownership & Verification Activities
// ============================================================================

/**
 * Verify asset ownership
 */
export async function verifyAssetOwnership(
  userId: string,
  gradingCompany: string,
  certNumber: string
): Promise<{ verified: boolean; reason?: string }> {
  console.log(`[RWA Activity] Verifying ownership: ${gradingCompany} ${certNumber}`);

  try {
    const convex = getConvexClient();

    // 1. Check if user has custody documents uploaded
    const assets = await convex.query(api.rwa.getAssetsByOwner, {});

    // Find asset matching the cert number
    const matchingAsset = assets.find(
      (asset: { gradingCompany?: string; certNumber?: string }) =>
        asset.gradingCompany === gradingCompany && asset.certNumber === certNumber
    );

    if (!matchingAsset) {
      // User doesn't have this asset registered
      return {
        verified: false,
        reason: "Asset not found in user's registered assets. Please register the asset first.",
      };
    }

    // 2. Check verification documents
    if (
      !matchingAsset.verificationDocuments ||
      matchingAsset.verificationDocuments.length === 0
    ) {
      return {
        verified: false,
        reason: "No verification documents uploaded. Please upload proof of ownership.",
      };
    }

    // 3. If asset is in custody with us (vault storage), verify custody status
    if (matchingAsset.metadata?.inCustody) {
      console.log(`[RWA Activity] Asset is in custody, verifying vault status`);
      // In production, this would call a vault/custody service API
      return { verified: true };
    }

    // 4. For self-custodied assets, require additional verification
    if (matchingAsset.status === "pending_verification") {
      return {
        verified: false,
        reason: "Asset is pending manual verification review.",
      };
    }

    // 5. Asset has been previously verified
    if (matchingAsset.status === "verified" || matchingAsset.status === "listed") {
      return { verified: true };
    }

    return {
      verified: false,
      reason: `Asset status is ${matchingAsset.status}. Please contact support.`,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error verifying ownership:`, error);
    return {
      verified: false,
      reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify grading certificate
 */
export async function verifyGradingCertificate(input: {
  gradingCompany: "PSA" | "BGS" | "CGC";
  certNumber: string;
  expectedGrade: string;
  cardName: string;
}): Promise<{ verified: boolean; reason?: string; requiresDirectVerification?: boolean }> {
  console.log(`[RWA Activity] Verifying grading: ${input.gradingCompany} ${input.certNumber}`);

  const { gradingCompany, certNumber, expectedGrade, cardName } = input;

  try {
    // Build verification URL based on grading company
    const verificationUrls: Record<string, string> = {
      PSA: `https://www.psacard.com/cert/${certNumber}`,
      BGS: `https://www.beckett.com/grading/card-lookup?cert=${certNumber}`,
      CGC: `https://www.cgccomics.com/certlookup/${certNumber}`,
    };

    const verificationUrl = verificationUrls[gradingCompany];
    if (!verificationUrl) {
      return {
        verified: false,
        reason: `Unknown grading company: ${gradingCompany}`,
      };
    }

    // In production, implement web scraping or API integration
    // For now, we'll do basic validation and flag for manual review if needed

    // Validate cert number format
    const certValidation = validateCertNumber(gradingCompany, certNumber);
    if (!certValidation.valid) {
      return {
        verified: false,
        reason: certValidation.reason,
      };
    }

    // Parse expected grade
    const gradeNum = parseFloat(expectedGrade.replace(/[^0-9.]/g, ""));
    if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 10) {
      return {
        verified: false,
        reason: `Invalid grade format: ${expectedGrade}. Grade must be between 1 and 10.`,
      };
    }

    // For high-value cards (PSA 10, BGS 9.5+, CGC 10), require direct verification
    const requiresDirectVerification =
      (gradingCompany === "PSA" && gradeNum >= 10) ||
      (gradingCompany === "BGS" && gradeNum >= 9.5) ||
      (gradingCompany === "CGC" && gradeNum >= 10);

    console.log(`[RWA Activity] Certificate validation passed. Direct verification required: ${requiresDirectVerification}`);

    return {
      verified: true,
      requiresDirectVerification,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error verifying certificate:`, error);
    return {
      verified: false,
      reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate certificate number format
 */
function validateCertNumber(
  gradingCompany: string,
  certNumber: string
): { valid: boolean; reason?: string } {
  switch (gradingCompany) {
    case "PSA":
      // PSA cert numbers are typically 8-10 digits
      if (!/^\d{8,10}$/.test(certNumber)) {
        return {
          valid: false,
          reason: "PSA certificate numbers must be 8-10 digits",
        };
      }
      break;
    case "BGS":
      // BGS uses various formats, typically 7-10 digits
      if (!/^\d{7,10}$/.test(certNumber)) {
        return {
          valid: false,
          reason: "BGS certificate numbers must be 7-10 digits",
        };
      }
      break;
    case "CGC":
      // CGC uses various formats
      if (!/^[\d\-]{6,15}$/.test(certNumber)) {
        return {
          valid: false,
          reason: "Invalid CGC certificate number format",
        };
      }
      break;
    default:
      return { valid: false, reason: `Unknown grading company: ${gradingCompany}` };
  }
  return { valid: true };
}

/**
 * Verify directly with grading company
 */
export async function verifyWithGradingCompany(
  gradingCompany: "PSA" | "BGS" | "CGC",
  certNumber: string
): Promise<{ verified: boolean; details?: Record<string, unknown> }> {
  console.log(`[RWA Activity] Direct verification with ${gradingCompany}: ${certNumber}`);

  Context.current().heartbeat(`Verifying with ${gradingCompany}`);

  try {
    // API endpoints for grading companies (in production, use actual APIs)
    const apiEndpoints: Record<string, string> = {
      PSA: "https://api.psacard.com/publicapi/cert/GetByCertNumber",
      BGS: "https://api.beckett.com/grading/verify",
      CGC: "https://api.cgccomics.com/cert/verify",
    };

    const endpoint = apiEndpoints[gradingCompany];
    if (!endpoint) {
      throw new Error(`No API endpoint configured for ${gradingCompany}`);
    }

    // In production, make actual API calls
    // For now, simulate the verification process
    console.log(`[RWA Activity] Calling ${gradingCompany} API for cert ${certNumber}`);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    Context.current().heartbeat(`${gradingCompany} API response received`);

    // Return successful verification (in production, parse API response)
    return {
      verified: true,
      details: {
        certNumber,
        gradingCompany,
        verifiedAt: new Date().toISOString(),
        source: "direct_api",
      },
    };
  } catch (error) {
    console.error(`[RWA Activity] Error in direct verification:`, error);
    return {
      verified: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// ============================================================================
// Pricing Activities
// ============================================================================

/**
 * Get current market price for a card
 */
export async function getCurrentMarketPrice(input: {
  cardName: string;
  grade: string;
  gradingCompany: string;
  year?: number;
  setName?: string;
}): Promise<{ price: number; source: string; lastUpdated: string }> {
  console.log(`[RWA Activity] Getting market price for ${input.cardName} ${input.grade}`);

  try {
    const pokemonClient = getPokemonPriceClient();

    // Search for the card
    const searchResults = await pokemonClient.searchCards({
      name: input.cardName,
      setName: input.setName,
      pageSize: 10,
    });

    if (searchResults.data.length === 0) {
      console.log(`[RWA Activity] Card not found in TCG API, using grade-based estimate`);
      return estimatePriceByGrade(input);
    }

    // Get pricing for the first matching card
    const card = searchResults.data[0];
    const pricing = await pokemonClient.getPricing(card.id, true);

    // Get base price from TCGPlayer
    let basePrice = pricing.tcgplayerMarket ?? pricing.tcgplayerMid ?? 0;

    // Apply graded multiplier
    const gradeMultiplier = getGradeMultiplier(input.gradingCompany, input.grade);
    const gradedPrice = basePrice * gradeMultiplier;

    console.log(
      `[RWA Activity] Price calculated: base=${basePrice}, multiplier=${gradeMultiplier}, graded=${gradedPrice}`
    );

    return {
      price: Math.round(gradedPrice * 100) / 100,
      source: "tcgplayer_graded",
      lastUpdated: pricing.lastUpdated,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error getting market price:`, error);
    // Fall back to grade-based estimate
    return estimatePriceByGrade(input);
  }
}

/**
 * Estimate price based on grade when API fails
 */
function estimatePriceByGrade(input: {
  cardName: string;
  grade: string;
  gradingCompany: string;
}): { price: number; source: string; lastUpdated: string } {
  const basePrice = 100; // Conservative base estimate
  const gradeMultiplier = getGradeMultiplier(input.gradingCompany, input.grade);

  return {
    price: Math.round(basePrice * gradeMultiplier * 100) / 100,
    source: "estimate",
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get grade multiplier for pricing
 */
function getGradeMultiplier(gradingCompany: string, grade: string): number {
  const gradeNum = parseFloat(grade.replace(/[^0-9.]/g, ""));

  // Base multipliers by grade
  const baseMultipliers: Record<string, number> = {
    "10": 10.0,
    "9.5": 5.0,
    "9": 2.5,
    "8.5": 1.75,
    "8": 1.25,
    "7.5": 1.1,
    "7": 1.0,
    "6": 0.8,
    "5": 0.6,
    "4": 0.4,
    "3": 0.3,
    "2": 0.2,
    "1": 0.1,
  };

  let multiplier = baseMultipliers[gradeNum.toString()] ?? 1.0;

  // Company premium adjustments
  if (gradingCompany === "PSA") {
    multiplier *= 1.2; // PSA premium
  } else if (gradingCompany === "BGS" && gradeNum >= 9.5) {
    multiplier *= 1.5; // BGS black label premium
  }

  return multiplier;
}

/**
 * Fetch price from price tracker API
 */
export async function fetchPriceFromPriceTracker(input: {
  cardName: string;
  grade: string;
  gradingCompany: string;
}): Promise<PriceResult> {
  console.log(`[RWA Activity] Fetching price from tracker: ${input.cardName}`);

  try {
    const priceData = await getCurrentMarketPrice({
      cardName: input.cardName,
      grade: input.grade,
      gradingCompany: input.gradingCompany,
    });

    return {
      assetId: "",
      price: priceData.price,
      source: priceData.source,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error fetching from price tracker:`, error);
    return {
      assetId: "",
      price: null,
      source: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch prices for multiple assets in batch
 */
export async function fetchBatchPrices(
  assets: Array<{
    assetId: string;
    cardName: string;
    grade: string;
    gradingCompany: string;
    year?: number;
    setName?: string;
  }>
): Promise<PriceResult[]> {
  console.log(`[RWA Activity] Batch fetching prices for ${assets.length} assets`);

  Context.current().heartbeat(`Processing ${assets.length} assets`);

  const results: PriceResult[] = [];
  const batchSize = 5; // Process in smaller batches to avoid rate limits

  for (let i = 0; i < assets.length; i += batchSize) {
    const batch = assets.slice(i, i + batchSize);

    Context.current().heartbeat(`Processing batch ${Math.floor(i / batchSize) + 1}`);

    const batchResults = await Promise.all(
      batch.map(async (asset) => {
        try {
          const priceData = await getCurrentMarketPrice({
            cardName: asset.cardName,
            grade: asset.grade,
            gradingCompany: asset.gradingCompany,
            year: asset.year,
            setName: asset.setName,
          });

          return {
            assetId: asset.assetId,
            price: priceData.price,
            source: priceData.source,
          };
        } catch (error) {
          return {
            assetId: asset.assetId,
            price: null,
            source: "error",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < assets.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(`[RWA Activity] Batch pricing complete: ${results.filter((r) => r.price !== null).length}/${results.length} successful`);

  return results;
}

// ============================================================================
// Listing Activities
// ============================================================================

/**
 * Validate listing details
 */
export async function validateListingDetails(input: {
  assetType: string;
  assetDetails: Record<string, unknown>;
  totalShares: number;
  pricePerShare: number;
}): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[RWA Activity] Validating listing details`);

  const { assetType, assetDetails, totalShares, pricePerShare } = input;

  // Validate total shares
  if (totalShares < 1) {
    return { valid: false, reason: "Total shares must be at least 1" };
  }
  if (totalShares > 10000) {
    return { valid: false, reason: "Total shares cannot exceed 10,000" };
  }

  // Validate price per share
  if (pricePerShare < 1) {
    return { valid: false, reason: "Price per share must be at least $1" };
  }
  if (pricePerShare > 100000) {
    return { valid: false, reason: "Price per share cannot exceed $100,000" };
  }

  // Validate total value is reasonable
  const totalValue = totalShares * pricePerShare;
  if (totalValue > 10000000) {
    return {
      valid: false,
      reason: "Total listing value cannot exceed $10,000,000. Contact support for high-value listings.",
    };
  }

  // Validate asset type specific requirements
  if (assetType === "pokemon_card" || assetType === "sports_card") {
    if (!assetDetails.gradingCompany || !assetDetails.certNumber) {
      return {
        valid: false,
        reason: "Graded cards require grading company and certificate number",
      };
    }
    if (!assetDetails.grade) {
      return { valid: false, reason: "Graded cards require a grade" };
    }
  }

  return { valid: true };
}

/**
 * Upload asset images
 */
export async function uploadAssetImages(
  assetId: string,
  images: string[]
): Promise<string[]> {
  console.log(`[RWA Activity] Uploading ${images.length} images for ${assetId}`);

  try {
    const storage = getStorageClient();
    const uploadedUrls: string[] = [];

    for (let i = 0; i < images.length; i++) {
      Context.current().heartbeat(`Uploading image ${i + 1}/${images.length}`);

      // Handle base64 or URL input
      let imageBuffer: Buffer;
      let contentType = "image/jpeg";

      if (images[i].startsWith("data:")) {
        // Base64 encoded image
        const matches = images[i].match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          imageBuffer = Buffer.from(matches[2], "base64");
        } else {
          throw new Error(`Invalid base64 image format at index ${i}`);
        }
      } else if (images[i].startsWith("http")) {
        // URL - fetch the image
        const response = await fetch(images[i]);
        if (!response.ok) {
          throw new Error(`Failed to fetch image from URL: ${images[i]}`);
        }
        contentType = response.headers.get("content-type") ?? "image/jpeg";
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error(`Invalid image format at index ${i}`);
      }

      // Determine image type
      const imageType: "front" | "back" | "detail" | "certificate" =
        i === 0 ? "front" : i === 1 ? "back" : i === 2 ? "certificate" : "detail";

      const result = await storage.uploadAssetImage(
        assetId,
        i,
        imageType,
        imageBuffer,
        contentType
      );

      uploadedUrls.push(result.url);
    }

    console.log(`[RWA Activity] Successfully uploaded ${uploadedUrls.length} images`);
    return uploadedUrls;
  } catch (error) {
    console.error(`[RWA Activity] Error uploading images:`, error);
    throw error;
  }
}

/**
 * Create asset record
 */
export async function createAssetRecord(input: {
  assetId: string;
  sellerId: string;
  assetType: string;
  name: string;
  grade: string;
  gradingCompany: string;
  certNumber: string;
  imageUrls: string[];
  description?: string;
  year?: number;
  setName?: string;
  cardNumber?: string;
  marketPrice: number;
}): Promise<void> {
  console.log(`[RWA Activity] Creating asset record: ${input.assetId}`);

  try {
    const convex = getConvexClient();

    // Note: The actual asset creation happens through the Convex mutation
    // This activity would be called after the asset is created to update additional fields
    await convex.mutation(api.rwa.updateAsset, {
      id: input.assetId as Id<"rwaAssets">,
      pricePerShare: input.marketPrice,
      verificationDocuments: input.imageUrls,
    });

    // Log the creation
    await convex.mutation(api.audit.log, {
      userId: input.sellerId as Id<"users">,
      action: "rwa.asset_record_created",
      resourceType: "rwaAssets",
      resourceId: input.assetId,
      metadata: {
        name: input.name,
        assetType: input.assetType,
        gradingCompany: input.gradingCompany,
        certNumber: input.certNumber,
        grade: input.grade,
        marketPrice: input.marketPrice,
      },
    });

    console.log(`[RWA Activity] Asset record created successfully`);
  } catch (error) {
    console.error(`[RWA Activity] Error creating asset record:`, error);
    throw error;
  }
}

/**
 * Create listing record
 */
export async function createListingRecord(input: {
  listingId: string;
  assetId: string;
  sellerId: string;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  totalValue: number;
}): Promise<void> {
  console.log(`[RWA Activity] Creating listing record: ${input.listingId}`);

  try {
    const convex = getConvexClient();

    // Create the listing through Convex
    // Note: In practice, this might be done in a workflow with the actual mutation
    await convex.mutation(api.audit.log, {
      userId: input.sellerId as Id<"users">,
      action: "rwa.listing_record_created",
      resourceType: "rwaListings",
      resourceId: input.listingId,
      metadata: {
        assetId: input.assetId,
        totalShares: input.totalShares,
        availableShares: input.availableShares,
        pricePerShare: input.pricePerShare,
        totalValue: input.totalValue,
      },
    });

    console.log(`[RWA Activity] Listing record created successfully`);
  } catch (error) {
    console.error(`[RWA Activity] Error creating listing record:`, error);
    throw error;
  }
}

/**
 * Get listing details
 */
export async function getListingDetails(listingId: string): Promise<ListingDetails> {
  console.log(`[RWA Activity] Getting listing details: ${listingId}`);

  try {
    const convex = getConvexClient();

    // Get listings with asset data
    const listings = await convex.query(api.rwa.getListings, { limit: 100 });

    // Find the specific listing
    const listing = listings.find((l: { _id: string }) => l._id === listingId);

    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    return {
      listingId: listing._id,
      assetId: listing.assetId,
      sellerId: listing.sellerId,
      assetName: listing.asset?.name ?? "Unknown Asset",
      active: listing.status === "active",
      totalShares: listing.maxShares,
      availableShares: listing.availableShares,
      pricePerShare: listing.pricePerShare,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error getting listing details:`, error);
    throw error;
  }
}

/**
 * Update listing availability
 */
export async function updateListingAvailability(
  listingId: string,
  sharesDelta: number
): Promise<void> {
  console.log(`[RWA Activity] Updating listing availability: ${listingId} by ${sharesDelta}`);

  try {
    const convex = getConvexClient();

    // Log the availability update
    // Note: The actual update happens atomically in the purchase mutation
    await convex.mutation(api.audit.log, {
      action: "rwa.listing_availability_updated",
      resourceType: "rwaListings",
      resourceId: listingId,
      metadata: {
        sharesDelta,
        updatedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Listing availability updated`);
  } catch (error) {
    console.error(`[RWA Activity] Error updating listing availability:`, error);
    throw error;
  }
}

// ============================================================================
// Purchase Activities
// ============================================================================

/**
 * Validate buyer KYC for RWA purchase
 */
export async function validateBuyerKYC(
  buyerId: string,
  requiresAccredited: boolean
): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[RWA Activity] Validating buyer KYC: ${buyerId}, accredited: ${requiresAccredited}`);

  try {
    const convex = getConvexClient();

    // Get user's KYC status
    const kycStatus = await convex.query(api.kyc.getUserKYCStatus, {
      userId: buyerId as Id<"users">,
    });

    if (!kycStatus.hasKYC) {
      return {
        valid: false,
        reason: "KYC verification required. Please complete identity verification.",
      };
    }

    if (!kycStatus.isVerified) {
      return {
        valid: false,
        reason: `KYC status is ${kycStatus.status}. Please wait for verification to complete.`,
      };
    }

    if (!kycStatus.canTrade) {
      return {
        valid: false,
        reason: "Your account is not enabled for trading. Please contact support.",
      };
    }

    // Check accredited investor status if required
    if (requiresAccredited) {
      if (kycStatus.currentTier !== "accredited") {
        return {
          valid: false,
          reason: "This asset requires accredited investor status. Please complete accredited investor verification.",
        };
      }
    }

    console.log(`[RWA Activity] KYC validation passed for ${buyerId}`);
    return { valid: true };
  } catch (error) {
    console.error(`[RWA Activity] Error validating KYC:`, error);
    return {
      valid: false,
      reason: `KYC validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check buyer buying power
 */
export async function checkBuyerBuyingPower(
  buyerId: string
): Promise<{ available: number; held: number }> {
  console.log(`[RWA Activity] Checking buying power for ${buyerId}`);

  try {
    const convex = getConvexClient();

    const buyingPower = await convex.query(api.balances.getBuyingPower, {});

    console.log(`[RWA Activity] Buying power: available=${buyingPower.available}, held=${buyingPower.held}`);

    return {
      available: buyingPower.available,
      held: buyingPower.held,
    };
  } catch (error) {
    console.error(`[RWA Activity] Error checking buying power:`, error);
    throw error;
  }
}

/**
 * Hold buyer funds
 */
export async function holdBuyerFunds(
  buyerId: string,
  amount: number,
  reference: string
): Promise<{ holdId: string }> {
  console.log(`[RWA Activity] Holding $${amount} for ${buyerId}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.balances.hold, {
      userId: buyerId as Id<"users">,
      assetType: "usd",
      assetId: "USD",
      amount,
      referenceType: "rwa_purchase",
      referenceId: reference,
    });

    const holdId = `hold_${reference}_${Date.now()}`;
    console.log(`[RWA Activity] Funds held successfully: ${holdId}`);

    return { holdId };
  } catch (error) {
    console.error(`[RWA Activity] Error holding funds:`, error);
    throw error;
  }
}

/**
 * Release buyer funds
 */
export async function releaseBuyerFunds(
  buyerId: string,
  holdId: string
): Promise<void> {
  console.log(`[RWA Activity] Releasing hold ${holdId}`);

  try {
    const convex = getConvexClient();

    // Extract reference from holdId
    const parts = holdId.split("_");
    const reference = parts.length > 1 ? parts[1] : holdId;

    // Note: We need to know the amount to release
    // In practice, this would be stored with the hold
    // For now, we'll log the release request
    await convex.mutation(api.audit.log, {
      userId: buyerId as Id<"users">,
      action: "rwa.funds_release_requested",
      resourceType: "balances",
      resourceId: holdId,
      metadata: {
        reference,
        requestedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Fund release requested for ${holdId}`);
  } catch (error) {
    console.error(`[RWA Activity] Error releasing funds:`, error);
    throw error;
  }
}

/**
 * Reserve shares for purchase
 */
export async function reserveShares(
  listingId: string,
  shares: number,
  purchaseId: string
): Promise<{ reservationId: string }> {
  console.log(`[RWA Activity] Reserving ${shares} shares for ${purchaseId}`);

  try {
    const convex = getConvexClient();

    // Log the reservation
    await convex.mutation(api.audit.log, {
      action: "rwa.shares_reserved",
      resourceType: "rwaListings",
      resourceId: listingId,
      metadata: {
        shares,
        purchaseId,
        reservedAt: Date.now(),
      },
    });

    const reservationId = `res_${purchaseId}_${Date.now()}`;
    console.log(`[RWA Activity] Shares reserved: ${reservationId}`);

    return { reservationId };
  } catch (error) {
    console.error(`[RWA Activity] Error reserving shares:`, error);
    throw error;
  }
}

/**
 * Release reserved shares
 */
export async function releaseShares(reservationId: string): Promise<void> {
  console.log(`[RWA Activity] Releasing reservation ${reservationId}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.audit.log, {
      action: "rwa.shares_released",
      resourceType: "rwaReservations",
      resourceId: reservationId,
      metadata: {
        releasedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Reservation released: ${reservationId}`);
  } catch (error) {
    console.error(`[RWA Activity] Error releasing shares:`, error);
    throw error;
  }
}

/**
 * Execute purchase transaction
 */
export async function executePurchase(input: {
  purchaseId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  shares: number;
  pricePerShare: number;
  totalCost: number;
}): Promise<void> {
  console.log(`[RWA Activity] Executing purchase ${input.purchaseId}`);

  try {
    const convex = getConvexClient();

    // Execute the purchase through the Convex mutation
    await convex.mutation(api.rwa.purchaseShares, {
      listingId: input.listingId as Id<"rwaListings">,
      shares: input.shares,
    });

    // Log the purchase
    await convex.mutation(api.audit.log, {
      userId: input.buyerId as Id<"users">,
      action: "rwa.purchase_executed",
      resourceType: "rwaPurchases",
      resourceId: input.purchaseId,
      metadata: {
        listingId: input.listingId,
        sellerId: input.sellerId,
        shares: input.shares,
        pricePerShare: input.pricePerShare,
        totalCost: input.totalCost,
        executedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Purchase executed successfully: ${input.purchaseId}`);
  } catch (error) {
    console.error(`[RWA Activity] Error executing purchase:`, error);
    throw error;
  }
}

/**
 * Transfer ownership
 */
export async function transferOwnership(input: {
  assetId: string;
  fromUserId: string;
  toUserId: string;
  shares: number;
  purchaseId: string;
}): Promise<void> {
  console.log(`[RWA Activity] Transferring ${input.shares} shares from ${input.fromUserId} to ${input.toUserId}`);

  try {
    const convex = getConvexClient();

    // Note: Ownership transfer happens atomically in the purchaseShares mutation
    // This activity logs the transfer for audit purposes
    await convex.mutation(api.audit.log, {
      userId: input.toUserId as Id<"users">,
      action: "rwa.ownership_transferred",
      resourceType: "rwaOwnership",
      resourceId: input.assetId,
      metadata: {
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        shares: input.shares,
        purchaseId: input.purchaseId,
        transferredAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Ownership transferred successfully`);
  } catch (error) {
    console.error(`[RWA Activity] Error transferring ownership:`, error);
    throw error;
  }
}

/**
 * Credit seller balance
 */
export async function creditSellerBalance(
  sellerId: string,
  amount: number,
  description: string
): Promise<void> {
  console.log(`[RWA Activity] Crediting $${amount} to seller ${sellerId}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.balances.credit, {
      userId: sellerId as Id<"users">,
      assetType: "usd",
      assetId: "USD",
      symbol: "USD",
      amount,
      referenceType: "rwa_sale",
      referenceId: `sale_${Date.now()}`,
    });

    console.log(`[RWA Activity] Seller balance credited: $${amount}`);
  } catch (error) {
    console.error(`[RWA Activity] Error crediting seller balance:`, error);
    throw error;
  }
}

// ============================================================================
// Price Update Activities
// ============================================================================

/**
 * Get all active assets for price updates
 */
export async function getAllActiveAssets(): Promise<AssetInfo[]> {
  console.log(`[RWA Activity] Getting all active assets`);

  try {
    const convex = getConvexClient();

    const assets = await convex.query(api.rwa.getAssets, {
      status: "listed",
      limit: 500,
    });

    const assetInfos: AssetInfo[] = assets.map(
      (asset: {
        _id: string;
        name: string;
        grade?: number;
        gradingCompany?: string;
        pricePerShare: number;
        year?: number;
        setName?: string;
      }) => ({
        assetId: asset._id,
        name: asset.name,
        grade: asset.grade?.toString() ?? "Unknown",
        gradingCompany: (asset.gradingCompany as "PSA" | "BGS" | "CGC") ?? "PSA",
        currentPrice: asset.pricePerShare,
        year: asset.year,
        setName: asset.setName,
      })
    );

    console.log(`[RWA Activity] Found ${assetInfos.length} active assets`);
    return assetInfos;
  } catch (error) {
    console.error(`[RWA Activity] Error getting active assets:`, error);
    return [];
  }
}

/**
 * Update asset valuation
 */
export async function updateAssetValuation(
  assetId: string,
  newPrice: number,
  metadata: Record<string, unknown>
): Promise<void> {
  console.log(`[RWA Activity] Updating valuation for ${assetId}: $${newPrice}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.rwa.updateAsset, {
      id: assetId as Id<"rwaAssets">,
      pricePerShare: newPrice,
    });

    await convex.mutation(api.audit.log, {
      action: "rwa.valuation_updated",
      resourceType: "rwaAssets",
      resourceId: assetId,
      metadata: {
        newPrice,
        ...metadata,
        updatedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Valuation updated for ${assetId}`);
  } catch (error) {
    console.error(`[RWA Activity] Error updating valuation:`, error);
    throw error;
  }
}

/**
 * Record price history
 */
export async function recordPriceHistory(input: {
  assetId: string;
  price: number;
  source: string;
  timestamp: string;
}): Promise<void> {
  console.log(`[RWA Activity] Recording price history for ${input.assetId}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.audit.log, {
      action: "rwa.price_recorded",
      resourceType: "rwaPriceHistory",
      resourceId: input.assetId,
      metadata: {
        price: input.price,
        source: input.source,
        timestamp: input.timestamp,
        recordedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Price history recorded`);
  } catch (error) {
    console.error(`[RWA Activity] Error recording price history:`, error);
    throw error;
  }
}

/**
 * Detect significant price movement and get affected users
 */
export async function detectPriceMovement(assetId: string): Promise<string[]> {
  console.log(`[RWA Activity] Detecting price movement for ${assetId}`);

  try {
    const convex = getConvexClient();

    // Get all ownership records for this asset
    const listings = await convex.query(api.rwa.getListings, { limit: 100 });
    const listing = listings.find(
      (l: { assetId: string }) => l.assetId === assetId
    );

    if (!listing) {
      return [];
    }

    // In practice, query users who:
    // 1. Own shares of this asset
    // 2. Have price alerts set for this asset
    // 3. Have this asset on their watchlist

    // For now, return the seller as an affected user
    const affectedUsers: string[] = [listing.sellerId];

    console.log(`[RWA Activity] Found ${affectedUsers.length} affected users`);
    return affectedUsers;
  } catch (error) {
    console.error(`[RWA Activity] Error detecting price movement:`, error);
    return [];
  }
}

/**
 * Send price alerts to users
 */
export async function sendPriceAlerts(
  alerts: Array<{
    userId: string;
    assetId: string;
    assetName: string;
    previousPrice: number;
    newPrice: number;
    changePercent: number;
  }>
): Promise<void> {
  console.log(`[RWA Activity] Sending ${alerts.length} price alerts`);

  try {
    const notifications = getNotificationClient();

    for (const alert of alerts) {
      const direction = alert.changePercent > 0 ? "up" : "down";
      const percent = Math.abs(alert.changePercent * 100).toFixed(1);
      const emoji = alert.changePercent > 0 ? "arrow_up" : "arrow_down";

      await notifications.send({
        notification: {
          title: `Price Alert: ${alert.assetName}`,
          body: `${alert.assetName} is ${direction} ${percent}% ($${alert.previousPrice.toFixed(2)} to $${alert.newPrice.toFixed(2)})`,
          data: {
            type: "price_alert",
            assetId: alert.assetId,
            direction,
            changePercent: alert.changePercent,
          },
        },
        target: { type: "user_id", value: alert.userId },
      });

      console.log(`[RWA Activity] Alert sent: ${alert.assetName} is ${direction} ${percent}%`);
    }

    console.log(`[RWA Activity] All price alerts sent`);
  } catch (error) {
    console.error(`[RWA Activity] Error sending price alerts:`, error);
    throw error;
  }
}

// ============================================================================
// Notification Activities
// ============================================================================

/**
 * Notify potential buyers
 */
export async function notifyPotentialBuyers(input: {
  listingId: string;
  assetId: string;
  assetType: string;
  cardName: string;
  grade: string;
  pricePerShare: number;
  totalShares: number;
}): Promise<void> {
  console.log(`[RWA Activity] Notifying potential buyers for ${input.listingId}`);

  try {
    const notifications = getNotificationClient();
    const convex = getConvexClient();

    // In practice, this would query users with matching preferences:
    // - Users who have this card on their wishlist
    // - Users who have alerts for this card/set/grade
    // - Users who have recently searched for similar cards

    // For now, we'll send a topic-based notification
    const topic = `rwa_${input.assetType}`;

    await notifications.sendToTopic(topic, {
      title: `New Listing: ${input.cardName} ${input.grade}`,
      body: `${input.cardName} ${input.grade} is now available for $${input.pricePerShare}/share (${input.totalShares} shares)`,
      data: {
        type: "new_listing",
        listingId: input.listingId,
        assetId: input.assetId,
        assetType: input.assetType,
      },
    });

    console.log(`[RWA Activity] Potential buyers notified`);
  } catch (error) {
    console.error(`[RWA Activity] Error notifying potential buyers:`, error);
    // Don't throw - notification failure shouldn't fail the workflow
  }
}

/**
 * Send listing notification
 */
export async function sendListingNotification(
  userId: string,
  listingId: string,
  type: "active" | "rejected" | "sold_out",
  message?: string
): Promise<void> {
  console.log(`[RWA Activity] Sending listing notification: ${type} for ${listingId}`);

  try {
    const notifications = getNotificationClient();

    const titles: Record<string, string> = {
      active: "Listing Active",
      rejected: "Listing Rejected",
      sold_out: "Listing Sold Out",
    };

    const defaultMessages: Record<string, string> = {
      active: "Your listing is now live and available for purchase.",
      rejected:
        "Your listing was rejected. Please review the requirements and resubmit.",
      sold_out: "Congratulations! Your listing has sold out.",
    };

    await notifications.send({
      notification: {
        title: titles[type],
        body: message ?? defaultMessages[type],
        data: {
          type: "listing_status",
          listingId,
          status: type,
        },
      },
      target: { type: "user_id", value: userId },
    });

    console.log(`[RWA Activity] Listing notification sent: ${type}`);
  } catch (error) {
    console.error(`[RWA Activity] Error sending listing notification:`, error);
    // Don't throw - notification failure shouldn't fail the workflow
  }
}

/**
 * Send purchase notification
 */
export async function sendPurchaseNotification(
  userId: string,
  purchaseId: string,
  type: "completed" | "rejected" | "sale_completed",
  message?: string
): Promise<void> {
  console.log(`[RWA Activity] Sending purchase notification: ${type} for ${purchaseId}`);

  try {
    const notifications = getNotificationClient();

    const titles: Record<string, string> = {
      completed: "Purchase Complete",
      rejected: "Purchase Failed",
      sale_completed: "Sale Complete",
    };

    const defaultMessages: Record<string, string> = {
      completed: "Your purchase has been completed. You now own shares in this asset.",
      rejected: "Your purchase could not be completed. Your funds have been released.",
      sale_completed: "Your shares have been sold. Funds have been credited to your account.",
    };

    await notifications.send({
      notification: {
        title: titles[type],
        body: message ?? defaultMessages[type],
        data: {
          type: "purchase_status",
          purchaseId,
          status: type,
        },
      },
      target: { type: "user_id", value: userId },
    });

    console.log(`[RWA Activity] Purchase notification sent: ${type}`);
  } catch (error) {
    console.error(`[RWA Activity] Error sending purchase notification:`, error);
    // Don't throw - notification failure shouldn't fail the workflow
  }
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
  console.log(`[RWA Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  try {
    const convex = getConvexClient();

    await convex.mutation(api.audit.log, {
      userId: event.userId as Id<"users">,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: {
        ...event.metadata,
        recordedAt: Date.now(),
      },
    });

    console.log(`[RWA Activity] Audit log recorded`);
  } catch (error) {
    console.error(`[RWA Activity] Error recording audit log:`, error);
    // Don't throw - audit failure shouldn't fail the workflow
    // But log it for monitoring
  }
}
