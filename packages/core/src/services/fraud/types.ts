/**
 * Fraud Detection Types
 * Types for detecting wash trading, manipulation, and suspicious activity
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface FraudDetectionClientConfig {
  riskThresholds?: RiskThresholds;
  enableRealtime?: boolean;
  batchWindowMs?: number;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface RiskThresholds {
  highRiskScore: number; // Score above which to flag as high risk (default: 0.8)
  mediumRiskScore: number; // Score above which to flag as medium risk (default: 0.5)
  maxVelocityPerMinute: number; // Max trades per minute before flagging
  minTimeBetweenTrades: number; // Minimum seconds between trades
  maxDailyVolume: number; // Maximum daily volume per user
  suspiciousVolumeMultiplier: number; // Volume multiplier vs average to flag
}

// ============================================================================
// Trade Types
// ============================================================================

export interface Trade {
  tradeId: string;
  userId: string;
  marketId: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  totalValue: number;
  timestamp: Date;
  counterpartyId?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  sessionId?: string;
}

export interface TradePattern {
  userId: string;
  trades: Trade[];
  startTime: Date;
  endTime: Date;
  totalVolume: number;
  tradeCount: number;
  uniqueMarkets: number;
  averageTradeSize: number;
  tradingVelocity: number; // Trades per minute
}

// ============================================================================
// Risk Assessment Types
// ============================================================================

export interface RiskAssessment {
  assessmentId: string;
  entityId: string;
  entityType: "user" | "trade" | "market";
  riskScore: number; // 0-1 scale
  riskLevel: RiskLevel;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
  assessedAt: Date;
  expiresAt?: Date;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskSignal {
  signalId: string;
  type: RiskSignalType;
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
  detectedAt: Date;
}

export type RiskSignalType =
  | "wash_trading"
  | "self_trading"
  | "velocity_spike"
  | "volume_manipulation"
  | "spoofing"
  | "layering"
  | "front_running"
  | "coordinated_trading"
  | "account_takeover"
  | "device_anomaly"
  | "location_anomaly"
  | "new_account_abuse"
  | "multi_account"
  | "suspicious_pattern";

export interface RiskRecommendation {
  action: RecommendedAction;
  priority: "immediate" | "high" | "medium" | "low";
  reason: string;
  autoExecute?: boolean;
}

export type RecommendedAction =
  | "block_trade"
  | "delay_trade"
  | "require_2fa"
  | "manual_review"
  | "suspend_account"
  | "limit_trading"
  | "flag_for_compliance"
  | "notify_user"
  | "no_action";

// ============================================================================
// Wash Trading Detection Types
// ============================================================================

export interface WashTradingAnalysis {
  userId: string;
  analysisWindow: { start: Date; end: Date };
  selfTradeCount: number;
  selfTradeVolume: number;
  relatedAccountTrades: RelatedAccountTrade[];
  circularTradingPatterns: CircularPattern[];
  riskScore: number;
  isWashTrading: boolean;
}

export interface RelatedAccountTrade {
  userId: string;
  counterpartyId: string;
  relationshipType: RelationshipType;
  tradeCount: number;
  totalVolume: number;
  confidence: number;
}

export type RelationshipType =
  | "same_device"
  | "same_ip"
  | "similar_behavior"
  | "linked_wallets"
  | "known_associate";

export interface CircularPattern {
  participants: string[];
  trades: Trade[];
  totalVolume: number;
  patternDurationMs: number;
  confidence: number;
}

// ============================================================================
// Market Manipulation Types
// ============================================================================

export interface ManipulationAnalysis {
  marketId: string;
  analysisWindow: { start: Date; end: Date };
  spoofingEvents: SpoofingEvent[];
  layeringEvents: LayeringEvent[];
  pumpAndDumpPatterns: PumpDumpPattern[];
  priceImpactAnalysis: PriceImpactAnalysis;
  riskScore: number;
}

export interface SpoofingEvent {
  eventId: string;
  userId: string;
  ordersCancelled: number;
  volumeCancelled: number;
  timeToCancel: number; // milliseconds
  priceImpact: number;
  timestamp: Date;
}

export interface LayeringEvent {
  eventId: string;
  userId: string;
  layerCount: number;
  totalVolume: number;
  priceRange: { min: number; max: number };
  intendedDirection: "up" | "down";
  timestamp: Date;
}

export interface PumpDumpPattern {
  patternId: string;
  participants: string[];
  pumpPhase: {
    startTime: Date;
    endTime: Date;
    priceIncrease: number;
    volumeIncrease: number;
  };
  dumpPhase?: {
    startTime: Date;
    endTime: Date;
    priceDecrease: number;
    volumeIncrease: number;
  };
  confidence: number;
}

export interface PriceImpactAnalysis {
  marketId: string;
  normalVolatility: number;
  currentVolatility: number;
  abnormalPriceMovements: AbnormalPriceMovement[];
}

export interface AbnormalPriceMovement {
  timestamp: Date;
  priceChange: number;
  volumeAtTime: number;
  expectedPriceChange: number;
  deviation: number;
  potentialCause?: string;
}

// ============================================================================
// User Risk Profile Types
// ============================================================================

export interface UserRiskProfile {
  userId: string;
  overallRiskScore: number;
  riskLevel: RiskLevel;
  riskFactors: UserRiskFactor[];
  tradingBehavior: TradingBehavior;
  accountFlags: AccountFlag[];
  restrictions: AccountRestriction[];
  lastAssessment: Date;
  nextAssessment: Date;
}

export interface UserRiskFactor {
  factor: string;
  score: number;
  weight: number;
  lastUpdated: Date;
}

export interface TradingBehavior {
  averageDailyVolume: number;
  averageTradeSize: number;
  preferredMarkets: string[];
  tradingHours: number[];
  winRate: number;
  volatilityPreference: "low" | "medium" | "high";
}

export interface AccountFlag {
  flag: string;
  severity: "warning" | "alert" | "critical";
  reason: string;
  createdAt: Date;
  expiresAt?: Date;
  resolvedAt?: Date;
}

export interface AccountRestriction {
  type: RestrictionType;
  reason: string;
  appliedAt: Date;
  expiresAt?: Date;
  appliedBy: string;
}

export type RestrictionType =
  | "trading_suspended"
  | "withdrawal_suspended"
  | "volume_limited"
  | "markets_restricted"
  | "monitoring_enhanced";

// ============================================================================
// Alert Types
// ============================================================================

export interface FraudAlert {
  alertId: string;
  type: AlertType;
  severity: "low" | "medium" | "high" | "critical";
  entityId: string;
  entityType: "user" | "trade" | "market";
  description: string;
  evidence: Record<string, unknown>;
  status: AlertStatus;
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: AlertResolution;
}

export type AlertType =
  | "wash_trading_detected"
  | "manipulation_suspected"
  | "velocity_exceeded"
  | "volume_anomaly"
  | "coordinated_activity"
  | "account_anomaly"
  | "compliance_trigger";

export type AlertStatus = "new" | "investigating" | "escalated" | "resolved" | "dismissed";

export interface AlertResolution {
  action: string;
  reason: string;
  resolvedBy: string;
  resolvedAt: Date;
}

// ============================================================================
// Batch Analysis Types
// ============================================================================

export interface BatchAnalysisRequest {
  trades: Trade[];
  analysisTypes: AnalysisType[];
  options?: BatchAnalysisOptions;
}

export type AnalysisType =
  | "wash_trading"
  | "velocity"
  | "volume_anomaly"
  | "manipulation"
  | "network_analysis";

export interface BatchAnalysisOptions {
  windowMs?: number;
  includeHistorical?: boolean;
  sensitivityLevel?: "low" | "normal" | "high";
}

export interface BatchAnalysisResult {
  analysisId: string;
  totalTrades: number;
  flaggedTrades: number;
  userRiskScores: Map<string, number>;
  alerts: FraudAlert[];
  completedAt: Date;
  processingTimeMs: number;
}

// ============================================================================
// Real-time Monitoring Types
// ============================================================================

export interface MonitoringConfig {
  enabled: boolean;
  samplingRate: number; // 0-1, percentage of trades to analyze
  alertThreshold: number;
  cooldownMs: number; // Time between alerts for same entity
}

export interface MonitoringStats {
  tradesAnalyzed: number;
  alertsGenerated: number;
  tradesFlagged: number;
  averageLatencyMs: number;
  lastUpdated: Date;
}

// ============================================================================
// Error Types
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
