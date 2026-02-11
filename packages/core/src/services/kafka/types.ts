/**
 * Kafka Event Bus Types
 *
 * Type definitions for all events flowing through the PULL event bus.
 * Every event has a base envelope with metadata, and a typed payload.
 */

import type { Topic } from "./topics";

// ============================================================================
// Base Event Envelope
// ============================================================================

/** Base metadata attached to every event */
export interface EventMetadata {
  /** Unique event identifier (UUID v4) */
  eventId: string;
  /** ISO-8601 timestamp of when the event was produced */
  timestamp: string;
  /** Source service that produced the event */
  source: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** Causation ID linking to the event that caused this one */
  causationId?: string;
  /** Schema version for forward compatibility */
  version: number;
}

/** Generic event envelope wrapping a typed payload */
export interface KafkaEvent<T = unknown> {
  /** The Kafka topic this event belongs to */
  topic: Topic;
  /** Partition key for ordering guarantees */
  key: string;
  /** Event metadata */
  metadata: EventMetadata;
  /** Typed event payload */
  payload: T;
}

// ============================================================================
// Trade Events
// ============================================================================

export type TradeSide = "buy" | "sell";
export type TradeType = "market" | "limit";

export interface TradeEventPayload {
  tradeId: string;
  orderId: string;
  userId: string;
  marketId: string;
  side: TradeSide;
  type: TradeType;
  price: number;
  quantity: number;
  totalAmount: number;
  fee: number;
  executedAt: string;
  counterpartyId?: string;
  exchange: string;
}

export type TradeEvent = KafkaEvent<TradeEventPayload>;

// ============================================================================
// Order Events
// ============================================================================

export type OrderStatus =
  | "placed"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "expired"
  | "rejected";

export interface OrderEventPayload {
  orderId: string;
  userId: string;
  marketId: string;
  side: TradeSide;
  type: TradeType;
  status: OrderStatus;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  cancelReason?: string;
  exchange: string;
}

export type OrderEvent = KafkaEvent<OrderEventPayload>;

// ============================================================================
// Settlement Events
// ============================================================================

export type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "reversed";

export interface SettlementEventPayload {
  settlementId: string;
  tradeId: string;
  userId: string;
  marketId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: SettlementStatus;
  settledAt?: string;
  failureReason?: string;
}

export type SettlementEvent = KafkaEvent<SettlementEventPayload>;

// ============================================================================
// Balance Events
// ============================================================================

export type BalanceChangeType =
  | "deposit"
  | "withdrawal"
  | "trade_debit"
  | "trade_credit"
  | "settlement"
  | "fee"
  | "reward"
  | "adjustment"
  | "refund";

export interface BalanceEventPayload {
  userId: string;
  changeType: BalanceChangeType;
  amount: number;
  currency: string;
  previousBalance: number;
  newBalance: number;
  referenceId: string;
  referenceType: string;
  description?: string;
}

export type BalanceEvent = KafkaEvent<BalanceEventPayload>;

// ============================================================================
// KYC Events
// ============================================================================

export type KYCStatus =
  | "initiated"
  | "documents_submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "requires_resubmission";

export type KYCLevel = "basic" | "intermediate" | "advanced";

export interface KYCEventPayload {
  userId: string;
  inquiryId: string;
  status: KYCStatus;
  level: KYCLevel;
  provider: string;
  previousStatus?: KYCStatus;
  rejectionReasons?: string[];
  verifiedAt?: string;
  expiresAt?: string;
}

export type KYCEvent = KafkaEvent<KYCEventPayload>;

// ============================================================================
// Audit Events
// ============================================================================

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.password_change"
  | "user.mfa_enable"
  | "user.mfa_disable"
  | "order.place"
  | "order.cancel"
  | "trade.execute"
  | "withdrawal.request"
  | "withdrawal.approve"
  | "withdrawal.reject"
  | "deposit.complete"
  | "kyc.submit"
  | "kyc.approve"
  | "kyc.reject"
  | "admin.action"
  | "api_key.create"
  | "api_key.revoke"
  | "settings.update";

export interface AuditEventPayload {
  actorId: string;
  actorType: "user" | "admin" | "system" | "api";
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: "success" | "failure";
  riskScore?: number;
}

export type AuditEvent = KafkaEvent<AuditEventPayload>;

// ============================================================================
// User Events
// ============================================================================

export type UserAction =
  | "signup"
  | "login"
  | "logout"
  | "profile_update"
  | "email_verified"
  | "phone_verified"
  | "mfa_enabled"
  | "mfa_disabled"
  | "deactivated"
  | "reactivated"
  | "deleted"
  | "password_changed"
  | "preferences_updated";

export interface UserEventPayload {
  userId: string;
  action: UserAction;
  email?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  previousValues?: Record<string, unknown>;
}

export type UserEvent = KafkaEvent<UserEventPayload>;

// ============================================================================
// Reward Events
// ============================================================================

export type RewardType =
  | "signup_bonus"
  | "referral_bonus"
  | "trade_reward"
  | "streak_bonus"
  | "achievement"
  | "promotion"
  | "cashback";

export interface RewardEventPayload {
  userId: string;
  rewardId: string;
  type: RewardType;
  amount: number;
  currency: string;
  description: string;
  referenceId?: string;
  expiresAt?: string;
}

export type RewardEvent = KafkaEvent<RewardEventPayload>;

// ============================================================================
// Prediction Events
// ============================================================================

export type PredictionStatus = "open" | "closed" | "resolved" | "voided" | "disputed";

export interface PredictionEventPayload {
  predictionId: string;
  marketId: string;
  status: PredictionStatus;
  result?: "yes" | "no" | "void";
  resolutionSource?: string;
  totalVolume?: number;
  uniqueTraders?: number;
  resolvedAt?: string;
}

export type PredictionEvent = KafkaEvent<PredictionEventPayload>;

// ============================================================================
// Notification Events
// ============================================================================

export type NotificationChannel = "email" | "push" | "in_app" | "sms" | "webhook";
export type NotificationPriority = "low" | "normal" | "high" | "critical";

export interface NotificationEventPayload {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  template: string;
  subject?: string;
  data: Record<string, unknown>;
  scheduledAt?: string;
}

export type NotificationEvent = KafkaEvent<NotificationEventPayload>;

// ============================================================================
// Consumer Types
// ============================================================================

/** Handler function for processing a single Kafka message */
export type EventHandler<T = unknown> = (event: KafkaEvent<T>) => Promise<void>;

/** Handler function for processing a batch of Kafka messages */
export type BatchEventHandler<T = unknown> = (events: KafkaEvent<T>[]) => Promise<void>;

/** Configuration for creating a consumer */
export interface ConsumerConfig {
  /** Consumer group identifier */
  groupId: string;
  /** Topics to subscribe to */
  topics: string[];
  /** Whether to automatically commit offsets */
  autoCommit?: boolean;
  /** Auto-commit interval in ms */
  autoCommitInterval?: number;
  /** Maximum number of messages to fetch per poll */
  maxBatchSize?: number;
  /** Maximum number of retry attempts for failed messages */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff */
  retryBaseDelay?: number;
  /** Maximum delay in ms for exponential backoff */
  retryMaxDelay?: number;
  /** Whether to send failed messages to the dead letter queue */
  enableDLQ?: boolean;
  /** Polling interval in ms for fetching new messages */
  pollInterval?: number;
}

/** Consumer instance returned by createConsumer */
export interface Consumer {
  /** Start consuming messages */
  start(): Promise<void>;
  /** Stop consuming messages gracefully */
  stop(): Promise<void>;
  /** Check if the consumer is currently running */
  isRunning(): boolean;
}

// ============================================================================
// Producer Types
// ============================================================================

/** Configuration for the Kafka producer */
export interface ProducerConfig {
  /** Upstash Kafka REST URL */
  url?: string;
  /** Upstash Kafka credentials - username */
  username?: string;
  /** Upstash Kafka credentials - password */
  password?: string;
  /** Source service name for event metadata */
  serviceName?: string;
}
