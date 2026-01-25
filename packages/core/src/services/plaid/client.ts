/**
 * Plaid Banking Client
 * Client for Plaid API integration - banking, auth, and transfers
 */

import type {
  PlaidEnvironment,
  PlaidProduct,
  PlaidCountryCode,
  CreateLinkTokenParams,
  LinkToken,
  Account,
  Item,
  AuthResponse,
  IdentityResponse,
  BalanceResponse,
  CreateTransferParams,
  Transfer,
  ListTransfersParams,
  ProcessorType,
  CreateIDVParams,
  CreateLinkTokenForIDVParams,
  IdentityVerification,
} from "./types";
import { PlaidApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface PlaidClientConfig {
  clientId: string;
  secret: string;
  env: PlaidEnvironment;
  timeout?: number;
  maxRetries?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const BASE_URLS: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

// ============================================================================
// Plaid Client
// ============================================================================

export class PlaidClient {
  private readonly clientId: string;
  private readonly secret: string;
  private readonly env: PlaidEnvironment;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(config: PlaidClientConfig) {
    this.clientId = config.clientId;
    this.secret = config.secret;
    this.env = config.env;
    this.baseUrl = BASE_URLS[config.env];
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Plaid] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Plaid] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Plaid] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Plaid] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const body = {
      client_id: this.clientId,
      secret: this.secret,
      ...data,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Plaid-Version": "2020-09-14",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseData = await response.json();

        if (!response.ok) {
          const error = new PlaidApiError(responseData, response.status);

          // Don't retry 4xx errors (except 429)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            this.logger.error("Plaid API error", {
              errorType: error.errorType,
              errorCode: error.errorCode,
              message: error.message,
            });
            throw error;
          }

          // Retry on 429 and 5xx
          lastError = error;
          if (attempt < this.maxRetries) {
            const waitTime = response.status === 429
              ? Math.min(5000 * Math.pow(2, attempt), 60000)
              : Math.min(1000 * Math.pow(2, attempt), 15000);
            this.logger.warn(`Plaid request failed (${response.status}), retrying in ${waitTime}ms`, { attempt, endpoint });
            await this.sleep(waitTime);
            continue;
          }
          throw error;
        }

        return responseData as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof PlaidApiError) {
          throw error;
        }

        lastError = error as Error;

        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < this.maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 15000);
            this.logger.warn(`Plaid request timeout, retrying in ${waitTime}ms`, { attempt, endpoint });
            await this.sleep(waitTime);
            continue;
          }
          throw new PlaidApiError(
            {
              error_type: "API_ERROR",
              error_code: "TIMEOUT",
              error_message: "Request timeout after retries",
              display_message: null,
              request_id: "",
            },
            408
          );
        }

        if (attempt < this.maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 15000);
          this.logger.warn(`Plaid request failed, retrying in ${waitTime}ms`, { attempt, endpoint, error: (error as Error).message });
          await this.sleep(waitTime);
          continue;
        }

        throw new PlaidApiError(
          {
            error_type: "API_ERROR",
            error_code: "INTERNAL_ERROR",
            error_message: (error as Error).message ?? "Unknown error",
            display_message: null,
            request_id: "",
          },
          500
        );
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Link Token
  // ==========================================================================

  /**
   * Create a Link token for initializing Plaid Link
   */
  async createLinkToken(params: CreateLinkTokenParams): Promise<LinkToken> {
    this.logger.info("Creating link token", { userId: params.userId });

    const response = await this.request<LinkToken>("/link/token/create", {
      user: {
        client_user_id: params.userId,
      },
      client_name: params.clientName ?? "PULL",
      products: params.products,
      country_codes: params.countryCodes ?? ["US"],
      language: params.language ?? "en",
      webhook: params.webhook,
      access_token: params.accessToken,
      link_customization_name: params.linkCustomizationName,
      redirect_uri: params.redirectUri,
      android_package_name: params.androidPackageName,
      account_filters: params.accountFilters,
    });

    this.logger.info("Link token created", { expiration: response.expiration });
    return response;
  }

  // ==========================================================================
  // Token Exchange
  // ==========================================================================

  /**
   * Exchange public token for access token
   */
  async exchangePublicToken(publicToken: string): Promise<{
    accessToken: string;
    itemId: string;
  }> {
    this.logger.info("Exchanging public token");

    const response = await this.request<{
      access_token: string;
      item_id: string;
      request_id: string;
    }>("/item/public_token/exchange", {
      public_token: publicToken,
    });

    this.logger.info("Token exchanged", { itemId: response.item_id });
    return {
      accessToken: response.access_token,
      itemId: response.item_id,
    };
  }

  /**
   * Get item information
   */
  async getItem(accessToken: string): Promise<Item> {
    const response = await this.request<{
      item: Item;
      status: { transactions: unknown };
      request_id: string;
    }>("/item/get", {
      access_token: accessToken,
    });

    return response.item;
  }

  /**
   * Remove an item (unlink bank account)
   */
  async removeItem(accessToken: string): Promise<void> {
    this.logger.info("Removing item");

    await this.request<{ request_id: string }>("/item/remove", {
      access_token: accessToken,
    });

    this.logger.info("Item removed");
  }

  // ==========================================================================
  // Auth
  // ==========================================================================

  /**
   * Get account and routing numbers
   */
  async getAuth(accessToken: string): Promise<AuthResponse> {
    this.logger.debug("Getting auth data");

    const response = await this.request<AuthResponse>("/auth/get", {
      access_token: accessToken,
    });

    return response;
  }

  // ==========================================================================
  // Identity
  // ==========================================================================

  /**
   * Get account holder identity information
   */
  async getIdentity(accessToken: string): Promise<IdentityResponse> {
    this.logger.debug("Getting identity data");

    const response = await this.request<IdentityResponse>("/identity/get", {
      access_token: accessToken,
    });

    return response;
  }

  // ==========================================================================
  // Balance
  // ==========================================================================

  /**
   * Get real-time account balances
   */
  async getBalance(
    accessToken: string,
    accountIds?: string[]
  ): Promise<BalanceResponse> {
    this.logger.debug("Getting balance");

    const options: Record<string, unknown> = {};
    if (accountIds) {
      options.account_ids = accountIds;
    }

    const response = await this.request<BalanceResponse>("/accounts/balance/get", {
      access_token: accessToken,
      options: Object.keys(options).length > 0 ? options : undefined,
    });

    return response;
  }

  /**
   * Get accounts without balance refresh
   */
  async getAccounts(
    accessToken: string,
    accountIds?: string[]
  ): Promise<{ accounts: Account[]; item: Item }> {
    this.logger.debug("Getting accounts");

    const options: Record<string, unknown> = {};
    if (accountIds) {
      options.account_ids = accountIds;
    }

    const response = await this.request<{
      accounts: Account[];
      item: Item;
      request_id: string;
    }>("/accounts/get", {
      access_token: accessToken,
      options: Object.keys(options).length > 0 ? options : undefined,
    });

    return {
      accounts: response.accounts,
      item: response.item,
    };
  }

  // ==========================================================================
  // Transfers
  // ==========================================================================

  /**
   * Create an ACH transfer
   */
  async createTransfer(params: CreateTransferParams): Promise<Transfer> {
    this.logger.info("Creating transfer", {
      type: params.type,
      amount: params.amount,
    });

    const response = await this.request<{
      transfer: Transfer;
      request_id: string;
    }>("/transfer/create", {
      access_token: params.accessToken,
      account_id: params.accountId,
      type: params.type,
      network: params.network,
      amount: params.amount,
      ach_class: params.achClass,
      description: params.description,
      user: params.user,
      metadata: params.metadata,
      origination_account_id: params.originationAccountId,
      iso_currency_code: params.isoCurrencyCode ?? "USD",
    });

    this.logger.info("Transfer created", { transferId: response.transfer.id });
    return response.transfer;
  }

  /**
   * Get transfer by ID
   */
  async getTransfer(transferId: string): Promise<Transfer> {
    this.logger.debug("Getting transfer", { transferId });

    const response = await this.request<{
      transfer: Transfer;
      request_id: string;
    }>("/transfer/get", {
      transfer_id: transferId,
    });

    return response.transfer;
  }

  /**
   * List transfers
   */
  async listTransfers(params?: ListTransfersParams): Promise<Transfer[]> {
    this.logger.debug("Listing transfers", params);

    const response = await this.request<{
      transfers: Transfer[];
      request_id: string;
    }>("/transfer/list", {
      start_date: params?.startDate,
      end_date: params?.endDate,
      count: params?.count ?? 25,
      offset: params?.offset ?? 0,
      origination_account_id: params?.originationAccountId,
    });

    return response.transfers;
  }

  /**
   * Cancel a pending transfer
   */
  async cancelTransfer(transferId: string): Promise<void> {
    this.logger.info("Canceling transfer", { transferId });

    await this.request<{ request_id: string }>("/transfer/cancel", {
      transfer_id: transferId,
    });

    this.logger.info("Transfer canceled", { transferId });
  }

  /**
   * Get transfer events
   */
  async getTransferEvents(params: {
    transferId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    count?: number;
    offset?: number;
  }): Promise<Array<{
    event_id: string;
    timestamp: string;
    event_type: string;
    account_id: string;
    transfer_id: string;
    origination_account_id: string | null;
    transfer_type: string;
    transfer_amount: string;
    failure_reason: { ach_return_code: string; description: string } | null;
    sweep_id: string | null;
    sweep_amount: string | null;
  }>> {
    const response = await this.request<{
      transfer_events: Array<{
        event_id: string;
        timestamp: string;
        event_type: string;
        account_id: string;
        transfer_id: string;
        origination_account_id: string | null;
        transfer_type: string;
        transfer_amount: string;
        failure_reason: { ach_return_code: string; description: string } | null;
        sweep_id: string | null;
        sweep_amount: string | null;
      }>;
      request_id: string;
    }>("/transfer/event/list", {
      transfer_id: params.transferId,
      account_id: params.accountId,
      start_date: params.startDate,
      end_date: params.endDate,
      count: params.count ?? 25,
      offset: params.offset ?? 0,
    });

    return response.transfer_events;
  }

  // ==========================================================================
  // Processor Tokens
  // ==========================================================================

  /**
   * Create processor token for third-party integration
   */
  async createProcessorToken(
    accessToken: string,
    accountId: string,
    processor: ProcessorType
  ): Promise<string> {
    this.logger.info("Creating processor token", { processor, accountId });

    const response = await this.request<{
      processor_token: string;
      request_id: string;
    }>("/processor/token/create", {
      access_token: accessToken,
      account_id: accountId,
      processor,
    });

    this.logger.info("Processor token created", { processor });
    return response.processor_token;
  }

  /**
   * Create Stripe bank account token
   */
  async createStripeBankAccountToken(
    accessToken: string,
    accountId: string
  ): Promise<string> {
    this.logger.info("Creating Stripe bank account token", { accountId });

    const response = await this.request<{
      stripe_bank_account_token: string;
      request_id: string;
    }>("/processor/stripe/bank_account_token/create", {
      access_token: accessToken,
      account_id: accountId,
    });

    return response.stripe_bank_account_token;
  }

  // ==========================================================================
  // Webhooks
  // ==========================================================================

  /**
   * Update webhook URL for an item
   */
  async updateWebhook(accessToken: string, webhook: string): Promise<Item> {
    this.logger.info("Updating webhook");

    const response = await this.request<{
      item: Item;
      request_id: string;
    }>("/item/webhook/update", {
      access_token: accessToken,
      webhook,
    });

    return response.item;
  }

  // ==========================================================================
  // Institutions
  // ==========================================================================

  /**
   * Get institution by ID
   */
  async getInstitution(
    institutionId: string,
    countryCodes: PlaidCountryCode[] = ["US"]
  ): Promise<{
    institution_id: string;
    name: string;
    products: PlaidProduct[];
    country_codes: PlaidCountryCode[];
    url: string | null;
    primary_color: string | null;
    logo: string | null;
    routing_numbers: string[];
    oauth: boolean;
  }> {
    const response = await this.request<{
      institution: {
        institution_id: string;
        name: string;
        products: PlaidProduct[];
        country_codes: PlaidCountryCode[];
        url: string | null;
        primary_color: string | null;
        logo: string | null;
        routing_numbers: string[];
        oauth: boolean;
      };
      request_id: string;
    }>("/institutions/get_by_id", {
      institution_id: institutionId,
      country_codes: countryCodes,
    });

    return response.institution;
  }

  /**
   * Search institutions
   */
  async searchInstitutions(
    query: string,
    products: PlaidProduct[] = ["auth", "transactions"],
    countryCodes: PlaidCountryCode[] = ["US"],
    count: number = 10
  ): Promise<Array<{
    institution_id: string;
    name: string;
    products: PlaidProduct[];
    country_codes: PlaidCountryCode[];
    oauth: boolean;
  }>> {
    const response = await this.request<{
      institutions: Array<{
        institution_id: string;
        name: string;
        products: PlaidProduct[];
        country_codes: PlaidCountryCode[];
        oauth: boolean;
      }>;
      request_id: string;
    }>("/institutions/search", {
      query,
      products,
      country_codes: countryCodes,
      options: {
        include_optional_metadata: true,
      },
      count,
    });

    return response.institutions;
  }

  // ==========================================================================
  // Identity Verification
  // ==========================================================================

  /**
   * Create a Link token for Identity Verification
   */
  async createLinkTokenForIDV(params: CreateLinkTokenForIDVParams): Promise<LinkToken> {
    this.logger.info("Creating IDV link token", { userId: params.userId });

    const response = await this.request<LinkToken>("/link/token/create", {
      user: {
        client_user_id: params.userId,
      },
      client_name: "PULL",
      products: ["identity_verification"],
      country_codes: ["US"],
      language: "en",
      identity_verification: {
        template_id: params.templateId,
        gave_consent: params.gaveConsent ?? false,
        is_shareable: params.isShareable ?? false,
      },
    });

    this.logger.info("IDV link token created", { expiration: response.expiration });
    return response;
  }

  /**
   * Create identity verification session
   */
  async createIdentityVerification(params: CreateIDVParams): Promise<IdentityVerification> {
    this.logger.info("Creating identity verification", { userId: params.clientUserId });

    const body: Record<string, unknown> = {
      template_id: params.templateId,
      client_user_id: params.clientUserId,
      is_shareable: params.isShareable ?? false,
      is_idempotent: params.isIdempotent ?? true,
    };

    if (params.user) {
      const user: Record<string, unknown> = {};
      if (params.user.emailAddress) user.email_address = params.user.emailAddress;
      if (params.user.phoneNumber) user.phone_number = params.user.phoneNumber;
      if (params.user.dateOfBirth) user.date_of_birth = params.user.dateOfBirth;
      if (params.user.name) {
        user.name = {
          given_name: params.user.name.givenName,
          family_name: params.user.name.familyName,
        };
      }
      if (params.user.address) {
        user.address = {
          street: params.user.address.street,
          street2: params.user.address.street2,
          city: params.user.address.city,
          region: params.user.address.region,
          postal_code: params.user.address.postalCode,
          country: params.user.address.country,
        };
      }
      body.user = user;
    }

    const response = await this.request<IdentityVerification>(
      "/identity_verification/create",
      body
    );

    this.logger.info("Identity verification created", { id: response.id });
    return response;
  }

  /**
   * Get identity verification status
   */
  async getIdentityVerification(idvId: string): Promise<IdentityVerification> {
    this.logger.debug("Getting identity verification", { idvId });

    const response = await this.request<IdentityVerification>(
      "/identity_verification/get",
      { identity_verification_id: idvId }
    );

    return response;
  }

  /**
   * List identity verifications for a user
   */
  async listIdentityVerifications(
    clientUserId: string,
    templateId: string
  ): Promise<IdentityVerification[]> {
    this.logger.debug("Listing identity verifications", { clientUserId });

    const response = await this.request<{
      identity_verifications: IdentityVerification[];
      request_id: string;
    }>("/identity_verification/list", {
      client_user_id: clientUserId,
      template_id: templateId,
    });

    return response.identity_verifications;
  }

  /**
   * Retry identity verification
   */
  async retryIdentityVerification(
    clientUserId: string,
    templateId: string,
    strategy: "reset" | "incomplete" = "reset"
  ): Promise<IdentityVerification> {
    this.logger.info("Retrying identity verification", { clientUserId });

    const response = await this.request<IdentityVerification>(
      "/identity_verification/retry",
      {
        client_user_id: clientUserId,
        template_id: templateId,
        strategy,
      }
    );

    return response;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get environment
   */
  getEnvironment(): PlaidEnvironment {
    return this.env;
  }

  /**
   * Check if in sandbox mode
   */
  isSandbox(): boolean {
    return this.env === "sandbox";
  }
}

export default PlaidClient;
