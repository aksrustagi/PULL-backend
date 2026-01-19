/**
 * Email Intelligence Routes
 *
 * Superhuman-style email client with AI triage.
 * Integrates with Nylas for email sync and Claude for intelligence.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env } from "../types";

const emailRouter = new Hono<Env>();

let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

/**
 * Get OAuth URL for email connection
 * GET /email/connect
 */
emailRouter.get("/connect", async (c) => {
  const userId = c.get("userId");
  const provider = c.req.query("provider") || "google";

  // Generate Nylas OAuth URL
  const nylasAuthUrl = new URL("https://api.nylas.com/v3/connect/auth");
  nylasAuthUrl.searchParams.set("client_id", process.env.NYLAS_CLIENT_ID!);
  nylasAuthUrl.searchParams.set("redirect_uri", `${process.env.API_URL}/email/callback`);
  nylasAuthUrl.searchParams.set("response_type", "code");
  nylasAuthUrl.searchParams.set("provider", provider);
  nylasAuthUrl.searchParams.set("state", userId);

  return c.json({
    data: {
      authUrl: nylasAuthUrl.toString(),
    },
  });
});

/**
 * Get inbox (triaged emails)
 * GET /email/inbox
 */
emailRouter.get("/inbox", async (c) => {
  const userId = c.get("userId");
  const priority = c.req.query("priority");
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const convex = getConvex();

  const emails = await convex.query(api.functions.emails.getInbox, {
    userId: userId as any,
    priority,
    category,
    limit,
  });

  return c.json({
    data: emails,
    meta: { total: emails.length, limit },
  });
});

/**
 * Get single email
 * GET /email/:emailId
 */
emailRouter.get("/:emailId", async (c) => {
  const userId = c.get("userId");
  const { emailId } = c.req.param();

  const convex = getConvex();

  const email = await convex.query(api.functions.emails.getById, {
    emailId: emailId as any,
    userId: userId as any,
  });

  if (!email) {
    return c.json({ error: { message: "Email not found", code: "EMAIL_NOT_FOUND" } }, 404);
  }

  return c.json({ data: email });
});

/**
 * Mark email as read
 * POST /email/:emailId/read
 */
emailRouter.post("/:emailId/read", async (c) => {
  const userId = c.get("userId");
  const { emailId } = c.req.param();

  const convex = getConvex();

  await convex.mutation(api.functions.emails.markAsRead, {
    emailId: emailId as any,
    userId: userId as any,
  });

  return c.json({ data: { success: true } });
});

/**
 * Archive email
 * POST /email/:emailId/archive
 */
emailRouter.post("/:emailId/archive", async (c) => {
  const userId = c.get("userId");
  const { emailId } = c.req.param();

  const convex = getConvex();

  await convex.mutation(api.functions.emails.archive, {
    emailId: emailId as any,
    userId: userId as any,
  });

  return c.json({ data: { success: true } });
});

/**
 * Get AI reply suggestions
 * GET /email/:emailId/suggestions
 */
emailRouter.get("/:emailId/suggestions", async (c) => {
  const userId = c.get("userId");
  const { emailId } = c.req.param();

  const convex = getConvex();

  const suggestions = await convex.query(api.functions.emails.getReplySuggestions, {
    emailId: emailId as any,
    userId: userId as any,
  });

  return c.json({ data: suggestions });
});

/**
 * Send email
 * POST /email/send
 */
emailRouter.post(
  "/send",
  zValidator(
    "json",
    z.object({
      to: z.array(z.string().email()),
      cc: z.array(z.string().email()).optional(),
      subject: z.string(),
      body: z.string(),
      replyToId: z.string().optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const convex = getConvex();

    const result = await convex.mutation(api.functions.emails.send, {
      userId: userId as any,
      ...body,
    });

    return c.json({ data: result });
  }
);

/**
 * Trigger email sync
 * POST /email/sync
 */
emailRouter.post("/sync", async (c) => {
  const userId = c.get("userId");

  // Trigger Inngest sync job
  await fetch(`${process.env.INNGEST_EVENT_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "email/sync.requested",
      data: { userId },
    }),
  });

  return c.json({ data: { message: "Sync initiated" } });
});

export { emailRouter };
