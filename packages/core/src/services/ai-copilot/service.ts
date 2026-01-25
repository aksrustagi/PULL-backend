/**
 * AI Copilot Service
 * Main service for personal AI betting assistant
 */

import {
  CopilotProfile,
  CopilotPreferences,
  CopilotInsight,
  CopilotTier,
  InsightType,
  ConfidenceLevel,
  CopilotAlert,
  CopilotConversation,
  CopilotMessage,
  UserBettingProfile,
  EVOpportunity,
  AskCopilotRequest,
  AskCopilotResponse,
  GetInsightsRequest,
  GetInsightsResponse,
  AnalyzeBetRequest,
  AnalyzeBetResponse,
  GetEVOpportunitiesRequest,
  GetEVOpportunitiesResponse,
  UpdatePreferencesRequest,
  ProvideFeedbackRequest,
} from "./types";
import { InsightsService, getInsightsService } from "./insights";
import { EVFinderService, getEVFinderService } from "./ev-finder";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CopilotServiceConfig {
  freeQueriesPerDay: number;
  proQueriesPerDay: number;
  eliteQueriesPerDay: number;
  insightRefreshIntervalMs: number;
  maxConversationMessages: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface AIProvider {
  chat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): Promise<string>;
  analyze(prompt: string, context: Record<string, unknown>): Promise<string>;
  generateInsights(profile: UserBettingProfile): Promise<string[]>;
}

interface OddsProvider {
  getMarketOdds(marketId: string): Promise<unknown>;
  getBestOdds(marketId: string, outcome: string): Promise<unknown>;
  getSharpLine(marketId: string): Promise<unknown>;
}

const DEFAULT_CONFIG: CopilotServiceConfig = {
  freeQueriesPerDay: 5,
  proQueriesPerDay: 100,
  eliteQueriesPerDay: Infinity,
  insightRefreshIntervalMs: 60 * 60 * 1000, // 1 hour
  maxConversationMessages: 50,
};

// ============================================================================
// AI COPILOT SERVICE
// ============================================================================

export class AICopilotService {
  private readonly config: CopilotServiceConfig;
  private readonly db: ConvexClient;
  private readonly ai: AIProvider;
  private readonly insights: InsightsService;
  private readonly evFinder: EVFinderService;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    ai: AIProvider,
    oddsProvider: OddsProvider,
    config?: Partial<CopilotServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.ai = ai;
    this.insights = getInsightsService(db, ai);
    this.evFinder = getEVFinderService(db, oddsProvider as any);
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[AICopilot] ${msg}`, meta),
      info: (msg, meta) => console.info(`[AICopilot] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[AICopilot] ${msg}`, meta),
      error: (msg, meta) => console.error(`[AICopilot] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // PROFILE MANAGEMENT
  // ==========================================================================

  async getProfile(userId: string): Promise<CopilotProfile> {
    let profile = await this.db.query<CopilotProfile | null>("copilotProfiles:get", {
      userId,
    });

    if (!profile) {
      profile = await this.createProfile(userId);
    }

    return profile;
  }

  async createProfile(userId: string): Promise<CopilotProfile> {
    const now = Date.now();

    const profile: CopilotProfile = {
      userId,
      tier: "free",
      isActive: true,
      preferences: this.getDefaultPreferences(),
      insightsGenerated: 0,
      insightsActedOn: 0,
      successfulInsights: 0,
      accuracyRate: 0,
      dailyQueriesUsed: 0,
      dailyQueryLimit: this.config.freeQueriesPerDay,
      feedbackGiven: 0,
      preferredCategories: [],
      avoidedCategories: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.mutation("copilotProfiles:create", { profile });

    return profile;
  }

  async updateTier(userId: string, tier: CopilotTier): Promise<CopilotProfile> {
    const queryLimit = this.getQueryLimitForTier(tier);

    const profile = await this.db.mutation<CopilotProfile>("copilotProfiles:update", {
      userId,
      updates: {
        tier,
        dailyQueryLimit: queryLimit,
        updatedAt: Date.now(),
      },
    });

    return profile;
  }

  async updatePreferences(
    userId: string,
    request: UpdatePreferencesRequest
  ): Promise<CopilotProfile> {
    const profile = await this.db.mutation<CopilotProfile>("copilotProfiles:updatePreferences", {
      userId,
      preferences: request.preferences,
    });

    return profile;
  }

  private getDefaultPreferences(): CopilotPreferences {
    return {
      enableAlerts: true,
      alertTypes: ["ev_opportunity", "risk_warning", "streak_alert"],
      minConfidence: "medium",
      minEVPercent: 3,
      preferredSports: [],
      preferredMarkets: [],
      excludedMarkets: [],
      riskTolerance: "moderate",
      maxSingleBet: 100,
      maxDailyExposure: 500,
      bankrollManagement: true,
      pushEnabled: true,
      emailDigest: "daily",
    };
  }

  private getQueryLimitForTier(tier: CopilotTier): number {
    switch (tier) {
      case "free":
        return this.config.freeQueriesPerDay;
      case "pro":
        return this.config.proQueriesPerDay;
      case "elite":
        return this.config.eliteQueriesPerDay;
      default:
        return this.config.freeQueriesPerDay;
    }
  }

  // ==========================================================================
  // CHAT / ASK
  // ==========================================================================

  async ask(userId: string, request: AskCopilotRequest): Promise<AskCopilotResponse> {
    // Check query limit
    const profile = await this.getProfile(userId);
    if (!this.canMakeQuery(profile)) {
      throw new Error("Daily query limit reached. Upgrade to Pro for more queries.");
    }

    // Get user's betting profile for context
    const bettingProfile = await this.insights.analyzeBettingProfile(userId);

    // Get relevant market data if marketId provided
    let marketContext = {};
    if (request.marketId) {
      marketContext = await this.getMarketContext(request.marketId);
    }

    // Build context for AI
    const context = {
      userProfile: {
        tier: profile.tier,
        winRate: bettingProfile.winRate,
        roi: bettingProfile.roi,
        totalBets: bettingProfile.totalBets,
        preferredCategories: profile.preferredCategories,
        riskTolerance: profile.preferences.riskTolerance,
      },
      marketContext,
      ...request.context,
    };

    // Get conversation history
    const conversation = await this.getOrCreateConversation(userId);

    // Build messages
    const systemPrompt = this.buildSystemPrompt(profile, bettingProfile);
    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...conversation.messages.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: request.query },
    ];

    // Get AI response
    const response = await this.ai.chat(messages);

    // Parse response and extract insights
    const insights = await this.extractInsightsFromResponse(userId, response, request.marketId);

    // Save conversation
    await this.addMessageToConversation(userId, conversation.id, "user", request.query);
    await this.addMessageToConversation(userId, conversation.id, "assistant", response, insights);

    // Increment query count
    await this.db.mutation("copilotProfiles:incrementQueries", { userId });

    return {
      answer: response,
      insights,
      confidence: this.estimateConfidence(response),
    };
  }

  private buildSystemPrompt(
    profile: CopilotProfile,
    bettingProfile: UserBettingProfile
  ): string {
    return `You are PULL AI Copilot, a personal betting assistant.

User Profile:
- Tier: ${profile.tier}
- Win Rate: ${bettingProfile.winRate.toFixed(1)}%
- ROI: ${bettingProfile.roi.toFixed(1)}%
- Total Bets: ${bettingProfile.totalBets}
- Risk Tolerance: ${profile.preferences.riskTolerance}
- Current Streak: ${bettingProfile.currentStreak}

Your responsibilities:
1. Analyze betting opportunities and provide EV assessments
2. Warn about risky bets or patterns
3. Suggest +EV opportunities
4. Provide bankroll management advice
5. Help identify and avoid common betting mistakes

Be direct, data-driven, and always consider the user's risk tolerance.
Never guarantee outcomes - betting always involves risk.`;
  }

  private canMakeQuery(profile: CopilotProfile): boolean {
    if (profile.dailyQueryLimit === Infinity) return true;

    // Reset daily count if new day
    const lastQuery = profile.lastQueryAt ?? 0;
    const lastQueryDate = new Date(lastQuery).toDateString();
    const todayDate = new Date().toDateString();

    if (lastQueryDate !== todayDate) {
      return true; // New day, reset count
    }

    return profile.dailyQueriesUsed < profile.dailyQueryLimit;
  }

  private estimateConfidence(response: string): ConfidenceLevel {
    const confidenceIndicators = {
      very_high: ["extremely confident", "very high probability", "near certain"],
      high: ["confident", "likely", "strong indication", "high probability"],
      medium: ["moderate", "possible", "may", "could"],
      low: ["uncertain", "unclear", "limited data", "speculative"],
    };

    const lowerResponse = response.toLowerCase();

    for (const [level, indicators] of Object.entries(confidenceIndicators)) {
      if (indicators.some((i) => lowerResponse.includes(i))) {
        return level as ConfidenceLevel;
      }
    }

    return "medium";
  }

  private async extractInsightsFromResponse(
    userId: string,
    response: string,
    marketId?: string
  ): Promise<CopilotInsight[]> {
    // Simple extraction - in production, use structured output from AI
    const insights: CopilotInsight[] = [];

    if (response.includes("+EV") || response.includes("positive expected value")) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "ev_opportunity",
        priority: "medium",
        confidence: "medium",
        confidenceScore: 65,
        title: "EV Opportunity Detected",
        summary: "AI identified a potential +EV opportunity",
        detailedAnalysis: response,
        keyFactors: [],
        marketId,
        suggestedAction: { type: "review", reason: "Review the opportunity details" },
        generatedAt: Date.now(),
      });
    }

    if (response.includes("warning") || response.includes("caution") || response.includes("risk")) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "risk_warning",
        priority: "high",
        confidence: "high",
        confidenceScore: 75,
        title: "Risk Warning",
        summary: "AI identified potential risks",
        detailedAnalysis: response,
        keyFactors: [],
        suggestedAction: { type: "review", reason: "Consider the risks carefully" },
        generatedAt: Date.now(),
      });
    }

    return insights;
  }

  // ==========================================================================
  // CONVERSATIONS
  // ==========================================================================

  private async getOrCreateConversation(userId: string): Promise<CopilotConversation> {
    let conversation = await this.db.query<CopilotConversation | null>(
      "copilotConversations:getActive",
      { userId }
    );

    if (!conversation) {
      const now = Date.now();
      conversation = {
        id: this.generateId(),
        userId,
        messages: [],
        context: {},
        startedAt: now,
        lastMessageAt: now,
      };

      await this.db.mutation("copilotConversations:create", { conversation });
    }

    return conversation;
  }

  private async addMessageToConversation(
    userId: string,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    insights?: CopilotInsight[]
  ): Promise<void> {
    const message: CopilotMessage = {
      id: this.generateId(),
      userId,
      role,
      content,
      insights,
      createdAt: Date.now(),
    };

    await this.db.mutation("copilotConversations:addMessage", {
      conversationId,
      message,
    });
  }

  // ==========================================================================
  // INSIGHTS
  // ==========================================================================

  async getInsights(
    userId: string,
    request: GetInsightsRequest
  ): Promise<GetInsightsResponse> {
    const profile = await this.getProfile(userId);

    // Filter by types and confidence
    const insights = await this.db.query<CopilotInsight[]>("copilotInsights:list", {
      userId,
      types: request.types,
      minConfidence: this.confidenceToScore(request.minConfidence),
      marketId: request.marketId,
      limit: request.limit,
      includeExpired: request.includeExpired,
    });

    return {
      insights,
      totalCount: insights.length,
      hasMore: insights.length === request.limit,
    };
  }

  async refreshInsights(userId: string): Promise<CopilotInsight[]> {
    return await this.insights.generateInsights(userId);
  }

  // ==========================================================================
  // BET ANALYSIS
  // ==========================================================================

  async analyzeBet(userId: string, request: AnalyzeBetRequest): Promise<AnalyzeBetResponse> {
    const profile = await this.getProfile(userId);
    const bettingProfile = await this.insights.analyzeBettingProfile(userId);

    // Get market details
    const market = await this.getMarketContext(request.marketId);

    // Get EV analysis
    const evAnalysis = await this.evFinder.analyzeOpportunity(request.marketId);

    // Build risk assessment
    const riskAssessment = this.assessRisk(request, bettingProfile, profile.preferences);

    // Determine recommendation
    let recommendation: "proceed" | "caution" | "avoid" = "caution";

    if (evAnalysis && evAnalysis.opportunity.evPercent > 3 && riskAssessment.overallRisk !== "extreme") {
      recommendation = "proceed";
    } else if (riskAssessment.overallRisk === "extreme" || riskAssessment.overallRisk === "high") {
      recommendation = "avoid";
    }

    // Generate insights
    const insights = await this.generateBetInsights(userId, request, evAnalysis, riskAssessment);

    return {
      recommendation,
      evAnalysis: evAnalysis?.analysis ?? {
        expectedValue: 0,
        evPercent: 0,
        impliedProbability: 0,
        trueProbability: 0,
        edgePercent: 0,
        kellyStake: 0,
        halfKellyStake: 0,
        breakdownFactors: [],
      },
      riskAssessment,
      insights,
    };
  }

  private assessRisk(
    bet: AnalyzeBetRequest,
    bettingProfile: UserBettingProfile,
    preferences: CopilotPreferences
  ): AnalyzeBetResponse["riskAssessment"] {
    const factors: Array<{ name: string; severity: "low" | "medium" | "high"; description: string }> = [];
    let riskScore = 0;

    // Stake size risk
    if (bet.stake > preferences.maxSingleBet) {
      factors.push({
        name: "Stake Size",
        severity: "high",
        description: `Stake exceeds your max single bet of $${preferences.maxSingleBet}`,
      });
      riskScore += 25;
    }

    // Streak risk
    if (bettingProfile.currentStreak <= -3) {
      factors.push({
        name: "Losing Streak",
        severity: "high",
        description: `You're on a ${Math.abs(bettingProfile.currentStreak)} loss streak`,
      });
      riskScore += 20;
    }

    // Tilt risk
    if (bettingProfile.tiltRisk === "high") {
      factors.push({
        name: "Tilt Risk",
        severity: "high",
        description: "Elevated tilt risk detected",
      });
      riskScore += 20;
    }

    // Determine overall risk
    let overallRisk: "low" | "medium" | "high" | "extreme";
    if (riskScore >= 60) {
      overallRisk = "extreme";
    } else if (riskScore >= 40) {
      overallRisk = "high";
    } else if (riskScore >= 20) {
      overallRisk = "medium";
    } else {
      overallRisk = "low";
    }

    return {
      overallRisk,
      riskScore,
      factors,
      mitigations: factors.map((f) => `Address: ${f.name}`),
      maxRecommendedStake: Math.min(bet.stake, preferences.maxSingleBet),
    };
  }

  private async generateBetInsights(
    userId: string,
    bet: AnalyzeBetRequest,
    evAnalysis: Awaited<ReturnType<EVFinderService["analyzeOpportunity"]>>,
    riskAssessment: AnalyzeBetResponse["riskAssessment"]
  ): Promise<CopilotInsight[]> {
    const insights: CopilotInsight[] = [];
    const now = Date.now();

    // EV insight
    if (evAnalysis && evAnalysis.opportunity.evPercent > 0) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "ev_opportunity",
        priority: evAnalysis.opportunity.evPercent > 5 ? "high" : "medium",
        confidence: evAnalysis.opportunity.confidence,
        confidenceScore: this.confidenceToScore(evAnalysis.opportunity.confidence),
        title: `+${evAnalysis.opportunity.evPercent.toFixed(1)}% EV Opportunity`,
        summary: `This bet has positive expected value`,
        detailedAnalysis: evAnalysis.reasoning.join("\n"),
        keyFactors: evAnalysis.reasoning,
        marketId: bet.marketId,
        evAnalysis: evAnalysis.analysis,
        suggestedAction: {
          type: "bet",
          marketId: bet.marketId,
          outcome: bet.outcome,
          stake: Math.min(bet.stake, evAnalysis.analysis.halfKellyStake),
          reason: "Positive EV identified",
        },
        generatedAt: now,
      });
    }

    // Risk insight
    if (riskAssessment.overallRisk === "high" || riskAssessment.overallRisk === "extreme") {
      insights.push({
        id: this.generateId(),
        userId,
        type: "risk_warning",
        priority: "urgent",
        confidence: "high",
        confidenceScore: 85,
        title: "High Risk Bet Warning",
        summary: `This bet carries ${riskAssessment.overallRisk} risk`,
        detailedAnalysis: riskAssessment.factors.map((f) => `${f.name}: ${f.description}`).join("\n"),
        keyFactors: riskAssessment.mitigations,
        marketId: bet.marketId,
        riskAssessment,
        suggestedAction: {
          type: "avoid",
          marketId: bet.marketId,
          reason: "Risk level exceeds acceptable threshold",
        },
        generatedAt: now,
      });
    }

    return insights;
  }

  // ==========================================================================
  // EV OPPORTUNITIES
  // ==========================================================================

  async getEVOpportunities(
    userId: string,
    request: GetEVOpportunitiesRequest
  ): Promise<GetEVOpportunitiesResponse> {
    const profile = await this.getProfile(userId);

    // Free users get limited access
    if (profile.tier === "free" && request.limit > 5) {
      request.limit = 5;
    }

    return await this.evFinder.getOpportunities(request);
  }

  // ==========================================================================
  // ALERTS
  // ==========================================================================

  async getAlerts(userId: string, unreadOnly: boolean = false): Promise<CopilotAlert[]> {
    return await this.db.query<CopilotAlert[]>("copilotAlerts:list", {
      userId,
      unreadOnly,
    });
  }

  async markAlertRead(userId: string, alertId: string): Promise<void> {
    await this.db.mutation("copilotAlerts:markRead", {
      alertId,
      userId,
      readAt: Date.now(),
    });
  }

  // ==========================================================================
  // FEEDBACK
  // ==========================================================================

  async provideFeedback(userId: string, request: ProvideFeedbackRequest): Promise<void> {
    await this.db.mutation("copilotFeedback:create", {
      userId,
      insightId: request.insightId,
      isHelpful: request.isHelpful,
      feedback: request.feedback,
      outcome: request.outcome,
      createdAt: Date.now(),
    });

    // Update insight with outcome
    if (request.outcome) {
      await this.db.mutation("copilotInsights:updateOutcome", {
        insightId: request.insightId,
        outcome: request.outcome,
        actionTaken: true,
      });
    }

    // Update profile stats
    await this.db.mutation("copilotProfiles:recordFeedback", {
      userId,
      isHelpful: request.isHelpful,
      wasSuccessful: request.outcome === "won",
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async getMarketContext(marketId: string): Promise<Record<string, unknown>> {
    const market = await this.db.query<unknown>("predictionMarkets:get", { marketId });
    return market as Record<string, unknown>;
  }

  private confidenceToScore(level?: ConfidenceLevel): number {
    const scores: Record<ConfidenceLevel, number> = {
      low: 55,
      medium: 67,
      high: 80,
      very_high: 90,
    };
    return level ? scores[level] : 0;
  }

  private generateId(): string {
    return `copilot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: AICopilotService | null = null;

export function getAICopilotService(
  db: ConvexClient,
  ai: AIProvider,
  oddsProvider: OddsProvider
): AICopilotService {
  if (!serviceInstance) {
    serviceInstance = new AICopilotService(db, ai, oddsProvider);
  }
  return serviceInstance;
}

export function createAICopilotService(
  db: ConvexClient,
  ai: AIProvider,
  oddsProvider: OddsProvider,
  config?: Partial<CopilotServiceConfig>
): AICopilotService {
  return new AICopilotService(db, ai, oddsProvider, config);
}
