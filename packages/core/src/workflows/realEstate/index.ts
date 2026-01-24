/**
 * Real Estate Prediction Market Workflows
 *
 * Exports all workflows and activities for real estate prediction markets
 */

// Activities
export * from "./activities";

// Workflows
export {
  marketResolutionWorkflow,
  getResolutionStatusQuery,
  type MarketResolutionInput,
  type ResolutionStatus,
} from "./market-resolution.workflow";

export {
  dailyUpdateWorkflow,
  getDailyUpdateStatusQuery,
  type DailyUpdateInput,
  type DailyUpdateStatus,
} from "./daily-update.workflow";

export {
  referralEarningsWorkflow,
  batchReferralEarningsWorkflow,
  getReferralEarningsStatusQuery,
  getBatchEarningsStatusQuery,
  type ReferralEarningsInput,
  type ReferralEarningsStatus,
  type BatchEarningsInput,
  type BatchEarningsStatus,
} from "./referral-earnings.workflow";

// Task queue name
export const REAL_ESTATE_TASK_QUEUE = "pull-real-estate";

// Workflow IDs
export const WORKFLOW_IDS = {
  MARKET_RESOLUTION: (eventId: string) => `re-resolution-${eventId}`,
  DAILY_UPDATE: "re-daily-update",
  REFERRAL_EARNINGS: (agentId: string) => `re-referral-earnings-${agentId}`,
  BATCH_EARNINGS: "re-batch-earnings",
};
