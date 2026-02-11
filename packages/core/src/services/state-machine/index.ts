/**
 * State Machine Library
 *
 * Lightweight, type-safe state machines for critical PULL platform flows:
 * - Order lifecycle (pending -> settled)
 * - KYC verification (unverified -> approved)
 * - Payment processing (initiated -> settled)
 * - Prediction market lifecycle (draft -> settled)
 */

// Core state machine
export {
  createStateMachine,
  type StateMachine,
  type StateMachineConfig,
  type MachineSnapshot,
  type TransitionRecord,
  type TransitionResult,
  type TransitionSuccess,
  type TransitionDenied,
  type TransitionDef,
  type GuardFn,
  type HookFn,
  type MachineHooks,
} from "./machine";

// Order state machine
export {
  createOrderMachine,
  restoreOrderMachine,
  createOrderContext,
  isTerminalOrderState,
  isActiveFillState,
  ORDER_STATES,
  ORDER_EVENTS,
  type OrderMachine,
  type OrderState,
  type OrderEvent,
  type OrderContext,
} from "./order-machine";

// KYC state machine
export {
  createKycMachine,
  restoreKycMachine,
  createKycContext,
  isTerminalKycState,
  canTradeInKycState,
  getKycProgress,
  KYC_STATES,
  KYC_EVENTS,
  type KycMachine,
  type KycState,
  type KycEvent,
  type KycContext,
} from "./kyc-machine";

// Payment state machine
export {
  createPaymentMachine,
  restorePaymentMachine,
  createPaymentContext,
  isTerminalPaymentState,
  isRetryablePaymentState,
  isPaymentSettled,
  DEFAULT_MAX_RETRIES,
  PAYMENT_STATES,
  PAYMENT_EVENTS,
  type PaymentMachine,
  type PaymentState,
  type PaymentEvent,
  type PaymentContext,
} from "./payment-machine";

// Prediction market state machine
export {
  createPredictionMachine,
  restorePredictionMachine,
  createPredictionContext,
  isTerminalPredictionState,
  isTradingActive,
  canOpenPosition,
  isDisputed,
  PREDICTION_STATES,
  PREDICTION_EVENTS,
  type PredictionMachine,
  type PredictionState,
  type PredictionEvent,
  type PredictionContext,
} from "./prediction-machine";
