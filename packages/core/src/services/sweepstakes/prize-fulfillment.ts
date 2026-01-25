/**
 * Prize Fulfillment System
 *
 * Handles the complete lifecycle of prize delivery:
 * - Prize claim verification
 * - KYC/tax requirements
 * - Physical and digital fulfillment
 * - Tracking and notifications
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const FulfillmentStatusSchema = z.enum([
  "pending_claim",       // Winner notified, waiting for claim
  "claimed",             // Winner claimed prize
  "pending_verification", // Awaiting KYC/verification
  "verified",            // Identity verified
  "processing",          // Being processed for delivery
  "shipped",             // Physical item shipped
  "delivered",           // Prize delivered/credited
  "expired",             // Claim period expired
  "forfeited",           // Winner forfeited prize
  "cancelled",           // Prize cancelled
]);

export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;

export interface PrizeClaim {
  id: string;
  sweepstakesId: string;
  drawingId: string;
  prizeId: string;
  userId: string;

  // Prize details
  prizeName: string;
  prizeType: string;
  prizeValue: number;

  // Claim status
  status: FulfillmentStatus;
  statusHistory: StatusChange[];

  // Verification
  kycRequired: boolean;
  kycStatus?: "pending" | "approved" | "rejected";
  kycDocuments?: KYCDocument[];

  // Tax information (for prizes over threshold)
  taxFormRequired: boolean;
  taxFormStatus?: "pending" | "submitted" | "approved";
  taxFormId?: string;

  // Fulfillment details
  fulfillmentType: "digital" | "physical" | "manual";
  fulfillmentDetails?: FulfillmentDetails;

  // Tracking
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;

  // Dates
  notifiedAt: number;
  claimedAt?: number;
  expiresAt: number;
  fulfilledAt?: number;

  // Notes
  adminNotes?: string;
}

export interface StatusChange {
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  changedAt: number;
  changedBy: string;
  reason?: string;
}

export interface KYCDocument {
  type: "government_id" | "proof_of_address" | "selfie" | "tax_form";
  status: "pending" | "approved" | "rejected";
  uploadedAt: number;
  reviewedAt?: number;
  rejectionReason?: string;
}

export interface FulfillmentDetails {
  // For digital prizes
  creditAmount?: number;
  creditType?: string;
  promoCode?: string;
  activationCode?: string;

  // For physical prizes
  shippingAddress?: ShippingAddress;
  selectedVariant?: string;
  specialInstructions?: string;

  // For experiences
  eventDate?: number;
  eventLocation?: string;
  guestCount?: number;
}

export interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface TaxForm1099 {
  id: string;
  userId: string;
  year: number;
  totalWinnings: number;
  claims: string[]; // Claim IDs
  status: "pending" | "generated" | "sent" | "acknowledged";
  generatedAt?: number;
  sentAt?: number;
}

// ============================================================================
// PRIZE FULFILLMENT SERVICE
// ============================================================================

export class PrizeFulfillmentService {
  private readonly TAX_THRESHOLD = 600; // IRS reporting threshold

  /**
   * Create a prize claim
   */
  createClaim(
    sweepstakesId: string,
    drawingId: string,
    prizeId: string,
    userId: string,
    prize: {
      name: string;
      type: string;
      value: number;
    },
    claimExpirationDays: number = 30
  ): PrizeClaim {
    const now = Date.now();

    return {
      id: `claim_${now}_${Math.random().toString(36).substr(2, 9)}`,
      sweepstakesId,
      drawingId,
      prizeId,
      userId,
      prizeName: prize.name,
      prizeType: prize.type,
      prizeValue: prize.value,
      status: "pending_claim",
      statusHistory: [{
        from: "pending_claim",
        to: "pending_claim",
        changedAt: now,
        changedBy: "system",
        reason: "Prize claim created",
      }],
      kycRequired: prize.value >= 600,
      taxFormRequired: prize.value >= this.TAX_THRESHOLD,
      fulfillmentType: this.determineFulfillmentType(prize.type),
      notifiedAt: now,
      expiresAt: now + (claimExpirationDays * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Process claim submission
   */
  processClaim(
    claim: PrizeClaim,
    fulfillmentDetails: FulfillmentDetails
  ): PrizeClaim {
    const now = Date.now();

    // Check if claim is still valid
    if (claim.status !== "pending_claim") {
      throw new Error(`Claim is not in claimable state: ${claim.status}`);
    }

    if (now > claim.expiresAt) {
      throw new Error("Claim has expired");
    }

    const updatedClaim: PrizeClaim = {
      ...claim,
      status: claim.kycRequired ? "pending_verification" : "processing",
      claimedAt: now,
      fulfillmentDetails,
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: claim.kycRequired ? "pending_verification" : "processing",
          changedAt: now,
          changedBy: "user",
          reason: "Prize claimed by winner",
        },
      ],
    };

    return updatedClaim;
  }

  /**
   * Process KYC verification
   */
  processKYCVerification(
    claim: PrizeClaim,
    approved: boolean,
    reviewerId: string,
    reason?: string
  ): PrizeClaim {
    const now = Date.now();

    const newStatus = approved ? "verified" : "pending_claim";

    return {
      ...claim,
      status: approved ? "processing" : claim.status,
      kycStatus: approved ? "approved" : "rejected",
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: approved ? "processing" : claim.status,
          changedAt: now,
          changedBy: reviewerId,
          reason: approved ? "KYC verification approved" : `KYC rejected: ${reason}`,
        },
      ],
    };
  }

  /**
   * Fulfill digital prize
   */
  fulfillDigitalPrize(
    claim: PrizeClaim,
    details: {
      creditAmount?: number;
      creditType?: string;
      promoCode?: string;
    }
  ): PrizeClaim {
    const now = Date.now();

    return {
      ...claim,
      status: "delivered",
      fulfillmentDetails: {
        ...claim.fulfillmentDetails,
        ...details,
      },
      fulfilledAt: now,
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: "delivered",
          changedAt: now,
          changedBy: "system",
          reason: "Digital prize credited to account",
        },
      ],
    };
  }

  /**
   * Ship physical prize
   */
  shipPhysicalPrize(
    claim: PrizeClaim,
    shipping: {
      trackingNumber: string;
      carrier: string;
      trackingUrl?: string;
    }
  ): PrizeClaim {
    const now = Date.now();

    return {
      ...claim,
      status: "shipped",
      trackingNumber: shipping.trackingNumber,
      carrier: shipping.carrier,
      trackingUrl: shipping.trackingUrl,
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: "shipped",
          changedAt: now,
          changedBy: "system",
          reason: `Shipped via ${shipping.carrier}`,
        },
      ],
    };
  }

  /**
   * Mark prize as delivered
   */
  markDelivered(claim: PrizeClaim, adminId: string): PrizeClaim {
    const now = Date.now();

    return {
      ...claim,
      status: "delivered",
      fulfilledAt: now,
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: "delivered",
          changedAt: now,
          changedBy: adminId,
          reason: "Prize delivery confirmed",
        },
      ],
    };
  }

  /**
   * Handle expired claim
   */
  expireClaim(claim: PrizeClaim): PrizeClaim {
    const now = Date.now();

    if (now < claim.expiresAt) {
      throw new Error("Claim has not yet expired");
    }

    return {
      ...claim,
      status: "expired",
      statusHistory: [
        ...claim.statusHistory,
        {
          from: claim.status,
          to: "expired",
          changedAt: now,
          changedBy: "system",
          reason: "Claim period expired",
        },
      ],
    };
  }

  /**
   * Generate 1099 form data
   */
  generate1099Data(
    userId: string,
    claims: PrizeClaim[],
    year: number
  ): TaxForm1099 | null {
    // Filter to delivered claims in the specified year
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();

    const qualifyingClaims = claims.filter(
      c =>
        c.status === "delivered" &&
        c.fulfilledAt &&
        c.fulfilledAt >= yearStart &&
        c.fulfilledAt < yearEnd &&
        c.prizeValue >= this.TAX_THRESHOLD
    );

    if (qualifyingClaims.length === 0) {
      return null;
    }

    const totalWinnings = qualifyingClaims.reduce(
      (sum, c) => sum + c.prizeValue,
      0
    );

    return {
      id: `1099_${userId}_${year}`,
      userId,
      year,
      totalWinnings,
      claims: qualifyingClaims.map(c => c.id),
      status: "pending",
    };
  }

  /**
   * Get fulfillment timeline
   */
  getFulfillmentTimeline(claim: PrizeClaim): Array<{
    status: string;
    timestamp: number;
    description: string;
    isComplete: boolean;
    isCurrent: boolean;
  }> {
    const steps = [
      { status: "pending_claim", description: "Winner notified" },
      { status: "claimed", description: "Prize claimed" },
      ...(claim.kycRequired
        ? [{ status: "verified", description: "Identity verified" }]
        : []),
      { status: "processing", description: "Processing fulfillment" },
      ...(claim.fulfillmentType === "physical"
        ? [{ status: "shipped", description: "Shipped" }]
        : []),
      { status: "delivered", description: "Delivered" },
    ];

    const statusOrder = steps.map(s => s.status);
    const currentIndex = statusOrder.indexOf(claim.status);

    return steps.map((step, idx) => {
      const historyEntry = claim.statusHistory.find(h => h.to === step.status);

      return {
        status: step.status,
        timestamp: historyEntry?.changedAt ?? 0,
        description: step.description,
        isComplete: idx < currentIndex || claim.status === "delivered",
        isCurrent: idx === currentIndex,
      };
    });
  }

  /**
   * Get claim statistics
   */
  getClaimStats(claims: PrizeClaim[]): {
    total: number;
    pending: number;
    processing: number;
    fulfilled: number;
    expired: number;
    totalValue: number;
    fulfilledValue: number;
  } {
    const pending = claims.filter(
      c => c.status === "pending_claim" || c.status === "pending_verification"
    ).length;
    const processing = claims.filter(
      c => c.status === "verified" || c.status === "processing" || c.status === "shipped"
    ).length;
    const fulfilled = claims.filter(c => c.status === "delivered").length;
    const expired = claims.filter(
      c => c.status === "expired" || c.status === "forfeited"
    ).length;

    const totalValue = claims.reduce((sum, c) => sum + c.prizeValue, 0);
    const fulfilledValue = claims
      .filter(c => c.status === "delivered")
      .reduce((sum, c) => sum + c.prizeValue, 0);

    return {
      total: claims.length,
      pending,
      processing,
      fulfilled,
      expired,
      totalValue,
      fulfilledValue,
    };
  }

  private determineFulfillmentType(
    prizeType: string
  ): "digital" | "physical" | "manual" {
    switch (prizeType) {
      case "cash":
      case "tokens":
      case "free_bets":
      case "credits":
      case "subscriptions":
        return "digital";
      case "merchandise":
        return "physical";
      case "experiences":
      case "nft":
      default:
        return "manual";
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPrizeFulfillmentService(): PrizeFulfillmentService {
  return new PrizeFulfillmentService();
}
