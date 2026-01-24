/**
 * Temporal Workflow Configuration
 * Centralized configuration for all workflow constants, timeouts, and policies
 */

// ============================================================================
// Timeout Configuration
// ============================================================================

export const TIMEOUTS = {
  // KYC Workflows
  KYC: {
    EMAIL_VERIFICATION: "24 hours",
    KYC_SUBMISSION: "7 days",
    AGREEMENTS_SIGNING: "7 days",
    PERSONA_POLLING_INTERVAL: "5 seconds",
    PERSONA_MAX_ATTEMPTS: 60,
    CHECKR_POLLING_INTERVAL: "5 seconds",
    CHECKR_MAX_ATTEMPTS: 60,
    PERIODIC_REKYC_INTERVAL: "24 hours",
  },

  // Trading Workflows
  TRADING: {
    ORDER_EXECUTION_TIMEOUT: "24 hours",
    ORDER_POLL_INTERVAL: "1 second",
    ORDER_MAX_POLL_ATTEMPTS: 300,
    DEPOSIT_MONITORING_INTERVAL: "1 hour",
    DEPOSIT_MAX_DAYS: 5,
    WITHDRAWAL_COOLING_PERIOD: "24 hours",
    SETTLEMENT_TIMEOUT: "1 hour",
  },

  // RWA Workflows
  RWA: {
    LISTING_TIMEOUT: "30 days",
    PURCHASE_TIMEOUT: "1 hour",
    PRICE_UPDATE_INTERVAL: "6 hours",
    SHARE_RESERVATION_TIMEOUT: "15 minutes",
  },

  // Email Workflows
  EMAIL: {
    SYNC_INTERVAL: "5 minutes",
    TRIAGE_TIMEOUT: "2 minutes",
    SMART_REPLY_TIMEOUT: "30 seconds",
    BATCH_SIZE: 50,
  },

  // Messaging Workflows
  MESSAGING: {
    ROOM_CREATION_TIMEOUT: "5 minutes",
    MESSAGE_PROCESSING_TIMEOUT: "1 minute",
  },

  // Activity Timeouts
  ACTIVITY: {
    SHORT: "30 seconds",
    MEDIUM: "1 minute",
    LONG: "5 minutes",
    EXTENDED: "10 minutes",
  },
} as const;

// ============================================================================
// Threshold Configuration
// ============================================================================

export const THRESHOLDS = {
  // Financial Thresholds
  WITHDRAWAL: {
    MINIMUM: 10,
    LARGE_AMOUNT: 10000, // Requires 2FA
    MAXIMUM: 250000,
  },

  DEPOSIT: {
    MINIMUM: 10,
    MAXIMUM: 250000,
  },

  // RWA Thresholds
  RWA: {
    ACCREDITED_THRESHOLD: 10000, // Requires accredited investor status
    PRICE_DEVIATION_WARNING: 0.5, // 50% deviation from market price
  },

  // Risk Thresholds
  RISK: {
    CHAINALYSIS_LOW: 0.4,
    CHAINALYSIS_MEDIUM: 0.6,
    CHAINALYSIS_HIGH: 0.8,
    FRAUD_SCORE_THRESHOLD: 0.7,
  },

  // Price Movement Alerts
  PRICE: {
    SIGNIFICANT_CHANGE_PERCENT: 0.1, // 10%
  },
} as const;

// ============================================================================
// Retry Policy Configuration
// ============================================================================

export const RETRY_POLICIES = {
  // Default retry policy
  DEFAULT: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },

  // Critical operations (payments, trades)
  CRITICAL: {
    initialInterval: "500 milliseconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "1 minute",
    nonRetryableErrorTypes: ["ValidationError", "AuthorizationError"],
  },

  // External API calls
  EXTERNAL_API: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 4,
    maximumInterval: "30 seconds",
  },

  // Idempotent operations (can be retried safely)
  IDEMPOTENT: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 10,
    maximumInterval: "2 minutes",
  },

  // Non-retryable operations
  NO_RETRY: {
    maximumAttempts: 1,
  },
} as const;

// ============================================================================
// Rewards Configuration
// ============================================================================

export const REWARDS = {
  // Base points per action
  BASE_POINTS: {
    daily_login: 10,
    trade_executed: 5,
    deposit: 50,
    referral_signup: 100,
    referral_trade: 25,
    rwa_purchase: 15,
    email_connected: 25,
    profile_completed: 50,
    kyc_upgraded: 100,
    streak_bonus: 20,
  },

  // Tier multipliers
  TIER_MULTIPLIERS: {
    bronze: 1.0,
    silver: 1.25,
    gold: 1.5,
    platinum: 2.0,
    diamond: 2.5,
  },

  // Streak milestones (days)
  STREAK_MILESTONES: [7, 14, 30, 60, 90],

  // Tier thresholds (total points)
  TIER_THRESHOLDS: {
    silver: 1000,
    gold: 5000,
    platinum: 25000,
    diamond: 100000,
  },

  // Streak multipliers
  STREAK_MULTIPLIERS: {
    7: 1.25,
    14: 1.5,
    30: 2.0,
  },
} as const;

// ============================================================================
// KYC Configuration
// ============================================================================

export const KYC = {
  // Reverification intervals (days)
  REVERIFICATION_INTERVALS: {
    basic: 365,
    enhanced: 180,
    accredited: 90,
  },

  // Document expiration warning (days)
  DOCUMENT_EXPIRATION_WARNING: 30,

  // KYC tiers
  TIERS: ["basic", "enhanced", "accredited"] as const,

  // Required KYC for asset types
  ASSET_TYPE_REQUIREMENTS: {
    prediction: ["basic", "enhanced", "accredited"],
    rwa: ["enhanced", "accredited"],
    crypto: ["basic", "enhanced", "accredited"],
  },
} as const;

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

export const CIRCUIT_BREAKER = {
  // Number of failures before opening circuit
  FAILURE_THRESHOLD: 5,

  // Time to wait before attempting reset (ms)
  RESET_TIMEOUT: 30000,

  // Half-open state request limit
  HALF_OPEN_REQUESTS: 3,
} as const;

// ============================================================================
// Task Queue Configuration
// ============================================================================

export const TASK_QUEUES = {
  MAIN: "pull-main",
  KYC: "pull-kyc",
  TRADING: "pull-trading",
  RWA: "pull-rwa",
  REWARDS: "pull-rewards",
  EMAIL: "pull-email",
  MESSAGING: "pull-messaging",
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type KYCTier = (typeof KYC.TIERS)[number];
export type TaskQueue = (typeof TASK_QUEUES)[keyof typeof TASK_QUEUES];
export type RewardAction = keyof typeof REWARDS.BASE_POINTS;
export type TierName = keyof typeof REWARDS.TIER_MULTIPLIERS;
