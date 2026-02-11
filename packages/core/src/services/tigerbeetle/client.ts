/**
 * TigerBeetle Client - Double-Entry Bookkeeping Engine
 *
 * Every financial operation in PULL flows through TigerBeetle:
 * 1. Deposits: User deposits -> credit user account, debit platform reserve
 * 2. Trades: Buyer pays -> debit buyer, credit seller, debit fee account
 * 3. Withdrawals: User withdraws -> debit user account, credit withdrawal reserve
 * 4. Rewards: Points/tokens -> debit rewards pool, credit user account
 *
 * TigerBeetle guarantees:
 * - Balances never go negative (unless configured)
 * - Every debit has a matching credit
 * - Transfers are idempotent (via transfer IDs)
 * - Strict serializability (no dirty reads)
 *
 * Architecture notes:
 * - All amounts are in the smallest unit (cents, satoshis, etc.)
 * - Account IDs are deterministically derived from (userId, code, ledger)
 * - Linked transfers provide atomic multi-leg operations
 * - Two-phase transfers enable order holds and escrow
 */

import {
  createClient as createTBClient,
  type Client as TBClient,
  CreateAccountError,
  CreateTransferError,
  AccountFlags,
  TransferFlags,
} from "tigerbeetle-node";
import { createHash } from "crypto";
import {
  ACCOUNT_CODES,
  LEDGERS,
  TRANSFER_CODES,
  TigerBeetleError,
  TigerBeetleErrorCode,
  type TigerBeetleConfig,
  type TigerBeetleLogger,
  type AccountCode,
  type LedgerId,
  type AccountBalance,
  type AccountIdComponents,
  type CreateAccountParams,
  type CreateTransferParams,
  type DepositResult,
  type WithdrawalResult,
  type TradeResult,
  type OrderHoldResult,
  type ReconciliationResult,
  type HealthCheckResult,
  type TransferBatch,
  type TransferBatchResult,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Platform-level accounts use a fixed "user" hash of 0 */
const PLATFORM_USER_HASH = 0n;

/** Maximum amount representable in TigerBeetle (128-bit unsigned) */
const MAX_AMOUNT = (1n << 128n) - 1n;

/** Account flags for user asset accounts (credits must exceed debits = no negative balance) */
const USER_ACCOUNT_FLAGS: number =
  AccountFlags.debits_must_not_exceed_credits |
  AccountFlags.history;

/** Account flags for platform liability accounts (debits must exceed credits) */
const PLATFORM_LIABILITY_FLAGS: number =
  AccountFlags.credits_must_not_exceed_debits |
  AccountFlags.history;

/** Account flags for platform asset/pool accounts */
const PLATFORM_POOL_FLAGS: number =
  AccountFlags.debits_must_not_exceed_credits |
  AccountFlags.history;

// ============================================================================
// ID Encoding
// ============================================================================

/**
 * Deterministically encode a TigerBeetle 128-bit account ID from components.
 *
 * Layout (128 bits):
 *   [64-bit user hash] [32-bit account code] [16-bit ledger] [16-bit reserved]
 *
 * This ensures that (userId, accountCode, ledger) always maps to the same
 * TigerBeetle account ID without requiring an external lookup table.
 */
function encodeAccountId(
  userId: string,
  accountCode: AccountCode,
  ledger: LedgerId,
): bigint {
  const userHash = hashUserId(userId);

  // Pack into 128-bit integer:
  // bits 127-64: userHash (64 bits)
  // bits  63-32: accountCode (32 bits)
  // bits  31-16: ledger (16 bits)
  // bits  15-0:  reserved (zeroed)
  const id =
    (userHash << 64n) |
    (BigInt(accountCode) << 32n) |
    (BigInt(ledger) << 16n);

  return id;
}

/**
 * Encode a platform-level account ID (no user association).
 */
function encodePlatformAccountId(
  accountCode: AccountCode,
  ledger: LedgerId,
): bigint {
  return encodeAccountId("__platform__", accountCode, ledger);
}

/**
 * Hash a user ID string into a 64-bit unsigned integer.
 * Uses SHA-256 and takes the first 8 bytes for a collision-resistant hash.
 */
function hashUserId(userId: string): bigint {
  const hash = createHash("sha256").update(userId).digest();
  // Read first 8 bytes as big-endian unsigned 64-bit integer
  const hi = BigInt(hash.readUInt32BE(0));
  const lo = BigInt(hash.readUInt32BE(4));
  return (hi << 32n) | lo;
}

/**
 * Decode a 128-bit account ID back to its components.
 * Useful for debugging and logging.
 */
function decodeAccountId(id: bigint): AccountIdComponents {
  const userHash = id >> 64n;
  const accountCode = Number((id >> 32n) & 0xFFFFFFFFn) as AccountCode;
  const ledger = Number((id >> 16n) & 0xFFFFn) as LedgerId;

  return { userHash, accountCode, ledger };
}

/**
 * Generate a unique 128-bit transfer ID from an idempotency key.
 * Hashing the key ensures deterministic ID generation for retries.
 */
function transferIdFromKey(idempotencyKey: string): bigint {
  const hash = createHash("sha256").update(idempotencyKey).digest();
  const hi = BigInt(hash.readUInt32BE(0));
  const mid1 = BigInt(hash.readUInt32BE(4));
  const mid2 = BigInt(hash.readUInt32BE(8));
  const lo = BigInt(hash.readUInt32BE(12));
  return (hi << 96n) | (mid1 << 64n) | (mid2 << 32n) | lo;
}

// ============================================================================
// Default Logger
// ============================================================================

function createDefaultLogger(): TigerBeetleLogger {
  return {
    debug: (msg, meta) => console.debug(`[TigerBeetle] ${msg}`, meta ?? ""),
    info: (msg, meta) => console.info(`[TigerBeetle] ${msg}`, meta ?? ""),
    warn: (msg, meta) => console.warn(`[TigerBeetle] ${msg}`, meta ?? ""),
    error: (msg, meta) => console.error(`[TigerBeetle] ${msg}`, meta ?? ""),
  };
}

// ============================================================================
// TigerBeetle Client
// ============================================================================

export class TigerBeetleClient {
  private readonly client: TBClient;
  private readonly config: TigerBeetleConfig;
  private readonly logger: TigerBeetleLogger;
  private destroyed = false;

  private constructor(
    client: TBClient,
    config: TigerBeetleConfig,
    logger: TigerBeetleLogger,
  ) {
    this.client = client;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create and connect to a TigerBeetle cluster.
   *
   * @param config - Cluster connection configuration
   * @param logger - Optional structured logger
   * @returns Connected TigerBeetleClient instance
   * @throws TigerBeetleError if connection fails
   */
  static async create(
    config: TigerBeetleConfig,
    logger?: TigerBeetleLogger,
  ): Promise<TigerBeetleClient> {
    const log = logger ?? createDefaultLogger();

    log.info("Connecting to TigerBeetle cluster", {
      clusterId: config.clusterId,
      replicas: config.replicaAddresses.length,
    });

    try {
      const client = createTBClient({
        cluster_id: BigInt(config.clusterId),
        replica_addresses: config.replicaAddresses,
        concurrency_max: config.concurrencyMax ?? 8192,
      });

      const instance = new TigerBeetleClient(client, config, log);

      log.info("TigerBeetle client created successfully", {
        clusterId: config.clusterId,
      });

      return instance;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to connect to TigerBeetle cluster", {
        error: message,
        clusterId: config.clusterId,
        replicas: config.replicaAddresses,
      });
      throw new TigerBeetleError(
        TigerBeetleErrorCode.CONNECTION_FAILED,
        `Failed to connect to TigerBeetle: ${message}`,
        { clusterId: config.clusterId },
        true, // retryable
      );
    }
  }

  // ==========================================================================
  // Account Management
  // ==========================================================================

  /**
   * Create the standard set of accounts for a new user.
   *
   * Each user gets one account per ledger they might use. All accounts
   * are created atomically -- if any fails, none are created.
   *
   * Standard user accounts created:
   * - USD wallet (USER_USD on USD ledger)
   * - Crypto wallet (USER_CRYPTO on BTC, ETH ledgers)
   * - Points wallet (USER_POINTS on POINTS ledger)
   * - Token wallet (USER_TOKEN on PULL_TOKEN ledger)
   *
   * @param userId - Unique user identifier from the auth system
   * @throws TigerBeetleError if account creation fails
   */
  async createUserAccounts(userId: string): Promise<void> {
    this.ensureNotDestroyed();

    this.logger.info("Creating user accounts", { userId });

    const accounts = [
      // USD wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_USD, LEDGERS.USD),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.USD,
        code: ACCOUNT_CODES.USER_USD,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // BTC wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_CRYPTO, LEDGERS.BTC),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.BTC,
        code: ACCOUNT_CODES.USER_CRYPTO,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // ETH wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_CRYPTO, LEDGERS.ETH),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.ETH,
        code: ACCOUNT_CODES.USER_CRYPTO,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // PULL Token wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_TOKEN, LEDGERS.PULL_TOKEN),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.PULL_TOKEN,
        code: ACCOUNT_CODES.USER_TOKEN,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // Points wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_POINTS, LEDGERS.POINTS),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.POINTS,
        code: ACCOUNT_CODES.USER_POINTS,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // Prediction contracts wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_USD, LEDGERS.PREDICTION_CONTRACTS),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.PREDICTION_CONTRACTS,
        code: ACCOUNT_CODES.USER_USD,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
      // RWA shares wallet
      {
        id: encodeAccountId(userId, ACCOUNT_CODES.USER_USD, LEDGERS.RWA_SHARES),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: hashUserId(userId),
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: LEDGERS.RWA_SHARES,
        code: ACCOUNT_CODES.USER_USD,
        flags: USER_ACCOUNT_FLAGS,
        timestamp: 0n,
      },
    ];

    const errors = await this.client.createAccounts(accounts);

    if (errors.length > 0) {
      // Filter out "already exists" errors -- these are safe to ignore
      // when re-running account creation (idempotent behavior)
      const realErrors = errors.filter(
        (e) => e.result !== CreateAccountError.exists,
      );

      if (realErrors.length > 0) {
        const errorDetails = realErrors.map((e) => ({
          index: e.index,
          code: CreateAccountError[e.result],
        }));

        this.logger.error("Failed to create user accounts", {
          userId,
          errors: errorDetails,
        });

        throw new TigerBeetleError(
          TigerBeetleErrorCode.ACCOUNT_CREATION_FAILED,
          `Failed to create accounts for user ${userId}: ${JSON.stringify(errorDetails)}`,
          { userId, errors: errorDetails },
        );
      }

      this.logger.debug("Some user accounts already existed (idempotent)", {
        userId,
        existingCount: errors.length - realErrors.length,
      });
    }

    this.logger.info("User accounts created successfully", {
      userId,
      accountCount: accounts.length,
    });
  }

  /**
   * Ensure platform-level accounts exist for a given ledger.
   *
   * Platform accounts are singletons (one per ledger). This method is
   * idempotent -- calling it multiple times is safe.
   *
   * @param ledger - The ledger to create platform accounts for
   */
  async ensurePlatformAccounts(ledger: LedgerId): Promise<void> {
    this.ensureNotDestroyed();

    this.logger.info("Ensuring platform accounts exist", { ledger });

    const accounts = [
      // Platform reserve: holds funds backing user deposits.
      // This is a liability account (platform owes users).
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.PLATFORM_RESERVE, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.PLATFORM_RESERVE,
        flags: PLATFORM_LIABILITY_FLAGS,
        timestamp: 0n,
      },
      // Fee collection account: collects trading fees
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.PLATFORM_FEE, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.PLATFORM_FEE,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Insurance fund
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.PLATFORM_INSURANCE, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.PLATFORM_INSURANCE,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Rewards pool: holds tokens/points available for distribution
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.PLATFORM_REWARDS_POOL, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.PLATFORM_REWARDS_POOL,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Staking pool
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.PLATFORM_STAKING_POOL, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.PLATFORM_STAKING_POOL,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Settlement pending
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.SETTLEMENT_PENDING, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.SETTLEMENT_PENDING,
        flags: PLATFORM_LIABILITY_FLAGS,
        timestamp: 0n,
      },
      // Settlement cleared
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.SETTLEMENT_CLEARED, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.SETTLEMENT_CLEARED,
        flags: PLATFORM_LIABILITY_FLAGS,
        timestamp: 0n,
      },
      // Escrow: open orders
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.ESCROW_ORDERS, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.ESCROW_ORDERS,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Escrow: prediction markets
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.ESCROW_PREDICTIONS, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.ESCROW_PREDICTIONS,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
      // Escrow: RWA
      {
        id: encodePlatformAccountId(ACCOUNT_CODES.ESCROW_RWA, ledger),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: PLATFORM_USER_HASH,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code: ACCOUNT_CODES.ESCROW_RWA,
        flags: PLATFORM_POOL_FLAGS,
        timestamp: 0n,
      },
    ];

    const errors = await this.client.createAccounts(accounts);

    // Only report non-idempotent errors
    const realErrors = errors.filter(
      (e) => e.result !== CreateAccountError.exists,
    );

    if (realErrors.length > 0) {
      const errorDetails = realErrors.map((e) => ({
        index: e.index,
        code: CreateAccountError[e.result],
      }));

      this.logger.error("Failed to create platform accounts", {
        ledger,
        errors: errorDetails,
      });

      throw new TigerBeetleError(
        TigerBeetleErrorCode.ACCOUNT_CREATION_FAILED,
        `Failed to create platform accounts on ledger ${ledger}`,
        { ledger, errors: errorDetails },
      );
    }

    this.logger.info("Platform accounts ensured", { ledger });
  }

  // ==========================================================================
  // Deposit
  // ==========================================================================

  /**
   * Process a deposit: credit the user's account, debit the platform reserve.
   *
   * Double-entry: Platform Reserve (debit) -> User Account (credit)
   *
   * In real-money accounting, a deposit means the platform now owes the
   * user money, so we debit the reserve (increasing its liability) and
   * credit the user (increasing their asset balance).
   *
   * @param userId - User receiving the deposit
   * @param amount - Amount in smallest currency unit (e.g., cents)
   * @param ledger - Which asset ledger (USD, BTC, etc.)
   * @param idempotencyKey - Unique key to prevent double-processing
   * @returns DepositResult with updated balance
   */
  async deposit(
    userId: string,
    amount: bigint,
    ledger: LedgerId,
    idempotencyKey: string,
  ): Promise<DepositResult> {
    this.ensureNotDestroyed();
    this.validateAmount(amount);

    const userAccountId = this.getUserAccountId(userId, ledger);
    const reserveAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.PLATFORM_RESERVE,
      ledger,
    );
    const transferId = transferIdFromKey(idempotencyKey);

    this.logger.info("Processing deposit", {
      userId,
      amount: amount.toString(),
      ledger,
      idempotencyKey,
      transferId: transferId.toString(),
    });

    const errors = await this.client.createTransfers([
      {
        id: transferId,
        debit_account_id: reserveAccountId,
        credit_account_id: userAccountId,
        amount,
        pending_id: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code: TRANSFER_CODES.DEPOSIT,
        flags: 0,
        timestamp: 0n,
      },
    ]);

    if (errors.length > 0) {
      const errorCode = errors[0].result;

      this.logger.error("Deposit transfer failed", {
        userId,
        amount: amount.toString(),
        ledger,
        error: CreateTransferError[errorCode],
      });

      // Idempotent: if the transfer already exists, treat as success
      if (errorCode === CreateTransferError.exists) {
        this.logger.info("Deposit already processed (idempotent)", {
          userId,
          idempotencyKey,
        });

        const balance = await this.getBalance(userId, ledger);
        return {
          success: true,
          transferId,
          amount,
          ledger,
          balance,
          timestamp: new Date(),
        };
      }

      throw this.mapTransferError(errorCode, {
        operation: "deposit",
        userId,
        amount: amount.toString(),
        ledger,
      });
    }

    const balance = await this.getBalance(userId, ledger);

    this.logger.info("Deposit processed successfully", {
      userId,
      amount: amount.toString(),
      ledger,
      newBalance: balance.available.toString(),
    });

    return {
      success: true,
      transferId,
      amount,
      ledger,
      balance,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // Withdrawal
  // ==========================================================================

  /**
   * Process a withdrawal: debit the user's account, credit the platform reserve.
   *
   * Double-entry: User Account (debit) -> Platform Reserve (credit)
   *
   * The user's balance decreases and the platform's liability decreases.
   * If the user has insufficient funds, TigerBeetle rejects the transfer
   * and we throw INSUFFICIENT_FUNDS.
   *
   * @param userId - User requesting the withdrawal
   * @param amount - Amount in smallest currency unit (e.g., cents)
   * @param ledger - Which asset ledger (USD, BTC, etc.)
   * @param idempotencyKey - Unique key to prevent double-processing
   * @returns WithdrawalResult with updated balance
   */
  async withdraw(
    userId: string,
    amount: bigint,
    ledger: LedgerId,
    idempotencyKey: string,
  ): Promise<WithdrawalResult> {
    this.ensureNotDestroyed();
    this.validateAmount(amount);

    const userAccountId = this.getUserAccountId(userId, ledger);
    const reserveAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.PLATFORM_RESERVE,
      ledger,
    );
    const transferId = transferIdFromKey(idempotencyKey);

    this.logger.info("Processing withdrawal", {
      userId,
      amount: amount.toString(),
      ledger,
      idempotencyKey,
    });

    const errors = await this.client.createTransfers([
      {
        id: transferId,
        debit_account_id: userAccountId,
        credit_account_id: reserveAccountId,
        amount,
        pending_id: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code: TRANSFER_CODES.WITHDRAWAL,
        flags: 0,
        timestamp: 0n,
      },
    ]);

    if (errors.length > 0) {
      const errorCode = errors[0].result;

      // Idempotent handling
      if (errorCode === CreateTransferError.exists) {
        this.logger.info("Withdrawal already processed (idempotent)", {
          userId,
          idempotencyKey,
        });

        const balance = await this.getBalance(userId, ledger);
        return {
          success: true,
          transferId,
          amount,
          ledger,
          balance,
          timestamp: new Date(),
        };
      }

      this.logger.error("Withdrawal transfer failed", {
        userId,
        amount: amount.toString(),
        ledger,
        error: CreateTransferError[errorCode],
      });

      throw this.mapTransferError(errorCode, {
        operation: "withdrawal",
        userId,
        amount: amount.toString(),
        ledger,
      });
    }

    const balance = await this.getBalance(userId, ledger);

    this.logger.info("Withdrawal processed successfully", {
      userId,
      amount: amount.toString(),
      ledger,
      newBalance: balance.available.toString(),
    });

    return {
      success: true,
      transferId,
      amount,
      ledger,
      balance,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // Trade Execution
  // ==========================================================================

  /**
   * Execute a trade between two users with platform fee collection.
   *
   * This creates two linked transfers that succeed or fail atomically:
   *   1. Buyer -> Seller (principal amount)
   *   2. Buyer -> Platform Fee Account (fee amount)
   *
   * TigerBeetle's linked transfer mechanism ensures that if the buyer
   * doesn't have enough funds for both the principal AND the fee, neither
   * transfer executes. This eliminates partial-fill accounting errors.
   *
   * @param buyerId - User paying for the asset
   * @param sellerId - User receiving payment
   * @param amount - Principal amount in smallest currency unit
   * @param fee - Fee amount in smallest currency unit
   * @param ledger - Which asset ledger
   * @param idempotencyKey - Unique key to prevent double-processing
   * @returns TradeResult with both users' updated balances
   */
  async executeTrade(
    buyerId: string,
    sellerId: string,
    amount: bigint,
    fee: bigint,
    ledger: LedgerId,
    idempotencyKey: string,
  ): Promise<TradeResult> {
    this.ensureNotDestroyed();
    this.validateAmount(amount);

    if (fee < 0n) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.ZERO_AMOUNT,
        "Fee amount cannot be negative",
        { fee: fee.toString() },
      );
    }

    if (buyerId === sellerId) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.INTERNAL_ERROR,
        "Buyer and seller cannot be the same user",
        { buyerId, sellerId },
      );
    }

    const buyerAccountId = this.getUserAccountId(buyerId, ledger);
    const sellerAccountId = this.getUserAccountId(sellerId, ledger);
    const feeAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.PLATFORM_FEE,
      ledger,
    );

    const tradeTransferId = transferIdFromKey(`${idempotencyKey}:trade`);
    const feeTransferId = transferIdFromKey(`${idempotencyKey}:fee`);

    this.logger.info("Executing trade", {
      buyerId,
      sellerId,
      amount: amount.toString(),
      fee: fee.toString(),
      ledger,
      idempotencyKey,
    });

    // Build the transfer batch. If there's a fee, we link the two transfers
    // so they are atomic. The "linked" flag on the first transfer means:
    // "this transfer succeeds only if the next one also succeeds."
    const transfers: Array<{
      id: bigint;
      debit_account_id: bigint;
      credit_account_id: bigint;
      amount: bigint;
      pending_id: bigint;
      user_data_128: bigint;
      user_data_64: bigint;
      user_data_32: number;
      timeout: number;
      ledger: number;
      code: number;
      flags: number;
      timestamp: bigint;
    }> = [];

    if (fee > 0n) {
      // Linked pair: trade + fee
      transfers.push(
        {
          id: tradeTransferId,
          debit_account_id: buyerAccountId,
          credit_account_id: sellerAccountId,
          amount,
          pending_id: 0n,
          user_data_128: 0n,
          user_data_64: 0n,
          user_data_32: 0,
          timeout: 0,
          ledger,
          code: TRANSFER_CODES.TRADE,
          flags: TransferFlags.linked, // Link to fee transfer
          timestamp: 0n,
        },
        {
          id: feeTransferId,
          debit_account_id: buyerAccountId,
          credit_account_id: feeAccountId,
          amount: fee,
          pending_id: 0n,
          user_data_128: 0n,
          user_data_64: 0n,
          user_data_32: 0,
          timeout: 0,
          ledger,
          code: TRANSFER_CODES.TRADE_FEE,
          flags: 0, // Last in linked chain, no flag needed
          timestamp: 0n,
        },
      );
    } else {
      // No fee: single transfer
      transfers.push({
        id: tradeTransferId,
        debit_account_id: buyerAccountId,
        credit_account_id: sellerAccountId,
        amount,
        pending_id: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code: TRANSFER_CODES.TRADE,
        flags: 0,
        timestamp: 0n,
      });
    }

    const errors = await this.client.createTransfers(transfers);

    if (errors.length > 0) {
      // Check for idempotent success (all errors are "exists")
      const allExist = errors.every(
        (e) => e.result === CreateTransferError.exists,
      );

      if (allExist) {
        this.logger.info("Trade already executed (idempotent)", {
          buyerId,
          sellerId,
          idempotencyKey,
        });

        const [buyerBalance, sellerBalance] = await Promise.all([
          this.getBalance(buyerId, ledger),
          this.getBalance(sellerId, ledger),
        ]);

        return {
          success: true,
          tradeTransferId,
          feeTransferId,
          amount,
          fee,
          ledger,
          buyerBalance,
          sellerBalance,
          timestamp: new Date(),
        };
      }

      const errorCode = errors[0].result;
      this.logger.error("Trade execution failed", {
        buyerId,
        sellerId,
        amount: amount.toString(),
        fee: fee.toString(),
        errors: errors.map((e) => ({
          index: e.index,
          code: CreateTransferError[e.result],
        })),
      });

      throw this.mapTransferError(errorCode, {
        operation: "trade",
        buyerId,
        sellerId,
        amount: amount.toString(),
        fee: fee.toString(),
        ledger,
      });
    }

    const [buyerBalance, sellerBalance] = await Promise.all([
      this.getBalance(buyerId, ledger),
      this.getBalance(sellerId, ledger),
    ]);

    this.logger.info("Trade executed successfully", {
      buyerId,
      sellerId,
      amount: amount.toString(),
      fee: fee.toString(),
      ledger,
      buyerNewBalance: buyerBalance.available.toString(),
      sellerNewBalance: sellerBalance.available.toString(),
    });

    return {
      success: true,
      tradeTransferId,
      feeTransferId,
      amount,
      fee,
      ledger,
      buyerBalance,
      sellerBalance,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // Order Holds (Two-Phase Transfers)
  // ==========================================================================

  /**
   * Place a hold on funds for an open order.
   *
   * Uses TigerBeetle's two-phase transfer mechanism:
   * 1. Phase 1 (this method): Create a pending transfer that reserves funds
   * 2. Phase 2 (on fill/cancel): Post or void the pending transfer
   *
   * While the hold is active, the funds are in "debits_pending" on the user's
   * account and "credits_pending" on the escrow account. They cannot be
   * spent or withdrawn, but are not yet moved.
   *
   * @param userId - User placing the order
   * @param amount - Amount to hold in smallest currency unit
   * @param ledger - Which asset ledger
   * @param orderId - Order ID used to derive the pending transfer ID
   * @returns OrderHoldResult with the pending transfer ID
   */
  async placeOrderHold(
    userId: string,
    amount: bigint,
    ledger: LedgerId,
    orderId: string,
  ): Promise<OrderHoldResult> {
    this.ensureNotDestroyed();
    this.validateAmount(amount);

    const userAccountId = this.getUserAccountId(userId, ledger);
    const escrowAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.ESCROW_ORDERS,
      ledger,
    );
    const pendingTransferId = transferIdFromKey(`order-hold:${orderId}`);

    this.logger.info("Placing order hold", {
      userId,
      amount: amount.toString(),
      ledger,
      orderId,
    });

    const errors = await this.client.createTransfers([
      {
        id: pendingTransferId,
        debit_account_id: userAccountId,
        credit_account_id: escrowAccountId,
        amount,
        pending_id: 0n,
        user_data_128: transferIdFromKey(orderId), // Store order reference
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0, // No timeout -- hold persists until explicitly released
        ledger,
        code: TRANSFER_CODES.ORDER_HOLD,
        flags: TransferFlags.pending,
        timestamp: 0n,
      },
    ]);

    if (errors.length > 0) {
      const errorCode = errors[0].result;

      // Idempotent: hold already exists for this order
      if (errorCode === CreateTransferError.exists) {
        this.logger.info("Order hold already exists (idempotent)", {
          userId,
          orderId,
        });

        const balance = await this.getBalance(userId, ledger);
        return {
          success: true,
          pendingTransferId,
          amount,
          ledger,
          balance,
          timestamp: new Date(),
        };
      }

      this.logger.error("Failed to place order hold", {
        userId,
        amount: amount.toString(),
        orderId,
        error: CreateTransferError[errorCode],
      });

      throw this.mapTransferError(errorCode, {
        operation: "placeOrderHold",
        userId,
        amount: amount.toString(),
        orderId,
        ledger,
      });
    }

    const balance = await this.getBalance(userId, ledger);

    this.logger.info("Order hold placed successfully", {
      userId,
      amount: amount.toString(),
      orderId,
      pendingTransferId: pendingTransferId.toString(),
      available: balance.available.toString(),
      pending: balance.pending.toString(),
    });

    return {
      success: true,
      pendingTransferId,
      amount,
      ledger,
      balance,
      timestamp: new Date(),
    };
  }

  /**
   * Release a hold on funds when an order is canceled.
   *
   * Voids the pending transfer, returning reserved funds to the user's
   * available balance. This is Phase 2 of the two-phase transfer.
   *
   * @param userId - User whose hold is being released
   * @param amount - Amount to release (must match or be less than the hold)
   * @param ledger - Which asset ledger
   * @param orderId - Order ID that was used for the original hold
   * @returns OrderHoldResult with updated balance
   */
  async releaseOrderHold(
    userId: string,
    amount: bigint,
    ledger: LedgerId,
    orderId: string,
  ): Promise<OrderHoldResult> {
    this.ensureNotDestroyed();

    const userAccountId = this.getUserAccountId(userId, ledger);
    const escrowAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.ESCROW_ORDERS,
      ledger,
    );
    const pendingTransferId = transferIdFromKey(`order-hold:${orderId}`);
    const voidTransferId = transferIdFromKey(`order-release:${orderId}`);

    this.logger.info("Releasing order hold", {
      userId,
      amount: amount.toString(),
      ledger,
      orderId,
    });

    const errors = await this.client.createTransfers([
      {
        id: voidTransferId,
        debit_account_id: userAccountId,
        credit_account_id: escrowAccountId,
        amount,
        pending_id: pendingTransferId,
        user_data_128: transferIdFromKey(orderId),
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code: TRANSFER_CODES.ORDER_RELEASE,
        flags: TransferFlags.void_pending_transfer,
        timestamp: 0n,
      },
    ]);

    if (errors.length > 0) {
      const errorCode = errors[0].result;

      // Idempotent: void already processed
      if (errorCode === CreateTransferError.exists) {
        this.logger.info("Order hold already released (idempotent)", {
          userId,
          orderId,
        });

        const balance = await this.getBalance(userId, ledger);
        return {
          success: true,
          pendingTransferId,
          amount,
          ledger,
          balance,
          timestamp: new Date(),
        };
      }

      this.logger.error("Failed to release order hold", {
        userId,
        orderId,
        error: CreateTransferError[errorCode],
      });

      throw this.mapTransferError(errorCode, {
        operation: "releaseOrderHold",
        userId,
        orderId,
        ledger,
      });
    }

    const balance = await this.getBalance(userId, ledger);

    this.logger.info("Order hold released successfully", {
      userId,
      orderId,
      available: balance.available.toString(),
    });

    return {
      success: true,
      pendingTransferId,
      amount,
      ledger,
      balance,
      timestamp: new Date(),
    };
  }

  /**
   * Post (finalize) a pending order hold when the order is filled.
   *
   * Converts reserved funds into a posted transfer, moving them permanently
   * from the user's account to the escrow. Typically followed by a trade
   * execution to move funds from escrow to the counterparty.
   *
   * Supports partial fills: if fillAmount < original hold, only that amount
   * is posted and the remainder stays pending.
   *
   * @param userId - User whose hold is being posted
   * @param fillAmount - Amount to finalize (can be partial)
   * @param ledger - Which asset ledger
   * @param orderId - Order ID from the original hold
   * @returns OrderHoldResult with updated balance
   */
  async postOrderHold(
    userId: string,
    fillAmount: bigint,
    ledger: LedgerId,
    orderId: string,
  ): Promise<OrderHoldResult> {
    this.ensureNotDestroyed();
    this.validateAmount(fillAmount);

    const userAccountId = this.getUserAccountId(userId, ledger);
    const escrowAccountId = encodePlatformAccountId(
      ACCOUNT_CODES.ESCROW_ORDERS,
      ledger,
    );
    const pendingTransferId = transferIdFromKey(`order-hold:${orderId}`);
    const postTransferId = transferIdFromKey(`order-post:${orderId}:${fillAmount.toString()}`);

    this.logger.info("Posting order hold", {
      userId,
      fillAmount: fillAmount.toString(),
      ledger,
      orderId,
    });

    const errors = await this.client.createTransfers([
      {
        id: postTransferId,
        debit_account_id: userAccountId,
        credit_account_id: escrowAccountId,
        amount: fillAmount,
        pending_id: pendingTransferId,
        user_data_128: transferIdFromKey(orderId),
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code: TRANSFER_CODES.ORDER_HOLD,
        flags: TransferFlags.post_pending_transfer,
        timestamp: 0n,
      },
    ]);

    if (errors.length > 0) {
      const errorCode = errors[0].result;

      if (errorCode === CreateTransferError.exists) {
        this.logger.info("Order hold already posted (idempotent)", {
          userId,
          orderId,
        });

        const balance = await this.getBalance(userId, ledger);
        return {
          success: true,
          pendingTransferId,
          amount: fillAmount,
          ledger,
          balance,
          timestamp: new Date(),
        };
      }

      this.logger.error("Failed to post order hold", {
        userId,
        orderId,
        error: CreateTransferError[errorCode],
      });

      throw this.mapTransferError(errorCode, {
        operation: "postOrderHold",
        userId,
        orderId,
        fillAmount: fillAmount.toString(),
        ledger,
      });
    }

    const balance = await this.getBalance(userId, ledger);

    this.logger.info("Order hold posted successfully", {
      userId,
      orderId,
      fillAmount: fillAmount.toString(),
    });

    return {
      success: true,
      pendingTransferId,
      amount: fillAmount,
      ledger,
      balance,
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // Balance Queries
  // ==========================================================================

  /**
   * Get the current balance for a user on a specific ledger.
   *
   * Returns all four balance components:
   * - debits_posted: total finalized debits
   * - credits_posted: total finalized credits
   * - debits_pending: reserved outgoing funds (order holds)
   * - credits_pending: reserved incoming funds
   *
   * And derived values:
   * - available: credits_posted - debits_posted - debits_pending
   * - posted: credits_posted - debits_posted
   * - pending: debits_pending
   *
   * @param userId - User to query
   * @param ledger - Which asset ledger
   * @returns AccountBalance snapshot
   */
  async getBalance(userId: string, ledger: LedgerId): Promise<AccountBalance> {
    this.ensureNotDestroyed();

    const accountId = this.getUserAccountId(userId, ledger);
    const accounts = await this.client.lookupAccounts([accountId]);

    if (accounts.length === 0) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.ACCOUNT_NOT_FOUND,
        `Account not found for user ${userId} on ledger ${ledger}`,
        { userId, ledger },
      );
    }

    const account = accounts[0];

    const debitsPosted = account.debits_posted;
    const creditsPosted = account.credits_posted;
    const debitsPending = account.debits_pending;
    const creditsPending = account.credits_pending;

    // Available = what the user can actually spend right now
    // credits_posted - debits_posted gives the settled balance
    // Subtract debits_pending because those funds are reserved for open orders
    const posted = creditsPosted - debitsPosted;
    const available = posted - debitsPending;
    const pending = debitsPending;

    return {
      debitsPosted,
      creditsPosted,
      debitsPending,
      creditsPending,
      available,
      posted,
      pending,
    };
  }

  /**
   * Get balances for a user across all standard ledgers.
   * Useful for displaying a portfolio overview.
   *
   * @param userId - User to query
   * @returns Map of ledger ID to AccountBalance
   */
  async getAllBalances(
    userId: string,
  ): Promise<Map<LedgerId, AccountBalance>> {
    this.ensureNotDestroyed();

    const ledgerIds = Object.values(LEDGERS) as LedgerId[];
    const accountIds = ledgerIds.map((ledger) =>
      this.getUserAccountId(userId, ledger),
    );

    const accounts = await this.client.lookupAccounts(accountIds);

    const balances = new Map<LedgerId, AccountBalance>();

    for (const account of accounts) {
      const { ledger } = decodeAccountId(account.id);
      const posted = account.credits_posted - account.debits_posted;

      balances.set(ledger, {
        debitsPosted: account.debits_posted,
        creditsPosted: account.credits_posted,
        debitsPending: account.debits_pending,
        creditsPending: account.credits_pending,
        available: posted - account.debits_pending,
        posted,
        pending: account.debits_pending,
      });
    }

    // Fill in zero balances for ledgers with no account (not yet created)
    for (const ledger of ledgerIds) {
      if (!balances.has(ledger)) {
        balances.set(ledger, {
          debitsPosted: 0n,
          creditsPosted: 0n,
          debitsPending: 0n,
          creditsPending: 0n,
          available: 0n,
          posted: 0n,
          pending: 0n,
        });
      }
    }

    return balances;
  }

  // ==========================================================================
  // Batch Transfers
  // ==========================================================================

  /**
   * Execute a batch of transfers atomically.
   *
   * All transfers in the batch must succeed for any to succeed (when linked).
   * Use this for complex multi-leg operations like:
   * - Prediction market settlements (one payout per winner)
   * - Batch reward distributions
   * - Multi-asset trades
   *
   * @param batch - The batch of transfers to execute
   * @returns TransferBatchResult with success/failure details
   */
  async executeBatch(batch: TransferBatch): Promise<TransferBatchResult> {
    this.ensureNotDestroyed();

    this.logger.info("Executing transfer batch", {
      description: batch.description,
      transferCount: batch.transfers.length,
    });

    const tbTransfers = batch.transfers.map((t) => ({
      id: t.id,
      debit_account_id: t.debitAccountId,
      credit_account_id: t.creditAccountId,
      amount: t.amount,
      pending_id: t.pendingId ?? 0n,
      user_data_128: t.userData128 ?? 0n,
      user_data_64: t.userData64 ?? 0n,
      user_data_32: t.userData32 ?? 0,
      timeout: 0,
      ledger: t.ledger,
      code: t.code,
      flags: this.encodeTransferFlags(t.flags),
      timestamp: 0n,
    }));

    const errors = await this.client.createTransfers(tbTransfers);

    const existsErrors = errors.filter(
      (e) => e.result === CreateTransferError.exists,
    );
    const realErrors = errors.filter(
      (e) => e.result !== CreateTransferError.exists,
    );

    if (realErrors.length > 0) {
      const errorDetails = realErrors.map((e) => ({
        index: e.index,
        transferId: batch.transfers[e.index].id,
        errorCode: CreateTransferError[e.result],
      }));

      this.logger.error("Batch transfer partially failed", {
        description: batch.description,
        errors: errorDetails.map((e) => ({
          ...e,
          transferId: e.transferId.toString(),
        })),
      });

      return {
        success: false,
        successCount: batch.transfers.length - errors.length,
        failureCount: realErrors.length,
        errors: errorDetails,
      };
    }

    if (existsErrors.length > 0) {
      this.logger.debug("Some batch transfers already existed (idempotent)", {
        description: batch.description,
        existingCount: existsErrors.length,
      });
    }

    this.logger.info("Batch transfer executed successfully", {
      description: batch.description,
      transferCount: batch.transfers.length,
    });

    return {
      success: true,
      successCount: batch.transfers.length,
      failureCount: 0,
      errors: [],
    };
  }

  // ==========================================================================
  // Reconciliation
  // ==========================================================================

  /**
   * Reconcile TigerBeetle balances against NeonDB snapshots.
   *
   * This method reads the user's balance from TigerBeetle and compares it
   * against the last known balance snapshot in NeonDB. Any discrepancy
   * indicates either:
   * - A bug in the application layer (transfers not reflected in NeonDB)
   * - A missed webhook or event (external deposit not recorded)
   * - Data corruption (should never happen with TigerBeetle, but defense in depth)
   *
   * In production, this should run:
   * - On every withdrawal request (before authorizing)
   * - On a scheduled basis (e.g., every hour) for all active users
   * - On any support-initiated balance inquiry
   *
   * @param userId - User to reconcile
   * @param neondbBalances - Balance snapshots from NeonDB, keyed by ledger
   * @returns ReconciliationResult with per-ledger comparison
   */
  async reconcile(
    userId: string,
    neondbBalances: Map<LedgerId, bigint>,
  ): Promise<ReconciliationResult> {
    this.ensureNotDestroyed();

    this.logger.info("Starting reconciliation", { userId });

    const tbBalances = await this.getAllBalances(userId);

    const ledgerNames: Record<number, string> = {
      [LEDGERS.USD]: "USD",
      [LEDGERS.BTC]: "BTC",
      [LEDGERS.ETH]: "ETH",
      [LEDGERS.PULL_TOKEN]: "PULL_TOKEN",
      [LEDGERS.POINTS]: "POINTS",
      [LEDGERS.PREDICTION_CONTRACTS]: "PREDICTION_CONTRACTS",
      [LEDGERS.RWA_SHARES]: "RWA_SHARES",
    };

    const ledgers: ReconciliationResult["ledgers"] = [];
    let allMatched = true;

    for (const [ledger, tbBalance] of tbBalances) {
      const neonBalance = neondbBalances.get(ledger) ?? 0n;
      const tigerbeetleBalance = tbBalance.posted;
      const difference = tigerbeetleBalance - neonBalance;
      const matched = difference === 0n;

      if (!matched) {
        allMatched = false;
        this.logger.warn("Reconciliation mismatch detected", {
          userId,
          ledger,
          ledgerName: ledgerNames[ledger] ?? "UNKNOWN",
          tigerbeetleBalance: tigerbeetleBalance.toString(),
          neondbBalance: neonBalance.toString(),
          difference: difference.toString(),
        });
      }

      ledgers.push({
        ledger,
        ledgerName: ledgerNames[ledger] ?? "UNKNOWN",
        tigerbeetleBalance,
        neondbBalance: neonBalance,
        difference,
        matched,
      });
    }

    const result: ReconciliationResult = {
      matched: allMatched,
      userId,
      ledgers,
      timestamp: new Date(),
    };

    if (!allMatched) {
      this.logger.error("Reconciliation FAILED - mismatches detected", {
        userId,
        mismatchCount: ledgers.filter((l) => !l.matched).length,
      });
    } else {
      this.logger.info("Reconciliation passed", { userId });
    }

    return result;
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Verify cluster connectivity and measure latency.
   *
   * Performs a lookup of a well-known platform account to verify the cluster
   * is responsive. Returns latency metrics for monitoring.
   *
   * @returns HealthCheckResult with latency and status
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = performance.now();

    try {
      // Look up the USD platform reserve account as a connectivity test.
      // This account should always exist after platform initialization.
      const reserveId = encodePlatformAccountId(
        ACCOUNT_CODES.PLATFORM_RESERVE,
        LEDGERS.USD,
      );

      await this.client.lookupAccounts([reserveId]);

      const latencyMs = performance.now() - start;

      this.logger.debug("Health check passed", {
        latencyMs: Math.round(latencyMs * 100) / 100,
      });

      return {
        healthy: true,
        latencyMs,
        clusterId: this.config.clusterId,
        replicaCount: this.config.replicaAddresses.length,
        timestamp: new Date(),
      };
    } catch (error) {
      const latencyMs = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error("Health check failed", {
        error: message,
        latencyMs,
      });

      return {
        healthy: false,
        latencyMs,
        clusterId: this.config.clusterId,
        replicaCount: this.config.replicaAddresses.length,
        error: message,
        timestamp: new Date(),
      };
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Gracefully shut down the TigerBeetle client.
   * Waits for in-flight requests to complete before closing.
   */
  destroy(): void {
    if (!this.destroyed) {
      this.logger.info("Shutting down TigerBeetle client");
      this.client.destroy();
      this.destroyed = true;
    }
  }

  /**
   * Check if the client has been destroyed.
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ==========================================================================
  // Helper: Account ID Resolution
  // ==========================================================================

  /**
   * Resolve the TigerBeetle account ID for a user on a specific ledger.
   *
   * The account code is selected based on the ledger type:
   * - USD ledger -> USER_USD code
   * - BTC/ETH -> USER_CRYPTO code
   * - PULL_TOKEN -> USER_TOKEN code
   * - POINTS -> USER_POINTS code
   * - PREDICTION_CONTRACTS / RWA_SHARES -> USER_USD code (denominated in USD)
   */
  private getUserAccountId(userId: string, ledger: LedgerId): bigint {
    const code = this.getAccountCodeForLedger(ledger);
    return encodeAccountId(userId, code, ledger);
  }

  /**
   * Map a ledger to the appropriate user account code.
   */
  private getAccountCodeForLedger(ledger: LedgerId): AccountCode {
    switch (ledger) {
      case LEDGERS.USD:
        return ACCOUNT_CODES.USER_USD;
      case LEDGERS.BTC:
      case LEDGERS.ETH:
        return ACCOUNT_CODES.USER_CRYPTO;
      case LEDGERS.PULL_TOKEN:
        return ACCOUNT_CODES.USER_TOKEN;
      case LEDGERS.POINTS:
        return ACCOUNT_CODES.USER_POINTS;
      case LEDGERS.PREDICTION_CONTRACTS:
      case LEDGERS.RWA_SHARES:
        return ACCOUNT_CODES.USER_USD;
      default: {
        // Exhaustiveness check: if we reach here, we missed a ledger
        const _exhaustive: never = ledger;
        throw new TigerBeetleError(
          TigerBeetleErrorCode.INTERNAL_ERROR,
          `Unknown ledger: ${_exhaustive}`,
        );
      }
    }
  }

  // ==========================================================================
  // Helper: Validation
  // ==========================================================================

  private validateAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.ZERO_AMOUNT,
        `Amount must be greater than zero, got ${amount}`,
        { amount: amount.toString() },
      );
    }

    if (amount > MAX_AMOUNT) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.BALANCE_OVERFLOW,
        `Amount exceeds maximum representable value`,
        { amount: amount.toString() },
      );
    }
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new TigerBeetleError(
        TigerBeetleErrorCode.CONNECTION_FAILED,
        "TigerBeetle client has been destroyed",
      );
    }
  }

  // ==========================================================================
  // Helper: Flag Encoding
  // ==========================================================================

  private encodeTransferFlags(flags: Partial<CreateTransferParams["flags"]> = {}): number {
    let encoded = 0;

    if (flags.linked) encoded |= TransferFlags.linked;
    if (flags.pending) encoded |= TransferFlags.pending;
    if (flags.postPendingTransfer) encoded |= TransferFlags.post_pending_transfer;
    if (flags.voidPendingTransfer) encoded |= TransferFlags.void_pending_transfer;
    if (flags.balancingDebit) encoded |= TransferFlags.balancing_debit;
    if (flags.balancingCredit) encoded |= TransferFlags.balancing_credit;

    return encoded;
  }

  // ==========================================================================
  // Helper: Error Mapping
  // ==========================================================================

  /**
   * Map TigerBeetle's native error codes to our domain-specific errors.
   * This provides actionable error messages for the calling code.
   */
  private mapTransferError(
    errorCode: CreateTransferError,
    context: Record<string, unknown>,
  ): TigerBeetleError {
    switch (errorCode) {
      case CreateTransferError.exceeds_credits:
      case CreateTransferError.exceeds_debits:
        return new TigerBeetleError(
          TigerBeetleErrorCode.INSUFFICIENT_FUNDS,
          "Insufficient funds for this transfer",
          context,
          false, // not retryable -- user needs more funds
        );

      case CreateTransferError.debit_account_not_found:
      case CreateTransferError.credit_account_not_found:
        return new TigerBeetleError(
          TigerBeetleErrorCode.ACCOUNT_NOT_FOUND,
          "One or both accounts in the transfer do not exist",
          context,
          false,
        );

      case CreateTransferError.accounts_are_the_same:
        return new TigerBeetleError(
          TigerBeetleErrorCode.TRANSFER_FAILED,
          "Cannot transfer between the same account",
          context,
          false,
        );

      case CreateTransferError.pending_transfer_not_found:
        return new TigerBeetleError(
          TigerBeetleErrorCode.PENDING_TRANSFER_NOT_FOUND,
          "Referenced pending transfer does not exist or was already resolved",
          context,
          false,
        );

      case CreateTransferError.pending_transfer_already_posted:
      case CreateTransferError.pending_transfer_already_voided:
        return new TigerBeetleError(
          TigerBeetleErrorCode.PENDING_TRANSFER_NOT_FOUND,
          "Pending transfer has already been posted or voided",
          context,
          false,
        );

      case CreateTransferError.accounts_have_different_ledgers:
        return new TigerBeetleError(
          TigerBeetleErrorCode.LEDGER_MISMATCH,
          "Debit and credit accounts are on different ledgers",
          context,
          false,
        );

      case CreateTransferError.overflows_debits:
      case CreateTransferError.overflows_credits:
      case CreateTransferError.overflows_debits_pending:
      case CreateTransferError.overflows_credits_pending:
        return new TigerBeetleError(
          TigerBeetleErrorCode.BALANCE_OVERFLOW,
          "Transfer would cause a balance overflow",
          context,
          false,
        );

      default:
        return new TigerBeetleError(
          TigerBeetleErrorCode.TRANSFER_FAILED,
          `Transfer failed with error: ${CreateTransferError[errorCode]}`,
          { ...context, nativeError: CreateTransferError[errorCode] },
          true, // unknown errors may be transient
        );
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a TigerBeetle client from environment variables.
 *
 * Expected environment variables:
 * - TIGERBEETLE_CLUSTER_ID: Cluster ID (default: "0")
 * - TIGERBEETLE_ADDRESSES: Comma-separated replica addresses
 *   (default: "3000" for local development)
 * - TIGERBEETLE_CONCURRENCY_MAX: Max concurrent requests (default: "8192")
 */
export async function createTigerBeetleClient(
  logger?: TigerBeetleLogger,
): Promise<TigerBeetleClient> {
  const clusterId = parseInt(
    process.env.TIGERBEETLE_CLUSTER_ID ?? "0",
    10,
  );

  const addressesStr = process.env.TIGERBEETLE_ADDRESSES ?? "3000";
  const replicaAddresses = addressesStr
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);

  const concurrencyMax = parseInt(
    process.env.TIGERBEETLE_CONCURRENCY_MAX ?? "8192",
    10,
  );

  if (replicaAddresses.length === 0) {
    throw new TigerBeetleError(
      TigerBeetleErrorCode.CONNECTION_FAILED,
      "No TigerBeetle replica addresses configured. Set TIGERBEETLE_ADDRESSES.",
    );
  }

  return TigerBeetleClient.create(
    { clusterId, replicaAddresses, concurrencyMax },
    logger,
  );
}

/**
 * Singleton client instance (lazy initialized).
 * Use getTigerBeetleClient() for most application code.
 */
let _client: TigerBeetleClient | null = null;

/**
 * Get the singleton TigerBeetle client instance.
 * Creates the client on first call; subsequent calls return the same instance.
 */
export async function getTigerBeetleClient(
  logger?: TigerBeetleLogger,
): Promise<TigerBeetleClient> {
  if (!_client || _client.isDestroyed()) {
    _client = await createTigerBeetleClient(logger);
  }
  return _client;
}

/**
 * Destroy the singleton client instance.
 * Call during graceful shutdown to clean up resources.
 */
export function destroyTigerBeetleClient(): void {
  if (_client) {
    _client.destroy();
    _client = null;
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
  encodeAccountId,
  encodePlatformAccountId,
  decodeAccountId,
  hashUserId,
  transferIdFromKey,
};
