import { createMiddleware } from "hono/factory";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Env } from "../index";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

// Create rate limiters for different tiers
const rateLimiters = {
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
    prefix: "ratelimit:auth",
  }),
};

// Fantasy-specific rate limit middleware factory
export function createFantasyRateLimit(tier: keyof typeof rateLimiters) {
  return createMiddleware<Env>(async (c, next) => {
    if (process.env.NODE_ENV === "development" || !process.env.UPSTASH_REDIS_REST_URL) {
      await next();
      return;
    }

    const userId = c.get("userId");
    const ip = c.req.header("CF-Connecting-IP") ??
               c.req.header("X-Forwarded-For")?.split(",")[0] ??
               "unknown";
    const identifier = userId ?? ip;

    try {
      const { success, limit, remaining, reset } = await rateLimiters[tier].limit(identifier);
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
      console.error(`Rate limit error (${tier}):`, error);
      await next();
    }
  });
}

export const rateLimitMiddleware = createMiddleware<Env>(async (c, next) => {
  // Skip rate limiting in development
  if (process.env.NODE_ENV === "development") {
    await next();
    return;
  }

  // Skip if Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    await next();
    return;
  }

  const userId = c.get("userId");
  const ip = c.req.header("CF-Connecting-IP") ??
             c.req.header("X-Forwarded-For")?.split(",")[0] ??
             "unknown";

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
    // If rate limiting fails, allow the request
    console.error("Rate limit error:", error);
    await next();
  }
});
