/**
 * User behavior scenarios for K6 load tests
 * Simulates realistic user journeys through the application
 */

import http from 'k6/http';
import { sleep, group } from 'k6';
import { ENV, ENDPOINTS, THINK_TIMES } from './config.js';
import { getAuthHeaders, login, logout } from './auth.js';
import {
  checkHealthResponse,
  checkApiResponse,
  checkMarketsResponse,
  checkTradingResponse,
  checkPaymentResponse,
  checkPaginatedResponse,
  isRateLimited,
} from './checks.js';

/**
 * Random sleep within a range (think time)
 * @param {object} range - { min, max } in seconds
 */
export function thinkTime(range) {
  const duration = range.min + Math.random() * (range.max - range.min);
  sleep(duration);
}

/**
 * Random item from array
 * @param {array} arr - Array to pick from
 */
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Scenario: Anonymous User Browsing
 * User browses markets without logging in
 */
export function anonymousBrowsing() {
  group('Anonymous Browsing', () => {
    // Check health
    const healthRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.health}`, {
      tags: { endpoint: 'health', type: 'public' },
    });
    checkHealthResponse(healthRes);

    thinkTime(THINK_TIMES.navigation);

    // Browse prediction events
    const eventsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionEvents}`, {
      tags: { endpoint: 'events', type: 'public' },
    });
    checkPaginatedResponse(eventsRes, 'events');

    thinkTime(THINK_TIMES.readMarket);

    // Get categories
    const categoriesRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionCategories}`, {
      tags: { endpoint: 'categories', type: 'public' },
    });
    checkApiResponse(categoriesRes, 'categories');

    thinkTime(THINK_TIMES.navigation);

    // Search events
    const searchTerms = ['election', 'sports', 'crypto', 'weather'];
    const searchRes = http.get(
      `${ENV.BASE_URL}${ENDPOINTS.predictionSearch}?q=${randomItem(searchTerms)}`,
      { tags: { endpoint: 'search', type: 'public' } }
    );
    checkApiResponse(searchRes, 'search');

    thinkTime(THINK_TIMES.readMarket);

    // Get rewards catalog (public)
    const catalogRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.rewardsCatalog}`, {
      tags: { endpoint: 'catalog', type: 'public' },
    });
    checkApiResponse(catalogRes, 'catalog');
  });
}

/**
 * Scenario: User Authentication Flow
 * Full authentication cycle
 */
export function authenticationFlow() {
  group('Authentication Flow', () => {
    // Login
    const auth = login();
    if (!auth) {
      console.error('Login failed in auth flow');
      return;
    }

    thinkTime(THINK_TIMES.navigation);

    // Access protected resource
    const headers = getAuthHeaders(auth.token);
    const portfolioRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.portfolio}`, {
      headers,
      tags: { endpoint: 'portfolio', type: 'protected' },
    });
    checkApiResponse(portfolioRes, 'portfolio');

    thinkTime(THINK_TIMES.quickAction);

    // Logout
    logout(auth.token);
  });
}

/**
 * Scenario: Active Trader
 * User actively trading and managing orders
 */
export function activeTrader(token) {
  const headers = getAuthHeaders(token);

  group('Active Trader', () => {
    // Check buying power
    const buyingPowerRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.buyingPower}`, {
      headers,
      tags: { endpoint: 'buying-power', type: 'trading' },
    });
    checkTradingResponse(buyingPowerRes, 'buying-power');

    thinkTime(THINK_TIMES.navigation);

    // View portfolio
    const portfolioRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.portfolio}`, {
      headers,
      tags: { endpoint: 'portfolio', type: 'trading' },
    });
    checkTradingResponse(portfolioRes, 'portfolio');

    thinkTime(THINK_TIMES.readMarket);

    // Get current orders
    const ordersRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.orders}`, {
      headers,
      tags: { endpoint: 'orders', type: 'trading' },
    });
    checkPaginatedResponse(ordersRes, 'orders');

    thinkTime(THINK_TIMES.decideBet);

    // Place a market order
    const orderPayload = JSON.stringify({
      symbol: 'TEST-MKT',
      side: 'buy',
      type: 'market',
      quantity: Math.floor(Math.random() * 10) + 1,
      timeInForce: 'gtc',
    });

    const createOrderRes = http.post(`${ENV.BASE_URL}${ENDPOINTS.orders}`, orderPayload, {
      headers,
      tags: { endpoint: 'create-order', type: 'trading' },
    });

    if (!isRateLimited(createOrderRes)) {
      checkTradingResponse(createOrderRes, 'create-order');
    }

    thinkTime(THINK_TIMES.quickAction);

    // View updated portfolio
    http.get(`${ENV.BASE_URL}${ENDPOINTS.portfolio}`, {
      headers,
      tags: { endpoint: 'portfolio', type: 'trading' },
    });
  });
}

/**
 * Scenario: Fantasy Bettor
 * User placing bets on fantasy markets
 */
export function fantasyBettor(token) {
  const headers = getAuthHeaders(token);

  group('Fantasy Bettor', () => {
    // Check wallet balance
    const walletRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyWallet}`, {
      headers,
      tags: { endpoint: 'wallet', type: 'fantasy' },
    });
    checkApiResponse(walletRes, 'wallet');

    thinkTime(THINK_TIMES.navigation);

    // Browse fantasy markets
    const marketsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyMarkets}`, {
      headers,
      tags: { endpoint: 'markets', type: 'fantasy' },
    });
    checkMarketsResponse(marketsRes);

    thinkTime(THINK_TIMES.readMarket);

    // Get specific market details
    const marketDetailRes = http.get(
      `${ENV.BASE_URL}${ENDPOINTS.fantasyMarkets}/${ENV.TEST_MARKET_ID}`,
      {
        headers,
        tags: { endpoint: 'market-detail', type: 'fantasy' },
      }
    );
    checkMarketsResponse(marketDetailRes);

    thinkTime(THINK_TIMES.decideBet);

    // Place a bet
    const betPayload = JSON.stringify({
      outcomeId: 'team-a',
      amount: Math.floor(Math.random() * 50) + 5,
      maxSlippage: 0.05,
    });

    const betRes = http.post(
      `${ENV.BASE_URL}${ENDPOINTS.fantasyMarkets}/${ENV.TEST_MARKET_ID}/bet`,
      betPayload,
      {
        headers,
        tags: { endpoint: 'place-bet', type: 'fantasy' },
      }
    );

    if (!isRateLimited(betRes)) {
      checkTradingResponse(betRes, 'place-bet');
    }

    thinkTime(THINK_TIMES.quickAction);

    // View my bets
    const myBetsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyBets}`, {
      headers,
      tags: { endpoint: 'my-bets', type: 'fantasy' },
    });
    checkPaginatedResponse(myBetsRes, 'my-bets');
  });
}

/**
 * Scenario: Payment Operations
 * User managing deposits and withdrawals
 */
export function paymentOperations(token) {
  const headers = getAuthHeaders(token);

  group('Payment Operations', () => {
    // View wallet
    const walletRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyWallet}`, {
      headers,
      tags: { endpoint: 'wallet', type: 'payments' },
    });
    checkPaymentResponse(walletRes, 'wallet');

    thinkTime(THINK_TIMES.navigation);

    // View transaction history
    const txHistoryRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyTransactions}`, {
      headers,
      tags: { endpoint: 'transactions', type: 'payments' },
    });
    checkPaginatedResponse(txHistoryRes, 'transactions');

    thinkTime(THINK_TIMES.fillForm);

    // Initiate deposit (small amount for testing)
    const depositPayload = JSON.stringify({
      amount: 50,
      method: 'card',
      paymentMethodId: 'pm_test',
    });

    const depositRes = http.post(`${ENV.BASE_URL}${ENDPOINTS.fantasyDeposit}`, depositPayload, {
      headers,
      tags: { endpoint: 'deposit', type: 'payments' },
    });

    if (!isRateLimited(depositRes)) {
      checkPaymentResponse(depositRes, 'deposit');
    }

    thinkTime(THINK_TIMES.navigation);

    // View updated wallet
    http.get(`${ENV.BASE_URL}${ENDPOINTS.fantasyWallet}`, {
      headers,
      tags: { endpoint: 'wallet', type: 'payments' },
    });
  });
}

/**
 * Scenario: Market Data Consumer
 * User heavily consuming market data
 */
export function marketDataConsumer(token) {
  const headers = getAuthHeaders(token);

  group('Market Data Consumer', () => {
    // Get all categories
    const categoriesRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionCategories}`, {
      headers,
      tags: { endpoint: 'categories', type: 'markets' },
    });
    checkApiResponse(categoriesRes, 'categories');

    thinkTime(THINK_TIMES.quickAction);

    // Get events for each category
    const categories = ['politics', 'sports', 'crypto', 'finance'];
    for (const category of categories) {
      const eventsRes = http.get(
        `${ENV.BASE_URL}${ENDPOINTS.predictionEvents}?category=${category}&limit=20`,
        {
          headers,
          tags: { endpoint: 'events', type: 'markets' },
        }
      );
      checkPaginatedResponse(eventsRes, `events-${category}`);

      thinkTime(THINK_TIMES.quickAction);
    }

    // Search for specific markets
    const searchTerms = ['election', 'bitcoin', 'superbowl', 'oscars'];
    for (const term of searchTerms) {
      const searchRes = http.get(
        `${ENV.BASE_URL}${ENDPOINTS.predictionSearch}?q=${term}`,
        {
          headers,
          tags: { endpoint: 'search', type: 'markets' },
        }
      );
      checkApiResponse(searchRes, `search-${term}`);

      thinkTime(THINK_TIMES.quickAction);
    }

    // Get user positions
    const positionsRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.predictionPositions}`, {
      headers,
      tags: { endpoint: 'positions', type: 'markets' },
    });
    checkApiResponse(positionsRes, 'positions');
  });
}

/**
 * Scenario: Rewards Engagement
 * User interacting with rewards system
 */
export function rewardsEngagement(token) {
  const headers = getAuthHeaders(token);

  group('Rewards Engagement', () => {
    // Check points balance
    const balanceRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.rewardsBalance}`, {
      headers,
      tags: { endpoint: 'balance', type: 'rewards' },
    });
    checkApiResponse(balanceRes, 'balance');

    thinkTime(THINK_TIMES.navigation);

    // View points history
    const historyRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.rewardsHistory}`, {
      headers,
      tags: { endpoint: 'history', type: 'rewards' },
    });
    checkPaginatedResponse(historyRes, 'history');

    thinkTime(THINK_TIMES.readMarket);

    // Browse rewards catalog
    const catalogRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.rewardsCatalog}`, {
      headers,
      tags: { endpoint: 'catalog', type: 'rewards' },
    });
    checkApiResponse(catalogRes, 'catalog');

    thinkTime(THINK_TIMES.navigation);

    // View leaderboard
    const leaderboardRes = http.get(`${ENV.BASE_URL}${ENDPOINTS.rewardsLeaderboard}`, {
      headers,
      tags: { endpoint: 'leaderboard', type: 'rewards' },
    });
    checkApiResponse(leaderboardRes, 'leaderboard');
  });
}

/**
 * Combined realistic user journey
 * Simulates a typical user session with multiple activities
 */
export function realisticUserJourney() {
  // Start with anonymous browsing
  anonymousBrowsing();

  thinkTime(THINK_TIMES.fillForm);

  // Login
  const auth = login();
  if (!auth) {
    console.error('Login failed in user journey');
    return;
  }

  thinkTime(THINK_TIMES.navigation);

  // Randomly choose user activities
  const activities = [
    () => activeTrader(auth.token),
    () => fantasyBettor(auth.token),
    () => marketDataConsumer(auth.token),
    () => rewardsEngagement(auth.token),
  ];

  // Perform 2-3 random activities
  const numActivities = Math.floor(Math.random() * 2) + 2;
  for (let i = 0; i < numActivities; i++) {
    const activity = randomItem(activities);
    activity();
    thinkTime(THINK_TIMES.navigation);
  }

  // Logout
  logout(auth.token);
}

/**
 * High-frequency trading simulation
 * For stress testing order creation
 */
export function highFrequencyTrading(token) {
  const headers = getAuthHeaders(token);

  group('High Frequency Trading', () => {
    for (let i = 0; i < 5; i++) {
      const orderPayload = JSON.stringify({
        symbol: `TEST-${i}`,
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        type: 'limit',
        quantity: Math.floor(Math.random() * 100) + 1,
        price: Math.random() * 100 + 50,
        timeInForce: 'gtc',
      });

      const res = http.post(`${ENV.BASE_URL}${ENDPOINTS.orders}`, orderPayload, {
        headers,
        tags: { endpoint: 'create-order', type: 'hft' },
      });

      if (isRateLimited(res)) {
        console.log('Rate limited during HFT');
        sleep(1);
      }

      sleep(0.1); // 100ms between orders
    }
  });
}
