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
 * - Logger: Structured logging
 * - Metrics: Prometheus metrics
 * - Tracing: Distributed tracing
 */

// Observability Services
export * as logger from "./logger";
export {
  createLogger,
  getLogger,
  initLogger,
  getDefaultLoggerConfig,
  generateCorrelationId,
  withCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
  createLoggingMiddleware,
  createLoggerContextMiddleware,
  createErrorLoggingMiddleware,
  createRequestLogger,
  getRequestLogger,
  withTiming,
  withDatabaseTiming,
  withExternalServiceTiming,
  DEFAULT_REDACT_FIELDS,
} from "./logger";

export type {
  Logger,
  LogLevel,
  LogContext,
  LoggerConfig,
  LogEntry,
  ErrorContext,
  HttpRequestContext,
  HttpResponseContext,
  PerformanceContext,
  DatabaseContext,
  ExternalServiceContext,
  LoggingMiddlewareOptions,
} from "./logger";

export * as metrics from "./metrics";
export {
  getRegistry,
  createRegistry,
  resetRegistry,
  createHttpMetrics,
  createAppMetrics,
  createBusinessMetrics,
  createMetricsMiddleware,
  createMetricsHandler,
  getHttpMetrics,
  getAppMetrics,
  getBusinessMetrics,
  updateUptimeMetric,
  startUptimeUpdates,
  recordUserRegistration,
  recordUserLogin,
  recordTradeExecution,
  recordKycVerification,
  recordApiCall,
  DEFAULT_HTTP_DURATION_BUCKETS,
  DEFAULT_SIZE_BUCKETS,
  DEFAULT_PATH_NORMALIZERS,
} from "./metrics";

export type {
  MetricType,
  Labels,
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricConfig,
  MetricsRegistry,
  MetricValue,
  HttpMetricsConfig,
  HttpMetrics,
  AppMetrics,
  BusinessMetrics,
} from "./metrics";

export * as tracing from "./tracing";
export {
  initTracerProvider,
  getTracer,
  getTracerConfig,
  getCurrentContext,
  getActiveSpan,
  parseTraceparent,
  createTraceparent,
  extractTraceContext,
  injectTraceContext,
  withContext,
  withContextAsync,
  flushSpans,
  shutdownTracer,
  stopBatchExport,
  createHttpServerSpan,
  createHttpClientSpan,
  createDatabaseSpan,
  createRpcSpan,
  createInternalSpan,
  withSpan,
  withSpanSync,
  tracedFetch,
  traceDatabase,
  traceExternalService,
  addSpanAttributes,
  addSpanEvent,
  recordSpanException,
  setSpanError,
  setSpanOk,
  getCurrentTraceId,
  getCurrentSpanId,
  createTracingMiddleware,
  getSpanFromContext,
  getTraceIdFromContext,
  Traced,
  SpanKind,
  SpanStatusCode,
  HTTP_ATTRIBUTES,
  DB_ATTRIBUTES,
  RPC_ATTRIBUTES,
  GENERAL_ATTRIBUTES,
} from "./tracing";

export type {
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  SpanAttributes,
  SpanAttributeValue,
  SpanEvent,
  SpanLink,
  Tracer,
  TracerProviderConfig,
  TracingContext,
  TraceContextHeaders,
} from "./tracing";

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

// Payment Services
export {
  StripeClient,
  createStripeClient,
  getStripeClient,
  CheckoutService,
  createCheckoutService,
  getCheckoutService,
  createDepositSession,
  getCheckoutSession,
  calculateDepositFee,
  StripeWebhookHandler,
  createWebhookHandler,
  getWebhookHandler,
  initializeWebhookHandler,
  PayoutService,
  createPayoutService,
  getPayoutService,
  createConnectedAccount,
  processWithdrawal,
  createOnboardingLink,
  StripeServiceError,
} from "./stripe";

export * as stripeTypes from "./stripe/types";

export type {
  StripeClientConfig,
  PaymentMethod,
  CreateCheckoutSessionParams,
  CheckoutSession,
  PaymentIntent,
  StripeCustomer,
  StripePaymentMethod,
  SetupIntent,
  Payout,
  ConnectedAccount,
  AccountLink,
  Transfer,
  FeeStructure,
  FeeCalculation,
  DepositCompletedEvent,
  DepositFailedEvent,
  PayoutPaidEvent,
  PayoutFailedEvent,
  WithdrawalRequest,
  WithdrawalResult,
} from "./stripe";

// Redis Services
export * as redis from "./redis";
export {
  RedisClient,
  RedisPubSub,
  getRedisPubSub,
  initRedisPubSub,
} from "./redis";

export type {
  RedisClientConfig,
  CacheOptions,
  LeaderboardEntry,
  RateLimitConfig,
  RateLimitResult,
  Session,
  PubSubMessage,
  MessageHandler,
  PriceUpdate,
  OrderbookUpdate,
  TradeUpdate,
  MarketStatusUpdate,
} from "./redis";

// Odds API Services
export * as oddsApi from "./odds-api";
export {
  OddsApiClient,
  getOddsApiClient,
  initOddsApiClient,
  OddsPoller,
  getOddsPoller,
  initOddsPoller,
} from "./odds-api";

export type {
  OddsApiClientConfig,
  SportKey,
  MarketKey,
  Event as OddsEvent,
  OddsUpdate,
  NormalizedMarket,
  NormalizedOutcome,
  PollingConfig,
  OddsChange,
} from "./odds-api";

// Re-export individual services for convenient access
export * as kalshi from "./kalshi";
export * as massive from "./massive";
export * as resend from "./resend";
export * as nylas from "./nylas";
export * as persona from "./persona";
export * as plaid from "./plaid";
export * as fireblocks from "./fireblocks";
export * as stripe from "./stripe";

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

// ============================================================================
// 10x Feature Enhancement Services
// ============================================================================

// Presence & Real-time
export { presenceService, PresenceService } from "./presence/client";
export * as presenceTypes from "./presence/types";

// AI Trade Advisor
export { aiTradeAdvisorService, AITradeAdvisorService } from "./ai-trade-advisor/client";
export * as aiTradeAdvisorTypes from "./ai-trade-advisor/types";

// Voice
export { voiceService, VoiceService } from "./voice/client";
export * as voiceTypes from "./voice/types";

// Vision
export { visionService, VisionService } from "./vision/client";
export * as visionTypes from "./vision/types";

// Injury Prediction
export { injuryPredictionService, InjuryPredictionService } from "./injury-prediction/client";
export * as injuryPredictionTypes from "./injury-prediction/types";

// Social Graph
export { socialGraphService, SocialGraphService } from "./social-graph/client";
export * as socialGraphTypes from "./social-graph/types";

// Finance
export { financeService, FinanceService } from "./finance/client";
export * as financeTypes from "./finance/types";

// Engagement
export { engagementService, EngagementService } from "./engagement/client";
export * as engagementTypes from "./engagement/types";

// Compliance
export { complianceService, ComplianceService } from "./compliance/client";
export * as complianceTypes from "./compliance/types";

// Second Screen
export { secondScreenService, SecondScreenService } from "./second-screen/client";
export * as secondScreenTypes from "./second-screen/types";

// Advanced Analytics
export { advancedAnalyticsService, AdvancedAnalyticsService } from "./analytics/advanced/client";
export * as advancedAnalyticsTypes from "./analytics/advanced/types";
