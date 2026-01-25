/**
 * Metrics Service
 *
 * Prometheus-compatible metrics for monitoring HTTP requests,
 * application performance, and business events.
 *
 * @example
 * ```typescript
 * import {
 *   getRegistry,
 *   createMetricsMiddleware,
 *   createMetricsHandler,
 *   getHttpMetrics,
 *   getBusinessMetrics,
 *   recordTradeExecution,
 * } from '@pull/core/services/metrics';
 *
 * const app = new Hono();
 *
 * // Add metrics middleware
 * app.use('*', createMetricsMiddleware({
 *   excludePaths: ['/health', '/metrics'],
 * }));
 *
 * // Expose metrics endpoint
 * app.get('/metrics', createMetricsHandler());
 *
 * // Record business events
 * recordTradeExecution('predictions', 'buy', 'success', 100);
 *
 * // Access metrics directly
 * const httpMetrics = getHttpMetrics();
 * httpMetrics.requestsTotal.inc({ method: 'GET', path: '/api/v1/users', status: '200' });
 * ```
 */

// Registry
export {
  getRegistry,
  createRegistry,
  resetRegistry,
} from "./prometheus";

// Metrics
export {
  createHttpMetrics,
  createAppMetrics,
  createBusinessMetrics,
  createMetricsMiddleware,
  createMetricsHandler,
  getHttpMetrics,
  getAppMetrics,
  getBusinessMetrics,
  updateUptimeMetric,
  startUptimeUpdates,
  recordUserRegistration,
  recordUserLogin,
  recordTradeExecution,
  recordKycVerification,
  recordApiCall,
} from "./metrics";

export type {
  HttpMetrics,
  AppMetrics,
  BusinessMetrics,
} from "./metrics";

// Types
export type {
  MetricType,
  Labels,
  Counter,
  Gauge,
  Histogram,
  Summary,
  HistogramData,
  SummaryData,
  MetricConfig,
  MetricsRegistry,
  MetricValue,
  HttpMetricsConfig,
} from "./types";

export {
  DEFAULT_HTTP_DURATION_BUCKETS,
  DEFAULT_SIZE_BUCKETS,
  DEFAULT_PATH_NORMALIZERS,
} from "./types";
