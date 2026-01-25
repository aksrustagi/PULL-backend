/**
 * Fraud Detection Client
 * Detects wash trading, manipulation, and suspicious activity
 */

import * as crypto from "crypto";
import type {
  FraudDetectionClientConfig,
  Logger,
  RiskThresholds,
  Trade,
  TradePattern,
  RiskAssessment,
  RiskLevel,
  RiskSignal,
  RiskSignalType,
  RiskRecommendation,
  RecommendedAction,
  WashTradingAnalysis,
  RelatedAccountTrade,
  CircularPattern,
  ManipulationAnalysis,
  SpoofingEvent,
  UserRiskProfile,
  FraudAlert,
  AlertType,
  BatchAnalysisRequest,
  BatchAnalysisResult,
  MonitoringStats,
} from "./types";
import { FraudDetectionError } from "./types";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_THRESHOLDS: RiskThresholds = {
  highRiskScore: 0.8,
  mediumRiskScore: 0.5,
  maxVelocityPerMinute: 10,
  minTimeBetweenTrades: 5,
  maxDailyVolume: 1000000,
  suspiciousVolumeMultiplier: 5,
};

// ============================================================================
// Fraud Detection Client
// ============================================================================

export class FraudDetectionClient {
  private readonly thresholds: RiskThresholds;
  private readonly enableRealtime: boolean;
  private readonly batchWindowMs: number;
  private readonly logger: Logger;

  // In-memory caches (in production, use Redis)
  private readonly userTradeHistory: Map<string, Trade[]> = new Map();
  private readonly userRiskProfiles: Map<string, UserRiskProfile> = new Map();
  private readonly recentAlerts: Map<string, Date> = new Map();

  private stats: MonitoringStats = {
    tradesAnalyzed: 0,
    alertsGenerated: 0,
    tradesFlagged: 0,
    averageLatencyMs: 0,
    lastUpdated: new Date(),
  };

  constructor(config: FraudDetectionClientConfig = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.riskThresholds };
    this.enableRealtime = config.enableRealtime ?? true;
    this.batchWindowMs = config.batchWindowMs ?? 60000;
    this.logger = config.logger ?? this.createDefaultLogger();
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
  // Real-time Trade Analysis
  // ==========================================================================

  /**
   * Analyze a single trade in real-time
   */
  async analyzeTradeRealtime(trade: Trade): Promise<RiskAssessment> {
    const startTime = Date.now();
    const signals: RiskSignal[] = [];

    this.logger.debug("Analyzing trade", {
      tradeId: trade.tradeId,
      userId: trade.userId,
    });

    // Get user's recent trades
    const userTrades = this.userTradeHistory.get(trade.userId) ?? [];
    userTrades.push(trade);
    this.userTradeHistory.set(trade.userId, userTrades.slice(-1000)); // Keep last 1000

    // Velocity check
    const velocitySignal = this.checkVelocity(trade, userTrades);
    if (velocitySignal) signals.push(velocitySignal);

    // Self-trading check
    const selfTradingSignal = this.checkSelfTrading(trade, userTrades);
    if (selfTradingSignal) signals.push(selfTradingSignal);

    // Volume anomaly check
    const volumeSignal = this.checkVolumeAnomaly(trade, userTrades);
    if (volumeSignal) signals.push(volumeSignal);

    // Device/IP anomaly check
    const deviceSignal = await this.checkDeviceAnomaly(trade);
    if (deviceSignal) signals.push(deviceSignal);

    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(signals);
    const riskLevel = this.getRiskLevel(riskScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskLevel, signals);

    // Update stats
    this.stats.tradesAnalyzed++;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (this.stats.tradesAnalyzed - 1) +
        (Date.now() - startTime)) /
      this.stats.tradesAnalyzed;

    if (riskScore >= this.thresholds.mediumRiskScore) {
      this.stats.tradesFlagged++;
    }

    const assessment: RiskAssessment = {
      assessmentId: crypto.randomUUID(),
      entityId: trade.tradeId,
      entityType: "trade",
      riskScore,
      riskLevel,
      signals,
      recommendations,
      assessedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    // Generate alert if high risk
    if (riskLevel === "high" || riskLevel === "critical") {
      await this.generateAlert(assessment, trade);
    }

    this.logger.info("Trade analysis complete", {
      tradeId: trade.tradeId,
      riskScore,
      riskLevel,
      signalCount: signals.length,
    });

    return assessment;
  }

  /**
   * Check trading velocity
   */
  private checkVelocity(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    const now = trade.timestamp.getTime();
    const oneMinuteAgo = now - 60000;

    // Count trades in last minute
    const recentTrades = userTrades.filter(
      (t) => t.timestamp.getTime() > oneMinuteAgo
    );

    if (recentTrades.length > this.thresholds.maxVelocityPerMinute) {
      return {
        signalId: crypto.randomUUID(),
        type: "velocity_spike",
        severity: "high",
        description: `User executed ${recentTrades.length} trades in last minute (threshold: ${this.thresholds.maxVelocityPerMinute})`,
        evidence: {
          tradeCount: recentTrades.length,
          threshold: this.thresholds.maxVelocityPerMinute,
          windowMs: 60000,
        },
        confidence: 0.9,
        detectedAt: new Date(),
      };
    }

    // Check time between trades
    if (recentTrades.length >= 2) {
      const lastTrade = recentTrades[recentTrades.length - 2];
      const timeBetween =
        (trade.timestamp.getTime() - lastTrade.timestamp.getTime()) / 1000;

      if (timeBetween < this.thresholds.minTimeBetweenTrades) {
        return {
          signalId: crypto.randomUUID(),
          type: "velocity_spike",
          severity: "medium",
          description: `Trades ${timeBetween.toFixed(1)}s apart (min: ${this.thresholds.minTimeBetweenTrades}s)`,
          evidence: {
            timeBetweenSeconds: timeBetween,
            threshold: this.thresholds.minTimeBetweenTrades,
          },
          confidence: 0.7,
          detectedAt: new Date(),
        };
      }
    }

    return null;
  }

  /**
   * Check for self-trading patterns
   */
  private checkSelfTrading(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    if (!trade.counterpartyId) return null;

    // Check if user is trading with themselves (different accounts)
    // This would typically use more sophisticated linking (same IP, device, etc.)

    // Check for matching opposite trades
    const matchingTrades = userTrades.filter(
      (t) =>
        t.marketId === trade.marketId &&
        t.side !== trade.side &&
        Math.abs(t.timestamp.getTime() - trade.timestamp.getTime()) < 5000 && // Within 5 seconds
        Math.abs(t.quantity - trade.quantity) / trade.quantity < 0.01 // Within 1% quantity
    );

    if (matchingTrades.length > 0) {
      return {
        signalId: crypto.randomUUID(),
        type: "self_trading",
        severity: "high",
        description: "Potential self-trading detected - matching opposite trades",
        evidence: {
          matchingTradeCount: matchingTrades.length,
          trades: matchingTrades.map((t) => t.tradeId),
        },
        confidence: 0.85,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for volume anomalies
   */
  private checkVolumeAnomaly(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    // Calculate average trade size
    const avgTradeSize =
      userTrades.length > 1
        ? userTrades.slice(0, -1).reduce((sum, t) => sum + t.totalValue, 0) /
          (userTrades.length - 1)
        : 0;

    if (avgTradeSize === 0) return null;

    const multiplier = trade.totalValue / avgTradeSize;

    if (multiplier > this.thresholds.suspiciousVolumeMultiplier) {
      return {
        signalId: crypto.randomUUID(),
        type: "volume_manipulation",
        severity: multiplier > 10 ? "high" : "medium",
        description: `Trade size ${multiplier.toFixed(1)}x average (threshold: ${this.thresholds.suspiciousVolumeMultiplier}x)`,
        evidence: {
          tradeValue: trade.totalValue,
          averageValue: avgTradeSize,
          multiplier,
        },
        confidence: 0.75,
        detectedAt: new Date(),
      };
    }

    // Check daily volume
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyVolume = userTrades
      .filter((t) => t.timestamp >= today)
      .reduce((sum, t) => sum + t.totalValue, 0);

    if (dailyVolume > this.thresholds.maxDailyVolume) {
      return {
        signalId: crypto.randomUUID(),
        type: "volume_manipulation",
        severity: "medium",
        description: `Daily volume $${dailyVolume.toLocaleString()} exceeds limit`,
        evidence: {
          dailyVolume,
          limit: this.thresholds.maxDailyVolume,
        },
        confidence: 0.8,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for device/location anomalies
   */
  private async checkDeviceAnomaly(trade: Trade): Promise<RiskSignal | null> {
    if (!trade.deviceFingerprint && !trade.ipAddress) return null;

    // Get user's known devices/IPs
    const userProfile = this.userRiskProfiles.get(trade.userId);
    if (!userProfile) return null;

    // In production, check against known devices and locations
    // This is a simplified implementation

    return null;
  }

  // ==========================================================================
  // Wash Trading Analysis
  // ==========================================================================

  /**
   * Analyze user for wash trading patterns
   */
  async analyzeWashTrading(
    userId: string,
    trades: Trade[],
    relatedUsers?: string[]
  ): Promise<WashTradingAnalysis> {
    this.logger.info("Analyzing wash trading", { userId, tradeCount: trades.length });

    const userTrades = trades.filter((t) => t.userId === userId);
    const windowStart = userTrades.length > 0
      ? userTrades[0].timestamp
      : new Date();
    const windowEnd = userTrades.length > 0
      ? userTrades[userTrades.length - 1].timestamp
      : new Date();

    // Find self-trades (buying and selling same market within short window)
    const selfTrades = this.findSelfTrades(userTrades);

    // Find related account trades
    const relatedAccountTrades = await this.findRelatedAccountTrades(
      userId,
      trades,
      relatedUsers ?? []
    );

    // Find circular trading patterns
    const circularPatterns = this.findCircularPatterns(
      userId,
      trades,
      relatedUsers ?? []
    );

    // Calculate wash trading score
    const riskScore = this.calculateWashTradingScore(
      selfTrades,
      relatedAccountTrades,
      circularPatterns
    );

    return {
      userId,
      analysisWindow: { start: windowStart, end: windowEnd },
      selfTradeCount: selfTrades.count,
      selfTradeVolume: selfTrades.volume,
      relatedAccountTrades,
      circularTradingPatterns: circularPatterns,
      riskScore,
      isWashTrading: riskScore > this.thresholds.highRiskScore,
    };
  }

  /**
   * Find self-trading patterns
   */
  private findSelfTrades(trades: Trade[]): { count: number; volume: number } {
    let count = 0;
    let volume = 0;

    // Group trades by market
    const byMarket = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const existing = byMarket.get(t.marketId) ?? [];
      existing.push(t);
      byMarket.set(t.marketId, existing);
    });

    // Find opposing trades within short time windows
    for (const marketTrades of byMarket.values()) {
      const buys = marketTrades.filter((t) => t.side === "buy");
      const sells = marketTrades.filter((t) => t.side === "sell");

      for (const buy of buys) {
        for (const sell of sells) {
          const timeDiff = Math.abs(
            buy.timestamp.getTime() - sell.timestamp.getTime()
          );

          // Within 1 minute and similar quantities
          if (
            timeDiff < 60000 &&
            Math.abs(buy.quantity - sell.quantity) / buy.quantity < 0.05
          ) {
            count++;
            volume += Math.min(buy.totalValue, sell.totalValue);
          }
        }
      }
    }

    return { count, volume };
  }

  /**
   * Find related account trades
   */
  private async findRelatedAccountTrades(
    userId: string,
    trades: Trade[],
    relatedUsers: string[]
  ): Promise<RelatedAccountTrade[]> {
    const results: RelatedAccountTrade[] = [];

    for (const relatedUserId of relatedUsers) {
      const userTrades = trades.filter((t) => t.userId === userId);
      const relatedTrades = trades.filter((t) => t.userId === relatedUserId);

      // Find matching trades
      let matchCount = 0;
      let totalVolume = 0;

      for (const ut of userTrades) {
        for (const rt of relatedTrades) {
          if (
            ut.marketId === rt.marketId &&
            ut.side !== rt.side &&
            Math.abs(ut.timestamp.getTime() - rt.timestamp.getTime()) < 60000
          ) {
            matchCount++;
            totalVolume += Math.min(ut.totalValue, rt.totalValue);
          }
        }
      }

      if (matchCount > 0) {
        results.push({
          userId,
          counterpartyId: relatedUserId,
          relationshipType: "known_associate",
          tradeCount: matchCount,
          totalVolume,
          confidence: Math.min(matchCount / 10, 1),
        });
      }
    }

    return results;
  }

  /**
   * Find circular trading patterns
   */
  private findCircularPatterns(
    userId: string,
    trades: Trade[],
    relatedUsers: string[]
  ): CircularPattern[] {
    // Simplified implementation - in production, use graph analysis
    const patterns: CircularPattern[] = [];
    const allUsers = [userId, ...relatedUsers];

    // Look for A -> B -> C -> A patterns
    if (allUsers.length >= 3) {
      // Check if there's a circular flow of trades
      // This would use more sophisticated graph algorithms in production
    }

    return patterns;
  }

  /**
   * Calculate wash trading score
   */
  private calculateWashTradingScore(
    selfTrades: { count: number; volume: number },
    relatedAccountTrades: RelatedAccountTrade[],
    circularPatterns: CircularPattern[]
  ): number {
    let score = 0;

    // Self-trading contributes to score
    score += Math.min(selfTrades.count * 0.1, 0.4);

    // Related account trades
    const relatedVolume = relatedAccountTrades.reduce(
      (sum, t) => sum + t.totalVolume,
      0
    );
    score += Math.min(relatedVolume / 100000, 0.3);

    // Circular patterns are high severity
    score += Math.min(circularPatterns.length * 0.2, 0.3);

    return Math.min(score, 1);
  }

  // ==========================================================================
  // Market Manipulation Analysis
  // ==========================================================================

  /**
   * Analyze market for manipulation
   */
  async analyzeMarketManipulation(
    marketId: string,
    trades: Trade[],
    orders?: unknown[] // Would include order book data
  ): Promise<ManipulationAnalysis> {
    this.logger.info("Analyzing market manipulation", {
      marketId,
      tradeCount: trades.length,
    });

    const marketTrades = trades.filter((t) => t.marketId === marketId);

    // Detect spoofing (placing and quickly canceling large orders)
    const spoofingEvents = this.detectSpoofing(marketTrades);

    // Detect layering (multiple orders at different prices)
    const layeringEvents = this.detectLayering(marketTrades);

    // Detect pump and dump patterns
    const pumpDumpPatterns = this.detectPumpAndDump(marketTrades);

    // Analyze price impact
    const priceImpact = this.analyzePriceImpact(marketTrades);

    // Calculate overall risk score
    const riskScore = this.calculateManipulationScore(
      spoofingEvents,
      layeringEvents,
      pumpDumpPatterns
    );

    return {
      marketId,
      analysisWindow: {
        start: marketTrades[0]?.timestamp ?? new Date(),
        end: marketTrades[marketTrades.length - 1]?.timestamp ?? new Date(),
      },
      spoofingEvents,
      layeringEvents,
      pumpAndDumpPatterns: pumpDumpPatterns,
      priceImpactAnalysis: priceImpact,
      riskScore,
    };
  }

  /**
   * Detect spoofing events
   */
  private detectSpoofing(trades: Trade[]): SpoofingEvent[] {
    // Simplified - would analyze order book in production
    return [];
  }

  /**
   * Detect layering events
   */
  private detectLayering(trades: Trade[]): any[] {
    // Simplified - would analyze order book in production
    return [];
  }

  /**
   * Detect pump and dump patterns
   */
  private detectPumpAndDump(trades: Trade[]): any[] {
    // Simplified - would analyze price/volume patterns
    return [];
  }

  /**
   * Analyze price impact
   */
  private analyzePriceImpact(trades: Trade[]): any {
    return {
      marketId: trades[0]?.marketId ?? "",
      normalVolatility: 0,
      currentVolatility: 0,
      abnormalPriceMovements: [],
    };
  }

  /**
   * Calculate manipulation score
   */
  private calculateManipulationScore(
    spoofing: SpoofingEvent[],
    layering: any[],
    pumpDump: any[]
  ): number {
    let score = 0;
    score += Math.min(spoofing.length * 0.2, 0.4);
    score += Math.min(layering.length * 0.15, 0.3);
    score += Math.min(pumpDump.length * 0.3, 0.3);
    return Math.min(score, 1);
  }

  // ==========================================================================
  // Batch Analysis
  // ==========================================================================

  /**
   * Analyze a batch of trades
   */
  async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResult> {
    const startTime = Date.now();
    const { trades, analysisTypes } = request;

    this.logger.info("Starting batch analysis", {
      tradeCount: trades.length,
      types: analysisTypes,
    });

    const userRiskScores = new Map<string, number>();
    const alerts: FraudAlert[] = [];
    let flaggedTrades = 0;

    // Group trades by user
    const byUser = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const existing = byUser.get(t.userId) ?? [];
      existing.push(t);
      byUser.set(t.userId, existing);
    });

    // Analyze each user
    for (const [userId, userTrades] of byUser) {
      let userScore = 0;

      if (analysisTypes.includes("wash_trading")) {
        const washAnalysis = await this.analyzeWashTrading(userId, userTrades);
        userScore = Math.max(userScore, washAnalysis.riskScore);

        if (washAnalysis.isWashTrading) {
          alerts.push(this.createAlert(
            "wash_trading_detected",
            "high",
            userId,
            "user",
            "Wash trading pattern detected"
          ));
        }
      }

      if (analysisTypes.includes("velocity")) {
        const pattern = this.analyzeTradePattern(userTrades);
        if (pattern.tradingVelocity > this.thresholds.maxVelocityPerMinute) {
          userScore = Math.max(userScore, 0.7);
          alerts.push(this.createAlert(
            "velocity_exceeded",
            "medium",
            userId,
            "user",
            `Trading velocity ${pattern.tradingVelocity.toFixed(1)}/min exceeds threshold`
          ));
        }
      }

      userRiskScores.set(userId, userScore);
      if (userScore >= this.thresholds.mediumRiskScore) {
        flaggedTrades += userTrades.length;
      }
    }

    this.stats.alertsGenerated += alerts.length;

    return {
      analysisId: crypto.randomUUID(),
      totalTrades: trades.length,
      flaggedTrades,
      userRiskScores,
      alerts,
      completedAt: new Date(),
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Analyze trading pattern
   */
  private analyzeTradePattern(trades: Trade[]): TradePattern {
    if (trades.length === 0) {
      return {
        userId: "",
        trades: [],
        startTime: new Date(),
        endTime: new Date(),
        totalVolume: 0,
        tradeCount: 0,
        uniqueMarkets: 0,
        averageTradeSize: 0,
        tradingVelocity: 0,
      };
    }

    const sorted = [...trades].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const startTime = sorted[0].timestamp;
    const endTime = sorted[sorted.length - 1].timestamp;
    const durationMinutes = Math.max(
      (endTime.getTime() - startTime.getTime()) / 60000,
      1
    );

    const totalVolume = trades.reduce((sum, t) => sum + t.totalValue, 0);
    const uniqueMarkets = new Set(trades.map((t) => t.marketId)).size;

    return {
      userId: trades[0].userId,
      trades: sorted,
      startTime,
      endTime,
      totalVolume,
      tradeCount: trades.length,
      uniqueMarkets,
      averageTradeSize: totalVolume / trades.length,
      tradingVelocity: trades.length / durationMinutes,
    };
  }

  // ==========================================================================
  // User Risk Profile
  // ==========================================================================

  /**
   * Get or create user risk profile
   */
  async getUserRiskProfile(userId: string): Promise<UserRiskProfile> {
    const existing = this.userRiskProfiles.get(userId);
    if (existing) return existing;

    const profile: UserRiskProfile = {
      userId,
      overallRiskScore: 0,
      riskLevel: "low",
      riskFactors: [],
      tradingBehavior: {
        averageDailyVolume: 0,
        averageTradeSize: 0,
        preferredMarkets: [],
        tradingHours: [],
        winRate: 0,
        volatilityPreference: "medium",
      },
      accountFlags: [],
      restrictions: [],
      lastAssessment: new Date(),
      nextAssessment: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    this.userRiskProfiles.set(userId, profile);
    return profile;
  }

  /**
   * Update user risk profile
   */
  async updateUserRiskProfile(
    userId: string,
    assessment: RiskAssessment
  ): Promise<UserRiskProfile> {
    const profile = await this.getUserRiskProfile(userId);

    // Update overall risk score (exponential moving average)
    const alpha = 0.3;
    profile.overallRiskScore =
      alpha * assessment.riskScore + (1 - alpha) * profile.overallRiskScore;
    profile.riskLevel = this.getRiskLevel(profile.overallRiskScore);

    // Add flags if needed
    if (assessment.riskLevel === "high" || assessment.riskLevel === "critical") {
      profile.accountFlags.push({
        flag: `high_risk_${assessment.signals[0]?.type ?? "unknown"}`,
        severity: assessment.riskLevel === "critical" ? "critical" : "alert",
        reason: assessment.signals[0]?.description ?? "High risk activity detected",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    profile.lastAssessment = new Date();
    this.userRiskProfiles.set(userId, profile);

    return profile;
  }

  // ==========================================================================
  // Alert Generation
  // ==========================================================================

  /**
   * Generate fraud alert
   */
  private async generateAlert(
    assessment: RiskAssessment,
    trade: Trade
  ): Promise<FraudAlert | null> {
    // Check cooldown
    const cooldownKey = `${trade.userId}_${assessment.signals[0]?.type}`;
    const lastAlert = this.recentAlerts.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert.getTime() < 300000) {
      // 5 minute cooldown
      return null;
    }

    const alertType = this.mapSignalToAlertType(
      assessment.signals[0]?.type
    );

    const alert = this.createAlert(
      alertType,
      assessment.riskLevel === "critical" ? "critical" : "high",
      trade.userId,
      "user",
      assessment.signals.map((s) => s.description).join("; ")
    );

    this.recentAlerts.set(cooldownKey, new Date());
    this.stats.alertsGenerated++;

    this.logger.warn("Fraud alert generated", {
      alertId: alert.alertId,
      type: alert.type,
      userId: trade.userId,
    });

    return alert;
  }

  /**
   * Create alert object
   */
  private createAlert(
    type: AlertType,
    severity: "low" | "medium" | "high" | "critical",
    entityId: string,
    entityType: "user" | "trade" | "market",
    description: string
  ): FraudAlert {
    return {
      alertId: crypto.randomUUID(),
      type,
      severity,
      entityId,
      entityType,
      description,
      evidence: {},
      status: "new",
      createdAt: new Date(),
    };
  }

  /**
   * Map signal type to alert type
   */
  private mapSignalToAlertType(signalType?: RiskSignalType): AlertType {
    switch (signalType) {
      case "wash_trading":
      case "self_trading":
        return "wash_trading_detected";
      case "velocity_spike":
        return "velocity_exceeded";
      case "volume_manipulation":
        return "volume_anomaly";
      case "spoofing":
      case "layering":
      case "front_running":
        return "manipulation_suspected";
      case "coordinated_trading":
        return "coordinated_activity";
      default:
        return "account_anomaly";
    }
  }

  // ==========================================================================
  // Scoring Helpers
  // ==========================================================================

  /**
   * Calculate overall risk score from signals
   */
  private calculateRiskScore(signals: RiskSignal[]): number {
    if (signals.length === 0) return 0;

    // Weight by severity and confidence
    const severityWeights = { low: 0.3, medium: 0.6, high: 1.0 };
    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = severityWeights[signal.severity];
      weightedSum += signal.confidence * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1) : 0;
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score >= 0.9) return "critical";
    if (score >= this.thresholds.highRiskScore) return "high";
    if (score >= this.thresholds.mediumRiskScore) return "medium";
    return "low";
  }

  /**
   * Generate recommendations based on risk
   */
  private generateRecommendations(
    riskLevel: RiskLevel,
    signals: RiskSignal[]
  ): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    switch (riskLevel) {
      case "critical":
        recommendations.push({
          action: "block_trade",
          priority: "immediate",
          reason: "Critical risk level detected",
          autoExecute: true,
        });
        recommendations.push({
          action: "flag_for_compliance",
          priority: "immediate",
          reason: "Requires compliance review",
        });
        break;

      case "high":
        recommendations.push({
          action: "delay_trade",
          priority: "high",
          reason: "High risk - requires review",
          autoExecute: false,
        });
        recommendations.push({
          action: "manual_review",
          priority: "high",
          reason: "Suspicious activity pattern",
        });
        break;

      case "medium":
        recommendations.push({
          action: "require_2fa",
          priority: "medium",
          reason: "Additional verification recommended",
        });
        break;

      default:
        recommendations.push({
          action: "no_action",
          priority: "low",
          reason: "Normal activity",
        });
    }

    return recommendations;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get monitoring statistics
   */
  getStats(): MonitoringStats {
    return { ...this.stats, lastUpdated: new Date() };
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    return true;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      tradesAnalyzed: 0,
      alertsGenerated: 0,
      tradesFlagged: 0,
      averageLatencyMs: 0,
      lastUpdated: new Date(),
    };
  }
}

export default FraudDetectionClient;
