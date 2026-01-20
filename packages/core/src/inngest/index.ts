/**
 * Inngest Module
 * Event-driven function orchestration for PULL
 */

// Client and utilities
export {
  inngest,
  sendEvent,
  sendEvents,
  DEFAULT_RETRY_CONFIG,
  CRITICAL_RETRY_CONFIG,
  LIGHT_RETRY_CONFIG,
  CRON_SCHEDULES,
  CONCURRENCY_LIMITS,
  RATE_LIMITS,
  getFunctionId,
  handleDeadLetter,
} from "./client";

// Event types
export type {
  PullEvent,
  PullEventName,
  EventDataByName,
  EmailSyncRequested,
  EmailReceived,
  EmailTriaged,
  OrderPlaced,
  OrderFilled,
  OrderCancelled,
  PriceAlertTriggered,
  MarketSettled,
  RWAPriceUpdated,
  RWAPurchaseInitiated,
  RewardsActionCompleted,
  RewardsPointsCredited,
  RewardsTierUpgraded,
  RewardsRedemptionRequested,
  NotificationSend,
  NotificationDelivered,
  UserCreated,
  UserKYCUpdated,
  UserTierChanged,
  ComplianceKYCSubmitted,
  ComplianceKYCApproved,
  ComplianceKYCRejected,
  ComplianceReviewRequired,
  ComplianceReviewCompleted,
  SystemHealthCheck,
  SystemJobCompleted,
} from "./events";

// All functions
export {
  allFunctions,
  functionSummary,
  // Email
  syncUserEmails,
  triageEmail,
  generateSmartReplies,
  emailFunctions,
  // Market Data
  syncKalshiMarkets,
  syncPokemonPrices,
  checkMarketSettlements,
  checkPriceAlerts,
  marketDataFunctions,
  // Rewards
  processPointsEarning,
  checkStreaks,
  processRedemption,
  rewardsFunctions,
  // Notifications
  sendNotification,
  digestEmail,
  weeklySummary,
  batchNotification,
  notificationFunctions,
  // Compliance
  periodicKYCCheck,
  processKYCVerification,
  processComplianceReview,
  monitorTransaction,
  complianceFunctions,
} from "./functions";
