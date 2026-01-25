/**
 * Market Maker Service
 *
 * Provides liquidity management functionality for users to become
 * market makers and earn spread as passive income.
 */

import {
  type MarketMakerPosition,
  type MarketMakerOrder,
  type MarketMakerFill,
  type MarketMakerStats,
  type MarketMakerConfig,
  type LiquidityPool,
  type PoolContribution,
  type CreatePositionInput,
  type UpdatePositionInput,
  type JoinPoolInput,
  type WithdrawPoolInput,
  type MarketMakerStatus,
  type RiskLevel,
} from "./types";

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class MarketMakerService {
  // Storage (in production, replace with database calls)
  private positions: Map<string, MarketMakerPosition> = new Map();
  private orders: Map<string, MarketMakerOrder> = new Map();
  private fills: Map<string, MarketMakerFill> = new Map();
  private pools: Map<string, LiquidityPool> = new Map();
  private contributions: Map<string, PoolContribution> = new Map();
  private configs: Map<string, MarketMakerConfig> = new Map();

  // ============================================================================
  // POSITION MANAGEMENT
  // ============================================================================

  /**
   * Create a new market maker position
   */
  async createPosition(
    userId: string,
    input: CreatePositionInput
  ): Promise<MarketMakerPosition> {
    // Validate user has sufficient capital
    // In production: Check against user's wallet/balance

    const position: MarketMakerPosition = {
      id: `mm_pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      marketId: input.marketId,
      marketTicker: "", // Fetch from market service
      marketTitle: "",  // Fetch from market service

      status: "pending",
      poolType: "single_market",
      riskLevel: input.riskLevel ?? "moderate",

      initialCapital: input.capital,
      currentCapital: input.capital,
      reservedCapital: 0,
      availableCapital: input.capital,

      bidSpread: input.bidSpread ?? 0.02,
      askSpread: input.askSpread ?? 0.02,
      minSpread: 0.005,
      maxSpread: 0.1,

      maxPositionSize: input.maxPositionSize,
      maxTotalExposure: input.capital * 0.8,
      currentBidSize: 0,
      currentAskSize: 0,
      netPosition: 0,

      stopLossPercent: input.stopLossPercent ?? 0.1,
      takeProfitPercent: input.takeProfitPercent ?? 0.5,
      maxDrawdownPercent: 0.2,
      dailyLossLimit: input.capital * 0.05,

      totalEarnings: 0,
      totalVolume: 0,
      tradesExecuted: 0,
      winningTrades: 0,
      losingTrades: 0,

      createdAt: Date.now(),
    };

    this.positions.set(position.id, position);

    // Auto-activate if all checks pass
    await this.activatePosition(position.id);

    return position;
  }

  /**
   * Activate a market maker position
   */
  async activatePosition(positionId: string): Promise<MarketMakerPosition> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    if (position.status !== "pending" && position.status !== "paused") {
      throw new Error(`Cannot activate position with status: ${position.status}`);
    }

    // Start quoting
    position.status = "active";
    position.activatedAt = Date.now();

    // Place initial orders
    await this.refreshOrders(positionId);

    this.positions.set(positionId, position);
    return position;
  }

  /**
   * Pause a market maker position
   */
  async pausePosition(positionId: string): Promise<MarketMakerPosition> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    if (position.status !== "active") {
      throw new Error("Position is not active");
    }

    // Cancel all open orders
    await this.cancelAllOrders(positionId);

    position.status = "paused";
    position.pausedAt = Date.now();

    this.positions.set(positionId, position);
    return position;
  }

  /**
   * Stop a market maker position (close out)
   */
  async stopPosition(positionId: string): Promise<MarketMakerPosition> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    // Cancel all orders
    await this.cancelAllOrders(positionId);

    // Close any open inventory
    if (position.netPosition !== 0) {
      // In production: Execute market order to flatten
    }

    position.status = "stopped";
    position.stoppedAt = Date.now();
    position.availableCapital = position.currentCapital;
    position.reservedCapital = 0;

    this.positions.set(positionId, position);
    return position;
  }

  /**
   * Update position parameters
   */
  async updatePosition(
    userId: string,
    input: UpdatePositionInput
  ): Promise<MarketMakerPosition> {
    const position = this.positions.get(input.positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    if (position.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Update parameters
    if (input.bidSpread !== undefined) position.bidSpread = input.bidSpread;
    if (input.askSpread !== undefined) position.askSpread = input.askSpread;
    if (input.maxPositionSize !== undefined) position.maxPositionSize = input.maxPositionSize;
    if (input.stopLossPercent !== undefined) position.stopLossPercent = input.stopLossPercent;
    if (input.takeProfitPercent !== undefined) position.takeProfitPercent = input.takeProfitPercent;
    if (input.riskLevel !== undefined) position.riskLevel = input.riskLevel;

    // Refresh orders with new parameters
    if (position.status === "active") {
      await this.refreshOrders(input.positionId);
    }

    this.positions.set(input.positionId, position);
    return position;
  }

  /**
   * Get user's positions
   */
  async getUserPositions(
    userId: string,
    status?: MarketMakerStatus
  ): Promise<MarketMakerPosition[]> {
    const positions = Array.from(this.positions.values()).filter(
      (p) => p.userId === userId && (!status || p.status === status)
    );
    return positions;
  }

  /**
   * Get position by ID
   */
  async getPosition(positionId: string): Promise<MarketMakerPosition | null> {
    return this.positions.get(positionId) ?? null;
  }

  // ============================================================================
  // ORDER MANAGEMENT
  // ============================================================================

  /**
   * Refresh orders for a position (cancel old, place new)
   */
  async refreshOrders(positionId: string): Promise<MarketMakerOrder[]> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    // Cancel existing orders
    await this.cancelAllOrders(positionId);

    // Get current market price
    const midPrice = await this.getMarketMidPrice(position.marketId);

    // Calculate bid/ask prices
    const bidPrice = midPrice * (1 - position.bidSpread);
    const askPrice = midPrice * (1 + position.askSpread);

    // Calculate order sizes based on available capital
    const maxOrderSize = Math.min(
      position.maxPositionSize,
      position.availableCapital / 2
    );

    const newOrders: MarketMakerOrder[] = [];

    // Place bid order
    if (maxOrderSize > 0) {
      const bidOrder = await this.placeOrder(position, "bid", bidPrice, maxOrderSize);
      newOrders.push(bidOrder);
    }

    // Place ask order
    if (maxOrderSize > 0) {
      const askOrder = await this.placeOrder(position, "ask", askPrice, maxOrderSize);
      newOrders.push(askOrder);
    }

    // Update position capital
    position.reservedCapital = maxOrderSize * 2;
    position.availableCapital = position.currentCapital - position.reservedCapital;
    position.currentBidSize = maxOrderSize;
    position.currentAskSize = maxOrderSize;

    this.positions.set(positionId, position);

    return newOrders;
  }

  /**
   * Place a single order
   */
  private async placeOrder(
    position: MarketMakerPosition,
    side: "bid" | "ask",
    price: number,
    quantity: number
  ): Promise<MarketMakerOrder> {
    const spreadBps = side === "bid" ? position.bidSpread * 10000 : position.askSpread * 10000;

    const order: MarketMakerOrder = {
      id: `mm_ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      positionId: position.id,
      userId: position.userId,
      marketId: position.marketId,
      side,
      price,
      quantity,
      filledQuantity: 0,
      remainingQuantity: quantity,
      status: "open",
      spreadBps,
      expectedProfit: quantity * (spreadBps / 10000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    };

    this.orders.set(order.id, order);
    return order;
  }

  /**
   * Cancel all orders for a position
   */
  async cancelAllOrders(positionId: string): Promise<void> {
    const orders = Array.from(this.orders.values()).filter(
      (o) => o.positionId === positionId && o.status === "open"
    );

    for (const order of orders) {
      order.status = "cancelled";
      order.cancelledAt = Date.now();
      this.orders.set(order.id, order);
    }
  }

  /**
   * Process a fill (called when order is matched)
   */
  async processFill(
    orderId: string,
    fillQuantity: number,
    fillPrice: number,
    counterpartyType: "retail" | "institutional" | "other_mm"
  ): Promise<MarketMakerFill> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const position = this.positions.get(order.positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    // Calculate spread earned
    const midPrice = await this.getMarketMidPrice(order.marketId);
    const spreadEarned = Math.abs(fillPrice - midPrice) * fillQuantity;
    const fees = fillQuantity * fillPrice * 0.001; // 0.1% fee
    const netProfit = spreadEarned - fees;

    const fill: MarketMakerFill = {
      id: `mm_fill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: order.id,
      positionId: position.id,
      userId: position.userId,
      marketId: order.marketId,
      side: order.side,
      price: fillPrice,
      quantity: fillQuantity,
      spreadEarned,
      fees,
      netProfit,
      counterpartyType,
      executedAt: Date.now(),
    };

    this.fills.set(fill.id, fill);

    // Update order
    order.filledQuantity += fillQuantity;
    order.remainingQuantity -= fillQuantity;
    if (order.remainingQuantity <= 0) {
      order.status = "filled";
      order.filledAt = Date.now();
    } else {
      order.status = "partial";
    }
    this.orders.set(order.id, order);

    // Update position
    position.totalVolume += fillQuantity * fillPrice;
    position.tradesExecuted += 1;
    position.totalEarnings += netProfit;
    position.currentCapital += netProfit;
    position.lastTradeAt = Date.now();

    if (netProfit > 0) {
      position.winningTrades += 1;
    } else {
      position.losingTrades += 1;
    }

    // Update net position
    if (order.side === "bid") {
      position.netPosition += fillQuantity;
    } else {
      position.netPosition -= fillQuantity;
    }

    // Check risk limits
    await this.checkRiskLimits(position);

    this.positions.set(position.id, position);

    return fill;
  }

  /**
   * Get fills for a position
   */
  async getPositionFills(
    positionId: string,
    limit: number = 50
  ): Promise<MarketMakerFill[]> {
    return Array.from(this.fills.values())
      .filter((f) => f.positionId === positionId)
      .sort((a, b) => b.executedAt - a.executedAt)
      .slice(0, limit);
  }

  // ============================================================================
  // LIQUIDITY POOLS
  // ============================================================================

  /**
   * Get available liquidity pools
   */
  async getPools(): Promise<LiquidityPool[]> {
    return Array.from(this.pools.values()).filter((p) => p.status === "active");
  }

  /**
   * Get pool by ID
   */
  async getPool(poolId: string): Promise<LiquidityPool | null> {
    return this.pools.get(poolId) ?? null;
  }

  /**
   * Join a liquidity pool
   */
  async joinPool(userId: string, input: JoinPoolInput): Promise<PoolContribution> {
    const pool = this.pools.get(input.poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    if (pool.status !== "active") {
      throw new Error("Pool is not accepting contributions");
    }

    if (input.amount < pool.minContribution) {
      throw new Error(`Minimum contribution is ${pool.minContribution}`);
    }

    if (pool.maxContribution && input.amount > pool.maxContribution) {
      throw new Error(`Maximum contribution is ${pool.maxContribution}`);
    }

    const sharePercent = (input.amount / (pool.totalCapital + input.amount)) * 100;

    const contribution: PoolContribution = {
      id: `mm_contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      poolId: input.poolId,
      contributedAmount: input.amount,
      currentValue: input.amount,
      sharePercent,
      totalEarnings: 0,
      pendingEarnings: 0,
      claimedEarnings: 0,
      status: "active",
      contributedAt: Date.now(),
    };

    this.contributions.set(contribution.id, contribution);

    // Update pool
    pool.totalCapital += input.amount;
    pool.totalParticipants += 1;
    this.pools.set(pool.id, pool);

    return contribution;
  }

  /**
   * Withdraw from a liquidity pool
   */
  async withdrawFromPool(
    userId: string,
    input: WithdrawPoolInput
  ): Promise<PoolContribution> {
    const contribution = this.contributions.get(input.contributionId);
    if (!contribution) {
      throw new Error("Contribution not found");
    }

    if (contribution.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (contribution.status !== "active") {
      throw new Error("Contribution is not active");
    }

    const withdrawAmount = input.amount ?? contribution.currentValue;

    if (withdrawAmount > contribution.currentValue) {
      throw new Error("Insufficient balance");
    }

    contribution.status = "pending_withdrawal";
    contribution.withdrawRequestedAt = Date.now();

    // Process withdrawal (in production, this might be delayed)
    contribution.currentValue -= withdrawAmount;
    if (contribution.currentValue === 0) {
      contribution.status = "withdrawn";
      contribution.withdrawnAt = Date.now();
    } else {
      contribution.status = "active";
    }

    this.contributions.set(contribution.id, contribution);

    // Update pool
    const pool = this.pools.get(contribution.poolId);
    if (pool) {
      pool.totalCapital -= withdrawAmount;
      if (contribution.status === "withdrawn") {
        pool.totalParticipants -= 1;
      }
      this.pools.set(pool.id, pool);
    }

    return contribution;
  }

  /**
   * Get user's pool contributions
   */
  async getUserContributions(userId: string): Promise<PoolContribution[]> {
    return Array.from(this.contributions.values()).filter(
      (c) => c.userId === userId
    );
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get market maker statistics
   */
  async getStats(
    userId: string,
    period: "daily" | "weekly" | "monthly" | "all_time"
  ): Promise<MarketMakerStats> {
    const positions = await this.getUserPositions(userId);
    const fills = Array.from(this.fills.values()).filter(
      (f) => f.userId === userId
    );

    // Filter by period
    const now = Date.now();
    const periodMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      all_time: Number.MAX_SAFE_INTEGER,
    };

    const periodFills = fills.filter(
      (f) => now - f.executedAt < periodMs[period]
    );

    const totalVolume = periodFills.reduce((sum, f) => sum + f.quantity * f.price, 0);
    const bidVolume = periodFills
      .filter((f) => f.side === "bid")
      .reduce((sum, f) => sum + f.quantity * f.price, 0);
    const askVolume = periodFills
      .filter((f) => f.side === "ask")
      .reduce((sum, f) => sum + f.quantity * f.price, 0);

    const grossEarnings = periodFills.reduce((sum, f) => sum + f.spreadEarned, 0);
    const feesPaid = periodFills.reduce((sum, f) => sum + f.fees, 0);
    const netEarnings = grossEarnings - feesPaid;

    const winningFills = periodFills.filter((f) => f.netProfit > 0);
    const losingFills = periodFills.filter((f) => f.netProfit <= 0);

    return {
      userId,
      period,
      totalVolume,
      bidVolume,
      askVolume,
      totalTrades: periodFills.length,
      winningTrades: winningFills.length,
      losingTrades: losingFills.length,
      winRate: periodFills.length > 0 ? winningFills.length / periodFills.length : 0,
      grossEarnings,
      feesPaid,
      netEarnings,
      averageSpread: periodFills.length > 0
        ? periodFills.reduce((sum, f) => sum + f.spreadEarned, 0) / periodFills.length
        : 0,
      maxDrawdown: 0, // Calculate from equity curve
      sharpeRatio: 0, // Calculate from returns
      volatility: 0,  // Calculate from returns
      averagePositionSize: totalVolume / Math.max(periodFills.length, 1),
      averageHoldTime: 0, // Calculate from order to fill time
      inventoryTurnover: 0, // Calculate from volume / capital
      uptimePercent: 100,
      quotingPercent: 95,
    };
  }

  // ============================================================================
  // RISK MANAGEMENT
  // ============================================================================

  /**
   * Check risk limits and take action if needed
   */
  private async checkRiskLimits(position: MarketMakerPosition): Promise<void> {
    const drawdown = (position.initialCapital - position.currentCapital) / position.initialCapital;

    // Check max drawdown
    if (drawdown >= position.maxDrawdownPercent) {
      await this.pausePosition(position.id);
      // Send notification
      return;
    }

    // Check stop loss
    if (drawdown >= position.stopLossPercent) {
      await this.stopPosition(position.id);
      // Send notification
      return;
    }

    // Check daily loss limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFills = Array.from(this.fills.values()).filter(
      (f) => f.positionId === position.id && f.executedAt >= today.getTime()
    );
    const dailyPnL = todayFills.reduce((sum, f) => sum + f.netProfit, 0);

    if (dailyPnL <= -position.dailyLossLimit) {
      await this.pausePosition(position.id);
      // Send notification
      return;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get market mid price (mock - in production, call market service)
   */
  private async getMarketMidPrice(marketId: string): Promise<number> {
    // Mock price - in production, fetch from Kalshi or other source
    return 0.5 + Math.random() * 0.1;
  }

  /**
   * Initialize default pools
   */
  async initializeDefaultPools(): Promise<void> {
    const defaultPools: LiquidityPool[] = [
      {
        id: "pool_conservative",
        name: "Conservative MM Pool",
        description: "Low-risk market making across stable markets",
        poolType: "multi_market",
        marketIds: [],
        totalCapital: 100000,
        utilizedCapital: 80000,
        reservedCapital: 20000,
        totalParticipants: 45,
        minContribution: 100,
        maxContribution: 10000,
        totalEarnings: 15000,
        historicalApy: 0.12,
        currentApy: 0.15,
        managementFee: 0.01,
        performanceFee: 0.1,
        status: "active",
        createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
      },
      {
        id: "pool_aggressive",
        name: "High-Yield MM Pool",
        description: "Higher-risk market making with better returns",
        poolType: "automated",
        marketIds: [],
        totalCapital: 250000,
        utilizedCapital: 220000,
        reservedCapital: 30000,
        totalParticipants: 120,
        minContribution: 500,
        maxContribution: 50000,
        totalEarnings: 75000,
        historicalApy: 0.25,
        currentApy: 0.28,
        managementFee: 0.02,
        performanceFee: 0.2,
        status: "active",
        createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
      },
    ];

    for (const pool of defaultPools) {
      this.pools.set(pool.id, pool);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let marketMakerService: MarketMakerService | null = null;

export function getMarketMakerService(): MarketMakerService {
  if (!marketMakerService) {
    marketMakerService = new MarketMakerService();
    // Initialize default pools
    marketMakerService.initializeDefaultPools();
  }
  return marketMakerService;
}

export function createMarketMakerService(): MarketMakerService {
  return new MarketMakerService();
}
