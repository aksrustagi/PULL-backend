/**
 * NUCLEAR GROWTH FEATURE #7: Instant Payments
 *
 * Instant withdrawals, crypto support, and betting-native wallet.
 * Nobody wants to wait 3-5 days for their winnings.
 *
 * WHY IT'S NUCLEAR:
 * - Instant gratification = more deposits
 * - Crypto attracts degens and whales
 * - Wallet creates platform lock-in
 * - Lower friction = higher conversion
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const PaymentMethodSchema = z.enum([
  "card",           // Credit/debit card
  "bank",           // Bank transfer/ACH
  "paypal",         // PayPal
  "venmo",          // Venmo
  "cashapp",        // Cash App
  "apple_pay",      // Apple Pay
  "google_pay",     // Google Pay
  "crypto_btc",     // Bitcoin
  "crypto_eth",     // Ethereum
  "crypto_usdc",    // USDC
  "crypto_usdt",    // USDT
  "crypto_sol",     // Solana
  "pull_wallet",    // Platform wallet
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const WithdrawalSpeedSchema = z.enum([
  "instant",    // < 1 minute
  "fast",       // < 1 hour
  "standard",   // 1-24 hours
  "slow",       // 1-5 business days
]);

export type WithdrawalSpeed = z.infer<typeof WithdrawalSpeedSchema>;

export interface Wallet {
  id: string;
  userId: string;

  // Balances
  availableBalance: number;
  pendingBalance: number;
  bonusBalance: number;
  lockedBalance: number;
  totalBalance: number;

  // Crypto balances
  cryptoBalances: CryptoBalance[];

  // Rewards
  pullPoints: number;
  cashbackPending: number;

  // Limits
  dailyDepositLimit: number;
  dailyWithdrawalLimit: number;
  depositedToday: number;
  withdrawnToday: number;

  // Verification
  verificationLevel: "basic" | "verified" | "premium";
  kycStatus: "none" | "pending" | "approved" | "rejected";

  // Settings
  defaultPaymentMethod?: PaymentMethod;
  autoWithdrawEnabled: boolean;
  autoWithdrawThreshold?: number;
  autoWithdrawMethod?: PaymentMethod;

  createdAt: number;
  updatedAt: number;
}

export interface CryptoBalance {
  currency: string;
  symbol: string;
  balance: number;
  balanceUsd: number;
  address?: string;
}

export interface Transaction {
  id: string;
  oduserId: string visitorId: string;
  type: "deposit" | "withdrawal" | "bet" | "win" | "bonus" | "transfer" | "fee" | "cashback";
  method?: PaymentMethod;

  // Amounts
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;

  // For crypto
  cryptoAmount?: number;
  cryptoCurrency?: string;
  txHash?: string;
  walletAddress?: string;

  // Status
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "reversed";
  statusReason?: string;

  // Timing
  speed?: WithdrawalSpeed;
  estimatedCompletionAt?: number;
  completedAt?: number;

  // Reference
  referenceId?: string;
  description?: string;

  createdAt: number;
  updatedAt: number;
}

export interface PaymentMethodConfig {
  method: PaymentMethod;
  name: string;
  icon: string;
  isEnabled: boolean;

  // Deposit config
  depositEnabled: boolean;
  depositMin: number;
  depositMax: number;
  depositFee: number;
  depositFeeType: "flat" | "percent";
  depositSpeed: WithdrawalSpeed;

  // Withdrawal config
  withdrawalEnabled: boolean;
  withdrawalMin: number;
  withdrawalMax: number;
  withdrawalFee: number;
  withdrawalFeeType: "flat" | "percent";
  withdrawalSpeed: WithdrawalSpeed;

  // Requirements
  requiresKyc: boolean;
  minVerificationLevel: Wallet["verificationLevel"];
}

export interface InstantWithdrawalEligibility {
  eligible: boolean;
  maxAmount: number;
  fee: number;
  feePercent: number;
  estimatedTime: string;
  reasons?: string[];
}

export interface CashbackConfig {
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  ratePercent: number;
  maxMonthly: number;
  minBetAmount: number;
}

export interface DepositBonus {
  id: string;
  name: string;
  description: string;

  // Match details
  matchPercent: number;
  maxBonus: number;
  minDeposit: number;

  // Requirements
  wageringRequirement: number; // e.g., 5x
  minOdds: number;
  expiresInDays: number;

  // Eligibility
  firstDepositOnly: boolean;
  promoCode?: string;

  isActive: boolean;
}

export interface ReferralReward {
  referrerId: string;
  referredId: string;
  referredUsername: string;

  // Rewards
  referrerReward: number;
  referredReward: number;
  rewardType: "cash" | "free_bet" | "bonus";

  // Status
  status: "pending" | "qualified" | "paid";
  qualificationRequirement: string;
  qualifiedAt?: number;
  paidAt?: number;

  createdAt: number;
}

// ============================================================================
// PAYMENT METHOD CONFIGS
// ============================================================================

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    method: "card",
    name: "Credit/Debit Card",
    icon: "💳",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 10,
    depositMax: 5000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "instant",
    withdrawalEnabled: false,
    withdrawalMin: 0,
    withdrawalMax: 0,
    withdrawalFee: 0,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "slow",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "bank",
    name: "Bank Transfer",
    icon: "🏦",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 50,
    depositMax: 50000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "standard",
    withdrawalEnabled: true,
    withdrawalMin: 20,
    withdrawalMax: 50000,
    withdrawalFee: 0,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "slow",
    requiresKyc: true,
    minVerificationLevel: "verified",
  },
  {
    method: "paypal",
    name: "PayPal",
    icon: "🅿️",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 10,
    depositMax: 10000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "instant",
    withdrawalEnabled: true,
    withdrawalMin: 10,
    withdrawalMax: 10000,
    withdrawalFee: 0,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "fast",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "venmo",
    name: "Venmo",
    icon: "📱",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 10,
    depositMax: 5000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "instant",
    withdrawalEnabled: true,
    withdrawalMin: 10,
    withdrawalMax: 5000,
    withdrawalFee: 0,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "instant",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "crypto_btc",
    name: "Bitcoin",
    icon: "₿",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 20,
    depositMax: 100000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "fast",
    withdrawalEnabled: true,
    withdrawalMin: 50,
    withdrawalMax: 100000,
    withdrawalFee: 0.0001,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "fast",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "crypto_eth",
    name: "Ethereum",
    icon: "⟠",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 20,
    depositMax: 100000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "fast",
    withdrawalEnabled: true,
    withdrawalMin: 50,
    withdrawalMax: 100000,
    withdrawalFee: 0.001,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "fast",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "crypto_usdc",
    name: "USDC",
    icon: "💵",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 10,
    depositMax: 500000,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "instant",
    withdrawalEnabled: true,
    withdrawalMin: 10,
    withdrawalMax: 500000,
    withdrawalFee: 1,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "instant",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
  {
    method: "pull_wallet",
    name: "PULL Wallet",
    icon: "👛",
    isEnabled: true,
    depositEnabled: true,
    depositMin: 0,
    depositMax: Infinity,
    depositFee: 0,
    depositFeeType: "flat",
    depositSpeed: "instant",
    withdrawalEnabled: true,
    withdrawalMin: 0,
    withdrawalMax: Infinity,
    withdrawalFee: 0,
    withdrawalFeeType: "flat",
    withdrawalSpeed: "instant",
    requiresKyc: false,
    minVerificationLevel: "basic",
  },
];

// ============================================================================
// CASHBACK TIERS
// ============================================================================

export const CASHBACK_TIERS: CashbackConfig[] = [
  { tier: "bronze", ratePercent: 1, maxMonthly: 50, minBetAmount: 5 },
  { tier: "silver", ratePercent: 2, maxMonthly: 100, minBetAmount: 5 },
  { tier: "gold", ratePercent: 3, maxMonthly: 250, minBetAmount: 5 },
  { tier: "platinum", ratePercent: 4, maxMonthly: 500, minBetAmount: 5 },
  { tier: "diamond", ratePercent: 5, maxMonthly: 1000, minBetAmount: 5 },
];

// ============================================================================
// INSTANT PAYMENTS SERVICE
// ============================================================================

export class InstantPaymentsService {
  /**
   * Create wallet for user
   */
  createWallet(userId: string): Wallet {
    return {
      id: `wallet_${userId}`,
      oduserId: oduserId,
      availableBalance: 0,
      pendingBalance: 0,
      bonusBalance: 0,
      lockedBalance: 0,
      totalBalance: 0,
      cryptoBalances: [],
      pullPoints: 0,
      cashbackPending: 0,
      dailyDepositLimit: 5000,
      dailyWithdrawalLimit: 10000,
      depositedToday: 0,
      withdrawnToday: 0,
      verificationLevel: "basic",
      kycStatus: "none",
      autoWithdrawEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Process deposit
   */
  processDeposit(
    wallet: Wallet,
    amount: number,
    method: PaymentMethod,
    bonus?: DepositBonus
  ): { wallet: Wallet; transaction: Transaction; bonusAmount?: number } {
    const config = PAYMENT_METHODS.find(m => m.method === method);
    if (!config) throw new Error("Invalid payment method");

    const fee = this.calculateFee(amount, config.depositFee, config.depositFeeType);
    const netAmount = amount - fee;

    // Calculate bonus
    let bonusAmount = 0;
    if (bonus) {
      bonusAmount = Math.min(
        netAmount * (bonus.matchPercent / 100),
        bonus.maxBonus
      );
    }

    const transaction: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      oduserId: wallet.userId,
      type: "deposit",
      method,
      amount,
      fee,
      netAmount,
      currency: "USD",
      status: config.depositSpeed === "instant" ? "completed" : "pending",
      speed: config.depositSpeed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (transaction.status === "completed") {
      transaction.completedAt = Date.now();
    }

    const updatedWallet: Wallet = {
      ...wallet,
      availableBalance: wallet.availableBalance + netAmount,
      bonusBalance: wallet.bonusBalance + bonusAmount,
      totalBalance: wallet.totalBalance + netAmount + bonusAmount,
      depositedToday: wallet.depositedToday + amount,
      updatedAt: Date.now(),
    };

    return { wallet: updatedWallet, transaction, bonusAmount: bonusAmount > 0 ? bonusAmount : undefined };
  }

  /**
   * Check instant withdrawal eligibility
   */
  checkInstantWithdrawalEligibility(
    wallet: Wallet,
    amount: number,
    method: PaymentMethod
  ): InstantWithdrawalEligibility {
    const config = PAYMENT_METHODS.find(m => m.method === method);
    const reasons: string[] = [];

    // Check if method supports instant
    if (!config || config.withdrawalSpeed !== "instant") {
      reasons.push("Payment method doesn't support instant withdrawals");
    }

    // Check verification level
    if (config && wallet.verificationLevel === "basic" && config.minVerificationLevel !== "basic") {
      reasons.push("Account verification required");
    }

    // Check daily limit
    const remainingLimit = wallet.dailyWithdrawalLimit - wallet.withdrawnToday;
    if (amount > remainingLimit) {
      reasons.push(`Daily limit exceeded. Remaining: $${remainingLimit.toFixed(2)}`);
    }

    // Check balance
    if (amount > wallet.availableBalance) {
      reasons.push("Insufficient available balance");
    }

    // Check minimum
    if (config && amount < config.withdrawalMin) {
      reasons.push(`Minimum withdrawal: $${config.withdrawalMin}`);
    }

    // Calculate max instant amount (90% of available, max $5000)
    const maxInstant = Math.min(
      wallet.availableBalance * 0.9,
      remainingLimit,
      5000
    );

    const feePercent = amount > 1000 ? 1 : 1.5;
    const fee = amount * (feePercent / 100);

    return {
      eligible: reasons.length === 0,
      maxAmount: maxInstant,
      fee,
      feePercent,
      estimatedTime: reasons.length === 0 ? "< 1 minute" : "N/A",
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }

  /**
   * Process withdrawal
   */
  processWithdrawal(
    wallet: Wallet,
    amount: number,
    method: PaymentMethod,
    isInstant: boolean = false
  ): { wallet: Wallet; transaction: Transaction } | { error: string } {
    const config = PAYMENT_METHODS.find(m => m.method === method);
    if (!config || !config.withdrawalEnabled) {
      return { error: "Withdrawal not available for this method" };
    }

    if (amount > wallet.availableBalance) {
      return { error: "Insufficient balance" };
    }

    if (amount > wallet.dailyWithdrawalLimit - wallet.withdrawnToday) {
      return { error: "Daily withdrawal limit exceeded" };
    }

    const baseFee = this.calculateFee(amount, config.withdrawalFee, config.withdrawalFeeType);
    const instantFee = isInstant ? amount * 0.015 : 0; // 1.5% instant fee
    const totalFee = baseFee + instantFee;
    const netAmount = amount - totalFee;

    const transaction: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      oduserId: wallet.userId,
      type: "withdrawal",
      method,
      amount,
      fee: totalFee,
      netAmount,
      currency: "USD",
      status: isInstant ? "completed" : "pending",
      speed: isInstant ? "instant" : config.withdrawalSpeed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (isInstant) {
      transaction.completedAt = Date.now();
    }

    const updatedWallet: Wallet = {
      ...wallet,
      availableBalance: wallet.availableBalance - amount,
      totalBalance: wallet.totalBalance - amount,
      withdrawnToday: wallet.withdrawnToday + amount,
      updatedAt: Date.now(),
    };

    return { wallet: updatedWallet, transaction };
  }

  /**
   * Generate crypto deposit address
   */
  generateCryptoAddress(
    wallet: Wallet,
    currency: "BTC" | "ETH" | "USDC" | "USDT" | "SOL"
  ): { address: string; qrCode: string } {
    // In production, this would call a crypto payment processor
    const address = `${currency.toLowerCase()}_${wallet.userId}_${Date.now().toString(36)}`;

    return {
      address,
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?data=${address}&size=200x200`,
    };
  }

  /**
   * Calculate cashback
   */
  calculateCashback(
    tier: CashbackConfig["tier"],
    totalWagered: number,
    currentMonthCashback: number
  ): { amount: number; remaining: number } {
    const config = CASHBACK_TIERS.find(t => t.tier === tier);
    if (!config) return { amount: 0, remaining: 0 };

    const rawCashback = totalWagered * (config.ratePercent / 100);
    const remaining = config.maxMonthly - currentMonthCashback;
    const amount = Math.min(rawCashback, remaining);

    return {
      amount: Math.round(amount * 100) / 100,
      remaining: Math.max(0, remaining - amount),
    };
  }

  /**
   * Process referral
   */
  processReferral(
    referrerId: string,
    referredId: string,
    referredUsername: string
  ): ReferralReward {
    return {
      referrerId,
      referredId,
      referredUsername,
      referrerReward: 25,
      referredReward: 25,
      rewardType: "free_bet",
      status: "pending",
      qualificationRequirement: "Referred user must deposit $25+ and place a bet",
      createdAt: Date.now(),
    };
  }

  /**
   * Get available deposit bonuses
   */
  getDepositBonuses(isFirstDeposit: boolean): DepositBonus[] {
    const bonuses: DepositBonus[] = [
      {
        id: "welcome_100",
        name: "Welcome Bonus",
        description: "100% match up to $500 on your first deposit",
        matchPercent: 100,
        maxBonus: 500,
        minDeposit: 10,
        wageringRequirement: 5,
        minOdds: -200,
        expiresInDays: 30,
        firstDepositOnly: true,
        isActive: true,
      },
      {
        id: "reload_50",
        name: "Reload Bonus",
        description: "50% match up to $250 on any deposit",
        matchPercent: 50,
        maxBonus: 250,
        minDeposit: 20,
        wageringRequirement: 3,
        minOdds: -150,
        expiresInDays: 14,
        firstDepositOnly: false,
        promoCode: "RELOAD50",
        isActive: true,
      },
      {
        id: "crypto_bonus",
        name: "Crypto Bonus",
        description: "150% match up to $750 for crypto deposits",
        matchPercent: 150,
        maxBonus: 750,
        minDeposit: 50,
        wageringRequirement: 5,
        minOdds: -200,
        expiresInDays: 30,
        firstDepositOnly: false,
        promoCode: "CRYPTO150",
        isActive: true,
      },
    ];

    return bonuses.filter(b => !b.firstDepositOnly || isFirstDeposit);
  }

  private calculateFee(amount: number, fee: number, type: "flat" | "percent"): number {
    if (type === "flat") return fee;
    return amount * (fee / 100);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createInstantPaymentsService(): InstantPaymentsService {
  return new InstantPaymentsService();
}
