/**
 * Push Notification Client
 * Supports Firebase FCM and OneSignal
 */

import * as crypto from "crypto";
import type {
  NotificationClientConfig,
  Logger,
  FirebaseConfig,
  OneSignalConfig,
  Notification,
  NotificationOptions,
  NotificationTarget,
  UserDevice,
  Platform,
  SendRequest,
  SendResult,
  NotificationFailure,
  BatchSendRequest,
  BatchSendResult,
  Topic,
  TopicSubscription,
  NotificationTemplate,
  TemplateData,
  ScheduledNotification,
  ScheduleStatus,
  NotificationAnalytics,
  TradeNotification,
  TradeNotificationType,
  MarketNotification,
  MarketNotificationType,
  RewardNotification,
  RewardNotificationType,
  SocialNotification,
  SocialNotificationType,
  NotificationPreferences,
} from "./types";
import { NotificationError } from "./types";

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: NotificationOptions = {
  priority: "high",
  ttl: 86400, // 24 hours
};

// ============================================================================
// Notification Client
// ============================================================================

export class NotificationClient {
  private readonly provider: string;
  private readonly firebaseConfig?: FirebaseConfig;
  private readonly oneSignalConfig?: OneSignalConfig;
  private readonly defaultOptions: NotificationOptions;
  private readonly logger: Logger;

  // In-memory stores (in production, use database)
  private readonly devices: Map<string, UserDevice[]> = new Map();
  private readonly topics: Map<string, Topic> = new Map();
  private readonly subscriptions: Map<string, TopicSubscription[]> = new Map();
  private readonly templates: Map<string, NotificationTemplate> = new Map();
  private readonly scheduled: Map<string, ScheduledNotification> = new Map();
  private readonly preferences: Map<string, NotificationPreferences> = new Map();

  // Firebase access token cache
  private firebaseToken: { token: string; expiresAt: Date } | null = null;

  constructor(config: NotificationClientConfig) {
    this.provider = config.provider;
    this.firebaseConfig = config.firebase;
    this.oneSignalConfig = config.oneSignal;
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...config.defaultOptions };
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Notifications] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Notifications] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Notifications] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Notifications] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Device Management
  // ==========================================================================

  /**
   * Register a device token
   */
  async registerDevice(device: Omit<UserDevice, "createdAt" | "lastActiveAt">): Promise<UserDevice> {
    const newDevice: UserDevice = {
      ...device,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    const userDevices = this.devices.get(device.userId) ?? [];

    // Update existing or add new
    const existingIndex = userDevices.findIndex((d) => d.deviceId === device.deviceId);
    if (existingIndex >= 0) {
      userDevices[existingIndex] = newDevice;
    } else {
      userDevices.push(newDevice);
    }

    this.devices.set(device.userId, userDevices);

    this.logger.info("Device registered", {
      userId: device.userId,
      deviceId: device.deviceId,
      platform: device.platform,
    });

    return newDevice;
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    const userDevices = this.devices.get(userId) ?? [];
    const filtered = userDevices.filter((d) => d.deviceId !== deviceId);
    this.devices.set(userId, filtered);

    this.logger.info("Device unregistered", { userId, deviceId });
  }

  /**
   * Get user's devices
   */
  async getUserDevices(userId: string): Promise<UserDevice[]> {
    return this.devices.get(userId) ?? [];
  }

  /**
   * Update device last active time
   */
  async updateDeviceActivity(userId: string, deviceId: string): Promise<void> {
    const userDevices = this.devices.get(userId) ?? [];
    const device = userDevices.find((d) => d.deviceId === deviceId);
    if (device) {
      device.lastActiveAt = new Date();
    }
  }

  // ==========================================================================
  // Send Notifications
  // ==========================================================================

  /**
   * Send a notification
   */
  async send(request: SendRequest): Promise<SendResult> {
    const { notification, target, options } = request;
    const mergedOptions = { ...this.defaultOptions, ...options };

    this.logger.debug("Sending notification", {
      targetType: target.type,
      title: notification.title,
    });

    // Handle scheduled notifications
    if (request.scheduledAt && request.scheduledAt > new Date()) {
      return this.scheduleNotification(request);
    }

    // Get tokens based on target type
    const tokens = await this.resolveTargetTokens(target);

    if (tokens.length === 0) {
      return {
        success: false,
        failures: [{ error: "No valid tokens found" }],
      };
    }

    // Send via configured provider
    if (this.provider === "firebase" || this.provider === "both") {
      return this.sendViaFirebase(notification, tokens, mergedOptions);
    }

    if (this.provider === "onesignal" || this.provider === "both") {
      return this.sendViaOneSignal(notification, tokens, mergedOptions);
    }

    throw new NotificationError("No notification provider configured", "NO_PROVIDER");
  }

  /**
   * Send to multiple targets
   */
  async sendBatch(request: BatchSendRequest): Promise<BatchSendResult> {
    const results: SendResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const item of request.notifications) {
      const result = await this.send({
        notification: item.notification,
        target: item.target,
        options: item.options,
      });

      results.push(result);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      total: request.notifications.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Resolve target to device tokens
   */
  private async resolveTargetTokens(target: NotificationTarget): Promise<string[]> {
    switch (target.type) {
      case "token":
        return [target.value as string];

      case "tokens":
        return target.value as string[];

      case "user_id": {
        const devices = await this.getUserDevices(target.value as string);
        return devices.filter((d) => d.enabled).map((d) => d.token);
      }

      case "user_ids": {
        const userIds = target.value as string[];
        const tokens: string[] = [];
        for (const userId of userIds) {
          const devices = await this.getUserDevices(userId);
          tokens.push(...devices.filter((d) => d.enabled).map((d) => d.token));
        }
        return tokens;
      }

      case "topic": {
        // Topic-based sending is handled differently by FCM/OneSignal
        // Return empty - the providers handle topic targeting
        return [];
      }

      default:
        return [];
    }
  }

  // ==========================================================================
  // Firebase FCM
  // ==========================================================================

  /**
   * Send via Firebase Cloud Messaging
   */
  private async sendViaFirebase(
    notification: Notification,
    tokens: string[],
    options: NotificationOptions
  ): Promise<SendResult> {
    if (!this.firebaseConfig) {
      throw new NotificationError("Firebase not configured", "FIREBASE_NOT_CONFIGURED");
    }

    const accessToken = await this.getFirebaseAccessToken();

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.imageUrl,
      },
      data: notification.data,
      android: {
        priority: options.priority === "high" ? "high" : "normal",
        notification: {
          icon: notification.icon,
          sound: notification.sound ?? "default",
          channelId: options.channelId,
          clickAction: notification.clickAction,
        },
        ttl: `${options.ttl}s`,
      },
      apns: {
        headers: {
          "apns-priority": options.priority === "high" ? "10" : "5",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + (options.ttl ?? 86400)),
        },
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: options.badge,
            sound: notification.sound ?? "default",
            category: options.category,
            "mutable-content": options.mutableContent ? 1 : 0,
            "content-available": options.contentAvailable ? 1 : 0,
          },
        },
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon,
          badge: notification.badge,
          image: notification.imageUrl,
        },
        fcmOptions: {
          link: notification.clickAction,
        },
      },
    };

    const failures: NotificationFailure[] = [];
    let successCount = 0;

    // Send to each token (in production, use batch API)
    for (const token of tokens) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${this.firebaseConfig.projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                ...message,
                token,
              },
              validateOnly: options.dryRun,
            }),
          }
        );

        if (response.ok) {
          successCount++;
        } else {
          const error = await response.json();
          failures.push({
            token,
            error: error.error?.message ?? "Unknown error",
            errorCode: error.error?.code,
          });
        }
      } catch (error) {
        failures.push({
          token,
          error: (error as Error).message,
        });
      }
    }

    this.logger.info("Firebase notification sent", {
      success: successCount,
      failures: failures.length,
    });

    return {
      success: successCount > 0,
      recipients: successCount,
      failures: failures.length > 0 ? failures : undefined,
    };
  }

  /**
   * Get Firebase access token
   */
  private async getFirebaseAccessToken(): Promise<string> {
    if (this.firebaseToken && this.firebaseToken.expiresAt > new Date()) {
      return this.firebaseToken.token;
    }

    if (!this.firebaseConfig) {
      throw new NotificationError("Firebase not configured", "FIREBASE_NOT_CONFIGURED");
    }

    // In production, use google-auth-library to generate JWT
    // This is a simplified implementation
    const now = Math.floor(Date.now() / 1000);
    const jwt = this.createFirebaseJWT(now);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new NotificationError("Failed to get Firebase token", "FIREBASE_AUTH_ERROR");
    }

    const data = await response.json();
    this.firebaseToken = {
      token: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in - 300) * 1000),
    };

    return this.firebaseToken.token;
  }

  /**
   * Create Firebase JWT
   */
  private createFirebaseJWT(now: number): string {
    if (!this.firebaseConfig) {
      throw new NotificationError("Firebase not configured", "FIREBASE_NOT_CONFIGURED");
    }

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: this.firebaseConfig.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signatureInput = `${base64Header}.${base64Payload}`;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(this.firebaseConfig.privateKey, "base64url");

    return `${signatureInput}.${signature}`;
  }

  // ==========================================================================
  // OneSignal
  // ==========================================================================

  /**
   * Send via OneSignal
   */
  private async sendViaOneSignal(
    notification: Notification,
    tokens: string[],
    options: NotificationOptions
  ): Promise<SendResult> {
    if (!this.oneSignalConfig) {
      throw new NotificationError("OneSignal not configured", "ONESIGNAL_NOT_CONFIGURED");
    }

    const baseUrl = this.oneSignalConfig.baseUrl ?? "https://onesignal.com/api/v1";

    const payload: Record<string, unknown> = {
      app_id: this.oneSignalConfig.appId,
      headings: { en: notification.title },
      contents: { en: notification.body },
      data: notification.data,
      include_player_ids: tokens,
      priority: options.priority === "high" ? 10 : 5,
      ttl: options.ttl,
    };

    if (notification.imageUrl) {
      payload.big_picture = notification.imageUrl;
      payload.ios_attachments = { image: notification.imageUrl };
    }

    if (notification.clickAction) {
      payload.url = notification.clickAction;
    }

    if (options.badge !== undefined) {
      payload.ios_badgeType = "SetTo";
      payload.ios_badgeCount = options.badge;
    }

    try {
      const response = await fetch(`${baseUrl}/notifications`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.oneSignalConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          failures: [{ error: data.errors?.[0] ?? "Unknown error" }],
        };
      }

      this.logger.info("OneSignal notification sent", {
        messageId: data.id,
        recipients: data.recipients,
      });

      return {
        success: true,
        messageId: data.id,
        recipients: data.recipients,
      };
    } catch (error) {
      return {
        success: false,
        failures: [{ error: (error as Error).message }],
      };
    }
  }

  // ==========================================================================
  // Topic Management
  // ==========================================================================

  /**
   * Create a topic
   */
  async createTopic(name: string, description?: string): Promise<Topic> {
    const topic: Topic = {
      topicId: crypto.randomUUID(),
      name,
      description,
      subscriberCount: 0,
      createdAt: new Date(),
    };

    this.topics.set(topic.topicId, topic);
    return topic;
  }

  /**
   * Subscribe user to topic
   */
  async subscribeToTopic(userId: string, topicId: string): Promise<TopicSubscription> {
    const subscription: TopicSubscription = {
      userId,
      topicId,
      subscribedAt: new Date(),
    };

    const userSubs = this.subscriptions.get(userId) ?? [];
    userSubs.push(subscription);
    this.subscriptions.set(userId, userSubs);

    // Update topic subscriber count
    const topic = this.topics.get(topicId);
    if (topic) {
      topic.subscriberCount++;
    }

    return subscription;
  }

  /**
   * Unsubscribe user from topic
   */
  async unsubscribeFromTopic(userId: string, topicId: string): Promise<void> {
    const userSubs = this.subscriptions.get(userId) ?? [];
    const filtered = userSubs.filter((s) => s.topicId !== topicId);
    this.subscriptions.set(userId, filtered);

    const topic = this.topics.get(topicId);
    if (topic) {
      topic.subscriberCount = Math.max(0, topic.subscriberCount - 1);
    }
  }

  /**
   * Send to topic
   */
  async sendToTopic(topicId: string, notification: Notification, options?: NotificationOptions): Promise<SendResult> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      return { success: false, failures: [{ error: "Topic not found" }] };
    }

    // Get all subscribers
    const allSubs = Array.from(this.subscriptions.values()).flat();
    const topicSubs = allSubs.filter((s) => s.topicId === topicId);
    const userIds = topicSubs.map((s) => s.userId);

    return this.send({
      notification,
      target: { type: "user_ids", value: userIds },
      options,
    });
  }

  // ==========================================================================
  // Templates
  // ==========================================================================

  /**
   * Create notification template
   */
  async createTemplate(
    template: Omit<NotificationTemplate, "templateId" | "createdAt" | "updatedAt">
  ): Promise<NotificationTemplate> {
    const newTemplate: NotificationTemplate = {
      ...template,
      templateId: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(newTemplate.templateId, newTemplate);
    return newTemplate;
  }

  /**
   * Send from template
   */
  async sendFromTemplate(
    templateId: string,
    target: NotificationTarget,
    data: TemplateData,
    options?: NotificationOptions
  ): Promise<SendResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      return { success: false, failures: [{ error: "Template not found" }] };
    }

    // Replace variables in template
    let title = template.title;
    let body = template.body;

    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      title = title.replace(new RegExp(placeholder, "g"), String(value));
      body = body.replace(new RegExp(placeholder, "g"), String(value));
    }

    return this.send({
      notification: {
        title,
        body,
        imageUrl: template.imageUrl,
      },
      target,
      options: { ...template.defaultOptions, ...options },
    });
  }

  // ==========================================================================
  // Scheduled Notifications
  // ==========================================================================

  /**
   * Schedule a notification
   */
  private async scheduleNotification(request: SendRequest): Promise<SendResult> {
    const scheduled: ScheduledNotification = {
      scheduleId: crypto.randomUUID(),
      notification: request.notification,
      target: request.target,
      options: request.options,
      scheduledAt: request.scheduledAt!,
      status: "pending",
    };

    this.scheduled.set(scheduled.scheduleId, scheduled);

    this.logger.info("Notification scheduled", {
      scheduleId: scheduled.scheduleId,
      scheduledAt: scheduled.scheduledAt,
    });

    return {
      success: true,
      messageId: scheduled.scheduleId,
      scheduledFor: scheduled.scheduledAt,
    };
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduled(scheduleId: string): Promise<boolean> {
    const scheduled = this.scheduled.get(scheduleId);
    if (!scheduled || scheduled.status !== "pending") {
      return false;
    }

    scheduled.status = "cancelled";
    return true;
  }

  /**
   * Process scheduled notifications (would be called by a cron job)
   */
  async processScheduledNotifications(): Promise<number> {
    const now = new Date();
    let processed = 0;

    for (const [id, notification] of this.scheduled) {
      if (notification.status === "pending" && notification.scheduledAt <= now) {
        const result = await this.send({
          notification: notification.notification,
          target: notification.target,
          options: notification.options,
        });

        notification.status = result.success ? "sent" : "failed";
        notification.sentAt = new Date();
        notification.result = result;
        processed++;
      }
    }

    return processed;
  }

  // ==========================================================================
  // Domain-Specific Notifications
  // ==========================================================================

  /**
   * Send trade notification
   */
  async sendTradeNotification(notif: TradeNotification): Promise<SendResult> {
    const messages: Record<TradeNotificationType, { title: string; body: string }> = {
      order_filled: {
        title: "Order Filled",
        body: `Your order for ${notif.marketTitle} has been filled at $${notif.price}`,
      },
      order_cancelled: {
        title: "Order Cancelled",
        body: `Your order for ${notif.marketTitle} has been cancelled`,
      },
      position_opened: {
        title: "Position Opened",
        body: `New position opened in ${notif.marketTitle}`,
      },
      position_closed: {
        title: "Position Closed",
        body: `Your position in ${notif.marketTitle} has been closed`,
      },
      price_alert: {
        title: "Price Alert",
        body: `${notif.marketTitle} has reached your target price of $${notif.price}`,
      },
      market_resolved: {
        title: "Market Resolved",
        body: `${notif.marketTitle} has been resolved`,
      },
      winning_trade: {
        title: "Winning Trade! 🎉",
        body: `Congratulations! You won $${notif.amount} on ${notif.marketTitle}`,
      },
      losing_trade: {
        title: "Trade Closed",
        body: `Your position in ${notif.marketTitle} closed with a loss of $${notif.amount}`,
      },
    };

    const message = messages[notif.type];
    return this.send({
      notification: {
        title: message.title,
        body: message.body,
        data: {
          type: "trade",
          tradeId: notif.tradeId ?? "",
          marketId: notif.marketId ?? "",
        },
      },
      target: { type: "user_id", value: notif.userId },
    });
  }

  /**
   * Send market notification
   */
  async sendMarketNotification(notif: MarketNotification): Promise<SendResult> {
    const messages: Record<MarketNotificationType, { title: string; body: string }> = {
      market_created: {
        title: "New Market",
        body: `Check out: ${notif.marketTitle}`,
      },
      market_trending: {
        title: "Trending Market 🔥",
        body: `${notif.marketTitle} is trending with ${notif.volume?.toLocaleString()} volume`,
      },
      market_closing_soon: {
        title: "Market Closing Soon",
        body: `${notif.marketTitle} closes in 24 hours`,
      },
      market_resolved: {
        title: "Market Resolved",
        body: `${notif.marketTitle} has been resolved`,
      },
      price_movement: {
        title: "Price Movement",
        body: `${notif.marketTitle} moved ${notif.priceChange! > 0 ? "+" : ""}${(notif.priceChange! * 100).toFixed(1)}%`,
      },
      volume_spike: {
        title: "Volume Spike",
        body: `${notif.marketTitle} is seeing unusual trading activity`,
      },
    };

    const message = messages[notif.type];
    return this.send({
      notification: {
        title: message.title,
        body: message.body,
        data: {
          type: "market",
          marketId: notif.marketId,
        },
      },
      target: { type: "user_id", value: notif.userId },
    });
  }

  /**
   * Send reward notification
   */
  async sendRewardNotification(notif: RewardNotification): Promise<SendResult> {
    const messages: Record<RewardNotificationType, { title: string; body: string }> = {
      points_earned: {
        title: "Points Earned! ⭐",
        body: `You earned ${notif.points} points`,
      },
      level_up: {
        title: "Level Up! 🎮",
        body: `Congratulations! You've reached a new level`,
      },
      reward_available: {
        title: "Reward Available 🎁",
        body: `${notif.rewardName} is now available to claim`,
      },
      streak_milestone: {
        title: "Streak Milestone! 🔥",
        body: `Amazing! ${notif.streakDays} day streak achieved`,
      },
      badge_earned: {
        title: "Badge Earned! 🏆",
        body: `You've earned a new badge: ${notif.rewardName}`,
      },
    };

    const message = messages[notif.type];
    return this.send({
      notification: {
        title: message.title,
        body: message.body,
        data: { type: "reward" },
      },
      target: { type: "user_id", value: notif.userId },
    });
  }

  // ==========================================================================
  // User Preferences
  // ==========================================================================

  /**
   * Get user notification preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return (
      this.preferences.get(userId) ?? {
        userId,
        enabled: true,
        channels: { push: true, email: true, sms: false, inApp: true },
        categories: {
          trading: true,
          markets: true,
          rewards: true,
          social: true,
          marketing: false,
          security: true,
        },
        updatedAt: new Date(),
      }
    );
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const updated = {
      ...current,
      ...updates,
      userId,
      updatedAt: new Date(),
    };
    this.preferences.set(userId, updated);
    return updated;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    return true;
  }
}

export default NotificationClient;
