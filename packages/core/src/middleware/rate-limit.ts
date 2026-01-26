/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 */

import { Context, MiddlewareHandler } from "hono";

// Rate limit configuration by endpoint type
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  keyGenerator?: (c: Context) => string;
  skip?: (c: Context) => boolean;
  onRateLimit?: (c: Context, info: RateLimitInfo) => void;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
}

// In-memory store (use Redis in production for distributed rate limiting)
const store = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Default rate limit presets
 */
export const RateLimitPresets = {
  // Standard API endpoints
  standard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },

  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: "Too many authentication attempts. Please try again later.",
  },

  // Sensitive operations (payments, withdrawals)
  sensitive: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: "Too many requests. Please slow down.",
  },

  // Public endpoints (more lenient)
  public: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
  },

  // Webhooks (high volume expected)
  webhooks: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
  },

  // Heavy operations (exports, reports)
  heavy: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: "Rate limit exceeded for this operation. Please try again later.",
  },
} as const;

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  const {
    windowMs,
    maxRequests,
    message = "Too many requests, please try again later.",
    keyGenerator = defaultKeyGenerator,
    skip,
    onRateLimit,
  } = config;

  return async (c, next) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = store.get(key);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
      store.set(key, entry);
    }

    entry.count++;

    const info: RateLimitInfo = {
      limit: maxRequests,
      current: entry.count,
      remaining: Math.max(0, maxRequests - entry.count),
      resetTime: entry.resetTime,
    };

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(info.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));

    // Check if rate limited
    if (entry.count > maxRequests) {
      onRateLimit?.(c, info);

      c.header("Retry-After", String(Math.ceil((entry.resetTime - now) / 1000)));

      return c.json(
        {
          error: "rate_limit_exceeded",
          message,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        },
        429
      );
    }

    return next();
  };
}

/**
 * Default key generator - uses IP + path
 */
function defaultKeyGenerator(c: Context): string {
  const ip = getClientIP(c);
  const path = c.req.path;
  return `ratelimit:${ip}:${path}`;
}

/**
 * Get client IP from request
 */
function getClientIP(c: Context): string {
  // Check common proxy headers
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = c.req.header("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = c.req.header("cf-connecting-ip");
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback
  return "unknown";
}

/**
 * User-based rate limiting (for authenticated requests)
 */
export function userRateLimit(config: Omit<RateLimitConfig, "keyGenerator">): MiddlewareHandler {
  return rateLimit({
    ...config,
    keyGenerator: (c) => {
      const userId = c.get("userId") || c.get("user")?.id;
      if (userId) {
        return `ratelimit:user:${userId}:${c.req.path}`;
      }
      // Fall back to IP-based
      return `ratelimit:ip:${getClientIP(c)}:${c.req.path}`;
    },
  });
}

/**
 * Sliding window rate limiter (more accurate but more memory)
 */
export function slidingWindowRateLimit(config: RateLimitConfig): MiddlewareHandler {
  const windowStore = new Map<string, number[]>();

  return async (c, next) => {
    if (config.skip?.(c)) {
      return next();
    }

    const key = (config.keyGenerator || defaultKeyGenerator)(c);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get timestamps for this key
    let timestamps = windowStore.get(key) || [];

    // Filter out old timestamps
    timestamps = timestamps.filter((t) => t > windowStart);

    const info: RateLimitInfo = {
      limit: config.maxRequests,
      current: timestamps.length + 1,
      remaining: Math.max(0, config.maxRequests - timestamps.length - 1),
      resetTime: now + config.windowMs,
    };

    // Set headers
    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(info.remaining));

    if (timestamps.length >= config.maxRequests) {
      const oldestTimestamp = timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);

      c.header("Retry-After", String(retryAfter));

      config.onRateLimit?.(c, info);

      return c.json(
        {
          error: "rate_limit_exceeded",
          message: config.message || "Too many requests, please try again later.",
          retryAfter,
        },
        429
      );
    }

    // Add current timestamp
    timestamps.push(now);
    windowStore.set(key, timestamps);

    return next();
  };
}

/**
 * Redis-based rate limiter for distributed systems
 */
export function createRedisRateLimiter(redisClient: {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<void>;
  ttl: (key: string) => Promise<number>;
}) {
  return function redisRateLimit(config: RateLimitConfig): MiddlewareHandler {
    return async (c, next) => {
      if (config.skip?.(c)) {
        return next();
      }

      const key = (config.keyGenerator || defaultKeyGenerator)(c);
      const windowSeconds = Math.ceil(config.windowMs / 1000);

      try {
        const count = await redisClient.incr(key);

        if (count === 1) {
          await redisClient.expire(key, windowSeconds);
        }

        const ttl = await redisClient.ttl(key);

        const info: RateLimitInfo = {
          limit: config.maxRequests,
          current: count,
          remaining: Math.max(0, config.maxRequests - count),
          resetTime: Date.now() + ttl * 1000,
        };

        c.header("X-RateLimit-Limit", String(config.maxRequests));
        c.header("X-RateLimit-Remaining", String(info.remaining));
        c.header("X-RateLimit-Reset", String(Math.ceil(info.resetTime / 1000)));

        if (count > config.maxRequests) {
          c.header("Retry-After", String(ttl));

          config.onRateLimit?.(c, info);

          return c.json(
            {
              error: "rate_limit_exceeded",
              message: config.message || "Too many requests, please try again later.",
              retryAfter: ttl,
            },
            429
          );
        }
      } catch (error) {
        // On Redis error, allow request but log warning
        console.warn("Rate limit Redis error:", error);
      }

      return next();
    };
  };
}

export { getClientIP };
