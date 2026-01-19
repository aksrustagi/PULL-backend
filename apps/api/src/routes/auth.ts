import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateToken } from "../middleware/auth";

const app = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Register a new user
 */
app.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  // TODO: Implement actual registration with Convex
  // This is a placeholder that shows the expected flow

  const userId = crypto.randomUUID(); // Would come from Convex

  const token = await generateToken(userId);

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
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Login with email/password
 */
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  // TODO: Implement actual login with Convex
  // This is a placeholder

  const userId = crypto.randomUUID();
  const token = await generateToken(userId);

  return c.json({
    success: true,
    data: {
      user: {
        id: userId,
        email: body.email,
      },
      token,
    },
    timestamp: new Date().toISOString(),
  });
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

  // TODO: Verify refresh token and generate new access token

  return c.json({
    success: true,
    data: {
      token: "new-access-token",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Logout
 */
app.post("/logout", async (c) => {
  // TODO: Invalidate token/session

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
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid("json");

    // TODO: Implement password reset flow

    return c.json({
      success: true,
      data: {
        message: "If an account exists, a reset link will be sent",
      },
      timestamp: new Date().toISOString(),
    });
  }
);

export { app as authRoutes };
