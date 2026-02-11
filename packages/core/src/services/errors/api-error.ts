/**
 * PullApiError - Custom error class for the PULL platform.
 *
 * Wraps catalog error codes with runtime details and provides a structured
 * JSON response format suitable for API consumers. Integrates with the
 * error catalog for consistent codes, HTTP statuses, and user-facing messages.
 */

import { ErrorCodes, type ErrorCodeKey, type ErrorEntry } from "./catalog";

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

/** Structured error response returned to API consumers. */
export interface ApiErrorResponse {
  error: {
    /** Unique numeric error code from the catalog. */
    code: number;
    /** Machine-readable error key (e.g. "TRADE_INSUFFICIENT_BALANCE"). */
    key: string;
    /** User-facing error message (safe to display in UI). */
    message: string;
    /** HTTP status code. */
    status: number;
    /** Whether the client should retry the request. */
    retryable: boolean;
    /** Additional contextual details (never includes sensitive data). */
    details?: Record<string, unknown>;
    /** Correlation / request ID for support tickets. */
    requestId: string;
    /** ISO 8601 timestamp of when the error occurred. */
    timestamp: string;
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PullApiError extends Error {
  /** The catalog error code key. */
  public readonly errorCode: ErrorCodeKey;

  /** The catalog entry for this error. */
  public readonly entry: ErrorEntry;

  /** Optional structured details to include in the response. */
  public readonly details?: Record<string, unknown>;

  /** The original error that caused this one, if any. */
  public override readonly cause?: Error;

  /** Timestamp of error creation (ms since epoch). */
  public readonly timestamp: number;

  constructor(
    errorCode: ErrorCodeKey,
    details?: Record<string, unknown>,
    cause?: Error,
  ) {
    const entry = ErrorCodes[errorCode];
    super(entry.message);

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = "PullApiError";
    this.errorCode = errorCode;
    this.entry = entry;
    this.details = details;
    this.cause = cause;
    this.timestamp = Date.now();

    // Capture stack trace (V8 engines only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PullApiError);
    }
  }

  /** Numeric error code. */
  get code(): number {
    return this.entry.code;
  }

  /** HTTP status code. */
  get status(): number {
    return this.entry.status;
  }

  /** Whether the client should retry. */
  get retryable(): boolean {
    return this.entry.retryable;
  }

  /**
   * Build the structured API response object.
   *
   * @param requestId - Correlation ID from the request context.
   * @returns A JSON-serializable error response.
   */
  toResponse(requestId: string): ApiErrorResponse {
    return {
      error: {
        code: this.entry.code,
        key: this.errorCode,
        message: this.entry.message,
        status: this.entry.status,
        retryable: this.entry.retryable,
        ...(this.details && Object.keys(this.details).length > 0
          ? { details: this.sanitizeDetails(this.details) }
          : {}),
        requestId,
        timestamp: new Date(this.timestamp).toISOString(),
      },
    };
  }

  /**
   * Build a log-friendly object for structured logging.
   * Includes the stack trace and cause for debugging.
   */
  toLog(): Record<string, unknown> {
    return {
      name: this.name,
      errorCode: this.errorCode,
      code: this.entry.code,
      status: this.entry.status,
      message: this.message,
      retryable: this.entry.retryable,
      details: this.details,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
      stack: this.stack,
      timestamp: new Date(this.timestamp).toISOString(),
    };
  }

  /**
   * Create a JSON representation (used by JSON.stringify).
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      errorCode: this.errorCode,
      code: this.entry.code,
      status: this.entry.status,
      message: this.message,
      retryable: this.entry.retryable,
      details: this.details,
      timestamp: new Date(this.timestamp).toISOString(),
    };
  }

  /**
   * Strip potentially sensitive fields from details before including
   * in an API response. Internal-only fields are prefixed with `_`.
   */
  private sanitizeDetails(
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      // Skip internal fields and common sensitive patterns
      if (key.startsWith("_")) continue;
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
      sanitized[key] = value;
    }
    return sanitized;
  }
}

/** Keys that should never appear in API error responses. */
const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "ssn",
  "social_security",
  "credit_card",
  "card_number",
  "cvv",
  "pin",
  "private_key",
  "api_key",
  "apikey",
]);

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Type guard to check if an unknown error is a PullApiError.
 */
export function isPullApiError(error: unknown): error is PullApiError {
  return error instanceof PullApiError;
}

/**
 * Wrap an unknown error as a PullApiError.
 * If the error is already a PullApiError, return it as-is.
 * Otherwise, wrap it as a SYSTEM_INTERNAL_ERROR.
 */
export function toPullApiError(error: unknown): PullApiError {
  if (isPullApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new PullApiError(
      "SYSTEM_INTERNAL_ERROR",
      { originalMessage: error.message },
      error,
    );
  }

  return new PullApiError("SYSTEM_INTERNAL_ERROR", {
    originalMessage: String(error),
  });
}

/**
 * Convenience factory: create a PullApiError by numeric code.
 * Throws if the code is not found in the catalog.
 */
export function createErrorByCode(
  code: number,
  details?: Record<string, unknown>,
  cause?: Error,
): PullApiError {
  for (const [key, entry] of Object.entries(ErrorCodes)) {
    if (entry.code === code) {
      return new PullApiError(key as ErrorCodeKey, details, cause);
    }
  }
  throw new Error(`Unknown error code: ${code}`);
}

// ---------------------------------------------------------------------------
// Domain-specific factory functions for common errors
// ---------------------------------------------------------------------------

export const AuthErrors = {
  tokenExpired: (details?: Record<string, unknown>) =>
    new PullApiError("AUTH_TOKEN_EXPIRED", details),
  tokenInvalid: (details?: Record<string, unknown>) =>
    new PullApiError("AUTH_TOKEN_INVALID", details),
  tokenRevoked: (details?: Record<string, unknown>) =>
    new PullApiError("AUTH_TOKEN_REVOKED", details),
  insufficientRole: (requiredRole: string) =>
    new PullApiError("AUTH_INSUFFICIENT_ROLE", { requiredRole }),
  accountLocked: () => new PullApiError("AUTH_ACCOUNT_LOCKED"),
  mfaRequired: () => new PullApiError("AUTH_MFA_REQUIRED"),
  invalidCredentials: () => new PullApiError("AUTH_INVALID_CREDENTIALS"),
  rateLimited: (retryAfterMs: number) =>
    new PullApiError("AUTH_RATE_LIMITED", { retryAfterMs }),
} as const;

export const TradeErrors = {
  insufficientBalance: (required: number, available: number) =>
    new PullApiError("TRADE_INSUFFICIENT_BALANCE", { required, available }),
  marketClosed: (symbol: string) =>
    new PullApiError("TRADE_MARKET_CLOSED", { symbol }),
  orderNotFound: (orderId: string) =>
    new PullApiError("TRADE_ORDER_NOT_FOUND", { orderId }),
  invalidQuantity: (quantity: number, min: number, max: number) =>
    new PullApiError("TRADE_INVALID_QUANTITY", { quantity, min, max }),
  priceMoved: (expectedPrice: number, currentPrice: number) =>
    new PullApiError("TRADE_PRICE_MOVED", { expectedPrice, currentPrice }),
  circuitBreakerOpen: (service: string) =>
    new PullApiError("TRADE_CIRCUIT_BREAKER_OPEN", { service }),
  positionLimitExceeded: (currentPosition: number, limit: number) =>
    new PullApiError("TRADE_POSITION_LIMIT_EXCEEDED", { currentPosition, limit }),
  cancelNotAllowed: (orderId: string, state: string) =>
    new PullApiError("TRADE_CANCEL_NOT_ALLOWED", { orderId, currentState: state }),
  kycRequired: () => new PullApiError("TRADE_KYC_REQUIRED"),
  symbolNotFound: (symbol: string) =>
    new PullApiError("TRADE_SYMBOL_NOT_FOUND", { symbol }),
} as const;

export const PaymentErrors = {
  methodInvalid: (methodId: string) =>
    new PullApiError("PAYMENT_METHOD_INVALID", { methodId }),
  declined: (reason?: string) =>
    new PullApiError("PAYMENT_DECLINED", reason ? { reason } : undefined),
  amountTooLow: (amount: number, minimum: number) =>
    new PullApiError("PAYMENT_AMOUNT_TOO_LOW", { amount, minimum }),
  amountTooHigh: (amount: number, maximum: number) =>
    new PullApiError("PAYMENT_AMOUNT_TOO_HIGH", { amount, maximum }),
  dailyLimitExceeded: (current: number, limit: number) =>
    new PullApiError("PAYMENT_DAILY_LIMIT_EXCEEDED", { current, limit }),
  processorError: (processor: string, cause?: Error) =>
    new PullApiError("PAYMENT_PROCESSOR_ERROR", { processor }, cause),
  notFound: (paymentId: string) =>
    new PullApiError("PAYMENT_NOT_FOUND", { paymentId }),
  withdrawalInsufficientBalance: (requested: number, available: number) =>
    new PullApiError("PAYMENT_WITHDRAWAL_INSUFFICIENT_BALANCE", { requested, available }),
  fraudSuspected: (paymentId: string) =>
    new PullApiError("PAYMENT_FRAUD_SUSPECTED", { paymentId }),
  idempotencyConflict: (idempotencyKey: string) =>
    new PullApiError("PAYMENT_IDEMPOTENCY_CONFLICT", { idempotencyKey }),
} as const;

export const KycErrors = {
  notStarted: (userId: string) =>
    new PullApiError("KYC_NOT_STARTED", { userId }),
  alreadyVerified: (userId: string) =>
    new PullApiError("KYC_ALREADY_VERIFIED", { userId }),
  documentInvalid: (reason: string) =>
    new PullApiError("KYC_DOCUMENT_INVALID", { reason }),
  personaError: (cause?: Error) =>
    new PullApiError("KYC_PERSONA_ERROR", undefined, cause),
  checkrError: (cause?: Error) =>
    new PullApiError("KYC_CHECKR_ERROR", undefined, cause),
  suspended: (userId: string) =>
    new PullApiError("KYC_SUSPENDED", { userId }),
  rejected: (userId: string, reason?: string) =>
    new PullApiError("KYC_REJECTED", { userId, reason }),
  emailTokenInvalid: () => new PullApiError("KYC_EMAIL_TOKEN_INVALID"),
  sanctionsMatch: () => new PullApiError("KYC_SANCTIONS_MATCH"),
  duplicateIdentity: () => new PullApiError("KYC_DUPLICATE_IDENTITY"),
  maxAttemptsExceeded: (attempts: number, max: number) =>
    new PullApiError("KYC_MAX_ATTEMPTS_EXCEEDED", { attempts, max }),
} as const;

export const PredictionErrors = {
  notFound: (marketId: string) =>
    new PullApiError("PREDICTION_NOT_FOUND", { marketId }),
  notTrading: (marketId: string, currentState: string) =>
    new PullApiError("PREDICTION_NOT_TRADING", { marketId, currentState }),
  alreadyResolved: (marketId: string) =>
    new PullApiError("PREDICTION_ALREADY_RESOLVED", { marketId }),
  invalidOutcome: (outcome: string, validOutcomes: string[]) =>
    new PullApiError("PREDICTION_INVALID_OUTCOME", { outcome, validOutcomes }),
  disputed: (marketId: string) =>
    new PullApiError("PREDICTION_RESOLUTION_DISPUTED", { marketId }),
  voided: (marketId: string) =>
    new PullApiError("PREDICTION_VOIDED", { marketId }),
  oracleError: (cause?: Error) =>
    new PullApiError("PREDICTION_ORACLE_ERROR", undefined, cause),
  insufficientLiquidity: (marketId: string, requestedSize: number) =>
    new PullApiError("PREDICTION_LIQUIDITY_INSUFFICIENT", { marketId, requestedSize }),
} as const;

export const SystemErrors = {
  internal: (cause?: Error) =>
    new PullApiError("SYSTEM_INTERNAL_ERROR", undefined, cause),
  serviceUnavailable: (service: string) =>
    new PullApiError("SYSTEM_SERVICE_UNAVAILABLE", { service }),
  maintenance: () => new PullApiError("SYSTEM_MAINTENANCE_MODE"),
  rateLimitExceeded: (retryAfterMs: number) =>
    new PullApiError("SYSTEM_RATE_LIMIT_EXCEEDED", { retryAfterMs }),
  timeout: (operation: string, timeoutMs: number) =>
    new PullApiError("SYSTEM_TIMEOUT", { operation, timeoutMs }),
  validationError: (fields: Record<string, string>) =>
    new PullApiError("SYSTEM_VALIDATION_ERROR", { fields }),
  featureDisabled: (feature: string) =>
    new PullApiError("SYSTEM_FEATURE_DISABLED", { feature }),
  deprecated: (endpoint: string, alternative: string) =>
    new PullApiError("SYSTEM_DEPRECATED_ENDPOINT", { endpoint, alternative }),
  concurrencyConflict: (resource: string) =>
    new PullApiError("SYSTEM_CONCURRENCY_CONFLICT", { resource }),
} as const;
