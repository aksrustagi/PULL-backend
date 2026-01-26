import { Hono } from "hono";
import { convex, api } from "../lib/convex";
import { redis } from "../lib/redis";
import { Connection } from "@temporalio/client";

const app = new Hono();

const startTime = Date.now();

// Helper to create a timeout promise
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Basic health check
 */
app.get("/", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Detailed health check with service status (requires internal/admin auth)
 * Returns infrastructure details - not publicly accessible
 */
app.get("/detailed", async (c) => {
  // Only allow internal requests (check for internal API key)
  const internalKey = c.req.header("X-Internal-Key");
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return c.json({ status: "healthy", timestamp: new Date().toISOString() });
  }

  const checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message?: string;
    latency?: number;
  }> = [];

  // Check Convex - actually ping the database
  const convexStart = Date.now();
  try {
    await withTimeout(
      convex.query(api.admin.getDashboardStats, {}),
      3000,
      "Convex health check timed out after 3000ms"
    );
    checks.push({
      name: "convex",
      status: "pass",
      latency: Date.now() - convexStart,
    });
  } catch (error) {
    checks.push({
      name: "convex",
      status: "fail",
      message: error instanceof Error ? error.message : "Connection failed",
      latency: Date.now() - convexStart,
    });
  }

  // Check Redis - actually ping the Redis server
  const redisStart = Date.now();
  try {
    if (!redis) {
      checks.push({
        name: "redis",
        status: "warn",
        message: "Redis not configured",
        latency: Date.now() - redisStart,
      });
    } else {
      const pingResult = await withTimeout(
        redis.ping(),
        2000,
        "Redis health check timed out after 2000ms"
      );
      checks.push({
        name: "redis",
        status: pingResult === "PONG" ? "pass" : "warn",
        message: pingResult === "PONG" ? undefined : `Unexpected response: ${pingResult}`,
        latency: Date.now() - redisStart,
      });
    }
  } catch (error) {
    checks.push({
      name: "redis",
      status: "fail",
      message: error instanceof Error ? error.message : "Connection failed",
      latency: Date.now() - redisStart,
    });
  }

  // Check Temporal - actually connect to Temporal server
  const temporalStart = Date.now();
  try {
    const temporalAddress = process.env.TEMPORAL_ADDRESS;
    if (!temporalAddress) {
      checks.push({
        name: "temporal",
        status: "warn",
        message: "Temporal not configured",
        latency: Date.now() - temporalStart,
      });
    } else {
      const connection = await withTimeout(
        Connection.connect({ address: temporalAddress }),
        3000,
        "Temporal health check timed out after 3000ms"
      );
      // Close the connection after checking
      await connection.close();
      checks.push({
        name: "temporal",
        status: "pass",
        latency: Date.now() - temporalStart,
      });
    }
  } catch (error) {
    checks.push({
      name: "temporal",
      status: "fail",
      message: error instanceof Error ? error.message : "Connection failed",
      latency: Date.now() - temporalStart,
    });
  }

  const overallStatus = checks.every((c) => c.status === "pass")
    ? "healthy"
    : checks.some((c) => c.status === "fail")
      ? "unhealthy"
      : "degraded";

  return c.json({
    status: overallStatus,
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  });
});

/**
 * Readiness probe (for Kubernetes)
 */
app.get("/ready", (c) => {
  return c.json({
    ready: true,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Liveness probe (for Kubernetes)
 */
app.get("/live", (c) => {
  return c.json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export { app as healthRoutes };
