/**
 * Prediction market lifecycle state machine for PULL platform.
 *
 * Models the full lifecycle of a prediction market from draft creation
 * through trading, resolution, and settlement, including dispute and void paths.
 */

import { createStateMachine, type StateMachineConfig, type StateMachine } from "./machine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const PREDICTION_STATES = [
  "draft",
  "open",
  "trading",
  "closing",
  "resolution_pending",
  "resolved",
  "settled",
  "disputed",
  "voided",
] as const;

export type PredictionState = (typeof PREDICTION_STATES)[number];

export const PREDICTION_EVENTS = [
  "PUBLISH",
  "START_TRADING",
  "CLOSE_TRADING",
  "REQUEST_RESOLUTION",
  "RESOLVE",
  "SETTLE",
  "DISPUTE",
  "RESOLVE_DISPUTE",
  "VOID",
  "REOPEN",
] as const;

export type PredictionEvent = (typeof PREDICTION_EVENTS)[number];

export interface PredictionContext extends Record<string, unknown> {
  marketId: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  outcomes: string[];
  /** Index of the winning outcome, or null if unresolved / voided. */
  winningOutcome: number | null;
  resolutionSource: string | null;
  resolutionProof: string | null;
  openTime: number | null;
  closeTime: number | null;
  tradingVolume: number;
  totalPositions: number;
  disputeReason: string | null;
  disputeFiledBy: string | null;
  voidReason: string | null;
  isAdminAction: boolean;
  /** Whether the market has valid metadata to be published. */
  hasValidMetadata: boolean;
  /** Whether the market has at least 2 defined outcomes. */
  hasValidOutcomes: boolean;
  /** Whether the oracle / resolution source is configured. */
  hasResolutionSource: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Default context factory
// ---------------------------------------------------------------------------

export function createPredictionContext(
  params: Pick<
    PredictionContext,
    "marketId" | "creatorId" | "title" | "description" | "category" | "outcomes"
  >,
): PredictionContext {
  const now = Date.now();
  return {
    marketId: params.marketId,
    creatorId: params.creatorId,
    title: params.title,
    description: params.description,
    category: params.category,
    outcomes: params.outcomes,
    winningOutcome: null,
    resolutionSource: null,
    resolutionProof: null,
    openTime: null,
    closeTime: null,
    tradingVolume: 0,
    totalPositions: 0,
    disputeReason: null,
    disputeFiledBy: null,
    voidReason: null,
    isAdminAction: false,
    hasValidMetadata: false,
    hasValidOutcomes: params.outcomes.length >= 2,
    hasResolutionSource: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Machine configuration
// ---------------------------------------------------------------------------

function buildPredictionConfig(
  context: PredictionContext,
): StateMachineConfig<PredictionState, PredictionEvent, PredictionContext> {
  return {
    id: `prediction:${context.marketId}`,
    initial: "draft",
    states: PREDICTION_STATES,
    context,
    transitions: [
      // ---- Draft -> Open (publish the market) -------------------------------
      {
        from: "draft",
        to: "open",
        event: "PUBLISH",
        guard: (ctx) =>
          ctx.hasValidMetadata &&
          ctx.hasValidOutcomes &&
          ctx.outcomes.length >= 2,
        guardDescription:
          "Market must have valid metadata and at least 2 outcomes to be published",
      },

      // ---- Open -> Trading (start accepting orders) -------------------------
      {
        from: "open",
        to: "trading",
        event: "START_TRADING",
        guard: (ctx) => ctx.openTime !== null,
        guardDescription: "Open time must be set before trading begins",
      },

      // ---- Trading -> Closing (stop accepting new orders) -------------------
      {
        from: "trading",
        to: "closing",
        event: "CLOSE_TRADING",
        guard: (ctx) => ctx.closeTime !== null,
        guardDescription: "Close time must be set",
      },

      // ---- Closing -> Resolution Pending ------------------------------------
      {
        from: "closing",
        to: "resolution_pending",
        event: "REQUEST_RESOLUTION",
        guard: (ctx) => ctx.hasResolutionSource,
        guardDescription: "Resolution source must be configured",
      },

      // ---- Resolution Pending -> Resolved -----------------------------------
      {
        from: "resolution_pending",
        to: "resolved",
        event: "RESOLVE",
        guard: (ctx) =>
          ctx.winningOutcome !== null &&
          ctx.winningOutcome >= 0 &&
          ctx.winningOutcome < ctx.outcomes.length &&
          ctx.resolutionProof !== null,
        guardDescription:
          "Winning outcome must be valid and resolution proof must be provided",
      },

      // ---- Resolved -> Settled (payouts complete) ---------------------------
      {
        from: "resolved",
        to: "settled",
        event: "SETTLE",
      },

      // ---- Dispute path -----------------------------------------------------
      {
        from: "closing",
        to: "disputed",
        event: "DISPUTE",
        guard: (ctx) =>
          ctx.disputeReason !== null && ctx.disputeFiledBy !== null,
        guardDescription: "Dispute must include a reason and the filer identity",
      },
      {
        from: "resolution_pending",
        to: "disputed",
        event: "DISPUTE",
        guard: (ctx) =>
          ctx.disputeReason !== null && ctx.disputeFiledBy !== null,
        guardDescription: "Dispute must include a reason and the filer identity",
      },
      {
        from: "resolved",
        to: "disputed",
        event: "DISPUTE",
        guard: (ctx) =>
          ctx.disputeReason !== null && ctx.disputeFiledBy !== null,
        guardDescription: "Dispute must include a reason and the filer identity",
      },

      // ---- Disputed -> Resolution Pending (dispute resolved, try again) -----
      {
        from: "disputed",
        to: "resolution_pending",
        event: "RESOLVE_DISPUTE",
        guard: (ctx) => ctx.isAdminAction === true,
        guardDescription: "Dispute resolution requires admin action",
      },

      // ---- Void path (from multiple states) ---------------------------------
      {
        from: "closing",
        to: "voided",
        event: "VOID",
        guard: (ctx) => ctx.voidReason !== null && ctx.isAdminAction === true,
        guardDescription: "Voiding requires admin action and a reason",
      },
      {
        from: "resolution_pending",
        to: "voided",
        event: "VOID",
        guard: (ctx) => ctx.voidReason !== null && ctx.isAdminAction === true,
        guardDescription: "Voiding requires admin action and a reason",
      },
      {
        from: "disputed",
        to: "voided",
        event: "VOID",
        guard: (ctx) => ctx.voidReason !== null && ctx.isAdminAction === true,
        guardDescription: "Voiding requires admin action and a reason",
      },

      // ---- Reopen (from open back to trading after maintenance) -------------
      {
        from: "open",
        to: "trading",
        event: "REOPEN",
        guard: (ctx) => ctx.isAdminAction === true && ctx.openTime !== null,
        guardDescription: "Reopening requires admin action",
      },
    ],
    hooks: {
      onEnter: {
        open: (ctx) => {
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        trading: (ctx) => {
          if ((ctx as PredictionContext).openTime === null) {
            (ctx as PredictionContext).openTime = Date.now();
          }
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        closing: (ctx) => {
          if ((ctx as PredictionContext).closeTime === null) {
            (ctx as PredictionContext).closeTime = Date.now();
          }
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        resolved: (ctx) => {
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        settled: (ctx) => {
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        voided: (ctx) => {
          // Clear the winning outcome on void
          (ctx as PredictionContext).winningOutcome = null;
          (ctx as PredictionContext).updatedAt = Date.now();
        },
        disputed: (ctx) => {
          (ctx as PredictionContext).updatedAt = Date.now();
        },
      },
      onExit: {
        disputed: (ctx) => {
          // Clear dispute fields on exit
          (ctx as PredictionContext).disputeReason = null;
          (ctx as PredictionContext).disputeFiledBy = null;
        },
      },
      onTransition: (ctx) => {
        (ctx as PredictionContext).updatedAt = Date.now();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type PredictionMachine = StateMachine<PredictionState, PredictionEvent, PredictionContext>;

/**
 * Create a new prediction market state machine.
 *
 * @example
 * ```ts
 * const machine = createPredictionMachine({
 *   marketId: "mkt_123",
 *   creatorId: "usr_456",
 *   title: "Will BTC exceed $100k by end of Q1?",
 *   description: "Resolves YES if BTC spot price exceeds $100,000 USD.",
 *   category: "crypto",
 *   outcomes: ["Yes", "No"],
 * });
 *
 * machine.setContext({ hasValidMetadata: true, hasValidOutcomes: true });
 * await machine.transition("PUBLISH");
 * machine.setContext({ openTime: Date.now() });
 * await machine.transition("START_TRADING");
 * ```
 */
export function createPredictionMachine(
  params: Pick<
    PredictionContext,
    "marketId" | "creatorId" | "title" | "description" | "category" | "outcomes"
  >,
): PredictionMachine {
  const ctx = createPredictionContext(params);
  return createStateMachine(buildPredictionConfig(ctx));
}

/**
 * Restore a prediction machine from a serialized snapshot.
 */
export function restorePredictionMachine(
  snapshot: ReturnType<PredictionMachine["serialize"]>,
): PredictionMachine {
  const machine = createStateMachine(buildPredictionConfig(snapshot.context));
  machine.restore(snapshot);
  return machine;
}

/** Check if a prediction market state is terminal. */
export function isTerminalPredictionState(state: PredictionState): boolean {
  return state === "settled" || state === "voided";
}

/** Check if a prediction market is actively trading. */
export function isTradingActive(state: PredictionState): boolean {
  return state === "trading";
}

/** Check if a prediction market is accepting new positions. */
export function canOpenPosition(state: PredictionState): boolean {
  return state === "trading";
}

/** Check if a prediction market is in a dispute state. */
export function isDisputed(state: PredictionState): boolean {
  return state === "disputed";
}
