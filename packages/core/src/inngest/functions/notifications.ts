/**
 * Notifications Inngest Functions
 *
 * Event-driven functions for sending notifications across multiple channels.
 */

import { NonRetryableError } from "inngest";
import {
  inngest,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
} from "../client";
import { EVENT_NAMES } from "../events";
import type { NotificationSendPayload } from "../events";

// =============================================================================
// Types
// =============================================================================

type NotificationType =
  | "trade_executed"
  | "trade_settled"
  | "price_alert"
  | "new_market"
  | "urgent_email"
  | "kyc_update"
  | "reward_earned"
  | "streak_reminder"
  | "digest"
  | "system";

type NotificationChannel = "push" | "email" | "in_app";
type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  sentVia: NotificationChannel[];
  failedChannels: NotificationChannel[];
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

interface UserNotificationPreferences {
  userId: string;
  email: string;
  pushEnabled: boolean;
  pushToken?: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
  timezone: string;
  disabledTypes: NotificationType[];
}

interface PortfolioSummary {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  positions: Array<{
    name: string;
    value: number;
    change: number;
    changePercent: number;
  }>;
  topGainer?: { name: string; change: number };
  topLoser?: { name: string; change: number };
}

interface MarketHighlight {
  ticker: string;
  title: string;
  yesPrice: number;
  volume24h: number;
  isNew: boolean;
}

interface DigestData {
  portfolioSummary: PortfolioSummary;
  marketHighlights: MarketHighlight[];
  unreadEmails: number;
  pointsEarned24h: number;
  currentStreak: number;
  upcomingEvents: Array<{ title: string; date: string }>;
}

// =============================================================================
// Service Interfaces
// =============================================================================

interface PushNotificationService {
  send(params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    priority?: "normal" | "high";
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

interface EmailService {
  send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

interface ConvexService {
  // Notification operations
  createNotification(
    notification: Omit<NotificationRecord, "id" | "createdAt" | "read" | "readAt">
  ): Promise<string>;
  markNotificationSent(
    id: string,
    channel: NotificationChannel
  ): Promise<void>;
  markNotificationFailed(
    id: string,
    channel: NotificationChannel,
    error: string
  ): Promise<void>;

  // User preferences
  getUserNotificationPreferences(
    userId: string
  ): Promise<UserNotificationPreferences | null>;

  // Digest data
  getAllUsersForDigest(): Promise<string[]>;
  getUserDigestData(userId: string): Promise<DigestData>;
  getUserEmail(userId: string): Promise<string | null>;
}

// =============================================================================
// Service Factory
// =============================================================================

interface Services {
  push: PushNotificationService;
  email: EmailService;
  convex: ConvexService;
}

function getServices(): Services {
  return {
    push: {
      async send() {
        throw new Error("PushNotificationService not configured");
      },
    },
    email: {
      async send() {
        throw new Error("EmailService not configured");
      },
    },
    convex: {
      async createNotification() {
        throw new Error("ConvexService not configured");
      },
      async markNotificationSent() {
        throw new Error("ConvexService not configured");
      },
      async markNotificationFailed() {
        throw new Error("ConvexService not configured");
      },
      async getUserNotificationPreferences() {
        throw new Error("ConvexService not configured");
      },
      async getAllUsersForDigest() {
        throw new Error("ConvexService not configured");
      },
      async getUserDigestData() {
        throw new Error("ConvexService not configured");
      },
      async getUserEmail() {
        throw new Error("ConvexService not configured");
      },
    },
  };
}

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
// Helper Functions
// =============================================================================

function isInQuietHours(
  prefs: UserNotificationPreferences,
  priority: NotificationPriority
): boolean {
  // Urgent notifications bypass quiet hours
  if (priority === "urgent") return false;

  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

  const now = new Date();
  const userTime = new Date(
    now.toLocaleString("en-US", { timeZone: prefs.timezone })
  );

  const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();

  const [startHour, startMin] = prefs.quietHoursStart.split(":").map(Number);
  const [endHour, endMin] = prefs.quietHoursEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function generateDigestHtml(data: DigestData, email: string): string {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n);

  const formatPercent = (n: number) =>
    `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const changeColor = (n: number) => (n >= 0 ? "#22c55e" : "#ef4444");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Daily PULL Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 24px;">Good Morning! ☀️</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">Your daily PULL digest for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
    </div>

    <!-- Portfolio Summary -->
    <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #374151;">Portfolio Summary</h2>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 28px; font-weight: bold; color: #111827;">${formatCurrency(data.portfolioSummary.totalValue)}</div>
          <div style="color: ${changeColor(data.portfolioSummary.dailyChange)}; font-size: 14px;">
            ${formatCurrency(data.portfolioSummary.dailyChange)} (${formatPercent(data.portfolioSummary.dailyChangePercent)}) today
          </div>
        </div>
      </div>
      ${
        data.portfolioSummary.topGainer
          ? `<div style="margin-top: 12px; padding: 12px; background-color: #f0fdf4; border-radius: 8px;">
          <span style="color: #22c55e;">📈 Top Gainer:</span> ${data.portfolioSummary.topGainer.name} (+${data.portfolioSummary.topGainer.change.toFixed(2)}%)
        </div>`
          : ""
      }
    </div>

    <!-- Market Highlights -->
    ${
      data.marketHighlights.length > 0
        ? `
    <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #374151;">Market Highlights</h2>
      ${data.marketHighlights
        .slice(0, 3)
        .map(
          (m) => `
        <div style="padding: 12px; margin-bottom: 8px; background-color: #f9fafb; border-radius: 8px;">
          <div style="font-weight: 500; color: #111827;">${m.title} ${m.isNew ? '<span style="background-color: #dbeafe; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 4px;">NEW</span>' : ""}</div>
          <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
            Yes: ${(m.yesPrice * 100).toFixed(0)}¢ • Vol: ${m.volume24h.toLocaleString()}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
    `
        : ""
    }

    <!-- Stats Grid -->
    <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #111827;">${data.pointsEarned24h}</div>
          <div style="font-size: 12px; color: #6b7280;">Points Earned</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #111827;">${data.currentStreak}🔥</div>
          <div style="font-size: 12px; color: #6b7280;">Day Streak</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #111827;">${data.unreadEmails}</div>
          <div style="font-size: 12px; color: #6b7280;">Unread Emails</div>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding: 24px; text-align: center;">
      <a href="https://pull.app/dashboard" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        Open PULL App
      </a>
    </div>

    <!-- Footer -->
    <div style="padding: 16px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0;">You're receiving this because you signed up for PULL daily digests.</p>
      <p style="margin: 8px 0 0;">
        <a href="https://pull.app/settings/notifications" style="color: #6366f1;">Manage preferences</a> •
        <a href="https://pull.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6366f1;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`;
}

function generateDigestText(data: DigestData): string {
  return `
Your Daily PULL Digest - ${new Date().toLocaleDateString()}

PORTFOLIO SUMMARY
Total Value: $${data.portfolioSummary.totalValue.toFixed(2)}
Daily Change: $${data.portfolioSummary.dailyChange.toFixed(2)} (${data.portfolioSummary.dailyChangePercent >= 0 ? "+" : ""}${data.portfolioSummary.dailyChangePercent.toFixed(2)}%)

STATS
- Points Earned (24h): ${data.pointsEarned24h}
- Current Streak: ${data.currentStreak} days
- Unread Emails: ${data.unreadEmails}

MARKET HIGHLIGHTS
${data.marketHighlights
  .slice(0, 3)
  .map(
    (m) => `- ${m.title}: ${(m.yesPrice * 100).toFixed(0)}¢${m.isNew ? " (NEW)" : ""}`
  )
  .join("\n")}

---
Open PULL: https://pull.app/dashboard
Manage preferences: https://pull.app/settings/notifications
`;
}

// =============================================================================
// sendNotification Function
// =============================================================================

/**
 * Sends a notification across multiple channels.
 *
 * Triggers:
 * - Event: "notification/send"
 *
 * Process:
 * 1. Determine which channels to use based on user preferences
 * 2. Send via push, email, and/or in-app
 * 3. Log delivery status
 */
export const sendNotification = inngest.createFunction(
  {
    id: "send-notification",
    name: "Send Notification",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [
      CONCURRENCY_CONFIGS.high,
      // Rate limit per user
      {
        limit: 50,
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
        functionName: "send-notification",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { event: EVENT_NAMES.NOTIFICATION_SEND },
  async ({ event, step, logger }) => {
    const data = event.data as NotificationSendPayload;
    const { push, email, convex } = services();

    logger.info(
      `Sending notification to user ${data.userId}: ${data.type}`
    );

    // Step 1: Get user notification preferences
    const prefs = await step.run("get-user-preferences", async () => {
      const userPrefs = await convex.getUserNotificationPreferences(data.userId);

      if (!userPrefs) {
        // Return default preferences
        return {
          userId: data.userId,
          email: "",
          pushEnabled: true,
          emailEnabled: true,
          inAppEnabled: true,
          timezone: "America/New_York",
          disabledTypes: [],
        } as UserNotificationPreferences;
      }

      return userPrefs;
    });

    // Check if notification type is disabled
    if (prefs.disabledTypes.includes(data.type)) {
      logger.info(`Notification type ${data.type} disabled for user`);
      return { skipped: true, reason: "type_disabled" };
    }

    // Check quiet hours
    if (isInQuietHours(prefs, data.priority)) {
      logger.info("User in quiet hours, skipping non-urgent notification");
      return { skipped: true, reason: "quiet_hours" };
    }

    // Step 2: Create notification record
    const notificationId = await step.run("create-notification-record", async () => {
      return convex.createNotification({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data,
        channels: data.channels,
        priority: data.priority,
        sentVia: [],
        failedChannels: [],
      });
    });

    // Step 3: Determine channels to send through
    const channelsToSend = data.channels.filter((channel) => {
      switch (channel) {
        case "push":
          return prefs.pushEnabled && prefs.pushToken;
        case "email":
          return prefs.emailEnabled && prefs.email;
        case "in_app":
          return prefs.inAppEnabled;
        default:
          return false;
      }
    });

    const results: Record<
      NotificationChannel,
      { success: boolean; error?: string }
    > = {
      push: { success: false },
      email: { success: false },
      in_app: { success: false },
    };

    // Step 4: Send push notification
    if (channelsToSend.includes("push") && prefs.pushToken) {
      results.push = await step.run("send-push", async () => {
        try {
          const result = await push.send({
            token: prefs.pushToken!,
            title: data.title,
            body: data.body,
            data: data.data,
            priority: data.priority === "urgent" ? "high" : "normal",
          });

          if (result.success) {
            await convex.markNotificationSent(notificationId, "push");
          } else {
            await convex.markNotificationFailed(
              notificationId,
              "push",
              result.error ?? "Unknown error"
            );
          }

          return result;
        } catch (err) {
          const error = (err as Error).message;
          await convex.markNotificationFailed(notificationId, "push", error);
          return { success: false, error };
        }
      });
    }

    // Step 5: Send email notification
    if (channelsToSend.includes("email") && prefs.email) {
      results.email = await step.run("send-email", async () => {
        try {
          const result = await email.send({
            to: prefs.email,
            subject: data.title,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>${data.title}</h2>
                <p>${data.body}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #888;">
                  You received this notification from PULL.
                  <a href="https://pull.app/settings/notifications">Manage preferences</a>
                </p>
              </div>
            `,
            text: `${data.title}\n\n${data.body}`,
            from: "notifications@pull.app",
          });

          if (result.success) {
            await convex.markNotificationSent(notificationId, "email");
          } else {
            await convex.markNotificationFailed(
              notificationId,
              "email",
              result.error ?? "Unknown error"
            );
          }

          return result;
        } catch (err) {
          const error = (err as Error).message;
          await convex.markNotificationFailed(notificationId, "email", error);
          return { success: false, error };
        }
      });
    }

    // Step 6: In-app notification (just mark as sent since it's stored)
    if (channelsToSend.includes("in_app")) {
      results.in_app = await step.run("mark-in-app-sent", async () => {
        await convex.markNotificationSent(notificationId, "in_app");
        return { success: true };
      });
    }

    const successCount = Object.values(results).filter((r) => r.success).length;
    logger.info(
      `Notification sent via ${successCount}/${channelsToSend.length} channels`
    );

    return {
      notificationId,
      channelsAttempted: channelsToSend,
      results,
    };
  }
);

// =============================================================================
// digestEmail Function
// =============================================================================

/**
 * Sends daily digest emails to all users.
 *
 * Triggers:
 * - Cron: Daily at 8am
 *
 * Process:
 * 1. Compile portfolio summary
 * 2. Gather market highlights
 * 3. Send personalized digest via Resend
 */
export const digestEmail = inngest.createFunction(
  {
    id: "digest-email",
    name: "Daily Digest Email",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [{ limit: 10 }], // Limit concurrent email sends
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "digest-email",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { cron: "0 8 * * *" }, // Daily at 8am
  async ({ step, logger }) => {
    const { email, convex } = services();

    let totalUsers = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    // Step 1: Get all users who should receive digest
    const userIds = await step.run("get-digest-users", async () => {
      return convex.getAllUsersForDigest();
    });

    logger.info(`Sending digest to ${userIds.length} users`);
    totalUsers = userIds.length;

    // Step 2: Process users in batches
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const batchResults = await step.run(`send-digest-batch-${i}`, async () => {
        const results = { sent: 0, failed: 0 };

        for (const userId of batch) {
          try {
            // Get user's digest data
            const digestData = await convex.getUserDigestData(userId);
            const userEmail = await convex.getUserEmail(userId);

            if (!userEmail) {
              results.failed++;
              continue;
            }

            // Generate and send email
            const html = generateDigestHtml(digestData, userEmail);
            const text = generateDigestText(digestData);

            const result = await email.send({
              to: userEmail,
              subject: `Your PULL Daily Digest - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
              html,
              text,
              from: "digest@pull.app",
            });

            if (result.success) {
              results.sent++;
            } else {
              results.failed++;
              logger.warn(`Failed to send digest to ${userId}: ${result.error}`);
            }
          } catch (err) {
            results.failed++;
            logger.error(
              `Error sending digest to ${userId}: ${(err as Error).message}`
            );
          }
        }

        return results;
      });

      emailsSent += batchResults.sent;
      emailsFailed += batchResults.failed;

      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await step.sleep("batch-delay", "1s");
      }
    }

    logger.info(
      `Digest complete: ${emailsSent} sent, ${emailsFailed} failed`
    );

    return {
      totalUsers,
      emailsSent,
      emailsFailed,
    };
  }
);

// =============================================================================
// Exports
// =============================================================================

export const notificationFunctions = [sendNotification, digestEmail];
