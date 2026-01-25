/**
 * Instant Cashout Service
 * Process sub-60-second withdrawals
 */

import type {
  CashoutRequest,
  CashoutStatus,
  PaymentAccount,
  PaymentMethod,
  SpeedTier,
  VIPTier,
  UserCashoutProfile,
  TierBenefits,
  FeeStructure,
  SpeedTierFee,
  FeeQuote,
  InitiateCashoutRequest,
  GetFeeQuoteRequest,
  AddPaymentAccountRequest,
  CashoutHistoryFilters,
  CashoutHistoryResponse,
  AvailableMethodsResponse,
  DestinationDetails,
} from "./types";
import { PaymentProviderManager, createPaymentProviderManager } from "./providers";

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

const TIER_BENEFITS: Record<VIPTier, TierBenefits> = {
  standard: {
    tier: "standard",
    dailyLimit: 5000,
    weeklyLimit: 20000,
    monthlyLimit: 50000,
    perTransactionLimit: 2500,
    feeDiscount: 0,
    freeInstantCashouts: 0,
    prioritySupport: false,
    dedicatedManager: false,
    instantCryptoEnabled: false,
  },
  silver: {
    tier: "silver",
    dailyLimit: 10000,
    weeklyLimit: 50000,
    monthlyLimit: 150000,
    perTransactionLimit: 5000,
    feeDiscount: 10,
    freeInstantCashouts: 2,
    prioritySupport: false,
    dedicatedManager: false,
    instantCryptoEnabled: true,
  },
  gold: {
    tier: "gold",
    dailyLimit: 25000,
    weeklyLimit: 100000,
    monthlyLimit: 400000,
    perTransactionLimit: 10000,
    feeDiscount: 25,
    freeInstantCashouts: 5,
    prioritySupport: true,
    dedicatedManager: false,
    instantCryptoEnabled: true,
  },
  platinum: {
    tier: "platinum",
    dailyLimit: 50000,
    weeklyLimit: 200000,
    monthlyLimit: 750000,
    perTransactionLimit: 25000,
    feeDiscount: 50,
    freeInstantCashouts: 15,
    prioritySupport: true,
    dedicatedManager: true,
    instantCryptoEnabled: true,
  },
  diamond: {
    tier: "diamond",
    dailyLimit: 100000,
    weeklyLimit: 500000,
    monthlyLimit: 2000000,
    perTransactionLimit: 50000,
    feeDiscount: 75,
    freeInstantCashouts: 999, // Unlimited
    prioritySupport: true,
    dedicatedManager: true,
    instantCryptoEnabled: true,
  },
};

// ============================================================================
// FEE CONFIGURATION
// ============================================================================

const BASE_FEES: Record<PaymentMethod, SpeedTierFee[]> = {
  instant_bank: [
    { tier: "instant", flatFee: 1.99, percentageFee: 1.5, minFee: 1.99, maxFee: 25, estimatedSeconds: 30, isAvailable: true },
    { tier: "fast", flatFee: 0.99, percentageFee: 1.0, minFee: 0.99, maxFee: 15, estimatedSeconds: 300, isAvailable: true },
    { tier: "standard", flatFee: 0, percentageFee: 0.5, minFee: 0, maxFee: 10, estimatedSeconds: 3600, isAvailable: true },
  ],
  debit_card: [
    { tier: "instant", flatFee: 2.49, percentageFee: 1.75, minFee: 2.49, maxFee: 30, estimatedSeconds: 45, isAvailable: true },
    { tier: "fast", flatFee: 1.49, percentageFee: 1.25, minFee: 1.49, maxFee: 20, estimatedSeconds: 300, isAvailable: true },
  ],
  paypal: [
    { tier: "instant", flatFee: 0.99, percentageFee: 2.0, minFee: 0.99, maxFee: 20, estimatedSeconds: 60, isAvailable: true },
    { tier: "fast", flatFee: 0, percentageFee: 1.5, minFee: 0, maxFee: 15, estimatedSeconds: 600, isAvailable: true },
  ],
  venmo: [
    { tier: "instant", flatFee: 0.99, percentageFee: 2.0, minFee: 0.99, maxFee: 20, estimatedSeconds: 60, isAvailable: true },
    { tier: "fast", flatFee: 0, percentageFee: 1.5, minFee: 0, maxFee: 15, estimatedSeconds: 600, isAvailable: true },
  ],
  crypto_btc: [
    { tier: "fast", flatFee: 5.00, percentageFee: 0.5, minFee: 5.00, maxFee: 50, estimatedSeconds: 1800, isAvailable: true },
    { tier: "standard", flatFee: 2.00, percentageFee: 0.25, minFee: 2.00, maxFee: 25, estimatedSeconds: 3600, isAvailable: true },
  ],
  crypto_eth: [
    { tier: "fast", flatFee: 3.00, percentageFee: 0.5, minFee: 3.00, maxFee: 40, estimatedSeconds: 300, isAvailable: true },
    { tier: "standard", flatFee: 1.00, percentageFee: 0.25, minFee: 1.00, maxFee: 20, estimatedSeconds: 900, isAvailable: true },
  ],
  crypto_usdc: [
    { tier: "instant", flatFee: 1.00, percentageFee: 0.5, minFee: 1.00, maxFee: 15, estimatedSeconds: 60, isAvailable: true },
    { tier: "fast", flatFee: 0.50, percentageFee: 0.25, minFee: 0.50, maxFee: 10, estimatedSeconds: 300, isAvailable: true },
  ],
  crypto_usdt: [
    { tier: "instant", flatFee: 1.00, percentageFee: 0.5, minFee: 1.00, maxFee: 15, estimatedSeconds: 60, isAvailable: true },
    { tier: "fast", flatFee: 0.50, percentageFee: 0.25, minFee: 0.50, maxFee: 10, estimatedSeconds: 300, isAvailable: true },
  ],
  bank_transfer: [
    { tier: "standard", flatFee: 0, percentageFee: 0, minFee: 0, maxFee: 0, estimatedSeconds: 86400, isAvailable: true },
    { tier: "economy", flatFee: 0, percentageFee: 0, minFee: 0, maxFee: 0, estimatedSeconds: 259200, isAvailable: true },
  ],
  apple_pay: [
    { tier: "instant", flatFee: 1.49, percentageFee: 1.5, minFee: 1.49, maxFee: 25, estimatedSeconds: 30, isAvailable: true },
  ],
  cash_app: [
    { tier: "instant", flatFee: 0.99, percentageFee: 1.75, minFee: 0.99, maxFee: 20, estimatedSeconds: 45, isAvailable: true },
  ],
};

// ============================================================================
// INSTANT CASHOUT SERVICE
// ============================================================================

export class InstantCashoutService {
  private cashoutRequests: Map<string, CashoutRequest> = new Map();
  private paymentAccounts: Map<string, PaymentAccount[]> = new Map();
  private userProfiles: Map<string, UserCashoutProfile> = new Map();
  private providerManager: PaymentProviderManager;

  constructor(providerManager?: PaymentProviderManager) {
    this.providerManager = providerManager ?? createPaymentProviderManager();
  }

  // ==========================================================================
  // CASHOUT OPERATIONS
  // ==========================================================================

  /**
   * Initiate a cashout request
   */
  async initiateCashout(
    userId: string,
    request: InitiateCashoutRequest,
    metadata: { ipAddress: string; userAgent: string; deviceId?: string }
  ): Promise<CashoutRequest> {
    // Get user profile
    const profile = this.getOrCreateProfile(userId);

    // Get payment account
    const userAccounts = this.paymentAccounts.get(userId) ?? [];
    const paymentAccount = userAccounts.find((a) => a.id === request.paymentAccountId);
    if (!paymentAccount) {
      throw new Error("Payment account not found");
    }

    // Validate limits
    this.validateLimits(profile, request.amount);

    // Get fee quote
    const speedTier = request.speedTier ?? "fast";
    const feeQuote = this.calculateFeeQuote({
      amount: request.amount,
      paymentMethod: paymentAccount.method,
      speedTier,
    }, profile);

    if (!feeQuote) {
      throw new Error("Unable to calculate fees for this method");
    }

    // Check available balance (would integrate with balance service)
    const availableBalance = 10000; // Mock
    if (request.amount > availableBalance) {
      throw new Error("Insufficient balance");
    }

    // Create cashout request
    const cashoutId = `cashout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const cashoutRequest: CashoutRequest = {
      id: cashoutId,
      userId,
      amount: request.amount,
      currency: request.currency ?? "usd",
      fiatAmount: request.amount, // Convert if crypto
      paymentMethod: paymentAccount.method,
      paymentAccountId: paymentAccount.id,
      destinationDetails: this.getDestinationDetails(paymentAccount),
      speedTier,
      fee: feeQuote.totalFee,
      feePercentage: feeQuote.percentageFee,
      netAmount: feeQuote.netAmount,
      status: "pending",
      statusHistory: [{
        status: "pending",
        timestamp: Date.now(),
      }],
      estimatedArrival: feeQuote.estimatedArrival,
      riskScore: 0,
      riskFlags: [],
      requiresManualReview: false,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceId: metadata.deviceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Risk assessment
    const riskResult = await this.assessRisk(cashoutRequest, profile);
    cashoutRequest.riskScore = riskResult.score;
    cashoutRequest.riskFlags = riskResult.flags;
    cashoutRequest.requiresManualReview = riskResult.requiresReview;

    // Save request
    this.cashoutRequests.set(cashoutId, cashoutRequest);

    // Update usage
    profile.dailyUsed += request.amount;
    profile.weeklyUsed += request.amount;
    profile.monthlyUsed += request.amount;
    this.userProfiles.set(userId, profile);

    // Process if not requiring review
    if (!cashoutRequest.requiresManualReview) {
      await this.processCashout(cashoutRequest);
    }

    return cashoutRequest;
  }

  /**
   * Process a cashout through the provider
   */
  private async processCashout(request: CashoutRequest): Promise<void> {
    this.updateStatus(request, "processing");

    // Get provider
    const provider = this.providerManager.getProviderForMethod(request.paymentMethod);
    if (!provider) {
      this.updateStatus(request, "failed", "No available provider");
      return;
    }

    try {
      const result = await provider.initiatePayout({
        externalId: request.id,
        amount: request.netAmount,
        currency: request.currency,
        destination: request.destinationDetails,
        metadata: {
          userId: request.userId,
          speedTier: request.speedTier,
        },
      });

      if (result.success) {
        request.processorId = provider.providerId;
        request.processorReference = result.reference;
        this.updateStatus(request, "sent");

        // For instant methods, simulate completion
        if (request.speedTier === "instant") {
          setTimeout(async () => {
            await this.completeCashout(request.id);
          }, result.estimatedArrival ? result.estimatedArrival - Date.now() : 30000);
        }
      } else {
        this.updateStatus(request, "failed", result.error);
      }

      // Record result for provider health
      this.providerManager.recordTransactionResult(
        provider.providerId,
        result.success,
        Date.now() - request.createdAt
      );
    } catch (error) {
      this.updateStatus(request, "failed", error instanceof Error ? error.message : "Unknown error");
    }
  }

  /**
   * Complete a cashout
   */
  async completeCashout(cashoutId: string): Promise<CashoutRequest> {
    const request = this.cashoutRequests.get(cashoutId);
    if (!request) throw new Error("Cashout not found");

    request.actualArrival = Date.now();
    request.processingTime = request.actualArrival - request.createdAt;
    this.updateStatus(request, "completed");

    // Update user stats
    const profile = this.userProfiles.get(request.userId);
    if (profile) {
      profile.lifetimeWithdrawals++;
      profile.lifetimeVolume += request.fiatAmount;
      profile.avgProcessingTime = profile.avgProcessingTime
        ? (profile.avgProcessingTime + request.processingTime) / 2
        : request.processingTime;
      this.userProfiles.set(request.userId, profile);
    }

    return request;
  }

  /**
   * Cancel a cashout
   */
  async cancelCashout(cashoutId: string, userId: string): Promise<CashoutRequest> {
    const request = this.cashoutRequests.get(cashoutId);
    if (!request) throw new Error("Cashout not found");
    if (request.userId !== userId) throw new Error("Not authorized");

    if (request.status !== "pending" && request.status !== "processing") {
      throw new Error("Cashout cannot be cancelled at this stage");
    }

    // Try to cancel with provider
    if (request.processorId && request.processorReference) {
      const provider = this.providerManager.getProvider(request.processorId);
      if (provider) {
        const result = await provider.cancelPayout(request.processorReference);
        if (!result.success) {
          throw new Error(result.error ?? "Unable to cancel cashout");
        }
      }
    }

    this.updateStatus(request, "cancelled", "Cancelled by user");

    // Refund usage
    const profile = this.userProfiles.get(userId);
    if (profile) {
      profile.dailyUsed = Math.max(0, profile.dailyUsed - request.amount);
      profile.weeklyUsed = Math.max(0, profile.weeklyUsed - request.amount);
      profile.monthlyUsed = Math.max(0, profile.monthlyUsed - request.amount);
      this.userProfiles.set(userId, profile);
    }

    return request;
  }

  /**
   * Update cashout status
   */
  private updateStatus(request: CashoutRequest, status: CashoutStatus, reason?: string): void {
    request.status = status;
    request.statusHistory.push({
      status,
      timestamp: Date.now(),
      reason,
    });
    request.updatedAt = Date.now();
    this.cashoutRequests.set(request.id, request);
  }

  // ==========================================================================
  // FEE CALCULATION
  // ==========================================================================

  /**
   * Get fee quote
   */
  getFeeQuote(request: GetFeeQuoteRequest, userId: string): FeeQuote | null {
    const profile = this.getOrCreateProfile(userId);
    return this.calculateFeeQuote(request, profile);
  }

  /**
   * Calculate fee quote
   */
  private calculateFeeQuote(
    request: GetFeeQuoteRequest,
    profile: UserCashoutProfile
  ): FeeQuote | null {
    const methodFees = BASE_FEES[request.paymentMethod];
    if (!methodFees) return null;

    const speedTier = request.speedTier ?? "fast";
    const tierFee = methodFees.find((f) => f.tier === speedTier && f.isAvailable);
    if (!tierFee) return null;

    // Calculate base fee
    let percentageFee = request.amount * (tierFee.percentageFee / 100);
    let baseFee = tierFee.flatFee;
    let totalFee = baseFee + percentageFee;

    // Apply min/max
    totalFee = Math.max(tierFee.minFee, Math.min(tierFee.maxFee, totalFee));

    // Apply VIP discount
    const tierBenefits = TIER_BENEFITS[profile.vipTier];
    let vipDiscount = 0;
    let freeInstantUsed = false;

    if (tierBenefits.feeDiscount > 0) {
      vipDiscount = totalFee * (tierBenefits.feeDiscount / 100);
      totalFee -= vipDiscount;
    }

    // Check for free instant cashout
    if (
      speedTier === "instant" &&
      profile.freeInstantCashouts > 0
    ) {
      freeInstantUsed = true;
      totalFee = 0;
    }

    return {
      method: request.paymentMethod,
      speedTier,
      amount: request.amount,
      baseFee: tierFee.flatFee,
      percentageFee,
      totalFee,
      netAmount: request.amount - totalFee,
      vipDiscount,
      promoDiscount: 0,
      freeInstantUsed,
      estimatedArrival: Date.now() + tierFee.estimatedSeconds * 1000,
      estimatedProcessingTime: tierFee.estimatedSeconds * 1000,
      validUntil: Date.now() + 300000, // 5 minutes
    };
  }

  /**
   * Get available methods and fees
   */
  getAvailableMethods(userId: string): AvailableMethodsResponse {
    const profile = this.getOrCreateProfile(userId);
    const tierBenefits = TIER_BENEFITS[profile.vipTier];

    const methods: FeeStructure[] = [];

    for (const [method, speedTiers] of Object.entries(BASE_FEES)) {
      const availableSpeedTiers = speedTiers.filter((st) => {
        // Check if provider is available
        const provider = this.providerManager.getProviderForMethod(method as PaymentMethod);
        return provider !== null && st.isAvailable;
      });

      if (availableSpeedTiers.length > 0) {
        methods.push({
          method: method as PaymentMethod,
          speedTiers: availableSpeedTiers,
          minAmount: 10,
          maxAmount: Math.min(profile.perTransactionLimit, tierBenefits.perTransactionLimit),
          isAvailable: true,
          estimatedTime: this.formatEstimatedTime(availableSpeedTiers[0].estimatedSeconds),
        });
      }
    }

    return {
      methods,
      userProfile: profile,
      availableBalance: 10000, // Would get from balance service
      pendingCashouts: Array.from(this.cashoutRequests.values())
        .filter((r) => r.userId === userId && r.status === "pending")
        .reduce((sum, r) => sum + r.amount, 0),
    };
  }

  /**
   * Format estimated time for display
   */
  private formatEstimatedTime(seconds: number): string {
    if (seconds < 60) return "< 1 minute";
    if (seconds < 300) return "< 5 minutes";
    if (seconds < 3600) return "< 1 hour";
    if (seconds < 86400) return "Same day";
    return "1-3 business days";
  }

  // ==========================================================================
  // PAYMENT ACCOUNTS
  // ==========================================================================

  /**
   * Add payment account
   */
  async addPaymentAccount(
    userId: string,
    request: AddPaymentAccountRequest
  ): Promise<PaymentAccount> {
    const accountId = `account_${userId}_${Date.now()}`;
    const profile = this.getOrCreateProfile(userId);
    const tierBenefits = TIER_BENEFITS[profile.vipTier];

    const account: PaymentAccount = {
      id: accountId,
      userId,
      method: request.method,
      isDefault: request.setAsDefault ?? false,
      isVerified: false,
      details: request.details as PaymentAccount["details"],
      nickname: request.nickname,
      dailyLimit: tierBenefits.dailyLimit,
      monthlyLimit: tierBenefits.monthlyLimit,
      perTransactionLimit: tierBenefits.perTransactionLimit,
      totalWithdrawals: 0,
      totalAmount: 0,
      status: "pending_verification",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Verify account
    const provider = this.providerManager.getProviderForMethod(request.method);
    if (provider) {
      const verifyResult = await provider.verifyAccount(
        this.getDestinationFromDetails(request.details)
      );
      account.isVerified = verifyResult.isValid;
      account.status = verifyResult.isValid ? "active" : "pending_verification";
    }

    // Save
    const userAccounts = this.paymentAccounts.get(userId) ?? [];

    // If setting as default, unset other defaults
    if (request.setAsDefault) {
      userAccounts.forEach((a) => (a.isDefault = false));
    }

    userAccounts.push(account);
    this.paymentAccounts.set(userId, userAccounts);

    return account;
  }

  /**
   * Get user's payment accounts
   */
  getPaymentAccounts(userId: string): PaymentAccount[] {
    return this.paymentAccounts.get(userId) ?? [];
  }

  /**
   * Remove payment account
   */
  async removePaymentAccount(userId: string, accountId: string): Promise<boolean> {
    const userAccounts = this.paymentAccounts.get(userId) ?? [];
    const index = userAccounts.findIndex((a) => a.id === accountId);
    if (index === -1) return false;

    userAccounts.splice(index, 1);
    this.paymentAccounts.set(userId, userAccounts);
    return true;
  }

  /**
   * Get destination details from account
   */
  private getDestinationDetails(account: PaymentAccount): DestinationDetails {
    return {
      bankName: account.details.bankName,
      accountType: account.details.accountType,
      accountLast4: account.details.accountNumberLast4,
      cardBrand: account.details.cardBrand,
      cardLast4: account.details.cardLast4,
      email: account.details.email,
      phone: account.details.phone,
      username: account.details.username,
      walletAddress: account.details.walletAddress,
      network: account.details.network,
    };
  }

  /**
   * Get destination from partial details
   */
  private getDestinationFromDetails(details: Partial<PaymentAccount["details"]>): DestinationDetails {
    return {
      bankName: details.bankName,
      accountType: details.accountType,
      accountLast4: details.accountNumberLast4,
      cardBrand: details.cardBrand,
      cardLast4: details.cardLast4,
      email: details.email,
      phone: details.phone,
      username: details.username,
      walletAddress: details.walletAddress,
      network: details.network,
    };
  }

  // ==========================================================================
  // RISK & COMPLIANCE
  // ==========================================================================

  /**
   * Assess risk of cashout
   */
  private async assessRisk(
    request: CashoutRequest,
    profile: UserCashoutProfile
  ): Promise<{ score: number; flags: string[]; requiresReview: boolean }> {
    const flags: string[] = [];
    let score = 0;

    // Large amount
    if (request.amount > 5000) {
      flags.push("large_amount");
      score += 20;
    }

    // New user
    if (profile.lifetimeWithdrawals === 0) {
      flags.push("first_withdrawal");
      score += 15;
    }

    // Rapid withdrawals
    if (profile.dailyUsed > profile.dailyLimit * 0.8) {
      flags.push("approaching_daily_limit");
      score += 10;
    }

    // Instant crypto to new address
    if (
      request.speedTier === "instant" &&
      request.paymentMethod.startsWith("crypto_") &&
      profile.lifetimeWithdrawals < 3
    ) {
      flags.push("instant_crypto_new_user");
      score += 25;
    }

    // Velocity check (multiple cashouts in short period)
    const recentCashouts = Array.from(this.cashoutRequests.values())
      .filter(
        (r) =>
          r.userId === request.userId &&
          r.createdAt > Date.now() - 3600000 // Last hour
      );
    if (recentCashouts.length >= 3) {
      flags.push("high_velocity");
      score += 20;
    }

    return {
      score,
      flags,
      requiresReview: score >= 50,
    };
  }

  /**
   * Validate limits
   */
  private validateLimits(profile: UserCashoutProfile, amount: number): void {
    if (amount > profile.perTransactionLimit) {
      throw new Error(`Amount exceeds per-transaction limit of $${profile.perTransactionLimit}`);
    }
    if (profile.dailyUsed + amount > profile.dailyLimit) {
      throw new Error(`Amount would exceed daily limit of $${profile.dailyLimit}`);
    }
    if (profile.weeklyUsed + amount > profile.weeklyLimit) {
      throw new Error(`Amount would exceed weekly limit of $${profile.weeklyLimit}`);
    }
    if (profile.monthlyUsed + amount > profile.monthlyLimit) {
      throw new Error(`Amount would exceed monthly limit of $${profile.monthlyLimit}`);
    }
  }

  // ==========================================================================
  // USER PROFILE
  // ==========================================================================

  /**
   * Get or create user profile
   */
  private getOrCreateProfile(userId: string): UserCashoutProfile {
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      const tierBenefits = TIER_BENEFITS.standard;
      profile = {
        userId,
        vipTier: "standard",
        dailyLimit: tierBenefits.dailyLimit,
        weeklyLimit: tierBenefits.weeklyLimit,
        monthlyLimit: tierBenefits.monthlyLimit,
        perTransactionLimit: tierBenefits.perTransactionLimit,
        dailyUsed: 0,
        weeklyUsed: 0,
        monthlyUsed: 0,
        dailyResetAt: this.getNextMidnight(),
        weeklyResetAt: this.getNextWeek(),
        monthlyResetAt: this.getNextMonth(),
        lifetimeWithdrawals: 0,
        lifetimeVolume: 0,
        avgProcessingTime: 0,
        successRate: 100,
        feeDiscount: 0,
        freeInstantCashouts: 0,
        isFullyVerified: false,
        verificationLevel: "basic",
        updatedAt: Date.now(),
      };
      this.userProfiles.set(userId, profile);
    }

    // Check for resets
    this.checkAndResetLimits(profile);

    return profile;
  }

  /**
   * Check and reset limits if needed
   */
  private checkAndResetLimits(profile: UserCashoutProfile): void {
    const now = Date.now();

    if (now >= profile.dailyResetAt) {
      profile.dailyUsed = 0;
      profile.dailyResetAt = this.getNextMidnight();
    }

    if (now >= profile.weeklyResetAt) {
      profile.weeklyUsed = 0;
      profile.weeklyResetAt = this.getNextWeek();
      // Reset free instant cashouts weekly
      const tierBenefits = TIER_BENEFITS[profile.vipTier];
      profile.freeInstantCashouts = tierBenefits.freeInstantCashouts;
    }

    if (now >= profile.monthlyResetAt) {
      profile.monthlyUsed = 0;
      profile.monthlyResetAt = this.getNextMonth();
    }
  }

  /**
   * Get next midnight timestamp
   */
  private getNextMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Get next week timestamp
   */
  private getNextWeek(): number {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay()));
    nextWeek.setHours(0, 0, 0, 0);
    return nextWeek.getTime();
  }

  /**
   * Get next month timestamp
   */
  private getNextMonth(): number {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.getTime();
  }

  /**
   * Upgrade user tier
   */
  async upgradeTier(userId: string, newTier: VIPTier): Promise<UserCashoutProfile> {
    const profile = this.getOrCreateProfile(userId);
    const tierBenefits = TIER_BENEFITS[newTier];

    profile.vipTier = newTier;
    profile.dailyLimit = tierBenefits.dailyLimit;
    profile.weeklyLimit = tierBenefits.weeklyLimit;
    profile.monthlyLimit = tierBenefits.monthlyLimit;
    profile.perTransactionLimit = tierBenefits.perTransactionLimit;
    profile.feeDiscount = tierBenefits.feeDiscount;
    profile.freeInstantCashouts = tierBenefits.freeInstantCashouts;
    profile.updatedAt = Date.now();

    this.userProfiles.set(userId, profile);
    return profile;
  }

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  /**
   * Get cashout history
   */
  getCashoutHistory(
    userId: string,
    filters: CashoutHistoryFilters = {},
    limit: number = 20,
    cursor?: string
  ): CashoutHistoryResponse {
    let requests = Array.from(this.cashoutRequests.values())
      .filter((r) => r.userId === userId);

    // Apply filters
    if (filters.status) {
      requests = requests.filter((r) => r.status === filters.status);
    }
    if (filters.method) {
      requests = requests.filter((r) => r.paymentMethod === filters.method);
    }
    if (filters.startDate) {
      requests = requests.filter((r) => r.createdAt >= filters.startDate!);
    }
    if (filters.endDate) {
      requests = requests.filter((r) => r.createdAt <= filters.endDate!);
    }
    if (filters.minAmount) {
      requests = requests.filter((r) => r.amount >= filters.minAmount!);
    }
    if (filters.maxAmount) {
      requests = requests.filter((r) => r.amount <= filters.maxAmount!);
    }

    // Sort by date descending
    requests.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedRequests = requests.slice(startIndex, startIndex + limit);

    // Calculate stats
    const completed = requests.filter((r) => r.status === "completed");
    const totalWithdrawn = completed.reduce((sum, r) => sum + r.netAmount, 0);
    const avgProcessingTime = completed.length > 0
      ? completed.reduce((sum, r) => sum + (r.processingTime ?? 0), 0) / completed.length
      : 0;
    const successRate = requests.length > 0
      ? (completed.length / requests.length) * 100
      : 100;

    return {
      requests: paginatedRequests,
      total: requests.length,
      hasMore: startIndex + limit < requests.length,
      cursor: startIndex + limit < requests.length ? String(startIndex + limit) : undefined,
      stats: {
        totalWithdrawn,
        avgProcessingTime,
        successRate,
      },
    };
  }

  /**
   * Get cashout by ID
   */
  getCashout(cashoutId: string): CashoutRequest | null {
    return this.cashoutRequests.get(cashoutId) ?? null;
  }

  /**
   * Get provider manager
   */
  getProviderManager(): PaymentProviderManager {
    return this.providerManager;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createInstantCashoutService(
  providerManager?: PaymentProviderManager
): InstantCashoutService {
  return new InstantCashoutService(providerManager);
}
