/**
 * Tracing Service
 *
 * OpenTelemetry-compatible distributed tracing for the PULL platform.
 *
 * @example
 * ```typescript
 * import {
 *   initTracerProvider,
 *   getTracer,
 *   withSpan,
 *   createTracingMiddleware,
 *   tracedFetch,
 * } from '@pull/core/services/tracing';
 *
 * // Initialize tracer
 * initTracerProvider({
 *   serviceName: 'pull-api',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 *   otlpEndpoint: 'http://otel-collector:4318',
 * });
 *
 * // Add tracing middleware to Hono
 * const app = new Hono();
 * app.use('*', createTracingMiddleware());
 *
 * // Trace a function
 * async function processOrder(orderId: string) {
 *   return withSpan('process-order', async (span) => {
 *     span.setAttribute('order.id', orderId);
 *     // ... process order
 *   });
 * }
 *
 * // Trace HTTP calls
 * const response = await tracedFetch('https://api.example.com/data');
 * ```
 */

// Tracer
export {
  initTracerProvider,
  getTracer,
  getTracerConfig,
  getCurrentContext,
  getActiveSpan,
  parseTraceparent,
  createTraceparent,
  extractTraceContext,
  injectTraceContext,
  withContext,
  withContextAsync,
  flushSpans,
  shutdownTracer,
  stopBatchExport,
} from "./tracer";

// Span helpers
export {
  createHttpServerSpan,
  createHttpClientSpan,
  createDatabaseSpan,
  createRpcSpan,
  createInternalSpan,
  withSpan,
  withSpanSync,
  tracedFetch,
  traceDatabase,
  traceExternalService,
  addSpanAttributes,
  addSpanEvent,
  recordSpanException,
  setSpanError,
  setSpanOk,
  getCurrentTraceId,
  getCurrentSpanId,
  createTracingMiddleware,
  getSpanFromContext,
  getTraceIdFromContext,
  Traced,
} from "./spans";

// Types
export type {
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  SpanAttributes,
  SpanAttributeValue,
  SpanEvent,
  SpanLink,
  Tracer,
  TracerProviderConfig,
  TracingContext,
  TraceContextHeaders,
} from "./types";

export {
  SpanKind,
  SpanStatusCode,
  HTTP_ATTRIBUTES,
  DB_ATTRIBUTES,
  RPC_ATTRIBUTES,
  GENERAL_ATTRIBUTES,
} from "./types";
