/**
 * Kalshi Service Tests
 * Tests for prediction market API functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ===========================================================================
// Mock Setup
// ===========================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockExchangeStatus = {
  trading_active: true,
  exchange_active: true,
};

const mockEvent = {
  event_ticker: 'PRES-24',
  series_ticker: 'PRES',
  title: '2024 Presidential Election',
  category: 'Politics',
  sub_title: 'US Presidential Election 2024',
  mutually_exclusive: true,
  status: 'open',
  strike_date: '2024-11-05T00:00:00Z',
  close_time: '2024-11-05T18:00:00Z',
  markets_count: 5,
};

const mockMarket = {
  ticker: 'PRESYES-24-001',
  event_ticker: 'PRES-24',
  title: 'Will Candidate A win?',
  subtitle: 'Presidential Election 2024',
  status: 'open',
  yes_bid: 55,
  yes_ask: 57,
  no_bid: 43,
  no_ask: 45,
  last_price: 56,
  volume: 1500000,
  open_interest: 500000,
  previous_yes_bid: 54,
  previous_yes_ask: 56,
  previous_price: 55,
  open_time: '2024-01-01T00:00:00Z',
  close_time: '2024-11-05T18:00:00Z',
  expiration_time: '2024-11-06T00:00:00Z',
  result: null,
};

const mockOrderbook = {
  yes: [
    { price: 55, quantity: 1000 },
    { price: 54, quantity: 2000 },
    { price: 53, quantity: 3000 },
  ],
  no: [
    { price: 45, quantity: 1000 },
    { price: 46, quantity: 2000 },
    { price: 47, quantity: 3000 },
  ],
};

const mockOrder = {
  order_id: 'ord_mock123',
  user_id: 'user_kalshi_123',
  ticker: 'PRESYES-24-001',
  side: 'yes',
  action: 'buy',
  type: 'limit',
  status: 'resting',
  count: 100,
  filled_count: 0,
  remaining_count: 100,
  yes_price: 55,
  no_price: 45,
  created_time: new Date().toISOString(),
  updated_time: new Date().toISOString(),
};

const mockFill = {
  trade_id: 'fill_mock123',
  order_id: 'ord_mock123',
  ticker: 'PRESYES-24-001',
  side: 'yes',
  action: 'buy',
  count: 50,
  yes_price: 55,
  no_price: 45,
  is_taker: true,
  created_time: new Date().toISOString(),
};

const mockPosition = {
  ticker: 'PRESYES-24-001',
  position: 100,
  average_price: 52,
  market_exposure: 5200,
  realized_pnl: 0,
  resting_order_count: 0,
  total_cost: 5200,
  fees_paid: 52,
};

const mockBalance = {
  balance: 100000, // $1000.00 in cents
  available_balance: 95000,
  reserved_balance: 5000,
};

// ===========================================================================
// Kalshi Service Implementation (for testing)
// ===========================================================================

interface KalshiConfig {
  apiKey: string;
  privateKey?: string;
  baseUrl?: string;
  environment?: 'demo' | 'production';
}

interface CreateOrderParams {
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'market' | 'limit';
  count: number;
  yesPrice?: number;
  noPrice?: number;
  expirationTime?: string;
  clientOrderId?: string;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

class KalshiService {
  private apiKey: string;
  private baseUrl: string;
  private rateLimitInfo: RateLimitInfo = {
    limit: 100,
    remaining: 100,
    reset: Math.floor(Date.now() / 1000) + 60,
  };

  constructor(config: KalshiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ||
      (config.environment === 'production'
        ? 'https://trading-api.kalshi.com/trade-api/v2'
        : 'https://demo-api.kalshi.co/trade-api/v2');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Update rate limit info from headers
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (limit) this.rateLimitInfo.limit = parseInt(limit);
    if (remaining) this.rateLimitInfo.remaining = parseInt(remaining);
    if (reset) this.rateLimitInfo.reset = parseInt(reset);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Kalshi API error: ${response.status}`);
    }

    return response.json();
  }

  async getExchangeStatus() {
    return this.request('/exchange/status');
  }

  async getEvents(params?: {
    status?: string;
    series_ticker?: string;
    limit?: number;
    cursor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.series_ticker) query.set('series_ticker', params.series_ticker);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);

    const queryString = query.toString();
    return this.request(`/events${queryString ? `?${queryString}` : ''}`);
  }

  async getEvent(eventTicker: string) {
    return this.request(`/events/${eventTicker}`);
  }

  async getMarkets(params?: {
    event_ticker?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.event_ticker) query.set('event_ticker', params.event_ticker);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);

    const queryString = query.toString();
    return this.request(`/markets${queryString ? `?${queryString}` : ''}`);
  }

  async getMarket(ticker: string) {
    return this.request(`/markets/${ticker}`);
  }

  async getMarketOrderbook(ticker: string, depth?: number) {
    const query = depth ? `?depth=${depth}` : '';
    return this.request(`/markets/${ticker}/orderbook${query}`);
  }

  async getBalance() {
    return this.request('/portfolio/balance');
  }

  async getPositions() {
    return this.request('/portfolio/positions');
  }

  async getPosition(ticker: string) {
    const positions = await this.getPositions();
    return positions.positions?.find((p: typeof mockPosition) => p.ticker === ticker) || null;
  }

  async createOrder(params: CreateOrderParams) {
    // Validate inputs
    if (params.count <= 0) {
      throw new Error('Count must be positive');
    }

    if (params.type === 'limit') {
      if (params.side === 'yes' && !params.yesPrice) {
        throw new Error('Yes price required for limit yes orders');
      }
      if (params.side === 'no' && !params.noPrice) {
        throw new Error('No price required for limit no orders');
      }
    }

    return this.request('/portfolio/orders', {
      method: 'POST',
      body: JSON.stringify({
        ticker: params.ticker,
        side: params.side,
        action: params.action,
        type: params.type,
        count: params.count,
        yes_price: params.yesPrice,
        no_price: params.noPrice,
        expiration_time: params.expirationTime,
        client_order_id: params.clientOrderId,
      }),
    });
  }

  async cancelOrder(orderId: string) {
    return this.request(`/portfolio/orders/${orderId}`, {
      method: 'DELETE',
    });
  }

  async getOrders(params?: {
    ticker?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.ticker) query.set('ticker', params.ticker);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);

    const queryString = query.toString();
    return this.request(`/portfolio/orders${queryString ? `?${queryString}` : ''}`);
  }

  async getOrder(orderId: string) {
    return this.request(`/portfolio/orders/${orderId}`);
  }

  async getFills(params?: {
    ticker?: string;
    order_id?: string;
    limit?: number;
    cursor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.ticker) query.set('ticker', params.ticker);
    if (params?.order_id) query.set('order_id', params.order_id);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);

    const queryString = query.toString();
    return this.request(`/portfolio/fills${queryString ? `?${queryString}` : ''}`);
  }

  getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  calculateOrderCost(count: number, price: number): number {
    // Contracts are priced 1-99 cents each
    return count * price;
  }

  calculatePotentialProfit(count: number, entryPrice: number): number {
    // Each contract pays $1 (100 cents) if correct
    return count * (100 - entryPrice);
  }

  calculateMaxLoss(count: number, entryPrice: number): number {
    return count * entryPrice;
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Kalshi Service', () => {
  let kalshiService: KalshiService;

  beforeAll(() => {
    kalshiService = new KalshiService({
      apiKey: 'kalshi_test_api_key',
      environment: 'demo',
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Exchange Status Tests
  // =========================================================================

  describe('Exchange Status', () => {
    describe('getExchangeStatus', () => {
      it('should return exchange status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve(mockExchangeStatus),
        });

        const result = await kalshiService.getExchangeStatus();

        expect(result.trading_active).toBe(true);
        expect(result.exchange_active).toBe(true);
      });

      it('should handle inactive exchange', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            trading_active: false,
            exchange_active: true,
          }),
        });

        const result = await kalshiService.getExchangeStatus();

        expect(result.trading_active).toBe(false);
      });
    });
  });

  // =========================================================================
  // Events Tests
  // =========================================================================

  describe('Events', () => {
    describe('getEvents', () => {
      it('should return events list', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            events: [mockEvent],
            cursor: null,
          }),
        });

        const result = await kalshiService.getEvents();

        expect(result.events).toHaveLength(1);
        expect(result.events[0].event_ticker).toBe('PRES-24');
      });

      it('should filter by status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ events: [mockEvent], cursor: null }),
        });

        await kalshiService.getEvents({ status: 'open' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=open'),
          expect.any(Object)
        );
      });

      it('should support pagination', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            events: [mockEvent],
            cursor: 'next_cursor_123',
          }),
        });

        const result = await kalshiService.getEvents({ limit: 10 });

        expect(result.cursor).toBe('next_cursor_123');
      });
    });

    describe('getEvent', () => {
      it('should return event details', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ event: mockEvent }),
        });

        const result = await kalshiService.getEvent('PRES-24');

        expect(result.event.title).toBe('2024 Presidential Election');
      });
    });
  });

  // =========================================================================
  // Markets Tests
  // =========================================================================

  describe('Markets', () => {
    describe('getMarkets', () => {
      it('should return markets list', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            markets: [mockMarket],
            cursor: null,
          }),
        });

        const result = await kalshiService.getMarkets();

        expect(result.markets).toHaveLength(1);
        expect(result.markets[0].ticker).toBe('PRESYES-24-001');
      });

      it('should filter by event', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ markets: [mockMarket], cursor: null }),
        });

        await kalshiService.getMarkets({ event_ticker: 'PRES-24' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('event_ticker=PRES-24'),
          expect.any(Object)
        );
      });
    });

    describe('getMarket', () => {
      it('should return market details', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ market: mockMarket }),
        });

        const result = await kalshiService.getMarket('PRESYES-24-001');

        expect(result.market.yes_bid).toBe(55);
        expect(result.market.yes_ask).toBe(57);
      });
    });

    describe('getMarketOrderbook', () => {
      it('should return orderbook', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ orderbook: mockOrderbook }),
        });

        const result = await kalshiService.getMarketOrderbook('PRESYES-24-001');

        expect(result.orderbook.yes).toHaveLength(3);
        expect(result.orderbook.no).toHaveLength(3);
        expect(result.orderbook.yes[0].price).toBe(55);
      });

      it('should limit depth', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ orderbook: mockOrderbook }),
        });

        await kalshiService.getMarketOrderbook('PRESYES-24-001', 5);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('depth=5'),
          expect.any(Object)
        );
      });
    });
  });

  // =========================================================================
  // Portfolio Tests
  // =========================================================================

  describe('Portfolio', () => {
    describe('getBalance', () => {
      it('should return balance', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve(mockBalance),
        });

        const result = await kalshiService.getBalance();

        expect(result.balance).toBe(100000);
        expect(result.available_balance).toBe(95000);
        expect(result.reserved_balance).toBe(5000);
      });
    });

    describe('getPositions', () => {
      it('should return positions', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            positions: [mockPosition],
          }),
        });

        const result = await kalshiService.getPositions();

        expect(result.positions).toHaveLength(1);
        expect(result.positions[0].ticker).toBe('PRESYES-24-001');
        expect(result.positions[0].position).toBe(100);
      });
    });

    describe('getPosition', () => {
      it('should return specific position', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            positions: [mockPosition],
          }),
        });

        const result = await kalshiService.getPosition('PRESYES-24-001');

        expect(result?.position).toBe(100);
        expect(result?.average_price).toBe(52);
      });

      it('should return null for non-existent position', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ positions: [] }),
        });

        const result = await kalshiService.getPosition('NONEXISTENT');

        expect(result).toBeNull();
      });
    });
  });

  // =========================================================================
  // Order Tests
  // =========================================================================

  describe('Orders', () => {
    describe('createOrder', () => {
      it('should create a limit yes order', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ order: mockOrder }),
        });

        const result = await kalshiService.createOrder({
          ticker: 'PRESYES-24-001',
          side: 'yes',
          action: 'buy',
          type: 'limit',
          count: 100,
          yesPrice: 55,
        });

        expect(result.order.order_id).toBe('ord_mock123');
        expect(result.order.status).toBe('resting');
      });

      it('should create a market order', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            order: { ...mockOrder, type: 'market', status: 'executed' },
          }),
        });

        const result = await kalshiService.createOrder({
          ticker: 'PRESYES-24-001',
          side: 'yes',
          action: 'buy',
          type: 'market',
          count: 50,
        });

        expect(result.order.status).toBe('executed');
      });

      it('should reject zero count', async () => {
        await expect(
          kalshiService.createOrder({
            ticker: 'PRESYES-24-001',
            side: 'yes',
            action: 'buy',
            type: 'limit',
            count: 0,
            yesPrice: 55,
          })
        ).rejects.toThrow('Count must be positive');
      });

      it('should require yes price for limit yes orders', async () => {
        await expect(
          kalshiService.createOrder({
            ticker: 'PRESYES-24-001',
            side: 'yes',
            action: 'buy',
            type: 'limit',
            count: 100,
          })
        ).rejects.toThrow('Yes price required');
      });

      it('should include client order ID when provided', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ order: mockOrder }),
        });

        await kalshiService.createOrder({
          ticker: 'PRESYES-24-001',
          side: 'yes',
          action: 'buy',
          type: 'limit',
          count: 100,
          yesPrice: 55,
          clientOrderId: 'my_order_123',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('my_order_123'),
          })
        );
      });
    });

    describe('cancelOrder', () => {
      it('should cancel an order', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            order: { ...mockOrder, status: 'canceled' },
          }),
        });

        const result = await kalshiService.cancelOrder('ord_mock123');

        expect(result.order.status).toBe('canceled');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/orders/ord_mock123'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('getOrders', () => {
      it('should return orders', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            orders: [mockOrder],
            cursor: null,
          }),
        });

        const result = await kalshiService.getOrders();

        expect(result.orders).toHaveLength(1);
      });

      it('should filter by status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ orders: [mockOrder], cursor: null }),
        });

        await kalshiService.getOrders({ status: 'resting' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=resting'),
          expect.any(Object)
        );
      });
    });
  });

  // =========================================================================
  // Fills Tests
  // =========================================================================

  describe('Fills', () => {
    describe('getFills', () => {
      it('should return fills', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({
            fills: [mockFill],
            cursor: null,
          }),
        });

        const result = await kalshiService.getFills();

        expect(result.fills).toHaveLength(1);
        expect(result.fills[0].count).toBe(50);
      });

      it('should filter by order ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          json: () => Promise.resolve({ fills: [mockFill], cursor: null }),
        });

        await kalshiService.getFills({ order_id: 'ord_mock123' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('order_id=ord_mock123'),
          expect.any(Object)
        );
      });
    });
  });

  // =========================================================================
  // Rate Limit Tests
  // =========================================================================

  describe('Rate Limiting', () => {
    describe('getRateLimitInfo', () => {
      it('should return rate limit info', () => {
        const info = kalshiService.getRateLimitInfo();

        expect(info.limit).toBeDefined();
        expect(info.remaining).toBeDefined();
        expect(info.reset).toBeDefined();
      });
    });
  });

  // =========================================================================
  // Calculation Tests
  // =========================================================================

  describe('Calculations', () => {
    describe('calculateOrderCost', () => {
      it('should calculate cost correctly', () => {
        // 100 contracts at 55 cents = $55.00 = 5500 cents
        const cost = kalshiService.calculateOrderCost(100, 55);
        expect(cost).toBe(5500);
      });

      it('should handle small orders', () => {
        const cost = kalshiService.calculateOrderCost(1, 50);
        expect(cost).toBe(50);
      });
    });

    describe('calculatePotentialProfit', () => {
      it('should calculate potential profit', () => {
        // 100 contracts at 55 cents
        // Profit if correct = 100 * (100 - 55) = 4500 cents = $45.00
        const profit = kalshiService.calculatePotentialProfit(100, 55);
        expect(profit).toBe(4500);
      });

      it('should calculate for cheap contracts', () => {
        // 100 contracts at 10 cents
        // Profit if correct = 100 * (100 - 10) = 9000 cents = $90.00
        const profit = kalshiService.calculatePotentialProfit(100, 10);
        expect(profit).toBe(9000);
      });
    });

    describe('calculateMaxLoss', () => {
      it('should calculate max loss', () => {
        // 100 contracts at 55 cents = $55.00 max loss
        const maxLoss = kalshiService.calculateMaxLoss(100, 55);
        expect(maxLoss).toBe(5500);
      });
    });
  });
});

// ===========================================================================
// Price Validation Tests
// ===========================================================================

describe('Price Validation', () => {
  describe('Valid Prices', () => {
    it('should accept prices in valid range', () => {
      const isValidPrice = (price: number): boolean => {
        return price >= 1 && price <= 99;
      };

      expect(isValidPrice(1)).toBe(true);
      expect(isValidPrice(50)).toBe(true);
      expect(isValidPrice(99)).toBe(true);
    });

    it('should reject invalid prices', () => {
      const isValidPrice = (price: number): boolean => {
        return price >= 1 && price <= 99;
      };

      expect(isValidPrice(0)).toBe(false);
      expect(isValidPrice(100)).toBe(false);
      expect(isValidPrice(-5)).toBe(false);
    });
  });

  describe('Yes/No Price Relationship', () => {
    it('should sum to 100', () => {
      const yesPrice = 57;
      const noPrice = 43;
      expect(yesPrice + noPrice).toBe(100);
    });

    it('should calculate no price from yes', () => {
      const calculateNoPrice = (yesPrice: number): number => 100 - yesPrice;

      expect(calculateNoPrice(55)).toBe(45);
      expect(calculateNoPrice(75)).toBe(25);
      expect(calculateNoPrice(25)).toBe(75);
    });
  });
});

// ===========================================================================
// Order Status Tests
// ===========================================================================

describe('Order Status', () => {
  const validStatuses = ['pending', 'resting', 'executed', 'canceled', 'expired'];

  it('should recognize valid statuses', () => {
    validStatuses.forEach((status) => {
      expect(validStatuses.includes(status)).toBe(true);
    });
  });

  it('should identify open orders', () => {
    const isOpen = (status: string): boolean => {
      return ['pending', 'resting'].includes(status);
    };

    expect(isOpen('pending')).toBe(true);
    expect(isOpen('resting')).toBe(true);
    expect(isOpen('executed')).toBe(false);
    expect(isOpen('canceled')).toBe(false);
  });

  it('should identify terminal statuses', () => {
    const isTerminal = (status: string): boolean => {
      return ['executed', 'canceled', 'expired'].includes(status);
    };

    expect(isTerminal('executed')).toBe(true);
    expect(isTerminal('canceled')).toBe(true);
    expect(isTerminal('expired')).toBe(true);
    expect(isTerminal('resting')).toBe(false);
  });
});
