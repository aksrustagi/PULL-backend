/**
 * AI Insights Selling Service
 *
 * Combines Perplexity AI analysis with real-time odds data to generate
 * premium insights that users can purchase with credits or subscription.
 */

import { z } from "zod";
import {
  PerplexityClient,
  InsightRequest,
  InsightResponse,
  InsightCategory,
  SportType,
  getPerplexityClient,
} from "./perplexity";
import {
  OddsApiClient,
  Event,
  BestOdds,
  OddsMovement,
  ArbitrageOpportunity,
  getOddsApiClient,
} from "./odds-api";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const InsightTierSchema = z.enum([
  "free",      // Basic insights, delayed
  "standard",  // Real-time insights, limited
  "premium",   // Full analysis, priority
  "elite",     // Expert picks, 1-on-1 support
]);

export type InsightTier = z.infer<typeof InsightTierSchema>;

export const SubscriptionPlanSchema = z.enum([
  "free",
  "starter",      // $9.99/mo - 50 credits
  "pro",          // $29.99/mo - 200 credits
  "elite",        // $99.99/mo - unlimited
  "enterprise",   // Custom
]);

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export interface InsightCredit {
  userId: string;
  balance: number;
  monthlyAllocation: number;
  used: number;
  expiresAt: number;
  tier: InsightTier;
}

export interface InsightPurchase {
  id: string;
  userId: string;
  insightId: string;
  category: InsightCategory;
  sport: SportType;
  creditsSpent: number;
  purchasedAt: number;
  expiresAt: number;
}

export interface InsightBundle {
  id: string;
  name: string;
  description: string;
  sport: SportType;
  categories: InsightCategory[];
  creditCost: number;
  cashPrice: number;
  validDays: number;
  features: string[];
}

export interface GeneratedInsight extends InsightResponse {
  oddsContext?: {
    bestOdds: BestOdds[];
    movements: OddsMovement[];
    arbitrage?: ArbitrageOpportunity;
  };
  lockStatus: "unlocked" | "preview" | "locked";
  previewContent?: string;
  unlockCost: number;
}

export interface InsightFeed {
  sport: SportType;
  category: InsightCategory;
  insights: GeneratedInsight[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface UserInsightPreferences {
  userId: string;
  sports: SportType[];
  categories: InsightCategory[];
  notificationEnabled: boolean;
  emailDigest: "none" | "daily" | "weekly";
  priceAlerts: boolean;
  movementThreshold: number; // Minimum odds movement % to alert
}

// ============================================================================
// CREDIT COSTS BY CATEGORY
// ============================================================================

const CREDIT_COSTS: Record<InsightCategory, number> = {
  // NFL - Higher cost due to popularity
  nfl_player_analysis: 5,
  nfl_matchup_prediction: 8,
  nfl_injury_impact: 10,
  nfl_weather_impact: 5,
  nfl_trade_recommendation: 8,
  nfl_waiver_wire: 5,
  nfl_start_sit: 10,
  nfl_dfs_lineup: 15,

  // March Madness - Premium during tournament
  ncaa_bracket_prediction: 20,
  ncaa_upset_alert: 15,
  ncaa_team_analysis: 8,
  ncaa_player_spotlight: 5,
  ncaa_conference_trends: 5,
  ncaa_betting_edge: 12,

  // Golf - Niche but valuable
  golf_course_analysis: 8,
  golf_player_form: 5,
  golf_weather_conditions: 5,
  golf_betting_value: 10,
  golf_fantasy_picks: 8,
  golf_cut_line_prediction: 8,

  // NBA - High demand during playoffs
  nba_series_prediction: 12,
  nba_player_props: 8,
  nba_injury_report: 10,
  nba_betting_trends: 8,
  nba_fantasy_playoff: 10,
  nba_clutch_analysis: 8,

  // MLB - Lower demand generally
  mlb_pitching_matchup: 5,
  mlb_batting_trends: 5,
  mlb_bullpen_analysis: 5,
  mlb_park_factors: 3,
  mlb_playoff_prediction: 10,
  mlb_betting_value: 8,
};

// ============================================================================
// INSIGHT BUNDLES
// ============================================================================

export const INSIGHT_BUNDLES: InsightBundle[] = [
  // NFL Bundles
  {
    id: "nfl-weekly-edge",
    name: "NFL Weekly Edge",
    description: "Complete weekly analysis package for fantasy and betting",
    sport: "nfl",
    categories: [
      "nfl_matchup_prediction",
      "nfl_start_sit",
      "nfl_injury_impact",
      "nfl_weather_impact",
    ],
    creditCost: 25,
    cashPrice: 4.99,
    validDays: 7,
    features: [
      "All matchup predictions",
      "Start/Sit recommendations",
      "Injury impact analysis",
      "Weather alerts",
    ],
  },
  {
    id: "nfl-dfs-dominator",
    name: "DFS Dominator",
    description: "Optimized DFS lineups with contrarian analysis",
    sport: "nfl",
    categories: ["nfl_dfs_lineup", "nfl_player_analysis"],
    creditCost: 20,
    cashPrice: 3.99,
    validDays: 1,
    features: [
      "3 optimized lineups",
      "Ownership projections",
      "Correlation stacks",
      "Contrarian plays",
    ],
  },

  // March Madness Bundles
  {
    id: "bracket-builder",
    name: "Bracket Builder Pro",
    description: "Complete tournament prediction package",
    sport: "ncaa_basketball",
    categories: [
      "ncaa_bracket_prediction",
      "ncaa_upset_alert",
      "ncaa_team_analysis",
    ],
    creditCost: 50,
    cashPrice: 9.99,
    validDays: 21,
    features: [
      "Full bracket predictions",
      "Upset probability matrix",
      "Sweet 16 lock picks",
      "Cinderella candidates",
    ],
  },
  {
    id: "daily-madness",
    name: "Daily Madness Edge",
    description: "Daily betting picks for tournament games",
    sport: "ncaa_basketball",
    categories: ["ncaa_betting_edge", "ncaa_upset_alert"],
    creditCost: 15,
    cashPrice: 2.99,
    validDays: 1,
    features: [
      "Best bets of the day",
      "Live upset alerts",
      "Line movement analysis",
      "Sharp money indicators",
    ],
  },

  // Golf Bundles
  {
    id: "masters-insider",
    name: "Masters Insider",
    description: "Complete Augusta National analysis",
    sport: "golf",
    categories: [
      "golf_course_analysis",
      "golf_player_form",
      "golf_weather_conditions",
      "golf_betting_value",
    ],
    creditCost: 40,
    cashPrice: 7.99,
    validDays: 7,
    features: [
      "Course fit analysis",
      "Strokes gained breakdown",
      "Weather round-by-round",
      "Best outright values",
    ],
  },
  {
    id: "golf-fantasy-pro",
    name: "Fantasy Golf Pro",
    description: "Optimized fantasy golf picks",
    sport: "golf",
    categories: ["golf_fantasy_picks", "golf_cut_line_prediction"],
    creditCost: 15,
    cashPrice: 2.99,
    validDays: 4,
    features: [
      "Ownership leverage",
      "Cut line predictions",
      "Salary optimization",
      "Weekend projections",
    ],
  },

  // NBA Bundles
  {
    id: "playoff-predictor",
    name: "Playoff Predictor",
    description: "Series-by-series playoff predictions",
    sport: "nba",
    categories: ["nba_series_prediction", "nba_clutch_analysis"],
    creditCost: 30,
    cashPrice: 5.99,
    validDays: 14,
    features: [
      "Series predictions",
      "Game-by-game analysis",
      "Clutch performance ratings",
      "Rest advantage calculations",
    ],
  },
  {
    id: "nba-props-master",
    name: "Props Master",
    description: "Daily player prop analysis",
    sport: "nba",
    categories: ["nba_player_props", "nba_injury_report"],
    creditCost: 10,
    cashPrice: 1.99,
    validDays: 1,
    features: [
      "Best player props",
      "Injury impact on props",
      "Minutes projections",
      "Usage rate analysis",
    ],
  },

  // MLB Bundles
  {
    id: "mlb-daily-edge",
    name: "MLB Daily Edge",
    description: "Daily betting and fantasy analysis",
    sport: "mlb",
    categories: [
      "mlb_pitching_matchup",
      "mlb_batting_trends",
      "mlb_park_factors",
    ],
    creditCost: 12,
    cashPrice: 1.99,
    validDays: 1,
    features: [
      "Pitcher matchup grades",
      "Hot/cold batter alerts",
      "Park-adjusted projections",
      "First 5 innings plays",
    ],
  },
  {
    id: "october-baseball",
    name: "October Baseball",
    description: "Complete playoff analysis package",
    sport: "mlb",
    categories: [
      "mlb_playoff_prediction",
      "mlb_bullpen_analysis",
      "mlb_betting_value",
    ],
    creditCost: 35,
    cashPrice: 6.99,
    validDays: 30,
    features: [
      "Series predictions",
      "Bullpen fatigue tracker",
      "October performer rankings",
      "Live betting edges",
    ],
  },
];

// ============================================================================
// AI INSIGHTS SERVICE
// ============================================================================

export class AIInsightsService {
  private perplexity: PerplexityClient;
  private oddsApi: OddsApiClient;

  constructor(
    perplexity?: PerplexityClient,
    oddsApi?: OddsApiClient
  ) {
    this.perplexity = perplexity ?? getPerplexityClient();
    this.oddsApi = oddsApi ?? getOddsApiClient();
  }

  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================

  async generateInsight(
    request: InsightRequest,
    userTier: InsightTier = "free"
  ): Promise<GeneratedInsight> {
    // Enrich context with odds data
    const oddsContext = await this.enrichWithOddsData(request);

    // Add odds to context
    const enrichedRequest: InsightRequest = {
      ...request,
      context: {
        ...request.context,
        currentOdds: oddsContext?.bestOdds,
        recentMovements: oddsContext?.movements,
      },
      premium: userTier === "premium" || userTier === "elite",
    };

    // Generate AI insight
    const insight = await this.perplexity.generateInsight(enrichedRequest);

    // Determine lock status based on tier
    const unlockCost = CREDIT_COSTS[request.category];
    const lockStatus = this.determineLockStatus(userTier, request.premium ?? false);

    return {
      ...insight,
      oddsContext,
      lockStatus,
      previewContent: lockStatus !== "unlocked"
        ? this.generatePreview(insight)
        : undefined,
      unlockCost,
    };
  }

  async generateBundleInsights(
    bundle: InsightBundle,
    context: Record<string, unknown>,
    userTier: InsightTier = "free"
  ): Promise<GeneratedInsight[]> {
    const insights: GeneratedInsight[] = [];

    for (const category of bundle.categories) {
      const insight = await this.generateInsight(
        {
          sport: bundle.sport,
          category,
          context,
          premium: userTier === "premium" || userTier === "elite",
        },
        userTier
      );
      insights.push(insight);
    }

    return insights;
  }

  // ============================================================================
  // INSIGHT FEEDS
  // ============================================================================

  async getFeed(
    sport: SportType,
    category: InsightCategory,
    userTier: InsightTier,
    limit: number = 10,
    cursor?: string
  ): Promise<InsightFeed> {
    // In production, this would fetch from database
    // For now, generate fresh insights

    const context = await this.buildSportContext(sport);

    const insight = await this.generateInsight(
      { sport, category, context },
      userTier
    );

    return {
      sport,
      category,
      insights: [insight],
      hasMore: false,
    };
  }

  async getPersonalizedFeed(
    userId: string,
    preferences: UserInsightPreferences,
    userTier: InsightTier,
    limit: number = 20
  ): Promise<GeneratedInsight[]> {
    const insights: GeneratedInsight[] = [];

    for (const sport of preferences.sports) {
      for (const category of preferences.categories) {
        // Check if category matches sport
        if (!this.categoryMatchesSport(category, sport)) continue;

        const context = await this.buildSportContext(sport);
        const insight = await this.generateInsight(
          { sport, category, context, userId },
          userTier
        );
        insights.push(insight);

        if (insights.length >= limit) break;
      }
      if (insights.length >= limit) break;
    }

    // Sort by relevance/recency
    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  // ============================================================================
  // CREDIT MANAGEMENT
  // ============================================================================

  getCreditCost(category: InsightCategory): number {
    return CREDIT_COSTS[category];
  }

  getBundleCost(bundleId: string): number | undefined {
    const bundle = INSIGHT_BUNDLES.find(b => b.id === bundleId);
    return bundle?.creditCost;
  }

  getAllBundles(sport?: SportType): InsightBundle[] {
    if (sport) {
      return INSIGHT_BUNDLES.filter(b => b.sport === sport);
    }
    return INSIGHT_BUNDLES;
  }

  getBundle(bundleId: string): InsightBundle | undefined {
    return INSIGHT_BUNDLES.find(b => b.id === bundleId);
  }

  // ============================================================================
  // SUBSCRIPTION PLANS
  // ============================================================================

  getSubscriptionCredits(plan: SubscriptionPlan): number {
    const credits: Record<SubscriptionPlan, number> = {
      free: 5,
      starter: 50,
      pro: 200,
      elite: 999999, // Unlimited
      enterprise: 999999,
    };
    return credits[plan];
  }

  getSubscriptionPrice(plan: SubscriptionPlan): number {
    const prices: Record<SubscriptionPlan, number> = {
      free: 0,
      starter: 9.99,
      pro: 29.99,
      elite: 99.99,
      enterprise: 0, // Custom
    };
    return prices[plan];
  }

  getSubscriptionTier(plan: SubscriptionPlan): InsightTier {
    const tiers: Record<SubscriptionPlan, InsightTier> = {
      free: "free",
      starter: "standard",
      pro: "premium",
      elite: "elite",
      enterprise: "elite",
    };
    return tiers[plan];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async enrichWithOddsData(
    request: InsightRequest
  ): Promise<GeneratedInsight["oddsContext"] | undefined> {
    try {
      const sportKey = this.getSportKey(request.sport);
      if (!sportKey) return undefined;

      const events = await this.oddsApi.getOdds(sportKey as any);
      if (!events.length) return undefined;

      const event = events[0]; // Use first upcoming event
      const bestOdds = this.oddsApi.findBestOdds(event, "h2h");
      const arbitrage = this.oddsApi.findArbitrageOpportunities(event, "h2h");

      return {
        bestOdds,
        movements: [], // Would need historical data
        arbitrage: arbitrage ?? undefined,
      };
    } catch (error) {
      console.error("Failed to enrich with odds data:", error);
      return undefined;
    }
  }

  private getSportKey(sport: SportType): string | undefined {
    const keys: Record<SportType, string> = {
      nfl: "americanfootball_nfl",
      ncaa_basketball: "basketball_ncaab",
      golf: "golf_masters_tournament_winner",
      nba: "basketball_nba",
      mlb: "baseball_mlb",
    };
    return keys[sport];
  }

  private determineLockStatus(
    tier: InsightTier,
    isPremiumContent: boolean
  ): GeneratedInsight["lockStatus"] {
    if (tier === "elite") return "unlocked";
    if (tier === "premium" && !isPremiumContent) return "unlocked";
    if (tier === "standard") return "preview";
    return "locked";
  }

  private generatePreview(insight: InsightResponse): string {
    // Return first 200 chars of summary
    return insight.summary.substring(0, 200) + "...";
  }

  private async buildSportContext(sport: SportType): Promise<Record<string, unknown>> {
    // Build context based on sport and current date
    const now = new Date();
    const context: Record<string, unknown> = {
      currentDate: now.toISOString(),
      sport,
    };

    // Add sport-specific context
    switch (sport) {
      case "nfl":
        context.season = "2025-2026";
        context.week = this.calculateNFLWeek(now);
        break;
      case "ncaa_basketball":
        context.tournament = this.isMarchMadness(now) ? "ncaa_tournament" : "regular_season";
        break;
      case "golf":
        context.tournament = this.getCurrentGolfTournament(now);
        break;
      case "nba":
        context.phase = this.isNBAPlayoffs(now) ? "playoffs" : "regular_season";
        break;
      case "mlb":
        context.phase = this.isMLBPlayoffs(now) ? "playoffs" : "regular_season";
        break;
    }

    return context;
  }

  private categoryMatchesSport(category: InsightCategory, sport: SportType): boolean {
    const sportPrefix = sport === "ncaa_basketball" ? "ncaa" : sport;
    return category.startsWith(sportPrefix);
  }

  private calculateNFLWeek(date: Date): number {
    // NFL season typically starts first Thursday of September
    const seasonStart = new Date(date.getFullYear(), 8, 1); // September 1
    // Find first Thursday
    while (seasonStart.getDay() !== 4) {
      seasonStart.setDate(seasonStart.getDate() + 1);
    }

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksDiff = Math.floor((date.getTime() - seasonStart.getTime()) / msPerWeek);
    return Math.max(1, Math.min(18, weeksDiff + 1));
  }

  private isMarchMadness(date: Date): boolean {
    const month = date.getMonth();
    return month === 2 || (month === 3 && date.getDate() <= 10); // March and early April
  }

  private getCurrentGolfTournament(date: Date): string {
    const month = date.getMonth();
    if (month === 3 && date.getDate() >= 1 && date.getDate() <= 15) {
      return "masters";
    }
    if (month === 4 && date.getDate() >= 15 && date.getDate() <= 25) {
      return "pga_championship";
    }
    if (month === 5 && date.getDate() >= 10 && date.getDate() <= 20) {
      return "us_open";
    }
    if (month === 6 && date.getDate() >= 15 && date.getDate() <= 25) {
      return "the_open";
    }
    return "pga_tour_event";
  }

  private isNBAPlayoffs(date: Date): boolean {
    const month = date.getMonth();
    return month >= 3 && month <= 5; // April-June
  }

  private isMLBPlayoffs(date: Date): boolean {
    const month = date.getMonth();
    return month === 9 || (month === 10 && date.getDate() <= 5); // October-early November
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: AIInsightsService | null = null;

export function getAIInsightsService(): AIInsightsService {
  if (!serviceInstance) {
    serviceInstance = new AIInsightsService();
  }
  return serviceInstance;
}

export function createAIInsightsService(
  perplexity?: PerplexityClient,
  oddsApi?: OddsApiClient
): AIInsightsService {
  return new AIInsightsService(perplexity, oddsApi);
}
