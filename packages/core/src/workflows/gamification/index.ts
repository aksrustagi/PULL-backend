/**
 * Gamification Workflows Index
 * Export all gamification workflows and activities
 */

// Workflows
export { processPointsEarningWorkflow } from "./process-points.workflow";
export type { ProcessPointsInput, ProcessPointsStatus } from "./process-points.workflow";

export { dailyResetWorkflow } from "./daily-reset.workflow";
export type { DailyResetStatus } from "./daily-reset.workflow";

export { weeklyResetWorkflow } from "./weekly-reset.workflow";
export type { WeeklyResetStatus } from "./weekly-reset.workflow";

export { monthlyDecayWorkflow } from "./monthly-decay.workflow";
export type { MonthlyDecayStatus } from "./monthly-decay.workflow";

export {
  checkAchievementsWorkflow,
  batchCheckAchievementsWorkflow,
} from "./check-achievements.workflow";
export type {
  CheckAchievementsInput,
  CheckAchievementsResult,
  BatchCheckAchievementsInput,
  BatchCheckAchievementsResult,
} from "./check-achievements.workflow";

// Activities (re-export for worker registration)
export * as gamificationActivities from "./activities";
