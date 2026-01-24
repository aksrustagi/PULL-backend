import { Hono } from "hono";
import * as crypto from "crypto";

const app = new Hono();

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
 * Persona webhook (KYC)
 */
app.post("/persona", async (c) => {
  const signature = c.req.header("Persona-Signature");
  const rawBody = await c.req.text();

  const secret = process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PERSONA_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn("Persona webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(rawBody);
  // TODO: Process KYC webhook event
  console.log("Persona webhook verified:", body.data?.type);

  return c.json({ received: true });
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
