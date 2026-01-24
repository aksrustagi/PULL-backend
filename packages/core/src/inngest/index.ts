/**
 * Inngest Module
 *
 * Event-driven functions for PULL application.
 * Provides background jobs, scheduled tasks, and event processing.
 */

// =============================================================================
// Client & Configuration
// =============================================================================

export {
  inngest,
  sendEvent,
  sendEvents,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
  InngestFunctionError,
  NonRetryableError,
} from "./client";

export type { InngestConfig, Logger, DeadLetterEvent } from "./client";

// =============================================================================
// Events
// =============================================================================

export {
  EVENT_NAMES,
  createEvent,
  validateEventPayload,
  // Payload schemas
  emailSyncRequestedPayloadSchema,
  emailReceivedPayloadSchema,
  rewardsActionCompletedPayloadSchema,
  notificationSendPayloadSchema,
  marketDataUpdatedPayloadSchema,
  newMarketDetectedPayloadSchema,
  rwaPriceAlertPayloadSchema,
  kycExpiringPayloadSchema,
  watchlistMatchPayloadSchema,
  tradingSignalDetectedPayloadSchema,
} from "./events";

export type {
  InngestEvents,
  EventName,
  // Payload types
  EmailSyncRequestedPayload,
  EmailReceivedPayload,
  RewardsActionCompletedPayload,
  NotificationSendPayload,
  MarketDataUpdatedPayload,
  NewMarketDetectedPayload,
  RwaPriceAlertPayload,
  KycExpiringPayload,
  WatchlistMatchPayload,
  TradingSignalDetectedPayload,
} from "./events";

// =============================================================================
// Functions
// =============================================================================

export {
  // All functions combined
  allFunctions,
  // Email
  syncUserEmails,
  triageEmail,
  emailFunctions,
  // Market data
  syncKalshiMarkets,
  syncPokemonPrices,
  marketDataFunctions,
  // Rewards
  processPointsEarning,
  checkStreaks,
  rewardsFunctions,
  // Notifications
  sendNotification,
  digestEmail,
  notificationFunctions,
  // Compliance
  periodicKYCCheck,
  complianceFunctions,
} from "./functions";
