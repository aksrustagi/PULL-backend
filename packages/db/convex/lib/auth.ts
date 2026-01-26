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
 * Check if a user is an admin based on email domain or admin list
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

  // Check against admin email domains
  const adminDomains = ["pull.app", "admin.pull.app"];
  const emailDomain = user.email.split("@")[1];
  if (adminDomains.includes(emailDomain)) {
    return true;
  }

  // Check against specific admin emails (could be env var in production)
  const adminEmails = process.env["ADMIN_EMAILS"]?.split(",") ?? [];
  if (adminEmails.includes(user.email)) {
    return true;
  }

  // Check kycTier for institutional (highest tier)
  if (user.kycTier === "institutional") {
    return true;
  }

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
 * Should be called with a service token, not a user token
 */
export function systemMutation<Args extends Record<string, unknown>, Output>(config: {
  args: PropertyValidators;
  handler: (ctx: MutationCtx, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("System authentication required");
      }
      // TODO: Verify this is a service token with appropriate scope
      return config.handler(ctx, args as Args);
    },
  });
}
