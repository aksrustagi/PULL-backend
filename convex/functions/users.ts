/**
 * User Management Functions
 *
 * Core user operations including creation, updates, and queries.
 */

import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get user by ID
 */
export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get user by email
 */
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

/**
 * Get user by account ID (external auth ID)
 */
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .unique();
  },
});

/**
 * Get user by wallet address
 */
export const getByWalletAddress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_walletAddress", (q) =>
        q.eq("walletAddress", args.walletAddress)
      )
      .unique();
  },
});

/**
 * Get user by referral code
 */
export const getByReferralCode = query({
  args: { referralCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", args.referralCode))
      .unique();
  },
});

/**
 * Get user's email context for AI triage
 */
export const getEmailContext = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Get recent trades for context
    const recentOrders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    // Get watched assets
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      name: user.name,
      email: user.email,
      kycTier: user.kycTier,
      recentAssets: balances.map((b) => b.symbol),
      recentOrderTypes: recentOrders.map((o) => o.assetType),
      preferences: user.preferences,
    };
  },
});

/**
 * Get user's writing style for email replies
 */
export const getWritingStyle = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get user's sent email drafts to analyze style
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "sent"))
      .order("desc")
      .take(5);

    // Check agent memory for stored style analysis
    const styleMemory = await ctx.db
      .query("agentMemory")
      .withIndex("by_userId_key", (q) =>
        q.eq("userId", args.userId).eq("key", "writing_style")
      )
      .unique();

    return {
      recentDrafts: drafts.map((d) => d.body.slice(0, 200)),
      analyzedStyle: styleMemory?.value,
    };
  },
});

/**
 * Check if user exists
 */
export const exists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return !!user;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new user
 */
export const create = mutation({
  args: {
    accountId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    referralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      throw new Error("User already exists with this email");
    }

    // Generate unique referral code
    const userReferralCode = generateReferralCode();

    // Find referrer if referral code provided
    let referredBy: Id<"users"> | undefined;
    if (args.referralCode) {
      const referrer = await ctx.db
        .query("users")
        .withIndex("by_referralCode", (q) =>
          q.eq("referralCode", args.referralCode)
        )
        .unique();
      if (referrer) {
        referredBy = referrer._id;
      }
    }

    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      accountId: args.accountId,
      email: args.email,
      name: args.name,
      kycTier: "none",
      kycStatus: "pending",
      walletAddress: args.walletAddress,
      emailSyncEnabled: false,
      referralCode: userReferralCode,
      referredBy,
      referralCount: 0,
      pointsBalance: 0,
      pullTokenBalance: 0,
      cashBalance: 0,
      preferences: {
        emailNotifications: true,
        pushNotifications: true,
        tradingAlerts: true,
        marketingEmails: false,
        theme: "system",
        defaultCurrency: "USD",
      },
      createdAt: now,
      updatedAt: now,
    });

    // Create initial cash balance record
    await ctx.db.insert("balances", {
      userId,
      assetType: "cash",
      assetId: "USD",
      symbol: "USD",
      name: "US Dollar",
      available: 0,
      held: 0,
      pending: 0,
      staked: 0,
      currentPrice: 1,
      totalValue: 0,
      updatedAt: now,
    });

    // Create referral record if applicable
    if (referredBy) {
      await ctx.db.insert("referrals", {
        referrerId: referredBy,
        referredId: userId,
        status: "pending",
        createdAt: now,
      });

      // Increment referrer's count
      const referrer = await ctx.db.get(referredBy);
      if (referrer) {
        await ctx.db.patch(referredBy, {
          referralCount: referrer.referralCount + 1,
          updatedAt: now,
        });
      }
    }

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId,
      actorType: "user",
      action: "user_created",
      category: "auth",
      resourceType: "user",
      resourceId: userId,
      description: "User account created",
      metadata: {
        email: args.email,
        hasReferral: !!referredBy,
      },
      timestamp: now,
    });

    return userId;
  },
});

/**
 * Update user profile
 */
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(userId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Update KYC status
 */
export const updateKycStatus = internalMutation({
  args: {
    userId: v.id("users"),
    kycTier: v.union(
      v.literal("none"),
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("accredited")
    ),
    kycStatus: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("review")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.userId, {
      kycTier: args.kycTier,
      kycStatus: args.kycStatus,
      kycCompletedAt: args.kycStatus === "approved" ? now : undefined,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "system",
      action: "kyc_status_updated",
      category: "kyc",
      resourceType: "user",
      resourceId: args.userId,
      description: `KYC status updated to ${args.kycStatus}, tier: ${args.kycTier}`,
      metadata: {
        kycTier: args.kycTier,
        kycStatus: args.kycStatus,
      },
      timestamp: now,
    });

    // If KYC approved and user was referred, update referral status
    if (args.kycStatus === "approved") {
      const user = await ctx.db.get(args.userId);
      if (user?.referredBy) {
        const referral = await ctx.db
          .query("referrals")
          .withIndex("by_referredId", (q) => q.eq("referredId", args.userId))
          .unique();

        if (referral && referral.status === "pending") {
          await ctx.db.patch(referral._id, {
            status: "qualified",
          });
        }
      }
    }

    return true;
  },
});

/**
 * Connect wallet address
 */
export const connectWallet = mutation({
  args: {
    userId: v.id("users"),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if wallet is already connected to another user
    const existing = await ctx.db
      .query("users")
      .withIndex("by_walletAddress", (q) =>
        q.eq("walletAddress", args.walletAddress)
      )
      .unique();

    if (existing && existing._id !== args.userId) {
      throw new Error("Wallet already connected to another account");
    }

    const now = Date.now();

    await ctx.db.patch(args.userId, {
      walletAddress: args.walletAddress,
      walletConnectedAt: now,
      updatedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "user",
      action: "wallet_connected",
      category: "settings",
      resourceType: "user",
      resourceId: args.userId,
      description: "Wallet address connected",
      metadata: {
        walletAddress: args.walletAddress,
      },
      timestamp: now,
    });

    return true;
  },
});

/**
 * Update user preferences
 */
export const updatePreferences = mutation({
  args: {
    userId: v.id("users"),
    preferences: v.object({
      emailNotifications: v.optional(v.boolean()),
      pushNotifications: v.optional(v.boolean()),
      tradingAlerts: v.optional(v.boolean()),
      marketingEmails: v.optional(v.boolean()),
      theme: v.optional(
        v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
      ),
      defaultCurrency: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updatedPreferences = {
      ...user.preferences,
      ...Object.fromEntries(
        Object.entries(args.preferences).filter(([_, v]) => v !== undefined)
      ),
    };

    await ctx.db.patch(args.userId, {
      preferences: updatedPreferences,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Record user login
 */
export const recordLogin = mutation({
  args: {
    userId: v.id("users"),
    deviceInfo: v.object({
      type: v.string(),
      os: v.string(),
      browser: v.optional(v.string()),
      ip: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.userId, {
      lastLoginAt: now,
      lastActivityAt: now,
      updatedAt: now,
    });

    // Create session
    const token = generateSessionToken();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      token,
      deviceInfo: args.deviceInfo,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
      createdAt: now,
      lastUsedAt: now,
    });

    // Log audit event
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      actorType: "user",
      action: "user_login",
      category: "auth",
      resourceType: "session",
      resourceId: sessionId,
      description: "User logged in",
      ipAddress: args.deviceInfo.ip,
      metadata: {
        deviceType: args.deviceInfo.type,
        os: args.deviceInfo.os,
      },
      timestamp: now,
    });

    return { sessionId, token };
  },
});

/**
 * Update points balance (internal only)
 */
export const updatePointsBalance = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(v.literal("earn"), v.literal("redeem")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const newBalance =
      args.type === "earn"
        ? user.pointsBalance + args.amount
        : user.pointsBalance - args.amount;

    if (newBalance < 0) {
      throw new Error("Insufficient points balance");
    }

    await ctx.db.patch(args.userId, {
      pointsBalance: newBalance,
      updatedAt: Date.now(),
    });

    return newBalance;
  },
});

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

export const getByIdInternal = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// =============================================================================
// HELPERS
// =============================================================================

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PULL-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSessionToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
