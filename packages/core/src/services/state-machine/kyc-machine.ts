/**
 * KYC (Know Your Customer) verification state machine for PULL platform.
 *
 * Models the multi-step identity verification flow including email verification,
 * identity document verification (via Persona), background check (via Checkr),
 * and administrative overrides (suspension, rejection).
 */

import { createStateMachine, type StateMachineConfig, type StateMachine } from "./machine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const KYC_STATES = [
  "unverified",
  "email_pending",
  "email_verified",
  "identity_pending",
  "identity_verified",
  "background_pending",
  "background_cleared",
  "approved",
  "rejected",
  "suspended",
] as const;

export type KycState = (typeof KYC_STATES)[number];

export const KYC_EVENTS = [
  "START_EMAIL",
  "VERIFY_EMAIL",
  "START_IDENTITY",
  "VERIFY_IDENTITY",
  "START_BACKGROUND",
  "CLEAR_BACKGROUND",
  "APPROVE",
  "REJECT",
  "SUSPEND",
  "UNSUSPEND",
  "RESET",
] as const;

export type KycEvent = (typeof KYC_EVENTS)[number];

export interface KycContext extends Record<string, unknown> {
  userId: string;
  email: string | null;
  emailToken: string | null;
  emailTokenValid: boolean;
  personaInquiryId: string | null;
  personaApproved: boolean;
  checkrReportId: string | null;
  checkrCleared: boolean;
  rejectionReason: string | null;
  suspensionReason: string | null;
  isAdminAction: boolean;
  /** Number of times identity verification has been attempted. */
  identityAttempts: number;
  /** Number of times background check has been attempted. */
  backgroundAttempts: number;
  /** Timestamp of the state before suspension (to restore on unsuspend). */
  preSuspensionState: KycState | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Default context factory
// ---------------------------------------------------------------------------

export function createKycContext(
  params: Pick<KycContext, "userId"> & Partial<Pick<KycContext, "email">>,
): KycContext {
  const now = Date.now();
  return {
    userId: params.userId,
    email: params.email ?? null,
    emailToken: null,
    emailTokenValid: false,
    personaInquiryId: null,
    personaApproved: false,
    checkrReportId: null,
    checkrCleared: false,
    rejectionReason: null,
    suspensionReason: null,
    isAdminAction: false,
    identityAttempts: 0,
    backgroundAttempts: 0,
    preSuspensionState: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Machine configuration
// ---------------------------------------------------------------------------

/** States that can be suspended (all non-terminal states). */
const SUSPENDABLE_STATES: ReadonlySet<KycState> = new Set([
  "unverified",
  "email_pending",
  "email_verified",
  "identity_pending",
  "identity_verified",
  "background_pending",
  "background_cleared",
  "approved",
]);

function buildKycConfig(
  context: KycContext,
): StateMachineConfig<KycState, KycEvent, KycContext> {
  return {
    id: `kyc:${context.userId}`,
    initial: "unverified",
    states: KYC_STATES,
    context,
    transitions: [
      // ---- Email verification -----------------------------------------------
      {
        from: "unverified",
        to: "email_pending",
        event: "START_EMAIL",
        guard: (ctx) => ctx.email !== null && ctx.email.length > 0,
        guardDescription: "User must have an email address set",
      },
      {
        from: "email_pending",
        to: "email_verified",
        event: "VERIFY_EMAIL",
        guard: (ctx) => ctx.emailToken !== null && ctx.emailTokenValid === true,
        guardDescription: "Email token must be present and validated",
      },

      // ---- Identity verification (Persona) ----------------------------------
      {
        from: "email_verified",
        to: "identity_pending",
        event: "START_IDENTITY",
        guard: (ctx) => ctx.personaInquiryId !== null,
        guardDescription: "Persona inquiry must be created before starting identity verification",
      },
      {
        from: "identity_pending",
        to: "identity_verified",
        event: "VERIFY_IDENTITY",
        guard: (ctx) => ctx.personaApproved === true,
        guardDescription: "Persona must approve the identity verification",
      },

      // ---- Background check (Checkr) ----------------------------------------
      {
        from: "identity_verified",
        to: "background_pending",
        event: "START_BACKGROUND",
        guard: (ctx) => ctx.checkrReportId !== null,
        guardDescription: "Checkr report must be created before starting background check",
      },
      {
        from: "background_pending",
        to: "background_cleared",
        event: "CLEAR_BACKGROUND",
        guard: (ctx) => ctx.checkrCleared === true,
        guardDescription: "Checkr must clear the background check",
      },

      // ---- Final approval ---------------------------------------------------
      {
        from: "background_cleared",
        to: "approved",
        event: "APPROVE",
      },

      // ---- Rejection (from verification stages or background) ---------------
      {
        from: "identity_pending",
        to: "rejected",
        event: "REJECT",
        guard: (ctx) => ctx.rejectionReason !== null,
        guardDescription: "Rejection must include a reason",
      },
      {
        from: "background_pending",
        to: "rejected",
        event: "REJECT",
        guard: (ctx) => ctx.rejectionReason !== null,
        guardDescription: "Rejection must include a reason",
      },
      {
        from: "background_cleared",
        to: "rejected",
        event: "REJECT",
        guard: (ctx) => ctx.rejectionReason !== null && ctx.isAdminAction === true,
        guardDescription: "Post-clearance rejection requires admin action and a reason",
      },

      // ---- Suspension (admin action from any non-terminal state) ------------
      ...([...SUSPENDABLE_STATES] as KycState[]).map((state) => ({
        from: state as KycState,
        to: "suspended" as KycState,
        event: "SUSPEND" as KycEvent,
        guard: (ctx: KycContext) =>
          ctx.isAdminAction === true && ctx.suspensionReason !== null,
        guardDescription: "Suspension requires admin action and a reason",
      })),

      // ---- Unsuspend (back to the state before suspension) ------------------
      {
        from: "suspended",
        to: "unverified",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true &&
          (ctx.preSuspensionState === null || ctx.preSuspensionState === "unverified"),
        guardDescription: "Unsuspend requires admin action; falls back to unverified if no prior state",
      },
      {
        from: "suspended",
        to: "email_pending",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "email_pending",
        guardDescription: "Unsuspend restores to email_pending",
      },
      {
        from: "suspended",
        to: "email_verified",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "email_verified",
        guardDescription: "Unsuspend restores to email_verified",
      },
      {
        from: "suspended",
        to: "identity_pending",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "identity_pending",
        guardDescription: "Unsuspend restores to identity_pending",
      },
      {
        from: "suspended",
        to: "identity_verified",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "identity_verified",
        guardDescription: "Unsuspend restores to identity_verified",
      },
      {
        from: "suspended",
        to: "background_pending",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "background_pending",
        guardDescription: "Unsuspend restores to background_pending",
      },
      {
        from: "suspended",
        to: "background_cleared",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "background_cleared",
        guardDescription: "Unsuspend restores to background_cleared",
      },
      {
        from: "suspended",
        to: "approved",
        event: "UNSUSPEND",
        guard: (ctx) =>
          ctx.isAdminAction === true && ctx.preSuspensionState === "approved",
        guardDescription: "Unsuspend restores to approved",
      },

      // ---- Reset (admin can restart the whole flow) -------------------------
      {
        from: "rejected",
        to: "unverified",
        event: "RESET",
        guard: (ctx) => ctx.isAdminAction === true,
        guardDescription: "Reset requires admin action",
      },
      {
        from: "suspended",
        to: "unverified",
        event: "RESET",
        guard: (ctx) => ctx.isAdminAction === true,
        guardDescription: "Reset requires admin action",
      },
    ],
    hooks: {
      onEnter: {
        suspended: (ctx, _event, from) => {
          (ctx as KycContext).preSuspensionState = from;
          (ctx as KycContext).updatedAt = Date.now();
        },
        rejected: (ctx) => {
          (ctx as KycContext).updatedAt = Date.now();
        },
        approved: (ctx) => {
          (ctx as KycContext).updatedAt = Date.now();
        },
      },
      onExit: {
        suspended: (ctx) => {
          // Clear admin flags after unsuspend so they don't leak
          (ctx as KycContext).isAdminAction = false;
          (ctx as KycContext).suspensionReason = null;
        },
      },
      onTransition: (ctx) => {
        (ctx as KycContext).updatedAt = Date.now();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type KycMachine = StateMachine<KycState, KycEvent, KycContext>;

/**
 * Create a new KYC verification state machine.
 *
 * @example
 * ```ts
 * const machine = createKycMachine({ userId: "usr_123", email: "user@example.com" });
 *
 * await machine.transition("START_EMAIL");
 * machine.setContext({ emailToken: "tok_abc", emailTokenValid: true });
 * await machine.transition("VERIFY_EMAIL");
 * machine.setContext({ personaInquiryId: "inq_456" });
 * await machine.transition("START_IDENTITY");
 * // ... etc
 * ```
 */
export function createKycMachine(
  params: Pick<KycContext, "userId"> & Partial<Pick<KycContext, "email">>,
): KycMachine {
  const ctx = createKycContext(params);
  return createStateMachine(buildKycConfig(ctx));
}

/**
 * Restore a KYC machine from a serialized snapshot (e.g. loaded from DB).
 */
export function restoreKycMachine(
  snapshot: ReturnType<KycMachine["serialize"]>,
): KycMachine {
  const machine = createStateMachine(buildKycConfig(snapshot.context));
  machine.restore(snapshot);
  return machine;
}

/** Check if a KYC state is terminal. */
export function isTerminalKycState(state: KycState): boolean {
  // rejected and suspended are not truly terminal (admin can reset/unsuspend)
  return false; // All KYC states have at least one outgoing transition
}

/** Check if a user can trade based on their KYC state. */
export function canTradeInKycState(state: KycState): boolean {
  return state === "approved";
}

/** Get the verification progress as a percentage. */
export function getKycProgress(state: KycState): number {
  const progressMap: Record<KycState, number> = {
    unverified: 0,
    email_pending: 10,
    email_verified: 25,
    identity_pending: 40,
    identity_verified: 60,
    background_pending: 75,
    background_cleared: 90,
    approved: 100,
    rejected: 0,
    suspended: 0,
  };
  return progressMap[state];
}
