/**
 * PULL Super App - Convex Database Schema
 *
 * This schema defines all tables for the PULL platform including:
 * - User management & KYC
 * - Trading (crypto, predictions, RWAs)
 * - Email intelligence
 * - Matrix messaging
 * - Rewards & points
 * - AI agent memory
 * - Audit logging
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

export default defineSchema({
  // ===========================================================================
  // USERS & AUTHENTICATION
  // ===========================================================================

  /**
   * Core user accounts
   */
  users: defineTable({
    // Identity
    accountId: v.string(), // External account ID from auth system
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),

    // KYC Status
    kycTier: v.union(
      v.literal("none"),
      v.literal("basic"),      // Email verified, basic info
      v.literal("enhanced"),   // Full IDV complete
      v.literal("accredited")  // Accredited investor verified
    ),
    kycStatus: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("review")      // Manual review required
    ),
    kycCompletedAt: v.optional(v.number()),

    // Blockchain
    walletAddress: v.optional(v.string()),
    walletConnectedAt: v.optional(v.number()),

    // Matrix Integration
    matrixUserId: v.optional(v.string()),
    matrixAccessToken: v.optional(v.string()),

    // Email Integration
    nylasGrantId: v.optional(v.string()),
    emailSyncEnabled: v.boolean(),

    // Referral System
    referralCode: v.string(),
    referredBy: v.optional(v.id("users")),
    referralCount: v.number(),

    // Balances (cached for fast reads)
    pointsBalance: v.number(),
    pullTokenBalance: v.number(),
    cashBalance: v.number(),

    // Preferences
    preferences: v.object({
      emailNotifications: v.boolean(),
      pushNotifications: v.boolean(),
      tradingAlerts: v.boolean(),
      marketingEmails: v.boolean(),
      theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
      defaultCurrency: v.string(),
    }),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_accountId", ["accountId"])
    .index("by_referralCode", ["referralCode"])
    .index("by_walletAddress", ["walletAddress"])
    .index("by_matrixUserId", ["matrixUserId"])
    .index("by_kycStatus", ["kycStatus"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Email verification codes
   */
  verificationCodes: defineTable({
    email: v.string(),
    code: v.string(),
    type: v.union(
      v.literal("email_verification"),
      v.literal("password_reset"),
      v.literal("two_factor")
    ),
    attempts: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_email_type", ["email", "type"])
    .index("by_code", ["code"]),

  /**
   * User sessions for multi-device support
   */
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    deviceInfo: v.object({
      type: v.string(),
      os: v.string(),
      browser: v.optional(v.string()),
      ip: v.string(),
    }),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_token", ["token"]),

  // ===========================================================================
  // KYC & COMPLIANCE
  // ===========================================================================

  /**
   * KYC document submissions
   */
  kycDocuments: defineTable({
    userId: v.id("users"),
    personaInquiryId: v.string(),
    documentType: v.union(
      v.literal("id_card"),
      v.literal("passport"),
      v.literal("drivers_license"),
      v.literal("proof_of_address"),
      v.literal("selfie")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    rejectionReason: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_personaInquiryId", ["personaInquiryId"]),

  /**
   * Background check results
   */
  backgroundChecks: defineTable({
    userId: v.id("users"),
    checkrCandidateId: v.string(),
    checkrReportId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("clear"),
      v.literal("consider"),
      v.literal("suspended")
    ),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_checkrReportId", ["checkrReportId"]),

  /**
   * Wallet screening results (Chainalysis)
   */
  walletScreenings: defineTable({
    userId: v.id("users"),
    walletAddress: v.string(),
    chain: v.string(),
    riskScore: v.number(),
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("severe")
    ),
    alerts: v.array(v.object({
      category: v.string(),
      severity: v.string(),
      description: v.string(),
    })),
    screenedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_walletAddress", ["walletAddress"]),

  // ===========================================================================
  // TRADING & BALANCES
  // ===========================================================================

  /**
   * User asset balances
   */
  balances: defineTable({
    userId: v.id("users"),
    assetType: v.union(
      v.literal("cash"),
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("pull_token")
    ),
    assetId: v.string(), // 'USD', 'BTC', 'event-123-yes', 'pokemon-charizard-001'
    symbol: v.string(),
    name: v.string(),

    // Balance breakdown
    available: v.number(),    // Available for trading
    held: v.number(),         // Locked in open orders
    pending: v.number(),      // Pending settlement
    staked: v.number(),       // Staked (for tokens)

    // For display
    currentPrice: v.number(),
    totalValue: v.number(),   // available * currentPrice

    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_asset", ["userId", "assetType", "assetId"])
    .index("by_assetId", ["assetId"]),

  /**
   * Trading orders
   */
  orders: defineTable({
    userId: v.id("users"),

    // Asset info
    assetType: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    assetId: v.string(),
    symbol: v.string(),

    // Order details
    side: v.union(v.literal("buy"), v.literal("sell")),
    orderType: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop"),
      v.literal("stop_limit")
    ),
    quantity: v.number(),
    limitPrice: v.optional(v.number()),
    stopPrice: v.optional(v.number()),

    // Execution
    status: v.union(
      v.literal("pending"),      // Created, not yet submitted
      v.literal("submitted"),    // Sent to execution venue
      v.literal("partial"),      // Partially filled
      v.literal("filled"),       // Fully filled
      v.literal("cancelled"),    // User cancelled
      v.literal("rejected"),     // Rejected by venue
      v.literal("expired"),      // Order expired
      v.literal("failed")        // System failure
    ),
    filledQuantity: v.number(),
    remainingQuantity: v.number(),
    avgFillPrice: v.number(),

    // Fees
    fees: v.number(),
    feesCurrency: v.string(),

    // External reference
    externalOrderId: v.optional(v.string()),
    executionVenue: v.optional(v.string()),

    // Workflow tracking
    temporalWorkflowId: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    submittedAt: v.optional(v.number()),
    filledAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_asset", ["userId", "assetId"])
    .index("by_externalOrderId", ["externalOrderId"])
    .index("by_temporalWorkflowId", ["temporalWorkflowId"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Trade executions (fills)
   */
  trades: defineTable({
    orderId: v.id("orders"),
    userId: v.id("users"),

    // Trade details
    assetId: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    quantity: v.number(),
    price: v.number(),
    value: v.number(), // quantity * price
    fees: v.number(),

    // Settlement
    settlementStatus: v.union(
      v.literal("pending"),
      v.literal("settled"),
      v.literal("failed")
    ),
    settledAt: v.optional(v.number()),

    // External reference
    externalTradeId: v.optional(v.string()),

    executedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_userId", ["userId"])
    .index("by_userId_asset", ["userId", "assetId"])
    .index("by_executedAt", ["executedAt"]),

  /**
   * Buying power holds
   */
  buyingPowerHolds: defineTable({
    userId: v.id("users"),
    orderId: v.optional(v.id("orders")),
    amount: v.number(),
    currency: v.string(),
    reason: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("applied")
    ),
    createdAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_orderId", ["orderId"])
    .index("by_status", ["status"]),

  // ===========================================================================
  // PREDICTION MARKETS
  // ===========================================================================

  /**
   * Prediction market events
   */
  predictionEvents: defineTable({
    eventId: v.string(),

    // Event info
    title: v.string(),
    description: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    tags: v.array(v.string()),
    imageUrl: v.optional(v.string()),

    // Source
    source: v.string(),         // Where the event comes from
    sourceEventId: v.optional(v.string()),

    // Outcomes
    outcomes: v.array(v.object({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      currentPrice: v.number(), // 0-100 cents = probability
      previousPrice: v.number(),
      volume24h: v.number(),
    })),

    // Market status
    status: v.union(
      v.literal("upcoming"),    // Not yet open for trading
      v.literal("open"),        // Active trading
      v.literal("closed"),      // Trading closed, awaiting resolution
      v.literal("resolved"),    // Outcome determined
      v.literal("voided")       // Event cancelled/voided
    ),

    // Resolution
    resolutionDate: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedOutcomeId: v.optional(v.string()),
    resolutionSource: v.optional(v.string()),

    // Liquidity
    totalVolume: v.number(),
    volume24h: v.number(),
    openInterest: v.number(),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_resolutionDate", ["resolutionDate"])
    .searchIndex("search_events", {
      searchField: "title",
      filterFields: ["status", "category"],
    }),

  /**
   * User positions in prediction markets
   */
  predictionPositions: defineTable({
    userId: v.id("users"),
    eventId: v.string(),
    outcomeId: v.string(),

    // Position
    shares: v.number(),         // Number of shares owned
    avgCost: v.number(),        // Average cost basis
    totalCost: v.number(),      // Total amount invested

    // Current value
    currentPrice: v.number(),
    currentValue: v.number(),
    unrealizedPnL: v.number(),

    // Settlement
    isSettled: v.boolean(),
    settledAmount: v.optional(v.number()),
    settledAt: v.optional(v.number()),

    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_eventId", ["eventId"])
    .index("by_userId_eventId", ["userId", "eventId"]),

  // ===========================================================================
  // REAL WORLD ASSETS (RWAs)
  // ===========================================================================

  /**
   * RWA assets (Pokemon cards, collectibles)
   */
  rwaAssets: defineTable({
    assetId: v.string(),

    // Category
    category: v.union(
      v.literal("pokemon"),
      v.literal("sports_cards"),
      v.literal("collectibles"),
      v.literal("art"),
      v.literal("other")
    ),

    // Item details
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    additionalImages: v.array(v.string()),

    // For cards
    cardDetails: v.optional(v.object({
      set: v.string(),
      number: v.string(),
      rarity: v.string(),
      year: v.number(),
      edition: v.optional(v.string()),
    })),

    // Grading
    grading: v.optional(v.object({
      service: v.string(),      // PSA, BGS, CGC
      grade: v.string(),        // "10", "9.5", etc.
      certNumber: v.string(),
      subgrades: v.optional(v.object({
        centering: v.optional(v.string()),
        corners: v.optional(v.string()),
        edges: v.optional(v.string()),
        surface: v.optional(v.string()),
      })),
    })),

    // Custody
    custodian: v.string(),
    custodyVerifiedAt: v.number(),

    // Fractionalization
    totalShares: v.number(),
    availableShares: v.number(),
    minPurchaseShares: v.number(),

    // Pricing
    currentPricePerShare: v.number(),
    totalValuation: v.number(),
    priceChange24h: v.number(),
    priceChange7d: v.number(),

    // Volume
    volume24h: v.number(),
    totalVolume: v.number(),

    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("pending_verification"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("redeemed")    // Physical item redeemed
    ),

    // Timestamps
    listedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assetId", ["assetId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .searchIndex("search_rwa", {
      searchField: "name",
      filterFields: ["category", "status"],
    }),

  /**
   * User RWA holdings
   */
  rwaHoldings: defineTable({
    userId: v.id("users"),
    assetId: v.string(),

    shares: v.number(),
    avgCost: v.number(),
    totalCost: v.number(),

    currentValue: v.number(),
    unrealizedPnL: v.number(),

    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_assetId", ["assetId"])
    .index("by_userId_assetId", ["userId", "assetId"]),

  // ===========================================================================
  // EMAIL INTELLIGENCE
  // ===========================================================================

  /**
   * Synced emails with AI triage
   */
  emails: defineTable({
    userId: v.id("users"),

    // Nylas reference
    nylasId: v.string(),
    nylasThreadId: v.optional(v.string()),

    // Email content
    from: v.object({
      email: v.string(),
      name: v.optional(v.string()),
    }),
    to: v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
    })),
    cc: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
    }))),
    subject: v.string(),
    snippet: v.string(),
    bodyPreview: v.optional(v.string()),

    // AI Triage
    triage: v.object({
      priority: v.union(
        v.literal("urgent"),
        v.literal("important"),
        v.literal("normal"),
        v.literal("low")
      ),
      category: v.string(),
      summary: v.string(),
      suggestedAction: v.string(),
      relatedAssets: v.optional(v.array(v.string())),
      sentiment: v.optional(v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative")
      )),
      keyEntities: v.optional(v.array(v.string())),
    }),

    // Status
    isRead: v.boolean(),
    isArchived: v.boolean(),
    isStarred: v.boolean(),
    isSnoozed: v.boolean(),
    snoozedUntil: v.optional(v.number()),

    // Labels
    labels: v.array(v.string()),

    // Timestamps
    receivedAt: v.number(),
    syncedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_priority", ["userId", "triage.priority"])
    .index("by_userId_category", ["userId", "triage.category"])
    .index("by_nylasId", ["nylasId"])
    .index("by_receivedAt", ["receivedAt"])
    .searchIndex("search_emails", {
      searchField: "subject",
      filterFields: ["userId"],
    }),

  /**
   * Email reply drafts
   */
  emailDrafts: defineTable({
    userId: v.id("users"),
    emailId: v.optional(v.id("emails")),
    threadId: v.optional(v.string()),

    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    subject: v.string(),
    body: v.string(),

    // AI-generated suggestions
    aiSuggestions: v.optional(v.array(v.object({
      variant: v.string(),
      body: v.string(),
      tone: v.string(),
    }))),

    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sent")
    ),
    scheduledFor: v.optional(v.number()),
    sentAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_emailId", ["emailId"]),

  // ===========================================================================
  // MATRIX MESSAGING
  // ===========================================================================

  /**
   * Matrix rooms (cached)
   */
  matrixRooms: defineTable({
    roomId: v.string(),

    name: v.string(),
    topic: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),

    // Room type
    type: v.union(
      v.literal("direct"),
      v.literal("group"),
      v.literal("trading_room"),
      v.literal("community")
    ),

    // Associated asset (for trading rooms)
    linkedAssetId: v.optional(v.string()),
    linkedAssetType: v.optional(v.string()),

    // Members
    memberCount: v.number(),

    // Settings
    isPublic: v.boolean(),
    isEncrypted: v.boolean(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_linkedAsset", ["linkedAssetId"]),

  /**
   * Matrix messages (cached for search)
   */
  matrixMessages: defineTable({
    roomId: v.string(),
    eventId: v.string(),

    senderId: v.string(),
    senderName: v.optional(v.string()),

    // Content
    messageType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("trade_share"),
      v.literal("prediction_share")
    ),
    content: v.string(),

    // For trade/prediction shares
    sharedData: v.optional(v.object({
      type: v.string(),
      assetId: v.string(),
      data: v.any(),
    })),

    // Reactions
    reactionCounts: v.optional(v.any()),

    timestamp: v.number(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_timestamp", ["roomId", "timestamp"])
    .index("by_eventId", ["eventId"])
    .searchIndex("search_messages", {
      searchField: "content",
      filterFields: ["roomId"],
    }),

  /**
   * User's Matrix room memberships
   */
  matrixMemberships: defineTable({
    userId: v.id("users"),
    roomId: v.string(),

    membership: v.union(
      v.literal("join"),
      v.literal("invite"),
      v.literal("leave"),
      v.literal("ban")
    ),

    // Notifications
    notificationLevel: v.union(
      v.literal("all"),
      v.literal("mentions"),
      v.literal("none")
    ),

    // Read status
    lastReadEventId: v.optional(v.string()),
    unreadCount: v.number(),

    joinedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_roomId", ["roomId"])
    .index("by_userId_roomId", ["userId", "roomId"]),

  // ===========================================================================
  // REWARDS & POINTS
  // ===========================================================================

  /**
   * Points transaction ledger
   */
  pointsTransactions: defineTable({
    userId: v.id("users"),

    // Transaction details
    amount: v.number(),
    type: v.union(v.literal("earn"), v.literal("redeem"), v.literal("expire"), v.literal("adjustment")),

    // Source/reason
    source: v.string(),
    sourceId: v.optional(v.string()),
    description: v.string(),

    // Multipliers applied
    multiplier: v.optional(v.number()),
    baseAmount: v.optional(v.number()),
    bonusAmount: v.optional(v.number()),

    // Balance tracking
    balanceBefore: v.number(),
    balanceAfter: v.number(),

    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "type"])
    .index("by_source", ["source"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Sweepstakes entries
   */
  sweepstakesEntries: defineTable({
    userId: v.id("users"),
    sweepstakesId: v.string(),

    entriesCount: v.number(),
    pointsSpent: v.number(),

    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sweepstakesId", ["sweepstakesId"]),

  /**
   * Sweepstakes campaigns
   */
  sweepstakes: defineTable({
    sweepstakesId: v.string(),

    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),

    // Prize info
    prizeType: v.string(),
    prizeValue: v.number(),
    prizeDescription: v.string(),

    // Entry cost
    entryCostPoints: v.number(),
    maxEntriesPerUser: v.number(),

    // Timing
    startDate: v.number(),
    endDate: v.number(),
    drawDate: v.number(),

    // Status
    status: v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("closed"),
      v.literal("drawn")
    ),

    // Results
    totalEntries: v.number(),
    winnerId: v.optional(v.id("users")),

    createdAt: v.number(),
  })
    .index("by_sweepstakesId", ["sweepstakesId"])
    .index("by_status", ["status"]),

  /**
   * User achievements/badges
   */
  achievements: defineTable({
    userId: v.id("users"),
    achievementId: v.string(),

    name: v.string(),
    description: v.string(),
    iconUrl: v.string(),

    // Points awarded
    pointsAwarded: v.number(),

    // Progress (for progressive achievements)
    progress: v.optional(v.number()),
    target: v.optional(v.number()),

    unlockedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_achievementId", ["achievementId"]),

  /**
   * Referral tracking
   */
  referrals: defineTable({
    referrerId: v.id("users"),
    referredId: v.id("users"),

    // Status
    status: v.union(
      v.literal("pending"),     // Signed up but not KYC
      v.literal("qualified"),   // KYC complete
      v.literal("rewarded")     // Rewards paid out
    ),

    // Rewards
    referrerReward: v.optional(v.number()),
    referredReward: v.optional(v.number()),
    rewardedAt: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_referrerId", ["referrerId"])
    .index("by_referredId", ["referredId"])
    .index("by_status", ["status"]),

  // ===========================================================================
  // AI AGENTS
  // ===========================================================================

  /**
   * AI agent memory for personalization
   */
  agentMemory: defineTable({
    userId: v.id("users"),
    agentType: v.string(),  // 'trading', 'email', 'support'

    // Memory item
    key: v.string(),
    value: v.any(),

    // For semantic search
    embedding: v.optional(v.array(v.float64())),

    // Importance/decay
    importance: v.number(),
    accessCount: v.number(),
    lastAccessedAt: v.number(),

    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_agentType", ["userId", "agentType"])
    .index("by_userId_key", ["userId", "key"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI embedding dimensions
      filterFields: ["userId", "agentType"],
    }),

  /**
   * AI conversation history
   */
  agentConversations: defineTable({
    userId: v.id("users"),
    agentType: v.string(),
    sessionId: v.string(),

    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      timestamp: v.number(),
    })),

    // Context
    contextData: v.optional(v.any()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_userId_agentType", ["userId", "agentType"]),

  // ===========================================================================
  // SIGNALS & ALERTS
  // ===========================================================================

  /**
   * Market signals from Dome API
   */
  signals: defineTable({
    symbol: v.string(),

    type: v.union(
      v.literal("volume_spike"),
      v.literal("price_movement"),
      v.literal("sentiment_shift"),
      v.literal("whale_activity"),
      v.literal("unusual_options"),
      v.literal("social_trending"),
      v.literal("news_event")
    ),

    magnitude: v.number(),
    direction: v.optional(v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral"))),

    title: v.string(),
    description: v.string(),

    // Source
    source: v.string(),
    sourceUrl: v.optional(v.string()),

    // Related data
    metadata: v.optional(v.any()),

    timestamp: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_symbol", ["symbol"])
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"]),

  /**
   * User alert subscriptions
   */
  alertSubscriptions: defineTable({
    userId: v.id("users"),

    // What to alert on
    alertType: v.union(
      v.literal("price_target"),
      v.literal("signal"),
      v.literal("event"),
      v.literal("order_fill")
    ),

    // Conditions
    symbol: v.optional(v.string()),
    condition: v.optional(v.object({
      operator: v.string(),
      value: v.number(),
    })),
    signalTypes: v.optional(v.array(v.string())),

    // Delivery
    channels: v.array(v.union(
      v.literal("push"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("matrix")
    )),

    isActive: v.boolean(),

    // Trigger tracking
    lastTriggeredAt: v.optional(v.number()),
    triggerCount: v.number(),

    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_symbol", ["symbol"]),

  /**
   * Triggered alert history
   */
  alertHistory: defineTable({
    userId: v.id("users"),
    subscriptionId: v.id("alertSubscriptions"),

    alertType: v.string(),
    title: v.string(),
    message: v.string(),

    // What triggered it
    triggerData: v.any(),

    // Delivery status
    deliveredVia: v.array(v.string()),

    isRead: v.boolean(),

    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_subscriptionId", ["subscriptionId"]),

  // ===========================================================================
  // AUDIT & COMPLIANCE
  // ===========================================================================

  /**
   * Immutable audit log
   */
  auditLog: defineTable({
    // Actor
    userId: v.optional(v.id("users")),
    actorType: v.union(
      v.literal("user"),
      v.literal("system"),
      v.literal("admin"),
      v.literal("workflow")
    ),

    // Action
    action: v.string(),
    category: v.union(
      v.literal("auth"),
      v.literal("kyc"),
      v.literal("trading"),
      v.literal("funds"),
      v.literal("settings"),
      v.literal("admin")
    ),

    // Resource
    resourceType: v.string(),
    resourceId: v.string(),

    // Details
    description: v.string(),
    metadata: v.optional(v.any()),

    // Before/after state for changes
    previousState: v.optional(v.any()),
    newState: v.optional(v.any()),

    // Context
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    sessionId: v.optional(v.string()),

    // Workflow context
    temporalWorkflowId: v.optional(v.string()),

    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_category", ["category"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_action", ["action"]),

  // ===========================================================================
  // BLOCKCHAIN & TOKEN
  // ===========================================================================

  /**
   * On-chain transactions
   */
  blockchainTransactions: defineTable({
    userId: v.id("users"),

    // Transaction details
    txHash: v.string(),
    chain: v.string(),

    type: v.union(
      v.literal("token_transfer"),
      v.literal("stake"),
      v.literal("unstake"),
      v.literal("claim_rewards"),
      v.literal("nft_mint"),
      v.literal("nft_transfer")
    ),

    // Addresses
    fromAddress: v.string(),
    toAddress: v.string(),

    // Value
    amount: v.optional(v.number()),
    tokenAddress: v.optional(v.string()),
    tokenId: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("failed")
    ),
    blockNumber: v.optional(v.number()),
    confirmations: v.number(),

    // Gas
    gasUsed: v.optional(v.number()),
    gasPrice: v.optional(v.string()),

    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_txHash", ["txHash"])
    .index("by_type", ["type"])
    .index("by_status", ["status"]),

  /**
   * Token staking records
   */
  stakingPositions: defineTable({
    userId: v.id("users"),

    // Position
    stakedAmount: v.number(),
    rewardDebt: v.number(),

    // Rewards
    pendingRewards: v.number(),
    totalRewardsClaimed: v.number(),
    lastClaimAt: v.optional(v.number()),

    // Status
    isActive: v.boolean(),

    stakedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_isActive", ["isActive"]),

  // ===========================================================================
  // FANTASY SPORTS
  // ===========================================================================

  /**
   * Fantasy contests
   */
  fantasyContests: defineTable({
    contestId: v.string(),

    // Contest info
    title: v.string(),
    description: v.string(),
    sport: v.string(),

    // Entry
    entryFee: v.number(),
    maxEntries: v.number(),
    currentEntries: v.number(),
    maxEntriesPerUser: v.number(),

    // Prizes
    prizePool: v.number(),
    prizeStructure: v.array(v.object({
      place: v.number(),
      amount: v.number(),
    })),

    // Timing
    startTime: v.number(),
    lockTime: v.number(),
    endTime: v.number(),

    // Status
    status: v.union(
      v.literal("upcoming"),
      v.literal("filling"),
      v.literal("locked"),
      v.literal("live"),
      v.literal("completed"),
      v.literal("cancelled")
    ),

    // Salary cap settings
    salaryCap: v.number(),
    rosterSpots: v.number(),

    createdAt: v.number(),
  })
    .index("by_contestId", ["contestId"])
    .index("by_status", ["status"])
    .index("by_sport", ["sport"]),

  /**
   * User fantasy entries
   */
  fantasyEntries: defineTable({
    userId: v.id("users"),
    contestId: v.id("fantasyContests"),

    // Roster
    roster: v.array(v.object({
      playerId: v.string(),
      position: v.string(),
      salary: v.number(),
    })),

    totalSalary: v.number(),

    // Scoring
    points: v.number(),
    rank: v.optional(v.number()),

    // Winnings
    winnings: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_contestId", ["contestId"])
    .index("by_userId_contestId", ["userId", "contestId"]),
});
