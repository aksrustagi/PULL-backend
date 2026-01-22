/**
 * Fantasy Football - Prediction Markets Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import {
  formatOdds,
  LMSRMarketMaker,
} from "@pull/core/services/fantasy";

const app = new Hono<Env>();

// =============================================================================
// SCHEMAS
// =============================================================================

const placeBetSchema = z.object({
  outcomeId: z.string(),
  amount: z.number().positive().max(10000),
  maxSlippage: z.number().min(0).max(0.5).default(0.05),
});

const createMarketSchema = z.object({
  leagueId: z.string().optional(),
  type: z.enum([
    "matchup",
    "league_winner",
    "player_prop",
    "weekly_high_score",
    "division_winner",
    "over_under",
    "custom",
  ]),
  title: z.string().min(5).max(200),
  description: z.string().max(1000),
  outcomes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
      })
    )
    .min(2)
    .max(20),
  week: z.number().int().min(1).max(18).optional(),
  closesAt: z.number(),
  liquidityParameter: z.number().min(10).max(1000).default(100),
  referenceType: z.enum(["matchup", "player", "team", "league"]).optional(),
  referenceId: z.string().optional(),
});

// =============================================================================
// GLOBAL MARKETS
// =============================================================================

/**
 * Get all open markets
 */
app.get("/", async (c) => {
  const type = c.req.query("type");
  const status = c.req.query("status") || "open";
  const leagueId = c.req.query("leagueId");
  const week = c.req.query("week");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // TODO: Fetch from Convex

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
 * Get market by ID
 */
app.get("/:marketId", async (c) => {
  const marketId = c.req.param("marketId");
  const oddsFormat = (c.req.query("oddsFormat") || "american") as
    | "american"
    | "decimal"
    | "probability";

  // TODO: Fetch from Convex

  const mockOutcomes = [
    { id: "team-a", label: "Team A", odds: 0.55, totalVolume: 500 },
    { id: "team-b", label: "Team B", odds: 0.45, totalVolume: 400 },
  ];

  return c.json({
    success: true,
    data: {
      id: marketId,
      type: "matchup",
      title: "Team A vs Team B",
      description: "Week 1 matchup prediction",
      status: "open",
      outcomes: mockOutcomes.map((o) => ({
        ...o,
        displayOdds: formatOdds(o.odds, oddsFormat),
        impliedProbability: o.odds,
      })),
      totalVolume: 900,
      totalLiquidity: 200,
      closesAt: Date.now() + 86400000,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get market order book / price history
 */
app.get("/:marketId/orderbook", async (c) => {
  const marketId = c.req.param("marketId");

  // TODO: Fetch order history

  return c.json({
    success: true,
    data: {
      marketId,
      recentTrades: [],
      priceHistory: [],
    },
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// LEAGUE MARKETS
// =============================================================================

/**
 * Get league-specific markets
 */
app.get("/league/:leagueId", async (c) => {
  const leagueId = c.req.param("leagueId");
  const type = c.req.query("type");
  const week = c.req.query("week");

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      leagueId,
      markets: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get this week's matchup markets for league
 */
app.get("/league/:leagueId/matchups", async (c) => {
  const leagueId = c.req.param("leagueId");
  const week = c.req.query("week");

  // TODO: Fetch matchup markets

  return c.json({
    success: true,
    data: {
      leagueId,
      week: week ? parseInt(week, 10) : 1,
      matchupMarkets: [],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get league winner market
 */
app.get("/league/:leagueId/winner", async (c) => {
  const leagueId = c.req.param("leagueId");

  // TODO: Fetch league winner market

  return c.json({
    success: true,
    data: {
      leagueId,
      market: null,
    },
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// BETTING
// =============================================================================

/**
 * Place a bet
 */
app.post(
  "/:marketId/bet",
  zValidator("json", placeBetSchema),
  async (c) => {
    const userId = c.get("userId");
    const marketId = c.req.param("marketId");
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

    // TODO: Verify wallet balance, fetch market, execute bet

    const betId = crypto.randomUUID();

    // Mock odds calculation
    const odds = 0.55;
    const shares = body.amount / odds;
    const potentialPayout = shares;

    return c.json({
      success: true,
      data: {
        id: betId,
        marketId,
        outcomeId: body.outcomeId,
        amount: body.amount,
        oddsAtPlacement: LMSRMarketMaker.priceToDecimalOdds(odds),
        displayOdds: formatOdds(odds, "american"),
        impliedProbability: odds,
        potentialPayout,
        status: "active",
        placedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Get user's bets
 */
app.get("/bets/mine", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const leagueId = c.req.query("leagueId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
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

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: [],
    summary: {
      totalBets: 0,
      activeBets: 0,
      totalWagered: 0,
      totalWon: 0,
      totalLost: 0,
      netProfitLoss: 0,
    },
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
 * Get active positions
 */
app.get("/bets/active", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch active bets with current values

  return c.json({
    success: true,
    data: {
      positions: [],
      totalValue: 0,
      totalInvested: 0,
      unrealizedPnL: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Cash out a bet
 */
app.post("/bets/:betId/cashout", async (c) => {
  const userId = c.get("userId");
  const betId = c.req.param("betId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Verify bet ownership, calculate cash out value, execute

  const cashOutAmount = 15.5; // Mock value

  return c.json({
    success: true,
    data: {
      betId,
      status: "cashed_out",
      cashedOutAmount: cashOutAmount,
      cashedOutAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get bet details
 */
app.get("/bets/:betId", async (c) => {
  const userId = c.get("userId");
  const betId = c.req.param("betId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Fetch from Convex

  return c.json({
    success: true,
    data: {
      id: betId,
      marketId: "market-id",
      outcomeId: "outcome-id",
      outcomeLabel: "Team A",
      amount: 10,
      oddsAtPlacement: 1.82,
      currentOdds: 1.75,
      impliedProbability: 0.55,
      potentialPayout: 18.2,
      currentValue: 12.5,
      status: "active",
      placedAt: Date.now() - 86400000,
    },
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// MARKET CREATION (Commissioner/Admin)
// =============================================================================

/**
 * Create custom market
 */
app.post(
  "/create",
  zValidator("json", createMarketSchema),
  async (c) => {
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

    // TODO: Verify user is commissioner (if league market) or admin

    const marketId = crypto.randomUUID();
    const now = Date.now();

    // Initialize outcomes with equal odds
    const equalProb = 1 / body.outcomes.length;
    const outcomes = body.outcomes.map((o) => ({
      ...o,
      odds: LMSRMarketMaker.priceToDecimalOdds(equalProb),
      impliedProbability: equalProb,
      totalVolume: 0,
    }));

    return c.json(
      {
        success: true,
        data: {
          id: marketId,
          ...body,
          outcomes,
          status: "open",
          totalVolume: 0,
          totalLiquidity: body.liquidityParameter * body.outcomes.length,
          opensAt: now,
          createdBy: userId,
          createdAt: now,
        },
        timestamp: new Date().toISOString(),
      },
      201
    );
  }
);

/**
 * Settle market (admin/commissioner)
 */
app.post(
  "/:marketId/settle",
  zValidator(
    "json",
    z.object({
      winningOutcomeId: z.string(),
      notes: z.string().optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const marketId = c.req.param("marketId");
    const { winningOutcomeId, notes } = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        },
        401
      );
    }

    // TODO: Verify permissions, settle market, process payouts

    return c.json({
      success: true,
      data: {
        marketId,
        status: "settled",
        winningOutcomeId,
        settlementNotes: notes,
        settledAt: Date.now(),
        settledBy: userId,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Void/cancel market (admin/commissioner)
 */
app.post(
  "/:marketId/void",
  zValidator("json", z.object({ reason: z.string() })),
  async (c) => {
    const userId = c.get("userId");
    const marketId = c.req.param("marketId");
    const { reason } = c.req.valid("json");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        },
        401
      );
    }

    // TODO: Verify permissions, void market, refund all bets

    return c.json({
      success: true,
      data: {
        marketId,
        status: "voided",
        voidReason: reason,
        voidedAt: Date.now(),
        voidedBy: userId,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// =============================================================================
// LEADERBOARD
// =============================================================================

/**
 * Get betting leaderboard
 */
app.get("/leaderboard", async (c) => {
  const leagueId = c.req.query("leagueId");
  const period = c.req.query("period") || "season"; // season, week, all-time
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  // TODO: Calculate and fetch leaderboard

  return c.json({
    success: true,
    data: {
      period,
      leagueId,
      leaderboard: [],
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as fantasyMarketsRoutes };
