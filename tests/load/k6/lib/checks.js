/**
 * Common check functions for K6 load tests
 */

import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const successRate = new Rate('success');
export const dataReceivedTrend = new Trend('data_received_bytes');
export const requestCounter = new Counter('requests_total');

// Endpoint-specific metrics
export const authLatency = new Trend('auth_latency', true);
export const tradingLatency = new Trend('trading_latency', true);
export const marketsLatency = new Trend('markets_latency', true);
export const paymentsLatency = new Trend('payments_latency', true);

/**
 * Standard response checks
 * @param {object} response - HTTP response
 * @param {string} name - Check name prefix
 * @returns {boolean} - All checks passed
 */
export function checkResponse(response, name = 'request') {
  const checks = {
    [`${name} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} has body`]: (r) => r.body && r.body.length > 0,
    [`${name} response time OK`]: (r) => r.timings.duration < 5000,
  };

  const success = check(response, checks);

  // Record metrics
  errorRate.add(!success);
  successRate.add(success);
  requestCounter.add(1);
  dataReceivedTrend.add(response.body ? response.body.length : 0);

  return success;
}

/**
 * Check API success response format
 * @param {object} response - HTTP response
 * @param {string} name - Check name prefix
 * @returns {boolean} - All checks passed
 */
export function checkApiResponse(response, name = 'api') {
  const basicChecks = checkResponse(response, name);

  if (!basicChecks || response.status !== 200) {
    return false;
  }

  let body;
  try {
    body = response.json();
  } catch (e) {
    errorRate.add(1);
    return false;
  }

  const apiChecks = {
    [`${name} success is true`]: () => body.success === true,
    [`${name} has data`]: () => body.data !== undefined,
    [`${name} has timestamp`]: () => body.timestamp !== undefined,
  };

  return check(response, apiChecks);
}

/**
 * Check paginated response
 * @param {object} response - HTTP response
 * @param {string} name - Check name prefix
 * @returns {boolean} - All checks passed
 */
export function checkPaginatedResponse(response, name = 'paginated') {
  const basicChecks = checkApiResponse(response, name);

  if (!basicChecks) {
    return false;
  }

  const body = response.json();

  const paginationChecks = {
    [`${name} has pagination`]: () => body.pagination !== undefined,
    [`${name} has page`]: () => body.pagination && body.pagination.page !== undefined,
    [`${name} has pageSize`]: () => body.pagination && body.pagination.pageSize !== undefined,
    [`${name} has totalItems`]: () => body.pagination && body.pagination.totalItems !== undefined,
  };

  return check(response, paginationChecks);
}

/**
 * Check health endpoint response
 * @param {object} response - HTTP response
 * @returns {boolean} - All checks passed
 */
export function checkHealthResponse(response) {
  const checks = {
    'health status is 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
    'health has status': (r) => {
      try {
        const body = r.json();
        return body.status === 'healthy';
      } catch {
        return false;
      }
    },
  };

  return check(response, checks);
}

/**
 * Check authentication response
 * @param {object} response - HTTP response
 * @returns {boolean} - All checks passed
 */
export function checkAuthResponse(response) {
  authLatency.add(response.timings.duration);

  const checks = {
    'auth status is 200': (r) => r.status === 200,
    'auth has token': (r) => {
      try {
        const body = r.json();
        return body.success && body.data && body.data.token;
      } catch {
        return false;
      }
    },
    'auth response time < 800ms': (r) => r.timings.duration < 800,
  };

  return check(response, checks);
}

/**
 * Check trading response
 * @param {object} response - HTTP response
 * @param {string} operation - Trading operation name
 * @returns {boolean} - All checks passed
 */
export function checkTradingResponse(response, operation = 'trading') {
  tradingLatency.add(response.timings.duration);

  const checks = {
    [`${operation} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${operation} is valid JSON`]: (r) => {
      try {
        r.json();
        return true;
      } catch {
        return false;
      }
    },
    [`${operation} response time < 600ms`]: (r) => r.timings.duration < 600,
  };

  return check(response, checks);
}

/**
 * Check market data response
 * @param {object} response - HTTP response
 * @returns {boolean} - All checks passed
 */
export function checkMarketsResponse(response) {
  marketsLatency.add(response.timings.duration);

  const checks = {
    'markets status is 200': (r) => r.status === 200,
    'markets has data': (r) => {
      try {
        const body = r.json();
        return body.success && body.data !== undefined;
      } catch {
        return false;
      }
    },
    'markets response time < 400ms': (r) => r.timings.duration < 400,
  };

  return check(response, checks);
}

/**
 * Check payment response
 * @param {object} response - HTTP response
 * @param {string} operation - Payment operation name
 * @returns {boolean} - All checks passed
 */
export function checkPaymentResponse(response, operation = 'payment') {
  paymentsLatency.add(response.timings.duration);

  const checks = {
    [`${operation} status is 2xx`]: (r) => r.status >= 200 && r.status < 300 || r.status === 400,
    [`${operation} is valid JSON`]: (r) => {
      try {
        r.json();
        return true;
      } catch {
        return false;
      }
    },
    [`${operation} response time < 1000ms`]: (r) => r.timings.duration < 1000,
  };

  return check(response, checks);
}

/**
 * Check for rate limiting response
 * @param {object} response - HTTP response
 * @returns {boolean} - True if rate limited
 */
export function isRateLimited(response) {
  return response.status === 429;
}

/**
 * Check error response format
 * @param {object} response - HTTP response
 * @param {number} expectedStatus - Expected HTTP status
 * @returns {boolean} - All checks passed
 */
export function checkErrorResponse(response, expectedStatus) {
  const checks = {
    [`error status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'error has error object': (r) => {
      try {
        const body = r.json();
        return body.success === false && body.error && body.error.code;
      } catch {
        return false;
      }
    },
  };

  return check(response, checks);
}

/**
 * Log response details for debugging
 * @param {object} response - HTTP response
 * @param {string} context - Context description
 */
export function logResponse(response, context = '') {
  console.log(`[${context}] Status: ${response.status}, Duration: ${response.timings.duration}ms`);
  if (response.status >= 400) {
    console.log(`[${context}] Error Body: ${response.body}`);
  }
}
