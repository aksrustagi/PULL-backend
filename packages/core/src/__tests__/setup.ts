/**
 * Global Test Setup
 * Configuration and utilities for all tests in packages/core
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// ============================================================================
// Global Mocks
// ============================================================================

// Mock crypto for Node.js environments
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomUUID: vi.fn(() => "test-uuid-1234-5678-90ab-cdef"),
    createSign: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      sign: vi.fn(() => "mock-signature"),
    })),
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ============================================================================
// Test Utilities
// ============================================================================

export function createMockFetchResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({
      "Content-Type": "application/json",
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "99",
      "X-RateLimit-Reset": String(Date.now() + 60000),
    }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    clone: () => createMockFetchResponse(data, status),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
  } as Response;
}

export function createMockFetchError(
  message: string,
  code: string,
  status: number
): Response {
  return createMockFetchResponse(
    {
      message,
      code,
      error_type: code,
      error_code: code,
      error_message: message,
      display_message: message,
      request_id: "test-request-id",
    },
    status
  );
}

export function setupFetchMock(responses: Array<{ url: RegExp; response: Response }>) {
  mockFetch.mockImplementation((url: string) => {
    const match = responses.find((r) => r.url.test(url));
    if (match) {
      return Promise.resolve(match.response);
    }
    return Promise.reject(new Error(`Unhandled fetch to ${url}`));
  });
}

export function resetFetchMock() {
  mockFetch.mockReset();
}

// ============================================================================
// Mock Logger
// ============================================================================

export const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ============================================================================
// Test Factories
// ============================================================================

export const factories = {
  user: (overrides = {}) => ({
    id: "user_123",
    email: "test@example.com",
    displayName: "Test User",
    kycStatus: "approved" as const,
    kycTier: "verified" as const,
    ...overrides,
  }),

  order: (overrides = {}) => ({
    orderId: "ord_123",
    userId: "user_123",
    symbol: "AAPL-YES",
    side: "buy" as const,
    type: "limit" as const,
    quantity: 100,
    price: 0.55,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  market: (overrides = {}) => ({
    ticker: "AAPL-YES",
    event_ticker: "AAPL",
    title: "Apple Stock Up?",
    open_time: new Date().toISOString(),
    close_time: new Date(Date.now() + 86400000).toISOString(),
    status: "open" as const,
    yes_bid: 0.55,
    yes_ask: 0.56,
    no_bid: 0.44,
    no_ask: 0.45,
    last_price: 0.55,
    volume: 10000,
    ...overrides,
  }),

  position: (overrides = {}) => ({
    ticker: "AAPL-YES",
    position: 100,
    average_price: 0.50,
    market_value: 55,
    unrealized_pnl: 5,
    ...overrides,
  }),

  balance: (overrides = {}) => ({
    balance: 10000,
    available_balance: 8000,
    reserved_balance: 2000,
    pending_deposits: 0,
    pending_withdrawals: 0,
    ...overrides,
  }),

  plaidAccount: (overrides = {}) => ({
    account_id: "acc_123",
    name: "Checking Account",
    official_name: "Personal Checking",
    type: "depository" as const,
    subtype: "checking" as const,
    mask: "1234",
    balances: {
      available: 5000,
      current: 5200,
      limit: null,
      iso_currency_code: "USD",
      unofficial_currency_code: null,
    },
    ...overrides,
  }),

  transfer: (overrides = {}) => ({
    id: "transfer_123",
    account_id: "acc_123",
    amount: "100.00",
    type: "debit" as const,
    network: "ach" as const,
    status: "pending" as const,
    created: new Date().toISOString(),
    ...overrides,
  }),
};

// ============================================================================
// Test Fixtures
// ============================================================================

export const fixtures = {
  kalshiMarkets: [
    factories.market({ ticker: "BTC-100K-YES", title: "Bitcoin Above $100K?" }),
    factories.market({ ticker: "ETH-10K-YES", title: "Ethereum Above $10K?" }),
    factories.market({ ticker: "ELECTION-DEM-YES", title: "Democrat Wins?" }),
  ],

  kalshiPositions: [
    factories.position({ ticker: "BTC-100K-YES", position: 50 }),
    factories.position({ ticker: "ETH-10K-YES", position: -25 }),
  ],

  plaidAccounts: [
    factories.plaidAccount({ account_id: "acc_checking", name: "Checking" }),
    factories.plaidAccount({
      account_id: "acc_savings",
      name: "Savings",
      subtype: "savings" as "checking",
    }),
  ],
};

// ============================================================================
// Test Hooks
// ============================================================================

beforeAll(() => {
  // Set up test environment variables
  process.env.NODE_ENV = "test";
  process.env.KALSHI_API_KEY_ID = "test-api-key";
  process.env.KALSHI_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0m59l2u9iDnMbrXHfqkOrn2dVQ3vfBJqcDuFUK03d+1PZGbV
test-key-data
-----END RSA PRIVATE KEY-----`;
  process.env.PLAID_CLIENT_ID = "test-client-id";
  process.env.PLAID_SECRET = "test-secret";
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  resetFetchMock();
});

afterEach(() => {
  vi.clearAllTimers();
});

// ============================================================================
// Custom Matchers
// ============================================================================

expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },

  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be within range ${floor} - ${ceiling}`
          : `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Extend Vitest types
declare module "vitest" {
  interface Assertion<T = unknown> {
    toBeValidUUID(): T;
    toBeWithinRange(floor: number, ceiling: number): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidUUID(): unknown;
    toBeWithinRange(floor: number, ceiling: number): unknown;
  }
}

// ============================================================================
// Export globals for test files
// ============================================================================

export { vi, mockFetch };
