/**
 * Trading Routes Comprehensive Tests
 * Extended test coverage for order execution, portfolio management, and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// ===========================================================================
// Mock Setup
// ===========================================================================

vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');

const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();

vi.mock('../../lib/convex', () => ({
  getConvexClient: () => ({
    query: (...args: unknown[]) => mockConvexQuery(...args),
    mutation: (...args: unknown[]) => mockConvexMutation(...args),
  }),
  api: {
    orders: {
      createOrder: 'orders:createOrder',
      getOrders: 'orders:getOrders',
      getOrderById: 'orders:getOrderById',
      cancelOrder: 'orders:cancelOrder',
      getOrderWithFills: 'orders:getOrderWithFills',
      fillOrder: 'orders:fillOrder',
    },
    positions: {
      getByUser: 'positions:getByUser',
    },
    balances: {
      getByUser: 'balances:getByUser',
      getBuyingPower: 'balances:getBuyingPower',
    },
    trades: {
      getByUser: 'trades:getByUser',
    },
  },
}));

// ===========================================================================
// Test Types and Constants
// ===========================================================================

type Env = {
  Variables: {
    userId?: string;
    requestId: string;
  };
};

const TEST_USER_ID = 'user_test123';

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockOrder = {
  _id: 'order_001',
  userId: TEST_USER_ID,
  symbol: 'BTC-100K-YES',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  price: 0.55,
  stopPrice: undefined,
  timeInForce: 'gtc',
  status: 'pending',
  filledQuantity: 0,
  averageFillPrice: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockFilledOrder = {
  ...mockOrder,
  _id: 'order_002',
  status: 'filled',
  filledQuantity: 100,
  averageFillPrice: 0.54,
};

const mockPosition = {
  _id: 'position_001',
  userId: TEST_USER_ID,
  symbol: 'BTC-100K-YES',
  quantity: 100,
  averagePrice: 0.50,
  costBasis: 50,
  currentPrice: 0.55,
  marketValue: 55,
  unrealizedPnL: 5,
  realizedPnL: 0,
};

const mockBalance = {
  _id: 'balance_001',
  userId: TEST_USER_ID,
  assetType: 'usd',
  assetId: 'USD',
  symbol: 'USD',
  available: 10000,
  held: 2000,
  pending: 0,
};

const mockTrade = {
  _id: 'trade_001',
  orderId: 'order_001',
  userId: TEST_USER_ID,
  symbol: 'BTC-100K-YES',
  side: 'buy',
  quantity: 50,
  price: 0.54,
  fee: 0.27,
  total: 27.27,
  executedAt: Date.now(),
};

// ===========================================================================
// Test App Factory
// ===========================================================================

function createTestApp(options: { authenticated?: boolean; userId?: string } = {}) {
  const app = new Hono<Env>();

  // Middleware to simulate auth
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    if (options.authenticated !== false) {
      c.set('userId', options.userId ?? TEST_USER_ID);
    }
    await next();
  });

  // Order creation schema
  const createOrderSchema = z.object({
    symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9_.-]+$/),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
    quantity: z.number().positive().max(1000000),
    price: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok']).default('gtc'),
    assetClass: z.enum(['crypto', 'prediction', 'rwa']).default('prediction'),
    clientOrderId: z.string().max(64).optional(),
  }).refine(
    (data) => {
      if (data.type === 'limit' || data.type === 'stop_limit') return data.price !== undefined;
      if (data.type === 'stop' || data.type === 'stop_limit') return data.stopPrice !== undefined;
      return true;
    },
    { message: 'Limit orders require price, stop orders require stopPrice' }
  );

  // Create order
  app.post('/orders', zValidator('json', createOrderSchema), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const result = await mockConvexMutation('orders:createOrder', {
        userId,
        ...body,
      });

      return c.json({
        success: true,
        data: {
          orderId: result.orderId,
          status: result.status,
          estimatedCost: result.estimatedCost,
          symbol: body.symbol,
          side: body.side,
          type: body.type,
          quantity: body.quantity,
          price: body.price,
          timeInForce: body.timeInForce,
          createdAt: new Date().toISOString(),
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create order';
      return c.json({
        success: false,
        error: { code: 'ORDER_FAILED', message },
        requestId,
      }, 400);
    }
  });

  // Get orders
  app.get('/orders', async (c) => {
    const userId = c.get('userId');
    const status = c.req.query('status');
    const assetClass = c.req.query('assetClass');
    const symbol = c.req.query('symbol');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const result = await mockConvexQuery('orders:getOrders', {
        status,
        assetClass,
        symbol,
        limit,
        offset,
      });

      return c.json({
        success: true,
        data: result.orders,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch orders' },
        requestId,
      }, 500);
    }
  });

  // Get order by ID
  app.get('/orders/:orderId', async (c) => {
    const orderId = c.req.param('orderId');
    const userId = c.get('userId');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const order = await mockConvexQuery('orders:getOrderById', { orderId });

      if (!order) {
        return c.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found' },
          requestId,
        }, 404);
      }

      // Check ownership
      if (order.userId !== userId) {
        return c.json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
          requestId,
        }, 403);
      }

      return c.json({
        success: true,
        data: order,
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch order' },
        requestId,
      }, 500);
    }
  });

  // Cancel order
  app.delete('/orders/:orderId', async (c) => {
    const orderId = c.req.param('orderId');
    const userId = c.get('userId');
    const reason = c.req.query('reason');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const result = await mockConvexMutation('orders:cancelOrder', {
        orderId,
        reason,
      });

      return c.json({
        success: true,
        data: {
          orderId: result.orderId,
          status: result.status,
          cancelledAt: result.cancelledAt,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel order';
      return c.json({
        success: false,
        error: { code: 'CANCEL_FAILED', message },
        requestId,
      }, 400);
    }
  });

  // Get order fills
  app.get('/orders/:orderId/fills', async (c) => {
    const orderId = c.req.param('orderId');
    const userId = c.get('userId');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const order = await mockConvexQuery('orders:getOrderWithFills', { orderId });

      if (!order) {
        return c.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found' },
          requestId,
        }, 404);
      }

      return c.json({
        success: true,
        data: order,
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch order fills' },
        requestId,
      }, 500);
    }
  });

  // Get portfolio
  app.get('/portfolio', async (c) => {
    const userId = c.get('userId');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const positions = await mockConvexQuery('positions:getByUser', {});

      let totalValue = 0;
      let totalCost = 0;
      let totalUnrealizedPnL = 0;
      let totalRealizedPnL = 0;

      for (const pos of positions || []) {
        totalValue += pos.quantity * pos.currentPrice;
        totalCost += pos.costBasis;
        totalUnrealizedPnL += pos.unrealizedPnL;
        totalRealizedPnL += pos.realizedPnL;
      }

      return c.json({
        success: true,
        data: {
          positions: positions || [],
          summary: {
            totalValue,
            totalCost,
            totalUnrealizedPnL,
            totalRealizedPnL,
            positionCount: positions?.length ?? 0,
          },
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch portfolio' },
        requestId,
      }, 500);
    }
  });

  // Get buying power
  app.get('/buying-power', async (c) => {
    const userId = c.get('userId');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const balances = await mockConvexQuery('balances:getByUser', { userId });
      const usdBalance = balances?.find((b: any) => b.assetType === 'usd' && b.assetId === 'USD');

      return c.json({
        success: true,
        data: {
          available: usdBalance?.available ?? 0,
          held: usdBalance?.held ?? 0,
          pending: usdBalance?.pending ?? 0,
          total: (usdBalance?.available ?? 0) + (usdBalance?.held ?? 0) + (usdBalance?.pending ?? 0),
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch buying power' },
        requestId,
      }, 500);
    }
  });

  // Get trade history
  app.get('/trades', async (c) => {
    const userId = c.get('userId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const trades = await mockConvexQuery('trades:getByUser', { limit });

      return c.json({
        success: true,
        data: trades || [],
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch trades' },
        requestId,
      }, 500);
    }
  });

  // Fill order (for instant execution)
  app.post('/orders/:orderId/fill', zValidator('json', z.object({
    quantity: z.number().positive(),
    price: z.number().positive(),
    fee: z.number().min(0).optional(),
  })), async (c) => {
    const orderId = c.req.param('orderId');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const requestId = c.get('requestId');

    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId,
      }, 401);
    }

    try {
      const result = await mockConvexMutation('orders:fillOrder', {
        orderId,
        quantity: body.quantity,
        price: body.price,
        fee: body.fee,
      });

      return c.json({
        success: true,
        data: result,
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fill order';
      return c.json({
        success: false,
        error: { code: 'FILL_FAILED', message },
        requestId,
      }, 400);
    }
  });

  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Trading Routes Comprehensive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Order Creation Tests
  // =========================================================================

  describe('POST /orders - Order Creation', () => {
    describe('Authentication', () => {
      it('should reject unauthenticated requests', async () => {
        const app = createTestApp({ authenticated: false });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('Order Types', () => {
      it('should create a market order', async () => {
        const app = createTestApp();
        mockConvexMutation.mockResolvedValueOnce({
          orderId: 'order_new_001',
          status: 'pending',
          estimatedCost: 5500,
        });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.type).toBe('market');
        expect(body.data.timeInForce).toBe('gtc');
      });

      it('should create a limit order with price', async () => {
        const app = createTestApp();
        mockConvexMutation.mockResolvedValueOnce({
          orderId: 'order_new_002',
          status: 'pending',
          estimatedCost: 5500,
        });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'limit',
            quantity: 100,
            price: 0.55,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.type).toBe('limit');
        expect(body.data.price).toBe(0.55);
      });

      it('should reject limit order without price', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'limit',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should create a stop order with stopPrice', async () => {
        const app = createTestApp();
        mockConvexMutation.mockResolvedValueOnce({
          orderId: 'order_new_003',
          status: 'pending',
          estimatedCost: 5000,
        });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'sell',
            type: 'stop',
            quantity: 100,
            stopPrice: 0.50,
          }),
        });

        expect(res.status).toBe(200);
      });

      it('should reject stop order without stopPrice', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'sell',
            type: 'stop',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should create a stop limit order with both prices', async () => {
        const app = createTestApp();
        mockConvexMutation.mockResolvedValueOnce({
          orderId: 'order_new_004',
          status: 'pending',
          estimatedCost: 4500,
        });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'sell',
            type: 'stop_limit',
            quantity: 100,
            price: 0.45,
            stopPrice: 0.50,
          }),
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Time In Force', () => {
      it.each(['day', 'gtc', 'ioc', 'fok'] as const)('should accept %s time in force', async (tif) => {
        const app = createTestApp();
        mockConvexMutation.mockResolvedValueOnce({
          orderId: 'order_new_005',
          status: 'pending',
          estimatedCost: 5500,
        });

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 100,
            timeInForce: tif,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.timeInForce).toBe(tif);
      });

      it('should reject invalid time in force', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 100,
            timeInForce: 'invalid',
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('Validation', () => {
      it('should reject negative quantity', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: -100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject zero quantity', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 0,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject quantity exceeding maximum', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 1000001,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject invalid symbol format', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'invalid symbol with spaces',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject symbol with special characters', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC$100K',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject empty symbol', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: '',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject invalid side', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'hold',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject negative price', async () => {
        const app = createTestApp();

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'limit',
            quantity: 100,
            price: -0.55,
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('Error Handling', () => {
      it('should handle insufficient balance errors', async () => {
        const app = createTestApp();
        mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient balance'));

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 1000000,
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('Insufficient balance');
      });

      it('should handle market closed errors', async () => {
        const app = createTestApp();
        mockConvexMutation.mockRejectedValueOnce(new Error('Market is closed'));

        const res = await app.request('/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-100K-YES',
            side: 'buy',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('Market is closed');
      });
    });
  });

  // =========================================================================
  // Order Retrieval Tests
  // =========================================================================

  describe('GET /orders - Order Listing', () => {
    it('should return user orders with pagination', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder, mockFilledOrder],
        total: 2,
        hasMore: false,
      });

      const res = await app.request('/orders');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder],
        total: 1,
        hasMore: false,
      });

      const res = await app.request('/orders?status=pending');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith(
        'orders:getOrders',
        expect.objectContaining({ status: 'pending' })
      );
    });

    it('should filter by symbol', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder],
        total: 1,
        hasMore: false,
      });

      const res = await app.request('/orders?symbol=BTC-100K-YES');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith(
        'orders:getOrders',
        expect.objectContaining({ symbol: 'BTC-100K-YES' })
      );
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder],
        total: 100,
        hasMore: true,
      });

      const res = await app.request('/orders?limit=10');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith(
        'orders:getOrders',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should cap limit at 100', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [],
        total: 0,
        hasMore: false,
      });

      await app.request('/orders?limit=200');

      expect(mockConvexQuery).toHaveBeenCalledWith(
        'orders:getOrders',
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should support offset for pagination', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [],
        total: 50,
        hasMore: false,
      });

      await app.request('/orders?offset=20');

      expect(mockConvexQuery).toHaveBeenCalledWith(
        'orders:getOrders',
        expect.objectContaining({ offset: 20 })
      );
    });
  });

  describe('GET /orders/:orderId - Single Order', () => {
    it('should return order by ID', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce(mockOrder);

      const res = await app.request('/orders/order_001');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data._id).toBe('order_001');
    });

    it('should return 404 for non-existent order', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/orders/nonexistent');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for order belonging to another user', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        ...mockOrder,
        userId: 'other_user',
      });

      const res = await app.request('/orders/order_001');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // Order Cancellation Tests
  // =========================================================================

  describe('DELETE /orders/:orderId - Cancel Order', () => {
    it('should cancel a pending order', async () => {
      const app = createTestApp();
      mockConvexMutation.mockResolvedValueOnce({
        orderId: 'order_001',
        status: 'cancelled',
        cancelledAt: Date.now(),
      });

      const res = await app.request('/orders/order_001', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('cancelled');
    });

    it('should include cancel reason when provided', async () => {
      const app = createTestApp();
      mockConvexMutation.mockResolvedValueOnce({
        orderId: 'order_001',
        status: 'cancelled',
        cancelledAt: Date.now(),
      });

      await app.request('/orders/order_001?reason=user_requested', {
        method: 'DELETE',
      });

      expect(mockConvexMutation).toHaveBeenCalledWith(
        'orders:cancelOrder',
        expect.objectContaining({ reason: 'user_requested' })
      );
    });

    it('should fail to cancel filled order', async () => {
      const app = createTestApp();
      mockConvexMutation.mockRejectedValueOnce(new Error('Cannot cancel filled order'));

      const res = await app.request('/orders/order_002', {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('CANCEL_FAILED');
    });
  });

  // =========================================================================
  // Portfolio Tests
  // =========================================================================

  describe('GET /portfolio - Portfolio Positions', () => {
    it('should return positions with summary', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([mockPosition]);

      const res = await app.request('/portfolio');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.positions).toHaveLength(1);
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.positionCount).toBe(1);
    });

    it('should calculate summary correctly', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([
        mockPosition,
        {
          ...mockPosition,
          _id: 'position_002',
          symbol: 'ETH-10K-YES',
          unrealizedPnL: 10,
          realizedPnL: 5,
          costBasis: 100,
          quantity: 200,
          currentPrice: 0.60,
        },
      ]);

      const res = await app.request('/portfolio');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.summary.totalUnrealizedPnL).toBe(15);
      expect(body.data.summary.totalRealizedPnL).toBe(5);
      expect(body.data.summary.positionCount).toBe(2);
    });

    it('should return empty portfolio for new user', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/portfolio');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.positions).toHaveLength(0);
      expect(body.data.summary.positionCount).toBe(0);
      expect(body.data.summary.totalValue).toBe(0);
    });
  });

  // =========================================================================
  // Buying Power Tests
  // =========================================================================

  describe('GET /buying-power', () => {
    it('should return buying power breakdown', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([mockBalance]);

      const res = await app.request('/buying-power');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.available).toBe(10000);
      expect(body.data.held).toBe(2000);
      expect(body.data.total).toBe(12000);
    });

    it('should return zero values when no balance exists', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/buying-power');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.available).toBe(0);
      expect(body.data.total).toBe(0);
    });
  });

  // =========================================================================
  // Trade History Tests
  // =========================================================================

  describe('GET /trades - Trade History', () => {
    it('should return trade history', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([mockTrade]);

      const res = await app.request('/trades');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([]);

      await app.request('/trades?limit=25');

      expect(mockConvexQuery).toHaveBeenCalledWith(
        'trades:getByUser',
        expect.objectContaining({ limit: 25 })
      );
    });

    it('should cap limit at 100', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce([]);

      await app.request('/trades?limit=500');

      expect(mockConvexQuery).toHaveBeenCalledWith(
        'trades:getByUser',
        expect.objectContaining({ limit: 100 })
      );
    });
  });

  // =========================================================================
  // Order Fill Tests
  // =========================================================================

  describe('POST /orders/:orderId/fill - Order Execution', () => {
    it('should fill an order', async () => {
      const app = createTestApp();
      mockConvexMutation.mockResolvedValueOnce({
        orderId: 'order_001',
        status: 'filled',
        filledQuantity: 100,
        averagePrice: 0.54,
      });

      const res = await app.request('/orders/order_001/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 100,
          price: 0.54,
          fee: 0.27,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('filled');
    });

    it('should reject invalid fill quantity', async () => {
      const app = createTestApp();

      const res = await app.request('/orders/order_001/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: -10,
          price: 0.54,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid fill price', async () => {
      const app = createTestApp();

      const res = await app.request('/orders/order_001/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 100,
          price: 0,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Response Format Tests
  // =========================================================================

  describe('Response Format', () => {
    it('should include timestamp in all responses', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [],
        total: 0,
        hasMore: false,
      });

      const res = await app.request('/orders');
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });

    it('should include requestId in all responses', async () => {
      const app = createTestApp();
      mockConvexQuery.mockResolvedValueOnce({
        orders: [],
        total: 0,
        hasMore: false,
      });

      const res = await app.request('/orders');
      const body = await res.json();

      expect(body.requestId).toBe('test-request-id');
    });

    it('should return consistent error format', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/orders');
      const body = await res.json();

      expect(body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
        requestId: expect.any(String),
      });
    });
  });
});
