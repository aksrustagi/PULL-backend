import { describe, it, expect } from 'vitest';
import {
  isValidConvexIdFormat,
  toConvexId,
  toConvexIdSafe,
  toUserId,
  toOrderId,
  toRewardId,
  userIdParam,
  markValidatedUserId,
  validatedUserIdToConvex,
} from '../convex-types';

describe('Convex Types Utilities', () => {
  describe('isValidConvexIdFormat()', () => {
    it('should return true for valid Convex ID formats', () => {
      expect(isValidConvexIdFormat('k1234567890123')).toBe(true);
      expect(isValidConvexIdFormat('jg1234567890abcdef')).toBe(true);
      expect(isValidConvexIdFormat('abc123XYZ456def')).toBe(true);
      expect(isValidConvexIdFormat('12345678901')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isValidConvexIdFormat('')).toBe(false);
    });

    it('should return false for short strings', () => {
      expect(isValidConvexIdFormat('k123')).toBe(false);
      expect(isValidConvexIdFormat('abc')).toBe(false);
      expect(isValidConvexIdFormat('1234567890')).toBe(false);
    });

    it('should return false for strings with special characters', () => {
      expect(isValidConvexIdFormat('k123456789012-')).toBe(false);
      expect(isValidConvexIdFormat('k123456789012_')).toBe(false);
      expect(isValidConvexIdFormat('k123456789012.')).toBe(false);
      expect(isValidConvexIdFormat('k123456789012@')).toBe(false);
      expect(isValidConvexIdFormat('k123456789012 ')).toBe(false);
    });

    it('should return false for strings with spaces', () => {
      expect(isValidConvexIdFormat('k12345 67890123')).toBe(false);
      expect(isValidConvexIdFormat(' k1234567890123')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890123 ')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidConvexIdFormat(123 as any)).toBe(false);
      expect(isValidConvexIdFormat(null as any)).toBe(false);
      expect(isValidConvexIdFormat(undefined as any)).toBe(false);
      expect(isValidConvexIdFormat({} as any)).toBe(false);
    });
  });

  describe('toConvexId()', () => {
    it('should convert valid strings to typed Convex IDs', () => {
      const userId = toConvexId('k1234567890123', 'users');
      expect(userId).toBe('k1234567890123');
    });

    it('should work with different table types', () => {
      const orderId = toConvexId('jg1234567890abc', 'orders');
      const tradeId = toConvexId('k9876543210xyz', 'trades');
      const marketId = toConvexId('m1234567890abc', 'markets');
      
      expect(orderId).toBe('jg1234567890abc');
      expect(tradeId).toBe('k9876543210xyz');
      expect(marketId).toBe('m1234567890abc');
    });

    it('should throw error for invalid format', () => {
      expect(() => toConvexId('', 'users')).toThrow('Invalid users ID format');
      expect(() => toConvexId('short', 'users')).toThrow('Invalid users ID format');
      expect(() => toConvexId('k123-invalid', 'users')).toThrow('Invalid users ID format');
    });

    it('should include table name in error message', () => {
      expect(() => toConvexId('invalid', 'orders')).toThrow('Invalid orders ID format');
      expect(() => toConvexId('bad', 'rewards')).toThrow('Invalid rewards ID format');
    });
  });

  describe('toConvexIdSafe()', () => {
    it('should return typed ID for valid strings', () => {
      const userId = toConvexIdSafe('k1234567890123', 'users');
      expect(userId).toBe('k1234567890123');
    });

    it('should return null for invalid IDs', () => {
      expect(toConvexIdSafe('', 'users')).toBeNull();
      expect(toConvexIdSafe('short', 'users')).toBeNull();
      expect(toConvexIdSafe('k123-invalid', 'users')).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(toConvexIdSafe(undefined, 'users')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(toConvexIdSafe(null, 'users')).toBeNull();
    });

    it('should work with different table types', () => {
      expect(toConvexIdSafe('k1234567890123', 'orders')).toBe('k1234567890123');
      expect(toConvexIdSafe('invalid', 'orders')).toBeNull();
    });
  });

  describe('toUserId()', () => {
    it('should convert valid string to user ID', () => {
      const userId = toUserId('k1234567890123');
      expect(userId).toBe('k1234567890123');
    });

    it('should throw error for invalid format', () => {
      expect(() => toUserId('invalid')).toThrow('Invalid users ID format');
    });

    it('should be type-safe for users table', () => {
      // This is primarily a compile-time check, but we can verify runtime behavior
      const userId = toUserId('k1234567890123');
      expect(typeof userId).toBe('string');
    });
  });

  describe('toOrderId()', () => {
    it('should convert valid string to order ID', () => {
      const orderId = toOrderId('k1234567890123');
      expect(orderId).toBe('k1234567890123');
    });

    it('should throw error for invalid format', () => {
      expect(() => toOrderId('invalid')).toThrow('Invalid orders ID format');
    });
  });

  describe('toRewardId()', () => {
    it('should convert valid string to reward ID', () => {
      const rewardId = toRewardId('k1234567890123');
      expect(rewardId).toBe('k1234567890123');
    });

    it('should throw error for invalid format', () => {
      expect(() => toRewardId('invalid')).toThrow('Invalid rewards ID format');
    });
  });

  describe('userIdParam()', () => {
    it('should create properly typed user ID parameter', () => {
      const param = userIdParam('k1234567890123');
      expect(param).toEqual({
        userId: 'k1234567890123',
      });
    });

    it('should throw error for invalid user ID', () => {
      expect(() => userIdParam('invalid')).toThrow('Invalid users ID format');
    });

    it('should return object with userId property', () => {
      const param = userIdParam('k1234567890123');
      expect(param).toHaveProperty('userId');
      expect(typeof param.userId).toBe('string');
    });
  });

  describe('markValidatedUserId()', () => {
    it('should mark a user ID as validated', () => {
      const userId = markValidatedUserId('k1234567890123');
      expect(userId).toBe('k1234567890123');
    });

    it('should accept any string value', () => {
      // The function doesn't validate, it just brands the type
      const userId = markValidatedUserId('any-string');
      expect(userId).toBe('any-string');
    });

    it('should be usable for type branding', () => {
      // This is primarily a compile-time type check
      const userId = markValidatedUserId('k1234567890123');
      expect(typeof userId).toBe('string');
    });
  });

  describe('validatedUserIdToConvex()', () => {
    it('should convert validated user ID to Convex ID', () => {
      const validatedId = markValidatedUserId('k1234567890123');
      const convexId = validatedUserIdToConvex(validatedId);
      expect(convexId).toBe('k1234567890123');
    });

    it('should maintain the ID value during conversion', () => {
      const originalId = 'k9876543210xyz';
      const validatedId = markValidatedUserId(originalId);
      const convexId = validatedUserIdToConvex(validatedId);
      expect(convexId).toBe(originalId);
    });
  });

  describe('Type safety tests', () => {
    it('should handle all table types without errors', () => {
      const tables = [
        'users', 'orders', 'trades', 'balances', 'positions',
        'predictions', 'markets', 'rewards', 'pointsTransactions',
        'kycRecords', 'auditLog', 'accounts', 'fantasyLeagues',
        'fantasyTeams', 'fantasyPlayers', 'fantasyMarkets',
        'messaging', 'emails', 'socialTrading', 'rwa', 'rwassets',
        'dailyMetrics', 'analyticsEvents', 'experiments', 'dataFlywheel',
      ] as const;

      const validId = 'k1234567890123';

      for (const table of tables) {
        expect(() => toConvexId(validId, table)).not.toThrow();
        expect(toConvexIdSafe(validId, table)).toBe(validId);
      }
    });

    it('should handle edge cases in ID validation', () => {
      // Exactly 11 characters (minimum length)
      expect(isValidConvexIdFormat('k1234567890')).toBe(true);
      
      // 10 characters (below minimum)
      expect(isValidConvexIdFormat('k123456789')).toBe(false);
      
      // Very long ID
      const longId = 'k' + '1234567890'.repeat(10);
      expect(isValidConvexIdFormat(longId)).toBe(true);
    });

    it('should validate alphanumeric requirement strictly', () => {
      expect(isValidConvexIdFormat('k1234567890!')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890#')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890$')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890%')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890^')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890&')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890*')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890(')).toBe(false);
      expect(isValidConvexIdFormat('k1234567890)')).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should support common workflow: string -> validation -> conversion', () => {
      const userIdString = 'k1234567890123';
      
      // Validate format
      expect(isValidConvexIdFormat(userIdString)).toBe(true);
      
      // Convert safely
      const safeId = toConvexIdSafe(userIdString, 'users');
      expect(safeId).not.toBeNull();
      
      // Convert with assertion
      const convexId = toUserId(userIdString);
      expect(convexId).toBe(userIdString);
    });

    it('should handle invalid IDs gracefully in safe mode', () => {
      const invalidIds = ['', 'short', 'has-dash', 'has space', '!invalid'];
      
      for (const id of invalidIds) {
        expect(toConvexIdSafe(id, 'users')).toBeNull();
      }
    });

    it('should handle multiple ID conversions in sequence', () => {
      const userId = toUserId('k1111111111111');
      const orderId = toOrderId('k2222222222222');
      const rewardId = toRewardId('k3333333333333');
      
      expect(userId).toBe('k1111111111111');
      expect(orderId).toBe('k2222222222222');
      expect(rewardId).toBe('k3333333333333');
    });
  });
});
