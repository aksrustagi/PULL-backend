/**
 * Authentication Routes for PULL API
 * Handles registration, login, token refresh, password reset, and wallet connect
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  generateTokenPair,
  verifyRefreshToken,
  generateSpecialToken,
  verifySpecialToken,
} from "../lib/jwt";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSecureToken,
} from "../lib/password";
import { convexUsers, convexAudit } from "../lib/convex";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2).max(50).optional(),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const walletConnectSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
  message: z.string().min(1, "Message is required"),
  signature: z.string().min(1, "Signature is required"),
  nonce: z.string().min(1, "Nonce is required"),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /auth/register
 * Register a new user with email and password
 */
app.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, displayName, referralCode } = c.req.valid("json");
  const requestId = c.get("requestId");

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Password does not meet requirements",
          details: passwordValidation.errors,
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      400
    );
  }

  try {
    // Check if user already exists
    const existingUser = await convexUsers.getByEmail(email);
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

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user in Convex
    const userId = await convexUsers.create({
      email: email.toLowerCase(),
      authProvider: "email",
      displayName,
      referredBy: referralCode,
      passwordHash,
    });

    // Generate tokens
    const tokens = await generateTokenPair(userId as string, { email });

    // Generate email verification token
    const verificationToken = await generateSpecialToken(
      userId as string,
      "email_verification",
      "24h"
    );

    // Log audit event
    await convexAudit.log({
      userId: userId as string,
      action: "auth.register",
      resourceType: "users",
      resourceId: userId as string,
      ipAddress: c.req.header("X-Forwarded-For") ?? c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      requestId,
    });

    // TODO: Send verification email via Resend
    // await sendVerificationEmail(email, verificationToken);

    return c.json({
      success: true,
      data: {
        user: {
          id: userId,
          email,
          displayName,
          emailVerified: false,
          kycStatus: "pending",
          kycTier: "none",
        },
        tokens,
        verificationToken, // In production, remove this and send via email
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Registration error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: "Failed to create account",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /auth/login
 * Login with email and password
 */
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const requestId = c.get("requestId");

  try {
    // Find user by email
    const user = (await convexUsers.getByEmail(email)) as {
      _id: string;
      email: string;
      displayName?: string;
      passwordHash?: string;
      status: string;
      emailVerified: boolean;
      kycStatus: string;
      kycTier: string;
    } | null;

    if (!user) {
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

    // Check if user is active
    if (user.status !== "active") {
      return c.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_INACTIVE",
            message: "Your account is not active. Please contact support.",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    // Verify password
    if (!user.passwordHash) {
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

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      // Log failed attempt
      await convexAudit.log({
        userId: user._id,
        action: "auth.login_failed",
        resourceType: "users",
        resourceId: user._id,
        metadata: { reason: "invalid_password" },
        ipAddress: c.req.header("X-Forwarded-For"),
        userAgent: c.req.header("User-Agent"),
        requestId,
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

    // Generate tokens
    const tokens = await generateTokenPair(user._id, {
      email: user.email,
      tier: user.kycTier,
    });

    // Update last login
    await convexUsers.updateLastLogin(user._id);

    // Log successful login
    await convexAudit.log({
      userId: user._id,
      action: "auth.login",
      resourceType: "users",
      resourceId: user._id,
      ipAddress: c.req.header("X-Forwarded-For"),
      userAgent: c.req.header("User-Agent"),
      requestId,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          kycStatus: user.kycStatus,
          kycTier: user.kycTier,
        },
        tokens,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "LOGIN_FAILED",
          message: "Login failed",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
app.post("/refresh", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  const requestId = c.get("requestId");

  try {
    // Verify refresh token
    const tokenData = await verifyRefreshToken(refreshToken);
    if (!tokenData) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid or expired refresh token",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Get user to ensure they still exist and are active
    const user = (await convexUsers.getById(tokenData.userId)) as {
      _id: string;
      email: string;
      status: string;
      kycTier: string;
    } | null;

    if (!user || user.status !== "active") {
      return c.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found or inactive",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    // Generate new token pair (rotate refresh token)
    const tokens = await generateTokenPair(user._id, {
      email: user.email,
      tier: user.kycTier,
    });

    return c.json({
      success: true,
      data: { tokens },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Token refresh error:", error);
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
 * POST /auth/logout
 * Logout and invalidate tokens
 */
app.post("/logout", async (c) => {
  const requestId = c.get("requestId");

  // In a full implementation, we would:
  // 1. Add the refresh token to a blacklist in Redis
  // 2. Clear any server-side session data

  return c.json({
    success: true,
    data: { message: "Logged out successfully" },
    requestId,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /auth/verify-email
 * Verify user's email address
 */
app.post("/verify-email", zValidator("json", verifyEmailSchema), async (c) => {
  const { token } = c.req.valid("json");
  const requestId = c.get("requestId");

  try {
    // Verify the token
    const tokenData = await verifySpecialToken(token, "email_verification");
    if (!tokenData) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid or expired verification token",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    // Update user email verification status
    await convexUsers.verifyEmail(tokenData.userId);

    // Log audit event
    await convexAudit.log({
      userId: tokenData.userId,
      action: "auth.email_verified",
      resourceType: "users",
      resourceId: tokenData.userId,
      requestId,
    });

    return c.json({
      success: true,
      data: { message: "Email verified successfully" },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "VERIFICATION_FAILED",
          message: "Email verification failed",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /auth/forgot-password
 * Request password reset
 */
app.post(
  "/forgot-password",
  zValidator("json", forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    const requestId = c.get("requestId");

    try {
      // Always return success to prevent email enumeration
      const user = (await convexUsers.getByEmail(email)) as {
        _id: string;
        status: string;
      } | null;

      if (user && user.status === "active") {
        // Generate reset token
        const resetToken = await generateSpecialToken(
          user._id,
          "password_reset",
          "1h"
        );

        // Log the reset request
        await convexAudit.log({
          userId: user._id,
          action: "auth.password_reset_requested",
          resourceType: "users",
          resourceId: user._id,
          ipAddress: c.req.header("X-Forwarded-For"),
          requestId,
        });

        // TODO: Send password reset email via Resend
        // await sendPasswordResetEmail(email, resetToken);

        console.log("Password reset token:", resetToken); // Remove in production
      }

      // Always return the same response
      return c.json({
        success: true,
        data: {
          message:
            "If an account exists with this email, a password reset link will be sent",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      return c.json({
        success: true,
        data: {
          message:
            "If an account exists with this email, a password reset link will be sent",
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /auth/reset-password
 * Reset password with token
 */
app.post(
  "/reset-password",
  zValidator("json", resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");
    const requestId = c.get("requestId");

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Password does not meet requirements",
            details: passwordValidation.errors,
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    try {
      // Verify the reset token
      const tokenData = await verifySpecialToken(token, "password_reset");
      if (!tokenData) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_TOKEN",
              message: "Invalid or expired reset token",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          400
        );
      }

      // Hash new password
      const passwordHash = await hashPassword(password);

      // Update user password
      await convexUsers.update({
        id: tokenData.userId,
        passwordHash,
      });

      // Log audit event
      await convexAudit.log({
        userId: tokenData.userId,
        action: "auth.password_reset",
        resourceType: "users",
        resourceId: tokenData.userId,
        ipAddress: c.req.header("X-Forwarded-For"),
        requestId,
      });

      // TODO: Invalidate all existing sessions for this user in Redis

      return c.json({
        success: true,
        data: { message: "Password reset successfully" },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Password reset error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "RESET_FAILED",
            message: "Password reset failed",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

/**
 * POST /auth/wallet-connect
 * Connect or login with wallet (SIWE - Sign In With Ethereum)
 */
app.post(
  "/wallet-connect",
  zValidator("json", walletConnectSchema),
  async (c) => {
    const { address, message, signature, nonce } = c.req.valid("json");
    const requestId = c.get("requestId");

    try {
      // Verify SIWE signature
      const isValid = await verifySIWESignature(address, message, signature, nonce);

      if (!isValid) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_SIGNATURE",
              message: "Invalid wallet signature",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          401
        );
      }

      // Check if wallet is already linked to an account
      let user = (await convexUsers.getByWalletAddress(address)) as {
        _id: string;
        email: string;
        status: string;
        kycTier: string;
      } | null;

      if (user) {
        // Existing user - login
        if (user.status !== "active") {
          return c.json(
            {
              success: false,
              error: {
                code: "ACCOUNT_INACTIVE",
                message: "Your account is not active",
              },
              requestId,
              timestamp: new Date().toISOString(),
            },
            403
          );
        }

        const tokens = await generateTokenPair(user._id, {
          tier: user.kycTier,
        });

        await convexUsers.updateLastLogin(user._id);

        await convexAudit.log({
          userId: user._id,
          action: "auth.wallet_login",
          resourceType: "users",
          resourceId: user._id,
          metadata: { walletAddress: address },
          ipAddress: c.req.header("X-Forwarded-For"),
          requestId,
        });

        return c.json({
          success: true,
          data: {
            user: {
              id: user._id,
              walletAddress: address,
            },
            tokens,
            isNewUser: false,
          },
          requestId,
          timestamp: new Date().toISOString(),
        });
      } else {
        // New user - create account
        const userId = await convexUsers.create({
          email: `${address.toLowerCase()}@wallet.pull.app`, // Placeholder email
          authProvider: "wallet",
          walletAddress: address.toLowerCase(),
        });

        const tokens = await generateTokenPair(userId as string, {});

        await convexAudit.log({
          userId: userId as string,
          action: "auth.wallet_register",
          resourceType: "users",
          resourceId: userId as string,
          metadata: { walletAddress: address },
          ipAddress: c.req.header("X-Forwarded-For"),
          requestId,
        });

        return c.json({
          success: true,
          data: {
            user: {
              id: userId,
              walletAddress: address,
            },
            tokens,
            isNewUser: true,
          },
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Wallet connect error:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "WALLET_CONNECT_FAILED",
            message: "Failed to connect wallet",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

/**
 * GET /auth/me
 * Get current user profile (requires auth)
 */
app.get("/me", async (c) => {
  const requestId = c.get("requestId");
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const user = await convexUsers.getById(userId);

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { user },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get user error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch user profile",
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /auth/nonce
 * Get a nonce for SIWE signature
 */
app.get("/nonce", async (c) => {
  const requestId = c.get("requestId");
  const nonce = generateSecureToken(16);

  // In production, store nonce with expiry in Redis

  return c.json({
    success: true,
    data: { nonce },
    requestId,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify SIWE (Sign In With Ethereum) signature
 */
async function verifySIWESignature(
  address: string,
  message: string,
  signature: string,
  nonce: string
): Promise<boolean> {
  try {
    // Verify the message contains the expected nonce
    if (!message.includes(nonce)) {
      return false;
    }

    // Verify the message contains the expected address
    if (!message.toLowerCase().includes(address.toLowerCase())) {
      return false;
    }

    // Use viem to verify the signature
    try {
      const { recoverMessageAddress } = await import("viem");

      const recoveredAddress = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      });

      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch {
      // viem not available, return false for safety
      console.warn("viem not available for signature verification");
      return false;
    }
  } catch (error) {
    console.error("SIWE verification error:", error);
    return false;
  }
}

export { app as authRoutes };
