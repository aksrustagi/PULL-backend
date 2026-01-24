/**
 * Workflow Index
 * Aggregates all workflow exports for Temporal worker registration
 */

// KYC Workflows
export {
  kycOnboardingWorkflow,
  emailVerifiedSignal,
  personaCompletedSignal,
  checkrCompletedSignal,
} from "./kyc";

// Trading Workflows
export {
  orderExecutionWorkflow,
  cancelOrderSignal,
} from "./trading";

// Rewards Workflows
export {
  tradePointsWorkflow,
  referralBonusWorkflow,
  dailyStreakWorkflow,
  redemptionFulfillmentWorkflow,
  pointsExpirationWorkflow,
} from "./rewards";

// Email Workflows
export {
  emailSyncWorkflow,
  getSyncStatusQuery,
  emailTriageWorkflow,
  getTriageStatusQuery,
  smartReplyWorkflow,
  getSmartReplyStatusQuery,
} from "./email";

// Messaging Workflows
export {
  roomCreationWorkflow,
  getRoomCreationStatusQuery,
  bridgeMessageWorkflow,
  getBridgeMessageStatusQuery,
} from "./messaging";

// RWA Workflows
export {
  assetListingWorkflow,
  getAssetListingStatusQuery,
  rwaPurchaseWorkflow,
  getRWAPurchaseStatusQuery,
  purchaseCancelledSignal,
  priceUpdateWorkflow,
  getPriceUpdateStatusQuery,
} from "./rwa";

// Social Trading Workflows
export {
  calculateTraderStatsWorkflow,
  batchCalculateTraderStatsWorkflow,
  updateLeaderboardWorkflow,
  updateAllLeaderboardsWorkflow,
  dailyStatsCalculationWorkflow,
  weeklyLeaderboardUpdateWorkflow,
} from "./social";

// Re-export types for convenience
export type {
  EmailSyncInput,
  EmailSyncStatus,
  EmailTriageInput,
  TriageResult,
  TriageStatus,
  SmartReplyInput,
  ReplySuggestion,
  SmartReplyStatus,
} from "./email";

export type {
  RoomCreationInput,
  RoomCreationStatus,
  BridgeMessageInput,
  BridgeMessageStatus,
} from "./messaging";

export type {
  AssetListingInput,
  AssetListingStatus,
  RWAPurchaseInput,
  RWAPurchaseStatus,
  PriceUpdateStatus,
} from "./rwa";

export type {
  TraderStatsCalculationInput,
  BatchStatsCalculationInput,
  LeaderboardUpdateInput,
  UpdateAllLeaderboardsInput,
} from "./social";
