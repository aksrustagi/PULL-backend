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
      // TODO: Check admin role from user record
      const userId = identity.subject;
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
      // TODO: Verify this is a service token with appropriate scope
      return config.handler(ctx, args as Args);
    },
  });
}
