import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context";
import { convex, api } from "../lib/convex";

// Type helper for Convex IDs - these are strings that reference documents
// When Convex codegen is run, proper Id<TableName> types will be available
type ConvexId<T extends string> = string & { __tableName: T };

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
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
      try {
        const user = await convex.query(api.users.getById, {
          id: ctx.userId as ConvexId<"users">,
        });

        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        return user;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch user",
          cause: error,
        });
      }
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          displayName: z.string().optional(),
          avatarUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await convex.mutation(api.users.update, {
            id: ctx.userId as ConvexId<"users">,
            displayName: input.displayName,
            avatarUrl: input.avatarUrl,
          });

          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update profile",
            cause: error,
          });
        }
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
          assetClass: z.enum(["crypto", "prediction", "rwa"]).default("crypto"),
          timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("gtc"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // Validate limit orders have price
          if (input.type === "limit" && !input.price) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Limit orders require a price",
            });
          }

          const orderId = await convex.mutation(api.orders.create, {
            userId: ctx.userId as ConvexId<"users">,
            symbol: input.symbol,
            side: input.side,
            type: input.type,
            quantity: input.quantity,
            price: input.price,
            assetClass: input.assetClass,
            timeInForce: input.timeInForce,
          });

          return { orderId, status: "pending" };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          const message = error instanceof Error ? error.message : "Failed to create order";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message,
            cause: error,
          });
        }
      }),

    getOrders: protectedProcedure
      .input(
        z.object({
          status: z.enum(["pending", "filled", "cancelled", "partial", "rejected"]).optional(),
          limit: z.number().max(100).default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        try {
          const orders = await convex.query(api.orders.getByUser, {
            userId: ctx.userId as ConvexId<"users">,
            limit: input.limit,
          });

          // Filter by status if provided
          const filteredOrders = input.status
            ? orders.filter((order) => order.status === input.status)
            : orders;

          return {
            orders: filteredOrders,
            total: filteredOrders.length,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch orders",
            cause: error,
          });
        }
      }),

    getPortfolio: protectedProcedure.query(async ({ ctx }) => {
      try {
        const portfolio = await convex.query(api.positions.getPortfolioPositions, {
          userId: ctx.userId as ConvexId<"users">,
        });

        return portfolio;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch portfolio",
          cause: error,
        });
      }
    }),
  }),

  // Predictions procedures
  predictions: router({
    getEvents: publicProcedure
      .input(
        z.object({
          status: z.string().optional(),
          category: z.string().optional(),
          limit: z.number().max(100).default(50),
        })
      )
      .query(async ({ input }) => {
        try {
          const events = await convex.query(api.predictions.getEvents, {
            status: input.status,
            category: input.category,
            limit: input.limit,
          });

          return {
            events,
            total: events.length,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch prediction events",
            cause: error,
          });
        }
      }),

    getEvent: publicProcedure
      .input(z.object({ ticker: z.string() }))
      .query(async ({ input }) => {
        try {
          const event = await convex.query(api.predictions.getEventByTicker, {
            ticker: input.ticker,
          });

          return event;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch prediction event",
            cause: error,
          });
        }
      }),
  }),

  // Rewards procedures
  rewards: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      try {
        const balance = await convex.query(api.rewards.getBalance, {
          userId: ctx.userId as ConvexId<"users">,
        });

        return balance;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch rewards balance",
          cause: error,
        });
      }
    }),

    redeem: protectedProcedure
      .input(
        z.object({
          rewardId: z.string(),
          quantity: z.number().default(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await convex.mutation(api.rewards.redeem, {
            userId: ctx.userId as ConvexId<"users">,
            rewardId: input.rewardId as ConvexId<"rewards">,
            quantity: input.quantity,
          });

          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to redeem reward";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message,
            cause: error,
          });
        }
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
