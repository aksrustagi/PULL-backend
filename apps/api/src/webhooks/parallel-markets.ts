/**
 * Parallel Markets Webhook Handler
 * Handles accreditation verification webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { ParallelMarketsClient, type WebhookEvent } from "@pull/core/services/parallel-markets";

const parallelMarkets = new Hono();

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
  // TODO: Store in Convex webhookEvents table
  console.log(`[Parallel Markets Webhook] Storing event: ${event.type}`);
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  // TODO: Check if event was already processed (idempotency)
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

    console.log(`[Parallel Markets Webhook] Received: ${event.type}`);

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      console.log(`[Parallel Markets Webhook] Event already processed, skipping`);
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
        console.log(`[Parallel Markets Webhook] Accreditation pending: ${event.data.request_id}`);
        break;

      case "accreditation.document_requested":
        console.log(`[Parallel Markets Webhook] Documents requested: ${event.data.request_id}`);
        break;

      case "accreditation.document_received":
        console.log(`[Parallel Markets Webhook] Documents received: ${event.data.request_id}`);
        break;

      case "identity.verified":
        console.log(`[Parallel Markets Webhook] Identity verified: ${event.data.investor_id}`);
        break;

      case "identity.failed":
        console.log(`[Parallel Markets Webhook] Identity failed: ${event.data.investor_id}`);
        break;

      default:
        console.log(`[Parallel Markets Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Parallel Markets Webhook] Error:", error);

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

  console.log(`[Parallel Markets Webhook] Accreditation approved: ${requestId}`);

  // Get full accreditation details
  const client = getParallelMarketsClient();
  const accreditation = await client.getAccreditationStatus(requestId);

  console.log(`[Parallel Markets Webhook] Method: ${accreditation.method}`);
  console.log(`[Parallel Markets Webhook] Expires: ${accreditation.expires_at}`);

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
        console.log(`[Parallel Markets Webhook] Signaling workflow: ${workflow.workflowId}`);

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
      console.error(`[Parallel Markets Webhook] Error querying workflow: ${error}`);
    }
  }

  console.warn(`[Parallel Markets Webhook] No matching workflow found for request: ${requestId}`);
}

async function handleAccreditationRejected(event: WebhookEvent): Promise<void> {
  const requestId = event.data.request_id!;
  const reason = event.data.reason;

  console.log(`[Parallel Markets Webhook] Accreditation rejected: ${requestId}`);
  console.log(`[Parallel Markets Webhook] Reason: ${reason}`);

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
        console.log(`[Parallel Markets Webhook] Signaling workflow: ${workflow.workflowId}`);

        await handle.signal("accreditationCompleted", {
          requestId,
          status: "rejected",
          rejectionReason: reason,
        });

        return;
      }
    } catch (error) {
      console.error(`[Parallel Markets Webhook] Error querying workflow: ${error}`);
    }
  }
}

async function handleAccreditationExpired(event: WebhookEvent): Promise<void> {
  const requestId = event.data.request_id!;

  console.log(`[Parallel Markets Webhook] Accreditation expired: ${requestId}`);

  // TODO: Notify user that their accreditation has expired
  // TODO: Update database status
}

export default parallelMarkets;
