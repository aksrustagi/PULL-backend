/**
 * AI Services - Signal Detection & Insights
 */

export { SignalDetectionService, createSignalDetectionService } from "./signals";
export type {
  // Core types
  Signal,
  SignalType,
  Sentiment,
  Urgency,
  RankedSignal,
  Insight,
  InsightType,
  DailyBriefing,

  // Email types
  Email,
  EmailAttachment,
  DetectedEmailSignal,
  EmailSignalResponse,

  // Market types
  Market,
  MarketAnomaly,
  VolumeDataPoint,
  PriceDataPoint,
  OrderBook,
  OrderBookLevel,

  // Correlation types
  Correlation,
  CorrelationBreak,

  // Social types
  ChatMessage,
  SocialSentiment,
  SentimentAnalysisResponse,

  // User types
  UserContext,
  UserPosition,
  SignalPreferences,

  // Config types
  SignalDetectionConfig,
  AnomalyDetectionConfig,
  SignalMetadata,
} from "./types";
