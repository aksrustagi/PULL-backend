/**
 * Webhook Routes for PULL API
 * Handles incoming webhooks from external services with signature verification
 */

import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { convexUsers, convexAudit, convexWebhooks } from "../lib/convex";

const app = new Hono();

// ============================================================================
// Signature Verification Helpers
// ============================================================================

/**
 * Verify HMAC signature (used by most services)
 */
function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = "sha256"
): boolean {
  try {
    const expectedSignature = createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify Persona webhook signature
 */
function verifyPersonaSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    // Persona signature format: t=<timestamp>,v1=<signature>
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) return false;

    const timestamp = timestampPart.substring(2);
    const signature = signaturePart.substring(3);

    // Check timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    if (Math.abs(now - webhookTime) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Verify Plaid webhook signature
 */
function verifyPlaidSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    // Plaid-Verification header format similar to Persona
    const parts = signatureHeader.split(",");
    const signature = parts
      .find((p) => p.startsWith("sha256="))
      ?.substring(7);

    if (!signature) return false;

    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Verify Fireblocks webhook signature (RSA)
 */
async function verifyFireblocksSignature(
  payload: string,
  signatureHeader: string,
  publicKey: string
): Promise<boolean> {
  try {
    const signature = Buffer.from(signatureHeader, "base64");
    const { webcrypto } = await import("crypto");

    const key = await webcrypto.subtle.importKey(
      "spki",
      Buffer.from(publicKey, "base64"),
      { name: "RSA-PKCS1-v1_5", hash: "SHA-512" },
      false,
      ["verify"]
    );

    return await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      Buffer.from(payload)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Persona Webhook (KYC/Identity Verification)
// ============================================================================

app.post("/persona", async (c) => {
  const signatureHeader = c.req.header("Persona-Signature");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "persona",
      eventType: parsed.data?.attributes?.name ?? "unknown",
      externalId: parsed.data?.id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify signature
  const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    const isValid = verifyPersonaSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Persona webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.data?.attributes?.name;
    const inquiryId = body.data?.id;

    console.log("Persona webhook:", eventType, inquiryId);

    switch (eventType) {
      case "inquiry.created":
        // Inquiry started - no action needed
        break;

      case "inquiry.completed": {
        const status = body.data?.attributes?.status;
        const referenceId = body.data?.attributes?.["reference-id"]; // User ID

        if (referenceId) {
          let kycStatus: string;
          let kycTier: string;

          if (status === "approved") {
            kycStatus = "approved";
            kycTier = "tier1"; // Basic KYC
          } else if (status === "declined") {
            kycStatus = "rejected";
            kycTier = "none";
          } else {
            kycStatus = "pending_review";
            kycTier = "none";
          }

          await convexUsers.updateKYCStatus({
            id: referenceId,
            kycStatus,
            kycTier,
          });

          await convexAudit.log({
            userId: referenceId,
            action: "kyc.status_updated",
            resourceType: "users",
            resourceId: referenceId,
            metadata: { status, inquiryId, kycTier },
          });
        }
        break;
      }

      case "inquiry.expired": {
        const referenceId = body.data?.attributes?.["reference-id"];
        if (referenceId) {
          await convexUsers.updateKYCStatus({
            id: referenceId,
            kycStatus: "expired",
          });
        }
        break;
      }

      case "verification.created":
      case "verification.passed":
      case "verification.failed":
      case "verification.requires-retry":
        // Log verification events
        console.log("Persona verification event:", eventType, body.data?.id);
        break;
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Persona webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Plaid Webhook (Banking/Transfers)
// ============================================================================

app.post("/plaid", async (c) => {
  const signatureHeader = c.req.header("Plaid-Verification");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "plaid",
      eventType: `${parsed.webhook_type}.${parsed.webhook_code}`,
      externalId: parsed.item_id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify signature
  const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    const isValid = verifyPlaidSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Plaid webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const { webhook_type, webhook_code, item_id } = body;

    console.log("Plaid webhook:", webhook_type, webhook_code, item_id);

    switch (webhook_type) {
      case "ITEM":
        switch (webhook_code) {
          case "ERROR":
          case "PENDING_EXPIRATION":
          case "LOGIN_REPAIRED":
            // Handle item status changes
            // TODO: Notify user and update linked account status
            console.log("Plaid item event:", webhook_code, item_id);
            break;
        }
        break;

      case "AUTH":
        switch (webhook_code) {
          case "DEFAULT_UPDATE":
            // Auth data updated
            console.log("Plaid auth updated:", item_id);
            break;
        }
        break;

      case "TRANSFER":
        switch (webhook_code) {
          case "TRANSFER_EVENTS_UPDATE": {
            // Transfer status changed
            const { transfer_id, event_type, amount, transfer_type } = body;
            console.log("Plaid transfer event:", event_type, transfer_id, amount);

            // TODO: Update deposit/withdrawal records based on transfer status
            // event_type: pending, posted, settled, failed, returned

            await convexAudit.log({
              action: `plaid.transfer.${event_type}`,
              resourceType: "transfers",
              resourceId: transfer_id,
              metadata: { amount, transfer_type, item_id },
            });
            break;
          }
        }
        break;

      case "TRANSACTIONS":
        switch (webhook_code) {
          case "SYNC_UPDATES_AVAILABLE":
            // New transactions available
            console.log("Plaid transactions sync available:", item_id);
            break;
          case "TRANSACTIONS_REMOVED":
            // Transactions removed
            console.log("Plaid transactions removed:", body.removed_transactions);
            break;
        }
        break;
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Plaid webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Fireblocks Webhook (Crypto Custody)
// ============================================================================

app.post("/fireblocks", async (c) => {
  const signatureHeader = c.req.header("Fireblocks-Signature");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "fireblocks",
      eventType: parsed.type,
      externalId: parsed.data?.id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify signature
  const publicKey = process.env.FIREBLOCKS_WEBHOOK_PUBLIC_KEY;
  if (publicKey && signatureHeader) {
    const isValid = await verifyFireblocksSignature(rawBody, signatureHeader, publicKey);
    if (!isValid) {
      console.error("Invalid Fireblocks webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;

    console.log("Fireblocks webhook:", eventType);

    switch (eventType) {
      case "TRANSACTION_STATUS_UPDATED": {
        const { id, status, txHash, assetId, amount, sourceId, destinationId } = body.data;

        console.log("Fireblocks transaction:", id, status, amount, assetId);

        // Handle different transaction statuses
        if (status === "COMPLETED") {
          // TODO: Credit user balance for deposits, update withdrawal status
          await convexAudit.log({
            action: "fireblocks.transaction_completed",
            resourceType: "transactions",
            resourceId: id,
            metadata: { txHash, assetId, amount, sourceId, destinationId },
          });
        } else if (status === "FAILED" || status === "REJECTED" || status === "CANCELLED") {
          // TODO: Handle failed transactions
          await convexAudit.log({
            action: `fireblocks.transaction_${status.toLowerCase()}`,
            resourceType: "transactions",
            resourceId: id,
            metadata: { status, assetId, amount },
          });
        }
        break;
      }

      case "VAULT_ACCOUNT_ASSET_BALANCE_UPDATED": {
        const { vaultAccountId, assetId, available, pending, frozen } = body.data;
        console.log("Fireblocks balance update:", vaultAccountId, assetId, available);

        // TODO: Sync vault balance with internal records
        break;
      }

      case "EXTERNAL_WALLET_ASSET_ADDED": {
        const { walletId, assetId, address } = body.data;
        console.log("Fireblocks external wallet added:", walletId, assetId, address);
        break;
      }

      case "VAULT_ACCOUNT_CREATED": {
        const { vaultAccountId, name } = body.data;
        console.log("Fireblocks vault created:", vaultAccountId, name);
        break;
      }
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Fireblocks webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Checkr Webhook (Background Checks)
// ============================================================================

app.post("/checkr", async (c) => {
  const signatureHeader = c.req.header("X-Checkr-Signature");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "checkr",
      eventType: parsed.type,
      externalId: parsed.data?.object?.id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify signature
  const webhookSecret = process.env.CHECKR_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    const isValid = verifyHmacSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Checkr webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const data = body.data?.object;

    console.log("Checkr webhook:", eventType, data?.id);

    switch (eventType) {
      case "report.completed": {
        const { id, status, candidate_id, package: checkPackage } = data;
        console.log("Checkr report completed:", id, status);

        // status can be: clear, consider, or alert
        // TODO: Update user KYC status based on background check result
        // Lookup user by candidate_id (stored during check initiation)

        await convexAudit.log({
          action: "checkr.report_completed",
          resourceType: "background_checks",
          resourceId: id,
          metadata: { status, candidate_id, package: checkPackage },
        });
        break;
      }

      case "report.suspended": {
        const { id, candidate_id } = data;
        console.log("Checkr report suspended:", id);

        await convexAudit.log({
          action: "checkr.report_suspended",
          resourceType: "background_checks",
          resourceId: id,
          metadata: { candidate_id },
        });
        break;
      }

      case "candidate.created":
      case "candidate.updated":
        console.log("Checkr candidate event:", eventType, data?.id);
        break;
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Checkr webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Nylas Webhook (Email Sync)
// ============================================================================

app.post("/nylas", async (c) => {
  const rawBody = await c.req.text();

  // Handle Nylas challenge verification
  try {
    const body = JSON.parse(rawBody);
    if (body.challenge) {
      return c.text(body.challenge);
    }
  } catch {
    // Not a challenge request
  }

  // Verify signature
  const signatureHeader = c.req.header("X-Nylas-Signature");
  const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    const isValid = verifyHmacSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Nylas webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "nylas",
      eventType: parsed.deltas?.[0]?.type ?? "unknown",
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  try {
    const body = JSON.parse(rawBody);
    const deltas = body.deltas ?? [];

    console.log("Nylas webhook:", deltas.length, "deltas");

    for (const delta of deltas) {
      const { type, object, object_data } = delta;

      switch (type) {
        case "message.created": {
          console.log("Nylas message created:", object_data?.id);
          // TODO: Trigger email triage workflow
          // Fetch full message and process with AI
          break;
        }

        case "message.updated": {
          console.log("Nylas message updated:", object_data?.id);
          // Handle read/unread status changes, label changes, etc.
          break;
        }

        case "thread.replied": {
          console.log("Nylas thread replied:", object_data?.id);
          break;
        }

        case "grant.expired":
        case "grant.invalid": {
          console.log("Nylas grant issue:", type, object_data?.grant_id);
          // TODO: Notify user to re-authenticate
          break;
        }
      }
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Nylas webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Kalshi Webhook (Prediction Markets)
// ============================================================================

app.post("/kalshi", async (c) => {
  const signatureHeader = c.req.header("X-Kalshi-Signature");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "kalshi",
      eventType: parsed.type,
      externalId: parsed.data?.id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify signature if provided
  const webhookSecret = process.env.KALSHI_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    const isValid = verifyHmacSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Kalshi webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;

    console.log("Kalshi webhook:", eventType);

    switch (eventType) {
      case "order.filled":
      case "order.partially_filled": {
        const { order_id, fill_count, fill_price, remaining_count } = body.data;
        console.log("Kalshi order fill:", order_id, fill_count, fill_price);

        // TODO: Update order status in Convex
        // Record trade/fill
        break;
      }

      case "order.cancelled": {
        const { order_id, reason } = body.data;
        console.log("Kalshi order cancelled:", order_id, reason);

        // TODO: Update order status in Convex
        break;
      }

      case "market.settled": {
        const { ticker, result, settlement_value } = body.data;
        console.log("Kalshi market settled:", ticker, result, settlement_value);

        // TODO: Process position settlements
        // Credit/debit user balances based on outcomes
        break;
      }

      case "balance.updated": {
        const { balance, available_balance } = body.data;
        console.log("Kalshi balance updated:", balance, available_balance);
        break;
      }
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Kalshi webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Stripe Webhook (Payments)
// ============================================================================

app.post("/stripe", async (c) => {
  const signatureHeader = c.req.header("Stripe-Signature");
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "stripe",
      eventType: parsed.type,
      externalId: parsed.id,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  // Verify Stripe signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret && signatureHeader) {
    try {
      // Parse Stripe signature header
      const parts = signatureHeader.split(",");
      const timestamp = parts.find((p) => p.startsWith("t="))?.substring(2);
      const signature = parts.find((p) => p.startsWith("v1="))?.substring(3);

      if (!timestamp || !signature) {
        return c.json({ error: "Invalid signature format" }, 401);
      }

      // Check timestamp (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
        return c.json({ error: "Signature timestamp expired" }, 401);
      }

      // Verify signature
      const payload = `${timestamp}.${rawBody}`;
      const expectedSignature = createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      if (!timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      )) {
        console.error("Invalid Stripe webhook signature");
        return c.json({ error: "Invalid signature" }, 401);
      }
    } catch {
      return c.json({ error: "Signature verification failed" }, 401);
    }
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const data = body.data?.object;

    console.log("Stripe webhook:", eventType);

    switch (eventType) {
      case "payment_intent.succeeded": {
        const { id, amount, currency, metadata } = data;
        console.log("Stripe payment succeeded:", id, amount, currency);

        // TODO: Credit user balance
        // metadata should contain user_id
        break;
      }

      case "payment_intent.payment_failed": {
        const { id, last_payment_error } = data;
        console.log("Stripe payment failed:", id, last_payment_error?.message);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const { id, status, customer } = data;
        console.log("Stripe subscription event:", eventType, id, status);
        break;
      }

      case "payout.paid":
      case "payout.failed": {
        const { id, amount, status } = data;
        console.log("Stripe payout event:", eventType, id, amount, status);
        break;
      }
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

// ============================================================================
// Polygon Blockchain Webhook (Token Events)
// ============================================================================

app.post("/polygon", async (c) => {
  const rawBody = await c.req.text();

  // Log incoming webhook
  let webhookEventId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    webhookEventId = (await convexWebhooks.logEvent({
      source: "polygon",
      eventType: parsed.type ?? "blockchain_event",
      externalId: parsed.txHash,
      payload: parsed,
    })) as string;
  } catch {
    // Continue even if logging fails
  }

  try {
    const body = JSON.parse(rawBody);
    const { type, txHash, blockNumber, logs } = body;

    console.log("Polygon webhook:", type, txHash);

    // Process blockchain events
    // This would typically come from a service like Alchemy or QuickNode
    for (const log of logs ?? []) {
      const { address, topics, data } = log;

      // Handle ERC-20 Transfer events
      if (topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
        // Transfer(from, to, value)
        const from = `0x${topics[1]?.slice(-40)}`;
        const to = `0x${topics[2]?.slice(-40)}`;
        const value = BigInt(data);

        console.log("ERC-20 Transfer:", from, "->", to, value.toString());

        // TODO: If 'to' matches a user's deposit address, credit their balance
      }
    }

    // Update webhook status
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "processed",
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Polygon webhook error:", error);
    if (webhookEventId) {
      await convexWebhooks.updateStatus({
        id: webhookEventId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return c.json({ error: "Processing failed" }, 500);
  }
});

export { app as webhookRoutes };
