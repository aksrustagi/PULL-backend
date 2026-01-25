import { createMiddleware } from "hono/factory";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Env } from "../index";

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";

// Check Redis configuration in production
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isRedisConfigured = redisUrl && redisToken;

// In production, Redis must be configured
if (isProduction && !isRedisConfigured) {
  console.error("CRITICAL: Redis is not configured in production. Rate limiting will reject all requests.");
}

// Initialize Upstash Redis client (only if configured)
const redis = isRedisConfigured
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null;

// Create rate limiters for different tiers (only if Redis is available)
const rateLimiters = redis
  ? {
      // Anonymous users: 30 requests per minute
      anonymous: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "ratelimit:anon",
      }),
      // Authenticated users: 100 requests per minute
      authenticated: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        prefix: "ratelimit:auth",
      }),
      // Premium users: 300 requests per minute
      premium: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(300, "1 m"),
        prefix: "ratelimit:premium",
      }),
    }
  : null;

export const rateLimitMiddleware = createMiddleware<Env>(async (c, next) => {
  // Skip rate limiting in development
  if (isDevelopment) {
    await next();
    return;
  }

  // In production, if Redis is not configured, return 503
  if (isProduction && !rateLimiters) {
    return c.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Rate limiting service is unavailable. Please try again later.",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      503
    );
  }

  // In non-production/non-development (e.g., test), skip if not configured
  if (!rateLimiters) {
    await next();
    return;
  }

  const userId = c.get("userId");
  // Only trust proxy headers if explicitly configured
  const trustProxy = !!process.env.TRUST_PROXY;
  const ip = trustProxy
    ? (c.req.header("CF-Connecting-IP") ??
       c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
       "unknown")
    : "unknown";

  // Determine rate limiter based on authentication
  const limiter = userId ? rateLimiters.authenticated : rateLimiters.anonymous;
  const identifier = userId ?? ip;

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", reset.toString());

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      c.header("Retry-After", retryAfter.toString());

      return c.json(
        {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit exceeded. Please try again later.",
          },
          meta: {
            limit,
            remaining: 0,
            reset,
            retryAfter,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        429
      );
    }

    await next();
  } catch (error) {
    // Fail CLOSED for sensitive endpoints - deny on rate limit failure
    const path = c.req.path;
    const isSensitive = path.includes("/auth") || path.includes("/trading") || path.includes("/orders");

    if (isSensitive || isProduction) {
      console.error("Rate limit error on sensitive endpoint, blocking:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Rate limiting service error. Please try again later.",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    // In non-production, non-sensitive endpoints, log and allow through
    console.error("Rate limit error, allowing through:", error);
    await next();
  }
});
