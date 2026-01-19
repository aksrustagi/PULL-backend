/**
 * PULL API Server
 *
 * Main entry point for the Hono-based API server.
 * Handles routing, middleware, and integrations.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { trpcServer } from "@hono/trpc-server";

// Middleware
import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rate-limit";
import { kycGate } from "./middleware/kyc-gate";
import { auditLogger } from "./middleware/audit";

// Routes
import { authRouter } from "./routes/auth";
import { tradingRouter } from "./routes/trading";
import { predictionsRouter } from "./routes/predictions";
import { rwaRouter } from "./routes/rwa";
import { rewardsRouter } from "./routes/rewards";
import { emailRouter } from "./routes/email";
import { matrixRouter } from "./routes/matrix";
import { webhooksRouter } from "./routes/webhooks";
import { healthRouter } from "./routes/health";

// tRPC
import { appRouter, createContext } from "./trpc";

// Types
import type { Env } from "./types";

// =============================================================================
// APP INITIALIZATION
// =============================================================================

const app = new Hono<Env>();

// =============================================================================
// GLOBAL MIDDLEWARE
// =============================================================================

// Request logging
app.use("*", logger());

// Request timing
app.use("*", timing());

// Security headers
app.use("*", secureHeaders());

// CORS configuration
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        "https://pull.app",
        "https://www.pull.app",
        "https://app.pull.app",
        "http://localhost:3000",
        "http://localhost:3001",
      ];
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
    maxAge: 86400,
  })
);

// Global rate limiting
app.use(
  "*",
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for")?.split(",")[0] ||
      c.req.header("cf-connecting-ip") ||
      "anonymous",
  })
);

// Request ID
app.use("*", async (c, next) => {
  const requestId =
    c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);
  await next();
});

// =============================================================================
// PUBLIC ROUTES
// =============================================================================

// Health checks (no auth required)
app.route("/health", healthRouter);

// Authentication routes (partial auth)
app.route("/auth", authRouter);

// Webhooks (verified by signature)
app.route("/webhooks", webhooksRouter);

// =============================================================================
// PROTECTED ROUTES
// =============================================================================

// Create protected app with auth middleware
const protectedApp = new Hono<Env>();

// Authentication middleware
protectedApp.use("*", authMiddleware);

// Audit logging
protectedApp.use("*", auditLogger);

// Trading routes (requires KYC)
protectedApp.use("/trading/*", kycGate({ minTier: "basic" }));
protectedApp.route("/trading", tradingRouter);

// Predictions routes (requires KYC)
protectedApp.use("/predictions/*", kycGate({ minTier: "basic" }));
protectedApp.route("/predictions", predictionsRouter);

// RWA routes (requires enhanced KYC)
protectedApp.use("/rwa/*", kycGate({ minTier: "enhanced" }));
protectedApp.route("/rwa", rwaRouter);

// Rewards routes
protectedApp.route("/rewards", rewardsRouter);

// Email routes
protectedApp.route("/email", emailRouter);

// Matrix messaging routes
protectedApp.route("/matrix", matrixRouter);

// Mount protected routes under /api
app.route("/api", protectedApp);

// =============================================================================
// tRPC ROUTER
// =============================================================================

app.use(
  "/trpc/*",
  authMiddleware,
  trpcServer({
    router: appRouter,
    createContext,
  })
);

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.onError((err, c) => {
  console.error(`[${c.get("requestId")}] Error:`, err);

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction ? "Internal Server Error" : err.message;
  const stack = isProduction ? undefined : err.stack;

  return c.json(
    {
      error: {
        message,
        code: "INTERNAL_ERROR",
        requestId: c.get("requestId"),
        ...(stack && { stack }),
      },
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        message: "Not Found",
        code: "NOT_FOUND",
        requestId: c.get("requestId"),
      },
    },
    404
  );
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗ ██╗   ██╗██╗     ██╗                               ║
║   ██╔══██╗██║   ██║██║     ██║                               ║
║   ██████╔╝██║   ██║██║     ██║                               ║
║   ██╔═══╝ ██║   ██║██║     ██║                               ║
║   ██║     ╚██████╔╝███████╗███████╗                          ║
║   ╚═╝      ╚═════╝ ╚══════╝╚══════╝                          ║
║                                                               ║
║   PULL Super App API Server                                   ║
║   Environment: ${process.env.NODE_ENV || "development"}                                  ║
║   Port: ${port}                                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};

// Named export for Hono
export { app };
