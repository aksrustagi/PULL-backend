/**
 * Daily Metrics
 * Pre-computed daily metrics for fast dashboard queries
 */

import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';

// ============================================================================
// Mutations
// ============================================================================

/**
 * Store daily metrics
 */
export const store = mutation({
  args: {
    date: v.string(), // YYYY-MM-DD
    dau: v.number(),
    wau: v.number(),
    mau: v.number(),
    newSignups: v.number(),
    kycCompletions: v.number(),
    firstDeposits: v.number(),
    firstTrades: v.number(),
    totalTrades: v.number(),
    totalVolume: v.number(),
    totalDeposits: v.number(),
    totalWithdrawals: v.number(),
    activeTraders: v.number(),
    avgSessionDuration: v.number(),
    avgTradesPerUser: v.number(),
    referrals: v.number(),
    totalFees: v.number(),
    // Retention metrics
    d1Retention: v.optional(v.number()),
    d7Retention: v.optional(v.number()),
    d30Retention: v.optional(v.number()),
    // Engagement
    dauMauRatio: v.optional(v.number()),
    avgSessionsPerDay: v.optional(v.number()),
    // Social
    newFollows: v.optional(v.number()),
    copyTradingStarts: v.optional(v.number()),
    messagesSent: v.optional(v.number()),
    // Anomalies detected
    anomalies: v.optional(v.array(v.object({
      metric: v.string(),
      severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      message: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    // Check if we already have metrics for this date
    const existing = await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date', (q) => q.eq('date', args.date))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new
    return await ctx.db.insert('dailyMetrics', {
      ...args,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update retention metrics for a specific date
 */
export const updateRetention = mutation({
  args: {
    date: v.string(),
    d1Retention: v.optional(v.number()),
    d7Retention: v.optional(v.number()),
    d30Retention: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date', (q) => q.eq('date', args.date))
      .first();

    if (!existing) {
      return null;
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.d1Retention !== undefined) updates.d1Retention = args.d1Retention;
    if (args.d7Retention !== undefined) updates.d7Retention = args.d7Retention;
    if (args.d30Retention !== undefined) updates.d30Retention = args.d30Retention;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get metrics for a specific date
 */
export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date', (q) => q.eq('date', args.date))
      .first();
  },
});

/**
 * Get metrics for a date range
 */
export const getByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const allMetrics = await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date')
      .collect();

    return allMetrics.filter(
      (m) => m.date >= args.startDate && m.date <= args.endDate
    ).sort((a, b) => a.date.localeCompare(b.date));
  },
});

/**
 * Get latest metrics
 */
export const getLatest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query('dailyMetrics')
      .order('desc');

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.take(30); // Default last 30 days
  },
});

/**
 * Get overview metrics for dashboard
 */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const latestMetrics = await ctx.db
      .query('dailyMetrics')
      .order('desc')
      .take(2);

    if (latestMetrics.length === 0) {
      return null;
    }

    const current = latestMetrics[0];
    const previous = latestMetrics[1];

    const calculateChange = (current: number, previous: number | undefined) => {
      if (!previous || previous === 0) return 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      current,
      changes: previous ? {
        dau: calculateChange(current.dau, previous.dau),
        newSignups: calculateChange(current.newSignups, previous.newSignups),
        totalVolume: calculateChange(current.totalVolume, previous.totalVolume),
        totalTrades: calculateChange(current.totalTrades, previous.totalTrades),
        totalFees: calculateChange(current.totalFees, previous.totalFees),
        referrals: calculateChange(current.referrals, previous.referrals),
      } : null,
    };
  },
});

/**
 * Get weekly aggregated metrics
 */
export const getWeeklyAggregates = query({
  args: { weeks: v.number() },
  handler: async (ctx, args) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - args.weeks * 7);

    const allMetrics = await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date')
      .collect();

    const filtered = allMetrics.filter(
      (m) => m.date >= startDate.toISOString().split('T')[0] && m.date <= endDate.toISOString().split('T')[0]
    );

    // Group by week
    const weeklyMetrics: Record<string, {
      weekStart: string;
      dau: number[];
      newSignups: number;
      totalVolume: number;
      totalTrades: number;
      totalFees: number;
    }> = {};

    for (const metric of filtered) {
      const date = new Date(metric.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyMetrics[weekKey]) {
        weeklyMetrics[weekKey] = {
          weekStart: weekKey,
          dau: [],
          newSignups: 0,
          totalVolume: 0,
          totalTrades: 0,
          totalFees: 0,
        };
      }

      weeklyMetrics[weekKey].dau.push(metric.dau);
      weeklyMetrics[weekKey].newSignups += metric.newSignups;
      weeklyMetrics[weekKey].totalVolume += metric.totalVolume;
      weeklyMetrics[weekKey].totalTrades += metric.totalTrades;
      weeklyMetrics[weekKey].totalFees += metric.totalFees;
    }

    return Object.values(weeklyMetrics).map((week) => ({
      weekStart: week.weekStart,
      avgDau: week.dau.length > 0 ? week.dau.reduce((a, b) => a + b, 0) / week.dau.length : 0,
      newSignups: week.newSignups,
      totalVolume: week.totalVolume,
      totalTrades: week.totalTrades,
      totalFees: week.totalFees,
    })).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  },
});

/**
 * Get retention cohorts
 */
export const getRetentionCohorts = query({
  args: { cohortCount: v.number() },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query('dailyMetrics')
      .order('desc')
      .take(args.cohortCount);

    return metrics.map((m) => ({
      date: m.date,
      cohortSize: m.newSignups,
      d1: m.d1Retention,
      d7: m.d7Retention,
      d30: m.d30Retention,
    })).reverse();
  },
});

/**
 * Get anomalies detected in recent days
 */
export const getRecentAnomalies = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query('dailyMetrics')
      .order('desc')
      .take(args.days || 7);

    const allAnomalies: Array<{
      date: string;
      metric: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
    }> = [];

    for (const m of metrics) {
      if (m.anomalies) {
        for (const anomaly of m.anomalies) {
          allAnomalies.push({
            date: m.date,
            ...anomaly,
          });
        }
      }
    }

    return allAnomalies;
  },
});

// ============================================================================
// Internal Mutations for Scheduled Jobs
// ============================================================================

/**
 * Delete old metrics (data retention)
 */
export const deleteOldMetrics = internalMutation({
  args: { beforeDate: v.string() },
  handler: async (ctx, args) => {
    const oldMetrics = await ctx.db
      .query('dailyMetrics')
      .withIndex('by_date')
      .collect();

    const toDelete = oldMetrics.filter((m) => m.date < args.beforeDate);

    for (const metric of toDelete) {
      await ctx.db.delete(metric._id);
    }

    return { deletedCount: toDelete.length };
  },
});
