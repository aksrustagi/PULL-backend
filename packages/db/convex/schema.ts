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

  // ============================================================================
  // FANTASY FOOTBALL TABLES
  // ============================================================================

  /**
   * Fantasy Leagues - League configuration and settings
   */
  fantasyLeagues: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    commissionerId: v.id("users"),
    inviteCode: v.string(),
    logoUrl: v.optional(v.string()),

    // League settings
    scoringType: v.union(
      v.literal("ppr"),
      v.literal("half_ppr"),
      v.literal("standard")
    ),
    draftType: v.union(
      v.literal("snake"),
      v.literal("auction"),
      v.literal("dynasty"),
      v.literal("keeper")
    ),
    maxTeams: v.number(),
    currentTeams: v.number(),
    rosterPositions: v.object({
      qb: v.number(),
      rb: v.number(),
      wr: v.number(),
      te: v.number(),
      flex: v.number(),
      k: v.number(),
      def: v.number(),
      bench: v.number(),
      ir: v.number(),
    }),

    // Scoring rules (customizable)
    scoringRules: v.object({
      passingYardsPerPoint: v.number(),
      passingTd: v.number(),
      interception: v.number(),
      rushingYardsPerPoint: v.number(),
      rushingTd: v.number(),
      receivingYardsPerPoint: v.number(),
      receivingTd: v.number(),
      reception: v.number(),
      fumble: v.number(),
      fgMade: v.number(),
      fgMissed: v.number(),
      extraPoint: v.number(),
      sack: v.number(),
      defenseInterception: v.number(),
      fumbleRecovery: v.number(),
      defenseTd: v.number(),
      safety: v.number(),
      pointsAllowed0: v.number(),
      pointsAllowed1_6: v.number(),
      pointsAllowed7_13: v.number(),
      pointsAllowed14_20: v.number(),
      pointsAllowed21_27: v.number(),
      pointsAllowed28_34: v.number(),
      pointsAllowed35Plus: v.number(),
    }),

    // Waiver settings
    waiverType: v.union(
      v.literal("faab"),
      v.literal("rolling"),
      v.literal("reverse_standings")
    ),
    waiverBudget: v.number(),
    waiverProcessDay: v.number(),

    // Trade settings
    tradeDeadlineWeek: v.optional(v.number()),
    tradeReviewPeriodHours: v.number(),
    vetoVotesRequired: v.number(),

    // Season info
    season: v.string(),
    currentWeek: v.number(),
    regularSeasonWeeks: v.number(),
    playoffTeams: v.number(),
    playoffWeeks: v.number(),

    // Status
    status: v.union(
      v.literal("drafting"),
      v.literal("pre_draft"),
      v.literal("active"),
      v.literal("playoffs"),
      v.literal("complete"),
      v.literal("archived")
    ),

    // Matrix integration
    matrixRoomId: v.optional(v.string()),

    // Timestamps
    draftScheduledAt: v.optional(v.number()),
    draftCompletedAt: v.optional(v.number()),
    seasonStartAt: v.optional(v.number()),
    seasonEndAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_commissioner", ["commissionerId"])
    .index("by_invite_code", ["inviteCode"])
    .index("by_status", ["status"])
    .index("by_season", ["season", "status"])
    .searchIndex("search_leagues", {
      searchField: "name",
      filterFields: ["status", "season"],
    }),

  /**
   * Fantasy Teams - Teams within leagues
   */
  fantasyTeams: defineTable({
    leagueId: v.id("fantasyLeagues"),
    ownerId: v.id("users"),
    name: v.string(),
    logoUrl: v.optional(v.string()),

    // Draft info
    draftPosition: v.optional(v.number()),
    auctionBudgetRemaining: v.optional(v.number()),

    // Waiver info
    waiverPriority: v.number(),
    faabBudget: v.number(),
    faabSpent: v.number(),

    // Record
    wins: v.number(),
    losses: v.number(),
    ties: v.number(),
    pointsFor: v.number(),
    pointsAgainst: v.number(),

    // Standings
    rank: v.optional(v.number()),
    playoffSeed: v.optional(v.number()),
    isEliminated: v.boolean(),
    isPlayoffBound: v.boolean(),

    // Weekly info
    projectedPoints: v.number(),
    currentWeekPoints: v.number(),
    streak: v.string(),

    // Timestamps
    joinedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_owner", ["ownerId"])
    .index("by_league_owner", ["leagueId", "ownerId"])
    .index("by_league_rank", ["leagueId", "rank"]),

  /**
   * Fantasy Players - NFL player database
   */
  fantasyPlayers: defineTable({
    externalId: v.string(),
    source: v.union(v.literal("espn"), v.literal("sportsradar"), v.literal("manual")),

    // Basic info
    name: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    position: v.union(
      v.literal("QB"),
      v.literal("RB"),
      v.literal("WR"),
      v.literal("TE"),
      v.literal("K"),
      v.literal("DEF")
    ),
    nflTeam: v.string(),
    nflTeamId: v.optional(v.string()),
    jerseyNumber: v.optional(v.number()),
    headshotUrl: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("injured_reserve"),
      v.literal("out"),
      v.literal("doubtful"),
      v.literal("questionable"),
      v.literal("probable"),
      v.literal("suspended"),
      v.literal("practice_squad"),
      v.literal("free_agent")
    ),
    injuryStatus: v.optional(v.string()),
    injuryBodyPart: v.optional(v.string()),
    injuryNotes: v.optional(v.string()),

    // Season info
    byeWeek: v.number(),
    experience: v.optional(v.number()),
    age: v.optional(v.number()),
    college: v.optional(v.string()),
    height: v.optional(v.string()),
    weight: v.optional(v.number()),

    // Ownership
    percentOwned: v.number(),
    percentStarted: v.number(),
    adp: v.optional(v.number()),

    // Projections (current week)
    projectedPoints: v.number(),
    projectedPointsPpr: v.number(),
    projectedPointsHalfPpr: v.number(),

    // Season stats
    seasonPoints: v.number(),
    seasonPointsPpr: v.number(),
    seasonPointsHalfPpr: v.number(),
    gamesPlayed: v.number(),
    averagePoints: v.number(),

    // Sync
    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_external", ["source", "externalId"])
    .index("by_position", ["position", "status"])
    .index("by_team", ["nflTeam"])
    .index("by_ownership", ["percentOwned"])
    .searchIndex("search_players", {
      searchField: "name",
      filterFields: ["position", "nflTeam", "status"],
    }),

  /**
   * Fantasy Player Stats - Weekly player statistics
   */
  fantasyPlayerStats: defineTable({
    playerId: v.id("fantasyPlayers"),
    season: v.string(),
    week: v.number(),
    gameId: v.optional(v.string()),

    // Game info
    opponent: v.string(),
    isHome: v.boolean(),
    gameStatus: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("final"),
      v.literal("postponed"),
      v.literal("bye")
    ),

    // Passing stats
    passingAttempts: v.number(),
    passingCompletions: v.number(),
    passingYards: v.number(),
    passingTouchdowns: v.number(),
    interceptions: v.number(),
    sacks: v.number(),
    sackYardsLost: v.number(),

    // Rushing stats
    rushingAttempts: v.number(),
    rushingYards: v.number(),
    rushingTouchdowns: v.number(),

    // Receiving stats
    targets: v.number(),
    receptions: v.number(),
    receivingYards: v.number(),
    receivingTouchdowns: v.number(),

    // Misc offense
    fumbles: v.number(),
    fumblesLost: v.number(),
    twoPointConversions: v.number(),

    // Kicking stats
    fgAttempts: v.number(),
    fgMade: v.number(),
    fg0_39: v.number(),
    fg40_49: v.number(),
    fg50Plus: v.number(),
    xpAttempts: v.number(),
    xpMade: v.number(),

    // Defense stats (for DEF position)
    defSacks: v.number(),
    defInterceptions: v.number(),
    defFumbleRecoveries: v.number(),
    defTouchdowns: v.number(),
    defSafeties: v.number(),
    defBlockedKicks: v.number(),
    defPointsAllowed: v.number(),
    defYardsAllowed: v.number(),

    // Calculated points
    pointsStandard: v.number(),
    pointsHalfPpr: v.number(),
    pointsPpr: v.number(),

    // Sync
    lastSyncAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_player", ["playerId"])
    .index("by_player_week", ["playerId", "season", "week"])
    .index("by_season_week", ["season", "week"]),

  /**
   * Fantasy Rosters - Player-to-team assignments
   */
  fantasyRosters: defineTable({
    teamId: v.id("fantasyTeams"),
    playerId: v.id("fantasyPlayers"),
    leagueId: v.id("fantasyLeagues"),

    // Slot assignment
    slot: v.union(
      v.literal("QB"),
      v.literal("RB1"),
      v.literal("RB2"),
      v.literal("WR1"),
      v.literal("WR2"),
      v.literal("TE"),
      v.literal("FLEX"),
      v.literal("K"),
      v.literal("DEF"),
      v.literal("BN1"),
      v.literal("BN2"),
      v.literal("BN3"),
      v.literal("BN4"),
      v.literal("BN5"),
      v.literal("BN6"),
      v.literal("IR")
    ),
    isStarter: v.boolean(),
    isLocked: v.boolean(),

    // Acquisition info
    acquisitionType: v.union(
      v.literal("draft"),
      v.literal("waiver"),
      v.literal("free_agent"),
      v.literal("trade")
    ),
    acquisitionCost: v.optional(v.number()),
    acquisitionDate: v.number(),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("pending_drop"),
      v.literal("pending_trade")
    ),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_player", ["playerId"])
    .index("by_league", ["leagueId"])
    .index("by_team_slot", ["teamId", "slot"])
    .index("by_league_player", ["leagueId", "playerId"]),

  /**
   * Fantasy Matchups - Weekly head-to-head matchups
   */
  fantasyMatchups: defineTable({
    leagueId: v.id("fantasyLeagues"),
    season: v.string(),
    week: v.number(),

    // Teams
    teamAId: v.id("fantasyTeams"),
    teamBId: v.id("fantasyTeams"),

    // Scores
    teamAScore: v.number(),
    teamBScore: v.number(),
    teamAProjected: v.number(),
    teamBProjected: v.number(),

    // Status
    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("final")
    ),

    // Playoff info
    isPlayoff: v.boolean(),
    playoffRound: v.optional(v.number()),
    playoffSeed: v.optional(v.string()),

    // Winner
    winnerId: v.optional(v.id("fantasyTeams")),
    isTie: v.boolean(),
    margin: v.number(),

    // Timestamps
    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_week", ["leagueId", "week"])
    .index("by_team_a", ["teamAId"])
    .index("by_team_b", ["teamBId"])
    .index("by_status", ["status"]),

  /**
   * Fantasy Markets - Prediction markets for fantasy
   */
  fantasyMarkets: defineTable({
    leagueId: v.optional(v.id("fantasyLeagues")),
    type: v.union(
      v.literal("matchup"),
      v.literal("league_winner"),
      v.literal("player_prop"),
      v.literal("weekly_high_score"),
      v.literal("division_winner"),
      v.literal("over_under"),
      v.literal("custom")
    ),

    // Market details
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),

    // Reference to related entity
    referenceType: v.optional(
      v.union(
        v.literal("matchup"),
        v.literal("player"),
        v.literal("team"),
        v.literal("league")
      )
    ),
    referenceId: v.optional(v.string()),

    // Timing
    week: v.optional(v.number()),
    season: v.string(),

    // Outcomes
    outcomes: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        description: v.optional(v.string()),
        odds: v.number(),
        impliedProbability: v.number(),
        totalVolume: v.number(),
      })
    ),

    // LMSR market maker parameters
    liquidityParameter: v.number(),
    totalLiquidity: v.number(),
    totalVolume: v.number(),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("cancelled"),
      v.literal("voided")
    ),

    // Settlement
    winningOutcomeId: v.optional(v.string()),
    settlementValue: v.optional(v.number()),
    settlementNotes: v.optional(v.string()),

    // Timing
    opensAt: v.number(),
    closesAt: v.number(),
    settlesAt: v.optional(v.number()),

    // Creator
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_type", ["type", "status"])
    .index("by_status", ["status"])
    .index("by_week", ["season", "week"])
    .searchIndex("search_markets", {
      searchField: "title",
      filterFields: ["type", "status"],
    }),

  /**
   * Fantasy Bets - User bets on fantasy markets
   */
  fantasyBets: defineTable({
    userId: v.id("users"),
    marketId: v.id("fantasyMarkets"),
    leagueId: v.optional(v.id("fantasyLeagues")),

    // Bet details
    outcomeId: v.string(),
    outcomeLabel: v.string(),
    amount: v.number(),
    oddsAtPlacement: v.number(),
    impliedProbabilityAtPlacement: v.number(),
    potentialPayout: v.number(),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("won"),
      v.literal("lost"),
      v.literal("cashed_out"),
      v.literal("voided"),
      v.literal("refunded")
    ),

    // Settlement
    settledAmount: v.optional(v.number()),
    profitLoss: v.optional(v.number()),
    settledAt: v.optional(v.number()),

    // Cash out
    cashedOutAmount: v.optional(v.number()),
    cashedOutAt: v.optional(v.number()),

    // Timestamps
    placedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_market", ["marketId"])
    .index("by_league", ["leagueId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_market", ["userId", "marketId"]),

  /**
   * Fantasy Transactions - Waivers, trades, adds/drops
   */
  fantasyTransactions: defineTable({
    leagueId: v.id("fantasyLeagues"),
    type: v.union(
      v.literal("add"),
      v.literal("drop"),
      v.literal("waiver_claim"),
      v.literal("trade"),
      v.literal("commissioner_action")
    ),

    // Initiator
    initiatorId: v.id("users"),
    initiatorTeamId: v.id("fantasyTeams"),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("vetoed")
    ),

    // Transaction details (varies by type)
    details: v.object({
      // For add/drop
      addPlayerId: v.optional(v.string()),
      addPlayerName: v.optional(v.string()),
      dropPlayerId: v.optional(v.string()),
      dropPlayerName: v.optional(v.string()),

      // For waiver
      waiverPriority: v.optional(v.number()),
      faabBid: v.optional(v.number()),
      waiverType: v.optional(v.string()),

      // For trade
      tradePartnerTeamId: v.optional(v.string()),
      tradePartnerUserId: v.optional(v.string()),
      playersOffered: v.optional(v.array(v.string())),
      playersRequested: v.optional(v.array(v.string())),
      draftPicksOffered: v.optional(v.array(v.string())),
      draftPicksRequested: v.optional(v.array(v.string())),
      faabOffered: v.optional(v.number()),
      faabRequested: v.optional(v.number()),

      // For commissioner action
      actionType: v.optional(v.string()),
      reason: v.optional(v.string()),
    }),

    // Votes (for trades)
    vetoVotes: v.number(),
    approveVotes: v.number(),
    voterIds: v.array(v.string()),

    // Processing
    processAfter: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    processedBy: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),

    // Timestamps
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_initiator", ["initiatorId"])
    .index("by_team", ["initiatorTeamId"])
    .index("by_status", ["status"])
    .index("by_league_status", ["leagueId", "status"])
    .index("by_type", ["type", "status"]),

  /**
   * Fantasy Drafts - Draft configuration and state
   */
  fantasyDrafts: defineTable({
    leagueId: v.id("fantasyLeagues"),
    type: v.union(
      v.literal("snake"),
      v.literal("auction"),
      v.literal("linear")
    ),

    // Status
    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("cancelled")
    ),

    // Configuration
    secondsPerPick: v.number(),
    auctionBudget: v.optional(v.number()),

    // Draft order (team IDs in order)
    draftOrder: v.array(v.string()),
    currentRound: v.number(),
    currentPick: v.number(),
    currentTeamId: v.optional(v.string()),

    // Timing
    pickDeadline: v.optional(v.number()),
    totalPicks: v.number(),
    completedPicks: v.number(),

    // Timestamps
    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_status", ["status"]),

  /**
   * Fantasy Draft Picks - Individual draft selections
   */
  fantasyDraftPicks: defineTable({
    draftId: v.id("fantasyDrafts"),
    leagueId: v.id("fantasyLeagues"),
    teamId: v.id("fantasyTeams"),
    playerId: v.id("fantasyPlayers"),

    // Pick info
    round: v.number(),
    pick: v.number(),
    overallPick: v.number(),

    // Auction specific
    auctionAmount: v.optional(v.number()),
    nominatedBy: v.optional(v.string()),

    // Auto-pick
    isAutoPick: v.boolean(),
    autoPickReason: v.optional(v.string()),

    // Player snapshot at draft time
    playerName: v.string(),
    playerPosition: v.string(),
    playerTeam: v.string(),
    adpAtDraft: v.optional(v.number()),

    // Timestamps
    pickedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_draft", ["draftId"])
    .index("by_league", ["leagueId"])
    .index("by_team", ["teamId"])
    .index("by_player", ["playerId"])
    .index("by_draft_pick", ["draftId", "overallPick"]),

  /**
   * Fantasy League Members - League membership and settings
   */
  fantasyLeagueMembers: defineTable({
    leagueId: v.id("fantasyLeagues"),
    userId: v.id("users"),
    teamId: v.optional(v.id("fantasyTeams")),

    // Role
    role: v.union(
      v.literal("commissioner"),
      v.literal("co_commissioner"),
      v.literal("member")
    ),

    // Status
    status: v.union(
      v.literal("invited"),
      v.literal("pending"),
      v.literal("active"),
      v.literal("left"),
      v.literal("removed")
    ),

    // Notification preferences
    notificationPreferences: v.object({
      tradeOffers: v.boolean(),
      waiverResults: v.boolean(),
      scoreUpdates: v.boolean(),
      chatMessages: v.boolean(),
      leagueNews: v.boolean(),
    }),

    // Timestamps
    invitedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_user", ["userId"])
    .index("by_league_user", ["leagueId", "userId"])
    .index("by_status", ["status"]),
});
