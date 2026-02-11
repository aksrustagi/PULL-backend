/**
 * Kafka Consumer
 *
 * Processes events from the PULL event bus via Upstash Kafka REST API.
 * Supports consumer groups, automatic offset management, dead letter queues,
 * retry logic with exponential backoff, and batch consumption.
 *
 * @example
 * ```typescript
 * import { createConsumer, TOPICS } from '@pull/core/services/kafka';
 *
 * const consumer = createConsumer({
 *   groupId: 'settlement-service',
 *   topics: [TOPICS.TRADES, TOPICS.SETTLEMENTS],
 *   maxRetries: 3,
 *   enableDLQ: true,
 * }, async (event) => {
 *   console.log('Processing event:', event.metadata.eventId);
 *   // process the event...
 * });
 *
 * await consumer.start();
 *
 * // Graceful shutdown
 * process.on('SIGTERM', () => consumer.stop());
 * ```
 */

import { Kafka } from "@upstash/kafka";
import { getLogger } from "../logger";
import { getDLQTopic } from "./topics";
import type { Topic } from "./topics";
import type {
  KafkaEvent,
  EventHandler,
  BatchEventHandler,
  ConsumerConfig,
  Consumer,
} from "./types";

// ============================================================================
// Consumer Factory
// ============================================================================

const logger = getLogger();

/** Internal state for a running consumer */
interface ConsumerState {
  running: boolean;
  pollTimer: ReturnType<typeof setTimeout> | null;
  kafka: Kafka;
  instanceName: string;
}

/**
 * Create a Kafka consumer that processes events from one or more topics.
 *
 * Uses Upstash Kafka's REST-based consumer API with automatic offset management.
 * Failed messages are retried with exponential backoff and optionally sent to a
 * dead letter queue after all retries are exhausted.
 *
 * @param config - Consumer configuration
 * @param handler - Async handler function for each event
 * @returns Consumer instance with start/stop lifecycle methods
 */
export function createConsumer<T = unknown>(
  config: ConsumerConfig,
  handler: EventHandler<T>
): Consumer {
  const {
    groupId,
    topics,
    maxBatchSize = 10,
    maxRetries = 3,
    retryBaseDelay = 1000,
    retryMaxDelay = 30000,
    enableDLQ = true,
    pollInterval = 1000,
  } = config;

  const url = process.env.UPSTASH_KAFKA_REST_URL;
  const username = process.env.UPSTASH_KAFKA_REST_USERNAME;
  const password = process.env.UPSTASH_KAFKA_REST_PASSWORD;

  if (!url || !username || !password) {
    throw new Error(
      "Kafka consumer requires UPSTASH_KAFKA_REST_URL, UPSTASH_KAFKA_REST_USERNAME, and UPSTASH_KAFKA_REST_PASSWORD"
    );
  }

  const kafka = new Kafka({ url, username, password });
  const instanceName = `${groupId}-${crypto.randomUUID().slice(0, 8)}`;

  const state: ConsumerState = {
    running: false,
    pollTimer: null,
    kafka,
    instanceName,
  };

  /**
   * Calculate exponential backoff delay with jitter.
   */
  function calculateBackoff(attempt: number): number {
    const exponentialDelay = retryBaseDelay * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, retryMaxDelay);
    // Add jitter: +/- 25% randomization to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  /**
   * Send a failed message to the dead letter queue.
   */
  async function sendToDLQ(
    event: KafkaEvent<T>,
    error: Error,
    attempts: number
  ): Promise<void> {
    try {
      const producer = kafka.producer();
      const dlqTopic = getDLQTopic(event.topic as Topic);

      const dlqPayload = {
        originalEvent: event,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        attempts,
        failedAt: new Date().toISOString(),
        consumerGroup: groupId,
        instanceName,
      };

      await producer.produce(dlqTopic, JSON.stringify(dlqPayload), {
        key: event.key,
        headers: [
          { key: "original-topic", value: event.topic },
          { key: "original-event-id", value: event.metadata.eventId },
          { key: "error-message", value: error.message },
          { key: "retry-count", value: String(attempts) },
        ],
      });

      logger.warn("Event sent to DLQ", {
        service: "kafka-consumer",
        groupId,
        topic: event.topic,
        dlqTopic,
        eventId: event.metadata.eventId,
        error: error.message,
        attempts,
      });
    } catch (dlqError) {
      logger.error("Failed to send event to DLQ", {
        service: "kafka-consumer",
        groupId,
        topic: event.topic,
        eventId: event.metadata.eventId,
        dlqError,
      });
    }
  }

  /**
   * Process a single message with retry logic.
   */
  async function processMessage(event: KafkaEvent<T>): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await handler(event);

        if (attempt > 0) {
          logger.info("Event processed successfully after retry", {
            service: "kafka-consumer",
            groupId,
            topic: event.topic,
            eventId: event.metadata.eventId,
            attempt,
          });
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const backoff = calculateBackoff(attempt);
          logger.warn("Event processing failed, retrying", {
            service: "kafka-consumer",
            groupId,
            topic: event.topic,
            eventId: event.metadata.eventId,
            attempt: attempt + 1,
            maxRetries,
            backoffMs: backoff,
            error: lastError.message,
          });
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    // All retries exhausted
    logger.error("Event processing failed after all retries", {
      service: "kafka-consumer",
      groupId,
      topic: event.topic,
      eventId: event.metadata.eventId,
      maxRetries,
      error: lastError?.message,
    });

    if (enableDLQ && lastError) {
      await sendToDLQ(event, lastError, maxRetries + 1);
    }
  }

  /**
   * Poll for new messages and process them.
   */
  async function poll(): Promise<void> {
    if (!state.running) return;

    try {
      const consumer = kafka.consumer();

      for (const topic of topics) {
        try {
          const messages = await consumer.consume({
            consumerGroupId: groupId,
            instanceId: instanceName,
            topics: [topic],
            autoCommit: true,
            autoOffsetReset: "latest",
          });

          if (messages && messages.length > 0) {
            const batch = messages.slice(0, maxBatchSize);

            logger.debug("Fetched messages", {
              service: "kafka-consumer",
              groupId,
              topic,
              count: batch.length,
            });

            for (const message of batch) {
              if (!state.running) break;

              try {
                const event = JSON.parse(message.value) as KafkaEvent<T>;
                await processMessage(event);
              } catch (parseError) {
                logger.error("Failed to parse Kafka message", {
                  service: "kafka-consumer",
                  groupId,
                  topic,
                  offset: message.offset,
                  error: parseError,
                });
              }
            }
          }
        } catch (topicError) {
          logger.error("Failed to consume from topic", {
            service: "kafka-consumer",
            groupId,
            topic,
            error: topicError,
          });
        }
      }
    } catch (error) {
      logger.error("Consumer poll error", {
        service: "kafka-consumer",
        groupId,
        error,
      });
    }

    // Schedule next poll if still running
    if (state.running) {
      state.pollTimer = setTimeout(poll, pollInterval);
    }
  }

  return {
    async start(): Promise<void> {
      if (state.running) {
        logger.warn("Consumer already running", {
          service: "kafka-consumer",
          groupId,
          instanceName,
        });
        return;
      }

      state.running = true;

      logger.info("Consumer started", {
        service: "kafka-consumer",
        groupId,
        instanceName,
        topics,
        maxRetries,
        enableDLQ,
        pollInterval,
      });

      // Start the polling loop
      await poll();
    },

    async stop(): Promise<void> {
      if (!state.running) return;

      state.running = false;

      if (state.pollTimer) {
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
      }

      // Remove the consumer instance from the group
      try {
        const consumer = kafka.consumer();
        await consumer.delete({
          consumerGroupId: groupId,
          instanceId: instanceName,
        });
      } catch (error) {
        logger.warn("Failed to remove consumer instance", {
          service: "kafka-consumer",
          groupId,
          instanceName,
          error,
        });
      }

      logger.info("Consumer stopped", {
        service: "kafka-consumer",
        groupId,
        instanceName,
      });
    },

    isRunning(): boolean {
      return state.running;
    },
  };
}

// ============================================================================
// Batch Consumer Factory
// ============================================================================

/**
 * Create a Kafka consumer that processes events in batches.
 *
 * Similar to createConsumer but invokes the handler with an array of events
 * for more efficient batch processing (e.g., bulk database inserts).
 *
 * @param config - Consumer configuration
 * @param handler - Async handler function for a batch of events
 * @returns Consumer instance with start/stop lifecycle methods
 */
export function createBatchConsumer<T = unknown>(
  config: ConsumerConfig,
  handler: BatchEventHandler<T>
): Consumer {
  const {
    groupId,
    topics,
    maxBatchSize = 50,
    maxRetries = 3,
    retryBaseDelay = 1000,
    retryMaxDelay = 30000,
    enableDLQ = true,
    pollInterval = 2000,
  } = config;

  const url = process.env.UPSTASH_KAFKA_REST_URL;
  const username = process.env.UPSTASH_KAFKA_REST_USERNAME;
  const password = process.env.UPSTASH_KAFKA_REST_PASSWORD;

  if (!url || !username || !password) {
    throw new Error(
      "Kafka consumer requires UPSTASH_KAFKA_REST_URL, UPSTASH_KAFKA_REST_USERNAME, and UPSTASH_KAFKA_REST_PASSWORD"
    );
  }

  const kafka = new Kafka({ url, username, password });
  const instanceName = `${groupId}-batch-${crypto.randomUUID().slice(0, 8)}`;

  const state: ConsumerState = {
    running: false,
    pollTimer: null,
    kafka,
    instanceName,
  };

  /**
   * Calculate backoff with jitter.
   */
  function calculateBackoff(attempt: number): number {
    const exponentialDelay = retryBaseDelay * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, retryMaxDelay);
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  /**
   * Send failed events to DLQ.
   */
  async function sendBatchToDLQ(
    events: KafkaEvent<T>[],
    error: Error,
    attempts: number
  ): Promise<void> {
    const producer = kafka.producer();

    const messages = events.map((event) => ({
      topic: getDLQTopic(event.topic as Topic),
      value: JSON.stringify({
        originalEvent: event,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        attempts,
        failedAt: new Date().toISOString(),
        consumerGroup: groupId,
        instanceName,
      }),
      key: event.key,
    }));

    try {
      await producer.produceMany(messages);
      logger.warn("Batch sent to DLQ", {
        service: "kafka-consumer",
        groupId,
        count: events.length,
        attempts,
        error: error.message,
      });
    } catch (dlqError) {
      logger.error("Failed to send batch to DLQ", {
        service: "kafka-consumer",
        groupId,
        count: events.length,
        dlqError,
      });
    }
  }

  /**
   * Process a batch of messages with retry logic.
   */
  async function processBatch(events: KafkaEvent<T>[]): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await handler(events);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const backoff = calculateBackoff(attempt);
          logger.warn("Batch processing failed, retrying", {
            service: "kafka-consumer",
            groupId,
            count: events.length,
            attempt: attempt + 1,
            maxRetries,
            backoffMs: backoff,
            error: lastError.message,
          });
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    logger.error("Batch processing failed after all retries", {
      service: "kafka-consumer",
      groupId,
      count: events.length,
      maxRetries,
      error: lastError?.message,
    });

    if (enableDLQ && lastError) {
      await sendBatchToDLQ(events, lastError, maxRetries + 1);
    }
  }

  /**
   * Poll for new messages and process as batch.
   */
  async function poll(): Promise<void> {
    if (!state.running) return;

    try {
      const consumer = kafka.consumer();

      for (const topic of topics) {
        try {
          const messages = await consumer.consume({
            consumerGroupId: groupId,
            instanceId: instanceName,
            topics: [topic],
            autoCommit: true,
            autoOffsetReset: "latest",
          });

          if (messages && messages.length > 0) {
            const batch = messages.slice(0, maxBatchSize);

            const events: KafkaEvent<T>[] = [];
            for (const message of batch) {
              try {
                events.push(JSON.parse(message.value) as KafkaEvent<T>);
              } catch (parseError) {
                logger.error("Failed to parse Kafka message in batch", {
                  service: "kafka-consumer",
                  groupId,
                  topic,
                  offset: message.offset,
                  error: parseError,
                });
              }
            }

            if (events.length > 0) {
              logger.debug("Processing batch", {
                service: "kafka-consumer",
                groupId,
                topic,
                batchSize: events.length,
              });

              await processBatch(events);
            }
          }
        } catch (topicError) {
          logger.error("Failed to consume batch from topic", {
            service: "kafka-consumer",
            groupId,
            topic,
            error: topicError,
          });
        }
      }
    } catch (error) {
      logger.error("Batch consumer poll error", {
        service: "kafka-consumer",
        groupId,
        error,
      });
    }

    if (state.running) {
      state.pollTimer = setTimeout(poll, pollInterval);
    }
  }

  return {
    async start(): Promise<void> {
      if (state.running) return;
      state.running = true;

      logger.info("Batch consumer started", {
        service: "kafka-consumer",
        groupId,
        instanceName,
        topics,
        maxBatchSize,
        maxRetries,
        enableDLQ,
        pollInterval,
      });

      await poll();
    },

    async stop(): Promise<void> {
      if (!state.running) return;
      state.running = false;

      if (state.pollTimer) {
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
      }

      try {
        const consumer = kafka.consumer();
        await consumer.delete({
          consumerGroupId: groupId,
          instanceId: instanceName,
        });
      } catch (error) {
        logger.warn("Failed to remove batch consumer instance", {
          service: "kafka-consumer",
          groupId,
          instanceName,
          error,
        });
      }

      logger.info("Batch consumer stopped", {
        service: "kafka-consumer",
        groupId,
        instanceName,
      });
    },

    isRunning(): boolean {
      return state.running;
    },
  };
}
