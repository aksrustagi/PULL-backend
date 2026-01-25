/**
 * Analytics Events
 * Storage and querying for analytics events
 */

import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';

// ============================================================================
// Schema Definition
// ============================================================================

export const analyticsEventSchema = {
  event: v.string(),
  userId: v.optional(v.string()),
  anonymousId: v.optional(v.string()),
  properties: v.any(),
  timestamp: v.number(),
  context: v.object({
    page: v.optional(v.string()),
    referrer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ip: v.optional(v.string()),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    campaign: v.optional(
      v.object({
        source: v.optional(v.string()),
        medium: v.optional(v.string()),
        name: v.optional(v.string()),
        term: v.optional(v.string()),
        content: v.optional(v.string()),
      })
    ),
    device: v.optional(
      v.object({
        type: v.optional(v.union(v.literal('mobile'), v.literal('tablet'), v.literal('desktop'))),
        os: v.optional(v.string()),
        osVersion: v.optional(v.string()),
        browser: v.optional(v.string()),
        browserVersion: v.optional(v.string()),
        screenWidth: v.optional(v.number()),
        screenHeight: v.optional(v.number()),
      })
    ),
    session: v.optional(
      v.object({
        id: v.string(),
        startedAt: v.number(),
        pageViews: v.number(),
      })
    ),
  }),
};

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a single analytics event
 */
export const create = mutation({
  args: analyticsEventSchema,
  handler: async (ctx, args) => {
    return await ctx.db.insert('analyticsEvents', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Batch create analytics events
 */
export const batchCreate = mutation({
  args: {
    events: v.array(v.object(analyticsEventSchema)),
    batchId: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const event of args.events) {
      const id = await ctx.db.insert('analyticsEvents', {
        ...event,
        batchId: args.batchId,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return { insertedCount: ids.length, batchId: args.batchId };
  },
});

/**
 * Delete events for a user (GDPR deletion)
 */
export const deleteByUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
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
 * Get events by user
 */
export const getByUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query('analyticsEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc');

    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

/**
 * Get events by type within a time range
 */
export const getByEventType = query({
  args: {
    eventType: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .order('desc')
      .collect();

    if (args.limit) {
      return events.slice(0, args.limit);
    }
    return events;
  },
});

/**
 * Count events by type within a time range
 */
export const countEvents = query({
  args: {
    eventType: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    filter: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    // Apply optional property filter
    let filtered = events;
    if (args.filter) {
      filtered = events.filter((e) => {
        const props = e.properties as Record<string, any>;
        for (const [key, value] of Object.entries(args.filter as Record<string, any>)) {
          if (props[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return { count: filtered.length };
  },
});

/**
 * Count events that have a specific property
 */
export const countEventsWithProperty = query({
  args: {
    eventType: v.string(),
    property: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const withProperty = events.filter((e) => {
      const props = e.properties as Record<string, any>;
      return props[args.property] !== undefined && props[args.property] !== null;
    });

    return { count: withProperty.length };
  },
});

/**
 * Sum a property value across events
 */
export const sumEventProperty = query({
  args: {
    eventType: v.string(),
    property: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const sum = events.reduce((total, e) => {
      const props = e.properties as Record<string, any>;
      const value = props[args.property];
      return total + (typeof value === 'number' ? value : 0);
    }, 0);

    return { sum };
  },
});

/**
 * Count unique users for an event type
 */
export const countUniqueUsers = query({
  args: {
    eventType: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const userIds = new Set(events.map((e) => e.userId).filter(Boolean));
    return { count: userIds.size };
  },
});

/**
 * Get active users (unique users with any event) in a time range
 */
export const getActiveUsers = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const userIds = new Set(events.map((e) => e.userId).filter(Boolean));
    return { count: userIds.size, userIds: Array.from(userIds) };
  },
});

/**
 * Get cohort users (users who signed up in a specific time range)
 */
export const getCohortUsers = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', args.eventType).gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const userIds = Array.from(new Set(events.map((e) => e.userId).filter(Boolean)));
    return { userIds, count: userIds.length };
  },
});

/**
 * Get retained users (users from a list who were active in a time range)
 */
export const getRetainedUsers = query({
  args: {
    userIds: v.array(v.string()),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const userIdSet = new Set(args.userIds);

    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const retainedUserIds = new Set(
      events
        .filter((e) => e.userId && userIdSet.has(e.userId))
        .map((e) => e.userId)
    );

    return { count: retainedUserIds.size, userIds: Array.from(retainedUserIds) };
  },
});

/**
 * Get session metrics for a time range
 */
export const getSessionMetrics = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionEvents = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_event_timestamp', (q) =>
        q.eq('event', 'session.ended').gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const durations = sessionEvents
      .map((e) => (e.properties as any)?.duration)
      .filter((d) => typeof d === 'number');

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      avgDuration,
      sessionCount: sessionEvents.length,
    };
  },
});

/**
 * Get historical averages for anomaly detection
 */
export const getHistoricalAverages = query({
  args: {
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const endTime = Date.now();
    const startTime = endTime - args.days * 24 * 60 * 60 * 1000;

    // Get DAU (active users per day)
    const allEvents = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', startTime).lte('timestamp', endTime)
      )
      .collect();

    // Group by day
    const dayBuckets = new Map<string, Set<string>>();
    const signupsByDay = new Map<string, number>();
    const volumeByDay = new Map<string, number>();

    for (const event of allEvents) {
      const day = new Date(event.timestamp).toISOString().split('T')[0];

      // Track DAU
      if (event.userId) {
        if (!dayBuckets.has(day)) {
          dayBuckets.set(day, new Set());
        }
        dayBuckets.get(day)!.add(event.userId);
      }

      // Track signups
      if (event.event === 'user.signed_up') {
        signupsByDay.set(day, (signupsByDay.get(day) || 0) + 1);
      }

      // Track volume
      if (event.event === 'trade.order_filled') {
        const amount = (event.properties as any)?.amount || 0;
        volumeByDay.set(day, (volumeByDay.get(day) || 0) + amount);
      }
    }

    const dayCount = dayBuckets.size || 1;
    const totalDau = Array.from(dayBuckets.values()).reduce((sum, set) => sum + set.size, 0);
    const totalSignups = Array.from(signupsByDay.values()).reduce((sum, count) => sum + count, 0);
    const totalVolume = Array.from(volumeByDay.values()).reduce((sum, vol) => sum + vol, 0);

    return {
      dau: totalDau / dayCount,
      signups: totalSignups / dayCount,
      volume: totalVolume / dayCount,
    };
  },
});

/**
 * Get user metrics for LTV calculation
 */
export const getUserMetrics = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    if (events.length === 0) {
      return null;
    }

    // Find signup event
    const signupEvent = events.find((e) => e.event === 'user.signed_up');
    const signupTime = signupEvent?.timestamp || events[0].timestamp;
    const daysSinceSignup = Math.max(1, Math.ceil((Date.now() - signupTime) / (1000 * 60 * 60 * 24)));

    // Calculate total fees from trades
    const tradeEvents = events.filter((e) => e.event === 'trade.order_filled');
    const totalFees = tradeEvents.reduce((sum, e) => {
      return sum + ((e.properties as any)?.fees || 0);
    }, 0);

    return {
      daysSinceSignup,
      totalFees,
      totalTrades: tradeEvents.length,
    };
  },
});

/**
 * Get engagement metrics
 */
export const getEngagementMetrics = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    // Calculate DAU/MAU ratio
    // For proper DAU/MAU ratio, we need MAU from last 30 days
    const mauStartTime = args.startTime - 30 * 24 * 60 * 60 * 1000; // 30 days before
    const mauEvents = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', mauStartTime).lte('timestamp', args.endTime)
      )
      .collect();
    
    const mauUserIds = new Set(mauEvents.map((e) => e.userId).filter(Boolean));
    const dauUserIds = new Set(events.map((e) => e.userId).filter(Boolean));
    const dauMauRatio = mauUserIds.size > 0 ? dauUserIds.size / mauUserIds.size : 0;

    // Session metrics
    const sessionEvents = events.filter((e) => e.event === 'session.ended');
    const sessionDurations = sessionEvents.map((e) => (e.properties as any)?.duration || 0);
    const avgSessionDuration =
      sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 0;

    // Trades per active user
    const tradeEvents = events.filter((e) => e.event === 'trade.order_filled');
    const tradingUsers = new Set(tradeEvents.map((e) => e.userId).filter(Boolean));
    const avgTradesPerActiveUser =
      tradingUsers.size > 0 ? tradeEvents.length / tradingUsers.size : 0;

    // Feature adoption
    const featureEvents = {
      copy_trading: events.filter((e) => e.event === 'social.copy_started').length,
      messaging: events.filter((e) => e.event === 'social.message_sent').length,
      rewards: events.filter((e) => e.event === 'engagement.points_earned').length,
    };

    const featureAdoption = Object.entries(featureEvents).map(([feature, count]) => ({
      feature,
      adoptionRate: activeUserIds.size > 0 ? count / activeUserIds.size : 0,
      activeUsers: count,
    }));

    // Streak stats
    const streakEvents = events.filter((e) => e.event === 'engagement.streak_maintained');
    const streakCounts = streakEvents.map((e) => (e.properties as any)?.count || 0);

    return {
      dauMauRatio,
      avgSessionDuration,
      avgSessionsPerDay: sessionEvents.length / Math.max(1, (args.endTime - args.startTime) / (24 * 60 * 60 * 1000)),
      avgTradesPerActiveUser,
      featureAdoption,
      streakStats: {
        avgStreakLength:
          streakCounts.length > 0
            ? streakCounts.reduce((a, b) => a + b, 0) / streakCounts.length
            : 0,
        maxStreakLength: streakCounts.length > 0 ? Math.max(...streakCounts) : 0,
        usersWithActiveStreak: new Set(streakEvents.map((e) => e.userId)).size,
        streakMaintenanceRate: activeUserIds.size > 0 ? streakEvents.length / activeUserIds.size : 0,
      },
    };
  },
});

/**
 * Get revenue metrics
 */
export const getRevenueMetrics = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const tradeEvents = events.filter((e) => e.event === 'trade.order_filled');

    const totalVolume = tradeEvents.reduce(
      (sum, e) => sum + ((e.properties as any)?.amount || 0),
      0
    );
    const totalFees = tradeEvents.reduce(
      (sum, e) => sum + ((e.properties as any)?.fees || 0),
      0
    );

    const uniqueUsers = new Set(tradeEvents.map((e) => e.userId).filter(Boolean));
    const avgRevenuePerUser = uniqueUsers.size > 0 ? totalFees / uniqueUsers.size : 0;
    const avgRevenuePerTrade = tradeEvents.length > 0 ? totalFees / tradeEvents.length : 0;

    return {
      totalVolume,
      totalFees,
      avgRevenuePerUser,
      avgRevenuePerTrade,
      estimatedLtv: avgRevenuePerUser * 365, // Simple projection
      paybackPeriodDays: 0, // Would need CAC data
    };
  },
});

/**
 * Get social metrics
 */
export const getSocialMetrics = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const activeUsers = new Set(events.map((e) => e.userId).filter(Boolean));

    const followEvents = events.filter((e) => e.event === 'social.followed');
    const copyEvents = events.filter((e) => e.event === 'social.copy_started');
    const messageEvents = events.filter((e) => e.event === 'social.message_sent');
    const signupEvents = events.filter((e) => e.event === 'user.signed_up');
    const referredSignups = signupEvents.filter((e) => (e.properties as any)?.referralCode);

    return {
      followsPerUser: activeUsers.size > 0 ? followEvents.length / activeUsers.size : 0,
      copyTradingAdoption: activeUsers.size > 0 ? copyEvents.length / activeUsers.size : 0,
      messagesPerUser: activeUsers.size > 0 ? messageEvents.length / activeUsers.size : 0,
      viralCoefficient: 0, // Calculated separately
      referralConversionRate:
        signupEvents.length > 0 ? referredSignups.length / signupEvents.length : 0,
    };
  },
});

/**
 * Get viral metrics for K-factor calculation
 */
export const getViralMetrics = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) =>
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .collect();

    const activeUsers = new Set(events.map((e) => e.userId).filter(Boolean)).size;
    const referralsSent = events.filter((e) => e.event === 'referral.sent').length;
    const referralsConverted = events.filter(
      (e) => e.event === 'user.signed_up' && (e.properties as any)?.referralCode
    ).length;

    return {
      activeUsers,
      referralsSent,
      referralsConverted,
    };
  },
});

// ============================================================================
// Internal Mutations for Cleanup
// ============================================================================

/**
 * Delete old events (for data retention)
 */
export const deleteOldEvents = internalMutation({
  args: {
    beforeTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const oldEvents = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_timestamp', (q) => q.lt('timestamp', args.beforeTimestamp))
      .take(1000); // Batch delete

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return { deletedCount: oldEvents.length };
  },
});
