/**
 * Health Check Routes
 *
 * Provides endpoints for monitoring and orchestration systems.
 */

import { Hono } from "hono";
import type { Env } from "../types";

const healthRouter = new Hono<Env>();

/**
 * Basic health check
 * GET /health
 */
healthRouter.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "pull-api",
    version: process.env.npm_package_version || "0.1.0",
  });
});

/**
 * Liveness probe for Kubernetes
 * GET /health/live
 */
healthRouter.get("/live", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe for Kubernetes
 * Checks that all dependencies are available
 * GET /health/ready
 */
healthRouter.get("/ready", async (c) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  let allHealthy = true;

  // Check Convex
  const convexStart = Date.now();
  try {
    const response = await fetch(`${process.env.CONVEX_URL}/version`, {
      signal: AbortSignal.timeout(5000),
    });
    checks.convex = {
      status: response.ok ? "healthy" : "unhealthy",
      latency: Date.now() - convexStart,
    };
    if (!response.ok) allHealthy = false;
  } catch (error) {
    checks.convex = {
      status: "unhealthy",
      latency: Date.now() - convexStart,
      error: String(error),
    };
    allHealthy = false;
  }

  // Check Upstash Redis
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const redisStart = Date.now();
    try {
      const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      checks.redis = {
        status: response.ok ? "healthy" : "unhealthy",
        latency: Date.now() - redisStart,
      };
      if (!response.ok) allHealthy = false;
    } catch (error) {
      checks.redis = {
        status: "unhealthy",
        latency: Date.now() - redisStart,
        error: String(error),
      };
      allHealthy = false;
    }
  }

  // Check Temporal
  if (process.env.TEMPORAL_ADDRESS) {
    const temporalStart = Date.now();
    try {
      // Simple TCP check to Temporal
      const { Connection } = await import("@temporalio/client");
      const connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS,
      });
      await connection.close();
      checks.temporal = {
        status: "healthy",
        latency: Date.now() - temporalStart,
      };
    } catch (error) {
      checks.temporal = {
        status: "unhealthy",
        latency: Date.now() - temporalStart,
        error: String(error),
      };
      allHealthy = false;
    }
  }

  const statusCode = allHealthy ? 200 : 503;

  return c.json(
    {
      status: allHealthy ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      checks,
    },
    statusCode
  );
});

/**
 * Detailed system status
 * GET /health/status
 */
healthRouter.get("/status", (c) => {
  const memoryUsage = process.memoryUsage();

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "pull-api",
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      unit: "MB",
    },
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

export { healthRouter };
