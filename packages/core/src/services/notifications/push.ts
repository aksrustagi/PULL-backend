/**
 * Push Notification Service
 * Firebase Cloud Messaging (FCM) + Apple Push Notification Service (APNs)
 */

import { EventEmitter } from "events";

// ============================================================================
// Types
// ============================================================================

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  channelId?: string;
  priority?: "high" | "normal";
  ttl?: number; // Time to live in seconds
}

export interface DeviceToken {
  userId: string;
  token: string;
  platform: "ios" | "android" | "web";
  createdAt: number;
  lastUsed: number;
  isActive: boolean;
}

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  channels: {
    draftPicks: boolean;
    tradeProposals: boolean;
    tradeResponses: boolean;
    waiverResults: boolean;
    scoringUpdates: boolean;
    injuryAlerts: boolean;
    marketUpdates: boolean;
    chatMessages: boolean;
    leagueAnnouncements: boolean;
    weeklyRecap: boolean;
  };
  quietHours: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
    timezone: string;
  };
}

export type NotificationChannel = keyof NotificationPreferences["channels"];

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  failedTokens?: string[];
}

export interface BatchNotificationResult {
  successCount: number;
  failureCount: number;
  results: NotificationResult[];
}

// ============================================================================
// Firebase Admin SDK Interface
// ============================================================================

interface FirebaseMessage {
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data?: Record<string, string>;
  token?: string;
  tokens?: string[];
  topic?: string;
  condition?: string;
  android?: {
    priority: "high" | "normal";
    ttl: number;
    notification?: {
      channelId?: string;
      sound?: string;
      clickAction?: string;
    };
  };
  apns?: {
    headers?: Record<string, string>;
    payload?: {
      aps: {
        alert?: { title: string; body: string };
        badge?: number;
        sound?: string;
        "mutable-content"?: number;
        "content-available"?: number;
        category?: string;
        "thread-id"?: string;
      };
    };
  };
  webpush?: {
    headers?: Record<string, string>;
    notification?: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
    };
    fcmOptions?: {
      link?: string;
    };
  };
}

// ============================================================================
// Push Notification Service
// ============================================================================

export class PushNotificationService extends EventEmitter {
  private firebaseApp: any;
  private messaging: any;
  private deviceTokenStore: Map<string, DeviceToken[]> = new Map();
  private preferencesStore: Map<string, NotificationPreferences> = new Map();
  private initialized = false;

  constructor(private config: {
    firebaseProjectId: string;
    firebasePrivateKey: string;
    firebaseClientEmail: string;
    apnsKeyId?: string;
    apnsTeamId?: string;
    apnsKeyPath?: string;
    databaseAdapter?: DatabaseAdapter;
  }) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of firebase-admin
      const admin = await import("firebase-admin");

      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: this.config.firebaseProjectId,
            privateKey: this.config.firebasePrivateKey.replace(/\\n/g, "\n"),
            clientEmail: this.config.firebaseClientEmail,
          }),
        });
      } else {
        this.firebaseApp = admin.apps[0];
      }

      this.messaging = admin.messaging();
      this.initialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw new Error(`Failed to initialize push notifications: ${error}`);
    }
  }

  // ============================================================================
  // Device Token Management
  // ============================================================================

  async registerDevice(userId: string, token: string, platform: "ios" | "android" | "web"): Promise<void> {
    const device: DeviceToken = {
      userId,
      token,
      platform,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      isActive: true,
    };

    const userTokens = this.deviceTokenStore.get(userId) || [];

    // Remove existing token if re-registering
    const filtered = userTokens.filter((t) => t.token !== token);
    filtered.push(device);

    this.deviceTokenStore.set(userId, filtered);

    if (this.config.databaseAdapter) {
      await this.config.databaseAdapter.saveDeviceToken(device);
    }

    this.emit("deviceRegistered", { userId, platform });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    const userTokens = this.deviceTokenStore.get(userId) || [];
    const filtered = userTokens.filter((t) => t.token !== token);
    this.deviceTokenStore.set(userId, filtered);

    if (this.config.databaseAdapter) {
      await this.config.databaseAdapter.removeDeviceToken(userId, token);
    }
  }

  async getActiveTokens(userId: string): Promise<DeviceToken[]> {
    if (this.config.databaseAdapter) {
      return this.config.databaseAdapter.getDeviceTokens(userId);
    }
    return (this.deviceTokenStore.get(userId) || []).filter((t) => t.isActive);
  }

  // ============================================================================
  // Notification Preferences
  // ============================================================================

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    if (this.config.databaseAdapter) {
      const prefs = await this.config.databaseAdapter.getPreferences(userId);
      if (prefs) return prefs;
    }

    const cached = this.preferencesStore.get(userId);
    if (cached) return cached;

    // Return defaults
    return {
      userId,
      enabled: true,
      channels: {
        draftPicks: true,
        tradeProposals: true,
        tradeResponses: true,
        waiverResults: true,
        scoringUpdates: true,
        injuryAlerts: true,
        marketUpdates: true,
        chatMessages: true,
        leagueAnnouncements: true,
        weeklyRecap: true,
      },
      quietHours: {
        enabled: false,
        startHour: 22,
        endHour: 8,
        timezone: "America/New_York",
      },
    };
  }

  async updatePreferences(userId: string, updates: Partial<NotificationPreferences>): Promise<void> {
    const current = await this.getPreferences(userId);
    const merged = { ...current, ...updates, userId };
    this.preferencesStore.set(userId, merged);

    if (this.config.databaseAdapter) {
      await this.config.databaseAdapter.savePreferences(merged);
    }
  }

  // ============================================================================
  // Send Notifications
  // ============================================================================

  async sendToUser(
    userId: string,
    channel: NotificationChannel,
    payload: PushNotificationPayload
  ): Promise<NotificationResult> {
    // Check preferences
    const prefs = await this.getPreferences(userId);
    if (!prefs.enabled || !prefs.channels[channel]) {
      return { success: false, error: "Notification channel disabled by user" };
    }

    // Check quiet hours
    if (this.isQuietHours(prefs)) {
      return { success: false, error: "Quiet hours active" };
    }

    const tokens = await this.getActiveTokens(userId);
    if (tokens.length === 0) {
      return { success: false, error: "No active device tokens" };
    }

    const tokenStrings = tokens.map((t) => t.token);
    return this.sendToTokens(tokenStrings, payload);
  }

  async sendToMultipleUsers(
    userIds: string[],
    channel: NotificationChannel,
    payload: PushNotificationPayload
  ): Promise<BatchNotificationResult> {
    const results: NotificationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process in batches of 500 (FCM limit)
    const batchSize = 500;
    const allTokens: string[] = [];

    for (const userId of userIds) {
      const prefs = await this.getPreferences(userId);
      if (!prefs.enabled || !prefs.channels[channel] || this.isQuietHours(prefs)) {
        continue;
      }

      const tokens = await this.getActiveTokens(userId);
      allTokens.push(...tokens.map((t) => t.token));
    }

    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      const result = await this.sendToTokens(batch, payload);
      results.push(result);

      if (result.success) {
        successCount += batch.length - (result.failedTokens?.length || 0);
        failureCount += result.failedTokens?.length || 0;
      } else {
        failureCount += batch.length;
      }
    }

    return { successCount, failureCount, results };
  }

  async sendToTopic(topic: string, payload: PushNotificationPayload): Promise<NotificationResult> {
    if (!this.initialized) await this.initialize();

    const message: FirebaseMessage = this.buildMessage(payload);
    message.topic = topic;

    try {
      const messageId = await this.messaging.send(message);
      return { success: true, messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // Topic Management
  // ============================================================================

  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    await this.messaging.subscribeToTopic(tokens, topic);
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    await this.messaging.unsubscribeFromTopic(tokens, topic);
  }

  // League-specific topics
  getLeagueTopic(leagueId: string): string {
    return `league_${leagueId}`;
  }

  getMatchupTopic(matchupId: string): string {
    return `matchup_${matchupId}`;
  }

  getDraftTopic(draftId: string): string {
    return `draft_${draftId}`;
  }

  getMarketTopic(marketId: string): string {
    return `market_${marketId}`;
  }

  // ============================================================================
  // Fantasy-Specific Notifications
  // ============================================================================

  async notifyDraftPick(params: {
    leagueId: string;
    draftId: string;
    userId: string;
    pickNumber: number;
    playerName: string;
    teamName: string;
    isNextPick: boolean;
    nextUserId?: string;
  }): Promise<void> {
    // Notify the league about the pick
    await this.sendToTopic(this.getDraftTopic(params.draftId), {
      title: "Draft Pick Made",
      body: `${params.teamName} selected ${params.playerName} (#${params.pickNumber})`,
      data: {
        type: "draft_pick",
        draftId: params.draftId,
        leagueId: params.leagueId,
        pickNumber: params.pickNumber.toString(),
      },
      priority: "high",
      channelId: "draft",
    });

    // Notify next picker
    if (params.isNextPick && params.nextUserId) {
      await this.sendToUser(params.nextUserId, "draftPicks", {
        title: "Your Turn to Draft!",
        body: `It's your pick in ${params.teamName}'s league draft`,
        data: {
          type: "draft_your_turn",
          draftId: params.draftId,
          leagueId: params.leagueId,
        },
        priority: "high",
        sound: "draft_pick.wav",
        channelId: "draft_urgent",
      });
    }
  }

  async notifyTradeProposal(params: {
    leagueId: string;
    tradeId: string;
    proposerTeamName: string;
    targetUserId: string;
    offeringPlayers: string[];
    requestingPlayers: string[];
  }): Promise<void> {
    const offering = params.offeringPlayers.join(", ");
    const requesting = params.requestingPlayers.join(", ");

    await this.sendToUser(params.targetUserId, "tradeProposals", {
      title: "New Trade Proposal",
      body: `${params.proposerTeamName} offers ${offering} for ${requesting}`,
      data: {
        type: "trade_proposal",
        tradeId: params.tradeId,
        leagueId: params.leagueId,
      },
      priority: "high",
      channelId: "trades",
    });
  }

  async notifyTradeResponse(params: {
    leagueId: string;
    tradeId: string;
    responderId: string;
    proposerUserId: string;
    response: "accepted" | "rejected" | "countered";
    responderTeamName: string;
  }): Promise<void> {
    const responseText = {
      accepted: "accepted your trade!",
      rejected: "declined your trade",
      countered: "sent a counter-offer",
    }[params.response];

    await this.sendToUser(params.proposerUserId, "tradeResponses", {
      title: "Trade Update",
      body: `${params.responderTeamName} ${responseText}`,
      data: {
        type: "trade_response",
        tradeId: params.tradeId,
        leagueId: params.leagueId,
        response: params.response,
      },
      channelId: "trades",
    });
  }

  async notifyWaiverResult(params: {
    userId: string;
    leagueId: string;
    success: boolean;
    playerName: string;
    droppedPlayerName?: string;
    faabSpent?: number;
  }): Promise<void> {
    const body = params.success
      ? `You claimed ${params.playerName}${params.droppedPlayerName ? ` (dropped ${params.droppedPlayerName})` : ""}${params.faabSpent ? ` for $${params.faabSpent}` : ""}`
      : `Your claim for ${params.playerName} was unsuccessful`;

    await this.sendToUser(params.userId, "waiverResults", {
      title: params.success ? "Waiver Claim Successful" : "Waiver Claim Failed",
      body,
      data: {
        type: "waiver_result",
        leagueId: params.leagueId,
        success: params.success.toString(),
        playerName: params.playerName,
      },
      channelId: "waivers",
    });
  }

  async notifyScoringUpdate(params: {
    userId: string;
    leagueId: string;
    matchupId: string;
    teamScore: number;
    opponentScore: number;
    playerHighlight?: { name: string; points: number };
  }): Promise<void> {
    let body = `Your team: ${params.teamScore.toFixed(1)} | Opponent: ${params.opponentScore.toFixed(1)}`;
    if (params.playerHighlight) {
      body += ` | ${params.playerHighlight.name}: ${params.playerHighlight.points.toFixed(1)} pts`;
    }

    await this.sendToUser(params.userId, "scoringUpdates", {
      title: "Score Update",
      body,
      data: {
        type: "scoring_update",
        leagueId: params.leagueId,
        matchupId: params.matchupId,
      },
      channelId: "scoring",
    });
  }

  async notifyInjuryAlert(params: {
    userIds: string[];
    playerName: string;
    team: string;
    status: string;
    description: string;
  }): Promise<void> {
    await this.sendToMultipleUsers(params.userIds, "injuryAlerts", {
      title: `Injury Alert: ${params.playerName}`,
      body: `${params.playerName} (${params.team}) - ${params.status}: ${params.description}`,
      data: {
        type: "injury_alert",
        playerName: params.playerName,
        team: params.team,
        status: params.status,
      },
      priority: "high",
      channelId: "injuries",
    });
  }

  async notifyMarketUpdate(params: {
    userId: string;
    marketId: string;
    marketTitle: string;
    eventType: "settled" | "price_change" | "closing_soon";
    details: string;
  }): Promise<void> {
    const titles = {
      settled: "Market Settled",
      price_change: "Price Alert",
      closing_soon: "Market Closing Soon",
    };

    await this.sendToUser(params.userId, "marketUpdates", {
      title: titles[params.eventType],
      body: `${params.marketTitle}: ${params.details}`,
      data: {
        type: "market_update",
        marketId: params.marketId,
        eventType: params.eventType,
      },
      channelId: "markets",
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<NotificationResult> {
    if (!this.initialized) await this.initialize();

    if (tokens.length === 0) {
      return { success: false, error: "No tokens provided" };
    }

    const message: FirebaseMessage = this.buildMessage(payload);

    try {
      if (tokens.length === 1) {
        message.token = tokens[0];
        const messageId = await this.messaging.send(message);
        return { success: true, messageId };
      }

      // Multi-cast
      const response = await this.messaging.sendEachForMulticast({
        ...message,
        tokens,
      });

      const failedTokens: string[] = [];
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });

      // Deactivate failed tokens
      if (failedTokens.length > 0) {
        this.emit("tokensInvalidated", failedTokens);
      }

      return {
        success: response.successCount > 0,
        failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private buildMessage(payload: PushNotificationPayload): FirebaseMessage {
    return {
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: payload.data,
      android: {
        priority: payload.priority || "high",
        ttl: (payload.ttl || 3600) * 1000,
        notification: {
          channelId: payload.channelId || "default",
          sound: payload.sound || "default",
        },
      },
      apns: {
        headers: {
          "apns-priority": payload.priority === "high" ? "10" : "5",
          "apns-expiration": Math.floor(Date.now() / 1000 + (payload.ttl || 3600)).toString(),
        },
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            badge: payload.badge,
            sound: payload.sound || "default",
            "mutable-content": payload.imageUrl ? 1 : 0,
            "content-available": 1,
          },
        },
      },
    };
  }

  private isQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHours.enabled) return false;

    const now = new Date();
    // Simple hour check (production would use proper timezone handling)
    const currentHour = now.getHours();
    const { startHour, endHour } = prefs.quietHours;

    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Wraps midnight (e.g., 22:00 - 08:00)
      return currentHour >= startHour || currentHour < endHour;
    }
  }
}

// ============================================================================
// Database Adapter Interface
// ============================================================================

export interface DatabaseAdapter {
  saveDeviceToken(token: DeviceToken): Promise<void>;
  removeDeviceToken(userId: string, token: string): Promise<void>;
  getDeviceTokens(userId: string): Promise<DeviceToken[]>;
  savePreferences(prefs: NotificationPreferences): Promise<void>;
  getPreferences(userId: string): Promise<NotificationPreferences | null>;
}

// ============================================================================
// Android Notification Channels Configuration
// ============================================================================

export const ANDROID_CHANNELS = [
  {
    id: "default",
    name: "General",
    description: "General notifications",
    importance: 3, // DEFAULT
    sound: "default",
  },
  {
    id: "draft",
    name: "Draft Updates",
    description: "Draft picks and updates",
    importance: 4, // HIGH
    sound: "default",
  },
  {
    id: "draft_urgent",
    name: "Your Draft Pick",
    description: "When it's your turn to draft",
    importance: 5, // MAX
    sound: "draft_pick",
    vibration: true,
  },
  {
    id: "trades",
    name: "Trade Activity",
    description: "Trade proposals and responses",
    importance: 4,
    sound: "default",
  },
  {
    id: "waivers",
    name: "Waiver Results",
    description: "Waiver claim results",
    importance: 3,
    sound: "default",
  },
  {
    id: "scoring",
    name: "Score Updates",
    description: "Live scoring updates during games",
    importance: 3,
    sound: "default",
  },
  {
    id: "injuries",
    name: "Injury Alerts",
    description: "Player injury notifications",
    importance: 4,
    sound: "default",
  },
  {
    id: "markets",
    name: "Market Updates",
    description: "Prediction market notifications",
    importance: 3,
    sound: "default",
  },
  {
    id: "chat",
    name: "Chat Messages",
    description: "League chat messages",
    importance: 2, // LOW
    sound: "default",
  },
];

// ============================================================================
// Export singleton factory
// ============================================================================

let instance: PushNotificationService | null = null;

export function getPushNotificationService(config?: {
  firebaseProjectId: string;
  firebasePrivateKey: string;
  firebaseClientEmail: string;
}): PushNotificationService {
  if (!instance && config) {
    instance = new PushNotificationService(config);
  }
  if (!instance) {
    throw new Error("PushNotificationService not initialized. Provide config on first call.");
  }
  return instance;
}
