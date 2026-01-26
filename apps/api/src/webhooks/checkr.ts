/**
 * Checkr Webhook Handler
 * Handles Checkr background check webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { CheckrClient, type WebhookEvent } from "@pull/core/services/checkr";
import { getLogger } from "@pull/core/services";
import {
  isWebhookEventProcessed,
  storeWebhookEvent,
  markWebhookProcessed,
} from "./idempotency";

const checkr = new Hono();
const logger = getLogger().child({ service: "checkr-webhook" });

// ==========================================================================
// HELPERS
// ==========================================================================

function getCheckrClient(): CheckrClient {
  return new CheckrClient({
    apiKey: process.env.CHECKR_API_KEY!,
    webhookSecret: process.env.CHECKR_WEBHOOK_SECRET,
  });
}

function getTemporalClient(): Client {
  return new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
}

async function storeWebhookEventLocal(event: WebhookEvent, rawPayload: string): Promise<string | null> {
  logger.info("Storing webhook event", { eventType: event.type, eventId: event.id });
  return await storeWebhookEvent("checkr", event.type, event.id, rawPayload);
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  return await isWebhookEventProcessed("checkr", eventId);
}

// ==========================================================================
// WEBHOOK HANDLER
// ==========================================================================

/**
 * POST /webhooks/checkr
 * Handle Checkr webhook events
 */
checkr.post("/", async (c) => {
  const signature = c.req.header("X-Checkr-Signature") ?? "";
  const rawBody = await c.req.text();

  try {
    const client = getCheckrClient();

    // Verify and parse webhook
    const event = client.verifyAndParseWebhook(rawBody, signature);

    logger.info("Webhook received", {
      eventType: event.type,
      eventId: event.id,
      objectId: event.data?.object?.id,
    });

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      logger.debug("Event already processed, skipping", { eventId: event.id });
      return c.json({ success: true, message: "Already processed" });
    }

    // Store raw event and get record ID for marking as processed
    const recordId = await storeWebhookEventLocal(event, rawBody);

    let processingError: string | undefined;
    try {
      // Handle event types
      switch (event.type) {
        case "report.completed":
          await handleReportCompleted(event);
          break;

        case "report.suspended":
          await handleReportSuspended(event);
          break;

        case "report.created":
          logger.info("Report created", { reportId: event.data.object.id });
          break;

        case "report.upgraded":
          logger.info("Report upgraded", { reportId: event.data.object.id });
          break;

        case "candidate.created":
          logger.info("Candidate created", { candidateId: event.data.object.id });
          break;

        case "screening.completed":
          logger.info("Screening completed", { screeningId: event.data.object.id });
          break;

        default:
          logger.info("Unhandled event type", { eventType: event.type });
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

    if (error instanceof Error && error.message.includes("signature")) {
      return c.json({ success: false, error: "Invalid signature" }, 200);
    }

    return c.json({ success: false, error: "Processing failed" }, 500);
  }
});

// ==========================================================================
// EVENT HANDLERS
// ==========================================================================

async function handleReportCompleted(event: WebhookEvent): Promise<void> {
  const reportId = event.data.object.id;
  const status = event.data.object.status as string;
  const result = event.data.object.result as string | null;
  const adjudication = event.data.object.adjudication as string | null;

  logger.info("Report completed", {
    reportId,
    status,
    result,
    adjudication,
  });

  const temporalClient = getTemporalClient();

  // Find active workflow for this report
  const workflows = temporalClient.workflow.list({
    query: `WorkflowId STARTS_WITH "kyc-" AND ExecutionStatus = "Running"`,
  });

  for await (const workflow of workflows) {
    try {
      const handle = temporalClient.workflow.getHandle(workflow.workflowId);

      // Try to get KYC status (could be onboarding or upgrade workflow)
      let workflowStatus;
      try {
        workflowStatus = await handle.query("getKYCStatus");
      } catch {
        try {
          workflowStatus = await handle.query("getUpgradeStatus");
        } catch {
          continue;
        }
      }

      if (workflowStatus.checkrReportId === reportId) {
        logger.info("Signaling workflow", { workflowId: workflow.workflowId, reportId });

        // Map result to signal format
        const signalResult = result === "clear" ? "clear"
          : result === "consider" ? "consider"
          : adjudication === "adverse_action" ? "adverse_action"
          : null;

        await handle.signal("checkrCompleted", {
          reportId,
          status: status as "complete" | "suspended" | "dispute",
          result: signalResult as "clear" | "consider" | "adverse_action" | null,
        });

        return;
      }
    } catch (error) {
      logger.error("Error querying workflow", { error, workflowId: workflow.workflowId });
    }
  }

  logger.warn("No matching workflow found for report", { reportId });
}

async function handleReportSuspended(event: WebhookEvent): Promise<void> {
  const reportId = event.data.object.id;

  logger.warn("Report suspended", { reportId });

  // Report suspended usually means additional information needed
  // TODO: Notify user and compliance team
}

export default checkr;
