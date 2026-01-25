import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');
vi.stubEnv('CONVEX_URL', 'https://test.convex.cloud');

// Mock Convex client
const mockConvexMutation = vi.fn();
const mockConvexQuery = vi.fn();

vi.mock('../../../lib/convex', () => ({
  convex: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  },
  getConvexClient: vi.fn(() => ({
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  })),
  api: {
    users: {
      getByEmail: 'users:getByEmail',
      create: 'users:create',
      getById: 'users:getById',
    },
  },
}));

// Mock Redis
const mockRedis = {
  blacklistToken: vi.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
};

vi.mock('../../../lib/redis', () => mockRedis);

// Mock email service
vi.mock('@pull/core/services/resend', () => ({
  resendClient: {
    sendVerificationEmail: vi.fn().mockResolvedValue({ id: 'email-123' }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'email-123' }),
    sendEmail: vi.fn().mockResolvedValue({ id: 'email-123' }),
  },
}));

// Mock logger
vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('Auth Flow Integration Tests', () => {
  let app: Hono;
  let authRoutes: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConvexQuery.mockReset();
    mockConvexMutation.mockReset();
    
    // Dynamically import routes
    const routes = await import('../../../routes/auth');
    authRoutes = routes.authRoutes;
    
    app = new Hono();
    app.route('/auth', authRoutes);
  });

  describe('Complete Registration → Verification → Login Flow', () => {
    it('should complete full registration and login flow', async () => {
      // Step 1: Register a new user
      mockConvexQuery.mockResolvedValueOnce(null); // getByEmail returns null (user doesn't exist)
      mockConvexMutation.mockResolvedValueOnce('user_123'); // create user

      const registerRes = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      });

      // Registration should succeed
      expect(registerRes.status).toBe(201);
      const registerData = await registerRes.json();
      expect(registerData).toHaveProperty('success', true);
      expect(registerData).toHaveProperty('data');
      expect(registerData.data).toHaveProperty('accessToken');
      expect(registerData.data).toHaveProperty('refreshToken');

      // Step 2: Verify email (simulated - in reality would come from email link)
      // This would require a verification token from the email

      // Step 3: Login with credentials
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'newuser@example.com',
        passwordHash: '$2a$10$...',  // Mocked hash
        emailVerified: true,
        status: 'active',
      });

      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'Password123!',
        }),
      });

      // Login should succeed
      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData).toHaveProperty('success', true);
      expect(loginData.data).toHaveProperty('accessToken');
      expect(loginData.data).toHaveProperty('user');
    });

    it('should prevent duplicate registration', async () => {
      // User already exists
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'existing@example.com',
      });

      const registerRes = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'Password123!',
        }),
      });

      expect(registerRes.status).toBe(409);
      const data = await registerRes.json();
      expect(data.success).toBe(false);
      expect(data.error).toHaveProperty('code', 'EMAIL_ALREADY_EXISTS');
    });

    it('should enforce password validation', async () => {
      const weakPasswords = [
        'short',           // Too short
        'alllowercase',    // No uppercase
        'ALLUPPERCASE',    // No lowercase
        'NoNumbers!',      // No numbers
      ];

      for (const password of weakPasswords) {
        const res = await app.request('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password,
          }),
        });

        expect(res.status).toBe(400);
      }
    });
  });

  describe('Login → Access Protected Route → Logout Flow', () => {
    it('should complete login and access flow', async () => {
      // Step 1: Login
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        passwordHash: '$2a$10$...',
        emailVerified: true,
        status: 'active',
      });

      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'Password123!',
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      const accessToken = loginData.data.accessToken;

      // Step 2: Access protected route would happen in actual app
      // (This would test middleware in a real scenario)

      // Step 3: Logout
      const logoutRes = await app.request('/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      expect(logoutRes.status).toBe(200);
      expect(mockRedis.blacklistToken).toHaveBeenCalledWith(
        accessToken,
        expect.any(Number)
      );
    });

    it('should fail login with wrong password', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        passwordHash: '$2a$10$...',
        emailVerified: true,
        status: 'active',
      });

      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword123!',
        }),
      });

      expect(loginRes.status).toBe(401);
      const data = await loginRes.json();
      expect(data.error).toHaveProperty('code', 'INVALID_CREDENTIALS');
    });

    it('should fail login for suspended account', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'suspended@example.com',
        passwordHash: '$2a$10$...',
        emailVerified: true,
        status: 'suspended',
      });

      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'suspended@example.com',
          password: 'Password123!',
        }),
      });

      expect(loginRes.status).toBe(403);
      const data = await loginRes.json();
      expect(data.error).toHaveProperty('code', 'ACCOUNT_SUSPENDED');
    });
  });

  describe('Token Refresh Flow', () => {
    it('should successfully refresh access token', async () => {
      // Mock valid refresh token
      mockRedis.isTokenBlacklisted.mockResolvedValueOnce(false);
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        status: 'active',
      });

      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'valid-refresh-token',
        }),
      });

      expect(refreshRes.status).toBe(200);
      const data = await refreshRes.json();
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('accessToken');
      expect(data.data).toHaveProperty('refreshToken');
    });

    it('should fail refresh with blacklisted token', async () => {
      // Token is blacklisted
      mockRedis.isTokenBlacklisted.mockResolvedValueOnce(true);

      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'blacklisted-token',
        }),
      });

      expect(refreshRes.status).toBe(401);
      const data = await refreshRes.json();
      expect(data.error).toHaveProperty('code', 'TOKEN_BLACKLISTED');
    });

    it('should blacklist old token after refresh', async () => {
      const oldRefreshToken = 'old-refresh-token';
      
      mockRedis.isTokenBlacklisted.mockResolvedValueOnce(false);
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        status: 'active',
      });

      await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: oldRefreshToken,
        }),
      });

      // Old token should be blacklisted
      expect(mockRedis.blacklistToken).toHaveBeenCalledWith(
        oldRefreshToken,
        expect.any(Number)
      );
    });
  });

  describe('Password Reset Flow', () => {
    it('should complete password reset flow', async () => {
      // Step 1: Request password reset
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
      });

      const forgotRes = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
        }),
      });

      expect(forgotRes.status).toBe(200);
      const forgotData = await forgotRes.json();
      expect(forgotData.success).toBe(true);

      // Step 2: Reset password with token (would come from email)
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        passwordResetToken: 'valid-reset-token',
        passwordResetExpires: Date.now() + 3600000, // 1 hour from now
      });
      mockConvexMutation.mockResolvedValueOnce(undefined); // update password

      const resetRes = await app.request('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          newPassword: 'NewPassword123!',
        }),
      });

      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);
    });

    it('should not reveal if email exists (anti-enumeration)', async () => {
      // Non-existent user
      mockConvexQuery.mockResolvedValueOnce(null);

      const forgotRes = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
        }),
      });

      // Should still return 200 to prevent enumeration
      expect(forgotRes.status).toBe(200);
      const data = await forgotRes.json();
      expect(data.success).toBe(true);
    });

    it('should fail reset with expired token', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        _id: 'user_123',
        email: 'user@example.com',
        passwordResetToken: 'expired-token',
        passwordResetExpires: Date.now() - 3600000, // 1 hour ago
      });

      const resetRes = await app.request('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        }),
      });

      expect(resetRes.status).toBe(400);
      const data = await resetRes.json();
      expect(data.error).toHaveProperty('code', 'INVALID_TOKEN');
    });
  });
});
