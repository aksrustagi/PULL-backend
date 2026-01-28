/**
 * Fantasy Football - Player Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { getSportsDataService } from "@pull/core/services/sports-data";
import { requireFeature } from "../../lib/feature-flags";
import { getLogger } from "@pull/core/services";

const logger = getLogger("fantasy-players");

const app = new Hono<Env>();

// Protect all fantasy routes - feature is not production-ready
app.use("*", requireFeature("fantasy_leagues", "Fantasy Leagues"));

// =============================================================================
// SCHEMAS
// =============================================================================

const searchPlayersSchema = z.object({
  query: z.string().optional(),
  position: z.enum(["QB", "RB", "WR", "TE", "K", "DEF"]).optional(),
  team: z.string().optional(),
  status: z.enum(["available", "rostered", "all"]).default("all"),
  sortBy: z
    .enum([
      "name",
      "projected",
      "average",
      "owned",
      "recent",
    ])
    .default("projected"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Search/filter players
 */
app.get("/", zValidator("query", searchPlayersSchema), async (c) => {
  const params = c.req.valid("query");
  const leagueId = c.req.query("leagueId");

  // Get sports data service
  const sportsData = getSportsDataService();

  try {
    let players = await sportsData.getFantasyPlayers();

    // Filter by search query
    if (params.query) {
      const q = params.query.toLowerCase();
      players = players.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.teamAbbreviation?.toLowerCase().includes(q)
      );
    }

    // Filter by position
    if (params.position) {
      players = players.filter((p) => p.position === params.position);
    }

    // Filter by team
    if (params.team) {
      players = players.filter(
        (p) =>
          p.teamAbbreviation?.toLowerCase() === params.team?.toLowerCase() ||
          p.teamId === params.team
      );
    }

    // Feature protected by feature flag - Convex integration pending

    // Sort
    players.sort((a, b) => {
      let comparison = 0;
      switch (params.sortBy) {
        case "name":
          comparison = a.fullName.localeCompare(b.fullName);
          break;
        case "projected":
          comparison = 0; // Would compare projected points
          break;
        case "owned":
          comparison = 0; // Would compare percent owned
          break;
        default:
          comparison = 0;
      }
      return params.sortOrder === "asc" ? comparison : -comparison;
    });

    // Paginate
    const total = players.length;
    const paginatedPlayers = players.slice(
      params.offset,
      params.offset + params.limit
    );

    return c.json({
      success: true,
      data: paginatedPlayers.map((p) => ({
        id: p.id,
        externalId: p.espnId,
        name: p.fullName,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        team: p.teamAbbreviation,
        teamId: p.teamId,
        status: p.status,
        injuryStatus: p.injuryStatus,
        headshotUrl: p.headshotUrl,
        byeWeek: p.byeWeek,
        projectedPoints: 0, // Would be calculated
        seasonPoints: 0,
        averagePoints: 0,
        percentOwned: 0,
        percentStarted: 0,
      })),
      pagination: {
        page: Math.floor(params.offset / params.limit) + 1,
        pageSize: params.limit,
        totalItems: total,
        totalPages: Math.ceil(total / params.limit),
        hasNextPage: params.offset + params.limit < total,
        hasPreviousPage: params.offset > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching players:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_ERROR", message: "Failed to fetch players" },
      },
      500
    );
  }
});

/**
 * Get player by ID
 */
app.get("/:playerId", async (c) => {
  const playerId = c.req.param("playerId");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      id: playerId,
      name: "Player Name",
      position: "RB",
      team: "NYG",
      status: "active",
      injuryStatus: null,
      byeWeek: 11,
      headshotUrl: null,
      experience: 3,
      age: 25,
      college: "College Name",
      height: "6'0\"",
      weight: 215,
      projectedPoints: 12.5,
      seasonPoints: 125.4,
      averagePoints: 15.7,
      percentOwned: 95.5,
      percentStarted: 87.3,
      adp: 15,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get player stats
 */
app.get("/:playerId/stats", async (c) => {
  const playerId = c.req.param("playerId");
  const season = c.req.query("season") || new Date().getFullYear().toString();
  const week = c.req.query("week");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      playerId,
      season,
      week: week ? parseInt(week, 10) : null,
      stats: week
        ? {
            // Weekly stats
            week: parseInt(week, 10),
            opponent: "DAL",
            isHome: true,
            gameStatus: "final",
            points: 18.5,
            passing: null,
            rushing: {
              attempts: 22,
              yards: 105,
              touchdowns: 1,
            },
            receiving: {
              targets: 4,
              receptions: 3,
              yards: 25,
              touchdowns: 0,
            },
          }
        : {
            // Season totals
            gamesPlayed: 8,
            totalPoints: 125.4,
            averagePoints: 15.7,
            passing: null,
            rushing: {
              attempts: 165,
              yards: 720,
              touchdowns: 6,
            },
            receiving: {
              targets: 32,
              receptions: 25,
              yards: 180,
              touchdowns: 1,
            },
          },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get player projections
 */
app.get("/:playerId/projections", async (c) => {
  const playerId = c.req.param("playerId");
  const week = c.req.query("week");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      playerId,
      week: week ? parseInt(week, 10) : null,
      projections: {
        standard: 12.5,
        halfPpr: 14.0,
        ppr: 15.5,
        floor: 8.0,
        ceiling: 22.0,
        projectedStats: {
          rushing: {
            attempts: 18,
            yards: 85,
            touchdowns: 0.7,
          },
          receiving: {
            targets: 3,
            receptions: 2.5,
            yards: 20,
            touchdowns: 0.1,
          },
        },
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get player game log
 */
app.get("/:playerId/gamelog", async (c) => {
  const playerId = c.req.param("playerId");
  const season = c.req.query("season") || new Date().getFullYear().toString();

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      playerId,
      season,
      games: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trending players (most added/dropped)
 */
app.get("/trending/all", async (c) => {
  const type = c.req.query("type") || "add";
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      type,
      players: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get players on bye this week
 */
app.get("/bye/:week", async (c) => {
  const week = parseInt(c.req.param("week"), 10);

  const sportsData = getSportsDataService();
  const teamsOnBye = sportsData.getTeamsOnBye(week);

  return c.json({
    success: true,
    data: {
      week,
      teams: teamsOnBye.map((t) => ({
        id: t.id,
        abbreviation: t.abbreviation,
        name: t.displayName,
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Compare players
 */
app.get("/compare", async (c) => {
  const playerIds = c.req.query("ids")?.split(",") || [];

  if (playerIds.length < 2) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "At least 2 player IDs required",
        },
      },
      400
    );
  }

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      players: [],
      comparison: {
        projectedPoints: [],
        seasonAverage: [],
        percentOwned: [],
        recentTrend: [],
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get NFL teams
 */
app.get("/nfl/teams", async (c) => {
  const sportsData = getSportsDataService();
  const teams = sportsData.getTeams();

  return c.json({
    success: true,
    data: teams.map((t) => ({
      id: t.id,
      abbreviation: t.abbreviation,
      name: t.displayName,
      location: t.location,
      conference: t.conference,
      division: t.division,
      byeWeek: t.byeWeek,
    })),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get NFL games (scoreboard)
 */
app.get("/nfl/games", async (c) => {
  const week = c.req.query("week");
  const season = c.req.query("season");

  const sportsData = getSportsDataService();

  try {
    const games = week
      ? await sportsData.getWeekGames(
          parseInt(week, 10),
          season ? parseInt(season, 10) : undefined
        )
      : await sportsData.getCurrentWeekGames();

    return c.json({
      success: true,
      data: games.map((g) => ({
        id: g.id,
        week: g.week,
        date: g.date,
        startTime: g.startTime,
        status: g.status,
        quarter: g.quarter,
        timeRemaining: g.timeRemaining,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        venue: g.venue,
        odds: g.odds,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching games:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_ERROR", message: "Failed to fetch games" },
      },
      500
    );
  }
});

export { app as fantasyPlayersRoutes };
