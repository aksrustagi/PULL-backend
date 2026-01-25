/**
 * Test Setup and Teardown
 * Provides utilities for test lifecycle management
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// ===========================================================================
// Environment Setup
// ===========================================================================

/**
 * Set up test environment variables
 */
export function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-that-is-at-least-32-chars-long';
  process.env.CONVEX_URL = 'https://test.convex.cloud';
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';
  process.env.PERSONA_API_KEY = 'persona_test_mock_key';
  process.env.PERSONA_WEBHOOK_SECRET = 'persona_webhook_test_secret';
  process.env.KALSHI_API_KEY = 'kalshi_test_api_key';
  process.env.KALSHI_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MvE5MOCK_KEY_TEST
-----END RSA PRIVATE KEY-----`;
  process.env.PLAID_CLIENT_ID = 'plaid_test_client_id';
  process.env.PLAID_SECRET = 'plaid_test_secret';
  process.env.PLAID_ENV = 'sandbox';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.TEMPORAL_ADDRESS = 'localhost:7233';
}

/**
 * Clean up test environment
 */
export function cleanupTestEnv() {
  // Reset environment variables
  delete process.env.JWT_SECRET;
  delete process.env.CONVEX_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PERSONA_API_KEY;
  delete process.env.KALSHI_API_KEY;
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.REDIS_URL;
}

// ===========================================================================
// Mock Timers
// ===========================================================================

/**
 * Set up fake timers for testing time-dependent code
 */
export function setupFakeTimers() {
  vi.useFakeTimers();
}

/**
 * Clean up fake timers
 */
export function cleanupFakeTimers() {
  vi.useRealTimers();
}

/**
 * Advance time by specified milliseconds
 */
export function advanceTime(ms: number) {
  vi.advanceTimersByTime(ms);
}

/**
 * Set current time for tests
 */
export function setCurrentTime(date: Date) {
  vi.setSystemTime(date);
}

// ===========================================================================
// Database Mock Helpers
// ===========================================================================

/**
 * Mock Convex database context
 */
export interface MockDbContext {
  db: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  userId?: string;
  isAdmin?: boolean;
  isSystem?: boolean;
}

/**
 * Create a mock database query chain
 */
export function createMockQueryChain() {
  const chain = {
    withIndex: vi.fn().mockReturnThis(),
    withSearchIndex: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    take: vi.fn().mockResolvedValue([]),
    collect: vi.fn().mockResolvedValue([]),
    unique: vi.fn().mockResolvedValue(null),
    first: vi.fn().mockResolvedValue(null),
  };
  return chain;
}

/**
 * Create a mock database context
 */
export function createMockDbContext(options: {
  userId?: string;
  isAdmin?: boolean;
  isSystem?: boolean;
} = {}): MockDbContext {
  return {
    db: {
      get: vi.fn().mockResolvedValue(null),
      query: vi.fn().mockReturnValue(createMockQueryChain()),
      insert: vi.fn().mockResolvedValue('new-id'),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    userId: options.userId,
    isAdmin: options.isAdmin ?? false,
    isSystem: options.isSystem ?? false,
  };
}

// ===========================================================================
// HTTP Mock Helpers
// ===========================================================================

/**
 * Create a mock HTTP response
 */
export function createMockResponse(
  body: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
  } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(responses: Map<string, Response>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const response = responses.get(url);
    if (response) {
      return response.clone();
    }
    return createMockResponse({ error: 'Not found' }, { status: 404 });
  });
}

// ===========================================================================
// Test Lifecycle Helpers
// ===========================================================================

/**
 * Standard test setup hooks
 */
export function useTestSetup() {
  beforeAll(() => {
    setupTestEnv();
  });

  afterAll(() => {
    cleanupTestEnv();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
}

/**
 * Test setup with fake timers
 */
export function useTestSetupWithTimers() {
  beforeAll(() => {
    setupTestEnv();
    setupFakeTimers();
  });

  afterAll(() => {
    cleanupFakeTimers();
    cleanupTestEnv();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
}

// ===========================================================================
// Assertion Helpers
// ===========================================================================

/**
 * Assert that a function throws an error with specific message
 */
export function expectError(fn: () => unknown, message: string) {
  try {
    fn();
    throw new Error(`Expected error: "${message}" but none was thrown`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) {
      return;
    }
    throw error;
  }
}

/**
 * Assert that an async function throws an error with specific message
 */
export async function expectAsyncError(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    throw new Error(`Expected error: "${message}" but none was thrown`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) {
      return;
    }
    throw error;
  }
}

// ===========================================================================
// Wait Helpers
// ===========================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Wait for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================================================================
// Cleanup Registry
// ===========================================================================

const cleanupFunctions: (() => void | Promise<void>)[] = [];

/**
 * Register a cleanup function to run after tests
 */
export function registerCleanup(fn: () => void | Promise<void>) {
  cleanupFunctions.push(fn);
}

/**
 * Run all registered cleanup functions
 */
export async function runCleanup() {
  for (const fn of cleanupFunctions.reverse()) {
    await fn();
  }
  cleanupFunctions.length = 0;
}

// Auto-cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', runCleanup);
}
