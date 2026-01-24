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
