import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PULL Super App - Convex Database Schema
 * 26 tables covering all platform features
 */
export default defineSchema({
  // ============================================================================
  // USER & AUTH TABLES
  // ============================================================================

  /**
   * Users - Core user profile with KYC status
   */
  users: defineTable({
    // Identity
    email: v.string(),
    emailVerified: v.boolean(),
    phone: v.optional(v.string()),
    phoneVerified: v.boolean(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),

    // Profile details
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    country: v.optional(v.string()),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("suspended"),
      v.literal("closed")
    ),
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
    kycTier: v.union(
      v.literal("none"),
      v.literal("basic"),
      v.literal("verified"),
      v.literal("premium"),
      v.literal("institutional")
    ),

    // Auth
    authProvider: v.union(
      v.literal("email"),
      v.literal("google"),
      v.literal("apple"),
      v.literal("wallet")
    ),
    walletAddress: v.optional(v.string()),
    passwordHash: v.optional(v.string()),

    // Referral
    referralCode: v.string(),
    referredBy: v.optional(v.id("users")),

    // Timestamps
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .index("by_wallet", ["walletAddress"])
    .index("by_referral_code", ["referralCode"])
    .index("by_status", ["status"])
    .index("by_kyc_status", ["kycStatus"])
    .searchIndex("search_users", {
      searchField: "displayName",
      filterFields: ["status", "kycTier"],
    }),

  /**
   * Accounts - OAuth and auth provider accounts
   */
  accounts: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    providerAccountId: v.string(),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    tokenType: v.optional(v.string()),
    scope: v.optional(v.string()),
    idToken: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider", ["provider", "providerAccountId"]),

  /**
   * KYC Records - Identity verification history
   */
  kycRecords: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("identity"),
      v.literal("address"),
      v.literal("background"),
      v.literal("wallet_screening")
    ),
    provider: v.string(),
    externalId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("expired")
    ),
    result: v.optional(
      v.union(v.literal("pass"), v.literal("fail"), v.literal("review"))
    ),
    riskScore: v.optional(v.number()),
    data: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["userId", "type"])
    .index("by_external", ["provider", "externalId"]),

  // ============================================================================
  // FINANCIAL TABLES
  // ============================================================================

  /**
   * Balances - User balances per asset type
   */
  balances: defineTable({
    userId: v.id("users"),
    assetType: v.union(
      v.literal("usd"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("points"),
      v.literal("token")
    ),
    assetId: v.string(),
    symbol: v.string(),
    available: v.number(),
    held: v.number(),
    pending: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_asset", ["userId", "assetType", "assetId"]),

  /**
   * Orders - All order types
   */
  orders: defineTable({
    userId: v.id("users"),
    clientOrderId: v.optional(v.string()),
    externalOrderId: v.optional(v.string()),
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    type: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop"),
      v.literal("stop_limit")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("accepted"),
      v.literal("partial_fill"),
      v.literal("filled"),
      v.literal("cancelled"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    quantity: v.number(),
    filledQuantity: v.number(),
    remainingQuantity: v.number(),
    price: v.optional(v.number()),
    stopPrice: v.optional(v.number()),
    averageFilledPrice: v.optional(v.number()),
    timeInForce: v.union(
      v.literal("day"),
      v.literal("gtc"),
      v.literal("ioc"),
      v.literal("fok")
    ),
    fees: v.number(),
    feeCurrency: v.string(),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    filledAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_external", ["externalOrderId"])
    .index("by_symbol", ["symbol", "status"]),

  /**
   * Positions - Current user positions
   */
  positions: defineTable({
    userId: v.id("users"),
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    symbol: v.string(),
    side: v.union(v.literal("long"), v.literal("short")),
    quantity: v.number(),
    averageEntryPrice: v.number(),
    currentPrice: v.number(),
    costBasis: v.number(),
    unrealizedPnL: v.number(),
    realizedPnL: v.number(),
    openedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_asset", ["userId", "assetClass", "symbol"]),

  /**
   * Trades - Trade execution history
   */
  trades: defineTable({
    orderId: v.id("orders"),
    userId: v.id("users"),
    externalTradeId: v.optional(v.string()),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    quantity: v.number(),
    price: v.number(),
    notionalValue: v.number(),
    fee: v.number(),
    feeCurrency: v.string(),
    liquidity: v.union(v.literal("maker"), v.literal("taker")),
    executedAt: v.number(),
    settledAt: v.optional(v.number()),
    settlementStatus: v.union(
      v.literal("pending"),
      v.literal("settled"),
      v.literal("failed")
    ),
  })
    .index("by_order", ["orderId"])
    .index("by_user", ["userId"])
    .index("by_symbol", ["symbol", "executedAt"]),

  /**
   * Deposits - Deposit records
   */
  deposits: defineTable({
    userId: v.id("users"),
    method: v.union(
      v.literal("bank_transfer"),
      v.literal("wire"),
      v.literal("crypto"),
      v.literal("card")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    amount: v.number(),
    currency: v.string(),
    fee: v.number(),
    netAmount: v.number(),
    externalId: v.optional(v.string()),
    txHash: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  /**
   * Withdrawals - Withdrawal records
   */
  withdrawals: defineTable({
    userId: v.id("users"),
    method: v.union(
      v.literal("bank_transfer"),
      v.literal("wire"),
      v.literal("crypto")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    amount: v.number(),
    currency: v.string(),
    fee: v.number(),
    netAmount: v.number(),
    destination: v.string(),
    externalId: v.optional(v.string()),
    txHash: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // ============================================================================
  // PREDICTION MARKETS TABLES
  // ============================================================================

  /**
   * Prediction Events - Kalshi events cache
   */
  predictionEvents: defineTable({
    externalId: v.string(),
    ticker: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    status: v.union(
      v.literal("upcoming"),
      v.literal("open"),
      v.literal("trading_halted"),
      v.literal("closed"),
      v.literal("settled"),
      v.literal("cancelled")
    ),
    resolutionSource: v.optional(v.string()),
    resolutionDetails: v.optional(v.string()),
    settlementValue: v.optional(v.number()),
    winningOutcomeId: v.optional(v.string()),
    openTime: v.number(),
    closeTime: v.number(),
    expirationTime: v.number(),
    settledAt: v.optional(v.number()),
    volume: v.number(),
    openInterest: v.number(),
    tags: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    syncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_external", ["externalId"])
    .index("by_ticker", ["ticker"])
    .index("by_status", ["status"])
    .index("by_category", ["category", "status"])
    .searchIndex("search_events", {
      searchField: "title",
      filterFields: ["status", "category"],
    }),

  /**
   * Prediction Markets - Market/outcome data
   */
  predictionMarkets: defineTable({
    eventId: v.id("predictionEvents"),
    externalId: v.string(),
    ticker: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    probability: v.number(),
    yesPrice: v.number(),
    noPrice: v.number(),
    yesVolume: v.number(),
    noVolume: v.number(),
    openInterest: v.number(),
    isWinner: v.optional(v.boolean()),
    settlementPrice: v.optional(v.number()),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_ticker", ["ticker"]),

  // ============================================================================
  // RWA TABLES
  // ============================================================================

  /**
   * RWA Assets - Pokemon cards and collectibles
   */
  rwaAssets: defineTable({
    type: v.union(
      v.literal("pokemon_card"),
      v.literal("sports_card"),
      v.literal("collectible"),
      v.literal("art"),
      v.literal("other")
    ),
    name: v.string(),
    description: v.string(),
    imageUrls: v.array(v.string()),
    status: v.union(
      v.literal("pending_verification"),
      v.literal("verified"),
      v.literal("listed"),
      v.literal("sold"),
      v.literal("delisted"),
      v.literal("disputed")
    ),
    ownerId: v.id("users"),
    custodianId: v.optional(v.string()),
    totalShares: v.number(),
    availableShares: v.number(),
    pricePerShare: v.number(),
    currency: v.string(),

    // Grading info
    gradingCompany: v.optional(v.string()),
    grade: v.optional(v.number()),
    certNumber: v.optional(v.string()),

    // Card-specific fields
    cardName: v.optional(v.string()),
    setName: v.optional(v.string()),
    cardNumber: v.optional(v.string()),
    rarity: v.optional(v.string()),
    year: v.optional(v.number()),

    verificationDocuments: v.array(v.string()),
    metadata: v.optional(v.any()),
    verifiedAt: v.optional(v.number()),
    listedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_type", ["type", "status"])
    .searchIndex("search_assets", {
      searchField: "name",
      filterFields: ["type", "status"],
    }),

  /**
   * RWA Listings - Marketplace listings
   */
  rwaListings: defineTable({
    assetId: v.id("rwaAssets"),
    sellerId: v.id("users"),
    listingType: v.union(
      v.literal("fixed_price"),
      v.literal("auction"),
      v.literal("make_offer")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_review"),
      v.literal("active"),
      v.literal("sold"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("delisted")
    ),
    pricePerShare: v.number(),
    minShares: v.number(),
    maxShares: v.number(),
    availableShares: v.number(),
    auctionEndTime: v.optional(v.number()),
    highestBid: v.optional(v.number()),
    highestBidderId: v.optional(v.id("users")),
    reservePrice: v.optional(v.number()),
    buyNowPrice: v.optional(v.number()),
    viewCount: v.number(),
    watchCount: v.number(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_asset", ["assetId"])
    .index("by_seller", ["sellerId"])
    .index("by_status", ["status"]),

  /**
   * RWA Ownership - Fractional ownership records
   */
  rwaOwnership: defineTable({
    assetId: v.id("rwaAssets"),
    ownerId: v.id("users"),
    shares: v.number(),
    sharePercentage: v.number(),
    averageCost: v.number(),
    acquiredAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_asset", ["assetId"])
    .index("by_owner", ["ownerId"])
    .index("by_asset_owner", ["assetId", "ownerId"]),

  // ============================================================================
  // MESSAGING TABLES
  // ============================================================================

  /**
   * Matrix Rooms - Chat room metadata
   */
  matrixRooms: defineTable({
    matrixRoomId: v.string(),
    type: v.union(
      v.literal("direct"),
      v.literal("group"),
      v.literal("public"),
      v.literal("space")
    ),
    name: v.optional(v.string()),
    topic: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isEncrypted: v.boolean(),
    memberCount: v.number(),
    creatorId: v.id("users"),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_matrix_id", ["matrixRoomId"])
    .index("by_creator", ["creatorId"]),

  /**
   * Matrix Messages - Message cache for search
   */
  matrixMessages: defineTable({
    matrixEventId: v.string(),
    roomId: v.id("matrixRooms"),
    senderId: v.id("users"),
    contentType: v.string(),
    body: v.string(),
    formattedBody: v.optional(v.string()),
    replyToId: v.optional(v.string()),
    isEdited: v.boolean(),
    isDeleted: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_room", ["roomId", "timestamp"])
    .index("by_sender", ["senderId"])
    .index("by_matrix_event", ["matrixEventId"])
    .searchIndex("search_messages", {
      searchField: "body",
      filterFields: ["roomId"],
    }),

  // ============================================================================
  // EMAIL TABLES
  // ============================================================================

  /**
   * Email Accounts - Nylas grant connections
   */
  emailAccounts: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    grantId: v.string(),
    syncStatus: v.union(
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("error"),
      v.literal("disabled")
    ),
    lastSyncAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    syncCursor: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_grant", ["grantId"]),

  /**
   * Emails - Synced emails with AI triage
   */
  emails: defineTable({
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
    externalId: v.string(),
    threadId: v.string(),
    folderId: v.string(),
    folderName: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    toEmails: v.array(v.string()),
    ccEmails: v.array(v.string()),
    subject: v.string(),
    snippet: v.string(),
    bodyPlain: v.optional(v.string()),
    hasAttachments: v.boolean(),
    attachmentCount: v.number(),

    // Status
    status: v.union(
      v.literal("unread"),
      v.literal("read"),
      v.literal("archived"),
      v.literal("deleted"),
      v.literal("snoozed")
    ),
    isStarred: v.boolean(),
    isImportant: v.boolean(),
    labels: v.array(v.string()),

    // AI Triage
    triagePriority: v.optional(v.string()),
    triageCategory: v.optional(v.string()),
    triageConfidence: v.optional(v.number()),
    triageSummary: v.optional(v.string()),
    triageActionRequired: v.optional(v.boolean()),

    receivedAt: v.number(),
    snoozedUntil: v.optional(v.number()),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_thread", ["threadId"])
    .index("by_folder", ["accountId", "folderId"])
    .index("by_status", ["userId", "status"])
    .searchIndex("search_emails", {
      searchField: "subject",
      filterFields: ["userId", "status", "triageCategory"],
    }),

  // ============================================================================
  // REWARDS TABLES
  // ============================================================================

  /**
   * Points Config - Action types and base points configuration
   */
  pointsConfig: defineTable({
    actionType: v.string(),
    basePoints: v.number(),
    description: v.string(),
    category: v.union(
      v.literal("trading"),
      v.literal("social"),
      v.literal("engagement"),
      v.literal("milestone"),
      v.literal("referral"),
      v.literal("special")
    ),
    // Multiplier configuration
    multipliers: v.object({
      tierBonus: v.boolean(),
      streakBonus: v.boolean(),
      volumeBonus: v.boolean(),
      seasonalBonus: v.boolean(),
    }),
    // Conditions for earning
    conditions: v.optional(
      v.object({
        minAmount: v.optional(v.number()),
        maxDaily: v.optional(v.number()),
        requiresKyc: v.optional(v.boolean()),
        requiredTier: v.optional(v.string()),
      })
    ),
    // Cooldown in seconds (0 = no cooldown)
    cooldownSeconds: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_action", ["actionType"])
    .index("by_category", ["category", "isActive"]),

  /**
   * Streaks - User streak tracking for various activities
   */
  streaks: defineTable({
    userId: v.id("users"),
    streakType: v.union(
      v.literal("daily_login"),
      v.literal("daily_trade"),
      v.literal("weekly_deposit"),
      v.literal("prediction_win"),
      v.literal("rwa_purchase")
    ),
    currentCount: v.number(),
    longestCount: v.number(),
    lastActionAt: v.number(),
    lastActionDate: v.string(), // YYYY-MM-DD format for easy day comparison
    multiplierActive: v.boolean(),
    multiplierExpiresAt: v.optional(v.number()),
    frozenUntil: v.optional(v.number()), // Streak freeze feature
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "streakType"])
    .index("by_type", ["streakType"]),

  /**
   * Quest Definitions - Template for daily/weekly quests
   */
  questDefinitions: defineTable({
    questId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("special")
    ),
    type: v.union(
      v.literal("trade_count"),
      v.literal("trade_volume"),
      v.literal("deposit"),
      v.literal("login_streak"),
      v.literal("referral"),
      v.literal("prediction_win"),
      v.literal("rwa_purchase"),
      v.literal("social_share"),
      v.literal("profile_complete"),
      v.literal("custom")
    ),
    // Requirements
    targetValue: v.number(),
    targetMetric: v.string(),
    // Rewards
    pointsReward: v.number(),
    bonusMultiplier: v.optional(v.number()),
    tokenReward: v.optional(v.number()),
    badgeReward: v.optional(v.string()),
    // Constraints
    minTier: v.optional(v.string()),
    maxCompletions: v.optional(v.number()), // How many times can be completed
    expiresAfterHours: v.number(), // How long quest is active
    // Display
    imageUrl: v.optional(v.string()),
    order: v.number(),
    isActive: v.boolean(),
    isFeatured: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quest_id", ["questId"])
    .index("by_category", ["category", "isActive"])
    .index("by_featured", ["isFeatured", "isActive"]),

  /**
   * Quests - User quest progress and completion tracking
   */
  quests: defineTable({
    userId: v.id("users"),
    questDefinitionId: v.id("questDefinitions"),
    questId: v.string(),
    // Progress tracking
    progress: v.number(),
    targetValue: v.number(),
    progressPercentage: v.number(),
    // Status
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("claimed"),
      v.literal("expired"),
      v.literal("abandoned")
    ),
    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    expiresAt: v.number(),
    // Rewards claimed
    pointsEarned: v.optional(v.number()),
    tokensEarned: v.optional(v.number()),
    badgeEarned: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_quest", ["userId", "questId"])
    .index("by_quest_definition", ["questDefinitionId"]),

  /**
   * Tiers - User tier status and progression
   */
  tiers: defineTable({
    userId: v.id("users"),
    tierLevel: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold"),
      v.literal("platinum"),
      v.literal("diamond")
    ),
    lifetimePoints: v.number(),
    currentPeriodPoints: v.number(),
    // Tier expiry (for maintaining tier status)
    tierAchievedAt: v.number(),
    tierExpiresAt: v.optional(v.number()),
    // Benefits tracking
    multiplier: v.number(),
    benefitsUsed: v.object({
      freeWithdrawals: v.number(),
      prioritySupport: v.boolean(),
      exclusiveRewards: v.number(),
    }),
    // Next tier info
    nextTier: v.optional(v.string()),
    pointsToNextTier: v.number(),
    // History
    previousTier: v.optional(v.string()),
    tierDowngradeWarning: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tier", ["tierLevel"])
    .index("by_expiry", ["tierExpiresAt"]),

  /**
   * Achievement Definitions - Available achievements
   */
  achievementDefinitions: defineTable({
    achievementId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("trading"),
      v.literal("social"),
      v.literal("streak"),
      v.literal("milestone"),
      v.literal("special"),
      v.literal("referral"),
      v.literal("rwa"),
      v.literal("prediction")
    ),
    // Requirements
    requirementType: v.string(),
    requirementValue: v.number(),
    requirementMetadata: v.optional(v.any()),
    // Rewards
    pointsReward: v.number(),
    tokenReward: v.optional(v.number()),
    badgeUrl: v.optional(v.string()),
    // Display
    imageUrl: v.optional(v.string()),
    rarity: v.union(
      v.literal("common"),
      v.literal("uncommon"),
      v.literal("rare"),
      v.literal("epic"),
      v.literal("legendary")
    ),
    isSecret: v.boolean(),
    order: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_achievement_id", ["achievementId"])
    .index("by_category", ["category", "isActive"])
    .index("by_rarity", ["rarity", "isActive"]),

  /**
   * User Achievements - User achievement progress and unlocks
   */
  userAchievements: defineTable({
    userId: v.id("users"),
    achievementDefinitionId: v.id("achievementDefinitions"),
    achievementId: v.string(),
    // Progress
    progress: v.number(),
    targetValue: v.number(),
    progressPercentage: v.number(),
    // Status
    isUnlocked: v.boolean(),
    unlockedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    // Rewards
    pointsEarned: v.optional(v.number()),
    tokensEarned: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_achievement", ["userId", "achievementId"])
    .index("by_unlocked", ["userId", "isUnlocked"]),

  /**
   * Competitions - Seasonal and special competitions
   */
  competitions: defineTable({
    competitionId: v.string(),
    name: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("seasonal"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("special_event"),
      v.literal("tournament")
    ),
    // Scoring
    scoringType: v.union(
      v.literal("points_earned"),
      v.literal("trading_volume"),
      v.literal("pnl"),
      v.literal("referrals"),
      v.literal("streak_days"),
      v.literal("quests_completed")
    ),
    // Timing
    startTime: v.number(),
    endTime: v.number(),
    resultsTime: v.optional(v.number()),
    // Prizes
    prizePool: v.number(),
    prizeDistribution: v.array(
      v.object({
        rankStart: v.number(),
        rankEnd: v.number(),
        pointsPrize: v.number(),
        tokenPrize: v.optional(v.number()),
        specialPrize: v.optional(v.string()),
      })
    ),
    // Requirements
    minTier: v.optional(v.string()),
    entryFee: v.optional(v.number()),
    maxParticipants: v.optional(v.number()),
    // Stats
    participantCount: v.number(),
    totalVolume: v.number(),
    // Status
    status: v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("calculating"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    // Display
    imageUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    rules: v.optional(v.string()),
    isActive: v.boolean(),
    isFeatured: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_competition_id", ["competitionId"])
    .index("by_status", ["status"])
    .index("by_type", ["type", "status"])
    .index("by_featured", ["isFeatured", "status"]),

  /**
   * Competition Participants - User participation in competitions
   */
  competitionParticipants: defineTable({
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    // Score tracking
    score: v.number(),
    rank: v.optional(v.number()),
    previousRank: v.optional(v.number()),
    rankChange: v.optional(v.number()),
    // Activity
    lastActivityAt: v.number(),
    activityCount: v.number(),
    // Prizes
    prizeWon: v.optional(v.number()),
    prizeTokens: v.optional(v.number()),
    specialPrize: v.optional(v.string()),
    prizeClaimed: v.boolean(),
    prizeClaimedAt: v.optional(v.number()),
    // Status
    isActive: v.boolean(),
    isDisqualified: v.boolean(),
    disqualificationReason: v.optional(v.string()),
    joinedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_competition", ["competitionId"])
    .index("by_user", ["userId"])
    .index("by_competition_user", ["competitionId", "userId"])
    .index("by_competition_rank", ["competitionId", "rank"])
    .index("by_competition_score", ["competitionId", "score"]),

  /**
   * Multiplier Events - Active multiplier promotions
   */
  multiplierEvents: defineTable({
    eventId: v.string(),
    name: v.string(),
    description: v.string(),
    multiplierValue: v.number(),
    // What it applies to
    appliesTo: v.array(v.string()), // Action types or "all"
    appliesToTiers: v.optional(v.array(v.string())),
    // Timing
    startTime: v.number(),
    endTime: v.number(),
    // Limits
    maxUsesPerUser: v.optional(v.number()),
    maxTotalUses: v.optional(v.number()),
    currentUses: v.number(),
    // Status
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_active", ["isActive", "startTime", "endTime"]),

  /**
   * Points Transactions - Points ledger
   */
  pointsTransactions: defineTable({
    userId: v.id("users"),
    type: v.string(),
    amount: v.number(),
    balance: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("reversed")
    ),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_status", ["status"]),

  /**
   * Rewards - Available rewards catalog
   */
  rewards: defineTable({
    name: v.string(),
    description: v.string(),
    category: v.string(),
    type: v.string(),
    pointsCost: v.number(),
    cashValue: v.optional(v.number()),
    stock: v.optional(v.number()),
    maxPerUser: v.optional(v.number()),
    minTier: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    terms: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.optional(v.number()),
    isActive: v.boolean(),
    isFeatured: v.boolean(),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_category", ["category", "isActive"])
    .index("by_featured", ["isFeatured", "isActive"]),

  /**
   * Redemptions - Reward redemption records
   */
  redemptions: defineTable({
    userId: v.id("users"),
    rewardId: v.id("rewards"),
    rewardName: v.string(),
    pointsSpent: v.number(),
    quantity: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    fulfillmentType: v.string(),
    fulfillmentDetails: v.optional(v.any()),
    shippingAddress: v.optional(v.any()),
    trackingNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    redeemedAt: v.number(),
    fulfilledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_reward", ["rewardId"])
    .index("by_status", ["status"]),

  // ============================================================================
  // TOKEN TABLES
  // ============================================================================

  /**
   * Token Transactions - On-chain transaction records
   */
  tokenTransactions: defineTable({
    userId: v.id("users"),
    walletAddress: v.string(),
    type: v.string(),
    amount: v.number(),
    txHash: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("failed")
    ),
    blockNumber: v.optional(v.number()),
    gasUsed: v.optional(v.number()),
    fee: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_tx", ["txHash"]),

  /**
   * Staking Positions - Token staking records
   */
  stakingPositions: defineTable({
    userId: v.id("users"),
    walletAddress: v.string(),
    poolId: v.string(),
    poolName: v.string(),
    stakedAmount: v.number(),
    shares: v.number(),
    rewards: v.number(),
    claimableRewards: v.number(),
    apy: v.number(),
    lockPeriod: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    autoCompound: v.boolean(),
    stakedAt: v.number(),
    lastClaimAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_pool", ["poolId"]),

  // ============================================================================
  // SYSTEM TABLES
  // ============================================================================

  /**
   * Audit Log - Immutable audit trail
   */
  auditLog: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    changes: v.optional(v.any()),
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    requestId: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId", "timestamp"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_action", ["action", "timestamp"]),

  /**
   * Webhook Events - Incoming webhook log
   */
  webhookEvents: defineTable({
    source: v.string(),
    eventType: v.string(),
    externalId: v.optional(v.string()),
    payload: v.any(),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    receivedAt: v.number(),
  })
    .index("by_source", ["source", "eventType"])
    .index("by_status", ["status"])
    .index("by_external", ["source", "externalId"]),

  /**
   * Agent Memory - AI agent context storage
   */
  agentMemory: defineTable({
    userId: v.id("users"),
    agentType: v.string(),
    sessionId: v.optional(v.string()),
    key: v.string(),
    value: v.any(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_agent", ["userId", "agentType"])
    .index("by_session", ["sessionId"])
    .index("by_key", ["userId", "agentType", "key"])
    .vectorIndex("embedding_index", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId", "agentType"],
    }),
});
