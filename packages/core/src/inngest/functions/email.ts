/**
 * Email Inngest Functions
 *
 * Event-driven functions for email synchronization and AI triage.
 */

import { NonRetryableError } from "inngest";
import {
  inngest,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
} from "../client";
import { EVENT_NAMES } from "../events";
import type { EmailReceivedPayload } from "../events";

// =============================================================================
// Types
// =============================================================================

interface EmailRecord {
  id: string;
  userId: string;
  externalId: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string[];
  body: string;
  snippet: string;
  receivedAt: Date;
  isRead: boolean;
  hasAttachments: boolean;
  folderId?: string;
  triageResult?: TriageResult;
  linkedAssets?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface TriageResult {
  category: "urgent" | "important" | "normal" | "low_priority" | "spam";
  summary: string;
  suggestedActions: string[];
  hasTradingSignal: boolean;
  tradingSignal?: {
    type: "buy" | "sell" | "hold" | "alert";
    ticker?: string;
    confidence: number;
    summary: string;
  };
  relatedAssets?: string[];
  sentiment: "positive" | "neutral" | "negative";
  requiresResponse: boolean;
  estimatedResponseTime?: string;
}

interface UserEmailGrant {
  userId: string;
  grantId: string;
  email: string;
  provider: "google" | "microsoft" | "imap";
  lastSyncAt?: Date;
  syncCursor?: string;
}

// =============================================================================
// Service Interfaces (to be injected)
// =============================================================================

interface NylasService {
  listMessages(
    grantId: string,
    params?: {
      limit?: number;
      received_after?: number;
      page_token?: string;
    }
  ): Promise<{
    data: Array<{
      id: string;
      thread_id?: string;
      subject: string;
      from: Array<{ email: string; name?: string }>;
      to: Array<{ email: string; name?: string }>;
      body: string;
      snippet: string;
      date: number;
      unread: boolean;
      attachments?: Array<{ id: string; filename: string }>;
    }>;
    next_cursor?: string;
  }>;
  getMessage(
    grantId: string,
    messageId: string
  ): Promise<{
    id: string;
    thread_id?: string;
    subject: string;
    from: Array<{ email: string; name?: string }>;
    body: string;
    snippet: string;
    date: number;
  }>;
}

interface AIService {
  triageEmail(params: {
    subject: string;
    from: string;
    body: string;
    snippet: string;
    context?: {
      userPortfolio?: string[];
      recentActivity?: string[];
    };
  }): Promise<TriageResult>;
}

interface ConvexService {
  // Email operations
  storeEmail(email: Omit<EmailRecord, "id" | "createdAt" | "updatedAt">): Promise<string>;
  updateEmail(id: string, updates: Partial<EmailRecord>): Promise<void>;
  getEmail(id: string): Promise<EmailRecord | null>;
  getEmailByExternalId(externalId: string): Promise<EmailRecord | null>;

  // User grants
  getUserEmailGrants(): Promise<UserEmailGrant[]>;
  getUserEmailGrant(userId: string): Promise<UserEmailGrant | null>;
  updateSyncCursor(userId: string, cursor?: string, syncTime?: Date): Promise<void>;

  // User data
  getUserPortfolio(userId: string): Promise<string[]>;
  getUserRecentActivity(userId: string): Promise<string[]>;
}

interface NotificationService {
  sendUrgentAlert(params: {
    userId: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

// =============================================================================
// Service Factory (dependency injection pattern)
// =============================================================================

interface Services {
  nylas: NylasService;
  ai: AIService;
  convex: ConvexService;
  notifications: NotificationService;
}

function getServices(): Services {
  // In production, these would be properly initialized services
  // For now, we return stubs that should be replaced with real implementations
  return {
    nylas: {
      async listMessages() {
        throw new Error("NylasService not configured");
      },
      async getMessage() {
        throw new Error("NylasService not configured");
      },
    },
    ai: {
      async triageEmail() {
        throw new Error("AIService not configured");
      },
    },
    convex: {
      async storeEmail() {
        throw new Error("ConvexService not configured");
      },
      async updateEmail() {
        throw new Error("ConvexService not configured");
      },
      async getEmail() {
        throw new Error("ConvexService not configured");
      },
      async getEmailByExternalId() {
        throw new Error("ConvexService not configured");
      },
      async getUserEmailGrants() {
        throw new Error("ConvexService not configured");
      },
      async getUserEmailGrant() {
        throw new Error("ConvexService not configured");
      },
      async updateSyncCursor() {
        throw new Error("ConvexService not configured");
      },
      async getUserPortfolio() {
        throw new Error("ConvexService not configured");
      },
      async getUserRecentActivity() {
        throw new Error("ConvexService not configured");
      },
    },
    notifications: {
      async sendUrgentAlert() {
        throw new Error("NotificationService not configured");
      },
    },
  };
}

// Allow service injection for testing
let servicesOverride: Services | null = null;

export function setServices(services: Services): void {
  servicesOverride = services;
}

export function clearServices(): void {
  servicesOverride = null;
}

function services(): Services {
  return servicesOverride ?? getServices();
}

// =============================================================================
// syncUserEmails Function
// =============================================================================

/**
 * Synchronizes emails for all users or a specific user.
 *
 * Triggers:
 * - Cron: Every 15 minutes
 * - Event: "email/sync.requested"
 *
 * Process:
 * 1. Fetch new emails from Nylas
 * 2. Triage each email with Claude AI
 * 3. Store in Convex database
 * 4. Detect trading signals
 * 5. Send alerts for urgent emails
 */
export const syncUserEmails = inngest.createFunction(
  {
    id: "sync-user-emails",
    name: "Sync User Emails",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [CONCURRENCY_CONFIGS.medium],
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "sync-user-emails",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  [
    { cron: "*/15 * * * *" }, // Every 15 minutes
    { event: EVENT_NAMES.EMAIL_SYNC_REQUESTED },
  ],
  async ({ event, step, logger }) => {
    const { nylas, convex } = services();

    // Determine which users to sync
    const targetUserId = event.name === EVENT_NAMES.EMAIL_SYNC_REQUESTED
      ? event.data.userId
      : undefined;

    const fullSync = event.name === EVENT_NAMES.EMAIL_SYNC_REQUESTED
      ? event.data.fullSync
      : false;

    // Step 1: Get user grants to sync
    const grants = await step.run("get-user-grants", async () => {
      if (targetUserId) {
        const grant = await convex.getUserEmailGrant(targetUserId);
        return grant ? [grant] : [];
      }
      return convex.getUserEmailGrants();
    });

    if (grants.length === 0) {
      logger.info("No email grants to sync");
      return { synced: 0, emails: 0 };
    }

    logger.info(`Syncing emails for ${grants.length} users`);

    // Step 2: Process each user's emails
    const results = await Promise.all(
      grants.map((grant) =>
        step.run(`sync-user-${grant.userId}`, async () =>
          syncSingleUserEmails(grant, fullSync, logger)
        )
      )
    );

    // Step 3: Aggregate results
    const totalEmails = results.reduce((sum, r) => sum + r.emailsProcessed, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    logger.info(`Email sync complete: ${totalEmails} emails, ${totalErrors} errors`);

    return {
      synced: grants.length,
      emails: totalEmails,
      errors: totalErrors,
      details: results,
    };
  }
);

async function syncSingleUserEmails(
  grant: UserEmailGrant,
  fullSync: boolean,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Promise<{ userId: string; emailsProcessed: number; errors: number }> {
  const { nylas, ai, convex, notifications } = services();

  let emailsProcessed = 0;
  let errors = 0;
  let pageCursor: string | undefined;
  const processedIds = new Set<string>();

  try {
    // Calculate sync window
    const syncAfter = fullSync
      ? undefined
      : grant.lastSyncAt
        ? Math.floor(grant.lastSyncAt.getTime() / 1000)
        : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000); // Default: last 24 hours

    do {
      // Fetch emails from Nylas
      const response = await nylas.listMessages(grant.grantId, {
        limit: 50,
        received_after: syncAfter,
        page_token: pageCursor,
      });

      for (const message of response.data) {
        if (processedIds.has(message.id)) continue;
        processedIds.add(message.id);

        try {
          // Check if email already exists
          const existing = await convex.getEmailByExternalId(message.id);
          if (existing) {
            continue;
          }

          // Get user context for better triage
          const [portfolio, recentActivity] = await Promise.all([
            convex.getUserPortfolio(grant.userId),
            convex.getUserRecentActivity(grant.userId),
          ]);

          // Triage the email with AI
          const triageResult = await ai.triageEmail({
            subject: message.subject,
            from: message.from[0]?.email ?? "unknown",
            body: message.body,
            snippet: message.snippet,
            context: {
              userPortfolio: portfolio,
              recentActivity,
            },
          });

          // Store in Convex
          const emailId = await convex.storeEmail({
            userId: grant.userId,
            externalId: message.id,
            threadId: message.thread_id,
            subject: message.subject,
            from: message.from[0]?.email ?? "unknown",
            to: message.to.map((t) => t.email),
            body: message.body,
            snippet: message.snippet,
            receivedAt: new Date(message.date * 1000),
            isRead: !message.unread,
            hasAttachments: (message.attachments?.length ?? 0) > 0,
            triageResult,
            linkedAssets: triageResult.relatedAssets,
          });

          // Send notification for urgent emails
          if (triageResult.category === "urgent") {
            await notifications.sendUrgentAlert({
              userId: grant.userId,
              title: "Urgent Email",
              body: triageResult.summary,
              data: {
                emailId,
                subject: message.subject,
                from: message.from[0]?.email,
              },
            });
          }

          // Send trading signal event if detected
          if (triageResult.hasTradingSignal && triageResult.tradingSignal) {
            await inngest.send({
              name: EVENT_NAMES.TRADING_SIGNAL_DETECTED,
              data: {
                userId: grant.userId,
                emailId,
                signalType: triageResult.tradingSignal.type,
                ticker: triageResult.tradingSignal.ticker,
                confidence: triageResult.tradingSignal.confidence,
                summary: triageResult.tradingSignal.summary,
                source: `email:${message.from[0]?.email}`,
              },
            });
          }

          emailsProcessed++;
        } catch (err) {
          logger.error(`Failed to process email ${message.id}: ${(err as Error).message}`);
          errors++;
        }
      }

      pageCursor = response.next_cursor;
    } while (pageCursor);

    // Update sync cursor
    await convex.updateSyncCursor(grant.userId, pageCursor, new Date());

    return { userId: grant.userId, emailsProcessed, errors };
  } catch (err) {
    logger.error(`Failed to sync emails for user ${grant.userId}: ${(err as Error).message}`);
    throw err;
  }
}

// =============================================================================
// triageEmail Function
// =============================================================================

/**
 * Triages a single email using AI analysis.
 *
 * Triggers:
 * - Event: "email/received" (from webhooks)
 *
 * Process:
 * 1. Run AI analysis on email content
 * 2. Update email record with triage result
 * 3. Link to relevant assets if applicable
 */
export const triageEmail = inngest.createFunction(
  {
    id: "triage-email",
    name: "Triage Email",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [
      CONCURRENCY_CONFIGS.medium,
      // Rate limit per user to prevent abuse
      {
        limit: 20,
        key: "event.data.userId",
        scope: "fn",
      },
    ],
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "triage-email",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { event: EVENT_NAMES.EMAIL_RECEIVED },
  async ({ event, step, logger }) => {
    const data = event.data as EmailReceivedPayload;
    const { nylas, ai, convex, notifications } = services();

    logger.info(`Triaging email ${data.emailId} for user ${data.userId}`);

    // Step 1: Fetch email content from Nylas
    const emailContent = await step.run("fetch-email-content", async () => {
      const message = await nylas.getMessage(data.grantId, data.emailId);
      return {
        subject: message.subject,
        from: message.from[0]?.email ?? "unknown",
        body: message.body,
        snippet: message.snippet,
      };
    });

    // Step 2: Get user context
    const userContext = await step.run("get-user-context", async () => {
      const [portfolio, recentActivity] = await Promise.all([
        convex.getUserPortfolio(data.userId),
        convex.getUserRecentActivity(data.userId),
      ]);
      return { portfolio, recentActivity };
    });

    // Step 3: Run AI triage
    const triageResult = await step.run("ai-triage", async () => {
      return ai.triageEmail({
        subject: emailContent.subject,
        from: emailContent.from,
        body: emailContent.body,
        snippet: emailContent.snippet,
        context: {
          userPortfolio: userContext.portfolio,
          recentActivity: userContext.recentActivity,
        },
      });
    });

    // Step 4: Check if email exists, if not create it
    const emailRecord = await step.run("store-or-update-email", async () => {
      const existing = await convex.getEmailByExternalId(data.emailId);

      if (existing) {
        await convex.updateEmail(existing.id, {
          triageResult,
          linkedAssets: triageResult.relatedAssets,
        });
        return existing.id;
      }

      // Create new email record
      return convex.storeEmail({
        userId: data.userId,
        externalId: data.emailId,
        threadId: data.threadId,
        subject: data.subject,
        from: data.from,
        to: [],
        body: emailContent.body,
        snippet: emailContent.snippet,
        receivedAt: new Date(data.receivedAt),
        isRead: false,
        hasAttachments: data.hasAttachments,
        triageResult,
        linkedAssets: triageResult.relatedAssets,
      });
    });

    // Step 5: Handle urgent emails
    if (triageResult.category === "urgent") {
      await step.run("send-urgent-notification", async () => {
        await notifications.sendUrgentAlert({
          userId: data.userId,
          title: "Urgent Email",
          body: triageResult.summary,
          data: {
            emailId: emailRecord,
            subject: data.subject,
            from: data.from,
          },
        });
      });
    }

    // Step 6: Handle trading signals
    if (triageResult.hasTradingSignal && triageResult.tradingSignal) {
      await step.run("emit-trading-signal", async () => {
        await inngest.send({
          name: EVENT_NAMES.TRADING_SIGNAL_DETECTED,
          data: {
            userId: data.userId,
            emailId: emailRecord,
            signalType: triageResult.tradingSignal!.type,
            ticker: triageResult.tradingSignal!.ticker,
            confidence: triageResult.tradingSignal!.confidence,
            summary: triageResult.tradingSignal!.summary,
            source: `email:${data.from}`,
          },
        });
      });
    }

    logger.info(`Email triaged: category=${triageResult.category}, hasSignal=${triageResult.hasTradingSignal}`);

    return {
      emailId: emailRecord,
      category: triageResult.category,
      hasTradingSignal: triageResult.hasTradingSignal,
      requiresResponse: triageResult.requiresResponse,
    };
  }
);

// =============================================================================
// Exports
// =============================================================================

export const emailFunctions = [syncUserEmails, triageEmail];
