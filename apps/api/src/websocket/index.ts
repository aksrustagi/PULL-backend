/**
 * WebSocket Module
 * Real-time data feeds via WebSocket
 */

export {
  WebSocketServer,
  getWebSocketServer,
  initWebSocketServer,
  type WebSocketData,
  type WebSocketServerConfig,
  type WebSocketServerStats,
} from "./server";

export {
  BroadcastManager,
  getBroadcastManager,
  initBroadcastManager,
  type BroadcastMessage,
  type SubscriptionInfo,
  type ClientStats,
} from "./broadcast";

export {
  handleMessage,
  registerHandler,
  sendResponse,
  sendError,
  broadcastToChannel,
  broadcastToUser,
  type IncomingMessage,
  type OutgoingMessage,
  type MessageHandler,
} from "./handlers";

export {
  authenticateWebSocket,
  authenticateFromQuery,
  authenticateFromProtocol,
  canSubscribeToChannel,
  canSubscribeToMarket,
  canAddSubscription,
  validateToken,
  type WebSocketAuthResult,
  type WebSocketPermissions,
  type AuthenticatedUser,
} from "./auth";
