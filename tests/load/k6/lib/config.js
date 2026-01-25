/**
 * K6 Load Test Configuration
 * Centralized configuration for all load tests
 */

// Environment configuration
export const ENV = {
  BASE_URL: __ENV.BASE_URL || 'http://localhost:3001',
  API_VERSION: __ENV.API_VERSION || 'v1',

  // Test user credentials (should be set via environment variables in CI)
  TEST_USER_EMAIL: __ENV.TEST_USER_EMAIL || 'loadtest@example.com',
  TEST_USER_PASSWORD: __ENV.TEST_USER_PASSWORD || 'LoadTest123!',

  // Optional: Pre-generated auth token for faster tests
  AUTH_TOKEN: __ENV.AUTH_TOKEN || '',

  // Test data
  TEST_MARKET_ID: __ENV.TEST_MARKET_ID || 'test-market-1',
  TEST_EVENT_TICKER: __ENV.TEST_EVENT_TICKER || 'TEST-EVENT',
  TEST_LEAGUE_ID: __ENV.TEST_LEAGUE_ID || 'test-league-1',
};

// API endpoints
export const ENDPOINTS = {
  // Health
  health: '/health',
  healthReady: '/health/ready',
  healthLive: '/health/live',

  // Auth
  login: '/api/auth/login',
  register: '/api/auth/register',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',

  // Trading
  orders: `/api/${ENV.API_VERSION}/trading/orders`,
  portfolio: `/api/${ENV.API_VERSION}/trading/portfolio`,
  buyingPower: `/api/${ENV.API_VERSION}/trading/buying-power`,

  // Predictions
  predictionEvents: `/api/${ENV.API_VERSION}/predictions/events`,
  predictionCategories: `/api/${ENV.API_VERSION}/predictions/categories`,
  predictionSearch: `/api/${ENV.API_VERSION}/predictions/search`,
  predictionPositions: `/api/${ENV.API_VERSION}/predictions/positions`,
  predictionMarkets: `/api/${ENV.API_VERSION}/predictions/markets`,

  // Fantasy
  fantasyMarkets: `/api/${ENV.API_VERSION}/fantasy/markets`,
  fantasyBets: `/api/${ENV.API_VERSION}/fantasy/markets/bets/mine`,
  fantasyWallet: `/api/${ENV.API_VERSION}/fantasy/payments/wallet`,
  fantasyTransactions: `/api/${ENV.API_VERSION}/fantasy/payments/transactions`,
  fantasyDeposit: `/api/${ENV.API_VERSION}/fantasy/payments/deposit`,
  fantasyWithdraw: `/api/${ENV.API_VERSION}/fantasy/payments/withdraw`,

  // Rewards
  rewardsBalance: `/api/${ENV.API_VERSION}/rewards/balance`,
  rewardsHistory: `/api/${ENV.API_VERSION}/rewards/history`,
  rewardsCatalog: `/api/${ENV.API_VERSION}/rewards/catalog`,
  rewardsLeaderboard: `/api/${ENV.API_VERSION}/rewards/leaderboard`,

  // KYC
  kycStatus: `/api/${ENV.API_VERSION}/kyc/status`,

  // Social
  socialFeed: `/api/${ENV.API_VERSION}/social/feed`,
};

// Performance thresholds (SLOs)
export const THRESHOLDS = {
  // Response time thresholds
  http_req_duration: {
    // 95th percentile should be under 500ms
    p95: ['p(95)<500'],
    // 99th percentile should be under 1000ms
    p99: ['p(99)<1000'],
    // Median should be under 200ms
    med: ['med<200'],
  },

  // Error rate should be less than 1%
  http_req_failed: ['rate<0.01'],

  // Specific endpoint thresholds
  'http_req_duration{endpoint:health}': ['p(95)<100'],
  'http_req_duration{endpoint:login}': ['p(95)<800'],
  'http_req_duration{endpoint:trading}': ['p(95)<600'],
  'http_req_duration{endpoint:markets}': ['p(95)<400'],
  'http_req_duration{endpoint:payments}': ['p(95)<1000'],
};

// Think times (realistic user behavior pauses)
export const THINK_TIMES = {
  // Time to read market information
  readMarket: { min: 2, max: 5 },
  // Time to decide on a bet
  decideBet: { min: 3, max: 8 },
  // Time between page navigations
  navigation: { min: 1, max: 3 },
  // Time to fill forms
  fillForm: { min: 2, max: 6 },
  // Quick action (button click)
  quickAction: { min: 0.5, max: 1.5 },
};

// Test scenarios configurations
export const SCENARIOS = {
  smoke: {
    vus: 10,
    duration: '1m',
    description: 'Quick smoke test to verify basic functionality',
  },
  load: {
    vus: 100,
    duration: '10m',
    rampUp: '2m',
    rampDown: '1m',
    description: 'Normal load test simulating typical traffic',
  },
  stress: {
    maxVus: 500,
    stages: [
      { duration: '2m', target: 100 },
      { duration: '5m', target: 300 },
      { duration: '5m', target: 500 },
      { duration: '3m', target: 100 },
      { duration: '2m', target: 0 },
    ],
    description: 'Stress test to find breaking points',
  },
  spike: {
    stages: [
      { duration: '30s', target: 50 },
      { duration: '10s', target: 400 },
      { duration: '1m', target: 400 },
      { duration: '10s', target: 50 },
      { duration: '2m', target: 50 },
    ],
    description: 'Spike test simulating sudden traffic surge',
  },
  soak: {
    vus: 50,
    duration: '1h',
    description: 'Endurance test for memory leaks and stability',
  },
};

// Rate limiting awareness
export const RATE_LIMITS = {
  anonymous: { requests: 30, window: '1m' },
  authenticated: { requests: 100, window: '1m' },
  premium: { requests: 300, window: '1m' },
  betting: { requests: 30, window: '1m' },
  payment: { requests: 5, window: '10m' },
  auth: { requests: 10, window: '15m' },
};

// HTTP request defaults
export const HTTP_DEFAULTS = {
  timeout: '30s',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'PULL-LoadTest/1.0',
  },
};
