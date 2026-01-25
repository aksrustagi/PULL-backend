/**
 * Feature Flags Module
 *
 * Centralized feature flag management for the PULL platform.
 *
 * Features:
 * - Multiple provider support (JSON, LaunchDarkly, ConfigCat)
 * - User and environment targeting
 * - Local overrides for testing
 * - Hono middleware integration
 * - Type-safe flag definitions
 *
 * @example
 * ```typescript
 * import {
 *   initializeFeatureFlags,
 *   isFeatureEnabled,
 *   featureFlagMiddleware,
 *   isEnabled,
 * } from '@pull/core/services/feature-flags';
 *
 * // Initialize the client
 * await initializeFeatureFlags({
 *   provider: 'json',
 *   defaultEnvironment: { environment: 'production' },
 * });
 *
 * // Check a flag
 * if (await isFeatureEnabled('ENABLE_AI_COPILOT')) {
 *   // Feature is enabled
 * }
 *
 * // Use in Hono app
 * app.use('*', featureFlagMiddleware({
 *   environment: 'production',
 * }));
 *
 * app.get('/api/copilot', requireFeature('ENABLE_AI_COPILOT'), async (c) => {
 *   // Only runs if feature is enabled
 * });
 * ```
 */

// Types
export type {
  FeatureFlagName,
  FeatureFlagValue,
  FeatureFlagUserContext,
  FeatureFlagEnvironment,
  FeatureFlagContext,
  FeatureFlagDefinition,
  FeatureFlagEvaluation,
  FeatureFlagEvaluationReason,
  FeatureFlagProvider,
  FeatureFlagOverride,
  FeatureFlagClientConfig,
  FeatureFlagChangeEvent,
  FeatureFlagChangeListener,
  FeatureFlagMiddlewareContext,
  FeatureFlagVariables,
} from './types';

// Flag definitions
export {
  ENABLE_STORIES,
  ENABLE_CASH_BATTLES,
  ENABLE_SQUAD_MODE,
  ENABLE_AI_COPILOT,
  ENABLE_LIVE_ROOMS,
  ENABLE_CRYPTO_DEPOSITS,
  MAINTENANCE_MODE,
  BETA_FEATURES,
  FEATURE_FLAGS,
  getAllFlagKeys,
  getFlagDefinition,
  getDefaultValue,
  getAllDefaultValues,
  getFlagsByTag,
  isFlagDeprecated,
  ENVIRONMENT_DEFAULTS,
  getEnvironmentDefault,
} from './flags';

// Client
export {
  FeatureFlagClient,
  getFeatureFlagClient,
  initializeFeatureFlags,
  createFeatureFlagClient,
  isFeatureEnabled,
  getAllFeatureFlags,
} from './client';

// Middleware
export {
  featureFlagMiddleware,
  getFeatureFlags,
  isEnabled,
  getFlag,
  requireFeature,
  checkMaintenanceMode,
  requireBetaAccess,
  abTestMiddleware,
} from './middleware';
export type { FeatureFlagMiddlewareOptions } from './middleware';
