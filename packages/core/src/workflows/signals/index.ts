/**
 * Signals Module
 * AI-powered signal detection workflows and activities
 */

// Export workflows
export {
  detectEmailSignalsWorkflow,
  type DetectEmailSignalsInput,
  type DetectEmailSignalsStatus,
} from "./detect-email-signals.workflow";

export {
  correlateNewsToMarketsWorkflow,
  type CorrelateNewsInput,
  type CorrelateNewsStatus,
} from "./correlate-news-markets.workflow";

export {
  detectUnusualActivityWorkflow,
  type DetectUnusualActivityStatus,
} from "./detect-unusual-activity.workflow";

export {
  generateDailyInsightsWorkflow,
  type DailyInsightsStatus,
} from "./generate-daily-insights.workflow";

// Export activities
export * from "./activities";
