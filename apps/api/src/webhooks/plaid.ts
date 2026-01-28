/**
 * Plaid Webhook Handler
 * Handles Plaid banking webhooks
 */

import { Hono } from "hono";
import { Client } from "@temporalio/client";
import { PlaidClient, type PlaidWebhookPayload } from "@pull/core/services/plaid";
import { getLogger } from "@pull/core/services";

const plaid = new Hono();
const logger = getLogger().child({ service: "plaid-webhook" });

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
  // WEBHOOK_TODO: Webhook processing enhancement pending
  logger.info("Storing webhook event", {
    webhookType: payload.webhook_type,
    webhookCode: payload.webhook_code,
  });
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
      logger.warn("Invalid webhook signature");
      return c.json({ success: false, error: "Invalid signature" }, 200);
    }

    // Parse payload
    const payload = client.parseWebhookPayload(rawBody);

    logger.info("Webhook received", {
      webhookType: payload.webhook_type,
      webhookCode: payload.webhook_code,
      itemId: payload.item_id,
    });

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
        logger.info("Unhandled webhook type", { webhookType: payload.webhook_type });
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Webhook processing error", { error });
    return c.json({ success: false, error: "Processing failed" }, 500);
  }
});

// ==========================================================================
// EVENT HANDLERS
// ==========================================================================

async function handleAuthWebhook(payload: PlaidWebhookPayload): Promise<void> {
  switch (payload.webhook_code) {
    case "AUTOMATICALLY_VERIFIED":
      logger.info("Auth automatically verified", { itemId: payload.item_id });
      // Account numbers are now available
      break;

    case "VERIFICATION_EXPIRED":
      logger.warn("Auth verification expired", { itemId: payload.item_id });
      // User needs to re-verify
      break;

    default:
      logger.info("Unhandled auth webhook code", {
        webhookCode: payload.webhook_code,
        itemId: payload.item_id,
      });
  }
}

async function handleIdentityVerificationWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const idvId = payload.identity_verification_id;

  switch (payload.webhook_code) {
    case "STATUS_UPDATED":
      logger.info("IDV status updated", { idvId });

      // Get updated status
      const plaidClient = getPlaidClient();
      const idv = await plaidClient.getIdentityVerification(idvId!);

      logger.info("IDV new status", { idvId, status: idv.status });

      if (idv.status === "success" || idv.status === "failed") {
        // WEBHOOK_TODO: Webhook processing enhancement pending
      }
      break;

    case "STEP_UPDATED":
      logger.info("IDV step updated", { idvId });
      break;

    case "RETRIED":
      logger.info("IDV retried", { idvId });
      break;

    default:
      logger.info("Unhandled IDV webhook code", {
        webhookCode: payload.webhook_code,
        idvId,
      });
  }
}

async function handleTransferWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const transferId = payload.transfer_id;

  switch (payload.webhook_code) {
    case "TRANSFER_EVENTS_UPDATE":
      logger.info("Transfer events update", { transferId });
      // New transfer events available
      // WEBHOOK_TODO: Webhook processing enhancement pending
      break;

    default:
      logger.info("Unhandled transfer webhook code", {
        webhookCode: payload.webhook_code,
        transferId,
      });
  }
}

async function handleItemWebhook(payload: PlaidWebhookPayload): Promise<void> {
  const itemId = payload.item_id;

  switch (payload.webhook_code) {
    case "ERROR":
      logger.error("Item error", {
        itemId,
        error: payload.error,
      });
      // Item has an error, user may need to re-link
      break;

    case "NEW_ACCOUNTS_AVAILABLE":
      logger.info("New accounts available", { itemId });
      break;

    case "PENDING_EXPIRATION":
      logger.warn("Item consent expiring", {
        itemId,
        expirationTime: (payload as any).consent_expiration_time,
      });
      break;

    case "USER_PERMISSION_REVOKED":
      logger.warn("User revoked permission", { itemId });
      // Remove item from database
      break;

    default:
      logger.info("Unhandled item webhook code", {
        webhookCode: payload.webhook_code,
        itemId,
      });
  }
}

export default plaid;
