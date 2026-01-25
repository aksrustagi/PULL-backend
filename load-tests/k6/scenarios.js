/**
 * PULL API Load Tests with k6
 *
 * Run with:
 *   k6 run load-tests/k6/scenarios.js
 *   k6 run --vus 100 --duration 5m load-tests/k6/scenarios.js
 *
 * Or run specific scenario:
 *   k6 run --env SCENARIO=smoke load-tests/k6/scenarios.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const successfulLogins = new Counter('successful_logins');
const ordersPlaced = new Counter('orders_placed');

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'load';

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test - verify system works
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      exec: 'smokeTest',
      startTime: '0s',
    },

    // Load test - normal traffic
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up
        { duration: '5m', target: 50 },   // Stay at 50
        { duration: '2m', target: 100 },  // Ramp to 100
        { duration: '5m', target: 100 },  // Stay at 100
        { duration: '2m', target: 0 },    // Ramp down
      ],
      exec: 'loadTest',
      startTime: '0s',
    },

    // Stress test - find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '5m', target: 300 },
        { duration: '2m', target: 400 },
        { duration: '5m', target: 400 },
        { duration: '5m', target: 0 },
      ],
      exec: 'stressTest',
      startTime: '0s',
    },

    // Spike test - sudden traffic surge
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Fast ramp
        { duration: '1m', target: 100 },
        { duration: '10s', target: 500 },  // Spike!
        { duration: '3m', target: 500 },
        { duration: '10s', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '10s', target: 0 },
      ],
      exec: 'spikeTest',
      startTime: '0s',
    },

    // Soak test - extended duration
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30m',
      exec: 'soakTest',
      startTime: '0s',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms
    http_req_failed: ['rate<0.01'],                  // Error rate < 1%
    errors: ['rate<0.05'],                           // Custom errors < 5%
    api_latency: ['p(95)<400'],                      // API latency
  },
};

// Helper: Get auth token
function getAuthToken() {
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    email: `loadtest+${__VU}@pull.app`,
    password: 'LoadTest123!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    successfulLogins.add(1);
    return JSON.parse(loginRes.body).token;
  }
  return null;
}

// Helper: Authenticated request
function authRequest(method, path, body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const start = Date.now();
  let res;

  if (method === 'GET') {
    res = http.get(`${BASE_URL}${path}`, { headers });
  } else if (method === 'POST') {
    res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), { headers });
  } else if (method === 'PUT') {
    res = http.put(`${BASE_URL}${path}`, JSON.stringify(body), { headers });
  } else if (method === 'DELETE') {
    res = http.del(`${BASE_URL}${path}`, { headers });
  }

  apiLatency.add(Date.now() - start);
  errorRate.add(res.status >= 400);

  return res;
}

// ============================================================================
// SMOKE TEST - Basic functionality check
// ============================================================================
export function smokeTest() {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response has status ok': (r) => JSON.parse(r.body).status === 'ok',
    });
  });

  group('Public Endpoints', () => {
    const eventsRes = authRequest('GET', '/api/v1/predictions/events');
    check(eventsRes, {
      'events returns 200': (r) => r.status === 200,
      'events returns array': (r) => Array.isArray(JSON.parse(r.body).events || JSON.parse(r.body)),
    });

    const marketsRes = authRequest('GET', '/api/v1/predictions/markets');
    check(marketsRes, {
      'markets returns 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}

// ============================================================================
// LOAD TEST - Normal traffic simulation
// ============================================================================
export function loadTest() {
  const token = getAuthToken();

  group('Browse Markets', () => {
    const res = authRequest('GET', '/api/v1/predictions/events?limit=20', null, token);
    check(res, {
      'events load successfully': (r) => r.status === 200,
      'response time OK': (r) => r.timings.duration < 500,
    });
    sleep(0.5);

    // Get specific market
    const events = JSON.parse(res.body).events || [];
    if (events.length > 0) {
      const eventRes = authRequest('GET', `/api/v1/predictions/events/${events[0].id}`, null, token);
      check(eventRes, {
        'event detail loads': (r) => r.status === 200 || r.status === 404,
      });
    }
  });

  group('Check Portfolio', () => {
    const portfolioRes = authRequest('GET', '/api/v1/trading/portfolio', null, token);
    check(portfolioRes, {
      'portfolio loads': (r) => r.status === 200 || r.status === 401,
    });

    const balanceRes = authRequest('GET', '/api/v1/payments/balance', null, token);
    check(balanceRes, {
      'balance loads': (r) => r.status === 200 || r.status === 401,
    });
    sleep(0.3);
  });

  group('Social Feed', () => {
    const feedRes = authRequest('GET', '/api/v1/social/feed?limit=10', null, token);
    check(feedRes, {
      'feed loads': (r) => r.status === 200 || r.status === 404,
    });
    sleep(0.2);
  });

  sleep(Math.random() * 2 + 1); // Random 1-3s think time
}

// ============================================================================
// STRESS TEST - Find breaking point
// ============================================================================
export function stressTest() {
  const token = getAuthToken();

  // High-frequency reads
  group('Rapid Market Reads', () => {
    for (let i = 0; i < 5; i++) {
      const res = authRequest('GET', '/api/v1/predictions/events', null, token);
      check(res, {
        'rapid read succeeds': (r) => r.status === 200,
      });
      sleep(0.1);
    }
  });

  // Simulate order placement (without actually placing)
  group('Order Simulation', () => {
    const orderRes = authRequest('GET', '/api/v1/trading/orders', null, token);
    check(orderRes, {
      'orders endpoint responds': (r) => r.status === 200 || r.status === 401,
    });
  });

  sleep(0.5);
}

// ============================================================================
// SPIKE TEST - Sudden traffic surge
// ============================================================================
export function spikeTest() {
  // Same as load test but with more aggressive timing
  const token = getAuthToken();

  const res = authRequest('GET', '/api/v1/predictions/events', null, token);
  check(res, {
    'spike request succeeds': (r) => r.status === 200,
    'spike response time OK': (r) => r.timings.duration < 1000,
  });

  authRequest('GET', '/api/v1/trading/portfolio', null, token);
  authRequest('GET', '/api/v1/rewards/balance', null, token);

  sleep(0.2);
}

// ============================================================================
// SOAK TEST - Extended duration
// ============================================================================
export function soakTest() {
  // Lighter load but for extended period
  const token = getAuthToken();

  const res = authRequest('GET', '/api/v1/predictions/events', null, token);
  check(res, {
    'soak request succeeds': (r) => r.status === 200,
  });

  // Check for memory leaks by monitoring response times
  if (res.timings.duration > 1000) {
    console.log(`Warning: Slow response at ${new Date().toISOString()}: ${res.timings.duration}ms`);
  }

  sleep(1);
}

// ============================================================================
// DEFAULT - Run based on SCENARIO env var
// ============================================================================
export default function () {
  switch (SCENARIO) {
    case 'smoke':
      smokeTest();
      break;
    case 'stress':
      stressTest();
      break;
    case 'spike':
      spikeTest();
      break;
    case 'soak':
      soakTest();
      break;
    default:
      loadTest();
  }
}

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Scenario: ${SCENARIO}`);

  // Verify API is reachable
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`API not reachable: ${healthCheck.status}`);
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration}s`);
}
