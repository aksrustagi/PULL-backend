/**
 * Sanctions.io Client
 * Sanctions/PEP/watchlist screening
 */

import {
  type SanctionsClientConfig,
  type Logger,
  type ScreenIndividualParams,
  type ScreenEntityParams,
  type BatchScreeningEntry,
  type AddToMonitoringParams,
  type ScreeningResult,
  type BatchScreeningResult,
  type MonitoringEntity,
  type MonitoringAlert,
  type DatasetType,
  ScreeningResultSchema,
  BatchScreeningResultSchema,
  MonitoringEntitySchema,
  MonitoringAlertSchema,
  SanctionsApiError,
  defaultLogger,
  SANCTIONS_IO_BASE_URL,
  RISK_THRESHOLDS,
} from './types';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MATCH_THRESHOLD = 75;

/**
 * Sanctions.io Client for sanctions/PEP/watchlist screening
 */
export class SanctionsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: SanctionsClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? SANCTIONS_IO_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.logger = config.logger ?? defaultLogger;
  }

  // ==========================================================================
  // HTTP REQUEST
  // ==========================================================================

  /**
   * Make authenticated request to Sanctions.io API
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
        throw new SanctionsApiError({
          message: data.error || data.message || `HTTP ${response.status}`,
          statusCode: response.status,
          code: data.code || 'UNKNOWN_ERROR',
          details: data.details,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof SanctionsApiError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new SanctionsApiError({
            message: 'Request timeout',
            statusCode: 408,
            code: 'TIMEOUT',
          });
        }
        throw new SanctionsApiError({
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
  // SCREENING
  // ==========================================================================

  /**
   * Screen an individual against sanctions lists
   */
  async screenIndividual(params: ScreenIndividualParams): Promise<ScreeningResult> {
    this.logger.info(`Screening individual: ${params.name}`);

    const datasets = params.datasets ?? ['sanctions', 'pep'];

    const body: Record<string, unknown> = {
      type: 'individual',
      name: params.name,
      datasets,
      match_threshold: params.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    };

    if (params.dateOfBirth) body.date_of_birth = params.dateOfBirth;
    if (params.country) body.country = params.country;
    if (params.nationality) body.nationality = params.nationality;
    if (params.identifiers) body.identifiers = params.identifiers;

    const response = await this.request<unknown>('POST', '/screen', body);
    const result = ScreeningResultSchema.parse(response);

    this.logger.info(`Screening complete: ${result.match ? 'MATCH FOUND' : 'No match'}, risk: ${result.risk_level}`);
    return result;
  }

  /**
   * Screen an entity (company) against sanctions lists
   */
  async screenEntity(params: ScreenEntityParams): Promise<ScreeningResult> {
    this.logger.info(`Screening entity: ${params.name}`);

    const datasets = params.datasets ?? ['sanctions'];

    const body: Record<string, unknown> = {
      type: 'entity',
      name: params.name,
      datasets,
      match_threshold: params.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    };

    if (params.country) body.country = params.country;
    if (params.registrationNumber) {
      body.identifiers = [{ type: 'registration_number', value: params.registrationNumber }];
    }

    const response = await this.request<unknown>('POST', '/screen', body);
    const result = ScreeningResultSchema.parse(response);

    this.logger.info(`Screening complete: ${result.match ? 'MATCH FOUND' : 'No match'}, risk: ${result.risk_level}`);
    return result;
  }

  /**
   * Batch screen multiple entries
   */
  async batchScreen(
    entries: BatchScreeningEntry[],
    datasets: DatasetType[] = ['sanctions', 'pep']
  ): Promise<BatchScreeningResult> {
    this.logger.info(`Batch screening ${entries.length} entries`);

    const body = {
      entries: entries.map((entry) => ({
        external_id: entry.externalId,
        type: entry.type,
        name: entry.name,
        date_of_birth: entry.dateOfBirth,
        country: entry.country,
        identifiers: entry.identifiers,
      })),
      datasets,
    };

    const response = await this.request<unknown>('POST', '/batch/screen', body);
    const result = BatchScreeningResultSchema.parse(response);

    this.logger.info(`Batch screening started: ${result.id}`);
    return result;
  }

  /**
   * Get batch screening result
   */
  async getBatchScreeningResult(batchId: string): Promise<BatchScreeningResult> {
    this.logger.debug(`Getting batch screening result: ${batchId}`);

    const response = await this.request<unknown>('GET', `/batch/${batchId}`);
    return BatchScreeningResultSchema.parse(response);
  }

  /**
   * Get screening result by ID
   */
  async getScreeningResult(screeningId: string): Promise<ScreeningResult> {
    this.logger.debug(`Getting screening result: ${screeningId}`);

    const response = await this.request<unknown>('GET', `/screenings/${screeningId}`);
    return ScreeningResultSchema.parse(response);
  }

  // ==========================================================================
  // ONGOING MONITORING
  // ==========================================================================

  /**
   * Add entity to ongoing monitoring
   */
  async addToMonitoring(params: AddToMonitoringParams): Promise<MonitoringEntity> {
    this.logger.info(`Adding to monitoring: ${params.name}`);

    const body: Record<string, unknown> = {
      name: params.name,
      type: params.type,
      datasets: params.datasets ?? ['sanctions', 'pep'],
      screening_frequency: params.screeningFrequency ?? 'daily',
    };

    if (params.dateOfBirth) body.date_of_birth = params.dateOfBirth;
    if (params.country) body.country = params.country;
    if (params.identifiers) body.identifiers = params.identifiers;
    if (params.externalId) body.external_id = params.externalId;

    const response = await this.request<unknown>('POST', '/monitoring', body);
    const entity = MonitoringEntitySchema.parse(response);

    this.logger.info(`Added to monitoring: ${entity.id}`);
    return entity;
  }

  /**
   * Get monitoring entity by ID
   */
  async getMonitoringEntity(entityId: string): Promise<MonitoringEntity> {
    this.logger.debug(`Getting monitoring entity: ${entityId}`);

    const response = await this.request<unknown>('GET', `/monitoring/${entityId}`);
    return MonitoringEntitySchema.parse(response);
  }

  /**
   * Get monitoring entity by external ID
   */
  async getMonitoringEntityByExternalId(
    externalId: string
  ): Promise<MonitoringEntity | null> {
    this.logger.debug(`Getting monitoring entity by external ID: ${externalId}`);

    try {
      const response = await this.request<{ data: unknown[] }>(
        'GET',
        `/monitoring?external_id=${encodeURIComponent(externalId)}`
      );
      if (response.data && response.data.length > 0) {
        return MonitoringEntitySchema.parse(response.data[0]);
      }
      return null;
    } catch (error) {
      if (error instanceof SanctionsApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update monitoring entity
   */
  async updateMonitoringEntity(
    entityId: string,
    params: Partial<AddToMonitoringParams>
  ): Promise<MonitoringEntity> {
    this.logger.info(`Updating monitoring entity: ${entityId}`);

    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.type) body.type = params.type;
    if (params.dateOfBirth) body.date_of_birth = params.dateOfBirth;
    if (params.country) body.country = params.country;
    if (params.identifiers) body.identifiers = params.identifiers;
    if (params.datasets) body.datasets = params.datasets;
    if (params.screeningFrequency) body.screening_frequency = params.screeningFrequency;

    const response = await this.request<unknown>('PATCH', `/monitoring/${entityId}`, body);
    return MonitoringEntitySchema.parse(response);
  }

  /**
   * Remove entity from monitoring
   */
  async removeFromMonitoring(entityId: string): Promise<void> {
    this.logger.info(`Removing from monitoring: ${entityId}`);
    await this.request<unknown>('DELETE', `/monitoring/${entityId}`);
  }

  /**
   * Pause monitoring for an entity
   */
  async pauseMonitoring(entityId: string): Promise<MonitoringEntity> {
    this.logger.info(`Pausing monitoring: ${entityId}`);
    const response = await this.request<unknown>(
      'POST',
      `/monitoring/${entityId}/pause`
    );
    return MonitoringEntitySchema.parse(response);
  }

  /**
   * Resume monitoring for an entity
   */
  async resumeMonitoring(entityId: string): Promise<MonitoringEntity> {
    this.logger.info(`Resuming monitoring: ${entityId}`);
    const response = await this.request<unknown>(
      'POST',
      `/monitoring/${entityId}/resume`
    );
    return MonitoringEntitySchema.parse(response);
  }

  /**
   * List monitoring entities
   */
  async listMonitoringEntities(params?: {
    status?: 'active' | 'paused' | 'removed';
    page?: number;
    perPage?: number;
  }): Promise<{ data: MonitoringEntity[]; total: number }> {
    this.logger.debug('Listing monitoring entities');

    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.perPage) queryParams.set('per_page', params.perPage.toString());

    const query = queryParams.toString();
    const path = `/monitoring${query ? `?${query}` : ''}`;

    const response = await this.request<{ data: unknown[]; total: number }>('GET', path);
    return {
      data: response.data.map((e) => MonitoringEntitySchema.parse(e)),
      total: response.total,
    };
  }

  // ==========================================================================
  // ALERTS
  // ==========================================================================

  /**
   * Get monitoring alerts for an entity
   */
  async getMonitoringAlerts(
    entityId: string,
    params?: {
      acknowledged?: boolean;
      page?: number;
      perPage?: number;
    }
  ): Promise<{ data: MonitoringAlert[]; total: number }> {
    this.logger.debug(`Getting monitoring alerts for: ${entityId}`);

    const queryParams = new URLSearchParams();
    if (params?.acknowledged !== undefined) {
      queryParams.set('acknowledged', params.acknowledged.toString());
    }
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.perPage) queryParams.set('per_page', params.perPage.toString());

    const query = queryParams.toString();
    const path = `/monitoring/${entityId}/alerts${query ? `?${query}` : ''}`;

    const response = await this.request<{ data: unknown[]; total: number }>('GET', path);
    return {
      data: response.data.map((a) => MonitoringAlertSchema.parse(a)),
      total: response.total,
    };
  }

  /**
   * Acknowledge a monitoring alert
   */
  async acknowledgeAlert(alertId: string): Promise<MonitoringAlert> {
    this.logger.info(`Acknowledging alert: ${alertId}`);

    const response = await this.request<unknown>(
      'POST',
      `/alerts/${alertId}/acknowledge`
    );
    return MonitoringAlertSchema.parse(response);
  }

  /**
   * Resolve a monitoring alert
   */
  async resolveAlert(
    alertId: string,
    resolution?: { note?: string; falsePositive?: boolean }
  ): Promise<MonitoringAlert> {
    this.logger.info(`Resolving alert: ${alertId}`);

    const body: Record<string, unknown> = {};
    if (resolution?.note) body.resolution_note = resolution.note;
    if (resolution?.falsePositive !== undefined) {
      body.false_positive = resolution.falsePositive;
    }

    const response = await this.request<unknown>(
      'POST',
      `/alerts/${alertId}/resolve`,
      body
    );
    return MonitoringAlertSchema.parse(response);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Calculate risk level from score
   */
  static getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= RISK_THRESHOLDS.critical) return 'critical';
    if (score >= RISK_THRESHOLDS.high) return 'high';
    if (score >= RISK_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Check if screening has matches
   */
  static hasMatches(result: ScreeningResult): boolean {
    return result.match && result.hits.length > 0;
  }

  /**
   * Check if screening has high-risk matches
   */
  static hasHighRiskMatches(result: ScreeningResult): boolean {
    return result.risk_level === 'high' || result.risk_level === 'critical';
  }

  /**
   * Get exact matches from screening result
   */
  static getExactMatches(result: ScreeningResult) {
    return result.hits.filter((hit) => hit.match_strength === 'exact');
  }

  /**
   * Get strong matches from screening result
   */
  static getStrongMatches(result: ScreeningResult) {
    return result.hits.filter(
      (hit) => hit.match_strength === 'exact' || hit.match_strength === 'strong'
    );
  }

  /**
   * Filter hits by list type
   */
  static getHitsByList(result: ScreeningResult, list: string) {
    return result.hits.filter((hit) => hit.list === list);
  }
}

export default SanctionsClient;
