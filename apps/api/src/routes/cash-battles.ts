/**
 * Cash Battles API Routes
 * REST endpoints for 1v1 head-to-head prediction duels
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  CreateBattleRequestSchema,
  AcceptBattleRequestSchema,
  SubmitPredictionRequestSchema,
  JoinMatchmakingRequestSchema,
  GetBattlesRequestSchema,
  SendChatMessageRequestSchema,
  BattleStatusSchema,
  BattleTypeSchema,
  BattleMatchTypeSchema,
  BattleCategorySchema,
  DisputeReasonSchema,
} from "@pull/core/services/cash-battles";

const app = new Hono<Env>();

// ============================================================================
// BATTLE CREATION & MANAGEMENT
// ============================================================================

/**
 * Create a new battle
 */
app.post("/", zValidator("json", CreateBattleRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const battleId = crypto.randomUUID();

    return c.json({
      success: true,
      data: {
        battle: {
          id: battleId,
          creatorId: userId,
          opponentId: body.opponentId,
          status: body.matchType === "random" ? "matching" : "pending",
          type: body.type,
          matchType: body.matchType,
          category: body.category,
          stake: body.stake,
          currency: body.currency,
          totalPot: body.stake * 2,
          platformFee: body.stake * 0.1,
          winnerPayout: body.stake * 1.9,
          marketId: body.marketId,
          creatorScore: 0,
          opponentScore: 0,
          isTie: false,
          chatEnabled: body.chatEnabled,
          isPrivate: body.isPrivate,
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        shareLink: `https://pull.app/battle/${battleId}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CREATE_BATTLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create battle",
        },
      },
      500
    );
  }
});

/**
 * Accept a battle challenge
 */
app.post("/:battleId/accept", async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");

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
        battleId,
        status: "active",
        acceptedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "ACCEPT_BATTLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to accept battle",
        },
      },
      500
    );
  }
});

/**
 * Decline a battle challenge
 */
app.post("/:battleId/decline", async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");

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
          code: "DECLINE_BATTLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to decline battle",
        },
      },
      500
    );
  }
});

/**
 * Cancel a battle (creator only, before accepted)
 */
app.post("/:battleId/cancel", async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { cancelled: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CANCEL_BATTLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to cancel battle",
        },
      },
      500
    );
  }
});

// ============================================================================
// PREDICTIONS
// ============================================================================

/**
 * Submit prediction for a battle round
 */
app.post("/:battleId/predict", zValidator("json", SubmitPredictionRequestSchema.omit({ battleId: true })), async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");
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
        battleId,
        roundNumber: body.roundNumber,
        userId,
        outcome: body.outcome,
        confidence: body.confidence,
        lockedAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SUBMIT_PREDICTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to submit prediction",
        },
      },
      500
    );
  }
});

// ============================================================================
// MATCHMAKING
// ============================================================================

/**
 * Join random matchmaking queue
 */
app.post("/matchmaking/join", zValidator("json", JoinMatchmakingRequestSchema), async (c) => {
  const userId = c.get("userId");
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
        queueEntry: {
          id: crypto.randomUUID(),
          userId,
          battleType: body.battleType,
          category: body.category,
          stakeRange: { min: body.stakeMin, max: body.stakeMax },
          queuedAt: Date.now(),
          status: "queued",
        },
        estimatedWaitTime: 30,
        playersInQueue: 12,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "JOIN_MATCHMAKING_FAILED",
          message: error instanceof Error ? error.message : "Failed to join matchmaking",
        },
      },
      500
    );
  }
});

/**
 * Leave matchmaking queue
 */
app.post("/matchmaking/leave", async (c) => {
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
      data: { left: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "LEAVE_MATCHMAKING_FAILED",
          message: error instanceof Error ? error.message : "Failed to leave matchmaking",
        },
      },
      500
    );
  }
});

/**
 * Get matchmaking status
 */
app.get("/matchmaking/status", async (c) => {
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
      data: {
        inQueue: false,
        queueEntry: null,
        estimatedWaitTime: null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STATUS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get matchmaking status",
        },
      },
      500
    );
  }
});

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get battle by ID
 */
app.get("/:battleId", async (c) => {
  const battleId = c.req.param("battleId");

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
          code: "GET_BATTLE_FAILED",
          message: error instanceof Error ? error.message : "Failed to get battle",
        },
      },
      500
    );
  }
});

/**
 * Get user's battles
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    return c.json({
      success: true,
      data: {
        battles: [],
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
          code: "GET_BATTLES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get battles",
        },
      },
      500
    );
  }
});

/**
 * Get open battles (joinable)
 */
app.get("/open", async (c) => {
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    return c.json({
      success: true,
      data: { battles: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_OPEN_BATTLES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get open battles",
        },
      },
      500
    );
  }
});

// ============================================================================
// CHAT
// ============================================================================

/**
 * Send chat message in battle
 */
app.post("/:battleId/chat", zValidator("json", SendChatMessageRequestSchema.omit({ battleId: true })), async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");
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
        battleId,
        userId,
        message: body.message,
        isSystem: false,
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SEND_MESSAGE_FAILED",
          message: error instanceof Error ? error.message : "Failed to send message",
        },
      },
      500
    );
  }
});

/**
 * Get battle chat messages
 */
app.get("/:battleId/chat", async (c) => {
  const battleId = c.req.param("battleId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  try {
    return c.json({
      success: true,
      data: { messages: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_CHAT_FAILED",
          message: error instanceof Error ? error.message : "Failed to get chat messages",
        },
      },
      500
    );
  }
});

// ============================================================================
// SPECTATORS
// ============================================================================

/**
 * Join as spectator
 */
app.post("/:battleId/spectate", async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { joined: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "JOIN_SPECTATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to join as spectator",
        },
      },
      500
    );
  }
});

// ============================================================================
// STATS & LEADERBOARD
// ============================================================================

/**
 * Get player stats
 */
app.get("/stats/:userId", async (c) => {
  const targetUserId = c.req.param("userId");

  try {
    return c.json({
      success: true,
      data: {
        userId: targetUserId,
        totalBattles: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        winStreak: 0,
        longestWinStreak: 0,
        totalWagered: 0,
        totalWon: 0,
        netProfit: 0,
        roi: 0,
        skillRating: 1000,
        rank: "bronze",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STATS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get stats",
        },
      },
      500
    );
  }
});

/**
 * Get leaderboard
 */
app.get("/leaderboard/:period", async (c) => {
  const period = c.req.param("period") as "daily" | "weekly" | "monthly" | "all_time";
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);

  try {
    return c.json({
      success: true,
      data: {
        entries: [],
        period,
        category,
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

// ============================================================================
// DISPUTES
// ============================================================================

/**
 * File a dispute
 */
app.post("/:battleId/dispute", zValidator("json", z.object({
  reason: DisputeReasonSchema,
  description: z.string().max(1000),
  evidence: z.array(z.string()).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const battleId = c.req.param("battleId");
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
        battleId,
        disputerId: userId,
        reason: body.reason,
        description: body.description,
        status: "pending",
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "FILE_DISPUTE_FAILED",
          message: error instanceof Error ? error.message : "Failed to file dispute",
        },
      },
      500
    );
  }
});

export { app as cashBattlesRoutes };
