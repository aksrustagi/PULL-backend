/**
 * Fantasy WebSocket Server
 * Real-time updates for live scoring, drafts, trades, and markets
 */

import { EventEmitter } from "events";

// ============================================================================
// Types
// ============================================================================

export type WebSocketEventType =
  | "score_update"
  | "draft_pick"
  | "draft_state"
  | "trade_proposal"
  | "trade_response"
  | "waiver_result"
  | "market_price"
  | "market_settled"
  | "player_injury"
  | "roster_change"
  | "chat_message"
  | "notification"
  | "connection_status"
  | "heartbeat";

export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;
  channel: string;
  data: T;
  timestamp: number;
  id: string;
}

export interface ScoreUpdatePayload {
  matchupId: string;
  leagueId: string;
  week: number;
  homeTeam: {
    teamId: string;
    score: number;
    projectedScore: number;
    players: Array<{
      playerId: string;
      name: string;
      position: string;
      points: number;
      isPlaying: boolean;
      status: "not_started" | "in_progress" | "final";
    }>;
  };
  awayTeam: {
    teamId: string;
    score: number;
    projectedScore: number;
    players: Array<{
      playerId: string;
      name: string;
      position: string;
      points: number;
      isPlaying: boolean;
      status: "not_started" | "in_progress" | "final";
    }>;
  };
}

export interface DraftPickPayload {
  draftId: string;
  leagueId: string;
  round: number;
  pick: number;
  overallPick: number;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  isAutoPick: boolean;
  nextPickTeamId: string;
  nextPickTeamName: string;
  timeRemaining: number;
}

export interface DraftStatePayload {
  draftId: string;
  status: "waiting" | "in_progress" | "paused" | "completed";
  currentRound: number;
  currentPick: number;
  currentTeamId: string;
  timeRemaining: number;
  picks: DraftPickPayload[];
  availablePlayers: number;
}

export interface MarketPricePayload {
  marketId: string;
  outcomes: Array<{
    outcomeId: string;
    label: string;
    price: number;
    previousPrice: number;
    impliedProbability: number;
    volume: number;
  }>;
  totalVolume: number;
  liquidity: number;
}

export interface PlayerInjuryPayload {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  previousStatus: string;
  newStatus: string;
  description: string;
  returnDate?: string;
  affectedLeagues: string[];
}

export interface SubscriptionOptions {
  channel: string;
  filters?: Record<string, string>;
}

// ============================================================================
// Channel Definitions
// ============================================================================

export const CHANNELS = {
  // League-specific channels
  leagueScoring: (leagueId: string) => `league:${leagueId}:scoring`,
  leagueDraft: (leagueId: string, draftId: string) => `league:${leagueId}:draft:${draftId}`,
  leagueTrades: (leagueId: string) => `league:${leagueId}:trades`,
  leagueChat: (leagueId: string) => `league:${leagueId}:chat`,
  leagueActivity: (leagueId: string) => `league:${leagueId}:activity`,

  // Market channels
  marketPrices: (marketId: string) => `market:${marketId}:prices`,
  marketsAll: () => `markets:all`,

  // Player channels
  playerUpdates: (playerId: string) => `player:${playerId}:updates`,
  injuryAlerts: () => `injuries:all`,

  // User-specific channels
  userNotifications: (userId: string) => `user:${userId}:notifications`,
  userPositions: (userId: string) => `user:${userId}:positions`,

  // Global channels
  globalScoring: () => `global:scoring`,
  globalNews: () => `global:news`,
} as const;

// ============================================================================
// WebSocket Connection Manager
// ============================================================================

export interface WSClient {
  id: string;
  userId: string;
  socket: any; // WebSocket instance
  subscriptions: Set<string>;
  lastHeartbeat: number;
  connectedAt: number;
  metadata: {
    platform: "ios" | "android" | "web";
    version: string;
    deviceId?: string;
  };
}

export class FantasyWebSocketServer extends EventEmitter {
  private clients: Map<string, WSClient> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channel -> client IDs
  private heartbeatInterval: NodeJS.Timer | null = null;
  private messageBuffer: Map<string, WebSocketMessage[]> = new Map(); // channel -> buffered messages
  private bufferFlushInterval: NodeJS.Timer | null = null;

  constructor(private config: {
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
    maxClientsPerUser?: number;
    maxSubscriptionsPerClient?: number;
    bufferFlushIntervalMs?: number;
    maxBufferSize?: number;
  } = {}) {
    super();
    this.config = {
      heartbeatIntervalMs: 30000,
      heartbeatTimeoutMs: 60000,
      maxClientsPerUser: 5,
      maxSubscriptionsPerClient: 50,
      bufferFlushIntervalMs: 100,
      maxBufferSize: 1000,
      ...config,
    };
  }

  start(): void {
    // Start heartbeat checker
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatIntervalMs!);

    // Start buffer flush
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffers();
    }, this.config.bufferFlushIntervalMs!);

    this.emit("started");
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }

    // Close all connections
    this.clients.forEach((client) => {
      this.disconnect(client.id, "server_shutdown");
    });

    this.emit("stopped");
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  handleConnection(socket: any, userId: string, metadata: WSClient["metadata"]): WSClient {
    const clientId = generateId();

    // Check max connections per user
    const userClients = this.getClientsByUser(userId);
    if (userClients.length >= this.config.maxClientsPerUser!) {
      // Disconnect oldest
      const oldest = userClients.sort((a, b) => a.connectedAt - b.connectedAt)[0];
      this.disconnect(oldest.id, "max_connections");
    }

    const client: WSClient = {
      id: clientId,
      userId,
      socket,
      subscriptions: new Set(),
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
      metadata,
    };

    this.clients.set(clientId, client);

    // Auto-subscribe to user notifications
    this.subscribe(clientId, CHANNELS.userNotifications(userId));
    this.subscribe(clientId, CHANNELS.userPositions(userId));

    // Send connection confirmation
    this.sendToClient(clientId, {
      type: "connection_status",
      channel: "system",
      data: { status: "connected", clientId },
      timestamp: Date.now(),
      id: generateId(),
    });

    this.emit("clientConnected", { clientId, userId });
    return client;
  }

  disconnect(clientId: string, reason: string = "client_disconnect"): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from all channels
    client.subscriptions.forEach((channel) => {
      const channelClients = this.channels.get(channel);
      if (channelClients) {
        channelClients.delete(clientId);
        if (channelClients.size === 0) {
          this.channels.delete(channel);
        }
      }
    });

    // Close socket
    try {
      client.socket.close(1000, reason);
    } catch (e) {
      // Socket may already be closed
    }

    this.clients.delete(clientId);
    this.emit("clientDisconnected", { clientId, userId: client.userId, reason });
  }

  handleHeartbeat(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = Date.now();
    }
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  subscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (client.subscriptions.size >= this.config.maxSubscriptionsPerClient!) {
      return false;
    }

    client.subscriptions.add(channel);

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(clientId);

    this.emit("subscribed", { clientId, channel });
    return true;
  }

  unsubscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(channel);

    const channelClients = this.channels.get(channel);
    if (channelClients) {
      channelClients.delete(clientId);
      if (channelClients.size === 0) {
        this.channels.delete(channel);
      }
    }

    this.emit("unsubscribed", { clientId, channel });
  }

  // Subscribe to all league channels for a user
  subscribeToLeague(clientId: string, leagueId: string): void {
    this.subscribe(clientId, CHANNELS.leagueScoring(leagueId));
    this.subscribe(clientId, CHANNELS.leagueTrades(leagueId));
    this.subscribe(clientId, CHANNELS.leagueChat(leagueId));
    this.subscribe(clientId, CHANNELS.leagueActivity(leagueId));
  }

  subscribeToDraft(clientId: string, leagueId: string, draftId: string): void {
    this.subscribe(clientId, CHANNELS.leagueDraft(leagueId, draftId));
  }

  subscribeToMarket(clientId: string, marketId: string): void {
    this.subscribe(clientId, CHANNELS.marketPrices(marketId));
  }

  // ============================================================================
  // Broadcasting
  // ============================================================================

  broadcast(channel: string, message: Omit<WebSocketMessage, "id" | "timestamp" | "channel">): void {
    const fullMessage: WebSocketMessage = {
      ...message,
      channel,
      timestamp: Date.now(),
      id: generateId(),
    };

    const channelClients = this.channels.get(channel);
    if (!channelClients || channelClients.size === 0) return;

    channelClients.forEach((clientId) => {
      this.sendToClient(clientId, fullMessage);
    });

    this.emit("broadcast", { channel, messageType: message.type, recipientCount: channelClients.size });
  }

  // Buffer messages for high-frequency updates
  bufferBroadcast(channel: string, message: Omit<WebSocketMessage, "id" | "timestamp" | "channel">): void {
    const fullMessage: WebSocketMessage = {
      ...message,
      channel,
      timestamp: Date.now(),
      id: generateId(),
    };

    if (!this.messageBuffer.has(channel)) {
      this.messageBuffer.set(channel, []);
    }

    const buffer = this.messageBuffer.get(channel)!;
    buffer.push(fullMessage);

    // Prevent buffer overflow
    if (buffer.length > this.config.maxBufferSize!) {
      buffer.shift();
    }
  }

  // ============================================================================
  // Fantasy-Specific Broadcasting
  // ============================================================================

  broadcastScoreUpdate(leagueId: string, payload: ScoreUpdatePayload): void {
    this.broadcast(CHANNELS.leagueScoring(leagueId), {
      type: "score_update",
      data: payload,
    });

    // Also broadcast to global scoring channel
    this.broadcast(CHANNELS.globalScoring(), {
      type: "score_update",
      data: payload,
    });
  }

  broadcastDraftPick(leagueId: string, draftId: string, payload: DraftPickPayload): void {
    this.broadcast(CHANNELS.leagueDraft(leagueId, draftId), {
      type: "draft_pick",
      data: payload,
    });
  }

  broadcastDraftState(leagueId: string, draftId: string, payload: DraftStatePayload): void {
    this.broadcast(CHANNELS.leagueDraft(leagueId, draftId), {
      type: "draft_state",
      data: payload,
    });
  }

  broadcastMarketPrice(marketId: string, payload: MarketPricePayload): void {
    // Buffer market price updates (high frequency)
    this.bufferBroadcast(CHANNELS.marketPrices(marketId), {
      type: "market_price",
      data: payload,
    });

    // Also broadcast to all markets channel
    this.bufferBroadcast(CHANNELS.marketsAll(), {
      type: "market_price",
      data: payload,
    });
  }

  broadcastInjuryAlert(payload: PlayerInjuryPayload): void {
    // Global injury alerts
    this.broadcast(CHANNELS.injuryAlerts(), {
      type: "player_injury",
      data: payload,
    });

    // Player-specific
    this.broadcast(CHANNELS.playerUpdates(payload.playerId), {
      type: "player_injury",
      data: payload,
    });

    // Affected leagues
    payload.affectedLeagues.forEach((leagueId) => {
      this.broadcast(CHANNELS.leagueActivity(leagueId), {
        type: "player_injury",
        data: payload,
      });
    });
  }

  broadcastTradeActivity(leagueId: string, payload: any): void {
    this.broadcast(CHANNELS.leagueTrades(leagueId), {
      type: "trade_proposal",
      data: payload,
    });
  }

  // ============================================================================
  // Client-Specific Messaging
  // ============================================================================

  sendToUser(userId: string, message: Omit<WebSocketMessage, "id" | "timestamp">): void {
    const userClients = this.getClientsByUser(userId);
    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now(),
      id: generateId(),
    };

    userClients.forEach((client) => {
      this.sendToClient(client.id, fullMessage);
    });
  }

  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const data = JSON.stringify(message);
      client.socket.send(data);
    } catch (error) {
      this.emit("sendError", { clientId, error });
      this.disconnect(clientId, "send_error");
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getClientsByUser(userId: string): WSClient[] {
    const clients: WSClient[] = [];
    this.clients.forEach((client) => {
      if (client.userId === userId) {
        clients.push(client);
      }
    });
    return clients;
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = this.config.heartbeatTimeoutMs!;

    this.clients.forEach((client, clientId) => {
      if (now - client.lastHeartbeat > timeout) {
        this.disconnect(clientId, "heartbeat_timeout");
      }
    });
  }

  private flushBuffers(): void {
    this.messageBuffer.forEach((messages, channel) => {
      if (messages.length === 0) return;

      const channelClients = this.channels.get(channel);
      if (!channelClients || channelClients.size === 0) {
        this.messageBuffer.set(channel, []);
        return;
      }

      // Send latest message only (for high-frequency data, only latest matters)
      const latestMessage = messages[messages.length - 1];
      channelClients.forEach((clientId) => {
        this.sendToClient(clientId, latestMessage);
      });

      this.messageBuffer.set(channel, []);
    });
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics(): {
    totalClients: number;
    totalChannels: number;
    totalSubscriptions: number;
    clientsByPlatform: Record<string, number>;
    topChannels: Array<{ channel: string; subscribers: number }>;
  } {
    const clientsByPlatform: Record<string, number> = {};
    let totalSubscriptions = 0;

    this.clients.forEach((client) => {
      const platform = client.metadata.platform;
      clientsByPlatform[platform] = (clientsByPlatform[platform] || 0) + 1;
      totalSubscriptions += client.subscriptions.size;
    });

    const topChannels = Array.from(this.channels.entries())
      .map(([channel, clients]) => ({ channel, subscribers: clients.size }))
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, 20);

    return {
      totalClients: this.clients.size,
      totalChannels: this.channels.size,
      totalSubscriptions,
      clientsByPlatform,
      topChannels,
    };
  }
}

// ============================================================================
// Hono WebSocket Route Integration
// ============================================================================

export function createWebSocketHandler(wsServer: FantasyWebSocketServer) {
  return {
    onOpen(socket: any, userId: string, metadata: WSClient["metadata"]) {
      return wsServer.handleConnection(socket, userId, metadata);
    },

    onMessage(clientId: string, data: string) {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case "subscribe":
            wsServer.subscribe(clientId, message.channel);
            break;
          case "unsubscribe":
            wsServer.unsubscribe(clientId, message.channel);
            break;
          case "heartbeat":
            wsServer.handleHeartbeat(clientId);
            break;
          case "subscribe_league":
            wsServer.subscribeToLeague(clientId, message.leagueId);
            break;
          case "subscribe_draft":
            wsServer.subscribeToDraft(clientId, message.leagueId, message.draftId);
            break;
          case "subscribe_market":
            wsServer.subscribeToMarket(clientId, message.marketId);
            break;
        }
      } catch (error) {
        // Invalid message format
      }
    },

    onClose(clientId: string) {
      wsServer.disconnect(clientId);
    },

    onError(clientId: string, error: Error) {
      wsServer.disconnect(clientId, "error");
    },
  };
}

// ============================================================================
// Utility
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Export singleton
let wsServerInstance: FantasyWebSocketServer | null = null;

export function getFantasyWebSocketServer(config?: ConstructorParameters<typeof FantasyWebSocketServer>[0]): FantasyWebSocketServer {
  if (!wsServerInstance) {
    wsServerInstance = new FantasyWebSocketServer(config);
  }
  return wsServerInstance;
}
