/**
 * Trading Assistant AI Agent
 *
 * AI-powered trading assistant that provides:
 * - Market analysis and insights
 * - Portfolio recommendations
 * - Risk assessment
 * - Opportunity detection
 */

import { action, internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// =============================================================================
// TRADING ANALYSIS
// =============================================================================

/**
 * Analyze a trading opportunity
 */
export const analyzeTradingOpportunity = action({
  args: {
    userId: v.id("users"),
    query: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ response: string; suggestions?: string[] }> => {
    // Get user's portfolio and preferences
    const user = await ctx.runQuery(internal.functions.users.getByIdInternal, {
      id: args.userId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const balances = await ctx.runQuery(internal.functions.balances.getByUserInternal, {
      userId: args.userId,
    });

    const recentOrders = await ctx.runQuery(internal.functions.orders.getRecentInternal, {
      userId: args.userId,
      limit: 10,
    });

    // Get market signals
    const signals = await ctx.runQuery(internal.functions.signals.getRecent, {
      limit: 20,
    });

    // Get agent memory for personalization
    const memory = await ctx.runQuery(internal.agents.memory.getByUserAgent, {
      userId: args.userId,
      agentType: "trading",
    });

    // Build context for AI
    const systemPrompt = buildTradingSystemPrompt(user, balances, recentOrders, signals, memory);

    // Call Claude API
    const response = await callClaude(systemPrompt, args.query);

    // Store interaction in memory
    await ctx.runMutation(internal.agents.memory.store, {
      userId: args.userId,
      agentType: "trading",
      key: `interaction_${Date.now()}`,
      value: {
        query: args.query,
        response: response.slice(0, 500),
        timestamp: Date.now(),
      },
    });

    return { response };
  },
});

/**
 * Get portfolio rebalancing suggestions
 */
export const getRebalancingSuggestions = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    currentAllocation: Record<string, number>;
    suggestions: string;
    actions: Array<{ action: string; asset: string; reason: string }>;
  }> => {
    const balances = await ctx.runQuery(internal.functions.balances.getByUserInternal, {
      userId: args.userId,
    });

    const signals = await ctx.runQuery(internal.functions.signals.getRecent, {
      limit: 50,
    });

    // Calculate current allocation
    const totalValue = balances.reduce((sum, b) => sum + b.totalValue, 0);
    const allocation: Record<string, number> = {};

    for (const balance of balances) {
      const percentage = totalValue > 0 ? (balance.totalValue / totalValue) * 100 : 0;
      allocation[balance.assetType] = (allocation[balance.assetType] || 0) + percentage;
    }

    // Get AI recommendations
    const prompt = `
      Analyze this portfolio allocation and suggest rebalancing:

      Current Allocation:
      ${JSON.stringify(allocation, null, 2)}

      Holdings:
      ${JSON.stringify(balances.map(b => ({ asset: b.symbol, type: b.assetType, value: b.totalValue })), null, 2)}

      Recent Market Signals:
      ${JSON.stringify(signals.slice(0, 10), null, 2)}

      Provide:
      1. Assessment of current allocation
      2. Specific rebalancing suggestions
      3. Risk considerations
    `;

    const response = await callClaude(
      "You are a portfolio advisor. Provide clear, actionable rebalancing suggestions.",
      prompt
    );

    return {
      currentAllocation: allocation,
      suggestions: response,
      actions: [], // Parse from response in production
    };
  },
});

/**
 * Assess risk for a potential trade
 */
export const assessTradeRisk = action({
  args: {
    userId: v.id("users"),
    assetType: v.string(),
    assetId: v.string(),
    side: v.string(),
    quantity: v.number(),
    price: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    riskLevel: "low" | "medium" | "high" | "very_high";
    riskScore: number;
    factors: Array<{ factor: string; impact: string; description: string }>;
    recommendation: string;
  }> => {
    const user = await ctx.runQuery(internal.functions.users.getByIdInternal, {
      id: args.userId,
    });

    const balances = await ctx.runQuery(internal.functions.balances.getByUserInternal, {
      userId: args.userId,
    });

    // Calculate position size relative to portfolio
    const totalValue = balances.reduce((sum, b) => sum + b.totalValue, 0);
    const tradeValue = args.quantity * (args.price || 0);
    const positionSizePercent = totalValue > 0 ? (tradeValue / totalValue) * 100 : 100;

    // Build risk factors
    const factors: Array<{ factor: string; impact: string; description: string }> = [];

    // Position size risk
    if (positionSizePercent > 25) {
      factors.push({
        factor: "Position Size",
        impact: "high",
        description: `This trade represents ${positionSizePercent.toFixed(1)}% of your portfolio`,
      });
    } else if (positionSizePercent > 10) {
      factors.push({
        factor: "Position Size",
        impact: "medium",
        description: `This trade represents ${positionSizePercent.toFixed(1)}% of your portfolio`,
      });
    }

    // KYC tier risk
    if (user?.kycTier === "basic") {
      factors.push({
        factor: "Account Limits",
        impact: "medium",
        description: "Basic KYC tier has lower trading limits",
      });
    }

    // Calculate overall risk score
    let riskScore = 0;
    for (const factor of factors) {
      if (factor.impact === "high") riskScore += 30;
      else if (factor.impact === "medium") riskScore += 15;
      else riskScore += 5;
    }

    const riskLevel: "low" | "medium" | "high" | "very_high" =
      riskScore >= 60 ? "very_high" :
      riskScore >= 40 ? "high" :
      riskScore >= 20 ? "medium" : "low";

    const recommendation =
      riskLevel === "very_high"
        ? "Consider reducing position size significantly"
        : riskLevel === "high"
        ? "Proceed with caution and consider setting stop losses"
        : riskLevel === "medium"
        ? "Acceptable risk for diversified portfolio"
        : "Trade appears to be within normal risk parameters";

    return {
      riskLevel,
      riskScore,
      factors,
      recommendation,
    };
  },
});

// =============================================================================
// AGENT MEMORY
// =============================================================================

export const memory = {
  getByUserAgent: internalQuery({
    args: {
      userId: v.id("users"),
      agentType: v.string(),
    },
    handler: async (ctx, args) => {
      const memories = await ctx.db
        .query("agentMemory")
        .withIndex("by_userId_agentType", (q) =>
          q.eq("userId", args.userId).eq("agentType", args.agentType)
        )
        .order("desc")
        .take(20);

      return memories.map((m) => m.value);
    },
  }),

  store: internalMutation({
    args: {
      userId: v.id("users"),
      agentType: v.string(),
      key: v.string(),
      value: v.any(),
    },
    handler: async (ctx, args) => {
      const now = Date.now();

      await ctx.db.insert("agentMemory", {
        userId: args.userId,
        agentType: args.agentType,
        key: args.key,
        value: args.value,
        importance: 1,
        accessCount: 0,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    },
  }),
};

// =============================================================================
// HELPERS
// =============================================================================

function buildTradingSystemPrompt(
  user: any,
  balances: any[],
  orders: any[],
  signals: any[],
  memory: any[]
): string {
  return `You are PULL's AI trading assistant. Help users analyze trading opportunities across prediction markets, crypto, and RWAs (Pokemon cards).

User Profile:
- Name: ${user.name || "User"}
- KYC Tier: ${user.kycTier}
- Points Balance: ${user.pointsBalance}

Portfolio Summary:
${JSON.stringify(
  balances.map((b) => ({
    asset: b.symbol,
    type: b.assetType,
    value: b.totalValue,
  })),
  null,
  2
)}

Recent Orders:
${JSON.stringify(
  orders.slice(0, 5).map((o) => ({
    asset: o.symbol,
    side: o.side,
    status: o.status,
    quantity: o.quantity,
  })),
  null,
  2
)}

Current Market Signals:
${JSON.stringify(signals.slice(0, 10), null, 2)}

User Preferences (from memory):
${JSON.stringify(memory.slice(0, 5), null, 2)}

Guidelines:
- Be specific about entry/exit points when discussing trades
- Always mention associated risks
- Reference relevant signals from market data
- For prediction markets, discuss probability and expected value
- For RWAs, discuss market trends and rarity factors
- Never provide guaranteed returns or financial advice
- Be concise but informative`;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "Unable to generate response";
}
