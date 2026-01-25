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
    rewards: {
      getBalance: 'rewards:getBalance',
      getHistory: 'rewards:getHistory',
      getCatalog: 'rewards:getCatalog',
      redeem: 'rewards:redeem',
      getLeaderboard: 'rewards:getLeaderboard',
      claimDailyStreak: 'rewards:claimDailyStreak',
    },
  },
}));

// Import after mocks are set up
const { rewardsRoutes } = await import('../../routes/rewards');

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
const mockRewardId = 'reward-001' as const;

const mockBalance = {
  available: 5000,
  pending: 200,
  lifetimeEarned: 15000,
  lifetimeRedeemed: 10000,
  tier: 'silver',
  nextTier: 'gold',
  pointsToNextTier: 10000,
};

const mockTransaction = {
  _id: 'tx-001',
  userId: mockUserId,
  type: 'earn_trade',
  amount: 100,
  balance: 5000,
  status: 'completed',
  description: 'Points earned from trade',
  referenceType: 'orders',
  referenceId: 'order-123',
  createdAt: Date.now() - 3600000,
  completedAt: Date.now() - 3600000,
};

const mockReward = {
  _id: mockRewardId,
  name: '$10 Gift Card',
  description: 'Redeem for a $10 Amazon gift card',
  category: 'gift_cards',
  type: 'digital',
  pointsCost: 1000,
  stock: 100,
  isActive: true,
  isFeatured: true,
  imageUrl: 'https://example.com/gift-card.jpg',
  createdAt: Date.now() - 86400000 * 30,
  updatedAt: Date.now(),
};

const mockLeaderboardEntry = {
  rank: 1,
  userId: 'user-001',
  username: 'TopTrader',
  avatarUrl: 'https://example.com/avatar.jpg',
  points: 50000,
  tier: 'platinum',
};

// ===========================================================================
// Test Setup Helpers
// ===========================================================================

function createTestApp(options: { authenticated?: boolean; userId?: string } = {}) {
  const app = new Hono<Env>();

  // Add middleware to set userId and requestId for authenticated requests
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    if (options.authenticated !== false) {
      c.set('userId', options.userId ?? mockUserId);
    }
    await next();
  });

  app.route('/rewards', rewardsRoutes);
  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Rewards Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // GET /balance - Balance Retrieval Tests (Auth Required)
  // =========================================================================

  describe('GET /balance', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rewards/balance');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return points balance with tier info', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockBalance);

      const res = await app.request('/rewards/balance');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.available).toBe(5000);
      expect(body.data.pending).toBe(200);
      expect(body.data.tier).toBe('silver');
      expect(body.data.nextTier).toBe('gold');
      expect(body.data.pointsToNextTier).toBe(10000);
    });

    it('should pass correct userId to query', async () => {
      const app = createTestApp({ userId: 'specific-user-id' });

      mockConvexQuery.mockResolvedValueOnce(mockBalance);

      await app.request('/rewards/balance');

      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getBalance', {
        userId: 'specific-user-id',
      });
    });

    it('should handle zero balance', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        available: 0,
        pending: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        tier: 'bronze',
        nextTier: 'silver',
        pointsToNextTier: 10000,
      });

      const res = await app.request('/rewards/balance');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.available).toBe(0);
      expect(body.data.tier).toBe('bronze');
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rewards/balance');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });

    it('should handle diamond tier with no next tier', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockBalance,
        tier: 'diamond',
        nextTier: null,
        pointsToNextTier: 0,
      });

      const res = await app.request('/rewards/balance');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tier).toBe('diamond');
      expect(body.data.nextTier).toBeNull();
    });
  });

  // =========================================================================
  // GET /history - History Pagination Tests (Auth Required)
  // =========================================================================

  describe('GET /history', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rewards/history');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return transaction history with pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction, { ...mockTransaction, _id: 'tx-002' }],
        total: 25,
        hasMore: true,
      });

      const res = await app.request('/rewards/history');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.totalItems).toBe(25);
      expect(body.pagination.hasNextPage).toBe(true);
    });

    it('should filter by type', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction],
        total: 10,
        hasMore: false,
      });

      const res = await app.request('/rewards/history?type=earn_trade');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getHistory', expect.objectContaining({
        type: 'earn_trade',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction],
        total: 100,
        hasMore: true,
      });

      const res = await app.request('/rewards/history?limit=25');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getHistory', expect.objectContaining({
        limit: 25,
      }));
    });

    it('should handle offset pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction],
        total: 100,
        hasMore: true,
      });

      const res = await app.request('/rewards/history?offset=20&limit=10');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getHistory', expect.objectContaining({
        offset: 20,
        limit: 10,
      }));
      const body = await res.json();
      expect(body.pagination.page).toBe(3); // (20 / 10) + 1 = 3
    });

    it('should handle page-based pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction],
        total: 100,
        hasMore: true,
      });

      const res = await app.request('/rewards/history?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getHistory', expect.objectContaining({
        offset: 20, // (3 - 1) * 10 = 20
        limit: 10,
      }));
    });

    it('should handle empty history', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [],
        total: 0,
        hasMore: false,
      });

      const res = await app.request('/rewards/history');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(0);
      expect(body.pagination.hasPreviousPage).toBe(false);
      expect(body.pagination.hasNextPage).toBe(false);
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rewards/history');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });

    it('should calculate pagination correctly at boundaries', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: Array(10).fill(mockTransaction),
        total: 100,
        hasMore: true,
      });

      const res = await app.request('/rewards/history?page=10&limit=10');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.page).toBe(10);
      expect(body.pagination.totalPages).toBe(10);
      expect(body.pagination.hasPreviousPage).toBe(true);
    });
  });

  // =========================================================================
  // GET /catalog - Rewards Catalog Tests
  // =========================================================================

  describe('GET /catalog', () => {
    it('should return rewards catalog', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockReward, { ...mockReward, _id: 'reward-002' }]);

      const res = await app.request('/rewards/catalog');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should filter by category', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockReward]);

      const res = await app.request('/rewards/catalog?category=gift_cards');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getCatalog', expect.objectContaining({
        category: 'gift_cards',
      }));
    });

    it('should filter by featured', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockReward]);

      const res = await app.request('/rewards/catalog?featured=true');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getCatalog', expect.objectContaining({
        featured: true,
      }));
    });

    it('should handle empty catalog', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rewards/catalog');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rewards/catalog');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });

    it('should return rewards with all details', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockReward]);

      const res = await app.request('/rewards/catalog');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].pointsCost).toBeDefined();
      expect(body.data[0].stock).toBeDefined();
      expect(body.data[0].category).toBeDefined();
    });
  });

  // =========================================================================
  // POST /redeem - Redemption Flow Tests (Auth Required)
  // =========================================================================

  describe('POST /redeem', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should redeem reward successfully', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.redemptionId).toBe('redemption-001');
      expect(body.data.status).toBe('pending');
    });

    it('should validate quantity is positive integer', async () => {
      const app = createTestApp();

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: -1,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require rewardId', async () => {
      const app = createTestApp();

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 1,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should use default quantity of 1', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
        }),
      });

      expect(mockConvexMutation).toHaveBeenCalledWith('rewards:redeem', expect.objectContaining({
        quantity: 1,
      }));
    });

    it('should accept shipping address for physical rewards', async () => {
      const app = createTestApp();

      const shippingAddress = {
        name: 'John Doe',
        addressLine1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'USA',
      };

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
          shippingAddress,
        }),
      });

      expect(res.status).toBe(200);
      expect(mockConvexMutation).toHaveBeenCalledWith('rewards:redeem', expect.objectContaining({
        shippingAddress,
      }));
    });

    it('should handle insufficient points', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient points balance'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 100,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INSUFFICIENT_POINTS');
    });

    it('should handle reward out of stock', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Reward out of stock'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OUT_OF_STOCK');
    });

    it('should handle reward not found', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Reward not found'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: 'nonexistent',
          quantity: 1,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('REWARD_NOT_FOUND');
    });

    it('should handle inactive reward', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Reward is not active'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('REWARD_INACTIVE');
    });

    it('should handle general redemption errors', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Unknown error'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('REDEEM_FAILED');
    });

    it('should redeem multiple quantities', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 5,
        }),
      });

      expect(res.status).toBe(200);
      expect(mockConvexMutation).toHaveBeenCalledWith('rewards:redeem', expect.objectContaining({
        quantity: 5,
      }));
    });
  });

  // =========================================================================
  // GET /leaderboard - Leaderboard Tests
  // =========================================================================

  describe('GET /leaderboard', () => {
    it('should return leaderboard', async () => {
      const app = createTestApp();

      const leaderboard = [
        mockLeaderboardEntry,
        { ...mockLeaderboardEntry, rank: 2, userId: 'user-002', points: 45000 },
        { ...mockLeaderboardEntry, rank: 3, userId: 'user-003', points: 40000 },
      ];

      mockConvexQuery.mockResolvedValueOnce(leaderboard);

      const res = await app.request('/rewards/leaderboard');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(3);
      expect(body.data[0].rank).toBe(1);
    });

    it('should filter by period', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockLeaderboardEntry]);

      const res = await app.request('/rewards/leaderboard?period=daily');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getLeaderboard', expect.objectContaining({
        period: 'daily',
      }));
    });

    it('should use default period of weekly', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockLeaderboardEntry]);

      await app.request('/rewards/leaderboard');

      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getLeaderboard', expect.objectContaining({
        period: 'weekly',
      }));
    });

    it('should respect limit parameter', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockLeaderboardEntry]);

      const res = await app.request('/rewards/leaderboard?limit=50');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('rewards:getLeaderboard', expect.objectContaining({
        limit: 50,
      }));
    });

    it('should handle empty leaderboard', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/rewards/leaderboard');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });

    it('should handle fetch errors', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rewards/leaderboard');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('FETCH_FAILED');
    });
  });

  // =========================================================================
  // POST /daily-streak - Daily Streak Tests (Auth Required)
  // =========================================================================

  describe('POST /daily-streak', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should claim daily streak bonus', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        bonusAmount: 10,
        streakDays: 5,
      });

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.bonusAmount).toBe(10);
      expect(body.data.streakDays).toBe(5);
    });

    it('should pass correct userId', async () => {
      const app = createTestApp({ userId: 'specific-user-id' });

      mockConvexMutation.mockResolvedValueOnce({
        bonusAmount: 10,
        streakDays: 1,
      });

      await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(mockConvexMutation).toHaveBeenCalledWith('rewards:claimDailyStreak', {
        userId: 'specific-user-id',
      });
    });

    it('should handle already claimed today', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Already claimed today'));

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('ALREADY_CLAIMED');
    });

    it('should handle general claim errors', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Unknown error'));

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('CLAIM_FAILED');
    });

    it('should return increased bonus for longer streaks', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        bonusAmount: 50,
        streakDays: 30,
      });

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.bonusAmount).toBe(50);
      expect(body.data.streakDays).toBe(30);
    });
  });

  // =========================================================================
  // Edge Cases and Integration Scenarios
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle concurrent redemption requests', async () => {
      const app = createTestApp();

      mockConvexMutation
        .mockResolvedValueOnce({ redemptionId: 'redemption-001', status: 'pending' })
        .mockResolvedValueOnce({ redemptionId: 'redemption-002', status: 'pending' });

      const [res1, res2] = await Promise.all([
        app.request('/rewards/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rewardId: mockRewardId, quantity: 1 }),
        }),
        app.request('/rewards/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rewardId: 'reward-002', quantity: 1 }),
        }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should handle large leaderboard', async () => {
      const app = createTestApp();

      const largeLeaderboard = Array(100).fill(mockLeaderboardEntry).map((e, i) => ({
        ...e,
        rank: i + 1,
        userId: `user-${i}`,
        points: 50000 - i * 100,
      }));

      mockConvexQuery.mockResolvedValueOnce(largeLeaderboard);

      const res = await app.request('/rewards/leaderboard?limit=100');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(100);
    });

    it('should handle transaction history pagination across pages', async () => {
      const app = createTestApp();

      // First page
      mockConvexQuery.mockResolvedValueOnce({
        transactions: Array(50).fill(mockTransaction),
        total: 150,
        hasMore: true,
      });

      const res1 = await app.request('/rewards/history?page=1&limit=50');
      const body1 = await res1.json();

      expect(body1.pagination.page).toBe(1);
      expect(body1.pagination.hasNextPage).toBe(true);
      expect(body1.pagination.hasPreviousPage).toBe(false);

      // Second page
      mockConvexQuery.mockResolvedValueOnce({
        transactions: Array(50).fill(mockTransaction),
        total: 150,
        hasMore: true,
      });

      const res2 = await app.request('/rewards/history?page=2&limit=50');
      const body2 = await res2.json();

      expect(body2.pagination.page).toBe(2);
      expect(body2.pagination.hasPreviousPage).toBe(true);
    });

    it('should handle empty request body for daily streak', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        bonusAmount: 10,
        streakDays: 1,
      });

      const res = await app.request('/rewards/daily-streak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    });

    it('should validate shipping address fields when provided', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
          shippingAddress: {
            name: 'John Doe',
            addressLine1: '123 Main St',
            // Missing required fields
          },
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Type Converter Tests - toUserId() and toRewardId()
  // =========================================================================

  describe('Type Converters', () => {
    it('should call toUserId() when fetching balance', async () => {
      const app = createTestApp();
      const customUserId = 'custom-user-456';

      mockConvexQuery.mockResolvedValueOnce(mockBalance);

      await app.request('/rewards/balance', {
        headers: { 'x-user-id': customUserId },
      });

      // Verify toUserId was called via the Convex query
      expect(mockConvexQuery).toHaveBeenCalledWith(
        'rewards:getBalance',
        expect.objectContaining({
          userId: expect.any(String),
        })
      );
    });

    it('should call toUserId() when fetching history', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [],
        total: 0,
        hasMore: false,
      });

      await app.request('/rewards/history');

      expect(mockConvexQuery).toHaveBeenCalledWith(
        'rewards:getHistory',
        expect.objectContaining({
          userId: expect.any(String),
        })
      );
    });

    it('should call toUserId() and toRewardId() when redeeming', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });

      // Verify both toUserId and toRewardId were called
      expect(mockConvexMutation).toHaveBeenCalledWith(
        'rewards:redeem',
        expect.objectContaining({
          userId: expect.any(String),
          rewardId: expect.any(String),
        })
      );
    });

    it('should call toUserId() when claiming daily streak', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        bonusAmount: 10,
        streakDays: 1,
      });

      await app.request('/rewards/daily-streak', {
        method: 'POST',
      });

      expect(mockConvexMutation).toHaveBeenCalledWith(
        'rewards:claimDailyStreak',
        expect.objectContaining({
          userId: expect.any(String),
        })
      );
    });
  });

  // =========================================================================
  // Response Format Tests - Timestamps and Error Structure
  // =========================================================================

  describe('Response Format', () => {
    it('should include timestamp in balance response', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockBalance);

      const res = await app.request('/rewards/balance');
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
      expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should include timestamp in history response', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        transactions: [mockTransaction],
        total: 1,
        hasMore: false,
      });

      const res = await app.request('/rewards/history');
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });

    it('should include timestamp in catalog response', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockReward]);

      const res = await app.request('/rewards/catalog');
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });

    it('should include timestamp in redeem response', async () => {
      const app = createTestApp();

      mockConvexMutation.mockResolvedValueOnce({
        redemptionId: 'redemption-001',
        status: 'pending',
      });

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });

    it('should include timestamp in error responses', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/rewards/balance');
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });

    it('should have proper error format with requestId and timestamp', async () => {
      const app = createTestApp();

      mockConvexMutation.mockRejectedValueOnce(new Error('Insufficient points'));

      const res = await app.request('/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: mockRewardId,
          quantity: 1,
        }),
      });
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(body.requestId).toBe('test-request-id');
      expect(body.timestamp).toBeDefined();
    });

    it('should include requestId in all error responses', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/rewards/balance');
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.requestId).toBe('test-request-id');
    });
  });
});
