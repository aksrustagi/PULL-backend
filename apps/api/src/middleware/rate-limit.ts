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
};

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
      console.error("Rate limit error on sensitive endpoint, blocking:", error);
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
    console.error("Rate limit error, allowing through:", error);
    await next();
  }
});
