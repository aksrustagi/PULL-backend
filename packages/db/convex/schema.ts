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
    data: v.optional(v.object({
      verificationResult: v.optional(v.string()),
      documentType: v.optional(v.string()),
      notes: v.optional(v.string()),
      rawResponse: v.optional(v.string()),
    })),
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
    metadata: v.optional(v.object({
      source: v.optional(v.string()),
      exchange: v.optional(v.string()),
      cancellationReason: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
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
    metadata: v.optional(v.object({
      provider: v.optional(v.string()),
      processorId: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
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
    metadata: v.optional(v.object({
      provider: v.optional(v.string()),
      processorId: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
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
  // REAL ESTATE PREDICTION MARKET TABLES
  // ============================================================================

  /**
   * Real Estate Prediction Events - Market predictions on real estate metrics
   */
  realEstatePredictionEvents: defineTable({
    ticker: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("median_price"),
      v.literal("mortgage_rates"),
      v.literal("housing_inventory"),
      v.literal("development_sellout"),
      v.literal("rent_prices"),
      v.literal("days_on_market"),
      v.literal("home_sales_volume"),
      v.literal("price_per_sqft"),
      v.literal("foreclosure_rate"),
      v.literal("new_construction"),
      v.literal("custom")
    ),
    subcategory: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_review"),
      v.literal("upcoming"),
      v.literal("open"),
      v.literal("trading_halted"),
      v.literal("closed"),
      v.literal("resolving"),
      v.literal("settled"),
      v.literal("cancelled"),
      v.literal("disputed")
    ),

    // Geographic targeting
    geographicScope: v.union(
      v.literal("national"),
      v.literal("state"),
      v.literal("metro"),
      v.literal("city"),
      v.literal("zip_code"),
      v.literal("neighborhood"),
      v.literal("development")
    ),
    country: v.string(),
    state: v.optional(v.string()),
    metro: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    developmentId: v.optional(v.string()),

    // Market parameters
    targetMetric: v.string(),
    targetValue: v.number(),
    comparisonOperator: v.union(
      v.literal("gt"),
      v.literal("gte"),
      v.literal("lt"),
      v.literal("lte"),
      v.literal("eq")
    ),
    currentValue: v.optional(v.number()),
    baselineValue: v.optional(v.number()),

    // Resolution
    resolutionSource: v.string(),
    resolutionSourceUrl: v.optional(v.string()),
    resolutionDetails: v.optional(v.string()),
    resolutionDate: v.number(),
    settlementValue: v.optional(v.number()),
    outcome: v.optional(v.union(v.literal("yes"), v.literal("no"))),

    // Trading data
    yesPrice: v.number(),
    noPrice: v.number(),
    yesVolume: v.number(),
    noVolume: v.number(),
    totalVolume: v.number(),
    openInterest: v.number(),
    liquidity: v.number(),

    // Timing
    openTime: v.number(),
    closeTime: v.number(),
    settledAt: v.optional(v.number()),

    // Metadata
    imageUrl: v.optional(v.string()),
    tags: v.array(v.string()),
    dataUpdateFrequency: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly")
    ),
    lastDataUpdate: v.optional(v.number()),

    // Sponsorship (B2B)
    sponsoredBy: v.optional(v.string()),
    sponsorBrokerageId: v.optional(v.id("brokerages")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ticker", ["ticker"])
    .index("by_status", ["status"])
    .index("by_category", ["category", "status"])
    .index("by_location", ["geographicScope", "state", "city"])
    .index("by_sponsor", ["sponsorBrokerageId"])
    .searchIndex("search_re_events", {
      searchField: "title",
      filterFields: ["status", "category", "geographicScope"],
    }),

  /**
   * Real Estate Market Data Points - Historical price/volume data
   */
  realEstateMarketDataPoints: defineTable({
    eventId: v.id("realEstatePredictionEvents"),
    timestamp: v.number(),
    yesPrice: v.number(),
    noPrice: v.number(),
    volume: v.number(),
    openInterest: v.number(),
    targetMetricValue: v.optional(v.number()),
  })
    .index("by_event", ["eventId", "timestamp"]),

  /**
   * Brokerages - Real estate brokerage companies
   */
  brokerages: defineTable({
    name: v.string(),
    legalName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("inactive")
    ),
    tier: v.union(
      v.literal("starter"),
      v.literal("growth"),
      v.literal("professional"),
      v.literal("enterprise")
    ),

    // Contact info
    email: v.string(),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),

    // Address
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    country: v.string(),

    // Branding
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),

    // Licensing
    licenseNumber: v.string(),
    licenseState: v.string(),
    licenseExpiry: v.number(),

    // Settings
    whitelabelEnabled: v.boolean(),
    customDomain: v.optional(v.string()),

    // Stats
    agentCount: v.number(),
    activeAgentCount: v.number(),
    totalReferrals: v.number(),
    totalVolume: v.number(),

    // Billing
    billingEmail: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancelled")
      )
    ),

    // Admin
    primaryContactId: v.optional(v.id("users")),

    // Zillow integration
    zillowFlexEnabled: v.boolean(),
    zillowFlexTeamId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_tier", ["tier", "status"])
    .index("by_state", ["state", "status"])
    .searchIndex("search_brokerages", {
      searchField: "name",
      filterFields: ["status", "tier", "state"],
    }),

  /**
   * Real Estate Agents - Licensed agents affiliated with brokerages
   */
  realEstateAgents: defineTable({
    userId: v.id("users"),
    brokerageId: v.id("brokerages"),
    status: v.union(
      v.literal("pending_verification"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("inactive")
    ),

    // Profile
    firstName: v.string(),
    lastName: v.string(),
    displayName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    bio: v.optional(v.string()),

    // Licensing
    licenseNumber: v.string(),
    licenseState: v.string(),
    licenseExpiry: v.number(),

    // Professional info
    title: v.optional(v.string()),
    team: v.optional(v.string()),
    specializations: v.array(v.string()),
    serviceAreas: v.array(v.string()),
    languages: v.array(v.string()),
    yearsExperience: v.number(),

    // Social/marketing
    website: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    instagramUrl: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    tiktokUrl: v.optional(v.string()),

    // Performance
    totalTransactions: v.number(),
    totalVolume: v.number(),
    averageRating: v.number(),
    reviewCount: v.number(),

    // PULL stats
    totalReferrals: v.number(),
    activeReferrals: v.number(),
    referralEarnings: v.number(),
    predictionAccuracy: v.optional(v.number()),
    marketsParticipated: v.number(),
    clientsReferred: v.number(),

    // Referral settings
    referralCode: v.string(),
    referralCommissionRate: v.number(),

    // Zillow integration
    zillowAgentId: v.optional(v.string()),
    zillowFlexAgent: v.boolean(),

    // Verification
    verifiedAt: v.optional(v.number()),
    verificationDocuments: v.array(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_referral_code", ["referralCode"])
    .index("by_license", ["licenseState", "licenseNumber"])
    .searchIndex("search_agents", {
      searchField: "displayName",
      filterFields: ["status", "brokerageId"],
    }),

  /**
   * Agent Referrals - Track client referrals from agents
   */
  agentReferrals: defineTable({
    agentId: v.id("realEstateAgents"),
    referredUserId: v.id("users"),
    brokerageId: v.id("brokerages"),
    status: v.union(
      v.literal("pending"),
      v.literal("signed_up"),
      v.literal("verified"),
      v.literal("active_trader"),
      v.literal("churned"),
      v.literal("expired")
    ),

    // Referral details
    referralCode: v.string(),
    referralSource: v.union(
      v.literal("direct_link"),
      v.literal("qr_code"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("social"),
      v.literal("in_person")
    ),

    // Conversion tracking
    signedUpAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    firstTradeAt: v.optional(v.number()),

    // Earnings
    totalReferralEarnings: v.number(),
    pendingEarnings: v.number(),
    paidEarnings: v.number(),

    // Attribution
    attributionWindow: v.number(),
    expiresAt: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_user", ["referredUserId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_status", ["status"])
    .index("by_referral_code", ["referralCode"]),

  /**
   * Agent Points - Points ledger for agents
   */
  agentPoints: defineTable({
    agentId: v.id("realEstateAgents"),
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
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_type", ["agentId", "type"])
    .index("by_status", ["status"]),

  /**
   * Market Sentiment - Aggregated market sentiment data
   */
  marketSentiment: defineTable({
    geographicScope: v.union(
      v.literal("national"),
      v.literal("state"),
      v.literal("metro"),
      v.literal("city"),
      v.literal("zip_code"),
      v.literal("neighborhood"),
      v.literal("development")
    ),
    location: v.string(),

    // Sentiment scores
    overallSentiment: v.number(),
    buyerSentiment: v.number(),
    sellerSentiment: v.number(),
    investorSentiment: v.number(),

    // Derived from predictions
    priceUpProbability: v.number(),
    priceDownProbability: v.number(),
    inventoryUpProbability: v.number(),
    ratesDownProbability: v.number(),

    // Volume indicators
    predictionVolume: v.number(),
    activeMarkets: v.number(),
    uniqueTraders: v.number(),

    // Trend
    sentimentTrend: v.union(
      v.literal("bullish"),
      v.literal("bearish"),
      v.literal("neutral")
    ),
    trendStrength: v.number(),

    // Historical comparison
    weekOverWeekChange: v.number(),
    monthOverMonthChange: v.number(),

    calculatedAt: v.number(),
  })
    .index("by_scope_location", ["geographicScope", "location"])
    .index("by_calculated", ["calculatedAt"]),

  /**
   * PULL Real Estate Index - Composite market index
   */
  pullRealEstateIndex: defineTable({
    name: v.string(),
    ticker: v.string(),
    geographicScope: v.union(
      v.literal("national"),
      v.literal("state"),
      v.literal("metro"),
      v.literal("city"),
      v.literal("zip_code"),
      v.literal("neighborhood"),
      v.literal("development")
    ),
    location: v.string(),

    // Index value
    value: v.number(),
    previousValue: v.number(),
    change: v.number(),
    changePercent: v.number(),

    // Trend
    trend: v.union(v.literal("up"), v.literal("down"), v.literal("stable")),
    trendStrength: v.number(),

    // Components (stored as JSON)
    components: v.array(
      v.object({
        category: v.string(),
        weight: v.number(),
        currentValue: v.number(),
        previousValue: v.number(),
        change: v.number(),
        changePercent: v.number(),
        sentiment: v.string(),
      })
    ),

    // Derived metrics
    marketSentiment: v.number(),
    volatility: v.number(),
    tradingVolume: v.number(),
    activeMarkets: v.number(),

    // Time series bounds
    high52Week: v.number(),
    low52Week: v.number(),
    high52WeekDate: v.number(),
    low52WeekDate: v.number(),

    calculatedAt: v.number(),
    nextUpdateAt: v.number(),
  })
    .index("by_ticker", ["ticker"])
    .index("by_scope_location", ["geographicScope", "location"])
    .index("by_calculated", ["calculatedAt"]),

  /**
   * PULL Index Historical - Historical index data points
   */
  pullIndexHistorical: defineTable({
    indexId: v.id("pullRealEstateIndex"),
    timestamp: v.number(),
    value: v.number(),
    volume: v.number(),
    marketCount: v.number(),
  })
    .index("by_index", ["indexId", "timestamp"]),

  /**
   * White Label Configs - Brokerage white-label settings
   */
  whiteLabelConfigs: defineTable({
    brokerageId: v.id("brokerages"),

    // Branding
    appName: v.string(),
    logoUrl: v.string(),
    faviconUrl: v.optional(v.string()),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    accentColor: v.optional(v.string()),

    // Domain
    customDomain: v.optional(v.string()),
    sslCertificateId: v.optional(v.string()),

    // Features
    enabledFeatures: v.array(v.string()),
    disabledMarketCategories: v.array(v.string()),

    // Legal
    termsUrl: v.optional(v.string()),
    privacyUrl: v.optional(v.string()),
    disclaimerText: v.optional(v.string()),

    // Analytics
    googleAnalyticsId: v.optional(v.string()),
    facebookPixelId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_domain", ["customDomain"]),

  /**
   * Lead Scores - Trading behavior based lead scoring
   */
  leadScores: defineTable({
    userId: v.id("users"),
    agentId: v.optional(v.id("realEstateAgents")),

    // Trading behavior
    totalTrades: v.number(),
    tradingVolume: v.number(),
    predictionAccuracy: v.number(),
    marketCategories: v.array(v.string()),

    // Interest signals
    priceRangeMin: v.number(),
    priceRangeMax: v.number(),
    locationInterest: v.array(v.string()),
    propertyTypeInterest: v.array(v.string()),
    timeHorizon: v.union(
      v.literal("immediate"),
      v.literal("short_term"),
      v.literal("long_term")
    ),

    // Engagement
    lastActiveAt: v.number(),
    sessionCount: v.number(),
    averageSessionDuration: v.number(),

    // Calculated scores
    overallLeadScore: v.number(),
    buyerIntentScore: v.number(),
    sellerIntentScore: v.number(),
    investorIntentScore: v.number(),
    engagementScore: v.number(),

    // Classification
    leadTier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    recommendedAction: v.string(),

    calculatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_agent", ["agentId"])
    .index("by_tier", ["leadTier", "overallLeadScore"]),

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
    metadata: v.optional(v.object({
      condition: v.optional(v.string()),
      edition: v.optional(v.string()),
      language: v.optional(v.string()),
      marketPrice: v.optional(v.number()),
      notes: v.optional(v.string()),
    })),
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
  // GAMIFICATION & REWARDS TABLES
  // ============================================================================

  /**
   * Points Configuration - Defines points for each action type
   */
  pointsConfig: defineTable({
    actionType: v.string(),
    basePoints: v.number(),
    description: v.string(),
    multiplierRules: v.optional(v.any()), // JSON with streak/tier multipliers
    dailyLimit: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_actionType", ["actionType"])
    .index("by_active", ["active"]),

  /**
   * Streaks - Track user streaks for various action types
   */
  streaks: defineTable({
    userId: v.id("users"),
    streakType: v.string(), // login, trading, prediction_correct
    currentCount: v.number(),
    longestCount: v.number(),
    lastActionAt: v.number(),
    currentMultiplier: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "streakType"]),

  /**
   * Quests - Daily, weekly, achievement, and seasonal quests
   */
  quests: defineTable({
    questId: v.string(), // Human-readable ID
    title: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("achievement"),
      v.literal("seasonal")
    ),
    requirements: v.any(), // JSON defining completion criteria
    pointsReward: v.number(),
    bonusReward: v.optional(v.any()), // Badge, title, etc.
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    maxCompletions: v.optional(v.number()), // For repeatables
    active: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_questId", ["questId"])
    .index("by_type", ["type"])
    .index("by_active", ["active"])
    .index("by_type_active", ["type", "active"]),

  /**
   * User Quests - Track quest progress per user
   */
  userQuests: defineTable({
    userId: v.id("users"),
    questId: v.id("quests"),
    progress: v.any(), // JSON matching requirements structure
    completed: v.boolean(),
    claimed: v.boolean(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "completed"])
    .index("by_quest", ["questId"])
    .index("by_user_quest", ["userId", "questId"]),

  /**
   * Tiers - User tier status and benefits
   */
  tiers: defineTable({
    userId: v.id("users"),
    currentTier: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold"),
      v.literal("platinum"),
      v.literal("diamond")
    ),
    lifetimePoints: v.number(),
    currentMonthPoints: v.number(),
    tierAchievedAt: v.number(),
    tierExpiresAt: v.optional(v.number()), // For decay
    benefits: v.any(), // Current tier benefits JSON
    lastActivityAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tier", ["currentTier"]),

  /**
   * Achievements - Achievement definitions
   */
  achievements: defineTable({
    achievementId: v.string(), // Human-readable ID
    title: v.string(),
    description: v.string(),
    icon: v.string(),
    category: v.string(),
    requirement: v.any(), // Unlock criteria JSON
    rarity: v.union(
      v.literal("common"),
      v.literal("rare"),
      v.literal("epic"),
      v.literal("legendary")
    ),
    pointsReward: v.number(),
    tokenReward: v.optional(v.number()),
    isSecret: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_achievementId", ["achievementId"])
    .index("by_category", ["category"])
    .index("by_rarity", ["rarity"])
    .index("by_active", ["active"]),

  /**
   * User Achievements - Track unlocked achievements per user
   */
  userAchievements: defineTable({
    userId: v.id("users"),
    achievementId: v.id("achievements"),
    unlockedAt: v.number(),
    displayed: v.boolean(), // Show on profile
    progress: v.optional(v.any()), // Progress before unlock
    claimedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_achievement", ["achievementId"])
    .index("by_user_achievement", ["userId", "achievementId"]),

  /**
   * Daily Action Counts - Track daily limits per user
   */
  dailyActionCounts: defineTable({
    userId: v.id("users"),
    actionType: v.string(),
    date: v.string(), // YYYY-MM-DD format
    count: v.number(),
    lastActionAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_action_date", ["userId", "actionType", "date"]),

  /**
   * Anti-Gaming Flags - Suspicious activity tracking
   */
  antiGamingFlags: defineTable({
    userId: v.id("users"),
    flagType: v.string(), // velocity_limit, duplicate_action, suspicious_pattern
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    description: v.string(),
    metadata: v.any(),
    resolved: v.boolean(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["flagType"])
    .index("by_severity", ["severity"])
    .index("by_unresolved", ["resolved"]),

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
    multiplierApplied: v.optional(v.number()),
    baseAmount: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

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
    fulfillmentDetails: v.optional(v.object({
      code: v.optional(v.string()),
      url: v.optional(v.string()),
      instructions: v.optional(v.string()),
    })),
    shippingAddress: v.optional(v.object({
      name: v.string(),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
    })),
    trackingNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    redeemedAt: v.number(),
    fulfilledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_reward", ["rewardId"])
    .index("by_status", ["status"]),

  /**
   * Leaderboard Snapshots - Cached leaderboard data
   */
  leaderboardSnapshots: defineTable({
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    type: v.union(
      v.literal("points"),
      v.literal("trading_volume"),
      v.literal("pnl"),
      v.literal("referrals"),
      v.literal("streak")
    ),
    tierFilter: v.optional(v.string()),
    entries: v.array(v.any()), // LeaderboardEntry[]
    totalParticipants: v.number(),
    generatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_period_type", ["period", "type"])
    .index("by_expires", ["expiresAt"]),

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
    metadata: v.optional(v.object({
      network: v.optional(v.string()),
      contractAddress: v.optional(v.string()),
      method: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
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
    // Audit log changes/metadata are polymorphic by design (different actions store different shapes).
    // Auth wrappers (systemMutation/authenticatedMutation) prevent unauthorized writes.
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
    payload: v.string(), // JSON-serialized webhook payload for type safety
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
    value: v.string(), // JSON-serialized value for type safety
    embedding: v.optional(v.array(v.float64())),
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

  // ============================================================================
  // AI SIGNAL DETECTION TABLES
  // ============================================================================

  /**
   * Signals - AI-detected trading signals from multiple data sources
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
    source: v.string(), // Where the signal originated from
    title: v.string(),
    description: v.string(),
    confidence: v.number(), // 0-100 confidence score
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
    relatedAssets: v.array(v.string()), // RWA asset identifiers
    metadata: v.optional(v.any()), // Source-specific data
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_type", ["type", "createdAt"])
    .index("by_urgency", ["urgency", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_signalId", ["signalId"])
    .searchIndex("search_signals", {
      searchField: "title",
      filterFields: ["type", "urgency", "sentiment"],
    }),

  /**
   * User Signals - Personalized signal delivery and tracking
   */
  userSignals: defineTable({
    userId: v.id("users"),
    signalId: v.id("signals"),
    relevanceScore: v.number(), // Personalized relevance 0-100
    seen: v.boolean(),
    dismissed: v.boolean(),
    actedOn: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_unseen", ["userId", "seen", "createdAt"])
    .index("by_signal", ["signalId"]),

  /**
   * Market Correlations - Statistical relationships between markets
   */
  marketCorrelations: defineTable({
    marketA: v.string(), // First market ticker
    marketB: v.string(), // Second market ticker
    correlation: v.number(), // -1 to 1 Pearson correlation
    sampleSize: v.number(), // Number of data points
    pValue: v.number(), // Statistical significance
    updatedAt: v.number(),
  })
    .index("by_marketA", ["marketA", "correlation"])
    .index("by_marketB", ["marketB", "correlation"])
    .index("by_correlation", ["correlation"])
    .index("by_pair", ["marketA", "marketB"]),

  /**
   * User Insights - Personalized AI-generated insights
   */
  userInsights: defineTable({
    userId: v.id("users"),
    insightType: v.string(), // portfolio, opportunity, risk, trend, social
    title: v.string(),
    content: v.string(),
    priority: v.number(), // 1-5 priority level
    relatedSignals: v.array(v.id("signals")),
    dismissed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_active", ["userId", "dismissed", "createdAt"])
    .index("by_type", ["insightType", "createdAt"]),

  /**
   * Signal Processing Log - Track processed emails/sources for deduplication
   */
  signalProcessingLog: defineTable({
    sourceType: v.string(), // email, social, market, etc.
    sourceId: v.string(), // External ID of processed item
    userId: v.optional(v.id("users")),
    signalsGenerated: v.number(),
    processedAt: v.number(),
  })
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_user", ["userId", "processedAt"]),

  /**
   * User Signal Preferences - Privacy controls and preferences
   */
  userSignalPreferences: defineTable({
    userId: v.id("users"),
    emailAnalysisEnabled: v.boolean(),
    socialAnalysisEnabled: v.boolean(),
    marketAlertsEnabled: v.boolean(),
    dailyInsightsEnabled: v.boolean(),
    pushNotificationsEnabled: v.boolean(),
    minConfidenceThreshold: v.number(), // 0-100
    preferredUrgencyLevel: v.union(
      v.literal("all"),
      v.literal("medium_high"),
      v.literal("high_only")
    ),
    interests: v.array(v.string()), // User interest tags
    excludedMarkets: v.array(v.string()), // Markets to ignore
    timezone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // ============================================================================
  // MARKET DATA TABLES (Real-time from Kalshi)
  // ============================================================================

  /**
   * Market Prices - Current price data per market
   * Updated by Temporal worker, consumed via Convex subscriptions
   */
  marketPrices: defineTable({
    ticker: v.string(),
    price: v.number(),
    change24h: v.number(),
    changePercent24h: v.number(),
    volume24h: v.number(),
    high24h: v.optional(v.number()),
    low24h: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ticker", ["ticker"])
    .index("by_updated", ["updatedAt"]),

  /**
   * Market Orderbooks - Current orderbook state per market
   */
  marketOrderbooks: defineTable({
    ticker: v.string(),
    bids: v.array(v.array(v.number())), // [[price, size], ...]
    asks: v.array(v.array(v.number())),
    spread: v.optional(v.number()),
    midPrice: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ticker", ["ticker"])
    .index("by_updated", ["updatedAt"]),

  /**
   * Market Trades - Recent trade history
   */
  marketTrades: defineTable({
    ticker: v.string(),
    tradeId: v.string(),
    price: v.number(),
    size: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    timestamp: v.number(),
    createdAt: v.number(),
  })
    .index("by_ticker", ["ticker", "timestamp"])
    .index("by_trade_id", ["tradeId"])
    .index("by_timestamp", ["timestamp"]),

  // ============================================================================
  // AI INSIGHTS & CREDITS TABLES
  // ============================================================================

  /**
   * AI Insights - Generated premium insights
   */
  aiInsights: defineTable({
    insightId: v.string(),
    sport: v.union(
      v.literal("nfl"),
      v.literal("ncaa_basketball"),
      v.literal("golf"),
      v.literal("nba"),
      v.literal("mlb")
    ),
    category: v.string(),
    title: v.string(),
    summary: v.string(),
    analysis: v.string(),
    confidence: v.number(),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.string(),
        reliability: v.number(),
      })
    ),
    predictions: v.optional(
      v.array(
        v.object({
          outcome: v.string(),
          probability: v.number(),
          confidence: v.number(),
          reasoning: v.string(),
        })
      )
    ),
    actionItems: v.optional(
      v.array(
        v.object({
          action: v.string(),
          priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
          timeframe: v.string(),
          reasoning: v.string(),
        })
      )
    ),
    relatedMarkets: v.array(v.string()),
    isPremium: v.boolean(),
    creditCost: v.number(),
    viewCount: v.number(),
    purchaseCount: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_insightId", ["insightId"])
    .index("by_sport", ["sport", "createdAt"])
    .index("by_category", ["category", "createdAt"])
    .index("by_expires", ["expiresAt"])
    .searchIndex("search_insights", {
      searchField: "title",
      filterFields: ["sport", "category", "isPremium"],
    }),

  /**
   * User Insight Credits - Credit balance and history
   */
  insightCredits: defineTable({
    userId: v.id("users"),
    balance: v.number(),
    monthlyAllocation: v.number(),
    usedThisMonth: v.number(),
    tier: v.union(
      v.literal("free"),
      v.literal("standard"),
      v.literal("premium"),
      v.literal("elite")
    ),
    subscriptionPlan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("elite"),
      v.literal("enterprise")
    ),
    subscriptionExpiresAt: v.optional(v.number()),
    lastResetAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tier", ["tier"]),

  /**
   * Insight Purchases - User purchase history
   */
  insightPurchases: defineTable({
    userId: v.id("users"),
    insightId: v.id("aiInsights"),
    bundleId: v.optional(v.string()),
    creditsSpent: v.number(),
    cashPaid: v.optional(v.number()),
    expiresAt: v.number(),
    purchasedAt: v.number(),
  })
    .index("by_user", ["userId", "purchasedAt"])
    .index("by_insight", ["insightId"])
    .index("by_bundle", ["bundleId"]),

  /**
   * Credit Transactions - Credit purchase/usage history
   */
  creditTransactions: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("purchase"),
      v.literal("subscription_grant"),
      v.literal("insight_unlock"),
      v.literal("bundle_purchase"),
      v.literal("refund"),
      v.literal("bonus"),
      v.literal("expiry")
    ),
    amount: v.number(),
    balanceAfter: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_type", ["type", "createdAt"]),

  // ============================================================================
  // MARCH MADNESS / NCAA BASKETBALL TABLES
  // ============================================================================

  /**
   * NCAA Teams - College basketball teams
   */
  ncaaTeams: defineTable({
    externalId: v.string(),
    name: v.string(),
    shortName: v.string(),
    mascot: v.string(),
    conference: v.string(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),

    // Rankings
    apRank: v.optional(v.number()),
    coachesRank: v.optional(v.number()),
    netRank: v.optional(v.number()),
    kenpomRank: v.optional(v.number()),
    rpiRank: v.optional(v.number()),

    // Season stats
    wins: v.number(),
    losses: v.number(),
    conferenceWins: v.number(),
    conferenceLosses: v.number(),
    pointsPerGame: v.number(),
    pointsAllowedPerGame: v.number(),
    strengthOfSchedule: v.number(),

    // Advanced metrics
    offensiveEfficiency: v.optional(v.number()),
    defensiveEfficiency: v.optional(v.number()),
    tempo: v.optional(v.number()),

    // Tournament info
    seed: v.optional(v.number()),
    region: v.optional(v.string()),
    isEliminated: v.boolean(),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_conference", ["conference"])
    .index("by_seed", ["seed"])
    .index("by_region", ["region"])
    .searchIndex("search_ncaa_teams", {
      searchField: "name",
      filterFields: ["conference", "region"],
    }),

  /**
   * NCAA Players - College basketball players
   */
  ncaaPlayers: defineTable({
    externalId: v.string(),
    teamId: v.id("ncaaTeams"),
    name: v.string(),
    position: v.string(),
    jerseyNumber: v.optional(v.number()),
    year: v.union(
      v.literal("freshman"),
      v.literal("sophomore"),
      v.literal("junior"),
      v.literal("senior"),
      v.literal("graduate")
    ),
    height: v.optional(v.string()),
    weight: v.optional(v.number()),
    headshotUrl: v.optional(v.string()),

    // Season stats
    gamesPlayed: v.number(),
    pointsPerGame: v.number(),
    reboundsPerGame: v.number(),
    assistsPerGame: v.number(),
    stealsPerGame: v.number(),
    blocksPerGame: v.number(),
    fieldGoalPct: v.number(),
    threePointPct: v.number(),
    freeThrowPct: v.number(),
    minutesPerGame: v.number(),

    // NBA prospect info
    nbaProspectRank: v.optional(v.number()),
    mockDraftPosition: v.optional(v.number()),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_team", ["teamId"])
    .searchIndex("search_ncaa_players", {
      searchField: "name",
      filterFields: ["teamId"],
    }),

  /**
   * NCAA Tournament Brackets - User bracket submissions
   */
  ncaaBrackets: defineTable({
    userId: v.id("users"),
    season: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("locked"),
      v.literal("scored")
    ),

    // Bracket picks (64 teams -> Final Four -> Champion)
    picks: v.object({
      round1: v.array(v.string()), // 32 winners
      round2: v.array(v.string()), // 16 winners (Sweet 16)
      sweet16: v.array(v.string()), // 8 winners (Elite 8)
      elite8: v.array(v.string()), // 4 winners (Final Four)
      finalFour: v.array(v.string()), // 2 winners (Championship)
      champion: v.string(),
    }),

    // Tiebreaker
    championshipScore: v.optional(v.number()),

    // Scoring
    totalPoints: v.number(),
    maxPossiblePoints: v.number(),
    percentile: v.optional(v.number()),
    rank: v.optional(v.number()),

    // Pool participation
    poolIds: v.array(v.string()),

    submittedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "season"])
    .index("by_season", ["season", "totalPoints"])
    .index("by_status", ["status"]),

  /**
   * NCAA Games - Tournament and regular season games
   */
  ncaaGames: defineTable({
    externalId: v.string(),
    season: v.string(),
    round: v.optional(v.string()), // "First Round", "Sweet 16", etc.
    region: v.optional(v.string()),

    homeTeamId: v.id("ncaaTeams"),
    awayTeamId: v.id("ncaaTeams"),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    winnerId: v.optional(v.id("ncaaTeams")),

    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("halftime"),
      v.literal("final"),
      v.literal("postponed"),
      v.literal("cancelled")
    ),

    // Odds
    spread: v.optional(v.number()),
    spreadFavorite: v.optional(v.string()),
    total: v.optional(v.number()),
    homeMoneyline: v.optional(v.number()),
    awayMoneyline: v.optional(v.number()),

    // Timing
    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),

    venue: v.optional(v.string()),
    city: v.optional(v.string()),
    tvNetwork: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_season", ["season", "scheduledAt"])
    .index("by_round", ["round", "scheduledAt"])
    .index("by_home_team", ["homeTeamId"])
    .index("by_away_team", ["awayTeamId"])
    .index("by_status", ["status"]),

  /**
   * NCAA Markets - March Madness prediction markets
   */
  ncaaMarkets: defineTable({
    type: v.union(
      v.literal("game_winner"),
      v.literal("game_spread"),
      v.literal("game_total"),
      v.literal("tournament_winner"),
      v.literal("final_four"),
      v.literal("elite_eight"),
      v.literal("sweet_sixteen"),
      v.literal("first_round_upset"),
      v.literal("player_prop"),
      v.literal("region_winner")
    ),
    gameId: v.optional(v.id("ncaaGames")),
    teamId: v.optional(v.id("ncaaTeams")),
    playerId: v.optional(v.id("ncaaPlayers")),
    season: v.string(),

    title: v.string(),
    description: v.string(),

    outcomes: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        odds: v.number(),
        impliedProbability: v.number(),
        totalVolume: v.number(),
      })
    ),

    liquidityParameter: v.number(),
    totalLiquidity: v.number(),
    totalVolume: v.number(),

    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("cancelled")
    ),

    winningOutcomeId: v.optional(v.string()),
    opensAt: v.number(),
    closesAt: v.number(),
    settledAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type", "status"])
    .index("by_game", ["gameId"])
    .index("by_team", ["teamId"])
    .index("by_season", ["season", "status"])
    .index("by_status", ["status"]),

  // ============================================================================
  // GOLF / MASTERS TABLES
  // ============================================================================

  /**
   * Golf Tournaments - PGA Tour tournaments
   */
  golfTournaments: defineTable({
    externalId: v.string(),
    name: v.string(),
    tour: v.union(
      v.literal("pga"),
      v.literal("lpga"),
      v.literal("european"),
      v.literal("champions")
    ),
    type: v.union(
      v.literal("major"),
      v.literal("playoff"),
      v.literal("invitational"),
      v.literal("regular")
    ),
    season: v.string(),

    // Course info
    courseName: v.string(),
    courseCity: v.string(),
    courseState: v.optional(v.string()),
    courseCountry: v.string(),
    par: v.number(),
    yardage: v.number(),

    // Purse
    purse: v.number(),
    winnersPurse: v.number(),

    // Timing
    status: v.union(
      v.literal("upcoming"),
      v.literal("round1"),
      v.literal("round2"),
      v.literal("round3"),
      v.literal("round4"),
      v.literal("playoff"),
      v.literal("complete"),
      v.literal("cancelled")
    ),
    startDate: v.number(),
    endDate: v.number(),
    cutLine: v.optional(v.number()),

    // Weather
    weather: v.optional(
      v.object({
        condition: v.string(),
        temperature: v.number(),
        windSpeed: v.number(),
        windDirection: v.string(),
        precipitation: v.number(),
      })
    ),

    winnerId: v.optional(v.string()),
    winningScore: v.optional(v.number()),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_season", ["season", "startDate"])
    .index("by_type", ["type", "startDate"])
    .index("by_status", ["status"]),

  /**
   * Golf Players - PGA Tour players
   */
  golfPlayers: defineTable({
    externalId: v.string(),
    name: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    country: v.string(),
    headshotUrl: v.optional(v.string()),

    // Rankings
    worldRank: v.optional(v.number()),
    fedexRank: v.optional(v.number()),

    // Season stats
    events: v.number(),
    wins: v.number(),
    top10s: v.number(),
    cuts: v.number(),
    earnings: v.number(),

    // Strokes gained
    sgTotal: v.optional(v.number()),
    sgOffTheTee: v.optional(v.number()),
    sgApproach: v.optional(v.number()),
    sgAroundGreen: v.optional(v.number()),
    sgPutting: v.optional(v.number()),

    // Scoring
    scoringAverage: v.optional(v.number()),
    drivingDistance: v.optional(v.number()),
    drivingAccuracy: v.optional(v.number()),
    greensInRegulation: v.optional(v.number()),
    puttsPerRound: v.optional(v.number()),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_worldRank", ["worldRank"])
    .searchIndex("search_golf_players", {
      searchField: "name",
      filterFields: ["country"],
    }),

  /**
   * Golf Leaderboard - Tournament leaderboard entries
   */
  golfLeaderboard: defineTable({
    tournamentId: v.id("golfTournaments"),
    playerId: v.id("golfPlayers"),

    position: v.number(),
    positionTied: v.boolean(),
    totalScore: v.number(),
    totalToPar: v.number(),

    // Round scores
    round1: v.optional(v.number()),
    round2: v.optional(v.number()),
    round3: v.optional(v.number()),
    round4: v.optional(v.number()),

    // Current round info
    currentRound: v.optional(v.number()),
    currentHole: v.optional(v.number()),
    thruHoles: v.optional(v.number()),
    todayScore: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("cut"),
      v.literal("withdrawn"),
      v.literal("disqualified"),
      v.literal("finished")
    ),

    lastSyncAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tournament", ["tournamentId", "position"])
    .index("by_player", ["playerId"])
    .index("by_tournament_player", ["tournamentId", "playerId"]),

  /**
   * Golf Markets - Golf betting/prediction markets
   */
  golfMarkets: defineTable({
    tournamentId: v.id("golfTournaments"),
    type: v.union(
      v.literal("tournament_winner"),
      v.literal("top_5"),
      v.literal("top_10"),
      v.literal("top_20"),
      v.literal("make_cut"),
      v.literal("miss_cut"),
      v.literal("matchup"),
      v.literal("round_leader"),
      v.literal("first_round_leader"),
      v.literal("nationality_winner"),
      v.literal("hole_in_one")
    ),
    playerId: v.optional(v.id("golfPlayers")),

    title: v.string(),
    description: v.string(),

    outcomes: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        playerId: v.optional(v.string()),
        odds: v.number(),
        impliedProbability: v.number(),
        totalVolume: v.number(),
      })
    ),

    liquidityParameter: v.number(),
    totalLiquidity: v.number(),
    totalVolume: v.number(),

    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("cancelled")
    ),

    winningOutcomeId: v.optional(v.string()),
    opensAt: v.number(),
    closesAt: v.number(),
    settledAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tournament", ["tournamentId", "type"])
    .index("by_type", ["type", "status"])
    .index("by_player", ["playerId"])
    .index("by_status", ["status"]),

  /**
   * Fantasy Golf Teams - User fantasy golf lineups
   */
  fantasyGolfTeams: defineTable({
    userId: v.id("users"),
    tournamentId: v.id("golfTournaments"),
    contestId: v.optional(v.string()),

    name: v.string(),
    roster: v.array(v.id("golfPlayers")),
    salaryCap: v.number(),
    salaryUsed: v.number(),

    // Scoring
    totalPoints: v.number(),
    projectedPoints: v.number(),
    rank: v.optional(v.number()),

    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("locked"),
      v.literal("complete")
    ),

    submittedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tournament", ["tournamentId"])
    .index("by_user_tournament", ["userId", "tournamentId"]),

  // ============================================================================
  // NBA PLAYOFFS TABLES
  // ============================================================================

  /**
   * NBA Teams - NBA franchise data
   */
  nbaTeams: defineTable({
    externalId: v.string(),
    name: v.string(),
    city: v.string(),
    abbreviation: v.string(),
    conference: v.union(v.literal("east"), v.literal("west")),
    division: v.string(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),

    // Season record
    wins: v.number(),
    losses: v.number(),
    winPct: v.number(),
    conferenceRank: v.number(),
    divisionRank: v.number(),
    gamesBack: v.number(),

    // Stats
    pointsPerGame: v.number(),
    pointsAllowedPerGame: v.number(),
    reboundsPerGame: v.number(),
    assistsPerGame: v.number(),
    netRating: v.number(),
    offensiveRating: v.number(),
    defensiveRating: v.number(),
    pace: v.number(),

    // Playoff info
    playoffSeed: v.optional(v.number()),
    isPlayoffTeam: v.boolean(),
    isEliminated: v.boolean(),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_conference", ["conference", "conferenceRank"])
    .index("by_playoff_seed", ["playoffSeed"]),

  /**
   * NBA Players - NBA player data
   */
  nbaPlayers: defineTable({
    externalId: v.string(),
    teamId: v.id("nbaTeams"),
    name: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    position: v.string(),
    jerseyNumber: v.optional(v.number()),
    height: v.optional(v.string()),
    weight: v.optional(v.number()),
    headshotUrl: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("injured"),
      v.literal("out"),
      v.literal("day_to_day"),
      v.literal("suspended")
    ),
    injuryDetails: v.optional(v.string()),

    // Season stats
    gamesPlayed: v.number(),
    minutesPerGame: v.number(),
    pointsPerGame: v.number(),
    reboundsPerGame: v.number(),
    assistsPerGame: v.number(),
    stealsPerGame: v.number(),
    blocksPerGame: v.number(),
    fieldGoalPct: v.number(),
    threePointPct: v.number(),
    freeThrowPct: v.number(),
    turnoversPerGame: v.number(),
    plusMinus: v.number(),

    // Advanced stats
    per: v.optional(v.number()),
    usageRate: v.optional(v.number()),
    trueShootingPct: v.optional(v.number()),

    // Fantasy
    fantasyPointsPerGame: v.number(),
    averageDraftPosition: v.optional(v.number()),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_team", ["teamId"])
    .searchIndex("search_nba_players", {
      searchField: "name",
      filterFields: ["teamId", "position"],
    }),

  /**
   * NBA Playoff Series - Playoff series tracking
   */
  nbaPlayoffSeries: defineTable({
    season: v.string(),
    round: v.union(
      v.literal("play_in"),
      v.literal("first_round"),
      v.literal("second_round"),
      v.literal("conference_finals"),
      v.literal("finals")
    ),
    conference: v.optional(v.union(v.literal("east"), v.literal("west"))),

    higherSeedId: v.id("nbaTeams"),
    lowerSeedId: v.id("nbaTeams"),
    higherSeedWins: v.number(),
    lowerSeedWins: v.number(),
    seriesWinnerId: v.optional(v.id("nbaTeams")),

    status: v.union(
      v.literal("upcoming"),
      v.literal("in_progress"),
      v.literal("complete")
    ),

    gameIds: v.array(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_season", ["season", "round"])
    .index("by_round", ["round", "status"])
    .index("by_higher_seed", ["higherSeedId"])
    .index("by_lower_seed", ["lowerSeedId"]),

  /**
   * NBA Games - NBA game data
   */
  nbaGames: defineTable({
    externalId: v.string(),
    season: v.string(),
    seriesId: v.optional(v.id("nbaPlayoffSeries")),
    gameNumber: v.optional(v.number()), // Game 1, 2, etc. for playoffs

    homeTeamId: v.id("nbaTeams"),
    awayTeamId: v.id("nbaTeams"),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    winnerId: v.optional(v.id("nbaTeams")),

    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("halftime"),
      v.literal("final"),
      v.literal("postponed"),
      v.literal("cancelled")
    ),
    quarter: v.optional(v.number()),
    timeRemaining: v.optional(v.string()),

    // Odds
    spread: v.optional(v.number()),
    spreadFavorite: v.optional(v.string()),
    total: v.optional(v.number()),
    homeMoneyline: v.optional(v.number()),
    awayMoneyline: v.optional(v.number()),

    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),

    venue: v.optional(v.string()),
    tvNetwork: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_season", ["season", "scheduledAt"])
    .index("by_series", ["seriesId", "gameNumber"])
    .index("by_home_team", ["homeTeamId"])
    .index("by_away_team", ["awayTeamId"])
    .index("by_status", ["status"]),

  /**
   * NBA Markets - NBA prediction markets
   */
  nbaMarkets: defineTable({
    type: v.union(
      v.literal("game_winner"),
      v.literal("game_spread"),
      v.literal("game_total"),
      v.literal("series_winner"),
      v.literal("series_length"),
      v.literal("conference_winner"),
      v.literal("finals_winner"),
      v.literal("finals_mvp"),
      v.literal("player_prop"),
      v.literal("player_points"),
      v.literal("player_rebounds"),
      v.literal("player_assists")
    ),
    gameId: v.optional(v.id("nbaGames")),
    seriesId: v.optional(v.id("nbaPlayoffSeries")),
    playerId: v.optional(v.id("nbaPlayers")),
    season: v.string(),

    title: v.string(),
    description: v.string(),

    outcomes: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        odds: v.number(),
        impliedProbability: v.number(),
        totalVolume: v.number(),
      })
    ),

    liquidityParameter: v.number(),
    totalLiquidity: v.number(),
    totalVolume: v.number(),

    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("cancelled")
    ),

    winningOutcomeId: v.optional(v.string()),
    opensAt: v.number(),
    closesAt: v.number(),
    settledAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type", "status"])
    .index("by_game", ["gameId"])
    .index("by_series", ["seriesId"])
    .index("by_player", ["playerId"])
    .index("by_season", ["season", "status"])
    .index("by_status", ["status"]),

  // ============================================================================
  // MLB PLAYOFFS TABLES
  // ============================================================================

  /**
   * MLB Teams - MLB franchise data
   */
  mlbTeams: defineTable({
    externalId: v.string(),
    name: v.string(),
    city: v.string(),
    abbreviation: v.string(),
    league: v.union(v.literal("al"), v.literal("nl")),
    division: v.union(v.literal("east"), v.literal("central"), v.literal("west")),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),

    // Season record
    wins: v.number(),
    losses: v.number(),
    winPct: v.number(),
    divisionRank: v.number(),
    gamesBack: v.number(),
    runsScored: v.number(),
    runsAllowed: v.number(),
    runDifferential: v.number(),

    // Team stats
    battingAverage: v.number(),
    onBasePct: v.number(),
    sluggingPct: v.number(),
    era: v.number(),
    whip: v.number(),

    // Playoff info
    playoffSeed: v.optional(v.number()),
    isPlayoffTeam: v.boolean(),
    isEliminated: v.boolean(),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_league", ["league", "divisionRank"])
    .index("by_division", ["division", "divisionRank"])
    .index("by_playoff_seed", ["playoffSeed"]),

  /**
   * MLB Players - MLB player data
   */
  mlbPlayers: defineTable({
    externalId: v.string(),
    teamId: v.id("mlbTeams"),
    name: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    position: v.string(),
    isPitcher: v.boolean(),
    jerseyNumber: v.optional(v.number()),
    bats: v.union(v.literal("L"), v.literal("R"), v.literal("S")),
    throws: v.union(v.literal("L"), v.literal("R")),
    headshotUrl: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("injured_list"),
      v.literal("day_to_day"),
      v.literal("suspended"),
      v.literal("minors")
    ),
    injuryDetails: v.optional(v.string()),

    // Batting stats (for position players)
    battingGames: v.optional(v.number()),
    atBats: v.optional(v.number()),
    hits: v.optional(v.number()),
    homeRuns: v.optional(v.number()),
    rbi: v.optional(v.number()),
    runs: v.optional(v.number()),
    stolenBases: v.optional(v.number()),
    battingAverage: v.optional(v.number()),
    onBasePct: v.optional(v.number()),
    sluggingPct: v.optional(v.number()),
    ops: v.optional(v.number()),

    // Pitching stats (for pitchers)
    pitchingGames: v.optional(v.number()),
    gamesStarted: v.optional(v.number()),
    wins: v.optional(v.number()),
    losses: v.optional(v.number()),
    saves: v.optional(v.number()),
    inningsPitched: v.optional(v.number()),
    strikeouts: v.optional(v.number()),
    walks: v.optional(v.number()),
    era: v.optional(v.number()),
    whip: v.optional(v.number()),

    // Fantasy
    fantasyPointsPerGame: v.number(),

    lastSyncAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_team", ["teamId"])
    .index("by_position", ["position"])
    .searchIndex("search_mlb_players", {
      searchField: "name",
      filterFields: ["teamId", "position", "isPitcher"],
    }),

  /**
   * MLB Playoff Series - Playoff series tracking
   */
  mlbPlayoffSeries: defineTable({
    season: v.string(),
    round: v.union(
      v.literal("wild_card"),
      v.literal("division_series"),
      v.literal("championship_series"),
      v.literal("world_series")
    ),
    league: v.optional(v.union(v.literal("al"), v.literal("nl"))),

    higherSeedId: v.id("mlbTeams"),
    lowerSeedId: v.id("mlbTeams"),
    higherSeedWins: v.number(),
    lowerSeedWins: v.number(),
    seriesWinnerId: v.optional(v.id("mlbTeams")),
    seriesToWin: v.number(), // 2 for wild card, 3 for division, 4 for LCS/WS

    status: v.union(
      v.literal("upcoming"),
      v.literal("in_progress"),
      v.literal("complete")
    ),

    gameIds: v.array(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_season", ["season", "round"])
    .index("by_round", ["round", "status"])
    .index("by_higher_seed", ["higherSeedId"])
    .index("by_lower_seed", ["lowerSeedId"]),

  /**
   * MLB Games - MLB game data
   */
  mlbGames: defineTable({
    externalId: v.string(),
    season: v.string(),
    seriesId: v.optional(v.id("mlbPlayoffSeries")),
    gameNumber: v.optional(v.number()),

    homeTeamId: v.id("mlbTeams"),
    awayTeamId: v.id("mlbTeams"),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    winnerId: v.optional(v.id("mlbTeams")),

    // Starting pitchers
    homePitcherId: v.optional(v.id("mlbPlayers")),
    awayPitcherId: v.optional(v.id("mlbPlayers")),

    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("final"),
      v.literal("postponed"),
      v.literal("suspended"),
      v.literal("cancelled")
    ),
    inning: v.optional(v.number()),
    inningHalf: v.optional(v.union(v.literal("top"), v.literal("bottom"))),

    // Odds
    runLine: v.optional(v.number()),
    runLineFavorite: v.optional(v.string()),
    total: v.optional(v.number()),
    homeMoneyline: v.optional(v.number()),
    awayMoneyline: v.optional(v.number()),

    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),

    venue: v.optional(v.string()),
    weather: v.optional(v.string()),
    tvNetwork: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_season", ["season", "scheduledAt"])
    .index("by_series", ["seriesId", "gameNumber"])
    .index("by_home_team", ["homeTeamId"])
    .index("by_away_team", ["awayTeamId"])
    .index("by_status", ["status"]),

  /**
   * MLB Markets - MLB prediction markets
   */
  mlbMarkets: defineTable({
    type: v.union(
      v.literal("game_winner"),
      v.literal("run_line"),
      v.literal("game_total"),
      v.literal("first_5_innings"),
      v.literal("series_winner"),
      v.literal("series_length"),
      v.literal("pennant_winner"),
      v.literal("world_series_winner"),
      v.literal("world_series_mvp"),
      v.literal("player_prop"),
      v.literal("pitcher_strikeouts"),
      v.literal("player_hits"),
      v.literal("player_home_runs")
    ),
    gameId: v.optional(v.id("mlbGames")),
    seriesId: v.optional(v.id("mlbPlayoffSeries")),
    playerId: v.optional(v.id("mlbPlayers")),
    season: v.string(),

    title: v.string(),
    description: v.string(),

    outcomes: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        odds: v.number(),
        impliedProbability: v.number(),
        totalVolume: v.number(),
      })
    ),

    liquidityParameter: v.number(),
    totalLiquidity: v.number(),
    totalVolume: v.number(),

    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("cancelled")
    ),

    winningOutcomeId: v.optional(v.string()),
    opensAt: v.number(),
    closesAt: v.number(),
    settledAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type", "status"])
    .index("by_game", ["gameId"])
    .index("by_series", ["seriesId"])
    .index("by_player", ["playerId"])
    .index("by_season", ["season", "status"])
    .index("by_status", ["status"]),

  // ============================================================================
  // BACKUP & RECOVERY TABLES
  // ============================================================================

  /**
   * Backup Snapshots - Track database export snapshots
   */
  backupSnapshots: defineTable({
    type: v.union(
      v.literal("full"),
      v.literal("incremental"),
      v.literal("on_demand")
    ),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    initiatedBy: v.optional(v.string()),
    tables: v.array(v.string()),
    recordCounts: v.record(v.string(), v.number()),
    storageLocation: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type", "status"])
    .index("by_started_at", ["startedAt"]),
});
