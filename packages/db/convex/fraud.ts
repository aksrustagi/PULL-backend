/**
 * Fraud Detection Database Tables and Functions
 * Convex tables for storing fraud flags, device fingerprints, and risk scores
 */

import { v } from 'convex/values';
import { mutation, query, internalMutation, internalQuery } from './_generated/server';

// ============================================================================
// Table Schemas (defined in schema.ts, duplicated here for reference)
// ============================================================================

/*
fraudFlags: defineTable({
  userId: v.string(),
  flagType: v.string(),
  severity: v.union(v.literal('warning'), v.literal('alert'), v.literal('critical')),
  reason: v.string(),
  evidence: v.optional(v.any()),
  status: v.union(v.literal('active'), v.literal('resolved'), v.literal('dismissed'), v.literal('false_positive')),
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
  resolution: v.optional(v.string()),
  notes: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_status', ['status'])
  .index('by_type', ['flagType'])
  .index('by_severity', ['severity'])
  .index('by_created', ['createdAt']),

deviceFingerprints: defineTable({
  fingerprintId: v.string(),
  userId: v.string(),
  hash: v.string(),
  userAgent: v.optional(v.string()),
  platform: v.optional(v.string()),
  screenResolution: v.optional(v.string()),
  timezone: v.optional(v.string()),
  language: v.optional(v.string()),
  hardwareConcurrency: v.optional(v.number()),
  canvasHash: v.optional(v.string()),
  webglHash: v.optional(v.string()),
  webglVendor: v.optional(v.string()),
  webglRenderer: v.optional(v.string()),
  audioHash: v.optional(v.string()),
  fontHash: v.optional(v.string()),
  isBot: v.boolean(),
  isEmulator: v.boolean(),
  isVirtualMachine: v.boolean(),
  trustScore: v.number(),
  isSuspicious: v.boolean(),
  suspiciousReasons: v.optional(v.array(v.string())),
  firstSeen: v.number(),
  lastSeen: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_hash', ['hash'])
  .index('by_fingerprint_id', ['fingerprintId']),

riskScores: defineTable({
  userId: v.string(),
  overallScore: v.number(),
  riskLevel: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')),
  velocityScore: v.number(),
  deviceScore: v.number(),
  ipScore: v.number(),
  behaviorScore: v.number(),
  multiAccountScore: v.number(),
  bonusAbuseScore: v.number(),
  tradingScore: v.number(),
  historyScore: v.number(),
  lastAssessment: v.number(),
  nextAssessment: v.number(),
  signalCount: v.number(),
  flagCount: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_risk_level', ['riskLevel'])
  .index('by_score', ['overallScore']),

fraudAlerts: defineTable({
  alertId: v.string(),
  alertType: v.string(),
  severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')),
  entityId: v.string(),
  entityType: v.union(v.literal('user'), v.literal('trade'), v.literal('market'), v.literal('transaction'), v.literal('device'), v.literal('ip')),
  userId: v.optional(v.string()),
  description: v.string(),
  evidence: v.optional(v.any()),
  status: v.union(v.literal('new'), v.literal('investigating'), v.literal('escalated'), v.literal('resolved'), v.literal('dismissed'), v.literal('false_positive')),
  assignedTo: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
  resolution: v.optional(v.object({
    action: v.string(),
    reason: v.string(),
    resolvedBy: v.string(),
    notes: v.optional(v.string()),
  })),
  relatedAlerts: v.optional(v.array(v.string())),
})
  .index('by_user', ['userId'])
  .index('by_entity', ['entityId'])
  .index('by_status', ['status'])
  .index('by_severity', ['severity'])
  .index('by_type', ['alertType'])
  .index('by_created', ['createdAt']),

ipHistory: defineTable({
  userId: v.string(),
  ipAddress: v.string(),
  isVPN: v.boolean(),
  isProxy: v.boolean(),
  isTor: v.boolean(),
  isDatacenter: v.boolean(),
  country: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  city: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  isp: v.optional(v.string()),
  asn: v.optional(v.string()),
  reputationScore: v.number(),
  firstSeen: v.number(),
  lastSeen: v.number(),
  accessCount: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_ip', ['ipAddress'])
  .index('by_user_ip', ['userId', 'ipAddress']),

velocityRecords: defineTable({
  userId: v.string(),
  actionType: v.string(),
  period: v.union(v.literal('hourly'), v.literal('daily'), v.literal('weekly'), v.literal('monthly')),
  count: v.number(),
  amount: v.number(),
  windowStart: v.number(),
  windowEnd: v.number(),
  lastAction: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_user_action', ['userId', 'actionType'])
  .index('by_user_action_period', ['userId', 'actionType', 'period']),

accountLinks: defineTable({
  userId: v.string(),
  linkedUserId: v.string(),
  linkType: v.string(),
  confidence: v.number(),
  evidence: v.optional(v.array(v.string())),
  firstDetected: v.number(),
  lastSeen: v.number(),
  isConfirmed: v.boolean(),
  confirmedBy: v.optional(v.string()),
  confirmedAt: v.optional(v.number()),
})
  .index('by_user', ['userId'])
  .index('by_linked_user', ['linkedUserId'])
  .index('by_link_type', ['linkType']),
*/

// ============================================================================
// Fraud Flags
// ============================================================================

export const createFraudFlag = mutation({
  args: {
    userId: v.string(),
    flagType: v.string(),
    severity: v.union(v.literal('warning'), v.literal('alert'), v.literal('critical')),
    reason: v.string(),
    evidence: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const flagId = await ctx.db.insert('fraudFlags', {
      userId: args.userId,
      flagType: args.flagType,
      severity: args.severity,
      reason: args.reason,
      evidence: args.evidence,
      status: 'active',
      createdAt: now,
      expiresAt: args.expiresAt,
      notes: args.notes,
    });

    return flagId;
  },
});

export const getFraudFlagsByUser = query({
  args: {
    userId: v.string(),
    includeResolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let flags = await ctx.db
      .query('fraudFlags')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    if (!args.includeResolved) {
      flags = flags.filter((f) => f.status === 'active');
    }

    // Filter out expired flags
    const now = Date.now();
    flags = flags.filter((f) => !f.expiresAt || f.expiresAt > now);

    return flags;
  },
});

export const getActiveFraudFlags = query({
  args: {
    severity: v.optional(v.union(v.literal('warning'), v.literal('alert'), v.literal('critical'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('fraudFlags')
      .withIndex('by_status', (q) => q.eq('status', 'active'));

    let flags = await query.collect();

    if (args.severity) {
      flags = flags.filter((f) => f.severity === args.severity);
    }

    // Filter out expired flags
    const now = Date.now();
    flags = flags.filter((f) => !f.expiresAt || f.expiresAt > now);

    if (args.limit) {
      flags = flags.slice(0, args.limit);
    }

    return flags;
  },
});

export const resolveFraudFlag = mutation({
  args: {
    flagId: v.id('fraudFlags'),
    resolution: v.string(),
    resolvedBy: v.string(),
    status: v.union(v.literal('resolved'), v.literal('dismissed'), v.literal('false_positive')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.flagId, {
      status: args.status,
      resolvedAt: now,
      resolvedBy: args.resolvedBy,
      resolution: args.resolution,
    });

    return { success: true };
  },
});

// ============================================================================
// Device Fingerprints
// ============================================================================

export const upsertDeviceFingerprint = mutation({
  args: {
    fingerprintId: v.string(),
    userId: v.string(),
    hash: v.string(),
    userAgent: v.optional(v.string()),
    platform: v.optional(v.string()),
    screenResolution: v.optional(v.string()),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    hardwareConcurrency: v.optional(v.number()),
    canvasHash: v.optional(v.string()),
    webglHash: v.optional(v.string()),
    webglVendor: v.optional(v.string()),
    webglRenderer: v.optional(v.string()),
    audioHash: v.optional(v.string()),
    fontHash: v.optional(v.string()),
    isBot: v.boolean(),
    isEmulator: v.boolean(),
    isVirtualMachine: v.boolean(),
    trustScore: v.number(),
    isSuspicious: v.boolean(),
    suspiciousReasons: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if fingerprint already exists
    const existing = await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_fingerprint_id', (q) => q.eq('fingerprintId', args.fingerprintId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastSeen: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert('deviceFingerprints', {
      ...args,
      firstSeen: now,
      lastSeen: now,
    });

    return id;
  },
});

export const getDevicesByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    return devices;
  },
});

export const getUsersByDevice = query({
  args: {
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .collect();

    return devices.map((d) => d.userId);
  },
});

export const getSuspiciousDevices = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const devices = await ctx.db.query('deviceFingerprints').collect();

    const suspicious = devices.filter((d) => d.isSuspicious || d.isBot || d.isEmulator);

    if (args.limit) {
      return suspicious.slice(0, args.limit);
    }

    return suspicious;
  },
});

// ============================================================================
// Risk Scores
// ============================================================================

export const upsertRiskScore = mutation({
  args: {
    userId: v.string(),
    overallScore: v.number(),
    riskLevel: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')),
    velocityScore: v.number(),
    deviceScore: v.number(),
    ipScore: v.number(),
    behaviorScore: v.number(),
    multiAccountScore: v.number(),
    bonusAbuseScore: v.number(),
    tradingScore: v.number(),
    historyScore: v.number(),
    signalCount: v.number(),
    flagCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const nextAssessment = now + 24 * 60 * 60 * 1000; // 24 hours

    // Check if score already exists
    const existing = await ctx.db
      .query('riskScores')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastAssessment: now,
        nextAssessment,
      });
      return existing._id;
    }

    const id = await ctx.db.insert('riskScores', {
      ...args,
      lastAssessment: now,
      nextAssessment,
    });

    return id;
  },
});

export const getRiskScore = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const score = await ctx.db
      .query('riskScores')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    return score;
  },
});

export const getHighRiskUsers = query({
  args: {
    minRiskLevel: v.optional(v.union(v.literal('medium'), v.literal('high'), v.literal('critical'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minLevel = args.minRiskLevel ?? 'high';
    const levelOrder = ['low', 'medium', 'high', 'critical'];
    const minIndex = levelOrder.indexOf(minLevel);

    const scores = await ctx.db.query('riskScores').collect();

    const highRisk = scores.filter((s) => levelOrder.indexOf(s.riskLevel) >= minIndex);

    // Sort by risk score descending
    highRisk.sort((a, b) => b.overallScore - a.overallScore);

    if (args.limit) {
      return highRisk.slice(0, args.limit);
    }

    return highRisk;
  },
});

// ============================================================================
// Fraud Alerts
// ============================================================================

export const createFraudAlert = mutation({
  args: {
    alertId: v.string(),
    alertType: v.string(),
    severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')),
    entityId: v.string(),
    entityType: v.union(v.literal('user'), v.literal('trade'), v.literal('market'), v.literal('transaction'), v.literal('device'), v.literal('ip')),
    userId: v.optional(v.string()),
    description: v.string(),
    evidence: v.optional(v.any()),
    relatedAlerts: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert('fraudAlerts', {
      ...args,
      status: 'new',
      createdAt: now,
    });

    return id;
  },
});

export const getFraudAlerts = query({
  args: {
    status: v.optional(v.union(v.literal('new'), v.literal('investigating'), v.literal('escalated'), v.literal('resolved'), v.literal('dismissed'), v.literal('false_positive'))),
    severity: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical'))),
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let alerts;

    if (args.userId) {
      alerts = await ctx.db
        .query('fraudAlerts')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect();
    } else if (args.status) {
      alerts = await ctx.db
        .query('fraudAlerts')
        .withIndex('by_status', (q) => q.eq('status', args.status))
        .collect();
    } else {
      alerts = await ctx.db.query('fraudAlerts').collect();
    }

    if (args.severity) {
      alerts = alerts.filter((a) => a.severity === args.severity);
    }

    if (args.status && args.userId) {
      alerts = alerts.filter((a) => a.status === args.status);
    }

    // Sort by created date descending
    alerts.sort((a, b) => b.createdAt - a.createdAt);

    if (args.limit) {
      return alerts.slice(0, args.limit);
    }

    return alerts;
  },
});

export const updateFraudAlertStatus = mutation({
  args: {
    alertId: v.id('fraudAlerts'),
    status: v.union(v.literal('new'), v.literal('investigating'), v.literal('escalated'), v.literal('resolved'), v.literal('dismissed'), v.literal('false_positive')),
    assignedTo: v.optional(v.string()),
    resolution: v.optional(v.object({
      action: v.string(),
      reason: v.string(),
      resolvedBy: v.string(),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.assignedTo) {
      updates.assignedTo = args.assignedTo;
    }

    if (args.resolution) {
      updates.resolution = args.resolution;
      updates.resolvedAt = now;
    }

    await ctx.db.patch(args.alertId, updates);

    return { success: true };
  },
});

export const getAlertStats = query({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query('fraudAlerts').collect();

    const stats = {
      total: alerts.length,
      new: 0,
      investigating: 0,
      escalated: 0,
      resolved: 0,
      dismissed: 0,
      falsePositive: 0,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      byType: {} as Record<string, number>,
      last24Hours: 0,
      last7Days: 0,
    };

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const alert of alerts) {
      // By status
      switch (alert.status) {
        case 'new':
          stats.new++;
          break;
        case 'investigating':
          stats.investigating++;
          break;
        case 'escalated':
          stats.escalated++;
          break;
        case 'resolved':
          stats.resolved++;
          break;
        case 'dismissed':
          stats.dismissed++;
          break;
        case 'false_positive':
          stats.falsePositive++;
          break;
      }

      // By severity
      stats.bySeverity[alert.severity]++;

      // By type
      stats.byType[alert.alertType] = (stats.byType[alert.alertType] ?? 0) + 1;

      // By time
      if (alert.createdAt > oneDayAgo) {
        stats.last24Hours++;
      }
      if (alert.createdAt > sevenDaysAgo) {
        stats.last7Days++;
      }
    }

    return stats;
  },
});

// ============================================================================
// IP History
// ============================================================================

export const upsertIPHistory = mutation({
  args: {
    userId: v.string(),
    ipAddress: v.string(),
    isVPN: v.boolean(),
    isProxy: v.boolean(),
    isTor: v.boolean(),
    isDatacenter: v.boolean(),
    country: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    city: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isp: v.optional(v.string()),
    asn: v.optional(v.string()),
    reputationScore: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if IP history already exists
    const existing = await ctx.db
      .query('ipHistory')
      .withIndex('by_user_ip', (q) => q.eq('userId', args.userId).eq('ipAddress', args.ipAddress))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastSeen: now,
        accessCount: existing.accessCount + 1,
      });
      return existing._id;
    }

    const id = await ctx.db.insert('ipHistory', {
      ...args,
      firstSeen: now,
      lastSeen: now,
      accessCount: 1,
    });

    return id;
  },
});

export const getIPHistoryByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query('ipHistory')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    return history;
  },
});

export const getUsersByIP = query({
  args: {
    ipAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query('ipHistory')
      .withIndex('by_ip', (q) => q.eq('ipAddress', args.ipAddress))
      .collect();

    return history.map((h) => h.userId);
  },
});

// ============================================================================
// Velocity Records
// ============================================================================

export const upsertVelocityRecord = mutation({
  args: {
    userId: v.string(),
    actionType: v.string(),
    period: v.union(v.literal('hourly'), v.literal('daily'), v.literal('weekly'), v.literal('monthly')),
    count: v.number(),
    amount: v.number(),
    windowStart: v.number(),
    windowEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if record already exists
    const existing = await ctx.db
      .query('velocityRecords')
      .withIndex('by_user_action_period', (q) =>
        q.eq('userId', args.userId).eq('actionType', args.actionType).eq('period', args.period)
      )
      .first();

    if (existing && existing.windowEnd > now) {
      // Window still active, update it
      await ctx.db.patch(existing._id, {
        count: args.count,
        amount: args.amount,
        lastAction: now,
      });
      return existing._id;
    } else if (existing) {
      // Window expired, reset it
      await ctx.db.patch(existing._id, {
        count: args.count,
        amount: args.amount,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        lastAction: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert('velocityRecords', {
      ...args,
      lastAction: now,
    });

    return id;
  },
});

export const getVelocityRecords = query({
  args: {
    userId: v.string(),
    actionType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let records;

    if (args.actionType) {
      records = await ctx.db
        .query('velocityRecords')
        .withIndex('by_user_action', (q) => q.eq('userId', args.userId).eq('actionType', args.actionType))
        .collect();
    } else {
      records = await ctx.db
        .query('velocityRecords')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect();
    }

    // Filter out expired windows
    const now = Date.now();
    return records.filter((r) => r.windowEnd > now);
  },
});

// ============================================================================
// Account Links
// ============================================================================

export const createAccountLink = mutation({
  args: {
    userId: v.string(),
    linkedUserId: v.string(),
    linkType: v.string(),
    confidence: v.number(),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if link already exists
    const existing = await ctx.db
      .query('accountLinks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .filter((q) => q.eq(q.field('linkedUserId'), args.linkedUserId))
      .first();

    if (existing) {
      // Update existing link
      await ctx.db.patch(existing._id, {
        linkType: args.linkType,
        confidence: Math.max(existing.confidence, args.confidence),
        evidence: [...(existing.evidence ?? []), ...(args.evidence ?? [])],
        lastSeen: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert('accountLinks', {
      ...args,
      firstDetected: now,
      lastSeen: now,
      isConfirmed: false,
    });

    return id;
  },
});

export const getLinkedAccounts = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query('accountLinks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    // Also get reverse links
    const reverseLinks = await ctx.db
      .query('accountLinks')
      .withIndex('by_linked_user', (q) => q.eq('linkedUserId', args.userId))
      .collect();

    return [...links, ...reverseLinks];
  },
});

export const confirmAccountLink = mutation({
  args: {
    linkId: v.id('accountLinks'),
    confirmedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.linkId, {
      isConfirmed: true,
      confirmedBy: args.confirmedBy,
      confirmedAt: now,
    });

    return { success: true };
  },
});

// ============================================================================
// Admin Queries
// ============================================================================

export const getFraudDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Get active flags
    const activeFlags = await ctx.db
      .query('fraudFlags')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();

    // Get high risk users
    const riskScores = await ctx.db.query('riskScores').collect();
    const highRiskUsers = riskScores.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical');

    // Get recent alerts
    const alerts = await ctx.db.query('fraudAlerts').collect();
    const recentAlerts = alerts.filter((a) => a.createdAt > oneDayAgo);
    const pendingAlerts = alerts.filter((a) => a.status === 'new' || a.status === 'investigating');

    // Get suspicious devices
    const devices = await ctx.db.query('deviceFingerprints').collect();
    const suspiciousDevices = devices.filter((d) => d.isSuspicious || d.isBot);

    return {
      activeFlagsCount: activeFlags.length,
      activeAlertsByPriority: {
        critical: activeFlags.filter((f) => f.severity === 'critical').length,
        alert: activeFlags.filter((f) => f.severity === 'alert').length,
        warning: activeFlags.filter((f) => f.severity === 'warning').length,
      },
      highRiskUsersCount: highRiskUsers.length,
      recentAlertsCount: recentAlerts.length,
      pendingAlertsCount: pendingAlerts.length,
      suspiciousDevicesCount: suspiciousDevices.length,
      riskScoreDistribution: {
        low: riskScores.filter((s) => s.riskLevel === 'low').length,
        medium: riskScores.filter((s) => s.riskLevel === 'medium').length,
        high: riskScores.filter((s) => s.riskLevel === 'high').length,
        critical: riskScores.filter((s) => s.riskLevel === 'critical').length,
      },
    };
  },
});

export const getUserFraudProfile = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const [riskScore, flags, alerts, devices, ipHistory, linkedAccounts, velocityRecords] = await Promise.all([
      ctx.db
        .query('riskScores')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .first(),
      ctx.db
        .query('fraudFlags')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('fraudAlerts')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('deviceFingerprints')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('ipHistory')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('accountLinks')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
      ctx.db
        .query('velocityRecords')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect(),
    ]);

    return {
      userId: args.userId,
      riskScore,
      flags: flags.filter((f) => f.status === 'active'),
      flagHistory: flags,
      alerts: alerts.filter((a) => a.status === 'new' || a.status === 'investigating'),
      alertHistory: alerts,
      devices,
      ipHistory,
      linkedAccounts,
      velocityRecords,
    };
  },
});
