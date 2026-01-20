/**
 * Inngest - Event-driven background jobs for PULL
 */

export { inngest } from "./client";
export type { SignalEvents } from "./client";

export {
  detectEmailSignals,
  detectMarketAnomalies,
  aggregateSocialSentiment,
  calculateCorrelations,
  generateDailyInsights,
  signalFunctions,
} from "./functions/signals";
