import { describe, it, expect } from 'vitest';
import { parseIntSafe } from '../../utils/validation';

describe('parseIntSafe', () => {
  it('should return default for undefined', () => {
    expect(parseIntSafe(undefined, 50)).toBe(50);
  });

  it('should return default for NaN', () => {
    expect(parseIntSafe('abc', 50)).toBe(50);
  });

  it('should parse valid integers', () => {
    expect(parseIntSafe('25', 50)).toBe(25);
  });

  it('should clamp to min', () => {
    expect(parseIntSafe('0', 50, 1, 100)).toBe(1);
  });

  it('should clamp to max', () => {
    expect(parseIntSafe('200', 50, 1, 100)).toBe(100);
  });
});
