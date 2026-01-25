/**
 * External Service Integrations
 *
 * This module exports all external service clients used by the PULL platform:
 *
 * - Kalshi: Prediction market trading
 * - Massive: Crypto/RWA order execution
 * - Resend: Transactional email
 * - Persona: KYC/Identity verification
 * - Nylas: Email integration
 * - Plaid: Banking/ACH integration
 * - Fireblocks: Digital asset custody
 */

// Trading Services
export { KalshiClient, type KalshiClientConfig } from "./kalshi/client";
export { KalshiWebSocket, type KalshiWebSocketConfig } from "./kalshi/websocket";
export * as kalshiTypes from "./kalshi/types";

export { MassiveClient, createMassiveClient, massiveClient, type MassiveClientConfig } from "./massive/client";
export * as massiveTypes from "./massive/types";

// Communication Services
export { ResendClient, createResendClient, resendClient, type ResendClientConfig } from "./resend/client";
export * as resendTypes from "./resend/types";

export { NylasClient, type NylasClientConfig } from "./nylas/client";
export * as nylasTypes from "./nylas/types";

// Identity & Compliance Services
export { PersonaClient, type PersonaClientConfig } from "./persona/client";
export * as personaTypes from "./persona/types";

// Banking & Custody Services
export { PlaidClient, type PlaidClientConfig } from "./plaid/client";
export * as plaidTypes from "./plaid/types";

export { FireblocksClient, type FireblocksClientConfig } from "./fireblocks/client";
export * as fireblocksTypes from "./fireblocks/types";

// Re-export individual services for convenient access
export * as kalshi from "./kalshi";
export * as massive from "./massive";
export * as resend from "./resend";
export * as nylas from "./nylas";
export * as persona from "./persona";
export * as plaid from "./plaid";
export * as fireblocks from "./fireblocks";

// Feature Flags
export * as featureFlags from "./feature-flags";
export {
  initializeFeatureFlags,
  getFeatureFlagClient,
  createFeatureFlagClient,
  isFeatureEnabled,
  getAllFeatureFlags,
  FeatureFlagClient,
  featureFlagMiddleware,
  getFeatureFlags,
  isEnabled,
  getFlag,
  requireFeature,
  checkMaintenanceMode,
  requireBetaAccess,
  FEATURE_FLAGS,
  getAllFlagKeys,
  getDefaultValue,
} from "./feature-flags";

export type {
  FeatureFlagName,
  FeatureFlagValue,
  FeatureFlagContext,
  FeatureFlagClientConfig,
  FeatureFlagMiddlewareContext,
} from "./feature-flags";

// Convenience type exports
export type {
  Market as KalshiMarket,
  Order as KalshiOrder,
  Position as KalshiPosition,
  Event as KalshiEvent,
} from "./kalshi/types";

export type {
  MassiveOrder,
  MassiveOrderRequest,
  MassivePosition,
  MassiveFill,
  RWAAsset,
  RWATransfer,
} from "./massive/types";

export type {
  SendEmailParams,
  SendEmailResponse,
  Email,
  EmailTag,
} from "./resend/types";

export type {
  Inquiry as PersonaInquiry,
  Verification as PersonaVerification,
  InquiryStatus as PersonaInquiryStatus,
} from "./persona/types";

export type {
  Message as NylasMessage,
  Thread as NylasThread,
  Grant as NylasGrant,
  Contact as NylasContact,
} from "./nylas/types";
