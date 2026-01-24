/**
 * AI Signal Detection - Type Definitions
 */

// ============================================================================
// EMAIL SIGNAL TYPES
// ============================================================================

export interface Email {
  id: string;
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  body: string;
  date: Date;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface UserContext {
  userId: string;
  interests: string[];
  activeMarkets: string[];
  positions: UserPosition[];
  location?: {
    city?: string;
    state?: string;
    country?: string;
    timezone: string;
  };
  preferences: SignalPreferences;
}

export interface UserPosition {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  currentPrice: number;
  averageEntryPrice: number;
  unrealizedPnL: number;
}

export interface SignalPreferences {
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
// SIGNAL TYPES
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
  metadata?: SignalMetadata;
  expiresAt?: number;
  createdAt: number;
}

export interface SignalMetadata {
  // Email-specific
  emailId?: string;
  emailSubject?: string;
  signalSubType?: string;
  reasoning?: string;

  // Market-specific
  anomalyType?: string;
  percentChange?: number;
  volumeMultiplier?: number;
  orderBookImbalance?: number;

  // Social-specific
  messageCount?: number;
  uniqueUsers?: number;
  sentimentScore?: number;

  // Correlation-specific
  correlatedMarket?: string;
  correlationCoefficient?: number;
  divergenceAmount?: number;

  // Generic
  rawData?: unknown;
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
// MARKET TYPES
// ============================================================================

export interface Market {
  ticker: string;
  title: string;
  category: string;
  status: "open" | "closed" | "trading_halted";
  probability: number;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  volumeHistory: VolumeDataPoint[];
  priceHistory: PriceDataPoint[];
  openInterest: number;
  orderBook?: OrderBook;
}

export interface VolumeDataPoint {
  timestamp: number;
  volume: number;
}

export interface PriceDataPoint {
  timestamp: number;
  price: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface MarketAnomaly {
  type: "volume_spike" | "price_movement" | "order_imbalance" | "smart_money" | "correlation_break";
  market: string;
  description: string;
  magnitude: number;
  details: Record<string, unknown>;
}

// ============================================================================
// CORRELATION TYPES
// ============================================================================

export interface Correlation {
  marketA: string;
  marketB: string;
  correlation: number; // -1 to 1
  sampleSize: number;
  pValue: number;
  isSignificant: boolean;
  trend?: "strengthening" | "weakening" | "stable";
}

export interface CorrelationBreak {
  marketA: string;
  marketB: string;
  historicalCorrelation: number;
  currentCorrelation: number;
  divergenceAmount: number;
}

// ============================================================================
// INSIGHT TYPES
// ============================================================================

export type InsightType = "portfolio" | "opportunity" | "risk" | "trend" | "social";

export interface Insight {
  insightType: InsightType;
  title: string;
  content: string;
  priority: number; // 1-5
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

// ============================================================================
// SOCIAL SENTIMENT TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  roomId: string;
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

// ============================================================================
// AI PROMPT RESPONSE TYPES
// ============================================================================

export interface EmailSignalResponse {
  signals: DetectedEmailSignal[];
}

export interface DetectedEmailSignal {
  type: "travel" | "financial" | "event" | "calendar" | "news";
  title: string;
  description: string;
  potentialMarkets: string[];
  sentiment: Sentiment;
  confidence: number;
  urgency: Urgency;
  reasoning: string;
  expiresIn: number; // hours
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

export interface DailyInsightsResponse {
  greeting: string;
  summary: string;
  insights: Array<{
    type: InsightType;
    title: string;
    content: string;
    action?: string;
    relatedMarket?: string;
  }>;
}

// ============================================================================
// SERVICE CONFIG TYPES
// ============================================================================

export interface SignalDetectionConfig {
  anthropicApiKey: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;

  // Anomaly detection thresholds
  volumeSpikeMultiplier?: number; // Default: 3x
  priceMovementThreshold?: number; // Default: 15%
  orderImbalanceThreshold?: number; // Default: 75%
  correlationThreshold?: number; // Default: 0.7
}

export interface AnomalyDetectionConfig {
  volumeSpikeMultiplier: number;
  priceMovementThreshold: number;
  priceMovementWindowHours: number;
  orderImbalanceThreshold: number;
  smartMoneyThreshold: number;
  correlationBreakThreshold: number;
}
