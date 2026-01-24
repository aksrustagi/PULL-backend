/**
 * Experiments
 * A/B testing experiment definitions and management
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ============================================================================
// Schema Definitions
// ============================================================================

const variantSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  weight: v.number(),
  isControl: v.boolean(),
  config: v.any(),
});

const targetAudienceSchema = v.optional(
  v.object({
    tiers: v.optional(v.array(v.string())),
    cohorts: v.optional(v.array(v.string())),
    percentOfUsers: v.optional(v.number()),
    countries: v.optional(v.array(v.string())),
    platforms: v.optional(v.array(v.union(v.literal('web'), v.literal('ios'), v.literal('android')))),
    includeUserIds: v.optional(v.array(v.string())),
    excludeUserIds: v.optional(v.array(v.string())),
    filters: v.optional(
      v.array(
        v.object({
          field: v.string(),
          operator: v.union(
            v.literal('eq'),
            v.literal('neq'),
            v.literal('gt'),
            v.literal('gte'),
            v.literal('lt'),
            v.literal('lte'),
            v.literal('in'),
            v.literal('nin'),
            v.literal('contains')
          ),
          value: v.any(),
        })
      )
    ),
  })
);

const metricSchema = v.object({
  name: v.string(),
  type: v.union(
    v.literal('conversion'),
    v.literal('revenue'),
    v.literal('count'),
    v.literal('duration'),
    v.literal('custom')
  ),
  eventName: v.string(),
  property: v.optional(v.string()),
  isPrimary: v.boolean(),
  minimumDetectableEffect: v.optional(v.number()),
});

const experimentStatusSchema = v.union(
  v.literal('draft'),
  v.literal('running'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived')
);

const experimentTypeSchema = v.union(
  v.literal('feature_flag'),
  v.literal('ab_test'),
  v.literal('multivariate'),
  v.literal('holdout'),
  v.literal('rollout')
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new experiment
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    hypothesis: v.string(),
    variants: v.array(variantSchema),
    targetAudience: targetAudienceSchema,
    metrics: v.array(metricSchema),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    status: experimentStatusSchema,
    type: experimentTypeSchema,
    minimumSampleSize: v.optional(v.number()),
    minimumRunDuration: v.optional(v.number()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert('experiments', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an experiment
 */
export const update = mutation({
  args: {
    id: v.id('experiments'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    hypothesis: v.optional(v.string()),
    variants: v.optional(v.array(variantSchema)),
    targetAudience: targetAudienceSchema,
    metrics: v.optional(v.array(metricSchema)),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(experimentStatusSchema),
    minimumSampleSize: v.optional(v.number()),
    minimumRunDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Filter out undefined values
    const filteredUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Set the winning variant for an experiment
 */
export const setWinner = mutation({
  args: {
    id: v.id('experiments'),
    winnerVariantId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      winnerVariantId: args.winnerVariantId,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Delete an experiment (archive)
 */
export const archive = mutation({
  args: { id: v.id('experiments') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get experiment by ID
 */
export const getById = query({
  args: { id: v.id('experiments') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get experiments by status
 */
export const getByStatus = query({
  args: { status: experimentStatusSchema },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experiments')
      .withIndex('by_status', (q) => q.eq('status', args.status))
      .collect();
  },
});

/**
 * Get all active experiments (running)
 */
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('experiments')
      .withIndex('by_status', (q) => q.eq('status', 'running'))
      .collect();
  },
});

/**
 * Get all experiments
 */
export const list = query({
  args: {
    status: v.optional(experimentStatusSchema),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query('experiments').order('desc');

    if (args.status) {
      query = ctx.db
        .query('experiments')
        .withIndex('by_status', (q) => q.eq('status', args.status))
        .order('desc');
    }

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

/**
 * Get experiment summary for dashboard
 */
export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const allExperiments = await ctx.db.query('experiments').collect();

    const byStatus = {
      draft: 0,
      running: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };

    for (const exp of allExperiments) {
      byStatus[exp.status as keyof typeof byStatus]++;
    }

    return {
      total: allExperiments.length,
      byStatus,
      recentlyCompleted: allExperiments
        .filter((e) => e.status === 'completed')
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 5),
    };
  },
});
