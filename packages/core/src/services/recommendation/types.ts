/**
 * Recommendation Engine Types
 * Types for personalized market recommendations
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RecommendationClientConfig {
  pineconeApiKey: string;
  pineconeEnvironment: string;
  pineconeIndex: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  embeddingModel?: string;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: "openai" | "anthropic" | "cohere";
  model: string;
  dimensions: number;
}

// ============================================================================
// Market Types
// ============================================================================

export interface Market {
  marketId: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  tags: string[];
  outcomes: MarketOutcome[];
  closeDate: Date;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  createdAt: Date;
}

export interface MarketOutcome {
  outcomeId: string;
  name: string;
  probability: number;
  price: number;
}

export interface MarketFeatures {
  marketId: string;
  embedding: number[];
  popularity: number;
  recency: number;
  volatility: number;
  liquidity: number;
  categoryScore: Record<string, number>;
}

// ============================================================================
// User Types
// ============================================================================

export interface UserProfile {
  userId: string;
  tradingHistory: TradingHistoryItem[];
  watchlist: string[];
  searchHistory: SearchHistoryItem[];
  preferences: UserPreferences;
  segments: string[];
}

export interface TradingHistoryItem {
  marketId: string;
  category: string;
  outcome: "win" | "loss" | "pending";
  volume: number;
  tradedAt: Date;
}

export interface SearchHistoryItem {
  query: string;
  category?: string;
  searchedAt: Date;
}

export interface UserPreferences {
  preferredCategories: string[];
  riskTolerance: "low" | "medium" | "high";
  preferredTimeframes: ("short" | "medium" | "long")[];
  notificationSettings: NotificationPreferences;
}

export interface NotificationPreferences {
  marketAlerts: boolean;
  priceAlerts: boolean;
  newMarkets: boolean;
  trending: boolean;
}

// ============================================================================
// Recommendation Types
// ============================================================================

export interface RecommendationRequest {
  userId: string;
  limit?: number;
  filters?: RecommendationFilters;
  context?: RecommendationContext;
}

export interface RecommendationFilters {
  categories?: string[];
  excludeMarketIds?: string[];
  minVolume?: number;
  maxCloseDate?: Date;
  minCloseDate?: Date;
}

export interface RecommendationContext {
  currentPage?: string;
  recentlyViewed?: string[];
  sessionId?: string;
  deviceType?: "mobile" | "desktop" | "tablet";
}

export interface Recommendation {
  marketId: string;
  market: Market;
  score: number;
  reasons: RecommendationReason[];
  rank: number;
}

export interface RecommendationReason {
  type: ReasonType;
  description: string;
  weight: number;
}

export type ReasonType =
  | "similar_to_traded"
  | "trending_in_category"
  | "high_volume"
  | "closing_soon"
  | "new_market"
  | "watchlist_related"
  | "collaborative_filtering"
  | "content_based"
  | "popular_in_segment";

// ============================================================================
// Scoring Types
// ============================================================================

export interface ScoringWeights {
  contentSimilarity: number;
  collaborativeFiltering: number;
  popularity: number;
  recency: number;
  categoryAffinity: number;
  volumeBoost: number;
  diversityPenalty: number;
}

export interface ScoringContext {
  userProfile: UserProfile;
  weights: ScoringWeights;
  candidateMarkets: Market[];
}

// ============================================================================
// Collaborative Filtering Types
// ============================================================================

export interface UserSimilarity {
  userId: string;
  similarity: number;
}

export interface ItemCoOccurrence {
  marketId1: string;
  marketId2: string;
  coOccurrenceCount: number;
  confidence: number;
}

// ============================================================================
// Trending Types
// ============================================================================

export interface TrendingMarket {
  marketId: string;
  market: Market;
  trendScore: number;
  volumeChange24h: number;
  tradeCountChange24h: number;
  uniqueTradersChange24h: number;
}

export interface TrendingRequest {
  category?: string;
  timeframe?: "1h" | "24h" | "7d";
  limit?: number;
}

// ============================================================================
// Similar Markets Types
// ============================================================================

export interface SimilarMarketsRequest {
  marketId: string;
  limit?: number;
  excludeCategories?: string[];
}

export interface SimilarMarket {
  marketId: string;
  market: Market;
  similarity: number;
  sharedTags: string[];
}

// ============================================================================
// Discovery Types
// ============================================================================

export interface DiscoveryRequest {
  type: DiscoveryType;
  userId?: string;
  limit?: number;
}

export type DiscoveryType =
  | "new_markets"
  | "closing_soon"
  | "high_liquidity"
  | "underrated"
  | "diverse_picks";

// ============================================================================
// A/B Testing Types for Recommendations
// ============================================================================

export interface RecommendationExperiment {
  experimentId: string;
  name: string;
  variants: RecommendationVariant[];
  allocation: number[]; // Percentage allocation for each variant
}

export interface RecommendationVariant {
  variantId: string;
  name: string;
  algorithm: RecommendationAlgorithm;
  weights: Partial<ScoringWeights>;
}

export type RecommendationAlgorithm =
  | "content_based"
  | "collaborative"
  | "hybrid"
  | "popularity"
  | "random";

// ============================================================================
// Feedback Types
// ============================================================================

export interface RecommendationFeedback {
  userId: string;
  marketId: string;
  feedbackType: FeedbackType;
  position?: number;
  context?: string;
  timestamp: Date;
}

export type FeedbackType =
  | "click"
  | "view"
  | "trade"
  | "watchlist_add"
  | "dismiss"
  | "not_interested";

// ============================================================================
// Error Types
// ============================================================================

export class RecommendationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "RecommendationError";
  }
}
