import { Client, Connection } from "@temporalio/client";

let client: Client | null = null;

/**
 * Get or create a singleton Temporal client
 */
export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  return client;
}

/**
 * Start an order execution workflow
 */
export async function startOrderWorkflow(
  orderId: string,
  userId: string,
  estimatedCost: number
): Promise<string> {
  const client = await getTemporalClient();
  const handle = await client.workflow.start("orderExecutionWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "pull-tasks",
    workflowId: `order-${orderId}`,
    args: [{ orderId, userId, estimatedCost }],
  });
  return handle.workflowId;
}

/**
 * Start a KYC onboarding workflow
 */
export async function startKYCWorkflow(userId: string): Promise<string> {
  const client = await getTemporalClient();
  const handle = await client.workflow.start("kycOnboardingWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "pull-tasks",
    workflowId: `kyc-${userId}`,
    args: [{ userId }],
  });
  return handle.workflowId;
}

/**
 * Start a withdrawal processing workflow
 */
export async function startWithdrawalWorkflow(
  withdrawalId: string,
  userId: string,
  amount: number,
  destination: string
): Promise<string> {
  const client = await getTemporalClient();
  const handle = await client.workflow.start("withdrawalWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "pull-tasks",
    workflowId: `withdrawal-${withdrawalId}`,
    args: [{ withdrawalId, userId, amount, destination }],
  });
  return handle.workflowId;
}

/**
 * Start an RWA purchase workflow
 */
export async function startRWAPurchaseWorkflow(
  purchaseId: string,
  userId: string,
  assetId: string,
  quantity: number
): Promise<string> {
  const client = await getTemporalClient();
  const handle = await client.workflow.start("rwaPurchaseWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "pull-tasks",
    workflowId: `rwa-purchase-${purchaseId}`,
    args: [{ purchaseId, userId, assetId, quantity }],
  });
  return handle.workflowId;
}

/**
 * Get the status of a workflow by ID
 */
export async function getWorkflowStatus(workflowId: string): Promise<{
  status: string;
  runId: string | undefined;
}> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);
  const description = await handle.describe();
  return {
    status: description.status.name,
    runId: description.runId,
  };
}

/**
 * Cancel a workflow by ID
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);
  await handle.cancel();
}
