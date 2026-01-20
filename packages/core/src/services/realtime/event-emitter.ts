/**
 * Type-safe Event Emitter for WebSocket events
 * Provides strongly-typed event handling for real-time communication
 */

import type { WSEventMap, WSEventType } from "@pull/types";

// ============================================================================
// Types
// ============================================================================

type EventHandler<T> = (data: T) => void;
type WildcardHandler = (event: string, data: unknown) => void;

interface EventHandlerEntry<T> {
  handler: EventHandler<T>;
  once: boolean;
}

// ============================================================================
// TypedEventEmitter Class
// ============================================================================

/**
 * A type-safe event emitter that provides compile-time checking for event names and payloads
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown> = WSEventMap> {
  private handlers: Map<keyof TEvents, EventHandlerEntry<unknown>[]> = new Map();
  private wildcardHandlers: WildcardHandler[] = [];
  private maxListeners: number = 100;

  /**
   * Set maximum number of listeners per event (for memory leak detection)
   */
  setMaxListeners(max: number): this {
    this.maxListeners = max;
    return this;
  }

  /**
   * Get maximum listeners setting
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  /**
   * Add an event listener
   */
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    return this.addHandler(event, handler, false);
  }

  /**
   * Add a one-time event listener
   */
  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    return this.addHandler(event, handler, true);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    const handlers = this.handlers.get(event);
    if (!handlers) return this;

    const index = handlers.findIndex((entry) => entry.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.handlers.delete(event);
    }

    return this;
  }

  /**
   * Remove all listeners for an event (or all events if no event specified)
   */
  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
      this.wildcardHandlers = [];
    }
    return this;
  }

  /**
   * Emit an event
   */
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): boolean {
    let handled = false;

    // Call specific handlers
    const handlers = this.handlers.get(event);
    if (handlers && handlers.length > 0) {
      handled = true;
      const toRemove: EventHandlerEntry<unknown>[] = [];

      for (const entry of handlers) {
        try {
          entry.handler(data);
          if (entry.once) {
            toRemove.push(entry);
          }
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      }

      // Remove one-time handlers
      for (const entry of toRemove) {
        const index = handlers.indexOf(entry);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }

      if (handlers.length === 0) {
        this.handlers.delete(event);
      }
    }

    // Call wildcard handlers
    for (const handler of this.wildcardHandlers) {
      handled = true;
      try {
        handler(String(event), data);
      } catch (error) {
        console.error(`Error in wildcard handler for ${String(event)}:`, error);
      }
    }

    return handled;
  }

  /**
   * Add a wildcard handler that receives all events
   */
  onAny(handler: WildcardHandler): this {
    this.wildcardHandlers.push(handler);
    return this;
  }

  /**
   * Remove a wildcard handler
   */
  offAny(handler: WildcardHandler): this {
    const index = this.wildcardHandlers.indexOf(handler);
    if (index !== -1) {
      this.wildcardHandlers.splice(index, 1);
    }
    return this;
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    const handlers = this.handlers.get(event);
    return handlers ? handlers.length : 0;
  }

  /**
   * Get all listeners for an event
   */
  listeners<K extends keyof TEvents>(event: K): EventHandler<TEvents[K]>[] {
    const handlers = this.handlers.get(event);
    if (!handlers) return [];
    return handlers.map((entry) => entry.handler as EventHandler<TEvents[K]>);
  }

  /**
   * Get all event names that have listeners
   */
  eventNames(): (keyof TEvents)[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Wait for an event to be emitted (returns a promise)
   */
  waitFor<K extends keyof TEvents>(
    event: K,
    options: { timeout?: number; filter?: (data: TEvents[K]) => boolean } = {}
  ): Promise<TEvents[K]> {
    const { timeout, filter } = options;

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const handler: EventHandler<TEvents[K]> = (data) => {
        if (filter && !filter(data)) {
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.off(event, handler);
        resolve(data);
      };

      this.on(event, handler);

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.off(event, handler);
          reject(new Error(`Timeout waiting for event: ${String(event)}`));
        }, timeout);
      }
    });
  }

  /**
   * Create a new scoped emitter that only handles specific events
   */
  scope<K extends keyof TEvents>(...events: K[]): ScopedEventEmitter<TEvents, K> {
    return new ScopedEventEmitter(this, events);
  }

  // Private helper
  private addHandler<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>,
    once: boolean
  ): this {
    let handlers = this.handlers.get(event);

    if (!handlers) {
      handlers = [];
      this.handlers.set(event, handlers);
    }

    // Check max listeners
    if (handlers.length >= this.maxListeners) {
      console.warn(
        `Warning: Event '${String(event)}' has ${handlers.length} listeners. ` +
          `Possible memory leak detected.`
      );
    }

    handlers.push({ handler: handler as EventHandler<unknown>, once });
    return this;
  }
}

// ============================================================================
// Scoped Event Emitter
// ============================================================================

/**
 * A scoped event emitter that only handles a subset of events
 */
export class ScopedEventEmitter<
  TEvents extends Record<string, unknown>,
  TScope extends keyof TEvents
> {
  constructor(
    private readonly parent: TypedEventEmitter<TEvents>,
    private readonly scope: TScope[]
  ) {}

  on<K extends TScope>(event: K, handler: EventHandler<TEvents[K]>): this {
    if (!this.scope.includes(event)) {
      throw new Error(`Event '${String(event)}' is not in scope`);
    }
    this.parent.on(event, handler);
    return this;
  }

  once<K extends TScope>(event: K, handler: EventHandler<TEvents[K]>): this {
    if (!this.scope.includes(event)) {
      throw new Error(`Event '${String(event)}' is not in scope`);
    }
    this.parent.once(event, handler);
    return this;
  }

  off<K extends TScope>(event: K, handler: EventHandler<TEvents[K]>): this {
    this.parent.off(event, handler);
    return this;
  }

  emit<K extends TScope>(event: K, data: TEvents[K]): boolean {
    if (!this.scope.includes(event)) {
      throw new Error(`Event '${String(event)}' is not in scope`);
    }
    return this.parent.emit(event, data);
  }
}

// ============================================================================
// Singleton Instance for Global Events
// ============================================================================

/**
 * Global event emitter for WebSocket events
 * Use this for cross-component communication
 */
export const globalEventEmitter = new TypedEventEmitter<WSEventMap>();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new typed event emitter
 */
export function createEventEmitter<TEvents extends Record<string, unknown> = WSEventMap>(): TypedEventEmitter<TEvents> {
  return new TypedEventEmitter<TEvents>();
}

/**
 * Create a channel-specific event emitter
 */
export function createChannelEmitter(channel: string): TypedEventEmitter<WSEventMap> {
  const emitter = new TypedEventEmitter<WSEventMap>();

  // Tag emitter with channel for debugging
  (emitter as unknown as Record<string, string>)._channel = channel;

  return emitter;
}

export default TypedEventEmitter;
