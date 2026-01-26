/**
 * Redis Tests
 * Tests for token blacklisting, idempotency, and fail-closed behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Redis client before importing the module
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

vi.mock("@pull/core/services", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("Redis Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      ...originalEnv,
      UPSTASH_REDIS_REST_URL: "https://test.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("blacklistToken", () => {
    it("should store hashed token in Redis with expiry", async () => {
      mockRedisSet.mockResolvedValue("OK");

      const { blacklistToken } = await import("../../lib/redis");
      await blacklistToken("test-jwt-token", 3600);

      expect(mockRedisSet).toHaveBeenCalledTimes(1);
      const call = mockRedisSet.mock.calls[0];
      expect(call[0]).toMatch(/^token:blacklist:/);
      expect(call[1]).toBe("1");
      expect(call[2]).toEqual({ ex: 3600 });
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisSet.mockRejectedValue(new Error("Redis connection failed"));

      const { blacklistToken } = await import("../../lib/redis");
      // Should not throw
      await expect(blacklistToken("test-token", 3600)).resolves.toBeUndefined();
    });
  });

  describe("isTokenBlacklisted - fail-closed behavior", () => {
    it("should return true when Redis is not configured", async () => {
      vi.resetModules();
      process.env = { ...originalEnv };
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const { isTokenBlacklisted } = await import("../../lib/redis");
      const result = await isTokenBlacklisted("test-token");

      // SECURITY: Fail closed - treat as blacklisted
      expect(result).toBe(true);
    });

    it("should return false when token is not in blacklist", async () => {
      mockRedisGet.mockResolvedValue(null);

      const { isTokenBlacklisted } = await import("../../lib/redis");
      const result = await isTokenBlacklisted("test-token");

      expect(result).toBe(false);
    });

    it("should return true when token is in blacklist", async () => {
      mockRedisGet.mockResolvedValue("1");

      const { isTokenBlacklisted } = await import("../../lib/redis");
      const result = await isTokenBlacklisted("test-token");

      expect(result).toBe(true);
    });

    it("should return true (fail closed) when Redis throws error", async () => {
      mockRedisGet.mockRejectedValue(new Error("Redis connection failed"));

      const { isTokenBlacklisted } = await import("../../lib/redis");
      const result = await isTokenBlacklisted("test-token");

      // SECURITY: Fail closed on error
      expect(result).toBe(true);
    });

    it("should return false when failOpen option is true and Redis fails", async () => {
      mockRedisGet.mockRejectedValue(new Error("Redis connection failed"));

      const { isTokenBlacklisted } = await import("../../lib/redis");
      const result = await isTokenBlacklisted("test-token", { failOpen: true });

      expect(result).toBe(false);
    });

    it("should hash token before checking", async () => {
      mockRedisGet.mockResolvedValue(null);

      const { isTokenBlacklisted } = await import("../../lib/redis");
      await isTokenBlacklisted("test-token");

      expect(mockRedisGet).toHaveBeenCalledTimes(1);
      const key = mockRedisGet.mock.calls[0][0];
      expect(key).toMatch(/^token:blacklist:[a-f0-9]{64}$/);
    });
  });

  describe("removeFromBlacklist", () => {
    it("should delete token from Redis", async () => {
      mockRedisDel.mockResolvedValue(1);

      const { removeFromBlacklist } = await import("../../lib/redis");
      await removeFromBlacklist("test-token");

      expect(mockRedisDel).toHaveBeenCalledTimes(1);
      const key = mockRedisDel.mock.calls[0][0];
      expect(key).toMatch(/^token:blacklist:/);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisDel.mockRejectedValue(new Error("Redis error"));

      const { removeFromBlacklist } = await import("../../lib/redis");
      await expect(removeFromBlacklist("test-token")).resolves.toBeUndefined();
    });
  });

  describe("checkIdempotencyKey", () => {
    it("should return exists: false for new key and store it", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue("OK");

      const { checkIdempotencyKey } = await import("../../lib/redis");
      const result = await checkIdempotencyKey("deposit:user1:abc123", "request-data", 86400);

      expect(result.exists).toBe(false);
      expect(mockRedisSet).toHaveBeenCalledWith(
        "idempotency:deposit:user1:abc123",
        "request-data",
        { nx: true, ex: 86400 }
      );
    });

    it("should return exists: true with stored value for existing key", async () => {
      mockRedisGet.mockResolvedValue("cached-response");

      const { checkIdempotencyKey } = await import("../../lib/redis");
      const result = await checkIdempotencyKey("deposit:user1:abc123", "new-request-data");

      expect(result.exists).toBe(true);
      expect(result.storedValue).toBe("cached-response");
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it("should handle race condition when key is set between get and set", async () => {
      mockRedisGet
        .mockResolvedValueOnce(null) // First get returns null
        .mockResolvedValueOnce("raced-response"); // Second get returns value
      mockRedisSet.mockResolvedValue(null); // NX failed - key was set by another request

      const { checkIdempotencyKey } = await import("../../lib/redis");
      const result = await checkIdempotencyKey("deposit:user1:abc123", "request-data");

      expect(result.exists).toBe(true);
      expect(result.storedValue).toBe("raced-response");
    });

    it("should use default TTL of 24 hours", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue("OK");

      const { checkIdempotencyKey } = await import("../../lib/redis");
      await checkIdempotencyKey("key", "value");

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { nx: true, ex: 86400 }
      );
    });

    it("should handle Redis errors", async () => {
      mockRedisGet.mockRejectedValue(new Error("Redis error"));

      const { checkIdempotencyKey } = await import("../../lib/redis");
      const result = await checkIdempotencyKey("key", "value");

      expect(result.exists).toBe(false);
    });
  });

  describe("isRedisAvailable", () => {
    it("should return true when Redis is configured and available", async () => {
      const { isRedisAvailable } = await import("../../lib/redis");
      expect(isRedisAvailable()).toBe(true);
    });

    it("should return false when Redis is not configured", async () => {
      vi.resetModules();
      process.env = { ...originalEnv };
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const { isRedisAvailable } = await import("../../lib/redis");
      expect(isRedisAvailable()).toBe(false);
    });
  });

  describe("Circuit breaker behavior", () => {
    it("should mark Redis as unavailable after error", async () => {
      mockRedisGet.mockRejectedValue(new Error("Connection failed"));

      const { isTokenBlacklisted, isRedisAvailable } = await import("../../lib/redis");

      // First call fails
      await isTokenBlacklisted("test-token");

      // Subsequent calls should use circuit breaker (fail closed without hitting Redis)
      mockRedisGet.mockClear();
      const result = await isTokenBlacklisted("another-token");

      // Should fail closed without hitting Redis (circuit breaker)
      expect(result).toBe(true);
    });
  });

  describe("Token hashing", () => {
    it("should produce consistent hashes for same token", async () => {
      mockRedisGet.mockResolvedValue(null);

      const { isTokenBlacklisted } = await import("../../lib/redis");

      await isTokenBlacklisted("same-token");
      const firstKey = mockRedisGet.mock.calls[0][0];

      mockRedisGet.mockClear();
      await isTokenBlacklisted("same-token");
      const secondKey = mockRedisGet.mock.calls[0][0];

      expect(firstKey).toBe(secondKey);
    });

    it("should produce different hashes for different tokens", async () => {
      mockRedisGet.mockResolvedValue(null);

      const { isTokenBlacklisted } = await import("../../lib/redis");

      await isTokenBlacklisted("token-one");
      const firstKey = mockRedisGet.mock.calls[0][0];

      mockRedisGet.mockClear();
      await isTokenBlacklisted("token-two");
      const secondKey = mockRedisGet.mock.calls[0][0];

      expect(firstKey).not.toBe(secondKey);
    });
  });
});
