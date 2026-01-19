import { NativeConnection, Worker } from "@temporalio/worker";
import * as kycActivities from "./activities/kyc";
import * as tradingActivities from "./activities/trading";
import * as rewardsActivities from "./activities/rewards";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "pull-workers",
    workflowsPath: new URL("./workflows", import.meta.url).pathname,
    activities: {
      ...kycActivities,
      ...tradingActivities,
      ...rewardsActivities,
    },
  });

  console.log("🚀 Temporal worker started");
  console.log(`   Task Queue: ${process.env.TEMPORAL_TASK_QUEUE ?? "pull-workers"}`);
  console.log(`   Namespace: ${process.env.TEMPORAL_NAMESPACE ?? "default"}`);

  await worker.run();
}

run().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
