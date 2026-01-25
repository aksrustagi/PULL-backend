import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Auth queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get user by email with password hash for authentication
 */
export const getUserForAuth = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) {
      return null;
    }

    return {
      id: user._id,
      email: user.email,
      passwordHash: user.passwordHash,
      status: user.status,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
    };
  },
});

/**
 * Get account by provider
 */
export const getAccountByProvider = query({
  args: {
    provider: v.string(),
    providerAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_provider", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerAccountId", args.providerAccountId)
      )
      .unique();
  },
});

/**
 * Get accounts for user
 */
export const getAccountsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Validate user credentials (for email/password auth)
 */
export const validateCredentials = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) {
      return null;
    }

    return {
      id: user._id,
      email: user.email,
      passwordHash: user.passwordHash,
      status: user.status,
      emailVerified: user.emailVerified,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Link OAuth account to user
 */
export const linkAccount = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    providerAccountId: v.string(),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    tokenType: v.optional(v.string()),
    scope: v.optional(v.string()),
    idToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if account already linked
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_provider", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerAccountId", args.providerAccountId)
      )
      .unique();

    if (existing) {
      // Update existing account
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        tokenType: args.tokenType,
        scope: args.scope,
        idToken: args.idToken,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new account link
    const accountId = await ctx.db.insert("accounts", {
      userId: args.userId,
      provider: args.provider,
      providerAccountId: args.providerAccountId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      tokenType: args.tokenType,
      scope: args.scope,
      idToken: args.idToken,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "auth.account_linked",
      resourceType: "accounts",
      resourceId: accountId,
      metadata: { provider: args.provider },
      timestamp: now,
    });

    return accountId;
  },
});

/**
 * Unlink OAuth account from user
 */
export const unlinkAccount = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find account
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const account = accounts.find((a) => a.provider === args.provider);

    if (!account) {
      throw new Error("Account not found");
    }

    // Ensure user has another auth method
    if (accounts.length === 1) {
      const user = await ctx.db.get(args.userId);
      if (!user?.passwordHash) {
        throw new Error("Cannot unlink the only authentication method");
      }
    }

    await ctx.db.delete(account._id);

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "auth.account_unlinked",
      resourceType: "accounts",
      resourceId: account._id,
      metadata: { provider: args.provider },
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Update account tokens
 */
export const updateTokens = mutation({
  args: {
    accountId: v.id("accounts"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.accountId, {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      updatedAt: now,
    });

    return args.accountId;
  },
});

/**
 * Update user password
 */
export const updatePassword = mutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "auth.password_updated",
      resourceType: "users",
      resourceId: args.userId,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Generate password reset token (stores in KYC records as a workaround)
 */
export const createPasswordResetToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Store token in KYC records table (reusing for simplicity)
    const recordId = await ctx.db.insert("kycRecords", {
      userId: args.userId,
      type: "identity", // Reusing type
      provider: "password_reset",
      externalId: args.token,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "auth.password_reset_requested",
      resourceType: "kycRecords",
      resourceId: recordId,
      timestamp: now,
    });

    return recordId;
  },
});

/**
 * Validate and consume password reset token
 */
export const validatePasswordResetToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_external", (q) =>
        q.eq("provider", "password_reset").eq("externalId", args.token)
      )
      .unique();

    if (!record) {
      return { valid: false, error: "Token not found" };
    }

    if (record.status !== "pending") {
      return { valid: false, error: "Token already used" };
    }

    if (record.expiresAt && record.expiresAt < now) {
      return { valid: false, error: "Token expired" };
    }

    // Mark token as used
    await ctx.db.patch(record._id, {
      status: "completed",
      completedAt: now,
    });

    return { valid: true, userId: record.userId };
  },
});

/**
 * Record login attempt
 */
export const recordLoginAttempt = mutation({
  args: {
    userId: v.optional(v.id("users")),
    email: v.string(),
    success: v.boolean(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: args.success ? "auth.login_success" : "auth.login_failed",
      resourceType: "users",
      resourceId: args.userId ?? args.email,
      metadata: {
        email: args.email,
        failureReason: args.failureReason,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      timestamp: now,
    });

    // Update last login if successful
    if (args.success && args.userId) {
      await ctx.db.patch(args.userId, {
        lastLoginAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

/**
 * Create email verification token
 */
export const createEmailVerificationToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Invalidate any existing verification tokens for this user
    const existingTokens = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const record of existingTokens) {
      if (record.provider === "email_verification" && record.status === "pending") {
        await ctx.db.patch(record._id, {
          status: "expired",
          completedAt: now,
        });
      }
    }

    // Create new token record
    const recordId = await ctx.db.insert("kycRecords", {
      userId: args.userId,
      type: "identity",
      provider: "email_verification",
      externalId: args.token,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "auth.email_verification_requested",
      resourceType: "kycRecords",
      resourceId: recordId,
      timestamp: now,
    });

    return recordId;
  },
});

/**
 * Validate and consume email verification token
 */
export const validateEmailVerificationToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("kycRecords")
      .withIndex("by_external", (q) =>
        q.eq("provider", "email_verification").eq("externalId", args.token)
      )
      .unique();

    if (!record) {
      return { valid: false, error: "Token not found" };
    }

    if (record.status !== "pending") {
      return { valid: false, error: "Token already used" };
    }

    if (record.expiresAt && record.expiresAt < now) {
      return { valid: false, error: "Token expired" };
    }

    // Mark token as used
    await ctx.db.patch(record._id, {
      status: "completed",
      completedAt: now,
    });

    // Get user and verify email
    const user = await ctx.db.get(record.userId);
    if (!user) {
      return { valid: false, error: "User not found" };
    }

    // Update user's email verification status
    await ctx.db.patch(record.userId, {
      emailVerified: true,
      kycStatus: user.kycStatus === "pending" ? "email_verified" : user.kycStatus,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: record.userId,
      action: "auth.email_verified",
      resourceType: "users",
      resourceId: record.userId,
      timestamp: now,
    });

    return {
      valid: true,
      userId: record.userId,
      email: user.email,
      displayName: user.displayName,
    };
  },
});

/**
 * Resend email verification token
 */
export const canResendVerificationEmail = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownPeriod = 60 * 1000; // 1 minute cooldown

    // Check for recent verification tokens
    const recentTokens = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const lastToken = recentTokens
      .filter((r) => r.provider === "email_verification")
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (lastToken && now - lastToken.createdAt < cooldownPeriod) {
      const remainingSeconds = Math.ceil(
        (cooldownPeriod - (now - lastToken.createdAt)) / 1000
      );
      return {
        canResend: false,
        reason: `Please wait ${remainingSeconds} seconds before requesting another email`,
        remainingSeconds,
      };
    }

    return { canResend: true };
  },
});

/**
 * Get user by ID for auth responses
 */
export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      status: user.status,
    };
  },
});
