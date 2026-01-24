/**
 * Inngest Functions for Autonomous Portfolio Agent
 *
 * Background job processing for:
 * - Morning brief generation (scheduled)
 * - Strategy execution monitoring
 * - Price trigger checking
 * - Opportunity detection
 * - DCA execution
 */

import { inngest } from "../client";

// ============================================================================
// MORNING BRIEF GENERATION (Scheduled)
// ============================================================================

/**
 * Generate morning briefs for all active users
 * Runs daily at their configured time (UTC batch at 6am, 7am, 8am etc)
 */
export const generateMorningBriefs = inngest.createFunction(
  {
    id: "portfolio-agent-morning-briefs",
    name: "Generate Portfolio Morning Briefs",
    retries: 2,
  },
  { cron: "0 6,7,8,9,10,11,12,13,14 * * *" }, // Run every hour from 6-14 UTC to cover timezones
  async ({ step }) => {
    const currentHourUTC = new Date().getUTCHours();

    // Step 1: Get users whose morning brief time matches this hour
    const users = await step.run("fetch-users-for-briefs", async () => {
      return await fetchUsersForMorningBrief(currentHourUTC);
    });

    if (users.length === 0) {
      return { status: "completed", usersProcessed: 0 };
    }

    // Step 2: Generate briefs in batches
    const batchSize = 5;
    let processedCount = 0;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await step.run(`generate-briefs-batch-${i}`, async () => {
        for (const user of batch) {
          try {
            await triggerMorningBriefGeneration(user.userId);
            processedCount++;
          } catch (error) {
            console.error(`Error generating brief for user ${user.userId}:`, error);
          }
        }
      });
    }

    return {
      status: "completed",
      hour: currentHourUTC,
      usersProcessed: processedCount,
      totalUsers: users.length,
    };
  }
);

// ============================================================================
// STRATEGY EXECUTION MONITOR (Scheduled)
// ============================================================================

/**
 * Check for strategies due for execution
 * Runs every 5 minutes
 */
export const executePortfolioStrategies = inngest.createFunction(
  {
    id: "portfolio-agent-execute-strategies",
    name: "Execute Portfolio Strategies",
    retries: 2,
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    // Step 1: Get strategies due for execution
    const dueStrategies = await step.run("fetch-due-strategies", async () => {
      return await fetchStrategiesDueForExecution();
    });

    if (dueStrategies.length === 0) {
      return { status: "completed", strategiesExecuted: 0 };
    }

    // Step 2: Execute each strategy
    const results = await step.run("execute-strategies", async () => {
      const executed: Array<{ strategyId: string; type: string; result: string }> = [];

      for (const strategy of dueStrategies) {
        try {
          const result = await executeStrategy(strategy);
          executed.push({
            strategyId: strategy.strategyId,
            type: strategy.type,
            result: result.status,
          });
        } catch (error) {
          console.error(`Error executing strategy ${strategy.strategyId}:`, error);
          executed.push({
            strategyId: strategy.strategyId,
            type: strategy.type,
            result: "error",
          });
        }
      }

      return executed;
    });

    return {
      status: "completed",
      strategiesChecked: dueStrategies.length,
      results,
    };
  }
);

// ============================================================================
// PRICE TRIGGER CHECKER (Frequent)
// ============================================================================

/**
 * Check stop-loss and take-profit price triggers
 * Runs every minute during market hours
 */
export const checkPriceTriggers = inngest.createFunction(
  {
    id: "portfolio-agent-check-triggers",
    name: "Check Portfolio Price Triggers",
    retries: 1, // Fast retry - price checks should be quick
  },
  { cron: "* * * * *" }, // Every minute
  async ({ step }) => {
    // Step 1: Get all active stop-loss and take-profit strategies
    const triggerStrategies = await step.run("fetch-trigger-strategies", async () => {
      return await fetchActiveTriggerStrategies();
    });

    if (triggerStrategies.length === 0) {
      return { status: "completed", checked: 0, triggered: 0 };
    }

    // Step 2: Group by symbol to minimize market data calls
    const bySymbol = new Map<string, typeof triggerStrategies>();
    for (const strategy of triggerStrategies) {
      const existing = bySymbol.get(strategy.symbol) ?? [];
      existing.push(strategy);
      bySymbol.set(strategy.symbol, existing);
    }

    // Step 3: Check each symbol
    const triggered: Array<{ strategyId: string; symbol: string; type: string }> = [];

    const results = await step.run("check-prices", async () => {
      for (const [symbol, strategies] of bySymbol.entries()) {
        const price = await fetchCurrentPrice(symbol);
        if (!price) continue;

        for (const strategy of strategies) {
          const shouldTrigger = evaluateTrigger(strategy, price.currentPrice);

          if (shouldTrigger) {
            await handleTriggerActivation(strategy, price.currentPrice);
            triggered.push({
              strategyId: strategy.strategyId,
              symbol: strategy.symbol,
              type: strategy.type,
            });
          }
        }
      }

      return triggered;
    });

    return {
      status: "completed",
      symbolsChecked: bySymbol.size,
      strategiesChecked: triggerStrategies.length,
      triggered: results.length,
      triggeredDetails: results,
    };
  }
);

// ============================================================================
// OPPORTUNITY DETECTION (Scheduled)
// ============================================================================

/**
 * Detect opportunities for users with active agents
 * Runs every 30 minutes
 */
export const detectPortfolioOpportunities = inngest.createFunction(
  {
    id: "portfolio-agent-detect-opportunities",
    name: "Detect Portfolio Opportunities",
    retries: 2,
    throttle: {
      limit: 1,
      period: "25m", // Prevent overlapping runs
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    // Step 1: Get users with active agents and opportunity detection enabled
    const users = await step.run("fetch-active-agent-users", async () => {
      return await fetchUsersWithActiveAgents();
    });

    if (users.length === 0) {
      return { status: "completed", usersChecked: 0 };
    }

    // Step 2: Detect opportunities per user (batched)
    const batchSize = 3; // Small batches since AI calls are expensive
    let opportunitiesFound = 0;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await step.run(`detect-opportunities-batch-${i}`, async () => {
        for (const user of batch) {
          try {
            const count = await triggerOpportunityDetection(user.userId);
            opportunitiesFound += count;
          } catch (error) {
            console.error(`Error detecting opportunities for user ${user.userId}:`, error);
          }
        }
      });
    }

    return {
      status: "completed",
      usersChecked: users.length,
      opportunitiesFound,
    };
  }
);

// ============================================================================
// PORTFOLIO HEALTH CHECK (Daily)
// ============================================================================

/**
 * Daily portfolio health check - concentration risk, drawdowns, stale positions
 * Runs daily at 2am UTC
 */
export const portfolioHealthCheck = inngest.createFunction(
  {
    id: "portfolio-agent-health-check",
    name: "Portfolio Health Check",
    retries: 2,
  },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    const users = await step.run("fetch-users", async () => {
      return await fetchUsersWithActiveAgents();
    });

    if (users.length === 0) {
      return { status: "completed", usersChecked: 0 };
    }

    const results = await step.run("run-health-checks", async () => {
      const alerts: Array<{ userId: string; alertType: string; severity: string }> = [];

      for (const user of users) {
        try {
          const userAlerts = await runPortfolioHealthCheck(user.userId);
          alerts.push(...userAlerts.map((a) => ({ userId: user.userId, ...a })));
        } catch (error) {
          console.error(`Health check failed for user ${user.userId}:`, error);
        }
      }

      return alerts;
    });

    return {
      status: "completed",
      usersChecked: users.length,
      alertsGenerated: results.length,
      alerts: results,
    };
  }
);

// ============================================================================
// EVENT-DRIVEN: Market Price Update Handler
// ============================================================================

/**
 * Handle market price updates for trigger evaluation
 */
export const handleMarketPriceUpdate = inngest.createFunction(
  {
    id: "portfolio-agent-market-update",
    name: "Portfolio Agent Market Update",
    throttle: {
      limit: 60,
      period: "1m",
      key: "event.data.ticker",
    },
    retries: 1,
  },
  { event: "market-data/updated" },
  async ({ event, step }) => {
    const { ticker, currentPrice, priceChangePercent } = event.data;

    // Only process significant price changes
    if (Math.abs(priceChangePercent) < 2) {
      return { status: "skipped", reason: "insignificant_change" };
    }

    // Check if any users have triggers on this symbol
    const affectedStrategies = await step.run("check-affected-strategies", async () => {
      return await fetchStrategiesForSymbol(ticker);
    });

    if (affectedStrategies.length === 0) {
      return { status: "completed", affected: 0 };
    }

    // Evaluate triggers
    const triggered = await step.run("evaluate-triggers", async () => {
      const results: Array<{ strategyId: string; userId: string }> = [];

      for (const strategy of affectedStrategies) {
        const shouldTrigger = evaluateTrigger(strategy, currentPrice);
        if (shouldTrigger) {
          await handleTriggerActivation(strategy, currentPrice);
          results.push({
            strategyId: strategy.strategyId,
            userId: strategy.userId,
          });
        }
      }

      return results;
    });

    return {
      status: "completed",
      ticker,
      priceChange: priceChangePercent,
      strategiesChecked: affectedStrategies.length,
      triggered: triggered.length,
    };
  }
);

// ============================================================================
// EVENT-DRIVEN: RWA Price Alert Handler
// ============================================================================

/**
 * Handle RWA price changes for opportunistic buy strategies
 */
export const handleRwaPriceAlert = inngest.createFunction(
  {
    id: "portfolio-agent-rwa-alert",
    name: "Portfolio Agent RWA Price Alert",
    retries: 2,
  },
  { event: "rwa/price-alert" },
  async ({ event, step }) => {
    const { assetId, assetName, previousPrice, currentPrice, priceChangePercent, affectedUserIds } = event.data;

    // Only process price drops (potential opportunities)
    if (priceChangePercent >= 0) {
      return { status: "skipped", reason: "price_increase" };
    }

    // Check users with opportunistic buy strategies for this asset type
    const opportunities = await step.run("check-opportunity-strategies", async () => {
      const results: Array<{ userId: string; strategyId: string }> = [];

      for (const userId of affectedUserIds) {
        const userStrategies = await fetchUserOpportunityStrategies(userId);

        for (const strategy of userStrategies) {
          if (
            strategy.opportunityMaxPrice &&
            currentPrice <= strategy.opportunityMaxPrice &&
            currentPrice <= previousPrice * 0.85 // At least 15% below previous
          ) {
            await createOpportunityAction(userId, strategy.strategyId, {
              symbol: assetId,
              assetName,
              currentPrice,
              previousPrice,
              discount: Math.abs(priceChangePercent),
            });
            results.push({ userId, strategyId: strategy.strategyId });
          }
        }
      }

      return results;
    });

    return {
      status: "completed",
      asset: assetName,
      priceChange: priceChangePercent,
      opportunitiesCreated: opportunities.length,
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS / DATA FETCHING STUBS
// ============================================================================

interface UserForBrief {
  userId: string;
  displayName?: string;
  timezone: string;
  morningBriefTime: string;
}

interface StrategyForExecution {
  strategyId: string;
  userId: string;
  type: "dca" | "rebalance" | "stop_loss" | "take_profit" | "opportunistic_buy";
  configId: string;
  // DCA fields
  dcaAmount?: number;
  dcaTargetSymbol?: string;
  dcaTargetSide?: string;
  dcaInterval?: string;
  // Trigger fields
  symbol: string;
  triggerType: "absolute" | "percent_from_entry" | "trailing_percent";
  triggerValue: number;
  triggerPrice?: number;
  entryPrice: number;
  actionOnTrigger: "sell_all" | "sell_half" | "sell_quarter" | "notify_only";
  autoExecute: boolean;
  // Opportunity fields
  opportunityMaxPrice?: number;
  opportunityBudget?: number;
}

async function fetchUsersForMorningBrief(currentHourUTC: number): Promise<UserForBrief[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getUsersForMorningBrief",
        args: { hourUTC: currentHourUTC },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchStrategiesDueForExecution(): Promise<StrategyForExecution[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getStrategiesDueForExecution",
        args: {},
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchActiveTriggerStrategies(): Promise<StrategyForExecution[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getActiveTriggerStrategies",
        args: {},
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchStrategiesForSymbol(symbol: string): Promise<StrategyForExecution[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getStrategiesForSymbol",
        args: { symbol },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchUsersWithActiveAgents(): Promise<Array<{ userId: string }>> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getUsersWithActiveAgents",
        args: {},
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchCurrentPrice(symbol: string): Promise<{ currentPrice: number } | null> {
  // In production, fetch from Kalshi/market data service
  return { currentPrice: 50.0 };
}

async function fetchUserOpportunityStrategies(userId: string): Promise<StrategyForExecution[]> {
  return [];
}

function evaluateTrigger(strategy: StrategyForExecution, currentPrice: number): boolean {
  if (strategy.type === "stop_loss") {
    switch (strategy.triggerType) {
      case "absolute":
        return currentPrice <= (strategy.triggerPrice ?? 0);
      case "percent_from_entry":
        const lossPercent = ((strategy.entryPrice - currentPrice) / strategy.entryPrice) * 100;
        return lossPercent >= strategy.triggerValue;
      default:
        return false;
    }
  } else if (strategy.type === "take_profit") {
    switch (strategy.triggerType) {
      case "absolute":
        return currentPrice >= (strategy.triggerPrice ?? Infinity);
      case "percent_from_entry":
        const gainPercent = ((currentPrice - strategy.entryPrice) / strategy.entryPrice) * 100;
        return gainPercent >= strategy.triggerValue;
      default:
        return false;
    }
  }
  return false;
}

async function handleTriggerActivation(
  strategy: StrategyForExecution,
  currentPrice: number
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:handleTriggerActivation",
      args: {
        strategyId: strategy.strategyId,
        userId: strategy.userId,
        type: strategy.type,
        symbol: strategy.symbol,
        currentPrice,
        actionOnTrigger: strategy.actionOnTrigger,
        autoExecute: strategy.autoExecute,
      },
    }),
  });
}

async function triggerMorningBriefGeneration(userId: string): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "agents/portfolio-agent:generateMorningBrief",
      args: { userId },
    }),
  });
}

async function triggerOpportunityDetection(userId: string): Promise<number> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return 0;

  try {
    const response = await fetch(`${convexUrl}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "agents/portfolio-agent:detectOpportunities",
        args: { userId },
      }),
    });

    if (!response.ok) return 0;
    const result = await response.json();
    return result.value?.opportunities ?? 0;
  } catch {
    return 0;
  }
}

async function executeStrategy(strategy: StrategyForExecution): Promise<{ status: string }> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return { status: "error" };

  if (strategy.type === "dca") {
    const response = await fetch(`${convexUrl}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "agents/portfolio-agent:executeDcaStep",
        args: { strategyId: strategy.strategyId, userId: strategy.userId },
      }),
    });

    if (!response.ok) return { status: "error" };
    const result = await response.json();
    return { status: result.value?.status ?? "error" };
  } else if (strategy.type === "rebalance") {
    const response = await fetch(`${convexUrl}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "agents/portfolio-agent:checkRebalancing",
        args: { strategyId: strategy.strategyId, userId: strategy.userId },
      }),
    });

    if (!response.ok) return { status: "error" };
    const result = await response.json();
    return { status: result.value?.status ?? "error" };
  }

  return { status: "unsupported_type" };
}

async function runPortfolioHealthCheck(
  userId: string
): Promise<Array<{ alertType: string; severity: string }>> {
  // In production, analyze portfolio for:
  // - Concentration risk (>50% in one position)
  // - Drawdown alerts (>20% from peak)
  // - Stale positions (no price updates in 7+ days)
  // - Expiring prediction markets
  // - Low balance warnings
  return [];
}

async function createOpportunityAction(
  userId: string,
  strategyId: string,
  details: Record<string, unknown>
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:createOpportunityAction",
      args: { userId, strategyId, details },
    }),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const portfolioAgentFunctions = [
  generateMorningBriefs,
  executePortfolioStrategies,
  checkPriceTriggers,
  detectPortfolioOpportunities,
  portfolioHealthCheck,
  handleMarketPriceUpdate,
  handleRwaPriceAlert,
];
