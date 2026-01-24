/**
 * Type definitions for AI Signal Detection Service
 */

// ============================================================================
// CORE SIGNAL TYPES
// ============================================================================

export type SignalType = "email" | "social" | "market" | "news" | "correlation";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type Urgency = "low" | "medium" | "high";

export interface Signal {
  signalId: string;
  type: SignalType;
  source: string;
  title: string;
  description: string;
  confidence: number; // 0-100
  sentiment: Sentiment;
  urgency: Urgency;
  relatedMarkets: string[];
  relatedAssets: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: number;
  createdAt: number;
}

export interface RankedSignal extends Signal {
  relevanceScore: number;
  rankingFactors: {
    interestMatch: number;
    positionRelevance: number;
    recency: number;
    confidence: number;
  };
}

// ============================================================================
// EMAIL TYPES
// ============================================================================

export interface Email {
  id: string;
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  body: string;
  date: Date;
  attachments?: { filename: string; contentType: string }[];
}

export interface EmailSignalResponse {
  signals: Array<{
    type: string;
    title: string;
    description: string;
    potentialMarkets: string[];
    sentiment: Sentiment;
    confidence: number;
    urgency: Urgency;
    reasoning: string;
    expiresIn: number; // hours
  }>;
}

// ============================================================================
// MARKET TYPES
// ============================================================================

export interface Market {
  ticker: string;
  title: string;
  probability: number;
  volume24h: number;
  volumeHistory?: Array<{ timestamp: number; volume: number }>;
  priceHistory?: Array<{ timestamp: number; price: number }>;
  orderBook?: {
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
  };
}

export interface MarketAnomaly {
  type: "volume_spike" | "price_movement" | "order_imbalance" | "smart_money" | "correlation_break";
  market: string;
  description: string;
  magnitude: number; // 0-1
  details: Record<string, unknown>;
}

export interface Correlation {
  marketA: string;
  marketB: string;
  correlation: number; // -1 to 1
  sampleSize: number;
  pValue: number;
  isSignificant: boolean;
}

// ============================================================================
// SOCIAL TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface SocialSentiment {
  roomId: string;
  marketTicker?: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  overallSentiment: Sentiment;
  sentimentScore: number; // -100 to 100
  consensusForming: boolean;
  messageCount: number;
  uniqueUsers: number;
  topKeywords: string[];
  analyzedAt: number;
}

export interface SentimentAnalysisResponse {
  overallSentiment: Sentiment;
  sentimentScore: number;
  bullishIndicators: string[];
  bearishIndicators: string[];
  consensusForming: boolean;
  confidence: number;
  topKeywords: string[];
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface UserContext {
  userId: string;
  interests: string[];
  activeMarkets: string[];
  positions: UserPosition[];
  location?: {
    city: string;
    state: string;
    country: string;
  };
  preferences: UserSignalPreferences;
}

export interface UserPosition {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export interface UserSignalPreferences {
  emailAnalysisEnabled: boolean;
  socialAnalysisEnabled: boolean;
  marketAlertsEnabled: boolean;
  dailyInsightsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  minConfidenceThreshold: number;
  preferredUrgencyLevel: "all" | "medium_high" | "high_only";
  interests: string[];
  excludedMarkets: string[];
  timezone: string;
}

// ============================================================================
// INSIGHT TYPES
// ============================================================================

export interface Insight {
  insightType: string;
  title: string;
  content: string;
  priority: number;
  action?: string;
  relatedMarket?: string;
  relatedSignals: string[];
}

export interface DailyBriefing {
  greeting: string;
  summary: string;
  insights: Insight[];
  generatedAt: number;
}

export interface DailyInsightsResponse {
  greeting: string;
  summary: string;
  insights: Array<{
    type: string;
    title: string;
    content: string;
    action?: string;
    relatedMarket?: string;
  }>;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface SignalDetectionConfig {
  anthropicApiKey: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  volumeSpikeMultiplier?: number;
  priceMovementThreshold?: number;
  orderImbalanceThreshold?: number;
  correlationThreshold?: number;
}

export interface AnomalyDetectionConfig {
  volumeSpikeMultiplier: number;
  priceMovementThreshold: number;
  priceMovementWindowHours: number;
  orderImbalanceThreshold: number;
  smartMoneyThreshold: number;
  correlationBreakThreshold: number;
}
