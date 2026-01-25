/**
 * Stripe Payment Service Types
 * Types for Stripe payment processing, checkouts, and payouts
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface StripeClientConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey?: string;
  apiVersion?: string;
  maxNetworkRetries?: number;
  timeout?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Checkout Types
// ============================================================================

export type PaymentMethod = "card" | "bank_transfer" | "us_bank_account";

export interface CreateCheckoutSessionParams {
  userId: string;
  amount: number;
  currency?: string;
  paymentMethods?: PaymentMethod[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  customerEmail?: string;
  customerId?: string;
  idempotencyKey?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "unpaid" | "paid" | "no_payment_required";
  amount: number;
  currency: string;
  customerId?: string;
  paymentIntentId?: string;
  metadata: Record<string, string>;
  expiresAt: number;
  createdAt: number;
}

export interface CheckoutSessionCompleted {
  sessionId: string;
  paymentIntentId: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentStatus: "paid";
  metadata: Record<string, string>;
}

// ============================================================================
// Payment Intent Types
// ============================================================================

export type PaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "canceled"
  | "succeeded";

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  customerId?: string;
  paymentMethodId?: string;
  metadata: Record<string, string>;
  receiptEmail?: string;
  description?: string;
  createdAt: number;
  canceledAt?: number;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency?: string;
  customerId?: string;
  paymentMethodId?: string;
  confirm?: boolean;
  metadata?: Record<string, string>;
  receiptEmail?: string;
  description?: string;
  idempotencyKey?: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  metadata: Record<string, string>;
  defaultPaymentMethodId?: string;
  balance: number;
  createdAt: number;
}

export interface CreateCustomerParams {
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
  paymentMethodId?: string;
}

export interface UpdateCustomerParams {
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
  defaultPaymentMethodId?: string;
}

// ============================================================================
// Payment Method Types
// ============================================================================

export type PaymentMethodType = "card" | "us_bank_account" | "sepa_debit" | "link";

export interface StripePaymentMethod {
  id: string;
  type: PaymentMethodType;
  customerId?: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding: "credit" | "debit" | "prepaid" | "unknown";
    country?: string;
  };
  usBankAccount?: {
    bankName: string;
    last4: string;
    accountType: "checking" | "savings";
    accountHolderType: "individual" | "company";
    routingNumber: string;
  };
  billingDetails: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  createdAt: number;
}

export interface AttachPaymentMethodParams {
  paymentMethodId: string;
  customerId: string;
}

export interface SetupIntentParams {
  customerId: string;
  paymentMethodTypes?: PaymentMethodType[];
  usage?: "on_session" | "off_session";
  metadata?: Record<string, string>;
}

export interface SetupIntent {
  id: string;
  clientSecret: string;
  status: "requires_payment_method" | "requires_confirmation" | "requires_action" | "processing" | "canceled" | "succeeded";
  customerId?: string;
  paymentMethodId?: string;
  usage: "on_session" | "off_session";
  createdAt: number;
}

// ============================================================================
// Payout Types
// ============================================================================

export type PayoutStatus =
  | "pending"
  | "in_transit"
  | "paid"
  | "failed"
  | "canceled";

export type PayoutMethod = "standard" | "instant";

export interface CreatePayoutParams {
  amount: number;
  currency?: string;
  method?: PayoutMethod;
  description?: string;
  metadata?: Record<string, string>;
  destinationId?: string;
  idempotencyKey?: string;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: PayoutMethod;
  arrivalDate: number;
  description?: string;
  destinationId?: string;
  failureCode?: string;
  failureMessage?: string;
  metadata: Record<string, string>;
  createdAt: number;
}

// ============================================================================
// Connected Account Types (for payouts to users)
// ============================================================================

export type AccountType = "express" | "standard" | "custom";

export interface CreateConnectedAccountParams {
  email: string;
  type?: AccountType;
  country?: string;
  businessType?: "individual" | "company";
  metadata?: Record<string, string>;
}

export interface ConnectedAccount {
  id: string;
  type: AccountType;
  email: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string;
  defaultCurrency: string;
  metadata: Record<string, string>;
  createdAt: number;
}

export interface AccountLink {
  url: string;
  expiresAt: number;
}

export interface CreateAccountLinkParams {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
  type?: "account_onboarding" | "account_update";
}

export interface TransferParams {
  amount: number;
  currency?: string;
  destinationAccountId: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface Transfer {
  id: string;
  amount: number;
  currency: string;
  destinationAccountId: string;
  description?: string;
  metadata: Record<string, string>;
  createdAt: number;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.expired"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "payment_intent.canceled"
  | "payment_method.attached"
  | "payment_method.detached"
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "payout.created"
  | "payout.paid"
  | "payout.failed"
  | "payout.canceled"
  | "transfer.created"
  | "account.updated"
  | "account.external_account.created"
  | "setup_intent.succeeded"
  | "setup_intent.setup_failed";

export interface StripeWebhookEvent<T = unknown> {
  id: string;
  type: StripeWebhookEventType;
  data: {
    object: T;
    previousAttributes?: Partial<T>;
  };
  apiVersion: string;
  created: number;
  livemode: boolean;
  pendingWebhooks: number;
  request?: {
    id?: string;
    idempotencyKey?: string;
  };
}

export interface WebhookVerificationResult<T = unknown> {
  valid: boolean;
  event?: StripeWebhookEvent<T>;
  error?: string;
}

// ============================================================================
// Deposit/Withdrawal Tracking Types
// ============================================================================

export type DepositStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type WithdrawalStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface DepositRecord {
  id: string;
  userId: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: DepositStatus;
  method: "card" | "bank_transfer";
  metadata?: Record<string, string>;
  createdAt: number;
  completedAt?: number;
  failedAt?: number;
  failureReason?: string;
}

export interface WithdrawalRecord {
  id: string;
  userId: string;
  stripePayoutId?: string;
  stripeTransferId?: string;
  connectedAccountId?: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: WithdrawalStatus;
  method: "bank_transfer" | "instant";
  destination: string;
  metadata?: Record<string, string>;
  createdAt: number;
  completedAt?: number;
  failedAt?: number;
  failureReason?: string;
}

// ============================================================================
// Fee Calculation Types
// ============================================================================

export interface FeeStructure {
  depositFeePercent: number;
  depositFeeMin: number;
  depositFeeMax: number;
  withdrawalFeePercent: number;
  withdrawalFeeMin: number;
  withdrawalFeeMax: number;
  instantPayoutFeePercent: number;
  instantPayoutFeeMin: number;
}

export interface FeeCalculation {
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  feePercent: number;
}

// ============================================================================
// Error Types
// ============================================================================

export type StripeErrorCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "invalid_cvc"
  | "processing_error"
  | "incorrect_number"
  | "rate_limit"
  | "invalid_request"
  | "authentication_required"
  | "payment_method_not_available"
  | "resource_missing"
  | "account_invalid"
  | "payout_limit_exceeded"
  | "balance_insufficient";

export class StripeServiceError extends Error {
  constructor(
    message: string,
    public readonly code: StripeErrorCode | string,
    public readonly statusCode: number = 400,
    public readonly declineCode?: string,
    public readonly stripeErrorId?: string
  ) {
    super(message);
    this.name = "StripeServiceError";
  }

  static fromStripeError(err: unknown): StripeServiceError {
    if (typeof err === "object" && err !== null) {
      const stripeErr = err as Record<string, unknown>;
      return new StripeServiceError(
        (stripeErr.message as string) || "Unknown Stripe error",
        (stripeErr.code as string) || "unknown_error",
        (stripeErr.statusCode as number) || 400,
        stripeErr.decline_code as string | undefined,
        stripeErr.request_id as string | undefined
      );
    }
    return new StripeServiceError(
      "Unknown error occurred",
      "unknown_error",
      500
    );
  }
}

// ============================================================================
// Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  totalCount?: number;
}

export interface BalanceResponse {
  available: number;
  pending: number;
  currency: string;
}
