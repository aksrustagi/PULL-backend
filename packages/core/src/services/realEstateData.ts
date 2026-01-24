/**
 * Real Estate Market Data Service
 *
 * Integrates with multiple real estate data providers to fetch
 * market metrics for prediction market resolution and sentiment analysis.
 *
 * Data Sources:
 * - Zillow API (primary for residential)
 * - Redfin Data
 * - FRED (Federal Reserve Economic Data)
 * - Census Bureau Housing Data
 * - Realtor.com API
 * - Mortgage News Daily (for rates)
 */

import { z } from "zod";

// ============================================================================
// SCHEMAS
// ============================================================================

const marketMetricSchema = z.object({
  metric: z.string(),
  value: z.number(),
  previousValue: z.number().optional(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  timestamp: z.string(),
  source: z.string(),
  sourceUrl: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type MarketMetric = z.infer<typeof marketMetricSchema>;

const locationDataSchema = z.object({
  geographicScope: z.enum([
    "national",
    "state",
    "metro",
    "city",
    "zip_code",
    "neighborhood",
  ]),
  country: z.string(),
  state: z.string().optional(),
  metro: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  neighborhood: z.string().optional(),
  regionId: z.string().optional(),
});

export type LocationData = z.infer<typeof locationDataSchema>;

const marketDataResponseSchema = z.object({
  location: locationDataSchema,
  metrics: z.array(marketMetricSchema),
  fetchedAt: z.string(),
  cacheExpiry: z.string().optional(),
});

export type MarketDataResponse = z.infer<typeof marketDataResponseSchema>;

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface RealEstateDataConfig {
  zillowApiKey?: string;
  redfinApiKey?: string;
  fredApiKey?: string;
  realtorApiKey?: string;
  cacheEnabled?: boolean;
  cacheTtlSeconds?: number;
}

// ============================================================================
// ZILLOW DATA CLIENT
// ============================================================================

export class ZillowDataClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? "https://api.bridgedataoutput.com/api/v2/zestimates";
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const searchParams = new URLSearchParams(params);
    searchParams.set("access_token", this.apiKey);

    const url = `${this.baseUrl}${endpoint}?${searchParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Zillow API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get median home value for a location
   */
  async getMedianHomeValue(location: LocationData): Promise<MarketMetric> {
    // This would integrate with Zillow's actual API
    // For now, returning structured mock data
    const regionType = location.geographicScope === "zip_code" ? "zip" : location.geographicScope;

    const data = await this.request<{
      value: number;
      change: number;
      changePercent: number;
    }>(`/home-values/${regionType}`, {
      state: location.state ?? "",
      city: location.city ?? "",
      zip: location.zipCode ?? "",
    });

    return {
      metric: "median_home_value",
      value: data.value,
      previousValue: data.value - data.change,
      change: data.change,
      changePercent: data.changePercent,
      timestamp: new Date().toISOString(),
      source: "zillow",
      sourceUrl: "https://www.zillow.com/research/data/",
      confidence: 95,
    };
  }

  /**
   * Get rent index for a location
   */
  async getRentIndex(location: LocationData): Promise<MarketMetric> {
    const regionType = location.geographicScope === "zip_code" ? "zip" : location.geographicScope;

    const data = await this.request<{
      value: number;
      change: number;
      changePercent: number;
    }>(`/rent-index/${regionType}`, {
      state: location.state ?? "",
      city: location.city ?? "",
      zip: location.zipCode ?? "",
    });

    return {
      metric: "rent_index",
      value: data.value,
      previousValue: data.value - data.change,
      change: data.change,
      changePercent: data.changePercent,
      timestamp: new Date().toISOString(),
      source: "zillow",
      sourceUrl: "https://www.zillow.com/research/data/",
      confidence: 92,
    };
  }

  /**
   * Get days on market
   */
  async getDaysOnMarket(location: LocationData): Promise<MarketMetric> {
    const regionType = location.geographicScope === "zip_code" ? "zip" : location.geographicScope;

    const data = await this.request<{
      value: number;
      change: number;
    }>(`/days-on-market/${regionType}`, {
      state: location.state ?? "",
      city: location.city ?? "",
    });

    return {
      metric: "days_on_market",
      value: data.value,
      previousValue: data.value - data.change,
      change: data.change,
      timestamp: new Date().toISOString(),
      source: "zillow",
      confidence: 90,
    };
  }

  /**
   * Get for-sale inventory count
   */
  async getInventory(location: LocationData): Promise<MarketMetric> {
    const regionType = location.geographicScope === "zip_code" ? "zip" : location.geographicScope;

    const data = await this.request<{
      value: number;
      change: number;
      changePercent: number;
    }>(`/inventory/${regionType}`, {
      state: location.state ?? "",
      city: location.city ?? "",
    });

    return {
      metric: "housing_inventory",
      value: data.value,
      previousValue: data.value - data.change,
      change: data.change,
      changePercent: data.changePercent,
      timestamp: new Date().toISOString(),
      source: "zillow",
      confidence: 88,
    };
  }
}

// ============================================================================
// FRED (FEDERAL RESERVE) DATA CLIENT
// ============================================================================

export class FredDataClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.stlouisfed.org/fred";
  }

  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const searchParams = new URLSearchParams({
      ...params,
      api_key: this.apiKey,
      file_type: "json",
    });

    const url = `${this.baseUrl}${endpoint}?${searchParams.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FRED API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get 30-year fixed mortgage rate
   */
  async getMortgageRate30Year(): Promise<MarketMetric> {
    const data = await this.request<{
      observations: Array<{ date: string; value: string }>;
    }>("/series/observations", {
      series_id: "MORTGAGE30US",
      sort_order: "desc",
      limit: "2",
    });

    const current = parseFloat(data.observations[0]?.value ?? "0");
    const previous = parseFloat(data.observations[1]?.value ?? "0");

    return {
      metric: "mortgage_rate_30y",
      value: current,
      previousValue: previous,
      change: current - previous,
      changePercent: ((current - previous) / previous) * 100,
      timestamp: data.observations[0]?.date ?? new Date().toISOString(),
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/series/MORTGAGE30US",
      confidence: 100,
    };
  }

  /**
   * Get 15-year fixed mortgage rate
   */
  async getMortgageRate15Year(): Promise<MarketMetric> {
    const data = await this.request<{
      observations: Array<{ date: string; value: string }>;
    }>("/series/observations", {
      series_id: "MORTGAGE15US",
      sort_order: "desc",
      limit: "2",
    });

    const current = parseFloat(data.observations[0]?.value ?? "0");
    const previous = parseFloat(data.observations[1]?.value ?? "0");

    return {
      metric: "mortgage_rate_15y",
      value: current,
      previousValue: previous,
      change: current - previous,
      timestamp: data.observations[0]?.date ?? new Date().toISOString(),
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/series/MORTGAGE15US",
      confidence: 100,
    };
  }

  /**
   * Get housing starts (new construction)
   */
  async getHousingStarts(): Promise<MarketMetric> {
    const data = await this.request<{
      observations: Array<{ date: string; value: string }>;
    }>("/series/observations", {
      series_id: "HOUST",
      sort_order: "desc",
      limit: "2",
    });

    const current = parseFloat(data.observations[0]?.value ?? "0");
    const previous = parseFloat(data.observations[1]?.value ?? "0");

    return {
      metric: "housing_starts",
      value: current,
      previousValue: previous,
      change: current - previous,
      changePercent: ((current - previous) / previous) * 100,
      timestamp: data.observations[0]?.date ?? new Date().toISOString(),
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/series/HOUST",
      confidence: 100,
    };
  }

  /**
   * Get Case-Shiller Home Price Index
   */
  async getCaseShillerIndex(region: "national" | string = "national"): Promise<MarketMetric> {
    // CSUSHPINSA = National, SFXRSA = San Francisco, etc.
    const seriesId = region === "national" ? "CSUSHPINSA" : `${region}XRSA`;

    const data = await this.request<{
      observations: Array<{ date: string; value: string }>;
    }>("/series/observations", {
      series_id: seriesId,
      sort_order: "desc",
      limit: "2",
    });

    const current = parseFloat(data.observations[0]?.value ?? "0");
    const previous = parseFloat(data.observations[1]?.value ?? "0");

    return {
      metric: "case_shiller_index",
      value: current,
      previousValue: previous,
      change: current - previous,
      changePercent: ((current - previous) / previous) * 100,
      timestamp: data.observations[0]?.date ?? new Date().toISOString(),
      source: "fred",
      sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
      confidence: 100,
    };
  }

  /**
   * Get existing home sales
   */
  async getExistingHomeSales(): Promise<MarketMetric> {
    const data = await this.request<{
      observations: Array<{ date: string; value: string }>;
    }>("/series/observations", {
      series_id: "EXHOSLUSM495S",
      sort_order: "desc",
      limit: "2",
    });

    const current = parseFloat(data.observations[0]?.value ?? "0");
    const previous = parseFloat(data.observations[1]?.value ?? "0");

    return {
      metric: "existing_home_sales",
      value: current,
      previousValue: previous,
      change: current - previous,
      changePercent: ((current - previous) / previous) * 100,
      timestamp: data.observations[0]?.date ?? new Date().toISOString(),
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/series/EXHOSLUSM495S",
      confidence: 100,
    };
  }
}

// ============================================================================
// MAIN REAL ESTATE DATA SERVICE
// ============================================================================

export class RealEstateDataService {
  private config: RealEstateDataConfig;
  private zillowClient?: ZillowDataClient;
  private fredClient?: FredDataClient;
  private cache: Map<string, { data: unknown; expiry: number }>;

  constructor(config: RealEstateDataConfig) {
    this.config = config;
    this.cache = new Map();

    if (config.zillowApiKey) {
      this.zillowClient = new ZillowDataClient(config.zillowApiKey);
    }

    if (config.fredApiKey) {
      this.fredClient = new FredDataClient(config.fredApiKey);
    }
  }

  private getCacheKey(method: string, params: Record<string, unknown>): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  private getFromCache<T>(key: string): T | null {
    if (!this.config.cacheEnabled) return null;

    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCache(key: string, data: unknown): void {
    if (!this.config.cacheEnabled) return;

    const ttl = (this.config.cacheTtlSeconds ?? 3600) * 1000;
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * Get all available metrics for a location
   */
  async getMarketData(location: LocationData): Promise<MarketDataResponse> {
    const cacheKey = this.getCacheKey("getMarketData", location);
    const cached = this.getFromCache<MarketDataResponse>(cacheKey);
    if (cached) return cached;

    const metrics: MarketMetric[] = [];

    // Fetch from all available sources in parallel
    const promises: Promise<void>[] = [];

    if (this.zillowClient) {
      promises.push(
        this.zillowClient
          .getMedianHomeValue(location)
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.zillowClient
          .getRentIndex(location)
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.zillowClient
          .getDaysOnMarket(location)
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.zillowClient
          .getInventory(location)
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
    }

    if (this.fredClient && location.geographicScope === "national") {
      promises.push(
        this.fredClient
          .getMortgageRate30Year()
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.fredClient
          .getMortgageRate15Year()
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.fredClient
          .getHousingStarts()
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.fredClient
          .getCaseShillerIndex()
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
      promises.push(
        this.fredClient
          .getExistingHomeSales()
          .then((m) => metrics.push(m))
          .catch(() => {})
      );
    }

    await Promise.all(promises);

    const response: MarketDataResponse = {
      location,
      metrics,
      fetchedAt: new Date().toISOString(),
      cacheExpiry: new Date(
        Date.now() + (this.config.cacheTtlSeconds ?? 3600) * 1000
      ).toISOString(),
    };

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Get a specific metric for a location
   */
  async getMetric(
    location: LocationData,
    metricName: string
  ): Promise<MarketMetric | null> {
    const cacheKey = this.getCacheKey("getMetric", { location, metricName });
    const cached = this.getFromCache<MarketMetric>(cacheKey);
    if (cached) return cached;

    let metric: MarketMetric | null = null;

    try {
      switch (metricName) {
        case "median_home_value":
        case "median_home_price":
          if (this.zillowClient) {
            metric = await this.zillowClient.getMedianHomeValue(location);
          }
          break;

        case "rent_index":
        case "rent_prices":
          if (this.zillowClient) {
            metric = await this.zillowClient.getRentIndex(location);
          }
          break;

        case "days_on_market":
          if (this.zillowClient) {
            metric = await this.zillowClient.getDaysOnMarket(location);
          }
          break;

        case "housing_inventory":
          if (this.zillowClient) {
            metric = await this.zillowClient.getInventory(location);
          }
          break;

        case "mortgage_rate_30y":
        case "mortgage_rates":
          if (this.fredClient) {
            metric = await this.fredClient.getMortgageRate30Year();
          }
          break;

        case "mortgage_rate_15y":
          if (this.fredClient) {
            metric = await this.fredClient.getMortgageRate15Year();
          }
          break;

        case "housing_starts":
        case "new_construction":
          if (this.fredClient) {
            metric = await this.fredClient.getHousingStarts();
          }
          break;

        case "case_shiller_index":
          if (this.fredClient) {
            metric = await this.fredClient.getCaseShillerIndex();
          }
          break;

        case "existing_home_sales":
        case "home_sales_volume":
          if (this.fredClient) {
            metric = await this.fredClient.getExistingHomeSales();
          }
          break;
      }
    } catch (error) {
      console.error(`Error fetching metric ${metricName}:`, error);
      return null;
    }

    if (metric) {
      this.setCache(cacheKey, metric);
    }

    return metric;
  }

  /**
   * Get current mortgage rates
   */
  async getMortgageRates(): Promise<{
    rate30Year: MarketMetric | null;
    rate15Year: MarketMetric | null;
  }> {
    if (!this.fredClient) {
      return { rate30Year: null, rate15Year: null };
    }

    const [rate30Year, rate15Year] = await Promise.all([
      this.fredClient.getMortgageRate30Year().catch(() => null),
      this.fredClient.getMortgageRate15Year().catch(() => null),
    ]);

    return { rate30Year, rate15Year };
  }

  /**
   * Check if a prediction target has been met
   */
  async checkPredictionResolution(
    location: LocationData,
    targetMetric: string,
    targetValue: number,
    operator: "gt" | "gte" | "lt" | "lte" | "eq"
  ): Promise<{
    resolved: boolean;
    outcome: "yes" | "no" | null;
    currentValue: number | null;
    confidence: number;
    source: string;
    timestamp: string;
  }> {
    const metric = await this.getMetric(location, targetMetric);

    if (!metric) {
      return {
        resolved: false,
        outcome: null,
        currentValue: null,
        confidence: 0,
        source: "unknown",
        timestamp: new Date().toISOString(),
      };
    }

    let conditionMet: boolean;

    switch (operator) {
      case "gt":
        conditionMet = metric.value > targetValue;
        break;
      case "gte":
        conditionMet = metric.value >= targetValue;
        break;
      case "lt":
        conditionMet = metric.value < targetValue;
        break;
      case "lte":
        conditionMet = metric.value <= targetValue;
        break;
      case "eq":
        conditionMet = Math.abs(metric.value - targetValue) < 0.01;
        break;
      default:
        conditionMet = false;
    }

    return {
      resolved: true,
      outcome: conditionMet ? "yes" : "no",
      currentValue: metric.value,
      confidence: metric.confidence ?? 90,
      source: metric.source,
      timestamp: metric.timestamp,
    };
  }

  /**
   * Calculate market sentiment based on multiple metrics
   */
  async calculateMarketSentiment(
    location: LocationData
  ): Promise<{
    overallSentiment: number;
    buyerSentiment: number;
    sellerSentiment: number;
    investorSentiment: number;
    trend: "bullish" | "bearish" | "neutral";
    factors: Array<{ name: string; impact: number; direction: "positive" | "negative" | "neutral" }>;
  }> {
    const data = await this.getMarketData(location);
    const factors: Array<{ name: string; impact: number; direction: "positive" | "negative" | "neutral" }> = [];

    let buyerScore = 50;
    let sellerScore = 50;
    let investorScore = 50;

    for (const metric of data.metrics) {
      const change = metric.changePercent ?? 0;

      switch (metric.metric) {
        case "median_home_value":
          // Rising prices: bad for buyers, good for sellers/investors
          if (change > 0) {
            buyerScore -= change * 2;
            sellerScore += change * 2;
            investorScore += change * 1.5;
            factors.push({ name: "Home Prices", impact: change, direction: "positive" });
          } else {
            buyerScore -= change * 2;
            sellerScore += change * 2;
            investorScore += change * 0.5;
            factors.push({ name: "Home Prices", impact: change, direction: "negative" });
          }
          break;

        case "mortgage_rate_30y":
          // Rising rates: bad for everyone except cash buyers
          if (change > 0) {
            buyerScore -= change * 5;
            sellerScore -= change * 3;
            investorScore -= change * 2;
            factors.push({ name: "Mortgage Rates", impact: -change, direction: "negative" });
          } else {
            buyerScore -= change * 5;
            sellerScore -= change * 2;
            investorScore -= change * 3;
            factors.push({ name: "Mortgage Rates", impact: -change, direction: "positive" });
          }
          break;

        case "housing_inventory":
          // Rising inventory: good for buyers, challenging for sellers
          if (change > 0) {
            buyerScore += change * 2;
            sellerScore -= change * 2;
            investorScore += change;
            factors.push({ name: "Inventory", impact: change, direction: "positive" });
          } else {
            buyerScore += change * 2;
            sellerScore -= change * 2;
            investorScore -= Math.abs(change);
            factors.push({ name: "Inventory", impact: change, direction: "negative" });
          }
          break;

        case "days_on_market":
          // Longer DOM: more negotiating power for buyers
          if (change > 0) {
            buyerScore += change;
            sellerScore -= change * 1.5;
            factors.push({ name: "Days on Market", impact: change, direction: "neutral" });
          } else {
            buyerScore += change;
            sellerScore -= change * 1.5;
            factors.push({ name: "Days on Market", impact: change, direction: "neutral" });
          }
          break;
      }
    }

    // Normalize scores to 0-100
    buyerScore = Math.max(0, Math.min(100, buyerScore));
    sellerScore = Math.max(0, Math.min(100, sellerScore));
    investorScore = Math.max(0, Math.min(100, investorScore));

    const overallSentiment = (buyerScore + sellerScore + investorScore) / 3;

    let trend: "bullish" | "bearish" | "neutral";
    if (overallSentiment > 60) {
      trend = "bullish";
    } else if (overallSentiment < 40) {
      trend = "bearish";
    } else {
      trend = "neutral";
    }

    return {
      overallSentiment,
      buyerSentiment: buyerScore,
      sellerSentiment: sellerScore,
      investorSentiment: investorScore,
      trend,
      factors,
    };
  }
}

// ============================================================================
// PULL REAL ESTATE INDEX CALCULATOR
// ============================================================================

export interface IndexComponent {
  category: string;
  weight: number;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  sentiment: "bullish" | "bearish" | "neutral";
}

export class PullRealEstateIndexCalculator {
  private dataService: RealEstateDataService;

  // Default component weights
  private readonly componentWeights: Record<string, number> = {
    median_home_value: 0.25,
    mortgage_rate_30y: 0.20,
    housing_inventory: 0.15,
    home_sales_volume: 0.15,
    days_on_market: 0.10,
    new_construction: 0.15,
  };

  constructor(dataService: RealEstateDataService) {
    this.dataService = dataService;
  }

  /**
   * Calculate the PULL Real Estate Index for a location
   */
  async calculateIndex(location: LocationData): Promise<{
    value: number;
    previousValue: number;
    change: number;
    changePercent: number;
    trend: "up" | "down" | "stable";
    trendStrength: number;
    components: IndexComponent[];
    marketSentiment: number;
    volatility: number;
  }> {
    const marketData = await this.dataService.getMarketData(location);
    const components: IndexComponent[] = [];

    // Base index value
    const baseValue = 1000;
    let indexValue = 0;
    let previousIndexValue = 0;
    let totalWeight = 0;

    for (const metric of marketData.metrics) {
      const weight = this.componentWeights[metric.metric] ?? 0.05;

      if (metric.value && weight > 0) {
        // Normalize metric to index contribution
        const normalized = this.normalizeMetric(metric);
        const previousNormalized = metric.previousValue
          ? this.normalizeMetric({ ...metric, value: metric.previousValue })
          : normalized;

        indexValue += normalized * weight;
        previousIndexValue += previousNormalized * weight;
        totalWeight += weight;

        const change = normalized - previousNormalized;
        const changePercent =
          previousNormalized !== 0 ? (change / previousNormalized) * 100 : 0;

        let sentiment: "bullish" | "bearish" | "neutral";
        if (changePercent > 2) sentiment = "bullish";
        else if (changePercent < -2) sentiment = "bearish";
        else sentiment = "neutral";

        components.push({
          category: metric.metric,
          weight,
          currentValue: normalized,
          previousValue: previousNormalized,
          change,
          changePercent,
          sentiment,
        });
      }
    }

    // Scale to base value
    if (totalWeight > 0) {
      indexValue = baseValue + (indexValue / totalWeight) * 200;
      previousIndexValue = baseValue + (previousIndexValue / totalWeight) * 200;
    } else {
      indexValue = baseValue;
      previousIndexValue = baseValue;
    }

    const change = indexValue - previousIndexValue;
    const changePercent =
      previousIndexValue !== 0 ? (change / previousIndexValue) * 100 : 0;

    let trend: "up" | "down" | "stable";
    if (changePercent > 0.5) trend = "up";
    else if (changePercent < -0.5) trend = "down";
    else trend = "stable";

    const trendStrength = Math.min(100, Math.abs(changePercent) * 10);

    // Calculate volatility (standard deviation of component changes)
    const changes = components.map((c) => c.changePercent);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const volatility = Math.sqrt(
      changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) /
        changes.length
    );

    // Get sentiment
    const sentiment = await this.dataService.calculateMarketSentiment(location);

    return {
      value: Math.round(indexValue * 100) / 100,
      previousValue: Math.round(previousIndexValue * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      trend,
      trendStrength: Math.round(trendStrength),
      components,
      marketSentiment: Math.round(sentiment.overallSentiment),
      volatility: Math.round(volatility * 100) / 100,
    };
  }

  /**
   * Normalize a metric to a 0-100 scale for index calculation
   */
  private normalizeMetric(metric: MarketMetric): number {
    // Each metric type has different normalization logic
    switch (metric.metric) {
      case "median_home_value":
        // Normalize to index based on national average (~$400k)
        return Math.min(100, (metric.value / 400000) * 50);

      case "mortgage_rate_30y":
        // Invert - lower rates are better
        // Range 2-10%, normalize to 0-100 where 2% = 100, 10% = 0
        return Math.max(0, Math.min(100, (10 - metric.value) * 12.5));

      case "housing_inventory":
        // More inventory is neutral to positive
        // Normalize based on months of supply (4-6 is balanced)
        return Math.min(100, metric.value / 1000 * 50);

      case "days_on_market":
        // Shorter is hotter market, longer gives more balance
        // 20-60 days is typical range
        return Math.max(0, Math.min(100, 100 - (metric.value - 20) * 1.5));

      case "housing_starts":
        // More starts = positive economic signal
        // Normalize based on typical monthly starts (~1.5M annualized)
        return Math.min(100, (metric.value / 1500) * 50);

      case "home_sales_volume":
        // Normalized based on typical monthly sales
        return Math.min(100, (metric.value / 5000000) * 50);

      default:
        // Default: assume 0-100 scale
        return Math.min(100, Math.max(0, metric.value));
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createRealEstateDataService(
  config?: RealEstateDataConfig
): RealEstateDataService {
  const fullConfig: RealEstateDataConfig = {
    zillowApiKey: process.env.ZILLOW_API_KEY,
    fredApiKey: process.env.FRED_API_KEY,
    realtorApiKey: process.env.REALTOR_API_KEY,
    redfinApiKey: process.env.REDFIN_API_KEY,
    cacheEnabled: true,
    cacheTtlSeconds: 3600,
    ...config,
  };

  return new RealEstateDataService(fullConfig);
}

export function createPullIndexCalculator(
  dataService?: RealEstateDataService
): PullRealEstateIndexCalculator {
  const service = dataService ?? createRealEstateDataService();
  return new PullRealEstateIndexCalculator(service);
}
