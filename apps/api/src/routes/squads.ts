/**
 * Squads API Routes
 * REST endpoints for squad mode and squad wars
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  CreateSquadRequestSchema,
  InviteMemberRequestSchema,
  JoinSquadRequestSchema,
  UpdateMemberRoleRequestSchema,
  ContributeToPoolRequestSchema,
  StartWarRequestSchema,
  SubmitVoteRequestSchema,
  GetSquadsRequestSchema,
  GetWarsRequestSchema,
  SquadRoleSchema,
  SquadTierSchema,
  WarTypeSchema,
  WarStatusSchema,
} from "@pull/core/services/squads";

const app = new Hono<Env>();

// ============================================================================
// SQUAD CRUD
// ============================================================================

/**
 * Create a new squad
 */
app.post("/", zValidator("json", CreateSquadRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const squadId = crypto.randomUUID();
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    return c.json({
      success: true,
      data: {
        squad: {
          id: squadId,
          name: body.name,
          tag: body.tag,
          description: body.description,
          status: "active",
          tier: "bronze",
          captainId: userId,
          memberCount: 1,
          maxMembers: body.maxMembers,
          isPublic: body.isPublic,
          requiresApproval: body.requiresApproval,
          poolBalance: 0,
          createdAt: Date.now(),
        },
        inviteCode,
        shareLink: `https://pull.app/squad/${squadId}?invite=${inviteCode}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CREATE_SQUAD_FAILED",
          message: error instanceof Error ? error.message : "Failed to create squad",
        },
      },
      500
    );
  }
});

/**
 * Get squad by ID
 */
app.get("/:squadId", async (c) => {
  const squadId = c.req.param("squadId");

  try {
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_SQUAD_FAILED",
          message: error instanceof Error ? error.message : "Failed to get squad",
        },
      },
      500
    );
  }
});

/**
 * Get squad by tag
 */
app.get("/tag/:tag", async (c) => {
  const tag = c.req.param("tag");

  try {
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_SQUAD_FAILED",
          message: error instanceof Error ? error.message : "Failed to get squad",
        },
      },
      500
    );
  }
});

/**
 * Search squads
 */
app.get("/", async (c) => {
  const query = c.req.query("q");
  const tier = c.req.query("tier");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    return c.json({
      success: true,
      data: {
        squads: [],
        nextCursor: undefined,
        hasMore: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SEARCH_SQUADS_FAILED",
          message: error instanceof Error ? error.message : "Failed to search squads",
        },
      },
      500
    );
  }
});

/**
 * Get my squads
 */
app.get("/me", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { squads: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_MY_SQUADS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get my squads",
        },
      },
      500
    );
  }
});

// ============================================================================
// MEMBERS
// ============================================================================

/**
 * Invite member to squad
 */
app.post("/:squadId/invite", zValidator("json", z.object({
  userId: z.string(),
  role: SquadRoleSchema.optional(),
})), async (c) => {
  const inviterId = c.get("userId");
  const squadId = c.req.param("squadId");
  const body = c.req.valid("json");

  if (!inviterId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        squadId,
        userId: body.userId,
        role: body.role ?? "member",
        status: "invited",
        invitedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVITE_MEMBER_FAILED",
          message: error instanceof Error ? error.message : "Failed to invite member",
        },
      },
      500
    );
  }
});

/**
 * Join a squad
 */
app.post("/:squadId/join", zValidator("json", z.object({
  inviteCode: z.string().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        squadId,
        userId,
        role: "member",
        status: "active",
        joinedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "JOIN_SQUAD_FAILED",
          message: error instanceof Error ? error.message : "Failed to join squad",
        },
      },
      500
    );
  }
});

/**
 * Leave a squad
 */
app.post("/:squadId/leave", async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { left: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "LEAVE_SQUAD_FAILED",
          message: error instanceof Error ? error.message : "Failed to leave squad",
        },
      },
      500
    );
  }
});

/**
 * Kick a member
 */
app.post("/:squadId/kick/:memberId", async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");
  const memberId = c.req.param("memberId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { kicked: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "KICK_MEMBER_FAILED",
          message: error instanceof Error ? error.message : "Failed to kick member",
        },
      },
      500
    );
  }
});

/**
 * Update member role
 */
app.patch("/:squadId/members/:memberId/role", zValidator("json", z.object({
  role: SquadRoleSchema,
})), async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");
  const memberId = c.req.param("memberId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { memberId, newRole: body.role },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UPDATE_ROLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update role",
        },
      },
      500
    );
  }
});

// ============================================================================
// POOL
// ============================================================================

/**
 * Contribute to squad pool
 */
app.post("/:squadId/pool/contribute", zValidator("json", z.object({
  amount: z.number().positive(),
})), async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        squadId,
        userId,
        amount: body.amount,
        type: "deposit",
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CONTRIBUTE_FAILED",
          message: error instanceof Error ? error.message : "Failed to contribute to pool",
        },
      },
      500
    );
  }
});

/**
 * Withdraw from squad pool
 */
app.post("/:squadId/pool/withdraw", zValidator("json", z.object({
  amount: z.number().positive(),
})), async (c) => {
  const userId = c.get("userId");
  const squadId = c.req.param("squadId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        squadId,
        userId,
        amount: body.amount,
        type: "withdrawal",
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "WITHDRAW_FAILED",
          message: error instanceof Error ? error.message : "Failed to withdraw from pool",
        },
      },
      500
    );
  }
});

// ============================================================================
// WARS
// ============================================================================

/**
 * Start a squad war
 */
app.post("/wars", zValidator("json", StartWarRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const warId = crypto.randomUUID();

    return c.json({
      success: true,
      data: {
        war: {
          id: warId,
          type: body.type,
          status: body.defenderSquadId ? "pending" : "matching",
          challengerSquadId: body.challengerSquadId,
          defenderSquadId: body.defenderSquadId,
          stakePerSquad: body.stakePerSquad,
          totalPot: body.stakePerSquad * 2,
          marketIds: body.marketIds,
          roundCount: body.roundCount ?? body.marketIds.length,
          currentRound: 1,
          challengerScore: 0,
          defenderScore: 0,
          isTie: false,
          chatEnabled: true,
          createdAt: Date.now(),
        },
        shareLink: `https://pull.app/war/${warId}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "START_WAR_FAILED",
          message: error instanceof Error ? error.message : "Failed to start war",
        },
      },
      500
    );
  }
});

/**
 * Accept a war challenge
 */
app.post("/wars/:warId/accept", async (c) => {
  const userId = c.get("userId");
  const warId = c.req.param("warId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        warId,
        status: "preparation",
        acceptedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "ACCEPT_WAR_FAILED",
          message: error instanceof Error ? error.message : "Failed to accept war",
        },
      },
      500
    );
  }
});

/**
 * Decline a war challenge
 */
app.post("/wars/:warId/decline", async (c) => {
  const userId = c.get("userId");
  const warId = c.req.param("warId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { declined: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "DECLINE_WAR_FAILED",
          message: error instanceof Error ? error.message : "Failed to decline war",
        },
      },
      500
    );
  }
});

/**
 * Submit vote for a war round
 */
app.post("/wars/:warId/vote", zValidator("json", SubmitVoteRequestSchema.omit({ warId: true })), async (c) => {
  const userId = c.get("userId");
  const warId = c.req.param("warId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        warId,
        roundNumber: body.roundNumber,
        userId,
        outcome: body.outcome,
        confidence: body.confidence,
        votedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SUBMIT_VOTE_FAILED",
          message: error instanceof Error ? error.message : "Failed to submit vote",
        },
      },
      500
    );
  }
});

/**
 * Get war by ID
 */
app.get("/wars/:warId", async (c) => {
  const warId = c.req.param("warId");

  try {
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_WAR_FAILED",
          message: error instanceof Error ? error.message : "Failed to get war",
        },
      },
      500
    );
  }
});

/**
 * Get squad's wars
 */
app.get("/:squadId/wars", async (c) => {
  const squadId = c.req.param("squadId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    return c.json({
      success: true,
      data: {
        wars: [],
        nextCursor: undefined,
        hasMore: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_WARS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get wars",
        },
      },
      500
    );
  }
});

// ============================================================================
// LEADERBOARD
// ============================================================================

/**
 * Get squad leaderboard
 */
app.get("/leaderboard/:period", async (c) => {
  const period = c.req.param("period") as "daily" | "weekly" | "monthly" | "season" | "all_time";
  const limit = parseInt(c.req.query("limit") ?? "100", 10);

  try {
    return c.json({
      success: true,
      data: {
        entries: [],
        period,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_LEADERBOARD_FAILED",
          message: error instanceof Error ? error.message : "Failed to get leaderboard",
        },
      },
      500
    );
  }
});

export { app as squadsRoutes };
