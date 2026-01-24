/**
 * Experiment Events
 * Exposure and conversion events for experiments
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create an experiment event (exposure or conversion)
 */
export const create = mutation({
  args: {
    userId: v.string(),
    experimentId: v.string(),
    variantId: v.string(),
    eventType: v.union(v.literal('exposure'), v.literal('conversion')),
    eventName: v.optional(v.string()),
    value: v.optional(v.number()),
    timestamp: v.number(),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('experimentEvents', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Batch create experiment events
 */
export const batchCreate = mutation({
  args: {
    events: v.array(
      v.object({
        userId: v.string(),
        experimentId: v.string(),
        variantId: v.string(),
        eventType: v.union(v.literal('exposure'), v.literal('conversion')),
        eventName: v.optional(v.string()),
        value: v.optional(v.number()),
        timestamp: v.number(),
        properties: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const event of args.events) {
      const id = await ctx.db.insert('experimentEvents', {
        ...event,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return { insertedCount: ids.length };
  },
});

/**
 * Delete events for a user (GDPR)
 */
export const deleteByUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('experimentEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    let deletedCount = 0;
    for (const event of events) {
      await ctx.db.delete(event._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all events for an experiment
 */
export const getByExperiment = query({
  args: { experimentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experimentEvents')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();
  },
});

/**
 * Get events for a user
 */
export const getByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experimentEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
  },
});

/**
 * Get events for a user in an experiment
 */
export const getByUserExperiment = query({
  args: {
    userId: v.string(),
    experimentId: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('experimentEvents')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();

    return events.filter((e) => e.userId === args.userId);
  },
});

/**
 * Count exposures and conversions for an experiment by variant
 */
export const getStats = query({
  args: { experimentId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('experimentEvents')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();

    const stats: Record<
      string,
      {
        exposures: number;
        conversions: number;
        totalValue: number;
        uniqueUsers: Set<string>;
      }
    > = {};

    for (const event of events) {
      if (!stats[event.variantId]) {
        stats[event.variantId] = {
          exposures: 0,
          conversions: 0,
          totalValue: 0,
          uniqueUsers: new Set(),
        };
      }

      const variantStats = stats[event.variantId];
      variantStats.uniqueUsers.add(event.userId);

      if (event.eventType === 'exposure') {
        variantStats.exposures++;
      } else if (event.eventType === 'conversion') {
        variantStats.conversions++;
        if (event.value !== undefined) {
          variantStats.totalValue += event.value;
        }
      }
    }

    // Convert Sets to counts for JSON serialization
    return Object.entries(stats).map(([variantId, variantStats]) => ({
      variantId,
      exposures: variantStats.exposures,
      conversions: variantStats.conversions,
      totalValue: variantStats.totalValue,
      uniqueUsers: variantStats.uniqueUsers.size,
      conversionRate:
        variantStats.exposures > 0
          ? variantStats.conversions / variantStats.exposures
          : 0,
    }));
  },
});

/**
 * Get conversion events by event name
 */
export const getConversionsByEventName = query({
  args: {
    experimentId: v.string(),
    eventName: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('experimentEvents')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();

    return events.filter(
      (e) => e.eventType === 'conversion' && e.eventName === args.eventName
    );
  },
});

/**
 * Get daily event counts for an experiment
 */
export const getDailyStats = query({
  args: {
    experimentId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('experimentEvents')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();

    const filteredEvents = events.filter(
      (e) => e.timestamp >= args.startTime && e.timestamp <= args.endTime
    );

    // Group by day and variant
    const dailyStats: Record<
      string,
      Record<string, { exposures: number; conversions: number }>
    > = {};

    for (const event of filteredEvents) {
      const day = new Date(event.timestamp).toISOString().split('T')[0];

      if (!dailyStats[day]) {
        dailyStats[day] = {};
      }

      if (!dailyStats[day][event.variantId]) {
        dailyStats[day][event.variantId] = { exposures: 0, conversions: 0 };
      }

      if (event.eventType === 'exposure') {
        dailyStats[day][event.variantId].exposures++;
      } else {
        dailyStats[day][event.variantId].conversions++;
      }
    }

    return dailyStats;
  },
});

/**
 * Get recent experiment events
 */
export const getRecent = query({
  args: {
    experimentId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query;

    if (args.experimentId) {
      query = ctx.db
        .query('experimentEvents')
        .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
        .order('desc');
    } else {
      query = ctx.db.query('experimentEvents').order('desc');
    }

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.take(100);
  },
});
