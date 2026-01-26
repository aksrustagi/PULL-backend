import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { convex, api } from "../lib/convex";
import type { Id } from "@pull/db/convex/_generated/dataModel";

const app = new Hono<Env>();

// Helper function to safely parse integers
function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

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
app.get("/events", async (c) => {
  const status = c.req.query("status") ?? "open";
  const category = c.req.query("category");
  const geographicScope = c.req.query("scope");
  const state = c.req.query("state");
  const city = c.req.query("city");
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const events = await convex.query(api.realEstate.getEvents, {
      status: status || undefined,
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
        totalPages: Math.ceil(events.length / limit),
        hasNextPage: false,
        hasPreviousPage: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching real estate events:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch events",
        },
      },
      500
    );
  }
});

/**
 * Get event by ticker
 */
app.get("/events/:ticker", async (c) => {
  const ticker = c.req.param("ticker");

  try {
    const event = await convex.query(api.realEstate.getEventByTicker, {
      ticker,
    });

    if (!event) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Event not found" },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching event by ticker:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch event",
        },
      },
      500
    );
  }
});

/**
 * Search events
 */
app.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const category = c.req.query("category");
  const geographicScope = c.req.query("scope");
  const limit = parseIntSafe(c.req.query("limit"), 20);

  if (!query.trim()) {
    return c.json({
      success: true,
      data: [],
      query,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const results = await convex.query(api.realEstate.searchEvents, {
      query,
      category: category || undefined,
      geographicScope: geographicScope || undefined,
      limit,
    });

    return c.json({
      success: true,
      data: results,
      query,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error searching events:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "SEARCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to search events",
        },
      },
      500
    );
  }
});

/**
 * Get trending markets
 */
app.get("/trending", async (c) => {
  const category = c.req.query("category");
  const limit = parseIntSafe(c.req.query("limit"), 10);

  try {
    const trending = await convex.query(api.realEstate.getTrendingMarkets, {
      category: category || undefined,
      limit,
    });

    return c.json({
      success: true,
      data: trending,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching trending markets:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch trending markets",
        },
      },
      500
    );
  }
});

/**
 * Get markets by location
 */
app.get("/markets/location", async (c) => {
  const geographicScope = c.req.query("scope") ?? "city";
  const state = c.req.query("state");
  const city = c.req.query("city");
  const status = c.req.query("status") ?? "open";
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const events = await convex.query(api.realEstate.getEventsByLocation, {
      geographicScope,
      state: state || undefined,
      city: city || undefined,
      status: status || undefined,
      limit,
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
  } catch (error) {
    console.error("Error fetching events by location:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch events by location",
        },
      },
      500
    );
  }
});

/**
 * Get categories for real estate predictions
 */
app.get("/categories", async (c) => {
  try {
    // Get all open events to count by category
    const events = await convex.query(api.realEstate.getEvents, {
      status: "open",
      limit: 1000,
    });

    // Count events by category
    const categoryCounts: Record<string, number> = {};
    for (const event of events) {
      categoryCounts[event.category] = (categoryCounts[event.category] || 0) + 1;
    }

    const categories = [
      { id: "median_price", name: "Median Home Price", count: categoryCounts["median_price"] || 0, icon: "dollar-sign" },
      { id: "mortgage_rates", name: "Mortgage Rates", count: categoryCounts["mortgage_rates"] || 0, icon: "percent" },
      { id: "housing_inventory", name: "Housing Inventory", count: categoryCounts["housing_inventory"] || 0, icon: "home" },
      { id: "development_sellout", name: "Development Sellout", count: categoryCounts["development_sellout"] || 0, icon: "building" },
      { id: "rent_prices", name: "Rent Prices", count: categoryCounts["rent_prices"] || 0, icon: "key" },
      { id: "days_on_market", name: "Days on Market", count: categoryCounts["days_on_market"] || 0, icon: "clock" },
      { id: "home_sales_volume", name: "Sales Volume", count: categoryCounts["home_sales_volume"] || 0, icon: "trending-up" },
      { id: "price_per_sqft", name: "Price per Sq Ft", count: categoryCounts["price_per_sqft"] || 0, icon: "ruler" },
      { id: "foreclosure_rate", name: "Foreclosure Rate", count: categoryCounts["foreclosure_rate"] || 0, icon: "alert-triangle" },
      { id: "new_construction", name: "New Construction", count: categoryCounts["new_construction"] || 0, icon: "hammer" },
    ];

    return c.json({
      success: true,
      data: categories,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch categories",
        },
      },
      500
    );
  }
});

/**
 * Create a new prediction event (admin only)
 */
app.post("/events", zValidator("json", createEventSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  try {
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
  } catch (error) {
    console.error("Error creating event:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create event";
    let statusCode = 500;
    let errorCode = "CREATE_ERROR";

    if (errorMessage.includes("already exists")) {
      statusCode = 409;
      errorCode = "DUPLICATE";
    }

    return c.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      },
      statusCode
    );
  }
});

// ============================================================================
// MARKET SENTIMENT & INDEX ROUTES
// ============================================================================

/**
 * Get market sentiment for a location
 */
app.get("/sentiment", async (c) => {
  const geographicScope = c.req.query("scope") ?? "city";
  const location = c.req.query("location") ?? "";

  if (!location) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "Location is required" },
      },
      400
    );
  }

  try {
    const sentiment = await convex.query(api.realEstate.getMarketSentiment, {
      geographicScope,
      location,
    });

    if (!sentiment) {
      return c.json({
        success: true,
        data: null,
        message: "No sentiment data available for this location",
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      data: {
        ...sentiment,
        calculatedAt: sentiment.calculatedAt ? new Date(sentiment.calculatedAt).toISOString() : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching market sentiment:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch market sentiment",
        },
      },
      500
    );
  }
});

/**
 * Get PULL Real Estate Index
 */
app.get("/index", async (c) => {
  const ticker = c.req.query("ticker");
  const geographicScope = c.req.query("scope");
  const location = c.req.query("location");
  const includeHistory = c.req.query("history") === "true";

  try {
    const index = await convex.query(api.realEstate.getPullIndex, {
      ticker: ticker || undefined,
      geographicScope: geographicScope || undefined,
      location: location || undefined,
    });

    if (!index) {
      return c.json({
        success: true,
        data: null,
        message: "No index data available",
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch history if requested
    let history = undefined;
    if (includeHistory && index._id) {
      try {
        history = await convex.query(api.realEstate.getPullIndexHistory, {
          indexId: index._id,
          limit: 365,
        });
      } catch (historyError) {
        console.error("Error fetching index history:", historyError);
        // Continue without history
      }
    }

    return c.json({
      success: true,
      data: {
        ...index,
        high52WeekDate: index.high52WeekDate ? new Date(index.high52WeekDate).toISOString() : null,
        low52WeekDate: index.low52WeekDate ? new Date(index.low52WeekDate).toISOString() : null,
        calculatedAt: index.calculatedAt ? new Date(index.calculatedAt).toISOString() : null,
        history: includeHistory ? history : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching PULL index:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch PULL index",
        },
      },
      500
    );
  }
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
app.get("/brokerages", async (c) => {
  const status = c.req.query("status") ?? "active";
  const tier = c.req.query("tier");
  const state = c.req.query("state");
  const limit = parseIntSafe(c.req.query("limit"), 50);

  try {
    const brokerages = await convex.query(api.realEstate.getBrokerages, {
      status: status || undefined,
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
        totalPages: Math.ceil(brokerages.length / limit),
        hasNextPage: false,
        hasPreviousPage: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching brokerages:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch brokerages",
        },
      },
      500
    );
  }
});

/**
 * Get brokerage by ID
 */
app.get("/brokerages/:id", async (c) => {
  const brokerageId = c.req.param("id");

  // TODO: Fetch from Convex realEstate.getBrokerageById

  return c.json({
    success: true,
    data: {
      id: brokerageId,
      name: "Example Realty",
      status: "active",
      tier: "growth",
      agentCount: 45,
      activeAgentCount: 42,
      totalReferrals: 1250,
      totalVolume: 125000000,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Register a new brokerage
 */
app.post("/brokerages", zValidator("json", createBrokerageSchema), async (c) => {
  const body = c.req.valid("json");

  // TODO: Create via Convex realEstate.createBrokerage

  return c.json({
    success: true,
    data: {
      id: "brk_" + Date.now(),
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
app.get("/brokerages/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Search via Convex realEstate.searchBrokerages

  return c.json({
    success: true,
    data: [],
    query,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get brokerage agents
 */
app.get("/brokerages/:id/agents", async (c) => {
  const brokerageId = c.req.param("id");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Fetch from Convex realEstate.getAgentsByBrokerage

  return c.json({
    success: true,
    data: [],
    pagination: {
      page: 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get/update brokerage white-label config
 */
app.get("/brokerages/:id/whitelabel", async (c) => {
  const brokerageId = c.req.param("id");

  // TODO: Fetch from Convex realEstate.getWhiteLabelConfig

  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

app.put("/brokerages/:id/whitelabel", zValidator("json", whiteLabelConfigSchema), async (c) => {
  const brokerageId = c.req.param("id");
  const body = c.req.valid("json");

  // TODO: Update via Convex realEstate.upsertWhiteLabelConfig

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
app.get("/agents/me", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex realEstate.getAgentByUserId

  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Register as an agent
 */
app.post("/agents/register", zValidator("json", registerAgentSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  // TODO: Create via Convex realEstate.registerAgent

  return c.json({
    success: true,
    data: {
      id: "agt_" + Date.now(),
      userId,
      status: "pending_verification",
      referralCode: "AGT-" + Date.now().toString(36).toUpperCase(),
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

/**
 * Get agent by referral code (public)
 */
app.get("/agents/referral/:code", async (c) => {
  const referralCode = c.req.param("code");

  // TODO: Fetch from Convex realEstate.getAgentByReferralCode

  return c.json({
    success: true,
    data: {
      referralCode,
      displayName: "John Smith",
      photoUrl: null,
      brokerage: {
        name: "Example Realty",
        logoUrl: null,
      },
      predictionAccuracy: 72.5,
      totalReferrals: 45,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get top performing agents
 */
app.get("/agents/leaderboard", async (c) => {
  const brokerageId = c.req.query("brokerage");
  const sortBy = c.req.query("sortBy") ?? "predictionAccuracy";
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // TODO: Fetch from Convex realEstate.getTopAgents

  return c.json({
    success: true,
    data: [],
    sortBy,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Search agents
 */
app.get("/agents/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const brokerageId = c.req.query("brokerage");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Search via Convex realEstate.searchAgents

  return c.json({
    success: true,
    data: [],
    query,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's referrals
 */
app.get("/agents/me/referrals", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Get agent ID from user, then fetch referrals

  return c.json({
    success: true,
    data: [],
    stats: {
      total: 0,
      active: 0,
      pending: 0,
      totalEarnings: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's points balance
 */
app.get("/agents/me/points", async (c) => {
  const userId = c.get("userId");

  // TODO: Fetch from Convex realEstate.getAgentPointsBalance

  return c.json({
    success: true,
    data: {
      balance: 0,
      pendingPoints: 0,
      lifetimeEarnings: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get agent's points history
 */
app.get("/agents/me/points/history", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Fetch from Convex realEstate.getAgentPointsHistory

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Invite a client
 */
app.post("/agents/me/invite", zValidator("json", inviteClientSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  // TODO: Create invitation, send email/SMS

  return c.json({
    success: true,
    data: {
      invitationId: "inv_" + Date.now(),
      email: body.email,
      status: "sent",
      sentAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }, 201);
});

/**
 * Get agent's leads (from lead scoring)
 */
app.get("/agents/me/leads", async (c) => {
  const userId = c.get("userId");
  const tier = c.req.query("tier"); // hot, warm, cold
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // TODO: Fetch from Convex realEstate.getAgentLeads

  return c.json({
    success: true,
    data: [],
    stats: {
      hot: 0,
      warm: 0,
      cold: 0,
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
app.get("/leads/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  const requestingUserId = c.get("userId");

  // TODO: Check if requesting user is an agent with access to this lead
  // TODO: Fetch from Convex realEstate.getLeadScore

  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// WHITE-LABEL DOMAIN ROUTES
// ============================================================================

/**
 * Get white-label config by domain (public, for white-label apps)
 */
app.get("/whitelabel/domain/:domain", async (c) => {
  const domain = c.req.param("domain");

  // TODO: Fetch from Convex realEstate.getWhiteLabelConfigByDomain

  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

export { app as realEstateRoutes };
