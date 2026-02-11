/**
 * Enhanced Sentry Client for the PULL Trading Platform
 *
 * Production-grade error tracking and performance monitoring with:
 * - Performance monitoring with custom transactions for trades, KYC, payments
 * - Financial context (userId, kycTier, balance range) in scope
 * - Custom breadcrumbs for the full order flow lifecycle
 * - Release health tracking and session management
 * - Session replay hints for frontend integration
 * - Environment-specific sampling (100% errors, 10% transactions in prod)
 * - Circuit breaker state change tracking
 * - Aggressive PII stripping (emails, passwords, SSNs, wallet keys)
 * - Custom tags: assetClass, orderType, paymentMethod, kycTier
 * - Profiling integration for performance bottleneck detection
 * - Cron monitoring for scheduled jobs (reconciliation, cleanup)
 */

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { getLogger } from "../logger";
import type { Logger } from "../logger/types";

import {
  DEFAULT_SAMPLING,
  PII_FIELDS,
  PII_VALUE_PATTERNS,
  type CaptureExceptionOptions,
  type CaptureMessageOptions,
  type CircuitBreakerEvent,
  type CronCheckInOptions,
  type CronCheckInStatus,
  type CronMonitorConfig,
  type FinancialContext,
  type ISentryClient,
  type OrderFlowBreadcrumb,
  type PullSentryTags,
  type SentryConfig,
  type SentryEnvironment,
  type SentryLevel,
  type SessionReplayHint,
  type SessionReplayReason,
  type TransactionHandle,
  type TransactionOp,
} from "./types";

// ============================================================================
// PII Scrubbing Utilities
// ============================================================================

const PII_REPLACEMENT = "[Filtered]";

/**
 * Recursively strips PII from an object. Returns a new object --
 * the original is never mutated.
 */
function stripPii(obj: unknown, depth = 0): unknown {
  // Guard against infinite recursion on deeply nested / circular structures
  if (depth > 10) return PII_REPLACEMENT;

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return stripPiiFromString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => stripPii(item, depth + 1));
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (PII_FIELDS.has(key)) {
        cleaned[key] = PII_REPLACEMENT;
      } else {
        cleaned[key] = stripPii(value, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}

/**
 * Scans a string value for PII patterns (emails, SSNs, card numbers, phones)
 * and replaces them.
 */
function stripPiiFromString(value: string): string {
  let result = value;
  for (const { pattern } of PII_VALUE_PATTERNS) {
    result = result.replace(new RegExp(pattern, "g"), PII_REPLACEMENT);
  }
  return result;
}

/**
 * Strips PII from Sentry event request headers.
 */
function stripRequestHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sensitiveHeaders = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "proxy-authorization",
  ]);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.has(key.toLowerCase())) {
      cleaned[key] = PII_REPLACEMENT;
    } else {
      cleaned[key] = stripPiiFromString(value);
    }
  }
  return cleaned;
}

// ============================================================================
// Sentry Level Mapping
// ============================================================================

function toSentrySeverity(level: SentryLevel): Sentry.SeverityLevel {
  return level as Sentry.SeverityLevel;
}

// ============================================================================
// Enhanced Sentry Client
// ============================================================================

export class PullSentryClient implements ISentryClient {
  private _initialized = false;
  private _config: SentryConfig | null = null;
  private _logger: Logger;

  constructor(logger?: Logger) {
    this._logger = logger ?? getLogger();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  init(config: SentryConfig): void {
    if (this._initialized) {
      this._logger.warn("Sentry already initialized, skipping re-init");
      return;
    }

    this._config = config;
    const env = config.environment;
    const defaults = DEFAULT_SAMPLING[env] ?? DEFAULT_SAMPLING.development;
    const sampling = config.sampling ?? {};

    const tracesSampleRate =
      sampling.tracesSampleRate ?? defaults.tracesSampleRate;
    const profilesSampleRate =
      sampling.profilesSampleRate ?? defaults.profilesSampleRate;
    const transactionOverrides = sampling.transactionOverrides ?? {};

    // Build integrations list
    const integrations: Sentry.Integration[] = [];

    if (config.profilingEnabled !== false) {
      integrations.push(nodeProfilingIntegration());
    }

    Sentry.init({
      dsn: config.dsn,
      environment: env,
      release: config.release,
      serverName: config.serverName,
      debug: config.debug ?? false,

      // ------------------------------------------------------------------
      // Sampling
      // ------------------------------------------------------------------
      tracesSampler: (samplingContext) => {
        const txName = samplingContext.name ?? "";

        // Per-transaction-name overrides
        for (const [pattern, rate] of Object.entries(transactionOverrides)) {
          if (txName.includes(pattern)) {
            return rate;
          }
        }

        // Health check endpoints: never sample
        if (txName.includes("/health") || txName.includes("/readiness")) {
          return 0;
        }

        // High-value operations: always sample in production
        if (
          txName.startsWith("trade.") ||
          txName.startsWith("payment.") ||
          txName.startsWith("kyc.")
        ) {
          return env === "production" ? 0.5 : 1.0;
        }

        return tracesSampleRate;
      },

      profilesSampleRate,

      // ------------------------------------------------------------------
      // Integrations
      // ------------------------------------------------------------------
      integrations,

      // ------------------------------------------------------------------
      // beforeSend: PII stripping + error enrichment
      // ------------------------------------------------------------------
      beforeSend(event, hint) {
        // Strip PII from request
        if (event.request) {
          if (event.request.headers) {
            event.request.headers = stripRequestHeaders(
              event.request.headers as Record<string, string>,
            );
          }
          if (event.request.data) {
            event.request.data = stripPii(event.request.data) as string;
          }
          if (event.request.query_string) {
            event.request.query_string = stripPiiFromString(
              typeof event.request.query_string === "string"
                ? event.request.query_string
                : "",
            );
          }
          // Strip cookies entirely
          delete event.request.cookies;
        }

        // Strip PII from user context -- keep id, remove everything else
        if (event.user) {
          const safeUser: Sentry.User = { id: event.user.id };
          if (event.user.segment) {
            safeUser.segment = event.user.segment;
          }
          event.user = safeUser;
        }

        // Strip PII from extras
        if (event.extra) {
          event.extra = stripPii(event.extra) as Record<string, unknown>;
        }

        // Strip PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
            ...crumb,
            data: crumb.data
              ? (stripPii(crumb.data) as Record<string, unknown>)
              : undefined,
            message: crumb.message
              ? stripPiiFromString(crumb.message)
              : undefined,
          }));
        }

        // Strip PII from exception values
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map((ex) => ({
            ...ex,
            value: ex.value ? stripPiiFromString(ex.value) : ex.value,
          }));
        }

        // Strip PII from contexts
        if (event.contexts) {
          event.contexts = stripPii(event.contexts) as Record<
            string,
            Record<string, unknown>
          >;
        }

        return event;
      },

      // ------------------------------------------------------------------
      // beforeSendTransaction: strip PII from transaction events
      // ------------------------------------------------------------------
      beforeSendTransaction(event) {
        if (event.request?.headers) {
          event.request.headers = stripRequestHeaders(
            event.request.headers as Record<string, string>,
          );
        }
        // Remove cookies from transactions
        if (event.request) {
          delete event.request.cookies;
        }
        return event;
      },

      // ------------------------------------------------------------------
      // beforeBreadcrumb: inline PII scrub on breadcrumbs as they're added
      // ------------------------------------------------------------------
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.data) {
          breadcrumb.data = stripPii(breadcrumb.data) as Record<
            string,
            unknown
          >;
        }
        if (breadcrumb.message) {
          breadcrumb.message = stripPiiFromString(breadcrumb.message);
        }
        return breadcrumb;
      },

      // ------------------------------------------------------------------
      // Additional options
      // ------------------------------------------------------------------
      maxBreadcrumbs: 100,
      attachStacktrace: true,
      autoSessionTracking: config.sessionTrackingEnabled !== false,

      // Pass through any extra options
      ...(config.extraOptions ?? {}),
    });

    this._initialized = true;
    this._logger.info("Sentry initialized", {
      environment: env,
      release: config.release ?? "unknown",
      tracesSampleRate,
      profilesSampleRate,
      profilingEnabled: config.profilingEnabled !== false,
      sessionTracking: config.sessionTrackingEnabled !== false,
    });
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  // --------------------------------------------------------------------------
  // Error Capture
  // --------------------------------------------------------------------------

  captureException(
    error: Error,
    options?: CaptureExceptionOptions,
  ): string | undefined {
    if (!this._initialized) {
      this._logger.error("Sentry not initialized, logging error locally", {
        error: { name: error.name, message: error.message },
        ...(options?.extra ?? {}),
      });
      return undefined;
    }

    return Sentry.withScope((scope) => {
      // Financial context
      if (options?.financialContext) {
        this._applyFinancialContextToScope(scope, options.financialContext);
      }

      // User
      if (options?.userId) {
        scope.setUser({ id: options.userId });
      }

      // Tags
      if (options?.tags) {
        this._applyTagsToScope(scope, options.tags);
      }

      // Extras (PII-stripped)
      if (options?.extra) {
        const safeExtra = stripPii(options.extra) as Record<string, unknown>;
        scope.setExtras(safeExtra);
      }

      // Fingerprint
      if (options?.fingerprint) {
        scope.setFingerprint(options.fingerprint);
      }

      // Level
      if (options?.level) {
        scope.setLevel(toSentrySeverity(options.level));
      }

      return Sentry.captureException(error);
    });
  }

  captureMessage(
    message: string,
    level: SentryLevel = "info",
    options?: CaptureMessageOptions,
  ): string | undefined {
    if (!this._initialized) {
      const logLevel = level === "warning" ? "warn" : level === "fatal" ? "error" : level;
      const logFn = (this._logger as Record<string, Function>)[logLevel];
      if (typeof logFn === "function") {
        logFn.call(this._logger, message, { source: "sentry-fallback" });
      }
      return undefined;
    }

    const safeMessage = stripPiiFromString(message);

    return Sentry.withScope((scope) => {
      if (options?.financialContext) {
        this._applyFinancialContextToScope(scope, options.financialContext);
      }
      if (options?.userId) {
        scope.setUser({ id: options.userId });
      }
      if (options?.tags) {
        this._applyTagsToScope(scope, options.tags);
      }
      if (options?.extra) {
        scope.setExtras(stripPii(options.extra) as Record<string, unknown>);
      }
      if (options?.fingerprint) {
        scope.setFingerprint(options.fingerprint);
      }

      return Sentry.captureMessage(safeMessage, toSentrySeverity(level));
    });
  }

  // --------------------------------------------------------------------------
  // Financial Context
  // --------------------------------------------------------------------------

  setFinancialContext(context: FinancialContext): void {
    if (!this._initialized) return;

    Sentry.withScope(() => {
      const scope = Sentry.getCurrentScope();
      this._applyFinancialContextToScope(scope, context);
    });
  }

  clearUser(): void {
    if (!this._initialized) return;
    Sentry.getCurrentScope().setUser(null);
  }

  // --------------------------------------------------------------------------
  // Order Flow Breadcrumbs
  // --------------------------------------------------------------------------

  addOrderBreadcrumb(breadcrumb: OrderFlowBreadcrumb): void {
    if (!this._initialized) {
      this._logger.debug("Order breadcrumb (Sentry disabled)", {
        orderId: breadcrumb.orderId,
        step: breadcrumb.step,
      });
      return;
    }

    Sentry.addBreadcrumb({
      type: "transaction",
      category: "order.flow",
      message: `Order ${breadcrumb.orderId}: ${breadcrumb.step}`,
      level: this._breadcrumbLevel(breadcrumb.step),
      timestamp: breadcrumb.timestamp
        ? new Date(breadcrumb.timestamp).getTime() / 1000
        : Date.now() / 1000,
      data: {
        orderId: breadcrumb.orderId,
        step: breadcrumb.step,
        ...(breadcrumb.data ?? {}),
      },
    });
  }

  // --------------------------------------------------------------------------
  // Performance Transactions
  // --------------------------------------------------------------------------

  startTransaction(
    name: string,
    op: TransactionOp | string,
    data?: Record<string, string | number | boolean>,
  ): TransactionHandle {
    if (!this._initialized) {
      return this._noopTransactionHandle();
    }

    // Use Sentry.startSpan for the new SDK span-based API
    const spanAttributes: Record<string, string | number | boolean> = {
      "sentry.op": op,
      ...(data ?? {}),
    };

    const span = Sentry.startInactiveSpan({
      name,
      op,
      attributes: spanAttributes,
      forceTransaction: true,
    });

    if (!span) {
      this._logger.debug("Failed to start Sentry span/transaction", {
        name,
        op,
      });
      return this._noopTransactionHandle();
    }

    return {
      finish(status: "ok" | "error" | "cancelled" = "ok") {
        const sentryStatus: Record<string, Sentry.SpanStatus> = {
          ok: { code: 1 } as Sentry.SpanStatus,
          error: { code: 2, message: "error" } as Sentry.SpanStatus,
          cancelled: { code: 2, message: "cancelled" } as Sentry.SpanStatus,
        };
        span.setStatus(sentryStatus[status] ?? { code: 1 });
        span.end();
      },
      setData(key: string, value: string | number | boolean) {
        span.setAttribute(key, value);
      },
      setTag(key: string, value: string) {
        span.setAttribute(`tag.${key}`, value);
      },
      setHttpStatus(statusCode: number) {
        span.setAttribute("http.status_code", statusCode);
        if (statusCode >= 400) {
          span.setStatus({ code: 2, message: `HTTP ${statusCode}` });
        }
      },
      traceId(): string | undefined {
        const ctx = span.spanContext?.();
        return ctx?.traceId;
      },
    };
  }

  // --------------------------------------------------------------------------
  // Circuit Breaker Integration
  // --------------------------------------------------------------------------

  recordCircuitBreakerChange(event: CircuitBreakerEvent): void {
    const severity = event.newState === "open" ? "error" : "info";

    // Add breadcrumb
    if (this._initialized) {
      Sentry.addBreadcrumb({
        type: "info",
        category: "circuit_breaker",
        message: `Circuit breaker [${event.serviceName}]: ${event.previousState} -> ${event.newState}`,
        level: event.newState === "open" ? "error" : "info",
        data: {
          serviceName: event.serviceName,
          previousState: event.previousState,
          newState: event.newState,
          failureCount: event.failureCount ?? 0,
          failureThreshold: event.failureThreshold ?? 0,
          resetTimeout: event.resetTimeout ?? 0,
        },
      });
    }

    // If the breaker opened, send a Sentry message so it shows up as an issue
    if (event.newState === "open") {
      this.captureMessage(
        `Circuit breaker OPENED for ${event.serviceName} after ${event.failureCount ?? "unknown"} failures`,
        "error",
        {
          tags: {
            circuitBreaker: event.serviceName,
            service: event.serviceName,
          },
          extra: {
            previousState: event.previousState,
            failureCount: event.failureCount,
            failureThreshold: event.failureThreshold,
            resetTimeout: event.resetTimeout,
            lastError: event.lastError,
          },
          fingerprint: ["circuit-breaker", event.serviceName, "open"],
        },
      );
    }

    // If the breaker recovered (half_open -> closed), log it as info
    if (event.previousState === "half_open" && event.newState === "closed") {
      this.captureMessage(
        `Circuit breaker RECOVERED for ${event.serviceName}`,
        "info",
        {
          tags: {
            circuitBreaker: event.serviceName,
            service: event.serviceName,
          },
          fingerprint: ["circuit-breaker", event.serviceName, "recovered"],
        },
      );
    }

    this._logger[severity === "error" ? "error" : "info"](
      `Circuit breaker state change: ${event.serviceName}`,
      {
        previousState: event.previousState,
        newState: event.newState,
        failureCount: event.failureCount,
      },
    );
  }

  // --------------------------------------------------------------------------
  // Cron Monitoring
  // --------------------------------------------------------------------------

  cronCheckIn(
    monitorSlug: string,
    status: CronCheckInStatus,
    options?: CronCheckInOptions,
  ): string | undefined {
    if (!this._initialized) {
      this._logger.debug("Cron check-in (Sentry disabled)", {
        monitorSlug,
        status,
      });
      return undefined;
    }

    const sentryStatus = this._mapCronStatus(status);

    // Build monitor config for upsert if provided
    let monitorConfig: Sentry.MonitorConfig | undefined;
    if (options?.monitorConfig) {
      monitorConfig = this._buildMonitorConfig(options.monitorConfig);
    }

    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug,
        status: sentryStatus,
        ...(options?.checkInId ? { checkInId: options.checkInId } : {}),
        ...(options?.duration !== undefined
          ? { duration: options.duration }
          : {}),
      },
      monitorConfig,
    );

    this._logger.debug("Cron check-in sent", {
      monitorSlug,
      status,
      checkInId,
    });

    return checkInId;
  }

  // --------------------------------------------------------------------------
  // Session Replay Hints
  // --------------------------------------------------------------------------

  createReplayHint(
    reason: SessionReplayReason,
    severity: SessionReplayHint["severity"],
    tags?: Record<string, string>,
  ): SessionReplayHint {
    const hint: SessionReplayHint = {
      shouldCapture: severity === "high" || severity === "critical",
      reason,
      severity,
      tags,
    };

    // Also record as a breadcrumb so the hint is visible in Sentry events
    if (this._initialized) {
      Sentry.addBreadcrumb({
        type: "info",
        category: "replay_hint",
        message: `Replay hint: ${reason} (${severity})`,
        level: severity === "critical" ? "error" : "info",
        data: {
          reason,
          severity,
          shouldCapture: hint.shouldCapture,
          ...(tags ?? {}),
        },
      });
    }

    return hint;
  }

  // --------------------------------------------------------------------------
  // Flush / Close
  // --------------------------------------------------------------------------

  async flush(timeout = 5000): Promise<boolean> {
    if (!this._initialized) return true;
    return Sentry.flush(timeout);
  }

  async close(timeout = 5000): Promise<boolean> {
    if (!this._initialized) return true;
    const result = await Sentry.close(timeout);
    this._initialized = false;
    return result;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private _applyFinancialContextToScope(
    scope: Sentry.Scope,
    ctx: FinancialContext,
  ): void {
    // Set safe user fields (no PII)
    scope.setUser({ id: ctx.userId, segment: ctx.kycTier });

    // Set financial context
    scope.setContext("financial", {
      kycTier: ctx.kycTier,
      accountBalanceRange: ctx.accountBalanceRange,
      countryCode: ctx.countryCode ?? "unknown",
      accountStatus: ctx.accountStatus ?? "active",
      hasVerifiedPayment: ctx.hasVerifiedPayment ?? false,
    });

    // Promote kycTier to a tag for fast filtering
    scope.setTag("kycTier", ctx.kycTier);
  }

  private _applyTagsToScope(scope: Sentry.Scope, tags: PullSentryTags): void {
    if (tags.assetClass) scope.setTag("assetClass", tags.assetClass);
    if (tags.orderType) scope.setTag("orderType", tags.orderType);
    if (tags.paymentMethod) scope.setTag("paymentMethod", tags.paymentMethod);
    if (tags.kycTier) scope.setTag("kycTier", tags.kycTier);
    if (tags.service) scope.setTag("service", tags.service);
    if (tags.workflow) scope.setTag("workflow", tags.workflow);
    if (tags.circuitBreaker) scope.setTag("circuitBreaker", tags.circuitBreaker);
    if (tags.cronJob) scope.setTag("cronJob", tags.cronJob);
  }

  private _breadcrumbLevel(
    step: string,
  ): "debug" | "info" | "warning" | "error" {
    switch (step) {
      case "order_rejected":
      case "order_cancelled":
        return "warning";
      case "order_expired":
        return "warning";
      case "order_settled":
      case "order_filled":
        return "info";
      default:
        return "info";
    }
  }

  private _noopTransactionHandle(): TransactionHandle {
    return {
      finish() {},
      setData() {},
      setTag() {},
      setHttpStatus() {},
      traceId() {
        return undefined;
      },
    };
  }

  private _mapCronStatus(
    status: CronCheckInStatus,
  ): "ok" | "error" | "in_progress" {
    switch (status) {
      case "ok":
        return "ok";
      case "error":
        return "error";
      case "in_progress":
        return "in_progress";
      default:
        return "ok";
    }
  }

  private _buildMonitorConfig(
    config: CronMonitorConfig,
  ): Sentry.MonitorConfig {
    const monitorConfig: Sentry.MonitorConfig = {
      schedule:
        config.scheduleType === "crontab"
          ? { type: "crontab", value: config.schedule }
          : { type: "interval", value: parseInt(config.schedule, 10), unit: "minute" },
      checkinMargin: config.checkinMargin,
      maxRuntime: config.maxRuntime,
      timezone: config.timezone,
    };

    return monitorConfig;
  }
}

// ============================================================================
// Singleton Instance & Factory
// ============================================================================

let _instance: PullSentryClient | null = null;

/**
 * Returns the singleton PullSentryClient instance.
 * Creates it on first call (lazy initialization).
 */
export function getSentryClient(): PullSentryClient {
  if (!_instance) {
    _instance = new PullSentryClient();
  }
  return _instance;
}

/**
 * Initializes the global Sentry client with the given config.
 * Safe to call multiple times -- subsequent calls are no-ops.
 */
export function initSentry(config: SentryConfig): PullSentryClient {
  const client = getSentryClient();
  client.init(config);
  return client;
}

/**
 * Initializes Sentry from environment variables.
 * Reads: SENTRY_DSN, NODE_ENV, RELEASE_VERSION, HOSTNAME
 * Returns null if SENTRY_DSN is not set.
 */
export function initSentryFromEnv(): PullSentryClient | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    const logger = getLogger();
    logger.warn("SENTRY_DSN not configured, Sentry error tracking disabled");
    return null;
  }

  const environment = (process.env.NODE_ENV ?? "development") as SentryEnvironment;
  const release = process.env.RELEASE_VERSION ?? process.env.npm_package_version;
  const serverName = process.env.HOSTNAME ?? process.env.SERVER_NAME;

  return initSentry({
    dsn,
    environment,
    release: release ? `pull-api@${release}` : undefined,
    serverName,
    profilingEnabled: environment === "production" || environment === "staging",
    sessionTrackingEnabled: true,
    debug: environment === "development",
  });
}

/**
 * Creates a standalone PullSentryClient instance (not the singleton).
 * Useful for testing or specialized configurations.
 */
export function createSentryClient(logger?: Logger): PullSentryClient {
  return new PullSentryClient(logger);
}

// ============================================================================
// Convenience Functions (operate on the singleton)
// ============================================================================

/**
 * Capture an exception with optional PULL-specific context.
 * Delegates to the singleton client.
 */
export function captureException(
  error: Error,
  options?: CaptureExceptionOptions,
): string | undefined {
  return getSentryClient().captureException(error, options);
}

/**
 * Capture a message at a given severity level.
 */
export function captureMessage(
  message: string,
  level?: SentryLevel,
  options?: CaptureMessageOptions,
): string | undefined {
  return getSentryClient().captureMessage(message, level, options);
}

/**
 * Set the current user's financial context on the global Sentry scope.
 */
export function setFinancialContext(context: FinancialContext): void {
  getSentryClient().setFinancialContext(context);
}

/**
 * Clear the current user context from the Sentry scope.
 */
export function clearUser(): void {
  getSentryClient().clearUser();
}

/**
 * Add an order flow breadcrumb for order lifecycle tracking.
 */
export function addOrderBreadcrumb(breadcrumb: OrderFlowBreadcrumb): void {
  getSentryClient().addOrderBreadcrumb(breadcrumb);
}

/**
 * Start a performance transaction/span.
 * Returns a handle to finish the transaction and set status.
 */
export function startTransaction(
  name: string,
  op: TransactionOp | string,
  data?: Record<string, string | number | boolean>,
): TransactionHandle {
  return getSentryClient().startTransaction(name, op, data);
}

/**
 * Record a circuit breaker state change.
 * Automatically creates breadcrumbs and issues for breaker opens.
 */
export function recordCircuitBreakerChange(
  event: CircuitBreakerEvent,
): void {
  getSentryClient().recordCircuitBreakerChange(event);
}

/**
 * Send a cron monitor check-in.
 * Returns the check-in ID (needed to close an in_progress check-in).
 */
export function cronCheckIn(
  monitorSlug: string,
  status: CronCheckInStatus,
  options?: CronCheckInOptions,
): string | undefined {
  return getSentryClient().cronCheckIn(monitorSlug, status, options);
}

/**
 * Create a session replay hint for the frontend.
 */
export function createReplayHint(
  reason: SessionReplayReason,
  severity: SessionReplayHint["severity"],
  tags?: Record<string, string>,
): SessionReplayHint {
  return getSentryClient().createReplayHint(reason, severity, tags);
}

/**
 * Flush pending Sentry events. Call before graceful shutdown.
 */
export async function flushSentry(timeout?: number): Promise<boolean> {
  return getSentryClient().flush(timeout);
}

/**
 * Close the Sentry client. Call on process exit.
 */
export async function closeSentry(timeout?: number): Promise<boolean> {
  return getSentryClient().close(timeout);
}

// ============================================================================
// Higher-Level Helpers: Instrumented Wrappers
// ============================================================================

/**
 * Wraps an async function in a Sentry transaction with automatic error capture.
 * If the function throws, the error is captured and re-thrown.
 *
 * @example
 * ```ts
 * const result = await withSentryTransaction(
 *   "executeTrade",
 *   TransactionOps.TRADE_EXECUTE,
 *   async (tx) => {
 *     tx.setData("orderId", orderId);
 *     return await executeTradeImpl(orderId);
 *   },
 *   { tags: { assetClass: "crypto" } },
 * );
 * ```
 */
export async function withSentryTransaction<T>(
  name: string,
  op: TransactionOp | string,
  fn: (tx: TransactionHandle) => Promise<T>,
  options?: {
    tags?: PullSentryTags;
    data?: Record<string, string | number | boolean>;
    financialContext?: FinancialContext;
  },
): Promise<T> {
  const tx = startTransaction(name, op, options?.data);

  if (options?.tags) {
    for (const [key, value] of Object.entries(options.tags)) {
      if (value !== undefined) {
        tx.setTag(key, value);
      }
    }
  }

  try {
    const result = await fn(tx);
    tx.finish("ok");
    return result;
  } catch (error) {
    tx.finish("error");
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: options?.tags,
      financialContext: options?.financialContext,
      extra: { transactionName: name, transactionOp: op },
    });
    throw error;
  }
}

/**
 * Wraps a cron job execution with Sentry cron monitoring.
 * Sends in_progress at start, ok/error at end.
 *
 * @example
 * ```ts
 * await withCronMonitoring(CronMonitors.DAILY_RECONCILIATION, async () => {
 *   await runDailyReconciliation();
 * });
 * ```
 */
export async function withCronMonitoring<T>(
  monitor: CronMonitorConfig,
  fn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();

  const checkInId = cronCheckIn(monitor.slug, "in_progress", {
    monitorConfig: monitor,
  });

  try {
    const result = await fn();
    const durationSeconds = (Date.now() - startTime) / 1000;

    cronCheckIn(monitor.slug, "ok", {
      checkInId,
      duration: durationSeconds,
    });

    return result;
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;

    cronCheckIn(monitor.slug, "error", {
      checkInId,
      duration: durationSeconds,
    });

    captureException(
      error instanceof Error ? error : new Error(String(error)),
      {
        tags: { cronJob: monitor.slug },
        extra: {
          monitorSlug: monitor.slug,
          monitorName: monitor.name,
          durationSeconds,
        },
      },
    );

    throw error;
  }
}

/**
 * Records a full order lifecycle from creation through settlement.
 * Call this at each step and it will add the appropriate breadcrumb.
 *
 * @example
 * ```ts
 * trackOrderStep("ord_123", "order_created", { side: "buy", amount: 100 });
 * // ... later
 * trackOrderStep("ord_123", "order_filled", { fillPrice: 0.55 });
 * // ... later
 * trackOrderStep("ord_123", "order_settled", { pnl: 12.50 });
 * ```
 */
export function trackOrderStep(
  orderId: string,
  step: OrderFlowBreadcrumb["step"],
  data?: Record<string, string | number | boolean>,
): void {
  addOrderBreadcrumb({
    orderId,
    step,
    timestamp: new Date().toISOString(),
    data,
  });
}

// Re-export Sentry for cases where direct access is needed
export { Sentry };
