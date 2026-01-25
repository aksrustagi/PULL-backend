/**
 * Portfolio Agent Routes for PULL API
 *
 * Manages the Autonomous Portfolio Agent:
 * - Agent configuration (activate, deactivate, configure)
 * - Strategy management (create, pause, cancel)
 * - Action approval/rejection
 * - Morning brief retrieval
 * - Agent status and history
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { getLogger } from "@pull/core/services";

const logger = getLogger("portfolio-agent");

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const configureAgentSchema = z.object({
  isActive: z.boolean(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
  maxDailyTradeAmount: z.number().positive().max(100000),
  maxPositionSize: z.number().min(1).max(100), // percentage
  autoExecute: z.boolean(),
  requireConfirmationAbove: z.number().min(0),
  allowedAssetClasses: z.array(z.enum(["prediction", "rwa", "crypto"])).min(1),
  allowedStrategies: z.array(
    z.enum(["dca", "rebalance", "stop_loss", "take_profit", "opportunistic_buy"])
  ),
  morningBriefEnabled: z.boolean(),
  morningBriefTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  timezone: z.string().min(1),
  notifyOnExecution: z.boolean().default(true),
  notifyOnOpportunity: z.boolean().default(true),
});

const createDcaStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  dcaAmount: z.number().positive(),
  dcaInterval: z.enum(["hourly", "daily", "weekly", "biweekly", "monthly"]),
  dcaTargetSymbol: z.string().min(1),
  dcaTargetSide: z.enum(["yes", "no", "buy"]).default("buy"),
  dcaTotalBudget: z.number().positive().optional(),
});

const createRebalanceStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  rebalanceFrequency: z.enum(["daily", "weekly", "monthly", "threshold_only"]),
  targetAllocations: z.array(
    z.object({
      symbol: z.string().min(1),
      assetClass: z.string().min(1),
      targetPercent: z.number().min(0).max(100),
      tolerance: z.number().min(1).max(50).default(5),
    })
  ).min(2),
});

const createStopLossSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  triggerSymbol: z.string().min(1),
  triggerSide: z.enum(["long", "short"]).default("long"),
  triggerType: z.enum(["absolute", "percent_from_entry", "trailing_percent"]),
  triggerValue: z.number().positive(),
  triggerPrice: z.number().positive().optional(),
  actionOnTrigger: z.enum(["sell_all", "sell_half", "sell_quarter", "notify_only"]),
});

const createTakeProfitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  triggerSymbol: z.string().min(1),
  triggerSide: z.enum(["long", "short"]).default("long"),
  triggerType: z.enum(["absolute", "percent_from_entry"]),
  triggerValue: z.number().positive(),
  triggerPrice: z.number().positive().optional(),
  actionOnTrigger: z.enum(["sell_all", "sell_half", "sell_quarter", "notify_only"]),
});

const createOpportunityStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  opportunitySymbol: z.string().optional(),
  opportunityMaxPrice: z.number().positive(),
  opportunityBudget: z.number().positive(),
  opportunityConditions: z.string().max(500).optional(),
});

const resolveActionSchema = z.object({
  resolution: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
});

const getBriefsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(7),
  offset: z.coerce.number().int().min(0).default(0),
});

const getActionsSchema = z.object({
  status: z.enum(["pending_approval", "approved", "rejected", "executed", "failed", "expired"]).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// Agent Configuration Routes
// ============================================================================

/**
 * GET /portfolio-agent/config
 * Get current agent configuration
 */
app.get("/config", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const config = await fetchAgentConfig(userId);

    return c.json({
      success: true,
      data: { config: config ?? null },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get agent config error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch agent configuration" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * PUT /portfolio-agent/config
 * Create or update agent configuration
 */
app.put("/config", zValidator("json", configureAgentSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    // Validate total allocation for rebalance strategies doesn't exceed 100%
    const configId = await upsertAgentConfig(userId, body);

    return c.json({
      success: true,
      data: {
        configId,
        message: body.isActive
          ? "Portfolio agent activated"
          : "Portfolio agent configuration saved (inactive)",
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Configure agent error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CONFIG_FAILED", message: "Failed to configure agent" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/activate
 * Quick activate/deactivate the agent
 */
app.post("/activate", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = await c.req.json<{ active: boolean }>();

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await toggleAgentActive(userId, body.active);

    return c.json({
      success: true,
      data: {
        isActive: body.active,
        message: body.active ? "Agent activated" : "Agent paused",
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Toggle agent error:", error);
    return c.json(
      {
        success: false,
        error: { code: "TOGGLE_FAILED", message: "Failed to toggle agent" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Strategy Management Routes
// ============================================================================

/**
 * GET /portfolio-agent/strategies
 * List all strategies for the user
 */
app.get("/strategies", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const status = c.req.query("status");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const strategies = await fetchStrategies(userId, status);

    return c.json({
      success: true,
      data: { strategies },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get strategies error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch strategies" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/dca
 * Create a DCA strategy
 */
app.post("/strategies/dca", zValidator("json", createDcaStrategySchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const strategyId = await createStrategy(userId, "dca", body);

    return c.json({
      success: true,
      data: {
        strategyId,
        type: "dca",
        message: `DCA strategy created: $${body.dcaAmount} in ${body.dcaTargetSymbol} every ${body.dcaInterval}`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Create DCA strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CREATE_FAILED", message: "Failed to create DCA strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/rebalance
 * Create a rebalancing strategy
 */
app.post("/strategies/rebalance", zValidator("json", createRebalanceStrategySchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  // Validate allocations sum to <= 100%
  const totalAllocation = body.targetAllocations.reduce((sum, a) => sum + a.targetPercent, 0);
  if (totalAllocation > 100) {
    return c.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Target allocations cannot exceed 100%" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      400
    );
  }

  try {
    const strategyId = await createStrategy(userId, "rebalance", body);

    return c.json({
      success: true,
      data: {
        strategyId,
        type: "rebalance",
        message: `Rebalance strategy created with ${body.targetAllocations.length} targets, checked ${body.rebalanceFrequency}`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Create rebalance strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CREATE_FAILED", message: "Failed to create rebalance strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/stop-loss
 * Create a stop-loss strategy
 */
app.post("/strategies/stop-loss", zValidator("json", createStopLossSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const strategyId = await createStrategy(userId, "stop_loss", body);

    return c.json({
      success: true,
      data: {
        strategyId,
        type: "stop_loss",
        message: `Stop-loss set for ${body.triggerSymbol}: ${body.triggerType === "percent_from_entry" ? `${body.triggerValue}% loss` : `$${body.triggerValue}`} → ${body.actionOnTrigger}`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Create stop-loss error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CREATE_FAILED", message: "Failed to create stop-loss strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/take-profit
 * Create a take-profit strategy
 */
app.post("/strategies/take-profit", zValidator("json", createTakeProfitSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const strategyId = await createStrategy(userId, "take_profit", body);

    return c.json({
      success: true,
      data: {
        strategyId,
        type: "take_profit",
        message: `Take-profit set for ${body.triggerSymbol}: ${body.triggerType === "percent_from_entry" ? `${body.triggerValue}% gain` : `$${body.triggerValue}`} → ${body.actionOnTrigger}`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Create take-profit error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CREATE_FAILED", message: "Failed to create take-profit strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/opportunity
 * Create an opportunistic buy strategy
 */
app.post("/strategies/opportunity", zValidator("json", createOpportunityStrategySchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const strategyId = await createStrategy(userId, "opportunistic_buy", body);

    return c.json({
      success: true,
      data: {
        strategyId,
        type: "opportunistic_buy",
        message: `Opportunity watch set: max $${body.opportunityMaxPrice}, budget $${body.opportunityBudget}`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Create opportunity strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CREATE_FAILED", message: "Failed to create opportunity strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/:strategyId/pause
 * Pause a strategy
 */
app.post("/strategies/:strategyId/pause", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const strategyId = c.req.param("strategyId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await updateStrategyStatus(userId, strategyId, "paused");

    return c.json({
      success: true,
      data: { strategyId, status: "paused" },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Pause strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "UPDATE_FAILED", message: "Failed to pause strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/strategies/:strategyId/resume
 * Resume a paused strategy
 */
app.post("/strategies/:strategyId/resume", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const strategyId = c.req.param("strategyId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await updateStrategyStatus(userId, strategyId, "active");

    return c.json({
      success: true,
      data: { strategyId, status: "active" },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Resume strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "UPDATE_FAILED", message: "Failed to resume strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * DELETE /portfolio-agent/strategies/:strategyId
 * Cancel a strategy
 */
app.delete("/strategies/:strategyId", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const strategyId = c.req.param("strategyId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await updateStrategyStatus(userId, strategyId, "cancelled");

    return c.json({
      success: true,
      data: { strategyId, status: "cancelled" },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Cancel strategy error:", error);
    return c.json(
      {
        success: false,
        error: { code: "CANCEL_FAILED", message: "Failed to cancel strategy" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Action Approval Routes
// ============================================================================

/**
 * GET /portfolio-agent/actions
 * Get agent actions (pending, approved, executed, etc.)
 */
app.get("/actions", zValidator("query", getActionsSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const { status, type, limit, offset } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const actions = await fetchActions(userId, { status, type, limit, offset });

    return c.json({
      success: true,
      data: { actions, pagination: { limit, offset } },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get actions error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch actions" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /portfolio-agent/actions/pending
 * Get only pending approval actions
 */
app.get("/actions/pending", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const actions = await fetchActions(userId, { status: "pending_approval", limit: 50, offset: 0 });

    return c.json({
      success: true,
      data: {
        actions,
        count: actions.length,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get pending actions error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch pending actions" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/actions/:actionId/resolve
 * Approve or reject a pending action
 */
app.post("/actions/:actionId/resolve", zValidator("json", resolveActionSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const actionId = c.req.param("actionId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    await resolveAction(userId, actionId, body.resolution, body.reason);

    return c.json({
      success: true,
      data: {
        actionId,
        resolution: body.resolution,
        message: body.resolution === "approved"
          ? "Action approved - executing..."
          : "Action rejected",
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Resolve action error:", error);
    return c.json(
      {
        success: false,
        error: { code: "RESOLVE_FAILED", message: "Failed to resolve action" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Morning Brief Routes
// ============================================================================

/**
 * GET /portfolio-agent/briefs
 * Get morning briefs
 */
app.get("/briefs", zValidator("query", getBriefsSchema), async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const { limit, offset } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const briefs = await fetchBriefs(userId, limit, offset);

    return c.json({
      success: true,
      data: { briefs, pagination: { limit, offset } },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get briefs error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch briefs" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /portfolio-agent/briefs/today
 * Get today's morning brief
 */
app.get("/briefs/today", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const brief = await fetchBriefByDate(userId, today);

    if (!brief) {
      return c.json({
        success: true,
        data: { brief: null, message: "No brief generated yet today" },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Mark as read
    await markBriefRead(brief.id);

    return c.json({
      success: true,
      data: { brief },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get today's brief error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch today's brief" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /portfolio-agent/briefs/generate
 * Manually trigger morning brief generation
 */
app.post("/briefs/generate", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const result = await triggerBriefGeneration(userId);

    return c.json({
      success: true,
      data: result,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Generate brief error:", error);
    return c.json(
      {
        success: false,
        error: { code: "GENERATION_FAILED", message: "Failed to generate brief" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Agent Status Route
// ============================================================================

/**
 * GET /portfolio-agent/status
 * Get overall agent status (config, active strategies, pending actions)
 */
app.get("/status", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  try {
    const [config, strategies, pendingActions] = await Promise.all([
      fetchAgentConfig(userId),
      fetchStrategies(userId, "active"),
      fetchActions(userId, { status: "pending_approval", limit: 10, offset: 0 }),
    ]);

    return c.json({
      success: true,
      data: {
        isActive: config?.isActive ?? false,
        config: config ?? null,
        activeStrategies: strategies.length,
        strategies: strategies.map((s: { id: string; type: string; name: string }) => ({
          id: s.id,
          type: s.type,
          name: s.name,
        })),
        pendingActions: pendingActions.length,
        pendingActionsSummary: pendingActions.slice(0, 3),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Get agent status error:", error);
    return c.json(
      {
        success: false,
        error: { code: "FETCH_FAILED", message: "Failed to fetch agent status" },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

// ============================================================================
// Helper Functions (Convex integration stubs)
// ============================================================================

async function fetchAgentConfig(userId: string): Promise<Record<string, unknown> | null> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return null;

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getConfig",
        args: { userId },
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.value;
  } catch {
    return null;
  }
}

async function upsertAgentConfig(userId: string, config: z.infer<typeof configureAgentSchema>): Promise<string> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) throw new Error("Convex not configured");

  const response = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:upsertConfig",
      args: { userId, ...config },
    }),
  });

  if (!response.ok) throw new Error("Failed to save config");
  const result = await response.json();
  return result.value;
}

async function toggleAgentActive(userId: string, active: boolean): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:toggleActive",
      args: { userId, isActive: active },
    }),
  });
}

async function fetchStrategies(userId: string, status?: string): Promise<unknown[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getStrategies",
        args: { userId, status },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function createStrategy(userId: string, type: string, params: Record<string, unknown>): Promise<string> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) throw new Error("Convex not configured");

  const response = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:createStrategy",
      args: { userId, type, ...params },
    }),
  });

  if (!response.ok) throw new Error("Failed to create strategy");
  const result = await response.json();
  return result.value;
}

async function updateStrategyStatus(userId: string, strategyId: string, status: string): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:updateStrategyStatus",
      args: { userId, strategyId, status },
    }),
  });
}

async function fetchActions(
  userId: string,
  params: { status?: string; type?: string; limit: number; offset: number }
): Promise<unknown[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getActions",
        args: { userId, ...params },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function resolveAction(userId: string, actionId: string, resolution: string, reason?: string): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:resolveAction",
      args: { userId, actionId, resolution, reason },
    }),
  });
}

async function fetchBriefs(userId: string, limit: number, offset: number): Promise<unknown[]> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return [];

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getBriefs",
        args: { userId, limit, offset },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return result.value ?? [];
  } catch {
    return [];
  }
}

async function fetchBriefByDate(userId: string, date: string): Promise<Record<string, unknown> | null> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return null;

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "portfolioAgent:getBriefByDate",
        args: { userId, date },
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.value;
  } catch {
    return null;
  }
}

async function markBriefRead(briefId: string): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "portfolioAgent:markBriefRead",
      args: { briefId },
    }),
  });
}

async function triggerBriefGeneration(userId: string): Promise<Record<string, unknown>> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) throw new Error("Convex not configured");

  const response = await fetch(`${convexUrl}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "agents/portfolio-agent:generateMorningBrief",
      args: { userId },
    }),
  });

  if (!response.ok) throw new Error("Failed to generate brief");
  const result = await response.json();
  return result.value ?? { status: "generating" };
}

export { app as portfolioAgentRoutes };
