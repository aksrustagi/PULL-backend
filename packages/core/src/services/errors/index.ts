/**
 * API Error Catalog & Error Handling
 *
 * Provides a structured error system for the PULL platform with:
 * - Comprehensive error catalog across all domains (auth, trading, payments, etc.)
 * - Type-safe error construction with PullApiError
 * - Domain-specific factory functions for common error patterns
 * - Structured API response formatting with request correlation
 */

// Error catalog
export {
  ErrorCodes,
  getErrorByCode,
  getErrorsByDomain,
  isRetryable,
  getHttpStatus,
  type ErrorEntry,
  type ErrorCodeKey,
  type NumericErrorCode,
  type ErrorHttpStatus,
} from "./catalog";

// Error class & utilities
export {
  PullApiError,
  isPullApiError,
  toPullApiError,
  createErrorByCode,
  AuthErrors,
  TradeErrors,
  PaymentErrors,
  KycErrors,
  PredictionErrors,
  SystemErrors,
  type ApiErrorResponse,
} from "./api-error";
