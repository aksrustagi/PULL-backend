import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context";

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
          status: z.enum(["pending", "filled", "cancelled", "partial", "rejected"]).optional(),
          limit: z.number().max(100).default(50),
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
          limit: z.number().max(100).default(50),
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
});

export type AppRouter = typeof appRouter;
