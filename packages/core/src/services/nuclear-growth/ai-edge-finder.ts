/**
 * NUCLEAR GROWTH FEATURE #3: AI Edge Finder
 *
 * Real-time +EV (positive expected value) opportunity detection.
 * AI scans all markets to find edges before they close.
 *
 * WHY IT'S NUCLEAR:
 * - Makes users feel like they have an unfair advantage
 * - Creates urgency (edges disappear fast)
 * - Builds trust when picks hit
 * - Converts free users to premium
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const EdgeTypeSchema = z.enum([
  "arbitrage",        // Risk-free profit across books
  "positive_ev",      // +EV based on true odds
  "line_movement",    // Sharp money movement
  "steam_move",       // Coordinated line movement
  "closing_line",     // Beat the closing line
  "prop_mispricing",  // Mispriced player props
  "alt_line_value",   // Value in alternate lines
  "live_edge",        // In-game mispricing
  "weather_edge",     // Weather impact not priced
  "injury_edge",      // Injury news not reflected
  "public_fade",      // Fade heavy public side
  "reverse_line",     // Line moving opposite of money
]);

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const ConfidenceLevelSchema = z.enum([
  "low",      // 51-55% confidence
  "medium",   // 56-65% confidence
  "high",     // 66-75% confidence
  "very_high", // 76-85% confidence
  "elite",    // 86%+ confidence
]);

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export interface Edge {
  id: string;
  type: EdgeType;
  sport: string;
  league: string;

  // Game info
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: number;

  // Edge details
  market: string;
  selection: string;
  currentOdds: number;
  fairOdds: number;
  edgePercent: number;
  expectedValue: number;

  // For arbitrage
  arbitrageDetails?: ArbitrageDetails;

  // Confidence
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0-100

  // Timing
  detectedAt: number;
  expiresAt?: number;
  isLive: boolean;

  // Analysis
  reasoning: string[];
  dataPoints: DataPoint[];
  historicalHitRate?: number;

  // Recommendations
  recommendedBet: number; // Kelly criterion
  maxBet: number;
  minOdds: number; // Don't take if odds drop below

  // Status
  status: "active" | "taken" | "expired" | "lost_edge";
}

export interface ArbitrageDetails {
  legs: ArbitrageLeg[];
  guaranteedProfit: number;
  requiredBankroll: number;
  profitPercent: number;
}

export interface ArbitrageLeg {
  sportsbook: string;
  selection: string;
  odds: number;
  stake: number;
  toWin: number;
}

export interface DataPoint {
  source: string;
  metric: string;
  value: number | string;
  impact: "positive" | "negative" | "neutral";
}

export interface EdgeAlert {
  id: string;
  userId: string;
  edgeId: string;
  type: EdgeType;
  selection: string;
  odds: number;
  edgePercent: number;
  confidence: ConfidenceLevel;
  sentAt: number;
  seenAt?: number;
  actedOn?: boolean;
}

export interface EdgeFilter {
  sports?: string[];
  leagues?: string[];
  edgeTypes?: EdgeType[];
  minEdgePercent?: number;
  minConfidence?: ConfidenceLevel;
  maxOdds?: number;
  minOdds?: number;
  includeLive?: boolean;
}

export interface EdgePerformance {
  userId: string;
  period: "day" | "week" | "month" | "all_time";

  // Stats
  edgesTaken: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  units: number;
  profit: number;

  // By type
  byType: Record<EdgeType, {
    taken: number;
    wins: number;
    roi: number;
  }>;

  // By confidence
  byConfidence: Record<ConfidenceLevel, {
    taken: number;
    wins: number;
    hitRate: number;
  }>;
}

export interface EdgeSubscription {
  userId: string;
  tier: "free" | "basic" | "pro" | "elite";
  filters: EdgeFilter;
  notificationChannels: ("push" | "email" | "sms")[];
  maxAlertsPerDay: number;
  alertsSentToday: number;
  lastResetAt: number;
}

// ============================================================================
// EDGE SUBSCRIPTION TIERS
// ============================================================================

export const EDGE_TIERS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "3 edge alerts per day",
      "Medium+ confidence only",
      "Major sports only",
      "2% minimum edge",
    ],
    maxAlerts: 3,
    minConfidence: "medium" as ConfidenceLevel,
    minEdge: 2,
    sports: ["NFL", "NBA", "MLB", "NHL"],
  },
  basic: {
    name: "Basic",
    price: 19.99,
    features: [
      "20 edge alerts per day",
      "All confidence levels",
      "All sports",
      "1% minimum edge",
      "Live edges",
    ],
    maxAlerts: 20,
    minConfidence: "low" as ConfidenceLevel,
    minEdge: 1,
    sports: "all",
  },
  pro: {
    name: "Pro",
    price: 49.99,
    features: [
      "Unlimited edge alerts",
      "Arbitrage opportunities",
      "Steam move alerts",
      "Real-time notifications",
      "Kelly criterion sizing",
      "Historical performance data",
    ],
    maxAlerts: Infinity,
    minConfidence: "low" as ConfidenceLevel,
    minEdge: 0.5,
    sports: "all",
  },
  elite: {
    name: "Elite",
    price: 149.99,
    features: [
      "Everything in Pro",
      "5-minute early access",
      "Private Discord channel",
      "1-on-1 strategy calls",
      "Custom alerts",
      "API access",
    ],
    maxAlerts: Infinity,
    minConfidence: "low" as ConfidenceLevel,
    minEdge: 0,
    sports: "all",
    earlyAccess: 5 * 60 * 1000, // 5 minutes
  },
};

// ============================================================================
// AI EDGE FINDER SERVICE
// ============================================================================

export class AIEdgeFinderService {
  /**
   * Calculate expected value
   */
  calculateEV(currentOdds: number, fairOdds: number, stake: number = 100): {
    ev: number;
    evPercent: number;
    impliedProb: number;
    fairProb: number;
  } {
    // Convert American odds to implied probability
    const impliedProb = this.oddsToProb(currentOdds);
    const fairProb = this.oddsToProb(fairOdds);

    // EV = (Win Probability * Win Amount) - (Loss Probability * Stake)
    const winAmount = this.calculateWinAmount(currentOdds, stake);
    const ev = (fairProb * winAmount) - ((1 - fairProb) * stake);
    const evPercent = (ev / stake) * 100;

    return { ev, evPercent, impliedProb, fairProb };
  }

  /**
   * Calculate Kelly criterion bet size
   */
  calculateKelly(odds: number, winProbability: number, bankroll: number, fraction: number = 0.25): {
    fullKelly: number;
    fractionalKelly: number;
    recommendedBet: number;
  } {
    const decimalOdds = this.americanToDecimal(odds);
    const b = decimalOdds - 1; // Net odds
    const p = winProbability;
    const q = 1 - p;

    // Kelly formula: f* = (bp - q) / b
    const fullKelly = Math.max(0, (b * p - q) / b);
    const fractionalKelly = fullKelly * fraction;
    const recommendedBet = Math.round(bankroll * fractionalKelly);

    return { fullKelly, fractionalKelly, recommendedBet };
  }

  /**
   * Detect arbitrage opportunity
   */
  detectArbitrage(
    odds1: { sportsbook: string; selection: string; odds: number },
    odds2: { sportsbook: string; selection: string; odds: number },
    bankroll: number = 1000
  ): ArbitrageDetails | null {
    const prob1 = this.oddsToProb(odds1.odds);
    const prob2 = this.oddsToProb(odds2.odds);
    const totalProb = prob1 + prob2;

    // Arbitrage exists if total implied probability < 100%
    if (totalProb >= 1) return null;

    const profitPercent = ((1 / totalProb) - 1) * 100;
    const stake1 = (bankroll * prob1) / totalProb;
    const stake2 = (bankroll * prob2) / totalProb;

    return {
      legs: [
        {
          sportsbook: odds1.sportsbook,
          selection: odds1.selection,
          odds: odds1.odds,
          stake: Math.round(stake1 * 100) / 100,
          toWin: Math.round(this.calculateWinAmount(odds1.odds, stake1) * 100) / 100,
        },
        {
          sportsbook: odds2.sportsbook,
          selection: odds2.selection,
          odds: odds2.odds,
          stake: Math.round(stake2 * 100) / 100,
          toWin: Math.round(this.calculateWinAmount(odds2.odds, stake2) * 100) / 100,
        },
      ],
      guaranteedProfit: Math.round((bankroll * profitPercent / 100) * 100) / 100,
      requiredBankroll: bankroll,
      profitPercent: Math.round(profitPercent * 100) / 100,
    };
  }

  /**
   * Analyze line movement
   */
  analyzeLineMovement(
    openingLine: number,
    currentLine: number,
    publicBetPercent: number
  ): {
    direction: "sharp" | "public" | "neutral";
    suspiciousMovement: boolean;
    recommendation: string;
  } {
    const lineChange = currentLine - openingLine;
    const publicSide = publicBetPercent > 50;
    const movedWithPublic = (lineChange > 0 && publicSide) || (lineChange < 0 && !publicSide);

    // Reverse line movement = sharp money
    const reverseLineMovement = !movedWithPublic && Math.abs(lineChange) >= 0.5;

    if (reverseLineMovement) {
      return {
        direction: "sharp",
        suspiciousMovement: true,
        recommendation: `Sharp money detected on ${lineChange < 0 ? "favorite" : "underdog"}. Consider following.`,
      };
    }

    if (movedWithPublic && publicBetPercent > 70) {
      return {
        direction: "public",
        suspiciousMovement: false,
        recommendation: "Heavy public action. Consider fading if line moves further.",
      };
    }

    return {
      direction: "neutral",
      suspiciousMovement: false,
      recommendation: "Normal line movement. No clear edge.",
    };
  }

  /**
   * Create an edge
   */
  createEdge(
    type: EdgeType,
    gameInfo: {
      gameId: string;
      sport: string;
      league: string;
      homeTeam: string;
      awayTeam: string;
      gameTime: number;
    },
    edgeInfo: {
      market: string;
      selection: string;
      currentOdds: number;
      fairOdds: number;
      reasoning: string[];
      dataPoints?: DataPoint[];
      isLive?: boolean;
    }
  ): Edge {
    const { ev, evPercent, fairProb } = this.calculateEV(
      edgeInfo.currentOdds,
      edgeInfo.fairOdds
    );

    const edgePercent = evPercent;
    const confidence = this.calculateConfidence(edgePercent, edgeInfo.dataPoints?.length ?? 0);

    // Kelly sizing with 25% fractional Kelly
    const { recommendedBet, fullKelly } = this.calculateKelly(
      edgeInfo.currentOdds,
      fairProb,
      1000 // Assume $1000 unit for recommendation
    );

    return {
      id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      sport: gameInfo.sport,
      league: gameInfo.league,
      gameId: gameInfo.gameId,
      homeTeam: gameInfo.homeTeam,
      awayTeam: gameInfo.awayTeam,
      gameTime: gameInfo.gameTime,
      market: edgeInfo.market,
      selection: edgeInfo.selection,
      currentOdds: edgeInfo.currentOdds,
      fairOdds: edgeInfo.fairOdds,
      edgePercent: Math.round(edgePercent * 100) / 100,
      expectedValue: Math.round(ev * 100) / 100,
      confidence,
      confidenceScore: this.getConfidenceScore(confidence),
      detectedAt: Date.now(),
      expiresAt: gameInfo.gameTime,
      isLive: edgeInfo.isLive ?? false,
      reasoning: edgeInfo.reasoning,
      dataPoints: edgeInfo.dataPoints ?? [],
      recommendedBet: Math.max(10, Math.min(recommendedBet, 200)), // $10-$200 range
      maxBet: Math.round(recommendedBet * 2),
      minOdds: Math.round(edgeInfo.currentOdds * 0.9), // Don't take if drops 10%
      status: "active",
    };
  }

  /**
   * Filter edges for user subscription
   */
  filterEdgesForSubscription(
    edges: Edge[],
    subscription: EdgeSubscription
  ): Edge[] {
    const tier = EDGE_TIERS[subscription.tier];

    return edges.filter(edge => {
      // Check confidence level
      if (this.getConfidenceScore(edge.confidence) < this.getConfidenceScore(tier.minConfidence)) {
        return false;
      }

      // Check edge percent
      if (edge.edgePercent < tier.minEdge) {
        return false;
      }

      // Check sports
      if (tier.sports !== "all" && !tier.sports.includes(edge.league)) {
        return false;
      }

      // Check custom filters
      if (subscription.filters.sports?.length && !subscription.filters.sports.includes(edge.sport)) {
        return false;
      }

      if (subscription.filters.edgeTypes?.length && !subscription.filters.edgeTypes.includes(edge.type)) {
        return false;
      }

      if (subscription.filters.minEdgePercent && edge.edgePercent < subscription.filters.minEdgePercent) {
        return false;
      }

      if (!subscription.filters.includeLive && edge.isLive) {
        return false;
      }

      return true;
    });
  }

  /**
   * Generate edge performance report
   */
  generatePerformanceReport(
    edgesTaken: Array<{
      edge: Edge;
      result: "win" | "loss" | "push";
      stake: number;
      profit: number;
    }>,
    period: EdgePerformance["period"]
  ): Omit<EdgePerformance, "userId"> {
    const wins = edgesTaken.filter(e => e.result === "win").length;
    const losses = edgesTaken.filter(e => e.result === "loss").length;
    const pushes = edgesTaken.filter(e => e.result === "push").length;
    const totalStake = edgesTaken.reduce((sum, e) => sum + e.stake, 0);
    const totalProfit = edgesTaken.reduce((sum, e) => sum + e.profit, 0);

    // Group by type
    const byType: EdgePerformance["byType"] = {} as any;
    for (const edgeType of Object.values(EdgeTypeSchema.enum)) {
      const typeEdges = edgesTaken.filter(e => e.edge.type === edgeType);
      const typeWins = typeEdges.filter(e => e.result === "win").length;
      const typeStake = typeEdges.reduce((sum, e) => sum + e.stake, 0);
      const typeProfit = typeEdges.reduce((sum, e) => sum + e.profit, 0);

      byType[edgeType] = {
        taken: typeEdges.length,
        wins: typeWins,
        roi: typeStake > 0 ? (typeProfit / typeStake) * 100 : 0,
      };
    }

    // Group by confidence
    const byConfidence: EdgePerformance["byConfidence"] = {} as any;
    for (const confidence of Object.values(ConfidenceLevelSchema.enum)) {
      const confEdges = edgesTaken.filter(e => e.edge.confidence === confidence);
      const confWins = confEdges.filter(e => e.result === "win").length;

      byConfidence[confidence] = {
        taken: confEdges.length,
        wins: confWins,
        hitRate: confEdges.length > 0 ? (confWins / confEdges.length) * 100 : 0,
      };
    }

    return {
      period,
      edgesTaken: edgesTaken.length,
      wins,
      losses,
      pushes,
      winRate: edgesTaken.length > 0 ? (wins / (wins + losses)) * 100 : 0,
      roi: totalStake > 0 ? (totalProfit / totalStake) * 100 : 0,
      units: totalProfit / 100, // Assuming $100 units
      profit: totalProfit,
      byType,
      byConfidence,
    };
  }

  private oddsToProb(americanOdds: number): number {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    }
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }

  private americanToDecimal(americanOdds: number): number {
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    }
    return (100 / Math.abs(americanOdds)) + 1;
  }

  private calculateWinAmount(americanOdds: number, stake: number): number {
    if (americanOdds > 0) {
      return (stake * americanOdds) / 100;
    }
    return (stake * 100) / Math.abs(americanOdds);
  }

  private calculateConfidence(edgePercent: number, dataPoints: number): ConfidenceLevel {
    const baseScore = edgePercent * 10 + dataPoints * 5;

    if (baseScore >= 80) return "elite";
    if (baseScore >= 60) return "very_high";
    if (baseScore >= 40) return "high";
    if (baseScore >= 20) return "medium";
    return "low";
  }

  private getConfidenceScore(confidence: ConfidenceLevel): number {
    const scores: Record<ConfidenceLevel, number> = {
      low: 1,
      medium: 2,
      high: 3,
      very_high: 4,
      elite: 5,
    };
    return scores[confidence];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAIEdgeFinderService(): AIEdgeFinderService {
  return new AIEdgeFinderService();
}
