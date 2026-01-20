import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Real Estate Prediction Market queries and mutations for PULL
 * Handles prediction events, brokerages, agents, referrals, and market sentiment
 */

// ============================================================================
// REAL ESTATE PREDICTION EVENT QUERIES
// ============================================================================

/**
 * Get all active real estate prediction events
 */
export const getEvents = query({
  args: {
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("realEstatePredictionEvents");

    if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status as "open")
      );
    }

    const events = await query.order("desc").take(args.limit ?? 50);

    // Filter by geographic criteria if specified
    let filtered = events;
    if (args.geographicScope) {
      filtered = filtered.filter((e) => e.geographicScope === args.geographicScope);
    }
    if (args.state) {
      filtered = filtered.filter((e) => e.state === args.state);
    }
    if (args.city) {
      filtered = filtered.filter((e) => e.city === args.city);
    }
    if (args.category) {
      filtered = filtered.filter((e) => e.category === args.category);
    }

    return filtered;
  },
});

/**
 * Get event by ticker
 */
export const getEventByTicker = query({
  args: { ticker: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("realEstatePredictionEvents")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (!event) return null;

    // Get historical data points
    const dataPoints = await ctx.db
      .query("realEstateMarketDataPoints")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .order("desc")
      .take(100);

    return {
      ...event,
      dataPoints,
    };
  },
});

/**
 * Search real estate events
 */
export const searchEvents = query({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("realEstatePredictionEvents")
      .withSearchIndex("search_re_events", (q) => {
        let search = q.search("title", args.query);
        if (args.status) {
          search = search.eq("status", args.status as "open");
        }
        if (args.category) {
          search = search.eq("category", args.category as "median_price");
        }
        if (args.geographicScope) {
          search = search.eq("geographicScope", args.geographicScope as "city");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * Get events by location
 */
export const getEventsByLocation = query({
  args: {
    geographicScope: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("realEstatePredictionEvents")
      .withIndex("by_location", (q) => {
        let idx = q.eq("geographicScope", args.geographicScope as "city");
        if (args.state) {
          idx = idx.eq("state", args.state);
        }
        if (args.city) {
          idx = idx.eq("city", args.city);
        }
        return idx;
      });

    const events = await query.take(args.limit ?? 50);

    if (args.status) {
      return events.filter((e) => e.status === args.status);
    }

    return events;
  },
});

/**
 * Get trending markets (by volume)
 */
export const getTrendingMarkets = query({
  args: {
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("realEstatePredictionEvents")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    let filtered = events;
    if (args.category) {
      filtered = filtered.filter((e) => e.category === args.category);
    }

    // Sort by volume
    filtered.sort((a, b) => b.totalVolume - a.totalVolume);

    return filtered.slice(0, args.limit ?? 10);
  },
});

// ============================================================================
// REAL ESTATE PREDICTION EVENT MUTATIONS
// ============================================================================

/**
 * Create a new real estate prediction event
 */
export const createEvent = mutation({
  args: {
    ticker: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    geographicScope: v.string(),
    country: v.string(),
    state: v.optional(v.string()),
    metro: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    developmentId: v.optional(v.string()),
    targetMetric: v.string(),
    targetValue: v.number(),
    comparisonOperator: v.string(),
    resolutionSource: v.string(),
    resolutionSourceUrl: v.optional(v.string()),
    resolutionDate: v.number(),
    openTime: v.number(),
    closeTime: v.number(),
    initialYesPrice: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
    dataUpdateFrequency: v.optional(v.string()),
    sponsoredBy: v.optional(v.string()),
    sponsorBrokerageId: v.optional(v.id("brokerages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if ticker already exists
    const existing = await ctx.db
      .query("realEstatePredictionEvents")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (existing) {
      throw new Error("Event with this ticker already exists");
    }

    const initialYes = args.initialYesPrice ?? 0.5;

    const eventId = await ctx.db.insert("realEstatePredictionEvents", {
      ticker: args.ticker,
      title: args.title,
      description: args.description,
      category: args.category as "median_price",
      subcategory: args.subcategory,
      status: "draft",
      geographicScope: args.geographicScope as "city",
      country: args.country,
      state: args.state,
      metro: args.metro,
      city: args.city,
      zipCode: args.zipCode,
      neighborhood: args.neighborhood,
      developmentId: args.developmentId,
      targetMetric: args.targetMetric,
      targetValue: args.targetValue,
      comparisonOperator: args.comparisonOperator as "gt",
      resolutionSource: args.resolutionSource,
      resolutionSourceUrl: args.resolutionSourceUrl,
      resolutionDate: args.resolutionDate,
      yesPrice: initialYes,
      noPrice: 1 - initialYes,
      yesVolume: 0,
      noVolume: 0,
      totalVolume: 0,
      openInterest: 0,
      liquidity: 0,
      openTime: args.openTime,
      closeTime: args.closeTime,
      tags: args.tags ?? [],
      imageUrl: args.imageUrl,
      dataUpdateFrequency: (args.dataUpdateFrequency as "daily") ?? "daily",
      sponsoredBy: args.sponsoredBy,
      sponsorBrokerageId: args.sponsorBrokerageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "realEstate.event_created",
      resourceType: "realEstatePredictionEvents",
      resourceId: eventId,
      metadata: {
        ticker: args.ticker,
        title: args.title,
        category: args.category,
      },
      timestamp: now,
    });

    return eventId;
  },
});

/**
 * Update event status (open, close, etc.)
 */
export const updateEventStatus = mutation({
  args: {
    eventId: v.id("realEstatePredictionEvents"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.db.patch(args.eventId, {
      status: args.status as "open",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "realEstate.event_status_updated",
      resourceType: "realEstatePredictionEvents",
      resourceId: args.eventId,
      metadata: {
        previousStatus: event.status,
        newStatus: args.status,
      },
      timestamp: now,
    });

    return args.eventId;
  },
});

/**
 * Update market prices (from trading activity)
 */
export const updateMarketPrices = mutation({
  args: {
    eventId: v.id("realEstatePredictionEvents"),
    yesPrice: v.number(),
    noPrice: v.number(),
    yesVolume: v.number(),
    noVolume: v.number(),
    openInterest: v.number(),
    liquidity: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.eventId, {
      yesPrice: args.yesPrice,
      noPrice: args.noPrice,
      yesVolume: args.yesVolume,
      noVolume: args.noVolume,
      totalVolume: args.yesVolume + args.noVolume,
      openInterest: args.openInterest,
      liquidity: args.liquidity,
      updatedAt: now,
    });

    // Record data point
    await ctx.db.insert("realEstateMarketDataPoints", {
      eventId: args.eventId,
      timestamp: now,
      yesPrice: args.yesPrice,
      noPrice: args.noPrice,
      volume: args.yesVolume + args.noVolume,
      openInterest: args.openInterest,
    });

    return args.eventId;
  },
});

/**
 * Update target metric value (from data source)
 */
export const updateTargetMetric = mutation({
  args: {
    eventId: v.id("realEstatePredictionEvents"),
    currentValue: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.eventId, {
      currentValue: args.currentValue,
      lastDataUpdate: now,
      updatedAt: now,
    });

    return args.eventId;
  },
});

/**
 * Settle a real estate prediction event
 */
export const settleEvent = mutation({
  args: {
    eventId: v.id("realEstatePredictionEvents"),
    settlementValue: v.number(),
    outcome: v.union(v.literal("yes"), v.literal("no")),
    resolutionDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.status === "settled") {
      throw new Error("Event already settled");
    }

    await ctx.db.patch(args.eventId, {
      status: "settled",
      settlementValue: args.settlementValue,
      outcome: args.outcome,
      resolutionDetails: args.resolutionDetails,
      settledAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "realEstate.event_settled",
      resourceType: "realEstatePredictionEvents",
      resourceId: args.eventId,
      metadata: {
        ticker: event.ticker,
        outcome: args.outcome,
        settlementValue: args.settlementValue,
        targetValue: event.targetValue,
      },
      timestamp: now,
    });

    return args.eventId;
  },
});

// ============================================================================
// BROKERAGE QUERIES
// ============================================================================

/**
 * Get all brokerages
 */
export const getBrokerages = query({
  args: {
    status: v.optional(v.string()),
    tier: v.optional(v.string()),
    state: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("brokerages");

    if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status as "active")
      );
    }

    const brokerages = await query.order("desc").take(args.limit ?? 100);

    let filtered = brokerages;
    if (args.tier) {
      filtered = filtered.filter((b) => b.tier === args.tier);
    }
    if (args.state) {
      filtered = filtered.filter((b) => b.state === args.state);
    }

    return filtered;
  },
});

/**
 * Get brokerage by ID
 */
export const getBrokerageById = query({
  args: { id: v.id("brokerages") },
  handler: async (ctx, args) => {
    const brokerage = await ctx.db.get(args.id);
    if (!brokerage) return null;

    // Get agent count
    const agents = await ctx.db
      .query("realEstateAgents")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.id))
      .collect();

    // Get white-label config if exists
    const whiteLabelConfig = await ctx.db
      .query("whiteLabelConfigs")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.id))
      .unique();

    return {
      ...brokerage,
      agents: agents.length,
      activeAgents: agents.filter((a) => a.status === "active").length,
      whiteLabelConfig,
    };
  },
});

/**
 * Search brokerages
 */
export const searchBrokerages = query({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("brokerages")
      .withSearchIndex("search_brokerages", (q) => {
        let search = q.search("name", args.query);
        if (args.status) {
          search = search.eq("status", args.status as "active");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

// ============================================================================
// BROKERAGE MUTATIONS
// ============================================================================

/**
 * Create a new brokerage
 */
export const createBrokerage = mutation({
  args: {
    name: v.string(),
    legalName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    country: v.string(),
    licenseNumber: v.string(),
    licenseState: v.string(),
    licenseExpiry: v.number(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    primaryContactId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing email
    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (existing) {
      throw new Error("Brokerage with this email already exists");
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      name: args.name,
      legalName: args.legalName,
      status: "pending",
      tier: "starter",
      email: args.email.toLowerCase(),
      phone: args.phone,
      website: args.website,
      address: args.address,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
      country: args.country,
      licenseNumber: args.licenseNumber,
      licenseState: args.licenseState,
      licenseExpiry: args.licenseExpiry,
      logoUrl: args.logoUrl,
      primaryColor: args.primaryColor,
      whitelabelEnabled: false,
      agentCount: 0,
      activeAgentCount: 0,
      totalReferrals: 0,
      totalVolume: 0,
      primaryContactId: args.primaryContactId,
      zillowFlexEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "realEstate.brokerage_created",
      resourceType: "brokerages",
      resourceId: brokerageId,
      metadata: {
        name: args.name,
        email: args.email,
      },
      timestamp: now,
    });

    return brokerageId;
  },
});

/**
 * Update brokerage status
 */
export const updateBrokerageStatus = mutation({
  args: {
    brokerageId: v.id("brokerages"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.brokerageId, {
      status: args.status as "active",
      updatedAt: now,
    });

    return args.brokerageId;
  },
});

/**
 * Update brokerage tier
 */
export const updateBrokerageTier = mutation({
  args: {
    brokerageId: v.id("brokerages"),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.brokerageId, {
      tier: args.tier as "growth",
      updatedAt: now,
    });

    return args.brokerageId;
  },
});

/**
 * Enable Zillow Flex integration
 */
export const enableZillowFlex = mutation({
  args: {
    brokerageId: v.id("brokerages"),
    zillowFlexTeamId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.brokerageId, {
      zillowFlexEnabled: true,
      zillowFlexTeamId: args.zillowFlexTeamId,
      updatedAt: now,
    });

    return args.brokerageId;
  },
});

// ============================================================================
// AGENT QUERIES
// ============================================================================

/**
 * Get agents for a brokerage
 */
export const getAgentsByBrokerage = query({
  args: {
    brokerageId: v.id("brokerages"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("realEstateAgents")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId));

    const agents = await query.take(args.limit ?? 100);

    if (args.status) {
      return agents.filter((a) => a.status === args.status);
    }

    return agents;
  },
});

/**
 * Get agent by user ID
 */
export const getAgentByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("realEstateAgents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!agent) return null;

    // Get brokerage
    const brokerage = await ctx.db.get(agent.brokerageId);

    // Get referral stats
    const referrals = await ctx.db
      .query("agentReferrals")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .collect();

    return {
      ...agent,
      brokerage,
      referralStats: {
        total: referrals.length,
        active: referrals.filter((r) => r.status === "active_trader").length,
        pending: referrals.filter((r) => r.status === "pending").length,
      },
    };
  },
});

/**
 * Get agent by referral code
 */
export const getAgentByReferralCode = query({
  args: { referralCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("realEstateAgents")
      .withIndex("by_referral_code", (q) => q.eq("referralCode", args.referralCode))
      .unique();
  },
});

/**
 * Get top performing agents (by prediction accuracy)
 */
export const getTopAgents = query({
  args: {
    brokerageId: v.optional(v.id("brokerages")),
    sortBy: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("realEstateAgents");

    if (args.brokerageId) {
      query = query.withIndex("by_brokerage", (q) =>
        q.eq("brokerageId", args.brokerageId!)
      );
    } else {
      query = query.withIndex("by_status", (q) => q.eq("status", "active"));
    }

    const agents = await query.collect();

    // Sort by criteria
    const sortBy = args.sortBy ?? "predictionAccuracy";
    agents.sort((a, b) => {
      if (sortBy === "predictionAccuracy") {
        return (b.predictionAccuracy ?? 0) - (a.predictionAccuracy ?? 0);
      } else if (sortBy === "referrals") {
        return b.totalReferrals - a.totalReferrals;
      } else if (sortBy === "volume") {
        return b.totalVolume - a.totalVolume;
      }
      return 0;
    });

    return agents.slice(0, args.limit ?? 10);
  },
});

/**
 * Search agents
 */
export const searchAgents = query({
  args: {
    query: v.string(),
    brokerageId: v.optional(v.id("brokerages")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("realEstateAgents")
      .withSearchIndex("search_agents", (q) => {
        let search = q.search("displayName", args.query);
        if (args.status) {
          search = search.eq("status", args.status as "active");
        }
        if (args.brokerageId) {
          search = search.eq("brokerageId", args.brokerageId);
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

// ============================================================================
// AGENT MUTATIONS
// ============================================================================

/**
 * Register a new agent
 */
export const registerAgent = mutation({
  args: {
    userId: v.id("users"),
    brokerageId: v.id("brokerages"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    licenseNumber: v.string(),
    licenseState: v.string(),
    licenseExpiry: v.number(),
    specializations: v.optional(v.array(v.string())),
    serviceAreas: v.optional(v.array(v.string())),
    yearsExperience: v.number(),
    photoUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing agent for this user
    const existingByUser = await ctx.db
      .query("realEstateAgents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existingByUser) {
      throw new Error("User is already registered as an agent");
    }

    // Check for existing license
    const existingByLicense = await ctx.db
      .query("realEstateAgents")
      .withIndex("by_license", (q) =>
        q.eq("licenseState", args.licenseState).eq("licenseNumber", args.licenseNumber)
      )
      .unique();

    if (existingByLicense) {
      throw new Error("Agent with this license already exists");
    }

    // Generate referral code
    const referralCode = `AGT-${args.licenseState}-${Date.now().toString(36).toUpperCase()}`;

    const agentId = await ctx.db.insert("realEstateAgents", {
      userId: args.userId,
      brokerageId: args.brokerageId,
      status: "pending_verification",
      firstName: args.firstName,
      lastName: args.lastName,
      displayName: `${args.firstName} ${args.lastName}`,
      email: args.email.toLowerCase(),
      phone: args.phone,
      photoUrl: args.photoUrl,
      bio: args.bio,
      licenseNumber: args.licenseNumber,
      licenseState: args.licenseState,
      licenseExpiry: args.licenseExpiry,
      specializations: args.specializations ?? [],
      serviceAreas: args.serviceAreas ?? [],
      languages: ["English"],
      yearsExperience: args.yearsExperience,
      totalTransactions: 0,
      totalVolume: 0,
      averageRating: 0,
      reviewCount: 0,
      totalReferrals: 0,
      activeReferrals: 0,
      referralEarnings: 0,
      marketsParticipated: 0,
      clientsReferred: 0,
      referralCode,
      referralCommissionRate: 0.1, // 10% default
      zillowFlexAgent: false,
      verificationDocuments: [],
      createdAt: now,
      updatedAt: now,
    });

    // Update brokerage agent count
    const brokerage = await ctx.db.get(args.brokerageId);
    if (brokerage) {
      await ctx.db.patch(args.brokerageId, {
        agentCount: brokerage.agentCount + 1,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "realEstate.agent_registered",
      resourceType: "realEstateAgents",
      resourceId: agentId,
      userId: args.userId,
      metadata: {
        brokerageId: args.brokerageId,
        licenseNumber: args.licenseNumber,
        licenseState: args.licenseState,
      },
      timestamp: now,
    });

    return agentId;
  },
});

/**
 * Verify agent
 */
export const verifyAgent = mutation({
  args: {
    agentId: v.id("realEstateAgents"),
    verificationDocuments: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    await ctx.db.patch(args.agentId, {
      status: "active",
      verificationDocuments: args.verificationDocuments,
      verifiedAt: now,
      updatedAt: now,
    });

    // Update brokerage active agent count
    const brokerage = await ctx.db.get(agent.brokerageId);
    if (brokerage) {
      await ctx.db.patch(agent.brokerageId, {
        activeAgentCount: brokerage.activeAgentCount + 1,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "realEstate.agent_verified",
      resourceType: "realEstateAgents",
      resourceId: args.agentId,
      userId: agent.userId,
      timestamp: now,
    });

    return args.agentId;
  },
});

/**
 * Update agent prediction accuracy
 */
export const updateAgentPredictionStats = mutation({
  args: {
    agentId: v.id("realEstateAgents"),
    predictionAccuracy: v.number(),
    marketsParticipated: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.agentId, {
      predictionAccuracy: args.predictionAccuracy,
      marketsParticipated: args.marketsParticipated,
      updatedAt: now,
    });

    return args.agentId;
  },
});

// ============================================================================
// REFERRAL QUERIES & MUTATIONS
// ============================================================================

/**
 * Get referrals for an agent
 */
export const getAgentReferrals = query({
  args: {
    agentId: v.id("realEstateAgents"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("agentReferrals")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId));

    const referrals = await query.order("desc").take(args.limit ?? 100);

    if (args.status) {
      return referrals.filter((r) => r.status === args.status);
    }

    return referrals;
  },
});

/**
 * Create referral (when user signs up with agent code)
 */
export const createReferral = mutation({
  args: {
    agentId: v.id("realEstateAgents"),
    referredUserId: v.id("users"),
    referralCode: v.string(),
    referralSource: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    // Check if referral already exists
    const existing = await ctx.db
      .query("agentReferrals")
      .withIndex("by_user", (q) => q.eq("referredUserId", args.referredUserId))
      .unique();

    if (existing) {
      throw new Error("User already has a referral");
    }

    const referralId = await ctx.db.insert("agentReferrals", {
      agentId: args.agentId,
      referredUserId: args.referredUserId,
      brokerageId: agent.brokerageId,
      status: "signed_up",
      referralCode: args.referralCode,
      referralSource: args.referralSource as "direct_link",
      signedUpAt: now,
      totalReferralEarnings: 0,
      pendingEarnings: 0,
      paidEarnings: 0,
      attributionWindow: 90, // 90 days
      expiresAt: now + 90 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });

    // Update agent referral count
    await ctx.db.patch(args.agentId, {
      totalReferrals: agent.totalReferrals + 1,
      clientsReferred: agent.clientsReferred + 1,
      updatedAt: now,
    });

    // Award points for signup
    await awardAgentPoints(ctx, args.agentId, "referral_signup", 100, referralId);

    return referralId;
  },
});

/**
 * Update referral status (conversion tracking)
 */
export const updateReferralStatus = mutation({
  args: {
    referralId: v.id("agentReferrals"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const referral = await ctx.db.get(args.referralId);
    if (!referral) {
      throw new Error("Referral not found");
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Track conversion milestones
    if (args.status === "verified" && !referral.verifiedAt) {
      updateData.verifiedAt = now;
      await awardAgentPoints(ctx, referral.agentId, "referral_verification", 200, args.referralId);
    } else if (args.status === "active_trader" && !referral.firstTradeAt) {
      updateData.firstTradeAt = now;
      await awardAgentPoints(ctx, referral.agentId, "referral_first_trade", 500, args.referralId);

      // Update active referrals count
      const agent = await ctx.db.get(referral.agentId);
      if (agent) {
        await ctx.db.patch(referral.agentId, {
          activeReferrals: agent.activeReferrals + 1,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.referralId, updateData);

    return args.referralId;
  },
});

// ============================================================================
// AGENT POINTS
// ============================================================================

/**
 * Internal function to award points to agent
 */
async function awardAgentPoints(
  ctx: { db: any },
  agentId: any,
  type: string,
  amount: number,
  referenceId?: any
) {
  const now = Date.now();

  // Get current balance
  const lastTransaction = await ctx.db
    .query("agentPoints")
    .withIndex("by_agent", (q: any) => q.eq("agentId", agentId))
    .order("desc")
    .first();

  const currentBalance = lastTransaction?.balance ?? 0;
  const newBalance = currentBalance + amount;

  await ctx.db.insert("agentPoints", {
    agentId,
    type,
    amount,
    balance: newBalance,
    status: "completed",
    description: getPointsDescription(type, amount),
    referenceType: type.startsWith("referral_") ? "referral" : type.includes("prediction") ? "prediction" : "other",
    referenceId: referenceId?.toString(),
    createdAt: now,
  });

  return newBalance;
}

function getPointsDescription(type: string, amount: number): string {
  const descriptions: Record<string, string> = {
    referral_signup: `Earned ${amount} points for client signup`,
    referral_verification: `Earned ${amount} points for client verification`,
    referral_first_trade: `Earned ${amount} points for client's first trade`,
    referral_volume: `Earned ${amount} points for client trading volume`,
    prediction_correct: `Earned ${amount} points for correct prediction`,
    prediction_streak: `Earned ${amount} points for prediction streak`,
  };
  return descriptions[type] ?? `${amount} points`;
}

/**
 * Get agent points balance
 */
export const getAgentPointsBalance = query({
  args: { agentId: v.id("realEstateAgents") },
  handler: async (ctx, args) => {
    const lastTransaction = await ctx.db
      .query("agentPoints")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .first();

    return lastTransaction?.balance ?? 0;
  },
});

/**
 * Get agent points history
 */
export const getAgentPointsHistory = query({
  args: {
    agentId: v.id("realEstateAgents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentPoints")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ============================================================================
// MARKET SENTIMENT QUERIES
// ============================================================================

/**
 * Get market sentiment for location
 */
export const getMarketSentiment = query({
  args: {
    geographicScope: v.string(),
    location: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("marketSentiment")
      .withIndex("by_scope_location", (q) =>
        q.eq("geographicScope", args.geographicScope as "city").eq("location", args.location)
      )
      .order("desc")
      .first();
  },
});

/**
 * Update market sentiment (calculated from prediction markets)
 */
export const updateMarketSentiment = mutation({
  args: {
    geographicScope: v.string(),
    location: v.string(),
    overallSentiment: v.number(),
    buyerSentiment: v.number(),
    sellerSentiment: v.number(),
    investorSentiment: v.number(),
    priceUpProbability: v.number(),
    priceDownProbability: v.number(),
    inventoryUpProbability: v.number(),
    ratesDownProbability: v.number(),
    predictionVolume: v.number(),
    activeMarkets: v.number(),
    uniqueTraders: v.number(),
    sentimentTrend: v.string(),
    trendStrength: v.number(),
    weekOverWeekChange: v.number(),
    monthOverMonthChange: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing or create new
    const existing = await ctx.db
      .query("marketSentiment")
      .withIndex("by_scope_location", (q) =>
        q.eq("geographicScope", args.geographicScope as "city").eq("location", args.location)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        overallSentiment: args.overallSentiment,
        buyerSentiment: args.buyerSentiment,
        sellerSentiment: args.sellerSentiment,
        investorSentiment: args.investorSentiment,
        priceUpProbability: args.priceUpProbability,
        priceDownProbability: args.priceDownProbability,
        inventoryUpProbability: args.inventoryUpProbability,
        ratesDownProbability: args.ratesDownProbability,
        predictionVolume: args.predictionVolume,
        activeMarkets: args.activeMarkets,
        uniqueTraders: args.uniqueTraders,
        sentimentTrend: args.sentimentTrend as "bullish",
        trendStrength: args.trendStrength,
        weekOverWeekChange: args.weekOverWeekChange,
        monthOverMonthChange: args.monthOverMonthChange,
        calculatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("marketSentiment", {
        geographicScope: args.geographicScope as "city",
        location: args.location,
        overallSentiment: args.overallSentiment,
        buyerSentiment: args.buyerSentiment,
        sellerSentiment: args.sellerSentiment,
        investorSentiment: args.investorSentiment,
        priceUpProbability: args.priceUpProbability,
        priceDownProbability: args.priceDownProbability,
        inventoryUpProbability: args.inventoryUpProbability,
        ratesDownProbability: args.ratesDownProbability,
        predictionVolume: args.predictionVolume,
        activeMarkets: args.activeMarkets,
        uniqueTraders: args.uniqueTraders,
        sentimentTrend: args.sentimentTrend as "bullish",
        trendStrength: args.trendStrength,
        weekOverWeekChange: args.weekOverWeekChange,
        monthOverMonthChange: args.monthOverMonthChange,
        calculatedAt: now,
      });
    }
  },
});

// ============================================================================
// PULL REAL ESTATE INDEX
// ============================================================================

/**
 * Get PULL Real Estate Index
 */
export const getPullIndex = query({
  args: {
    ticker: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.ticker) {
      return await ctx.db
        .query("pullRealEstateIndex")
        .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker!))
        .unique();
    }

    if (args.geographicScope && args.location) {
      return await ctx.db
        .query("pullRealEstateIndex")
        .withIndex("by_scope_location", (q) =>
          q.eq("geographicScope", args.geographicScope as "city").eq("location", args.location!)
        )
        .first();
    }

    // Return national index by default
    return await ctx.db
      .query("pullRealEstateIndex")
      .withIndex("by_scope_location", (q) =>
        q.eq("geographicScope", "national").eq("location", "US")
      )
      .first();
  },
});

/**
 * Get PULL Index historical data
 */
export const getPullIndexHistory = query({
  args: {
    indexId: v.id("pullRealEstateIndex"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pullIndexHistorical")
      .withIndex("by_index", (q) => q.eq("indexId", args.indexId))
      .order("desc")
      .take(args.limit ?? 365);
  },
});

/**
 * Update PULL Real Estate Index
 */
export const updatePullIndex = mutation({
  args: {
    name: v.string(),
    ticker: v.string(),
    geographicScope: v.string(),
    location: v.string(),
    value: v.number(),
    previousValue: v.number(),
    change: v.number(),
    changePercent: v.number(),
    trend: v.string(),
    trendStrength: v.number(),
    components: v.array(
      v.object({
        category: v.string(),
        weight: v.number(),
        currentValue: v.number(),
        previousValue: v.number(),
        change: v.number(),
        changePercent: v.number(),
        sentiment: v.string(),
      })
    ),
    marketSentiment: v.number(),
    volatility: v.number(),
    tradingVolume: v.number(),
    activeMarkets: v.number(),
    high52Week: v.number(),
    low52Week: v.number(),
    high52WeekDate: v.number(),
    low52WeekDate: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing or create new
    const existing = await ctx.db
      .query("pullRealEstateIndex")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    let indexId;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        previousValue: args.previousValue,
        change: args.change,
        changePercent: args.changePercent,
        trend: args.trend as "up",
        trendStrength: args.trendStrength,
        components: args.components,
        marketSentiment: args.marketSentiment,
        volatility: args.volatility,
        tradingVolume: args.tradingVolume,
        activeMarkets: args.activeMarkets,
        high52Week: args.high52Week,
        low52Week: args.low52Week,
        high52WeekDate: args.high52WeekDate,
        low52WeekDate: args.low52WeekDate,
        calculatedAt: now,
        nextUpdateAt: now + 24 * 60 * 60 * 1000, // Next day
      });
      indexId = existing._id;
    } else {
      indexId = await ctx.db.insert("pullRealEstateIndex", {
        name: args.name,
        ticker: args.ticker,
        geographicScope: args.geographicScope as "city",
        location: args.location,
        value: args.value,
        previousValue: args.previousValue,
        change: args.change,
        changePercent: args.changePercent,
        trend: args.trend as "up",
        trendStrength: args.trendStrength,
        components: args.components,
        marketSentiment: args.marketSentiment,
        volatility: args.volatility,
        tradingVolume: args.tradingVolume,
        activeMarkets: args.activeMarkets,
        high52Week: args.high52Week,
        low52Week: args.low52Week,
        high52WeekDate: args.high52WeekDate,
        low52WeekDate: args.low52WeekDate,
        calculatedAt: now,
        nextUpdateAt: now + 24 * 60 * 60 * 1000,
      });
    }

    // Record historical data point
    await ctx.db.insert("pullIndexHistorical", {
      indexId,
      timestamp: now,
      value: args.value,
      volume: args.tradingVolume,
      marketCount: args.activeMarkets,
    });

    return indexId;
  },
});

// ============================================================================
// LEAD SCORING
// ============================================================================

/**
 * Get lead score for user
 */
export const getLeadScore = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leadScores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Get leads for agent
 */
export const getAgentLeads = query({
  args: {
    agentId: v.id("realEstateAgents"),
    tier: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("leadScores")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId));

    const leads = await query.take(args.limit ?? 100);

    if (args.tier) {
      return leads.filter((l) => l.leadTier === args.tier);
    }

    // Sort by score
    leads.sort((a, b) => b.overallLeadScore - a.overallLeadScore);

    return leads;
  },
});

/**
 * Update lead score (called by scoring algorithm)
 */
export const updateLeadScore = mutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("realEstateAgents")),
    totalTrades: v.number(),
    tradingVolume: v.number(),
    predictionAccuracy: v.number(),
    marketCategories: v.array(v.string()),
    priceRangeMin: v.number(),
    priceRangeMax: v.number(),
    locationInterest: v.array(v.string()),
    propertyTypeInterest: v.array(v.string()),
    timeHorizon: v.string(),
    sessionCount: v.number(),
    averageSessionDuration: v.number(),
    overallLeadScore: v.number(),
    buyerIntentScore: v.number(),
    sellerIntentScore: v.number(),
    investorIntentScore: v.number(),
    engagementScore: v.number(),
    leadTier: v.string(),
    recommendedAction: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing or create new
    const existing = await ctx.db
      .query("leadScores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        agentId: args.agentId,
        totalTrades: args.totalTrades,
        tradingVolume: args.tradingVolume,
        predictionAccuracy: args.predictionAccuracy,
        marketCategories: args.marketCategories,
        priceRangeMin: args.priceRangeMin,
        priceRangeMax: args.priceRangeMax,
        locationInterest: args.locationInterest,
        propertyTypeInterest: args.propertyTypeInterest,
        timeHorizon: args.timeHorizon as "immediate",
        lastActiveAt: now,
        sessionCount: args.sessionCount,
        averageSessionDuration: args.averageSessionDuration,
        overallLeadScore: args.overallLeadScore,
        buyerIntentScore: args.buyerIntentScore,
        sellerIntentScore: args.sellerIntentScore,
        investorIntentScore: args.investorIntentScore,
        engagementScore: args.engagementScore,
        leadTier: args.leadTier as "hot",
        recommendedAction: args.recommendedAction,
        calculatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("leadScores", {
        userId: args.userId,
        agentId: args.agentId,
        totalTrades: args.totalTrades,
        tradingVolume: args.tradingVolume,
        predictionAccuracy: args.predictionAccuracy,
        marketCategories: args.marketCategories,
        priceRangeMin: args.priceRangeMin,
        priceRangeMax: args.priceRangeMax,
        locationInterest: args.locationInterest,
        propertyTypeInterest: args.propertyTypeInterest,
        timeHorizon: args.timeHorizon as "immediate",
        lastActiveAt: now,
        sessionCount: args.sessionCount,
        averageSessionDuration: args.averageSessionDuration,
        overallLeadScore: args.overallLeadScore,
        buyerIntentScore: args.buyerIntentScore,
        sellerIntentScore: args.sellerIntentScore,
        investorIntentScore: args.investorIntentScore,
        engagementScore: args.engagementScore,
        leadTier: args.leadTier as "hot",
        recommendedAction: args.recommendedAction,
        calculatedAt: now,
      });
    }
  },
});

// ============================================================================
// WHITE LABEL CONFIG
// ============================================================================

/**
 * Get white label config for brokerage
 */
export const getWhiteLabelConfig = query({
  args: { brokerageId: v.id("brokerages") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whiteLabelConfigs")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .unique();
  },
});

/**
 * Get white label config by domain
 */
export const getWhiteLabelConfigByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("whiteLabelConfigs")
      .withIndex("by_domain", (q) => q.eq("customDomain", args.domain))
      .unique();

    if (!config) return null;

    const brokerage = await ctx.db.get(config.brokerageId);

    return {
      ...config,
      brokerage,
    };
  },
});

/**
 * Create or update white label config
 */
export const upsertWhiteLabelConfig = mutation({
  args: {
    brokerageId: v.id("brokerages"),
    appName: v.string(),
    logoUrl: v.string(),
    faviconUrl: v.optional(v.string()),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    accentColor: v.optional(v.string()),
    customDomain: v.optional(v.string()),
    enabledFeatures: v.array(v.string()),
    disabledMarketCategories: v.optional(v.array(v.string())),
    termsUrl: v.optional(v.string()),
    privacyUrl: v.optional(v.string()),
    disclaimerText: v.optional(v.string()),
    googleAnalyticsId: v.optional(v.string()),
    facebookPixelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("whiteLabelConfigs")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        appName: args.appName,
        logoUrl: args.logoUrl,
        faviconUrl: args.faviconUrl,
        primaryColor: args.primaryColor,
        secondaryColor: args.secondaryColor,
        accentColor: args.accentColor,
        customDomain: args.customDomain,
        enabledFeatures: args.enabledFeatures,
        disabledMarketCategories: args.disabledMarketCategories ?? [],
        termsUrl: args.termsUrl,
        privacyUrl: args.privacyUrl,
        disclaimerText: args.disclaimerText,
        googleAnalyticsId: args.googleAnalyticsId,
        facebookPixelId: args.facebookPixelId,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("whiteLabelConfigs", {
        brokerageId: args.brokerageId,
        appName: args.appName,
        logoUrl: args.logoUrl,
        faviconUrl: args.faviconUrl,
        primaryColor: args.primaryColor,
        secondaryColor: args.secondaryColor,
        accentColor: args.accentColor,
        customDomain: args.customDomain,
        enabledFeatures: args.enabledFeatures,
        disabledMarketCategories: args.disabledMarketCategories ?? [],
        termsUrl: args.termsUrl,
        privacyUrl: args.privacyUrl,
        disclaimerText: args.disclaimerText,
        googleAnalyticsId: args.googleAnalyticsId,
        facebookPixelId: args.facebookPixelId,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
