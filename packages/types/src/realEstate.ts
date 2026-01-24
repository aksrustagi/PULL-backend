/**
 * Real Estate Prediction Market Types for PULL Super App
 *
 * Covers real estate prediction markets, brokerage management,
 * agent relationships, market sentiment tools, and B2B distribution.
 */

// ============================================================================
// REAL ESTATE PREDICTION MARKET TYPES
// ============================================================================

/** Real estate prediction market categories */
export type RealEstateMarketCategory =
  | "median_price"           // Will median home price exceed $X?
  | "mortgage_rates"         // Will mortgage rates drop below X%?
  | "housing_inventory"      // Will inventory increase by X%?
  | "development_sellout"    // Will [development] sell out by [date]?
  | "rent_prices"            // Will average rent exceed $X?
  | "days_on_market"         // Will average DOM drop below X days?
  | "home_sales_volume"      // Will home sales exceed X units?
  | "price_per_sqft"         // Will price per sqft exceed $X?
  | "foreclosure_rate"       // Will foreclosure rate exceed X%?
  | "new_construction"       // Will new construction starts exceed X?
  | "custom";                // Custom market type

/** Geographic scope for real estate markets */
export type GeographicScope =
  | "national"
  | "state"
  | "metro"
  | "city"
  | "zip_code"
  | "neighborhood"
  | "development";

/** Real estate market status */
export type RealEstateMarketStatus =
  | "draft"
  | "pending_review"
  | "upcoming"
  | "open"
  | "trading_halted"
  | "closed"
  | "resolving"
  | "settled"
  | "cancelled"
  | "disputed";

/** Real estate prediction event */
export interface RealEstatePredictionEvent {
  id: string;
  ticker: string;
  title: string;
  description: string;
  category: RealEstateMarketCategory;
  subcategory?: string;
  status: RealEstateMarketStatus;

  // Geographic targeting
  geographicScope: GeographicScope;
  country: string;
  state?: string;
  metro?: string;
  city?: string;
  zipCode?: string;
  neighborhood?: string;
  developmentId?: string;

  // Market parameters
  targetMetric: string;           // e.g., "median_home_price"
  targetValue: number;            // e.g., 500000
  comparisonOperator: "gt" | "gte" | "lt" | "lte" | "eq";
  currentValue?: number;          // Current observed value
  baselineValue?: number;         // Value at market creation

  // Resolution
  resolutionSource: string;       // e.g., "zillow", "redfin", "census"
  resolutionSourceUrl?: string;
  resolutionDetails?: string;
  resolutionDate: Date;
  settlementValue?: number;
  outcome?: "yes" | "no";

  // Trading data
  yesPrice: number;
  noPrice: number;
  yesVolume: number;
  noVolume: number;
  totalVolume: number;
  openInterest: number;
  liquidity: number;

  // Timing
  openTime: Date;
  closeTime: Date;
  settledAt?: Date;

  // Metadata
  imageUrl?: string;
  tags: string[];
  dataUpdateFrequency: "hourly" | "daily" | "weekly" | "monthly";
  lastDataUpdate?: Date;

  // Sponsorship (for B2B)
  sponsoredBy?: string;
  sponsorBrokerageId?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** Market data point for historical tracking */
export interface RealEstateMarketDataPoint {
  id: string;
  eventId: string;
  timestamp: Date;
  yesPrice: number;
  noPrice: number;
  volume: number;
  openInterest: number;
  targetMetricValue?: number;
}

/** Real estate specific position */
export interface RealEstatePredictionPosition {
  id: string;
  userId: string;
  eventId: string;
  side: "yes" | "no";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  settledPnL?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// BROKERAGE & AGENT TYPES
// ============================================================================

/** Brokerage status */
export type BrokerageStatus =
  | "pending"
  | "active"
  | "suspended"
  | "inactive";

/** Brokerage tier for B2B pricing */
export type BrokerageTier =
  | "starter"      // 1-10 agents
  | "growth"       // 11-50 agents
  | "professional" // 51-200 agents
  | "enterprise";  // 200+ agents

/** Real estate brokerage */
export interface Brokerage {
  id: string;
  name: string;
  legalName: string;
  status: BrokerageStatus;
  tier: BrokerageTier;

  // Contact info
  email: string;
  phone?: string;
  website?: string;

  // Address
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;

  // Branding
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;

  // Licensing
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: Date;

  // Settings
  whitelabelEnabled: boolean;
  customDomain?: string;

  // Stats
  agentCount: number;
  activeAgentCount: number;
  totalReferrals: number;
  totalVolume: number;

  // Billing
  billingEmail?: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: "active" | "past_due" | "cancelled";

  // Admin
  primaryContactId?: string;

  // Integration
  zillowFlexEnabled: boolean;
  zillowFlexTeamId?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** Agent status */
export type AgentStatus =
  | "pending_verification"
  | "active"
  | "suspended"
  | "inactive";

/** Agent specialization */
export type AgentSpecialization =
  | "residential"
  | "commercial"
  | "luxury"
  | "investment"
  | "first_time_buyer"
  | "relocation"
  | "new_construction"
  | "land"
  | "multi_family";

/** Real estate agent */
export interface RealEstateAgent {
  id: string;
  userId: string;
  brokerageId: string;
  status: AgentStatus;

  // Profile
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;

  // Licensing
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: Date;

  // Professional info
  title?: string;
  team?: string;
  specializations: AgentSpecialization[];
  serviceAreas: string[]; // ZIP codes or city names
  languages: string[];
  yearsExperience: number;

  // Social/marketing
  website?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;

  // Performance
  totalTransactions: number;
  totalVolume: number;
  averageRating: number;
  reviewCount: number;

  // PULL-specific stats
  totalReferrals: number;
  activeReferrals: number;
  referralEarnings: number;
  predictionAccuracy?: number;
  marketsParticipated: number;
  clientsReferred: number;

  // Referral settings
  referralCode: string;
  referralCommissionRate: number; // Percentage

  // Zillow integration
  zillowAgentId?: string;
  zillowFlexAgent: boolean;

  // Verification
  verifiedAt?: Date;
  verificationDocuments: string[];

  createdAt: Date;
  updatedAt: Date;
}

/** Agent performance snapshot */
export interface AgentPerformanceSnapshot {
  id: string;
  agentId: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  periodStart: Date;
  periodEnd: Date;

  // Referrals
  newReferrals: number;
  convertedReferrals: number;
  referralRevenue: number;

  // Predictions
  marketsPredicted: number;
  correctPredictions: number;
  predictionAccuracy: number;
  predictionPnL: number;

  // Engagement
  clientsInvited: number;
  clientsActive: number;
  contentShared: number;

  createdAt: Date;
}

// ============================================================================
// REFERRAL & POINTS TYPES
// ============================================================================

/** Referral status */
export type ReferralStatus =
  | "pending"
  | "signed_up"
  | "verified"
  | "active_trader"
  | "churned"
  | "expired";

/** Agent referral record */
export interface AgentReferral {
  id: string;
  agentId: string;
  referredUserId: string;
  brokerageId: string;
  status: ReferralStatus;

  // Referral details
  referralCode: string;
  referralSource: "direct_link" | "qr_code" | "email" | "sms" | "social" | "in_person";

  // Conversion tracking
  signedUpAt?: Date;
  verifiedAt?: Date;
  firstTradeAt?: Date;

  // Earnings
  totalReferralEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;

  // Attribution
  attributionWindow: number; // Days
  expiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/** Agent points transaction */
export interface AgentPointsTransaction {
  id: string;
  agentId: string;
  type: AgentPointsTransactionType;
  amount: number;
  balance: number;
  status: "pending" | "completed" | "failed" | "reversed";
  description: string;
  referenceType?: "referral" | "prediction" | "content" | "milestone" | "redemption";
  referenceId?: string;
  createdAt: Date;
}

/** Agent points transaction types */
export type AgentPointsTransactionType =
  | "referral_signup"        // Client signs up
  | "referral_verification"  // Client gets verified
  | "referral_first_trade"   // Client makes first trade
  | "referral_volume"        // Based on client trading volume
  | "prediction_correct"     // Agent's prediction was correct
  | "prediction_streak"      // Correct prediction streak bonus
  | "content_share"          // Shared PULL content
  | "market_creation"        // Suggested market that was created
  | "milestone_agents"       // Brokerage milestone for agent count
  | "milestone_volume"       // Brokerage milestone for volume
  | "redemption"             // Points redeemed for rewards
  | "bonus"                  // Manual bonus
  | "adjustment";            // Manual adjustment

// ============================================================================
// MARKET SENTIMENT & TOOLS TYPES
// ============================================================================

/** Market sentiment analysis */
export interface MarketSentiment {
  id: string;
  geographicScope: GeographicScope;
  location: string; // State, city, or ZIP

  // Sentiment scores (0-100)
  overallSentiment: number;
  buyerSentiment: number;
  sellerSentiment: number;
  investorSentiment: number;

  // Derived from prediction markets
  priceUpProbability: number;
  priceDownProbability: number;
  inventoryUpProbability: number;
  ratesDownProbability: number;

  // Volume indicators
  predictionVolume: number;
  activeMarkets: number;
  uniqueTraders: number;

  // Trend
  sentimentTrend: "bullish" | "bearish" | "neutral";
  trendStrength: number; // 0-100

  // Historical comparison
  weekOverWeekChange: number;
  monthOverMonthChange: number;

  calculatedAt: Date;
}

/** Agent market insight for client conversations */
export interface AgentMarketInsight {
  id: string;
  agentId: string;
  marketId: string;

  // Insight content
  headline: string;
  summary: string;
  keyPoints: string[];
  dataVisualization?: string; // URL to chart/image

  // Agent's position (optional)
  agentPosition?: "yes" | "no";
  positionQuantity?: number;
  positionValue?: number;

  // Performance
  predictionOutcome?: "correct" | "incorrect" | "pending";
  profitLoss?: number;

  // Sharing
  shareableUrl: string;
  embedCode?: string;

  createdAt: Date;
  expiresAt: Date;
}

/** Commission prediction market */
export interface CommissionPredictionMarket {
  id: string;
  ticker: string;
  title: string;
  description: string;
  status: RealEstateMarketStatus;

  // Target
  agentId?: string;         // For individual agent commission markets
  brokerageId?: string;     // For brokerage-wide markets
  geographicScope: GeographicScope;
  location: string;

  // Prediction parameters
  targetCommissionVolume: number;
  targetPeriod: "monthly" | "quarterly" | "yearly";
  periodStart: Date;
  periodEnd: Date;

  // Trading
  yesPrice: number;
  noPrice: number;
  volume: number;
  openInterest: number;

  // Resolution
  actualCommissionVolume?: number;
  outcome?: "yes" | "no";

  openTime: Date;
  closeTime: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// PULL REAL ESTATE INDEX TYPES
// ============================================================================

/** PULL Real Estate Index component */
export interface PullRealEstateIndexComponent {
  category: RealEstateMarketCategory;
  weight: number;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  sentiment: "bullish" | "bearish" | "neutral";
}

/** PULL Real Estate Index */
export interface PullRealEstateIndex {
  id: string;
  name: string;
  ticker: string;
  geographicScope: GeographicScope;
  location: string;

  // Index value
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;

  // Trend
  trend: "up" | "down" | "stable";
  trendStrength: number;

  // Components
  components: PullRealEstateIndexComponent[];

  // Derived metrics
  marketSentiment: number;        // 0-100
  volatility: number;             // Standard deviation
  tradingVolume: number;
  activeMarkets: number;

  // Time series
  high52Week: number;
  low52Week: number;
  high52WeekDate: Date;
  low52WeekDate: Date;

  calculatedAt: Date;
  nextUpdateAt: Date;
}

/** Index historical data point */
export interface PullRealEstateIndexHistorical {
  id: string;
  indexId: string;
  timestamp: Date;
  value: number;
  volume: number;
  marketCount: number;
}

// ============================================================================
// NEWSLETTER & CONTENT TYPES
// ============================================================================

/** Market prediction newsletter */
export interface MarketPredictionNewsletter {
  id: string;
  title: string;
  edition: string;
  publishDate: Date;

  // Content
  summary: string;
  topPredictions: NewsletterPrediction[];
  marketHighlights: MarketHighlight[];
  indexUpdate: PullRealEstateIndex;

  // Featured content
  featuredAgent?: {
    agentId: string;
    name: string;
    accuracy: number;
    insight: string;
  };

  // Stats
  subscriberCount: number;
  openCount: number;
  clickCount: number;

  status: "draft" | "scheduled" | "sent";
  sentAt?: Date;
  createdAt: Date;
}

/** Newsletter prediction highlight */
export interface NewsletterPrediction {
  marketId: string;
  title: string;
  currentProbability: number;
  weeklyChange: number;
  volume: number;
  sentiment: "bullish" | "bearish" | "neutral";
}

/** Market highlight for content */
export interface MarketHighlight {
  title: string;
  description: string;
  metric: string;
  value: string;
  change: string;
  trend: "up" | "down" | "stable";
}

// ============================================================================
// WHITE-LABEL CONFIGURATION TYPES
// ============================================================================

/** Brokerage white-label configuration */
export interface WhiteLabelConfig {
  id: string;
  brokerageId: string;

  // Branding
  appName: string;
  logoUrl: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;

  // Domain
  customDomain?: string;
  sslCertificateId?: string;

  // Features
  enabledFeatures: WhiteLabelFeature[];
  disabledMarketCategories: RealEstateMarketCategory[];

  // Legal
  termsUrl?: string;
  privacyUrl?: string;
  disclaimerText?: string;

  // Analytics
  googleAnalyticsId?: string;
  facebookPixelId?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** White-label feature flags */
export type WhiteLabelFeature =
  | "predictions"
  | "sentiment_tools"
  | "agent_leaderboard"
  | "commission_markets"
  | "client_invites"
  | "market_insights"
  | "newsletter"
  | "api_access";

// ============================================================================
// LEAD QUALIFICATION TYPES
// ============================================================================

/** Lead score based on trading behavior */
export interface TradingBehaviorLeadScore {
  id: string;
  userId: string;
  agentId?: string;

  // Trading behavior signals
  totalTrades: number;
  tradingVolume: number;
  predictionAccuracy: number;
  marketCategories: RealEstateMarketCategory[];

  // Interest signals
  priceRangeInterest: {
    min: number;
    max: number;
  };
  locationInterest: string[];
  propertyTypeInterest: string[];
  timeHorizon: "immediate" | "short_term" | "long_term";

  // Engagement
  lastActiveAt: Date;
  sessionCount: number;
  averageSessionDuration: number;

  // Calculated scores
  overallLeadScore: number;        // 0-100
  buyerIntentScore: number;        // 0-100
  sellerIntentScore: number;       // 0-100
  investorIntentScore: number;     // 0-100
  engagementScore: number;         // 0-100

  // Classification
  leadTier: "hot" | "warm" | "cold";
  recommendedAction: string;

  calculatedAt: Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/** Create real estate market request */
export interface CreateRealEstateMarketRequest {
  title: string;
  description: string;
  category: RealEstateMarketCategory;
  geographicScope: GeographicScope;
  state?: string;
  metro?: string;
  city?: string;
  zipCode?: string;
  targetMetric: string;
  targetValue: number;
  comparisonOperator: "gt" | "gte" | "lt" | "lte" | "eq";
  resolutionSource: string;
  resolutionDate: Date;
  openTime: Date;
  closeTime: Date;
  tags?: string[];
  imageUrl?: string;
}

/** Create brokerage request */
export interface CreateBrokerageRequest {
  name: string;
  legalName: string;
  email: string;
  phone?: string;
  website?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: Date;
  logoUrl?: string;
  primaryColor?: string;
}

/** Register agent request */
export interface RegisterAgentRequest {
  brokerageId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: Date;
  specializations?: AgentSpecialization[];
  serviceAreas?: string[];
  yearsExperience: number;
}

/** Agent invite client request */
export interface AgentInviteClientRequest {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  message?: string;
  source?: "email" | "sms" | "in_person";
}

/** Market sentiment request */
export interface GetMarketSentimentRequest {
  geographicScope: GeographicScope;
  location: string;
  includeHistory?: boolean;
  historyDays?: number;
}

/** PULL Index request */
export interface GetPullIndexRequest {
  geographicScope: GeographicScope;
  location: string;
  includeComponents?: boolean;
  includeHistory?: boolean;
  historyDays?: number;
}
