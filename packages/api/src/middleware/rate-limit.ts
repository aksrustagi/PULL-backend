/**
 * Rate Limiting Middleware
 *
 * Uses Upstash Redis for distributed rate limiting.
 * Supports different limits for different endpoints.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { Env } from "../types";

// In-memory fallback store for development
const memoryStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (c: Context<Env>) => string;
  skip?: (c: Context<Env>) => boolean;
  handler?: (c: Context<Env>) => Response;
}

/**
 * Rate limiter middleware factory
 */
export function rateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyGenerator = (c) => c.req.header("x-forwarded-for") || "anonymous",
    skip,
    handler,
  } = config;

  return createMiddleware<Env>(async (c, next) => {
    // Skip rate limiting if configured
    if (skip?.(c)) {
      await next();
      return;
    }

    const key = `ratelimit:${keyGenerator(c)}`;
    const now = Date.now();

    let current: { count: number; resetAt: number };

    // Try Redis first, fall back to memory
    if (process.env.UPSTASH_REDIS_REST_URL) {
      try {
        current = await checkRedisRateLimit(key, windowMs, max, now);
      } catch (error) {
        console.warn("Redis rate limit error, falling back to memory:", error);
        current = checkMemoryRateLimit(key, windowMs, now);
      }
    } else {
      current = checkMemoryRateLimit(key, windowMs, now);
    }

    // Set rate limit headers
    const remaining = Math.max(0, max - current.count);
    const resetSeconds = Math.ceil((current.resetAt - now) / 1000);

    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", resetSeconds.toString());

    // Check if rate limit exceeded
    if (current.count > max) {
      if (handler) {
        return handler(c);
      }

      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
      });
    }

    await next();
  });
}

/**
 * Check rate limit using Upstash Redis
 */
async function checkRedisRateLimit(
  key: string,
  windowMs: number,
  max: number,
  now: number
): Promise<{ count: number; resetAt: number }> {
  const response = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/multi-exec`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PTTL", key],
      ]),
    }
  );

  if (!response.ok) {
    throw new Error(`Redis error: ${response.statusText}`);
  }

  const results = await response.json();
  const count = results[0].result as number;
  const ttl = results[1].result as number;

  // Set expiry if this is a new key
  if (ttl === -1) {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pexpire/${key}/${windowMs}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      },
    });
  }

  return {
    count,
    resetAt: now + (ttl > 0 ? ttl : windowMs),
  };
}

/**
 * Check rate limit using in-memory store
 */
function checkMemoryRateLimit(
  key: string,
  windowMs: number,
  now: number
): { count: number; resetAt: number } {
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    const entry = { count: 1, resetAt: now + windowMs };
    memoryStore.set(key, entry);
    return entry;
  }

  // Increment existing
  existing.count++;
  return existing;
}

/**
 * Preset rate limiters for different endpoints
 */
export const rateLimiters = {
  // Strict limit for auth endpoints
  auth: rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts
    keyGenerator: (c) =>
      `auth:${c.req.header("x-forwarded-for") || "anonymous"}`,
  }),

  // Standard API limit
  api: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
  }),

  // Higher limit for trading (but still protected)
  trading: rateLimiter({
    windowMs: 60 * 1000,
    max: 60, // 1 per second average
    keyGenerator: (c) => `trading:${c.get("userId") || "anonymous"}`,
  }),

  // Strict limit for expensive operations
  expensive: rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (c) => `expensive:${c.get("userId") || "anonymous"}`,
  }),

  // Webhook rate limit (by source)
  webhook: rateLimiter({
    windowMs: 60 * 1000,
    max: 1000, // High limit for webhooks
    keyGenerator: (c) => `webhook:${c.req.param("source") || "unknown"}`,
  }),
};

// Cleanup memory store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000); // Every minute
