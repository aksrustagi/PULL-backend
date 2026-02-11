/**
 * Payment / deposit lifecycle state machine for PULL platform.
 *
 * Models the flow of a payment from initiation through processing, success,
 * settlement, and failure with a bounded retry mechanism (max 3 retries).
 */

import { createStateMachine, type StateMachineConfig, type StateMachine } from "./machine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const PAYMENT_STATES = [
  "initiated",
  "processing",
  "succeeded",
  "settled",
  "failed",
  "retry_pending",
  "permanently_failed",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PAYMENT_EVENTS = [
  "PROCESS",
  "SUCCEED",
  "FAIL",
  "SETTLE",
  "RETRY",
  "ABANDON",
] as const;

export type PaymentEvent = (typeof PAYMENT_EVENTS)[number];

export interface PaymentContext extends Record<string, unknown> {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: "card" | "ach" | "wire" | "crypto";
  paymentMethodId: string | null;
  paymentMethodValid: boolean;
  processorId: string | null;
  processorConfirmed: boolean;
  fundsAvailable: boolean;
  retryCount: number;
  maxRetries: number;
  failureReason: string | null;
  failureCode: string | null;
  settlementId: string | null;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Default context factory
// ---------------------------------------------------------------------------

export function createPaymentContext(
  params: Pick<
    PaymentContext,
    "paymentId" | "userId" | "amount" | "currency" | "paymentMethod" | "idempotencyKey"
  > &
    Partial<Pick<PaymentContext, "paymentMethodId" | "maxRetries">>,
): PaymentContext {
  const now = Date.now();
  return {
    paymentId: params.paymentId,
    userId: params.userId,
    amount: params.amount,
    currency: params.currency,
    paymentMethod: params.paymentMethod,
    paymentMethodId: params.paymentMethodId ?? null,
    paymentMethodValid: false,
    processorId: null,
    processorConfirmed: false,
    fundsAvailable: false,
    retryCount: 0,
    maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
    failureReason: null,
    failureCode: null,
    settlementId: null,
    idempotencyKey: params.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Machine configuration
// ---------------------------------------------------------------------------

function buildPaymentConfig(
  context: PaymentContext,
): StateMachineConfig<PaymentState, PaymentEvent, PaymentContext> {
  return {
    id: `payment:${context.paymentId}`,
    initial: "initiated",
    states: PAYMENT_STATES,
    context,
    transitions: [
      // ---- Happy path -------------------------------------------------------
      {
        from: "initiated",
        to: "processing",
        event: "PROCESS",
        guard: (ctx) =>
          ctx.paymentMethodValid === true &&
          ctx.paymentMethodId !== null &&
          ctx.amount > 0,
        guardDescription:
          "Payment method must be validated, have an ID, and amount must be positive",
      },
      {
        from: "processing",
        to: "succeeded",
        event: "SUCCEED",
        guard: (ctx) => ctx.processorConfirmed === true && ctx.processorId !== null,
        guardDescription: "Payment processor must confirm the transaction with a processor ID",
      },
      {
        from: "succeeded",
        to: "settled",
        event: "SETTLE",
        guard: (ctx) => ctx.fundsAvailable === true,
        guardDescription: "Funds must be confirmed available in the user account",
      },

      // ---- Failure path -----------------------------------------------------
      {
        from: "processing",
        to: "failed",
        event: "FAIL",
        guard: (ctx) => ctx.failureReason !== null,
        guardDescription: "Failure must include a reason",
      },

      // ---- Retry path -------------------------------------------------------
      {
        from: "failed",
        to: "retry_pending",
        event: "RETRY",
        guard: (ctx) => ctx.retryCount < ctx.maxRetries,
        guardDescription: `Retry count must be less than max retries (default ${DEFAULT_MAX_RETRIES})`,
      },
      {
        from: "retry_pending",
        to: "processing",
        event: "PROCESS",
        guard: (ctx) =>
          ctx.paymentMethodValid === true &&
          ctx.paymentMethodId !== null &&
          ctx.retryCount <= ctx.maxRetries,
        guardDescription: "Payment method must still be valid and retries within limit",
      },

      // ---- Permanent failure ------------------------------------------------
      {
        from: "failed",
        to: "permanently_failed",
        event: "ABANDON",
        guard: (ctx) => ctx.retryCount >= ctx.maxRetries || ctx.failureCode === "fraud_detected",
        guardDescription:
          "Permanent failure when retries exhausted or fraud detected",
      },
      {
        from: "retry_pending",
        to: "permanently_failed",
        event: "ABANDON",
        guardDescription: "Can abandon from retry_pending state",
      },
    ],
    hooks: {
      onEnter: {
        retry_pending: (ctx) => {
          (ctx as PaymentContext).retryCount += 1;
          (ctx as PaymentContext).processorConfirmed = false;
          (ctx as PaymentContext).processorId = null;
          (ctx as PaymentContext).failureReason = null;
          (ctx as PaymentContext).failureCode = null;
          (ctx as PaymentContext).updatedAt = Date.now();
        },
        permanently_failed: (ctx) => {
          (ctx as PaymentContext).updatedAt = Date.now();
        },
        settled: (ctx) => {
          (ctx as PaymentContext).updatedAt = Date.now();
        },
      },
      onTransition: (ctx) => {
        (ctx as PaymentContext).updatedAt = Date.now();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type PaymentMachine = StateMachine<PaymentState, PaymentEvent, PaymentContext>;

/**
 * Create a new payment state machine.
 *
 * @example
 * ```ts
 * const machine = createPaymentMachine({
 *   paymentId: "pay_123",
 *   userId: "usr_456",
 *   amount: 10000, // $100.00 in cents
 *   currency: "usd",
 *   paymentMethod: "card",
 *   idempotencyKey: "idk_abc",
 * });
 *
 * machine.setContext({ paymentMethodId: "pm_789", paymentMethodValid: true });
 * await machine.transition("PROCESS");
 * machine.setContext({ processorId: "pi_xyz", processorConfirmed: true });
 * await machine.transition("SUCCEED");
 * machine.setContext({ fundsAvailable: true });
 * await machine.transition("SETTLE");
 * ```
 */
export function createPaymentMachine(
  params: Pick<
    PaymentContext,
    "paymentId" | "userId" | "amount" | "currency" | "paymentMethod" | "idempotencyKey"
  > &
    Partial<Pick<PaymentContext, "paymentMethodId" | "maxRetries">>,
): PaymentMachine {
  const ctx = createPaymentContext(params);
  return createStateMachine(buildPaymentConfig(ctx));
}

/**
 * Restore a payment machine from a serialized snapshot.
 */
export function restorePaymentMachine(
  snapshot: ReturnType<PaymentMachine["serialize"]>,
): PaymentMachine {
  const machine = createStateMachine(buildPaymentConfig(snapshot.context));
  machine.restore(snapshot);
  return machine;
}

/** Check if a payment state is terminal. */
export function isTerminalPaymentState(state: PaymentState): boolean {
  return state === "settled" || state === "permanently_failed";
}

/** Check if a payment is in a retryable state. */
export function isRetryablePaymentState(state: PaymentState): boolean {
  return state === "failed" || state === "retry_pending";
}

/** Check if a payment has settled successfully. */
export function isPaymentSettled(state: PaymentState): boolean {
  return state === "settled";
}
