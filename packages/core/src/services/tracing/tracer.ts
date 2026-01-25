/**
 * OpenTelemetry Tracer Implementation
 *
 * Lightweight distributed tracing implementation that's compatible
 * with OpenTelemetry concepts. Can be swapped with actual OTel SDK
 * in production.
 */

import { AsyncLocalStorage } from "async_hooks";
import type {
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  SpanAttributes,
  SpanAttributeValue,
  SpanEvent,
  Tracer,
  TracerProviderConfig,
  TracingContext,
  TraceContextHeaders,
} from "./types";
import { SpanKind, SpanStatusCode } from "./types";
import { getLogger } from "../logger";

/**
 * Generate a random hex string
 */
function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a trace ID (128-bit = 32 hex chars)
 */
function generateTraceId(): string {
  return randomHex(16);
}

/**
 * Generate a span ID (64-bit = 16 hex chars)
 */
function generateSpanId(): string {
  return randomHex(8);
}

/**
 * Context implementation
 */
class TracingContextImpl implements TracingContext {
  private values: Map<symbol, unknown> = new Map();

  getValue(key: symbol): unknown {
    return this.values.get(key);
  }

  setValue(key: symbol, value: unknown): TracingContext {
    const newContext = new TracingContextImpl();
    newContext.values = new Map(this.values);
    newContext.values.set(key, value);
    return newContext;
  }

  deleteValue(key: symbol): TracingContext {
    const newContext = new TracingContextImpl();
    newContext.values = new Map(this.values);
    newContext.values.delete(key);
    return newContext;
  }
}

/**
 * Span implementation
 */
class SpanImpl implements Span {
  private _spanContext: SpanContext;
  private _name: string;
  private _kind: SpanKind;
  private _attributes: SpanAttributes = {};
  private _events: SpanEvent[] = [];
  private _status: SpanStatus = { code: SpanStatusCode.UNSET };
  private _startTime: number;
  private _endTime?: number;
  private _parentSpanId?: string;
  private _recording: boolean = true;
  private _config: TracerProviderConfig;

  constructor(
    name: string,
    options: SpanOptions,
    parentContext: SpanContext | undefined,
    config: TracerProviderConfig
  ) {
    this._name = name;
    this._kind = options.kind ?? SpanKind.INTERNAL;
    this._startTime = options.startTime ?? performance.now();
    this._config = config;

    // Generate or inherit trace ID
    const traceId = options.root ? generateTraceId() : (parentContext?.traceId ?? generateTraceId());
    this._parentSpanId = options.root ? undefined : parentContext?.spanId;

    this._spanContext = {
      traceId,
      spanId: generateSpanId(),
      traceFlags: 1, // Sampled
    };

    // Set initial attributes
    if (options.attributes) {
      this.setAttributes(options.attributes);
    }
  }

  spanContext(): SpanContext {
    return { ...this._spanContext };
  }

  setAttribute(key: string, value: SpanAttributeValue): Span {
    if (this._recording && value !== undefined) {
      this._attributes[key] = value;
    }
    return this;
  }

  setAttributes(attributes: SpanAttributes): Span {
    if (this._recording) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined) {
          this._attributes[key] = value;
        }
      }
    }
    return this;
  }

  addEvent(name: string, attributes?: SpanAttributes): Span {
    if (this._recording) {
      this._events.push({
        name,
        timestamp: performance.now(),
        attributes,
      });
    }
    return this;
  }

  setStatus(status: SpanStatus): Span {
    if (this._recording) {
      this._status = status;
    }
    return this;
  }

  updateName(name: string): Span {
    if (this._recording) {
      this._name = name;
    }
    return this;
  }

  recordException(exception: Error, time?: number): Span {
    if (this._recording) {
      this._events.push({
        name: "exception",
        timestamp: time ?? performance.now(),
        attributes: {
          "exception.type": exception.name,
          "exception.message": exception.message,
          "exception.stacktrace": exception.stack,
        },
      });
      this.setStatus({
        code: SpanStatusCode.ERROR,
        message: exception.message,
      });
    }
    return this;
  }

  end(endTime?: number): void {
    if (!this._recording) return;

    this._endTime = endTime ?? performance.now();
    this._recording = false;

    // Export the span
    this.export();
  }

  isRecording(): boolean {
    return this._recording;
  }

  private export(): void {
    const duration = this._endTime! - this._startTime;
    const logger = getLogger();

    // In development, log spans for debugging
    if (this._config.consoleExport) {
      logger.debug(`[Span] ${this._name}`, {
        traceId: this._spanContext.traceId,
        spanId: this._spanContext.spanId,
        parentSpanId: this._parentSpanId,
        kind: SpanKind[this._kind],
        duration: `${duration.toFixed(2)}ms`,
        status: SpanStatusCode[this._status.code],
        attributes: this._attributes,
        events: this._events.length > 0 ? this._events : undefined,
      });
    }

    // TODO: Send to OTLP endpoint in production
    if (this._config.otlpEndpoint) {
      // Queue for batch export
      spanExportQueue.push({
        traceId: this._spanContext.traceId,
        spanId: this._spanContext.spanId,
        parentSpanId: this._parentSpanId,
        name: this._name,
        kind: this._kind,
        startTime: this._startTime,
        endTime: this._endTime!,
        duration,
        status: this._status,
        attributes: this._attributes,
        events: this._events,
        resource: {
          "service.name": this._config.serviceName,
          "service.version": this._config.serviceVersion,
          "deployment.environment": this._config.environment,
          ...this._config.resourceAttributes,
        },
      });
    }
  }
}

/**
 * Span export queue for batch processing
 */
const spanExportQueue: Array<{
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime: number;
  duration: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  resource: SpanAttributes;
}> = [];

/**
 * Context key for active span
 */
const ACTIVE_SPAN_KEY = Symbol("active-span");

/**
 * AsyncLocalStorage for context propagation
 */
const contextStorage = new AsyncLocalStorage<TracingContext>();

/**
 * Get the current context
 */
export function getCurrentContext(): TracingContext {
  return contextStorage.getStore() ?? new TracingContextImpl();
}

/**
 * Get the active span from context
 */
export function getActiveSpan(): Span | undefined {
  const context = getCurrentContext();
  return context.getValue(ACTIVE_SPAN_KEY) as Span | undefined;
}

/**
 * Set the active span in context
 */
function setActiveSpan(context: TracingContext, span: Span): TracingContext {
  return context.setValue(ACTIVE_SPAN_KEY, span);
}

/**
 * Tracer implementation
 */
class TracerImpl implements Tracer {
  private config: TracerProviderConfig;

  constructor(config: TracerProviderConfig) {
    this.config = config;
  }

  startSpan(
    name: string,
    options: SpanOptions = {},
    context?: TracingContext
  ): Span {
    const ctx = context ?? getCurrentContext();
    const parentSpan = ctx.getValue(ACTIVE_SPAN_KEY) as Span | undefined;
    const parentContext = parentSpan?.spanContext();

    return new SpanImpl(name, options, parentContext, this.config);
  }

  startActiveSpan<T>(
    name: string,
    optionsOrFn: SpanOptions | ((span: Span) => T),
    contextOrFn?: TracingContext | ((span: Span) => T),
    fn?: (span: Span) => T
  ): T {
    let options: SpanOptions = {};
    let context: TracingContext | undefined;
    let callback: (span: Span) => T;

    if (typeof optionsOrFn === "function") {
      callback = optionsOrFn;
    } else {
      options = optionsOrFn;
      if (typeof contextOrFn === "function") {
        callback = contextOrFn;
      } else {
        context = contextOrFn;
        callback = fn!;
      }
    }

    const span = this.startSpan(name, options, context);
    const newContext = setActiveSpan(context ?? getCurrentContext(), span);

    try {
      const result = contextStorage.run(newContext, () => callback(span));

      // Handle promises
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return value;
          })
          .catch((error) => {
            span.recordException(error);
            span.end();
            throw error;
          }) as T;
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  }
}

/**
 * Tracer provider singleton
 */
let tracerProvider: {
  config: TracerProviderConfig;
  tracers: Map<string, Tracer>;
} | null = null;

/**
 * Initialize the tracer provider
 */
export function initTracerProvider(config: TracerProviderConfig): void {
  tracerProvider = {
    config: {
      ...config,
      consoleExport: config.consoleExport ?? (process.env.NODE_ENV === "development"),
      samplingRatio: config.samplingRatio ?? 1.0,
    },
    tracers: new Map(),
  };

  const logger = getLogger();
  logger.info("Tracer provider initialized", {
    serviceName: config.serviceName,
    environment: config.environment,
    otlpEndpoint: config.otlpEndpoint ? "[configured]" : "[not configured]",
    consoleExport: tracerProvider.config.consoleExport,
    samplingRatio: tracerProvider.config.samplingRatio,
  });

  // Start batch export if OTLP endpoint is configured
  if (config.otlpEndpoint) {
    startBatchExport(config.otlpEndpoint);
  }
}

/**
 * Get a tracer instance
 */
export function getTracer(name: string = "default"): Tracer {
  if (!tracerProvider) {
    // Initialize with defaults if not configured
    initTracerProvider({
      serviceName: process.env.SERVICE_NAME || "pull-api",
      serviceVersion: process.env.APP_VERSION || "0.0.0",
      environment: process.env.NODE_ENV || "development",
    });
  }

  let tracer = tracerProvider!.tracers.get(name);
  if (!tracer) {
    tracer = new TracerImpl(tracerProvider!.config);
    tracerProvider!.tracers.set(name, tracer);
  }

  return tracer;
}

/**
 * Get the tracer provider config
 */
export function getTracerConfig(): TracerProviderConfig | undefined {
  return tracerProvider?.config;
}

/**
 * Parse W3C traceparent header
 */
export function parseTraceparent(header: string): SpanContext | null {
  // Format: version-traceId-parentId-flags
  // Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
  const parts = header.split("-");
  if (parts.length !== 4) return null;

  const [version, traceId, spanId, flags] = parts;
  if (version !== "00") return null;
  if (traceId.length !== 32) return null;
  if (spanId.length !== 16) return null;

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
    isRemote: true,
  };
}

/**
 * Create traceparent header from span context
 */
export function createTraceparent(context: SpanContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, "0");
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Extract trace context from headers
 */
export function extractTraceContext(
  headers: Record<string, string | undefined>
): SpanContext | null {
  const traceparent = headers["traceparent"] || headers["Traceparent"];
  if (!traceparent) return null;

  return parseTraceparent(traceparent);
}

/**
 * Inject trace context into headers
 */
export function injectTraceContext(
  headers: Record<string, string>,
  span?: Span
): Record<string, string> {
  const activeSpan = span ?? getActiveSpan();
  if (!activeSpan) return headers;

  const context = activeSpan.spanContext();
  return {
    ...headers,
    traceparent: createTraceparent(context),
    ...(context.traceState && { tracestate: context.traceState }),
  };
}

/**
 * Run a function within a trace context
 */
export function withContext<T>(context: TracingContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

/**
 * Run an async function within a trace context
 */
export async function withContextAsync<T>(
  context: TracingContext,
  fn: () => Promise<T>
): Promise<T> {
  return contextStorage.run(context, fn);
}

/**
 * Batch export interval handle
 */
let batchExportInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start batch export to OTLP endpoint
 */
function startBatchExport(endpoint: string, intervalMs: number = 5000): void {
  if (batchExportInterval) {
    clearInterval(batchExportInterval);
  }

  batchExportInterval = setInterval(async () => {
    if (spanExportQueue.length === 0) return;

    const batch = spanExportQueue.splice(0, 100); // Export up to 100 spans at a time
    const logger = getLogger();

    try {
      // Convert to OTLP format and send
      // This is a simplified version - actual OTLP would use protobuf
      const response = await fetch(`${endpoint}/v1/traces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: batch[0]?.resource || {},
              },
              scopeSpans: [
                {
                  scope: {
                    name: "pull-tracer",
                  },
                  spans: batch.map((span) => ({
                    traceId: span.traceId,
                    spanId: span.spanId,
                    parentSpanId: span.parentSpanId,
                    name: span.name,
                    kind: span.kind,
                    startTimeUnixNano: Math.floor(span.startTime * 1000000),
                    endTimeUnixNano: Math.floor(span.endTime * 1000000),
                    attributes: Object.entries(span.attributes).map(([key, value]) => ({
                      key,
                      value: { stringValue: String(value) },
                    })),
                    status: span.status,
                    events: span.events.map((event) => ({
                      name: event.name,
                      timeUnixNano: Math.floor((event.timestamp || 0) * 1000000),
                      attributes: event.attributes
                        ? Object.entries(event.attributes).map(([key, value]) => ({
                            key,
                            value: { stringValue: String(value) },
                          }))
                        : [],
                    })),
                  })),
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        logger.warn("Failed to export spans", {
          statusCode: response.status,
          spanCount: batch.length,
        });
        // Re-queue failed spans
        spanExportQueue.unshift(...batch);
      }
    } catch (error) {
      logger.warn("Error exporting spans", {
        error: error instanceof Error ? error.message : String(error),
        spanCount: batch.length,
      });
      // Re-queue failed spans
      spanExportQueue.unshift(...batch);
    }
  }, intervalMs);
}

/**
 * Stop batch export
 */
export function stopBatchExport(): void {
  if (batchExportInterval) {
    clearInterval(batchExportInterval);
    batchExportInterval = null;
  }
}

/**
 * Flush pending spans
 */
export async function flushSpans(): Promise<void> {
  // Wait for export interval to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Shutdown tracer provider
 */
export async function shutdownTracer(): Promise<void> {
  stopBatchExport();
  await flushSpans();
  tracerProvider = null;
}
