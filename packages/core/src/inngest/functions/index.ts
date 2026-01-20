/**
 * Inngest Functions Index
 * Export all functions for registration with Inngest serve
 */

// Email functions
export { syncUserEmails, triageEmail, generateSmartReplies, emailFunctions } from "./email";

// Market data functions
export {
  syncKalshiMarkets,
  syncPokemonPrices,
  checkMarketSettlements,
  checkPriceAlerts,
  marketDataFunctions,
} from "./market-data";

// Rewards functions
export {
  processPointsEarning,
  checkStreaks,
  processRedemption,
  rewardsFunctions,
} from "./rewards";

// Notification functions
export {
  sendNotification,
  digestEmail,
  weeklySummary,
  batchNotification,
  notificationFunctions,
} from "./notifications";

// Compliance functions
export {
  periodicKYCCheck,
  processKYCVerification,
  processComplianceReview,
  monitorTransaction,
  complianceFunctions,
} from "./compliance";

// ============================================================================
// All Functions Array
// ============================================================================

import { emailFunctions } from "./email";
import { marketDataFunctions } from "./market-data";
import { rewardsFunctions } from "./rewards";
import { notificationFunctions } from "./notifications";
import { complianceFunctions } from "./compliance";

/**
 * All Inngest functions for registration
 * Use this with inngest.serve()
 */
export const allFunctions = [
  ...emailFunctions,
  ...marketDataFunctions,
  ...rewardsFunctions,
  ...notificationFunctions,
  ...complianceFunctions,
];

/**
 * Function count summary
 */
export const functionSummary = {
  email: emailFunctions.length,
  marketData: marketDataFunctions.length,
  rewards: rewardsFunctions.length,
  notifications: notificationFunctions.length,
  compliance: complianceFunctions.length,
  total: allFunctions.length,
};
