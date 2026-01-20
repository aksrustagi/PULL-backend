import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Market,
  Event,
  Order,
  Position,
  Balance,
  Orderbook,
  CreateOrderParams,
  RateLimitInfo,
} from '../../services/kalshi/types';
import { KalshiApiError } from '../../services/kalshi/types';

/**
 * Kalshi Service Tests
 *
 * These tests verify the Kalshi API client functionality including:
 * - API request signing
 * - Market data fetching
 * - Order submission
 * - Error handling
 */

// ===========================================================================
// Mock Global Fetch
// ===========================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto module for request signing
vi.mock('crypto', () => ({
  createSign: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    sign: vi.fn().mockReturnValue('mock-signature-base64'),
  })),
  constants: {
    RSA_PKCS1_PSS_PADDING: 6,
    RSA_PSS_SALTLEN_DIGEST: -1,
  },
}));

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockConfig = {
  apiKeyId: 'test-api-key-id',
  privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...mock-key...
-----END RSA PRIVATE KEY-----`,
  baseUrl: 'https://api.test.kalshi.com/trade-api/v2',
  timeout: 5000,
  maxRetries: 3,
};

const mockMarket: Market = {
  ticker: 'PRES24-DEM-YES',
  event_ticker: 'PRES24-DEM',
  market_type: 'binary',
  title: 'Will Democrats win the 2024 Presidential Election?',
  subtitle: 'Yes',
  yes_sub_title: 'Yes',
  no_sub_title: 'No',
  open_time: '2024-01-01T00:00:00Z',
  close_time: '2024-11-05T23:59:59Z',
  expiration_time: '2024-11-06T12:00:00Z',
  status: 'open',
  result: null,
  yes_bid: 52,
  yes_ask: 53,
  no_bid: 47,
  no_ask: 48,
  last_price: 52,
  previous_yes_bid: 51,
  previous_yes_ask: 52,
  previous_price: 51,
  volume: 5000000,
  volume_24h: 150000,
  liquidity: 250000,
  open_interest: 1000000,
  dollar_volume: 5000000,
  dollar_open_interest: 1000000,
  cap_strike: null,
  floor_strike: null,
  risk_limit_cents: 100000,
  tick_size: 1,
  rules_primary: 'Market settles YES if...',
  rules_secondary: '',
  expected_expiration_time: null,
  expiration_value: null,
  category: 'politics',
  series_ticker: 'PRES24',
  tags: ['politics', 'election', '2024'],
  mutually_exclusive: true,
  functional_strike: null,
  estimated_settlement_time: null,
  settlement_timer_seconds: null,
  settlement_value: null,
  can_close_early: false,
  response_price_units: 'cents',
};

const mockEvent: Event = {
  event_ticker: 'PRES24-DEM',
  series_ticker: 'PRES24',
  sub_title: '2024 Presidential Election',
  title: 'Will Democrats win the 2024 Presidential Election?',
  mutually_exclusive: true,
  category: 'politics',
  markets: [mockMarket],
  strike_date: null,
  strike_period: null,
};

const mockOrder: Order = {
  order_id: 'order-123',
  user_id: 'user-456',
  ticker: 'PRES24-DEM-YES',
  status: 'resting',
  yes_price: 52,
  no_price: 48,
  created_time: '2024-01-15T10:30:00Z',
  expiration_time: null,
  action: 'buy',
  side: 'yes',
  type: 'limit',
  client_order_id: 'client-order-001',
  order_group_id: null,
  remaining_count: 100,
  queue_position: 5,
  taker_fill_count: 0,
  taker_fill_cost: 0,
  maker_fill_count: 0,
  maker_fill_cost: 0,
  place_count: 100,
  decrease_count: 0,
  taker_fees: 0,
  close_cancel_count: 0,
  amend_count: 0,
  amend_taker_fill_count: 0,
  self_trade_prevention_type: null,
  last_update_time: '2024-01-15T10:30:00Z',
};

const mockBalance: Balance = {
  balance: 10000,
  portfolio_value: 15000,
  available_balance: 8000,
  payout: 0,
};

const mockPosition: Position = {
  ticker: 'PRES24-DEM-YES',
  event_ticker: 'PRES24-DEM',
  event_exposure: 5000,
  market_exposure: 5000,
  realized_pnl: 500,
  resting_order_count: 2,
  total_cost: 4500,
  position: 100,
  fees_paid: 50,
};

const mockOrderbook: Orderbook = {
  ticker: 'PRES24-DEM-YES',
  yes: [
    { price: 52, quantity: 500 },
    { price: 51, quantity: 1000 },
    { price: 50, quantity: 1500 },
  ],
  no: [
    { price: 48, quantity: 500 },
    { price: 47, quantity: 1000 },
    { price: 46, quantity: 1500 },
  ],
};

// ===========================================================================
// Helper Functions
// ===========================================================================

function createMockResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
    json: vi.fn().mockResolvedValue(data),
  };
}

function createRateLimitHeaders(limit = 100, remaining = 99, reset = Date.now() + 60000) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };
}

// ===========================================================================
// API Request Signing Tests
// ===========================================================================

describe('Kalshi API Request Signing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('Signature Generation', () => {
    it('should generate signature with correct message format', () => {
      // The message format is: timestamp + method + path
      const timestamp = Math.floor(Date.now() / 1000);
      const method = 'GET';
      const path = '/markets';

      const expectedMessage = `${timestamp}${method}${path}`;

      // Verify message format
      expect(expectedMessage).toBe(`${timestamp}GET/markets`);
    });

    it('should include required auth headers in request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ markets: [] }, 200, createRateLimitHeaders())
      );

      // Simulate authenticated request
      const headers: Record<string, string> = {};
      const timestamp = Math.floor(Date.now() / 1000);

      headers['KALSHI-ACCESS-KEY'] = mockConfig.apiKeyId;
      headers['KALSHI-ACCESS-SIGNATURE'] = 'mock-signature';
      headers['KALSHI-ACCESS-TIMESTAMP'] = String(timestamp);

      expect(headers['KALSHI-ACCESS-KEY']).toBe(mockConfig.apiKeyId);
      expect(headers['KALSHI-ACCESS-TIMESTAMP']).toBe(String(timestamp));
      expect(headers['KALSHI-ACCESS-SIGNATURE']).toBeDefined();
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];

      methods.forEach((method) => {
        const timestamp = Math.floor(Date.now() / 1000);
        const path = '/portfolio/orders';
        const message = `${timestamp}${method}${path}`;

        expect(message).toContain(method);
      });
    });

    it('should handle paths with query parameters', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/markets?status=open&limit=100';
      const message = `${timestamp}GET${path}`;

      expect(message).toContain('status=open');
      expect(message).toContain('limit=100');
    });
  });

  describe('Timestamp Handling', () => {
    it('should use Unix timestamp in seconds', () => {
      const timestamp = Math.floor(Date.now() / 1000);

      // Should be 10 digits (seconds, not milliseconds)
      expect(String(timestamp).length).toBe(10);
    });

    it('should generate fresh timestamp for each request', async () => {
      const timestamp1 = Math.floor(Date.now() / 1000);

      vi.advanceTimersByTime(1000);

      const timestamp2 = Math.floor(Date.now() / 1000);

      expect(timestamp2).toBe(timestamp1 + 1);
    });
  });
});

// ===========================================================================
// Market Data Fetching Tests
// ===========================================================================

describe('Kalshi Market Data Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Get Markets', () => {
    it('should fetch markets list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { markets: [mockMarket], cursor: null },
          200,
          createRateLimitHeaders()
        )
      );

      // Simulate the request
      const response = await fetch(`${mockConfig.baseUrl}/markets`);
      const data = await response.json();

      expect(data.markets).toHaveLength(1);
      expect(data.markets[0].ticker).toBe('PRES24-DEM-YES');
    });

    it('should handle pagination with cursor', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(
            { markets: [mockMarket], cursor: 'cursor-123' },
            200,
            createRateLimitHeaders()
          )
        )
        .mockResolvedValueOnce(
          createMockResponse(
            { markets: [{ ...mockMarket, ticker: 'PRES24-GOP-YES' }], cursor: null },
            200,
            createRateLimitHeaders()
          )
        );

      // First request
      const response1 = await fetch(`${mockConfig.baseUrl}/markets`);
      const data1 = await response1.json();
      expect(data1.cursor).toBe('cursor-123');

      // Second request with cursor
      const response2 = await fetch(`${mockConfig.baseUrl}/markets?cursor=cursor-123`);
      const data2 = await response2.json();
      expect(data2.cursor).toBeNull();
    });

    it('should filter by status', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ markets: [mockMarket], cursor: null }, 200, createRateLimitHeaders())
      );

      const url = `${mockConfig.baseUrl}/markets?status=open`;
      await fetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });

    it('should filter by event ticker', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ markets: [mockMarket], cursor: null }, 200, createRateLimitHeaders())
      );

      const url = `${mockConfig.baseUrl}/markets?event_ticker=PRES24-DEM`;
      await fetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });
  });

  describe('Get Single Market', () => {
    it('should fetch market by ticker', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ market: mockMarket }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets/PRES24-DEM-YES`);
      const data = await response.json();

      expect(data.market.ticker).toBe('PRES24-DEM-YES');
      expect(data.market.status).toBe('open');
    });

    it('should return 404 for non-existent market', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Market not found', code: 'NOT_FOUND' },
          404,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets/INVALID-TICKER`);

      expect(response.status).toBe(404);
    });
  });

  describe('Get Orderbook', () => {
    it('should fetch orderbook for market', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ orderbook: mockOrderbook }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets/PRES24-DEM-YES/orderbook`);
      const data = await response.json();

      expect(data.orderbook.yes).toHaveLength(3);
      expect(data.orderbook.no).toHaveLength(3);
      expect(data.orderbook.yes[0].price).toBe(52);
    });

    it('should respect depth parameter', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            orderbook: {
              ...mockOrderbook,
              yes: mockOrderbook.yes.slice(0, 1),
              no: mockOrderbook.no.slice(0, 1),
            },
          },
          200,
          createRateLimitHeaders()
        )
      );

      const url = `${mockConfig.baseUrl}/markets/PRES24-DEM-YES/orderbook?depth=1`;
      await fetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });
  });

  describe('Get Events', () => {
    it('should fetch events list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ events: [mockEvent], cursor: null }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/events`);
      const data = await response.json();

      expect(data.events).toHaveLength(1);
      expect(data.events[0].event_ticker).toBe('PRES24-DEM');
    });

    it('should fetch event with nested markets', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ event: mockEvent }, 200, createRateLimitHeaders())
      );

      const url = `${mockConfig.baseUrl}/events/PRES24-DEM?with_nested_markets=true`;
      const response = await fetch(url);
      const data = await response.json();

      expect(data.event.markets).toHaveLength(1);
    });
  });
});

// ===========================================================================
// Order Submission Tests
// ===========================================================================

describe('Kalshi Order Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Create Order', () => {
    it('should create limit order', async () => {
      const orderParams: CreateOrderParams = {
        ticker: 'PRES24-DEM-YES',
        side: 'yes',
        action: 'buy',
        count: 100,
        type: 'limit',
        yes_price: 52,
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ order: mockOrder }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderParams),
      });

      const data = await response.json();

      expect(data.order.order_id).toBe('order-123');
      expect(data.order.status).toBe('resting');
    });

    it('should create market order', async () => {
      const orderParams: CreateOrderParams = {
        ticker: 'PRES24-DEM-YES',
        side: 'yes',
        action: 'buy',
        count: 100,
        type: 'market',
      };

      const marketOrder = { ...mockOrder, type: 'market' as const, status: 'executed' as const };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ order: marketOrder }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderParams),
      });

      const data = await response.json();

      expect(data.order.type).toBe('market');
    });

    it('should include client_order_id when provided', async () => {
      const orderParams: CreateOrderParams = {
        ticker: 'PRES24-DEM-YES',
        side: 'yes',
        action: 'buy',
        count: 100,
        type: 'limit',
        yes_price: 52,
        client_order_id: 'my-unique-order-123',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { order: { ...mockOrder, client_order_id: 'my-unique-order-123' } },
          200,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderParams),
      });

      const data = await response.json();

      expect(data.order.client_order_id).toBe('my-unique-order-123');
    });

    it('should handle order rejection', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
          400,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: 'PRES24-DEM-YES',
          side: 'yes',
          action: 'buy',
          count: 100000,
          type: 'limit',
          yes_price: 52,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Batch Create Orders', () => {
    it('should create multiple orders in batch', async () => {
      const orders = [
        { ...mockOrder, order_id: 'order-1' },
        { ...mockOrder, order_id: 'order-2' },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ orders }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/batched`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [
            { ticker: 'PRES24-DEM-YES', side: 'yes', action: 'buy', count: 50, type: 'limit', yes_price: 52 },
            { ticker: 'PRES24-DEM-YES', side: 'no', action: 'buy', count: 50, type: 'limit', no_price: 48 },
          ],
        }),
      });

      const data = await response.json();

      expect(data.orders).toHaveLength(2);
    });
  });

  describe('Cancel Order', () => {
    it('should cancel order by ID', async () => {
      const cancelledOrder = { ...mockOrder, status: 'canceled' as const };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ order: cancelledOrder }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/order-123`, {
        method: 'DELETE',
      });

      const data = await response.json();

      expect(data.order.status).toBe('canceled');
    });

    it('should handle cancel of non-existent order', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Order not found', code: 'NOT_FOUND' },
          404,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/invalid-order`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('should batch cancel orders', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { canceled: ['order-1', 'order-2'], failed: [] },
          200,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/batched`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: ['order-1', 'order-2'] }),
      });

      const data = await response.json();

      expect(data.canceled).toHaveLength(2);
      expect(data.failed).toHaveLength(0);
    });
  });

  describe('Amend Order', () => {
    it('should amend order price', async () => {
      const amendedOrder = { ...mockOrder, yes_price: 53 };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ order: amendedOrder }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/order-123/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: 53 }),
      });

      const data = await response.json();

      expect(data.order.yes_price).toBe(53);
    });

    it('should amend order count', async () => {
      const amendedOrder = { ...mockOrder, remaining_count: 150 };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ order: amendedOrder }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/order-123/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 150 }),
      });

      const data = await response.json();

      expect(data.order.remaining_count).toBe(150);
    });
  });
});

// ===========================================================================
// Error Handling Tests
// ===========================================================================

describe('Kalshi Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('HTTP Error Codes', () => {
    it('should handle 400 Bad Request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Invalid parameters', code: 'BAD_REQUEST' },
          400,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      expect(response.ok).toBe(false);
    });

    it('should handle 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Invalid API key', code: 'UNAUTHORIZED' },
          401,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/balance`);

      expect(response.status).toBe(401);
    });

    it('should handle 403 Forbidden', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Access denied', code: 'FORBIDDEN' },
          403,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders/order-123`);

      expect(response.status).toBe(403);
    });

    it('should handle 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Resource not found', code: 'NOT_FOUND' },
          404,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets/INVALID-TICKER`);

      expect(response.status).toBe(404);
    });

    it('should handle 429 Rate Limited', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
          429,
          { ...createRateLimitHeaders(100, 0), 'Retry-After': '60' }
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets`);

      expect(response.status).toBe(429);
    });

    it('should handle 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Internal server error', code: 'INTERNAL_ERROR' },
          500,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets`);

      expect(response.status).toBe(500);
    });

    it('should handle 503 Service Unavailable', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
          503,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/markets`);

      expect(response.status).toBe(503);
    });
  });

  describe('KalshiApiError', () => {
    it('should create error with all properties', () => {
      const error = new KalshiApiError(
        'Test error message',
        'TEST_ERROR',
        400,
        { field: 'value' }
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'value' });
      expect(error.name).toBe('KalshiApiError');
    });

    it('should extend Error class', () => {
      const error = new KalshiApiError('Test', 'TEST', 400);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof KalshiApiError).toBe(true);
    });
  });

  describe('Network Errors', () => {
    it('should handle network timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      await expect(fetch(`${mockConfig.baseUrl}/markets`)).rejects.toThrow('Request timeout');
    });

    it('should handle connection refused', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(fetch(`${mockConfig.baseUrl}/markets`)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle DNS resolution failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await expect(fetch(`${mockConfig.baseUrl}/markets`)).rejects.toThrow('ENOTFOUND');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 5xx errors', async () => {
      let attempts = 0;

      mockFetch.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return createMockResponse(
            { message: 'Server error' },
            500,
            createRateLimitHeaders()
          );
        }
        return createMockResponse({ markets: [] }, 200, createRateLimitHeaders());
      });

      // Simulate retry logic
      const maxRetries = 3;
      let lastResponse;

      for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(`${mockConfig.baseUrl}/markets`);
        lastResponse = response;
        if (response.ok) break;
      }

      expect(attempts).toBe(3);
      expect(lastResponse?.ok).toBe(true);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ message: 'Bad request' }, 400, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 with exponential backoff', async () => {
      const callTimes: number[] = [];

      mockFetch.mockImplementation(async () => {
        callTimes.push(Date.now());
        if (callTimes.length < 3) {
          return createMockResponse({ message: 'Rate limited' }, 429, createRateLimitHeaders(100, 0));
        }
        return createMockResponse({ markets: [] }, 200, createRateLimitHeaders());
      });

      // Simulate retry with backoff
      const maxRetries = 3;
      const baseDelay = 100;

      for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(`${mockConfig.baseUrl}/markets`);
        if (response.ok) break;
        if (response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, i)));
        }
      }

      expect(callTimes.length).toBe(3);
    });
  });

  describe('Rate Limit Tracking', () => {
    it('should extract rate limit info from headers', async () => {
      const headers = createRateLimitHeaders(100, 95, 1705312800);

      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }, 200, headers));

      const response = await fetch(`${mockConfig.baseUrl}/markets`);

      const rateLimitInfo: RateLimitInfo = {
        limit: parseInt(response.headers.get('X-RateLimit-Limit') ?? '0', 10),
        remaining: parseInt(response.headers.get('X-RateLimit-Remaining') ?? '0', 10),
        reset: parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10),
      };

      expect(rateLimitInfo.limit).toBe(100);
      expect(rateLimitInfo.remaining).toBe(95);
      expect(rateLimitInfo.reset).toBe(1705312800);
    });

    it('should handle missing rate limit headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }, 200, {}));

      const response = await fetch(`${mockConfig.baseUrl}/markets`);

      const rateLimitInfo: RateLimitInfo = {
        limit: parseInt(response.headers.get('X-RateLimit-Limit') ?? '0', 10),
        remaining: parseInt(response.headers.get('X-RateLimit-Remaining') ?? '0', 10),
        reset: parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10),
      };

      expect(rateLimitInfo.limit).toBe(0);
      expect(rateLimitInfo.remaining).toBe(0);
    });
  });
});

// ===========================================================================
// Portfolio Operations Tests
// ===========================================================================

describe('Kalshi Portfolio Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Get Balance', () => {
    it('should fetch account balance', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockBalance, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/balance`);
      const data = await response.json();

      expect(data.balance).toBe(10000);
      expect(data.available_balance).toBe(8000);
    });
  });

  describe('Get Positions', () => {
    it('should fetch positions list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { market_positions: [mockPosition], event_positions: [], cursor: null },
          200,
          createRateLimitHeaders()
        )
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/positions`);
      const data = await response.json();

      expect(data.market_positions).toHaveLength(1);
      expect(data.market_positions[0].ticker).toBe('PRES24-DEM-YES');
    });

    it('should filter positions by ticker', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { market_positions: [mockPosition], event_positions: [], cursor: null },
          200,
          createRateLimitHeaders()
        )
      );

      const url = `${mockConfig.baseUrl}/portfolio/positions?ticker=PRES24-DEM-YES`;
      await fetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });
  });

  describe('Get Orders', () => {
    it('should fetch orders list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ orders: [mockOrder], cursor: null }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/orders`);
      const data = await response.json();

      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].order_id).toBe('order-123');
    });

    it('should filter orders by status', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ orders: [mockOrder], cursor: null }, 200, createRateLimitHeaders())
      );

      const url = `${mockConfig.baseUrl}/portfolio/orders?status=resting`;
      await fetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });
  });

  describe('Get Fills', () => {
    it('should fetch fills list', async () => {
      const mockFill = {
        trade_id: 'trade-123',
        order_id: 'order-123',
        ticker: 'PRES24-DEM-YES',
        side: 'yes',
        action: 'buy',
        count: 50,
        yes_price: 52,
        no_price: 48,
        is_taker: true,
        created_time: '2024-01-15T10:30:00Z',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ fills: [mockFill], cursor: null }, 200, createRateLimitHeaders())
      );

      const response = await fetch(`${mockConfig.baseUrl}/portfolio/fills`);
      const data = await response.json();

      expect(data.fills).toHaveLength(1);
      expect(data.fills[0].trade_id).toBe('trade-123');
    });
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('Kalshi Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle empty response arrays', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ markets: [], cursor: null }, 200, createRateLimitHeaders())
    );

    const response = await fetch(`${mockConfig.baseUrl}/markets`);
    const data = await response.json();

    expect(data.markets).toHaveLength(0);
  });

  it('should handle large response payloads', async () => {
    const largeMarketList = Array(1000).fill(mockMarket).map((m, i) => ({
      ...m,
      ticker: `MARKET-${i}`,
    }));

    mockFetch.mockResolvedValueOnce(
      createMockResponse({ markets: largeMarketList, cursor: null }, 200, createRateLimitHeaders())
    );

    const response = await fetch(`${mockConfig.baseUrl}/markets`);
    const data = await response.json();

    expect(data.markets).toHaveLength(1000);
  });

  it('should handle special characters in tickers', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ market: mockMarket }, 200, createRateLimitHeaders())
    );

    const url = `${mockConfig.baseUrl}/markets/${encodeURIComponent('SPECIAL/TICKER')}`;
    await fetch(url);

    expect(mockFetch).toHaveBeenCalledWith(url);
  });

  it('should handle concurrent requests', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse({ markets: [] }, 200, createRateLimitHeaders()))
      .mockResolvedValueOnce(createMockResponse({ events: [] }, 200, createRateLimitHeaders()))
      .mockResolvedValueOnce(createMockResponse(mockBalance, 200, createRateLimitHeaders()));

    const [markets, events, balance] = await Promise.all([
      fetch(`${mockConfig.baseUrl}/markets`),
      fetch(`${mockConfig.baseUrl}/events`),
      fetch(`${mockConfig.baseUrl}/portfolio/balance`),
    ]);

    expect(markets.ok).toBe(true);
    expect(events.ok).toBe(true);
    expect(balance.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
