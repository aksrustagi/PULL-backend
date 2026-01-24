/**
 * Checkr Background Check Client
 * Background checks for enhanced KYC verification
 */

import crypto from 'crypto';
import {
  type CheckrClientConfig,
  type Logger,
  type CreateCandidateParams,
  type UpdateCandidateParams,
  type CreateReportParams,
  type ListReportsParams,
  type Candidate,
  type Report,
  type Screening,
  type SSNTrace,
  type GlobalWatchlist,
  type WebhookEvent,
  CandidateSchema,
  ReportSchema,
  SSNTraceSchema,
  GlobalWatchlistSchema,
  WebhookEventSchema,
  CheckrApiError,
  CheckrWebhookError,
  defaultLogger,
  CHECKR_BASE_URL,
} from './types';

const DEFAULT_TIMEOUT = 30000;

/**
 * Checkr Background Check Client
 */
export class CheckrClient {
  private readonly apiKey: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: CheckrClientConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl ?? CHECKR_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.logger = config.logger ?? defaultLogger;
  }

  // ==========================================================================
  // HTTP REQUEST
  // ==========================================================================

  /**
   * Make authenticated request to Checkr API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Authorization': `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    try {
      this.logger.debug(`${method} ${path}`);

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new CheckrApiError({
          message: data.error || data.message || `HTTP ${response.status}`,
          statusCode: response.status,
          code: data.code || 'UNKNOWN_ERROR',
          errors: data.errors,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof CheckrApiError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new CheckrApiError({
            message: 'Request timeout',
            statusCode: 408,
            code: 'TIMEOUT',
          });
        }
        throw new CheckrApiError({
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
  // CANDIDATES
  // ==========================================================================

  /**
   * Create a new candidate
   */
  async createCandidate(params: CreateCandidateParams): Promise<Candidate> {
    this.logger.info(`Creating candidate: ${params.email}`);

    const body: Record<string, unknown> = {
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
    };

    if (params.middleName) body.middle_name = params.middleName;
    if (params.noMiddleName !== undefined) body.no_middle_name = params.noMiddleName;
    if (params.phone) body.phone = params.phone;
    if (params.zipcode) body.zipcode = params.zipcode;
    if (params.dob) body.dob = params.dob;
    if (params.ssn) body.ssn = params.ssn;
    if (params.driverLicenseNumber) body.driver_license_number = params.driverLicenseNumber;
    if (params.driverLicenseState) body.driver_license_state = params.driverLicenseState;
    if (params.customId) body.custom_id = params.customId;
    if (params.copyRequested !== undefined) body.copy_requested = params.copyRequested;
    if (params.geoIds) body.geo_ids = params.geoIds;
    if (params.metadata) body.metadata = params.metadata;

    const response = await this.request<unknown>('POST', '/v1/candidates', body);
    const validated = CandidateSchema.parse(response);
    this.logger.info(`Created candidate: ${validated.id}`);
    return validated;
  }

  /**
   * Get a candidate by ID
   */
  async getCandidate(candidateId: string): Promise<Candidate> {
    this.logger.debug(`Getting candidate: ${candidateId}`);

    const response = await this.request<unknown>('GET', `/v1/candidates/${candidateId}`);
    return CandidateSchema.parse(response);
  }

  /**
   * Update a candidate
   */
  async updateCandidate(
    candidateId: string,
    params: UpdateCandidateParams
  ): Promise<Candidate> {
    this.logger.info(`Updating candidate: ${candidateId}`);

    const body: Record<string, unknown> = {};
    if (params.firstName) body.first_name = params.firstName;
    if (params.lastName) body.last_name = params.lastName;
    if (params.middleName) body.middle_name = params.middleName;
    if (params.noMiddleName !== undefined) body.no_middle_name = params.noMiddleName;
    if (params.email) body.email = params.email;
    if (params.phone) body.phone = params.phone;
    if (params.zipcode) body.zipcode = params.zipcode;
    if (params.dob) body.dob = params.dob;
    if (params.ssn) body.ssn = params.ssn;
    if (params.driverLicenseNumber) body.driver_license_number = params.driverLicenseNumber;
    if (params.driverLicenseState) body.driver_license_state = params.driverLicenseState;
    if (params.copyRequested !== undefined) body.copy_requested = params.copyRequested;
    if (params.geoIds) body.geo_ids = params.geoIds;
    if (params.metadata) body.metadata = params.metadata;

    const response = await this.request<unknown>(
      'PATCH',
      `/v1/candidates/${candidateId}`,
      body
    );
    return CandidateSchema.parse(response);
  }

  /**
   * List candidates
   */
  async listCandidates(params?: {
    page?: number;
    perPage?: number;
    email?: string;
  }): Promise<{ data: Candidate[]; count: number }> {
    this.logger.debug('Listing candidates');

    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.perPage) queryParams.set('per_page', params.perPage.toString());
    if (params?.email) queryParams.set('email', params.email);

    const query = queryParams.toString();
    const path = `/v1/candidates${query ? `?${query}` : ''}`;

    const response = await this.request<{ data: unknown[]; count: number }>('GET', path);
    return {
      data: response.data.map((c) => CandidateSchema.parse(c)),
      count: response.count,
    };
  }

  // ==========================================================================
  // REPORTS
  // ==========================================================================

  /**
   * Create a new background check report
   */
  async createReport(params: CreateReportParams): Promise<Report> {
    this.logger.info(`Creating report for candidate: ${params.candidateId}, package: ${params.package}`);

    const body: Record<string, unknown> = {
      candidate_id: params.candidateId,
      package: params.package,
    };

    if (params.nodeId) body.node_id = params.nodeId;
    if (params.geoIds) body.geo_ids = params.geoIds;
    if (params.tags) body.tags = params.tags;

    const response = await this.request<unknown>('POST', '/v1/reports', body);
    const validated = ReportSchema.parse(response);
    this.logger.info(`Created report: ${validated.id}`);
    return validated;
  }

  /**
   * Get a report by ID
   */
  async getReport(reportId: string): Promise<Report> {
    this.logger.debug(`Getting report: ${reportId}`);

    const response = await this.request<unknown>('GET', `/v1/reports/${reportId}`);
    return ReportSchema.parse(response);
  }

  /**
   * List reports
   */
  async listReports(params?: ListReportsParams): Promise<{ data: Report[]; count: number }> {
    this.logger.debug('Listing reports');

    const queryParams = new URLSearchParams();
    if (params?.candidateId) queryParams.set('candidate_id', params.candidateId);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.perPage) queryParams.set('per_page', params.perPage.toString());

    const query = queryParams.toString();
    const path = `/v1/reports${query ? `?${query}` : ''}`;

    const response = await this.request<{ data: unknown[]; count: number }>('GET', path);
    return {
      data: response.data.map((r) => ReportSchema.parse(r)),
      count: response.count,
    };
  }

  /**
   * Resume a suspended report
   */
  async resumeReport(reportId: string): Promise<Report> {
    this.logger.info(`Resuming report: ${reportId}`);

    const response = await this.request<unknown>('POST', `/v1/reports/${reportId}/resume`);
    return ReportSchema.parse(response);
  }

  // ==========================================================================
  // SCREENINGS
  // ==========================================================================

  /**
   * Get a screening by ID
   */
  async getScreening(screeningId: string, type: string): Promise<Screening> {
    this.logger.debug(`Getting screening: ${screeningId}, type: ${type}`);

    const response = await this.request<unknown>('GET', `/v1/${type}s/${screeningId}`);
    return response as Screening;
  }

  /**
   * Get SSN trace by ID
   */
  async getSSNTrace(ssnTraceId: string): Promise<SSNTrace> {
    this.logger.debug(`Getting SSN trace: ${ssnTraceId}`);

    const response = await this.request<unknown>('GET', `/v1/ssn_traces/${ssnTraceId}`);
    return SSNTraceSchema.parse(response);
  }

  /**
   * Get global watchlist search by ID
   */
  async getGlobalWatchlistSearch(searchId: string): Promise<GlobalWatchlist> {
    this.logger.debug(`Getting global watchlist search: ${searchId}`);

    const response = await this.request<unknown>(
      'GET',
      `/v1/global_watchlist_searches/${searchId}`
    );
    return GlobalWatchlistSchema.parse(response);
  }

  // ==========================================================================
  // ADVERSE ACTIONS
  // ==========================================================================

  /**
   * Create a pre-adverse action
   */
  async createPreAdverseAction(
    reportId: string,
    params: {
      postNoticeScheduledAt?: string;
      adverseItems: Array<{ text: string }>;
    }
  ): Promise<unknown> {
    this.logger.info(`Creating pre-adverse action for report: ${reportId}`);

    const response = await this.request<unknown>(
      'POST',
      `/v1/reports/${reportId}/pre_adverse_actions`,
      {
        post_notice_scheduled_at: params.postNoticeScheduledAt,
        adverse_items: params.adverseItems,
      }
    );
    return response;
  }

  /**
   * Create an adverse action (final)
   */
  async createAdverseAction(reportId: string): Promise<unknown> {
    this.logger.info(`Creating adverse action for report: ${reportId}`);

    const response = await this.request<unknown>(
      'POST',
      `/v1/reports/${reportId}/adverse_actions`
    );
    return response;
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new CheckrWebhookError('Webhook secret not configured', 'MISSING_SECRET');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
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
   * Parse webhook payload
   */
  parseWebhookPayload(payload: string): WebhookEvent {
    const data = JSON.parse(payload);
    return WebhookEventSchema.parse(data);
  }

  /**
   * Verify and parse webhook
   */
  verifyAndParseWebhook(payload: string, signature: string): WebhookEvent {
    if (!this.verifyWebhook(payload, signature)) {
      throw new CheckrWebhookError('Invalid webhook signature', 'INVALID_SIGNATURE');
    }

    return this.parseWebhookPayload(payload);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Check if report is complete
   */
  static isReportComplete(report: Report): boolean {
    return report.status === 'complete';
  }

  /**
   * Check if report passed (clear)
   */
  static isReportClear(report: Report): boolean {
    return report.result === 'clear';
  }

  /**
   * Check if report needs review
   */
  static needsReview(report: Report): boolean {
    return report.result === 'consider';
  }

  /**
   * Get human-readable status
   */
  static getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      pending: 'Background check in progress',
      complete: 'Background check complete',
      suspended: 'Additional information required',
      dispute: 'Under dispute review',
    };
    return descriptions[status] || status;
  }
}

export default CheckrClient;
