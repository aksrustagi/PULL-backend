import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { trpcServer } from "@hono/trpc-server";

import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { tradingRoutes } from "./routes/trading";
import { predictionsRoutes } from "./routes/predictions";
import { rwaRoutes } from "./routes/rwa";
import { rewardsRoutes } from "./routes/rewards";
import { webhookRoutes } from "./routes/webhooks";
import { analyticsRoutes, experimentsRoutes } from "./routes/admin";
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
    origin: [
      "http://localhost:3000",
      "https://pull.app",
      "https://*.pull.app",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    credentials: true,
    maxAge: 86400,
  })
);

// Request ID middleware
app.use("*", async (c, next) => {
  const requestId =
    c.req.header("X-Request-ID") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);
  await next();
});

// Rate limiting for non-webhook routes
app.use("/api/*", rateLimitMiddleware);

// Public routes
app.route("/health", healthRoutes);
app.route("/api/auth", authRoutes);
app.route("/webhooks", webhookRoutes);

// Protected routes (require auth)
app.use("/api/v1/*", authMiddleware);
app.route("/api/v1/trading", tradingRoutes);
app.route("/api/v1/predictions", predictionsRoutes);
app.route("/api/v1/rwa", rwaRoutes);
app.route("/api/v1/rewards", rewardsRoutes);

// Admin routes (require auth + admin role)
// TODO: Add admin role check middleware
app.route("/admin/analytics", analyticsRoutes);
app.route("/admin/experiments", experimentsRoutes);

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
  console.error(`[${c.get("requestId")}] Error:`, err);

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
      requestId: c.get("requestId"),
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
