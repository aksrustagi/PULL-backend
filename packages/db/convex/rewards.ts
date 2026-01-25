import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, authenticatedMutation, systemMutation } from "./lib/auth";

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

// ============================================================================
// AUTHENTICATED MUTATIONS
// ============================================================================

/**
 * Earn points - authenticated user earns points for activity
 */
export const earnPoints = authenticatedMutation({
  args: {
    type: v.union(
      v.literal("trade"),
      v.literal("referral"),
      v.literal("signup"),
      v.literal("daily_login"),
      v.literal("daily_streak"),
      v.literal("deposit"),
      v.literal("achievement"),
      v.literal("promo"),
      v.literal("other")
    ),
    amount: v.number(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Points amount must be positive");
    }

    // Get current balance
    let balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    const newBalance = (balance?.available ?? 0) + args.amount;

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: newBalance,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("balances", {
        userId,
        assetType: "points",
        assetId: "PULL_POINTS",
        symbol: "PTS",
        available: args.amount,
        held: 0,
        pending: 0,
        updatedAt: now,
      });
    }

    // Record transaction
    const transactionId = await ctx.db.insert("pointsTransactions", {
      userId,
      type: args.type,
      amount: args.amount,
      balance: newBalance,
      status: "completed",
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
      createdAt: now,
      completedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "points.earned",
      resourceType: "pointsTransactions",
      resourceId: transactionId,
      metadata: {
        type: args.type,
        amount: args.amount,
        newBalance,
        description: args.description,
      },
      timestamp: now,
    });

    return {
      transactionId,
      pointsEarned: args.amount,
      newBalance,
      tier: calculateTier(newBalance),
    };
  },
});

/**
 * Spend points - authenticated user spends points
 */
export const spendPoints = authenticatedMutation({
  args: {
    type: v.union(
      v.literal("redemption"),
      v.literal("boost"),
      v.literal("premium_feature"),
      v.literal("transfer"),
      v.literal("other")
    ),
    amount: v.number(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const now = Date.now();

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Points amount must be positive");
    }

    // Get current balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    if (!balance || balance.available < args.amount) {
      throw new Error(
        `Insufficient points. Available: ${balance?.available ?? 0}, Required: ${args.amount}`
      );
    }

    const newBalance = balance.available - args.amount;

    await ctx.db.patch(balance._id, {
      available: newBalance,
      updatedAt: now,
    });

    // Record transaction (negative amount for spend)
    const transactionId = await ctx.db.insert("pointsTransactions", {
      userId,
      type: args.type,
      amount: -args.amount,
      balance: newBalance,
      status: "completed",
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
      createdAt: now,
      completedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "points.spent",
      resourceType: "pointsTransactions",
      resourceId: transactionId,
      metadata: {
        type: args.type,
        amount: args.amount,
        newBalance,
        description: args.description,
      },
      timestamp: now,
    });

    return {
      transactionId,
      pointsSpent: args.amount,
      newBalance,
      tier: calculateTier(newBalance),
    };
  },
});

/**
 * Get authenticated user's points balance with tier info
 */
export const getMyBalance = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const userId = ctx.userId as Id<"users">;

    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    // Get lifetime stats from transactions
    const transactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
      tierProgress: nextTier ? (lifetimeEarned / (lifetimeEarned + pointsToNextTier)) * 100 : 100,
    };
  },
});

/**
 * Get authenticated user's points history
 */
export const getMyHistory = authenticatedQuery({
  args: {
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;

    let transactions = await ctx.db
      .query("pointsTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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

/**
 * Award points to user - system only (for automated rewards)
 */
export const awardPoints = systemMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("trade"),
      v.literal("referral"),
      v.literal("signup"),
      v.literal("daily_login"),
      v.literal("daily_streak"),
      v.literal("deposit"),
      v.literal("achievement"),
      v.literal("promo"),
      v.literal("admin_adjustment"),
      v.literal("other")
    ),
    amount: v.number(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate amount (can be negative for admin adjustments)
    if (args.amount === 0) {
      throw new Error("Points amount cannot be zero");
    }

    // Get current balance
    let balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    const currentBalance = balance?.available ?? 0;
    const newBalance = currentBalance + args.amount;

    // Prevent negative balance
    if (newBalance < 0) {
      throw new Error(
        `Operation would result in negative balance. Current: ${currentBalance}, Adjustment: ${args.amount}`
      );
    }

    if (balance) {
      await ctx.db.patch(balance._id, {
        available: newBalance,
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

    // Record transaction
    const transactionId = await ctx.db.insert("pointsTransactions", {
      userId: args.userId,
      type: args.type,
      amount: args.amount,
      balance: newBalance,
      status: "completed",
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
      createdAt: now,
      completedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: args.amount > 0 ? "points.awarded" : "points.deducted",
      resourceType: "pointsTransactions",
      resourceId: transactionId,
      metadata: {
        type: args.type,
        amount: args.amount,
        newBalance,
        description: args.description,
      },
      timestamp: now,
    });

    return {
      transactionId,
      amount: args.amount,
      newBalance,
    };
  },
});
