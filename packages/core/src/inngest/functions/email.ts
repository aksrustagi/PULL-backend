/**
 * Email Inngest Functions
 * Email sync, triage, and processing
 */

import { inngest, CRON_SCHEDULES, DEFAULT_RETRY_CONFIG, sendEvent } from "../client";
import type { EmailReceived } from "../events";

// ============================================================================
// Email Sync Function
// ============================================================================

/**
 * Sync user emails from Nylas
 * Triggered by cron (every 15 min) or manual request
 */
export const syncUserEmails = inngest.createFunction(
  {
    id: "pull/email/sync-user-emails",
    name: "Sync User Emails",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 5,
      key: "event.data.userId",
    },
  },
  [
    { cron: CRON_SCHEDULES.EVERY_15_MINUTES },
    { event: "email/sync.requested" },
  ],
  async ({ event, step, logger }) => {
    // For cron triggers, sync all users with connected email
    if (!("data" in event)) {
      const users = await step.run("fetch-users-with-email", async () => {
        // In production: query Convex for users with email grants
        // return await convex.query(api.users.getUsersWithEmailGrants);
        return [] as Array<{ userId: string; grantId: string }>;
      });

      // Fan out to individual user syncs
      for (const user of users) {
        await step.sendEvent("queue-user-sync", {
          name: "email/sync.requested",
          data: {
            userId: user.userId,
            grantId: user.grantId,
            fullSync: false,
          },
        });
      }

      return { processed: users.length, type: "cron" };
    }

    const { userId, grantId, fullSync } = event.data;
    logger.info("Syncing emails for user", { userId, grantId, fullSync });

    // Step 1: Get last sync timestamp
    const lastSync = await step.run("get-last-sync", async () => {
      // In production: query from Convex
      // return await convex.query(api.email.getLastSyncTime, { userId });
      return fullSync ? 0 : Date.now() - 15 * 60 * 1000; // 15 minutes ago
    });

    // Step 2: Fetch new emails from Nylas
    const emails = await step.run("fetch-emails-from-nylas", async () => {
      // In production: use NylasClient
      // const nylas = new NylasClient({ apiKey: process.env.NYLAS_API_KEY });
      // return await nylas.listMessages(grantId, {
      //   received_after: Math.floor(lastSync / 1000),
      //   limit: 100,
      // });
      return { data: [] as Array<{
        id: string;
        thread_id: string;
        from: Array<{ email: string; name?: string }>;
        subject: string;
        snippet: string;
        date: number;
        body: string;
      }> };
    });

    logger.info("Fetched emails", { count: emails.data.length });

    if (emails.data.length === 0) {
      return { processed: 0, userId };
    }

    // Step 3: Process each email
    const processedEmails = await step.run("process-emails", async () => {
      const results = [];

      for (const email of emails.data) {
        // Store in Convex
        // await convex.mutation(api.email.storeEmail, {
        //   userId,
        //   messageId: email.id,
        //   threadId: email.thread_id,
        //   from: email.from[0]?.email || "unknown",
        //   subject: email.subject,
        //   snippet: email.snippet,
        //   receivedAt: email.date * 1000,
        //   body: email.body,
        // });

        results.push({
          messageId: email.id,
          threadId: email.thread_id,
          from: email.from[0]?.email || "unknown",
          subject: email.subject,
        });
      }

      return results;
    });

    // Step 4: Send events for triage
    for (const email of processedEmails) {
      await step.sendEvent(`triage-${email.messageId}`, {
        name: "email/received",
        data: {
          userId,
          grantId,
          messageId: email.messageId,
          threadId: email.threadId,
          from: email.from,
          subject: email.subject,
          snippet: "",
          receivedAt: Date.now(),
        },
      });
    }

    // Step 5: Update sync timestamp
    await step.run("update-sync-timestamp", async () => {
      // In production: update in Convex
      // await convex.mutation(api.email.updateSyncTimestamp, {
      //   userId,
      //   timestamp: Date.now(),
      // });
    });

    return {
      processed: processedEmails.length,
      userId,
      emails: processedEmails.map((e) => e.messageId),
    };
  }
);

// ============================================================================
// Email Triage Function
// ============================================================================

/**
 * Triage a single email with AI analysis
 * Triggered when new email is received
 */
export const triageEmail = inngest.createFunction(
  {
    id: "pull/email/triage-email",
    name: "Triage Email",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 10,
    },
  },
  { event: "email/received" },
  async ({ event, step, logger }) => {
    const { userId, messageId, from, subject, snippet } = event.data;

    logger.info("Triaging email", { userId, messageId, subject });

    // Step 1: Fetch full email content
    const emailContent = await step.run("fetch-email-content", async () => {
      // In production: fetch from Convex or Nylas
      // const email = await convex.query(api.email.getEmail, { messageId });
      return {
        body: snippet,
        attachments: [] as string[],
      };
    });

    // Step 2: Run AI analysis with Claude
    const analysis = await step.run("analyze-with-claude", async () => {
      // In production: use Anthropic SDK
      // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      // const response = await anthropic.messages.create({
      //   model: "claude-sonnet-4-20250514",
      //   max_tokens: 1024,
      //   messages: [{
      //     role: "user",
      //     content: `Analyze this email and provide:
      //       1. Priority (urgent/important/normal/low)
      //       2. Category (trading, financial, personal, marketing, etc.)
      //       3. Summary (1-2 sentences)
      //       4. Whether it contains trading signals
      //       5. Suggested actions
      //
      //       From: ${from}
      //       Subject: ${subject}
      //       Body: ${emailContent.body}
      //     `,
      //   }],
      // });

      // Parse AI response
      return {
        priority: "normal" as const,
        category: "general",
        summary: `Email from ${from} about ${subject}`,
        tradingSignal: false,
        suggestedActions: [] as string[],
        sentiment: "neutral" as const,
        entities: {
          tickers: [] as string[],
          companies: [] as string[],
          amounts: [] as number[],
        },
      };
    });

    // Step 3: Update email record with triage results
    await step.run("update-email-record", async () => {
      // In production: update in Convex
      // await convex.mutation(api.email.updateEmailTriage, {
      //   messageId,
      //   priority: analysis.priority,
      //   category: analysis.category,
      //   summary: analysis.summary,
      //   tradingSignal: analysis.tradingSignal,
      //   suggestedActions: analysis.suggestedActions,
      //   sentiment: analysis.sentiment,
      //   entities: analysis.entities,
      // });
    });

    // Step 4: Link to assets if trading-related
    if (analysis.tradingSignal || analysis.entities.tickers.length > 0) {
      await step.run("link-to-assets", async () => {
        for (const ticker of analysis.entities.tickers) {
          // In production: create email-asset link
          // await convex.mutation(api.email.linkEmailToAsset, {
          //   messageId,
          //   ticker,
          //   signalType: analysis.tradingSignal ? "signal" : "mention",
          // });
        }
      });
    }

    // Step 5: Send notification if urgent
    if (analysis.priority === "urgent") {
      await step.sendEvent("urgent-notification", {
        name: "notification/send",
        data: {
          userId,
          type: "urgent_email",
          title: "Urgent Email",
          body: `From ${from}: ${subject}`,
          data: { messageId },
          channels: ["push", "in_app"],
        },
      });
    }

    // Step 6: Emit triage completed event
    await step.sendEvent("triage-completed", {
      name: "email/triaged",
      data: {
        userId,
        messageId,
        priority: analysis.priority,
        category: analysis.category,
        tradingSignal: analysis.tradingSignal,
      },
    });

    return {
      messageId,
      priority: analysis.priority,
      category: analysis.category,
      tradingSignal: analysis.tradingSignal,
      tickersFound: analysis.entities.tickers,
    };
  }
);

// ============================================================================
// Generate Smart Replies Function
// ============================================================================

/**
 * Generate AI smart reply suggestions for an email
 */
export const generateSmartReplies = inngest.createFunction(
  {
    id: "pull/email/generate-smart-replies",
    name: "Generate Smart Replies",
    retries: 2,
  },
  { event: "email/triaged" },
  async ({ event, step, logger }) => {
    const { userId, messageId, priority, category } = event.data;

    // Only generate for important/urgent emails
    if (priority !== "urgent" && priority !== "important") {
      logger.info("Skipping smart reply generation for low priority", { messageId });
      return { skipped: true, reason: "low_priority" };
    }

    logger.info("Generating smart replies", { userId, messageId });

    // Step 1: Fetch email content
    const email = await step.run("fetch-email", async () => {
      // In production: fetch from Convex
      return {
        from: "sender@example.com",
        subject: "Test subject",
        body: "Test body",
        thread: [] as Array<{ from: string; body: string }>,
      };
    });

    // Step 2: Generate replies with Claude
    const replies = await step.run("generate-with-claude", async () => {
      // In production: use Anthropic SDK
      // Generate 3 different reply options
      return [
        {
          id: `reply-${messageId}-1`,
          content: "Thank you for your email. I'll review this and get back to you shortly.",
          tone: "professional" as const,
          confidence: 85,
        },
        {
          id: `reply-${messageId}-2`,
          content: "Thanks for reaching out! I'll look into this today.",
          tone: "friendly" as const,
          confidence: 80,
        },
        {
          id: `reply-${messageId}-3`,
          content: "Received, thanks.",
          tone: "brief" as const,
          confidence: 75,
        },
      ];
    });

    // Step 3: Store replies
    await step.run("store-replies", async () => {
      // In production: store in Convex
      // await convex.mutation(api.email.storeSmartReplies, {
      //   messageId,
      //   replies,
      // });
    });

    return {
      messageId,
      repliesGenerated: replies.length,
    };
  }
);

// ============================================================================
// Export Functions
// ============================================================================

export const emailFunctions = [syncUserEmails, triageEmail, generateSmartReplies];
