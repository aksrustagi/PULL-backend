/**
 * Social Trading Workflows
 * Export all social trading workflows and activities
 */

// Workflows
export {
  calculateTraderStatsWorkflow,
  getStatsCalculationStatus,
  type CalculateStatsInput,
  type CalculateStatsStatus,
} from "./calculate-stats.workflow";

export {
  copyTradeWorkflow,
  getCopyTradeStatus,
  type CopyTradeInput,
  type CopyTradeResult,
  type CopyTradeStatus,
} from "./copy-trade.workflow";

export {
  detectFraudWorkflow,
  getFraudDetectionStatus,
  type DetectFraudInput,
  type FraudDetection,
  type DetectFraudStatus,
} from "./detect-fraud.workflow";

// Activities (for worker registration)
export * as socialActivities from "./activities";
