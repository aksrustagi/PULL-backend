import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { AGENT_TOOLS, getToolsForAgent } from "./tools";
import { Id } from "../_generated/dataModel";

/**
 * Trading Agent for PULL
 * AI-powered trading assistant with Claude integration
 */

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const TRADING_AGENT_SYSTEM_PROMPT = `You are PULL's AI Trading Assistant, an expert financial advisor specializing in prediction markets, cryptocurrency, and real-world asset (RWA) trading.

## Your Capabilities
- Analyze user portfolios and provide insights
- Research prediction markets and assess probabilities
- Suggest rebalancing strategies based on risk tolerance
- Explain positions and market dynamics
- Execute trades (with user confirmation)

## Guidelines
1. SAFETY FIRST: Always require user confirmation before executing trades
2. RISK AWARENESS: Clearly communicate risks and never guarantee returns
3. FACTUAL: Base recommendations on data, not speculation
4. EDUCATIONAL: Explain your reasoning to help users learn
5. COMPLIANT: Do not provide specific financial advice - frame as educational information

## Response Format
- Be concise but thorough
- Use bullet points for multiple items
- Include relevant numbers and percentages
- Highlight key risks and considerations

## Risk Disclaimers
- Prediction markets carry significant risk of loss
- Past performance does not indicate future results
- Users should only trade with funds they can afford to lose
- This is educational information, not financial advice`;

const ANALYZE_OPPORTUNITY_PROMPT = `Analyze this trading opportunity and provide:
1. Market overview and current pricing
2. Key factors affecting the outcome
3. Risk assessment (High/Medium/Low)
4. Potential scenarios and their probabilities
5. Suggested position sizing based on portfolio

Be objective and highlight both bullish and bearish cases.`;

const REBALANCING_PROMPT = `Review the user's portfolio and suggest rebalancing:
1. Current allocation breakdown
2. Concentration risks
3. Suggested adjustments
4. Reasoning for each change
5. Implementation priority

Consider the user's apparent risk tolerance based on current positions.`;

const EXPLAIN_POSITION_PROMPT = `Explain this position in detail:
1. What the position represents
2. Current P&L analysis
3. Key events that could affect value
4. Risk factors to monitor
5. Potential exit strategies

Make it understandable for both beginners and experienced traders.`;

const MARKET_SUMMARY_PROMPT = `Provide a comprehensive market summary:
1. Current market status and pricing
2. Recent activity and volume trends
3. Key drivers and sentiment
4. Upcoming catalysts or events
5. Technical and fundamental factors

Focus on actionable insights.`;

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get comprehensive user context for the agent
 */
export const _getUserContext = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get user profile
    const user = await ctx.db.get(args.userId);

    // Get portfolio positions
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get balances
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get recent orders
    const recentOrders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    // Get open orders
    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const openOrders = allOrders.filter((o) =>
      ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
    );

    // Calculate portfolio metrics
    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice,
      0
    );
    const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    const usdBalance = balances.find(
      (b) => b.assetType === "usd" && b.assetId === "USD"
    );

    return {
      user: user
        ? {
            displayName: user.displayName,
            kycTier: user.kycTier,
          }
        : null,
      portfolio: {
        totalValue,
        totalCost,
        totalPnL,
        pnlPercent: totalCost > 0 ? (totalPnL / totalCost) * 100 : 0,
        cashBalance: usdBalance?.available ?? 0,
        positionCount: positions.length,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        assetClass: p.assetClass,
        side: p.side,
        quantity: p.quantity,
        avgPrice: p.averageEntryPrice,
        currentPrice: p.currentPrice,
        value: p.quantity * p.currentPrice,
        pnl: p.unrealizedPnL,
        pnlPercent: p.costBasis > 0 ? (p.unrealizedPnL / p.costBasis) * 100 : 0,
        allocation: totalValue > 0 ? ((p.quantity * p.currentPrice) / totalValue) * 100 : 0,
      })),
      openOrders: openOrders.map((o) => ({
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        quantity: o.quantity,
        price: o.price,
        status: o.status,
      })),
      recentActivity: recentOrders.slice(0, 5).map((o) => ({
        symbol: o.symbol,
        side: o.side,
        quantity: o.quantity,
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  },
});

/**
 * Get market signals and data
 */
export const _getMarketSignals = internalQuery({
  args: {
    symbols: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Get active prediction markets
    const events = await ctx.db
      .query("predictionEvents")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(20);

    const markets: Array<{
      ticker: string;
      title: string;
      probability: number;
      volume: number;
      closeTime: number;
    }> = [];

    for (const event of events) {
      const eventMarkets = await ctx.db
        .query("predictionMarkets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();

      for (const market of eventMarkets) {
        if (!args.symbols || args.symbols.includes(market.ticker)) {
          markets.push({
            ticker: market.ticker,
            title: event.title,
            probability: market.probability,
            volume: market.yesVolume + market.noVolume,
            closeTime: event.closeTime,
          });
        }
      }
    }

    // Sort by volume
    markets.sort((a, b) => b.volume - a.volume);

    return {
      activeMarkets: markets.slice(0, 10),
      marketCount: markets.length,
      timestamp: Date.now(),
    };
  },
});

// ============================================================================
// MAIN TRADING AGENT ACTION
// ============================================================================

/**
 * Main Trading Agent action - process user query with AI
 */
export const chat = action({
  args: {
    userId: v.id("users"),
    query: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = args.sessionId ?? `session_${Date.now()}`;

    // Get user context
    const userContext = await ctx.runQuery(
      internal.agents["trading-agent"]._getUserContext,
      { userId: args.userId }
    );

    // Get market signals
    const marketSignals = await ctx.runQuery(
      internal.agents["trading-agent"]._getMarketSignals,
      {}
    );

    // Get agent memory context
    const memoryContext = await ctx.runAction(api.agents.memory.buildContext, {
      userId: args.userId,
      agentType: "trading",
      query: args.query,
      maxTokens: 1500,
    });

    // Build messages for Claude
    const messages = [
      {
        role: "user" as const,
        content: buildContextMessage(userContext, marketSignals, memoryContext.context) +
          "\n\n---\n\nUser Query: " + args.query,
      },
    ];

    // Call Claude API
    const response = await callClaude({
      system: TRADING_AGENT_SYSTEM_PROMPT,
      messages,
      tools: getToolsForAgent("trading"),
    });

    // Process tool calls if any
    let finalResponse = response.content;
    const toolResults: Array<{ tool: string; result: unknown }> = [];

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await ctx.runAction(api.agents.tools.executeTool, {
          userId: args.userId,
          toolName: toolCall.name,
          toolInput: toolCall.input,
        });
        toolResults.push({ tool: toolCall.name, result });
      }

      // Get follow-up response with tool results
      const followUp = await callClaudeWithToolResults({
        system: TRADING_AGENT_SYSTEM_PROMPT,
        messages,
        toolCalls: response.toolCalls,
        toolResults,
      });

      finalResponse = followUp.content;
    }

    // Store interaction in memory
    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "trading",
      sessionId,
      role: "user",
      content: args.query,
    });

    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "trading",
      sessionId,
      role: "assistant",
      content: finalResponse,
      metadata: { toolsUsed: toolResults.map((t) => t.tool) },
    });

    return {
      response: finalResponse,
      sessionId,
      toolsUsed: toolResults.map((t) => t.tool),
      suggestedActions: extractSuggestedActions(finalResponse, toolResults),
    };
  },
});

/**
 * Analyze a trading opportunity
 */
export const analyzeTradingOpportunity = action({
  args: {
    userId: v.id("users"),
    query: v.string(),
    marketTicker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get user context
    const userContext = await ctx.runQuery(
      internal.agents["trading-agent"]._getUserContext,
      { userId: args.userId }
    );

    // Get specific market data if ticker provided
    let marketData = null;
    if (args.marketTicker) {
      marketData = await ctx.runAction(api.agents.tools.executeTool, {
        userId: args.userId,
        toolName: "getMarketData",
        toolInput: { ticker: args.marketTicker },
      });
    }

    const contextMessage = `
## Portfolio Context
- Total Value: $${userContext.portfolio.totalValue.toFixed(2)}
- Cash Available: $${userContext.portfolio.cashBalance.toFixed(2)}
- Current P&L: ${userContext.portfolio.pnlPercent.toFixed(1)}%

${marketData ? `## Market Data\n${JSON.stringify(marketData, null, 2)}` : ""}

## Analysis Request
${args.query}
`;

    const response = await callClaude({
      system: TRADING_AGENT_SYSTEM_PROMPT + "\n\n" + ANALYZE_OPPORTUNITY_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: getToolsForAgent("trading"),
    });

    // Store analysis in memory
    await ctx.runAction(api.agents.memory.storeMemoryWithEmbedding, {
      userId: args.userId,
      agentType: "trading",
      key: `analysis:${args.marketTicker ?? "general"}:${Date.now()}`,
      value: {
        type: "insight",
        query: args.query,
        analysis: response.content,
        timestamp: Date.now(),
      },
      textForEmbedding: `${args.query} ${response.content}`,
    });

    return {
      analysis: response.content,
      marketData,
      riskDisclaimer:
        "This analysis is for educational purposes only and does not constitute financial advice.",
    };
  },
});

/**
 * Get portfolio rebalancing suggestions
 */
export const getRebalancingSuggestions = action({
  args: {
    userId: v.id("users"),
    riskTolerance: v.optional(
      v.union(v.literal("conservative"), v.literal("moderate"), v.literal("aggressive"))
    ),
  },
  handler: async (ctx, args) => {
    // Get full user context
    const userContext = await ctx.runQuery(
      internal.agents["trading-agent"]._getUserContext,
      { userId: args.userId }
    );

    const riskTolerance = args.riskTolerance ?? "moderate";

    const contextMessage = `
## Current Portfolio
Total Value: $${userContext.portfolio.totalValue.toFixed(2)}
Cash: $${userContext.portfolio.cashBalance.toFixed(2)}
Overall P&L: ${userContext.portfolio.pnlPercent.toFixed(1)}%

### Positions
${userContext.positions
  .map(
    (p) =>
      `- ${p.symbol} (${p.assetClass}): ${p.quantity} @ $${p.currentPrice.toFixed(2)} | ${p.allocation.toFixed(1)}% allocation | ${p.pnlPercent.toFixed(1)}% P&L`
  )
  .join("\n")}

### Open Orders
${userContext.openOrders.length > 0 ? userContext.openOrders.map((o) => `- ${o.side.toUpperCase()} ${o.quantity} ${o.symbol} @ $${o.price}`).join("\n") : "None"}

## Risk Tolerance: ${riskTolerance.toUpperCase()}

Please provide rebalancing suggestions for this portfolio.
`;

    const response = await callClaude({
      system: TRADING_AGENT_SYSTEM_PROMPT + "\n\n" + REBALANCING_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: getToolsForAgent("trading"),
    });

    return {
      suggestions: response.content,
      currentAllocation: userContext.positions.map((p) => ({
        symbol: p.symbol,
        allocation: p.allocation,
        value: p.value,
      })),
      riskTolerance,
      disclaimer:
        "These suggestions are for educational purposes. Always do your own research before trading.",
    };
  },
});

/**
 * Explain a specific position
 */
export const explainPosition = action({
  args: {
    userId: v.id("users"),
    positionId: v.optional(v.id("positions")),
    symbol: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get position details
    const position = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getPosition",
      toolInput: {
        positionId: args.positionId,
        symbol: args.symbol,
      },
    });

    if (!position) {
      return {
        error: "Position not found",
        suggestion: "Please provide a valid position ID or symbol",
      };
    }

    // Get market data for the position
    const marketData = await ctx.runAction(api.agents.tools.executeTool, {
      userId: args.userId,
      toolName: "getMarketData",
      toolInput: { ticker: position.symbol },
    });

    const contextMessage = `
## Position Details
Symbol: ${position.symbol}
Asset Class: ${position.assetClass}
Side: ${position.side}
Quantity: ${position.quantity}
Average Entry: $${position.averageEntryPrice?.toFixed(2) ?? "N/A"}
Current Price: $${position.currentPrice?.toFixed(2) ?? "N/A"}
Unrealized P&L: $${position.unrealizedPnL?.toFixed(2) ?? "N/A"}
Cost Basis: $${position.costBasis?.toFixed(2) ?? "N/A"}

## Market Data
${JSON.stringify(marketData, null, 2)}

Please explain this position in detail.
`;

    const response = await callClaude({
      system: TRADING_AGENT_SYSTEM_PROMPT + "\n\n" + EXPLAIN_POSITION_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      explanation: response.content,
      position: {
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
        currentValue: position.quantity * (position.currentPrice ?? 0),
        pnl: position.unrealizedPnL,
        pnlPercent:
          position.costBasis > 0
            ? (position.unrealizedPnL / position.costBasis) * 100
            : 0,
      },
      marketData,
    };
  },
});

/**
 * Summarize a market
 */
export const summarizeMarket = action({
  args: {
    marketTicker: v.string(),
  },
  handler: async (ctx, args) => {
    // Get market data
    const marketData = await ctx.runQuery(internal.agents.tools._getMarketData, {
      ticker: args.marketTicker,
    });

    // Get prediction market details if applicable
    const predictionMarket = await ctx.runQuery(
      internal.agents.tools._getPredictionMarket,
      { ticker: args.marketTicker }
    );

    const contextMessage = `
## Market: ${args.marketTicker}

### Market Data
${JSON.stringify(marketData, null, 2)}

${predictionMarket ? `### Prediction Market Details\n${JSON.stringify(predictionMarket, null, 2)}` : ""}

Please provide a comprehensive market summary.
`;

    const response = await callClaude({
      system: TRADING_AGENT_SYSTEM_PROMPT + "\n\n" + MARKET_SUMMARY_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      summary: response.content,
      marketData,
      predictionMarket,
      timestamp: Date.now(),
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildContextMessage(
  userContext: Awaited<ReturnType<typeof _getUserContext.handler>>,
  marketSignals: Awaited<ReturnType<typeof _getMarketSignals.handler>>,
  memoryContext: string
): string {
  return `
## User Context
Name: ${userContext.user?.displayName ?? "User"}
KYC Tier: ${userContext.user?.kycTier ?? "unknown"}

## Portfolio Summary
- Total Value: $${userContext.portfolio.totalValue.toFixed(2)}
- Cash Balance: $${userContext.portfolio.cashBalance.toFixed(2)}
- Overall P&L: $${userContext.portfolio.totalPnL.toFixed(2)} (${userContext.portfolio.pnlPercent.toFixed(1)}%)
- Position Count: ${userContext.portfolio.positionCount}

## Current Positions
${
  userContext.positions.length > 0
    ? userContext.positions
        .map(
          (p) =>
            `- ${p.symbol}: ${p.quantity} units @ $${p.currentPrice.toFixed(2)} (${p.pnlPercent.toFixed(1)}% P&L, ${p.allocation.toFixed(1)}% allocation)`
        )
        .join("\n")
    : "No open positions"
}

## Open Orders
${
  userContext.openOrders.length > 0
    ? userContext.openOrders
        .map((o) => `- ${o.side.toUpperCase()} ${o.quantity} ${o.symbol} @ $${o.price ?? "market"}`)
        .join("\n")
    : "No open orders"
}

## Active Markets
${marketSignals.activeMarkets
  .slice(0, 5)
  .map((m) => `- ${m.ticker}: ${(m.probability * 100).toFixed(0)}% probability`)
  .join("\n")}

${memoryContext ? `## Previous Context\n${memoryContext}` : ""}
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
      content:
        "I apologize, but I'm currently unable to process your request. The AI service is not configured. Please contact support.",
    };
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
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
      return {
        content:
          "I encountered an error processing your request. Please try again later.",
      };
    }

    const data = await response.json();

    // Extract text content and tool calls
    let textContent = "";
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

    for (const block of data.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          name: block.name,
          input: block.input,
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error("Error calling Claude:", error);
    return {
      content:
        "I encountered an error processing your request. Please try again later.",
    };
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
    return {
      content:
        "I apologize, but I'm currently unable to process your request. The AI service is not configured.",
    };
  }

  try {
    // Build message with tool use and results
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
        max_tokens: 2048,
        system: params.system,
        messages,
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", await response.text());
      return {
        content:
          "I encountered an error processing the tool results. Please try again.",
      };
    }

    const data = await response.json();
    const textContent = data.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("");

    return { content: textContent };
  } catch (error) {
    console.error("Error calling Claude with tool results:", error);
    return {
      content:
        "I encountered an error processing your request. Please try again later.",
    };
  }
}

function extractSuggestedActions(
  response: string,
  toolResults: Array<{ tool: string; result: unknown }>
): Array<{ type: string; label: string; data?: unknown }> {
  const actions: Array<{ type: string; label: string; data?: unknown }> = [];

  // Check for pending orders that need confirmation
  for (const tr of toolResults) {
    if (tr.tool === "placeOrder" && (tr.result as { requiresConfirmation?: boolean })?.requiresConfirmation) {
      actions.push({
        type: "confirm_order",
        label: "Confirm Order",
        data: tr.result,
      });
    }
  }

  // Extract action suggestions from response text
  if (response.toLowerCase().includes("consider buying")) {
    actions.push({ type: "suggestion", label: "View Buy Opportunities" });
  }
  if (response.toLowerCase().includes("consider selling")) {
    actions.push({ type: "suggestion", label: "Review Positions to Sell" });
  }
  if (response.toLowerCase().includes("rebalance")) {
    actions.push({ type: "suggestion", label: "Get Rebalancing Suggestions" });
  }

  return actions;
}
