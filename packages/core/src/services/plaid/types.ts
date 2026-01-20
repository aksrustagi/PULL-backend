/**
 * Plaid API Types
 * Type definitions for Plaid banking integration
 */

// ============================================================================
// Common Types
// ============================================================================

export type PlaidEnvironment = "sandbox" | "development" | "production";

export type PlaidProduct =
  | "auth"
  | "transactions"
  | "identity"
  | "assets"
  | "investments"
  | "liabilities"
  | "payment_initiation"
  | "deposit_switch"
  | "income_verification"
  | "transfer"
  | "employment"
  | "recurring_transactions";

export type PlaidCountryCode = "US" | "GB" | "ES" | "NL" | "FR" | "IE" | "CA" | "DE" | "IT" | "PL" | "DK" | "NO" | "SE" | "EE" | "LT" | "LV" | "PT" | "BE";

// ============================================================================
// Link Token Types
// ============================================================================

export interface CreateLinkTokenParams {
  userId: string;
  products: PlaidProduct[];
  clientName?: string;
  language?: string;
  countryCodes?: PlaidCountryCode[];
  webhook?: string;
  accessToken?: string; // For update mode
  linkCustomizationName?: string;
  redirectUri?: string;
  androidPackageName?: string;
  accountFilters?: AccountFilters;
}

export interface AccountFilters {
  depository?: {
    account_subtypes: DepositoryAccountSubtype[];
  };
  credit?: {
    account_subtypes: CreditAccountSubtype[];
  };
}

export type DepositoryAccountSubtype =
  | "checking"
  | "savings"
  | "hsa"
  | "cd"
  | "money market"
  | "paypal"
  | "prepaid"
  | "cash management"
  | "ebt";

export type CreditAccountSubtype =
  | "credit card"
  | "paypal"
  | "all";

export interface LinkToken {
  link_token: string;
  expiration: string;
  request_id: string;
}

// ============================================================================
// Account Types
// ============================================================================

export interface Account {
  account_id: string;
  balances: AccountBalances;
  mask: string | null;
  name: string;
  official_name: string | null;
  subtype: string | null;
  type: AccountType;
  verification_status: VerificationStatus | null;
}

export type AccountType =
  | "depository"
  | "credit"
  | "loan"
  | "investment"
  | "brokerage"
  | "other";

export type VerificationStatus =
  | "automatically_verified"
  | "pending_automatic_verification"
  | "pending_manual_verification"
  | "manually_verified"
  | "verification_expired"
  | "verification_failed";

export interface AccountBalances {
  available: number | null;
  current: number | null;
  limit: number | null;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

// ============================================================================
// Item Types
// ============================================================================

export interface Item {
  item_id: string;
  institution_id: string | null;
  webhook: string | null;
  error: PlaidError | null;
  available_products: PlaidProduct[];
  billed_products: PlaidProduct[];
  consent_expiration_time: string | null;
  update_type: "background" | "user_present_required";
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthNumbers {
  ach: ACHNumbers[];
  eft: EFTNumbers[];
  international: InternationalNumbers[];
  bacs: BACSNumbers[];
}

export interface ACHNumbers {
  account_id: string;
  account: string;
  routing: string;
  wire_routing: string | null;
}

export interface EFTNumbers {
  account_id: string;
  account: string;
  institution: string;
  branch: string;
}

export interface InternationalNumbers {
  account_id: string;
  iban: string;
  bic: string;
}

export interface BACSNumbers {
  account_id: string;
  account: string;
  sort_code: string;
}

export interface AuthResponse {
  accounts: Account[];
  numbers: AuthNumbers;
  item: Item;
  request_id: string;
}

// ============================================================================
// Identity Types
// ============================================================================

export interface IdentityResponse {
  accounts: IdentityAccount[];
  item: Item;
  request_id: string;
}

export interface IdentityAccount extends Account {
  owners: AccountOwner[];
}

export interface AccountOwner {
  names: string[];
  phone_numbers: PhoneNumber[];
  emails: Email[];
  addresses: Address[];
}

export interface PhoneNumber {
  data: string;
  primary: boolean;
  type: "home" | "work" | "office" | "mobile" | "mobile1" | "other";
}

export interface Email {
  data: string;
  primary: boolean;
  type: "primary" | "secondary" | "other";
}

export interface Address {
  data: {
    city: string | null;
    region: string | null;
    street: string | null;
    postal_code: string | null;
    country: string | null;
  };
  primary: boolean;
}

// ============================================================================
// Balance Types
// ============================================================================

export interface BalanceResponse {
  accounts: Account[];
  item: Item;
  request_id: string;
}

// ============================================================================
// Transfer Types
// ============================================================================

export type TransferType = "debit" | "credit";

export type TransferNetwork = "ach" | "same-day-ach" | "rtp";

export type ACHClass = "ccd" | "ppd" | "tel" | "web";

export type TransferStatus =
  | "pending"
  | "posted"
  | "settled"
  | "cancelled"
  | "failed"
  | "returned";

export type TransferSweepStatus =
  | "unswept"
  | "swept"
  | "swept_settled"
  | "return_swept";

export interface CreateTransferParams {
  accessToken: string;
  accountId: string;
  type: TransferType;
  network: TransferNetwork;
  amount: string; // Decimal string
  achClass: ACHClass;
  description: string;
  user: TransferUser;
  metadata?: Record<string, string>;
  originationAccountId?: string;
  isoCurrencyCode?: string;
}

export interface TransferUser {
  legal_name: string;
  phone_number?: string;
  email_address?: string;
  address?: {
    street?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface Transfer {
  id: string;
  ach_class: ACHClass;
  account_id: string;
  type: TransferType;
  user: TransferUser;
  amount: string;
  description: string;
  created: string;
  status: TransferStatus;
  sweep_status: TransferSweepStatus | null;
  network: TransferNetwork;
  cancellable: boolean;
  failure_reason: TransferFailure | null;
  metadata: Record<string, string> | null;
  origination_account_id: string;
  iso_currency_code: string;
}

export interface TransferFailure {
  ach_return_code: string | null;
  description: string;
}

export interface ListTransfersParams {
  startDate?: string;
  endDate?: string;
  count?: number;
  offset?: number;
  originationAccountId?: string;
}

// ============================================================================
// Processor Token Types
// ============================================================================

export type ProcessorType =
  | "dwolla"
  | "galileo"
  | "modern_treasury"
  | "ocrolus"
  | "prime_trust"
  | "vesta"
  | "drivewealth"
  | "vopay"
  | "achq"
  | "check"
  | "checkbook"
  | "circle"
  | "sila_money"
  | "rize"
  | "svb_api"
  | "unit"
  | "wyre"
  | "lithic"
  | "alpaca"
  | "astra"
  | "moov"
  | "treasury_prime"
  | "marqeta"
  | "checkout"
  | "solid"
  | "highnote"
  | "gemini"
  | "apex_clearing"
  | "gusto"
  | "adyen";

// ============================================================================
// Error Types
// ============================================================================

export type PlaidErrorType =
  | "INVALID_REQUEST"
  | "INVALID_RESULT"
  | "INVALID_INPUT"
  | "INSTITUTION_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "API_ERROR"
  | "ITEM_ERROR"
  | "ASSET_REPORT_ERROR"
  | "RECAPTCHA_ERROR"
  | "OAUTH_ERROR"
  | "PAYMENT_ERROR"
  | "BANK_TRANSFER_ERROR"
  | "INCOME_VERIFICATION_ERROR";

export interface PlaidError {
  error_type: PlaidErrorType;
  error_code: string;
  error_message: string;
  display_message: string | null;
  request_id: string;
  causes?: PlaidError[];
  status?: number;
  documentation_url?: string;
  suggested_action?: string;
}

export class PlaidApiError extends Error {
  public readonly errorType: PlaidErrorType;
  public readonly errorCode: string;
  public readonly displayMessage: string | null;
  public readonly requestId: string;
  public readonly statusCode: number;

  constructor(error: PlaidError, statusCode: number = 400) {
    super(error.error_message);
    this.name = "PlaidApiError";
    this.errorType = error.error_type;
    this.errorCode = error.error_code;
    this.displayMessage = error.display_message;
    this.requestId = error.request_id;
    this.statusCode = statusCode;
  }

  /**
   * Check if error requires user to re-link
   */
  requiresRelink(): boolean {
    const relinkCodes = [
      "ITEM_LOGIN_REQUIRED",
      "INVALID_CREDENTIALS",
      "INVALID_MFA",
      "ITEM_LOCKED",
      "USER_SETUP_REQUIRED",
      "MFA_NOT_SUPPORTED",
      "INSUFFICIENT_CREDENTIALS",
    ];
    return relinkCodes.includes(this.errorCode);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableTypes: PlaidErrorType[] = [
      "RATE_LIMIT_EXCEEDED",
      "INSTITUTION_ERROR",
    ];
    const retryableCodes = [
      "INTERNAL_SERVER_ERROR",
      "PLANNED_MAINTENANCE",
    ];
    return (
      retryableTypes.includes(this.errorType) ||
      retryableCodes.includes(this.errorCode)
    );
  }
}
