/**
 * Feature Flags Types
 *
 * Type definitions for the PULL platform feature flag system.
 * Supports both simple JSON config and LaunchDarkly-compatible providers.
 */

/**
 * All feature flag names used in the PULL platform
 */
export type FeatureFlagName =
  | 'ENABLE_STORIES'
  | 'ENABLE_CASH_BATTLES'
  | 'ENABLE_SQUAD_MODE'
  | 'ENABLE_AI_COPILOT'
  | 'ENABLE_LIVE_ROOMS'
  | 'ENABLE_CRYPTO_DEPOSITS'
  | 'MAINTENANCE_MODE'
  | 'BETA_FEATURES';

/**
 * Feature flag value types
 */
export type FeatureFlagValue = boolean | string | number | object;

/**
 * User context for feature flag evaluation
 */
export interface FeatureFlagUserContext {
  /** Unique user identifier */
  userId: string;
  /** User's email address */
  email?: string;
  /** User's display name */
  name?: string;
  /** Whether user is a beta tester */
  isBetaUser?: boolean;
  /** Whether user is an internal/employee user */
  isInternalUser?: boolean;
  /** User's account tier */
  tier?: 'free' | 'pro' | 'enterprise';
  /** User's account creation date */
  createdAt?: Date;
  /** Custom attributes for targeting */
  custom?: Record<string, string | number | boolean>;
}

/**
 * Environment context for feature flag evaluation
 */
export interface FeatureFlagEnvironment {
  /** Current environment (development, staging, production) */
  environment: 'development' | 'staging' | 'production';
  /** Application version */
  version?: string;
  /** Region/datacenter */
  region?: string;
}

/**
 * Combined context for flag evaluation
 */
export interface FeatureFlagContext {
  user?: FeatureFlagUserContext;
  environment: FeatureFlagEnvironment;
}

/**
 * Feature flag definition with configuration
 */
export interface FeatureFlagDefinition<T extends FeatureFlagValue = boolean> {
  /** Flag name/key */
  key: FeatureFlagName;
  /** Human-readable description */
  description: string;
  /** Default value when flag is not found or evaluation fails */
  defaultValue: T;
  /** Flag type */
  type: 'boolean' | 'string' | 'number' | 'json';
  /** Tags for categorization */
  tags?: string[];
  /** Whether this flag is deprecated */
  deprecated?: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
}

/**
 * Feature flag evaluation result
 */
export interface FeatureFlagEvaluation<T extends FeatureFlagValue = boolean> {
  /** The flag key */
  key: FeatureFlagName;
  /** The evaluated value */
  value: T;
  /** Whether the value is from defaults */
  isDefault: boolean;
  /** Reason for the evaluation result */
  reason: FeatureFlagEvaluationReason;
  /** Variation index (for A/B testing) */
  variationIndex?: number;
}

/**
 * Reasons for feature flag evaluation results
 */
export type FeatureFlagEvaluationReason =
  | 'OFF' // Flag is off for everyone
  | 'FALLTHROUGH' // Default rule matched
  | 'TARGET_MATCH' // User was specifically targeted
  | 'RULE_MATCH' // A targeting rule matched
  | 'PREREQUISITE_FAILED' // A prerequisite flag was not met
  | 'ERROR' // An error occurred during evaluation
  | 'CLIENT_NOT_READY'; // Client is not initialized

/**
 * Feature flag provider interface
 * Implement this to add a new flag source (e.g., LaunchDarkly, ConfigCat, etc.)
 */
export interface FeatureFlagProvider {
  /** Provider name */
  readonly name: string;

  /** Initialize the provider */
  initialize(): Promise<void>;

  /** Close/cleanup the provider */
  close(): Promise<void>;

  /** Check if provider is ready */
  isReady(): boolean;

  /** Get a boolean flag value */
  getBooleanFlag(
    key: FeatureFlagName,
    defaultValue: boolean,
    context?: FeatureFlagContext
  ): Promise<boolean>;

  /** Get a string flag value */
  getStringFlag(
    key: FeatureFlagName,
    defaultValue: string,
    context?: FeatureFlagContext
  ): Promise<string>;

  /** Get a number flag value */
  getNumberFlag(
    key: FeatureFlagName,
    defaultValue: number,
    context?: FeatureFlagContext
  ): Promise<number>;

  /** Get a JSON flag value */
  getJsonFlag<T extends object>(
    key: FeatureFlagName,
    defaultValue: T,
    context?: FeatureFlagContext
  ): Promise<T>;

  /** Get detailed evaluation result */
  evaluate<T extends FeatureFlagValue>(
    key: FeatureFlagName,
    defaultValue: T,
    context?: FeatureFlagContext
  ): Promise<FeatureFlagEvaluation<T>>;

  /** Get all flags for a context */
  getAllFlags(context?: FeatureFlagContext): Promise<Record<FeatureFlagName, FeatureFlagValue>>;
}

/**
 * Feature flag override for testing/development
 */
export interface FeatureFlagOverride {
  key: FeatureFlagName;
  value: FeatureFlagValue;
  expiresAt?: Date;
}

/**
 * Feature flag client configuration
 */
export interface FeatureFlagClientConfig {
  /** Provider to use */
  provider: 'json' | 'launchdarkly' | 'configcat' | 'custom';
  /** LaunchDarkly SDK key (if using LaunchDarkly) */
  launchDarklyKey?: string;
  /** ConfigCat SDK key (if using ConfigCat) */
  configCatKey?: string;
  /** Custom provider instance (if using custom) */
  customProvider?: FeatureFlagProvider;
  /** Path to JSON config file (if using json provider) */
  jsonConfigPath?: string;
  /** Default environment */
  defaultEnvironment: FeatureFlagEnvironment;
  /** Enable caching */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Enable analytics/tracking */
  enableAnalytics?: boolean;
  /** Logger function */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: object) => void;
}

/**
 * Feature flag change event
 */
export interface FeatureFlagChangeEvent {
  key: FeatureFlagName;
  previousValue: FeatureFlagValue;
  newValue: FeatureFlagValue;
  timestamp: Date;
}

/**
 * Feature flag listener
 */
export type FeatureFlagChangeListener = (event: FeatureFlagChangeEvent) => void;

/**
 * Middleware context with feature flags
 */
export interface FeatureFlagMiddlewareContext {
  /** All resolved flags for the current request */
  flags: Record<FeatureFlagName, FeatureFlagValue>;
  /** Check if a boolean flag is enabled */
  isEnabled: (key: FeatureFlagName) => boolean;
  /** Get a flag value */
  getFlag: <T extends FeatureFlagValue>(key: FeatureFlagName) => T | undefined;
}

/**
 * Hono middleware variables
 */
export interface FeatureFlagVariables {
  featureFlags: FeatureFlagMiddlewareContext;
}
