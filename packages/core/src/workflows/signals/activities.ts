/**
 * Signal Detection Activities
 * All activities for AI-powered signal detection workflows
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
// ============================================================================

export interface SignalData {
  type:
    | "email"
    | "news"
    | "market"
    | "social"
    | "on_chain"
    | "sentiment"
    | "unusual_activity"
    | "correlation";
  source: string;
  sourceId?: string;
  title: string;
  description: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  relatedMarkets: string[];
  relatedEvents: string[];
  sentiment?: "bullish" | "bearish" | "neutral";
  priceImpact?: number;
  timeHorizon?: string;
  actionSuggestion?: string;
  aiAnalysis?: string;
  aiConfidenceFactors?: string[];
  rawData?: unknown;
}

export interface EmailSignalInput {
  emailId: string;
  subject: string;
  body: string;
  from: string;
  triageData?: {
    priority: string;
    category: string;
    relatedTickers: string[];
  };
}

export interface NewsSignalInput {
  newsId: string;
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  categories: string[];
}

export interface MarketData {
  ticker: string;
  price: number;
  previousPrice: number;
  volume: number;
  previousVolume: number;
  openInterest?: number;
  timestamp: number;
}

export interface TraderActivity {
  userId: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executedAt: number;
}

export interface CorrelationResult {
  marketA: string;
  marketB: string;
  correlation: number;
  strength: "weak" | "moderate" | "strong" | "very_strong";
  sampleSize: number;
  pValue?: number;
  aiExplanation?: string;
}

export interface UserInsight {
  userId: string;
  insightType: string;
  title: string;
  content: string;
  summary?: string;
  relatedSignals: string[];
  relatedMarkets: string[];
  confidence: number;
  priority: "low" | "medium" | "high" | "urgent";
}

// ============================================================================
// Claude AI Activities
// ============================================================================

/**
 * Extract trading signals from email content
 */
export async function extractEmailSignals(input: EmailSignalInput): Promise<SignalData | null> {
  console.log(`[Signal Activity] Extracting signals from email: ${input.subject.slice(0, 50)}...`);

  Context.current().heartbeat("Extracting email signals...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a financial signal detection AI. Analyze this email for trading-relevant signals.

EMAIL:
Subject: ${input.subject}
From: ${input.from}
Body: ${input.body}

${input.triageData ? `Previous triage: Priority=${input.triageData.priority}, Category=${input.triageData.category}, Tickers=${input.triageData.relatedTickers.join(", ")}` : ""}

Analyze for:
1. Market-moving information (earnings, announcements, insider info hints)
2. Sentiment indicators (bullish/bearish language)
3. Specific asset mentions (stocks, crypto, prediction markets)
4. Time-sensitive opportunities
5. Risk indicators

If NO significant trading signal is found, respond with: {"hasSignal": false}

If a signal IS found, respond in JSON format:
{
  "hasSignal": true,
  "title": "Brief signal title",
  "description": "Detailed description of the signal",
  "confidence": 0.0-1.0,
  "severity": "low" | "medium" | "high" | "critical",
  "relatedMarkets": ["TICKER1", "TICKER2"],
  "sentiment": "bullish" | "bearish" | "neutral",
  "priceImpact": estimated percentage impact (optional),
  "timeHorizon": "immediate" | "short_term" | "long_term",
  "actionSuggestion": "Suggested action",
  "confidenceFactors": ["reason1", "reason2"]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`Claude API error: ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);

    if (!parsed.hasSignal) {
      return null;
    }

    return {
      type: "email",
      source: "email_triage",
      sourceId: input.emailId,
      title: parsed.title ?? "Email Signal Detected",
      description: parsed.description ?? "",
      confidence: parsed.confidence ?? 0.5,
      severity: parsed.severity ?? "medium",
      relatedMarkets: parsed.relatedMarkets ?? input.triageData?.relatedTickers ?? [],
      relatedEvents: [],
      sentiment: parsed.sentiment,
      priceImpact: parsed.priceImpact,
      timeHorizon: parsed.timeHorizon,
      actionSuggestion: parsed.actionSuggestion,
      aiAnalysis: parsed.description,
      aiConfidenceFactors: parsed.confidenceFactors,
      rawData: { email: input },
    };
  } catch {
    return null;
  }
}

/**
 * Correlate news content to markets
 */
export async function correlateNewsToMarkets(
  input: NewsSignalInput
): Promise<SignalData | null> {
  console.log(`[Signal Activity] Correlating news to markets: ${input.title.slice(0, 50)}...`);

  Context.current().heartbeat("Analyzing news correlation...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a market correlation AI. Analyze this news article and identify which markets/assets it may impact.

NEWS ARTICLE:
Title: ${input.title}
Source: ${input.source}
Published: ${input.publishedAt}
Categories: ${input.categories.join(", ")}

Content:
${input.content}

Analyze and identify:
1. Which prediction markets this news affects (politics, economics, sports, entertainment, crypto)
2. Which stocks/crypto assets are mentioned or implied
3. The likely market impact direction and magnitude
4. Time horizon for the impact
5. Confidence in the correlation

Respond in JSON format:
{
  "hasCorrelation": true/false,
  "title": "Brief correlation title",
  "description": "How this news correlates to markets",
  "confidence": 0.0-1.0,
  "severity": "low" | "medium" | "high" | "critical",
  "relatedMarkets": ["MARKET1", "MARKET2"],
  "relatedPredictionEvents": ["event_ticker1", "event_ticker2"],
  "sentiment": "bullish" | "bearish" | "neutral",
  "priceImpact": estimated percentage impact,
  "timeHorizon": "immediate" | "short_term" | "long_term",
  "correlationExplanation": "Why these markets are affected",
  "confidenceFactors": ["reason1", "reason2"]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`Claude API error: ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);

    if (!parsed.hasCorrelation) {
      return null;
    }

    return {
      type: "news",
      source: "news_feed",
      sourceId: input.newsId,
      title: parsed.title ?? "News Market Correlation",
      description: parsed.description ?? "",
      confidence: parsed.confidence ?? 0.5,
      severity: parsed.severity ?? "medium",
      relatedMarkets: parsed.relatedMarkets ?? [],
      relatedEvents: parsed.relatedPredictionEvents ?? [],
      sentiment: parsed.sentiment,
      priceImpact: parsed.priceImpact,
      timeHorizon: parsed.timeHorizon,
      actionSuggestion: `Review impact on: ${parsed.relatedMarkets?.join(", ")}`,
      aiAnalysis: parsed.correlationExplanation,
      aiConfidenceFactors: parsed.confidenceFactors,
      rawData: { news: input },
    };
  } catch {
    return null;
  }
}

/**
 * Detect unusual market activity
 */
export async function analyzeUnusualActivity(
  marketData: MarketData[]
): Promise<SignalData[]> {
  console.log(`[Signal Activity] Analyzing unusual activity for ${marketData.length} markets`);

  Context.current().heartbeat("Detecting unusual patterns...");

  // Calculate basic anomalies locally first
  const anomalies: SignalData[] = [];

  for (const market of marketData) {
    const priceChange = ((market.price - market.previousPrice) / market.previousPrice) * 100;
    const volumeChange =
      ((market.volume - market.previousVolume) / market.previousVolume) * 100;

    // Flag significant price movements (>5%)
    if (Math.abs(priceChange) > 5) {
      anomalies.push({
        type: "unusual_activity",
        source: "market_monitor",
        title: `Significant Price Movement: ${market.ticker}`,
        description: `${market.ticker} has moved ${priceChange.toFixed(2)}% in the monitored period`,
        confidence: Math.min(Math.abs(priceChange) / 20, 1),
        severity:
          Math.abs(priceChange) > 20
            ? "critical"
            : Math.abs(priceChange) > 10
              ? "high"
              : "medium",
        relatedMarkets: [market.ticker],
        relatedEvents: [],
        sentiment: priceChange > 0 ? "bullish" : "bearish",
        priceImpact: priceChange,
        timeHorizon: "immediate",
        rawData: market,
      });
    }

    // Flag significant volume spikes (>100%)
    if (volumeChange > 100) {
      anomalies.push({
        type: "unusual_activity",
        source: "volume_monitor",
        title: `Volume Spike: ${market.ticker}`,
        description: `${market.ticker} volume increased ${volumeChange.toFixed(0)}%`,
        confidence: Math.min(volumeChange / 500, 1),
        severity: volumeChange > 500 ? "high" : volumeChange > 200 ? "medium" : "low",
        relatedMarkets: [market.ticker],
        relatedEvents: [],
        sentiment: "neutral",
        timeHorizon: "immediate",
        rawData: market,
      });
    }
  }

  // Use Claude for deeper pattern analysis if anomalies found
  if (anomalies.length > 0) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Analyze these detected market anomalies and provide insights:

ANOMALIES:
${anomalies
  .map(
    (a) =>
      `- ${a.title}: ${a.description} (Sentiment: ${a.sentiment}, Impact: ${a.priceImpact}%)`
  )
  .join("\n")}

For each anomaly, provide:
1. Likely cause
2. Potential implications
3. Recommended action

Respond in JSON array format:
[
  {
    "ticker": "TICKER",
    "analysis": "Brief analysis",
    "actionSuggestion": "Recommended action"
  }
]`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.content?.[0]?.text ?? "[]";
        const analyses = JSON.parse(content);

        // Enrich anomalies with AI analysis
        for (const analysis of analyses) {
          const anomaly = anomalies.find((a) => a.relatedMarkets.includes(analysis.ticker));
          if (anomaly) {
            anomaly.aiAnalysis = analysis.analysis;
            anomaly.actionSuggestion = analysis.actionSuggestion;
          }
        }
      }
    } catch {
      // Continue with basic anomalies if AI enrichment fails
    }
  }

  return anomalies;
}

/**
 * Classify trader behavior patterns
 */
export async function classifyTraderBehavior(
  activities: TraderActivity[]
): Promise<{
  classification: string;
  confidence: number;
  patterns: string[];
  riskLevel: "low" | "medium" | "high";
  insights: string;
}> {
  console.log(`[Signal Activity] Classifying trader behavior from ${activities.length} activities`);

  Context.current().heartbeat("Classifying behavior...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze this trader's recent activity and classify their behavior pattern.

TRADING ACTIVITY:
${activities
  .map(
    (a) =>
      `- ${new Date(a.executedAt).toISOString()}: ${a.side.toUpperCase()} ${a.quantity} ${a.symbol} @ $${a.price}`
  )
  .join("\n")}

Classify the trader into one of these categories:
1. "day_trader" - Frequent intraday trades, quick positions
2. "swing_trader" - Holds positions for days/weeks
3. "position_trader" - Long-term holder
4. "scalper" - Very quick small profit trades
5. "momentum_trader" - Follows trends
6. "contrarian" - Trades against market sentiment
7. "diversified" - Balanced portfolio approach
8. "speculator" - High-risk concentrated bets

Also identify:
- Key patterns in their trading
- Risk level (low/medium/high)
- Actionable insights

Respond in JSON format:
{
  "classification": "trader_type",
  "confidence": 0.0-1.0,
  "patterns": ["pattern1", "pattern2"],
  "riskLevel": "low" | "medium" | "high",
  "insights": "Brief insights about this trader"
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      classification: "unknown",
      confidence: 0,
      patterns: [],
      riskLevel: "medium",
      insights: "Unable to classify trading behavior",
    };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      classification: parsed.classification ?? "unknown",
      confidence: parsed.confidence ?? 0.5,
      patterns: parsed.patterns ?? [],
      riskLevel: parsed.riskLevel ?? "medium",
      insights: parsed.insights ?? "",
    };
  } catch {
    return {
      classification: "unknown",
      confidence: 0,
      patterns: [],
      riskLevel: "medium",
      insights: "Unable to classify trading behavior",
    };
  }
}

/**
 * Aggregate sentiment from multiple sources
 */
export async function aggregateSentiment(
  inputs: Array<{
    source: string;
    content: string;
    weight: number;
  }>
): Promise<{
  overallSentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number; // -1 to 1
  confidence: number;
  breakdown: Array<{
    source: string;
    sentiment: string;
    score: number;
  }>;
  summary: string;
}> {
  console.log(`[Signal Activity] Aggregating sentiment from ${inputs.length} sources`);

  Context.current().heartbeat("Aggregating sentiment...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze and aggregate sentiment from these multiple sources:

SOURCES:
${inputs.map((i) => `[${i.source}] (weight: ${i.weight})\n${i.content.slice(0, 500)}`).join("\n\n")}

Provide:
1. Overall aggregated sentiment (bullish/bearish/neutral)
2. Sentiment score from -1 (very bearish) to +1 (very bullish)
3. Confidence in the aggregation
4. Per-source sentiment breakdown
5. Brief summary

Respond in JSON format:
{
  "overallSentiment": "bullish" | "bearish" | "neutral",
  "sentimentScore": -1.0 to 1.0,
  "confidence": 0.0-1.0,
  "breakdown": [
    {"source": "source_name", "sentiment": "bullish/bearish/neutral", "score": -1 to 1}
  ],
  "summary": "Brief sentiment summary"
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      overallSentiment: "neutral",
      sentimentScore: 0,
      confidence: 0,
      breakdown: [],
      summary: "Unable to aggregate sentiment",
    };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      overallSentiment: parsed.overallSentiment ?? "neutral",
      sentimentScore: parsed.sentimentScore ?? 0,
      confidence: parsed.confidence ?? 0.5,
      breakdown: parsed.breakdown ?? [],
      summary: parsed.summary ?? "",
    };
  } catch {
    return {
      overallSentiment: "neutral",
      sentimentScore: 0,
      confidence: 0,
      breakdown: [],
      summary: "Unable to aggregate sentiment",
    };
  }
}

/**
 * Calculate market correlations
 */
export async function calculateMarketCorrelation(
  marketA: MarketData[],
  marketB: MarketData[]
): Promise<CorrelationResult> {
  console.log(
    `[Signal Activity] Calculating correlation between ${marketA[0]?.ticker} and ${marketB[0]?.ticker}`
  );

  // Calculate Pearson correlation coefficient
  const pricesA = marketA.map((m) => m.price);
  const pricesB = marketB.map((m) => m.price);

  const n = Math.min(pricesA.length, pricesB.length);
  if (n < 2) {
    return {
      marketA: marketA[0]?.ticker ?? "unknown",
      marketB: marketB[0]?.ticker ?? "unknown",
      correlation: 0,
      strength: "weak",
      sampleSize: n,
    };
  }

  const meanA = pricesA.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanB = pricesB.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = pricesA[i] - meanA;
    const diffB = pricesB[i] - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  const correlation = denomA * denomB > 0 ? numerator / Math.sqrt(denomA * denomB) : 0;

  // Determine strength
  const absCorr = Math.abs(correlation);
  const strength: "weak" | "moderate" | "strong" | "very_strong" =
    absCorr > 0.8 ? "very_strong" : absCorr > 0.6 ? "strong" : absCorr > 0.4 ? "moderate" : "weak";

  return {
    marketA: marketA[0]?.ticker ?? "unknown",
    marketB: marketB[0]?.ticker ?? "unknown",
    correlation: Math.round(correlation * 1000) / 1000,
    strength,
    sampleSize: n,
  };
}

/**
 * Generate AI explanation for correlation
 */
export async function explainCorrelation(
  correlation: CorrelationResult,
  contextA: string,
  contextB: string
): Promise<string> {
  console.log(
    `[Signal Activity] Generating explanation for ${correlation.marketA}-${correlation.marketB} correlation`
  );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Explain the correlation between these two markets:

Market A: ${correlation.marketA}
Context: ${contextA}

Market B: ${correlation.marketB}
Context: ${contextB}

Correlation coefficient: ${correlation.correlation}
Strength: ${correlation.strength}
Sample size: ${correlation.sampleSize}

Provide a brief (2-3 sentences) explanation of:
1. Why these markets might be correlated
2. What factors could be driving this relationship
3. Whether this correlation is expected or surprising`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return `${correlation.marketA} and ${correlation.marketB} show a ${correlation.strength} correlation of ${correlation.correlation}.`;
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Generate daily insights for a user
 */
export async function generateDailyInsight(input: {
  userId: string;
  positions: Array<{ symbol: string; quantity: number; pnl: number }>;
  recentSignals: SignalData[];
  marketSummary: string;
}): Promise<UserInsight> {
  console.log(`[Signal Activity] Generating daily insight for user ${input.userId}`);

  Context.current().heartbeat("Generating insights...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate a personalized daily trading insight for this user.

USER PORTFOLIO:
${input.positions.map((p) => `- ${p.symbol}: ${p.quantity} units, P&L: $${p.pnl.toFixed(2)}`).join("\n")}

RECENT SIGNALS:
${input.recentSignals.map((s) => `- [${s.severity}] ${s.title}: ${s.description}`).join("\n")}

MARKET SUMMARY:
${input.marketSummary}

Generate a daily insight that includes:
1. Portfolio performance summary
2. Key market events affecting their positions
3. Actionable recommendations
4. Risk alerts if any

Respond in JSON format:
{
  "title": "Insight title",
  "content": "Detailed insight content (2-3 paragraphs)",
  "summary": "One sentence summary",
  "priority": "low" | "medium" | "high" | "urgent",
  "confidence": 0.0-1.0,
  "actionItems": ["action1", "action2"]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      userId: input.userId,
      insightType: "daily_digest",
      title: "Daily Portfolio Summary",
      content: "Unable to generate personalized insight at this time.",
      confidence: 0,
      priority: "low",
      relatedSignals: [],
      relatedMarkets: input.positions.map((p) => p.symbol),
    };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      userId: input.userId,
      insightType: "daily_digest",
      title: parsed.title ?? "Daily Portfolio Summary",
      content: parsed.content ?? "",
      summary: parsed.summary,
      confidence: parsed.confidence ?? 0.7,
      priority: parsed.priority ?? "medium",
      relatedSignals: input.recentSignals.map((s) => s.sourceId).filter(Boolean) as string[],
      relatedMarkets: input.positions.map((p) => p.symbol),
    };
  } catch {
    return {
      userId: input.userId,
      insightType: "daily_digest",
      title: "Daily Portfolio Summary",
      content: "Unable to generate personalized insight at this time.",
      confidence: 0,
      priority: "low",
      relatedSignals: [],
      relatedMarkets: input.positions.map((p) => p.symbol),
    };
  }
}

// ============================================================================
// Data Fetching Activities
// ============================================================================

/**
 * Fetch active prediction markets
 */
export async function fetchActiveMarkets(): Promise<MarketData[]> {
  console.log(`[Signal Activity] Fetching active prediction markets`);

  // TODO: Call Convex query for predictionMarkets
  // This is a placeholder - implement actual data fetching
  return [];
}

/**
 * Fetch recent market data for correlation analysis
 */
export async function fetchMarketHistory(
  ticker: string,
  hours: number
): Promise<MarketData[]> {
  console.log(`[Signal Activity] Fetching ${hours}h history for ${ticker}`);

  // TODO: Call Kalshi API or Convex for historical data
  return [];
}

/**
 * Fetch recent trading activity
 */
export async function fetchRecentTrades(
  minutes: number
): Promise<TraderActivity[]> {
  console.log(`[Signal Activity] Fetching trades from last ${minutes} minutes`);

  // TODO: Call Convex query for recent trades
  return [];
}

/**
 * Fetch user positions for insight generation
 */
export async function fetchUserPositions(
  userId: string
): Promise<Array<{ symbol: string; quantity: number; pnl: number }>> {
  console.log(`[Signal Activity] Fetching positions for user ${userId}`);

  // TODO: Call Convex query for user positions
  return [];
}

/**
 * Fetch recent signals for user
 */
export async function fetchRecentSignalsForUser(userId: string): Promise<SignalData[]> {
  console.log(`[Signal Activity] Fetching recent signals for user ${userId}`);

  // TODO: Call Convex query filtering by user's watched markets
  return [];
}

/**
 * Fetch all users for daily insight generation
 */
export async function fetchActiveUsers(): Promise<string[]> {
  console.log(`[Signal Activity] Fetching active users`);

  // TODO: Call Convex query for users with active positions
  return [];
}

/**
 * Fetch market correlation pairs to analyze
 */
export async function fetchCorrelationPairs(): Promise<
  Array<{ marketA: string; marketB: string }>
> {
  console.log(`[Signal Activity] Fetching correlation pairs`);

  // TODO: Return pairs based on user portfolio overlap, category, etc.
  return [];
}

// ============================================================================
// Storage Activities
// ============================================================================

/**
 * Store a detected signal in Convex
 */
export async function storeSignal(signal: SignalData): Promise<string> {
  console.log(`[Signal Activity] Storing signal: ${signal.title}`);

  // TODO: Call Convex mutation
  const signalId = `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return signalId;
}

/**
 * Store a user insight in Convex
 */
export async function storeUserInsight(insight: UserInsight): Promise<string> {
  console.log(`[Signal Activity] Storing insight for user ${insight.userId}`);

  // TODO: Call Convex mutation
  const insightId = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return insightId;
}

/**
 * Store market correlation in Convex
 */
export async function storeCorrelation(
  correlation: CorrelationResult,
  correlationType: string,
  timeWindow: string
): Promise<void> {
  console.log(
    `[Signal Activity] Storing correlation: ${correlation.marketA}-${correlation.marketB}`
  );

  // TODO: Call Convex mutation
}

/**
 * Update existing correlation
 */
export async function updateCorrelation(
  marketA: string,
  marketB: string,
  newCorrelation: number,
  newStrength: string
): Promise<void> {
  console.log(`[Signal Activity] Updating correlation: ${marketA}-${marketB}`);

  // TODO: Call Convex mutation
}

/**
 * Expire old signals
 */
export async function expireOldSignals(olderThanHours: number): Promise<number> {
  console.log(`[Signal Activity] Expiring signals older than ${olderThanHours}h`);

  // TODO: Call Convex mutation
  return 0;
}

// ============================================================================
// Notification Activities
// ============================================================================

/**
 * Send signal alert to user
 */
export async function sendSignalAlert(input: {
  userId: string;
  signalId: string;
  title: string;
  severity: string;
}): Promise<void> {
  console.log(`[Signal Activity] Sending signal alert to user ${input.userId}`);

  // TODO: Call push notification service
}

/**
 * Send insight notification
 */
export async function sendInsightNotification(input: {
  userId: string;
  insightId: string;
  title: string;
  priority: string;
}): Promise<void> {
  console.log(`[Signal Activity] Sending insight notification to user ${input.userId}`);

  // TODO: Call push notification service
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record signal detection audit log
 */
export async function recordSignalAuditLog(event: {
  action: string;
  signalId: string;
  signalType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Signal Activity] Audit: ${event.action} for ${event.signalId}`);

  // TODO: Call Convex mutation
}
