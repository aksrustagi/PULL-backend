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
});
