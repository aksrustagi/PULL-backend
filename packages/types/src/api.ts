/**
 * API Response Types for PULL Super App
 * Covers standard API responses, pagination, errors
 */

/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: ResponseMeta;
  timestamp: string;
  requestId: string;
}

/** Response metadata */
export interface ResponseMeta {
  version?: string;
  deprecation?: string;
  rateLimit?: RateLimitInfo;
}

/** Rate limit information */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationInfo;
  meta?: ResponseMeta;
  timestamp: string;
  requestId: string;
}

/** Pagination information */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/** Cursor-based paginated response */
export interface CursorPaginatedResponse<T> {
  success: boolean;
  data: T[];
  cursor: CursorInfo;
  meta?: ResponseMeta;
  timestamp: string;
  requestId: string;
}

/** Cursor information */
export interface CursorInfo {
  next?: string;
  previous?: string;
  hasMore: boolean;
  total?: number;
}

/** Error response */
export interface ErrorResponse {
  success: false;
  error: ApiError;
  timestamp: string;
  requestId: string;
}

/** API error details */
export interface ApiError {
  code: string;
  message: string;
  details?: string;
  field?: string;
  validationErrors?: ValidationError[];
  stack?: string;
  documentation?: string;
}

/** Validation error */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
  constraint?: string;
}

/** Common error codes */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "INSUFFICIENT_PERMISSIONS"
  | "RESOURCE_NOT_FOUND"
  | "DUPLICATE_RESOURCE"
  | "INVALID_INPUT"
  | "OPERATION_FAILED"
  | "EXTERNAL_SERVICE_ERROR"
  | "KYC_REQUIRED"
  | "INSUFFICIENT_BALANCE"
  | "ORDER_REJECTED"
  | "MARKET_CLOSED";

/** Batch operation request */
export interface BatchRequest<T> {
  operations: BatchOperation<T>[];
}

/** Batch operation */
export interface BatchOperation<T> {
  id: string;
  method: "create" | "update" | "delete";
  data: T;
}

/** Batch operation response */
export interface BatchResponse<T> {
  success: boolean;
  results: BatchResult<T>[];
  summary: BatchSummary;
  timestamp: string;
  requestId: string;
}

/** Individual batch result */
export interface BatchResult<T> {
  id: string;
  success: boolean;
  data?: T;
  error?: ApiError;
}

/** Batch summary */
export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/** Webhook payload */
export interface WebhookPayload<T> {
  id: string;
  type: string;
  version: string;
  timestamp: string;
  data: T;
  signature?: string;
}

/** Webhook event types */
export type WebhookEventType =
  | "user.created"
  | "user.updated"
  | "user.kyc.completed"
  | "order.created"
  | "order.filled"
  | "order.cancelled"
  | "trade.executed"
  | "deposit.completed"
  | "withdrawal.completed"
  | "transfer.completed"
  | "alert.triggered"
  | "market.opened"
  | "market.closed"
  | "event.settled";

/** Health check response */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime: number;
  checks: HealthCheck[];
}

/** Individual health check */
export interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message?: string;
  latency?: number;
  timestamp: string;
}

/** Request context */
export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  traceId?: string;
  spanId?: string;
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  timestamp: Date;
}

/** Sort options */
export interface SortOptions {
  field: string;
  direction: "asc" | "desc";
}

/** Filter options */
export interface FilterOptions {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/** Filter operators */
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "between"
  | "isNull"
  | "isNotNull";

/** Query parameters */
export interface QueryParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
  sort?: SortOptions[];
  filters?: FilterOptions[];
  search?: string;
  include?: string[];
  fields?: string[];
}

/** Subscription message (WebSocket) */
export interface SubscriptionMessage<T> {
  type: "data" | "error" | "heartbeat" | "subscribed" | "unsubscribed";
  channel: string;
  data?: T;
  error?: ApiError;
  timestamp: string;
  sequence?: number;
}

/** Subscription channels */
export type SubscriptionChannel =
  | "orderbook"
  | "trades"
  | "ticker"
  | "positions"
  | "orders"
  | "balances"
  | "notifications"
  | "chat";
