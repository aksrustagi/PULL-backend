/**
 * Temporal Client Singleton
 * Provides a shared client for starting and managing workflows
 */

import { Client, Connection, WorkflowHandle } from "@temporalio/client";
import { TASK_QUEUES } from "./index";

let client: Client | null = null;
let connection: Connection | null = null;

/**
 * Get or create the Temporal client singleton
 */
export async function getTemporalClient(): Promise<Client> {
  if (client) {
    return client;
  }

  connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    tls: process.env.TEMPORAL_TLS === "true"
      ? {
          clientCertPair: {
            crt: Buffer.from(process.env.TEMPORAL_TLS_CERT ?? "", "base64"),
            key: Buffer.from(process.env.TEMPORAL_TLS_KEY ?? "", "base64"),
          },
        }
      : undefined,
  });

  client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });

  return client;
}

/**
 * Close the Temporal client connection
 */
export async function closeTemporalClient(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
    client = null;
  }
}

// Workflow type definitions
export interface WorkflowOptions {
  workflowId: string;
  taskQueue?: string;
  workflowExecutionTimeout?: string;
  workflowRunTimeout?: string;
  workflowTaskTimeout?: string;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
  retry?: {
    maximumAttempts?: number;
    initialInterval?: string;
    maximumInterval?: string;
    backoffCoefficient?: number;
  };
}

// ============================================================================
// KYC Workflow Helpers
// ============================================================================

export interface AccountCreationInput {
  email: string;
  referralCode?: string;
  walletAddress?: string;
}

export async function startAccountCreationWorkflow(
  input: AccountCreationInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `account-creation-${crypto.randomUUID()}`;

  return client.workflow.start("accountCreationWorkflow", {
    taskQueue: TASK_QUEUES.KYC,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "30 days",
    ...options,
  });
}

export interface KYCUpgradeInput {
  userId: string;
  targetTier: "enhanced" | "accredited";
  documents?: string[];
}

export async function startKYCUpgradeWorkflow(
  input: KYCUpgradeInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `kyc-upgrade-${input.userId}-${Date.now()}`;

  return client.workflow.start("kycUpgradeWorkflow", {
    taskQueue: TASK_QUEUES.KYC,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "30 days",
    ...options,
  });
}

export async function startPeriodicReKYCWorkflow(
  userId: string,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `periodic-rekyc-${userId}`;

  return client.workflow.start("periodicReKYCWorkflow", {
    taskQueue: TASK_QUEUES.KYC,
    workflowId,
    args: [{ userId }],
    workflowExecutionTimeout: "365 days",
    cronSchedule: "0 0 * * *", // Daily at midnight
    ...options,
  });
}

// ============================================================================
// Trading Workflow Helpers
// ============================================================================

export interface OrderExecutionInput {
  userId: string;
  assetType: "prediction" | "rwa" | "crypto";
  assetId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
}

export async function startOrderExecutionWorkflow(
  input: OrderExecutionInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `order-${crypto.randomUUID()}`;

  return client.workflow.start("orderExecutionWorkflow", {
    taskQueue: TASK_QUEUES.TRADING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "24 hours",
    ...options,
  });
}

export interface SettlementInput {
  eventId: string;
  outcome: string;
  settlementTime: string;
}

export async function startSettlementWorkflow(
  input: SettlementInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `settlement-${input.eventId}`;

  return client.workflow.start("settlementWorkflow", {
    taskQueue: TASK_QUEUES.TRADING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 hour",
    ...options,
  });
}

export interface DepositInput {
  userId: string;
  amount: number;
  plaidAccessToken: string;
  accountId: string;
}

export async function startDepositWorkflow(
  input: DepositInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `deposit-${crypto.randomUUID()}`;

  return client.workflow.start("depositWorkflow", {
    taskQueue: TASK_QUEUES.TRADING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "7 days",
    ...options,
  });
}

export interface WithdrawalInput {
  userId: string;
  amount: number;
  destinationAccountId: string;
}

export async function startWithdrawalWorkflow(
  input: WithdrawalInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `withdrawal-${crypto.randomUUID()}`;

  return client.workflow.start("withdrawalWorkflow", {
    taskQueue: TASK_QUEUES.TRADING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "7 days",
    ...options,
  });
}

// ============================================================================
// RWA Workflow Helpers
// ============================================================================

export interface AssetListingInput {
  sellerId: string;
  assetType: "pokemon_card" | "sports_card" | "collectible";
  assetDetails: {
    name: string;
    grade: string;
    gradingCompany: "PSA" | "BGS" | "CGC";
    certNumber: string;
    images: string[];
  };
  totalShares: number;
  pricePerShare: number;
}

export async function startAssetListingWorkflow(
  input: AssetListingInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `asset-listing-${crypto.randomUUID()}`;

  return client.workflow.start("assetListingWorkflow", {
    taskQueue: TASK_QUEUES.RWA,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "30 days",
    ...options,
  });
}

export interface RWAPurchaseInput {
  listingId: string;
  buyerId: string;
  shares: number;
}

export async function startRWAPurchaseWorkflow(
  input: RWAPurchaseInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `rwa-purchase-${crypto.randomUUID()}`;

  return client.workflow.start("rwaPurchaseWorkflow", {
    taskQueue: TASK_QUEUES.RWA,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 hour",
    ...options,
  });
}

export async function startPriceUpdateWorkflow(
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? "rwa-price-update-scheduled";

  return client.workflow.start("priceUpdateWorkflow", {
    taskQueue: TASK_QUEUES.RWA,
    workflowId,
    args: [],
    workflowExecutionTimeout: "1 hour",
    cronSchedule: "0 */6 * * *", // Every 6 hours
    ...options,
  });
}

// ============================================================================
// Rewards Workflow Helpers
// ============================================================================

export interface EarnPointsInput {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function startEarnPointsWorkflow(
  input: EarnPointsInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `earn-points-${crypto.randomUUID()}`;

  return client.workflow.start("earnPointsWorkflow", {
    taskQueue: TASK_QUEUES.REWARDS,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "5 minutes",
    ...options,
  });
}

export interface RedeemPointsInput {
  userId: string;
  rewardId: string;
  pointsCost: number;
  redemptionType: "sweepstakes" | "prize" | "token" | "fee_discount";
}

export async function startRedeemPointsWorkflow(
  input: RedeemPointsInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `redeem-points-${crypto.randomUUID()}`;

  return client.workflow.start("redeemPointsWorkflow", {
    taskQueue: TASK_QUEUES.REWARDS,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 hour",
    ...options,
  });
}

export interface TokenConversionInput {
  userId: string;
  pointsAmount: number;
  walletAddress: string;
}

export async function startTokenConversionWorkflow(
  input: TokenConversionInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `token-conversion-${crypto.randomUUID()}`;

  return client.workflow.start("tokenConversionWorkflow", {
    taskQueue: TASK_QUEUES.REWARDS,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 hour",
    ...options,
  });
}

// ============================================================================
// Email Workflow Helpers
// ============================================================================

export interface EmailSyncInput {
  userId: string;
  grantId: string;
  syncCursor?: string;
}

export async function startEmailSyncWorkflow(
  input: EmailSyncInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `email-sync-${input.userId}`;

  return client.workflow.start("emailSyncWorkflow", {
    taskQueue: TASK_QUEUES.EMAIL,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 hour",
    ...options,
  });
}

export interface EmailTriageInput {
  emailId: string;
  emailContent: {
    subject: string;
    body: string;
    from: string;
    to: string[];
    receivedAt: string;
  };
}

export async function startEmailTriageWorkflow(
  input: EmailTriageInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `email-triage-${input.emailId}`;

  return client.workflow.start("emailTriageWorkflow", {
    taskQueue: TASK_QUEUES.EMAIL,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "5 minutes",
    ...options,
  });
}

export interface SmartReplyInput {
  threadId: string;
  userId: string;
}

export async function startSmartReplyWorkflow(
  input: SmartReplyInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `smart-reply-${input.threadId}`;

  return client.workflow.start("smartReplyWorkflow", {
    taskQueue: TASK_QUEUES.EMAIL,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "2 minutes",
    ...options,
  });
}

// ============================================================================
// Messaging Workflow Helpers
// ============================================================================

export interface RoomCreationInput {
  creatorId: string;
  roomName: string;
  roomType: "dm" | "group" | "channel";
  invitees: string[];
  settings?: {
    encrypted?: boolean;
    historyVisibility?: "shared" | "invited" | "joined";
  };
}

export async function startRoomCreationWorkflow(
  input: RoomCreationInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `room-creation-${crypto.randomUUID()}`;

  return client.workflow.start("roomCreationWorkflow", {
    taskQueue: TASK_QUEUES.MESSAGING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "5 minutes",
    ...options,
  });
}

export interface BridgeMessageInput {
  roomId: string;
  senderId: string;
  messageContent: string;
  messageType: "text" | "command" | "trade";
}

export async function startBridgeMessageWorkflow(
  input: BridgeMessageInput,
  options?: Partial<WorkflowOptions>
): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? `bridge-message-${crypto.randomUUID()}`;

  return client.workflow.start("bridgeMessageWorkflow", {
    taskQueue: TASK_QUEUES.MESSAGING,
    workflowId,
    args: [input],
    workflowExecutionTimeout: "1 minute",
    ...options,
  });
}

// ============================================================================
// Workflow Management Helpers
// ============================================================================

/**
 * Get a workflow handle by ID
 */
export async function getWorkflowHandle(workflowId: string): Promise<WorkflowHandle> {
  const client = await getTemporalClient();
  return client.workflow.getHandle(workflowId);
}

/**
 * Signal a workflow
 */
export async function signalWorkflow(
  workflowId: string,
  signalName: string,
  ...args: unknown[]
): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.signal(signalName, ...args);
}

/**
 * Query a workflow
 */
export async function queryWorkflow<T>(
  workflowId: string,
  queryName: string,
  ...args: unknown[]
): Promise<T> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.query<T>(queryName, ...args);
}

/**
 * Cancel a workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.cancel();
}

/**
 * Terminate a workflow
 */
export async function terminateWorkflow(
  workflowId: string,
  reason?: string
): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.terminate(reason);
}

/**
 * Get workflow result
 */
export async function getWorkflowResult<T>(workflowId: string): Promise<T> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.result() as Promise<T>;
}
