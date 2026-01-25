/**
 * Feature Flag Middleware
 *
 * Hono middleware for injecting feature flags into request context.
 * Automatically resolves flags based on the current user and environment.
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import type {
  FeatureFlagContext,
  FeatureFlagMiddlewareContext,
  FeatureFlagName,
  FeatureFlagUserContext,
  FeatureFlagValue,
  FeatureFlagVariables,
} from './types';
import { getFeatureFlagClient, FeatureFlagClient } from './client';
import { getAllFlagKeys, getDefaultValue } from './flags';

/**
 * Options for feature flag middleware
 */
export interface FeatureFlagMiddlewareOptions {
  /** Custom feature flag client (uses default if not provided) */
  client?: FeatureFlagClient;
  /** Function to extract user context from request */
  getUserContext?: (c: Context) => FeatureFlagUserContext | undefined;
  /** Current environment */
  environment: 'development' | 'staging' | 'production';
  /** Application version */
  version?: string;
  /** Whether to prefetch all flags */
  prefetchAll?: boolean;
  /** Flags to prefetch (if not prefetching all) */
  prefetchFlags?: FeatureFlagName[];
  /** Header name for feature flag overrides (for testing) */
  overrideHeader?: string;
  /** Enable override header (should be false in production) */
  allowOverrideHeader?: boolean;
}

/**
 * Default user context extractor
 * Extracts user info from common auth patterns
 */
function defaultGetUserContext(c: Context): FeatureFlagUserContext | undefined {
  // Try to get user from common auth middleware patterns
  const user = c.get('user') as Record<string, unknown> | undefined;
  if (!user) {
    return undefined;
  }

  return {
    userId: String(user.id || user.userId || user.sub || ''),
    email: user.email as string | undefined,
    name: user.name as string | undefined,
    isBetaUser: Boolean(user.isBetaUser || user.betaTester),
    isInternalUser: Boolean(user.isInternal || user.isEmployee),
    tier: user.tier as 'free' | 'pro' | 'enterprise' | undefined,
    createdAt: user.createdAt ? new Date(user.createdAt as string | number) : undefined,
  };
}

/**
 * Parse override header value
 * Format: FLAG1=true,FLAG2=false,FLAG3=42
 */
function parseOverrideHeader(headerValue: string): Map<FeatureFlagName, FeatureFlagValue> {
  const overrides = new Map<FeatureFlagName, FeatureFlagValue>();

  const pairs = headerValue.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (!key || value === undefined) continue;

    // Validate flag name
    const flagKeys = getAllFlagKeys();
    if (!flagKeys.includes(key as FeatureFlagName)) continue;

    // Parse value
    let parsedValue: FeatureFlagValue;
    if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value))) {
      parsedValue = Number(value);
    } else {
      parsedValue = value;
    }

    overrides.set(key as FeatureFlagName, parsedValue);
  }

  return overrides;
}

/**
 * Create feature flag middleware
 */
export function featureFlagMiddleware(options: FeatureFlagMiddlewareOptions) {
  const {
    client: customClient,
    getUserContext = defaultGetUserContext,
    environment,
    version,
    prefetchAll = true,
    prefetchFlags = [],
    overrideHeader = 'X-Feature-Flags',
    allowOverrideHeader = false,
  } = options;

  return createMiddleware<{ Variables: FeatureFlagVariables }>(async (c, next) => {
    const client = customClient ?? getFeatureFlagClient();

    // Build context
    const userContext = getUserContext(c);
    const flagContext: FeatureFlagContext = {
      user: userContext,
      environment: {
        environment,
        version,
      },
    };

    // Handle override header (for testing)
    let headerOverrides: Map<FeatureFlagName, FeatureFlagValue> | undefined;
    if (allowOverrideHeader && environment !== 'production') {
      const overrideHeaderValue = c.req.header(overrideHeader);
      if (overrideHeaderValue) {
        headerOverrides = parseOverrideHeader(overrideHeaderValue);
      }
    }

    // Resolve flags
    let flags: Record<FeatureFlagName, FeatureFlagValue>;

    if (prefetchAll) {
      flags = await client.getAllFlags(flagContext);
    } else {
      // Only fetch specified flags
      flags = {} as Record<FeatureFlagName, FeatureFlagValue>;

      const flagsToFetch = prefetchFlags.length > 0 ? prefetchFlags : getAllFlagKeys();

      await Promise.all(
        flagsToFetch.map(async (key) => {
          const defaultValue = getDefaultValue(key);
          if (typeof defaultValue === 'boolean') {
            flags[key] = await client.getBooleanFlag(key, defaultValue, flagContext);
          } else if (typeof defaultValue === 'string') {
            flags[key] = await client.getStringFlag(key, defaultValue, flagContext);
          } else if (typeof defaultValue === 'number') {
            flags[key] = await client.getNumberFlag(key, defaultValue, flagContext);
          } else {
            flags[key] = await client.getJsonFlag(key, defaultValue as object, flagContext);
          }
        })
      );
    }

    // Apply header overrides
    if (headerOverrides) {
      for (const [key, value] of headerOverrides) {
        flags[key] = value;
      }
    }

    // Create middleware context
    const featureFlagsContext: FeatureFlagMiddlewareContext = {
      flags,
      isEnabled: (key: FeatureFlagName) => {
        const value = flags[key];
        return typeof value === 'boolean' ? value : false;
      },
      getFlag: <T extends FeatureFlagValue>(key: FeatureFlagName) => {
        return flags[key] as T | undefined;
      },
    };

    // Set context variable
    c.set('featureFlags', featureFlagsContext);

    await next();
  });
}

/**
 * Get feature flags from context
 */
export function getFeatureFlags(c: Context): FeatureFlagMiddlewareContext {
  const featureFlags = c.get('featureFlags') as FeatureFlagMiddlewareContext | undefined;
  if (!featureFlags) {
    throw new Error('Feature flags not available. Ensure featureFlagMiddleware is applied.');
  }
  return featureFlags;
}

/**
 * Check if a feature is enabled (from context)
 */
export function isEnabled(c: Context, key: FeatureFlagName): boolean {
  return getFeatureFlags(c).isEnabled(key);
}

/**
 * Get a feature flag value (from context)
 */
export function getFlag<T extends FeatureFlagValue>(c: Context, key: FeatureFlagName): T | undefined {
  return getFeatureFlags(c).getFlag<T>(key);
}

/**
 * Require a feature to be enabled
 * Returns 404 if feature is not enabled
 */
export function requireFeature(key: FeatureFlagName, message?: string) {
  return createMiddleware(async (c, next) => {
    if (!isEnabled(c, key)) {
      return c.json(
        {
          error: 'Feature not available',
          message: message ?? `The ${key} feature is not currently available`,
          code: 'FEATURE_DISABLED',
        },
        404
      );
    }
    await next();
  });
}

/**
 * Check maintenance mode
 * Returns 503 if maintenance mode is enabled
 */
export function checkMaintenanceMode(options?: {
  allowedPaths?: string[];
  message?: string;
}) {
  const { allowedPaths = ['/health', '/ready'], message = 'System is under maintenance' } =
    options ?? {};

  return createMiddleware(async (c, next) => {
    // Allow health check endpoints
    const path = new URL(c.req.url).pathname;
    if (allowedPaths.some((p) => path.startsWith(p))) {
      await next();
      return;
    }

    if (isEnabled(c, 'MAINTENANCE_MODE')) {
      return c.json(
        {
          error: 'Service Unavailable',
          message,
          code: 'MAINTENANCE_MODE',
          retryAfter: 300, // Suggest retrying in 5 minutes
        },
        503
      );
    }

    await next();
  });
}

/**
 * Require beta access
 * Returns 403 if user is not a beta tester
 */
export function requireBetaAccess(message?: string) {
  return createMiddleware(async (c, next) => {
    const flags = getFeatureFlags(c);

    // Check if beta features are globally disabled
    if (!flags.isEnabled('BETA_FEATURES')) {
      return c.json(
        {
          error: 'Beta features not available',
          message: message ?? 'Beta features are not currently enabled',
          code: 'BETA_DISABLED',
        },
        403
      );
    }

    await next();
  });
}

/**
 * A/B test middleware
 * Assigns users to experiment variants based on feature flags
 */
export function abTestMiddleware(experimentKey: FeatureFlagName, variants: string[]) {
  return createMiddleware(async (c, next) => {
    const flags = getFeatureFlags(c);
    const flagValue = flags.getFlag<string>(experimentKey);

    // Determine variant
    let variant: string;
    if (flagValue && variants.includes(flagValue)) {
      variant = flagValue;
    } else {
      // Default to first variant (control)
      variant = variants[0];
    }

    // Set variant in context
    c.set('experimentVariant', variant);
    c.set('experimentKey', experimentKey);

    await next();
  });
}
