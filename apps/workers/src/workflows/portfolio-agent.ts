import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";
import type * as activities from "../activities/portfolio";

const {
  executeDcaPurchase,
  executeRebalanceTrade,
  executeStopLoss,
  executeTakeProfit,
  placeOpportunisticBid,
  getMarketPrice,
  getUserPositions,
  getUserBalance,
  sendMorningBriefNotification,
  sendStrategyNotification,
  updateStrategyStatus,
  recordPortfolioAudit,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

// ============================================================================
// Signals & Queries
// ============================================================================

/** Signal to pause the agent */
export const pauseAgentSignal = defineSignal("pauseAgent");

/** Signal to resume the agent */
export const resumeAgentSignal = defineSignal("resumeAgent");

/** Signal to cancel a specific strategy */
export const cancelStrategySignal = defineSignal<[string]>("cancelStrategy");

/** Signal to update strategy parameters */
export const updateStrategySignal = defineSignal<[{ strategyId: string; updates: Record<string, unknown> }]>("updateStrategy");

/** Query for agent status */
export const agentStatusQuery = defineQuery<{
  isPaused: boolean;
  activeStrategies: string[];
  lastExecutionAt: number | null;
  totalExecutions: number;
}>("agentStatus");

// ============================================================================
// DCA Workflow
// ============================================================================

interface DcaWorkflowParams {
  strategyId: string;
  userId: string;
  symbol: string;
  side: string;
  amount: number;
  interval: "hourly" | "daily" | "weekly" | "biweekly" | "monthly";
  totalBudget?: number;
  assetClass: string;
  autoExecute: boolean;
  maxPrice?: number;
}

/**
 * DCA (Dollar-Cost Averaging) Workflow
 *
 * Executes periodic purchases of a specified asset.
 * Runs indefinitely until budget is exhausted, cancelled, or paused.
 */
export async function dcaStrategyWorkflow(params: DcaWorkflowParams): Promise<{
  totalExecutions: number;
  totalSpent: number;
  finalStatus: string;
}> {
  const {
    strategyId,
    userId,
    symbol,
    side,
    amount,
    interval,
    totalBudget,
    assetClass,
    autoExecute,
  } = params;

  let isPaused = false;
  let isCancelled = false;
  let totalExecutions = 0;
  let totalSpent = 0;

  // Set up signal handlers
  setHandler(pauseAgentSignal, () => {
    isPaused = true;
  });

  setHandler(resumeAgentSignal, () => {
    isPaused = false;
  });

  setHandler(cancelStrategySignal, (id: string) => {
    if (id === strategyId) {
      isCancelled = true;
    }
  });

  // Query handler
  setHandler(agentStatusQuery, () => ({
    isPaused,
    activeStrategies: [strategyId],
    lastExecutionAt: totalExecutions > 0 ? Date.now() : null,
    totalExecutions,
  }));

  try {
    while (!isCancelled) {
      // Wait while paused
      await condition(() => !isPaused || isCancelled);
      if (isCancelled) break;

      // Check budget
      if (totalBudget && totalSpent >= totalBudget) {
        await updateStrategyStatus(strategyId, "completed", {
          reason: "budget_exhausted",
          totalSpent,
          totalExecutions,
        });
        break;
      }

      // Check user balance
      const balance = await getUserBalance(userId);
      if (balance.available < amount) {
        await sendStrategyNotification(
          userId,
          "dca",
          `DCA Paused: Insufficient funds`,
          `Your DCA for ${symbol} needs $${amount} but only $${balance.available.toFixed(2)} available`,
          true
        );
        isPaused = true;
        continue;
      }

      // Get current market price
      const marketPrice = await getMarketPrice(symbol, assetClass);

      if (autoExecute) {
        // Execute the DCA purchase
        const result = await executeDcaPurchase(userId, symbol, side, amount, assetClass);

        if (result.status === "submitted") {
          totalExecutions++;
          totalSpent += amount;

          await recordPortfolioAudit(userId, "dca_executed", {
            strategyId,
            symbol,
            amount,
            orderId: result.orderId,
            executionNumber: totalExecutions,
            totalSpent,
            marketPrice: marketPrice.price,
          });
        } else {
          await sendStrategyNotification(
            userId,
            "dca",
            `DCA Failed: ${symbol}`,
            `Failed to execute DCA purchase of $${amount} in ${symbol}`,
            true
          );
        }
      } else {
        // Notify user for approval
        await sendStrategyNotification(
          userId,
          "dca",
          `DCA Ready: ${symbol}`,
          `Time to buy $${amount} of ${symbol} at $${marketPrice.price.toFixed(2)}. Approve to execute.`,
          true
        );
      }

      // Sleep until next execution
      const sleepDuration = getIntervalDuration(interval);
      await sleep(sleepDuration);
    }

    return {
      totalExecutions,
      totalSpent,
      finalStatus: isCancelled ? "cancelled" : "completed",
    };
  } catch (error) {
    if (isCancellation(error)) {
      await updateStrategyStatus(strategyId, "cancelled");
      throw error;
    }
    await updateStrategyStatus(strategyId, "failed", { error: String(error) });
    throw error;
  }
}

// ============================================================================
// Portfolio Monitoring Workflow
// ============================================================================

interface MonitoringWorkflowParams {
  userId: string;
  strategies: Array<{
    strategyId: string;
    type: "stop_loss" | "take_profit";
    symbol: string;
    triggerType: "absolute" | "percent_from_entry" | "trailing_percent";
    triggerValue: number;
    triggerPrice?: number;
    actionOnTrigger: "sell_all" | "sell_half" | "sell_quarter" | "notify_only";
    entryPrice: number;
  }>;
  checkIntervalMs: number; // How often to check prices
  autoExecute: boolean;
}

/**
 * Portfolio Monitoring Workflow
 *
 * Continuously monitors positions for stop-loss and take-profit triggers.
 * Runs until all strategies are resolved or workflow is cancelled.
 */
export async function portfolioMonitoringWorkflow(
  params: MonitoringWorkflowParams
): Promise<{
  triggeredStrategies: Array<{ strategyId: string; type: string; symbol: string; price: number }>;
  totalChecks: number;
}> {
  const { userId, strategies, checkIntervalMs, autoExecute } = params;

  let isPaused = false;
  let activeStrategies = [...strategies];
  const triggeredStrategies: Array<{
    strategyId: string;
    type: string;
    symbol: string;
    price: number;
  }> = [];
  let totalChecks = 0;
  let trailingHighs: Record<string, number> = {};

  setHandler(pauseAgentSignal, () => {
    isPaused = true;
  });

  setHandler(resumeAgentSignal, () => {
    isPaused = false;
  });

  setHandler(cancelStrategySignal, (id: string) => {
    activeStrategies = activeStrategies.filter((s) => s.strategyId !== id);
  });

  setHandler(agentStatusQuery, () => ({
    isPaused,
    activeStrategies: activeStrategies.map((s) => s.strategyId),
    lastExecutionAt: totalChecks > 0 ? Date.now() : null,
    totalExecutions: totalChecks,
  }));

  try {
    while (activeStrategies.length > 0) {
      await condition(() => !isPaused || activeStrategies.length === 0);
      if (activeStrategies.length === 0) break;

      // Check all active strategies
      const positions = await getUserPositions(userId);

      for (const strategy of [...activeStrategies]) {
        const position = positions.find((p) => p.symbol === strategy.symbol);
        if (!position) continue;

        const currentPrice = position.currentPrice;
        let shouldTrigger = false;

        // Update trailing highs for trailing stops
        if (strategy.triggerType === "trailing_percent") {
          const prevHigh = trailingHighs[strategy.symbol] ?? currentPrice;
          trailingHighs[strategy.symbol] = Math.max(prevHigh, currentPrice);
        }

        // Check trigger conditions
        if (strategy.type === "stop_loss") {
          switch (strategy.triggerType) {
            case "absolute":
              shouldTrigger = currentPrice <= (strategy.triggerPrice ?? 0);
              break;
            case "percent_from_entry":
              const lossPercent = ((strategy.entryPrice - currentPrice) / strategy.entryPrice) * 100;
              shouldTrigger = lossPercent >= strategy.triggerValue;
              break;
            case "trailing_percent":
              const highPrice = trailingHighs[strategy.symbol] ?? strategy.entryPrice;
              const trailingLoss = ((highPrice - currentPrice) / highPrice) * 100;
              shouldTrigger = trailingLoss >= strategy.triggerValue;
              break;
          }
        } else if (strategy.type === "take_profit") {
          switch (strategy.triggerType) {
            case "absolute":
              shouldTrigger = currentPrice >= (strategy.triggerPrice ?? Infinity);
              break;
            case "percent_from_entry":
              const gainPercent = ((currentPrice - strategy.entryPrice) / strategy.entryPrice) * 100;
              shouldTrigger = gainPercent >= strategy.triggerValue;
              break;
          }
        }

        if (shouldTrigger) {
          // Determine quantity based on action
          let sellQuantity = position.quantity;
          if (strategy.actionOnTrigger === "sell_half") {
            sellQuantity = Math.floor(position.quantity / 2);
          } else if (strategy.actionOnTrigger === "sell_quarter") {
            sellQuantity = Math.floor(position.quantity / 4);
          }

          if (strategy.actionOnTrigger === "notify_only" || !autoExecute) {
            // Just notify
            await sendStrategyNotification(
              userId,
              strategy.type,
              `${strategy.type === "stop_loss" ? "Stop-Loss" : "Take-Profit"} Alert: ${strategy.symbol}`,
              `${strategy.symbol} at $${currentPrice.toFixed(2)} has hit your ${strategy.type} trigger (entry: $${strategy.entryPrice.toFixed(2)})`,
              true
            );
          } else {
            // Execute the trade
            if (strategy.type === "stop_loss") {
              await executeStopLoss(userId, strategy.symbol, sellQuantity, currentPrice);
            } else {
              await executeTakeProfit(userId, strategy.symbol, sellQuantity, currentPrice);
            }

            await sendStrategyNotification(
              userId,
              strategy.type,
              `${strategy.type === "stop_loss" ? "Stop-Loss" : "Take-Profit"} Executed: ${strategy.symbol}`,
              `Sold ${sellQuantity} ${strategy.symbol} at $${currentPrice.toFixed(2)}`,
              false
            );
          }

          triggeredStrategies.push({
            strategyId: strategy.strategyId,
            type: strategy.type,
            symbol: strategy.symbol,
            price: currentPrice,
          });

          // Remove from active strategies
          activeStrategies = activeStrategies.filter(
            (s) => s.strategyId !== strategy.strategyId
          );

          await updateStrategyStatus(strategy.strategyId, "completed", {
            triggeredAt: Date.now(),
            triggerPrice: currentPrice,
          });

          await recordPortfolioAudit(userId, `${strategy.type}_triggered`, {
            strategyId: strategy.strategyId,
            symbol: strategy.symbol,
            currentPrice,
            entryPrice: strategy.entryPrice,
          });
        }
      }

      totalChecks++;
      await sleep(checkIntervalMs);
    }

    return { triggeredStrategies, totalChecks };
  } catch (error) {
    if (isCancellation(error)) {
      for (const s of activeStrategies) {
        await updateStrategyStatus(s.strategyId, "cancelled");
      }
      throw error;
    }
    throw error;
  }
}

// ============================================================================
// Rebalancing Workflow
// ============================================================================

interface RebalanceWorkflowParams {
  strategyId: string;
  userId: string;
  targetAllocations: Array<{
    symbol: string;
    assetClass: string;
    targetPercent: number;
    tolerance: number;
  }>;
  frequency: "daily" | "weekly" | "monthly" | "threshold_only";
  autoExecute: boolean;
  maxTradeSize: number; // Max USD per individual trade
}

/**
 * Portfolio Rebalancing Workflow
 *
 * Periodically checks portfolio allocations and rebalances to targets.
 */
export async function rebalanceStrategyWorkflow(
  params: RebalanceWorkflowParams
): Promise<{
  rebalanceCount: number;
  totalTraded: number;
  finalStatus: string;
}> {
  const {
    strategyId,
    userId,
    targetAllocations,
    frequency,
    autoExecute,
    maxTradeSize,
  } = params;

  let isPaused = false;
  let isCancelled = false;
  let rebalanceCount = 0;
  let totalTraded = 0;

  setHandler(pauseAgentSignal, () => {
    isPaused = true;
  });

  setHandler(resumeAgentSignal, () => {
    isPaused = false;
  });

  setHandler(cancelStrategySignal, (id: string) => {
    if (id === strategyId) {
      isCancelled = true;
    }
  });

  setHandler(agentStatusQuery, () => ({
    isPaused,
    activeStrategies: [strategyId],
    lastExecutionAt: rebalanceCount > 0 ? Date.now() : null,
    totalExecutions: rebalanceCount,
  }));

  try {
    while (!isCancelled) {
      await condition(() => !isPaused || isCancelled);
      if (isCancelled) break;

      // Get current positions
      const positions = await getUserPositions(userId);
      const balance = await getUserBalance(userId);

      // Calculate total portfolio value
      const totalPositionValue = positions.reduce(
        (sum, p) => sum + p.quantity * p.currentPrice,
        0
      );
      const totalValue = totalPositionValue + balance.available;

      if (totalValue <= 0) {
        await sleep(getIntervalDuration(frequency));
        continue;
      }

      // Check each target allocation
      const trades: Array<{
        symbol: string;
        assetClass: string;
        side: "buy" | "sell";
        amount: number;
      }> = [];

      for (const target of targetAllocations) {
        const position = positions.find((p) => p.symbol === target.symbol);
        const currentValue = position
          ? position.quantity * position.currentPrice
          : 0;
        const currentPercent = (currentValue / totalValue) * 100;
        const deviation = currentPercent - target.targetPercent;

        if (Math.abs(deviation) > target.tolerance) {
          const adjustmentValue = Math.abs(deviation / 100) * totalValue;
          const tradeAmount = Math.min(adjustmentValue, maxTradeSize);

          trades.push({
            symbol: target.symbol,
            assetClass: target.assetClass,
            side: deviation > 0 ? "sell" : "buy",
            amount: tradeAmount,
          });
        }
      }

      if (trades.length > 0) {
        if (autoExecute) {
          // Execute rebalancing trades
          for (const trade of trades) {
            const quantity = Math.floor(trade.amount / 1); // Simplified - needs market price
            const result = await executeRebalanceTrade(
              userId,
              trade.symbol,
              trade.side,
              quantity,
              undefined
            );

            if (result.status === "submitted") {
              totalTraded += trade.amount;
            }
          }

          rebalanceCount++;

          await sendStrategyNotification(
            userId,
            "rebalance",
            "Portfolio Rebalanced",
            `Executed ${trades.length} trades to align with target allocations`,
            false
          );
        } else {
          await sendStrategyNotification(
            userId,
            "rebalance",
            "Rebalance Needed",
            `${trades.length} position(s) deviate from targets. Approve to rebalance.`,
            true
          );
        }

        await recordPortfolioAudit(userId, "rebalance_check", {
          strategyId,
          tradesNeeded: trades.length,
          executed: autoExecute,
          rebalanceNumber: rebalanceCount,
        });
      }

      // Sleep until next check
      const sleepDuration = getIntervalDuration(frequency);
      await sleep(sleepDuration);
    }

    return {
      rebalanceCount,
      totalTraded,
      finalStatus: isCancelled ? "cancelled" : "completed",
    };
  } catch (error) {
    if (isCancellation(error)) {
      await updateStrategyStatus(strategyId, "cancelled");
      throw error;
    }
    await updateStrategyStatus(strategyId, "failed", { error: String(error) });
    throw error;
  }
}

// ============================================================================
// Morning Brief Workflow
// ============================================================================

interface MorningBriefWorkflowParams {
  userId: string;
  briefId: string;
  headline: string;
  channels: Array<"push" | "email" | "in_app">;
}

/**
 * Morning Brief Delivery Workflow
 *
 * Delivers the generated morning brief through configured channels.
 */
export async function morningBriefDeliveryWorkflow(
  params: MorningBriefWorkflowParams
): Promise<{
  delivered: Array<{ channel: string; success: boolean }>;
}> {
  const { userId, briefId, headline, channels } = params;
  const delivered: Array<{ channel: string; success: boolean }> = [];

  for (const channel of channels) {
    try {
      await sendMorningBriefNotification(userId, briefId, headline, channel);
      delivered.push({ channel, success: true });
    } catch (error) {
      console.error(`Failed to deliver brief via ${channel}:`, error);
      delivered.push({ channel, success: false });
    }
  }

  await recordPortfolioAudit(userId, "morning_brief_delivered", {
    briefId,
    channels: delivered,
  });

  return { delivered };
}

// ============================================================================
// Helpers
// ============================================================================

function getIntervalDuration(
  interval: "hourly" | "daily" | "weekly" | "biweekly" | "monthly" | "threshold_only"
): string {
  switch (interval) {
    case "hourly":
      return "1 hour";
    case "daily":
      return "24 hours";
    case "weekly":
      return "7 days";
    case "biweekly":
      return "14 days";
    case "monthly":
      return "30 days";
    case "threshold_only":
      return "1 hour"; // Check hourly for threshold-based triggers
    default:
      return "24 hours";
  }
}
