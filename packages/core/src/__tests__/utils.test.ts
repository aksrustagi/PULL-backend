import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCompactNumber,
  formatPercent,
  truncateAddress,
  formatOrderId,
  formatPoints,
  formatPnL,
  formatFileSize,
} from '../utils/format';
import {
  sanitizeString,
  isValidUUID,
  emailSchema,
  passwordSchema,
  walletAddressSchema,
  usernameSchema,
} from '../utils/validation';

describe('Format Utilities', () => {
  describe('formatCurrency', () => {
    it('should format USD by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle negative values', () => {
      expect(formatCurrency(-100.5)).toBe('-$100.50');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format thousands as K', () => {
      expect(formatCompactNumber(1500)).toBe('1.5K');
    });

    it('should format millions as M', () => {
      expect(formatCompactNumber(2500000)).toBe('2.5M');
    });

    it('should handle small numbers', () => {
      expect(formatCompactNumber(100)).toBe('100');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage correctly', () => {
      expect(formatPercent(50)).toBe('50.00%');
    });

    it('should handle decimal precision', () => {
      expect(formatPercent(33.333, 1)).toBe('33.3%');
    });
  });

  describe('truncateAddress', () => {
    it('should truncate long addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      expect(truncateAddress(address)).toBe('0x1234...5678');
    });

    it('should not truncate short addresses', () => {
      const shortAddress = '0x1234';
      expect(truncateAddress(shortAddress)).toBe('0x1234');
    });
  });

  describe('formatOrderId', () => {
    it('should format order ID to uppercase 8 chars', () => {
      expect(formatOrderId('abcd1234efgh5678')).toBe('ABCD1234');
    });
  });

  describe('formatPoints', () => {
    it('should format points with thousands separator', () => {
      expect(formatPoints(12345)).toBe('12,345');
    });

    it('should floor decimal points', () => {
      expect(formatPoints(1234.99)).toBe('1,234');
    });
  });

  describe('formatPnL', () => {
    it('should format positive PnL with plus sign', () => {
      const result = formatPnL(100);
      expect(result.text).toBe('+$100.00');
      expect(result.isPositive).toBe(true);
      expect(result.isNegative).toBe(false);
    });

    it('should format negative PnL', () => {
      const result = formatPnL(-50);
      expect(result.text).toBe('-$50.00');
      expect(result.isPositive).toBe(false);
      expect(result.isNegative).toBe(true);
    });

    it('should handle zero PnL', () => {
      const result = formatPnL(0);
      expect(result.isPositive).toBe(false);
      expect(result.isNegative).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500.0 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
    });
  });
});

describe('Validation Utilities', () => {
  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should remove angle brackets', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUID', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });
  });

  describe('emailSchema', () => {
    it('should accept valid email', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });

    it('should lowercase email', () => {
      const result = emailSchema.safeParse('TEST@EXAMPLE.COM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });
  });

  describe('passwordSchema', () => {
    it('should accept strong password', () => {
      const result = passwordSchema.safeParse('Password123');
      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const result = passwordSchema.safeParse('Pass1');
      expect(result.success).toBe(false);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('password123');
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('PASSWORD123');
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('PasswordABC');
      expect(result.success).toBe(false);
    });
  });

  describe('walletAddressSchema', () => {
    it('should accept valid Ethereum address', () => {
      const result = walletAddressSchema.safeParse('0x1234567890abcdef1234567890abcdef12345678');
      expect(result.success).toBe(true);
    });

    it('should reject address without 0x prefix', () => {
      const result = walletAddressSchema.safeParse('1234567890abcdef1234567890abcdef12345678');
      expect(result.success).toBe(false);
    });

    it('should reject short address', () => {
      const result = walletAddressSchema.safeParse('0x1234');
      expect(result.success).toBe(false);
    });
  });

  describe('usernameSchema', () => {
    it('should accept valid username', () => {
      const result = usernameSchema.safeParse('user_123');
      expect(result.success).toBe(true);
    });

    it('should reject short username', () => {
      const result = usernameSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });

    it('should reject username with special characters', () => {
      const result = usernameSchema.safeParse('user@123');
      expect(result.success).toBe(false);
    });

    it('should lowercase username', () => {
      const result = usernameSchema.safeParse('UserName');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('username');
      }
    });
  });
});
