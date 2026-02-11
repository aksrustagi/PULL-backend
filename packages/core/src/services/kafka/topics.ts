/**
 * Kafka Topic Definitions
 *
 * Centralized topic registry for the PULL event bus.
 * All topics follow the naming convention: pull.<domain>
 *
 * Topics are immutable constants to prevent accidental typos
 * and enable compile-time topic validation.
 */

// ============================================================================
// Topic Registry
// ============================================================================

export const TOPICS = {
  /** Trade execution events (fills, partial fills, cancellations) */
  TRADES: "pull.trades",

  /** Order lifecycle events (placed, modified, cancelled, expired) */
  ORDERS: "pull.orders",

  /** Settlement confirmation events */
  SETTLEMENTS: "pull.settlements",

  /** Balance change events (deposits, withdrawals, credits, debits) */
  BALANCES: "pull.balances",

  /** KYC status change events (initiated, pending, approved, rejected) */
  KYC: "pull.kyc",

  /** Audit trail entries for compliance and forensics */
  AUDIT: "pull.audit",

  /** User lifecycle events (signup, login, profile update, deactivation) */
  USERS: "pull.users",

  /** Rewards and points events (earned, redeemed, expired) */
  REWARDS: "pull.rewards",

  /** Prediction market events (created, resolved, voided) */
  PREDICTIONS: "pull.predictions",

  /** Notification dispatch events (email, push, in-app) */
  NOTIFICATIONS: "pull.notifications",
} as const;

/** Union type of all valid topic names */
export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** All topic values as an array for consumer group subscriptions */
export const ALL_TOPICS: Topic[] = Object.values(TOPICS);

// ============================================================================
// Dead Letter Topics
// ============================================================================

/** Dead letter queue topic suffix */
export const DLQ_SUFFIX = ".dlq";

/**
 * Get the dead letter queue topic name for a given topic.
 */
export function getDLQTopic(topic: Topic): string {
  return `${topic}${DLQ_SUFFIX}`;
}

/** Pre-computed DLQ topic map */
export const DLQ_TOPICS = {
  TRADES: getDLQTopic(TOPICS.TRADES),
  ORDERS: getDLQTopic(TOPICS.ORDERS),
  SETTLEMENTS: getDLQTopic(TOPICS.SETTLEMENTS),
  BALANCES: getDLQTopic(TOPICS.BALANCES),
  KYC: getDLQTopic(TOPICS.KYC),
  AUDIT: getDLQTopic(TOPICS.AUDIT),
  USERS: getDLQTopic(TOPICS.USERS),
  REWARDS: getDLQTopic(TOPICS.REWARDS),
  PREDICTIONS: getDLQTopic(TOPICS.PREDICTIONS),
  NOTIFICATIONS: getDLQTopic(TOPICS.NOTIFICATIONS),
} as const;
