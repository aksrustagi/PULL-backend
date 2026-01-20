/**
 * KYC Convex Schema and Functions
 * Database schema and functions for KYC verification records
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ==========================================================================
// QUERIES
// ==========================================================================

/**
 * Get KYC record by user ID
 */
export const getKYCByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Get KYC record by Sumsub applicant ID
 */
export const getKYCBySumsubId = query({
  args: { applicantId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_sumsub", (q) => q.eq("sumsubApplicantId", args.applicantId))
      .unique();
  },
});

/**
 * Get KYC record by Checkr report ID
 */
export const getKYCByCheckrReport = query({
  args: { reportId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_checkr", (q) => q.eq("checkrReportId", args.reportId))
      .unique();
  },
});

/**
 * Get KYC records with expired status for re-verification cron
 */
export const getExpiredKYC = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const records = await ctx.db.query("kycRecords").collect();

    return records.filter(
      (record) =>
        record.status === "approved" &&
        record.expiresAt &&
        record.expiresAt < now
    );
  },
});

/**
 * Get KYC records expiring within days
 */
export const getExpiringKYC = query({
  args: { withinDays: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const threshold = now + args.withinDays * 24 * 60 * 60 * 1000;

    const records = await ctx.db.query("kycRecords").collect();

    return records.filter(
      (record) =>
        record.status === "approved" &&
        record.expiresAt &&
        record.expiresAt > now &&
        record.expiresAt < threshold
    );
  },
});

/**
 * Get all KYC records by status
 */
export const getKYCByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// ==========================================================================
// MUTATIONS
// ==========================================================================

/**
 * Create a new KYC record
 */
export const createKYCRecord = mutation({
  args: {
    userId: v.id("users"),
    targetTier: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("accredited")
    ),
    workflowId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing record
    const existing = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      throw new Error("KYC record already exists for this user");
    }

    const id = await ctx.db.insert("kycRecords", {
      userId: args.userId,
      currentTier: "none",
      targetTier: args.targetTier,
      status: "pending",
      bankLinked: false,
      workflowId: args.workflowId,
      startedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "kyc.record_created",
      details: {
        targetTier: args.targetTier,
        workflowId: args.workflowId,
      },
      timestamp: now,
    });

    return id;
  },
});

/**
 * Update KYC status
 */
export const updateKYCStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
    tier: v.optional(
      v.union(
        v.literal("none"),
        v.literal("basic"),
        v.literal("enhanced"),
        v.literal("accredited")
      )
    ),
    sumsubApplicantId: v.optional(v.string()),
    sumsubReviewStatus: v.optional(v.string()),
    sumsubReviewResult: v.optional(v.string()),
    sumsubCompletedAt: v.optional(v.number()),
    checkrCandidateId: v.optional(v.string()),
    checkrReportId: v.optional(v.string()),
    checkrStatus: v.optional(v.string()),
    checkrResult: v.optional(v.string()),
    checkrCompletedAt: v.optional(v.number()),
    parallelRequestId: v.optional(v.string()),
    accreditationStatus: v.optional(v.string()),
    accreditationMethod: v.optional(v.string()),
    accreditationExpiresAt: v.optional(v.number()),
    plaidItemId: v.optional(v.string()),
    plaidAccessToken: v.optional(v.string()),
    plaidAccountId: v.optional(v.string()),
    bankLinked: v.optional(v.boolean()),
    sanctionsScreeningId: v.optional(v.string()),
    sanctionsResult: v.optional(v.string()),
    sanctionsRiskScore: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!record) {
      throw new Error("KYC record not found");
    }

    // Build update object with only defined values
    const updateObj: Partial<Doc<"kycRecords">> = {};

    if (updates.status !== undefined) updateObj.status = updates.status;
    if (updates.tier !== undefined) updateObj.currentTier = updates.tier;
    if (updates.sumsubApplicantId !== undefined)
      updateObj.sumsubApplicantId = updates.sumsubApplicantId;
    if (updates.sumsubReviewStatus !== undefined)
      updateObj.sumsubReviewStatus = updates.sumsubReviewStatus;
    if (updates.sumsubReviewResult !== undefined)
      updateObj.sumsubReviewResult = updates.sumsubReviewResult;
    if (updates.sumsubCompletedAt !== undefined)
      updateObj.sumsubCompletedAt = updates.sumsubCompletedAt;
    if (updates.checkrCandidateId !== undefined)
      updateObj.checkrCandidateId = updates.checkrCandidateId;
    if (updates.checkrReportId !== undefined)
      updateObj.checkrReportId = updates.checkrReportId;
    if (updates.checkrStatus !== undefined)
      updateObj.checkrStatus = updates.checkrStatus;
    if (updates.checkrResult !== undefined)
      updateObj.checkrResult = updates.checkrResult;
    if (updates.checkrCompletedAt !== undefined)
      updateObj.checkrCompletedAt = updates.checkrCompletedAt;
    if (updates.parallelRequestId !== undefined)
      updateObj.parallelRequestId = updates.parallelRequestId;
    if (updates.accreditationStatus !== undefined)
      updateObj.accreditationStatus = updates.accreditationStatus;
    if (updates.accreditationMethod !== undefined)
      updateObj.accreditationMethod = updates.accreditationMethod;
    if (updates.accreditationExpiresAt !== undefined)
      updateObj.accreditationExpiresAt = updates.accreditationExpiresAt;
    if (updates.plaidItemId !== undefined)
      updateObj.plaidItemId = updates.plaidItemId;
    if (updates.plaidAccessToken !== undefined)
      updateObj.plaidAccessToken = updates.plaidAccessToken;
    if (updates.plaidAccountId !== undefined)
      updateObj.plaidAccountId = updates.plaidAccountId;
    if (updates.bankLinked !== undefined)
      updateObj.bankLinked = updates.bankLinked;
    if (updates.sanctionsScreeningId !== undefined)
      updateObj.sanctionsScreeningId = updates.sanctionsScreeningId;
    if (updates.sanctionsResult !== undefined)
      updateObj.sanctionsResult = updates.sanctionsResult;
    if (updates.sanctionsRiskScore !== undefined)
      updateObj.sanctionsRiskScore = updates.sanctionsRiskScore;
    if (updates.rejectionReason !== undefined)
      updateObj.rejectionReason = updates.rejectionReason;
    if (updates.workflowId !== undefined)
      updateObj.workflowId = updates.workflowId;
    if (updates.completedAt !== undefined)
      updateObj.completedAt = updates.completedAt;
    if (updates.expiresAt !== undefined)
      updateObj.expiresAt = updates.expiresAt;

    await ctx.db.patch(record._id, updateObj);

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId,
      action: "kyc.status_updated",
      details: {
        previousStatus: record.status,
        newStatus: updates.status,
        updates,
      },
      timestamp: now,
    });
  },
});

/**
 * Mark KYC as expired
 */
export const markKYCExpired = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!record) {
      throw new Error("KYC record not found");
    }

    await ctx.db.patch(record._id, {
      status: "expired",
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "kyc.expired",
      details: {
        previousTier: record.currentTier,
        expiresAt: record.expiresAt,
      },
      timestamp: now,
    });
  },
});

/**
 * Delete KYC record (GDPR compliance)
 */
export const deleteKYCRecord = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!record) {
      return;
    }

    await ctx.db.delete(record._id);

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "kyc.record_deleted",
      details: {
        reason: "GDPR compliance",
      },
      timestamp: now,
    });
  },
});

// ==========================================================================
// WEBHOOK EVENTS
// ==========================================================================

/**
 * Store raw webhook event
 */
export const storeWebhookEvent = mutation({
  args: {
    source: v.union(
      v.literal("sumsub"),
      v.literal("checkr"),
      v.literal("plaid"),
      v.literal("parallel_markets")
    ),
    eventType: v.string(),
    eventId: v.optional(v.string()),
    payload: v.string(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("webhookEvents", {
      source: args.source,
      eventType: args.eventType,
      eventId: args.eventId,
      payload: args.payload,
      receivedAt: now,
      processedAt: args.processedAt,
      error: args.error,
    });
  },
});

/**
 * Check if webhook event was already processed
 */
export const isWebhookEventProcessed = query({
  args: {
    source: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("webhookEvents")
      .filter((q) =>
        q.and(
          q.eq(q.field("source"), args.source),
          q.eq(q.field("eventId"), args.eventId),
          q.neq(q.field("processedAt"), undefined)
        )
      )
      .first();

    return event !== null;
  },
});

/**
 * Mark webhook event as processed
 */
export const markWebhookProcessed = mutation({
  args: {
    id: v.id("webhookEvents"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      processedAt: Date.now(),
      error: args.error,
    });
  },
});
