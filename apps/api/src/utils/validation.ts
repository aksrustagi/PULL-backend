/**
 * Safely parse an integer with validation
 * Prevents NaN issues when parsing user input
 */
export function parseIntSafe(value: string | undefined, defaultValue: number, min = 1, max = 100): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}
