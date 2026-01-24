import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authenticatedQuery, authenticatedMutation, adminMutation, systemMutation } from "./lib/auth";

/**
 * User queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get current user's profile by their authenticated identity
 */
export const getById = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db.get(userId);
  },
});

/**
 * Get user by email (used by API auth route during login)
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
 * Get user by wallet address (used by API auth route)
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
 * Get user by username (public profile lookup)
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
 * Get user by referral code (public, used during signup)
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
 * Get authenticated user's profile with extended data
 */
export const getProfile = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const userId = ctx.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Get referral count
    const referrals = await ctx.db
      .query("users")
      .withIndex("by_status")
      .filter((q) => q.eq(q.field("referredBy"), userId))
      .collect();

    // Get points balance
    const pointsBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
      )
      .unique();

    return {
      ...user,
      referralCount: referrals.length,
      pointsBalance: pointsBalance?.available ?? 0,
    };
  },
});

/**
 * Search users by display name (authenticated users only)
 */
export const search = authenticatedQuery({
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
 * List users with pagination (admin only)
 */
export const list = adminMutation({
  args: {
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("suspended"),
      v.literal("closed")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100); // Cap at 100

    let query = ctx.db.query("users");
    if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status!)
      );
    }

    const results = await query.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const users = hasMore ? results.slice(0, -1) : results;

    return {
      users,
      hasMore,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new user (called during signup flow before user has auth token)
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
 * Update authenticated user's profile (users can only update their own profile)
 */
export const update = authenticatedMutation({
  args: {
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
    const id = ctx.userId as Id<"users">;
    const now = Date.now();

    const user = await ctx.db.get(id);
    if (!user) {
      throw new Error("User not found");
    }

    const updates = { ...args };

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
 * Update KYC status (system/webhook use only)
 */
export const updateKYCStatus = systemMutation({
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
 * Verify email (system use only - called by verification process)
 */
export const verifyEmail = systemMutation({
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
 * Connect wallet address (authenticated users connect their own wallet)
 */
export const connectWallet = authenticatedMutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const id = ctx.userId as Id<"users">;
    const now = Date.now();

    // Check if wallet is already connected to another user
    const existing = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) =>
        q.eq("walletAddress", args.walletAddress.toLowerCase())
      )
      .unique();

    if (existing && existing._id !== id) {
      throw new Error("Wallet already connected to another account");
    }

    await ctx.db.patch(id, {
      walletAddress: args.walletAddress.toLowerCase(),
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: id,
      action: "user.wallet_connected",
      resourceType: "users",
      resourceId: id,
      metadata: { walletAddress: args.walletAddress.toLowerCase() },
      timestamp: now,
    });

    return id;
  },
});

/**
 * Update last login timestamp (system use only - called by API auth route)
 */
export const updateLastLogin = systemMutation({
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
 * Suspend user (admin only)
 */
export const suspend = adminMutation({
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
  // Use crypto.getRandomValues with rejection sampling to avoid modulo bias
  const randomBytes = new Uint8Array(16); // Extra bytes for rejection sampling
  crypto.getRandomValues(randomBytes);
  let byteIndex = 0;
  
  while (code.length < 8 && byteIndex < randomBytes.length) {
    const byte = randomBytes[byteIndex++];
    // Reject bytes that would introduce bias
    if (byte < 256 - (256 % chars.length)) {
      code += chars.charAt(byte % chars.length);
    }
  }
  
  // Fallback if we run out of bytes (extremely unlikely)
  if (code.length < 8) {
    return generateReferralCode();
  }
  
  return code;
}
