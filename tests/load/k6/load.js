/**
 * PULL Backend - Load Test
 *
 * Normal load test simulating typical production traffic
 * Configuration: 100 VUs, 10 minutes with ramp-up/down
 *
 * Run: k6 run tests/load/k6/load.js
 * With env: k6 run -e BASE_URL=https://api.pull.app tests/load/k6/load.js
 */

import { group, sleep } from 'k6';
import { ENV, THRESHOLDS } from './lib/config.js';
import { login, getAuthHeaders, logout } from './lib/auth.js';
import {
  anonymousBrowsing,
  activeTrader,
  fantasyBettor,
  marketDataConsumer,
  rewardsEngagement,
  thinkTime,
} from './lib/scenarios.js';
import { THINK_TIMES } from './lib/config.js';

export const options = {
  // Load test stages
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],

  // Performance thresholds (SLOs)
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000', 'med<200'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    'http_req_duration{endpoint:login}': ['p(95)<800'],
    'http_req_duration{type:trading}': ['p(95)<600'],
    'http_req_duration{type:markets}': ['p(95)<400'],
    'http_req_duration{type:payments}': ['p(95)<1000'],

    // Custom metrics
    'auth_latency': ['p(95)<800'],
    'trading_latency': ['p(95)<600'],
    'markets_latency': ['p(95)<400'],
  },

  // Tags
  tags: {
    testType: 'load',
    environment: __ENV.ENVIRONMENT || 'local',
  },

  // Scenarios - different user behaviors
  scenarios: {
    // Anonymous users browsing
    anonymous_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '6m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      exec: 'anonymousUserScenario',
      tags: { scenario: 'anonymous' },
    },

    // Authenticated traders
    active_traders: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 30 },
        { duration: '6m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      exec: 'traderScenario',
      tags: { scenario: 'trader' },
    },

    // Fantasy bettors
    fantasy_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 30 },
        { duration: '6m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      exec: 'fantasyUserScenario',
      tags: { scenario: 'fantasy' },
    },

    // Market data consumers
    data_consumers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '6m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      exec: 'dataConsumerScenario',
      tags: { scenario: 'data' },
    },
  },
};

// Setup
export function setup() {
  console.log(`Starting load test against ${ENV.BASE_URL}`);
  console.log('Test duration: 10 minutes');
  console.log('Max VUs: 100');

  return {
    startTime: Date.now(),
    testId: `load-${Date.now()}`,
  };
}

// Scenario: Anonymous User
export function anonymousUserScenario() {
  group('Anonymous User Session', () => {
    anonymousBrowsing();
    thinkTime(THINK_TIMES.navigation);
  });

  sleep(Math.random() * 3 + 2); // 2-5 seconds between sessions
}

// Scenario: Active Trader
export function traderScenario() {
  const auth = login();
  if (!auth || !auth.token) {
    console.error('Trader login failed');
    sleep(5);
    return;
  }

  group('Trader Session', () => {
    activeTrader(auth.token);
    thinkTime(THINK_TIMES.navigation);

    // Sometimes also check rewards
    if (Math.random() > 0.7) {
      rewardsEngagement(auth.token);
    }
  });

  logout(auth.token);
  sleep(Math.random() * 5 + 3); // 3-8 seconds between sessions
}

// Scenario: Fantasy User
export function fantasyUserScenario() {
  const auth = login();
  if (!auth || !auth.token) {
    console.error('Fantasy user login failed');
    sleep(5);
    return;
  }

  group('Fantasy User Session', () => {
    fantasyBettor(auth.token);
    thinkTime(THINK_TIMES.decideBet);

    // Often check rewards
    if (Math.random() > 0.5) {
      rewardsEngagement(auth.token);
    }
  });

  logout(auth.token);
  sleep(Math.random() * 4 + 2); // 2-6 seconds between sessions
}

// Scenario: Data Consumer
export function dataConsumerScenario() {
  const auth = login();
  if (!auth || !auth.token) {
    console.error('Data consumer login failed');
    sleep(5);
    return;
  }

  group('Data Consumer Session', () => {
    marketDataConsumer(auth.token);
  });

  logout(auth.token);
  sleep(Math.random() * 3 + 2); // 2-5 seconds between sessions
}

// Default function (if no scenarios defined)
export default function () {
  // This runs if scenarios are disabled
  const scenarios = [
    anonymousUserScenario,
    traderScenario,
    fantasyUserScenario,
    dataConsumerScenario,
  ];

  // Weighted random selection
  const weights = [0.2, 0.3, 0.3, 0.2];
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      scenarios[i]();
      break;
    }
  }
}

// Teardown
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)} seconds`);
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    testType: 'load',
    testId: data.testId || 'unknown',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    maxVUs: 100,
    scenarios: ['anonymous', 'trader', 'fantasy', 'data'],
    metrics: {
      totalRequests: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
      failedRequests: data.metrics.http_req_failed ? data.metrics.http_req_failed.values.passes : 0,
      errorRate: data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0,
      avgDuration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values.avg.toFixed(2) : 0,
      medDuration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values.med.toFixed(2) : 0,
      p95Duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0,
      p99Duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) : 0,
      dataReceived: data.metrics.data_received ? data.metrics.data_received.values.count : 0,
      dataSent: data.metrics.data_sent ? data.metrics.data_sent.values.count : 0,
    },
    thresholdsPassed: !data.thresholds || Object.values(data.thresholds).every(t => t.ok),
  };

  return {
    'stdout': generateTextSummary(data),
    'tests/load/results/load-summary.json': JSON.stringify(summary, null, 2),
  };
}

function generateTextSummary(data) {
  const checks = data.root_group ? (data.root_group.checks || { passes: 0, fails: 0 }) : { passes: 0, fails: 0 };
  const metrics = data.metrics || {};

  return `
================================================================================
  PULL Backend - Load Test Summary
================================================================================

  Test Configuration:
    - Duration: 10 minutes
    - Max VUs: 100
    - Scenarios: Anonymous, Trader, Fantasy, Data Consumer

  Request Metrics:
    - Total Requests: ${metrics.http_reqs ? metrics.http_reqs.values.count : 0}
    - Failed Requests: ${metrics.http_req_failed ? metrics.http_req_failed.values.passes : 0}
    - Error Rate: ${metrics.http_req_failed ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%

  Response Times:
    - Average: ${metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 0}ms
    - Median:  ${metrics.http_req_duration ? metrics.http_req_duration.values.med.toFixed(2) : 0}ms
    - P90:     ${metrics.http_req_duration ? metrics.http_req_duration.values['p(90)'].toFixed(2) : 0}ms
    - P95:     ${metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms
    - P99:     ${metrics.http_req_duration ? metrics.http_req_duration.values['p(99)'].toFixed(2) : 0}ms
    - Max:     ${metrics.http_req_duration ? metrics.http_req_duration.values.max.toFixed(2) : 0}ms

  Data Transfer:
    - Received: ${metrics.data_received ? (metrics.data_received.values.count / 1024 / 1024).toFixed(2) : 0} MB
    - Sent:     ${metrics.data_sent ? (metrics.data_sent.values.count / 1024 / 1024).toFixed(2) : 0} MB

  Checks:
    - Passed: ${checks.passes}
    - Failed: ${checks.fails}
    - Pass Rate: ${checks.passes + checks.fails > 0 ? ((checks.passes / (checks.passes + checks.fails)) * 100).toFixed(2) : 0}%

  Thresholds:
    - All Passed: ${!data.thresholds || Object.values(data.thresholds).every(t => t.ok) ? 'YES' : 'NO'}

================================================================================
`;
}
