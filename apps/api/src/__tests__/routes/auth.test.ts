/**
 * Auth Routes Tests
 * Comprehensive tests for authentication endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import bcrypt from "bcryptjs";

// Mock environment variables before importing auth routes
vi.stubEnv("JWT_SECRET", "test-secret-key-that-is-at-least-32-characters-long");

// Mock convex client
const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();

vi.mock("../../lib/convex", () => ({
  convex: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  },
  convexUsers: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  },
  convexAuth: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  },
  api: {
    users: {
      getByEmail: "users:getByEmail",
      create: "users:create",
      getById: "users:getById",
      update: "users:update",
    },
    auth: {
      storeVerificationToken: "auth:storeVerificationToken",
      verifyEmailToken: "auth:verifyEmailToken",
      storePasswordResetToken: "auth:storePasswordResetToken",
      verifyPasswordResetToken: "auth:verifyPasswordResetToken",
      updatePassword: "auth:updatePassword",
    },
  },
}));

// Mock auth middleware
const mockGenerateToken = vi.fn();
const mockGenerateRefreshToken = vi.fn();
const mockVerifyToken = vi.fn();

vi.mock("../../middleware/auth", () => ({
  generateToken: mockGenerateToken,
  generateRefreshToken: mockGenerateRefreshToken,
  verifyToken: mockVerifyToken,
  ACCESS_TOKEN_EXPIRY: 900,
  REFRESH_TOKEN_EXPIRY: 604800,
}));

// Mock Redis for token blacklisting
const mockBlacklistToken = vi.fn();
const mockIsTokenBlacklisted = vi.fn();

vi.mock("../../lib/redis", () => ({
  blacklistToken: mockBlacklistToken,
  isTokenBlacklisted: mockIsTokenBlacklisted,
}));

// Mock email functions
const mockSendVerificationEmail = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSendPasswordChangedEmail = vi.fn();
const mockSendWelcomeEmail = vi.fn();
const mockGenerateSecureToken = vi.fn();

vi.mock("../../lib/email", () => ({
  sendVerificationEmail: mockSendVerificationEmail,
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  sendPasswordChangedEmail: mockSendPasswordChangedEmail,
  sendWelcomeEmail: mockSendWelcomeEmail,
  generateSecureToken: mockGenerateSecureToken,
}));

// Mock logger
vi.mock("@pull/core/services", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("Auth Routes", () => {
  let app: Hono;
  let authRoutes: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks to default values
    mockGenerateToken.mockResolvedValue("mock-access-token");
    mockGenerateRefreshToken.mockResolvedValue("mock-refresh-token");
    mockVerifyToken.mockResolvedValue({ userId: "test-user-id" });
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockBlacklistToken.mockResolvedValue(undefined);
    mockGenerateSecureToken.mockReturnValue("mock-verification-token");
    mockSendVerificationEmail.mockResolvedValue({ id: "email-123" });
    mockSendPasswordResetEmail.mockResolvedValue({ id: "email-123" });
    mockSendPasswordChangedEmail.mockResolvedValue({ id: "email-123" });
    mockSendWelcomeEmail.mockResolvedValue({ id: "email-123" });

    // Import auth routes after mocks are set up
    const module = await import("../../routes/auth");
    authRoutes = module.authRoutes;

    app = new Hono();
    app.route("/auth", authRoutes);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // REGISTRATION TESTS
  // ==========================================================================

  describe("POST /auth/register", () => {
    const validRegistration = {
      email: "test@example.com",
      password: "Password123",
      displayName: "Test User",
    };

    it("should register a new user successfully", async () => {
      mockConvexQuery.mockResolvedValue(null); // User doesn't exist
      mockConvexMutation.mockResolvedValue({ _id: "user-123" });

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRegistration),
      });

      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain("verification");
    });

    it("should reject registration with invalid email format", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "invalid-email",
          password: "Password123",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject password less than 8 characters", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Short1",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject password without uppercase letter", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject password without lowercase letter", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "PASSWORD123",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject password without digit", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "PasswordOnly",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject registration for existing email", async () => {
      mockConvexQuery.mockResolvedValue({ _id: "existing-user" }); // User exists

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRegistration),
      });

      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("EMAIL_EXISTS");
    });

    it("should send verification email after registration", async () => {
      mockConvexQuery.mockResolvedValue(null);
      mockConvexMutation.mockResolvedValue({ _id: "user-123" });

      await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRegistration),
      });

      // Verification email should be sent asynchronously
      await new Promise((r) => setTimeout(r, 10));
      expect(mockSendVerificationEmail).toHaveBeenCalled();
    });

    it("should process valid referral code", async () => {
      mockConvexQuery
        .mockResolvedValueOnce(null) // User doesn't exist
        .mockResolvedValueOnce({ _id: "referrer-123" }); // Referrer exists
      mockConvexMutation.mockResolvedValue({ _id: "user-123" });

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validRegistration,
          referralCode: "VALID123",
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  // ==========================================================================
  // LOGIN TESTS
  // ==========================================================================

  describe("POST /auth/login", () => {
    const validLogin = {
      email: "test@example.com",
      password: "Password123",
    };

    const mockUser = {
      _id: "user-123",
      email: "test@example.com",
      passwordHash: bcrypt.hashSync("Password123", 10),
      status: "active",
      emailVerified: true,
    };

    it("should login successfully with valid credentials", async () => {
      mockConvexQuery.mockResolvedValue(mockUser);

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validLogin),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBe("mock-access-token");
      expect(json.data.refreshToken).toBe("mock-refresh-token");
      expect(json.data.tokenType).toBe("Bearer");
    });

    it("should reject login with invalid email", async () => {
      mockConvexQuery.mockResolvedValue(null); // User not found

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validLogin),
      });

      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("should reject login with wrong password", async () => {
      mockConvexQuery.mockResolvedValue(mockUser);

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "WrongPassword123",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("should reject login for suspended user", async () => {
      mockConvexQuery.mockResolvedValue({
        ...mockUser,
        status: "suspended",
      });

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validLogin),
      });

      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.code).toBe("ACCOUNT_SUSPENDED");
    });

    it("should require email and password", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("should update lastLoginAt on successful login", async () => {
      mockConvexQuery.mockResolvedValue(mockUser);

      await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validLogin),
      });

      expect(mockConvexMutation).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TOKEN REFRESH TESTS
  // ==========================================================================

  describe("POST /auth/refresh", () => {
    it("should refresh tokens with valid refresh token", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });
      mockIsTokenBlacklisted.mockResolvedValue(false);
      mockConvexQuery.mockResolvedValue({ _id: "user-123", status: "active" });

      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "valid-refresh-token" }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
    });

    it("should reject blacklisted refresh token", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });
      mockIsTokenBlacklisted.mockResolvedValue(true);

      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "blacklisted-token" }),
      });

      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("TOKEN_REVOKED");
    });

    it("should reject expired refresh token", async () => {
      mockVerifyToken.mockResolvedValue(null);

      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "expired-token" }),
      });

      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("INVALID_TOKEN");
    });

    it("should require refresh token in body", async () => {
      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // LOGOUT TESTS
  // ==========================================================================

  describe("POST /auth/logout", () => {
    it("should blacklist token on logout", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });

      const res = await app.request("/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-access-token",
        },
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockBlacklistToken).toHaveBeenCalled();
    });

    it("should require authorization header", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // PASSWORD RESET TESTS
  // ==========================================================================

  describe("POST /auth/forgot-password", () => {
    it("should send password reset email for existing user", async () => {
      mockConvexQuery.mockResolvedValue({ _id: "user-123", email: "test@example.com" });
      mockConvexMutation.mockResolvedValue(true);

      const res = await app.request("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should return success even for non-existent email (security)", async () => {
      mockConvexQuery.mockResolvedValue(null);

      const res = await app.request("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent@example.com" }),
      });

      const json = await res.json();

      // Should not reveal whether email exists
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should validate email format", async () => {
      const res = await app.request("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should reset password with valid token", async () => {
      mockConvexQuery.mockResolvedValue({ userId: "user-123", valid: true });
      mockConvexMutation.mockResolvedValue(true);

      const res = await app.request("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-reset-token",
          password: "NewPassword123",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should reject invalid reset token", async () => {
      mockConvexQuery.mockResolvedValue(null);

      const res = await app.request("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "invalid-token",
          password: "NewPassword123",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe("INVALID_TOKEN");
    });

    it("should validate new password requirements", async () => {
      const res = await app.request("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-token",
          password: "weak",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should send confirmation email after password reset", async () => {
      mockConvexQuery
        .mockResolvedValueOnce({ userId: "user-123", valid: true })
        .mockResolvedValueOnce({ _id: "user-123", email: "test@example.com" });
      mockConvexMutation.mockResolvedValue(true);

      await app.request("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-reset-token",
          password: "NewPassword123",
        }),
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSendPasswordChangedEmail).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // EMAIL VERIFICATION TESTS
  // ==========================================================================

  describe("POST /auth/verify-email", () => {
    it("should verify email with valid token", async () => {
      mockConvexQuery.mockResolvedValue({ userId: "user-123", valid: true });
      mockConvexMutation.mockResolvedValue(true);

      const res = await app.request("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-verification-token" }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should reject invalid verification token", async () => {
      mockConvexQuery.mockResolvedValue(null);

      const res = await app.request("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid-token" }),
      });

      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe("INVALID_TOKEN");
    });

    it("should send welcome email after verification", async () => {
      mockConvexQuery
        .mockResolvedValueOnce({ userId: "user-123", valid: true })
        .mockResolvedValueOnce({ _id: "user-123", email: "test@example.com" });
      mockConvexMutation.mockResolvedValue(true);

      await app.request("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-verification-token" }),
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSendWelcomeEmail).toHaveBeenCalled();
    });
  });

  describe("POST /auth/resend-verification", () => {
    it("should resend verification email", async () => {
      mockConvexQuery.mockResolvedValue({
        _id: "user-123",
        email: "test@example.com",
        emailVerified: false,
      });
      mockConvexMutation.mockResolvedValue(true);

      const res = await app.request("/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should not reveal if email is already verified", async () => {
      mockConvexQuery.mockResolvedValue({
        _id: "user-123",
        email: "test@example.com",
        emailVerified: true,
      });

      const res = await app.request("/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const json = await res.json();

      // Should return success to not reveal email verification status
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  // ==========================================================================
  // PASSWORD CHANGE TESTS (Authenticated)
  // ==========================================================================

  describe("POST /auth/change-password", () => {
    const mockUser = {
      _id: "user-123",
      email: "test@example.com",
      passwordHash: bcrypt.hashSync("OldPassword123", 10),
    };

    it("should change password with valid current password", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });
      mockConvexQuery.mockResolvedValue(mockUser);
      mockConvexMutation.mockResolvedValue(true);

      const res = await app.request("/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          currentPassword: "OldPassword123",
          newPassword: "NewPassword456",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should reject if current password is wrong", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });
      mockConvexQuery.mockResolvedValue(mockUser);

      const res = await app.request("/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          currentPassword: "WrongPassword123",
          newPassword: "NewPassword456",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("INVALID_PASSWORD");
    });

    it("should require authentication", async () => {
      const res = await app.request("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldPassword123",
          newPassword: "NewPassword456",
        }),
      });

      expect(res.status).toBe(401);
    });

    it("should validate new password requirements", async () => {
      mockVerifyToken.mockResolvedValue({ userId: "user-123" });
      mockConvexQuery.mockResolvedValue(mockUser);

      const res = await app.request("/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          currentPassword: "OldPassword123",
          newPassword: "weak",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================

  describe("Error Handling", () => {
    it("should return proper error format on validation errors", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid" }),
      });

      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it("should handle database errors gracefully", async () => {
      mockConvexQuery.mockRejectedValue(new Error("Database connection failed"));

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Password123",
        }),
      });

      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
    });
  });
});
