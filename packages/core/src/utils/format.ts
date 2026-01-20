/**
 * Formatting utilities for PULL
 */

/**
 * Format currency (USD)
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format large numbers with abbreviations (1K, 1M, 1B)
 */
export function formatCompactNumber(
  number: number,
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(number);
}

/**
 * Format percentage
 */
export function formatPercent(
  value: number,
  decimals: number = 2,
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format date relative to now (e.g., "2 hours ago")
 */
export function formatRelativeTime(
  date: Date,
  locale: string = "en-US"
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffDays > 0) {
    return rtf.format(-diffDays, "day");
  } else if (diffHours > 0) {
    return rtf.format(-diffHours, "hour");
  } else if (diffMin > 0) {
    return rtf.format(-diffMin, "minute");
  } else {
    return rtf.format(-diffSec, "second");
  }
}

/**
 * Format date for display
 */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
  locale: string = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Format time for display
 */
export function formatTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  },
  locale: string = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Truncate wallet address (0x1234...5678)
 */
export function truncateAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format order ID for display
 */
export function formatOrderId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

/**
 * Format points with thousands separator
 */
export function formatPoints(points: number, locale: string = "en-US"): string {
  return new Intl.NumberFormat(locale).format(Math.floor(points));
}

/**
 * Format P&L with sign and color class
 */
export function formatPnL(
  pnl: number,
  currency: string = "USD"
): { text: string; isPositive: boolean; isNegative: boolean } {
  const isPositive = pnl > 0;
  const isNegative = pnl < 0;
  const sign = isPositive ? "+" : "";
  const text = `${sign}${formatCurrency(pnl, currency)}`;

  return { text, isPositive, isNegative };
}

/**
 * Format file size (bytes to human readable)
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
