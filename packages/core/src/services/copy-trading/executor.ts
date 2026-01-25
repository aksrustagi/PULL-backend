/**
 * Copy Trade Executor
 *
 * Handles the execution logic for copying trades from leaders to followers.
 */

import {
  type CopySubscription,
  type CopyTrade,
  type CopyMode,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface TradeToExecute {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "yes" | "no" | "buy" | "sell";
  amount: number;
  odds: number;
}

export interface ExecutionResult {
  success: boolean;
  copyTrade?: CopyTrade;
  error?: string;
}

export interface ExecutionConfig {
  maxSlippage: number;           // Maximum acceptable slippage
  retryAttempts: number;         // Number of retry attempts
  retryDelayMs: number;          // Delay between retries
  minCopyAmount: number;         // Minimum amount to copy
  maxCopyAmount: number;         // Maximum amount per copy
}

// ============================================================================
// COPY EXECUTOR
// ============================================================================

export class CopyExecutor {
  private config: ExecutionConfig = {
    maxSlippage: 0.05,           // 5% max slippage
    retryAttempts: 3,
    retryDelayMs: 1000,
    minCopyAmount: 1,
    maxCopyAmount: 10000,
  };

  // ============================================================================
  // EXECUTION
  // ============================================================================

  /**
   * Execute a copy trade
   */
  async executeCopy(
    subscription: CopySubscription,
    trade: TradeToExecute
  ): Promise<CopyTrade> {
    const startTime = Date.now();

    // Apply copy delay if configured
    if (subscription.copyDelaySeconds > 0) {
      await this.delay(subscription.copyDelaySeconds * 1000);
    }

    // Calculate copy amount
    const copyAmount = this.calculateCopyAmount(subscription, trade.amount);

    // Validate copy
    const validation = this.validateCopy(subscription, copyAmount, trade);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Execute the trade (mock - in production, call trading service)
    const executionResult = await this.executeTradeWithRetry(
      subscription,
      trade,
      copyAmount
    );

    const copyTrade: CopyTrade = {
      id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId: subscription.id,
      copierId: subscription.copierId,
      traderId: subscription.traderId,
      originalTradeId: trade.id,
      originalAmount: trade.amount,
      originalOdds: trade.odds,
      copiedAmount: copyAmount,
      copiedOdds: executionResult.executionPrice ?? trade.odds,
      marketId: trade.marketId,
      marketTitle: trade.marketTitle,
      side: trade.side,
      status: executionResult.success ? "executed" : "failed",
      failureReason: executionResult.error,
      executedAt: executionResult.success ? Date.now() : undefined,
      executionPrice: executionResult.executionPrice,
      slippage: executionResult.slippage,
      copyDelay: Date.now() - startTime,
      createdAt: Date.now(),
    };

    return copyTrade;
  }

  /**
   * Calculate copy amount based on subscription settings
   */
  calculateCopyAmount(subscription: CopySubscription, originalAmount: number): number {
    let copyAmount: number;

    switch (subscription.copyMode) {
      case "fixed_amount":
        copyAmount = subscription.fixedAmount ?? originalAmount;
        break;

      case "percentage_portfolio":
        const portfolioPercent = (subscription.portfolioPercentage ?? 10) / 100;
        copyAmount = subscription.allocatedCapital * portfolioPercent;
        break;

      case "proportional":
        // Copy same percentage as leader's portfolio
        copyAmount = originalAmount;
        break;

      case "fixed_ratio":
        copyAmount = originalAmount * (subscription.copyRatio ?? 1);
        break;

      default:
        copyAmount = originalAmount;
    }

    // Apply limits
    copyAmount = Math.max(this.config.minCopyAmount, copyAmount);
    copyAmount = Math.min(this.config.maxCopyAmount, copyAmount);
    copyAmount = Math.min(subscription.maxPositionSize, copyAmount);

    // Check available capital
    const availableCapital = subscription.currentValue;
    copyAmount = Math.min(availableCapital, copyAmount);

    return Math.round(copyAmount * 100) / 100;
  }

  /**
   * Validate copy before execution
   */
  validateCopy(
    subscription: CopySubscription,
    copyAmount: number,
    trade: TradeToExecute
  ): { valid: boolean; error?: string } {
    // Check if subscription is active
    if (subscription.status !== "active") {
      return { valid: false, error: "Subscription is not active" };
    }

    // Check minimum amount
    if (copyAmount < this.config.minCopyAmount) {
      return { valid: false, error: `Copy amount ${copyAmount} below minimum` };
    }

    // Check available capital
    if (copyAmount > subscription.currentValue) {
      return { valid: false, error: "Insufficient capital" };
    }

    // Check position size limit
    if (copyAmount > subscription.maxPositionSize) {
      return { valid: false, error: "Exceeds max position size" };
    }

    // Check daily loss limit (simplified - track in production)
    // This would check cumulative daily losses

    // Check total exposure limit
    // This would check current open positions

    // Check excluded markets
    if (subscription.excludedMarkets.includes(trade.marketId)) {
      return { valid: false, error: "Market is excluded" };
    }

    // Check odds limits
    if (subscription.minOdds && trade.odds < subscription.minOdds) {
      return { valid: false, error: "Odds below minimum" };
    }

    if (subscription.maxOdds && trade.odds > subscription.maxOdds) {
      return { valid: false, error: "Odds above maximum" };
    }

    return { valid: true };
  }

  /**
   * Execute trade with retry logic
   */
  private async executeTradeWithRetry(
    subscription: CopySubscription,
    trade: TradeToExecute,
    copyAmount: number
  ): Promise<{
    success: boolean;
    executionPrice?: number;
    slippage?: number;
    error?: string;
  }> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.executeTrade(trade, copyAmount);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error";

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Execute trade (mock implementation)
   */
  private async executeTrade(
    trade: TradeToExecute,
    amount: number
  ): Promise<{
    success: boolean;
    executionPrice: number;
    slippage: number;
  }> {
    // Simulate execution delay
    await this.delay(50 + Math.random() * 200);

    // Simulate slippage (small random variation)
    const slippage = (Math.random() - 0.5) * 0.02; // +/- 1%
    const executionPrice = trade.odds * (1 + slippage);

    // Check if slippage is acceptable
    if (Math.abs(slippage) > this.config.maxSlippage) {
      throw new Error(`Slippage ${slippage.toFixed(4)} exceeds maximum`);
    }

    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error("Market temporarily unavailable");
    }

    return {
      success: true,
      executionPrice,
      slippage,
    };
  }

  // ============================================================================
  // SETTLEMENT
  // ============================================================================

  /**
   * Settle a copy trade (when original trade resolves)
   */
  async settleCopyTrade(
    copyTrade: CopyTrade,
    result: "win" | "loss" | "push",
    payout: number
  ): Promise<CopyTrade> {
    copyTrade.result = result;
    copyTrade.settledAt = Date.now();

    // Calculate PnL
    if (result === "win") {
      copyTrade.pnl = payout - copyTrade.copiedAmount;
    } else if (result === "loss") {
      copyTrade.pnl = -copyTrade.copiedAmount;
    } else {
      copyTrade.pnl = 0;
    }

    copyTrade.pnlPercent = (copyTrade.pnl ?? 0) / copyTrade.copiedAmount;

    return copyTrade;
  }

  /**
   * Calculate and apply performance fee
   */
  calculatePerformanceFee(
    copyTrade: CopyTrade,
    performanceFeePercent: number
  ): { feeAmount: number; netPnL: number } {
    const pnl = copyTrade.pnl ?? 0;

    // Only charge fee on profits
    if (pnl <= 0) {
      return { feeAmount: 0, netPnL: pnl };
    }

    const feeAmount = pnl * (performanceFeePercent / 100);
    const netPnL = pnl - feeAmount;

    copyTrade.feeAmount = feeAmount;
    copyTrade.feePercent = performanceFeePercent;

    return { feeAmount, netPnL };
  }

  // ============================================================================
  // RISK MANAGEMENT
  // ============================================================================

  /**
   * Check if daily loss limit is reached
   */
  checkDailyLossLimit(
    subscription: CopySubscription,
    dailyTrades: CopyTrade[]
  ): boolean {
    const dailyLoss = dailyTrades
      .filter((t) => t.result === "loss")
      .reduce((sum, t) => sum + Math.abs(t.pnl ?? 0), 0);

    return dailyLoss >= subscription.maxDailyLoss;
  }

  /**
   * Check total exposure
   */
  checkTotalExposure(
    subscription: CopySubscription,
    openTrades: CopyTrade[]
  ): boolean {
    const totalExposure = openTrades.reduce(
      (sum, t) => sum + t.copiedAmount,
      0
    );

    return totalExposure >= subscription.maxTotalExposure;
  }

  /**
   * Apply stop loss if needed
   */
  async checkStopLoss(
    copyTrade: CopyTrade,
    currentPrice: number,
    stopLossPercent: number
  ): Promise<{ triggered: boolean; action?: "close" }> {
    if (!copyTrade.executionPrice) return { triggered: false };

    const pnlPercent = (currentPrice - copyTrade.executionPrice) / copyTrade.executionPrice;

    if (pnlPercent <= -stopLossPercent) {
      return { triggered: true, action: "close" };
    }

    return { triggered: false };
  }

  /**
   * Apply take profit if needed
   */
  async checkTakeProfit(
    copyTrade: CopyTrade,
    currentPrice: number,
    takeProfitPercent: number
  ): Promise<{ triggered: boolean; action?: "close" }> {
    if (!copyTrade.executionPrice) return { triggered: false };

    const pnlPercent = (currentPrice - copyTrade.executionPrice) / copyTrade.executionPrice;

    if (pnlPercent >= takeProfitPercent) {
      return { triggered: true, action: "close" };
    }

    return { triggered: false };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update executor configuration
   */
  updateConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ExecutionConfig {
    return { ...this.config };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let copyExecutor: CopyExecutor | null = null;

export function getCopyExecutor(): CopyExecutor {
  if (!copyExecutor) {
    copyExecutor = new CopyExecutor();
  }
  return copyExecutor;
}

export function createCopyExecutor(): CopyExecutor {
  return new CopyExecutor();
}
