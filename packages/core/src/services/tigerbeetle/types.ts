/**
 * TigerBeetle Types - Financial Accounting Primitives
 *
 * Type definitions for the PULL platform's double-entry bookkeeping engine.
 * All monetary amounts are stored as unsigned 128-bit integers in the smallest
 * currency unit (e.g., cents for USD, satoshis for BTC) to eliminate
 * floating-point precision errors.
 *
 * TigerBeetle uses 128-bit IDs natively. We encode user IDs and account codes
 * into these 128-bit IDs deterministically so that account lookups are O(1)
 * without requiring an external mapping table.
 */

// ============================================================================
// Account Codes (Chart of Accounts)
// ============================================================================

/**
 * Standard account codes for the PULL chart of accounts.
 *
 * Account codes are embedded into the TigerBeetle account ID alongside
 * the user ID to form a unique, deterministic 128-bit identifier.
 *
 * Ranges:
 *   1-99:   User-level accounts (one set per user per ledger)
 *   100-199: Platform operational accounts (singleton per ledger)
 *   200-299: Settlement accounts
 *   300-399: Escrow accounts
 */
export const ACCOUNT_CODES = {
  // User accounts (one per user per currency)
  USER_USD: 1,
  USER_CRYPTO: 2,
  USER_POINTS: 3,
  USER_TOKEN: 4,

  // Platform accounts
  PLATFORM_RESERVE: 100,
  PLATFORM_FEE: 101,
  PLATFORM_INSURANCE: 102,
  PLATFORM_REWARDS_POOL: 103,
  PLATFORM_STAKING_POOL: 104,

  // Settlement accounts
  SETTLEMENT_PENDING: 200,
  SETTLEMENT_CLEARED: 201,

  // Escrow accounts
  ESCROW_ORDERS: 300,
  ESCROW_PREDICTIONS: 301,
  ESCROW_RWA: 302,
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

// ============================================================================
// Ledger IDs (Asset Types)
// ============================================================================

/**
 * Ledger IDs partition the accounting system by asset type.
 * Transfers can only occur between accounts on the same ledger,
 * preventing accidental cross-asset movement (e.g., USD -> BTC).
 *
 * Cross-asset operations (e.g., buying BTC with USD) require two
 * linked transfers on their respective ledgers.
 */
export const LEDGERS = {
  USD: 1,
  BTC: 2,
  ETH: 3,
  PULL_TOKEN: 4,
  POINTS: 5,
  PREDICTION_CONTRACTS: 6,
  RWA_SHARES: 7,
} as const;

export type LedgerId = (typeof LEDGERS)[keyof typeof LEDGERS];

// ============================================================================
// Configuration
// ============================================================================

export interface TigerBeetleConfig {
  /** TigerBeetle cluster ID (default: 0 for single-cluster) */
  clusterId: number;

  /**
   * Replica addresses in the format "host:port".
   * For production, provide all replica addresses for fault tolerance.
   * Example: ["10.0.0.1:3001", "10.0.0.2:3001", "10.0.0.3:3001"]
   */
  replicaAddresses: string[];

  /**
   * Maximum number of concurrent requests to batch.
   * Higher values improve throughput at the cost of latency.
   * Default: 8192
   */
  concurrencyMax?: number;
}

// ============================================================================
// Account Types
// ============================================================================

/**
 * Flags that control account behavior.
 * These map directly to TigerBeetle's AccountFlags bitfield.
 */
export interface AccountFlagOptions {
  /**
   * When true, the account's credits_posted must never exceed debits_posted.
   * Use for liability accounts (e.g., platform reserve) where the balance
   * represents what the platform owes.
   */
  debitsExceedCredits: boolean;

  /**
   * When true, the account's debits_posted must never exceed credits_posted.
   * Use for asset accounts (e.g., user wallets) where the balance
   * represents what the user owns. Prevents negative balances.
   */
  creditsExceedDebits: boolean;

  /**
   * When true, this account is linked to the next account in the batch.
   * If creation of any linked account fails, all linked accounts fail.
   * Used for atomic multi-account creation.
   */
  linked: boolean;

  /**
   * When true, this account represents the history of a specific
   * transfer, not a running balance.
   */
  history: boolean;
}

/**
 * Parameters for creating a TigerBeetle account.
 */
export interface CreateAccountParams {
  /** Deterministic 128-bit account ID (encoded from userId + accountCode) */
  id: bigint;

  /**
   * Ledger ID - determines which asset type this account holds.
   * Transfers can only occur between accounts on the same ledger.
   */
  ledger: LedgerId;

  /**
   * Account code from the chart of accounts.
   * Encodes the account's purpose (user wallet, fee, escrow, etc.)
   */
  code: AccountCode;

  /** Behavioral flags for this account */
  flags: Partial<AccountFlagOptions>;

  /**
   * Arbitrary 128-bit value for application-specific data.
   * We use this to store the userId for reverse lookups.
   */
  userData128?: bigint;

  /** Arbitrary 64-bit value for application-specific data */
  userData64?: bigint;

  /** Arbitrary 32-bit value for application-specific data */
  userData32?: number;
}

/**
 * TigerBeetle account balance snapshot.
 * All values are in the smallest currency unit (e.g., cents).
 */
export interface AccountBalance {
  /** Total debits that have been posted (finalized) */
  debitsPosted: bigint;

  /** Total credits that have been posted (finalized) */
  creditsPosted: bigint;

  /** Total debits that are pending (reserved but not finalized) */
  debitsPending: bigint;

  /** Total credits that are pending (reserved but not finalized) */
  creditsPending: bigint;

  /** Net available balance: credits_posted - debits_posted - debits_pending */
  available: bigint;

  /** Net posted balance: credits_posted - debits_posted */
  posted: bigint;

  /** Total pending holds */
  pending: bigint;
}

// ============================================================================
// Transfer Types
// ============================================================================

/**
 * Flags that control transfer behavior.
 * These map directly to TigerBeetle's TransferFlags bitfield.
 */
export interface TransferFlagOptions {
  /**
   * When true, this transfer is linked to the next transfer in the batch.
   * If any linked transfer fails, all linked transfers fail atomically.
   * Essential for implementing multi-leg trades (buyer->seller + buyer->fee).
   */
  linked: boolean;

  /**
   * When true, this transfer creates a pending (two-phase) transfer.
   * The funds are reserved but not yet posted. Must be followed by
   * a post or void operation using the pending transfer's ID.
   */
  pending: boolean;

  /**
   * When true, this transfer posts (finalizes) a previously pending transfer.
   * The pendingId field must reference the original pending transfer.
   */
  postPendingTransfer: boolean;

  /**
   * When true, this transfer voids (cancels) a previously pending transfer.
   * The reserved funds are returned to the debit account.
   */
  voidPendingTransfer: boolean;

  /**
   * When true, the transfer amount will be capped at the debit account's
   * available balance rather than failing. Useful for "transfer whatever
   * is available" operations.
   */
  balancingDebit: boolean;

  /**
   * When true, the transfer amount will be capped at the credit account's
   * available balance rather than failing.
   */
  balancingCredit: boolean;
}

/**
 * Parameters for creating a transfer between two accounts.
 */
export interface CreateTransferParams {
  /** Unique 128-bit transfer ID. Must be globally unique for idempotency. */
  id: bigint;

  /** Account ID to debit (source of funds) */
  debitAccountId: bigint;

  /** Account ID to credit (destination of funds) */
  creditAccountId: bigint;

  /**
   * Transfer amount in the smallest currency unit.
   * Must be > 0 unless using balancing flags.
   */
  amount: bigint;

  /** Ledger ID - must match both accounts' ledger */
  ledger: LedgerId;

  /**
   * Transfer code - categorizes the type of transfer for reporting.
   * Uses the same code space as account codes.
   */
  code: number;

  /** Behavioral flags for this transfer */
  flags: Partial<TransferFlagOptions>;

  /**
   * For post/void operations, the ID of the original pending transfer.
   */
  pendingId?: bigint;

  /** Arbitrary 128-bit value for application data (e.g., order ID) */
  userData128?: bigint;

  /** Arbitrary 64-bit value for application data */
  userData64?: bigint;

  /** Arbitrary 32-bit value for application data */
  userData32?: number;
}

// ============================================================================
// Transfer Codes (categorization)
// ============================================================================

/**
 * Transfer codes categorize each transfer for audit and reporting.
 * These are distinct from account codes -- they describe the "why"
 * of a transfer, not the "what" of an account.
 */
export const TRANSFER_CODES = {
  /** External deposit into the platform */
  DEPOSIT: 1,

  /** External withdrawal from the platform */
  WITHDRAWAL: 2,

  /** Trade execution between two users */
  TRADE: 3,

  /** Platform fee collected on a trade */
  TRADE_FEE: 4,

  /** Funds held for an open order (pending transfer) */
  ORDER_HOLD: 5,

  /** Funds released when an order is canceled */
  ORDER_RELEASE: 6,

  /** Prediction market entry fee */
  PREDICTION_ENTRY: 7,

  /** Prediction market payout */
  PREDICTION_PAYOUT: 8,

  /** Reward distribution (points, tokens, bonuses) */
  REWARD: 9,

  /** Staking deposit */
  STAKING_DEPOSIT: 10,

  /** Staking withdrawal */
  STAKING_WITHDRAWAL: 11,

  /** Staking yield payment */
  STAKING_YIELD: 12,

  /** Insurance pool contribution */
  INSURANCE_PREMIUM: 13,

  /** Insurance payout */
  INSURANCE_CLAIM: 14,

  /** Internal reconciliation adjustment */
  RECONCILIATION: 15,

  /** Referral bonus */
  REFERRAL_BONUS: 16,

  /** Deposit bonus (promotional) */
  DEPOSIT_BONUS: 17,

  /** RWA (Real World Asset) share purchase */
  RWA_PURCHASE: 18,

  /** RWA dividend payment */
  RWA_DIVIDEND: 19,
} as const;

export type TransferCode = (typeof TRANSFER_CODES)[keyof typeof TRANSFER_CODES];

// ============================================================================
// Operation Result Types
// ============================================================================

/**
 * Result of a deposit operation.
 */
export interface DepositResult {
  /** Whether the deposit was successful */
  success: boolean;

  /** The transfer ID used (for idempotency tracking) */
  transferId: bigint;

  /** Amount deposited in smallest currency unit */
  amount: bigint;

  /** Ledger the deposit was made on */
  ledger: LedgerId;

  /** Updated account balance after deposit */
  balance: AccountBalance;

  /** Timestamp of the operation */
  timestamp: Date;
}

/**
 * Result of a withdrawal operation.
 */
export interface WithdrawalResult {
  /** Whether the withdrawal was successful */
  success: boolean;

  /** The transfer ID used (for idempotency tracking) */
  transferId: bigint;

  /** Amount withdrawn in smallest currency unit */
  amount: bigint;

  /** Ledger the withdrawal was made on */
  ledger: LedgerId;

  /** Updated account balance after withdrawal */
  balance: AccountBalance;

  /** Timestamp of the operation */
  timestamp: Date;
}

/**
 * Result of a trade execution.
 */
export interface TradeResult {
  /** Whether the trade was successful */
  success: boolean;

  /** Transfer ID for the buyer->seller leg */
  tradeTransferId: bigint;

  /** Transfer ID for the buyer->fee leg */
  feeTransferId: bigint;

  /** Principal amount transferred between buyer and seller */
  amount: bigint;

  /** Fee amount collected by the platform */
  fee: bigint;

  /** Ledger the trade was executed on */
  ledger: LedgerId;

  /** Buyer's updated balance */
  buyerBalance: AccountBalance;

  /** Seller's updated balance */
  sellerBalance: AccountBalance;

  /** Timestamp of the operation */
  timestamp: Date;
}

/**
 * Result of an order hold/release operation.
 */
export interface OrderHoldResult {
  /** Whether the operation was successful */
  success: boolean;

  /** The pending transfer ID (needed for release/post) */
  pendingTransferId: bigint;

  /** Amount held or released */
  amount: bigint;

  /** Ledger of the hold */
  ledger: LedgerId;

  /** Updated account balance */
  balance: AccountBalance;

  /** Timestamp of the operation */
  timestamp: Date;
}

/**
 * Result of a reconciliation check.
 */
export interface ReconciliationResult {
  /** Whether TigerBeetle and NeonDB balances match */
  matched: boolean;

  /** User ID that was reconciled */
  userId: string;

  /** Per-ledger reconciliation details */
  ledgers: Array<{
    ledger: LedgerId;
    ledgerName: string;
    tigerbeetleBalance: bigint;
    neondbBalance: bigint;
    difference: bigint;
    matched: boolean;
  }>;

  /** Timestamp of reconciliation */
  timestamp: Date;
}

/**
 * Health check result.
 */
export interface HealthCheckResult {
  /** Whether the cluster is healthy and responding */
  healthy: boolean;

  /** Response latency in milliseconds */
  latencyMs: number;

  /** Cluster ID */
  clusterId: number;

  /** Number of configured replicas */
  replicaCount: number;

  /** Error message if unhealthy */
  error?: string;

  /** Timestamp of the check */
  timestamp: Date;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to TigerBeetle operations.
 * These provide actionable context beyond TigerBeetle's native error codes.
 */
export enum TigerBeetleErrorCode {
  /** The TigerBeetle cluster is unreachable */
  CONNECTION_FAILED = "TIGERBEETLE_CONNECTION_FAILED",

  /** Account creation failed (duplicate ID, invalid flags, etc.) */
  ACCOUNT_CREATION_FAILED = "TIGERBEETLE_ACCOUNT_CREATION_FAILED",

  /** Transfer failed due to insufficient funds */
  INSUFFICIENT_FUNDS = "TIGERBEETLE_INSUFFICIENT_FUNDS",

  /** Transfer creation failed (duplicate ID, invalid accounts, etc.) */
  TRANSFER_FAILED = "TIGERBEETLE_TRANSFER_FAILED",

  /** The referenced account does not exist */
  ACCOUNT_NOT_FOUND = "TIGERBEETLE_ACCOUNT_NOT_FOUND",

  /** The referenced pending transfer does not exist or was already resolved */
  PENDING_TRANSFER_NOT_FOUND = "TIGERBEETLE_PENDING_TRANSFER_NOT_FOUND",

  /** The transfer would violate a balance constraint */
  BALANCE_OVERFLOW = "TIGERBEETLE_BALANCE_OVERFLOW",

  /** Accounts are on different ledgers */
  LEDGER_MISMATCH = "TIGERBEETLE_LEDGER_MISMATCH",

  /** The amount must be greater than zero */
  ZERO_AMOUNT = "TIGERBEETLE_ZERO_AMOUNT",

  /** Reconciliation detected a balance mismatch */
  RECONCILIATION_MISMATCH = "TIGERBEETLE_RECONCILIATION_MISMATCH",

  /** An unexpected internal error occurred */
  INTERNAL_ERROR = "TIGERBEETLE_INTERNAL_ERROR",
}

/**
 * Structured error for TigerBeetle operations.
 * Extends Error for compatibility with standard error handling.
 */
export class TigerBeetleError extends Error {
  public readonly code: TigerBeetleErrorCode;
  public readonly context: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly retryable: boolean;

  constructor(
    code: TigerBeetleErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    retryable = false,
  ) {
    super(`[${code}] ${message}`);
    this.name = "TigerBeetleError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.retryable = retryable;

    // Preserve prototype chain for instanceof checks
    Object.setPrototypeOf(this, TigerBeetleError.prototype);
  }
}

// ============================================================================
// ID Encoding Types
// ============================================================================

/**
 * Describes how a 128-bit TigerBeetle account ID is constructed.
 *
 * Layout (128 bits total):
 *   [64-bit user hash] [32-bit account code] [16-bit ledger] [16-bit reserved]
 *
 * This deterministic encoding means we can compute any account's ID from
 * (userId, accountCode, ledger) without a database lookup.
 */
export interface AccountIdComponents {
  /** Hash of the user ID (first 64 bits) */
  userHash: bigint;

  /** Account code (bits 64-95) */
  accountCode: AccountCode;

  /** Ledger ID (bits 96-111) */
  ledger: LedgerId;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Logger interface compatible with the platform's structured logging.
 */
export interface TigerBeetleLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Batch Operation Types
// ============================================================================

/**
 * A batch of transfers to execute atomically.
 * If any transfer in the batch fails, the entire batch is rejected.
 */
export interface TransferBatch {
  /** Human-readable description for logging */
  description: string;

  /** The transfers in this batch */
  transfers: CreateTransferParams[];
}

/**
 * Result of a batch transfer operation.
 */
export interface TransferBatchResult {
  /** Whether all transfers in the batch succeeded */
  success: boolean;

  /** Number of transfers that succeeded */
  successCount: number;

  /** Number of transfers that failed */
  failureCount: number;

  /** Details of any failures */
  errors: Array<{
    index: number;
    transferId: bigint;
    errorCode: string;
  }>;
}
