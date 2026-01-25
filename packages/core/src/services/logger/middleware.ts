/**
 * HTTP Request Logging Middleware
 *
 * Provides middleware for logging HTTP requests and responses
 * with correlation ID tracking, timing, and request tracing.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import {
  getLogger,
  generateCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
} from "./logger";
import type {
  Logger,
  HttpRequestContext,
  HttpResponseContext,
  LogContext,
} from "./types";

/**
 * Options for the logging middleware
 */
export interface LoggingMiddlewareOptions {
  /** Custom logger instance */
  logger?: Logger;
  /** Whether to log request bodies */
  logRequestBody?: boolean;
  /** Whether to log response bodies */
  logResponseBody?: boolean;
  /** Maximum body size to log (bytes) */
  maxBodySize?: number;
  /** Paths to exclude from logging */
  excludePaths?: string[];
  /** Whether to skip logging for successful health checks */
  skipHealthChecks?: boolean;
  /** Custom function to extract user ID from context */
  getUserId?: (c: Context) => string | undefined;
  /** Custom function to extract correlation ID from context */
  getCorrelationId?: (c: Context) => string | undefined;
  /** Custom function to get request ID from context */
  getRequestId?: (c: Context) => string | undefined;
}

const defaultOptions: LoggingMiddlewareOptions = {
  logRequestBody: false,
  logResponseBody: false,
  maxBodySize: 10000,
  excludePaths: [],
  skipHealthChecks: true,
};

/**
 * Extract request context from Hono context
 */
function extractRequestContext(c: Context): HttpRequestContext {
  const url = new URL(c.req.url);

  // Extract query params
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Extract relevant headers (excluding sensitive ones)
  const headers: Record<string, string> = {};
  const allowedHeaders = [
    "content-type",
    "content-length",
    "accept",
    "accept-encoding",
    "accept-language",
    "user-agent",
    "x-request-id",
    "x-correlation-id",
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-real-ip",
  ];

  for (const header of allowedHeaders) {
    const value = c.req.header(header);
    if (value) {
      headers[header] = value;
    }
  }

  // Extract client IP
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  return {
    method: c.req.method,
    path: url.pathname,
    url: url.href,
    query: Object.keys(query).length > 0 ? query : undefined,
    headers,
    ip,
    userAgent: c.req.header("user-agent"),
  };
}

/**
 * Create HTTP request logging middleware for Hono
 */
export function createLoggingMiddleware(
  options: LoggingMiddlewareOptions = {}
): MiddlewareHandler {
  const opts = { ...defaultOptions, ...options };
  const logger = opts.logger || getLogger();

  return async (c: Context, next: Next) => {
    // Check if path should be excluded
    const path = new URL(c.req.url).pathname;
    if (opts.excludePaths?.some((p) => path.startsWith(p))) {
      return next();
    }

    // Skip health check logging if configured
    if (opts.skipHealthChecks && path === "/health") {
      return next();
    }

    // Generate or extract correlation ID
    const correlationId =
      opts.getCorrelationId?.(c) ||
      c.req.header("x-correlation-id") ||
      generateCorrelationId();

    // Set correlation ID in response headers
    c.header("X-Correlation-ID", correlationId);

    // Run the rest of the request within correlation context
    return withCorrelationIdAsync(correlationId, async () => {
      const startTime = performance.now();
      const requestContext = extractRequestContext(c);

      // Get user ID if available
      const userId = opts.getUserId?.(c);
      const requestId = opts.getRequestId?.(c) || c.req.header("x-request-id");

      const logContext: LogContext = {
        correlationId,
        requestId,
        userId,
      };

      // Log request
      logger.httpRequest(requestContext, logContext);

      // Track if we need to log an error
      let responseError: Error | undefined;

      try {
        await next();
      } catch (error) {
        responseError = error instanceof Error ? error : new Error(String(error));
        throw error;
      } finally {
        const endTime = performance.now();
        const responseTime = Math.round((endTime - startTime) * 100) / 100;

        const responseContext: HttpResponseContext = {
          statusCode: c.res.status,
          responseTime,
          contentLength: parseInt(
            c.res.headers.get("content-length") || "0",
            10
          ),
        };

        // Log response
        logger.httpResponse(requestContext, responseContext, {
          ...logContext,
          ...(responseError && { error: responseError }),
        });
      }
    });
  };
}

/**
 * Create a child logger for a specific request
 */
export function createRequestLogger(c: Context, baseLogger?: Logger): Logger {
  const logger = baseLogger || getLogger();
  const correlationId = getCorrelationId() || c.req.header("x-correlation-id");
  const requestId =
    (c as any).get?.("requestId") || c.req.header("x-request-id");
  const userId = (c as any).get?.("userId");

  return logger.child({
    correlationId,
    requestId,
    userId,
  });
}

/**
 * Middleware to attach logger to request context
 */
export function createLoggerContextMiddleware(
  logger?: Logger
): MiddlewareHandler {
  const log = logger || getLogger();

  return async (c: Context, next: Next) => {
    const requestLogger = createRequestLogger(c, log);
    (c as any).set("logger", requestLogger);
    await next();
  };
}

/**
 * Type augmentation for Hono context with logger
 */
declare module "hono" {
  interface ContextVariableMap {
    logger: Logger;
  }
}

/**
 * Helper to get logger from Hono context
 */
export function getRequestLogger(c: Context): Logger {
  return (c as any).get?.("logger") || getLogger();
}

/**
 * Create error logging middleware
 */
export function createErrorLoggingMiddleware(
  options: { logger?: Logger } = {}
): MiddlewareHandler {
  const logger = options.logger || getLogger();

  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      const correlationId = getCorrelationId() || c.req.header("x-correlation-id");
      const requestId =
        (c as any).get?.("requestId") || c.req.header("x-request-id");
      const userId = (c as any).get?.("userId");

      logger.error("Unhandled error in request", {
        correlationId,
        requestId,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
        path: new URL(c.req.url).pathname,
        method: c.req.method,
      });

      throw error;
    }
  };
}

/**
 * Performance tracking wrapper
 */
export async function withTiming<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = performance.now();
  let success = true;

  try {
    return await fn();
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const endTime = performance.now();
    const duration = Math.round((endTime - startTime) * 100) / 100;

    logger.timing({
      operation,
      duration,
      startTime,
      endTime,
      success,
      ...context,
    });
  }
}

/**
 * Database operation tracking wrapper
 */
export async function withDatabaseTiming<T>(
  logger: Logger,
  queryType: string,
  table: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = performance.now();

  try {
    const result = await fn();
    const duration = Math.round((performance.now() - startTime) * 100) / 100;

    logger.database({
      queryType,
      table,
      duration,
      ...context,
    });

    return result;
  } catch (error) {
    const duration = Math.round((performance.now() - startTime) * 100) / 100;

    logger.database({
      queryType,
      table,
      duration,
      ...context,
    });

    throw error;
  }
}

/**
 * External service call tracking wrapper
 */
export async function withExternalServiceTiming<T>(
  logger: Logger,
  service: string,
  endpoint: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = performance.now();
  let success = true;
  let statusCode: number | undefined;

  try {
    const result = await fn();

    // Try to extract status code if result has one
    if (result && typeof result === "object" && "status" in result) {
      statusCode = (result as any).status;
    }

    return result;
  } catch (error) {
    success = false;

    // Try to extract status code from error
    if (error && typeof error === "object" && "status" in error) {
      statusCode = (error as any).status;
    }

    throw error;
  } finally {
    const duration = Math.round((performance.now() - startTime) * 100) / 100;

    logger.externalService({
      service,
      endpoint,
      duration,
      statusCode,
      success,
      ...context,
    });
  }
}
