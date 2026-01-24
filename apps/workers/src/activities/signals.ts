/**
 * Signal Detection Activities
 * Re-export from core workflows for worker registration
 */

export {
  // Claude AI activities
  extractEmailSignals,
  correlateNewsToMarkets,
  analyzeUnusualActivity,
  classifyTraderBehavior,
  aggregateSentiment,
  calculateMarketCorrelation,
  explainCorrelation,
  generateDailyInsight,
  // Data fetching activities
  fetchActiveMarkets,
  fetchMarketHistory,
  fetchRecentTrades,
  fetchUserPositions,
  fetchRecentSignalsForUser,
  fetchActiveUsers,
  fetchCorrelationPairs,
  // Storage activities
  storeSignal,
  storeUserInsight,
  storeCorrelation,
  updateCorrelation,
  expireOldSignals,
  // Notification activities
  sendSignalAlert,
  sendInsightNotification,
  // Audit activities
  recordSignalAuditLog,
} from "@pull/core/workflows/signals";
