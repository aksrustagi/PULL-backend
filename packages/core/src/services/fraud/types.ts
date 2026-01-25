/**
 * Fraud Detection Types
 * Comprehensive types for fraud detection, velocity checks, device fingerprinting,
 * IP analysis, and behavioral analysis
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface FraudDetectionClientConfig {
  riskThresholds?: RiskThresholds;
  velocityConfig?: VelocityConfig;
  deviceConfig?: DeviceFingerprintConfig;
  ipConfig?: IPAnalysisConfig;
  behaviorConfig?: BehaviorAnalysisConfig;
  enableRealtime?: boolean;
  batchWindowMs?: number;
  logger?: Logger;
  redisClient?: RedisClientInterface;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface RedisClientInterface {
  get<T = string>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  incrBy(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  execute<T>(command: unknown[]): Promise<T>;
}

export interface RiskThresholds {
  highRiskScore: number;
  mediumRiskScore: number;
  maxVelocityPerMinute: number;
  minTimeBetweenTrades: number;
  maxDailyVolume: number;
  suspiciousVolumeMultiplier: number;
}

// ============================================================================
// Velocity Configuration Types
// ============================================================================

export interface VelocityConfig {
  deposits: VelocityLimits;
  withdrawals: VelocityLimits;
  bets: VelocityLimits;
  trades: VelocityLimits;
  logins: VelocityLimits;
}

export interface VelocityLimits {
  perHour: number;
  perDay: number;
  perWeek: number;
  perMonth: number;
  maxAmount?: number;
  maxAmountPerDay?: number;
  maxAmountPerWeek?: number;
}

export interface VelocityCheckResult {
  allowed: boolean;
  limitType: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'amount';
  current: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  riskScore: number;
  signals: RiskSignal[];
}

export interface VelocityRecord {
  userId: string;
  actionType: VelocityActionType;
  count: number;
  totalAmount: number;
  windowStart: Date;
  windowEnd: Date;
  lastAction: Date;
}

export type VelocityActionType =
  | 'deposit'
  | 'withdrawal'
  | 'bet'
  | 'trade'
  | 'login'
  | 'password_reset'
  | 'device_change'
  | 'ip_change';

// ============================================================================
// Device Fingerprinting Types
// ============================================================================

export interface DeviceFingerprintConfig {
  maxDevicesPerUser: number;
  newDeviceCooldownHours: number;
  suspiciousDeviceSharing: number;
  requiredSignals: DeviceSignalType[];
  blockKnownEmulators: boolean;
  blockKnownVMs: boolean;
}

export interface DeviceFingerprint {
  fingerprintId: string;
  userId: string;
  hash: string;

  // Browser signals
  userAgent: string;
  platform: string;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  timezoneOffset: number;
  language: string;
  languages: string[];

  // Hardware signals
  hardwareConcurrency: number;
  deviceMemory?: number;
  maxTouchPoints: number;

  // Canvas/WebGL fingerprint
  canvasHash?: string;
  webglHash?: string;
  webglVendor?: string;
  webglRenderer?: string;

  // Audio fingerprint
  audioHash?: string;

  // Font fingerprint
  fontHash?: string;
  installedFonts?: string[];

  // Plugin/Extension detection
  plugins: string[];
  doNotTrack: boolean;
  cookiesEnabled: boolean;

  // Bot detection signals
  webdriver: boolean;
  automation: boolean;
  headless: boolean;

  // Session info
  sessionId?: string;
  ipAddress?: string;

  // Metadata
  firstSeen: Date;
  lastSeen: Date;
  trustScore: number;
  isVerified: boolean;
  isSuspicious: boolean;
  suspiciousReasons: string[];
}

export type DeviceSignalType =
  | 'userAgent'
  | 'screenResolution'
  | 'timezone'
  | 'language'
  | 'hardwareConcurrency'
  | 'canvas'
  | 'webgl'
  | 'audio'
  | 'fonts';

export interface DeviceAnalysisResult {
  deviceId: string;
  isNewDevice: boolean;
  isKnownDevice: boolean;
  isSharedDevice: boolean;
  isSuspicious: boolean;
  isEmulator: boolean;
  isVirtualMachine: boolean;
  isBot: boolean;

  trustScore: number;
  riskScore: number;

  matchedUsers: string[];
  deviceHistory: DeviceHistoryEntry[];
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export interface DeviceHistoryEntry {
  timestamp: Date;
  action: string;
  ipAddress: string;
  location?: GeoLocation;
  success: boolean;
}

export interface DeviceSharingAlert {
  alertId: string;
  deviceHash: string;
  users: string[];
  firstDetected: Date;
  lastSeen: Date;
  riskLevel: RiskLevel;
  evidence: DeviceSharingEvidence;
}

export interface DeviceSharingEvidence {
  sharedSignals: string[];
  overlapPercentage: number;
  simultaneousLogins: boolean;
  differentLocations: boolean;
  suspiciousPatterns: string[];
}

// ============================================================================
// IP Analysis Types
// ============================================================================

export interface IPAnalysisConfig {
  blockVPN: boolean;
  blockProxy: boolean;
  blockTor: boolean;
  blockDatacenter: boolean;
  allowedCountries: string[];
  blockedCountries: string[];
  maxLoginAttemptsPerIP: number;
  suspiciousIPThreshold: number;
}

export interface IPAddress {
  ip: string;
  version: 'ipv4' | 'ipv6';
}

export interface IPAnalysisResult {
  ip: string;
  isValid: boolean;

  // Connection type
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  isResidential: boolean;
  isMobile: boolean;

  // Geolocation
  location: GeoLocation;

  // Reputation
  reputationScore: number;
  threatLevel: ThreatLevel;
  abuseConfidence: number;

  // Historical data
  previousUsers: string[];
  previousActivity: IPActivityRecord[];

  // Risk assessment
  riskScore: number;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export interface GeoLocation {
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  organization: string;
  asn: string;
  asnOrganization: string;
}

export interface IPActivityRecord {
  timestamp: Date;
  userId: string;
  action: string;
  success: boolean;
  deviceFingerprint?: string;
}

export interface IPReputationData {
  ip: string;
  score: number;
  lastUpdated: Date;
  reports: IPAbuseReport[];
  categories: IPCategory[];
}

export interface IPAbuseReport {
  reportedAt: Date;
  category: string;
  confidence: number;
  source: string;
}

export type IPCategory =
  | 'spam'
  | 'bot'
  | 'brute_force'
  | 'fraud'
  | 'malware'
  | 'phishing'
  | 'scraping'
  | 'attack';

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface GeoVelocityCheck {
  userId: string;
  previousLocation: GeoLocation;
  currentLocation: GeoLocation;
  timeDifferenceMs: number;
  distanceKm: number;
  requiredTravelTimeHours: number;
  isPossible: boolean;
  riskScore: number;
}

// ============================================================================
// Behavioral Analysis Types
// ============================================================================

export interface BehaviorAnalysisConfig {
  sessionTimeoutMinutes: number;
  minSessionsForBaseline: number;
  anomalyThreshold: number;
  patternWindowDays: number;
  enableMLScoring: boolean;
}

export interface BehaviorProfile {
  userId: string;

  // Session behavior
  avgSessionDuration: number;
  avgSessionsPerDay: number;
  preferredLoginTimes: number[];
  preferredDays: number[];

  // Trading behavior
  avgTradeSize: number;
  avgTradesPerSession: number;
  preferredMarkets: string[];
  tradingPatterns: TradingPattern[];

  // Financial behavior
  avgDepositAmount: number;
  avgWithdrawalAmount: number;
  depositFrequency: number;
  withdrawalFrequency: number;

  // Risk tolerance
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize: number;
  leverageUsage: number;

  // Computed metrics
  behaviorScore: number;
  consistencyScore: number;
  lastUpdated: Date;
}

export interface TradingPattern {
  patternType: TradingPatternType;
  frequency: number;
  avgValue: number;
  marketTypes: string[];
  timeOfDay: number[];
  confidence: number;
}

export type TradingPatternType =
  | 'scalping'
  | 'day_trading'
  | 'swing_trading'
  | 'position_trading'
  | 'arbitrage'
  | 'market_making'
  | 'momentum'
  | 'mean_reversion';

export interface BehaviorAnomalyResult {
  userId: string;
  isAnomaly: boolean;
  anomalyScore: number;
  anomalyType: BehaviorAnomalyType;

  expectedBehavior: Partial<BehaviorProfile>;
  observedBehavior: Partial<BehaviorProfile>;
  deviations: BehaviorDeviation[];

  riskScore: number;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export type BehaviorAnomalyType =
  | 'session_anomaly'
  | 'trading_anomaly'
  | 'deposit_anomaly'
  | 'withdrawal_anomaly'
  | 'time_anomaly'
  | 'location_anomaly'
  | 'pattern_break';

export interface BehaviorDeviation {
  metric: string;
  expected: number;
  observed: number;
  deviationPercent: number;
  significance: 'low' | 'medium' | 'high';
}

// ============================================================================
// Multi-Accounting Detection Types
// ============================================================================

export interface MultiAccountDetectionResult {
  userId: string;
  isMultiAccount: boolean;
  confidence: number;

  linkedAccounts: LinkedAccount[];
  linkingSignals: AccountLinkingSignal[];

  riskScore: number;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export interface LinkedAccount {
  userId: string;
  linkType: AccountLinkType;
  confidence: number;
  evidence: string[];
  firstDetected: Date;
  lastSeen: Date;
}

export type AccountLinkType =
  | 'same_device'
  | 'same_ip'
  | 'same_payment_method'
  | 'same_email_domain'
  | 'similar_username'
  | 'same_phone'
  | 'behavioral_similarity'
  | 'referral_abuse'
  | 'coordinated_trading';

export interface AccountLinkingSignal {
  signalType: AccountLinkType;
  strength: number;
  evidence: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// Bonus Abuse Detection Types
// ============================================================================

export interface BonusAbuseDetectionResult {
  userId: string;
  isAbusive: boolean;
  abuseType: BonusAbuseType[];
  confidence: number;

  bonusHistory: BonusUsage[];
  suspiciousPatterns: BonusAbusePattern[];

  riskScore: number;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export type BonusAbuseType =
  | 'multi_account_bonus'
  | 'bonus_hunting'
  | 'wagering_manipulation'
  | 'arbitrage_abuse'
  | 'referral_fraud'
  | 'promo_code_abuse'
  | 'chargeback_fraud';

export interface BonusUsage {
  bonusId: string;
  bonusType: string;
  amount: number;
  wagerRequirement: number;
  wagerProgress: number;
  claimedAt: Date;
  completedAt?: Date;
  status: 'active' | 'completed' | 'expired' | 'forfeited';
}

export interface BonusAbusePattern {
  patternType: BonusAbuseType;
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
  detectedAt: Date;
}

// ============================================================================
// Deposit/Withdrawal Cycle Detection Types
// ============================================================================

export interface DepositWithdrawalCycleResult {
  userId: string;
  isSuspicious: boolean;
  cycleType: CycleType;

  cycles: FinancialCycle[];
  totalCycledAmount: number;
  avgCycleTime: number;

  riskScore: number;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
}

export type CycleType =
  | 'rapid_cycle'
  | 'minimal_play'
  | 'layering'
  | 'structuring'
  | 'smurfing';

export interface FinancialCycle {
  cycleId: string;
  depositId: string;
  withdrawalId: string;
  depositAmount: number;
  withdrawalAmount: number;
  depositTime: Date;
  withdrawalTime: Date;
  cycleTimeMs: number;
  bettingActivity: number;
  playThroughRatio: number;
}

// ============================================================================
// Trade Types
// ============================================================================

export interface Trade {
  tradeId: string;
  userId: string;
  marketId: string;
  side: 'buy' | 'sell';
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
  tradingVelocity: number;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface Transaction {
  transactionId: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  paymentMethod?: string;
  paymentMethodId?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'bet'
  | 'win'
  | 'loss'
  | 'bonus'
  | 'refund'
  | 'fee'
  | 'transfer';

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reversed';

// ============================================================================
// Risk Assessment Types
// ============================================================================

export interface RiskAssessment {
  assessmentId: string;
  entityId: string;
  entityType: 'user' | 'trade' | 'market' | 'transaction' | 'device' | 'ip';
  riskScore: number;
  riskLevel: RiskLevel;
  signals: RiskSignal[];
  recommendations: RiskRecommendation[];
  assessedAt: Date;
  expiresAt?: Date;

  // Component scores
  velocityScore?: number;
  deviceScore?: number;
  ipScore?: number;
  behaviorScore?: number;
  multiAccountScore?: number;
  bonusAbuseScore?: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignal {
  signalId: string;
  type: RiskSignalType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
  detectedAt: Date;
}

export type RiskSignalType =
  | 'wash_trading'
  | 'self_trading'
  | 'velocity_spike'
  | 'volume_manipulation'
  | 'spoofing'
  | 'layering'
  | 'front_running'
  | 'coordinated_trading'
  | 'account_takeover'
  | 'device_anomaly'
  | 'location_anomaly'
  | 'new_account_abuse'
  | 'multi_account'
  | 'suspicious_pattern'
  | 'vpn_detected'
  | 'proxy_detected'
  | 'tor_detected'
  | 'datacenter_ip'
  | 'geo_velocity_violation'
  | 'device_sharing'
  | 'new_device'
  | 'emulator_detected'
  | 'bot_detected'
  | 'deposit_velocity'
  | 'withdrawal_velocity'
  | 'bet_velocity'
  | 'rapid_deposit_withdrawal'
  | 'bonus_abuse'
  | 'referral_fraud'
  | 'behavioral_anomaly'
  | 'time_anomaly'
  | 'amount_anomaly'
  | 'pattern_break';

export interface RiskRecommendation {
  action: RecommendedAction;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  reason: string;
  autoExecute?: boolean;
  parameters?: Record<string, unknown>;
}

export type RecommendedAction =
  | 'block_trade'
  | 'block_transaction'
  | 'delay_trade'
  | 'delay_withdrawal'
  | 'require_2fa'
  | 'require_verification'
  | 'manual_review'
  | 'suspend_account'
  | 'limit_trading'
  | 'limit_deposits'
  | 'limit_withdrawals'
  | 'flag_for_compliance'
  | 'notify_user'
  | 'notify_admin'
  | 'enhanced_monitoring'
  | 'cool_down_period'
  | 'no_action';

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
  | 'same_device'
  | 'same_ip'
  | 'similar_behavior'
  | 'linked_wallets'
  | 'known_associate';

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
  timeToCancel: number;
  priceImpact: number;
  timestamp: Date;
}

export interface LayeringEvent {
  eventId: string;
  userId: string;
  layerCount: number;
  totalVolume: number;
  priceRange: { min: number; max: number };
  intendedDirection: 'up' | 'down';
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

  // Device/IP history
  knownDevices: string[];
  knownIPs: string[];

  // Velocity stats
  velocityStats: VelocityStats;
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
  volatilityPreference: 'low' | 'medium' | 'high';
}

export interface VelocityStats {
  depositsToday: number;
  depositsThisWeek: number;
  withdrawalsToday: number;
  withdrawalsThisWeek: number;
  betsToday: number;
  betsThisWeek: number;
  tradesToday: number;
  tradesThisWeek: number;
}

export interface AccountFlag {
  flag: string;
  severity: 'warning' | 'alert' | 'critical';
  reason: string;
  createdAt: Date;
  expiresAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

export interface AccountRestriction {
  type: RestrictionType;
  reason: string;
  appliedAt: Date;
  expiresAt?: Date;
  appliedBy: string;
  parameters?: Record<string, unknown>;
}

export type RestrictionType =
  | 'trading_suspended'
  | 'withdrawal_suspended'
  | 'deposit_suspended'
  | 'volume_limited'
  | 'markets_restricted'
  | 'monitoring_enhanced'
  | 'bonus_ineligible'
  | 'referral_ineligible';

// ============================================================================
// Alert Types
// ============================================================================

export interface FraudAlert {
  alertId: string;
  type: AlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityId: string;
  entityType: 'user' | 'trade' | 'market' | 'transaction' | 'device' | 'ip';
  description: string;
  evidence: Record<string, unknown>;
  status: AlertStatus;
  assignedTo?: string;
  createdAt: Date;
  updatedAt?: Date;
  resolvedAt?: Date;
  resolution?: AlertResolution;

  // Related entities
  relatedAlerts?: string[];
  affectedUsers?: string[];
}

export type AlertType =
  | 'wash_trading_detected'
  | 'manipulation_suspected'
  | 'velocity_exceeded'
  | 'volume_anomaly'
  | 'coordinated_activity'
  | 'account_anomaly'
  | 'compliance_trigger'
  | 'multi_account_detected'
  | 'bonus_abuse_detected'
  | 'device_anomaly'
  | 'ip_anomaly'
  | 'geo_velocity_alert'
  | 'behavioral_anomaly'
  | 'deposit_withdrawal_cycle'
  | 'referral_fraud'
  | 'bot_detected'
  | 'vpn_proxy_detected';

export type AlertStatus = 'new' | 'investigating' | 'escalated' | 'resolved' | 'dismissed' | 'false_positive';

export interface AlertResolution {
  action: string;
  reason: string;
  resolvedBy: string;
  resolvedAt: Date;
  notes?: string;
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
  | 'wash_trading'
  | 'velocity'
  | 'volume_anomaly'
  | 'manipulation'
  | 'network_analysis'
  | 'multi_account'
  | 'bonus_abuse'
  | 'behavioral';

export interface BatchAnalysisOptions {
  windowMs?: number;
  includeHistorical?: boolean;
  sensitivityLevel?: 'low' | 'normal' | 'high';
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
  samplingRate: number;
  alertThreshold: number;
  cooldownMs: number;
}

export interface MonitoringStats {
  tradesAnalyzed: number;
  transactionsAnalyzed: number;
  alertsGenerated: number;
  tradesFlagged: number;
  transactionsFlagged: number;
  averageLatencyMs: number;
  lastUpdated: Date;
}

// ============================================================================
// Fraud Rule Types
// ============================================================================

export interface FraudRule {
  ruleId: string;
  name: string;
  description: string;
  category: RuleCategory;
  enabled: boolean;
  priority: number;

  conditions: RuleCondition[];
  actions: RuleAction[];

  cooldownSeconds?: number;
  maxTriggersPerHour?: number;

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type RuleCategory =
  | 'velocity'
  | 'device'
  | 'ip'
  | 'behavior'
  | 'multi_account'
  | 'bonus'
  | 'trading'
  | 'financial';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: unknown;
  dataSource?: string;
}

export type RuleOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'regex'
  | 'exists'
  | 'not_exists';

export interface RuleAction {
  type: RecommendedAction;
  parameters?: Record<string, unknown>;
}

export interface RuleEvaluationResult {
  ruleId: string;
  triggered: boolean;
  conditions: ConditionEvaluationResult[];
  actions: RuleAction[];
  evaluatedAt: Date;
}

export interface ConditionEvaluationResult {
  condition: RuleCondition;
  passed: boolean;
  actualValue: unknown;
}

// ============================================================================
// Scoring Types
// ============================================================================

export interface ScoringWeights {
  velocity: number;
  device: number;
  ip: number;
  behavior: number;
  multiAccount: number;
  bonusAbuse: number;
  trading: number;
  history: number;
}

export interface ScoreComponents {
  baseScore: number;
  velocityScore: number;
  deviceScore: number;
  ipScore: number;
  behaviorScore: number;
  multiAccountScore: number;
  bonusAbuseScore: number;
  tradingScore: number;
  historyScore: number;

  bonuses: ScoreBonus[];
  penalties: ScorePenalty[];

  finalScore: number;
}

export interface ScoreBonus {
  name: string;
  value: number;
  reason: string;
}

export interface ScorePenalty {
  name: string;
  value: number;
  reason: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class FraudDetectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FraudDetectionError';
  }
}

export class VelocityLimitError extends FraudDetectionError {
  constructor(
    message: string,
    public readonly limitType: string,
    public readonly current: number,
    public readonly limit: number
  ) {
    super(message, 'VELOCITY_LIMIT_EXCEEDED', { limitType, current, limit });
    this.name = 'VelocityLimitError';
  }
}

export class DeviceFingerprintError extends FraudDetectionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DEVICE_FINGERPRINT_ERROR', details);
    this.name = 'DeviceFingerprintError';
  }
}

export class IPAnalysisError extends FraudDetectionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'IP_ANALYSIS_ERROR', details);
    this.name = 'IPAnalysisError';
  }
}
