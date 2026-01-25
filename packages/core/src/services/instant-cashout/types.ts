/**
 * Instant Cashout Types
 * Sub-60-second withdrawals with multiple payment providers
 */

import { z } from "zod";

// ============================================================================
// ENUMS & SCHEMAS
// ============================================================================

export const PaymentMethodSchema = z.enum([
  "bank_transfer",      // ACH (slower, cheaper)
  "instant_bank",       // Instant bank transfer (RTP)
  "debit_card",         // Push to debit card
  "paypal",             // PayPal
  "venmo",              // Venmo
  "crypto_btc",         // Bitcoin
  "crypto_eth",         // Ethereum
  "crypto_usdc",        // USDC stablecoin
  "crypto_usdt",        // USDT stablecoin
  "apple_pay",          // Apple Pay Cash
  "cash_app",           // Cash App
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const CashoutStatusSchema = z.enum([
  "pending",            // Initiated
  "processing",         // Being processed
  "sent",               // Sent to provider
  "completed",          // Successfully delivered
  "failed",             // Failed
  "cancelled",          // Cancelled by user
  "reversed",           // Reversed/returned
  "on_hold",            // Held for review
]);

export type CashoutStatus = z.infer<typeof CashoutStatusSchema>;

export const VIPTierSchema = z.enum([
  "standard",           // Basic tier
  "silver",             // 10+ withdrawals or $1k+ volume
  "gold",               // 50+ withdrawals or $10k+ volume
  "platinum",           // 200+ withdrawals or $50k+ volume
  "diamond",            // VIP invite only
]);

export type VIPTier = z.infer<typeof VIPTierSchema>;

export const SpeedTierSchema = z.enum([
  "instant",            // < 60 seconds
  "fast",               // < 5 minutes
  "standard",           // < 1 hour
  "economy",            // 1-3 business days
]);

export type SpeedTier = z.infer<typeof SpeedTierSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface CashoutRequest {
  id: string;
  userId: string;

  // Amount
  amount: number;
  currency: "usd" | "btc" | "eth" | "usdc";
  fiatAmount: number;               // Always in USD for tracking

  // Method
  paymentMethod: PaymentMethod;
  paymentAccountId: string;         // User's linked payment account
  destinationDetails: DestinationDetails;

  // Speed & Fees
  speedTier: SpeedTier;
  fee: number;
  feePercentage: number;
  netAmount: number;                // Amount after fees

  // Status
  status: CashoutStatus;
  statusHistory: StatusChange[];

  // Processing
  processorId?: string;
  processorReference?: string;
  transactionHash?: string;         // For crypto

  // Timing
  estimatedArrival: number;
  actualArrival?: number;
  processingTime?: number;          // Milliseconds

  // Risk & Compliance
  riskScore: number;
  riskFlags: string[];
  requiresManualReview: boolean;
  reviewedBy?: string;
  reviewedAt?: number;

  // Metadata
  ipAddress: string;
  userAgent: string;
  deviceId?: string;

  createdAt: number;
  updatedAt: number;
}

export interface DestinationDetails {
  // Bank
  bankName?: string;
  accountType?: "checking" | "savings";
  accountLast4?: string;
  routingNumber?: string;

  // Card
  cardBrand?: string;
  cardLast4?: string;

  // Digital wallets
  email?: string;
  phone?: string;
  username?: string;

  // Crypto
  walletAddress?: string;
  network?: string;
}

export interface StatusChange {
  status: CashoutStatus;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PAYMENT ACCOUNT TYPES
// ============================================================================

export interface PaymentAccount {
  id: string;
  userId: string;

  // Type
  method: PaymentMethod;
  isDefault: boolean;
  isVerified: boolean;

  // Details (encrypted/tokenized)
  details: PaymentAccountDetails;
  nickname?: string;

  // Limits
  dailyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;

  // Usage stats
  totalWithdrawals: number;
  totalAmount: number;
  lastUsedAt?: number;

  // Status
  status: "active" | "pending_verification" | "suspended" | "removed";

  createdAt: number;
  updatedAt: number;
}

export interface PaymentAccountDetails {
  // Bank
  bankName?: string;
  accountType?: "checking" | "savings";
  accountNumberLast4?: string;
  routingNumber?: string;
  accountHolderName?: string;
  plaidAccountId?: string;          // For Plaid-linked accounts

  // Card
  cardBrand?: string;
  cardLast4?: string;
  cardExpiry?: string;
  cardHolderName?: string;
  cardToken?: string;               // Processor token

  // Digital wallets
  email?: string;
  phone?: string;
  username?: string;
  externalAccountId?: string;       // PayPal/Venmo account ID

  // Crypto
  walletAddress?: string;
  network?: string;                 // mainnet, polygon, etc.
}

// ============================================================================
// VIP & LIMITS
// ============================================================================

export interface UserCashoutProfile {
  userId: string;
  vipTier: VIPTier;

  // Limits
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;

  // Usage
  dailyUsed: number;
  weeklyUsed: number;
  monthlyUsed: number;
  dailyResetAt: number;
  weeklyResetAt: number;
  monthlyResetAt: number;

  // Stats
  lifetimeWithdrawals: number;
  lifetimeVolume: number;
  avgProcessingTime: number;
  successRate: number;

  // Preferences
  preferredMethod?: PaymentMethod;
  preferredSpeedTier?: SpeedTier;

  // Fees
  feeDiscount: number;              // Percentage discount (VIP perk)
  freeInstantCashouts: number;      // Remaining free instant cashouts

  // Verification
  isFullyVerified: boolean;
  verificationLevel: "basic" | "standard" | "enhanced";

  updatedAt: number;
}

export interface TierBenefits {
  tier: VIPTier;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;
  feeDiscount: number;
  freeInstantCashouts: number;      // Per month
  prioritySupport: boolean;
  dedicatedManager: boolean;
  instantCryptoEnabled: boolean;
}

// ============================================================================
// FEE TYPES
// ============================================================================

export interface FeeStructure {
  method: PaymentMethod;
  speedTiers: SpeedTierFee[];
  minAmount: number;
  maxAmount: number;
  isAvailable: boolean;
  estimatedTime: string;
}

export interface SpeedTierFee {
  tier: SpeedTier;
  flatFee: number;
  percentageFee: number;
  minFee: number;
  maxFee: number;
  estimatedSeconds: number;
  isAvailable: boolean;
}

export interface FeeQuote {
  method: PaymentMethod;
  speedTier: SpeedTier;
  amount: number;

  // Fees
  baseFee: number;
  percentageFee: number;
  totalFee: number;
  netAmount: number;

  // Discounts
  vipDiscount: number;
  promoDiscount: number;
  freeInstantUsed: boolean;

  // Timing
  estimatedArrival: number;
  estimatedProcessingTime: number;

  // Valid until
  validUntil: number;
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export interface PaymentProvider {
  id: string;
  name: string;
  methods: PaymentMethod[];

  // Status
  isActive: boolean;
  healthStatus: "healthy" | "degraded" | "down";
  lastHealthCheck: number;

  // Performance
  avgProcessingTime: number;
  successRate: number;
  uptimePercent: number;

  // Limits
  dailyVolume: number;
  dailyLimit: number;
  perTransactionLimit: number;

  // Config
  priority: number;                 // For routing
  supportedCurrencies: string[];
  supportedCountries: string[];
}

export interface ProviderTransaction {
  id: string;
  providerId: string;
  cashoutRequestId: string;

  // Provider details
  providerReference: string;
  providerStatus: string;

  // Response
  responseCode?: string;
  responseMessage?: string;
  rawResponse?: string;

  // Timing
  sentAt: number;
  respondedAt?: number;
  completedAt?: number;

  // Retry info
  attemptNumber: number;
  willRetry: boolean;
  nextRetryAt?: number;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface InitiateCashoutRequest {
  amount: number;
  paymentAccountId: string;
  speedTier?: SpeedTier;
  currency?: "usd" | "btc" | "eth" | "usdc";
}

export interface GetFeeQuoteRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  speedTier?: SpeedTier;
}

export interface AddPaymentAccountRequest {
  method: PaymentMethod;
  details: Partial<PaymentAccountDetails>;
  nickname?: string;
  setAsDefault?: boolean;
}

export interface CashoutHistoryFilters {
  status?: CashoutStatus;
  method?: PaymentMethod;
  startDate?: number;
  endDate?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface CashoutHistoryResponse {
  requests: CashoutRequest[];
  total: number;
  hasMore: boolean;
  cursor?: string;
  stats: {
    totalWithdrawn: number;
    avgProcessingTime: number;
    successRate: number;
  };
}

export interface AvailableMethodsResponse {
  methods: FeeStructure[];
  userProfile: UserCashoutProfile;
  availableBalance: number;
  pendingCashouts: number;
}
