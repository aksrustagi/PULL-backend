/**
 * PULL WebSocket Hooks
 * React hooks for real-time WebSocket communication
 */

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
} from "react";
import type { ReactNode } from "react";
import type {
  WSMessage,
  WSClientConfig,
  ConnectionState,
  PriceUpdate,
  OrderbookUpdate,
  OrderUpdate,
  FillUpdate,
  PortfolioUpdate,
  ChatMessage,
  Notification,
  SignalUpdate,
  LeaderboardUpdate,
  TypingUpdate,
  PresenceUpdate,
  WSEventMap,
  WSEventType,
} from "@pull/types";

// ============================================================================
// Event Emitter for Client
// ============================================================================

type EventHandler<T> = (data: T) => void;

class ClientEventEmitter {
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  on<K extends keyof WSEventMap>(event: K, handler: EventHandler<WSEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  off<K extends keyof WSEventMap>(event: K, handler: EventHandler<WSEventMap[K]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
    }
  }

  emit<K extends keyof WSEventMap>(event: K, data: WSEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}

// Global event emitter instance
const eventEmitter = new ClientEventEmitter();

// ============================================================================
// WebSocket Client
// ============================================================================

interface WebSocketClientState {
  connected: boolean;
  authenticated: boolean;
  connectionId: string | null;
  userId: string | null;
  subscriptions: Set<string>;
  reconnectAttempt: number;
  latency: number;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WSClientConfig>;
  private state: WebSocketClientState;
  private messageQueue: WSMessage[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingTime: number = 0;
  private stateListeners: Set<(state: WebSocketClientState) => void> = new Set();

  constructor(config: WSClientConfig) {
    this.config = {
      url: config.url,
      token: config.token ?? "",
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10000,
      messageQueueSize: config.messageQueueSize ?? 100,
      debug: config.debug ?? false,
    };

    this.state = {
      connected: false,
      authenticated: false,
      connectionId: null,
      userId: null,
      subscriptions: new Set(),
      reconnectAttempt: 0,
      latency: 0,
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  connect(token?: string): void {
    if (token) {
      this.config.token = token;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.log("Already connected");
      return;
    }

    const url = this.config.token
      ? `${this.config.url}?token=${encodeURIComponent(this.config.token)}`
      : this.config.url;

    this.log("Connecting to", url);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.log("Connected");
        this.state.connected = true;
        this.state.reconnectAttempt = 0;
        this.notifyStateChange();

        // Start heartbeat
        this.startHeartbeat();

        // Flush message queue
        this.flushMessageQueue();

        // Resubscribe to channels
        this.resubscribe();

        eventEmitter.emit("connected", { connectionId: this.state.connectionId ?? "" });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        this.log("WebSocket error", event);
        eventEmitter.emit("error", { code: "WS_ERROR", message: "WebSocket error" });
      };

      this.ws.onclose = (event) => {
        this.log("Disconnected", event.code, event.reason);
        this.state.connected = false;
        this.state.authenticated = false;
        this.stopHeartbeat();
        this.notifyStateChange();

        eventEmitter.emit("disconnected", { code: event.code, reason: event.reason });

        // Attempt reconnection
        if (this.config.reconnect && event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      this.log("Failed to connect", error);
      eventEmitter.emit("error", { code: "CONNECTION_FAILED", message: "Failed to connect" });
    }
  }

  disconnect(): void {
    this.log("Disconnecting");

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.state.connected = false;
    this.state.authenticated = false;
    this.state.connectionId = null;
    this.state.userId = null;
    this.notifyStateChange();
  }

  private scheduleReconnect(): void {
    if (this.state.reconnectAttempt >= this.config.reconnectMaxAttempts) {
      this.log("Max reconnection attempts reached");
      eventEmitter.emit("error", { code: "MAX_RECONNECT", message: "Max reconnection attempts reached" });
      return;
    }

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.state.reconnectAttempt),
      30000
    );

    this.state.reconnectAttempt++;
    this.log(`Reconnecting in ${delay}ms (attempt ${this.state.reconnectAttempt})`);

    eventEmitter.emit("reconnecting", {
      attempt: this.state.reconnectAttempt,
      maxAttempts: this.config.reconnectMaxAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.log("Received", message.type, message);

      switch (message.type) {
        case "connected":
          this.state.connectionId = message.connectionId;
          if (message.authenticated) {
            this.state.authenticated = true;
          }
          this.notifyStateChange();
          break;

        case "authenticated":
          this.state.authenticated = true;
          this.state.userId = message.userId;
          this.notifyStateChange();
          eventEmitter.emit("authenticated", { userId: message.userId });
          break;

        case "pong":
          this.state.latency = Date.now() - this.lastPingTime;
          this.notifyStateChange();
          break;

        case "ack":
          if (message.id === "subscribe" && message.success && message.channel) {
            this.state.subscriptions.add(message.channel);
            this.notifyStateChange();
            eventEmitter.emit("subscribed", { channel: message.channel });
          } else if (message.id === "unsubscribe" && message.success && message.channel) {
            this.state.subscriptions.delete(message.channel);
            this.notifyStateChange();
            eventEmitter.emit("unsubscribed", { channel: message.channel });
          }
          break;

        case "error":
          eventEmitter.emit("error", { code: message.code, message: message.message });
          break;

        // Market events
        case "price":
          eventEmitter.emit("price", message as PriceUpdate);
          break;

        case "orderbook":
          eventEmitter.emit("orderbook", message as OrderbookUpdate);
          break;

        case "orderbook_delta":
          eventEmitter.emit("orderbook_delta", message);
          break;

        case "trade":
          eventEmitter.emit("trade", message);
          break;

        // User events
        case "order":
          eventEmitter.emit("order", message as OrderUpdate);
          break;

        case "fill":
          eventEmitter.emit("fill", message as FillUpdate);
          break;

        case "portfolio":
          eventEmitter.emit("portfolio", message as PortfolioUpdate);
          break;

        // Social events
        case "chat":
          eventEmitter.emit("chat", message as ChatMessage);
          break;

        case "typing":
          eventEmitter.emit("typing", message as TypingUpdate);
          break;

        case "presence":
          eventEmitter.emit("presence", message as PresenceUpdate);
          break;

        // Other events
        case "notification":
          eventEmitter.emit("notification", message as Notification);
          break;

        case "signal":
          eventEmitter.emit("signal", message as SignalUpdate);
          break;

        case "leaderboard":
          eventEmitter.emit("leaderboard", message as LeaderboardUpdate);
          break;

        default:
          this.log("Unknown message type", message.type);
      }
    } catch (error) {
      this.log("Failed to parse message", error);
    }
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  subscribe(channel: string): void {
    this.state.subscriptions.add(channel);

    if (this.isConnected()) {
      this.send({ type: "subscribe", channel });
    }
  }

  unsubscribe(channel: string): void {
    this.state.subscriptions.delete(channel);

    if (this.isConnected()) {
      this.send({ type: "unsubscribe", channel });
    }
  }

  private resubscribe(): void {
    for (const channel of this.state.subscriptions) {
      this.send({ type: "subscribe", channel });
    }
  }

  // ==========================================================================
  // Sending
  // ==========================================================================

  send(message: WSMessage): void {
    if (!this.isConnected()) {
      // Queue message for later
      if (this.messageQueue.length < this.config.messageQueueSize) {
        this.messageQueue.push(message);
      }
      return;
    }

    try {
      this.ws!.send(JSON.stringify(message));
    } catch (error) {
      this.log("Failed to send message", error);
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.lastPingTime = Date.now();
        this.send({ type: "ping", timestamp: this.lastPingTime } as WSMessage);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ==========================================================================
  // State
  // ==========================================================================

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getState(): WebSocketClientState {
    return { ...this.state };
  }

  onStateChange(listener: (state: WebSocketClientState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyStateChange(): void {
    const state = this.getState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[WebSocket]", ...args);
    }
  }
}

// ============================================================================
// WebSocket Context
// ============================================================================

interface WebSocketContextValue {
  client: WebSocketClient | null;
  connected: boolean;
  authenticated: boolean;
  connectionId: string | null;
  userId: string | null;
  subscriptions: string[];
  latency: number;
  connect: (token?: string) => void;
  disconnect: () => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  send: (message: WSMessage) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ============================================================================
// WebSocket Provider
// ============================================================================

interface WebSocketProviderProps {
  url: string;
  token?: string;
  autoConnect?: boolean;
  children: ReactNode;
}

export function WebSocketProvider({
  url,
  token,
  autoConnect = true,
  children,
}: WebSocketProviderProps) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [state, setState] = useState<WebSocketClientState>({
    connected: false,
    authenticated: false,
    connectionId: null,
    userId: null,
    subscriptions: new Set(),
    reconnectAttempt: 0,
    latency: 0,
  });

  // Initialize client
  useEffect(() => {
    const client = new WebSocketClient({
      url,
      token,
      reconnect: true,
      debug: process.env.NODE_ENV === "development",
    });

    clientRef.current = client;

    // Subscribe to state changes
    const unsubscribe = client.onStateChange(setState);

    // Auto connect
    if (autoConnect && token) {
      client.connect();
    }

    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [url]);

  // Handle token changes
  useEffect(() => {
    if (token && clientRef.current) {
      clientRef.current.connect(token);
    }
  }, [token]);

  const connect = useCallback((newToken?: string) => {
    clientRef.current?.connect(newToken);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const subscribe = useCallback((channel: string) => {
    clientRef.current?.subscribe(channel);
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    clientRef.current?.unsubscribe(channel);
  }, []);

  const send = useCallback((message: WSMessage) => {
    clientRef.current?.send(message);
  }, []);

  const value: WebSocketContextValue = useMemo(
    () => ({
      client: clientRef.current,
      connected: state.connected,
      authenticated: state.authenticated,
      connectionId: state.connectionId,
      userId: state.userId,
      subscriptions: Array.from(state.subscriptions),
      latency: state.latency,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
      send,
    }),
    [state, connect, disconnect, subscribe, unsubscribe, send]
  );

  return (
    <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
  );
}

// ============================================================================
// Base Hook
// ============================================================================

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}

// ============================================================================
// Event Subscription Hook
// ============================================================================

export function useWebSocketEvent<K extends keyof WSEventMap>(
  event: K,
  handler: (data: WSEventMap[K]) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const unsubscribe = eventEmitter.on(event, handler);
    return unsubscribe;
  }, [event, ...deps]);
}

// ============================================================================
// Market Price Hook
// ============================================================================

export function useMarketPrice(ticker: string) {
  const { subscribe, unsubscribe, connected } = useWebSocket();
  const [price, setPrice] = useState<PriceUpdate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;

    const channel = `market:${ticker}`;
    subscribe(channel);
    setLoading(true);

    const unsubscribeEvent = eventEmitter.on("price", (update) => {
      if (update.ticker === ticker) {
        setPrice(update);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [ticker, subscribe, unsubscribe]);

  return { price, loading, connected };
}

// ============================================================================
// Orderbook Hook
// ============================================================================

export function useOrderbook(ticker: string) {
  const { subscribe, unsubscribe, connected } = useWebSocket();
  const [orderbook, setOrderbook] = useState<OrderbookUpdate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;

    const channel = `market:${ticker}`;
    subscribe(channel);
    setLoading(true);

    const unsubscribeEvent = eventEmitter.on("orderbook", (update) => {
      if (update.ticker === ticker) {
        setOrderbook(update);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [ticker, subscribe, unsubscribe]);

  return { orderbook, loading, connected };
}

// ============================================================================
// Orders Hook
// ============================================================================

export function useOrders(userId: string) {
  const { subscribe, unsubscribe, connected, authenticated } = useWebSocket();
  const [orders, setOrders] = useState<OrderUpdate[]>([]);

  useEffect(() => {
    if (!userId || !authenticated) return;

    const channel = `orders:${userId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("order", (update) => {
      setOrders((prev) => {
        const existing = prev.findIndex((o) => o.orderId === update.orderId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = update;
          return updated;
        }
        return [update, ...prev];
      });
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [userId, authenticated, subscribe, unsubscribe]);

  return { orders, connected, authenticated };
}

// ============================================================================
// Fills Hook
// ============================================================================

export function useFills(userId: string) {
  const { subscribe, unsubscribe, connected, authenticated } = useWebSocket();
  const [fills, setFills] = useState<FillUpdate[]>([]);

  useEffect(() => {
    if (!userId || !authenticated) return;

    const channel = `fills:${userId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("fill", (update) => {
      setFills((prev) => [update, ...prev]);
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [userId, authenticated, subscribe, unsubscribe]);

  return { fills, connected, authenticated };
}

// ============================================================================
// Portfolio Hook
// ============================================================================

export function usePortfolio(userId: string) {
  const { subscribe, unsubscribe, connected, authenticated } = useWebSocket();
  const [portfolio, setPortfolio] = useState<PortfolioUpdate | null>(null);

  useEffect(() => {
    if (!userId || !authenticated) return;

    const channel = `portfolio:${userId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("portfolio", (update) => {
      if (update.userId === userId) {
        setPortfolio(update);
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [userId, authenticated, subscribe, unsubscribe]);

  return { portfolio, connected, authenticated };
}

// ============================================================================
// Chat Hook
// ============================================================================

export function useChat(roomId: string) {
  const { subscribe, unsubscribe, connected, send } = useWebSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<TypingUpdate[]>([]);

  useEffect(() => {
    if (!roomId) return;

    const channel = `chat:${roomId}`;
    subscribe(channel);

    const unsubscribeChat = eventEmitter.on("chat", (message) => {
      if (message.roomId === roomId) {
        setMessages((prev) => [...prev, message]);
      }
    });

    const unsubscribeTyping = eventEmitter.on("typing", (update) => {
      if (update.roomId === roomId) {
        setTyping((prev) => {
          const existing = prev.findIndex((t) => t.userId === update.userId);
          if (update.isTyping) {
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = update;
              return updated;
            }
            return [...prev, update];
          } else {
            return prev.filter((t) => t.userId !== update.userId);
          }
        });
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeChat();
      unsubscribeTyping();
    };
  }, [roomId, subscribe, unsubscribe]);

  const sendMessage = useCallback(
    (content: string) => {
      send({
        type: "message",
        channel: `chat:${roomId}`,
        data: content,
      });
    },
    [roomId, send]
  );

  return { messages, typing, sendMessage, connected };
}

// ============================================================================
// Notifications Hook
// ============================================================================

export function useNotifications(userId: string) {
  const { subscribe, unsubscribe, connected, authenticated } = useWebSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || !authenticated) return;

    const channel = `notifications:${userId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("notification", (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      if (!notification.read) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [userId, authenticated, subscribe, unsubscribe]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, markAsRead, clearAll, connected, authenticated };
}

// ============================================================================
// Signals Hook
// ============================================================================

export function useSignals(userId: string) {
  const { subscribe, unsubscribe, connected, authenticated } = useWebSocket();
  const [signals, setSignals] = useState<SignalUpdate[]>([]);

  useEffect(() => {
    if (!userId || !authenticated) return;

    const channel = `signals:${userId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("signal", (signal) => {
      setSignals((prev) => [signal, ...prev]);
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [userId, authenticated, subscribe, unsubscribe]);

  return { signals, connected, authenticated };
}

// ============================================================================
// Leaderboard Hook
// ============================================================================

export function useLeaderboard() {
  const { subscribe, unsubscribe, connected } = useWebSocket();
  const [leaderboard, setLeaderboard] = useState<LeaderboardUpdate | null>(null);

  useEffect(() => {
    subscribe("leaderboard");

    const unsubscribeEvent = eventEmitter.on("leaderboard", (update) => {
      setLeaderboard(update);
    });

    return () => {
      unsubscribe("leaderboard");
      unsubscribeEvent();
    };
  }, [subscribe, unsubscribe]);

  return { leaderboard, connected };
}

// ============================================================================
// Presence Hook
// ============================================================================

export function usePresence(roomId: string) {
  const { subscribe, unsubscribe, connected } = useWebSocket();
  const [presence, setPresence] = useState<Map<string, PresenceUpdate>>(new Map());

  useEffect(() => {
    if (!roomId) return;

    const channel = `presence:${roomId}`;
    subscribe(channel);

    const unsubscribeEvent = eventEmitter.on("presence", (update) => {
      if (update.roomId === roomId) {
        setPresence((prev) => {
          const next = new Map(prev);
          if (update.status === "offline") {
            next.delete(update.userId);
          } else {
            next.set(update.userId, update);
          }
          return next;
        });
      }
    });

    return () => {
      unsubscribe(channel);
      unsubscribeEvent();
    };
  }, [roomId, subscribe, unsubscribe]);

  const onlineUsers = useMemo(
    () => Array.from(presence.values()).filter((p) => p.status === "online"),
    [presence]
  );

  return { presence: Array.from(presence.values()), onlineUsers, connected };
}

// ============================================================================
// Connection Status Hook
// ============================================================================

export function useConnectionStatus() {
  const { connected, authenticated, latency, connectionId } = useWebSocket();

  return {
    connected,
    authenticated,
    latency,
    connectionId,
    status: connected ? (authenticated ? "authenticated" : "connected") : "disconnected",
  };
}

// ============================================================================
// Exports
// ============================================================================

export { eventEmitter, WebSocketClient };
export type { WebSocketClientState, WebSocketContextValue };
