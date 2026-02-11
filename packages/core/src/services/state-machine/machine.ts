/**
 * Lightweight, type-safe state machine implementation for PULL platform.
 *
 * No external dependencies - designed for deterministic state transitions
 * with guard conditions, side-effect hooks, and full transition history
 * for audit/compliance requirements.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** A single recorded transition for audit trail / persistence. */
export interface TransitionRecord<TState extends string, TEvent extends string> {
  from: TState;
  to: TState;
  event: TEvent;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Guard predicate - must return true for the transition to proceed. */
export type GuardFn<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> = (context: TContext, event: TEvent, from: TState, to: TState) => boolean;

/** Side-effect hook signature. */
export type HookFn<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> = (
  context: TContext,
  event: TEvent,
  from: TState,
  to: TState,
  metadata?: Record<string, unknown>,
) => void | Promise<void>;

/** Definition of a single allowed transition. */
export interface TransitionDef<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> {
  from: TState | TState[];
  to: TState;
  event: TEvent;
  guard?: GuardFn<TState, TEvent, TContext>;
  /** Human-readable description for documentation / error messages. */
  guardDescription?: string;
}

/** Lifecycle hooks that fire on state entry, exit, or any transition. */
export interface MachineHooks<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> {
  /** Fires when entering a specific state. */
  onEnter?: Partial<Record<TState, HookFn<TState, TEvent, TContext>>>;
  /** Fires when exiting a specific state. */
  onExit?: Partial<Record<TState, HookFn<TState, TEvent, TContext>>>;
  /** Fires on every successful transition. */
  onTransition?: HookFn<TState, TEvent, TContext>;
}

/** Full configuration required to create a state machine. */
export interface StateMachineConfig<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> {
  id: string;
  initial: TState;
  states: readonly TState[];
  context: TContext;
  transitions: TransitionDef<TState, TEvent, TContext>[];
  hooks?: MachineHooks<TState, TEvent, TContext>;
  /** Maximum number of history entries to retain in memory (default 1000). */
  maxHistorySize?: number;
}

/** Serializable snapshot of machine state - safe for DB persistence. */
export interface MachineSnapshot<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> {
  id: string;
  currentState: TState;
  context: TContext;
  history: TransitionRecord<TState, TEvent>[];
  createdAt: number;
  updatedAt: number;
}

/** Reason a transition was denied. */
export interface TransitionDenied<TState extends string, TEvent extends string> {
  ok: false;
  reason: "no_transition" | "guard_failed";
  from: TState;
  event: TEvent;
  guardDescription?: string;
}

/** Successful transition result. */
export interface TransitionSuccess<TState extends string, TEvent extends string> {
  ok: true;
  from: TState;
  to: TState;
  event: TEvent;
}

export type TransitionResult<TState extends string, TEvent extends string> =
  | TransitionSuccess<TState, TEvent>
  | TransitionDenied<TState, TEvent>;

// ---------------------------------------------------------------------------
// State machine instance
// ---------------------------------------------------------------------------

export interface StateMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
> {
  /** Machine identifier. */
  readonly id: string;

  /** Current state. */
  getState(): TState;

  /** Current context object. */
  getContext(): Readonly<TContext>;

  /** Update context without transitioning. */
  setContext(partial: Partial<TContext>): void;

  /**
   * Attempt a state transition.
   * Returns a discriminated union indicating success or failure reason.
   */
  transition(
    event: TEvent,
    metadata?: Record<string, unknown>,
  ): Promise<TransitionResult<TState, TEvent>>;

  /**
   * Synchronous transition - same as `transition` but hooks are fire-and-forget.
   * Useful when you cannot await (e.g. inside a synchronous callback).
   */
  transitionSync(
    event: TEvent,
    metadata?: Record<string, unknown>,
  ): TransitionResult<TState, TEvent>;

  /** Check whether a transition is currently allowed (without executing it). */
  canTransition(event: TEvent): boolean;

  /** List events that can currently fire from the current state. */
  availableEvents(): TEvent[];

  /** Full transition history. */
  getHistory(): ReadonlyArray<TransitionRecord<TState, TEvent>>;

  /** Serialize to a persistence-friendly snapshot. */
  serialize(): MachineSnapshot<TState, TEvent, TContext>;

  /** Restore state from a previously serialized snapshot. */
  restore(snapshot: MachineSnapshot<TState, TEvent, TContext>): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStateMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown>,
>(config: StateMachineConfig<TState, TEvent, TContext>): StateMachine<TState, TEvent, TContext> {
  const { id, states, transitions, hooks, maxHistorySize = 1000 } = config;

  // Validate initial state
  if (!states.includes(config.initial)) {
    throw new Error(
      `[StateMachine:${id}] Initial state "${config.initial}" is not in the states list.`,
    );
  }

  // Build a lookup: Map<fromState, Map<event, TransitionDef>>
  const transitionMap = new Map<TState, Map<TEvent, TransitionDef<TState, TEvent, TContext>>>();

  for (const t of transitions) {
    const froms = Array.isArray(t.from) ? t.from : [t.from];
    for (const from of froms) {
      if (!transitionMap.has(from)) {
        transitionMap.set(from, new Map());
      }
      const eventMap = transitionMap.get(from)!;
      if (eventMap.has(t.event)) {
        throw new Error(
          `[StateMachine:${id}] Duplicate transition: ${from} --${t.event}--> (already defined).`,
        );
      }
      eventMap.set(t.event, t);
    }
  }

  // Mutable internal state
  let currentState: TState = config.initial;
  let context: TContext = { ...config.context };
  let history: TransitionRecord<TState, TEvent>[] = [];
  const createdAt = Date.now();
  let updatedAt = createdAt;

  // -- helpers --------------------------------------------------------------

  function findTransition(
    event: TEvent,
  ): TransitionDef<TState, TEvent, TContext> | undefined {
    return transitionMap.get(currentState)?.get(event);
  }

  function pruneHistory(): void {
    if (history.length > maxHistorySize) {
      history = history.slice(history.length - maxHistorySize);
    }
  }

  async function runHooksAsync(
    from: TState,
    to: TState,
    event: TEvent,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!hooks) return;

    // onExit
    const exitHook = hooks.onExit?.[from];
    if (exitHook) await exitHook(context, event, from, to, metadata);

    // onEnter
    const enterHook = hooks.onEnter?.[to];
    if (enterHook) await enterHook(context, event, from, to, metadata);

    // onTransition
    if (hooks.onTransition) {
      await hooks.onTransition(context, event, from, to, metadata);
    }
  }

  function runHooksSync(
    from: TState,
    to: TState,
    event: TEvent,
    metadata?: Record<string, unknown>,
  ): void {
    if (!hooks) return;

    const exitHook = hooks.onExit?.[from];
    if (exitHook) {
      const result = exitHook(context, event, from, to, metadata);
      // Fire-and-forget for promises in sync mode
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {
          /* swallowed in sync mode */
        });
      }
    }

    const enterHook = hooks.onEnter?.[to];
    if (enterHook) {
      const result = enterHook(context, event, from, to, metadata);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {});
      }
    }

    if (hooks.onTransition) {
      const result = hooks.onTransition(context, event, from, to, metadata);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {});
      }
    }
  }

  function executeTransition(
    tDef: TransitionDef<TState, TEvent, TContext>,
    event: TEvent,
    metadata?: Record<string, unknown>,
  ): TransitionResult<TState, TEvent> {
    const from = currentState;
    const to = tDef.to;

    // Guard check
    if (tDef.guard && !tDef.guard(context, event, from, to)) {
      return {
        ok: false,
        reason: "guard_failed",
        from,
        event,
        guardDescription: tDef.guardDescription,
      };
    }

    // Commit state change
    currentState = to;
    updatedAt = Date.now();

    // Record history
    const record: TransitionRecord<TState, TEvent> = {
      from,
      to,
      event,
      timestamp: updatedAt,
      metadata,
    };
    history.push(record);
    pruneHistory();

    return { ok: true, from, to, event };
  }

  // -- public API -----------------------------------------------------------

  const machine: StateMachine<TState, TEvent, TContext> = {
    id,

    getState() {
      return currentState;
    },

    getContext() {
      return Object.freeze({ ...context }) as Readonly<TContext>;
    },

    setContext(partial: Partial<TContext>) {
      context = { ...context, ...partial };
      updatedAt = Date.now();
    },

    async transition(event, metadata) {
      const tDef = findTransition(event);
      if (!tDef) {
        return { ok: false, reason: "no_transition", from: currentState, event } as TransitionDenied<TState, TEvent>;
      }

      const from = currentState;
      const result = executeTransition(tDef, event, metadata);

      if (result.ok) {
        await runHooksAsync(from, result.to, event, metadata);
      }

      return result;
    },

    transitionSync(event, metadata) {
      const tDef = findTransition(event);
      if (!tDef) {
        return { ok: false, reason: "no_transition", from: currentState, event } as TransitionDenied<TState, TEvent>;
      }

      const from = currentState;
      const result = executeTransition(tDef, event, metadata);

      if (result.ok) {
        runHooksSync(from, result.to, event, metadata);
      }

      return result;
    },

    canTransition(event) {
      const tDef = findTransition(event);
      if (!tDef) return false;
      if (tDef.guard && !tDef.guard(context, event, currentState, tDef.to)) return false;
      return true;
    },

    availableEvents() {
      const eventMap = transitionMap.get(currentState);
      if (!eventMap) return [];
      const available: TEvent[] = [];
      for (const [evt, tDef] of eventMap) {
        if (!tDef.guard || tDef.guard(context, evt, currentState, tDef.to)) {
          available.push(evt);
        }
      }
      return available;
    },

    getHistory() {
      return Object.freeze([...history]) as ReadonlyArray<TransitionRecord<TState, TEvent>>;
    },

    serialize(): MachineSnapshot<TState, TEvent, TContext> {
      return {
        id,
        currentState,
        context: { ...context },
        history: [...history],
        createdAt,
        updatedAt,
      };
    },

    restore(snapshot) {
      if (snapshot.id !== id) {
        throw new Error(
          `[StateMachine:${id}] Cannot restore snapshot from machine "${snapshot.id}".`,
        );
      }
      if (!states.includes(snapshot.currentState)) {
        throw new Error(
          `[StateMachine:${id}] Snapshot state "${snapshot.currentState}" is not valid.`,
        );
      }
      currentState = snapshot.currentState;
      context = { ...snapshot.context };
      history = [...snapshot.history];
      updatedAt = Date.now();
    },
  };

  return machine;
}
