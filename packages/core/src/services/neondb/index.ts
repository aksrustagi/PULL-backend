/**
 * NeonDB - PULL Financial System of Record
 *
 * Serverless PostgreSQL via Neon, with Drizzle ORM for type-safe queries.
 *
 * This module is the SOURCE OF TRUTH for all financial data.
 * Convex handles real-time state; NeonDB holds the immutable financial ledger.
 *
 * @example
 * ```ts
 * import { db, poolDb, schema, withSerializableTransaction } from "@pull/core/services/neondb";
 * import { eq } from "drizzle-orm";
 *
 * // Simple query (serverless/edge)
 * const accounts = await db.query.financialAccounts.findMany({
 *   where: eq(schema.financialAccounts.userId, userId),
 * });
 *
 * // Financial transaction (long-running service)
 * const result = await withSerializableTransaction(async (tx) => {
 *   // ... double-entry bookkeeping ...
 * });
 * ```
 */

// ============================================================================
// Client exports
// ============================================================================

export {
  // Drizzle ORM clients
  db,
  poolDb,

  // Raw SQL client
  sql,

  // Pool management
  getPool,
  closeNeonPool,

  // Transaction helper
  withSerializableTransaction,

  // Health check
  checkNeonHealth,

  // Schema re-export
  schema,
} from "./client";

export type { NeonHealthStatus } from "./client";

// ============================================================================
// Schema exports
// ============================================================================

export {
  // Enums
  accountTypeEnum,
  accountStatusEnum,
  currencyEnum,
  entryTypeEnum,
  transactionTypeEnum,
  transactionStatusEnum,
  orderSideEnum,
  orderTypeEnum,
  orderStatusEnum,
  timeInForceEnum,
  tradeStatusEnum,
  settlementTypeEnum,
  settlementStatusEnum,
  marketTypeEnum,
  auditActionEnum,

  // Tables
  financialAccounts,
  ledgerTransactions,
  ledgerEntries,
  orders,
  trades,
  settlements,
  balancesSnapshot,
  idempotencyKeys,
  auditTrail,

  // Relations
  financialAccountsRelations,
  ledgerTransactionsRelations,
  ledgerEntriesRelations,
  ordersRelations,
  tradesRelations,
  balancesSnapshotRelations,
} from "./schema";

// ============================================================================
// Type exports
// ============================================================================

export type {
  // Financial Accounts
  FinancialAccount,
  InsertFinancialAccount,
  SelectFinancialAccount,
  AccountType,
  AccountStatus,
  Currency,

  // Ledger Transactions
  LedgerTransaction,
  InsertLedgerTransaction,
  SelectLedgerTransaction,
  TransactionType,
  TransactionStatus,

  // Ledger Entries
  LedgerEntry,
  InsertLedgerEntry,
  SelectLedgerEntry,
  EntryType,

  // Orders
  Order,
  InsertOrder,
  SelectOrder,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  MarketType,

  // Trades
  Trade,
  InsertTrade,
  SelectTrade,
  TradeStatus,

  // Settlements
  Settlement,
  InsertSettlement,
  SelectSettlement,
  SettlementType,
  SettlementStatus,

  // Balance Snapshots
  BalanceSnapshot,
  InsertBalanceSnapshot,
  SelectBalanceSnapshot,

  // Idempotency Keys
  IdempotencyKey,
  InsertIdempotencyKey,
  SelectIdempotencyKey,

  // Audit Trail
  AuditTrailEntry,
  InsertAuditTrailEntry,
  SelectAuditTrailEntry,
  AuditAction,

  // Composite / Domain Types
  LedgerTransactionWithEntries,
  AccountWithBalance,
  OrderWithTrades,
  TradeWithOrders,
  SettlementWithTrades,
  CreateLedgerTransactionParams,
  CreateLedgerEntryParams,
  PlaceOrderParams,
  ReconciliationResult,
  NeonHealthCheckResult,
} from "./types";

// Enum value arrays for runtime validation
export {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  CURRENCIES,
  ENTRY_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  ORDER_SIDES,
  ORDER_TYPES,
  ORDER_STATUSES,
  TIME_IN_FORCES,
  TRADE_STATUSES,
  SETTLEMENT_TYPES,
  SETTLEMENT_STATUSES,
  MARKET_TYPES,
  AUDIT_ACTIONS,
} from "./types";

// ============================================================================
// Well-known platform account IDs
// These correspond to the seed data in the migration.
// ============================================================================

export const PLATFORM_ACCOUNTS = {
  // USD accounts
  REVENUE_USD: "00000000-0000-0000-0000-000000000001",
  RESERVE_USD: "00000000-0000-0000-0000-000000000002",
  INSURANCE_USD: "00000000-0000-0000-0000-000000000003",
  SETTLEMENT_POOL_USD: "00000000-0000-0000-0000-000000000004",
  FEE_COLLECTION_USD: "00000000-0000-0000-0000-000000000005",
  EXTERNAL_DEPOSIT_USD: "00000000-0000-0000-0000-000000000006",
  EXTERNAL_WITHDRAWAL_USD: "00000000-0000-0000-0000-000000000007",

  // USDC accounts
  REVENUE_USDC: "00000000-0000-0000-0000-000000000011",
  RESERVE_USDC: "00000000-0000-0000-0000-000000000012",
  INSURANCE_USDC: "00000000-0000-0000-0000-000000000013",
} as const;
