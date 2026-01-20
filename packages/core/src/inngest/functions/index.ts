/**
 * Inngest Functions Index
 *
 * Exports all Inngest functions for registration with the Inngest serve handler.
 */

// Email functions
export { syncUserEmails, triageEmail, emailFunctions } from "./email";

// Market data functions
export {
  syncKalshiMarkets,
  syncPokemonPrices,
  marketDataFunctions,
} from "./market-data";

// Rewards functions
export {
  processPointsEarning,
  checkStreaks,
  rewardsFunctions,
} from "./rewards";

// Notification functions
export {
  sendNotification,
  digestEmail,
  notificationFunctions,
} from "./notifications";

// Compliance functions
export { periodicKYCCheck, complianceFunctions } from "./compliance";

// =============================================================================
// All Functions (for Inngest serve handler)
// =============================================================================

import { emailFunctions } from "./email";
import { marketDataFunctions } from "./market-data";
import { rewardsFunctions } from "./rewards";
import { notificationFunctions } from "./notifications";
import { complianceFunctions } from "./compliance";

/**
 * All Inngest functions combined for easy registration.
 *
 * Usage:
 * ```typescript
 * import { serve } from "inngest/next";
 * import { inngest, allFunctions } from "@pull/core/inngest";
 *
 * export const { GET, POST, PUT } = serve({
 *   client: inngest,
 *   functions: allFunctions,
 * });
 * ```
 */
export const allFunctions = [
  ...emailFunctions,
  ...marketDataFunctions,
  ...rewardsFunctions,
  ...notificationFunctions,
  ...complianceFunctions,
];
