/**
 * Authentication helpers for K6 load tests
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import { ENV, ENDPOINTS, HTTP_DEFAULTS } from './config.js';

// Cache for auth tokens per VU
const tokenCache = {};

/**
 * Login and get auth token
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {object} - Auth response with token
 */
export function login(email = ENV.TEST_USER_EMAIL, password = ENV.TEST_USER_PASSWORD) {
  const url = `${ENV.BASE_URL}${ENDPOINTS.login}`;

  const payload = JSON.stringify({
    email,
    password,
  });

  const params = {
    headers: HTTP_DEFAULTS.headers,
    tags: { endpoint: 'login', type: 'auth' },
  };

  const response = http.post(url, payload, params);

  const success = check(response, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => {
      const body = r.json();
      return body && body.success && body.data && body.data.token;
    },
  });

  if (!success) {
    console.error(`Login failed: ${response.status} - ${response.body}`);
    return null;
  }

  const data = response.json();
  return {
    token: data.data.token,
    refreshToken: data.data.refreshToken,
    user: data.data.user,
  };
}

/**
 * Register a new test user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {object} - Registration response
 */
export function register(email, password, displayName = 'Load Test User') {
  const url = `${ENV.BASE_URL}${ENDPOINTS.register}`;

  const payload = JSON.stringify({
    email,
    password,
    displayName,
  });

  const params = {
    headers: HTTP_DEFAULTS.headers,
    tags: { endpoint: 'register', type: 'auth' },
  };

  const response = http.post(url, payload, params);

  check(response, {
    'register status is 200': (r) => r.status === 200,
    'register has token': (r) => {
      const body = r.json();
      return body && body.success && body.data && body.data.token;
    },
  });

  if (response.status !== 200) {
    return null;
  }

  const data = response.json();
  return {
    token: data.data.token,
    refreshToken: data.data.refreshToken,
    user: data.data.user,
  };
}

/**
 * Refresh auth token
 * @param {string} refreshToken - Current refresh token
 * @returns {object} - New token pair
 */
export function refreshToken(refreshToken) {
  const url = `${ENV.BASE_URL}${ENDPOINTS.refresh}`;

  const params = {
    headers: {
      ...HTTP_DEFAULTS.headers,
      'Authorization': `Bearer ${refreshToken}`,
    },
    tags: { endpoint: 'refresh', type: 'auth' },
  };

  const response = http.post(url, null, params);

  if (response.status !== 200) {
    return null;
  }

  const data = response.json();
  return {
    token: data.data.token,
    refreshToken: data.data.refreshToken,
  };
}

/**
 * Logout
 * @param {string} token - Auth token
 */
export function logout(token) {
  const url = `${ENV.BASE_URL}${ENDPOINTS.logout}`;

  const params = {
    headers: {
      ...HTTP_DEFAULTS.headers,
      'Authorization': `Bearer ${token}`,
    },
    tags: { endpoint: 'logout', type: 'auth' },
  };

  const response = http.post(url, null, params);

  check(response, {
    'logout status is 200': (r) => r.status === 200,
  });
}

/**
 * Get authenticated headers
 * @param {string} token - Auth token
 * @returns {object} - Headers with auth token
 */
export function getAuthHeaders(token) {
  return {
    ...HTTP_DEFAULTS.headers,
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Get or create auth token for current VU
 * Caches token per VU to avoid repeated logins
 * @param {number} vuId - Virtual user ID
 * @returns {string} - Auth token
 */
export function getOrCreateToken(vuId) {
  // Check if we have a pre-configured token
  if (ENV.AUTH_TOKEN) {
    return ENV.AUTH_TOKEN;
  }

  // Check cache
  if (tokenCache[vuId]) {
    return tokenCache[vuId];
  }

  // Login and cache
  const auth = login();
  if (auth && auth.token) {
    tokenCache[vuId] = auth.token;
    return auth.token;
  }

  fail('Failed to authenticate');
  return null;
}

/**
 * Generate unique email for registration tests
 * @param {number} vuId - Virtual user ID
 * @param {number} iteration - Current iteration
 * @returns {string} - Unique email
 */
export function generateUniqueEmail(vuId, iteration) {
  const timestamp = Date.now();
  return `loadtest_${vuId}_${iteration}_${timestamp}@test.pull.app`;
}

/**
 * Perform full auth flow (register -> login -> use -> logout)
 * @returns {object} - Auth context
 */
export function fullAuthFlow() {
  const email = generateUniqueEmail(__VU, __ITER);
  const password = 'LoadTest123!';

  // Register
  const regResult = register(email, password);
  if (!regResult) {
    return { success: false, error: 'Registration failed' };
  }

  // Login
  const loginResult = login(email, password);
  if (!loginResult) {
    return { success: false, error: 'Login failed' };
  }

  return {
    success: true,
    token: loginResult.token,
    refreshToken: loginResult.refreshToken,
    user: loginResult.user,
    email,
    logout: () => logout(loginResult.token),
  };
}
