/**
 * BullMQ Queue Definitions
 *
 * Named queues with proper configuration for the PULL trading platform.
 * Each queue has its own connection, default job options, rate limiting,
 * and priority support.
 *
 * BullMQ requires a native Redis connection (ioredis-compatible), not the
 * Upstash REST API. Configure via REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
 * or BULLMQ_REDIS_URL environment variables.
 *
 * @example
 * ```typescript
 * import { getEmailQueue, getSettlementQueue } from '@pull/core/services/bullmq';
 *
 * // Add an email job
 * await getEmailQueue().add('welcome-email', {
 *   to: 'user@example.com',
 *   subject: 'Welcome to PULL',
 *   template: 'welcome',
 *   templateData: { name: 'John' },
 * });
 *
 * // Add a high-priority settlement job
 * await getSettlementQueue().add('process', settlementData, { priority: 1 });
 * ```
 */

import { Queue, type QueueOptions, type JobsOptions } from "bullmq";
import { getLogger } from "../logger";
import { QUEUE_NAMES } from "./types";
import type {
  QueueName,
  EmailJobData,
  NotificationJobData,
  SettlementJobData,
  ReconciliationJobData,
  AnalyticsJobData,
  CleanupJobData,
  RedisConnectionConfig,
} from "./types";

// ============================================================================
// Redis Connection
// ============================================================================

const logger = getLogger();

/** Shared Redis connection options derived from environment */
function getRedisConnection(config?: RedisConnectionConfig): QueueOptions["connection"] {
  // Try explicit config first, then environment variables
  if (config?.host) {
    return {
      host: config.host,
      port: config.port ?? 6379,
      password: config.password,
      tls: config.tls ? {} : undefined,
      maxRetriesPerRequest: config.maxRetriesPerRequest ?? null,
    };
  }

  // Parse from URL if provided
  const redisUrl = config?.url ?? process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL;
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
      logger.error("Failed to parse Redis URL for BullMQ", {
        service: "bullmq",
      });
    }
  }

  // Fallback to individual env vars
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

// ============================================================================
// Queue Registry
// ============================================================================

/** Singleton map of initialized queues */
const queueRegistry = new Map<QueueName, Queue>();

/** Global Redis connection config override */
let globalRedisConfig: RedisConnectionConfig | undefined;

/**
 * Initialize the BullMQ connection configuration.
 * Call this at application startup before creating any queues.
 */
export function initBullMQ(config: RedisConnectionConfig): void {
  globalRedisConfig = config;
  logger.info("BullMQ initialized with custom Redis config", {
    service: "bullmq",
    host: config.host ?? "(from URL)",
    prefix: config.prefix ?? "bull",
  });
}

/**
 * Get or create a queue by name.
 * Queues are lazy-initialized and cached as singletons.
 */
function getOrCreateQueue<TData>(
  name: QueueName,
  defaultJobOptions: JobsOptions,
  queueOptions?: Partial<QueueOptions>
): Queue<TData> {
  if (queueRegistry.has(name)) {
    return queueRegistry.get(name) as Queue<TData>;
  }

  const connection = getRedisConnection(globalRedisConfig);
  const prefix = globalRedisConfig?.prefix ?? "pull";

  const queue = new Queue<TData>(name, {
    connection,
    prefix,
    defaultJobOptions: {
      ...defaultJobOptions,
      // Global defaults
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep at most 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        count: 5000, // Keep at most 5000 failed jobs
      },
    },
    ...queueOptions,
  });

  queue.on("error", (error) => {
    logger.error("Queue error", {
      service: "bullmq",
      queue: name,
      error: error.message,
    });
  });

  queueRegistry.set(name, queue);

  logger.info("Queue created", {
    service: "bullmq",
    queue: name,
    prefix,
  });

  return queue;
}

// ============================================================================
// Queue Accessors
// ============================================================================

/**
 * Email queue - Transactional and marketing emails.
 * Priority-based: 1 (critical) to 5 (bulk).
 * Rate limited to 50 emails/second to respect provider limits.
 */
export function getEmailQueue(): Queue<EmailJobData> {
  return getOrCreateQueue<EmailJobData>(
    QUEUE_NAMES.EMAIL,
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      priority: 3,
    }
  );
}

/**
 * Notification queue - Push notifications, in-app, SMS, webhooks.
 * Rate limited to 100 notifications/second.
 */
export function getNotificationQueue(): Queue<NotificationJobData> {
  return getOrCreateQueue<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATION,
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      priority: 2,
    }
  );
}

/**
 * Settlement queue - Trade settlement processing.
 * Higher retry count for financial operations.
 * Rate limited to 20 settlements/second for safety.
 */
export function getSettlementQueue(): Queue<SettlementJobData> {
  return getOrCreateQueue<SettlementJobData>(
    QUEUE_NAMES.SETTLEMENT,
    {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 10000,
      },
      priority: 1,
      // Settlements should not be auto-removed on failure
      removeOnFail: false,
    }
  );
}

/**
 * Reconciliation queue - Balance and trade reconciliation.
 * Long-running jobs with extended lock duration.
 */
export function getReconciliationQueue(): Queue<ReconciliationJobData> {
  return getOrCreateQueue<ReconciliationJobData>(
    QUEUE_NAMES.RECONCILIATION,
    {
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 60000,
      },
    }
  );
}

/**
 * Analytics queue - Async analytics processing and aggregation.
 * Lower priority, higher throughput.
 */
export function getAnalyticsQueue(): Queue<AnalyticsJobData> {
  return getOrCreateQueue<AnalyticsJobData>(
    QUEUE_NAMES.ANALYTICS,
    {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 15000,
      },
      priority: 4,
    }
  );
}

/**
 * Cleanup queue - Data cleanup and archival tasks.
 * Lowest priority, runs during off-peak.
 */
export function getCleanupQueue(): Queue<CleanupJobData> {
  return getOrCreateQueue<CleanupJobData>(
    QUEUE_NAMES.CLEANUP,
    {
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 30000,
      },
      priority: 5,
    }
  );
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Get all registered queues.
 */
export function getAllQueues(): Map<QueueName, Queue> {
  return queueRegistry;
}

/**
 * Get a queue by name from the registry.
 */
export function getQueue(name: QueueName): Queue | undefined {
  return queueRegistry.get(name);
}

/**
 * Close all queues gracefully.
 * Should be called during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [name, queue] of queueRegistry) {
    logger.info("Closing queue", { service: "bullmq", queue: name });
    closePromises.push(queue.close());
  }

  await Promise.allSettled(closePromises);
  queueRegistry.clear();

  logger.info("All queues closed", { service: "bullmq" });
}

/**
 * Pause all queues (stop accepting new jobs).
 */
export async function pauseAllQueues(): Promise<void> {
  for (const [name, queue] of queueRegistry) {
    await queue.pause();
    logger.info("Queue paused", { service: "bullmq", queue: name });
  }
}

/**
 * Resume all paused queues.
 */
export async function resumeAllQueues(): Promise<void> {
  for (const [name, queue] of queueRegistry) {
    await queue.resume();
    logger.info("Queue resumed", { service: "bullmq", queue: name });
  }
}

/**
 * Get health status for all queues.
 */
export async function getQueuesHealth(): Promise<
  Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>
> {
  const health: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {};

  for (const [name, queue] of queueRegistry) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      health[name] = { waiting, active, completed, failed, delayed };
    } catch (error) {
      logger.error("Failed to get queue health", {
        service: "bullmq",
        queue: name,
        error,
      });
      health[name] = { waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1 };
    }
  }

  return health;
}

/**
 * Drain a specific queue (remove all jobs).
 * Use with caution - this is destructive.
 */
export async function drainQueue(name: QueueName): Promise<void> {
  const queue = queueRegistry.get(name);
  if (!queue) {
    throw new Error(`Queue ${name} not found in registry`);
  }

  await queue.drain();
  logger.warn("Queue drained", { service: "bullmq", queue: name });
}
