import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get points balance
export const getBalance = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    // Get lifetime stats from transactions
    const transactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const lifetimeEarned = transactions
      .filter(t => t.amount > 0 && t.status === "completed")
      .reduce((sum, t) => sum + t.amount, 0);

    const lifetimeRedeemed = transactions
      .filter(t => t.amount < 0 && t.status === "completed")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const pending = transactions
      .filter(t => t.status === "pending")
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate tier
    const tier = calculateTier(lifetimeEarned);
    const nextTier = getNextTier(tier);
    const pointsToNextTier = getPointsToNextTier(tier, lifetimeEarned);

    return {
      available: balance?.available ?? 0,
      pending,
      lifetimeEarned,
      lifetimeRedeemed,
      tier,
      nextTier,
      pointsToNextTier,
    };
  },
});

// Get points history
export const getHistory = query({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let transactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    if (args.type) {
      transactions = transactions.filter(t => t.type === args.type);
    }

    const total = transactions.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    return {
      transactions: transactions.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  },
});

// Get rewards catalog
export const getCatalog = query({
  args: {
    category: v.optional(v.string()),
    featured: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let rewards = await ctx.db
      .query("rewards")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter by validity
    rewards = rewards.filter(r =>
      r.validFrom <= now && (!r.validUntil || r.validUntil > now)
    );

    if (args.category) {
      rewards = rewards.filter(r => r.category === args.category);
    }

    if (args.featured) {
      rewards = rewards.filter(r => r.isFeatured);
    }

    return rewards;
  },
});

// Redeem reward
export const redeem = mutation({
  args: {
    userId: v.id("users"),
    rewardId: v.id("rewards"),
    quantity: v.number(),
    shippingAddress: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const reward = await ctx.db.get(args.rewardId);
    if (!reward) throw new Error("Reward not found");
    if (!reward.isActive) throw new Error("Reward is not active");

    const totalCost = reward.pointsCost * args.quantity;

    // Get balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    if (!balance || balance.available < totalCost) {
      throw new Error("Insufficient points");
    }

    // Check stock if applicable
    if (reward.stock !== undefined && reward.stock < args.quantity) {
      throw new Error("Reward out of stock");
    }

    // Deduct points
    await ctx.db.patch(balance._id, {
      available: balance.available - totalCost,
      updatedAt: now,
    });

    // Record transaction
    await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: "redemption",
      amount: -totalCost,
      balance: balance.available - totalCost,
      status: "completed",
      description: `Redeemed ${reward.name} x${args.quantity}`,
      referenceType: "rewards",
      referenceId: args.rewardId,
      createdAt: now,
      completedAt: now,
    });

    // Create redemption record
    const redemptionId = await ctx.db.insert("redemptions", {
      userId: args.userId,
      rewardId: args.rewardId,
      rewardName: reward.name,
      pointsSpent: totalCost,
      quantity: args.quantity,
      status: "pending",
      fulfillmentType: reward.type,
      shippingAddress: args.shippingAddress,
      redeemedAt: now,
    });

    // Update stock if applicable
    if (reward.stock !== undefined) {
      await ctx.db.patch(args.rewardId, {
        stock: reward.stock - args.quantity,
      });
    }

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "reward.redeemed",
      resourceType: "redemptions",
      resourceId: redemptionId,
      metadata: { rewardId: args.rewardId, quantity: args.quantity, totalCost },
      timestamp: now,
    });

    return { redemptionId, status: "pending" };
  },
});

// Get leaderboard
export const getLeaderboard = query({
  args: {
    period: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get all users with their points
    const balances = await ctx.db
      .query("balances")
      .filter((q) =>
        q.and(
          q.eq(q.field("assetType"), "points"),
          q.eq(q.field("assetId"), "PULL_POINTS")
        )
      )
      .collect();

    // Sort by available points
    const sorted = balances.sort((a, b) => b.available - a.available);

    // Get user info for top entries
    const limit = args.limit ?? 100;
    const entries = await Promise.all(
      sorted.slice(0, limit).map(async (b, index) => {
        const user = await ctx.db.get(b.userId);
        return {
          rank: index + 1,
          userId: b.userId,
          displayName: user?.displayName ?? "Anonymous",
          avatarUrl: user?.avatarUrl,
          points: b.available,
        };
      })
    );

    return entries;
  },
});

// Claim daily streak
export const claimDailyStreak = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date(now).toDateString();

    // Check if already claimed today
    const recentClaims = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", "daily_streak")
      )
      .order("desc")
      .take(1);

    if (recentClaims.length > 0) {
      const lastClaimDate = new Date(recentClaims[0].createdAt).toDateString();
      if (lastClaimDate === today) {
        throw new Error("Already claimed today");
      }
    }

    // Calculate streak
    let streakDays = 1;
    if (recentClaims.length > 0) {
      const yesterday = new Date(now - 86400000).toDateString();
      const lastClaimDate = new Date(recentClaims[0].createdAt).toDateString();
      if (lastClaimDate === yesterday) {
        // Continuing streak - extract from description or calculate
        const match = recentClaims[0].description.match(/Day (\d+)/);
        streakDays = match ? parseInt(match[1]) + 1 : 1;
      }
    }

    // Calculate bonus (increases with streak, capped at 100)
    const bonusAmount = Math.min(10 + Math.floor(streakDays / 7) * 5, 100);

    // Get current balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    const newBalance = (balance?.available ?? 0) + bonusAmount;

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: newBalance,
        updatedAt: now,
      });
    }

    // Record transaction
    await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: "daily_streak",
      amount: bonusAmount,
      balance: newBalance,
      status: "completed",
      description: `Daily streak bonus - Day ${streakDays}`,
      createdAt: now,
      completedAt: now,
    });

    return { bonusAmount, streakDays };
  },
});

// Helper functions
function calculateTier(lifetimePoints: number): string {
  if (lifetimePoints >= 100000) return "platinum";
  if (lifetimePoints >= 50000) return "gold";
  if (lifetimePoints >= 10000) return "silver";
  return "bronze";
}

function getNextTier(currentTier: string): string | null {
  const tiers = ["bronze", "silver", "gold", "platinum"];
  const index = tiers.indexOf(currentTier);
  return index < tiers.length - 1 ? tiers[index + 1] : null;
}

function getPointsToNextTier(currentTier: string, lifetimePoints: number): number {
  const thresholds: Record<string, number> = {
    bronze: 10000,
    silver: 50000,
    gold: 100000,
    platinum: 0,
  };
  const nextThreshold = thresholds[currentTier] ?? 0;
  return Math.max(0, nextThreshold - lifetimePoints);
}
