/**
 * Checkr Background Check Service Types
 * Background checks for enhanced KYC verification
 */

import { z } from 'zod';

// ==========================================================================
// ENUMS AND CONSTANTS
// ==========================================================================

/**
 * Report status
 */
export type ReportStatus =
  | 'pending'
  | 'complete'
  | 'suspended'
  | 'dispute';

/**
 * Report result adjudication
 */
export type ReportResult =
  | 'clear'
  | 'consider'
  | 'adverse_action';

/**
 * Candidate status
 */
export type CandidateStatus =
  | 'pending'
  | 'clear'
  | 'consider'
  | 'suspended'
  | 'dispute'
  | 'requires_review';

/**
 * Screening types
 */
export type ScreeningType =
  | 'ssn_trace'
  | 'sex_offender_search'
  | 'national_criminal_search'
  | 'county_criminal_search'
  | 'state_criminal_search'
  | 'motor_vehicle_report'
  | 'education_verification'
  | 'employment_verification'
  | 'identity_document_verification'
  | 'drug_screening'
  | 'federal_criminal_search'
  | 'federal_civil_search'
  | 'global_watchlist_search'
  | 'facis_search'
  | 'professional_license_verification';

/**
 * Screening status
 */
export type ScreeningStatus =
  | 'pending'
  | 'complete'
  | 'suspended'
  | 'dispute'
  | 'canceled';

/**
 * Screening result
 */
export type ScreeningResult =
  | 'clear'
  | 'consider';

/**
 * Supported packages
 */
export type CheckrPackage =
  | 'tasker_standard'      // Basic criminal + SSN trace
  | 'tasker_plus'          // + Education/Employment verification
  | 'driver_standard'      // Criminal + MVR
  | 'driver_pro'           // Criminal + MVR + Drug test
  | 'international_basic'  // Global watchlist
  | 'international_pro'    // + International criminal
  | 'pro';                 // Full suite

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'report.created'
  | 'report.upgraded'
  | 'report.completed'
  | 'report.suspended'
  | 'report.resumed'
  | 'report.pre_adverse_action'
  | 'report.adverse_action'
  | 'candidate.created'
  | 'candidate.updated'
  | 'candidate.pre_adverse_action'
  | 'candidate.post_adverse_action'
  | 'candidate.engaged'
  | 'screening.completed';

// ==========================================================================
// ZOD SCHEMAS
// ==========================================================================

export const AddressSchema = z.object({
  street: z.string().optional(),
  unit: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
  country: z.string().optional(),
});

export const CandidateSchema = z.object({
  id: z.string(),
  object: z.literal('candidate'),
  uri: z.string(),
  created_at: z.string(),
  first_name: z.string().nullable(),
  middle_name: z.string().nullable(),
  no_middle_name: z.boolean().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  zipcode: z.string().nullable(),
  dob: z.string().nullable(),
  ssn: z.string().nullable(),
  driver_license_number: z.string().nullable(),
  driver_license_state: z.string().nullable(),
  copy_requested: z.boolean().nullable(),
  custom_id: z.string().nullable(),
  report_ids: z.array(z.string()),
  geo_ids: z.array(z.string()).nullable(),
  adjudication: z.string().nullable(),
  metadata: z.record(z.string()).nullable(),
});

export const ScreeningSchema = z.object({
  id: z.string(),
  object: z.literal('screening'),
  type: z.string(),
  status: z.enum(['pending', 'complete', 'suspended', 'dispute', 'canceled']),
  result: z.enum(['clear', 'consider']).nullable(),
  package: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  turnaround_time: z.number().nullable(),
  records: z.array(z.unknown()).optional(),
});

export const ReportSchema = z.object({
  id: z.string(),
  object: z.literal('report'),
  uri: z.string(),
  status: z.enum(['pending', 'complete', 'suspended', 'dispute']),
  result: z.enum(['clear', 'consider', 'adverse_action']).nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  revised_at: z.string().nullable(),
  upgraded_at: z.string().nullable(),
  turnaround_time: z.number().nullable(),
  due_time: z.string().nullable(),
  adjudication: z.string().nullable(),
  package: z.string(),
  source: z.string().nullable(),
  candidate_id: z.string(),
  ssn_trace_id: z.string().nullable(),
  sex_offender_search_id: z.string().nullable(),
  national_criminal_search_id: z.string().nullable(),
  county_criminal_search_ids: z.array(z.string()).nullable(),
  state_criminal_search_ids: z.array(z.string()).nullable(),
  motor_vehicle_report_id: z.string().nullable(),
  federal_criminal_search_id: z.string().nullable(),
  federal_civil_search_id: z.string().nullable(),
  global_watchlist_search_id: z.string().nullable(),
  drug_screening_id: z.string().nullable(),
  document_ids: z.array(z.string()).nullable(),
  geo_ids: z.array(z.string()).nullable(),
  arrest_search_id: z.string().nullable(),
  eviction_search_id: z.string().nullable(),
  facis_search_id: z.string().nullable(),
  identity_document_verification_id: z.string().nullable(),
  education_verification_ids: z.array(z.string()).nullable(),
  employment_verification_ids: z.array(z.string()).nullable(),
  professional_license_verification_ids: z.array(z.string()).nullable(),
  credit_report_id: z.string().nullable(),
  personal_reference_verification_ids: z.array(z.string()).nullable(),
  program_id: z.string().nullable(),
  estimated_completion_time: z.string().nullable(),
  eta: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
});

export const SSNTraceSchema = z.object({
  id: z.string(),
  object: z.literal('ssn_trace'),
  uri: z.string(),
  status: z.enum(['pending', 'complete', 'suspended', 'dispute', 'canceled']),
  result: z.enum(['clear', 'consider']).nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  turnaround_time: z.number().nullable(),
  ssn: z.string().nullable(),
  addresses: z.array(AddressSchema),
});

export const GlobalWatchlistSchema = z.object({
  id: z.string(),
  object: z.literal('global_watchlist_search'),
  uri: z.string(),
  status: z.enum(['pending', 'complete', 'suspended', 'dispute', 'canceled']),
  result: z.enum(['clear', 'consider']).nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  turnaround_time: z.number().nullable(),
  records: z.array(z.object({
    name: z.string().optional(),
    list_name: z.string().optional(),
    list_key: z.string().optional(),
    comments: z.string().optional(),
    country: z.string().optional(),
    dob: z.string().optional(),
    type: z.string().optional(),
    url: z.string().optional(),
  })),
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  created_at: z.string(),
  webhook_url: z.string().optional(),
  data: z.object({
    object: z.object({
      id: z.string(),
      object: z.string(),
      status: z.string().optional(),
      result: z.string().optional().nullable(),
      adjudication: z.string().optional().nullable(),
    }).passthrough(),
  }),
  account_id: z.string().optional(),
});

// ==========================================================================
// TYPE INTERFACES
// ==========================================================================

export type Address = z.infer<typeof AddressSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Screening = z.infer<typeof ScreeningSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type SSNTrace = z.infer<typeof SSNTraceSchema>;
export type GlobalWatchlist = z.infer<typeof GlobalWatchlistSchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Candidate creation parameters
 */
export interface CreateCandidateParams {
  firstName: string;
  lastName: string;
  middleName?: string;
  noMiddleName?: boolean;
  email: string;
  phone?: string;
  zipcode?: string;
  dob?: string;  // YYYY-MM-DD
  ssn?: string;
  driverLicenseNumber?: string;
  driverLicenseState?: string;
  customId?: string;
  copyRequested?: boolean;
  geoIds?: string[];
  metadata?: Record<string, string>;
}

/**
 * Candidate update parameters
 */
export interface UpdateCandidateParams {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  noMiddleName?: boolean;
  email?: string;
  phone?: string;
  zipcode?: string;
  dob?: string;
  ssn?: string;
  driverLicenseNumber?: string;
  driverLicenseState?: string;
  copyRequested?: boolean;
  geoIds?: string[];
  metadata?: Record<string, string>;
}

/**
 * Report creation parameters
 */
export interface CreateReportParams {
  candidateId: string;
  package: CheckrPackage;
  nodeId?: string;
  geoIds?: string[];
  tags?: string[];
}

/**
 * List reports parameters
 */
export interface ListReportsParams {
  candidateId?: string;
  page?: number;
  perPage?: number;
}

/**
 * Client configuration
 */
export interface CheckrClientConfig {
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
 * Base error class for Checkr API errors
 */
export class CheckrApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors?: Array<{ field: string; message: string }>;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    errors?: Array<{ field: string; message: string }>;
  }) {
    super(params.message);
    this.name = 'CheckrApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.errors = params.errors;
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
export class CheckrWebhookError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'INVALID_SIGNATURE') {
    super(message);
    this.name = 'CheckrWebhookError';
    this.code = code;
  }
}

// ==========================================================================
// DEFAULT LOGGER
// ==========================================================================

export const defaultLogger: Logger = {
  debug: (message: string, ...args: unknown[]) => console.debug(`[Checkr] ${message}`, ...args),
  info: (message: string, ...args: unknown[]) => console.info(`[Checkr] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[Checkr] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[Checkr] ${message}`, ...args),
};

// ==========================================================================
// CONSTANTS
// ==========================================================================

export const CHECKR_BASE_URL = 'https://api.checkr.com';

export const PACKAGE_DESCRIPTIONS: Record<CheckrPackage, string> = {
  tasker_standard: 'Basic criminal + SSN trace (~$30)',
  tasker_plus: 'Criminal + Education/Employment verification (~$50)',
  driver_standard: 'Criminal + MVR (~$50)',
  driver_pro: 'Criminal + MVR + drug test (~$80)',
  international_basic: 'Global watchlist (~$50)',
  international_pro: 'Global watchlist + International criminal (~$100)',
  pro: 'Full background check suite (~$150)',
};
