/**
 * BullMQ Worker Definitions
 *
 * Worker factory functions for processing jobs from each queue.
 * Each worker handles a specific job type with appropriate concurrency,
 * rate limiting, and error handling.
 *
 * @example
 * ```typescript
 * import { createEmailWorker } from '@pull/core/services/bullmq';
 *
 * const emailWorker = createEmailWorker(async (job) => {
 *   const { to, subject, template, templateData } = job.data;
 *   const result = await sendEmail({ to, subject, template, templateData });
 *   return { messageId: result.id, accepted: [to], rejected: [], sentAt: new Date().toISOString() };
 * });
 *
 * // Graceful shutdown
 * process.on('SIGTERM', () => emailWorker.close());
 * ```
 */

import { Worker, type WorkerOptions, type Job } from "bullmq";
import { getLogger } from "../logger";
import { QUEUE_NAMES } from "./types";
import type {
  EmailJobData,
  EmailJobResult,
  NotificationJobData,
  NotificationJobResult,
  SettlementJobData,
  SettlementJobResult,
  ReconciliationJobData,
  ReconciliationJobResult,
  AnalyticsJobData,
  AnalyticsJobResult,
  CleanupJobData,
  CleanupJobResult,
  WorkerConfig,
  RedisConnectionConfig,
} from "./types";

// ============================================================================
// Shared Utilities
// ============================================================================

const logger = getLogger();

/** Registry of all active workers for graceful shutdown */
const workerRegistry: Worker[] = [];

/** Global Redis config, shared with queues module */
let globalRedisConfig: RedisConnectionConfig | undefined;

/**
 * Set the Redis connection config for workers.
 * Usually called by initBullMQ in queues.ts.
 */
export function setWorkerRedisConfig(config: RedisConnectionConfig): void {
  globalRedisConfig = config;
}

/** Build Redis connection options from config or environment */
function getRedisConnection(): WorkerOptions["connection"] {
  if (globalRedisConfig?.host) {
    return {
      host: globalRedisConfig.host,
      port: globalRedisConfig.port ?? 6379,
      password: globalRedisConfig.password,
      tls: globalRedisConfig.tls ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  const redisUrl =
    globalRedisConfig?.url ?? process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password || undefined,
        tls: parsed.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      logger.error("Failed to parse Redis URL for BullMQ workers", {
        service: "bullmq-worker",
      });
    }
  }

  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Attach standard event handlers to a worker for logging and monitoring.
 */
function attachWorkerEvents<TData, TResult>(
  worker: Worker<TData, TResult>,
  queueName: string
): void {
  worker.on("completed", (job: Job<TData, TResult> | undefined) => {
    if (job) {
      logger.debug("Job completed", {
        service: "bullmq-worker",
        queue: queueName,
        jobId: job.id,
        jobName: job.name,
        duration: job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : undefined,
      });
    }
  });

  worker.on("failed", (job: Job<TData, TResult> | undefined, error: Error) => {
    logger.error("Job failed", {
      service: "bullmq-worker",
      queue: queueName,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: error.message,
      stack: error.stack,
    });
  });

  worker.on("error", (error: Error) => {
    logger.error("Worker error", {
      service: "bullmq-worker",
      queue: queueName,
      error: error.message,
    });
  });

  worker.on("stalled", (jobId: string) => {
    logger.warn("Job stalled", {
      service: "bullmq-worker",
      queue: queueName,
      jobId,
    });
  });

  worker.on("active", (job: Job<TData, TResult>) => {
    logger.debug("Job active", {
      service: "bullmq-worker",
      queue: queueName,
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    });
  });
}

// ============================================================================
// Worker Factories
// ============================================================================

/**
 * Create an email worker for processing email sending jobs.
 *
 * - Concurrency: 5 (parallel email sends)
 * - Rate limit: 50 jobs per second
 * - Lock duration: 30s
 *
 * @param processor - Function that actually sends the email
 * @param config - Optional worker configuration overrides
 */
export function createEmailWorker(
  processor: (job: Job<EmailJobData, EmailJobResult>) => Promise<EmailJobResult>,
  config?: WorkerConfig
): Worker<EmailJobData, EmailJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<EmailJobData, EmailJobResult>(
    QUEUE_NAMES.EMAIL,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 5,
      lockDuration: config?.lockDuration ?? 30000,
      stalledInterval: config?.stalledInterval ?? 30000,
      maxStalledCount: config?.maxStalledCount ?? 2,
      limiter: config?.limiter ?? {
        max: 50,
        duration: 1000,
      },
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.EMAIL);
  workerRegistry.push(worker);

  logger.info("Email worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.EMAIL,
    concurrency: config?.concurrency ?? 5,
  });

  return worker;
}

/**
 * Create a notification worker for processing push, in-app, SMS, and webhook notifications.
 *
 * - Concurrency: 10 (high throughput for notifications)
 * - Rate limit: 100 jobs per second
 * - Lock duration: 15s
 *
 * @param processor - Function that delivers the notification
 * @param config - Optional worker configuration overrides
 */
export function createNotificationWorker(
  processor: (job: Job<NotificationJobData, NotificationJobResult>) => Promise<NotificationJobResult>,
  config?: WorkerConfig
): Worker<NotificationJobData, NotificationJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<NotificationJobData, NotificationJobResult>(
    QUEUE_NAMES.NOTIFICATION,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 10,
      lockDuration: config?.lockDuration ?? 15000,
      stalledInterval: config?.stalledInterval ?? 15000,
      maxStalledCount: config?.maxStalledCount ?? 2,
      limiter: config?.limiter ?? {
        max: 100,
        duration: 1000,
      },
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.NOTIFICATION);
  workerRegistry.push(worker);

  logger.info("Notification worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.NOTIFICATION,
    concurrency: config?.concurrency ?? 10,
  });

  return worker;
}

/**
 * Create a settlement worker for processing trade settlements.
 *
 * - Concurrency: 3 (limited for financial safety)
 * - Rate limit: 20 jobs per second
 * - Lock duration: 120s (settlements can be slow)
 * - Higher stalled check interval
 *
 * @param processor - Function that processes the settlement
 * @param config - Optional worker configuration overrides
 */
export function createSettlementWorker(
  processor: (job: Job<SettlementJobData, SettlementJobResult>) => Promise<SettlementJobResult>,
  config?: WorkerConfig
): Worker<SettlementJobData, SettlementJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<SettlementJobData, SettlementJobResult>(
    QUEUE_NAMES.SETTLEMENT,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 3,
      lockDuration: config?.lockDuration ?? 120000,
      stalledInterval: config?.stalledInterval ?? 60000,
      maxStalledCount: config?.maxStalledCount ?? 1,
      limiter: config?.limiter ?? {
        max: 20,
        duration: 1000,
      },
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.SETTLEMENT);
  workerRegistry.push(worker);

  logger.info("Settlement worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.SETTLEMENT,
    concurrency: config?.concurrency ?? 3,
  });

  return worker;
}

/**
 * Create a reconciliation worker for balance and trade reconciliation.
 *
 * - Concurrency: 1 (reconciliation must be serialized)
 * - Lock duration: 300s (long-running reconciliation)
 * - No rate limiter (runs infrequently)
 *
 * @param processor - Function that performs the reconciliation
 * @param config - Optional worker configuration overrides
 */
export function createReconciliationWorker(
  processor: (job: Job<ReconciliationJobData, ReconciliationJobResult>) => Promise<ReconciliationJobResult>,
  config?: WorkerConfig
): Worker<ReconciliationJobData, ReconciliationJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<ReconciliationJobData, ReconciliationJobResult>(
    QUEUE_NAMES.RECONCILIATION,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 1,
      lockDuration: config?.lockDuration ?? 300000,
      stalledInterval: config?.stalledInterval ?? 120000,
      maxStalledCount: config?.maxStalledCount ?? 1,
      limiter: config?.limiter,
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.RECONCILIATION);
  workerRegistry.push(worker);

  logger.info("Reconciliation worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.RECONCILIATION,
    concurrency: config?.concurrency ?? 1,
  });

  return worker;
}

/**
 * Create an analytics worker for async analytics processing.
 *
 * - Concurrency: 3 (moderate parallelism)
 * - Lock duration: 60s
 * - No rate limiter
 *
 * @param processor - Function that processes analytics jobs
 * @param config - Optional worker configuration overrides
 */
export function createAnalyticsWorker(
  processor: (job: Job<AnalyticsJobData, AnalyticsJobResult>) => Promise<AnalyticsJobResult>,
  config?: WorkerConfig
): Worker<AnalyticsJobData, AnalyticsJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<AnalyticsJobData, AnalyticsJobResult>(
    QUEUE_NAMES.ANALYTICS,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 3,
      lockDuration: config?.lockDuration ?? 60000,
      stalledInterval: config?.stalledInterval ?? 30000,
      maxStalledCount: config?.maxStalledCount ?? 2,
      limiter: config?.limiter,
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.ANALYTICS);
  workerRegistry.push(worker);

  logger.info("Analytics worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.ANALYTICS,
    concurrency: config?.concurrency ?? 3,
  });

  return worker;
}

/**
 * Create a cleanup worker for data cleanup and archival.
 *
 * - Concurrency: 2
 * - Lock duration: 120s
 * - No rate limiter
 *
 * @param processor - Function that performs cleanup
 * @param config - Optional worker configuration overrides
 */
export function createCleanupWorker(
  processor: (job: Job<CleanupJobData, CleanupJobResult>) => Promise<CleanupJobResult>,
  config?: WorkerConfig
): Worker<CleanupJobData, CleanupJobResult> {
  const connection = getRedisConnection();
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const worker = new Worker<CleanupJobData, CleanupJobResult>(
    QUEUE_NAMES.CLEANUP,
    processor,
    {
      connection,
      prefix,
      concurrency: config?.concurrency ?? 2,
      lockDuration: config?.lockDuration ?? 120000,
      stalledInterval: config?.stalledInterval ?? 60000,
      maxStalledCount: config?.maxStalledCount ?? 2,
      limiter: config?.limiter,
    }
  );

  attachWorkerEvents(worker, QUEUE_NAMES.CLEANUP);
  workerRegistry.push(worker);

  logger.info("Cleanup worker created", {
    service: "bullmq-worker",
    queue: QUEUE_NAMES.CLEANUP,
    concurrency: config?.concurrency ?? 2,
  });

  return worker;
}

// ============================================================================
// Worker Lifecycle Management
// ============================================================================

/**
 * Get all registered workers.
 */
export function getAllWorkers(): Worker[] {
  return [...workerRegistry];
}

/**
 * Close all workers gracefully.
 * Waits for currently processing jobs to complete.
 * Should be called during application shutdown.
 */
export async function closeAllWorkers(): Promise<void> {
  logger.info("Closing all workers", {
    service: "bullmq-worker",
    count: workerRegistry.length,
  });

  const closePromises = workerRegistry.map(async (worker) => {
    try {
      await worker.close();
    } catch (error) {
      logger.error("Failed to close worker", {
        service: "bullmq-worker",
        name: worker.name,
        error,
      });
    }
  });

  await Promise.allSettled(closePromises);
  workerRegistry.length = 0;

  logger.info("All workers closed", { service: "bullmq-worker" });
}

/**
 * Pause all workers (stop picking up new jobs, finish current ones).
 */
export async function pauseAllWorkers(): Promise<void> {
  for (const worker of workerRegistry) {
    await worker.pause();
    logger.info("Worker paused", {
      service: "bullmq-worker",
      name: worker.name,
    });
  }
}

/**
 * Resume all paused workers.
 */
export async function resumeAllWorkers(): Promise<void> {
  for (const worker of workerRegistry) {
    worker.resume();
    logger.info("Worker resumed", {
      service: "bullmq-worker",
      name: worker.name,
    });
  }
}
