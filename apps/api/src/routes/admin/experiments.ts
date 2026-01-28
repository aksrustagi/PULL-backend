import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";

const app = new Hono<Env>();

// ============================================================================
// Schema Definitions
// ============================================================================

const variantSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100),
  isControl: z.boolean(),
  config: z.record(z.any()),
});

const targetAudienceSchema = z.object({
  tiers: z.array(z.string()).optional(),
  cohorts: z.array(z.string()).optional(),
  percentOfUsers: z.number().min(0).max(100).optional(),
  countries: z.array(z.string()).optional(),
  platforms: z.array(z.enum(["web", "ios", "android"])).optional(),
  includeUserIds: z.array(z.string()).optional(),
  excludeUserIds: z.array(z.string()).optional(),
});

const metricSchema = z.object({
  name: z.string(),
  type: z.enum(["conversion", "revenue", "count", "duration", "custom"]),
  eventName: z.string(),
  property: z.string().optional(),
  isPrimary: z.boolean(),
  minimumDetectableEffect: z.number().optional(),
});

const createExperimentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string(),
  hypothesis: z.string(),
  variants: z.array(variantSchema).min(2),
  targetAudience: targetAudienceSchema.optional(),
  metrics: z.array(metricSchema).min(1),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(["feature_flag", "ab_test", "multivariate", "holdout", "rollout"]),
  minimumSampleSize: z.number().positive().optional(),
  minimumRunDuration: z.number().positive().optional(),
});

const updateExperimentSchema = createExperimentSchema.partial();

// ============================================================================
// Experiment CRUD
// ============================================================================

/**
 * GET /admin/experiments
 * List all experiments
 */
app.get("/", async (c) => {
  const status = c.req.query("status"); // draft, running, paused, completed, archived
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      experiments: [],
      summary: {
        total: 0,
        draft: 0,
        running: 0,
        paused: 0,
        completed: 0,
        archived: 0,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /admin/experiments/:id
 * Get experiment details
 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: null, // Experiment details
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /admin/experiments
 * Create new experiment
 */
app.post("/", zValidator("json", createExperimentSchema), async (c) => {
  const body = c.req.valid("json");

  // Validate variant weights sum to 100
  const totalWeight = body.variants.reduce((sum, v) => sum + v.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_WEIGHTS",
          message: `Variant weights must sum to 100, got ${totalWeight}`,
        },
      },
      400
    );
  }

  // Validate exactly one control variant
  const controls = body.variants.filter((v) => v.isControl);
  if (controls.length !== 1) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_CONTROL",
          message: "Experiment must have exactly one control variant",
        },
      },
      400
    );
  }

  // Admin route - implementation pending

  return c.json(
    {
      success: true,
      data: {
        id: crypto.randomUUID(),
        ...body,
        status: "draft",
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    },
    201
  );
});

/**
 * PUT /admin/experiments/:id
 * Update experiment
 */
app.put("/:id", zValidator("json", updateExperimentSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /admin/experiments/:id
 * Archive experiment
 */
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: { id, status: "archived" },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Experiment Status Actions
// ============================================================================

/**
 * POST /admin/experiments/:id/start
 * Start an experiment
 */
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      id,
      status: "running",
      startDate: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /admin/experiments/:id/pause
 * Pause an experiment
 */
app.post("/:id/pause", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      id,
      status: "paused",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /admin/experiments/:id/resume
 * Resume a paused experiment
 */
app.post("/:id/resume", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      id,
      status: "running",
    },
    timestamp: new Date().toISOString(),
  });
});

const completeSchema = z.object({
  winnerVariantId: z.string().optional(),
});

/**
 * POST /admin/experiments/:id/complete
 * Complete an experiment
 */
app.post("/:id/complete", zValidator("json", completeSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      id,
      status: "completed",
      winnerVariantId: body.winnerVariantId,
      endDate: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Experiment Results
// ============================================================================

/**
 * GET /admin/experiments/:id/results
 * Get detailed experiment results
 */
app.get("/:id/results", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      experimentId: id,
      startDate: null,
      endDate: null,
      variants: [],
      winner: null,
      statisticalSignificance: 0,
      confidence: 0.95,
      recommendedAction: "continue",
      sampleSize: 0,
      durationDays: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /admin/experiments/:id/timeline
 * Get experiment results over time
 */
app.get("/:id/timeline", async (c) => {
  const id = c.req.param("id");
  const granularity = c.req.query("granularity") ?? "daily"; // hourly, daily

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      experimentId: id,
      granularity,
      timeline: [], // Array of { date, variants: { variantId, exposures, conversions } }
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /admin/experiments/:id/stats
 * Get quick stats for an experiment
 */
app.get("/:id/stats", async (c) => {
  const id = c.req.param("id");

  // Admin route - implementation pending

  return c.json({
    success: true,
    data: {
      experimentId: id,
      variants: [],
      totalExposures: 0,
      totalConversions: 0,
      overallConversionRate: 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Sample Experiments
// ============================================================================

/**
 * GET /admin/experiments/templates
 * Get sample experiment templates
 */
app.get("/templates/list", async (c) => {
  const templates = [
    {
      id: "onboarding-flow",
      name: "Onboarding Flow Optimization",
      description: "Test different onboarding experiences",
      type: "ab_test",
      variants: 3,
    },
    {
      id: "trading-ui",
      name: "Trading UI Simplification",
      description: "Test simplified vs advanced trading UI",
      type: "ab_test",
      variants: 3,
    },
    {
      id: "copy-trading-cta",
      name: "Copy Trading CTA Optimization",
      description: "Test different copy trading call-to-actions",
      type: "ab_test",
      variants: 3,
    },
    {
      id: "points-earning",
      name: "Points Earning Rate Experiment",
      description: "Test different points earning strategies",
      type: "ab_test",
      variants: 3,
    },
  ];

  return c.json({
    success: true,
    data: { templates },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /admin/experiments/templates/:id
 * Get a specific template
 */
app.get("/templates/:templateId", async (c) => {
  const templateId = c.req.param("templateId");

  // Return the full template based on templateId
  // These match the SAMPLE_EXPERIMENTS in the types file

  return c.json({
    success: true,
    data: null, // Template details
    timestamp: new Date().toISOString(),
  });
});

export { app as experimentsRoutes };
