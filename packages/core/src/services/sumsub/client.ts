/**
 * Sumsub KYC Client
 * All-in-one KYC: ID verification, liveness, document verification, AML screening
 */

import crypto from 'crypto';
import {
  type SumsubClientConfig,
  type Logger,
  type CreateApplicantParams,
  type SetApplicantDataParams,
  type DocumentUploadParams,
  type ApplicantResponse,
  type AccessTokenResponse,
  type ApplicantStatusResponse,
  type VerificationStep,
  type WebhookPayload,
  type VerificationLevel,
  ApplicantResponseSchema,
  AccessTokenResponseSchema,
  ApplicantStatusResponseSchema,
  WebhookPayloadSchema,
  SumsubApiError,
  SumsubWebhookError,
  defaultLogger,
} from './types';

const DEFAULT_BASE_URL = 'https://api.sumsub.com';
const DEFAULT_TIMEOUT = 30000;

/**
 * Sumsub KYC Client for identity verification
 */
export class SumsubClient {
  private readonly appToken: string;
  private readonly secretKey: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: SumsubClientConfig) {
    this.appToken = config.appToken;
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.logger = config.logger ?? defaultLogger;
  }

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================

  /**
   * Generate HMAC-SHA256 signature for API requests
   */
  private generateSignature(
    ts: number,
    httpMethod: string,
    path: string,
    body?: string
  ): string {
    const data = ts + httpMethod.toUpperCase() + path + (body ?? '');
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Make authenticated request to Sumsub API
   */
  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      isFormData?: boolean;
    } = {}
  ): Promise<T> {
    const ts = Math.floor(Date.now() / 1000);
    const bodyString = options.body && !options.isFormData
      ? JSON.stringify(options.body)
      : undefined;

    const signature = this.generateSignature(ts, method, path, bodyString);

    const headers: Record<string, string> = {
      'X-App-Token': this.appToken,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': ts.toString(),
      ...options.headers,
    };

    if (!options.isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      this.logger.debug(`${method} ${path}`);

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.isFormData ? (options.body as FormData) : bodyString,
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: unknown;

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { rawResponse: responseText };
      }

      if (!response.ok) {
        const errorData = data as Record<string, unknown>;
        throw new SumsubApiError({
          message: (errorData.description as string) || (errorData.message as string) || `HTTP ${response.status}`,
          statusCode: response.status,
          code: (errorData.code as string) || 'UNKNOWN_ERROR',
          description: errorData.description as string,
          correlationId: response.headers.get('X-Correlation-Id') ?? undefined,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof SumsubApiError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new SumsubApiError({
            message: 'Request timeout',
            statusCode: 408,
            code: 'TIMEOUT',
          });
        }
        throw new SumsubApiError({
          message: error.message,
          statusCode: 500,
          code: 'NETWORK_ERROR',
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================================================
  // APPLICANT MANAGEMENT
  // ==========================================================================

  /**
   * Create a new KYC applicant
   */
  async createApplicant(params: CreateApplicantParams): Promise<ApplicantResponse> {
    this.logger.info(`Creating applicant for user: ${params.externalUserId}`);

    const response = await this.request<unknown>(
      'POST',
      `/resources/applicants?levelName=${encodeURIComponent(params.levelName)}`,
      {
        body: {
          externalUserId: params.externalUserId,
          email: params.email,
          phone: params.phone,
          info: params.info,
          lang: params.lang,
          fixedInfo: params.fixedInfo,
        },
      }
    );

    const validated = ApplicantResponseSchema.parse(response);
    this.logger.info(`Created applicant: ${validated.id}`);
    return validated;
  }

  /**
   * Get applicant by ID
   */
  async getApplicant(applicantId: string): Promise<ApplicantResponse> {
    this.logger.debug(`Getting applicant: ${applicantId}`);

    const response = await this.request<unknown>(
      'GET',
      `/resources/applicants/${applicantId}`
    );

    return ApplicantResponseSchema.parse(response);
  }

  /**
   * Get applicant by external user ID
   */
  async getApplicantByExternalId(externalUserId: string): Promise<ApplicantResponse | null> {
    this.logger.debug(`Getting applicant by external ID: ${externalUserId}`);

    try {
      const response = await this.request<unknown>(
        'GET',
        `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}`
      );
      return ApplicantResponseSchema.parse(response);
    } catch (error) {
      if (error instanceof SumsubApiError && error.isNotFound()) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get applicant verification status
   */
  async getApplicantStatus(applicantId: string): Promise<ApplicantStatusResponse> {
    this.logger.debug(`Getting applicant status: ${applicantId}`);

    const response = await this.request<unknown>(
      'GET',
      `/resources/applicants/${applicantId}/requiredIdDocsStatus`
    );

    return ApplicantStatusResponseSchema.parse(response);
  }

  /**
   * Set applicant personal data
   */
  async setApplicantData(
    applicantId: string,
    data: SetApplicantDataParams
  ): Promise<ApplicantResponse> {
    this.logger.info(`Setting applicant data: ${applicantId}`);

    const response = await this.request<unknown>(
      'PATCH',
      `/resources/applicants/${applicantId}/info`,
      { body: data }
    );

    return ApplicantResponseSchema.parse(response);
  }

  /**
   * Reset applicant for re-verification
   */
  async resetApplicant(applicantId: string): Promise<void> {
    this.logger.info(`Resetting applicant: ${applicantId}`);

    await this.request<unknown>(
      'POST',
      `/resources/applicants/${applicantId}/reset`
    );
  }

  /**
   * Change applicant verification level
   */
  async changeApplicantLevel(
    applicantId: string,
    levelName: VerificationLevel
  ): Promise<void> {
    this.logger.info(`Changing applicant level: ${applicantId} to ${levelName}`);

    await this.request<unknown>(
      'POST',
      `/resources/applicants/${applicantId}/moveToLevel?name=${encodeURIComponent(levelName)}`
    );
  }

  // ==========================================================================
  // ACCESS TOKEN
  // ==========================================================================

  /**
   * Generate SDK access token for frontend integration
   */
  async generateAccessToken(
    userId: string,
    levelName: VerificationLevel,
    ttlInSecs: number = 3600
  ): Promise<AccessTokenResponse> {
    this.logger.info(`Generating access token for user: ${userId}`);

    const response = await this.request<unknown>(
      'POST',
      `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttlInSecs}`
    );

    const validated = AccessTokenResponseSchema.parse(response);
    this.logger.debug(`Generated access token for user: ${userId}`);
    return validated;
  }

  /**
   * Generate SDK access token for existing applicant
   */
  async generateAccessTokenForApplicant(
    applicantId: string,
    ttlInSecs: number = 3600
  ): Promise<AccessTokenResponse> {
    this.logger.info(`Generating access token for applicant: ${applicantId}`);

    const response = await this.request<unknown>(
      'POST',
      `/resources/accessTokens?applicantId=${encodeURIComponent(applicantId)}&ttlInSecs=${ttlInSecs}`
    );

    return AccessTokenResponseSchema.parse(response);
  }

  // ==========================================================================
  // DOCUMENT MANAGEMENT
  // ==========================================================================

  /**
   * Add ID document to applicant
   */
  async addIdDocument(
    applicantId: string,
    document: DocumentUploadParams
  ): Promise<{ idDocId: string }> {
    this.logger.info(`Adding document to applicant: ${applicantId}, type: ${document.idDocType}`);

    const formData = new FormData();

    const metadata = {
      idDocType: document.idDocType,
      idDocSubType: document.idDocSubType,
      country: document.country,
    };
    formData.append('metadata', JSON.stringify(metadata));

    const blob = document.content instanceof Blob
      ? document.content
      : new Blob([document.content], { type: document.contentType });
    formData.append('content', blob, document.filename);

    // For form data, we need custom signature generation
    const ts = Math.floor(Date.now() / 1000);
    const path = `/resources/applicants/${applicantId}/info/idDoc`;
    const signature = this.generateSignature(ts, 'POST', path);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'X-App-Token': this.appToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': ts.toString(),
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new SumsubApiError({
          message: errorText || `HTTP ${response.status}`,
          statusCode: response.status,
          code: 'DOCUMENT_UPLOAD_FAILED',
        });
      }

      const data = await response.json();
      this.logger.info(`Document uploaded: ${data.idDocId ?? 'unknown'}`);
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get verification steps status
   */
  async getVerificationSteps(applicantId: string): Promise<VerificationStep[]> {
    this.logger.debug(`Getting verification steps for: ${applicantId}`);

    const response = await this.request<{ steps: unknown[] }>(
      'GET',
      `/resources/applicants/${applicantId}/status`
    );

    // Transform response to VerificationStep format
    const steps: VerificationStep[] = [];
    if (response.steps && Array.isArray(response.steps)) {
      for (const step of response.steps) {
        const stepData = step as Record<string, unknown>;
        steps.push({
          stepId: (stepData.id as string) ?? '',
          stepType: (stepData.type as string) ?? '',
          status: (stepData.status as VerificationStep['status']) ?? 'NOT_STARTED',
          reviewResult: stepData.reviewResult as VerificationStep['reviewResult'],
          rejectionLabels: stepData.rejectionLabels as string[],
          completedAt: stepData.completedAt as string,
        });
      }
    }

    return steps;
  }

  // ==========================================================================
  // INSPECTION & CHECKS
  // ==========================================================================

  /**
   * Request new verification check
   */
  async requestCheck(applicantId: string, reason?: string): Promise<void> {
    this.logger.info(`Requesting check for applicant: ${applicantId}`);

    await this.request<unknown>(
      'POST',
      `/resources/applicants/${applicantId}/status/pending`,
      {
        body: reason ? { reason } : undefined,
      }
    );
  }

  /**
   * Get applicant's inspection data
   */
  async getInspection(inspectionId: string): Promise<Record<string, unknown>> {
    this.logger.debug(`Getting inspection: ${inspectionId}`);

    return await this.request<Record<string, unknown>>(
      'GET',
      `/resources/inspections/${inspectionId}`
    );
  }

  // ==========================================================================
  // AML/SANCTIONS SCREENING
  // ==========================================================================

  /**
   * Get AML check results
   */
  async getAmlCheckResults(applicantId: string): Promise<Record<string, unknown>> {
    this.logger.debug(`Getting AML check results for: ${applicantId}`);

    return await this.request<Record<string, unknown>>(
      'GET',
      `/resources/applicants/${applicantId}/amlCheck`
    );
  }

  /**
   * Start manual AML check
   */
  async startAmlCheck(applicantId: string): Promise<void> {
    this.logger.info(`Starting AML check for: ${applicantId}`);

    await this.request<unknown>(
      'POST',
      `/resources/applicants/${applicantId}/amlCheck/start`
    );
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new SumsubWebhookError(
        'Webhook secret not configured',
        'MISSING_SECRET'
      );
    }

    const expectedSignature = crypto
      .createHmac('sha1', this.webhookSecret)
      .update(payload)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      this.logger.warn('Invalid webhook signature');
    }

    return isValid;
  }

  /**
   * Parse and validate webhook payload
   */
  parseWebhookPayload(payload: string): WebhookPayload {
    const data = JSON.parse(payload);
    return WebhookPayloadSchema.parse(data);
  }

  /**
   * Verify and parse webhook
   */
  verifyAndParseWebhook(payload: string, signature: string): WebhookPayload {
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new SumsubWebhookError(
        'Invalid webhook signature',
        'INVALID_SIGNATURE'
      );
    }

    return this.parseWebhookPayload(payload);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Map tier to Sumsub level name
   */
  static getTierLevelName(tier: 'basic' | 'enhanced' | 'accredited'): VerificationLevel {
    const mapping: Record<string, VerificationLevel> = {
      basic: 'basic-kyc-level',
      enhanced: 'enhanced-kyc-level',
      accredited: 'accredited-kyc-level',
    };
    return mapping[tier];
  }

  /**
   * Check if review result is approved
   */
  static isApproved(reviewResult?: { reviewAnswer?: string }): boolean {
    return reviewResult?.reviewAnswer === 'GREEN';
  }

  /**
   * Check if review result is rejected
   */
  static isRejected(reviewResult?: { reviewAnswer?: string }): boolean {
    return reviewResult?.reviewAnswer === 'RED';
  }
}

export default SumsubClient;
