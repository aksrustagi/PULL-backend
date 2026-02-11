/**
 * PostHog Analytics Types
 *
 * Type definitions for the PostHog product analytics integration.
 * Covers user identification, event tracking, feature flags,
 * and group analytics for the PULL trading platform.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * PostHog client configuration
 */
export interface PostHogConfig {
  /** PostHog project API key (env: POSTHOG_API_KEY) */
  apiKey: string;
  /** PostHog instance host (env: POSTHOG_HOST, default: https://app.posthog.com) */
  host: string;
  /** Flush interval in milliseconds (default: 10000) */
  flushInterval?: number;
  /** Maximum events to buffer before flushing (default: 20) */
  flushAt?: number;
  /** Request timeout in milliseconds (default: 10000) */
  requestTimeout?: number;
  /** Enable/disable the client (default: true) */
  enabled?: boolean;
  /** Feature flag polling interval in milliseconds (default: 30000) */
  featureFlagPollInterval?: number;
  /** Whether to send feature flag events on evaluation (default: true) */
  sendFeatureFlagEvents?: boolean;
  /** Personally identifiable information handling mode */
  personalApiKey?: string;
}

// ---------------------------------------------------------------------------
// User Identification
// ---------------------------------------------------------------------------

/**
 * Standard user properties for identification
 */
export interface PostHogUserProperties {
  /** User email address */
  email?: string;
  /** Display name */
  name?: string;
  /** KYC verification tier */
  kycTier?: 'none' | 'basic' | 'standard' | 'enhanced';
  /** Account age in days */
  accountAge?: number;
  /** ISO timestamp of account creation */
  createdAt?: string;
  /** How the user was acquired */
  referralSource?: string;
  /** Referral code used */
  referralCode?: string;
  /** Current subscription tier */
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  /** Whether user has completed onboarding */
  onboardingComplete?: boolean;
  /** Total number of trades placed */
  totalTrades?: number;
  /** Total portfolio value in USD */
  portfolioValue?: number;
  /** User's preferred market types */
  preferredMarkets?: string[];
  /** Whether user is a beta tester */
  isBetaUser?: boolean;
  /** Whether user is internal */
  isInternalUser?: boolean;
  /** User's timezone */
  timezone?: string;
  /** Platform (web, ios, android) */
  platform?: string;
  /** Additional custom properties */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Standard event properties included with every event
 */
export interface PostHogBaseEventProperties {
  /** ISO timestamp override (defaults to capture time) */
  timestamp?: string;
  /** Distinct ID override (usually set at call level) */
  distinct_id?: string;
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * Trade event data for captureTradeEvent
 */
export interface PostHogTradeEvent {
  /** Unique trade/order identifier */
  tradeId: string;
  /** Market type */
  marketType: 'predictions' | 'crypto' | 'rwa' | 'sports' | 'fantasy';
  /** Market/event identifier */
  marketId: string;
  /** Market display name */
  marketName?: string;
  /** Buy or sell */
  side: 'buy' | 'sell';
  /** Order type */
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  /** Number of shares/contracts */
  quantity: number;
  /** Price per share/contract in USD */
  price: number;
  /** Total order value in USD */
  totalValue: number;
  /** Execution status */
  status: 'placed' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
  /** Fee amount in USD */
  feeAmount?: number;
  /** Execution latency in milliseconds */
  executionLatencyMs?: number;
  /** Whether this was a copy trade */
  isCopyTrade?: boolean;
  /** Whether this was part of a parlay */
  isParlay?: boolean;
  /** Source of the trade (app, api, copilot) */
  source?: string;
}

/**
 * Prediction market event data for capturePredictionEvent
 */
export interface PostHogPredictionEvent {
  /** Prediction identifier */
  predictionId: string;
  /** Market identifier */
  marketId: string;
  /** Market title/question */
  marketTitle: string;
  /** Market category */
  category: string;
  /** Outcome selected (e.g., "Yes", "No", team name) */
  outcomeSelected: string;
  /** Probability at time of prediction */
  probabilityAtPrediction: number;
  /** Stake amount in USD */
  stakeAmount: number;
  /** Potential payout in USD */
  potentialPayout: number;
  /** Time until market resolution in hours */
  hoursToResolution?: number;
  /** Whether AI copilot was consulted */
  aiCopilotUsed?: boolean;
  /** AI confidence score if copilot was used */
  aiConfidenceScore?: number;
  /** Event source (e.g., Kalshi, internal) */
  source?: string;
}

/**
 * Onboarding step event data for captureOnboardingStep
 */
export interface PostHogOnboardingStep {
  /** Step identifier */
  step: string;
  /** Numeric step position in the funnel */
  stepNumber: number;
  /** Total steps in the funnel */
  totalSteps: number;
  /** Whether the step was completed successfully */
  success: boolean;
  /** Time spent on this step in seconds */
  timeSpentSeconds?: number;
  /** Error message if step failed */
  errorMessage?: string;
  /** Error code if step failed */
  errorCode?: string;
  /** Onboarding variant (for A/B testing) */
  variant?: string;
}

/**
 * Revenue event data for captureRevenueEvent
 */
export interface PostHogRevenueEvent {
  /** Revenue amount in USD */
  amount: number;
  /** Revenue type */
  type: 'trading_fee' | 'subscription' | 'premium_feature' | 'withdrawal_fee' | 'deposit_fee' | 'spread' | 'other';
  /** Currency (default: USD) */
  currency?: string;
  /** Associated trade or transaction ID */
  transactionId?: string;
  /** Associated market type */
  marketType?: string;
  /** Whether this is recurring revenue */
  isRecurring?: boolean;
  /** Billing period if recurring */
  billingPeriod?: 'monthly' | 'annual';
}

// ---------------------------------------------------------------------------
// Onboarding Step Constants
// ---------------------------------------------------------------------------

/**
 * Standard onboarding step identifiers
 */
export const ONBOARDING_STEPS = {
  ACCOUNT_CREATED: 'account_created',
  EMAIL_VERIFIED: 'email_verified',
  PROFILE_COMPLETED: 'profile_completed',
  KYC_STARTED: 'kyc_started',
  KYC_SUBMITTED: 'kyc_submitted',
  KYC_APPROVED: 'kyc_approved',
  BANK_LINKED: 'bank_linked',
  FIRST_DEPOSIT: 'first_deposit',
  FIRST_TRADE: 'first_trade',
  ONBOARDING_COMPLETE: 'onboarding_complete',
} as const;

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

// ---------------------------------------------------------------------------
// Event Name Constants
// ---------------------------------------------------------------------------

/**
 * Canonical event names used across the platform.
 * Use these constants instead of raw strings to ensure consistency.
 */
export const POSTHOG_EVENTS = {
  // Authentication
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_LOGGED_OUT: 'user_logged_out',
  USER_PASSWORD_RESET: 'user_password_reset',

  // Onboarding
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_FAILED: 'onboarding_step_failed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_ABANDONED: 'onboarding_abandoned',

  // KYC
  KYC_STARTED: 'kyc_started',
  KYC_SUBMITTED: 'kyc_submitted',
  KYC_APPROVED: 'kyc_approved',
  KYC_REJECTED: 'kyc_rejected',

  // Trading
  TRADE_PLACED: 'trade_placed',
  TRADE_FILLED: 'trade_filled',
  TRADE_CANCELLED: 'trade_cancelled',
  TRADE_REJECTED: 'trade_rejected',

  // Predictions
  PREDICTION_PLACED: 'prediction_placed',
  PREDICTION_RESOLVED: 'prediction_resolved',
  PREDICTION_WON: 'prediction_won',
  PREDICTION_LOST: 'prediction_lost',

  // Financial
  DEPOSIT_INITIATED: 'deposit_initiated',
  DEPOSIT_COMPLETED: 'deposit_completed',
  WITHDRAWAL_INITIATED: 'withdrawal_initiated',
  WITHDRAWAL_COMPLETED: 'withdrawal_completed',
  REVENUE_EARNED: 'revenue_earned',

  // Social
  SQUAD_CREATED: 'squad_created',
  SQUAD_JOINED: 'squad_joined',
  LEAGUE_JOINED: 'league_joined',
  COPY_TRADE_STARTED: 'copy_trade_started',
  REFERRAL_SENT: 'referral_sent',
  REFERRAL_COMPLETED: 'referral_completed',

  // Engagement
  PAGE_VIEW: 'page_view',
  API_CALL: 'api_call',
  FEATURE_USED: 'feature_used',
  SEARCH_PERFORMED: 'search_performed',
  NOTIFICATION_RECEIVED: 'notification_received',
  NOTIFICATION_CLICKED: 'notification_clicked',

  // AI Features
  AI_COPILOT_QUERIED: 'ai_copilot_queried',
  AI_RECOMMENDATION_VIEWED: 'ai_recommendation_viewed',
  AI_RECOMMENDATION_FOLLOWED: 'ai_recommendation_followed',

  // Errors
  ERROR_OCCURRED: 'error_occurred',
  RATE_LIMIT_HIT: 'rate_limit_hit',
} as const;

export type PostHogEventName = (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS] | string;

// ---------------------------------------------------------------------------
// Group Analytics
// ---------------------------------------------------------------------------

/**
 * Group types for group analytics
 */
export type PostHogGroupType = 'squad' | 'league' | 'organization' | 'referral_chain';

/**
 * Group properties for group identification
 */
export interface PostHogGroupProperties {
  /** Group display name */
  name?: string;
  /** Group creation date */
  createdAt?: string;
  /** Number of members */
  memberCount?: number;
  /** Total group trading volume */
  totalVolume?: number;
  /** Group tier/level */
  tier?: string;
  /** Whether the group is active */
  isActive?: boolean;
  /** Additional custom properties */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

/**
 * Feature flag evaluation result
 */
export interface PostHogFeatureFlagResult {
  /** Flag key */
  key: string;
  /** Flag value (boolean for on/off, string for multivariate) */
  value: boolean | string;
  /** Payload attached to the flag variant */
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Middleware Types
// ---------------------------------------------------------------------------

/**
 * Options for the PostHog analytics middleware
 */
export interface PostHogMiddlewareOptions {
  /** Paths to exclude from automatic tracking (default: ['/health', '/ready', '/metrics']) */
  excludePaths?: string[];
  /** Whether to capture API call events (default: true) */
  captureApiCalls?: boolean;
  /** Whether to track response times (default: true) */
  trackResponseTimes?: boolean;
  /** Whether to track error rates (default: true) */
  trackErrors?: boolean;
  /** Whether to track user sessions (default: true) */
  trackSessions?: boolean;
  /** Function to extract user ID from request context */
  getUserId?: (c: import('hono').Context) => string | undefined;
  /** Function to extract session ID from request context */
  getSessionId?: (c: import('hono').Context) => string | undefined;
  /** Path normalizers for reducing cardinality */
  pathNormalizers?: Array<{
    pattern: RegExp;
    replacement: string;
  }>;
  /** Custom properties to include with every event */
  defaultProperties?: Record<string, unknown>;
}

/**
 * PostHog context stored in Hono context variables
 */
export interface PostHogMiddlewareContext {
  /** Capture a custom event for the current user */
  capture: (event: string, properties?: Record<string, unknown>) => void;
  /** Current user ID (if available) */
  userId?: string;
  /** Current session ID (if available) */
  sessionId?: string;
}

/**
 * Hono context variable augmentation
 */
export interface PostHogContextVariables {
  posthog: PostHogMiddlewareContext;
}
