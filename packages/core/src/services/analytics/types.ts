/**
 * Analytics Types
 * Core type definitions for analytics tracking, events, and metrics
 */

// ============================================================================
// Event Types
// ============================================================================

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  anonymousId?: string;
  properties: Record<string, any>;
  timestamp: number;
  context: EventContext;
}

export interface EventContext {
  page?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
  locale?: string;
  timezone?: string;
  campaign?: CampaignContext;
  device?: DeviceContext;
  session?: SessionContext;
}

export interface CampaignContext {
  source?: string;
  medium?: string;
  name?: string;
  term?: string;
  content?: string;
}

export interface DeviceContext {
  type?: 'mobile' | 'tablet' | 'desktop';
  os?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface SessionContext {
  id: string;
  startedAt: number;
  pageViews: number;
}

// ============================================================================
// User Lifecycle Events
// ============================================================================

export interface UserSignedUpProperties {
  method: 'email' | 'wallet' | 'google' | 'apple';
  referralCode?: string;
  referrerId?: string;
  source?: string;
}

export interface UserLoggedInProperties {
  method: 'email' | 'wallet' | 'google' | 'apple' | 'session';
}

export interface UserKycStartedProperties {
  tier: 'basic' | 'intermediate' | 'advanced';
}

export interface UserKycCompletedProperties {
  tier: 'basic' | 'intermediate' | 'advanced';
  durationSeconds: number;
  provider: string;
}

export interface UserFirstDepositProperties {
  amount: number;
  currency: string;
  method: 'bank' | 'card' | 'crypto' | 'wire';
}

export interface UserFirstTradeProperties {
  marketType: 'crypto' | 'prediction' | 'rwa';
  amount: number;
  ticker: string;
}

// ============================================================================
// Trading Events
// ============================================================================

export interface TradeOrderPlacedProperties {
  ticker: string;
  side: 'buy' | 'sell';
  amount: number;
  type: 'market' | 'limit' | 'stop';
  marketType: 'crypto' | 'prediction' | 'rwa';
  price?: number;
}

export interface TradeOrderFilledProperties {
  ticker: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  pnl?: number;
  fees: number;
  marketType: 'crypto' | 'prediction' | 'rwa';
  fillTime?: number;
}

export interface TradePositionClosedProperties {
  ticker: string;
  pnl: number;
  pnlPercent: number;
  holdingPeriodSeconds: number;
  marketType: 'crypto' | 'prediction' | 'rwa';
}

// ============================================================================
// Social Events
// ============================================================================

export interface SocialFollowedProperties {
  traderId: string;
  traderUsername?: string;
  traderTier?: string;
}

export interface SocialCopyStartedProperties {
  traderId: string;
  allocation: number;
  allocationPercent: number;
  maxPositions?: number;
}

export interface SocialCopyTradeExecutedProperties {
  traderId: string;
  ticker: string;
  amount: number;
  side: 'buy' | 'sell';
  delay?: number;
}

// ============================================================================
// Engagement Events
// ============================================================================

export interface EngagementQuestCompletedProperties {
  questId: string;
  questType: 'daily' | 'weekly' | 'milestone' | 'special';
  questName: string;
  pointsEarned: number;
}

export interface EngagementAchievementUnlockedProperties {
  achievementId: string;
  achievementName: string;
  category: string;
  pointsEarned: number;
}

export interface EngagementStreakMaintainedProperties {
  streakType: 'login' | 'trading' | 'deposit';
  count: number;
  bonusMultiplier?: number;
}

export interface EngagementPointsEarnedProperties {
  actionType: string;
  amount: number;
  multiplier?: number;
  source: string;
}

// ============================================================================
// Signal Events
// ============================================================================

export interface SignalViewedProperties {
  signalId: string;
  signalType: 'market' | 'social' | 'ai' | 'news';
  ticker?: string;
}

export interface SignalActedOnProperties {
  signalId: string;
  action: 'trade' | 'follow' | 'dismiss' | 'save';
  signalType: 'market' | 'social' | 'ai' | 'news';
  tradeAmount?: number;
}

// ============================================================================
// Funnel Events
// ============================================================================

export interface FunnelOnboardingStepProperties {
  step: 'email' | 'verify' | 'kyc' | 'agreements' | 'funding' | 'complete';
  stepNumber: number;
  completed: boolean;
  timeSpentSeconds?: number;
}

export interface FunnelDepositStartedProperties {
  method?: 'bank' | 'card' | 'crypto' | 'wire';
  amount?: number;
}

export interface FunnelDepositCompletedProperties {
  amount: number;
  currency: string;
  method: 'bank' | 'card' | 'crypto' | 'wire';
  processingTimeSeconds?: number;
}

export interface FunnelTradingStartedProperties {
  marketType: 'crypto' | 'prediction' | 'rwa';
  entryPoint?: string;
}

// ============================================================================
// Page View & Identity
// ============================================================================

export interface PageViewProperties {
  path: string;
  title?: string;
  referrer?: string;
  search?: string;
  loadTimeMs?: number;
}

export interface IdentifyTraits {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: number;
  kycTier?: string;
  kycStatus?: string;
  totalDeposits?: number;
  totalTrades?: number;
  totalVolume?: number;
  referralCode?: string;
  tier?: string;
  pointsBalance?: number;
  isVerified?: boolean;
}

// ============================================================================
// Tracker Configuration
// ============================================================================

export interface AnalyticsConfig {
  /** Flush interval in milliseconds */
  flushInterval: number;
  /** Maximum events to batch before flush */
  maxBatchSize: number;
  /** Enable debug logging */
  debug: boolean;
  /** Destinations to send events to */
  destinations: AnalyticsDestination[];
  /** Fields to redact for privacy */
  redactFields: string[];
  /** Enable GDPR compliance mode */
  gdprMode: boolean;
  /** Anonymous ID cookie/storage key */
  anonymousIdKey: string;
}

export interface AnalyticsDestination {
  name: string;
  type: 'convex' | 'segment' | 'amplitude' | 'mixpanel' | 'posthog' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
}

// ============================================================================
// Event Names (for type-safe tracking)
// ============================================================================

export const EVENT_NAMES = {
  // User lifecycle
  USER_SIGNED_UP: 'user.signed_up',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_KYC_STARTED: 'user.kyc_started',
  USER_KYC_COMPLETED: 'user.kyc_completed',
  USER_FIRST_DEPOSIT: 'user.first_deposit',
  USER_FIRST_TRADE: 'user.first_trade',
  USER_PROFILE_UPDATED: 'user.profile_updated',

  // Trading
  TRADE_ORDER_PLACED: 'trade.order_placed',
  TRADE_ORDER_FILLED: 'trade.order_filled',
  TRADE_ORDER_CANCELLED: 'trade.order_cancelled',
  TRADE_POSITION_OPENED: 'trade.position_opened',
  TRADE_POSITION_CLOSED: 'trade.position_closed',

  // Social
  SOCIAL_FOLLOWED: 'social.followed',
  SOCIAL_UNFOLLOWED: 'social.unfollowed',
  SOCIAL_COPY_STARTED: 'social.copy_started',
  SOCIAL_COPY_STOPPED: 'social.copy_stopped',
  SOCIAL_COPY_TRADE_EXECUTED: 'social.copy_trade_executed',
  SOCIAL_MESSAGE_SENT: 'social.message_sent',

  // Engagement
  ENGAGEMENT_QUEST_STARTED: 'engagement.quest_started',
  ENGAGEMENT_QUEST_COMPLETED: 'engagement.quest_completed',
  ENGAGEMENT_ACHIEVEMENT_UNLOCKED: 'engagement.achievement_unlocked',
  ENGAGEMENT_STREAK_MAINTAINED: 'engagement.streak_maintained',
  ENGAGEMENT_STREAK_BROKEN: 'engagement.streak_broken',
  ENGAGEMENT_POINTS_EARNED: 'engagement.points_earned',
  ENGAGEMENT_POINTS_REDEEMED: 'engagement.points_redeemed',

  // Signals
  SIGNAL_VIEWED: 'signal.viewed',
  SIGNAL_ACTED_ON: 'signal.acted_on',
  SIGNAL_DISMISSED: 'signal.dismissed',

  // Funnel
  FUNNEL_ONBOARDING_STEP: 'funnel.onboarding_step',
  FUNNEL_DEPOSIT_STARTED: 'funnel.deposit_started',
  FUNNEL_DEPOSIT_COMPLETED: 'funnel.deposit_completed',
  FUNNEL_TRADING_STARTED: 'funnel.trading_started',

  // Page & Session
  PAGE_VIEWED: 'page.viewed',
  SESSION_STARTED: 'session.started',
  SESSION_ENDED: 'session.ended',

  // Errors
  ERROR_OCCURRED: 'error.occurred',
  ERROR_RECOVERED: 'error.recovered',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

// ============================================================================
// Privacy & GDPR
// ============================================================================

export interface GdprConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  timestamp: number;
  version: string;
}

export interface AnonymizationConfig {
  hashUserIds: boolean;
  removeIp: boolean;
  truncateUserAgent: boolean;
  redactPii: boolean;
  redactFields: string[];
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface EventBatch {
  events: AnalyticsEvent[];
  sentAt: number;
  batchId: string;
}

export interface BatchResult {
  batchId: string;
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors?: string[];
}
