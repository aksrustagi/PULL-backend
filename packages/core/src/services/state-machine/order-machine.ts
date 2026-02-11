/**
 * Order lifecycle state machine for PULL trading platform.
 *
 * Models the full lifecycle of a trade order from creation through settlement,
 * including partial fills, cancellation, rejection, and expiration paths.
 */

import { createStateMachine, type StateMachineConfig, type StateMachine } from "./machine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const ORDER_STATES = [
  "pending",
  "submitted",
  "open",
  "partial_fill",
  "filled",
  "settling",
  "settled",
  "cancelled",
  "rejected",
  "expired",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

export const ORDER_EVENTS = [
  "SUBMIT",
  "ACCEPT",
  "PARTIAL_FILL",
  "FILL",
  "SETTLE_START",
  "SETTLE_CONFIRM",
  "CANCEL",
  "REJECT",
  "EXPIRE",
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

export interface OrderContext extends Record<string, unknown> {
  orderId: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  filledQuantity: number;
  price: number | null;
  limitPrice: number | null;
  settlementId: string | null;
  settlementConfirmed: boolean;
  validParams: boolean;
  rejectionReason: string | null;
  cancelledBy: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Default context factory
// ---------------------------------------------------------------------------

export function createOrderContext(
  params: Pick<OrderContext, "orderId" | "userId" | "symbol" | "side" | "orderType" | "quantity"> &
    Partial<Pick<OrderContext, "limitPrice">>,
): OrderContext {
  const now = Date.now();
  return {
    orderId: params.orderId,
    userId: params.userId,
    symbol: params.symbol,
    side: params.side,
    orderType: params.orderType,
    quantity: params.quantity,
    filledQuantity: 0,
    price: null,
    limitPrice: params.limitPrice ?? null,
    settlementId: null,
    settlementConfirmed: false,
    validParams: true,
    rejectionReason: null,
    cancelledBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Machine configuration
// ---------------------------------------------------------------------------

/** Terminal states from which no further transitions are possible. */
const TERMINAL_STATES: ReadonlySet<OrderState> = new Set([
  "settled",
  "cancelled",
  "rejected",
  "expired",
]);

/** States that are actively being processed (fills in-flight). */
const ACTIVE_FILL_STATES: ReadonlySet<OrderState> = new Set([
  "filled",
  "settling",
  "settled",
]);

function buildOrderConfig(
  context: OrderContext,
): StateMachineConfig<OrderState, OrderEvent, OrderContext> {
  return {
    id: `order:${context.orderId}`,
    initial: "pending",
    states: ORDER_STATES,
    context,
    transitions: [
      // ---- Happy path -------------------------------------------------------
      {
        from: "pending",
        to: "submitted",
        event: "SUBMIT",
        guard: (ctx) => ctx.validParams && ctx.quantity > 0,
        guardDescription: "Order must have valid params and positive quantity",
      },
      {
        from: "submitted",
        to: "open",
        event: "ACCEPT",
      },
      {
        from: ["open", "partial_fill"],
        to: "partial_fill",
        event: "PARTIAL_FILL",
        guard: (ctx) => ctx.filledQuantity > 0 && ctx.filledQuantity < ctx.quantity,
        guardDescription: "Filled quantity must be > 0 and < order quantity",
      },
      {
        from: ["open", "partial_fill"],
        to: "filled",
        event: "FILL",
        guard: (ctx) => ctx.filledQuantity > 0 && ctx.filledQuantity === ctx.quantity,
        guardDescription: "Filled quantity must equal order quantity",
      },
      {
        from: "filled",
        to: "settling",
        event: "SETTLE_START",
        guard: (ctx) => ctx.settlementId !== null,
        guardDescription: "Settlement ID must be assigned before settling",
      },
      {
        from: "settling",
        to: "settled",
        event: "SETTLE_CONFIRM",
        guard: (ctx) => ctx.settlementConfirmed === true,
        guardDescription: "Settlement must be confirmed by the clearing system",
      },

      // ---- Cancellation (allowed from non-terminal, non-fill states) --------
      {
        from: "pending",
        to: "cancelled",
        event: "CANCEL",
        guard: (ctx) => ctx.cancelledBy !== null,
        guardDescription: "Cancel request must include the cancelling actor",
      },
      {
        from: "submitted",
        to: "cancelled",
        event: "CANCEL",
        guard: (ctx) => ctx.cancelledBy !== null,
        guardDescription: "Cancel request must include the cancelling actor",
      },
      {
        from: "open",
        to: "cancelled",
        event: "CANCEL",
        guard: (ctx) => ctx.cancelledBy !== null,
        guardDescription: "Cancel request must include the cancelling actor",
      },
      {
        from: "partial_fill",
        to: "cancelled",
        event: "CANCEL",
        guard: (ctx) => ctx.cancelledBy !== null,
        guardDescription: "Cancel request must include the cancelling actor (partial fill will settle remaining)",
      },

      // ---- Rejection (from submitted only) ----------------------------------
      {
        from: "submitted",
        to: "rejected",
        event: "REJECT",
        guard: (ctx) => ctx.rejectionReason !== null,
        guardDescription: "Rejection must include a reason",
      },

      // ---- Expiration (from open states) ------------------------------------
      {
        from: "open",
        to: "expired",
        event: "EXPIRE",
      },
      {
        from: "partial_fill",
        to: "expired",
        event: "EXPIRE",
      },
    ],
    hooks: {
      onEnter: {
        settled: (ctx) => {
          (ctx as OrderContext).updatedAt = Date.now();
        },
        cancelled: (ctx) => {
          (ctx as OrderContext).updatedAt = Date.now();
        },
      },
      onTransition: (ctx) => {
        (ctx as OrderContext).updatedAt = Date.now();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type OrderMachine = StateMachine<OrderState, OrderEvent, OrderContext>;

/**
 * Create a new order state machine.
 *
 * @example
 * ```ts
 * const machine = createOrderMachine({
 *   orderId: "ord_123",
 *   userId: "usr_456",
 *   symbol: "AAPL-YES",
 *   side: "buy",
 *   orderType: "limit",
 *   quantity: 100,
 *   limitPrice: 0.65,
 * });
 *
 * machine.setContext({ validParams: true });
 * await machine.transition("SUBMIT");
 * await machine.transition("ACCEPT");
 * machine.setContext({ filledQuantity: 50 });
 * await machine.transition("PARTIAL_FILL");
 * machine.setContext({ filledQuantity: 100 });
 * await machine.transition("FILL");
 * ```
 */
export function createOrderMachine(
  params: Pick<OrderContext, "orderId" | "userId" | "symbol" | "side" | "orderType" | "quantity"> &
    Partial<Pick<OrderContext, "limitPrice">>,
): OrderMachine {
  const ctx = createOrderContext(params);
  return createStateMachine(buildOrderConfig(ctx));
}

/**
 * Restore an order machine from a serialized snapshot (e.g. loaded from DB).
 */
export function restoreOrderMachine(
  snapshot: ReturnType<OrderMachine["serialize"]>,
): OrderMachine {
  const machine = createStateMachine(buildOrderConfig(snapshot.context));
  machine.restore(snapshot);
  return machine;
}

/** Check if an order state is terminal (no further transitions). */
export function isTerminalOrderState(state: OrderState): boolean {
  return TERMINAL_STATES.has(state);
}

/** Check if an order is in an active fill state (fill in progress). */
export function isActiveFillState(state: OrderState): boolean {
  return ACTIVE_FILL_STATES.has(state);
}
