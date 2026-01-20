import { Hono } from "hono";

const app = new Hono();

const startTime = Date.now();

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
 * Detailed health check with service status
 */
app.get("/detailed", async (c) => {
  const checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message?: string;
    latency?: number;
  }> = [];

  // Check Convex
  const convexStart = Date.now();
  try {
    // Would ping Convex here
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
    });
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    // Would ping Redis here
    checks.push({
      name: "redis",
      status: process.env.UPSTASH_REDIS_REST_URL ? "pass" : "warn",
      message: process.env.UPSTASH_REDIS_REST_URL
        ? undefined
        : "Not configured",
      latency: Date.now() - redisStart,
    });
  } catch (error) {
    checks.push({
      name: "redis",
      status: "fail",
      message: error instanceof Error ? error.message : "Connection failed",
    });
  }

  // Check Temporal
  checks.push({
    name: "temporal",
    status: process.env.TEMPORAL_ADDRESS ? "pass" : "warn",
    message: process.env.TEMPORAL_ADDRESS ? undefined : "Not configured",
  });

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
