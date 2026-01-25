/**
 * Fraud Detection Client
 * Comprehensive fraud detection with velocity checks, device fingerprinting,
 * IP analysis, behavioral analysis, and multi-accounting detection
 */

import * as crypto from 'crypto';
import type {
  FraudDetectionClientConfig,
  Logger,
  RiskThresholds,
  VelocityConfig,
  VelocityLimits,
  VelocityCheckResult,
  VelocityActionType,
  DeviceFingerprintConfig,
  DeviceFingerprint,
  DeviceAnalysisResult,
  DeviceHistoryEntry,
  IPAnalysisConfig,
  IPAnalysisResult,
  GeoLocation,
  GeoVelocityCheck,
  ThreatLevel,
  BehaviorAnalysisConfig,
  BehaviorProfile,
  BehaviorAnomalyResult,
  BehaviorAnomalyType,
  BehaviorDeviation,
  MultiAccountDetectionResult,
  LinkedAccount,
  AccountLinkType,
  AccountLinkingSignal,
  BonusAbuseDetectionResult,
  BonusAbuseType,
  BonusUsage,
  BonusAbusePattern,
  DepositWithdrawalCycleResult,
  FinancialCycle,
  CycleType,
  Trade,
  TradePattern,
  Transaction,
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
  RedisClientInterface,
} from './types';
import { FraudDetectionError } from './types';
import { FraudRulesEngine, EvaluationContext } from './rules';
import { RiskScoringEngine, ScoringContext } from './scoring';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_THRESHOLDS: RiskThresholds = {
  highRiskScore: 0.7,
  mediumRiskScore: 0.4,
  maxVelocityPerMinute: 10,
  minTimeBetweenTrades: 5,
  maxDailyVolume: 1000000,
  suspiciousVolumeMultiplier: 5,
};

const DEFAULT_VELOCITY_CONFIG: VelocityConfig = {
  deposits: {
    perHour: 5,
    perDay: 10,
    perWeek: 30,
    perMonth: 100,
    maxAmount: 10000,
    maxAmountPerDay: 50000,
    maxAmountPerWeek: 100000,
  },
  withdrawals: {
    perHour: 3,
    perDay: 5,
    perWeek: 15,
    perMonth: 50,
    maxAmount: 10000,
    maxAmountPerDay: 25000,
    maxAmountPerWeek: 75000,
  },
  bets: {
    perHour: 100,
    perDay: 500,
    perWeek: 2000,
    perMonth: 5000,
  },
  trades: {
    perHour: 50,
    perDay: 200,
    perWeek: 1000,
    perMonth: 3000,
  },
  logins: {
    perHour: 10,
    perDay: 30,
    perWeek: 100,
    perMonth: 300,
  },
};

const DEFAULT_DEVICE_CONFIG: DeviceFingerprintConfig = {
  maxDevicesPerUser: 5,
  newDeviceCooldownHours: 24,
  suspiciousDeviceSharing: 3,
  requiredSignals: ['userAgent', 'screenResolution', 'timezone', 'language'],
  blockKnownEmulators: true,
  blockKnownVMs: false,
};

const DEFAULT_IP_CONFIG: IPAnalysisConfig = {
  blockVPN: false,
  blockProxy: false,
  blockTor: true,
  blockDatacenter: false,
  allowedCountries: [],
  blockedCountries: ['KP', 'IR', 'SY', 'CU'],
  maxLoginAttemptsPerIP: 10,
  suspiciousIPThreshold: 30,
};

const DEFAULT_BEHAVIOR_CONFIG: BehaviorAnalysisConfig = {
  sessionTimeoutMinutes: 30,
  minSessionsForBaseline: 5,
  anomalyThreshold: 2.5,
  patternWindowDays: 30,
  enableMLScoring: false,
};

// ============================================================================
// Known patterns for detection
// ============================================================================

const KNOWN_EMULATOR_PATTERNS = [
  'BlueStacks',
  'Nox',
  'MEmu',
  'LDPlayer',
  'Genymotion',
  'Andy',
  'Droid4X',
  'Windroy',
];

const KNOWN_BOT_PATTERNS = [
  'Headless',
  'PhantomJS',
  'Selenium',
  'WebDriver',
  'Puppeteer',
  'Playwright',
];

const KNOWN_VPN_ASNS = [
  'AS9009', // M247
  'AS16509', // Amazon AWS
  'AS14618', // Amazon AWS
  'AS15169', // Google Cloud
  'AS8075', // Microsoft Azure
];

const TOR_EXIT_IPS_SAMPLE = new Set([
  // Sample of known Tor exit node IPs (in production, use a real-time list)
]);

// ============================================================================
// Fraud Detection Client
// ============================================================================

export class FraudDetectionClient {
  private readonly thresholds: RiskThresholds;
  private readonly velocityConfig: VelocityConfig;
  private readonly deviceConfig: DeviceFingerprintConfig;
  private readonly ipConfig: IPAnalysisConfig;
  private readonly behaviorConfig: BehaviorAnalysisConfig;
  private readonly enableRealtime: boolean;
  private readonly batchWindowMs: number;
  private readonly logger: Logger;
  private readonly redis?: RedisClientInterface;
  private readonly rulesEngine: FraudRulesEngine;
  private readonly scoringEngine: RiskScoringEngine;

  // In-memory caches (use Redis in production)
  private readonly userTradeHistory: Map<string, Trade[]> = new Map();
  private readonly userRiskProfiles: Map<string, UserRiskProfile> = new Map();
  private readonly deviceFingerprints: Map<string, DeviceFingerprint[]> = new Map();
  private readonly userDevices: Map<string, string[]> = new Map();
  private readonly ipUserMapping: Map<string, Set<string>> = new Map();
  private readonly deviceUserMapping: Map<string, Set<string>> = new Map();
  private readonly userBehaviorProfiles: Map<string, BehaviorProfile> = new Map();
  private readonly userTransactionHistory: Map<string, Transaction[]> = new Map();
  private readonly recentAlerts: Map<string, Date> = new Map();
  private readonly velocityCounters: Map<string, { count: number; amount: number; resetAt: Date }> = new Map();
  private readonly userSessions: Map<string, { lastLocation?: GeoLocation; lastTime: Date }> = new Map();

  private stats: MonitoringStats = {
    tradesAnalyzed: 0,
    transactionsAnalyzed: 0,
    alertsGenerated: 0,
    tradesFlagged: 0,
    transactionsFlagged: 0,
    averageLatencyMs: 0,
    lastUpdated: new Date(),
  };

  constructor(config: FraudDetectionClientConfig = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.riskThresholds };
    this.velocityConfig = { ...DEFAULT_VELOCITY_CONFIG, ...config.velocityConfig };
    this.deviceConfig = { ...DEFAULT_DEVICE_CONFIG, ...config.deviceConfig };
    this.ipConfig = { ...DEFAULT_IP_CONFIG, ...config.ipConfig };
    this.behaviorConfig = { ...DEFAULT_BEHAVIOR_CONFIG, ...config.behaviorConfig };
    this.enableRealtime = config.enableRealtime ?? true;
    this.batchWindowMs = config.batchWindowMs ?? 60000;
    this.logger = config.logger ?? this.createDefaultLogger();
    this.redis = config.redisClient;
    this.rulesEngine = new FraudRulesEngine({ logger: this.logger });
    this.scoringEngine = new RiskScoringEngine({ logger: this.logger });
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
  // Velocity Checks
  // ==========================================================================

  /**
   * Check velocity limits for a transaction type
   */
  async checkVelocity(
    userId: string,
    actionType: VelocityActionType,
    amount: number = 0
  ): Promise<VelocityCheckResult> {
    const limits = this.getVelocityLimits(actionType);
    const now = new Date();
    const signals: RiskSignal[] = [];

    // Get velocity counters from cache/redis
    const hourKey = `velocity:${userId}:${actionType}:hour`;
    const dayKey = `velocity:${userId}:${actionType}:day`;
    const weekKey = `velocity:${userId}:${actionType}:week`;
    const monthKey = `velocity:${userId}:${actionType}:month`;

    // Get or create counters
    const hourCounter = this.getOrCreateCounter(hourKey, 3600000); // 1 hour
    const dayCounter = this.getOrCreateCounter(dayKey, 86400000); // 1 day
    const weekCounter = this.getOrCreateCounter(weekKey, 604800000); // 1 week
    const monthCounter = this.getOrCreateCounter(monthKey, 2592000000); // 30 days

    // Check limits
    let allowed = true;
    let limitType: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'amount' = 'hourly';
    let current = 0;
    let limit = 0;
    let remaining = 0;
    let resetAt = hourCounter.resetAt;
    let riskScore = 0;

    // Hourly check
    if (hourCounter.count >= limits.perHour) {
      allowed = false;
      limitType = 'hourly';
      current = hourCounter.count;
      limit = limits.perHour;
      remaining = 0;
      resetAt = hourCounter.resetAt;
      riskScore = 0.6;
      signals.push(this.createVelocitySignal(actionType, 'hourly', current, limit));
    } else {
      remaining = limits.perHour - hourCounter.count;
    }

    // Daily check
    if (allowed && dayCounter.count >= limits.perDay) {
      allowed = false;
      limitType = 'daily';
      current = dayCounter.count;
      limit = limits.perDay;
      remaining = 0;
      resetAt = dayCounter.resetAt;
      riskScore = 0.7;
      signals.push(this.createVelocitySignal(actionType, 'daily', current, limit));
    }

    // Weekly check
    if (allowed && weekCounter.count >= limits.perWeek) {
      allowed = false;
      limitType = 'weekly';
      current = weekCounter.count;
      limit = limits.perWeek;
      remaining = 0;
      resetAt = weekCounter.resetAt;
      riskScore = 0.75;
      signals.push(this.createVelocitySignal(actionType, 'weekly', current, limit));
    }

    // Amount checks
    if (allowed && amount > 0) {
      if (limits.maxAmount && amount > limits.maxAmount) {
        allowed = false;
        limitType = 'amount';
        current = amount;
        limit = limits.maxAmount;
        remaining = 0;
        riskScore = 0.8;
        signals.push(this.createAmountSignal(actionType, amount, limits.maxAmount));
      }

      if (allowed && limits.maxAmountPerDay && dayCounter.amount + amount > limits.maxAmountPerDay) {
        allowed = false;
        limitType = 'amount';
        current = dayCounter.amount + amount;
        limit = limits.maxAmountPerDay;
        remaining = Math.max(0, limits.maxAmountPerDay - dayCounter.amount);
        resetAt = dayCounter.resetAt;
        riskScore = 0.75;
        signals.push(this.createAmountSignal(actionType, current, limit, 'daily'));
      }
    }

    // Calculate risk score based on usage
    if (allowed) {
      const hourlyUsage = hourCounter.count / limits.perHour;
      const dailyUsage = dayCounter.count / limits.perDay;
      riskScore = Math.max(hourlyUsage * 0.3, dailyUsage * 0.3);

      // Warn if approaching limits
      if (hourlyUsage > 0.8) {
        signals.push({
          signalId: crypto.randomUUID(),
          type: 'velocity_spike',
          severity: 'low',
          description: `Approaching hourly ${actionType} limit: ${hourCounter.count}/${limits.perHour}`,
          evidence: { usage: hourlyUsage },
          confidence: 0.7,
          detectedAt: now,
        });
      }
    }

    // Increment counters if allowed
    if (allowed) {
      hourCounter.count++;
      hourCounter.amount += amount;
      dayCounter.count++;
      dayCounter.amount += amount;
      weekCounter.count++;
      weekCounter.amount += amount;
      monthCounter.count++;
      monthCounter.amount += amount;
    }

    return {
      allowed,
      limitType,
      current,
      limit,
      remaining,
      resetAt,
      riskScore,
      signals,
    };
  }

  private getVelocityLimits(actionType: VelocityActionType): VelocityLimits {
    switch (actionType) {
      case 'deposit':
        return this.velocityConfig.deposits;
      case 'withdrawal':
        return this.velocityConfig.withdrawals;
      case 'bet':
        return this.velocityConfig.bets;
      case 'trade':
        return this.velocityConfig.trades;
      case 'login':
        return this.velocityConfig.logins;
      default:
        return this.velocityConfig.deposits;
    }
  }

  private getOrCreateCounter(key: string, windowMs: number): { count: number; amount: number; resetAt: Date } {
    const existing = this.velocityCounters.get(key);
    const now = new Date();

    if (existing && existing.resetAt > now) {
      return existing;
    }

    const counter = {
      count: 0,
      amount: 0,
      resetAt: new Date(now.getTime() + windowMs),
    };
    this.velocityCounters.set(key, counter);
    return counter;
  }

  private createVelocitySignal(
    actionType: VelocityActionType,
    period: string,
    current: number,
    limit: number
  ): RiskSignal {
    const typeMap: Record<VelocityActionType, RiskSignalType> = {
      deposit: 'deposit_velocity',
      withdrawal: 'withdrawal_velocity',
      bet: 'bet_velocity',
      trade: 'velocity_spike',
      login: 'velocity_spike',
      password_reset: 'velocity_spike',
      device_change: 'device_anomaly',
      ip_change: 'location_anomaly',
    };

    return {
      signalId: crypto.randomUUID(),
      type: typeMap[actionType],
      severity: 'high',
      description: `${period} ${actionType} limit exceeded: ${current}/${limit}`,
      evidence: { actionType, period, current, limit },
      confidence: 0.95,
      detectedAt: new Date(),
    };
  }

  private createAmountSignal(
    actionType: VelocityActionType,
    amount: number,
    limit: number,
    period?: string
  ): RiskSignal {
    return {
      signalId: crypto.randomUUID(),
      type: 'amount_anomaly',
      severity: 'high',
      description: period
        ? `${period} ${actionType} amount limit exceeded: $${amount.toLocaleString()}/$${limit.toLocaleString()}`
        : `${actionType} amount limit exceeded: $${amount.toLocaleString()}/$${limit.toLocaleString()}`,
      evidence: { actionType, amount, limit, period },
      confidence: 0.95,
      detectedAt: new Date(),
    };
  }

  // ==========================================================================
  // Device Fingerprinting
  // ==========================================================================

  /**
   * Analyze device fingerprint
   */
  async analyzeDevice(
    userId: string,
    fingerprint: Partial<DeviceFingerprint>
  ): Promise<DeviceAnalysisResult> {
    const now = new Date();
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];

    // Generate device hash
    const deviceHash = this.generateDeviceHash(fingerprint);

    // Check for known devices
    const userDevices = this.userDevices.get(userId) ?? [];
    const isKnownDevice = userDevices.includes(deviceHash);
    const isNewDevice = !isKnownDevice;

    // Check device sharing
    const deviceUsers = this.deviceUserMapping.get(deviceHash) ?? new Set();
    const matchedUsers = Array.from(deviceUsers).filter((u) => u !== userId);
    const isSharedDevice = matchedUsers.length > 0;

    // Emulator detection
    const isEmulator = this.detectEmulator(fingerprint);

    // VM detection
    const isVirtualMachine = this.detectVirtualMachine(fingerprint);

    // Bot detection
    const isBot = this.detectBot(fingerprint);

    // Calculate trust score
    let trustScore = 1.0;
    let isSuspicious = false;

    if (isNewDevice) {
      trustScore -= 0.2;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'new_device',
        severity: 'low',
        description: 'New device detected',
        evidence: { deviceHash },
        confidence: 0.9,
        detectedAt: now,
      });
    }

    if (isSharedDevice) {
      trustScore -= 0.3;
      isSuspicious = true;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'device_sharing',
        severity: 'medium',
        description: `Device shared with ${matchedUsers.length} other account(s)`,
        evidence: { deviceHash, matchedUsers },
        confidence: 0.85,
        detectedAt: now,
      });

      if (matchedUsers.length >= this.deviceConfig.suspiciousDeviceSharing) {
        recommendations.push({
          action: 'flag_for_compliance',
          priority: 'high',
          reason: 'Device sharing detected - potential multi-accounting',
        });
      }
    }

    if (isEmulator) {
      trustScore -= 0.5;
      isSuspicious = true;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'emulator_detected',
        severity: 'high',
        description: 'Emulator detected',
        evidence: { userAgent: fingerprint.userAgent },
        confidence: 0.9,
        detectedAt: now,
      });

      if (this.deviceConfig.blockKnownEmulators) {
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'Emulator use not allowed',
          autoExecute: true,
        });
      }
    }

    if (isVirtualMachine) {
      trustScore -= 0.3;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'device_anomaly',
        severity: 'medium',
        description: 'Virtual machine detected',
        evidence: { webglRenderer: fingerprint.webglRenderer },
        confidence: 0.85,
        detectedAt: now,
      });

      if (this.deviceConfig.blockKnownVMs) {
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'VM use not allowed',
          autoExecute: true,
        });
      }
    }

    if (isBot) {
      trustScore = 0;
      isSuspicious = true;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'bot_detected',
        severity: 'high',
        description: 'Automated bot detected',
        evidence: { webdriver: fingerprint.webdriver, automation: fingerprint.automation },
        confidence: 0.95,
        detectedAt: now,
      });
      recommendations.push({
        action: 'block_transaction',
        priority: 'immediate',
        reason: 'Bot activity detected',
        autoExecute: true,
      });
    }

    // Check for missing signals
    const missingSignals = this.checkMissingSignals(fingerprint);
    if (missingSignals.length > 0) {
      trustScore -= 0.1 * missingSignals.length;
      isSuspicious = missingSignals.length >= 3;
    }

    // Update mappings
    if (!userDevices.includes(deviceHash)) {
      userDevices.push(deviceHash);
      this.userDevices.set(userId, userDevices);

      if (userDevices.length > this.deviceConfig.maxDevicesPerUser) {
        signals.push({
          signalId: crypto.randomUUID(),
          type: 'device_anomaly',
          severity: 'medium',
          description: `User has ${userDevices.length} devices (max: ${this.deviceConfig.maxDevicesPerUser})`,
          evidence: { deviceCount: userDevices.length },
          confidence: 0.8,
          detectedAt: now,
        });
      }
    }

    deviceUsers.add(userId);
    this.deviceUserMapping.set(deviceHash, deviceUsers);

    // Calculate risk score
    const riskScore = Math.max(0, 1 - trustScore);

    return {
      deviceId: deviceHash,
      isNewDevice,
      isKnownDevice,
      isSharedDevice,
      isSuspicious,
      isEmulator,
      isVirtualMachine,
      isBot,
      trustScore: Math.max(0, trustScore),
      riskScore,
      matchedUsers,
      deviceHistory: [],
      signals,
      recommendations,
    };
  }

  private generateDeviceHash(fingerprint: Partial<DeviceFingerprint>): string {
    const components = [
      fingerprint.userAgent,
      fingerprint.platform,
      fingerprint.screenResolution,
      fingerprint.timezone,
      fingerprint.language,
      fingerprint.hardwareConcurrency,
      fingerprint.canvasHash,
      fingerprint.webglHash,
    ].filter(Boolean).join('|');

    return crypto.createHash('sha256').update(components).digest('hex').substring(0, 32);
  }

  private detectEmulator(fingerprint: Partial<DeviceFingerprint>): boolean {
    const userAgent = fingerprint.userAgent?.toLowerCase() ?? '';

    for (const pattern of KNOWN_EMULATOR_PATTERNS) {
      if (userAgent.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check for emulator-specific characteristics
    if (fingerprint.webglRenderer) {
      const renderer = fingerprint.webglRenderer.toLowerCase();
      if (renderer.includes('swiftshader') || renderer.includes('llvmpipe')) {
        return true;
      }
    }

    return false;
  }

  private detectVirtualMachine(fingerprint: Partial<DeviceFingerprint>): boolean {
    const renderer = fingerprint.webglRenderer?.toLowerCase() ?? '';
    const vendor = fingerprint.webglVendor?.toLowerCase() ?? '';

    const vmIndicators = [
      'vmware',
      'virtualbox',
      'hyper-v',
      'parallels',
      'qemu',
      'xen',
      'kvm',
    ];

    for (const indicator of vmIndicators) {
      if (renderer.includes(indicator) || vendor.includes(indicator)) {
        return true;
      }
    }

    return false;
  }

  private detectBot(fingerprint: Partial<DeviceFingerprint>): boolean {
    // Direct webdriver detection
    if (fingerprint.webdriver) return true;
    if (fingerprint.automation) return true;
    if (fingerprint.headless) return true;

    // Check user agent for bot patterns
    const userAgent = fingerprint.userAgent?.toLowerCase() ?? '';
    for (const pattern of KNOWN_BOT_PATTERNS) {
      if (userAgent.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Suspicious characteristics
    if (fingerprint.plugins?.length === 0 && !fingerprint.cookiesEnabled) {
      return true;
    }

    return false;
  }

  private checkMissingSignals(fingerprint: Partial<DeviceFingerprint>): string[] {
    const missing: string[] = [];

    for (const signal of this.deviceConfig.requiredSignals) {
      switch (signal) {
        case 'userAgent':
          if (!fingerprint.userAgent) missing.push('userAgent');
          break;
        case 'screenResolution':
          if (!fingerprint.screenResolution) missing.push('screenResolution');
          break;
        case 'timezone':
          if (!fingerprint.timezone) missing.push('timezone');
          break;
        case 'language':
          if (!fingerprint.language) missing.push('language');
          break;
        case 'canvas':
          if (!fingerprint.canvasHash) missing.push('canvas');
          break;
        case 'webgl':
          if (!fingerprint.webglHash) missing.push('webgl');
          break;
      }
    }

    return missing;
  }

  // ==========================================================================
  // IP Analysis
  // ==========================================================================

  /**
   * Analyze IP address
   */
  async analyzeIP(
    userId: string,
    ipAddress: string,
    additionalData?: Partial<IPAnalysisResult>
  ): Promise<IPAnalysisResult> {
    const now = new Date();
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];

    // Default location (would come from GeoIP service in production)
    const location: GeoLocation = additionalData?.location ?? {
      country: 'Unknown',
      countryCode: 'XX',
      region: 'Unknown',
      regionCode: 'XX',
      city: 'Unknown',
      postalCode: '',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
      isp: 'Unknown',
      organization: 'Unknown',
      asn: 'Unknown',
      asnOrganization: 'Unknown',
    };

    // VPN detection
    const isVPN = additionalData?.isVPN ?? this.detectVPN(ipAddress, location);

    // Proxy detection
    const isProxy = additionalData?.isProxy ?? false;

    // Tor detection
    const isTor = additionalData?.isTor ?? TOR_EXIT_IPS_SAMPLE.has(ipAddress);

    // Datacenter detection
    const isDatacenter = additionalData?.isDatacenter ?? KNOWN_VPN_ASNS.includes(location.asn);

    // Residential/mobile detection
    const isResidential = additionalData?.isResidential ?? (!isVPN && !isProxy && !isTor && !isDatacenter);
    const isMobile = additionalData?.isMobile ?? false;

    // Calculate reputation score
    let reputationScore = 100;
    let threatLevel: ThreatLevel = 'none';

    if (isTor) {
      reputationScore -= 60;
      threatLevel = 'critical';
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'tor_detected',
        severity: 'high',
        description: 'Tor exit node detected',
        evidence: { ip: ipAddress },
        confidence: 0.95,
        detectedAt: now,
      });

      if (this.ipConfig.blockTor) {
        recommendations.push({
          action: 'block_transaction',
          priority: 'immediate',
          reason: 'Tor connections not allowed',
          autoExecute: true,
        });
      }
    }

    if (isVPN) {
      reputationScore -= 25;
      if (threatLevel === 'none') threatLevel = 'low';
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'vpn_detected',
        severity: 'medium',
        description: 'VPN connection detected',
        evidence: { ip: ipAddress },
        confidence: 0.8,
        detectedAt: now,
      });

      if (this.ipConfig.blockVPN) {
        recommendations.push({
          action: 'block_transaction',
          priority: 'high',
          reason: 'VPN connections not allowed',
          autoExecute: true,
        });
      }
    }

    if (isProxy) {
      reputationScore -= 30;
      if (threatLevel === 'none' || threatLevel === 'low') threatLevel = 'medium';
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'proxy_detected',
        severity: 'medium',
        description: 'Proxy connection detected',
        evidence: { ip: ipAddress },
        confidence: 0.85,
        detectedAt: now,
      });

      if (this.ipConfig.blockProxy) {
        recommendations.push({
          action: 'block_transaction',
          priority: 'high',
          reason: 'Proxy connections not allowed',
          autoExecute: true,
        });
      }
    }

    if (isDatacenter) {
      reputationScore -= 20;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'datacenter_ip',
        severity: 'low',
        description: 'Datacenter IP detected',
        evidence: { ip: ipAddress, asn: location.asn },
        confidence: 0.9,
        detectedAt: now,
      });

      if (this.ipConfig.blockDatacenter) {
        recommendations.push({
          action: 'require_verification',
          priority: 'medium',
          reason: 'Datacenter IP requires verification',
        });
      }
    }

    // Country blocking
    if (this.ipConfig.blockedCountries.includes(location.countryCode)) {
      reputationScore = 0;
      threatLevel = 'critical';
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'location_anomaly',
        severity: 'high',
        description: `Access from blocked country: ${location.country}`,
        evidence: { country: location.country, countryCode: location.countryCode },
        confidence: 0.95,
        detectedAt: now,
      });
      recommendations.push({
        action: 'block_transaction',
        priority: 'immediate',
        reason: `Country ${location.country} is blocked`,
        autoExecute: true,
      });
    }

    // Track IP-user mapping
    const ipUsers = this.ipUserMapping.get(ipAddress) ?? new Set();
    const previousUsers = Array.from(ipUsers).filter((u) => u !== userId);
    ipUsers.add(userId);
    this.ipUserMapping.set(ipAddress, ipUsers);

    if (previousUsers.length > 2) {
      reputationScore -= 10;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'location_anomaly',
        severity: 'low',
        description: `IP used by ${ipUsers.size} accounts`,
        evidence: { ipUsers: ipUsers.size },
        confidence: 0.7,
        detectedAt: now,
      });
    }

    // Geo-velocity check
    const geoVelocityResult = await this.checkGeoVelocity(userId, location);
    if (geoVelocityResult && !geoVelocityResult.isPossible) {
      reputationScore -= 40;
      threatLevel = threatLevel === 'none' ? 'high' : threatLevel;
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'geo_velocity_violation',
        severity: 'high',
        description: `Impossible travel: ${geoVelocityResult.distanceKm.toFixed(0)}km in ${(geoVelocityResult.timeDifferenceMs / 3600000).toFixed(1)}h`,
        evidence: {
          distanceKm: geoVelocityResult.distanceKm,
          timeDifferenceMs: geoVelocityResult.timeDifferenceMs,
          isPossible: geoVelocityResult.isPossible,
        },
        confidence: 0.9,
        detectedAt: now,
      });
      recommendations.push({
        action: 'require_2fa',
        priority: 'high',
        reason: 'Unusual location change detected',
        autoExecute: true,
      });
    }

    // Calculate risk score
    const riskScore = Math.max(0, Math.min(1, (100 - reputationScore) / 100));

    // Update session for geo-velocity tracking
    this.userSessions.set(userId, { lastLocation: location, lastTime: now });

    return {
      ip: ipAddress,
      isValid: true,
      isVPN,
      isProxy,
      isTor,
      isDatacenter,
      isResidential,
      isMobile,
      location,
      reputationScore,
      threatLevel,
      abuseConfidence: isTor ? 0.9 : isVPN || isProxy ? 0.5 : 0.1,
      previousUsers,
      previousActivity: [],
      riskScore,
      signals,
      recommendations,
    };
  }

  private detectVPN(ipAddress: string, location: GeoLocation): boolean {
    // Check ASN against known VPN providers
    if (KNOWN_VPN_ASNS.includes(location.asn)) {
      return true;
    }

    // Additional heuristics would go here in production
    return false;
  }

  /**
   * Check geographic velocity (impossible travel)
   */
  async checkGeoVelocity(userId: string, currentLocation: GeoLocation): Promise<GeoVelocityCheck | null> {
    const session = this.userSessions.get(userId);
    if (!session?.lastLocation) return null;

    const previousLocation = session.lastLocation;
    const timeDifferenceMs = Date.now() - session.lastTime.getTime();

    // Calculate distance using Haversine formula
    const distanceKm = this.calculateDistance(
      previousLocation.latitude,
      previousLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude
    );

    // Calculate required travel time (assuming max 900 km/h for commercial flights)
    const maxSpeedKmH = 900;
    const requiredTravelTimeHours = distanceKm / maxSpeedKmH;
    const actualTravelTimeHours = timeDifferenceMs / 3600000;

    // Is travel physically possible?
    const isPossible = actualTravelTimeHours >= requiredTravelTimeHours * 0.8; // 20% buffer

    // Calculate risk score based on impossibility
    let riskScore = 0;
    if (!isPossible) {
      riskScore = Math.min(1, distanceKm / 5000); // Max risk at 5000km
    }

    return {
      userId,
      previousLocation,
      currentLocation,
      timeDifferenceMs,
      distanceKm,
      requiredTravelTimeHours,
      isPossible,
      riskScore,
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // ==========================================================================
  // Behavioral Analysis
  // ==========================================================================

  /**
   * Analyze user behavior for anomalies
   */
  async analyzeBehavior(
    userId: string,
    currentAction: {
      type: string;
      amount?: number;
      timestamp: Date;
      marketId?: string;
      sessionDuration?: number;
    }
  ): Promise<BehaviorAnomalyResult> {
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];
    const deviations: BehaviorDeviation[] = [];

    // Get or create behavior profile
    let profile = this.userBehaviorProfiles.get(userId);
    if (!profile) {
      profile = this.createDefaultBehaviorProfile(userId);
      this.userBehaviorProfiles.set(userId, profile);
    }

    const now = currentAction.timestamp;
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay();

    let isAnomaly = false;
    let anomalyScore = 0;
    let anomalyType: BehaviorAnomalyType = 'pattern_break';

    // Time-based anomaly detection
    if (profile.preferredLoginTimes.length >= this.behaviorConfig.minSessionsForBaseline) {
      const avgHour = profile.preferredLoginTimes.reduce((a, b) => a + b, 0) / profile.preferredLoginTimes.length;
      const timeDiff = Math.abs(hourOfDay - avgHour);

      if (timeDiff > 6) {
        isAnomaly = true;
        anomalyType = 'time_anomaly';
        anomalyScore += 0.3;
        deviations.push({
          metric: 'loginHour',
          expected: avgHour,
          observed: hourOfDay,
          deviationPercent: (timeDiff / 12) * 100,
          significance: timeDiff > 8 ? 'high' : 'medium',
        });
        signals.push({
          signalId: crypto.randomUUID(),
          type: 'time_anomaly',
          severity: timeDiff > 8 ? 'high' : 'medium',
          description: `Unusual activity time: ${hourOfDay}:00 (typical: ${avgHour.toFixed(0)}:00)`,
          evidence: { hourOfDay, avgHour, timeDiff },
          confidence: 0.7,
          detectedAt: now,
        });
      }
    }

    // Amount-based anomaly detection
    if (currentAction.amount && profile.avgDepositAmount > 0) {
      const amountDeviation = currentAction.amount / profile.avgDepositAmount;

      if (amountDeviation > 5) {
        isAnomaly = true;
        anomalyType = currentAction.type === 'deposit' ? 'deposit_anomaly' : 'withdrawal_anomaly';
        anomalyScore += 0.4;
        deviations.push({
          metric: 'transactionAmount',
          expected: profile.avgDepositAmount,
          observed: currentAction.amount,
          deviationPercent: (amountDeviation - 1) * 100,
          significance: amountDeviation > 10 ? 'high' : 'medium',
        });
        signals.push({
          signalId: crypto.randomUUID(),
          type: 'amount_anomaly',
          severity: amountDeviation > 10 ? 'high' : 'medium',
          description: `Unusual amount: $${currentAction.amount.toLocaleString()} (${amountDeviation.toFixed(1)}x average)`,
          evidence: { amount: currentAction.amount, avgAmount: profile.avgDepositAmount, multiplier: amountDeviation },
          confidence: 0.8,
          detectedAt: now,
        });
      }
    }

    // Trading pattern anomaly
    if (currentAction.type === 'trade' && profile.tradingPatterns.length > 0) {
      const matchesPattern = profile.tradingPatterns.some((p) =>
        p.marketTypes.includes(currentAction.marketId ?? '') ||
        p.timeOfDay.includes(hourOfDay)
      );

      if (!matchesPattern) {
        anomalyScore += 0.2;
        isAnomaly = isAnomaly || anomalyScore > this.behaviorConfig.anomalyThreshold;
        if (isAnomaly) {
          anomalyType = 'trading_anomaly';
          signals.push({
            signalId: crypto.randomUUID(),
            type: 'behavioral_anomaly',
            severity: 'low',
            description: 'Trading pattern deviation detected',
            evidence: { marketId: currentAction.marketId },
            confidence: 0.6,
            detectedAt: now,
          });
        }
      }
    }

    // Session duration anomaly
    if (currentAction.sessionDuration && profile.avgSessionDuration > 0) {
      const durationDeviation = currentAction.sessionDuration / profile.avgSessionDuration;

      if (durationDeviation < 0.1 || durationDeviation > 5) {
        anomalyScore += 0.15;
        anomalyType = 'session_anomaly';
        deviations.push({
          metric: 'sessionDuration',
          expected: profile.avgSessionDuration,
          observed: currentAction.sessionDuration,
          deviationPercent: Math.abs(durationDeviation - 1) * 100,
          significance: durationDeviation < 0.1 ? 'high' : 'medium',
        });
      }
    }

    // Update profile with new data
    this.updateBehaviorProfile(profile, currentAction, hourOfDay, dayOfWeek);

    // Generate recommendations
    if (isAnomaly && anomalyScore > 0.5) {
      recommendations.push({
        action: 'require_verification',
        priority: 'medium',
        reason: 'Unusual behavior pattern detected',
      });
    }

    if (anomalyScore > 0.7) {
      recommendations.push({
        action: 'enhanced_monitoring',
        priority: 'high',
        reason: 'High behavior anomaly score',
        autoExecute: true,
      });
    }

    return {
      userId,
      isAnomaly,
      anomalyScore: Math.min(1, anomalyScore),
      anomalyType,
      expectedBehavior: {
        avgSessionDuration: profile.avgSessionDuration,
        preferredLoginTimes: profile.preferredLoginTimes,
        avgDepositAmount: profile.avgDepositAmount,
      },
      observedBehavior: {
        avgSessionDuration: currentAction.sessionDuration,
        preferredLoginTimes: [hourOfDay],
        avgDepositAmount: currentAction.amount,
      },
      deviations,
      riskScore: Math.min(1, anomalyScore * 0.8),
      signals,
      recommendations,
    };
  }

  private createDefaultBehaviorProfile(userId: string): BehaviorProfile {
    return {
      userId,
      avgSessionDuration: 0,
      avgSessionsPerDay: 0,
      preferredLoginTimes: [],
      preferredDays: [],
      avgTradeSize: 0,
      avgTradesPerSession: 0,
      preferredMarkets: [],
      tradingPatterns: [],
      avgDepositAmount: 0,
      avgWithdrawalAmount: 0,
      depositFrequency: 0,
      withdrawalFrequency: 0,
      riskTolerance: 'moderate',
      maxPositionSize: 0,
      leverageUsage: 0,
      behaviorScore: 1.0,
      consistencyScore: 1.0,
      lastUpdated: new Date(),
    };
  }

  private updateBehaviorProfile(
    profile: BehaviorProfile,
    action: { type: string; amount?: number; sessionDuration?: number },
    hourOfDay: number,
    dayOfWeek: number
  ): void {
    // Update login times (rolling window)
    profile.preferredLoginTimes.push(hourOfDay);
    if (profile.preferredLoginTimes.length > 100) {
      profile.preferredLoginTimes.shift();
    }

    // Update preferred days
    if (!profile.preferredDays.includes(dayOfWeek)) {
      profile.preferredDays.push(dayOfWeek);
    }

    // Update amounts with exponential moving average
    if (action.amount) {
      if (action.type === 'deposit') {
        profile.avgDepositAmount = profile.avgDepositAmount === 0
          ? action.amount
          : 0.9 * profile.avgDepositAmount + 0.1 * action.amount;
        profile.depositFrequency++;
      } else if (action.type === 'withdrawal') {
        profile.avgWithdrawalAmount = profile.avgWithdrawalAmount === 0
          ? action.amount
          : 0.9 * profile.avgWithdrawalAmount + 0.1 * action.amount;
        profile.withdrawalFrequency++;
      }
    }

    // Update session duration
    if (action.sessionDuration) {
      profile.avgSessionDuration = profile.avgSessionDuration === 0
        ? action.sessionDuration
        : 0.9 * profile.avgSessionDuration + 0.1 * action.sessionDuration;
    }

    profile.lastUpdated = new Date();
  }

  // ==========================================================================
  // Multi-Account Detection
  // ==========================================================================

  /**
   * Detect multi-accounting
   */
  async detectMultiAccounting(
    userId: string,
    context: {
      deviceHash?: string;
      ipAddress?: string;
      email?: string;
      phone?: string;
      paymentMethodId?: string;
    }
  ): Promise<MultiAccountDetectionResult> {
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];
    const linkedAccounts: LinkedAccount[] = [];
    const linkingSignals: AccountLinkingSignal[] = [];

    // Check device-based linking
    if (context.deviceHash) {
      const deviceUsers = this.deviceUserMapping.get(context.deviceHash);
      if (deviceUsers && deviceUsers.size > 1) {
        const otherUsers = Array.from(deviceUsers).filter((u) => u !== userId);

        for (const otherUserId of otherUsers) {
          linkedAccounts.push({
            userId: otherUserId,
            linkType: 'same_device',
            confidence: 0.9,
            evidence: ['Same device fingerprint'],
            firstDetected: new Date(),
            lastSeen: new Date(),
          });
          linkingSignals.push({
            signalType: 'same_device',
            strength: 0.9,
            evidence: { deviceHash: context.deviceHash },
            timestamp: new Date(),
          });
        }
      }
    }

    // Check IP-based linking
    if (context.ipAddress) {
      const ipUsers = this.ipUserMapping.get(context.ipAddress);
      if (ipUsers && ipUsers.size > 1) {
        const otherUsers = Array.from(ipUsers).filter((u) => u !== userId);

        for (const otherUserId of otherUsers) {
          // Check if already linked
          if (!linkedAccounts.some((l) => l.userId === otherUserId)) {
            linkedAccounts.push({
              userId: otherUserId,
              linkType: 'same_ip',
              confidence: 0.6,
              evidence: ['Same IP address'],
              firstDetected: new Date(),
              lastSeen: new Date(),
            });
          }
          linkingSignals.push({
            signalType: 'same_ip',
            strength: 0.6,
            evidence: { ipAddress: context.ipAddress },
            timestamp: new Date(),
          });
        }
      }
    }

    // Calculate overall score
    const isMultiAccount = linkedAccounts.length > 0;
    let confidence = 0;

    if (linkedAccounts.length > 0) {
      // Higher confidence if multiple link types
      const linkTypes = new Set(linkedAccounts.map((l) => l.linkType));
      confidence = Math.min(
        1,
        linkedAccounts.reduce((sum, l) => sum + l.confidence, 0) / linkedAccounts.length +
        (linkTypes.size - 1) * 0.1
      );
    }

    // Generate signals
    if (isMultiAccount) {
      const severity = confidence > 0.8 ? 'high' : confidence > 0.5 ? 'medium' : 'low';
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'multi_account',
        severity,
        description: `${linkedAccounts.length} linked account(s) detected`,
        evidence: { linkedAccounts: linkedAccounts.map((l) => ({ userId: l.userId, type: l.linkType })) },
        confidence,
        detectedAt: new Date(),
      });

      if (confidence > 0.7) {
        recommendations.push({
          action: 'flag_for_compliance',
          priority: 'high',
          reason: 'High confidence multi-account detection',
        });
      }
    }

    const riskScore = Math.min(1, confidence * 0.8 + linkedAccounts.length * 0.1);

    return {
      userId,
      isMultiAccount,
      confidence,
      linkedAccounts,
      linkingSignals,
      riskScore,
      signals,
      recommendations,
    };
  }

  // ==========================================================================
  // Bonus Abuse Detection
  // ==========================================================================

  /**
   * Detect bonus abuse patterns
   */
  async detectBonusAbuse(
    userId: string,
    bonusHistory: BonusUsage[],
    bettingHistory: { amount: number; timestamp: Date; odds?: number }[]
  ): Promise<BonusAbuseDetectionResult> {
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];
    const suspiciousPatterns: BonusAbusePattern[] = [];
    const abuseTypes: BonusAbuseType[] = [];

    let isAbusive = false;
    let confidence = 0;

    // Check for bonus hunting (only plays with active bonuses)
    const activeBonusPeriods = bonusHistory.filter((b) => b.status === 'completed' || b.status === 'active');
    const betsWithBonus = bettingHistory.filter((bet) =>
      activeBonusPeriods.some((bonus) =>
        bet.timestamp >= bonus.claimedAt &&
        (!bonus.completedAt || bet.timestamp <= bonus.completedAt)
      )
    );

    if (bettingHistory.length > 10 && betsWithBonus.length / bettingHistory.length > 0.9) {
      abuseTypes.push('bonus_hunting');
      suspiciousPatterns.push({
        patternType: 'bonus_hunting',
        description: 'User primarily bets during bonus periods',
        evidence: { bonusBetRatio: betsWithBonus.length / bettingHistory.length },
        confidence: 0.8,
        detectedAt: new Date(),
      });
      isAbusive = true;
      confidence = Math.max(confidence, 0.7);
    }

    // Check for arbitrage abuse (betting on both sides)
    const lowOddsBets = bettingHistory.filter((b) => b.odds && b.odds < 1.5);
    if (lowOddsBets.length > 0 && lowOddsBets.length / bettingHistory.length > 0.7) {
      abuseTypes.push('arbitrage_abuse');
      suspiciousPatterns.push({
        patternType: 'arbitrage_abuse',
        description: 'High proportion of low-odds bets suggests arbitrage',
        evidence: { lowOddsBetRatio: lowOddsBets.length / bettingHistory.length },
        confidence: 0.7,
        detectedAt: new Date(),
      });
      isAbusive = true;
      confidence = Math.max(confidence, 0.6);
    }

    // Check for rapid wagering (completing requirements too fast)
    for (const bonus of activeBonusPeriods) {
      if (bonus.completedAt && bonus.wagerRequirement > 0) {
        const completionTimeHours =
          (bonus.completedAt.getTime() - bonus.claimedAt.getTime()) / 3600000;

        if (completionTimeHours < 1 && bonus.wagerRequirement > 1000) {
          abuseTypes.push('wagering_manipulation');
          suspiciousPatterns.push({
            patternType: 'wagering_manipulation',
            description: `Wagered $${bonus.wagerRequirement} in ${completionTimeHours.toFixed(1)} hours`,
            evidence: { wagerAmount: bonus.wagerRequirement, completionTimeHours },
            confidence: 0.85,
            detectedAt: new Date(),
          });
          isAbusive = true;
          confidence = Math.max(confidence, 0.8);
        }
      }
    }

    // Generate signals
    if (isAbusive) {
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'bonus_abuse',
        severity: confidence > 0.7 ? 'high' : 'medium',
        description: `Bonus abuse detected: ${abuseTypes.join(', ')}`,
        evidence: { abuseTypes, patternCount: suspiciousPatterns.length },
        confidence,
        detectedAt: new Date(),
      });

      recommendations.push({
        action: 'flag_for_compliance',
        priority: confidence > 0.8 ? 'high' : 'medium',
        reason: 'Bonus abuse patterns detected',
      });

      if (confidence > 0.8) {
        recommendations.push({
          action: 'limit_withdrawals',
          priority: 'high',
          reason: 'Pending bonus abuse investigation',
          parameters: { maxPerDay: 0 },
        });
      }
    }

    const riskScore = Math.min(1, confidence * 0.9);

    return {
      userId,
      isAbusive,
      abuseType: abuseTypes,
      confidence,
      bonusHistory,
      suspiciousPatterns,
      riskScore,
      signals,
      recommendations,
    };
  }

  // ==========================================================================
  // Deposit/Withdrawal Cycle Detection
  // ==========================================================================

  /**
   * Detect suspicious deposit/withdrawal cycles
   */
  async detectDepositWithdrawalCycles(
    userId: string,
    transactions: Transaction[]
  ): Promise<DepositWithdrawalCycleResult> {
    const signals: RiskSignal[] = [];
    const recommendations: RiskRecommendation[] = [];
    const cycles: FinancialCycle[] = [];

    const deposits = transactions
      .filter((t) => t.type === 'deposit' && t.status === 'completed')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const withdrawals = transactions
      .filter((t) => t.type === 'withdrawal' && t.status === 'completed')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let isSuspicious = false;
    let cycleType: CycleType = 'rapid_cycle';
    let totalCycledAmount = 0;
    let totalCycleTime = 0;

    // Find matching deposit-withdrawal pairs
    for (const deposit of deposits) {
      // Find next withdrawal after this deposit
      const matchingWithdrawal = withdrawals.find(
        (w) =>
          w.timestamp > deposit.timestamp &&
          w.amount >= deposit.amount * 0.8 &&
          w.amount <= deposit.amount * 1.2
      );

      if (matchingWithdrawal) {
        const cycleTimeMs = matchingWithdrawal.timestamp.getTime() - deposit.timestamp.getTime();
        const cycleTimeHours = cycleTimeMs / 3600000;

        // Get betting activity between deposit and withdrawal
        const bettingActivity = transactions
          .filter(
            (t) =>
              (t.type === 'bet' || t.type === 'trade') &&
              t.timestamp > deposit.timestamp &&
              t.timestamp < matchingWithdrawal.timestamp
          )
          .reduce((sum, t) => sum + t.amount, 0);

        const playThroughRatio = deposit.amount > 0 ? bettingActivity / deposit.amount : 0;

        cycles.push({
          cycleId: crypto.randomUUID(),
          depositId: deposit.transactionId,
          withdrawalId: matchingWithdrawal.transactionId,
          depositAmount: deposit.amount,
          withdrawalAmount: matchingWithdrawal.amount,
          depositTime: deposit.timestamp,
          withdrawalTime: matchingWithdrawal.timestamp,
          cycleTimeMs,
          bettingActivity,
          playThroughRatio,
        });

        totalCycledAmount += deposit.amount;
        totalCycleTime += cycleTimeMs;

        // Check for suspicious patterns
        if (cycleTimeHours < 2 && playThroughRatio < 0.5) {
          isSuspicious = true;
          cycleType = 'rapid_cycle';
        }

        if (playThroughRatio < 0.1) {
          isSuspicious = true;
          cycleType = 'minimal_play';
        }
      }
    }

    // Check for structuring (multiple small deposits followed by large withdrawal)
    const recentDeposits = deposits.slice(-10);
    if (recentDeposits.length >= 5) {
      const avgDepositAmount = recentDeposits.reduce((sum, d) => sum + d.amount, 0) / recentDeposits.length;
      const allSmall = recentDeposits.every((d) => d.amount < 1000);
      const totalDeposited = recentDeposits.reduce((sum, d) => sum + d.amount, 0);

      const recentWithdrawal = withdrawals[withdrawals.length - 1];
      if (allSmall && recentWithdrawal && recentWithdrawal.amount > totalDeposited * 0.8) {
        isSuspicious = true;
        cycleType = 'structuring';
        signals.push({
          signalId: crypto.randomUUID(),
          type: 'rapid_deposit_withdrawal',
          severity: 'high',
          description: `Potential structuring: ${recentDeposits.length} small deposits followed by large withdrawal`,
          evidence: { depositCount: recentDeposits.length, avgAmount: avgDepositAmount, withdrawalAmount: recentWithdrawal.amount },
          confidence: 0.8,
          detectedAt: new Date(),
        });
      }
    }

    // Generate signals for suspicious cycles
    if (isSuspicious) {
      signals.push({
        signalId: crypto.randomUUID(),
        type: 'rapid_deposit_withdrawal',
        severity: cycles.filter((c) => c.playThroughRatio < 0.1).length > 2 ? 'high' : 'medium',
        description: `${cycleType} pattern detected: ${cycles.length} cycles with avg ${(totalCycleTime / cycles.length / 3600000).toFixed(1)}h duration`,
        evidence: { cycleCount: cycles.length, cycleType, totalCycledAmount },
        confidence: 0.85,
        detectedAt: new Date(),
      });

      recommendations.push({
        action: 'flag_for_compliance',
        priority: 'high',
        reason: `Suspicious ${cycleType} pattern detected`,
      });

      recommendations.push({
        action: 'delay_withdrawal',
        priority: 'high',
        reason: 'Pending review of transaction patterns',
        parameters: { delayHours: 48 },
      });
    }

    const riskScore = isSuspicious ? Math.min(1, 0.5 + cycles.length * 0.1) : 0;

    return {
      userId,
      isSuspicious,
      cycleType,
      cycles,
      totalCycledAmount,
      avgCycleTime: cycles.length > 0 ? totalCycleTime / cycles.length : 0,
      riskScore,
      signals,
      recommendations,
    };
  }

  // ==========================================================================
  // Comprehensive Transaction Analysis
  // ==========================================================================

  /**
   * Analyze a transaction with all fraud checks
   */
  async analyzeTransaction(
    transaction: Transaction,
    context: {
      deviceFingerprint?: Partial<DeviceFingerprint>;
      ipAddress?: string;
      ipData?: Partial<IPAnalysisResult>;
    } = {}
  ): Promise<RiskAssessment> {
    const startTime = Date.now();
    const userId = transaction.userId;

    this.logger.debug('Analyzing transaction', {
      transactionId: transaction.transactionId,
      userId,
      type: transaction.type,
    });

    // Store transaction
    const history = this.userTransactionHistory.get(userId) ?? [];
    history.push(transaction);
    this.userTransactionHistory.set(userId, history.slice(-500));

    // Run all checks in parallel
    const [velocityResult, deviceResult, ipResult, behaviorResult, multiAccountResult, cycleResult] =
      await Promise.all([
        // Velocity check
        this.checkVelocity(userId, transaction.type as VelocityActionType, transaction.amount),

        // Device analysis
        context.deviceFingerprint
          ? this.analyzeDevice(userId, context.deviceFingerprint)
          : Promise.resolve(undefined),

        // IP analysis
        context.ipAddress
          ? this.analyzeIP(userId, context.ipAddress, context.ipData)
          : Promise.resolve(undefined),

        // Behavior analysis
        this.analyzeBehavior(userId, {
          type: transaction.type,
          amount: transaction.amount,
          timestamp: transaction.timestamp,
        }),

        // Multi-account detection
        this.detectMultiAccounting(userId, {
          deviceHash: context.deviceFingerprint
            ? this.generateDeviceHash(context.deviceFingerprint)
            : undefined,
          ipAddress: context.ipAddress,
        }),

        // Deposit/withdrawal cycle detection
        this.detectDepositWithdrawalCycles(userId, history),
      ]);

    // Build geo-velocity result
    let geoVelocityResult: GeoVelocityCheck | undefined;
    if (ipResult?.location) {
      geoVelocityResult = await this.checkGeoVelocity(userId, ipResult.location) ?? undefined;
    }

    // Get user profile
    const userProfile = await this.getUserRiskProfile(userId);

    // Create scoring context
    const scoringContext: ScoringContext = {
      userId,
      entityId: transaction.transactionId,
      entityType: 'transaction',
      velocityResult,
      deviceResult,
      ipResult,
      behaviorResult,
      multiAccountResult,
      geoVelocityResult,
      userProfile,
      signals: [],
    };

    // Add cycle signals
    if (cycleResult.isSuspicious) {
      scoringContext.signals = [...(scoringContext.signals ?? []), ...cycleResult.signals];
    }

    // Build rules evaluation context
    const rulesContext: EvaluationContext = {
      userId,
      sessionId: context.deviceFingerprint?.sessionId,
      transaction,
      device: context.deviceFingerprint
        ? {
            isNewDevice: deviceResult?.isNewDevice,
            isEmulator: deviceResult?.isEmulator,
            isBot: deviceResult?.isBot,
            trustScore: deviceResult?.trustScore,
            accountCount: deviceResult?.matchedUsers.length,
          }
        : undefined,
      ip: ipResult
        ? {
            isVPN: ipResult.isVPN,
            isTor: ipResult.isTor,
            isProxy: ipResult.isProxy,
            isDatacenter: ipResult.isDatacenter,
            reputationScore: ipResult.reputationScore,
            location: ipResult.location,
          }
        : undefined,
      behavior: {
        timeDeviation: 0,
        amountDeviation: behaviorResult.deviations.find((d) => d.metric === 'transactionAmount')?.deviationPercent ?? 0,
        patternScore: 1 - behaviorResult.anomalyScore,
        sessionAnomalyScore: behaviorResult.anomalyScore,
      },
      velocityData: {
        'deposits.hourly.count': this.getOrCreateCounter(`velocity:${userId}:deposit:hour`, 3600000).count,
        'deposits.daily.count': this.getOrCreateCounter(`velocity:${userId}:deposit:day`, 86400000).count,
        'withdrawals.daily.count': this.getOrCreateCounter(`velocity:${userId}:withdrawal:day`, 86400000).count,
        timeSinceLastDeposit: this.getTimeSinceLastAction(userId, 'deposit'),
        withdrawalAmount: transaction.type === 'withdrawal' ? transaction.amount : 0,
      },
      multiAccountData: {
        sameDeviceAccounts: deviceResult?.matchedUsers.length ?? 0,
        sameIPAccounts: ipResult?.previousUsers.length ?? 0,
      },
      geoVelocity: geoVelocityResult
        ? { isPossible: geoVelocityResult.isPossible, distanceKm: geoVelocityResult.distanceKm, timeHours: geoVelocityResult.timeDifferenceMs / 3600000 }
        : undefined,
    };

    // Evaluate rules
    const ruleResults = await this.rulesEngine.evaluateRules(rulesContext);
    const ruleSignals = this.rulesEngine.rulesToSignals(ruleResults);
    scoringContext.signals = [...(scoringContext.signals ?? []), ...ruleSignals];

    // Calculate final risk assessment
    const assessment = this.scoringEngine.calculateRiskAssessment(scoringContext);

    // Update stats
    this.stats.transactionsAnalyzed++;
    if (assessment.riskScore >= this.thresholds.mediumRiskScore) {
      this.stats.transactionsFlagged++;
    }
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (this.stats.transactionsAnalyzed - 1) + (Date.now() - startTime)) /
      this.stats.transactionsAnalyzed;

    // Generate alert if needed
    if (assessment.riskLevel === 'high' || assessment.riskLevel === 'critical') {
      await this.generateAlert(assessment, { type: 'transaction', data: transaction });
    }

    // Update user profile
    await this.updateUserRiskProfile(userId, assessment);

    this.logger.info('Transaction analysis complete', {
      transactionId: transaction.transactionId,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      signalCount: assessment.signals.length,
      latencyMs: Date.now() - startTime,
    });

    return assessment;
  }

  private getTimeSinceLastAction(userId: string, actionType: string): number {
    const history = this.userTransactionHistory.get(userId) ?? [];
    const lastAction = history
      .filter((t) => t.type === actionType)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (!lastAction) return Infinity;
    return (Date.now() - lastAction.timestamp.getTime()) / 1000;
  }

  // ==========================================================================
  // Real-time Trade Analysis (from original client)
  // ==========================================================================

  /**
   * Analyze a single trade in real-time
   */
  async analyzeTradeRealtime(trade: Trade): Promise<RiskAssessment> {
    const startTime = Date.now();
    const signals: RiskSignal[] = [];

    this.logger.debug('Analyzing trade', {
      tradeId: trade.tradeId,
      userId: trade.userId,
    });

    // Get user's recent trades
    const userTrades = this.userTradeHistory.get(trade.userId) ?? [];
    userTrades.push(trade);
    this.userTradeHistory.set(trade.userId, userTrades.slice(-1000));

    // Velocity check
    const velocitySignal = this.checkTradeVelocity(trade, userTrades);
    if (velocitySignal) signals.push(velocitySignal);

    // Self-trading check
    const selfTradingSignal = this.checkSelfTrading(trade, userTrades);
    if (selfTradingSignal) signals.push(selfTradingSignal);

    // Volume anomaly check
    const volumeSignal = this.checkVolumeAnomaly(trade, userTrades);
    if (volumeSignal) signals.push(volumeSignal);

    // Device/IP anomaly check
    if (trade.deviceFingerprint) {
      const deviceResult = await this.analyzeDevice(trade.userId, { hash: trade.deviceFingerprint });
      signals.push(...deviceResult.signals);
    }

    if (trade.ipAddress) {
      const ipResult = await this.analyzeIP(trade.userId, trade.ipAddress);
      signals.push(...ipResult.signals);
    }

    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(signals);
    const riskLevel = this.getRiskLevel(riskScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskLevel, signals);

    // Update stats
    this.stats.tradesAnalyzed++;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (this.stats.tradesAnalyzed - 1) + (Date.now() - startTime)) /
      this.stats.tradesAnalyzed;

    if (riskScore >= this.thresholds.mediumRiskScore) {
      this.stats.tradesFlagged++;
    }

    const assessment: RiskAssessment = {
      assessmentId: crypto.randomUUID(),
      entityId: trade.tradeId,
      entityType: 'trade',
      riskScore,
      riskLevel,
      signals,
      recommendations,
      assessedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    // Generate alert if high risk
    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.generateAlert(assessment, { type: 'trade', data: trade });
    }

    // Update user profile
    await this.updateUserRiskProfile(trade.userId, assessment);

    this.logger.info('Trade analysis complete', {
      tradeId: trade.tradeId,
      riskScore,
      riskLevel,
      signalCount: signals.length,
    });

    return assessment;
  }

  private checkTradeVelocity(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    const now = trade.timestamp.getTime();
    const oneMinuteAgo = now - 60000;

    const recentTrades = userTrades.filter((t) => t.timestamp.getTime() > oneMinuteAgo);

    if (recentTrades.length > this.thresholds.maxVelocityPerMinute) {
      return {
        signalId: crypto.randomUUID(),
        type: 'velocity_spike',
        severity: 'high',
        description: `User executed ${recentTrades.length} trades in last minute (threshold: ${this.thresholds.maxVelocityPerMinute})`,
        evidence: { tradeCount: recentTrades.length, threshold: this.thresholds.maxVelocityPerMinute },
        confidence: 0.9,
        detectedAt: new Date(),
      };
    }

    if (recentTrades.length >= 2) {
      const lastTrade = recentTrades[recentTrades.length - 2];
      const timeBetween = (trade.timestamp.getTime() - lastTrade.timestamp.getTime()) / 1000;

      if (timeBetween < this.thresholds.minTimeBetweenTrades) {
        return {
          signalId: crypto.randomUUID(),
          type: 'velocity_spike',
          severity: 'medium',
          description: `Trades ${timeBetween.toFixed(1)}s apart (min: ${this.thresholds.minTimeBetweenTrades}s)`,
          evidence: { timeBetweenSeconds: timeBetween, threshold: this.thresholds.minTimeBetweenTrades },
          confidence: 0.7,
          detectedAt: new Date(),
        };
      }
    }

    return null;
  }

  private checkSelfTrading(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    if (!trade.counterpartyId) return null;

    const matchingTrades = userTrades.filter(
      (t) =>
        t.marketId === trade.marketId &&
        t.side !== trade.side &&
        Math.abs(t.timestamp.getTime() - trade.timestamp.getTime()) < 5000 &&
        Math.abs(t.quantity - trade.quantity) / trade.quantity < 0.01
    );

    if (matchingTrades.length > 0) {
      return {
        signalId: crypto.randomUUID(),
        type: 'self_trading',
        severity: 'high',
        description: 'Potential self-trading detected - matching opposite trades',
        evidence: { matchingTradeCount: matchingTrades.length, trades: matchingTrades.map((t) => t.tradeId) },
        confidence: 0.85,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  private checkVolumeAnomaly(trade: Trade, userTrades: Trade[]): RiskSignal | null {
    const avgTradeSize =
      userTrades.length > 1
        ? userTrades.slice(0, -1).reduce((sum, t) => sum + t.totalValue, 0) / (userTrades.length - 1)
        : 0;

    if (avgTradeSize === 0) return null;

    const multiplier = trade.totalValue / avgTradeSize;

    if (multiplier > this.thresholds.suspiciousVolumeMultiplier) {
      return {
        signalId: crypto.randomUUID(),
        type: 'volume_manipulation',
        severity: multiplier > 10 ? 'high' : 'medium',
        description: `Trade size ${multiplier.toFixed(1)}x average (threshold: ${this.thresholds.suspiciousVolumeMultiplier}x)`,
        evidence: { tradeValue: trade.totalValue, averageValue: avgTradeSize, multiplier },
        confidence: 0.75,
        detectedAt: new Date(),
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyVolume = userTrades.filter((t) => t.timestamp >= today).reduce((sum, t) => sum + t.totalValue, 0);

    if (dailyVolume > this.thresholds.maxDailyVolume) {
      return {
        signalId: crypto.randomUUID(),
        type: 'volume_manipulation',
        severity: 'medium',
        description: `Daily volume $${dailyVolume.toLocaleString()} exceeds limit`,
        evidence: { dailyVolume, limit: this.thresholds.maxDailyVolume },
        confidence: 0.8,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  // ==========================================================================
  // Wash Trading Analysis
  // ==========================================================================

  async analyzeWashTrading(userId: string, trades: Trade[], relatedUsers?: string[]): Promise<WashTradingAnalysis> {
    this.logger.info('Analyzing wash trading', { userId, tradeCount: trades.length });

    const userTrades = trades.filter((t) => t.userId === userId);
    const windowStart = userTrades.length > 0 ? userTrades[0].timestamp : new Date();
    const windowEnd = userTrades.length > 0 ? userTrades[userTrades.length - 1].timestamp : new Date();

    const selfTrades = this.findSelfTrades(userTrades);
    const relatedAccountTrades = await this.findRelatedAccountTrades(userId, trades, relatedUsers ?? []);
    const circularPatterns = this.findCircularPatterns(userId, trades, relatedUsers ?? []);
    const riskScore = this.calculateWashTradingScore(selfTrades, relatedAccountTrades, circularPatterns);

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

  private findSelfTrades(trades: Trade[]): { count: number; volume: number } {
    let count = 0;
    let volume = 0;

    const byMarket = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const existing = byMarket.get(t.marketId) ?? [];
      existing.push(t);
      byMarket.set(t.marketId, existing);
    });

    for (const marketTrades of byMarket.values()) {
      const buys = marketTrades.filter((t) => t.side === 'buy');
      const sells = marketTrades.filter((t) => t.side === 'sell');

      for (const buy of buys) {
        for (const sell of sells) {
          const timeDiff = Math.abs(buy.timestamp.getTime() - sell.timestamp.getTime());
          if (timeDiff < 60000 && Math.abs(buy.quantity - sell.quantity) / buy.quantity < 0.05) {
            count++;
            volume += Math.min(buy.totalValue, sell.totalValue);
          }
        }
      }
    }

    return { count, volume };
  }

  private async findRelatedAccountTrades(userId: string, trades: Trade[], relatedUsers: string[]): Promise<RelatedAccountTrade[]> {
    const results: RelatedAccountTrade[] = [];

    for (const relatedUserId of relatedUsers) {
      const userTrades = trades.filter((t) => t.userId === userId);
      const relatedTrades = trades.filter((t) => t.userId === relatedUserId);

      let matchCount = 0;
      let totalVolume = 0;

      for (const ut of userTrades) {
        for (const rt of relatedTrades) {
          if (ut.marketId === rt.marketId && ut.side !== rt.side && Math.abs(ut.timestamp.getTime() - rt.timestamp.getTime()) < 60000) {
            matchCount++;
            totalVolume += Math.min(ut.totalValue, rt.totalValue);
          }
        }
      }

      if (matchCount > 0) {
        results.push({
          userId,
          counterpartyId: relatedUserId,
          relationshipType: 'known_associate',
          tradeCount: matchCount,
          totalVolume,
          confidence: Math.min(matchCount / 10, 1),
        });
      }
    }

    return results;
  }

  private findCircularPatterns(userId: string, trades: Trade[], relatedUsers: string[]): CircularPattern[] {
    return [];
  }

  private calculateWashTradingScore(
    selfTrades: { count: number; volume: number },
    relatedAccountTrades: RelatedAccountTrade[],
    circularPatterns: CircularPattern[]
  ): number {
    let score = 0;
    score += Math.min(selfTrades.count * 0.1, 0.4);
    const relatedVolume = relatedAccountTrades.reduce((sum, t) => sum + t.totalVolume, 0);
    score += Math.min(relatedVolume / 100000, 0.3);
    score += Math.min(circularPatterns.length * 0.2, 0.3);
    return Math.min(score, 1);
  }

  // ==========================================================================
  // User Risk Profile
  // ==========================================================================

  async getUserRiskProfile(userId: string): Promise<UserRiskProfile> {
    const existing = this.userRiskProfiles.get(userId);
    if (existing) return existing;

    const profile: UserRiskProfile = {
      userId,
      overallRiskScore: 0,
      riskLevel: 'low',
      riskFactors: [],
      tradingBehavior: {
        averageDailyVolume: 0,
        averageTradeSize: 0,
        preferredMarkets: [],
        tradingHours: [],
        winRate: 0,
        volatilityPreference: 'medium',
      },
      accountFlags: [],
      restrictions: [],
      lastAssessment: new Date(),
      nextAssessment: new Date(Date.now() + 24 * 60 * 60 * 1000),
      knownDevices: this.userDevices.get(userId) ?? [],
      knownIPs: [],
      velocityStats: {
        depositsToday: 0,
        depositsThisWeek: 0,
        withdrawalsToday: 0,
        withdrawalsThisWeek: 0,
        betsToday: 0,
        betsThisWeek: 0,
        tradesToday: 0,
        tradesThisWeek: 0,
      },
    };

    this.userRiskProfiles.set(userId, profile);
    return profile;
  }

  async updateUserRiskProfile(userId: string, assessment: RiskAssessment): Promise<UserRiskProfile> {
    const profile = await this.getUserRiskProfile(userId);

    const alpha = 0.3;
    profile.overallRiskScore = alpha * assessment.riskScore + (1 - alpha) * profile.overallRiskScore;
    profile.riskLevel = this.getRiskLevel(profile.overallRiskScore);

    if (assessment.riskLevel === 'high' || assessment.riskLevel === 'critical') {
      profile.accountFlags.push({
        flag: `high_risk_${assessment.signals[0]?.type ?? 'unknown'}`,
        severity: assessment.riskLevel === 'critical' ? 'critical' : 'alert',
        reason: assessment.signals[0]?.description ?? 'High risk activity detected',
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

  private async generateAlert(
    assessment: RiskAssessment,
    entity: { type: string; data: Trade | Transaction }
  ): Promise<FraudAlert | null> {
    const entityUserId = 'userId' in entity.data ? entity.data.userId : '';
    const signalType = assessment.signals[0]?.type ?? 'suspicious_pattern';
    const cooldownKey = `${entityUserId}_${signalType}`;

    const lastAlert = this.recentAlerts.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert.getTime() < 300000) {
      return null;
    }

    const alertType = this.mapSignalToAlertType(signalType);

    const alert: FraudAlert = {
      alertId: crypto.randomUUID(),
      type: alertType,
      severity: assessment.riskLevel === 'critical' ? 'critical' : 'high',
      entityId: assessment.entityId,
      entityType: assessment.entityType,
      description: assessment.signals.map((s) => s.description).join('; '),
      evidence: {
        riskScore: assessment.riskScore,
        signals: assessment.signals,
      },
      status: 'new',
      createdAt: new Date(),
    };

    this.recentAlerts.set(cooldownKey, new Date());
    this.stats.alertsGenerated++;

    this.logger.warn('Fraud alert generated', {
      alertId: alert.alertId,
      type: alert.type,
      entityId: assessment.entityId,
    });

    return alert;
  }

  private mapSignalToAlertType(signalType: RiskSignalType): AlertType {
    const mapping: Record<RiskSignalType, AlertType> = {
      wash_trading: 'wash_trading_detected',
      self_trading: 'wash_trading_detected',
      velocity_spike: 'velocity_exceeded',
      volume_manipulation: 'volume_anomaly',
      spoofing: 'manipulation_suspected',
      layering: 'manipulation_suspected',
      front_running: 'manipulation_suspected',
      coordinated_trading: 'coordinated_activity',
      account_takeover: 'account_anomaly',
      device_anomaly: 'device_anomaly',
      location_anomaly: 'ip_anomaly',
      new_account_abuse: 'account_anomaly',
      multi_account: 'multi_account_detected',
      suspicious_pattern: 'account_anomaly',
      vpn_detected: 'vpn_proxy_detected',
      proxy_detected: 'vpn_proxy_detected',
      tor_detected: 'vpn_proxy_detected',
      datacenter_ip: 'ip_anomaly',
      geo_velocity_violation: 'geo_velocity_alert',
      device_sharing: 'multi_account_detected',
      new_device: 'device_anomaly',
      emulator_detected: 'bot_detected',
      bot_detected: 'bot_detected',
      deposit_velocity: 'velocity_exceeded',
      withdrawal_velocity: 'velocity_exceeded',
      bet_velocity: 'velocity_exceeded',
      rapid_deposit_withdrawal: 'deposit_withdrawal_cycle',
      bonus_abuse: 'bonus_abuse_detected',
      referral_fraud: 'referral_fraud',
      behavioral_anomaly: 'behavioral_anomaly',
      time_anomaly: 'behavioral_anomaly',
      amount_anomaly: 'volume_anomaly',
      pattern_break: 'behavioral_anomaly',
    };

    return mapping[signalType] ?? 'account_anomaly';
  }

  // ==========================================================================
  // Scoring Helpers
  // ==========================================================================

  private calculateRiskScore(signals: RiskSignal[]): number {
    if (signals.length === 0) return 0;

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

  private getRiskLevel(score: number): RiskLevel {
    if (score >= 0.9) return 'critical';
    if (score >= this.thresholds.highRiskScore) return 'high';
    if (score >= this.thresholds.mediumRiskScore) return 'medium';
    return 'low';
  }

  private generateRecommendations(riskLevel: RiskLevel, signals: RiskSignal[]): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    switch (riskLevel) {
      case 'critical':
        recommendations.push({ action: 'block_transaction', priority: 'immediate', reason: 'Critical risk level detected', autoExecute: true });
        recommendations.push({ action: 'flag_for_compliance', priority: 'immediate', reason: 'Requires compliance review' });
        recommendations.push({ action: 'suspend_account', priority: 'high', reason: 'Account suspension recommended' });
        break;
      case 'high':
        recommendations.push({ action: 'delay_withdrawal', priority: 'high', reason: 'High risk - requires review', parameters: { delayHours: 24 } });
        recommendations.push({ action: 'manual_review', priority: 'high', reason: 'Suspicious activity pattern' });
        recommendations.push({ action: 'require_2fa', priority: 'high', reason: 'Additional authentication required' });
        break;
      case 'medium':
        recommendations.push({ action: 'enhanced_monitoring', priority: 'medium', reason: 'Enhanced monitoring enabled', autoExecute: true });
        recommendations.push({ action: 'require_verification', priority: 'medium', reason: 'Additional verification may be required' });
        break;
      default:
        recommendations.push({ action: 'no_action', priority: 'low', reason: 'Normal activity' });
    }

    return recommendations;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  getStats(): MonitoringStats {
    return { ...this.stats, lastUpdated: new Date() };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  resetStats(): void {
    this.stats = {
      tradesAnalyzed: 0,
      transactionsAnalyzed: 0,
      alertsGenerated: 0,
      tradesFlagged: 0,
      transactionsFlagged: 0,
      averageLatencyMs: 0,
      lastUpdated: new Date(),
    };
  }

  getRulesEngine(): FraudRulesEngine {
    return this.rulesEngine;
  }

  getScoringEngine(): RiskScoringEngine {
    return this.scoringEngine;
  }
}

export default FraudDetectionClient;
