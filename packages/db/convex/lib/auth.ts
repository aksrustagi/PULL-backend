/**
 * Convex Authentication Middleware
 * All mutations/queries that access user data should use these wrappers.
 */

import {
  query as baseQuery,
  mutation as baseMutation,
  QueryCtx,
  MutationCtx,
} from "../_generated/server";
import type { PropertyValidators } from "convex/values";

/**
 * Authenticated query - requires a valid user identity
 * Usage: export const myQuery = authenticatedQuery({ ... })
 */
export function authenticatedQuery<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  handler: (ctx: QueryCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseQuery({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }
      const userId = identity.subject;
      return config.handler({ ...ctx, userId } as QueryCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * Authenticated mutation - requires a valid user identity
 * Usage: export const myMutation = authenticatedMutation({ ... })
 */
export function authenticatedMutation<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  handler: (ctx: MutationCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }
      const userId = identity.subject;
      return config.handler({ ...ctx, userId } as MutationCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * Check if a user is an admin based on explicit role assignment.
 *
 * SECURITY: Admin status is NEVER derived from email domain alone.
 * Email domain checks are only used as a secondary signal AFTER
 * verifying the user's email is verified. The primary check is
 * the explicit `role` field in the user document.
 */
async function checkIsAdmin(ctx: QueryCtx | MutationCtx, userId: string): Promise<boolean> {
  // Look up user by their auth subject ID
  const user = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("authId"), userId))
    .first();

  if (!user) {
    return false;
  }

  // PRIMARY CHECK: Explicit role assignment in the database
  // This is the authoritative source of admin status
  if (user.role === "admin" || user.role === "superadmin") {
    return true;
  }

  // SECONDARY CHECK: Admin email list (explicit allowlist, not domain-based)
  const adminEmails = process.env["ADMIN_EMAILS"]?.split(",").map(e => e.trim()) ?? [];
  if (adminEmails.includes(user.email)) {
    return true;
  }

  // TERTIARY CHECK: Email domain, BUT only if email is verified
  // This prevents registration with @pull.app email granting instant admin
  if (user.emailVerified === true) {
    const adminDomains = ["admin.pull.app"]; // Restricted to admin subdomain only
    const emailDomain = user.email.split("@")[1];
    if (emailDomain && adminDomains.includes(emailDomain)) {
      return true;
    }
  }

  // NOTE: kycTier "institutional" no longer grants admin access.
  // Institutional users get premium features, not admin panel access.
  // Admin access must be explicitly granted via the role field.

  return false;
}

/**
 * Admin query - requires admin role
 * Usage: export const myQuery = adminQuery({ ... })
 */
export function adminQuery<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  handler: (ctx: QueryCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseQuery({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }
      const userId = identity.subject;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) {
        throw new Error("Admin access required");
      }

      return config.handler({ ...ctx, userId } as QueryCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * Admin mutation - requires admin role
 */
export function adminMutation<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  handler: (ctx: MutationCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }
      const userId = identity.subject;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) {
        throw new Error("Admin access required");
      }

      return config.handler({ ...ctx, userId } as MutationCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * System mutation - for internal service-to-service calls only
 * Requires a service token with the "system" issuer claim.
 *
 * Service tokens are generated with:
 *   issuer: "pull-system"
 *   audience: "pull-internal"
 *   scope: specific operation scope
 *
 * This prevents user tokens from being used for system operations
 * and prevents system tokens from being used across scopes.
 */
export function systemMutation<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  scope?: string;
  handler: (ctx: MutationCtx, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("System authentication required");
      }

      // Verify this is a service token (not a regular user token)
      const issuer = identity.issuer;
      if (issuer !== "pull-system" && issuer !== "pull-api") {
        throw new Error(
          "System mutation requires a service token. User tokens cannot call system mutations."
        );
      }

      // Verify token has the required scope (if scope is specified)
      if (config.scope) {
        const tokenScopes = (identity.tokenIdentifier ?? "").split(",");
        const hasScope =
          tokenScopes.includes(config.scope) ||
          tokenScopes.includes("*"); // Wildcard scope for superadmin service tokens
        if (!hasScope) {
          throw new Error(
            `System mutation requires scope "${config.scope}". Token has: [${tokenScopes.join(", ")}]`
          );
        }
      }

      return config.handler(ctx, args as Args);
    },
  });
}
