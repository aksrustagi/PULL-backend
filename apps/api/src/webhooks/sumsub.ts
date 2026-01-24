/**
 * Sumsub Webhook Handler
 * Handles Sumsub KYC verification webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { SumsubClient, type WebhookPayload } from "@pull/core/services/sumsub";

const sumsub = new Hono();

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

async function storeWebhookEvent(payload: WebhookPayload, rawPayload: string): Promise<void> {
  // TODO: Store in Convex webhookEvents table
  console.log(`[Sumsub Webhook] Storing event: ${payload.type} for applicant: ${payload.applicantId}`);
}

async function isEventProcessed(applicantId: string, eventType: string, createdAtMs: string): Promise<boolean> {
  // TODO: Check if event was already processed (idempotency)
  return false;
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

    console.log(`[Sumsub Webhook] Received: ${payload.type} for applicant: ${payload.applicantId}`);

    // Check idempotency
    const alreadyProcessed = await isEventProcessed(
      payload.applicantId,
      payload.type,
      payload.createdAtMs ?? ""
    );
    if (alreadyProcessed) {
      console.log(`[Sumsub Webhook] Event already processed, skipping`);
      return c.json({ success: true, message: "Already processed" });
    }

    // Store raw event
    await storeWebhookEvent(payload, rawBody);

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
        console.log(`[Sumsub Webhook] Applicant created: ${payload.applicantId}`);
        break;

      case "applicantPrechecked":
        console.log(`[Sumsub Webhook] Applicant prechecked: ${payload.applicantId}`);
        break;

      case "applicantReset":
        console.log(`[Sumsub Webhook] Applicant reset: ${payload.applicantId}`);
        break;

      default:
        console.log(`[Sumsub Webhook] Unhandled event type: ${payload.type}`);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Sumsub Webhook] Error:", error);

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
  console.log(`[Sumsub Webhook] Applicant reviewed: ${payload.applicantId}`);
  console.log(`[Sumsub Webhook] Review status: ${payload.reviewStatus}`);
  console.log(`[Sumsub Webhook] Review result: ${JSON.stringify(payload.reviewResult)}`);

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
        console.log(`[Sumsub Webhook] Signaling workflow: ${workflow.workflowId}`);

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
      console.error(`[Sumsub Webhook] Error querying workflow: ${error}`);
    }
  }

  console.warn(`[Sumsub Webhook] No matching workflow found for applicant: ${payload.applicantId}`);
}

async function handleApplicantPending(payload: WebhookPayload): Promise<void> {
  console.log(`[Sumsub Webhook] Applicant pending: ${payload.applicantId}`);

  // Update database status to pending
  // TODO: Call Convex mutation
}

async function handleApplicantOnHold(payload: WebhookPayload): Promise<void> {
  console.log(`[Sumsub Webhook] Applicant on hold: ${payload.applicantId}`);

  // This usually means manual review is needed
  // TODO: Create alert/task for compliance team
}

export default sumsub;
