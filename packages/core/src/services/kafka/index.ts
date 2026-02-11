/**
 * Kafka Event Bus Service
 *
 * Upstash Kafka-based event bus for the PULL trading platform.
 * Provides typed event publishing and consumption with:
 * - Idempotent delivery via message keys
 * - Dead letter queues for failed messages
 * - Exponential backoff retry logic
 * - Batch consumption support
 * - Typed events for all platform domains
 *
 * @example
 * ```typescript
 * import { publishTradeEvent, createConsumer, TOPICS } from '@pull/core/services/kafka';
 *
 * // Publish
 * await publishTradeEvent({ tradeId: '...', ... });
 *
 * // Consume
 * const consumer = createConsumer(
 *   { groupId: 'my-service', topics: [TOPICS.TRADES] },
 *   async (event) => { ... }
 * );
 * await consumer.start();
 * ```
 */

// Topics
export { TOPICS, ALL_TOPICS, DLQ_SUFFIX, DLQ_TOPICS, getDLQTopic } from "./topics";
export type { Topic } from "./topics";

// Producer
export {
  initKafkaProducer,
  getKafkaInstance,
  publishTradeEvent,
  publishTradeEvents,
  publishOrderEvent,
  publishOrderEvents,
  publishSettlementEvent,
  publishBalanceEvent,
  publishKYCEvent,
  publishAuditEvent,
  publishUserEvent,
  publishRewardEvent,
  publishPredictionEvent,
  publishNotificationEvent,
  publishEvent,
  publishBatch,
  buildEvent,
  buildMetadata,
} from "./producer";

// Consumer
export { createConsumer, createBatchConsumer } from "./consumer";

// Types
export type {
  KafkaEvent,
  EventMetadata,
  ProducerConfig,
  ConsumerConfig,
  Consumer,
  EventHandler,
  BatchEventHandler,
  TradeEventPayload,
  TradeEvent,
  TradeSide,
  TradeType,
  OrderEventPayload,
  OrderEvent,
  OrderStatus,
  SettlementEventPayload,
  SettlementEvent,
  SettlementStatus,
  BalanceEventPayload,
  BalanceEvent,
  BalanceChangeType,
  KYCEventPayload,
  KYCEvent,
  KYCStatus,
  KYCLevel,
  AuditEventPayload,
  AuditEvent,
  AuditAction,
  UserEventPayload,
  UserEvent,
  UserAction,
  RewardEventPayload,
  RewardEvent,
  RewardType,
  PredictionEventPayload,
  PredictionEvent,
  PredictionStatus,
  NotificationEventPayload,
  NotificationEvent,
  NotificationChannel,
  NotificationPriority,
} from "./types";
