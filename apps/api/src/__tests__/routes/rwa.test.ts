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
    rwa: {
      getAssets: 'rwa:getAssets',
      getById: 'rwa:getById',
      search: 'rwa:search',
      getListings: 'rwa:getListings',
      getOwnership: 'rwa:getOwnership',
      purchase: 'rwa:purchase',
    },
  },
}));

// Import after mocks are set up
const { rwaRoutes } = await import('../../routes/rwa');

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
const mockAssetId = 'asset-001' as const;
const mockListingId = 'listing-001' as const;

const mockAsset = {
  _id: mockAssetId,
  name: 'Manhattan Luxury Condo',
  description: 'Premium residential property in Manhattan',
  type: 'real_estate',
  status: 'listed',
  totalShares: 10000,
  currentPrice: 150,
  totalValue: 1500000,
  location: {
    address: '123 Park Ave',
    city: 'New York',
    state: 'NY',
    country: 'USA',
  },
  documents: [
    { type: 'deed', url: 'https://docs.example.com/deed.pdf' },
  ],
  imageUrls: ['https://images.example.com/condo1.jpg'],
  createdAt: Date.now() - 86400000 * 30,
  updatedAt: Date.now(),
};

const mockListing = {
  _id: mockListingId,
  assetId: mockAssetId,
  sellerId: 'seller-001',
  pricePerShare: 155,
  availableShares: 500,
  minPurchase: 1,
  maxPurchase: 100,
  status: 'active',
  expiresAt: Date.now() + 86400000 * 7,
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
  asset: mockAsset,
};

const mockOwnership = {
  _id: 'ownership-001',
  assetId: mockAssetId,
  ownerId: mockUserId,
  shares: 25,
  sharePercentage: 0.25,
  averageCost: 145,
  acquiredAt: Date.now() - 86400000 * 10,
  updatedAt: Date.now(),
  asset: mockAsset,
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

  app.route('/rwa', rwaRoutes);
  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('RWA Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // GET /assets - Assets Listing Tests
  // =========================================================================

  describe('GET /assets', () => {
    it('should return assets list with pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset, { ...mockAsset, _id: 'asset-002' }]);

      const res = await app.request('/rwa/assets');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('should filter by type', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/assets?type=real_estate');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getAssets', expect.objectContaining({
        type: 'real_estate',
      }));
    });

    it('should filter by status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/assets?status=listed');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getAssets', expect.objectContaining({
        status: 'listed',
      }));
    });

    it('should use default status of "listed"', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      await app.request('/rwa/assets');

      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getAssets', expect.objectContaining({
        status: 'listed',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/assets?limit=25');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getAssets', expect.objectContaining({
        limit: 25,
      }));
    });

    it('should handle empty results', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rwa/assets');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(0);
    });

    it('should handle database errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rwa/assets');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FETCH_ERROR');
    });

    it('should return various asset types', async () => {
      const app = createTestApp();

      const diverseAssets = [
        { ...mockAsset, type: 'real_estate' },
        { ...mockAsset, _id: 'asset-002', type: 'collectibles' },
        { ...mockAsset, _id: 'asset-003', type: 'art' },
      ];

      mockConvexQuery.mockResolvedValueOnce(diverseAssets);

      const res = await app.request('/rwa/assets');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
    });
  });

  // =========================================================================
  // GET /assets/:assetId - Single Asset Tests
  // =========================================================================

  describe('GET /assets/:assetId', () => {
    it('should return asset details', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockAsset);

      const res = await app.request(`/rwa/assets/${mockAssetId}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Manhattan Luxury Condo');
      expect(body.data.type).toBe('real_estate');
    });

    it('should return 404 for non-existent asset', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/rwa/assets/nonexistent');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request(`/rwa/assets/${mockAssetId}`);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_ERROR');
    });

    it('should return complete asset data including documents', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockAsset);

      const res = await app.request(`/rwa/assets/${mockAssetId}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.documents).toBeDefined();
      expect(body.data.documents).toHaveLength(1);
      expect(body.data.location).toBeDefined();
    });
  });

  // =========================================================================
  // GET /search - Asset Search Tests
  // =========================================================================

  describe('GET /search', () => {
    it('should search assets by query', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/search?q=manhattan');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:search', expect.objectContaining({
        query: 'manhattan',
      }));
    });

    it('should return empty results for empty query', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/search?q=');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(mockConvexQuery).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/search?q=   ');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should filter search by type', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/search?q=luxury&type=real_estate');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:search', expect.objectContaining({
        query: 'luxury',
        type: 'real_estate',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/search?q=property&limit=10');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:search', expect.objectContaining({
        limit: 10,
      }));
    });

    it('should handle search errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Search failed'));

      const res = await app.request('/rwa/search?q=test');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('SEARCH_ERROR');
    });

    it('should handle special characters in search query', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rwa/search?q=luxury%20%26%20modern');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:search', expect.objectContaining({
        query: 'luxury & modern',
      }));
    });
  });

  // =========================================================================
  // GET /listings - Active Listings Tests
  // =========================================================================

  describe('GET /listings', () => {
    it('should return active listings with enriched asset data', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockListing]);

      const res = await app.request('/rwa/listings');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].asset).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockListing]);

      const res = await app.request('/rwa/listings?limit=25');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getListings', expect.objectContaining({
        limit: 25,
      }));
    });

    it('should handle empty listings', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rwa/listings');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rwa/listings');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_ERROR');
    });

    it('should return multiple listings', async () => {
      const app = createTestApp();

      const listings = [
        mockListing,
        { ...mockListing, _id: 'listing-002', pricePerShare: 160 },
        { ...mockListing, _id: 'listing-003', pricePerShare: 145 },
      ];

      mockConvexQuery.mockResolvedValueOnce(listings);

      const res = await app.request('/rwa/listings');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
    });
  });

  // =========================================================================
  // GET /ownership - User Ownership Tests (Auth Required)
  // =========================================================================

  describe('GET /ownership', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rwa/ownership');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return user ownership with enriched asset data', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockOwnership]);

      const res = await app.request('/rwa/ownership');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].shares).toBe(25);
      expect(body.data[0].asset).toBeDefined();
    });

    it('should handle empty ownership', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rwa/ownership');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should pass correct userId to query', async () => {
      const app = createTestApp({ userId: 'specific-user-id' });

      mockConvexQuery.mockResolvedValueOnce([]);

      await app.request('/rwa/ownership');

      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getOwnership', {
        userId: 'specific-user-id',
      });
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rwa/ownership');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_ERROR');
    });

    it('should return multiple ownerships', async () => {
      const app = createTestApp();

      const ownerships = [
        mockOwnership,
        { ...mockOwnership, _id: 'ownership-002', assetId: 'asset-002', shares: 50 },
      ];

      mockConvexQuery.mockResolvedValueOnce(ownerships);

      const res = await app.request('/rwa/ownership');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
    });
  });

  // =========================================================================
  // POST /purchase - Purchase Flow Tests (Auth Required)
  // =========================================================================

  describe('POST /purchase', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10,
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should purchase shares successfully', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        success: true,
        shares: 10,
        totalCost: 1550,
      });

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.shares).toBe(10);
      expect(body.data.totalCost).toBe(1550);
      expect(body.data.status).toBe('completed');
    });

    it('should validate shares is positive integer', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: -5,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate shares is not zero', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 0,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate shares is integer', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10.5,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require listingId', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shares: 10,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require shares', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should handle listing not found', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Listing not found'));

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: 'nonexistent',
          shares: 10,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should handle insufficient funds', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient funds'));

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 1000,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should handle not enough shares available', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Not enough shares available'));

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10000,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should handle listing not active', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Listing not active'));

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LISTING_INACTIVE');
    });

    it('should handle general purchase errors', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Unknown error'));

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 10,
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('PURCHASE_ERROR');
    });

    it('should pass correct parameters to mutation', async () => {
      const app = createTestApp({ userId: 'specific-user-id' });

      mockConvexMutation.mockResolvedValueOnce({
        success: true,
        shares: 5,
        totalCost: 775,
      });

      await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 5,
        }),
      });

      expect(mockConvexMutation).toHaveBeenCalledWith('rwa:purchase', {
        userId: 'specific-user-id',
        listingId: mockListingId,
        shares: 5,
      });
    });
  });

  // =========================================================================
  // Edge Cases and Integration Scenarios
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle concurrent purchase requests', async () => {
      const app = createTestApp();

      mockConvexMutation
        .mockResolvedValueOnce({ success: true, shares: 5, totalCost: 775 })
        .mockResolvedValueOnce({ success: true, shares: 3, totalCost: 465 });

      const [res1, res2] = await Promise.all([
        app.request('/rwa/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: mockListingId, shares: 5 }),
        }),
        app.request('/rwa/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: 'listing-002', shares: 3 }),
        }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should handle large share quantities', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        success: true,
        shares: 9999,
        totalCost: 1549845,
      });

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: mockListingId,
          shares: 9999,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.shares).toBe(9999);
    });

    it('should handle URL-encoded parameters in search', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/search?q=new%20york%20luxury');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:search', expect.objectContaining({
        query: 'new york luxury',
      }));
    });

    it('should handle pagination at boundary', async () => {
      const app = createTestApp();

      // Return exactly limit number of items
      const assets = Array(50).fill(mockAsset).map((a, i) => ({ ...a, _id: `asset-${i}` }));
      mockConvexQuery.mockResolvedValueOnce(assets);

      const res = await app.request('/rwa/assets?limit=50');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(50);
      expect(body.pagination.totalItems).toBe(50);
    });

    it('should handle invalid limit parameter gracefully', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockAsset]);

      const res = await app.request('/rwa/assets?limit=invalid');

      expect(res.status).toBe(200);
      // Should use default limit
      expect(mockConvexQuery).toHaveBeenCalledWith('rwa:getAssets', expect.objectContaining({
        limit: 50, // default
      }));
    });

    it('should handle empty body in purchase', async () => {
      const app = createTestApp();

      const res = await app.request('/rwa/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
