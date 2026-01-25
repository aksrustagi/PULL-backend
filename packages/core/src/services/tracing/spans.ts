/**
 * Span Helper Functions
 *
 * Convenience functions for creating and managing spans.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import {
  getTracer,
  getActiveSpan,
  extractTraceContext,
  injectTraceContext,
  withContextAsync,
  getCurrentContext,
} from "./tracer";
import type {
  Span,
  SpanOptions,
  SpanAttributes,
  SpanContext,
} from "./types";
import {
  SpanKind,
  SpanStatusCode,
  HTTP_ATTRIBUTES,
  DB_ATTRIBUTES,
  RPC_ATTRIBUTES,
} from "./types";

/**
 * Create an HTTP server span
 */
export function createHttpServerSpan(
  method: string,
  path: string,
  options?: Partial<SpanOptions>
): Span {
  const tracer = getTracer();
  return tracer.startSpan(`HTTP ${method} ${path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      [HTTP_ATTRIBUTES.HTTP_METHOD]: method,
      [HTTP_ATTRIBUTES.HTTP_TARGET]: path,
    },
    ...options,
  });
}

/**
 * Create an HTTP client span
 */
export function createHttpClientSpan(
  method: string,
  url: string,
  options?: Partial<SpanOptions>
): Span {
  const tracer = getTracer();
  const parsedUrl = new URL(url);

  return tracer.startSpan(`HTTP ${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [HTTP_ATTRIBUTES.HTTP_METHOD]: method,
      [HTTP_ATTRIBUTES.HTTP_URL]: url,
      [HTTP_ATTRIBUTES.HTTP_HOST]: parsedUrl.host,
      [HTTP_ATTRIBUTES.HTTP_SCHEME]: parsedUrl.protocol.replace(":", ""),
    },
    ...options,
  });
}

/**
 * Create a database span
 */
export function createDatabaseSpan(
  operation: string,
  table: string,
  options?: Partial<SpanOptions> & { dbSystem?: string; statement?: string }
): Span {
  const tracer = getTracer();
  return tracer.startSpan(`DB ${operation} ${table}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [DB_ATTRIBUTES.DB_OPERATION]: operation,
      [DB_ATTRIBUTES.DB_NAME]: table,
      ...(options?.dbSystem && { [DB_ATTRIBUTES.DB_SYSTEM]: options.dbSystem }),
      ...(options?.statement && { [DB_ATTRIBUTES.DB_STATEMENT]: options.statement }),
    },
    ...options,
  });
}

/**
 * Create an RPC span
 */
export function createRpcSpan(
  service: string,
  method: string,
  options?: Partial<SpanOptions> & { rpcSystem?: string }
): Span {
  const tracer = getTracer();
  return tracer.startSpan(`${service}/${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [RPC_ATTRIBUTES.RPC_SERVICE]: service,
      [RPC_ATTRIBUTES.RPC_METHOD]: method,
      ...(options?.rpcSystem && { [RPC_ATTRIBUTES.RPC_SYSTEM]: options.rpcSystem }),
    },
    ...options,
  });
}

/**
 * Create an internal span
 */
export function createInternalSpan(
  name: string,
  attributes?: SpanAttributes,
  options?: Partial<SpanOptions>
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
    ...options,
  });
}

/**
 * Run a function within a traced span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options || {}, fn);
}

/**
 * Run a synchronous function within a traced span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions
): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options || {}, fn);
}

/**
 * Trace an HTTP fetch call
 */
export async function tracedFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const method = init?.method || "GET";
  const span = createHttpClientSpan(method, url);

  try {
    // Inject trace context into headers
    const headers = injectTraceContext({
      ...Object.fromEntries(
        new Headers(init?.headers as HeadersInit).entries()
      ),
    }, span);

    const response = await fetch(url, {
      ...init,
      headers,
    });

    span.setAttribute(HTTP_ATTRIBUTES.HTTP_STATUS_CODE, response.status);

    if (response.status >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${response.status}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    return response;
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace a database operation
 */
export async function traceDatabase<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>,
  options?: { dbSystem?: string; statement?: string }
): Promise<T> {
  const span = createDatabaseSpan(operation, table, options);

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace an external service call
 */
export async function traceExternalService<T>(
  service: string,
  method: string,
  fn: () => Promise<T>,
  options?: { rpcSystem?: string }
): Promise<T> {
  const span = createRpcSpan(service, method, options);

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add attributes to the active span
 */
export function addSpanAttributes(attributes: SpanAttributes): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the active span
 */
export function addSpanEvent(name: string, attributes?: SpanAttributes): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Record an exception in the active span
 */
export function recordSpanException(exception: Error): void {
  const span = getActiveSpan();
  if (span) {
    span.recordException(exception);
  }
}

/**
 * Set the active span's status to error
 */
export function setSpanError(message?: string): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({ code: SpanStatusCode.ERROR, message });
  }
}

/**
 * Set the active span's status to OK
 */
export function setSpanOk(): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

/**
 * Get the current trace ID
 */
export function getCurrentTraceId(): string | undefined {
  const span = getActiveSpan();
  return span?.spanContext().traceId;
}

/**
 * Get the current span ID
 */
export function getCurrentSpanId(): string | undefined {
  const span = getActiveSpan();
  return span?.spanContext().spanId;
}

/**
 * Create tracing middleware for Hono
 */
export function createTracingMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    const url = new URL(c.req.url);
    const path = url.pathname;

    // Extract parent context from headers
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const parentContext = extractTraceContext(headers);

    // Create server span
    const tracer = getTracer();
    const span = tracer.startSpan(`HTTP ${method} ${path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        [HTTP_ATTRIBUTES.HTTP_METHOD]: method,
        [HTTP_ATTRIBUTES.HTTP_URL]: url.href,
        [HTTP_ATTRIBUTES.HTTP_TARGET]: path,
        [HTTP_ATTRIBUTES.HTTP_HOST]: url.host,
        [HTTP_ATTRIBUTES.HTTP_SCHEME]: url.protocol.replace(":", ""),
        [HTTP_ATTRIBUTES.HTTP_USER_AGENT]: c.req.header("user-agent"),
        [HTTP_ATTRIBUTES.HTTP_CLIENT_IP]:
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
          c.req.header("x-real-ip"),
      },
    });

    // Add trace context to response headers
    const spanContext = span.spanContext();
    c.header("X-Trace-ID", spanContext.traceId);
    c.header("X-Span-ID", spanContext.spanId);

    // Store span in context for access in handlers
    (c as any).set("span", span);
    (c as any).set("traceId", spanContext.traceId);

    try {
      await next();

      // Record response status
      span.setAttribute(HTTP_ATTRIBUTES.HTTP_STATUS_CODE, c.res.status);

      if (c.res.status >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${c.res.status}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setAttribute(HTTP_ATTRIBUTES.HTTP_STATUS_CODE, 500);
      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Get the current span from Hono context
 */
export function getSpanFromContext(c: Context): Span | undefined {
  return (c as any).get?.("span");
}

/**
 * Get the trace ID from Hono context
 */
export function getTraceIdFromContext(c: Context): string | undefined {
  return (c as any).get?.("traceId");
}

/**
 * Decorator for tracing class methods
 */
export function Traced(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const spanName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const tracer = getTracer();
      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          const result = await originalMethod.apply(this, args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        }
      });
    };

    return descriptor;
  };
}

/**
 * Context variable type augmentation for Hono
 */
declare module "hono" {
  interface ContextVariableMap {
    span: Span;
    traceId: string;
  }
}
