/**
 * Saga Pattern Utilities for Temporal Workflows
 * Provides compensation logic and distributed transaction support
 */

import {
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";
import { compensationFailedError } from "./errors";

// ============================================================================
// Types
// ============================================================================

export interface SagaStep<T = unknown> {
  name: string;
  execute: () => Promise<T>;
  compensate: (result: T) => Promise<void>;
}

export interface SagaResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  compensated: boolean;
  failedStep?: string;
  compensationErrors: Array<{ step: string; error: string }>;
}

export interface CompensationAction {
  name: string;
  action: () => Promise<void>;
  executed: boolean;
}

// ============================================================================
// Saga Executor
// ============================================================================

/**
 * Execute a saga with automatic compensation on failure
 *
 * @example
 * const result = await executeSaga([
 *   {
 *     name: "holdFunds",
 *     execute: () => holdBuyingPower(userId, orderId, amount),
 *     compensate: (holdId) => releaseBuyingPower(userId, holdId, amount),
 *   },
 *   {
 *     name: "submitOrder",
 *     execute: () => submitOrderToExchange(order),
 *     compensate: (orderId) => cancelOrder(orderId),
 *   },
 * ]);
 */
export async function executeSaga<T>(
  steps: SagaStep[],
  finalStep?: () => Promise<T>
): Promise<SagaResult<T>> {
  const compensations: CompensationAction[] = [];
  const result: SagaResult<T> = {
    success: false,
    compensated: false,
    compensationErrors: [],
  };

  try {
    // Execute each step and register compensation
    for (const step of steps) {
      const stepResult = await step.execute();

      // Register compensation for this step (LIFO order)
      compensations.unshift({
        name: step.name,
        action: () => step.compensate(stepResult),
        executed: false,
      });
    }

    // Execute final step if provided
    if (finalStep) {
      result.result = await finalStep();
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error : new Error(String(error));
    result.failedStep = compensations.length > 0
      ? steps[steps.length - compensations.length]?.name
      : steps[0]?.name;

    // Run compensations in non-cancellable scope
    await CancellationScope.nonCancellable(async () => {
      for (const compensation of compensations) {
        try {
          await compensation.action();
          compensation.executed = true;
        } catch (compError) {
          result.compensationErrors.push({
            step: compensation.name,
            error: compError instanceof Error ? compError.message : String(compError),
          });
        }
      }
    });

    result.compensated = compensations.some((c) => c.executed);

    // If compensation also failed, throw a compound error
    if (result.compensationErrors.length > 0) {
      throw compensationFailedError(
        result.error.message,
        result.compensationErrors.map((e) => `${e.step}: ${e.error}`).join("; "),
        { failedStep: result.failedStep }
      );
    }

    throw result.error;
  }
}

// ============================================================================
// Compensation Stack
// ============================================================================

/**
 * A compensation stack that can be used to register and execute compensations
 * throughout a workflow
 */
export class CompensationStack {
  private compensations: CompensationAction[] = [];

  /**
   * Register a compensation action
   */
  push(name: string, action: () => Promise<void>): void {
    this.compensations.unshift({
      name,
      action,
      executed: false,
    });
  }

  /**
   * Execute all registered compensations in reverse order
   */
  async compensateAll(): Promise<{ executed: string[]; failed: Array<{ step: string; error: string }> }> {
    const executed: string[] = [];
    const failed: Array<{ step: string; error: string }> = [];

    await CancellationScope.nonCancellable(async () => {
      for (const compensation of this.compensations) {
        if (compensation.executed) continue;

        try {
          await compensation.action();
          compensation.executed = true;
          executed.push(compensation.name);
        } catch (error) {
          failed.push({
            step: compensation.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    return { executed, failed };
  }

  /**
   * Clear all compensations (use after successful completion)
   */
  clear(): void {
    this.compensations = [];
  }

  /**
   * Get count of registered compensations
   */
  get count(): number {
    return this.compensations.length;
  }
}

// ============================================================================
// Safe Activity Execution
// ============================================================================

/**
 * Execute an activity with automatic error handling and optional compensation
 */
export async function safeExecute<T>(
  name: string,
  execute: () => Promise<T>,
  options?: {
    compensate?: (result: T) => Promise<void>;
    compensationStack?: CompensationStack;
    onError?: (error: Error) => void;
  }
): Promise<T> {
  try {
    const result = await execute();

    // Register compensation if provided
    if (options?.compensate && options?.compensationStack) {
      options.compensationStack.push(name, () => options.compensate!(result));
    }

    return result;
  } catch (error) {
    if (options?.onError && error instanceof Error) {
      options.onError(error);
    }
    throw error;
  }
}

// ============================================================================
// Cancellation Helpers
// ============================================================================

/**
 * Check if an error is a cancellation
 */
export function isCancellationError(error: unknown): boolean {
  return isCancellation(error);
}

/**
 * Execute a block that should complete even if workflow is cancelled
 */
export async function nonCancellable<T>(fn: () => Promise<T>): Promise<T> {
  return CancellationScope.nonCancellable(fn);
}

// ============================================================================
// Idempotency Helpers
// ============================================================================

/**
 * Generate an idempotency key for a workflow operation
 */
export function generateIdempotencyKey(
  workflowId: string,
  operation: string,
  ...args: (string | number)[]
): string {
  const argsHash = args.join("-");
  return `${workflowId}:${operation}:${argsHash}`;
}

/**
 * Create a deduplication wrapper for activities
 * Uses workflow-local state to track executed operations
 */
export function createDeduplicator() {
  const executed = new Set<string>();

  return {
    /**
     * Execute an operation only if it hasn't been executed before
     */
    async executeOnce<T>(
      key: string,
      operation: () => Promise<T>,
      defaultValue: T
    ): Promise<T> {
      if (executed.has(key)) {
        return defaultValue;
      }

      const result = await operation();
      executed.add(key);
      return result;
    },

    /**
     * Check if an operation has been executed
     */
    hasExecuted(key: string): boolean {
      return executed.has(key);
    },

    /**
     * Mark an operation as executed without running it
     */
    markExecuted(key: string): void {
      executed.add(key);
    },

    /**
     * Reset the deduplicator state
     */
    reset(): void {
      executed.clear();
    },
  };
}
