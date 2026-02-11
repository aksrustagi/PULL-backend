/**
 * PostHog Product Analytics
 *
 * Server-side product analytics integration for the PULL trading platform.
 * Provides user identification, event tracking, funnel analysis,
 * revenue attribution, feature flags, and group analytics.
 *
 * @example
 * ```typescript
 * import {
 *   initPostHog,
 *   getPostHogClient,
 *   createPostHogMiddleware,
 *   getPostHogContext,
 *   POSTHOG_EVENTS,
 *   ONBOARDING_STEPS,
 * } from '@pull/core/services/posthog';
 *
 * // 1. Initialize at startup
 * initPostHog();
 *
 * // 2. Attach middleware to Hono app
 * app.use('*', createPostHogMiddleware({
 *   getUserId: (c) => c.get('user')?.id,
 * }));
 *
 * // 3. Track events in handlers
 * app.post('/api/v1/trades', async (c) => {
 *   const client = getPostHogClient();
 *   client.captureTradeEvent(userId, tradeData);
 *   return c.json({ ok: true });
 * });
 *
 * // 4. Shutdown gracefully
 * process.on('SIGTERM', async () => {
 *   const client = getPostHogClient();
 *   await client.shutdown();
 * });
 * ```
 */

// Types
export type {
  PostHogConfig,
  PostHogUserProperties,
  PostHogBaseEventProperties,
  PostHogTradeEvent,
  PostHogPredictionEvent,
  PostHogOnboardingStep,
  PostHogRevenueEvent,
  PostHogGroupType,
  PostHogGroupProperties,
  PostHogFeatureFlagResult,
  PostHogEventName,
  OnboardingStepName,
  PostHogMiddlewareOptions,
  PostHogMiddlewareContext,
  PostHogContextVariables,
} from './types';

// Constants
export {
  POSTHOG_EVENTS,
  ONBOARDING_STEPS,
} from './types';

// Client
export {
  PostHogClient,
  initPostHog,
  createPostHogClient,
  getPostHogClient,
} from './client';

// Middleware
export {
  createPostHogMiddleware,
  getPostHogContext,
  getPostHogContextSafe,
} from './middleware';
