/**
 * Sumsub Webhook Handler
 * Handles Sumsub KYC verification webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { SumsubClient, type WebhookPayload } from "@pull/core/services/sumsub";
import { getLogger } from "@pull/core/services";
import {
  isWebhookEventProcessed,
  storeWebhookEvent,
  markWebhookProcessed,
  generateCompositeEventId,
} from "./idempotency";

const sumsub = new Hono();
const logger = getLogger().child({ service: "sumsub-webhook" });

// ==========================================================================
// HELPERS
// ==========================================================================

function getSumsubClient(): SumsubClient {
  return new SumsubClient({
    appToken: process.env.SUMSUB_APP_TOKEN!,
    secretKey: process.env.SUMSUB_SECRET_KEY!,
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET,
  });
}

function getTemporalClient(): Client {
  return new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
}

async function storeWebhookEventLocal(payload: WebhookPayload, rawPayload: string): Promise<string | null> {
  // Sumsub doesn't provide a unique event ID, so we generate a composite one
  const eventId = generateCompositeEventId(
    payload.applicantId,
    payload.type,
    payload.createdAtMs
  );
  logger.info("Storing webhook event", {
    eventType: payload.type,
    applicantId: payload.applicantId,
    eventId,
  });
  return await storeWebhookEvent("sumsub", payload.type, eventId, rawPayload);
}

async function isEventProcessed(applicantId: string, eventType: string, createdAtMs: string): Promise<boolean> {
  // Generate composite event ID for idempotency check
  const eventId = generateCompositeEventId(applicantId, eventType, createdAtMs);
  return await isWebhookEventProcessed("sumsub", eventId);
}

// ==========================================================================
// WEBHOOK HANDLER
// ==========================================================================

/**
 * POST /webhooks/sumsub
 * Handle Sumsub webhook events
 */
sumsub.post("/", async (c) => {
  const signature = c.req.header("X-Payload-Digest") ?? "";
  const rawBody = await c.req.text();

  try {
    const client = getSumsubClient();

    // Verify and parse webhook
    const payload = client.verifyAndParseWebhook(rawBody, signature);

    logger.info("Webhook received", {
      eventType: payload.type,
      applicantId: payload.applicantId,
      reviewStatus: payload.reviewStatus,
    });

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(
      payload.applicantId,
      payload.type,
      payload.createdAtMs ?? ""
    );
    if (alreadyProcessed) {
      logger.debug("Event already processed, skipping", { applicantId: payload.applicantId });
      return c.json({ success: true, message: "Already processed" });
    }

    // Store raw event and get record ID for marking as processed
    const recordId = await storeWebhookEventLocal(payload, rawBody);

    let processingError: string | undefined;
    try {
      // Handle event types
      switch (payload.type) {
        case "applicantReviewed":
          await handleApplicantReviewed(payload);
          break;

        case "applicantPending":
          await handleApplicantPending(payload);
          break;

        case "applicantOnHold":
          await handleApplicantOnHold(payload);
          break;

        case "applicantCreated":
          logger.info("Applicant created", { applicantId: payload.applicantId });
          break;

        case "applicantPrechecked":
          logger.info("Applicant prechecked", { applicantId: payload.applicantId });
          break;

        case "applicantReset":
          logger.info("Applicant reset", { applicantId: payload.applicantId });
          break;

        default:
          logger.info("Unhandled event type", { eventType: payload.type });
      }
    } catch (handlerError) {
      processingError = handlerError instanceof Error ? handlerError.message : "Handler error";
      throw handlerError;
    } finally {
      // Mark event as processed (with or without error)
      if (recordId) {
        await markWebhookProcessed(recordId, processingError);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Webhook processing error", { error });

    // Return 200 to prevent retries for invalid signatures
    if (error instanceof Error && error.message.includes("signature")) {
      return c.json({ success: false, error: "Invalid signature" }, 200);
    }

    return c.json({ success: false, error: "Processing failed" }, 500);
  }
});

// ==========================================================================
// EVENT HANDLERS
// ==========================================================================

async function handleApplicantReviewed(payload: WebhookPayload): Promise<void> {
  logger.info("Applicant reviewed", {
    applicantId: payload.applicantId,
    reviewStatus: payload.reviewStatus,
    reviewAnswer: payload.reviewResult?.reviewAnswer,
  });

  const temporalClient = getTemporalClient();

  // Find active workflow for this applicant
  const workflows = temporalClient.workflow.list({
    query: `WorkflowId STARTS_WITH "kyc-" AND ExecutionStatus = "Running"`,
  });

  for await (const workflow of workflows) {
    try {
      const handle = temporalClient.workflow.getHandle(workflow.workflowId);
      const status = await handle.query("getKYCStatus");

      if (status.sumsubApplicantId === payload.applicantId) {
        logger.info("Signaling workflow", {
          workflowId: workflow.workflowId,
          applicantId: payload.applicantId,
        });

        // Signal workflow with result
        await handle.signal("sumsubCompleted", {
          applicantId: payload.applicantId,
          reviewStatus: payload.reviewStatus ?? "completed",
          reviewAnswer: payload.reviewResult?.reviewAnswer ?? "ERROR",
          rejectLabels: payload.reviewResult?.rejectLabels,
          moderationComment: payload.reviewResult?.moderationComment,
        });

        return;
      }
    } catch (error) {
      // Continue searching
      logger.error("Error querying workflow", { error, workflowId: workflow.workflowId });
    }
  }

  logger.warn("No matching workflow found for applicant", { applicantId: payload.applicantId });
}

async function handleApplicantPending(payload: WebhookPayload): Promise<void> {
  logger.info("Applicant pending", { applicantId: payload.applicantId });

  // Update database status to pending
  // TODO: Call Convex mutation
}

async function handleApplicantOnHold(payload: WebhookPayload): Promise<void> {
  logger.warn("Applicant on hold", { applicantId: payload.applicantId });

  // This usually means manual review is needed
  // TODO: Create alert/task for compliance team
}

export default sumsub;
