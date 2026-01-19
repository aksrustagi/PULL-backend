/**
 * Authentication Routes
 *
 * Handles user registration, login, and token management.
 * Integrates with Temporal for KYC workflows.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { generateToken, refreshToken } from "../middleware/auth";
import { rateLimiters } from "../middleware/rate-limit";
import type { Env } from "../types";

const authRouter = new Hono<Env>();

// Clients
let temporal: TemporalClient | null = null;
let convex: ConvexHttpClient | null = null;

async function getTemporalClient(): Promise<TemporalClient> {
  if (!temporal) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    });
    temporal = new TemporalClient({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || "default",
    });
  }
  return temporal;
}

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const registerSchema = z.object({
  email: z.string().email(),
  referralCode: z.string().optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const loginSchema = z.object({
  email: z.string().email(),
});

const connectWalletSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string(),
  message: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Start registration flow
 * POST /auth/register
 */
authRouter.post(
  "/register",
  rateLimiters.auth,
  zValidator("json", registerSchema),
  async (c) => {
    const body = c.req.valid("json");
    const convex = getConvex();

    // Check if user already exists
    const existingUser = await convex.query(api.functions.users.exists, {
      email: body.email,
    });

    if (existingUser) {
      return c.json(
        {
          error: {
            message: "An account with this email already exists",
            code: "EMAIL_EXISTS",
            requestId: c.get("requestId"),
          },
        },
        409
      );
    }

    // Start onboarding workflow
    const temporal = await getTemporalClient();
    const workflowId = `onboarding-${body.email.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}`;

    const handle = await temporal.workflow.start("AccountCreationWorkflow", {
      taskQueue: "onboarding",
      workflowId,
      args: [
        {
          email: body.email,
          referralCode: body.referralCode,
          walletAddress: body.walletAddress,
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
          userAgent: c.req.header("user-agent"),
        },
      ],
    });

    return c.json({
      data: {
        message: "Verification email sent. Please check your inbox.",
        workflowId,
        email: body.email,
      },
    });
  }
);

/**
 * Verify email code
 * POST /auth/verify
 */
authRouter.post(
  "/verify",
  rateLimiters.auth,
  zValidator("json", verifyEmailSchema),
  async (c) => {
    const body = c.req.valid("json");
    const convex = getConvex();

    // Find the onboarding workflow for this email
    const temporal = await getTemporalClient();

    // Search for workflow (in production, you'd track this in a database)
    const workflows = temporal.workflow.list({
      query: `WorkflowId STARTS_WITH "onboarding-${body.email.replace(/[^a-zA-Z0-9]/g, "-")}"`,
    });

    let workflowHandle = null;
    for await (const workflow of workflows) {
      if (workflow.status.name === "RUNNING") {
        workflowHandle = temporal.workflow.getHandle(workflow.workflowId);
        break;
      }
    }

    if (!workflowHandle) {
      return c.json(
        {
          error: {
            message: "No pending verification found. Please register again.",
            code: "NO_PENDING_VERIFICATION",
            requestId: c.get("requestId"),
          },
        },
        404
      );
    }

    // Signal the workflow with verification code
    await workflowHandle.signal("emailVerified", { code: body.code });

    // Check workflow status
    const status = await workflowHandle.query("getOnboardingStatus");

    return c.json({
      data: {
        message: "Email verified successfully",
        status: status.step,
        nextStep: status.step === "kyc_pending" ? "Complete identity verification" : undefined,
      },
    });
  }
);

/**
 * Request login code (passwordless)
 * POST /auth/login
 */
authRouter.post(
  "/login",
  rateLimiters.auth,
  zValidator("json", loginSchema),
  async (c) => {
    const body = c.req.valid("json");
    const convex = getConvex();

    // Check if user exists
    const user = await convex.query(api.functions.users.getByEmail, {
      email: body.email,
    });

    if (!user) {
      // Don't reveal if email exists
      return c.json({
        data: {
          message: "If an account exists, a login code has been sent.",
        },
      });
    }

    // Send login code
    await convex.mutation(api.functions.auth.sendLoginCode, {
      email: body.email,
    });

    return c.json({
      data: {
        message: "If an account exists, a login code has been sent.",
      },
    });
  }
);

/**
 * Verify login code and get token
 * POST /auth/login/verify
 */
authRouter.post(
  "/login/verify",
  rateLimiters.auth,
  zValidator("json", verifyEmailSchema),
  async (c) => {
    const body = c.req.valid("json");
    const convex = getConvex();

    // Validate code
    const result = await convex.mutation(api.functions.auth.validateLoginCode, {
      email: body.email,
      code: body.code,
    });

    if (!result.valid) {
      return c.json(
        {
          error: {
            message: "Invalid or expired code",
            code: "INVALID_CODE",
            requestId: c.get("requestId"),
          },
        },
        401
      );
    }

    // Get user
    const user = await convex.query(api.functions.users.getByEmail, {
      email: body.email,
    });

    if (!user) {
      return c.json(
        {
          error: {
            message: "User not found",
            code: "USER_NOT_FOUND",
            requestId: c.get("requestId"),
          },
        },
        404
      );
    }

    // Record login
    const session = await convex.mutation(api.functions.users.recordLogin, {
      userId: user._id,
      deviceInfo: {
        type: getDeviceType(c.req.header("user-agent")),
        os: getOS(c.req.header("user-agent")),
        browser: getBrowser(c.req.header("user-agent")),
        ip: c.req.header("x-forwarded-for")?.split(",")[0] || "unknown",
      },
    });

    // Generate JWT
    const token = await generateToken({
      sub: user._id,
      email: user.email,
      accountId: user.accountId,
      kycTier: user.kycTier,
      kycStatus: user.kycStatus,
    });

    return c.json({
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          kycTier: user.kycTier,
          kycStatus: user.kycStatus,
          pointsBalance: user.pointsBalance,
        },
      },
    });
  }
);

/**
 * Refresh token
 * POST /auth/refresh
 */
authRouter.post("/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          message: "Token required",
          code: "TOKEN_REQUIRED",
          requestId: c.get("requestId"),
        },
      },
      401
    );
  }

  const token = authHeader.slice(7);
  const newToken = await refreshToken(token);

  if (!newToken) {
    return c.json(
      {
        error: {
          message: "Invalid or expired token",
          code: "INVALID_TOKEN",
          requestId: c.get("requestId"),
        },
      },
      401
    );
  }

  return c.json({
    data: {
      token: newToken,
    },
  });
});

/**
 * Connect wallet (for existing users)
 * POST /auth/wallet/connect
 */
authRouter.post(
  "/wallet/connect",
  zValidator("json", connectWalletSchema),
  async (c) => {
    const body = c.req.valid("json");

    // Verify signature
    const isValid = await verifyWalletSignature(
      body.walletAddress,
      body.message,
      body.signature
    );

    if (!isValid) {
      return c.json(
        {
          error: {
            message: "Invalid signature",
            code: "INVALID_SIGNATURE",
            requestId: c.get("requestId"),
          },
        },
        401
      );
    }

    const convex = getConvex();

    // Check if wallet is already connected to an account
    const existingUser = await convex.query(api.functions.users.getByWalletAddress, {
      walletAddress: body.walletAddress,
    });

    if (existingUser) {
      // Login with existing account
      const token = await generateToken({
        sub: existingUser._id,
        email: existingUser.email,
        accountId: existingUser.accountId,
        kycTier: existingUser.kycTier,
        kycStatus: existingUser.kycStatus,
      });

      return c.json({
        data: {
          token,
          user: {
            id: existingUser._id,
            email: existingUser.email,
            name: existingUser.name,
            walletAddress: existingUser.walletAddress,
          },
          isNewConnection: false,
        },
      });
    }

    // For new wallet, return a session to complete registration
    return c.json({
      data: {
        walletAddress: body.walletAddress,
        isNewConnection: true,
        message: "Wallet verified. Please complete registration with your email.",
      },
    });
  }
);

/**
 * Get current user
 * GET /auth/me
 */
authRouter.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          message: "Token required",
          code: "TOKEN_REQUIRED",
          requestId: c.get("requestId"),
        },
      },
      401
    );
  }

  // This would use auth middleware in practice
  return c.json({
    data: {
      message: "Use the protected /api routes for user data",
    },
  });
});

// =============================================================================
// HELPERS
// =============================================================================

async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const { verifyMessage } = await import("viem");
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return isValid;
  } catch {
    return false;
  }
}

function getDeviceType(userAgent?: string): string {
  if (!userAgent) return "unknown";
  if (/mobile/i.test(userAgent)) return "mobile";
  if (/tablet/i.test(userAgent)) return "tablet";
  return "desktop";
}

function getOS(userAgent?: string): string {
  if (!userAgent) return "unknown";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/mac/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  if (/android/i.test(userAgent)) return "Android";
  if (/ios|iphone|ipad/i.test(userAgent)) return "iOS";
  return "unknown";
}

function getBrowser(userAgent?: string): string {
  if (!userAgent) return "unknown";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/edge/i.test(userAgent)) return "Edge";
  return "unknown";
}

export { authRouter };
