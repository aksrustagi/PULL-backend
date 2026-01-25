import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateToken, generateRefreshToken, verifyToken } from "../middleware/auth";

const app = new Hono();

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

/**
 * Register a new user
 */
app.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  // TODO: Replace with actual Convex implementation
  // For now, this demonstrates the correct flow:
  // 1. Check if user exists by email
  // 2. Hash password with bcrypt/argon2
  // 3. Create user record in database
  // 4. Send verification email
  // 5. Return token only after verification (or with limited permissions)

  // Placeholder: In production, hash with bcrypt/argon2
  // const passwordHash = await bcrypt.hash(body.password, 12);

  // Placeholder: Check for existing user
  // const existing = await convex.query("users.getByEmail", { email: body.email });
  // if (existing) return c.json({ success: false, error: { code: "CONFLICT", message: "Email already registered" } }, 409);

  const userId = crypto.randomUUID();
  const token = await generateToken(userId);
  const refreshToken = await generateRefreshToken(userId);

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
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Login with email/password
 */
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  // TODO: Replace with actual Convex implementation
  // 1. Look up user by email
  // 2. Verify password hash with bcrypt/argon2
  // 3. Check account status (not suspended/closed)
  // 4. Record login attempt for audit
  // 5. Return token

  // Placeholder: In production, verify against stored hash
  // const user = await convex.query("users.getByEmail", { email: body.email });
  // if (!user) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } }, 401);
  // const valid = await bcrypt.compare(body.password, user.passwordHash);
  // if (!valid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } }, 401);

  const userId = crypto.randomUUID();
  const token = await generateToken(userId);
  const refreshToken = await generateRefreshToken(userId);

  return c.json({
    success: true,
    data: {
      user: {
        id: userId,
        email: body.email,
      },
      token,
      refreshToken,
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

  const oldToken = authHeader.slice(7);
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

  const token = await generateToken(result.userId);
  const refreshToken = await generateRefreshToken(result.userId);

  return c.json({
    success: true,
    data: { token, refreshToken },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Logout
 */
app.post("/logout", async (c) => {
  // TODO: Add token to blacklist in Redis with TTL matching token expiry
  // This ensures tokens cannot be reused after logout
  // const token = c.req.header("Authorization")?.slice(7);
  // if (token) await redis.set(`blacklist:${token}`, "1", { ex: 900 }); // 15 min token expiry

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
    // Always return success to prevent email enumeration
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
