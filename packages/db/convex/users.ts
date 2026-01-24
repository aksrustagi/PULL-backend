import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * User queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

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
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
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
      .withIndex("by_wallet", (q) =>
        q.eq("walletAddress", args.walletAddress.toLowerCase())
      )
      .unique();
  },
});

/**
 * Get user by username
 */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("username", args.username.toLowerCase())
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
      .withIndex("by_referral_code", (q) =>
        q.eq("referralCode", args.referralCode.toUpperCase())
      )
      .unique();
  },
});

/**
 * Get user profile with extended data
 */
export const getProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Get referral count using the index (limit to 1000 for efficiency)
    const referralCount = (await ctx.db
      .query("users")
      .withIndex("by_referrer", (q) => q.eq("referredBy", args.userId))
      .take(1000)
    ).length;

    // Get points balance
    const pointsBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    return {
      ...user,
      referralCount,
      pointsBalance: pointsBalance?.available ?? 0,
    };
  },
});

/**
 * Search users by display name
 */
export const search = query({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    kycTier: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("users")
      .withSearchIndex("search_users", (q) => {
        let search = q.search("displayName", args.query);
        if (args.status) {
          search = search.eq("status", args.status as "active");
        }
        if (args.kycTier) {
          search = search.eq("kycTier", args.kycTier as "none");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * List users with pagination
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let query = ctx.db.query("users");
    if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status as "active")
      );
    }

    const results = await query.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const users = hasMore ? results.slice(0, -1) : results;

    return {
      users,
      hasMore,
      nextCursor: hasMore ? users[users.length - 1]?._id : undefined,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new user
 */
export const create = mutation({
  args: {
    email: v.string(),
    authProvider: v.union(
      v.literal("email"),
      v.literal("google"),
      v.literal("apple"),
      v.literal("wallet")
    ),
    displayName: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    referredBy: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (existing) {
      throw new Error("User with this email already exists");
    }

    // Generate unique referral code
    const referralCode = generateReferralCode();

    // Look up referrer if provided
    let referrerId: Id<"users"> | undefined;
    if (args.referredBy) {
      const referrer = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q) =>
          q.eq("referralCode", args.referredBy!.toUpperCase())
        )
        .unique();
      referrerId = referrer?._id;
    }

    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      emailVerified: false,
      phoneVerified: false,
      displayName: args.displayName,
      status: "active",
      kycStatus: "pending",
      kycTier: "none",
      authProvider: args.authProvider,
      walletAddress: args.walletAddress?.toLowerCase(),
      passwordHash: args.passwordHash,
      referralCode,
      referredBy: referrerId,
      createdAt: now,
      updatedAt: now,
    });

    // Initialize USD balance
    await ctx.db.insert("balances", {
      userId,
      assetType: "usd",
      assetId: "USD",
      symbol: "USD",
      available: 0,
      held: 0,
      pending: 0,
      updatedAt: now,
    });

    // Initialize points balance
    await ctx.db.insert("balances", {
      userId,
      assetType: "points",
      assetId: "PULL_POINTS",
      symbol: "PTS",
      available: 0,
      held: 0,
      pending: 0,
      updatedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId,
      action: "user.created",
      resourceType: "users",
      resourceId: userId,
      timestamp: now,
    });

    return userId;
  },
});

/**
 * Update user profile
 */
export const update = mutation({
  args: {
    id: v.id("users"),
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    country: v.optional(v.string()),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const user = await ctx.db.get(id);
    if (!user) {
      throw new Error("User not found");
    }

    // Check username uniqueness if being updated
    if (updates.username) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_username", (q) =>
          q.eq("username", updates.username!.toLowerCase())
        )
        .unique();

      if (existing && existing._id !== id) {
        throw new Error("Username already taken");
      }
      updates.username = updates.username.toLowerCase();
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: id,
      action: "user.updated",
      resourceType: "users",
      resourceId: id,
      changes: updates,
      timestamp: now,
    });

    return id;
  },
});

/**
 * Update KYC status
 */
export const updateKYCStatus = mutation({
  args: {
    id: v.id("users"),
    kycStatus: v.union(
      v.literal("pending"),
      v.literal("email_verified"),
      v.literal("identity_pending"),
      v.literal("identity_verified"),
      v.literal("background_pending"),
      v.literal("background_cleared"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("suspended")
    ),
    kycTier: v.optional(
      v.union(
        v.literal("none"),
        v.literal("basic"),
        v.literal("verified"),
        v.literal("premium"),
        v.literal("institutional")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.id);
    if (!user) {
      throw new Error("User not found");
    }

    const updates: Record<string, unknown> = {
      kycStatus: args.kycStatus,
      updatedAt: now,
    };

    if (args.kycTier) {
      updates.kycTier = args.kycTier;
    }

    await ctx.db.patch(args.id, updates);

    await ctx.db.insert("auditLog", {
      userId: args.id,
      action: "user.kyc_updated",
      resourceType: "users",
      resourceId: args.id,
      changes: {
        old: { kycStatus: user.kycStatus, kycTier: user.kycTier },
        new: { kycStatus: args.kycStatus, kycTier: args.kycTier },
      },
      timestamp: now,
    });

    return args.id;
  },
});

/**
 * Verify email
 */
export const verifyEmail = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db.get(args.id);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.id, {
      emailVerified: true,
      kycStatus: user.kycStatus === "pending" ? "email_verified" : user.kycStatus,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.id,
      action: "user.email_verified",
      resourceType: "users",
      resourceId: args.id,
      timestamp: now,
    });

    return args.id;
  },
});

/**
 * Connect wallet address
 */
export const connectWallet = mutation({
  args: {
    id: v.id("users"),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if wallet is already connected to another user
    const existing = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) =>
        q.eq("walletAddress", args.walletAddress.toLowerCase())
      )
      .unique();

    if (existing && existing._id !== args.id) {
      throw new Error("Wallet already connected to another account");
    }

    await ctx.db.patch(args.id, {
      walletAddress: args.walletAddress.toLowerCase(),
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.id,
      action: "user.wallet_connected",
      resourceType: "users",
      resourceId: args.id,
      metadata: { walletAddress: args.walletAddress.toLowerCase() },
      timestamp: now,
    });

    return args.id;
  },
});

/**
 * Update last login timestamp
 */
export const updateLastLogin = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      lastLoginAt: now,
      updatedAt: now,
    });
    return args.id;
  },
});

/**
 * Suspend user
 */
export const suspend = mutation({
  args: {
    id: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: "suspended",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.id,
      action: "user.suspended",
      resourceType: "users",
      resourceId: args.id,
      metadata: { reason: args.reason },
      timestamp: now,
    });

    return args.id;
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
