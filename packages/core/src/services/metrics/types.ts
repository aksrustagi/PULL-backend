/**
 * Metrics Types
 *
 * Type definitions for the metrics and monitoring system.
 */

/**
 * Metric types supported
 */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/**
 * Label set for metrics
 */
export type Labels = Record<string, string>;

/**
 * Counter metric interface
 */
export interface Counter {
  /** Increment counter by 1 */
  inc(labels?: Labels): void;
  /** Increment counter by given value */
  inc(value: number, labels?: Labels): void;
  /** Get current value */
  get(labels?: Labels): number;
  /** Reset counter */
  reset(labels?: Labels): void;
}

/**
 * Gauge metric interface
 */
export interface Gauge {
  /** Set gauge to value */
  set(value: number, labels?: Labels): void;
  /** Increment gauge by 1 */
  inc(labels?: Labels): void;
  /** Increment gauge by value */
  inc(value: number, labels?: Labels): void;
  /** Decrement gauge by 1 */
  dec(labels?: Labels): void;
  /** Decrement gauge by value */
  dec(value: number, labels?: Labels): void;
  /** Get current value */
  get(labels?: Labels): number;
  /** Set to current timestamp */
  setToCurrentTime(labels?: Labels): void;
}

/**
 * Histogram metric interface
 */
export interface Histogram {
  /** Observe a value */
  observe(value: number, labels?: Labels): void;
  /** Start a timer and return a function to stop it */
  startTimer(labels?: Labels): () => number;
  /** Get histogram data */
  get(labels?: Labels): HistogramData;
  /** Reset histogram */
  reset(labels?: Labels): void;
}

/**
 * Histogram data structure
 */
export interface HistogramData {
  sum: number;
  count: number;
  buckets: Map<number, number>;
}

/**
 * Summary metric interface
 */
export interface Summary {
  /** Observe a value */
  observe(value: number, labels?: Labels): void;
  /** Start a timer and return a function to stop it */
  startTimer(labels?: Labels): () => number;
  /** Get summary data */
  get(labels?: Labels): SummaryData;
  /** Reset summary */
  reset(labels?: Labels): void;
}

/**
 * Summary data structure
 */
export interface SummaryData {
  sum: number;
  count: number;
  quantiles: Map<number, number>;
}

/**
 * Metric configuration
 */
export interface MetricConfig {
  /** Metric name */
  name: string;
  /** Metric description */
  help: string;
  /** Label names */
  labelNames?: string[];
  /** Histogram buckets (for histograms only) */
  buckets?: number[];
  /** Summary quantiles (for summaries only) */
  percentiles?: number[];
  /** Max age for summary observations (ms) */
  maxAgeSeconds?: number;
}

/**
 * Metrics registry interface
 */
export interface MetricsRegistry {
  /** Create a counter metric */
  createCounter(config: MetricConfig): Counter;
  /** Create a gauge metric */
  createGauge(config: MetricConfig): Gauge;
  /** Create a histogram metric */
  createHistogram(config: MetricConfig): Histogram;
  /** Create a summary metric */
  createSummary(config: MetricConfig): Summary;
  /** Get metrics in Prometheus format */
  metrics(): Promise<string>;
  /** Get metrics as JSON */
  getMetricsAsJSON(): Promise<MetricValue[]>;
  /** Clear all metrics */
  clear(): void;
  /** Get content type for Prometheus */
  contentType: string;
}

/**
 * Metric value for JSON export
 */
export interface MetricValue {
  name: string;
  help: string;
  type: MetricType;
  values: Array<{
    labels: Labels;
    value: number;
    timestamp?: number;
  }>;
}

/**
 * HTTP metrics configuration
 */
export interface HttpMetricsConfig {
  /** Histogram buckets for request duration */
  durationBuckets?: number[];
  /** Histogram buckets for request size */
  requestSizeBuckets?: number[];
  /** Histogram buckets for response size */
  responseSizeBuckets?: number[];
  /** Whether to include path in labels (can cause high cardinality) */
  includePathLabel?: boolean;
  /** Paths to normalize (e.g., /users/123 -> /users/:id) */
  pathNormalizers?: Array<{
    pattern: RegExp;
    replacement: string;
  }>;
  /** Paths to exclude from metrics */
  excludePaths?: string[];
}

/**
 * Default histogram buckets for HTTP request duration (seconds)
 */
export const DEFAULT_HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Default histogram buckets for request/response size (bytes)
 */
export const DEFAULT_SIZE_BUCKETS = [
  100, 1000, 10000, 100000, 1000000, 10000000,
];

/**
 * Common path normalizers for REST APIs
 */
export const DEFAULT_PATH_NORMALIZERS = [
  { pattern: /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: "/:id" },
  { pattern: /\/\d+/g, replacement: "/:id" },
];
