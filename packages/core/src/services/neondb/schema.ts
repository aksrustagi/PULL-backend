/**
 * NeonDB Drizzle ORM Schema - PULL Financial System of Record
 *
 * This schema defines the IMMUTABLE FINANCIAL LEDGER for the PULL trading platform.
 * Every financial operation is recorded as double-entry bookkeeping: every debit
 * has a corresponding credit. Balances are derived, not stored (except snapshots
 * for reconciliation performance).
 *
 * Design principles:
 * 1. Double-entry bookkeeping - debits always equal credits
 * 2. Immutable ledger entries - never UPDATE or DELETE, only append
 * 3. Numeric precision for money - use `numeric(19,4)` (never float)
 * 4. Optimistic locking via version fields
 * 5. UUID primary keys for global uniqueness
 * 6. Idempotency keys to prevent duplicate operations
 * 7. Complete audit trail
 *
 * Money is stored as numeric(19,4):
 *   - 19 total digits, 4 decimal places
 *   - Max value: 999,999,999,999,999.9999
 *   - Sufficient for any fiat or crypto amount
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================================
// Enums
// ============================================================================

export const accountTypeEnum = pgEnum("account_type", [
  "user_wallet",        // User's main trading wallet
  "user_bonus",         // User's bonus/promotional balance
  "user_escrow",        // User funds locked in open orders
  "platform_revenue",   // Platform fee revenue
  "platform_reserve",   // Platform operational reserve
  "platform_insurance", // Insurance fund for socialized losses
  "settlement_pool",    // Temporary pool during settlement
  "fee_collection",     // Collected fees before distribution
  "external_deposit",   // Inbound funds from external sources
  "external_withdrawal",// Outbound funds to external destinations
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "frozen",     // Temporarily frozen (compliance hold)
  "suspended",  // Suspended pending investigation
  "closed",     // Permanently closed
]);

export const currencyEnum = pgEnum("currency", [
  "USD",
  "USDC",
  "BTC",
  "ETH",
  "SOL",
]);

export const entryTypeEnum = pgEnum("entry_type", [
  "debit",
  "credit",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit",
  "withdrawal",
  "trade_buy",
  "trade_sell",
  "trade_settlement",
  "fee_charge",
  "fee_rebate",
  "bonus_grant",
  "bonus_conversion",
  "bonus_expiry",
  "escrow_lock",
  "escrow_release",
  "escrow_forfeit",
  "pnl_realized",
  "transfer_internal",
  "adjustment",       // Manual adjustment (requires admin approval)
  "reversal",         // Reversal of a previous transaction
  "insurance_payout",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",     // Created, awaiting processing
  "committed",   // Fully committed to ledger
  "failed",      // Failed to process
  "reversed",    // Reversed by a subsequent transaction
]);

export const orderSideEnum = pgEnum("order_side", [
  "buy",
  "sell",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "market",
  "limit",
  "stop",
  "stop_limit",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",       // Created, not yet submitted to matching engine
  "open",          // Active on the order book
  "partial_fill",  // Partially executed
  "filled",        // Fully executed, awaiting settlement
  "settled",       // Fully settled
  "cancelled",     // Cancelled by user or system
  "rejected",      // Rejected by matching engine or risk checks
  "expired",       // Time-in-force expired
]);

export const timeInForceEnum = pgEnum("time_in_force", [
  "gtc",   // Good til cancelled
  "ioc",   // Immediate or cancel
  "fok",   // Fill or kill
  "day",   // Day order
  "gtd",   // Good til date
]);

export const tradeStatusEnum = pgEnum("trade_status", [
  "executed",        // Matched, pending settlement
  "settling",        // Settlement in progress
  "settled",         // Fully settled
  "settlement_failed", // Settlement failed (needs intervention)
  "disputed",        // Under dispute
]);

export const settlementTypeEnum = pgEnum("settlement_type", [
  "instant",    // T+0 - crypto trades
  "standard",   // T+1 - prediction markets
  "deferred",   // Custom settlement schedule
]);

export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "rolled_back",
]);

export const marketTypeEnum = pgEnum("market_type", [
  "prediction",
  "crypto",
  "rwa",        // Real-world assets
]);

export const auditActionEnum = pgEnum("audit_action", [
  "account_created",
  "account_frozen",
  "account_unfrozen",
  "account_closed",
  "deposit_initiated",
  "deposit_completed",
  "withdrawal_initiated",
  "withdrawal_completed",
  "withdrawal_failed",
  "order_placed",
  "order_cancelled",
  "order_modified",
  "trade_executed",
  "trade_settled",
  "settlement_initiated",
  "settlement_completed",
  "settlement_failed",
  "balance_adjustment",
  "reconciliation_started",
  "reconciliation_completed",
  "reconciliation_mismatch",
  "admin_override",
  "compliance_hold",
  "compliance_release",
]);

// ============================================================================
// Table: financial_accounts
// Chart of accounts - every entity that can hold a balance
// ============================================================================

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Owner identification
    userId: varchar("user_id", { length: 255 }),  // null for platform accounts
    accountType: accountTypeEnum("account_type").notNull(),
    accountStatus: accountStatusEnum("account_status").notNull().default("active"),
    currency: currencyEnum("currency").notNull().default("USD"),

    // Human-readable label (e.g., "John's Trading Wallet", "Platform Fee Pool")
    label: varchar("label", { length: 255 }).notNull(),

    // Account metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Optimistic locking
    version: integer("version").notNull().default(1),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_financial_accounts_user_id").on(table.userId),
    index("idx_financial_accounts_type").on(table.accountType),
    index("idx_financial_accounts_status").on(table.accountStatus),
    uniqueIndex("idx_financial_accounts_user_currency_type").on(
      table.userId,
      table.currency,
      table.accountType
    ),
  ]
);

// ============================================================================
// Table: ledger_transactions
// Groups related ledger entries into atomic double-entry transactions
// ============================================================================

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Transaction classification
    transactionType: transactionTypeEnum("transaction_type").notNull(),
    transactionStatus: transactionStatusEnum("transaction_status").notNull().default("pending"),

    // Reference to the business operation that caused this transaction
    referenceType: varchar("reference_type", { length: 50 }),  // 'order', 'trade', 'deposit', etc.
    referenceId: uuid("reference_id"),                           // ID of the referenced entity

    // Idempotency
    idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),

    // Human-readable description
    description: text("description").notNull(),

    // The currency this transaction operates in
    currency: currencyEnum("currency").notNull().default("USD"),

    // Net amount of the transaction (sum of all debits, which must equal sum of credits)
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),

    // Who or what initiated this transaction
    initiatedBy: varchar("initiated_by", { length: 255 }).notNull(), // userId or 'system'
    approvedBy: varchar("approved_by", { length: 255 }),             // For adjustments requiring approval

    // Reversal tracking
    reversesTransactionId: uuid("reverses_transaction_id"),
    reversedByTransactionId: uuid("reversed_by_transaction_id"),

    // Additional context
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),

    // Error information if failed
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_ledger_tx_type").on(table.transactionType),
    index("idx_ledger_tx_status").on(table.transactionStatus),
    index("idx_ledger_tx_reference").on(table.referenceType, table.referenceId),
    index("idx_ledger_tx_initiated_by").on(table.initiatedBy),
    index("idx_ledger_tx_created_at").on(table.createdAt),
    uniqueIndex("idx_ledger_tx_idempotency").on(table.idempotencyKey),
  ]
);

// ============================================================================
// Table: ledger_entries
// Individual debit/credit entries - the atomic units of the ledger
// Debits ALWAYS equal credits within a transaction
// ============================================================================

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Parent transaction
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),

    // Which account is affected
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),

    // Debit or credit
    entryType: entryTypeEnum("entry_type").notNull(),

    // Amount (always positive; entryType indicates direction)
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),

    // Currency must match the account currency
    currency: currencyEnum("currency").notNull().default("USD"),

    // Running balance AFTER this entry (for fast balance lookups)
    balanceAfter: numeric("balance_after", { precision: 19, scale: 4 }).notNull(),

    // Sequence number within the account (monotonically increasing)
    sequenceNumber: integer("sequence_number").notNull(),

    // Description for this specific entry
    description: text("description"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ledger_entries_transaction").on(table.transactionId),
    index("idx_ledger_entries_account").on(table.accountId),
    index("idx_ledger_entries_account_seq").on(table.accountId, table.sequenceNumber),
    index("idx_ledger_entries_created_at").on(table.createdAt),
    uniqueIndex("idx_ledger_entries_account_sequence").on(
      table.accountId,
      table.sequenceNumber
    ),
    // Ensure amount is always positive
    check("chk_ledger_entry_amount_positive", sql`amount > 0`),
  ]
);

// ============================================================================
// Table: orders
// Order book with proper state machine
// ============================================================================

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Order identification
    userId: varchar("user_id", { length: 255 }).notNull(),
    clientOrderId: varchar("client_order_id", { length: 255 }),  // Client-specified idempotency ID

    // Market context
    marketType: marketTypeEnum("market_type").notNull(),
    marketId: varchar("market_id", { length: 255 }).notNull(),   // Kalshi event, crypto pair, etc.
    symbol: varchar("symbol", { length: 50 }).notNull(),          // e.g., "BTC-USD", "KXBTC-24FEB"

    // Order specification
    side: orderSideEnum("side").notNull(),
    orderType: orderTypeEnum("order_type").notNull(),
    timeInForce: timeInForceEnum("time_in_force").notNull().default("gtc"),

    // Pricing (numeric, never float)
    price: numeric("price", { precision: 19, scale: 4 }),           // null for market orders
    stopPrice: numeric("stop_price", { precision: 19, scale: 4 }), // For stop/stop-limit orders
    quantity: numeric("quantity", { precision: 19, scale: 8 }).notNull(),
    filledQuantity: numeric("filled_quantity", { precision: 19, scale: 8 }).notNull().default("0"),
    remainingQuantity: numeric("remaining_quantity", { precision: 19, scale: 8 }).notNull(),

    // Average fill price (updated as fills come in)
    avgFillPrice: numeric("avg_fill_price", { precision: 19, scale: 4 }),

    // Fees
    estimatedFee: numeric("estimated_fee", { precision: 19, scale: 4 }).notNull().default("0"),
    actualFee: numeric("actual_fee", { precision: 19, scale: 4 }).notNull().default("0"),

    // State
    status: orderStatusEnum("status").notNull().default("pending"),

    // Escrow account for locked funds
    escrowAccountId: uuid("escrow_account_id").references(() => financialAccounts.id),

    // Expiry for GTD orders
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // External exchange reference (if routed to Kalshi, Massive, etc.)
    externalOrderId: varchar("external_order_id", { length: 255 }),
    externalVenue: varchar("external_venue", { length: 50 }),

    // Cancellation/rejection info
    cancelReason: text("cancel_reason"),
    rejectReason: text("reject_reason"),

    // Metadata for order routing, risk checks, etc.
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Optimistic locking
    version: integer("version").notNull().default(1),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    expiresAtActual: timestamp("expires_at_actual", { withTimezone: true }),
  },
  (table) => [
    index("idx_orders_user_id").on(table.userId),
    index("idx_orders_market").on(table.marketId),
    index("idx_orders_symbol").on(table.symbol),
    index("idx_orders_status").on(table.status),
    index("idx_orders_user_status").on(table.userId, table.status),
    index("idx_orders_market_status").on(table.marketId, table.status),
    index("idx_orders_created_at").on(table.createdAt),
    index("idx_orders_external").on(table.externalVenue, table.externalOrderId),
    uniqueIndex("idx_orders_client_order_id").on(table.userId, table.clientOrderId),
    // Quantity constraints
    check("chk_order_quantity_positive", sql`quantity > 0`),
    check("chk_order_filled_non_negative", sql`filled_quantity >= 0`),
    check("chk_order_remaining_non_negative", sql`remaining_quantity >= 0`),
    check("chk_order_price_positive", sql`price IS NULL OR price > 0`),
  ]
);

// ============================================================================
// Table: trades
// Executed trades with settlement tracking
// ============================================================================

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Trade parties
    buyOrderId: uuid("buy_order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sellOrderId: uuid("sell_order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    buyerUserId: varchar("buyer_user_id", { length: 255 }).notNull(),
    sellerUserId: varchar("seller_user_id", { length: 255 }).notNull(),

    // Trade details
    marketType: marketTypeEnum("market_type").notNull(),
    marketId: varchar("market_id", { length: 255 }).notNull(),
    symbol: varchar("symbol", { length: 50 }).notNull(),

    // Execution
    price: numeric("price", { precision: 19, scale: 4 }).notNull(),
    quantity: numeric("quantity", { precision: 19, scale: 8 }).notNull(),
    totalValue: numeric("total_value", { precision: 19, scale: 4 }).notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),

    // Fees
    buyerFee: numeric("buyer_fee", { precision: 19, scale: 4 }).notNull().default("0"),
    sellerFee: numeric("seller_fee", { precision: 19, scale: 4 }).notNull().default("0"),
    platformFee: numeric("platform_fee", { precision: 19, scale: 4 }).notNull().default("0"),

    // Settlement
    status: tradeStatusEnum("status").notNull().default("executed"),
    settlementId: uuid("settlement_id"),  // Set when settlement begins

    // External reference (trade ID on external venue)
    externalTradeId: varchar("external_trade_id", { length: 255 }),
    externalVenue: varchar("external_venue", { length: 50 }),

    // Ledger transaction that recorded this trade
    ledgerTransactionId: uuid("ledger_transaction_id"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamps
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trades_buyer").on(table.buyerUserId),
    index("idx_trades_seller").on(table.sellerUserId),
    index("idx_trades_market").on(table.marketId),
    index("idx_trades_symbol").on(table.symbol),
    index("idx_trades_status").on(table.status),
    index("idx_trades_settlement").on(table.settlementId),
    index("idx_trades_executed_at").on(table.executedAt),
    index("idx_trades_external").on(table.externalVenue, table.externalTradeId),
    // Price and quantity must be positive
    check("chk_trade_price_positive", sql`price > 0`),
    check("chk_trade_quantity_positive", sql`quantity > 0`),
    check("chk_trade_value_positive", sql`total_value > 0`),
    check("chk_trade_fees_non_negative", sql`buyer_fee >= 0 AND seller_fee >= 0 AND platform_fee >= 0`),
  ]
);

// ============================================================================
// Table: settlements
// Settlement records - the final step where money actually moves
// ============================================================================

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // What is being settled
    settlementType: settlementTypeEnum("settlement_type").notNull(),

    // Batch settlement can include multiple trades
    tradeIds: uuid("trade_ids").array().notNull(),

    // Settlement amounts
    totalAmount: numeric("total_amount", { precision: 19, scale: 4 }).notNull(),
    totalFees: numeric("total_fees", { precision: 19, scale: 4 }).notNull().default("0"),
    currency: currencyEnum("currency").notNull().default("USD"),

    // State
    status: settlementStatusEnum("status").notNull().default("pending"),

    // Ledger transactions created during settlement
    ledgerTransactionIds: uuid("ledger_transaction_ids").array().default(sql`ARRAY[]::uuid[]`),

    // Settlement window
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),

    // Error handling
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),

    // For rollbacks
    rollbackTransactionId: uuid("rollback_transaction_id"),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_settlements_type").on(table.settlementType),
    index("idx_settlements_status").on(table.status),
    index("idx_settlements_scheduled_at").on(table.scheduledAt),
    index("idx_settlements_created_at").on(table.createdAt),
    // Total amount must be positive
    check("chk_settlement_amount_positive", sql`total_amount > 0`),
    check("chk_settlement_fees_non_negative", sql`total_fees >= 0`),
    check("chk_settlement_retry_non_negative", sql`retry_count >= 0`),
  ]
);

// ============================================================================
// Table: balances_snapshot
// Periodic balance snapshots for reconciliation and fast reads
// ============================================================================

export const balancesSnapshot = pgTable(
  "balances_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Which account
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),

    // Balance at snapshot time
    balance: numeric("balance", { precision: 19, scale: 4 }).notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),

    // Available balance (total minus held in escrow)
    availableBalance: numeric("available_balance", { precision: 19, scale: 4 }).notNull(),
    heldBalance: numeric("held_balance", { precision: 19, scale: 4 }).notNull().default("0"),

    // The last ledger entry sequence number included in this snapshot
    lastSequenceNumber: integer("last_sequence_number").notNull(),
    lastEntryId: uuid("last_entry_id").references(() => ledgerEntries.id),

    // Snapshot metadata
    snapshotReason: varchar("snapshot_reason", { length: 50 }).notNull(), // 'periodic', 'reconciliation', 'eod'
    isReconciled: boolean("is_reconciled").notNull().default(false),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: varchar("reconciled_by", { length: 255 }),
    discrepancy: numeric("discrepancy", { precision: 19, scale: 4 }),

    // Timestamps
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_balances_snapshot_account").on(table.accountId),
    index("idx_balances_snapshot_at").on(table.snapshotAt),
    index("idx_balances_snapshot_account_time").on(table.accountId, table.snapshotAt),
    index("idx_balances_snapshot_reconciled").on(table.isReconciled),
  ]
);

// ============================================================================
// Table: idempotency_keys
// Prevent duplicate financial operations
// ============================================================================

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // The unique key provided by the caller
    key: varchar("key", { length: 255 }).notNull().unique(),

    // What operation this key is for
    operationType: varchar("operation_type", { length: 100 }).notNull(),

    // The result of the operation (stored so we can return the same result on retry)
    requestHash: varchar("request_hash", { length: 64 }).notNull(), // SHA-256 of the request body
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),

    // The ledger transaction that was created (if any)
    ledgerTransactionId: uuid("ledger_transaction_id"),

    // Locking: we use SELECT FOR UPDATE on this row to serialize concurrent requests
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 255 }),

    // Auto-expire old keys
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idx_idempotency_keys_key").on(table.key),
    index("idx_idempotency_keys_expires").on(table.expiresAt),
    index("idx_idempotency_keys_operation").on(table.operationType),
  ]
);

// ============================================================================
// Table: audit_trail
// Immutable audit log of all financial operations
// ============================================================================

export const auditTrail = pgTable(
  "audit_trail",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // What happened
    action: auditActionEnum("action").notNull(),

    // Who did it
    actorId: varchar("actor_id", { length: 255 }).notNull(),    // userId or 'system'
    actorType: varchar("actor_type", { length: 50 }).notNull(),  // 'user', 'admin', 'system', 'worker'
    actorIp: varchar("actor_ip", { length: 45 }),                // IPv6 max length

    // What entity was affected
    entityType: varchar("entity_type", { length: 50 }).notNull(), // 'account', 'order', 'trade', etc.
    entityId: uuid("entity_id").notNull(),

    // Change details
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),
    changeSummary: text("change_summary").notNull(),

    // Related entities for cross-referencing
    relatedEntityType: varchar("related_entity_type", { length: 50 }),
    relatedEntityId: uuid("related_entity_id"),

    // Correlation for distributed tracing
    correlationId: varchar("correlation_id", { length: 255 }),
    traceId: varchar("trace_id", { length: 64 }),
    spanId: varchar("span_id", { length: 32 }),

    // Request context
    requestMethod: varchar("request_method", { length: 10 }),
    requestPath: varchar("request_path", { length: 500 }),
    userAgent: text("user_agent"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamp - the ONLY timestamp that matters for audit
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),

    // This table is append-only. No updated_at.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_trail_action").on(table.action),
    index("idx_audit_trail_actor").on(table.actorId),
    index("idx_audit_trail_entity").on(table.entityType, table.entityId),
    index("idx_audit_trail_occurred_at").on(table.occurredAt),
    index("idx_audit_trail_correlation").on(table.correlationId),
    index("idx_audit_trail_related").on(table.relatedEntityType, table.relatedEntityId),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const financialAccountsRelations = relations(financialAccounts, ({ many }) => ({
  ledgerEntries: many(ledgerEntries),
  balanceSnapshots: many(balancesSnapshot),
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ many, one }) => ({
  entries: many(ledgerEntries),
  reversesTransaction: one(ledgerTransactions, {
    fields: [ledgerTransactions.reversesTransactionId],
    references: [ledgerTransactions.id],
    relationName: "reversal",
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.transactionId],
    references: [ledgerTransactions.id],
  }),
  account: one(financialAccounts, {
    fields: [ledgerEntries.accountId],
    references: [financialAccounts.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  buyTrades: many(trades, { relationName: "buyOrder" }),
  sellTrades: many(trades, { relationName: "sellOrder" }),
  escrowAccount: one(financialAccounts, {
    fields: [orders.escrowAccountId],
    references: [financialAccounts.id],
  }),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  buyOrder: one(orders, {
    fields: [trades.buyOrderId],
    references: [orders.id],
    relationName: "buyOrder",
  }),
  sellOrder: one(orders, {
    fields: [trades.sellOrderId],
    references: [orders.id],
    relationName: "sellOrder",
  }),
  settlement: one(settlements, {
    fields: [trades.settlementId],
    references: [settlements.id],
  }),
}));

export const balancesSnapshotRelations = relations(balancesSnapshot, ({ one }) => ({
  account: one(financialAccounts, {
    fields: [balancesSnapshot.accountId],
    references: [financialAccounts.id],
  }),
  lastEntry: one(ledgerEntries, {
    fields: [balancesSnapshot.lastEntryId],
    references: [ledgerEntries.id],
  }),
}));
