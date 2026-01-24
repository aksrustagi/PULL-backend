import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PULL Super App - Convex Database Schema
 * 42 tables covering all platform features including Social Trading Graph
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
    .index("by_referrer", ["referredBy"])
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
   * KYC Records - Comprehensive KYC verification records
   */
  kycRecords: defineTable({
    userId: v.id("users"),

    // Tier tracking
    currentTier: v.union(
      v.literal("none"),
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("accredited")
    ),
    targetTier: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("accredited")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),

    // Sumsub
    sumsubApplicantId: v.optional(v.string()),
    sumsubReviewStatus: v.optional(v.string()),
    sumsubReviewResult: v.optional(v.string()),
    sumsubCompletedAt: v.optional(v.number()),

    // Checkr
    checkrCandidateId: v.optional(v.string()),
    checkrReportId: v.optional(v.string()),
    checkrStatus: v.optional(v.string()),
    checkrResult: v.optional(v.string()),
    checkrCompletedAt: v.optional(v.number()),

    // Parallel Markets
    parallelRequestId: v.optional(v.string()),
    accreditationStatus: v.optional(v.string()),
    accreditationMethod: v.optional(v.string()),
    accreditationExpiresAt: v.optional(v.number()),

    // Plaid
    plaidItemId: v.optional(v.string()),
    plaidAccessToken: v.optional(v.string()),
    plaidAccountId: v.optional(v.string()),
    bankLinked: v.boolean(),

    // Sanctions
    sanctionsScreeningId: v.optional(v.string()),
    sanctionsResult: v.optional(v.string()),
    sanctionsRiskScore: v.optional(v.number()),

    // Metadata
    rejectionReason: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_sumsub", ["sumsubApplicantId"])
    .index("by_checkr", ["checkrReportId"])
    .index("by_parallel", ["parallelRequestId"]),

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
    version: v.optional(v.number()), // For optimistic concurrency control
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
  // SOCIAL TRADING GRAPH TABLES
  // ============================================================================

  /**
   * Follows - Follower/following relationships between traders
   */
  follows: defineTable({
    followerId: v.id("users"),
    followeeId: v.id("users"),
    notificationsEnabled: v.boolean(),
    positionVisibility: v.union(
      v.literal("all"),
      v.literal("entry_only"),
      v.literal("none")
    ),
    followedAt: v.number(),
    unfollowedAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_follower", ["followerId", "isActive"])
    .index("by_followee", ["followeeId", "isActive"])
    .index("by_pair", ["followerId", "followeeId"]),

  /**
   * Trader Profiles - Extended profiles for traders with public track records
   */
  traderProfiles: defineTable({
    userId: v.id("users"),
    isPublic: v.boolean(),
    allowCopyTrading: v.boolean(),
    allowAutoCopy: v.boolean(),
    copyTradingFee: v.number(),
    performanceFee: v.number(),
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
    twitterHandle: v.optional(v.string()),
    discordHandle: v.optional(v.string()),
    telegramHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    isVerified: v.boolean(),
    verifiedAt: v.optional(v.number()),
    verificationBadges: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_public", ["isPublic", "allowCopyTrading"])
    .index("by_verified", ["isVerified"]),

  /**
   * Trader Stats - Performance statistics calculated from actual trades
   */
  traderStats: defineTable({
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
    totalTrades: v.number(),
    winningTrades: v.number(),
    losingTrades: v.number(),
    winRate: v.number(),
    totalPnL: v.number(),
    totalPnLPercent: v.number(),
    avgPnLPerTrade: v.number(),
    avgWinAmount: v.number(),
    avgLossAmount: v.number(),
    largestWin: v.number(),
    largestLoss: v.number(),
    sharpeRatio: v.number(),
    sortinoRatio: v.number(),
    maxDrawdown: v.number(),
    maxDrawdownPercent: v.number(),
    volatility: v.number(),
    calmarRatio: v.number(),
    totalVolume: v.number(),
    avgPositionSize: v.number(),
    avgHoldingPeriod: v.number(),
    currentWinStreak: v.number(),
    currentLossStreak: v.number(),
    longestWinStreak: v.number(),
    longestLossStreak: v.number(),
    assetBreakdown: v.optional(v.any()),
    calculatedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "period"])
    .index("by_period", ["period", "periodStart"])
    .index("by_user_period_date", ["userId", "period", "periodStart"]),

  /**
   * Reputation Scores - Composite reputation based on verified track record
   */
  reputationScores: defineTable({
    userId: v.id("users"),
    overallScore: v.number(),
    performanceScore: v.number(),
    consistencyScore: v.number(),
    riskManagementScore: v.number(),
    transparencyScore: v.number(),
    socialScore: v.number(),
    longevityScore: v.number(),
    tier: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold"),
      v.literal("platinum"),
      v.literal("diamond"),
      v.literal("legend")
    ),
    badges: v.array(v.object({
      type: v.string(),
      name: v.string(),
      earnedAt: v.number(),
    })),
    verifiedReturns: v.boolean(),
    auditedBy: v.optional(v.string()),
    lastAuditAt: v.optional(v.number()),
    fraudRiskScore: v.number(),
    suspiciousActivityCount: v.number(),
    lastReviewAt: v.optional(v.number()),
    calculatedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tier", ["tier", "overallScore"])
    .index("by_score", ["overallScore"]),

  /**
   * Copy Trading Subscriptions - Auto-copy configurations
   */
  copyTradingSubscriptions: defineTable({
    copierId: v.id("users"),
    traderId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("cancelled")
    ),
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
    excludedSymbols: v.array(v.string()),
    copyDelaySeconds: v.number(),
    totalCopiedTrades: v.number(),
    totalPnL: v.number(),
    totalFeesPaid: v.number(),
    subscribedAt: v.number(),
    pausedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_copier", ["copierId", "status"])
    .index("by_trader", ["traderId", "status"])
    .index("by_pair", ["copierId", "traderId"]),

  /**
   * Copy Trades - Individual copy trade execution records
   */
  copyTrades: defineTable({
    subscriptionId: v.id("copyTradingSubscriptions"),
    copierId: v.id("users"),
    traderId: v.id("users"),
    originalOrderId: v.id("orders"),
    originalTradeId: v.optional(v.id("trades")),
    copyOrderId: v.optional(v.id("orders")),
    copyTradeId: v.optional(v.id("trades")),
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
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    originalQuantity: v.number(),
    originalPrice: v.number(),
    copyQuantity: v.number(),
    copyPrice: v.optional(v.number()),
    slippage: v.optional(v.number()),
    copyFee: v.number(),
    performanceFee: v.number(),
    pnl: v.optional(v.number()),
    pnlPercent: v.optional(v.number()),
    originalExecutedAt: v.number(),
    copyExecutedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId", "status"])
    .index("by_copier", ["copierId", "createdAt"])
    .index("by_trader", ["traderId", "createdAt"])
    .index("by_original_order", ["originalOrderId"]),

  /**
   * Position Comments - Comments and analysis on positions
   */
  positionComments: defineTable({
    positionId: v.optional(v.id("positions")),
    orderId: v.optional(v.id("orders")),
    tradeId: v.optional(v.id("trades")),
    authorId: v.id("users"),
    traderId: v.id("users"),
    content: v.string(),
    contentType: v.union(
      v.literal("text"),
      v.literal("analysis"),
      v.literal("thesis"),
      v.literal("update"),
      v.literal("exit_rationale")
    ),
    attachments: v.array(v.object({
      type: v.union(v.literal("image"), v.literal("chart"), v.literal("link")),
      url: v.string(),
      title: v.optional(v.string()),
    })),
    likesCount: v.number(),
    repliesCount: v.number(),
    parentCommentId: v.optional(v.id("positionComments")),
    isEdited: v.boolean(),
    isDeleted: v.boolean(),
    isPinned: v.boolean(),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_position", ["positionId", "isDeleted"])
    .index("by_order", ["orderId", "isDeleted"])
    .index("by_trade", ["tradeId", "isDeleted"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_trader", ["traderId", "createdAt"])
    .index("by_parent", ["parentCommentId"]),

  /**
   * Comment Likes - Likes on position comments
   */
  commentLikes: defineTable({
    commentId: v.id("positionComments"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user", ["userId"])
    .index("by_pair", ["commentId", "userId"]),

  /**
   * Trading Rooms - Group trading spaces with shared positions
   */
  tradingRooms: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
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
    subscriptionPrice: v.optional(v.number()),
    subscriptionPeriod: v.optional(v.union(
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    )),
    ownerId: v.id("users"),
    moderatorIds: v.array(v.id("users")),
    tradingFocus: v.array(v.string()),
    assetClasses: v.array(v.string()),
    settings: v.object({
      allowPositionSharing: v.boolean(),
      allowCopyTrades: v.boolean(),
      positionDelay: v.number(),
      requireVerifiedTraders: v.boolean(),
      minReputationScore: v.number(),
    }),
    memberCount: v.number(),
    activeMembers: v.number(),
    totalPositionsShared: v.number(),
    totalMessages: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("suspended")
    ),
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
    }),

  /**
   * Trading Room Members - Room membership records
   */
  tradingRoomMembers: defineTable({
    roomId: v.id("tradingRooms"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("moderator"),
      v.literal("contributor"),
      v.literal("member"),
      v.literal("viewer")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("banned"),
      v.literal("left")
    ),
    canPost: v.boolean(),
    canSharePositions: v.boolean(),
    canInvite: v.boolean(),
    notificationsEnabled: v.boolean(),
    notificationLevel: v.union(
      v.literal("all"),
      v.literal("mentions"),
      v.literal("positions_only"),
      v.literal("none")
    ),
    lastReadAt: v.optional(v.number()),
    lastPostAt: v.optional(v.number()),
    positionsSharedCount: v.number(),
    messagesCount: v.number(),
    subscriptionId: v.optional(v.string()),
    subscriptionExpiresAt: v.optional(v.number()),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    bannedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_room", ["roomId", "status"])
    .index("by_user", ["userId", "status"])
    .index("by_room_user", ["roomId", "userId"]),

  /**
   * Trading Room Messages - Messages in trading rooms
   */
  tradingRoomMessages: defineTable({
    roomId: v.id("tradingRooms"),
    senderId: v.id("users"),
    type: v.union(
      v.literal("text"),
      v.literal("position_share"),
      v.literal("trade_share"),
      v.literal("analysis"),
      v.literal("alert"),
      v.literal("system")
    ),
    content: v.string(),
    formattedContent: v.optional(v.string()),
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
    attachments: v.array(v.object({
      type: v.string(),
      url: v.string(),
      name: v.optional(v.string()),
      size: v.optional(v.number()),
    })),
    likesCount: v.number(),
    repliesCount: v.number(),
    copyCount: v.number(),
    replyToId: v.optional(v.id("tradingRoomMessages")),
    isEdited: v.boolean(),
    isDeleted: v.boolean(),
    isPinned: v.boolean(),
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
    }),

  /**
   * Leaderboard Snapshots - Periodic leaderboard snapshots
   */
  leaderboardSnapshots: defineTable({
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
    periodStart: v.number(),
    periodEnd: v.number(),
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
    totalParticipants: v.number(),
    minQualifyingValue: v.optional(v.number()),
    calculatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_type_period", ["leaderboardType", "period", "periodStart"])
    .index("by_period_date", ["period", "periodStart"]),

  /**
   * User Leaderboard History - Individual user's leaderboard positions over time
   */
  userLeaderboardHistory: defineTable({
    userId: v.id("users"),
    leaderboardType: v.string(),
    period: v.string(),
    rank: v.number(),
    value: v.number(),
    percentile: v.number(),
    snapshotId: v.id("leaderboardSnapshots"),
    periodStart: v.number(),
    recordedAt: v.number(),
  })
    .index("by_user", ["userId", "leaderboardType", "period"])
    .index("by_user_type_date", ["userId", "leaderboardType", "periodStart"]),

  /**
   * Fraud Alerts - Suspected fraudulent activity
   */
  fraudAlerts: defineTable({
    userId: v.id("users"),
    alertType: v.union(
      v.literal("wash_trading"),
      v.literal("manipulation"),
      v.literal("front_running"),
      v.literal("fake_performance"),
      v.literal("collusion"),
      v.literal("unusual_activity"),
      v.literal("bot_behavior")
    ),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    detectionMethod: v.string(),
    confidence: v.number(),
    evidence: v.array(v.object({
      type: v.string(),
      description: v.string(),
      data: v.any(),
      timestamp: v.number(),
    })),
    relatedOrderIds: v.array(v.id("orders")),
    relatedTradeIds: v.array(v.id("trades")),
    relatedUserIds: v.array(v.id("users")),
    status: v.union(
      v.literal("pending"),
      v.literal("investigating"),
      v.literal("confirmed"),
      v.literal("dismissed"),
      v.literal("resolved")
    ),
    reviewedBy: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
    resolution: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "status"])
    .index("by_status", ["status", "severity"])
    .index("by_type", ["alertType", "status"]),

  /**
   * Trading Patterns - Analyzed trading patterns for ML/fraud detection
   */
  tradingPatterns: defineTable({
    userId: v.id("users"),
    periodStart: v.number(),
    periodEnd: v.number(),
    features: v.object({
      avgTimeBetweenTrades: v.number(),
      stdTimeBetweenTrades: v.number(),
      peakTradingHours: v.array(v.number()),
      avgOrderSize: v.number(),
      stdOrderSize: v.number(),
      medianOrderSize: v.number(),
      avgPriceImprovement: v.number(),
      avgSlippage: v.number(),
      limitOrderFillRate: v.number(),
      cancelToFillRatio: v.number(),
      selfTradeRatio: v.number(),
      roundTripRatio: v.number(),
      consecutiveSameSideRatio: v.number(),
      winAfterLossRatio: v.number(),
      lossAfterWinRatio: v.number(),
      streakCorrelation: v.number(),
    }),
    alphaScore: v.number(),
    luckScore: v.number(),
    skillScore: v.number(),
    manipulationScore: v.number(),
    calculatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_period", ["userId", "periodStart"]),

  /**
   * Social Activity - Activity feed items
   */
  socialActivity: defineTable({
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
    relatedUserIds: v.array(v.id("users")),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_actor", ["actorId", "createdAt"])
    .index("by_type", ["type", "createdAt"])
    .index("by_visibility", ["visibility", "createdAt"]),

  /**
   * User Feed Cache - Precomputed feed items per user
   */
  userFeedCache: defineTable({
    userId: v.id("users"),
    activityId: v.id("socialActivity"),
    actorId: v.id("users"),
    feedType: v.union(
      v.literal("following"),
      v.literal("discover"),
      v.literal("notifications")
    ),
    type: v.string(),
    data: v.any(),
    isRead: v.boolean(),
    activityAt: v.number(),
    cachedAt: v.number(),
  })
    .index("by_user_feed", ["userId", "feedType", "activityAt"])
    .index("by_user_unread", ["userId", "feedType", "isRead"]),

  // ============================================================================
  // AI SIGNAL DETECTION TABLES
  // ============================================================================

  /**
   * Signals - AI-detected trading signals from multiple sources
   */
  signals: defineTable({
    signalId: v.string(), // Unique external ID
    type: v.union(
      v.literal("email"),
      v.literal("social"),
      v.literal("market"),
      v.literal("news"),
      v.literal("correlation")
    ),
    source: v.string(), // e.g., "email:user@example.com", "market:BTC-USD"
    title: v.string(),
    description: v.string(),
    confidence: v.number(), // 0-100
    sentiment: v.union(
      v.literal("bullish"),
      v.literal("bearish"),
      v.literal("neutral")
    ),
    urgency: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    relatedMarkets: v.array(v.string()), // Market tickers
    relatedAssets: v.array(v.string()), // Asset symbols
    metadata: v.optional(v.any()), // Type-specific metadata
    expiresAt: v.optional(v.number()), // When signal becomes stale
    createdAt: v.number(),
  })
    .index("by_signalId", ["signalId"])
    .index("by_type", ["type"])
    .index("by_urgency", ["urgency"])
    .searchIndex("search_signals", {
      searchField: "title",
      filterFields: ["type", "urgency", "sentiment"],
    }),

  /**
   * UserSignals - Junction table linking signals to users with relevance
   */
  userSignals: defineTable({
    userId: v.id("users"),
    signalId: v.id("signals"),
    relevanceScore: v.number(), // 0-100, how relevant this signal is to user
    seen: v.boolean(),
    dismissed: v.boolean(),
    actedOn: v.boolean(), // Did user take action based on this signal?
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_signal", ["signalId"])
    .index("by_user_unseen", ["userId", "seen"]),

  /**
   * MarketCorrelations - Detected correlations between markets
   */
  marketCorrelations: defineTable({
    marketA: v.string(), // Always alphabetically first
    marketB: v.string(), // Always alphabetically second
    correlation: v.number(), // -1 to 1, Pearson correlation coefficient
    sampleSize: v.number(), // Number of data points used
    pValue: v.number(), // Statistical significance
    updatedAt: v.number(),
  })
    .index("by_marketA", ["marketA"])
    .index("by_marketB", ["marketB"])
    .index("by_pair", ["marketA", "marketB"])
    .index("by_correlation", ["correlation"]),

  /**
   * UserInsights - Personalized AI-generated insights for users
   */
  userInsights: defineTable({
    userId: v.id("users"),
    insightType: v.string(), // "portfolio", "opportunity", "risk", "trend", "social"
    title: v.string(),
    content: v.string(),
    priority: v.number(), // 1-5, higher is more important
    relatedSignals: v.array(v.id("signals")),
    dismissed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "dismissed"]),

  /**
   * SignalProcessingLog - Track what sources have been processed
   */
  signalProcessingLog: defineTable({
    sourceType: v.string(), // "email", "chat_room", "market_data"
    sourceId: v.string(), // External ID of the source
    userId: v.optional(v.id("users")), // Relevant user if applicable
    signalsGenerated: v.number(), // How many signals were created
    processedAt: v.number(),
  })
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_user", ["userId", "processedAt"]),

  // ============================================================================
  // AUTONOMOUS PORTFOLIO AGENT TABLES
  // ============================================================================

  /**
   * Portfolio Agent Configurations - Per-user agent settings and activation
   */
  portfolioAgentConfigs: defineTable({
    userId: v.id("users"),
    isActive: v.boolean(),
    riskTolerance: v.union(
      v.literal("conservative"),
      v.literal("moderate"),
      v.literal("aggressive")
    ),
    maxDailyTradeAmount: v.number(), // Max USD value of trades per day
    maxPositionSize: v.number(), // Max % of portfolio per position
    autoExecute: v.boolean(), // Execute without confirmation (pre-approved)
    requireConfirmationAbove: v.number(), // USD threshold requiring manual approval
    allowedAssetClasses: v.array(v.union(
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("crypto")
    )),
    allowedStrategies: v.array(v.union(
      v.literal("dca"),
      v.literal("rebalance"),
      v.literal("stop_loss"),
      v.literal("take_profit"),
      v.literal("opportunistic_buy")
    )),
    morningBriefEnabled: v.boolean(),
    morningBriefTime: v.string(), // HH:MM format in user timezone
    timezone: v.string(),
    notifyOnExecution: v.boolean(),
    notifyOnOpportunity: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_active", ["isActive"]),

  /**
   * Portfolio Strategies - Active automated strategies for users
   */
  portfolioStrategies: defineTable({
    userId: v.id("users"),
    configId: v.id("portfolioAgentConfigs"),
    type: v.union(
      v.literal("dca"),
      v.literal("rebalance"),
      v.literal("stop_loss"),
      v.literal("take_profit"),
      v.literal("opportunistic_buy")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    name: v.string(),
    description: v.optional(v.string()),

    // DCA-specific
    dcaAmount: v.optional(v.number()), // USD per interval
    dcaInterval: v.optional(v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly")
    )),
    dcaTargetSymbol: v.optional(v.string()),
    dcaTargetSide: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("buy"))),
    dcaTotalBudget: v.optional(v.number()),
    dcaSpentSoFar: v.optional(v.number()),

    // Rebalancing-specific
    rebalanceTargetAllocations: v.optional(v.array(v.object({
      symbol: v.string(),
      assetClass: v.string(),
      targetPercent: v.number(),
      tolerance: v.number(), // % deviation before triggering
    }))),
    rebalanceFrequency: v.optional(v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("threshold_only") // Only rebalance when tolerance exceeded
    )),

    // Stop-loss / Take-profit specific
    triggerSymbol: v.optional(v.string()),
    triggerSide: v.optional(v.union(v.literal("long"), v.literal("short"))),
    triggerPrice: v.optional(v.number()), // Price that triggers the action
    triggerType: v.optional(v.union(
      v.literal("absolute"),
      v.literal("percent_from_entry"),
      v.literal("trailing_percent")
    )),
    triggerValue: v.optional(v.number()), // % or $ value for trigger
    actionOnTrigger: v.optional(v.union(
      v.literal("sell_all"),
      v.literal("sell_half"),
      v.literal("sell_quarter"),
      v.literal("notify_only")
    )),

    // Opportunistic buy specific
    opportunitySymbol: v.optional(v.string()),
    opportunityMaxPrice: v.optional(v.number()),
    opportunityBudget: v.optional(v.number()),
    opportunityConditions: v.optional(v.string()), // AI-interpreted conditions

    // Execution tracking
    lastExecutedAt: v.optional(v.number()),
    nextExecutionAt: v.optional(v.number()),
    executionCount: v.number(),
    totalValueExecuted: v.number(),
    lastError: v.optional(v.string()),

    // Temporal workflow tracking
    workflowId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "status"])
    .index("by_config", ["configId"])
    .index("by_type", ["type", "status"])
    .index("by_next_execution", ["status", "nextExecutionAt"]),

  /**
   * Portfolio Agent Actions - Log of all actions taken or proposed by the agent
   */
  portfolioAgentActions: defineTable({
    userId: v.id("users"),
    strategyId: v.optional(v.id("portfolioStrategies")),
    type: v.union(
      v.literal("order_placed"),
      v.literal("order_proposed"),
      v.literal("rebalance_executed"),
      v.literal("stop_loss_triggered"),
      v.literal("take_profit_triggered"),
      v.literal("opportunity_detected"),
      v.literal("dca_executed"),
      v.literal("alert_sent"),
      v.literal("morning_brief_sent")
    ),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("executed"),
      v.literal("failed"),
      v.literal("expired")
    ),
    title: v.string(),
    description: v.string(),
    reasoning: v.optional(v.string()), // AI reasoning for the action

    // Order details if applicable
    orderDetails: v.optional(v.object({
      symbol: v.string(),
      side: v.string(),
      quantity: v.number(),
      price: v.optional(v.number()),
      estimatedCost: v.number(),
      assetClass: v.string(),
    })),
    orderId: v.optional(v.id("orders")),

    // Context that led to this action
    triggerContext: v.optional(v.object({
      signalIds: v.optional(v.array(v.string())),
      marketData: v.optional(v.any()),
      portfolioSnapshot: v.optional(v.any()),
    })),

    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()), // "user" or "auto"
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    executedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "status"])
    .index("by_strategy", ["strategyId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_pending", ["userId", "status", "createdAt"]),

  /**
   * Morning Briefs - AI-generated daily portfolio summaries
   */
  morningBriefs: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    status: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("sent"),
      v.literal("read"),
      v.literal("failed")
    ),

    // Portfolio summary
    portfolioSummary: v.object({
      totalValue: v.number(),
      dailyChange: v.number(),
      dailyChangePercent: v.number(),
      weeklyChange: v.number(),
      weeklyChangePercent: v.number(),
      topGainer: v.optional(v.object({
        symbol: v.string(),
        changePercent: v.number(),
      })),
      topLoser: v.optional(v.object({
        symbol: v.string(),
        changePercent: v.number(),
      })),
    }),

    // AI-generated content
    headline: v.string(), // Brief headline like "Portfolio up 12%"
    summary: v.string(), // 2-3 sentence summary
    highlights: v.array(v.object({
      type: v.union(
        v.literal("gain"),
        v.literal("loss"),
        v.literal("opportunity"),
        v.literal("risk"),
        v.literal("action_needed"),
        v.literal("market_event")
      ),
      title: v.string(),
      description: v.string(),
      actionable: v.boolean(),
      suggestedAction: v.optional(v.string()),
    })),

    // Opportunities detected
    opportunities: v.array(v.object({
      symbol: v.string(),
      assetClass: v.string(),
      description: v.string(),
      confidence: v.number(),
      estimatedUpside: v.optional(v.number()),
      suggestedAction: v.string(), // e.g., "Buy 5 shares at $2,400"
    })),

    // Strategy execution report
    strategyReport: v.optional(v.object({
      executedCount: v.number(),
      pendingCount: v.number(),
      totalValueTraded: v.number(),
      strategyNotes: v.array(v.string()),
    })),

    // Risk alerts
    riskAlerts: v.array(v.object({
      severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      title: v.string(),
      description: v.string(),
    })),

    sentAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    generatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_status", ["status"]),

  // ============================================================================
  // AI SIGNAL DETECTION TABLES
  // ============================================================================

  /**
   * UserSignalPreferences - User preferences for signal detection
   */
  userSignalPreferences: defineTable({
    userId: v.id("users"),
    emailAnalysisEnabled: v.boolean(), // Opt-in for email scanning
    socialAnalysisEnabled: v.boolean(),
    marketAlertsEnabled: v.boolean(),
    dailyInsightsEnabled: v.boolean(),
    pushNotificationsEnabled: v.boolean(),
    minConfidenceThreshold: v.number(), // Min confidence to show signal (0-100)
    preferredUrgencyLevel: v.union(
      v.literal("all"),
      v.literal("medium_high"),
      v.literal("high_only")
    ),
    interests: v.array(v.string()), // Topics/markets of interest
    excludedMarkets: v.array(v.string()), // Markets to never show signals for
    timezone: v.string(), // For daily insights timing
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ============================================================================
  // ANALYTICS & EXPERIMENTS TABLES
  // ============================================================================

  /**
   * Analytics Events - Event tracking for analytics
   */
  analyticsEvents: defineTable({
    event: v.string(),
    userId: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
    properties: v.any(),
    timestamp: v.number(),
    context: v.object({
      page: v.optional(v.string()),
      referrer: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      ip: v.optional(v.string()),
      locale: v.optional(v.string()),
      timezone: v.optional(v.string()),
      campaign: v.optional(
        v.object({
          source: v.optional(v.string()),
          medium: v.optional(v.string()),
          name: v.optional(v.string()),
          term: v.optional(v.string()),
          content: v.optional(v.string()),
        })
      ),
      device: v.optional(
        v.object({
          type: v.optional(v.union(v.literal("mobile"), v.literal("tablet"), v.literal("desktop"))),
          os: v.optional(v.string()),
          osVersion: v.optional(v.string()),
          browser: v.optional(v.string()),
          browserVersion: v.optional(v.string()),
          screenWidth: v.optional(v.number()),
          screenHeight: v.optional(v.number()),
        })
      ),
      session: v.optional(
        v.object({
          id: v.string(),
          startedAt: v.number(),
          pageViews: v.number(),
        })
      ),
    }),
    batchId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_event", ["event"])
    .index("by_timestamp", ["timestamp"])
    .index("by_event_timestamp", ["event", "timestamp"]),

  /**
   * Experiments - A/B test definitions
   */
  experiments: defineTable({
    name: v.string(),
    description: v.string(),
    hypothesis: v.string(),
    variants: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        weight: v.number(),
        isControl: v.boolean(),
        config: v.any(),
      })
    ),
    targetAudience: v.optional(
      v.object({
        tiers: v.optional(v.array(v.string())),
        cohorts: v.optional(v.array(v.string())),
        percentOfUsers: v.optional(v.number()),
        countries: v.optional(v.array(v.string())),
        platforms: v.optional(v.array(v.union(v.literal("web"), v.literal("ios"), v.literal("android")))),
        includeUserIds: v.optional(v.array(v.string())),
        excludeUserIds: v.optional(v.array(v.string())),
        filters: v.optional(
          v.array(
            v.object({
              field: v.string(),
              operator: v.union(
                v.literal("eq"),
                v.literal("neq"),
                v.literal("gt"),
                v.literal("gte"),
                v.literal("lt"),
                v.literal("lte"),
                v.literal("in"),
                v.literal("nin"),
                v.literal("contains")
              ),
              value: v.any(),
            })
          )
        ),
      })
    ),
    metrics: v.array(
      v.object({
        name: v.string(),
        type: v.union(
          v.literal("conversion"),
          v.literal("revenue"),
          v.literal("count"),
          v.literal("duration"),
          v.literal("custom")
        ),
        eventName: v.string(),
        property: v.optional(v.string()),
        isPrimary: v.boolean(),
        minimumDetectableEffect: v.optional(v.number()),
      })
    ),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("archived")
    ),
    type: v.union(
      v.literal("feature_flag"),
      v.literal("ab_test"),
      v.literal("multivariate"),
      v.literal("holdout"),
      v.literal("rollout")
    ),
    minimumSampleSize: v.optional(v.number()),
    minimumRunDuration: v.optional(v.number()),
    winnerVariantId: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_name", ["name"]),

  /**
   * Experiment Assignments - User variant assignments
   */
  experimentAssignments: defineTable({
    userId: v.string(),
    experimentId: v.string(),
    variantId: v.string(),
    assignedAt: v.number(),
    context: v.optional(
      v.object({
        platform: v.optional(v.string()),
        version: v.optional(v.string()),
        country: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        sessionId: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_experiment", ["experimentId"])
    .index("by_user_experiment", ["userId", "experimentId"]),

  /**
   * Experiment Events - Exposure and conversion events
   */
  experimentEvents: defineTable({
    userId: v.string(),
    experimentId: v.string(),
    variantId: v.string(),
    eventType: v.union(v.literal("exposure"), v.literal("conversion")),
    eventName: v.optional(v.string()),
    value: v.optional(v.number()),
    timestamp: v.number(),
    properties: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_experiment", ["experimentId"])
    .index("by_experiment_variant", ["experimentId", "variantId"]),

  /**
   * Daily Metrics - Pre-computed daily analytics
   */
  dailyMetrics: defineTable({
    date: v.string(), // YYYY-MM-DD
    dau: v.number(),
    wau: v.number(),
    mau: v.number(),
    newSignups: v.number(),
    kycCompletions: v.number(),
    firstDeposits: v.number(),
    firstTrades: v.number(),
    totalTrades: v.number(),
    totalVolume: v.number(),
    totalDeposits: v.number(),
    totalWithdrawals: v.number(),
    activeTraders: v.number(),
    avgSessionDuration: v.number(),
    avgTradesPerUser: v.number(),
    referrals: v.number(),
    totalFees: v.number(),
    d1Retention: v.optional(v.number()),
    d7Retention: v.optional(v.number()),
    d30Retention: v.optional(v.number()),
    dauMauRatio: v.optional(v.number()),
    avgSessionsPerDay: v.optional(v.number()),
    newFollows: v.optional(v.number()),
    copyTradingStarts: v.optional(v.number()),
    messagesSent: v.optional(v.number()),
    anomalies: v.optional(
      v.array(
        v.object({
          metric: v.string(),
          severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
          message: v.string(),
        })
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["date"]),
});
