import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables before importing auth routes
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');

// Mock convex client
vi.mock('../../lib/convex', () => ({
  convex: {
    query: vi.fn(),
    mutation: vi.fn(),
  },
  api: {
    users: {
      getByEmail: 'users:getByEmail',
      create: 'users:create',
    },
  },
}));

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  generateToken: vi.fn().mockResolvedValue('mock-token'),
  verifyToken: vi.fn().mockResolvedValue({ userId: 'test-user-id' }),
}));

// Mock Redis for token blacklisting
vi.mock('../../lib/redis', () => ({
  blacklistToken: vi.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
}));

// Mock Resend client
vi.mock('@pull/core/src/services/resend', () => ({
  resendClient: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'email-123' }),
    sendEmail: vi.fn().mockResolvedValue({ id: 'email-123' }),
  },
}));

// Import after mocks are set up
const { authRoutes } = await import('../../routes/auth');

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/auth', authRoutes);
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should validate email format', async () => {
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'Password123',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require password minimum length', async () => {
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should require email and password', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
