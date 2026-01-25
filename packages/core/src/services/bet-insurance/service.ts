/**
 * Bet Insurance Service
 * Purchase and claim insurance for bets
 */

import {
  InsuranceType,
  InsuranceStatus,
  ClaimStatus,
  InsuranceProduct,
  InsurancePolicy,
  InsuranceClaim,
  InsuranceCredit,
  InsuranceCreditBalance,
  CalculatePremiumParams,
  CalculatePremiumResult,
  PurchaseInsuranceParams,
  ClaimInsuranceParams,
  GetPoliciesParams,
  GetClaimsParams,
  ProcessAutoClaimParams,
  DEFAULT_INSURANCE_PRODUCTS,
} from "./types";
import { InsurancePricingEngine, insurancePricingEngine } from "./pricing";

// ============================================================================
// Configuration
// ============================================================================

export interface BetInsuranceServiceConfig {
  autoClaimEnabled: boolean;
  claimReviewThreshold: number;
  maxClaimProcessingDays: number;
  creditExpirationDays: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

const DEFAULT_CONFIG: BetInsuranceServiceConfig = {
  autoClaimEnabled: true,
  claimReviewThreshold: 500,
  maxClaimProcessingDays: 3,
  creditExpirationDays: 90,
};

// ============================================================================
// Bet Insurance Service
// ============================================================================

export class BetInsuranceService {
  private readonly config: BetInsuranceServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;
  private readonly pricingEngine: InsurancePricingEngine;

  constructor(db: ConvexClient, config?: Partial<BetInsuranceServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.pricingEngine = insurancePricingEngine;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[BetInsurance] ${msg}`, meta),
      info: (msg, meta) => console.info(`[BetInsurance] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[BetInsurance] ${msg}`, meta),
      error: (msg, meta) => console.error(`[BetInsurance] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Products
  // ==========================================================================

  /**
   * Get available insurance products
   */
  async getProducts(params?: {
    sport?: string;
    betType?: string;
    isActive?: boolean;
  }): Promise<InsuranceProduct[]> {
    const products = await this.db.query<InsuranceProduct[]>(
      "insuranceProducts:getAll",
      {
        sport: params?.sport,
        betType: params?.betType,
        isActive: params?.isActive ?? true,
      }
    );

    return products;
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<InsuranceProduct | null> {
    return await this.db.query<InsuranceProduct | null>(
      "insuranceProducts:getById",
      { id: productId }
    );
  }

  /**
   * Get products by type
   */
  async getProductsByType(type: InsuranceType): Promise<InsuranceProduct[]> {
    return await this.db.query<InsuranceProduct[]>(
      "insuranceProducts:getByType",
      { type }
    );
  }

  // ==========================================================================
  // Premium Calculation
  // ==========================================================================

  /**
   * Calculate premium for insurance
   */
  async calculatePremium(params: CalculatePremiumParams): Promise<CalculatePremiumResult> {
    const { productId, betAmount, betOdds, sport, eventType, userId, useCredits } = params;

    // Get product
    const product = await this.getProduct(productId);
    if (!product) {
      return {
        premium: 0,
        breakdown: {
          basePremium: 0,
          oddsAdjustment: 0,
          sportModifier: 0,
          eventTypeModifier: 0,
          vipDiscount: 0,
          creditsApplied: 0,
          finalPremium: 0,
        },
        coverageAmount: 0,
        eligible: false,
        ineligibilityReason: "Product not found",
        expiresAt: new Date(),
      };
    }

    // Get user's VIP tier
    const vipStatus = await this.db.query<{ currentTier: string } | null>(
      "vipStatus:getByUser",
      { userId }
    );
    const vipTier = vipStatus?.currentTier || "bronze";

    // Get user's available credits
    const creditBalance = await this.getCreditBalance(userId);

    // Calculate premium
    return this.pricingEngine.calculatePremium({
      product,
      betAmount,
      betOdds,
      sport,
      eventType,
      vipTier,
      creditsAvailable: creditBalance.availableCredits,
      useCredits: useCredits ?? false,
    });
  }

  /**
   * Get premium quotes for all available products
   */
  async getAllPremiumQuotes(params: {
    betAmount: number;
    betOdds: number;
    sport: string;
    eventType: "pre_match" | "live";
    userId: string;
  }): Promise<Map<string, CalculatePremiumResult>> {
    const products = await this.getProducts({ sport: params.sport, isActive: true });
    const results = new Map<string, CalculatePremiumResult>();

    for (const product of products) {
      const result = await this.calculatePremium({
        productId: product.id,
        ...params,
      });
      results.set(product.id, result);
    }

    return results;
  }

  // ==========================================================================
  // Policy Management
  // ==========================================================================

  /**
   * Purchase insurance policy
   */
  async purchaseInsurance(params: PurchaseInsuranceParams): Promise<InsurancePolicy> {
    const {
      userId,
      productId,
      betId,
      orderId,
      betAmount,
      betOdds,
      sport,
      event,
      market,
      selection,
      eventType,
      useCredits,
    } = params;

    // Calculate premium
    const premiumResult = await this.calculatePremium({
      productId,
      betAmount,
      betOdds,
      sport,
      eventType,
      userId,
      useCredits,
    });

    if (!premiumResult.eligible) {
      throw new Error(premiumResult.ineligibilityReason || "Not eligible for insurance");
    }

    // Get product for details
    const product = await this.getProduct(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Check user balance
    const balance = await this.db.query<{ available: number } | null>(
      "balances:getByUserAsset",
      { userId, assetType: "usd", assetId: "usd" }
    );

    if (!balance || balance.available < premiumResult.premium) {
      throw new Error("Insufficient balance for premium");
    }

    // Deduct credits if applicable
    if (useCredits && premiumResult.breakdown.creditsApplied > 0) {
      await this.useCredits(userId, premiumResult.breakdown.creditsApplied);
    }

    // Deduct premium from balance
    await this.db.mutation("balances:debit", {
      userId,
      assetType: "usd",
      assetId: "usd",
      amount: premiumResult.premium,
      reason: "insurance_premium",
      referenceId: betId,
    });

    // Calculate policy timing
    const now = Date.now();
    const activatesAt = product.terms.activationTime === "immediate"
      ? now
      : now + 60 * 60 * 1000; // 1 hour before event start placeholder

    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days placeholder

    // Create policy
    const policy: InsurancePolicy = {
      id: `pol_${now}_${userId}`,
      userId,
      productId,
      betId,
      orderId,
      type: product.type,
      status: "active",
      coverageAmount: premiumResult.coverageAmount,
      premiumPaid: premiumResult.premium,
      premiumBreakdown: premiumResult.breakdown,
      betAmount,
      betOdds,
      potentialPayout: betAmount * betOdds,
      sport,
      event,
      market,
      selection,
      coverageDetails: {
        marginThreshold: product.coverageDetails.marginThreshold,
        pushProtection: product.type === "push_protection",
        halfPointCoverage: product.type === "half_point",
      },
      purchasedAt: new Date(now),
      activatesAt: new Date(activatesAt),
      expiresAt: new Date(expiresAt),
    };

    await this.db.mutation("insurancePolicies:create", {
      ...policy,
      purchasedAt: now,
      activatesAt,
      expiresAt,
    });

    this.logger.info("Insurance policy purchased", {
      policyId: policy.id,
      userId,
      betId,
      type: product.type,
      premium: premiumResult.premium,
      coverage: premiumResult.coverageAmount,
    });

    return policy;
  }

  /**
   * Get user's policies
   */
  async getPolicies(params: GetPoliciesParams): Promise<{
    policies: InsurancePolicy[];
    total: number;
    hasMore: boolean;
  }> {
    const { userId, status, limit = 50, offset = 0 } = params;

    const result = await this.db.query<{
      policies: InsurancePolicy[];
      total: number;
    }>("insurancePolicies:getByUser", {
      userId,
      status,
      limit,
      offset,
    });

    return {
      policies: result.policies,
      total: result.total,
      hasMore: offset + limit < result.total,
    };
  }

  /**
   * Get policy by ID
   */
  async getPolicy(policyId: string): Promise<InsurancePolicy | null> {
    return await this.db.query<InsurancePolicy | null>(
      "insurancePolicies:getById",
      { id: policyId }
    );
  }

  /**
   * Cancel policy (if within cancellation window)
   */
  async cancelPolicy(policyId: string, userId: string): Promise<{
    cancelled: boolean;
    refundAmount: number;
    reason?: string;
  }> {
    const policy = await this.getPolicy(policyId);

    if (!policy) {
      return { cancelled: false, refundAmount: 0, reason: "Policy not found" };
    }

    if (policy.userId !== userId) {
      return { cancelled: false, refundAmount: 0, reason: "Unauthorized" };
    }

    if (policy.status !== "active") {
      return { cancelled: false, refundAmount: 0, reason: "Policy is not active" };
    }

    // Check cancellation window
    const product = await this.getProduct(policy.productId);
    if (!product) {
      return { cancelled: false, refundAmount: 0, reason: "Product not found" };
    }

    const cancellationDeadline = policy.activatesAt.getTime() -
      (product.terms.cancellationPeriod * 60 * 60 * 1000);

    if (Date.now() > cancellationDeadline) {
      return {
        cancelled: false,
        refundAmount: 0,
        reason: "Cancellation window has passed",
      };
    }

    // Process refund (full refund if cancelled in time)
    const refundAmount = policy.premiumPaid;

    await this.db.mutation("balances:credit", {
      userId,
      assetType: "usd",
      assetId: "usd",
      amount: refundAmount,
      reason: "insurance_refund",
      referenceId: policyId,
    });

    await this.db.mutation("insurancePolicies:update", {
      id: policyId,
      status: "cancelled",
      updatedAt: Date.now(),
    });

    this.logger.info("Insurance policy cancelled", {
      policyId,
      userId,
      refundAmount,
    });

    return { cancelled: true, refundAmount };
  }

  // ==========================================================================
  // Claims
  // ==========================================================================

  /**
   * Submit insurance claim
   */
  async submitClaim(params: ClaimInsuranceParams): Promise<InsuranceClaim> {
    const { userId, policyId, betResult, actualMargin, eventOutcome } = params;

    const policy = await this.getPolicy(policyId);

    if (!policy) {
      throw new Error("Policy not found");
    }

    if (policy.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (policy.status !== "active") {
      throw new Error("Policy is not active");
    }

    // Validate claim eligibility
    const eligibility = this.validateClaimEligibility(policy, betResult, actualMargin);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Claim not eligible");
    }

    const now = Date.now();
    const claimAmount = this.calculateClaimAmount(policy, betResult, actualMargin);

    // Determine if auto-approve or manual review
    const requiresReview = claimAmount > this.config.claimReviewThreshold;

    const claim: InsuranceClaim = {
      id: `clm_${now}_${userId}`,
      policyId,
      userId,
      status: requiresReview ? "under_review" : "approved",
      claimType: policy.type,
      claimAmount,
      approvedAmount: requiresReview ? undefined : claimAmount,
      betResult,
      actualMargin,
      eventOutcome,
      settlementDetails: {
        finalScore: "",
        winningOutcome: eventOutcome,
        marginFromWin: actualMargin || 0,
        settlementSource: "user_submitted",
        verifiedAt: new Date(now),
      },
      submittedAt: new Date(now),
      approvedAt: requiresReview ? undefined : new Date(now),
      evidence: [],
    };

    await this.db.mutation("insuranceClaims:create", {
      ...claim,
      submittedAt: now,
      approvedAt: requiresReview ? undefined : now,
    });

    // Update policy status
    await this.db.mutation("insurancePolicies:update", {
      id: policyId,
      status: "pending_claim",
      updatedAt: now,
    });

    // If auto-approved, process payout
    if (!requiresReview) {
      await this.processClaimPayout(claim.id);
    }

    this.logger.info("Insurance claim submitted", {
      claimId: claim.id,
      policyId,
      userId,
      claimAmount,
      requiresReview,
    });

    return claim;
  }

  /**
   * Validate claim eligibility
   */
  private validateClaimEligibility(
    policy: InsurancePolicy,
    betResult: "loss" | "push" | "partial_loss",
    actualMargin?: number
  ): { eligible: boolean; reason?: string } {
    // Check policy is active
    if (policy.status !== "active") {
      return { eligible: false, reason: "Policy is not active" };
    }

    // Check within claim period
    const now = Date.now();
    if (now < policy.activatesAt.getTime()) {
      return { eligible: false, reason: "Policy not yet active" };
    }

    if (now > policy.expiresAt.getTime()) {
      return { eligible: false, reason: "Policy has expired" };
    }

    // Check result matches coverage type
    switch (policy.type) {
      case "close_loss":
        if (betResult !== "loss") {
          return { eligible: false, reason: "Close loss coverage requires a loss" };
        }
        if (actualMargin === undefined || actualMargin > (policy.coverageDetails.marginThreshold || 3)) {
          return {
            eligible: false,
            reason: `Loss margin (${actualMargin}) exceeds threshold (${policy.coverageDetails.marginThreshold || 3})`,
          };
        }
        break;

      case "push_protection":
        if (betResult !== "push") {
          return { eligible: false, reason: "Push protection requires a push result" };
        }
        break;

      case "half_point":
        if (betResult !== "loss") {
          return { eligible: false, reason: "Half-point coverage requires a loss" };
        }
        if (actualMargin === undefined || actualMargin > 0.5) {
          return { eligible: false, reason: "Loss margin exceeds half-point threshold" };
        }
        break;
    }

    return { eligible: true };
  }

  /**
   * Calculate claim amount
   */
  private calculateClaimAmount(
    policy: InsurancePolicy,
    betResult: "loss" | "push" | "partial_loss",
    actualMargin?: number
  ): number {
    // For close loss, payout is full coverage amount
    if (policy.type === "close_loss") {
      return policy.coverageAmount;
    }

    // For push protection, payout is typically 50% of stake
    if (policy.type === "push_protection") {
      return policy.betAmount * 0.5;
    }

    // For half-point, full stake refund
    if (policy.type === "half_point") {
      return policy.coverageAmount;
    }

    return policy.coverageAmount;
  }

  /**
   * Process claim payout
   */
  async processClaimPayout(claimId: string): Promise<void> {
    const claim = await this.db.query<InsuranceClaim | null>(
      "insuranceClaims:getById",
      { id: claimId }
    );

    if (!claim || claim.status !== "approved") {
      throw new Error("Claim not found or not approved");
    }

    const payoutAmount = claim.approvedAmount || claim.claimAmount;

    // Credit user balance
    await this.db.mutation("balances:credit", {
      userId: claim.userId,
      assetType: "usd",
      assetId: "usd",
      amount: payoutAmount,
      reason: "insurance_payout",
      referenceId: claimId,
    });

    const now = Date.now();

    // Update claim status
    await this.db.mutation("insuranceClaims:update", {
      id: claimId,
      status: "paid",
      paidAmount: payoutAmount,
      paidAt: now,
    });

    // Update policy status
    await this.db.mutation("insurancePolicies:update", {
      id: claim.policyId,
      status: "claimed",
      claimedAt: now,
      settledAt: now,
    });

    this.logger.info("Insurance claim paid", {
      claimId,
      userId: claim.userId,
      payoutAmount,
    });
  }

  /**
   * Process auto-claim (for events that settle)
   */
  async processAutoClaim(params: ProcessAutoClaimParams): Promise<InsuranceClaim | null> {
    if (!this.config.autoClaimEnabled) {
      return null;
    }

    const { policyId, settlementData } = params;
    const policy = await this.getPolicy(policyId);

    if (!policy || policy.status !== "active") {
      return null;
    }

    // Determine bet result from settlement data
    const { betResult, actualMargin } = this.determineBetResult(policy, settlementData);

    // Check if claim is eligible
    const eligibility = this.validateClaimEligibility(policy, betResult, actualMargin);
    if (!eligibility.eligible) {
      // Mark policy as expired without claim
      await this.db.mutation("insurancePolicies:update", {
        id: policyId,
        status: "expired",
        settledAt: Date.now(),
      });
      return null;
    }

    // Submit auto-claim
    return await this.submitClaim({
      userId: policy.userId,
      policyId,
      betResult,
      actualMargin,
      eventOutcome: settlementData.winningOutcome,
    });
  }

  /**
   * Determine bet result from settlement data
   */
  private determineBetResult(
    policy: InsurancePolicy,
    settlementData: ProcessAutoClaimParams["settlementData"]
  ): { betResult: "loss" | "push" | "partial_loss"; actualMargin: number } {
    // This would use actual settlement logic
    // Simplified implementation
    const marginFromWin = settlementData.marginFromWin;

    if (marginFromWin === 0) {
      return { betResult: "push", actualMargin: 0 };
    }

    return {
      betResult: "loss",
      actualMargin: Math.abs(marginFromWin),
    };
  }

  /**
   * Get user's claims
   */
  async getClaims(params: GetClaimsParams): Promise<{
    claims: InsuranceClaim[];
    total: number;
    hasMore: boolean;
  }> {
    const { userId, status, limit = 50, offset = 0 } = params;

    const result = await this.db.query<{
      claims: InsuranceClaim[];
      total: number;
    }>("insuranceClaims:getByUser", {
      userId,
      status,
      limit,
      offset,
    });

    return {
      claims: result.claims,
      total: result.total,
      hasMore: offset + limit < result.total,
    };
  }

  // ==========================================================================
  // Credits
  // ==========================================================================

  /**
   * Get user's credit balance
   */
  async getCreditBalance(userId: string): Promise<InsuranceCreditBalance> {
    const credits = await this.db.query<InsuranceCredit[]>(
      "insuranceCredits:getByUser",
      { userId }
    );

    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    let totalCredits = 0;
    let availableCredits = 0;
    let expiringCredits = 0;

    for (const credit of credits) {
      totalCredits += credit.remainingAmount;

      if (!credit.expiresAt || credit.expiresAt.getTime() > now) {
        availableCredits += credit.remainingAmount;
      }

      if (credit.expiresAt && credit.expiresAt.getTime() <= thirtyDaysFromNow) {
        expiringCredits += credit.remainingAmount;
      }
    }

    return {
      userId,
      totalCredits,
      availableCredits,
      expiringCredits,
      expiringWithin: 30,
      creditHistory: credits,
    };
  }

  /**
   * Add credits to user
   */
  async addCredits(params: {
    userId: string;
    amount: number;
    type: "bonus" | "vip_reward" | "promo" | "refund";
    source: string;
    expirationDays?: number;
  }): Promise<InsuranceCredit> {
    const { userId, amount, type, source, expirationDays } = params;
    const now = Date.now();
    const expiresAt = expirationDays
      ? now + expirationDays * 24 * 60 * 60 * 1000
      : now + this.config.creditExpirationDays * 24 * 60 * 60 * 1000;

    const credit: InsuranceCredit = {
      id: `crd_${now}_${userId}`,
      userId,
      type,
      amount,
      usedAmount: 0,
      remainingAmount: amount,
      expiresAt: new Date(expiresAt),
      source,
      createdAt: new Date(now),
    };

    await this.db.mutation("insuranceCredits:create", {
      ...credit,
      expiresAt,
      createdAt: now,
    });

    this.logger.info("Insurance credits added", {
      creditId: credit.id,
      userId,
      amount,
      type,
    });

    return credit;
  }

  /**
   * Use credits
   */
  private async useCredits(userId: string, amount: number): Promise<void> {
    const credits = await this.db.query<InsuranceCredit[]>(
      "insuranceCredits:getByUser",
      { userId, hasRemaining: true }
    );

    // Sort by expiration (use soonest to expire first)
    credits.sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt.getTime() - b.expiresAt.getTime();
    });

    let remaining = amount;

    for (const credit of credits) {
      if (remaining <= 0) break;

      const toUse = Math.min(remaining, credit.remainingAmount);

      await this.db.mutation("insuranceCredits:update", {
        id: credit.id,
        usedAmount: credit.usedAmount + toUse,
        remainingAmount: credit.remainingAmount - toUse,
        updatedAt: Date.now(),
      });

      remaining -= toUse;
    }
  }

  // ==========================================================================
  // Admin Operations
  // ==========================================================================

  /**
   * Approve claim (admin)
   */
  async approveClaim(
    claimId: string,
    adminId: string,
    approvedAmount?: number
  ): Promise<void> {
    const claim = await this.db.query<InsuranceClaim | null>(
      "insuranceClaims:getById",
      { id: claimId }
    );

    if (!claim || claim.status !== "under_review") {
      throw new Error("Claim not found or not under review");
    }

    const now = Date.now();
    const finalAmount = approvedAmount ?? claim.claimAmount;

    await this.db.mutation("insuranceClaims:update", {
      id: claimId,
      status: "approved",
      approvedAmount: finalAmount,
      reviewedAt: now,
      reviewedBy: adminId,
      approvedAt: now,
    });

    // Process payout
    await this.processClaimPayout(claimId);

    this.logger.info("Claim approved by admin", {
      claimId,
      adminId,
      approvedAmount: finalAmount,
    });
  }

  /**
   * Deny claim (admin)
   */
  async denyClaim(
    claimId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    const claim = await this.db.query<InsuranceClaim | null>(
      "insuranceClaims:getById",
      { id: claimId }
    );

    if (!claim || claim.status !== "under_review") {
      throw new Error("Claim not found or not under review");
    }

    const now = Date.now();

    await this.db.mutation("insuranceClaims:update", {
      id: claimId,
      status: "denied",
      reviewedAt: now,
      reviewedBy: adminId,
      denialReason: reason,
    });

    // Update policy back to active (they can potentially re-claim with more evidence)
    await this.db.mutation("insurancePolicies:update", {
      id: claim.policyId,
      status: "active",
      updatedAt: now,
    });

    this.logger.info("Claim denied by admin", {
      claimId,
      adminId,
      reason,
    });
  }
}

export default BetInsuranceService;
