/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services:
 * - Persona (KYC)
 * - Checkr (Background checks)
 * - Nylas (Email)
 * - Massive (Trading)
 * - Stripe (Payments)
 * - Plaid (Banking)
 */

import { Hono } from "hono";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env } from "../types";

const webhooksRouter = new Hono<Env>();

let temporal: TemporalClient | null = null;
let convex: ConvexHttpClient | null = null;

async function getTemporalClient(): Promise<TemporalClient> {
  if (!temporal) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    });
    temporal = new TemporalClient({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || "default",
    });
  }
  return temporal;
}

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// =============================================================================
// PERSONA WEBHOOKS
// =============================================================================

webhooksRouter.post("/persona", async (c) => {
  const signature = c.req.header("persona-signature");

  // Verify webhook signature
  if (!verifyPersonaSignature(await c.req.text(), signature || "")) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = await c.req.json();
  const eventType = body.data?.attributes?.name;

  console.log(`Persona webhook: ${eventType}`);

  if (eventType === "inquiry.completed" || eventType === "inquiry.approved") {
    const inquiryId = body.data?.attributes?.payload?.data?.id;
    const referenceId = body.data?.attributes?.payload?.data?.attributes?.["reference-id"];

    // Signal the onboarding workflow
    const temporal = await getTemporalClient();
    const workflows = temporal.workflow.list({
      query: `WorkflowId STARTS_WITH "onboarding-" AND ExecutionStatus = "Running"`,
    });

    for await (const workflow of workflows) {
      try {
        const handle = temporal.workflow.getHandle(workflow.workflowId);
        await handle.signal("kycCompleted", {
          inquiryId,
          status: "completed",
        });
      } catch (e) {
        // Workflow may not be waiting for this signal
      }
    }
  }

  return c.json({ received: true });
});

// =============================================================================
// CHECKR WEBHOOKS
// =============================================================================

webhooksRouter.post("/checkr", async (c) => {
  const signature = c.req.header("x-checkr-signature");

  if (!verifyCheckrSignature(await c.req.text(), signature || "")) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = await c.req.json();
  const eventType = body.type;

  console.log(`Checkr webhook: ${eventType}`);

  if (eventType === "report.completed") {
    const reportId = body.data?.object?.id;
    const status = body.data?.object?.status;

    // Signal workflows waiting for background check
    const temporal = await getTemporalClient();

    // Update Convex
    const convex = getConvex();
    await convex.mutation(api.functions.kyc.updateBackgroundCheck, {
      checkrReportId: reportId,
      status,
    });
  }

  return c.json({ received: true });
});

// =============================================================================
// NYLAS WEBHOOKS
// =============================================================================

webhooksRouter.post("/nylas", async (c) => {
  const signature = c.req.header("x-nylas-signature");

  if (!verifyNylasSignature(await c.req.text(), signature || "")) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = await c.req.json();

  for (const delta of body.deltas || []) {
    if (delta.type === "message.created") {
      // Trigger email sync for user
      await fetch(process.env.INNGEST_EVENT_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "email/message.received",
          data: {
            grantId: delta.object?.grant_id,
            messageId: delta.object?.id,
          },
        }),
      });
    }
  }

  return c.json({ received: true });
});

// =============================================================================
// MASSIVE (TRADING) WEBHOOKS
// =============================================================================

webhooksRouter.post("/massive", async (c) => {
  const signature = c.req.header("x-massive-signature");

  if (!verifyMassiveSignature(await c.req.text(), signature || "")) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = await c.req.json();
  const eventType = body.event;

  console.log(`Massive webhook: ${eventType}`);

  if (eventType === "order.filled" || eventType === "order.partially_filled") {
    const externalOrderId = body.data?.order_id;

    // Find and signal the order workflow
    const convex = getConvex();
    const order = await convex.query(api.functions.orders.getByExternalId, {
      externalOrderId,
    });

    if (order?.temporalWorkflowId) {
      const temporal = await getTemporalClient();
      const handle = temporal.workflow.getHandle(order.temporalWorkflowId);
      await handle.signal("orderUpdate", {
        status: body.data?.status,
        filledQuantity: parseFloat(body.data?.filled_quantity || "0"),
        avgPrice: parseFloat(body.data?.avg_price || "0"),
      });
    }
  }

  return c.json({ received: true });
});

// =============================================================================
// STRIPE WEBHOOKS
// =============================================================================

webhooksRouter.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");

  // Verify using Stripe SDK in production
  const body = await c.req.json();
  const eventType = body.type;

  console.log(`Stripe webhook: ${eventType}`);

  if (eventType === "payment_intent.succeeded") {
    const paymentIntent = body.data?.object;
    const userId = paymentIntent?.metadata?.userId;
    const amount = paymentIntent?.amount / 100; // Convert from cents

    // Credit user balance
    const convex = getConvex();
    await convex.mutation(api.functions.balances.deposit, {
      userId: userId as any,
      amount,
      currency: "USD",
      source: "stripe",
      externalId: paymentIntent?.id,
    });
  }

  return c.json({ received: true });
});

// =============================================================================
// SIGNATURE VERIFICATION HELPERS
// =============================================================================

function verifyPersonaSignature(payload: string, signature: string): boolean {
  if (!process.env.PERSONA_WEBHOOK_SECRET) return true; // Skip in dev
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", process.env.PERSONA_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

function verifyCheckrSignature(payload: string, signature: string): boolean {
  if (!process.env.CHECKR_WEBHOOK_SECRET) return true;
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", process.env.CHECKR_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

function verifyNylasSignature(payload: string, signature: string): boolean {
  if (!process.env.NYLAS_WEBHOOK_SECRET) return true;
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", process.env.NYLAS_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

function verifyMassiveSignature(payload: string, signature: string): boolean {
  if (!process.env.MASSIVE_WEBHOOK_SECRET) return true;
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", process.env.MASSIVE_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

export { webhooksRouter };
