import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";

import { initSentry, captureException } from "./lib/sentry";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import {
  securityHeaders,
  csrfProtection,
  requestId,
  requestTiming,
} from "./middleware/security";
import { errorHandler } from "./middleware/error-handler";
import { sentryMiddleware } from "./middleware/sentry";
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
import { dataFlywheelRoutes } from "./routes/dataFlywheel";
import { analyticsRoutes, experimentsRoutes } from "./routes/admin";
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

// Initialize Sentry for error tracking
initSentry();

// Types
export type Env = {
  Variables: {
    userId?: string;
    requestId: string;
    sanitizedBody?: unknown;
  };
};

const app = new Hono<Env>();

// Global middleware - order matters!
// 1. Request ID first for tracking
app.use("*", requestId);

// 2. Request timing for performance monitoring
app.use("*", requestTiming);

// 3. Security headers for all responses
app.use("*", securityHeaders);

// 4. CSRF protection for state-changing requests
app.use("*", csrfProtection);

// 5. Sentry middleware for error tracking
app.use("*", sentryMiddleware);

// 6. Error handler wraps entire app
app.use("*", errorHandler);

// 7. Logging
app.use("*", logger());

// 8. CORS configuration
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "https://pull.app",
      "https://*.pull.app",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-API-Key"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Response-Time"],
    credentials: true,
    maxAge: 86400,
  })
);

// Rate limiting for non-webhook routes
app.use("/api/*", rateLimitMiddleware);

// Public routes
app.route("/health", healthRoutes);
app.route("/api/auth", authRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/docs", docsRoutes);

// Protected routes (require auth)
app.use("/api/v1/*", authMiddleware);
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

app.use("/api/admin/*", authMiddleware);
app.route("/api/admin", adminRoutes);

// tRPC endpoint
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

// Error handler
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
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : err.message,
      },
      requestId,
      timestamp: new Date().toISOString(),
    },
    status
  );
});

// Start server
const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`🚀 PULL API server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
