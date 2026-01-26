/**
 * Feature Flags Tests
 * Tests for the feature flag system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
  notImplemented,
  requireFeature,
  NotImplementedError,
  getAllFeatureFlags,
} from "../../lib/feature-flags";

// Mock logger
vi.mock("@pull/core/services", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("Feature Flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("FEATURE_FLAGS", () => {
    it("should have production-ready features enabled by default", () => {
      expect(FEATURE_FLAGS.auth).toBe(true);
      expect(FEATURE_FLAGS.predictions).toBe(true);
      expect(FEATURE_FLAGS.trading_basic).toBe(true);
      expect(FEATURE_FLAGS.rewards_basic).toBe(true);
      expect(FEATURE_FLAGS.kyc).toBe(true);
      expect(FEATURE_FLAGS.payments_deposits).toBe(true);
      expect(FEATURE_FLAGS.payments_withdrawals).toBe(true);
    });

    it("should have incomplete features disabled by default", () => {
      expect(FEATURE_FLAGS.ncaa_brackets).toBe(false);
      expect(FEATURE_FLAGS.ncaa_betting).toBe(false);
      expect(FEATURE_FLAGS.golf).toBe(false);
      expect(FEATURE_FLAGS.nba).toBe(false);
      expect(FEATURE_FLAGS.mlb).toBe(false);
      expect(FEATURE_FLAGS.fantasy_leagues).toBe(false);
      expect(FEATURE_FLAGS.fantasy_markets).toBe(false);
      expect(FEATURE_FLAGS.real_estate).toBe(false);
      expect(FEATURE_FLAGS.rwa_tokenization).toBe(false);
      expect(FEATURE_FLAGS.social_trading).toBe(false);
      expect(FEATURE_FLAGS.copy_trading).toBe(false);
      expect(FEATURE_FLAGS.data_flywheel).toBe(false);
      expect(FEATURE_FLAGS.ai_insights).toBe(false);
      expect(FEATURE_FLAGS.ai_copilot).toBe(false);
      expect(FEATURE_FLAGS.viral_growth).toBe(false);
      expect(FEATURE_FLAGS.stories).toBe(false);
      expect(FEATURE_FLAGS.cash_battles).toBe(false);
      expect(FEATURE_FLAGS.squads).toBe(false);
      expect(FEATURE_FLAGS.watch_party).toBe(false);
      expect(FEATURE_FLAGS.vip).toBe(false);
      expect(FEATURE_FLAGS.insurance).toBe(false);
      expect(FEATURE_FLAGS.props_builder).toBe(false);
      expect(FEATURE_FLAGS.nfts).toBe(false);
    });
  });

  describe("isFeatureEnabled", () => {
    it("should return default value when no environment override", () => {
      expect(isFeatureEnabled("auth")).toBe(true);
      expect(isFeatureEnabled("ncaa_brackets")).toBe(false);
    });

    it("should respect environment variable override with 'true'", () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = "true";
      expect(isFeatureEnabled("ncaa_brackets")).toBe(true);
    });

    it("should respect environment variable override with '1'", () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = "1";
      expect(isFeatureEnabled("ncaa_brackets")).toBe(true);
    });

    it("should disable feature when env var is 'false'", () => {
      process.env.FEATURE_FLAG_AUTH = "false";
      expect(isFeatureEnabled("auth")).toBe(false);
    });

    it("should disable feature when env var is '0'", () => {
      process.env.FEATURE_FLAG_AUTH = "0";
      expect(isFeatureEnabled("auth")).toBe(false);
    });

    it("should be case-insensitive for flag names in env", () => {
      process.env.FEATURE_FLAG_FANTASY_LEAGUES = "true";
      expect(isFeatureEnabled("fantasy_leagues")).toBe(true);
    });
  });

  describe("notImplemented", () => {
    it("should return 501 status code", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.get("/test", (c) => notImplemented(c, "Test Feature"));

      const res = await app.request("/test");
      expect(res.status).toBe(501);
    });

    it("should return correct error structure", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.get("/test", (c) => notImplemented(c, "Test Feature"));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_IMPLEMENTED");
      expect(json.error.feature).toBe("Test Feature");
      expect(json.error.message).toContain("Test Feature");
    });

    it("should use custom message when provided", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.get("/test", (c) => notImplemented(c, "Test Feature", "Custom message"));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.error.message).toBe("Custom message");
    });

    it("should include requestId from context", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "unique-request-123");
        await next();
      });
      app.get("/test", (c) => notImplemented(c, "Test Feature"));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.requestId).toBe("unique-request-123");
    });

    it("should generate requestId if not in context", async () => {
      const app = new Hono();
      app.get("/test", (c) => notImplemented(c, "Test Feature"));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.requestId).toBeDefined();
      expect(typeof json.requestId).toBe("string");
    });

    it("should include timestamp", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.get("/test", (c) => notImplemented(c, "Test Feature"));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.timestamp).toBeDefined();
      expect(() => new Date(json.timestamp)).not.toThrow();
    });
  });

  describe("requireFeature middleware", () => {
    it("should allow request when feature is enabled", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireFeature("auth")); // auth is enabled
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should return 501 when feature is disabled", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireFeature("ncaa_brackets")); // ncaa_brackets is disabled
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(501);
      expect(json.error.code).toBe("NOT_IMPLEMENTED");
    });

    it("should use custom feature name when provided", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireFeature("ncaa_brackets", "NCAA Basketball Brackets"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.error.message).toContain("NCAA Basketball Brackets");
    });

    it("should respect environment override", async () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = "true";

      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireFeature("ncaa_brackets"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });
  });

  describe("NotImplementedError", () => {
    it("should create error with correct message", () => {
      const error = new NotImplementedError("Test Feature");
      expect(error.message).toBe("Feature not implemented: Test Feature");
      expect(error.name).toBe("NotImplementedError");
    });

    it("should be instance of Error", () => {
      const error = new NotImplementedError("Test Feature");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("getAllFeatureFlags", () => {
    it("should return all feature flags with current status", () => {
      const flags = getAllFeatureFlags();

      expect(flags.auth).toBe(true);
      expect(flags.ncaa_brackets).toBe(false);
      expect(Object.keys(flags).length).toBeGreaterThan(20);
    });

    it("should reflect environment overrides", () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = "true";
      process.env.FEATURE_FLAG_AUTH = "false";

      const flags = getAllFeatureFlags();

      expect(flags.ncaa_brackets).toBe(true);
      expect(flags.auth).toBe(false);
    });

    it("should return all defined feature flags", () => {
      const flags = getAllFeatureFlags();
      const expectedFlags = Object.keys(FEATURE_FLAGS);

      expect(Object.keys(flags)).toEqual(expect.arrayContaining(expectedFlags));
    });
  });
});
