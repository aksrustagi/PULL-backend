/**
 * Fireblocks API Types
 * Type definitions for Fireblocks custody service
 */

// ============================================================================
// Vault Types
// ============================================================================

export interface VaultAccount {
  id: string;
  name: string;
  hiddenOnUI: boolean;
  assets: VaultAsset[];
  customerRefId?: string;
  autoFuel: boolean;
}

export interface VaultAsset {
  id: string;
  total: string;
  balance: string;
  lockedAmount: string;
  available: string;
  pending: string;
  frozen: string;
  staked: string;
  blockHeight?: string;
  blockHash?: string;
}

export interface CreateVaultAccountParams {
  name: string;
  hiddenOnUI?: boolean;
  customerRefId?: string;
  autoFuel?: boolean;
}

export interface ListVaultAccountsParams {
  namePrefix?: string;
  nameSuffix?: string;
  minAmountThreshold?: number;
  assetId?: string;
  orderBy?: "ASC" | "DESC";
  before?: string;
  after?: string;
  limit?: number;
}

// ============================================================================
// Asset Types
// ============================================================================

export interface AssetInfo {
  id: string;
  name: string;
  type: AssetType;
  contractAddress?: string;
  nativeAsset?: string;
  decimals?: number;
}

export type AssetType =
  | "BASE_ASSET"
  | "ETH"
  | "ERC20"
  | "FIAT"
  | "BTC"
  | "SOL"
  | "SOL_ASSET"
  | "TRON"
  | "TRC20"
  | "ALGO"
  | "ALGO_ASSET"
  | "XLM"
  | "XLM_ASSET"
  | "XRP"
  | "XRP_ASSET";

export interface DepositAddress {
  assetId: string;
  address: string;
  tag?: string;
  description?: string;
  type: string;
  legacyAddress?: string;
  enterpriseAddress?: string;
  bip44AddressIndex?: number;
}

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionStatus =
  | "SUBMITTED"
  | "QUEUED"
  | "PENDING_SIGNATURE"
  | "PENDING_AUTHORIZATION"
  | "PENDING_3RD_PARTY_MANUAL_APPROVAL"
  | "PENDING_3RD_PARTY"
  | "BROADCASTING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "COMPLETED"
  | "PENDING_AML_SCREENING"
  | "PARTIALLY_COMPLETED"
  | "CANCELLING"
  | "CANCELLED"
  | "REJECTED"
  | "FAILED"
  | "TIMEOUT"
  | "BLOCKED";

export type TransactionOperation =
  | "TRANSFER"
  | "MINT"
  | "BURN"
  | "SUPPLY_TO_COMPOUND"
  | "REDEEM_FROM_COMPOUND"
  | "RAW"
  | "CONTRACT_CALL"
  | "TYPED_MESSAGE";

export type PeerType =
  | "VAULT_ACCOUNT"
  | "EXCHANGE_ACCOUNT"
  | "INTERNAL_WALLET"
  | "EXTERNAL_WALLET"
  | "ONE_TIME_ADDRESS"
  | "NETWORK_CONNECTION"
  | "FIAT_ACCOUNT"
  | "COMPOUND"
  | "GAS_STATION"
  | "END_USER_WALLET";

export interface TransferPeerPath {
  type: PeerType;
  id?: string;
  walletId?: string;
  virtualId?: string;
  virtualType?: string;
}

export interface DestinationTransferPeerPath extends TransferPeerPath {
  oneTimeAddress?: {
    address: string;
    tag?: string;
  };
}

export interface CreateTransactionParams {
  assetId: string;
  source: TransferPeerPath;
  destination?: DestinationTransferPeerPath;
  amount: string | number;
  treatAsGrossAmount?: boolean;
  fee?: string | number;
  feeLevel?: "LOW" | "MEDIUM" | "HIGH";
  maxFee?: string;
  priorityFee?: string;
  gasLimit?: string | number;
  gasPrice?: string | number;
  note?: string;
  autoStaking?: boolean;
  networkStaking?: object;
  cpuStaking?: object;
  operation?: TransactionOperation;
  customerRefId?: string;
  replaceTxByHash?: string;
  extraParameters?: object;
  destinations?: Array<{
    amount: string | number;
    destination: DestinationTransferPeerPath;
  }>;
  externalTxId?: string;
}

export interface TransactionDetails {
  id: string;
  assetId: string;
  source: TransferPeerPath;
  destination?: DestinationTransferPeerPath;
  requestedAmount: number;
  amountInfo?: {
    amount: string;
    requestedAmount: string;
    netAmount: string;
    amountUSD: string;
  };
  feeInfo?: {
    networkFee: string;
    serviceFee: string;
    gasPrice?: string;
  };
  amount: number;
  netAmount: number;
  fee?: number;
  networkFee?: number;
  serviceFee?: number;
  status: TransactionStatus;
  txHash?: string;
  subStatus?: string;
  operation: TransactionOperation;
  note?: string;
  exchangeTxId?: string;
  sourceAddress?: string;
  destinationAddress?: string;
  destinationAddressDescription?: string;
  destinationTag?: string;
  signedBy: string[];
  createdAt: number;
  lastUpdated: number;
  createdBy: string;
  signedMessages?: Array<{
    content: string;
    algorithm: string;
    derivationPath: number[];
    signature: {
      fullSig: string;
      r: string;
      s: string;
      v: number;
    };
    publicKey: string;
  }>;
  replacedTxHash?: string;
  externalTxId?: string;
  blockInfo?: {
    blockHeight?: string;
    blockHash?: string;
  };
  authorizationInfo?: {
    allowOperatorAsAuthorizer: boolean;
    logic: "AND" | "OR";
    groups: Array<{
      th: number;
      users: Record<string, string>;
    }>;
  };
  extraParameters?: object;
  numOfConfirmations?: number;
}

export interface ListTransactionsParams {
  before?: string;
  after?: string;
  status?: TransactionStatus;
  sourceType?: PeerType;
  sourceId?: string;
  destType?: PeerType;
  destId?: string;
  assets?: string;
  txHash?: string;
  orderBy?: "createdAt" | "lastUpdated";
  sort?: "ASC" | "DESC";
  limit?: number;
}

// ============================================================================
// Gas Station Types
// ============================================================================

export interface GasStationInfo {
  balance: Record<string, string>;
  configuration: GasStationConfiguration;
}

export interface GasStationConfiguration {
  gasThreshold: string;
  gasCap: string;
  maxGasPrice?: string;
}

// ============================================================================
// Network Connection Types
// ============================================================================

export interface NetworkConnection {
  id: string;
  status: "WAITING_FOR_APPROVAL" | "APPROVED" | "CANCELLED" | "FAILED";
  localChannel: {
    networkId: string;
    name: string;
  };
  remoteChannel: {
    networkId: string;
    name: string;
  };
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEventType =
  | "TRANSACTION_CREATED"
  | "TRANSACTION_STATUS_UPDATED"
  | "VAULT_ACCOUNT_ADDED"
  | "VAULT_ACCOUNT_ASSET_ADDED"
  | "INTERNAL_WALLET_ASSET_ADDED"
  | "EXTERNAL_WALLET_ASSET_ADDED"
  | "EXCHANGE_ACCOUNT_ADDED"
  | "FIAT_ACCOUNT_ADDED"
  | "NETWORK_CONNECTION_ADDED";

export interface WebhookPayload {
  type: WebhookEventType;
  tenantId: string;
  timestamp: number;
  data: TransactionDetails | VaultAccount | NetworkConnection;
}

// ============================================================================
// Error Types
// ============================================================================

export interface FireblocksError {
  message: string;
  code: number;
}

export class FireblocksApiError extends Error {
  public readonly code: number;
  public readonly statusCode: number;

  constructor(message: string, code: number, statusCode: number) {
    super(message);
    this.name = "FireblocksApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
