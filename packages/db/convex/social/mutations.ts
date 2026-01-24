import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Social Trading Graph - Mutation Functions
 * Mutations for follows, profiles, copy trading, comments, and activity tracking
 */

// ============================================================================
// FOLLOW MUTATIONS
// ============================================================================

/**
 * Follow a trader
 */
export const follow = mutation({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
    notificationsEnabled: v.optional(v.boolean()),
    positionVisibility: v.optional(v.union(
      v.literal("all"),
      v.literal("entry_only"),
      v.literal("none")
    )),
  },
  handler: async (ctx, args) => {
    // Check if already following
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .unique();

    const now = Date.now();

    if (existing) {
      // Reactivate if inactive
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          followedAt: now,
          unfollowedAt: undefined,
          notificationsEnabled: args.notificationsEnabled ?? true,
          positionVisibility: args.positionVisibility ?? "all",
        });
        return existing._id;
      }
      return existing._id;
    }

    // Create new follow
    const followId = await ctx.db.insert("follows", {
      followerId: args.followerId,
      followeeId: args.followeeId,
      notificationsEnabled: args.notificationsEnabled ?? true,
      positionVisibility: args.positionVisibility ?? "all",
      followedAt: now,
      isActive: true,
    });

    // Create activity
    await ctx.db.insert("socialActivity", {
      actorId: args.followerId,
      type: "follow",
      targetType: "user",
      targetId: args.followeeId,
      data: { followeeId: args.followeeId },
      visibility: "public",
      relatedUserIds: [args.followeeId],
      createdAt: now,
    });

    return followId;
  },
});

/**
 * Unfollow a trader
 */
export const unfollow = mutation({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    if (!follow) {
      throw new Error("Not following this user");
    }

    await ctx.db.patch(follow._id, {
      isActive: false,
      unfollowedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update follow settings
 */
export const updateFollowSettings = mutation({
  args: {
    followerId: v.id("users"),
    followeeId: v.id("users"),
    notificationsEnabled: v.optional(v.boolean()),
    positionVisibility: v.optional(v.union(
      v.literal("all"),
      v.literal("entry_only"),
      v.literal("none")
    )),
  },
  handler: async (ctx, args) => {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", args.followerId).eq("followeeId", args.followeeId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    if (!follow) {
      throw new Error("Not following this user");
    }

    const updates: any = {};
    if (args.notificationsEnabled !== undefined) {
      updates.notificationsEnabled = args.notificationsEnabled;
    }
    if (args.positionVisibility !== undefined) {
      updates.positionVisibility = args.positionVisibility;
    }

    await ctx.db.patch(follow._id, updates);

    return { success: true };
  },
});

// ============================================================================
// TRADER PROFILE MUTATIONS
// ============================================================================

/**
 * Create or update trader profile
 */
export const upsertTraderProfile = mutation({
  args: {
    userId: v.id("users"),
    isPublic: v.optional(v.boolean()),
    allowCopyTrading: v.optional(v.boolean()),
    allowAutoCopy: v.optional(v.boolean()),
    copyTradingFee: v.optional(v.number()),
    performanceFee: v.optional(v.number()),
    bio: v.optional(v.string()),
    tradingStyle: v.optional(v.string()),
    tradingPhilosophy: v.optional(v.string()),
    riskProfile: v.optional(v.union(
      v.literal("conservative"),
      v.literal("moderate"),
      v.literal("aggressive"),
      v.literal("very_aggressive")
    )),
    preferredAssets: v.optional(v.array(v.string())),
    twitterHandle: v.optional(v.string()),
    discordHandle: v.optional(v.string()),
    telegramHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();

    if (existing) {
      // Update existing profile
      const updates: any = { updatedAt: now };
      
      if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
      if (args.allowCopyTrading !== undefined) updates.allowCopyTrading = args.allowCopyTrading;
      if (args.allowAutoCopy !== undefined) updates.allowAutoCopy = args.allowAutoCopy;
      if (args.copyTradingFee !== undefined) updates.copyTradingFee = args.copyTradingFee;
      if (args.performanceFee !== undefined) updates.performanceFee = args.performanceFee;
      if (args.bio !== undefined) updates.bio = args.bio;
      if (args.tradingStyle !== undefined) updates.tradingStyle = args.tradingStyle;
      if (args.tradingPhilosophy !== undefined) updates.tradingPhilosophy = args.tradingPhilosophy;
      if (args.riskProfile !== undefined) updates.riskProfile = args.riskProfile;
      if (args.preferredAssets !== undefined) updates.preferredAssets = args.preferredAssets;
      if (args.twitterHandle !== undefined) updates.twitterHandle = args.twitterHandle;
      if (args.discordHandle !== undefined) updates.discordHandle = args.discordHandle;
      if (args.telegramHandle !== undefined) updates.telegramHandle = args.telegramHandle;
      if (args.websiteUrl !== undefined) updates.websiteUrl = args.websiteUrl;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Create new profile
    return await ctx.db.insert("traderProfiles", {
      userId: args.userId,
      isPublic: args.isPublic ?? false,
      allowCopyTrading: args.allowCopyTrading ?? false,
      allowAutoCopy: args.allowAutoCopy ?? false,
      copyTradingFee: args.copyTradingFee ?? 0,
      performanceFee: args.performanceFee ?? 0,
      bio: args.bio,
      tradingStyle: args.tradingStyle,
      tradingPhilosophy: args.tradingPhilosophy,
      riskProfile: args.riskProfile,
      preferredAssets: args.preferredAssets ?? [],
      twitterHandle: args.twitterHandle,
      discordHandle: args.discordHandle,
      telegramHandle: args.telegramHandle,
      websiteUrl: args.websiteUrl,
      isVerified: false,
      verificationBadges: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// COPY TRADING MUTATIONS
// ============================================================================

/**
 * Create copy trading subscription
 */
export const createCopySubscription = mutation({
  args: {
    copierId: v.id("users"),
    traderId: v.id("users"),
    copyMode: v.union(
      v.literal("fixed_amount"),
      v.literal("percentage_portfolio"),
      v.literal("proportional"),
      v.literal("fixed_ratio")
    ),
    fixedAmount: v.optional(v.number()),
    portfolioPercentage: v.optional(v.number()),
    copyRatio: v.optional(v.number()),
    maxPositionSize: v.number(),
    maxDailyLoss: v.number(),
    maxTotalExposure: v.number(),
    stopLossPercent: v.optional(v.number()),
    takeProfitPercent: v.optional(v.number()),
    copyAssetClasses: v.array(v.string()),
    excludedSymbols: v.optional(v.array(v.string())),
    copyDelaySeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if trader allows copy trading
    const traderProfile = await ctx.db
      .query("traderProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.traderId))
      .unique();

    if (!traderProfile?.allowCopyTrading) {
      throw new Error("Trader does not allow copy trading");
    }

    // Check if already subscribed
    const existing = await ctx.db
      .query("copyTradingSubscriptions")
      .withIndex("by_pair", (q) =>
        q.eq("copierId", args.copierId).eq("traderId", args.traderId)
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .unique();

    if (existing) {
      throw new Error("Already subscribed to this trader");
    }

    const now = Date.now();

    const subscriptionId = await ctx.db.insert("copyTradingSubscriptions", {
      copierId: args.copierId,
      traderId: args.traderId,
      status: "active",
      copyMode: args.copyMode,
      fixedAmount: args.fixedAmount,
      portfolioPercentage: args.portfolioPercentage,
      copyRatio: args.copyRatio,
      maxPositionSize: args.maxPositionSize,
      maxDailyLoss: args.maxDailyLoss,
      maxTotalExposure: args.maxTotalExposure,
      stopLossPercent: args.stopLossPercent,
      takeProfitPercent: args.takeProfitPercent,
      copyAssetClasses: args.copyAssetClasses,
      excludedSymbols: args.excludedSymbols ?? [],
      copyDelaySeconds: args.copyDelaySeconds ?? 0,
      totalCopiedTrades: 0,
      totalPnL: 0,
      totalFeesPaid: 0,
      subscribedAt: now,
      updatedAt: now,
    });

    // Create activity
    await ctx.db.insert("socialActivity", {
      actorId: args.copierId,
      type: "copy_trade",
      targetType: "subscription",
      targetId: subscriptionId,
      data: { traderId: args.traderId, subscriptionId },
      visibility: "followers",
      relatedUserIds: [args.traderId],
      createdAt: now,
    });

    return subscriptionId;
  },
});

/**
 * Update copy trading subscription
 */
export const updateCopySubscription = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
    copyMode: v.optional(v.union(
      v.literal("fixed_amount"),
      v.literal("percentage_portfolio"),
      v.literal("proportional"),
      v.literal("fixed_ratio")
    )),
    fixedAmount: v.optional(v.number()),
    portfolioPercentage: v.optional(v.number()),
    copyRatio: v.optional(v.number()),
    maxPositionSize: v.optional(v.number()),
    maxDailyLoss: v.optional(v.number()),
    maxTotalExposure: v.optional(v.number()),
    stopLossPercent: v.optional(v.number()),
    takeProfitPercent: v.optional(v.number()),
    copyAssetClasses: v.optional(v.array(v.string())),
    excludedSymbols: v.optional(v.array(v.string())),
    copyDelaySeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const updates: any = { updatedAt: Date.now() };
    
    if (args.copyMode !== undefined) updates.copyMode = args.copyMode;
    if (args.fixedAmount !== undefined) updates.fixedAmount = args.fixedAmount;
    if (args.portfolioPercentage !== undefined) updates.portfolioPercentage = args.portfolioPercentage;
    if (args.copyRatio !== undefined) updates.copyRatio = args.copyRatio;
    if (args.maxPositionSize !== undefined) updates.maxPositionSize = args.maxPositionSize;
    if (args.maxDailyLoss !== undefined) updates.maxDailyLoss = args.maxDailyLoss;
    if (args.maxTotalExposure !== undefined) updates.maxTotalExposure = args.maxTotalExposure;
    if (args.stopLossPercent !== undefined) updates.stopLossPercent = args.stopLossPercent;
    if (args.takeProfitPercent !== undefined) updates.takeProfitPercent = args.takeProfitPercent;
    if (args.copyAssetClasses !== undefined) updates.copyAssetClasses = args.copyAssetClasses;
    if (args.excludedSymbols !== undefined) updates.excludedSymbols = args.excludedSymbols;
    if (args.copyDelaySeconds !== undefined) updates.copyDelaySeconds = args.copyDelaySeconds;

    await ctx.db.patch(args.subscriptionId, updates);

    return { success: true };
  },
});

/**
 * Pause copy trading subscription
 */
export const pauseCopySubscription = mutation({
  args: { subscriptionId: v.id("copyTradingSubscriptions") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "paused",
      pausedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Resume copy trading subscription
 */
export const resumeCopySubscription = mutation({
  args: { subscriptionId: v.id("copyTradingSubscriptions") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "active",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Cancel copy trading subscription
 */
export const cancelCopySubscription = mutation({
  args: { subscriptionId: v.id("copyTradingSubscriptions") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Record a copy trade execution
 */
export const recordCopyTrade = mutation({
  args: {
    subscriptionId: v.id("copyTradingSubscriptions"),
    copierId: v.id("users"),
    traderId: v.id("users"),
    originalOrderId: v.id("orders"),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    originalQuantity: v.number(),
    originalPrice: v.number(),
    copyQuantity: v.number(),
    copyPrice: v.optional(v.number()),
    copyOrderId: v.optional(v.id("orders")),
    status: v.union(
      v.literal("pending"),
      v.literal("executing"),
      v.literal("filled"),
      v.literal("partial_fill"),
      v.literal("failed"),
      v.literal("skipped"),
      v.literal("cancelled")
    ),
    skipReason: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    slippage: v.optional(v.number()),
    copyFee: v.number(),
    performanceFee: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const copyTradeId = await ctx.db.insert("copyTrades", {
      subscriptionId: args.subscriptionId,
      copierId: args.copierId,
      traderId: args.traderId,
      originalOrderId: args.originalOrderId,
      copyOrderId: args.copyOrderId,
      status: args.status,
      skipReason: args.skipReason,
      failureReason: args.failureReason,
      symbol: args.symbol,
      side: args.side,
      originalQuantity: args.originalQuantity,
      originalPrice: args.originalPrice,
      copyQuantity: args.copyQuantity,
      copyPrice: args.copyPrice,
      slippage: args.slippage,
      copyFee: args.copyFee,
      performanceFee: args.performanceFee,
      originalExecutedAt: now,
      copyExecutedAt: args.status === "filled" ? now : undefined,
      createdAt: now,
    });

    // Update subscription stats
    if (args.status === "filled") {
      const subscription = await ctx.db.get(args.subscriptionId);
      if (subscription) {
        await ctx.db.patch(args.subscriptionId, {
          totalCopiedTrades: subscription.totalCopiedTrades + 1,
          totalFeesPaid: subscription.totalFeesPaid + args.copyFee + args.performanceFee,
          updatedAt: now,
        });
      }
    }

    return copyTradeId;
  },
});

// ============================================================================
// POSITION COMMENT MUTATIONS
// ============================================================================

/**
 * Create a position comment
 */
export const createComment = mutation({
  args: {
    authorId: v.id("users"),
    traderId: v.id("users"),
    positionId: v.optional(v.id("positions")),
    orderId: v.optional(v.id("orders")),
    tradeId: v.optional(v.id("trades")),
    content: v.string(),
    contentType: v.optional(v.union(
      v.literal("text"),
      v.literal("analysis"),
      v.literal("thesis"),
      v.literal("update"),
      v.literal("exit_rationale")
    )),
    parentCommentId: v.optional(v.id("positionComments")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const commentId = await ctx.db.insert("positionComments", {
      authorId: args.authorId,
      traderId: args.traderId,
      positionId: args.positionId,
      orderId: args.orderId,
      tradeId: args.tradeId,
      content: args.content,
      contentType: args.contentType ?? "text",
      attachments: [],
      likesCount: 0,
      repliesCount: 0,
      parentCommentId: args.parentCommentId,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: now,
    });

    // Update parent comment reply count
    if (args.parentCommentId) {
      const parent = await ctx.db.get(args.parentCommentId);
      if (parent) {
        await ctx.db.patch(args.parentCommentId, {
          repliesCount: parent.repliesCount + 1,
        });
      }
    }

    // Create activity
    await ctx.db.insert("socialActivity", {
      actorId: args.authorId,
      type: "comment",
      targetType: "comment",
      targetId: commentId,
      data: { commentId, traderId: args.traderId },
      visibility: "public",
      relatedUserIds: [args.traderId],
      createdAt: now,
    });

    return commentId;
  },
});

/**
 * Like a comment
 */
export const likeComment = mutation({
  args: {
    commentId: v.id("positionComments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Check if already liked
    const existing = await ctx.db
      .query("commentLikes")
      .withIndex("by_pair", (q) =>
        q.eq("commentId", args.commentId).eq("userId", args.userId)
      )
      .unique();

    if (existing) {
      return { success: true, alreadyLiked: true };
    }

    const now = Date.now();

    await ctx.db.insert("commentLikes", {
      commentId: args.commentId,
      userId: args.userId,
      createdAt: now,
    });

    // Update comment like count
    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      await ctx.db.patch(args.commentId, {
        likesCount: comment.likesCount + 1,
      });
    }

    return { success: true, alreadyLiked: false };
  },
});

/**
 * Unlike a comment
 */
export const unlikeComment = mutation({
  args: {
    commentId: v.id("positionComments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const like = await ctx.db
      .query("commentLikes")
      .withIndex("by_pair", (q) =>
        q.eq("commentId", args.commentId).eq("userId", args.userId)
      )
      .unique();

    if (!like) {
      return { success: true, wasLiked: false };
    }

    await ctx.db.delete(like._id);

    // Update comment like count
    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      await ctx.db.patch(args.commentId, {
        likesCount: Math.max(0, comment.likesCount - 1),
      });
    }

    return { success: true, wasLiked: true };
  },
});

/**
 * Delete a comment
 */
export const deleteComment = mutation({
  args: {
    commentId: v.id("positionComments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    if (comment.authorId !== args.userId) {
      throw new Error("Unauthorized to delete this comment");
    }

    await ctx.db.patch(args.commentId, {
      isDeleted: true,
      deletedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// ACTIVITY & NOTIFICATION MUTATIONS
// ============================================================================

/**
 * Mark notifications as read
 */
export const markNotificationsRead = mutation({
  args: {
    userId: v.id("users"),
    itemIds: v.optional(v.array(v.id("userFeedCache"))),
    all: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.all) {
      // Mark all notifications as read
      const notifications = await ctx.db
        .query("userFeedCache")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", args.userId)
            .eq("feedType", "notifications")
            .eq("isRead", false)
        )
        .collect();

      for (const notification of notifications) {
        await ctx.db.patch(notification._id, { isRead: true });
      }

      return { success: true, count: notifications.length };
    }

    if (args.itemIds && args.itemIds.length > 0) {
      // Mark specific notifications as read
      for (const itemId of args.itemIds) {
        await ctx.db.patch(itemId, { isRead: true });
      }

      return { success: true, count: args.itemIds.length };
    }

    return { success: true, count: 0 };
  },
});

/**
 * Create social activity (for internal use by other mutations)
 */
export const createActivity = mutation({
  args: {
    actorId: v.id("users"),
    type: v.union(
      v.literal("follow"),
      v.literal("position_opened"),
      v.literal("position_closed"),
      v.literal("position_shared"),
      v.literal("comment"),
      v.literal("like"),
      v.literal("copy_trade"),
      v.literal("achievement"),
      v.literal("leaderboard_rank"),
      v.literal("room_created"),
      v.literal("room_joined")
    ),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    data: v.any(),
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("private")
    ),
    relatedUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("socialActivity", {
      actorId: args.actorId,
      type: args.type,
      targetType: args.targetType,
      targetId: args.targetId,
      data: args.data,
      visibility: args.visibility,
      relatedUserIds: args.relatedUserIds ?? [],
      createdAt: now,
    });
  },
});
