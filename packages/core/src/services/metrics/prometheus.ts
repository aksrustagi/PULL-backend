/**
 * Prometheus Metrics Implementation
 *
 * Lightweight Prometheus-compatible metrics implementation.
 * Can be replaced with prom-client for production if needed.
 */

import type {
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricConfig,
  MetricsRegistry,
  MetricValue,
  Labels,
  HistogramData,
  SummaryData,
} from "./types";

/**
 * Serialize labels to a string key
 */
function labelsToKey(labels: Labels): string {
  if (Object.keys(labels).length === 0) return "";
  const sortedKeys = Object.keys(labels).sort();
  return sortedKeys.map((k) => `${k}="${labels[k]}"`).join(",");
}

/**
 * Format labels for Prometheus output
 */
function formatLabels(labels: Labels): string {
  if (Object.keys(labels).length === 0) return "";
  const pairs = Object.entries(labels)
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(",");
  return `{${pairs}}`;
}

/**
 * Escape label value for Prometheus format
 */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Counter implementation
 */
class PrometheusCounter implements Counter {
  private values: Map<string, number> = new Map();
  private config: MetricConfig;

  constructor(config: MetricConfig) {
    this.config = config;
  }

  inc(labelsOrValue?: Labels | number, labelsArg?: Labels): void {
    let value = 1;
    let labels: Labels = {};

    if (typeof labelsOrValue === "number") {
      value = labelsOrValue;
      labels = labelsArg || {};
    } else if (labelsOrValue) {
      labels = labelsOrValue;
    }

    if (value < 0) {
      throw new Error("Counter can only increase");
    }

    const key = labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelsToKey(labels)) || 0;
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.values.delete(labelsToKey(labels));
    } else {
      this.values.clear();
    }
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.config.name} ${this.config.help}`);
    lines.push(`# TYPE ${this.config.name} counter`);

    if (this.values.size === 0) {
      lines.push(`${this.config.name} 0`);
    } else {
      for (const [key, value] of this.values) {
        const labelStr = key ? `{${key}}` : "";
        lines.push(`${this.config.name}${labelStr} ${value}`);
      }
    }

    return lines.join("\n");
  }

  toJSON(): MetricValue {
    const values: MetricValue["values"] = [];

    for (const [key, value] of this.values) {
      const labels: Labels = {};
      if (key) {
        const pairs = key.split(",");
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          labels[k] = v.replace(/"/g, "");
        }
      }
      values.push({ labels, value });
    }

    if (values.length === 0) {
      values.push({ labels: {}, value: 0 });
    }

    return {
      name: this.config.name,
      help: this.config.help,
      type: "counter",
      values,
    };
  }
}

/**
 * Gauge implementation
 */
class PrometheusGauge implements Gauge {
  private values: Map<string, number> = new Map();
  private config: MetricConfig;

  constructor(config: MetricConfig) {
    this.config = config;
  }

  set(value: number, labels: Labels = {}): void {
    this.values.set(labelsToKey(labels), value);
  }

  inc(labelsOrValue?: Labels | number, labelsArg?: Labels): void {
    let value = 1;
    let labels: Labels = {};

    if (typeof labelsOrValue === "number") {
      value = labelsOrValue;
      labels = labelsArg || {};
    } else if (labelsOrValue) {
      labels = labelsOrValue;
    }

    const key = labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  dec(labelsOrValue?: Labels | number, labelsArg?: Labels): void {
    let value = 1;
    let labels: Labels = {};

    if (typeof labelsOrValue === "number") {
      value = labelsOrValue;
      labels = labelsArg || {};
    } else if (labelsOrValue) {
      labels = labelsOrValue;
    }

    const key = labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - value);
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelsToKey(labels)) || 0;
  }

  setToCurrentTime(labels: Labels = {}): void {
    this.set(Date.now() / 1000, labels);
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.config.name} ${this.config.help}`);
    lines.push(`# TYPE ${this.config.name} gauge`);

    if (this.values.size === 0) {
      lines.push(`${this.config.name} 0`);
    } else {
      for (const [key, value] of this.values) {
        const labelStr = key ? `{${key}}` : "";
        lines.push(`${this.config.name}${labelStr} ${value}`);
      }
    }

    return lines.join("\n");
  }

  toJSON(): MetricValue {
    const values: MetricValue["values"] = [];

    for (const [key, value] of this.values) {
      const labels: Labels = {};
      if (key) {
        const pairs = key.split(",");
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          labels[k] = v.replace(/"/g, "");
        }
      }
      values.push({ labels, value });
    }

    if (values.length === 0) {
      values.push({ labels: {}, value: 0 });
    }

    return {
      name: this.config.name,
      help: this.config.help,
      type: "gauge",
      values,
    };
  }
}

/**
 * Histogram implementation
 */
class PrometheusHistogram implements Histogram {
  private data: Map<string, { sum: number; count: number; buckets: Map<number, number> }> = new Map();
  private config: MetricConfig;
  private buckets: number[];

  constructor(config: MetricConfig) {
    this.config = config;
    this.buckets = config.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.buckets.sort((a, b) => a - b);
  }

  private getOrCreate(key: string) {
    let data = this.data.get(key);
    if (!data) {
      data = {
        sum: 0,
        count: 0,
        buckets: new Map(this.buckets.map((b) => [b, 0])),
      };
      this.data.set(key, data);
    }
    return data;
  }

  observe(value: number, labels: Labels = {}): void {
    const key = labelsToKey(labels);
    const data = this.getOrCreate(key);

    data.sum += value;
    data.count += 1;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  startTimer(labels: Labels = {}): () => number {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observe(duration, labels);
      return duration;
    };
  }

  get(labels: Labels = {}): HistogramData {
    const key = labelsToKey(labels);
    const data = this.data.get(key);

    if (!data) {
      return {
        sum: 0,
        count: 0,
        buckets: new Map(this.buckets.map((b) => [b, 0])),
      };
    }

    return { ...data };
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.data.delete(labelsToKey(labels));
    } else {
      this.data.clear();
    }
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.config.name} ${this.config.help}`);
    lines.push(`# TYPE ${this.config.name} histogram`);

    if (this.data.size === 0) {
      // Output empty histogram
      for (const bucket of this.buckets) {
        lines.push(`${this.config.name}_bucket{le="${bucket}"} 0`);
      }
      lines.push(`${this.config.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.config.name}_sum 0`);
      lines.push(`${this.config.name}_count 0`);
    } else {
      for (const [key, data] of this.data) {
        const baseLabels = key ? `${key},` : "";
        let cumulative = 0;

        for (const bucket of this.buckets) {
          cumulative += data.buckets.get(bucket) || 0;
          lines.push(`${this.config.name}_bucket{${baseLabels}le="${bucket}"} ${cumulative}`);
        }
        lines.push(`${this.config.name}_bucket{${baseLabels}le="+Inf"} ${data.count}`);
        lines.push(`${this.config.name}_sum${key ? `{${key}}` : ""} ${data.sum}`);
        lines.push(`${this.config.name}_count${key ? `{${key}}` : ""} ${data.count}`);
      }
    }

    return lines.join("\n");
  }

  toJSON(): MetricValue {
    const values: MetricValue["values"] = [];

    for (const [key, data] of this.data) {
      const labels: Labels = {};
      if (key) {
        const pairs = key.split(",");
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          labels[k] = v.replace(/"/g, "");
        }
      }

      // Add bucket values
      let cumulative = 0;
      for (const bucket of this.buckets) {
        cumulative += data.buckets.get(bucket) || 0;
        values.push({
          labels: { ...labels, le: String(bucket) },
          value: cumulative,
        });
      }
      values.push({
        labels: { ...labels, le: "+Inf" },
        value: data.count,
      });
    }

    return {
      name: this.config.name,
      help: this.config.help,
      type: "histogram",
      values,
    };
  }
}

/**
 * Summary implementation (simplified - uses reservoir sampling)
 */
class PrometheusSummary implements Summary {
  private data: Map<string, { sum: number; count: number; values: number[] }> = new Map();
  private config: MetricConfig;
  private percentiles: number[];
  private maxSize: number = 1000;

  constructor(config: MetricConfig) {
    this.config = config;
    this.percentiles = config.percentiles || [0.5, 0.9, 0.95, 0.99];
  }

  private getOrCreate(key: string) {
    let data = this.data.get(key);
    if (!data) {
      data = { sum: 0, count: 0, values: [] };
      this.data.set(key, data);
    }
    return data;
  }

  observe(value: number, labels: Labels = {}): void {
    const key = labelsToKey(labels);
    const data = this.getOrCreate(key);

    data.sum += value;
    data.count += 1;

    // Reservoir sampling for memory efficiency
    if (data.values.length < this.maxSize) {
      data.values.push(value);
    } else {
      const idx = Math.floor(Math.random() * data.count);
      if (idx < this.maxSize) {
        data.values[idx] = value;
      }
    }
  }

  startTimer(labels: Labels = {}): () => number {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000;
      this.observe(duration, labels);
      return duration;
    };
  }

  get(labels: Labels = {}): SummaryData {
    const key = labelsToKey(labels);
    const data = this.data.get(key);

    if (!data) {
      return {
        sum: 0,
        count: 0,
        quantiles: new Map(this.percentiles.map((p) => [p, 0])),
      };
    }

    // Calculate quantiles
    const sorted = [...data.values].sort((a, b) => a - b);
    const quantiles = new Map<number, number>();

    for (const p of this.percentiles) {
      const idx = Math.ceil(p * sorted.length) - 1;
      quantiles.set(p, sorted[Math.max(0, idx)] || 0);
    }

    return {
      sum: data.sum,
      count: data.count,
      quantiles,
    };
  }

  reset(labels?: Labels): void {
    if (labels) {
      this.data.delete(labelsToKey(labels));
    } else {
      this.data.clear();
    }
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.config.name} ${this.config.help}`);
    lines.push(`# TYPE ${this.config.name} summary`);

    if (this.data.size === 0) {
      for (const p of this.percentiles) {
        lines.push(`${this.config.name}{quantile="${p}"} 0`);
      }
      lines.push(`${this.config.name}_sum 0`);
      lines.push(`${this.config.name}_count 0`);
    } else {
      for (const [key, data] of this.data) {
        const summaryData = this.get(key ? this.parseLabels(key) : {});
        const baseLabels = key ? `${key},` : "";

        for (const [p, value] of summaryData.quantiles) {
          lines.push(`${this.config.name}{${baseLabels}quantile="${p}"} ${value}`);
        }
        lines.push(`${this.config.name}_sum${key ? `{${key}}` : ""} ${data.sum}`);
        lines.push(`${this.config.name}_count${key ? `{${key}}` : ""} ${data.count}`);
      }
    }

    return lines.join("\n");
  }

  private parseLabels(key: string): Labels {
    const labels: Labels = {};
    if (key) {
      const pairs = key.split(",");
      for (const pair of pairs) {
        const [k, v] = pair.split("=");
        labels[k] = v.replace(/"/g, "");
      }
    }
    return labels;
  }

  toJSON(): MetricValue {
    const values: MetricValue["values"] = [];

    for (const [key] of this.data) {
      const labels = this.parseLabels(key);
      const summaryData = this.get(labels);

      for (const [p, value] of summaryData.quantiles) {
        values.push({
          labels: { ...labels, quantile: String(p) },
          value,
        });
      }
    }

    return {
      name: this.config.name,
      help: this.config.help,
      type: "summary",
      values,
    };
  }
}

/**
 * Metrics registry implementation
 */
class PrometheusRegistry implements MetricsRegistry {
  private counters: Map<string, PrometheusCounter> = new Map();
  private gauges: Map<string, PrometheusGauge> = new Map();
  private histograms: Map<string, PrometheusHistogram> = new Map();
  private summaries: Map<string, PrometheusSummary> = new Map();

  readonly contentType = "text/plain; version=0.0.4; charset=utf-8";

  createCounter(config: MetricConfig): Counter {
    const counter = new PrometheusCounter(config);
    this.counters.set(config.name, counter);
    return counter;
  }

  createGauge(config: MetricConfig): Gauge {
    const gauge = new PrometheusGauge(config);
    this.gauges.set(config.name, gauge);
    return gauge;
  }

  createHistogram(config: MetricConfig): Histogram {
    const histogram = new PrometheusHistogram(config);
    this.histograms.set(config.name, histogram);
    return histogram;
  }

  createSummary(config: MetricConfig): Summary {
    const summary = new PrometheusSummary(config);
    this.summaries.set(config.name, summary);
    return summary;
  }

  async metrics(): Promise<string> {
    const sections: string[] = [];

    for (const counter of this.counters.values()) {
      sections.push(counter.collect());
    }

    for (const gauge of this.gauges.values()) {
      sections.push(gauge.collect());
    }

    for (const histogram of this.histograms.values()) {
      sections.push(histogram.collect());
    }

    for (const summary of this.summaries.values()) {
      sections.push(summary.collect());
    }

    return sections.join("\n\n");
  }

  async getMetricsAsJSON(): Promise<MetricValue[]> {
    const metrics: MetricValue[] = [];

    for (const counter of this.counters.values()) {
      metrics.push(counter.toJSON());
    }

    for (const gauge of this.gauges.values()) {
      metrics.push(gauge.toJSON());
    }

    for (const histogram of this.histograms.values()) {
      metrics.push(histogram.toJSON());
    }

    for (const summary of this.summaries.values()) {
      metrics.push(summary.toJSON());
    }

    return metrics;
  }

  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }
}

/**
 * Default registry singleton
 */
let defaultRegistry: PrometheusRegistry | null = null;

/**
 * Get the default metrics registry
 */
export function getRegistry(): MetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PrometheusRegistry();
  }
  return defaultRegistry;
}

/**
 * Create a new metrics registry
 */
export function createRegistry(): MetricsRegistry {
  return new PrometheusRegistry();
}

/**
 * Reset the default registry
 */
export function resetRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.clear();
  }
  defaultRegistry = null;
}
