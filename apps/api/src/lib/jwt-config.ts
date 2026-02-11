/**
 * Configuration and validation for JWT keys
 *
 * RS256 (asymmetric) signing:
 * - Private key signs tokens (API server only)
 * - Public key verifies tokens (any service)
 * - If private key leaks from a verifier, tokens remain secure
 *
 * Key generation:
 *   openssl genrsa -out jwt-private.pem 2048
 *   openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
 *
 * Fallback: HS256 with shared secret (development only)
 */

import * as jose from "jose";

// Determine signing algorithm
const JWT_ALGORITHM = (process.env.JWT_ALGORITHM as "RS256" | "HS256") || "RS256";

// RS256 key material
const JWT_PRIVATE_KEY_PEM = process.env.JWT_PRIVATE_KEY;
const JWT_PUBLIC_KEY_PEM = process.env.JWT_PUBLIC_KEY;

// HS256 fallback (development only)
const JWT_SECRET_STRING = process.env.JWT_SECRET;

let PRIVATE_KEY: jose.KeyLike | Uint8Array;
let PUBLIC_KEY: jose.KeyLike | Uint8Array;
let ALGORITHM: "RS256" | "HS256";

// Initialize keys based on algorithm
async function initializeKeys(): Promise<void> {
  if (JWT_ALGORITHM === "RS256" && JWT_PRIVATE_KEY_PEM && JWT_PUBLIC_KEY_PEM) {
    ALGORITHM = "RS256";
    PRIVATE_KEY = await jose.importPKCS8(JWT_PRIVATE_KEY_PEM, "RS256");
    PUBLIC_KEY = await jose.importSPKI(JWT_PUBLIC_KEY_PEM, "RS256");
  } else if (JWT_SECRET_STRING) {
    if (process.env.NODE_ENV === "production" && JWT_ALGORITHM === "RS256") {
      throw new Error(
        "FATAL: RS256 keys (JWT_PRIVATE_KEY, JWT_PUBLIC_KEY) are required in production. " +
        "Generate with: openssl genrsa -out jwt-private.pem 2048 && openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem"
      );
    }
    if (JWT_SECRET_STRING.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
    ALGORITHM = "HS256";
    const secret = new TextEncoder().encode(JWT_SECRET_STRING);
    PRIVATE_KEY = secret;
    PUBLIC_KEY = secret;
  } else {
    throw new Error(
      "FATAL: JWT keys not configured. Set JWT_PRIVATE_KEY + JWT_PUBLIC_KEY for RS256, or JWT_SECRET for HS256 (dev only)."
    );
  }
}

// Eagerly initialize - will be awaited on first use
const keysReady = initializeKeys();

export async function getSigningKey(): Promise<jose.KeyLike | Uint8Array> {
  await keysReady;
  return PRIVATE_KEY;
}

export async function getVerificationKey(): Promise<jose.KeyLike | Uint8Array> {
  await keysReady;
  return PUBLIC_KEY;
}

export async function getAlgorithm(): Promise<"RS256" | "HS256"> {
  await keysReady;
  return ALGORITHM;
}

export const JWT_ISSUER = "pull-api";
export const JWT_AUDIENCE = "pull-app";
export const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRY ?? "15m";
export const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY ?? "30d";

// Re-export for backward compatibility during migration
export const JWT_SECRET = JWT_SECRET_STRING
  ? new TextEncoder().encode(JWT_SECRET_STRING)
  : new Uint8Array(32);
