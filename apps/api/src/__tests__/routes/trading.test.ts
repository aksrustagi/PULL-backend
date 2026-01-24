/**
 * Trading API Endpoint Tests
 * Comprehensive tests for trading routes
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { tradingRoutes } from "../../routes/trading";
import type { Env } from "../../index";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Convex client
const mockConvexClient = {
  query: vi.fn(),
  mutation: vi.fn(),
};

// Mock Temporal client
const mockTemporalClient = {
  workflow: {
    start: vi.fn(),
    signal: vi.fn(),
    getHandle: vi.fn(),
  },
};

// Create test app with mocked dependencies
function createTestApp(userId?: string) {
  const app = new Hono<Env>();

  // Mock auth middleware
  app.use("*", async (c, next) => {
    if (userId) {
      c.set("userId", userId);
    }
    c.set("convex", mockConvexClient as unknown);
    c.set("temporal", mockTemporalClient as unknown);
    await next();
  });

  app.route("/trading", tradingRoutes);
  return app;
}

// ============================================================================
// Test Data
// ============================================================================

const mockOrder = {
  id: "ord_123",
  userId: "user_123",
  symbol: "BTC-100K-YES",
  side: "buy",
  type: "limit",
  quantity: 100,
  price: 0.55,
  status: "pending",
  createdAt: "2024-01-15T10:00:00Z",
};

const mockPortfolio = {
  positions: [
    {
      symbol: "BTC-100K-YES",
      quantity: 100,
      averagePrice: 0.50,
      currentPrice: 0.55,
      marketValue: 55,
      unrealizedPnL: 5,
    },
  ],
  summary: {
    totalValue: 10055,
    totalCost: 10050,
    totalUnrealizedPnL: 5,
    totalRealizedPnL: 0,
    positionCount: 1,
  },
};

const mockBuyingPower = {
  available: 8000,
  held: 2000,
  pending: 0,
  total: 10000,
};

// ============================================================================
// Tests
// ============================================================================

describe("Trading Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // POST /trading/orders - Create Order
  // ==========================================================================

  describe("POST /trading/orders", () => {
    it("should create a limit buy order", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "limit",
          quantity: 100,
          price: 0.55,
          timeInForce: "gtc",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe("BTC-100K-YES");
      expect(data.data.side).toBe("buy");
      expect(data.data.status).toBe("pending");
    });

    it("should create a market sell order", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "ETH-10K-YES",
          side: "sell",
          type: "market",
          quantity: 50,
          timeInForce: "ioc",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.type).toBe("market");
      expect(data.data.side).toBe("sell");
    });

    it("should create a stop limit order", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "sell",
          type: "stop_limit",
          quantity: 100,
          price: 0.45,
          stopPrice: 0.50,
          timeInForce: "day",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.type).toBe("stop_limit");
    });

    it("should return 401 when not authenticated", async () => {
      const app = createTestApp(); // No userId
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "market",
          quantity: 100,
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("should validate required fields", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      // Missing symbol
      const response = await client.trading.orders.$post({
        json: {
          side: "buy",
          type: "market",
          quantity: 100,
        } as unknown,
      });

      expect(response.status).toBe(400);
    });

    it("should validate quantity is positive", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "market",
          quantity: -10,
        },
      });

      expect(response.status).toBe(400);
    });

    it("should validate side enum", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "invalid",
          type: "market",
          quantity: 100,
        } as unknown,
      });

      expect(response.status).toBe(400);
    });

    it("should validate type enum", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "invalid",
          quantity: 100,
        } as unknown,
      });

      expect(response.status).toBe(400);
    });

    it("should validate timeInForce enum", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "market",
          quantity: 100,
          timeInForce: "invalid",
        } as unknown,
      });

      expect(response.status).toBe(400);
    });

    it("should use default timeInForce when not provided", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "limit",
          quantity: 100,
          price: 0.55,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.timeInForce).toBe("gtc");
    });

    it("should include timestamp in response", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "market",
          quantity: 100,
        },
      });

      const data = await response.json();
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).not.toBeNaN();
    });
  });

  // ==========================================================================
  // GET /trading/orders - List Orders
  // ==========================================================================

  describe("GET /trading/orders", () => {
    it("should return list of orders", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
    });

    it("should support status filter", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({
        query: { status: "pending" },
      });

      expect(response.status).toBe(200);
    });

    it("should support limit parameter", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({
        query: { limit: "10" },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination.pageSize).toBe(10);
    });

    it("should default limit to 50", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination.pageSize).toBe(50);
    });

    it("should include pagination metadata", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({});

      const data = await response.json();
      expect(data.pagination).toMatchObject({
        page: expect.any(Number),
        pageSize: expect.any(Number),
        totalItems: expect.any(Number),
        totalPages: expect.any(Number),
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean),
      });
    });
  });

  // ==========================================================================
  // GET /trading/orders/:orderId - Get Order
  // ==========================================================================

  describe("GET /trading/orders/:orderId", () => {
    it("should return order by ID", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders[":orderId"].$get({
        param: { orderId: "ord_123" },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe("ord_123");
    });

    it("should include timestamp in response", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders[":orderId"].$get({
        param: { orderId: "ord_123" },
      });

      const data = await response.json();
      expect(data.timestamp).toBeDefined();
    });
  });

  // ==========================================================================
  // DELETE /trading/orders/:orderId - Cancel Order
  // ==========================================================================

  describe("DELETE /trading/orders/:orderId", () => {
    it("should cancel an order", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders[":orderId"].$delete({
        param: { orderId: "ord_123" },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("cancelled");
      expect(data.data.cancelledAt).toBeDefined();
    });

    it("should include order ID in response", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders[":orderId"].$delete({
        param: { orderId: "ord_456" },
      });

      const data = await response.json();
      expect(data.data.id).toBe("ord_456");
    });
  });

  // ==========================================================================
  // GET /trading/portfolio - Get Portfolio
  // ==========================================================================

  describe("GET /trading/portfolio", () => {
    it("should return portfolio positions", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.portfolio.$get({});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.positions)).toBe(true);
      expect(data.data.summary).toBeDefined();
    });

    it("should include portfolio summary", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.portfolio.$get({});

      const data = await response.json();
      expect(data.data.summary).toMatchObject({
        totalValue: expect.any(Number),
        totalCost: expect.any(Number),
        totalUnrealizedPnL: expect.any(Number),
        totalRealizedPnL: expect.any(Number),
        positionCount: expect.any(Number),
      });
    });
  });

  // ==========================================================================
  // GET /trading/buying-power - Get Buying Power
  // ==========================================================================

  describe("GET /trading/buying-power", () => {
    it("should return buying power", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading["buying-power"].$get({});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        available: expect.any(Number),
        held: expect.any(Number),
        pending: expect.any(Number),
        total: expect.any(Number),
      });
    });

    it("should include timestamp", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading["buying-power"].$get({});

      const data = await response.json();
      expect(data.timestamp).toBeDefined();
    });
  });

  // ==========================================================================
  // Error Response Format
  // ==========================================================================

  describe("error responses", () => {
    it("should return consistent error format", async () => {
      const app = createTestApp(); // No auth
      const client = testClient(app);

      const response = await client.trading.orders.$post({
        json: {
          symbol: "BTC-100K-YES",
          side: "buy",
          type: "market",
          quantity: 100,
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      });
    });
  });

  // ==========================================================================
  // Request ID Tracking
  // ==========================================================================

  describe("request tracking", () => {
    it("should include request metadata in response", async () => {
      const app = createTestApp("user_123");
      const client = testClient(app);

      const response = await client.trading.orders.$get({});

      const data = await response.json();
      expect(data.timestamp).toBeDefined();
    });
  });
});
