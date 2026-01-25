/**
 * Bet Insurance - Type Definitions
 * Insurance products for protecting bets against close losses
 */

// ============================================================================
// Insurance Types
// ============================================================================

export type InsuranceType =
  | "close_loss"      // Insure against losses by small margins
  | "push_protection" // Protection when bet pushes
  | "half_point"      // Half-point coverage for spread bets
  | "overtime"        // Protection against OT outcomes
  | "injury"          // Protection if key player injured
  | "weather"         // Weather-related event protection
  | "full_refund";    // Complete bet protection (highest premium)

export type InsuranceStatus =
  | "active"
  | "pending_claim"
  | "claimed"
  | "expired"
  | "cancelled"
  | "void";

export type ClaimStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "denied"
  | "paid"
  | "disputed";

// ============================================================================
// Insurance Products
// ============================================================================

export interface InsuranceProduct {
  id: string;
  type: InsuranceType;
  name: string;
  description: string;
  coverageDetails: CoverageDetails;
  premiumRates: PremiumRates;
  eligibility: EligibilityRequirements;
  terms: InsuranceTerms;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoverageDetails {
  // Close loss specifics
  marginThreshold?: number;           // e.g., 3 points for "close loss"
  marginType?: "points" | "percent";

  // Push protection
  pushTypes?: ("exact" | "half_push")[];

  // Half-point coverage
  halfPointSides?: ("over" | "under" | "spread")[];

  // Maximum coverage
  maxCoveragePercent: number;         // Max % of bet covered
  maxCoverageAmount: number;          // Max $ amount covered

  // Payout structure
  payoutType: "full_stake" | "partial_stake" | "profit_protection";
  payoutPercent: number;
}

export interface PremiumRates {
  baseRate: number;                   // Base premium rate (e.g., 5%)
  minPremium: number;                 // Minimum premium amount
  maxPremium: number;                 // Maximum premium amount

  // Adjustments
  oddsTiers: OddsTierRate[];          // Rate adjustments by odds
  sportModifiers: Record<string, number>;  // Sport-specific modifiers
  eventTypeModifiers: Record<string, number>;  // Live vs pre-match
  vipDiscounts: Record<string, number>;  // VIP tier discounts
}

export interface OddsTierRate {
  minOdds: number;
  maxOdds: number;
  rateMultiplier: number;
}

export interface EligibilityRequirements {
  minBetAmount: number;
  maxBetAmount: number;
  minOdds: number;
  maxOdds: number;
  eligibleBetTypes: string[];
  eligibleSports: string[];
  eligibleMarkets: string[];
  excludedEvents?: string[];
  requiresVIPTier?: string;
  maxInsurancePerUser?: number;       // Per day/week
  blackoutPeriods?: BlackoutPeriod[];
}

export interface BlackoutPeriod {
  startTime: Date;
  endTime: Date;
  reason: string;
}

export interface InsuranceTerms {
  activationTime: "immediate" | "event_start";
  expirationTime: "event_end" | "settlement";
  cancellationPeriod: number;         // Hours before event
  claimPeriod: number;                // Hours after settlement
  autoClaimEnabled: boolean;
  termsUrl: string;
}

// ============================================================================
// Insurance Policies (User Purchases)
// ============================================================================

export interface InsurancePolicy {
  id: string;
  userId: string;
  productId: string;
  betId: string;
  orderId: string;

  // Policy details
  type: InsuranceType;
  status: InsuranceStatus;
  coverageAmount: number;
  premiumPaid: number;
  premiumBreakdown: PremiumBreakdown;

  // Bet details
  betAmount: number;
  betOdds: number;
  potentialPayout: number;
  sport: string;
  event: string;
  market: string;
  selection: string;

  // Coverage specifics
  coverageDetails: PolicyCoverageDetails;

  // Timestamps
  purchasedAt: Date;
  activatesAt: Date;
  expiresAt: Date;
  claimedAt?: Date;
  settledAt?: Date;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface PolicyCoverageDetails {
  marginThreshold?: number;
  pushProtection?: boolean;
  halfPointCoverage?: boolean;
  specificConditions?: string[];
}

export interface PremiumBreakdown {
  basePremium: number;
  oddsAdjustment: number;
  sportModifier: number;
  eventTypeModifier: number;
  vipDiscount: number;
  creditsApplied: number;
  finalPremium: number;
}

// ============================================================================
// Insurance Claims
// ============================================================================

export interface InsuranceClaim {
  id: string;
  policyId: string;
  userId: string;

  // Claim details
  status: ClaimStatus;
  claimType: InsuranceType;
  claimAmount: number;
  approvedAmount?: number;
  paidAmount?: number;

  // Event details
  betResult: "loss" | "push" | "partial_loss";
  actualMargin?: number;
  eventOutcome: string;
  settlementDetails: SettlementDetails;

  // Processing
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  approvedAt?: Date;
  paidAt?: Date;
  denialReason?: string;

  // Evidence
  evidence: ClaimEvidence[];
}

export interface SettlementDetails {
  finalScore?: string;
  winningOutcome: string;
  marginFromWin: number;
  settlementSource: string;
  verifiedAt: Date;
}

export interface ClaimEvidence {
  type: "score" | "stats" | "official_result" | "screenshot";
  source: string;
  data: Record<string, unknown>;
  verifiedAt: Date;
}

// ============================================================================
// Insurance Credits
// ============================================================================

export interface InsuranceCredit {
  id: string;
  userId: string;
  type: "purchase" | "bonus" | "vip_reward" | "promo" | "refund";
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  expiresAt?: Date;
  source: string;
  createdAt: Date;
}

export interface InsuranceCreditBalance {
  userId: string;
  totalCredits: number;
  availableCredits: number;
  expiringCredits: number;
  expiringWithin: number; // days
  creditHistory: InsuranceCredit[];
}

// ============================================================================
// Service Types
// ============================================================================

export interface CalculatePremiumParams {
  productId: string;
  betAmount: number;
  betOdds: number;
  sport: string;
  eventType: "pre_match" | "live";
  userId: string;
  useCredits?: boolean;
}

export interface CalculatePremiumResult {
  premium: number;
  breakdown: PremiumBreakdown;
  coverageAmount: number;
  eligible: boolean;
  ineligibilityReason?: string;
  expiresAt: Date;
}

export interface PurchaseInsuranceParams {
  userId: string;
  productId: string;
  betId: string;
  orderId: string;
  betAmount: number;
  betOdds: number;
  sport: string;
  event: string;
  market: string;
  selection: string;
  eventType: "pre_match" | "live";
  useCredits?: boolean;
}

export interface ClaimInsuranceParams {
  userId: string;
  policyId: string;
  betResult: "loss" | "push" | "partial_loss";
  actualMargin?: number;
  eventOutcome: string;
}

export interface GetPoliciesParams {
  userId: string;
  status?: InsuranceStatus;
  limit?: number;
  offset?: number;
}

export interface GetClaimsParams {
  userId: string;
  status?: ClaimStatus;
  limit?: number;
  offset?: number;
}

export interface ProcessAutoClaimParams {
  policyId: string;
  settlementData: {
    finalScore: string;
    winningOutcome: string;
    marginFromWin: number;
    settlementSource: string;
  };
}

// ============================================================================
// Default Product Configurations
// ============================================================================

export const DEFAULT_INSURANCE_PRODUCTS: Partial<InsuranceProduct>[] = [
  {
    type: "close_loss",
    name: "Close Loss Protection",
    description: "Get your stake back if you lose by 3 points or less",
    coverageDetails: {
      marginThreshold: 3,
      marginType: "points",
      maxCoveragePercent: 100,
      maxCoverageAmount: 1000,
      payoutType: "full_stake",
      payoutPercent: 100,
    },
    premiumRates: {
      baseRate: 0.08,
      minPremium: 1,
      maxPremium: 100,
      oddsTiers: [
        { minOdds: 1.5, maxOdds: 2.0, rateMultiplier: 0.9 },
        { minOdds: 2.0, maxOdds: 3.0, rateMultiplier: 1.0 },
        { minOdds: 3.0, maxOdds: 5.0, rateMultiplier: 1.2 },
      ],
      sportModifiers: {
        nba: 1.0,
        nfl: 0.95,
        mlb: 1.1,
        nhl: 1.0,
      },
      eventTypeModifiers: {
        pre_match: 1.0,
        live: 1.3,
      },
      vipDiscounts: {
        bronze: 0,
        silver: 0.05,
        gold: 0.10,
        platinum: 0.15,
        diamond: 0.20,
        black: 0.30,
      },
    },
  },
  {
    type: "push_protection",
    name: "Push Protection",
    description: "Get paid even when your bet pushes",
    coverageDetails: {
      pushTypes: ["exact", "half_push"],
      maxCoveragePercent: 50,
      maxCoverageAmount: 500,
      payoutType: "partial_stake",
      payoutPercent: 50,
    },
    premiumRates: {
      baseRate: 0.03,
      minPremium: 0.5,
      maxPremium: 50,
      oddsTiers: [],
      sportModifiers: {},
      eventTypeModifiers: {
        pre_match: 1.0,
        live: 1.5,
      },
      vipDiscounts: {
        bronze: 0,
        silver: 0.05,
        gold: 0.10,
        platinum: 0.15,
        diamond: 0.20,
        black: 0.30,
      },
    },
  },
  {
    type: "half_point",
    name: "Half-Point Coverage",
    description: "Extra half-point protection on spread bets",
    coverageDetails: {
      halfPointSides: ["over", "under", "spread"],
      maxCoveragePercent: 100,
      maxCoverageAmount: 500,
      payoutType: "full_stake",
      payoutPercent: 100,
    },
    premiumRates: {
      baseRate: 0.05,
      minPremium: 0.5,
      maxPremium: 50,
      oddsTiers: [],
      sportModifiers: {
        nba: 1.0,
        nfl: 0.9,
        ncaab: 1.1,
        ncaaf: 0.95,
      },
      eventTypeModifiers: {
        pre_match: 1.0,
        live: 2.0,
      },
      vipDiscounts: {
        bronze: 0,
        silver: 0.05,
        gold: 0.10,
        platinum: 0.15,
        diamond: 0.20,
        black: 0.30,
      },
    },
  },
];
