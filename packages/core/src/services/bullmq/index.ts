/**
 * BullMQ Job Queue Service
 *
 * Redis-backed job queue system for the PULL trading platform.
 * Provides named queues, typed workers, and recurring job scheduling for:
 * - Email sending (priority-based)
 * - Push notifications
 * - Trade settlement processing
 * - Balance reconciliation
 * - Async analytics processing
 * - Data cleanup and archival
 *
 * @example
 * ```typescript
 * import {
 *   initBullMQ,
 *   getEmailQueue,
 *   createEmailWorker,
 *   registerAllScheduledJobs,
 * } from '@pull/core/services/bullmq';
 *
 * // Initialize at startup
 * initBullMQ({ url: process.env.REDIS_URL });
 *
 * // Add a job
 * await getEmailQueue().add('welcome', { to: 'user@example.com', ... });
 *
 * // Create workers
 * createEmailWorker(async (job) => { ... });
 *
 * // Register recurring jobs
 * await registerAllScheduledJobs();
 * ```
 */

// Queue configuration and accessors
export {
  initBullMQ,
  getEmailQueue,
  getNotificationQueue,
  getSettlementQueue,
  getReconciliationQueue,
  getAnalyticsQueue,
  getCleanupQueue,
  getAllQueues,
  getQueue,
  closeAllQueues,
  pauseAllQueues,
  resumeAllQueues,
  getQueuesHealth,
  drainQueue,
} from "./queues";

// Worker factories
export {
  setWorkerRedisConfig,
  createEmailWorker,
  createNotificationWorker,
  createSettlementWorker,
  createReconciliationWorker,
  createAnalyticsWorker,
  createCleanupWorker,
  getAllWorkers,
  closeAllWorkers,
  pauseAllWorkers,
  resumeAllWorkers,
} from "./workers";

// Scheduler
export {
  SCHEDULED_JOBS,
  registerAllScheduledJobs,
  removeAllScheduledJobs,
  listScheduledJobs,
  triggerScheduledJob,
} from "./scheduler";

// Types
export { QUEUE_NAMES } from "./types";
export type {
  QueueName,
  EmailJobData,
  EmailJobResult,
  EmailAttachment,
  EmailPriority,
  NotificationJobData,
  NotificationJobResult,
  NotificationChannel,
  SettlementJobData,
  SettlementJobResult,
  SettlementAction,
  ReconciliationJobData,
  ReconciliationJobResult,
  ReconciliationDiscrepancy,
  ReconciliationType,
  AnalyticsJobData,
  AnalyticsJobResult,
  AnalyticsAction,
  CleanupJobData,
  CleanupJobResult,
  CleanupAction,
  JobProcessor,
  WorkerConfig,
  ScheduledJob,
  RedisConnectionConfig,
} from "./types";
