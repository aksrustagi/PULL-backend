/**
 * Parallel Markets Service Types
 * Accredited investor verification
 */

import { z } from 'zod';

// ==========================================================================
// ENUMS AND CONSTANTS
// ==========================================================================

/**
 * Accreditation type
 */
export type AccreditationType =
  | 'accredited_investor'
  | 'qualified_purchaser'
  | 'qualified_client';

/**
 * Accreditation status
 */
export type AccreditationStatus =
  | 'pending'
  | 'pending_documents'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired';

/**
 * Accreditation method (how they qualify)
 */
export type AccreditationMethod =
  | 'income'            // $200k individual / $300k joint for past 2 years
  | 'net_worth'         // $1M net worth excluding primary residence
  | 'professional_license' // Series 7, 65, or 82
  | 'entity'            // Entity with $5M+ assets
  | 'family_office'     // Family office
  | 'trust'             // Trust with $5M+ assets
  | 'knowledgeable_employee'; // Knowledgeable employee of private fund

/**
 * Entity type for non-individual accreditation
 */
export type EntityType =
  | 'individual'
  | 'joint'
  | 'trust'
  | 'llc'
  | 'corporation'
  | 'partnership'
  | 'ira'
  | 'family_office'
  | 'other';

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'accreditation.pending'
  | 'accreditation.approved'
  | 'accreditation.rejected'
  | 'accreditation.expired'
  | 'accreditation.document_requested'
  | 'accreditation.document_received'
  | 'identity.verified'
  | 'identity.failed';

// ==========================================================================
// ZOD SCHEMAS
// ==========================================================================

export const AddressSchema = z.object({
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postal_code: z.string(),
  country: z.string().default('US'),
});

export const InvestorSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  entity_name: z.string().nullable(),
  entity_type: z.string().nullable(),
  phone: z.string().nullable(),
  address: AddressSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AccreditationRequestSchema = z.object({
  id: z.string(),
  investor_id: z.string(),
  type: z.enum(['accredited_investor', 'qualified_purchaser', 'qualified_client']),
  status: z.enum([
    'pending',
    'pending_documents',
    'under_review',
    'approved',
    'rejected',
    'expired',
  ]),
  method: z.enum([
    'income',
    'net_worth',
    'professional_license',
    'entity',
    'family_office',
    'trust',
    'knowledgeable_employee',
  ]).nullable(),
  entity_type: z.string().nullable(),
  verification_url: z.string().nullable(),
  certificate_url: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});

export const AccreditationCertificateSchema = z.object({
  id: z.string(),
  request_id: z.string(),
  investor_name: z.string(),
  type: z.string(),
  method: z.string(),
  issued_at: z.string(),
  expires_at: z.string(),
  download_url: z.string(),
  pdf_data: z.string().optional(), // Base64 encoded PDF
});

export const DocumentSchema = z.object({
  id: z.string(),
  request_id: z.string(),
  type: z.string(),
  filename: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  rejection_reason: z.string().nullable(),
  uploaded_at: z.string(),
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    request_id: z.string().optional(),
    investor_id: z.string().optional(),
    status: z.string().optional(),
    reason: z.string().optional(),
  }),
});

// ==========================================================================
// TYPE INTERFACES
// ==========================================================================

export type Address = z.infer<typeof AddressSchema>;
export type Investor = z.infer<typeof InvestorSchema>;
export type AccreditationRequest = z.infer<typeof AccreditationRequestSchema>;
export type AccreditationCertificate = z.infer<typeof AccreditationCertificateSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Create investor parameters
 */
export interface CreateInvestorParams {
  email: string;
  firstName?: string;
  lastName?: string;
  entityName?: string;
  entityType?: EntityType;
  phone?: string;
  address?: Address;
}

/**
 * Create accreditation request parameters
 */
export interface CreateAccreditationParams {
  investorId?: string;
  investorEmail?: string;
  investorName?: string;
  type: AccreditationType;
  entityType?: EntityType;
  redirectUrl?: string;
  webhookUrl?: string;
}

/**
 * List accreditations parameters
 */
export interface ListAccreditationsParams {
  investorId?: string;
  investorEmail?: string;
  status?: AccreditationStatus;
  page?: number;
  perPage?: number;
}

/**
 * Client configuration
 */
export interface ParallelMarketsClientConfig {
  apiKey: string;
  webhookSecret?: string;
  baseUrl?: string;
  timeout?: number;
  logger?: Logger;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ==========================================================================
// ERROR CLASSES
// ==========================================================================

/**
 * Base error class for Parallel Markets API errors
 */
export class ParallelMarketsApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'ParallelMarketsApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
  }

  /**
   * Check if the error is retryable
   */
  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if authentication error
   */
  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /**
   * Check if not found
   */
  isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

/**
 * Webhook verification error
 */
export class ParallelMarketsWebhookError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'INVALID_SIGNATURE') {
    super(message);
    this.name = 'ParallelMarketsWebhookError';
    this.code = code;
  }
}

// ==========================================================================
// DEFAULT LOGGER
// ==========================================================================

export const defaultLogger: Logger = {
  debug: (message: string, ...args: unknown[]) =>
    console.debug(`[ParallelMarkets] ${message}`, ...args),
  info: (message: string, ...args: unknown[]) =>
    console.info(`[ParallelMarkets] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) =>
    console.warn(`[ParallelMarkets] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(`[ParallelMarkets] ${message}`, ...args),
};

// ==========================================================================
// CONSTANTS
// ==========================================================================

export const PARALLEL_MARKETS_BASE_URL = 'https://api.parallelmarkets.com/v1';

/**
 * Accreditation type descriptions
 */
export const ACCREDITATION_TYPE_DESCRIPTIONS: Record<AccreditationType, string> = {
  accredited_investor: 'SEC Rule 501 Accredited Investor',
  qualified_purchaser: 'Investment Company Act Qualified Purchaser',
  qualified_client: 'SEC Rule 205-3 Qualified Client',
};

/**
 * Accreditation method descriptions
 */
export const ACCREDITATION_METHOD_DESCRIPTIONS: Record<AccreditationMethod, string> = {
  income: 'Income ($200k individual / $300k joint)',
  net_worth: 'Net Worth ($1M+ excluding primary residence)',
  professional_license: 'Professional License (Series 7, 65, or 82)',
  entity: 'Entity ($5M+ assets)',
  family_office: 'Family Office',
  trust: 'Trust ($5M+ assets)',
  knowledgeable_employee: 'Knowledgeable Employee of Private Fund',
};
