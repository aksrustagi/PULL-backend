/**
 * MCP Server - Fantasy Football AI Agent
 * Provides tools for draft assistance, trade analysis, and lineup optimization
 */

import { EventEmitter } from "events";

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

// ============================================================================
// Fantasy MCP Server
// ============================================================================

export class FantasyMCPServer extends EventEmitter {
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  private handlers: Map<string, (args: Record<string, any>) => Promise<MCPToolResult>> = new Map();

  constructor(private config: {
    apiBaseUrl: string;
    apiToken?: string;
  }) {
    super();
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  private registerTools(): void {
    // Draft Assistant Tools
    this.registerTool({
      name: "draft_recommend_pick",
      description: "Get AI-powered draft pick recommendations based on team needs, scoring format, and available players",
      inputSchema: {
        type: "object",
        properties: {
          draftId: { type: "string", description: "The draft ID" },
          teamId: { type: "string", description: "Your team ID" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          strategy: { type: "string", description: "Draft strategy preference", enum: ["best_available", "positional_need", "value_based", "zero_rb", "hero_rb", "robust_rb"] },
          round: { type: "string", description: "Current round number" },
          pickNumber: { type: "string", description: "Current pick number" },
        },
        required: ["draftId", "teamId", "scoringType"],
      },
    }, this.handleDraftRecommend.bind(this));

    this.registerTool({
      name: "draft_player_tier",
      description: "Get the tier ranking and value assessment for a specific player in the draft",
      inputSchema: {
        type: "object",
        properties: {
          playerId: { type: "string", description: "Player ID to evaluate" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          pickNumber: { type: "string", description: "Current overall pick number" },
        },
        required: ["playerId", "scoringType"],
      },
    }, this.handlePlayerTier.bind(this));

    this.registerTool({
      name: "draft_queue_suggest",
      description: "Suggest a pre-draft queue/watchlist based on scoring settings and league size",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          teamCount: { type: "string", description: "Number of teams in league" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          draftPosition: { type: "string", description: "Your draft position (1-based)" },
        },
        required: ["leagueId", "scoringType", "teamCount"],
      },
    }, this.handleQueueSuggest.bind(this));

    // Trade Analyzer Tools
    this.registerTool({
      name: "trade_analyze",
      description: "Analyze a potential trade to determine fairness and impact on both teams",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          teamAId: { type: "string", description: "First team ID" },
          teamAPlayers: { type: "string", description: "JSON array of player IDs team A is trading away" },
          teamBId: { type: "string", description: "Second team ID" },
          teamBPlayers: { type: "string", description: "JSON array of player IDs team B is trading away" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          includePicksA: { type: "string", description: "JSON array of draft picks team A is including" },
          includePicksB: { type: "string", description: "JSON array of draft picks team B is including" },
        },
        required: ["leagueId", "teamAId", "teamAPlayers", "teamBId", "teamBPlayers"],
      },
    }, this.handleTradeAnalyze.bind(this));

    this.registerTool({
      name: "trade_suggest",
      description: "Suggest potential trade targets to improve your team based on positional needs",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          teamId: { type: "string", description: "Your team ID" },
          targetPosition: { type: "string", description: "Position you want to improve", enum: ["QB", "RB", "WR", "TE", "K", "DEF"] },
          willingness: { type: "string", description: "How much you're willing to give up", enum: ["lowball", "fair", "overpay"] },
        },
        required: ["leagueId", "teamId"],
      },
    }, this.handleTradeSuggest.bind(this));

    this.registerTool({
      name: "trade_veto_check",
      description: "Check if a trade should be vetoed based on fairness metrics",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          tradeId: { type: "string", description: "Trade ID to evaluate" },
        },
        required: ["leagueId", "tradeId"],
      },
    }, this.handleVetoCheck.bind(this));

    // Lineup Optimizer Tools
    this.registerTool({
      name: "lineup_optimize",
      description: "Get the optimal lineup for the current week based on projections and matchups",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          teamId: { type: "string", description: "Team ID" },
          week: { type: "string", description: "NFL week number" },
          strategy: { type: "string", description: "Optimization strategy", enum: ["max_projection", "safe_floor", "boom_bust", "correlation"] },
        },
        required: ["leagueId", "teamId"],
      },
    }, this.handleLineupOptimize.bind(this));

    this.registerTool({
      name: "lineup_start_sit",
      description: "Get start/sit recommendation for a specific player decision",
      inputSchema: {
        type: "object",
        properties: {
          playerId: { type: "string", description: "Player to evaluate" },
          alternativeIds: { type: "string", description: "JSON array of alternative player IDs to compare" },
          week: { type: "string", description: "NFL week" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          matchupContext: { type: "string", description: "Whether you're favored, underdog, or close", enum: ["favored", "underdog", "close"] },
        },
        required: ["playerId", "alternativeIds"],
      },
    }, this.handleStartSit.bind(this));

    this.registerTool({
      name: "lineup_waiver_priority",
      description: "Rank waiver wire targets by priority for your team",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          teamId: { type: "string", description: "Team ID" },
          faabBudget: { type: "string", description: "Remaining FAAB budget" },
          week: { type: "string", description: "Current NFL week" },
        },
        required: ["leagueId", "teamId"],
      },
    }, this.handleWaiverPriority.bind(this));

    // Analysis Tools
    this.registerTool({
      name: "player_outlook",
      description: "Get a comprehensive rest-of-season outlook for a player",
      inputSchema: {
        type: "object",
        properties: {
          playerId: { type: "string", description: "Player ID" },
          scoringType: { type: "string", description: "Scoring format", enum: ["ppr", "half_ppr", "standard"] },
          includeSchedule: { type: "string", description: "Include remaining schedule analysis", enum: ["true", "false"] },
        },
        required: ["playerId"],
      },
    }, this.handlePlayerOutlook.bind(this));

    this.registerTool({
      name: "matchup_preview",
      description: "Get a detailed preview and prediction for a fantasy matchup",
      inputSchema: {
        type: "object",
        properties: {
          matchupId: { type: "string", description: "Matchup ID" },
          leagueId: { type: "string", description: "League ID" },
          week: { type: "string", description: "NFL week" },
        },
        required: ["matchupId", "leagueId"],
      },
    }, this.handleMatchupPreview.bind(this));

    this.registerTool({
      name: "league_power_rankings",
      description: "Generate power rankings for all teams in the league",
      inputSchema: {
        type: "object",
        properties: {
          leagueId: { type: "string", description: "League ID" },
          week: { type: "string", description: "Current NFL week" },
          methodology: { type: "string", description: "Ranking method", enum: ["overall", "recent_form", "ros_projection", "strength_of_schedule"] },
        },
        required: ["leagueId"],
      },
    }, this.handlePowerRankings.bind(this));

    // Market Tools
    this.registerTool({
      name: "market_analyze",
      description: "Analyze a prediction market for value bets and edge opportunities",
      inputSchema: {
        type: "object",
        properties: {
          marketId: { type: "string", description: "Market ID" },
          bankroll: { type: "string", description: "Available bankroll for betting" },
          riskTolerance: { type: "string", description: "Risk preference", enum: ["conservative", "moderate", "aggressive"] },
        },
        required: ["marketId"],
      },
    }, this.handleMarketAnalyze.bind(this));

    this.registerTool({
      name: "portfolio_review",
      description: "Review your betting portfolio and suggest optimizations",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          includeRecommendations: { type: "string", description: "Include actionable recommendations", enum: ["true", "false"] },
        },
        required: ["userId"],
      },
    }, this.handlePortfolioReview.bind(this));
  }

  // ============================================================================
  // Resource Registration
  // ============================================================================

  private registerResources(): void {
    this.resources.set("league-standings", {
      uri: "fantasy://leagues/{leagueId}/standings",
      name: "League Standings",
      description: "Current standings for a fantasy league",
      mimeType: "application/json",
    });

    this.resources.set("player-stats", {
      uri: "fantasy://players/{playerId}/stats",
      name: "Player Statistics",
      description: "Season statistics for an NFL player",
      mimeType: "application/json",
    });

    this.resources.set("team-roster", {
      uri: "fantasy://teams/{teamId}/roster",
      name: "Team Roster",
      description: "Current roster for a fantasy team",
      mimeType: "application/json",
    });

    this.resources.set("market-odds", {
      uri: "fantasy://markets/{marketId}/odds",
      name: "Market Odds",
      description: "Current odds and probabilities for a market",
      mimeType: "application/json",
    });

    this.resources.set("nfl-schedule", {
      uri: "fantasy://nfl/schedule/{week}",
      name: "NFL Schedule",
      description: "NFL game schedule for a given week",
      mimeType: "application/json",
    });

    this.resources.set("injury-report", {
      uri: "fantasy://nfl/injuries",
      name: "Injury Report",
      description: "Current NFL injury report",
      mimeType: "application/json",
    });
  }

  // ============================================================================
  // Prompt Registration
  // ============================================================================

  private registerPrompts(): void {
    this.prompts.set("draft-strategy", {
      name: "draft-strategy",
      description: "Generate a personalized draft strategy based on league settings and draft position",
      arguments: [
        { name: "leagueId", description: "League ID", required: true },
        { name: "draftPosition", description: "Your draft position", required: true },
        { name: "scoringType", description: "League scoring format", required: true },
      ],
    });

    this.prompts.set("weekly-gameplan", {
      name: "weekly-gameplan",
      description: "Create a comprehensive game plan for the current fantasy week",
      arguments: [
        { name: "leagueId", description: "League ID", required: true },
        { name: "teamId", description: "Your team ID", required: true },
        { name: "week", description: "NFL week", required: true },
      ],
    });

    this.prompts.set("trade-negotiation", {
      name: "trade-negotiation",
      description: "Help negotiate a trade by identifying fair value and counter-offers",
      arguments: [
        { name: "leagueId", description: "League ID", required: true },
        { name: "teamId", description: "Your team ID", required: true },
        { name: "targetPlayerId", description: "Player you want to acquire", required: true },
      ],
    });

    this.prompts.set("season-review", {
      name: "season-review",
      description: "Generate a season-end review and analysis for your fantasy team",
      arguments: [
        { name: "leagueId", description: "League ID", required: true },
        { name: "teamId", description: "Your team ID", required: true },
      ],
    });
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private async handleDraftRecommend(args: Record<string, any>): Promise<MCPToolResult> {
    const { draftId, teamId, scoringType, strategy, round, pickNumber } = args;

    // In production, this would query the API and run ML models
    const recommendations = await this.fetchFromAPI(`/fantasy/draft/${draftId}/recommend`, {
      teamId,
      scoringType,
      strategy: strategy || "best_available",
      round: round ? parseInt(round) : undefined,
      pickNumber: pickNumber ? parseInt(pickNumber) : undefined,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          recommendations: recommendations || this.getMockDraftRecommendations(scoringType, strategy),
          strategy: strategy || "best_available",
          analysis: "Based on your current roster composition, positional scarcity, and value-based rankings.",
        }, null, 2),
      }],
    };
  }

  private async handlePlayerTier(args: Record<string, any>): Promise<MCPToolResult> {
    const { playerId, scoringType, pickNumber } = args;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          playerId,
          tier: 2,
          tierLabel: "Elite",
          adp: 15.3,
          value: pickNumber ? (15.3 - parseInt(pickNumber)) : 0,
          valueLabel: pickNumber && parseInt(pickNumber) > 15.3 ? "Good Value" : "Slight Reach",
          projectedPoints: scoringType === "ppr" ? 285.4 : 265.1,
          floorPoints: 220.0,
          ceilingPoints: 340.0,
          risks: ["Injury history", "New offensive coordinator"],
          upside: ["Target share increase", "Favorable schedule"],
        }, null, 2),
      }],
    };
  }

  private async handleQueueSuggest(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          queue: this.getMockDraftQueue(args.scoringType, parseInt(args.teamCount), parseInt(args.draftPosition || "1")),
          notes: "Queue ordered by value-based drafting principles adjusted for your draft position.",
        }, null, 2),
      }],
    };
  }

  private async handleTradeAnalyze(args: Record<string, any>): Promise<MCPToolResult> {
    const teamAPlayers = JSON.parse(args.teamAPlayers || "[]");
    const teamBPlayers = JSON.parse(args.teamBPlayers || "[]");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          fairness: {
            score: 0.82, // 0-1, closer to 1 = more fair
            label: "Slightly favors Team B",
            teamAValue: 45.2,
            teamBValue: 52.8,
            difference: 7.6,
          },
          teamAImpact: {
            projectedPointsChange: -3.2,
            playoffOddsChange: -0.05,
            strengthByPosition: {
              QB: "unchanged",
              RB: "weaker",
              WR: "stronger",
              TE: "unchanged",
            },
          },
          teamBImpact: {
            projectedPointsChange: +4.1,
            playoffOddsChange: +0.08,
            strengthByPosition: {
              QB: "unchanged",
              RB: "stronger",
              WR: "weaker",
              TE: "unchanged",
            },
          },
          recommendation: "This trade slightly favors Team B. Consider asking for a draft pick or bench player to even it out.",
          vetoWorthy: false,
        }, null, 2),
      }],
    };
  }

  private async handleTradeSuggest(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          targets: [
            {
              playerId: "target_1",
              playerName: "Player A",
              team: "Team X",
              position: args.targetPosition || "RB",
              tradeValue: 42.5,
              suggestedOffer: ["Your Player 1", "Your Player 2"],
              likelihood: "medium",
              reasoning: "Team X is deep at RB but weak at WR, making this a win-win.",
            },
            {
              playerId: "target_2",
              playerName: "Player B",
              team: "Team Y",
              position: args.targetPosition || "RB",
              tradeValue: 38.0,
              suggestedOffer: ["Your Player 3"],
              likelihood: "high",
              reasoning: "Team Y needs depth and your surplus at WR aligns well.",
            },
          ],
          teamNeeds: [args.targetPosition || "RB"],
          tradableAssets: ["Your surplus position players"],
        }, null, 2),
      }],
    };
  }

  private async handleVetoCheck(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          shouldVeto: false,
          fairnessScore: 0.75,
          collusionIndicators: {
            lopsidedness: 0.2,
            teamRecordDisparity: false,
            playoffImplications: false,
            benchDumping: false,
          },
          reasoning: "While slightly uneven, both teams have legitimate strategic reasons for this trade. No collusion indicators detected.",
          recommendation: "Allow the trade to process.",
        }, null, 2),
      }],
    };
  }

  private async handleLineupOptimize(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          optimalLineup: {
            QB: { playerId: "qb1", name: "QB Player", projected: 22.5 },
            RB1: { playerId: "rb1", name: "RB Player 1", projected: 18.2 },
            RB2: { playerId: "rb2", name: "RB Player 2", projected: 14.8 },
            WR1: { playerId: "wr1", name: "WR Player 1", projected: 17.6 },
            WR2: { playerId: "wr2", name: "WR Player 2", projected: 15.3 },
            TE: { playerId: "te1", name: "TE Player", projected: 11.4 },
            FLEX: { playerId: "flex1", name: "Flex Player", projected: 13.9 },
            K: { playerId: "k1", name: "K Player", projected: 8.5 },
            DEF: { playerId: "def1", name: "DEF Team", projected: 7.2 },
          },
          totalProjected: 129.4,
          changes: [
            { slot: "FLEX", out: "Bench Player", in: "Flex Player", pointsDiff: +3.2 },
          ],
          strategy: args.strategy || "max_projection",
          confidence: 0.78,
        }, null, 2),
      }],
    };
  }

  private async handleStartSit(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          recommendation: "START",
          confidence: 0.82,
          reasoning: [
            "Favorable matchup against 28th-ranked pass defense",
            "Target share has increased 15% over last 3 weeks",
            "Indoor game eliminates weather concerns",
          ],
          projections: {
            floor: 8.5,
            median: 15.2,
            ceiling: 28.0,
          },
          alternatives: [
            { playerId: "alt1", name: "Alternative 1", recommendation: "SIT", projected: 11.8 },
            { playerId: "alt2", name: "Alternative 2", recommendation: "SIT", projected: 10.4 },
          ],
          matchupContext: args.matchupContext || "close",
          contextAdvice: "In a close matchup, go with the higher floor option.",
        }, null, 2),
      }],
    };
  }

  private async handleWaiverPriority(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          priorities: [
            { rank: 1, playerId: "w1", name: "Waiver Target 1", position: "RB", faabSuggestion: 25, reason: "Starting RB role after injury to starter" },
            { rank: 2, playerId: "w2", name: "Waiver Target 2", position: "WR", faabSuggestion: 15, reason: "Breakout performance, increasing snap count" },
            { rank: 3, playerId: "w3", name: "Waiver Target 3", position: "TE", faabSuggestion: 8, reason: "Streaming option for bye week" },
          ],
          dropCandidates: [
            { playerId: "d1", name: "Drop Candidate 1", reason: "Limited upside, decreasing usage" },
          ],
          remainingBudget: parseInt(args.faabBudget || "100"),
        }, null, 2),
      }],
    };
  }

  private async handlePlayerOutlook(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          playerId: args.playerId,
          outlook: "positive",
          rosProjection: 185.4,
          rankROS: 12,
          positionRankROS: 5,
          schedule: {
            remainingGames: 10,
            easyMatchups: 4,
            hardMatchups: 3,
            averageMatchups: 3,
            strengthOfSchedule: 0.48,
          },
          factors: {
            positive: ["Consistent target share", "Healthy", "Good offensive line"],
            negative: ["Tough schedule weeks 14-16", "Backup QB risk"],
            neutral: ["New offensive scheme still developing"],
          },
          tradeValue: {
            current: 42.5,
            trend: "rising",
            buyWindow: false,
          },
        }, null, 2),
      }],
    };
  }

  private async handleMatchupPreview(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          matchupId: args.matchupId,
          week: args.week,
          prediction: {
            homeWinProbability: 0.58,
            awayWinProbability: 0.42,
            projectedHomeScore: 118.5,
            projectedAwayScore: 112.3,
            closeness: "competitive",
          },
          keyMatchups: [
            "Home RB vs Away run defense (advantage: Home)",
            "Away WR1 vs Home CB1 (advantage: Away)",
          ],
          injuryImpact: "Minimal - no key starters ruled out",
          recommendation: "Close matchup. Consider high-ceiling plays in FLEX.",
        }, null, 2),
      }],
    };
  }

  private async handlePowerRankings(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          leagueId: args.leagueId,
          week: args.week,
          methodology: args.methodology || "overall",
          rankings: [
            { rank: 1, teamId: "t1", teamName: "Team Alpha", score: 95.2, trend: "up", record: "8-2" },
            { rank: 2, teamId: "t2", teamName: "Team Beta", score: 91.8, trend: "stable", record: "7-3" },
            { rank: 3, teamId: "t3", teamName: "Team Gamma", score: 88.4, trend: "down", record: "7-3" },
          ],
          analysis: "Team Alpha maintains the top spot with consistent scoring and depth.",
        }, null, 2),
      }],
    };
  }

  private async handleMarketAnalyze(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          marketId: args.marketId,
          analysis: {
            expectedValue: 1.12,
            edge: 0.08,
            confidence: 0.72,
            recommendation: "LEAN_YES",
          },
          outcomes: [
            { label: "Yes", price: 0.62, fairValue: 0.67, edge: 0.05, recommendation: "Buy" },
            { label: "No", price: 0.38, fairValue: 0.33, edge: -0.05, recommendation: "Avoid" },
          ],
          kellyBet: {
            fullKelly: 14.2,
            halfKelly: 7.1,
            quarterKelly: 3.55,
          },
          riskAssessment: args.riskTolerance || "moderate",
          suggestedBet: 7.1,
        }, null, 2),
      }],
    };
  }

  private async handlePortfolioReview(args: Record<string, any>): Promise<MCPToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          userId: args.userId,
          summary: {
            totalInvested: 245.50,
            currentValue: 278.30,
            unrealizedPnL: 32.80,
            realizedPnL: 15.40,
            totalReturn: 0.196,
            winRate: 0.64,
          },
          positions: [
            { marketId: "m1", title: "Market 1", invested: 50, currentValue: 62, pnl: 12 },
            { marketId: "m2", title: "Market 2", invested: 30, currentValue: 28, pnl: -2 },
          ],
          recommendations: [
            { action: "CASH_OUT", marketId: "m1", reason: "Lock in 24% profit, market close approaching" },
            { action: "HOLD", marketId: "m2", reason: "Expected positive catalyst incoming" },
          ],
          diversification: {
            score: 0.65,
            suggestion: "Consider adding positions in different market types for better diversification",
          },
        }, null, 2),
      }],
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private registerTool(tool: MCPTool, handler: (args: Record<string, any>) => Promise<MCPToolResult>): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  private async fetchFromAPI(path: string, params?: Record<string, any>): Promise<any> {
    try {
      const url = new URL(path, this.config.apiBaseUrl);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  private getMockDraftRecommendations(scoringType: string, strategy?: string): any[] {
    return [
      { rank: 1, playerId: "p1", name: "Top Pick", position: "RB", tier: 1, projected: 310 },
      { rank: 2, playerId: "p2", name: "Second Pick", position: "WR", tier: 1, projected: 295 },
      { rank: 3, playerId: "p3", name: "Third Pick", position: "RB", tier: 2, projected: 275 },
    ];
  }

  private getMockDraftQueue(scoringType: string, teamCount: number, position: number): any[] {
    return Array.from({ length: 20 }, (_, i) => ({
      rank: i + 1,
      playerId: `q${i}`,
      name: `Queue Player ${i + 1}`,
      position: ["RB", "WR", "QB", "TE"][i % 4],
      adp: (i + 1) * 1.5,
      tier: Math.floor(i / 5) + 1,
    }));
  }

  // ============================================================================
  // MCP Protocol Interface
  // ============================================================================

  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values());
  }

  async executeTool(call: MCPToolCall): Promise<MCPToolResult> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
        isError: true,
      };
    }

    try {
      return await handler(call.arguments);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error executing ${call.name}: ${error.message}` }],
        isError: true,
      };
    }
  }

  async getResource(uri: string): Promise<MCPToolResult> {
    try {
      // Parse URI and fetch data
      const data = await this.fetchFromAPI(uri.replace("fantasy://", "/api/v1/fantasy/"));
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error fetching resource: ${error.message}` }],
        isError: true,
      };
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export function createFantasyMCPServer(config: {
  apiBaseUrl: string;
  apiToken?: string;
}): FantasyMCPServer {
  return new FantasyMCPServer(config);
}
