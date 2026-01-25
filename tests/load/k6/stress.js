/**
 * PULL Backend - Stress Test
 *
 * Stress test to find system breaking points
 * Configuration: Ramping up to 500 VUs
 *
 * Run: k6 run tests/load/k6/stress.js
 * With env: k6 run -e BASE_URL=https://api.pull.app tests/load/k6/stress.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { ENV, ENDPOINTS, HTTP_DEFAULTS } from './lib/config.js';
import { login, getAuthHeaders, logout } from './lib/auth.js';
import {
  activeTrader,
  fantasyBettor,
  marketDataConsumer,
  thinkTime,
} from './lib/scenarios.js';
import { checkApiResponse, isRateLimited } from './lib/checks.js';
import { THINK_TIMES } from './lib/config.js';

// Custom metrics for stress testing
const rateLimitHits = new Counter('rate_limit_hits');
const timeouts = new Counter('request_timeouts');
const errorsByType = new Counter('errors_by_type');
const recoveryTime = new Trend('recovery_time');

export const options = {
  // Stress test stages - gradually increase load
  stages: [
    { duration: '2m', target: 100 },   // Warm up
    { duration: '3m', target: 200 },   // Increase to 200
    { duration: '3m', target: 300 },   // Increase to 300
    { duration: '3m', target: 400 },   // Increase to 400
    { duration: '3m', target: 500 },   // Peak at 500
    { duration: '2m', target: 300 },   // Scale down
    { duration: '2m', target: 100 },   // Continue scale down
    { duration: '2m', target: 0 },     // Ramp down to 0
  ],

  // Thresholds - more lenient for stress test
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // Higher latency acceptable
    http_req_failed: ['rate<0.10'], // Up to 10% errors acceptable during stress
    'http_req_duration{type:health}': ['p(95)<500'],
    rate_limit_hits: ['count<1000'], // Track rate limits
    request_timeouts: ['count<100'], // Track timeouts
  },

  // Tags
  tags: {
    testType: 'stress',
    environment: __ENV.ENVIRONMENT || 'local',
  },

  // Scenarios
  scenarios: {
    // Constant bombardment of health checks
    health_monitor: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 requests per second
      timeUnit: '1s',
      duration: '20m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'healthCheckScenario',
      tags: { scenario: 'health' },
    },

    // Ramping user load
    user_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '3m', target: 200 },
        { duration: '3m', target: 300 },
        { duration: '3m', target: 400 },
        { duration: '3m', target: 450 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      exec: 'userLoadScenario',
      tags: { scenario: 'user' },
    },
  },
};

// Setup
export function setup() {
  console.log('='.repeat(60));
  console.log('  PULL Backend - Stress Test Starting');
  console.log('='.repeat(60));
  console.log(`Target: ${ENV.BASE_URL}`);
  console.log('Peak VUs: 500');
  console.log('Duration: ~20 minutes');
  console.log('='.repeat(60));

  // Warm up - verify system is responding
  const healthRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.health}`);
  if (healthRes.status !== 200) {
    console.error('WARNING: Health check failed before stress test');
  }

  return {
    startTime: Date.now(),
    breakingPointFound: false,
    breakingPointVUs: null,
  };
}

// Health check scenario - monitor system health throughout
export function healthCheckScenario() {
  const startTime = Date.now();

  const res = http.get(`${ENV.BASE_URL}${ENDPOINTS.health}`, {
    timeout: '5s',
    tags: { endpoint: 'health', type: 'health' },
  });

  const duration = Date.now() - startTime;

  if (res.status === 0) {
    timeouts.add(1);
    errorsByType.add(1, { type: 'timeout' });
  } else if (res.status === 429) {
    rateLimitHits.add(1);
  } else if (res.status >= 500) {
    errorsByType.add(1, { type: 'server_error' });
  }

  check(res, {
    'health responds': (r) => r.status === 200,
    'health response time < 500ms': (r) => r.timings.duration < 500,
  });
}

// User load scenario - simulate real users
export function userLoadScenario() {
  const auth = login();
  if (!auth || !auth.token) {
    errorsByType.add(1, { type: 'auth_failure' });
    sleep(2);
    return;
  }

  const headers = getAuthHeaders(auth.token);

  group('Stress Test User Session', () => {
    // Portfolio check
    const portfolioRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.portfolio}`, {
      headers,
      timeout: '10s',
      tags: { endpoint: 'portfolio', type: 'trading' },
    });

    if (portfolioRes.status === 0) {
      timeouts.add(1);
    } else if (portfolioRes.status === 429) {
      rateLimitHits.add(1);
    }

    thinkTime({ min: 0.5, max: 1 });

    // Market data
    const eventsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionEvents}?limit=20`, {
      headers,
      timeout: '10s',
      tags: { endpoint: 'events', type: 'markets' },
    });

    if (eventsRes.status === 0) {
      timeouts.add(1);
    } else if (eventsRes.status === 429) {
      rateLimitHits.add(1);
    }

    thinkTime({ min: 0.5, max: 1 });

    // Place an order (write operation under stress)
    const orderPayload = JSON.stringify({
      symbol: 'STRESS-TEST',
      side: 'buy',
      type: 'market',
      quantity: 1,
      timeInForce: 'gtc',
    });

    const orderRes = http.post(`${ENV.BASE_URL}${ENDPOINTS.orders}`, orderPayload, {
      headers,
      timeout: '15s',
      tags: { endpoint: 'create-order', type: 'trading' },
    });

    if (orderRes.status === 0) {
      timeouts.add(1);
    } else if (orderRes.status === 429) {
      rateLimitHits.add(1);
    } else if (orderRes.status >= 500) {
      errorsByType.add(1, { type: 'order_error' });
    }

    thinkTime({ min: 0.5, max: 1 });

    // Fantasy market check
    const marketsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyMarkets}`, {
      headers,
      timeout: '10s',
      tags: { endpoint: 'markets', type: 'fantasy' },
    });

    if (marketsRes.status === 0) {
      timeouts.add(1);
    } else if (marketsRes.status === 429) {
      rateLimitHits.add(1);
    }
  });

  logout(auth.token);
  sleep(Math.random() * 2 + 1); // 1-3 seconds between sessions
}

// Default function
export default function () {
  userLoadScenario();
}

// Teardown
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(60));
  console.log('  Stress Test Completed');
  console.log('='.repeat(60));
  console.log(`Duration: ${(duration / 60).toFixed(2)} minutes`);

  if (data.breakingPointFound) {
    console.log(`Breaking point found at: ${data.breakingPointVUs} VUs`);
  }
  console.log('='.repeat(60));
}

// Summary handler
export function handleSummary(data) {
  const metrics = data.metrics || {};

  const summary = {
    testType: 'stress',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    peakVUs: 500,
    metrics: {
      totalRequests: metrics.http_reqs ? metrics.http_reqs.values.count : 0,
      failedRequests: metrics.http_req_failed ? metrics.http_req_failed.values.passes : 0,
      errorRate: metrics.http_req_failed ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 0,
      avgDuration: metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 0,
      p95Duration: metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'].toFixed(2) : 0,
      p99Duration: metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'].toFixed(2) : 0,
      maxDuration: metrics.http_req_duration ? metrics.http_req_duration.values.max.toFixed(2) : 0,
      rateLimitHits: metrics.rate_limit_hits ? metrics.rate_limit_hits.values.count : 0,
      timeouts: metrics.request_timeouts ? metrics.request_timeouts.values.count : 0,
    },
    thresholdsPassed: !data.thresholds || Object.values(data.thresholds).every(t => t.ok),
  };

  return {
    'stdout': generateStressSummary(data),
    'tests/load/results/stress-summary.json': JSON.stringify(summary, null, 2),
  };
}

function generateStressSummary(data) {
  const metrics = data.metrics || {};
  const checks = data.root_group ? (data.root_group.checks || { passes: 0, fails: 0 }) : { passes: 0, fails: 0 };

  return `
================================================================================
  PULL Backend - Stress Test Summary
================================================================================

  Test Configuration:
    - Duration: ~20 minutes
    - Peak VUs: 500
    - Stages: Ramp 100 -> 200 -> 300 -> 400 -> 500 -> Scale down

  Request Metrics:
    - Total Requests: ${metrics.http_reqs ? metrics.http_reqs.values.count : 0}
    - Failed Requests: ${metrics.http_req_failed ? metrics.http_req_failed.values.passes : 0}
    - Error Rate: ${metrics.http_req_failed ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%
    - Rate Limit Hits: ${metrics.rate_limit_hits ? metrics.rate_limit_hits.values.count : 0}
    - Timeouts: ${metrics.request_timeouts ? metrics.request_timeouts.values.count : 0}

  Response Times:
    - Average: ${metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 0}ms
    - Median:  ${metrics.http_req_duration ? metrics.http_req_duration.values.med.toFixed(2) : 0}ms
    - P95:     ${metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms
    - P99:     ${metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'].toFixed(2) : 0}ms
    - Max:     ${metrics.http_req_duration ? metrics.http_req_duration.values.max.toFixed(2) : 0}ms

  Stress Indicators:
    - Server Errors (5xx): Check logs for details
    - Rate Limiting: ${metrics.rate_limit_hits ? metrics.rate_limit_hits.values.count : 0} hits
    - Connection Timeouts: ${metrics.request_timeouts ? metrics.request_timeouts.values.count : 0}

  Checks:
    - Passed: ${checks.passes}
    - Failed: ${checks.fails}

  Thresholds:
    - All Passed: ${!data.thresholds || Object.values(data.thresholds).every(t => t.ok) ? 'YES' : 'NO'}

  Recommendations:
    ${metrics.http_req_failed && metrics.http_req_failed.values.rate > 0.05 ?
      '- HIGH ERROR RATE: Consider scaling infrastructure' : '- Error rate within acceptable limits'}
    ${metrics.http_req_duration && metrics.http_req_duration.values['p(95)'] > 1000 ?
      '- SLOW P95: Investigate slow endpoints' : '- Response times acceptable'}
    ${metrics.rate_limit_hits && metrics.rate_limit_hits.values.count > 500 ?
      '- HIGH RATE LIMITING: Review rate limit configuration' : '- Rate limiting working as expected'}

================================================================================
`;
}
