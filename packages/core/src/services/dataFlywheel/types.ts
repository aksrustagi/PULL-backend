/**
 * Data Flywheel Types
 */

// ============================================================================
// Trading Behavior Types
// ============================================================================

export interface TradingSessionData {
  userId: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  ordersPlaced: number;
  ordersFilled: number;
  ordersCancelled: number;
  totalVolume: number;
  totalPnL: number;
  deviceType?: string;
  timezone?: string;
}

export interface OrderFlowPattern {
  userId: string;
  patternType:
    | "scalper"
    | "swing_trader"
    | "position_trader"
    | "news_reactive"
    | "momentum_chaser"
    | "contrarian"
    | "arbitrageur"
    | "market_maker"
    | "unknown";
  preferredTradingHours: number[];
  preferredTradingDays: number[];
  averageSessionDuration: number;
  tradingFrequency: number;
  averageOrderSize: number;
  limitOrderRatio: number;
  averageHoldingPeriod: number;
  confidence: number;
}

export interface RiskMetrics {
  userId: string;
  riskScore: number;
  riskCategory: "conservative" | "moderate" | "aggressive" | "very_aggressive";
  averagePositionSizePercent: number;
  maxPositionSizePercent: number;
  maxHistoricalDrawdown: number;
  winLossRatio: number;
  profitFactor: number;
  sharpeRatio?: number;
}

export type TradingPatternType =
  | "scalper"
  | "swing_trader"
  | "position_trader"
  | "news_reactive"
  | "momentum_chaser"
  | "contrarian"
  | "arbitrageur"
  | "market_maker"
  | "unknown";

export type RiskCategory =
  | "conservative"
  | "moderate"
  | "aggressive"
  | "very_aggressive";

// ============================================================================
// Social Signal Types
// ============================================================================

export interface SocialFollow {
  followerId: string;
  followeeId: string;
  source: "search" | "leaderboard" | "recommendation" | "copy_trading" | "chat_room" | "referral" | "other";
  copyTradingEnabled: boolean;
  copyAllocation?: number;
}

export interface TraderLeaderboardEntry {
  userId: string;
  rank: number;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  followerCount: number;
  copierCount: number;
  isVerified: boolean;
}

export interface ChatSentiment {
  roomId: string;
  sentimentScore: number;
  sentimentCategory: "very_bearish" | "bearish" | "neutral" | "bullish" | "very_bullish";
  convictionScore: number;
  messageCount: number;
  uniqueParticipants: number;
}

export interface ViralContent {
  contentId: string;
  contentType: "message" | "trade_share" | "prediction" | "analysis" | "news_share" | "meme" | "tutorial";
  authorId: string;
  viralityScore: number;
  viewCount: number;
  shareCount: number;
  tradingActivitySpike: boolean;
}

export interface CommunityConvictionSignal {
  assetClass: string;
  symbol: string;
  overallConviction: number;
  convictionDirection: "strong_sell" | "sell" | "neutral" | "buy" | "strong_buy";
  chatSentimentScore: number;
  tradingFlowScore: number;
  totalParticipants: number;
}

export type SentimentCategory =
  | "very_bearish"
  | "bearish"
  | "neutral"
  | "bullish"
  | "very_bullish";

export type ConvictionDirection =
  | "strong_sell"
  | "sell"
  | "neutral"
  | "buy"
  | "strong_buy";

// ============================================================================
// Email Intelligence Types
// ============================================================================

export type ConsentType =
  | "email_analysis"
  | "calendar_analysis"
  | "trading_data_sharing"
  | "anonymized_data_sale"
  | "research_participation"
  | "premium_insights";

export interface DataConsent {
  userId: string;
  consentType: ConsentType;
  status: "granted" | "revoked" | "expired";
  scope: string[];
  thirdPartySharing: boolean;
  grantedAt: number;
  expiresAt?: number;
}

export interface NewsletterCorrelation {
  userId: string;
  emailId: string;
  newsletterSource: string;
  sentimentScore: number;
  extractedTickers: string[];
  userTradedAfter: boolean;
  tradingPnL?: number;
  predictiveScore?: number;
}

export interface CalendarTradingCorrelation {
  userId: string;
  eventType: "meeting" | "travel" | "conference" | "earnings_call" | "personal" | "other";
  tradingBefore: { trades: number; volume: number; pnl: number };
  tradingDuring: { trades: number; volume: number; pnl: number };
  tradingAfter: { trades: number; volume: number; pnl: number };
  behaviorChangeScore: number;
}

export interface InformationSource {
  userId: string;
  sourceType: string;
  sourceName: string;
  totalSignals: number;
  signalsActedOn: number;
  profitableSignalsRatio: number;
  calculatedTrustScore: number;
}

// ============================================================================
// Cross-Asset Correlation Types
// ============================================================================

export interface AssetCorrelation {
  asset1Class: string;
  asset1Symbol: string;
  asset2Class: string;
  asset2Symbol: string;
  correlation: number;
  correlationStrength:
    | "strong_negative"
    | "moderate_negative"
    | "weak_negative"
    | "none"
    | "weak_positive"
    | "moderate_positive"
    | "strong_positive";
  optimalLagHours: number;
  leaderAsset?: string;
  pValue: number;
  sampleSize: number;
}

export interface MarketRegime {
  assetClass: string;
  symbol?: string;
  regime:
    | "bull_low_vol"
    | "bull_high_vol"
    | "bear_low_vol"
    | "bear_high_vol"
    | "sideways_low_vol"
    | "sideways_high_vol"
    | "crisis"
    | "recovery";
  trendDirection: "up" | "down" | "sideways";
  trendStrength: number;
  volatilityLevel: number;
  confidence: number;
}

export interface AlternativeDataCorrelation {
  alternativeDataType:
    | "pokemon_prices"
    | "weather_data"
    | "sports_betting"
    | "google_trends"
    | "social_sentiment"
    | "travel_bookings"
    | "gaming_activity"
    | "other";
  alternativeMetric: string;
  assetClass: string;
  symbol: string;
  correlation: number;
  predictivePower: number;
  lagDays: number;
}

export type CorrelationStrength =
  | "strong_negative"
  | "moderate_negative"
  | "weak_negative"
  | "none"
  | "weak_positive"
  | "moderate_positive"
  | "strong_positive";

export type MarketRegimeType =
  | "bull_low_vol"
  | "bull_high_vol"
  | "bear_low_vol"
  | "bear_high_vol"
  | "sideways_low_vol"
  | "sideways_high_vol"
  | "crisis"
  | "recovery";

// ============================================================================
// Outcome Tracking Types
// ============================================================================

export interface SignalOutcome {
  signalId: string;
  signalType: string;
  assetClass: string;
  symbol: string;
  direction: "long" | "short";
  priceAtSignal: number;
  outcomes: {
    "1h"?: { price: number; returnPercent: number; correct: boolean };
    "4h"?: { price: number; returnPercent: number; correct: boolean };
    "24h"?: { price: number; returnPercent: number; correct: boolean };
    "7d"?: { price: number; returnPercent: number; correct: boolean };
    "30d"?: { price: number; returnPercent: number; correct: boolean };
  };
  usersActedOn: number;
  averageUserPnL?: number;
}

export interface TraderAlpha {
  userId: string;
  alphaScore: number;
  hasStatisticalAlpha: boolean;
  alphaCategory:
    | "significant_alpha"
    | "marginal_alpha"
    | "no_alpha"
    | "negative_alpha"
    | "insufficient_data";
  sharpeRatio?: number;
  consistencyScore: number;
  skillLuckRatio: number;
}

export interface ContentOutcome {
  contentId: string;
  contentType: string;
  authorId: string;
  totalViews: number;
  engagementRate: number;
  viewersWhoTraded: number;
  tradingVolumeGenerated: number;
  averageViewerPnL?: number;
}

export interface FunnelAnalytics {
  funnelId: string;
  funnelName: string;
  totalStarted: number;
  totalCompleted: number;
  overallConversionRate: number;
  biggestDropoffStep: string;
  completerFirstTradeTime: number;
  completer30dRetention: number;
}

export type AlphaCategory =
  | "significant_alpha"
  | "marginal_alpha"
  | "no_alpha"
  | "negative_alpha"
  | "insufficient_data";

// ============================================================================
// Monetization Types
// ============================================================================

export interface DataProduct {
  productId: string;
  name: string;
  description: string;
  productType:
    | "signal_feed"
    | "predictive_model"
    | "research_report"
    | "data_export"
    | "api_access"
    | "custom_analysis";
  dataCategories: string[];
  assetClasses: string[];
  updateFrequency: "real_time" | "hourly" | "daily" | "weekly" | "monthly" | "one_time";
  pricingModel: "subscription" | "per_query" | "tiered" | "custom";
  basePrice: number;
  currency: string;
}

export interface DataSubscription {
  subscriberId?: string;
  organizationId?: string;
  subscriberType: "individual" | "institutional" | "partner";
  productId: string;
  status: "trial" | "active" | "past_due" | "cancelled" | "expired";
  billingCycle: "monthly" | "quarterly" | "annual";
  price: number;
  usageThisMonth: number;
  usageLimit?: number;
}

export interface ResearchReport {
  reportId: string;
  title: string;
  summary: string;
  reportType:
    | "market_overview"
    | "asset_deep_dive"
    | "correlation_analysis"
    | "sentiment_report"
    | "trader_flow_analysis"
    | "prediction_accuracy"
    | "custom";
  assetClasses: string[];
  price: number;
  accessLevel: "public" | "subscribers" | "premium" | "institutional";
}

export interface AnonymizedSignal {
  signalId: string;
  signalType: string;
  assetClass: string;
  symbol: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  confidence: number;
  participantCount: number;
  consensusLevel: number;
  historicalAccuracy?: number;
}

// ============================================================================
// Aggregation & Analytics Types
// ============================================================================

export interface AggregationWindow {
  windowStart: number;
  windowEnd: number;
  windowType: "hourly" | "daily" | "weekly" | "monthly";
}

export interface DataQualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  overallScore: number;
}

export interface PredictiveModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  calibrationError: number;
}
