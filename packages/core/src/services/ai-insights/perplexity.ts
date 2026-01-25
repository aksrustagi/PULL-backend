/**
 * Perplexity Sonar API Integration for AI-Powered Sports Insights
 *
 * Uses Perplexity's Sonar API for real-time sports analysis, predictions,
 * and contextual insights across all supported sports.
 */

import { z } from "zod";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const PerplexityModelSchema = z.enum([
  "sonar",
  "sonar-pro",
  "sonar-reasoning",
  "sonar-reasoning-pro",
]);

export type PerplexityModel = z.infer<typeof PerplexityModelSchema>;

export const InsightCategorySchema = z.enum([
  // NFL Fantasy
  "nfl_player_analysis",
  "nfl_matchup_prediction",
  "nfl_injury_impact",
  "nfl_weather_impact",
  "nfl_trade_recommendation",
  "nfl_waiver_wire",
  "nfl_start_sit",
  "nfl_dfs_lineup",

  // March Madness
  "ncaa_bracket_prediction",
  "ncaa_upset_alert",
  "ncaa_team_analysis",
  "ncaa_player_spotlight",
  "ncaa_conference_trends",
  "ncaa_betting_edge",

  // Masters / Golf
  "golf_course_analysis",
  "golf_player_form",
  "golf_weather_conditions",
  "golf_betting_value",
  "golf_fantasy_picks",
  "golf_cut_line_prediction",

  // NBA Playoffs
  "nba_series_prediction",
  "nba_player_props",
  "nba_injury_report",
  "nba_betting_trends",
  "nba_fantasy_playoff",
  "nba_clutch_analysis",

  // MLB Playoffs
  "mlb_pitching_matchup",
  "mlb_batting_trends",
  "mlb_bullpen_analysis",
  "mlb_park_factors",
  "mlb_playoff_prediction",
  "mlb_betting_value",
]);

export type InsightCategory = z.infer<typeof InsightCategorySchema>;

export const SportTypeSchema = z.enum([
  "nfl",
  "ncaa_basketball",
  "golf",
  "nba",
  "mlb",
]);

export type SportType = z.infer<typeof SportTypeSchema>;

export interface PerplexityConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: PerplexityModel;
  maxTokens?: number;
  temperature?: number;
}

export interface InsightRequest {
  sport: SportType;
  category: InsightCategory;
  context: Record<string, unknown>;
  userId?: string;
  premium?: boolean;
  sources?: string[];
}

export interface InsightResponse {
  id: string;
  sport: SportType;
  category: InsightCategory;
  title: string;
  summary: string;
  analysis: string;
  confidence: number;
  sources: InsightSource[];
  predictions?: Prediction[];
  actionItems?: ActionItem[];
  relatedMarkets?: string[];
  generatedAt: number;
  expiresAt: number;
  isPremium: boolean;
  creditsUsed: number;
}

export interface InsightSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  reliability: number;
}

export interface Prediction {
  outcome: string;
  probability: number;
  confidence: number;
  reasoning: string;
}

export interface ActionItem {
  action: string;
  priority: "high" | "medium" | "low";
  timeframe: string;
  reasoning: string;
}

export interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PerplexityRequest {
  model: string;
  messages: PerplexityMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: "month" | "week" | "day" | "hour";
  stream?: boolean;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations: string[];
  object: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }>;
}

// ============================================================================
// PERPLEXITY CLIENT
// ============================================================================

export class PerplexityClient {
  private config: Required<PerplexityConfig>;

  constructor(config: PerplexityConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.perplexity.ai",
      defaultModel: config.defaultModel ?? "sonar-pro",
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.2,
    };
  }

  async generateInsight(request: InsightRequest): Promise<InsightResponse> {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const response = await this.query({
      model: request.premium ? "sonar-reasoning-pro" : this.config.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      search_recency_filter: this.getRecencyFilter(request.category),
      search_domain_filter: request.sources ?? this.getDefaultSources(request.sport),
    });

    return this.parseInsightResponse(request, response);
  }

  async streamInsight(
    request: InsightRequest,
    onChunk: (chunk: string) => void
  ): Promise<InsightResponse> {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const response = await this.streamQuery(
      {
        model: request.premium ? "sonar-reasoning-pro" : this.config.defaultModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        search_recency_filter: this.getRecencyFilter(request.category),
        stream: true,
      },
      onChunk
    );

    return this.parseInsightResponse(request, response);
  }

  private async query(request: PerplexityRequest): Promise<PerplexityResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private async streamQuery(
    request: PerplexityRequest,
    onChunk: (chunk: string) => void
  ): Promise<PerplexityResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullContent = "";
    let lastResponse: PerplexityResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(line => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as PerplexityResponse;
          lastResponse = parsed;
          const content = parsed.choices[0]?.delta?.content ?? "";
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    if (!lastResponse) throw new Error("No response received");

    // Reconstruct full response
    lastResponse.choices[0].message = {
      role: "assistant",
      content: fullContent,
    };

    return lastResponse;
  }

  private buildSystemPrompt(request: InsightRequest): string {
    const sportContext = this.getSportContext(request.sport);
    const categoryInstructions = this.getCategoryInstructions(request.category);

    return `You are an elite sports analyst AI specializing in ${sportContext.name}.
Your role is to provide actionable, data-driven insights for sports betting and fantasy sports.

${categoryInstructions}

RESPONSE FORMAT:
Provide your analysis in the following JSON structure:
{
  "title": "Brief, compelling headline",
  "summary": "2-3 sentence executive summary",
  "analysis": "Detailed analysis with supporting data",
  "confidence": 0-100,
  "predictions": [
    {
      "outcome": "Specific prediction",
      "probability": 0-100,
      "confidence": 0-100,
      "reasoning": "Why this prediction"
    }
  ],
  "actionItems": [
    {
      "action": "What to do",
      "priority": "high|medium|low",
      "timeframe": "When to act",
      "reasoning": "Why this action"
    }
  ],
  "relatedMarkets": ["market_ticker_1", "market_ticker_2"]
}

KEY PRINCIPLES:
- Base all analysis on current, verifiable data
- Acknowledge uncertainty and variance
- Consider contrarian angles
- Factor in market inefficiencies
- Prioritize actionable insights over general commentary
- Include specific numbers and statistics
- Reference recent performance trends`;
  }

  private buildUserPrompt(request: InsightRequest): string {
    const contextStr = Object.entries(request.context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");

    return `Analyze the following for ${request.category}:

CONTEXT:
${contextStr}

Provide comprehensive insights following the response format. Focus on actionable intelligence that creates an edge.`;
  }

  private getSportContext(sport: SportType): { name: string; seasonInfo: string } {
    const contexts: Record<SportType, { name: string; seasonInfo: string }> = {
      nfl: {
        name: "NFL Football and Fantasy Football",
        seasonInfo: "Regular season September-January, Playoffs January-February",
      },
      ncaa_basketball: {
        name: "NCAA Men's Basketball and March Madness",
        seasonInfo: "Regular season November-March, Tournament March-April",
      },
      golf: {
        name: "PGA Tour Golf including The Masters",
        seasonInfo: "Year-round tour with majors April-July",
      },
      nba: {
        name: "NBA Basketball",
        seasonInfo: "Regular season October-April, Playoffs April-June",
      },
      mlb: {
        name: "MLB Baseball",
        seasonInfo: "Regular season April-September, Playoffs October",
      },
    };
    return contexts[sport];
  }

  private getCategoryInstructions(category: InsightCategory): string {
    const instructions: Record<InsightCategory, string> = {
      // NFL
      nfl_player_analysis: "Analyze individual player performance, matchups, and projections. Consider snap counts, target share, red zone usage, and defensive matchups.",
      nfl_matchup_prediction: "Predict game outcomes with score projections. Analyze offensive/defensive matchups, pace of play, and situational factors.",
      nfl_injury_impact: "Assess injury implications on team performance and fantasy value. Consider replacement players and opportunity increases.",
      nfl_weather_impact: "Evaluate weather effects on game script and player performance. Focus on wind, precipitation, and temperature extremes.",
      nfl_trade_recommendation: "Identify buy-low and sell-high trade targets based on schedule, usage trends, and perceived value.",
      nfl_waiver_wire: "Prioritize available players based on opportunity, talent, and upcoming schedule.",
      nfl_start_sit: "Recommend lineup decisions with confidence levels. Consider matchups, game script projections, and floor/ceiling analysis.",
      nfl_dfs_lineup: "Optimize DFS lineups with correlation stacks and contrarian plays. Factor in ownership projections.",

      // March Madness
      ncaa_bracket_prediction: "Predict tournament outcomes considering seed history, tempo, and style matchups. Identify Cinderella candidates.",
      ncaa_upset_alert: "Identify high-probability upset picks based on statistical mismatches and betting line inefficiencies.",
      ncaa_team_analysis: "Deep dive into team strengths, weaknesses, key players, and tournament readiness.",
      ncaa_player_spotlight: "Highlight breakout candidates and NBA prospects who could dominate tournament play.",
      ncaa_conference_trends: "Analyze conference performance patterns and how conference play translates to tournament success.",
      ncaa_betting_edge: "Find betting value in tournament lines, including totals, spreads, and props.",

      // Golf
      golf_course_analysis: "Analyze course characteristics and identify player fits based on driving distance, accuracy, approach play, and putting surfaces.",
      golf_player_form: "Evaluate recent form, strokes gained trends, and confidence levels heading into the tournament.",
      golf_weather_conditions: "Assess weather forecast impact on scoring and course conditions. Identify players who excel in specific conditions.",
      golf_betting_value: "Find odds inefficiencies in outrights, matchups, and top-10/20 bets.",
      golf_fantasy_picks: "Optimize fantasy golf lineups with salary considerations and ownership projections.",
      golf_cut_line_prediction: "Project cut line and identify players at risk of missing the weekend.",

      // NBA
      nba_series_prediction: "Predict playoff series outcomes with game-by-game projections. Consider rest, travel, and home court factors.",
      nba_player_props: "Identify value in player prop markets based on matchups, pace, and usage patterns.",
      nba_injury_report: "Assess injury impacts on rotations, minutes distribution, and team performance.",
      nba_betting_trends: "Analyze betting market movements, sharp action, and line value.",
      nba_fantasy_playoff: "Optimize fantasy playoff lineups considering rest days and matchups.",
      nba_clutch_analysis: "Evaluate clutch performance metrics and identify players who elevate in high-leverage situations.",

      // MLB
      mlb_pitching_matchup: "Analyze starting pitcher matchups, recent form, and batter vs pitcher splits.",
      mlb_batting_trends: "Evaluate team and player batting trends, hot/cold streaks, and lineup construction.",
      mlb_bullpen_analysis: "Assess bullpen rest, effectiveness, and late-inning leverage situations.",
      mlb_park_factors: "Factor in park effects on run scoring, home runs, and specific batting outcomes.",
      mlb_playoff_prediction: "Predict playoff series outcomes with pitching rotation and matchup analysis.",
      mlb_betting_value: "Find betting value in run lines, totals, and first-five innings markets.",
    };
    return instructions[category];
  }

  private getRecencyFilter(category: InsightCategory): "hour" | "day" | "week" | "month" {
    const urgentCategories: InsightCategory[] = [
      "nfl_injury_impact",
      "nfl_weather_impact",
      "nba_injury_report",
      "golf_weather_conditions",
    ];

    const dailyCategories: InsightCategory[] = [
      "nfl_start_sit",
      "nfl_dfs_lineup",
      "nba_player_props",
      "mlb_pitching_matchup",
    ];

    if (urgentCategories.includes(category)) return "hour";
    if (dailyCategories.includes(category)) return "day";
    return "week";
  }

  private getDefaultSources(sport: SportType): string[] {
    const sources: Record<SportType, string[]> = {
      nfl: [
        "espn.com",
        "nfl.com",
        "rotowire.com",
        "fantasypros.com",
        "pff.com",
        "nextgenstats.nfl.com",
      ],
      ncaa_basketball: [
        "espn.com",
        "ncaa.com",
        "kenpom.com",
        "barttorvik.com",
        "sports-reference.com",
      ],
      golf: [
        "pgatour.com",
        "espn.com",
        "golfchannel.com",
        "datagolf.com",
        "fantasynational.com",
      ],
      nba: [
        "espn.com",
        "nba.com",
        "basketball-reference.com",
        "cleaningtheglass.com",
        "statmuse.com",
      ],
      mlb: [
        "espn.com",
        "mlb.com",
        "fangraphs.com",
        "baseball-reference.com",
        "baseballsavant.mlb.com",
      ],
    };
    return sources[sport];
  }

  private parseInsightResponse(
    request: InsightRequest,
    response: PerplexityResponse
  ): InsightResponse {
    const content = response.choices[0]?.message?.content ?? "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse insight response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Calculate credits based on model and tokens
    const creditsUsed = this.calculateCredits(
      response.model,
      response.usage.total_tokens
    );

    // Calculate expiration based on category urgency
    const expiresIn = this.getExpirationMs(request.category);

    return {
      id: response.id,
      sport: request.sport,
      category: request.category,
      title: parsed.title,
      summary: parsed.summary,
      analysis: parsed.analysis,
      confidence: parsed.confidence,
      sources: response.citations.map((url, idx) => ({
        title: `Source ${idx + 1}`,
        url,
        snippet: "",
        reliability: 0.8,
      })),
      predictions: parsed.predictions,
      actionItems: parsed.actionItems,
      relatedMarkets: parsed.relatedMarkets,
      generatedAt: Date.now(),
      expiresAt: Date.now() + expiresIn,
      isPremium: request.premium ?? false,
      creditsUsed,
    };
  }

  private calculateCredits(model: string, tokens: number): number {
    const ratesPerMillion: Record<string, number> = {
      "sonar": 1,
      "sonar-pro": 3,
      "sonar-reasoning": 5,
      "sonar-reasoning-pro": 8,
    };
    const rate = ratesPerMillion[model] ?? 1;
    return Math.ceil((tokens / 1_000_000) * rate * 100); // Credits in cents
  }

  private getExpirationMs(category: InsightCategory): number {
    const hourMs = 60 * 60 * 1000;

    // Time-sensitive categories expire faster
    const urgentCategories: InsightCategory[] = [
      "nfl_injury_impact",
      "nfl_weather_impact",
      "nba_injury_report",
      "golf_weather_conditions",
      "nfl_start_sit",
    ];

    if (urgentCategories.includes(category)) return 2 * hourMs;
    return 24 * hourMs;
  }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let clientInstance: PerplexityClient | null = null;

export function getPerplexityClient(): PerplexityClient {
  if (!clientInstance) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY environment variable is required");
    }
    clientInstance = new PerplexityClient({ apiKey });
  }
  return clientInstance;
}

export function createPerplexityClient(config: PerplexityConfig): PerplexityClient {
  return new PerplexityClient(config);
}
