/**
 * Fireblocks Custody Client
 * Client for Fireblocks custody and transaction management
 */

import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import type {
  VaultAccount,
  VaultAsset,
  CreateVaultAccountParams,
  ListVaultAccountsParams,
  AssetInfo,
  DepositAddress,
  TransactionDetails,
  CreateTransactionParams,
  ListTransactionsParams,
  GasStationInfo,
  GasStationConfiguration,
} from "./types";
import { FireblocksApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface FireblocksClientConfig {
  apiKey: string;
  apiSecret: string; // RSA private key in PEM format
  baseUrl?: string;
  timeout?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_BASE_URL = "https://api.fireblocks.io";

// ============================================================================
// Fireblocks Client
// ============================================================================

export class FireblocksClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: FireblocksClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? 30000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Fireblocks] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Fireblocks] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Fireblocks] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Fireblocks] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  private signRequest(path: string, body?: string): string {
    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString("hex");

    const payload = {
      uri: path,
      nonce,
      iat: now,
      exp: now + 30, // 30 second expiry
      sub: this.apiKey,
      bodyHash: body
        ? crypto.createHash("sha256").update(body).digest("hex")
        : crypto.createHash("sha256").update("").digest("hex"),
    };

    return jwt.sign(payload, this.apiSecret, { algorithm: "RS256" });
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const token = this.signRequest(path, bodyStr);

    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new FireblocksApiError(
          responseData.message ?? `HTTP ${response.status}`,
          responseData.code ?? -1,
          response.status
        );
      }

      return responseData as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof FireblocksApiError) {
        this.logger.error("Fireblocks API error", {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new FireblocksApiError("Request timeout", -1, 408);
        }
        throw new FireblocksApiError(error.message, -1, 500);
      }

      throw error;
    }
  }

  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return "";

    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

    return entries.length > 0 ? `?${entries.join("&")}` : "";
  }

  // ==========================================================================
  // Vault Management
  // ==========================================================================

  /**
   * Create a new vault account
   */
  async createVaultAccount(params: CreateVaultAccountParams): Promise<VaultAccount> {
    this.logger.info("Creating vault account", { name: params.name });

    const response = await this.request<VaultAccount>("POST", "/v1/vault/accounts", params);

    this.logger.info("Vault account created", { id: response.id });
    return response;
  }

  /**
   * Get vault account by ID
   */
  async getVaultAccount(vaultId: string): Promise<VaultAccount> {
    this.logger.debug("Getting vault account", { vaultId });

    return this.request<VaultAccount>("GET", `/v1/vault/accounts/${vaultId}`);
  }

  /**
   * List all vault accounts
   */
  async listVaultAccounts(params?: ListVaultAccountsParams): Promise<{
    accounts: VaultAccount[];
    paging?: { before: string; after: string };
  }> {
    this.logger.debug("Listing vault accounts", params);

    const queryString = this.buildQueryString(params);
    return this.request<{
      accounts: VaultAccount[];
      paging?: { before: string; after: string };
    }>("GET", `/v1/vault/accounts_paged${queryString}`);
  }

  /**
   * Hide vault account from UI
   */
  async hideVaultAccount(vaultId: string): Promise<void> {
    this.logger.info("Hiding vault account", { vaultId });

    await this.request<void>("POST", `/v1/vault/accounts/${vaultId}/hide`);
  }

  /**
   * Unhide vault account
   */
  async unhideVaultAccount(vaultId: string): Promise<void> {
    this.logger.info("Unhiding vault account", { vaultId });

    await this.request<void>("POST", `/v1/vault/accounts/${vaultId}/unhide`);
  }

  /**
   * Rename vault account
   */
  async renameVaultAccount(vaultId: string, name: string): Promise<void> {
    this.logger.info("Renaming vault account", { vaultId, name });

    await this.request<void>("PUT", `/v1/vault/accounts/${vaultId}`, { name });
  }

  // ==========================================================================
  // Asset Management
  // ==========================================================================

  /**
   * Add asset wallet to vault
   */
  async createVaultAsset(vaultId: string, assetId: string): Promise<VaultAsset> {
    this.logger.info("Creating vault asset", { vaultId, assetId });

    return this.request<VaultAsset>("POST", `/v1/vault/accounts/${vaultId}/${assetId}`);
  }

  /**
   * Get vault asset balance
   */
  async getVaultAsset(vaultId: string, assetId: string): Promise<VaultAsset> {
    this.logger.debug("Getting vault asset", { vaultId, assetId });

    return this.request<VaultAsset>("GET", `/v1/vault/accounts/${vaultId}/${assetId}`);
  }

  /**
   * Refresh vault asset balance
   */
  async refreshVaultAssetBalance(vaultId: string, assetId: string): Promise<VaultAsset> {
    this.logger.debug("Refreshing vault asset balance", { vaultId, assetId });

    return this.request<VaultAsset>(
      "POST",
      `/v1/vault/accounts/${vaultId}/${assetId}/balance`
    );
  }

  /**
   * Get deposit addresses for asset
   */
  async getDepositAddresses(vaultId: string, assetId: string): Promise<DepositAddress[]> {
    this.logger.debug("Getting deposit addresses", { vaultId, assetId });

    return this.request<DepositAddress[]>(
      "GET",
      `/v1/vault/accounts/${vaultId}/${assetId}/addresses`
    );
  }

  /**
   * Generate new deposit address
   */
  async generateNewAddress(
    vaultId: string,
    assetId: string,
    description?: string
  ): Promise<DepositAddress> {
    this.logger.info("Generating new address", { vaultId, assetId });

    return this.request<DepositAddress>(
      "POST",
      `/v1/vault/accounts/${vaultId}/${assetId}/addresses`,
      description ? { description } : undefined
    );
  }

  // ==========================================================================
  // Transactions
  // ==========================================================================

  /**
   * Create a new transaction
   */
  async createTransaction(params: CreateTransactionParams): Promise<{
    id: string;
    status: string;
  }> {
    this.logger.info("Creating transaction", {
      assetId: params.assetId,
      amount: params.amount,
      operation: params.operation ?? "TRANSFER",
    });

    const response = await this.request<{ id: string; status: string }>(
      "POST",
      "/v1/transactions",
      params as unknown as Record<string, unknown>
    );

    this.logger.info("Transaction created", { id: response.id });
    return response;
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(txId: string): Promise<TransactionDetails> {
    this.logger.debug("Getting transaction", { txId });

    return this.request<TransactionDetails>("GET", `/v1/transactions/${txId}`);
  }

  /**
   * List transactions
   */
  async listTransactions(params?: ListTransactionsParams): Promise<TransactionDetails[]> {
    this.logger.debug("Listing transactions", params);

    const queryString = this.buildQueryString(params);
    return this.request<TransactionDetails[]>("GET", `/v1/transactions${queryString}`);
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(txId: string): Promise<{ success: boolean }> {
    this.logger.info("Canceling transaction", { txId });

    return this.request<{ success: boolean }>("POST", `/v1/transactions/${txId}/cancel`);
  }

  /**
   * Drop (replace) a stuck transaction
   */
  async dropTransaction(
    txId: string,
    feeLevel?: "LOW" | "MEDIUM" | "HIGH"
  ): Promise<{ success: boolean }> {
    this.logger.info("Dropping transaction", { txId, feeLevel });

    return this.request<{ success: boolean }>("POST", `/v1/transactions/${txId}/drop`, {
      feeLevel,
    });
  }

  /**
   * Freeze a transaction
   */
  async freezeTransaction(txId: string): Promise<{ success: boolean }> {
    this.logger.info("Freezing transaction", { txId });

    return this.request<{ success: boolean }>("POST", `/v1/transactions/${txId}/freeze`);
  }

  /**
   * Unfreeze a transaction
   */
  async unfreezeTransaction(txId: string): Promise<{ success: boolean }> {
    this.logger.info("Unfreezing transaction", { txId });

    return this.request<{ success: boolean }>("POST", `/v1/transactions/${txId}/unfreeze`);
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(params: {
    assetId: string;
    amount: string | number;
    source: { type: string; id?: string };
    destination?: { type: string; id?: string; oneTimeAddress?: { address: string } };
    operation?: string;
  }): Promise<{
    low: { networkFee: string; gasPrice?: string };
    medium: { networkFee: string; gasPrice?: string };
    high: { networkFee: string; gasPrice?: string };
  }> {
    this.logger.debug("Estimating fee", params);

    return this.request<{
      low: { networkFee: string; gasPrice?: string };
      medium: { networkFee: string; gasPrice?: string };
      high: { networkFee: string; gasPrice?: string };
    }>("POST", "/v1/transactions/estimate_fee", params);
  }

  // ==========================================================================
  // Supported Assets
  // ==========================================================================

  /**
   * Get all supported assets
   */
  async getSupportedAssets(): Promise<AssetInfo[]> {
    this.logger.debug("Getting supported assets");

    return this.request<AssetInfo[]>("GET", "/v1/supported_assets");
  }

  /**
   * Get specific asset info
   */
  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    const assets = await this.getSupportedAssets();
    const asset = assets.find((a) => a.id === assetId);

    if (!asset) {
      throw new FireblocksApiError(`Asset ${assetId} not found`, 404, 404);
    }

    return asset;
  }

  // ==========================================================================
  // Gas Station
  // ==========================================================================

  /**
   * Get gas station info
   */
  async getGasStationInfo(): Promise<GasStationInfo> {
    this.logger.debug("Getting gas station info");

    return this.request<GasStationInfo>("GET", "/v1/gas_station");
  }

  /**
   * Set gas station configuration
   */
  async setGasStationConfig(
    assetId: string,
    config: GasStationConfiguration
  ): Promise<void> {
    this.logger.info("Setting gas station config", { assetId, config });

    await this.request<void>("PUT", `/v1/gas_station/configuration/${assetId}`, config);
  }

  // ==========================================================================
  // External Wallets
  // ==========================================================================

  /**
   * Create external wallet
   */
  async createExternalWallet(name: string, customerRefId?: string): Promise<{
    id: string;
    name: string;
    customerRefId?: string;
    assets: Array<{ id: string; status: string; address?: string }>;
  }> {
    this.logger.info("Creating external wallet", { name });

    return this.request<{
      id: string;
      name: string;
      customerRefId?: string;
      assets: Array<{ id: string; status: string; address?: string }>;
    }>("POST", "/v1/external_wallets", { name, customerRefId });
  }

  /**
   * Add asset to external wallet
   */
  async addAssetToExternalWallet(
    walletId: string,
    assetId: string,
    address: string,
    tag?: string
  ): Promise<{ id: string; status: string; address: string }> {
    this.logger.info("Adding asset to external wallet", {
      walletId,
      assetId,
      address,
    });

    return this.request<{ id: string; status: string; address: string }>(
      "POST",
      `/v1/external_wallets/${walletId}/${assetId}`,
      { address, tag }
    );
  }

  /**
   * List external wallets
   */
  async listExternalWallets(): Promise<Array<{
    id: string;
    name: string;
    customerRefId?: string;
    assets: Array<{ id: string; status: string; address?: string }>;
  }>> {
    this.logger.debug("Listing external wallets");

    return this.request<Array<{
      id: string;
      name: string;
      customerRefId?: string;
      assets: Array<{ id: string; status: string; address?: string }>;
    }>>("GET", "/v1/external_wallets");
  }

  // ==========================================================================
  // Internal Wallets
  // ==========================================================================

  /**
   * Create internal wallet
   */
  async createInternalWallet(name: string, customerRefId?: string): Promise<{
    id: string;
    name: string;
    customerRefId?: string;
    assets: Array<{ id: string; balance: string; address?: string }>;
  }> {
    this.logger.info("Creating internal wallet", { name });

    return this.request<{
      id: string;
      name: string;
      customerRefId?: string;
      assets: Array<{ id: string; balance: string; address?: string }>;
    }>("POST", "/v1/internal_wallets", { name, customerRefId });
  }

  /**
   * List internal wallets
   */
  async listInternalWallets(): Promise<Array<{
    id: string;
    name: string;
    customerRefId?: string;
    assets: Array<{ id: string; balance: string; address?: string }>;
  }>> {
    this.logger.debug("Listing internal wallets");

    return this.request<Array<{
      id: string;
      name: string;
      customerRefId?: string;
      assets: Array<{ id: string; balance: string; address?: string }>;
    }>>("GET", "/v1/internal_wallets");
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get all vault balances
   */
  async getAllVaultBalances(): Promise<Record<string, VaultAsset[]>> {
    const result: Record<string, VaultAsset[]> = {};
    let after: string | undefined;

    do {
      const response = await this.listVaultAccounts({ limit: 200, after });

      for (const account of response.accounts) {
        if (account.assets.length > 0) {
          result[account.id] = account.assets;
        }
      }

      after = response.paging?.after;
    } while (after);

    return result;
  }

  /**
   * Wait for transaction completion
   */
  async waitForTransaction(
    txId: string,
    options?: {
      timeout?: number;
      pollInterval?: number;
    }
  ): Promise<TransactionDetails> {
    const timeout = options?.timeout ?? 300000; // 5 minutes
    const pollInterval = options?.pollInterval ?? 3000; // 3 seconds
    const startTime = Date.now();

    const terminalStatuses = [
      "COMPLETED",
      "CANCELLED",
      "REJECTED",
      "FAILED",
      "BLOCKED",
    ];

    while (Date.now() - startTime < timeout) {
      const tx = await this.getTransaction(txId);

      if (terminalStatuses.includes(tx.status)) {
        return tx;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new FireblocksApiError("Transaction timeout", -1, 408);
  }
}

export default FireblocksClient;
