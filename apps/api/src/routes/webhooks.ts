import { Hono } from "hono";
import * as crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { PersonaClient } from "@pull/core/services/persona";
import type { WebhookPayload, Inquiry, Verification } from "@pull/core/services/persona/types";
import { getLogger } from "@pull/core/services";
import { toUserId } from "../lib/convex-types";
import { sendKYCApprovedEmail, sendKYCDeclinedEmail, sendKYCReminderEmail } from "../lib/email";

const app = new Hono();
const logger = getLogger().child({ service: "webhooks" });

// Initialize Convex client
function getConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(process.env.CONVEX_URL!);
}

function getPersonaClient(): PersonaClient {
  return new PersonaClient({
    apiKey: process.env.PERSONA_API_KEY!,
    webhookSecret: process.env.PERSONA_WEBHOOK_SECRET,
  });
}

/**
 * Verify HMAC signature for webhook payloads
 */
function verifyHmacSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Verify Persona webhook signature
 * Persona uses t=timestamp,v1=signature format
 */
function verifyPersonaSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  try {
    // Parse signature parts (format: t=timestamp,v1=signature)
    const parts = signature.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      // Fallback to simple HMAC verification
      return verifyHmacSignature(payload, signature, secret);
    }

    const timestamp = timestampPart.slice(2);
    const receivedSig = signaturePart.slice(3);

    // Verify timestamp is within 5 minutes
    const webhookTimestamp = parseInt(timestamp, 10) * 1000;
    if (Math.abs(Date.now() - webhookTimestamp) > 5 * 60 * 1000) {
      logger.warn("Persona webhook: timestamp too old");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(receivedSig, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    logger.error("Persona signature verification error:", error);
    return false;
  }
}

// =============================================================================
// Persona Webhook Handler Types
// =============================================================================

interface PersonaWebhookEvent {
  type: string;
  inquiry?: Inquiry;
  verification?: Verification;
  referenceId: string | null;
  inquiryId: string;
}

/**
 * Parse Persona webhook payload
 */
function parsePersonaWebhook(payload: WebhookPayload): PersonaWebhookEvent {
  const eventType = payload.data.type;
  const resource = payload.data.attributes.payload.data;

  const isInquiry = resource.type === "inquiry";
  const inquiry = isInquiry ? (resource as Inquiry) : undefined;
  const verification = !isInquiry ? (resource as Verification) : undefined;

  return {
    type: eventType,
    inquiry,
    verification,
    referenceId: inquiry?.attributes.reference_id ?? null,
    inquiryId: inquiry?.id ?? "",
  };
}

/**
 * Persona webhook (KYC)
 * Handles all Persona webhook events
 */
app.post("/persona", async (c) => {
  const signature = c.req.header("Persona-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("PERSONA_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyPersonaSignature(rawBody, signature, secret)) {
    logger.warn("Persona webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody) as WebhookPayload;
  const convex = getConvexClient();
  const personaClient = getPersonaClient();

  // Store webhook event for idempotency and audit
  const eventId = `persona-${body.data.type}-${Date.now()}`;
  let webhookEventId;

  try {
    webhookEventId = await convex.mutation(api.kyc.storeWebhookEvent, {
      source: "persona",
      eventType: body.data.type,
      eventId,
      payload: rawBody,
    });
  } catch (error) {
    logger.error("Failed to store webhook event:", error);
  }

  const event = parsePersonaWebhook(body);
  logger.info(`Persona webhook received: ${event.type}`, {
    inquiryId: event.inquiryId,
    referenceId: event.referenceId,
  });

  try {
    switch (event.type) {
      // =======================================================================
      // Inquiry Events
      // =======================================================================

      case "inquiry.completed": {
        // Inquiry completed - all verifications submitted
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;

          // Get full inquiry with verifications
          const { inquiry, verifications } = await personaClient.getInquiryWithVerifications(
            event.inquiryId
          );

          // Check if all verifications passed
          const allPassed = verifications.every(
            (v) => v.attributes.status === "passed" || v.attributes.status === "confirmed"
          );

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: toUserId(userId),
            status: "in_progress",
            personaInquiryId: event.inquiryId,
            personaReviewStatus: inquiry.attributes.status,
            personaCompletedAt: Date.now(),
          });

          logger.info(`Inquiry ${event.inquiryId} completed for user ${userId}`, {
            allPassed,
            verificationCount: verifications.length,
          });
        }
        break;
      }

      case "inquiry.approved": {
        // Inquiry approved - KYC passed
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;

          // Extract tier from tags if available
          const tags = event.inquiry.attributes.tags || [];
          let approvedTier: "basic" | "standard" | "enhanced" | "accredited" = "basic";

          for (const tag of tags) {
            if (["basic", "standard", "enhanced", "accredited"].includes(tag)) {
              approvedTier = tag as typeof approvedTier;
              break;
            }
          }

          // Set expiration (1 year from now)
          const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: toUserId(userId),
            status: "approved",
            tier: approvedTier,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "approved",
            personaReviewResult: "passed",
            completedAt: Date.now(),
            expiresAt,
          });

          logger.info(`KYC approved for user ${userId}`, {
            tier: approvedTier,
            inquiryId: event.inquiryId,
          });

          // Send approval email notification
          try {
            const user = await convex.query(api.users.getById, { id: toUserId(userId) });
            if (user?.email) {
              await sendKYCApprovedEmail(user.email, approvedTier, user.displayName);
              logger.info("KYC approval email sent", { userId, email: user.email });
            }
          } catch (emailError) {
            logger.error("Failed to send KYC approval email", { userId, error: emailError });
          }
        }
        break;
      }

      case "inquiry.declined": {
        // Inquiry declined - KYC failed
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;
          const reviewerComment = event.inquiry.attributes.reviewer_comment;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: toUserId(userId),
            status: "rejected",
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "declined",
            personaReviewResult: "failed",
            rejectionReason: reviewerComment ?? "Verification failed",
            completedAt: Date.now(),
          });

          logger.info(`KYC declined for user ${userId}`, {
            inquiryId: event.inquiryId,
            reason: reviewerComment,
          });

          // Send decline email notification with reason
          try {
            const user = await convex.query(api.users.getById, { id: toUserId(userId) });
            if (user?.email) {
              await sendKYCDeclinedEmail(user.email, reviewerComment ?? "Verification could not be completed", user.displayName);
              logger.info("KYC decline email sent", { userId, email: user.email });
            }
          } catch (emailError) {
            logger.error("Failed to send KYC decline email", { userId, error: emailError });
          }
        }
        break;
      }

      case "inquiry.failed": {
        // Inquiry failed (technical failure or user abandonment)
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: toUserId(userId),
            status: "rejected",
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "failed",
            rejectionReason: "Verification process failed",
          });

          logger.info(`Inquiry failed for user ${userId}`, {
            inquiryId: event.inquiryId,
          });
        }
        break;
      }

      case "inquiry.expired": {
        // Inquiry expired - user didn't complete in time
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: toUserId(userId),
            status: "expired",
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "expired",
          });

          logger.info(`Inquiry expired for user ${userId}`, {
            inquiryId: event.inquiryId,
          });

          // Send reminder email to complete KYC
          try {
            const user = await convex.query(api.users.getById, { id: toUserId(userId) });
            if (user?.email) {
              await sendKYCReminderEmail(user.email, "expired", user.displayName);
              logger.info("KYC expiry reminder email sent", { userId, email: user.email });
            }
          } catch (emailError) {
            logger.error("Failed to send KYC expiry email", { userId, error: emailError });
          }
        }
        break;
      }

      case "inquiry.transitioned": {
        // Inquiry moved to a new step
        if (event.inquiry && event.referenceId) {
          logger.info(`Inquiry transitioned for user ${event.referenceId}`, {
            inquiryId: event.inquiryId,
            currentStep: event.inquiry.attributes.current_step_name,
            nextStep: event.inquiry.attributes.next_step_name,
          });
        }
        break;
      }

      // =======================================================================
      // Verification Events
      // =======================================================================

      case "verification.passed": {
        // Individual verification check passed
        if (event.verification) {
          logger.info(`Verification passed`, {
            type: event.verification.type,
            id: event.verification.id,
          });

          // Could store individual verification results for detailed reporting
        }
        break;
      }

      case "verification.failed": {
        // Individual verification check failed
        if (event.verification) {
          const failedChecks = event.verification.attributes.checks
            .filter((c) => c.status === "failed")
            .map((c) => ({
              name: c.name,
              reasons: c.reasons,
            }));

          logger.info(`Verification failed`, {
            type: event.verification.type,
            id: event.verification.id,
            failedChecks,
          });
        }
        break;
      }

      case "verification.requires-retry": {
        // Verification needs retry (e.g., blurry photo)
        if (event.verification) {
          logger.info(`Verification requires retry`, {
            type: event.verification.type,
            id: event.verification.id,
          });
        }
        break;
      }

      default:
        logger.info(`Unhandled Persona event type: ${event.type}`);
    }

    // Mark webhook as processed
    if (webhookEventId) {
      await convex.mutation(api.kyc.markWebhookProcessed, {
        id: webhookEventId,
      });
    }

    return c.json({ received: true, eventType: event.type });
  } catch (error) {
    logger.error(`Error processing Persona webhook ${event.type}:`, error);

    // Mark webhook as failed
    if (webhookEventId) {
      await convex.mutation(api.kyc.markWebhookProcessed, {
        id: webhookEventId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Still return 200 to prevent retries for application errors
    return c.json({ received: true, error: "Processing error" });
  }
});

/**
 * Checkr webhook (Background checks)
 * Status: NOT IMPLEMENTED - Events are acknowledged but not processed
 */
app.post("/checkr", async (c) => {
  const signature = c.req.header("X-Checkr-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CHECKR_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    logger.warn("Checkr webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);

  // Store webhook for later processing / audit trail
  const convex = getConvexClient();
  try {
    await convex.mutation(api.kyc.storeWebhookEvent, {
      source: "checkr",
      eventType: body.type || "unknown",
      eventId: `checkr-${body.id || Date.now()}`,
      payload: rawBody,
    });
  } catch (error) {
    logger.error("Failed to store Checkr webhook event", { error });
  }

  // Process Checkr background check events
  try {
    const candidateId = body.data?.object?.candidate_id;
    const reportId = body.data?.object?.id;

    switch (body.type) {
      case "report.completed": {
        const status = body.data?.object?.status;
        logger.info("Checkr report completed", { reportId, status, candidateId });

        // Update KYC record with background check result
        if (candidateId) {
          await convex.mutation(api.kyc.updateBackgroundCheck, {
            checkrCandidateId: candidateId,
            checkrReportId: reportId,
            status: status === "clear" ? "passed" : "review_required",
            completedAt: Date.now(),
          });
        }
        break;
      }

      case "report.upgraded":
      case "report.resumed": {
        logger.info("Checkr report status update", { reportId, type: body.type });
        break;
      }

      case "candidate.created": {
        logger.info("Checkr candidate created", { candidateId });
        break;
      }

      case "invitation.completed": {
        logger.info("Checkr invitation completed", { candidateId });
        break;
      }

      default:
        logger.info("Checkr event received", { type: body.type });
    }

    return c.json({
      received: true,
      processed: true,
      event: body.type,
    });
  } catch (error) {
    logger.error("Failed to process Checkr webhook", { error, type: body.type });
    return c.json({ received: true, processed: false }, 500);
  }
});

/**
 * Nylas webhook (Email sync)
 * Status: NOT IMPLEMENTED - Events are acknowledged but not processed
 */
app.post("/nylas", async (c) => {
  const rawBody = await c.req.text();
  const body = JSON.parse(rawBody);

  // Handle Nylas challenge verification
  if (body.challenge) {
    if (!process.env.NYLAS_WEBHOOK_SECRET) {
      return c.json({ error: "Webhook not configured" }, 500);
    }
    return c.text(body.challenge);
  }

  const signature = c.req.header("X-Nylas-Signature");
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("NYLAS_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    logger.warn("Nylas webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Process Nylas email/calendar events
  try {
    const deltas = body.deltas || [];

    for (const delta of deltas) {
      switch (delta.type) {
        case "message.created": {
          logger.info("New email received", {
            accountId: delta.object_data?.account_id,
            messageId: delta.object_data?.id,
          });
          // Store for notification processing if needed
          break;
        }

        case "event.created":
        case "event.updated": {
          logger.info("Calendar event update", {
            eventId: delta.object_data?.id,
            type: delta.type,
          });
          break;
        }

        case "account.connected": {
          logger.info("Nylas account connected", {
            accountId: delta.object_data?.account_id,
          });
          break;
        }

        case "account.stopped":
        case "account.invalid": {
          logger.warn("Nylas account issue", {
            accountId: delta.object_data?.account_id,
            type: delta.type,
          });
          break;
        }

        default:
          logger.debug("Nylas delta received", { type: delta.type });
      }
    }

    return c.json({
      received: true,
      processed: true,
      deltasProcessed: deltas.length,
    });
  } catch (error) {
    logger.error("Failed to process Nylas webhook", { error });
    return c.json({ received: true, processed: false }, 500);
  }
});

/**
 * Massive webhook (Order execution)
 * Handles order lifecycle events from Massive trading system
 */
app.post("/massive", async (c) => {
  const signature = c.req.header("X-Massive-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.MASSIVE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("MASSIVE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    logger.warn("Massive webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  const convex = getConvexClient();

  // Store webhook for audit trail - critical for financial reconciliation
  try {
    await convex.mutation(api.kyc.storeWebhookEvent, {
      source: "massive",
      eventType: body.event || "unknown",
      eventId: `massive-${body.orderId || body.id || Date.now()}`,
      payload: rawBody,
    });
  } catch (error) {
    logger.error("Failed to store Massive webhook event", { error });
  }

  // Process order events
  try {
    switch (body.event) {
      case "order.filled":
      case "order.partial_fill": {
        // Order was filled (fully or partially)
        logger.info("Processing order fill", {
          orderId: body.orderId,
          fillQuantity: body.fillQuantity,
          fillPrice: body.fillPrice,
        });

        await convex.mutation(api.orders.fillOrder, {
          orderId: body.orderId,
          quantity: body.fillQuantity,
          price: body.fillPrice,
          externalFillId: body.fillId || body.id,
          executedAt: body.executedAt || Date.now(),
        });

        logger.info("Order fill processed successfully", { orderId: body.orderId });
        break;
      }

      case "order.cancelled": {
        logger.info("Processing order cancellation", { orderId: body.orderId });

        await convex.mutation(api.orders.cancelOrder, {
          orderId: body.orderId,
          reason: body.reason || "Cancelled by exchange",
        });

        logger.info("Order cancelled successfully", { orderId: body.orderId });
        break;
      }

      case "order.rejected": {
        logger.warn("Order rejected by exchange", {
          orderId: body.orderId,
          reason: body.reason,
        });

        await convex.mutation(api.orders.rejectOrder, {
          orderId: body.orderId,
          reason: body.reason || "Rejected by exchange",
        });
        break;
      }

      case "order.accepted": {
        logger.info("Order accepted by exchange", { orderId: body.orderId });

        await convex.mutation(api.orders.updateOrderStatus, {
          orderId: body.orderId,
          status: "accepted",
          externalOrderId: body.externalOrderId,
        });
        break;
      }

      default:
        logger.warn("Unknown Massive event type", { event: body.event });
    }

    return c.json({
      received: true,
      processed: true,
      event: body.event,
    });
  } catch (error) {
    logger.error("Failed to process Massive webhook", {
      error,
      event: body.event,
      orderId: body.orderId,
    });

    // Return 500 so Massive retries the webhook
    return c.json({
      received: true,
      processed: false,
      error: "Processing failed",
    }, 500);
  }
});

/**
 * Stripe webhook (Payments)
 * Handles checkout.session.completed, payment_intent.succeeded, payout.paid, etc.
 */
app.post("/stripe", async (c) => {
  const signature = c.req.header("Stripe-Signature");
  const rawBody = await c.req.text();

  if (!signature) {
    logger.warn("Stripe webhook: missing signature");
    return c.json({ error: "Missing signature" }, 401);
  }

  try {
    // Import webhook handler
    const { initializeWebhookHandler } = await import("@pull/core/services/stripe");

    // Initialize Convex client for webhook processing
    const convex = getConvexClient();

    // Initialize webhook handler with callbacks
    const webhookHandler = initializeWebhookHandler({
      // Handle successful deposit
      onDepositCompleted: async (event) => {
        logger.info("Processing deposit completed", {
          userId: event.userId,
          netAmount: event.netAmount,
          sessionId: event.sessionId,
        });

        try {
          // Find the deposit by external ID (session ID or payment intent ID)
          const externalId = event.sessionId || event.paymentIntentId;

          // Complete the deposit (idempotent - won't double-credit)
          await convex.mutation(api.payments.completeDepositByExternalId, {
            externalId,
            stripePaymentIntentId: event.paymentIntentId,
            stripeCustomerId: event.customerId,
          });

          logger.info("Deposit completed successfully", {
            userId: event.userId,
            netAmount: event.netAmount,
          });
        } catch (error) {
          logger.error("Failed to complete deposit", {
            error,
            userId: event.userId,
            sessionId: event.sessionId,
          });
          throw error;
        }
      },

      // Handle failed deposit
      onDepositFailed: async (event) => {
        logger.warn("Deposit payment failed", {
          paymentIntentId: event.paymentIntentId,
          failureCode: event.failureCode,
          failureMessage: event.failureMessage,
        });

        try {
          await convex.mutation(api.payments.failDepositByExternalId, {
            externalId: event.paymentIntentId,
            failureReason: event.failureMessage ?? event.failureCode ?? "Payment failed",
          });
        } catch (error) {
          logger.error("Failed to mark deposit as failed", { error });
        }
      },

      // Handle successful payout
      onPayoutPaid: async (event) => {
        logger.info("Payout paid", {
          payoutId: event.payoutId,
          amount: event.amount,
        });

        try {
          await convex.mutation(api.payments.completeWithdrawalByPayoutId, {
            stripePayoutId: event.payoutId,
          });
        } catch (error) {
          logger.error("Failed to complete withdrawal", { error });
        }
      },

      // Handle failed payout
      onPayoutFailed: async (event) => {
        logger.warn("Payout failed", {
          payoutId: event.payoutId,
          failureCode: event.failureCode,
          failureMessage: event.failureMessage,
        });

        try {
          await convex.mutation(api.payments.failWithdrawalByPayoutId, {
            stripePayoutId: event.payoutId,
            failureReason: event.failureMessage ?? event.failureCode ?? "Payout failed",
          });
        } catch (error) {
          logger.error("Failed to mark withdrawal as failed", { error });
        }
      },

      // Handle payment method attached
      onPaymentMethodAttached: async (event) => {
        logger.info("Payment method attached", {
          paymentMethodId: event.paymentMethodId,
          customerId: event.customerId,
          type: event.type,
        });
        // Payment methods are managed via Stripe - no database action needed
      },

      // Handle connected account updates
      onAccountUpdated: async (event) => {
        logger.info("Connected account updated", {
          accountId: event.accountId,
          payoutsEnabled: event.payoutsEnabled,
          detailsSubmitted: event.detailsSubmitted,
        });

        // Update user's connected account status if needed
        if (event.payoutsEnabled && event.detailsSubmitted) {
          try {
            await convex.mutation(api.payments.markConnectedAccountReady, {
              stripeConnectedAccountId: event.accountId,
            });
          } catch (error) {
            logger.error("Failed to update connected account status", { error });
          }
        }
      },
    });

    // Process the webhook
    const result = await webhookHandler.processWebhook(rawBody, signature);

    if (!result.success) {
      logger.warn("Webhook processing failed", {
        eventId: result.eventId,
        eventType: result.eventType,
        error: result.error,
      });

      // Return 400 for verification failures, 200 for processing failures
      if (result.error?.includes("signature") || result.error?.includes("verification")) {
        return c.json({ error: result.error }, 401);
      }

      // For other errors, acknowledge receipt but log the failure
      return c.json({ received: true, processed: false, error: result.error });
    }

    logger.info("Stripe webhook processed", {
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
    });

    return c.json({ received: true, processed: result.processed });
  } catch (error) {
    logger.error("Stripe webhook error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      500
    );
  }
});

/**
 * Polygon blockchain webhook (Token events)
 * Status: NOT IMPLEMENTED - Events are acknowledged but not processed
 */
app.post("/polygon", async (c) => {
  const signature = c.req.header("X-Polygon-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.POLYGON_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("POLYGON_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    logger.warn("Polygon webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);

  // Store webhook for audit trail
  const convex = getConvexClient();
  try {
    await convex.mutation(api.kyc.storeWebhookEvent, {
      source: "polygon",
      eventType: body.event || "unknown",
      eventId: `polygon-${body.transactionHash || body.id || Date.now()}`,
      payload: rawBody,
    });
  } catch (error) {
    logger.error("Failed to store Polygon webhook event", { error });
  }

  // Process Polygon blockchain events
  try {
    switch (body.event) {
      case "token.transfer": {
        logger.info("Token transfer detected", {
          transactionHash: body.transactionHash,
          from: body.from,
          to: body.to,
          amount: body.amount,
          tokenAddress: body.tokenAddress,
        });

        // Update user balance if this is a deposit to platform wallet
        if (body.to && body.isPlatformWallet) {
          await convex.mutation(api.crypto.processDeposit, {
            transactionHash: body.transactionHash,
            walletAddress: body.from,
            amount: body.amount,
            tokenAddress: body.tokenAddress,
            blockNumber: body.blockNumber,
          });
        }
        break;
      }

      case "nft.transfer": {
        logger.info("NFT transfer detected", {
          transactionHash: body.transactionHash,
          tokenId: body.tokenId,
          from: body.from,
          to: body.to,
        });

        // Update NFT ownership
        await convex.mutation(api.nfts.updateOwnership, {
          transactionHash: body.transactionHash,
          tokenId: body.tokenId,
          newOwner: body.to,
          previousOwner: body.from,
        });
        break;
      }

      case "nft.minted": {
        logger.info("NFT minted", {
          transactionHash: body.transactionHash,
          tokenId: body.tokenId,
          owner: body.owner,
        });

        await convex.mutation(api.nfts.confirmMint, {
          transactionHash: body.transactionHash,
          tokenId: body.tokenId,
          owner: body.owner,
          contractAddress: body.contractAddress,
        });
        break;
      }

      case "transaction.confirmed": {
        logger.info("Transaction confirmed", {
          transactionHash: body.transactionHash,
          confirmations: body.confirmations,
        });
        break;
      }

      default:
        logger.info("Polygon event received", { event: body.event });
    }

    return c.json({
      received: true,
      processed: true,
      event: body.event,
    });
  } catch (error) {
    logger.error("Failed to process Polygon webhook", { error, event: body.event });
    return c.json({ received: true, processed: false }, 500);
  }
});

export { app as webhookRoutes };
