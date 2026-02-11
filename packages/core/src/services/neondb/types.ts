/**
 * NeonDB TypeScript Types - Inferred from Drizzle ORM Schema
 *
 * These types are the canonical TypeScript representation of the financial
 * database schema. They are inferred directly from the Drizzle table
 * definitions to ensure they stay in sync with the actual database structure.
 *
 * Convention:
 * - `Select*` types represent rows read FROM the database
 * - `Insert*` types represent rows being written TO the database
 * - `*` (base) types alias to Select for convenience
 *
 * IMPORTANT: Never manually define types that duplicate schema columns.
 * Always infer from the schema to maintain a single source of truth.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  financialAccounts,
  ledgerTransactions,
  ledgerEntries,
  orders,
  trades,
  settlements,
  balancesSnapshot,
  idempotencyKeys,
  auditTrail,
} from "./schema";

// ============================================================================
// Financial Accounts
// ============================================================================

export type FinancialAccount = InferSelectModel<typeof financialAccounts>;
export type InsertFinancialAccount = InferInsertModel<typeof financialAccounts>;
export type SelectFinancialAccount = FinancialAccount;

export type AccountType = FinancialAccount["accountType"];
export type AccountStatus = FinancialAccount["accountStatus"];
export type Currency = FinancialAccount["currency"];

// ============================================================================
// Ledger Transactions
// ============================================================================

export type LedgerTransaction = InferSelectModel<typeof ledgerTransactions>;
export type InsertLedgerTransaction = InferInsertModel<typeof ledgerTransactions>;
export type SelectLedgerTransaction = LedgerTransaction;

export type TransactionType = LedgerTransaction["transactionType"];
export type TransactionStatus = LedgerTransaction["transactionStatus"];

// ============================================================================
// Ledger Entries
// ============================================================================

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;
export type InsertLedgerEntry = InferInsertModel<typeof ledgerEntries>;
export type SelectLedgerEntry = LedgerEntry;

export type EntryType = LedgerEntry["entryType"];

// ============================================================================
// Orders
// ============================================================================

export type Order = InferSelectModel<typeof orders>;
export type InsertOrder = InferInsertModel<typeof orders>;
export type SelectOrder = Order;

export type OrderSide = Order["side"];
export type OrderType = Order["orderType"];
export type OrderStatus = Order["status"];
export type TimeInForce = Order["timeInForce"];
export type MarketType = Order["marketType"];

// ============================================================================
// Trades
// ============================================================================

export type Trade = InferSelectModel<typeof trades>;
export type InsertTrade = InferInsertModel<typeof trades>;
export type SelectTrade = Trade;

export type TradeStatus = Trade["status"];

// ============================================================================
// Settlements
// ============================================================================

export type Settlement = InferSelectModel<typeof settlements>;
export type InsertSettlement = InferInsertModel<typeof settlements>;
export type SelectSettlement = Settlement;

export type SettlementType = Settlement["settlementType"];
export type SettlementStatus = Settlement["status"];

// ============================================================================
// Balance Snapshots
// ============================================================================

export type BalanceSnapshot = InferSelectModel<typeof balancesSnapshot>;
export type InsertBalanceSnapshot = InferInsertModel<typeof balancesSnapshot>;
export type SelectBalanceSnapshot = BalanceSnapshot;

// ============================================================================
// Idempotency Keys
// ============================================================================

export type IdempotencyKey = InferSelectModel<typeof idempotencyKeys>;
export type InsertIdempotencyKey = InferInsertModel<typeof idempotencyKeys>;
export type SelectIdempotencyKey = IdempotencyKey;

// ============================================================================
// Audit Trail
// ============================================================================

export type AuditTrailEntry = InferSelectModel<typeof auditTrail>;
export type InsertAuditTrailEntry = InferInsertModel<typeof auditTrail>;
export type SelectAuditTrailEntry = AuditTrailEntry;

export type AuditAction = AuditTrailEntry["action"];

// ============================================================================
// Composite / Domain Types
// ============================================================================

/**
 * A complete ledger transaction with all its entries.
 * Used when you need to see the full double-entry picture.
 */
export interface LedgerTransactionWithEntries extends LedgerTransaction {
  entries: LedgerEntry[];
}

/**
 * An account with its current computed balance.
 * Balance is derived from the latest ledger entry's balanceAfter field.
 */
export interface AccountWithBalance extends FinancialAccount {
  currentBalance: string;       // numeric as string
  availableBalance: string;     // balance minus held in escrow
  heldBalance: string;          // amount locked in open orders
  lastSequenceNumber: number;
}

/**
 * An order with its associated trade history.
 */
export interface OrderWithTrades extends Order {
  trades: Trade[];
}

/**
 * A trade with full order context for both parties.
 */
export interface TradeWithOrders extends Trade {
  buyOrder: Order;
  sellOrder: Order;
}

/**
 * Settlement with all associated trades.
 */
export interface SettlementWithTrades extends Settlement {
  trades: Trade[];
}

/**
 * Parameters for creating a new ledger transaction with entries.
 * This is the primary input type for the financial engine.
 */
export interface CreateLedgerTransactionParams {
  transactionType: TransactionType;
  description: string;
  currency: Currency;
  amount: string;         // numeric as string to avoid floating point
  initiatedBy: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  entries: CreateLedgerEntryParams[];
}

/**
 * Parameters for a single ledger entry within a transaction.
 */
export interface CreateLedgerEntryParams {
  accountId: string;
  entryType: EntryType;
  amount: string;         // numeric as string
  description?: string;
}

/**
 * Parameters for placing a new order.
 */
export interface PlaceOrderParams {
  userId: string;
  clientOrderId?: string;
  marketType: MarketType;
  marketId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce?: TimeInForce;
  price?: string;
  stopPrice?: string;
  quantity: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a balance reconciliation check.
 */
export interface ReconciliationResult {
  accountId: string;
  expectedBalance: string;     // Sum of all ledger entries
  actualBalance: string;       // Latest snapshot or derived balance
  discrepancy: string;         // Difference (should be "0")
  isReconciled: boolean;
  checkedAt: Date;
  entryCount: number;
  lastSequenceNumber: number;
}

/**
 * Parameters for the health check response.
 */
export interface NeonHealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  poolSize?: number;
  poolIdle?: number;
  poolWaiting?: number;
  error?: string;
}

// ============================================================================
// Enum Value Arrays (useful for validation/zod schemas)
// ============================================================================

export const ACCOUNT_TYPES = [
  "user_wallet",
  "user_bonus",
  "user_escrow",
  "platform_revenue",
  "platform_reserve",
  "platform_insurance",
  "settlement_pool",
  "fee_collection",
  "external_deposit",
  "external_withdrawal",
] as const;

export const ACCOUNT_STATUSES = [
  "active",
  "frozen",
  "suspended",
  "closed",
] as const;

export const CURRENCIES = [
  "USD",
  "USDC",
  "BTC",
  "ETH",
  "SOL",
] as const;

export const ENTRY_TYPES = [
  "debit",
  "credit",
] as const;

export const TRANSACTION_TYPES = [
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
  "adjustment",
  "reversal",
  "insurance_payout",
] as const;

export const TRANSACTION_STATUSES = [
  "pending",
  "committed",
  "failed",
  "reversed",
] as const;

export const ORDER_SIDES = [
  "buy",
  "sell",
] as const;

export const ORDER_TYPES = [
  "market",
  "limit",
  "stop",
  "stop_limit",
] as const;

export const ORDER_STATUSES = [
  "pending",
  "open",
  "partial_fill",
  "filled",
  "settled",
  "cancelled",
  "rejected",
  "expired",
] as const;

export const TIME_IN_FORCES = [
  "gtc",
  "ioc",
  "fok",
  "day",
  "gtd",
] as const;

export const TRADE_STATUSES = [
  "executed",
  "settling",
  "settled",
  "settlement_failed",
  "disputed",
] as const;

export const SETTLEMENT_TYPES = [
  "instant",
  "standard",
  "deferred",
] as const;

export const SETTLEMENT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "rolled_back",
] as const;

export const MARKET_TYPES = [
  "prediction",
  "crypto",
  "rwa",
] as const;

export const AUDIT_ACTIONS = [
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
] as const;
