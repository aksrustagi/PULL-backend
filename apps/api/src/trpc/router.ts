import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error("Unauthorized");
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const appRouter = router({
  // Health check
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  // User procedures
  user: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      // TODO: Fetch user from Convex
      return { id: ctx.userId, email: "user@example.com" };
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          displayName: z.string().optional(),
          avatarUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Update via Convex
        return { success: true };
      }),
  }),

  // Trading procedures
  trading: router({
    createOrder: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          side: z.enum(["buy", "sell"]),
          type: z.enum(["market", "limit"]),
          quantity: z.number().positive(),
          price: z.number().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Create order via Convex + Temporal
        return { orderId: crypto.randomUUID(), status: "pending" };
      }),

    getOrders: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          limit: z.number().default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from Convex
        return { orders: [], total: 0 };
      }),

    getPortfolio: protectedProcedure.query(async ({ ctx }) => {
      // TODO: Fetch from Convex
      return { positions: [], summary: {} };
    }),
  }),

  // Predictions procedures
  predictions: router({
    getEvents: publicProcedure
      .input(
        z.object({
          status: z.string().optional(),
          category: z.string().optional(),
          limit: z.number().default(50),
        })
      )
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return { events: [], total: 0 };
      }),

    getEvent: publicProcedure
      .input(z.object({ ticker: z.string() }))
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return null;
      }),
  }),

  // Rewards procedures
  rewards: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      // TODO: Fetch from Convex
      return { available: 0, tier: "bronze" };
    }),

    redeem: protectedProcedure
      .input(
        z.object({
          rewardId: z.string(),
          quantity: z.number().default(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Process via Convex
        return { redemptionId: crypto.randomUUID() };
      }),
  }),

  // Social Trading procedures
  social: router({
    // Follow/Unfollow
    follow: protectedProcedure
      .input(
        z.object({
          traderId: z.string(),
          notificationsEnabled: z.boolean().default(true),
          positionVisibility: z.enum(["all", "entry_only", "none"]).default("all"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Implement with SocialGraphService
        return { followerId: ctx.userId, followeeId: input.traderId, isActive: true };
      }),

    unfollow: protectedProcedure
      .input(z.object({ traderId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Implement with SocialGraphService
        return { unfollowed: true };
      }),

    isFollowing: protectedProcedure
      .input(z.object({ traderId: z.string() }))
      .query(async ({ ctx, input }) => {
        // TODO: Implement with SocialGraphService
        return { isFollowing: false };
      }),

    getFollowers: protectedProcedure
      .input(
        z.object({
          userId: z.string().optional(),
          limit: z.number().default(50),
          cursor: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from Convex
        return { followers: [], cursor: undefined };
      }),

    getFollowing: protectedProcedure
      .input(
        z.object({
          userId: z.string().optional(),
          limit: z.number().default(50),
          cursor: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from Convex
        return { following: [], cursor: undefined };
      }),

    // Trader Profiles
    getTraderProfile: publicProcedure
      .input(z.object({ traderId: z.string() }))
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return null;
      }),

    updateMyProfile: protectedProcedure
      .input(
        z.object({
          isPublic: z.boolean().optional(),
          allowCopyTrading: z.boolean().optional(),
          allowAutoCopy: z.boolean().optional(),
          bio: z.string().max(500).optional(),
          tradingStyle: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Update via Convex
        return { updated: true };
      }),

    getTraderStats: publicProcedure
      .input(
        z.object({
          traderId: z.string(),
          period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "all_time"]).default("all_time"),
        })
      )
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return null;
      }),

    getReputation: publicProcedure
      .input(z.object({ traderId: z.string() }))
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return null;
      }),

    searchTraders: publicProcedure
      .input(
        z.object({
          query: z.string().optional(),
          minWinRate: z.number().optional(),
          minSharpeRatio: z.number().optional(),
          limit: z.number().default(20),
        })
      )
      .query(async ({ input }) => {
        // TODO: Search via Convex
        return { traders: [] };
      }),

    getRecommendedTraders: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        // TODO: Get recommendations
        return { recommendations: [] };
      }),

    // Copy Trading
    createCopySubscription: protectedProcedure
      .input(
        z.object({
          traderId: z.string(),
          copyMode: z.enum(["fixed_amount", "percentage_portfolio", "proportional", "fixed_ratio"]),
          fixedAmount: z.number().optional(),
          portfolioPercentage: z.number().optional(),
          copyRatio: z.number().optional(),
          maxPositionSize: z.number(),
          maxDailyLoss: z.number(),
          maxTotalExposure: z.number(),
          copyAssetClasses: z.array(z.enum(["crypto", "prediction", "rwa"])),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Create via CopyTradingService
        return { subscriptionId: crypto.randomUUID(), status: "active" };
      }),

    getCopySubscriptions: protectedProcedure
      .input(
        z.object({
          status: z.array(z.string()).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from Convex
        return { subscriptions: [] };
      }),

    pauseCopySubscription: protectedProcedure
      .input(z.object({ subscriptionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Pause via CopyTradingService
        return { status: "paused" };
      }),

    resumeCopySubscription: protectedProcedure
      .input(z.object({ subscriptionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Resume via CopyTradingService
        return { status: "active" };
      }),

    cancelCopySubscription: protectedProcedure
      .input(z.object({ subscriptionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Cancel via CopyTradingService
        return { status: "cancelled" };
      }),

    // Leaderboards
    getLeaderboard: publicProcedure
      .input(
        z.object({
          type: z.enum(["pnl", "pnl_percent", "sharpe_ratio", "win_rate", "total_trades", "followers", "copiers", "reputation"]),
          period: z.enum(["daily", "weekly", "monthly", "all_time"]),
          limit: z.number().default(100),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        // TODO: Fetch from LeaderboardService
        return { entries: [], totalParticipants: 0 };
      }),

    getMyLeaderboardRank: protectedProcedure
      .input(
        z.object({
          type: z.enum(["pnl", "pnl_percent", "sharpe_ratio", "win_rate", "total_trades", "followers", "copiers", "reputation"]),
          period: z.enum(["daily", "weekly", "monthly", "all_time"]),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Get rank from LeaderboardService
        return null;
      }),

    // Activity Feed
    getFeed: protectedProcedure
      .input(
        z.object({
          feedType: z.enum(["following", "discover", "notifications"]).default("following"),
          limit: z.number().default(20),
          cursor: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from SocialGraphService
        return { items: [], cursor: undefined, hasMore: false };
      }),

    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
      // TODO: Get count from Convex
      return { count: 0 };
    }),

    markNotificationsRead: protectedProcedure
      .input(
        z.object({
          itemIds: z.array(z.string()).optional(),
          all: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Mark via SocialGraphService
        return { marked: true };
      }),

    // Trading Rooms
    createRoom: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().max(500).optional(),
          type: z.enum(["public", "private", "premium", "exclusive"]),
          accessLevel: z.enum(["open", "request_to_join", "invite_only", "subscription"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Create via TradingRoomService
        return { roomId: crypto.randomUUID() };
      }),

    getRoom: publicProcedure
      .input(z.object({ roomId: z.string() }))
      .query(async ({ input }) => {
        // TODO: Fetch from Convex
        return null;
      }),

    joinRoom: protectedProcedure
      .input(z.object({ roomId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Join via TradingRoomService
        return { joined: true };
      }),

    leaveRoom: protectedProcedure
      .input(z.object({ roomId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Leave via TradingRoomService
        return { left: true };
      }),

    getRoomMessages: protectedProcedure
      .input(
        z.object({
          roomId: z.string(),
          limit: z.number().default(50),
          cursor: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // TODO: Fetch from Convex
        return { messages: [], cursor: undefined };
      }),

    sendRoomMessage: protectedProcedure
      .input(
        z.object({
          roomId: z.string(),
          type: z.enum(["text", "position_share", "trade_share", "analysis"]),
          content: z.string().min(1).max(4000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Send via TradingRoomService
        return { messageId: crypto.randomUUID() };
      }),

    // Comments
    addComment: protectedProcedure
      .input(
        z.object({
          positionId: z.string().optional(),
          orderId: z.string().optional(),
          content: z.string().min(1).max(2000),
          contentType: z.enum(["text", "analysis", "thesis", "update", "exit_rationale"]).default("text"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Create comment
        return { commentId: crypto.randomUUID() };
      }),

    getComments: publicProcedure
      .input(
        z.object({
          positionId: z.string().optional(),
          orderId: z.string().optional(),
          limit: z.number().default(50),
        })
      )
      .query(async ({ input }) => {
        // TODO: Fetch comments
        return { comments: [] };
      }),

    likeComment: protectedProcedure
      .input(z.object({ commentId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Like comment
        return { liked: true };
      }),

    unlikeComment: protectedProcedure
      .input(z.object({ commentId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: Unlike comment
        return { unliked: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
