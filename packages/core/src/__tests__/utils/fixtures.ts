/**
 * Test Data Fixtures
 * Provides consistent test data across all tests
 */

// ===========================================================================
// User Fixtures
// ===========================================================================

export const mockUsers = {
  basic: {
    _id: 'user_basic123',
    email: 'basic@example.com',
    displayName: 'Basic User',
    status: 'active',
    kycStatus: 'pending',
    kycTier: 'none',
    authProvider: 'email',
    emailVerified: true,
    phoneVerified: false,
    referralCode: 'BASIC123',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  verified: {
    _id: 'user_verified456',
    email: 'verified@example.com',
    displayName: 'Verified User',
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    kycStatus: 'approved',
    kycTier: 'verified',
    authProvider: 'email',
    emailVerified: true,
    phoneVerified: true,
    phone: '+15551234567',
    referralCode: 'VERIFY456',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  premium: {
    _id: 'user_premium789',
    email: 'premium@example.com',
    displayName: 'Premium Trader',
    firstName: 'Jane',
    lastName: 'Smith',
    status: 'active',
    kycStatus: 'approved',
    kycTier: 'premium',
    authProvider: 'google',
    emailVerified: true,
    phoneVerified: true,
    phone: '+15559876543',
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    referralCode: 'PREMIUM789',
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  suspended: {
    _id: 'user_suspended000',
    email: 'suspended@example.com',
    displayName: 'Suspended User',
    status: 'suspended',
    kycStatus: 'suspended',
    kycTier: 'none',
    authProvider: 'email',
    emailVerified: true,
    phoneVerified: false,
    referralCode: 'SUSP000',
    createdAt: Date.now() - 120 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
};

// ===========================================================================
// Balance Fixtures
// ===========================================================================

export const mockBalances = {
  usdRich: {
    _id: 'balance_usd001',
    userId: 'user_verified456',
    assetType: 'usd',
    assetId: 'USD',
    symbol: 'USD',
    available: 100000,
    held: 5000,
    pending: 0,
    updatedAt: Date.now(),
  },
  usdPoor: {
    _id: 'balance_usd002',
    userId: 'user_basic123',
    assetType: 'usd',
    assetId: 'USD',
    symbol: 'USD',
    available: 50,
    held: 0,
    pending: 0,
    updatedAt: Date.now(),
  },
  points: {
    _id: 'balance_points001',
    userId: 'user_verified456',
    assetType: 'points',
    assetId: 'PULL_POINTS',
    symbol: 'PTS',
    available: 5000,
    held: 0,
    pending: 0,
    updatedAt: Date.now(),
  },
  crypto: {
    _id: 'balance_btc001',
    userId: 'user_premium789',
    assetType: 'crypto',
    assetId: 'BTC',
    symbol: 'BTC',
    available: 1.5,
    held: 0.5,
    pending: 0,
    updatedAt: Date.now(),
  },
};

// ===========================================================================
// Order Fixtures
// ===========================================================================

export const mockOrders = {
  pendingBuy: {
    _id: 'order_pending001',
    userId: 'user_verified456',
    clientOrderId: 'client_order_001',
    assetClass: 'prediction',
    symbol: 'PRESYES-24-001',
    side: 'buy',
    type: 'limit',
    status: 'pending',
    quantity: 100,
    filledQuantity: 0,
    remainingQuantity: 100,
    price: 55,
    timeInForce: 'gtc',
    fees: 0,
    feeCurrency: 'USD',
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
  },
  partialFill: {
    _id: 'order_partial002',
    userId: 'user_verified456',
    clientOrderId: 'client_order_002',
    assetClass: 'prediction',
    symbol: 'PRESYES-24-001',
    side: 'buy',
    type: 'limit',
    status: 'partial_fill',
    quantity: 100,
    filledQuantity: 50,
    remainingQuantity: 50,
    price: 55,
    averageFilledPrice: 54.5,
    timeInForce: 'gtc',
    fees: 2.72,
    feeCurrency: 'USD',
    createdAt: Date.now() - 120000,
    updatedAt: Date.now(),
  },
  filled: {
    _id: 'order_filled003',
    userId: 'user_verified456',
    clientOrderId: 'client_order_003',
    assetClass: 'prediction',
    symbol: 'PRESYES-24-001',
    side: 'buy',
    type: 'market',
    status: 'filled',
    quantity: 50,
    filledQuantity: 50,
    remainingQuantity: 0,
    price: 56,
    averageFilledPrice: 55.8,
    timeInForce: 'ioc',
    fees: 2.79,
    feeCurrency: 'USD',
    createdAt: Date.now() - 180000,
    updatedAt: Date.now() - 179000,
    filledAt: Date.now() - 179000,
  },
  cancelled: {
    _id: 'order_cancelled004',
    userId: 'user_verified456',
    clientOrderId: 'client_order_004',
    assetClass: 'crypto',
    symbol: 'BTC-USD',
    side: 'sell',
    type: 'limit',
    status: 'cancelled',
    quantity: 0.5,
    filledQuantity: 0,
    remainingQuantity: 0.5,
    price: 50000,
    timeInForce: 'gtc',
    fees: 0,
    feeCurrency: 'USD',
    createdAt: Date.now() - 240000,
    updatedAt: Date.now() - 120000,
    cancelledAt: Date.now() - 120000,
    metadata: { cancellationReason: 'User requested' },
  },
  stopOrder: {
    _id: 'order_stop005',
    userId: 'user_premium789',
    clientOrderId: 'client_order_005',
    assetClass: 'crypto',
    symbol: 'BTC-USD',
    side: 'sell',
    type: 'stop_limit',
    status: 'pending',
    quantity: 1,
    filledQuantity: 0,
    remainingQuantity: 1,
    price: 48000,
    stopPrice: 49000,
    timeInForce: 'gtc',
    fees: 0,
    feeCurrency: 'USD',
    createdAt: Date.now() - 300000,
    updatedAt: Date.now(),
  },
};

// ===========================================================================
// Position Fixtures
// ===========================================================================

export const mockPositions = {
  predictionLong: {
    _id: 'position_pred001',
    userId: 'user_verified456',
    assetClass: 'prediction',
    symbol: 'PRESYES-24-001',
    side: 'long',
    quantity: 200,
    averageEntryPrice: 52,
    currentPrice: 57,
    costBasis: 10400,
    unrealizedPnL: 1000,
    realizedPnL: 500,
    openedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  cryptoLong: {
    _id: 'position_btc001',
    userId: 'user_premium789',
    assetClass: 'crypto',
    symbol: 'BTC-USD',
    side: 'long',
    quantity: 2,
    averageEntryPrice: 45000,
    currentPrice: 52000,
    costBasis: 90000,
    unrealizedPnL: 14000,
    realizedPnL: 5000,
    openedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  rwaPosition: {
    _id: 'position_rwa001',
    userId: 'user_premium789',
    assetClass: 'rwa',
    symbol: 'RE-NYC-001',
    side: 'long',
    quantity: 100,
    averageEntryPrice: 100,
    currentPrice: 105,
    costBasis: 10000,
    unrealizedPnL: 500,
    realizedPnL: 0,
    openedAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
};

// ===========================================================================
// Trade Fixtures
// ===========================================================================

export const mockTrades = {
  recentBuy: {
    _id: 'trade_001',
    orderId: 'order_filled003',
    userId: 'user_verified456',
    symbol: 'PRESYES-24-001',
    side: 'buy',
    quantity: 50,
    price: 55.8,
    notionalValue: 2790,
    fee: 2.79,
    feeCurrency: 'USD',
    liquidity: 'taker',
    executedAt: Date.now() - 179000,
    settlementStatus: 'settled',
  },
  partialFill: {
    _id: 'trade_002',
    orderId: 'order_partial002',
    userId: 'user_verified456',
    symbol: 'PRESYES-24-001',
    side: 'buy',
    quantity: 50,
    price: 54.5,
    notionalValue: 2725,
    fee: 2.72,
    feeCurrency: 'USD',
    liquidity: 'maker',
    executedAt: Date.now() - 60000,
    settlementStatus: 'pending',
  },
};

// ===========================================================================
// Prediction Event Fixtures
// ===========================================================================

export const mockPredictionEvents = {
  presidential: {
    _id: 'event_pres001',
    ticker: 'PRES-24',
    title: '2024 Presidential Election',
    description: 'Markets for the 2024 US Presidential Election',
    category: 'politics',
    status: 'open',
    startDate: Date.now() - 180 * 24 * 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  superBowl: {
    _id: 'event_sports001',
    ticker: 'NFL-SB-24',
    title: 'Super Bowl 2024',
    description: 'Markets for Super Bowl 2024',
    category: 'sports',
    status: 'open',
    startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
    endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
};

export const mockPredictionMarkets = {
  presYes: {
    _id: 'market_presyes001',
    ticker: 'PRESYES-24-001',
    eventId: 'event_pres001',
    title: 'Will Candidate A win?',
    status: 'open',
    yesPrice: 57,
    noPrice: 43,
    volume24h: 150000,
    openInterest: 500000,
    createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
};

// ===========================================================================
// Deposit/Withdrawal Fixtures
// ===========================================================================

export const mockDeposits = {
  pending: {
    _id: 'deposit_001',
    userId: 'user_verified456',
    method: 'bank_transfer',
    status: 'pending',
    amount: 5000,
    currency: 'USD',
    fee: 0,
    netAmount: 5000,
    externalId: 'ext_dep_001',
    createdAt: Date.now() - 60000,
  },
  completed: {
    _id: 'deposit_002',
    userId: 'user_verified456',
    method: 'card',
    status: 'completed',
    amount: 1000,
    currency: 'USD',
    fee: 30,
    netAmount: 970,
    externalId: 'ext_dep_002',
    createdAt: Date.now() - 3600000,
    completedAt: Date.now() - 3500000,
  },
};

export const mockWithdrawals = {
  pending: {
    _id: 'withdrawal_001',
    userId: 'user_verified456',
    method: 'bank_transfer',
    status: 'pending',
    amount: 2000,
    currency: 'USD',
    fee: 25,
    netAmount: 1975,
    destination: 'bank_account_001',
    createdAt: Date.now() - 120000,
  },
  processing: {
    _id: 'withdrawal_002',
    userId: 'user_premium789',
    method: 'crypto',
    status: 'processing',
    amount: 0.5,
    currency: 'BTC',
    fee: 0.0001,
    netAmount: 0.4999,
    destination: '0xabc123...',
    createdAt: Date.now() - 3600000,
  },
};

// ===========================================================================
// Rewards Fixtures
// ===========================================================================

export const mockRewards = {
  merchandise: {
    _id: 'reward_001',
    name: 'PULL T-Shirt',
    description: 'Official PULL branded t-shirt',
    category: 'merchandise',
    pointsCost: 500,
    stock: 100,
    isActive: true,
    requiresShipping: true,
  },
  cashback: {
    _id: 'reward_002',
    name: '$10 Trading Credit',
    description: 'Get $10 added to your trading balance',
    category: 'credits',
    pointsCost: 1000,
    stock: null, // Unlimited
    isActive: true,
    requiresShipping: false,
  },
  vip: {
    _id: 'reward_003',
    name: 'VIP Access',
    description: 'One month of VIP trading features',
    category: 'premium',
    pointsCost: 5000,
    stock: null, // Unlimited
    isActive: true,
    requiresShipping: false,
  },
};

export const mockPointsTransactions = {
  earn: {
    _id: 'pts_tx_001',
    userId: 'user_verified456',
    type: 'earn',
    amount: 100,
    reason: 'Trade completion bonus',
    referenceType: 'trade',
    referenceId: 'trade_001',
    createdAt: Date.now() - 3600000,
  },
  redeem: {
    _id: 'pts_tx_002',
    userId: 'user_verified456',
    type: 'redeem',
    amount: -500,
    reason: 'Reward redemption',
    referenceType: 'reward',
    referenceId: 'reward_001',
    createdAt: Date.now() - 7200000,
  },
  referral: {
    _id: 'pts_tx_003',
    userId: 'user_verified456',
    type: 'earn',
    amount: 500,
    reason: 'Referral bonus',
    referenceType: 'referral',
    referenceId: 'user_basic123',
    createdAt: Date.now() - 86400000,
  },
};

// ===========================================================================
// KYC Fixtures
// ===========================================================================

export const mockKYCRecords = {
  pending: {
    _id: 'kyc_001',
    userId: 'user_basic123',
    targetTier: 'basic',
    status: 'in_progress',
    personaInquiryId: 'inq_mock123',
    personaAccountId: 'act_mock123',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  },
  approved: {
    _id: 'kyc_002',
    userId: 'user_verified456',
    targetTier: 'verified',
    status: 'approved',
    personaInquiryId: 'inq_mock456',
    personaAccountId: 'act_mock456',
    approvedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  rejected: {
    _id: 'kyc_003',
    userId: 'user_suspended000',
    targetTier: 'basic',
    status: 'rejected',
    personaInquiryId: 'inq_mock789',
    personaAccountId: 'act_mock789',
    rejectionReason: 'Document verification failed',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 28 * 24 * 60 * 60 * 1000,
  },
};

// ===========================================================================
// Leaderboard Fixtures
// ===========================================================================

export const mockLeaderboardEntries = [
  {
    rank: 1,
    userId: 'user_premium789',
    displayName: 'Premium Trader',
    avatarUrl: null,
    points: 15000,
    trades: 500,
    winRate: 0.65,
  },
  {
    rank: 2,
    userId: 'user_verified456',
    displayName: 'Verified User',
    avatarUrl: null,
    points: 12000,
    trades: 350,
    winRate: 0.58,
  },
  {
    rank: 3,
    userId: 'user_trader001',
    displayName: 'Active Trader',
    avatarUrl: null,
    points: 8500,
    trades: 250,
    winRate: 0.52,
  },
];

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a test user with custom overrides
 */
export function createTestUser(overrides: Partial<typeof mockUsers.basic> = {}) {
  return {
    ...mockUsers.basic,
    _id: generateTestId('user'),
    email: `test_${Date.now()}@example.com`,
    referralCode: generateTestId('REF').toUpperCase().slice(0, 8),
    ...overrides,
  };
}

/**
 * Create a test order with custom overrides
 */
export function createTestOrder(overrides: Partial<typeof mockOrders.pendingBuy> = {}) {
  return {
    ...mockOrders.pendingBuy,
    _id: generateTestId('order'),
    clientOrderId: generateTestId('client'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a test balance with custom overrides
 */
export function createTestBalance(overrides: Partial<typeof mockBalances.usdRich> = {}) {
  return {
    ...mockBalances.usdRich,
    _id: generateTestId('balance'),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a test position with custom overrides
 */
export function createTestPosition(overrides: Partial<typeof mockPositions.predictionLong> = {}) {
  return {
    ...mockPositions.predictionLong,
    _id: generateTestId('position'),
    updatedAt: Date.now(),
    ...overrides,
  };
}
