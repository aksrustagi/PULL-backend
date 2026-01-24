import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getToolsForAgent } from "./tools";

/**
 * Research Agent for PULL
 * AI-powered research assistant for prediction markets and market analysis
 */

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const RESEARCH_AGENT_SYSTEM_PROMPT = `You are PULL's AI Research Analyst, specializing in prediction markets, cryptocurrency, and financial research.

## Your Expertise
- Prediction market analysis and probability assessment
- News aggregation and impact analysis
- Sentiment analysis across markets
- Price movement factor identification
- Event-driven market research

## Research Principles
1. DATA-DRIVEN: Base conclusions on verifiable data and facts
2. BALANCED: Present multiple perspectives and scenarios
3. TRANSPARENT: Cite sources and acknowledge uncertainty
4. ACTIONABLE: Provide clear insights users can act on
5. TIMELY: Consider time-sensitive factors and deadlines

## Analysis Framework
- Identify key variables affecting outcomes
- Assess probability ranges with confidence levels
- Consider historical precedents
- Account for market efficiency and biases
- Highlight contrarian opportunities when supported

## Output Format
- Executive summary first
- Supporting analysis with evidence
- Risk factors and uncertainties
- Suggested next steps or further research
- Relevant timelines and deadlines

## Disclaimers
- Research is for informational purposes only
- Past patterns may not predict future outcomes
- Markets can be inefficient or manipulated
- Always verify critical information independently`;

const DEEP_RESEARCH_PROMPT = `Conduct comprehensive research on this prediction market topic.

Structure your analysis:
1. **Executive Summary** - Key findings in 2-3 sentences
2. **Market Overview** - Current pricing, volume, and activity
3. **Factor Analysis** - Key variables affecting the outcome
4. **Scenario Analysis** - Bull, bear, and base cases with probabilities
5. **Sentiment Assessment** - Market consensus vs. contrarian views
6. **Risk Factors** - What could invalidate the analysis
7. **Timeline** - Key dates and catalysts
8. **Recommendation** - Actionable insight with confidence level`;

const NEWS_ANALYSIS_PROMPT = `Analyze the impact of recent news on this topic.

Provide:
1. News Summary - What happened
2. Market Relevance - How it affects prediction markets
3. Price Impact Assessment - Expected effect on probabilities
4. Timing - When impact will be felt
5. Related Markets - Other markets affected
6. Information Quality - Source reliability and completeness`;

const SENTIMENT_ANALYSIS_PROMPT = `Analyze market sentiment for this topic.

Assess:
1. Overall Sentiment - Bullish/Bearish/Neutral with score
2. Sentiment Drivers - What's causing the current mood
3. Sentiment Trends - How sentiment has shifted recently
4. Contrarian Indicators - Signs of excessive optimism/pessimism
5. Social Signals - Social media and community sentiment
6. Smart Money - Institutional or informed trader positioning`;

const PRICE_FACTORS_PROMPT = `Identify and analyze factors affecting this market's pricing.

Examine:
1. Primary Drivers - Most important price factors
2. Secondary Factors - Supporting influences
3. External Variables - Macro/external dependencies
4. Market Mechanics - Liquidity, spreads, efficiency
5. Information Asymmetry - What the market might be missing
6. Catalyst Calendar - Upcoming events that could move prices`;

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get prediction market details for research
 */
export const _getPredictionMarketDetails = internalQuery({
  args: {
    ticker: v.optional(v.string()),
    eventId: v.optional(v.id("predictionEvents")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let events: Awaited<ReturnType<typeof ctx.db.get>>[] = [];

    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (event) events = [event];
    } else if (args.ticker) {
      const event = await ctx.db
        .query("predictionEvents")
        .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker!))
        .unique();
      if (event) events = [event];
    } else if (args.category) {
      events = await ctx.db
        .query("predictionEvents")
        .withIndex("by_category", (q) =>
          q.eq("category", args.category!).eq("status", "open")
        )
        .take(10);
    } else {
      events = await ctx.db
        .query("predictionEvents")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(20);
    }

    const results = [];

    for (const event of events) {
      if (!event) continue;

      const markets = await ctx.db
        .query("predictionMarkets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();

      results.push({
        event: {
          id: event._id,
          ticker: event.ticker,
          title: event.title,
          description: event.description,
          category: event.category,
          subcategory: event.subcategory,
          status: event.status,
          openTime: event.openTime,
          closeTime: event.closeTime,
          expirationTime: event.expirationTime,
          volume: event.volume,
          openInterest: event.openInterest,
          resolutionSource: event.resolutionSource,
          tags: event.tags,
        },
        markets: markets.map((m) => ({
          ticker: m.ticker,
          name: m.name,
          description: m.description,
          probability: m.probability,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
          yesVolume: m.yesVolume,
          noVolume: m.noVolume,
          openInterest: m.openInterest,
        })),
      });
    }

    return results;
  },
});

/**
 * Get market activity and trends
 */
export const _getMarketActivity = internalQuery({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("predictionEvents")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    if (args.category) {
      events = events.filter((e) => e.category === args.category);
    }

    // Sort by volume
    events.sort((a, b) => b.volume - a.volume);

    const topEvents = events.slice(0, args.limit ?? 10);

    // Get closing soon
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const closingSoon = events
      .filter((e) => e.closeTime - now < oneDayMs && e.closeTime > now)
      .slice(0, 5);

    // Get highest volume
    const highVolume = topEvents.slice(0, 5);

    return {
      totalActiveEvents: events.length,
      topByVolume: highVolume.map((e) => ({
        ticker: e.ticker,
        title: e.title,
        volume: e.volume,
        closeTime: e.closeTime,
      })),
      closingSoon: closingSoon.map((e) => ({
        ticker: e.ticker,
        title: e.title,
        closeTime: e.closeTime,
        hoursRemaining: Math.round((e.closeTime - now) / (60 * 60 * 1000)),
      })),
      categories: [...new Set(events.map((e) => e.category))],
    };
  },
});

// ============================================================================
// MAIN RESEARCH AGENT ACTION
// ============================================================================

/**
 * Main Research Agent chat action
 */
export const chat = action({
  args: {
    userId: v.id("users"),
    query: v.string(),
    marketTicker: v.optional(v.string()),
    category: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = args.sessionId ?? `research_session_${Date.now()}`;

    // Get market data
    const marketData = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      {
        ticker: args.marketTicker,
        category: args.category,
      }
    );

    // Get market activity
    const activity = await ctx.runQuery(
      internal.agents["research-agent"]._getMarketActivity,
      { category: args.category }
    );

    // Get memory context
    const memoryContext = await ctx.runAction(api.agents.memory.buildContext, {
      userId: args.userId,
      agentType: "research",
      query: args.query,
      maxTokens: 1500,
    });

    // Build context message
    const contextMessage = buildResearchContextMessage(
      marketData,
      activity,
      memoryContext.context,
      args.query
    );

    // Call Claude
    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: getToolsForAgent("research"),
    });

    // Process tool calls
    const toolResults: Array<{ tool: string; result: unknown }> = [];
    let finalResponse = response.content;

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await ctx.runAction(api.agents.tools.executeTool, {
          userId: args.userId,
          toolName: toolCall.name,
          toolInput: toolCall.input,
        });
        toolResults.push({ tool: toolCall.name, result });
      }

      const followUp = await callClaudeWithToolResults({
        system: RESEARCH_AGENT_SYSTEM_PROMPT,
        messages: [{ role: "user" as const, content: contextMessage }],
        toolCalls: response.toolCalls,
        toolResults,
      });

      finalResponse = followUp.content;
    }

    // Store interaction
    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "research",
      sessionId,
      role: "user",
      content: args.query,
    });

    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "research",
      sessionId,
      role: "assistant",
      content: finalResponse,
      metadata: { toolsUsed: toolResults.map((t) => t.tool) },
    });

    return {
      response: finalResponse,
      sessionId,
      toolsUsed: toolResults.map((t) => t.tool),
      relatedMarkets: marketData.slice(0, 3).map((m) => ({
        ticker: m.event.ticker,
        title: m.event.title,
      })),
    };
  },
});

/**
 * Deep research on a prediction market
 */
export const deepResearch = action({
  args: {
    userId: v.id("users"),
    marketTicker: v.string(),
    focusAreas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Get comprehensive market data
    const marketData = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      { ticker: args.marketTicker }
    );

    if (marketData.length === 0) {
      return { error: "Market not found" };
    }

    const market = marketData[0];

    // Get related markets
    const relatedMarkets = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      { category: market.event.category }
    );

    // Get news (simulated - would call external API)
    const newsResults = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getNews",
      toolInput: { topic: market.event.title, limit: 5 },
    });

    const focusAreas = args.focusAreas?.join(", ") ?? "all aspects";

    const contextMessage = `
## Research Target
${market.event.title}
Ticker: ${market.event.ticker}
Category: ${market.event.category}

## Market Data
${market.markets
  .map(
    (m) =>
      `- ${m.name}: ${(m.probability * 100).toFixed(1)}% probability | Yes: $${m.yesPrice.toFixed(2)} | No: $${m.noPrice.toFixed(2)}`
  )
  .join("\n")}

## Event Details
- Status: ${market.event.status}
- Close Time: ${new Date(market.event.closeTime).toLocaleString()}
- Volume: $${market.event.volume.toLocaleString()}
- Open Interest: $${market.event.openInterest.toLocaleString()}
- Resolution Source: ${market.event.resolutionSource ?? "Not specified"}

## Event Description
${market.event.description}

## Related Markets (Same Category)
${relatedMarkets
  .slice(0, 5)
  .filter((m) => m.event.ticker !== market.event.ticker)
  .map((m) => `- ${m.event.ticker}: ${m.event.title}`)
  .join("\n")}

## Recent News
${JSON.stringify(newsResults, null, 2)}

## Focus Areas
${focusAreas}

Please conduct deep research on this prediction market.
`;

    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT + "\n\n" + DEEP_RESEARCH_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Store research in memory
    await ctx.runAction(api.agents.memory.storeMemoryWithEmbedding, {
      userId: args.userId,
      agentType: "research",
      key: `deep_research:${args.marketTicker}:${Date.now()}`,
      value: {
        type: "insight",
        marketTicker: args.marketTicker,
        research: response.content,
        timestamp: Date.now(),
      },
      textForEmbedding: `${market.event.title} ${market.event.description} ${response.content}`,
    });

    return {
      research: response.content,
      market: {
        ticker: market.event.ticker,
        title: market.event.title,
        currentProbability: market.markets[0]?.probability,
        closeTime: market.event.closeTime,
        volume: market.event.volume,
      },
      relatedMarkets: relatedMarkets
        .slice(0, 5)
        .filter((m) => m.event.ticker !== market.event.ticker)
        .map((m) => ({
          ticker: m.event.ticker,
          title: m.event.title,
          probability: m.markets[0]?.probability,
        })),
      timestamp: Date.now(),
    };
  },
});

/**
 * Analyze news impact on markets
 */
export const analyzeNews = action({
  args: {
    userId: v.id("users"),
    topic: v.string(),
    marketTicker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get news
    const newsResults = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getNews",
      toolInput: { topic: args.topic, limit: 10 },
    });

    // Get related market if specified
    let marketData = null;
    if (args.marketTicker) {
      const markets = await ctx.runQuery(
        internal.agents["research-agent"]._getPredictionMarketDetails,
        { ticker: args.marketTicker }
      );
      marketData = markets[0] ?? null;
    }

    const contextMessage = `
## News Topic
${args.topic}

## Recent News
${JSON.stringify(newsResults, null, 2)}

${
  marketData
    ? `## Related Market
Ticker: ${marketData.event.ticker}
Title: ${marketData.event.title}
Current Probability: ${(marketData.markets[0]?.probability * 100).toFixed(1)}%
Volume: $${marketData.event.volume.toLocaleString()}`
    : ""
}

Please analyze the news and its potential market impact.
`;

    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT + "\n\n" + NEWS_ANALYSIS_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      analysis: response.content,
      topic: args.topic,
      marketTicker: args.marketTicker,
      newsCount: (newsResults as { articles?: unknown[] }).articles?.length ?? 0,
      timestamp: Date.now(),
    };
  },
});

/**
 * Analyze market sentiment
 */
export const analyzeSentiment = action({
  args: {
    userId: v.id("users"),
    marketTicker: v.string(),
  },
  handler: async (ctx, args) => {
    // Get market data
    const marketData = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      { ticker: args.marketTicker }
    );

    if (marketData.length === 0) {
      return { error: "Market not found" };
    }

    const market = marketData[0];

    // Get activity data
    const activity = await ctx.runQuery(
      internal.agents["research-agent"]._getMarketActivity,
      { category: market.event.category }
    );

    // Get news for sentiment context
    const news = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getNews",
      toolInput: { topic: market.event.title, limit: 5 },
    });

    const contextMessage = `
## Market to Analyze
${market.event.title}
Ticker: ${market.event.ticker}

## Current Pricing
${market.markets.map((m) => `- ${m.name}: ${(m.probability * 100).toFixed(1)}%`).join("\n")}

## Volume and Activity
- Total Volume: $${market.event.volume.toLocaleString()}
- Open Interest: $${market.event.openInterest.toLocaleString()}
- Yes Volume: $${market.markets[0]?.yesVolume?.toLocaleString() ?? "N/A"}
- No Volume: $${market.markets[0]?.noVolume?.toLocaleString() ?? "N/A"}

## Category Activity
Total Active in Category: ${activity.totalActiveEvents}
Top Volume Markets: ${activity.topByVolume.map((e) => e.ticker).join(", ")}

## Recent News
${JSON.stringify(news, null, 2)}

Please analyze the sentiment for this market.
`;

    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT + "\n\n" + SENTIMENT_ANALYSIS_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Parse sentiment score from response
    const sentimentScore = parseSentimentScore(response.content);

    return {
      analysis: response.content,
      sentimentScore,
      market: {
        ticker: market.event.ticker,
        title: market.event.title,
        probability: market.markets[0]?.probability,
      },
      volumeRatio: market.markets[0]
        ? market.markets[0].yesVolume / (market.markets[0].noVolume || 1)
        : null,
      timestamp: Date.now(),
    };
  },
});

/**
 * Identify price factors for a market
 */
export const identifyPriceFactors = action({
  args: {
    userId: v.id("users"),
    marketTicker: v.string(),
  },
  handler: async (ctx, args) => {
    const marketData = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      { ticker: args.marketTicker }
    );

    if (marketData.length === 0) {
      return { error: "Market not found" };
    }

    const market = marketData[0];

    // Get news for factor context
    const news = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getNews",
      toolInput: { topic: market.event.title, category: "markets", limit: 5 },
    });

    const contextMessage = `
## Market to Analyze
${market.event.title}
Ticker: ${market.event.ticker}
Category: ${market.event.category}

## Current State
${market.markets.map((m) => `- ${m.name}: ${(m.probability * 100).toFixed(1)}% | Volume: $${(m.yesVolume + m.noVolume).toLocaleString()}`).join("\n")}

## Event Details
Description: ${market.event.description}
Close Time: ${new Date(market.event.closeTime).toLocaleString()}
Resolution Source: ${market.event.resolutionSource ?? "Not specified"}
Tags: ${market.event.tags?.join(", ") ?? "None"}

## Recent News
${JSON.stringify(news, null, 2)}

Please identify and analyze the key factors affecting this market's pricing.
`;

    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT + "\n\n" + PRICE_FACTORS_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Parse factors from response
    const factors = parsePriceFactors(response.content);

    return {
      analysis: response.content,
      factors,
      market: {
        ticker: market.event.ticker,
        title: market.event.title,
        probability: market.markets[0]?.probability,
        closeTime: market.event.closeTime,
      },
      timestamp: Date.now(),
    };
  },
});

/**
 * Get market overview for a category
 */
export const getCategoryOverview = action({
  args: {
    userId: v.id("users"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    // Get markets in category
    const marketData = await ctx.runQuery(
      internal.agents["research-agent"]._getPredictionMarketDetails,
      { category: args.category }
    );

    // Get activity
    const activity = await ctx.runQuery(
      internal.agents["research-agent"]._getMarketActivity,
      { category: args.category }
    );

    const contextMessage = `
## Category: ${args.category}

## Active Markets (${marketData.length})
${marketData
  .slice(0, 10)
  .map(
    (m) =>
      `### ${m.event.ticker}: ${m.event.title}
- Status: ${m.event.status}
- Volume: $${m.event.volume.toLocaleString()}
- Close: ${new Date(m.event.closeTime).toLocaleDateString()}
${m.markets.map((mkt) => `  - ${mkt.name}: ${(mkt.probability * 100).toFixed(1)}%`).join("\n")}`
  )
  .join("\n\n")}

## Category Activity
- Total Active: ${activity.totalActiveEvents}
- Closing Soon: ${activity.closingSoon.length}

## Markets Closing Soon
${activity.closingSoon.map((e) => `- ${e.ticker}: ${e.title} (${e.hoursRemaining}h remaining)`).join("\n")}

Please provide an overview analysis of this category.
`;

    const response = await callClaude({
      system: RESEARCH_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      overview: response.content,
      category: args.category,
      marketCount: marketData.length,
      topMarkets: marketData.slice(0, 5).map((m) => ({
        ticker: m.event.ticker,
        title: m.event.title,
        probability: m.markets[0]?.probability,
        volume: m.event.volume,
        closeTime: m.event.closeTime,
      })),
      closingSoon: activity.closingSoon,
      timestamp: Date.now(),
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildResearchContextMessage(
  marketData: Awaited<ReturnType<typeof _getPredictionMarketDetails.handler>>,
  activity: Awaited<ReturnType<typeof _getMarketActivity.handler>>,
  memoryContext: string,
  query: string
): string {
  return `
## Market Overview
Active Markets: ${activity.totalActiveEvents}
Categories: ${activity.categories.join(", ")}

## Top Markets by Volume
${activity.topByVolume.map((m) => `- ${m.ticker}: ${m.title} ($${m.volume.toLocaleString()})`).join("\n")}

## Markets Closing Soon
${activity.closingSoon.map((m) => `- ${m.ticker}: ${m.hoursRemaining}h remaining`).join("\n")}

${
  marketData.length > 0
    ? `## Specific Market Data
${marketData
  .slice(0, 3)
  .map(
    (m) => `### ${m.event.ticker}
Title: ${m.event.title}
Category: ${m.event.category}
${m.markets.map((mkt) => `- ${mkt.name}: ${(mkt.probability * 100).toFixed(1)}%`).join("\n")}`
  )
  .join("\n\n")}`
    : ""
}

${memoryContext ? `## Previous Research Context\n${memoryContext}` : ""}

---

Research Query: ${query}
`;
}

interface ClaudeResponse {
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
}

async function callClaude(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      content: "AI service not configured. Please contact support.",
    };
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: params.system,
      messages: params.messages,
    };

    if (params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error("Claude API error:", await response.text());
      return { content: "Error processing request. Please try again." };
    }

    const data = await response.json();

    let textContent = "";
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

    for (const block of data.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error("Error calling Claude:", error);
    return { content: "Error processing request." };
  }
}

async function callClaudeWithToolResults(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  toolResults: Array<{ tool: string; result: unknown }>;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { content: "AI service not configured." };
  }

  try {
    const messages = [
      ...params.messages,
      {
        role: "assistant" as const,
        content: params.toolCalls.map((tc, i) => ({
          type: "tool_use",
          id: `tool_${i}`,
          name: tc.name,
          input: tc.input,
        })),
      },
      {
        role: "user" as const,
        content: params.toolResults.map((tr, i) => ({
          type: "tool_result",
          tool_use_id: `tool_${i}`,
          content: JSON.stringify(tr.result),
        })),
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: params.system,
        messages,
      }),
    });

    if (!response.ok) {
      return { content: "Error processing tool results." };
    }

    const data = await response.json();
    const textContent = data.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("");

    return { content: textContent };
  } catch (error) {
    console.error("Error:", error);
    return { content: "Error processing request." };
  }
}

function parseSentimentScore(content: string): {
  score: number;
  label: string;
} {
  const lowerContent = content.toLowerCase();

  // Look for explicit sentiment indicators
  if (lowerContent.includes("strongly bullish") || lowerContent.includes("very bullish")) {
    return { score: 0.8, label: "Strongly Bullish" };
  }
  if (lowerContent.includes("bullish")) {
    return { score: 0.6, label: "Bullish" };
  }
  if (lowerContent.includes("strongly bearish") || lowerContent.includes("very bearish")) {
    return { score: 0.2, label: "Strongly Bearish" };
  }
  if (lowerContent.includes("bearish")) {
    return { score: 0.4, label: "Bearish" };
  }

  return { score: 0.5, label: "Neutral" };
}

function parsePriceFactors(content: string): Array<{
  factor: string;
  impact: string;
  importance: string;
}> {
  const factors: Array<{ factor: string; impact: string; importance: string }> = [];

  // Simple extraction - look for numbered or bulleted items
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Look for factor patterns
    if (trimmed.match(/^[-*•\d.]+\s+\*?\*?[A-Z]/)) {
      const factor = trimmed.replace(/^[-*•\d.]+\s+\*?\*?/, "").split(":")[0].replace(/\*\*/g, "");

      if (factor.length > 3 && factor.length < 100) {
        factors.push({
          factor,
          impact: trimmed.toLowerCase().includes("negative")
            ? "negative"
            : trimmed.toLowerCase().includes("positive")
              ? "positive"
              : "mixed",
          importance: trimmed.toLowerCase().includes("primary") ||
            trimmed.toLowerCase().includes("key") ||
            trimmed.toLowerCase().includes("major")
            ? "high"
            : "medium",
        });
      }
    }
  }

  return factors.slice(0, 10);
}
