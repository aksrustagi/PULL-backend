/**
 * Fantasy Football API Routes
 *
 * All fantasy football related endpoints including:
 * - Leagues: Create, join, manage fantasy leagues
 * - Teams: Roster management, lineups, matchups
 * - Players: NFL player data, stats, projections
 * - Transactions: Waivers, trades, add/drops
 * - Markets: Prediction markets for fantasy matchups
 */

import { Hono } from "hono";
import type { Env } from "../../index";

import { fantasyLeaguesRoutes } from "./leagues";
import { fantasyTeamsRoutes } from "./teams";
import { fantasyPlayersRoutes } from "./players";
import { fantasyTransactionsRoutes } from "./transactions";
import { fantasyMarketsRoutes } from "./markets";

const app = new Hono<Env>();

// Mount sub-routes
app.route("/leagues", fantasyLeaguesRoutes);
app.route("/teams", fantasyTeamsRoutes);
app.route("/players", fantasyPlayersRoutes);
app.route("/transactions", fantasyTransactionsRoutes);
app.route("/markets", fantasyMarketsRoutes);

// Health check
app.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      service: "fantasy-football",
      status: "healthy",
      version: "1.0.0",
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as fantasyRoutes };
