/**
 * Copy Trading Service
 * Handles copy trading subscriptions, trade execution, and position management
 */

import type {
  CopyTradingSubscription,
  CopyTrade,
  CopySubscriptionStatus,
  CopyMode,
  CreateCopySubscriptionInput,
  UpdateCopySubscriptionInput,
  CopyTradingAnalytics,
  TraderProfile,
  UserSummary,
  AssetClass,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface CopyTradingServiceConfig {
  maxCopiesPerUser: number;
  maxCopiersPerTrader: number;
  minCopyAmount: number;
  maxSlippagePercent: number;
  defaultCopyDelay: number;
  platformFeePercent: number;
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

interface OrderService {
  createOrder(params: {
    userId: string;
    symbol: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    quantity: number;
    price?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
}

const DEFAULT_CONFIG: CopyTradingServiceConfig = {
  maxCopiesPerUser: 10,
  maxCopiersPerTrader: 10000,
  minCopyAmount: 10,
  maxSlippagePercent: 2,
  defaultCopyDelay: 0,
  platformFeePercent: 0.5,
};

// ============================================================================
// Copy Trading Service
// ============================================================================

export class CopyTradingService {
  private readonly config: CopyTradingServiceConfig;
  private readonly db: ConvexClient;
  private readonly orderService: OrderService;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    orderService: OrderService,
    config?: Partial<CopyTradingServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.orderService = orderService;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[CopyTrading] ${msg}`, meta),
      info: (msg, meta) => console.info(`[CopyTrading] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[CopyTrading] ${msg}`, meta),
      error: (msg, meta) => console.error(`[CopyTrading] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  /**
   * Create a copy trading subscription
   */
  async createSubscription(
    copierId: string,
    input: CreateCopySubscriptionInput
  ): Promise<CopyTradingSubscription> {
    // Validate trader allows copy trading
    const traderProfile = await this.db.query<TraderProfile | null>("traderProfiles:get", {
      userId: input.traderId,
    });

    if (!traderProfile?.allowCopyTrading) {
      throw new CopyTradingError("Trader does not allow copy trading", "COPY_TRADING_NOT_ALLOWED");
    }

    if (!traderProfile.allowAutoCopy && input.copyDelaySeconds === 0) {
      throw new CopyTradingError("Trader does not allow auto-copy", "AUTO_COPY_NOT_ALLOWED");
    }

    // Check existing subscription
    const existing = await this.db.query<CopyTradingSubscription | null>(
      "copyTradingSubscriptions:getByPair",
      {
        copierId,
        traderId: input.traderId,
      }
    );

    if (existing && ["pending", "active", "paused"].includes(existing.status)) {
      throw new CopyTradingError("Already subscribed to this trader", "ALREADY_SUBSCRIBED");
    }

    // Check copier limits
    const copierSubscriptionCount = await this.db.query<number>(
      "copyTradingSubscriptions:countByCopier",
      {
        copierId,
        statuses: ["active", "paused"],
      }
    );

    if (copierSubscriptionCount >= this.config.maxCopiesPerUser) {
      throw new CopyTradingError(
        `Cannot copy more than ${this.config.maxCopiesPerUser} traders`,
        "MAX_COPIES_EXCEEDED"
      );
    }

    // Check trader copier limits
    const traderCopierCount = await this.db.query<number>(
      "copyTradingSubscriptions:countByTrader",
      {
        traderId: input.traderId,
        statuses: ["active"],
      }
    );

    if (traderCopierCount >= this.config.maxCopiersPerTrader) {
      throw new CopyTradingError("Trader has reached maximum copier limit", "MAX_COPIERS_EXCEEDED");
    }

    // Validate position sizing
    this.validatePositionSizing(input);

    // Create subscription
    const now = Date.now();
    const subscription = await this.db.mutation<CopyTradingSubscription>(
      "copyTradingSubscriptions:create",
      {
        copierId,
        traderId: input.traderId,
        status: "active",
        copyMode: input.copyMode,
        fixedAmount: input.fixedAmount,
        portfolioPercentage: input.portfolioPercentage,
        copyRatio: input.copyRatio,
        maxPositionSize: input.maxPositionSize,
        maxDailyLoss: input.maxDailyLoss,
        maxTotalExposure: input.maxTotalExposure,
        stopLossPercent: input.stopLossPercent,
        takeProfitPercent: input.takeProfitPercent,
        copyAssetClasses: input.copyAssetClasses,
        excludedSymbols: input.excludedSymbols ?? [],
        copyDelaySeconds: input.copyDelaySeconds ?? this.config.defaultCopyDelay,
        totalCopiedTrades: 0,
        totalPnL: 0,
        totalFeesPaid: 0,
        subscribedAt: now,
        updatedAt: now,
      }
    );

    // Update copier count on trader profile
    await this.updateTraderCopierCount(input.traderId);

    this.logger.info("Copy trading subscription created", {
      copierId,
      traderId: input.traderId,
      subscriptionId: subscription.id,
    });

    return subscription;
  }

  /**
   * Update subscription settings
   */
  async updateSubscription(
    copierId: string,
    subscriptionId: string,
    updates: UpdateCopySubscriptionInput
  ): Promise<CopyTradingSubscription> {
    const subscription = await this.getSubscription(subscriptionId);

    if (subscription.copierId !== copierId) {
      throw new CopyTradingError("Subscription not found", "NOT_FOUND");
    }

    if (!["active", "paused"].includes(subscription.status)) {
      throw new CopyTradingError("Cannot update inactive subscription", "INVALID_STATUS");
    }

    // Validate new position sizing if changed
    if (updates.copyMode || updates.fixedAmount || updates.portfolioPercentage) {
      this.validatePositionSizing({
        ...subscription,
        ...updates,
        traderId: subscription.traderId,
      } as CreateCopySubscriptionInput);
    }

    return await this.db.mutation<CopyTradingSubscription>("copyTradingSubscriptions:update", {
      id: subscriptionId,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(copierId: string, subscriptionId: string): Promise<CopyTradingSubscription> {
    const subscription = await this.getSubscription(subscriptionId);

    if (subscription.copierId !== copierId) {
      throw new CopyTradingError("Subscription not found", "NOT_FOUND");
    }

    if (subscription.status !== "active") {
      throw new CopyTradingError("Subscription is not active", "INVALID_STATUS");
    }

    return await this.db.mutation<CopyTradingSubscription>("copyTradingSubscriptions:update", {
      id: subscriptionId,
      status: "paused",
      pausedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(copierId: string, subscriptionId: string): Promise<CopyTradingSubscription> {
    const subscription = await this.getSubscription(subscriptionId);

    if (subscription.copierId !== copierId) {
      throw new CopyTradingError("Subscription not found", "NOT_FOUND");
    }

    if (subscription.status !== "paused") {
      throw new CopyTradingError("Subscription is not paused", "INVALID_STATUS");
    }

    return await this.db.mutation<CopyTradingSubscription>("copyTradingSubscriptions:update", {
      id: subscriptionId,
      status: "active",
      pausedAt: null,
      updatedAt: Date.now(),
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(copierId: string, subscriptionId: string): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);

    if (subscription.copierId !== copierId) {
      throw new CopyTradingError("Subscription not found", "NOT_FOUND");
    }

    await this.db.mutation("copyTradingSubscriptions:update", {
      id: subscriptionId,
      status: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    });

    await this.updateTraderCopierCount(subscription.traderId);

    this.logger.info("Copy trading subscription cancelled", {
      copierId,
      traderId: subscription.traderId,
      subscriptionId,
    });
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<CopyTradingSubscription> {
    const subscription = await this.db.query<CopyTradingSubscription | null>(
      "copyTradingSubscriptions:get",
      { id: subscriptionId }
    );

    if (!subscription) {
      throw new CopyTradingError("Subscription not found", "NOT_FOUND");
    }

    return subscription;
  }

  /**
   * Get user's subscriptions (as copier)
   */
  async getCopierSubscriptions(
    copierId: string,
    options?: { status?: CopySubscriptionStatus[]; limit?: number; cursor?: string }
  ): Promise<{ subscriptions: CopyTradingSubscription[]; cursor?: string }> {
    return await this.db.query("copyTradingSubscriptions:getByCopier", {
      copierId,
      statuses: options?.status,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Get trader's copiers
   */
  async getTraderCopiers(
    traderId: string,
    options?: { status?: CopySubscriptionStatus[]; limit?: number; cursor?: string }
  ): Promise<{ subscriptions: CopyTradingSubscription[]; cursor?: string }> {
    return await this.db.query("copyTradingSubscriptions:getByTrader", {
      traderId,
      statuses: options?.status ?? ["active"],
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  private validatePositionSizing(input: CreateCopySubscriptionInput): void {
    switch (input.copyMode) {
      case "fixed_amount":
        if (!input.fixedAmount || input.fixedAmount < this.config.minCopyAmount) {
          throw new CopyTradingError(
            `Fixed amount must be at least ${this.config.minCopyAmount}`,
            "INVALID_AMOUNT"
          );
        }
        break;
      case "percentage_portfolio":
        if (!input.portfolioPercentage || input.portfolioPercentage <= 0 || input.portfolioPercentage > 100) {
          throw new CopyTradingError("Portfolio percentage must be between 0 and 100", "INVALID_PERCENTAGE");
        }
        break;
      case "proportional":
      case "fixed_ratio":
        if (!input.copyRatio || input.copyRatio <= 0) {
          throw new CopyTradingError("Copy ratio must be greater than 0", "INVALID_RATIO");
        }
        break;
    }
  }

  private async updateTraderCopierCount(traderId: string): Promise<void> {
    const count = await this.db.query<number>("copyTradingSubscriptions:countByTrader", {
      traderId,
      statuses: ["active"],
    });

    await this.db.mutation("traderProfiles:updateCounts", {
      userId: traderId,
      copierCount: count,
    });
  }

  // ==========================================================================
  // Copy Trade Execution
  // ==========================================================================

  /**
   * Process a trader's trade for copying
   * Called when a trader executes a trade
   */
  async processTrade(
    traderId: string,
    tradeDetails: {
      orderId: string;
      tradeId?: string;
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      price: number;
      assetClass: AssetClass;
    }
  ): Promise<CopyTrade[]> {
    // Get all active subscriptions for this trader
    const { subscriptions } = await this.getTraderCopiers(traderId, {
      status: ["active"],
      limit: 1000,
    });

    const copyTrades: CopyTrade[] = [];

    for (const subscription of subscriptions) {
      try {
        const copyTrade = await this.executeCopyTrade(subscription, tradeDetails);
        if (copyTrade) {
          copyTrades.push(copyTrade);
        }
      } catch (error) {
        this.logger.error("Failed to copy trade", {
          subscriptionId: subscription.id,
          copierId: subscription.copierId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.logger.info("Processed trade for copying", {
      traderId,
      symbol: tradeDetails.symbol,
      copiesCreated: copyTrades.length,
      subscriptionCount: subscriptions.length,
    });

    return copyTrades;
  }

  /**
   * Execute a copy trade for a specific subscription
   */
  private async executeCopyTrade(
    subscription: CopyTradingSubscription,
    tradeDetails: {
      orderId: string;
      tradeId?: string;
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      price: number;
      assetClass: AssetClass;
    }
  ): Promise<CopyTrade | null> {
    const now = Date.now();

    // Check if asset class is allowed
    if (!subscription.copyAssetClasses.includes(tradeDetails.assetClass)) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Asset class not allowed");
    }

    // Check if symbol is excluded
    if (subscription.excludedSymbols.includes(tradeDetails.symbol)) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Symbol excluded");
    }

    // Check daily loss limit
    const dailyPnL = await this.getDailyPnL(subscription.id);
    if (dailyPnL < -subscription.maxDailyLoss) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Daily loss limit reached");
    }

    // Calculate copy quantity
    const copyQuantity = await this.calculateCopyQuantity(subscription, tradeDetails);
    if (copyQuantity <= 0) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Copy quantity too small");
    }

    // Check position size limit
    const positionValue = copyQuantity * tradeDetails.price;
    if (positionValue > subscription.maxPositionSize) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Position size exceeded");
    }

    // Check total exposure
    const totalExposure = await this.getTotalExposure(subscription.copierId);
    if (totalExposure + positionValue > subscription.maxTotalExposure) {
      return this.createSkippedCopyTrade(subscription, tradeDetails, "Total exposure exceeded");
    }

    // Create copy trade record
    const copyTrade = await this.db.mutation<CopyTrade>("copyTrades:create", {
      subscriptionId: subscription.id,
      copierId: subscription.copierId,
      traderId: subscription.traderId,
      originalOrderId: tradeDetails.orderId,
      originalTradeId: tradeDetails.tradeId,
      status: "pending",
      symbol: tradeDetails.symbol,
      side: tradeDetails.side,
      originalQuantity: tradeDetails.quantity,
      originalPrice: tradeDetails.price,
      copyQuantity,
      copyFee: 0,
      performanceFee: 0,
      originalExecutedAt: now,
      createdAt: now,
    });

    // Apply delay if configured
    if (subscription.copyDelaySeconds > 0) {
      // Schedule for later execution (would be handled by Temporal workflow)
      this.logger.info("Copy trade scheduled with delay", {
        copyTradeId: copyTrade.id,
        delay: subscription.copyDelaySeconds,
      });
      return copyTrade;
    }

    // Execute immediately
    return await this.executeCopyOrder(copyTrade, subscription);
  }

  /**
   * Execute the copy order
   */
  private async executeCopyOrder(
    copyTrade: CopyTrade,
    subscription: CopyTradingSubscription
  ): Promise<CopyTrade> {
    try {
      // Update status to executing
      await this.db.mutation("copyTrades:update", {
        id: copyTrade.id,
        status: "executing",
      });

      // Create the order
      const order = await this.orderService.createOrder({
        userId: subscription.copierId,
        symbol: copyTrade.symbol,
        side: copyTrade.side,
        type: "market", // Copy trades are typically market orders
        quantity: copyTrade.copyQuantity,
        metadata: {
          isCopyTrade: true,
          copyTradeId: copyTrade.id,
          originalOrderId: copyTrade.originalOrderId,
          traderId: subscription.traderId,
        },
      });

      // Calculate fees
      const traderProfile = await this.db.query<TraderProfile>("traderProfiles:get", {
        userId: subscription.traderId,
      });

      const copyFee = copyTrade.copyQuantity * copyTrade.originalPrice * (this.config.platformFeePercent / 100);
      const performanceFee = 0; // Calculated on position close

      // Update copy trade with order details
      const updated = await this.db.mutation<CopyTrade>("copyTrades:update", {
        id: copyTrade.id,
        copyOrderId: order.id,
        status: "filled",
        copyPrice: copyTrade.originalPrice, // Will be updated when fill comes in
        copyFee,
        copyExecutedAt: Date.now(),
      });

      // Update subscription stats
      await this.db.mutation("copyTradingSubscriptions:incrementStats", {
        id: subscription.id,
        totalCopiedTrades: 1,
        totalFeesPaid: copyFee,
      });

      this.logger.info("Copy trade executed", {
        copyTradeId: copyTrade.id,
        orderId: order.id,
        copierId: subscription.copierId,
      });

      return updated;
    } catch (error) {
      // Mark as failed
      await this.db.mutation("copyTrades:update", {
        id: copyTrade.id,
        status: "failed",
        failureReason: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  }

  private async createSkippedCopyTrade(
    subscription: CopyTradingSubscription,
    tradeDetails: {
      orderId: string;
      tradeId?: string;
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      price: number;
    },
    reason: string
  ): Promise<CopyTrade> {
    const now = Date.now();

    return await this.db.mutation<CopyTrade>("copyTrades:create", {
      subscriptionId: subscription.id,
      copierId: subscription.copierId,
      traderId: subscription.traderId,
      originalOrderId: tradeDetails.orderId,
      originalTradeId: tradeDetails.tradeId,
      status: "skipped",
      skipReason: reason,
      symbol: tradeDetails.symbol,
      side: tradeDetails.side,
      originalQuantity: tradeDetails.quantity,
      originalPrice: tradeDetails.price,
      copyQuantity: 0,
      copyFee: 0,
      performanceFee: 0,
      originalExecutedAt: now,
      createdAt: now,
    });
  }

  private async calculateCopyQuantity(
    subscription: CopyTradingSubscription,
    tradeDetails: { quantity: number; price: number }
  ): Promise<number> {
    const tradeValue = tradeDetails.quantity * tradeDetails.price;

    switch (subscription.copyMode) {
      case "fixed_amount": {
        const fixedAmount = subscription.fixedAmount ?? 0;
        return fixedAmount / tradeDetails.price;
      }

      case "percentage_portfolio": {
        const portfolio = await this.db.query<{ available: number }>("balances:getBuyingPower", {
          userId: subscription.copierId,
        });
        const percentage = subscription.portfolioPercentage ?? 0;
        const amount = (portfolio.available * percentage) / 100;
        return amount / tradeDetails.price;
      }

      case "proportional": {
        // Copy the same percentage of portfolio as the trader
        const traderPortfolio = await this.db.query<{ totalValue: number }>(
          "positions:getPortfolioValue",
          { userId: subscription.traderId }
        );
        const copierPortfolio = await this.db.query<{ totalValue: number }>(
          "positions:getPortfolioValue",
          { userId: subscription.copierId }
        );

        if (traderPortfolio.totalValue === 0) return 0;

        const traderPercent = tradeValue / traderPortfolio.totalValue;
        const copierAmount = copierPortfolio.totalValue * traderPercent;
        return copierAmount / tradeDetails.price;
      }

      case "fixed_ratio": {
        const ratio = subscription.copyRatio ?? 1;
        return tradeDetails.quantity * ratio;
      }

      default:
        return 0;
    }
  }

  private async getDailyPnL(subscriptionId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.db.query<{ totalPnL: number }>("copyTrades:getDailyPnL", {
      subscriptionId,
      since: today.getTime(),
    });

    return result.totalPnL;
  }

  private async getTotalExposure(userId: string): Promise<number> {
    const result = await this.db.query<{ totalExposure: number }>("positions:getTotalExposure", {
      userId,
    });
    return result.totalExposure;
  }

  // ==========================================================================
  // Copy Trade Queries
  // ==========================================================================

  /**
   * Get copy trades for a subscription
   */
  async getCopyTrades(
    subscriptionId: string,
    options?: { status?: string[]; limit?: number; cursor?: string }
  ): Promise<{ trades: CopyTrade[]; cursor?: string }> {
    return await this.db.query("copyTrades:getBySubscription", {
      subscriptionId,
      statuses: options?.status,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Get copy trade by ID
   */
  async getCopyTrade(copyTradeId: string): Promise<CopyTrade> {
    const trade = await this.db.query<CopyTrade | null>("copyTrades:get", {
      id: copyTradeId,
    });

    if (!trade) {
      throw new CopyTradingError("Copy trade not found", "NOT_FOUND");
    }

    return trade;
  }

  // ==========================================================================
  // Analytics
  // ==========================================================================

  /**
   * Get copy trading analytics for a subscription
   */
  async getAnalytics(
    subscriptionId: string,
    period: "daily" | "weekly" | "monthly" | "all_time"
  ): Promise<CopyTradingAnalytics> {
    const subscription = await this.getSubscription(subscriptionId);

    const periodMs =
      period === "daily"
        ? 24 * 60 * 60 * 1000
        : period === "weekly"
          ? 7 * 24 * 60 * 60 * 1000
          : period === "monthly"
            ? 30 * 24 * 60 * 60 * 1000
            : 0;

    const since = periodMs > 0 ? Date.now() - periodMs : 0;

    return await this.db.query("copyTrades:getAnalytics", {
      subscriptionId,
      since,
    });
  }

  /**
   * Get aggregated stats for a copier
   */
  async getCopierStats(copierId: string): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalCopiedTrades: number;
    totalPnL: number;
    totalFeesPaid: number;
  }> {
    return await this.db.query("copyTradingSubscriptions:getCopierStats", {
      copierId,
    });
  }

  /**
   * Get aggregated stats for a trader
   */
  async getTraderCopyStats(traderId: string): Promise<{
    totalCopiers: number;
    activeCopiers: number;
    totalCopiedTrades: number;
    totalFeesEarned: number;
    avgCopierPnL: number;
  }> {
    return await this.db.query("copyTradingSubscriptions:getTraderStats", {
      traderId,
    });
  }
}

// ============================================================================
// Errors
// ============================================================================

export class CopyTradingError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CopyTradingError";
  }
}

export default CopyTradingService;
