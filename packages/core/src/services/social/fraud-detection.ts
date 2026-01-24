/**
 * Fraud Detection Service
 * Detects and manages suspected fraudulent trading activity
 */

import type {
  FraudAlert,
  FraudAlertType,
  FraudSeverity,
  FraudAlertStatus,
  FraudEvidence,
  TradingPatterns,
  TradingPatternFeatures,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface FraudDetectionServiceConfig {
  // Detection thresholds
  thresholds: {
    washTradingMinTrades: number;
    washTradingSelfTradeRatio: number;
    manipulationRoundTripRatio: number;
    unusualWinRate: number;
    unusualWinRateMinTrades: number;
    suspiciousSlippage: number;
    botBehaviorTimeVariance: number;
  };
  // Severity thresholds
  severityThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
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

interface TradeRecord {
  id: string;
  orderId: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executedAt: number;
  counterpartyId?: string;
}

const DEFAULT_CONFIG: FraudDetectionServiceConfig = {
  thresholds: {
    washTradingMinTrades: 10,
    washTradingSelfTradeRatio: 0.1,
    manipulationRoundTripRatio: 0.3,
    unusualWinRate: 0.85,
    unusualWinRateMinTrades: 50,
    suspiciousSlippage: -0.5, // Getting better price than market
    botBehaviorTimeVariance: 100, // ms standard deviation
  },
  severityThresholds: {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
    critical: 0.9,
  },
};

// ============================================================================
// Fraud Detection Service
// ============================================================================

export class FraudDetectionService {
  private readonly config: FraudDetectionServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<FraudDetectionServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[FraudDetection] ${msg}`, meta),
      info: (msg, meta) => console.info(`[FraudDetection] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[FraudDetection] ${msg}`, meta),
      error: (msg, meta) => console.error(`[FraudDetection] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Pattern Analysis
  // ==========================================================================

  /**
   * Analyze a trader's patterns
   */
  async analyzeTrader(userId: string, periodDays: number = 30): Promise<TradingPatterns> {
    const endTime = Date.now();
    const startTime = endTime - periodDays * 24 * 60 * 60 * 1000;

    // Get trades for the period
    const trades = await this.db.query<TradeRecord[]>("trades:getByUserAndPeriod", {
      userId,
      startTime,
      endTime,
    });

    if (trades.length < 10) {
      throw new FraudDetectionError("Insufficient trades for analysis", "INSUFFICIENT_DATA");
    }

    // Calculate features
    const features = this.calculateFeatures(trades);

    // Calculate ML scores
    const scores = this.calculateScores(features, trades);

    const now = Date.now();
    const patterns: TradingPatterns = {
      id: `${userId}_${startTime}`,
      userId,
      periodStart: new Date(startTime),
      periodEnd: new Date(endTime),
      features,
      alphaScore: scores.alpha,
      luckScore: scores.luck,
      skillScore: scores.skill,
      manipulationScore: scores.manipulation,
      calculatedAt: new Date(now),
    };

    // Store patterns
    await this.db.mutation("tradingPatterns:upsert", patterns);

    // Check for fraud indicators
    await this.checkForFraud(userId, patterns, trades);

    this.logger.info("Trader patterns analyzed", {
      userId,
      manipulationScore: scores.manipulation,
      alertsGenerated: scores.manipulation > this.config.severityThresholds.low,
    });

    return patterns;
  }

  /**
   * Calculate trading pattern features
   */
  private calculateFeatures(trades: TradeRecord[]): TradingPatternFeatures {
    // Sort by time
    const sortedTrades = [...trades].sort((a, b) => a.executedAt - b.executedAt);

    // Time between trades
    const timeBetweenTrades: number[] = [];
    for (let i = 1; i < sortedTrades.length; i++) {
      timeBetweenTrades.push(sortedTrades[i].executedAt - sortedTrades[i - 1].executedAt);
    }

    const avgTimeBetweenTrades = this.mean(timeBetweenTrades);
    const stdTimeBetweenTrades = this.std(timeBetweenTrades);

    // Peak trading hours
    const hourCounts = new Map<number, number>();
    for (const trade of trades) {
      const hour = new Date(trade.executedAt).getUTCHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    // Order sizes
    const orderSizes = trades.map((t) => t.quantity * t.price);
    const avgOrderSize = this.mean(orderSizes);
    const stdOrderSize = this.std(orderSizes);
    const medianOrderSize = this.median(orderSizes);

    // Self-trade ratio (trades where counterparty is self)
    const selfTrades = trades.filter((t) => t.counterpartyId === t.userId);
    const selfTradeRatio = selfTrades.length / trades.length;

    // Round-trip ratio (buy followed by sell of same symbol within short time)
    const roundTrips = this.countRoundTrips(sortedTrades);
    const roundTripRatio = roundTrips / trades.length;

    // Consecutive same-side ratio
    let consecutiveSameSide = 0;
    for (let i = 1; i < sortedTrades.length; i++) {
      if (sortedTrades[i].side === sortedTrades[i - 1].side) {
        consecutiveSameSide++;
      }
    }
    const consecutiveSameSideRatio = consecutiveSameSide / (trades.length - 1);

    // Cancel to fill ratio (would need order data)
    const cancelToFillRatio = 0; // Placeholder

    // Price improvement / slippage (would need quote data)
    const avgPriceImprovement = 0;
    const avgSlippage = 0;
    const limitOrderFillRate = 0;

    // Win/loss patterns (would need P&L data)
    const winAfterLossRatio = 0;
    const lossAfterWinRatio = 0;
    const streakCorrelation = 0;

    return {
      avgTimeBetweenTrades,
      stdTimeBetweenTrades,
      peakTradingHours: sortedHours,
      avgOrderSize,
      stdOrderSize,
      medianOrderSize,
      avgPriceImprovement,
      avgSlippage,
      limitOrderFillRate,
      cancelToFillRatio,
      selfTradeRatio,
      roundTripRatio,
      consecutiveSameSideRatio,
      winAfterLossRatio,
      lossAfterWinRatio,
      streakCorrelation,
    };
  }

  /**
   * Calculate alpha/luck/skill/manipulation scores
   */
  private calculateScores(
    features: TradingPatternFeatures,
    trades: TradeRecord[]
  ): { alpha: number; luck: number; skill: number; manipulation: number } {
    // Manipulation score based on suspicious patterns
    let manipulationScore = 0;

    // Self-trading is highly suspicious
    if (features.selfTradeRatio > this.config.thresholds.washTradingSelfTradeRatio) {
      manipulationScore += features.selfTradeRatio * 2;
    }

    // High round-trip ratio suggests wash trading
    if (features.roundTripRatio > this.config.thresholds.manipulationRoundTripRatio) {
      manipulationScore += features.roundTripRatio * 1.5;
    }

    // Very consistent timing suggests bot behavior
    if (features.stdTimeBetweenTrades < this.config.thresholds.botBehaviorTimeVariance) {
      manipulationScore += 0.2;
    }

    // Normalize to 0-1
    manipulationScore = Math.min(1, manipulationScore);

    // Alpha score: ability to generate excess returns (would need market data)
    // For now, use inverse of manipulation
    const alphaScore = Math.max(0, 1 - manipulationScore * 0.5);

    // Luck vs skill differentiation (simplified)
    // Would use more sophisticated statistical tests in production
    const totalTrades = trades.length;
    const luckScore = Math.max(0, 1 - Math.min(totalTrades / 500, 1)); // More trades = less likely luck
    const skillScore = Math.max(0, alphaScore - luckScore);

    return {
      alpha: alphaScore,
      luck: luckScore,
      skill: skillScore,
      manipulation: manipulationScore,
    };
  }

  private countRoundTrips(sortedTrades: TradeRecord[]): number {
    let roundTrips = 0;
    const openPositions = new Map<string, TradeRecord[]>();

    for (const trade of sortedTrades) {
      const positions = openPositions.get(trade.symbol) ?? [];

      if (trade.side === "buy") {
        positions.push(trade);
      } else {
        // Check for matching buy within 1 hour
        const matchIdx = positions.findIndex(
          (p) =>
            p.side === "buy" &&
            trade.executedAt - p.executedAt < 3600000 // 1 hour
        );

        if (matchIdx >= 0) {
          roundTrips++;
          positions.splice(matchIdx, 1);
        }
      }

      openPositions.set(trade.symbol, positions);
    }

    return roundTrips;
  }

  // ==========================================================================
  // Fraud Detection
  // ==========================================================================

  /**
   * Check for fraud indicators and create alerts
   */
  private async checkForFraud(
    userId: string,
    patterns: TradingPatterns,
    trades: TradeRecord[]
  ): Promise<void> {
    const checks: Array<{
      type: FraudAlertType;
      check: () => { detected: boolean; confidence: number; evidence: FraudEvidence[] };
    }> = [
      { type: "wash_trading", check: () => this.detectWashTrading(patterns, trades) },
      { type: "manipulation", check: () => this.detectManipulation(patterns, trades) },
      { type: "bot_behavior", check: () => this.detectBotBehavior(patterns) },
      { type: "unusual_activity", check: () => this.detectUnusualActivity(patterns, trades) },
    ];

    for (const { type, check } of checks) {
      try {
        const result = check();

        if (result.detected) {
          await this.createAlert(userId, type, result.confidence, result.evidence, trades);
        }
      } catch (error) {
        this.logger.error("Fraud check failed", {
          userId,
          type,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  private detectWashTrading(
    patterns: TradingPatterns,
    trades: TradeRecord[]
  ): { detected: boolean; confidence: number; evidence: FraudEvidence[] } {
    const { thresholds } = this.config;

    if (trades.length < thresholds.washTradingMinTrades) {
      return { detected: false, confidence: 0, evidence: [] };
    }

    const selfTradeRatio = patterns.features.selfTradeRatio;

    if (selfTradeRatio > thresholds.washTradingSelfTradeRatio) {
      const selfTrades = trades.filter((t) => t.counterpartyId === t.userId);

      return {
        detected: true,
        confidence: Math.min(1, selfTradeRatio * 3),
        evidence: [
          {
            type: "self_trades",
            description: `${(selfTradeRatio * 100).toFixed(1)}% of trades are self-trades`,
            data: {
              ratio: selfTradeRatio,
              count: selfTrades.length,
              tradeIds: selfTrades.slice(0, 10).map((t) => t.id),
            },
            timestamp: new Date(),
          },
        ],
      };
    }

    return { detected: false, confidence: 0, evidence: [] };
  }

  private detectManipulation(
    patterns: TradingPatterns,
    trades: TradeRecord[]
  ): { detected: boolean; confidence: number; evidence: FraudEvidence[] } {
    const { thresholds } = this.config;
    const evidence: FraudEvidence[] = [];
    let confidence = 0;

    // Check round-trip ratio
    if (patterns.features.roundTripRatio > thresholds.manipulationRoundTripRatio) {
      confidence += patterns.features.roundTripRatio;
      evidence.push({
        type: "round_trips",
        description: `${(patterns.features.roundTripRatio * 100).toFixed(1)}% of trades are round-trips`,
        data: { ratio: patterns.features.roundTripRatio },
        timestamp: new Date(),
      });
    }

    // Check manipulation score
    if (patterns.manipulationScore > thresholds.medium) {
      confidence += patterns.manipulationScore * 0.5;
      evidence.push({
        type: "manipulation_score",
        description: `High manipulation score: ${(patterns.manipulationScore * 100).toFixed(1)}`,
        data: { score: patterns.manipulationScore },
        timestamp: new Date(),
      });
    }

    return {
      detected: confidence > thresholds.low,
      confidence: Math.min(1, confidence),
      evidence,
    };
  }

  private detectBotBehavior(
    patterns: TradingPatterns
  ): { detected: boolean; confidence: number; evidence: FraudEvidence[] } {
    const { thresholds } = this.config;
    const evidence: FraudEvidence[] = [];
    let confidence = 0;

    // Check time variance (very consistent timing suggests automation)
    if (patterns.features.stdTimeBetweenTrades < thresholds.botBehaviorTimeVariance) {
      confidence += 0.5;
      evidence.push({
        type: "timing_consistency",
        description: `Unusually consistent trade timing (std: ${patterns.features.stdTimeBetweenTrades.toFixed(0)}ms)`,
        data: {
          avgTime: patterns.features.avgTimeBetweenTrades,
          stdTime: patterns.features.stdTimeBetweenTrades,
        },
        timestamp: new Date(),
      });
    }

    // Check for mechanical patterns in order sizes
    if (patterns.features.stdOrderSize / patterns.features.avgOrderSize < 0.1) {
      confidence += 0.3;
      evidence.push({
        type: "size_consistency",
        description: "Unusually consistent order sizes",
        data: {
          avgSize: patterns.features.avgOrderSize,
          stdSize: patterns.features.stdOrderSize,
        },
        timestamp: new Date(),
      });
    }

    return {
      detected: confidence > thresholds.low,
      confidence: Math.min(1, confidence),
      evidence,
    };
  }

  private detectUnusualActivity(
    patterns: TradingPatterns,
    trades: TradeRecord[]
  ): { detected: boolean; confidence: number; evidence: FraudEvidence[] } {
    // Get user's historical patterns
    // Compare current period to historical baseline
    // Flag significant deviations

    // Placeholder implementation
    return { detected: false, confidence: 0, evidence: [] };
  }

  // ==========================================================================
  // Alert Management
  // ==========================================================================

  /**
   * Create a fraud alert
   */
  private async createAlert(
    userId: string,
    alertType: FraudAlertType,
    confidence: number,
    evidence: FraudEvidence[],
    trades: TradeRecord[]
  ): Promise<FraudAlert> {
    const severity = this.determineSeverity(confidence);

    // Check for existing pending alert of same type
    const existing = await this.db.query<FraudAlert | null>("fraudAlerts:getActive", {
      userId,
      alertType,
    });

    if (existing) {
      // Update existing alert with new evidence
      return await this.db.mutation<FraudAlert>("fraudAlerts:update", {
        id: existing.id,
        confidence: Math.max(existing.confidence, confidence),
        severity: this.determineSeverity(Math.max(existing.confidence, confidence)),
        evidence: [...existing.evidence, ...evidence],
        relatedTradeIds: [
          ...existing.relatedTradeIds,
          ...trades.slice(0, 10).map((t) => t.id),
        ],
      });
    }

    const now = Date.now();
    const alert = await this.db.mutation<FraudAlert>("fraudAlerts:create", {
      userId,
      alertType,
      severity,
      detectionMethod: "automated_pattern_analysis",
      confidence,
      evidence,
      relatedOrderIds: trades.slice(0, 10).map((t) => t.orderId),
      relatedTradeIds: trades.slice(0, 10).map((t) => t.id),
      relatedUserIds: [],
      status: "pending",
      detectedAt: now,
    });

    this.logger.warn("Fraud alert created", {
      alertId: alert.id,
      userId,
      alertType,
      severity,
      confidence,
    });

    // Update user's reputation fraud risk score
    await this.db.mutation("reputationScores:updateFraudRisk", {
      userId,
      fraudRiskScore: Math.min(100, confidence * 100),
      suspiciousActivityCount: 1,
    });

    return alert;
  }

  private determineSeverity(confidence: number): FraudSeverity {
    const { severityThresholds } = this.config;

    if (confidence >= severityThresholds.critical) return "critical";
    if (confidence >= severityThresholds.high) return "high";
    if (confidence >= severityThresholds.medium) return "medium";
    return "low";
  }

  /**
   * Get alerts for a user
   */
  async getAlerts(
    userId: string,
    options?: { status?: FraudAlertStatus[]; limit?: number }
  ): Promise<FraudAlert[]> {
    return await this.db.query("fraudAlerts:getByUser", {
      userId,
      statuses: options?.status,
      limit: options?.limit ?? 50,
    });
  }

  /**
   * Get all pending alerts (for admin review)
   */
  async getPendingAlerts(options?: {
    severity?: FraudSeverity;
    limit?: number;
    cursor?: string;
  }): Promise<{ alerts: FraudAlert[]; cursor?: string }> {
    return await this.db.query("fraudAlerts:getPending", {
      severity: options?.severity,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Review an alert (admin action)
   */
  async reviewAlert(
    alertId: string,
    reviewerId: string,
    decision: "confirmed" | "dismissed",
    notes?: string
  ): Promise<FraudAlert> {
    const alert = await this.db.query<FraudAlert | null>("fraudAlerts:get", { id: alertId });

    if (!alert) {
      throw new FraudDetectionError("Alert not found", "NOT_FOUND");
    }

    const status: FraudAlertStatus = decision === "confirmed" ? "investigating" : "dismissed";

    const updated = await this.db.mutation<FraudAlert>("fraudAlerts:update", {
      id: alertId,
      status,
      reviewedBy: reviewerId,
      reviewNotes: notes,
      reviewedAt: Date.now(),
    });

    this.logger.info("Fraud alert reviewed", {
      alertId,
      reviewerId,
      decision,
      userId: alert.userId,
    });

    return updated;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    alertId: string,
    reviewerId: string,
    resolution: string,
    actionTaken?: string
  ): Promise<FraudAlert> {
    const alert = await this.db.query<FraudAlert | null>("fraudAlerts:get", { id: alertId });

    if (!alert) {
      throw new FraudDetectionError("Alert not found", "NOT_FOUND");
    }

    const updated = await this.db.mutation<FraudAlert>("fraudAlerts:update", {
      id: alertId,
      status: "resolved",
      resolution,
      actionTaken,
      resolvedAt: Date.now(),
    });

    this.logger.info("Fraud alert resolved", {
      alertId,
      reviewerId,
      resolution,
      actionTaken,
      userId: alert.userId,
    });

    return updated;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private std(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

// ============================================================================
// Errors
// ============================================================================

export class FraudDetectionError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "FraudDetectionError";
  }
}

export default FraudDetectionService;
