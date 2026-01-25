/**
 * WebSocket Service - Real-time Price Updates
 * Manages WebSocket connection for live market data
 */

import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// ============================================================================
// Types
// ============================================================================

export interface PriceUpdate {
  marketId: string;
  outcomeId: string;
  price: number;
  volume: number;
  timestamp: number;
}

export interface MarketUpdate {
  type: "price" | "status" | "volume" | "trade";
  marketId: string;
  data: any;
  timestamp: number;
}

export interface TradeUpdate {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  userId?: string;
  timestamp: number;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
}

type MessageHandler = (data: any) => void;
type ConnectionHandler = (state: ConnectionState) => void;

// ============================================================================
// Configuration
// ============================================================================

const WS_URL = Constants.expoConfig?.extra?.wsUrl || "ws://localhost:3001";
const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000]; // Exponential backoff
const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 10000; // 10 seconds

// ============================================================================
// WebSocket Client Class
// ============================================================================

class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;

  private subscriptions: Map<string, Set<string>> = new Map(); // channel -> Set of marketIds
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();

  private state: ConnectionState = {
    isConnected: false,
    isConnecting: false,
    lastConnectedAt: null,
    reconnectAttempts: 0,
  };

  constructor(url: string = WS_URL) {
    this.url = url;
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log("[WS] Already connected");
      return;
    }

    if (this.state.isConnecting) {
      console.log("[WS] Connection in progress");
      return;
    }

    this.updateState({ isConnecting: true });

    try {
      const token = await SecureStore.getItemAsync("accessToken");

      // Build URL with auth token
      const wsUrl = token ? `${this.url}?token=${token}` : this.url;

      console.log("[WS] Connecting to:", this.url);

      this.socket = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error("[WS] Connection error:", error);
      this.handleDisconnect();
    }
  }

  disconnect(): void {
    console.log("[WS] Disconnecting");
    this.clearTimers();

    if (this.socket) {
      this.socket.onclose = null; // Prevent reconnection
      this.socket.close();
      this.socket = null;
    }

    this.updateState({
      isConnected: false,
      isConnecting: false,
    });
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log("[WS] Connected");
      this.reconnectAttempt = 0;

      this.updateState({
        isConnected: true,
        isConnecting: false,
        lastConnectedAt: Date.now(),
        reconnectAttempts: 0,
      });

      // Resubscribe to all channels
      this.resubscribeAll();

      // Start ping/pong heartbeat
      this.startHeartbeat();
    };

    this.socket.onclose = (event) => {
      console.log("[WS] Disconnected:", event.code, event.reason);
      this.handleDisconnect();
    };

    this.socket.onerror = (error) => {
      console.error("[WS] Error:", error);
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  private handleDisconnect(): void {
    this.clearTimers();

    this.updateState({
      isConnected: false,
      isConnecting: false,
    });

    // Schedule reconnection
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay =
      RECONNECT_INTERVALS[
        Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)
      ];

    console.log(
      `[WS] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempt + 1})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.updateState({ reconnectAttempts: this.reconnectAttempt });
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL);
  }

  private sendPing(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.send({ type: "ping", timestamp: Date.now() });

    // Set timeout for pong response
    this.pongTimer = setTimeout(() => {
      console.log("[WS] Pong timeout, reconnecting");
      this.socket?.close();
    }, PONG_TIMEOUT);
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle pong response
      if (message.type === "pong") {
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        return;
      }

      // Route message to handlers
      const channel = message.channel || message.type;
      const handlers = this.messageHandlers.get(channel);

      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error("[WS] Handler error:", error);
          }
        });
      }

      // Also notify "all" handlers
      const allHandlers = this.messageHandlers.get("*");
      if (allHandlers) {
        allHandlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error("[WS] Handler error:", error);
          }
        });
      }
    } catch (error) {
      console.error("[WS] Failed to parse message:", error);
    }
  }

  private send(data: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  subscribe(channel: string, marketIds: string[] = []): void {
    // Track subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }

    const channelSubs = this.subscriptions.get(channel)!;
    marketIds.forEach((id) => channelSubs.add(id));

    // Send subscription message
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({
        type: "subscribe",
        channel,
        marketIds,
      });
    }
  }

  unsubscribe(channel: string, marketIds: string[] = []): void {
    const channelSubs = this.subscriptions.get(channel);
    if (channelSubs) {
      if (marketIds.length === 0) {
        this.subscriptions.delete(channel);
      } else {
        marketIds.forEach((id) => channelSubs.delete(id));
      }
    }

    // Send unsubscription message
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({
        type: "unsubscribe",
        channel,
        marketIds,
      });
    }
  }

  private resubscribeAll(): void {
    this.subscriptions.forEach((marketIds, channel) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({
          type: "subscribe",
          channel,
          marketIds: Array.from(marketIds),
        });
      }
    });
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  on(channel: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }

    this.messageHandlers.get(channel)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(channel);
        }
      }
    };
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);

    // Immediately call with current state
    handler(this.state);

    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.connectionHandlers.forEach((handler) => {
      try {
        handler(this.state);
      } catch (error) {
        console.error("[WS] Connection handler error:", error);
      }
    });
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  subscribeToMarket(marketId: string): () => void {
    this.subscribe("market", [marketId]);
    return () => this.unsubscribe("market", [marketId]);
  }

  subscribeToMarkets(marketIds: string[]): () => void {
    this.subscribe("market", marketIds);
    return () => this.unsubscribe("market", marketIds);
  }

  subscribeToPrices(marketIds: string[]): () => void {
    this.subscribe("prices", marketIds);
    return () => this.unsubscribe("prices", marketIds);
  }

  subscribeToTrades(marketIds: string[]): () => void {
    this.subscribe("trades", marketIds);
    return () => this.unsubscribe("trades", marketIds);
  }

  subscribeToUserActivity(): () => void {
    this.subscribe("user");
    return () => this.unsubscribe("user");
  }

  // ==========================================================================
  // State Accessors
  // ==========================================================================

  get isConnected(): boolean {
    return this.state.isConnected;
  }

  getState(): ConnectionState {
    return { ...this.state };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const websocket = new WebSocketClient();

// ============================================================================
// React Hooks
// ============================================================================

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Hook to manage WebSocket connection state
 */
export function useWebSocketConnection() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    websocket.getState()
  );

  useEffect(() => {
    const unsubscribe = websocket.onConnectionChange(setConnectionState);
    return unsubscribe;
  }, []);

  const connect = useCallback(() => {
    websocket.connect();
  }, []);

  const disconnect = useCallback(() => {
    websocket.disconnect();
  }, []);

  return {
    ...connectionState,
    connect,
    disconnect,
  };
}

/**
 * Hook to subscribe to market price updates
 */
export function useMarketPrices(marketIds: string[]) {
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());

  useEffect(() => {
    if (marketIds.length === 0) return;

    // Subscribe to price updates
    const unsubscribePrices = websocket.subscribeToPrices(marketIds);

    // Handle price updates
    const unsubscribeHandler = websocket.on("prices", (message) => {
      if (message.type === "price_update" && message.data) {
        setPrices((prev) => {
          const next = new Map(prev);
          next.set(message.data.marketId, message.data);
          return next;
        });
      }
    });

    // Connect if not already connected
    websocket.connect();

    return () => {
      unsubscribePrices();
      unsubscribeHandler();
    };
  }, [marketIds.join(",")]);

  return prices;
}

/**
 * Hook to subscribe to a single market's updates
 */
export function useMarketUpdates(marketId: string) {
  const [lastUpdate, setLastUpdate] = useState<MarketUpdate | null>(null);
  const [trades, setTrades] = useState<TradeUpdate[]>([]);

  useEffect(() => {
    if (!marketId) return;

    // Subscribe to market updates
    const unsubscribeMarket = websocket.subscribeToMarket(marketId);

    // Handle market updates
    const unsubscribeHandler = websocket.on("market", (message) => {
      if (message.marketId === marketId) {
        setLastUpdate(message);

        if (message.type === "trade" && message.data) {
          setTrades((prev) => [message.data, ...prev].slice(0, 50));
        }
      }
    });

    // Connect if not already connected
    websocket.connect();

    return () => {
      unsubscribeMarket();
      unsubscribeHandler();
    };
  }, [marketId]);

  return { lastUpdate, trades };
}

/**
 * Hook to subscribe to user-specific updates
 */
export function useUserUpdates() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [positionUpdates, setPositionUpdates] = useState<any[]>([]);

  useEffect(() => {
    // Subscribe to user updates
    const unsubscribeUser = websocket.subscribeToUserActivity();

    // Handle user updates
    const unsubscribeHandler = websocket.on("user", (message) => {
      if (message.type === "notification") {
        setNotifications((prev) => [message.data, ...prev].slice(0, 100));
      } else if (message.type === "position_update") {
        setPositionUpdates((prev) => [message.data, ...prev].slice(0, 50));
      }
    });

    // Connect if not already connected
    websocket.connect();

    return () => {
      unsubscribeUser();
      unsubscribeHandler();
    };
  }, []);

  return { notifications, positionUpdates };
}

export default websocket;
