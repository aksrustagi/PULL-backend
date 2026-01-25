import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from "../middleware/auth";
import { blacklistToken, isTokenBlacklisted } from "../lib/redis";
import { convexUsers, convexAuth } from "../lib/convex";
import {
  generateSecureToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
} from "../lib/email";
import { getLogger } from "@pull/core/services";

const logger = getLogger();

const app = new Hono();

// Password hashing configuration
const BCRYPT_ROUNDS = 12;

// Token expiry times
const EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000; // 1 hour

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a number"
    ),
  displayName: z.string().max(100).optional(),
  referralCode: z.string().max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().max(128),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a number"
    ),
});

/**
 * Register a new user
 */
app.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");
  const ipAddress = c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP");
  const userAgent = c.req.header("User-Agent");

  try {
    // Check if user already exists
    const existingUser = await convexAuth.getUserForAuth(body.email);
    if (existingUser) {
      return c.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: "An account with this email already exists",
          },
        },
        409
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    // Create user in Convex
    const userId = await convexUsers.create({
      email: body.email,
      authProvider: "email",
      displayName: body.displayName,
      referredBy: body.referralCode,
      passwordHash,
    });

    // Generate email verification token
    const verificationToken = generateSecureToken(32);
    const verificationExpiry = Date.now() + EMAIL_VERIFICATION_EXPIRY;

    await convexAuth.createEmailVerificationToken({
      userId: userId as string,
      token: verificationToken,
      expiresAt: verificationExpiry,
    });

    // Send verification email (async, don't block response)
    sendVerificationEmail(body.email, verificationToken, body.displayName).catch(
      (err) => logger.error("[Auth] Failed to send verification email:", err)
    );

    // Generate tokens
    const token = await generateToken(userId as string);
    const refreshToken = await generateRefreshToken(userId as string);

    // Record successful registration
    await convexAuth.recordLoginAttempt({
      userId: userId as string,
      email: body.email,
      success: true,
      ipAddress,
      userAgent,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: userId,
          email: body.email,
          displayName: body.displayName,
          emailVerified: false,
          kycStatus: "pending",
          kycTier: "none",
        },
        token,
        refreshToken,
        message: "Account created. Please check your email to verify your account.",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Auth] Registration error:", error);

    // Check for duplicate email error from Convex
    if (error instanceof Error && error.message.includes("already exists")) {
      return c.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: "An account with this email already exists",
          },
        },
        409
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create account. Please try again.",
        },
      },
      500
    );
  }
});

/**
 * Login with email/password
 */
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const ipAddress = c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP");
  const userAgent = c.req.header("User-Agent");

  try {
    // Look up user by email
    const user = await convexAuth.getUserForAuth(body.email);

    if (!user) {
      // Record failed attempt (no user found)
      await convexAuth.recordLoginAttempt({
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "user_not_found",
      });

      // Use generic message to prevent email enumeration
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          },
        },
        401
      );
    }

    // Check if user has a password (might be OAuth-only account)
    if (!user.passwordHash) {
      await convexAuth.recordLoginAttempt({
        userId: user.id,
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
            code: "UNAUTHORIZED",
            message: "This account uses social login. Please sign in with Google or Apple.",
          },
        },
        401
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(body.password, user.passwordHash);

    if (!passwordValid) {
      await convexAuth.recordLoginAttempt({
        userId: user.id,
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
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          },
        },
        401
      );
    }

    // Check account status
    if (user.status === "suspended") {
      await convexAuth.recordLoginAttempt({
        userId: user.id,
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
            code: "FORBIDDEN",
            message: "Your account has been suspended. Please contact support.",
          },
        },
        403
      );
    }

    if (user.status === "closed") {
      await convexAuth.recordLoginAttempt({
        userId: user.id,
        email: body.email,
        success: false,
        ipAddress,
        userAgent,
        failureReason: "account_closed",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "This account has been closed.",
          },
        },
        403
      );
    }

    // Generate tokens
    const token = await generateToken(user.id);
    const refreshToken = await generateRefreshToken(user.id);

    // Record successful login
    await convexAuth.recordLoginAttempt({
      userId: user.id,
      email: body.email,
      success: true,
      ipAddress,
      userAgent,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          kycStatus: user.kycStatus,
          kycTier: user.kycTier,
        },
        token,
        refreshToken,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Auth] Login error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Login failed. Please try again.",
        },
      },
      500
    );
  }
});

/**
 * Refresh token
 */
app.post("/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing token" },
      },
      401
    );
  }

  const oldToken = authHeader.slice(7);

  // Check if token is blacklisted
  const blacklisted = await isTokenBlacklisted(oldToken);
  if (blacklisted) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
      },
      401
    );
  }

  const result = await verifyToken(oldToken);

  if (!result?.userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      },
      401
    );
  }

  // Verify user still exists and is active
  const user = await convexAuth.getUserById(result.userId);
  if (!user || user.status !== "active") {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User account is not active" },
      },
      401
    );
  }

  // Blacklist the old token
  await blacklistToken(oldToken, REFRESH_TOKEN_EXPIRY);

  // Generate new tokens
  const token = await generateToken(result.userId);
  const refreshToken = await generateRefreshToken(result.userId);

  return c.json({
    success: true,
    data: { token, refreshToken },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Logout - blacklist the current token
 */
app.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Blacklist the token with TTL matching access token expiry
    await blacklistToken(token, ACCESS_TOKEN_EXPIRY);

    // If there's a refresh token in the body, blacklist that too
    try {
      const body = await c.req.json().catch(() => ({}));
      if (body.refreshToken) {
        await blacklistToken(body.refreshToken, REFRESH_TOKEN_EXPIRY);
      }
    } catch {
      // Ignore body parsing errors
    }
  }

  return c.json({
    success: true,
    data: { message: "Logged out successfully" },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Request password reset
 */
app.post(
  "/forgot-password",
  zValidator("json", z.object({ email: z.string().email().max(254) })),
  async (c) => {
    const { email } = c.req.valid("json");

    try {
      // Look up user (but always return success to prevent enumeration)
      const user = await convexAuth.getUserForAuth(email);

      if (user && user.passwordHash) {
        // Generate reset token
        const resetToken = generateSecureToken(32);
        const resetExpiry = Date.now() + PASSWORD_RESET_EXPIRY;

        await convexAuth.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt: resetExpiry,
        });

        // Send reset email (async, don't block response)
        sendPasswordResetEmail(email, resetToken, user.displayName).catch((err) =>
          logger.error("[Auth] Failed to send password reset email:", err)
        );
      }

      // Always return success to prevent email enumeration
      return c.json({
        success: true,
        data: {
          message: "If an account exists with this email, a password reset link will be sent.",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("[Auth] Forgot password error:", error);
      // Still return success to prevent enumeration
      return c.json({
        success: true,
        data: {
          message: "If an account exists with this email, a password reset link will be sent.",
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Reset password with token
 */
app.post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
  const { token, password } = c.req.valid("json");

  try {
    // Validate token
    const result = await convexAuth.validatePasswordResetToken(token);

    if (!result.valid || !result.userId) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: result.error ?? "Invalid or expired reset token",
          },
        },
        400
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update password
    await convexAuth.updatePassword({
      userId: result.userId,
      passwordHash,
    });

    // Get user for email
    const user = await convexAuth.getUserById(result.userId);

    // Send password changed confirmation email
    if (user) {
      sendPasswordChangedEmail(user.email, user.displayName).catch((err) =>
        logger.error("[Auth] Failed to send password changed email:", err)
      );
    }

    return c.json({
      success: true,
      data: {
        message: "Password has been reset successfully. You can now log in with your new password.",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Auth] Reset password error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to reset password. Please try again.",
        },
      },
      500
    );
  }
});

/**
 * Verify email with token
 */
app.post(
  "/verify-email",
  zValidator("json", z.object({ token: z.string().min(1) })),
  async (c) => {
    const { token } = c.req.valid("json");

    try {
      const result = await convexAuth.validateEmailVerificationToken(token);

      if (!result.valid) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_TOKEN",
              message: result.error ?? "Invalid or expired verification token",
            },
          },
          400
        );
      }

      // Send welcome email
      if (result.email) {
        sendWelcomeEmail(result.email, result.displayName).catch((err) =>
          logger.error("[Auth] Failed to send welcome email:", err)
        );
      }

      return c.json({
        success: true,
        data: {
          message: "Email verified successfully!",
          userId: result.userId,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("[Auth] Email verification error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to verify email. Please try again.",
          },
        },
        500
      );
    }
  }
);

/**
 * Resend verification email
 */
app.post(
  "/resend-verification",
  zValidator("json", z.object({ email: z.string().email().max(254) })),
  async (c) => {
    const { email } = c.req.valid("json");

    try {
      const user = await convexAuth.getUserForAuth(email);

      if (!user) {
        // Don't reveal if user exists
        return c.json({
          success: true,
          data: {
            message: "If an unverified account exists with this email, a verification link will be sent.",
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (user.emailVerified) {
        return c.json(
          {
            success: false,
            error: {
              code: "ALREADY_VERIFIED",
              message: "This email is already verified.",
            },
          },
          400
        );
      }

      // Check if can resend (rate limiting)
      const canResend = await convexAuth.canResendVerificationEmail(user.id);
      if (!canResend.canResend) {
        return c.json(
          {
            success: false,
            error: {
              code: "RATE_LIMITED",
              message: canResend.reason ?? "Please wait before requesting another verification email.",
            },
          },
          429
        );
      }

      // Generate new verification token
      const verificationToken = generateSecureToken(32);
      const verificationExpiry = Date.now() + EMAIL_VERIFICATION_EXPIRY;

      await convexAuth.createEmailVerificationToken({
        userId: user.id,
        token: verificationToken,
        expiresAt: verificationExpiry,
      });

      // Send verification email
      await sendVerificationEmail(email, verificationToken, user.displayName);

      return c.json({
        success: true,
        data: {
          message: "Verification email sent. Please check your inbox.",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("[Auth] Resend verification error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to send verification email. Please try again.",
          },
        },
        500
      );
    }
  }
);

/**
 * Get current user info (requires auth)
 */
app.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing token" },
      },
      401
    );
  }

  const token = authHeader.slice(7);

  // Check if token is blacklisted
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
      },
      401
    );
  }

  const result = await verifyToken(token);

  if (!result?.userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      },
      401
    );
  }

  const user = await convexAuth.getUserById(result.userId);

  if (!user) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "User not found" },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        kycStatus: user.kycStatus,
        kycTier: user.kycTier,
        status: user.status,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Change password (requires auth)
 */
app.post(
  "/change-password",
  zValidator(
    "json",
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must be at most 128 characters")
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          "Password must contain uppercase, lowercase, and a number"
        ),
    })
  ),
  async (c) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        },
        401
      );
    }

    const token = authHeader.slice(7);

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
        },
        401
      );
    }

    const result = await verifyToken(token);

    if (!result?.userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
        },
        401
      );
    }

    const { currentPassword, newPassword } = c.req.valid("json");

    try {
      // Get user with password
      const user = await convexAuth.getUserForAuth(
        // We need to get email first
        (await convexAuth.getUserById(result.userId))?.email ?? ""
      );

      if (!user || !user.passwordHash) {
        return c.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: "Cannot change password for this account" },
          },
          400
        );
      }

      // Verify current password
      const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordValid) {
        return c.json(
          {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Current password is incorrect" },
          },
          401
        );
      }

      // Check new password is different
      const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
      if (samePassword) {
        return c.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: "New password must be different from current password" },
          },
          400
        );
      }

      // Hash and update password
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await convexAuth.updatePassword({
        userId: result.userId,
        passwordHash,
      });

      // Send password changed email
      sendPasswordChangedEmail(user.email, user.displayName).catch((err) =>
        logger.error("[Auth] Failed to send password changed email:", err)
      );

      // Blacklist current token to force re-login
      await blacklistToken(token, ACCESS_TOKEN_EXPIRY);

      return c.json({
        success: true,
        data: {
          message: "Password changed successfully. Please log in again.",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("[Auth] Change password error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to change password. Please try again.",
          },
        },
        500
      );
    }
  }
);

export { app as authRoutes };
