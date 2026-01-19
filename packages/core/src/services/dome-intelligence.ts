/**
 * Dome API Integration
 *
 * Provides alternative data and sentiment signals for competitive edge:
 * - Social sentiment analysis
 * - Unusual activity detection
 * - Predictive signals for prediction markets
 * - Collector market intelligence for RWAs
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DomeConfig {
  apiKey: string;
  baseUrl: string;
}

export interface SentimentData {
  symbol: string;
  score: number; // -1 to 1 (-1 = very bearish, 1 = very bullish)
  magnitude: number; // 0-100, strength of sentiment
  volume: number; // Number of mentions
  sources: {
    twitter: number;
    reddit: number;
    news: number;
    discord: number;
  };
  momentum: "rising" | "falling" | "stable";
  keywords: string[];
  timestamp: number;
}

export interface UnusualActivityAlert {
  id: string;
  symbol: string;
  type:
    | "volume_spike"
    | "price_movement"
    | "sentiment_shift"
    | "whale_activity"
    | "unusual_options"
    | "social_trending";
  severity: "low" | "medium" | "high" | "critical";
  magnitude: number;
  description: string;
  details: Record<string, unknown>;
  timestamp: number;
  expiresAt?: number;
}

export interface PredictionSignal {
  eventId: string;
  outcomeId: string;
  currentOdds: number;
  predictedOdds: number;
  confidence: number; // 0-100
  factors: Array<{
    name: string;
    impact: "positive" | "negative" | "neutral";
    weight: number;
    description: string;
  }>;
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  expectedValue: number;
  timestamp: number;
}

export interface CollectorMarketData {
  itemId: string;
  name: string;
  category: string;
  currentPrice: number;
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
  volume24h: number;
  volume7d: number;
  rarity: string;
  grade?: string;
  trendSignal: "hot" | "warming" | "stable" | "cooling" | "cold";
  comparables: Array<{
    name: string;
    price: number;
    soldAt: number;
    source: string;
  }>;
  priceHistory: Array<{
    price: number;
    timestamp: number;
  }>;
}

// =============================================================================
// DOME INTELLIGENCE CLIENT
// =============================================================================

export class DomeIntelligence {
  private config: DomeConfig;

  constructor(config: DomeConfig) {
    this.config = config;
  }

  // ===========================================================================
  // Sentiment Analysis
  // ===========================================================================

  /**
   * Get sentiment scores for multiple assets
   */
  async getSentiment(symbols: string[]): Promise<Map<string, SentimentData>> {
    const response = await this.request("POST", "/v1/sentiment/batch", {
      symbols,
    });

    const results = new Map<string, SentimentData>();
    for (const item of response.results) {
      results.set(item.symbol, item);
    }
    return results;
  }

  /**
   * Get sentiment for a single asset
   */
  async getAssetSentiment(symbol: string): Promise<SentimentData> {
    const response = await this.request("GET", `/v1/sentiment/${symbol}`);
    return response as SentimentData;
  }

  /**
   * Get trending assets by sentiment
   */
  async getTrendingSentiment(params?: {
    category?: string;
    timeframe?: "1h" | "4h" | "24h" | "7d";
    limit?: number;
  }): Promise<SentimentData[]> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set("category", params.category);
    if (params?.timeframe) queryParams.set("timeframe", params.timeframe);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/sentiment/trending${query}`);
    return response.results as SentimentData[];
  }

  // ===========================================================================
  // Unusual Activity Detection
  // ===========================================================================

  /**
   * Get unusual activity alerts
   */
  async getUnusualActivity(params?: {
    assetType?: "prediction" | "crypto" | "rwa" | "all";
    type?: UnusualActivityAlert["type"];
    minSeverity?: "low" | "medium" | "high" | "critical";
    limit?: number;
  }): Promise<UnusualActivityAlert[]> {
    const queryParams = new URLSearchParams();
    if (params?.assetType) queryParams.set("assetType", params.assetType);
    if (params?.type) queryParams.set("type", params.type);
    if (params?.minSeverity) queryParams.set("minSeverity", params.minSeverity);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/signals/unusual-activity${query}`);
    return response.alerts as UnusualActivityAlert[];
  }

  /**
   * Get alerts for a specific asset
   */
  async getAssetAlerts(symbol: string): Promise<UnusualActivityAlert[]> {
    const response = await this.request("GET", `/v1/signals/alerts/${symbol}`);
    return response.alerts as UnusualActivityAlert[];
  }

  // ===========================================================================
  // Prediction Market Signals
  // ===========================================================================

  /**
   * Get predictive signals for a prediction market event
   */
  async getPredictionSignals(eventId: string): Promise<PredictionSignal[]> {
    const response = await this.request("GET", `/v1/predictions/${eventId}/signals`);
    return response.signals as PredictionSignal[];
  }

  /**
   * Get signals for a specific outcome
   */
  async getOutcomeSignal(
    eventId: string,
    outcomeId: string
  ): Promise<PredictionSignal> {
    const response = await this.request(
      "GET",
      `/v1/predictions/${eventId}/outcomes/${outcomeId}/signal`
    );
    return response as PredictionSignal;
  }

  /**
   * Get top prediction opportunities
   */
  async getTopPredictionOpportunities(params?: {
    category?: string;
    minConfidence?: number;
    minExpectedValue?: number;
    limit?: number;
  }): Promise<PredictionSignal[]> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set("category", params.category);
    if (params?.minConfidence)
      queryParams.set("minConfidence", params.minConfidence.toString());
    if (params?.minExpectedValue)
      queryParams.set("minExpectedValue", params.minExpectedValue.toString());
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/predictions/opportunities${query}`);
    return response.opportunities as PredictionSignal[];
  }

  // ===========================================================================
  // Collector Market Intelligence
  // ===========================================================================

  /**
   * Get market intelligence for collectibles
   */
  async getCollectorIntelligence(params: {
    category: "pokemon" | "sports" | "tcg" | "other";
    query?: string;
    sortBy?: "volume" | "price" | "trend";
    limit?: number;
  }): Promise<CollectorMarketData[]> {
    const response = await this.request("POST", "/v1/collectibles/market-intelligence", params);
    return response.items as CollectorMarketData[];
  }

  /**
   * Get details for a specific collectible
   */
  async getCollectibleDetails(itemId: string): Promise<CollectorMarketData> {
    const response = await this.request("GET", `/v1/collectibles/${itemId}`);
    return response as CollectorMarketData;
  }

  /**
   * Get price estimate for a collectible
   */
  async getPriceEstimate(params: {
    category: string;
    name: string;
    grade?: string;
    condition?: string;
  }): Promise<{
    estimatedPrice: number;
    confidence: number;
    priceRange: { low: number; high: number };
    comparables: CollectorMarketData["comparables"];
  }> {
    const response = await this.request("POST", "/v1/collectibles/estimate", params);
    return response as any;
  }

  /**
   * Get trending collectibles
   */
  async getTrendingCollectibles(params?: {
    category?: string;
    timeframe?: "24h" | "7d" | "30d";
    limit?: number;
  }): Promise<CollectorMarketData[]> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set("category", params.category);
    if (params?.timeframe) queryParams.set("timeframe", params.timeframe);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/collectibles/trending${query}`);
    return response.items as CollectorMarketData[];
  }

  // ===========================================================================
  // News & Events
  // ===========================================================================

  /**
   * Get relevant news for an asset
   */
  async getNews(params: {
    symbol?: string;
    category?: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      title: string;
      summary: string;
      url: string;
      source: string;
      sentiment: number;
      relevance: number;
      publishedAt: number;
    }>
  > {
    const queryParams = new URLSearchParams();
    if (params?.symbol) queryParams.set("symbol", params.symbol);
    if (params?.category) queryParams.set("category", params.category);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const response = await this.request("GET", `/v1/news${query}`);
    return response.articles as any[];
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dome API error: ${response.status} - ${error}`);
    }

    return response.json();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let domeClient: DomeIntelligence | null = null;

export function getDomeClient(): DomeIntelligence {
  if (!domeClient) {
    domeClient = new DomeIntelligence({
      apiKey: process.env.DOME_API_KEY!,
      baseUrl: process.env.DOME_BASE_URL!,
    });
  }
  return domeClient;
}
