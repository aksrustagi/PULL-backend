/**
 * Parallel Markets Webhook Handler
 * Handles accreditation verification webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { ParallelMarketsClient, type WebhookEvent } from "@pull/core/services/parallel-markets";
import { getLogger } from "@pull/core/services";

const parallelMarkets = new Hono();
const logger = getLogger().child({ service: "parallel-markets-webhook" });

// ==========================================================================
// HELPERS
// ==========================================================================

function getParallelMarketsClient(): ParallelMarketsClient {
  return new ParallelMarketsClient({
    apiKey: process.env.PARALLEL_API_KEY!,
    webhookSecret: process.env.PARALLEL_WEBHOOK_SECRET,
  });
}

function getTemporalClient(): Client {
  return new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
}

async function storeWebhookEvent(event: WebhookEvent, rawPayload: string): Promise<void> {
  // WEBHOOK_TODO: Webhook processing enhancement pending
  logger.info("Storing webhook event", { eventType: event.type, eventId: event.id });
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  // WEBHOOK_TODO: Webhook processing enhancement pending
  return false;
}

// ==========================================================================
// WEBHOOK HANDLER
// ==========================================================================

/**
 * POST /webhooks/parallel
 * Handle Parallel Markets webhook events
 */
parallelMarkets.post("/", async (c) => {
  const signature = c.req.header("X-Signature") ?? "";
  const rawBody = await c.req.text();

  try {
    const client = getParallelMarketsClient();

    // Verify and parse webhook
    const event = client.verifyAndParseWebhook(rawBody, signature);

    logger.info("Webhook received", {
      eventType: event.type,
      eventId: event.id,
      requestId: event.data?.request_id,
      investorId: event.data?.investor_id,
    });

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      logger.debug("Event already processed, skipping", { eventId: event.id });
      return c.json({ success: true, message: "Already processed" });
    }

    // Store raw event
    await storeWebhookEvent(event, rawBody);

    // Handle event types
    switch (event.type) {
      case "accreditation.approved":
        await handleAccreditationApproved(event);
        break;

      case "accreditation.rejected":
        await handleAccreditationRejected(event);
        break;

      case "accreditation.expired":
        await handleAccreditationExpired(event);
        break;

      case "accreditation.pending":
        logger.info("Accreditation pending", { requestId: event.data.request_id });
        break;

      case "accreditation.document_requested":
        logger.info("Documents requested", { requestId: event.data.request_id });
        break;

      case "accreditation.document_received":
        logger.info("Documents received", { requestId: event.data.request_id });
        break;

      case "identity.verified":
        logger.info("Identity verified", { investorId: event.data.investor_id });
        break;

      case "identity.failed":
        logger.warn("Identity verification failed", { investorId: event.data.investor_id });
        break;

      default:
        logger.info("Unhandled event type", { eventType: event.type });
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

async function handleAccreditationApproved(event: WebhookEvent): Promise<void> {
  const requestId = event.data.request_id!;

  logger.info("Accreditation approved", { requestId });

  // Get full accreditation details
  const client = getParallelMarketsClient();
  const accreditation = await client.getAccreditationStatus(requestId);

  logger.info("Accreditation details", {
    requestId,
    method: accreditation.method,
    expiresAt: accreditation.expires_at,
  });

  const temporalClient = getTemporalClient();

  // Find active workflow for this accreditation request
  const workflows = temporalClient.workflow.list({
    query: `WorkflowId STARTS_WITH "kyc-" AND ExecutionStatus = "Running"`,
  });

  for await (const workflow of workflows) {
    try {
      const handle = temporalClient.workflow.getHandle(workflow.workflowId);

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

      if (workflowStatus.parallelRequestId === requestId) {
        logger.info("Signaling workflow", { workflowId: workflow.workflowId, requestId });

        await handle.signal("accreditationCompleted", {
          requestId,
          status: "approved",
          method: accreditation.method ?? undefined,
          expiresAt: accreditation.expires_at
            ? new Date(accreditation.expires_at).getTime()
            : undefined,
        });

        return;
      }
    } catch (error) {
      logger.error("Error querying workflow", { error, workflowId: workflow.workflowId });
    }
  }

  logger.warn("No matching workflow found for request", { requestId });
}

async function handleAccreditationRejected(event: WebhookEvent): Promise<void> {
  const requestId = event.data.request_id!;
  const reason = event.data.reason;

  logger.warn("Accreditation rejected", { requestId, reason });

  const temporalClient = getTemporalClient();

  const workflows = temporalClient.workflow.list({
    query: `WorkflowId STARTS_WITH "kyc-" AND ExecutionStatus = "Running"`,
  });

  for await (const workflow of workflows) {
    try {
      const handle = temporalClient.workflow.getHandle(workflow.workflowId);

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

      if (workflowStatus.parallelRequestId === requestId) {
        logger.info("Signaling workflow", { workflowId: workflow.workflowId, requestId });

        await handle.signal("accreditationCompleted", {
          requestId,
          status: "rejected",
          rejectionReason: reason,
        });

        return;
      }
    } catch (error) {
      logger.error("Error querying workflow", { error, workflowId: workflow.workflowId });
    }
  }
}

async function handleAccreditationExpired(event: WebhookEvent): Promise<void> {
  const requestId = event.data.request_id!;

  logger.warn("Accreditation expired", { requestId });

  // WEBHOOK_TODO: Webhook processing enhancement pending
  // WEBHOOK_TODO: Webhook processing enhancement pending
}

export default parallelMarkets;
