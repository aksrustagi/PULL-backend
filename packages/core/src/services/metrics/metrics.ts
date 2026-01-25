/**
 * Common Metrics
 *
 * Pre-defined metrics for HTTP requests, system resources, and application events.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { getRegistry } from "./prometheus";
import type {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  HttpMetricsConfig,
} from "./types";
import {
  DEFAULT_HTTP_DURATION_BUCKETS,
  DEFAULT_SIZE_BUCKETS,
  DEFAULT_PATH_NORMALIZERS,
} from "./types";

/**
 * HTTP metrics collection
 */
export interface HttpMetrics {
  /** Total HTTP requests */
  requestsTotal: Counter;
  /** HTTP request duration */
  requestDuration: Histogram;
  /** HTTP request size */
  requestSize: Histogram;
  /** HTTP response size */
  responseSize: Histogram;
  /** Active requests */
  activeRequests: Gauge;
  /** HTTP errors */
  errorsTotal: Counter;
}

/**
 * Application metrics collection
 */
export interface AppMetrics {
  /** Application info gauge */
  appInfo: Gauge;
  /** Process start time */
  processStartTime: Gauge;
  /** Process uptime */
  uptime: Gauge;
}

/**
 * Business metrics collection
 */
export interface BusinessMetrics {
  /** User registrations */
  userRegistrations: Counter;
  /** User logins */
  userLogins: Counter;
  /** Trades executed */
  tradesExecuted: Counter;
  /** Trade volume */
  tradeVolume: Counter;
  /** KYC verifications */
  kycVerifications: Counter;
  /** API calls by endpoint */
  apiCalls: Counter;
}

/**
 * Create HTTP metrics
 */
export function createHttpMetrics(
  registry: MetricsRegistry = getRegistry(),
  config: HttpMetricsConfig = {}
): HttpMetrics {
  const durationBuckets = config.durationBuckets || DEFAULT_HTTP_DURATION_BUCKETS;
  const requestSizeBuckets = config.requestSizeBuckets || DEFAULT_SIZE_BUCKETS;
  const responseSizeBuckets = config.responseSizeBuckets || DEFAULT_SIZE_BUCKETS;

  return {
    requestsTotal: registry.createCounter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "path", "status"],
    }),

    requestDuration: registry.createHistogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "path", "status"],
      buckets: durationBuckets,
    }),

    requestSize: registry.createHistogram({
      name: "http_request_size_bytes",
      help: "HTTP request size in bytes",
      labelNames: ["method", "path"],
      buckets: requestSizeBuckets,
    }),

    responseSize: registry.createHistogram({
      name: "http_response_size_bytes",
      help: "HTTP response size in bytes",
      labelNames: ["method", "path", "status"],
      buckets: responseSizeBuckets,
    }),

    activeRequests: registry.createGauge({
      name: "http_requests_active",
      help: "Number of active HTTP requests",
      labelNames: ["method"],
    }),

    errorsTotal: registry.createCounter({
      name: "http_errors_total",
      help: "Total number of HTTP errors",
      labelNames: ["method", "path", "status", "error_type"],
    }),
  };
}

/**
 * Create application metrics
 */
export function createAppMetrics(
  registry: MetricsRegistry = getRegistry()
): AppMetrics {
  const metrics: AppMetrics = {
    appInfo: registry.createGauge({
      name: "app_info",
      help: "Application information",
      labelNames: ["version", "environment", "node_version"],
    }),

    processStartTime: registry.createGauge({
      name: "process_start_time_seconds",
      help: "Start time of the process in seconds since epoch",
    }),

    uptime: registry.createGauge({
      name: "process_uptime_seconds",
      help: "Process uptime in seconds",
    }),
  };

  // Set initial values
  const startTime = Date.now() / 1000;
  metrics.processStartTime.set(startTime);
  metrics.appInfo.set(1, {
    version: process.env.APP_VERSION || "0.0.0",
    environment: process.env.NODE_ENV || "development",
    node_version: process.version,
  });

  return metrics;
}

/**
 * Create business metrics
 */
export function createBusinessMetrics(
  registry: MetricsRegistry = getRegistry()
): BusinessMetrics {
  return {
    userRegistrations: registry.createCounter({
      name: "user_registrations_total",
      help: "Total number of user registrations",
      labelNames: ["source", "referral"],
    }),

    userLogins: registry.createCounter({
      name: "user_logins_total",
      help: "Total number of user logins",
      labelNames: ["method"],
    }),

    tradesExecuted: registry.createCounter({
      name: "trades_executed_total",
      help: "Total number of trades executed",
      labelNames: ["market_type", "side", "status"],
    }),

    tradeVolume: registry.createCounter({
      name: "trade_volume_total",
      help: "Total trade volume in USD",
      labelNames: ["market_type"],
    }),

    kycVerifications: registry.createCounter({
      name: "kyc_verifications_total",
      help: "Total number of KYC verifications",
      labelNames: ["status", "tier"],
    }),

    apiCalls: registry.createCounter({
      name: "api_calls_total",
      help: "Total API calls by endpoint",
      labelNames: ["endpoint", "method"],
    }),
  };
}

/**
 * Normalize path for metrics (reduce cardinality)
 */
function normalizePath(
  path: string,
  normalizers: HttpMetricsConfig["pathNormalizers"] = DEFAULT_PATH_NORMALIZERS
): string {
  let normalized = path;
  for (const { pattern, replacement } of normalizers || []) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

/**
 * Create HTTP metrics middleware for Hono
 */
export function createMetricsMiddleware(
  config: HttpMetricsConfig = {}
): MiddlewareHandler {
  const registry = getRegistry();
  const httpMetrics = createHttpMetrics(registry, config);
  const pathNormalizers = config.pathNormalizers || DEFAULT_PATH_NORMALIZERS;
  const excludePaths = config.excludePaths || ["/metrics", "/health"];
  const includePathLabel = config.includePathLabel ?? true;

  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;

    // Skip excluded paths
    if (excludePaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const method = c.req.method;
    const normalizedPath = includePathLabel ? normalizePath(path, pathNormalizers) : "";

    // Increment active requests
    httpMetrics.activeRequests.inc({ method });

    // Track request size
    const contentLength = parseInt(c.req.header("content-length") || "0", 10);
    if (contentLength > 0) {
      httpMetrics.requestSize.observe(contentLength, {
        method,
        ...(includePathLabel && { path: normalizedPath }),
      });
    }

    const stopTimer = httpMetrics.requestDuration.startTimer({
      method,
      ...(includePathLabel && { path: normalizedPath }),
    });

    try {
      await next();

      const status = String(c.res.status);

      // Stop timer and record duration
      stopTimer();

      // Increment requests counter
      httpMetrics.requestsTotal.inc({
        method,
        status,
        ...(includePathLabel && { path: normalizedPath }),
      });

      // Track response size
      const responseLength = parseInt(
        c.res.headers.get("content-length") || "0",
        10
      );
      if (responseLength > 0) {
        httpMetrics.responseSize.observe(responseLength, {
          method,
          status,
          ...(includePathLabel && { path: normalizedPath }),
        });
      }

      // Track errors
      if (c.res.status >= 400) {
        httpMetrics.errorsTotal.inc({
          method,
          status,
          error_type: c.res.status >= 500 ? "server" : "client",
          ...(includePathLabel && { path: normalizedPath }),
        });
      }
    } catch (error) {
      stopTimer();

      httpMetrics.requestsTotal.inc({
        method,
        status: "500",
        ...(includePathLabel && { path: normalizedPath }),
      });

      httpMetrics.errorsTotal.inc({
        method,
        status: "500",
        error_type: "exception",
        ...(includePathLabel && { path: normalizedPath }),
      });

      throw error;
    } finally {
      httpMetrics.activeRequests.dec({ method });
    }
  };
}

/**
 * Create metrics endpoint handler for Hono
 */
export function createMetricsHandler(
  registry: MetricsRegistry = getRegistry()
): MiddlewareHandler {
  return async (c: Context) => {
    const metrics = await registry.metrics();
    return new Response(metrics, {
      headers: {
        "Content-Type": registry.contentType,
      },
    });
  };
}

/**
 * Default metrics instances (lazy initialized)
 */
let defaultHttpMetrics: HttpMetrics | null = null;
let defaultAppMetrics: AppMetrics | null = null;
let defaultBusinessMetrics: BusinessMetrics | null = null;

/**
 * Get default HTTP metrics
 */
export function getHttpMetrics(): HttpMetrics {
  if (!defaultHttpMetrics) {
    defaultHttpMetrics = createHttpMetrics();
  }
  return defaultHttpMetrics;
}

/**
 * Get default app metrics
 */
export function getAppMetrics(): AppMetrics {
  if (!defaultAppMetrics) {
    defaultAppMetrics = createAppMetrics();
  }
  return defaultAppMetrics;
}

/**
 * Get default business metrics
 */
export function getBusinessMetrics(): BusinessMetrics {
  if (!defaultBusinessMetrics) {
    defaultBusinessMetrics = createBusinessMetrics();
  }
  return defaultBusinessMetrics;
}

/**
 * Update uptime metric (call periodically)
 */
export function updateUptimeMetric(appMetrics: AppMetrics = getAppMetrics()): void {
  const uptime = process.uptime();
  appMetrics.uptime.set(uptime);
}

/**
 * Start periodic uptime updates
 */
export function startUptimeUpdates(
  intervalMs: number = 15000,
  appMetrics: AppMetrics = getAppMetrics()
): () => void {
  const interval = setInterval(() => {
    updateUptimeMetric(appMetrics);
  }, intervalMs);

  return () => clearInterval(interval);
}

/**
 * Record a user registration
 */
export function recordUserRegistration(
  source: string = "direct",
  hasReferral: boolean = false,
  metrics: BusinessMetrics = getBusinessMetrics()
): void {
  metrics.userRegistrations.inc({
    source,
    referral: hasReferral ? "yes" : "no",
  });
}

/**
 * Record a user login
 */
export function recordUserLogin(
  method: string = "email",
  metrics: BusinessMetrics = getBusinessMetrics()
): void {
  metrics.userLogins.inc({ method });
}

/**
 * Record a trade execution
 */
export function recordTradeExecution(
  marketType: string,
  side: "buy" | "sell",
  status: "success" | "failed",
  volume: number,
  metrics: BusinessMetrics = getBusinessMetrics()
): void {
  metrics.tradesExecuted.inc({
    market_type: marketType,
    side,
    status,
  });

  if (status === "success") {
    metrics.tradeVolume.inc(volume, { market_type: marketType });
  }
}

/**
 * Record a KYC verification
 */
export function recordKycVerification(
  status: "approved" | "rejected" | "pending",
  tier: string,
  metrics: BusinessMetrics = getBusinessMetrics()
): void {
  metrics.kycVerifications.inc({ status, tier });
}

/**
 * Record an API call
 */
export function recordApiCall(
  endpoint: string,
  method: string,
  metrics: BusinessMetrics = getBusinessMetrics()
): void {
  metrics.apiCalls.inc({ endpoint, method });
}
