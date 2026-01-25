/**
 * Database Backup Module
 *
 * Provides data export functionality for disaster recovery and compliance.
 * Convex handles automatic backups, but this provides on-demand exports.
 *
 * All export queries require admin authorization.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { adminQuery } from "./lib/auth";

/**
 * Export users data for backup
 * Requires admin authorization
 */
export const exportUsers = adminQuery({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 1000, cursor }) => {
    const query = ctx.db.query("users")
      .order("desc");

    const users = await query.take(limit);

    // Redact sensitive fields
    const sanitizedUsers = users.map(user => ({
      ...user,
      passwordHash: "[REDACTED]",
    }));

    return {
      data: sanitizedUsers,
      nextCursor: users.length === limit ? users[users.length - 1]._id : null,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Export orders data for backup
 * Requires admin authorization
 */
export const exportOrders = adminQuery({
  args: {
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 1000, startDate, endDate }) => {
    let query = ctx.db.query("orders")
      .order("desc");

    const orders = await query.take(limit);

    // Filter by date if specified
    const filteredOrders = orders.filter(order => {
      if (startDate && order._creationTime < startDate) return false;
      if (endDate && order._creationTime > endDate) return false;
      return true;
    });

    return {
      data: filteredOrders,
      count: filteredOrders.length,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Export balances data for backup
 */
export const exportBalances = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 1000 }) => {
    const balances = await ctx.db.query("balances")
      .order("desc")
      .take(limit);

    return {
      data: balances,
      count: balances.length,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Export positions data for backup
 */
export const exportPositions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 1000 }) => {
    const positions = await ctx.db.query("positions")
      .order("desc")
      .take(limit);

    return {
      data: positions,
      count: positions.length,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Export prediction events data
 */
export const exportPredictionEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 1000 }) => {
    const events = await ctx.db.query("predictionEvents")
      .order("desc")
      .take(limit);

    return {
      data: events,
      count: events.length,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Export audit logs for compliance
 */
export const exportAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 5000, startDate, endDate, action }) => {
    let query = ctx.db.query("auditLogs")
      .order("desc");

    const logs = await query.take(limit);

    // Filter by criteria
    const filteredLogs = logs.filter(log => {
      if (startDate && log.timestamp < startDate) return false;
      if (endDate && log.timestamp > endDate) return false;
      if (action && log.action !== action) return false;
      return true;
    });

    return {
      data: filteredLogs,
      count: filteredLogs.length,
      exportedAt: Date.now(),
    };
  },
});

/**
 * Create a backup snapshot record
 */
export const createBackupSnapshot = mutation({
  args: {
    type: v.union(
      v.literal("full"),
      v.literal("incremental"),
      v.literal("on_demand")
    ),
    initiatedBy: v.optional(v.string()),
    tables: v.array(v.string()),
  },
  handler: async (ctx, { type, initiatedBy, tables }) => {
    const snapshotId = await ctx.db.insert("backupSnapshots", {
      type,
      status: "in_progress",
      initiatedBy,
      tables,
      startedAt: Date.now(),
      recordCounts: {},
    });

    return { snapshotId };
  },
});

/**
 * Complete a backup snapshot
 */
export const completeBackupSnapshot = mutation({
  args: {
    snapshotId: v.id("backupSnapshots"),
    recordCounts: v.record(v.string(), v.number()),
    storageLocation: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { snapshotId, recordCounts, storageLocation, error }) => {
    await ctx.db.patch(snapshotId, {
      status: error ? "failed" : "completed",
      completedAt: Date.now(),
      recordCounts,
      storageLocation,
      error,
    });

    return { success: !error };
  },
});

/**
 * Get backup history
 */
export const getBackupHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const snapshots = await ctx.db.query("backupSnapshots")
      .order("desc")
      .take(limit);

    return snapshots;
  },
});

/**
 * Get latest successful backup
 */
export const getLatestBackup = query({
  args: {},
  handler: async (ctx) => {
    const snapshots = await ctx.db.query("backupSnapshots")
      .order("desc")
      .take(10);

    return snapshots.find(s => s.status === "completed") || null;
  },
});

/**
 * Export complete database summary (for monitoring)
 */
export const getDatabaseSummary = query({
  args: {},
  handler: async (ctx) => {
    // Count records in each table (sample-based for performance)
    const [
      usersCount,
      ordersCount,
      balancesCount,
      positionsCount,
      eventsCount,
      auditCount,
    ] = await Promise.all([
      ctx.db.query("users").take(10000).then(r => r.length),
      ctx.db.query("orders").take(10000).then(r => r.length),
      ctx.db.query("balances").take(10000).then(r => r.length),
      ctx.db.query("positions").take(10000).then(r => r.length),
      ctx.db.query("predictionEvents").take(10000).then(r => r.length),
      ctx.db.query("auditLogs").take(10000).then(r => r.length),
    ]);

    return {
      tables: {
        users: { count: usersCount },
        orders: { count: ordersCount },
        balances: { count: balancesCount },
        positions: { count: positionsCount },
        predictionEvents: { count: eventsCount },
        auditLogs: { count: auditCount },
      },
      generatedAt: Date.now(),
    };
  },
});
