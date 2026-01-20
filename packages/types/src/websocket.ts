/**
 * PULL WebSocket Types
 * Type definitions for real-time WebSocket infrastructure
 */

// ============================================================================
// Core Message Protocol
// ============================================================================

/**
 * Base WebSocket message structure
 */
export type WSMessageType =
  | "subscribe"
  | "unsubscribe"
  | "message"
  | "ping"
  | "pong"
  | "auth"
  | "error"
  | "ack";

export interface WSMessage {
  type: WSMessageType;
  channel?: string;
  data?: unknown;
  id?: string;
  timestamp?: number;
}

export interface WSAuthMessage {
  type: "auth";
  token: string;
}

export interface WSSubscribeMessage {
  type: "subscribe";
  channel: string;
}

export interface WSUnsubscribeMessage {
  type: "unsubscribe";
  channel: string;
}

export interface WSPingMessage {
  type: "ping";
  timestamp: number;
}

export interface WSPongMessage {
  type: "pong";
  timestamp: number;
}

export interface WSErrorMessage {
  type: "error";
  code: string;
  message: string;
  channel?: string;
}

export interface WSAckMessage {
  type: "ack";
  id: string;
  success: boolean;
  channel?: string;
  error?: string;
}

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Available WebSocket channels
 */
export type WSChannel =
  | `market:${string}` // Price/orderbook updates for specific market
  | "markets" // All market price ticks
  | `orders:${string}` // User's order updates
  | `fills:${string}` // User's fills
  | `portfolio:${string}` // Portfolio value updates
  | `chat:${string}` // Matrix room messages
  | `notifications:${string}` // User notifications
  | `signals:${string}` // AI signals
  | "leaderboard" // Leaderboard updates
  | `presence:${string}`; // Room presence

export type WSChannelType =
  | "market"
  | "markets"
  | "orders"
  | "fills"
  | "portfolio"
  | "chat"
  | "notifications"
  | "signals"
  | "leaderboard"
  | "presence";

// ============================================================================
// Market Update Types
// ============================================================================

/**
 * Price update for a specific market
 */
export interface PriceUpdate {
  type: "price";
  ticker: string;
  price: number;
  previousPrice?: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h?: number;
  low24h?: number;
  timestamp: number;
}

/**
 * Orderbook update for a specific market
 */
export interface OrderbookUpdate {
  type: "orderbook";
  ticker: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  spread?: number;
  midPrice?: number;
  timestamp: number;
}

/**
 * Orderbook delta (incremental update)
 */
export interface OrderbookDelta {
  type: "orderbook_delta";
  ticker: string;
  side: "bid" | "ask";
  price: number;
  size: number; // 0 means remove
  timestamp: number;
}

/**
 * Trade execution on a market
 */
export interface TradeUpdate {
  type: "trade";
  ticker: string;
  tradeId: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  timestamp: number;
}

// ============================================================================
// Order Update Types
// ============================================================================

/**
 * Order status update
 */
export interface OrderUpdate {
  type: "order";
  orderId: string;
  ticker: string;
  status: "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  side: "buy" | "sell";
  orderType: "limit" | "market";
  price?: number;
  quantity: number;
  filledQty: number;
  remainingQty: number;
  avgPrice?: number;
  createdAt: number;
  updatedAt: number;
  timestamp: number;
}

/**
 * Fill notification
 */
export interface FillUpdate {
  type: "fill";
  fillId: string;
  orderId: string;
  ticker: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  timestamp: number;
}

// ============================================================================
// Portfolio Update Types
// ============================================================================

/**
 * Portfolio value update
 */
export interface PortfolioUpdate {
  type: "portfolio";
  userId: string;
  totalValue: number;
  previousValue: number;
  change24h: number;
  changePercent24h: number;
  cashBalance: number;
  investedBalance: number;
  positions: PortfolioPositionSummary[];
  timestamp: number;
}

export interface PortfolioPositionSummary {
  ticker: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat message from Matrix room
 */
export interface ChatMessage {
  type: "chat";
  roomId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  contentType: "text" | "image" | "trade_share" | "position_share";
  replyTo?: string;
  reactions?: Record<string, string[]>;
  edited?: boolean;
  timestamp: number;
}

/**
 * Typing indicator
 */
export interface TypingUpdate {
  type: "typing";
  roomId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  timestamp: number;
}

/**
 * Room presence update
 */
export interface PresenceUpdate {
  type: "presence";
  roomId: string;
  userId: string;
  userName: string;
  status: "online" | "away" | "offline";
  lastActive?: number;
  timestamp: number;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * User notification
 */
export interface Notification {
  type: "notification";
  id: string;
  category: "trade" | "social" | "signal" | "system" | "achievement" | "price_alert";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  body: string;
  icon?: string;
  imageUrl?: string;
  action?: NotificationAction;
  read: boolean;
  timestamp: number;
}

export interface NotificationAction {
  type: "navigate" | "open_url" | "execute";
  data: {
    url?: string;
    route?: string;
    params?: Record<string, string>;
  };
}

// ============================================================================
// Signal Types
// ============================================================================

/**
 * AI trading signal
 */
export interface SignalUpdate {
  type: "signal";
  signalId: string;
  ticker: string;
  signalType: "buy" | "sell" | "hold";
  confidence: number; // 0-100
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  source: string;
  expiresAt?: number;
  timestamp: number;
}

// ============================================================================
// Leaderboard Types
// ============================================================================

/**
 * Leaderboard update
 */
export interface LeaderboardUpdate {
  type: "leaderboard";
  leaderboardType: "daily" | "weekly" | "monthly" | "all_time";
  entries: LeaderboardEntry[];
  userRank?: LeaderboardEntry;
  timestamp: number;
}

export interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  userId: string;
  username: string;
  avatar?: string;
  score: number;
  percentChange?: number;
  trades?: number;
  winRate?: number;
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Connection state
 */
export type ConnectionState =
  | "connecting"
  | "connected"
  | "authenticated"
  | "disconnected"
  | "reconnecting"
  | "error";

/**
 * Connection metadata
 */
export interface ConnectionInfo {
  connectionId: string;
  userId?: string;
  state: ConnectionState;
  connectedAt?: number;
  authenticatedAt?: number;
  lastPingAt?: number;
  lastPongAt?: number;
  latency?: number;
  subscriptions: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Connection metrics
 */
export interface ConnectionMetrics {
  totalConnections: number;
  authenticatedConnections: number;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  averageLatency: number;
  subscriptionCounts: Record<string, number>;
}

// ============================================================================
// Server-side Types
// ============================================================================

/**
 * Broadcast options
 */
export interface BroadcastOptions {
  excludeConnectionIds?: string[];
  excludeUserIds?: string[];
  onlyUserIds?: string[];
}

/**
 * Room/channel info
 */
export interface ChannelInfo {
  channel: string;
  subscriberCount: number;
  createdAt: number;
  lastActivityAt: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * WebSocket client configuration
 */
export interface WSClientConfig {
  url: string;
  token?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectMaxAttempts?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  messageQueueSize?: number;
  debug?: boolean;
}

// ============================================================================
// Event Types (for type-safe event emitter)
// ============================================================================

export interface WSEventMap {
  // Connection events
  connected: { connectionId: string };
  authenticated: { userId: string };
  disconnected: { code: number; reason: string };
  reconnecting: { attempt: number; maxAttempts: number };
  error: { code: string; message: string };

  // Subscription events
  subscribed: { channel: string };
  unsubscribed: { channel: string };

  // Market events
  price: PriceUpdate;
  orderbook: OrderbookUpdate;
  orderbook_delta: OrderbookDelta;
  trade: TradeUpdate;

  // User events
  order: OrderUpdate;
  fill: FillUpdate;
  portfolio: PortfolioUpdate;

  // Social events
  chat: ChatMessage;
  typing: TypingUpdate;
  presence: PresenceUpdate;

  // Other events
  notification: Notification;
  signal: SignalUpdate;
  leaderboard: LeaderboardUpdate;
}

export type WSEventType = keyof WSEventMap;
