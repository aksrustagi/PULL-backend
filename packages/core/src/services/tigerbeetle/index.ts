/**
 * TigerBeetle Service - Double-Entry Bookkeeping Engine
 *
 * Production-grade financial accounting for the PULL trading platform.
 * All deposits, trades, withdrawals, and rewards flow through TigerBeetle
 * to guarantee balance integrity with double-entry bookkeeping.
 *
 * Quick start:
 *   import { getTigerBeetleClient, LEDGERS } from "@pull/core/services/tigerbeetle";
 *
 *   const tb = await getTigerBeetleClient();
 *   await tb.createUserAccounts(userId);
 *   await tb.deposit(userId, 10000n, LEDGERS.USD, "dep_abc123"); // $100.00
 *   const balance = await tb.getBalance(userId, LEDGERS.USD);
 */

// Client
export {
  TigerBeetleClient,
  createTigerBeetleClient,
  getTigerBeetleClient,
  destroyTigerBeetleClient,
  encodeAccountId,
  encodePlatformAccountId,
  decodeAccountId,
  hashUserId,
  transferIdFromKey,
} from "./client";

// Types - Constants
export {
  ACCOUNT_CODES,
  LEDGERS,
  TRANSFER_CODES,
} from "./types";

// Types - Error
export {
  TigerBeetleErrorCode,
  TigerBeetleError,
} from "./types";

// Types - Interfaces
export type {
  AccountCode,
  LedgerId,
  TigerBeetleConfig,
  TigerBeetleLogger,
  AccountFlagOptions,
  CreateAccountParams,
  AccountBalance,
  TransferFlagOptions,
  CreateTransferParams,
  TransferCode,
  DepositResult,
  WithdrawalResult,
  TradeResult,
  OrderHoldResult,
  ReconciliationResult,
  HealthCheckResult,
  AccountIdComponents,
  TransferBatch,
  TransferBatchResult,
} from "./types";

// Namespace re-export for convenient access
export * as tigerBeetleTypes from "./types";
