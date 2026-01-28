/**
 * Fantasy Football - Transaction Routes
 *
 * Handles waivers, trades, add/drops, and other roster transactions.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { requireFeature } from "../../lib/feature-flags";

const app = new Hono<Env>();

// Protect all fantasy transaction routes - feature is not production-ready
app.use("*", requireFeature("fantasy_trading", "Fantasy Trading"));

// =============================================================================
// SCHEMAS
// =============================================================================

const addDropSchema = z.object({
  leagueId: z.string(),
  teamId: z.string(),
  addPlayerId: z.string().optional(),
  dropPlayerId: z.string().optional(),
});

const waiverClaimSchema = z.object({
  leagueId: z.string(),
  teamId: z.string(),
  addPlayerId: z.string(),
  dropPlayerId: z.string().optional(),
  faabBid: z.number().int().min(0).optional(),
  priority: z.number().int().min(1).optional(),
});

const tradeProposalSchema = z.object({
  leagueId: z.string(),
  fromTeamId: z.string(),
  toTeamId: z.string(),
  playersOffered: z.array(z.string()),
  playersRequested: z.array(z.string()),
  draftPicksOffered: z.array(z.string()).optional(),
  draftPicksRequested: z.array(z.string()).optional(),
  faabOffered: z.number().int().min(0).optional(),
  faabRequested: z.number().int().min(0).optional(),
  message: z.string().max(500).optional(),
});

const tradeResponseSchema = z.object({
  accept: z.boolean(),
  counterOffer: tradeProposalSchema.omit({ leagueId: true, fromTeamId: true, toTeamId: true }).optional(),
  message: z.string().max(500).optional(),
});

// =============================================================================
// ADD/DROP ROUTES
// =============================================================================

/**
 * Add a free agent
 */
app.post("/add", zValidator("json", addDropSchema), async (c) => {
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

  if (!body.addPlayerId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "addPlayerId is required" },
      },
      400
    );
  }

  // Feature protected by feature flag - Convex integration pending

  const transactionId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: transactionId,
      type: "add",
      status: "completed",
      leagueId: body.leagueId,
      teamId: body.teamId,
      addPlayerId: body.addPlayerId,
      processedAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Drop a player
 */
app.post("/drop", zValidator("json", addDropSchema), async (c) => {
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

  if (!body.dropPlayerId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "dropPlayerId is required" },
      },
      400
    );
  }

  // Feature protected by feature flag - Convex integration pending

  const transactionId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: transactionId,
      type: "drop",
      status: "completed",
      leagueId: body.leagueId,
      teamId: body.teamId,
      dropPlayerId: body.dropPlayerId,
      processedAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// WAIVER ROUTES
// =============================================================================

/**
 * Submit waiver claim
 */
app.post("/waiver", zValidator("json", waiverClaimSchema), async (c) => {
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

  const transactionId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: transactionId,
      type: "waiver_claim",
      status: "pending",
      leagueId: body.leagueId,
      teamId: body.teamId,
      addPlayerId: body.addPlayerId,
      dropPlayerId: body.dropPlayerId,
      faabBid: body.faabBid,
      priority: body.priority,
      processAfter: getNextWaiverProcessTime(),
      createdAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get pending waiver claims for team
 */
app.get("/waiver/pending", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.query("teamId");
  const leagueId = c.req.query("leagueId");

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
    timestamp: new Date().toISOString(),
  });
});

/**
 * Cancel waiver claim
 */
app.delete("/waiver/:claimId", async (c) => {
  const userId = c.get("userId");
  const claimId = c.req.param("claimId");

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
      id: claimId,
      status: "cancelled",
      cancelledAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Reorder waiver priority
 */
app.put(
  "/waiver/reorder",
  zValidator(
    "json",
    z.object({
      teamId: z.string(),
      claimIds: z.array(z.string()),
    })
  ),
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

    // Feature protected by feature flag - Convex integration pending

    return c.json({
      success: true,
      data: {
        message: "Waiver priorities updated",
        claimIds: body.claimIds,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// =============================================================================
// TRADE ROUTES
// =============================================================================

/**
 * Propose a trade
 */
app.post("/trade", zValidator("json", tradeProposalSchema), async (c) => {
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

  const transactionId = crypto.randomUUID();

  return c.json({
    success: true,
    data: {
      id: transactionId,
      type: "trade",
      status: "pending",
      ...body,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000, // 48 hours
      createdAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trade details
 */
app.get("/trade/:tradeId", async (c) => {
  const tradeId = c.req.param("tradeId");

  // Feature protected by feature flag - Convex integration pending

  return c.json({
    success: true,
    data: {
      id: tradeId,
      type: "trade",
      status: "pending",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Respond to trade (accept/reject/counter)
 */
app.put(
  "/trade/:tradeId/respond",
  zValidator("json", tradeResponseSchema),
  async (c) => {
    const userId = c.get("userId");
    const tradeId = c.req.param("tradeId");
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

    if (body.accept) {
      return c.json({
        success: true,
        data: {
          id: tradeId,
          status: "approved",
          message: "Trade accepted, pending league review",
          reviewEndsAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        },
        timestamp: new Date().toISOString(),
      });
    } else if (body.counterOffer) {
      const counterId = crypto.randomUUID();
      return c.json({
        success: true,
        data: {
          id: counterId,
          type: "trade",
          status: "pending",
          message: "Counter offer sent",
          originalTradeId: tradeId,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      return c.json({
        success: true,
        data: {
          id: tradeId,
          status: "rejected",
          message: body.message || "Trade rejected",
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Cancel trade proposal
 */
app.delete("/trade/:tradeId", async (c) => {
  const userId = c.get("userId");
  const tradeId = c.req.param("tradeId");

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
      id: tradeId,
      status: "cancelled",
      cancelledAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Vote on trade (veto/approve)
 */
app.post(
  "/trade/:tradeId/vote",
  zValidator("json", z.object({ vote: z.enum(["veto", "approve"]) })),
  async (c) => {
    const userId = c.get("userId");
    const tradeId = c.req.param("tradeId");
    const { vote } = c.req.valid("json");

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
        tradeId,
        vote,
        message: `Vote recorded: ${vote}`,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// =============================================================================
// TRANSACTION HISTORY
// =============================================================================

/**
 * Get league transaction history
 */
app.get("/", async (c) => {
  const leagueId = c.req.query("leagueId");
  const teamId = c.req.query("teamId");
  const type = c.req.query("type");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  if (!leagueId) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_REQUEST", message: "leagueId is required" },
      },
      400
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

// =============================================================================
// COMMISSIONER ACTIONS
// =============================================================================

/**
 * Commissioner: Force process waivers
 */
app.post("/commissioner/process-waivers", async (c) => {
  const userId = c.get("userId");
  const leagueId = c.req.query("leagueId");

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
      message: "Waivers processed",
      processedAt: Date.now(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Commissioner: Force approve/reject trade
 */
app.post(
  "/commissioner/trade/:tradeId",
  zValidator("json", z.object({ action: z.enum(["approve", "reject"]), reason: z.string().optional() })),
  async (c) => {
    const userId = c.get("userId");
    const tradeId = c.req.param("tradeId");
    const { action, reason } = c.req.valid("json");

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
        tradeId,
        status: action === "approve" ? "completed" : "rejected",
        commissionerAction: true,
        reason,
        processedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Commissioner: Add/drop player for team
 */
app.post(
  "/commissioner/roster-move",
  zValidator(
    "json",
    z.object({
      leagueId: z.string(),
      teamId: z.string(),
      addPlayerId: z.string().optional(),
      dropPlayerId: z.string().optional(),
      reason: z.string(),
    })
  ),
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

    // Feature protected by feature flag - Convex integration pending

    return c.json({
      success: true,
      data: {
        type: "commissioner_action",
        status: "completed",
        ...body,
        processedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// =============================================================================
// HELPERS
// =============================================================================

function getNextWaiverProcessTime(): number {
  // Next Wednesday at 4am EST
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysUntilWednesday = (3 - dayOfWeek + 7) % 7 || 7;
  const nextWednesday = new Date(now);
  nextWednesday.setUTCDate(now.getUTCDate() + daysUntilWednesday);
  nextWednesday.setUTCHours(9, 0, 0, 0); // 4am EST = 9am UTC
  return nextWednesday.getTime();
}

export { app as fantasyTransactionsRoutes };
