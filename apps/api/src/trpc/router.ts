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
});

export type AppRouter = typeof appRouter;
