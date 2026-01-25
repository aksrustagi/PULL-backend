/**
 * Mock Services
 * Provides mock implementations for external services
 */

import { vi } from 'vitest';

// ===========================================================================
// Stripe Mock
// ===========================================================================

export interface MockStripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
  customer: string;
  metadata: Record<string, string>;
  created: number;
}

export interface MockStripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'canceled';
  client_secret: string;
  customer: string;
  metadata: Record<string, string>;
  created: number;
}

export interface MockStripeCustomer {
  id: string;
  email: string;
  name: string;
  metadata: Record<string, string>;
  created: number;
}

export function createMockStripeClient() {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({
        id: 'cus_mock123',
        email: 'test@example.com',
        name: 'Test User',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripeCustomer),
      retrieve: vi.fn().mockResolvedValue({
        id: 'cus_mock123',
        email: 'test@example.com',
        name: 'Test User',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripeCustomer),
      update: vi.fn().mockResolvedValue({
        id: 'cus_mock123',
        email: 'test@example.com',
        name: 'Updated User',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripeCustomer),
      del: vi.fn().mockResolvedValue({ id: 'cus_mock123', deleted: true }),
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_mock123',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_mock123_secret_mock',
        customer: 'cus_mock123',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripePaymentIntent),
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_mock123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_mock123_secret_mock',
        customer: 'cus_mock123',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripePaymentIntent),
      update: vi.fn().mockResolvedValue({
        id: 'pi_mock123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_mock123_secret_mock',
        customer: 'cus_mock123',
        metadata: { updated: 'true' },
        created: Math.floor(Date.now() / 1000),
      } as MockStripePaymentIntent),
      confirm: vi.fn().mockResolvedValue({
        id: 'pi_mock123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_mock123_secret_mock',
        customer: 'cus_mock123',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripePaymentIntent),
      cancel: vi.fn().mockResolvedValue({
        id: 'pi_mock123',
        amount: 10000,
        currency: 'usd',
        status: 'canceled',
        client_secret: 'pi_mock123_secret_mock',
        customer: 'cus_mock123',
        metadata: {},
        created: Math.floor(Date.now() / 1000),
      } as MockStripePaymentIntent),
    },
    paymentMethods: {
      attach: vi.fn().mockResolvedValue({
        id: 'pm_mock123',
        type: 'card',
        customer: 'cus_mock123',
      }),
      detach: vi.fn().mockResolvedValue({ id: 'pm_mock123' }),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    refunds: {
      create: vi.fn().mockResolvedValue({
        id: 'ref_mock123',
        amount: 10000,
        charge: 'ch_mock123',
        status: 'succeeded',
      }),
    },
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        id: 'evt_mock123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_mock123',
            amount: 10000,
            currency: 'usd',
            status: 'succeeded',
          },
        },
      }),
    },
  };
}

// ===========================================================================
// Persona Mock
// ===========================================================================

export interface MockPersonaInquiry {
  id: string;
  type: 'inquiry';
  attributes: {
    status: 'created' | 'pending' | 'completed' | 'failed' | 'approved' | 'declined';
    reference_id: string;
    name_first: string | null;
    name_last: string | null;
    birthdate: string | null;
    created_at: string;
    current_step_name: string | null;
    next_step_name: string | null;
  };
}

export function createMockPersonaClient() {
  return {
    createInquiry: vi.fn().mockResolvedValue({
      inquiry: {
        id: 'inq_mock123',
        type: 'inquiry',
        attributes: {
          status: 'created',
          reference_id: 'user_123',
          name_first: null,
          name_last: null,
          birthdate: null,
          created_at: new Date().toISOString(),
          current_step_name: 'start',
          next_step_name: 'document',
        },
      } as MockPersonaInquiry,
      sessionToken: 'session_token_mock123',
    }),
    getInquiry: vi.fn().mockResolvedValue({
      id: 'inq_mock123',
      type: 'inquiry',
      attributes: {
        status: 'approved',
        reference_id: 'user_123',
        name_first: 'John',
        name_last: 'Doe',
        birthdate: '1990-01-15',
        created_at: new Date().toISOString(),
        current_step_name: null,
        next_step_name: null,
      },
    } as MockPersonaInquiry),
    resumeInquiry: vi.fn().mockResolvedValue({
      inquiry: {
        id: 'inq_mock123',
        type: 'inquiry',
        attributes: {
          status: 'pending',
          reference_id: 'user_123',
          name_first: 'John',
          name_last: 'Doe',
          birthdate: '1990-01-15',
          created_at: new Date().toISOString(),
          current_step_name: 'selfie',
          next_step_name: 'complete',
        },
      } as MockPersonaInquiry,
      sessionToken: 'session_token_mock456',
    }),
    approveInquiry: vi.fn().mockResolvedValue({
      id: 'inq_mock123',
      type: 'inquiry',
      attributes: {
        status: 'approved',
        reference_id: 'user_123',
        name_first: 'John',
        name_last: 'Doe',
        birthdate: '1990-01-15',
        created_at: new Date().toISOString(),
        current_step_name: null,
        next_step_name: null,
      },
    } as MockPersonaInquiry),
    declineInquiry: vi.fn().mockResolvedValue({
      id: 'inq_mock123',
      type: 'inquiry',
      attributes: {
        status: 'declined',
        reference_id: 'user_123',
        name_first: 'John',
        name_last: 'Doe',
        birthdate: '1990-01-15',
        created_at: new Date().toISOString(),
        current_step_name: null,
        next_step_name: null,
      },
    } as MockPersonaInquiry),
    upsertAccount: vi.fn().mockResolvedValue({
      id: 'act_mock123',
      referenceId: 'user_123',
    }),
    getLatestInquiryByReferenceId: vi.fn().mockResolvedValue(null),
    needsUserAction: vi.fn().mockReturnValue(false),
    isInquiryApproved: vi.fn().mockReturnValue(true),
    verifyWebhook: vi.fn().mockReturnValue({ valid: true, payload: {} }),
  };
}

// ===========================================================================
// Kalshi Mock
// ===========================================================================

export interface MockKalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  status: 'open' | 'closed' | 'settled';
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  open_interest: number;
}

export interface MockKalshiOrder {
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'market' | 'limit';
  status: 'pending' | 'resting' | 'canceled' | 'executed';
  count: number;
  filled_count: number;
  remaining_count: number;
  yes_price: number;
  no_price: number;
  created_time: string;
}

export function createMockKalshiClient() {
  return {
    getExchangeStatus: vi.fn().mockResolvedValue({
      trading_active: true,
      exchange_active: true,
    }),
    getMarkets: vi.fn().mockResolvedValue({
      markets: [
        {
          ticker: 'PRESYES-24-001',
          event_ticker: 'PRES-24',
          title: 'Will candidate win the election?',
          status: 'open',
          yes_bid: 55,
          yes_ask: 57,
          no_bid: 43,
          no_ask: 45,
          volume: 1000000,
          open_interest: 500000,
        },
      ] as MockKalshiMarket[],
      cursor: null,
    }),
    getMarket: vi.fn().mockResolvedValue({
      ticker: 'PRESYES-24-001',
      event_ticker: 'PRES-24',
      title: 'Will candidate win the election?',
      status: 'open',
      yes_bid: 55,
      yes_ask: 57,
      no_bid: 43,
      no_ask: 45,
      volume: 1000000,
      open_interest: 500000,
    } as MockKalshiMarket),
    getMarketOrderbook: vi.fn().mockResolvedValue({
      yes: [
        { price: 55, quantity: 100 },
        { price: 54, quantity: 200 },
      ],
      no: [
        { price: 45, quantity: 100 },
        { price: 44, quantity: 200 },
      ],
    }),
    getEvents: vi.fn().mockResolvedValue({
      events: [
        {
          event_ticker: 'PRES-24',
          title: '2024 Presidential Election',
          category: 'Politics',
          status: 'open',
          markets_count: 5,
        },
      ],
      cursor: null,
    }),
    getBalance: vi.fn().mockResolvedValue({
      balance: 10000,
      available_balance: 8000,
      reserved_balance: 2000,
    }),
    getPositions: vi.fn().mockResolvedValue({
      positions: [
        {
          ticker: 'PRESYES-24-001',
          position: 100,
          average_price: 50,
          market_value: 5500,
        },
      ],
      cursor: null,
    }),
    createOrder: vi.fn().mockResolvedValue({
      order_id: 'ord_mock123',
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
    } as MockKalshiOrder),
    cancelOrder: vi.fn().mockResolvedValue({
      order_id: 'ord_mock123',
      ticker: 'PRESYES-24-001',
      side: 'yes',
      action: 'buy',
      type: 'limit',
      status: 'canceled',
      count: 100,
      filled_count: 0,
      remaining_count: 100,
      yes_price: 55,
      no_price: 45,
      created_time: new Date().toISOString(),
    } as MockKalshiOrder),
    getOrders: vi.fn().mockResolvedValue({
      orders: [],
      cursor: null,
    }),
    getFills: vi.fn().mockResolvedValue({
      fills: [],
      cursor: null,
    }),
    getRateLimitInfo: vi.fn().mockReturnValue({
      limit: 100,
      remaining: 95,
      reset: Math.floor(Date.now() / 1000) + 60,
    }),
  };
}

// ===========================================================================
// Fraud Detection Mock
// ===========================================================================

export function createMockFraudDetectionClient() {
  return {
    analyzeTradeRealtime: vi.fn().mockResolvedValue({
      assessmentId: 'assessment_mock123',
      entityId: 'trade_123',
      entityType: 'trade',
      riskScore: 0.1,
      riskLevel: 'low',
      signals: [],
      recommendations: [
        { action: 'no_action', priority: 'low', reason: 'Normal activity' },
      ],
      assessedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }),
    analyzeWashTrading: vi.fn().mockResolvedValue({
      userId: 'user_123',
      analysisWindow: { start: new Date(), end: new Date() },
      selfTradeCount: 0,
      selfTradeVolume: 0,
      relatedAccountTrades: [],
      circularTradingPatterns: [],
      riskScore: 0,
      isWashTrading: false,
    }),
    analyzeMarketManipulation: vi.fn().mockResolvedValue({
      marketId: 'market_123',
      analysisWindow: { start: new Date(), end: new Date() },
      spoofingEvents: [],
      layeringEvents: [],
      pumpAndDumpPatterns: [],
      priceImpactAnalysis: {
        marketId: 'market_123',
        normalVolatility: 0.05,
        currentVolatility: 0.05,
        abnormalPriceMovements: [],
      },
      riskScore: 0,
    }),
    analyzeBatch: vi.fn().mockResolvedValue({
      analysisId: 'batch_mock123',
      totalTrades: 100,
      flaggedTrades: 0,
      userRiskScores: new Map(),
      alerts: [],
      completedAt: new Date(),
      processingTimeMs: 150,
    }),
    getUserRiskProfile: vi.fn().mockResolvedValue({
      userId: 'user_123',
      overallRiskScore: 0.1,
      riskLevel: 'low',
      riskFactors: [],
      tradingBehavior: {
        averageDailyVolume: 1000,
        averageTradeSize: 100,
        preferredMarkets: ['PRES-24'],
        tradingHours: [9, 10, 11, 12, 13, 14, 15, 16],
        winRate: 0.55,
        volatilityPreference: 'medium',
      },
      accountFlags: [],
      restrictions: [],
      lastAssessment: new Date(),
      nextAssessment: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }),
    getStats: vi.fn().mockReturnValue({
      tradesAnalyzed: 1000,
      alertsGenerated: 5,
      tradesFlagged: 10,
      averageLatencyMs: 15,
      lastUpdated: new Date(),
    }),
    ping: vi.fn().mockResolvedValue(true),
    resetStats: vi.fn(),
  };
}

// ===========================================================================
// Plaid Mock
// ===========================================================================

export function createMockPlaidClient() {
  return {
    createLinkToken: vi.fn().mockResolvedValue({
      link_token: 'link-mock-token-123',
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
    exchangePublicToken: vi.fn().mockResolvedValue({
      access_token: 'access-mock-token-123',
      item_id: 'item_mock123',
    }),
    getAccounts: vi.fn().mockResolvedValue({
      accounts: [
        {
          account_id: 'acc_mock123',
          name: 'Checking Account',
          type: 'depository',
          subtype: 'checking',
          mask: '1234',
          balances: {
            available: 5000,
            current: 5000,
            limit: null,
          },
        },
      ],
    }),
    getIdentity: vi.fn().mockResolvedValue({
      accounts: [
        {
          account_id: 'acc_mock123',
          owners: [
            {
              names: ['John Doe'],
              emails: [{ data: 'john@example.com', primary: true }],
              phone_numbers: [{ data: '+15551234567', primary: true }],
              addresses: [
                {
                  data: {
                    street: '123 Main St',
                    city: 'San Francisco',
                    region: 'CA',
                    postal_code: '94102',
                    country: 'US',
                  },
                  primary: true,
                },
              ],
            },
          ],
        },
      ],
    }),
    createProcessorToken: vi.fn().mockResolvedValue({
      processor_token: 'processor-mock-token-123',
    }),
  };
}

// ===========================================================================
// Redis Mock
// ===========================================================================

export function createMockRedisClient() {
  const storage = new Map<string, string>();
  const expirations = new Map<string, number>();

  return {
    get: vi.fn().mockImplementation((key: string) => {
      const expiry = expirations.get(key);
      if (expiry && Date.now() > expiry) {
        storage.delete(key);
        expirations.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(storage.get(key) ?? null);
    }),
    set: vi.fn().mockImplementation((key: string, value: string, options?: { ex?: number }) => {
      storage.set(key, value);
      if (options?.ex) {
        expirations.set(key, Date.now() + options.ex * 1000);
      }
      return Promise.resolve('OK');
    }),
    del: vi.fn().mockImplementation((key: string) => {
      storage.delete(key);
      expirations.delete(key);
      return Promise.resolve(1);
    }),
    exists: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(storage.has(key) ? 1 : 0);
    }),
    incr: vi.fn().mockImplementation((key: string) => {
      const current = parseInt(storage.get(key) ?? '0', 10);
      storage.set(key, String(current + 1));
      return Promise.resolve(current + 1);
    }),
    expire: vi.fn().mockImplementation((key: string, seconds: number) => {
      if (storage.has(key)) {
        expirations.set(key, Date.now() + seconds * 1000);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
    ttl: vi.fn().mockImplementation((key: string) => {
      const expiry = expirations.get(key);
      if (!expiry) return Promise.resolve(-1);
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      return Promise.resolve(remaining > 0 ? remaining : -2);
    }),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    _storage: storage, // For test inspection
    _clear: () => {
      storage.clear();
      expirations.clear();
    },
  };
}

// ===========================================================================
// Convex Mock
// ===========================================================================

export function createMockConvexClient() {
  return {
    query: vi.fn().mockResolvedValue(null),
    mutation: vi.fn().mockResolvedValue(null),
    action: vi.fn().mockResolvedValue(null),
  };
}

// ===========================================================================
// Temporal Mock
// ===========================================================================

export function createMockTemporalClient() {
  const workflows = new Map<string, { status: { name: string }; workflowId: string }>();

  return {
    workflow: {
      start: vi.fn().mockImplementation(async (workflowType: string, options: { workflowId: string }) => {
        workflows.set(options.workflowId, {
          status: { name: 'RUNNING' },
          workflowId: options.workflowId,
        });
        return {
          workflowId: options.workflowId,
          result: vi.fn().mockResolvedValue({ success: true }),
        };
      }),
      getHandle: vi.fn().mockImplementation((workflowId: string) => ({
        workflowId,
        result: vi.fn().mockResolvedValue({ success: true }),
        query: vi.fn().mockResolvedValue({ status: 'completed' }),
        signal: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn().mockResolvedValue(undefined),
      })),
      list: vi.fn().mockImplementation(async function* () {
        for (const workflow of workflows.values()) {
          yield workflow;
        }
      }),
    },
    _workflows: workflows,
  };
}
