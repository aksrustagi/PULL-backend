/**
 * PULL Real-time Services
 * WebSocket infrastructure for live updates and real-time communication
 */

// Event Emitter
export {
  TypedEventEmitter,
  ScopedEventEmitter,
  globalEventEmitter,
  createEventEmitter,
  createChannelEmitter,
} from "./event-emitter";

// WebSocket Manager
export {
  WebSocketManager,
  getWebSocketManager,
  createWebSocketManager,
  type WebSocketManagerConfig,
} from "./manager";

// Kalshi Bridge
export {
  KalshiBridge,
  createKalshiBridge,
  type KalshiBridgeConfig,
} from "./kalshi-bridge";
