import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Admin queries and mutations for PULL
 * These require admin role verification at the API layer
 */

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get dashboard statistics for admin overview
 */
export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get user stats
    const allUsers = await ctx.db.query("users").collect();
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u) => u.status === "active").length;
    const suspendedUsers = allUsers.filter((u) => u.status === "suspended").length;
    const newUsersToday = allUsers.filter((u) => u.createdAt >= oneDayAgo).length;
    const newUsersWeek = allUsers.filter((u) => u.createdAt >= oneWeekAgo).length;
    const newUsersMonth = allUsers.filter((u) => u.createdAt >= oneMonthAgo).length;

    // Get KYC stats
    const pendingKYC = allUsers.filter(
      (u) =>
        u.kycStatus === "pending" ||
        u.kycStatus === "identity_pending" ||
        u.kycStatus === "background_pending"
    ).length;
    const approvedKYC = allUsers.filter((u) => u.kycStatus === "approved").length;
    const rejectedKYC = allUsers.filter((u) => u.kycStatus === "rejected").length;

    // Get order stats
    const allOrders = await ctx.db.query("orders").collect();
    const totalOrders = allOrders.length;
    const ordersToday = allOrders.filter((o) => o.createdAt >= oneDayAgo).length;
    const ordersWeek = allOrders.filter((o) => o.createdAt >= oneWeekAgo).length;
    const filledOrders = allOrders.filter((o) => o.status === "filled").length;
    const pendingOrders = allOrders.filter(
      (o) =>
        o.status === "pending" ||
        o.status === "submitted" ||
        o.status === "accepted"
    ).length;

    // Calculate trading volume
    const trades = await ctx.db.query("trades").collect();
    const totalVolume = trades.reduce((sum, t) => sum + t.notionalValue, 0);
    const volumeToday = trades
      .filter((t) => t.executedAt >= oneDayAgo)
      .reduce((sum, t) => sum + t.notionalValue, 0);
    const volumeWeek = trades
      .filter((t) => t.executedAt >= oneWeekAgo)
      .reduce((sum, t) => sum + t.notionalValue, 0);
    const volumeMonth = trades
      .filter((t) => t.executedAt >= oneMonthAgo)
      .reduce((sum, t) => sum + t.notionalValue, 0);

    // Get deposit/withdrawal stats
    const deposits = await ctx.db.query("deposits").collect();
    const withdrawals = await ctx.db.query("withdrawals").collect();
    const totalDeposits = deposits
      .filter((d) => d.status === "completed")
      .reduce((sum, d) => sum + d.amount, 0);
    const totalWithdrawals = withdrawals
      .filter((w) => w.status === "completed")
      .reduce((sum, w) => sum + w.amount, 0);
    const pendingDeposits = deposits.filter((d) => d.status === "pending").length;
    const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending").length;

    // Get RWA stats
    const rwaAssets = await ctx.db.query("rwaAssets").collect();
    const totalRWAAssets = rwaAssets.length;
    const listedRWAAssets = rwaAssets.filter((a) => a.status === "listed").length;
    const pendingVerificationRWA = rwaAssets.filter(
      (a) => a.status === "pending_verification"
    ).length;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        newToday: newUsersToday,
        newWeek: newUsersWeek,
        newMonth: newUsersMonth,
      },
      kyc: {
        pending: pendingKYC,
        approved: approvedKYC,
        rejected: rejectedKYC,
      },
      orders: {
        total: totalOrders,
        today: ordersToday,
        week: ordersWeek,
        filled: filledOrders,
        pending: pendingOrders,
      },
      volume: {
        total: totalVolume,
        today: volumeToday,
        week: volumeWeek,
        month: volumeMonth,
      },
      deposits: {
        total: totalDeposits,
        pending: pendingDeposits,
      },
      withdrawals: {
        total: totalWithdrawals,
        pending: pendingWithdrawals,
      },
      rwa: {
        total: totalRWAAssets,
        listed: listedRWAAssets,
        pendingVerification: pendingVerificationRWA,
      },
      generatedAt: now,
    };
  },
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Get users with pagination and filters (admin view)
 */
export const getUsers = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("suspended"),
        v.literal("closed")
      )
    ),
    kycStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("email_verified"),
        v.literal("identity_pending"),
        v.literal("identity_verified"),
        v.literal("background_pending"),
        v.literal("background_cleared"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("suspended")
      )
    ),
    kycTier: v.optional(
      v.union(
        v.literal("none"),
        v.literal("basic"),
        v.literal("verified"),
        v.literal("premium"),
        v.literal("institutional")
      )
    ),
    searchQuery: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    let users = await ctx.db.query("users").order("desc").collect();

    // Apply filters
    if (args.status) {
      users = users.filter((u) => u.status === args.status);
    }
    if (args.kycStatus) {
      users = users.filter((u) => u.kycStatus === args.kycStatus);
    }
    if (args.kycTier) {
      users = users.filter((u) => u.kycTier === args.kycTier);
    }
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(query) ||
          u.displayName?.toLowerCase().includes(query) ||
          u.username?.toLowerCase().includes(query) ||
          u.firstName?.toLowerCase().includes(query) ||
          u.lastName?.toLowerCase().includes(query)
      );
    }

    // Sort
    if (args.sortBy) {
      const sortOrder = args.sortOrder === "asc" ? 1 : -1;
      users.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[args.sortBy!];
        const bVal = (b as Record<string, unknown>)[args.sortBy!];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        return aVal < bVal ? -sortOrder : sortOrder;
      });
    }

    const total = users.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Remove sensitive fields
    const sanitizedUsers = users.slice(offset, offset + limit).map((u) => ({
      _id: u._id,
      _creationTime: u._creationTime,
      email: u.email,
      emailVerified: u.emailVerified,
      phone: u.phone,
      phoneVerified: u.phoneVerified,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      firstName: u.firstName,
      lastName: u.lastName,
      country: u.country,
      status: u.status,
      kycStatus: u.kycStatus,
      kycTier: u.kycTier,
      authProvider: u.authProvider,
      walletAddress: u.walletAddress,
      referralCode: u.referralCode,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return {
      users: sanitizedUsers,
      total,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

/**
 * Get detailed user information (admin view)
 */
export const getUserDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Get balances
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get positions
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get recent orders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    // Get KYC records
    const kycRecords = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get referral count
    const referrals = await ctx.db
      .query("users")
      .withIndex("by_referrer", (q) => q.eq("referredBy", args.userId))
      .collect();

    // Get recent audit logs
    const auditLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);

    // Get deposits and withdrawals
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const withdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    // Remove password hash from user
    const { passwordHash, ...sanitizedUser } = user;

    return {
      user: sanitizedUser,
      balances,
      positions,
      orders,
      kycRecords,
      referralCount: referrals.length,
      auditLogs,
      deposits,
      withdrawals,
    };
  },
});

/**
 * Update user (admin action)
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.id("users"),
    updates: v.object({
      status: v.optional(
        v.union(
          v.literal("active"),
          v.literal("inactive"),
          v.literal("suspended"),
          v.literal("closed")
        )
      ),
      kycStatus: v.optional(
        v.union(
          v.literal("pending"),
          v.literal("email_verified"),
          v.literal("identity_pending"),
          v.literal("identity_verified"),
          v.literal("background_pending"),
          v.literal("background_cleared"),
          v.literal("approved"),
          v.literal("rejected"),
          v.literal("suspended")
        )
      ),
      kycTier: v.optional(
        v.union(
          v.literal("none"),
          v.literal("basic"),
          v.literal("verified"),
          v.literal("premium"),
          v.literal("institutional")
        )
      ),
      emailVerified: v.optional(v.boolean()),
      phoneVerified: v.optional(v.boolean()),
    }),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Store old values for audit
    const oldValues = {
      status: user.status,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };

    // Apply updates
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (args.updates.status !== undefined) {
      updateData.status = args.updates.status;
    }
    if (args.updates.kycStatus !== undefined) {
      updateData.kycStatus = args.updates.kycStatus;
    }
    if (args.updates.kycTier !== undefined) {
      updateData.kycTier = args.updates.kycTier;
    }
    if (args.updates.emailVerified !== undefined) {
      updateData.emailVerified = args.updates.emailVerified;
    }
    if (args.updates.phoneVerified !== undefined) {
      updateData.phoneVerified = args.updates.phoneVerified;
    }

    await ctx.db.patch(args.userId, updateData);

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.user.updated",
      resourceType: "users",
      resourceId: args.userId,
      changes: {
        old: oldValues,
        new: args.updates,
      },
      metadata: {
        targetUserId: args.userId,
        reason: args.reason,
      },
      timestamp: now,
    });

    return args.userId;
  },
});

/**
 * Suspend user (admin action)
 */
export const suspendUser = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.id("users"),
    reason: v.string(),
    duration: v.optional(v.number()), // Duration in milliseconds, undefined = permanent
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.status === "suspended") {
      throw new Error("User is already suspended");
    }

    await ctx.db.patch(args.userId, {
      status: "suspended",
      updatedAt: now,
    });

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.user.suspended",
      resourceType: "users",
      resourceId: args.userId,
      metadata: {
        targetUserId: args.userId,
        reason: args.reason,
        duration: args.duration,
        suspendedUntil: args.duration ? now + args.duration : undefined,
        previousStatus: user.status,
      },
      timestamp: now,
    });

    return args.userId;
  },
});

/**
 * Reactivate suspended user (admin action)
 */
export const reactivateUser = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.status !== "suspended") {
      throw new Error("User is not suspended");
    }

    await ctx.db.patch(args.userId, {
      status: "active",
      updatedAt: now,
    });

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.user.reactivated",
      resourceType: "users",
      resourceId: args.userId,
      metadata: {
        targetUserId: args.userId,
        reason: args.reason,
      },
      timestamp: now,
    });

    return args.userId;
  },
});

// ============================================================================
// ORDER MANAGEMENT
// ============================================================================

/**
 * Get all orders with filters (admin view)
 */
export const getOrders = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("submitted"),
        v.literal("accepted"),
        v.literal("partial_fill"),
        v.literal("filled"),
        v.literal("cancelled"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
    assetClass: v.optional(
      v.union(v.literal("crypto"), v.literal("prediction"), v.literal("rwa"))
    ),
    symbol: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("orders").order("desc").collect();

    // Apply filters
    if (args.userId) {
      orders = orders.filter((o) => o.userId === args.userId);
    }
    if (args.status) {
      orders = orders.filter((o) => o.status === args.status);
    }
    if (args.assetClass) {
      orders = orders.filter((o) => o.assetClass === args.assetClass);
    }
    if (args.symbol) {
      orders = orders.filter((o) => o.symbol === args.symbol);
    }
    if (args.startDate) {
      orders = orders.filter((o) => o.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      orders = orders.filter((o) => o.createdAt <= args.endDate!);
    }

    const total = orders.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Enrich with user email for display
    const enrichedOrders = await Promise.all(
      orders.slice(offset, offset + limit).map(async (order) => {
        const user = await ctx.db.get(order.userId);
        return {
          ...order,
          userEmail: user?.email,
          userDisplayName: user?.displayName,
        };
      })
    );

    return {
      orders: enrichedOrders,
      total,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

/**
 * Get order details with full history (admin view)
 */
export const getOrderDetails = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    // Get user info
    const user = await ctx.db.get(order.userId);

    // Get trades/fills
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Get audit logs for this order
    const auditLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "orders").eq("resourceId", args.orderId)
      )
      .order("desc")
      .collect();

    return {
      order,
      user: user
        ? {
            _id: user._id,
            email: user.email,
            displayName: user.displayName,
          }
        : null,
      trades,
      auditLogs,
    };
  },
});

// ============================================================================
// TRANSACTION MONITORING
// ============================================================================

/**
 * Get transactions with filters (admin view)
 */
export const getTransactions = query({
  args: {
    userId: v.optional(v.id("users")),
    type: v.optional(v.union(v.literal("deposit"), v.literal("withdrawal"))),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get deposits
    let deposits = await ctx.db.query("deposits").order("desc").collect();
    if (args.userId) {
      deposits = deposits.filter((d) => d.userId === args.userId);
    }
    if (args.status) {
      deposits = deposits.filter((d) => d.status === args.status);
    }
    if (args.startDate) {
      deposits = deposits.filter((d) => d.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      deposits = deposits.filter((d) => d.createdAt <= args.endDate!);
    }

    // Get withdrawals
    let withdrawals = await ctx.db.query("withdrawals").order("desc").collect();
    if (args.userId) {
      withdrawals = withdrawals.filter((w) => w.userId === args.userId);
    }
    if (args.status) {
      withdrawals = withdrawals.filter((w) => w.status === args.status);
    }
    if (args.startDate) {
      withdrawals = withdrawals.filter((w) => w.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      withdrawals = withdrawals.filter((w) => w.createdAt <= args.endDate!);
    }

    // Combine and sort
    let transactions: Array<{
      type: "deposit" | "withdrawal";
      data: (typeof deposits)[0] | (typeof withdrawals)[0];
    }> = [];

    if (!args.type || args.type === "deposit") {
      transactions = transactions.concat(
        deposits.map((d) => ({ type: "deposit" as const, data: d }))
      );
    }
    if (!args.type || args.type === "withdrawal") {
      transactions = transactions.concat(
        withdrawals.map((w) => ({ type: "withdrawal" as const, data: w }))
      );
    }

    // Sort by createdAt descending
    transactions.sort((a, b) => b.data.createdAt - a.data.createdAt);

    const total = transactions.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Enrich with user info
    const enrichedTransactions = await Promise.all(
      transactions.slice(offset, offset + limit).map(async (tx) => {
        const user = await ctx.db.get(tx.data.userId);
        return {
          ...tx,
          userEmail: user?.email,
          userDisplayName: user?.displayName,
        };
      })
    );

    return {
      transactions: enrichedTransactions,
      total,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

// ============================================================================
// KYC MANAGEMENT
// ============================================================================

/**
 * Get pending KYC reviews
 */
export const getPendingKYC = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get users with pending KYC status
    const pendingUsers = await ctx.db
      .query("users")
      .filter((q) =>
        q.or(
          q.eq(q.field("kycStatus"), "pending"),
          q.eq(q.field("kycStatus"), "identity_pending"),
          q.eq(q.field("kycStatus"), "background_pending")
        )
      )
      .order("desc")
      .collect();

    const total = pendingUsers.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Get KYC records for each user
    const enrichedUsers = await Promise.all(
      pendingUsers.slice(offset, offset + limit).map(async (user) => {
        const kycRecords = await ctx.db
          .query("kycRecords")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(5);

        return {
          user: {
            _id: user._id,
            email: user.email,
            displayName: user.displayName,
            firstName: user.firstName,
            lastName: user.lastName,
            country: user.country,
            kycStatus: user.kycStatus,
            kycTier: user.kycTier,
            createdAt: user.createdAt,
          },
          kycRecords,
        };
      })
    );

    return {
      pendingReviews: enrichedUsers,
      total,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

/**
 * Approve KYC (admin action)
 */
export const approveKYC = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.id("users"),
    tier: v.union(
      v.literal("basic"),
      v.literal("verified"),
      v.literal("premium"),
      v.literal("institutional")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const oldStatus = user.kycStatus;
    const oldTier = user.kycTier;

    await ctx.db.patch(args.userId, {
      kycStatus: "approved",
      kycTier: args.tier,
      updatedAt: now,
    });

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.kyc.approved",
      resourceType: "users",
      resourceId: args.userId,
      changes: {
        old: { kycStatus: oldStatus, kycTier: oldTier },
        new: { kycStatus: "approved", kycTier: args.tier },
      },
      metadata: {
        targetUserId: args.userId,
        notes: args.notes,
      },
      timestamp: now,
    });

    return args.userId;
  },
});

/**
 * Reject KYC (admin action)
 */
export const rejectKYC = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.id("users"),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const oldStatus = user.kycStatus;

    await ctx.db.patch(args.userId, {
      kycStatus: "rejected",
      updatedAt: now,
    });

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.kyc.rejected",
      resourceType: "users",
      resourceId: args.userId,
      changes: {
        old: { kycStatus: oldStatus },
        new: { kycStatus: "rejected" },
      },
      metadata: {
        targetUserId: args.userId,
        reason: args.reason,
        notes: args.notes,
      },
      timestamp: now,
    });

    return args.userId;
  },
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * Get audit logs with filters (admin view)
 */
export const getAuditLogs = query({
  args: {
    userId: v.optional(v.id("users")),
    action: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db.query("auditLog").order("desc").take(10000);

    // Apply filters
    if (args.userId) {
      logs = logs.filter((l) => l.userId === args.userId);
    }
    if (args.action) {
      logs = logs.filter((l) => l.action.includes(args.action!));
    }
    if (args.resourceType) {
      logs = logs.filter((l) => l.resourceType === args.resourceType);
    }
    if (args.resourceId) {
      logs = logs.filter((l) => l.resourceId === args.resourceId);
    }
    if (args.startDate) {
      logs = logs.filter((l) => l.timestamp >= args.startDate!);
    }
    if (args.endDate) {
      logs = logs.filter((l) => l.timestamp <= args.endDate!);
    }

    const total = logs.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 100;

    // Enrich with user info
    const enrichedLogs = await Promise.all(
      logs.slice(offset, offset + limit).map(async (log) => {
        let userEmail: string | undefined;
        if (log.userId) {
          const user = await ctx.db.get(log.userId);
          userEmail = user?.email;
        }
        return {
          ...log,
          userEmail,
        };
      })
    );

    return {
      logs: enrichedLogs,
      total,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

// ============================================================================
// DEPOSITS MANAGEMENT
// ============================================================================

/**
 * Get all deposits with filters (admin view)
 */
export const getDeposits = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    method: v.optional(
      v.union(
        v.literal("bank_transfer"),
        v.literal("wire"),
        v.literal("crypto"),
        v.literal("card")
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let deposits = await ctx.db.query("deposits").order("desc").collect();

    // Apply filters
    if (args.userId) {
      deposits = deposits.filter((d) => d.userId === args.userId);
    }
    if (args.status) {
      deposits = deposits.filter((d) => d.status === args.status);
    }
    if (args.method) {
      deposits = deposits.filter((d) => d.method === args.method);
    }
    if (args.startDate) {
      deposits = deposits.filter((d) => d.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      deposits = deposits.filter((d) => d.createdAt <= args.endDate!);
    }
    if (args.minAmount) {
      deposits = deposits.filter((d) => d.amount >= args.minAmount!);
    }
    if (args.maxAmount) {
      deposits = deposits.filter((d) => d.amount <= args.maxAmount!);
    }

    const total = deposits.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Calculate totals
    const totalAmount = deposits.reduce((sum, d) => sum + d.amount, 0);
    const completedAmount = deposits
      .filter((d) => d.status === "completed")
      .reduce((sum, d) => sum + d.amount, 0);

    // Enrich with user info
    const enrichedDeposits = await Promise.all(
      deposits.slice(offset, offset + limit).map(async (deposit) => {
        const user = await ctx.db.get(deposit.userId);
        return {
          ...deposit,
          userEmail: user?.email,
          userDisplayName: user?.displayName,
        };
      })
    );

    return {
      deposits: enrichedDeposits,
      total,
      totalAmount,
      completedAmount,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

// ============================================================================
// WITHDRAWALS MANAGEMENT
// ============================================================================

/**
 * Get all withdrawals with filters (admin view)
 */
export const getWithdrawals = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    method: v.optional(
      v.union(
        v.literal("bank_transfer"),
        v.literal("wire"),
        v.literal("crypto")
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let withdrawals = await ctx.db.query("withdrawals").order("desc").collect();

    // Apply filters
    if (args.userId) {
      withdrawals = withdrawals.filter((w) => w.userId === args.userId);
    }
    if (args.status) {
      withdrawals = withdrawals.filter((w) => w.status === args.status);
    }
    if (args.method) {
      withdrawals = withdrawals.filter((w) => w.method === args.method);
    }
    if (args.startDate) {
      withdrawals = withdrawals.filter((w) => w.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      withdrawals = withdrawals.filter((w) => w.createdAt <= args.endDate!);
    }
    if (args.minAmount) {
      withdrawals = withdrawals.filter((w) => w.amount >= args.minAmount!);
    }
    if (args.maxAmount) {
      withdrawals = withdrawals.filter((w) => w.amount <= args.maxAmount!);
    }

    const total = withdrawals.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Calculate totals
    const totalAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const pendingAmount = withdrawals
      .filter((w) => w.status === "pending")
      .reduce((sum, w) => sum + w.amount, 0);
    const completedAmount = withdrawals
      .filter((w) => w.status === "completed")
      .reduce((sum, w) => sum + w.amount, 0);

    // Enrich with user info
    const enrichedWithdrawals = await Promise.all(
      withdrawals.slice(offset, offset + limit).map(async (withdrawal) => {
        const user = await ctx.db.get(withdrawal.userId);
        return {
          ...withdrawal,
          userEmail: user?.email,
          userDisplayName: user?.displayName,
        };
      })
    );

    return {
      withdrawals: enrichedWithdrawals,
      total,
      totalAmount,
      pendingAmount,
      completedAmount,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

/**
 * Get withdrawal details (admin view)
 */
export const getWithdrawalDetails = query({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) return null;

    // Get user info
    const user = await ctx.db.get(withdrawal.userId);

    // Get user's balance
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", withdrawal.userId))
      .collect();

    // Get audit logs for this withdrawal
    const auditLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "withdrawals").eq("resourceId", args.withdrawalId)
      )
      .order("desc")
      .collect();

    // Get user's recent withdrawals for context
    const recentWithdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", withdrawal.userId))
      .order("desc")
      .take(10);

    return {
      withdrawal,
      user: user
        ? {
            _id: user._id,
            email: user.email,
            displayName: user.displayName,
            kycStatus: user.kycStatus,
            kycTier: user.kycTier,
            status: user.status,
          }
        : null,
      balances,
      auditLogs,
      recentWithdrawals,
    };
  },
});

/**
 * Approve withdrawal (admin action)
 */
export const approveWithdrawal = mutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    adminId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (withdrawal.status !== "pending") {
      throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
    }

    // Update withdrawal status
    await ctx.db.patch(args.withdrawalId, {
      status: "processing",
    });

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.withdrawal.approved",
      resourceType: "withdrawals",
      resourceId: args.withdrawalId,
      changes: {
        old: { status: "pending" },
        new: { status: "processing" },
      },
      metadata: {
        targetUserId: withdrawal.userId,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        notes: args.notes,
      },
      timestamp: now,
    });

    return args.withdrawalId;
  },
});

/**
 * Reject withdrawal (admin action)
 */
export const rejectWithdrawal = mutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    adminId: v.id("users"),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (withdrawal.status !== "pending") {
      throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
    }

    // Update withdrawal status
    await ctx.db.patch(args.withdrawalId, {
      status: "cancelled",
      metadata: {
        ...withdrawal.metadata,
        rejectionReason: args.reason,
        rejectedAt: now,
        rejectedBy: args.adminId,
      },
    });

    // Return funds to user's available balance
    const userBalances = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", withdrawal.userId).eq("assetType", "usd").eq("assetId", withdrawal.currency)
      )
      .first();

    if (userBalances) {
      await ctx.db.patch(userBalances._id, {
        available: userBalances.available + withdrawal.amount,
        held: Math.max(0, userBalances.held - withdrawal.amount),
        updatedAt: now,
      });
    }

    // Log admin action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.withdrawal.rejected",
      resourceType: "withdrawals",
      resourceId: args.withdrawalId,
      changes: {
        old: { status: "pending" },
        new: { status: "cancelled" },
      },
      metadata: {
        targetUserId: withdrawal.userId,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        reason: args.reason,
        notes: args.notes,
      },
      timestamp: now,
    });

    return args.withdrawalId;
  },
});

// ============================================================================
// FRAUD FLAGS MANAGEMENT
// ============================================================================

/**
 * Get fraud flags (admin view)
 */
export const getFraudFlags = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("investigating"),
        v.literal("confirmed"),
        v.literal("cleared"),
        v.literal("escalated")
      )
    ),
    severity: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"))
    ),
    type: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Query audit logs for fraud-related actions
    let logs = await ctx.db
      .query("auditLog")
      .order("desc")
      .take(5000);

    // Filter for fraud-related entries
    logs = logs.filter(
      (l) =>
        l.action.includes("fraud") ||
        l.action.includes("suspicious") ||
        l.action.includes("risk") ||
        l.resourceType === "fraud"
    );

    // Apply filters
    if (args.userId) {
      logs = logs.filter((l) => l.userId === args.userId);
    }
    if (args.status) {
      logs = logs.filter((l) => (l.metadata as Record<string, unknown>)?.status === args.status);
    }
    if (args.severity) {
      logs = logs.filter((l) => (l.metadata as Record<string, unknown>)?.severity === args.severity);
    }
    if (args.type) {
      logs = logs.filter((l) => l.action.includes(args.type!));
    }
    if (args.startDate) {
      logs = logs.filter((l) => l.timestamp >= args.startDate!);
    }
    if (args.endDate) {
      logs = logs.filter((l) => l.timestamp <= args.endDate!);
    }

    const total = logs.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    // Enrich with user info
    const enrichedFlags = await Promise.all(
      logs.slice(offset, offset + limit).map(async (log) => {
        let userEmail: string | undefined;
        let userDisplayName: string | undefined;
        if (log.userId) {
          const user = await ctx.db.get(log.userId);
          userEmail = user?.email;
          userDisplayName = user?.displayName;
        }
        return {
          _id: log._id,
          userId: log.userId,
          userEmail,
          userDisplayName,
          type: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          severity: (log.metadata as Record<string, unknown>)?.severity ?? "medium",
          status: (log.metadata as Record<string, unknown>)?.status ?? "pending",
          description: (log.metadata as Record<string, unknown>)?.description ?? log.action,
          timestamp: log.timestamp,
          metadata: log.metadata,
        };
      })
    );

    // Calculate summary stats
    const bySeverity = enrichedFlags.reduce(
      (acc, f) => {
        const severity = f.severity as string;
        acc[severity] = (acc[severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const byStatus = enrichedFlags.reduce(
      (acc, f) => {
        const status = f.status as string;
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      flags: enrichedFlags,
      total,
      bySeverity,
      byStatus,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

/**
 * Create fraud flag (admin or system action)
 */
export const createFraudFlag = mutation({
  args: {
    userId: v.id("users"),
    adminId: v.optional(v.id("users")),
    type: v.string(),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")),
    description: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create audit log entry for fraud flag
    const flagId = await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: `fraud.${args.type}`,
      resourceType: args.resourceType ?? "fraud",
      resourceId: args.resourceId ?? args.userId,
      metadata: {
        severity: args.severity,
        status: "pending",
        description: args.description,
        flaggedBy: args.adminId ?? "system",
        ...args.metadata,
      },
      timestamp: now,
    });

    // If critical severity, consider suspending the user
    if (args.severity === "critical") {
      const user = await ctx.db.get(args.userId);
      if (user && user.status === "active") {
        await ctx.db.patch(args.userId, {
          status: "suspended",
          updatedAt: now,
        });

        // Log the auto-suspension
        await ctx.db.insert("auditLog", {
          userId: args.adminId,
          action: "admin.user.auto_suspended",
          resourceType: "users",
          resourceId: args.userId,
          metadata: {
            reason: "Critical fraud flag triggered",
            fraudFlagId: flagId,
            previousStatus: user.status,
          },
          timestamp: now,
        });
      }
    }

    return flagId;
  },
});

/**
 * Review fraud flag (admin action)
 */
export const reviewFraudFlag = mutation({
  args: {
    flagId: v.id("auditLog"),
    adminId: v.id("users"),
    status: v.union(
      v.literal("investigating"),
      v.literal("confirmed"),
      v.literal("cleared"),
      v.literal("escalated")
    ),
    notes: v.string(),
    actionTaken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const flag = await ctx.db.get(args.flagId);
    if (!flag) {
      throw new Error("Fraud flag not found");
    }

    const oldMetadata = flag.metadata as Record<string, unknown> | undefined;
    const oldStatus = oldMetadata?.status ?? "pending";

    // Update the flag with review info
    await ctx.db.patch(args.flagId, {
      metadata: {
        ...oldMetadata,
        status: args.status,
        reviewedBy: args.adminId,
        reviewedAt: now,
        reviewNotes: args.notes,
        actionTaken: args.actionTaken,
      },
    });

    // Log the review action
    await ctx.db.insert("auditLog", {
      userId: args.adminId,
      action: "admin.fraud.reviewed",
      resourceType: "fraud",
      resourceId: args.flagId,
      changes: {
        old: { status: oldStatus },
        new: { status: args.status },
      },
      metadata: {
        originalFlagId: args.flagId,
        notes: args.notes,
        actionTaken: args.actionTaken,
      },
      timestamp: now,
    });

    // If confirmed, take appropriate action
    if (args.status === "confirmed" && flag.userId) {
      const user = await ctx.db.get(flag.userId);
      if (user && user.status === "active") {
        await ctx.db.patch(flag.userId, {
          status: "suspended",
          updatedAt: now,
        });

        await ctx.db.insert("auditLog", {
          userId: args.adminId,
          action: "admin.user.suspended",
          resourceType: "users",
          resourceId: flag.userId,
          metadata: {
            reason: "Fraud confirmed",
            fraudFlagId: args.flagId,
            previousStatus: user.status,
          },
          timestamp: now,
        });
      }
    }

    // If cleared and user was suspended, consider reactivating
    if (args.status === "cleared" && flag.userId && args.actionTaken === "reactivate_user") {
      const user = await ctx.db.get(flag.userId);
      if (user && user.status === "suspended") {
        await ctx.db.patch(flag.userId, {
          status: "active",
          updatedAt: now,
        });

        await ctx.db.insert("auditLog", {
          userId: args.adminId,
          action: "admin.user.reactivated",
          resourceType: "users",
          resourceId: flag.userId,
          metadata: {
            reason: "Fraud flag cleared",
            fraudFlagId: args.flagId,
          },
          timestamp: now,
        });
      }
    }

    return args.flagId;
  },
});

// ============================================================================
// PLATFORM STATISTICS
// ============================================================================

/**
 * Get comprehensive platform statistics
 */
export const getPlatformStats = query({
  args: {
    period: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const period = args.period ?? "week";

    let startDate: number;
    switch (period) {
      case "day":
        startDate = now - 24 * 60 * 60 * 1000;
        break;
      case "week":
        startDate = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        startDate = now - 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        startDate = 0;
    }

    // Get all data
    const allUsers = await ctx.db.query("users").collect();
    const allOrders = await ctx.db.query("orders").collect();
    const allTrades = await ctx.db.query("trades").collect();
    const allDeposits = await ctx.db.query("deposits").collect();
    const allWithdrawals = await ctx.db.query("withdrawals").collect();

    // Filter by period
    const periodUsers = allUsers.filter((u) => u.createdAt >= startDate);
    const periodOrders = allOrders.filter((o) => o.createdAt >= startDate);
    const periodTrades = allTrades.filter((t) => t.executedAt >= startDate);
    const periodDeposits = allDeposits.filter((d) => d.createdAt >= startDate);
    const periodWithdrawals = allWithdrawals.filter((w) => w.createdAt >= startDate);

    // Calculate user stats
    const userStats = {
      total: allUsers.length,
      active: allUsers.filter((u) => u.status === "active").length,
      suspended: allUsers.filter((u) => u.status === "suspended").length,
      newInPeriod: periodUsers.length,
      byKYCStatus: allUsers.reduce(
        (acc, u) => {
          acc[u.kycStatus] = (acc[u.kycStatus] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      byKYCTier: allUsers.reduce(
        (acc, u) => {
          acc[u.kycTier] = (acc[u.kycTier] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    // Calculate order stats
    const orderStats = {
      total: allOrders.length,
      inPeriod: periodOrders.length,
      byStatus: allOrders.reduce(
        (acc, o) => {
          acc[o.status] = (acc[o.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      byAssetClass: allOrders.reduce(
        (acc, o) => {
          acc[o.assetClass] = (acc[o.assetClass] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    // Calculate trade stats
    const tradeStats = {
      total: allTrades.length,
      inPeriod: periodTrades.length,
      totalVolume: allTrades.reduce((sum, t) => sum + t.notionalValue, 0),
      periodVolume: periodTrades.reduce((sum, t) => sum + t.notionalValue, 0),
      totalFees: allTrades.reduce((sum, t) => sum + t.fee, 0),
      periodFees: periodTrades.reduce((sum, t) => sum + t.fee, 0),
    };

    // Calculate deposit stats
    const depositStats = {
      total: allDeposits.length,
      inPeriod: periodDeposits.length,
      totalAmount: allDeposits
        .filter((d) => d.status === "completed")
        .reduce((sum, d) => sum + d.amount, 0),
      periodAmount: periodDeposits
        .filter((d) => d.status === "completed")
        .reduce((sum, d) => sum + d.amount, 0),
      pending: allDeposits.filter((d) => d.status === "pending").length,
      byMethod: allDeposits.reduce(
        (acc, d) => {
          acc[d.method] = (acc[d.method] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    // Calculate withdrawal stats
    const withdrawalStats = {
      total: allWithdrawals.length,
      inPeriod: periodWithdrawals.length,
      totalAmount: allWithdrawals
        .filter((w) => w.status === "completed")
        .reduce((sum, w) => sum + w.amount, 0),
      periodAmount: periodWithdrawals
        .filter((w) => w.status === "completed")
        .reduce((sum, w) => sum + w.amount, 0),
      pending: allWithdrawals.filter((w) => w.status === "pending").length,
      pendingAmount: allWithdrawals
        .filter((w) => w.status === "pending")
        .reduce((sum, w) => sum + w.amount, 0),
      byMethod: allWithdrawals.reduce(
        (acc, w) => {
          acc[w.method] = (acc[w.method] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    // Calculate net flow
    const netFlow = depositStats.totalAmount - withdrawalStats.totalAmount;
    const periodNetFlow = depositStats.periodAmount - withdrawalStats.periodAmount;

    return {
      period,
      startDate,
      endDate: now,
      users: userStats,
      orders: orderStats,
      trades: tradeStats,
      deposits: depositStats,
      withdrawals: withdrawalStats,
      financials: {
        netFlow,
        periodNetFlow,
        totalRevenue: tradeStats.totalFees,
        periodRevenue: tradeStats.periodFees,
      },
      generatedAt: now,
    };
  },
});

/**
 * Get admin audit log with enriched data
 */
export const getAdminAuditLog = query({
  args: {
    adminOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db.query("auditLog").order("desc").take(5000);

    // Filter for admin actions only if requested
    if (args.adminOnly) {
      logs = logs.filter((l) => l.action.startsWith("admin."));
    }

    const total = logs.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 100;

    // Enrich with user info
    const enrichedLogs = await Promise.all(
      logs.slice(offset, offset + limit).map(async (log) => {
        let userEmail: string | undefined;
        let userDisplayName: string | undefined;
        if (log.userId) {
          const user = await ctx.db.get(log.userId);
          userEmail = user?.email;
          userDisplayName = user?.displayName;
        }
        return {
          ...log,
          userEmail,
          userDisplayName,
        };
      })
    );

    // Group by action for summary
    const byAction = logs.slice(0, 1000).reduce(
      (acc, log) => {
        acc[log.action] = (acc[log.action] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      logs: enrichedLogs,
      total,
      byAction,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    };
  },
});

// ============================================================================
// ADMIN VERIFICATION
// ============================================================================

/**
 * Check if a user is an admin
 * Admin status can be determined by:
 * 1. Email domain (e.g., @pull.app)
 * 2. Specific admin emails list
 * 3. A role field (if added to schema)
 */
export const isAdmin = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return false;

    // Check against admin email domains
    const adminDomains = ["pull.app", "admin.pull.app"];
    const emailDomain = user.email.split("@")[1];
    if (adminDomains.includes(emailDomain)) {
      return true;
    }

    // Check against specific admin emails (could be env var in production)
    const adminEmails = process.env.ADMIN_EMAILS?.split(",") ?? [];
    if (adminEmails.includes(user.email)) {
      return true;
    }

    // Check kycTier for institutional (highest tier)
    // This is a fallback - in production you'd want a proper role field
    if (user.kycTier === "institutional") {
      return true;
    }

    return false;
  },
});
