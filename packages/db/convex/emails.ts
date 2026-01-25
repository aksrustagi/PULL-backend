import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticatedQuery, authenticatedMutation, systemMutation } from "./lib/auth";
import { Id } from "./_generated/dataModel";

/**
 * Email queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get emails for a user
 */
export const getEmails = authenticatedQuery({
  args: {
    accountId: v.optional(v.id("emailAccounts")),
    status: v.optional(v.string()),
    folder: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    let emailQuery = ctx.db.query("emails");

    if (args.accountId && args.folder) {
      emailQuery = emailQuery.withIndex("by_folder", (q) =>
        q.eq("accountId", args.accountId!).eq("folderId", args.folder!)
      );
    } else if (args.status) {
      emailQuery = emailQuery.withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", args.status as "unread")
      );
    } else {
      emailQuery = emailQuery.withIndex("by_user", (q) => q.eq("userId", userId));
    }

    const emails = await emailQuery.order("desc").take(args.limit ?? 50);

    return {
      emails,
      hasMore: emails.length === (args.limit ?? 50),
    };
  },
});

/**
 * Get emails by user (simplified)
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    const emails = await q.order("desc").take(args.limit ?? 50);

    if (args.status) {
      return emails.filter(e => e.status === args.status);
    }
    return emails;
  },
});

/**
 * Get emails by thread ID
 */
export const getByThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

/**
 * Get email by ID
 */
export const getById = authenticatedQuery({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      return null;
    }
    return email;
  },
});

/**
 * Get unread emails
 */
export const getUnread = authenticatedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("emails")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "unread")
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get email thread
 */
export const getThread = authenticatedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    return emails.filter((email) => email.userId === userId);
  },
});

/**
 * Search emails
 */
export const search = authenticatedQuery({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    let searchQuery = ctx.db
      .query("emails")
      .withSearchIndex("search_emails", (q) => {
        let search = q.search("subject", args.query).eq("userId", userId);
        if (args.status) {
          search = search.eq("status", args.status as "unread");
        }
        if (args.category) {
          search = search.eq("triageCategory", args.category);
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * Get email accounts for user
 */
export const getAccounts = authenticatedQuery({
  args: {},
  handler: async (ctx, _args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get email stats
 */
export const getStats = authenticatedQuery({
  args: {},
  handler: async (ctx, _args) => {
    const userId = ctx.userId as Id<"users">;
    const unread = await ctx.db
      .query("emails")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "unread")
      )
      .collect();

    const urgent = unread.filter((e) => e.triagePriority === "urgent");
    const actionRequired = unread.filter((e) => e.triageActionRequired);

    return {
      totalUnread: unread.length,
      urgentCount: urgent.length,
      actionRequiredCount: actionRequired.length,
      byCategory: unread.reduce(
        (acc, e) => {
          const cat = e.triageCategory ?? "other";
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Upsert an email (sync from Nylas)
 */
export const upsertEmail = systemMutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
    externalId: v.string(),
    threadId: v.string(),
    folderId: v.string(),
    folderName: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    toEmails: v.array(v.string()),
    ccEmails: v.array(v.string()),
    subject: v.string(),
    snippet: v.string(),
    bodyPlain: v.optional(v.string()),
    hasAttachments: v.boolean(),
    attachmentCount: v.number(),
    isStarred: v.boolean(),
    isImportant: v.boolean(),
    labels: v.array(v.string()),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if email exists
    const existing = await ctx.db
      .query("emails")
      .withIndex("by_account")
      .filter((q) =>
        q.and(
          q.eq(q.field("accountId"), args.accountId),
          q.eq(q.field("externalId"), args.externalId)
        )
      )
      .unique();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        folderId: args.folderId,
        folderName: args.folderName,
        isStarred: args.isStarred,
        isImportant: args.isImportant,
        labels: args.labels,
        syncedAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new
    const emailId = await ctx.db.insert("emails", {
      accountId: args.accountId,
      userId: args.userId,
      externalId: args.externalId,
      threadId: args.threadId,
      folderId: args.folderId,
      folderName: args.folderName,
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      toEmails: args.toEmails,
      ccEmails: args.ccEmails,
      subject: args.subject,
      snippet: args.snippet,
      bodyPlain: args.bodyPlain,
      hasAttachments: args.hasAttachments,
      attachmentCount: args.attachmentCount,
      status: "unread",
      isStarred: args.isStarred,
      isImportant: args.isImportant,
      labels: args.labels,
      receivedAt: args.receivedAt,
      syncedAt: now,
      updatedAt: now,
    });

    return emailId;
  },
});

/**
 * Update email triage (from AI processing)
 */
export const updateTriage = systemMutation({
  args: {
    id: v.id("emails"),
    priority: v.string(),
    category: v.string(),
    confidence: v.number(),
    summary: v.optional(v.string()),
    actionRequired: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.id, {
      triagePriority: args.priority,
      triageCategory: args.category,
      triageConfidence: args.confidence,
      triageSummary: args.summary,
      triageActionRequired: args.actionRequired,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Mark email as read
 */
export const markRead = authenticatedMutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      throw new Error("Email not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "read",
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Mark multiple emails as read
 */
export const markManyRead = authenticatedMutation({
  args: { ids: v.array(v.id("emails")) },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    for (const id of args.ids) {
      const email = await ctx.db.get(id);
      if (!email || email.userId !== userId) {
        throw new Error("Email not found or access denied");
      }
      await ctx.db.patch(id, {
        status: "read",
        updatedAt: now,
      });
    }

    return { count: args.ids.length };
  },
});

/**
 * Archive email
 */
export const archiveEmail = authenticatedMutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      throw new Error("Email not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Snooze email
 */
export const snoozeEmail = authenticatedMutation({
  args: {
    id: v.id("emails"),
    until: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      throw new Error("Email not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "snoozed",
      snoozedUntil: args.until,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Star/unstar email
 */
export const toggleStar = authenticatedMutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      throw new Error("Email not found or access denied");
    }

    await ctx.db.patch(args.id, {
      isStarred: !email.isStarred,
      updatedAt: Date.now(),
    });

    return { isStarred: !email.isStarred };
  },
});

/**
 * Delete email (move to trash)
 */
export const deleteEmail = authenticatedMutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const email = await ctx.db.get(args.id);
    if (!email || email.userId !== userId) {
      throw new Error("Email not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "deleted",
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Update email status (generic)
 */
export const updateStatus = mutation({
  args: {
    id: v.id("emails"),
    status: v.union(
      v.literal("unread"),
      v.literal("read"),
      v.literal("archived"),
      v.literal("deleted"),
      v.literal("snoozed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Connect email account
 */
export const connectAccount = authenticatedMutation({
  args: {
    provider: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    grantId: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Check if account already connected
    const existing = await ctx.db
      .query("emailAccounts")
      .withIndex("by_grant", (q) => q.eq("grantId", args.grantId))
      .unique();

    if (existing) {
      return existing._id;
    }

    // If this is the first account, make it default
    const existingAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const isDefault = args.isDefault ?? existingAccounts.length === 0;

    const accountId = await ctx.db.insert("emailAccounts", {
      userId,
      provider: args.provider,
      email: args.email,
      name: args.name,
      grantId: args.grantId,
      syncStatus: "syncing",
      isDefault,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId,
      action: "email.account_connected",
      resourceType: "emailAccounts",
      resourceId: accountId,
      metadata: { provider: args.provider, email: args.email },
      timestamp: now,
    });

    return accountId;
  },
});

/**
 * Update account sync status
 */
export const updateAccountSync = systemMutation({
  args: {
    accountId: v.id("emailAccounts"),
    syncStatus: v.union(
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("error"),
      v.literal("disabled")
    ),
    syncCursor: v.optional(v.string()),
    lastSyncError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.accountId, {
      syncStatus: args.syncStatus,
      syncCursor: args.syncCursor,
      lastSyncError: args.lastSyncError,
      lastSyncAt: args.syncStatus === "synced" ? now : undefined,
      updatedAt: now,
    });

    return args.accountId;
  },
});
