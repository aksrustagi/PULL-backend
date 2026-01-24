/**
 * Observability Utilities for Temporal Workflows
 * Provides structured logging, metrics, and tracing support
 */

import { workflowInfo } from "@temporalio/workflow";

// ============================================================================
// Log Levels
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

// ============================================================================
// Structured Log Entry
// ============================================================================

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workflowId: string;
  workflowType: string;
  runId: string;
  taskQueue: string;
  message: string;
  context?: Record<string, unknown>;
  duration?: number;
  step?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ============================================================================
// Workflow Logger
// ============================================================================

/**
 * Create a structured logger for a workflow
 * Automatically includes workflow context in all log entries
 */
export function createWorkflowLogger(additionalContext?: Record<string, unknown>) {
  const info = workflowInfo();

  const baseContext = {
    workflowId: info.workflowId,
    workflowType: info.workflowType,
    runId: info.runId,
    taskQueue: info.taskQueue,
    ...additionalContext,
  };

  const log = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...baseContext,
      message,
      context,
    };

    // In Temporal workflows, we use console.log which gets captured
    // The actual logging infrastructure should parse this JSON
    console.log(JSON.stringify(entry));
  };

  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      log("debug", message, context),

    info: (message: string, context?: Record<string, unknown>) =>
      log("info", message, context),

    warn: (message: string, context?: Record<string, unknown>) =>
      log("warn", message, context),

    error: (message: string, error?: Error, context?: Record<string, unknown>) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        ...baseContext,
        message,
        context,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      };
      console.log(JSON.stringify(entry));
    },

    /**
     * Log the start of a step
     */
    stepStart: (step: string, context?: Record<string, unknown>) =>
      log("info", `Step started: ${step}`, { step, ...context }),

    /**
     * Log the completion of a step
     */
    stepComplete: (step: string, duration: number, context?: Record<string, unknown>) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        ...baseContext,
        message: `Step completed: ${step}`,
        step,
        duration,
        context,
      };
      console.log(JSON.stringify(entry));
    },

    /**
     * Log the failure of a step
     */
    stepFailed: (step: string, error: Error, context?: Record<string, unknown>) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        ...baseContext,
        message: `Step failed: ${step}`,
        step,
        context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      };
      console.log(JSON.stringify(entry));
    },
  };
}

// ============================================================================
// Step Timer
// ============================================================================

/**
 * Create a timer for measuring step duration
 */
export function createStepTimer() {
  let startTime: number;

  return {
    start: () => {
      startTime = Date.now();
    },

    stop: (): number => {
      return Date.now() - startTime;
    },

    elapsed: (): number => {
      return Date.now() - startTime;
    },
  };
}

/**
 * Execute a step with automatic timing and logging
 */
export async function timedStep<T>(
  logger: ReturnType<typeof createWorkflowLogger>,
  stepName: string,
  execute: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const timer = createStepTimer();
  timer.start();

  logger.stepStart(stepName, context);

  try {
    const result = await execute();
    const duration = timer.stop();
    logger.stepComplete(stepName, duration, context);
    return result;
  } catch (error) {
    const duration = timer.stop();
    if (error instanceof Error) {
      logger.stepFailed(stepName, error, { ...context, duration });
    }
    throw error;
  }
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface MetricEvent {
  type: "counter" | "gauge" | "histogram";
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

// ============================================================================
// Metrics Emitter
// ============================================================================

/**
 * Create a metrics emitter for a workflow
 * Emits metric events that can be collected by the worker
 */
export function createMetricsEmitter() {
  const info = workflowInfo();

  const baseLabels = {
    workflow_type: info.workflowType,
    task_queue: info.taskQueue,
  };

  const emit = (event: MetricEvent): void => {
    // Emit as structured log that can be parsed by metrics collector
    console.log(
      JSON.stringify({
        _type: "metric",
        ...event,
      })
    );
  };

  return {
    /**
     * Increment a counter metric
     */
    counter: (name: string, value = 1, labels?: Record<string, string>) => {
      emit({
        type: "counter",
        name: `workflow_${name}_total`,
        value,
        labels: { ...baseLabels, ...labels },
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Set a gauge metric
     */
    gauge: (name: string, value: number, labels?: Record<string, string>) => {
      emit({
        type: "gauge",
        name: `workflow_${name}`,
        value,
        labels: { ...baseLabels, ...labels },
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Record a histogram value (for durations, sizes, etc.)
     */
    histogram: (name: string, value: number, labels?: Record<string, string>) => {
      emit({
        type: "histogram",
        name: `workflow_${name}`,
        value,
        labels: { ...baseLabels, ...labels },
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Record workflow completion
     */
    workflowCompleted: (status: "success" | "failure" | "cancelled", duration: number) => {
      emit({
        type: "counter",
        name: "workflow_completions_total",
        value: 1,
        labels: { ...baseLabels, status },
        timestamp: new Date().toISOString(),
      });

      emit({
        type: "histogram",
        name: "workflow_duration_seconds",
        value: duration / 1000,
        labels: { ...baseLabels, status },
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Record step completion
     */
    stepCompleted: (step: string, status: "success" | "failure", duration: number) => {
      emit({
        type: "counter",
        name: "workflow_step_completions_total",
        value: 1,
        labels: { ...baseLabels, step, status },
        timestamp: new Date().toISOString(),
      });

      emit({
        type: "histogram",
        name: "workflow_step_duration_seconds",
        value: duration / 1000,
        labels: { ...baseLabels, step },
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Record external API call
     */
    apiCall: (service: string, status: "success" | "failure", duration: number) => {
      emit({
        type: "counter",
        name: "workflow_api_calls_total",
        value: 1,
        labels: { ...baseLabels, service, status },
        timestamp: new Date().toISOString(),
      });

      emit({
        type: "histogram",
        name: "workflow_api_call_duration_seconds",
        value: duration / 1000,
        labels: { ...baseLabels, service },
        timestamp: new Date().toISOString(),
      });
    },
  };
}

// ============================================================================
// Trace Context
// ============================================================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Generate a trace context for distributed tracing
 */
export function generateTraceContext(parentSpanId?: string): TraceContext {
  const info = workflowInfo();

  return {
    // Use workflow ID as trace ID for correlation
    traceId: info.workflowId,
    // Generate a unique span ID
    spanId: `span_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    parentSpanId,
  };
}

// ============================================================================
// Workflow Status Tracking
// ============================================================================

export interface WorkflowStatusTracker<T> {
  status: T;
  history: Array<{
    status: T;
    timestamp: string;
    duration?: number;
  }>;
  startTime: number;
}

/**
 * Create a status tracker for a workflow
 */
export function createStatusTracker<T extends string>(
  initialStatus: T
): WorkflowStatusTracker<T> & {
  update: (newStatus: T) => void;
  getDuration: () => number;
  getHistory: () => Array<{ status: T; timestamp: string; duration?: number }>;
} {
  const tracker: WorkflowStatusTracker<T> = {
    status: initialStatus,
    history: [
      {
        status: initialStatus,
        timestamp: new Date().toISOString(),
      },
    ],
    startTime: Date.now(),
  };

  let lastUpdateTime = tracker.startTime;

  return {
    ...tracker,

    update: (newStatus: T) => {
      const now = Date.now();
      const duration = now - lastUpdateTime;

      // Update the duration of the previous status
      if (tracker.history.length > 0) {
        tracker.history[tracker.history.length - 1].duration = duration;
      }

      tracker.status = newStatus;
      tracker.history.push({
        status: newStatus,
        timestamp: new Date().toISOString(),
      });

      lastUpdateTime = now;
    },

    getDuration: () => Date.now() - tracker.startTime,

    getHistory: () => tracker.history,
  };
}
