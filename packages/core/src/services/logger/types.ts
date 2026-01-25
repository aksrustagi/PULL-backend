/**
 * Logger Types
 *
 * Type definitions for the structured logging system.
 */

/**
 * Log levels supported by the logger
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Base context included with every log entry
 */
export interface LogContext {
  /** Unique identifier for tracing requests across services */
  correlationId?: string;
  /** Request identifier */
  requestId?: string;
  /** User identifier (if authenticated) */
  userId?: string;
  /** Service name */
  service?: string;
  /** Environment (development, staging, production) */
  environment?: string;
  /** Version of the application */
  version?: string;
  /** Hostname of the server */
  hostname?: string;
  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * HTTP request context for request logging
 */
export interface HttpRequestContext {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Full URL */
  url?: string;
  /** Query parameters (sanitized) */
  query?: Record<string, string>;
  /** Request headers (sanitized) */
  headers?: Record<string, string>;
  /** Request body (sanitized) */
  body?: unknown;
  /** Client IP address */
  ip?: string;
  /** User agent */
  userAgent?: string;
}

/**
 * HTTP response context for response logging
 */
export interface HttpResponseContext {
  /** HTTP status code */
  statusCode: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Response headers (sanitized) */
  headers?: Record<string, string>;
  /** Response size in bytes */
  contentLength?: number;
}

/**
 * Error context for error logging
 */
export interface ErrorContext {
  /** Error name */
  name: string;
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Error code (if available) */
  code?: string | number;
  /** Original error cause */
  cause?: unknown;
}

/**
 * Performance timing context
 */
export interface PerformanceContext {
  /** Operation name */
  operation: string;
  /** Duration in milliseconds */
  duration: number;
  /** Start timestamp */
  startTime?: number;
  /** End timestamp */
  endTime?: number;
  /** Whether the operation succeeded */
  success?: boolean;
}

/**
 * Database query context
 */
export interface DatabaseContext {
  /** Query type (SELECT, INSERT, UPDATE, DELETE) */
  queryType?: string;
  /** Table/collection name */
  table?: string;
  /** Query duration in milliseconds */
  duration?: number;
  /** Number of rows affected */
  rowsAffected?: number;
}

/**
 * External service call context
 */
export interface ExternalServiceContext {
  /** Service name */
  service: string;
  /** Endpoint/method called */
  endpoint?: string;
  /** Request duration in milliseconds */
  duration?: number;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Whether the call succeeded */
  success?: boolean;
  /** Retry attempt number */
  retryAttempt?: number;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Service name for log context */
  serviceName: string;
  /** Environment name */
  environment: string;
  /** Application version */
  version?: string;
  /** Whether to pretty print logs (development only) */
  prettyPrint?: boolean;
  /** Whether to include timestamps */
  timestamp?: boolean;
  /** Fields to redact from logs */
  redactFields?: string[];
  /** Additional default context */
  defaultContext?: LogContext;
}

/**
 * Logger interface
 */
export interface Logger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext & { error?: Error | ErrorContext }): void;
  fatal(message: string, context?: LogContext & { error?: Error | ErrorContext }): void;

  /** Create a child logger with additional context */
  child(context: LogContext): Logger;

  /** Log performance timing */
  timing(context: PerformanceContext & LogContext): void;

  /** Log HTTP request */
  httpRequest(request: HttpRequestContext, context?: LogContext): void;

  /** Log HTTP response */
  httpResponse(
    request: HttpRequestContext,
    response: HttpResponseContext,
    context?: LogContext
  ): void;

  /** Log database operation */
  database(context: DatabaseContext & LogContext): void;

  /** Log external service call */
  externalService(context: ExternalServiceContext & LogContext): void;

  /** Flush any buffered logs */
  flush(): Promise<void>;
}

/**
 * Correlation ID store for async context tracking
 */
export interface CorrelationStore {
  get(): string | undefined;
  set(correlationId: string): void;
  run<T>(correlationId: string, fn: () => T): T;
}

/**
 * Default sensitive fields to redact
 */
export const DEFAULT_REDACT_FIELDS = [
  // Authentication
  "password",
  "passwordHash",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "secret",
  "apiKey",
  "api_key",
  "apiSecret",
  "api_secret",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "token",
  "jwt",
  "bearer",
  "authorization",
  "Authorization",

  // Personal Identifiable Information
  "ssn",
  "socialSecurityNumber",
  "social_security_number",
  "taxId",
  "tax_id",
  "ein",
  "driverLicense",
  "driver_license",
  "passportNumber",
  "passport_number",

  // Financial Information
  "accountNumber",
  "account_number",
  "routingNumber",
  "routing_number",
  "cardNumber",
  "card_number",
  "cvv",
  "cvc",
  "securityCode",
  "security_code",
  "pin",
  "bankAccount",
  "bank_account",
  "creditCard",
  "credit_card",
  "debitCard",
  "debit_card",

  // Other Sensitive Data
  "privateKey",
  "private_key",
  "secretKey",
  "secret_key",
  "encryptionKey",
  "encryption_key",
  "cookie",
  "sessionId",
  "session_id",
];

/**
 * Log entry structure (for JSON output)
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  environment: string;
  version?: string;
  hostname?: string;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  error?: ErrorContext;
  request?: HttpRequestContext;
  response?: HttpResponseContext;
  performance?: PerformanceContext;
  database?: DatabaseContext;
  externalService?: ExternalServiceContext;
  [key: string]: unknown;
}
