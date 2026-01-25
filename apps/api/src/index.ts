// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "CONVEX_URL",
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `FATAL: Missing required environment variables: ${missing.join(", ")}. ` +
    "Check your .env file or deployment configuration."
  );
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { trpcServer } from "@hono/trpc-server";

// Observability imports
import {
  initLogger,
  getLogger,
  createLoggingMiddleware,
  createLoggerContextMiddleware,
  initTracerProvider,
  createTracingMiddleware,
  createMetricsMiddleware,
  createMetricsHandler,
  startUptimeUpdates,
  getRegistry,
} from "@pull/core/services";

// Initialize logger first
const log = initLogger({
  serviceName: "pull-api",
  environment: process.env.NODE_ENV || "development",
  version: process.env.APP_VERSION || "0.0.0",
  level: (process.env.LOG_LEVEL as any) || (process.env.NODE_ENV === "development" ? "debug" : "info"),
});

// Initialize tracer
initTracerProvider({
  serviceName: "pull-api",
  serviceVersion: process.env.APP_VERSION || "0.0.0",
  environment: process.env.NODE_ENV || "development",
  otlpEndpoint: process.env.OTLP_ENDPOINT,
  consoleExport: process.env.NODE_ENV === "development",
});

// Start uptime metrics updates
const stopUptime = startUptimeUpdates();

import { initSentry, captureException } from "./lib/sentry";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { tradingRoutes } from "./routes/trading";
import { predictionsRoutes } from "./routes/predictions";
import { realEstateRoutes } from "./routes/realEstate";
import { rwaRoutes } from "./routes/rwa";
import { rewardsRoutes } from "./routes/rewards";
import { signalsRoutes } from "./routes/signals";
import { socialRoutes } from "./routes/social";
import { kycRoutes } from "./routes/kyc";
import { gamificationRoutes } from "./routes/gamification";
import { webhookRoutes } from "./routes/webhooks";
import { fantasyRoutes } from "./routes/fantasy";
import { paymentsRoutes } from "./routes/payments";
import { sseRoutes } from "./routes/sse";
import { initWebSocketServer } from "./websocket";
import { dataFlywheelRoutes } from "./routes/dataFlywheel";
import { analyticsRoutes, experimentsRoutes, backupRoutes } from "./routes/admin";
import { adminRoutes } from "./routes/admin";
import { portfolioAgentRoutes } from "./routes/portfolio-agent";
import { docsRoutes } from "./routes/docs";
import { aiInsightsRoutes } from "./routes/ai-insights";
import { ncaaRoutes } from "./routes/ncaa";
import { golfRoutes } from "./routes/golf";
import { nbaRoutes } from "./routes/nba";
import { mlbRoutes } from "./routes/mlb";
import { viralGrowthRoutes } from "./routes/viral-growth";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";

// Types
export type Env = {
  Variables: {
    userId?: string;
    requestId: string;
    logger: ReturnType<typeof getLogger>;
  };
};

const app = new Hono<Env>();

// Global middleware - observability first
app.use("*", timing());

// Add tracing middleware (creates spans for each request)
app.use("*", createTracingMiddleware());

// Add metrics middleware (tracks request counts, latency, etc.)
app.use("*", createMetricsMiddleware({
  excludePaths: ["/health", "/metrics"],
  includePathLabel: true,
}));

// Add structured logging middleware
app.use("*", createLoggingMiddleware({
  skipHealthChecks: true,
  getUserId: (c) => c.get("userId"),
  getRequestId: (c) => c.get("requestId"),
}));

// Add logger to context
app.use("*", createLoggerContextMiddleware());

app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:3000",
        "https://pull.app",
      ];
      if (allowed.includes(origin)) return origin;
      // Match subdomains of pull.app
      if (/^https:\/\/[\w-]+\.pull\.app$/.test(origin)) return origin;
      return undefined;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Correlation-ID"],
    exposeHeaders: ["X-Request-ID", "X-Correlation-ID", "X-Trace-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    credentials: true,
    maxAge: 86400,
  })
);

// Request ID middleware - always generate server-side for security
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);
  await next();
});

// Body size limit (1MB max) to prevent DoS
app.use("*", async (c, next) => {
  const contentLength = c.req.header("Content-Length");
  if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
    const logger = getLogger();
    logger.warn("Request body too large", {
      requestId: c.get("requestId"),
      contentLength: parseInt(contentLength, 10),
      path: c.req.path,
    });
    return c.json(
      {
        success: false,
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large (max 1MB)" },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      413
    );
  }
  await next();
});

// Metrics endpoint (before auth)
app.get("/metrics", createMetricsHandler(getRegistry()));

// Public routes (no auth required)
app.route("/health", healthRoutes);
app.route("/api/auth", authRoutes);

// Webhook routes (with rate limiting and their own signature-based auth)
app.use("/webhooks/*", rateLimitMiddleware);
app.route("/webhooks", webhookRoutes);
app.route("/docs", docsRoutes);

// Server-Sent Events (SSE) for real-time data (public access with optional auth)
app.route("/sse", sseRoutes);

// Protected routes - auth first, then rate limit (so userId is available)
app.use("/api/v1/*", authMiddleware);
app.use("/api/v1/*", rateLimitMiddleware);
app.route("/api/v1/trading", tradingRoutes);
app.route("/api/v1/predictions", predictionsRoutes);
app.route("/api/v1/real-estate", realEstateRoutes);
app.route("/api/v1/rwa", rwaRoutes);
app.route("/api/v1/rewards", rewardsRoutes);
app.route("/api/v1/fantasy", fantasyRoutes);
app.route("/api/v1/signals", signalsRoutes);
app.route("/api/v1/data", dataFlywheelRoutes);
app.route("/api/v1/social", socialRoutes);
app.route("/api/v1/kyc", kycRoutes);
app.route("/api/v1/portfolio-agent", portfolioAgentRoutes);
app.route("/api/v1/gamification", gamificationRoutes);
app.route("/api/v1/payments", paymentsRoutes);

// AI Insights & Sports routes
app.route("/api/v1/ai-insights", aiInsightsRoutes);
app.route("/api/v1/ncaa", ncaaRoutes);
app.route("/api/v1/golf", golfRoutes);
app.route("/api/v1/nba", nbaRoutes);
app.route("/api/v1/mlb", mlbRoutes);

// Viral Growth Engine routes
app.route("/api/v1/viral", viralGrowthRoutes);

// Admin routes (require auth + admin role)
// TODO: Add admin role check middleware
app.use("/admin/*", authMiddleware);
app.route("/admin/analytics", analyticsRoutes);
app.route("/admin/experiments", experimentsRoutes);
app.route("/admin/backup", backupRoutes);

app.use("/api/admin/*", authMiddleware);
app.route("/api/admin", adminRoutes);

// tRPC endpoint (uses its own auth via context)
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  })
);

// 404 handler
app.notFound((c) => {
  const logger = getLogger();
  logger.debug("Resource not found", {
    requestId: c.get("requestId"),
    path: c.req.path,
    method: c.req.method,
  });
  return c.json(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found",
      },
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
    404
  );
});

// Error handler - never leak internal details
app.onError((err, c) => {
  const requestId = c.get("requestId");
  const logger = getLogger();

  // Log error with full details
  logger.error("Unhandled request error", {
    requestId,
    path: c.req.path,
    method: c.req.method,
    userId: c.get("userId"),
    error: err,
  });

  // Capture error with Sentry
  captureException(err, {
    requestId,
    path: c.req.path,
    method: c.req.method,
  });

  const status = "status" in err ? (err.status as number) : 500;

  return c.json(
    {
      success: false,
      error: {
        code: status === 500 ? "INTERNAL_SERVER_ERROR" : "ERROR",
        message: "An unexpected error occurred",
      },
      requestId,
      timestamp: new Date().toISOString(),
    },
    status
  );
});

// Start server
const port = parseInt(process.env.PORT ?? "3001", 10);
const wsPort = parseInt(process.env.WS_PORT ?? "3002", 10);

// Initialize WebSocket server
const wsServer = initWebSocketServer({
  port: wsPort,
  path: "/ws",
  redisUrl: process.env.REDIS_URL,
  redisToken: process.env.REDIS_TOKEN,
});

// Start WebSocket server components
wsServer.start().catch((err) => {
  log.error("Failed to start WebSocket server", { error: err });
});

log.info("PULL API server starting", {
  port,
  wsPort,
  environment: process.env.NODE_ENV || "development",
  version: process.env.APP_VERSION || "0.0.0",
});

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  log.info("Received SIGTERM, initiating graceful shutdown");
  stopUptime();
  await wsServer.stop();
  // Allow time for final metrics/traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("Received SIGINT, initiating graceful shutdown");
  stopUptime();
  await wsServer.stop();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
  websocket: wsServer.getHandler(),
};
