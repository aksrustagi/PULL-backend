import { v } from "convex/values";
import { query } from "./_generated/server";
import { authenticatedQuery, systemMutation } from "./lib/auth";
import { Id } from "./_generated/dataModel";

/**
 * Audit log queries and mutations for PULL
 * Append-only audit trail for compliance and debugging
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get audit logs by user
 */
export const getByUser = authenticatedQuery({
  args: {
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;

    let logs = await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 100);

    if (args.startDate) {
      logs = logs.filter((l) => l.timestamp >= args.startDate!);
    }
    if (args.endDate) {
      logs = logs.filter((l) => l.timestamp <= args.endDate!);
    }

    return logs;
  },
});

// TODO: Restrict to admin users
/**
 * Get audit logs by resource
 */
export const getByResource = query({
  args: {
    resourceType: v.string(),
    resourceId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// TODO: Restrict to admin users
/**
 * Get audit logs by action type
 */
export const getByAction = query({
  args: {
    action: v.string(),
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("auditLog")
      .withIndex("by_action", (q) => q.eq("action", args.action));

    if (args.startDate) {
      query = query.filter((q) => q.gte(q.field("timestamp"), args.startDate!));
    }

    return await query.order("desc").take(args.limit ?? 100);
  },
});

// TODO: Restrict to admin users
/**
 * Get audit logs by date range
 */
export const getByDateRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    userId: v.optional(v.id("users")),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db
      .query("auditLog")
      .order("desc")
      .take(1000); // Get a reasonable batch

    // Filter by date range
    logs = logs.filter(
      (l) => l.timestamp >= args.startDate && l.timestamp <= args.endDate
    );

    // Filter by user if specified
    if (args.userId) {
      logs = logs.filter((l) => l.userId === args.userId);
    }

    // Filter by action if specified
    if (args.action) {
      logs = logs.filter((l) => l.action === args.action);
    }

    return logs.slice(0, args.limit ?? 100);
  },
});

// TODO: Restrict to admin users
/**
 * Get recent activity summary
 */
export const getActivitySummary = query({
  args: {
    hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursAgo = (args.hours ?? 24) * 60 * 60 * 1000;
    const since = Date.now() - hoursAgo;

    const logs = await ctx.db
      .query("auditLog")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), since))
      .take(10000);

    // Group by action
    const byAction = logs.reduce(
      (acc, log) => {
        acc[log.action] = (acc[log.action] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by resource type
    const byResource = logs.reduce(
      (acc, log) => {
        acc[log.resourceType] = (acc[log.resourceType] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count unique users
    const uniqueUsers = new Set(logs.filter((l) => l.userId).map((l) => l.userId))
      .size;

    return {
      totalEvents: logs.length,
      uniqueUsers,
      byAction,
      byResource,
      period: {
        start: since,
        end: Date.now(),
        hours: args.hours ?? 24,
      },
    };
  },
});

// TODO: Restrict to admin users
/**
 * Search audit logs
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Simple search through recent logs
    // In production, you'd use a proper search index
    const logs = await ctx.db.query("auditLog").order("desc").take(1000);

    const searchLower = args.query.toLowerCase();

    return logs
      .filter(
        (l) =>
          l.action.toLowerCase().includes(searchLower) ||
          l.resourceType.toLowerCase().includes(searchLower) ||
          l.resourceId.toLowerCase().includes(searchLower) ||
          JSON.stringify(l.metadata ?? {})
            .toLowerCase()
            .includes(searchLower)
      )
      .slice(0, args.limit ?? 50);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Log an audit event (append-only)
 */
export const log = systemMutation({
  args: {
    userId: v.optional(v.id("users")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    changes: v.optional(v.any()),
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auditId = await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      changes: args.changes,
      metadata: args.metadata,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      requestId: args.requestId,
      timestamp: Date.now(),
    });

    return auditId;
  },
});

/**
 * Log batch of events
 */
export const logBatch = systemMutation({
  args: {
    events: v.array(
      v.object({
        userId: v.optional(v.id("users")),
        action: v.string(),
        resourceType: v.string(),
        resourceId: v.string(),
        changes: v.optional(v.any()),
        metadata: v.optional(v.any()),
        ipAddress: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        requestId: v.optional(v.string()),
        timestamp: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: string[] = [];

    for (const event of args.events) {
      const auditId = await ctx.db.insert("auditLog", {
        userId: event.userId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        changes: event.changes,
        metadata: event.metadata,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        requestId: event.requestId,
        timestamp: event.timestamp ?? now,
      });
      ids.push(auditId);
    }

    return { count: ids.length, ids };
  },
});

/**
 * Log webhook event
 */
export const logWebhook = systemMutation({
  args: {
    source: v.string(),
    eventType: v.string(),
    externalId: v.optional(v.string()),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const webhookId = await ctx.db.insert("webhookEvents", {
      source: args.source,
      eventType: args.eventType,
      externalId: args.externalId,
      payload: args.payload,
      status: "received",
      receivedAt: now,
    });

    return webhookId;
  },
});

/**
 * Update webhook processing status
 */
export const updateWebhookStatus = systemMutation({
  args: {
    webhookId: v.id("webhookEvents"),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.webhookId, {
      status: args.status,
      error: args.error,
      processedAt: args.status === "processed" ? now : undefined,
    });

    return args.webhookId;
  },
});
