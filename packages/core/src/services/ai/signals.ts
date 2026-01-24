/**
 * AI Signal Detection Service
 *
 * Proactively identifies trading opportunities from multiple data sources
 * using Claude AI for intelligent analysis.
 */

import type {
  Signal,
  SignalType,
  Sentiment,
  Urgency,
  Email,
  UserContext,
  Market,
  Correlation,
  Insight,
  RankedSignal,
  MarketAnomaly,
  SocialSentiment,
  ChatMessage,
  SignalDetectionConfig,
  AnomalyDetectionConfig,
  EmailSignalResponse,
  SentimentAnalysisResponse,
  DailyInsightsResponse,
  DailyBriefing,
  UserPosition,
} from "./types";

// ============================================================================
// PROMPTS
// ============================================================================

const EMAIL_SIGNAL_PROMPT = `You are a trading signal detector for PULL, a prediction markets platform.

Analyze this email for potential trading signals:

From: {from}
Subject: {subject}
Date: {date}
Body: {body}

User context:
- Interests: {interests}
- Active markets: {activeMarkets}
- Location: {location}

Look for:
1. TRAVEL SIGNALS: Flight/hotel bookings → weather markets, event markets for destination
2. FINANCIAL SIGNALS: Earnings alerts, economic newsletters → related prediction markets
3. EVENT SIGNALS: Sports tickets, concert bookings, conference registrations → event markets
4. CALENDAR SIGNALS: Meetings, deadlines → time-sensitive markets
5. NEWS SIGNALS: Newsletter content mentioning companies, politics, economics

For each signal found, return:
{
  "signals": [{
    "type": "travel|financial|event|calendar|news",
    "title": "Brief signal title",
    "description": "What this signal suggests",
    "potentialMarkets": ["keywords to search for relevant markets"],
    "sentiment": "bullish|bearish|neutral",
    "confidence": 0-100,
    "urgency": "low|medium|high",
    "reasoning": "Why this is a signal",
    "expiresIn": "hours until signal is stale"
  }]
}

If no signals found, return {"signals": []}.
Be conservative - only flag clear, actionable signals.`;

const SENTIMENT_ANALYSIS_PROMPT = `Analyze the sentiment of these chat messages from a prediction market discussion room.

Market context: {marketContext}

Messages (last 15 minutes):
{messages}

Analyze for:
1. Overall sentiment (bullish/bearish/neutral)
2. Sentiment score (-100 to 100, where -100 is extremely bearish, 100 is extremely bullish)
3. Specific bullish indicators mentioned
4. Specific bearish indicators mentioned
5. Whether consensus is forming (many users agreeing)
6. Confidence in the analysis (0-100)
7. Top keywords/topics being discussed

Return JSON:
{
  "overallSentiment": "bullish|bearish|neutral",
  "sentimentScore": number,
  "bullishIndicators": ["list of bullish points mentioned"],
  "bearishIndicators": ["list of bearish points mentioned"],
  "consensusForming": boolean,
  "confidence": number,
  "topKeywords": ["key", "words"]
}

Focus on trading-relevant sentiment, not general conversation.`;

const DAILY_INSIGHTS_PROMPT = `Generate a personalized morning briefing for this PULL user.

User Portfolio:
{positions}

Recent Signals:
{signals}

Market Movements (24hr):
{movements}

User Interests:
{interests}

Generate 3-5 actionable insights:
1. Portfolio update (how positions performed)
2. Opportunity alert (markets to watch based on signals)
3. Risk alert (any concerns about current positions)
4. Trend insight (what's moving in their interest areas)
5. Social insight (what followed traders are doing)

Format as JSON:
{
  "greeting": "Good morning, {name}",
  "summary": "One sentence portfolio summary",
  "insights": [{
    "type": "portfolio|opportunity|risk|trend|social",
    "title": "Brief title",
    "content": "2-3 sentence insight",
    "action": "Optional suggested action",
    "relatedMarket": "Optional market ticker"
  }]
}

Keep it concise and actionable. No fluff.`;

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  volumeSpikeMultiplier: 3, // >3x 24hr average
  priceMovementThreshold: 0.15, // >15% change
  priceMovementWindowHours: 6,
  orderImbalanceThreshold: 0.75, // >75/25 bid/ask ratio
  smartMoneyThreshold: 2.0, // High Sharpe ratio threshold
  correlationBreakThreshold: 0.3, // Divergence from historical
};

// ============================================================================
// SIGNAL DETECTION SERVICE
// ============================================================================

export class SignalDetectionService {
  private apiKey: string;
  private modelId: string;
  private maxTokens: number;
  private temperature: number;
  private anomalyConfig: AnomalyDetectionConfig;

  constructor(config: SignalDetectionConfig) {
    this.apiKey = config.anthropicApiKey;
    this.modelId = config.modelId ?? "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens ?? 2048;
    this.temperature = config.temperature ?? 0.3;

    this.anomalyConfig = {
      volumeSpikeMultiplier: config.volumeSpikeMultiplier ?? DEFAULT_ANOMALY_CONFIG.volumeSpikeMultiplier,
      priceMovementThreshold: config.priceMovementThreshold ?? DEFAULT_ANOMALY_CONFIG.priceMovementThreshold,
      priceMovementWindowHours: DEFAULT_ANOMALY_CONFIG.priceMovementWindowHours,
      orderImbalanceThreshold: config.orderImbalanceThreshold ?? DEFAULT_ANOMALY_CONFIG.orderImbalanceThreshold,
      smartMoneyThreshold: DEFAULT_ANOMALY_CONFIG.smartMoneyThreshold,
      correlationBreakThreshold: config.correlationThreshold ?? DEFAULT_ANOMALY_CONFIG.correlationBreakThreshold,
    };
  }

  // ==========================================================================
  // EMAIL SIGNAL DETECTION
  // ==========================================================================

  /**
   * Detect trading signals from an email
   */
  async detectEmailSignals(email: Email, userContext: UserContext): Promise<Signal[]> {
    if (!userContext.preferences.emailAnalysisEnabled) {
      return [];
    }

    const prompt = EMAIL_SIGNAL_PROMPT
      .replace("{from}", email.fromName ?? email.from)
      .replace("{subject}", email.subject)
      .replace("{date}", email.date.toISOString())
      .replace("{body}", this.truncateText(email.body, 3000))
      .replace("{interests}", userContext.interests.join(", ") || "None specified")
      .replace("{activeMarkets}", userContext.activeMarkets.join(", ") || "None")
      .replace(
        "{location}",
        userContext.location
          ? `${userContext.location.city}, ${userContext.location.state}, ${userContext.location.country}`
          : "Not specified"
      );

    const response = await this.callClaude(prompt);
    const parsed = this.parseJsonResponse<EmailSignalResponse>(response);

    if (!parsed || !parsed.signals || !Array.isArray(parsed.signals)) {
      return [];
    }

    // Filter by confidence threshold
    const threshold = userContext.preferences.minConfidenceThreshold;

    return parsed.signals
      .filter((s) => s.confidence >= threshold)
      .map((detected) => this.createSignal({
        type: "email",
        source: `email:${email.from}`,
        title: detected.title,
        description: detected.description,
        confidence: detected.confidence,
        sentiment: detected.sentiment,
        urgency: detected.urgency,
        relatedMarkets: detected.potentialMarkets,
        relatedAssets: [],
        metadata: {
          emailId: email.id,
          emailSubject: email.subject,
          signalSubType: detected.type,
          reasoning: detected.reasoning,
        },
        expiresAt: Date.now() + detected.expiresIn * 60 * 60 * 1000,
      }));
  }

  // ==========================================================================
  // MARKET ANOMALY DETECTION
  // ==========================================================================

  /**
   * Detect market anomalies across multiple markets
   */
  async detectMarketAnomalies(markets: Market[]): Promise<Signal[]> {
    const anomalies: MarketAnomaly[] = [];

    for (const market of markets) {
      // 1. Volume spike detection
      const volumeAnomaly = this.detectVolumeSpike(market);
      if (volumeAnomaly) anomalies.push(volumeAnomaly);

      // 2. Price movement detection
      const priceAnomaly = this.detectPriceMovement(market);
      if (priceAnomaly) anomalies.push(priceAnomaly);

      // 3. Order book imbalance detection
      const imbalanceAnomaly = this.detectOrderImbalance(market);
      if (imbalanceAnomaly) anomalies.push(imbalanceAnomaly);
    }

    return anomalies.map((anomaly) =>
      this.createSignal({
        type: "market",
        source: `market:${anomaly.market}`,
        title: this.getAnomalyTitle(anomaly),
        description: anomaly.description,
        confidence: this.calculateAnomalyConfidence(anomaly),
        sentiment: this.inferAnomalySentiment(anomaly),
        urgency: anomaly.magnitude > 0.5 ? "high" : anomaly.magnitude > 0.25 ? "medium" : "low",
        relatedMarkets: [anomaly.market],
        relatedAssets: [],
        metadata: {
          anomalyType: anomaly.type,
          ...anomaly.details,
        },
        expiresAt: Date.now() + 6 * 60 * 60 * 1000, // 6 hours
      })
    );
  }

  private detectVolumeSpike(market: Market): MarketAnomaly | null {
    if (!market.volumeHistory || market.volumeHistory.length < 24) {
      return null;
    }

    const recentVolume = market.volume24h;
    const historicalVolumes = market.volumeHistory.slice(-24).map((v) => v.volume);
    const avgVolume = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;

    const multiplier = recentVolume / avgVolume;
    if (multiplier >= this.anomalyConfig.volumeSpikeMultiplier) {
      return {
        type: "volume_spike",
        market: market.ticker,
        description: `Trading volume is ${multiplier.toFixed(1)}x the 24-hour average`,
        magnitude: Math.min(1, (multiplier - 1) / 5),
        details: {
          volumeMultiplier: multiplier,
          currentVolume: recentVolume,
          averageVolume: avgVolume,
        },
      };
    }

    return null;
  }

  private detectPriceMovement(market: Market): MarketAnomaly | null {
    if (!market.priceHistory || market.priceHistory.length < 6) {
      return null;
    }

    const windowHours = this.anomalyConfig.priceMovementWindowHours;
    const recentPrices = market.priceHistory.slice(-windowHours);
    const oldPrice = recentPrices[0].price;
    const currentPrice = market.probability;

    const percentChange = (currentPrice - oldPrice) / oldPrice;

    if (Math.abs(percentChange) >= this.anomalyConfig.priceMovementThreshold) {
      const direction = percentChange > 0 ? "increased" : "decreased";
      return {
        type: "price_movement",
        market: market.ticker,
        description: `Price ${direction} ${Math.abs(percentChange * 100).toFixed(1)}% in ${windowHours} hours`,
        magnitude: Math.min(1, Math.abs(percentChange) / 0.3),
        details: {
          percentChange,
          oldPrice,
          currentPrice,
          windowHours,
        },
      };
    }

    return null;
  }

  private detectOrderImbalance(market: Market): MarketAnomaly | null {
    if (!market.orderBook) {
      return null;
    }

    const totalBids = market.orderBook.bids.reduce((sum, b) => sum + b.quantity, 0);
    const totalAsks = market.orderBook.asks.reduce((sum, a) => sum + a.quantity, 0);

    if (totalBids + totalAsks === 0) return null;

    const bidRatio = totalBids / (totalBids + totalAsks);

    if (bidRatio >= this.anomalyConfig.orderImbalanceThreshold) {
      return {
        type: "order_imbalance",
        market: market.ticker,
        description: `Strong buy pressure: ${(bidRatio * 100).toFixed(0)}% bids vs ${((1 - bidRatio) * 100).toFixed(0)}% asks`,
        magnitude: (bidRatio - 0.5) * 2,
        details: {
          orderBookImbalance: bidRatio,
          totalBids,
          totalAsks,
        },
      };
    } else if (bidRatio <= 1 - this.anomalyConfig.orderImbalanceThreshold) {
      return {
        type: "order_imbalance",
        market: market.ticker,
        description: `Strong sell pressure: ${((1 - bidRatio) * 100).toFixed(0)}% asks vs ${(bidRatio * 100).toFixed(0)}% bids`,
        magnitude: (0.5 - bidRatio) * 2,
        details: {
          orderBookImbalance: bidRatio,
          totalBids,
          totalAsks,
        },
      };
    }

    return null;
  }

  private getAnomalyTitle(anomaly: MarketAnomaly): string {
    switch (anomaly.type) {
      case "volume_spike":
        return `Volume Spike: ${anomaly.market}`;
      case "price_movement":
        return `Significant Price Move: ${anomaly.market}`;
      case "order_imbalance":
        return `Order Book Imbalance: ${anomaly.market}`;
      case "smart_money":
        return `Smart Money Movement: ${anomaly.market}`;
      case "correlation_break":
        return `Correlation Break: ${anomaly.market}`;
      default:
        return `Market Alert: ${anomaly.market}`;
    }
  }

  private calculateAnomalyConfidence(anomaly: MarketAnomaly): number {
    // Base confidence on magnitude and type
    const baseConfidence = Math.min(95, 50 + anomaly.magnitude * 50);
    return Math.round(baseConfidence);
  }

  private inferAnomalySentiment(anomaly: MarketAnomaly): Sentiment {
    switch (anomaly.type) {
      case "price_movement":
        const change = (anomaly.details as { percentChange?: number }).percentChange ?? 0;
        return change > 0 ? "bullish" : change < 0 ? "bearish" : "neutral";
      case "order_imbalance":
        const imbalance = (anomaly.details as { orderBookImbalance?: number }).orderBookImbalance ?? 0.5;
        return imbalance > 0.5 ? "bullish" : "bearish";
      case "volume_spike":
        return "neutral"; // Volume alone doesn't indicate direction
      default:
        return "neutral";
    }
  }

  // ==========================================================================
  // SOCIAL SENTIMENT ANALYSIS
  // ==========================================================================

  /**
   * Aggregate social sentiment from a chat room
   */
  async aggregateSocialSentiment(
    messages: ChatMessage[],
    marketContext?: string
  ): Promise<SocialSentiment | null> {
    if (messages.length === 0) {
      return null;
    }

    // Format messages for analysis
    const formattedMessages = messages
      .slice(-50) // Last 50 messages
      .map((m) => `[${m.username}]: ${m.content}`)
      .join("\n");

    const prompt = SENTIMENT_ANALYSIS_PROMPT
      .replace("{marketContext}", marketContext ?? "General market discussion")
      .replace("{messages}", formattedMessages);

    const response = await this.callClaude(prompt);
    const parsed = this.parseJsonResponse<SentimentAnalysisResponse>(response);

    if (!parsed) {
      return null;
    }

    const roomId = messages[0]?.roomId ?? "unknown";

    return {
      roomId,
      marketTicker: marketContext,
      bullishCount: parsed.bullishIndicators.length,
      bearishCount: parsed.bearishIndicators.length,
      neutralCount: 0,
      overallSentiment: parsed.overallSentiment,
      sentimentScore: parsed.sentimentScore,
      consensusForming: parsed.consensusForming,
      messageCount: messages.length,
      uniqueUsers: new Set(messages.map((m) => m.userId)).size,
      topKeywords: parsed.topKeywords,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Create signal from social sentiment
   */
  createSocialSignal(sentiment: SocialSentiment): Signal | null {
    // Only create signal if strong sentiment or consensus
    const isStrong = Math.abs(sentiment.sentimentScore) >= 50;
    const hasConsensus = sentiment.consensusForming && sentiment.uniqueUsers >= 5;

    if (!isStrong && !hasConsensus) {
      return null;
    }

    const urgency: Urgency = hasConsensus && isStrong ? "high" : isStrong ? "medium" : "low";

    return this.createSignal({
      type: "social",
      source: `social:${sentiment.roomId}`,
      title: `${sentiment.overallSentiment.charAt(0).toUpperCase() + sentiment.overallSentiment.slice(1)} Sentiment${hasConsensus ? " with Consensus" : ""}`,
      description: `Social sentiment is ${sentiment.overallSentiment} (score: ${sentiment.sentimentScore}) based on ${sentiment.messageCount} messages from ${sentiment.uniqueUsers} users`,
      confidence: Math.min(95, 50 + Math.abs(sentiment.sentimentScore) / 2),
      sentiment: sentiment.overallSentiment,
      urgency,
      relatedMarkets: sentiment.marketTicker ? [sentiment.marketTicker] : [],
      relatedAssets: [],
      metadata: {
        sentimentScore: sentiment.sentimentScore,
        messageCount: sentiment.messageCount,
        uniqueUsers: sentiment.uniqueUsers,
        consensusForming: sentiment.consensusForming,
        topKeywords: sentiment.topKeywords,
      },
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    });
  }

  // ==========================================================================
  // MARKET CORRELATIONS
  // ==========================================================================

  /**
   * Find correlations between markets
   */
  findMarketCorrelations(markets: Market[]): Correlation[] {
    const correlations: Correlation[] = [];

    // Need at least 30 data points for meaningful correlation
    const minDataPoints = 30;

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const marketA = markets[i];
        const marketB = markets[j];

        if (
          !marketA.priceHistory ||
          !marketB.priceHistory ||
          marketA.priceHistory.length < minDataPoints ||
          marketB.priceHistory.length < minDataPoints
        ) {
          continue;
        }

        const correlation = this.calculateCorrelation(
          marketA.priceHistory.map((p) => p.price),
          marketB.priceHistory.map((p) => p.price)
        );

        if (Math.abs(correlation.r) >= 0.5) {
          // Only include meaningful correlations
          correlations.push({
            marketA: marketA.ticker,
            marketB: marketB.ticker,
            correlation: correlation.r,
            sampleSize: correlation.n,
            pValue: correlation.pValue,
            isSignificant: correlation.pValue < 0.05,
          });
        }
      }
    }

    // Sort by absolute correlation strength
    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Detect correlation breaks (divergence)
   */
  detectCorrelationBreaks(
    markets: Market[],
    historicalCorrelations: Map<string, number>
  ): Signal[] {
    const signals: Signal[] = [];
    const currentCorrelations = this.findMarketCorrelations(markets);

    for (const current of currentCorrelations) {
      const key = `${current.marketA}:${current.marketB}`;
      const historical = historicalCorrelations.get(key);

      if (historical !== undefined) {
        const divergence = Math.abs(current.correlation - historical);

        if (divergence >= this.anomalyConfig.correlationBreakThreshold) {
          signals.push(
            this.createSignal({
              type: "correlation",
              source: `correlation:${key}`,
              title: `Correlation Break: ${current.marketA} / ${current.marketB}`,
              description: `Historical correlation of ${historical.toFixed(2)} has shifted to ${current.correlation.toFixed(2)}`,
              confidence: Math.min(90, 50 + divergence * 100),
              sentiment: "neutral",
              urgency: divergence > 0.5 ? "high" : "medium",
              relatedMarkets: [current.marketA, current.marketB],
              relatedAssets: [],
              metadata: {
                historicalCorrelation: historical,
                currentCorrelation: current.correlation,
                divergenceAmount: divergence,
              },
              expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            })
          );
        }
      }
    }

    return signals;
  }

  private calculateCorrelation(x: number[], y: number[]): { r: number; n: number; pValue: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { r: 0, n, pValue: 1 };

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let xDenom = 0;
    let yDenom = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean;
      const yDiff = ySlice[i] - yMean;
      numerator += xDiff * yDiff;
      xDenom += xDiff * xDiff;
      yDenom += yDiff * yDiff;
    }

    const r = xDenom > 0 && yDenom > 0 ? numerator / Math.sqrt(xDenom * yDenom) : 0;

    // Calculate t-statistic and p-value
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Approximate p-value using t-distribution
    const pValue = this.approximatePValue(Math.abs(t), n - 2);

    return { r, n, pValue };
  }

  private approximatePValue(t: number, df: number): number {
    // Simplified approximation of two-tailed p-value
    const x = df / (df + t * t);
    return x; // This is a rough approximation
  }

  // ==========================================================================
  // USER INSIGHTS GENERATION
  // ==========================================================================

  /**
   * Generate personalized insights for a user
   */
  async generateUserInsights(
    userId: string,
    positions: UserPosition[],
    recentSignals: Signal[],
    marketMovements: { market: string; change: number }[],
    interests: string[],
    userName?: string
  ): Promise<DailyBriefing> {
    // Format positions
    const positionsText =
      positions.length > 0
        ? positions
            .map(
              (p) =>
                `- ${p.symbol}: ${p.side} ${p.quantity} @ $${p.averageEntryPrice.toFixed(2)} (current: $${p.currentPrice.toFixed(2)}, P&L: $${p.unrealizedPnL.toFixed(2)})`
            )
            .join("\n")
        : "No active positions";

    // Format signals
    const signalsText =
      recentSignals.length > 0
        ? recentSignals
            .slice(0, 10)
            .map((s) => `- [${s.urgency.toUpperCase()}] ${s.title}: ${s.description}`)
            .join("\n")
        : "No recent signals";

    // Format movements
    const movementsText =
      marketMovements.length > 0
        ? marketMovements
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .slice(0, 10)
            .map((m) => `- ${m.market}: ${m.change >= 0 ? "+" : ""}${(m.change * 100).toFixed(1)}%`)
            .join("\n")
        : "No significant movements";

    const prompt = DAILY_INSIGHTS_PROMPT
      .replace("{positions}", positionsText)
      .replace("{signals}", signalsText)
      .replace("{movements}", movementsText)
      .replace("{interests}", interests.join(", ") || "Not specified")
      .replace("{name}", userName ?? "there");

    const response = await this.callClaude(prompt);
    const parsed = this.parseJsonResponse<DailyInsightsResponse>(response);

    if (!parsed) {
      return {
        greeting: `Good morning${userName ? `, ${userName}` : ""}!`,
        summary: "Unable to generate insights at this time.",
        insights: [],
        generatedAt: Date.now(),
      };
    }

    return {
      greeting: parsed.greeting,
      summary: parsed.summary,
      insights: parsed.insights.map((i) => ({
        insightType: i.type,
        title: i.title,
        content: i.content,
        priority: this.getInsightPriority(i.type),
        action: i.action,
        relatedMarket: i.relatedMarket,
        relatedSignals: [],
      })),
      generatedAt: Date.now(),
    };
  }

  private getInsightPriority(type: string): number {
    switch (type) {
      case "risk":
        return 5;
      case "opportunity":
        return 4;
      case "portfolio":
        return 3;
      case "trend":
        return 2;
      case "social":
        return 1;
      default:
        return 2;
    }
  }

  // ==========================================================================
  // SIGNAL RANKING
  // ==========================================================================

  /**
   * Rank signals by relevance for a user
   */
  rankSignalsForUser(signals: Signal[], userContext: UserContext): RankedSignal[] {
    return signals
      .map((signal) => {
        const interestMatch = this.calculateInterestMatch(signal, userContext.interests);
        const positionRelevance = this.calculatePositionRelevance(signal, userContext.positions);
        const recency = this.calculateRecencyScore(signal);
        const confidence = signal.confidence / 100;

        // Weighted combination
        const relevanceScore =
          interestMatch * 0.3 +
          positionRelevance * 0.25 +
          recency * 0.2 +
          confidence * 0.25;

        return {
          ...signal,
          relevanceScore: Math.round(relevanceScore * 100),
          rankingFactors: {
            interestMatch: Math.round(interestMatch * 100),
            positionRelevance: Math.round(positionRelevance * 100),
            recency: Math.round(recency * 100),
            confidence: Math.round(confidence * 100),
          },
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private calculateInterestMatch(signal: Signal, interests: string[]): number {
    if (interests.length === 0) return 0.5;

    const signalText = `${signal.title} ${signal.description} ${signal.relatedMarkets.join(" ")}`.toLowerCase();

    let matchCount = 0;
    for (const interest of interests) {
      if (signalText.includes(interest.toLowerCase())) {
        matchCount++;
      }
    }

    return Math.min(1, matchCount / Math.min(3, interests.length));
  }

  private calculatePositionRelevance(signal: Signal, positions: UserPosition[]): number {
    if (positions.length === 0) return 0.5;

    const positionSymbols = new Set(positions.map((p) => p.symbol.toLowerCase()));

    for (const market of signal.relatedMarkets) {
      if (positionSymbols.has(market.toLowerCase())) {
        return 1;
      }
    }

    return 0;
  }

  private calculateRecencyScore(signal: Signal): number {
    const ageMs = Date.now() - signal.createdAt;
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

    return Math.max(0, 1 - ageMs / maxAgeMs);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  private parseJsonResponse<T>(response: string): T | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      return null;
    } catch (error) {
      console.error("Failed to parse JSON response:", error);
      return null;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }

  private createSignal(params: Omit<Signal, "signalId" | "createdAt"> & { expiresAt?: number }): Signal {
    return {
      signalId: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      ...params,
    };
  }
}

// Export factory function
export function createSignalDetectionService(config: SignalDetectionConfig): SignalDetectionService {
  return new SignalDetectionService(config);
}
