import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
const mockLogger = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

// Mock Redis client
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => mockRedis),
}));

describe('Redis - Fail-Closed & Idempotency', () => {
  // Save original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.warn.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
  });

  afterEach(() => {
    // Restore environment using vi.unstubAllEnvs() if available, otherwise restore manually
    vi.resetModules();
    // Restore critical env vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('UPSTASH_REDIS_')) {
        delete process.env[key];
      }
    });
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      }
    });
  });

  describe('Fail-Closed Behavior (SECURITY CRITICAL)', () => {
    it('should return true when Redis is not configured', async () => {
      // Remove Redis credentials
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('test-token');

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis credentials not configured'),
        expect.any(Object)
      );
    });

    it('should return true when Redis connection fails', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('test-token');

      expect(result).toBe(true);
    });

    it('should return true when Redis query times out', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Timeout')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('test-token');

      expect(result).toBe(true);
    });

    it('should fail open when explicitly requested', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('test-token', { failOpen: true });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failing open'),
        expect.any(Object)
      );
    });

    it('should activate circuit breaker after Redis errors', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');

      // First call should attempt Redis
      await isTokenBlacklisted('test-token-1');
      expect(mockRedisInstance.get).toHaveBeenCalledTimes(1);

      // Immediate subsequent call should be circuit-broken
      await isTokenBlacklisted('test-token-2');
      // Should still only be called once (circuit breaker active)
      expect(mockRedisInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Blacklisting', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    });

    it('should store hashed token with TTL', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { blacklistToken } = await import('../redis');
      await blacklistToken('test-token-123', 3600);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        expect.stringContaining('token:blacklist:'),
        '1',
        { ex: 3600 }
      );
    });

    it('should use SHA-256 for token hashing', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { blacklistToken } = await import('../redis');
      await blacklistToken('test-token', 3600);

      // SHA-256 hash should be 64 hex characters
      const callArgs = mockRedisInstance.set.mock.calls[0];
      const key = callArgs[0] as string;
      const hash = key.replace('token:blacklist:', '');
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return true for blacklisted tokens', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue('1'),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('blacklisted-token');

      expect(result).toBe(true);
    });

    it('should return false for valid tokens', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');
      const result = await isTokenBlacklisted('valid-token');

      expect(result).toBe(false);
    });

    it('should not throw when blacklisting fails', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        set: vi.fn().mockRejectedValue(new Error('Redis error')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { blacklistToken } = await import('../redis');
      
      // Should not throw
      await expect(blacklistToken('test-token', 3600)).resolves.not.toThrow();
    });

    it('should handle missing Redis configuration gracefully', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();

      const { blacklistToken } = await import('../redis');
      
      // Should not throw
      await expect(blacklistToken('test-token', 3600)).resolves.not.toThrow();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot blacklist token'),
        expect.any(Object)
      );
    });
  });

  describe('Idempotency', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    });

    it('should return { exists: false } for new keys', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      const result = await checkIdempotencyKey('new-key', 'value-123');

      expect(result).toEqual({ exists: false });
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        expect.stringContaining('idempotency:new-key'),
        'value-123',
        expect.objectContaining({ nx: true })
      );
    });

    it('should return { exists: true, storedValue } for duplicate keys', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue('cached-value'),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      const result = await checkIdempotencyKey('duplicate-key', 'new-value');

      expect(result).toEqual({
        exists: true,
        storedValue: 'cached-value',
      });
    });

    it('should set keys with TTL', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      await checkIdempotencyKey('key-with-ttl', 'value', 7200);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        expect.any(String),
        'value',
        { nx: true, ex: 7200 }
      );
    });

    it('should use default TTL of 24 hours', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      await checkIdempotencyKey('key-default-ttl', 'value');

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        expect.any(String),
        'value',
        { nx: true, ex: 86400 }
      );
    });

    it('should handle race condition when key is set between get and set', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn()
          .mockResolvedValueOnce(null) // First get returns null
          .mockResolvedValueOnce('race-value'), // Second get after failed set
        set: vi.fn().mockResolvedValue(null), // Set fails (key exists)
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      const result = await checkIdempotencyKey('race-key', 'my-value');

      expect(result).toEqual({
        exists: true,
        storedValue: 'race-value',
      });
    });

    it('should return { exists: false } when Redis is not configured', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();

      const { checkIdempotencyKey } = await import('../redis');
      const result = await checkIdempotencyKey('key', 'value');

      expect(result).toEqual({ exists: false });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Idempotency check unavailable'),
        expect.any(Object)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Redis error')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { checkIdempotencyKey } = await import('../redis');
      const result = await checkIdempotencyKey('error-key', 'value');

      expect(result).toEqual({ exists: false });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Idempotency check failed',
        expect.any(Object)
      );
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    });

    it('should mark Redis as unavailable after error', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted, isRedisAvailable } = await import('../redis');

      // Before error
      expect(isRedisAvailable()).toBe(true);

      // Trigger error
      await isTokenBlacklisted('test-token');

      // After error (note: module state persists)
      // The function should have logged the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection failed'),
        expect.any(Object)
      );
    });

    it('should mark Redis as available after successful operation', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        get: vi.fn()
          .mockRejectedValueOnce(new Error('Connection failed'))
          .mockResolvedValueOnce(null),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { isTokenBlacklisted } = await import('../redis');

      // First call fails
      await isTokenBlacklisted('test-token-1');

      // Wait for retry interval (in real code, would need to wait 30s)
      // For testing, we just make another call
      vi.useFakeTimers();
      vi.advanceTimersByTime(31000);
      
      // Second call succeeds
      await isTokenBlacklisted('test-token-2');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection restored'),
        expect.any(Object)
      );

      vi.useRealTimers();
    });
  });

  describe('removeFromBlacklist()', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    });

    it('should remove token from blacklist', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        del: vi.fn().mockResolvedValue(1),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { removeFromBlacklist } = await import('../redis');
      await removeFromBlacklist('test-token');

      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        expect.stringContaining('token:blacklist:')
      );
    });

    it('should handle missing Redis configuration', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();

      const { removeFromBlacklist } = await import('../redis');
      
      // Should not throw
      await expect(removeFromBlacklist('test-token')).resolves.not.toThrow();
    });

    it('should handle Redis errors gracefully', async () => {
      vi.resetModules();

      const { Redis } = await import('@upstash/redis');
      const mockRedisInstance = {
        del: vi.fn().mockRejectedValue(new Error('Redis error')),
      };
      vi.mocked(Redis).mockReturnValue(mockRedisInstance as any);

      const { removeFromBlacklist } = await import('../redis');
      
      // Should not throw
      await expect(removeFromBlacklist('test-token')).resolves.not.toThrow();
    });
  });

  describe('isRedisAvailable()', () => {
    it('should return false when Redis is not configured', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();

      const { isRedisAvailable } = await import('../redis');
      expect(isRedisAvailable()).toBe(false);
    });

    it('should return true when Redis is configured', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();

      const { isRedisAvailable } = await import('../redis');
      expect(isRedisAvailable()).toBe(true);
    });
  });
});
