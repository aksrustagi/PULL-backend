/**
 * Inngest Client Setup
 * Event-driven function orchestration for PULL
 */

import { Inngest, InngestMiddleware } from "inngest";
import type { PullEvent } from "./events";

// ============================================================================
// Middleware Configuration
// ============================================================================

/**
 * Logging middleware for debugging and monitoring
 */
const loggingMiddleware = new InngestMiddleware({
  name: "Logging Middleware",
  init() {
    return {
      onFunctionRun({ fn, ctx }) {
        const startTime = Date.now();
        console.log(`[Inngest] Starting function: ${fn.name}`, {
          eventName: ctx.event.name,
          runId: ctx.runId,
        });

        return {
          afterExecution() {
            const duration = Date.now() - startTime;
            console.log(`[Inngest] Completed function: ${fn.name}`, {
              duration: `${duration}ms`,
              runId: ctx.runId,
            });
          },
          onError({ error }) {
            const duration = Date.now() - startTime;
            console.error(`[Inngest] Function failed: ${fn.name}`, {
              error: error.message,
              duration: `${duration}ms`,
              runId: ctx.runId,
            });
          },
        };
      },
    };
  },
});

/**
 * Error tracking middleware
 */
const errorTrackingMiddleware = new InngestMiddleware({
  name: "Error Tracking Middleware",
  init() {
    return {
      onFunctionRun({ fn, ctx }) {
        return {
          onError({ error }) {
            // In production, send to error tracking service (Sentry, etc.)
            console.error(`[Inngest Error] ${fn.name}:`, {
              error: error.message,
              stack: error.stack,
              event: ctx.event.name,
              runId: ctx.runId,
            });

            // Could add Sentry.captureException(error) here
          },
        };
      },
    };
  },
});

/**
 * Metrics middleware for observability
 */
const metricsMiddleware = new InngestMiddleware({
  name: "Metrics Middleware",
  init() {
    return {
      onFunctionRun({ fn, ctx }) {
        const startTime = Date.now();

        return {
          afterExecution() {
            const duration = Date.now() - startTime;

            // In production, send to metrics service (DataDog, etc.)
            // metrics.histogram('inngest.function.duration', duration, {
            //   function: fn.name,
            //   event: ctx.event.name,
            // });
          },
          onError() {
            // metrics.increment('inngest.function.error', {
            //   function: fn.name,
            //   event: ctx.event.name,
            // });
          },
        };
      },
    };
  },
});

// ============================================================================
// Inngest Client
// ============================================================================

/**
 * Main Inngest client for PULL
 * Type-safe event handling with custom middleware
 */
export const inngest = new Inngest({
  id: "pull-app",
  schemas: new Map() as any, // Events are typed via generics
  middleware: [loggingMiddleware, errorTrackingMiddleware, metricsMiddleware],
});

// ============================================================================
// Typed Event Sender
// ============================================================================

/**
 * Type-safe event sender
 */
export async function sendEvent<T extends PullEvent>(event: T): Promise<void> {
  await inngest.send(event);
}

/**
 * Send multiple events atomically
 */
export async function sendEvents(events: PullEvent[]): Promise<void> {
  await inngest.send(events);
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Default retry configuration for functions
 */
export const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: "1s",
    maxDelay: "1m",
  },
};

/**
 * Aggressive retry for critical operations
 */
export const CRITICAL_RETRY_CONFIG = {
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: "5s",
    maxDelay: "5m",
  },
};

/**
 * Light retry for non-critical operations
 */
export const LIGHT_RETRY_CONFIG = {
  attempts: 2,
  backoff: {
    type: "exponential" as const,
    delay: "500ms",
    maxDelay: "30s",
  },
};

// ============================================================================
// Dead Letter Queue Handler
// ============================================================================

/**
 * Handle failed events that exhausted retries
 */
export async function handleDeadLetter(event: {
  eventName: string;
  eventData: unknown;
  error: string;
  attempts: number;
  functionName: string;
}): Promise<void> {
  console.error("[Dead Letter]", event);

  // In production:
  // 1. Store in dead letter table for manual review
  // 2. Send alert to ops team
  // 3. Log to error tracking service

  // await db.insert("dead_letters", {
  //   eventName: event.eventName,
  //   eventData: JSON.stringify(event.eventData),
  //   error: event.error,
  //   attempts: event.attempts,
  //   functionName: event.functionName,
  //   createdAt: Date.now(),
  // });
}

// ============================================================================
// Cron Schedule Helpers
// ============================================================================

export const CRON_SCHEDULES = {
  // Every N minutes
  EVERY_5_MINUTES: "*/5 * * * *",
  EVERY_15_MINUTES: "*/15 * * * *",
  EVERY_30_MINUTES: "*/30 * * * *",

  // Hourly
  HOURLY: "0 * * * *",
  EVERY_6_HOURS: "0 */6 * * *",
  EVERY_12_HOURS: "0 */12 * * *",

  // Daily
  DAILY_MIDNIGHT: "0 0 * * *",
  DAILY_8AM: "0 8 * * *",
  DAILY_NOON: "0 12 * * *",
  DAILY_6PM: "0 18 * * *",

  // Weekly
  WEEKLY_SUNDAY_MIDNIGHT: "0 0 * * 0",
  WEEKLY_MONDAY_9AM: "0 9 * * 1",

  // Monthly
  MONTHLY_FIRST: "0 0 1 * *",
} as const;

// ============================================================================
// Function ID Generators
// ============================================================================

/**
 * Generate consistent function IDs
 */
export function getFunctionId(category: string, action: string): string {
  return `pull/${category}/${action}`;
}

// ============================================================================
// Concurrency Configuration
// ============================================================================

export const CONCURRENCY_LIMITS = {
  // Email operations
  EMAIL_SYNC: { limit: 5, key: "user_id" },
  EMAIL_TRIAGE: { limit: 10 },

  // Market data
  MARKET_SYNC: { limit: 1 }, // Single instance
  PRICE_SYNC: { limit: 2 },

  // Notifications
  NOTIFICATION_SEND: { limit: 20 },

  // Compliance
  KYC_CHECK: { limit: 3 },
} as const;

// ============================================================================
// Rate Limiting
// ============================================================================

export const RATE_LIMITS = {
  // Per user limits
  USER_EMAIL_SYNC: { limit: 4, period: "1h" },
  USER_NOTIFICATIONS: { limit: 100, period: "1d" },

  // Global limits
  GLOBAL_KALSHI_API: { limit: 100, period: "1m" },
  GLOBAL_NYLAS_API: { limit: 60, period: "1m" },
} as const;

// ============================================================================
// Exports
// ============================================================================

export type { PullEvent };
export * from "./events";
