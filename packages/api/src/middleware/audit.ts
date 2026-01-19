/**
 * Audit Logging Middleware
 *
 * Records all API requests for compliance and debugging.
 * Logs are stored in Convex and can be exported for compliance.
 */

import { createMiddleware } from "hono/factory";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env } from "../types";

let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// Routes that should always be logged (even if not authenticated)
const ALWAYS_LOG_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/verify",
  "/trading/",
  "/predictions/",
  "/rwa/",
  "/rewards/redeem",
];

// Routes that should never be logged (health checks, etc.)
const NEVER_LOG_ROUTES = [
  "/health",
  "/health/live",
  "/health/ready",
];

// Sensitive fields to redact from logs
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "ssn",
  "social_security",
  "credit_card",
  "cvv",
  "pin",
];

/**
 * Audit logging middleware
 */
export const auditLogger = createMiddleware<Env>(async (c, next) => {
  const path = c.req.path;

  // Skip logging for excluded routes
  if (NEVER_LOG_ROUTES.some((route) => path.startsWith(route))) {
    await next();
    return;
  }

  const startTime = Date.now();

  // Execute the request
  await next();

  // Determine if we should log
  const shouldLog =
    c.get("userId") || // Always log authenticated requests
    ALWAYS_LOG_ROUTES.some((route) => path.startsWith(route)); // Or important unauthenticated routes

  if (!shouldLog) {
    return;
  }

  // Collect audit data (async, don't block response)
  const auditData = {
    userId: c.get("userId"),
    action: `${c.req.method} ${path}`,
    category: categorizeRequest(path),
    resourceType: extractResourceType(path),
    resourceId: extractResourceId(path, c),
    description: `${c.req.method} ${path}`,
    metadata: {
      method: c.req.method,
      path,
      query: redactSensitiveData(Object.fromEntries(new URL(c.req.url).searchParams)),
      status: c.res.status,
      duration: Date.now() - startTime,
      userAgent: c.req.header("user-agent"),
    },
    ipAddress: c.req.header("x-forwarded-for")?.split(",")[0] ||
      c.req.header("cf-connecting-ip"),
    userAgent: c.req.header("user-agent"),
    sessionId: c.req.header("x-session-id"),
    timestamp: Date.now(),
  };

  // Log asynchronously (don't await)
  logAuditEvent(auditData).catch((error) => {
    console.error("Failed to log audit event:", error);
  });
});

/**
 * Log audit event to Convex
 */
async function logAuditEvent(data: {
  userId?: string;
  action: string;
  category: string;
  resourceType: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: number;
}): Promise<void> {
  const convex = getConvex();

  await convex.mutation(api.functions.audit.log, {
    userId: data.userId as any,
    actorType: data.userId ? "user" : "system",
    action: data.action,
    category: data.category as any,
    resourceType: data.resourceType,
    resourceId: data.resourceId || "unknown",
    description: data.description,
    metadata: data.metadata,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    sessionId: data.sessionId,
    timestamp: data.timestamp,
  });
}

/**
 * Categorize request for audit purposes
 */
function categorizeRequest(path: string): string {
  if (path.startsWith("/auth")) return "auth";
  if (path.startsWith("/trading") || path.startsWith("/predictions") || path.startsWith("/rwa")) {
    return "trading";
  }
  if (path.startsWith("/rewards")) return "funds";
  if (path.startsWith("/api/users") || path.startsWith("/settings")) return "settings";
  if (path.startsWith("/admin")) return "admin";
  return "settings";
}

/**
 * Extract resource type from path
 */
function extractResourceType(path: string): string {
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return "api";

  // Handle common patterns
  if (parts[0] === "api" && parts.length > 1) {
    return parts[1];
  }

  return parts[0];
}

/**
 * Extract resource ID from path or context
 */
function extractResourceId(path: string, c: any): string | undefined {
  const parts = path.split("/").filter(Boolean);

  // Look for UUID-like patterns
  for (const part of parts) {
    if (
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(part) ||
      /^[a-zA-Z0-9_-]{10,}$/.test(part)
    ) {
      return part;
    }
  }

  // Check common param patterns
  const orderIdMatch = path.match(/orders\/([^\/]+)/);
  if (orderIdMatch) return orderIdMatch[1];

  const eventIdMatch = path.match(/events\/([^\/]+)/);
  if (eventIdMatch) return eventIdMatch[1];

  return undefined;
}

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
