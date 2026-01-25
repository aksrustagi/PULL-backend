/**
 * Risk Scoring Engine
 * Comprehensive risk scoring with multiple component scores
 */

import * as crypto from 'crypto';
import type {
  RiskAssessment,
  RiskLevel,
  RiskSignal,
  RiskRecommendation,
  RecommendedAction,
  ScoringWeights,
  ScoreComponents,
  ScoreBonus,
  ScorePenalty,
  DeviceFingerprint,
  DeviceAnalysisResult,
  IPAnalysisResult,
  BehaviorProfile,
  BehaviorAnomalyResult,
  VelocityCheckResult,
  MultiAccountDetectionResult,
  BonusAbuseDetectionResult,
  UserRiskProfile,
  GeoVelocityCheck,
  Logger,
  RiskSignalType,
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  velocity: 0.15,
  device: 0.15,
  ip: 0.15,
  behavior: 0.15,
  multiAccount: 0.15,
  bonusAbuse: 0.10,
  trading: 0.10,
  history: 0.05,
};

const RISK_LEVEL_THRESHOLDS = {
  critical: 0.9,
  high: 0.7,
  medium: 0.4,
  low: 0,
};

// ============================================================================
// Scoring Engine
// ============================================================================

export interface RiskScoringConfig {
  weights?: Partial<ScoringWeights>;
  thresholds?: typeof RISK_LEVEL_THRESHOLDS;
  logger?: Logger;
}

export interface ScoringContext {
  userId: string;
  entityId?: string;
  entityType?: 'user' | 'trade' | 'market' | 'transaction' | 'device' | 'ip';

  // Component data
  velocityResult?: VelocityCheckResult;
  deviceResult?: DeviceAnalysisResult;
  ipResult?: IPAnalysisResult;
  behaviorResult?: BehaviorAnomalyResult;
  multiAccountResult?: MultiAccountDetectionResult;
  bonusAbuseResult?: BonusAbuseDetectionResult;
  geoVelocityResult?: GeoVelocityCheck;

  // Historical data
  userProfile?: UserRiskProfile;
  previousAssessments?: RiskAssessment[];

  // Collected signals
  signals?: RiskSignal[];

  // Override scores (for testing)
  overrideScores?: Partial<ScoreComponents>;
}

export class RiskScoringEngine {
  private readonly weights: ScoringWeights;
  private readonly thresholds: typeof RISK_LEVEL_THRESHOLDS;
  private readonly logger: Logger;

  constructor(config: RiskScoringConfig = {}) {
    this.weights = { ...DEFAULT_SCORING_WEIGHTS, ...config.weights };
    this.thresholds = config.thresholds ?? RISK_LEVEL_THRESHOLDS;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[RiskScoring] ${msg}`, meta),
      info: (msg, meta) => console.info(`[RiskScoring] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[RiskScoring] ${msg}`, meta),
      error: (msg, meta) => console.error(`[RiskScoring] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Main Scoring Methods
  // ==========================================================================

  /**
   * Calculate comprehensive risk assessment
   */
  calculateRiskAssessment(context: ScoringContext): RiskAssessment {
    const startTime = Date.now();

    // Calculate component scores
    const components = this.calculateComponentScores(context);

    // Collect all signals
    const signals = this.collectSignals(context, components);

    // Get risk level from final score
    const riskLevel = this.getRiskLevel(components.finalScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      riskLevel,
      signals,
      context
    );

    const assessment: RiskAssessment = {
      assessmentId: crypto.randomUUID(),
      entityId: context.entityId ?? context.userId,
      entityType: context.entityType ?? 'user',
      riskScore: components.finalScore,
      riskLevel,
      signals,
      recommendations,
      assessedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours

      // Component scores
      velocityScore: components.velocityScore,
      deviceScore: components.deviceScore,
      ipScore: components.ipScore,
      behaviorScore: components.behaviorScore,
      multiAccountScore: components.multiAccountScore,
      bonusAbuseScore: components.bonusAbuseScore,
    };

    this.logger.debug('Risk assessment calculated', {
      userId: context.userId,
      riskScore: components.finalScore,
      riskLevel,
      latencyMs: Date.now() - startTime,
    });

    return assessment;
  }

  /**
   * Calculate all component scores
   */
  calculateComponentScores(context: ScoringContext): ScoreComponents {
    const velocityScore = this.calculateVelocityScore(context);
    const deviceScore = this.calculateDeviceScore(context);
    const ipScore = this.calculateIPScore(context);
    const behaviorScore = this.calculateBehaviorScore(context);
    const multiAccountScore = this.calculateMultiAccountScore(context);
    const bonusAbuseScore = this.calculateBonusAbuseScore(context);
    const tradingScore = this.calculateTradingScore(context);
    const historyScore = this.calculateHistoryScore(context);

    // Apply overrides if provided
    const scores = {
      velocityScore: context.overrideScores?.velocityScore ?? velocityScore,
      deviceScore: context.overrideScores?.deviceScore ?? deviceScore,
      ipScore: context.overrideScores?.ipScore ?? ipScore,
      behaviorScore: context.overrideScores?.behaviorScore ?? behaviorScore,
      multiAccountScore: context.overrideScores?.multiAccountScore ?? multiAccountScore,
      bonusAbuseScore: context.overrideScores?.bonusAbuseScore ?? bonusAbuseScore,
      tradingScore: context.overrideScores?.tradingScore ?? tradingScore,
      historyScore: context.overrideScores?.historyScore ?? historyScore,
    };

    // Calculate bonuses and penalties
    const bonuses = this.calculateBonuses(context);
    const penalties = this.calculatePenalties(context);

    // Calculate weighted average
    let baseScore =
      scores.velocityScore * this.weights.velocity +
      scores.deviceScore * this.weights.device +
      scores.ipScore * this.weights.ip +
      scores.behaviorScore * this.weights.behavior +
      scores.multiAccountScore * this.weights.multiAccount +
      scores.bonusAbuseScore * this.weights.bonusAbuse +
      scores.tradingScore * this.weights.trading +
      scores.historyScore * this.weights.history;

    // Apply bonuses (reduce risk)
    const bonusTotal = bonuses.reduce((sum, b) => sum + b.value, 0);
    baseScore = Math.max(0, baseScore - bonusTotal);

    // Apply penalties (increase risk)
    const penaltyTotal = penalties.reduce((sum, p) => sum + p.value, 0);
    baseScore = Math.min(1, baseScore + penaltyTotal);

    return {
      baseScore: baseScore - bonusTotal - penaltyTotal,
      ...scores,
      bonuses,
      penalties,
      finalScore: Math.max(0, Math.min(1, baseScore)),
    };
  }

  // ==========================================================================
  // Component Score Calculations
  // ==========================================================================

  /**
   * Calculate velocity-based risk score
   */
  private calculateVelocityScore(context: ScoringContext): number {
    if (!context.velocityResult) return 0;

    const { velocityResult } = context;
    let score = 0;

    // If velocity limit exceeded, immediate high score
    if (!velocityResult.allowed) {
      score = 0.8;
    } else {
      // Score based on how close to limits
      const usageRatio = (velocityResult.limit - velocityResult.remaining) / velocityResult.limit;
      score = Math.min(usageRatio * 0.5, 0.5); // Max 0.5 if within limits
    }

    // Add risk from velocity signals
    for (const signal of velocityResult.signals) {
      if (signal.type === 'deposit_velocity') score += 0.15;
      if (signal.type === 'withdrawal_velocity') score += 0.15;
      if (signal.type === 'bet_velocity') score += 0.1;
      if (signal.type === 'rapid_deposit_withdrawal') score += 0.25;
    }

    return Math.min(1, score);
  }

  /**
   * Calculate device-based risk score
   */
  private calculateDeviceScore(context: ScoringContext): number {
    if (!context.deviceResult) return 0;

    const { deviceResult } = context;
    let score = 0;

    // New device increases risk
    if (deviceResult.isNewDevice) {
      score += 0.2;
    }

    // Shared device is high risk
    if (deviceResult.isSharedDevice) {
      score += 0.4;
    }

    // Emulator/VM is very high risk
    if (deviceResult.isEmulator) {
      score += 0.7;
    }

    if (deviceResult.isVirtualMachine) {
      score += 0.5;
    }

    // Bot detection is critical
    if (deviceResult.isBot) {
      score = 1.0;
      return score;
    }

    // Suspicious device
    if (deviceResult.isSuspicious) {
      score += 0.3;
    }

    // Low trust score increases risk
    if (deviceResult.trustScore < 0.3) {
      score += 0.3;
    } else if (deviceResult.trustScore < 0.5) {
      score += 0.15;
    }

    // Multiple matched users
    if (deviceResult.matchedUsers.length > 1) {
      score += 0.15 * (deviceResult.matchedUsers.length - 1);
    }

    return Math.min(1, score);
  }

  /**
   * Calculate IP-based risk score
   */
  private calculateIPScore(context: ScoringContext): number {
    if (!context.ipResult) return 0;

    const { ipResult } = context;
    let score = 0;

    // VPN detection
    if (ipResult.isVPN) {
      score += 0.25;
    }

    // Proxy detection
    if (ipResult.isProxy) {
      score += 0.3;
    }

    // Tor is very high risk
    if (ipResult.isTor) {
      score += 0.8;
    }

    // Datacenter IP
    if (ipResult.isDatacenter) {
      score += 0.4;
    }

    // Low reputation
    if (ipResult.reputationScore < 30) {
      score += 0.4;
    } else if (ipResult.reputationScore < 50) {
      score += 0.2;
    }

    // Threat level
    switch (ipResult.threatLevel) {
      case 'critical':
        score += 0.5;
        break;
      case 'high':
        score += 0.35;
        break;
      case 'medium':
        score += 0.2;
        break;
      case 'low':
        score += 0.05;
        break;
    }

    // Multiple previous users
    if (ipResult.previousUsers.length > 3) {
      score += 0.15;
    }

    // Geo-velocity check
    if (context.geoVelocityResult && !context.geoVelocityResult.isPossible) {
      score += 0.5;
    }

    return Math.min(1, score);
  }

  /**
   * Calculate behavior-based risk score
   */
  private calculateBehaviorScore(context: ScoringContext): number {
    if (!context.behaviorResult) return 0;

    const { behaviorResult } = context;
    let score = 0;

    // Anomaly detection
    if (behaviorResult.isAnomaly) {
      score += 0.4;
    }

    // Anomaly type impacts score
    switch (behaviorResult.anomalyType) {
      case 'session_anomaly':
        score += 0.15;
        break;
      case 'trading_anomaly':
        score += 0.2;
        break;
      case 'deposit_anomaly':
        score += 0.3;
        break;
      case 'withdrawal_anomaly':
        score += 0.35;
        break;
      case 'time_anomaly':
        score += 0.15;
        break;
      case 'location_anomaly':
        score += 0.25;
        break;
      case 'pattern_break':
        score += 0.2;
        break;
    }

    // Deviation significance
    for (const deviation of behaviorResult.deviations) {
      switch (deviation.significance) {
        case 'high':
          score += 0.1;
          break;
        case 'medium':
          score += 0.05;
          break;
        case 'low':
          score += 0.02;
          break;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Calculate multi-account risk score
   */
  private calculateMultiAccountScore(context: ScoringContext): number {
    if (!context.multiAccountResult) return 0;

    const { multiAccountResult } = context;
    let score = 0;

    // Multi-account detected
    if (multiAccountResult.isMultiAccount) {
      score += 0.5 * multiAccountResult.confidence;
    }

    // Count linked accounts
    const linkedCount = multiAccountResult.linkedAccounts.length;
    if (linkedCount > 0) {
      score += 0.1 * linkedCount;
    }

    // Link type severity
    for (const link of multiAccountResult.linkedAccounts) {
      switch (link.linkType) {
        case 'same_device':
          score += 0.2 * link.confidence;
          break;
        case 'same_payment_method':
          score += 0.4 * link.confidence;
          break;
        case 'same_ip':
          score += 0.1 * link.confidence;
          break;
        case 'same_phone':
          score += 0.3 * link.confidence;
          break;
        case 'referral_abuse':
          score += 0.5 * link.confidence;
          break;
        case 'coordinated_trading':
          score += 0.4 * link.confidence;
          break;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Calculate bonus abuse risk score
   */
  private calculateBonusAbuseScore(context: ScoringContext): number {
    if (!context.bonusAbuseResult) return 0;

    const { bonusAbuseResult } = context;
    let score = 0;

    // Abuse detected
    if (bonusAbuseResult.isAbusive) {
      score += 0.5 * bonusAbuseResult.confidence;
    }

    // Abuse type severity
    for (const abuseType of bonusAbuseResult.abuseType) {
      switch (abuseType) {
        case 'multi_account_bonus':
          score += 0.4;
          break;
        case 'bonus_hunting':
          score += 0.3;
          break;
        case 'wagering_manipulation':
          score += 0.4;
          break;
        case 'arbitrage_abuse':
          score += 0.35;
          break;
        case 'referral_fraud':
          score += 0.5;
          break;
        case 'promo_code_abuse':
          score += 0.2;
          break;
        case 'chargeback_fraud':
          score += 0.8;
          break;
      }
    }

    // Pattern count
    score += 0.1 * bonusAbuseResult.suspiciousPatterns.length;

    return Math.min(1, score);
  }

  /**
   * Calculate trading-based risk score
   */
  private calculateTradingScore(context: ScoringContext): number {
    // Trading score comes from signals
    if (!context.signals) return 0;

    let score = 0;
    const tradingSignals = context.signals.filter((s) =>
      ['wash_trading', 'self_trading', 'velocity_spike', 'volume_manipulation', 'coordinated_trading'].includes(s.type)
    );

    for (const signal of tradingSignals) {
      switch (signal.type) {
        case 'wash_trading':
          score += 0.6 * signal.confidence;
          break;
        case 'self_trading':
          score += 0.5 * signal.confidence;
          break;
        case 'coordinated_trading':
          score += 0.5 * signal.confidence;
          break;
        case 'velocity_spike':
          score += 0.2 * signal.confidence;
          break;
        case 'volume_manipulation':
          score += 0.4 * signal.confidence;
          break;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Calculate history-based risk score
   */
  private calculateHistoryScore(context: ScoringContext): number {
    if (!context.userProfile) return 0;

    const { userProfile } = context;
    let score = 0;

    // Previous flags
    const activeFlags = userProfile.accountFlags.filter(
      (f) => !f.resolvedAt && (!f.expiresAt || new Date(f.expiresAt) > new Date())
    );

    for (const flag of activeFlags) {
      switch (flag.severity) {
        case 'critical':
          score += 0.3;
          break;
        case 'alert':
          score += 0.2;
          break;
        case 'warning':
          score += 0.1;
          break;
      }
    }

    // Current restrictions
    score += 0.05 * userProfile.restrictions.length;

    // Historical risk level
    switch (userProfile.riskLevel) {
      case 'critical':
        score += 0.4;
        break;
      case 'high':
        score += 0.25;
        break;
      case 'medium':
        score += 0.1;
        break;
    }

    // Previous assessment scores
    if (context.previousAssessments && context.previousAssessments.length > 0) {
      const avgPreviousScore =
        context.previousAssessments.reduce((sum, a) => sum + a.riskScore, 0) /
        context.previousAssessments.length;
      score += avgPreviousScore * 0.2;
    }

    return Math.min(1, score);
  }

  // ==========================================================================
  // Bonuses and Penalties
  // ==========================================================================

  /**
   * Calculate bonuses that reduce risk
   */
  private calculateBonuses(context: ScoringContext): ScoreBonus[] {
    const bonuses: ScoreBonus[] = [];

    // Verified account bonus
    if (context.userProfile) {
      const profile = context.userProfile;

      // Long account age reduces risk
      const accountAgeMonths = this.getAccountAgeMonths(profile);
      if (accountAgeMonths > 12) {
        bonuses.push({
          name: 'long_account_age',
          value: 0.1,
          reason: 'Account over 12 months old',
        });
      } else if (accountAgeMonths > 6) {
        bonuses.push({
          name: 'medium_account_age',
          value: 0.05,
          reason: 'Account over 6 months old',
        });
      }

      // Clean history bonus
      if (profile.accountFlags.length === 0 && profile.restrictions.length === 0) {
        bonuses.push({
          name: 'clean_history',
          value: 0.1,
          reason: 'No previous flags or restrictions',
        });
      }

      // Consistent behavior bonus
      if (profile.tradingBehavior.winRate > 0 && profile.tradingBehavior.winRate < 0.7) {
        // Realistic win rate suggests legitimate trading
        bonuses.push({
          name: 'realistic_trading',
          value: 0.05,
          reason: 'Realistic trading pattern',
        });
      }
    }

    // Known device bonus
    if (context.deviceResult && context.deviceResult.isKnownDevice && !context.deviceResult.isSuspicious) {
      bonuses.push({
        name: 'known_device',
        value: 0.05,
        reason: 'Transaction from known, trusted device',
      });
    }

    // Residential IP bonus
    if (context.ipResult && context.ipResult.isResidential && !context.ipResult.isVPN) {
      bonuses.push({
        name: 'residential_ip',
        value: 0.03,
        reason: 'Transaction from residential IP',
      });
    }

    return bonuses;
  }

  /**
   * Calculate penalties that increase risk
   */
  private calculatePenalties(context: ScoringContext): ScorePenalty[] {
    const penalties: ScorePenalty[] = [];

    // New account penalty
    if (context.userProfile) {
      const accountAgeMonths = this.getAccountAgeMonths(context.userProfile);
      if (accountAgeMonths < 1) {
        penalties.push({
          name: 'new_account',
          value: 0.15,
          reason: 'Account less than 1 month old',
        });
      } else if (accountAgeMonths < 3) {
        penalties.push({
          name: 'recent_account',
          value: 0.08,
          reason: 'Account less than 3 months old',
        });
      }
    }

    // Multiple high severity signals
    if (context.signals) {
      const highSeveritySignals = context.signals.filter((s) => s.severity === 'high');
      if (highSeveritySignals.length >= 3) {
        penalties.push({
          name: 'multiple_high_severity',
          value: 0.2,
          reason: `${highSeveritySignals.length} high severity signals detected`,
        });
      }
    }

    // Critical geo-velocity violation
    if (context.geoVelocityResult && !context.geoVelocityResult.isPossible) {
      if (context.geoVelocityResult.distanceKm > 5000) {
        penalties.push({
          name: 'extreme_geo_velocity',
          value: 0.2,
          reason: `Impossible travel: ${context.geoVelocityResult.distanceKm.toFixed(0)}km in ${context.geoVelocityResult.timeHours.toFixed(1)}h`,
        });
      }
    }

    return penalties;
  }

  /**
   * Get account age in months
   */
  private getAccountAgeMonths(profile: UserRiskProfile): number {
    // This would typically come from user creation date
    // For now, estimate from assessment dates
    const now = new Date();
    const assessmentDate = profile.lastAssessment || now;
    const diffMs = now.getTime() - assessmentDate.getTime();
    return diffMs / (1000 * 60 * 60 * 24 * 30);
  }

  // ==========================================================================
  // Signal Collection
  // ==========================================================================

  /**
   * Collect all signals from context and component scores
   */
  private collectSignals(context: ScoringContext, components: ScoreComponents): RiskSignal[] {
    const signals: RiskSignal[] = [...(context.signals ?? [])];

    // Add signals from velocity result
    if (context.velocityResult) {
      signals.push(...context.velocityResult.signals);
    }

    // Add signals from device result
    if (context.deviceResult) {
      signals.push(...context.deviceResult.signals);
    }

    // Add signals from IP result
    if (context.ipResult) {
      signals.push(...context.ipResult.signals);
    }

    // Add signals from behavior result
    if (context.behaviorResult) {
      signals.push(...context.behaviorResult.signals);
    }

    // Add signals from multi-account result
    if (context.multiAccountResult) {
      signals.push(...context.multiAccountResult.signals);
    }

    // Add signals from bonus abuse result
    if (context.bonusAbuseResult) {
      signals.push(...context.bonusAbuseResult.signals);
    }

    // Generate signals from component scores
    if (components.velocityScore > 0.7) {
      signals.push(this.createComponentSignal('velocity_spike', components.velocityScore));
    }

    if (components.deviceScore > 0.7) {
      signals.push(this.createComponentSignal('device_anomaly', components.deviceScore));
    }

    if (components.ipScore > 0.7) {
      signals.push(this.createComponentSignal('location_anomaly', components.ipScore));
    }

    if (components.behaviorScore > 0.7) {
      signals.push(this.createComponentSignal('behavioral_anomaly', components.behaviorScore));
    }

    if (components.multiAccountScore > 0.7) {
      signals.push(this.createComponentSignal('multi_account', components.multiAccountScore));
    }

    if (components.bonusAbuseScore > 0.7) {
      signals.push(this.createComponentSignal('bonus_abuse', components.bonusAbuseScore));
    }

    // Deduplicate signals by type (keep highest confidence)
    const signalMap = new Map<RiskSignalType, RiskSignal>();
    for (const signal of signals) {
      const existing = signalMap.get(signal.type);
      if (!existing || signal.confidence > existing.confidence) {
        signalMap.set(signal.type, signal);
      }
    }

    return Array.from(signalMap.values());
  }

  /**
   * Create a signal from component score
   */
  private createComponentSignal(type: RiskSignalType, score: number): RiskSignal {
    return {
      signalId: crypto.randomUUID(),
      type,
      severity: score > 0.8 ? 'high' : 'medium',
      description: `High ${type.replace(/_/g, ' ')} score: ${(score * 100).toFixed(0)}%`,
      evidence: { score },
      confidence: score,
      detectedAt: new Date(),
    };
  }

  // ==========================================================================
  // Risk Level and Recommendations
  // ==========================================================================

  /**
   * Get risk level from score
   */
  getRiskLevel(score: number): RiskLevel {
    if (score >= this.thresholds.critical) return 'critical';
    if (score >= this.thresholds.high) return 'high';
    if (score >= this.thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on risk level and signals
   */
  generateRecommendations(
    riskLevel: RiskLevel,
    signals: RiskSignal[],
    context: ScoringContext
  ): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    // Base recommendations by risk level
    switch (riskLevel) {
      case 'critical':
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'Critical risk level - transaction blocked',
          autoExecute: true,
        });
        recommendations.push({
          action: 'flag_for_compliance',
          priority: 'immediate',
          reason: 'Critical risk requires compliance review',
        });
        recommendations.push({
          action: 'suspend_account',
          priority: 'high',
          reason: 'Account suspension recommended pending investigation',
        });
        break;

      case 'high':
        recommendations.push({
          action: 'delay_withdrawal',
          priority: 'high',
          reason: 'High risk - withdrawals delayed for review',
          parameters: { delayHours: 24 },
        });
        recommendations.push({
          action: 'manual_review',
          priority: 'high',
          reason: 'High risk requires manual review',
        });
        recommendations.push({
          action: 'require_2fa',
          priority: 'high',
          reason: 'Additional authentication required',
          autoExecute: true,
        });
        break;

      case 'medium':
        recommendations.push({
          action: 'enhanced_monitoring',
          priority: 'medium',
          reason: 'Enhanced monitoring enabled',
          autoExecute: true,
        });
        recommendations.push({
          action: 'require_verification',
          priority: 'medium',
          reason: 'Additional verification may be required',
        });
        break;

      case 'low':
        recommendations.push({
          action: 'no_action',
          priority: 'low',
          reason: 'Normal activity - no action required',
        });
        break;
    }

    // Signal-specific recommendations
    for (const signal of signals) {
      const signalRecommendations = this.getSignalRecommendations(signal);
      for (const rec of signalRecommendations) {
        // Don't duplicate actions
        if (!recommendations.some((r) => r.action === rec.action)) {
          recommendations.push(rec);
        }
      }
    }

    // Sort by priority
    const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Get recommendations for specific signal types
   */
  private getSignalRecommendations(signal: RiskSignal): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    switch (signal.type) {
      case 'bot_detected':
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'Bot activity detected',
          autoExecute: true,
        });
        break;

      case 'tor_detected':
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'Tor exit node detected',
          autoExecute: true,
        });
        break;

      case 'geo_velocity_violation':
        recommendations.push({
          action: 'require_2fa',
          priority: 'high',
          reason: 'Impossible travel detected',
          autoExecute: true,
        });
        recommendations.push({
          action: 'notify_user',
          priority: 'high',
          reason: 'Alert user of unusual location',
        });
        break;

      case 'new_device':
        recommendations.push({
          action: 'require_verification',
          priority: 'medium',
          reason: 'New device detected',
        });
        break;

      case 'multi_account':
        recommendations.push({
          action: 'flag_for_compliance',
          priority: 'high',
          reason: 'Multiple accounts linked',
        });
        break;

      case 'bonus_abuse':
        recommendations.push({
          action: 'limit_withdrawals',
          priority: 'high',
          reason: 'Bonus abuse pattern detected',
          parameters: { maxPerDay: 100 },
        });
        break;

      case 'wash_trading':
      case 'self_trading':
        recommendations.push({
          action: 'block_trade',
          priority: 'immediate',
          reason: 'Wash trading/self-trading detected',
          autoExecute: true,
        });
        recommendations.push({
          action: 'suspend_account',
          priority: 'high',
          reason: 'Market manipulation suspected',
        });
        break;
    }

    return recommendations;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Normalize a score to 0-1 range
   */
  normalizeScore(score: number, min: number = 0, max: number = 1): number {
    return Math.max(min, Math.min(max, score));
  }

  /**
   * Calculate exponential moving average for historical scores
   */
  calculateEMA(currentScore: number, previousScore: number, alpha: number = 0.3): number {
    return alpha * currentScore + (1 - alpha) * previousScore;
  }

  /**
   * Get score explanation
   */
  explainScore(components: ScoreComponents): string {
    const explanations: string[] = [];

    if (components.velocityScore > 0.3) {
      explanations.push(`Velocity: ${(components.velocityScore * 100).toFixed(0)}%`);
    }
    if (components.deviceScore > 0.3) {
      explanations.push(`Device: ${(components.deviceScore * 100).toFixed(0)}%`);
    }
    if (components.ipScore > 0.3) {
      explanations.push(`IP: ${(components.ipScore * 100).toFixed(0)}%`);
    }
    if (components.behaviorScore > 0.3) {
      explanations.push(`Behavior: ${(components.behaviorScore * 100).toFixed(0)}%`);
    }
    if (components.multiAccountScore > 0.3) {
      explanations.push(`Multi-Account: ${(components.multiAccountScore * 100).toFixed(0)}%`);
    }
    if (components.bonusAbuseScore > 0.3) {
      explanations.push(`Bonus Abuse: ${(components.bonusAbuseScore * 100).toFixed(0)}%`);
    }

    for (const bonus of components.bonuses) {
      explanations.push(`Bonus: -${(bonus.value * 100).toFixed(0)}% (${bonus.name})`);
    }

    for (const penalty of components.penalties) {
      explanations.push(`Penalty: +${(penalty.value * 100).toFixed(0)}% (${penalty.name})`);
    }

    return explanations.join(', ');
  }
}

export default RiskScoringEngine;
