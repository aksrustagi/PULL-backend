import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Points/Rewards queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get points balance for user
 */
export const getBalance = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "points")
          .eq("assetId", "PULL_POINTS")
      )
      .unique();

    // Get lifetime earned
    const transactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const lifetimeEarned = transactions
      .filter((t) => t.amount > 0 && t.status === "completed")
      .reduce((sum, t) => sum + t.amount, 0);

    const lifetimeRedeemed = transactions
      .filter((t) => t.amount < 0 && t.status === "completed")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Calculate tier
    const tier = getTierForPoints(lifetimeEarned);

    return {
      available: balance?.available ?? 0,
      pending: balance?.pending ?? 0,
      lifetimeEarned,
      lifetimeRedeemed,
      tier,
      nextTier: getNextTier(tier),
      pointsToNextTier: getPointsToNextTier(lifetimeEarned, tier),
    };
  },
});

/**
 * Get points transaction history
 */
export const getTransactions = query({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("pointsTransactions");

    if (args.type) {
      query = query.withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", args.type!)
      );
    } else {
      query = query.withIndex("by_user", (q) => q.eq("userId", args.userId));
    }

    return await query.order("desc").take(args.limit ?? 50);
  },
});

/**
 * Get leaderboard
 */
export const getLeaderboard = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // For simplicity, using all-time balances
    // In production, you'd aggregate by time period
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
    const top = sorted.slice(0, args.limit ?? 100);

    // Enrich with user data
    const leaderboard = await Promise.all(
      top.map(async (balance, index) => {
        const user = await ctx.db.get(balance.userId);
        return {
          rank: index + 1,
          userId: balance.userId,
          username: user?.username ?? user?.displayName ?? "Anonymous",
          avatarUrl: user?.avatarUrl,
          points: balance.available,
          tier: getTierForPoints(balance.available),
        };
      })
    );

    return leaderboard;
  },
});

/**
 * Get available rewards
 */
export const getRewards = query({
  args: {
    category: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("rewards");

    if (args.featured) {
      query = query.withIndex("by_featured", (q) =>
        q.eq("isFeatured", true).eq("isActive", true)
      );
    } else if (args.category) {
      query = query.withIndex("by_category", (q) =>
        q.eq("category", args.category!).eq("isActive", true)
      );
    }

    const rewards = await query.take(args.limit ?? 50);

    // Filter to only active ones if not using index
    return rewards.filter((r) => r.isActive);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Earn points
 */
export const earnPoints = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.string(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new Error("Points amount must be positive");
    }

    const now = Date.now();

    // Get or create balance
    let balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "points")
          .eq("assetId", "PULL_POINTS")
      )
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: balance.available + args.amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("balances", {
        userId: args.userId,
        assetType: "points",
        assetId: "PULL_POINTS",
        symbol: "PTS",
        available: args.amount,
        held: 0,
        pending: 0,
        updatedAt: now,
      });
    }

    const newBalance = (balance?.available ?? 0) + args.amount;

    // Record transaction
    const txId = await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: args.type,
      amount: args.amount,
      balance: newBalance,
      status: "completed",
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      createdAt: now,
      completedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "points.earned",
      resourceType: "pointsTransactions",
      resourceId: txId,
      metadata: { amount: args.amount, type: args.type },
      timestamp: now,
    });

    return { transactionId: txId, newBalance };
  },
});

/**
 * Redeem points for a reward
 */
export const redeemPoints = mutation({
  args: {
    userId: v.id("users"),
    rewardId: v.id("rewards"),
    quantity: v.optional(v.number()),
    shippingAddress: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const quantity = args.quantity ?? 1;

    // Get reward
    const reward = await ctx.db.get(args.rewardId);
    if (!reward) {
      throw new Error("Reward not found");
    }

    if (!reward.isActive) {
      throw new Error("Reward is not available");
    }

    const totalCost = reward.pointsCost * quantity;

    // Check balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "points")
          .eq("assetId", "PULL_POINTS")
      )
      .unique();

    if (!balance || balance.available < totalCost) {
      throw new Error("Insufficient points balance");
    }

    // Check stock if limited
    if (reward.stock !== undefined && reward.stock < quantity) {
      throw new Error("Reward out of stock");
    }

    // Deduct points
    await ctx.db.patch(balance._id, {
      available: balance.available - totalCost,
      updatedAt: now,
    });

    // Update reward stock
    if (reward.stock !== undefined) {
      await ctx.db.patch(args.rewardId, {
        stock: reward.stock - quantity,
      });
    }

    // Create redemption record
    const redemptionId = await ctx.db.insert("redemptions", {
      userId: args.userId,
      rewardId: args.rewardId,
      rewardName: reward.name,
      pointsSpent: totalCost,
      quantity,
      status: "pending",
      fulfillmentType: reward.type,
      shippingAddress: args.shippingAddress,
      redeemedAt: now,
    });

    // Record points transaction
    const newBalance = balance.available - totalCost;
    await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: "redeem_reward",
      amount: -totalCost,
      balance: newBalance,
      status: "completed",
      description: `Redeemed ${quantity}x ${reward.name}`,
      referenceType: "redemptions",
      referenceId: redemptionId,
      createdAt: now,
      completedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "points.redeemed",
      resourceType: "redemptions",
      resourceId: redemptionId,
      metadata: {
        rewardId: args.rewardId,
        rewardName: reward.name,
        quantity,
        totalCost,
      },
      timestamp: now,
    });

    return { redemptionId, pointsSpent: totalCost, newBalance };
  },
});

/**
 * Award referral bonus
 */
export const awardReferralBonus = mutation({
  args: {
    referrerId: v.id("users"),
    referredUserId: v.id("users"),
    bonusAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Award to referrer
    await ctx.runMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).functions.points.earnPoints,
      {
        userId: args.referrerId,
        amount: args.bonusAmount,
        type: "earn_referral",
        description: `Referral bonus for inviting a new user`,
        referenceType: "users",
        referenceId: args.referredUserId,
      }
    );

    // Also give bonus to referred user
    await ctx.runMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).functions.points.earnPoints,
      {
        userId: args.referredUserId,
        amount: Math.floor(args.bonusAmount / 2),
        type: "earn_referral",
        description: `Welcome bonus for joining via referral`,
        referenceType: "users",
        referenceId: args.referrerId,
      }
    );

    await ctx.db.insert("auditLog", {
      userId: args.referrerId,
      action: "points.referral_bonus",
      resourceType: "users",
      resourceId: args.referredUserId,
      metadata: { bonusAmount: args.bonusAmount },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Process daily streak
 */
export const processDailyStreak = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date(now).toDateString();

    // Check last activity
    const recentTx = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", "earn_streak")
      )
      .order("desc")
      .first();

    if (recentTx) {
      const lastDate = new Date(recentTx.createdAt).toDateString();
      if (lastDate === today) {
        return { alreadyClaimed: true };
      }
    }

    // Calculate streak bonus (increases with consecutive days)
    const baseBonus = 10;
    const streakMultiplier = 1; // Would track actual streak in production

    const bonusAmount = baseBonus * streakMultiplier;

    // Award streak points
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q
          .eq("userId", args.userId)
          .eq("assetType", "points")
          .eq("assetId", "PULL_POINTS")
      )
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: balance.available + bonusAmount,
        updatedAt: now,
      });
    }

    const newBalance = (balance?.available ?? 0) + bonusAmount;

    await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: "earn_streak",
      amount: bonusAmount,
      balance: newBalance,
      status: "completed",
      description: `Daily login streak bonus`,
      createdAt: now,
      completedAt: now,
    });

    return { bonusAmount, newBalance, streakDays: streakMultiplier };
  },
});

// ============================================================================
// HELPERS
// ============================================================================

type RewardTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

function getTierForPoints(points: number): RewardTier {
  if (points >= 100000) return "diamond";
  if (points >= 50000) return "platinum";
  if (points >= 25000) return "gold";
  if (points >= 10000) return "silver";
  return "bronze";
}

function getNextTier(current: RewardTier): RewardTier | null {
  const tiers: RewardTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
  const idx = tiers.indexOf(current);
  return idx < tiers.length - 1 ? tiers[idx + 1]! : null;
}

function getPointsToNextTier(currentPoints: number, currentTier: RewardTier): number {
  const thresholds: Record<RewardTier, number> = {
    bronze: 10000,
    silver: 25000,
    gold: 50000,
    platinum: 100000,
    diamond: Infinity,
  };

  const nextRequired = thresholds[currentTier];
  return Math.max(0, nextRequired - currentPoints);
}
