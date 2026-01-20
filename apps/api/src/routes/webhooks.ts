import { Hono } from "hono";
import Stripe from "stripe";

const app = new Hono();

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
  console.log("Persona webhook:", body.data?.type);

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
  console.log("Checkr webhook:", body.type);

  return c.json({ received: true });
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

  console.log("Nylas webhook:", body.trigger);

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
  console.log("Massive webhook:", body.event);

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

    return c.json({ received: true });
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
  console.log("Polygon webhook:", body.event);

  return c.json({ received: true });
});

export { app as webhookRoutes };
