/**
 * Stripe Client
 * Core Stripe API client with authentication and request handling
 */

import Stripe from "stripe";
import type {
  StripeClientConfig,
  StripeCustomer,
  CreateCustomerParams,
  UpdateCustomerParams,
  StripePaymentMethod,
  AttachPaymentMethodParams,
  SetupIntent,
  SetupIntentParams,
  PaymentIntent,
  CreatePaymentIntentParams,
  BalanceResponse,
  PaginatedResponse,
  StripeServiceError,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_API_VERSION = "2024-12-18.acacia" as Stripe.LatestApiVersion;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Stripe Client Class
// ============================================================================

export class StripeClient {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger: Logger;

  constructor(config: StripeClientConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: (config.apiVersion as Stripe.LatestApiVersion) ?? DEFAULT_API_VERSION,
      maxNetworkRetries: config.maxNetworkRetries ?? DEFAULT_MAX_RETRIES,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      typescript: true,
    });

    this.webhookSecret = config.webhookSecret;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Stripe] ${msg}`, meta ?? ""),
      info: (msg, meta) => console.info(`[Stripe] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[Stripe] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[Stripe] ${msg}`, meta ?? ""),
    };
  }

  /**
   * Get the underlying Stripe instance for direct API access
   */
  getStripeInstance(): Stripe {
    return this.stripe;
  }

  /**
   * Get webhook secret for signature verification
   */
  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  // ==========================================================================
  // Customer Methods
  // ==========================================================================

  /**
   * Create a new Stripe customer
   */
  async createCustomer(params: CreateCustomerParams): Promise<StripeCustomer> {
    this.logger.info("Creating customer", { email: params.email });

    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      phone: params.phone,
      metadata: params.metadata,
      payment_method: params.paymentMethodId,
      invoice_settings: params.paymentMethodId
        ? { default_payment_method: params.paymentMethodId }
        : undefined,
    });

    this.logger.info("Customer created", { customerId: customer.id });

    return this.mapCustomer(customer);
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<StripeCustomer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        return null;
      }

      return this.mapCustomer(customer as Stripe.Customer);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(
    customerId: string,
    params: UpdateCustomerParams
  ): Promise<StripeCustomer> {
    this.logger.info("Updating customer", { customerId });

    const customer = await this.stripe.customers.update(customerId, {
      email: params.email,
      name: params.name,
      phone: params.phone,
      metadata: params.metadata,
      invoice_settings: params.defaultPaymentMethodId
        ? { default_payment_method: params.defaultPaymentMethodId }
        : undefined,
    });

    return this.mapCustomer(customer);
  }

  /**
   * Find customer by email
   */
  async findCustomerByEmail(email: string): Promise<StripeCustomer | null> {
    const customers = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return null;
    }

    return this.mapCustomer(customers.data[0]);
  }

  /**
   * Get or create customer
   */
  async getOrCreateCustomer(
    email: string,
    params?: Omit<CreateCustomerParams, "email">
  ): Promise<StripeCustomer> {
    const existing = await this.findCustomerByEmail(email);
    if (existing) {
      return existing;
    }

    return this.createCustomer({ email, ...params });
  }

  private mapCustomer(customer: Stripe.Customer): StripeCustomer {
    return {
      id: customer.id,
      email: customer.email ?? undefined,
      name: customer.name ?? undefined,
      phone: customer.phone ?? undefined,
      metadata: (customer.metadata as Record<string, string>) ?? {},
      defaultPaymentMethodId:
        typeof customer.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id,
      balance: customer.balance,
      createdAt: customer.created,
    };
  }

  // ==========================================================================
  // Payment Method Methods
  // ==========================================================================

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(
    params: AttachPaymentMethodParams
  ): Promise<StripePaymentMethod> {
    this.logger.info("Attaching payment method", {
      paymentMethodId: params.paymentMethodId,
      customerId: params.customerId,
    });

    const paymentMethod = await this.stripe.paymentMethods.attach(
      params.paymentMethodId,
      { customer: params.customerId }
    );

    return this.mapPaymentMethod(paymentMethod);
  }

  /**
   * Detach payment method from customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    this.logger.info("Detaching payment method", { paymentMethodId });
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  /**
   * Get payment method by ID
   */
  async getPaymentMethod(
    paymentMethodId: string
  ): Promise<StripePaymentMethod | null> {
    try {
      const paymentMethod =
        await this.stripe.paymentMethods.retrieve(paymentMethodId);
      return this.mapPaymentMethod(paymentMethod);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List customer payment methods
   */
  async listPaymentMethods(
    customerId: string,
    type?: "card" | "us_bank_account"
  ): Promise<StripePaymentMethod[]> {
    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: type ?? "card",
    });

    return paymentMethods.data.map((pm) => this.mapPaymentMethod(pm));
  }

  /**
   * Create a SetupIntent for collecting payment methods
   */
  async createSetupIntent(params: SetupIntentParams): Promise<SetupIntent> {
    this.logger.info("Creating setup intent", { customerId: params.customerId });

    const setupIntent = await this.stripe.setupIntents.create({
      customer: params.customerId,
      payment_method_types: params.paymentMethodTypes ?? ["card"],
      usage: params.usage ?? "off_session",
      metadata: params.metadata,
    });

    return {
      id: setupIntent.id,
      clientSecret: setupIntent.client_secret!,
      status: setupIntent.status as SetupIntent["status"],
      customerId:
        typeof setupIntent.customer === "string"
          ? setupIntent.customer
          : setupIntent.customer?.id,
      paymentMethodId:
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id,
      usage: setupIntent.usage as "on_session" | "off_session",
      createdAt: setupIntent.created,
    };
  }

  private mapPaymentMethod(pm: Stripe.PaymentMethod): StripePaymentMethod {
    return {
      id: pm.id,
      type: pm.type as StripePaymentMethod["type"],
      customerId:
        typeof pm.customer === "string" ? pm.customer : pm.customer?.id,
      card: pm.card
        ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
            funding: pm.card.funding as "credit" | "debit" | "prepaid" | "unknown",
            country: pm.card.country ?? undefined,
          }
        : undefined,
      usBankAccount: pm.us_bank_account
        ? {
            bankName: pm.us_bank_account.bank_name ?? "Unknown",
            last4: pm.us_bank_account.last4 ?? "****",
            accountType: pm.us_bank_account.account_type as "checking" | "savings",
            accountHolderType: pm.us_bank_account.account_holder_type as
              | "individual"
              | "company",
            routingNumber: pm.us_bank_account.routing_number ?? "",
          }
        : undefined,
      billingDetails: {
        name: pm.billing_details.name ?? undefined,
        email: pm.billing_details.email ?? undefined,
        phone: pm.billing_details.phone ?? undefined,
        address: pm.billing_details.address
          ? {
              line1: pm.billing_details.address.line1 ?? undefined,
              line2: pm.billing_details.address.line2 ?? undefined,
              city: pm.billing_details.address.city ?? undefined,
              state: pm.billing_details.address.state ?? undefined,
              postalCode: pm.billing_details.address.postal_code ?? undefined,
              country: pm.billing_details.address.country ?? undefined,
            }
          : undefined,
      },
      createdAt: pm.created,
    };
  }

  // ==========================================================================
  // Payment Intent Methods
  // ==========================================================================

  /**
   * Create a payment intent
   */
  async createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<PaymentIntent> {
    this.logger.info("Creating payment intent", {
      amount: params.amount,
      currency: params.currency,
    });

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: params.amount,
        currency: params.currency ?? "usd",
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        confirm: params.confirm,
        metadata: params.metadata,
        receipt_email: params.receiptEmail,
        description: params.description,
        automatic_payment_methods: { enabled: true },
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined
    );

    this.logger.info("Payment intent created", {
      paymentIntentId: paymentIntent.id,
    });

    return this.mapPaymentIntent(paymentIntent);
  }

  /**
   * Get payment intent by ID
   */
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return this.mapPaymentIntent(paymentIntent);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Cancel payment intent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    this.logger.info("Canceling payment intent", { paymentIntentId });
    const paymentIntent =
      await this.stripe.paymentIntents.cancel(paymentIntentId);
    return this.mapPaymentIntent(paymentIntent);
  }

  private mapPaymentIntent(pi: Stripe.PaymentIntent): PaymentIntent {
    return {
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status as PaymentIntent["status"],
      customerId:
        typeof pi.customer === "string" ? pi.customer : pi.customer?.id,
      paymentMethodId:
        typeof pi.payment_method === "string"
          ? pi.payment_method
          : pi.payment_method?.id,
      metadata: (pi.metadata as Record<string, string>) ?? {},
      receiptEmail: pi.receipt_email ?? undefined,
      description: pi.description ?? undefined,
      createdAt: pi.created,
      canceledAt: pi.canceled_at ?? undefined,
    };
  }

  // ==========================================================================
  // Balance Methods
  // ==========================================================================

  /**
   * Get platform balance
   */
  async getBalance(): Promise<BalanceResponse> {
    const balance = await this.stripe.balance.retrieve();

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
  // Webhook Verification
  // ==========================================================================

  /**
   * Construct and verify webhook event
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string
  ): { valid: boolean; event?: Stripe.Event; error?: string } {
    try {
      const event = this.constructWebhookEvent(payload, signature);
      return { valid: true, event };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown verification error";
      this.logger.warn("Webhook verification failed", { error: message });
      return { valid: false, error: message };
    }
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

  /**
   * List recent events for debugging
   */
  async listEvents(params?: {
    type?: string;
    limit?: number;
    created?: { gte?: number; lte?: number };
  }): Promise<PaginatedResponse<Stripe.Event>> {
    const events = await this.stripe.events.list({
      type: params?.type,
      limit: params?.limit ?? 10,
      created: params?.created,
    });

    return {
      data: events.data,
      hasMore: events.has_more,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create Stripe client from environment variables
 */
export function createStripeClient(): StripeClient {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required");
  }

  return new StripeClient({
    secretKey,
    webhookSecret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
}

/**
 * Singleton client instance (lazy initialized)
 */
let _stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!_stripeClient) {
    _stripeClient = createStripeClient();
  }
  return _stripeClient;
}

export default StripeClient;
