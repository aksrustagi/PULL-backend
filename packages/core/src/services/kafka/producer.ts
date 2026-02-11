/**
 * Kafka Producer
 *
 * Publishes typed events to the PULL event bus via Upstash Kafka REST API.
 * Supports idempotent delivery via message keys, JSON serialization,
 * and structured event envelopes with metadata.
 *
 * @example
 * ```typescript
 * import { getKafkaProducer, publishTradeEvent } from '@pull/core/services/kafka';
 *
 * await publishTradeEvent({
 *   tradeId: 'trade_123',
 *   orderId: 'order_456',
 *   userId: 'user_789',
 *   marketId: 'market_abc',
 *   side: 'buy',
 *   type: 'limit',
 *   price: 0.65,
 *   quantity: 100,
 *   totalAmount: 65.00,
 *   fee: 0.10,
 *   executedAt: new Date().toISOString(),
 *   exchange: 'kalshi',
 * });
 * ```
 */

import { Kafka } from "@upstash/kafka";
import { getLogger } from "../logger";
import { TOPICS } from "./topics";
import type { Topic } from "./topics";
import type {
  KafkaEvent,
  EventMetadata,
  ProducerConfig,
  TradeEventPayload,
  OrderEventPayload,
  SettlementEventPayload,
  BalanceEventPayload,
  KYCEventPayload,
  AuditEventPayload,
  UserEventPayload,
  RewardEventPayload,
  PredictionEventPayload,
  NotificationEventPayload,
} from "./types";

// ============================================================================
// Producer Instance
// ============================================================================

const logger = getLogger();

let kafkaInstance: Kafka | null = null;
let producerServiceName = "pull-api";

/**
 * Initialize the Kafka producer with Upstash credentials.
 * Must be called before any publish operations.
 */
export function initKafkaProducer(config?: ProducerConfig): Kafka {
  const url = config?.url ?? process.env.UPSTASH_KAFKA_REST_URL;
  const username = config?.username ?? process.env.UPSTASH_KAFKA_REST_USERNAME;
  const password = config?.password ?? process.env.UPSTASH_KAFKA_REST_PASSWORD;

  if (!url || !username || !password) {
    throw new Error(
      "Kafka producer requires UPSTASH_KAFKA_REST_URL, UPSTASH_KAFKA_REST_USERNAME, and UPSTASH_KAFKA_REST_PASSWORD"
    );
  }

  if (config?.serviceName) {
    producerServiceName = config.serviceName;
  }

  kafkaInstance = new Kafka({
    url,
    username,
    password,
  });

  logger.info("Kafka producer initialized", {
    service: "kafka-producer",
    url: url.replace(/\/\/.*@/, "//***@"),
  });

  return kafkaInstance;
}

/**
 * Get the initialized Kafka instance.
 * Lazily initializes from environment variables if not already configured.
 */
export function getKafkaInstance(): Kafka {
  if (!kafkaInstance) {
    kafkaInstance = initKafkaProducer();
  }
  return kafkaInstance;
}

// ============================================================================
// Event Construction
// ============================================================================

/**
 * Generate a UUID v4 using the built-in crypto API.
 */
function generateEventId(): string {
  return crypto.randomUUID();
}

/**
 * Build event metadata with unique ID and timestamp.
 */
function buildMetadata(overrides?: Partial<EventMetadata>): EventMetadata {
  return {
    eventId: overrides?.eventId ?? generateEventId(),
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    source: overrides?.source ?? producerServiceName,
    correlationId: overrides?.correlationId,
    causationId: overrides?.causationId,
    version: overrides?.version ?? 1,
  };
}

/**
 * Build a typed Kafka event envelope.
 */
function buildEvent<T>(
  topic: Topic,
  key: string,
  payload: T,
  metadata?: Partial<EventMetadata>
): KafkaEvent<T> {
  return {
    topic,
    key,
    metadata: buildMetadata(metadata),
    payload,
  };
}

// ============================================================================
// Core Publish Function
// ============================================================================

/**
 * Publish a raw event to a Kafka topic.
 * The message key ensures ordering within a partition and enables idempotent delivery.
 */
async function publishEvent<T>(event: KafkaEvent<T>): Promise<void> {
  const kafka = getKafkaInstance();
  const producer = kafka.producer();

  try {
    const result = await producer.produce(event.topic, JSON.stringify(event), {
      key: event.key,
      headers: [
        { key: "event-id", value: event.metadata.eventId },
        { key: "event-source", value: event.metadata.source },
        { key: "event-version", value: String(event.metadata.version) },
        ...(event.metadata.correlationId
          ? [{ key: "correlation-id", value: event.metadata.correlationId }]
          : []),
      ],
    });

    logger.debug("Event published", {
      service: "kafka-producer",
      topic: event.topic,
      key: event.key,
      eventId: event.metadata.eventId,
      offset: result?.offset,
    });
  } catch (error) {
    logger.error("Failed to publish event", {
      service: "kafka-producer",
      topic: event.topic,
      key: event.key,
      eventId: event.metadata.eventId,
      error,
    });
    throw error;
  }
}

/**
 * Publish multiple events in a single batch request.
 * All events are sent atomically to reduce network overhead.
 */
async function publishBatch<T>(events: KafkaEvent<T>[]): Promise<void> {
  if (events.length === 0) return;

  const kafka = getKafkaInstance();
  const producer = kafka.producer();

  const messages = events.map((event) => ({
    topic: event.topic,
    value: JSON.stringify(event),
    key: event.key,
    headers: [
      { key: "event-id", value: event.metadata.eventId },
      { key: "event-source", value: event.metadata.source },
      { key: "event-version", value: String(event.metadata.version) },
    ],
  }));

  try {
    await producer.produceMany(messages);

    logger.debug("Batch events published", {
      service: "kafka-producer",
      count: events.length,
      topics: [...new Set(events.map((e) => e.topic))],
    });
  } catch (error) {
    logger.error("Failed to publish batch events", {
      service: "kafka-producer",
      count: events.length,
      error,
    });
    throw error;
  }
}

// ============================================================================
// Domain-Specific Publishers
// ============================================================================

/**
 * Publish a trade execution event.
 * Key: userId for per-user ordering of trade events.
 */
export async function publishTradeEvent(
  payload: TradeEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.TRADES,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish an order lifecycle event.
 * Key: userId for per-user ordering of order events.
 */
export async function publishOrderEvent(
  payload: OrderEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.ORDERS,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a settlement confirmation event.
 * Key: userId for per-user ordering of settlement events.
 */
export async function publishSettlementEvent(
  payload: SettlementEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.SETTLEMENTS,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a balance change event.
 * Key: userId for strict per-user balance ordering.
 */
export async function publishBalanceEvent(
  payload: BalanceEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.BALANCES,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a KYC status change event.
 * Key: userId for per-user KYC state tracking.
 */
export async function publishKYCEvent(
  payload: KYCEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.KYC,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish an audit trail event.
 * Key: actorId for per-actor audit log ordering.
 */
export async function publishAuditEvent(
  payload: AuditEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.AUDIT,
    payload.actorId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a user lifecycle event.
 * Key: userId for per-user event ordering.
 */
export async function publishUserEvent(
  payload: UserEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.USERS,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a reward event.
 * Key: userId for per-user reward tracking.
 */
export async function publishRewardEvent(
  payload: RewardEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.REWARDS,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a prediction market event.
 * Key: marketId for per-market event ordering.
 */
export async function publishPredictionEvent(
  payload: PredictionEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.PREDICTIONS,
    payload.marketId,
    payload,
    metadata
  );
  await publishEvent(event);
}

/**
 * Publish a notification dispatch event.
 * Key: userId for per-user notification ordering.
 */
export async function publishNotificationEvent(
  payload: NotificationEventPayload,
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const event = buildEvent(
    TOPICS.NOTIFICATIONS,
    payload.userId,
    payload,
    metadata
  );
  await publishEvent(event);
}

// ============================================================================
// Batch Publishers
// ============================================================================

/**
 * Publish multiple trade events in a single batch.
 */
export async function publishTradeEvents(
  payloads: TradeEventPayload[],
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const events = payloads.map((payload) =>
    buildEvent(TOPICS.TRADES, payload.userId, payload, metadata)
  );
  await publishBatch(events);
}

/**
 * Publish multiple order events in a single batch.
 */
export async function publishOrderEvents(
  payloads: OrderEventPayload[],
  metadata?: Partial<EventMetadata>
): Promise<void> {
  const events = payloads.map((payload) =>
    buildEvent(TOPICS.ORDERS, payload.userId, payload, metadata)
  );
  await publishBatch(events);
}

// ============================================================================
// Exports
// ============================================================================

export {
  publishEvent,
  publishBatch,
  buildEvent,
  buildMetadata,
};
