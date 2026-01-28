/**
 * Fantasy Football - League Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { requireFeature } from "../../lib/feature-flags";

const app = new Hono<Env>();

// Protect all fantasy league routes - feature is not production-ready
app.use("*", requireFeature("fantasy_leagues", "Fantasy Leagues"));

// =============================================================================
// SCHEMAS
// =============================================================================

const rosterPositionsSchema = z.object({
  qb: z.number().int().min(0).max(3).default(1),
  rb: z.number().int().min(0).max(4).default(2),
  wr: z.number().int().min(0).max(4).default(2),
  te: z.number().int().min(0).max(2).default(1),
  flex: z.number().int().min(0).max(3).default(1),
  k: z.number().int().min(0).max(1).default(1),
  def: z.number().int().min(0).max(1).default(1),
  bench: z.number().int().min(0).max(10).default(6),
  ir: z.number().int().min(0).max(3).default(1),
});

const scoringRulesSchema = z.object({
  passingYardsPerPoint: z.number().default(0.04),
  passingTd: z.number().default(4),
  interception: z.number().default(-2),
  rushingYardsPerPoint: z.number().default(0.1),
  rushingTd: z.number().default(6),
  receivingYardsPerPoint: z.number().default(0.1),
  receivingTd: z.number().default(6),
  reception: z.number().default(1),
  fumble: z.number().default(-2),
  fgMade: z.number().default(3),
  fgMissed: z.number().default(-1),
  extraPoint: z.number().default(1),
  sack: z.number().default(1),
  defenseInterception: z.number().default(2),
  fumbleRecovery: z.number().default(2),
  defenseTd: z.number().default(6),
  safety: z.number().default(2),
  pointsAllowed0: z.number().default(10),
  pointsAllowed1_6: z.number().default(7),
  pointsAllowed7_13: z.number().default(4),
  pointsAllowed14_20: z.number().default(1),
  pointsAllowed21_27: z.number().default(0),
  pointsAllowed28_34: z.number().default(-1),
  pointsAllowed35Plus: z.number().default(-4),
});

const createLeagueSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(500).optional(),
  scoringType: z.enum(["ppr", "half_ppr", "standard"]).default("ppr"),
  draftType: z.enum(["snake", "auction", "dynasty", "keeper"]).default("snake"),
  maxTeams: z.number().int().min(4).max(20).default(12),
  rosterPositions: rosterPositionsSchema.optional(),
  scoringRules: scoringRulesSchema.optional(),
  waiverType: z.enum(["faab", "rolling", "reverse_standings"]).default("faab"),
  waiverBudget: z.number().int().min(0).max(1000).default(100),
  tradeDeadlineWeek: z.number().int().min(1).max(17).optional(),
  tradeReviewPeriodHours: z.number().int().min(0).max(72).default(24),
  vetoVotesRequired: z.number().int().min(1).max(11).default(4),
  regularSeasonWeeks: z.number().int().min(10).max(17).default(14),
  playoffTeams: z.number().int().min(2).max(8).default(6),
  playoffWeeks: z.number().int().min(1).max(4).default(3),
  draftScheduledAt: z.number().optional(),
});

const updateLeagueSchema = createLeagueSchema.partial();

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(6).max(20),
  teamName: z.string().min(2).max(30),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Create a new league
 */
app.post("/", zValidator("json", createLeagueSchema), async (c) => {
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

  // Generate invite code
  const inviteCode = generateInviteCode();

  // Feature protected by feature flag - Convex integration pending

  const leagueId = crypto.randomUUID();
  const now = Date.now();

  const league = {
    id: leagueId,
    ...body,
    commissionerId: userId,
    inviteCode,
    currentTeams: 1,
    currentWeek: 1,
    season: new Date().getFullYear().toString(),
    status: "pre_draft",
    createdAt: now,
    updatedAt: now,
  };

  return c.json(
    {
      success: true,
      data: league,
      timestamp: new Date().toISOString(),
    },
    201
  );
});

/**
 * Get user's leagues
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const season = c.req.query("season");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: [],
    pagination: {
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: offset > 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league by ID
 */
app.get("/:leagueId", async (c) => {
  const userId = c.get("userId");
  const leagueId = c.req.param("leagueId");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      id: leagueId,
      name: "Sample League",
      status: "active",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Update league settings (commissioner only)
 */
app.put(
  "/:leagueId",
  zValidator("json", updateLeagueSchema),
  async (c) => {
    const userId = c.get("userId");
    const leagueId = c.req.param("leagueId");
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

    // Feature protected by feature flag - Convex integration pending

    return c.json({
      success: true,
      data: {
        id: leagueId,
        ...body,
        updatedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Join league with invite code
 */
app.post("/join", zValidator("json", joinLeagueSchema), async (c) => {
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

  // Feature protected by feature flag - Convex integration pending

  const teamId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      leagueId: "league-id",
      teamId,
      teamName: body.teamName,
      message: "Successfully joined league",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Leave league
 */
app.post("/:leagueId/leave", async (c) => {
  const userId = c.get("userId");
  const leagueId = c.req.param("leagueId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      message: "Successfully left league",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league standings
 */
app.get("/:leagueId/standings", async (c) => {
  const leagueId = c.req.param("leagueId");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      leagueId,
      season: new Date().getFullYear().toString(),
      week: 1,
      standings: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league schedule
 */
app.get("/:leagueId/schedule", async (c) => {
  const leagueId = c.req.param("leagueId");
  const week = c.req.query("week");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      leagueId,
      weeks: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league activity feed
 */
app.get("/:leagueId/activity", async (c) => {
  const leagueId = c.req.param("leagueId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: [],
    pagination: {
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: offset > 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league members
 */
app.get("/:leagueId/members", async (c) => {
  const leagueId = c.req.param("leagueId");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: [],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Invite member to league (commissioner only)
 */
app.post(
  "/:leagueId/invite",
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const userId = c.get("userId");
    const leagueId = c.req.param("leagueId");
    const { email } = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        },
        401
      );
    }

    // Feature protected by feature flag - Convex integration pending

    return c.json({
      success: true,
      data: {
        message: `Invitation sent to ${email}`,
        inviteCode: generateInviteCode(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Remove member from league (commissioner only)
 */
app.delete("/:leagueId/members/:memberId", async (c) => {
  const userId = c.get("userId");
  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      message: "Member removed from league",
    },
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export { app as fantasyLeaguesRoutes };
