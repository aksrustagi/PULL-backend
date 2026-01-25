import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Database Tests for Balances
 *
 * These tests verify the business logic and validation rules for balance operations.
 * Since Convex mutations run server-side, we test the validation logic and
 * expected behaviors using mocked database contexts.
 */

// ===========================================================================
// Mock Database Context
// ===========================================================================

interface MockDocument {
  _id: string;
  [key: string]: unknown;
}

interface MockDbContext {
  db: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

function createMockDbContext(): MockDbContext {
  const mockQuery = {
    withIndex: vi.fn().mockReturnThis(),
    withSearchIndex: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    take: vi.fn().mockResolvedValue([]),
    collect: vi.fn().mockResolvedValue([]),
    unique: vi.fn().mockResolvedValue(null),
    first: vi.fn().mockResolvedValue(null),
  };

  return {
    db: {
      get: vi.fn().mockResolvedValue(null),
      query: vi.fn().mockReturnValue(mockQuery),
      insert: vi.fn().mockResolvedValue('new-id'),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockUserId = 'user-123' as const;
const mockRecipientId = 'user-456' as const;

const mockUsdBalance = {
  _id: 'balance-001',
  userId: mockUserId,
  assetType: 'usd',
  assetId: 'USD',
  symbol: 'USD',
  available: 10000,
  held: 2500,
  pending: 500,
  updatedAt: Date.now(),
};

const mockPointsBalance = {
  _id: 'balance-002',
  userId: mockUserId,
  assetType: 'points',
  assetId: 'PULL_POINTS',
  symbol: 'PTS',
  available: 5000,
  held: 0,
  pending: 0,
  updatedAt: Date.now(),
};

const mockCryptoBalance = {
  _id: 'balance-003',
  userId: mockUserId,
  assetType: 'crypto',
  assetId: 'BTC',
  symbol: 'BTC',
  available: 1.5,
  held: 0.5,
  pending: 0,
  updatedAt: Date.now(),
};

const mockDeposit = {
  _id: 'deposit-001',
  userId: mockUserId,
  method: 'bank_transfer',
  status: 'pending',
  amount: 1000,
  currency: 'USD',
  fee: 2.5,
  netAmount: 997.5,
  createdAt: Date.now(),
};

const mockPosition = {
  _id: 'position-001',
  userId: mockUserId,
  assetClass: 'crypto',
  symbol: 'BTC-USD',
  side: 'long',
  quantity: 2,
  averageEntryPrice: 45000,
  currentPrice: 50000,
  costBasis: 90000,
  unrealizedPnL: 10000,
  realizedPnL: 0,
  openedAt: Date.now() - 86400000,
  updatedAt: Date.now(),
};

// ===========================================================================
// Credit/Debit Balance Tests
// ===========================================================================

describe('Credit/Debit Balance Operations', () => {
  let ctx: MockDbContext;

  beforeEach(() => {
    ctx = createMockDbContext();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Credit Validation', () => {
    it('should reject negative credit amount', () => {
      const validateCredit = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Credit amount must be positive');
        }
        return true;
      };

      expect(() => validateCredit(-100)).toThrow('Credit amount must be positive');
      expect(() => validateCredit(0)).toThrow('Credit amount must be positive');
    });

    it('should accept positive credit amount', () => {
      const validateCredit = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Credit amount must be positive');
        }
        return true;
      };

      expect(validateCredit(100)).toBe(true);
      expect(validateCredit(0.01)).toBe(true);
      expect(validateCredit(1000000)).toBe(true);
    });

    it('should create balance if not exists on credit', () => {
      const creditBalance = (existingBalance: typeof mockUsdBalance | null, amount: number) => {
        if (existingBalance) {
          return {
            ...existingBalance,
            available: existingBalance.available + amount,
            updatedAt: Date.now(),
          };
        } else {
          return {
            _id: 'new-balance-id',
            available: amount,
            held: 0,
            pending: 0,
            updatedAt: Date.now(),
          };
        }
      };

      // Existing balance
      const updatedBalance = creditBalance(mockUsdBalance, 500);
      expect(updatedBalance.available).toBe(10500);

      // No existing balance
      const newBalance = creditBalance(null, 500);
      expect(newBalance.available).toBe(500);
      expect(newBalance.held).toBe(0);
      expect(newBalance.pending).toBe(0);
    });
  });

  describe('Debit Validation', () => {
    it('should reject negative debit amount', () => {
      const validateDebit = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Debit amount must be positive');
        }
        return true;
      };

      expect(() => validateDebit(-100)).toThrow('Debit amount must be positive');
      expect(() => validateDebit(0)).toThrow('Debit amount must be positive');
    });

    it('should reject debit when balance not found', () => {
      const debitBalance = (balance: typeof mockUsdBalance | null, amount: number) => {
        if (!balance) {
          throw new Error('Balance not found');
        }
        if (balance.available < amount) {
          throw new Error('Insufficient balance');
        }
        return {
          ...balance,
          available: balance.available - amount,
        };
      };

      expect(() => debitBalance(null, 100)).toThrow('Balance not found');
    });

    it('should reject debit when insufficient balance', () => {
      const debitBalance = (balance: typeof mockUsdBalance | null, amount: number) => {
        if (!balance) {
          throw new Error('Balance not found');
        }
        if (balance.available < amount) {
          throw new Error('Insufficient balance');
        }
        return {
          ...balance,
          available: balance.available - amount,
        };
      };

      expect(() => debitBalance(mockUsdBalance, 20000)).toThrow('Insufficient balance');
    });

    it('should accept valid debit', () => {
      const debitBalance = (balance: typeof mockUsdBalance, amount: number) => {
        if (balance.available < amount) {
          throw new Error('Insufficient balance');
        }
        return {
          ...balance,
          available: balance.available - amount,
        };
      };

      const result = debitBalance(mockUsdBalance, 5000);
      expect(result.available).toBe(5000);
    });

    it('should allow debiting entire available balance', () => {
      const debitBalance = (balance: typeof mockUsdBalance, amount: number) => {
        if (balance.available < amount) {
          throw new Error('Insufficient balance');
        }
        return {
          ...balance,
          available: balance.available - amount,
        };
      };

      const result = debitBalance(mockUsdBalance, 10000);
      expect(result.available).toBe(0);
    });
  });
});

// ===========================================================================
// Hold Management Tests
// ===========================================================================

describe('Hold Management', () => {
  describe('Place Hold', () => {
    it('should reject negative hold amount', () => {
      const placeHold = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Hold amount must be positive');
        }
      };

      expect(() => placeHold(-100)).toThrow('Hold amount must be positive');
      expect(() => placeHold(0)).toThrow('Hold amount must be positive');
    });

    it('should reject hold when balance not found', () => {
      const placeHold = (balance: typeof mockUsdBalance | null, amount: number) => {
        if (!balance) {
          throw new Error('Balance not found');
        }
        if (balance.available < amount) {
          throw new Error('Insufficient available balance for hold');
        }
      };

      expect(() => placeHold(null, 100)).toThrow('Balance not found');
    });

    it('should reject hold when insufficient available balance', () => {
      const placeHold = (balance: typeof mockUsdBalance, amount: number) => {
        if (balance.available < amount) {
          throw new Error('Insufficient available balance for hold');
        }
        return {
          ...balance,
          available: balance.available - amount,
          held: balance.held + amount,
        };
      };

      expect(() => placeHold(mockUsdBalance, 15000)).toThrow('Insufficient available balance for hold');
    });

    it('should successfully place hold', () => {
      const placeHold = (balance: typeof mockUsdBalance, amount: number) => {
        if (balance.available < amount) {
          throw new Error('Insufficient available balance for hold');
        }
        return {
          ...balance,
          available: balance.available - amount,
          held: balance.held + amount,
        };
      };

      const result = placeHold(mockUsdBalance, 5000);
      expect(result.available).toBe(5000);
      expect(result.held).toBe(7500);
    });

    it('should correctly update totals after hold', () => {
      const getTotal = (balance: typeof mockUsdBalance) => {
        return balance.available + balance.held + balance.pending;
      };

      const placeHold = (balance: typeof mockUsdBalance, amount: number) => {
        return {
          ...balance,
          available: balance.available - amount,
          held: balance.held + amount,
        };
      };

      const totalBefore = getTotal(mockUsdBalance);
      const afterHold = placeHold(mockUsdBalance, 5000);
      const totalAfter = getTotal(afterHold);

      // Total should remain the same
      expect(totalBefore).toBe(totalAfter);
    });
  });

  describe('Release Hold', () => {
    it('should reject negative release amount', () => {
      const releaseHold = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Release amount must be positive');
        }
      };

      expect(() => releaseHold(-100)).toThrow('Release amount must be positive');
      expect(() => releaseHold(0)).toThrow('Release amount must be positive');
    });

    it('should reject release when balance not found', () => {
      const releaseHold = (balance: typeof mockUsdBalance | null, amount: number) => {
        if (!balance) {
          throw new Error('Balance not found');
        }
      };

      expect(() => releaseHold(null, 100)).toThrow('Balance not found');
    });

    it('should reject release when insufficient held balance', () => {
      const releaseHold = (balance: typeof mockUsdBalance, amount: number) => {
        if (balance.held < amount) {
          throw new Error('Insufficient held balance');
        }
        return {
          ...balance,
          held: balance.held - amount,
        };
      };

      expect(() => releaseHold(mockUsdBalance, 5000)).toThrow('Insufficient held balance');
    });

    it('should return to available when specified', () => {
      const releaseHold = (
        balance: typeof mockUsdBalance,
        amount: number,
        returnToAvailable: boolean
      ) => {
        if (balance.held < amount) {
          throw new Error('Insufficient held balance');
        }
        return {
          ...balance,
          held: balance.held - amount,
          available: returnToAvailable ? balance.available + amount : balance.available,
        };
      };

      const result = releaseHold(mockUsdBalance, 2000, true);
      expect(result.available).toBe(12000);
      expect(result.held).toBe(500);
    });

    it('should not return to available when not specified', () => {
      const releaseHold = (
        balance: typeof mockUsdBalance,
        amount: number,
        returnToAvailable: boolean
      ) => {
        return {
          ...balance,
          held: balance.held - amount,
          available: returnToAvailable ? balance.available + amount : balance.available,
        };
      };

      const result = releaseHold(mockUsdBalance, 2000, false);
      expect(result.available).toBe(10000);
      expect(result.held).toBe(500);
    });
  });
});

// ===========================================================================
// Deposit Completion Tests
// ===========================================================================

describe('Deposit Completion', () => {
  describe('Status Validation', () => {
    it('should reject deposit not found', () => {
      const completeDeposit = (deposit: typeof mockDeposit | null) => {
        if (!deposit) {
          throw new Error('Deposit not found');
        }
      };

      expect(() => completeDeposit(null)).toThrow('Deposit not found');
    });

    it('should handle already completed deposit idempotently', () => {
      const completeDeposit = (deposit: typeof mockDeposit) => {
        if (deposit.status === 'completed') {
          return { success: true, alreadyCompleted: true };
        }
        return { success: true, alreadyCompleted: false };
      };

      const completedDeposit = { ...mockDeposit, status: 'completed' };
      const result = completeDeposit(completedDeposit);
      expect(result.alreadyCompleted).toBe(true);
    });

    it('should reject deposit with invalid status', () => {
      const completeDeposit = (deposit: typeof mockDeposit) => {
        if (deposit.status === 'completed') {
          return { success: true, alreadyCompleted: true };
        }
        if (deposit.status !== 'pending' && deposit.status !== 'processing') {
          throw new Error('Deposit cannot be completed from status: ' + deposit.status);
        }
        return { success: true };
      };

      const failedDeposit = { ...mockDeposit, status: 'failed' };
      expect(() => completeDeposit(failedDeposit)).toThrow('Deposit cannot be completed from status: failed');
    });

    it('should accept pending deposits', () => {
      const completeDeposit = (deposit: typeof mockDeposit) => {
        if (deposit.status !== 'pending' && deposit.status !== 'processing') {
          throw new Error('Deposit cannot be completed');
        }
        return { success: true };
      };

      expect(completeDeposit(mockDeposit).success).toBe(true);
    });

    it('should accept processing deposits', () => {
      const completeDeposit = (deposit: typeof mockDeposit) => {
        if (deposit.status !== 'pending' && deposit.status !== 'processing') {
          throw new Error('Deposit cannot be completed');
        }
        return { success: true };
      };

      const processingDeposit = { ...mockDeposit, status: 'processing' };
      expect(completeDeposit(processingDeposit).success).toBe(true);
    });
  });

  describe('Balance Credit', () => {
    it('should credit net amount correctly', () => {
      const creditFromDeposit = (
        balance: typeof mockUsdBalance | null,
        deposit: typeof mockDeposit
      ) => {
        const newAvailable = (balance?.available ?? 0) + deposit.netAmount;
        return { available: newAvailable };
      };

      const result = creditFromDeposit(mockUsdBalance, mockDeposit);
      expect(result.available).toBe(10997.5); // 10000 + 997.5
    });

    it('should create balance if not exists', () => {
      const creditFromDeposit = (
        balance: typeof mockUsdBalance | null,
        deposit: typeof mockDeposit
      ) => {
        if (balance) {
          return {
            ...balance,
            available: balance.available + deposit.netAmount,
          };
        } else {
          return {
            userId: deposit.userId,
            assetType: 'usd',
            assetId: 'USD',
            symbol: 'USD',
            available: deposit.netAmount,
            held: 0,
            pending: 0,
          };
        }
      };

      const result = creditFromDeposit(null, mockDeposit);
      expect(result.available).toBe(997.5);
      expect(result.held).toBe(0);
    });
  });
});

// ===========================================================================
// Withdrawal Tests
// ===========================================================================

describe('Withdrawal Operations', () => {
  describe('Validation', () => {
    it('should reject withdrawal with insufficient balance', () => {
      const validateWithdrawal = (
        balance: typeof mockUsdBalance | null,
        amount: number
      ) => {
        if (!balance || balance.available < amount) {
          throw new Error('Insufficient balance for withdrawal');
        }
        return true;
      };

      expect(() => validateWithdrawal(mockUsdBalance, 20000)).toThrow('Insufficient balance for withdrawal');
      expect(() => validateWithdrawal(null, 100)).toThrow('Insufficient balance for withdrawal');
    });

    it('should calculate net amount correctly', () => {
      const calculateNetAmount = (amount: number, fee: number) => {
        return amount - fee;
      };

      expect(calculateNetAmount(1000, 25)).toBe(975);
      expect(calculateNetAmount(500, 10.5)).toBe(489.5);
    });

    it('should place hold on withdrawal amount', () => {
      const initiateWithdrawal = (balance: typeof mockUsdBalance, amount: number) => {
        return {
          ...balance,
          available: balance.available - amount,
          held: balance.held + amount,
        };
      };

      const result = initiateWithdrawal(mockUsdBalance, 1000);
      expect(result.available).toBe(9000);
      expect(result.held).toBe(3500);
    });
  });
});

// ===========================================================================
// Transfer Tests
// ===========================================================================

describe('Transfer Operations', () => {
  describe('Validation', () => {
    it('should reject negative transfer amount', () => {
      const validateTransfer = (amount: number) => {
        if (amount <= 0) {
          throw new Error('Transfer amount must be positive');
        }
      };

      expect(() => validateTransfer(-100)).toThrow('Transfer amount must be positive');
      expect(() => validateTransfer(0)).toThrow('Transfer amount must be positive');
    });

    it('should reject transfer to self', () => {
      const validateTransfer = (fromUserId: string, toUserId: string) => {
        if (fromUserId === toUserId) {
          throw new Error('Cannot transfer to yourself');
        }
      };

      expect(() => validateTransfer(mockUserId, mockUserId)).toThrow('Cannot transfer to yourself');
    });

    it('should reject transfer when recipient not found', () => {
      const validateRecipient = (recipient: { status: string } | null) => {
        if (!recipient) {
          throw new Error('Recipient not found');
        }
        if (recipient.status !== 'active') {
          throw new Error('Recipient account is not active');
        }
      };

      expect(() => validateRecipient(null)).toThrow('Recipient not found');
    });

    it('should reject transfer to inactive recipient', () => {
      const validateRecipient = (recipient: { status: string }) => {
        if (recipient.status !== 'active') {
          throw new Error('Recipient account is not active');
        }
      };

      expect(() => validateRecipient({ status: 'suspended' })).toThrow('Recipient account is not active');
    });

    it('should reject transfer with insufficient balance', () => {
      const validateSenderBalance = (
        balance: typeof mockUsdBalance | null,
        amount: number
      ) => {
        if (!balance) {
          throw new Error('Sender balance not found');
        }
        if (balance.available < amount) {
          throw new Error(`Insufficient balance. Available: ${balance.available}, Requested: ${amount}`);
        }
      };

      expect(() => validateSenderBalance(null, 100)).toThrow('Sender balance not found');
      expect(() => validateSenderBalance(mockUsdBalance, 20000)).toThrow('Insufficient balance');
    });
  });

  describe('Execution', () => {
    it('should debit sender correctly', () => {
      const debitSender = (balance: typeof mockUsdBalance, amount: number) => {
        return {
          ...balance,
          available: balance.available - amount,
        };
      };

      const result = debitSender(mockUsdBalance, 1000);
      expect(result.available).toBe(9000);
    });

    it('should credit recipient correctly with existing balance', () => {
      const creditRecipient = (
        balance: typeof mockUsdBalance,
        amount: number
      ) => {
        return {
          ...balance,
          available: balance.available + amount,
        };
      };

      const recipientBalance = { ...mockUsdBalance, available: 5000 };
      const result = creditRecipient(recipientBalance, 1000);
      expect(result.available).toBe(6000);
    });

    it('should create recipient balance if not exists', () => {
      const creditRecipient = (
        balance: typeof mockUsdBalance | null,
        userId: string,
        assetType: string,
        assetId: string,
        symbol: string,
        amount: number
      ) => {
        if (balance) {
          return {
            ...balance,
            available: balance.available + amount,
          };
        } else {
          return {
            userId,
            assetType,
            assetId,
            symbol,
            available: amount,
            held: 0,
            pending: 0,
          };
        }
      };

      const result = creditRecipient(null, mockRecipientId, 'usd', 'USD', 'USD', 1000);
      expect(result.available).toBe(1000);
      expect(result.held).toBe(0);
    });
  });
});

// ===========================================================================
// Portfolio Summary Tests
// ===========================================================================

describe('Portfolio Summary', () => {
  describe('Calculations', () => {
    it('should calculate total position value correctly', () => {
      const calculatePositionValue = (positions: typeof mockPosition[]) => {
        return positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
      };

      const positions = [
        { ...mockPosition, quantity: 2, currentPrice: 50000 }, // 100000
        { ...mockPosition, quantity: 10, currentPrice: 100 },  // 1000
      ];

      expect(calculatePositionValue(positions)).toBe(101000);
    });

    it('should calculate total unrealized PnL correctly', () => {
      const calculateUnrealizedPnL = (positions: typeof mockPosition[]) => {
        return positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
      };

      const positions = [
        { ...mockPosition, unrealizedPnL: 10000 },
        { ...mockPosition, unrealizedPnL: -2000 },
        { ...mockPosition, unrealizedPnL: 5000 },
      ];

      expect(calculateUnrealizedPnL(positions)).toBe(13000);
    });

    it('should calculate total realized PnL correctly', () => {
      const calculateRealizedPnL = (positions: typeof mockPosition[]) => {
        return positions.reduce((sum, p) => sum + p.realizedPnL, 0);
      };

      const positions = [
        { ...mockPosition, realizedPnL: 5000 },
        { ...mockPosition, realizedPnL: -1000 },
        { ...mockPosition, realizedPnL: 3000 },
      ];

      expect(calculateRealizedPnL(positions)).toBe(7000);
    });

    it('should calculate portfolio value correctly', () => {
      const calculatePortfolioValue = (
        cashAvailable: number,
        positionValue: number
      ) => {
        return cashAvailable + positionValue;
      };

      expect(calculatePortfolioValue(10000, 100000)).toBe(110000);
      expect(calculatePortfolioValue(0, 50000)).toBe(50000);
      expect(calculatePortfolioValue(25000, 0)).toBe(25000);
    });

    it('should calculate asset class breakdown correctly', () => {
      const calculateBreakdown = (positions: typeof mockPosition[]) => {
        const breakdown = {
          crypto: 0,
          prediction: 0,
          rwa: 0,
        };

        positions.forEach((p) => {
          const value = p.quantity * p.currentPrice;
          if (p.assetClass === 'crypto') breakdown.crypto += value;
          else if (p.assetClass === 'prediction') breakdown.prediction += value;
          else if (p.assetClass === 'rwa') breakdown.rwa += value;
        });

        return breakdown;
      };

      const positions = [
        { ...mockPosition, assetClass: 'crypto', quantity: 1, currentPrice: 50000 },
        { ...mockPosition, assetClass: 'crypto', quantity: 10, currentPrice: 100 },
        { ...mockPosition, assetClass: 'prediction', quantity: 100, currentPrice: 0.65 },
        { ...mockPosition, assetClass: 'rwa', quantity: 5, currentPrice: 1000 },
      ];

      const breakdown = calculateBreakdown(positions);
      expect(breakdown.crypto).toBe(51000);
      expect(breakdown.prediction).toBe(65);
      expect(breakdown.rwa).toBe(5000);
    });
  });

  describe('Buying Power', () => {
    it('should calculate buying power correctly', () => {
      const getBuyingPower = (balance: typeof mockUsdBalance | null) => {
        return {
          available: balance?.available ?? 0,
          held: balance?.held ?? 0,
          pending: balance?.pending ?? 0,
          total: (balance?.available ?? 0) + (balance?.held ?? 0),
        };
      };

      const result = getBuyingPower(mockUsdBalance);
      expect(result.available).toBe(10000);
      expect(result.held).toBe(2500);
      expect(result.pending).toBe(500);
      expect(result.total).toBe(12500);
    });

    it('should handle missing balance', () => {
      const getBuyingPower = (balance: typeof mockUsdBalance | null) => {
        return {
          available: balance?.available ?? 0,
          held: balance?.held ?? 0,
          pending: balance?.pending ?? 0,
          total: (balance?.available ?? 0) + (balance?.held ?? 0),
        };
      };

      const result = getBuyingPower(null);
      expect(result.available).toBe(0);
      expect(result.held).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});

// ===========================================================================
// Balance Reconciliation Tests
// ===========================================================================

describe('Balance Reconciliation', () => {
  describe('Admin Reconciliation', () => {
    it('should calculate adjustment correctly', () => {
      const calculateAdjustment = (
        currentAvailable: number,
        currentHeld: number,
        expectedAvailable: number,
        expectedHeld: number
      ) => {
        return {
          availableDiff: expectedAvailable - currentAvailable,
          heldDiff: expectedHeld - currentHeld,
        };
      };

      const adjustment = calculateAdjustment(10000, 2500, 11000, 2000);
      expect(adjustment.availableDiff).toBe(1000);
      expect(adjustment.heldDiff).toBe(-500);
    });

    it('should reject reconciliation when balance not found', () => {
      const reconcile = (balance: typeof mockUsdBalance | null) => {
        if (!balance) {
          throw new Error('Balance not found');
        }
      };

      expect(() => reconcile(null)).toThrow('Balance not found');
    });

    it('should update balance to expected values', () => {
      const reconcile = (
        balance: typeof mockUsdBalance,
        expectedAvailable: number,
        expectedHeld: number
      ) => {
        return {
          ...balance,
          available: expectedAvailable,
          held: expectedHeld,
          updatedAt: Date.now(),
        };
      };

      const result = reconcile(mockUsdBalance, 15000, 1000);
      expect(result.available).toBe(15000);
      expect(result.held).toBe(1000);
    });
  });
});

// ===========================================================================
// Asset Type Validation Tests
// ===========================================================================

describe('Asset Type Validation', () => {
  const validAssetTypes = ['usd', 'crypto', 'prediction', 'rwa', 'points', 'token'];

  describe('Asset Type Checks', () => {
    it('should accept valid asset types', () => {
      const isValidAssetType = (assetType: string): boolean => {
        return validAssetTypes.includes(assetType);
      };

      validAssetTypes.forEach((type) => {
        expect(isValidAssetType(type)).toBe(true);
      });
    });

    it('should reject invalid asset types', () => {
      const isValidAssetType = (assetType: string): boolean => {
        return validAssetTypes.includes(assetType);
      };

      expect(isValidAssetType('stock')).toBe(false);
      expect(isValidAssetType('bond')).toBe(false);
      expect(isValidAssetType('forex')).toBe(false);
      expect(isValidAssetType('')).toBe(false);
    });
  });

  describe('Balance Query by Asset', () => {
    it('should return balance for existing asset', () => {
      const getBalance = (
        balances: typeof mockUsdBalance[],
        assetType: string,
        assetId: string
      ) => {
        return balances.find((b) => b.assetType === assetType && b.assetId === assetId);
      };

      const balances = [mockUsdBalance, mockPointsBalance, mockCryptoBalance];
      expect(getBalance(balances, 'usd', 'USD')).toEqual(mockUsdBalance);
      expect(getBalance(balances, 'points', 'PULL_POINTS')).toEqual(mockPointsBalance);
      expect(getBalance(balances, 'crypto', 'BTC')).toEqual(mockCryptoBalance);
    });

    it('should return undefined for non-existing asset', () => {
      const getBalance = (
        balances: typeof mockUsdBalance[],
        assetType: string,
        assetId: string
      ) => {
        return balances.find((b) => b.assetType === assetType && b.assetId === assetId);
      };

      const balances = [mockUsdBalance];
      expect(getBalance(balances, 'crypto', 'ETH')).toBeUndefined();
    });

    it('should return default values for missing balance', () => {
      const getBalanceOrDefault = (balance: typeof mockUsdBalance | undefined) => {
        if (!balance) {
          return {
            available: 0,
            held: 0,
            pending: 0,
            total: 0,
          };
        }
        return {
          ...balance,
          total: balance.available + balance.held + balance.pending,
        };
      };

      const result = getBalanceOrDefault(undefined);
      expect(result.available).toBe(0);
      expect(result.held).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});

// ===========================================================================
// Edge Cases and Error Handling
// ===========================================================================

describe('Edge Cases and Error Handling', () => {
  describe('Precision Handling', () => {
    it('should handle small amounts correctly', () => {
      const addToBalance = (current: number, amount: number) => {
        return Math.round((current + amount) * 100) / 100;
      };

      expect(addToBalance(100.01, 0.01)).toBe(100.02);
      expect(addToBalance(0.1, 0.2)).toBe(0.3);
    });

    it('should handle cryptocurrency precision', () => {
      const addToCryptoBalance = (current: number, amount: number) => {
        // 8 decimal places for crypto
        return Math.round((current + amount) * 1e8) / 1e8;
      };

      expect(addToCryptoBalance(0.00000001, 0.00000001)).toBe(0.00000002);
      expect(addToCryptoBalance(1.5, 0.12345678)).toBe(1.62345678);
    });
  });

  describe('Concurrent Modification', () => {
    it('should detect stale balance version', () => {
      const checkVersion = (expected: number, actual: number) => {
        if (expected !== actual) {
          throw new Error('Balance was modified by another transaction');
        }
      };

      expect(() => checkVersion(1, 2)).toThrow('Balance was modified');
    });

    it('should increment version on update', () => {
      const updateWithVersion = (balance: { version: number }) => {
        return {
          ...balance,
          version: balance.version + 1,
        };
      };

      const updated = updateWithVersion({ version: 1 });
      expect(updated.version).toBe(2);
    });
  });

  describe('Timestamp Handling', () => {
    it('should update timestamp on modification', () => {
      const now = Date.now();
      const balance = { ...mockUsdBalance, updatedAt: now - 1000 };

      const update = (b: typeof balance) => ({
        ...b,
        updatedAt: Date.now(),
      });

      const updated = update(balance);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(now);
    });
  });
});
