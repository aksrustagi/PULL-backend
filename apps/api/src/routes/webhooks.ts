import { Hono } from "hono";
import Stripe from "stripe";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log webhook event to Convex
 */
async function logWebhookEvent(
  source: string,
  eventType: string,
  payload: unknown,
  externalId?: string
): Promise<Id<"webhookEvents">> {
  return await convex.mutation(api.audit.logWebhook, {
    source,
    eventType,
    externalId,
    payload,
  });
}

/**
 * Update webhook processing status
 */
async function updateWebhookStatus(
  webhookId: Id<"webhookEvents">,
  status: "processing" | "processed" | "failed",
  error?: string
): Promise<void> {
  await convex.mutation(api.audit.updateWebhookStatus, {
    webhookId,
    status,
    error,
  });
}

/**
 * Log audit event
 */
async function logAuditEvent(
  userId: Id<"users"> | undefined,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await convex.mutation(api.audit.log, {
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}

/**
 * Verify webhook signature using HMAC SHA-256
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Persona webhook (KYC)
 */
app.post("/persona", async (c) => {
  const signature = c.req.header("Persona-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PERSONA_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  // Persona signature format: t=timestamp,v1=signature
  const signatureParts = signature.split(",");
  const timestampPart = signatureParts.find((p) => p.startsWith("t="));
  const signaturePart = signatureParts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    return c.json({ error: "Invalid signature format" }, 401);
  }

  const timestamp = timestampPart.slice(2);
  const signatureValue = signaturePart.slice(3);

  // Verify timestamp is within 5 minutes to prevent replay attacks
  const timestampAge = Date.now() / 1000 - parseInt(timestamp);
  if (Math.abs(timestampAge) > 300) {
    return c.json({ error: "Signature timestamp too old" }, 401);
  }

  // Construct signed payload: timestamp.rawBody
  const signedPayload = `${timestamp}.${rawBody}`;
  const isValid = await verifyWebhookSignature(signedPayload, signatureValue, secret);

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  const eventType = body.data?.attributes?.name || body.data?.type || "unknown";
  console.log("Persona webhook:", eventType);

  // Log webhook event
  const webhookId = await logWebhookEvent(
    "persona",
    eventType,
    body,
    body.data?.id
  );

  try {
    await updateWebhookStatus(webhookId, "processing");

    // Extract inquiry/verification data
    const attributes = body.data?.attributes || {};
    const referenceId = attributes.reference_id; // This should be the user's Convex ID
    const inquiryId = body.data?.id;

    // Try to find user by reference ID (should be Convex user ID)
    let userId: Id<"users"> | undefined;
    if (referenceId) {
      try {
        const user = await convex.query(api.users.getById, {
          id: referenceId as Id<"users">,
        });
        if (user) {
          userId = user._id;
        }
      } catch {
        // Reference ID might not be a valid user ID
        console.log("Could not find user by reference_id:", referenceId);
      }
    }

    switch (eventType) {
      case "inquiry.completed":
      case "inquiry.approved": {
        // KYC inquiry completed successfully
        if (userId) {
          await convex.mutation(api.users.updateKYCStatus, {
            id: userId,
            kycStatus: "identity_verified",
            kycTier: "verified",
          });

          await logAuditEvent(
            userId,
            "kyc.identity_verified",
            "users",
            userId,
            { provider: "persona", inquiryId, eventType }
          );
        }
        break;
      }

      case "inquiry.failed":
      case "inquiry.declined":
      case "inquiry.expired": {
        // KYC inquiry failed
        if (userId) {
          await convex.mutation(api.users.updateKYCStatus, {
            id: userId,
            kycStatus: "rejected",
          });

          await logAuditEvent(userId, "kyc.identity_failed", "users", userId, {
            provider: "persona",
            inquiryId,
            eventType,
            reason: attributes.decline_reason || attributes.failure_reason,
          });
        }
        break;
      }

      case "inquiry.created":
      case "inquiry.pending": {
        // KYC inquiry started/pending
        if (userId) {
          await convex.mutation(api.users.updateKYCStatus, {
            id: userId,
            kycStatus: "identity_pending",
          });

          await logAuditEvent(
            userId,
            "kyc.identity_pending",
            "users",
            userId,
            { provider: "persona", inquiryId, eventType }
          );
        }
        break;
      }

      case "verification.passed": {
        // Individual verification check passed
        if (userId) {
          const verificationType = attributes.verification_type;
          await logAuditEvent(
            userId,
            "kyc.verification_passed",
            "users",
            userId,
            { provider: "persona", inquiryId, verificationType }
          );
        }
        break;
      }

      case "verification.failed": {
        // Individual verification check failed
        if (userId) {
          const verificationType = attributes.verification_type;
          await logAuditEvent(
            userId,
            "kyc.verification_failed",
            "users",
            userId,
            {
              provider: "persona",
              inquiryId,
              verificationType,
              reason: attributes.failure_reason,
            }
          );
        }
        break;
      }

      default:
        console.log("Unhandled Persona event type:", eventType);
    }

    await updateWebhookStatus(webhookId, "processed");
    return c.json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Persona webhook processing error:", message);
    await updateWebhookStatus(webhookId, "failed", message);
    return c.json({ received: true, error: message }, 500);
  }
});

/**
 * Checkr webhook (Background checks)
 */
app.post("/checkr", async (c) => {
  const signature = c.req.header("X-Checkr-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CHECKR_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, secret);

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  const eventType = body.type || "unknown";
  console.log("Checkr webhook:", eventType);

  // Log webhook event
  const webhookId = await logWebhookEvent(
    "checkr",
    eventType,
    body,
    body.id || body.data?.object?.id
  );

  try {
    await updateWebhookStatus(webhookId, "processing");

    // Extract report/candidate data
    const reportData = body.data?.object || body;
    const candidateId = reportData.candidate_id;
    const reportId = reportData.id;

    // Find user by candidateId stored in KYC records
    let userId: Id<"users"> | undefined;
    // Note: In a real implementation, you'd look up the user via KYC records
    // For now, we check if candidateId is a Convex user ID
    if (candidateId) {
      try {
        const user = await convex.query(api.users.getById, {
          id: candidateId as Id<"users">,
        });
        if (user) {
          userId = user._id;
        }
      } catch {
        console.log("Could not find user by candidate_id:", candidateId);
      }
    }

    switch (eventType) {
      case "report.completed": {
        // Background check report is complete
        const status = reportData.status; // "clear", "consider", "suspended", etc.
        const adjudication = reportData.adjudication;

        if (userId) {
          if (status === "clear" || adjudication === "engaged") {
            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "background_cleared",
              kycTier: "premium",
            });

            await logAuditEvent(
              userId,
              "kyc.background_cleared",
              "users",
              userId,
              { provider: "checkr", reportId, status, adjudication }
            );
          } else if (status === "consider") {
            // Requires manual review
            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "background_pending",
            });

            await logAuditEvent(
              userId,
              "kyc.background_review_needed",
              "users",
              userId,
              { provider: "checkr", reportId, status }
            );
          } else {
            // Failed or suspended
            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "rejected",
            });

            await logAuditEvent(
              userId,
              "kyc.background_failed",
              "users",
              userId,
              { provider: "checkr", reportId, status }
            );
          }
        }
        break;
      }

      case "report.created": {
        // Background check started
        if (userId) {
          await convex.mutation(api.users.updateKYCStatus, {
            id: userId,
            kycStatus: "background_pending",
          });

          await logAuditEvent(
            userId,
            "kyc.background_started",
            "users",
            userId,
            { provider: "checkr", reportId }
          );
        }
        break;
      }

      case "report.upgraded":
      case "report.resumed": {
        // Report status changed
        if (userId) {
          await logAuditEvent(
            userId,
            `kyc.background_${eventType.split(".")[1]}`,
            "users",
            userId,
            { provider: "checkr", reportId }
          );
        }
        break;
      }

      case "report.suspended":
      case "report.disputed": {
        // Report has issues
        if (userId) {
          await convex.mutation(api.users.updateKYCStatus, {
            id: userId,
            kycStatus: "suspended",
          });

          await logAuditEvent(
            userId,
            `kyc.background_${eventType.split(".")[1]}`,
            "users",
            userId,
            { provider: "checkr", reportId }
          );
        }
        break;
      }

      case "candidate.created":
      case "candidate.updated": {
        // Candidate record events - just log
        await logAuditEvent(
          userId,
          `checkr.${eventType}`,
          "kycRecords",
          candidateId || "unknown",
          { provider: "checkr" }
        );
        break;
      }

      default:
        console.log("Unhandled Checkr event type:", eventType);
    }

    await updateWebhookStatus(webhookId, "processed");
    return c.json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Checkr webhook processing error:", message);
    await updateWebhookStatus(webhookId, "failed", message);
    return c.json({ received: true, error: message }, 500);
  }
});

/**
 * Nylas webhook (Email sync)
 */
app.post("/nylas", async (c) => {
  const rawBody = await c.req.text();
  const body = JSON.parse(rawBody);

  // Handle Nylas challenge (no signature verification for challenge)
  if (body.challenge) {
    return c.text(body.challenge);
  }

  // For actual webhooks, verify signature
  const signature = c.req.header("X-Nylas-Signature");
  const secret = process.env.NYLAS_WEBHOOK_SECRET;

  if (!secret) {
    console.error("NYLAS_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, secret);

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const eventType = body.trigger || "unknown";
  console.log("Nylas webhook:", eventType);

  // Log webhook event
  const webhookId = await logWebhookEvent(
    "nylas",
    eventType,
    body,
    body.data?.object?.id
  );

  try {
    await updateWebhookStatus(webhookId, "processing");

    // Nylas sends deltas array with multiple changes
    const deltas = body.deltas || [body.data];

    for (const delta of deltas) {
      const objectData = delta?.object_data || delta?.object || delta;
      const grantId = objectData?.grant_id || body.data?.application_id;

      // Find email account by grant ID
      let accountId: Id<"emailAccounts"> | undefined;
      let userId: Id<"users"> | undefined;

      if (grantId) {
        // In a real implementation, look up emailAccounts by grantId
        // For now, we'll try to extract from metadata
      }

      switch (eventType) {
        case "message.created": {
          // New email received
          const messageData = objectData?.attributes || objectData;

          if (accountId && userId) {
            await convex.mutation(api.emails.upsertEmail, {
              accountId,
              userId,
              externalId: messageData.id || objectData.id,
              threadId: messageData.thread_id || "",
              folderId: messageData.folders?.[0] || "inbox",
              folderName: messageData.folders?.[0] || "Inbox",
              fromEmail: messageData.from?.[0]?.email || "",
              fromName: messageData.from?.[0]?.name,
              toEmails: (messageData.to || []).map((t: { email: string }) => t.email),
              ccEmails: (messageData.cc || []).map((t: { email: string }) => t.email),
              subject: messageData.subject || "(No Subject)",
              snippet: messageData.snippet || "",
              bodyPlain: messageData.body,
              hasAttachments: (messageData.attachments?.length || 0) > 0,
              attachmentCount: messageData.attachments?.length || 0,
              isStarred: messageData.starred || false,
              isImportant:
                messageData.labels?.includes("important") ||
                messageData.labels?.includes("IMPORTANT") ||
                false,
              labels: messageData.labels || [],
              receivedAt: messageData.date
                ? new Date(messageData.date * 1000).getTime()
                : Date.now(),
            });

            await logAuditEvent(userId, "email.synced", "emails", messageData.id, {
              provider: "nylas",
              subject: messageData.subject,
            });
          } else {
            // Log the event even if we can't process it fully
            console.log(
              "Nylas message.created received but no account mapping found for grant:",
              grantId
            );
          }
          break;
        }

        case "message.updated": {
          // Email was updated (read/unread, labels changed, etc.)
          const messageData = objectData?.attributes || objectData;
          const messageId = messageData.id || objectData.id;

          // In a real implementation, you'd look up the email by externalId
          // and update its status
          if (userId) {
            await logAuditEvent(
              userId,
              "email.updated",
              "emails",
              messageId || "unknown",
              {
                provider: "nylas",
                unread: messageData.unread,
                starred: messageData.starred,
              }
            );
          }
          break;
        }

        case "message.deleted": {
          // Email was deleted
          const messageId = objectData?.id;

          if (userId) {
            await logAuditEvent(
              userId,
              "email.deleted",
              "emails",
              messageId || "unknown",
              { provider: "nylas" }
            );
          }
          break;
        }

        case "thread.updated": {
          // Thread was updated
          const threadId = objectData?.id;

          if (userId) {
            await logAuditEvent(
              userId,
              "email.thread_updated",
              "emails",
              threadId || "unknown",
              { provider: "nylas" }
            );
          }
          break;
        }

        case "grant.created":
        case "grant.updated": {
          // Email account connection status changed
          await logAuditEvent(
            userId,
            `nylas.${eventType}`,
            "emailAccounts",
            grantId || "unknown",
            { provider: "nylas" }
          );
          break;
        }

        case "grant.deleted":
        case "grant.expired": {
          // Email account disconnected
          if (accountId) {
            await convex.mutation(api.emails.updateAccountSync, {
              accountId,
              syncStatus: "disabled",
              lastSyncError:
                eventType === "grant.expired" ? "Grant expired" : "Grant deleted",
            });
          }

          await logAuditEvent(
            userId,
            `nylas.${eventType}`,
            "emailAccounts",
            grantId || "unknown",
            { provider: "nylas" }
          );
          break;
        }

        default:
          console.log("Unhandled Nylas event type:", eventType);
      }
    }

    await updateWebhookStatus(webhookId, "processed");
    return c.json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Nylas webhook processing error:", message);
    await updateWebhookStatus(webhookId, "failed", message);
    return c.json({ received: true, error: message }, 500);
  }
});

/**
 * Massive webhook (Order execution)
 */
app.post("/massive", async (c) => {
  const signature = c.req.header("X-Massive-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.MASSIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MASSIVE_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, secret);

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  const eventType = body.event || body.type || "unknown";
  console.log("Massive webhook:", eventType);

  // Log webhook event
  const webhookId = await logWebhookEvent(
    "massive",
    eventType,
    body,
    body.order_id || body.trade_id || body.position_id
  );

  try {
    await updateWebhookStatus(webhookId, "processing");

    // Extract order/trade data
    const data = body.data || body;
    const externalOrderId = data.order_id || data.external_order_id;

    // Find order by external ID
    let order: Awaited<ReturnType<typeof convex.query<typeof api.orders.getByExternalId>>> | null =
      null;
    if (externalOrderId) {
      order = await convex.query(api.orders.getByExternalId, {
        externalOrderId,
      });
    }

    switch (eventType) {
      case "order.filled":
      case "order.partial_fill": {
        // Order was filled (fully or partially)
        if (!order) {
          console.error("Order not found for external ID:", externalOrderId);
          break;
        }

        const tradeData = data.fill || data.trade || data;
        const quantity = tradeData.quantity || tradeData.filled_quantity;
        const price = tradeData.price || tradeData.fill_price;
        const fee = tradeData.fee || tradeData.commission || 0;
        const liquidity = tradeData.liquidity === "maker" ? "maker" : "taker";

        // Record the trade
        await convex.mutation(api.orders.recordTrade, {
          orderId: order._id,
          externalTradeId: tradeData.trade_id || tradeData.execution_id,
          quantity,
          price,
          fee,
          liquidity,
        });

        await logAuditEvent(
          order.userId,
          `order.${eventType.split(".")[1]}`,
          "orders",
          order._id,
          {
            provider: "massive",
            externalOrderId,
            quantity,
            price,
            fee,
          }
        );
        break;
      }

      case "order.accepted":
      case "order.submitted": {
        // Order was accepted by exchange
        if (order) {
          await convex.mutation(api.orders.update, {
            id: order._id,
            status: "accepted",
            externalOrderId,
          });

          await logAuditEvent(
            order.userId,
            "order.accepted",
            "orders",
            order._id,
            { provider: "massive", externalOrderId }
          );
        }
        break;
      }

      case "order.cancelled": {
        // Order was cancelled
        if (order) {
          const reason = data.reason || data.cancel_reason || "Cancelled by exchange";

          await convex.mutation(api.orders.cancel, {
            id: order._id,
            reason,
          });

          await logAuditEvent(
            order.userId,
            "order.cancelled",
            "orders",
            order._id,
            { provider: "massive", externalOrderId, reason }
          );
        }
        break;
      }

      case "order.rejected": {
        // Order was rejected by exchange
        if (order) {
          const reason = data.reason || data.reject_reason || "Rejected by exchange";

          await convex.mutation(api.orders.update, {
            id: order._id,
            status: "rejected",
          });

          await logAuditEvent(
            order.userId,
            "order.rejected",
            "orders",
            order._id,
            { provider: "massive", externalOrderId, reason }
          );
        }
        break;
      }

      case "order.expired": {
        // Order expired
        if (order) {
          await convex.mutation(api.orders.update, {
            id: order._id,
            status: "expired",
          });

          await logAuditEvent(
            order.userId,
            "order.expired",
            "orders",
            order._id,
            { provider: "massive", externalOrderId }
          );
        }
        break;
      }

      case "position.updated": {
        // Position was updated (price change, liquidation, etc.)
        const positionData = data.position || data;
        const symbol = positionData.symbol;
        const currentPrice = positionData.current_price || positionData.mark_price;
        const userId = positionData.user_id as Id<"users"> | undefined;

        if (userId && symbol && currentPrice) {
          // Get position by user and symbol
          const position = await convex.query(api.positions.getByUserAndAsset, {
            userId,
            assetClass: positionData.asset_class || "crypto",
            symbol,
          });

          if (position) {
            await convex.mutation(api.positions.updatePosition, {
              id: position._id,
              currentPrice,
            });

            await logAuditEvent(userId, "position.updated", "positions", position._id, {
              provider: "massive",
              symbol,
              currentPrice,
            });
          }
        }
        break;
      }

      case "position.liquidated": {
        // Position was liquidated
        const positionData = data.position || data;
        const userId = positionData.user_id as Id<"users"> | undefined;

        if (userId) {
          await logAuditEvent(
            userId,
            "position.liquidated",
            "positions",
            positionData.position_id || "unknown",
            {
              provider: "massive",
              symbol: positionData.symbol,
              liquidationPrice: positionData.liquidation_price,
            }
          );
        }
        break;
      }

      default:
        console.log("Unhandled Massive event type:", eventType);
    }

    await updateWebhookStatus(webhookId, "processed");
    return c.json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Massive webhook processing error:", message);
    await updateWebhookStatus(webhookId, "failed", message);
    return c.json({ received: true, error: message }, 500);
  }
});

/**
 * Stripe webhook (Payments)
 */
app.post("/stripe", async (c) => {
  const signature = c.req.header("Stripe-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  try {
    // Use Stripe's official signature verification
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-12-18.acacia",
    });

    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    console.log("Stripe webhook:", event.type);

    // Log webhook event
    const webhookId = await logWebhookEvent(
      "stripe",
      event.type,
      event.data.object,
      event.id
    );

    try {
      await updateWebhookStatus(webhookId, "processing");

      switch (event.type) {
        case "payment_intent.succeeded": {
          // Payment completed successfully - record deposit
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const userId = paymentIntent.metadata?.userId as Id<"users"> | undefined;
          const amount = paymentIntent.amount / 100; // Convert from cents
          const currency = paymentIntent.currency.toUpperCase();

          if (userId) {
            // Record the deposit
            const depositId = await convex.mutation(api.balances.recordDeposit, {
              userId,
              method: "card",
              amount,
              currency,
              fee: 0, // Stripe fees are handled separately
              externalId: paymentIntent.id,
            });

            // Complete the deposit to credit the balance
            await convex.mutation(api.balances.completeDeposit, {
              depositId,
            });

            await logAuditEvent(userId, "payment.succeeded", "deposits", depositId, {
              provider: "stripe",
              paymentIntentId: paymentIntent.id,
              amount,
              currency,
            });
          }
          break;
        }

        case "payment_intent.payment_failed": {
          // Payment failed
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const userId = paymentIntent.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            await logAuditEvent(
              userId,
              "payment.failed",
              "deposits",
              paymentIntent.id,
              {
                provider: "stripe",
                paymentIntentId: paymentIntent.id,
                error: paymentIntent.last_payment_error?.message,
              }
            );
          }
          break;
        }

        case "charge.refunded": {
          // Refund processed
          const charge = event.data.object as Stripe.Charge;
          const userId = charge.metadata?.userId as Id<"users"> | undefined;
          const refundAmount = (charge.amount_refunded || 0) / 100;

          if (userId && refundAmount > 0) {
            // Debit the refunded amount from user's balance
            await convex.mutation(api.balances.debit, {
              userId,
              assetType: "usd",
              assetId: "USD",
              amount: refundAmount,
              referenceType: "refund",
              referenceId: charge.id,
            });

            await logAuditEvent(userId, "payment.refunded", "deposits", charge.id, {
              provider: "stripe",
              chargeId: charge.id,
              refundAmount,
            });
          }
          break;
        }

        case "customer.subscription.created": {
          // New subscription created
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            // Update user tier based on subscription
            const priceId = subscription.items.data[0]?.price?.id;
            let tier: "basic" | "verified" | "premium" | "institutional" = "verified";

            // Map price IDs to tiers (these would be your actual Stripe price IDs)
            if (priceId?.includes("premium")) {
              tier = "premium";
            } else if (priceId?.includes("institutional")) {
              tier = "institutional";
            }

            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "approved",
              kycTier: tier,
            });

            await logAuditEvent(
              userId,
              "subscription.created",
              "users",
              userId,
              {
                provider: "stripe",
                subscriptionId: subscription.id,
                priceId,
                tier,
              }
            );
          }
          break;
        }

        case "customer.subscription.updated": {
          // Subscription changed (upgrade/downgrade)
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            const priceId = subscription.items.data[0]?.price?.id;
            let tier: "basic" | "verified" | "premium" | "institutional" = "verified";

            if (priceId?.includes("premium")) {
              tier = "premium";
            } else if (priceId?.includes("institutional")) {
              tier = "institutional";
            }

            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "approved",
              kycTier: tier,
            });

            await logAuditEvent(
              userId,
              "subscription.updated",
              "users",
              userId,
              {
                provider: "stripe",
                subscriptionId: subscription.id,
                priceId,
                tier,
                status: subscription.status,
              }
            );
          }
          break;
        }

        case "customer.subscription.deleted": {
          // Subscription cancelled
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            // Downgrade to basic tier
            await convex.mutation(api.users.updateKYCStatus, {
              id: userId,
              kycStatus: "approved",
              kycTier: "basic",
            });

            await logAuditEvent(
              userId,
              "subscription.cancelled",
              "users",
              userId,
              {
                provider: "stripe",
                subscriptionId: subscription.id,
              }
            );
          }
          break;
        }

        case "invoice.paid": {
          // Invoice was paid successfully
          const invoice = event.data.object as Stripe.Invoice;
          const userId = invoice.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            await logAuditEvent(userId, "invoice.paid", "deposits", invoice.id || "unknown", {
              provider: "stripe",
              invoiceId: invoice.id,
              amount: (invoice.amount_paid || 0) / 100,
            });
          }
          break;
        }

        case "invoice.payment_failed": {
          // Invoice payment failed
          const invoice = event.data.object as Stripe.Invoice;
          const userId = invoice.metadata?.userId as Id<"users"> | undefined;

          if (userId) {
            await logAuditEvent(
              userId,
              "invoice.payment_failed",
              "deposits",
              invoice.id || "unknown",
              {
                provider: "stripe",
                invoiceId: invoice.id,
              }
            );
          }
          break;
        }

        default:
          console.log("Unhandled Stripe event type:", event.type);
      }

      await updateWebhookStatus(webhookId, "processed");
      return c.json({ received: true, processed: true });
    } catch (processingError) {
      const message =
        processingError instanceof Error ? processingError.message : "Unknown error";
      console.error("Stripe webhook processing error:", message);
      await updateWebhookStatus(webhookId, "failed", message);
      return c.json({ received: true, error: message }, 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return c.json({ error: "Invalid signature" }, 401);
  }
});

/**
 * Polygon blockchain webhook (Token events)
 */
app.post("/polygon", async (c) => {
  // Verify API key for basic authentication
  const apiKey = c.req.header("X-API-Key");
  const expectedApiKey = process.env.POLYGON_WEBHOOK_API_KEY;

  if (!expectedApiKey) {
    console.error("POLYGON_WEBHOOK_API_KEY is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!apiKey) {
    return c.json({ error: "Missing API key" }, 401);
  }

  // Constant-time comparison to prevent timing attacks
  if (apiKey.length !== expectedApiKey.length) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  let result = 0;
  for (let i = 0; i < apiKey.length; i++) {
    result |= apiKey.charCodeAt(i) ^ expectedApiKey.charCodeAt(i);
  }

  if (result !== 0) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const body = await c.req.json();
  const eventType = body.event || body.type || "unknown";
  console.log("Polygon webhook:", eventType);

  // Log webhook event
  const webhookId = await logWebhookEvent(
    "polygon",
    eventType,
    body,
    body.txHash || body.transaction_hash
  );

  try {
    await updateWebhookStatus(webhookId, "processing");

    // Extract event data
    const data = body.data || body;
    const txHash = data.txHash || data.transaction_hash;
    const blockNumber = data.blockNumber || data.block_number;

    switch (eventType) {
      case "transfer":
      case "token.transfer": {
        // Token transfer event
        const fromAddress = data.from?.toLowerCase();
        const toAddress = data.to?.toLowerCase();
        const amount = parseFloat(data.value || data.amount || "0");
        const tokenAddress = data.tokenAddress || data.contract_address;

        // Try to find users by wallet address
        let fromUser: Awaited<ReturnType<typeof convex.query<typeof api.users.getByWalletAddress>>> | null =
          null;
        let toUser: Awaited<ReturnType<typeof convex.query<typeof api.users.getByWalletAddress>>> | null =
          null;

        if (fromAddress) {
          fromUser = await convex.query(api.users.getByWalletAddress, {
            walletAddress: fromAddress,
          });
        }
        if (toAddress) {
          toUser = await convex.query(api.users.getByWalletAddress, {
            walletAddress: toAddress,
          });
        }

        // Debit from sender
        if (fromUser && amount > 0) {
          try {
            await convex.mutation(api.balances.debit, {
              userId: fromUser._id,
              assetType: "token",
              assetId: tokenAddress || "PULL",
              amount,
              referenceType: "transfer",
              referenceId: txHash,
            });

            await logAuditEvent(
              fromUser._id,
              "token.transferred_out",
              "tokenTransactions",
              txHash || "unknown",
              {
                provider: "polygon",
                tokenAddress,
                amount,
                toAddress,
                blockNumber,
              }
            );
          } catch (err) {
            // May fail if insufficient balance - user sent from external source
            console.log("Could not debit from user:", err);
          }
        }

        // Credit to receiver
        if (toUser && amount > 0) {
          await convex.mutation(api.balances.credit, {
            userId: toUser._id,
            assetType: "token",
            assetId: tokenAddress || "PULL",
            symbol: data.symbol || "PULL",
            amount,
            referenceType: "transfer",
            referenceId: txHash,
          });

          await logAuditEvent(
            toUser._id,
            "token.transferred_in",
            "tokenTransactions",
            txHash || "unknown",
            {
              provider: "polygon",
              tokenAddress,
              amount,
              fromAddress,
              blockNumber,
            }
          );
        }
        break;
      }

      case "staking.staked":
      case "stake.deposited": {
        // User staked tokens
        const walletAddress = data.staker?.toLowerCase() || data.user?.toLowerCase();
        const amount = parseFloat(data.amount || "0");
        const poolId = data.poolId || data.pool_id || "default";
        const poolName = data.poolName || data.pool_name || "PULL Staking Pool";

        if (walletAddress) {
          const user = await convex.query(api.users.getByWalletAddress, {
            walletAddress,
          });

          if (user) {
            // Check if user already has a staking position in this pool
            const existingPositions = await convex.query(api.balances.getByUser, {
              userId: user._id,
            });

            // For staking, we'd typically insert into stakingPositions table
            // Since we don't have a direct mutation, we log the event
            await logAuditEvent(
              user._id,
              "staking.staked",
              "stakingPositions",
              poolId,
              {
                provider: "polygon",
                walletAddress,
                amount,
                poolId,
                poolName,
                txHash,
                blockNumber,
              }
            );
          }
        }
        break;
      }

      case "staking.unstaked":
      case "stake.withdrawn": {
        // User unstaked tokens
        const walletAddress = data.staker?.toLowerCase() || data.user?.toLowerCase();
        const amount = parseFloat(data.amount || "0");
        const poolId = data.poolId || data.pool_id || "default";

        if (walletAddress) {
          const user = await convex.query(api.users.getByWalletAddress, {
            walletAddress,
          });

          if (user) {
            await logAuditEvent(
              user._id,
              "staking.unstaked",
              "stakingPositions",
              poolId,
              {
                provider: "polygon",
                walletAddress,
                amount,
                poolId,
                txHash,
                blockNumber,
              }
            );
          }
        }
        break;
      }

      case "staking.rewards_claimed":
      case "rewards.claimed": {
        // User claimed staking rewards
        const walletAddress = data.staker?.toLowerCase() || data.user?.toLowerCase();
        const amount = parseFloat(data.amount || "0");
        const poolId = data.poolId || data.pool_id || "default";

        if (walletAddress && amount > 0) {
          const user = await convex.query(api.users.getByWalletAddress, {
            walletAddress,
          });

          if (user) {
            // Credit rewards to user's token balance
            await convex.mutation(api.balances.credit, {
              userId: user._id,
              assetType: "token",
              assetId: data.rewardToken || "PULL",
              symbol: data.rewardSymbol || "PULL",
              amount,
              referenceType: "staking_rewards",
              referenceId: txHash,
            });

            await logAuditEvent(
              user._id,
              "staking.rewards_claimed",
              "stakingPositions",
              poolId,
              {
                provider: "polygon",
                walletAddress,
                amount,
                poolId,
                txHash,
                blockNumber,
              }
            );
          }
        }
        break;
      }

      case "approval":
      case "token.approval": {
        // Token approval event - just log for audit
        const ownerAddress = data.owner?.toLowerCase();

        if (ownerAddress) {
          const user = await convex.query(api.users.getByWalletAddress, {
            walletAddress: ownerAddress,
          });

          if (user) {
            await logAuditEvent(
              user._id,
              "token.approval",
              "tokenTransactions",
              txHash || "unknown",
              {
                provider: "polygon",
                spender: data.spender,
                amount: data.value,
                tokenAddress: data.tokenAddress,
                blockNumber,
              }
            );
          }
        }
        break;
      }

      default:
        console.log("Unhandled Polygon event type:", eventType);
    }

    await updateWebhookStatus(webhookId, "processed");
    return c.json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Polygon webhook processing error:", message);
    await updateWebhookStatus(webhookId, "failed", message);
    return c.json({ received: true, error: message }, 500);
  }
});

export { app as webhookRoutes };
