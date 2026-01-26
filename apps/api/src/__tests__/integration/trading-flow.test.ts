import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables
vi.stubEnv('CONVEX_URL', 'https://test.convex.cloud');

// Mock Convex client
const mockConvexMutation = vi.fn();
const mockConvexQuery = vi.fn();

vi.mock('../../../lib/convex', () => ({
  convex: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  },
  getConvexClient: vi.fn(() => ({
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  })),
  api: {
    orders: {
      create: 'orders:create',
      getById: 'orders:getById',
      listByUser: 'orders:listByUser',
      cancel: 'orders:cancel',
    },
    positions: {
      getByUser: 'positions:getByUser',
    },
    balances: {
      get: 'balances:get',
    },
  },
}));

// Mock logger
vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock auth middleware
vi.mock('../../../middleware/auth', () => ({
  authMiddleware: vi.fn((c, next) => {
    c.set('userId', 'user_123');
    c.set('requestId', 'req_123');
    return next();
  }),
}));

describe('Trading Flow Integration Tests', () => {
  let app: Hono;
  let tradingRoutes: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConvexQuery.mockReset();
    mockConvexMutation.mockReset();
    
    // Dynamically import routes
    const routes = await import('../../../routes/trading');
    tradingRoutes = routes.tradingRoutes;
    
    app = new Hono();
    app.route('/trading', tradingRoutes);
  });

  describe('Place Order → Check Position Flow', () => {
    it('should place market order and create position', async () => {
      // User has sufficient balance
      mockConvexQuery.mockResolvedValueOnce({
        balance: 100000, // $1000
        availableBalance: 100000,
      });

      // Step 1: Place market buy order
      mockConvexMutation.mockResolvedValueOnce('order_123');

      const orderRes = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'buy',
          type: 'market',
          quantity: 10,
        }),
      });

      expect(orderRes.status).toBe(201);
      const orderData = await orderRes.json();
      expect(orderData).toHaveProperty('success', true);
      expect(orderData.data).toHaveProperty('orderId');

      // Step 2: Check positions after order fills
      mockConvexQuery.mockResolvedValueOnce({
        positions: [
          {
            symbol: 'AAPL',
            quantity: 10,
            averagePrice: 15000, // $150
            currentPrice: 15500,  // $155
            unrealizedPnL: 5000,  // $50 gain
          },
        ],
      });

      const positionsRes = await app.request('/trading/positions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(positionsRes.status).toBe(200);
      const positionsData = await positionsRes.json();
      expect(positionsData.data.positions).toHaveLength(1);
      expect(positionsData.data.positions[0].symbol).toBe('AAPL');
      expect(positionsData.data.positions[0].quantity).toBe(10);
    });

    it('should place limit order with price', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        balance: 100000,
        availableBalance: 100000,
      });

      mockConvexMutation.mockResolvedValueOnce('order_456');

      const orderRes = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'TSLA',
          side: 'buy',
          type: 'limit',
          quantity: 5,
          price: 20000, // $200
        }),
      });

      expect(orderRes.status).toBe(201);
      const data = await orderRes.json();
      expect(data.success).toBe(true);
      expect(data.data.orderId).toBe('order_456');
    });

    it('should require price for limit orders', async () => {
      const orderRes = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'TSLA',
          side: 'buy',
          type: 'limit',
          quantity: 5,
          // Missing price
        }),
      });

      expect(orderRes.status).toBe(400);
      const data = await orderRes.json();
      expect(data.error).toHaveProperty('code', 'PRICE_REQUIRED');
    });

    it('should reject market orders with price', async () => {
      const orderRes = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'buy',
          type: 'market',
          quantity: 10,
          price: 15000, // Market orders shouldn't have price
        }),
      });

      expect(orderRes.status).toBe(400);
      const data = await orderRes.json();
      expect(data.error).toHaveProperty('code', 'PRICE_NOT_ALLOWED');
    });
  });

  describe('Order Lifecycle (Pending → Filled/Cancelled)', () => {
    it('should track order through filled status', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        balance: 100000,
        availableBalance: 100000,
      });

      // Create order
      mockConvexMutation.mockResolvedValueOnce('order_789');

      await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'NVDA',
          side: 'buy',
          type: 'market',
          quantity: 3,
        }),
      });

      // Check order status - pending
      mockConvexQuery.mockResolvedValueOnce({
        id: 'order_789',
        symbol: 'NVDA',
        side: 'buy',
        type: 'market',
        quantity: 3,
        status: 'pending',
        createdAt: Date.now(),
      });

      const pendingRes = await app.request('/trading/orders/order_789', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(pendingRes.status).toBe(200);
      const pendingData = await pendingRes.json();
      expect(pendingData.data.status).toBe('pending');

      // Simulate order fill (would happen via market execution)
      // Check order status - filled
      mockConvexQuery.mockResolvedValueOnce({
        id: 'order_789',
        symbol: 'NVDA',
        side: 'buy',
        type: 'market',
        quantity: 3,
        status: 'filled',
        filledAt: Date.now(),
        fillPrice: 50000, // $500
      });

      const filledRes = await app.request('/trading/orders/order_789', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(filledRes.status).toBe(200);
      const filledData = await filledRes.json();
      expect(filledData.data.status).toBe('filled');
      expect(filledData.data.fillPrice).toBe(50000);
    });

    it('should cancel pending order', async () => {
      // Get order
      mockConvexQuery.mockResolvedValueOnce({
        id: 'order_999',
        symbol: 'MSFT',
        side: 'buy',
        type: 'limit',
        quantity: 5,
        price: 30000,
        status: 'pending',
      });

      // Cancel order
      mockConvexMutation.mockResolvedValueOnce(undefined);

      const cancelRes = await app.request('/trading/orders/order_999/cancel', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(cancelRes.status).toBe(200);
      const data = await cancelRes.json();
      expect(data.success).toBe(true);
    });

    it('should not cancel already filled order', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        id: 'order_888',
        status: 'filled',
      });

      const cancelRes = await app.request('/trading/orders/order_888/cancel', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(cancelRes.status).toBe(400);
      const data = await cancelRes.json();
      expect(data.error).toHaveProperty('code', 'ORDER_NOT_CANCELLABLE');
    });
  });

  describe('Order Validation', () => {
    it('should validate symbol format', async () => {
      const invalidSymbols = ['', '123', 'A', 'TOOLONG', 'AA-BB'];

      for (const symbol of invalidSymbols) {
        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
          body: JSON.stringify({
            symbol,
            side: 'buy',
            type: 'market',
            quantity: 10,
          }),
        });

        expect(res.status).toBe(400);
      }
    });

    it('should validate order side', async () => {
      const res = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'invalid',
          type: 'market',
          quantity: 10,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('side');
    });

    it('should validate order type', async () => {
      const res = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'buy',
          type: 'invalid',
          quantity: 10,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate quantity', async () => {
      const invalidQuantities = [0, -1, 0.5, 1000000];

      for (const quantity of invalidQuantities) {
        const res = await app.request('/trading/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
          body: JSON.stringify({
            symbol: 'AAPL',
            side: 'buy',
            type: 'market',
            quantity,
          }),
        });

        expect(res.status).toBe(400);
      }
    });

    it('should require stopPrice for stop orders', async () => {
      const res = await app.request('/trading/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'sell',
          type: 'stop',
          quantity: 10,
          // Missing stopPrice
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toHaveProperty('code', 'STOP_PRICE_REQUIRED');
    });
  });

  describe('Get Orders and Positions', () => {
    it('should get user orders with pagination', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        orders: [
          {
            id: 'order_1',
            symbol: 'AAPL',
            side: 'buy',
            type: 'market',
            quantity: 10,
            status: 'filled',
          },
          {
            id: 'order_2',
            symbol: 'TSLA',
            side: 'buy',
            type: 'limit',
            quantity: 5,
            status: 'pending',
          },
        ],
        hasMore: false,
      });

      const ordersRes = await app.request('/trading/orders', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(ordersRes.status).toBe(200);
      const data = await ordersRes.json();
      expect(data.data.orders).toHaveLength(2);
    });

    it('should filter orders by status', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        orders: [
          {
            id: 'order_1',
            status: 'pending',
          },
        ],
        hasMore: false,
      });

      const ordersRes = await app.request('/trading/orders?status=pending', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(ordersRes.status).toBe(200);
      const data = await ordersRes.json();
      expect(data.data.orders.every((o: any) => o.status === 'pending')).toBe(true);
    });

    it('should get user positions', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        positions: [
          {
            symbol: 'AAPL',
            quantity: 10,
            averagePrice: 15000,
            currentPrice: 16000,
            unrealizedPnL: 10000,
            realizedPnL: 0,
          },
          {
            symbol: 'TSLA',
            quantity: 5,
            averagePrice: 20000,
            currentPrice: 19000,
            unrealizedPnL: -5000,
            realizedPnL: 0,
          },
        ],
      });

      const positionsRes = await app.request('/trading/positions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(positionsRes.status).toBe(200);
      const data = await positionsRes.json();
      expect(data.data.positions).toHaveLength(2);
      expect(data.data.positions[0].symbol).toBe('AAPL');
    });

    it('should get specific position by symbol', async () => {
      mockConvexQuery.mockResolvedValueOnce({
        symbol: 'AAPL',
        quantity: 10,
        averagePrice: 15000,
        currentPrice: 16000,
        unrealizedPnL: 10000,
      });

      const positionRes = await app.request('/trading/positions/AAPL', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(positionRes.status).toBe(200);
      const data = await positionRes.json();
      expect(data.data.symbol).toBe('AAPL');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all trading endpoints', async () => {
      const endpoints = [
        { method: 'POST', path: '/trading/orders' },
        { method: 'GET', path: '/trading/orders' },
        { method: 'GET', path: '/trading/orders/order_123' },
        { method: 'POST', path: '/trading/orders/order_123/cancel' },
        { method: 'GET', path: '/trading/positions' },
      ];

      for (const endpoint of endpoints) {
        const res = await app.request(endpoint.path, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            // No Authorization header
          },
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        });

        expect(res.status).toBe(401);
      }
    });
  });

  describe('Portfolio Summary', () => {
    it('should calculate total portfolio value', async () => {
      mockConvexQuery
        .mockResolvedValueOnce({
          balance: 50000, // $500 cash
          availableBalance: 50000,
        })
        .mockResolvedValueOnce({
          positions: [
            {
              symbol: 'AAPL',
              quantity: 10,
              currentPrice: 15000,
              unrealizedPnL: 10000,
            },
            {
              symbol: 'TSLA',
              quantity: 5,
              currentPrice: 20000,
              unrealizedPnL: 5000,
            },
          ],
        });

      const summaryRes = await app.request('/trading/portfolio', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      expect(summaryRes.status).toBe(200);
      const data = await summaryRes.json();
      
      // Cash: $500
      // AAPL: 10 * $150 = $1500
      // TSLA: 5 * $200 = $1000
      // Total: $3000
      const expectedTotal = 50000 + (10 * 15000) + (5 * 20000);
      expect(data.data.totalValue).toBe(expectedTotal);
    });
  });
});
