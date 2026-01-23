/**
 * Analytics & Telemetry Service
 * User activity tracking that feeds into QuestDB
 */

// ============================================================================
// Types
// ============================================================================

export type EventCategory =
  | "navigation"
  | "league"
  | "draft"
  | "roster"
  | "trade"
  | "waiver"
  | "market"
  | "chat"
  | "auth"
  | "payment"
  | "error"
  | "performance";

export interface AnalyticsEvent {
  eventName: string;
  category: EventCategory;
  properties?: Record<string, string | number | boolean | null>;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  platform?: "ios" | "android" | "web";
  appVersion?: string;
  screen?: string;
}

export interface UserProfile {
  userId: string;
  traits: Record<string, string | number | boolean | null>;
  firstSeen: number;
  lastSeen: number;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
  events: number;
  screens: string[];
  platform: string;
  appVersion: string;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "count" | "percent";
  tags?: Record<string, string>;
  timestamp: number;
}

// ============================================================================
// Predefined Events
// ============================================================================

export const EVENTS = {
  // Navigation
  SCREEN_VIEW: "screen_view",
  TAB_SWITCH: "tab_switch",
  DEEP_LINK_OPEN: "deep_link_open",

  // Auth
  SIGN_UP: "sign_up",
  LOGIN: "login",
  LOGOUT: "logout",

  // League
  LEAGUE_CREATE: "league_create",
  LEAGUE_JOIN: "league_join",
  LEAGUE_LEAVE: "league_leave",
  LEAGUE_VIEW: "league_view",

  // Draft
  DRAFT_JOIN: "draft_join",
  DRAFT_PICK: "draft_pick",
  DRAFT_AUTO_PICK: "draft_auto_pick",
  DRAFT_QUEUE_ADD: "draft_queue_add",
  DRAFT_COMPLETE: "draft_complete",

  // Roster
  LINEUP_SET: "lineup_set",
  LINEUP_OPTIMIZE: "lineup_optimize",
  PLAYER_ADD: "player_add",
  PLAYER_DROP: "player_drop",

  // Trade
  TRADE_PROPOSE: "trade_propose",
  TRADE_ACCEPT: "trade_accept",
  TRADE_REJECT: "trade_reject",
  TRADE_COUNTER: "trade_counter",
  TRADE_VIEW: "trade_view",

  // Waiver
  WAIVER_CLAIM: "waiver_claim",
  WAIVER_CANCEL: "waiver_cancel",
  WAIVER_RESULT: "waiver_result",

  // Market
  MARKET_VIEW: "market_view",
  BET_PLACE: "bet_place",
  BET_CASHOUT: "bet_cashout",
  MARKET_SETTLE: "market_settle",

  // Chat
  MESSAGE_SEND: "message_send",
  CHAT_ROOM_JOIN: "chat_room_join",

  // Payment
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  PAYMENT_METHOD_ADD: "payment_method_add",

  // Error
  APP_ERROR: "app_error",
  API_ERROR: "api_error",
  NETWORK_ERROR: "network_error",

  // Performance
  API_LATENCY: "api_latency",
  SCREEN_LOAD: "screen_load",
  APP_START: "app_start",
} as const;

// ============================================================================
// Analytics Service
// ============================================================================

export class AnalyticsService {
  private queue: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timer | null = null;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private platform: string = "web";
  private appVersion: string = "1.0.0";
  private currentScreen: string = "";
  private adapters: AnalyticsAdapter[] = [];

  constructor(private config: {
    flushIntervalMs?: number;
    maxQueueSize?: number;
    batchSize?: number;
    debug?: boolean;
  } = {}) {
    this.config = {
      flushIntervalMs: 10000,
      maxQueueSize: 1000,
      batchSize: 50,
      debug: false,
      ...config,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  initialize(options: {
    platform?: string;
    appVersion?: string;
    adapters?: AnalyticsAdapter[];
  } = {}): void {
    this.platform = options.platform || "web";
    this.appVersion = options.appVersion || "1.0.0";
    this.adapters = options.adapters || [];
    this.sessionId = generateSessionId();

    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs!);

    this.track(EVENTS.APP_START, "performance", { platform: this.platform });
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush(); // Final flush
  }

  // ============================================================================
  // Identification
  // ============================================================================

  identify(userId: string, traits?: Record<string, any>): void {
    this.userId = userId;

    const profile: UserProfile = {
      userId,
      traits: traits || {},
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    this.adapters.forEach((adapter) => adapter.identify?.(profile));

    if (this.config.debug) {
      console.log("[Analytics] Identify:", userId, traits);
    }
  }

  reset(): void {
    this.userId = null;
    this.sessionId = generateSessionId();
    this.adapters.forEach((adapter) => adapter.reset?.());
  }

  // ============================================================================
  // Tracking
  // ============================================================================

  track(eventName: string, category: EventCategory, properties?: Record<string, any>): void {
    const event: AnalyticsEvent = {
      eventName,
      category,
      properties,
      userId: this.userId || undefined,
      sessionId: this.sessionId || undefined,
      timestamp: Date.now(),
      platform: this.platform as any,
      appVersion: this.appVersion,
      screen: this.currentScreen,
    };

    this.queue.push(event);

    // Flush if queue is full
    if (this.queue.length >= this.config.maxQueueSize!) {
      this.flush();
    }

    if (this.config.debug) {
      console.log("[Analytics] Track:", eventName, properties);
    }
  }

  screenView(screenName: string, properties?: Record<string, any>): void {
    this.currentScreen = screenName;
    this.track(EVENTS.SCREEN_VIEW, "navigation", {
      screen_name: screenName,
      ...properties,
    });
  }

  // ============================================================================
  // Fantasy-Specific Tracking
  // ============================================================================

  trackDraftPick(params: {
    draftId: string;
    round: number;
    pick: number;
    playerId: string;
    playerName: string;
    position: string;
    isAutoPick: boolean;
  }): void {
    this.track(params.isAutoPick ? EVENTS.DRAFT_AUTO_PICK : EVENTS.DRAFT_PICK, "draft", params);
  }

  trackBetPlaced(params: {
    marketId: string;
    outcomeId: string;
    amount: number;
    odds: number;
    marketType: string;
  }): void {
    this.track(EVENTS.BET_PLACE, "market", params);
  }

  trackTradeAction(action: "propose" | "accept" | "reject" | "counter", params: {
    tradeId: string;
    leagueId: string;
    playerCount: number;
  }): void {
    const eventMap = {
      propose: EVENTS.TRADE_PROPOSE,
      accept: EVENTS.TRADE_ACCEPT,
      reject: EVENTS.TRADE_REJECT,
      counter: EVENTS.TRADE_COUNTER,
    };
    this.track(eventMap[action], "trade", params);
  }

  trackError(error: Error, context?: Record<string, any>): void {
    this.track(EVENTS.APP_ERROR, "error", {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack?.substring(0, 500),
      ...context,
    });
  }

  trackPerformance(metric: PerformanceMetric): void {
    this.track(EVENTS.API_LATENCY, "performance", {
      metric_name: metric.name,
      metric_value: metric.value,
      metric_unit: metric.unit,
      ...metric.tags,
    });
  }

  // ============================================================================
  // Timing Helper
  // ============================================================================

  startTimer(name: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.trackPerformance({
        name,
        value: Math.round(duration),
        unit: "ms",
        timestamp: Date.now(),
      });
    };
  }

  // ============================================================================
  // Flushing
  // ============================================================================

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.config.batchSize!);

    // Send to all adapters
    await Promise.allSettled(
      this.adapters.map((adapter) => adapter.flush(batch))
    );
  }

  // ============================================================================
  // Funnel Analysis Helpers
  // ============================================================================

  trackFunnelStep(funnelName: string, stepName: string, stepNumber: number, properties?: Record<string, any>): void {
    this.track(`funnel_${funnelName}_step`, "navigation", {
      funnel_name: funnelName,
      step_name: stepName,
      step_number: stepNumber,
      ...properties,
    });
  }

  // Pre-defined funnels
  readonly funnels = {
    onboarding: {
      start: () => this.trackFunnelStep("onboarding", "start", 1),
      createAccount: () => this.trackFunnelStep("onboarding", "create_account", 2),
      verifyEmail: () => this.trackFunnelStep("onboarding", "verify_email", 3),
      joinLeague: () => this.trackFunnelStep("onboarding", "join_league", 4),
      setLineup: () => this.trackFunnelStep("onboarding", "set_lineup", 5),
      complete: () => this.trackFunnelStep("onboarding", "complete", 6),
    },
    draft: {
      enterLobby: (draftId: string) => this.trackFunnelStep("draft", "enter_lobby", 1, { draftId }),
      startDraft: (draftId: string) => this.trackFunnelStep("draft", "start", 2, { draftId }),
      firstPick: (draftId: string) => this.trackFunnelStep("draft", "first_pick", 3, { draftId }),
      complete: (draftId: string) => this.trackFunnelStep("draft", "complete", 4, { draftId }),
    },
    betting: {
      viewMarket: (marketId: string) => this.trackFunnelStep("betting", "view_market", 1, { marketId }),
      selectOutcome: (marketId: string) => this.trackFunnelStep("betting", "select_outcome", 2, { marketId }),
      enterAmount: (marketId: string) => this.trackFunnelStep("betting", "enter_amount", 3, { marketId }),
      confirm: (marketId: string) => this.trackFunnelStep("betting", "confirm", 4, { marketId }),
      complete: (marketId: string) => this.trackFunnelStep("betting", "complete", 5, { marketId }),
    },
  };
}

// ============================================================================
// Adapter Interface
// ============================================================================

export interface AnalyticsAdapter {
  name: string;
  flush(events: AnalyticsEvent[]): Promise<void>;
  identify?(profile: UserProfile): void;
  reset?(): void;
}

// ============================================================================
// QuestDB Adapter
// ============================================================================

export class QuestDBAnalyticsAdapter implements AnalyticsAdapter {
  name = "questdb";

  constructor(private config: {
    host: string;
    port: number;
    apiPath?: string;
  }) {}

  async flush(events: AnalyticsEvent[]): Promise<void> {
    // Convert to ILP (InfluxDB Line Protocol) for QuestDB ingestion
    const lines = events.map((event) => {
      const tags = [
        `category=${escapeTag(event.category)}`,
        event.userId ? `user_id=${escapeTag(event.userId)}` : null,
        event.platform ? `platform=${escapeTag(event.platform)}` : null,
        event.screen ? `screen=${escapeTag(event.screen)}` : null,
      ].filter(Boolean).join(",");

      const fields = Object.entries(event.properties || {})
        .map(([key, value]) => {
          if (typeof value === "number") return `${key}=${value}`;
          if (typeof value === "boolean") return `${key}=${value}`;
          if (value === null) return null;
          return `${key}="${escapeField(String(value))}"`;
        })
        .filter(Boolean)
        .join(",");

      const timestamp = event.timestamp * 1000000; // Nanoseconds

      return `user_activity,event_name=${escapeTag(event.eventName)},${tags} ${fields} ${timestamp}`;
    });

    try {
      await fetch(`http://${this.config.host}:${this.config.port}${this.config.apiPath || "/write"}`, {
        method: "POST",
        body: lines.join("\n"),
      });
    } catch (error) {
      console.error("[QuestDB Adapter] Flush error:", error);
    }
  }
}

// ============================================================================
// Console Adapter (Development)
// ============================================================================

export class ConsoleAnalyticsAdapter implements AnalyticsAdapter {
  name = "console";

  async flush(events: AnalyticsEvent[]): Promise<void> {
    events.forEach((event) => {
      console.log(`[Analytics] ${event.eventName}`, event.properties || {});
    });
  }

  identify(profile: UserProfile): void {
    console.log("[Analytics] Identify:", profile.userId, profile.traits);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function escapeTag(value: string): string {
  return value.replace(/[,= \n]/g, "\\$&");
}

function escapeField(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

// ============================================================================
// Export Singleton
// ============================================================================

export const analytics = new AnalyticsService();
