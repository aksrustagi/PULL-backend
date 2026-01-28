import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { api } from "@pull/db/convex/_generated/api";
import { toUserId } from "../lib/convex-types";
import { requireFeature } from "../lib/feature-flags";

const app = new Hono<Env>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createEventSchema = z.object({
  ticker: z.string().min(1).max(20),
  title: z.string().min(10).max(200),
  description: z.string().min(20).max(2000),
  category: z.enum([
    "median_price",
    "mortgage_rates",
    "housing_inventory",
    "development_sellout",
    "rent_prices",
    "days_on_market",
    "home_sales_volume",
    "price_per_sqft",
    "foreclosure_rate",
    "new_construction",
    "custom",
  ]),
  geographicScope: z.enum([
    "national",
    "state",
    "metro",
    "city",
    "zip_code",
    "neighborhood",
    "development",
  ]),
  state: z.string().optional(),
  metro: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  targetMetric: z.string(),
  targetValue: z.number(),
  comparisonOperator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  resolutionSource: z.string(),
  resolutionDate: z.string().datetime(),
  openTime: z.string().datetime(),
  closeTime: z.string().datetime(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
});

const createBrokerageSchema = z.object({
  name: z.string().min(2).max(100),
  legalName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().length(2),
  zipCode: z.string().min(5).max(10),
  licenseNumber: z.string().min(1),
  licenseState: z.string().length(2),
  licenseExpiry: z.string().datetime(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().optional(),
});

const registerAgentSchema = z.object({
  brokerageId: z.string(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  licenseNumber: z.string().min(1),
  licenseState: z.string().length(2),
  licenseExpiry: z.string().datetime(),
  specializations: z.array(z.string()).optional(),
  serviceAreas: z.array(z.string()).optional(),
  yearsExperience: z.number().min(0).max(70),
  photoUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
});

const inviteClientSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().max(500).optional(),
  source: z.enum(["email", "sms", "in_person"]).optional(),
});

const whiteLabelConfigSchema = z.object({
  appName: z.string().min(1).max(50),
  logoUrl: z.string().url(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customDomain: z.string().optional(),
  enabledFeatures: z.array(z.string()),
  disabledMarketCategories: z.array(z.string()).optional(),
  termsUrl: z.string().url().optional(),
  privacyUrl: z.string().url().optional(),
  disclaimerText: z.string().max(2000).optional(),
});

// ============================================================================
// REAL ESTATE PREDICTION MARKET ROUTES
// ============================================================================

/**
 * Get real estate prediction events
 */
app.get("/events", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const status = c.req.query("status") ?? "open";
  const category = c.req.query("category");
  const geographicScope = c.req.query("scope");
  const state = c.req.query("state");
  const city = c.req.query("city");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const events = await convex.query(api.realEstate.getEvents, {
    status,
    category: category || undefined,
    geographicScope: geographicScope || undefined,
    state: state || undefined,
    city: city || undefined,
    limit,
  });

  return c.json({
    success: true,
    data: events,
    filters: {
      status,
      category,
      geographicScope,
      state,
      city,
    },
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: events.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get event by ticker
 */
app.get("/events/:ticker", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const ticker = c.req.param("ticker");

  const event = await convex.query(api.realEstate.getEventByTicker, { ticker });

  if (!event) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
  }

  return c.json({
    success: true,
    data: event,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search events
 */
app.get("/search", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const query = c.req.query("q") ?? "";
  const category = c.req.query("category");
  const geographicScope = c.req.query("scope");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  const events = await convex.query(api.realEstate.searchEvents, {
    query,
    category: category || undefined,
    geographicScope: geographicScope || undefined,
    limit,
  });

  return c.json({
    success: true,
    data: events,
    query,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trending markets
 */
app.get("/trending", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  const markets = await convex.query(api.realEstate.getTrendingMarkets, {
    category: category || undefined,
    limit,
  });

  return c.json({
    success: true,
    data: markets,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get markets by location
 */
app.get("/markets/location", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const geographicScope = c.req.query("scope") ?? "city";
  const state = c.req.query("state");
  const city = c.req.query("city");
  const status = c.req.query("status") ?? "open";

  const events = await convex.query(api.realEstate.getEventsByLocation, {
    geographicScope,
    state: state || undefined,
    city: city || undefined,
    status: status || undefined,
  });

  return c.json({
    success: true,
    data: events,
    filters: {
      geographicScope,
      state,
      city,
      status,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get categories for real estate predictions
 */
app.get("/categories", async (c) => {
  return c.json({
    success: true,
    data: [
      { id: "median_price", name: "Median Home Price", count: 0, icon: "dollar-sign" },
      { id: "mortgage_rates", name: "Mortgage Rates", count: 0, icon: "percent" },
      { id: "housing_inventory", name: "Housing Inventory", count: 0, icon: "home" },
      { id: "development_sellout", name: "Development Sellout", count: 0, icon: "building" },
      { id: "rent_prices", name: "Rent Prices", count: 0, icon: "key" },
      { id: "days_on_market", name: "Days on Market", count: 0, icon: "clock" },
      { id: "home_sales_volume", name: "Sales Volume", count: 0, icon: "trending-up" },
      { id: "price_per_sqft", name: "Price per Sq Ft", count: 0, icon: "ruler" },
      { id: "foreclosure_rate", name: "Foreclosure Rate", count: 0, icon: "alert-triangle" },
      { id: "new_construction", name: "New Construction", count: 0, icon: "hammer" },
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Create a new prediction event (admin only)
 */
app.post("/events", requireFeature("real_estate"), zValidator("json", createEventSchema), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const eventId = await convex.mutation(api.realEstate.createEvent, {
    ticker: body.ticker,
    title: body.title,
    description: body.description,
    category: body.category,
    geographicScope: body.geographicScope,
    country: "US",
    state: body.state,
    metro: body.metro,
    city: body.city,
    zipCode: body.zipCode,
    targetMetric: body.targetMetric,
    targetValue: body.targetValue,
    comparisonOperator: body.comparisonOperator,
    resolutionSource: body.resolutionSource,
    resolutionDate: new Date(body.resolutionDate).getTime(),
    openTime: new Date(body.openTime).getTime(),
    closeTime: new Date(body.closeTime).getTime(),
    tags: body.tags,
    imageUrl: body.imageUrl,
  });

  return c.json({
    success: true,
    data: {
      id: eventId,
      ticker: body.ticker,
      status: "draft",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

// ============================================================================
// MARKET SENTIMENT & INDEX ROUTES
// ============================================================================

/**
 * Get market sentiment for a location
 */
app.get("/sentiment", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const geographicScope = c.req.query("scope") ?? "city";
  const location = c.req.query("location") ?? "";

  const sentiment = await convex.query(api.realEstate.getMarketSentiment, {
    geographicScope,
    location,
  });

  if (!sentiment) {
    // Return default values if no sentiment data exists
    return c.json({
      success: true,
      data: {
        geographicScope,
        location,
        overallSentiment: 50,
        buyerSentiment: 50,
        sellerSentiment: 50,
        investorSentiment: 50,
        priceUpProbability: 0.5,
        priceDownProbability: 0.5,
        inventoryUpProbability: 0.5,
        ratesDownProbability: 0.5,
        predictionVolume: 0,
        activeMarkets: 0,
        uniqueTraders: 0,
        sentimentTrend: "neutral",
        trendStrength: 0,
        weekOverWeekChange: 0,
        monthOverMonthChange: 0,
        calculatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({
    success: true,
    data: sentiment,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get PULL Real Estate Index
 */
app.get("/index", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const ticker = c.req.query("ticker");
  const geographicScope = c.req.query("scope");
  const location = c.req.query("location");
  const includeHistory = c.req.query("history") === "true";

  const index = await convex.query(api.realEstate.getPullIndex, {
    ticker: ticker || undefined,
    geographicScope: geographicScope || undefined,
    location: location || undefined,
  });

  if (!index) {
    return c.json({
      success: false,
      error: { code: "NOT_FOUND", message: "Index not found" },
    }, 404);
  }

  let history = undefined;
  if (includeHistory) {
    history = await convex.query(api.realEstate.getPullIndexHistory, {
      indexId: index._id,
      limit: 365,
    });
  }

  return c.json({
    success: true,
    data: {
      ...index,
      history,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get available indices
 */
app.get("/indices", async (c) => {
  return c.json({
    success: true,
    data: [
      { ticker: "PULL-RE-US", name: "PULL Real Estate Index - National", scope: "national", location: "US" },
      { ticker: "PULL-RE-CA", name: "PULL Real Estate Index - California", scope: "state", location: "CA" },
      { ticker: "PULL-RE-TX", name: "PULL Real Estate Index - Texas", scope: "state", location: "TX" },
      { ticker: "PULL-RE-FL", name: "PULL Real Estate Index - Florida", scope: "state", location: "FL" },
      { ticker: "PULL-RE-NY", name: "PULL Real Estate Index - New York", scope: "state", location: "NY" },
      { ticker: "PULL-RE-MIA", name: "PULL Real Estate Index - Miami Metro", scope: "metro", location: "Miami" },
      { ticker: "PULL-RE-LA", name: "PULL Real Estate Index - Los Angeles Metro", scope: "metro", location: "Los Angeles" },
      { ticker: "PULL-RE-NYC", name: "PULL Real Estate Index - NYC Metro", scope: "metro", location: "New York City" },
    ],
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// BROKERAGE ROUTES
// ============================================================================

/**
 * Get brokerages
 */
app.get("/brokerages", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const status = c.req.query("status") ?? "active";
  const tier = c.req.query("tier");
  const state = c.req.query("state");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const brokerages = await convex.query(api.realEstate.getBrokerages, {
    status,
    tier: tier || undefined,
    state: state || undefined,
    limit,
  });

  return c.json({
    success: true,
    data: brokerages,
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: brokerages.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get brokerage by ID
 */
app.get("/brokerages/:id", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const brokerageId = c.req.param("id");

  const brokerage = await convex.query(api.realEstate.getBrokerageById, {
    id: brokerageId as any,
  });

  if (!brokerage) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Brokerage not found" } }, 404);
  }

  return c.json({
    success: true,
    data: brokerage,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Register a new brokerage
 */
app.post("/brokerages", requireFeature("real_estate"), zValidator("json", createBrokerageSchema), async (c) => {
  const convex = c.get("convex");
  const body = c.req.valid("json");

  const brokerageId = await convex.mutation(api.realEstate.createBrokerage, {
    name: body.name,
    legalName: body.legalName,
    email: body.email,
    phone: body.phone,
    website: body.website,
    address: body.address,
    city: body.city,
    state: body.state,
    zipCode: body.zipCode,
    country: "US",
    licenseNumber: body.licenseNumber,
    licenseState: body.licenseState,
    licenseExpiry: new Date(body.licenseExpiry).getTime(),
    logoUrl: body.logoUrl,
    primaryColor: body.primaryColor,
  });

  return c.json({
    success: true,
    data: {
      id: brokerageId,
      name: body.name,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

/**
 * Search brokerages
 */
app.get("/brokerages/search", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const query = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  const brokerages = await convex.query(api.realEstate.searchBrokerages, {
    query,
    limit,
  });

  return c.json({
    success: true,
    data: brokerages,
    query,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get brokerage agents
 */
app.get("/brokerages/:id/agents", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const brokerageId = c.req.param("id");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const agents = await convex.query(api.realEstate.getAgentsByBrokerage, {
    brokerageId: brokerageId as any,
    status: status || undefined,
    limit,
  });

  return c.json({
    success: true,
    data: agents,
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: agents.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get/update brokerage white-label config
 */
app.get("/brokerages/:id/whitelabel", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const brokerageId = c.req.param("id");

  const config = await convex.query(api.realEstate.getWhiteLabelConfig, {
    brokerageId: brokerageId as any,
  });

  return c.json({
    success: true,
    data: config,
    timestamp: new Date().toISOString(),
  });
});

app.put("/brokerages/:id/whitelabel", requireFeature("real_estate"), zValidator("json", whiteLabelConfigSchema), async (c) => {
  const convex = c.get("convex");
  const brokerageId = c.req.param("id");
  const body = c.req.valid("json");

  await convex.mutation(api.realEstate.upsertWhiteLabelConfig, {
    brokerageId: brokerageId as any,
    appName: body.appName,
    logoUrl: body.logoUrl,
    faviconUrl: body.faviconUrl,
    primaryColor: body.primaryColor,
    secondaryColor: body.secondaryColor,
    accentColor: body.accentColor,
    customDomain: body.customDomain,
    enabledFeatures: body.enabledFeatures,
    disabledMarketCategories: body.disabledMarketCategories,
    termsUrl: body.termsUrl,
    privacyUrl: body.privacyUrl,
    disclaimerText: body.disclaimerText,
  });

  return c.json({
    success: true,
    data: {
      brokerageId,
      ...body,
      updatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// AGENT ROUTES
// ============================================================================

/**
 * Get current user's agent profile
 */
app.get("/agents/me", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(userId),
  });

  return c.json({
    success: true,
    data: agent,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Register as an agent
 */
app.post("/agents/register", requireFeature("real_estate"), zValidator("json", registerAgentSchema), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const agentId = await convex.mutation(api.realEstate.registerAgent, {
    userId: toUserId(userId),
    brokerageId: body.brokerageId as any,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    licenseNumber: body.licenseNumber,
    licenseState: body.licenseState,
    licenseExpiry: new Date(body.licenseExpiry).getTime(),
    specializations: body.specializations,
    serviceAreas: body.serviceAreas,
    yearsExperience: body.yearsExperience,
    photoUrl: body.photoUrl,
    bio: body.bio,
  });

  return c.json({
    success: true,
    data: {
      id: agentId,
      userId,
      status: "pending_verification",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

/**
 * Get agent by referral code (public)
 */
app.get("/agents/referral/:code", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const referralCode = c.req.param("code");

  const agent = await convex.query(api.realEstate.getAgentByReferralCode, {
    referralCode,
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  return c.json({
    success: true,
    data: {
      referralCode: agent.referralCode,
      displayName: agent.displayName,
      photoUrl: agent.photoUrl,
      predictionAccuracy: agent.predictionAccuracy,
      totalReferrals: agent.totalReferrals,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get top performing agents
 */
app.get("/agents/leaderboard", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const brokerageId = c.req.query("brokerage");
  const sortBy = c.req.query("sortBy") ?? "predictionAccuracy";
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  const agents = await convex.query(api.realEstate.getTopAgents, {
    brokerageId: brokerageId ? (brokerageId as any) : undefined,
    sortBy,
    limit,
  });

  return c.json({
    success: true,
    data: agents,
    sortBy,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search agents
 */
app.get("/agents/search", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const query = c.req.query("q") ?? "";
  const brokerageId = c.req.query("brokerage");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  const agents = await convex.query(api.realEstate.searchAgents, {
    query,
    brokerageId: brokerageId ? (brokerageId as any) : undefined,
    limit,
  });

  return c.json({
    success: true,
    data: agents,
    query,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's referrals
 */
app.get("/agents/me/referrals", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // First get agent profile
  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(userId),
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  const referrals = await convex.query(api.realEstate.getAgentReferrals, {
    agentId: agent._id,
    status: status || undefined,
    limit,
  });

  // Calculate stats
  const total = referrals.length;
  const active = referrals.filter((r) => r.status === "active_trader").length;
  const pending = referrals.filter((r) => r.status === "pending" || r.status === "signed_up").length;
  const totalEarnings = referrals.reduce((sum, r) => sum + (r.totalReferralEarnings ?? 0), 0);

  return c.json({
    success: true,
    data: referrals,
    stats: {
      total,
      active,
      pending,
      totalEarnings,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's points balance
 */
app.get("/agents/me/points", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // First get agent profile
  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(userId),
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  const balance = await convex.query(api.realEstate.getAgentPointsBalance, {
    agentId: agent._id,
  });

  return c.json({
    success: true,
    data: {
      balance: balance ?? 0,
      pendingPoints: 0,
      lifetimeEarnings: balance ?? 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's points history
 */
app.get("/agents/me/points/history", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // First get agent profile
  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(userId),
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  const history = await convex.query(api.realEstate.getAgentPointsHistory, {
    agentId: agent._id,
    limit,
  });

  return c.json({
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Invite a client
 * NOTE: Email invitation requires additional setup
 */
app.post("/agents/me/invite", requireFeature("real_estate"), zValidator("json", inviteClientSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Email invitation to be implemented
  return c.json({
    success: true,
    data: {
      invitationId: "inv_" + Date.now(),
      email: body.email,
      status: "pending",
      message: "Email invitation feature coming soon",
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

/**
 * Get agent's leads (from lead scoring)
 */
app.get("/agents/me/leads", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const userId = c.get("userId");
  const tier = c.req.query("tier");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // First get agent profile
  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(userId),
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  const leads = await convex.query(api.realEstate.getAgentLeads, {
    agentId: agent._id,
    tier: tier || undefined,
    limit,
  });

  // Calculate stats by tier
  const hot = leads.filter((l) => l.leadTier === "hot").length;
  const warm = leads.filter((l) => l.leadTier === "warm").length;
  const cold = leads.filter((l) => l.leadTier === "cold").length;

  return c.json({
    success: true,
    data: leads,
    stats: {
      hot,
      warm,
      cold,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's market insights
 */
app.get("/agents/me/insights", async (c) => {
  const userId = c.get("userId");

  // Generate insights based on agent's service areas and prediction performance

  return c.json({
    success: true,
    data: {
      serviceAreas: [],
      topPredictions: [],
      recentActivity: [],
      performanceMetrics: {
        predictionAccuracy: 0,
        clientsReferred: 0,
        activeClients: 0,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// LEAD SCORING ROUTES
// ============================================================================

/**
 * Get lead score for a user (agent-only)
 */
app.get("/leads/:userId", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const targetUserId = c.req.param("userId");
  const requestingUserId = c.get("userId");

  if (!requestingUserId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Verify requesting user is an agent
  const agent = await convex.query(api.realEstate.getAgentByUserId, {
    userId: toUserId(requestingUserId),
  });

  if (!agent) {
    return c.json({ success: false, error: { code: "FORBIDDEN", message: "Only agents can view lead scores" } }, 403);
  }

  const leadScore = await convex.query(api.realEstate.getLeadScore, {
    userId: toUserId(targetUserId),
  });

  return c.json({
    success: true,
    data: leadScore,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// WHITE-LABEL DOMAIN ROUTES
// ============================================================================

/**
 * Get white-label config by domain (public, for white-label apps)
 */
app.get("/whitelabel/domain/:domain", requireFeature("real_estate"), async (c) => {
  const convex = c.get("convex");
  const domain = c.req.param("domain");

  const config = await convex.query(api.realEstate.getWhiteLabelConfigByDomain, {
    domain,
  });

  return c.json({
    success: true,
    data: config,
    timestamp: new Date().toISOString(),
  });
});

export { app as realEstateRoutes };
