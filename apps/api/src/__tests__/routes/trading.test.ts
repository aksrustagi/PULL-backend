import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables before importing routes
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');

// Mock Convex client and API
const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();

vi.mock('../../lib/convex', () => ({
  convex: {
    query: (...args: unknown[]) => mockConvexQuery(...args),
    mutation: (...args: unknown[]) => mockConvexMutation(...args),
  },
  api: {
    orders: {
      create: 'orders:create',
      getById: 'orders:getById',
      getByStatus: 'orders:getByStatus',
      getOrderHistory: 'orders:getOrderHistory',
      getOrderWithFills: 'orders:getOrderWithFills',
      cancel: 'orders:cancel',
    },
    positions: {
      getPortfolioPositions: 'positions:getPortfolioPositions',
    },
    balances: {
      getBuyingPower: 'balances:getBuyingPower',
    },
  },
}));

// Mock Temporal client
vi.mock('../../lib/temporal', () => ({
  startOrderWorkflow: vi.fn().mockResolvedValue('workflow-123'),
  getTemporalClient: vi.fn(),
}));

// Import after mocks are set up
const { tradingRoutes } = await import('../../routes/trading');

// Type for Hono app environment
type Env = {
  Variables: {
    userId?: string;
    requestId: string;
  };
};

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockUserId = 'test-user-123' as const;
const mockOrderId = 'order-456' as const;

const mockOrder = {
  _id: mockOrderId,
  userId: mockUserId,
  assetClass: 'crypto',
  symbol: 'BTC-USD',
  side: 'buy',
  type: 'limit',
  status: 'pending',
  quantity: 1.5,
  price: 50000,
  filledQuantity: 0,
  remainingQuantity: 1.5,
  timeInForce: 'gtc',
  fees: 0,
  feeCurrency: 'USD',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockPortfolio = {
  positions: [
    {
      _id: 'pos-1',
      userId: mockUserId,
      assetClass: 'crypto',
      symbol: 'BTC-USD',
      side: 'long',
      quantity: 2.5,
      averageEntryPrice: 45000,
      currentPrice: 50000,
      costBasis: 112500,
      unrealizedPnL: 12500,
      realizedPnL: 0,
    },
  ],
  summary: {
    totalValue: 125000,
    totalCost: 112500,
    totalUnrealizedPnL: 12500,
    totalRealizedPnL: 0,
    totalPnLPercent: 11.11,
    positionCount: 1,
  },
};

const mockBuyingPower = {
  available: 100000,
  held: 10000,
  pending: 0,
  total: 110000,
};

// ===========================================================================
// Test Setup Helpers
// ===========================================================================

function createTestApp(options: { authenticated?: boolean; userId?: string } = {}) {
  const app = new Hono<Env>();

  // Add middleware to set userId for authenticated requests
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    if (options.authenticated !== false) {
      c.set('userId', options.userId ?? mockUserId);
    }
    await next();
  });

  app.route('/trading', tradingRoutes);
  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Trading Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // POST /orders - Order Creation Tests
  // =========================================================================

  describe('POST /orders', () => {
    describe('Authentication', () => {
      it('should reject order without authentication', async () => {
        const app = createTestApp({ authenticated: false });

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('Valid Order Creation', () => {
      it('should create market order with valid data', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce(mockOrder);

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1.5,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(mockOrderId);
        expect(mockConvexMutation).toHaveBeenCalledWith('orders:create', expect.objectContaining({
          userId: mockUserId,
          assetClass: 'crypto',
          symbol: 'BTC-USD',
          side: 'buy',
          type: 'market',
          quantity: 1.5,
        }));
      });

      it('should create limit order with price', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce({ ...mockOrder, type: 'limit', price: 50000 });

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'limit',
            quantity: 1.5,
            price: 50000,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('should create stop order with stopPrice', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce({ ...mockOrder, type: 'stop', stopPrice: 45000 });

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'prediction',
            symbol: 'PRES-2024',
            side: 'sell',
            type: 'stop',
            quantity: 10,
            stopPrice: 0.6,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('should create RWA order', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce({ ...mockOrder, assetClass: 'rwa' });

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'rwa',
            symbol: 'REAL-001',
            side: 'buy',
            type: 'market',
            quantity: 5,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });

    describe('Validation Errors', () => {
      it('should validate quantity is positive', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: -1,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should validate quantity is not zero', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 0,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should require price for limit orders', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'limit',
            quantity: 1.5,
            // Missing price
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.message).toContain('price');
      });

      it('should require stopPrice for stop orders', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'sell',
            type: 'stop',
            quantity: 1.5,
            // Missing stopPrice
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.message).toContain('stop price');
      });

      it('should require stopPrice for stop_limit orders', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'sell',
            type: 'stop_limit',
            quantity: 1.5,
            price: 50000,
            // Missing stopPrice
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should validate asset class enum', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'invalid',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should validate side enum', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'hold',
            type: 'market',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should validate order type enum', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'trailing_stop',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should require symbol', async () => {
        const app = createTestApp();

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            side: 'buy',
            type: 'market',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('Business Logic Errors', () => {
      it('should handle insufficient buying power', async () => {
        const app = createTestApp();

        mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient buying power'));

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'limit',
            quantity: 1000,
            price: 50000,
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('INSUFFICIENT_FUNDS');
      });

      it('should handle insufficient position for sell', async () => {
        const app = createTestApp();

        mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient position'));

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'ETH-USD',
            side: 'sell',
            type: 'market',
            quantity: 100,
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('INSUFFICIENT_FUNDS');
      });

      it('should handle general creation failure', async () => {
        const app = createTestApp();

        mockConvexMutation.mockRejectedValueOnce(new Error('Database error'));

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1,
          }),
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.code).toBe('ORDER_CREATION_FAILED');
      });
    });

    describe('Optional Fields', () => {
      it('should accept clientOrderId', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce(mockOrder);

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1,
            clientOrderId: 'my-order-001',
          }),
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith('orders:create', expect.objectContaining({
          clientOrderId: 'my-order-001',
        }));
      });

      it('should accept timeInForce options', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce(mockOrder);

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'limit',
            quantity: 1,
            price: 50000,
            timeInForce: 'ioc',
          }),
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith('orders:create', expect.objectContaining({
          timeInForce: 'ioc',
        }));
      });

      it('should accept metadata', async () => {
        const app = createTestApp();

        mockConvexMutation.mockResolvedValueOnce(mockOrderId);
        mockConvexQuery.mockResolvedValueOnce(mockOrder);

        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetClass: 'crypto',
            symbol: 'BTC-USD',
            side: 'buy',
            type: 'market',
            quantity: 1,
            metadata: { source: 'mobile', strategy: 'dca' },
          }),
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith('orders:create', expect.objectContaining({
          metadata: { source: 'mobile', strategy: 'dca' },
        }));
      });
    });
  });

  // =========================================================================
  // GET /orders - Order Listing Tests
  // =========================================================================

  describe('GET /orders', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/trading/orders');

      expect(res.status).toBe(401);
    });

    it('should return orders with pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder, { ...mockOrder, _id: 'order-789' }],
        total: 2,
      });

      const res = await app.request('/trading/orders');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.totalItems).toBe(2);
    });

    it('should filter by status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([
        { ...mockOrder, status: 'filled' },
      ]);

      const res = await app.request('/trading/orders?status=filled');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('orders:getByStatus', expect.objectContaining({
        status: 'filled',
      }));
    });

    it('should respect limit and offset', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        orders: [mockOrder],
        total: 50,
      });

      const res = await app.request('/trading/orders?limit=10&offset=20');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('orders:getOrderHistory', expect.objectContaining({
        limit: 10,
        offset: 20,
      }));
    });

    it('should handle empty results', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        orders: [],
        total: 0,
      });

      const res = await app.request('/trading/orders');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(0);
    });

    it('should handle fetch failure', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/trading/orders');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // GET /orders/:orderId - Single Order Tests
  // =========================================================================

  describe('GET /orders/:orderId', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request(`/trading/orders/${mockOrderId}`);

      expect(res.status).toBe(401);
    });

    it('should return order with fills', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockOrder,
        fills: [{ tradeId: 'trade-1', quantity: 0.5, price: 50000 }],
      });

      const res = await app.request(`/trading/orders/${mockOrderId}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.fills).toBeDefined();
    });

    it('should return 404 for non-existent order', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/trading/orders/non-existent');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for order owned by different user', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockOrder,
        userId: 'different-user-id',
      });

      const res = await app.request(`/trading/orders/${mockOrderId}`);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // DELETE /orders/:orderId - Order Cancellation Tests
  // =========================================================================

  describe('DELETE /orders/:orderId', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request(`/trading/orders/${mockOrderId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });

    it('should cancel pending order', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockOrder) // First call - getById to verify ownership
        .mockResolvedValueOnce({ ...mockOrder, status: 'cancelled' }); // Second call - get cancelled order
      mockConvexMutation.mockResolvedValueOnce(mockOrderId);

      const res = await app.request(`/trading/orders/${mockOrderId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockConvexMutation).toHaveBeenCalledWith('orders:cancel', expect.objectContaining({
        id: mockOrderId,
        reason: 'User requested cancellation',
      }));
    });

    it('should return 404 for non-existent order', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/trading/orders/non-existent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for order owned by different user', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockOrder,
        userId: 'different-user-id',
      });

      const res = await app.request(`/trading/orders/${mockOrderId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should return error for non-cancellable order', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({ ...mockOrder, status: 'filled' });
      mockConvexMutation.mockRejectedValueOnce(new Error('Order cannot be cancelled'));

      const res = await app.request(`/trading/orders/${mockOrderId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_STATE');
    });
  });

  // =========================================================================
  // GET /portfolio - Portfolio Tests
  // =========================================================================

  describe('GET /portfolio', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/trading/portfolio');

      expect(res.status).toBe(401);
    });

    it('should return portfolio positions and summary', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockPortfolio);

      const res = await app.request('/trading/portfolio');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.positions).toBeDefined();
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.totalValue).toBe(125000);
      expect(body.data.summary.positionCount).toBe(1);
    });

    it('should filter by asset class', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockPortfolio,
        positions: mockPortfolio.positions.filter(p => p.assetClass === 'crypto'),
      });

      const res = await app.request('/trading/portfolio?assetClass=crypto');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('positions:getPortfolioPositions', expect.objectContaining({
        assetClass: 'crypto',
      }));
    });

    it('should handle empty portfolio', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        positions: [],
        summary: {
          totalValue: 0,
          totalCost: 0,
          totalUnrealizedPnL: 0,
          totalRealizedPnL: 0,
          totalPnLPercent: 0,
          positionCount: 0,
        },
      });

      const res = await app.request('/trading/portfolio');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.positions).toHaveLength(0);
      expect(body.data.summary.positionCount).toBe(0);
    });

    it('should handle fetch failure', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/trading/portfolio');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // GET /buying-power - Buying Power Tests
  // =========================================================================

  describe('GET /buying-power', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/trading/buying-power');

      expect(res.status).toBe(401);
    });

    it('should return buying power breakdown', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockBuyingPower);

      const res = await app.request('/trading/buying-power');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.available).toBe(100000);
      expect(body.data.held).toBe(10000);
      expect(body.data.pending).toBe(0);
      expect(body.data.total).toBe(110000);
    });

    it('should handle zero balance', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        available: 0,
        held: 0,
        pending: 0,
        total: 0,
      });

      const res = await app.request('/trading/buying-power');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.available).toBe(0);
    });

    it('should handle fetch failure', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/trading/buying-power');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });
});
