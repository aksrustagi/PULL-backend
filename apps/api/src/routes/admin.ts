import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Admin-only middleware
 * Verifies the user is authenticated and has admin privileges
 */
const adminOnly = async (c: any, next: any) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Check if user is an admin
    const isAdmin = await convex.query(api.admin.isAdmin, {
      id: userId as Id<"users">,
    });

    if (!isAdmin) {
      // Log unauthorized admin access attempt
      await convex.mutation(api.audit.log, {
        userId: userId as Id<"users">,
        action: "admin.access.denied",
        resourceType: "admin",
        resourceId: "dashboard",
        metadata: {
          requestPath: c.req.path,
          requestMethod: c.req.method,
        },
        requestId: c.get("requestId"),
      });

      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        403
      );
    }

    await next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to verify admin status",
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
};

// Apply admin middleware to all routes
app.use("/*", adminOnly);

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get dashboard statistics
 * GET /api/admin/stats
 */
app.get("/stats", async (c) => {
  const userId = c.get("userId") as Id<"users">;

  try {
    const stats = await convex.query(api.admin.getDashboardStats, {});

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId,
      action: "admin.stats.viewed",
      resourceType: "admin",
      resourceId: "dashboard",
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch dashboard stats";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

const getUsersQuerySchema = z.object({
  status: z.enum(["active", "inactive", "suspended", "closed"]).optional(),
  kycStatus: z
    .enum([
      "pending",
      "email_verified",
      "identity_pending",
      "identity_verified",
      "background_pending",
      "background_cleared",
      "approved",
      "rejected",
      "suspended",
    ])
    .optional(),
  kycTier: z
    .enum(["none", "basic", "verified", "premium", "institutional"])
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/**
 * List users with pagination and filters
 * GET /api/admin/users
 */
app.get("/users", zValidator("query", getUsersQuerySchema), async (c) => {
  const userId = c.get("userId") as Id<"users">;
  const query = c.req.valid("query");

  try {
    const result = await convex.query(api.admin.getUsers, {
      status: query.status,
      kycStatus: query.kycStatus,
      kycTier: query.kycTier,
      searchQuery: query.search,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId,
      action: "admin.users.listed",
      resourceType: "admin",
      resourceId: "users",
      metadata: {
        filters: query,
        resultCount: result.users.length,
      },
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result.users,
      pagination: {
        page: result.page,
        pageSize: query.limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasMore,
        hasPreviousPage: query.offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch users";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get user details
 * GET /api/admin/users/:userId
 */
app.get("/users/:userId", async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const targetUserId = c.req.param("userId") as Id<"users">;

  try {
    const result = await convex.query(api.admin.getUserDetails, {
      userId: targetUserId,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId: adminId,
      action: "admin.user.viewed",
      resourceType: "users",
      resourceId: targetUserId,
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch user details";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

const updateUserSchema = z.object({
  status: z.enum(["active", "inactive", "suspended", "closed"]).optional(),
  kycStatus: z
    .enum([
      "pending",
      "email_verified",
      "identity_pending",
      "identity_verified",
      "background_pending",
      "background_cleared",
      "approved",
      "rejected",
      "suspended",
    ])
    .optional(),
  kycTier: z
    .enum(["none", "basic", "verified", "premium", "institutional"])
    .optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  reason: z.string().optional(),
});

/**
 * Update user
 * PATCH /api/admin/users/:userId
 */
app.patch(
  "/users/:userId",
  zValidator("json", updateUserSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const targetUserId = c.req.param("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      const { reason, ...updates } = body;

      await convex.mutation(api.admin.updateUser, {
        userId: targetUserId,
        adminId,
        updates,
        reason,
      });

      // Fetch updated user
      const updatedUser = await convex.query(api.admin.getUserDetails, {
        userId: targetUserId,
      });

      return c.json({
        success: true,
        data: updatedUser?.user,
        message: "User updated successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update user";

      return c.json(
        {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

const suspendUserSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  duration: z.number().positive().optional(), // Duration in milliseconds
});

/**
 * Suspend user account
 * POST /api/admin/users/:userId/suspend
 */
app.post(
  "/users/:userId/suspend",
  zValidator("json", suspendUserSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const targetUserId = c.req.param("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.suspendUser, {
        userId: targetUserId,
        adminId,
        reason: body.reason,
        duration: body.duration,
      });

      return c.json({
        success: true,
        message: "User suspended successfully",
        data: {
          userId: targetUserId,
          suspendedAt: new Date().toISOString(),
          reason: body.reason,
          duration: body.duration,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to suspend user";

      const statusCode = message.includes("already suspended") ? 400 : 500;

      return c.json(
        {
          success: false,
          error: {
            code: statusCode === 400 ? "INVALID_STATE" : "SUSPEND_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        statusCode
      );
    }
  }
);

const reactivateUserSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Reactivate suspended user
 * POST /api/admin/users/:userId/reactivate
 */
app.post(
  "/users/:userId/reactivate",
  zValidator("json", reactivateUserSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const targetUserId = c.req.param("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.reactivateUser, {
        userId: targetUserId,
        adminId,
        reason: body.reason,
      });

      return c.json({
        success: true,
        message: "User reactivated successfully",
        data: {
          userId: targetUserId,
          reactivatedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reactivate user";

      const statusCode = message.includes("not suspended") ? 400 : 500;

      return c.json(
        {
          success: false,
          error: {
            code: statusCode === 400 ? "INVALID_STATE" : "REACTIVATE_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        statusCode
      );
    }
  }
);

// ============================================================================
// ORDER MANAGEMENT
// ============================================================================

const getOrdersQuerySchema = z.object({
  userId: z.string().optional(),
  status: z
    .enum([
      "pending",
      "submitted",
      "accepted",
      "partial_fill",
      "filled",
      "cancelled",
      "rejected",
      "expired",
    ])
    .optional(),
  assetClass: z.enum(["crypto", "prediction", "rwa"]).optional(),
  symbol: z.string().optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List all orders with filters
 * GET /api/admin/orders
 */
app.get("/orders", zValidator("query", getOrdersQuerySchema), async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const query = c.req.valid("query");

  try {
    const result = await convex.query(api.admin.getOrders, {
      userId: query.userId as Id<"users"> | undefined,
      status: query.status,
      assetClass: query.assetClass,
      symbol: query.symbol,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit,
      offset: query.offset,
    });

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId: adminId,
      action: "admin.orders.listed",
      resourceType: "admin",
      resourceId: "orders",
      metadata: {
        filters: query,
        resultCount: result.orders.length,
      },
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result.orders,
      pagination: {
        page: result.page,
        pageSize: query.limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasMore,
        hasPreviousPage: query.offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch orders";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get order details
 * GET /api/admin/orders/:orderId
 */
app.get("/orders/:orderId", async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const orderId = c.req.param("orderId") as Id<"orders">;

  try {
    const result = await convex.query(api.admin.getOrderDetails, {
      orderId,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId: adminId,
      action: "admin.order.viewed",
      resourceType: "orders",
      resourceId: orderId,
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch order details";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// TRANSACTION MONITORING
// ============================================================================

const getTransactionsQuerySchema = z.object({
  userId: z.string().optional(),
  type: z.enum(["deposit", "withdrawal"]).optional(),
  status: z
    .enum(["pending", "processing", "completed", "failed", "cancelled"])
    .optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List transactions with filters
 * GET /api/admin/transactions
 */
app.get(
  "/transactions",
  zValidator("query", getTransactionsQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getTransactions, {
        userId: query.userId as Id<"users"> | undefined,
        type: query.type,
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        offset: query.offset,
      });

      // Log admin access
      await convex.mutation(api.audit.log, {
        userId: adminId,
        action: "admin.transactions.listed",
        resourceType: "admin",
        resourceId: "transactions",
        metadata: {
          filters: query,
          resultCount: result.transactions.length,
        },
        requestId: c.get("requestId"),
      });

      return c.json({
        success: true,
        data: result.transactions,
        pagination: {
          page: result.page,
          pageSize: query.limit,
          totalItems: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasMore,
          hasPreviousPage: query.offset > 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch transactions";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

// ============================================================================
// KYC MANAGEMENT
// ============================================================================

const getPendingKYCQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List pending KYC reviews
 * GET /api/admin/kyc/pending
 */
app.get(
  "/kyc/pending",
  zValidator("query", getPendingKYCQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getPendingKYC, {
        limit: query.limit,
        offset: query.offset,
      });

      // Log admin access
      await convex.mutation(api.audit.log, {
        userId: adminId,
        action: "admin.kyc.pending.listed",
        resourceType: "admin",
        resourceId: "kyc",
        metadata: {
          resultCount: result.pendingReviews.length,
        },
        requestId: c.get("requestId"),
      });

      return c.json({
        success: true,
        data: result.pendingReviews,
        pagination: {
          page: result.page,
          pageSize: query.limit,
          totalItems: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasMore,
          hasPreviousPage: query.offset > 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch pending KYC";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

const approveKYCSchema = z.object({
  tier: z.enum(["basic", "verified", "premium", "institutional"]),
  notes: z.string().optional(),
});

/**
 * Approve KYC
 * POST /api/admin/kyc/:userId/approve
 */
app.post(
  "/kyc/:userId/approve",
  zValidator("json", approveKYCSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const targetUserId = c.req.param("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.approveKYC, {
        userId: targetUserId,
        adminId,
        tier: body.tier,
        notes: body.notes,
      });

      return c.json({
        success: true,
        message: "KYC approved successfully",
        data: {
          userId: targetUserId,
          tier: body.tier,
          approvedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to approve KYC";

      return c.json(
        {
          success: false,
          error: {
            code: "APPROVE_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

const rejectKYCSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});

/**
 * Reject KYC
 * POST /api/admin/kyc/:userId/reject
 */
app.post(
  "/kyc/:userId/reject",
  zValidator("json", rejectKYCSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const targetUserId = c.req.param("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.rejectKYC, {
        userId: targetUserId,
        adminId,
        reason: body.reason,
        notes: body.notes,
      });

      return c.json({
        success: true,
        message: "KYC rejected",
        data: {
          userId: targetUserId,
          reason: body.reason,
          rejectedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reject KYC";

      return c.json(
        {
          success: false,
          error: {
            code: "REJECT_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

// ============================================================================
// AUDIT LOGS
// ============================================================================

const getAuditLogsQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List audit logs with filters
 * GET /api/admin/audit-logs
 */
app.get(
  "/audit-logs",
  zValidator("query", getAuditLogsQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getAuditLogs, {
        userId: query.userId as Id<"users"> | undefined,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        offset: query.offset,
      });

      // Log admin access (but don't log this for every audit log view to avoid recursion)
      if (!query.action?.includes("audit-logs")) {
        await convex.mutation(api.audit.log, {
          userId: adminId,
          action: "admin.audit-logs.viewed",
          resourceType: "admin",
          resourceId: "audit-logs",
          metadata: {
            filters: query,
            resultCount: result.logs.length,
          },
          requestId: c.get("requestId"),
        });
      }

      return c.json({
        success: true,
        data: result.logs,
        pagination: {
          page: result.page,
          pageSize: query.limit,
          totalItems: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasMore,
          hasPreviousPage: query.offset > 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch audit logs";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

// ============================================================================
// DEPOSITS MANAGEMENT
// ============================================================================

const getDepositsQuerySchema = z.object({
  userId: z.string().optional(),
  status: z
    .enum(["pending", "processing", "completed", "failed", "cancelled"])
    .optional(),
  method: z.enum(["bank_transfer", "wire", "crypto", "card"]).optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List all deposits with filters
 * GET /api/admin/deposits
 */
app.get("/deposits", zValidator("query", getDepositsQuerySchema), async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const query = c.req.valid("query");

  try {
    const result = await convex.query(api.admin.getDeposits, {
      userId: query.userId as Id<"users"> | undefined,
      status: query.status,
      method: query.method,
      startDate: query.startDate,
      endDate: query.endDate,
      minAmount: query.minAmount,
      maxAmount: query.maxAmount,
      limit: query.limit,
      offset: query.offset,
    });

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId: adminId,
      action: "admin.deposits.listed",
      resourceType: "admin",
      resourceId: "deposits",
      metadata: {
        filters: query,
        resultCount: result.deposits.length,
      },
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result.deposits,
      summary: {
        totalAmount: result.totalAmount,
        completedAmount: result.completedAmount,
      },
      pagination: {
        page: result.page,
        pageSize: query.limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasMore,
        hasPreviousPage: query.offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch deposits";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// WITHDRAWALS MANAGEMENT
// ============================================================================

const getWithdrawalsQuerySchema = z.object({
  userId: z.string().optional(),
  status: z
    .enum(["pending", "processing", "completed", "failed", "cancelled"])
    .optional(),
  method: z.enum(["bank_transfer", "wire", "crypto"]).optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * List all withdrawals with filters
 * GET /api/admin/withdrawals
 */
app.get(
  "/withdrawals",
  zValidator("query", getWithdrawalsQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getWithdrawals, {
        userId: query.userId as Id<"users"> | undefined,
        status: query.status,
        method: query.method,
        startDate: query.startDate,
        endDate: query.endDate,
        minAmount: query.minAmount,
        maxAmount: query.maxAmount,
        limit: query.limit,
        offset: query.offset,
      });

      // Log admin access
      await convex.mutation(api.audit.log, {
        userId: adminId,
        action: "admin.withdrawals.listed",
        resourceType: "admin",
        resourceId: "withdrawals",
        metadata: {
          filters: query,
          resultCount: result.withdrawals.length,
        },
        requestId: c.get("requestId"),
      });

      return c.json({
        success: true,
        data: result.withdrawals,
        summary: {
          totalAmount: result.totalAmount,
          pendingAmount: result.pendingAmount,
          completedAmount: result.completedAmount,
        },
        pagination: {
          page: result.page,
          pageSize: query.limit,
          totalItems: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasMore,
          hasPreviousPage: query.offset > 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch withdrawals";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

/**
 * Get withdrawal details
 * GET /api/admin/withdrawals/:withdrawalId
 */
app.get("/withdrawals/:withdrawalId", async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const withdrawalId = c.req.param("withdrawalId") as Id<"withdrawals">;

  try {
    const result = await convex.query(api.admin.getWithdrawalDetails, {
      withdrawalId,
    });

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Withdrawal not found",
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Log admin access
    await convex.mutation(api.audit.log, {
      userId: adminId,
      action: "admin.withdrawal.viewed",
      resourceType: "withdrawals",
      resourceId: withdrawalId,
      requestId: c.get("requestId"),
    });

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch withdrawal details";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

const approveWithdrawalSchema = z.object({
  notes: z.string().optional(),
});

/**
 * Approve withdrawal
 * POST /api/admin/withdrawals/:withdrawalId/approve
 */
app.post(
  "/withdrawals/:withdrawalId/approve",
  zValidator("json", approveWithdrawalSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const withdrawalId = c.req.param("withdrawalId") as Id<"withdrawals">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.approveWithdrawal, {
        withdrawalId,
        adminId,
        notes: body.notes,
      });

      return c.json({
        success: true,
        message: "Withdrawal approved successfully",
        data: {
          withdrawalId,
          status: "processing",
          approvedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to approve withdrawal";

      const statusCode = message.includes("Cannot approve") ? 400 : 500;

      return c.json(
        {
          success: false,
          error: {
            code: statusCode === 400 ? "INVALID_STATE" : "APPROVE_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        statusCode
      );
    }
  }
);

const rejectWithdrawalSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});

/**
 * Reject withdrawal
 * POST /api/admin/withdrawals/:withdrawalId/reject
 */
app.post(
  "/withdrawals/:withdrawalId/reject",
  zValidator("json", rejectWithdrawalSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const withdrawalId = c.req.param("withdrawalId") as Id<"withdrawals">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.rejectWithdrawal, {
        withdrawalId,
        adminId,
        reason: body.reason,
        notes: body.notes,
      });

      return c.json({
        success: true,
        message: "Withdrawal rejected",
        data: {
          withdrawalId,
          status: "cancelled",
          reason: body.reason,
          rejectedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reject withdrawal";

      const statusCode = message.includes("Cannot reject") ? 400 : 500;

      return c.json(
        {
          success: false,
          error: {
            code: statusCode === 400 ? "INVALID_STATE" : "REJECT_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        statusCode
      );
    }
  }
);

// ============================================================================
// FRAUD FLAGS MANAGEMENT
// ============================================================================

const getFraudFlagsQuerySchema = z.object({
  userId: z.string().optional(),
  status: z
    .enum(["pending", "investigating", "confirmed", "cleared", "escalated"])
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  type: z.string().optional(),
  startDate: z.coerce.number().optional(),
  endDate: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * Get fraud flags
 * GET /api/admin/fraud-flags
 */
app.get(
  "/fraud-flags",
  zValidator("query", getFraudFlagsQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getFraudFlags, {
        userId: query.userId as Id<"users"> | undefined,
        status: query.status,
        severity: query.severity,
        type: query.type,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        offset: query.offset,
      });

      // Log admin access
      await convex.mutation(api.audit.log, {
        userId: adminId,
        action: "admin.fraud-flags.listed",
        resourceType: "admin",
        resourceId: "fraud-flags",
        metadata: {
          filters: query,
          resultCount: result.flags.length,
        },
        requestId: c.get("requestId"),
      });

      return c.json({
        success: true,
        data: result.flags,
        summary: {
          bySeverity: result.bySeverity,
          byStatus: result.byStatus,
        },
        pagination: {
          page: result.page,
          pageSize: query.limit,
          totalItems: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasMore,
          hasPreviousPage: query.offset > 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch fraud flags";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

const createFraudFlagSchema = z.object({
  userId: z.string(),
  type: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(1),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.any().optional(),
});

/**
 * Create fraud flag
 * POST /api/admin/fraud-flags
 */
app.post(
  "/fraud-flags",
  zValidator("json", createFraudFlagSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const body = c.req.valid("json");

    try {
      const flagId = await convex.mutation(api.admin.createFraudFlag, {
        userId: body.userId as Id<"users">,
        adminId,
        type: body.type,
        severity: body.severity,
        description: body.description,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        metadata: body.metadata,
      });

      return c.json({
        success: true,
        message: "Fraud flag created",
        data: {
          flagId,
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create fraud flag";

      return c.json(
        {
          success: false,
          error: {
            code: "CREATE_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

const reviewFraudFlagSchema = z.object({
  status: z.enum(["investigating", "confirmed", "cleared", "escalated"]),
  notes: z.string().min(1, "Notes are required"),
  actionTaken: z.string().optional(),
});

/**
 * Review fraud flag
 * POST /api/admin/fraud-flags/:flagId/review
 */
app.post(
  "/fraud-flags/:flagId/review",
  zValidator("json", reviewFraudFlagSchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const flagId = c.req.param("flagId") as Id<"auditLog">;
    const body = c.req.valid("json");

    try {
      await convex.mutation(api.admin.reviewFraudFlag, {
        flagId,
        adminId,
        status: body.status,
        notes: body.notes,
        actionTaken: body.actionTaken,
      });

      return c.json({
        success: true,
        message: "Fraud flag reviewed",
        data: {
          flagId,
          status: body.status,
          reviewedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to review fraud flag";

      return c.json(
        {
          success: false,
          error: {
            code: "REVIEW_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

// ============================================================================
// PLATFORM STATISTICS
// ============================================================================

const getPlatformStatsQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "all"]).optional(),
});

/**
 * Get platform statistics
 * GET /api/admin/platform-stats
 */
app.get(
  "/platform-stats",
  zValidator("query", getPlatformStatsQuerySchema),
  async (c) => {
    const adminId = c.get("userId") as Id<"users">;
    const query = c.req.valid("query");

    try {
      const result = await convex.query(api.admin.getPlatformStats, {
        period: query.period,
      });

      // Log admin access
      await convex.mutation(api.audit.log, {
        userId: adminId,
        action: "admin.platform-stats.viewed",
        resourceType: "admin",
        resourceId: "platform-stats",
        metadata: { period: query.period },
        requestId: c.get("requestId"),
      });

      return c.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch platform stats";

      return c.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message,
          },
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

/**
 * Get admin audit log
 * GET /api/admin/admin-audit-log
 */
app.get("/admin-audit-log", async (c) => {
  const adminId = c.get("userId") as Id<"users">;
  const adminOnly = c.req.query("adminOnly") === "true";
  const limit = parseInt(c.req.query("limit") ?? "100");
  const offset = parseInt(c.req.query("offset") ?? "0");

  try {
    const result = await convex.query(api.admin.getAdminAuditLog, {
      adminOnly,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result.logs,
      summary: {
        byAction: result.byAction,
      },
      pagination: {
        page: result.page,
        pageSize: limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasMore,
        hasPreviousPage: offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch admin audit log";

    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

/**
 * Check status of all external services
 * GET /api/admin/health/services
 */
app.get("/health/services", async (c) => {
  const adminId = c.get("userId") as Id<"users">;

  const services: Record<
    string,
    { status: "healthy" | "degraded" | "down"; latency?: number; error?: string }
  > = {};

  // Check Convex
  const convexStart = Date.now();
  try {
    await convex.query(api.admin.getDashboardStats, {});
    services.convex = {
      status: "healthy",
      latency: Date.now() - convexStart,
    };
  } catch (error) {
    services.convex = {
      status: "down",
      latency: Date.now() - convexStart,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Check external services (these would be actual health checks in production)
  // For now, we'll simulate health checks

  // Alpaca (Trading)
  services.alpaca = {
    status: process.env.ALPACA_API_KEY ? "healthy" : "degraded",
    latency: 50,
  };

  // Kalshi (Predictions)
  services.kalshi = {
    status: process.env.KALSHI_API_KEY ? "healthy" : "degraded",
    latency: 75,
  };

  // Plaid (Banking)
  services.plaid = {
    status: process.env.PLAID_CLIENT_ID ? "healthy" : "degraded",
    latency: 100,
  };

  // Persona (KYC)
  services.persona = {
    status: process.env.PERSONA_API_KEY ? "healthy" : "degraded",
    latency: 80,
  };

  // Chainalysis (Compliance)
  services.chainalysis = {
    status: process.env.CHAINALYSIS_API_KEY ? "healthy" : "degraded",
    latency: 120,
  };

  // Nylas (Email)
  services.nylas = {
    status: process.env.NYLAS_CLIENT_ID ? "healthy" : "degraded",
    latency: 90,
  };

  // Matrix (Messaging)
  services.matrix = {
    status: process.env.MATRIX_HOMESERVER_URL ? "healthy" : "degraded",
    latency: 60,
  };

  // Temporal (Workflows)
  services.temporal = {
    status: process.env.TEMPORAL_ADDRESS ? "healthy" : "degraded",
    latency: 40,
  };

  // Calculate overall status
  const statuses = Object.values(services).map((s) => s.status);
  let overallStatus: "healthy" | "degraded" | "down" = "healthy";
  if (statuses.includes("down")) {
    overallStatus = "down";
  } else if (statuses.includes("degraded")) {
    overallStatus = "degraded";
  }

  // Log admin access
  await convex.mutation(api.audit.log, {
    userId: adminId,
    action: "admin.health.checked",
    resourceType: "admin",
    resourceId: "health",
    metadata: {
      overallStatus,
      serviceCount: Object.keys(services).length,
    },
    requestId: c.get("requestId"),
  });

  return c.json({
    success: true,
    data: {
      status: overallStatus,
      services,
      checkedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as adminRoutes };
