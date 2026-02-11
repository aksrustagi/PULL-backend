/**
 * BullMQ Recurring Job Scheduler
 *
 * Defines and manages all recurring (cron) jobs for the PULL platform.
 * Uses BullMQ's built-in repeatable job feature for reliable scheduling.
 *
 * Scheduled jobs:
 * - Balance reconciliation: every hour
 * - Stale order cleanup: every 15 minutes
 * - Analytics aggregation: every 5 minutes
 * - Session cleanup: daily at 3:00 AM UTC
 * - Expired token cleanup: every 30 minutes
 * - Old notification cleanup: daily at 4:00 AM UTC
 *
 * @example
 * ```typescript
 * import { registerAllScheduledJobs, removeAllScheduledJobs } from '@pull/core/services/bullmq';
 *
 * // Register all recurring jobs at application startup
 * await registerAllScheduledJobs();
 *
 * // Remove all recurring jobs during shutdown
 * await removeAllScheduledJobs();
 * ```
 */

import { getLogger } from "../logger";
import { QUEUE_NAMES } from "./types";
import {
  getReconciliationQueue,
  getCleanupQueue,
  getAnalyticsQueue,
} from "./queues";
import type {
  ReconciliationJobData,
  CleanupJobData,
  AnalyticsJobData,
  ScheduledJob,
} from "./types";

// ============================================================================
// Logger
// ============================================================================

const logger = getLogger();

// ============================================================================
// Scheduled Job Definitions
// ============================================================================

/**
 * All scheduled job definitions for the PULL platform.
 * Each job specifies a cron pattern, target queue, and default payload.
 */
export const SCHEDULED_JOBS: ScheduledJob[] = [
  // -------------------------------------------------------------------
  // Balance Reconciliation - Every hour
  // -------------------------------------------------------------------
  {
    name: "balance-reconciliation-hourly",
    queue: QUEUE_NAMES.RECONCILIATION,
    pattern: "0 * * * *", // Every hour at :00
    data: {
      type: "balance",
      startTime: "", // Computed at runtime
      endTime: "",   // Computed at runtime
      autoCorrect: false,
      autoCorrectThreshold: 100, // $1.00 in cents
      sources: ["tigerbeetle", "neondb"],
    } satisfies Partial<ReconciliationJobData>,
    options: {
      priority: 2,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 60000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Stale Order Cleanup - Every 15 minutes
  // -------------------------------------------------------------------
  {
    name: "stale-order-cleanup",
    queue: QUEUE_NAMES.CLEANUP,
    pattern: "*/15 * * * *", // Every 15 minutes
    data: {
      action: "stale_orders",
      olderThan: "PT4H", // 4 hours in ISO 8601 duration
      batchSize: 500,
      dryRun: false,
    } satisfies CleanupJobData,
    options: {
      priority: 3,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 30000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Analytics Aggregation - Every 5 minutes
  // -------------------------------------------------------------------
  {
    name: "analytics-aggregation-5m",
    queue: QUEUE_NAMES.ANALYTICS,
    pattern: "*/5 * * * *", // Every 5 minutes
    data: {
      action: "aggregate_trades",
      period: "5m",
      windowStart: "", // Computed at runtime
      windowEnd: "",   // Computed at runtime
    } satisfies Partial<AnalyticsJobData>,
    options: {
      priority: 4,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 15000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Session Cleanup - Daily at 3:00 AM UTC
  // -------------------------------------------------------------------
  {
    name: "session-cleanup-daily",
    queue: QUEUE_NAMES.CLEANUP,
    pattern: "0 3 * * *", // 3:00 AM UTC daily
    data: {
      action: "expired_sessions",
      olderThan: "P1D", // 1 day in ISO 8601 duration
      batchSize: 1000,
      dryRun: false,
    } satisfies CleanupJobData,
    options: {
      priority: 5,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 60000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Expired Token Cleanup - Every 30 minutes
  // -------------------------------------------------------------------
  {
    name: "expired-token-cleanup",
    queue: QUEUE_NAMES.CLEANUP,
    pattern: "*/30 * * * *", // Every 30 minutes
    data: {
      action: "expired_tokens",
      olderThan: "PT1H", // 1 hour in ISO 8601 duration
      batchSize: 2000,
      dryRun: false,
    } satisfies CleanupJobData,
    options: {
      priority: 5,
      attempts: 1,
    },
  },

  // -------------------------------------------------------------------
  // Old Notification Cleanup - Daily at 4:00 AM UTC
  // -------------------------------------------------------------------
  {
    name: "notification-cleanup-daily",
    queue: QUEUE_NAMES.CLEANUP,
    pattern: "0 4 * * *", // 4:00 AM UTC daily
    data: {
      action: "old_notifications",
      olderThan: "P30D", // 30 days in ISO 8601 duration
      batchSize: 5000,
      dryRun: false,
    } satisfies CleanupJobData,
    options: {
      priority: 5,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 60000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Trade Reconciliation - Every 6 hours
  // -------------------------------------------------------------------
  {
    name: "trade-reconciliation-6h",
    queue: QUEUE_NAMES.RECONCILIATION,
    pattern: "0 */6 * * *", // Every 6 hours
    data: {
      type: "trade",
      startTime: "", // Computed at runtime
      endTime: "",   // Computed at runtime
      autoCorrect: false,
      sources: ["kalshi", "neondb"],
    } satisfies Partial<ReconciliationJobData>,
    options: {
      priority: 2,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 120000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Hourly Revenue Aggregation
  // -------------------------------------------------------------------
  {
    name: "revenue-aggregation-hourly",
    queue: QUEUE_NAMES.ANALYTICS,
    pattern: "5 * * * *", // 5 minutes past each hour
    data: {
      action: "aggregate_revenue",
      period: "1h",
      windowStart: "", // Computed at runtime
      windowEnd: "",   // Computed at runtime
    } satisfies Partial<AnalyticsJobData>,
    options: {
      priority: 3,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 30000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Leaderboard Computation - Every 15 minutes
  // -------------------------------------------------------------------
  {
    name: "leaderboard-computation",
    queue: QUEUE_NAMES.ANALYTICS,
    pattern: "*/15 * * * *", // Every 15 minutes
    data: {
      action: "compute_leaderboard",
      period: "15m",
      windowStart: "",
      windowEnd: "",
    } satisfies Partial<AnalyticsJobData>,
    options: {
      priority: 4,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 15000,
      },
    },
  },

  // -------------------------------------------------------------------
  // Audit Log Archival - Daily at 2:00 AM UTC
  // -------------------------------------------------------------------
  {
    name: "audit-log-archival-daily",
    queue: QUEUE_NAMES.CLEANUP,
    pattern: "0 2 * * *", // 2:00 AM UTC daily
    data: {
      action: "old_audit_logs",
      olderThan: "P90D", // 90 days in ISO 8601 duration
      batchSize: 10000,
      dryRun: false,
    } satisfies CleanupJobData,
    options: {
      priority: 5,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 120000,
      },
    },
  },
];

// ============================================================================
// Scheduler Registration
// ============================================================================

/**
 * Compute time window parameters for jobs that need them.
 * Returns enriched data with startTime/endTime populated.
 */
function enrichJobData(job: ScheduledJob): Record<string, unknown> {
  const now = new Date();
  const data = { ...job.data };

  // Set time windows based on the schedule pattern
  if ("startTime" in data && data.startTime === "") {
    // Determine window size based on pattern frequency
    let windowMs: number;
    if (job.pattern.startsWith("*/5")) {
      windowMs = 5 * 60 * 1000; // 5 minutes
    } else if (job.pattern.startsWith("*/15")) {
      windowMs = 15 * 60 * 1000; // 15 minutes
    } else if (job.pattern.startsWith("*/30")) {
      windowMs = 30 * 60 * 1000; // 30 minutes
    } else if (job.pattern.includes("*/6")) {
      windowMs = 6 * 60 * 60 * 1000; // 6 hours
    } else if (job.pattern.startsWith("0 ") && job.pattern.split(" ").length === 5) {
      // Hourly or daily
      const parts = job.pattern.split(" ");
      if (parts[1] === "*") {
        windowMs = 60 * 60 * 1000; // 1 hour
      } else {
        windowMs = 24 * 60 * 60 * 1000; // 1 day
      }
    } else {
      windowMs = 60 * 60 * 1000; // Default: 1 hour
    }

    data.endTime = now.toISOString();
    data.startTime = new Date(now.getTime() - windowMs).toISOString();
  }

  return data;
}

/**
 * Register a single scheduled job with its target queue.
 */
async function registerScheduledJob(job: ScheduledJob): Promise<void> {
  let queue;

  switch (job.queue) {
    case QUEUE_NAMES.RECONCILIATION:
      queue = getReconciliationQueue();
      break;
    case QUEUE_NAMES.CLEANUP:
      queue = getCleanupQueue();
      break;
    case QUEUE_NAMES.ANALYTICS:
      queue = getAnalyticsQueue();
      break;
    default:
      throw new Error(`Unsupported queue for scheduled jobs: ${job.queue}`);
  }

  const enrichedData = enrichJobData(job);

  await queue.add(job.name, enrichedData as never, {
    repeat: {
      pattern: job.pattern,
    },
    jobId: job.name, // Ensure only one instance of each scheduled job
    priority: job.options?.priority,
    attempts: job.options?.attempts,
    backoff: job.options?.backoff,
  });

  logger.info("Scheduled job registered", {
    service: "bullmq-scheduler",
    name: job.name,
    queue: job.queue,
    pattern: job.pattern,
  });
}

/**
 * Register all scheduled jobs.
 * Safe to call multiple times; BullMQ deduplicates repeatable jobs by name.
 */
export async function registerAllScheduledJobs(): Promise<void> {
  logger.info("Registering all scheduled jobs", {
    service: "bullmq-scheduler",
    count: SCHEDULED_JOBS.length,
  });

  const results = await Promise.allSettled(
    SCHEDULED_JOBS.map((job) => registerScheduledJob(job))
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    logger.error("Some scheduled jobs failed to register", {
      service: "bullmq-scheduler",
      failedCount: failed.length,
      totalCount: SCHEDULED_JOBS.length,
      errors: failed.map((r) =>
        r.status === "rejected" ? (r.reason as Error).message : ""
      ),
    });
  }

  logger.info("Scheduled jobs registration complete", {
    service: "bullmq-scheduler",
    registered: results.filter((r) => r.status === "fulfilled").length,
    failed: failed.length,
  });
}

/**
 * Remove all scheduled (repeatable) jobs from all queues.
 * Useful during shutdown or when schedule configuration changes.
 */
export async function removeAllScheduledJobs(): Promise<void> {
  logger.info("Removing all scheduled jobs", {
    service: "bullmq-scheduler",
  });

  const queues = [
    getReconciliationQueue(),
    getCleanupQueue(),
    getAnalyticsQueue(),
  ];

  for (const queue of queues) {
    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key);
        logger.debug("Removed repeatable job", {
          service: "bullmq-scheduler",
          name: job.name,
          key: job.key,
        });
      }
    } catch (error) {
      logger.error("Failed to remove repeatable jobs from queue", {
        service: "bullmq-scheduler",
        queue: queue.name,
        error,
      });
    }
  }

  logger.info("All scheduled jobs removed", {
    service: "bullmq-scheduler",
  });
}

/**
 * List all currently registered repeatable jobs across all queues.
 */
export async function listScheduledJobs(): Promise<
  Array<{ queue: string; name: string | undefined; pattern: string | undefined; next: number | undefined }>
> {
  const queues = [
    getReconciliationQueue(),
    getCleanupQueue(),
    getAnalyticsQueue(),
  ];

  const allJobs: Array<{
    queue: string;
    name: string | undefined;
    pattern: string | undefined;
    next: number | undefined;
  }> = [];

  for (const queue of queues) {
    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        allJobs.push({
          queue: queue.name,
          name: job.name,
          pattern: job.pattern,
          next: job.next,
        });
      }
    } catch (error) {
      logger.error("Failed to list repeatable jobs", {
        service: "bullmq-scheduler",
        queue: queue.name,
        error,
      });
    }
  }

  return allJobs;
}

/**
 * Trigger a scheduled job immediately (outside its normal schedule).
 * Useful for manual re-runs or testing.
 */
export async function triggerScheduledJob(jobName: string): Promise<void> {
  const job = SCHEDULED_JOBS.find((j) => j.name === jobName);
  if (!job) {
    throw new Error(`Scheduled job not found: ${jobName}`);
  }

  let queue;
  switch (job.queue) {
    case QUEUE_NAMES.RECONCILIATION:
      queue = getReconciliationQueue();
      break;
    case QUEUE_NAMES.CLEANUP:
      queue = getCleanupQueue();
      break;
    case QUEUE_NAMES.ANALYTICS:
      queue = getAnalyticsQueue();
      break;
    default:
      throw new Error(`Unsupported queue: ${job.queue}`);
  }

  const enrichedData = enrichJobData(job);

  await queue.add(`${job.name}-manual`, enrichedData as never, {
    priority: job.options?.priority ?? 1,
    attempts: job.options?.attempts,
    backoff: job.options?.backoff,
  });

  logger.info("Scheduled job triggered manually", {
    service: "bullmq-scheduler",
    name: jobName,
    queue: job.queue,
  });
}
