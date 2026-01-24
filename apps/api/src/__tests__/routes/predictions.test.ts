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
    predictions: {
      getEvents: 'predictions:getEvents',
      getEventByTicker: 'predictions:getEventByTicker',
      searchEvents: 'predictions:searchEvents',
      getUserPositions: 'predictions:getUserPositions',
      getCategories: 'predictions:getCategories',
      getMarketByTicker: 'predictions:getMarketByTicker',
    },
  },
}));

// Import after mocks are set up
const { predictionsRoutes } = await import('../../routes/predictions');

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

const mockEvent = {
  _id: 'event-001',
  externalId: 'ext-event-001',
  ticker: 'PRES24-DEM',
  title: 'Will Democrats win the 2024 Presidential Election?',
  description: 'Prediction market for 2024 US Presidential Election',
  category: 'politics',
  subcategory: 'elections',
  status: 'open',
  openTime: Date.now() - 86400000,
  closeTime: Date.now() + 86400000 * 30,
  expirationTime: Date.now() + 86400000 * 35,
  volume: 5000000,
  openInterest: 1000000,
  tags: ['politics', 'election', '2024'],
  imageUrl: 'https://example.com/election.jpg',
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
};

const mockMarket = {
  _id: 'market-001',
  eventId: 'event-001',
  externalId: 'ext-market-001',
  ticker: 'PRES24-DEM-YES',
  name: 'Yes',
  description: 'Democrats win',
  probability: 0.52,
  yesPrice: 0.52,
  noPrice: 0.48,
  yesVolume: 2500000,
  noVolume: 2500000,
  openInterest: 500000,
  syncedAt: Date.now(),
  updatedAt: Date.now(),
};

const mockCategories = [
  { id: 'politics', name: 'Politics', count: 45 },
  { id: 'sports', name: 'Sports', count: 120 },
  { id: 'entertainment', name: 'Entertainment', count: 30 },
  { id: 'crypto', name: 'Crypto', count: 75 },
  { id: 'finance', name: 'Finance', count: 50 },
];

const mockPosition = {
  _id: 'pos-001',
  userId: mockUserId,
  assetClass: 'prediction',
  symbol: 'PRES24-DEM-YES',
  side: 'long',
  quantity: 100,
  averageEntryPrice: 0.45,
  currentPrice: 0.52,
  costBasis: 45,
  unrealizedPnL: 7,
  realizedPnL: 0,
  market: mockMarket,
  event: mockEvent,
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

  app.route('/predictions', predictionsRoutes);
  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Predictions Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // GET /events - Events Listing Tests
  // =========================================================================

  describe('GET /events', () => {
    it('should return events list with pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent, { ...mockEvent, _id: 'event-002', ticker: 'PRES24-GOP' }]);

      const res = await app.request('/predictions/events');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('should filter by status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([{ ...mockEvent, status: 'open' }]);

      const res = await app.request('/predictions/events?status=open');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getEvents', expect.objectContaining({
        status: 'open',
      }));
    });

    it('should filter by category', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/events?category=politics');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getEvents', expect.objectContaining({
        category: 'politics',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/events?limit=25');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getEvents', expect.objectContaining({
        limit: 25,
      }));
    });

    it('should handle empty results', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/predictions/events?status=settled');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(0);
    });

    it('should handle database errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/events');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FETCH_FAILED');
    });

    it('should calculate hasNextPage correctly', async () => {
      const app = createTestApp();

      // Return exactly limit number of items
      const events = Array(50).fill(mockEvent).map((e, i) => ({ ...e, _id: `event-${i}` }));
      mockConvexQuery.mockResolvedValueOnce(events);

      const res = await app.request('/predictions/events?limit=50');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.hasNextPage).toBe(true);
    });
  });

  // =========================================================================
  // GET /events/:ticker - Single Event Tests
  // =========================================================================

  describe('GET /events/:ticker', () => {
    it('should return event details with markets', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockEvent,
        markets: [mockMarket],
      });

      const res = await app.request('/predictions/events/PRES24-DEM');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.ticker).toBe('PRES24-DEM');
      expect(body.data.markets).toHaveLength(1);
    });

    it('should return 404 for non-existent event', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/predictions/events/NONEXISTENT');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('NONEXISTENT');
    });

    it('should handle database errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/events/PRES24-DEM');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // GET /search - Event Search Tests
  // =========================================================================

  describe('GET /search', () => {
    it('should search events by query', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/search?q=presidential');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:searchEvents', expect.objectContaining({
        query: 'presidential',
      }));
    });

    it('should return empty results for empty query', async () => {
      const app = createTestApp();

      const res = await app.request('/predictions/search?q=');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(mockConvexQuery).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const app = createTestApp();

      const res = await app.request('/predictions/search?q=   ');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should filter search by status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/search?q=election&status=open');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:searchEvents', expect.objectContaining({
        query: 'election',
        status: 'open',
      }));
    });

    it('should filter search by category', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/search?q=2024&category=politics');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:searchEvents', expect.objectContaining({
        query: '2024',
        category: 'politics',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/search?q=test&limit=10');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:searchEvents', expect.objectContaining({
        limit: 10,
      }));
    });

    it('should handle search errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Search failed'));

      const res = await app.request('/predictions/search?q=test');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('SEARCH_FAILED');
    });

    it('should handle special characters in search query', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/predictions/search?q=test%26special');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:searchEvents', expect.objectContaining({
        query: 'test&special',
      }));
    });
  });

  // =========================================================================
  // GET /positions - User Positions Tests (Auth Required)
  // =========================================================================

  describe('GET /positions', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/predictions/positions');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return user prediction positions', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockPosition]);

      const res = await app.request('/predictions/positions');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].symbol).toBe('PRES24-DEM-YES');
      expect(body.data[0].market).toBeDefined();
      expect(body.data[0].event).toBeDefined();
    });

    it('should handle empty positions', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/predictions/positions');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should pass correct userId to query', async () => {
      const app = createTestApp({ userId: 'specific-user-id' });

      mockConvexQuery.mockResolvedValueOnce([]);

      await app.request('/predictions/positions');

      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getUserPositions', {
        userId: 'specific-user-id',
      });
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/positions');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // GET /categories - Categories Tests
  // =========================================================================

  describe('GET /categories', () => {
    it('should return categories with event counts', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockCategories);

      const res = await app.request('/predictions/categories');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(5);
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('name');
      expect(body.data[0]).toHaveProperty('count');
    });

    it('should return default categories when database is empty', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/predictions/categories');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.some((c: { id: string }) => c.id === 'politics')).toBe(true);
      expect(body.data.some((c: { id: string }) => c.id === 'sports')).toBe(true);
    });

    it('should return default categories on error', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/categories');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // GET /events/:ticker/markets - Event Markets Tests
  // =========================================================================

  describe('GET /events/:ticker/markets', () => {
    it('should return markets for event', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockEvent,
        markets: [mockMarket, { ...mockMarket, _id: 'market-002', ticker: 'PRES24-DEM-NO' }],
      });

      const res = await app.request('/predictions/events/PRES24-DEM/markets');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should return 404 for non-existent event', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/predictions/events/NONEXISTENT/markets');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return empty array when event has no markets', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockEvent,
        markets: undefined,
      });

      const res = await app.request('/predictions/events/PRES24-DEM/markets');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/events/PRES24-DEM/markets');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // GET /markets/:ticker - Single Market Tests
  // =========================================================================

  describe('GET /markets/:ticker', () => {
    it('should return market details', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockMarket);

      const res = await app.request('/predictions/markets/PRES24-DEM-YES');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.ticker).toBe('PRES24-DEM-YES');
      expect(body.data.probability).toBe(0.52);
    });

    it('should return 404 for non-existent market', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/predictions/markets/NONEXISTENT');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('NONEXISTENT');
    });

    it('should handle database errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/predictions/markets/PRES24-DEM-YES');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // Edge Cases and Integration Scenarios
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle concurrent requests', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce([mockEvent])
        .mockResolvedValueOnce([{ ...mockEvent, _id: 'event-002' }]);

      const [res1, res2] = await Promise.all([
        app.request('/predictions/events?category=politics'),
        app.request('/predictions/events?category=sports'),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should handle large result sets', async () => {
      const app = createTestApp();

      const largeResultSet = Array(100).fill(mockEvent).map((e, i) => ({
        ...e,
        _id: `event-${i}`,
        ticker: `EVENT-${i}`,
      }));

      mockConvexQuery.mockResolvedValueOnce(largeResultSet);

      const res = await app.request('/predictions/events?limit=100');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(100);
    });

    it('should handle URL-encoded parameters', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/events?category=real%20estate');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getEvents', expect.objectContaining({
        category: 'real estate',
      }));
    });

    it('should handle numeric string parameters', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockEvent]);

      const res = await app.request('/predictions/events?limit=abc');

      expect(res.status).toBe(200);
      // Should use default limit when invalid
      expect(mockConvexQuery).toHaveBeenCalledWith('predictions:getEvents', expect.objectContaining({
        limit: 50, // default
      }));
    });
  });
});
