/**
 * Sentry Enhanced Types
 *
 * Type definitions for the enhanced Sentry error tracking and performance
 * monitoring service for the PULL trading platform.
 *
 * Covers: configuration, financial context, order flow breadcrumbs,
 * circuit breaker integration, cron monitoring, PII stripping, and profiling.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface SentryConfig {
  /** Sentry DSN (Data Source Name) */
  dsn: string;
  /** Deployment environment */
  environment: SentryEnvironment;
  /** Release version string (e.g. "pull-api@1.2.3") */
  release?: string;
  /** Server name / hostname identifier */
  serverName?: string;
  /** Override default sampling rates */
  sampling?: SamplingSConfig;
  /** Enable Sentry profiling integration */
  profilingEnabled?: boolean;
  /** Enable session tracking for release health */
  sessionTrackingEnabled?: boolean;
  /** Enable debug mode (verbose SDK logging) */
  debug?: boolean;
  /** Additional Sentry init options passed through */
  extraOptions?: Record<string, unknown>;
}

export type SentryEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test";

export interface SamplingSConfig {
  /** Fraction of errors to send (0.0 - 1.0). Default: 1.0 in all envs */
  errorSampleRate?: number;
  /** Fraction of transactions to send (0.0 - 1.0). Default: env-specific */
  tracesSampleRate?: number;
  /** Fraction of transactions to profile (0.0 - 1.0). Default: env-specific */
  profilesSampleRate?: number;
  /** Per-transaction-name overrides. Matched transaction names use these rates instead. */
  transactionOverrides?: Record<string, number>;
}

/**
 * Environment-specific default sampling configuration.
 * Production: 100% errors, 10% transactions, 5% profiles
 * Staging:    100% errors, 50% transactions, 25% profiles
 * Development/Test: 100% everything
 */
export const DEFAULT_SAMPLING: Record<SentryEnvironment, Required<Omit<SamplingSConfig, "transactionOverrides">>> = {
  production: {
    errorSampleRate: 1.0,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.05,
  },
  staging: {
    errorSampleRate: 1.0,
    tracesSampleRate: 0.5,
    profilesSampleRate: 0.25,
  },
  development: {
    errorSampleRate: 1.0,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  },
  test: {
    errorSampleRate: 1.0,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  },
};

// ============================================================================
// Financial Context
// ============================================================================

/**
 * Financial context attached to Sentry scope. All fields are safe
 * (no raw balances -- only bucketed ranges, no PII).
 */
export interface FinancialContext {
  userId: string;
  kycTier: KycTier;
  /** Balance range bucket, never the exact amount */
  accountBalanceRange: BalanceRange;
  /** ISO-3166 country code if known */
  countryCode?: string;
  /** Account status for triage */
  accountStatus?: AccountStatus;
  /** Whether the user has verified payment methods */
  hasVerifiedPayment?: boolean;
}

export type KycTier =
  | "none"
  | "basic"
  | "intermediate"
  | "advanced"
  | "institutional";

export type BalanceRange =
  | "$0"
  | "$0.01-$100"
  | "$100-$1,000"
  | "$1,000-$10,000"
  | "$10,000-$50,000"
  | "$50,000-$100,000"
  | "$100,000+";

export type AccountStatus =
  | "active"
  | "pending_kyc"
  | "suspended"
  | "restricted"
  | "closed";

/**
 * Converts a numeric balance to the appropriate BalanceRange bucket.
 */
export function toBalanceRange(balance: number): BalanceRange {
  if (balance <= 0) return "$0";
  if (balance <= 100) return "$0.01-$100";
  if (balance <= 1_000) return "$100-$1,000";
  if (balance <= 10_000) return "$1,000-$10,000";
  if (balance <= 50_000) return "$10,000-$50,000";
  if (balance <= 100_000) return "$50,000-$100,000";
  return "$100,000+";
}

// ============================================================================
// Custom Tags
// ============================================================================

export interface PullSentryTags {
  assetClass?: AssetClass;
  orderType?: OrderType;
  paymentMethod?: PaymentMethod;
  kycTier?: KycTier;
  /** Service/module that originated the event */
  service?: string;
  /** Workflow name for Temporal workflows */
  workflow?: string;
  /** Circuit breaker name if relevant */
  circuitBreaker?: string;
  /** Cron job slug if relevant */
  cronJob?: string;
}

export type AssetClass =
  | "crypto"
  | "prediction"
  | "rwa"
  | "options"
  | "sports";

export type OrderType =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit"
  | "trailing_stop";

export type PaymentMethod =
  | "ach"
  | "wire"
  | "card"
  | "crypto"
  | "apple_pay"
  | "google_pay";

// ============================================================================
// Order Flow Breadcrumbs
// ============================================================================

export type OrderFlowStep =
  | "order_created"
  | "order_validated"
  | "order_submitted"
  | "order_acknowledged"
  | "order_partially_filled"
  | "order_filled"
  | "order_settled"
  | "order_cancelled"
  | "order_rejected"
  | "order_expired";

export interface OrderFlowBreadcrumb {
  orderId: string;
  step: OrderFlowStep;
  /** Timestamp in ISO-8601 */
  timestamp?: string;
  /** Additional metadata about this step */
  data?: Record<string, string | number | boolean>;
}

// ============================================================================
// Transaction Names
// ============================================================================

/**
 * Well-known transaction operation names for custom performance transactions.
 * Using constants prevents typos and enables consistent grouping in Sentry.
 */
export const TransactionOps = {
  // Trading
  TRADE_EXECUTE: "trade.execute",
  TRADE_SUBMIT_ORDER: "trade.submit_order",
  TRADE_SETTLE: "trade.settle",
  TRADE_CANCEL: "trade.cancel",

  // KYC
  KYC_VERIFY: "kyc.verify",
  KYC_PERSONA_INQUIRY: "kyc.persona_inquiry",
  KYC_CHECKR_BACKGROUND: "kyc.checkr_background",
  KYC_SANCTIONS_SCREEN: "kyc.sanctions_screen",

  // Payments
  PAYMENT_DEPOSIT: "payment.deposit",
  PAYMENT_WITHDRAWAL: "payment.withdrawal",
  PAYMENT_STRIPE_CHECKOUT: "payment.stripe_checkout",
  PAYMENT_ACH_TRANSFER: "payment.ach_transfer",

  // Data
  DATA_RECONCILIATION: "data.reconciliation",
  DATA_MARKET_SYNC: "data.market_sync",
  DATA_PORTFOLIO_CALC: "data.portfolio_calc",

  // External services
  EXTERNAL_KALSHI: "external.kalshi",
  EXTERNAL_MASSIVE: "external.massive",
  EXTERNAL_PLAID: "external.plaid",
  EXTERNAL_FIREBLOCKS: "external.fireblocks",
} as const;

export type TransactionOp = (typeof TransactionOps)[keyof typeof TransactionOps];

// ============================================================================
// Circuit Breaker Integration
// ============================================================================

export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerEvent {
  /** Name of the service protected by the circuit breaker */
  serviceName: string;
  /** Previous state */
  previousState: CircuitBreakerState;
  /** New state */
  newState: CircuitBreakerState;
  /** Failure count that triggered the transition */
  failureCount?: number;
  /** Failure threshold configured */
  failureThreshold?: number;
  /** When the circuit breaker will attempt to close again */
  resetTimeout?: number;
  /** Most recent error message */
  lastError?: string;
}

// ============================================================================
// Cron Monitoring
// ============================================================================

export interface CronMonitorConfig {
  /** Sentry cron monitor slug (kebab-case identifier) */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Cron schedule expression (e.g. "0 * * * *") */
  schedule: string;
  /** Schedule type */
  scheduleType: "crontab" | "interval";
  /** Max runtime in minutes before it's considered failed */
  maxRuntime?: number;
  /** Check-in margin in minutes (tolerance window) */
  checkinMargin?: number;
  /** Timezone for crontab schedules */
  timezone?: string;
}

export type CronCheckInStatus = "ok" | "error" | "in_progress";

/**
 * Pre-defined cron monitors for the PULL platform.
 */
export const CronMonitors: Record<string, CronMonitorConfig> = {
  DAILY_RECONCILIATION: {
    slug: "daily-reconciliation",
    name: "Daily Financial Reconciliation",
    schedule: "0 2 * * *",
    scheduleType: "crontab",
    maxRuntime: 60,
    checkinMargin: 5,
    timezone: "America/New_York",
  },
  HOURLY_MARKET_SYNC: {
    slug: "hourly-market-sync",
    name: "Hourly Market Data Sync",
    schedule: "0 * * * *",
    scheduleType: "crontab",
    maxRuntime: 15,
    checkinMargin: 2,
    timezone: "UTC",
  },
  NIGHTLY_CLEANUP: {
    slug: "nightly-cleanup",
    name: "Nightly Data Cleanup",
    schedule: "0 4 * * *",
    scheduleType: "crontab",
    maxRuntime: 30,
    checkinMargin: 5,
    timezone: "America/New_York",
  },
  WEEKLY_COMPLIANCE_REPORT: {
    slug: "weekly-compliance-report",
    name: "Weekly Compliance Report Generation",
    schedule: "0 6 * * 1",
    scheduleType: "crontab",
    maxRuntime: 120,
    checkinMargin: 10,
    timezone: "America/New_York",
  },
  SETTLEMENT_PROCESSOR: {
    slug: "settlement-processor",
    name: "Trade Settlement Processor",
    schedule: "*/5 * * * *",
    scheduleType: "crontab",
    maxRuntime: 10,
    checkinMargin: 2,
    timezone: "UTC",
  },
  KYC_QUEUE_PROCESSOR: {
    slug: "kyc-queue-processor",
    name: "KYC Queue Processor",
    schedule: "*/10 * * * *",
    scheduleType: "crontab",
    maxRuntime: 15,
    checkinMargin: 3,
    timezone: "UTC",
  },
  DAILY_PNL_SNAPSHOT: {
    slug: "daily-pnl-snapshot",
    name: "Daily P&L Snapshot",
    schedule: "0 0 * * *",
    scheduleType: "crontab",
    maxRuntime: 45,
    checkinMargin: 5,
    timezone: "America/New_York",
  },
} as const;

// ============================================================================
// PII Stripping
// ============================================================================

/**
 * Fields that must NEVER be sent to Sentry. This list is applied recursively
 * across event data, breadcrumb data, and extra context.
 *
 * Categories:
 * - Authentication credentials
 * - Personal identity (emails, SSNs, government IDs)
 * - Financial secrets (wallet keys, card numbers, account numbers)
 * - Passwords and secrets
 */
export const PII_FIELDS: ReadonlySet<string> = new Set([
  // Emails
  "email",
  "emailAddress",
  "email_address",
  "userEmail",
  "user_email",
  "contactEmail",
  "contact_email",

  // Passwords
  "password",
  "passwordHash",
  "password_hash",
  "newPassword",
  "new_password",
  "oldPassword",
  "old_password",
  "confirmPassword",
  "confirm_password",
  "passwordConfirmation",
  "password_confirmation",
  "currentPassword",
  "current_password",

  // Government IDs
  "ssn",
  "socialSecurityNumber",
  "social_security_number",
  "taxId",
  "tax_id",
  "ein",
  "itin",
  "driverLicense",
  "driver_license",
  "driverLicenseNumber",
  "driver_license_number",
  "passportNumber",
  "passport_number",
  "nationalId",
  "national_id",

  // Wallet / Crypto keys
  "privateKey",
  "private_key",
  "secretKey",
  "secret_key",
  "walletKey",
  "wallet_key",
  "mnemonic",
  "seedPhrase",
  "seed_phrase",
  "recoveryPhrase",
  "recovery_phrase",
  "encryptionKey",
  "encryption_key",

  // Financial
  "cardNumber",
  "card_number",
  "accountNumber",
  "account_number",
  "routingNumber",
  "routing_number",
  "cvv",
  "cvc",
  "securityCode",
  "security_code",
  "pin",
  "bankAccount",
  "bank_account",

  // Authentication tokens (not tags)
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "apiSecret",
  "api_secret",
  "bearer",
  "jwt",
  "sessionToken",
  "session_token",

  // Contact info
  "phoneNumber",
  "phone_number",
  "phone",
  "dateOfBirth",
  "date_of_birth",
  "dob",
  "address",
  "streetAddress",
  "street_address",
  "fullName",
  "full_name",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
]);

/**
 * Regex patterns that detect PII-like values even if the key isn't in the blocklist.
 * Applied to string values.
 */
export const PII_VALUE_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "card_number", pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { name: "phone_us", pattern: /\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
];

// ============================================================================
// Session Replay Hints (Frontend)
// ============================================================================

/**
 * Hints emitted by the backend that the frontend session replay SDK can use
 * to decide whether to keep a replay buffer or upgrade to a full session.
 */
export interface SessionReplayHint {
  /** If true, frontend should capture/persist the current replay session */
  shouldCapture: boolean;
  /** Reason the hint was emitted */
  reason: SessionReplayReason;
  /** Severity level for replay prioritization */
  severity: "low" | "medium" | "high" | "critical";
  /** Optional tags for filtering replays */
  tags?: Record<string, string>;
}

export type SessionReplayReason =
  | "error_occurred"
  | "high_value_trade"
  | "kyc_failure"
  | "payment_failure"
  | "fraud_flag"
  | "circuit_breaker_open"
  | "compliance_block"
  | "user_report";

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorSeverity = "low" | "medium" | "high" | "critical";
export type ErrorCategory =
  | "trading"
  | "kyc"
  | "payment"
  | "compliance"
  | "infrastructure"
  | "external_service"
  | "fraud"
  | "data_integrity"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  /** Fingerprint components for Sentry grouping */
  fingerprint?: string[];
}

// ============================================================================
// Sentry Client Interface
// ============================================================================

/**
 * Public interface for the enhanced Sentry client.
 * Consumers should program against this interface.
 */
export interface ISentryClient {
  /** Initialize Sentry SDK with enhanced configuration */
  init(config: SentryConfig): void;

  /** Check if Sentry is initialized and operational */
  isInitialized(): boolean;

  /** Capture an exception with financial context and tags */
  captureException(
    error: Error,
    options?: CaptureExceptionOptions,
  ): string | undefined;

  /** Capture a message at a given severity level */
  captureMessage(
    message: string,
    level?: SentryLevel,
    options?: CaptureMessageOptions,
  ): string | undefined;

  /** Set the current user's financial context on the scope */
  setFinancialContext(context: FinancialContext): void;

  /** Clear the current user context */
  clearUser(): void;

  /** Add an order flow breadcrumb */
  addOrderBreadcrumb(breadcrumb: OrderFlowBreadcrumb): void;

  /** Start a performance transaction */
  startTransaction(
    name: string,
    op: TransactionOp | string,
    data?: Record<string, string | number | boolean>,
  ): TransactionHandle;

  /** Record a circuit breaker state change */
  recordCircuitBreakerChange(event: CircuitBreakerEvent): void;

  /** Start a cron monitor check-in */
  cronCheckIn(
    monitorSlug: string,
    status: CronCheckInStatus,
    options?: CronCheckInOptions,
  ): string | undefined;

  /** Generate a session replay hint for the frontend */
  createReplayHint(
    reason: SessionReplayReason,
    severity: SessionReplayHint["severity"],
    tags?: Record<string, string>,
  ): SessionReplayHint;

  /** Flush pending events (call before process exit) */
  flush(timeout?: number): Promise<boolean>;

  /** Close the Sentry client */
  close(timeout?: number): Promise<boolean>;
}

export interface CaptureExceptionOptions {
  tags?: PullSentryTags;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  level?: SentryLevel;
  financialContext?: FinancialContext;
  /** Attach the user that triggered the error */
  userId?: string;
}

export interface CaptureMessageOptions {
  tags?: PullSentryTags;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  financialContext?: FinancialContext;
  userId?: string;
}

export interface CronCheckInOptions {
  /** Check-in ID returned from a previous in_progress check-in */
  checkInId?: string;
  /** Duration of the job in seconds (for completed check-ins) */
  duration?: number;
  /** Monitor config to upsert */
  monitorConfig?: CronMonitorConfig;
}

export type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

/**
 * Handle returned when starting a transaction, used to finish or add
 * child spans.
 */
export interface TransactionHandle {
  /** Finish the transaction (sets status ok or error) */
  finish(status?: "ok" | "error" | "cancelled"): void;
  /** Set additional data on the transaction */
  setData(key: string, value: string | number | boolean): void;
  /** Set a tag on this transaction */
  setTag(key: string, value: string): void;
  /** Set HTTP status on the transaction */
  setHttpStatus(statusCode: number): void;
  /** Get the trace ID for distributed tracing */
  traceId(): string | undefined;
}
