/**
 * PostHog Analytics Client
 *
 * Server-side product analytics client for the PULL trading platform.
 * Provides user identification, event tracking, feature flag evaluation,
 * and group analytics via the PostHog Node.js SDK.
 *
 * @example
 * ```typescript
 * import {
 *   initPostHog,
 *   getPostHogClient,
 *   captureTradeEvent,
 *   captureRevenueEvent,
 * } from '@pull/core/services/posthog';
 *
 * // Initialize once at startup
 * const client = initPostHog();
 *
 * // Identify a user
 * await client.identify('user_123', {
 *   email: 'trader@example.com',
 *   kycTier: 'standard',
 *   accountAge: 45,
 *   referralSource: 'twitter',
 * });
 *
 * // Track a trade
 * await client.captureTradeEvent('user_123', {
 *   tradeId: 'trade_abc',
 *   marketType: 'predictions',
 *   marketId: 'mkt_xyz',
 *   side: 'buy',
 *   orderType: 'market',
 *   quantity: 10,
 *   price: 0.65,
 *   totalValue: 6.50,
 *   status: 'filled',
 * });
 *
 * // Graceful shutdown
 * await client.shutdown();
 * ```
 */

import type {
  PostHogConfig,
  PostHogUserProperties,
  PostHogTradeEvent,
  PostHogPredictionEvent,
  PostHogOnboardingStep,
  PostHogRevenueEvent,
  PostHogGroupType,
  PostHogGroupProperties,
  PostHogFeatureFlagResult,
  PostHogEventName,
} from './types';

import { POSTHOG_EVENTS } from './types';

// ---------------------------------------------------------------------------
// Internal HTTP transport
// ---------------------------------------------------------------------------

/**
 * Lightweight HTTP transport for PostHog ingestion API.
 * We avoid pulling in the full posthog-node SDK so the package stays
 * dependency-free and compatible with edge runtimes.  The PostHog
 * ingestion API is a simple JSON-over-HTTP endpoint.
 */
interface QueuedMessage {
  type: 'capture' | 'identify' | 'group_identify' | 'alias';
  payload: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// PostHog Client
// ---------------------------------------------------------------------------

export class PostHogClient {
  private readonly config: Required<
    Pick<PostHogConfig, 'apiKey' | 'host' | 'flushInterval' | 'flushAt' | 'requestTimeout' | 'enabled' | 'featureFlagPollInterval' | 'sendFeatureFlagEvents'>
  >;
  private queue: QueuedMessage[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownCalled = false;

  constructor(config: PostHogConfig) {
    this.config = {
      apiKey: config.apiKey,
      host: config.host.replace(/\/+$/, ''),
      flushInterval: config.flushInterval ?? 10_000,
      flushAt: config.flushAt ?? 20,
      requestTimeout: config.requestTimeout ?? 10_000,
      enabled: config.enabled ?? true,
      featureFlagPollInterval: config.featureFlagPollInterval ?? 30_000,
      sendFeatureFlagEvents: config.sendFeatureFlagEvents ?? true,
    };

    if (this.config.enabled) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.config.flushInterval);

      // Unref so the timer does not prevent process exit
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Core API
  // -------------------------------------------------------------------------

  /**
   * Identify a user with traits.
   *
   * Merges the supplied properties with any previously set properties on
   * the PostHog person profile so callers do not need to re-send the
   * complete set every time.
   */
  identify(userId: string, properties: PostHogUserProperties = {}): void {
    if (!this.config.enabled || !userId) return;

    // Separate $set and $set_once properties
    const { createdAt, referralSource, referralCode, ...setProps } = properties;

    const setOnceProps: Record<string, unknown> = {};
    if (createdAt) setOnceProps.createdAt = createdAt;
    if (referralSource) setOnceProps.referralSource = referralSource;
    if (referralCode) setOnceProps.referralCode = referralCode;

    this.enqueue({
      type: 'identify',
      payload: {
        distinct_id: userId,
        $set: setProps,
        ...(Object.keys(setOnceProps).length > 0 && { $set_once: setOnceProps }),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Capture a generic analytics event.
   */
  capture(
    userId: string,
    event: PostHogEventName,
    properties: Record<string, unknown> = {},
  ): void {
    if (!this.config.enabled || !userId) return;

    this.enqueue({
      type: 'capture',
      payload: {
        distinct_id: userId,
        event,
        properties: {
          ...properties,
          $lib: 'pull-posthog-server',
          $lib_version: '1.0.0',
        },
      },
      timestamp: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // Specialized Event Helpers
  // -------------------------------------------------------------------------

  /**
   * Track a trade execution event with full context.
   */
  captureTradeEvent(userId: string, trade: PostHogTradeEvent): void {
    const eventName =
      trade.status === 'filled' || trade.status === 'partially_filled'
        ? POSTHOG_EVENTS.TRADE_FILLED
        : trade.status === 'cancelled'
          ? POSTHOG_EVENTS.TRADE_CANCELLED
          : trade.status === 'rejected'
            ? POSTHOG_EVENTS.TRADE_REJECTED
            : POSTHOG_EVENTS.TRADE_PLACED;

    this.capture(userId, eventName, {
      trade_id: trade.tradeId,
      market_type: trade.marketType,
      market_id: trade.marketId,
      market_name: trade.marketName,
      side: trade.side,
      order_type: trade.orderType,
      quantity: trade.quantity,
      price: trade.price,
      total_value: trade.totalValue,
      status: trade.status,
      fee_amount: trade.feeAmount,
      execution_latency_ms: trade.executionLatencyMs,
      is_copy_trade: trade.isCopyTrade ?? false,
      is_parlay: trade.isParlay ?? false,
      source: trade.source ?? 'app',
      // Revenue attribution — allows PostHog revenue analysis
      $revenue: trade.feeAmount,
    });
  }

  /**
   * Track a prediction market event.
   */
  capturePredictionEvent(userId: string, prediction: PostHogPredictionEvent): void {
    this.capture(userId, POSTHOG_EVENTS.PREDICTION_PLACED, {
      prediction_id: prediction.predictionId,
      market_id: prediction.marketId,
      market_title: prediction.marketTitle,
      category: prediction.category,
      outcome_selected: prediction.outcomeSelected,
      probability_at_prediction: prediction.probabilityAtPrediction,
      stake_amount: prediction.stakeAmount,
      potential_payout: prediction.potentialPayout,
      hours_to_resolution: prediction.hoursToResolution,
      ai_copilot_used: prediction.aiCopilotUsed ?? false,
      ai_confidence_score: prediction.aiConfidenceScore,
      source: prediction.source ?? 'internal',
      $revenue: prediction.stakeAmount,
    });
  }

  /**
   * Track an onboarding funnel step.
   *
   * PostHog funnels are automatically derived from sequenced events
   * sharing a common event name with a distinguishing property
   * (`step` / `step_number`).
   */
  captureOnboardingStep(userId: string, step: PostHogOnboardingStep): void {
    const eventName = step.success
      ? POSTHOG_EVENTS.ONBOARDING_STEP_COMPLETED
      : POSTHOG_EVENTS.ONBOARDING_STEP_FAILED;

    this.capture(userId, eventName, {
      step: step.step,
      step_number: step.stepNumber,
      total_steps: step.totalSteps,
      success: step.success,
      time_spent_seconds: step.timeSpentSeconds,
      error_message: step.errorMessage,
      error_code: step.errorCode,
      variant: step.variant,
    });

    // If the last step completed successfully, fire a completion event
    if (step.success && step.stepNumber === step.totalSteps) {
      this.capture(userId, POSTHOG_EVENTS.ONBOARDING_COMPLETED, {
        variant: step.variant,
        total_steps: step.totalSteps,
      });
    }
  }

  /**
   * Track a revenue event for LTV and revenue attribution analysis.
   */
  captureRevenueEvent(userId: string, amount: number, type: PostHogRevenueEvent['type'], extra?: Omit<PostHogRevenueEvent, 'amount' | 'type'>): void {
    this.capture(userId, POSTHOG_EVENTS.REVENUE_EARNED, {
      amount,
      type,
      currency: extra?.currency ?? 'USD',
      transaction_id: extra?.transactionId,
      market_type: extra?.marketType,
      is_recurring: extra?.isRecurring ?? false,
      billing_period: extra?.billingPeriod,
      // PostHog revenue tracking
      $revenue: amount,
      $currency: extra?.currency ?? 'USD',
    });
  }

  // -------------------------------------------------------------------------
  // Feature Flags
  // -------------------------------------------------------------------------

  /**
   * Evaluate a feature flag for a user.
   *
   * Uses the PostHog /decide endpoint to evaluate flags server-side.
   * This complements the existing in-house feature flag system and
   * is useful for flags that require PostHog's targeting capabilities
   * (e.g., cohort-based rollouts, multivariate experiments).
   */
  async getFeatureFlag(
    userId: string,
    flag: string,
    groups?: Record<string, string>,
    personProperties?: Record<string, unknown>,
  ): Promise<PostHogFeatureFlagResult | null> {
    if (!this.config.enabled || !userId) return null;

    try {
      const body: Record<string, unknown> = {
        api_key: this.config.apiKey,
        distinct_id: userId,
      };
      if (groups) body.groups = groups;
      if (personProperties) body.person_properties = personProperties;

      const response = await fetch(`${this.config.host}/decide/?v=3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeout),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        featureFlags?: Record<string, boolean | string>;
        featureFlagPayloads?: Record<string, string>;
      };

      const flagValue = data.featureFlags?.[flag];
      if (flagValue === undefined) return null;

      let payload: Record<string, unknown> | undefined;
      const rawPayload = data.featureFlagPayloads?.[flag];
      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload) as Record<string, unknown>;
        } catch {
          // Payload is not valid JSON — skip
        }
      }

      const result: PostHogFeatureFlagResult = {
        key: flag,
        value: flagValue,
        payload,
      };

      // Optionally capture the evaluation event
      if (this.config.sendFeatureFlagEvents) {
        this.capture(userId, '$feature_flag_called', {
          $feature_flag: flag,
          $feature_flag_response: flagValue,
        });
      }

      return result;
    } catch {
      // Network / timeout errors should not break the application
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Group Analytics
  // -------------------------------------------------------------------------

  /**
   * Identify a group (squad, league, organization) with properties.
   *
   * This creates or updates the group profile in PostHog and allows
   * subsequent events to be attributed to groups in addition to users.
   */
  groupIdentify(
    groupType: PostHogGroupType,
    groupKey: string,
    properties: PostHogGroupProperties = {},
  ): void {
    if (!this.config.enabled) return;

    this.enqueue({
      type: 'group_identify',
      payload: {
        event: '$groupidentify',
        distinct_id: `$${groupType}_${groupKey}`,
        properties: {
          $group_type: groupType,
          $group_key: groupKey,
          $group_set: {
            ...properties,
            name: properties.name ?? groupKey,
          },
        },
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Capture an event associated with a group.
   */
  captureGroupEvent(
    userId: string,
    event: PostHogEventName,
    groupType: PostHogGroupType,
    groupKey: string,
    properties: Record<string, unknown> = {},
  ): void {
    this.capture(userId, event, {
      ...properties,
      $groups: { [groupType]: groupKey },
    });
  }

  // -------------------------------------------------------------------------
  // Alias
  // -------------------------------------------------------------------------

  /**
   * Create an alias between two distinct IDs.
   *
   * Useful when merging anonymous pre-signup activity with an
   * authenticated user profile.
   */
  alias(userId: string, alias: string): void {
    if (!this.config.enabled || !userId || !alias) return;

    this.enqueue({
      type: 'alias',
      payload: {
        distinct_id: userId,
        alias,
        event: '$create_alias',
        properties: {
          distinct_id: userId,
          alias,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // Queue Management
  // -------------------------------------------------------------------------

  /**
   * Flush all queued events to PostHog.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);

    const payload = {
      api_key: this.config.apiKey,
      batch: batch.map((msg) => ({
        ...msg.payload,
        timestamp: msg.timestamp,
        type: msg.type,
      })),
    };

    try {
      const response = await fetch(`${this.config.host}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.requestTimeout),
      });

      if (!response.ok) {
        // Re-queue on server error for retry
        if (response.status >= 500) {
          this.queue.unshift(...batch);
        }
        // 4xx errors (bad request, unauthorized) are dropped to avoid infinite loops
      }
    } catch {
      // Network failure — re-queue for next flush cycle
      this.queue.unshift(...batch);
    }
  }

  /**
   * Flush all pending events and shut down the client.
   *
   * Should be called during graceful shutdown (e.g., SIGTERM handler).
   */
  async shutdown(): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  /**
   * Returns the number of events currently in the queue.
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Returns whether the client is enabled.
   */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private enqueue(message: QueuedMessage): void {
    this.queue.push(message);

    if (this.queue.length >= this.config.flushAt) {
      void this.flush();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

let defaultClient: PostHogClient | null = null;

/**
 * Initialize the global PostHog client.
 *
 * Reads configuration from environment variables by default:
 * - `POSTHOG_API_KEY` (required)
 * - `POSTHOG_HOST` (optional, default: https://app.posthog.com)
 *
 * Returns the singleton client instance.
 */
export function initPostHog(config?: Partial<PostHogConfig>): PostHogClient {
  const apiKey = config?.apiKey ?? process.env.POSTHOG_API_KEY ?? '';
  const host = config?.host ?? process.env.POSTHOG_HOST ?? 'https://app.posthog.com';

  if (!apiKey) {
    // Return a disabled client when no API key is provided.
    // This prevents crashes in development / test environments.
    defaultClient = new PostHogClient({
      apiKey: '',
      host,
      enabled: false,
      ...config,
    });
    return defaultClient;
  }

  defaultClient = new PostHogClient({
    apiKey,
    host,
    ...config,
  });

  return defaultClient;
}

/**
 * Create a standalone PostHog client (not stored as singleton).
 */
export function createPostHogClient(config: PostHogConfig): PostHogClient {
  return new PostHogClient(config);
}

/**
 * Get the global PostHog client.
 *
 * Auto-initializes with environment variables if not yet created.
 */
export function getPostHogClient(): PostHogClient {
  if (!defaultClient) {
    return initPostHog();
  }
  return defaultClient;
}
