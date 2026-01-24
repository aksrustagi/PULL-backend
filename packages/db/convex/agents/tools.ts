import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Agent Tools for PULL
 * Provides tools that AI agents can use to interact with the platform
 */

// ============================================================================
// TOOL DEFINITIONS (for Claude Tool Use)
// ============================================================================

export const AGENT_TOOLS = {
  getPortfolio: {
    name: "getPortfolio",
    description:
      "Fetch the user's portfolio including all positions, balances, and performance metrics. Use this to understand the user's current holdings and investment status.",
    input_schema: {
      type: "object" as const,
      properties: {
        assetClass: {
          type: "string",
          enum: ["crypto", "prediction", "rwa"],
          description: "Optional filter for specific asset class",
        },
      },
      required: [],
    },
  },

  getMarketData: {
    name: "getMarketData",
    description:
      "Fetch current market data for a specific ticker/symbol. Returns price, volume, and other market metrics.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: {
          type: "string",
          description: "The market ticker/symbol to look up",
        },
        assetClass: {
          type: "string",
          enum: ["crypto", "prediction", "rwa"],
          description: "The asset class of the ticker",
        },
      },
      required: ["ticker"],
    },
  },

  placeOrder: {
    name: "placeOrder",
    description:
      "Create a trading order. IMPORTANT: Always confirm with the user before executing. Returns order details for user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "The symbol/ticker to trade",
        },
        side: {
          type: "string",
          enum: ["buy", "sell"],
          description: "Whether to buy or sell",
        },
        quantity: {
          type: "number",
          description: "Number of units to trade",
        },
        orderType: {
          type: "string",
          enum: ["market", "limit"],
          description: "Order type - market executes immediately, limit waits for price",
        },
        price: {
          type: "number",
          description: "Limit price (required for limit orders)",
        },
        assetClass: {
          type: "string",
          enum: ["crypto", "prediction", "rwa"],
          description: "The asset class",
        },
      },
      required: ["symbol", "side", "quantity", "orderType", "assetClass"],
    },
  },

  searchEmails: {
    name: "searchEmails",
    description:
      "Search through the user's emails. Returns matching emails with summaries.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query for email subjects and content",
        },
        category: {
          type: "string",
          description: "Filter by triage category",
        },
        status: {
          type: "string",
          enum: ["unread", "read", "archived"],
          description: "Filter by email status",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 10)",
        },
      },
      required: ["query"],
    },
  },

  getNews: {
    name: "getNews",
    description:
      "Fetch relevant news articles for a given topic or market. Returns headlines and summaries.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "Topic or ticker to get news for",
        },
        category: {
          type: "string",
          enum: ["markets", "crypto", "politics", "sports", "tech", "general"],
          description: "News category filter",
        },
        limit: {
          type: "number",
          description: "Number of articles to fetch (default 5)",
        },
      },
      required: ["topic"],
    },
  },

  getPosition: {
    name: "getPosition",
    description: "Get details about a specific position the user holds.",
    input_schema: {
      type: "object" as const,
      properties: {
        positionId: {
          type: "string",
          description: "The ID of the position to look up",
        },
        symbol: {
          type: "string",
          description: "Alternative: look up by symbol instead of ID",
        },
      },
      required: [],
    },
  },

  getOpenOrders: {
    name: "getOpenOrders",
    description: "Get all open/pending orders for the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "Optional filter by symbol",
        },
      },
      required: [],
    },
  },

  cancelOrder: {
    name: "cancelOrder",
    description: "Cancel an open order. Requires user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: {
          type: "string",
          description: "The ID of the order to cancel",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation",
        },
      },
      required: ["orderId"],
    },
  },

  getPredictionMarket: {
    name: "getPredictionMarket",
    description:
      "Get details about a prediction market including probabilities and trading activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: {
          type: "string",
          description: "The prediction market ticker",
        },
        eventId: {
          type: "string",
          description: "Alternative: the event ID",
        },
      },
      required: [],
    },
  },

  getRWAAsset: {
    name: "getRWAAsset",
    description: "Get details about a real-world asset (collectible, card, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        assetId: {
          type: "string",
          description: "The RWA asset ID",
        },
      },
      required: ["assetId"],
    },
  },

  getAccountBalance: {
    name: "getAccountBalance",
    description: "Get the user's account balances across all asset types.",
    input_schema: {
      type: "object" as const,
      properties: {
        assetType: {
          type: "string",
          enum: ["usd", "crypto", "points"],
          description: "Optional filter by asset type",
        },
      },
      required: [],
    },
  },

  composeEmail: {
    name: "composeEmail",
    description: "Draft an email for the user. Returns the draft for review before sending.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient email addresses",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body content",
        },
        replyToId: {
          type: "string",
          description: "ID of email being replied to",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
};

// ============================================================================
// INTERNAL QUERIES (used by tool handlers)
// ============================================================================

/**
 * Get user portfolio data
 */
export const _getPortfolio = internalQuery({
  args: {
    userId: v.id("users"),
    assetClass: v.optional(
      v.union(v.literal("crypto"), v.literal("prediction"), v.literal("rwa"))
    ),
  },
  handler: async (ctx, args) => {
    let positions = await ctx.db
      .query("positions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (args.assetClass) {
      positions = positions.filter((p) => p.assetClass === args.assetClass);
    }

    // Get balances
    const balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Calculate totals
    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice,
      0
    );
    const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalUnrealizedPnL = positions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0
    );

    const usdBalance = balances.find(
      (b) => b.assetType === "usd" && b.assetId === "USD"
    );

    return {
      positions: positions.map((p) => ({
        id: p._id,
        symbol: p.symbol,
        assetClass: p.assetClass,
        side: p.side,
        quantity: p.quantity,
        avgEntryPrice: p.averageEntryPrice,
        currentPrice: p.currentPrice,
        marketValue: p.quantity * p.currentPrice,
        costBasis: p.costBasis,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPercent:
          p.costBasis > 0 ? (p.unrealizedPnL / p.costBasis) * 100 : 0,
        allocation: totalValue > 0 ? (p.quantity * p.currentPrice) / totalValue : 0,
      })),
      summary: {
        totalPortfolioValue: totalValue,
        totalCost,
        totalUnrealizedPnL,
        totalPnLPercent: totalCost > 0 ? (totalUnrealizedPnL / totalCost) * 100 : 0,
        cashBalance: usdBalance?.available ?? 0,
        buyingPower: usdBalance?.available ?? 0,
        positionCount: positions.length,
      },
      balances: balances.map((b) => ({
        assetType: b.assetType,
        symbol: b.symbol,
        available: b.available,
        held: b.held,
        total: b.available + b.held,
      })),
    };
  },
});

/**
 * Get market data
 */
export const _getMarketData = internalQuery({
  args: {
    ticker: v.string(),
    assetClass: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try prediction markets first
    const market = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (market) {
      const event = await ctx.db.get(market.eventId);
      return {
        type: "prediction",
        ticker: market.ticker,
        name: market.name,
        eventTitle: event?.title,
        probability: market.probability,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume: market.yesVolume + market.noVolume,
        openInterest: market.openInterest,
        status: event?.status,
        closeTime: event?.closeTime,
      };
    }

    // Try prediction events
    const event = await ctx.db
      .query("predictionEvents")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .unique();

    if (event) {
      const markets = await ctx.db
        .query("predictionMarkets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();

      return {
        type: "prediction_event",
        ticker: event.ticker,
        title: event.title,
        description: event.description,
        category: event.category,
        status: event.status,
        closeTime: event.closeTime,
        volume: event.volume,
        openInterest: event.openInterest,
        markets: markets.map((m) => ({
          ticker: m.ticker,
          name: m.name,
          probability: m.probability,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
        })),
      };
    }

    // For crypto/other assets, return placeholder
    // In production, this would call external APIs
    return {
      type: args.assetClass ?? "unknown",
      ticker: args.ticker,
      message: "Market data not available in local database. Would fetch from external source.",
    };
  },
});

/**
 * Get position details
 */
export const _getPosition = internalQuery({
  args: {
    userId: v.id("users"),
    positionId: v.optional(v.id("positions")),
    symbol: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.positionId) {
      const position = await ctx.db.get(args.positionId);
      if (position && position.userId === args.userId) {
        return position;
      }
      return null;
    }

    if (args.symbol) {
      const positions = await ctx.db
        .query("positions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      return positions.find((p) => p.symbol === args.symbol) ?? null;
    }

    return null;
  },
});

/**
 * Get open orders
 */
export const _getOpenOrders = internalQuery({
  args: {
    userId: v.id("users"),
    symbol: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    orders = orders.filter((o) =>
      ["pending", "submitted", "accepted", "partial_fill"].includes(o.status)
    );

    if (args.symbol) {
      orders = orders.filter((o) => o.symbol === args.symbol);
    }

    return orders.map((o) => ({
      id: o._id,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      quantity: o.quantity,
      filledQuantity: o.filledQuantity,
      remainingQuantity: o.remainingQuantity,
      price: o.price,
      createdAt: o.createdAt,
    }));
  },
});

/**
 * Search emails
 */
export const _searchEmails = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchQuery = ctx.db
      .query("emails")
      .withSearchIndex("search_emails", (q) => {
        let search = q.search("subject", args.query).eq("userId", args.userId);
        if (args.status) {
          search = search.eq("status", args.status as "unread");
        }
        if (args.category) {
          search = search.eq("triageCategory", args.category);
        }
        return search;
      });

    const emails = await searchQuery.take(args.limit ?? 10);

    return emails.map((e) => ({
      id: e._id,
      subject: e.subject,
      from: e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail,
      snippet: e.snippet,
      status: e.status,
      receivedAt: e.receivedAt,
      triagePriority: e.triagePriority,
      triageCategory: e.triageCategory,
      triageSummary: e.triageSummary,
      actionRequired: e.triageActionRequired,
    }));
  },
});

/**
 * Get account balances
 */
export const _getBalances = internalQuery({
  args: {
    userId: v.id("users"),
    assetType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let balances = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (args.assetType) {
      balances = balances.filter((b) => b.assetType === args.assetType);
    }

    return balances.map((b) => ({
      assetType: b.assetType,
      assetId: b.assetId,
      symbol: b.symbol,
      available: b.available,
      held: b.held,
      pending: b.pending,
      total: b.available + b.held + b.pending,
    }));
  },
});

/**
 * Get prediction market details
 */
export const _getPredictionMarket = internalQuery({
  args: {
    ticker: v.optional(v.string()),
    eventId: v.optional(v.id("predictionEvents")),
  },
  handler: async (ctx, args) => {
    let event = null;

    if (args.eventId) {
      event = await ctx.db.get(args.eventId);
    } else if (args.ticker) {
      event = await ctx.db
        .query("predictionEvents")
        .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker!))
        .unique();
    }

    if (!event) return null;

    const markets = await ctx.db
      .query("predictionMarkets")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    return {
      event: {
        id: event._id,
        ticker: event.ticker,
        title: event.title,
        description: event.description,
        category: event.category,
        status: event.status,
        openTime: event.openTime,
        closeTime: event.closeTime,
        volume: event.volume,
        openInterest: event.openInterest,
      },
      markets: markets.map((m) => ({
        id: m._id,
        ticker: m.ticker,
        name: m.name,
        probability: m.probability,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        yesVolume: m.yesVolume,
        noVolume: m.noVolume,
        openInterest: m.openInterest,
      })),
    };
  },
});

/**
 * Get RWA asset details
 */
export const _getRWAAsset = internalQuery({
  args: {
    assetId: v.id("rwaAssets"),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;

    const listings = await ctx.db
      .query("rwaListings")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .collect();

    const activeListing = listings.find((l) => l.status === "active");

    return {
      id: asset._id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      status: asset.status,
      totalShares: asset.totalShares,
      availableShares: asset.availableShares,
      pricePerShare: asset.pricePerShare,
      gradingCompany: asset.gradingCompany,
      grade: asset.grade,
      cardName: asset.cardName,
      setName: asset.setName,
      rarity: asset.rarity,
      year: asset.year,
      activeListing: activeListing
        ? {
            listingType: activeListing.listingType,
            pricePerShare: activeListing.pricePerShare,
            availableShares: activeListing.availableShares,
            auctionEndTime: activeListing.auctionEndTime,
          }
        : null,
    };
  },
});

// ============================================================================
// INTERNAL MUTATIONS (for tool actions)
// ============================================================================

/**
 * Create order (internal - used by agents)
 */
export const _createOrder = internalMutation({
  args: {
    userId: v.id("users"),
    symbol: v.string(),
    assetClass: v.union(
      v.literal("crypto"),
      v.literal("prediction"),
      v.literal("rwa")
    ),
    side: v.union(v.literal("buy"), v.literal("sell")),
    type: v.union(v.literal("market"), v.literal("limit")),
    quantity: v.number(),
    price: v.optional(v.number()),
    agentGenerated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate
    if (args.quantity <= 0) {
      return { success: false, error: "Quantity must be positive" };
    }

    if (args.type === "limit" && !args.price) {
      return { success: false, error: "Limit orders require a price" };
    }

    // Check buying power for buys
    if (args.side === "buy") {
      const priceToUse = args.price ?? 0;
      const estimatedCost = args.quantity * priceToUse;

      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", args.userId).eq("assetType", "usd").eq("assetId", "USD")
        )
        .unique();

      if (!balance || balance.available < estimatedCost) {
        return {
          success: false,
          error: `Insufficient buying power. Available: $${balance?.available ?? 0}, Required: $${estimatedCost}`,
        };
      }
    }

    // For sells, check position
    if (args.side === "sell") {
      const position = await ctx.db
        .query("positions")
        .withIndex("by_user_asset", (q) =>
          q
            .eq("userId", args.userId)
            .eq("assetClass", args.assetClass)
            .eq("symbol", args.symbol)
        )
        .unique();

      if (!position || position.quantity < args.quantity) {
        return {
          success: false,
          error: `Insufficient position. Owned: ${position?.quantity ?? 0}, Attempting to sell: ${args.quantity}`,
        };
      }
    }

    // Create the order (pending confirmation)
    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      assetClass: args.assetClass,
      symbol: args.symbol,
      side: args.side,
      type: args.type,
      status: "pending",
      quantity: args.quantity,
      filledQuantity: 0,
      remainingQuantity: args.quantity,
      price: args.price,
      timeInForce: "gtc",
      fees: 0,
      feeCurrency: "USD",
      metadata: { agentGenerated: args.agentGenerated ?? false },
      createdAt: now,
      updatedAt: now,
    });

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "order.agent_created",
      resourceType: "orders",
      resourceId: orderId,
      metadata: {
        symbol: args.symbol,
        side: args.side,
        quantity: args.quantity,
        price: args.price,
        agentGenerated: true,
      },
      timestamp: now,
    });

    return {
      success: true,
      orderId,
      order: {
        id: orderId,
        symbol: args.symbol,
        side: args.side,
        type: args.type,
        quantity: args.quantity,
        price: args.price,
        estimatedValue:
          args.side === "buy"
            ? args.quantity * (args.price ?? 0)
            : args.quantity * (args.price ?? 0),
        status: "pending",
        requiresConfirmation: true,
      },
    };
  },
});

/**
 * Cancel order (internal)
 */
export const _cancelOrder = internalMutation({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.userId !== args.userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!["pending", "submitted", "accepted", "partial_fill"].includes(order.status)) {
      return { success: false, error: `Order cannot be cancelled. Status: ${order.status}` };
    }

    const now = Date.now();

    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      metadata: {
        ...order.metadata,
        cancellationReason: args.reason ?? "Cancelled by agent",
      },
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "order.agent_cancelled",
      resourceType: "orders",
      resourceId: args.orderId,
      metadata: { reason: args.reason },
      timestamp: now,
    });

    return { success: true, orderId: args.orderId };
  },
});

// ============================================================================
// TOOL EXECUTION ACTION
// ============================================================================

/**
 * Execute a tool call from an AI agent
 */
export const executeTool = action({
  args: {
    userId: v.id("users"),
    toolName: v.string(),
    toolInput: v.any(),
  },
  handler: async (ctx, args) => {
    const { userId, toolName, toolInput } = args;

    switch (toolName) {
      case "getPortfolio":
        return await ctx.runQuery(internal.agents.tools._getPortfolio, {
          userId,
          assetClass: toolInput.assetClass,
        });

      case "getMarketData":
        return await ctx.runQuery(internal.agents.tools._getMarketData, {
          ticker: toolInput.ticker,
          assetClass: toolInput.assetClass,
        });

      case "getPosition":
        return await ctx.runQuery(internal.agents.tools._getPosition, {
          userId,
          positionId: toolInput.positionId,
          symbol: toolInput.symbol,
        });

      case "getOpenOrders":
        return await ctx.runQuery(internal.agents.tools._getOpenOrders, {
          userId,
          symbol: toolInput.symbol,
        });

      case "searchEmails":
        return await ctx.runQuery(internal.agents.tools._searchEmails, {
          userId,
          query: toolInput.query,
          category: toolInput.category,
          status: toolInput.status,
          limit: toolInput.limit,
        });

      case "getAccountBalance":
        return await ctx.runQuery(internal.agents.tools._getBalances, {
          userId,
          assetType: toolInput.assetType,
        });

      case "getPredictionMarket":
        return await ctx.runQuery(internal.agents.tools._getPredictionMarket, {
          ticker: toolInput.ticker,
          eventId: toolInput.eventId,
        });

      case "getRWAAsset":
        return await ctx.runQuery(internal.agents.tools._getRWAAsset, {
          assetId: toolInput.assetId,
        });

      case "placeOrder":
        return await ctx.runMutation(internal.agents.tools._createOrder, {
          userId,
          symbol: toolInput.symbol,
          assetClass: toolInput.assetClass,
          side: toolInput.side,
          type: toolInput.orderType,
          quantity: toolInput.quantity,
          price: toolInput.price,
          agentGenerated: true,
        });

      case "cancelOrder":
        return await ctx.runMutation(internal.agents.tools._cancelOrder, {
          userId,
          orderId: toolInput.orderId,
          reason: toolInput.reason,
        });

      case "getNews":
        // News fetching would call external API
        return {
          topic: toolInput.topic,
          articles: [
            {
              title: `Latest news on ${toolInput.topic}`,
              summary: "This would fetch real news from external APIs in production.",
              source: "News API",
              publishedAt: new Date().toISOString(),
            },
          ],
          note: "In production, this would fetch from news aggregation APIs",
        };

      case "composeEmail":
        // Return draft for user review
        return {
          draft: {
            to: toolInput.to,
            subject: toolInput.subject,
            body: toolInput.body,
            replyToId: toolInput.replyToId,
          },
          requiresConfirmation: true,
          message: "Email draft created. Please review before sending.",
        };

      default:
        return {
          error: `Unknown tool: ${toolName}`,
          availableTools: Object.keys(AGENT_TOOLS),
        };
    }
  },
});

// ============================================================================
// TOOL HELPERS
// ============================================================================

/**
 * Get all available tools for a specific agent type
 */
export function getToolsForAgent(
  agentType: "trading" | "email" | "research" | "assistant"
): typeof AGENT_TOOLS[keyof typeof AGENT_TOOLS][] {
  const toolsByAgent = {
    trading: [
      "getPortfolio",
      "getMarketData",
      "placeOrder",
      "getPosition",
      "getOpenOrders",
      "cancelOrder",
      "getPredictionMarket",
      "getRWAAsset",
      "getAccountBalance",
      "getNews",
    ],
    email: [
      "searchEmails",
      "composeEmail",
      "getNews",
    ],
    research: [
      "getMarketData",
      "getPredictionMarket",
      "getNews",
      "getPortfolio",
    ],
    assistant: Object.keys(AGENT_TOOLS),
  };

  const toolNames = toolsByAgent[agentType] ?? [];
  return toolNames
    .map((name) => AGENT_TOOLS[name as keyof typeof AGENT_TOOLS])
    .filter(Boolean);
}
