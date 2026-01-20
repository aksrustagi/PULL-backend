import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// Position delay for non-followers (in minutes)
const POSITION_DELAY_MINUTES = 15;

// ============================================================================
// TRADER STATS ENDPOINTS
// ============================================================================

/**
 * Get trader stats
 * GET /traders/:userId/stats
 */
app.get("/:userId/stats", async (c) => {
  const traderId = c.req.param("userId");

  // TODO: Call Convex query - copyTrading.getTraderStats
  // const stats = await convex.query(api.copyTrading.getTraderStats, {
  //   userId: traderId,
  // });

  // Mock response
  return c.json({
    success: true,
    data: {
      userId: traderId,
      totalReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalTrades: 0,
      profitableTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      tradingVolume: 0,
      followerCount: 0,
      copierCount: 0,
      rank: null,
      tier: null,
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trader profile with follow status
 * GET /traders/:userId/profile
 */
app.get("/:userId/profile", async (c) => {
  const currentUserId = c.get("userId");
  const traderId = c.req.param("userId");

  // TODO: Call Convex queries
  // const [user, stats, isFollowing, copySettings] = await Promise.all([
  //   convex.query(api.users.getById, { id: traderId }),
  //   convex.query(api.copyTrading.getTraderStats, { userId: traderId }),
  //   currentUserId
  //     ? convex.query(api.copyTrading.isFollowing, {
  //         followerId: currentUserId,
  //         followedId: traderId,
  //       })
  //     : false,
  //   currentUserId
  //     ? convex.query(api.copyTrading.getCopySettings, {
  //         userId: currentUserId,
  //         traderId,
  //       })
  //     : null,
  // ]);

  return c.json({
    success: true,
    data: {
      user: {
        id: traderId,
        username: null,
        displayName: null,
        avatarUrl: null,
      },
      stats: null,
      isFollowing: false,
      isCopying: false,
      copySettings: null,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trader positions (with delay for non-followers)
 * GET /traders/:userId/positions
 */
app.get("/:userId/positions", async (c) => {
  const currentUserId = c.get("userId");
  const traderId = c.req.param("userId");
  const assetClass = c.req.query("assetClass") as
    | "crypto"
    | "prediction"
    | "rwa"
    | undefined;

  // Check if current user is following the trader
  let isFollowing = false;
  if (currentUserId) {
    // TODO: Call Convex query - copyTrading.isFollowing
    // isFollowing = await convex.query(api.copyTrading.isFollowing, {
    //   followerId: currentUserId,
    //   followedId: traderId,
    // });
  }

  // Determine if positions should be delayed
  const shouldDelay = !isFollowing && currentUserId !== traderId;

  // TODO: Call Convex query to get positions
  // const positions = await convex.query(api.positions.getByUser, {
  //   userId: traderId,
  //   assetClass,
  // });

  // Apply delay for non-followers by filtering out recent positions
  const delayedPositions: Array<{
    symbol: string;
    assetClass: string;
    side: string;
    quantity: number;
    entryPrice?: number;
    currentPrice?: number;
    unrealizedPnL?: number;
    openedAt: string;
    isDelayed: boolean;
    delayMinutes?: number;
  }> = [];

  // If delayed, we would filter positions and hide sensitive data
  // positions.forEach(pos => {
  //   const openedAtTime = new Date(pos.openedAt).getTime();
  //   const delayThreshold = Date.now() - POSITION_DELAY_MINUTES * 60 * 1000;
  //
  //   if (shouldDelay && openedAtTime > delayThreshold) {
  //     // Skip recent positions for non-followers
  //     return;
  //   }
  //
  //   delayedPositions.push({
  //     ...pos,
  //     isDelayed: shouldDelay,
  //     delayMinutes: shouldDelay ? POSITION_DELAY_MINUTES : undefined,
  //     // Optionally hide entry price for non-followers
  //     entryPrice: shouldDelay ? undefined : pos.entryPrice,
  //   });
  // });

  return c.json({
    success: true,
    data: {
      positions: delayedPositions,
      isDelayed: shouldDelay,
      delayMinutes: shouldDelay ? POSITION_DELAY_MINUTES : null,
      message: shouldDelay
        ? `Positions are delayed by ${POSITION_DELAY_MINUTES} minutes for non-followers`
        : null,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get trader's trade history (public view)
 * GET /traders/:userId/trades
 */
app.get("/:userId/trades", async (c) => {
  const traderId = c.req.param("userId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // TODO: Call Convex query to get trades
  // Only show limited public information

  return c.json({
    success: true,
    data: {
      trades: [],
      summary: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        avgHoldingTime: 0,
      },
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

// ============================================================================
// SEARCH ENDPOINTS
// ============================================================================

const searchTradersSchema = z.object({
  minReturn: z.number().optional(),
  minWinRate: z.number().min(0).max(100).optional(),
  minSharpeRatio: z.number().optional(),
  maxDrawdown: z.number().optional(),
  tier: z
    .enum(["bronze", "silver", "gold", "platinum", "diamond"])
    .optional(),
  limit: z.number().min(1).max(100).optional(),
});

/**
 * Search traders by criteria
 * GET /traders/search
 */
app.get("/search", zValidator("query", searchTradersSchema), async (c) => {
  const query = c.req.valid("query");

  // TODO: Call Convex query - copyTrading.searchTraders
  // const traders = await convex.query(api.copyTrading.searchTraders, query);

  return c.json({
    success: true,
    data: {
      traders: [],
      criteria: query,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get top traders (quick leaderboard view)
 * GET /traders/top
 */
app.get("/top", async (c) => {
  const category = c.req.query("category") as
    | "returns"
    | "followers"
    | "winRate"
    | undefined;
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  // Map category to sort field
  const sortBy =
    category === "returns"
      ? "totalReturn"
      : category === "followers"
        ? "followerCount"
        : category === "winRate"
          ? "winRate"
          : "totalReturn";

  // TODO: Call Convex query - copyTrading.getLeaderboard
  // const result = await convex.query(api.copyTrading.getLeaderboard, {
  //   sortBy,
  //   limit,
  //   offset: 0,
  // });

  return c.json({
    success: true,
    data: {
      traders: [],
      category: category ?? "returns",
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// COPIER MANAGEMENT
// ============================================================================

/**
 * Get users copying a trader
 * GET /traders/:userId/copiers
 */
app.get("/:userId/copiers", async (c) => {
  const currentUserId = c.get("userId");
  const traderId = c.req.param("userId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // Only the trader themselves can see their copiers
  if (currentUserId !== traderId) {
    return c.json({
      success: true,
      data: {
        copierCount: 0,
        copiers: [], // Empty for privacy
        isOwner: false,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // TODO: Call Convex query - copyTrading.getCopiers
  // const copiers = await convex.query(api.copyTrading.getCopiers, {
  //   traderId,
  //   limit,
  // });

  return c.json({
    success: true,
    data: {
      copierCount: 0,
      copiers: [],
      isOwner: true,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get copy trades from a trader
 * GET /traders/:userId/copy-trades
 */
app.get("/:userId/copy-trades", async (c) => {
  const currentUserId = c.get("userId");
  const traderId = c.req.param("userId");
  const status = c.req.query("status") as
    | "pending"
    | "executed"
    | "partial"
    | "failed"
    | "cancelled"
    | undefined;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  if (!currentUserId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query - copyTrading.getCopyTrades
  // Users can only see their own copy trades
  // const copyTrades = await convex.query(api.copyTrading.getCopyTrades, {
  //   userId: currentUserId,
  //   status,
  //   limit,
  // });

  // Filter to only show copy trades from this specific trader
  // const filteredTrades = copyTrades.filter(t => t.traderId === traderId);

  return c.json({
    success: true,
    data: {
      copyTrades: [],
      traderId,
    },
    timestamp: new Date().toISOString(),
  });
});

export { app as tradersRoutes };
