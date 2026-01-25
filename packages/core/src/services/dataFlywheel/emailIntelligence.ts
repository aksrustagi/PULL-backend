/**
 * Email Intelligence Data Collection Service (with consent)
 *
 * Collects and analyzes:
 * - Newsletter → market correlation
 * - Calendar events → trading behavior
 * - Communication patterns
 * - Information sources that predict moves
 */

import type {
  DataConsent,
  ConsentType,
  NewsletterCorrelation,
  CalendarTradingCorrelation,
  InformationSource,
} from "./types";

// ============================================================================
// Consent Management
// ============================================================================

export class ConsentManager {
  /**
   * Check if user has granted a specific consent
   */
  hasConsent(
    userConsents: DataConsent[],
    consentType: ConsentType
  ): boolean {
    const consent = userConsents.find(
      (c) => c.consentType === consentType && c.status === "granted"
    );

    if (!consent) return false;

    // Check if expired
    if (consent.expiresAt && consent.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * Get all active consents for a user
   */
  getActiveConsents(userConsents: DataConsent[]): ConsentType[] {
    return userConsents
      .filter(
        (c) =>
          c.status === "granted" &&
          (!c.expiresAt || c.expiresAt > Date.now())
      )
      .map((c) => c.consentType);
  }

  /**
   * Validate consent scope for a specific data operation
   */
  validateConsentScope(
    userConsents: DataConsent[],
    consentType: ConsentType,
    requiredScope: string[]
  ): { valid: boolean; missingScopes: string[] } {
    const consent = userConsents.find(
      (c) => c.consentType === consentType && c.status === "granted"
    );

    if (!consent) {
      return { valid: false, missingScopes: requiredScope };
    }

    const missingScopes = requiredScope.filter(
      (scope) => !consent.scope.includes(scope)
    );

    return {
      valid: missingScopes.length === 0,
      missingScopes,
    };
  }

  /**
   * Create a new consent record
   */
  createConsentRecord(
    userId: string,
    consentType: ConsentType,
    scope: string[],
    thirdPartySharing: boolean,
    expiresInDays?: number
  ): Omit<DataConsent, "status"> & { status: "granted" } {
    return {
      userId,
      consentType,
      status: "granted",
      scope,
      thirdPartySharing,
      grantedAt: Date.now(),
      expiresAt: expiresInDays
        ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
    };
  }

  /**
   * Generate consent request for user
   */
  generateConsentRequest(consentType: ConsentType): {
    title: string;
    description: string;
    dataTypes: string[];
    benefits: string[];
    risks: string[];
  } {
    const requests: Record<ConsentType, ReturnType<typeof this.generateConsentRequest>> = {
      email_analysis: {
        title: "Email Analysis Consent",
        description:
          "Allow analysis of your email content to identify trading signals and patterns.",
        dataTypes: [
          "Newsletter subjects and senders",
          "Email timing patterns",
          "Financial-related keywords",
        ],
        benefits: [
          "Personalized trading insights",
          "Newsletter performance tracking",
          "Information source rankings",
        ],
        risks: ["Email content processed by AI", "Patterns stored in our database"],
      },
      calendar_analysis: {
        title: "Calendar Analysis Consent",
        description:
          "Allow analysis of calendar events to optimize your trading schedule.",
        dataTypes: [
          "Event types (anonymized)",
          "Event timing",
          "Duration patterns",
        ],
        benefits: [
          "Trading time optimization",
          "Avoid trading during distractions",
          "Performance correlation insights",
        ],
        risks: ["Calendar metadata analyzed", "Behavioral patterns tracked"],
      },
      trading_data_sharing: {
        title: "Trading Data Sharing Consent",
        description:
          "Allow your anonymized trading data to be included in aggregate signals.",
        dataTypes: [
          "Trade direction and timing",
          "Position sizes (relative)",
          "Win/loss outcomes",
        ],
        benefits: [
          "Contribute to community signals",
          "Access to premium data features",
          "Priority in data rewards program",
        ],
        risks: ["Data aggregated with others", "Used in research"],
      },
      anonymized_data_sale: {
        title: "Anonymized Data Sale Consent",
        description:
          "Allow your fully anonymized data to be sold to institutional investors.",
        dataTypes: [
          "Behavioral patterns (anonymized)",
          "Trading flow contribution",
          "Sentiment signals",
        ],
        benefits: [
          "Revenue share from data sales",
          "Premium tier access",
          "Reduced platform fees",
        ],
        risks: [
          "Data sold to third parties",
          "Cannot be individually identified but patterns shared",
        ],
      },
      research_participation: {
        title: "Research Participation Consent",
        description: "Allow your data to be used in academic and market research.",
        dataTypes: [
          "Trading behavior patterns",
          "Performance metrics",
          "Survey responses",
        ],
        benefits: [
          "Early access to research findings",
          "Contribute to market knowledge",
          "Research credit in publications",
        ],
        risks: ["Data used in studies", "Findings may be published"],
      },
      premium_insights: {
        title: "Premium Insights Consent",
        description:
          "Allow deeper analysis of your data for personalized premium insights.",
        dataTypes: [
          "Full trading history analysis",
          "Cross-platform data correlation",
          "Behavioral profiling",
        ],
        benefits: [
          "Personalized AI trading coach",
          "Detailed performance reports",
          "Custom strategy recommendations",
        ],
        risks: ["Extensive data processing", "Detailed profile created"],
      },
    };

    return requests[consentType];
  }
}

// ============================================================================
// Newsletter Analysis
// ============================================================================

export class NewsletterAnalyzer {
  private readonly financialKeywords = [
    "buy",
    "sell",
    "hold",
    "bullish",
    "bearish",
    "breakout",
    "support",
    "resistance",
    "earnings",
    "forecast",
    "price target",
    "rating",
    "upgrade",
    "downgrade",
    "alert",
    "opportunity",
  ];

  private readonly tickerPattern = /\$([A-Z]{1,5})\b/g;

  /**
   * Analyze a newsletter email for trading signals
   */
  analyzeNewsletter(
    userId: string,
    email: {
      id: string;
      fromEmail: string;
      subject: string;
      bodyPlain: string;
      receivedAt: number;
    }
  ): Omit<NewsletterCorrelation, "correlatedAssets" | "userTradedAfter" | "tradingPnL" | "predictiveScore"> {
    // Extract tickers
    const bodyUpper = email.bodyPlain?.toUpperCase() || "";
    const subjectUpper = email.subject.toUpperCase();
    const combinedText = `${subjectUpper} ${bodyUpper}`;

    const tickerMatches = combinedText.match(this.tickerPattern) || [];
    const extractedTickers = [...new Set(tickerMatches.map((t) => t.slice(1)))];

    // Extract topics
    const extractedTopics: string[] = [];
    for (const keyword of this.financialKeywords) {
      if (combinedText.toLowerCase().includes(keyword)) {
        extractedTopics.push(keyword);
      }
    }

    // Calculate sentiment
    const sentimentScore = this.calculateSentiment(combinedText);

    // Calculate urgency
    const urgencyScore = this.calculateUrgency(email.subject, email.bodyPlain || "");

    // Identify newsletter source
    const newsletterSource = this.identifyNewsletterSource(email.fromEmail);

    return {
      userId,
      emailId: email.id as any, // Would be proper ID type
      newsletterSource,
      sentimentScore,
      extractedTickers,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Calculate sentiment from text
   */
  private calculateSentiment(text: string): number {
    const bullishWords = [
      "buy",
      "bullish",
      "long",
      "breakout",
      "opportunity",
      "upgrade",
      "strong",
      "growth",
      "profit",
    ];
    const bearishWords = [
      "sell",
      "bearish",
      "short",
      "crash",
      "decline",
      "downgrade",
      "weak",
      "loss",
      "risk",
    ];

    const lowerText = text.toLowerCase();
    let bullishCount = 0;
    let bearishCount = 0;

    for (const word of bullishWords) {
      const matches = lowerText.match(new RegExp(word, "g"));
      if (matches) bullishCount += matches.length;
    }

    for (const word of bearishWords) {
      const matches = lowerText.match(new RegExp(word, "g"));
      if (matches) bearishCount += matches.length;
    }

    const total = bullishCount + bearishCount;
    return total > 0 ? (bullishCount - bearishCount) / total : 0;
  }

  /**
   * Calculate urgency score
   */
  private calculateUrgency(subject: string, body: string): number {
    const urgentIndicators = [
      "urgent",
      "alert",
      "breaking",
      "now",
      "immediately",
      "action required",
      "time-sensitive",
      "don't miss",
      "last chance",
      "today only",
    ];

    const combinedText = `${subject} ${body}`.toLowerCase();
    let urgencyScore = 0;

    for (const indicator of urgentIndicators) {
      if (combinedText.includes(indicator)) {
        urgencyScore += 0.15;
      }
    }

    // Cap and exclamation marks
    const exclamations = (subject.match(/!/g) || []).length;
    const allCaps =
      subject === subject.toUpperCase() && subject.length > 10 ? 0.2 : 0;

    return Math.min(urgencyScore + exclamations * 0.05 + allCaps, 1);
  }

  /**
   * Identify newsletter source from email
   */
  private identifyNewsletterSource(fromEmail: string): string {
    // Extract domain
    const domain = fromEmail.split("@")[1]?.split(".")[0] || "unknown";
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  /**
   * Correlate newsletter with subsequent price movements
   */
  correlateWithPriceMovements(
    newsletter: NewsletterCorrelation,
    priceData: Map<
      string,
      { priceAtReceipt: number; priceAfter1h: number; priceAfter24h: number; priceAfter7d: number }
    >
  ): NewsletterCorrelation {
    const correlatedAssets: NewsletterCorrelation["correlatedAssets"] = [];

    for (const ticker of newsletter.extractedTickers) {
      const prices = priceData.get(ticker);
      if (!prices) continue;

      const return1h =
        ((prices.priceAfter1h - prices.priceAtReceipt) / prices.priceAtReceipt) * 100;
      const return24h =
        ((prices.priceAfter24h - prices.priceAtReceipt) / prices.priceAtReceipt) * 100;
      const return7d =
        ((prices.priceAfter7d - prices.priceAtReceipt) / prices.priceAtReceipt) * 100;

      // Calculate correlation with sentiment
      const expectedDirection = newsletter.sentimentScore > 0 ? 1 : -1;
      const actualDirection = return24h > 0 ? 1 : -1;
      const correlation = expectedDirection === actualDirection ? Math.abs(return24h) / 10 : -Math.abs(return24h) / 10;

      correlatedAssets.push({
        symbol: ticker,
        priceAtReceipt: prices.priceAtReceipt,
        priceAfter1h: prices.priceAfter1h,
        priceAfter24h: prices.priceAfter24h,
        priceAfter7d: prices.priceAfter7d,
        correlation: Math.max(-1, Math.min(1, correlation)),
      });
    }

    return {
      ...newsletter,
      correlatedAssets,
    } as NewsletterCorrelation;
  }

  /**
   * Rank newsletters by predictive power
   */
  rankNewslettersByPredictivePower(
    correlations: NewsletterCorrelation[]
  ): Array<{
    source: string;
    avgPredictiveScore: number;
    totalAnalyzed: number;
    correctPredictions: number;
    avgReturn: number;
  }> {
    const bySource = new Map<
      string,
      { totalScore: number; count: number; correctCount: number; totalReturn: number }
    >();

    for (const corr of correlations) {
      const stats = bySource.get(corr.newsletterSource) || {
        totalScore: 0,
        count: 0,
        correctCount: 0,
        totalReturn: 0,
      };

      stats.count++;
      if (corr.predictiveScore) {
        stats.totalScore += corr.predictiveScore;
        if (corr.predictiveScore > 0.5) stats.correctCount++;
      }

      bySource.set(corr.newsletterSource, stats);
    }

    return Array.from(bySource.entries())
      .map(([source, stats]) => ({
        source,
        avgPredictiveScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
        totalAnalyzed: stats.count,
        correctPredictions: stats.correctCount,
        avgReturn: stats.count > 0 ? stats.totalReturn / stats.count : 0,
      }))
      .sort((a, b) => b.avgPredictiveScore - a.avgPredictiveScore);
  }
}

// ============================================================================
// Calendar Trading Correlation
// ============================================================================

export class CalendarTradingAnalyzer {
  /**
   * Analyze trading behavior around calendar events
   */
  analyzeCalendarCorrelation(
    userId: string,
    events: Array<{
      eventType: CalendarTradingCorrelation["eventType"];
      eventTime: number;
      duration: number;
    }>,
    trades: Array<{
      executedAt: number;
      volume: number;
      pnl: number;
    }>,
    windowHours: number = 4
  ): CalendarTradingCorrelation[] {
    const correlations: CalendarTradingCorrelation[] = [];
    const windowMs = windowHours * 60 * 60 * 1000;

    for (const event of events) {
      const eventEndTime = event.eventTime + event.duration * 60 * 1000;

      // Trades before event
      const tradesBefore = trades.filter(
        (t) =>
          t.executedAt >= event.eventTime - windowMs && t.executedAt < event.eventTime
      );

      // Trades during event
      const tradesDuring = trades.filter(
        (t) => t.executedAt >= event.eventTime && t.executedAt <= eventEndTime
      );

      // Trades after event
      const tradesAfter = trades.filter(
        (t) =>
          t.executedAt > eventEndTime && t.executedAt <= eventEndTime + windowMs
      );

      const sumTrades = (tradeList: typeof trades) => ({
        trades: tradeList.length,
        volume: tradeList.reduce((sum, t) => sum + t.volume, 0),
        pnl: tradeList.reduce((sum, t) => sum + t.pnl, 0),
      });

      const before = { ...sumTrades(tradesBefore), timeWindow: windowHours };
      const during = sumTrades(tradesDuring);
      const after = { ...sumTrades(tradesAfter), timeWindow: windowHours };

      // Calculate behavior change score
      const avgTradesNormal =
        (before.trades + after.trades) / 2 || tradesDuring.length;
      const behaviorChangeScore =
        avgTradesNormal > 0
          ? Math.abs(during.trades - avgTradesNormal) / avgTradesNormal
          : 0;

      correlations.push({
        userId,
        eventType: event.eventType,
        tradingBefore: before,
        tradingDuring: during,
        tradingAfter: after,
        behaviorChangeScore,
        reducesActivityBefore: before.trades < avgTradesNormal * 0.5,
        increasesActivityAfter: after.trades > avgTradesNormal * 1.5,
        analyzedAt: Date.now(),
      });
    }

    return correlations;
  }

  /**
   * Identify optimal trading times based on calendar patterns
   */
  identifyOptimalTradingTimes(
    correlations: CalendarTradingCorrelation[]
  ): {
    avoidDuring: CalendarTradingCorrelation["eventType"][];
    bestAfter: CalendarTradingCorrelation["eventType"][];
    insights: string[];
  } {
    const byEventType = new Map<
      CalendarTradingCorrelation["eventType"],
      { totalPnLDuring: number; totalPnLAfter: number; count: number }
    >();

    for (const corr of correlations) {
      const stats = byEventType.get(corr.eventType) || {
        totalPnLDuring: 0,
        totalPnLAfter: 0,
        count: 0,
      };
      stats.totalPnLDuring += corr.tradingDuring.pnl;
      stats.totalPnLAfter += corr.tradingAfter.pnl;
      stats.count++;
      byEventType.set(corr.eventType, stats);
    }

    const avoidDuring: CalendarTradingCorrelation["eventType"][] = [];
    const bestAfter: CalendarTradingCorrelation["eventType"][] = [];
    const insights: string[] = [];

    for (const [eventType, stats] of byEventType) {
      const avgPnLDuring = stats.count > 0 ? stats.totalPnLDuring / stats.count : 0;
      const avgPnLAfter = stats.count > 0 ? stats.totalPnLAfter / stats.count : 0;

      if (avgPnLDuring < 0) {
        avoidDuring.push(eventType);
        insights.push(
          `Avoid trading during ${eventType} events (avg loss: $${Math.abs(avgPnLDuring).toFixed(2)})`
        );
      }

      if (avgPnLAfter > avgPnLDuring * 1.5) {
        bestAfter.push(eventType);
        insights.push(
          `Better performance after ${eventType} events (avg profit: $${avgPnLAfter.toFixed(2)})`
        );
      }
    }

    return { avoidDuring, bestAfter, insights };
  }
}

// ============================================================================
// Information Source Ranking
// ============================================================================

export class InformationSourceRanker {
  /**
   * Track an information source signal and subsequent trade
   */
  trackSignalToTrade(
    userId: string,
    signal: {
      sourceType: InformationSource["sourceType"];
      sourceName: string;
      signalTime: number;
      assets: string[];
      direction?: string;
    },
    trade?: {
      executedAt: number;
      symbol: string;
      side: string;
      pnl: number;
    }
  ): {
    sourceType: string;
    sourceName: string;
    signalActedOn: boolean;
    reactionTimeSeconds?: number;
    tradePnL?: number;
    correctDirection?: boolean;
  } {
    const signalActedOn = !!trade && signal.assets.includes(trade.symbol);

    let reactionTimeSeconds: number | undefined;
    let correctDirection: boolean | undefined;

    if (trade && signalActedOn) {
      reactionTimeSeconds = (trade.executedAt - signal.signalTime) / 1000;

      if (signal.direction) {
        const expectedDirection = signal.direction === "bullish" ? "buy" : "sell";
        correctDirection = trade.side === expectedDirection;
      }
    }

    return {
      sourceType: signal.sourceType,
      sourceName: signal.sourceName,
      signalActedOn,
      reactionTimeSeconds,
      tradePnL: trade?.pnl,
      correctDirection,
    };
  }

  /**
   * Rank information sources by effectiveness
   */
  rankInformationSources(
    trackingData: Array<{
      userId: string;
      sourceType: string;
      sourceName: string;
      signalActedOn: boolean;
      reactionTimeSeconds?: number;
      tradePnL?: number;
      correctDirection?: boolean;
    }>
  ): InformationSource[] {
    // Group by user and source
    const byUserSource = new Map<
      string,
      {
        userId: string;
        sourceType: string;
        sourceName: string;
        totalSignals: number;
        signalsActedOn: number;
        totalPnL: number;
        profitableCount: number;
        reactionTimes: number[];
      }
    >();

    for (const data of trackingData) {
      const key = `${data.userId}:${data.sourceType}:${data.sourceName}`;
      const stats = byUserSource.get(key) || {
        userId: data.userId,
        sourceType: data.sourceType,
        sourceName: data.sourceName,
        totalSignals: 0,
        signalsActedOn: 0,
        totalPnL: 0,
        profitableCount: 0,
        reactionTimes: [],
      };

      stats.totalSignals++;
      if (data.signalActedOn) {
        stats.signalsActedOn++;
        if (data.tradePnL !== undefined) {
          stats.totalPnL += data.tradePnL;
          if (data.tradePnL > 0) stats.profitableCount++;
        }
        if (data.reactionTimeSeconds !== undefined) {
          stats.reactionTimes.push(data.reactionTimeSeconds);
        }
      }

      byUserSource.set(key, stats);
    }

    // Convert to rankings
    const rankings: InformationSource[] = [];

    for (const stats of byUserSource.values()) {
      const actedOnRatio =
        stats.totalSignals > 0 ? stats.signalsActedOn / stats.totalSignals : 0;
      const profitableRatio =
        stats.signalsActedOn > 0 ? stats.profitableCount / stats.signalsActedOn : 0;
      const avgPnLPerSignal =
        stats.signalsActedOn > 0 ? stats.totalPnL / stats.signalsActedOn : 0;
      const avgReactionTime =
        stats.reactionTimes.length > 0
          ? stats.reactionTimes.reduce((a, b) => a + b, 0) / stats.reactionTimes.length
          : 0;

      // Calculate trust score (0-100)
      // Based on: profitability (50%), action rate (25%), sample size (25%)
      const profitabilityScore = profitableRatio * 50;
      const actionScore = actedOnRatio * 25;
      const sampleScore = Math.min(stats.totalSignals / 20, 1) * 25;
      const trustScore = profitabilityScore + actionScore + sampleScore;

      rankings.push({
        userId: stats.userId,
        sourceType: stats.sourceType,
        sourceName: stats.sourceName,
        totalSignals: stats.totalSignals,
        signalsActedOn: stats.signalsActedOn,
        actedOnRatio,
        profitableSignalsRatio: profitableRatio,
        averagePnLPerSignal: avgPnLPerSignal,
        signalToTradeCorrelation: actedOnRatio, // Simplified
        averageReactionTime: avgReactionTime,
        calculatedTrustScore: trustScore,
      });
    }

    return rankings.sort((a, b) => b.calculatedTrustScore - a.calculatedTrustScore);
  }

  /**
   * Recommend information sources to follow
   */
  recommendSources(
    userRankings: InformationSource[],
    communityRankings: InformationSource[]
  ): Array<{
    sourceType: string;
    sourceName: string;
    recommendationScore: number;
    reason: string;
  }> {
    const userSources = new Set(
      userRankings.map((r) => `${r.sourceType}:${r.sourceName}`)
    );

    // Find high-performing sources the user doesn't follow
    const recommendations: Array<{
      sourceType: string;
      sourceName: string;
      recommendationScore: number;
      reason: string;
    }> = [];

    for (const communitySource of communityRankings) {
      const key = `${communitySource.sourceType}:${communitySource.sourceName}`;

      if (
        !userSources.has(key) &&
        communitySource.calculatedTrustScore > 60 &&
        communitySource.totalSignals > 10
      ) {
        recommendations.push({
          sourceType: communitySource.sourceType,
          sourceName: communitySource.sourceName,
          recommendationScore: communitySource.calculatedTrustScore,
          reason: `${(communitySource.profitableSignalsRatio * 100).toFixed(0)}% profitable signals from ${communitySource.totalSignals} tracked`,
        });
      }
    }

    return recommendations
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 10);
  }
}

// ============================================================================
// Export singleton instances
// ============================================================================

export const consentManager = new ConsentManager();
export const newsletterAnalyzer = new NewsletterAnalyzer();
export const calendarTradingAnalyzer = new CalendarTradingAnalyzer();
export const informationSourceRanker = new InformationSourceRanker();
