/**
 * Enhanced Sentry Service for PULL Trading Platform
 *
 * Production-grade error tracking, performance monitoring, and observability
 * tailored for financial trading operations.
 *
 * @example Basic initialization from environment variables
 * ```typescript
 * import { initSentryFromEnv } from "@pull/core/services/sentry";
 *
 * // Reads SENTRY_DSN, NODE_ENV, RELEASE_VERSION from env
 * initSentryFromEnv();
 * ```
 *
 * @example Manual initialization with custom config
 * ```typescript
 * import { initSentry } from "@pull/core/services/sentry";
 *
 * initSentry({
 *   dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
 *   environment: "production",
 *   release: "pull-api@1.5.0",
 *   profilingEnabled: true,
 *   sessionTrackingEnabled: true,
 * });
 * ```
 *
 * @example Capturing errors with financial context
 * ```typescript
 * import {
 *   captureException,
 *   toBalanceRange,
 * } from "@pull/core/services/sentry";
 *
 * captureException(error, {
 *   tags: { assetClass: "crypto", orderType: "market" },
 *   financialContext: {
 *     userId: user.id,
 *     kycTier: "intermediate",
 *     accountBalanceRange: toBalanceRange(user.balance),
 *   },
 * });
 * ```
 *
 * @example Performance transaction for trade execution
 * ```typescript
 * import {
 *   withSentryTransaction,
 *   TransactionOps,
 * } from "@pull/core/services/sentry";
 *
 * const result = await withSentryTransaction(
 *   "executeTrade",
 *   TransactionOps.TRADE_EXECUTE,
 *   async (tx) => {
 *     tx.setData("orderId", order.id);
 *     tx.setData("side", order.side);
 *     return await tradeService.execute(order);
 *   },
 *   { tags: { assetClass: "prediction" } },
 * );
 * ```
 *
 * @example Cron job monitoring
 * ```typescript
 * import {
 *   withCronMonitoring,
 *   CronMonitors,
 * } from "@pull/core/services/sentry";
 *
 * await withCronMonitoring(CronMonitors.DAILY_RECONCILIATION, async () => {
 *   await reconciliationService.run();
 * });
 * ```
 *
 * @example Order flow tracking
 * ```typescript
 * import { trackOrderStep } from "@pull/core/services/sentry";
 *
 * trackOrderStep(orderId, "order_created", { side: "buy", amount: 100 });
 * trackOrderStep(orderId, "order_submitted");
 * trackOrderStep(orderId, "order_filled", { fillPrice: 0.55 });
 * trackOrderStep(orderId, "order_settled", { pnl: 12.50 });
 * ```
 *
 * @example Circuit breaker integration
 * ```typescript
 * import { recordCircuitBreakerChange } from "@pull/core/services/sentry";
 *
 * recordCircuitBreakerChange({
 *   serviceName: "kalshi-api",
 *   previousState: "closed",
 *   newState: "open",
 *   failureCount: 5,
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 *   lastError: "Connection refused",
 * });
 * ```
 */

// Client: Singleton, factory, and convenience functions
export {
  PullSentryClient,
  getSentryClient,
  initSentry,
  initSentryFromEnv,
  createSentryClient,
  captureException,
  captureMessage,
  setFinancialContext,
  clearUser,
  addOrderBreadcrumb,
  startTransaction,
  recordCircuitBreakerChange,
  cronCheckIn,
  createReplayHint,
  flushSentry,
  closeSentry,
  withSentryTransaction,
  withCronMonitoring,
  trackOrderStep,
  Sentry,
} from "./client";

// Types: Configuration
export type {
  SentryConfig,
  SentryEnvironment,
  SamplingSConfig,
  SentryLevel,
} from "./types";

// Types: Financial context
export type {
  FinancialContext,
  KycTier,
  BalanceRange,
  AccountStatus,
} from "./types";

// Types: Tags
export type {
  PullSentryTags,
  AssetClass,
  OrderType,
  PaymentMethod,
} from "./types";

// Types: Order flow
export type {
  OrderFlowStep,
  OrderFlowBreadcrumb,
} from "./types";

// Types: Transactions
export type {
  TransactionOp,
  TransactionHandle,
} from "./types";

// Types: Circuit breaker
export type {
  CircuitBreakerState,
  CircuitBreakerEvent,
} from "./types";

// Types: Cron monitoring
export type {
  CronMonitorConfig,
  CronCheckInStatus,
  CronCheckInOptions,
} from "./types";

// Types: Session replay
export type {
  SessionReplayHint,
  SessionReplayReason,
} from "./types";

// Types: Error classification
export type {
  ErrorSeverity,
  ErrorCategory,
  ClassifiedError,
} from "./types";

// Types: Capture options
export type {
  CaptureExceptionOptions,
  CaptureMessageOptions,
} from "./types";

// Types: Client interface
export type { ISentryClient } from "./types";

// Constants
export {
  DEFAULT_SAMPLING,
  TransactionOps,
  CronMonitors,
  PII_FIELDS,
  PII_VALUE_PATTERNS,
  toBalanceRange,
} from "./types";
