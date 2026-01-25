/**
 * Fraud Detection Rules Engine
 * Configurable rules for detecting fraudulent activity
 */

import * as crypto from 'crypto';
import type {
  FraudRule,
  RuleCategory,
  RuleCondition,
  RuleAction,
  RuleOperator,
  RuleEvaluationResult,
  ConditionEvaluationResult,
  RecommendedAction,
  RiskSignal,
  RiskSignalType,
  Logger,
  Transaction,
  Trade,
  DeviceFingerprint,
  IPAnalysisResult,
  BehaviorProfile,
} from './types';

// ============================================================================
// Default Rules Configuration
// ============================================================================

export const DEFAULT_VELOCITY_RULES: FraudRule[] = [
  {
    ruleId: 'velocity_deposits_hourly',
    name: 'Excessive Hourly Deposits',
    description: 'Flag users making too many deposits per hour',
    category: 'velocity',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'deposits.hourly.count', operator: 'gt', value: 5 },
    ],
    actions: [
      { type: 'delay_withdrawal', parameters: { delayMinutes: 60 } },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 3600,
    maxTriggersPerHour: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'velocity_deposits_daily',
    name: 'Excessive Daily Deposits',
    description: 'Flag users making too many deposits per day',
    category: 'velocity',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'deposits.daily.count', operator: 'gt', value: 10 },
    ],
    actions: [
      { type: 'limit_deposits', parameters: { maxPerDay: 5 } },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 86400,
    maxTriggersPerHour: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'velocity_withdrawals_daily',
    name: 'Excessive Daily Withdrawals',
    description: 'Flag users making too many withdrawals per day',
    category: 'velocity',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'withdrawals.daily.count', operator: 'gt', value: 5 },
    ],
    actions: [
      { type: 'delay_withdrawal', parameters: { delayHours: 24 } },
      { type: 'require_verification' },
    ],
    cooldownSeconds: 86400,
    maxTriggersPerHour: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'velocity_bets_hourly',
    name: 'Excessive Hourly Bets',
    description: 'Flag users placing too many bets per hour',
    category: 'velocity',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'bets.hourly.count', operator: 'gt', value: 100 },
    ],
    actions: [
      { type: 'cool_down_period', parameters: { minutes: 30 } },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 1800,
    maxTriggersPerHour: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'velocity_large_deposit',
    name: 'Large Deposit',
    description: 'Flag unusually large deposits',
    category: 'velocity',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'transaction.amount', operator: 'gt', value: 10000 },
    ],
    actions: [
      { type: 'manual_review' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'velocity_rapid_withdrawal',
    name: 'Rapid Withdrawal After Deposit',
    description: 'Flag withdrawals made shortly after deposits',
    category: 'velocity',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'timeSinceLastDeposit', operator: 'lt', value: 3600 }, // 1 hour
      { field: 'withdrawalAmount', operator: 'gte', value: 500 },
    ],
    actions: [
      { type: 'delay_withdrawal', parameters: { delayHours: 24 } },
      { type: 'manual_review' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_DEVICE_RULES: FraudRule[] = [
  {
    ruleId: 'device_new_device_withdrawal',
    name: 'New Device Withdrawal',
    description: 'Require verification for withdrawals from new devices',
    category: 'device',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'device.isNewDevice', operator: 'eq', value: true },
      { field: 'transaction.type', operator: 'eq', value: 'withdrawal' },
    ],
    actions: [
      { type: 'require_2fa' },
      { type: 'delay_withdrawal', parameters: { delayHours: 24 } },
    ],
    cooldownSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'device_emulator_detected',
    name: 'Emulator Detected',
    description: 'Block transactions from emulated devices',
    category: 'device',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'device.isEmulator', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'block_transaction' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'device_bot_detected',
    name: 'Bot Detected',
    description: 'Block transactions from detected bots',
    category: 'device',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'device.isBot', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'block_transaction' },
      { type: 'suspend_account' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'device_multiple_accounts',
    name: 'Device Used by Multiple Accounts',
    description: 'Flag devices used by multiple accounts',
    category: 'device',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'device.accountCount', operator: 'gt', value: 1 },
    ],
    actions: [
      { type: 'enhanced_monitoring' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'device_low_trust_score',
    name: 'Low Device Trust Score',
    description: 'Flag devices with low trust scores',
    category: 'device',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'device.trustScore', operator: 'lt', value: 0.3 },
    ],
    actions: [
      { type: 'require_verification' },
      { type: 'limit_withdrawals', parameters: { maxPerDay: 100 } },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_IP_RULES: FraudRule[] = [
  {
    ruleId: 'ip_vpn_detected',
    name: 'VPN Detected',
    description: 'Flag transactions from VPN connections',
    category: 'ip',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'ip.isVPN', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'require_verification' },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'ip_tor_detected',
    name: 'Tor Detected',
    description: 'Block transactions from Tor exit nodes',
    category: 'ip',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'ip.isTor', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'block_transaction' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'ip_datacenter',
    name: 'Datacenter IP Detected',
    description: 'Flag transactions from datacenter IPs',
    category: 'ip',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'ip.isDatacenter', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'enhanced_monitoring' },
      { type: 'require_2fa' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'ip_blocked_country',
    name: 'Blocked Country',
    description: 'Block transactions from blocked countries',
    category: 'ip',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'ip.location.countryCode', operator: 'in', value: ['KP', 'IR', 'SY', 'CU'] },
    ],
    actions: [
      { type: 'block_transaction' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'ip_geo_velocity',
    name: 'Impossible Travel',
    description: 'Flag impossible geographic velocity',
    category: 'ip',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'geoVelocity.isPossible', operator: 'eq', value: false },
    ],
    actions: [
      { type: 'require_2fa' },
      { type: 'delay_withdrawal', parameters: { delayHours: 24 } },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'ip_low_reputation',
    name: 'Low IP Reputation',
    description: 'Flag transactions from low reputation IPs',
    category: 'ip',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'ip.reputationScore', operator: 'lt', value: 30 },
    ],
    actions: [
      { type: 'enhanced_monitoring' },
      { type: 'limit_withdrawals', parameters: { maxPerDay: 500 } },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_BEHAVIOR_RULES: FraudRule[] = [
  {
    ruleId: 'behavior_unusual_time',
    name: 'Unusual Activity Time',
    description: 'Flag activity at unusual times for the user',
    category: 'behavior',
    enabled: true,
    priority: 3,
    conditions: [
      { field: 'behavior.timeDeviation', operator: 'gt', value: 3 }, // 3 standard deviations
    ],
    actions: [
      { type: 'require_2fa' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'behavior_unusual_amount',
    name: 'Unusual Transaction Amount',
    description: 'Flag transactions with unusual amounts for the user',
    category: 'behavior',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'behavior.amountDeviation', operator: 'gt', value: 5 }, // 5x average
    ],
    actions: [
      { type: 'manual_review' },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'behavior_pattern_break',
    name: 'Behavior Pattern Break',
    description: 'Flag significant changes in user behavior',
    category: 'behavior',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'behavior.patternScore', operator: 'lt', value: 0.5 },
    ],
    actions: [
      { type: 'require_verification' },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'behavior_session_anomaly',
    name: 'Session Anomaly',
    description: 'Flag anomalous session behavior',
    category: 'behavior',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'behavior.sessionAnomalyScore', operator: 'gt', value: 0.8 },
    ],
    actions: [
      { type: 'require_2fa' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 1800,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_MULTI_ACCOUNT_RULES: FraudRule[] = [
  {
    ruleId: 'multi_account_same_device',
    name: 'Multi-Account Same Device',
    description: 'Detect multiple accounts from same device',
    category: 'multi_account',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'multiAccount.sameDeviceAccounts', operator: 'gt', value: 1 },
    ],
    actions: [
      { type: 'flag_for_compliance' },
      { type: 'enhanced_monitoring' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'multi_account_same_ip',
    name: 'Multi-Account Same IP',
    description: 'Detect multiple accounts from same IP',
    category: 'multi_account',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'multiAccount.sameIPAccounts', operator: 'gt', value: 2 },
    ],
    actions: [
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'multi_account_same_payment',
    name: 'Multi-Account Same Payment Method',
    description: 'Detect multiple accounts with same payment method',
    category: 'multi_account',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'multiAccount.samePaymentAccounts', operator: 'gt', value: 1 },
    ],
    actions: [
      { type: 'suspend_account' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'multi_account_referral_abuse',
    name: 'Referral Abuse',
    description: 'Detect referral abuse patterns',
    category: 'multi_account',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'referral.selfReferralScore', operator: 'gt', value: 0.7 },
    ],
    actions: [
      { type: 'suspend_account' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_BONUS_RULES: FraudRule[] = [
  {
    ruleId: 'bonus_rapid_wagering',
    name: 'Rapid Bonus Wagering',
    description: 'Flag rapid wagering through bonuses',
    category: 'bonus',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'bonus.wagerSpeed', operator: 'gt', value: 10 }, // 10x faster than average
    ],
    actions: [
      { type: 'manual_review' },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'bonus_arbitrage_pattern',
    name: 'Bonus Arbitrage Pattern',
    description: 'Detect bonus arbitrage patterns',
    category: 'bonus',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'bonus.arbitrageScore', operator: 'gt', value: 0.8 },
    ],
    actions: [
      { type: 'flag_for_compliance' },
      { type: 'suspend_account' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'bonus_minimal_play',
    name: 'Minimal Play Before Withdrawal',
    description: 'Flag withdrawals with minimal play after bonus',
    category: 'bonus',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'bonus.playThroughRatio', operator: 'lt', value: 0.5 },
      { field: 'transaction.type', operator: 'eq', value: 'withdrawal' },
    ],
    actions: [
      { type: 'delay_withdrawal', parameters: { delayHours: 48 } },
      { type: 'manual_review' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

export const DEFAULT_TRADING_RULES: FraudRule[] = [
  {
    ruleId: 'trading_wash_trading',
    name: 'Wash Trading Detection',
    description: 'Detect potential wash trading patterns',
    category: 'trading',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'trading.washTradingScore', operator: 'gt', value: 0.7 },
    ],
    actions: [
      { type: 'suspend_account' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'trading_self_trading',
    name: 'Self Trading Detection',
    description: 'Detect self-trading patterns',
    category: 'trading',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'trading.selfTradingCount', operator: 'gt', value: 0 },
    ],
    actions: [
      { type: 'block_trade' },
      { type: 'notify_admin' },
    ],
    cooldownSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'trading_velocity_spike',
    name: 'Trading Velocity Spike',
    description: 'Detect unusual trading velocity',
    category: 'trading',
    enabled: true,
    priority: 2,
    conditions: [
      { field: 'trading.velocityMultiplier', operator: 'gt', value: 5 },
    ],
    actions: [
      { type: 'cool_down_period', parameters: { minutes: 15 } },
      { type: 'enhanced_monitoring' },
    ],
    cooldownSeconds: 900,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
  {
    ruleId: 'trading_coordinated_activity',
    name: 'Coordinated Trading Activity',
    description: 'Detect coordinated trading patterns',
    category: 'trading',
    enabled: true,
    priority: 1,
    conditions: [
      { field: 'trading.coordinationScore', operator: 'gt', value: 0.8 },
    ],
    actions: [
      { type: 'manual_review' },
      { type: 'flag_for_compliance' },
    ],
    cooldownSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  },
];

// ============================================================================
// Rules Engine
// ============================================================================

export interface RulesEngineConfig {
  rules?: FraudRule[];
  enabledCategories?: RuleCategory[];
  logger?: Logger;
}

export interface EvaluationContext {
  userId: string;
  sessionId?: string;
  transaction?: Transaction;
  trade?: Trade;
  device?: Partial<DeviceFingerprint>;
  ip?: Partial<IPAnalysisResult>;
  behavior?: Partial<BehaviorProfile>;
  velocityData?: Record<string, number>;
  multiAccountData?: Record<string, number>;
  bonusData?: Record<string, number>;
  tradingData?: Record<string, number>;
  geoVelocity?: { isPossible: boolean; distanceKm: number; timeHours: number };
  referral?: { selfReferralScore: number };
  custom?: Record<string, unknown>;
}

export class FraudRulesEngine {
  private rules: FraudRule[];
  private enabledCategories: Set<RuleCategory>;
  private logger: Logger;
  private ruleTriggerCounts: Map<string, { count: number; resetAt: Date }> = new Map();
  private ruleLastTriggered: Map<string, Date> = new Map();

  constructor(config: RulesEngineConfig = {}) {
    this.rules = config.rules ?? this.getDefaultRules();
    this.enabledCategories = new Set(
      config.enabledCategories ?? [
        'velocity',
        'device',
        'ip',
        'behavior',
        'multi_account',
        'bonus',
        'trading',
        'financial',
      ]
    );
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[FraudRules] ${msg}`, meta),
      info: (msg, meta) => console.info(`[FraudRules] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[FraudRules] ${msg}`, meta),
      error: (msg, meta) => console.error(`[FraudRules] ${msg}`, meta),
    };
  }

  private getDefaultRules(): FraudRule[] {
    return [
      ...DEFAULT_VELOCITY_RULES,
      ...DEFAULT_DEVICE_RULES,
      ...DEFAULT_IP_RULES,
      ...DEFAULT_BEHAVIOR_RULES,
      ...DEFAULT_MULTI_ACCOUNT_RULES,
      ...DEFAULT_BONUS_RULES,
      ...DEFAULT_TRADING_RULES,
    ];
  }

  // ==========================================================================
  // Rule Evaluation
  // ==========================================================================

  /**
   * Evaluate all enabled rules against the context
   */
  async evaluateRules(context: EvaluationContext): Promise<RuleEvaluationResult[]> {
    const results: RuleEvaluationResult[] = [];
    const enabledRules = this.rules
      .filter((r) => r.enabled && this.enabledCategories.has(r.category))
      .sort((a, b) => a.priority - b.priority);

    for (const rule of enabledRules) {
      if (!this.canTriggerRule(rule)) {
        continue;
      }

      const result = await this.evaluateRule(rule, context);
      results.push(result);

      if (result.triggered) {
        this.recordRuleTrigger(rule);
        this.logger.info('Rule triggered', {
          ruleId: rule.ruleId,
          ruleName: rule.name,
          userId: context.userId,
        });
      }
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  async evaluateRule(
    rule: FraudRule,
    context: EvaluationContext
  ): Promise<RuleEvaluationResult> {
    const conditionResults: ConditionEvaluationResult[] = [];
    let allConditionsPassed = true;

    for (const condition of rule.conditions) {
      const result = this.evaluateCondition(condition, context);
      conditionResults.push(result);

      if (!result.passed) {
        allConditionsPassed = false;
      }
    }

    return {
      ruleId: rule.ruleId,
      triggered: allConditionsPassed,
      conditions: conditionResults,
      actions: allConditionsPassed ? rule.actions : [],
      evaluatedAt: new Date(),
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: RuleCondition,
    context: EvaluationContext
  ): ConditionEvaluationResult {
    const actualValue = this.getFieldValue(condition.field, context);
    const passed = this.compareValues(actualValue, condition.operator, condition.value);

    return {
      condition,
      passed,
      actualValue,
    };
  }

  /**
   * Get field value from context
   */
  private getFieldValue(field: string, context: EvaluationContext): unknown {
    const parts = field.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    actual: unknown,
    operator: RuleOperator,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'gte':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lt':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'lte':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'regex':
        if (typeof actual !== 'string' || typeof expected !== 'string') return false;
        try {
          return new RegExp(expected).test(actual);
        } catch {
          return false;
        }
      case 'exists':
        return actual !== undefined && actual !== null;
      case 'not_exists':
        return actual === undefined || actual === null;
      default:
        return false;
    }
  }

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /**
   * Check if a rule can be triggered based on cooldown and max triggers
   */
  private canTriggerRule(rule: FraudRule): boolean {
    // Check cooldown
    if (rule.cooldownSeconds && rule.cooldownSeconds > 0) {
      const lastTriggered = this.ruleLastTriggered.get(rule.ruleId);
      if (lastTriggered) {
        const cooldownEnd = new Date(lastTriggered.getTime() + rule.cooldownSeconds * 1000);
        if (new Date() < cooldownEnd) {
          return false;
        }
      }
    }

    // Check max triggers per hour
    if (rule.maxTriggersPerHour && rule.maxTriggersPerHour > 0) {
      const triggerData = this.ruleTriggerCounts.get(rule.ruleId);
      if (triggerData) {
        if (new Date() < triggerData.resetAt) {
          if (triggerData.count >= rule.maxTriggersPerHour) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Record a rule trigger for rate limiting
   */
  private recordRuleTrigger(rule: FraudRule): void {
    this.ruleLastTriggered.set(rule.ruleId, new Date());

    const triggerData = this.ruleTriggerCounts.get(rule.ruleId);
    const now = new Date();
    const hourFromNow = new Date(now.getTime() + 3600000);

    if (triggerData && now < triggerData.resetAt) {
      triggerData.count++;
    } else {
      this.ruleTriggerCounts.set(rule.ruleId, {
        count: 1,
        resetAt: hourFromNow,
      });
    }
  }

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  /**
   * Add a new rule
   */
  addRule(rule: FraudRule): void {
    // Remove existing rule with same ID
    this.rules = this.rules.filter((r) => r.ruleId !== rule.ruleId);
    this.rules.push(rule);
    this.logger.info('Rule added', { ruleId: rule.ruleId, ruleName: rule.name });
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter((r) => r.ruleId !== ruleId);
    const removed = this.rules.length < initialLength;

    if (removed) {
      this.logger.info('Rule removed', { ruleId });
    }

    return removed;
  }

  /**
   * Enable a rule
   */
  enableRule(ruleId: string): boolean {
    const rule = this.rules.find((r) => r.ruleId === ruleId);
    if (rule) {
      rule.enabled = true;
      rule.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Disable a rule
   */
  disableRule(ruleId: string): boolean {
    const rule = this.rules.find((r) => r.ruleId === ruleId);
    if (rule) {
      rule.enabled = false;
      rule.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): FraudRule[] {
    return [...this.rules];
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): FraudRule[] {
    return this.rules.filter((r) => r.category === category);
  }

  /**
   * Enable a category
   */
  enableCategory(category: RuleCategory): void {
    this.enabledCategories.add(category);
  }

  /**
   * Disable a category
   */
  disableCategory(category: RuleCategory): void {
    this.enabledCategories.delete(category);
  }

  // ==========================================================================
  // Signal Generation
  // ==========================================================================

  /**
   * Convert triggered rules to risk signals
   */
  rulesToSignals(results: RuleEvaluationResult[]): RiskSignal[] {
    const signals: RiskSignal[] = [];

    for (const result of results) {
      if (!result.triggered) continue;

      const rule = this.rules.find((r) => r.ruleId === result.ruleId);
      if (!rule) continue;

      const signal: RiskSignal = {
        signalId: crypto.randomUUID(),
        type: this.ruleToSignalType(rule),
        severity: this.rulePriorityToSeverity(rule.priority),
        description: rule.description,
        evidence: {
          ruleId: rule.ruleId,
          ruleName: rule.name,
          category: rule.category,
          conditions: result.conditions.map((c) => ({
            field: c.condition.field,
            operator: c.condition.operator,
            expected: c.condition.value,
            actual: c.actualValue,
          })),
        },
        confidence: 0.9,
        detectedAt: result.evaluatedAt,
      };

      signals.push(signal);
    }

    return signals;
  }

  /**
   * Convert rule category to signal type
   */
  private ruleToSignalType(rule: FraudRule): RiskSignalType {
    const categoryMapping: Record<RuleCategory, RiskSignalType> = {
      velocity: 'velocity_spike',
      device: 'device_anomaly',
      ip: 'location_anomaly',
      behavior: 'behavioral_anomaly',
      multi_account: 'multi_account',
      bonus: 'bonus_abuse',
      trading: 'suspicious_pattern',
      financial: 'amount_anomaly',
    };

    // Check for specific rule types
    if (rule.ruleId.includes('vpn')) return 'vpn_detected';
    if (rule.ruleId.includes('tor')) return 'tor_detected';
    if (rule.ruleId.includes('proxy')) return 'proxy_detected';
    if (rule.ruleId.includes('datacenter')) return 'datacenter_ip';
    if (rule.ruleId.includes('geo_velocity')) return 'geo_velocity_violation';
    if (rule.ruleId.includes('device_sharing')) return 'device_sharing';
    if (rule.ruleId.includes('new_device')) return 'new_device';
    if (rule.ruleId.includes('emulator')) return 'emulator_detected';
    if (rule.ruleId.includes('bot')) return 'bot_detected';
    if (rule.ruleId.includes('wash_trading')) return 'wash_trading';
    if (rule.ruleId.includes('self_trading')) return 'self_trading';
    if (rule.ruleId.includes('referral')) return 'referral_fraud';

    return categoryMapping[rule.category] ?? 'suspicious_pattern';
  }

  /**
   * Convert rule priority to severity
   */
  private rulePriorityToSeverity(priority: number): 'low' | 'medium' | 'high' {
    if (priority === 1) return 'high';
    if (priority === 2) return 'medium';
    return 'low';
  }

  /**
   * Get actions to execute from triggered rules
   */
  getActionsToExecute(results: RuleEvaluationResult[]): RuleAction[] {
    const actions: RuleAction[] = [];
    const actionTypes = new Set<RecommendedAction>();

    for (const result of results) {
      if (!result.triggered) continue;

      for (const action of result.actions) {
        // Deduplicate actions by type (keep first occurrence)
        if (!actionTypes.has(action.type)) {
          actions.push(action);
          actionTypes.add(action.type);
        }
      }
    }

    return actions;
  }
}

export default FraudRulesEngine;
