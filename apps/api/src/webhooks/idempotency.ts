/**
 * Webhook Idempotency Helper
 * Prevents double-processing of webhook events using Convex webhookEvents table
 */

import { getConvexClient } from "../lib/convex";
import { getLogger } from "@pull/core/services";

const logger = getLogger().child({ service: "webhook-idempotency" });

export type WebhookSource = "sumsub" | "checkr" | "plaid" | "parallel_markets";

export interface WebhookEventRecord {
  id: string;
  source: WebhookSource;
  eventType: string;
  eventId: string;
  payload: string;
  receivedAt: number;
  processedAt?: number;
  error?: string;
}

/**
 * Check if a webhook event has already been processed
 * Returns true if the event was already processed (duplicate)
 */
export async function isWebhookEventProcessed(
  source: WebhookSource,
  eventId: string
): Promise<boolean> {
  if (!eventId) {
    logger.warn("No eventId provided for idempotency check", { source });
    return false;
  }

  try {
    const client = getConvexClient();
    const isProcessed = await client.query(
      "kyc:isWebhookEventProcessed" as any,
      { source, eventId }
    );

    if (isProcessed) {
      logger.debug("Duplicate webhook event detected", { source, eventId });
    }

    return isProcessed === true;
  } catch (error) {
    logger.error("Error checking webhook idempotency", { error, source, eventId });
    // On error, allow processing to avoid dropping events
    return false;
  }
}

/**
 * Store a webhook event in the database
 * Returns the record ID for later marking as processed
 */
export async function storeWebhookEvent(
  source: WebhookSource,
  eventType: string,
  eventId: string | undefined,
  payload: string
): Promise<string | null> {
  try {
    const client = getConvexClient();
    const recordId = await client.mutation(
      "kyc:storeWebhookEvent" as any,
      {
        source,
        eventType,
        eventId,
        payload,
      }
    );

    logger.debug("Webhook event stored", { source, eventType, eventId, recordId });
    return recordId as string;
  } catch (error) {
    logger.error("Error storing webhook event", { error, source, eventType, eventId });
    return null;
  }
}

/**
 * Mark a webhook event as successfully processed
 */
export async function markWebhookProcessed(
  recordId: string,
  error?: string
): Promise<void> {
  try {
    const client = getConvexClient();
    await client.mutation(
      "kyc:markWebhookProcessed" as any,
      { id: recordId, error }
    );

    logger.debug("Webhook event marked as processed", { recordId, hasError: !!error });
  } catch (err) {
    logger.error("Error marking webhook as processed", { error: err, recordId });
  }
}

/**
 * Higher-order function to wrap webhook handlers with idempotency logic
 * Automatically checks for duplicates, stores events, and marks as processed
 */
export function withIdempotency<T>(
  source: WebhookSource,
  getEventId: (payload: T) => string | undefined,
  getEventType: (payload: T) => string
) {
  return function (handler: (payload: T, rawPayload: string) => Promise<void>) {
    return async function (payload: T, rawPayload: string): Promise<{ skipped: boolean; reason?: string }> {
      const eventId = getEventId(payload);
      const eventType = getEventType(payload);

      // Check if already processed
      if (eventId) {
        const isDuplicate = await isWebhookEventProcessed(source, eventId);
        if (isDuplicate) {
          return { skipped: true, reason: "Already processed" };
        }
      }

      // Store the event
      const recordId = await storeWebhookEvent(source, eventType, eventId, rawPayload);

      try {
        // Process the event
        await handler(payload, rawPayload);

        // Mark as processed
        if (recordId) {
          await markWebhookProcessed(recordId);
        }

        return { skipped: false };
      } catch (error) {
        // Mark as failed
        if (recordId) {
          await markWebhookProcessed(recordId, error instanceof Error ? error.message : "Unknown error");
        }
        throw error;
      }
    };
  };
}

/**
 * Generate a composite event ID for webhooks that don't have a unique ID
 * Uses a combination of fields to create a unique identifier
 */
export function generateCompositeEventId(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(":");
}
