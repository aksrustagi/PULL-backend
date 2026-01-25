/**
 * AI Copilot Types
 * Personal AI betting assistant with pattern analysis and +EV opportunities
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const CopilotTierSchema = z.enum([
  "free",         // Basic analysis, limited queries
  "pro",          // Full analysis, unlimited queries
  "elite",        // Priority processing, advanced features
]);

export type CopilotTier = z.infer<typeof CopilotTierSchema>;

export const InsightTypeSchema = z.enum([
  "pattern_detected",
  "ev_opportunity",
  "risk_warning",
  "streak_alert",
  "market_movement",
  "sharp_money",
  "contrarian_play",
  "correlation_found",
  "fade_suggestion",
  "momentum_shift",
]);

export type InsightType = z.infer<typeof InsightTypeSchema>;

export const ConfidenceLevelSchema = z.enum([
  "low",        // 50-60%
  "medium",     // 60-75%
  "high",       // 75-85%
  "very_high",  // 85%+
]);

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const AlertPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

export type AlertPriority = z.infer<typeof AlertPrioritySchema>;

export const BetOutcomeSchema = z.enum([
  "pending",
  "won",
  "lost",
  "push",
  "void",
]);

export type BetOutcome = z.infer<typeof BetOutcomeSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface CopilotProfile {
  userId: string;
  tier: CopilotTier;
  isActive: boolean;

  // Preferences
  preferences: CopilotPreferences;

  // Stats
  insightsGenerated: number;
  insightsActedOn: number;
  successfulInsights: number;
  accuracyRate: number;

  // Usage
  dailyQueriesUsed: number;
  dailyQueryLimit: number;
  lastQueryAt?: number;

  // Learning
  feedbackGiven: number;
  preferredCategories: string[];
  avoidedCategories: string[];

  createdAt: number;
  updatedAt: number;
}

export interface CopilotPreferences {
  // Alert settings
  enableAlerts: boolean;
  alertTypes: InsightType[];
  minConfidence: ConfidenceLevel;
  minEVPercent: number;

  // Categories
  preferredSports: string[];
  preferredMarkets: string[];
  excludedMarkets: string[];

  // Risk profile
  riskTolerance: "conservative" | "moderate" | "aggressive";
  maxSingleBet: number;
  maxDailyExposure: number;
  bankrollManagement: boolean;

  // Notification
  pushEnabled: boolean;
  emailDigest: "none" | "daily" | "weekly";
  quietHoursStart?: number; // Hour (0-23)
  quietHoursEnd?: number;
}

export interface CopilotInsight {
  id: string;
  userId: string;
  type: InsightType;
  priority: AlertPriority;
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0-100

  // Content
  title: string;
  summary: string;
  detailedAnalysis: string;
  keyFactors: string[];

  // Market context
  marketId?: string;
  marketTicker?: string;
  marketTitle?: string;
  recommendedOutcome?: string;
  currentOdds?: number;
  recommendedStake?: number;

  // EV Analysis
  evAnalysis?: EVAnalysis;

  // Pattern Analysis
  patternAnalysis?: PatternAnalysis;

  // Risk Assessment
  riskAssessment?: RiskAssessment;

  // Actions
  suggestedAction: SuggestedAction;
  actionTaken?: boolean;
  actionResult?: BetOutcome;

  // Timestamps
  generatedAt: number;
  expiresAt?: number;
  viewedAt?: number;
  actedOnAt?: number;
}

export interface EVAnalysis {
  expectedValue: number;
  evPercent: number;
  impliedProbability: number;
  trueProbability: number;
  edgePercent: number;
  kellyStake: number;
  halfKellyStake: number;
  breakdownFactors: EVFactor[];
}

export interface EVFactor {
  name: string;
  impact: number; // Percentage impact on probability
  direction: "positive" | "negative" | "neutral";
  description: string;
}

export interface PatternAnalysis {
  patternType: string;
  occurrences: number;
  winRate: number;
  avgProfit: number;
  lastOccurrence?: number;
  relatedBets: string[];
  description: string;
}

export interface RiskAssessment {
  overallRisk: "low" | "medium" | "high" | "extreme";
  riskScore: number; // 0-100
  factors: RiskFactor[];
  mitigations: string[];
  maxRecommendedStake: number;
}

export interface RiskFactor {
  name: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export type SuggestedAction =
  | { type: "bet"; marketId: string; outcome: string; stake: number; reason: string }
  | { type: "avoid"; marketId: string; reason: string }
  | { type: "wait"; marketId: string; targetOdds?: number; reason: string }
  | { type: "hedge"; existingBetId: string; hedgeMarketId: string; hedgeOutcome: string; hedgeStake: number }
  | { type: "cashout"; betId: string; reason: string }
  | { type: "review"; reason: string };

// ============================================================================
// USER BETTING PROFILE
// ============================================================================

export interface UserBettingProfile {
  userId: string;

  // Historical performance
  totalBets: number;
  totalWon: number;
  totalLost: number;
  winRate: number;
  roi: number;
  profitLoss: number;

  // Category breakdown
  categoryPerformance: Record<string, CategoryPerformance>;

  // Patterns identified
  patterns: BettingPattern[];

  // Risk metrics
  avgBetSize: number;
  maxBetSize: number;
  avgOdds: number;
  favoriteOddsRange: { min: number; max: number };

  // Behavioral
  bettingFrequency: "casual" | "regular" | "heavy";
  preferredBetTiming: string[];
  tiltRisk: "low" | "medium" | "high";
  chasingLosses: boolean;

  // Streaks
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;

  // Last updated
  analyzedAt: number;
}

export interface CategoryPerformance {
  category: string;
  bets: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  profitLoss: number;
  avgOdds: number;
  edge: number;
}

export interface BettingPattern {
  id: string;
  name: string;
  type: "positive" | "negative" | "neutral";
  description: string;
  frequency: number;
  impact: number; // Estimated $ impact
  recommendation: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export const AskCopilotRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  marketId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export type AskCopilotRequest = z.infer<typeof AskCopilotRequestSchema>;

export interface AskCopilotResponse {
  answer: string;
  insights: CopilotInsight[];
  relatedMarkets?: RelatedMarket[];
  confidence: ConfidenceLevel;
  sources?: string[];
}

export interface RelatedMarket {
  marketId: string;
  ticker: string;
  title: string;
  relevance: number;
  evPercent?: number;
}

export const GetInsightsRequestSchema = z.object({
  types: z.array(InsightTypeSchema).optional(),
  minConfidence: ConfidenceLevelSchema.optional(),
  marketId: z.string().optional(),
  limit: z.number().min(1).max(50).default(20),
  includeExpired: z.boolean().default(false),
});

export type GetInsightsRequest = z.infer<typeof GetInsightsRequestSchema>;

export interface GetInsightsResponse {
  insights: CopilotInsight[];
  totalCount: number;
  hasMore: boolean;
}

export const AnalyzeBetRequestSchema = z.object({
  marketId: z.string(),
  outcome: z.string(),
  stake: z.number().positive(),
  odds: z.number().positive().optional(),
});

export type AnalyzeBetRequest = z.infer<typeof AnalyzeBetRequestSchema>;

export interface AnalyzeBetResponse {
  recommendation: "proceed" | "caution" | "avoid";
  evAnalysis: EVAnalysis;
  riskAssessment: RiskAssessment;
  insights: CopilotInsight[];
  alternativeBets?: AlternativeBet[];
}

export interface AlternativeBet {
  marketId: string;
  ticker: string;
  title: string;
  outcome: string;
  evPercent: number;
  reason: string;
}

export const GetEVOpportunitiesRequestSchema = z.object({
  categories: z.array(z.string()).optional(),
  minEV: z.number().default(0),
  minConfidence: ConfidenceLevelSchema.optional(),
  limit: z.number().min(1).max(50).default(20),
});

export type GetEVOpportunitiesRequest = z.infer<typeof GetEVOpportunitiesRequestSchema>;

export interface GetEVOpportunitiesResponse {
  opportunities: EVOpportunity[];
  totalFound: number;
  lastScanned: number;
}

export interface EVOpportunity {
  id: string;
  marketId: string;
  ticker: string;
  title: string;
  outcome: string;
  currentOdds: number;
  evPercent: number;
  confidence: ConfidenceLevel;
  edgePercent: number;
  kellyStake: number;
  expiresAt?: number;
  factors: EVFactor[];
}

export const UpdatePreferencesRequestSchema = z.object({
  preferences: z.object({
    enableAlerts: z.boolean().optional(),
    alertTypes: z.array(InsightTypeSchema).optional(),
    minConfidence: ConfidenceLevelSchema.optional(),
    minEVPercent: z.number().optional(),
    preferredSports: z.array(z.string()).optional(),
    preferredMarkets: z.array(z.string()).optional(),
    excludedMarkets: z.array(z.string()).optional(),
    riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).optional(),
    maxSingleBet: z.number().positive().optional(),
    maxDailyExposure: z.number().positive().optional(),
    bankrollManagement: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    emailDigest: z.enum(["none", "daily", "weekly"]).optional(),
    quietHoursStart: z.number().min(0).max(23).optional(),
    quietHoursEnd: z.number().min(0).max(23).optional(),
  }),
});

export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

export const ProvideFeedbackRequestSchema = z.object({
  insightId: z.string(),
  isHelpful: z.boolean(),
  feedback: z.string().max(500).optional(),
  outcome: BetOutcomeSchema.optional(),
});

export type ProvideFeedbackRequest = z.infer<typeof ProvideFeedbackRequestSchema>;

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface CopilotAlert {
  id: string;
  userId: string;
  insightId: string;
  type: InsightType;
  priority: AlertPriority;
  title: string;
  message: string;
  marketId?: string;
  action?: SuggestedAction;
  createdAt: number;
  sentAt?: number;
  readAt?: number;
  expiresAt?: number;
}

// ============================================================================
// CHAT TYPES
// ============================================================================

export interface CopilotMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  insights?: CopilotInsight[];
  createdAt: number;
}

export interface CopilotConversation {
  id: string;
  userId: string;
  messages: CopilotMessage[];
  context: Record<string, unknown>;
  startedAt: number;
  lastMessageAt: number;
}
