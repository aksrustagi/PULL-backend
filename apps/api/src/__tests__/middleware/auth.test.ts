/**
 * Auth Middleware Tests
 * Comprehensive tests for JWT authentication and authorization
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import * as jose from 'jose';

// ===========================================================================
// Mock Setup
// ===========================================================================

// Must stub env before importing auth middleware
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');

// Mock Redis for token blacklisting
const mockIsTokenBlacklisted = vi.fn();
vi.mock('../../lib/redis', () => ({
  isTokenBlacklisted: () => mockIsTokenBlacklisted(),
}));

// Mock Convex client
const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();
vi.mock('../../lib/convex', () => ({
  convex: {
    query: (...args: unknown[]) => mockConvexQuery(...args),
    mutation: (...args: unknown[]) => mockConvexMutation(...args),
  },
  api: {
    admin: {
      isAdmin: 'admin:isAdmin',
    },
    audit: {
      log: 'audit:log',
    },
  },
}));

// Import after mocks
const { authMiddleware, adminOnly, generateToken, generateRefreshToken, verifyToken, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } = await import('../../middleware/auth');

// ===========================================================================
// Test Constants
// ===========================================================================

const JWT_SECRET = new TextEncoder().encode('test-secret-key-that-is-at-least-32-characters-long');
const TEST_USER_ID = 'user_test123';

// ===========================================================================
// Test Helpers
// ===========================================================================

type Env = {
  Variables: {
    userId?: string;
    requestId: string;
  };
};

function createTestApp(options: { includeAdminMiddleware?: boolean } = {}) {
  const app = new Hono<Env>();

  // Request ID middleware
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    await next();
  });

  // Auth middleware
  app.use('/protected/*', authMiddleware);

  if (options.includeAdminMiddleware) {
    app.use('/admin/*', authMiddleware);
    app.use('/admin/*', adminOnly);
  }

  // Test routes
  app.get('/protected/data', (c) => {
    const userId = c.get('userId');
    return c.json({ success: true, userId });
  });

  app.get('/admin/dashboard', (c) => {
    return c.json({ success: true, message: 'Admin dashboard' });
  });

  app.get('/public', (c) => {
    return c.json({ success: true, message: 'Public route' });
  });

  return app;
}

async function createValidToken(userId: string, expiresIn: string = '15m'): Promise<string> {
  return await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('pull-api')
    .setAudience('pull-app')
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

async function createExpiredToken(userId: string): Promise<string> {
  return await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // 30 minutes ago
    .sign(JWT_SECRET);
}

async function createTokenWithoutSubject(): Promise<string> {
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTokenBlacklisted.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // authMiddleware Tests
  // =========================================================================

  describe('authMiddleware', () => {
    describe('Missing Authorization Header', () => {
      it('should return 401 when Authorization header is missing', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.message).toContain('Missing authorization header');
      });

      it('should include requestId in error response', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
        });

        const body = await res.json();
        expect(body.requestId).toBe('test-request-id');
      });

      it('should include timestamp in error response', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
        });

        const body = await res.json();
        expect(body.timestamp).toBeDefined();
        expect(new Date(body.timestamp).getTime()).not.toBeNaN();
      });
    });

    describe('Invalid Authorization Format', () => {
      it('should return 401 for non-Bearer token', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: 'Basic some-credentials',
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Invalid authorization format');
      });

      it('should return 401 for Bearer without token', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer',
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

      it('should return 401 for Bearer with empty token', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ',
          },
        });

        expect(res.status).toBe(401);
      });

      it('should return 401 for malformed Bearer format', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: 'bearer token', // lowercase
          },
        });

        expect(res.status).toBe(401);
      });
    });

    describe('Token Blacklist', () => {
      it('should return 401 for blacklisted token', async () => {
        const app = createTestApp();
        const token = await createValidToken(TEST_USER_ID);
        mockIsTokenBlacklisted.mockResolvedValue(true);

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Token has been revoked');
      });

      it('should allow non-blacklisted token', async () => {
        const app = createTestApp();
        const token = await createValidToken(TEST_USER_ID);
        mockIsTokenBlacklisted.mockResolvedValue(false);

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Token Validation', () => {
      it('should accept valid token and set userId', async () => {
        const app = createTestApp();
        const token = await createValidToken(TEST_USER_ID);

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.userId).toBe(TEST_USER_ID);
      });

      it('should return 401 for expired token', async () => {
        const app = createTestApp();
        const token = await createExpiredToken(TEST_USER_ID);

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Token has expired');
      });

      it('should return 401 for token without subject', async () => {
        const app = createTestApp();
        const token = await createTokenWithoutSubject();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toBe('Invalid token');
      });

      it('should return 401 for invalid signature', async () => {
        const app = createTestApp();
        const wrongSecret = new TextEncoder().encode('wrong-secret-key-that-is-at-least-32-characters');
        const token = await new jose.SignJWT({ sub: TEST_USER_ID })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('15m')
          .sign(wrongSecret);

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toBe('Invalid token');
      });

      it('should return 401 for malformed JWT', async () => {
        const app = createTestApp();

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer not-a-valid-jwt',
          },
        });

        expect(res.status).toBe(401);
      });

      it('should return 401 for JWT with tampered payload', async () => {
        const app = createTestApp();
        const token = await createValidToken(TEST_USER_ID);
        // Tamper with the token
        const parts = token.split('.');
        parts[1] = 'dGFtcGVyZWQ'; // base64 of "tampered"
        const tamperedToken = parts.join('.');

        const res = await app.request('/protected/data', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tamperedToken}`,
          },
        });

        expect(res.status).toBe(401);
      });
    });

    describe('Public Routes', () => {
      it('should allow access to public routes without auth', async () => {
        const app = createTestApp();

        const res = await app.request('/public', {
          method: 'GET',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });
  });

  // =========================================================================
  // adminOnly Middleware Tests
  // =========================================================================

  describe('adminOnly Middleware', () => {
    it('should return 401 if userId is not set', async () => {
      const app = createTestApp({ includeAdminMiddleware: true });

      const res = await app.request('/admin/dashboard', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin user', async () => {
      const app = createTestApp({ includeAdminMiddleware: true });
      const token = await createValidToken(TEST_USER_ID);
      mockConvexQuery.mockResolvedValue(false); // Not an admin

      const res = await app.request('/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('Admin access required');
    });

    it('should log unauthorized admin access attempts', async () => {
      const app = createTestApp({ includeAdminMiddleware: true });
      const token = await createValidToken(TEST_USER_ID);
      mockConvexQuery.mockResolvedValue(false);
      mockConvexMutation.mockResolvedValue(undefined);

      await app.request('/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(mockConvexMutation).toHaveBeenCalledWith(
        'audit:log',
        expect.objectContaining({
          action: 'admin.access.denied',
          resourceType: 'admin',
        })
      );
    });

    it('should allow admin user access', async () => {
      const app = createTestApp({ includeAdminMiddleware: true });
      const token = await createValidToken(TEST_USER_ID);
      mockConvexQuery.mockResolvedValue(true); // Is admin

      const res = await app.request('/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should return 500 on admin check error', async () => {
      const app = createTestApp({ includeAdminMiddleware: true });
      const token = await createValidToken(TEST_USER_ID);
      mockConvexQuery.mockRejectedValue(new Error('Database error'));

      const res = await app.request('/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // =========================================================================
  // Token Generation Tests
  // =========================================================================

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken(TEST_USER_ID);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should set default expiration to 15 minutes', async () => {
      const token = await generateToken(TEST_USER_ID);
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);

      expect(payload.sub).toBe(TEST_USER_ID);
      expect(payload.iss).toBe('pull-api');
      expect(payload.aud).toBe('pull-app');

      // Check expiration is roughly 15 minutes from now
      const exp = payload.exp as number;
      const iat = payload.iat as number;
      expect(exp - iat).toBeCloseTo(15 * 60, -1); // Within 10 seconds
    });

    it('should allow custom expiration', async () => {
      const token = await generateToken(TEST_USER_ID, '1h');
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);

      const exp = payload.exp as number;
      const iat = payload.iat as number;
      expect(exp - iat).toBeCloseTo(60 * 60, -1); // 1 hour
    });

    it('should include proper claims', async () => {
      const token = await generateToken(TEST_USER_ID);
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);

      expect(payload.iss).toBe('pull-api');
      expect(payload.aud).toBe('pull-app');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', async () => {
      const token = await generateRefreshToken(TEST_USER_ID);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should have longer expiration (7 days)', async () => {
      const token = await generateRefreshToken(TEST_USER_ID);
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);

      const exp = payload.exp as number;
      const iat = payload.iat as number;
      // 7 days = 604800 seconds
      expect(exp - iat).toBeCloseTo(7 * 24 * 60 * 60, -1);
    });

    it('should include refresh token type in payload', async () => {
      const token = await generateRefreshToken(TEST_USER_ID);
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);

      expect((payload as any).type).toBe('refresh');
    });
  });

  describe('verifyToken', () => {
    it('should verify and return userId for valid token', async () => {
      const token = await createValidToken(TEST_USER_ID);
      const result = await verifyToken(token);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(TEST_USER_ID);
    });

    it('should return null for expired token', async () => {
      const token = await createExpiredToken(TEST_USER_ID);
      const result = await verifyToken(token);

      expect(result).toBeNull();
    });

    it('should return null for invalid signature', async () => {
      const wrongSecret = new TextEncoder().encode('wrong-secret-key-that-is-at-least-32-characters');
      const token = await new jose.SignJWT({ sub: TEST_USER_ID })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('15m')
        .sign(wrongSecret);

      const result = await verifyToken(token);

      expect(result).toBeNull();
    });

    it('should return null for malformed token', async () => {
      const result = await verifyToken('not-a-valid-jwt');

      expect(result).toBeNull();
    });

    it('should return null for token without subject', async () => {
      const token = await createTokenWithoutSubject();
      const result = await verifyToken(token);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Token Expiry Constants Tests
  // =========================================================================

  describe('Token Expiry Constants', () => {
    it('should define ACCESS_TOKEN_EXPIRY as 15 minutes', () => {
      expect(ACCESS_TOKEN_EXPIRY).toBe(15 * 60);
    });

    it('should define REFRESH_TOKEN_EXPIRY as 7 days', () => {
      expect(REFRESH_TOKEN_EXPIRY).toBe(7 * 24 * 60 * 60);
    });
  });
});

// ===========================================================================
// Edge Cases and Security Tests
// ===========================================================================

describe('Auth Middleware Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTokenBlacklisted.mockResolvedValue(false);
  });

  describe('Token Timing Attacks', () => {
    it('should handle rapid consecutive requests', async () => {
      const app = createTestApp();
      const token = await createValidToken(TEST_USER_ID);

      const requests = Array(10).fill(null).map(() =>
        app.request('/protected/data', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      const responses = await Promise.all(requests);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Token Edge Cases', () => {
    it('should handle extremely long tokens', async () => {
      const app = createTestApp();
      const longToken = 'a'.repeat(10000);

      const res = await app.request('/protected/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${longToken}` },
      });

      expect(res.status).toBe(401);
    });

    it('should handle special characters in token', async () => {
      const app = createTestApp();
      const specialToken = 'token+with/special=chars';

      const res = await app.request('/protected/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${specialToken}` },
      });

      expect(res.status).toBe(401);
    });

    it('should handle null bytes in authorization header', async () => {
      const app = createTestApp();

      const res = await app.request('/protected/data', {
        method: 'GET',
        headers: { Authorization: 'Bearer token\x00with\x00nulls' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Concurrent Token Blacklist Checks', () => {
    it('should properly check blacklist for each request', async () => {
      const app = createTestApp();
      const token = await createValidToken(TEST_USER_ID);

      // First request - not blacklisted
      mockIsTokenBlacklisted.mockResolvedValueOnce(false);
      const res1 = await app.request('/protected/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res1.status).toBe(200);

      // Second request - now blacklisted
      mockIsTokenBlacklisted.mockResolvedValueOnce(true);
      const res2 = await app.request('/protected/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res2.status).toBe(401);
    });
  });
});
