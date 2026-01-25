/**
 * Type-safe Convex ID utilities
 *
 * This module provides type-safe wrappers for Convex operations
 * to eliminate unsafe `as any` casts throughout the codebase.
 */

import type { Id } from "@pull/db/convex/_generated/dataModel";

/**
 * Convex table names that have ID types
 */
export type ConvexTable =
  | "users"
  | "orders"
  | "trades"
  | "balances"
  | "positions"
  | "predictions"
  | "markets"
  | "rewards"
  | "pointsTransactions"
  | "kycRecords"
  | "auditLog"
  | "accounts"
  | "fantasyLeagues"
  | "fantasyTeams"
  | "fantasyPlayers"
  | "fantasyMarkets"
  | "messaging"
  | "emails"
  | "socialTrading"
  | "rwa"
  | "rwassets"
  | "dailyMetrics"
  | "analyticsEvents"
  | "experiments"
  | "dataFlywheel";

/**
 * Type guard to check if a string looks like a valid Convex ID
 * Convex IDs are typically in the format: "k..." followed by alphanumeric characters
 */
export function isValidConvexIdFormat(id: string): boolean {
  // Convex IDs start with specific characters and are a certain length
  return typeof id === "string" && id.length > 10 && /^[a-zA-Z0-9]+$/.test(id);
}

/**
 * Convert a string to a typed Convex ID
 * Throws if the format is invalid
 *
 * @param id - The string ID from the request
 * @param table - The table name (for documentation/debugging)
 * @returns The typed Convex ID
 */
export function toConvexId<T extends ConvexTable>(
  id: string,
  table: T
): Id<T> {
  if (!isValidConvexIdFormat(id)) {
    throw new Error(`Invalid ${table} ID format: ${id}`);
  }
  // This cast is safe because we've validated the format
  // and Convex will validate further when the query runs
  return id as unknown as Id<T>;
}

/**
 * Safely convert a string to a Convex ID, returning null if invalid
 */
export function toConvexIdSafe<T extends ConvexTable>(
  id: string | undefined | null,
  table: T
): Id<T> | null {
  if (!id || !isValidConvexIdFormat(id)) {
    return null;
  }
  return id as unknown as Id<T>;
}

/**
 * Convert a user ID string to typed user ID
 * This is the most common conversion needed
 */
export function toUserId(id: string): Id<"users"> {
  return toConvexId(id, "users");
}

/**
 * Convert an order ID string to typed order ID
 */
export function toOrderId(id: string): Id<"orders"> {
  return toConvexId(id, "orders");
}

/**
 * Convert a reward ID string to typed reward ID
 */
export function toRewardId(id: string): Id<"rewards"> {
  return toConvexId(id, "rewards");
}

/**
 * Type-safe query parameters builder
 * Ensures IDs are properly typed before passing to Convex
 */
export interface UserIdParam {
  userId: Id<"users">;
}

export interface OrderIdParam {
  id: Id<"orders">;
}

export interface RewardIdParam {
  rewardId: Id<"rewards">;
}

/**
 * Create user ID parameter from string
 */
export function userIdParam(userId: string): UserIdParam {
  return { userId: toUserId(userId) };
}

/**
 * Branded type for validated user IDs from auth middleware
 * This represents a user ID that has been validated through authentication
 */
export type ValidatedUserId = string & { readonly __brand: "ValidatedUserId" };

/**
 * Mark a user ID as validated (should only be called in auth middleware)
 */
export function markValidatedUserId(userId: string): ValidatedUserId {
  return userId as ValidatedUserId;
}

/**
 * Convert validated user ID to Convex ID (type-safe because it's been validated)
 */
export function validatedUserIdToConvex(userId: ValidatedUserId): Id<"users"> {
  return userId as unknown as Id<"users">;
}
