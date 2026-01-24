/**
 * PULL Temporal Worker
 * Handles all background workflow execution for the platform
 */

import { NativeConnection, Worker, Runtime } from "@temporalio/worker";
import { initSentry, captureException } from "./lib/sentry";
import * as kycActivities from "./activities/kyc";
import * as tradingActivities from "./activities/trading";
import * as rewardsActivities from "./activities/rewards";
import * as emailActivities from "./activities/email";
import * as messagingActivities from "./activities/messaging";
import * as rwaActivities from "./activities/rwa";
import * as portfolioActivities from "./activities/portfolio";

// Initialize Sentry for error tracking
initSentry();

// Configure runtime telemetry
Runtime.install({
  telemetryOptions: {
    metrics: {
      prometheus: {
        bindAddress: process.env.PROMETHEUS_BIND_ADDRESS ?? "0.0.0.0:9464",
      },
    },
  },
});

// Task queues for different workflow types
export const TASK_QUEUES = {
  MAIN: "pull-main",
  KYC: "pull-kyc",
  TRADING: "pull-trading",
  RWA: "pull-rwa",
  REWARDS: "pull-rewards",
  EMAIL: "pull-email",
  MESSAGING: "pull-messaging",
  PORTFOLIO: "pull-portfolio",
} as const;

interface WorkerConfig {
  taskQueue: string;
  workflowsPath: string;
  activities: Record<string, unknown>;
  maxConcurrentActivityTaskExecutions?: number;
  maxConcurrentWorkflowTaskExecutions?: number;
}

async function createWorker(
  connection: NativeConnection,
  config: WorkerConfig
): Promise<Worker> {
  return Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: config.taskQueue,
    workflowsPath: config.workflowsPath,
    activities: config.activities,
    maxConcurrentActivityTaskExecutions:
      config.maxConcurrentActivityTaskExecutions ?? 100,
    maxConcurrentWorkflowTaskExecutions:
      config.maxConcurrentWorkflowTaskExecutions ?? 100,
    // Sticky execution settings for better performance
    stickyQueueScheduleToStartTimeout: "10s",
    // Activity heartbeat settings
    maxHeartbeatThrottleInterval: "60s",
    defaultHeartbeatThrottleInterval: "30s",
  });
}

async function run() {
  console.log("🔄 Connecting to Temporal server...");

  const connection = await NativeConnection.connect({
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

  console.log("✅ Connected to Temporal server");

  // Combine all activities
  const allActivities = {
    ...kycActivities,
    ...tradingActivities,
    ...rewardsActivities,
    ...emailActivities,
    ...messagingActivities,
    ...rwaActivities,
    ...portfolioActivities,
  };

  // Create workers based on environment configuration
  const workers: Worker[] = [];
  const workflowsPath = new URL("./workflows", import.meta.url).pathname;

  // Determine which workers to run based on WORKER_TYPE env var
  const workerType = process.env.WORKER_TYPE ?? "all";

  if (workerType === "all" || workerType === "main") {
    const mainWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.MAIN,
      workflowsPath,
      activities: allActivities,
      maxConcurrentActivityTaskExecutions: 200,
    });
    workers.push(mainWorker);
    console.log(`📋 Main worker registered on queue: ${TASK_QUEUES.MAIN}`);
  }

  if (workerType === "all" || workerType === "kyc") {
    const kycWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.KYC,
      workflowsPath,
      activities: { ...kycActivities },
      maxConcurrentActivityTaskExecutions: 50,
    });
    workers.push(kycWorker);
    console.log(`📋 KYC worker registered on queue: ${TASK_QUEUES.KYC}`);
  }

  if (workerType === "all" || workerType === "trading") {
    const tradingWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.TRADING,
      workflowsPath,
      activities: { ...tradingActivities },
      maxConcurrentActivityTaskExecutions: 150,
    });
    workers.push(tradingWorker);
    console.log(`📋 Trading worker registered on queue: ${TASK_QUEUES.TRADING}`);
  }

  if (workerType === "all" || workerType === "rwa") {
    const rwaWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.RWA,
      workflowsPath,
      activities: { ...rwaActivities },
      maxConcurrentActivityTaskExecutions: 50,
    });
    workers.push(rwaWorker);
    console.log(`📋 RWA worker registered on queue: ${TASK_QUEUES.RWA}`);
  }

  if (workerType === "all" || workerType === "rewards") {
    const rewardsWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.REWARDS,
      workflowsPath,
      activities: { ...rewardsActivities },
      maxConcurrentActivityTaskExecutions: 100,
    });
    workers.push(rewardsWorker);
    console.log(`📋 Rewards worker registered on queue: ${TASK_QUEUES.REWARDS}`);
  }

  if (workerType === "all" || workerType === "email") {
    const emailWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.EMAIL,
      workflowsPath,
      activities: { ...emailActivities },
      maxConcurrentActivityTaskExecutions: 50,
    });
    workers.push(emailWorker);
    console.log(`📋 Email worker registered on queue: ${TASK_QUEUES.EMAIL}`);
  }

  if (workerType === "all" || workerType === "messaging") {
    const messagingWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.MESSAGING,
      workflowsPath,
      activities: { ...messagingActivities },
      maxConcurrentActivityTaskExecutions: 50,
    });
    workers.push(messagingWorker);
    console.log(`📋 Messaging worker registered on queue: ${TASK_QUEUES.MESSAGING}`);
  }

  if (workerType === "all" || workerType === "portfolio") {
    const portfolioWorker = await createWorker(connection, {
      taskQueue: TASK_QUEUES.PORTFOLIO,
      workflowsPath,
      activities: { ...portfolioActivities },
      maxConcurrentActivityTaskExecutions: 100,
    });
    workers.push(portfolioWorker);
    console.log(`📋 Portfolio worker registered on queue: ${TASK_QUEUES.PORTFOLIO}`);
  }

  if (workers.length === 0) {
    throw new Error(`Invalid WORKER_TYPE: ${workerType}`);
  }

  console.log("");
  console.log("🚀 PULL Temporal Workers Started");
  console.log(`   Namespace: ${process.env.TEMPORAL_NAMESPACE ?? "default"}`);
  console.log(`   Workers: ${workers.length}`);
  console.log("");

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log("\n⏹️  Shutting down workers...");
    await Promise.all(workers.map((w) => w.shutdown()));
    await connection.close();
    console.log("✅ Workers shut down gracefully");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run all workers concurrently
  await Promise.all(workers.map((w) => w.run()));
}

run().catch((err) => {
  console.error("Worker failed:", err);
  captureException(err, { context: "worker-startup" });
  process.exit(1);
});
