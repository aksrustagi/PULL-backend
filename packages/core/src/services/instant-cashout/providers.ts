/**
 * Payment Provider Integrations
 * Manage connections to payment processors
 */

import type {
  PaymentMethod,
  PaymentProvider,
  ProviderTransaction,
  CashoutRequest,
  CashoutStatus,
  SpeedTier,
  DestinationDetails,
} from "./types";

// ============================================================================
// PROVIDER CONFIG
// ============================================================================

interface ProviderConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  webhookSecret?: string;
  sandboxMode: boolean;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface PaymentProviderClient {
  providerId: string;
  providerName: string;
  supportedMethods: PaymentMethod[];

  // Core operations
  initiatePayout(request: PayoutRequest): Promise<PayoutResponse>;
  checkStatus(reference: string): Promise<PayoutStatusResponse>;
  cancelPayout(reference: string): Promise<CancelResponse>;

  // Account operations
  verifyAccount(details: DestinationDetails): Promise<VerifyAccountResponse>;

  // Health
  healthCheck(): Promise<HealthCheckResponse>;
}

export interface PayoutRequest {
  externalId: string;
  amount: number;
  currency: string;
  destination: DestinationDetails;
  metadata?: Record<string, string>;
}

export interface PayoutResponse {
  success: boolean;
  reference: string;
  status: string;
  estimatedArrival?: number;
  fee?: number;
  error?: string;
}

export interface PayoutStatusResponse {
  reference: string;
  status: string;
  completedAt?: number;
  transactionHash?: string;
  error?: string;
}

export interface CancelResponse {
  success: boolean;
  reference: string;
  refundedAmount?: number;
  error?: string;
}

export interface VerifyAccountResponse {
  isValid: boolean;
  accountHolderName?: string;
  accountType?: string;
  error?: string;
}

export interface HealthCheckResponse {
  healthy: boolean;
  latencyMs: number;
  message?: string;
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Stripe Provider - Debit cards, bank transfers
 */
export class StripePayoutProvider implements PaymentProviderClient {
  providerId = "stripe";
  providerName = "Stripe";
  supportedMethods: PaymentMethod[] = ["debit_card", "instant_bank", "bank_transfer"];

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    // In production, call Stripe API
    // POST /v1/payouts or /v1/transfers

    return {
      success: true,
      reference: `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "pending",
      estimatedArrival: Date.now() + 60000, // 1 minute for instant
    };
  }

  async checkStatus(reference: string): Promise<PayoutStatusResponse> {
    // GET /v1/payouts/{payout_id}
    return {
      reference,
      status: "paid",
      completedAt: Date.now(),
    };
  }

  async cancelPayout(reference: string): Promise<CancelResponse> {
    // POST /v1/payouts/{payout_id}/cancel
    return {
      success: true,
      reference,
    };
  }

  async verifyAccount(details: DestinationDetails): Promise<VerifyAccountResponse> {
    // Verify bank account or card
    return {
      isValid: true,
      accountHolderName: details.accountHolderName,
      accountType: details.accountType,
    };
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    const start = Date.now();
    // Would ping Stripe API
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * PayPal Provider
 */
export class PayPalPayoutProvider implements PaymentProviderClient {
  providerId = "paypal";
  providerName = "PayPal";
  supportedMethods: PaymentMethod[] = ["paypal", "venmo"];

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    // POST /v1/payments/payouts
    return {
      success: true,
      reference: `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "PENDING",
      estimatedArrival: Date.now() + 300000, // 5 minutes
    };
  }

  async checkStatus(reference: string): Promise<PayoutStatusResponse> {
    // GET /v1/payments/payouts/{payout_batch_id}
    return {
      reference,
      status: "SUCCESS",
      completedAt: Date.now(),
    };
  }

  async cancelPayout(reference: string): Promise<CancelResponse> {
    // PayPal payouts can't be cancelled once sent
    return {
      success: false,
      reference,
      error: "PayPal payouts cannot be cancelled after initiation",
    };
  }

  async verifyAccount(details: DestinationDetails): Promise<VerifyAccountResponse> {
    // Verify PayPal email
    return {
      isValid: true,
    };
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return {
      healthy: true,
      latencyMs: 50,
    };
  }
}

/**
 * Crypto Provider (Fireblocks/Circle)
 */
export class CryptoPayoutProvider implements PaymentProviderClient {
  providerId = "crypto";
  providerName = "Crypto";
  supportedMethods: PaymentMethod[] = ["crypto_btc", "crypto_eth", "crypto_usdc", "crypto_usdt"];

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    // Would call Fireblocks/Circle API
    return {
      success: true,
      reference: `crypto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "SUBMITTED",
      estimatedArrival: Date.now() + 600000, // ~10 minutes for confirmations
    };
  }

  async checkStatus(reference: string): Promise<PayoutStatusResponse> {
    return {
      reference,
      status: "CONFIRMED",
      completedAt: Date.now(),
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
    };
  }

  async cancelPayout(reference: string): Promise<CancelResponse> {
    // Crypto transactions can't be cancelled once broadcast
    return {
      success: false,
      reference,
      error: "Crypto transactions cannot be cancelled once broadcast",
    };
  }

  async verifyAccount(details: DestinationDetails): Promise<VerifyAccountResponse> {
    // Verify wallet address format
    const address = details.walletAddress ?? "";
    const isValidEth = /^0x[a-fA-F0-9]{40}$/.test(address);
    const isValidBtc = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);

    return {
      isValid: isValidEth || isValidBtc,
    };
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return {
      healthy: true,
      latencyMs: 100,
    };
  }
}

/**
 * Plaid Provider - Bank transfers
 */
export class PlaidTransferProvider implements PaymentProviderClient {
  providerId = "plaid";
  providerName = "Plaid";
  supportedMethods: PaymentMethod[] = ["bank_transfer", "instant_bank"];

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    // POST /transfer/create
    return {
      success: true,
      reference: `plaid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "pending",
      estimatedArrival: Date.now() + 86400000, // 1 day for standard ACH
    };
  }

  async checkStatus(reference: string): Promise<PayoutStatusResponse> {
    // GET /transfer/get
    return {
      reference,
      status: "posted",
      completedAt: Date.now(),
    };
  }

  async cancelPayout(reference: string): Promise<CancelResponse> {
    // POST /transfer/cancel
    return {
      success: true,
      reference,
      refundedAmount: 0,
    };
  }

  async verifyAccount(details: DestinationDetails): Promise<VerifyAccountResponse> {
    // Use Plaid Auth to verify account
    return {
      isValid: true,
      accountHolderName: details.accountHolderName,
      accountType: details.accountType,
    };
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return {
      healthy: true,
      latencyMs: 75,
    };
  }
}

// ============================================================================
// PROVIDER MANAGER
// ============================================================================

export class PaymentProviderManager {
  private providers: Map<string, PaymentProviderClient> = new Map();
  private providersByMethod: Map<PaymentMethod, PaymentProviderClient[]> = new Map();
  private providerHealth: Map<string, PaymentProvider> = new Map();

  /**
   * Register a provider
   */
  registerProvider(provider: PaymentProviderClient): void {
    this.providers.set(provider.providerId, provider);

    // Map methods to providers
    for (const method of provider.supportedMethods) {
      const existing = this.providersByMethod.get(method) ?? [];
      existing.push(provider);
      this.providersByMethod.set(method, existing);
    }

    // Initialize health tracking
    this.providerHealth.set(provider.providerId, {
      id: provider.providerId,
      name: provider.providerName,
      methods: provider.supportedMethods,
      isActive: true,
      healthStatus: "healthy",
      lastHealthCheck: Date.now(),
      avgProcessingTime: 0,
      successRate: 100,
      uptimePercent: 100,
      dailyVolume: 0,
      dailyLimit: 1000000,
      perTransactionLimit: 50000,
      priority: 1,
      supportedCurrencies: ["USD"],
      supportedCountries: ["US"],
    });
  }

  /**
   * Get provider for a method
   */
  getProviderForMethod(method: PaymentMethod): PaymentProviderClient | null {
    const providers = this.providersByMethod.get(method) ?? [];

    // Get healthy providers sorted by priority
    const healthyProviders = providers.filter((p) => {
      const health = this.providerHealth.get(p.providerId);
      return health?.isActive && health.healthStatus !== "down";
    });

    if (healthyProviders.length === 0) return null;

    // Return highest priority provider
    return healthyProviders.sort((a, b) => {
      const healthA = this.providerHealth.get(a.providerId);
      const healthB = this.providerHealth.get(b.providerId);
      return (healthA?.priority ?? 99) - (healthB?.priority ?? 99);
    })[0];
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): PaymentProviderClient | null {
    return this.providers.get(providerId) ?? null;
  }

  /**
   * Get all providers
   */
  getAllProviders(): PaymentProvider[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Check health of all providers
   */
  async checkAllHealth(): Promise<void> {
    for (const [providerId, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        const providerHealth = this.providerHealth.get(providerId);
        if (providerHealth) {
          providerHealth.healthStatus = health.healthy ? "healthy" : "down";
          providerHealth.lastHealthCheck = Date.now();
          providerHealth.avgProcessingTime = health.latencyMs;
        }
      } catch (error) {
        const providerHealth = this.providerHealth.get(providerId);
        if (providerHealth) {
          providerHealth.healthStatus = "down";
          providerHealth.lastHealthCheck = Date.now();
        }
      }
    }
  }

  /**
   * Record transaction result for health tracking
   */
  recordTransactionResult(
    providerId: string,
    success: boolean,
    processingTimeMs: number
  ): void {
    const providerHealth = this.providerHealth.get(providerId);
    if (!providerHealth) return;

    // Update rolling averages
    const alpha = 0.1; // Smoothing factor
    providerHealth.avgProcessingTime =
      alpha * processingTimeMs + (1 - alpha) * providerHealth.avgProcessingTime;
    providerHealth.successRate =
      alpha * (success ? 100 : 0) + (1 - alpha) * providerHealth.successRate;

    // Update health status based on success rate
    if (providerHealth.successRate < 50) {
      providerHealth.healthStatus = "down";
    } else if (providerHealth.successRate < 80) {
      providerHealth.healthStatus = "degraded";
    } else {
      providerHealth.healthStatus = "healthy";
    }
  }

  /**
   * Get available methods for amount
   */
  getAvailableMethods(amount: number): PaymentMethod[] {
    const available: PaymentMethod[] = [];

    for (const [method, providers] of this.providersByMethod) {
      const hasHealthyProvider = providers.some((p) => {
        const health = this.providerHealth.get(p.providerId);
        return (
          health?.isActive &&
          health.healthStatus !== "down" &&
          amount <= health.perTransactionLimit
        );
      });

      if (hasHealthyProvider) {
        available.push(method);
      }
    }

    return available;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPaymentProviderManager(): PaymentProviderManager {
  const manager = new PaymentProviderManager();

  // Register default providers (in production, use real configs)
  const sandboxConfig: ProviderConfig = {
    apiKey: process.env.STRIPE_API_KEY ?? "test_key",
    apiSecret: process.env.STRIPE_API_SECRET ?? "test_secret",
    baseUrl: "https://api.stripe.com",
    sandboxMode: true,
  };

  manager.registerProvider(new StripePayoutProvider(sandboxConfig));
  manager.registerProvider(new PayPalPayoutProvider(sandboxConfig));
  manager.registerProvider(new CryptoPayoutProvider(sandboxConfig));
  manager.registerProvider(new PlaidTransferProvider(sandboxConfig));

  return manager;
}
