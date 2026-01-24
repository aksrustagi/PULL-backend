/**
 * JWT Token Utilities for PULL API
 * Handles access tokens, refresh tokens, and token verification
 */

import * as jose from "jose";
import {
  JWT_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from "./jwt-config";

/**
 * JWT Token Claims
 */
export interface TokenClaims {
  sub: string;
  email?: string;
  tier?: string;
  type: "access" | "refresh";
}

/**
 * Token pair returned on authentication
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
}

/**
 * Generate an access token for a user
 */
export async function generateAccessToken(
  userId: string,
  claims?: Partial<Omit<TokenClaims, "sub" | "type">>
): Promise<string> {
  const token = await new jose.SignJWT({
    sub: userId,
    type: "access",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Generate a refresh token for a user
 */
export async function generateRefreshToken(
  userId: string,
  sessionId?: string
): Promise<string> {
  const token = await new jose.SignJWT({
    sub: userId,
    type: "refresh",
    sid: sessionId ?? crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Generate a token pair (access + refresh tokens)
 */
export async function generateTokenPair(
  userId: string,
  claims?: Partial<Omit<TokenClaims, "sub" | "type">>
): Promise<TokenPair> {
  const sessionId = crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(userId, claims),
    generateRefreshToken(userId, sessionId),
  ]);

  // Calculate expiry in seconds
  const expiresIn = parseExpiry(ACCESS_TOKEN_EXPIRY);

  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: "Bearer",
  };
}

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; claims: jose.JWTPayload } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.sub || payload.type !== "access") {
      return null;
    }

    return { userId: payload.sub, claims: payload };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      console.debug("Access token expired");
    }
    return null;
  }
}

/**
 * Verify and decode a refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.sub || payload.type !== "refresh") {
      return null;
    }

    return {
      userId: payload.sub,
      sessionId: (payload.sid as string) ?? "",
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      console.debug("Refresh token expired");
    }
    return null;
  }
}

/**
 * Generate a short-lived token for specific purposes (email verification, password reset)
 */
export async function generateSpecialToken(
  userId: string,
  purpose: "email_verification" | "password_reset" | "wallet_connect",
  expiresIn: string = "1h"
): Promise<string> {
  const token = await new jose.SignJWT({
    sub: userId,
    purpose,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify a special token
 */
export async function verifySpecialToken(
  token: string,
  purpose: "email_verification" | "password_reset" | "wallet_connect"
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.sub || payload.purpose !== purpose) {
      return null;
    }

    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Parse expiry string to seconds
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // Default 15 minutes

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      return 900;
  }
}
