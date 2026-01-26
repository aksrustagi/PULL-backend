/**
 * Feature Flags System
 *
 * Controls which features are enabled/disabled in production.
 * Incomplete features should be disabled to prevent users from
 * hitting placeholder/TODO endpoints.
 */

import { getLogger } from "@pull/core/services";
import type { Context } from "hono";

const logger = getLogger();

/**
 * Feature flag definitions
 * Set to true when the feature is production-ready
 */
export const FEATURE_FLAGS = {
  // Core features - PRODUCTION READY
  auth: true,
  predictions: true,
  trading_basic: true,
  rewards_basic: true,
  kyc: true,
  payments_deposits: true,
  payments_withdrawals: true,

  // Sports features - NOT READY
  ncaa_brackets: false,
  ncaa_betting: false,
  golf: false,
  nba: false,
  mlb: false,

  // Advanced features - NOT READY
  fantasy_leagues: false,
  fantasy_markets: false,
  fantasy_trading: false,
  real_estate: false,
  rwa_tokenization: false,
  social_trading: false,
  copy_trading: false,
  data_flywheel: false,
  ai_insights: false,
  ai_copilot: false,

  // Viral/Growth features - NOT READY
  viral_growth: false,
  stories: false,
  cash_battles: false,
  squads: false,
  watch_party: false,

  // Premium features - NOT READY
  vip: false,
  insurance: false,
  props_builder: false,
  nfts: false,
  streaks_advanced: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature is enabled
 * Can be overridden by environment variables: FEATURE_FLAG_{NAME}=true
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // Check environment override first
  const envKey = `FEATURE_FLAG_${flag.toUpperCase()}`;
  const envValue = process.env[envKey];

  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }

  return FEATURE_FLAGS[flag];
}

/**
 * Response type for not implemented features
 */
interface NotImplementedResponse {
  success: false;
  error: {
    code: "NOT_IMPLEMENTED";
    message: string;
    feature?: string;
  };
  requestId: string;
  timestamp: string;
}

/**
 * Return a 501 Not Implemented response for disabled features
 */
export function notImplemented(
  c: Context,
  feature: string,
  message?: string
): Response {
  const requestId = c.get("requestId") || crypto.randomUUID();

  logger.info("Feature not implemented accessed", {
    requestId,
    feature,
    path: c.req.path,
    method: c.req.method,
  });

  const response: NotImplementedResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: message || `The ${feature} feature is not yet available`,
      feature,
    },
    requestId,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 501);
}

/**
 * Middleware factory to guard routes by feature flag
 */
export function requireFeature(flag: FeatureFlag, featureName?: string) {
  return async (c: Context, next: () => Promise<void>) => {
    if (!isFeatureEnabled(flag)) {
      return notImplemented(c, featureName || flag);
    }
    await next();
  };
}

/**
 * Helper to wrap route handlers that may not be implemented
 * Returns 501 if the handler throws a NotImplementedError
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Feature not implemented: ${feature}`);
    this.name = "NotImplementedError";
  }
}

/**
 * Get all feature flags with their current status
 * Useful for admin dashboards
 */
export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  const flags = {} as Record<FeatureFlag, boolean>;

  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
    flags[key] = isFeatureEnabled(key);
  }

  return flags;
}
