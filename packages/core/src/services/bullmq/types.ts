/**
 * BullMQ Job Queue Types
 *
 * Type definitions for all job payloads, results, and configuration
 * flowing through the PULL job queue system.
 */

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUE_NAMES = {
  EMAIL: "email-queue",
  NOTIFICATION: "notification-queue",
  SETTLEMENT: "settlement-queue",
  RECONCILIATION: "reconciliation-queue",
  ANALYTICS: "analytics-queue",
  CLEANUP: "cleanup-queue",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================================================
// Email Job Types
// ============================================================================

export type EmailPriority = 1 | 2 | 3 | 4 | 5;

export interface EmailJobData {
  to: string | string[];
  from?: string;
  subject: string;
  template: string;
  templateData: Record<string, unknown>;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  priority?: EmailPriority;
  /** Tags for email analytics */
  tags?: string[];
  /** Idempotency key to prevent duplicate sends */
  idempotencyKey?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: "base64" | "utf-8";
}

export interface EmailJobResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  sentAt: string;
}

// ============================================================================
// Notification Job Types
// ============================================================================

export type NotificationChannel = "push" | "in_app" | "sms" | "webhook";

export interface NotificationJobData {
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Push notification specific */
  deviceTokens?: string[];
  /** In-app notification specific */
  actionUrl?: string;
  actionLabel?: string;
  /** Webhook specific */
  webhookUrl?: string;
  /** SMS specific */
  phoneNumber?: string;
  /** Whether to batch with similar notifications */
  batchable?: boolean;
  batchKey?: string;
  /** Expiry time for the notification */
  expiresAt?: string;
}

export interface NotificationJobResult {
  notificationId: string;
  channel: NotificationChannel;
  deliveredAt: string;
  status: "delivered" | "failed" | "expired";
  failureReason?: string;
}

// ============================================================================
// Settlement Job Types
// ============================================================================

export type SettlementAction = "process" | "retry" | "reverse" | "reconcile";

export interface SettlementJobData {
  action: SettlementAction;
  settlementId: string;
  tradeId: string;
  userId: string;
  marketId: string;
  amount: number;
  fee: number;
  currency: string;
  exchange: string;
  /** For retry actions */
  previousAttempts?: number;
  /** For reverse actions */
  reverseReason?: string;
  /** Original settlement reference for reconciliation */
  originalSettlementId?: string;
}

export interface SettlementJobResult {
  settlementId: string;
  status: "completed" | "failed" | "reversed" | "pending_manual_review";
  processedAt: string;
  transactionId?: string;
  failureReason?: string;
  requiresManualReview?: boolean;
}

// ============================================================================
// Reconciliation Job Types
// ============================================================================

export type ReconciliationType =
  | "balance"
  | "trade"
  | "settlement"
  | "deposit"
  | "withdrawal";

export interface ReconciliationJobData {
  type: ReconciliationType;
  /** Specific user ID, or null for global reconciliation */
  userId?: string;
  /** Time range for reconciliation */
  startTime: string;
  endTime: string;
  /** Whether to auto-correct small discrepancies */
  autoCorrect?: boolean;
  /** Threshold for auto-correction (in cents) */
  autoCorrectThreshold?: number;
  /** Source systems to reconcile between */
  sources: string[];
}

export interface ReconciliationDiscrepancy {
  type: string;
  entityId: string;
  field: string;
  sourceValue: number;
  targetValue: number;
  difference: number;
  autoCorrected: boolean;
}

export interface ReconciliationJobResult {
  reconciliationType: ReconciliationType;
  recordsChecked: number;
  discrepanciesFound: number;
  discrepanciesResolved: number;
  discrepancies: ReconciliationDiscrepancy[];
  startedAt: string;
  completedAt: string;
  status: "clean" | "discrepancies_found" | "discrepancies_resolved" | "error";
}

// ============================================================================
// Analytics Job Types
// ============================================================================

export type AnalyticsAction =
  | "aggregate_trades"
  | "aggregate_users"
  | "aggregate_revenue"
  | "compute_leaderboard"
  | "compute_market_stats"
  | "generate_report"
  | "update_cohorts"
  | "process_funnel";

export interface AnalyticsJobData {
  action: AnalyticsAction;
  /** Time period for the aggregation */
  period: "5m" | "15m" | "1h" | "1d" | "1w" | "1M";
  /** Start of the aggregation window */
  windowStart: string;
  /** End of the aggregation window */
  windowEnd: string;
  /** Additional parameters specific to the action */
  params?: Record<string, unknown>;
}

export interface AnalyticsJobResult {
  action: AnalyticsAction;
  recordsProcessed: number;
  outputRecords: number;
  duration: number;
  completedAt: string;
}

// ============================================================================
// Cleanup Job Types
// ============================================================================

export type CleanupAction =
  | "expired_sessions"
  | "stale_orders"
  | "old_notifications"
  | "expired_tokens"
  | "orphaned_files"
  | "old_audit_logs"
  | "temp_data";

export interface CleanupJobData {
  action: CleanupAction;
  /** How old items must be to be cleaned up (ISO duration or timestamp) */
  olderThan: string;
  /** Maximum number of items to clean up in one run */
  batchSize?: number;
  /** Dry run mode - log what would be cleaned without actually deleting */
  dryRun?: boolean;
}

export interface CleanupJobResult {
  action: CleanupAction;
  itemsFound: number;
  itemsCleaned: number;
  dryRun: boolean;
  duration: number;
  completedAt: string;
}

// ============================================================================
// Worker Types
// ============================================================================

/** Generic job processor function */
export type JobProcessor<TData, TResult> = (job: {
  id: string;
  name: string;
  data: TData;
  attemptsMade: number;
  opts: Record<string, unknown>;
}) => Promise<TResult>;

/** Worker configuration */
export interface WorkerConfig {
  /** Number of concurrent jobs to process */
  concurrency?: number;
  /** Lock duration in ms (how long a job is locked for processing) */
  lockDuration?: number;
  /** How often to check for stalled jobs in ms */
  stalledInterval?: number;
  /** Maximum number of stalled job recoveries */
  maxStalledCount?: number;
  /** Rate limiter configuration */
  limiter?: {
    max: number;
    duration: number;
  };
}

// ============================================================================
// Scheduler Types
// ============================================================================

export interface ScheduledJob {
  name: string;
  queue: QueueName;
  pattern: string;
  data: Record<string, unknown>;
  options?: {
    priority?: number;
    attempts?: number;
    backoff?: {
      type: "exponential" | "fixed";
      delay: number;
    };
  };
}

// ============================================================================
// Redis Connection Types
// ============================================================================

export interface RedisConnectionConfig {
  /** Upstash Redis REST URL (used to derive host/port for ioredis-compatible connection) */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
  maxRetriesPerRequest?: number;
  /** Key prefix for all BullMQ keys */
  prefix?: string;
}
