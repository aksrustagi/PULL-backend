/**
 * E2E Test Data Fixtures
 * Centralized test data for consistent testing across all E2E tests
 */

// =============================================================================
// User Fixtures
// =============================================================================

export interface TestUser {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Generate a unique test user for each test run
 */
export const generateTestUser = (prefix = "test"): TestUser => ({
  email: `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@test.example.com`,
  password: "SecureTestPass123!",
  displayName: `${prefix} User`,
  firstName: prefix.charAt(0).toUpperCase() + prefix.slice(1),
  lastName: "Tester",
});

/**
 * Pre-defined test users for specific scenarios
 */
export const TEST_USERS = {
  // User with completed KYC
  kycCompleted: {
    email: "kyc-completed@example.com",
    password: "KycCompleted123!",
    displayName: "KYC Complete User",
    firstName: "Kyc",
    lastName: "Complete",
  },

  // User with pending KYC
  kycPending: {
    email: "kyc-pending@example.com",
    password: "KycPending123!",
    displayName: "KYC Pending User",
    firstName: "Kyc",
    lastName: "Pending",
  },

  // User with rejected KYC
  kycRejected: {
    email: "kyc-rejected@example.com",
    password: "KycRejected123!",
    displayName: "KYC Rejected User",
    firstName: "Kyc",
    lastName: "Rejected",
  },

  // User with funded account for trading
  trader: {
    email: "trading-test@example.com",
    password: "TradingTest123!",
    displayName: "Trading User",
    firstName: "Trading",
    lastName: "User",
  },

  // User with social profile
  socialUser: {
    email: "social-test@example.com",
    password: "SocialTest123!",
    displayName: "Social User",
    firstName: "Social",
    lastName: "User",
  },

  // User to follow (has public profile)
  followableUser: {
    email: "followable-test@example.com",
    password: "FollowableTest123!",
    displayName: "Top Trader",
    firstName: "Top",
    lastName: "Trader",
  },

  // User for payment tests
  paymentUser: {
    email: "payment-test@example.com",
    password: "PaymentTest123!",
    displayName: "Payment User",
    firstName: "Payment",
    lastName: "User",
  },

  // User for predictions
  predictionUser: {
    email: "prediction-test@example.com",
    password: "PredictionTest123!",
    displayName: "Prediction User",
    firstName: "Prediction",
    lastName: "User",
  },
} as const;

// =============================================================================
// KYC Fixtures
// =============================================================================

export interface KYCPersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssn?: string;
  phone?: string;
}

export interface KYCAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export const KYC_TEST_DATA = {
  validPersonalInfo: {
    firstName: "Test",
    lastName: "User",
    dateOfBirth: "1990-01-15",
    ssn: "123-45-6789",
    phone: "+1234567890",
  } as KYCPersonalInfo,

  validAddress: {
    street: "123 Test Street",
    city: "Test City",
    state: "CA",
    zipCode: "12345",
    country: "United States",
  } as KYCAddress,

  invalidAddress: {
    street: "",
    city: "",
    state: "",
    zipCode: "invalid",
    country: "",
  } as KYCAddress,

  // Underage user for rejection testing
  underagePersonalInfo: {
    firstName: "Young",
    lastName: "User",
    dateOfBirth: new Date().toISOString().split("T")[0], // Today's date
    phone: "+1234567890",
  } as KYCPersonalInfo,

  // International address
  internationalAddress: {
    street: "10 Downing Street",
    city: "London",
    state: "Greater London",
    zipCode: "SW1A 2AA",
    country: "United Kingdom",
  } as KYCAddress,
};

// =============================================================================
// Payment Fixtures
// =============================================================================

export const PAYMENT_TEST_DATA = {
  validDeposit: {
    amount: "500",
    method: "bank",
  },

  minDeposit: {
    amount: "10",
    method: "bank",
  },

  maxDeposit: {
    amount: "50000",
    method: "bank",
  },

  invalidDeposit: {
    amount: "0",
    method: "bank",
  },

  validWithdrawal: {
    amount: "100",
    method: "bank",
  },

  largeWithdrawal: {
    amount: "10000",
    method: "bank",
  },

  // Test bank account
  testBankAccount: {
    routingNumber: "110000000",
    accountNumber: "000123456789",
    accountType: "checking",
    bankName: "Test Bank",
  },

  // Test card
  testCard: {
    number: "4242424242424242",
    expiry: "12/30",
    cvv: "123",
    name: "Test User",
    zipCode: "12345",
  },
};

// =============================================================================
// Trading Fixtures
// =============================================================================

export const TRADING_TEST_DATA = {
  markets: {
    btc100k: {
      id: "BTC-100K-YES",
      name: "Bitcoin to $100K",
      type: "crypto",
    },
    election: {
      id: "ELECTION-2024-DEM",
      name: "2024 Election Democrat Win",
      type: "politics",
    },
    sports: {
      id: "NFL-SUPERBOWL-CHIEFS",
      name: "Chiefs Win Super Bowl",
      type: "sports",
    },
  },

  orders: {
    smallMarketOrder: {
      side: "buy",
      type: "market",
      quantity: "1",
    },
    largeLimitOrder: {
      side: "buy",
      type: "limit",
      quantity: "100",
      price: "0.50",
    },
    sellOrder: {
      side: "sell",
      type: "market",
      quantity: "5",
    },
  },
};

// =============================================================================
// Social Features Fixtures
// =============================================================================

export const SOCIAL_TEST_DATA = {
  // Popular traders to follow
  topTraders: [
    {
      username: "TopTrader1",
      displayName: "Top Trader 1",
      winRate: "75%",
      followers: "10K",
    },
    {
      username: "CryptoKing",
      displayName: "Crypto King",
      winRate: "68%",
      followers: "5K",
    },
    {
      username: "PredictionPro",
      displayName: "Prediction Pro",
      winRate: "72%",
      followers: "8K",
    },
  ],

  copyTradeSettings: {
    percentage: "10",
    maxAmount: "100",
    copyAll: true,
  },

  post: {
    content: "Testing social post functionality",
    market: "BTC-100K-YES",
  },
};

// =============================================================================
// Prediction Market Fixtures
// =============================================================================

export const PREDICTION_TEST_DATA = {
  categories: ["crypto", "politics", "sports", "entertainment", "science"],

  markets: [
    {
      id: "BTC-100K-2024",
      title: "Will Bitcoin reach $100K by end of 2024?",
      category: "crypto",
      yesPrice: 0.45,
      noPrice: 0.55,
      volume: "1.2M",
      endDate: "2024-12-31",
    },
    {
      id: "ELECTION-2024",
      title: "Will Democrats win 2024 Presidential Election?",
      category: "politics",
      yesPrice: 0.52,
      noPrice: 0.48,
      volume: "5.5M",
      endDate: "2024-11-05",
    },
    {
      id: "FIFA-WC-2026",
      title: "Will USA win FIFA World Cup 2026?",
      category: "sports",
      yesPrice: 0.15,
      noPrice: 0.85,
      volume: "800K",
      endDate: "2026-07-19",
    },
  ],

  predictionAmounts: {
    small: "10",
    medium: "100",
    large: "1000",
  },

  resolutionReasons: [
    "Event occurred as predicted",
    "Event did not occur",
    "Market voided due to rule violation",
    "Market resolved early",
  ],
};

// =============================================================================
// Error Scenarios
// =============================================================================

export const ERROR_SCENARIOS = {
  networkError: "Network request failed",
  insufficientFunds: "Insufficient funds",
  invalidCredentials: "Invalid email or password",
  sessionExpired: "Session expired",
  marketClosed: "Market is closed",
  orderRejected: "Order rejected",
  kycRequired: "KYC verification required",
  limitExceeded: "Limit exceeded",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random amount within a range
 */
export const randomAmount = (min: number, max: number): string => {
  return (Math.random() * (max - min) + min).toFixed(2);
};

/**
 * Generate a future date string
 */
export const futureDate = (daysFromNow: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
};

/**
 * Generate a past date string
 */
export const pastDate = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
};

/**
 * Format currency
 */
export const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
};
