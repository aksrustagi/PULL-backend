/**
 * Signal Generation Service
 *
 * Generates tradeable signals from:
 * - Community conviction
 * - Social sentiment
 * - Cross-asset correlations
 * - Alternative data
 * - Trader flow analysis
 */

import type {
  AnonymizedSignal,
  CommunityConvictionSignal,
  ChatSentiment,
  AssetCorrelation,
  AlternativeDataCorrelation,
  TraderAlpha,
} from "./types";

// ============================================================================
// Signal Configuration
// ============================================================================

export interface SignalConfig {
  minConfidence: number;
  minParticipants: number;
  minHistoricalAccuracy: number;
  signalCooldownMs: number;
}

const DEFAULT_CONFIG: SignalConfig = {
  minConfidence: 0.6,
  minParticipants: 10,
  minHistoricalAccuracy: 0.55,
  signalCooldownMs: 60 * 60 * 1000, // 1 hour
};

// ============================================================================
// Community Conviction Signal Generator
// ============================================================================

export class CommunityConvictionSignalGenerator {
  private config: SignalConfig;
  private lastSignals: Map<string, number> = new Map();

  constructor(config: Partial<SignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate signal from community conviction data
   */
  generateSignal(
    conviction: CommunityConvictionSignal,
    historicalAccuracy?: number
  ): AnonymizedSignal | null {
    // Check minimum requirements
    if (conviction.totalParticipants < this.config.minParticipants) {
      return null;
    }

    // Check cooldown
    const assetKey = `${conviction.assetClass}:${conviction.symbol}`;
    const lastSignal = this.lastSignals.get(assetKey);
    if (lastSignal && Date.now() - lastSignal < this.config.signalCooldownMs) {
      return null;
    }

    // Calculate confidence
    const convictionStrength = Math.abs(conviction.overallConviction) / 100;
    const participantFactor = Math.min(conviction.totalParticipants / 100, 1);
    const confidence = (convictionStrength * 0.6 + participantFactor * 0.4);

    if (confidence < this.config.minConfidence) {
      return null;
    }

    // Determine direction
    let direction: "bullish" | "bearish" | "neutral";
    if (conviction.overallConviction > 30) {
      direction = "bullish";
    } else if (conviction.overallConviction < -30) {
      direction = "bearish";
    } else {
      direction = "neutral";
    }

    // Skip neutral signals
    if (direction === "neutral") {
      return null;
    }

    // Calculate strength (0-100)
    const strength = Math.min(Math.abs(conviction.overallConviction), 100);

    // Record signal time
    this.lastSignals.set(assetKey, Date.now());

    return {
      signalId: `conv_${assetKey}_${Date.now()}`,
      signalType: "community_conviction",
      assetClass: conviction.assetClass,
      symbol: conviction.symbol,
      direction,
      strength,
      confidence,
      participantCount: conviction.totalParticipants,
      consensusLevel: convictionStrength,
      historicalAccuracy,
    };
  }

  /**
   * Generate contrarian signal from extreme sentiment
   */
  generateContrarianSignal(
    conviction: CommunityConvictionSignal,
    extremeThreshold: number = 80
  ): AnonymizedSignal | null {
    // Only generate contrarian signals at extremes
    if (Math.abs(conviction.overallConviction) < extremeThreshold) {
      return null;
    }

    // Flip direction for contrarian play
    const direction: "bullish" | "bearish" =
      conviction.overallConviction > 0 ? "bearish" : "bullish";

    const strength = Math.abs(conviction.overallConviction);
    const confidence = Math.min(
      (strength - extremeThreshold) / (100 - extremeThreshold),
      1
    ) * 0.8; // Cap contrarian confidence at 80%

    return {
      signalId: `contrarian_${conviction.assetClass}_${conviction.symbol}_${Date.now()}`,
      signalType: "contrarian_extreme",
      assetClass: conviction.assetClass,
      symbol: conviction.symbol,
      direction,
      strength: 100 - strength, // Inverse strength
      confidence,
      participantCount: conviction.totalParticipants,
      consensusLevel: strength / 100,
      historicalAccuracy: undefined, // Contrarian signals have different accuracy profile
    };
  }
}

// ============================================================================
// Sentiment Signal Generator
// ============================================================================

export class SentimentSignalGenerator {
  private config: SignalConfig;

  constructor(config: Partial<SignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate signal from chat sentiment data
   */
  generateSignal(
    sentiment: ChatSentiment,
    associatedAsset?: { assetClass: string; symbol: string }
  ): AnonymizedSignal | null {
    if (!associatedAsset) return null;

    // Check minimum participants
    if (sentiment.uniqueParticipants < this.config.minParticipants) {
      return null;
    }

    // Calculate signal metrics
    const sentimentStrength = Math.abs(sentiment.sentimentScore);
    const confidence =
      (sentimentStrength * 0.5 +
        (sentiment.convictionScore / 100) * 0.3 +
        Math.min(sentiment.uniqueParticipants / 50, 1) * 0.2);

    if (confidence < this.config.minConfidence) {
      return null;
    }

    // Determine direction
    let direction: "bullish" | "bearish" | "neutral";
    if (sentiment.sentimentScore > 0.3) {
      direction = "bullish";
    } else if (sentiment.sentimentScore < -0.3) {
      direction = "bearish";
    } else {
      return null; // Skip neutral
    }

    return {
      signalId: `sent_${sentiment.roomId}_${Date.now()}`,
      signalType: "chat_sentiment",
      assetClass: associatedAsset.assetClass,
      symbol: associatedAsset.symbol,
      direction,
      strength: sentimentStrength * 100,
      confidence,
      participantCount: sentiment.uniqueParticipants,
      consensusLevel: sentiment.convictionScore / 100,
    };
  }

  /**
   * Aggregate multiple sentiment sources into a single signal
   */
  aggregateSentimentSignals(
    signals: AnonymizedSignal[]
  ): AnonymizedSignal | null {
    if (signals.length === 0) return null;

    // Group by asset
    const byAsset = new Map<string, AnonymizedSignal[]>();
    for (const signal of signals) {
      const key = `${signal.assetClass}:${signal.symbol}`;
      if (!byAsset.has(key)) {
        byAsset.set(key, []);
      }
      byAsset.get(key)!.push(signal);
    }

    // Generate aggregated signals
    const aggregated: AnonymizedSignal[] = [];

    for (const [key, assetSignals] of byAsset) {
      const [assetClass, symbol] = key.split(":");

      // Calculate weighted direction
      let bullishWeight = 0;
      let bearishWeight = 0;
      let totalParticipants = 0;
      let totalConfidence = 0;

      for (const signal of assetSignals) {
        const weight = signal.confidence * signal.strength;
        if (signal.direction === "bullish") {
          bullishWeight += weight;
        } else if (signal.direction === "bearish") {
          bearishWeight += weight;
        }
        totalParticipants += signal.participantCount;
        totalConfidence += signal.confidence;
      }

      const netWeight = bullishWeight - bearishWeight;
      const totalWeight = bullishWeight + bearishWeight;

      if (totalWeight === 0) continue;

      const direction: "bullish" | "bearish" | "neutral" =
        netWeight > totalWeight * 0.2
          ? "bullish"
          : netWeight < -totalWeight * 0.2
          ? "bearish"
          : "neutral";

      if (direction === "neutral") continue;

      aggregated.push({
        signalId: `agg_${key}_${Date.now()}`,
        signalType: "aggregated_sentiment",
        assetClass,
        symbol,
        direction,
        strength: (Math.abs(netWeight) / totalWeight) * 100,
        confidence: totalConfidence / assetSignals.length,
        participantCount: totalParticipants,
        consensusLevel: Math.abs(netWeight) / totalWeight,
      });
    }

    return aggregated.length > 0 ? aggregated[0] : null;
  }
}

// ============================================================================
// Correlation Signal Generator
// ============================================================================

export class CorrelationSignalGenerator {
  private config: SignalConfig;

  constructor(config: Partial<SignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate signal from cross-asset correlation
   */
  generateCorrelationSignal(
    correlation: AssetCorrelation,
    leaderPriceChange: number // % change in leader asset
  ): AnonymizedSignal | null {
    // Only use strong correlations
    if (
      Math.abs(correlation.correlation) < 0.5 ||
      correlation.pValue > 0.05
    ) {
      return null;
    }

    // Determine expected direction based on correlation
    const expectedDirection =
      correlation.correlation > 0
        ? leaderPriceChange > 0
          ? "bullish"
          : "bearish"
        : leaderPriceChange > 0
        ? "bearish"
        : "bullish";

    // Skip small moves
    if (Math.abs(leaderPriceChange) < 2) {
      return null;
    }

    // Calculate confidence
    const correlationStrength = Math.abs(correlation.correlation);
    const moveStrength = Math.min(Math.abs(leaderPriceChange) / 10, 1);
    const confidence = correlationStrength * 0.7 + moveStrength * 0.3;

    if (confidence < this.config.minConfidence) {
      return null;
    }

    return {
      signalId: `corr_${correlation.asset2Symbol}_${Date.now()}`,
      signalType: "cross_asset_correlation",
      assetClass: correlation.asset2Class,
      symbol: correlation.asset2Symbol,
      direction: expectedDirection as "bullish" | "bearish",
      strength: Math.abs(leaderPriceChange) * correlationStrength,
      confidence,
      participantCount: 0, // N/A for correlation signals
      consensusLevel: correlationStrength,
    };
  }

  /**
   * Generate signal from alternative data correlation
   */
  generateAlternativeDataSignal(
    correlation: AlternativeDataCorrelation,
    alternativeDataChange: number // % change in alternative metric
  ): AnonymizedSignal | null {
    // Check significance
    if (!correlation.isStatisticallySignificant) {
      return null;
    }

    // Check predictive power
    if (correlation.predictivePower < 0.1) {
      return null;
    }

    // Calculate expected direction
    const expectedDirection =
      correlation.correlation > 0
        ? alternativeDataChange > 0
          ? "bullish"
          : "bearish"
        : alternativeDataChange > 0
        ? "bearish"
        : "bullish";

    const confidence = Math.min(
      correlation.predictivePower * 0.6 +
        Math.abs(correlation.correlation) * 0.4,
      1
    );

    if (confidence < this.config.minConfidence) {
      return null;
    }

    return {
      signalId: `alt_${correlation.alternativeDataType}_${correlation.symbol}_${Date.now()}`,
      signalType: "alternative_data",
      assetClass: correlation.assetClass,
      symbol: correlation.symbol,
      direction: expectedDirection as "bullish" | "bearish",
      strength: Math.abs(alternativeDataChange) * correlation.predictivePower * 100,
      confidence,
      participantCount: 0, // N/A
      consensusLevel: Math.abs(correlation.correlation),
    };
  }
}

// ============================================================================
// Smart Money Signal Generator
// ============================================================================

export class SmartMoneySignalGenerator {
  private config: SignalConfig;

  constructor(config: Partial<SignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate signal from top trader activity
   */
  generateSmartMoneySignal(
    alphaTraders: TraderAlpha[],
    recentTrades: Array<{
      traderId: string;
      assetClass: string;
      symbol: string;
      side: string;
      volume: number;
      timestamp: number;
    }>
  ): AnonymizedSignal[] {
    // Filter to only traders with significant alpha
    const qualifiedTraders = new Set(
      alphaTraders
        .filter((t) => t.alphaCategory === "significant_alpha")
        .map((t) => t.userId)
    );

    // Group smart money trades by asset
    const byAsset = new Map<
      string,
      { buys: number; sells: number; traderCount: number }
    >();

    for (const trade of recentTrades) {
      if (!qualifiedTraders.has(trade.traderId)) continue;

      const key = `${trade.assetClass}:${trade.symbol}`;
      if (!byAsset.has(key)) {
        byAsset.set(key, { buys: 0, sells: 0, traderCount: 0 });
      }

      const stats = byAsset.get(key)!;
      if (trade.side === "buy") {
        stats.buys += trade.volume;
      } else {
        stats.sells += trade.volume;
      }
      stats.traderCount++;
    }

    // Generate signals
    const signals: AnonymizedSignal[] = [];

    for (const [key, stats] of byAsset) {
      if (stats.traderCount < 3) continue; // Minimum smart money participants

      const [assetClass, symbol] = key.split(":");
      const totalVolume = stats.buys + stats.sells;
      const netFlow = stats.buys - stats.sells;
      const flowRatio = totalVolume > 0 ? netFlow / totalVolume : 0;

      // Skip weak signals
      if (Math.abs(flowRatio) < 0.3) continue;

      const direction: "bullish" | "bearish" =
        flowRatio > 0 ? "bullish" : "bearish";

      signals.push({
        signalId: `smart_${key}_${Date.now()}`,
        signalType: "smart_money_flow",
        assetClass,
        symbol,
        direction,
        strength: Math.abs(flowRatio) * 100,
        confidence: Math.min(stats.traderCount / 10, 1) * 0.8, // Cap at 80%
        participantCount: stats.traderCount,
        consensusLevel: Math.abs(flowRatio),
      });
    }

    return signals.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Track smart money positions for signal generation
   */
  analyzeSmartMoneyPositions(
    positions: Array<{
      traderId: string;
      assetClass: string;
      symbol: string;
      direction: "long" | "short";
      sizePercent: number; // % of portfolio
    }>,
    alphaTraders: TraderAlpha[]
  ): Array<{
    assetClass: string;
    symbol: string;
    longCount: number;
    shortCount: number;
    avgAllocation: number;
    signal: "accumulating" | "distributing" | "neutral";
  }> {
    const qualifiedTraders = new Set(
      alphaTraders
        .filter((t) => t.hasStatisticalAlpha)
        .map((t) => t.userId)
    );

    const byAsset = new Map<
      string,
      { longs: number[]; shorts: number[] }
    >();

    for (const position of positions) {
      if (!qualifiedTraders.has(position.traderId)) continue;

      const key = `${position.assetClass}:${position.symbol}`;
      if (!byAsset.has(key)) {
        byAsset.set(key, { longs: [], shorts: [] });
      }

      const stats = byAsset.get(key)!;
      if (position.direction === "long") {
        stats.longs.push(position.sizePercent);
      } else {
        stats.shorts.push(position.sizePercent);
      }
    }

    return Array.from(byAsset.entries()).map(([key, stats]) => {
      const [assetClass, symbol] = key.split(":");
      const totalLong = stats.longs.reduce((a, b) => a + b, 0);
      const totalShort = stats.shorts.reduce((a, b) => a + b, 0);
      const avgAllocation =
        (totalLong + totalShort) / (stats.longs.length + stats.shorts.length);

      let signal: "accumulating" | "distributing" | "neutral";
      if (totalLong > totalShort * 2) {
        signal = "accumulating";
      } else if (totalShort > totalLong * 2) {
        signal = "distributing";
      } else {
        signal = "neutral";
      }

      return {
        assetClass,
        symbol,
        longCount: stats.longs.length,
        shortCount: stats.shorts.length,
        avgAllocation,
        signal,
      };
    });
  }
}

// ============================================================================
// Signal Aggregator
// ============================================================================

export class SignalAggregator {
  /**
   * Combine multiple signal types into a consensus signal
   */
  generateConsensusSignal(
    signals: AnonymizedSignal[]
  ): AnonymizedSignal | null {
    if (signals.length === 0) return null;

    // Group by asset
    const byAsset = new Map<string, AnonymizedSignal[]>();
    for (const signal of signals) {
      const key = `${signal.assetClass}:${signal.symbol}`;
      if (!byAsset.has(key)) {
        byAsset.set(key, []);
      }
      byAsset.get(key)!.push(signal);
    }

    // Find consensus for each asset
    const consensusSignals: AnonymizedSignal[] = [];

    for (const [key, assetSignals] of byAsset) {
      const [assetClass, symbol] = key.split(":");

      // Calculate weighted votes
      let bullishScore = 0;
      let bearishScore = 0;
      let totalWeight = 0;

      for (const signal of assetSignals) {
        const weight = signal.confidence * signal.strength;
        totalWeight += weight;

        if (signal.direction === "bullish") {
          bullishScore += weight;
        } else if (signal.direction === "bearish") {
          bearishScore += weight;
        }
      }

      if (totalWeight === 0) continue;

      // Determine consensus
      const netScore = bullishScore - bearishScore;
      const consensusRatio = Math.abs(netScore) / totalWeight;

      // Require strong consensus (>60%)
      if (consensusRatio < 0.6) continue;

      const direction: "bullish" | "bearish" =
        netScore > 0 ? "bullish" : "bearish";

      // Average confidence across signals
      const avgConfidence =
        assetSignals.reduce((sum, s) => sum + s.confidence, 0) / assetSignals.length;

      // Boost confidence for multi-signal consensus
      const consensusBoost = Math.min((assetSignals.length - 1) * 0.05, 0.2);

      consensusSignals.push({
        signalId: `consensus_${key}_${Date.now()}`,
        signalType: "multi_source_consensus",
        assetClass,
        symbol,
        direction,
        strength: Math.abs(netScore) / assetSignals.length,
        confidence: Math.min(avgConfidence + consensusBoost, 1),
        participantCount: assetSignals.reduce(
          (sum, s) => sum + s.participantCount,
          0
        ),
        consensusLevel: consensusRatio,
      });
    }

    // Return highest confidence consensus signal
    return consensusSignals.length > 0
      ? consensusSignals.sort((a, b) => b.confidence - a.confidence)[0]
      : null;
  }

  /**
   * Filter and rank signals for delivery
   */
  prepareSignalsForDelivery(
    signals: AnonymizedSignal[],
    maxSignals: number = 10
  ): AnonymizedSignal[] {
    // Remove duplicates (same asset within signal period)
    const seen = new Set<string>();
    const unique = signals.filter((signal) => {
      const key = `${signal.assetClass}:${signal.symbol}:${signal.direction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by confidence * strength
    const scored = unique.map((signal) => ({
      signal,
      score: signal.confidence * signal.strength,
    }));

    scored.sort((a, b) => b.score - a.score);

    // Return top signals
    return scored.slice(0, maxSignals).map((s) => s.signal);
  }
}

// ============================================================================
// Export instances
// ============================================================================

export const communityConvictionSignalGenerator = new CommunityConvictionSignalGenerator();
export const sentimentSignalGenerator = new SentimentSignalGenerator();
export const correlationSignalGenerator = new CorrelationSignalGenerator();
export const smartMoneySignalGenerator = new SmartMoneySignalGenerator();
export const signalAggregator = new SignalAggregator();
