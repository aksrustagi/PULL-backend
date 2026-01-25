/**
 * Stripe Webhook Handler Service
 * Processes Stripe webhook events for deposits, payouts, and payment methods
 */

import Stripe from "stripe";
import { StripeClient, getStripeClient } from "./client";
import type {
  StripeWebhookEvent,
  StripeWebhookEventType,
  WebhookVerificationResult,
  CheckoutSessionCompleted,
  DepositRecord,
  WithdrawalRecord,
} from "./types";

// ============================================================================
// Types
// ============================================================================

export interface WebhookHandlerConfig {
  client?: StripeClient;
  onDepositCompleted?: (deposit: DepositCompletedEvent) => Promise<void>;
  onDepositFailed?: (deposit: DepositFailedEvent) => Promise<void>;
  onPayoutPaid?: (payout: PayoutPaidEvent) => Promise<void>;
  onPayoutFailed?: (payout: PayoutFailedEvent) => Promise<void>;
  onPaymentMethodAttached?: (event: PaymentMethodAttachedEvent) => Promise<void>;
  onCustomerCreated?: (event: CustomerCreatedEvent) => Promise<void>;
  onAccountUpdated?: (event: AccountUpdatedEvent) => Promise<void>;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// Event payload types
export interface DepositCompletedEvent {
  eventId: string;
  sessionId: string;
  paymentIntentId: string;
  customerId: string;
  userId: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  paymentMethod: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface DepositFailedEvent {
  eventId: string;
  paymentIntentId: string;
  userId?: string;
  amount: number;
  currency: string;
  failureCode?: string;
  failureMessage?: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface PayoutPaidEvent {
  eventId: string;
  payoutId: string;
  amount: number;
  currency: string;
  arrivalDate: number;
  method: "standard" | "instant";
  destinationId?: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface PayoutFailedEvent {
  eventId: string;
  payoutId: string;
  amount: number;
  currency: string;
  failureCode?: string;
  failureMessage?: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface PaymentMethodAttachedEvent {
  eventId: string;
  paymentMethodId: string;
  customerId: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  timestamp: number;
}

export interface CustomerCreatedEvent {
  eventId: string;
  customerId: string;
  email?: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface AccountUpdatedEvent {
  eventId: string;
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  timestamp: number;
}

export interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  eventType: string;
  processed: boolean;
  error?: string;
}

// ============================================================================
// Webhook Handler Class
// ============================================================================

export class StripeWebhookHandler {
  private readonly client: StripeClient;
  private readonly logger: Logger;
  private readonly handlers: WebhookHandlerConfig;

  constructor(config: WebhookHandlerConfig = {}) {
    this.client = config.client ?? getStripeClient();
    this.handlers = config;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[StripeWebhook] ${msg}`, meta ?? ""),
      info: (msg, meta) => console.info(`[StripeWebhook] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[StripeWebhook] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[StripeWebhook] ${msg}`, meta ?? ""),
    };
  }

  // ==========================================================================
  // Main Entry Point
  // ==========================================================================

  /**
   * Process a webhook event
   * @param payload - Raw request body
   * @param signature - Stripe-Signature header value
   */
  async processWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookProcessingResult> {
    // Verify signature and construct event
    const verificationResult = this.client.verifyWebhookSignature(
      payload,
      signature
    );

    if (!verificationResult.valid || !verificationResult.event) {
      this.logger.warn("Webhook verification failed", {
        error: verificationResult.error,
      });
      return {
        success: false,
        eventId: "unknown",
        eventType: "unknown",
        processed: false,
        error: verificationResult.error ?? "Signature verification failed",
      };
    }

    const event = verificationResult.event;

    this.logger.info("Processing webhook event", {
      eventId: event.id,
      eventType: event.type,
    });

    try {
      // Route to appropriate handler
      const processed = await this.routeEvent(event);

      return {
        success: true,
        eventId: event.id,
        eventType: event.type,
        processed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Webhook processing failed", {
        eventId: event.id,
        eventType: event.type,
        error: errorMessage,
      });

      return {
        success: false,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        error: errorMessage,
      };
    }
  }

  // ==========================================================================
  // Event Routing
  // ==========================================================================

  /**
   * Route event to appropriate handler
   */
  private async routeEvent(event: Stripe.Event): Promise<boolean> {
    switch (event.type) {
      case "checkout.session.completed":
        return this.handleCheckoutSessionCompleted(event);

      case "payment_intent.succeeded":
        return this.handlePaymentIntentSucceeded(event);

      case "payment_intent.payment_failed":
        return this.handlePaymentIntentFailed(event);

      case "payout.paid":
        return this.handlePayoutPaid(event);

      case "payout.failed":
        return this.handlePayoutFailed(event);

      case "payment_method.attached":
        return this.handlePaymentMethodAttached(event);

      case "customer.created":
        return this.handleCustomerCreated(event);

      case "account.updated":
        return this.handleAccountUpdated(event);

      case "transfer.created":
        return this.handleTransferCreated(event);

      default:
        this.logger.debug("Unhandled event type", { eventType: event.type });
        return false;
    }
  }

  // ==========================================================================
  // Checkout Session Handlers
  // ==========================================================================

  /**
   * Handle checkout.session.completed event
   */
  private async handleCheckoutSessionCompleted(
    event: Stripe.Event
  ): Promise<boolean> {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process deposit sessions
    if (session.metadata?.type !== "deposit") {
      this.logger.debug("Skipping non-deposit checkout session", {
        sessionId: session.id,
      });
      return false;
    }

    // Ensure payment is successful
    if (session.payment_status !== "paid") {
      this.logger.warn("Checkout session not paid", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });
      return false;
    }

    const depositEvent: DepositCompletedEvent = {
      eventId: event.id,
      sessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? "",
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? "",
      userId: session.metadata?.userId ?? "",
      grossAmount: parseInt(session.metadata?.grossAmount ?? "0", 10),
      feeAmount: parseInt(session.metadata?.feeAmount ?? "0", 10),
      netAmount: parseInt(session.metadata?.netAmount ?? "0", 10),
      currency: session.currency ?? "usd",
      paymentMethod: session.payment_method_types?.[0] ?? "card",
      metadata: (session.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.info("Deposit completed via checkout", {
      sessionId: session.id,
      userId: depositEvent.userId,
      netAmount: depositEvent.netAmount,
    });

    // Call registered handler
    if (this.handlers.onDepositCompleted) {
      await this.handlers.onDepositCompleted(depositEvent);
    }

    return true;
  }

  // ==========================================================================
  // Payment Intent Handlers
  // ==========================================================================

  /**
   * Handle payment_intent.succeeded event
   * Used for direct PaymentIntent flows (not checkout)
   */
  private async handlePaymentIntentSucceeded(
    event: Stripe.Event
  ): Promise<boolean> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // Only process deposit payment intents
    if (paymentIntent.metadata?.type !== "deposit") {
      return false;
    }

    const depositEvent: DepositCompletedEvent = {
      eventId: event.id,
      sessionId: "", // No session for direct PI
      paymentIntentId: paymentIntent.id,
      customerId:
        typeof paymentIntent.customer === "string"
          ? paymentIntent.customer
          : paymentIntent.customer?.id ?? "",
      userId: paymentIntent.metadata?.userId ?? "",
      grossAmount: parseInt(paymentIntent.metadata?.grossAmount ?? "0", 10),
      feeAmount: parseInt(paymentIntent.metadata?.feeAmount ?? "0", 10),
      netAmount: parseInt(paymentIntent.metadata?.netAmount ?? "0", 10),
      currency: paymentIntent.currency,
      paymentMethod:
        typeof paymentIntent.payment_method === "string"
          ? "unknown"
          : paymentIntent.payment_method?.type ?? "card",
      metadata: (paymentIntent.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.info("Deposit completed via payment intent", {
      paymentIntentId: paymentIntent.id,
      userId: depositEvent.userId,
      netAmount: depositEvent.netAmount,
    });

    if (this.handlers.onDepositCompleted) {
      await this.handlers.onDepositCompleted(depositEvent);
    }

    return true;
  }

  /**
   * Handle payment_intent.payment_failed event
   */
  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<boolean> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // Only process deposit payment intents
    if (paymentIntent.metadata?.type !== "deposit") {
      return false;
    }

    const failedEvent: DepositFailedEvent = {
      eventId: event.id,
      paymentIntentId: paymentIntent.id,
      userId: paymentIntent.metadata?.userId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      failureCode: paymentIntent.last_payment_error?.code,
      failureMessage: paymentIntent.last_payment_error?.message,
      metadata: (paymentIntent.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.warn("Deposit payment failed", {
      paymentIntentId: paymentIntent.id,
      failureCode: failedEvent.failureCode,
    });

    if (this.handlers.onDepositFailed) {
      await this.handlers.onDepositFailed(failedEvent);
    }

    return true;
  }

  // ==========================================================================
  // Payout Handlers
  // ==========================================================================

  /**
   * Handle payout.paid event
   */
  private async handlePayoutPaid(event: Stripe.Event): Promise<boolean> {
    const payout = event.data.object as Stripe.Payout;

    const payoutEvent: PayoutPaidEvent = {
      eventId: event.id,
      payoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      arrivalDate: payout.arrival_date,
      method: payout.method === "instant" ? "instant" : "standard",
      destinationId:
        typeof payout.destination === "string"
          ? payout.destination
          : payout.destination?.id,
      metadata: (payout.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.info("Payout paid", {
      payoutId: payout.id,
      amount: payout.amount,
    });

    if (this.handlers.onPayoutPaid) {
      await this.handlers.onPayoutPaid(payoutEvent);
    }

    return true;
  }

  /**
   * Handle payout.failed event
   */
  private async handlePayoutFailed(event: Stripe.Event): Promise<boolean> {
    const payout = event.data.object as Stripe.Payout;

    const failedEvent: PayoutFailedEvent = {
      eventId: event.id,
      payoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      failureCode: payout.failure_code ?? undefined,
      failureMessage: payout.failure_message ?? undefined,
      metadata: (payout.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.warn("Payout failed", {
      payoutId: payout.id,
      failureCode: failedEvent.failureCode,
    });

    if (this.handlers.onPayoutFailed) {
      await this.handlers.onPayoutFailed(failedEvent);
    }

    return true;
  }

  // ==========================================================================
  // Payment Method Handlers
  // ==========================================================================

  /**
   * Handle payment_method.attached event
   */
  private async handlePaymentMethodAttached(
    event: Stripe.Event
  ): Promise<boolean> {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;

    const attachedEvent: PaymentMethodAttachedEvent = {
      eventId: event.id,
      paymentMethodId: paymentMethod.id,
      customerId:
        typeof paymentMethod.customer === "string"
          ? paymentMethod.customer
          : paymentMethod.customer?.id ?? "",
      type: paymentMethod.type,
      card: paymentMethod.card
        ? {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
          }
        : undefined,
      timestamp: event.created,
    };

    this.logger.info("Payment method attached", {
      paymentMethodId: paymentMethod.id,
      customerId: attachedEvent.customerId,
      type: paymentMethod.type,
    });

    if (this.handlers.onPaymentMethodAttached) {
      await this.handlers.onPaymentMethodAttached(attachedEvent);
    }

    return true;
  }

  // ==========================================================================
  // Customer Handlers
  // ==========================================================================

  /**
   * Handle customer.created event
   */
  private async handleCustomerCreated(event: Stripe.Event): Promise<boolean> {
    const customer = event.data.object as Stripe.Customer;

    const createdEvent: CustomerCreatedEvent = {
      eventId: event.id,
      customerId: customer.id,
      email: customer.email ?? undefined,
      metadata: (customer.metadata as Record<string, string>) ?? {},
      timestamp: event.created,
    };

    this.logger.info("Customer created", {
      customerId: customer.id,
      email: customer.email,
    });

    if (this.handlers.onCustomerCreated) {
      await this.handlers.onCustomerCreated(createdEvent);
    }

    return true;
  }

  // ==========================================================================
  // Connected Account Handlers
  // ==========================================================================

  /**
   * Handle account.updated event (for connected accounts)
   */
  private async handleAccountUpdated(event: Stripe.Event): Promise<boolean> {
    const account = event.data.object as Stripe.Account;

    const updatedEvent: AccountUpdatedEvent = {
      eventId: event.id,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      timestamp: event.created,
    };

    this.logger.info("Connected account updated", {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });

    if (this.handlers.onAccountUpdated) {
      await this.handlers.onAccountUpdated(updatedEvent);
    }

    return true;
  }

  /**
   * Handle transfer.created event
   */
  private async handleTransferCreated(event: Stripe.Event): Promise<boolean> {
    const transfer = event.data.object as Stripe.Transfer;

    this.logger.info("Transfer created", {
      transferId: transfer.id,
      amount: transfer.amount,
      destination: transfer.destination,
    });

    // Transfer events are informational; actual payout confirmation
    // comes from payout.paid on the connected account
    return true;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create webhook handler with configuration
 */
export function createWebhookHandler(
  config: WebhookHandlerConfig = {}
): StripeWebhookHandler {
  return new StripeWebhookHandler(config);
}

/**
 * Singleton instance (lazy initialized)
 */
let _webhookHandler: StripeWebhookHandler | null = null;

export function getWebhookHandler(): StripeWebhookHandler {
  if (!_webhookHandler) {
    _webhookHandler = createWebhookHandler();
  }
  return _webhookHandler;
}

/**
 * Initialize webhook handler with custom handlers
 */
export function initializeWebhookHandler(
  config: WebhookHandlerConfig
): StripeWebhookHandler {
  _webhookHandler = createWebhookHandler(config);
  return _webhookHandler;
}

export default StripeWebhookHandler;
