/**
 * AI Copilot Insights Service
 * Analyzes betting patterns and generates personalized insights
 */

import {
  CopilotInsight,
  InsightType,
  ConfidenceLevel,
  AlertPriority,
  SuggestedAction,
  UserBettingProfile,
  BettingPattern,
  CategoryPerformance,
  PatternAnalysis,
  RiskAssessment,
  RiskFactor,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface InsightsServiceConfig {
  minBetsForAnalysis: number;
  patternWindowDays: number;
  streakAlertThreshold: number;
  tiltDetectionThreshold: number;
  maxInsightsPerUser: number;
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
  analyze(prompt: string, context: Record<string, unknown>): Promise<string>;
  generateInsights(profile: UserBettingProfile): Promise<string[]>;
}

interface BetRecord {
  id: string;
  userId: string;
  marketId: string;
  marketCategory: string;
  outcome: string;
  stake: number;
  odds: number;
  result: "won" | "lost" | "pending" | "push";
  profit?: number;
  placedAt: number;
  settledAt?: number;
}

const DEFAULT_CONFIG: InsightsServiceConfig = {
  minBetsForAnalysis: 10,
  patternWindowDays: 30,
  streakAlertThreshold: 3,
  tiltDetectionThreshold: 3,
  maxInsightsPerUser: 50,
};

// ============================================================================
// INSIGHTS SERVICE
// ============================================================================

export class InsightsService {
  private readonly config: InsightsServiceConfig;
  private readonly db: ConvexClient;
  private readonly ai: AIProvider;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    ai: AIProvider,
    config?: Partial<InsightsServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.ai = ai;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Insights] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Insights] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Insights] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Insights] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // PROFILE ANALYSIS
  // ==========================================================================

  async analyzeBettingProfile(userId: string): Promise<UserBettingProfile> {
    const windowStart = Date.now() - this.config.patternWindowDays * 24 * 60 * 60 * 1000;

    const bets = await this.db.query<BetRecord[]>("bets:getByUser", {
      userId,
      since: windowStart,
    });

    if (bets.length < this.config.minBetsForAnalysis) {
      return this.createEmptyProfile(userId);
    }

    // Calculate basic stats
    const settledBets = bets.filter((b) => b.result !== "pending");
    const wonBets = settledBets.filter((b) => b.result === "won");
    const lostBets = settledBets.filter((b) => b.result === "lost");

    const totalWon = wonBets.reduce((sum, b) => sum + (b.profit ?? 0), 0);
    const totalLost = lostBets.reduce((sum, b) => sum + b.stake, 0);
    const profitLoss = totalWon - totalLost;
    const totalStaked = settledBets.reduce((sum, b) => sum + b.stake, 0);
    const roi = totalStaked > 0 ? (profitLoss / totalStaked) * 100 : 0;

    // Calculate category performance
    const categoryPerformance = this.calculateCategoryPerformance(settledBets);

    // Identify patterns
    const patterns = await this.identifyPatterns(userId, bets);

    // Calculate behavioral metrics
    const behavioral = this.analyzeBehavior(bets);

    // Calculate streaks
    const streaks = this.calculateStreaks(settledBets);

    const profile: UserBettingProfile = {
      userId,
      totalBets: bets.length,
      totalWon: wonBets.length,
      totalLost: lostBets.length,
      winRate: settledBets.length > 0 ? (wonBets.length / settledBets.length) * 100 : 0,
      roi,
      profitLoss,
      categoryPerformance,
      patterns,
      avgBetSize: totalStaked / settledBets.length,
      maxBetSize: Math.max(...bets.map((b) => b.stake)),
      avgOdds: settledBets.reduce((sum, b) => sum + b.odds, 0) / settledBets.length,
      favoriteOddsRange: this.calculateFavoriteOddsRange(settledBets),
      bettingFrequency: behavioral.frequency,
      preferredBetTiming: behavioral.timing,
      tiltRisk: behavioral.tiltRisk,
      chasingLosses: behavioral.chasingLosses,
      currentStreak: streaks.current,
      longestWinStreak: streaks.longestWin,
      longestLossStreak: streaks.longestLoss,
      analyzedAt: Date.now(),
    };

    // Save profile
    await this.db.mutation("bettingProfiles:upsert", { profile });

    return profile;
  }

  private calculateCategoryPerformance(
    bets: BetRecord[]
  ): Record<string, CategoryPerformance> {
    const categories = new Map<string, BetRecord[]>();

    for (const bet of bets) {
      const existing = categories.get(bet.marketCategory) ?? [];
      existing.push(bet);
      categories.set(bet.marketCategory, existing);
    }

    const performance: Record<string, CategoryPerformance> = {};

    for (const [category, categoryBets] of categories) {
      const wins = categoryBets.filter((b) => b.result === "won");
      const losses = categoryBets.filter((b) => b.result === "lost");
      const profit = categoryBets.reduce((sum, b) => sum + (b.profit ?? 0), 0);
      const staked = categoryBets.reduce((sum, b) => sum + b.stake, 0);

      performance[category] = {
        category,
        bets: categoryBets.length,
        wins: wins.length,
        losses: losses.length,
        winRate: categoryBets.length > 0 ? (wins.length / categoryBets.length) * 100 : 0,
        roi: staked > 0 ? (profit / staked) * 100 : 0,
        profitLoss: profit - losses.reduce((sum, b) => sum + b.stake, 0),
        avgOdds: categoryBets.reduce((sum, b) => sum + b.odds, 0) / categoryBets.length,
        edge: 0, // Calculated separately
      };
    }

    return performance;
  }

  private async identifyPatterns(
    userId: string,
    bets: BetRecord[]
  ): Promise<BettingPattern[]> {
    const patterns: BettingPattern[] = [];

    // Pattern 1: Time-based patterns
    const timePatterns = this.analyzeTimePatterns(bets);
    patterns.push(...timePatterns);

    // Pattern 2: Odds range patterns
    const oddsPatterns = this.analyzeOddsPatterns(bets);
    patterns.push(...oddsPatterns);

    // Pattern 3: Category patterns
    const categoryPatterns = this.analyzeCategoryPatterns(bets);
    patterns.push(...categoryPatterns);

    // Pattern 4: Streak patterns
    const streakPatterns = this.analyzeStreakPatterns(bets);
    patterns.push(...streakPatterns);

    // Pattern 5: Stake patterns
    const stakePatterns = this.analyzeStakePatterns(bets);
    patterns.push(...stakePatterns);

    return patterns;
  }

  private analyzeTimePatterns(bets: BetRecord[]): BettingPattern[] {
    const patterns: BettingPattern[] = [];

    // Group by hour of day
    const hourlyResults = new Map<number, { wins: number; total: number }>();

    for (const bet of bets) {
      const hour = new Date(bet.placedAt).getHours();
      const existing = hourlyResults.get(hour) ?? { wins: 0, total: 0 };
      existing.total++;
      if (bet.result === "won") existing.wins++;
      hourlyResults.set(hour, existing);
    }

    // Find best and worst hours
    let bestHour = -1;
    let bestWinRate = 0;
    let worstHour = -1;
    let worstWinRate = 100;

    for (const [hour, results] of hourlyResults) {
      if (results.total >= 3) {
        const winRate = (results.wins / results.total) * 100;
        if (winRate > bestWinRate) {
          bestWinRate = winRate;
          bestHour = hour;
        }
        if (winRate < worstWinRate) {
          worstWinRate = winRate;
          worstHour = hour;
        }
      }
    }

    if (bestHour >= 0 && bestWinRate > 60) {
      patterns.push({
        id: `time_best_${bestHour}`,
        name: "Peak Performance Time",
        type: "positive",
        description: `Your best performance is at ${bestHour}:00 with ${bestWinRate.toFixed(0)}% win rate`,
        frequency: hourlyResults.get(bestHour)!.total,
        impact: 0,
        recommendation: `Consider placing more bets around ${bestHour}:00`,
      });
    }

    if (worstHour >= 0 && worstWinRate < 40) {
      patterns.push({
        id: `time_worst_${worstHour}`,
        name: "Low Performance Time",
        type: "negative",
        description: `Your worst performance is at ${worstHour}:00 with ${worstWinRate.toFixed(0)}% win rate`,
        frequency: hourlyResults.get(worstHour)!.total,
        impact: 0,
        recommendation: `Consider avoiding bets around ${worstHour}:00`,
      });
    }

    return patterns;
  }

  private analyzeOddsPatterns(bets: BetRecord[]): BettingPattern[] {
    const patterns: BettingPattern[] = [];

    const oddsRanges = [
      { min: 1.01, max: 1.5, name: "Heavy Favorites" },
      { min: 1.5, max: 2.0, name: "Moderate Favorites" },
      { min: 2.0, max: 3.0, name: "Even Money" },
      { min: 3.0, max: 5.0, name: "Underdogs" },
      { min: 5.0, max: Infinity, name: "Long Shots" },
    ];

    for (const range of oddsRanges) {
      const rangeBets = bets.filter(
        (b) => b.odds >= range.min && b.odds < range.max
      );

      if (rangeBets.length >= 5) {
        const wins = rangeBets.filter((b) => b.result === "won").length;
        const winRate = (wins / rangeBets.length) * 100;
        const expectedWinRate = (1 / ((range.min + range.max) / 2)) * 100;
        const edge = winRate - expectedWinRate;

        if (Math.abs(edge) >= 10) {
          patterns.push({
            id: `odds_${range.name.toLowerCase().replace(" ", "_")}`,
            name: `${range.name} Edge`,
            type: edge > 0 ? "positive" : "negative",
            description: `Your win rate for ${range.name} is ${winRate.toFixed(0)}% (expected: ${expectedWinRate.toFixed(0)}%)`,
            frequency: rangeBets.length,
            impact: edge,
            recommendation:
              edge > 0
                ? `You have an edge on ${range.name}. Consider focusing here.`
                : `${range.name} are underperforming. Consider smaller stakes.`,
          });
        }
      }
    }

    return patterns;
  }

  private analyzeCategoryPatterns(bets: BetRecord[]): BettingPattern[] {
    const patterns: BettingPattern[] = [];

    const categoryGroups = new Map<string, BetRecord[]>();
    for (const bet of bets) {
      const existing = categoryGroups.get(bet.marketCategory) ?? [];
      existing.push(bet);
      categoryGroups.set(bet.marketCategory, existing);
    }

    for (const [category, categoryBets] of categoryGroups) {
      if (categoryBets.length >= 5) {
        const wins = categoryBets.filter((b) => b.result === "won").length;
        const winRate = (wins / categoryBets.length) * 100;

        if (winRate >= 65) {
          patterns.push({
            id: `category_strong_${category}`,
            name: `Strong in ${category}`,
            type: "positive",
            description: `${winRate.toFixed(0)}% win rate in ${category} (${categoryBets.length} bets)`,
            frequency: categoryBets.length,
            impact: 0,
            recommendation: `Continue focusing on ${category} markets`,
          });
        } else if (winRate <= 35) {
          patterns.push({
            id: `category_weak_${category}`,
            name: `Weak in ${category}`,
            type: "negative",
            description: `Only ${winRate.toFixed(0)}% win rate in ${category} (${categoryBets.length} bets)`,
            frequency: categoryBets.length,
            impact: 0,
            recommendation: `Consider reducing exposure to ${category} markets`,
          });
        }
      }
    }

    return patterns;
  }

  private analyzeStreakPatterns(bets: BetRecord[]): BettingPattern[] {
    const patterns: BettingPattern[] = [];

    // Sort by placement time
    const sortedBets = [...bets].sort((a, b) => a.placedAt - b.placedAt);

    // Analyze behavior after streaks
    let afterWinStreakWins = 0;
    let afterWinStreakTotal = 0;
    let afterLossStreakWins = 0;
    let afterLossStreakTotal = 0;

    let currentStreak = 0;

    for (let i = 0; i < sortedBets.length; i++) {
      const bet = sortedBets[i];

      if (currentStreak >= 3) {
        afterWinStreakTotal++;
        if (bet.result === "won") afterWinStreakWins++;
      } else if (currentStreak <= -3) {
        afterLossStreakTotal++;
        if (bet.result === "won") afterLossStreakWins++;
      }

      if (bet.result === "won") {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      } else if (bet.result === "lost") {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      }
    }

    if (afterWinStreakTotal >= 3) {
      const winRate = (afterWinStreakWins / afterWinStreakTotal) * 100;
      if (winRate < 40) {
        patterns.push({
          id: "streak_overconfidence",
          name: "Post-Streak Overconfidence",
          type: "negative",
          description: `After 3+ win streaks, your win rate drops to ${winRate.toFixed(0)}%`,
          frequency: afterWinStreakTotal,
          impact: 0,
          recommendation: "Be cautious after hot streaks. Consider taking a break or reducing stakes.",
        });
      }
    }

    if (afterLossStreakTotal >= 3) {
      const winRate = (afterLossStreakWins / afterLossStreakTotal) * 100;
      if (winRate < 40) {
        patterns.push({
          id: "streak_chasing",
          name: "Loss Chasing Detected",
          type: "negative",
          description: `After 3+ loss streaks, your win rate is ${winRate.toFixed(0)}%`,
          frequency: afterLossStreakTotal,
          impact: 0,
          recommendation: "Take a break after losing streaks. Avoid chasing losses.",
        });
      }
    }

    return patterns;
  }

  private analyzeStakePatterns(bets: BetRecord[]): BettingPattern[] {
    const patterns: BettingPattern[] = [];

    const avgStake = bets.reduce((sum, b) => sum + b.stake, 0) / bets.length;

    // Analyze high stake performance
    const highStakeBets = bets.filter((b) => b.stake > avgStake * 1.5);
    if (highStakeBets.length >= 5) {
      const wins = highStakeBets.filter((b) => b.result === "won").length;
      const winRate = (wins / highStakeBets.length) * 100;

      if (winRate < 40) {
        patterns.push({
          id: "stake_high_loss",
          name: "High Stakes Underperformance",
          type: "negative",
          description: `Your high stake bets have ${winRate.toFixed(0)}% win rate`,
          frequency: highStakeBets.length,
          impact: 0,
          recommendation: "Consider more consistent bet sizing. Reduce stakes on less confident bets.",
        });
      }
    }

    return patterns;
  }

  private analyzeBehavior(bets: BetRecord[]): {
    frequency: "casual" | "regular" | "heavy";
    timing: string[];
    tiltRisk: "low" | "medium" | "high";
    chasingLosses: boolean;
  } {
    const betsPerDay = bets.length / this.config.patternWindowDays;

    let frequency: "casual" | "regular" | "heavy";
    if (betsPerDay < 1) {
      frequency = "casual";
    } else if (betsPerDay < 5) {
      frequency = "regular";
    } else {
      frequency = "heavy";
    }

    // Analyze timing
    const hourCounts = new Map<number, number>();
    for (const bet of bets) {
      const hour = new Date(bet.placedAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    const sortedHours = [...hourCounts.entries()].sort((a, b) => b[1] - a[1]);
    const timing = sortedHours.slice(0, 3).map(([hour]) => `${hour}:00`);

    // Detect tilt
    const sortedBets = [...bets].sort((a, b) => a.placedAt - b.placedAt);
    let rapidBetsAfterLoss = 0;

    for (let i = 1; i < sortedBets.length; i++) {
      const prev = sortedBets[i - 1];
      const curr = sortedBets[i];

      if (
        prev.result === "lost" &&
        curr.placedAt - prev.placedAt < 10 * 60 * 1000 // Within 10 minutes
      ) {
        rapidBetsAfterLoss++;
      }
    }

    let tiltRisk: "low" | "medium" | "high";
    const tiltRate = rapidBetsAfterLoss / bets.length;
    if (tiltRate < 0.05) {
      tiltRisk = "low";
    } else if (tiltRate < 0.15) {
      tiltRisk = "medium";
    } else {
      tiltRisk = "high";
    }

    return {
      frequency,
      timing,
      tiltRisk,
      chasingLosses: tiltRate > 0.1,
    };
  }

  private calculateStreaks(bets: BetRecord[]): {
    current: number;
    longestWin: number;
    longestLoss: number;
  } {
    const sortedBets = [...bets].sort((a, b) => a.placedAt - b.placedAt);

    let current = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const bet of sortedBets) {
      if (bet.result === "won") {
        currentWinStreak++;
        currentLossStreak = 0;
        longestWin = Math.max(longestWin, currentWinStreak);
      } else if (bet.result === "lost") {
        currentLossStreak++;
        currentWinStreak = 0;
        longestLoss = Math.max(longestLoss, currentLossStreak);
      }
    }

    current = currentWinStreak > 0 ? currentWinStreak : -currentLossStreak;

    return { current, longestWin, longestLoss };
  }

  private calculateFavoriteOddsRange(bets: BetRecord[]): { min: number; max: number } {
    if (bets.length === 0) {
      return { min: 1.5, max: 3.0 };
    }

    const odds = bets.map((b) => b.odds).sort((a, b) => a - b);
    const q1Index = Math.floor(odds.length * 0.25);
    const q3Index = Math.floor(odds.length * 0.75);

    return {
      min: odds[q1Index],
      max: odds[q3Index],
    };
  }

  private createEmptyProfile(userId: string): UserBettingProfile {
    return {
      userId,
      totalBets: 0,
      totalWon: 0,
      totalLost: 0,
      winRate: 0,
      roi: 0,
      profitLoss: 0,
      categoryPerformance: {},
      patterns: [],
      avgBetSize: 0,
      maxBetSize: 0,
      avgOdds: 0,
      favoriteOddsRange: { min: 1.5, max: 3.0 },
      bettingFrequency: "casual",
      preferredBetTiming: [],
      tiltRisk: "low",
      chasingLosses: false,
      currentStreak: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      analyzedAt: Date.now(),
    };
  }

  // ==========================================================================
  // INSIGHT GENERATION
  // ==========================================================================

  async generateInsights(userId: string): Promise<CopilotInsight[]> {
    const profile = await this.analyzeBettingProfile(userId);
    const insights: CopilotInsight[] = [];

    // Generate pattern-based insights
    for (const pattern of profile.patterns) {
      const insight = this.createPatternInsight(userId, pattern);
      if (insight) {
        insights.push(insight);
      }
    }

    // Generate risk warnings
    const riskInsights = this.generateRiskInsights(userId, profile);
    insights.push(...riskInsights);

    // Generate streak alerts
    const streakInsights = this.generateStreakInsights(userId, profile);
    insights.push(...streakInsights);

    // Save insights
    for (const insight of insights) {
      await this.db.mutation("copilotInsights:create", { insight });
    }

    return insights;
  }

  private createPatternInsight(
    userId: string,
    pattern: BettingPattern
  ): CopilotInsight | null {
    const now = Date.now();

    const insight: CopilotInsight = {
      id: this.generateId(),
      userId,
      type: "pattern_detected",
      priority: pattern.type === "negative" ? "high" : "medium",
      confidence: "medium",
      confidenceScore: 70,
      title: pattern.name,
      summary: pattern.description,
      detailedAnalysis: pattern.description,
      keyFactors: [pattern.recommendation],
      patternAnalysis: {
        patternType: pattern.type,
        occurrences: pattern.frequency,
        winRate: 0,
        avgProfit: pattern.impact,
        description: pattern.description,
        relatedBets: [],
      },
      suggestedAction: { type: "review", reason: pattern.recommendation },
      generatedAt: now,
    };

    return insight;
  }

  private generateRiskInsights(
    userId: string,
    profile: UserBettingProfile
  ): CopilotInsight[] {
    const insights: CopilotInsight[] = [];
    const now = Date.now();

    // Tilt risk warning
    if (profile.tiltRisk === "high") {
      insights.push({
        id: this.generateId(),
        userId,
        type: "risk_warning",
        priority: "urgent",
        confidence: "high",
        confidenceScore: 85,
        title: "High Tilt Risk Detected",
        summary: "You're placing bets rapidly after losses, which often leads to poor decisions.",
        detailedAnalysis:
          "Analysis shows you frequently place new bets within minutes of losing. This behavior is associated with emotional decision-making and lower win rates.",
        keyFactors: [
          "Rapid betting after losses",
          "Potential emotional decision-making",
          "Higher risk of compounding losses",
        ],
        riskAssessment: {
          overallRisk: "high",
          riskScore: 80,
          factors: [
            {
              name: "Tilt Behavior",
              severity: "high",
              description: "Betting rapidly after losses",
            },
          ],
          mitigations: [
            "Take a 15-minute break after any loss",
            "Set a daily loss limit",
            "Use cool-down periods between bets",
          ],
          maxRecommendedStake: profile.avgBetSize * 0.5,
        },
        suggestedAction: { type: "review", reason: "Take a break and review your strategy" },
        generatedAt: now,
      });
    }

    // Chasing losses warning
    if (profile.chasingLosses) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "risk_warning",
        priority: "high",
        confidence: "high",
        confidenceScore: 80,
        title: "Loss Chasing Pattern Detected",
        summary: "Your betting pattern suggests you may be trying to recover losses quickly.",
        detailedAnalysis:
          "After losing streaks, your bet frequency and stake sizes tend to increase. This is a common but costly pattern.",
        keyFactors: [
          "Increased betting after losses",
          "Higher stakes following losing streaks",
          "Reduced decision-making time",
        ],
        suggestedAction: { type: "review", reason: "Stick to your original bankroll management plan" },
        generatedAt: now,
      });
    }

    return insights;
  }

  private generateStreakInsights(
    userId: string,
    profile: UserBettingProfile
  ): CopilotInsight[] {
    const insights: CopilotInsight[] = [];
    const now = Date.now();

    // Win streak alert
    if (profile.currentStreak >= this.config.streakAlertThreshold) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "streak_alert",
        priority: "medium",
        confidence: "high",
        confidenceScore: 75,
        title: `${profile.currentStreak} Win Streak!`,
        summary: `You're on a ${profile.currentStreak} game winning streak. Stay disciplined.`,
        detailedAnalysis:
          "Hot streaks can lead to overconfidence. Maintain your strategy and don't increase stakes significantly.",
        keyFactors: [
          "Maintain current strategy",
          "Avoid overconfidence",
          "Consider locking in some profits",
        ],
        suggestedAction: { type: "review", reason: "Celebrate but stay disciplined" },
        generatedAt: now,
      });
    }

    // Loss streak warning
    if (profile.currentStreak <= -this.config.streakAlertThreshold) {
      insights.push({
        id: this.generateId(),
        userId,
        type: "streak_alert",
        priority: "high",
        confidence: "high",
        confidenceScore: 80,
        title: `${Math.abs(profile.currentStreak)} Loss Streak Alert`,
        summary: `You're on a ${Math.abs(profile.currentStreak)} game losing streak. Consider taking a break.`,
        detailedAnalysis:
          "Losing streaks are normal, but continuing to bet while frustrated often makes things worse. Take time to reset.",
        keyFactors: [
          "Take a break to reset mentally",
          "Review recent bet analysis",
          "Reduce stake sizes temporarily",
        ],
        suggestedAction: { type: "review", reason: "Take a break and review your recent bets" },
        generatedAt: now,
      });
    }

    return insights;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private generateId(): string {
    return `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: InsightsService | null = null;

export function getInsightsService(
  db: ConvexClient,
  ai: AIProvider
): InsightsService {
  if (!serviceInstance) {
    serviceInstance = new InsightsService(db, ai);
  }
  return serviceInstance;
}

export function createInsightsService(
  db: ConvexClient,
  ai: AIProvider,
  config?: Partial<InsightsServiceConfig>
): InsightsService {
  return new InsightsService(db, ai, config);
}
