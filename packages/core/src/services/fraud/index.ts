/**
 * Fraud Detection Service
 * Comprehensive fraud detection with velocity checks, device fingerprinting,
 * IP analysis, behavioral analysis, and multi-accounting detection
 */

// Main client
export { FraudDetectionClient, default } from './client';

// Rules engine
export {
  FraudRulesEngine,
  DEFAULT_VELOCITY_RULES,
  DEFAULT_DEVICE_RULES,
  DEFAULT_IP_RULES,
  DEFAULT_BEHAVIOR_RULES,
  DEFAULT_MULTI_ACCOUNT_RULES,
  DEFAULT_BONUS_RULES,
  DEFAULT_TRADING_RULES,
} from './rules';
export type { RulesEngineConfig, EvaluationContext } from './rules';

// Scoring engine
export { RiskScoringEngine } from './scoring';
export type { RiskScoringConfig, ScoringContext } from './scoring';

// All types
export * from './types';
