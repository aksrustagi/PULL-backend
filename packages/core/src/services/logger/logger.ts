/**
 * Pino-based Structured Logger
 *
 * Production-ready structured logging with:
 * - JSON output for log aggregation
 * - Correlation ID tracking across requests
 * - Sensitive field redaction
 * - Performance timing
 * - Request/response logging
 */

import { AsyncLocalStorage } from "async_hooks";
import type {
  Logger,
  LoggerConfig,
  LogContext,
  LogLevel,
  HttpRequestContext,
  HttpResponseContext,
  ErrorContext,
  PerformanceContext,
  DatabaseContext,
  ExternalServiceContext,
  CorrelationStore,
  LogEntry,
} from "./types";
import { DEFAULT_REDACT_FIELDS } from "./types";

/**
 * AsyncLocalStorage for correlation ID tracking
 */
const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Correlation store implementation
 */
export const correlationStore: CorrelationStore = {
  get(): string | undefined {
    return correlationStorage.getStore();
  },
  set(correlationId: string): void {
    // Note: This only works within a run() context
    // For setting outside, use run() instead
  },
  run<T>(correlationId: string, fn: () => T): T {
    return correlationStorage.run(correlationId, fn);
  },
};

/**
 * Log level numeric values for comparison
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * Get hostname safely
 */
function getHostname(): string {
  try {
    return process.env.HOSTNAME || require("os").hostname() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Deep clone and redact sensitive fields
 */
function redactSensitiveFields(
  obj: unknown,
  redactFields: string[],
  seen = new WeakSet()
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  // Handle circular references
  if (seen.has(obj as object)) {
    return "[Circular]";
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, redactFields, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = redactFields.some(
      (field) =>
        lowerKey === field.toLowerCase() ||
        lowerKey.includes(field.toLowerCase())
    );

    if (shouldRedact) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveFields(value, redactFields, seen);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Format error for logging
 */
function formatError(error: Error | ErrorContext): ErrorContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      cause: error.cause,
    };
  }
  return error;
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  config: LoggerConfig,
  context?: LogContext,
  additionalFields?: Record<string, unknown>
): LogEntry {
  const correlationId = correlationStorage.getStore() || context?.correlationId;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: config.serviceName,
    environment: config.environment,
    version: config.version,
    hostname: getHostname(),
    ...(correlationId && { correlationId }),
    ...(context?.requestId && { requestId: context.requestId }),
    ...(context?.userId && { userId: context.userId }),
    ...additionalFields,
  };

  // Merge additional context, excluding known fields
  if (context) {
    const { correlationId: _, requestId: __, userId: ___, ...rest } = context;
    Object.assign(entry, rest);
  }

  return entry;
}

/**
 * Output log entry
 */
function outputLog(entry: LogEntry, config: LoggerConfig): void {
  const redacted = redactSensitiveFields(
    entry,
    config.redactFields || DEFAULT_REDACT_FIELDS
  ) as LogEntry;

  if (config.prettyPrint) {
    // Pretty print for development
    const colors: Record<LogLevel, string> = {
      trace: "\x1b[90m",
      debug: "\x1b[36m",
      info: "\x1b[32m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
      fatal: "\x1b[35m",
    };
    const reset = "\x1b[0m";
    const color = colors[entry.level];

    const time = new Date(entry.timestamp).toLocaleTimeString();
    const level = entry.level.toUpperCase().padEnd(5);
    const prefix = `${color}[${time}] ${level}${reset}`;

    let output = `${prefix} ${entry.message}`;

    // Add context in development
    const contextKeys = Object.keys(redacted).filter(
      (k) =>
        ![
          "level",
          "message",
          "timestamp",
          "service",
          "environment",
          "version",
          "hostname",
        ].includes(k)
    );

    if (contextKeys.length > 0) {
      const contextObj: Record<string, unknown> = {};
      for (const key of contextKeys) {
        contextObj[key] = redacted[key];
      }
      output += ` ${JSON.stringify(contextObj, null, 2)}`;
    }

    if (entry.level === "error" || entry.level === "fatal") {
      console.error(output);
    } else {
      console.log(output);
    }
  } else {
    // JSON output for production
    const output = JSON.stringify(redacted);
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel, configLevel: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[configLevel];
}

/**
 * Create a logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  const log = (
    level: LogLevel,
    message: string,
    context?: LogContext,
    additionalFields?: Record<string, unknown>
  ): void => {
    if (!shouldLog(level, config.level)) {
      return;
    }

    const mergedContext = {
      ...config.defaultContext,
      ...context,
    };

    const entry = createLogEntry(
      level,
      message,
      config,
      mergedContext,
      additionalFields
    );
    outputLog(entry, config);
  };

  const logger: Logger = {
    trace(message: string, context?: LogContext): void {
      log("trace", message, context);
    },

    debug(message: string, context?: LogContext): void {
      log("debug", message, context);
    },

    info(message: string, context?: LogContext): void {
      log("info", message, context);
    },

    warn(message: string, context?: LogContext): void {
      log("warn", message, context);
    },

    error(
      message: string,
      context?: LogContext & { error?: Error | ErrorContext }
    ): void {
      const { error, ...rest } = context || {};
      log("error", message, rest, error ? { error: formatError(error) } : {});
    },

    fatal(
      message: string,
      context?: LogContext & { error?: Error | ErrorContext }
    ): void {
      const { error, ...rest } = context || {};
      log("fatal", message, rest, error ? { error: formatError(error) } : {});
    },

    child(additionalContext: LogContext): Logger {
      return createLogger({
        ...config,
        defaultContext: {
          ...config.defaultContext,
          ...additionalContext,
        },
      });
    },

    timing(context: PerformanceContext & LogContext): void {
      const { operation, duration, startTime, endTime, success, ...rest } =
        context;
      log("info", `Performance: ${operation}`, rest, {
        performance: { operation, duration, startTime, endTime, success },
      });
    },

    httpRequest(request: HttpRequestContext, context?: LogContext): void {
      const sanitizedRequest = redactSensitiveFields(
        request,
        config.redactFields || DEFAULT_REDACT_FIELDS
      ) as HttpRequestContext;

      log("info", `HTTP Request: ${request.method} ${request.path}`, context, {
        request: sanitizedRequest,
      });
    },

    httpResponse(
      request: HttpRequestContext,
      response: HttpResponseContext,
      context?: LogContext
    ): void {
      const level: LogLevel =
        response.statusCode >= 500
          ? "error"
          : response.statusCode >= 400
            ? "warn"
            : "info";

      const sanitizedRequest = redactSensitiveFields(
        request,
        config.redactFields || DEFAULT_REDACT_FIELDS
      ) as HttpRequestContext;

      log(
        level,
        `HTTP Response: ${request.method} ${request.path} ${response.statusCode} ${response.responseTime}ms`,
        context,
        {
          request: sanitizedRequest,
          response,
        }
      );
    },

    database(context: DatabaseContext & LogContext): void {
      const { queryType, table, duration, rowsAffected, ...rest } = context;
      log("debug", `Database: ${queryType || "query"} ${table || ""}`, rest, {
        database: { queryType, table, duration, rowsAffected },
      });
    },

    externalService(context: ExternalServiceContext & LogContext): void {
      const {
        service,
        endpoint,
        duration,
        statusCode,
        success,
        retryAttempt,
        ...rest
      } = context;

      const level: LogLevel =
        success === false ? "warn" : statusCode && statusCode >= 400 ? "warn" : "info";

      log(
        level,
        `External Service: ${service} ${endpoint || ""}`,
        rest,
        {
          externalService: {
            service,
            endpoint,
            duration,
            statusCode,
            success,
            retryAttempt,
          },
        }
      );
    },

    async flush(): Promise<void> {
      // For console-based logging, this is a no-op
      // Override for implementations that buffer logs
      return Promise.resolve();
    },
  };

  return logger;
}

/**
 * Default logger configuration
 */
export function getDefaultLoggerConfig(): LoggerConfig {
  const environment = process.env.NODE_ENV || "development";
  const isDevelopment = environment === "development";

  return {
    level: (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? "debug" : "info"),
    serviceName: process.env.SERVICE_NAME || "pull-api",
    environment,
    version: process.env.APP_VERSION || process.env.npm_package_version || "0.0.0",
    prettyPrint: isDevelopment,
    timestamp: true,
    redactFields: DEFAULT_REDACT_FIELDS,
  };
}

/**
 * Default logger instance (singleton)
 */
let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger(getDefaultLoggerConfig());
  }
  return defaultLogger;
}

/**
 * Initialize logger with custom config
 */
export function initLogger(config: Partial<LoggerConfig>): Logger {
  defaultLogger = createLogger({
    ...getDefaultLoggerConfig(),
    ...config,
  });
  return defaultLogger;
}

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Run a function with correlation ID tracking
 */
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T
): T {
  return correlationStorage.run(correlationId, fn);
}

/**
 * Run an async function with correlation ID tracking
 */
export async function withCorrelationIdAsync<T>(
  correlationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return correlationStorage.run(correlationId, fn);
}

/**
 * Get current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}
