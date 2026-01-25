/**
 * Feature Flag Definitions
 *
 * Central registry of all feature flags used in the PULL platform.
 * Each flag has a key, description, default value, and metadata.
 */

import type { FeatureFlagDefinition, FeatureFlagName, FeatureFlagValue } from './types';

/**
 * PULL Stories Feature
 * Enables the ephemeral stories feature for sharing trading moments
 */
export const ENABLE_STORIES: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_STORIES',
  description: 'Enable PULL Stories feature for sharing trading moments and market insights',
  defaultValue: false,
  type: 'boolean',
  tags: ['social', 'engagement', 'mobile'],
};

/**
 * Cash Battles Feature
 * Enables 1v1 prediction battles with cash stakes
 */
export const ENABLE_CASH_BATTLES: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_CASH_BATTLES',
  description: 'Enable 1v1 cash battles where users compete on predictions',
  defaultValue: false,
  type: 'boolean',
  tags: ['gaming', 'monetization', 'social'],
};

/**
 * Squad Mode Feature
 * Enables team/squad betting functionality
 */
export const ENABLE_SQUAD_MODE: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_SQUAD_MODE',
  description: 'Enable squad/team betting mode for group predictions',
  defaultValue: false,
  type: 'boolean',
  tags: ['social', 'gaming', 'teams'],
};

/**
 * AI Copilot Feature
 * Enables the AI-powered trading assistant
 */
export const ENABLE_AI_COPILOT: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_AI_COPILOT',
  description: 'Enable AI Copilot assistant for trading recommendations and insights',
  defaultValue: false,
  type: 'boolean',
  tags: ['ai', 'premium', 'trading'],
};

/**
 * Live Rooms Feature
 * Enables audio rooms for live trading discussions
 */
export const ENABLE_LIVE_ROOMS: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_LIVE_ROOMS',
  description: 'Enable live audio rooms for real-time trading discussions',
  defaultValue: false,
  type: 'boolean',
  tags: ['social', 'audio', 'live'],
};

/**
 * Crypto Deposits Feature
 * Enables cryptocurrency deposit functionality
 */
export const ENABLE_CRYPTO_DEPOSITS: FeatureFlagDefinition<boolean> = {
  key: 'ENABLE_CRYPTO_DEPOSITS',
  description: 'Enable cryptocurrency deposits (BTC, ETH, USDC, etc.)',
  defaultValue: false,
  type: 'boolean',
  tags: ['payments', 'crypto', 'deposits'],
};

/**
 * Maintenance Mode
 * Disables trading functionality during maintenance
 */
export const MAINTENANCE_MODE: FeatureFlagDefinition<boolean> = {
  key: 'MAINTENANCE_MODE',
  description: 'Enable maintenance mode - disables all trading operations',
  defaultValue: false,
  type: 'boolean',
  tags: ['operations', 'system', 'critical'],
};

/**
 * Beta Features
 * Enables all beta features for beta testers
 */
export const BETA_FEATURES: FeatureFlagDefinition<boolean> = {
  key: 'BETA_FEATURES',
  description: 'Enable all beta features for designated beta users',
  defaultValue: false,
  type: 'boolean',
  tags: ['beta', 'testing', 'early-access'],
};

/**
 * Registry of all feature flags
 */
export const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlagDefinition> = {
  ENABLE_STORIES,
  ENABLE_CASH_BATTLES,
  ENABLE_SQUAD_MODE,
  ENABLE_AI_COPILOT,
  ENABLE_LIVE_ROOMS,
  ENABLE_CRYPTO_DEPOSITS,
  MAINTENANCE_MODE,
  BETA_FEATURES,
};

/**
 * Get all flag keys
 */
export function getAllFlagKeys(): FeatureFlagName[] {
  return Object.keys(FEATURE_FLAGS) as FeatureFlagName[];
}

/**
 * Get flag definition by key
 */
export function getFlagDefinition(key: FeatureFlagName): FeatureFlagDefinition | undefined {
  return FEATURE_FLAGS[key];
}

/**
 * Get default value for a flag
 */
export function getDefaultValue<T extends FeatureFlagValue>(key: FeatureFlagName): T {
  const flag = FEATURE_FLAGS[key];
  if (!flag) {
    throw new Error(`Unknown feature flag: ${key}`);
  }
  return flag.defaultValue as T;
}

/**
 * Get all default flag values
 */
export function getAllDefaultValues(): Record<FeatureFlagName, FeatureFlagValue> {
  const defaults: Partial<Record<FeatureFlagName, FeatureFlagValue>> = {};
  for (const [key, flag] of Object.entries(FEATURE_FLAGS)) {
    defaults[key as FeatureFlagName] = flag.defaultValue;
  }
  return defaults as Record<FeatureFlagName, FeatureFlagValue>;
}

/**
 * Get flags by tag
 */
export function getFlagsByTag(tag: string): FeatureFlagDefinition[] {
  return Object.values(FEATURE_FLAGS).filter((flag) => flag.tags?.includes(tag));
}

/**
 * Check if a flag is deprecated
 */
export function isFlagDeprecated(key: FeatureFlagName): boolean {
  const flag = FEATURE_FLAGS[key];
  return flag?.deprecated ?? false;
}

/**
 * Default environment configurations
 */
export const ENVIRONMENT_DEFAULTS: Record<
  'development' | 'staging' | 'production',
  Partial<Record<FeatureFlagName, FeatureFlagValue>>
> = {
  development: {
    // Enable most features in development
    ENABLE_STORIES: true,
    ENABLE_CASH_BATTLES: true,
    ENABLE_SQUAD_MODE: true,
    ENABLE_AI_COPILOT: true,
    ENABLE_LIVE_ROOMS: true,
    ENABLE_CRYPTO_DEPOSITS: true,
    MAINTENANCE_MODE: false,
    BETA_FEATURES: true,
  },
  staging: {
    // Enable beta features in staging
    ENABLE_STORIES: true,
    ENABLE_CASH_BATTLES: true,
    ENABLE_SQUAD_MODE: true,
    ENABLE_AI_COPILOT: true,
    ENABLE_LIVE_ROOMS: false,
    ENABLE_CRYPTO_DEPOSITS: false,
    MAINTENANCE_MODE: false,
    BETA_FEATURES: true,
  },
  production: {
    // Conservative defaults for production
    ENABLE_STORIES: false,
    ENABLE_CASH_BATTLES: false,
    ENABLE_SQUAD_MODE: false,
    ENABLE_AI_COPILOT: false,
    ENABLE_LIVE_ROOMS: false,
    ENABLE_CRYPTO_DEPOSITS: false,
    MAINTENANCE_MODE: false,
    BETA_FEATURES: false,
  },
};

/**
 * Get environment-specific default value
 */
export function getEnvironmentDefault(
  key: FeatureFlagName,
  environment: 'development' | 'staging' | 'production'
): FeatureFlagValue {
  const envDefaults = ENVIRONMENT_DEFAULTS[environment];
  if (key in envDefaults) {
    return envDefaults[key]!;
  }
  return getDefaultValue(key);
}
