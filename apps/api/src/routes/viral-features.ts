/**
 * Viral Features API Routes
 * Killer features 6-10 for PULL viral growth
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

// Import services (would be actual imports in production)
// These are placeholder types - actual services would be imported from @pull/core

const app = new Hono<Env>();

// ============================================================================
// LIVE ROOMS ROUTES (Feature #6)
// ============================================================================

const liveRoomsApp = new Hono<Env>();

const createRoomSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["watch_party", "pregame_show", "halftime_show", "postgame_show", "betting_talk", "expert_panel", "ama", "breaking_news", "community", "private"]),
  eventId: z.string().optional(),
  scheduledStartTime: z.number().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
  settings: z.object({
    maxParticipants: z.number().default(5000),
    maxSpeakers: z.number().default(10),
    allowRaiseHand: z.boolean().default(true),
    allowChat: z.boolean().default(true),
    allowReactions: z.boolean().default(true),
    allowTips: z.boolean().default(true),
    allowRecording: z.boolean().default(true),
  }).optional(),
});

const sendTipSchema = z.object({
  recipientId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(["usd", "tokens"]).default("tokens"),
  message: z.string().max(200).optional(),
  animation: z.enum(["confetti", "fireworks", "money_rain", "trophy"]).optional(),
});

// Create room
liveRoomsApp.post("/", zValidator("json", createRoomSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");

  // In production, call LiveRoomsService
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return c.json({
    success: true,
    data: {
      id: roomId,
      ...body,
      hostId: userId,
      status: body.scheduledStartTime ? "scheduled" : "starting",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get room
liveRoomsApp.get("/:roomId", async (c) => {
  const roomId = c.req.param("roomId");

  return c.json({
    success: true,
    data: { id: roomId, status: "live" },
    timestamp: new Date().toISOString(),
  });
});

// Join room
liveRoomsApp.post("/:roomId/join", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");
  const body = await c.req.json<{ requestSpeaker?: boolean }>();

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      roomId,
      participantId: `participant_${userId}`,
      role: body.requestSpeaker ? "speaker" : "listener",
      audioToken: `token_${Date.now()}`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Leave room
liveRoomsApp.post("/:roomId/leave", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { left: true },
    timestamp: new Date().toISOString(),
  });
});

// Raise hand
liveRoomsApp.post("/:roomId/raise-hand", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { hasRaisedHand: true },
    timestamp: new Date().toISOString(),
  });
});

// Send tip
liveRoomsApp.post("/:roomId/tip", zValidator("json", sendTipSchema), async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      tipId: `tip_${Date.now()}`,
      roomId,
      senderId: userId,
      ...body,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Start/stop recording
liveRoomsApp.post("/:roomId/recording", async (c) => {
  const userId = c.get("userId");
  const roomId = c.req.param("roomId");
  const body = await c.req.json<{ action: "start" | "stop" }>();

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { recording: body.action === "start" },
    timestamp: new Date().toISOString(),
  });
});

// Get trending rooms
liveRoomsApp.get("/trending", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  return c.json({
    success: true,
    data: { rooms: [], total: 0 },
    timestamp: new Date().toISOString(),
  });
});

// Get rooms for event
liveRoomsApp.get("/event/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  return c.json({
    success: true,
    data: { rooms: [] },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// PARLAY BUILDER ROUTES (Feature #7)
// ============================================================================

const parlayBuilderApp = new Hono<Env>();

const addLegSchema = z.object({
  eventId: z.string(),
  betType: z.enum(["moneyline", "spread", "total", "prop", "futures", "live"]),
  selection: z.string(),
  line: z.number().optional(),
});

const createParlaySchema = z.object({
  legs: z.array(addLegSchema).min(2).max(15),
  stake: z.number().positive().optional(),
  isPublic: z.boolean().default(false),
});

const generateCardSchema = z.object({
  template: z.string().optional(),
  colorScheme: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    background: z.string().optional(),
    text: z.string().optional(),
    accent: z.string().optional(),
  }).optional(),
  showStake: z.boolean().default(false),
  customTitle: z.string().optional(),
});

// Create parlay
parlayBuilderApp.post("/", zValidator("json", createParlaySchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const parlayId = `parlay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return c.json({
    success: true,
    data: {
      id: parlayId,
      userId,
      legs: body.legs,
      legCount: body.legs.length,
      combinedOdds: 595,
      potentialPayout: body.stake ? body.stake * 6.95 : 0,
      status: "building",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get parlay
parlayBuilderApp.get("/:parlayId", async (c) => {
  const parlayId = c.req.param("parlayId");

  return c.json({
    success: true,
    data: { id: parlayId },
    timestamp: new Date().toISOString(),
  });
});

// Add leg to parlay
parlayBuilderApp.post("/:parlayId/legs", zValidator("json", addLegSchema), async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      parlayId,
      leg: { id: `leg_${Date.now()}`, ...body },
      updatedOdds: 750,
    },
    timestamp: new Date().toISOString(),
  });
});

// Remove leg
parlayBuilderApp.delete("/:parlayId/legs/:legId", async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");
  const legId = c.req.param("legId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { removed: true },
    timestamp: new Date().toISOString(),
  });
});

// Submit parlay
parlayBuilderApp.post("/:parlayId/submit", async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");
  const body = await c.req.json<{ stake: number; acceptOddsChanges?: boolean }>();

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      parlayId,
      status: "pending",
      stake: body.stake,
      submittedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get cashout value
parlayBuilderApp.get("/:parlayId/cashout", async (c) => {
  const parlayId = c.req.param("parlayId");

  return c.json({
    success: true,
    data: { cashoutValue: 45.50, available: true },
    timestamp: new Date().toISOString(),
  });
});

// Process cashout
parlayBuilderApp.post("/:parlayId/cashout", async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { cashedOut: true, amount: 45.50 },
    timestamp: new Date().toISOString(),
  });
});

// Generate shareable card
parlayBuilderApp.post("/:parlayId/card", zValidator("json", generateCardSchema), async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      cardId: `card_${Date.now()}`,
      imageUrl: `https://pull.app/api/cards/${parlayId}/image`,
      shareUrl: `https://pull.app/p/${parlayId}`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Copy parlay
parlayBuilderApp.post("/:parlayId/copy", async (c) => {
  const userId = c.get("userId");
  const parlayId = c.req.param("parlayId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { newParlayId: `parlay_copy_${Date.now()}` },
    timestamp: new Date().toISOString(),
  });
});

// Get AI suggestions
parlayBuilderApp.get("/suggestions", async (c) => {
  const userId = c.get("userId");
  const category = c.req.query("category");
  const sport = c.req.query("sport");

  return c.json({
    success: true,
    data: { suggestions: [] },
    timestamp: new Date().toISOString(),
  });
});

// Get available boosts
parlayBuilderApp.get("/boosts", async (c) => {
  const userId = c.get("userId");

  return c.json({
    success: true,
    data: { boosts: [] },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// PREDICTION GAMES ROUTES (Feature #8)
// ============================================================================

const predictionGamesApp = new Hono<Env>();

const submitEntrySchema = z.object({
  gameId: z.string(),
  picks: z.array(z.object({
    pickId: z.string(),
    selectedOptionId: z.string(),
    confidence: z.number().optional(),
  })).min(1),
  tiebreakerAnswer: z.union([z.number(), z.string()]).optional(),
});

// List games
predictionGamesApp.get("/", async (c) => {
  const type = c.req.query("type");
  const sport = c.req.query("sport");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  return c.json({
    success: true,
    data: { games: [], total: 0, hasMore: false },
    timestamp: new Date().toISOString(),
  });
});

// Get game details
predictionGamesApp.get("/:gameId", async (c) => {
  const gameId = c.req.param("gameId");

  return c.json({
    success: true,
    data: { id: gameId },
    timestamp: new Date().toISOString(),
  });
});

// Submit entry
predictionGamesApp.post("/entries", zValidator("json", submitEntrySchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const entryId = `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return c.json({
    success: true,
    data: {
      id: entryId,
      gameId: body.gameId,
      userId,
      picks: body.picks,
      submittedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get my entry
predictionGamesApp.get("/:gameId/my-entry", async (c) => {
  const userId = c.get("userId");
  const gameId = c.req.param("gameId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  });
});

// Update picks
predictionGamesApp.patch("/entries/:entryId/picks", async (c) => {
  const userId = c.get("userId");
  const entryId = c.req.param("entryId");
  const body = await c.req.json();

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { updated: true },
    timestamp: new Date().toISOString(),
  });
});

// Get leaderboard
predictionGamesApp.get("/:gameId/leaderboard", async (c) => {
  const gameId = c.req.param("gameId");
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  return c.json({
    success: true,
    data: { entries: [], total: 0, userRank: null },
    timestamp: new Date().toISOString(),
  });
});

// Get streak challenges
predictionGamesApp.get("/streaks", async (c) => {
  return c.json({
    success: true,
    data: { challenges: [] },
    timestamp: new Date().toISOString(),
  });
});

// Submit streak pick
predictionGamesApp.post("/streaks/:challengeId/pick", async (c) => {
  const userId = c.get("userId");
  const challengeId = c.req.param("challengeId");
  const body = await c.req.json<{ pickId: string; selectedOptionId: string }>();

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { submitted: true },
    timestamp: new Date().toISOString(),
  });
});

// Get my streak
predictionGamesApp.get("/streaks/:challengeId/my-streak", async (c) => {
  const userId = c.get("userId");
  const challengeId = c.req.param("challengeId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { currentStreak: 0, longestStreak: 0 },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// SOCIAL FEED ROUTES (Feature #9)
// ============================================================================

const socialFeedApp = new Hono<Env>();

const createPostSchema = z.object({
  type: z.enum(["bet_placed", "bet_won", "bet_lost", "parlay_placed", "parlay_won", "pick_shared", "analysis", "achievement", "streak", "leaderboard", "cashout", "tip_received", "room_hosted", "game_won", "follow", "milestone"]),
  content: z.object({
    text: z.string().optional(),
    betId: z.string().optional(),
    parlayId: z.string().optional(),
    pickId: z.string().optional(),
    reasoning: z.string().optional(),
  }),
  visibility: z.enum(["public", "followers", "private"]).default("public"),
  images: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  commentsEnabled: z.boolean().default(true),
  allowCopy: z.boolean().default(true),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentCommentId: z.string().optional(),
});

const reactSchema = z.object({
  reactionType: z.enum(["like", "fire", "clap", "thinking", "money"]),
});

// Get feed
socialFeedApp.get("/", async (c) => {
  const userId = c.get("userId");
  const feedType = c.req.query("type") ?? "following";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const cursor = c.req.query("cursor");

  return c.json({
    success: true,
    data: { items: [], hasMore: false, cursor: undefined },
    timestamp: new Date().toISOString(),
  });
});

// Get discover feed
socialFeedApp.get("/discover", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  return c.json({
    success: true,
    data: { items: [], hasMore: false },
    timestamp: new Date().toISOString(),
  });
});

// Create post
socialFeedApp.post("/", zValidator("json", createPostSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return c.json({
    success: true,
    data: {
      id: postId,
      authorId: userId,
      ...body,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get post
socialFeedApp.get("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");

  return c.json({
    success: true,
    data: { id: postId },
    timestamp: new Date().toISOString(),
  });
});

// Delete post
socialFeedApp.delete("/posts/:postId", async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { deleted: true },
    timestamp: new Date().toISOString(),
  });
});

// React to post
socialFeedApp.post("/posts/:postId/react", zValidator("json", reactSchema), async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { reacted: true, type: body.reactionType },
    timestamp: new Date().toISOString(),
  });
});

// Get comments
socialFeedApp.get("/posts/:postId/comments", async (c) => {
  const postId = c.req.param("postId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  return c.json({
    success: true,
    data: { comments: [] },
    timestamp: new Date().toISOString(),
  });
});

// Add comment
socialFeedApp.post("/posts/:postId/comments", zValidator("json", createCommentSchema), async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      id: `comment_${Date.now()}`,
      postId,
      authorId: userId,
      ...body,
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Share post
socialFeedApp.post("/posts/:postId/share", async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { shared: true },
    timestamp: new Date().toISOString(),
  });
});

// Copy bet/parlay
socialFeedApp.post("/posts/:postId/copy", async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { copied: true },
    timestamp: new Date().toISOString(),
  });
});

// Follow user
socialFeedApp.post("/follow/:targetUserId", async (c) => {
  const userId = c.get("userId");
  const targetUserId = c.req.param("targetUserId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { following: true },
    timestamp: new Date().toISOString(),
  });
});

// Unfollow user
socialFeedApp.delete("/follow/:targetUserId", async (c) => {
  const userId = c.get("userId");
  const targetUserId = c.req.param("targetUserId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { following: false },
    timestamp: new Date().toISOString(),
  });
});

// Get user profile
socialFeedApp.get("/profiles/:userId", async (c) => {
  const targetUserId = c.req.param("userId");

  return c.json({
    success: true,
    data: { userId: targetUserId },
    timestamp: new Date().toISOString(),
  });
});

// Get follow suggestions
socialFeedApp.get("/suggestions", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  return c.json({
    success: true,
    data: { suggestions: [] },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// INSTANT CASHOUT ROUTES (Feature #10)
// ============================================================================

const instantCashoutApp = new Hono<Env>();

const initiateCashoutSchema = z.object({
  amount: z.number().positive(),
  paymentAccountId: z.string(),
  speedTier: z.enum(["instant", "fast", "standard", "economy"]).optional(),
  currency: z.enum(["usd", "btc", "eth", "usdc"]).default("usd"),
});

const addPaymentAccountSchema = z.object({
  method: z.enum(["bank_transfer", "instant_bank", "debit_card", "paypal", "venmo", "crypto_btc", "crypto_eth", "crypto_usdc", "crypto_usdt", "apple_pay", "cash_app"]),
  details: z.object({
    bankName: z.string().optional(),
    accountType: z.enum(["checking", "savings"]).optional(),
    accountNumberLast4: z.string().optional(),
    routingNumber: z.string().optional(),
    accountHolderName: z.string().optional(),
    cardBrand: z.string().optional(),
    cardLast4: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    username: z.string().optional(),
    walletAddress: z.string().optional(),
    network: z.string().optional(),
  }),
  nickname: z.string().optional(),
  setAsDefault: z.boolean().default(false),
});

// Get available methods
instantCashoutApp.get("/methods", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      methods: [
        { method: "instant_bank", isAvailable: true, estimatedTime: "< 1 minute" },
        { method: "debit_card", isAvailable: true, estimatedTime: "< 1 minute" },
        { method: "paypal", isAvailable: true, estimatedTime: "< 5 minutes" },
        { method: "venmo", isAvailable: true, estimatedTime: "< 5 minutes" },
        { method: "crypto_usdc", isAvailable: true, estimatedTime: "< 5 minutes" },
        { method: "bank_transfer", isAvailable: true, estimatedTime: "1-3 business days" },
      ],
      availableBalance: 0,
      pendingCashouts: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// Get fee quote
instantCashoutApp.get("/quote", async (c) => {
  const userId = c.get("userId");
  const amount = parseFloat(c.req.query("amount") ?? "0");
  const method = c.req.query("method");
  const speedTier = c.req.query("speedTier");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const fee = amount * 0.015 + 1.99;

  return c.json({
    success: true,
    data: {
      amount,
      method,
      speedTier: speedTier ?? "instant",
      fee,
      netAmount: amount - fee,
      estimatedArrival: new Date(Date.now() + 60000).toISOString(),
      validUntil: new Date(Date.now() + 300000).toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Initiate cashout
instantCashoutApp.post("/", zValidator("json", initiateCashoutSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const cashoutId = `cashout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return c.json({
    success: true,
    data: {
      id: cashoutId,
      userId,
      ...body,
      status: "processing",
      estimatedArrival: new Date(Date.now() + 60000).toISOString(),
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Get cashout status
instantCashoutApp.get("/:cashoutId", async (c) => {
  const cashoutId = c.req.param("cashoutId");

  return c.json({
    success: true,
    data: { id: cashoutId, status: "completed" },
    timestamp: new Date().toISOString(),
  });
});

// Cancel cashout
instantCashoutApp.post("/:cashoutId/cancel", async (c) => {
  const userId = c.get("userId");
  const cashoutId = c.req.param("cashoutId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { cancelled: true },
    timestamp: new Date().toISOString(),
  });
});

// Get cashout history
instantCashoutApp.get("/history", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      requests: [],
      total: 0,
      stats: { totalWithdrawn: 0, avgProcessingTime: 45000, successRate: 99.5 },
    },
    timestamp: new Date().toISOString(),
  });
});

// Get payment accounts
instantCashoutApp.get("/accounts", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { accounts: [] },
    timestamp: new Date().toISOString(),
  });
});

// Add payment account
instantCashoutApp.post("/accounts", zValidator("json", addPaymentAccountSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  const body = c.req.valid("json");
  const accountId = `account_${Date.now()}`;

  return c.json({
    success: true,
    data: {
      id: accountId,
      userId,
      ...body,
      isVerified: false,
      status: "pending_verification",
      createdAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// Remove payment account
instantCashoutApp.delete("/accounts/:accountId", async (c) => {
  const userId = c.get("userId");
  const accountId = c.req.param("accountId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: { removed: true },
    timestamp: new Date().toISOString(),
  });
});

// Get VIP tier info
instantCashoutApp.get("/vip", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
  }

  return c.json({
    success: true,
    data: {
      tier: "standard",
      dailyLimit: 5000,
      weeklyLimit: 20000,
      monthlyLimit: 50000,
      feeDiscount: 0,
      freeInstantCashouts: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// MOUNT ALL ROUTES
// ============================================================================

app.route("/live-rooms", liveRoomsApp);
app.route("/parlays", parlayBuilderApp);
app.route("/prediction-games", predictionGamesApp);
app.route("/feed", socialFeedApp);
app.route("/cashout", instantCashoutApp);

export { app as viralFeaturesRoutes };
