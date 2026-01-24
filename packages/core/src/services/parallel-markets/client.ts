/**
 * Parallel Markets Client
 * Accredited investor verification
 */

import crypto from 'crypto';
import {
  type ParallelMarketsClientConfig,
  type Logger,
  type CreateInvestorParams,
  type CreateAccreditationParams,
  type ListAccreditationsParams,
  type Investor,
  type AccreditationRequest,
  type AccreditationCertificate,
  type Document,
  type WebhookEvent,
  type AccreditationType,
  InvestorSchema,
  AccreditationRequestSchema,
  AccreditationCertificateSchema,
  DocumentSchema,
  WebhookEventSchema,
  ParallelMarketsApiError,
  ParallelMarketsWebhookError,
  defaultLogger,
  PARALLEL_MARKETS_BASE_URL,
} from './types';

const DEFAULT_TIMEOUT = 30000;

/**
 * Parallel Markets Client for Accredited Investor Verification
 */
export class ParallelMarketsClient {
  private readonly apiKey: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: ParallelMarketsClientConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl ?? PARALLEL_MARKETS_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.logger = config.logger ?? defaultLogger;
  }

  // ==========================================================================
  // HTTP REQUEST
  // ==========================================================================

  /**
   * Make authenticated request to Parallel Markets API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
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
        throw new ParallelMarketsApiError({
          message: data.error || data.message || `HTTP ${response.status}`,
          statusCode: response.status,
          code: data.code || 'UNKNOWN_ERROR',
          details: data.details,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof ParallelMarketsApiError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ParallelMarketsApiError({
            message: 'Request timeout',
            statusCode: 408,
            code: 'TIMEOUT',
          });
        }
        throw new ParallelMarketsApiError({
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
  // INVESTORS
  // ==========================================================================

  /**
   * Create an investor profile
   */
  async createInvestor(params: CreateInvestorParams): Promise<Investor> {
    this.logger.info(`Creating investor: ${params.email}`);

    const body: Record<string, unknown> = {
      email: params.email,
    };

    if (params.firstName) body.first_name = params.firstName;
    if (params.lastName) body.last_name = params.lastName;
    if (params.entityName) body.entity_name = params.entityName;
    if (params.entityType) body.entity_type = params.entityType;
    if (params.phone) body.phone = params.phone;
    if (params.address) body.address = params.address;

    const response = await this.request<unknown>('POST', '/investors', body);
    const validated = InvestorSchema.parse(response);
    this.logger.info(`Created investor: ${validated.id}`);
    return validated;
  }

  /**
   * Get an investor by ID
   */
  async getInvestor(investorId: string): Promise<Investor> {
    this.logger.debug(`Getting investor: ${investorId}`);

    const response = await this.request<unknown>('GET', `/investors/${investorId}`);
    return InvestorSchema.parse(response);
  }

  /**
   * Get investor by email
   */
  async getInvestorByEmail(email: string): Promise<Investor | null> {
    this.logger.debug(`Getting investor by email: ${email}`);

    try {
      const response = await this.request<{ data: unknown[] }>(
        'GET',
        `/investors?email=${encodeURIComponent(email)}`
      );
      if (response.data && response.data.length > 0) {
        return InvestorSchema.parse(response.data[0]);
      }
      return null;
    } catch (error) {
      if (error instanceof ParallelMarketsApiError && error.isNotFound()) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // ACCREDITATION
  // ==========================================================================

  /**
   * Create an accreditation verification request
   */
  async createAccreditationRequest(
    params: CreateAccreditationParams
  ): Promise<AccreditationRequest> {
    this.logger.info(`Creating accreditation request: ${params.type}`);

    const body: Record<string, unknown> = {
      type: params.type,
    };

    if (params.investorId) body.investor_id = params.investorId;
    if (params.investorEmail) body.investor_email = params.investorEmail;
    if (params.investorName) body.investor_name = params.investorName;
    if (params.entityType) body.entity_type = params.entityType;
    if (params.redirectUrl) body.redirect_url = params.redirectUrl;
    if (params.webhookUrl) body.webhook_url = params.webhookUrl;

    const response = await this.request<unknown>('POST', '/accreditations', body);
    const validated = AccreditationRequestSchema.parse(response);
    this.logger.info(`Created accreditation request: ${validated.id}`);
    return validated;
  }

  /**
   * Get accreditation request status
   */
  async getAccreditationStatus(requestId: string): Promise<AccreditationRequest> {
    this.logger.debug(`Getting accreditation status: ${requestId}`);

    const response = await this.request<unknown>('GET', `/accreditations/${requestId}`);
    return AccreditationRequestSchema.parse(response);
  }

  /**
   * Get accreditation certificate (for approved requests)
   */
  async getAccreditationCertificate(requestId: string): Promise<AccreditationCertificate> {
    this.logger.debug(`Getting accreditation certificate: ${requestId}`);

    const response = await this.request<unknown>(
      'GET',
      `/accreditations/${requestId}/certificate`
    );
    return AccreditationCertificateSchema.parse(response);
  }

  /**
   * Download accreditation certificate PDF
   */
  async downloadAccreditationCertificate(requestId: string): Promise<Buffer> {
    this.logger.info(`Downloading certificate for: ${requestId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(
        `${this.baseUrl}/accreditations/${requestId}/certificate/download`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new ParallelMarketsApiError({
          message: `Failed to download certificate: HTTP ${response.status}`,
          statusCode: response.status,
          code: 'DOWNLOAD_FAILED',
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List accreditation requests for an investor
   */
  async listAccreditations(
    params: ListAccreditationsParams = {}
  ): Promise<{ data: AccreditationRequest[]; total: number }> {
    this.logger.debug('Listing accreditations');

    const queryParams = new URLSearchParams();
    if (params.investorId) queryParams.set('investor_id', params.investorId);
    if (params.investorEmail) queryParams.set('investor_email', params.investorEmail);
    if (params.status) queryParams.set('status', params.status);
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.perPage) queryParams.set('per_page', params.perPage.toString());

    const query = queryParams.toString();
    const path = `/accreditations${query ? `?${query}` : ''}`;

    const response = await this.request<{ data: unknown[]; total: number }>('GET', path);
    return {
      data: response.data.map((r) => AccreditationRequestSchema.parse(r)),
      total: response.total,
    };
  }

  /**
   * Cancel an accreditation request
   */
  async cancelAccreditation(requestId: string): Promise<void> {
    this.logger.info(`Cancelling accreditation: ${requestId}`);

    await this.request<unknown>('DELETE', `/accreditations/${requestId}`);
  }

  // ==========================================================================
  // DOCUMENTS
  // ==========================================================================

  /**
   * Upload document for accreditation
   */
  async uploadDocument(
    requestId: string,
    params: {
      type: string;
      filename: string;
      content: Buffer;
      contentType: string;
    }
  ): Promise<Document> {
    this.logger.info(`Uploading document for: ${requestId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const formData = new FormData();
      formData.append('type', params.type);
      formData.append(
        'file',
        new Blob([params.content], { type: params.contentType }),
        params.filename
      );

      const response = await fetch(
        `${this.baseUrl}/accreditations/${requestId}/documents`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new ParallelMarketsApiError({
          message: data.error || `HTTP ${response.status}`,
          statusCode: response.status,
          code: 'UPLOAD_FAILED',
        });
      }

      return DocumentSchema.parse(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List documents for an accreditation request
   */
  async listDocuments(requestId: string): Promise<Document[]> {
    this.logger.debug(`Listing documents for: ${requestId}`);

    const response = await this.request<{ data: unknown[] }>(
      'GET',
      `/accreditations/${requestId}/documents`
    );
    return response.data.map((d) => DocumentSchema.parse(d));
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new ParallelMarketsWebhookError(
        'Webhook secret not configured',
        'MISSING_SECRET'
      );
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
      throw new ParallelMarketsWebhookError(
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
   * Check if accreditation is approved
   */
  static isApproved(request: AccreditationRequest): boolean {
    return request.status === 'approved';
  }

  /**
   * Check if accreditation is pending
   */
  static isPending(request: AccreditationRequest): boolean {
    return ['pending', 'pending_documents', 'under_review'].includes(request.status);
  }

  /**
   * Check if accreditation is expired
   */
  static isExpired(request: AccreditationRequest): boolean {
    if (request.status === 'expired') return true;
    if (request.expires_at) {
      return new Date(request.expires_at) < new Date();
    }
    return false;
  }

  /**
   * Get days until expiration
   */
  static getDaysUntilExpiration(request: AccreditationRequest): number | null {
    if (!request.expires_at) return null;
    const expiresAt = new Date(request.expires_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }
}

export default ParallelMarketsClient;
