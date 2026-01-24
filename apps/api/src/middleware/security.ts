import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "crypto";
import type { Env } from "../index";

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Security headers middleware
 */
export const securityHeaders = createMiddleware<Env>(async (c, next) => {
  await next();

  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff");

  // Enable XSS filter
  c.header("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.pull.app"
  );

  // Strict Transport Security (HTTPS only)
  if (process.env.NODE_ENV === "production") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
});

/**
 * CSRF protection middleware
 */
export const csrfProtection = createMiddleware<Env>(async (c, next) => {
  // Skip CSRF for safe methods and webhooks
  const method = c.req.method;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    await next();
    return;
  }

  // Skip for webhook routes
  if (c.req.path.startsWith("/webhooks/")) {
    await next();
    return;
  }

  // For state-changing requests, verify origin
  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  const allowedOrigins = [
    "https://pull.app",
    "https://www.pull.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  // Add any configured allowed origins
  if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(","));
  }

  const requestOrigin = origin || (referer ? new URL(referer).origin : null);

  if (!requestOrigin) {
    // Allow requests without origin header (e.g., from native apps, Postman)
    // In production, you might want to be stricter
    if (process.env.NODE_ENV === "production") {
      // Check for valid API key instead using timing-safe comparison
      const apiKey = c.req.header("X-API-Key");
      const expectedApiKey = process.env.API_KEY;
      if (!apiKey || !expectedApiKey || !timingSafeCompare(apiKey, expectedApiKey)) {
        return c.json(
          {
            success: false,
            error: { code: "CSRF_ERROR", message: "Origin validation failed" },
          },
          403
        );
      }
    }
  } else if (!allowedOrigins.includes(requestOrigin)) {
    return c.json(
      {
        success: false,
        error: { code: "CSRF_ERROR", message: "Origin not allowed" },
      },
      403
    );
  }

  await next();
});

/**
 * Input sanitization middleware
 */
export const sanitizeInput = createMiddleware<Env>(async (c, next) => {
  // Only process JSON bodies
  const contentType = c.req.header("Content-Type");
  if (!contentType?.includes("application/json")) {
    await next();
    return;
  }

  try {
    const body = await c.req.json();
    const sanitized = sanitizeObject(body);

    // Store sanitized body for later use
    c.set("sanitizedBody", sanitized);
  } catch {
    // Body parsing failed, continue without sanitization
  }

  await next();
});

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[sanitizeString(key)] = sanitizeObject(value);
    }
    return result;
  }

  return obj;
}

function sanitizeString(str: string): string {
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Request ID middleware
 */
export const requestId = createMiddleware<Env>(async (c, next) => {
  const id = c.req.header("X-Request-ID") || crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
});

/**
 * Request timing middleware
 */
export const requestTiming = createMiddleware<Env>(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header("X-Response-Time", `${duration}ms`);
});
