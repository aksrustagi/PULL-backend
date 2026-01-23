/**
 * In-App Notification System
 * Notification inbox/feed with read state, categories, and actions
 */

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | "trade_proposed"
  | "trade_accepted"
  | "trade_rejected"
  | "trade_vetoed"
  | "waiver_claimed"
  | "waiver_failed"
  | "draft_pick"
  | "draft_starting"
  | "matchup_result"
  | "scoring_update"
  | "player_injury"
  | "player_news"
  | "market_resolved"
  | "market_expiring"
  | "bet_won"
  | "bet_lost"
  | "league_invite"
  | "league_message"
  | "commissioner_action"
  | "achievement_unlocked"
  | "weekly_recap"
  | "payment_received"
  | "payment_sent"
  | "system_announcement";

export type NotificationCategory = "trades" | "league" | "scoring" | "markets" | "social" | "system";

export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export interface NotificationAction {
  label: string;
  type: "navigate" | "api_call" | "dismiss";
  payload: Record<string, any>;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  imageUrl?: string;
  actions: NotificationAction[];
  metadata: Record<string, any>;
  read: boolean;
  dismissed: boolean;
  createdAt: Date;
  expiresAt?: Date;
  groupId?: string;
}

export interface NotificationPreferences {
  userId: string;
  categories: Record<NotificationCategory, {
    enabled: boolean;
    push: boolean;
    inApp: boolean;
    email: boolean;
  }>;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
    timezone: string;
  };
  digestMode: "realtime" | "hourly" | "daily";
}

export interface NotificationGroup {
  groupId: string;
  type: NotificationType;
  count: number;
  latestNotification: InAppNotification;
  preview: string;
}

// ============================================================================
// Notification Category Mapping
// ============================================================================

const TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory> = {
  trade_proposed: "trades",
  trade_accepted: "trades",
  trade_rejected: "trades",
  trade_vetoed: "trades",
  waiver_claimed: "league",
  waiver_failed: "league",
  draft_pick: "league",
  draft_starting: "league",
  matchup_result: "scoring",
  scoring_update: "scoring",
  player_injury: "scoring",
  player_news: "scoring",
  market_resolved: "markets",
  market_expiring: "markets",
  bet_won: "markets",
  bet_lost: "markets",
  league_invite: "social",
  league_message: "social",
  commissioner_action: "league",
  achievement_unlocked: "social",
  weekly_recap: "league",
  payment_received: "markets",
  payment_sent: "markets",
  system_announcement: "system",
};

const TYPE_TO_PRIORITY: Record<NotificationType, NotificationPriority> = {
  trade_proposed: "high",
  trade_accepted: "high",
  trade_rejected: "medium",
  trade_vetoed: "high",
  waiver_claimed: "medium",
  waiver_failed: "medium",
  draft_pick: "urgent",
  draft_starting: "urgent",
  matchup_result: "medium",
  scoring_update: "low",
  player_injury: "high",
  player_news: "low",
  market_resolved: "medium",
  market_expiring: "high",
  bet_won: "medium",
  bet_lost: "medium",
  league_invite: "high",
  league_message: "low",
  commissioner_action: "high",
  achievement_unlocked: "low",
  weekly_recap: "low",
  payment_received: "medium",
  payment_sent: "medium",
  system_announcement: "medium",
};

// ============================================================================
// Notification Builder
// ============================================================================

export class NotificationBuilder {
  private notification: Partial<InAppNotification> = {
    actions: [],
    metadata: {},
    read: false,
    dismissed: false,
  };

  constructor(type: NotificationType) {
    this.notification.type = type;
    this.notification.category = TYPE_TO_CATEGORY[type];
    this.notification.priority = TYPE_TO_PRIORITY[type];
    this.notification.id = generateId();
    this.notification.createdAt = new Date();
  }

  forUser(userId: string): this {
    this.notification.userId = userId;
    return this;
  }

  withTitle(title: string): this {
    this.notification.title = title;
    return this;
  }

  withBody(body: string): this {
    this.notification.body = body;
    return this;
  }

  withImage(url: string): this {
    this.notification.imageUrl = url;
    return this;
  }

  withAction(action: NotificationAction): this {
    this.notification.actions!.push(action);
    return this;
  }

  withNavigateAction(label: string, route: string, params?: Record<string, any>): this {
    return this.withAction({
      label,
      type: "navigate",
      payload: { route, ...params },
    });
  }

  withApiAction(label: string, method: string, path: string, body?: any): this {
    return this.withAction({
      label,
      type: "api_call",
      payload: { method, path, body },
    });
  }

  withMetadata(meta: Record<string, any>): this {
    this.notification.metadata = { ...this.notification.metadata, ...meta };
    return this;
  }

  withGroup(groupId: string): this {
    this.notification.groupId = groupId;
    return this;
  }

  expiresIn(ms: number): this {
    this.notification.expiresAt = new Date(Date.now() + ms);
    return this;
  }

  build(): InAppNotification {
    if (!this.notification.userId || !this.notification.title || !this.notification.body) {
      throw new Error("Notification must have userId, title, and body");
    }
    return this.notification as InAppNotification;
  }
}

// ============================================================================
// Notification Inbox Service
// ============================================================================

export class NotificationInboxService {
  private notifications: Map<string, InAppNotification[]> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private listeners: Map<string, Set<(notification: InAppNotification) => void>> = new Map();

  async send(notification: InAppNotification): Promise<void> {
    const prefs = this.preferences.get(notification.userId);
    if (prefs) {
      const categoryPrefs = prefs.categories[notification.category];
      if (categoryPrefs && !categoryPrefs.enabled) return;
      if (categoryPrefs && !categoryPrefs.inApp) return;
      if (this.isQuietHours(prefs) && notification.priority !== "urgent") return;
    }

    const userNotifications = this.notifications.get(notification.userId) || [];
    userNotifications.unshift(notification);

    // Keep max 500 notifications per user
    if (userNotifications.length > 500) {
      userNotifications.splice(500);
    }

    this.notifications.set(notification.userId, userNotifications);

    // Notify listeners
    const userListeners = this.listeners.get(notification.userId);
    if (userListeners) {
      for (const listener of userListeners) {
        try {
          listener(notification);
        } catch (e) {
          // Ignore listener errors
        }
      }
    }
  }

  async getNotifications(userId: string, options: {
    category?: NotificationCategory;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
    grouped?: boolean;
  } = {}): Promise<{ notifications: InAppNotification[]; unreadCount: number; total: number }> {
    let notifications = this.notifications.get(userId) || [];

    // Filter expired
    const now = new Date();
    notifications = notifications.filter(n => !n.expiresAt || n.expiresAt > now);

    // Filter dismissed
    notifications = notifications.filter(n => !n.dismissed);

    // Category filter
    if (options.category) {
      notifications = notifications.filter(n => n.category === options.category);
    }

    // Unread filter
    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    const total = notifications.length;
    const unreadCount = notifications.filter(n => !n.read).length;

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    notifications = notifications.slice(offset, offset + limit);

    return { notifications, unreadCount, total };
  }

  async getGroupedNotifications(userId: string): Promise<NotificationGroup[]> {
    const { notifications } = await this.getNotifications(userId, { limit: 200 });

    const groups = new Map<string, InAppNotification[]>();
    const ungrouped: InAppNotification[] = [];

    for (const n of notifications) {
      if (n.groupId) {
        const group = groups.get(n.groupId) || [];
        group.push(n);
        groups.set(n.groupId, group);
      } else {
        ungrouped.push(n);
      }
    }

    const result: NotificationGroup[] = [];

    for (const [groupId, items] of groups) {
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      result.push({
        groupId,
        type: items[0].type,
        count: items.length,
        latestNotification: items[0],
        preview: items.length > 1
          ? `${items[0].title} and ${items.length - 1} more`
          : items[0].title,
      });
    }

    // Add ungrouped as individual groups
    for (const n of ungrouped) {
      result.push({
        groupId: n.id,
        type: n.type,
        count: 1,
        latestNotification: n,
        preview: n.title,
      });
    }

    return result.sort(
      (a, b) => b.latestNotification.createdAt.getTime() - a.latestNotification.createdAt.getTime()
    );
  }

  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    const notifications = this.notifications.get(userId);
    if (!notifications) return;

    const idSet = new Set(notificationIds);
    for (const n of notifications) {
      if (idSet.has(n.id)) {
        n.read = true;
      }
    }
  }

  async markAllAsRead(userId: string, category?: NotificationCategory): Promise<void> {
    const notifications = this.notifications.get(userId);
    if (!notifications) return;

    for (const n of notifications) {
      if (!category || n.category === category) {
        n.read = true;
      }
    }
  }

  async dismiss(userId: string, notificationId: string): Promise<void> {
    const notifications = this.notifications.get(userId);
    if (!notifications) return;

    const n = notifications.find(x => x.id === notificationId);
    if (n) n.dismissed = true;
  }

  async getUnreadCount(userId: string): Promise<Record<NotificationCategory, number>> {
    const notifications = this.notifications.get(userId) || [];
    const counts: Record<NotificationCategory, number> = {
      trades: 0,
      league: 0,
      scoring: 0,
      markets: 0,
      social: 0,
      system: 0,
    };

    for (const n of notifications) {
      if (!n.read && !n.dismissed) {
        counts[n.category]++;
      }
    }

    return counts;
  }

  async updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): Promise<void> {
    const existing = this.preferences.get(userId) || getDefaultPreferences(userId);
    this.preferences.set(userId, { ...existing, ...prefs });
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.preferences.get(userId) || getDefaultPreferences(userId);
  }

  subscribe(userId: string, listener: (notification: InAppNotification) => void): () => void {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId)!.add(listener);

    return () => {
      this.listeners.get(userId)?.delete(listener);
    };
  }

  private isQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHours.enabled) return false;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startH, startM] = prefs.quietHours.start.split(":").map(Number);
    const [endH, endM] = prefs.quietHours.end.split(":").map(Number);
    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    if (startTime > endTime) {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return currentTime >= startTime || currentTime < endTime;
    }

    return currentTime >= startTime && currentTime < endTime;
  }
}

// ============================================================================
// Fantasy Notification Templates
// ============================================================================

export const FantasyNotifications = {
  tradeProposed(userId: string, fromTeam: string, leagueId: string, tradeId: string): InAppNotification {
    return new NotificationBuilder("trade_proposed")
      .forUser(userId)
      .withTitle("Trade Proposal")
      .withBody(`${fromTeam} has proposed a trade with you`)
      .withNavigateAction("View Trade", `/league/${leagueId}/trades/${tradeId}`)
      .withApiAction("Accept", "POST", `/api/v1/fantasy/transactions/trade/${tradeId}/accept`)
      .withApiAction("Reject", "POST", `/api/v1/fantasy/transactions/trade/${tradeId}/reject`)
      .withMetadata({ leagueId, tradeId, fromTeam })
      .withGroup(`trade-${tradeId}`)
      .expiresIn(48 * 60 * 60 * 1000) // 48 hours
      .build();
  },

  tradeAccepted(userId: string, otherTeam: string, leagueId: string, tradeId: string): InAppNotification {
    return new NotificationBuilder("trade_accepted")
      .forUser(userId)
      .withTitle("Trade Accepted!")
      .withBody(`${otherTeam} accepted your trade proposal`)
      .withNavigateAction("View Details", `/league/${leagueId}/trades/${tradeId}`)
      .withMetadata({ leagueId, tradeId })
      .withGroup(`trade-${tradeId}`)
      .build();
  },

  draftPick(userId: string, leagueId: string, round: number, pick: number, playerName: string): InAppNotification {
    return new NotificationBuilder("draft_pick")
      .forUser(userId)
      .withTitle("You're On the Clock!")
      .withBody(`Round ${round}, Pick ${pick} - Make your selection`)
      .withNavigateAction("Draft Now", `/league/${leagueId}/draft`)
      .withMetadata({ leagueId, round, pick, playerName })
      .expiresIn(5 * 60 * 1000) // 5 minutes
      .build();
  },

  draftStarting(userId: string, leagueId: string, leagueName: string, startsIn: number): InAppNotification {
    return new NotificationBuilder("draft_starting")
      .forUser(userId)
      .withTitle("Draft Starting Soon!")
      .withBody(`${leagueName} draft begins in ${startsIn} minutes`)
      .withNavigateAction("Join Draft", `/league/${leagueId}/draft`)
      .withMetadata({ leagueId, leagueName, startsIn })
      .expiresIn(startsIn * 60 * 1000)
      .build();
  },

  matchupResult(userId: string, leagueId: string, week: number, won: boolean, score: string, opponent: string): InAppNotification {
    return new NotificationBuilder("matchup_result")
      .forUser(userId)
      .withTitle(won ? "Victory!" : "Defeat")
      .withBody(`${won ? "You beat" : "You lost to"} ${opponent} (${score})`)
      .withNavigateAction("View Matchup", `/league/${leagueId}/matchup?week=${week}`)
      .withMetadata({ leagueId, week, won, score, opponent })
      .build();
  },

  playerInjury(userId: string, playerName: string, status: string, playerId: string): InAppNotification {
    return new NotificationBuilder("player_injury")
      .forUser(userId)
      .withTitle(`Injury Alert: ${playerName}`)
      .withBody(`${playerName} has been listed as ${status}`)
      .withNavigateAction("View Player", `/player/${playerId}`)
      .withNavigateAction("Edit Lineup", `/lineup`)
      .withMetadata({ playerName, status, playerId })
      .build();
  },

  betWon(userId: string, marketTitle: string, amount: number, payout: number): InAppNotification {
    return new NotificationBuilder("bet_won")
      .forUser(userId)
      .withTitle("Bet Won!")
      .withBody(`You won $${payout.toFixed(2)} on "${marketTitle}"`)
      .withNavigateAction("View Markets", `/markets`)
      .withMetadata({ marketTitle, amount, payout })
      .build();
  },

  betLost(userId: string, marketTitle: string, amount: number): InAppNotification {
    return new NotificationBuilder("bet_lost")
      .forUser(userId)
      .withTitle("Bet Lost")
      .withBody(`Your $${amount.toFixed(2)} bet on "${marketTitle}" did not win`)
      .withNavigateAction("View Markets", `/markets`)
      .withMetadata({ marketTitle, amount })
      .build();
  },

  waiverClaimed(userId: string, playerName: string, leagueId: string): InAppNotification {
    return new NotificationBuilder("waiver_claimed")
      .forUser(userId)
      .withTitle("Waiver Claim Successful")
      .withBody(`You've claimed ${playerName} off waivers`)
      .withNavigateAction("View Roster", `/league/${leagueId}/roster`)
      .withMetadata({ playerName, leagueId })
      .build();
  },

  achievementUnlocked(userId: string, achievement: string, description: string): InAppNotification {
    return new NotificationBuilder("achievement_unlocked")
      .forUser(userId)
      .withTitle("Achievement Unlocked!")
      .withBody(`${achievement}: ${description}`)
      .withNavigateAction("View Achievements", `/profile/achievements`)
      .withMetadata({ achievement, description })
      .build();
  },

  leagueInvite(userId: string, leagueName: string, inviterName: string, inviteCode: string): InAppNotification {
    return new NotificationBuilder("league_invite")
      .forUser(userId)
      .withTitle("League Invitation")
      .withBody(`${inviterName} invited you to join "${leagueName}"`)
      .withApiAction("Accept", "POST", `/api/v1/fantasy/leagues/join`, { inviteCode })
      .withNavigateAction("View League", `/social/leagues`)
      .withMetadata({ leagueName, inviterName, inviteCode })
      .expiresIn(7 * 24 * 60 * 60 * 1000) // 7 days
      .build();
  },

  weeklyRecap(userId: string, leagueId: string, week: number, summary: string): InAppNotification {
    return new NotificationBuilder("weekly_recap")
      .forUser(userId)
      .withTitle(`Week ${week} Recap`)
      .withBody(summary)
      .withNavigateAction("Full Recap", `/league/${leagueId}/recap?week=${week}`)
      .withMetadata({ leagueId, week })
      .build();
  },
};

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    categories: {
      trades: { enabled: true, push: true, inApp: true, email: true },
      league: { enabled: true, push: true, inApp: true, email: false },
      scoring: { enabled: true, push: true, inApp: true, email: false },
      markets: { enabled: true, push: true, inApp: true, email: false },
      social: { enabled: true, push: false, inApp: true, email: false },
      system: { enabled: true, push: true, inApp: true, email: true },
    },
    quietHours: {
      enabled: true,
      start: "23:00",
      end: "07:00",
      timezone: "America/New_York",
    },
    digestMode: "realtime",
  };
}

// ============================================================================
// Singleton
// ============================================================================

let inboxService: NotificationInboxService | null = null;

export function getNotificationInboxService(): NotificationInboxService {
  if (!inboxService) {
    inboxService = new NotificationInboxService();
  }
  return inboxService;
}
