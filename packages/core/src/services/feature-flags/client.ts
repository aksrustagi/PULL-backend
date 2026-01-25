/**
 * Feature Flag Client
 *
 * Unified client for feature flag evaluation supporting multiple providers:
 * - JSON config (simple, file-based)
 * - LaunchDarkly (enterprise-grade)
 * - ConfigCat (alternative provider)
 * - Custom providers
 */

import type {
  FeatureFlagClientConfig,
  FeatureFlagContext,
  FeatureFlagEvaluation,
  FeatureFlagName,
  FeatureFlagProvider,
  FeatureFlagValue,
  FeatureFlagChangeListener,
  FeatureFlagChangeEvent,
  FeatureFlagOverride,
  FeatureFlagEnvironment,
} from './types';
import { getAllDefaultValues, getEnvironmentDefault, FEATURE_FLAGS } from './flags';

/**
 * JSON-based feature flag provider
 * Simple provider that uses a JSON configuration for flag values
 */
class JsonFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = 'json';
  private config: Record<string, FeatureFlagValue> = {};
  private ready = false;
  private environment: FeatureFlagEnvironment;
  private logger: FeatureFlagClientConfig['logger'];

  constructor(
    configPath: string | undefined,
    environment: FeatureFlagEnvironment,
    logger?: FeatureFlagClientConfig['logger']
  ) {
    this.environment = environment;
    this.logger = logger;

    // Initialize with environment defaults
    const envDefaults = getAllDefaultValues();
    for (const key of Object.keys(envDefaults)) {
      this.config[key] = getEnvironmentDefault(
        key as FeatureFlagName,
        environment.environment
      );
    }
  }

  async initialize(): Promise<void> {
    // Load from environment variables
    this.loadFromEnvironment();
    this.ready = true;
    this.logger?.('info', 'JSON feature flag provider initialized', {
      environment: this.environment.environment,
      flagCount: Object.keys(this.config).length,
    });
  }

  private loadFromEnvironment(): void {
    // Load flags from environment variables
    // Format: FEATURE_FLAG_<FLAG_NAME>=true|false
    for (const key of Object.keys(FEATURE_FLAGS)) {
      const envVar = `FEATURE_FLAG_${key}`;
      const envValue = process.env[envVar];

      if (envValue !== undefined) {
        const flag = FEATURE_FLAGS[key as FeatureFlagName];
        switch (flag.type) {
          case 'boolean':
            this.config[key] = envValue.toLowerCase() === 'true';
            break;
          case 'number':
            this.config[key] = parseFloat(envValue);
            break;
          case 'json':
            try {
              this.config[key] = JSON.parse(envValue);
            } catch {
              this.logger?.('warn', `Failed to parse JSON flag: ${key}`);
            }
            break;
          default:
            this.config[key] = envValue;
        }
      }
    }
  }

  async close(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getBooleanFlag(
    key: FeatureFlagName,
    defaultValue: boolean,
    _context?: FeatureFlagContext
  ): Promise<boolean> {
    const value = this.config[key];
    if (typeof value === 'boolean') {
      return value;
    }
    return defaultValue;
  }

  async getStringFlag(
    key: FeatureFlagName,
    defaultValue: string,
    _context?: FeatureFlagContext
  ): Promise<string> {
    const value = this.config[key];
    if (typeof value === 'string') {
      return value;
    }
    return defaultValue;
  }

  async getNumberFlag(
    key: FeatureFlagName,
    defaultValue: number,
    _context?: FeatureFlagContext
  ): Promise<number> {
    const value = this.config[key];
    if (typeof value === 'number') {
      return value;
    }
    return defaultValue;
  }

  async getJsonFlag<T extends object>(
    key: FeatureFlagName,
    defaultValue: T,
    _context?: FeatureFlagContext
  ): Promise<T> {
    const value = this.config[key];
    if (typeof value === 'object' && value !== null) {
      return value as T;
    }
    return defaultValue;
  }

  async evaluate<T extends FeatureFlagValue>(
    key: FeatureFlagName,
    defaultValue: T,
    _context?: FeatureFlagContext
  ): Promise<FeatureFlagEvaluation<T>> {
    const value = this.config[key];
    const isDefault = value === undefined;

    return {
      key,
      value: (isDefault ? defaultValue : value) as T,
      isDefault,
      reason: isDefault ? 'FALLTHROUGH' : 'TARGET_MATCH',
    };
  }

  async getAllFlags(
    _context?: FeatureFlagContext
  ): Promise<Record<FeatureFlagName, FeatureFlagValue>> {
    return { ...this.config } as Record<FeatureFlagName, FeatureFlagValue>;
  }

  /**
   * Update a flag value (for testing/development)
   */
  setFlag(key: FeatureFlagName, value: FeatureFlagValue): void {
    this.config[key] = value;
  }
}

/**
 * Feature Flag Client
 * Main client for feature flag evaluation
 */
export class FeatureFlagClient {
  private provider: FeatureFlagProvider;
  private config: FeatureFlagClientConfig;
  private cache: Map<string, { value: FeatureFlagValue; expiresAt: number }> = new Map();
  private overrides: Map<FeatureFlagName, FeatureFlagOverride> = new Map();
  private listeners: Set<FeatureFlagChangeListener> = new Set();
  private initialized = false;

  constructor(config: FeatureFlagClientConfig) {
    this.config = config;

    // Initialize provider based on configuration
    switch (config.provider) {
      case 'json':
        this.provider = new JsonFeatureFlagProvider(
          config.jsonConfigPath,
          config.defaultEnvironment,
          config.logger
        );
        break;
      case 'launchdarkly':
        // LaunchDarkly provider would be implemented here
        // For now, fall back to JSON provider
        this.config.logger?.('warn', 'LaunchDarkly provider not implemented, using JSON provider');
        this.provider = new JsonFeatureFlagProvider(
          config.jsonConfigPath,
          config.defaultEnvironment,
          config.logger
        );
        break;
      case 'configcat':
        // ConfigCat provider would be implemented here
        this.config.logger?.('warn', 'ConfigCat provider not implemented, using JSON provider');
        this.provider = new JsonFeatureFlagProvider(
          config.jsonConfigPath,
          config.defaultEnvironment,
          config.logger
        );
        break;
      case 'custom':
        if (!config.customProvider) {
          throw new Error('Custom provider specified but no provider instance provided');
        }
        this.provider = config.customProvider;
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Initialize the feature flag client
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.provider.initialize();
    this.initialized = true;
    this.config.logger?.('info', 'Feature flag client initialized', {
      provider: this.provider.name,
    });
  }

  /**
   * Close the feature flag client
   */
  async close(): Promise<void> {
    await this.provider.close();
    this.cache.clear();
    this.overrides.clear();
    this.listeners.clear();
    this.initialized = false;
  }

  /**
   * Check if the client is ready
   */
  isReady(): boolean {
    return this.initialized && this.provider.isReady();
  }

  /**
   * Check if a boolean flag is enabled
   */
  async isEnabled(key: FeatureFlagName, context?: FeatureFlagContext): Promise<boolean> {
    return this.getBooleanFlag(key, false, context);
  }

  /**
   * Get a boolean flag value
   */
  async getBooleanFlag(
    key: FeatureFlagName,
    defaultValue: boolean,
    context?: FeatureFlagContext
  ): Promise<boolean> {
    // Check for override
    const override = this.getOverride(key);
    if (override !== undefined && typeof override === 'boolean') {
      return override;
    }

    // Check cache
    const cached = this.getCached(key, context);
    if (cached !== undefined && typeof cached === 'boolean') {
      return cached;
    }

    // Get from provider
    const value = await this.provider.getBooleanFlag(key, defaultValue, context);

    // Cache the value
    this.setCached(key, value, context);

    return value;
  }

  /**
   * Get a string flag value
   */
  async getStringFlag(
    key: FeatureFlagName,
    defaultValue: string,
    context?: FeatureFlagContext
  ): Promise<string> {
    const override = this.getOverride(key);
    if (override !== undefined && typeof override === 'string') {
      return override;
    }

    const cached = this.getCached(key, context);
    if (cached !== undefined && typeof cached === 'string') {
      return cached;
    }

    const value = await this.provider.getStringFlag(key, defaultValue, context);
    this.setCached(key, value, context);

    return value;
  }

  /**
   * Get a number flag value
   */
  async getNumberFlag(
    key: FeatureFlagName,
    defaultValue: number,
    context?: FeatureFlagContext
  ): Promise<number> {
    const override = this.getOverride(key);
    if (override !== undefined && typeof override === 'number') {
      return override;
    }

    const cached = this.getCached(key, context);
    if (cached !== undefined && typeof cached === 'number') {
      return cached;
    }

    const value = await this.provider.getNumberFlag(key, defaultValue, context);
    this.setCached(key, value, context);

    return value;
  }

  /**
   * Get a JSON flag value
   */
  async getJsonFlag<T extends object>(
    key: FeatureFlagName,
    defaultValue: T,
    context?: FeatureFlagContext
  ): Promise<T> {
    const override = this.getOverride(key);
    if (override !== undefined && typeof override === 'object') {
      return override as T;
    }

    const cached = this.getCached(key, context);
    if (cached !== undefined && typeof cached === 'object') {
      return cached as T;
    }

    const value = await this.provider.getJsonFlag(key, defaultValue, context);
    this.setCached(key, value, context);

    return value;
  }

  /**
   * Get detailed evaluation result
   */
  async evaluate<T extends FeatureFlagValue>(
    key: FeatureFlagName,
    defaultValue: T,
    context?: FeatureFlagContext
  ): Promise<FeatureFlagEvaluation<T>> {
    return this.provider.evaluate(key, defaultValue, context);
  }

  /**
   * Get all flags for a context
   */
  async getAllFlags(context?: FeatureFlagContext): Promise<Record<FeatureFlagName, FeatureFlagValue>> {
    const flags = await this.provider.getAllFlags(context);

    // Apply overrides
    for (const [key, override] of this.overrides) {
      if (!override.expiresAt || override.expiresAt > new Date()) {
        flags[key] = override.value;
      }
    }

    return flags;
  }

  /**
   * Set a local override for a flag
   */
  setOverride(key: FeatureFlagName, value: FeatureFlagValue, expiresAt?: Date): void {
    const previousValue = this.overrides.get(key)?.value;
    this.overrides.set(key, { key, value, expiresAt });

    // Notify listeners
    if (previousValue !== value) {
      this.notifyListeners({
        key,
        previousValue: previousValue ?? FEATURE_FLAGS[key]?.defaultValue,
        newValue: value,
        timestamp: new Date(),
      });
    }

    this.config.logger?.('info', `Feature flag override set: ${key}`, { value, expiresAt });
  }

  /**
   * Remove a local override
   */
  removeOverride(key: FeatureFlagName): void {
    const override = this.overrides.get(key);
    if (override) {
      this.overrides.delete(key);
      this.config.logger?.('info', `Feature flag override removed: ${key}`);
    }
  }

  /**
   * Clear all local overrides
   */
  clearOverrides(): void {
    this.overrides.clear();
    this.config.logger?.('info', 'All feature flag overrides cleared');
  }

  /**
   * Add a change listener
   */
  addChangeListener(listener: FeatureFlagChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: FeatureFlagChangeListener): void {
    this.listeners.delete(listener);
  }

  private getOverride(key: FeatureFlagName): FeatureFlagValue | undefined {
    const override = this.overrides.get(key);
    if (override) {
      if (override.expiresAt && override.expiresAt <= new Date()) {
        this.overrides.delete(key);
        return undefined;
      }
      return override.value;
    }
    return undefined;
  }

  private getCacheKey(key: FeatureFlagName, context?: FeatureFlagContext): string {
    const userId = context?.user?.userId ?? 'anonymous';
    const env = context?.environment?.environment ?? this.config.defaultEnvironment.environment;
    return `${key}:${userId}:${env}`;
  }

  private getCached(key: FeatureFlagName, context?: FeatureFlagContext): FeatureFlagValue | undefined {
    if (!this.config.enableCache) {
      return undefined;
    }

    const cacheKey = this.getCacheKey(key, context);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (cached) {
      this.cache.delete(cacheKey);
    }

    return undefined;
  }

  private setCached(
    key: FeatureFlagName,
    value: FeatureFlagValue,
    context?: FeatureFlagContext
  ): void {
    if (!this.config.enableCache) {
      return;
    }

    const cacheKey = this.getCacheKey(key, context);
    const ttl = this.config.cacheTtlMs ?? 60000; // Default 1 minute

    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  private notifyListeners(event: FeatureFlagChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.config.logger?.('error', 'Error in feature flag change listener', { error });
      }
    }
  }
}

// Singleton instance
let defaultClient: FeatureFlagClient | null = null;

/**
 * Get the default feature flag client
 */
export function getFeatureFlagClient(): FeatureFlagClient {
  if (!defaultClient) {
    throw new Error('Feature flag client not initialized. Call initializeFeatureFlags first.');
  }
  return defaultClient;
}

/**
 * Initialize the default feature flag client
 */
export async function initializeFeatureFlags(
  config: FeatureFlagClientConfig
): Promise<FeatureFlagClient> {
  if (defaultClient) {
    await defaultClient.close();
  }

  defaultClient = new FeatureFlagClient(config);
  await defaultClient.initialize();

  return defaultClient;
}

/**
 * Create a new feature flag client instance
 */
export function createFeatureFlagClient(config: FeatureFlagClientConfig): FeatureFlagClient {
  return new FeatureFlagClient(config);
}

/**
 * Quick check if a feature is enabled (uses default client)
 */
export async function isFeatureEnabled(
  key: FeatureFlagName,
  context?: FeatureFlagContext
): Promise<boolean> {
  return getFeatureFlagClient().isEnabled(key, context);
}

/**
 * Get all feature flags (uses default client)
 */
export async function getAllFeatureFlags(
  context?: FeatureFlagContext
): Promise<Record<FeatureFlagName, FeatureFlagValue>> {
  return getFeatureFlagClient().getAllFlags(context);
}
