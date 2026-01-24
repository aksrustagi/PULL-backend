import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { Env } from "../index";
import { isTokenBlacklisted } from "../lib/redis";

const JWT_SECRET_STRING = process.env.JWT_SECRET;
if (!JWT_SECRET_STRING) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET_STRING.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

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
 * Generate a JWT token
 */
export async function generateToken(
  userId: string,
  expiresIn: string = "7d"
): Promise<string> {
  const token = await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
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
