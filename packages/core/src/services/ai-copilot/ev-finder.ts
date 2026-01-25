/**
 * EV Finder Service
 * Identifies +EV betting opportunities across markets
 */

import {
  EVOpportunity,
  EVAnalysis,
  EVFactor,
  ConfidenceLevel,
  GetEVOpportunitiesRequest,
  GetEVOpportunitiesResponse,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface EVFinderConfig {
  minEVPercent: number;
  minConfidence: number; // 0-100
  maxMarketsToScan: number;
  scanIntervalMs: number;
  bookmakerVig: number; // Typical bookmaker vig/juice
  sharpBookmakers: string[];
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface OddsProvider {
  getMarketOdds(marketId: string): Promise<MarketOdds | null>;
  getBestOdds(marketId: string, outcome: string): Promise<BestOdds | null>;
  getSharpLine(marketId: string): Promise<SharpLine | null>;
}

interface MarketOdds {
  marketId: string;
  outcomes: OutcomeOdds[];
  lastUpdate: number;
}

interface OutcomeOdds {
  outcome: string;
  odds: number;
  impliedProbability: number;
  bookmaker: string;
}

interface BestOdds {
  outcome: string;
  bestOdds: number;
  bookmaker: string;
  allOdds: OutcomeOdds[];
}

interface SharpLine {
  marketId: string;
  outcomes: Array<{
    outcome: string;
    fairOdds: number;
    trueProbability: number;
  }>;
  source: string;
  timestamp: number;
}

const DEFAULT_CONFIG: EVFinderConfig = {
  minEVPercent: 1, // 1% minimum EV
  minConfidence: 60,
  maxMarketsToScan: 500,
  scanIntervalMs: 60000, // 1 minute
  bookmakerVig: 4.5, // 4.5% typical vig
  sharpBookmakers: ["pinnacle", "betfair", "circa"],
};

// ============================================================================
// EV FINDER SERVICE
// ============================================================================

export class EVFinderService {
  private readonly config: EVFinderConfig;
  private readonly db: ConvexClient;
  private readonly oddsProvider: OddsProvider;
  private readonly logger: Logger;

  private scanTimer: NodeJS.Timeout | null = null;
  private lastScanTime: number = 0;

  constructor(
    db: ConvexClient,
    oddsProvider: OddsProvider,
    config?: Partial<EVFinderConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.oddsProvider = oddsProvider;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[EVFinder] ${msg}`, meta),
      info: (msg, meta) => console.info(`[EVFinder] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[EVFinder] ${msg}`, meta),
      error: (msg, meta) => console.error(`[EVFinder] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // OPPORTUNITY SCANNING
  // ==========================================================================

  async getOpportunities(
    request: GetEVOpportunitiesRequest
  ): Promise<GetEVOpportunitiesResponse> {
    const opportunities = await this.db.query<EVOpportunity[]>(
      "evOpportunities:list",
      {
        categories: request.categories,
        minEV: request.minEV,
        minConfidence: this.confidenceToScore(request.minConfidence),
        limit: request.limit,
      }
    );

    return {
      opportunities,
      totalFound: opportunities.length,
      lastScanned: this.lastScanTime,
    };
  }

  async scanForOpportunities(): Promise<EVOpportunity[]> {
    this.logger.info("Starting EV scan");
    const startTime = Date.now();

    // Get active markets
    const markets = await this.db.query<Array<{
      id: string;
      ticker: string;
      title: string;
      category: string;
      closeTime: number;
    }>>("predictionMarkets:getActive", {
      limit: this.config.maxMarketsToScan,
    });

    const opportunities: EVOpportunity[] = [];

    for (const market of markets) {
      try {
        const marketOpportunities = await this.analyzeMarket(market);
        opportunities.push(...marketOpportunities);
      } catch (error) {
        this.logger.error("Error analyzing market", {
          marketId: market.id,
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }

    // Filter by minimum EV and confidence
    const filteredOpportunities = opportunities.filter(
      (opp) =>
        opp.evPercent >= this.config.minEVPercent &&
        this.confidenceToScore(opp.confidence) >= this.config.minConfidence
    );

    // Sort by EV (highest first)
    filteredOpportunities.sort((a, b) => b.evPercent - a.evPercent);

    // Save to database
    await this.saveOpportunities(filteredOpportunities);

    this.lastScanTime = Date.now();
    const scanDuration = this.lastScanTime - startTime;

    this.logger.info("EV scan completed", {
      marketsScanned: markets.length,
      opportunitiesFound: filteredOpportunities.length,
      durationMs: scanDuration,
    });

    return filteredOpportunities;
  }

  private async analyzeMarket(market: {
    id: string;
    ticker: string;
    title: string;
    category: string;
    closeTime: number;
  }): Promise<EVOpportunity[]> {
    const opportunities: EVOpportunity[] = [];

    // Get current odds
    const marketOdds = await this.oddsProvider.getMarketOdds(market.id);
    if (!marketOdds) {
      return opportunities;
    }

    // Get sharp line for true probability
    const sharpLine = await this.oddsProvider.getSharpLine(market.id);

    for (const outcomeOdds of marketOdds.outcomes) {
      const analysis = await this.calculateEV(
        market.id,
        outcomeOdds,
        sharpLine
      );

      if (analysis && analysis.evPercent > 0) {
        const opportunity: EVOpportunity = {
          id: this.generateId(),
          marketId: market.id,
          ticker: market.ticker,
          title: market.title,
          outcome: outcomeOdds.outcome,
          currentOdds: outcomeOdds.odds,
          evPercent: analysis.evPercent,
          confidence: this.scoreToConfidence(analysis.confidenceScore),
          edgePercent: analysis.edgePercent,
          kellyStake: analysis.kellyStake,
          expiresAt: market.closeTime,
          factors: analysis.breakdownFactors,
        };

        opportunities.push(opportunity);
      }
    }

    return opportunities;
  }

  // ==========================================================================
  // EV CALCULATION
  // ==========================================================================

  async calculateEV(
    marketId: string,
    outcomeOdds: OutcomeOdds,
    sharpLine: SharpLine | null
  ): Promise<(EVAnalysis & { confidenceScore: number }) | null> {
    // Method 1: Sharp line comparison
    if (sharpLine) {
      const sharpOutcome = sharpLine.outcomes.find(
        (o) => o.outcome === outcomeOdds.outcome
      );

      if (sharpOutcome) {
        return this.calculateFromSharpLine(outcomeOdds, sharpOutcome);
      }
    }

    // Method 2: Market consensus / true probability estimation
    const bestOdds = await this.oddsProvider.getBestOdds(
      marketId,
      outcomeOdds.outcome
    );

    if (bestOdds) {
      return this.calculateFromBestOdds(outcomeOdds, bestOdds);
    }

    // Method 3: Simple vig removal
    return this.calculateFromVigRemoval(outcomeOdds);
  }

  private calculateFromSharpLine(
    outcomeOdds: OutcomeOdds,
    sharpOutcome: { fairOdds: number; trueProbability: number }
  ): EVAnalysis & { confidenceScore: number } {
    const impliedProbability = 1 / outcomeOdds.odds;
    const trueProbability = sharpOutcome.trueProbability;
    const fairOdds = sharpOutcome.fairOdds;

    // EV = (probability * payout) - 1
    // Where payout = odds - 1 for decimal odds
    const expectedValue = trueProbability * outcomeOdds.odds - 1;
    const evPercent = expectedValue * 100;

    const edgePercent = ((outcomeOdds.odds - fairOdds) / fairOdds) * 100;

    // Kelly Criterion: (bp - q) / b
    // Where b = odds - 1, p = probability, q = 1 - p
    const b = outcomeOdds.odds - 1;
    const p = trueProbability;
    const q = 1 - p;
    const kellyStake = (b * p - q) / b;
    const halfKellyStake = kellyStake / 2;

    const factors: EVFactor[] = [
      {
        name: "Sharp Line Edge",
        impact: edgePercent,
        direction: edgePercent > 0 ? "positive" : "negative",
        description: `Current odds ${edgePercent > 0 ? "better" : "worse"} than sharp line`,
      },
      {
        name: "True Probability",
        impact: (trueProbability - impliedProbability) * 100,
        direction: trueProbability > impliedProbability ? "positive" : "negative",
        description: `Sharp books estimate ${(trueProbability * 100).toFixed(1)}% probability`,
      },
    ];

    return {
      expectedValue,
      evPercent,
      impliedProbability,
      trueProbability,
      edgePercent,
      kellyStake: Math.max(0, kellyStake * 100),
      halfKellyStake: Math.max(0, halfKellyStake * 100),
      breakdownFactors: factors,
      confidenceScore: 85, // High confidence with sharp line
    };
  }

  private calculateFromBestOdds(
    outcomeOdds: OutcomeOdds,
    bestOdds: BestOdds
  ): EVAnalysis & { confidenceScore: number } {
    // Use market consensus to estimate true probability
    // Remove average vig from best odds
    const vigMultiplier = 1 - this.config.bookmakerVig / 100;
    const estimatedFairOdds = bestOdds.bestOdds * vigMultiplier;
    const trueProbability = 1 / estimatedFairOdds;
    const impliedProbability = 1 / outcomeOdds.odds;

    const expectedValue = trueProbability * outcomeOdds.odds - 1;
    const evPercent = expectedValue * 100;
    const edgePercent = ((outcomeOdds.odds - estimatedFairOdds) / estimatedFairOdds) * 100;

    const b = outcomeOdds.odds - 1;
    const p = trueProbability;
    const q = 1 - p;
    const kellyStake = (b * p - q) / b;

    const factors: EVFactor[] = [
      {
        name: "Best Odds Premium",
        impact: ((bestOdds.bestOdds - outcomeOdds.odds) / outcomeOdds.odds) * 100,
        direction: bestOdds.bestOdds > outcomeOdds.odds ? "negative" : "positive",
        description: `Best available: ${bestOdds.bestOdds.toFixed(2)} at ${bestOdds.bookmaker}`,
      },
      {
        name: "Market Efficiency",
        impact: edgePercent,
        direction: edgePercent > 0 ? "positive" : "neutral",
        description: `${edgePercent > 0 ? "Positive" : "Negative"} edge vs market consensus`,
      },
    ];

    return {
      expectedValue,
      evPercent,
      impliedProbability,
      trueProbability,
      edgePercent,
      kellyStake: Math.max(0, kellyStake * 100),
      halfKellyStake: Math.max(0, kellyStake * 50),
      breakdownFactors: factors,
      confidenceScore: 70, // Medium confidence with market consensus
    };
  }

  private calculateFromVigRemoval(
    outcomeOdds: OutcomeOdds
  ): EVAnalysis & { confidenceScore: number } {
    // Simple vig removal - less reliable
    const vigMultiplier = 1 - this.config.bookmakerVig / 100 / 2;
    const estimatedFairOdds = outcomeOdds.odds * vigMultiplier;
    const trueProbability = 1 / estimatedFairOdds;
    const impliedProbability = 1 / outcomeOdds.odds;

    const expectedValue = trueProbability * outcomeOdds.odds - 1;
    const evPercent = expectedValue * 100;
    const edgePercent = ((outcomeOdds.odds - estimatedFairOdds) / estimatedFairOdds) * 100;

    const b = outcomeOdds.odds - 1;
    const p = trueProbability;
    const q = 1 - p;
    const kellyStake = (b * p - q) / b;

    const factors: EVFactor[] = [
      {
        name: "Vig Adjustment",
        impact: this.config.bookmakerVig,
        direction: "neutral",
        description: `Estimated ${this.config.bookmakerVig}% bookmaker vig removed`,
      },
    ];

    return {
      expectedValue,
      evPercent,
      impliedProbability,
      trueProbability,
      edgePercent,
      kellyStake: Math.max(0, kellyStake * 100),
      halfKellyStake: Math.max(0, kellyStake * 50),
      breakdownFactors: factors,
      confidenceScore: 50, // Low confidence with simple vig removal
    };
  }

  // ==========================================================================
  // OPPORTUNITY ANALYSIS
  // ==========================================================================

  async analyzeOpportunity(opportunityId: string): Promise<{
    opportunity: EVOpportunity;
    analysis: EVAnalysis;
    recommendation: "strong_bet" | "bet" | "monitor" | "pass";
    reasoning: string[];
  } | null> {
    const opportunity = await this.db.query<EVOpportunity | null>(
      "evOpportunities:get",
      { opportunityId }
    );

    if (!opportunity) {
      return null;
    }

    // Get fresh analysis
    const marketOdds = await this.oddsProvider.getMarketOdds(opportunity.marketId);
    const sharpLine = await this.oddsProvider.getSharpLine(opportunity.marketId);

    const outcomeOdds = marketOdds?.outcomes.find(
      (o) => o.outcome === opportunity.outcome
    );

    if (!outcomeOdds) {
      return null;
    }

    const analysis = await this.calculateEV(
      opportunity.marketId,
      outcomeOdds,
      sharpLine
    );

    if (!analysis) {
      return null;
    }

    // Determine recommendation
    const recommendation = this.getRecommendation(analysis);
    const reasoning = this.getRecommendationReasoning(analysis, recommendation);

    return {
      opportunity: { ...opportunity, currentOdds: outcomeOdds.odds },
      analysis,
      recommendation,
      reasoning,
    };
  }

  private getRecommendation(
    analysis: EVAnalysis & { confidenceScore: number }
  ): "strong_bet" | "bet" | "monitor" | "pass" {
    if (analysis.evPercent >= 5 && analysis.confidenceScore >= 80) {
      return "strong_bet";
    }

    if (analysis.evPercent >= 3 && analysis.confidenceScore >= 70) {
      return "bet";
    }

    if (analysis.evPercent >= 1 && analysis.confidenceScore >= 60) {
      return "monitor";
    }

    return "pass";
  }

  private getRecommendationReasoning(
    analysis: EVAnalysis & { confidenceScore: number },
    recommendation: "strong_bet" | "bet" | "monitor" | "pass"
  ): string[] {
    const reasons: string[] = [];

    reasons.push(
      `Expected Value: +${analysis.evPercent.toFixed(2)}% (${analysis.expectedValue > 0 ? "positive" : "negative"})`
    );

    reasons.push(
      `Edge: ${analysis.edgePercent.toFixed(2)}% over fair value`
    );

    reasons.push(
      `Confidence: ${analysis.confidenceScore}% (${this.scoreToConfidence(analysis.confidenceScore)})`
    );

    if (analysis.kellyStake > 0) {
      reasons.push(
        `Kelly suggests: ${analysis.halfKellyStake.toFixed(1)}% of bankroll (half-Kelly)`
      );
    }

    for (const factor of analysis.breakdownFactors) {
      if (Math.abs(factor.impact) >= 1) {
        reasons.push(`${factor.name}: ${factor.description}`);
      }
    }

    return reasons;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  startScanning(): void {
    if (this.scanTimer) {
      return;
    }

    this.scanTimer = setInterval(async () => {
      try {
        await this.scanForOpportunities();
      } catch (error) {
        this.logger.error("Scan failed", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }, this.config.scanIntervalMs);

    // Run immediately
    this.scanForOpportunities().catch((error) => {
      this.logger.error("Initial scan failed", {
        error: error instanceof Error ? error.message : "Unknown",
      });
    });

    this.logger.info("EV scanning started", {
      intervalMs: this.config.scanIntervalMs,
    });
  }

  stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
      this.logger.info("EV scanning stopped");
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async saveOpportunities(opportunities: EVOpportunity[]): Promise<void> {
    // Remove old opportunities
    await this.db.mutation("evOpportunities:clearOld", {
      olderThan: Date.now() - 60 * 60 * 1000, // 1 hour
    });

    // Save new opportunities
    for (const opportunity of opportunities) {
      await this.db.mutation("evOpportunities:upsert", { opportunity });
    }
  }

  private confidenceToScore(level?: ConfidenceLevel): number {
    const scores: Record<ConfidenceLevel, number> = {
      low: 55,
      medium: 67,
      high: 80,
      very_high: 90,
    };
    return level ? scores[level] : 0;
  }

  private scoreToConfidence(score: number): ConfidenceLevel {
    if (score >= 85) return "very_high";
    if (score >= 75) return "high";
    if (score >= 60) return "medium";
    return "low";
  }

  private generateId(): string {
    return `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: EVFinderService | null = null;

export function getEVFinderService(
  db: ConvexClient,
  oddsProvider: OddsProvider
): EVFinderService {
  if (!serviceInstance) {
    serviceInstance = new EVFinderService(db, oddsProvider);
  }
  return serviceInstance;
}

export function createEVFinderService(
  db: ConvexClient,
  oddsProvider: OddsProvider,
  config?: Partial<EVFinderConfig>
): EVFinderService {
  return new EVFinderService(db, oddsProvider, config);
}
