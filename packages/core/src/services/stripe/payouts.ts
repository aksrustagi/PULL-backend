/**
 * Stripe Payouts Service
 * Handles withdrawals and payouts to users via connected accounts
 */

import Stripe from "stripe";
import { StripeClient, getStripeClient } from "./client";
import { CheckoutService, getCheckoutService } from "./checkout";
import type {
  Payout,
  CreatePayoutParams,
  ConnectedAccount,
  CreateConnectedAccountParams,
  AccountLink,
  CreateAccountLinkParams,
  Transfer,
  TransferParams,
  FeeCalculation,
  StripeServiceError,
} from "./types";

// ============================================================================
// Types
// ============================================================================

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface PayoutServiceConfig {
  client?: StripeClient;
  checkoutService?: CheckoutService;
  logger?: Logger;
}

export interface WithdrawalRequest {
  userId: string;
  connectedAccountId: string;
  amount: number;
  currency?: string;
  method?: "standard" | "instant";
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface WithdrawalResult {
  transferId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  estimatedArrival?: number;
}

// ============================================================================
// Payout Service Class
// ============================================================================

export class PayoutService {
  private readonly client: StripeClient;
  private readonly stripe: Stripe;
  private readonly checkoutService: CheckoutService;
  private readonly logger: Logger;

  constructor(config: PayoutServiceConfig = {}) {
    this.client = config.client ?? getStripeClient();
    this.stripe = this.client.getStripeInstance();
    this.checkoutService = config.checkoutService ?? getCheckoutService();
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[StripePayout] ${msg}`, meta ?? ""),
      info: (msg, meta) => console.info(`[StripePayout] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[StripePayout] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[StripePayout] ${msg}`, meta ?? ""),
    };
  }

  // ==========================================================================
  // Connected Account Methods
  // ==========================================================================

  /**
   * Create a connected account for a user
   * Used for payouts/withdrawals
   */
  async createConnectedAccount(
    params: CreateConnectedAccountParams
  ): Promise<ConnectedAccount> {
    this.logger.info("Creating connected account", { email: params.email });

    const account = await this.stripe.accounts.create({
      type: params.type ?? "express",
      country: params.country ?? "US",
      email: params.email,
      business_type: params.businessType ?? "individual",
      capabilities: {
        transfers: { requested: true },
      },
      metadata: params.metadata,
    });

    this.logger.info("Connected account created", { accountId: account.id });

    return this.mapConnectedAccount(account);
  }

  /**
   * Get connected account by ID
   */
  async getConnectedAccount(accountId: string): Promise<ConnectedAccount | null> {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      return this.mapConnectedAccount(account);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create an account link for onboarding
   */
  async createAccountLink(params: CreateAccountLinkParams): Promise<AccountLink> {
    this.logger.info("Creating account link", { accountId: params.accountId });

    const link = await this.stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: params.type ?? "account_onboarding",
    });

    return {
      url: link.url,
      expiresAt: link.expires_at,
    };
  }

  /**
   * Create login link for connected account dashboard
   */
  async createLoginLink(accountId: string): Promise<{ url: string }> {
    const link = await this.stripe.accounts.createLoginLink(accountId);
    return { url: link.url };
  }

  /**
   * Delete/deauthorize connected account
   */
  async deleteConnectedAccount(accountId: string): Promise<void> {
    this.logger.info("Deleting connected account", { accountId });
    await this.stripe.accounts.del(accountId);
  }

  /**
   * Check if account is ready for payouts
   */
  async isAccountReadyForPayouts(accountId: string): Promise<boolean> {
    const account = await this.getConnectedAccount(accountId);
    if (!account) {
      return false;
    }
    return account.payoutsEnabled && account.detailsSubmitted;
  }

  private mapConnectedAccount(account: Stripe.Account): ConnectedAccount {
    return {
      id: account.id,
      type: account.type as "express" | "standard" | "custom",
      email: account.email ?? "",
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      country: account.country ?? "US",
      defaultCurrency: account.default_currency ?? "usd",
      metadata: (account.metadata as Record<string, string>) ?? {},
      createdAt: account.created,
    };
  }

  // ==========================================================================
  // Transfer Methods (Platform to Connected Account)
  // ==========================================================================

  /**
   * Create a transfer to a connected account
   * This is the first step of a withdrawal - transfer from platform to connected account
   */
  async createTransfer(params: TransferParams): Promise<Transfer> {
    this.logger.info("Creating transfer", {
      amount: params.amount,
      destination: params.destinationAccountId,
    });

    const transfer = await this.stripe.transfers.create(
      {
        amount: params.amount,
        currency: params.currency ?? "usd",
        destination: params.destinationAccountId,
        description: params.description,
        metadata: params.metadata,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );

    this.logger.info("Transfer created", { transferId: transfer.id });

    return {
      id: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      destinationAccountId:
        typeof transfer.destination === "string"
          ? transfer.destination
          : transfer.destination?.id ?? "",
      description: transfer.description ?? undefined,
      metadata: (transfer.metadata as Record<string, string>) ?? {},
      createdAt: transfer.created,
    };
  }

  /**
   * Get transfer by ID
   */
  async getTransfer(transferId: string): Promise<Transfer | null> {
    try {
      const transfer = await this.stripe.transfers.retrieve(transferId);
      return {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destinationAccountId:
          typeof transfer.destination === "string"
            ? transfer.destination
            : transfer.destination?.id ?? "",
        description: transfer.description ?? undefined,
        metadata: (transfer.metadata as Record<string, string>) ?? {},
        createdAt: transfer.created,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reverse a transfer (refund to platform)
   */
  async reverseTransfer(
    transferId: string,
    amount?: number
  ): Promise<Stripe.TransferReversal> {
    this.logger.info("Reversing transfer", { transferId, amount });

    const reversal = await this.stripe.transfers.createReversal(transferId, {
      amount,
    });

    this.logger.info("Transfer reversed", { reversalId: reversal.id });
    return reversal;
  }

  // ==========================================================================
  // Payout Methods (Connected Account to Bank)
  // ==========================================================================

  /**
   * Create a payout from connected account to their bank
   * Note: Payouts are typically automatic, but can be created manually
   */
  async createPayout(
    accountId: string,
    params: CreatePayoutParams
  ): Promise<Payout> {
    this.logger.info("Creating payout", {
      accountId,
      amount: params.amount,
      method: params.method,
    });

    const payout = await this.stripe.payouts.create(
      {
        amount: params.amount,
        currency: params.currency ?? "usd",
        method: params.method ?? "standard",
        description: params.description,
        metadata: params.metadata,
        destination: params.destinationId,
      },
      {
        stripeAccount: accountId,
        ...(params.idempotencyKey
          ? { idempotencyKey: params.idempotencyKey }
          : {}),
      }
    );

    this.logger.info("Payout created", { payoutId: payout.id });

    return this.mapPayout(payout);
  }

  /**
   * Get payout by ID
   */
  async getPayout(payoutId: string, accountId?: string): Promise<Payout | null> {
    try {
      const payout = await this.stripe.payouts.retrieve(
        payoutId,
        accountId ? { stripeAccount: accountId } : undefined
      );
      return this.mapPayout(payout);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List payouts for a connected account
   */
  async listPayouts(
    accountId: string,
    params?: {
      status?: "pending" | "paid" | "failed" | "canceled";
      limit?: number;
      startingAfter?: string;
    }
  ): Promise<{ payouts: Payout[]; hasMore: boolean }> {
    const payouts = await this.stripe.payouts.list(
      {
        status: params?.status,
        limit: params?.limit ?? 10,
        starting_after: params?.startingAfter,
      },
      { stripeAccount: accountId }
    );

    return {
      payouts: payouts.data.map((p) => this.mapPayout(p)),
      hasMore: payouts.has_more,
    };
  }

  /**
   * Cancel a payout (only possible if still pending)
   */
  async cancelPayout(payoutId: string, accountId?: string): Promise<Payout> {
    this.logger.info("Canceling payout", { payoutId });

    const payout = await this.stripe.payouts.cancel(
      payoutId,
      accountId ? { stripeAccount: accountId } : undefined
    );

    return this.mapPayout(payout);
  }

  private mapPayout(payout: Stripe.Payout): Payout {
    return {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status as Payout["status"],
      method: payout.method === "instant" ? "instant" : "standard",
      arrivalDate: payout.arrival_date,
      description: payout.description ?? undefined,
      destinationId:
        typeof payout.destination === "string"
          ? payout.destination
          : payout.destination?.id,
      failureCode: payout.failure_code ?? undefined,
      failureMessage: payout.failure_message ?? undefined,
      metadata: (payout.metadata as Record<string, string>) ?? {},
      createdAt: payout.created,
    };
  }

  // ==========================================================================
  // Withdrawal Flow (Combined Transfer + Payout)
  // ==========================================================================

  /**
   * Process a withdrawal request
   * 1. Calculate fees
   * 2. Transfer from platform to connected account
   * 3. Connected account receives funds (payout is automatic by default)
   */
  async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    const {
      userId,
      connectedAccountId,
      amount,
      currency = "usd",
      method = "standard",
      description,
      metadata = {},
      idempotencyKey,
    } = request;

    this.logger.info("Processing withdrawal", {
      userId,
      connectedAccountId,
      amount,
      method,
    });

    // Validate connected account is ready
    const isReady = await this.isAccountReadyForPayouts(connectedAccountId);
    if (!isReady) {
      throw new Error(
        "Connected account is not ready for payouts. Please complete account setup."
      );
    }

    // Calculate fees
    const isInstant = method === "instant";
    const feeCalculation = this.checkoutService.calculateWithdrawalFee(
      amount,
      isInstant
    );

    // Create transfer to connected account
    const transfer = await this.createTransfer({
      amount: feeCalculation.netAmount,
      currency,
      destinationAccountId: connectedAccountId,
      description: description ?? `Withdrawal for user ${userId}`,
      metadata: {
        ...metadata,
        userId,
        type: "withdrawal",
        grossAmount: amount.toString(),
        feeAmount: feeCalculation.feeAmount.toString(),
        netAmount: feeCalculation.netAmount.toString(),
        method,
      },
      idempotencyKey,
    });

    // For instant payouts, we need to explicitly create a payout
    // For standard payouts, they happen automatically based on the payout schedule
    let estimatedArrival: number | undefined;

    if (isInstant) {
      try {
        const payout = await this.createPayout(connectedAccountId, {
          amount: feeCalculation.netAmount,
          currency,
          method: "instant",
          description: `Instant withdrawal`,
          metadata: {
            transferId: transfer.id,
            userId,
          },
          idempotencyKey: idempotencyKey
            ? `${idempotencyKey}_payout`
            : undefined,
        });
        estimatedArrival = payout.arrivalDate;
      } catch (error) {
        this.logger.error("Instant payout failed, will fall back to standard", {
          error,
        });
        // Transfer still succeeded, payout will happen on standard schedule
      }
    }

    this.logger.info("Withdrawal processed", {
      transferId: transfer.id,
      netAmount: feeCalculation.netAmount,
    });

    return {
      transferId: transfer.id,
      amount,
      fee: feeCalculation.feeAmount,
      netAmount: feeCalculation.netAmount,
      currency,
      status: "pending",
      estimatedArrival,
    };
  }

  /**
   * Get estimated arrival time for a withdrawal
   */
  async getEstimatedArrival(
    method: "standard" | "instant"
  ): Promise<{ days: number; description: string }> {
    if (method === "instant") {
      return {
        days: 0,
        description: "Within 30 minutes",
      };
    }

    // Standard payouts typically take 1-2 business days
    return {
      days: 2,
      description: "1-2 business days",
    };
  }

  // ==========================================================================
  // Balance Methods
  // ==========================================================================

  /**
   * Get connected account balance
   */
  async getConnectedAccountBalance(
    accountId: string
  ): Promise<{ available: number; pending: number; currency: string }> {
    const balance = await this.stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    const usdAvailable =
      balance.available.find((b) => b.currency === "usd")?.amount ?? 0;
    const usdPending =
      balance.pending.find((b) => b.currency === "usd")?.amount ?? 0;

    return {
      available: usdAvailable,
      pending: usdPending,
      currency: "usd",
    };
  }

  // ==========================================================================
  // External Account Methods
  // ==========================================================================

  /**
   * List external accounts (bank accounts) for a connected account
   */
  async listExternalAccounts(
    accountId: string
  ): Promise<Stripe.BankAccount[] | Stripe.Card[]> {
    const accounts = await this.stripe.accounts.listExternalAccounts(accountId, {
      object: "bank_account",
      limit: 10,
    });

    return accounts.data as Stripe.BankAccount[];
  }

  /**
   * Add external bank account to connected account
   */
  async addExternalBankAccount(
    accountId: string,
    params: {
      accountNumber: string;
      routingNumber: string;
      accountHolderName: string;
      accountHolderType?: "individual" | "company";
    }
  ): Promise<Stripe.BankAccount> {
    this.logger.info("Adding external bank account", { accountId });

    const bankAccount = await this.stripe.accounts.createExternalAccount(
      accountId,
      {
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          account_number: params.accountNumber,
          routing_number: params.routingNumber,
          account_holder_name: params.accountHolderName,
          account_holder_type: params.accountHolderType ?? "individual",
        },
      }
    );

    return bankAccount as Stripe.BankAccount;
  }

  /**
   * Delete external account
   */
  async deleteExternalAccount(
    accountId: string,
    externalAccountId: string
  ): Promise<void> {
    this.logger.info("Deleting external account", {
      accountId,
      externalAccountId,
    });

    await this.stripe.accounts.deleteExternalAccount(
      accountId,
      externalAccountId
    );
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if error is a not found error
   */
  private isNotFoundError(error: unknown): boolean {
    if (error instanceof Stripe.errors.StripeError) {
      return error.code === "resource_missing";
    }
    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create payout service with configuration
 */
export function createPayoutService(
  config: PayoutServiceConfig = {}
): PayoutService {
  return new PayoutService(config);
}

/**
 * Singleton instance (lazy initialized)
 */
let _payoutService: PayoutService | null = null;

export function getPayoutService(): PayoutService {
  if (!_payoutService) {
    _payoutService = createPayoutService();
  }
  return _payoutService;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create connected account
 */
export async function createConnectedAccount(
  params: CreateConnectedAccountParams
): Promise<ConnectedAccount> {
  const service = getPayoutService();
  return service.createConnectedAccount(params);
}

/**
 * Process withdrawal
 */
export async function processWithdrawal(
  request: WithdrawalRequest
): Promise<WithdrawalResult> {
  const service = getPayoutService();
  return service.processWithdrawal(request);
}

/**
 * Create account onboarding link
 */
export async function createOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<AccountLink> {
  const service = getPayoutService();
  return service.createAccountLink({
    accountId,
    refreshUrl,
    returnUrl,
    type: "account_onboarding",
  });
}

export default PayoutService;
