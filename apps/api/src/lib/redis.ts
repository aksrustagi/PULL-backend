import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client for token blacklisting and caching
 */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TOKEN_BLACKLIST_PREFIX = "token:blacklist:";

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
 * Add a token to the blacklist
 * @param token - The JWT token to blacklist
 * @param expiresIn - TTL in seconds (should match token expiry)
 */
export async function blacklistToken(
  token: string,
  expiresIn: number
): Promise<void> {
  const tokenHash = await hashToken(token);
  await redis.set(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`, "1", {
    ex: expiresIn,
  });
}

/**
 * Check if a token is blacklisted
 * @param token - The JWT token to check
 * @returns true if the token is blacklisted, false otherwise
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  const result = await redis.get(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
  return result !== null;
}

/**
 * Remove a token from the blacklist (for testing or admin purposes)
 * @param token - The JWT token to remove from blacklist
 */
export async function removeFromBlacklist(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await redis.del(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
}

export { redis };
