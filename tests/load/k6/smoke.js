/**
 * PULL Backend - Smoke Test
 *
 * Quick smoke test to verify basic functionality
 * Configuration: 10 VUs, 1 minute duration
 *
 * Run: k6 run tests/load/k6/smoke.js
 * With env: k6 run -e BASE_URL=https://api.pull.app tests/load/k6/smoke.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { ENV, ENDPOINTS, THRESHOLDS, HTTP_DEFAULTS } from './lib/config.js';
import { login, getAuthHeaders } from './lib/auth.js';
import { checkHealthResponse, checkApiResponse, checkAuthResponse } from './lib/checks.js';

export const options = {
  // Smoke test configuration
  vus: 10,
  duration: '1m',

  // Performance thresholds
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'], // Allow 5% error rate for smoke
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    'http_req_duration{endpoint:login}': ['p(95)<800'],
  },

  // Tags for better organization
  tags: {
    testType: 'smoke',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Setup: Run once before all VUs start
export function setup() {
  console.log(`Starting smoke test against ${ENV.BASE_URL}`);

  // Verify health endpoint is reachable
  const healthRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.health}`);
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: ${healthRes.status}`);
  }

  console.log('Health check passed, starting smoke test');
  return { startTime: Date.now() };
}

// Main test function
export default function (data) {
  // Test 1: Health Check
  group('Health Endpoints', () => {
    const healthRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.health}`, {
      tags: { endpoint: 'health', type: 'public' },
    });
    checkHealthResponse(healthRes);

    const readyRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.healthReady}`, {
      tags: { endpoint: 'health-ready', type: 'public' },
    });
    check(readyRes, { 'ready endpoint returns 200': (r) => r.status === 200 });

    const liveRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.healthLive}`, {
      tags: { endpoint: 'health-live', type: 'public' },
    });
    check(liveRes, { 'live endpoint returns 200': (r) => r.status === 200 });
  });

  sleep(0.5);

  // Test 2: Authentication
  group('Authentication', () => {
    const auth = login();

    if (auth && auth.token) {
      check(auth, {
        'login returns token': (a) => a.token && a.token.length > 0,
        'login returns refresh token': (a) => a.refreshToken && a.refreshToken.length > 0,
      });

      // Test protected endpoint access
      const headers = getAuthHeaders(auth.token);
      const portfolioRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.portfolio}`, {
        headers,
        tags: { endpoint: 'portfolio', type: 'protected' },
      });
      checkApiResponse(portfolioRes, 'portfolio');
    }
  });

  sleep(0.5);

  // Test 3: Public Market Data
  group('Market Data', () => {
    const eventsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionEvents}?limit=10`, {
      tags: { endpoint: 'events', type: 'public' },
    });
    checkApiResponse(eventsRes, 'events');

    const categoriesRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionCategories}`, {
      tags: { endpoint: 'categories', type: 'public' },
    });
    checkApiResponse(categoriesRes, 'categories');
  });

  sleep(0.5);

  // Test 4: Search
  group('Search', () => {
    const searchRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionSearch}?q=test`, {
      tags: { endpoint: 'search', type: 'public' },
    });
    checkApiResponse(searchRes, 'search');
  });

  sleep(1);
}

// Teardown: Run once after all VUs finish
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Smoke test completed in ${duration.toFixed(2)} seconds`);
}

// Handle summary report
export function handleSummary(data) {
  const summary = {
    testType: 'smoke',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    vus: options.vus,
    metrics: {
      requests: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
      failedRequests: data.metrics.http_req_failed ? data.metrics.http_req_failed.values.passes : 0,
      avgDuration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values.avg : 0,
      p95Duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 0,
    },
    passed: data.root_group.checks ? data.root_group.checks.passes : 0,
    failed: data.root_group.checks ? data.root_group.checks.fails : 0,
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/results/smoke-summary.json': JSON.stringify(summary, null, 2),
  };
}

function textSummary(data, opts) {
  const checks = data.root_group.checks || { passes: 0, fails: 0 };
  const totalChecks = checks.passes + checks.fails;
  const passRate = totalChecks > 0 ? ((checks.passes / totalChecks) * 100).toFixed(2) : 0;

  return `
===============================================
  PULL Backend - Smoke Test Summary
===============================================

  Total Requests: ${data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0}
  Failed Requests: ${data.metrics.http_req_failed ? data.metrics.http_req_failed.values.passes : 0}

  Response Times:
    - Average: ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values.avg.toFixed(2) : 0}ms
    - Median:  ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values.med.toFixed(2) : 0}ms
    - P95:     ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms
    - P99:     ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) : 0}ms

  Checks:
    - Passed: ${checks.passes}
    - Failed: ${checks.fails}
    - Pass Rate: ${passRate}%

===============================================
`;
}
