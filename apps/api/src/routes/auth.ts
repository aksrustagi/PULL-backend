import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { hash, compare } from "bcryptjs";
import * as jose from "jose";
import { generateToken, verifyToken } from "../middleware/auth";
import { convex, api } from "../lib/convex";
import { blacklistToken } from "../lib/redis";
import { resendClient } from "@pull/core/src/services/resend";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// SCHEMAS
// ============================================================================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  displayName: z.string().min(2).max(50).optional(),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const BCRYPT_SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY = "30d";
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Register a new user
 * POST /api/auth/register
 */
app.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  try {
    // Check if user already exists
    const existingUser = await convex.query(api.users.getByEmail, {
      email: body.email,
    });

    if (existingUser) {
      return c.json(
        {
          success: false,
          error: {
            code: "USER_EXISTS",
            message: "An account with this email already exists",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        409
      );
    }

    // Hash password with bcrypt
    const passwordHash = await hash(body.password, BCRYPT_SALT_ROUNDS);

    // Create user in Convex
    const userId = await convex.mutation(api.users.create, {
      email: body.email,
      passwordHash,
      displayName: body.displayName,
      authProvider: "email",
      referredBy: body.referralCode,
    });

    // Generate JWT token
    const token = await generateToken(userId, TOKEN_EXPIRY);

    // Get the created user for response
    const user = await convex.query(api.users.getById, { id: userId });

    if (!user) {
      throw new Error("Failed to retrieve created user");
    }

    // Record successful registration in audit log
    await convex.mutation(api.auth.recordLoginAttempt, {
      userId,
      email: body.email,
      success: true,
      ipAddress: c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP"),
      userAgent: c.req.header("User-Agent"),
    });

    return c.json(
      {
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            displayName: user.displayName,
            emailVerified: user.emailVerified,
            kycStatus: user.kycStatus,
            kycTier: user.kycTier,
            referralCode: user.referralCode,
            createdAt: new Date(user.createdAt).toISOString(),
          },
          token,
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      201
    );
  } catch (error) {
    console.error(`[${requestId}] Registration error:`, error);

    // Handle known Convex errors
    if (error instanceof Error) {
      if (error.message.includes("already exists")) {
        return c.json(
          {
            success: false,
            error: {
              code: "USER_EXISTS",
              message: "An account with this email already exists",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          409
        );
      }
    }

    return c.json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: "Failed to create account. Please try again.",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Login with email/password
 * POST /api/auth/login
 */
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const requestId = c.get("requestId");
  const ipAddress =
    c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP");
  const userAgent = c.req.header("User-Agent");

  try {
    // Get user credentials from Convex
    const credentials = await convex.query(api.auth.validateCredentials, {
      email: body.email,
    });

    // User not found - use generic error to prevent email enumeration
    if (!credentials) {
      await convex.mutation(api.auth.recordLoginAttempt, {
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "user_not_found",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Check if account is suspended
    if (credentials.status === "suspended") {
      await convex.mutation(api.auth.recordLoginAttempt, {
        userId: credentials.id,
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "account_suspended",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_SUSPENDED",
            message:
              "Your account has been suspended. Please contact support.",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    // Check if password exists (user might have OAuth-only account)
    if (!credentials.passwordHash) {
      await convex.mutation(api.auth.recordLoginAttempt, {
        userId: credentials.id,
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "no_password_set",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_AUTH_METHOD",
            message:
              "This account uses a different sign-in method. Please use the original sign-in method.",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Verify password with bcrypt
    const isValidPassword = await compare(body.password, credentials.passwordHash);

    if (!isValidPassword) {
      await convex.mutation(api.auth.recordLoginAttempt, {
        userId: credentials.id,
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "invalid_password",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Update last login timestamp
    await convex.mutation(api.users.updateLastLogin, { id: credentials.id });

    // Record successful login
    await convex.mutation(api.auth.recordLoginAttempt, {
      userId: credentials.id,
      email: body.email,
      success: true,
      ipAddress,
      userAgent,
    });

    // Generate JWT token
    const token = await generateToken(credentials.id, TOKEN_EXPIRY);

    // Get full user profile for response
    const user = await convex.query(api.users.getById, { id: credentials.id });

    if (!user) {
      throw new Error("Failed to retrieve user profile");
    }

    return c.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          username: user.username,
          avatarUrl: user.avatarUrl,
          emailVerified: user.emailVerified,
          kycStatus: user.kycStatus,
          kycTier: user.kycTier,
          referralCode: user.referralCode,
          lastLoginAt: user.lastLoginAt
            ? new Date(user.lastLoginAt).toISOString()
            : null,
        },
        token,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Login error:`, error);

    return c.json(
      {
        success: false,
        error: {
          code: "LOGIN_FAILED",
          message: "Login failed. Please try again.",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Refresh token
 * POST /api/auth/refresh
 */
app.post("/refresh", async (c) => {
  const requestId = c.get("requestId");
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid authorization header",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  const token = authHeader.substring(7);

  try {
    // Verify the current token
    const payload = await verifyToken(token);

    if (!payload) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Token is invalid or expired",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Verify user still exists and is active
    const user = await convex.query(api.users.getById, {
      id: payload.userId as any,
    });

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User account no longer exists",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    if (user.status === "suspended" || user.status === "closed") {
      return c.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_INACTIVE",
            message: "Your account is no longer active",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    // Generate new token with extended expiry
    const newToken = await generateToken(payload.userId, REFRESH_TOKEN_EXPIRY);

    return c.json({
      success: true,
      data: {
        token: newToken,
        expiresIn: REFRESH_TOKEN_EXPIRY,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Token refresh error:`, error);

    return c.json(
      {
        success: false,
        error: {
          code: "REFRESH_FAILED",
          message: "Failed to refresh token",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
app.post("/logout", async (c) => {
  const requestId = c.get("requestId");
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      // Decode the token to get the expiration time
      const decoded = jose.decodeJwt(token);

      if (decoded.exp) {
        // Calculate TTL (time remaining until token expires)
        const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));

        if (ttl > 0) {
          // Blacklist the token with TTL matching remaining expiry
          await blacklistToken(token, ttl);
        }
      }

      // Log the logout event
      const payload = await verifyToken(token);
      if (payload) {
        try {
          await convex.mutation(api.auth.recordLoginAttempt, {
            userId: payload.userId as any,
            email: "", // We don't have email in the token payload
            success: true,
            ipAddress:
              c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP"),
            userAgent: c.req.header("User-Agent"),
          });
        } catch {
          // Non-critical, don't fail the logout
        }
      }
    } catch (error) {
      // Token might be invalid or already expired, but we still acknowledge logout
      console.error(`[${requestId}] Error during logout:`, error);
    }
  }

  return c.json({
    success: true,
    data: {
      message: "Logged out successfully",
    },
    requestId,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
app.post(
  "/forgot-password",
  zValidator("json", forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    const requestId = c.get("requestId");

    try {
      // Check if user exists
      const user = await convex.query(api.users.getByEmail, { email });

      // Always return success to prevent email enumeration attacks
      // The actual email sending happens asynchronously

      if (user) {
        // Generate a secure reset token
        const resetToken = generateSecureToken();
        const expiresAt = Date.now() + PASSWORD_RESET_EXPIRY_MS;

        // Store the reset token in Convex
        await convex.mutation(api.auth.createPasswordResetToken, {
          userId: user._id,
          token: resetToken,
          expiresAt,
        });

        // Send password reset email via Resend
        await resendClient.sendPasswordResetEmail(email, resetToken);

        console.log(
          `[${requestId}] Password reset email sent to ${email}`
        );
      } else {
        // Log attempt for non-existent user (for security monitoring)
        console.log(
          `[${requestId}] Password reset requested for non-existent email: ${email}`
        );
      }

      // Always return the same response to prevent enumeration
      return c.json({
        success: true,
        data: {
          message:
            "If an account exists with this email, you will receive a password reset link shortly.",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[${requestId}] Password reset error:`, error);

      // Still return success to prevent enumeration
      return c.json({
        success: true,
        data: {
          message:
            "If an account exists with this email, you will receive a password reset link shortly.",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Reset password with token
 * POST /api/auth/reset-password
 */
app.post(
  "/reset-password",
  zValidator("json", resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");
    const requestId = c.get("requestId");

    try {
      // Validate the reset token in Convex
      const validationResult = await convex.mutation(
        api.auth.validatePasswordResetToken,
        { token }
      );

      if (!validationResult.valid) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_TOKEN",
              message:
                validationResult.error === "Token expired"
                  ? "This password reset link has expired. Please request a new one."
                  : validationResult.error === "Token already used"
                  ? "This password reset link has already been used. Please request a new one."
                  : "Invalid password reset token. Please request a new one.",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          400
        );
      }

      // Hash the new password
      const passwordHash = await hash(password, BCRYPT_SALT_ROUNDS);

      // Update the user's password in Convex
      await convex.mutation(api.auth.updatePassword, {
        userId: validationResult.userId,
        passwordHash,
      });

      // Optionally blacklist all existing sessions for this user
      // This ensures the user has to log in again with the new password
      // Note: This would require fetching all active tokens for the user
      // For now, we just log the password change

      console.log(
        `[${requestId}] Password reset completed for user ${validationResult.userId}`
      );

      return c.json({
        success: true,
        data: {
          message:
            "Your password has been reset successfully. You can now log in with your new password.",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[${requestId}] Password reset error:`, error);

      return c.json(
        {
          success: false,
          error: {
            code: "RESET_FAILED",
            message: "Failed to reset password. Please try again.",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export { app as authRoutes };
