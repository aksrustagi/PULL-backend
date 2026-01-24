/**
 * Plaid Webhook Handler
 * Handles Plaid banking webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { PlaidClient, type PlaidWebhookPayload } from "@pull/core/services/plaid";

const plaid = new Hono();

// ==========================================================================
// HELPERS
// ==========================================================================

function getPlaidClient(): PlaidClient {
  return new PlaidClient({
    clientId: process.env.PLAID_CLIENT_ID!,
    secret: process.env.PLAID_SECRET!,
    env: (process.env.PLAID_ENV ?? "sandbox") as "sandbox" | "development" | "production",
  });
}

function getTemporalClient(): Client {
  return new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
}

async function storeWebhookEvent(payload: PlaidWebhookPayload, rawPayload: string): Promise<void> {
  // TODO: Store in Convex webhookEvents table
  console.log(`[Plaid Webhook] Storing event: ${payload.webhook_type}/${payload.webhook_code}`);
}

// ==========================================================================
// WEBHOOK HANDLER
// ==========================================================================

/**
 * POST /webhooks/plaid
 * Handle Plaid webhook events
 */
plaid.post("/", async (c) => {
  const verificationHeader = c.req.header("Plaid-Verification") ?? "";
  const rawBody = await c.req.text();

  try {
    const client = getPlaidClient();

    // Verify webhook (Plaid uses JWT verification)
    const isValid = await client.verifyWebhook(rawBody, {
      "plaid-verification": verificationHeader,
    });

    if (!isValid) {
      console.warn("[Plaid Webhook] Invalid signature");
      return c.json({ success: false, error: "Invalid signature" }, 200);
    }

    // Parse payload
    const payload = client.parseWebhookPayload(rawBody);

    console.log(`[Plaid Webhook] Received: ${payload.webhook_type}/${payload.webhook_code}`);

    // Store raw event
    await storeWebhookEvent(payload, rawBody);

    // Handle by webhook type
    switch (payload.webhook_type) {
      case "AUTH":
        await handleAuthWebhook(payload);
        break;

      case "IDENTITY_VERIFICATION":
        await handleIdentityVerificationWebhook(payload);
        break;

      case "TRANSFER":
        await handleTransferWebhook(payload);
        break;

      case "ITEM":
        await handleItemWebhook(payload);
        break;

      default:
        console.log(`[Plaid Webhook] Unhandled webhook type: ${payload.webhook_type}`);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Plaid Webhook] Error:", error);
    return c.json({ success: false, error: "Processing failed" }, 500);
  }
});

// ==========================================================================
// EVENT HANDLERS
// ==========================================================================

async function handleAuthWebhook(payload: PlaidWebhookPayload): Promise<void> {
  switch (payload.webhook_code) {
    case "AUTOMATICALLY_VERIFIED":
      console.log(`[Plaid Webhook] Auth automatically verified for item: ${payload.item_id}`);
      // Account numbers are now available
      break;

    case "VERIFICATION_EXPIRED":
      console.log(`[Plaid Webhook] Auth verification expired for item: ${payload.item_id}`);
      // User needs to re-verify
      break;

    default:
      console.log(`[Plaid Webhook] Unhandled auth code: ${payload.webhook_code}`);
  }
}

async function handleIdentityVerificationWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const idvId = payload.identity_verification_id;

  switch (payload.webhook_code) {
    case "STATUS_UPDATED":
      console.log(`[Plaid Webhook] IDV status updated: ${idvId}`);

      // Get updated status
      const plaidClient = getPlaidClient();
      const idv = await plaidClient.getIdentityVerification(idvId!);

      console.log(`[Plaid Webhook] IDV new status: ${idv.status}`);

      if (idv.status === "success" || idv.status === "failed") {
        // TODO: Signal workflow if needed
      }
      break;

    case "STEP_UPDATED":
      console.log(`[Plaid Webhook] IDV step updated: ${idvId}`);
      break;

    case "RETRIED":
      console.log(`[Plaid Webhook] IDV retried: ${idvId}`);
      break;

    default:
      console.log(`[Plaid Webhook] Unhandled IDV code: ${payload.webhook_code}`);
  }
}

async function handleTransferWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const transferId = payload.transfer_id;

  switch (payload.webhook_code) {
    case "TRANSFER_EVENTS_UPDATE":
      console.log(`[Plaid Webhook] Transfer events update`);
      // New transfer events available
      // TODO: Process transfer events
      break;

    default:
      console.log(`[Plaid Webhook] Unhandled transfer code: ${payload.webhook_code}`);
  }
}

async function handleItemWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const itemId = payload.item_id;

  switch (payload.webhook_code) {
    case "ERROR":
      console.log(`[Plaid Webhook] Item error: ${itemId}`);
      console.log(`[Plaid Webhook] Error: ${JSON.stringify(payload.error)}`);
      // Item has an error, user may need to re-link
      break;

    case "NEW_ACCOUNTS_AVAILABLE":
      console.log(`[Plaid Webhook] New accounts available for item: ${itemId}`);
      break;

    case "PENDING_EXPIRATION":
      console.log(`[Plaid Webhook] Item consent expiring: ${itemId}`);
      // Consent expires at: payload.consent_expiration_time
      break;

    case "USER_PERMISSION_REVOKED":
      console.log(`[Plaid Webhook] User revoked permission for item: ${itemId}`);
      // Remove item from database
      break;

    default:
      console.log(`[Plaid Webhook] Unhandled item code: ${payload.webhook_code}`);
  }
}

export default plaid;
