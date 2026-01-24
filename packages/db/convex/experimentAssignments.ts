/**
 * Experiment Assignments
 * User assignments to experiment variants
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new experiment assignment
 */
export const create = mutation({
  args: {
    userId: v.string(),
    experimentId: v.string(),
    variantId: v.string(),
    assignedAt: v.number(),
    context: v.optional(
      v.object({
        platform: v.optional(v.string()),
        version: v.optional(v.string()),
        country: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        sessionId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if assignment already exists
    const existing = await ctx.db
      .query('experimentAssignments')
      .withIndex('by_user_experiment', (q) =>
        q.eq('userId', args.userId).eq('experimentId', args.experimentId)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('experimentAssignments', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete assignments for a user (GDPR)
 */
export const deleteByUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query('experimentAssignments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    let deletedCount = 0;
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get assignment for a user in an experiment
 */
export const getByUserExperiment = query({
  args: {
    userId: v.string(),
    experimentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experimentAssignments')
      .withIndex('by_user_experiment', (q) =>
        q.eq('userId', args.userId).eq('experimentId', args.experimentId)
      )
      .first();
  },
});

/**
 * Get all assignments for a user
 */
export const getByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experimentAssignments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
  },
});

/**
 * Get all assignments for an experiment
 */
export const getByExperiment = query({
  args: { experimentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('experimentAssignments')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();
  },
});

/**
 * Count assignments by variant for an experiment
 */
export const countByVariant = query({
  args: { experimentId: v.string() },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query('experimentAssignments')
      .withIndex('by_experiment', (q) => q.eq('experimentId', args.experimentId))
      .collect();

    const counts: Record<string, number> = {};
    for (const assignment of assignments) {
      counts[assignment.variantId] = (counts[assignment.variantId] || 0) + 1;
    }

    return {
      total: assignments.length,
      byVariant: counts,
    };
  },
});

/**
 * Get recent assignments
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query('experimentAssignments')
      .order('desc');

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.take(100);
  },
});
