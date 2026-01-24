import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Autonomous Portfolio Agent for PULL
 *
 * Watches positions, prediction markets, and RWA holdings 24/7.
 * Executes pre-approved strategies (DCA, rebalancing, stop-losses).
 * Generates morning briefs with portfolio insights and opportunities.
 */

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const PORTFOLIO_AGENT_SYSTEM_PROMPT = `You are PULL's Autonomous Portfolio Agent, an AI that actively monitors and manages user portfolios across prediction markets, crypto, and real-world assets (RWA).

## Your Role
- Monitor portfolio positions 24/7
- Execute pre-approved automated strategies
- Detect opportunities and risks proactively
- Generate concise, actionable morning briefs
- Suggest trades based on market conditions and user preferences

## Strategy Types You Manage
1. DCA (Dollar-Cost Averaging): Systematic periodic purchases
2. Rebalancing: Maintain target allocations across positions
3. Stop-Loss: Protect against downside with automatic sells
4. Take-Profit: Lock in gains at target prices
5. Opportunistic Buy: Identify undervalued assets matching user criteria

## Guidelines
1. SAFETY: Never exceed user-defined risk parameters
2. TRANSPARENCY: Always explain your reasoning
3. CONSERVATIVE: When in doubt, notify rather than execute
4. DATA-DRIVEN: Base decisions on market data, not speculation
5. COMPLIANT: This is educational/automated trading, not financial advice

## Morning Brief Format
- Lead with the most impactful info (biggest gains/losses/opportunities)
- Use conversational tone ("Your Pokemon card portfolio is up 12%")
- Include specific actionable suggestions
- Keep it under 300 words
- End with pending actions needing approval`;

const MORNING_BRIEF_PROMPT = `Generate a morning brief for this user's portfolio. Be conversational and specific.

Format:
1. Headline (one punchy line)
2. Portfolio summary (2-3 sentences)
3. Highlights (top 3-5 notable items)
4. Opportunities (if any detected)
5. Risk alerts (if any)
6. Pending strategy actions

Example tone: "Your Pokemon card portfolio is up 12%. I see a Charizard PSA 10 listing 15% below market - want me to bid?"`;

const OPPORTUNITY_DETECTION_PROMPT = `Analyze the current market data and user portfolio to detect opportunities.

Consider:
1. Assets priced significantly below recent averages
2. New listings in categories the user has shown interest in
3. Prediction markets with mispriced probabilities
4. RWA assets with strong value propositions
5. Correlation-based opportunities from user's existing positions

Return structured opportunities with confidence scores and suggested actions.`;

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get full portfolio context for the agent
 */
export const _getPortfolioContext = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    // Get positions
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get balances
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get RWA ownership
    const rwaOwnership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();

    // Get RWA asset details for owned assets
    const rwaAssets = await Promise.all(
      rwaOwnership.map(async (ownership) => {
        const asset = await ctx.db.get(ownership.assetId);
        return asset ? { ...ownership, asset } : null;
      })
    );

    // Get recent trades (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentTrades = await ctx.db
      .query("trades")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    // Get active strategies
    const strategies = await ctx.db
      .query("portfolioStrategies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .collect();

    // Get pending actions
    const pendingActions = await ctx.db
      .query("portfolioAgentActions")
      .withIndex("by_pending", (q) =>
        q.eq("userId", args.userId).eq("status", "pending_approval")
      )
      .collect();

    // Get recent signals
    const userSignals = await ctx.db
      .query("userSignals")
      .withIndex("by_user_unseen", (q) => q.eq("userId", args.userId).eq("seen", false))
      .take(10);

    const signalDetails = await Promise.all(
      userSignals.map(async (us) => {
        const signal = await ctx.db.get(us.signalId);
        return signal ? { ...us, signal } : null;
      })
    );

    // Calculate portfolio metrics
    const totalPositionValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice,
      0
    );
    const totalRwaValue = rwaAssets
      .filter((a) => a !== null)
      .reduce((sum, a) => sum + a!.shares * (a!.asset?.pricePerShare ?? 0), 0);

    const usdBalance = balances.find(
      (b) => b.assetType === "usd" && b.assetId === "USD"
    );

    const totalValue = totalPositionValue + totalRwaValue + (usdBalance?.available ?? 0);
    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    return {
      user: user ? {
        displayName: user.displayName ?? user.username ?? "User",
        kycTier: user.kycTier,
      } : null,
      portfolio: {
        totalValue,
        cashBalance: usdBalance?.available ?? 0,
        totalPositionValue,
        totalRwaValue,
        totalUnrealizedPnL,
        pnlPercent: totalPositionValue > 0
          ? (totalUnrealizedPnL / (totalPositionValue - totalUnrealizedPnL)) * 100
          : 0,
      },
      positions: positions.map((p) => ({
        id: p._id,
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
      rwaHoldings: rwaAssets.filter((a) => a !== null).map((a) => ({
        assetId: a!.assetId,
        name: a!.asset?.name ?? "Unknown",
        type: a!.asset?.type ?? "other",
        shares: a!.shares,
        pricePerShare: a!.asset?.pricePerShare ?? 0,
        value: a!.shares * (a!.asset?.pricePerShare ?? 0),
        allocation: totalValue > 0
          ? ((a!.shares * (a!.asset?.pricePerShare ?? 0)) / totalValue) * 100
          : 0,
      })),
      recentTrades: recentTrades.filter((t) => t.executedAt >= sevenDaysAgo).map((t) => ({
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        executedAt: t.executedAt,
      })),
      activeStrategies: strategies.map((s) => ({
        id: s._id,
        type: s.type,
        name: s.name,
        lastExecutedAt: s.lastExecutedAt,
        nextExecutionAt: s.nextExecutionAt,
        executionCount: s.executionCount,
        totalValueExecuted: s.totalValueExecuted,
      })),
      pendingActions: pendingActions.map((a) => ({
        id: a._id,
        type: a.type,
        title: a.title,
        description: a.description,
        orderDetails: a.orderDetails,
        createdAt: a.createdAt,
      })),
      unseenSignals: signalDetails.filter((s) => s !== null).map((s) => ({
        title: s!.signal?.title ?? "",
        type: s!.signal?.type ?? "",
        urgency: s!.signal?.urgency ?? "low",
        confidence: s!.signal?.confidence ?? 0,
        relevanceScore: s!.relevanceScore,
      })),
    };
  },
});

/**
 * Get agent configuration for a user
 */
export const _getAgentConfig = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("portfolioAgentConfigs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get strategies due for execution
 */
export const _getStrategiesDueForExecution = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const strategies = await ctx.db
      .query("portfolioStrategies")
      .withIndex("by_next_execution", (q) => q.eq("status", "active"))
      .collect();

    return strategies.filter(
      (s) => s.nextExecutionAt && s.nextExecutionAt <= now
    );
  },
});

/**
 * Get active markets for opportunity detection
 */
export const _getActiveMarketsForOpportunities = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get user's interests from signal preferences
    const prefs = await ctx.db
      .query("userSignalPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // Get open prediction markets with high volume
    const openEvents = await ctx.db
      .query("predictionEvents")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(50);

    const markets: Array<{
      ticker: string;
      title: string;
      probability: number;
      volume: number;
      closeTime: number;
    }> = [];

    for (const event of openEvents) {
      const eventMarkets = await ctx.db
        .query("predictionMarkets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();

      for (const market of eventMarkets) {
        markets.push({
          ticker: market.ticker,
          title: event.title,
          probability: market.probability,
          volume: market.yesVolume + market.noVolume,
          closeTime: event.closeTime,
        });
      }
    }

    // Get active RWA listings
    const rwaListings = await ctx.db
      .query("rwaListings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(20);

    const rwaDetails = await Promise.all(
      rwaListings.map(async (listing) => {
        const asset = await ctx.db.get(listing.assetId);
        return asset ? { listing, asset } : null;
      })
    );

    return {
      predictionMarkets: markets.sort((a, b) => b.volume - a.volume).slice(0, 20),
      rwaListings: rwaDetails.filter((r) => r !== null).map((r) => ({
        listingId: r!.listing._id,
        assetName: r!.asset.name,
        assetType: r!.asset.type,
        pricePerShare: r!.listing.pricePerShare,
        availableShares: r!.listing.availableShares,
        grade: r!.asset.grade,
        gradingCompany: r!.asset.gradingCompany,
      })),
      userInterests: prefs?.interests ?? [],
    };
  },
});

// ============================================================================
// INTERNAL MUTATIONS
// ============================================================================

/**
 * Create or update portfolio agent config
 */
export const _upsertConfig = internalMutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
    riskTolerance: v.union(
      v.literal("conservative"),
      v.literal("moderate"),
      v.literal("aggressive")
    ),
    maxDailyTradeAmount: v.number(),
    maxPositionSize: v.number(),
    autoExecute: v.boolean(),
    requireConfirmationAbove: v.number(),
    allowedAssetClasses: v.array(v.union(
      v.literal("prediction"),
      v.literal("rwa"),
      v.literal("crypto")
    )),
    allowedStrategies: v.array(v.union(
      v.literal("dca"),
      v.literal("rebalance"),
      v.literal("stop_loss"),
      v.literal("take_profit"),
      v.literal("opportunistic_buy")
    )),
    morningBriefEnabled: v.boolean(),
    morningBriefTime: v.string(),
    timezone: v.string(),
    notifyOnExecution: v.boolean(),
    notifyOnOpportunity: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("portfolioAgentConfigs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("portfolioAgentConfigs", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Create a portfolio strategy
 */
export const _createStrategy = internalMutation({
  args: {
    userId: v.id("users"),
    configId: v.id("portfolioAgentConfigs"),
    type: v.union(
      v.literal("dca"),
      v.literal("rebalance"),
      v.literal("stop_loss"),
      v.literal("take_profit"),
      v.literal("opportunistic_buy")
    ),
    name: v.string(),
    description: v.optional(v.string()),
    dcaAmount: v.optional(v.number()),
    dcaInterval: v.optional(v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly")
    )),
    dcaTargetSymbol: v.optional(v.string()),
    dcaTargetSide: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("buy"))),
    dcaTotalBudget: v.optional(v.number()),
    rebalanceTargetAllocations: v.optional(v.array(v.object({
      symbol: v.string(),
      assetClass: v.string(),
      targetPercent: v.number(),
      tolerance: v.number(),
    }))),
    rebalanceFrequency: v.optional(v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("threshold_only")
    )),
    triggerSymbol: v.optional(v.string()),
    triggerSide: v.optional(v.union(v.literal("long"), v.literal("short"))),
    triggerPrice: v.optional(v.number()),
    triggerType: v.optional(v.union(
      v.literal("absolute"),
      v.literal("percent_from_entry"),
      v.literal("trailing_percent")
    )),
    triggerValue: v.optional(v.number()),
    actionOnTrigger: v.optional(v.union(
      v.literal("sell_all"),
      v.literal("sell_half"),
      v.literal("sell_quarter"),
      v.literal("notify_only")
    )),
    opportunitySymbol: v.optional(v.string()),
    opportunityMaxPrice: v.optional(v.number()),
    opportunityBudget: v.optional(v.number()),
    opportunityConditions: v.optional(v.string()),
    nextExecutionAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("portfolioStrategies", {
      ...args,
      status: "active",
      dcaSpentSoFar: 0,
      executionCount: 0,
      totalValueExecuted: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Record an agent action
 */
export const _recordAction = internalMutation({
  args: {
    userId: v.id("users"),
    strategyId: v.optional(v.id("portfolioStrategies")),
    type: v.union(
      v.literal("order_placed"),
      v.literal("order_proposed"),
      v.literal("rebalance_executed"),
      v.literal("stop_loss_triggered"),
      v.literal("take_profit_triggered"),
      v.literal("opportunity_detected"),
      v.literal("dca_executed"),
      v.literal("alert_sent"),
      v.literal("morning_brief_sent")
    ),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("executed"),
      v.literal("failed"),
      v.literal("expired")
    ),
    title: v.string(),
    description: v.string(),
    reasoning: v.optional(v.string()),
    orderDetails: v.optional(v.object({
      symbol: v.string(),
      side: v.string(),
      quantity: v.number(),
      price: v.optional(v.number()),
      estimatedCost: v.number(),
      assetClass: v.string(),
    })),
    triggerContext: v.optional(v.object({
      signalIds: v.optional(v.array(v.string())),
      marketData: v.optional(v.any()),
      portfolioSnapshot: v.optional(v.any()),
    })),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("portfolioAgentActions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Store a morning brief
 */
export const _storeMorningBrief = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    portfolioSummary: v.object({
      totalValue: v.number(),
      dailyChange: v.number(),
      dailyChangePercent: v.number(),
      weeklyChange: v.number(),
      weeklyChangePercent: v.number(),
      topGainer: v.optional(v.object({
        symbol: v.string(),
        changePercent: v.number(),
      })),
      topLoser: v.optional(v.object({
        symbol: v.string(),
        changePercent: v.number(),
      })),
    }),
    headline: v.string(),
    summary: v.string(),
    highlights: v.array(v.object({
      type: v.union(
        v.literal("gain"),
        v.literal("loss"),
        v.literal("opportunity"),
        v.literal("risk"),
        v.literal("action_needed"),
        v.literal("market_event")
      ),
      title: v.string(),
      description: v.string(),
      actionable: v.boolean(),
      suggestedAction: v.optional(v.string()),
    })),
    opportunities: v.array(v.object({
      symbol: v.string(),
      assetClass: v.string(),
      description: v.string(),
      confidence: v.number(),
      estimatedUpside: v.optional(v.number()),
      suggestedAction: v.string(),
    })),
    strategyReport: v.optional(v.object({
      executedCount: v.number(),
      pendingCount: v.number(),
      totalValueTraded: v.number(),
      strategyNotes: v.array(v.string()),
    })),
    riskAlerts: v.array(v.object({
      severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      title: v.string(),
      description: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("morningBriefs", {
      ...args,
      status: "ready",
      generatedAt: now,
      createdAt: now,
    });
  },
});

/**
 * Update strategy execution status
 */
export const _updateStrategyExecution = internalMutation({
  args: {
    strategyId: v.id("portfolioStrategies"),
    lastExecutedAt: v.number(),
    nextExecutionAt: v.optional(v.number()),
    executionCount: v.number(),
    totalValueExecuted: v.number(),
    dcaSpentSoFar: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    )),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { strategyId, ...updates } = args;
    await ctx.db.patch(strategyId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Approve or reject a pending action
 */
export const _resolveAction = internalMutation({
  args: {
    actionId: v.id("portfolioAgentActions"),
    resolution: v.union(v.literal("approved"), v.literal("rejected")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.resolution === "approved") {
      await ctx.db.patch(args.actionId, {
        status: "approved",
        approvedAt: now,
        approvedBy: "user",
      });
    } else {
      await ctx.db.patch(args.actionId, {
        status: "rejected",
        rejectedAt: now,
        rejectionReason: args.reason ?? "User rejected",
      });
    }
  },
});

// ============================================================================
// MAIN AGENT ACTIONS
// ============================================================================

/**
 * Generate morning brief for a user
 */
export const generateMorningBrief = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get portfolio context
    const portfolioContext = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getPortfolioContext,
      { userId: args.userId }
    );

    // Get market opportunities
    const marketData = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getActiveMarketsForOpportunities,
      { userId: args.userId }
    );

    // Get agent config
    const config = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getAgentConfig,
      { userId: args.userId }
    );

    if (!config?.morningBriefEnabled) {
      return { status: "skipped", reason: "morning_brief_disabled" };
    }

    // Build context for Claude
    const contextMessage = buildMorningBriefContext(portfolioContext, marketData);

    // Call Claude to generate the brief
    const response = await callClaude({
      system: PORTFOLIO_AGENT_SYSTEM_PROMPT + "\n\n" + MORNING_BRIEF_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
    });

    // Parse the AI response into structured brief
    const brief = parseMorningBriefResponse(response.content, portfolioContext);

    // Store the brief
    const briefId = await ctx.runMutation(
      internal.agents["portfolio-agent"]._storeMorningBrief,
      {
        userId: args.userId,
        date: new Date().toISOString().split("T")[0],
        ...brief,
      }
    );

    // Record action
    await ctx.runMutation(
      internal.agents["portfolio-agent"]._recordAction,
      {
        userId: args.userId,
        type: "morning_brief_sent",
        status: "executed",
        title: brief.headline,
        description: brief.summary,
      }
    );

    return {
      status: "generated",
      briefId,
      headline: brief.headline,
      opportunityCount: brief.opportunities.length,
      riskAlertCount: brief.riskAlerts.length,
    };
  },
});

/**
 * Execute a DCA strategy step
 */
export const executeDcaStep = action({
  args: {
    strategyId: v.id("portfolioStrategies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get strategy details
    const portfolioContext = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getPortfolioContext,
      { userId: args.userId }
    );

    const strategy = portfolioContext.activeStrategies.find(
      (s) => s.id === args.strategyId
    );

    if (!strategy) {
      return { status: "error", reason: "strategy_not_found" };
    }

    // Get config for limits
    const config = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getAgentConfig,
      { userId: args.userId }
    );

    if (!config?.isActive) {
      return { status: "skipped", reason: "agent_inactive" };
    }

    // Get the full strategy from DB to access DCA fields
    const strategies = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getStrategiesDueForExecution,
      {}
    );
    const fullStrategy = strategies.find((s) => s._id === args.strategyId);

    if (!fullStrategy || !fullStrategy.dcaAmount || !fullStrategy.dcaTargetSymbol) {
      return { status: "error", reason: "invalid_dca_config" };
    }

    // Check budget
    if (fullStrategy.dcaTotalBudget && (fullStrategy.dcaSpentSoFar ?? 0) >= fullStrategy.dcaTotalBudget) {
      await ctx.runMutation(
        internal.agents["portfolio-agent"]._updateStrategyExecution,
        {
          strategyId: args.strategyId,
          lastExecutedAt: Date.now(),
          executionCount: fullStrategy.executionCount + 1,
          totalValueExecuted: fullStrategy.totalValueExecuted,
          status: "completed",
        }
      );
      return { status: "completed", reason: "budget_exhausted" };
    }

    // Check if amount exceeds confirmation threshold
    const needsApproval = !config.autoExecute ||
      fullStrategy.dcaAmount > config.requireConfirmationAbove;

    if (needsApproval) {
      // Create pending approval action
      await ctx.runMutation(
        internal.agents["portfolio-agent"]._recordAction,
        {
          userId: args.userId,
          strategyId: args.strategyId,
          type: "order_proposed",
          status: "pending_approval",
          title: `DCA: Buy ${fullStrategy.dcaTargetSymbol}`,
          description: `Scheduled DCA purchase of $${fullStrategy.dcaAmount} in ${fullStrategy.dcaTargetSymbol}`,
          reasoning: `Automated DCA strategy "${fullStrategy.name}" - execution #${fullStrategy.executionCount + 1}`,
          orderDetails: {
            symbol: fullStrategy.dcaTargetSymbol,
            side: fullStrategy.dcaTargetSide ?? "buy",
            quantity: Math.floor(fullStrategy.dcaAmount / 1), // Will be calculated based on market price
            price: undefined,
            estimatedCost: fullStrategy.dcaAmount,
            assetClass: "prediction",
          },
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h expiry
        }
      );

      return { status: "pending_approval" };
    }

    // Auto-execute: record the execution
    const now = Date.now();
    const nextExecution = calculateNextExecution(fullStrategy.dcaInterval ?? "daily", now);

    await ctx.runMutation(
      internal.agents["portfolio-agent"]._recordAction,
      {
        userId: args.userId,
        strategyId: args.strategyId,
        type: "dca_executed",
        status: "executed",
        title: `DCA: Bought ${fullStrategy.dcaTargetSymbol}`,
        description: `Auto-executed DCA purchase of $${fullStrategy.dcaAmount} in ${fullStrategy.dcaTargetSymbol}`,
        reasoning: `Automated DCA strategy "${fullStrategy.name}" - pre-approved execution`,
        orderDetails: {
          symbol: fullStrategy.dcaTargetSymbol,
          side: fullStrategy.dcaTargetSide ?? "buy",
          quantity: Math.floor(fullStrategy.dcaAmount / 1),
          estimatedCost: fullStrategy.dcaAmount,
          assetClass: "prediction",
        },
      }
    );

    await ctx.runMutation(
      internal.agents["portfolio-agent"]._updateStrategyExecution,
      {
        strategyId: args.strategyId,
        lastExecutedAt: now,
        nextExecutionAt: nextExecution,
        executionCount: fullStrategy.executionCount + 1,
        totalValueExecuted: fullStrategy.totalValueExecuted + fullStrategy.dcaAmount,
        dcaSpentSoFar: (fullStrategy.dcaSpentSoFar ?? 0) + fullStrategy.dcaAmount,
      }
    );

    return {
      status: "executed",
      amount: fullStrategy.dcaAmount,
      symbol: fullStrategy.dcaTargetSymbol,
      nextExecution: new Date(nextExecution).toISOString(),
    };
  },
});

/**
 * Check stop-loss and take-profit triggers
 */
export const checkPriceTriggers = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const portfolioContext = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getPortfolioContext,
      { userId: args.userId }
    );

    const config = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getAgentConfig,
      { userId: args.userId }
    );

    if (!config?.isActive) {
      return { status: "skipped", reason: "agent_inactive" };
    }

    // Get all stop-loss and take-profit strategies
    const strategies = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getStrategiesDueForExecution,
      {}
    );

    const triggerStrategies = strategies.filter(
      (s) =>
        s.userId === args.userId &&
        (s.type === "stop_loss" || s.type === "take_profit") &&
        s.triggerSymbol
    );

    const triggered: Array<{ strategyId: string; type: string; symbol: string }> = [];

    for (const strategy of triggerStrategies) {
      const position = portfolioContext.positions.find(
        (p) => p.symbol === strategy.triggerSymbol
      );

      if (!position) continue;

      let shouldTrigger = false;

      if (strategy.type === "stop_loss" && strategy.triggerType === "percent_from_entry") {
        const lossPercent = ((position.avgPrice - position.currentPrice) / position.avgPrice) * 100;
        shouldTrigger = lossPercent >= (strategy.triggerValue ?? 10);
      } else if (strategy.type === "stop_loss" && strategy.triggerType === "absolute") {
        shouldTrigger = position.currentPrice <= (strategy.triggerPrice ?? 0);
      } else if (strategy.type === "take_profit" && strategy.triggerType === "percent_from_entry") {
        const gainPercent = ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100;
        shouldTrigger = gainPercent >= (strategy.triggerValue ?? 20);
      } else if (strategy.type === "take_profit" && strategy.triggerType === "absolute") {
        shouldTrigger = position.currentPrice >= (strategy.triggerPrice ?? Infinity);
      }

      if (shouldTrigger) {
        const actionType = strategy.type === "stop_loss"
          ? "stop_loss_triggered" as const
          : "take_profit_triggered" as const;

        const action = strategy.actionOnTrigger ?? "notify_only";
        const needsApproval = action === "notify_only" || !config.autoExecute;

        await ctx.runMutation(
          internal.agents["portfolio-agent"]._recordAction,
          {
            userId: args.userId,
            strategyId: strategy._id,
            type: actionType,
            status: needsApproval ? "pending_approval" : "executed",
            title: `${strategy.type === "stop_loss" ? "Stop-Loss" : "Take-Profit"} triggered: ${strategy.triggerSymbol}`,
            description: `${position.symbol} at $${position.currentPrice.toFixed(2)} (entry: $${position.avgPrice.toFixed(2)}, P&L: ${position.pnlPercent.toFixed(1)}%)`,
            reasoning: `Price trigger condition met for strategy "${strategy.name}"`,
            orderDetails: action !== "notify_only" ? {
              symbol: position.symbol,
              side: "sell",
              quantity: action === "sell_all" ? position.quantity
                : action === "sell_half" ? Math.floor(position.quantity / 2)
                : Math.floor(position.quantity / 4),
              price: position.currentPrice,
              estimatedCost: position.currentPrice * position.quantity,
              assetClass: position.assetClass,
            } : undefined,
          }
        );

        triggered.push({
          strategyId: strategy._id,
          type: strategy.type,
          symbol: strategy.triggerSymbol!,
        });
      }
    }

    return {
      status: "checked",
      positionsChecked: portfolioContext.positions.length,
      triggersChecked: triggerStrategies.length,
      triggered,
    };
  },
});

/**
 * Detect opportunities for a user
 */
export const detectOpportunities = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const portfolioContext = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getPortfolioContext,
      { userId: args.userId }
    );

    const marketData = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getActiveMarketsForOpportunities,
      { userId: args.userId }
    );

    const config = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getAgentConfig,
      { userId: args.userId }
    );

    if (!config?.isActive || !config.notifyOnOpportunity) {
      return { status: "skipped", reason: "opportunity_detection_disabled" };
    }

    // Build context for Claude
    const contextMessage = `
## User Portfolio
Total Value: $${portfolioContext.portfolio.totalValue.toFixed(2)}
Cash Available: $${portfolioContext.portfolio.cashBalance.toFixed(2)}
Risk Tolerance: ${config.riskTolerance}

### Current Positions
${portfolioContext.positions.map((p) =>
  `- ${p.symbol} (${p.assetClass}): ${p.quantity} @ $${p.currentPrice.toFixed(2)} (${p.pnlPercent.toFixed(1)}% P&L)`
).join("\n")}

### RWA Holdings
${portfolioContext.rwaHoldings.map((h) =>
  `- ${h.name} (${h.type}): ${h.shares} shares @ $${h.pricePerShare.toFixed(2)}`
).join("\n")}

### User Interests
${marketData.userInterests.join(", ") || "Not specified"}

## Available Markets
### Prediction Markets
${marketData.predictionMarkets.slice(0, 10).map((m) =>
  `- ${m.ticker}: "${m.title}" at ${(m.probability * 100).toFixed(0)}% probability (vol: ${m.volume})`
).join("\n")}

### RWA Listings
${marketData.rwaListings.slice(0, 10).map((l) =>
  `- ${l.assetName} (${l.assetType}): $${l.pricePerShare}/share, ${l.availableShares} available${l.grade ? `, Grade: ${l.grade}` : ""}`
).join("\n")}

## Recent Signals
${portfolioContext.unseenSignals.slice(0, 5).map((s) =>
  `- [${s.urgency.toUpperCase()}] ${s.title} (confidence: ${s.confidence}%)`
).join("\n")}

Detect the top 3 opportunities for this user, considering their portfolio, interests, and risk tolerance.`;

    const response = await callClaude({
      system: PORTFOLIO_AGENT_SYSTEM_PROMPT + "\n\n" + OPPORTUNITY_DETECTION_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
    });

    // Parse opportunities from response
    const opportunities = parseOpportunities(response.content);

    // Record opportunities as pending actions
    for (const opp of opportunities) {
      if (opp.confidence >= 70) {
        await ctx.runMutation(
          internal.agents["portfolio-agent"]._recordAction,
          {
            userId: args.userId,
            type: "opportunity_detected",
            status: "pending_approval",
            title: `Opportunity: ${opp.symbol}`,
            description: opp.description,
            reasoning: response.content,
            orderDetails: opp.suggestedOrder,
            expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12h expiry
          }
        );
      }
    }

    return {
      status: "detected",
      opportunities: opportunities.length,
      highConfidence: opportunities.filter((o) => o.confidence >= 70).length,
    };
  },
});

/**
 * Check rebalancing needs
 */
export const checkRebalancing = action({
  args: {
    userId: v.id("users"),
    strategyId: v.id("portfolioStrategies"),
  },
  handler: async (ctx, args) => {
    const portfolioContext = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getPortfolioContext,
      { userId: args.userId }
    );

    const config = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getAgentConfig,
      { userId: args.userId }
    );

    if (!config?.isActive) {
      return { status: "skipped", reason: "agent_inactive" };
    }

    const strategies = await ctx.runQuery(
      internal.agents["portfolio-agent"]._getStrategiesDueForExecution,
      {}
    );
    const strategy = strategies.find((s) => s._id === args.strategyId);

    if (!strategy || !strategy.rebalanceTargetAllocations) {
      return { status: "error", reason: "invalid_rebalance_config" };
    }

    // Calculate current allocations vs targets
    const deviations: Array<{
      symbol: string;
      currentPercent: number;
      targetPercent: number;
      deviation: number;
      action: "buy" | "sell";
      amount: number;
    }> = [];

    for (const target of strategy.rebalanceTargetAllocations) {
      const position = portfolioContext.positions.find((p) => p.symbol === target.symbol);
      const currentPercent = position?.allocation ?? 0;
      const deviation = currentPercent - target.targetPercent;

      if (Math.abs(deviation) > target.tolerance) {
        const totalValue = portfolioContext.portfolio.totalValue;
        const adjustmentAmount = Math.abs(deviation / 100) * totalValue;

        deviations.push({
          symbol: target.symbol,
          currentPercent,
          targetPercent: target.targetPercent,
          deviation,
          action: deviation > 0 ? "sell" : "buy",
          amount: adjustmentAmount,
        });
      }
    }

    if (deviations.length === 0) {
      // Update next execution time
      const now = Date.now();
      const nextExecution = calculateNextExecution(
        strategy.rebalanceFrequency ?? "weekly",
        now
      );

      await ctx.runMutation(
        internal.agents["portfolio-agent"]._updateStrategyExecution,
        {
          strategyId: args.strategyId,
          lastExecutedAt: now,
          nextExecutionAt: nextExecution,
          executionCount: strategy.executionCount + 1,
          totalValueExecuted: strategy.totalValueExecuted,
        }
      );

      return { status: "balanced", deviations: 0 };
    }

    // Create rebalance proposal
    const needsApproval = !config.autoExecute ||
      deviations.reduce((sum, d) => sum + d.amount, 0) > config.requireConfirmationAbove;

    for (const dev of deviations) {
      await ctx.runMutation(
        internal.agents["portfolio-agent"]._recordAction,
        {
          userId: args.userId,
          strategyId: args.strategyId,
          type: needsApproval ? "order_proposed" : "rebalance_executed",
          status: needsApproval ? "pending_approval" : "executed",
          title: `Rebalance: ${dev.action === "buy" ? "Buy" : "Sell"} ${dev.symbol}`,
          description: `${dev.symbol} is ${Math.abs(dev.deviation).toFixed(1)}% ${dev.deviation > 0 ? "over" : "under"} target. ${dev.action === "buy" ? "Buying" : "Selling"} ~$${dev.amount.toFixed(2)}`,
          reasoning: `Portfolio rebalancing: ${dev.symbol} at ${dev.currentPercent.toFixed(1)}% vs target ${dev.targetPercent}% (tolerance: ${strategy.rebalanceTargetAllocations?.find((t) => t.symbol === dev.symbol)?.tolerance ?? 5}%)`,
          orderDetails: {
            symbol: dev.symbol,
            side: dev.action,
            quantity: Math.floor(dev.amount / 1), // Placeholder - needs market price
            estimatedCost: dev.amount,
            assetClass: "prediction",
          },
        }
      );
    }

    return {
      status: needsApproval ? "pending_approval" : "executed",
      deviations: deviations.length,
      totalAdjustment: deviations.reduce((sum, d) => sum + d.amount, 0),
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildMorningBriefContext(
  portfolioContext: Awaited<ReturnType<typeof _getPortfolioContext.handler>>,
  marketData: Awaited<ReturnType<typeof _getActiveMarketsForOpportunities.handler>>
): string {
  const userName = portfolioContext.user?.displayName ?? "User";

  return `
## User: ${userName}

## Portfolio Summary
- Total Value: $${portfolioContext.portfolio.totalValue.toFixed(2)}
- Cash Balance: $${portfolioContext.portfolio.cashBalance.toFixed(2)}
- Positions Value: $${portfolioContext.portfolio.totalPositionValue.toFixed(2)}
- RWA Holdings Value: $${portfolioContext.portfolio.totalRwaValue.toFixed(2)}
- Unrealized P&L: $${portfolioContext.portfolio.totalUnrealizedPnL.toFixed(2)} (${portfolioContext.portfolio.pnlPercent.toFixed(1)}%)

## Current Positions
${portfolioContext.positions.map((p) =>
  `- ${p.symbol} (${p.assetClass}): ${p.quantity} units @ $${p.currentPrice.toFixed(2)} | P&L: ${p.pnlPercent.toFixed(1)}% ($${p.pnl.toFixed(2)}) | ${p.allocation.toFixed(1)}% allocation`
).join("\n") || "No positions"}

## RWA Holdings
${portfolioContext.rwaHoldings.map((h) =>
  `- ${h.name} (${h.type}): ${h.shares} shares @ $${h.pricePerShare.toFixed(2)} = $${h.value.toFixed(2)} | ${h.allocation.toFixed(1)}% allocation`
).join("\n") || "No RWA holdings"}

## Recent Trades (Last 7 Days)
${portfolioContext.recentTrades.map((t) =>
  `- ${t.side.toUpperCase()} ${t.quantity} ${t.symbol} @ $${t.price.toFixed(2)}`
).join("\n") || "No recent trades"}

## Active Strategies
${portfolioContext.activeStrategies.map((s) =>
  `- ${s.type}: "${s.name}" (executed ${s.executionCount}x, $${s.totalValueExecuted.toFixed(2)} total)`
).join("\n") || "No active strategies"}

## Pending Actions Requiring Approval
${portfolioContext.pendingActions.map((a) =>
  `- [${a.type}] ${a.title}: ${a.description}`
).join("\n") || "None"}

## New Signals
${portfolioContext.unseenSignals.map((s) =>
  `- [${s.urgency.toUpperCase()}/${s.type}] ${s.title} (confidence: ${s.confidence}%, relevance: ${s.relevanceScore}%)`
).join("\n") || "No new signals"}

## Market Opportunities
### Prediction Markets
${marketData.predictionMarkets.slice(0, 5).map((m) =>
  `- ${m.ticker}: ${(m.probability * 100).toFixed(0)}% probability`
).join("\n")}

### RWA Listings
${marketData.rwaListings.slice(0, 5).map((l) =>
  `- ${l.assetName} (${l.assetType}): $${l.pricePerShare}/share${l.grade ? ` [${l.gradingCompany} ${l.grade}]` : ""}`
).join("\n")}

Generate a morning brief for ${userName}. Be specific about their holdings and conversational in tone.`;
}

interface ClaudeResponse {
  content: string;
}

async function callClaude(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { content: "AI service unavailable." };
  }

  try {
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
        messages: params.messages,
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", await response.text());
      return { content: "Error generating response." };
    }

    const data = await response.json();
    const textContent = data.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("");

    return { content: textContent };
  } catch (error) {
    console.error("Error calling Claude:", error);
    return { content: "Error generating response." };
  }
}

function parseMorningBriefResponse(
  aiResponse: string,
  portfolioContext: Awaited<ReturnType<typeof _getPortfolioContext.handler>>
): {
  portfolioSummary: {
    totalValue: number;
    dailyChange: number;
    dailyChangePercent: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    topGainer?: { symbol: string; changePercent: number };
    topLoser?: { symbol: string; changePercent: number };
  };
  headline: string;
  summary: string;
  highlights: Array<{
    type: "gain" | "loss" | "opportunity" | "risk" | "action_needed" | "market_event";
    title: string;
    description: string;
    actionable: boolean;
    suggestedAction?: string;
  }>;
  opportunities: Array<{
    symbol: string;
    assetClass: string;
    description: string;
    confidence: number;
    estimatedUpside?: number;
    suggestedAction: string;
  }>;
  strategyReport?: {
    executedCount: number;
    pendingCount: number;
    totalValueTraded: number;
    strategyNotes: string[];
  };
  riskAlerts: Array<{
    severity: "low" | "medium" | "high";
    title: string;
    description: string;
  }>;
} {
  // Extract headline from first line
  const lines = aiResponse.split("\n").filter((l) => l.trim());
  const headline = lines[0]?.replace(/^[#*\s]+/, "").trim() ??
    `Portfolio: $${portfolioContext.portfolio.totalValue.toFixed(0)}`;

  // Calculate portfolio metrics
  const topGainer = portfolioContext.positions.reduce(
    (best, p) => (!best || p.pnlPercent > best.pnlPercent ? p : best),
    null as (typeof portfolioContext.positions)[0] | null
  );
  const topLoser = portfolioContext.positions.reduce(
    (worst, p) => (!worst || p.pnlPercent < worst.pnlPercent ? p : worst),
    null as (typeof portfolioContext.positions)[0] | null
  );

  // Build highlights from positions
  const highlights: Array<{
    type: "gain" | "loss" | "opportunity" | "risk" | "action_needed" | "market_event";
    title: string;
    description: string;
    actionable: boolean;
    suggestedAction?: string;
  }> = [];

  if (topGainer && topGainer.pnlPercent > 0) {
    highlights.push({
      type: "gain",
      title: `${topGainer.symbol} up ${topGainer.pnlPercent.toFixed(1)}%`,
      description: `Your ${topGainer.symbol} position is up $${topGainer.pnl.toFixed(2)}`,
      actionable: topGainer.pnlPercent > 20,
      suggestedAction: topGainer.pnlPercent > 20 ? "Consider taking partial profits" : undefined,
    });
  }

  if (topLoser && topLoser.pnlPercent < -5) {
    highlights.push({
      type: "loss",
      title: `${topLoser.symbol} down ${Math.abs(topLoser.pnlPercent).toFixed(1)}%`,
      description: `Your ${topLoser.symbol} position is down $${Math.abs(topLoser.pnl).toFixed(2)}`,
      actionable: topLoser.pnlPercent < -15,
      suggestedAction: topLoser.pnlPercent < -15 ? "Consider setting a stop-loss" : undefined,
    });
  }

  if (portfolioContext.pendingActions.length > 0) {
    highlights.push({
      type: "action_needed",
      title: `${portfolioContext.pendingActions.length} pending action(s)`,
      description: portfolioContext.pendingActions.map((a) => a.title).join(", "),
      actionable: true,
      suggestedAction: "Review and approve/reject pending actions",
    });
  }

  // Build risk alerts
  const riskAlerts: Array<{
    severity: "low" | "medium" | "high";
    title: string;
    description: string;
  }> = [];

  // Check for concentration risk
  const maxAllocation = Math.max(...portfolioContext.positions.map((p) => p.allocation), 0);
  if (maxAllocation > 40) {
    const concentrated = portfolioContext.positions.find((p) => p.allocation === maxAllocation);
    riskAlerts.push({
      severity: maxAllocation > 60 ? "high" : "medium",
      title: "Concentration risk",
      description: `${concentrated?.symbol ?? "Position"} is ${maxAllocation.toFixed(0)}% of your portfolio`,
    });
  }

  // Check for large unrealized losses
  if (portfolioContext.portfolio.pnlPercent < -10) {
    riskAlerts.push({
      severity: portfolioContext.portfolio.pnlPercent < -20 ? "high" : "medium",
      title: "Portfolio drawdown",
      description: `Overall portfolio is down ${Math.abs(portfolioContext.portfolio.pnlPercent).toFixed(1)}%`,
    });
  }

  return {
    portfolioSummary: {
      totalValue: portfolioContext.portfolio.totalValue,
      dailyChange: portfolioContext.portfolio.totalUnrealizedPnL * 0.1, // Approximation
      dailyChangePercent: portfolioContext.portfolio.pnlPercent * 0.1,
      weeklyChange: portfolioContext.portfolio.totalUnrealizedPnL * 0.3,
      weeklyChangePercent: portfolioContext.portfolio.pnlPercent * 0.3,
      topGainer: topGainer && topGainer.pnlPercent > 0
        ? { symbol: topGainer.symbol, changePercent: topGainer.pnlPercent }
        : undefined,
      topLoser: topLoser && topLoser.pnlPercent < 0
        ? { symbol: topLoser.symbol, changePercent: topLoser.pnlPercent }
        : undefined,
    },
    headline,
    summary: aiResponse.substring(0, 500),
    highlights,
    opportunities: [], // Parsed from AI response in production
    strategyReport: portfolioContext.activeStrategies.length > 0 ? {
      executedCount: portfolioContext.activeStrategies.reduce((sum, s) => sum + s.executionCount, 0),
      pendingCount: portfolioContext.pendingActions.length,
      totalValueTraded: portfolioContext.activeStrategies.reduce((sum, s) => sum + s.totalValueExecuted, 0),
      strategyNotes: portfolioContext.activeStrategies.map(
        (s) => `${s.type} "${s.name}": ${s.executionCount} executions`
      ),
    } : undefined,
    riskAlerts,
  };
}

function parseOpportunities(aiResponse: string): Array<{
  symbol: string;
  description: string;
  confidence: number;
  suggestedOrder?: {
    symbol: string;
    side: string;
    quantity: number;
    price?: number;
    estimatedCost: number;
    assetClass: string;
  };
}> {
  // Simple parser - in production this would use structured output
  const opportunities: Array<{
    symbol: string;
    description: string;
    confidence: number;
    suggestedOrder?: {
      symbol: string;
      side: string;
      quantity: number;
      price?: number;
      estimatedCost: number;
      assetClass: string;
    };
  }> = [];

  // Extract opportunities from the AI response text
  const sections = aiResponse.split(/\d+\.\s+/);
  for (const section of sections.slice(1)) {
    const lines = section.split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      opportunities.push({
        symbol: lines[0]?.match(/[A-Z0-9_-]+/)?.[0] ?? "UNKNOWN",
        description: lines.join(" ").substring(0, 300),
        confidence: 60 + Math.random() * 30, // Placeholder - would parse from AI
      });
    }
  }

  return opportunities.slice(0, 5);
}

function calculateNextExecution(
  interval: "hourly" | "daily" | "weekly" | "biweekly" | "monthly" | "threshold_only",
  fromTime: number
): number {
  switch (interval) {
    case "hourly":
      return fromTime + 60 * 60 * 1000;
    case "daily":
      return fromTime + 24 * 60 * 60 * 1000;
    case "weekly":
      return fromTime + 7 * 24 * 60 * 60 * 1000;
    case "biweekly":
      return fromTime + 14 * 24 * 60 * 60 * 1000;
    case "monthly":
      return fromTime + 30 * 24 * 60 * 60 * 1000;
    case "threshold_only":
      return fromTime + 60 * 60 * 1000; // Check hourly for threshold-based
    default:
      return fromTime + 24 * 60 * 60 * 1000;
  }
}
