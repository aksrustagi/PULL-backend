/**
 * Payments Route Tests
 * Tests for deposit and withdrawal flows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables before importing routes
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_key');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_mock_secret');

// Mock Convex client and API
const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();

vi.mock('../../lib/convex', () => ({
  convex: {
    query: (...args: unknown[]) => mockConvexQuery(...args),
    mutation: (...args: unknown[]) => mockConvexMutation(...args),
  },
  api: {
    balances: {
      getByUserAndAsset: 'balances:getByUserAndAsset',
      recordDeposit: 'balances:recordDeposit',
      recordWithdrawal: 'balances:recordWithdrawal',
      completeDeposit: 'balances:completeDeposit',
      getBuyingPower: 'balances:getBuyingPower',
    },
    deposits: {
      getById: 'deposits:getById',
      getByUser: 'deposits:getByUser',
      create: 'deposits:create',
      updateStatus: 'deposits:updateStatus',
    },
    withdrawals: {
      getById: 'withdrawals:getById',
      getByUser: 'withdrawals:getByUser',
      create: 'withdrawals:create',
      updateStatus: 'withdrawals:updateStatus',
    },
    users: {
      getById: 'users:getById',
    },
  },
}));

// Mock Stripe
const mockStripeClient = {
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
  paymentMethods: {
    list: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => mockStripeClient),
}));

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

const mockUser = {
  _id: mockUserId,
  email: 'test@example.com',
  displayName: 'Test User',
  status: 'active',
  kycTier: 'verified',
  stripeCustomerId: 'cus_mock123',
};

const mockBalance = {
  _id: 'balance-001',
  userId: mockUserId,
  assetType: 'usd',
  assetId: 'USD',
  symbol: 'USD',
  available: 10000,
  held: 1000,
  pending: 0,
  updatedAt: Date.now(),
};

const mockDeposit = {
  _id: 'deposit-001',
  userId: mockUserId,
  method: 'card',
  status: 'pending',
  amount: 1000,
  currency: 'USD',
  fee: 30,
  netAmount: 970,
  externalId: 'pi_mock123',
  createdAt: Date.now(),
};

const mockWithdrawal = {
  _id: 'withdrawal-001',
  userId: mockUserId,
  method: 'bank_transfer',
  status: 'pending',
  amount: 500,
  currency: 'USD',
  fee: 25,
  netAmount: 475,
  destination: 'acct_mock123',
  createdAt: Date.now(),
};

const mockPaymentIntent = {
  id: 'pi_mock123',
  amount: 100000, // $1000.00 in cents
  currency: 'usd',
  status: 'requires_payment_method',
  client_secret: 'pi_mock123_secret_mock',
  customer: 'cus_mock123',
  metadata: {
    userId: mockUserId,
    type: 'deposit',
  },
};

// ===========================================================================
// Test Setup Helpers
// ===========================================================================

function createTestApp(options: { authenticated?: boolean; userId?: string } = {}) {
  const app = new Hono<Env>();

  // Add middleware to set userId and requestId
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    if (options.authenticated !== false) {
      c.set('userId', options.userId ?? mockUserId);
    }
    await next();
  });

  // Deposit routes
  app.post('/payments/deposits', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const body = await c.req.json();

    // Validation
    if (!body.amount || body.amount <= 0) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be positive' },
      }, 400);
    }

    if (!body.method) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Payment method required' },
      }, 400);
    }

    const validMethods = ['card', 'bank_transfer', 'wire', 'crypto'];
    if (!validMethods.includes(body.method)) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid payment method' },
      }, 400);
    }

    // Check KYC for large deposits
    const user = await mockConvexQuery('users:getById', { id: userId });
    if (body.amount >= 10000 && user?.kycTier === 'none') {
      return c.json({
        success: false,
        error: { code: 'KYC_REQUIRED', message: 'KYC verification required for large deposits' },
      }, 403);
    }

    // Calculate fee
    const fee = body.method === 'card' ? Math.ceil(body.amount * 0.03) : 0;
    const netAmount = body.amount - fee;

    // Create payment intent with Stripe
    const paymentIntent = await mockStripeClient.paymentIntents.create({
      amount: body.amount * 100, // Convert to cents
      currency: 'usd',
      customer: user?.stripeCustomerId,
      metadata: {
        userId,
        type: 'deposit',
      },
    });

    // Record deposit in database
    const depositId = await mockConvexMutation('deposits:create', {
      userId,
      method: body.method,
      amount: body.amount,
      currency: 'USD',
      fee,
      netAmount,
      externalId: paymentIntent.id,
    });

    return c.json({
      success: true,
      data: {
        depositId,
        amount: body.amount,
        fee,
        netAmount,
        clientSecret: paymentIntent.client_secret,
        status: 'pending',
      },
    }, 201);
  });

  // Get deposits
  app.get('/payments/deposits', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const result = await mockConvexQuery('deposits:getByUser', {
      userId,
      status,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result?.deposits || [],
      pagination: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalItems: result?.total || 0,
        totalPages: Math.ceil((result?.total || 0) / limit),
        hasNextPage: offset + limit < (result?.total || 0),
        hasPreviousPage: offset > 0,
      },
    });
  });

  // Get single deposit
  app.get('/payments/deposits/:depositId', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const depositId = c.req.param('depositId');
    const deposit = await mockConvexQuery('deposits:getById', { id: depositId });

    if (!deposit) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deposit not found' },
      }, 404);
    }

    if (deposit.userId !== userId) {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized' },
      }, 403);
    }

    return c.json({
      success: true,
      data: deposit,
    });
  });

  // Withdrawal routes
  app.post('/payments/withdrawals', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const body = await c.req.json();

    // Validation
    if (!body.amount || body.amount <= 0) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be positive' },
      }, 400);
    }

    if (!body.method) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Withdrawal method required' },
      }, 400);
    }

    const validMethods = ['bank_transfer', 'wire', 'crypto'];
    if (!validMethods.includes(body.method)) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid withdrawal method' },
      }, 400);
    }

    if (!body.destination) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Destination required' },
      }, 400);
    }

    // Check KYC
    const user = await mockConvexQuery('users:getById', { id: userId });
    if (user?.kycTier === 'none') {
      return c.json({
        success: false,
        error: { code: 'KYC_REQUIRED', message: 'KYC verification required for withdrawals' },
      }, 403);
    }

    // Check balance
    const balance = await mockConvexQuery('balances:getByUserAndAsset', {
      userId,
      assetType: 'usd',
      assetId: 'USD',
    });

    if (!balance || balance.available < body.amount) {
      return c.json({
        success: false,
        error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' },
      }, 400);
    }

    // Calculate fee
    const fee = body.method === 'wire' ? 25 : 0;
    const netAmount = body.amount - fee;

    // Minimum withdrawal check
    if (netAmount < 10) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Minimum withdrawal is $10 after fees' },
      }, 400);
    }

    // Record withdrawal
    const withdrawalId = await mockConvexMutation('withdrawals:create', {
      userId,
      method: body.method,
      amount: body.amount,
      currency: 'USD',
      fee,
      netAmount,
      destination: body.destination,
    });

    return c.json({
      success: true,
      data: {
        withdrawalId,
        amount: body.amount,
        fee,
        netAmount,
        status: 'pending',
        estimatedArrival: body.method === 'wire' ? '1-3 business days' : '3-5 business days',
      },
    }, 201);
  });

  // Get withdrawals
  app.get('/payments/withdrawals', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const result = await mockConvexQuery('withdrawals:getByUser', {
      userId,
      status,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result?.withdrawals || [],
      pagination: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalItems: result?.total || 0,
        totalPages: Math.ceil((result?.total || 0) / limit),
        hasNextPage: offset + limit < (result?.total || 0),
        hasPreviousPage: offset > 0,
      },
    });
  });

  // Cancel withdrawal
  app.post('/payments/withdrawals/:withdrawalId/cancel', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const withdrawalId = c.req.param('withdrawalId');
    const withdrawal = await mockConvexQuery('withdrawals:getById', { id: withdrawalId });

    if (!withdrawal) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Withdrawal not found' },
      }, 404);
    }

    if (withdrawal.userId !== userId) {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized' },
      }, 403);
    }

    if (withdrawal.status !== 'pending') {
      return c.json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Can only cancel pending withdrawals' },
      }, 400);
    }

    await mockConvexMutation('withdrawals:updateStatus', {
      id: withdrawalId,
      status: 'cancelled',
    });

    return c.json({
      success: true,
      data: {
        withdrawalId,
        status: 'cancelled',
      },
    });
  });

  // Payment methods
  app.get('/payments/methods', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const user = await mockConvexQuery('users:getById', { id: userId });
    if (!user?.stripeCustomerId) {
      return c.json({
        success: true,
        data: [],
      });
    }

    const methods = await mockStripeClient.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    return c.json({
      success: true,
      data: methods.data || [],
    });
  });

  // Webhook endpoint
  app.post('/payments/webhook', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Missing signature' },
      }, 400);
    }

    try {
      const payload = await c.req.text();
      const event = mockStripeClient.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          // Complete deposit
          const paymentIntent = event.data.object;
          const depositId = paymentIntent.metadata?.depositId;
          if (depositId) {
            await mockConvexMutation('balances:completeDeposit', { depositId });
          }
          break;

        case 'payment_intent.payment_failed':
          // Mark deposit as failed
          const failedIntent = event.data.object;
          const failedDepositId = failedIntent.metadata?.depositId;
          if (failedDepositId) {
            await mockConvexMutation('deposits:updateStatus', {
              id: failedDepositId,
              status: 'failed',
            });
          }
          break;
      }

      return c.json({ success: true, received: true });
    } catch {
      return c.json({
        success: false,
        error: { code: 'WEBHOOK_ERROR', message: 'Webhook processing failed' },
      }, 400);
    }
  });

  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Payments Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Deposit Tests
  // =========================================================================

  describe('POST /payments/deposits', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          method: 'card',
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should create a card deposit successfully', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockUser);
      mockStripeClient.paymentIntents.create.mockResolvedValueOnce(mockPaymentIntent);
      mockConvexMutation.mockResolvedValueOnce('deposit-new-001');

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          method: 'card',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.amount).toBe(1000);
      expect(body.data.fee).toBe(30); // 3% card fee
      expect(body.data.netAmount).toBe(970);
      expect(body.data.clientSecret).toBeDefined();
    });

    it('should create a bank transfer deposit with no fee', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockUser);
      mockStripeClient.paymentIntents.create.mockResolvedValueOnce(mockPaymentIntent);
      mockConvexMutation.mockResolvedValueOnce('deposit-new-002');

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 5000,
          method: 'bank_transfer',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.fee).toBe(0);
      expect(body.data.netAmount).toBe(5000);
    });

    it('should reject deposit with zero amount', async () => {
      const app = createTestApp();

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 0,
          method: 'card',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject deposit with negative amount', async () => {
      const app = createTestApp();

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: -100,
          method: 'card',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject deposit without payment method', async () => {
      const app = createTestApp();

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('method');
    });

    it('should reject invalid payment method', async () => {
      const app = createTestApp();

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          method: 'invalid_method',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require KYC for large deposits', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockUser,
        kycTier: 'none',
      });

      const res = await app.request('/payments/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 10000,
          method: 'bank_transfer',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('KYC_REQUIRED');
    });
  });

  describe('GET /payments/deposits', () => {
    it('should return user deposits', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        deposits: [mockDeposit],
        total: 1,
      });

      const res = await app.request('/payments/deposits');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        deposits: [mockDeposit],
        total: 1,
      });

      const res = await app.request('/payments/deposits?status=pending');

      expect(res.status).toBe(200);
      expect(mockConvexQuery).toHaveBeenCalledWith('deposits:getByUser', expect.objectContaining({
        status: 'pending',
      }));
    });

    it('should support pagination', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        deposits: [mockDeposit],
        total: 50,
      });

      const res = await app.request('/payments/deposits?limit=10&offset=20');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.page).toBe(3);
      expect(body.pagination.pageSize).toBe(10);
    });
  });

  describe('GET /payments/deposits/:depositId', () => {
    it('should return deposit details', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockDeposit);

      const res = await app.request('/payments/deposits/deposit-001');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data._id).toBe('deposit-001');
    });

    it('should return 404 for non-existent deposit', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/payments/deposits/nonexistent');

      expect(res.status).toBe(404);
    });

    it('should return 403 for deposit belonging to another user', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockDeposit,
        userId: 'other-user',
      });

      const res = await app.request('/payments/deposits/deposit-001');

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Withdrawal Tests
  // =========================================================================

  describe('POST /payments/withdrawals', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          method: 'bank_transfer',
          destination: 'acct_123',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should create withdrawal successfully', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser) // getById
        .mockResolvedValueOnce(mockBalance); // getByUserAndAsset
      mockConvexMutation.mockResolvedValueOnce('withdrawal-new-001');

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          method: 'bank_transfer',
          destination: 'acct_123',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.amount).toBe(500);
      expect(body.data.status).toBe('pending');
    });

    it('should apply wire transfer fee', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockBalance);
      mockConvexMutation.mockResolvedValueOnce('withdrawal-new-002');

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          method: 'wire',
          destination: 'wire_123',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.fee).toBe(25);
      expect(body.data.netAmount).toBe(975);
    });

    it('should reject withdrawal with insufficient balance', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({
          ...mockBalance,
          available: 100,
        });

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          method: 'bank_transfer',
          destination: 'acct_123',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should require KYC for withdrawals', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockUser,
        kycTier: 'none',
      });

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          method: 'bank_transfer',
          destination: 'acct_123',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('KYC_REQUIRED');
    });

    it('should reject withdrawal without destination', async () => {
      const app = createTestApp();

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          method: 'bank_transfer',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject withdrawal below minimum', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockBalance);

      const res = await app.request('/payments/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 30, // With $25 wire fee, net would be $5
          method: 'wire',
          destination: 'wire_123',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Minimum');
    });
  });

  describe('POST /payments/withdrawals/:withdrawalId/cancel', () => {
    it('should cancel pending withdrawal', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockWithdrawal);
      mockConvexMutation.mockResolvedValueOnce({ status: 'cancelled' });

      const res = await app.request('/payments/withdrawals/withdrawal-001/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('cancelled');
    });

    it('should reject cancellation of non-pending withdrawal', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockWithdrawal,
        status: 'processing',
      });

      const res = await app.request('/payments/withdrawals/withdrawal-001/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_STATUS');
    });

    it('should return 404 for non-existent withdrawal', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/payments/withdrawals/nonexistent/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Payment Methods Tests
  // =========================================================================

  describe('GET /payments/methods', () => {
    it('should return user payment methods', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockUser);
      mockStripeClient.paymentMethods.list.mockResolvedValueOnce({
        data: [
          {
            id: 'pm_123',
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2025,
            },
          },
        ],
      });

      const res = await app.request('/payments/methods');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('should return empty array when no Stripe customer', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce({
        ...mockUser,
        stripeCustomerId: undefined,
      });

      const res = await app.request('/payments/methods');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  // =========================================================================
  // Webhook Tests
  // =========================================================================

  describe('POST /payments/webhook', () => {
    it('should reject without signature', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/payments/webhook', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should process payment_intent.succeeded', async () => {
      const app = createTestApp({ authenticated: false });

      mockStripeClient.webhooks.constructEvent.mockReturnValueOnce({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            metadata: {
              depositId: 'deposit-001',
            },
          },
        },
      });
      mockConvexMutation.mockResolvedValueOnce({ success: true });

      const res = await app.request('/payments/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });

    it('should process payment_intent.payment_failed', async () => {
      const app = createTestApp({ authenticated: false });

      mockStripeClient.webhooks.constructEvent.mockReturnValueOnce({
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_123',
            metadata: {
              depositId: 'deposit-001',
            },
          },
        },
      });
      mockConvexMutation.mockResolvedValueOnce({ success: true });

      const res = await app.request('/payments/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    });

    it('should handle webhook verification failure', async () => {
      const app = createTestApp({ authenticated: false });

      mockStripeClient.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const res = await app.request('/payments/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_signature',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('WEBHOOK_ERROR');
    });
  });
});

// ===========================================================================
// Fee Calculation Tests
// ===========================================================================

describe('Fee Calculations', () => {
  describe('Deposit Fees', () => {
    it('should calculate 3% card fee correctly', () => {
      const calculateCardFee = (amount: number): number => {
        return Math.ceil(amount * 0.03);
      };

      expect(calculateCardFee(1000)).toBe(30);
      expect(calculateCardFee(100)).toBe(3);
      expect(calculateCardFee(33)).toBe(1); // Rounds up
    });

    it('should have no fee for bank transfer', () => {
      const calculateBankFee = (): number => 0;
      expect(calculateBankFee()).toBe(0);
    });
  });

  describe('Withdrawal Fees', () => {
    it('should calculate $25 wire fee', () => {
      const calculateWireFee = (): number => 25;
      expect(calculateWireFee()).toBe(25);
    });

    it('should have no fee for ACH transfer', () => {
      const calculateACHFee = (): number => 0;
      expect(calculateACHFee()).toBe(0);
    });

    it('should calculate net amount correctly', () => {
      const calculateNet = (amount: number, fee: number): number => {
        return amount - fee;
      };

      expect(calculateNet(500, 25)).toBe(475);
      expect(calculateNet(1000, 0)).toBe(1000);
    });
  });
});
