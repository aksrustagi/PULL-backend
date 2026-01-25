/**
 * Logger Service
 *
 * Structured logging service with correlation ID tracking,
 * sensitive field redaction, and HTTP request/response logging.
 *
 * @example
 * ```typescript
 * import { getLogger, createLogger, initLogger } from '@pull/core/services/logger';
 *
 * // Use default logger
 * const logger = getLogger();
 * logger.info('Hello world');
 *
 * // Initialize with custom config
 * initLogger({
 *   level: 'debug',
 *   serviceName: 'my-service',
 * });
 *
 * // Log with context
 * logger.info('User logged in', { userId: '123', action: 'login' });
 *
 * // Log errors with stack traces
 * logger.error('Failed to process request', {
 *   error: new Error('Something went wrong'),
 *   requestId: 'abc-123',
 * });
 *
 * // Create child logger with inherited context
 * const requestLogger = logger.child({ requestId: 'req-123' });
 * requestLogger.info('Processing request'); // Includes requestId automatically
 * ```
 *
 * @example Middleware usage with Hono
 * ```typescript
 * import { createLoggingMiddleware, createLoggerContextMiddleware } from '@pull/core/services/logger';
 *
 * const app = new Hono();
 *
 * // Add request logging middleware
 * app.use('*', createLoggingMiddleware({
 *   skipHealthChecks: true,
 *   getUserId: (c) => c.get('userId'),
 * }));
 *
 * // Add logger to context
 * app.use('*', createLoggerContextMiddleware());
 *
 * // Use logger in route handlers
 * app.get('/api/users', (c) => {
 *   const logger = c.get('logger');
 *   logger.info('Fetching users');
 *   // ...
 * });
 * ```
 */

// Logger core
export {
  createLogger,
  getLogger,
  initLogger,
  getDefaultLoggerConfig,
  generateCorrelationId,
  withCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
  correlationStore,
} from "./logger";

// Middleware
export {
  createLoggingMiddleware,
  createLoggerContextMiddleware,
  createErrorLoggingMiddleware,
  createRequestLogger,
  getRequestLogger,
  withTiming,
  withDatabaseTiming,
  withExternalServiceTiming,
} from "./middleware";
export type { LoggingMiddlewareOptions } from "./middleware";

// Types
export type {
  Logger,
  LogLevel,
  LogContext,
  LoggerConfig,
  LogEntry,
  ErrorContext,
  HttpRequestContext,
  HttpResponseContext,
  PerformanceContext,
  DatabaseContext,
  ExternalServiceContext,
  CorrelationStore,
} from "./types";

export { DEFAULT_REDACT_FIELDS } from "./types";
