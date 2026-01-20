import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db";

/**
 * Convex HTTP Client for server-side API calls
 *
 * Uses the CONVEX_URL environment variable to connect to the Convex deployment.
 * This client is used for making queries and mutations from the Hono API routes.
 */

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  console.warn(
    "Warning: CONVEX_URL environment variable is not set. Convex operations will fail."
  );
}

/**
 * Singleton Convex HTTP client instance
 * Throws an error at runtime if CONVEX_URL is not configured
 */
export const convex = new ConvexHttpClient(CONVEX_URL ?? "https://placeholder.convex.cloud");

/**
 * Create a new Convex client (useful for isolated contexts or testing)
 */
export function createConvexClient(url?: string): ConvexHttpClient {
  const convexUrl = url ?? CONVEX_URL;
  if (!convexUrl) {
    throw new Error("CONVEX_URL environment variable is required");
  }
  return new ConvexHttpClient(convexUrl);
}

export { api };
