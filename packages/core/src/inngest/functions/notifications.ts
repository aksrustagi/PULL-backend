/**
 * Notification Inngest Functions
 * Push notifications, emails, and digests
 */

import { inngest, CRON_SCHEDULES, DEFAULT_RETRY_CONFIG, LIGHT_RETRY_CONFIG } from "../client";

// ============================================================================
// Notification Configuration
// ============================================================================

const DEFAULT_CHANNELS: Record<string, Array<"push" | "email" | "in_app" | "sms">> = {
  order_filled: ["push", "in_app"],
  market_settled: ["push", "in_app", "email"],
  price_alert: ["push", "in_app"],
  deposit_confirmed: ["push", "in_app", "email"],
  withdrawal_completed: ["push", "in_app", "email"],
  kyc_approved: ["push", "in_app", "email"],
  kyc_rejected: ["push", "in_app", "email"],
  tier_upgraded: ["push", "in_app", "email"],
  streak_reminder: ["push"],
  urgent_email: ["push", "in_app"],
  rwa_price_change: ["push", "in_app"],
  new_market: ["in_app"],
};

// ============================================================================
// Send Notification Function
// ============================================================================

/**
 * Send notification across multiple channels
 * Triggered by notification/send events
 */
export const sendNotification = inngest.createFunction(
  {
    id: "pull/notifications/send-notification",
    name: "Send Notification",
    retries: LIGHT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 20,
    },
  },
  { event: "notification/send" },
  async ({ event, step, logger }) => {
    const { userId, type, title, body, data, channels } = event.data;

    logger.info("Sending notification", { userId, type, title });

    // Step 1: Get user preferences and devices
    const userPrefs = await step.run("get-user-preferences", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.users.getNotificationPreferences, { userId });
      return {
        email: "user@example.com",
        pushEnabled: true,
        emailEnabled: true,
        inAppEnabled: true,
        smsEnabled: false,
        phoneNumber: null as string | null,
        pushTokens: [] as string[],
        quietHours: { start: 22, end: 7 },
        timezone: "America/New_York",
        preferences: {} as Record<string, boolean>,
      };
    });

    // Step 2: Determine channels to use
    const activeChannels = channels || DEFAULT_CHANNELS[type] || ["in_app"];

    // Filter based on user preferences
    const enabledChannels = activeChannels.filter((channel) => {
      switch (channel) {
        case "push":
          return userPrefs.pushEnabled && userPrefs.pushTokens.length > 0;
        case "email":
          return userPrefs.emailEnabled && userPrefs.email;
        case "in_app":
          return userPrefs.inAppEnabled;
        case "sms":
          return userPrefs.smsEnabled && userPrefs.phoneNumber;
        default:
          return false;
      }
    });

    // Check quiet hours for push/sms
    const isQuietHours = await step.run("check-quiet-hours", async () => {
      const now = new Date();
      // In production: convert to user's timezone
      const hour = now.getHours();
      return (
        hour >= userPrefs.quietHours.start || hour < userPrefs.quietHours.end
      );
    });

    // Step 3: Create notification record
    const notificationId = await step.run("create-notification-record", async () => {
      // In production: insert into Convex
      // return await convex.mutation(api.notifications.create, {
      //   userId,
      //   type,
      //   title,
      //   body,
      //   data,
      //   channels: enabledChannels,
      //   createdAt: Date.now(),
      // });
      return `notif_${Date.now()}`;
    });

    const deliveryResults: Record<string, { success: boolean; error?: string }> = {};

    // Step 4: Send to each channel
    for (const channel of enabledChannels) {
      // Skip push/sms during quiet hours (unless urgent)
      if (
        isQuietHours &&
        (channel === "push" || channel === "sms") &&
        type !== "urgent_email"
      ) {
        deliveryResults[channel] = { success: false, error: "quiet_hours" };
        continue;
      }

      const result = await step.run(`send-${channel}`, async () => {
        try {
          switch (channel) {
            case "push":
              return await sendPushNotification(
                userPrefs.pushTokens,
                title,
                body,
                data
              );
            case "email":
              return await sendEmailNotification(
                userPrefs.email!,
                title,
                body,
                data
              );
            case "in_app":
              return await sendInAppNotification(
                userId,
                notificationId,
                title,
                body,
                data
              );
            case "sms":
              return await sendSmsNotification(
                userPrefs.phoneNumber!,
                title,
                body
              );
            default:
              return { success: false, error: "unknown_channel" };
          }
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      deliveryResults[channel] = result;

      // Send delivery event
      if (result.success) {
        await step.sendEvent(`delivered-${channel}`, {
          name: "notification/delivered",
          data: {
            userId,
            notificationId,
            channel,
            deliveredAt: Date.now(),
          },
        });
      }
    }

    // Step 5: Update notification record with delivery status
    await step.run("update-delivery-status", async () => {
      // In production: update in Convex
      // await convex.mutation(api.notifications.updateDeliveryStatus, {
      //   notificationId,
      //   deliveryResults,
      //   updatedAt: Date.now(),
      // });
    });

    return {
      notificationId,
      userId,
      type,
      deliveryResults,
      channelsAttempted: enabledChannels.length,
      channelsSucceeded: Object.values(deliveryResults).filter((r) => r.success)
        .length,
    };
  }
);

// ============================================================================
// Daily Digest Function
// ============================================================================

/**
 * Send daily digest email to users
 * Runs daily at 8am
 */
export const digestEmail = inngest.createFunction(
  {
    id: "pull/notifications/digest-email",
    name: "Daily Digest Email",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 5,
    },
  },
  { cron: CRON_SCHEDULES.DAILY_8AM },
  async ({ step, logger }) => {
    logger.info("Starting daily digest generation");

    // Step 1: Get users who want daily digest
    const users = await step.run("get-digest-users", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.users.getUsersWithDigestEnabled);
      return [] as Array<{
        userId: string;
        email: string;
        name: string;
        timezone: string;
      }>;
    });

    logger.info("Generating digests", { userCount: users.length });

    let sent = 0;
    let failed = 0;

    // Step 2: Process each user
    for (const user of users) {
      const result = await step.run(`digest-${user.userId}`, async () => {
        try {
          // Get portfolio summary
          const portfolio = await getPortfolioSummary(user.userId);

          // Get market highlights
          const marketHighlights = await getMarketHighlights();

          // Get pending actions
          const pendingActions = await getPendingActions(user.userId);

          // Get rewards summary
          const rewards = await getRewardsSummary(user.userId);

          // Generate digest content
          const digestContent = generateDigestContent({
            name: user.name,
            portfolio,
            marketHighlights,
            pendingActions,
            rewards,
          });

          // Send via Resend
          // In production:
          // await resend.emails.send({
          //   from: "PULL <digest@pull.com>",
          //   to: user.email,
          //   subject: `Your Daily PULL Digest - ${new Date().toLocaleDateString()}`,
          //   html: digestContent.html,
          //   text: digestContent.text,
          // });

          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        logger.error("Failed to send digest", {
          userId: user.userId,
          error: result.error,
        });
      }
    }

    return {
      totalUsers: users.length,
      sent,
      failed,
      completedAt: Date.now(),
    };
  }
);

// ============================================================================
// Weekly Summary Function
// ============================================================================

/**
 * Send weekly performance summary
 * Runs every Sunday at midnight
 */
export const weeklySummary = inngest.createFunction(
  {
    id: "pull/notifications/weekly-summary",
    name: "Weekly Summary",
    retries: DEFAULT_RETRY_CONFIG.attempts,
  },
  { cron: CRON_SCHEDULES.WEEKLY_SUNDAY_MIDNIGHT },
  async ({ step, logger }) => {
    logger.info("Starting weekly summary generation");

    const users = await step.run("get-active-users", async () => {
      // Get users who were active this week
      // return await convex.query(api.users.getActiveUsersThisWeek);
      return [] as Array<{
        userId: string;
        email: string;
        name: string;
      }>;
    });

    for (const user of users) {
      await step.run(`summary-${user.userId}`, async () => {
        // Generate weekly stats
        const weeklyStats = await generateWeeklyStats(user.userId);

        // Send notification
        await step.sendEvent(`weekly-notify-${user.userId}`, {
          name: "notification/send",
          data: {
            userId: user.userId,
            type: "order_filled", // Reusing type
            title: "Your Weekly PULL Summary",
            body: `You made ${weeklyStats.trades} trades and earned ${weeklyStats.points} points this week!`,
            data: weeklyStats,
            channels: ["email", "in_app"],
          },
        });
      });
    }

    return { processed: users.length };
  }
);

// ============================================================================
// Batch Notification Function
// ============================================================================

/**
 * Send batch notifications for events like market settlement
 */
export const batchNotification = inngest.createFunction(
  {
    id: "pull/notifications/batch-notification",
    name: "Batch Notification",
    retries: DEFAULT_RETRY_CONFIG.attempts,
  },
  { event: "trading/market.settled" },
  async ({ event, step, logger }) => {
    const { ticker, result, settledAt } = event.data;

    logger.info("Processing market settlement notifications", { ticker, result });

    // Step 1: Get all users with positions in this market
    const affectedUsers = await step.run("get-affected-users", async () => {
      // In production: query Convex
      // return await convex.query(api.trading.getUsersWithPosition, { ticker });
      return [] as Array<{
        userId: string;
        position: number;
        side: "yes" | "no";
        pnl: number;
      }>;
    });

    logger.info("Found affected users", { count: affectedUsers.length });

    // Step 2: Send notifications in batches
    const batchSize = 50;
    let sent = 0;

    for (let i = 0; i < affectedUsers.length; i += batchSize) {
      const batch = affectedUsers.slice(i, i + batchSize);

      await step.run(`batch-${i}`, async () => {
        for (const user of batch) {
          const won = (user.side === result);
          const title = won ? "You Won! 🎉" : "Market Settled";
          const body = won
            ? `${ticker} settled ${result.toUpperCase()}. You earned $${user.pnl.toFixed(2)}!`
            : `${ticker} settled ${result.toUpperCase()}. Better luck next time!`;

          await step.sendEvent(`notify-${user.userId}`, {
            name: "notification/send",
            data: {
              userId: user.userId,
              type: "market_settled",
              title,
              body,
              data: { ticker, result, pnl: user.pnl },
            },
          });
        }
      });

      sent += batch.length;
    }

    return {
      ticker,
      result,
      usersNotified: sent,
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // In production: use Firebase Cloud Messaging or similar
  // const messaging = getMessaging();
  // await messaging.sendEachForMulticast({
  //   tokens,
  //   notification: { title, body },
  //   data: data ? Object.fromEntries(
  //     Object.entries(data).map(([k, v]) => [k, String(v)])
  //   ) : undefined,
  // });
  return { success: true };
}

async function sendEmailNotification(
  email: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // In production: use Resend
  // await resend.emails.send({
  //   from: "PULL <notifications@pull.com>",
  //   to: email,
  //   subject: title,
  //   text: body,
  // });
  return { success: true };
}

async function sendInAppNotification(
  userId: string,
  notificationId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // In production: store in Convex for real-time display
  // await convex.mutation(api.notifications.createInApp, {
  //   userId,
  //   notificationId,
  //   title,
  //   body,
  //   data,
  //   read: false,
  //   createdAt: Date.now(),
  // });
  return { success: true };
}

async function sendSmsNotification(
  phoneNumber: string,
  title: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  // In production: use Twilio
  // await twilio.messages.create({
  //   to: phoneNumber,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   body: `${title}: ${body}`,
  // });
  return { success: true };
}

async function getPortfolioSummary(userId: string) {
  // In production: fetch from Convex
  return {
    totalValue: 10000,
    dayChange: 150,
    dayChangePercent: 1.5,
    positions: 5,
    openOrders: 2,
  };
}

async function getMarketHighlights() {
  // In production: fetch from Convex
  return {
    topMovers: [] as Array<{ ticker: string; change: number }>,
    newMarkets: [] as Array<{ ticker: string; title: string }>,
    settledToday: [] as Array<{ ticker: string; result: string }>,
  };
}

async function getPendingActions(userId: string) {
  // In production: fetch from Convex
  return {
    pendingOrders: 0,
    expiringSoon: 0,
    kycReminder: false,
  };
}

async function getRewardsSummary(userId: string) {
  // In production: fetch from Convex
  return {
    currentPoints: 1000,
    earnedToday: 50,
    streak: 7,
    tier: "silver",
  };
}

function generateDigestContent(data: {
  name: string;
  portfolio: Awaited<ReturnType<typeof getPortfolioSummary>>;
  marketHighlights: Awaited<ReturnType<typeof getMarketHighlights>>;
  pendingActions: Awaited<ReturnType<typeof getPendingActions>>;
  rewards: Awaited<ReturnType<typeof getRewardsSummary>>;
}) {
  const text = `
Hi ${data.name},

Here's your daily PULL digest:

PORTFOLIO
Total Value: $${data.portfolio.totalValue.toLocaleString()}
Day Change: ${data.portfolio.dayChange >= 0 ? "+" : ""}$${data.portfolio.dayChange.toLocaleString()} (${data.portfolio.dayChangePercent}%)

REWARDS
Points: ${data.rewards.currentPoints.toLocaleString()}
Streak: ${data.rewards.streak} days 🔥
Tier: ${data.rewards.tier}

Happy trading!
The PULL Team
  `;

  const html = `
<!DOCTYPE html>
<html>
<head></head>
<body>
  <h1>Hi ${data.name},</h1>
  <p>Here's your daily PULL digest:</p>

  <h2>Portfolio</h2>
  <p>Total Value: <strong>$${data.portfolio.totalValue.toLocaleString()}</strong></p>
  <p>Day Change: <span style="color: ${data.portfolio.dayChange >= 0 ? "green" : "red"}">
    ${data.portfolio.dayChange >= 0 ? "+" : ""}$${data.portfolio.dayChange.toLocaleString()}
  </span></p>

  <h2>Rewards</h2>
  <p>Points: ${data.rewards.currentPoints.toLocaleString()}</p>
  <p>Streak: ${data.rewards.streak} days 🔥</p>

  <p>Happy trading!</p>
  <p>The PULL Team</p>
</body>
</html>
  `;

  return { text, html };
}

async function generateWeeklyStats(userId: string) {
  // In production: calculate from Convex
  return {
    trades: 15,
    volume: 5000,
    pnl: 250,
    points: 500,
    streak: 7,
    ranking: 150,
  };
}

// ============================================================================
// Export Functions
// ============================================================================

export const notificationFunctions = [
  sendNotification,
  digestEmail,
  weeklySummary,
  batchNotification,
];
