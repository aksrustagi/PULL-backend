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

// Circuit Breaker
export * as circuitBreaker from "./circuit-breaker";
export {
  CircuitBreaker,
  getCircuitBreaker,
  createCircuitBreaker,
  getHealthStatus as getCircuitBreakerHealthStatus,
  resetAll as resetAllCircuitBreakers,
  resetService as resetServiceCircuitBreaker,
  removeCircuitBreaker,
  getRegisteredServices as getCircuitBreakerServices,
  getServiceDefaults as getCircuitBreakerDefaults,
  getAllServiceDefaults as getAllCircuitBreakerDefaults,
  initializeAll as initializeAllCircuitBreakers,
  destroyAll as destroyAllCircuitBreakers,
  checkAllHealth as checkAllCircuitBreakerHealth,
  setGlobalCallbacks as setCircuitBreakerCallbacks,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
} from "./circuit-breaker";

export type {
  ExternalService,
  CircuitBreakerConfig,
  CircuitBreakerCallbacks,
  CircuitBreakerMetrics,
  CircuitBreakerExecuteOptions,
  CircuitBreakerHealth,
  CircuitBreakerRegistryHealth,
  ServiceCircuitBreakerDefaults,
} from "./circuit-breaker";

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

// PostHog Product Analytics
export * as posthog from "./posthog";
export {
  PostHogClient,
  initPostHog,
  createPostHogClient,
  getPostHogClient,
  createPostHogMiddleware,
  getPostHogContext,
  getPostHogContextSafe,
  POSTHOG_EVENTS,
  ONBOARDING_STEPS,
} from "./posthog";

export type {
  PostHogConfig,
  PostHogUserProperties,
  PostHogBaseEventProperties,
  PostHogTradeEvent,
  PostHogPredictionEvent,
  PostHogOnboardingStep,
  PostHogRevenueEvent,
  PostHogGroupType,
  PostHogGroupProperties,
  PostHogFeatureFlagResult,
  PostHogEventName,
  OnboardingStepName,
  PostHogMiddlewareOptions,
  PostHogMiddlewareContext,
  PostHogContextVariables,
} from "./posthog";

// ============================================================================
// NeonDB - Financial System of Record
// ============================================================================

export * as neondb from "./neondb";
export {
  // Clients
  db as neonDb,
  poolDb as neonPoolDb,
  sql as neonSql,
  getPool as getNeonPool,
  closeNeonPool,
  withSerializableTransaction,
  checkNeonHealth,

  // Schema
  schema as neonSchema,
  financialAccounts,
  ledgerTransactions,
  ledgerEntries,
  orders as neonOrders,
  trades as neonTrades,
  settlements,
  balancesSnapshot,
  idempotencyKeys,
  auditTrail,

  // Platform account IDs
  PLATFORM_ACCOUNTS,
} from "./neondb";

export type {
  // Core entity types
  FinancialAccount,
  LedgerTransaction,
  LedgerEntry,
  Order as NeonOrder,
  Trade as NeonTrade,
  Settlement,
  BalanceSnapshot,
  IdempotencyKey,
  AuditTrailEntry,

  // Insert types
  InsertFinancialAccount,
  InsertLedgerTransaction,
  InsertLedgerEntry,
  InsertOrder as InsertNeonOrder,
  InsertTrade as InsertNeonTrade,
  InsertSettlement,
  InsertBalanceSnapshot,
  InsertIdempotencyKey,
  InsertAuditTrailEntry,

  // Enum types
  AccountType,
  AccountStatus,
  Currency,
  TransactionType,
  TransactionStatus,
  EntryType,
  OrderSide,
  OrderType as NeonOrderType,
  OrderStatus as NeonOrderStatus,
  TimeInForce,
  MarketType,
  TradeStatus,
  SettlementType,
  SettlementStatus,
  AuditAction,

  // Domain types
  LedgerTransactionWithEntries,
  AccountWithBalance,
  OrderWithTrades as NeonOrderWithTrades,
  TradeWithOrders as NeonTradeWithOrders,
  SettlementWithTrades,
  CreateLedgerTransactionParams,
  CreateLedgerEntryParams,
  PlaceOrderParams,
  ReconciliationResult,
  NeonHealthCheckResult,
  NeonHealthStatus,
} from "./neondb";

export * as neondbTypes from "./neondb/types";

// ============================================================================
// Kafka Event Bus
// ============================================================================

export * as kafka from "./kafka";
export {
  // Topics
  TOPICS as KAFKA_TOPICS,
  ALL_TOPICS as KAFKA_ALL_TOPICS,
  DLQ_TOPICS as KAFKA_DLQ_TOPICS,
  getDLQTopic,

  // Producer
  initKafkaProducer,
  getKafkaInstance,
  publishTradeEvent,
  publishTradeEvents,
  publishOrderEvent,
  publishOrderEvents,
  publishSettlementEvent,
  publishBalanceEvent,
  publishKYCEvent,
  publishAuditEvent,
  publishUserEvent,
  publishRewardEvent,
  publishPredictionEvent,
  publishNotificationEvent,
  publishEvent as publishKafkaEvent,
  publishBatch as publishKafkaBatch,

  // Consumer
  createConsumer as createKafkaConsumer,
  createBatchConsumer as createKafkaBatchConsumer,
} from "./kafka";

export type {
  Topic as KafkaTopic,
  KafkaEvent,
  EventMetadata as KafkaEventMetadata,
  ProducerConfig as KafkaProducerConfig,
  ConsumerConfig as KafkaConsumerConfig,
  Consumer as KafkaConsumer,
  EventHandler as KafkaEventHandler,
  BatchEventHandler as KafkaBatchEventHandler,
  TradeEventPayload,
  TradeEvent,
  OrderEventPayload,
  OrderEvent,
  SettlementEventPayload as KafkaSettlementEventPayload,
  SettlementEvent as KafkaSettlementEvent,
  BalanceEventPayload,
  BalanceEvent,
  KYCEventPayload,
  KYCEvent,
  AuditEventPayload,
  AuditEvent as KafkaAuditEvent,
  UserEventPayload,
  UserEvent as KafkaUserEvent,
  RewardEventPayload,
  RewardEvent,
  PredictionEventPayload,
  PredictionEvent,
  NotificationEventPayload,
  NotificationEvent as KafkaNotificationEvent,
} from "./kafka";

// ============================================================================
// BullMQ Job Queue
// ============================================================================

export * as bullmq from "./bullmq";
export {
  // Initialization
  initBullMQ,

  // Queue accessors
  getEmailQueue,
  getNotificationQueue,
  getSettlementQueue,
  getReconciliationQueue,
  getAnalyticsQueue,
  getCleanupQueue,
  getAllQueues,
  getQueue as getBullMQQueue,
  closeAllQueues,
  pauseAllQueues,
  resumeAllQueues,
  getQueuesHealth,
  drainQueue,

  // Worker factories
  createEmailWorker,
  createNotificationWorker,
  createSettlementWorker,
  createReconciliationWorker,
  createAnalyticsWorker,
  createCleanupWorker,
  closeAllWorkers,
  pauseAllWorkers,
  resumeAllWorkers,

  // Scheduler
  registerAllScheduledJobs,
  removeAllScheduledJobs,
  listScheduledJobs,
  triggerScheduledJob,
  SCHEDULED_JOBS,

  // Constants
  QUEUE_NAMES,
} from "./bullmq";

export type {
  QueueName,
  EmailJobData,
  EmailJobResult,
  EmailAttachment,
  NotificationJobData as BullMQNotificationJobData,
  NotificationJobResult as BullMQNotificationJobResult,
  SettlementJobData,
  SettlementJobResult,
  ReconciliationJobData,
  ReconciliationJobResult,
  ReconciliationDiscrepancy,
  AnalyticsJobData,
  AnalyticsJobResult,
  CleanupJobData,
  CleanupJobResult,
  JobProcessor,
  WorkerConfig,
  ScheduledJob,
  RedisConnectionConfig as BullMQRedisConfig,
} from "./bullmq";

// ============================================================================
// State Machine Library
// ============================================================================

export * as stateMachine from "./state-machine";
export {
  // Core state machine
  createStateMachine,

  // Order state machine
  createOrderMachine,
  restoreOrderMachine,
  createOrderContext,
  isTerminalOrderState,
  isActiveFillState,
  ORDER_STATES,
  ORDER_EVENTS,

  // KYC state machine
  createKycMachine,
  restoreKycMachine,
  createKycContext,
  isTerminalKycState,
  canTradeInKycState,
  getKycProgress,
  KYC_STATES,
  KYC_EVENTS,

  // Payment state machine
  createPaymentMachine,
  restorePaymentMachine,
  createPaymentContext,
  isTerminalPaymentState,
  isRetryablePaymentState,
  isPaymentSettled,
  DEFAULT_MAX_RETRIES,
  PAYMENT_STATES,
  PAYMENT_EVENTS,

  // Prediction market state machine
  createPredictionMachine,
  restorePredictionMachine,
  createPredictionContext,
  isTerminalPredictionState,
  isTradingActive,
  canOpenPosition,
  isDisputed,
  PREDICTION_STATES,
  PREDICTION_EVENTS,
} from "./state-machine";

export type {
  StateMachine,
  StateMachineConfig,
  MachineSnapshot,
  TransitionRecord,
  TransitionResult,
  TransitionSuccess,
  TransitionDenied,
  TransitionDef,
  GuardFn,
  HookFn,
  MachineHooks,
  OrderMachine,
  OrderState,
  OrderEvent,
  OrderContext,
  KycMachine,
  KycState,
  KycEvent,
  KycContext,
  PaymentMachine,
  PaymentState,
  PaymentEvent,
  PaymentContext,
  PredictionMachine,
  PredictionState,
  PredictionEvent,
  PredictionContext,
} from "./state-machine";

// ============================================================================
// API Error Catalog & Error Handling
// ============================================================================

export * as errors from "./errors";
export {
  // Error catalog
  ErrorCodes,
  getErrorByCode,
  getErrorsByDomain,
  isRetryable,
  getHttpStatus,

  // Error class & utilities
  PullApiError,
  isPullApiError,
  toPullApiError,
  createErrorByCode,
  AuthErrors,
  TradeErrors,
  PaymentErrors,
  KycErrors,
  PredictionErrors,
  SystemErrors,
} from "./errors";

export type {
  ErrorEntry,
  ErrorCodeKey,
  NumericErrorCode,
  ErrorHttpStatus,
  ApiErrorResponse,
} from "./errors";
