import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PULL Super App - Data Flywheel Schema
 * Proprietary data accumulation for competitive moat
 *
 * Categories:
 * - Trading Behavior Data
 * - Social Signal Data
 * - Email Intelligence Data
 * - Cross-Asset Correlation Data
 * - Outcome Data
 * - Data Monetization
 */

// ============================================================================
// TRADING BEHAVIOR DATA TABLES
// ============================================================================

/**
 * Trading Sessions - User trading session tracking
 */
export const tradingSessions = defineTable({
  userId: v.id("users"),
  sessionId: v.string(),

  // Session timing
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),

  // Session metrics
  ordersPlaced: v.number(),
  ordersFilled: v.number(),
  ordersCancelled: v.number(),
  totalVolume: v.number(),
  totalPnL: v.number(),

  // Session context
  dayOfWeek: v.number(), // 0-6
  hourOfDay: v.number(), // 0-23
  timezone: v.optional(v.string()),
  deviceType: v.optional(v.string()),
  appVersion: v.optional(v.string()),

  // Behavioral markers
  averageTimeBetweenOrders: v.optional(v.number()),
  maxConsecutiveWins: v.number(),
  maxConsecutiveLosses: v.number(),

  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_time", ["userId", "startedAt"])
  .index("by_day_hour", ["dayOfWeek", "hourOfDay"]);

/**
 * Order Flow Patterns - Aggregated order flow analysis
 */
export const orderFlowPatterns = defineTable({
  userId: v.id("users"),

  // Pattern identification
  patternType: v.union(
    v.literal("scalper"),
    v.literal("swing_trader"),
    v.literal("position_trader"),
    v.literal("news_reactive"),
    v.literal("momentum_chaser"),
    v.literal("contrarian"),
    v.literal("arbitrageur"),
    v.literal("market_maker"),
    v.literal("unknown")
  ),

  // Time preferences
  preferredTradingHours: v.array(v.number()), // Array of hours (0-23)
  preferredTradingDays: v.array(v.number()), // Array of days (0-6)
  averageSessionDuration: v.number(), // seconds
  tradingFrequency: v.number(), // trades per day

  // Order characteristics
  averageOrderSize: v.number(),
  medianOrderSize: v.number(),
  orderSizeStdDev: v.number(),
  preferredOrderTypes: v.array(v.string()),
  limitOrderRatio: v.number(), // % of limit vs market orders

  // Timing patterns
  averageHoldingPeriod: v.number(), // seconds
  quickExitRatio: v.number(), // % of positions closed within 1 min
  overnightHoldingRatio: v.number(), // % of positions held overnight

  // Risk metrics
  averageLeverage: v.optional(v.number()),
  maxDrawdownTolerance: v.number(),
  stopLossUsageRate: v.number(),
  takeProfitUsageRate: v.number(),

  // Performance correlation
  winRateByTimeOfDay: v.any(), // { hour: winRate }
  winRateByDayOfWeek: v.any(), // { day: winRate }

  confidence: v.number(), // 0-1 confidence in pattern identification
  sampleSize: v.number(), // Number of trades analyzed

  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_pattern", ["patternType"]);

/**
 * Risk Tolerance Metrics - Position sizing and risk behavior
 */
export const riskToleranceMetrics = defineTable({
  userId: v.id("users"),

  // Position sizing
  averagePositionSizePercent: v.number(), // % of portfolio
  maxPositionSizePercent: v.number(),
  positionSizeConsistency: v.number(), // 0-1 score

  // Risk metrics
  riskScore: v.number(), // 1-100
  riskCategory: v.union(
    v.literal("conservative"),
    v.literal("moderate"),
    v.literal("aggressive"),
    v.literal("very_aggressive")
  ),

  // Drawdown behavior
  maxHistoricalDrawdown: v.number(),
  averageDrawdown: v.number(),
  recoveryTimeAverage: v.number(), // seconds
  behaviorAfterDrawdown: v.union(
    v.literal("reduces_size"),
    v.literal("maintains_size"),
    v.literal("increases_size"),
    v.literal("stops_trading")
  ),

  // Loss handling
  averageLossPercent: v.number(),
  averageWinPercent: v.number(),
  winLossRatio: v.number(),
  profitFactor: v.number(),
  sharpeRatio: v.optional(v.number()),

  // Concentration
  assetConcentrationScore: v.number(), // 0-1, higher = more concentrated
  sectorConcentrationScore: v.number(),
  preferredAssetClasses: v.array(v.string()),

  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_risk_category", ["riskCategory"]);

/**
 * Market Type Performance - Win/loss patterns by market
 */
export const marketTypePerformance = defineTable({
  userId: v.id("users"),

  // Market identification
  assetClass: v.union(
    v.literal("crypto"),
    v.literal("prediction"),
    v.literal("rwa"),
    v.literal("all")
  ),
  marketCategory: v.optional(v.string()), // e.g., "sports", "politics", "finance"
  symbol: v.optional(v.string()),

  // Performance metrics
  totalTrades: v.number(),
  winningTrades: v.number(),
  losingTrades: v.number(),
  winRate: v.number(),

  totalVolume: v.number(),
  totalPnL: v.number(),
  averagePnL: v.number(),
  maxWin: v.number(),
  maxLoss: v.number(),

  // Expectancy
  expectancy: v.number(), // Average expected profit per trade
  edgeScore: v.number(), // 0-100, statistical edge in this market

  // Timing
  averageHoldingPeriod: v.number(),
  bestTimeToTrade: v.optional(v.number()), // hour with highest win rate

  // Market conditions
  performanceInVolatility: v.object({
    low: v.number(),
    medium: v.number(),
    high: v.number(),
  }),
  performanceInTrend: v.object({
    uptrend: v.number(),
    downtrend: v.number(),
    sideways: v.number(),
  }),

  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_asset", ["userId", "assetClass"])
  .index("by_asset_category", ["assetClass", "marketCategory"]);

/**
 * News Reaction Patterns - How users react to news
 */
export const newsReactionPatterns = defineTable({
  userId: v.id("users"),

  // Reaction speed
  averageReactionTimeSeconds: v.number(),
  reactionSpeedCategory: v.union(
    v.literal("very_fast"), // < 30s
    v.literal("fast"), // 30s - 2min
    v.literal("moderate"), // 2-10min
    v.literal("slow"), // > 10min
    v.literal("no_reaction")
  ),

  // News type reactions
  reactionsByNewsType: v.any(), // { newsType: { trades, winRate, avgPnL } }

  // Source preferences
  reactsToSources: v.array(v.string()), // news sources that trigger trades
  ignoresSources: v.array(v.string()),

  // Trading behavior on news
  increasesPositionOnNews: v.boolean(),
  tradesWithTrend: v.boolean(), // trades in direction of news
  contraTradesRatio: v.number(), // % of trades against news direction

  // Performance
  newsTradeWinRate: v.number(),
  newsTradeAveragePnL: v.number(),
  nonNewsTradeWinRate: v.number(),

  // Sample data
  totalNewsEvents: v.number(),
  totalNewsReactions: v.number(),

  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_reaction_speed", ["reactionSpeedCategory"]);

// ============================================================================
// SOCIAL SIGNAL DATA TABLES
// ============================================================================

/**
 * User Follows - Who follows whom
 */
export const userFollows = defineTable({
  followerId: v.id("users"),
  followeeId: v.id("users"),

  // Follow context
  followSource: v.union(
    v.literal("search"),
    v.literal("leaderboard"),
    v.literal("recommendation"),
    v.literal("copy_trading"),
    v.literal("chat_room"),
    v.literal("referral"),
    v.literal("other")
  ),

  // Engagement
  notificationsEnabled: v.boolean(),
  copyTradingEnabled: v.boolean(),
  copyAllocation: v.optional(v.number()), // % of portfolio

  followedAt: v.number(),
  unfollowedAt: v.optional(v.number()),
  isActive: v.boolean(),
})
  .index("by_follower", ["followerId", "isActive"])
  .index("by_followee", ["followeeId", "isActive"])
  .index("by_pair", ["followerId", "followeeId"]);

/**
 * Copy Trading Records - Which traders get copied
 */
export const copyTradingRecords = defineTable({
  copierId: v.id("users"),
  traderId: v.id("users"),

  // Copy settings
  allocationPercent: v.number(),
  maxPositionSize: v.optional(v.number()),
  copyAllAssets: v.boolean(),
  allowedAssetClasses: v.array(v.string()),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("stopped")
  ),

  // Performance
  totalTradesCopied: v.number(),
  totalVolumeCopied: v.number(),
  totalPnL: v.number(),
  copierWinRate: v.number(),

  // Attribution
  traderPnLContribution: v.number(), // PnL from this trader

  startedAt: v.number(),
  pausedAt: v.optional(v.number()),
  stoppedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_copier", ["copierId", "status"])
  .index("by_trader", ["traderId", "status"])
  .index("by_performance", ["totalPnL"]);

/**
 * Trader Leaderboard Snapshots - Historical leaderboard data
 */
export const traderLeaderboards = defineTable({
  userId: v.id("users"),

  // Leaderboard type
  leaderboardType: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("all_time")
  ),
  assetClass: v.optional(v.string()),
  category: v.optional(v.string()),

  // Rankings
  rank: v.number(),
  previousRank: v.optional(v.number()),
  rankChange: v.number(),

  // Metrics
  totalPnL: v.number(),
  winRate: v.number(),
  totalTrades: v.number(),
  totalVolume: v.number(),
  sharpeRatio: v.optional(v.number()),
  maxDrawdown: v.number(),

  // Social metrics
  followerCount: v.number(),
  copierCount: v.number(),
  followerGrowth: v.number(), // % change in period

  // Verification
  isVerified: v.boolean(),
  verificationBadges: v.array(v.string()),

  periodStart: v.number(),
  periodEnd: v.number(),
  snapshotAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_type_period", ["leaderboardType", "periodStart"])
  .index("by_rank", ["leaderboardType", "rank"]);

/**
 * Chat Room Sentiment - Sentiment analysis by market
 */
export const chatRoomSentiment = defineTable({
  roomId: v.id("matrixRooms"),

  // Market association
  associatedAssetClass: v.optional(v.string()),
  associatedSymbol: v.optional(v.string()),
  associatedCategory: v.optional(v.string()),

  // Sentiment metrics
  sentimentScore: v.number(), // -1 to 1
  sentimentCategory: v.union(
    v.literal("very_bearish"),
    v.literal("bearish"),
    v.literal("neutral"),
    v.literal("bullish"),
    v.literal("very_bullish")
  ),

  // Engagement metrics
  messageCount: v.number(),
  uniqueParticipants: v.number(),
  avgMessagesPerUser: v.number(),

  // Conviction signals
  convictionScore: v.number(), // 0-100
  mentionCount: v.number(), // times the asset was mentioned
  priceTargetMentions: v.array(v.object({
    target: v.number(),
    direction: v.string(),
    count: v.number(),
  })),

  // Key phrases
  topBullishPhrases: v.array(v.string()),
  topBearishPhrases: v.array(v.string()),
  emergingTopics: v.array(v.string()),

  // Time window
  windowStart: v.number(),
  windowEnd: v.number(),
  calculatedAt: v.number(),
})
  .index("by_room", ["roomId"])
  .index("by_asset", ["associatedAssetClass", "associatedSymbol"])
  .index("by_sentiment", ["sentimentCategory", "calculatedAt"]);

/**
 * Viral Content Patterns - Content that drives engagement
 */
export const viralContentPatterns = defineTable({
  contentId: v.string(),
  contentType: v.union(
    v.literal("message"),
    v.literal("trade_share"),
    v.literal("prediction"),
    v.literal("analysis"),
    v.literal("news_share"),
    v.literal("meme"),
    v.literal("tutorial")
  ),

  authorId: v.id("users"),
  roomId: v.optional(v.id("matrixRooms")),

  // Content metadata
  contentPreview: v.string(), // First 500 chars
  mediaType: v.optional(v.string()),
  hashtags: v.array(v.string()),
  mentionedAssets: v.array(v.string()),

  // Virality metrics
  viewCount: v.number(),
  reactionCount: v.number(),
  replyCount: v.number(),
  shareCount: v.number(),
  viralityScore: v.number(), // Composite score 0-100

  // Engagement timeline
  engagementByHour: v.array(v.number()), // Engagement count per hour
  peakEngagementHour: v.number(),
  timeToViralMinutes: v.optional(v.number()),

  // Impact
  tradingActivitySpike: v.boolean(),
  associatedVolumeChange: v.optional(v.number()),
  priceImpact: v.optional(v.number()),

  createdAt: v.number(),
  analyzedAt: v.number(),
})
  .index("by_author", ["authorId"])
  .index("by_type", ["contentType", "viralityScore"])
  .index("by_virality", ["viralityScore"]);

/**
 * Community Conviction Signals - Aggregated community sentiment
 */
export const communityConviction = defineTable({
  // Asset identification
  assetClass: v.string(),
  symbol: v.string(),
  category: v.optional(v.string()),

  // Conviction metrics
  overallConviction: v.number(), // -100 to 100
  convictionDirection: v.union(
    v.literal("strong_sell"),
    v.literal("sell"),
    v.literal("neutral"),
    v.literal("buy"),
    v.literal("strong_buy")
  ),

  // Signal sources
  chatSentimentScore: v.number(),
  tradingFlowScore: v.number(), // buy vs sell pressure
  socialMentionScore: v.number(),
  copyTradingFlowScore: v.number(), // are top traders buying?

  // Participation
  totalParticipants: v.number(),
  activeTraders: v.number(),
  newEntrants: v.number(), // First-time traders in this asset

  // Historical comparison
  convictionChangePercent: v.number(),
  isAtExtreme: v.boolean(),
  extremeType: v.optional(v.union(
    v.literal("max_bullish"),
    v.literal("max_bearish")
  )),

  // Prediction accuracy
  historicalAccuracy: v.optional(v.number()), // How accurate past signals were

  windowStart: v.number(),
  windowEnd: v.number(),
  calculatedAt: v.number(),
})
  .index("by_asset", ["assetClass", "symbol"])
  .index("by_conviction", ["convictionDirection", "overallConviction"])
  .index("by_time", ["calculatedAt"]);

// ============================================================================
// EMAIL INTELLIGENCE DATA TABLES (with consent)
// ============================================================================

/**
 * Data Consent Records - User consent tracking
 */
export const dataConsentRecords = defineTable({
  userId: v.id("users"),

  // Consent types
  consentType: v.union(
    v.literal("email_analysis"),
    v.literal("calendar_analysis"),
    v.literal("trading_data_sharing"),
    v.literal("anonymized_data_sale"),
    v.literal("research_participation"),
    v.literal("premium_insights")
  ),

  // Consent status
  status: v.union(
    v.literal("granted"),
    v.literal("revoked"),
    v.literal("expired")
  ),

  // Consent details
  scope: v.array(v.string()), // Specific data types consented
  purpose: v.string(),
  thirdPartySharing: v.boolean(),

  // Legal
  consentVersion: v.string(),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),

  grantedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_type", ["userId", "consentType"])
  .index("by_status", ["status"]);

/**
 * Newsletter Market Correlations - Newsletter content vs market moves
 */
export const newsletterCorrelations = defineTable({
  userId: v.id("users"),
  emailId: v.id("emails"),

  // Newsletter info
  newsletterSource: v.string(),
  newsletterName: v.optional(v.string()),
  receivedAt: v.number(),

  // Content analysis
  extractedTopics: v.array(v.string()),
  extractedTickers: v.array(v.string()),
  sentimentScore: v.number(), // -1 to 1
  urgencyScore: v.number(), // 0-1

  // Market correlation
  correlatedAssets: v.array(v.object({
    symbol: v.string(),
    priceAtReceipt: v.number(),
    priceAfter1h: v.optional(v.number()),
    priceAfter24h: v.optional(v.number()),
    priceAfter7d: v.optional(v.number()),
    correlation: v.optional(v.number()),
  })),

  // User behavior after
  userTradedAfter: v.boolean(),
  tradingDelayMinutes: v.optional(v.number()),
  tradingDirection: v.optional(v.string()),
  tradingPnL: v.optional(v.number()),

  // Signal quality
  predictiveScore: v.optional(v.number()), // How predictive this newsletter is

  analyzedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_source", ["newsletterSource"])
  .index("by_predictive", ["predictiveScore"]);

/**
 * Calendar Event Trading Correlations - Calendar events vs trading
 */
export const calendarTradingCorrelations = defineTable({
  userId: v.id("users"),

  // Event info (anonymized)
  eventType: v.union(
    v.literal("meeting"),
    v.literal("travel"),
    v.literal("conference"),
    v.literal("earnings_call"),
    v.literal("personal"),
    v.literal("other")
  ),
  eventCategory: v.optional(v.string()),
  eventDuration: v.number(), // minutes
  eventTime: v.number(),

  // Trading behavior around event
  tradingBefore: v.object({
    trades: v.number(),
    volume: v.number(),
    pnl: v.number(),
    timeWindow: v.number(), // hours before
  }),
  tradingDuring: v.object({
    trades: v.number(),
    volume: v.number(),
    pnl: v.number(),
  }),
  tradingAfter: v.object({
    trades: v.number(),
    volume: v.number(),
    pnl: v.number(),
    timeWindow: v.number(), // hours after
  }),

  // Patterns
  reducesActivityBefore: v.boolean(),
  increasesActivityAfter: v.boolean(),
  behaviorChangeScore: v.number(), // How much trading changes around events

  analyzedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_event_type", ["eventType"]);

/**
 * Information Source Rankings - Which sources predict moves
 */
export const informationSourceRankings = defineTable({
  userId: v.id("users"),

  // Source identification
  sourceType: v.union(
    v.literal("newsletter"),
    v.literal("twitter"),
    v.literal("discord"),
    v.literal("telegram"),
    v.literal("news_site"),
    v.literal("analyst"),
    v.literal("friend"),
    v.literal("platform_alert"),
    v.literal("other")
  ),
  sourceName: v.string(),
  sourceIdentifier: v.optional(v.string()), // Hashed identifier

  // Usage metrics
  totalSignals: v.number(),
  signalsActedOn: v.number(),
  actedOnRatio: v.number(),

  // Performance
  averageReactionTime: v.number(), // seconds
  signalToTradeCorrelation: v.number(),
  profitableSignalsRatio: v.number(),
  averagePnLPerSignal: v.number(),

  // Ranking
  rankScore: v.number(), // Composite ranking score
  rank: v.number(), // User's ranking of this source

  // Trust metrics
  userTrustScore: v.optional(v.number()), // User's self-reported trust
  calculatedTrustScore: v.number(), // Based on outcomes

  firstUsedAt: v.number(),
  lastUsedAt: v.number(),
  calculatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_source", ["sourceType", "sourceName"])
  .index("by_rank", ["userId", "rank"]);

// ============================================================================
// CROSS-ASSET CORRELATION DATA TABLES
// ============================================================================

/**
 * Cross Asset Correlations - Correlations between different assets
 */
export const crossAssetCorrelations = defineTable({
  // Asset pair
  asset1Class: v.string(),
  asset1Symbol: v.string(),
  asset2Class: v.string(),
  asset2Symbol: v.string(),

  // Correlation metrics
  correlation: v.number(), // -1 to 1
  correlationStrength: v.union(
    v.literal("strong_negative"),
    v.literal("moderate_negative"),
    v.literal("weak_negative"),
    v.literal("none"),
    v.literal("weak_positive"),
    v.literal("moderate_positive"),
    v.literal("strong_positive")
  ),

  // Statistical significance
  pValue: v.number(),
  sampleSize: v.number(),
  standardError: v.number(),
  confidenceInterval: v.object({
    lower: v.number(),
    upper: v.number(),
  }),

  // Lag analysis
  optimalLagHours: v.number(), // Which asset leads
  leaderAsset: v.optional(v.string()),
  lagCorrelation: v.optional(v.number()),

  // Time series
  rollingCorrelation30d: v.number(),
  rollingCorrelation90d: v.number(),
  correlationTrend: v.union(
    v.literal("strengthening"),
    v.literal("stable"),
    v.literal("weakening")
  ),

  // Regime analysis
  correlationInBullMarket: v.optional(v.number()),
  correlationInBearMarket: v.optional(v.number()),
  correlationInHighVol: v.optional(v.number()),

  windowStart: v.number(),
  windowEnd: v.number(),
  calculatedAt: v.number(),
})
  .index("by_pair", ["asset1Class", "asset1Symbol", "asset2Class", "asset2Symbol"])
  .index("by_strength", ["correlationStrength", "correlation"]);

/**
 * Market Regime Detection - Current market regime classification
 */
export const marketRegimes = defineTable({
  // Market identification
  assetClass: v.string(),
  symbol: v.optional(v.string()),

  // Regime classification
  regime: v.union(
    v.literal("bull_low_vol"),
    v.literal("bull_high_vol"),
    v.literal("bear_low_vol"),
    v.literal("bear_high_vol"),
    v.literal("sideways_low_vol"),
    v.literal("sideways_high_vol"),
    v.literal("crisis"),
    v.literal("recovery")
  ),

  // Regime metrics
  trendDirection: v.union(
    v.literal("up"),
    v.literal("down"),
    v.literal("sideways")
  ),
  trendStrength: v.number(), // 0-1
  volatilityLevel: v.number(),
  volatilityPercentile: v.number(), // Historical percentile

  // Transition probabilities
  transitionProbabilities: v.object({
    bull_low_vol: v.number(),
    bull_high_vol: v.number(),
    bear_low_vol: v.number(),
    bear_high_vol: v.number(),
    sideways_low_vol: v.number(),
    sideways_high_vol: v.number(),
  }),

  // Duration
  regimeStartedAt: v.number(),
  estimatedDurationDays: v.optional(v.number()),

  // Confidence
  confidence: v.number(),

  calculatedAt: v.number(),
})
  .index("by_asset", ["assetClass", "symbol"])
  .index("by_regime", ["regime"]);

/**
 * Alternative Data Correlations - Pokemon, weather, sports vs markets
 */
export const alternativeDataCorrelations = defineTable({
  // Alternative data source
  alternativeDataType: v.union(
    v.literal("pokemon_prices"),
    v.literal("weather_data"),
    v.literal("sports_betting"),
    v.literal("google_trends"),
    v.literal("social_sentiment"),
    v.literal("travel_bookings"),
    v.literal("gaming_activity"),
    v.literal("other")
  ),
  alternativeMetric: v.string(),

  // Market data
  assetClass: v.string(),
  symbol: v.string(),

  // Correlation analysis
  correlation: v.number(),
  lagDays: v.number(), // Positive = alternative leads market
  predictivePower: v.number(), // 0-1 R-squared for predictions

  // Signal generation
  signalThreshold: v.optional(v.number()),
  signalDirection: v.optional(v.string()),
  historicalSignalAccuracy: v.optional(v.number()),

  // Statistical validity
  sampleSize: v.number(),
  pValue: v.number(),
  isStatisticallySignificant: v.boolean(),

  // Use case
  useCase: v.optional(v.string()),
  notes: v.optional(v.string()),

  discoveredAt: v.number(),
  lastValidatedAt: v.number(),
})
  .index("by_alt_type", ["alternativeDataType"])
  .index("by_asset", ["assetClass", "symbol"])
  .index("by_predictive", ["predictivePower"]);

// ============================================================================
// OUTCOME DATA TABLES
// ============================================================================

/**
 * Signal Performance Tracking - Which signals predicted moves
 */
export const signalPerformance = defineTable({
  // Signal identification
  signalId: v.string(),
  signalType: v.union(
    v.literal("community_conviction"),
    v.literal("chat_sentiment"),
    v.literal("newsletter"),
    v.literal("copy_trader"),
    v.literal("cross_asset"),
    v.literal("alternative_data"),
    v.literal("technical"),
    v.literal("model_prediction")
  ),
  signalSource: v.string(),

  // Signal details
  assetClass: v.string(),
  symbol: v.string(),
  direction: v.union(v.literal("long"), v.literal("short")),
  confidence: v.number(),

  priceAtSignal: v.number(),
  signalTimestamp: v.number(),

  // Outcomes
  outcomes: v.object({
    "1h": v.optional(v.object({
      price: v.number(),
      returnPercent: v.number(),
      correct: v.boolean(),
    })),
    "4h": v.optional(v.object({
      price: v.number(),
      returnPercent: v.number(),
      correct: v.boolean(),
    })),
    "24h": v.optional(v.object({
      price: v.number(),
      returnPercent: v.number(),
      correct: v.boolean(),
    })),
    "7d": v.optional(v.object({
      price: v.number(),
      returnPercent: v.number(),
      correct: v.boolean(),
    })),
    "30d": v.optional(v.object({
      price: v.number(),
      returnPercent: v.number(),
      correct: v.boolean(),
    })),
  }),

  // Aggregate performance
  overallCorrect: v.optional(v.boolean()),
  maxReturn: v.optional(v.number()),
  maxDrawdown: v.optional(v.number()),

  // User actions
  usersActedOn: v.number(),
  usersThatProfited: v.number(),
  averageUserPnL: v.optional(v.number()),

  lastUpdatedAt: v.number(),
})
  .index("by_type", ["signalType", "signalTimestamp"])
  .index("by_asset", ["assetClass", "symbol"])
  .index("by_source", ["signalSource"]);

/**
 * Trader Alpha Analysis - Which traders have real alpha
 */
export const traderAlphaAnalysis = defineTable({
  userId: v.id("users"),

  // Alpha metrics
  alphaScore: v.number(), // -100 to 100
  hasStatisticalAlpha: v.boolean(),
  alphaCategory: v.union(
    v.literal("significant_alpha"),
    v.literal("marginal_alpha"),
    v.literal("no_alpha"),
    v.literal("negative_alpha"),
    v.literal("insufficient_data")
  ),

  // Performance vs benchmarks
  returnsVsBenchmark: v.number(), // Excess returns
  informationRatio: v.optional(v.number()),
  trackingError: v.optional(v.number()),

  // Risk-adjusted performance
  sharpeRatio: v.optional(v.number()),
  sortinoRatio: v.optional(v.number()),
  calmarRatio: v.optional(v.number()),

  // Consistency
  consistencyScore: v.number(), // 0-100
  profitableMonths: v.number(),
  totalMonths: v.number(),
  maxConsecutiveLossMonths: v.number(),

  // Skill vs luck analysis
  skillLuckRatio: v.number(), // Higher = more skill
  bootstrapPValue: v.number(), // Statistical test for skill

  // Alpha breakdown
  alphaByAssetClass: v.any(), // { assetClass: alphaScore }
  alphaByTimeOfDay: v.any(), // { hour: alphaScore }
  alphaByMarketRegime: v.any(), // { regime: alphaScore }

  // Data quality
  dataQualityScore: v.number(),
  sampleSize: v.number(),
  analysisStartDate: v.number(),
  analysisEndDate: v.number(),

  calculatedAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_alpha", ["alphaCategory", "alphaScore"])
  .index("by_skill", ["skillLuckRatio"]);

/**
 * Content Engagement Outcomes - Which content drove engagement
 */
export const contentEngagementOutcomes = defineTable({
  contentId: v.string(),
  contentType: v.string(),
  authorId: v.id("users"),

  // Content metadata
  topic: v.optional(v.string()),
  assetsMentioned: v.array(v.string()),
  sentiment: v.optional(v.string()),

  // Engagement metrics
  totalViews: v.number(),
  uniqueViewers: v.number(),
  engagementRate: v.number(),

  // Conversion outcomes
  viewersWhoTraded: v.number(),
  viewerTradingConversion: v.number(),
  tradingVolumeGenerated: v.number(),

  // Financial impact
  averageViewerPnL: v.optional(v.number()),
  totalViewerPnL: v.optional(v.number()),

  // Virality outcomes
  shares: v.number(),
  newFollowersGained: v.number(),

  // Long-term impact
  retentionImpact: v.optional(v.number()), // Did viewers return?
  referralsGenerated: v.number(),

  publishedAt: v.number(),
  analyzedAt: v.number(),
})
  .index("by_author", ["authorId"])
  .index("by_type", ["contentType"])
  .index("by_engagement", ["engagementRate"]);

/**
 * Onboarding Funnel Analytics - Which flows converted
 */
export const onboardingFunnelAnalytics = defineTable({
  // Funnel identification
  funnelId: v.string(),
  funnelName: v.string(),
  funnelVersion: v.string(),

  // A/B test info
  experimentId: v.optional(v.string()),
  variant: v.optional(v.string()),

  // Time period
  periodStart: v.number(),
  periodEnd: v.number(),

  // Funnel metrics
  totalStarted: v.number(),
  stepCompletions: v.array(v.object({
    stepName: v.string(),
    completed: v.number(),
    dropoffRate: v.number(),
    avgTimeSeconds: v.number(),
  })),
  totalCompleted: v.number(),
  overallConversionRate: v.number(),

  // User segments
  conversionBySource: v.any(), // { source: conversionRate }
  conversionByDevice: v.any(),
  conversionByCountry: v.any(),

  // Quality metrics
  completersWhoTraded: v.number(),
  completerFirstTradeTime: v.number(), // avg time to first trade
  completer30dRetention: v.number(),
  completerLTV: v.optional(v.number()),

  // Optimization opportunities
  biggestDropoffStep: v.string(),
  suggestedImprovements: v.array(v.string()),

  calculatedAt: v.number(),
})
  .index("by_funnel", ["funnelId", "periodStart"])
  .index("by_experiment", ["experimentId"])
  .index("by_conversion", ["overallConversionRate"]);

// ============================================================================
// DATA MONETIZATION TABLES
// ============================================================================

/**
 * Data Products - Available data products for sale
 */
export const dataProducts = defineTable({
  productId: v.string(),
  name: v.string(),
  description: v.string(),

  // Product type
  productType: v.union(
    v.literal("signal_feed"),
    v.literal("predictive_model"),
    v.literal("research_report"),
    v.literal("data_export"),
    v.literal("api_access"),
    v.literal("custom_analysis")
  ),

  // Data included
  dataCategories: v.array(v.string()),
  assetClasses: v.array(v.string()),
  updateFrequency: v.union(
    v.literal("real_time"),
    v.literal("hourly"),
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("one_time")
  ),

  // Pricing
  pricingModel: v.union(
    v.literal("subscription"),
    v.literal("per_query"),
    v.literal("tiered"),
    v.literal("custom")
  ),
  basePrice: v.number(),
  currency: v.string(),

  // Subscription tiers
  tiers: v.optional(v.array(v.object({
    name: v.string(),
    price: v.number(),
    features: v.array(v.string()),
    limits: v.any(),
  }))),

  // Access control
  minKycTier: v.string(),
  requiresInstitutional: v.boolean(),
  requiresNDA: v.boolean(),

  // Status
  status: v.union(
    v.literal("draft"),
    v.literal("active"),
    v.literal("deprecated"),
    v.literal("discontinued")
  ),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_type", ["productType", "status"])
  .index("by_status", ["status"]);

/**
 * Data Subscriptions - Customer subscriptions to data products
 */
export const dataSubscriptions = defineTable({
  // Subscriber info
  subscriberId: v.optional(v.id("users")),
  organizationId: v.optional(v.string()),
  subscriberType: v.union(
    v.literal("individual"),
    v.literal("institutional"),
    v.literal("partner")
  ),

  // Product info
  productId: v.string(),
  tierId: v.optional(v.string()),

  // Subscription status
  status: v.union(
    v.literal("trial"),
    v.literal("active"),
    v.literal("past_due"),
    v.literal("cancelled"),
    v.literal("expired")
  ),

  // Billing
  billingCycle: v.union(
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("annual")
  ),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  price: v.number(),
  currency: v.string(),

  // Usage
  usageThisMonth: v.number(),
  usageLimit: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),

  // API access
  apiKeyHash: v.optional(v.string()),
  allowedIPs: v.optional(v.array(v.string())),

  startedAt: v.number(),
  cancelledAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_subscriber", ["subscriberId"])
  .index("by_org", ["organizationId"])
  .index("by_product", ["productId", "status"])
  .index("by_status", ["status"]);

/**
 * Research Reports - Generated research reports for sale
 */
export const researchReports = defineTable({
  reportId: v.string(),
  title: v.string(),
  summary: v.string(),

  // Report type
  reportType: v.union(
    v.literal("market_overview"),
    v.literal("asset_deep_dive"),
    v.literal("correlation_analysis"),
    v.literal("sentiment_report"),
    v.literal("trader_flow_analysis"),
    v.literal("prediction_accuracy"),
    v.literal("custom")
  ),

  // Content
  assetClasses: v.array(v.string()),
  symbols: v.array(v.string()),
  timeframeDays: v.number(),

  // Report content
  sections: v.array(v.object({
    title: v.string(),
    content: v.string(),
    charts: v.array(v.string()), // URLs to chart images
  })),
  keyFindings: v.array(v.string()),

  // Pricing
  price: v.number(),
  currency: v.string(),
  isFree: v.boolean(),

  // Access
  accessLevel: v.union(
    v.literal("public"),
    v.literal("subscribers"),
    v.literal("premium"),
    v.literal("institutional")
  ),

  // Metrics
  downloads: v.number(),
  views: v.number(),
  revenue: v.number(),

  // Status
  status: v.union(
    v.literal("draft"),
    v.literal("review"),
    v.literal("published"),
    v.literal("archived")
  ),

  generatedAt: v.number(),
  publishedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_type", ["reportType", "status"])
  .index("by_access", ["accessLevel", "status"])
  .index("by_published", ["publishedAt"]);

/**
 * Anonymized Signal Feed - Aggregated anonymized signals for institutions
 */
export const anonymizedSignalFeed = defineTable({
  signalId: v.string(),

  // Signal metadata
  signalType: v.string(),
  assetClass: v.string(),
  symbol: v.string(),

  // Signal content
  direction: v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral")),
  strength: v.number(), // 0-100
  confidence: v.number(), // 0-1

  // Aggregation info
  participantCount: v.number(), // Anonymized count
  consensusLevel: v.number(), // How much agreement

  // Historical accuracy
  historicalAccuracy: v.optional(v.number()),
  averageReturn: v.optional(v.number()),

  // Delivery
  deliveredAt: v.number(),
  expiresAt: v.number(),

  // Access tracking
  subscriberDeliveries: v.number(),

  createdAt: v.number(),
})
  .index("by_asset", ["assetClass", "symbol"])
  .index("by_type", ["signalType"])
  .index("by_delivered", ["deliveredAt"]);

// Export all tables for inclusion in main schema
export const dataFlywheelTables = {
  // Trading Behavior
  tradingSessions,
  orderFlowPatterns,
  riskToleranceMetrics,
  marketTypePerformance,
  newsReactionPatterns,

  // Social Signals
  userFollows,
  copyTradingRecords,
  traderLeaderboards,
  chatRoomSentiment,
  viralContentPatterns,
  communityConviction,

  // Email Intelligence
  dataConsentRecords,
  newsletterCorrelations,
  calendarTradingCorrelations,
  informationSourceRankings,

  // Cross-Asset Correlations
  crossAssetCorrelations,
  marketRegimes,
  alternativeDataCorrelations,

  // Outcome Data
  signalPerformance,
  traderAlphaAnalysis,
  contentEngagementOutcomes,
  onboardingFunnelAnalytics,

  // Monetization
  dataProducts,
  dataSubscriptions,
  researchReports,
  anonymizedSignalFeed,
};
