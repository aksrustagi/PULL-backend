import { Hono } from "hono";
import * as crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { PersonaClient } from "@pull/core/services/persona";
import type { WebhookPayload, Inquiry, Verification } from "@pull/core/services/persona/types";

const app = new Hono();

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
      console.warn("Persona webhook: timestamp too old");
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
    console.error("Persona signature verification error:", error);
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
    console.error("PERSONA_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyPersonaSignature(rawBody, signature, secret)) {
    console.warn("Persona webhook: invalid signature");
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
      source: "persona" as any,
      eventType: body.data.type,
      eventId,
      payload: rawBody,
    });
  } catch (error) {
    console.error("Failed to store webhook event:", error);
  }

  const event = parsePersonaWebhook(body);
  console.log(`Persona webhook received: ${event.type}`, {
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
            userId: userId as any,
            status: "in_progress" as any,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: inquiry.attributes.status,
            personaCompletedAt: Date.now(),
          });

          console.log(`Inquiry ${event.inquiryId} completed for user ${userId}`, {
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
            userId: userId as any,
            status: "approved" as any,
            tier: approvedTier as any,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "approved",
            personaReviewResult: "passed",
            completedAt: Date.now(),
            expiresAt,
          });

          console.log(`KYC approved for user ${userId}`, {
            tier: approvedTier,
            inquiryId: event.inquiryId,
          });

          // TODO: Send approval email notification
          // TODO: Signal Temporal workflow if running
        }
        break;
      }

      case "inquiry.declined": {
        // Inquiry declined - KYC failed
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;
          const reviewerComment = event.inquiry.attributes.reviewer_comment;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: userId as any,
            status: "rejected" as any,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "declined",
            personaReviewResult: "failed",
            rejectionReason: reviewerComment ?? "Verification failed",
            completedAt: Date.now(),
          });

          console.log(`KYC declined for user ${userId}`, {
            inquiryId: event.inquiryId,
            reason: reviewerComment,
          });

          // TODO: Send decline email notification with reason
        }
        break;
      }

      case "inquiry.failed": {
        // Inquiry failed (technical failure or user abandonment)
        if (event.inquiry && event.referenceId) {
          const userId = event.referenceId;

          await convex.mutation(api.kyc.updateKYCStatus, {
            userId: userId as any,
            status: "rejected" as any,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "failed",
            rejectionReason: "Verification process failed",
          });

          console.log(`Inquiry failed for user ${userId}`, {
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
            userId: userId as any,
            status: "expired" as any,
            personaInquiryId: event.inquiryId,
            personaReviewStatus: "expired",
          });

          console.log(`Inquiry expired for user ${userId}`, {
            inquiryId: event.inquiryId,
          });

          // TODO: Send reminder email to complete KYC
        }
        break;
      }

      case "inquiry.transitioned": {
        // Inquiry moved to a new step
        if (event.inquiry && event.referenceId) {
          console.log(`Inquiry transitioned for user ${event.referenceId}`, {
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
          console.log(`Verification passed`, {
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

          console.log(`Verification failed`, {
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
          console.log(`Verification requires retry`, {
            type: event.verification.type,
            id: event.verification.id,
          });
        }
        break;
      }

      default:
        console.log(`Unhandled Persona event type: ${event.type}`);
    }

    // Mark webhook as processed
    if (webhookEventId) {
      await convex.mutation(api.kyc.markWebhookProcessed, {
        id: webhookEventId,
      });
    }

    return c.json({ received: true, eventType: event.type });
  } catch (error) {
    console.error(`Error processing Persona webhook ${event.type}:`, error);

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
 */
app.post("/checkr", async (c) => {
  const signature = c.req.header("X-Checkr-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CHECKR_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn("Checkr webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  // TODO: Process background check webhook
  console.log("Checkr webhook verified:", body.type);

  return c.json({ received: true });
});

/**
 * Nylas webhook (Email sync)
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
    console.error("NYLAS_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn("Nylas webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // TODO: Process email sync notifications
  console.log("Nylas webhook verified:", body.trigger);

  return c.json({ received: true });
});

/**
 * Massive webhook (Order execution)
 */
app.post("/massive", async (c) => {
  const signature = c.req.header("X-Massive-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.MASSIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MASSIVE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn("Massive webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  // TODO: Process order execution updates
  console.log("Massive webhook verified:", body.event);

  return c.json({ received: true });
});

/**
 * Stripe webhook (Payments)
 */
app.post("/stripe", async (c) => {
  const signature = c.req.header("Stripe-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!signature) {
    console.warn("Stripe webhook: missing signature");
    return c.json({ error: "Missing signature" }, 401);
  }

  // Stripe uses t=timestamp,v1=signature format
  const parts = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signaturePart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    console.warn("Stripe webhook: malformed signature");
    return c.json({ error: "Invalid signature format" }, 401);
  }

  const timestamp = timestampPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const receivedSig = signaturePart.slice(3);
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSig),
        Buffer.from(expectedSignature)
      )
    ) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  } catch {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Verify timestamp is within tolerance (5 minutes)
  const webhookTimestamp = parseInt(timestamp, 10) * 1000;
  if (Math.abs(Date.now() - webhookTimestamp) > 5 * 60 * 1000) {
    return c.json({ error: "Webhook timestamp too old" }, 401);
  }

  // TODO: Process payment events
  console.log("Stripe webhook verified");

  return c.json({ received: true });
});

/**
 * Polygon blockchain webhook (Token events)
 */
app.post("/polygon", async (c) => {
  const signature = c.req.header("X-Polygon-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.POLYGON_WEBHOOK_SECRET;
  if (!secret) {
    console.error("POLYGON_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn("Polygon webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  // TODO: Process blockchain events
  console.log("Polygon webhook verified:", body.event);

  return c.json({ received: true });
});

export { app as webhookRoutes };
