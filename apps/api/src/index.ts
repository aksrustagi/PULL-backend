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
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { trpcServer } from "@hono/trpc-server";

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
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";

// Types
export type Env = {
  Variables: {
    userId?: string;
    requestId: string;
  };
};

const app = new Hono<Env>();

// Global middleware
app.use("*", timing());
app.use("*", logger());
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
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
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

// Public routes (no auth required)
app.route("/health", healthRoutes);
app.route("/api/auth", authRoutes);

// Webhook routes (with rate limiting and their own signature-based auth)
app.use("/webhooks/*", rateLimitMiddleware);
app.route("/webhooks", webhookRoutes);
app.route("/docs", docsRoutes);

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
  console.error(`[${requestId}] Error:`, err);

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

console.log(`PULL API server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
