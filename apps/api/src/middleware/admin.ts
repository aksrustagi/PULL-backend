/**
 * Admin Authorization Middleware
 * Enforces role-based access control for admin routes
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { getConvexClient, api } from "../lib/convex";
import { getLogger } from "@pull/core/services";

const logger = getLogger();

/**
 * User roles in order of privilege
 */
export type UserRole = "user" | "moderator" | "admin" | "superadmin";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

/**
 * Check if a user's role meets or exceeds the required role
 */
function hasRequiredRole(userRole: UserRole | undefined, requiredRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole ?? "user"];
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  return userLevel >= requiredLevel;
}

/**
 * Admin middleware factory
 * Creates middleware that requires a minimum role level
 *
 * @param requiredRole - Minimum role required to access the route
 */
export function requireRole(requiredRole: UserRole) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");

    if (!userId) {
      logger.warn("Admin access attempted without authentication", {
        requestId,
        path: c.req.path,
        method: c.req.method,
      });

      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        401
      );
    }

    try {
      const convex = getConvexClient();

      // Fetch user with role
      const user = await convex.query(api.users.getById, {});

      if (!user) {
        logger.warn("Admin access attempted by non-existent user", {
          requestId,
          userId,
          path: c.req.path,
        });

        return c.json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "User not found",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          401
        );
      }

      const userRole = (user as { role?: UserRole }).role ?? "user";

      if (!hasRequiredRole(userRole, requiredRole)) {
        logger.warn("Insufficient privileges for admin access", {
          requestId,
          userId,
          userRole,
          requiredRole,
          path: c.req.path,
          method: c.req.method,
        });

        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Insufficient privileges",
            },
            requestId,
            timestamp: new Date().toISOString(),
          },
          403
        );
      }

      // Log successful admin access
      logger.info("Admin access granted", {
        requestId,
        userId,
        userRole,
        path: c.req.path,
        method: c.req.method,
      });

      // Add role to context for downstream handlers
      c.set("userRole" as any, userRole);

      await next();
    } catch (error) {
      logger.error("Error checking admin authorization", {
        requestId,
        userId,
        error,
        path: c.req.path,
      });

      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Authorization check failed",
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  });
}

/**
 * Convenience middlewares for common role requirements
 */
export const adminMiddleware = requireRole("admin");
export const moderatorMiddleware = requireRole("moderator");
export const superadminMiddleware = requireRole("superadmin");
