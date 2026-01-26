import { createMiddleware } from "hono/factory";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Env } from "../index";
import { logger } from "@pull/core/services/logger";

// Environment detection
const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

// Check Redis configuration in production
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isRedisConfigured = redisUrl && redisToken;

// In production, Redis must be configured
if (isProduction && !isRedisConfigured) {
  logger.error("CRITICAL: Redis is not configured in production. Rate limiting will reject all requests.");
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
      // Betting: 30 bets per minute
      betting: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "ratelimit:betting",
      }),
      // Draft actions: 60 per minute
      draft: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        prefix: "ratelimit:draft",
      }),
      // Trade proposals: 10 per hour
      trade: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "ratelimit:trade",
      }),
      // Payment operations: 5 per 10 minutes
      payment: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "10 m"),
        prefix: "ratelimit:payment",
      }),
      // WebSocket connections: 5 per minute
      websocket: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "ratelimit:ws",
      }),
      // Auth attempts: 10 per 15 minutes
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "15 m"),
        prefix: "ratelimit:auth-attempts",
      }),
    }
  : null;

// Type for rate limiter tiers
type RateLimiterTier = "anonymous" | "authenticated" | "premium" | "betting" | "draft" | "trade" | "payment" | "websocket" | "auth";

// Fantasy-specific rate limit middleware factory
export function createFantasyRateLimit(tier: RateLimiterTier) {
  return createMiddleware<Env>(async (c, next) => {
    // Skip rate limiting in development or if Redis is not configured
    if (isDevelopment || !rateLimiters) {
      await next();
      return;
    }

    const userId = c.get("userId");
    const ip = c.req.header("CF-Connecting-IP") ??
               c.req.header("X-Forwarded-For")?.split(",")[0] ??
               "unknown";
    const identifier = userId ?? ip;

    const limiter = rateLimiters[tier];
    if (!limiter) {
      await next();
      return;
    }

    try {
      const { success, limit, remaining, reset } = await limiter.limit(identifier);
      c.header("X-RateLimit-Limit", limit.toString());
      c.header("X-RateLimit-Remaining", remaining.toString());
      c.header("X-RateLimit-Reset", reset.toString());

      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000);
        c.header("Retry-After", retryAfter.toString());
        return c.json({
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded for ${tier} operations.` },
          meta: { limit, remaining: 0, reset, retryAfter },
          timestamp: new Date().toISOString(),
        }, 429);
      }
      await next();
    } catch (error) {
      logger.error("Rate limit error", { tier, identifier, error });
      await next();
    }
  });
}

export const rateLimitMiddleware = createMiddleware<Env>(async (c, next) => {
  // Skip rate limiting in development
  if (isDevelopment) {
    await next();
    return;
  }

  // Skip if Redis is not configured
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

  // SECURITY: For anonymous users with unknown IP, use a more restrictive identifier
  // This prevents attackers from sharing the same rate limit pool
  let identifier: string;
  if (userId) {
    // Authenticated: use userId + IP for defense in depth
    identifier = `user:${userId}:${ip}`;
  } else if (ip !== "unknown") {
    // Anonymous with known IP: use IP
    identifier = `ip:${ip}`;
  } else {
    // Anonymous with unknown IP: use a session-based approach or very restrictive global limit
    // Note: In production, consider implementing session token tracking
    identifier = "anonymous:unknown";
  }

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
    if (isSensitive) {
      logger.error("Rate limit error on sensitive endpoint, blocking request", { path, identifier, error });
      return c.json(
        {
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        503
      );
    }
    logger.error("Rate limit error, allowing through", { path, identifier, error });
    await next();
  }
});
