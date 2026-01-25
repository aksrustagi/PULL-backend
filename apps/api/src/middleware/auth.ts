import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { Env } from "../index";
import { isTokenBlacklisted } from "../lib/redis";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

// Fail fast if JWT_SECRET is not configured
const jwtSecretValue = process.env.JWT_SECRET;
if (!jwtSecretValue) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is required. " +
    "Generate one with: openssl rand -base64 32"
  );
}
if (jwtSecretValue.length < 32) {
  throw new Error("FATAL: JWT_SECRET must be at least 32 characters long");
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretValue);

// Token expiry times in seconds
export const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing authorization header",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid authorization format. Expected: Bearer <token>",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Check if token is blacklisted (logged out)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Token has been revoked",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!payload.sub) {
      throw new Error("Invalid token: missing subject");
    }

    c.set("userId", payload.sub);
    await next();
  } catch (error) {
    const message =
      error instanceof jose.errors.JWTExpired
        ? "Token has expired"
        : "Invalid token";

    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      401
    );
  }
});

/**
 * Admin-only middleware
 * Verifies the user is authenticated and has admin privileges
 * Must be used after authMiddleware
 */
export const adminOnly = createMiddleware<Env>(async (c, next) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Check if user is an admin
    const isAdmin = await convex.query(api.admin.isAdmin, {
      id: userId as Id<"users">,
    });

    if (!isAdmin) {
      // Log unauthorized admin access attempt
      await convex.mutation(api.audit.log, {
        userId: userId as Id<"users">,
        action: "admin.access.denied",
        resourceType: "admin",
        resourceId: "dashboard",
        metadata: {
          requestPath: c.req.path,
          requestMethod: c.req.method,
        },
        requestId: c.get("requestId"),
      });

      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    await next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to verify admin status",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Generate a JWT token
 */
/**
 * Generate a JWT token with proper claims
 */
export async function generateToken(
  userId: string,
  expiresIn: string = "15m"
): Promise<string> {
  const token = await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("pull-api")
    .setAudience("pull-app")
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Generate a refresh token with longer expiry
 */
export async function generateRefreshToken(
  userId: string
): Promise<string> {
  const token = await new jose.SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("pull-api")
    .setAudience("pull-app")
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
