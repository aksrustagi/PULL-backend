/**
 * Sumsub KYC Service Types
 * All-in-one KYC: ID verification, liveness, document verification, AML screening
 */

import { z } from 'zod';

// ==========================================================================
// ENUMS AND CONSTANTS
// ==========================================================================

/**
 * Applicant status in the verification flow
 */
export type ApplicantStatus = 'init' | 'pending' | 'queued' | 'completed' | 'onHold';

/**
 * Review status for the verification process
 */
export type ReviewStatus = 'init' | 'pending' | 'prechecked' | 'queued' | 'completed';

/**
 * Final review result
 */
export type ReviewResult = 'GREEN' | 'RED' | 'ERROR';

/**
 * Supported verification levels (tiers)
 */
export type VerificationLevel = 'basic-kyc-level' | 'enhanced-kyc-level' | 'accredited-kyc-level';

/**
 * Document types supported by Sumsub
 */
export type DocumentType =
  | 'ID_CARD'
  | 'PASSPORT'
  | 'DRIVERS'
  | 'RESIDENCE_PERMIT'
  | 'UTILITY_BILL'
  | 'BANK_STATEMENT'
  | 'SELFIE'
  | 'VIDEO_SELFIE'
  | 'PROFILE_IMAGE'
  | 'ID_DOC_PHOTO'
  | 'AGREEMENT'
  | 'CONTRACT'
  | 'DRIVING_LICENSE'
  | 'VOTER_ID'
  | 'SNILS'
  | 'TAX_ID'
  | 'WORK_PERMIT'
  | 'PROOF_OF_ADDRESS';

/**
 * Document sub-types
 */
export type DocumentSubType = 'FRONT_SIDE' | 'BACK_SIDE' | 'FIRST_PAGE' | 'SECOND_PAGE';

/**
 * Rejection labels for failed verifications
 */
export type RejectionLabel =
  | 'FORGERY'
  | 'DOCUMENT_TEMPLATE'
  | 'LOW_QUALITY'
  | 'SPAM'
  | 'NOT_DOCUMENT'
  | 'SELFIE_MISMATCH'
  | 'ID_INVALID'
  | 'FOREIGNER'
  | 'DUPLICATE'
  | 'BAD_AVATAR'
  | 'WRONG_USER_REGION'
  | 'INCOMPLETE_DOCUMENT'
  | 'BLACKLIST'
  | 'REGULATIONS_VIOLATIONS'
  | 'INCONSISTENT_PROFILE'
  | 'PROBLEMATIC_APPLICANT_DATA'
  | 'ADDITIONAL_DOCUMENT_REQUIRED'
  | 'AGE_REQUIREMENT_MISMATCH'
  | 'EXPERIENCE_REQUIREMENT_MISMATCH'
  | 'SANCTIONS_LIST'
  | 'PEP'
  | 'ADVERSE_MEDIA'
  | 'WRONG_DATA';

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'applicantReviewed'
  | 'applicantPending'
  | 'applicantCreated'
  | 'applicantOnHold'
  | 'applicantPersonalInfoChanged'
  | 'applicantPrechecked'
  | 'applicantDeleted'
  | 'applicantActionPending'
  | 'applicantActionReviewed'
  | 'applicantActionOnHold'
  | 'applicantReset'
  | 'applicantLevelChanged'
  | 'videoIdentStatusChanged';

// ==========================================================================
// ZOD SCHEMAS
// ==========================================================================

export const AddressSchema = z.object({
  country: z.string().optional(),
  postCode: z.string().optional(),
  town: z.string().optional(),
  street: z.string().optional(),
  subStreet: z.string().optional(),
  state: z.string().optional(),
  buildingName: z.string().optional(),
  flatNumber: z.string().optional(),
  buildingNumber: z.string().optional(),
});

export const ApplicantInfoSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  legalName: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  dob: z.string().optional(), // YYYY-MM-DD
  placeOfBirth: z.string().optional(),
  country: z.string().optional(), // ISO 3166-1 alpha-3
  nationality: z.string().optional(),
  countryOfBirth: z.string().optional(),
  stateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  addresses: z.array(AddressSchema).optional(),
});

export const IdDocSchema = z.object({
  idDocType: z.string(),
  idDocSubType: z.string().optional(),
  country: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  issuedDate: z.string().optional(),
  validUntil: z.string().optional(),
  number: z.string().optional(),
  dob: z.string().optional(),
  placeOfBirth: z.string().optional(),
});

export const ReviewResultSchema = z.object({
  reviewAnswer: z.enum(['GREEN', 'RED', 'ERROR']),
  moderationComment: z.string().optional(),
  clientComment: z.string().optional(),
  rejectLabels: z.array(z.string()).optional(),
  reviewRejectType: z.enum(['FINAL', 'RETRY', 'EXTERNAL']).optional(),
  buttonIds: z.array(z.string()).optional(),
});

export const ApplicantResponseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  key: z.string().optional(),
  clientId: z.string().optional(),
  inspectionId: z.string().optional(),
  externalUserId: z.string(),
  info: ApplicantInfoSchema.optional(),
  fixedInfo: ApplicantInfoSchema.optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  env: z.string().optional(),
  requiredIdDocs: z.object({
    docSets: z.array(z.object({
      idDocSetType: z.string(),
      types: z.array(z.string()),
      subTypes: z.array(z.string()).optional(),
    })).optional(),
  }).optional(),
  review: z.object({
    reviewId: z.string().optional(),
    attemptId: z.string().optional(),
    attemptCnt: z.number().optional(),
    elapsedSincePendingMs: z.number().optional(),
    elapsedSinceQueuedMs: z.number().optional(),
    reprocessing: z.boolean().optional(),
    levelName: z.string().optional(),
    createDate: z.string().optional(),
    reviewDate: z.string().optional(),
    reviewResult: ReviewResultSchema.optional(),
    reviewStatus: z.enum(['init', 'pending', 'prechecked', 'queued', 'completed']).optional(),
    priority: z.number().optional(),
  }).optional(),
  type: z.string().optional(),
  lang: z.string().optional(),
});

export const AccessTokenResponseSchema = z.object({
  token: z.string(),
  userId: z.string(),
});

export const ApplicantStatusResponseSchema = z.object({
  id: z.string(),
  inspectionId: z.string().optional(),
  jobId: z.string().optional(),
  createDate: z.string(),
  reviewDate: z.string().optional(),
  startDate: z.string().optional(),
  reviewResult: ReviewResultSchema.optional(),
  reviewStatus: z.enum(['init', 'pending', 'prechecked', 'queued', 'completed']),
  notificationFailureCnt: z.number().optional(),
  applicantId: z.string().optional(),
  priority: z.number().optional(),
  autoChecked: z.boolean().optional(),
});

export const VerificationStepSchema = z.object({
  stepId: z.string(),
  stepType: z.string(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED']),
  reviewResult: z.enum(['GREEN', 'RED', 'ERROR']).optional(),
  rejectionLabels: z.array(z.string()).optional(),
  completedAt: z.string().optional(),
});

export const WebhookPayloadSchema = z.object({
  applicantId: z.string(),
  inspectionId: z.string().optional(),
  correlationId: z.string().optional(),
  levelName: z.string().optional(),
  externalUserId: z.string(),
  type: z.string(),
  sandboxMode: z.boolean().optional(),
  reviewStatus: z.string().optional(),
  reviewResult: ReviewResultSchema.optional(),
  createdAt: z.string().optional(),
  createdAtMs: z.string().optional(),
  applicantType: z.string().optional(),
  applicantMemberOf: z.array(z.object({
    applicantId: z.string(),
  })).optional(),
  videoIdentReviewStatus: z.string().optional(),
  clientId: z.string().optional(),
});

// ==========================================================================
// TYPE INTERFACES
// ==========================================================================

export type Address = z.infer<typeof AddressSchema>;
export type ApplicantInfo = z.infer<typeof ApplicantInfoSchema>;
export type IdDoc = z.infer<typeof IdDocSchema>;
export type ReviewResultData = z.infer<typeof ReviewResultSchema>;
export type ApplicantResponse = z.infer<typeof ApplicantResponseSchema>;
export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;
export type ApplicantStatusResponse = z.infer<typeof ApplicantStatusResponseSchema>;
export type VerificationStep = z.infer<typeof VerificationStepSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

/**
 * Parameters for creating an applicant
 */
export interface CreateApplicantParams {
  externalUserId: string;
  levelName: VerificationLevel;
  email?: string;
  phone?: string;
  info?: ApplicantInfo;
  lang?: string;
  fixedInfo?: ApplicantInfo;
}

/**
 * Parameters for setting applicant data
 */
export interface SetApplicantDataParams {
  info?: ApplicantInfo;
  email?: string;
  phone?: string;
  fixedInfo?: ApplicantInfo;
}

/**
 * Document upload parameters
 */
export interface DocumentUploadParams {
  idDocType: DocumentType;
  idDocSubType?: DocumentSubType;
  country?: string;
  content: Buffer | Blob;
  filename: string;
  contentType: string;
}

/**
 * Client configuration
 */
export interface SumsubClientConfig {
  appToken: string;
  secretKey: string;
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
 * Base error class for Sumsub API errors
 */
export class SumsubApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly description?: string;
  public readonly correlationId?: string;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    description?: string;
    correlationId?: string;
  }) {
    super(params.message);
    this.name = 'SumsubApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.description = params.description;
    this.correlationId = params.correlationId;
  }

  /**
   * Check if the error is retryable
   */
  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  /**
   * Check if it's a rate limit error
   */
  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if it's an authentication error
   */
  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /**
   * Check if applicant not found
   */
  isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

/**
 * Webhook signature verification error
 */
export class SumsubWebhookError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'INVALID_SIGNATURE') {
    super(message);
    this.name = 'SumsubWebhookError';
    this.code = code;
  }
}

// ==========================================================================
// DEFAULT LOGGER
// ==========================================================================

export const defaultLogger: Logger = {
  debug: (message: string, ...args: unknown[]) => console.debug(`[Sumsub] ${message}`, ...args),
  info: (message: string, ...args: unknown[]) => console.info(`[Sumsub] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[Sumsub] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[Sumsub] ${message}`, ...args),
};
