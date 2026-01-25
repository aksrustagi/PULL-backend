/**
 * Stripe Checkout Service
 * Handles checkout session creation for deposits
 */

import Stripe from "stripe";
import { StripeClient, getStripeClient } from "./client";
import type {
  CreateCheckoutSessionParams,
  CheckoutSession,
  FeeStructure,
  FeeCalculation,
  StripeServiceError,
} from "./types";

// ============================================================================
// Fee Configuration
// ============================================================================

const DEFAULT_FEE_STRUCTURE: FeeStructure = {
  depositFeePercent: 0.029, // 2.9% for card processing
  depositFeeMin: 30, // $0.30 minimum fee in cents
  depositFeeMax: 1000000, // $10,000 maximum fee cap
  withdrawalFeePercent: 0.0025, // 0.25% for ACH
  withdrawalFeeMin: 25, // $0.25 minimum
  withdrawalFeeMax: 500, // $5.00 maximum
  instantPayoutFeePercent: 0.01, // 1% for instant payouts
  instantPayoutFeeMin: 50, // $0.50 minimum
};

// ============================================================================
// Checkout Service Class
// ============================================================================

export class CheckoutService {
  private readonly client: StripeClient;
  private readonly stripe: Stripe;
  private readonly feeStructure: FeeStructure;

  constructor(client?: StripeClient, feeStructure?: Partial<FeeStructure>) {
    this.client = client ?? getStripeClient();
    this.stripe = this.client.getStripeInstance();
    this.feeStructure = { ...DEFAULT_FEE_STRUCTURE, ...feeStructure };
  }

  // ==========================================================================
  // Checkout Session Methods
  // ==========================================================================

  /**
   * Create a checkout session for deposit
   * @param params - Session parameters including user ID and amount
   * @returns Created checkout session with URL for redirect
   */
  async createDepositSession(
    params: CreateCheckoutSessionParams
  ): Promise<CheckoutSession> {
    const {
      userId,
      amount,
      currency = "usd",
      paymentMethods = ["card"],
      successUrl,
      cancelUrl,
      metadata = {},
      customerEmail,
      customerId,
      idempotencyKey,
    } = params;

    // Validate minimum deposit amount (e.g., $1.00)
    if (amount < 100) {
      throw new Error("Minimum deposit amount is $1.00");
    }

    // Calculate fees
    const feeCalculation = this.calculateDepositFee(amount);

    // Map payment methods to Stripe types
    const stripePaymentMethods = this.mapPaymentMethods(paymentMethods);

    // Build session parameters
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: stripePaymentMethods,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "Account Deposit",
              description: `Deposit $${(amount / 100).toFixed(2)} to your PULL account`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        ...metadata,
        userId,
        type: "deposit",
        grossAmount: amount.toString(),
        feeAmount: feeCalculation.feeAmount.toString(),
        netAmount: feeCalculation.netAmount.toString(),
      },
      payment_intent_data: {
        metadata: {
          userId,
          type: "deposit",
          grossAmount: amount.toString(),
          feeAmount: feeCalculation.feeAmount.toString(),
          netAmount: feeCalculation.netAmount.toString(),
        },
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    };

    // Add customer if provided
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    // Create the session
    const session = await this.stripe.checkout.sessions.create(
      sessionParams,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return this.mapCheckoutSession(session);
  }

  /**
   * Retrieve checkout session by ID
   */
  async getSession(sessionId: string): Promise<CheckoutSession | null> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });
      return this.mapCheckoutSession(session);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Expire a checkout session
   */
  async expireSession(sessionId: string): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.expire(sessionId);
    return this.mapCheckoutSession(session);
  }

  /**
   * List checkout sessions for a customer
   */
  async listSessions(params: {
    customerId?: string;
    status?: "open" | "complete" | "expired";
    limit?: number;
    startingAfter?: string;
  }): Promise<{ sessions: CheckoutSession[]; hasMore: boolean }> {
    const sessions = await this.stripe.checkout.sessions.list({
      customer: params.customerId,
      status: params.status,
      limit: params.limit ?? 10,
      starting_after: params.startingAfter,
    });

    return {
      sessions: sessions.data.map((s) => this.mapCheckoutSession(s)),
      hasMore: sessions.has_more,
    };
  }

  // ==========================================================================
  // Fee Calculation Methods
  // ==========================================================================

  /**
   * Calculate deposit fee
   * @param amount - Amount in cents
   */
  calculateDepositFee(amount: number): FeeCalculation {
    const { depositFeePercent, depositFeeMin, depositFeeMax } = this.feeStructure;

    // Calculate percentage-based fee
    let feeAmount = Math.round(amount * depositFeePercent);

    // Apply minimum
    feeAmount = Math.max(feeAmount, depositFeeMin);

    // Apply maximum cap
    feeAmount = Math.min(feeAmount, depositFeeMax);

    // Net amount after fee
    const netAmount = amount - feeAmount;

    return {
      grossAmount: amount,
      feeAmount,
      netAmount,
      feePercent: depositFeePercent,
    };
  }

  /**
   * Calculate withdrawal fee
   * @param amount - Amount in cents
   * @param instant - Whether to use instant payout
   */
  calculateWithdrawalFee(amount: number, instant: boolean = false): FeeCalculation {
    const {
      withdrawalFeePercent,
      withdrawalFeeMin,
      withdrawalFeeMax,
      instantPayoutFeePercent,
      instantPayoutFeeMin,
    } = this.feeStructure;

    let feePercent: number;
    let feeMin: number;
    let feeMax: number;

    if (instant) {
      feePercent = instantPayoutFeePercent;
      feeMin = instantPayoutFeeMin;
      feeMax = Infinity; // No cap for instant
    } else {
      feePercent = withdrawalFeePercent;
      feeMin = withdrawalFeeMin;
      feeMax = withdrawalFeeMax;
    }

    // Calculate percentage-based fee
    let feeAmount = Math.round(amount * feePercent);

    // Apply minimum
    feeAmount = Math.max(feeAmount, feeMin);

    // Apply maximum cap
    feeAmount = Math.min(feeAmount, feeMax);

    // Net amount after fee
    const netAmount = amount - feeAmount;

    return {
      grossAmount: amount,
      feeAmount,
      netAmount,
      feePercent,
    };
  }

  /**
   * Get fee structure (for displaying to users)
   */
  getFeeStructure(): FeeStructure {
    return { ...this.feeStructure };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Map payment methods to Stripe payment method types
   */
  private mapPaymentMethods(
    methods: CreateCheckoutSessionParams["paymentMethods"]
  ): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
    const mapping: Record<
      string,
      Stripe.Checkout.SessionCreateParams.PaymentMethodType
    > = {
      card: "card",
      bank_transfer: "us_bank_account",
      us_bank_account: "us_bank_account",
    };

    return (methods ?? ["card"]).map(
      (m) => mapping[m] ?? "card"
    ) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  }

  /**
   * Map Stripe checkout session to our type
   */
  private mapCheckoutSession(session: Stripe.Checkout.Session): CheckoutSession {
    return {
      id: session.id,
      url: session.url ?? "",
      status: session.status as "open" | "complete" | "expired",
      paymentStatus: session.payment_status as
        | "unpaid"
        | "paid"
        | "no_payment_required",
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
      metadata: (session.metadata as Record<string, string>) ?? {},
      expiresAt: session.expires_at,
      createdAt: session.created,
    };
  }

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
 * Create checkout service with default client
 */
export function createCheckoutService(
  feeStructure?: Partial<FeeStructure>
): CheckoutService {
  return new CheckoutService(undefined, feeStructure);
}

/**
 * Singleton instance (lazy initialized)
 */
let _checkoutService: CheckoutService | null = null;

export function getCheckoutService(): CheckoutService {
  if (!_checkoutService) {
    _checkoutService = createCheckoutService();
  }
  return _checkoutService;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick deposit session creation
 */
export async function createDepositSession(
  params: CreateCheckoutSessionParams
): Promise<CheckoutSession> {
  const service = getCheckoutService();
  return service.createDepositSession(params);
}

/**
 * Get checkout session
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<CheckoutSession | null> {
  const service = getCheckoutService();
  return service.getSession(sessionId);
}

/**
 * Calculate deposit fee
 */
export function calculateDepositFee(amount: number): FeeCalculation {
  const service = getCheckoutService();
  return service.calculateDepositFee(amount);
}

export default CheckoutService;
