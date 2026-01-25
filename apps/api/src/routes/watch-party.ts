import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const createPartySchema = z.object({
  name: z.string().min(3).max(100),
  eventId: z.string(),
  isPrivate: z.boolean().default(false),
  maxMembers: z.number().int().min(2).max(100).default(50),
  description: z.string().max(500).optional(),
  inviteCode: z.string().optional(),
});

const joinPartySchema = z.object({
  inviteCode: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(500),
  type: z.enum(["text", "reaction", "bet_share", "prediction"]).default("text"),
  replyToId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createGroupBetSchema = z.object({
  betType: z.enum(["spread", "moneyline", "total", "prop"]),
  selection: z.string(),
  odds: z.number().positive(),
  minContribution: z.number().positive().default(5),
  maxContribution: z.number().positive().default(1000),
  targetAmount: z.number().positive(),
  expiresAt: z.number().positive(),
  description: z.string().max(500).optional(),
});

const contributeGroupBetSchema = z.object({
  amount: z.number().positive(),
});

const createPollSchema = z.object({
  question: z.string().min(5).max(200),
  options: z.array(z.string().min(1).max(100)).min(2).max(6),
  expiresInMinutes: z.number().int().min(1).max(60).default(5),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// ============================================================================
// GET /watch-party/active
// Get active watch parties for an event
// ============================================================================

app.get("/active", zValidator("query", z.object({
  eventId: z.string().optional(),
  sport: z.string().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { eventId, sport } = c.req.valid("query");

  // TODO: Call Convex query watchParty.getActiveParties
  const parties = [
    {
      id: "party_001",
      name: "Lakers Nation Watch Party",
      eventId: "evt_lakers_celtics",
      eventName: "Lakers @ Celtics",
      sport: "nba",
      hostId: "user_001",
      hostName: "PurpleAndGold",
      isPrivate: false,
      memberCount: 45,
      maxMembers: 100,
      activeGroupBets: 3,
      chatActivity: "high",
      createdAt: Date.now() - 1800000,
      gameStatus: "live",
      currentScore: { home: 52, away: 48 },
    },
    {
      id: "party_002",
      name: "Chiefs Kingdom",
      eventId: "evt_chiefs_bills",
      eventName: "Chiefs @ Bills",
      sport: "nfl",
      hostId: "user_002",
      hostName: "MahomeMagic",
      isPrivate: false,
      memberCount: 128,
      maxMembers: 200,
      activeGroupBets: 7,
      chatActivity: "very_high",
      createdAt: Date.now() - 3600000,
      gameStatus: "live",
      currentScore: { home: 21, away: 17 },
    },
    {
      id: "party_003",
      name: "VIP High Rollers Only",
      eventId: "evt_warriors_suns",
      eventName: "Warriors @ Suns",
      sport: "nba",
      hostId: "user_003",
      hostName: "DiamondVIP",
      isPrivate: true,
      memberCount: 12,
      maxMembers: 20,
      activeGroupBets: 2,
      chatActivity: "medium",
      createdAt: Date.now() - 900000,
      gameStatus: "pregame",
      startsIn: 1800000, // 30 minutes
    },
  ];

  const filteredParties = eventId
    ? parties.filter((p) => p.eventId === eventId)
    : sport
    ? parties.filter((p) => p.sport === sport)
    : parties;

  return c.json({
    success: true,
    data: {
      items: filteredParties.filter((p) => !p.isPrivate || p.hostId === userId),
      total: filteredParties.length,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party
// Create a new watch party
// ============================================================================

app.post("/", zValidator("json", createPartySchema), async (c) => {
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

  // TODO: Call Convex mutation watchParty.createParty
  const party = {
    id: `party_${Date.now()}`,
    ...body,
    hostId: userId,
    inviteCode: body.inviteCode || `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    memberCount: 1,
    status: "active" as const,
    createdAt: Date.now(),
    inviteLink: `https://pull.bet/party/join/${body.inviteCode || "INV-XXXXXX"}`,
  };

  return c.json({
    success: true,
    data: party,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/:partyId
// Get watch party details
// ============================================================================

app.get("/:partyId", async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");

  // TODO: Call Convex query watchParty.getPartyById
  const party = {
    id: partyId,
    name: "Lakers Nation Watch Party",
    description: "Let's go Lakers! Bet together, win together.",
    eventId: "evt_lakers_celtics",
    eventDetails: {
      name: "Lakers @ Celtics",
      sport: "nba",
      league: "NBA",
      startsAt: Date.now() - 1800000,
      status: "live",
      period: "2nd Quarter",
      timeRemaining: "5:32",
      score: { home: 52, away: 48 },
      homeTeam: { name: "Celtics", abbr: "BOS" },
      awayTeam: { name: "Lakers", abbr: "LAL" },
    },
    hostId: "user_001",
    hostName: "PurpleAndGold",
    isPrivate: false,
    inviteCode: "INV-LAKERS1",
    maxMembers: 100,
    members: [
      { userId: "user_001", username: "PurpleAndGold", role: "host", joinedAt: Date.now() - 3600000, isOnline: true },
      { userId: "user_005", username: "LakeShow24", role: "moderator", joinedAt: Date.now() - 3400000, isOnline: true },
      { userId: "user_006", username: "MambaForever", role: "member", joinedAt: Date.now() - 3200000, isOnline: true },
    ],
    memberCount: 45,
    onlineCount: 38,
    settings: {
      chatEnabled: true,
      groupBetsEnabled: true,
      pollsEnabled: true,
      betSharingEnabled: true,
      slowMode: false,
      slowModeSeconds: 0,
    },
    stats: {
      totalMessages: 542,
      totalGroupBets: 8,
      totalBetVolume: 12500,
      activePollCount: 1,
    },
    isJoined: true,
    userRole: userId === "user_001" ? "host" : "member",
    createdAt: Date.now() - 3600000,
  };

  return c.json({
    success: true,
    data: party,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/join
// Join a watch party
// ============================================================================

app.post("/:partyId/join", zValidator("json", joinPartySchema.optional()), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
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

  // TODO: Call Convex mutation watchParty.joinParty
  const result = {
    partyId,
    status: "joined" as const,
    role: "member" as const,
    joinedAt: Date.now(),
    message: "Welcome to the watch party!",
    syncState: {
      currentTime: Date.now(),
      eventTime: "5:32 2Q",
      score: { home: 52, away: 48 },
    },
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/leave
// Leave a watch party
// ============================================================================

app.post("/:partyId/leave", async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation watchParty.leaveParty
  const result = {
    partyId,
    status: "left" as const,
    message: "You have left the watch party",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/:partyId/messages
// Get chat messages
// ============================================================================

app.get("/:partyId/messages", zValidator("query", paginationSchema), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
  const { limit, cursor } = c.req.valid("query");

  // TODO: Call Convex query watchParty.getMessages
  const messages = [
    {
      id: "msg_001",
      userId: "user_001",
      username: "PurpleAndGold",
      content: "LeBron with the triple-double watch!",
      type: "text" as const,
      createdAt: Date.now() - 60000,
      reactions: [
        { emoji: "fire", count: 5 },
        { emoji: "100", count: 3 },
      ],
    },
    {
      id: "msg_002",
      userId: "user_005",
      username: "LakeShow24",
      content: null,
      type: "bet_share" as const,
      createdAt: Date.now() - 45000,
      metadata: {
        betId: "bet_shared_001",
        selection: "Lakers +5.5",
        odds: 1.91,
        stake: 100,
      },
    },
    {
      id: "msg_003",
      userId: "user_006",
      username: "MambaForever",
      content: "Who's in on the next group bet?",
      type: "text" as const,
      createdAt: Date.now() - 30000,
      reactions: [
        { emoji: "raised_hand", count: 8 },
      ],
      replyTo: null,
    },
    {
      id: "msg_004",
      userId: "user_007",
      username: "ShowtimeFan",
      content: "I'm in! Let's go Lakers ML",
      type: "text" as const,
      createdAt: Date.now() - 15000,
      reactions: [],
      replyTo: { id: "msg_003", username: "MambaForever", preview: "Who's in on the next..." },
    },
  ];

  return c.json({
    success: true,
    data: {
      items: messages,
      hasMore: true,
      nextCursor: "msg_000",
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/messages
// Send a chat message
// ============================================================================

app.post("/:partyId/messages", zValidator("json", sendMessageSchema), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
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

  // TODO: Call Convex mutation watchParty.sendMessage
  const message = {
    id: `msg_${Date.now()}`,
    partyId,
    userId,
    username: "YourUsername",
    content: body.content,
    type: body.type,
    createdAt: Date.now(),
    reactions: [],
    replyTo: body.replyToId ? { id: body.replyToId } : null,
  };

  return c.json({
    success: true,
    data: message,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/:partyId/group-bets
// Get active group bets in a party
// ============================================================================

app.get("/:partyId/group-bets", async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");

  // TODO: Call Convex query watchParty.getGroupBets
  const groupBets = [
    {
      id: "gb_001",
      creatorId: "user_001",
      creatorName: "PurpleAndGold",
      betType: "spread" as const,
      selection: "Lakers +5.5",
      odds: 1.91,
      targetAmount: 500,
      currentAmount: 350,
      minContribution: 10,
      maxContribution: 100,
      contributors: [
        { userId: "user_001", username: "PurpleAndGold", amount: 100, contributedAt: Date.now() - 600000 },
        { userId: "user_005", username: "LakeShow24", amount: 100, contributedAt: Date.now() - 500000 },
        { userId: "user_006", username: "MambaForever", amount: 50, contributedAt: Date.now() - 400000 },
        { userId: "user_007", username: "ShowtimeFan", amount: 100, contributedAt: Date.now() - 300000 },
      ],
      status: "open" as const,
      expiresAt: Date.now() + 600000, // 10 minutes
      potentialPayout: 668.50,
      yourContribution: userId ? 100 : null,
    },
    {
      id: "gb_002",
      creatorId: "user_005",
      creatorName: "LakeShow24",
      betType: "total" as const,
      selection: "Over 220.5",
      odds: 1.95,
      targetAmount: 300,
      currentAmount: 300,
      minContribution: 5,
      maxContribution: 50,
      contributors: [],
      status: "locked" as const,
      lockedAt: Date.now() - 1200000,
      potentialPayout: 585,
      yourContribution: 25,
    },
  ];

  return c.json({
    success: true,
    data: groupBets,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/group-bets
// Create a group bet
// ============================================================================

app.post("/:partyId/group-bets", zValidator("json", createGroupBetSchema), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
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

  // TODO: Call Convex mutation watchParty.createGroupBet
  const groupBet = {
    id: `gb_${Date.now()}`,
    partyId,
    creatorId: userId,
    ...body,
    currentAmount: 0,
    contributors: [],
    status: "open" as const,
    createdAt: Date.now(),
    potentialPayout: body.targetAmount * body.odds,
  };

  return c.json({
    success: true,
    data: groupBet,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/group-bets/:betId/contribute
// Contribute to a group bet
// ============================================================================

app.post("/:partyId/group-bets/:betId/contribute", zValidator("json", contributeGroupBetSchema), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
  const betId = c.req.param("betId");
  const { amount } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation watchParty.contributeToGroupBet
  const result = {
    betId,
    contributionId: `contrib_${Date.now()}`,
    amount,
    newTotal: 400,
    targetAmount: 500,
    percentFilled: 80,
    yourTotalContribution: amount,
    potentialPayout: amount * 1.91,
    message: "Contribution added successfully",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/:partyId/polls
// Get active polls
// ============================================================================

app.get("/:partyId/polls", async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");

  // TODO: Call Convex query watchParty.getPolls
  const polls = [
    {
      id: "poll_001",
      creatorId: "user_001",
      creatorName: "PurpleAndGold",
      question: "Who scores the next basket?",
      options: [
        { id: "opt_001", text: "LeBron", votes: 15 },
        { id: "opt_002", text: "AD", votes: 12 },
        { id: "opt_003", text: "Tatum", votes: 8 },
        { id: "opt_004", text: "Brown", votes: 5 },
      ],
      totalVotes: 40,
      status: "active" as const,
      expiresAt: Date.now() + 120000, // 2 minutes
      createdAt: Date.now() - 180000,
      yourVote: "opt_001",
    },
  ];

  return c.json({
    success: true,
    data: polls,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/polls
// Create a poll
// ============================================================================

app.post("/:partyId/polls", zValidator("json", createPollSchema), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
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

  // TODO: Call Convex mutation watchParty.createPoll
  const poll = {
    id: `poll_${Date.now()}`,
    partyId,
    creatorId: userId,
    question: body.question,
    options: body.options.map((text, i) => ({ id: `opt_${i}`, text, votes: 0 })),
    totalVotes: 0,
    status: "active" as const,
    expiresAt: Date.now() + body.expiresInMinutes * 60 * 1000,
    createdAt: Date.now(),
  };

  return c.json({
    success: true,
    data: poll,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /watch-party/:partyId/polls/:pollId/vote
// Vote on a poll
// ============================================================================

app.post("/:partyId/polls/:pollId/vote", zValidator("json", z.object({
  optionId: z.string(),
})), async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");
  const pollId = c.req.param("pollId");
  const { optionId } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation watchParty.voteOnPoll
  const result = {
    pollId,
    optionId,
    totalVotes: 41,
    options: [
      { id: "opt_001", text: "LeBron", votes: 16 },
      { id: "opt_002", text: "AD", votes: 12 },
      { id: "opt_003", text: "Tatum", votes: 8 },
      { id: "opt_004", text: "Brown", votes: 5 },
    ],
    message: "Vote recorded",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/:partyId/sync
// Get current game sync state
// ============================================================================

app.get("/:partyId/sync", async (c) => {
  const userId = c.get("userId");
  const partyId = c.req.param("partyId");

  // TODO: Call Convex query watchParty.getSyncState
  const syncState = {
    partyId,
    eventId: "evt_lakers_celtics",
    gameStatus: "live" as const,
    period: "2nd Quarter",
    timeRemaining: "5:32",
    score: {
      home: { team: "Celtics", abbr: "BOS", score: 52, logo: "celtics_logo.png" },
      away: { team: "Lakers", abbr: "LAL", score: 48, logo: "lakers_logo.png" },
    },
    stats: {
      leaders: {
        points: { player: "LeBron James", team: "LAL", value: 22 },
        rebounds: { player: "Anthony Davis", team: "LAL", value: 8 },
        assists: { player: "Jaylen Brown", team: "BOS", value: 6 },
      },
    },
    recentPlays: [
      { time: "5:45", description: "LeBron James makes 3-pointer", score: "52-48" },
      { time: "6:02", description: "Jayson Tatum misses layup", score: "52-45" },
      { time: "6:15", description: "Anthony Davis dunks", score: "52-45" },
    ],
    liveBettingOdds: {
      spread: { home: -4.5, away: 4.5, homeOdds: 1.91, awayOdds: 1.91 },
      total: { line: 220.5, overOdds: 1.95, underOdds: 1.87 },
      moneyline: { homeOdds: 1.55, awayOdds: 2.50 },
    },
    syncHealth: 0.98,
    lastUpdated: Date.now(),
  };

  return c.json({
    success: true,
    data: syncState,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /watch-party/my
// Get user's parties (hosting and joined)
// ============================================================================

app.get("/my", zValidator("query", paginationSchema), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query watchParty.getMyParties
  const parties = {
    hosting: [
      {
        id: "party_001",
        name: "Lakers Nation Watch Party",
        eventName: "Lakers @ Celtics",
        memberCount: 45,
        status: "active" as const,
        createdAt: Date.now() - 3600000,
      },
    ],
    joined: [
      {
        id: "party_002",
        name: "Chiefs Kingdom",
        eventName: "Chiefs @ Bills",
        memberCount: 128,
        status: "active" as const,
        joinedAt: Date.now() - 7200000,
      },
    ],
    stats: {
      totalHosted: 12,
      totalJoined: 35,
      totalGroupBetsParticipated: 45,
      totalGroupBetWinnings: 1250,
    },
  };

  return c.json({
    success: true,
    data: parties,
    timestamp: new Date().toISOString(),
  });
});

export { app as watchPartyRoutes };
