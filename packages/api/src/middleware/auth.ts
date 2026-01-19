/**
 * Authentication Middleware
 *
 * Validates JWT tokens and attaches user context to requests.
 * Supports both session tokens and API keys.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Env } from "../types";

// Convex client singleton
let convex: ConvexHttpClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convex) {
    convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convex;
}

interface JWTPayload {
  sub: string; // User ID
  email: string;
  accountId: string;
  kycTier: string;
  kycStatus: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token
 */
async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // Simple JWT verification (in production, use a proper JWT library)
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    // Verify signature (simplified - use proper crypto in production)
    const crypto = await import("crypto");
    const signatureInput = `${parts[0]}.${parts[1]}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.JWT_SECRET!)
      .update(signatureInput)
      .digest("base64url");

    if (parts[2] !== expectedSignature) {
      return null;
    }

    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Authentication middleware
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  // Get authorization header
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    throw new HTTPException(401, {
      message: "Authorization header required",
    });
  }

  // Support both Bearer token and API key
  let token: string;
  let isApiKey = false;

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (authHeader.startsWith("ApiKey ")) {
    token = authHeader.slice(7);
    isApiKey = true;
  } else {
    throw new HTTPException(401, {
      message: "Invalid authorization format",
    });
  }

  if (isApiKey) {
    // Validate API key
    const convex = getConvex();
    const apiKeyData = await convex.query(api.functions.auth.validateApiKey, {
      key: token,
    });

    if (!apiKeyData) {
      throw new HTTPException(401, { message: "Invalid API key" });
    }

    // Set user context from API key
    c.set("userId", apiKeyData.userId);
    c.set("accountId", apiKeyData.accountId);
    c.set("email", apiKeyData.email);
    c.set("kycTier", apiKeyData.kycTier);
    c.set("kycStatus", apiKeyData.kycStatus);
    c.set("authMethod", "api_key");
  } else {
    // Validate JWT
    const payload = await verifyToken(token);

    if (!payload) {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    // Fetch fresh user data from Convex
    const convex = getConvex();
    const user = await convex.query(api.functions.users.getById, {
      id: payload.sub as any,
    });

    if (!user) {
      throw new HTTPException(401, { message: "User not found" });
    }

    // Set user context
    c.set("userId", payload.sub);
    c.set("accountId", payload.accountId);
    c.set("email", payload.email);
    c.set("kycTier", user.kycTier);
    c.set("kycStatus", user.kycStatus);
    c.set("authMethod", "jwt");
  }

  await next();
});

/**
 * Optional auth middleware - doesn't fail if no token
 */
export const optionalAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader) {
    try {
      await authMiddleware(c, next);
      return;
    } catch {
      // Ignore auth errors for optional auth
    }
  }

  await next();
});

/**
 * Admin auth middleware
 */
export const adminAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  // First, validate normal auth
  await authMiddleware(c, async () => {});

  // Then check admin status
  const userId = c.get("userId");
  const convex = getConvex();

  const isAdmin = await convex.query(api.functions.admin.isAdmin, {
    userId: userId as any,
  });

  if (!isAdmin) {
    throw new HTTPException(403, { message: "Admin access required" });
  }

  c.set("isAdmin", true);
  await next();
});

/**
 * Generate JWT token
 */
export async function generateToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  const crypto = await import("crypto");

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Refresh token
 */
export async function refreshToken(token: string): Promise<string | null> {
  const payload = await verifyToken(token);
  if (!payload) return null;

  // Generate new token with same claims
  return generateToken({
    sub: payload.sub,
    email: payload.email,
    accountId: payload.accountId,
    kycTier: payload.kycTier,
    kycStatus: payload.kycStatus,
  });
}
