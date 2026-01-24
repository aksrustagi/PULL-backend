/**
 * Configuration and validation for JWT secret
 */

// Validate JWT_SECRET at startup
const JWT_SECRET_STRING = process.env.JWT_SECRET;
if (!JWT_SECRET_STRING) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET_STRING.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}

export const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);
export const JWT_ISSUER = "pull-api";
export const JWT_AUDIENCE = "pull-app";
export const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRY ?? "15m";
export const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY ?? "30d";
