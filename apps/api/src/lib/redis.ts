import { Redis } from "@upstash/redis";
import { getLogger } from "@pull/core/services";

/**
 * Upstash Redis client for token blacklisting and caching
 *
 * SECURITY: This module implements fail-closed behavior for security-critical
 * operations. If Redis is unavailable, token validation will fail safe by
 * treating tokens as potentially blacklisted.
 */

const logger = getLogger();

// Validate Redis configuration
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Track Redis availability for circuit breaker pattern
let redisAvailable = true;
let lastRedisError: Date | null = null;
const REDIS_RETRY_INTERVAL = 30000; // 30 seconds

if (!redisUrl || !redisToken) {
  logger.warn("Redis credentials not configured - token blacklisting will fail closed for security", {
    service: "redis",
  });
  redisAvailable = false;
}

const redis = redisUrl && redisToken
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null;

const TOKEN_BLACKLIST_PREFIX = "token:blacklist:";
const IDEMPOTENCY_PREFIX = "idempotency:";

/**
 * Hash a token for secure storage using SHA-256
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check if Redis should be retried after an error
 */
function shouldRetryRedis(): boolean {
  if (!lastRedisError) return true;
  return Date.now() - lastRedisError.getTime() > REDIS_RETRY_INTERVAL;
}

/**
 * Mark Redis as temporarily unavailable
 */
function markRedisUnavailable(error: unknown): void {
  redisAvailable = false;
  lastRedisError = new Date();
  logger.error("Redis connection failed - enabling fail-closed mode", {
    service: "redis",
    error,
    retryAfter: REDIS_RETRY_INTERVAL,
  });
}

/**
 * Mark Redis as available again
 */
function markRedisAvailable(): void {
  if (!redisAvailable) {
    logger.info("Redis connection restored", { service: "redis" });
  }
  redisAvailable = true;
  lastRedisError = null;
}

/**
 * Add a token to the blacklist
 * @param token - The JWT token to blacklist
 * @param expiresIn - TTL in seconds (should match token expiry)
 */
export async function blacklistToken(
  token: string,
  expiresIn: number
): Promise<void> {
  if (!redis) {
    logger.warn("Cannot blacklist token - Redis not configured", {
      service: "redis",
    });
    return;
  }

  try {
    const tokenHash = await hashToken(token);
    await redis.set(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`, "1", {
      ex: expiresIn,
    });
    markRedisAvailable();
  } catch (error) {
    markRedisUnavailable(error);
    // Don't throw - blacklisting failure shouldn't break logout flow
    // but the token will be treated as blacklisted on next validation
  }
}

/**
 * Check if a token is blacklisted
 *
 * SECURITY: Implements fail-closed behavior:
 * - If Redis is not configured: returns true (treat as blacklisted)
 * - If Redis connection fails: returns true (treat as blacklisted)
 * - Only returns false if we can positively confirm token is not blacklisted
 *
 * @param token - The JWT token to check
 * @param options - Configuration options
 * @param options.failOpen - If true, return false on Redis failure (NOT RECOMMENDED for auth)
 * @returns true if the token is blacklisted or status cannot be determined
 */
export async function isTokenBlacklisted(
  token: string,
  options: { failOpen?: boolean } = {}
): Promise<boolean> {
  const { failOpen = false } = options;

  if (!redis) {
    // SECURITY: No Redis = fail closed (treat as blacklisted)
    if (failOpen) {
      logger.debug("Redis not configured, failing open as requested", {
        service: "redis",
      });
      return false;
    }
    logger.warn("Token check failed closed - Redis not configured", {
      service: "redis",
    });
    return true;
  }

  // Circuit breaker: if Redis recently failed, don't hammer it
  if (!redisAvailable && !shouldRetryRedis()) {
    if (failOpen) {
      return false;
    }
    logger.warn("Token check failed closed - Redis circuit breaker open", {
      service: "redis",
    });
    return true;
  }

  try {
    const tokenHash = await hashToken(token);
    const result = await redis.get(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
    markRedisAvailable();
    return result !== null;
  } catch (error) {
    markRedisUnavailable(error);

    // SECURITY: On error, fail closed (treat as blacklisted)
    if (failOpen) {
      logger.warn("Token check failing open due to Redis error", {
        service: "redis",
        error,
      });
      return false;
    }

    logger.warn("Token check failed closed due to Redis error", {
      service: "redis",
      error,
    });
    return true;
  }
}

/**
 * Remove a token from the blacklist (for testing or admin purposes)
 * @param token - The JWT token to remove from blacklist
 */
export async function removeFromBlacklist(token: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const tokenHash = await hashToken(token);
    await redis.del(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
    markRedisAvailable();
  } catch (error) {
    markRedisUnavailable(error);
  }
}

/**
 * Check idempotency key and set if not exists
 * Used for preventing duplicate financial operations
 *
 * @param key - The idempotency key (usually from request)
 * @param value - Value to store (usually request hash or result)
 * @param ttlSeconds - Time to live in seconds
 * @returns Object with exists flag and stored value if exists
 */
export async function checkIdempotencyKey(
  key: string,
  value: string,
  ttlSeconds: number = 86400 // 24 hours default
): Promise<{ exists: boolean; storedValue?: string }> {
  if (!redis) {
    // SECURITY: No Redis = cannot guarantee idempotency
    // Caller should handle this appropriately for financial operations
    logger.warn("Idempotency check unavailable - Redis not configured", {
      service: "redis",
      key,
    });
    return { exists: false };
  }

  try {
    const fullKey = `${IDEMPOTENCY_PREFIX}${key}`;

    // Try to get existing value first
    const existing = await redis.get(fullKey);
    if (existing) {
      markRedisAvailable();
      return { exists: true, storedValue: existing as string };
    }

    // Set with NX (only if not exists) and expiry
    const result = await redis.set(fullKey, value, {
      nx: true,
      ex: ttlSeconds,
    });

    markRedisAvailable();

    // If set returned null, key was set by another request between get and set
    if (result === null) {
      const newValue = await redis.get(fullKey);
      return { exists: true, storedValue: newValue as string };
    }

    return { exists: false };
  } catch (error) {
    markRedisUnavailable(error);
    logger.error("Idempotency check failed", {
      service: "redis",
      key,
      error,
    });
    // Return exists: false but caller should check Redis availability
    return { exists: false };
  }
}

/**
 * Check if Redis is currently available
 */
export function isRedisAvailable(): boolean {
  return redis !== null && redisAvailable;
}

export { redis };
