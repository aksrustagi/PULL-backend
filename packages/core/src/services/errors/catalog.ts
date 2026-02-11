/**
 * PULL Platform API Error Catalog
 *
 * Centralized, structured error definitions for every domain in the platform.
 * Each error has a unique numeric code, HTTP status, and user-facing message.
 *
 * Code ranges:
 *   1xxx - Authentication & Authorization
 *   2xxx - Trading & Orders
 *   3xxx - Payments & Billing
 *   4xxx - KYC & Identity
 *   5xxx - Prediction Markets
 *   6xxx - RWA (Real World Assets)
 *   7xxx - Social & Community
 *   8xxx - Rewards & Gamification
 *   9xxx - System & Infrastructure
 */

// ---------------------------------------------------------------------------
// Error entry shape
// ---------------------------------------------------------------------------

export interface ErrorEntry {
  /** Unique numeric error code. */
  readonly code: number;
  /** HTTP status code to return in API responses. */
  readonly status: number;
  /** User-facing message (safe to display in UI). */
  readonly message: string;
  /** Whether this error should be retried by the client. */
  readonly retryable: boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  // ==========================================================================
  // 1xxx - Authentication & Authorization
  // ==========================================================================
  AUTH_TOKEN_EXPIRED: {
    code: 1001,
    status: 401,
    message: "Your session has expired. Please log in again.",
    retryable: false,
  },
  AUTH_TOKEN_INVALID: {
    code: 1002,
    status: 401,
    message: "Invalid authentication token.",
    retryable: false,
  },
  AUTH_TOKEN_REVOKED: {
    code: 1003,
    status: 401,
    message: "Token has been revoked.",
    retryable: false,
  },
  AUTH_INSUFFICIENT_ROLE: {
    code: 1004,
    status: 403,
    message: "You don't have permission for this action.",
    retryable: false,
  },
  AUTH_ACCOUNT_LOCKED: {
    code: 1005,
    status: 403,
    message: "Your account has been locked. Please contact support.",
    retryable: false,
  },
  AUTH_ACCOUNT_DISABLED: {
    code: 1006,
    status: 403,
    message: "Your account has been disabled.",
    retryable: false,
  },
  AUTH_MFA_REQUIRED: {
    code: 1007,
    status: 403,
    message: "Multi-factor authentication is required for this action.",
    retryable: false,
  },
  AUTH_MFA_INVALID: {
    code: 1008,
    status: 401,
    message: "Invalid multi-factor authentication code.",
    retryable: false,
  },
  AUTH_IP_BLOCKED: {
    code: 1009,
    status: 403,
    message: "Access denied from your current location.",
    retryable: false,
  },
  AUTH_SESSION_CONFLICT: {
    code: 1010,
    status: 409,
    message: "Another session is already active. Please log out from other devices.",
    retryable: false,
  },
  AUTH_REFRESH_TOKEN_EXPIRED: {
    code: 1011,
    status: 401,
    message: "Your refresh token has expired. Please log in again.",
    retryable: false,
  },
  AUTH_INVALID_CREDENTIALS: {
    code: 1012,
    status: 401,
    message: "Invalid email or password.",
    retryable: false,
  },
  AUTH_EMAIL_NOT_VERIFIED: {
    code: 1013,
    status: 403,
    message: "Please verify your email address before continuing.",
    retryable: false,
  },
  AUTH_RATE_LIMITED: {
    code: 1014,
    status: 429,
    message: "Too many authentication attempts. Please try again later.",
    retryable: true,
  },

  // ==========================================================================
  // 2xxx - Trading & Orders
  // ==========================================================================
  TRADE_INSUFFICIENT_BALANCE: {
    code: 2001,
    status: 400,
    message: "Insufficient balance for this trade.",
    retryable: false,
  },
  TRADE_MARKET_CLOSED: {
    code: 2002,
    status: 400,
    message: "Market is currently closed.",
    retryable: false,
  },
  TRADE_ORDER_NOT_FOUND: {
    code: 2003,
    status: 404,
    message: "Order not found.",
    retryable: false,
  },
  TRADE_INVALID_QUANTITY: {
    code: 2004,
    status: 400,
    message: "Invalid order quantity.",
    retryable: false,
  },
  TRADE_PRICE_MOVED: {
    code: 2005,
    status: 409,
    message: "Price has moved since your order was placed. Please review and retry.",
    retryable: true,
  },
  TRADE_CIRCUIT_BREAKER_OPEN: {
    code: 2006,
    status: 503,
    message: "Trading service is temporarily unavailable. Please try again shortly.",
    retryable: true,
  },
  TRADE_INVALID_SIDE: {
    code: 2007,
    status: 400,
    message: "Invalid order side. Must be 'buy' or 'sell'.",
    retryable: false,
  },
  TRADE_INVALID_ORDER_TYPE: {
    code: 2008,
    status: 400,
    message: "Invalid order type.",
    retryable: false,
  },
  TRADE_DUPLICATE_ORDER: {
    code: 2009,
    status: 409,
    message: "A duplicate order was detected. Please check your open orders.",
    retryable: false,
  },
  TRADE_POSITION_LIMIT_EXCEEDED: {
    code: 2010,
    status: 400,
    message: "This trade would exceed your position limit.",
    retryable: false,
  },
  TRADE_MIN_ORDER_SIZE: {
    code: 2011,
    status: 400,
    message: "Order size is below the minimum allowed.",
    retryable: false,
  },
  TRADE_MAX_ORDER_SIZE: {
    code: 2012,
    status: 400,
    message: "Order size exceeds the maximum allowed.",
    retryable: false,
  },
  TRADE_CANCEL_NOT_ALLOWED: {
    code: 2013,
    status: 400,
    message: "This order cannot be cancelled in its current state.",
    retryable: false,
  },
  TRADE_SETTLEMENT_FAILED: {
    code: 2014,
    status: 500,
    message: "Order settlement failed. Our team has been notified.",
    retryable: true,
  },
  TRADE_INVALID_LIMIT_PRICE: {
    code: 2015,
    status: 400,
    message: "Invalid limit price. Price must be between 0.01 and 0.99.",
    retryable: false,
  },
  TRADE_MARKET_SUSPENDED: {
    code: 2016,
    status: 400,
    message: "This market has been suspended from trading.",
    retryable: false,
  },
  TRADE_KYC_REQUIRED: {
    code: 2017,
    status: 403,
    message: "KYC verification is required before trading.",
    retryable: false,
  },
  TRADE_ORDER_EXPIRED: {
    code: 2018,
    status: 400,
    message: "This order has expired.",
    retryable: false,
  },
  TRADE_SYMBOL_NOT_FOUND: {
    code: 2019,
    status: 404,
    message: "Trading symbol not found.",
    retryable: false,
  },
  TRADE_ORDERBOOK_UNAVAILABLE: {
    code: 2020,
    status: 503,
    message: "Order book data is temporarily unavailable.",
    retryable: true,
  },

  // ==========================================================================
  // 3xxx - Payments & Billing
  // ==========================================================================
  PAYMENT_METHOD_INVALID: {
    code: 3001,
    status: 400,
    message: "Invalid payment method.",
    retryable: false,
  },
  PAYMENT_METHOD_EXPIRED: {
    code: 3002,
    status: 400,
    message: "Your payment method has expired. Please update it.",
    retryable: false,
  },
  PAYMENT_DECLINED: {
    code: 3003,
    status: 402,
    message: "Payment was declined. Please try a different payment method.",
    retryable: false,
  },
  PAYMENT_AMOUNT_TOO_LOW: {
    code: 3004,
    status: 400,
    message: "Deposit amount is below the minimum allowed.",
    retryable: false,
  },
  PAYMENT_AMOUNT_TOO_HIGH: {
    code: 3005,
    status: 400,
    message: "Deposit amount exceeds the maximum allowed.",
    retryable: false,
  },
  PAYMENT_DAILY_LIMIT_EXCEEDED: {
    code: 3006,
    status: 400,
    message: "You've reached your daily deposit limit.",
    retryable: false,
  },
  PAYMENT_PROCESSOR_ERROR: {
    code: 3007,
    status: 502,
    message: "Payment processor is experiencing issues. Please try again.",
    retryable: true,
  },
  PAYMENT_NOT_FOUND: {
    code: 3008,
    status: 404,
    message: "Payment not found.",
    retryable: false,
  },
  PAYMENT_ALREADY_PROCESSED: {
    code: 3009,
    status: 409,
    message: "This payment has already been processed.",
    retryable: false,
  },
  PAYMENT_WITHDRAWAL_INSUFFICIENT_BALANCE: {
    code: 3010,
    status: 400,
    message: "Insufficient balance for this withdrawal.",
    retryable: false,
  },
  PAYMENT_WITHDRAWAL_PENDING: {
    code: 3011,
    status: 409,
    message: "You already have a pending withdrawal. Please wait for it to complete.",
    retryable: false,
  },
  PAYMENT_WITHDRAWAL_LOCKED: {
    code: 3012,
    status: 400,
    message: "Withdrawals are temporarily locked on your account.",
    retryable: false,
  },
  PAYMENT_FRAUD_SUSPECTED: {
    code: 3013,
    status: 403,
    message: "This transaction has been flagged for review.",
    retryable: false,
  },
  PAYMENT_CURRENCY_NOT_SUPPORTED: {
    code: 3014,
    status: 400,
    message: "This currency is not supported.",
    retryable: false,
  },
  PAYMENT_IDEMPOTENCY_CONFLICT: {
    code: 3015,
    status: 409,
    message: "A payment with this idempotency key already exists.",
    retryable: false,
  },
  PAYMENT_ACH_VERIFICATION_REQUIRED: {
    code: 3016,
    status: 400,
    message: "Bank account verification is required before making ACH transfers.",
    retryable: false,
  },
  PAYMENT_SETTLEMENT_DELAYED: {
    code: 3017,
    status: 202,
    message: "Payment settlement is delayed. Funds will be available soon.",
    retryable: true,
  },

  // ==========================================================================
  // 4xxx - KYC & Identity
  // ==========================================================================
  KYC_NOT_STARTED: {
    code: 4001,
    status: 400,
    message: "KYC verification has not been started.",
    retryable: false,
  },
  KYC_ALREADY_VERIFIED: {
    code: 4002,
    status: 409,
    message: "Your identity has already been verified.",
    retryable: false,
  },
  KYC_DOCUMENT_INVALID: {
    code: 4003,
    status: 400,
    message: "The uploaded document could not be verified. Please try again with a clearer image.",
    retryable: true,
  },
  KYC_DOCUMENT_EXPIRED: {
    code: 4004,
    status: 400,
    message: "The uploaded document has expired. Please use a valid document.",
    retryable: false,
  },
  KYC_SELFIE_MISMATCH: {
    code: 4005,
    status: 400,
    message: "Selfie does not match the document photo. Please try again.",
    retryable: true,
  },
  KYC_PERSONA_ERROR: {
    code: 4006,
    status: 502,
    message: "Identity verification service is temporarily unavailable.",
    retryable: true,
  },
  KYC_CHECKR_ERROR: {
    code: 4007,
    status: 502,
    message: "Background check service is temporarily unavailable.",
    retryable: true,
  },
  KYC_BACKGROUND_FAILED: {
    code: 4008,
    status: 400,
    message: "Background check did not clear. Please contact support for details.",
    retryable: false,
  },
  KYC_SUSPENDED: {
    code: 4009,
    status: 403,
    message: "Your account verification has been suspended. Please contact support.",
    retryable: false,
  },
  KYC_REJECTED: {
    code: 4010,
    status: 403,
    message: "Your identity verification was rejected.",
    retryable: false,
  },
  KYC_EMAIL_TOKEN_INVALID: {
    code: 4011,
    status: 400,
    message: "Invalid or expired email verification token.",
    retryable: false,
  },
  KYC_EMAIL_TOKEN_EXPIRED: {
    code: 4012,
    status: 400,
    message: "Email verification token has expired. Please request a new one.",
    retryable: false,
  },
  KYC_COUNTRY_NOT_SUPPORTED: {
    code: 4013,
    status: 400,
    message: "Identity verification is not available in your country.",
    retryable: false,
  },
  KYC_UNDER_AGE: {
    code: 4014,
    status: 400,
    message: "You must be at least 18 years old to use this platform.",
    retryable: false,
  },
  KYC_SANCTIONS_MATCH: {
    code: 4015,
    status: 403,
    message: "Account verification could not be completed. Please contact support.",
    retryable: false,
  },
  KYC_DUPLICATE_IDENTITY: {
    code: 4016,
    status: 409,
    message: "This identity document is already associated with another account.",
    retryable: false,
  },
  KYC_MAX_ATTEMPTS_EXCEEDED: {
    code: 4017,
    status: 400,
    message: "Maximum verification attempts exceeded. Please contact support.",
    retryable: false,
  },

  // ==========================================================================
  // 5xxx - Prediction Markets
  // ==========================================================================
  PREDICTION_NOT_FOUND: {
    code: 5001,
    status: 404,
    message: "Prediction market not found.",
    retryable: false,
  },
  PREDICTION_NOT_TRADING: {
    code: 5002,
    status: 400,
    message: "This market is not currently open for trading.",
    retryable: false,
  },
  PREDICTION_ALREADY_RESOLVED: {
    code: 5003,
    status: 409,
    message: "This market has already been resolved.",
    retryable: false,
  },
  PREDICTION_INVALID_OUTCOME: {
    code: 5004,
    status: 400,
    message: "Invalid outcome selection.",
    retryable: false,
  },
  PREDICTION_RESOLUTION_DISPUTED: {
    code: 5005,
    status: 409,
    message: "This market's resolution is currently under dispute.",
    retryable: false,
  },
  PREDICTION_VOIDED: {
    code: 5006,
    status: 400,
    message: "This prediction market has been voided.",
    retryable: false,
  },
  PREDICTION_CREATION_FAILED: {
    code: 5007,
    status: 400,
    message: "Failed to create prediction market. Please check your inputs.",
    retryable: false,
  },
  PREDICTION_INVALID_METADATA: {
    code: 5008,
    status: 400,
    message: "Invalid market metadata. Title and description are required.",
    retryable: false,
  },
  PREDICTION_INSUFFICIENT_OUTCOMES: {
    code: 5009,
    status: 400,
    message: "A prediction market must have at least 2 outcomes.",
    retryable: false,
  },
  PREDICTION_DISPUTE_WINDOW_CLOSED: {
    code: 5010,
    status: 400,
    message: "The dispute window for this market has closed.",
    retryable: false,
  },
  PREDICTION_ORACLE_ERROR: {
    code: 5011,
    status: 502,
    message: "Resolution oracle is temporarily unavailable.",
    retryable: true,
  },
  PREDICTION_SETTLEMENT_PENDING: {
    code: 5012,
    status: 202,
    message: "Market settlement is in progress. Payouts will be processed shortly.",
    retryable: true,
  },
  PREDICTION_POSITION_NOT_FOUND: {
    code: 5013,
    status: 404,
    message: "Position not found in this market.",
    retryable: false,
  },
  PREDICTION_LIQUIDITY_INSUFFICIENT: {
    code: 5014,
    status: 400,
    message: "Insufficient liquidity for this trade size.",
    retryable: true,
  },

  // ==========================================================================
  // 6xxx - RWA (Real World Assets)
  // ==========================================================================
  RWA_ASSET_NOT_FOUND: {
    code: 6001,
    status: 404,
    message: "Asset not found.",
    retryable: false,
  },
  RWA_ASSET_NOT_TRADEABLE: {
    code: 6002,
    status: 400,
    message: "This asset is not currently available for trading.",
    retryable: false,
  },
  RWA_FRACTIONAL_LIMIT: {
    code: 6003,
    status: 400,
    message: "Fractional share amount is outside allowed range.",
    retryable: false,
  },
  RWA_CUSTODY_ERROR: {
    code: 6004,
    status: 502,
    message: "Asset custody service is temporarily unavailable.",
    retryable: true,
  },
  RWA_TRANSFER_FAILED: {
    code: 6005,
    status: 500,
    message: "Asset transfer failed. Our team has been notified.",
    retryable: true,
  },
  RWA_COMPLIANCE_BLOCK: {
    code: 6006,
    status: 403,
    message: "This asset is not available in your jurisdiction.",
    retryable: false,
  },
  RWA_VALUATION_STALE: {
    code: 6007,
    status: 409,
    message: "Asset valuation data is stale. Please refresh and retry.",
    retryable: true,
  },
  RWA_TOKENIZATION_PENDING: {
    code: 6008,
    status: 202,
    message: "Asset tokenization is in progress.",
    retryable: true,
  },
  RWA_REDEMPTION_LOCKED: {
    code: 6009,
    status: 400,
    message: "Asset redemption is currently locked.",
    retryable: false,
  },
  RWA_ACCREDITATION_REQUIRED: {
    code: 6010,
    status: 403,
    message: "Accredited investor status is required for this asset.",
    retryable: false,
  },

  // ==========================================================================
  // 7xxx - Social & Community
  // ==========================================================================
  SOCIAL_USER_NOT_FOUND: {
    code: 7001,
    status: 404,
    message: "User not found.",
    retryable: false,
  },
  SOCIAL_ALREADY_FOLLOWING: {
    code: 7002,
    status: 409,
    message: "You are already following this user.",
    retryable: false,
  },
  SOCIAL_NOT_FOLLOWING: {
    code: 7003,
    status: 400,
    message: "You are not following this user.",
    retryable: false,
  },
  SOCIAL_SELF_FOLLOW: {
    code: 7004,
    status: 400,
    message: "You cannot follow yourself.",
    retryable: false,
  },
  SOCIAL_BLOCKED_USER: {
    code: 7005,
    status: 403,
    message: "This user has blocked you.",
    retryable: false,
  },
  SOCIAL_POST_NOT_FOUND: {
    code: 7006,
    status: 404,
    message: "Post not found.",
    retryable: false,
  },
  SOCIAL_COMMENT_NOT_FOUND: {
    code: 7007,
    status: 404,
    message: "Comment not found.",
    retryable: false,
  },
  SOCIAL_CONTENT_VIOLATION: {
    code: 7008,
    status: 400,
    message: "Your content violates community guidelines.",
    retryable: false,
  },
  SOCIAL_RATE_LIMITED: {
    code: 7009,
    status: 429,
    message: "You're posting too frequently. Please slow down.",
    retryable: true,
  },
  SOCIAL_COPY_TRADE_SELF: {
    code: 7010,
    status: 400,
    message: "You cannot copy-trade yourself.",
    retryable: false,
  },
  SOCIAL_COPY_TRADE_NOT_ALLOWED: {
    code: 7011,
    status: 403,
    message: "This user has disabled copy-trading.",
    retryable: false,
  },
  SOCIAL_SQUAD_FULL: {
    code: 7012,
    status: 400,
    message: "This squad is full.",
    retryable: false,
  },
  SOCIAL_SQUAD_NOT_FOUND: {
    code: 7013,
    status: 404,
    message: "Squad not found.",
    retryable: false,
  },
  SOCIAL_ALREADY_IN_SQUAD: {
    code: 7014,
    status: 409,
    message: "You are already a member of this squad.",
    retryable: false,
  },
  SOCIAL_ROOM_NOT_FOUND: {
    code: 7015,
    status: 404,
    message: "Trading room not found.",
    retryable: false,
  },
  SOCIAL_ROOM_CAPACITY_REACHED: {
    code: 7016,
    status: 400,
    message: "This trading room is at capacity.",
    retryable: true,
  },

  // ==========================================================================
  // 8xxx - Rewards & Gamification
  // ==========================================================================
  REWARD_NOT_FOUND: {
    code: 8001,
    status: 404,
    message: "Reward not found.",
    retryable: false,
  },
  REWARD_ALREADY_CLAIMED: {
    code: 8002,
    status: 409,
    message: "This reward has already been claimed.",
    retryable: false,
  },
  REWARD_EXPIRED: {
    code: 8003,
    status: 400,
    message: "This reward has expired.",
    retryable: false,
  },
  REWARD_INELIGIBLE: {
    code: 8004,
    status: 400,
    message: "You are not eligible for this reward.",
    retryable: false,
  },
  REWARD_STREAK_BROKEN: {
    code: 8005,
    status: 400,
    message: "Your streak has been broken.",
    retryable: false,
  },
  REWARD_CHALLENGE_NOT_FOUND: {
    code: 8006,
    status: 404,
    message: "Challenge not found.",
    retryable: false,
  },
  REWARD_CHALLENGE_COMPLETED: {
    code: 8007,
    status: 409,
    message: "This challenge has already been completed.",
    retryable: false,
  },
  REWARD_CHALLENGE_EXPIRED: {
    code: 8008,
    status: 400,
    message: "This challenge has expired.",
    retryable: false,
  },
  REWARD_REFERRAL_SELF: {
    code: 8009,
    status: 400,
    message: "You cannot refer yourself.",
    retryable: false,
  },
  REWARD_REFERRAL_ALREADY_USED: {
    code: 8010,
    status: 409,
    message: "This referral code has already been used by this account.",
    retryable: false,
  },
  REWARD_PROMO_CODE_INVALID: {
    code: 8011,
    status: 400,
    message: "Invalid promotional code.",
    retryable: false,
  },
  REWARD_PROMO_CODE_EXPIRED: {
    code: 8012,
    status: 400,
    message: "This promotional code has expired.",
    retryable: false,
  },
  REWARD_ACHIEVEMENT_LOCKED: {
    code: 8013,
    status: 400,
    message: "This achievement is locked. Complete the prerequisites first.",
    retryable: false,
  },
  REWARD_LEADERBOARD_UNAVAILABLE: {
    code: 8014,
    status: 503,
    message: "Leaderboard data is temporarily unavailable.",
    retryable: true,
  },

  // ==========================================================================
  // 9xxx - System & Infrastructure
  // ==========================================================================
  SYSTEM_INTERNAL_ERROR: {
    code: 9001,
    status: 500,
    message: "An internal error occurred. Our team has been notified.",
    retryable: true,
  },
  SYSTEM_SERVICE_UNAVAILABLE: {
    code: 9002,
    status: 503,
    message: "Service is temporarily unavailable. Please try again shortly.",
    retryable: true,
  },
  SYSTEM_MAINTENANCE_MODE: {
    code: 9003,
    status: 503,
    message: "The platform is undergoing scheduled maintenance. Please check back soon.",
    retryable: true,
  },
  SYSTEM_RATE_LIMIT_EXCEEDED: {
    code: 9004,
    status: 429,
    message: "Rate limit exceeded. Please slow down your requests.",
    retryable: true,
  },
  SYSTEM_REQUEST_TOO_LARGE: {
    code: 9005,
    status: 413,
    message: "Request payload is too large.",
    retryable: false,
  },
  SYSTEM_INVALID_REQUEST: {
    code: 9006,
    status: 400,
    message: "Invalid request format.",
    retryable: false,
  },
  SYSTEM_RESOURCE_NOT_FOUND: {
    code: 9007,
    status: 404,
    message: "The requested resource was not found.",
    retryable: false,
  },
  SYSTEM_CONFLICT: {
    code: 9008,
    status: 409,
    message: "A conflict occurred with the current state of the resource.",
    retryable: false,
  },
  SYSTEM_TIMEOUT: {
    code: 9009,
    status: 504,
    message: "The request timed out. Please try again.",
    retryable: true,
  },
  SYSTEM_DATABASE_ERROR: {
    code: 9010,
    status: 500,
    message: "A database error occurred. Our team has been notified.",
    retryable: true,
  },
  SYSTEM_CACHE_ERROR: {
    code: 9011,
    status: 500,
    message: "A caching error occurred. Please try again.",
    retryable: true,
  },
  SYSTEM_QUEUE_FULL: {
    code: 9012,
    status: 503,
    message: "The processing queue is full. Please try again shortly.",
    retryable: true,
  },
  SYSTEM_FEATURE_DISABLED: {
    code: 9013,
    status: 403,
    message: "This feature is currently disabled.",
    retryable: false,
  },
  SYSTEM_DEPRECATED_ENDPOINT: {
    code: 9014,
    status: 410,
    message: "This API endpoint has been deprecated. Please upgrade your client.",
    retryable: false,
  },
  SYSTEM_WEBSOCKET_ERROR: {
    code: 9015,
    status: 500,
    message: "WebSocket connection error.",
    retryable: true,
  },
  SYSTEM_UPSTREAM_ERROR: {
    code: 9016,
    status: 502,
    message: "An upstream service error occurred. Please try again.",
    retryable: true,
  },
  SYSTEM_VALIDATION_ERROR: {
    code: 9017,
    status: 422,
    message: "Request validation failed. Please check your inputs.",
    retryable: false,
  },
  SYSTEM_CONCURRENCY_CONFLICT: {
    code: 9018,
    status: 409,
    message: "A concurrent modification was detected. Please refresh and retry.",
    retryable: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

/** Union of all error code keys. */
export type ErrorCodeKey = keyof typeof ErrorCodes;

/** Lookup an error entry by key at the type level. */
export type ErrorCodeEntry<K extends ErrorCodeKey> = (typeof ErrorCodes)[K];

/** Union of all numeric error codes. */
export type NumericErrorCode = (typeof ErrorCodes)[ErrorCodeKey]["code"];

/** Union of all HTTP status codes used in the catalog. */
export type ErrorHttpStatus = (typeof ErrorCodes)[ErrorCodeKey]["status"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lookup an error entry by its numeric code. */
export function getErrorByCode(code: number): (ErrorEntry & { key: ErrorCodeKey }) | undefined {
  for (const [key, entry] of Object.entries(ErrorCodes)) {
    if (entry.code === code) {
      return { ...entry, key: key as ErrorCodeKey };
    }
  }
  return undefined;
}

/** Get all error codes in a specific domain (by code range). */
export function getErrorsByDomain(
  domain: "auth" | "trade" | "payment" | "kyc" | "prediction" | "rwa" | "social" | "reward" | "system",
): Array<ErrorEntry & { key: ErrorCodeKey }> {
  const ranges: Record<string, [number, number]> = {
    auth: [1000, 1999],
    trade: [2000, 2999],
    payment: [3000, 3999],
    kyc: [4000, 4999],
    prediction: [5000, 5999],
    rwa: [6000, 6999],
    social: [7000, 7999],
    reward: [8000, 8999],
    system: [9000, 9999],
  };

  const [min, max] = ranges[domain];
  const results: Array<ErrorEntry & { key: ErrorCodeKey }> = [];

  for (const [key, entry] of Object.entries(ErrorCodes)) {
    if (entry.code >= min && entry.code <= max) {
      results.push({ ...entry, key: key as ErrorCodeKey });
    }
  }

  return results;
}

/** Check if an error code key is retryable. */
export function isRetryable(errorCode: ErrorCodeKey): boolean {
  return ErrorCodes[errorCode].retryable;
}

/** Get the HTTP status for an error code key. */
export function getHttpStatus(errorCode: ErrorCodeKey): number {
  return ErrorCodes[errorCode].status;
}
