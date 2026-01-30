/**
 * RWA Activities - Re-export from packages/core with additional aliases
 */

import { Context } from "@temporalio/activity";

// Import all needed functions explicitly
import {
  // Verification
  verifyAssetOwnership,
  verifyGradingCertificate,
  // Pricing
  getCurrentMarketPrice,
  fetchBatchPrices,
  // Listings
  createListingRecord,
  getListingDetails,
  updateListingAvailability,
  // Buyer operations
  validateBuyerKYC,
  checkBuyerBuyingPower,
  holdBuyerFunds,
  releaseBuyerFunds,
  // Purchase operations
  executePurchase,
  transferOwnership,
  creditSellerBalance,
  // Notifications
  notifyPotentialBuyers,
  sendPurchaseNotification,
  sendPriceAlerts,
  // Price updates
  getAllActiveAssets,
  updateAssetValuation,
  detectPriceMovement,
  recordPriceHistory,
  // Audit
  recordAuditLog,
} from "@pull/core/workflows/rwa/activities";

// Re-export with original names
export {
  verifyAssetOwnership,
  verifyGradingCertificate,
  getListingDetails,
  updateListingAvailability,
  validateBuyerKYC,
  releaseBuyerFunds,
  executePurchase,
  transferOwnership,
  notifyPotentialBuyers,
  updateAssetValuation,
  detectPriceMovement,
  recordPriceHistory,
  recordAuditLog,
};

// ============================================================================
// Alias exports for workflow compatibility
// ============================================================================

/**
 * Get market price (alias for getCurrentMarketPrice)
 */
export async function getMarketPrice(input: {
  cardName: string;
  grade: string;
  gradingCompany: string;
  year?: number;
  setName?: string;
}): Promise<{ price: number; source: string }> {
  const result = await getCurrentMarketPrice(input);
  return { price: result.price, source: result.source };
}

/**
 * Create listing (alias for createListingRecord)
 */
export async function createListing(input: {
  listingId: string;
  assetId: string;
  sellerId: string;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  totalValue: number;
}): Promise<void> {
  return createListingRecord(input);
}

/**
 * Check buying power (alias for checkBuyerBuyingPower)
 */
export async function checkBuyingPower(
  buyerId: string
): Promise<{ available: number; held: number }> {
  return checkBuyerBuyingPower(buyerId);
}

/**
 * Hold funds (alias for holdBuyerFunds)
 */
export async function holdFunds(
  buyerId: string,
  amount: number,
  reference: string
): Promise<{ holdId: string }> {
  return holdBuyerFunds(buyerId, amount, reference);
}

/**
 * Credit seller (alias for creditSellerBalance)
 */
export async function creditSeller(
  sellerId: string,
  amount: number,
  description: string
): Promise<void> {
  return creditSellerBalance(sellerId, amount, description);
}

/**
 * Send purchase confirmation (alias for sendPurchaseNotification)
 */
export async function sendPurchaseConfirmation(
  userId: string,
  purchaseId: string,
  type: "completed" | "rejected" | "sale_completed",
  message?: string
): Promise<void> {
  return sendPurchaseNotification(userId, purchaseId, type, message);
}

/**
 * Fetch prices (alias for fetchBatchPrices)
 */
export async function fetchPrices(
  assets: Array<{
    assetId: string;
    cardName: string;
    grade: string;
    gradingCompany: string;
    year?: number;
    setName?: string;
  }>
): Promise<Array<{ assetId: string; price: number | null; source: string; error?: string }>> {
  return fetchBatchPrices(assets);
}

/**
 * Send price alert (singular - alias for sendPriceAlerts)
 */
export async function sendPriceAlert(
  alerts: Array<{
    userId: string;
    assetId: string;
    assetName: string;
    previousPrice: number;
    newPrice: number;
    changePercent: number;
  }>
): Promise<void> {
  return sendPriceAlerts(alerts);
}

/**
 * Fetch all asset prices (batch operation with heartbeat)
 */
export async function fetchAllAssetPrices(): Promise<
  Array<{ assetId: string; price: number | null; source: string; error?: string }>
> {
  console.log("[RWA Activity] Fetching all asset prices");

  Context.current().heartbeat("Starting batch price fetch");

  const assets = await getAllActiveAssets();

  if (assets.length === 0) {
    return [];
  }

  Context.current().heartbeat(`Processing ${assets.length} assets`);

  return fetchBatchPrices(
    assets.map((asset) => ({
      assetId: asset.assetId,
      cardName: asset.name,
      grade: asset.grade,
      gradingCompany: asset.gradingCompany,
      year: asset.year,
      setName: asset.setName,
    }))
  );
}
