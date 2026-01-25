/**
 * KILLER FEATURE #4: AI Betting Coach
 *
 * Personal AI assistant that learns your betting style, identifies leaks,
 * and provides real-time guidance.
 *
 * WHY IT KILLS:
 * - Personalized experience creates stickiness
 * - Helps users improve (actually valuable)
 * - Reduces losing streaks that cause churn
 * - Premium upsell opportunity
 *
 * K-FACTOR BOOST:
 * - "My coach says..." shareable insights
 * - Leaderboard for most improved bettors
 * - Coach challenges and achievements
 * - Referral bonus for coach upgrades
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const BettingStyleSchema = z.enum([
  "sharp",           // Data-driven, high volume, small edges
  "value_hunter",    // Looks for mispriced odds
  "chalk_eater",     // Bets favorites
  "underdog_lover",  // Bets underdogs
  "parlay_player",   // Loves multi-leg bets
  "prop_specialist", // Focuses on props
  "event_bettor",    // Big events only
  "streaky",         // Hot/cold patterns
  "balanced",        // Mix of everything
]);

export type BettingStyle = z.infer<typeof BettingStyleSchema>;

export const LeakTypeSchema = z.enum([
  "chasing_losses",      // Increases bets after losses
  "overconfidence",      // Bets too much on "sure things"
  "recency_bias",        // Over-weights recent results
  "favorite_bias",       // Always picks favorites
  "underdog_bias",       // Always picks underdogs
  "parlay_addiction",    // Too many parlays
  "poor_bankroll",       // Doesn't manage bankroll
  "emotional_betting",   // Bets on favorite teams
  "line_shopping",       // Doesn't compare odds
  "timing",              // Bets at wrong times
  "sport_weakness",      // Consistently loses on specific sport
]);

export type LeakType = z.infer<typeof LeakTypeSchema>;

export interface BettorProfile {
  userId: string;
  style: BettingStyle;
  styleConfidence: number;

  // Strengths
  strengths: BettingStrength[];

  // Leaks (weaknesses)
  leaks: BettingLeak[];

  // Patterns
  patterns: BettingPattern[];

  // Performance by category
  sportPerformance: Record<string, CategoryPerformance>;
  betTypePerformance: Record<string, CategoryPerformance>;
  oddsRangePerformance: Record<string, CategoryPerformance>;
  dayOfWeekPerformance: Record<string, CategoryPerformance>;

  // Bankroll health
  bankrollHealth: BankrollHealth;

  // Learning progress
  lessonsCompleted: string[];
  skillLevel: number; // 1-100

  lastAnalyzedAt: number;
}

export interface BettingStrength {
  category: string;
  description: string;
  roi: number;
  sampleSize: number;
  confidence: number;
}

export interface BettingLeak {
  type: LeakType;
  severity: "minor" | "moderate" | "severe";
  description: string;
  impact: number; // Estimated cost per month
  evidence: string[];
  fixPlan: string[];
  detectedAt: number;
}

export interface BettingPattern {
  name: string;
  description: string;
  frequency: number;
  impact: "positive" | "negative" | "neutral";
  recommendation: string;
}

export interface CategoryPerformance {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  roi: number;
  profit: number;
  avgOdds: number;
  trend: "improving" | "declining" | "stable";
}

export interface BankrollHealth {
  currentBalance: number;
  startingBalance: number;
  recommendedBetSize: number;
  maxBetSize: number;
  riskLevel: "conservative" | "moderate" | "aggressive" | "dangerous";
  daysAtCurrentRate: number; // Days until bust at current pace
  recommendation: string;
}

export interface CoachMessage {
  id: string;
  userId: string;
  type: "tip" | "warning" | "insight" | "lesson" | "encouragement" | "alert";
  title: string;
  message: string;
  actionable: boolean;
  action?: {
    label: string;
    url: string;
  };
  priority: "low" | "medium" | "high" | "urgent";
  read: boolean;
  createdAt: number;
}

export interface CoachRecommendation {
  id: string;
  userId: string;
  type: "bet" | "avoid" | "lesson" | "goal";
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  expiresAt?: number;
}

export interface BetAnalysis {
  betId: string;
  verdict: "good" | "okay" | "risky" | "bad";
  score: number; // 0-100
  reasoning: string[];
  suggestions: string[];
  alternativeBets?: {
    description: string;
    reason: string;
    expectedEdge: number;
  }[];
}

export interface LessonModule {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  topics: string[];
  quiz?: QuizQuestion[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// ============================================================================
// AI COACH SERVICE
// ============================================================================

export class AICoachService {
  /**
   * Analyze betting style from history
   */
  analyzeBettingStyle(bets: Array<{
    sport: string;
    betType: string;
    odds: number;
    amount: number;
    result: "win" | "loss" | "push";
    isParlay: boolean;
  }>): { style: BettingStyle; confidence: number } {
    if (bets.length < 20) {
      return { style: "balanced", confidence: 0.3 };
    }

    const metrics = {
      avgOdds: 0,
      parlayRate: 0,
      propRate: 0,
      favoriteRate: 0,
      volume: bets.length,
      consistency: 0,
    };

    let totalOdds = 0;
    let parlays = 0;
    let props = 0;
    let favorites = 0;

    for (const bet of bets) {
      totalOdds += bet.odds;
      if (bet.isParlay) parlays++;
      if (bet.betType.includes("prop")) props++;
      if (bet.odds < -150) favorites++;
    }

    metrics.avgOdds = totalOdds / bets.length;
    metrics.parlayRate = parlays / bets.length;
    metrics.propRate = props / bets.length;
    metrics.favoriteRate = favorites / bets.length;

    // Determine style
    if (metrics.parlayRate > 0.4) {
      return { style: "parlay_player", confidence: 0.85 };
    }
    if (metrics.propRate > 0.5) {
      return { style: "prop_specialist", confidence: 0.8 };
    }
    if (metrics.favoriteRate > 0.7) {
      return { style: "chalk_eater", confidence: 0.8 };
    }
    if (metrics.avgOdds > 150) {
      return { style: "underdog_lover", confidence: 0.8 };
    }
    if (metrics.volume > 100 && metrics.avgOdds > -130 && metrics.avgOdds < 130) {
      return { style: "sharp", confidence: 0.75 };
    }

    return { style: "balanced", confidence: 0.6 };
  }

  /**
   * Detect betting leaks
   */
  detectLeaks(
    bets: Array<{
      amount: number;
      odds: number;
      result: "win" | "loss" | "push";
      timestamp: number;
      sport: string;
      isFavoriteTeam?: boolean;
    }>,
    bankroll: number
  ): BettingLeak[] {
    const leaks: BettingLeak[] = [];

    // Check for chasing losses
    const chasingEvidence = this.detectChasingLosses(bets);
    if (chasingEvidence.detected) {
      leaks.push({
        type: "chasing_losses",
        severity: chasingEvidence.severity,
        description: "You tend to increase bet size after losses",
        impact: chasingEvidence.estimatedCost,
        evidence: chasingEvidence.examples,
        fixPlan: [
          "Set a maximum bet size and stick to it",
          "Take a 10-minute break after any loss",
          "Use our auto-limit feature to cap bet increases",
        ],
        detectedAt: Date.now(),
      });
    }

    // Check for poor bankroll management
    const avgBet = bets.reduce((sum, b) => sum + b.amount, 0) / bets.length;
    const maxBet = Math.max(...bets.map(b => b.amount));

    if (maxBet > bankroll * 0.2) {
      leaks.push({
        type: "poor_bankroll",
        severity: maxBet > bankroll * 0.5 ? "severe" : "moderate",
        description: "Your bet sizes are too large relative to your bankroll",
        impact: bankroll * 0.1, // Estimated monthly impact
        evidence: [
          `Max bet of $${maxBet} is ${Math.round(maxBet / bankroll * 100)}% of bankroll`,
          `Average bet should be 1-3% of bankroll, yours is ${Math.round(avgBet / bankroll * 100)}%`,
        ],
        fixPlan: [
          "Never bet more than 5% of your bankroll on a single bet",
          "Use flat betting: same amount on every bet",
          "Set up automatic bankroll tracking",
        ],
        detectedAt: Date.now(),
      });
    }

    // Check for emotional betting (betting on favorite teams)
    const emotionalBets = bets.filter(b => b.isFavoriteTeam);
    if (emotionalBets.length > 0) {
      const emotionalWinRate = emotionalBets.filter(b => b.result === "win").length / emotionalBets.length;
      const overallWinRate = bets.filter(b => b.result === "win").length / bets.length;

      if (emotionalWinRate < overallWinRate - 0.05) {
        leaks.push({
          type: "emotional_betting",
          severity: "moderate",
          description: "You perform worse when betting on your favorite teams",
          impact: (overallWinRate - emotionalWinRate) * avgBet * emotionalBets.length,
          evidence: [
            `Win rate on favorite teams: ${Math.round(emotionalWinRate * 100)}%`,
            `Overall win rate: ${Math.round(overallWinRate * 100)}%`,
          ],
          fixPlan: [
            "Consider avoiding bets on teams you're emotionally invested in",
            "If you must bet, reduce your stake by 50%",
            "Wait 1 hour before placing bets on your teams",
          ],
          detectedAt: Date.now(),
        });
      }
    }

    return leaks;
  }

  /**
   * Analyze a potential bet
   */
  analyzeBet(
    bet: {
      sport: string;
      betType: string;
      odds: number;
      amount: number;
      event: string;
    },
    profile: BettorProfile,
    bankroll: number
  ): BetAnalysis {
    const reasoning: string[] = [];
    const suggestions: string[] = [];
    let score = 70; // Start neutral

    // Check bet size
    const betPct = bet.amount / bankroll;
    if (betPct > 0.1) {
      score -= 20;
      reasoning.push(`Bet size (${Math.round(betPct * 100)}% of bankroll) is too high`);
      suggestions.push(`Consider reducing to $${Math.round(bankroll * 0.03)} (3% of bankroll)`);
    } else if (betPct < 0.01) {
      reasoning.push("Bet size is conservative, which is fine for learning");
    } else {
      score += 5;
      reasoning.push("Bet size is appropriate for your bankroll");
    }

    // Check against known leaks
    for (const leak of profile.leaks) {
      if (leak.type === "parlay_addiction" && bet.betType.includes("parlay")) {
        score -= 15;
        reasoning.push("Warning: Parlays are an identified leak in your betting");
        suggestions.push("Consider a straight bet instead of parlay");
      }
      if (leak.type === "underdog_bias" && bet.odds > 150) {
        score -= 10;
        reasoning.push("Note: You tend to over-bet underdogs");
      }
    }

    // Check sport performance
    const sportPerf = profile.sportPerformance[bet.sport];
    if (sportPerf) {
      if (sportPerf.roi < -0.1 && sportPerf.bets > 20) {
        score -= 15;
        reasoning.push(`Your ROI on ${bet.sport} is ${Math.round(sportPerf.roi * 100)}% - consider reducing action`);
      } else if (sportPerf.roi > 0.05 && sportPerf.bets > 20) {
        score += 10;
        reasoning.push(`${bet.sport} is one of your stronger sports (+${Math.round(sportPerf.roi * 100)}% ROI)`);
      }
    }

    // Determine verdict
    let verdict: BetAnalysis["verdict"];
    if (score >= 80) verdict = "good";
    else if (score >= 60) verdict = "okay";
    else if (score >= 40) verdict = "risky";
    else verdict = "bad";

    return {
      betId: `analysis_${Date.now()}`,
      verdict,
      score,
      reasoning,
      suggestions,
    };
  }

  /**
   * Generate personalized coaching message
   */
  generateCoachingMessage(
    profile: BettorProfile,
    recentBets: Array<{ result: "win" | "loss" | "push"; timestamp: number }>
  ): CoachMessage {
    const recentResults = recentBets.slice(-10);
    const wins = recentResults.filter(b => b.result === "win").length;
    const losses = recentResults.filter(b => b.result === "loss").length;

    // Check for hot streak
    if (wins >= 7) {
      return {
        id: `msg_${Date.now()}`,
        userId: profile.userId,
        type: "tip",
        title: "Hot streak alert! 🔥",
        message: "You're on fire! Remember: variance goes both ways. Consider banking some profits or reducing bet sizes to protect your gains.",
        actionable: true,
        action: {
          label: "Review bankroll",
          url: "/bankroll",
        },
        priority: "medium",
        read: false,
        createdAt: Date.now(),
      };
    }

    // Check for cold streak
    if (losses >= 7) {
      return {
        id: `msg_${Date.now()}`,
        userId: profile.userId,
        type: "warning",
        title: "Time for a breather",
        message: "Rough stretch. This happens to everyone. Take a step back, review your recent bets, and don't chase losses. Tomorrow's a new day.",
        actionable: true,
        action: {
          label: "Take a break",
          url: "/settings/limits",
        },
        priority: "high",
        read: false,
        createdAt: Date.now(),
      };
    }

    // Check for identified leaks
    const severeLeak = profile.leaks.find(l => l.severity === "severe");
    if (severeLeak) {
      return {
        id: `msg_${Date.now()}`,
        userId: profile.userId,
        type: "lesson",
        title: "Fix your biggest leak",
        message: `We've identified ${severeLeak.type.replace(/_/g, " ")} as costing you an estimated $${severeLeak.impact}/month. Let's work on this together.`,
        actionable: true,
        action: {
          label: "Start lesson",
          url: `/coach/lessons/${severeLeak.type}`,
        },
        priority: "high",
        read: false,
        createdAt: Date.now(),
      };
    }

    // Default: encourage learning
    return {
      id: `msg_${Date.now()}`,
      userId: profile.userId,
      type: "insight",
      title: "Daily insight",
      message: `Your strongest category is ${this.getStrongestCategory(profile)}. Consider focusing more bets there while improving in weaker areas.`,
      actionable: false,
      priority: "low",
      read: false,
      createdAt: Date.now(),
    };
  }

  /**
   * Get recommended bet size
   */
  getRecommendedBetSize(
    bankroll: number,
    confidence: number,
    edge: number
  ): { amount: number; reasoning: string } {
    // Kelly Criterion (fractional)
    const kellyFraction = 0.25; // Use quarter Kelly for safety
    const kellyBet = bankroll * (edge / (1 / confidence - 1)) * kellyFraction;

    // Cap at reasonable percentages
    const maxBet = bankroll * 0.05;
    const minBet = bankroll * 0.01;

    const recommended = Math.max(minBet, Math.min(maxBet, kellyBet));

    return {
      amount: Math.round(recommended),
      reasoning: `Based on ${Math.round(confidence * 100)}% confidence and your bankroll, using fractional Kelly Criterion`,
    };
  }

  private detectChasingLosses(bets: Array<{
    amount: number;
    result: "win" | "loss" | "push";
    timestamp: number;
  }>): {
    detected: boolean;
    severity: "minor" | "moderate" | "severe";
    estimatedCost: number;
    examples: string[];
  } {
    const sortedBets = [...bets].sort((a, b) => a.timestamp - b.timestamp);
    let chasingInstances = 0;
    let totalChasingLoss = 0;
    const examples: string[] = [];

    for (let i = 1; i < sortedBets.length; i++) {
      const prev = sortedBets[i - 1];
      const curr = sortedBets[i];

      if (prev.result === "loss" && curr.amount > prev.amount * 1.5) {
        chasingInstances++;
        if (curr.result === "loss") {
          totalChasingLoss += curr.amount;
          examples.push(`After $${prev.amount} loss, increased to $${curr.amount} and lost`);
        }
      }
    }

    const chasingRate = chasingInstances / bets.length;

    return {
      detected: chasingRate > 0.1,
      severity: chasingRate > 0.3 ? "severe" : chasingRate > 0.2 ? "moderate" : "minor",
      estimatedCost: totalChasingLoss,
      examples: examples.slice(0, 3),
    };
  }

  private getStrongestCategory(profile: BettorProfile): string {
    let strongest = "";
    let highestRoi = -Infinity;

    for (const [sport, perf] of Object.entries(profile.sportPerformance)) {
      if (perf.bets >= 10 && perf.roi > highestRoi) {
        highestRoi = perf.roi;
        strongest = sport;
      }
    }

    return strongest || "overall betting";
  }
}

// ============================================================================
// LESSON MODULES
// ============================================================================

export const COACH_LESSONS: LessonModule[] = [
  {
    id: "bankroll_101",
    title: "Bankroll Management 101",
    description: "Learn the fundamentals of managing your betting bankroll",
    difficulty: "beginner",
    estimatedMinutes: 15,
    topics: ["Unit sizing", "Never chase losses", "Track everything"],
  },
  {
    id: "value_betting",
    title: "Finding Value Bets",
    description: "How to identify when odds are in your favor",
    difficulty: "intermediate",
    estimatedMinutes: 20,
    topics: ["Expected value", "Line shopping", "Closing line value"],
  },
  {
    id: "psychology",
    title: "Betting Psychology",
    description: "Master your emotions and avoid common pitfalls",
    difficulty: "beginner",
    estimatedMinutes: 15,
    topics: ["Tilt control", "FOMO avoidance", "Discipline"],
  },
  {
    id: "advanced_handicapping",
    title: "Advanced Handicapping",
    description: "Take your analysis to the next level",
    difficulty: "advanced",
    estimatedMinutes: 30,
    topics: ["Statistical models", "Situational factors", "Market analysis"],
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createAICoachService(): AICoachService {
  return new AICoachService();
}
