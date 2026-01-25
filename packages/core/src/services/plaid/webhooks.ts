/**
 * Plaid Webhook Types and Handlers
 * Webhook verification and event type definitions
 */

import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";

// ============================================================================
// Webhook Event Types
// ============================================================================

export type PlaidWebhookType =
  | "ITEM"
  | "TRANSACTIONS"
  | "AUTH"
  | "ASSETS"
  | "HOLDINGS"
  | "INVESTMENTS_TRANSACTIONS"
  | "LIABILITIES"
  | "PAYMENT_INITIATION"
  | "TRANSFER"
  | "INCOME"
  | "LINK"
  | "IDENTITY"
  | "IDENTITY_VERIFICATION"
  | "BANK_TRANSFERS";

// Item Webhook Codes
export type ItemWebhookCode =
  | "ERROR"
  | "NEW_ACCOUNTS_AVAILABLE"
  | "PENDING_EXPIRATION"
  | "USER_PERMISSION_REVOKED"
  | "WEBHOOK_UPDATE_ACKNOWLEDGED";

// Transactions Webhook Codes
export type TransactionsWebhookCode =
  | "INITIAL_UPDATE"
  | "HISTORICAL_UPDATE"
  | "DEFAULT_UPDATE"
  | "TRANSACTIONS_REMOVED"
  | "SYNC_UPDATES_AVAILABLE";

// Auth Webhook Codes
export type AuthWebhookCode =
  | "AUTOMATICALLY_VERIFIED"
  | "VERIFICATION_EXPIRED";

// Transfer Webhook Codes
export type TransferWebhookCode =
  | "TRANSFER_EVENTS_UPDATE"
  | "RECURRING_NEW_TRANSFER"
  | "RECURRING_TRANSFER_SKIPPED"
  | "RECURRING_CANCELLED";

// Link Webhook Codes
export type LinkWebhookCode =
  | "EVENTS"
  | "SESSION_FINISHED";

// Identity Webhook Codes
export type IdentityWebhookCode =
  | "IDENTITY_VERIFICATION_STEP_UPDATED"
  | "IDENTITY_VERIFICATION_STATUS_UPDATED";

// ============================================================================
// Webhook Payloads
// ============================================================================

export interface BaseWebhookPayload {
  webhook_type: PlaidWebhookType;
  webhook_code: string;
  item_id?: string;
  error?: {
    error_type: string;
    error_code: string;
    error_message: string;
    display_message: string | null;
  };
  environment: "sandbox" | "development" | "production";
}

// Item Webhooks
export interface ItemErrorWebhook extends BaseWebhookPayload {
  webhook_type: "ITEM";
  webhook_code: "ERROR";
  item_id: string;
  error: {
    error_type: string;
    error_code: string;
    error_message: string;
    display_message: string | null;
  };
}

export interface ItemNewAccountsWebhook extends BaseWebhookPayload {
  webhook_type: "ITEM";
  webhook_code: "NEW_ACCOUNTS_AVAILABLE";
  item_id: string;
}

export interface ItemPendingExpirationWebhook extends BaseWebhookPayload {
  webhook_type: "ITEM";
  webhook_code: "PENDING_EXPIRATION";
  item_id: string;
  consent_expiration_time: string;
}

export interface ItemPermissionRevokedWebhook extends BaseWebhookPayload {
  webhook_type: "ITEM";
  webhook_code: "USER_PERMISSION_REVOKED";
  item_id: string;
}

// Transactions Webhooks
export interface TransactionsInitialUpdateWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSACTIONS";
  webhook_code: "INITIAL_UPDATE";
  item_id: string;
  new_transactions: number;
}

export interface TransactionsHistoricalUpdateWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSACTIONS";
  webhook_code: "HISTORICAL_UPDATE";
  item_id: string;
  new_transactions: number;
}

export interface TransactionsDefaultUpdateWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSACTIONS";
  webhook_code: "DEFAULT_UPDATE";
  item_id: string;
  new_transactions: number;
}

export interface TransactionsRemovedWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSACTIONS";
  webhook_code: "TRANSACTIONS_REMOVED";
  item_id: string;
  removed_transactions: string[];
}

export interface TransactionsSyncUpdatesWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSACTIONS";
  webhook_code: "SYNC_UPDATES_AVAILABLE";
  item_id: string;
  initial_update_complete: boolean;
  historical_update_complete: boolean;
}

// Auth Webhooks
export interface AuthVerifiedWebhook extends BaseWebhookPayload {
  webhook_type: "AUTH";
  webhook_code: "AUTOMATICALLY_VERIFIED" | "VERIFICATION_EXPIRED";
  item_id: string;
  account_id: string;
}

// Transfer Webhooks
export interface TransferEventsUpdateWebhook extends BaseWebhookPayload {
  webhook_type: "TRANSFER";
  webhook_code: "TRANSFER_EVENTS_UPDATE";
}

// ============================================================================
// Union Type
// ============================================================================

export type PlaidWebhookPayload =
  | ItemErrorWebhook
  | ItemNewAccountsWebhook
  | ItemPendingExpirationWebhook
  | ItemPermissionRevokedWebhook
  | TransactionsInitialUpdateWebhook
  | TransactionsHistoricalUpdateWebhook
  | TransactionsDefaultUpdateWebhook
  | TransactionsRemovedWebhook
  | TransactionsSyncUpdatesWebhook
  | AuthVerifiedWebhook
  | TransferEventsUpdateWebhook
  | BaseWebhookPayload;

// ============================================================================
// Webhook Verification
// ============================================================================

export interface PlaidWebhookVerificationConfig {
  plaidEnv: "sandbox" | "development" | "production";
}

const PLAID_WEBHOOK_KEY_IDS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com/webhook_verification_key/get",
  development: "https://development.plaid.com/webhook_verification_key/get",
  production: "https://production.plaid.com/webhook_verification_key/get",
};

// Cache for webhook verification keys
const keyCache: Map<string, { key: string; expiresAt: number }> = new Map();

/**
 * Verify Plaid webhook signature
 */
export async function verifyWebhook(
  payload: string | Buffer,
  signature: string,
  config: PlaidWebhookVerificationConfig & {
    clientId: string;
    secret: string;
  }
): Promise<{ valid: boolean; payload?: PlaidWebhookPayload }> {
  try {
    const body = typeof payload === "string" ? payload : payload.toString("utf8");

    // Decode JWT header to get key ID
    const [headerB64] = signature.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64").toString());
    const keyId = header.kid;

    if (!keyId) {
      console.error("No key ID in webhook signature");
      return { valid: false };
    }

    // Get verification key
    const verificationKey = await getWebhookVerificationKey(
      keyId,
      config.plaidEnv,
      config.clientId,
      config.secret
    );

    if (!verificationKey) {
      console.error("Failed to get verification key");
      return { valid: false };
    }

    // Verify JWT
    const decoded = jwt.verify(signature, verificationKey, {
      algorithms: ["ES256"],
    }) as { request_body_sha256: string };

    // Verify body hash
    const bodyHash = crypto
      .createHash("sha256")
      .update(body)
      .digest("hex");

    if (decoded.request_body_sha256 !== bodyHash) {
      console.error("Body hash mismatch");
      return { valid: false };
    }

    const parsedPayload = JSON.parse(body) as PlaidWebhookPayload;
    return { valid: true, payload: parsedPayload };
  } catch (error) {
    console.error("Webhook verification failed:", error);
    return { valid: false };
  }
}

/**
 * Get webhook verification key from Plaid
 */
async function getWebhookVerificationKey(
  keyId: string,
  env: "sandbox" | "development" | "production",
  clientId: string,
  secret: string
): Promise<string | null> {
  // Check cache
  const cached = keyCache.get(keyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  try {
    const url = PLAID_WEBHOOK_KEY_IDS[env].replace(
      "/get",
      "/get"
    );

    const response = await fetch(
      `https://${env}.plaid.com/webhook_verification_key/get`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          key_id: keyId,
        }),
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch verification key:", response.status);
      return null;
    }

    const data = await response.json();
    const key = data.key.alg === "ES256" ? createPublicKey(data.key) : null;

    if (key) {
      // Prune expired entries if cache grows beyond max size
      const MAX_CACHE_SIZE = 50;
      if (keyCache.size >= MAX_CACHE_SIZE) {
        const now = Date.now();
        for (const [cachedId, cached] of keyCache) {
          if (cached.expiresAt <= now) {
            keyCache.delete(cachedId);
          }
        }
        // If still too large after pruning expired, remove oldest entries
        if (keyCache.size >= MAX_CACHE_SIZE) {
          const entries = Array.from(keyCache.entries());
          entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
          for (let i = 0; i < entries.length - MAX_CACHE_SIZE + 1; i++) {
            keyCache.delete(entries[i][0]);
          }
        }
      }
      // Cache for 24 hours
      keyCache.set(keyId, {
        key,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
    }

    return key;
  } catch (error) {
    console.error("Error fetching verification key:", error);
    return null;
  }
}

/**
 * Create PEM public key from JWK
 */
function createPublicKey(jwk: {
  kty: string;
  crv: string;
  x: string;
  y: string;
}): string {
  // Convert JWK to PEM format for ES256
  const keyObject = crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    },
    format: "jwk",
  });

  return keyObject.export({ type: "spki", format: "pem" }) as string;
}

// ============================================================================
// Webhook Handler Types
// ============================================================================

export type WebhookHandler<T extends PlaidWebhookPayload = PlaidWebhookPayload> = (
  payload: T
) => Promise<void>;

export interface WebhookHandlers {
  onItemError?: WebhookHandler<ItemErrorWebhook>;
  onNewAccountsAvailable?: WebhookHandler<ItemNewAccountsWebhook>;
  onPendingExpiration?: WebhookHandler<ItemPendingExpirationWebhook>;
  onPermissionRevoked?: WebhookHandler<ItemPermissionRevokedWebhook>;
  onTransactionsInitialUpdate?: WebhookHandler<TransactionsInitialUpdateWebhook>;
  onTransactionsHistoricalUpdate?: WebhookHandler<TransactionsHistoricalUpdateWebhook>;
  onTransactionsDefaultUpdate?: WebhookHandler<TransactionsDefaultUpdateWebhook>;
  onTransactionsRemoved?: WebhookHandler<TransactionsRemovedWebhook>;
  onTransactionsSyncUpdates?: WebhookHandler<TransactionsSyncUpdatesWebhook>;
  onAuthVerified?: WebhookHandler<AuthVerifiedWebhook>;
  onTransferEventsUpdate?: WebhookHandler<TransferEventsUpdateWebhook>;
  onUnknown?: WebhookHandler<BaseWebhookPayload>;
}

/**
 * Route webhook to appropriate handler
 */
export async function handleWebhook(
  payload: PlaidWebhookPayload,
  handlers: WebhookHandlers
): Promise<void> {
  const { webhook_type, webhook_code } = payload;

  switch (webhook_type) {
    case "ITEM":
      switch (webhook_code) {
        case "ERROR":
          await handlers.onItemError?.(payload as ItemErrorWebhook);
          break;
        case "NEW_ACCOUNTS_AVAILABLE":
          await handlers.onNewAccountsAvailable?.(payload as ItemNewAccountsWebhook);
          break;
        case "PENDING_EXPIRATION":
          await handlers.onPendingExpiration?.(payload as ItemPendingExpirationWebhook);
          break;
        case "USER_PERMISSION_REVOKED":
          await handlers.onPermissionRevoked?.(payload as ItemPermissionRevokedWebhook);
          break;
        default:
          await handlers.onUnknown?.(payload);
      }
      break;

    case "TRANSACTIONS":
      switch (webhook_code) {
        case "INITIAL_UPDATE":
          await handlers.onTransactionsInitialUpdate?.(
            payload as TransactionsInitialUpdateWebhook
          );
          break;
        case "HISTORICAL_UPDATE":
          await handlers.onTransactionsHistoricalUpdate?.(
            payload as TransactionsHistoricalUpdateWebhook
          );
          break;
        case "DEFAULT_UPDATE":
          await handlers.onTransactionsDefaultUpdate?.(
            payload as TransactionsDefaultUpdateWebhook
          );
          break;
        case "TRANSACTIONS_REMOVED":
          await handlers.onTransactionsRemoved?.(payload as TransactionsRemovedWebhook);
          break;
        case "SYNC_UPDATES_AVAILABLE":
          await handlers.onTransactionsSyncUpdates?.(
            payload as TransactionsSyncUpdatesWebhook
          );
          break;
        default:
          await handlers.onUnknown?.(payload);
      }
      break;

    case "AUTH":
      await handlers.onAuthVerified?.(payload as AuthVerifiedWebhook);
      break;

    case "TRANSFER":
      await handlers.onTransferEventsUpdate?.(payload as TransferEventsUpdateWebhook);
      break;

    default:
      await handlers.onUnknown?.(payload);
  }
}
