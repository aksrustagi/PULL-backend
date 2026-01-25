import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { complianceService } from "@pull/core/services/compliance";

const app = new Hono<Env>();

const selfExcludeSchema = z.object({
  durationDays: z.union([z.number().positive(), z.literal("permanent")]),
  reason: z.string().optional(),
});

const depositLimitSchema = z.object({
  limitType: z.enum(["daily", "weekly", "monthly"]),
  amount: z.number().positive(),
});

const sessionLimitSchema = z.object({
  maxDurationMinutes: z.number().positive().max(1440), // Max 24 hours
});

/**
 * POST /api/v1/compliance/self-exclude
 * Create self-exclusion
 */
app.post("/self-exclude", zValidator("json", selfExcludeSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { durationDays, reason } = c.req.valid("json");
  const exclusion = await complianceService.createSelfExclusion(userId, durationDays);

  return c.json({
    success: true,
    data: exclusion,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/compliance/deposit-limit
 * Set deposit limit
 */
app.post("/deposit-limit", zValidator("json", depositLimitSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { limitType, amount } = c.req.valid("json");
  const limit = await complianceService.setDepositLimit(userId, limitType, amount);

  return c.json({
    success: true,
    data: limit,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/compliance/session-limit
 * Set session time limit
 */
app.post("/session-limit", zValidator("json", sessionLimitSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { maxDurationMinutes } = c.req.valid("json");
  const limit = await complianceService.setSessionLimit(userId, maxDurationMinutes);

  return c.json({
    success: true,
    data: limit,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/compliance/cool-off
 * Start cool-off period
 */
app.post("/cool-off", zValidator("json", z.object({ durationHours: z.number().positive() })), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { durationHours } = c.req.valid("json");
  const period = await complianceService.startCoolOffPeriod(userId, durationHours);

  return c.json({
    success: true,
    data: period,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/compliance/geo-check
 * Check if user's location is allowed
 */
app.get("/geo-check", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Get IP from request headers
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  const geoCheck = await complianceService.checkGeofence(userId, ipAddress);

  return c.json({
    success: true,
    data: geoCheck,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/compliance/audit-log/:marketId
 * Get audit trail for market/trade
 */
app.get("/audit-log/:entityType/:entityId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");

  const auditLogs = await complianceService.getAuditLog(entityType, entityId);

  return c.json({
    success: true,
    data: { logs: auditLogs },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/compliance/settings
 * Get all responsible gaming settings
 */
app.get("/settings", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const settings = await complianceService.getResponsibleGamingSettings(userId);

  return c.json({
    success: true,
    data: settings,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/compliance/odds-explanation/:marketId
 * Get transparent odds calculation
 */
app.get("/odds-explanation/:marketId", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const marketId = c.req.param("marketId");
  const explanation = await complianceService.explainOdds(marketId);

  return c.json({
    success: true,
    data: explanation,
    timestamp: new Date().toISOString(),
  });
});

export default app;
