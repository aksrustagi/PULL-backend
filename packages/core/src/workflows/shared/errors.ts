/**
 * Custom Error Types for Temporal Workflows
 * Provides structured error handling with error codes and metadata
 */

import { ApplicationFailure } from "@temporalio/workflow";

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  // Validation Errors (4xx range)
  VALIDATION_FAILED: "E4000",
  INVALID_INPUT: "E4001",
  MISSING_REQUIRED_FIELD: "E4002",
  INVALID_FORMAT: "E4003",
  AMOUNT_OUT_OF_RANGE: "E4004",

  // Authorization Errors
  UNAUTHORIZED: "E4010",
  KYC_INSUFFICIENT: "E4011",
  ACCOUNT_SUSPENDED: "E4012",
  RATE_LIMITED: "E4013",

  // Resource Errors
  NOT_FOUND: "E4040",
  ALREADY_EXISTS: "E4041",
  RESOURCE_LOCKED: "E4042",

  // Business Logic Errors
  INSUFFICIENT_FUNDS: "E4220",
  INSUFFICIENT_POINTS: "E4221",
  ORDER_REJECTED: "E4222",
  VERIFICATION_FAILED: "E4223",
  COMPLIANCE_BLOCKED: "E4224",

  // External Service Errors (5xx range)
  EXTERNAL_SERVICE_ERROR: "E5000",
  PERSONA_API_ERROR: "E5001",
  CHECKR_API_ERROR: "E5002",
  CHAINALYSIS_API_ERROR: "E5003",
  KALSHI_API_ERROR: "E5004",
  PLAID_API_ERROR: "E5005",
  NYLAS_API_ERROR: "E5006",
  MATRIX_API_ERROR: "E5007",

  // System Errors
  INTERNAL_ERROR: "E5500",
  TIMEOUT: "E5501",
  CIRCUIT_BREAKER_OPEN: "E5502",
  COMPENSATION_FAILED: "E5503",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// Error Metadata Interface
// ============================================================================

export interface ErrorMetadata {
  code: ErrorCode;
  retryable: boolean;
  context?: Record<string, unknown>;
  originalError?: string;
  timestamp?: string;
}

// ============================================================================
// Workflow Error Factory Functions
// ============================================================================

/**
 * Create a non-retryable validation error
 */
export function validationError(
  message: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(message, "ValidationError", {
    code: ErrorCodes.VALIDATION_FAILED,
    retryable: false,
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a non-retryable authorization error
 */
export function authorizationError(
  message: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(message, "AuthorizationError", {
    code: ErrorCodes.UNAUTHORIZED,
    retryable: false,
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a non-retryable KYC insufficient error
 */
export function kycInsufficientError(
  requiredTier: string,
  currentTier: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `KYC level insufficient. Required: ${requiredTier}, Current: ${currentTier}`,
    "KYCInsufficientError",
    {
      code: ErrorCodes.KYC_INSUFFICIENT,
      retryable: false,
      context: { requiredTier, currentTier, ...context },
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a non-retryable insufficient funds error
 */
export function insufficientFundsError(
  required: number,
  available: number,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `Insufficient funds. Required: $${required}, Available: $${available}`,
    "InsufficientFundsError",
    {
      code: ErrorCodes.INSUFFICIENT_FUNDS,
      retryable: false,
      context: { required, available, ...context },
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a non-retryable compliance blocked error
 */
export function complianceBlockedError(
  reason: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `Compliance check failed: ${reason}`,
    "ComplianceBlockedError",
    {
      code: ErrorCodes.COMPLIANCE_BLOCKED,
      retryable: false,
      context,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a retryable external service error
 */
export function externalServiceError(
  service: string,
  message: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  const codeMap: Record<string, ErrorCode> = {
    persona: ErrorCodes.PERSONA_API_ERROR,
    checkr: ErrorCodes.CHECKR_API_ERROR,
    chainalysis: ErrorCodes.CHAINALYSIS_API_ERROR,
    kalshi: ErrorCodes.KALSHI_API_ERROR,
    plaid: ErrorCodes.PLAID_API_ERROR,
    nylas: ErrorCodes.NYLAS_API_ERROR,
    matrix: ErrorCodes.MATRIX_API_ERROR,
  };

  return ApplicationFailure.retryable(
    `${service} API error: ${message}`,
    "ExternalServiceError",
    {
      code: codeMap[service.toLowerCase()] ?? ErrorCodes.EXTERNAL_SERVICE_ERROR,
      retryable: true,
      context: { service, ...context },
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a circuit breaker open error
 */
export function circuitBreakerOpenError(
  service: string,
  resetTime: Date
): ApplicationFailure {
  return ApplicationFailure.retryable(
    `Circuit breaker open for ${service}. Retry after ${resetTime.toISOString()}`,
    "CircuitBreakerError",
    {
      code: ErrorCodes.CIRCUIT_BREAKER_OPEN,
      retryable: true,
      context: { service, resetTime: resetTime.toISOString() },
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a timeout error
 */
export function timeoutError(
  operation: string,
  timeoutMs: number,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `Operation '${operation}' timed out after ${timeoutMs}ms`,
    "TimeoutError",
    {
      code: ErrorCodes.TIMEOUT,
      retryable: false,
      context: { operation, timeoutMs, ...context },
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Create a compensation failed error
 */
export function compensationFailedError(
  originalError: string,
  compensationError: string,
  context?: Record<string, unknown>
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `Compensation failed. Original: ${originalError}, Compensation: ${compensationError}`,
    "CompensationFailedError",
    {
      code: ErrorCodes.COMPENSATION_FAILED,
      retryable: false,
      context: { originalError, compensationError, ...context },
      timestamp: new Date().toISOString(),
    }
  );
}

// ============================================================================
// Error Classification Helpers
// ============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApplicationFailure) {
    const details = error.details as ErrorMetadata[] | undefined;
    if (details && details.length > 0) {
      return details[0].retryable;
    }
    // ApplicationFailure.type check
    return error.type !== "ValidationError" &&
           error.type !== "AuthorizationError" &&
           error.type !== "KYCInsufficientError" &&
           error.type !== "InsufficientFundsError" &&
           error.type !== "ComplianceBlockedError";
  }
  return false;
}

/**
 * Extract error code from error
 */
export function getErrorCode(error: unknown): ErrorCode | undefined {
  if (error instanceof ApplicationFailure) {
    const details = error.details as ErrorMetadata[] | undefined;
    if (details && details.length > 0) {
      return details[0].code;
    }
  }
  return undefined;
}

/**
 * Extract error context from error
 */
export function getErrorContext(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof ApplicationFailure) {
    const details = error.details as ErrorMetadata[] | undefined;
    if (details && details.length > 0) {
      return details[0].context;
    }
  }
  return undefined;
}
