/**
 * Cross-Asset Correlation Analysis Service
 *
 * Analyzes:
 * - Pokemon prices vs crypto
 * - Prediction markets vs stock moves
 * - Weather markets vs travel bookings
 * - Sports betting vs prediction markets
 * - Market regime detection
 */

import type {
  AssetCorrelation,
  MarketRegime,
  AlternativeDataCorrelation,
  CorrelationStrength,
  MarketRegimeType,
} from "./types";

// ============================================================================
// Statistical Utilities
// ============================================================================

export class StatisticalUtils {
  /**
   * Calculate Pearson correlation coefficient
   */
  static pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    return denominator !== 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate standard deviation
   */
  static standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate simple moving average
   */
  static sma(values: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
  }

  /**
   * Calculate returns from prices
   */
  static calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calculate rolling correlation
   */
  static rollingCorrelation(
    x: number[],
    y: number[],
    window: number
  ): number[] {
    const result: number[] = [];
    for (let i = window - 1; i < x.length; i++) {
      const xSlice = x.slice(i - window + 1, i + 1);
      const ySlice = y.slice(i - window + 1, i + 1);
      result.push(this.pearsonCorrelation(xSlice, ySlice));
    }
    return result;
  }

  /**
   * Calculate p-value for correlation (approximation)
   */
  static correlationPValue(r: number, n: number): number {
    if (n < 3) return 1;
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Simplified t-distribution approximation
    const df = n - 2;
    const x = df / (df + t * t);
    // Using approximation for incomplete beta function
    return Math.exp(-0.5 * Math.abs(t));
  }

  /**
   * Find optimal lag between two series
   */
  static findOptimalLag(
    leader: number[],
    follower: number[],
    maxLag: number
  ): { lag: number; correlation: number } {
    let bestLag = 0;
    let bestCorrelation = 0;

    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let x: number[];
      let y: number[];

      if (lag >= 0) {
        x = leader.slice(0, leader.length - lag);
        y = follower.slice(lag);
      } else {
        x = leader.slice(-lag);
        y = follower.slice(0, follower.length + lag);
      }

      const corr = Math.abs(this.pearsonCorrelation(x, y));
      if (corr > bestCorrelation) {
        bestCorrelation = corr;
        bestLag = lag;
      }
    }

    return { lag: bestLag, correlation: bestCorrelation };
  }
}

// ============================================================================
// Cross-Asset Correlation Analyzer
// ============================================================================

export class CrossAssetCorrelationAnalyzer {
  /**
   * Calculate correlation between two assets
   */
  calculateCorrelation(
    asset1: {
      assetClass: string;
      symbol: string;
      prices: Array<{ timestamp: number; price: number }>;
    },
    asset2: {
      assetClass: string;
      symbol: string;
      prices: Array<{ timestamp: number; price: number }>;
    },
    windowDays: number = 30
  ): AssetCorrelation {
    // Align timestamps
    const { aligned1, aligned2 } = this.alignTimeSeries(
      asset1.prices,
      asset2.prices
    );

    if (aligned1.length < 10) {
      return this.createEmptyCorrelation(asset1, asset2);
    }

    // Calculate returns
    const returns1 = StatisticalUtils.calculateReturns(aligned1);
    const returns2 = StatisticalUtils.calculateReturns(aligned2);

    // Calculate correlation
    const correlation = StatisticalUtils.pearsonCorrelation(returns1, returns2);
    const pValue = StatisticalUtils.correlationPValue(
      correlation,
      returns1.length
    );

    // Find optimal lag
    const lagAnalysis = StatisticalUtils.findOptimalLag(returns1, returns2, 24);

    // Calculate rolling correlations
    const rolling30d = this.calculateRollingCorrelation(returns1, returns2, 30);
    const rolling90d = this.calculateRollingCorrelation(returns1, returns2, 90);

    // Determine trend
    const correlationTrend = this.determineCorrelationTrend(
      rolling30d,
      rolling90d
    );

    // Calculate standard error
    const standardError = Math.sqrt((1 - correlation * correlation) / (returns1.length - 2));

    return {
      asset1Class: asset1.assetClass,
      asset1Symbol: asset1.symbol,
      asset2Class: asset2.assetClass,
      asset2Symbol: asset2.symbol,
      correlation,
      correlationStrength: this.categorizeCorrelationStrength(correlation),
      pValue,
      sampleSize: returns1.length,
      standardError,
      confidenceInterval: {
        lower: correlation - 1.96 * standardError,
        upper: correlation + 1.96 * standardError,
      },
      optimalLagHours: lagAnalysis.lag,
      leaderAsset:
        lagAnalysis.lag > 0
          ? asset1.symbol
          : lagAnalysis.lag < 0
          ? asset2.symbol
          : undefined,
      lagCorrelation: lagAnalysis.correlation,
      rollingCorrelation30d: rolling30d,
      rollingCorrelation90d: rolling90d,
      correlationTrend,
    };
  }

  /**
   * Align two time series by timestamp
   */
  private alignTimeSeries(
    series1: Array<{ timestamp: number; price: number }>,
    series2: Array<{ timestamp: number; price: number }>
  ): { aligned1: number[]; aligned2: number[] } {
    const map2 = new Map(series2.map((p) => [p.timestamp, p.price]));
    const aligned1: number[] = [];
    const aligned2: number[] = [];

    for (const point of series1) {
      const price2 = map2.get(point.timestamp);
      if (price2 !== undefined) {
        aligned1.push(point.price);
        aligned2.push(price2);
      }
    }

    return { aligned1, aligned2 };
  }

  /**
   * Calculate rolling correlation average
   */
  private calculateRollingCorrelation(
    returns1: number[],
    returns2: number[],
    window: number
  ): number {
    if (returns1.length < window) return 0;

    const rolling = StatisticalUtils.rollingCorrelation(
      returns1,
      returns2,
      window
    );
    return rolling.length > 0
      ? rolling.reduce((a, b) => a + b, 0) / rolling.length
      : 0;
  }

  /**
   * Determine if correlation is strengthening or weakening
   */
  private determineCorrelationTrend(
    rolling30d: number,
    rolling90d: number
  ): "strengthening" | "stable" | "weakening" {
    const diff = Math.abs(rolling30d) - Math.abs(rolling90d);
    if (diff > 0.1) return "strengthening";
    if (diff < -0.1) return "weakening";
    return "stable";
  }

  /**
   * Categorize correlation strength
   */
  private categorizeCorrelationStrength(correlation: number): CorrelationStrength {
    const absCorr = Math.abs(correlation);
    const isNegative = correlation < 0;

    if (absCorr < 0.1) return "none";
    if (absCorr < 0.3)
      return isNegative ? "weak_negative" : "weak_positive";
    if (absCorr < 0.7)
      return isNegative ? "moderate_negative" : "moderate_positive";
    return isNegative ? "strong_negative" : "strong_positive";
  }

  /**
   * Create empty correlation for insufficient data
   */
  private createEmptyCorrelation(
    asset1: { assetClass: string; symbol: string },
    asset2: { assetClass: string; symbol: string }
  ): AssetCorrelation {
    return {
      asset1Class: asset1.assetClass,
      asset1Symbol: asset1.symbol,
      asset2Class: asset2.assetClass,
      asset2Symbol: asset2.symbol,
      correlation: 0,
      correlationStrength: "none",
      pValue: 1,
      sampleSize: 0,
      standardError: 0,
      confidenceInterval: { lower: -1, upper: 1 },
      optimalLagHours: 0,
      rollingCorrelation30d: 0,
      rollingCorrelation90d: 0,
      correlationTrend: "stable",
    };
  }

  /**
   * Find all significant correlations in a universe of assets
   */
  findSignificantCorrelations(
    assets: Array<{
      assetClass: string;
      symbol: string;
      prices: Array<{ timestamp: number; price: number }>;
    }>,
    minCorrelation: number = 0.3,
    maxPValue: number = 0.05
  ): AssetCorrelation[] {
    const correlations: AssetCorrelation[] = [];

    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const corr = this.calculateCorrelation(assets[i], assets[j]);

        if (
          Math.abs(corr.correlation) >= minCorrelation &&
          corr.pValue <= maxPValue
        ) {
          correlations.push(corr);
        }
      }
    }

    return correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
    );
  }
}

// ============================================================================
// Market Regime Detection
// ============================================================================

export class MarketRegimeDetector {
  /**
   * Detect current market regime
   */
  detectRegime(
    assetClass: string,
    symbol: string | undefined,
    priceData: Array<{ timestamp: number; price: number }>,
    lookbackDays: number = 90
  ): MarketRegime {
    if (priceData.length < 20) {
      return this.createDefaultRegime(assetClass, symbol);
    }

    const prices = priceData.map((p) => p.price);
    const returns = StatisticalUtils.calculateReturns(prices);

    // Calculate trend
    const { direction, strength } = this.calculateTrend(prices);

    // Calculate volatility
    const volatility = StatisticalUtils.standardDeviation(returns);
    const historicalVols = this.calculateHistoricalVolatility(returns, 20);
    const volatilityPercentile = this.calculatePercentile(
      volatility,
      historicalVols
    );

    // Determine regime
    const regime = this.classifyRegime(
      direction,
      strength,
      volatilityPercentile
    );

    // Calculate transition probabilities (simplified Markov model)
    const transitionProbs = this.calculateTransitionProbabilities(
      returns,
      volatilityPercentile
    );

    return {
      assetClass,
      symbol,
      regime,
      trendDirection: direction,
      trendStrength: strength,
      volatilityLevel: volatility,
      volatilityPercentile,
      transitionProbabilities: transitionProbs,
      regimeStartedAt: this.findRegimeStartTime(priceData, regime),
      confidence: Math.min(priceData.length / 100, 1),
      calculatedAt: Date.now(),
    };
  }

  /**
   * Calculate trend direction and strength
   */
  private calculateTrend(
    prices: number[]
  ): { direction: "up" | "down" | "sideways"; strength: number } {
    if (prices.length < 2) {
      return { direction: "sideways", strength: 0 };
    }

    // Use linear regression slope
    const n = prices.length;
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (prices[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Normalize slope by price level
    const normalizedSlope = (slope / yMean) * 100;

    let direction: "up" | "down" | "sideways";
    if (normalizedSlope > 0.1) {
      direction = "up";
    } else if (normalizedSlope < -0.1) {
      direction = "down";
    } else {
      direction = "sideways";
    }

    // Strength is R-squared
    const yPredicted = prices.map((_, i) => yMean + slope * (i - xMean));
    const ssRes = prices.reduce(
      (sum, y, i) => sum + Math.pow(y - yPredicted[i], 2),
      0
    );
    const ssTot = prices.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

    return { direction, strength: Math.max(0, Math.min(rSquared, 1)) };
  }

  /**
   * Calculate historical volatility series
   */
  private calculateHistoricalVolatility(
    returns: number[],
    window: number
  ): number[] {
    const vols: number[] = [];
    for (let i = window; i < returns.length; i++) {
      const slice = returns.slice(i - window, i);
      vols.push(StatisticalUtils.standardDeviation(slice));
    }
    return vols;
  }

  /**
   * Calculate percentile of a value in a distribution
   */
  private calculatePercentile(value: number, distribution: number[]): number {
    if (distribution.length === 0) return 50;
    const sorted = [...distribution].sort((a, b) => a - b);
    const rank = sorted.filter((v) => v <= value).length;
    return (rank / sorted.length) * 100;
  }

  /**
   * Classify market regime based on trend and volatility
   */
  private classifyRegime(
    direction: "up" | "down" | "sideways",
    strength: number,
    volatilityPercentile: number
  ): MarketRegimeType {
    const isHighVol = volatilityPercentile > 70;
    const isLowVol = volatilityPercentile < 30;

    // Crisis detection (high vol + down trend + strong trend)
    if (direction === "down" && strength > 0.5 && isHighVol) {
      return "crisis";
    }

    // Recovery (up trend after crisis)
    if (direction === "up" && strength > 0.3 && isHighVol) {
      return "recovery";
    }

    // Standard regimes
    if (direction === "up") {
      return isHighVol ? "bull_high_vol" : "bull_low_vol";
    } else if (direction === "down") {
      return isHighVol ? "bear_high_vol" : "bear_low_vol";
    } else {
      return isHighVol ? "sideways_high_vol" : "sideways_low_vol";
    }
  }

  /**
   * Calculate regime transition probabilities
   */
  private calculateTransitionProbabilities(
    returns: number[],
    currentVolPercentile: number
  ): MarketRegime["transitionProbabilities"] {
    // Simplified transition probabilities based on mean reversion
    const baseProb = 1 / 6; // Equal probability

    // Adjust based on current state
    const volFactor = currentVolPercentile / 100;

    return {
      bull_low_vol: baseProb * (1 - volFactor * 0.5),
      bull_high_vol: baseProb * (1 + volFactor * 0.3),
      bear_low_vol: baseProb * (1 - volFactor * 0.5),
      bear_high_vol: baseProb * (1 + volFactor * 0.3),
      sideways_low_vol: baseProb * 1.2,
      sideways_high_vol: baseProb * 0.8,
    };
  }

  /**
   * Find when the current regime started
   */
  private findRegimeStartTime(
    priceData: Array<{ timestamp: number; price: number }>,
    currentRegime: MarketRegimeType
  ): number {
    // Simplified: return timestamp from 20% into the data
    const idx = Math.floor(priceData.length * 0.2);
    return priceData[idx]?.timestamp || Date.now();
  }

  /**
   * Create default regime for insufficient data
   */
  private createDefaultRegime(
    assetClass: string,
    symbol?: string
  ): MarketRegime {
    return {
      assetClass,
      symbol,
      regime: "sideways_low_vol",
      trendDirection: "sideways",
      trendStrength: 0,
      volatilityLevel: 0,
      volatilityPercentile: 50,
      transitionProbabilities: {
        bull_low_vol: 1 / 6,
        bull_high_vol: 1 / 6,
        bear_low_vol: 1 / 6,
        bear_high_vol: 1 / 6,
        sideways_low_vol: 1 / 6,
        sideways_high_vol: 1 / 6,
      },
      regimeStartedAt: Date.now(),
      confidence: 0,
      calculatedAt: Date.now(),
    };
  }
}

// ============================================================================
// Alternative Data Correlation Analyzer
// ============================================================================

export class AlternativeDataCorrelationAnalyzer {
  /**
   * Analyze correlation between alternative data and market prices
   */
  analyzeAlternativeCorrelation(
    alternativeData: {
      dataType: AlternativeDataCorrelation["alternativeDataType"];
      metric: string;
      values: Array<{ timestamp: number; value: number }>;
    },
    marketData: {
      assetClass: string;
      symbol: string;
      prices: Array<{ timestamp: number; price: number }>;
    },
    maxLagDays: number = 14
  ): AlternativeDataCorrelation {
    // Align data by day
    const altByDay = this.aggregateByDay(alternativeData.values);
    const priceByDay = this.aggregateByDay(
      marketData.prices.map((p) => ({ timestamp: p.timestamp, value: p.price }))
    );

    // Find common days
    const commonDays = [...altByDay.keys()].filter((day) =>
      priceByDay.has(day)
    );

    if (commonDays.length < 14) {
      return this.createEmptyAltCorrelation(alternativeData, marketData);
    }

    // Sort days and get aligned values
    commonDays.sort((a, b) => a - b);
    const altValues = commonDays.map((day) => altByDay.get(day)!);
    const priceValues = commonDays.map((day) => priceByDay.get(day)!);

    // Calculate returns for prices
    const priceReturns = StatisticalUtils.calculateReturns(priceValues);
    const altChanges = StatisticalUtils.calculateReturns(altValues);

    // Find optimal lag
    const lagAnalysis = StatisticalUtils.findOptimalLag(
      altChanges,
      priceReturns,
      maxLagDays
    );

    // Calculate predictive power (R-squared from simple regression)
    const predictivePower = this.calculatePredictivePower(
      altChanges,
      priceReturns,
      lagAnalysis.lag
    );

    // Calculate correlation with optimal lag
    const correlation = lagAnalysis.correlation;
    const pValue = StatisticalUtils.correlationPValue(
      correlation,
      commonDays.length
    );

    return {
      alternativeDataType: alternativeData.dataType,
      alternativeMetric: alternativeData.metric,
      assetClass: marketData.assetClass,
      symbol: marketData.symbol,
      correlation,
      lagDays: lagAnalysis.lag,
      predictivePower,
      sampleSize: commonDays.length,
      pValue,
      isStatisticallySignificant: pValue < 0.05,
      discoveredAt: Date.now(),
      lastValidatedAt: Date.now(),
    };
  }

  /**
   * Aggregate values by day
   */
  private aggregateByDay(
    values: Array<{ timestamp: number; value: number }>
  ): Map<number, number> {
    const byDay = new Map<number, { sum: number; count: number }>();

    for (const { timestamp, value } of values) {
      const day = Math.floor(timestamp / (24 * 60 * 60 * 1000));
      const existing = byDay.get(day) || { sum: 0, count: 0 };
      existing.sum += value;
      existing.count++;
      byDay.set(day, existing);
    }

    const result = new Map<number, number>();
    for (const [day, { sum, count }] of byDay) {
      result.set(day, sum / count);
    }

    return result;
  }

  /**
   * Calculate predictive power (simplified R-squared)
   */
  private calculatePredictivePower(
    predictor: number[],
    target: number[],
    lag: number
  ): number {
    let x: number[];
    let y: number[];

    if (lag >= 0) {
      x = predictor.slice(0, predictor.length - lag);
      y = target.slice(lag);
    } else {
      x = predictor.slice(-lag);
      y = target.slice(0, target.length + lag);
    }

    const correlation = StatisticalUtils.pearsonCorrelation(x, y);
    return correlation * correlation; // R-squared
  }

  /**
   * Create empty correlation result
   */
  private createEmptyAltCorrelation(
    alternativeData: {
      dataType: AlternativeDataCorrelation["alternativeDataType"];
      metric: string;
    },
    marketData: { assetClass: string; symbol: string }
  ): AlternativeDataCorrelation {
    return {
      alternativeDataType: alternativeData.dataType,
      alternativeMetric: alternativeData.metric,
      assetClass: marketData.assetClass,
      symbol: marketData.symbol,
      correlation: 0,
      lagDays: 0,
      predictivePower: 0,
      sampleSize: 0,
      pValue: 1,
      isStatisticallySignificant: false,
      discoveredAt: Date.now(),
      lastValidatedAt: Date.now(),
    };
  }

  /**
   * Discover unexpected correlations in alternative data
   */
  discoverCorrelations(
    alternativeDataSets: Array<{
      dataType: AlternativeDataCorrelation["alternativeDataType"];
      metric: string;
      values: Array<{ timestamp: number; value: number }>;
    }>,
    marketAssets: Array<{
      assetClass: string;
      symbol: string;
      prices: Array<{ timestamp: number; price: number }>;
    }>,
    minPredictivePower: number = 0.1
  ): AlternativeDataCorrelation[] {
    const discoveries: AlternativeDataCorrelation[] = [];

    for (const altData of alternativeDataSets) {
      for (const market of marketAssets) {
        const correlation = this.analyzeAlternativeCorrelation(altData, market);

        if (
          correlation.isStatisticallySignificant &&
          correlation.predictivePower >= minPredictivePower
        ) {
          discoveries.push(correlation);
        }
      }
    }

    return discoveries.sort((a, b) => b.predictivePower - a.predictivePower);
  }
}

// ============================================================================
// Export singleton instances
// ============================================================================

export const statisticalUtils = StatisticalUtils;
export const crossAssetCorrelationAnalyzer = new CrossAssetCorrelationAnalyzer();
export const marketRegimeDetector = new MarketRegimeDetector();
export const alternativeDataCorrelationAnalyzer = new AlternativeDataCorrelationAnalyzer();
