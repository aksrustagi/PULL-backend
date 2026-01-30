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

/**
 * Authenticated query - requires a valid user identity
 * Usage: export const myQuery = authenticatedQuery({ ... })
 */
export function authenticatedQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
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
export function authenticatedMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
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
 * Admin query - requires admin role
 */
export function adminQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: (ctx: QueryCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseQuery({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }

      // Check admin role from user record
      const userId = identity.subject;
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
        .first();

      if (!user) {
        throw new Error("User not found");
      }

      if (!["admin", "superadmin"].includes(user.role ?? "")) {
        throw new Error("Forbidden: Admin access required");
      }

      return config.handler({ ...ctx, userId } as QueryCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * Admin mutation - requires admin role
 */
export function adminMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: (ctx: MutationCtx & { userId: string }, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }

      // Check admin role from user record
      const userId = identity.subject;
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
        .first();

      if (!user) {
        throw new Error("User not found");
      }

      if (!["admin", "superadmin"].includes(user.role ?? "")) {
        throw new Error("Forbidden: Admin access required");
      }

      return config.handler({ ...ctx, userId } as MutationCtx & { userId: string }, args as Args);
    },
  });
}

/**
 * System mutation - for internal service-to-service calls only
 * Should be called with a service token, not a user token
 */
export function systemMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: (ctx: MutationCtx, args: Args) => Promise<Output>;
}) {
  return baseMutation({
    args: config.args,
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("System authentication required");
      }

      // Verify this is a service token with appropriate scope
      // Service tokens have a specific issuer or tokenUse claim
      const tokenUse = identity.tokenIdentifier?.includes("service:") ?? false;
      const isSystemToken = tokenUse || identity.issuer?.includes("system") || false;

      if (!isSystemToken) {
        // For now, also allow admin users to call system mutations
        const userId = identity.subject;
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
          .first();

        if (!user || !["admin", "superadmin"].includes(user.role ?? "")) {
          throw new Error("Forbidden: System or admin access required");
        }
      }

      return config.handler(ctx, args as Args);
    },
  });
}
