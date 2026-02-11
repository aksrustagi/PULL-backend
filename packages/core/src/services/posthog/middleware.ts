/**
 * PostHog Analytics Middleware
 *
 * Hono middleware that automatically tracks API calls, response times,
 * error rates, and user sessions. Injects a PostHog capture helper into
 * the request context so downstream handlers can emit custom events.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createPostHogMiddleware, getPostHogContext } from '@pull/core/services/posthog';
 *
 * const app = new Hono();
 *
 * // Attach middleware
 * app.use('*', createPostHogMiddleware({
 *   getUserId: (c) => c.get('user')?.id,
 *   excludePaths: ['/health', '/ready', '/metrics'],
 * }));
 *
 * // Use the injected helper in a route handler
 * app.post('/api/v1/trades', async (c) => {
 *   const ph = getPostHogContext(c);
 *   ph.capture('trade_custom_action', { detail: 'example' });
 *   return c.json({ ok: true });
 * });
 * ```
 */

import { createMiddleware } from 'hono/factory';
import type { Context, MiddlewareHandler } from 'hono';
import { getPostHogClient } from './client';
import type { PostHogMiddlewareOptions, PostHogMiddlewareContext, PostHogContextVariables } from './types';
import { POSTHOG_EVENTS } from './types';

// ---------------------------------------------------------------------------
// Default path normalizers (matches metrics service patterns)
// ---------------------------------------------------------------------------

const DEFAULT_PATH_NORMALIZERS = [
  { pattern: /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '/:id' },
  { pattern: /\/\d+/g, replacement: '/:id' },
];

const DEFAULT_EXCLUDE_PATHS = ['/health', '/ready', '/metrics'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(
  path: string,
  normalizers: PostHogMiddlewareOptions['pathNormalizers'] = DEFAULT_PATH_NORMALIZERS,
): string {
  let normalized = path;
  for (const { pattern, replacement } of normalizers ?? []) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

function defaultGetUserId(c: Context): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined;
  if (!user) return undefined;
  const id = user.id ?? user.userId ?? user.sub;
  return id ? String(id) : undefined;
}

function defaultGetSessionId(c: Context): string | undefined {
  // Check common header / cookie patterns
  return (
    c.req.header('x-session-id') ??
    c.req.header('x-request-id') ??
    undefined
  );
}

/**
 * Derive a status code bucket for reduced cardinality
 */
function statusBucket(status: number): string {
  if (status < 200) return '1xx';
  if (status < 300) return '2xx';
  if (status < 400) return '3xx';
  if (status < 500) return '4xx';
  return '5xx';
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Create PostHog analytics middleware for Hono.
 *
 * Automatically captures:
 * - `api_call` events for every request (with normalized path)
 * - Response time measurements
 * - Error events for 4xx/5xx responses
 * - Session association when a session ID is available
 */
export function createPostHogMiddleware(
  options: PostHogMiddlewareOptions = {},
): MiddlewareHandler {
  const {
    excludePaths = DEFAULT_EXCLUDE_PATHS,
    captureApiCalls = true,
    trackResponseTimes = true,
    trackErrors = true,
    trackSessions = true,
    getUserId = defaultGetUserId,
    getSessionId = defaultGetSessionId,
    pathNormalizers = DEFAULT_PATH_NORMALIZERS,
    defaultProperties = {},
  } = options;

  return createMiddleware<{ Variables: PostHogContextVariables }>(async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip excluded paths entirely
    if (excludePaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const client = getPostHogClient();
    const method = c.req.method;
    const normalizedPath = normalizePath(path, pathNormalizers);
    const startTime = performance.now();

    // Resolve user / session IDs (may not be available until after auth middleware)
    let userId: string | undefined;
    let sessionId: string | undefined;

    // Inject PostHog context for downstream handlers
    const posthogCtx: PostHogMiddlewareContext = {
      capture: (event: string, properties?: Record<string, unknown>) => {
        const uid = userId ?? getUserId(c);
        if (uid) {
          client.capture(uid, event, {
            ...defaultProperties,
            ...properties,
          });
        }
      },
      get userId() {
        return userId;
      },
      get sessionId() {
        return sessionId;
      },
    };

    c.set('posthog', posthogCtx);

    let error: Error | undefined;

    try {
      await next();
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      const endTime = performance.now();
      const durationMs = Math.round((endTime - startTime) * 100) / 100;
      const status = c.res?.status ?? 500;

      // Resolve IDs now (after auth middleware has run)
      userId = getUserId(c);
      sessionId = getSessionId(c);

      // Only track if we have a user to attribute to
      if (userId && client.isEnabled) {
        const commonProps: Record<string, unknown> = {
          ...defaultProperties,
          $current_url: c.req.url,
          path: normalizedPath,
          raw_path: path,
          method,
          status_code: status,
          status_bucket: statusBucket(status),
          ...(trackSessions && sessionId ? { $session_id: sessionId } : {}),
          // User agent for device/browser analysis
          $browser: c.req.header('user-agent'),
          $ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip'),
        };

        // --- API Call Event ---
        if (captureApiCalls) {
          client.capture(userId, POSTHOG_EVENTS.API_CALL, {
            ...commonProps,
            ...(trackResponseTimes ? { response_time_ms: durationMs } : {}),
            content_length: parseInt(c.req.header('content-length') || '0', 10),
            response_length: parseInt(c.res?.headers.get('content-length') || '0', 10),
          });
        }

        // --- Error Events ---
        if (trackErrors && status >= 400) {
          client.capture(userId, POSTHOG_EVENTS.ERROR_OCCURRED, {
            ...commonProps,
            response_time_ms: durationMs,
            error_type: status >= 500 ? 'server_error' : 'client_error',
            error_message: error?.message,
            error_name: error?.name,
          });
        }

        // --- Rate Limit Events ---
        if (status === 429) {
          client.capture(userId, POSTHOG_EVENTS.RATE_LIMIT_HIT, {
            ...commonProps,
            retry_after: c.res?.headers.get('retry-after'),
          });
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Context Helpers
// ---------------------------------------------------------------------------

/**
 * Get the PostHog context from a Hono request context.
 *
 * Returns the injected `PostHogMiddlewareContext` that allows
 * downstream handlers to capture custom events.
 *
 * @throws If the PostHog middleware is not applied.
 */
export function getPostHogContext(c: Context): PostHogMiddlewareContext {
  const ctx = c.get('posthog') as PostHogMiddlewareContext | undefined;
  if (!ctx) {
    throw new Error(
      'PostHog context not available. Ensure createPostHogMiddleware is applied.',
    );
  }
  return ctx;
}

/**
 * Safely get the PostHog context, returning null if middleware is not applied.
 */
export function getPostHogContextSafe(c: Context): PostHogMiddlewareContext | null {
  return (c.get('posthog') as PostHogMiddlewareContext | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Hono module augmentation
// ---------------------------------------------------------------------------

declare module 'hono' {
  interface ContextVariableMap {
    posthog: PostHogMiddlewareContext;
  }
}
