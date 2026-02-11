import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { Env } from "../index";
import { isTokenBlacklisted } from "../lib/redis";
import { convex, api } from "../lib/convex";
import { getVerificationKey, getAlgorithm } from "../lib/jwt-config";
import type { Id } from "@pull/db/convex/_generated/dataModel";

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

    // Verify with RS256 public key (or HS256 secret in dev)
    const [verificationKey, alg] = await Promise.all([
      getVerificationKey(),
      getAlgorithm(),
    ]);

    const { payload } = await jose.jwtVerify(token, verificationKey, {
      algorithms: [alg],
      issuer: "pull-api",
      audience: "pull-app",
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
 * Generate a JWT token with RS256
 */
export async function generateToken(
  userId: string,
  expiresIn: string = "15m"
): Promise<string> {
  const { getSigningKey, getAlgorithm: getAlg } = await import("../lib/jwt-config");
  const [signingKey, alg] = await Promise.all([getSigningKey(), getAlg()]);

  const token = await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer("pull-api")
    .setAudience("pull-app")
    .setExpirationTime(expiresIn)
    .sign(signingKey);

  return token;
}

/**
 * Generate a refresh token with longer expiry
 */
export async function generateRefreshToken(
  userId: string
): Promise<string> {
  const { getSigningKey, getAlgorithm: getAlg } = await import("../lib/jwt-config");
  const [signingKey, alg] = await Promise.all([getSigningKey(), getAlg()]);

  const token = await new jose.SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer("pull-api")
    .setAudience("pull-app")
    .setExpirationTime("7d")
    .sign(signingKey);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const [verificationKey, alg] = await Promise.all([
      getVerificationKey(),
      getAlgorithm(),
    ]);
    const { payload } = await jose.jwtVerify(token, verificationKey, {
      algorithms: [alg],
    });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
