/**
 * Admin Middleware Tests
 * Tests for role-based access control
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { adminMiddleware, requireRole, moderatorMiddleware, superadminMiddleware } from "../../middleware/admin";

// Mock dependencies
vi.mock("../../lib/convex", () => ({
  getConvexClient: vi.fn(() => ({
    query: vi.fn(),
  })),
  api: {
    users: {
      getById: "users:getById",
    },
  },
}));

vi.mock("@pull/core/services", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { getConvexClient } from "../../lib/convex";

describe("Admin Middleware", () => {
  let app: Hono;
  let mockConvex: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConvex = {
      query: vi.fn(),
    };
    (getConvexClient as ReturnType<typeof vi.fn>).mockReturnValue(mockConvex);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("requireRole middleware", () => {
    it("should return 401 when userId is not set", async () => {
      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("Authentication required");
    });

    it("should return 401 when user is not found", async () => {
      mockConvex.query.mockResolvedValue(null);

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("User not found");
    });

    it("should return 403 when user has insufficient role", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "user" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toBe("Insufficient privileges");
    });

    it("should allow access when user has exact required role", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "admin" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should allow access when user has higher role than required", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "superadmin" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should treat users without role as 'user' role", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123" }); // No role field

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("moderator"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should return 500 when database query fails", async () => {
      mockConvex.query.mockRejectedValue(new Error("Database error"));

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(json.error.message).toBe("Authorization check failed");
    });
  });

  describe("Role hierarchy", () => {
    it("should allow moderator to access moderator routes", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "moderator" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", moderatorMiddleware);
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("should allow admin to access moderator routes", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "admin" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", moderatorMiddleware);
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("should deny moderator access to admin routes", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "moderator" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", adminMiddleware);
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(403);
    });

    it("should deny admin access to superadmin routes", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "admin" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", superadminMiddleware);
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(403);
    });

    it("should allow superadmin to access all routes", async () => {
      mockConvex.query.mockResolvedValue({ id: "user-123", role: "superadmin" });

      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        c.set("userId", "user-123");
        await next();
      });
      app.use("*", superadminMiddleware);
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });
  });

  describe("Response format", () => {
    it("should include requestId in error responses", async () => {
      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "unique-request-id");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.requestId).toBe("unique-request-id");
    });

    it("should include timestamp in error responses", async () => {
      app = new Hono();
      app.use("*", async (c, next) => {
        c.set("requestId", "test-request-id");
        await next();
      });
      app.use("*", requireRole("admin"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");
      const json = await res.json();

      expect(json.timestamp).toBeDefined();
      expect(() => new Date(json.timestamp)).not.toThrow();
    });
  });
});
