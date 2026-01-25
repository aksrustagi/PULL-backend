/**
 * Tracing Types
 *
 * Type definitions for distributed tracing with OpenTelemetry.
 */

/**
 * Span kind - indicates the relationship between the span and its parent
 */
export enum SpanKind {
  /** Internal span (default) */
  INTERNAL = 0,
  /** Server span - handling incoming request */
  SERVER = 1,
  /** Client span - making outgoing request */
  CLIENT = 2,
  /** Producer span - creating a message */
  PRODUCER = 3,
  /** Consumer span - receiving a message */
  CONSUMER = 4,
}

/**
 * Span status code
 */
export enum SpanStatusCode {
  /** Unset status */
  UNSET = 0,
  /** Operation completed successfully */
  OK = 1,
  /** Operation failed with an error */
  ERROR = 2,
}

/**
 * Span status
 */
export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

/**
 * Span attributes (key-value pairs)
 */
export type SpanAttributes = Record<string, SpanAttributeValue>;

/**
 * Valid span attribute value types
 */
export type SpanAttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | undefined;

/**
 * Span event - a time-stamped annotation
 */
export interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp */
  timestamp?: number;
  /** Event attributes */
  attributes?: SpanAttributes;
}

/**
 * Span link - a reference to another span
 */
export interface SpanLink {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Link attributes */
  attributes?: SpanAttributes;
}

/**
 * Span context - identifies a span uniquely
 */
export interface SpanContext {
  /** Trace ID (128-bit identifier as hex string) */
  traceId: string;
  /** Span ID (64-bit identifier as hex string) */
  spanId: string;
  /** Trace flags */
  traceFlags: number;
  /** Trace state (vendor-specific trace info) */
  traceState?: string;
  /** Whether this is a remote span context */
  isRemote?: boolean;
}

/**
 * Span interface
 */
export interface Span {
  /** Get the span context */
  spanContext(): SpanContext;
  /** Set an attribute */
  setAttribute(key: string, value: SpanAttributeValue): Span;
  /** Set multiple attributes */
  setAttributes(attributes: SpanAttributes): Span;
  /** Add an event */
  addEvent(name: string, attributes?: SpanAttributes): Span;
  /** Set the span status */
  setStatus(status: SpanStatus): Span;
  /** Update the span name */
  updateName(name: string): Span;
  /** Record an exception */
  recordException(exception: Error, time?: number): Span;
  /** End the span */
  end(endTime?: number): void;
  /** Check if span is recording */
  isRecording(): boolean;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /** Start a new span */
  startSpan(
    name: string,
    options?: SpanOptions,
    context?: TracingContext
  ): Span;
  /** Start a span that is automatically ended when the callback returns */
  startActiveSpan<T>(
    name: string,
    fn: (span: Span) => T
  ): T;
  /** Start a span with options that is automatically ended */
  startActiveSpan<T>(
    name: string,
    options: SpanOptions,
    fn: (span: Span) => T
  ): T;
  /** Start a span with options and context that is automatically ended */
  startActiveSpan<T>(
    name: string,
    options: SpanOptions,
    context: TracingContext,
    fn: (span: Span) => T
  ): T;
}

/**
 * Options for starting a span
 */
export interface SpanOptions {
  /** Span kind */
  kind?: SpanKind;
  /** Initial attributes */
  attributes?: SpanAttributes;
  /** Links to other spans */
  links?: SpanLink[];
  /** Start time (defaults to current time) */
  startTime?: number;
  /** Whether to set as active span in context */
  root?: boolean;
}

/**
 * Tracing context for propagation
 */
export interface TracingContext {
  /** Get a value from context */
  getValue(key: symbol): unknown;
  /** Set a value in context */
  setValue(key: symbol, value: unknown): TracingContext;
  /** Delete a value from context */
  deleteValue(key: symbol): TracingContext;
}

/**
 * Tracer provider configuration
 */
export interface TracerProviderConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment */
  environment?: string;
  /** OTLP endpoint for exporting traces */
  otlpEndpoint?: string;
  /** Whether to export to console (development) */
  consoleExport?: boolean;
  /** Sampling ratio (0.0 to 1.0) */
  samplingRatio?: number;
  /** Additional resource attributes */
  resourceAttributes?: SpanAttributes;
}

/**
 * W3C Trace Context headers
 */
export interface TraceContextHeaders {
  traceparent?: string;
  tracestate?: string;
}

/**
 * HTTP span semantic conventions
 */
export const HTTP_ATTRIBUTES = {
  HTTP_METHOD: "http.method",
  HTTP_URL: "http.url",
  HTTP_TARGET: "http.target",
  HTTP_HOST: "http.host",
  HTTP_SCHEME: "http.scheme",
  HTTP_STATUS_CODE: "http.status_code",
  HTTP_FLAVOR: "http.flavor",
  HTTP_USER_AGENT: "http.user_agent",
  HTTP_REQUEST_CONTENT_LENGTH: "http.request_content_length",
  HTTP_RESPONSE_CONTENT_LENGTH: "http.response_content_length",
  HTTP_ROUTE: "http.route",
  HTTP_CLIENT_IP: "http.client_ip",
} as const;

/**
 * Database span semantic conventions
 */
export const DB_ATTRIBUTES = {
  DB_SYSTEM: "db.system",
  DB_CONNECTION_STRING: "db.connection_string",
  DB_USER: "db.user",
  DB_NAME: "db.name",
  DB_STATEMENT: "db.statement",
  DB_OPERATION: "db.operation",
} as const;

/**
 * RPC span semantic conventions
 */
export const RPC_ATTRIBUTES = {
  RPC_SYSTEM: "rpc.system",
  RPC_SERVICE: "rpc.service",
  RPC_METHOD: "rpc.method",
} as const;

/**
 * General span semantic conventions
 */
export const GENERAL_ATTRIBUTES = {
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  DEPLOYMENT_ENVIRONMENT: "deployment.environment",
  EXCEPTION_TYPE: "exception.type",
  EXCEPTION_MESSAGE: "exception.message",
  EXCEPTION_STACKTRACE: "exception.stacktrace",
} as const;
