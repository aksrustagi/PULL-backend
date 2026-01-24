/**
 * Checkr Webhook Handler
 * Handles Checkr background check webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { CheckrClient, type WebhookEvent } from "@pull/core/services/checkr";

const checkr = new Hono();

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

async function storeWebhookEvent(event: WebhookEvent, rawPayload: string): Promise<void> {
  // TODO: Store in Convex webhookEvents table
  console.log(`[Checkr Webhook] Storing event: ${event.type}`);
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  // TODO: Check if event was already processed (idempotency)
  return false;
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

    console.log(`[Checkr Webhook] Received: ${event.type}`);

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      console.log(`[Checkr Webhook] Event already processed, skipping`);
      return c.json({ success: true, message: "Already processed" });
    }

    // Store raw event
    await storeWebhookEvent(event, rawBody);

    // Handle event types
    switch (event.type) {
      case "report.completed":
        await handleReportCompleted(event);
        break;

      case "report.suspended":
        await handleReportSuspended(event);
        break;

      case "report.created":
        console.log(`[Checkr Webhook] Report created: ${event.data.object.id}`);
        break;

      case "report.upgraded":
        console.log(`[Checkr Webhook] Report upgraded: ${event.data.object.id}`);
        break;

      case "candidate.created":
        console.log(`[Checkr Webhook] Candidate created: ${event.data.object.id}`);
        break;

      case "screening.completed":
        console.log(`[Checkr Webhook] Screening completed: ${event.data.object.id}`);
        break;

      default:
        console.log(`[Checkr Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Checkr Webhook] Error:", error);

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

  console.log(`[Checkr Webhook] Report completed: ${reportId}`);
  console.log(`[Checkr Webhook] Status: ${status}, Result: ${result}, Adjudication: ${adjudication}`);

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
        console.log(`[Checkr Webhook] Signaling workflow: ${workflow.workflowId}`);

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
      console.error(`[Checkr Webhook] Error querying workflow: ${error}`);
    }
  }

  console.warn(`[Checkr Webhook] No matching workflow found for report: ${reportId}`);
}

async function handleReportSuspended(event: WebhookEvent): Promise<void> {
  const reportId = event.data.object.id;

  console.log(`[Checkr Webhook] Report suspended: ${reportId}`);

  // Report suspended usually means additional information needed
  // TODO: Notify user and compliance team
}

export default checkr;
