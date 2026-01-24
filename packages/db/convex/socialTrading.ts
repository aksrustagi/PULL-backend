import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Social Trading Graph - Database Schema
 * Tables for social trading features including follows, copy trading,
 * trader profiles, leaderboards, trading rooms, and reputation
 */

// ============================================================================
// SOCIAL GRAPH TABLES
// ============================================================================

/**
 * Follows - Follower/following relationships between traders
 */
export const follows = defineTable({
  followerId: v.id("users"),
  followeeId: v.id("users"),

  // Follow settings
  notificationsEnabled: v.boolean(),
  positionVisibility: v.union(
    v.literal("all"),
    v.literal("entry_only"),
    v.literal("none")
  ),

  // Timestamps
  followedAt: v.number(),
  unfollowedAt: v.optional(v.number()),
  isActive: v.boolean(),
})
  .index("by_follower", ["followerId", "isActive"])
  .index("by_followee", ["followeeId", "isActive"])
  .index("by_pair", ["followerId", "followeeId"]);

/**
 * Trader Profiles - Extended profiles for traders with public track records
 */
export const traderProfiles = defineTable({
  userId: v.id("users"),

  // Profile settings
  isPublic: v.boolean(),
  allowCopyTrading: v.boolean(),
  allowAutoCopy: v.boolean(),

  // Copy trading fees (percentage)
  copyTradingFee: v.number(),
  performanceFee: v.number(),

  // Profile content
  bio: v.optional(v.string()),
  tradingStyle: v.optional(v.string()),
  tradingPhilosophy: v.optional(v.string()),
  riskProfile: v.optional(v.union(
    v.literal("conservative"),
    v.literal("moderate"),
    v.literal("aggressive"),
    v.literal("very_aggressive")
  )),
  preferredAssets: v.array(v.string()),

  // Social links
  twitterHandle: v.optional(v.string()),
  discordHandle: v.optional(v.string()),
  telegramHandle: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),

  // Verification
  isVerified: v.boolean(),
  verifiedAt: v.optional(v.number()),
  verificationBadges: v.array(v.string()),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_public", ["isPublic", "allowCopyTrading"])
  .index("by_verified", ["isVerified"]);

/**
 * Trader Stats - Performance statistics calculated from actual trades
 */
export const traderStats = defineTable({
  userId: v.id("users"),
  period: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("yearly"),
    v.literal("all_time")
  ),
  periodStart: v.number(),
  periodEnd: v.number(),

  // Core metrics
  totalTrades: v.number(),
  winningTrades: v.number(),
  losingTrades: v.number(),
  winRate: v.number(),

  // P&L metrics
  totalPnL: v.number(),
  totalPnLPercent: v.number(),
  avgPnLPerTrade: v.number(),
  avgWinAmount: v.number(),
  avgLossAmount: v.number(),
  largestWin: v.number(),
  largestLoss: v.number(),

  // Risk metrics
  sharpeRatio: v.number(),
  sortinoRatio: v.number(),
  maxDrawdown: v.number(),
  maxDrawdownPercent: v.number(),
  volatility: v.number(),
  calmarRatio: v.number(),

  // Volume metrics
  totalVolume: v.number(),
  avgPositionSize: v.number(),
  avgHoldingPeriod: v.number(),

  // Streak data
  currentWinStreak: v.number(),
  currentLossStreak: v.number(),
  longestWinStreak: v.number(),
  longestLossStreak: v.number(),

  // Asset breakdown
  assetBreakdown: v.optional(v.any()),

  // Timestamps
  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId", "period"])
  .index("by_period", ["period", "periodStart"])
  .index("by_user_period_date", ["userId", "period", "periodStart"]);

/**
 * Reputation Scores - Composite reputation based on verified track record
 */
export const reputationScores = defineTable({
  userId: v.id("users"),

  // Overall score (0-1000)
  overallScore: v.number(),

  // Component scores (0-100 each)
  performanceScore: v.number(),
  consistencyScore: v.number(),
  riskManagementScore: v.number(),
  transparencyScore: v.number(),
  socialScore: v.number(),
  longevityScore: v.number(),

  // Tier based on score
  tier: v.union(
    v.literal("bronze"),
    v.literal("silver"),
    v.literal("gold"),
    v.literal("platinum"),
    v.literal("diamond"),
    v.literal("legend")
  ),

  // Badges earned
  badges: v.array(v.object({
    type: v.string(),
    name: v.string(),
    earnedAt: v.number(),
  })),

  // Trust indicators
  verifiedReturns: v.boolean(),
  auditedBy: v.optional(v.string()),
  lastAuditAt: v.optional(v.number()),

  // Anti-fraud indicators
  fraudRiskScore: v.number(),
  suspiciousActivityCount: v.number(),
  lastReviewAt: v.optional(v.number()),

  // Timestamps
  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_tier", ["tier", "overallScore"])
  .index("by_score", ["overallScore"]);

// ============================================================================
// COPY TRADING TABLES
// ============================================================================

/**
 * Copy Trading Subscriptions - Auto-copy configurations
 */
export const copyTradingSubscriptions = defineTable({
  copierId: v.id("users"),
  traderId: v.id("users"),

  // Subscription settings
  status: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("paused"),
    v.literal("stopped"),
    v.literal("cancelled")
  ),

  // Position sizing
  copyMode: v.union(
    v.literal("fixed_amount"),
    v.literal("percentage_portfolio"),
    v.literal("proportional"),
    v.literal("fixed_ratio")
  ),
  fixedAmount: v.optional(v.number()),
  portfolioPercentage: v.optional(v.number()),
  copyRatio: v.optional(v.number()),

  // Risk controls
  maxPositionSize: v.number(),
  maxDailyLoss: v.number(),
  maxTotalExposure: v.number(),
  stopLossPercent: v.optional(v.number()),
  takeProfitPercent: v.optional(v.number()),

  // Asset filters
  copyAssetClasses: v.array(v.string()),
  excludedSymbols: v.array(v.string()),

  // Delay settings (for position visibility tiers)
  copyDelaySeconds: v.number(),

  // Performance tracking
  totalCopiedTrades: v.number(),
  totalPnL: v.number(),
  totalFeesPaid: v.number(),

  // Timestamps
  subscribedAt: v.number(),
  pausedAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_copier", ["copierId", "status"])
  .index("by_trader", ["traderId", "status"])
  .index("by_pair", ["copierId", "traderId"]);

/**
 * Copy Trades - Individual copy trade execution records
 */
export const copyTrades = defineTable({
  subscriptionId: v.id("copyTradingSubscriptions"),
  copierId: v.id("users"),
  traderId: v.id("users"),

  // Original trade reference
  originalOrderId: v.id("orders"),
  originalTradeId: v.optional(v.id("trades")),

  // Copy order reference
  copyOrderId: v.optional(v.id("orders")),
  copyTradeId: v.optional(v.id("trades")),

  // Status
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

  // Trade details
  symbol: v.string(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  originalQuantity: v.number(),
  originalPrice: v.number(),
  copyQuantity: v.number(),
  copyPrice: v.optional(v.number()),
  slippage: v.optional(v.number()),

  // Fees
  copyFee: v.number(),
  performanceFee: v.number(),

  // P&L (updated when closed)
  pnl: v.optional(v.number()),
  pnlPercent: v.optional(v.number()),

  // Timestamps
  originalExecutedAt: v.number(),
  copyExecutedAt: v.optional(v.number()),
  closedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_subscription", ["subscriptionId", "status"])
  .index("by_copier", ["copierId", "createdAt"])
  .index("by_trader", ["traderId", "createdAt"])
  .index("by_original_order", ["originalOrderId"]);

// ============================================================================
// POSITION INTERACTION TABLES
// ============================================================================

/**
 * Position Comments - Comments and analysis on positions
 */
export const positionComments = defineTable({
  positionId: v.optional(v.id("positions")),
  orderId: v.optional(v.id("orders")),
  tradeId: v.optional(v.id("trades")),

  authorId: v.id("users"),
  traderId: v.id("users"),

  // Comment content
  content: v.string(),
  contentType: v.union(
    v.literal("text"),
    v.literal("analysis"),
    v.literal("thesis"),
    v.literal("update"),
    v.literal("exit_rationale")
  ),

  // Attachments
  attachments: v.array(v.object({
    type: v.union(v.literal("image"), v.literal("chart"), v.literal("link")),
    url: v.string(),
    title: v.optional(v.string()),
  })),

  // Engagement
  likesCount: v.number(),
  repliesCount: v.number(),

  // Parent for threading
  parentCommentId: v.optional(v.id("positionComments")),

  // Status
  isEdited: v.boolean(),
  isDeleted: v.boolean(),
  isPinned: v.boolean(),

  // Timestamps
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  .index("by_position", ["positionId", "isDeleted"])
  .index("by_order", ["orderId", "isDeleted"])
  .index("by_trade", ["tradeId", "isDeleted"])
  .index("by_author", ["authorId", "createdAt"])
  .index("by_trader", ["traderId", "createdAt"])
  .index("by_parent", ["parentCommentId"]);

/**
 * Comment Likes - Likes on position comments
 */
export const commentLikes = defineTable({
  commentId: v.id("positionComments"),
  userId: v.id("users"),
  createdAt: v.number(),
})
  .index("by_comment", ["commentId"])
  .index("by_user", ["userId"])
  .index("by_pair", ["commentId", "userId"]);

// ============================================================================
// TRADING ROOMS TABLES
// ============================================================================

/**
 * Trading Rooms - Group trading spaces with shared positions
 */
export const tradingRooms = defineTable({
  // Basic info
  name: v.string(),
  description: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  coverImageUrl: v.optional(v.string()),

  // Room type and access
  type: v.union(
    v.literal("public"),
    v.literal("private"),
    v.literal("premium"),
    v.literal("exclusive")
  ),
  accessLevel: v.union(
    v.literal("open"),
    v.literal("request_to_join"),
    v.literal("invite_only"),
    v.literal("subscription")
  ),

  // Subscription pricing (for premium rooms)
  subscriptionPrice: v.optional(v.number()),
  subscriptionPeriod: v.optional(v.union(
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("yearly")
  )),

  // Ownership
  ownerId: v.id("users"),
  moderatorIds: v.array(v.id("users")),

  // Focus areas
  tradingFocus: v.array(v.string()),
  assetClasses: v.array(v.string()),

  // Settings
  settings: v.object({
    allowPositionSharing: v.boolean(),
    allowCopyTrades: v.boolean(),
    positionDelay: v.number(),
    requireVerifiedTraders: v.boolean(),
    minReputationScore: v.number(),
  }),

  // Stats
  memberCount: v.number(),
  activeMembers: v.number(),
  totalPositionsShared: v.number(),
  totalMessages: v.number(),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("archived"),
    v.literal("suspended")
  ),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  lastActivityAt: v.number(),
})
  .index("by_owner", ["ownerId"])
  .index("by_type", ["type", "status"])
  .index("by_status", ["status", "memberCount"])
  .searchIndex("search_rooms", {
    searchField: "name",
    filterFields: ["type", "status"],
  });

/**
 * Trading Room Members - Room membership records
 */
export const tradingRoomMembers = defineTable({
  roomId: v.id("tradingRooms"),
  userId: v.id("users"),

  // Role
  role: v.union(
    v.literal("owner"),
    v.literal("moderator"),
    v.literal("contributor"),
    v.literal("member"),
    v.literal("viewer")
  ),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("pending"),
    v.literal("banned"),
    v.literal("left")
  ),

  // Permissions
  canPost: v.boolean(),
  canSharePositions: v.boolean(),
  canInvite: v.boolean(),

  // Settings
  notificationsEnabled: v.boolean(),
  notificationLevel: v.union(
    v.literal("all"),
    v.literal("mentions"),
    v.literal("positions_only"),
    v.literal("none")
  ),

  // Activity tracking
  lastReadAt: v.optional(v.number()),
  lastPostAt: v.optional(v.number()),
  positionsSharedCount: v.number(),
  messagesCount: v.number(),

  // Subscription (for premium rooms)
  subscriptionId: v.optional(v.string()),
  subscriptionExpiresAt: v.optional(v.number()),

  // Timestamps
  joinedAt: v.number(),
  leftAt: v.optional(v.number()),
  bannedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_room", ["roomId", "status"])
  .index("by_user", ["userId", "status"])
  .index("by_room_user", ["roomId", "userId"]);

/**
 * Trading Room Messages - Messages in trading rooms
 */
export const tradingRoomMessages = defineTable({
  roomId: v.id("tradingRooms"),
  senderId: v.id("users"),

  // Message type
  type: v.union(
    v.literal("text"),
    v.literal("position_share"),
    v.literal("trade_share"),
    v.literal("analysis"),
    v.literal("alert"),
    v.literal("system")
  ),

  // Content
  content: v.string(),
  formattedContent: v.optional(v.string()),

  // Position/Trade share data
  sharedData: v.optional(v.object({
    positionId: v.optional(v.id("positions")),
    orderId: v.optional(v.id("orders")),
    tradeId: v.optional(v.id("trades")),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell"), v.literal("long"), v.literal("short")),
    quantity: v.optional(v.number()),
    price: v.optional(v.number()),
    pnl: v.optional(v.number()),
    pnlPercent: v.optional(v.number()),
  })),

  // Attachments
  attachments: v.array(v.object({
    type: v.string(),
    url: v.string(),
    name: v.optional(v.string()),
    size: v.optional(v.number()),
  })),

  // Engagement
  likesCount: v.number(),
  repliesCount: v.number(),
  copyCount: v.number(),

  // Threading
  replyToId: v.optional(v.id("tradingRoomMessages")),

  // Status
  isEdited: v.boolean(),
  isDeleted: v.boolean(),
  isPinned: v.boolean(),

  // Timestamps
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  .index("by_room", ["roomId", "createdAt"])
  .index("by_sender", ["senderId", "createdAt"])
  .index("by_reply", ["replyToId"])
  .index("by_room_type", ["roomId", "type", "createdAt"])
  .searchIndex("search_room_messages", {
    searchField: "content",
    filterFields: ["roomId", "type"],
  });

// ============================================================================
// LEADERBOARD TABLES
// ============================================================================

/**
 * Leaderboard Snapshots - Periodic leaderboard snapshots
 */
export const leaderboardSnapshots = defineTable({
  // Leaderboard identity
  leaderboardType: v.union(
    v.literal("pnl"),
    v.literal("pnl_percent"),
    v.literal("sharpe_ratio"),
    v.literal("win_rate"),
    v.literal("total_trades"),
    v.literal("followers"),
    v.literal("copiers"),
    v.literal("reputation")
  ),
  period: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("all_time")
  ),
  assetClass: v.optional(v.string()),

  // Time range
  periodStart: v.number(),
  periodEnd: v.number(),

  // Entries (top 100)
  entries: v.array(v.object({
    rank: v.number(),
    previousRank: v.optional(v.number()),
    userId: v.id("users"),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    value: v.number(),
    change: v.optional(v.number()),
    changePercent: v.optional(v.number()),
    tier: v.optional(v.string()),
    isVerified: v.boolean(),
  })),

  // Metadata
  totalParticipants: v.number(),
  minQualifyingValue: v.optional(v.number()),

  // Timestamps
  calculatedAt: v.number(),
  createdAt: v.number(),
})
  .index("by_type_period", ["leaderboardType", "period", "periodStart"])
  .index("by_period_date", ["period", "periodStart"]);

/**
 * User Leaderboard History - Individual user's leaderboard positions over time
 */
export const userLeaderboardHistory = defineTable({
  userId: v.id("users"),
  leaderboardType: v.string(),
  period: v.string(),

  // Position data
  rank: v.number(),
  value: v.number(),
  percentile: v.number(),

  // Reference to snapshot
  snapshotId: v.id("leaderboardSnapshots"),
  periodStart: v.number(),

  // Timestamps
  recordedAt: v.number(),
})
  .index("by_user", ["userId", "leaderboardType", "period"])
  .index("by_user_type_date", ["userId", "leaderboardType", "periodStart"]);

// ============================================================================
// FRAUD DETECTION TABLES
// ============================================================================

/**
 * Fraud Alerts - Suspected fraudulent activity
 */
export const fraudAlerts = defineTable({
  userId: v.id("users"),

  // Alert type
  alertType: v.union(
    v.literal("wash_trading"),
    v.literal("manipulation"),
    v.literal("front_running"),
    v.literal("fake_performance"),
    v.literal("collusion"),
    v.literal("unusual_activity"),
    v.literal("bot_behavior")
  ),

  // Severity
  severity: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),

  // Detection details
  detectionMethod: v.string(),
  confidence: v.number(),
  evidence: v.array(v.object({
    type: v.string(),
    description: v.string(),
    data: v.any(),
    timestamp: v.number(),
  })),

  // Related entities
  relatedOrderIds: v.array(v.id("orders")),
  relatedTradeIds: v.array(v.id("trades")),
  relatedUserIds: v.array(v.id("users")),

  // Status
  status: v.union(
    v.literal("pending"),
    v.literal("investigating"),
    v.literal("confirmed"),
    v.literal("dismissed"),
    v.literal("resolved")
  ),

  // Review
  reviewedBy: v.optional(v.string()),
  reviewNotes: v.optional(v.string()),
  resolution: v.optional(v.string()),
  actionTaken: v.optional(v.string()),

  // Timestamps
  detectedAt: v.number(),
  reviewedAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
})
  .index("by_user", ["userId", "status"])
  .index("by_status", ["status", "severity"])
  .index("by_type", ["alertType", "status"]);

/**
 * Trading Patterns - Analyzed trading patterns for ML/fraud detection
 */
export const tradingPatterns = defineTable({
  userId: v.id("users"),

  // Pattern window
  periodStart: v.number(),
  periodEnd: v.number(),

  // Behavioral features
  features: v.object({
    // Timing patterns
    avgTimeBetweenTrades: v.number(),
    stdTimeBetweenTrades: v.number(),
    peakTradingHours: v.array(v.number()),

    // Size patterns
    avgOrderSize: v.number(),
    stdOrderSize: v.number(),
    medianOrderSize: v.number(),

    // Price patterns
    avgPriceImprovement: v.number(),
    avgSlippage: v.number(),
    limitOrderFillRate: v.number(),

    // Behavioral indicators
    cancelToFillRatio: v.number(),
    selfTradeRatio: v.number(),
    roundTripRatio: v.number(),
    consecutiveSameSideRatio: v.number(),

    // Performance patterns
    winAfterLossRatio: v.number(),
    lossAfterWinRatio: v.number(),
    streakCorrelation: v.number(),
  }),

  // ML classification
  alphaScore: v.number(),
  luckScore: v.number(),
  skillScore: v.number(),
  manipulationScore: v.number(),

  // Timestamps
  calculatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_period", ["userId", "periodStart"]);

// ============================================================================
// ACTIVITY FEED TABLES
// ============================================================================

/**
 * Social Activity - Activity feed items
 */
export const socialActivity = defineTable({
  // Actor
  actorId: v.id("users"),

  // Activity type
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

  // Target entity
  targetType: v.optional(v.string()),
  targetId: v.optional(v.string()),

  // Activity details
  data: v.any(),

  // Visibility
  visibility: v.union(
    v.literal("public"),
    v.literal("followers"),
    v.literal("private")
  ),

  // Related users (for notifications)
  relatedUserIds: v.array(v.id("users")),

  // Timestamps
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
})
  .index("by_actor", ["actorId", "createdAt"])
  .index("by_type", ["type", "createdAt"])
  .index("by_visibility", ["visibility", "createdAt"]);

/**
 * User Feed Cache - Precomputed feed items per user
 */
export const userFeedCache = defineTable({
  userId: v.id("users"),
  activityId: v.id("socialActivity"),
  actorId: v.id("users"),

  // Feed type
  feedType: v.union(
    v.literal("following"),
    v.literal("discover"),
    v.literal("notifications")
  ),

  // Activity data (denormalized for fast reads)
  type: v.string(),
  data: v.any(),

  // Read status (for notifications)
  isRead: v.boolean(),

  // Timestamps
  activityAt: v.number(),
  cachedAt: v.number(),
})
  .index("by_user_feed", ["userId", "feedType", "activityAt"])
  .index("by_user_unread", ["userId", "feedType", "isRead"]);

// Export all tables
export const socialTradingTables = {
  // Social graph
  follows,
  traderProfiles,
  traderStats,
  reputationScores,

  // Copy trading
  copyTradingSubscriptions,
  copyTrades,

  // Position interactions
  positionComments,
  commentLikes,

  // Trading rooms
  tradingRooms,
  tradingRoomMembers,
  tradingRoomMessages,

  // Leaderboards
  leaderboardSnapshots,
  userLeaderboardHistory,

  // Fraud detection
  fraudAlerts,
  tradingPatterns,

  // Activity feed
  socialActivity,
  userFeedCache,
};
