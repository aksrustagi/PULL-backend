/**
 * Stripe Payment Service
 * Complete payment processing for deposits, withdrawals, and payouts
 */

// Client
export {
  StripeClient,
  createStripeClient,
  getStripeClient,
} from "./client";

// Checkout Service
export {
  CheckoutService,
  createCheckoutService,
  getCheckoutService,
  createDepositSession,
  getCheckoutSession,
  calculateDepositFee,
} from "./checkout";

// Webhook Handler
export {
  StripeWebhookHandler,
  createWebhookHandler,
  getWebhookHandler,
  initializeWebhookHandler,
} from "./webhooks";

export type {
  WebhookHandlerConfig,
  DepositCompletedEvent,
  DepositFailedEvent,
  PayoutPaidEvent,
  PayoutFailedEvent,
  PaymentMethodAttachedEvent,
  CustomerCreatedEvent,
  AccountUpdatedEvent,
  WebhookProcessingResult,
} from "./webhooks";

// Payout Service
export {
  PayoutService,
  createPayoutService,
  getPayoutService,
  createConnectedAccount,
  processWithdrawal,
  createOnboardingLink,
} from "./payouts";

export type {
  PayoutServiceConfig,
  WithdrawalRequest,
  WithdrawalResult,
} from "./payouts";

// Types
export type {
  // Config
  StripeClientConfig,

  // Checkout
  PaymentMethod,
  CreateCheckoutSessionParams,
  CheckoutSession,
  CheckoutSessionCompleted,

  // Payment Intent
  PaymentIntentStatus,
  PaymentIntent,
  CreatePaymentIntentParams,

  // Customer
  StripeCustomer,
  CreateCustomerParams,
  UpdateCustomerParams,

  // Payment Method
  PaymentMethodType,
  StripePaymentMethod,
  AttachPaymentMethodParams,
  SetupIntentParams,
  SetupIntent,

  // Payout
  PayoutStatus,
  PayoutMethod,
  CreatePayoutParams,
  Payout,

  // Connected Account
  AccountType,
  CreateConnectedAccountParams,
  ConnectedAccount,
  AccountLink,
  CreateAccountLinkParams,
  TransferParams,
  Transfer,

  // Webhook
  StripeWebhookEventType,
  StripeWebhookEvent,
  WebhookVerificationResult,

  // Records
  DepositStatus,
  WithdrawalStatus,
  DepositRecord,
  WithdrawalRecord,

  // Fees
  FeeStructure,
  FeeCalculation,

  // Errors
  StripeErrorCode,

  // Response
  PaginatedResponse,
  BalanceResponse,
} from "./types";

export { StripeServiceError } from "./types";

// Re-export entire types module for namespaced access
export * as stripeTypes from "./types";
