/**
 * Inngest Client Configuration
 *
 * Sets up the Inngest client with event types, middleware, and error handling.
 */

import { Inngest, InngestMiddleware } from "inngest";
import type { InngestEvents } from "./events";

// =============================================================================
// Environment Configuration
// =============================================================================

export interface InngestConfig {
  id?: string;
  eventKey?: string;
  signingKey?: string;
  baseUrl?: string;
  isDev?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

function getConfig(): InngestConfig {
  return {
    id: process.env.INNGEST_APP_ID ?? "pull-app",
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
    baseUrl: process.env.INNGEST_BASE_URL,
    isDev: process.env.NODE_ENV !== "production",
    logLevel: (process.env.INNGEST_LOG_LEVEL as InngestConfig["logLevel"]) ?? "info",
  };
}

// =============================================================================
// Logger Interface
// =============================================================================

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const createDefaultLogger = (): Logger => ({
  debug: (message, meta) => {
    if (getConfig().logLevel === "debug") {
      console.debug(`[INNGEST:DEBUG] ${message}`, meta ?? "");
    }
  },
  info: (message, meta) => {
    const level = getConfig().logLevel;
    if (level === "debug" || level === "info") {
      console.info(`[INNGEST:INFO] ${message}`, meta ?? "");
    }
  },
  warn: (message, meta) => {
    const level = getConfig().logLevel;
    if (level !== "error") {
      console.warn(`[INNGEST:WARN] ${message}`, meta ?? "");
    }
  },
  error: (message, meta) => {
    console.error(`[INNGEST:ERROR] ${message}`, meta ?? "");
  },
});

// =============================================================================
// Custom Error Classes
// =============================================================================

export class InngestFunctionError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      isRetryable?: boolean;
      metadata?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "InngestFunctionError";
    this.code = options.code;
    this.isRetryable = options.isRetryable ?? true;
    this.metadata = options.metadata ?? {};
  }
}

export class NonRetryableError extends InngestFunctionError {
  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message, { code, isRetryable: false, metadata });
    this.name = "NonRetryableError";
  }
}

// =============================================================================
// Middleware: Logging
// =============================================================================

const loggingMiddleware = new InngestMiddleware({
  name: "Logging Middleware",
  init() {
    const logger = createDefaultLogger();

    return {
      onFunctionRun({ fn }) {
        const startTime = Date.now();
        logger.info(`Function started: ${fn.name}`);

        return {
          transformInput({ ctx }) {
            logger.debug(`Function input`, {
              event: ctx.event.name,
              runId: ctx.runId,
            });
            return {};
          },
          transformOutput({ result, step }) {
            const duration = Date.now() - startTime;

            if (step) {
              logger.debug(`Step completed: ${step.displayName}`, {
                duration,
              });
            }

            if (result.error) {
              logger.error(`Function failed: ${fn.name}`, {
                error: result.error.message,
                duration,
              });
            } else {
              logger.info(`Function completed: ${fn.name}`, {
                duration,
              });
            }
          },
        };
      },
    };
  },
});

// =============================================================================
// Middleware: Error Handling
// =============================================================================

const errorHandlingMiddleware = new InngestMiddleware({
  name: "Error Handling Middleware",
  init() {
    return {
      onFunctionRun() {
        return {
          transformOutput({ result }) {
            if (result.error) {
              const error = result.error;

              // Check if it's a non-retryable error
              if (error instanceof NonRetryableError) {
                // Log to dead letter queue or external service
                console.error("[DEAD_LETTER]", {
                  error: error.message,
                  code: error.code,
                  metadata: error.metadata,
                });
              }

              // Add error tracking (e.g., Sentry)
              if (process.env.SENTRY_DSN) {
                // Sentry.captureException(error);
              }
            }
          },
        };
      },
    };
  },
});

// =============================================================================
// Middleware: Request ID Tracking
// =============================================================================

const requestIdMiddleware = new InngestMiddleware({
  name: "Request ID Middleware",
  init() {
    return {
      onFunctionRun({ ctx }) {
        return {
          transformInput() {
            return {
              ctx: {
                requestId: ctx.runId,
                correlationId:
                  (ctx.event.data as Record<string, unknown>)?.correlationId ??
                  ctx.runId,
              },
            };
          },
        };
      },
    };
  },
});

// =============================================================================
// Middleware: Metrics
// =============================================================================

const metricsMiddleware = new InngestMiddleware({
  name: "Metrics Middleware",
  init() {
    return {
      onFunctionRun({ fn }) {
        const startTime = Date.now();

        return {
          transformOutput({ result }) {
            const duration = Date.now() - startTime;
            const status = result.error ? "error" : "success";

            // Record metrics (integrate with your metrics service)
            // Example: StatsD, Prometheus, DataDog
            const metrics = {
              function: fn.name,
              duration,
              status,
              timestamp: new Date().toISOString(),
            };

            if (process.env.METRICS_ENDPOINT) {
              // Send to metrics service
              // metricsClient.record(metrics);
            }

            // Log locally in development
            if (getConfig().isDev) {
              console.debug("[METRICS]", metrics);
            }
          },
        };
      },
    };
  },
});

// =============================================================================
// Inngest Client
// =============================================================================

const config = getConfig();

/**
 * Main Inngest client for PULL application.
 * Configured with event types, middleware, and error handling.
 */
export const inngest = new Inngest<{ events: InngestEvents }>({
  id: config.id ?? "pull-app",
  middleware: [
    loggingMiddleware,
    errorHandlingMiddleware,
    requestIdMiddleware,
    metricsMiddleware,
  ],
});

// =============================================================================
// Helper: Send Event
// =============================================================================

/**
 * Type-safe event sender with validation
 */
export async function sendEvent<T extends keyof InngestEvents>(
  name: T,
  data: InngestEvents[T]["data"],
  options?: {
    id?: string;
    ts?: number;
  }
): Promise<{ ids: string[] }> {
  return inngest.send({
    name,
    data,
    id: options?.id,
    ts: options?.ts,
  });
}

/**
 * Send multiple events in a batch
 */
export async function sendEvents<T extends keyof InngestEvents>(
  events: Array<{
    name: T;
    data: InngestEvents[T]["data"];
    id?: string;
    ts?: number;
  }>
): Promise<{ ids: string[] }> {
  return inngest.send(events);
}

// =============================================================================
// Retry Configuration Presets
// =============================================================================

export const RETRY_CONFIGS = {
  /** For critical operations that should retry aggressively */
  critical: {
    attempts: 10,
    backoff: {
      type: "exponential" as const,
      minDelay: 1000,
      maxDelay: 300000, // 5 minutes
    },
  },

  /** For standard operations */
  standard: {
    attempts: 5,
    backoff: {
      type: "exponential" as const,
      minDelay: 1000,
      maxDelay: 60000, // 1 minute
    },
  },

  /** For operations that should fail fast */
  fast: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      minDelay: 500,
      maxDelay: 5000,
    },
  },

  /** For operations that should not retry */
  none: {
    attempts: 1,
  },
} as const;

// =============================================================================
// Concurrency Configuration Presets
// =============================================================================

export const CONCURRENCY_CONFIGS = {
  /** For CPU-intensive operations */
  low: {
    limit: 5,
  },

  /** For standard API operations */
  medium: {
    limit: 25,
  },

  /** For lightweight operations */
  high: {
    limit: 100,
  },

  /** Per-user rate limiting */
  perUser: (key: string) => ({
    limit: 10,
    key,
    scope: "fn" as const,
  }),
} as const;

// =============================================================================
// Dead Letter Queue Handler
// =============================================================================

export interface DeadLetterEvent {
  originalEvent: {
    name: string;
    data: unknown;
  };
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  functionName: string;
  runId: string;
  timestamp: string;
  attemptCount: number;
}

/**
 * Log failed events to dead letter queue for manual review
 */
export async function logToDeadLetter(event: DeadLetterEvent): Promise<void> {
  const logger = createDefaultLogger();

  // Log to console
  logger.error("Event moved to dead letter queue", {
    event: event.originalEvent.name,
    function: event.functionName,
    error: event.error.message,
  });

  // In production, send to a dead letter storage
  // This could be:
  // - A Convex table for dead letters
  // - An S3 bucket
  // - A dedicated queue service
  if (process.env.DEAD_LETTER_WEBHOOK_URL) {
    try {
      await fetch(process.env.DEAD_LETTER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (err) {
      logger.error("Failed to send to dead letter webhook", {
        error: (err as Error).message,
      });
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export type { InngestEvents } from "./events";
export { EVENT_NAMES, createEvent, validateEventPayload } from "./events";
