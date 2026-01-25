import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const propCategorySchema = z.enum([
  "player_performance",
  "game_events",
  "season_long",
  "custom",
  "meme",
]);

const propStatusSchema = z.enum([
  "pending_moderation",
  "voting",
  "active",
  "locked",
  "resolved",
  "cancelled",
  "rejected",
]);

const createPropSchema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().max(1000).optional(),
  category: propCategorySchema,
  eventId: z.string().optional(),
  outcomes: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    initialOdds: z.number().min(1.01).max(100).optional(),
  })).min(2).max(10),
  closesAt: z.number().positive(),
  resolutionCriteria: z.string().min(10).max(1000),
  tags: z.array(z.string()).max(5).optional(),
});

const placeBetSchema = z.object({
  propId: z.string(),
  outcomeId: z.string(),
  amount: z.number().positive().max(10000),
});

const votePropSchema = z.object({
  propId: z.string(),
  vote: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

const flagPropSchema = z.object({
  propId: z.string(),
  reason: z.enum(["inappropriate", "spam", "duplicate", "unclear", "other"]),
  details: z.string().max(500).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ============================================================================
// GET /props
// Get available user-created props with filtering
// ============================================================================

app.get("/", zValidator("query", paginationSchema.extend({
  category: propCategorySchema.optional(),
  status: propStatusSchema.optional(),
  sport: z.string().optional(),
  creator: z.string().optional(),
  sort: z.enum(["popular", "newest", "closing_soon", "volume"]).default("popular"),
})), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor, category, status, sport, creator, sort } = c.req.valid("query");

  // TODO: Call Convex query props.getProps
  const props = [
    {
      id: "prop_001",
      title: "Will LeBron score 30+ points tonight?",
      description: "LeBron James to score 30 or more points in tonight's game against the Celtics",
      category: "player_performance" as const,
      creatorId: "user_001",
      creatorName: "PropMaster",
      creatorTier: "expert" as const,
      status: "active" as const,
      outcomes: [
        { id: "out_001", name: "Yes", odds: 2.10, totalBets: 45, volume: 4500 },
        { id: "out_002", name: "No", odds: 1.76, totalBets: 62, volume: 5890 },
      ],
      totalVolume: 10390,
      totalBets: 107,
      createdAt: Date.now() - 7200000,
      closesAt: Date.now() + 3600000,
      votes: { approve: 45, reject: 3 },
      featured: true,
      tags: ["nba", "lebron", "scoring"],
    },
    {
      id: "prop_002",
      title: "Total touchdowns in Super Bowl LVIII",
      description: "Over/Under 5.5 total touchdowns scored in Super Bowl LVIII",
      category: "game_events" as const,
      creatorId: "user_002",
      creatorName: "GridironGuru",
      creatorTier: "verified" as const,
      status: "active" as const,
      outcomes: [
        { id: "out_003", name: "Over 5.5", odds: 1.95, totalBets: 128, volume: 15600 },
        { id: "out_004", name: "Under 5.5", odds: 1.91, totalBets: 115, volume: 14200 },
      ],
      totalVolume: 29800,
      totalBets: 243,
      createdAt: Date.now() - 86400000,
      closesAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      votes: { approve: 89, reject: 2 },
      featured: true,
      tags: ["nfl", "super-bowl", "touchdowns"],
    },
    {
      id: "prop_003",
      title: "First coach to get ejected this week?",
      description: "Which NBA coach will be the first to get ejected from a game this week",
      category: "meme" as const,
      creatorId: "user_003",
      creatorName: "MemeKing",
      creatorTier: "creator" as const,
      status: "voting" as const,
      outcomes: [
        { id: "out_005", name: "Steve Kerr", odds: 3.50, totalBets: 0, volume: 0 },
        { id: "out_006", name: "Erik Spoelstra", odds: 5.00, totalBets: 0, volume: 0 },
        { id: "out_007", name: "Doc Rivers", odds: 2.50, totalBets: 0, volume: 0 },
        { id: "out_008", name: "None of them", odds: 1.80, totalBets: 0, volume: 0 },
      ],
      totalVolume: 0,
      totalBets: 0,
      createdAt: Date.now() - 1800000,
      closesAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      votes: { approve: 15, reject: 8 },
      votesNeeded: 25,
      featured: false,
      tags: ["nba", "coaches", "meme"],
    },
  ];

  return c.json({
    success: true,
    data: {
      items: props,
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /props/:propId
// Get specific prop details
// ============================================================================

app.get("/:propId", async (c) => {
  const userId = c.get("userId");
  const propId = c.req.param("propId");

  // TODO: Call Convex query props.getPropById
  const prop = {
    id: propId,
    title: "Will LeBron score 30+ points tonight?",
    description: "LeBron James to score 30 or more points in tonight's game against the Celtics. This prop resolves based on official NBA box score stats.",
    category: "player_performance" as const,
    creatorId: "user_001",
    creatorName: "PropMaster",
    creatorTier: "expert" as const,
    creatorStats: {
      totalProps: 156,
      winRate: 0.67,
      avgResolutionTime: 2.5, // hours
      reputation: 4.8,
    },
    status: "active" as const,
    outcomes: [
      {
        id: "out_001",
        name: "Yes",
        description: "LeBron scores 30 or more points",
        odds: 2.10,
        impliedProbability: 0.476,
        totalBets: 45,
        volume: 4500,
        yourBet: userId ? { amount: 50, potentialPayout: 105 } : null,
      },
      {
        id: "out_002",
        name: "No",
        description: "LeBron scores fewer than 30 points",
        odds: 1.76,
        impliedProbability: 0.568,
        totalBets: 62,
        volume: 5890,
        yourBet: null,
      },
    ],
    totalVolume: 10390,
    totalBets: 107,
    createdAt: Date.now() - 7200000,
    closesAt: Date.now() + 3600000,
    resolutionCriteria: "This prop resolves based on official NBA box score statistics. Points scored in overtime count toward the total.",
    eventDetails: {
      id: "evt_lakers_celtics",
      name: "Lakers @ Celtics",
      sport: "nba",
      startsAt: Date.now() + 4 * 60 * 60 * 1000,
    },
    votes: { approve: 45, reject: 3 },
    comments: [
      {
        id: "cmt_001",
        userId: "user_005",
        username: "BetAnalyst",
        text: "LeBron has scored 30+ in 4 of his last 6 games against Boston",
        createdAt: Date.now() - 1800000,
        likes: 12,
      },
    ],
    tags: ["nba", "lebron", "scoring"],
    featured: true,
  };

  return c.json({
    success: true,
    data: prop,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /props
// Create a new user prop
// ============================================================================

app.post("/", zValidator("json", createPropSchema), async (c) => {
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

  // TODO: Call Convex mutation props.createProp
  const prop = {
    id: `prop_${Date.now()}`,
    ...body,
    creatorId: userId,
    status: "pending_moderation" as const,
    createdAt: Date.now(),
    moderationQueue: {
      position: 5,
      estimatedReviewTime: "30-60 minutes",
    },
    message: "Your prop has been submitted for moderation",
  };

  return c.json({
    success: true,
    data: prop,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /props/:propId/bet
// Place a bet on a prop outcome
// ============================================================================

app.post("/:propId/bet", zValidator("json", z.object({
  outcomeId: z.string(),
  amount: z.number().positive().max(10000),
})), async (c) => {
  const userId = c.get("userId");
  const propId = c.req.param("propId");
  const { outcomeId, amount } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation props.placeBet
  const bet = {
    betId: `bet_${Date.now()}`,
    propId,
    outcomeId,
    amount,
    odds: 2.10,
    potentialPayout: amount * 2.10,
    status: "pending" as const,
    placedAt: Date.now(),
    message: "Bet placed successfully",
  };

  return c.json({
    success: true,
    data: bet,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /props/:propId/vote
// Vote to approve or reject a prop
// ============================================================================

app.post("/:propId/vote", zValidator("json", z.object({
  vote: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const propId = c.req.param("propId");
  const { vote, reason } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation props.vote
  const result = {
    propId,
    vote,
    votes: { approve: vote === "approve" ? 16 : 15, reject: vote === "reject" ? 9 : 8 },
    votesNeeded: 25,
    status: "voting" as const,
    message: "Vote recorded successfully",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /props/:propId/flag
// Flag a prop for moderation
// ============================================================================

app.post("/:propId/flag", zValidator("json", z.object({
  reason: z.enum(["inappropriate", "spam", "duplicate", "unclear", "other"]),
  details: z.string().max(500).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const propId = c.req.param("propId");
  const { reason, details } = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation props.flagProp
  const result = {
    flagId: `flag_${Date.now()}`,
    propId,
    reason,
    status: "pending_review" as const,
    message: "Thank you for your report. Our team will review this prop.",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /props/my/created
// Get props created by the current user
// ============================================================================

app.get("/my/created", zValidator("query", paginationSchema), async (c) => {
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

  // TODO: Call Convex query props.getMyCreatedProps
  const props = [
    {
      id: "prop_my_001",
      title: "First team to score in Lakers vs Celtics",
      status: "resolved" as const,
      totalVolume: 8500,
      totalBets: 85,
      createdAt: Date.now() - 172800000,
      closesAt: Date.now() - 86400000,
      resolvedAt: Date.now() - 82800000,
      winningOutcome: "Lakers",
      creatorEarnings: 85.00, // 1% of volume
    },
    {
      id: "prop_my_002",
      title: "Will there be a triple-double tonight?",
      status: "active" as const,
      totalVolume: 3200,
      totalBets: 42,
      createdAt: Date.now() - 3600000,
      closesAt: Date.now() + 7200000,
      pendingEarnings: 32.00,
    },
  ];

  return c.json({
    success: true,
    data: {
      items: props,
      stats: {
        totalCreated: 15,
        totalVolume: 45000,
        totalEarnings: 450.00,
        avgVotesPerProp: 35,
        approvalRate: 0.87,
      },
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /props/my/bets
// Get user's bets on props
// ============================================================================

app.get("/my/bets", zValidator("query", paginationSchema.extend({
  status: z.enum(["pending", "won", "lost", "cancelled"]).optional(),
})), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor, status } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query props.getMyBets
  const bets = [
    {
      betId: "bet_001",
      propId: "prop_001",
      propTitle: "Will LeBron score 30+ points tonight?",
      outcomeId: "out_001",
      outcomeName: "Yes",
      amount: 50,
      odds: 2.10,
      potentialPayout: 105,
      status: "pending" as const,
      placedAt: Date.now() - 3600000,
    },
    {
      betId: "bet_002",
      propId: "prop_002",
      propTitle: "Total touchdowns in Super Bowl LVIII",
      outcomeId: "out_003",
      outcomeName: "Over 5.5",
      amount: 100,
      odds: 1.95,
      potentialPayout: 195,
      status: "pending" as const,
      placedAt: Date.now() - 86400000,
    },
    {
      betId: "bet_003",
      propId: "prop_old_001",
      propTitle: "First player to score in NBA Finals G1",
      outcomeId: "out_old_002",
      outcomeName: "Jayson Tatum",
      amount: 25,
      odds: 4.50,
      actualPayout: 112.50,
      status: "won" as const,
      placedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      settledAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
    },
  ];

  return c.json({
    success: true,
    data: {
      items: bets,
      stats: {
        totalBets: 45,
        pendingBets: 5,
        totalWagered: 2250,
        totalWon: 1875,
        totalLost: 1125,
        netProfit: 750,
        winRate: 0.625,
      },
      hasMore: false,
      nextCursor: undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /props/creators/leaderboard
// Get top prop creators
// ============================================================================

app.get("/creators/leaderboard", zValidator("query", z.object({
  period: z.enum(["daily", "weekly", "monthly", "alltime"]).default("weekly"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})), async (c) => {
  const { period, limit } = c.req.valid("query");

  // TODO: Call Convex query props.getCreatorLeaderboard
  const leaderboard = [
    {
      rank: 1,
      creatorId: "user_001",
      username: "PropMaster",
      tier: "expert" as const,
      propsCreated: 156,
      totalVolume: 458000,
      totalEarnings: 4580,
      avgApprovalRate: 0.92,
      reputation: 4.9,
    },
    {
      rank: 2,
      creatorId: "user_002",
      username: "GridironGuru",
      tier: "verified" as const,
      propsCreated: 89,
      totalVolume: 312000,
      totalEarnings: 3120,
      avgApprovalRate: 0.88,
      reputation: 4.7,
    },
    {
      rank: 3,
      creatorId: "user_003",
      username: "CourtVision",
      tier: "verified" as const,
      propsCreated: 124,
      totalVolume: 287000,
      totalEarnings: 2870,
      avgApprovalRate: 0.85,
      reputation: 4.6,
    },
  ];

  return c.json({
    success: true,
    data: {
      leaderboard,
      period,
      totalCreators: 1250,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /props/trending
// Get trending props
// ============================================================================

app.get("/trending", async (c) => {
  // TODO: Call Convex query props.getTrending
  const trending = {
    props: [
      {
        id: "prop_001",
        title: "Will LeBron score 30+ points tonight?",
        category: "player_performance",
        volume: 10390,
        bets: 107,
        trend: "+45%",
        closesIn: "3 hours",
      },
      {
        id: "prop_002",
        title: "Total touchdowns in Super Bowl LVIII",
        category: "game_events",
        volume: 29800,
        bets: 243,
        trend: "+120%",
        closesIn: "7 days",
      },
    ],
    categories: [
      { name: "player_performance", count: 45, volume: 125000 },
      { name: "game_events", count: 32, volume: 98000 },
      { name: "meme", count: 28, volume: 45000 },
    ],
    tags: [
      { name: "nba", count: 65 },
      { name: "nfl", count: 48 },
      { name: "lebron", count: 12 },
      { name: "super-bowl", count: 25 },
    ],
  };

  return c.json({
    success: true,
    data: trending,
    timestamp: new Date().toISOString(),
  });
});

export { app as propsRoutes };
