/**
 * KYC Convex Schema and Functions
 * Database schema and functions for KYC verification records
 * Updated for Persona integration
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
 * Get KYC record by Persona inquiry ID
 */
export const getKYCByPersonaInquiry = query({
  args: { inquiryId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_persona", (q) => q.eq("personaInquiryId", args.inquiryId))
      .unique();
  },
});

/**
 * Get KYC record by Persona account ID
 */
export const getKYCByPersonaAccount = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db.query("kycRecords").collect();
    return records.find((r) => r.personaAccountId === args.accountId) ?? null;
  },
});

/**
 * Get KYC record by Sumsub applicant ID (legacy support)
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
 * Get all KYC records for a user (including history)
 */
export const getKYCRecords = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get user's current KYC status summary
 */
export const getUserKYCStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!record) {
      return {
        hasKYC: false,
        status: "not_started",
        currentTier: "none",
        targetTier: null,
        isVerified: false,
        canTrade: false,
        canDeposit: false,
        canWithdraw: false,
      };
    }

    const isVerified = record.status === "approved";
    const canTrade = isVerified && record.currentTier !== "none";
    const canDeposit = canTrade;
    const canWithdraw = canTrade && record.bankLinked;

    return {
      hasKYC: true,
      status: record.status,
      currentTier: record.currentTier,
      targetTier: record.targetTier,
      isVerified,
      canTrade,
      canDeposit,
      canWithdraw,
      personaInquiryId: record.personaInquiryId,
      personaAccountId: record.personaAccountId,
      completedAt: record.completedAt,
      expiresAt: record.expiresAt,
      bankLinked: record.bankLinked,
    };
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
 * Update KYC status - supports both Persona and legacy Sumsub fields
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
        v.literal("standard"),
        v.literal("enhanced"),
        v.literal("accredited")
      )
    ),
    // Persona fields
    personaInquiryId: v.optional(v.string()),
    personaAccountId: v.optional(v.string()),
    personaReviewStatus: v.optional(v.string()),
    personaReviewResult: v.optional(v.string()),
    personaCompletedAt: v.optional(v.number()),
    // Legacy Sumsub fields
    sumsubApplicantId: v.optional(v.string()),
    sumsubReviewStatus: v.optional(v.string()),
    sumsubReviewResult: v.optional(v.string()),
    sumsubCompletedAt: v.optional(v.number()),
    // Checkr fields
    checkrCandidateId: v.optional(v.string()),
    checkrReportId: v.optional(v.string()),
    checkrStatus: v.optional(v.string()),
    checkrResult: v.optional(v.string()),
    checkrCompletedAt: v.optional(v.number()),
    // Accreditation fields
    parallelRequestId: v.optional(v.string()),
    accreditationStatus: v.optional(v.string()),
    accreditationMethod: v.optional(v.string()),
    accreditationExpiresAt: v.optional(v.number()),
    // Plaid fields
    plaidItemId: v.optional(v.string()),
    plaidAccessToken: v.optional(v.string()),
    plaidAccountId: v.optional(v.string()),
    bankLinked: v.optional(v.boolean()),
    // Sanctions screening
    sanctionsScreeningId: v.optional(v.string()),
    sanctionsResult: v.optional(v.string()),
    sanctionsRiskScore: v.optional(v.number()),
    // Common fields
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
    // Persona fields
    if (updates.personaInquiryId !== undefined)
      updateObj.personaInquiryId = updates.personaInquiryId;
    if (updates.personaAccountId !== undefined)
      updateObj.personaAccountId = updates.personaAccountId;
    if (updates.personaReviewStatus !== undefined)
      updateObj.personaReviewStatus = updates.personaReviewStatus;
    if (updates.personaReviewResult !== undefined)
      updateObj.personaReviewResult = updates.personaReviewResult;
    if (updates.personaCompletedAt !== undefined)
      updateObj.personaCompletedAt = updates.personaCompletedAt;
    // Legacy Sumsub fields
    if (updates.sumsubApplicantId !== undefined)
      updateObj.sumsubApplicantId = updates.sumsubApplicantId;
    if (updates.sumsubReviewStatus !== undefined)
      updateObj.sumsubReviewStatus = updates.sumsubReviewStatus;
    if (updates.sumsubReviewResult !== undefined)
      updateObj.sumsubReviewResult = updates.sumsubReviewResult;
    if (updates.sumsubCompletedAt !== undefined)
      updateObj.sumsubCompletedAt = updates.sumsubCompletedAt;
    // Checkr fields
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
    // Accreditation fields
    if (updates.parallelRequestId !== undefined)
      updateObj.parallelRequestId = updates.parallelRequestId;
    if (updates.accreditationStatus !== undefined)
      updateObj.accreditationStatus = updates.accreditationStatus;
    if (updates.accreditationMethod !== undefined)
      updateObj.accreditationMethod = updates.accreditationMethod;
    if (updates.accreditationExpiresAt !== undefined)
      updateObj.accreditationExpiresAt = updates.accreditationExpiresAt;
    // Plaid fields
    if (updates.plaidItemId !== undefined)
      updateObj.plaidItemId = updates.plaidItemId;
    if (updates.plaidAccessToken !== undefined)
      updateObj.plaidAccessToken = updates.plaidAccessToken;
    if (updates.plaidAccountId !== undefined)
      updateObj.plaidAccountId = updates.plaidAccountId;
    if (updates.bankLinked !== undefined)
      updateObj.bankLinked = updates.bankLinked;
    // Sanctions screening
    if (updates.sanctionsScreeningId !== undefined)
      updateObj.sanctionsScreeningId = updates.sanctionsScreeningId;
    if (updates.sanctionsResult !== undefined)
      updateObj.sanctionsResult = updates.sanctionsResult;
    if (updates.sanctionsRiskScore !== undefined)
      updateObj.sanctionsRiskScore = updates.sanctionsRiskScore;
    // Common fields
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
 * Update KYC record by Persona inquiry ID (for webhook processing)
 */
export const updateKYCByPersonaInquiry = mutation({
  args: {
    inquiryId: v.string(),
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
        v.literal("standard"),
        v.literal("enhanced"),
        v.literal("accredited")
      )
    ),
    personaReviewStatus: v.optional(v.string()),
    personaReviewResult: v.optional(v.string()),
    personaCompletedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { inquiryId, ...updates } = args;
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_persona", (q) => q.eq("personaInquiryId", inquiryId))
      .unique();

    if (!record) {
      console.warn(`KYC record not found for Persona inquiry: ${inquiryId}`);
      return;
    }

    // Build update object
    const updateObj: Partial<Doc<"kycRecords">> = {};

    if (updates.status !== undefined) updateObj.status = updates.status;
    if (updates.tier !== undefined) updateObj.currentTier = updates.tier;
    if (updates.personaReviewStatus !== undefined)
      updateObj.personaReviewStatus = updates.personaReviewStatus;
    if (updates.personaReviewResult !== undefined)
      updateObj.personaReviewResult = updates.personaReviewResult;
    if (updates.personaCompletedAt !== undefined)
      updateObj.personaCompletedAt = updates.personaCompletedAt;
    if (updates.rejectionReason !== undefined)
      updateObj.rejectionReason = updates.rejectionReason;
    if (updates.completedAt !== undefined)
      updateObj.completedAt = updates.completedAt;
    if (updates.expiresAt !== undefined)
      updateObj.expiresAt = updates.expiresAt;

    await ctx.db.patch(record._id, updateObj);

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: record.userId,
      action: "kyc.status_updated_by_webhook",
      details: {
        source: "persona",
        inquiryId,
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

// ==========================================================================
// PERSONA-SPECIFIC FUNCTIONS
// ==========================================================================

/**
 * Create or update KYC record from Persona inquiry
 */
export const upsertKYCFromPersona = mutation({
  args: {
    userId: v.id("users"),
    personaInquiryId: v.string(),
    personaAccountId: v.optional(v.string()),
    targetTier: v.union(
      v.literal("basic"),
      v.literal("standard"),
      v.literal("enhanced"),
      v.literal("accredited")
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing record
    const existing = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        personaInquiryId: args.personaInquiryId,
        personaAccountId: args.personaAccountId,
        targetTier: args.targetTier,
        status: args.status ?? "in_progress",
      });

      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "kyc.record_updated",
        details: {
          personaInquiryId: args.personaInquiryId,
          targetTier: args.targetTier,
        },
        timestamp: now,
      });

      return existing._id;
    }

    // Create new record
    const id = await ctx.db.insert("kycRecords", {
      userId: args.userId,
      currentTier: "none",
      targetTier: args.targetTier,
      status: args.status ?? "pending",
      bankLinked: false,
      personaInquiryId: args.personaInquiryId,
      personaAccountId: args.personaAccountId,
      startedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "kyc.record_created",
      details: {
        personaInquiryId: args.personaInquiryId,
        targetTier: args.targetTier,
      },
      timestamp: now,
    });

    return id;
  },
});

/**
 * Get KYC verification history for a user
 */
export const getKYCHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get audit log entries for KYC
    const auditEntries = await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("action"), "kyc.record_created"),
          q.eq(q.field("action"), "kyc.status_updated"),
          q.eq(q.field("action"), "kyc.record_updated"),
          q.eq(q.field("action"), "kyc.status_updated_by_webhook"),
          q.eq(q.field("action"), "kyc.expired")
        )
      )
      .order("desc")
      .take(50);

    return auditEntries;
  },
});

/**
 * Get pending KYC reviews (for admin dashboard)
 */
export const getPendingKYCReviews = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db
      .query("kycRecords")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    return records.map((r) => ({
      id: r._id,
      userId: r.userId,
      targetTier: r.targetTier,
      currentTier: r.currentTier,
      personaInquiryId: r.personaInquiryId,
      startedAt: r.startedAt,
    }));
  },
});

/**
 * Get KYC statistics (for admin dashboard)
 */
export const getKYCStats = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("kycRecords").collect();

    const stats = {
      total: records.length,
      byStatus: {
        pending: 0,
        in_progress: 0,
        approved: 0,
        rejected: 0,
        expired: 0,
      },
      byTier: {
        none: 0,
        basic: 0,
        standard: 0,
        enhanced: 0,
        accredited: 0,
      },
    };

    for (const record of records) {
      if (record.status in stats.byStatus) {
        stats.byStatus[record.status as keyof typeof stats.byStatus]++;
      }
      if (record.currentTier in stats.byTier) {
        stats.byTier[record.currentTier as keyof typeof stats.byTier]++;
      }
    }

    return stats;
  },
});
