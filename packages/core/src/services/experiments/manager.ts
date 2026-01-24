/**
 * Experiment Manager
 * A/B testing, variant assignment, and statistical analysis
 */

import { createHash } from 'crypto';
import { ConvexHttpClient } from 'convex/browser';
import {
  Experiment,
  Variant,
  ExperimentAssignment,
  ExperimentEvent,
  ExperimentResults,
  VariantResults,
  MetricResult,
  ConfidenceInterval,
  TargetAudience,
  ExperimentManagerConfig,
  DEFAULT_EXPERIMENT_CONFIG,
} from './types';

// ============================================================================
// Experiment Manager Class
// ============================================================================

export class ExperimentManager {
  private config: ExperimentManagerConfig;
  private convex: ConvexHttpClient;
  private experimentCache: Map<string, Experiment> = new Map();
  private assignmentCache: Map<string, ExperimentAssignment> = new Map();
  private cacheExpiry: Map<string, number> = new Map();

  constructor(convex: ConvexHttpClient, config: Partial<ExperimentManagerConfig> = {}) {
    this.config = { ...DEFAULT_EXPERIMENT_CONFIG, ...config };
    this.convex = convex;
  }

  // ============================================================================
  // Variant Assignment
  // ============================================================================

  /**
   * Get the variant for a user in an experiment (deterministic)
   * Returns null if user is not eligible or experiment is not running
   */
  async getVariant(experimentId: string, userId: string): Promise<Variant | null> {
    const cacheKey = `${experimentId}:${userId}`;

    // Check cache
    const cachedAssignment = this.getCachedAssignment(cacheKey);
    if (cachedAssignment) {
      const experiment = await this.getExperiment(experimentId);
      return experiment?.variants.find((v) => v.id === cachedAssignment.variantId) || null;
    }

    // Get experiment
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      this.log('Experiment not found', { experimentId });
      return null;
    }

    // Check if experiment is running
    if (experiment.status !== 'running') {
      this.log('Experiment not running', { experimentId, status: experiment.status });
      return null;
    }

    // Check if user is eligible
    const eligible = await this.isUserEligible(userId, experiment.targetAudience);
    if (!eligible) {
      this.log('User not eligible', { experimentId, userId });
      return null;
    }

    // Check existing assignment
    const existingAssignment = await this.getExistingAssignment(experimentId, userId);
    if (existingAssignment) {
      this.cacheAssignment(cacheKey, existingAssignment);
      return experiment.variants.find((v) => v.id === existingAssignment.variantId) || null;
    }

    // Assign variant deterministically
    const variant = this.assignVariant(experiment, userId);

    // Store assignment
    const assignment: ExperimentAssignment = {
      userId,
      experimentId,
      variantId: variant.id,
      assignedAt: new Date(),
    };

    await this.saveAssignment(assignment);
    this.cacheAssignment(cacheKey, assignment);

    this.log('Variant assigned', { experimentId, userId, variantId: variant.id });
    return variant;
  }

  /**
   * Get variant config value for a user
   */
  async getVariantConfig<T>(
    experimentId: string,
    userId: string,
    key: string,
    defaultValue: T
  ): Promise<T> {
    const variant = await this.getVariant(experimentId, userId);
    if (!variant) {
      return defaultValue;
    }

    return (variant.config[key] as T) ?? defaultValue;
  }

  /**
   * Check if user is in a specific variant
   */
  async isInVariant(experimentId: string, userId: string, variantId: string): Promise<boolean> {
    const variant = await this.getVariant(experimentId, userId);
    return variant?.id === variantId;
  }

  /**
   * Deterministically assign a variant based on user ID
   */
  private assignVariant(experiment: Experiment, userId: string): Variant {
    // Create deterministic hash from userId + experimentId
    const hash = createHash('md5')
      .update(`${this.config.hashSalt}:${experiment.id}:${userId}`)
      .digest('hex');

    // Convert first 8 hex chars to number (0-100)
    const hashValue = (parseInt(hash.substring(0, 8), 16) % 10000) / 100;

    // Find variant based on cumulative weights
    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (hashValue < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return experiment.variants[experiment.variants.length - 1];
  }

  // ============================================================================
  // Event Tracking
  // ============================================================================

  /**
   * Track that a user was exposed to an experiment variant
   */
  async trackExposure(experimentId: string, variantId: string, userId: string): Promise<void> {
    const event: ExperimentEvent = {
      userId,
      experimentId,
      variantId,
      eventType: 'exposure',
      timestamp: new Date(),
    };

    await this.saveEvent(event);
    this.log('Exposure tracked', { experimentId, variantId, userId });
  }

  /**
   * Track a conversion event for an experiment
   */
  async trackConversion(
    experimentId: string,
    userId: string,
    eventName?: string,
    value?: number
  ): Promise<void> {
    // Get user's assignment
    const assignment = await this.getExistingAssignment(experimentId, userId);
    if (!assignment) {
      this.log('No assignment found for conversion', { experimentId, userId });
      return;
    }

    const event: ExperimentEvent = {
      userId,
      experimentId,
      variantId: assignment.variantId,
      eventType: 'conversion',
      eventName,
      value,
      timestamp: new Date(),
    };

    await this.saveEvent(event);
    this.log('Conversion tracked', { experimentId, userId, eventName, value });
  }

  // ============================================================================
  // Experiment Management
  // ============================================================================

  /**
   * Create a new experiment
   */
  async createExperiment(experiment: Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // Validate variant weights sum to 100
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error(`Variant weights must sum to 100, got ${totalWeight}`);
    }

    // Ensure exactly one control variant
    const controls = experiment.variants.filter((v) => v.isControl);
    if (controls.length !== 1) {
      throw new Error('Experiment must have exactly one control variant');
    }

    const id = await this.convex.mutation('experiments:create' as any, {
      ...experiment,
      startDate: experiment.startDate.getTime(),
      endDate: experiment.endDate?.getTime(),
    });

    this.log('Experiment created', { id, name: experiment.name });
    return id;
  }

  /**
   * Update an experiment
   */
  async updateExperiment(id: string, updates: Partial<Experiment>): Promise<void> {
    // Don't allow changing variants if experiment is running
    const experiment = await this.getExperiment(id);
    if (experiment?.status === 'running' && updates.variants) {
      throw new Error('Cannot change variants while experiment is running');
    }

    await this.convex.mutation('experiments:update' as any, {
      id,
      ...updates,
      startDate: updates.startDate?.getTime(),
      endDate: updates.endDate?.getTime(),
    });

    // Clear cache
    this.experimentCache.delete(id);
    this.log('Experiment updated', { id });
  }

  /**
   * Start an experiment
   */
  async startExperiment(id: string): Promise<void> {
    await this.updateExperiment(id, {
      status: 'running',
      startDate: new Date(),
    });
    this.log('Experiment started', { id });
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(id: string): Promise<void> {
    await this.updateExperiment(id, { status: 'paused' });
    this.log('Experiment paused', { id });
  }

  /**
   * Complete an experiment
   */
  async completeExperiment(id: string, winnerVariantId?: string): Promise<void> {
    await this.updateExperiment(id, {
      status: 'completed',
      endDate: new Date(),
    });

    if (winnerVariantId) {
      await this.convex.mutation('experiments:setWinner' as any, {
        id,
        winnerVariantId,
      });
    }

    this.log('Experiment completed', { id, winnerVariantId });
  }

  // ============================================================================
  // Results & Analysis
  // ============================================================================

  /**
   * Get experiment results with statistical analysis
   */
  async getResults(experimentId: string): Promise<ExperimentResults> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Get all events for this experiment
    const events = await this.convex.query('experimentEvents:getByExperiment' as any, {
      experimentId,
    });

    // Get control variant
    const controlVariant = experiment.variants.find((v) => v.isControl);
    if (!controlVariant) {
      throw new Error('No control variant found');
    }

    // Calculate results for each variant
    const variantResults: VariantResults[] = await Promise.all(
      experiment.variants.map((variant) =>
        this.calculateVariantResults(variant, events, controlVariant, experiment)
      )
    );

    // Find winner (if statistically significant)
    const significantVariants = variantResults
      .filter((r) => !r.isControl && r.pValue !== undefined && r.pValue < 1 - this.config.defaultConfidenceLevel)
      .sort((a, b) => (b.liftVsControl || 0) - (a.liftVsControl || 0));

    const winner = significantVariants.length > 0 && (significantVariants[0].liftVsControl || 0) > 0
      ? significantVariants[0].variantId
      : undefined;

    // Calculate overall statistical significance
    const maxSignificance = variantResults
      .filter((r) => !r.isControl && r.pValue !== undefined)
      .reduce((max, r) => Math.max(max, 1 - (r.pValue || 1)), 0);

    // Determine recommended action
    const sampleSize = variantResults.reduce((sum, r) => sum + r.exposures, 0);
    const durationDays = Math.ceil(
      (Date.now() - experiment.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let recommendedAction: 'continue' | 'stop_winner' | 'stop_loser' | 'inconclusive';
    if (sampleSize < (experiment.minimumSampleSize || 0)) {
      recommendedAction = 'continue';
    } else if (winner) {
      recommendedAction = 'stop_winner';
    } else if (maxSignificance > this.config.defaultConfidenceLevel) {
      recommendedAction = 'stop_loser';
    } else {
      recommendedAction = 'inconclusive';
    }

    return {
      experimentId,
      startDate: experiment.startDate,
      endDate: experiment.endDate,
      variants: variantResults,
      winner,
      statisticalSignificance: maxSignificance,
      confidence: this.config.defaultConfidenceLevel,
      recommendedAction,
      sampleSize,
      durationDays,
    };
  }

  /**
   * Calculate results for a single variant
   */
  private async calculateVariantResults(
    variant: Variant,
    events: ExperimentEvent[],
    controlVariant: Variant,
    experiment: Experiment
  ): Promise<VariantResults> {
    const variantEvents = events.filter((e) => e.variantId === variant.id);
    const exposures = variantEvents.filter((e) => e.eventType === 'exposure').length;
    const conversions = variantEvents.filter((e) => e.eventType === 'conversion').length;
    const conversionRate = exposures > 0 ? conversions / exposures : 0;

    const revenue = variantEvents
      .filter((e) => e.eventType === 'conversion' && e.value !== undefined)
      .reduce((sum, e) => sum + (e.value || 0), 0);
    const revenuePerUser = exposures > 0 ? revenue / exposures : 0;

    // Calculate metrics
    const metrics: MetricResult[] = experiment.metrics.map((metric) => {
      const metricEvents = variantEvents.filter(
        (e) => e.eventType === 'conversion' && e.eventName === metric.eventName
      );

      let value: number;
      switch (metric.type) {
        case 'conversion':
          value = exposures > 0 ? metricEvents.length / exposures : 0;
          break;
        case 'count':
          value = metricEvents.length;
          break;
        case 'revenue':
          value = metricEvents.reduce((sum, e) => sum + (e.value || 0), 0);
          break;
        case 'duration':
          const durations = metricEvents.map((e) => e.value || 0);
          value = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
          break;
        default:
          value = 0;
      }

      return {
        name: metric.name,
        value,
        sampleSize: exposures,
        confidenceInterval: this.calculateConfidenceInterval(value, exposures),
        isSignificant: false, // Calculated below
      };
    });

    // Calculate confidence interval for conversion rate
    const confidence = this.calculateConfidenceInterval(conversionRate, exposures);

    // Calculate p-value and lift vs control (if not control)
    let pValue: number | undefined;
    let liftVsControl: number | undefined;

    if (!variant.isControl) {
      const controlEvents = events.filter((e) => e.variantId === controlVariant.id);
      const controlExposures = controlEvents.filter((e) => e.eventType === 'exposure').length;
      const controlConversions = controlEvents.filter((e) => e.eventType === 'conversion').length;
      const controlRate = controlExposures > 0 ? controlConversions / controlExposures : 0;

      pValue = this.calculatePValue(
        conversionRate,
        exposures,
        controlRate,
        controlExposures
      );

      liftVsControl = controlRate > 0 ? (conversionRate - controlRate) / controlRate : 0;

      // Update metric significance
      metrics.forEach((m) => {
        m.isSignificant = pValue !== undefined && pValue < 1 - this.config.defaultConfidenceLevel;
      });
    }

    return {
      variantId: variant.id,
      variantName: variant.name,
      isControl: variant.isControl,
      exposures,
      conversions,
      conversionRate,
      revenue,
      revenuePerUser,
      metrics,
      confidence,
      pValue,
      liftVsControl,
    };
  }

  /**
   * Calculate confidence interval using Wilson score
   */
  private calculateConfidenceInterval(rate: number, n: number): ConfidenceInterval {
    const level = this.config.defaultConfidenceLevel;
    const z = this.getZScore(level);

    if (n === 0) {
      return { lower: 0, upper: 0, level };
    }

    // Wilson score interval
    const denominator = 1 + (z * z) / n;
    const center = rate + (z * z) / (2 * n);
    const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * n)) / n);

    return {
      lower: Math.max(0, (center - margin) / denominator),
      upper: Math.min(1, (center + margin) / denominator),
      level,
    };
  }

  /**
   * Calculate p-value using two-proportion z-test
   */
  private calculatePValue(
    rate1: number,
    n1: number,
    rate2: number,
    n2: number
  ): number {
    if (n1 === 0 || n2 === 0) {
      return 1;
    }

    // Pooled proportion
    const pooled = (rate1 * n1 + rate2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));

    if (se === 0) {
      return rate1 === rate2 ? 1 : 0;
    }

    // Z-score
    const z = Math.abs(rate1 - rate2) / se;

    // Two-tailed p-value (approximation using error function)
    return 2 * (1 - this.normalCDF(z));
  }

  /**
   * Get z-score for confidence level
   */
  private getZScore(confidence: number): number {
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };
    return zScores[confidence] || 1.96;
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  // ============================================================================
  // Eligibility
  // ============================================================================

  /**
   * Check if a user is eligible for an experiment
   */
  private async isUserEligible(userId: string, audience?: TargetAudience): Promise<boolean> {
    if (!audience) {
      return true;
    }

    // Check exclude list
    if (audience.excludeUserIds?.includes(userId)) {
      return false;
    }

    // Check include list (overrides other checks)
    if (audience.includeUserIds?.includes(userId)) {
      return true;
    }

    // Check percentage
    if (audience.percentOfUsers !== undefined && audience.percentOfUsers < 100) {
      const hash = createHash('md5')
        .update(`${this.config.hashSalt}:eligibility:${userId}`)
        .digest('hex');
      const hashValue = (parseInt(hash.substring(0, 8), 16) % 10000) / 100;

      if (hashValue >= audience.percentOfUsers) {
        return false;
      }
    }

    // Get user data for other checks
    const user = await this.convex.query('users:getById' as any, { id: userId });
    if (!user) {
      return false;
    }

    // Check tiers
    if (audience.tiers?.length && !audience.tiers.includes(user.kycTier || '')) {
      return false;
    }

    // Check cohorts (simplified - you may want more complex cohort logic)
    if (audience.cohorts?.length) {
      const cohort = this.getUserCohort(user);
      if (!audience.cohorts.includes(cohort)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Determine user cohort based on signup date and behavior
   */
  private getUserCohort(user: any): string {
    const daysSinceSignup = Math.floor(
      (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceSignup <= 7) {
      return 'new_users';
    } else if (daysSinceSignup <= 30) {
      return 'early_users';
    } else if (daysSinceSignup <= 90) {
      return 'established_users';
    } else {
      return 'veteran_users';
    }
  }

  // ============================================================================
  // Data Access
  // ============================================================================

  /**
   * Get experiment by ID
   */
  private async getExperiment(id: string): Promise<Experiment | null> {
    // Check cache
    const cached = this.experimentCache.get(id);
    if (cached) {
      return cached;
    }

    const experiment = await this.convex.query('experiments:getById' as any, { id });
    if (experiment) {
      this.experimentCache.set(id, experiment);
    }

    return experiment;
  }

  /**
   * Get existing assignment
   */
  private async getExistingAssignment(
    experimentId: string,
    userId: string
  ): Promise<ExperimentAssignment | null> {
    return await this.convex.query('experimentAssignments:getByUserExperiment' as any, {
      userId,
      experimentId,
    });
  }

  /**
   * Save assignment
   */
  private async saveAssignment(assignment: ExperimentAssignment): Promise<void> {
    await this.convex.mutation('experimentAssignments:create' as any, {
      userId: assignment.userId,
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      assignedAt: assignment.assignedAt.getTime(),
    });
  }

  /**
   * Save event
   */
  private async saveEvent(event: ExperimentEvent): Promise<void> {
    await this.convex.mutation('experimentEvents:create' as any, {
      userId: event.userId,
      experimentId: event.experimentId,
      variantId: event.variantId,
      eventType: event.eventType,
      eventName: event.eventName,
      value: event.value,
      timestamp: event.timestamp.getTime(),
    });
  }

  // ============================================================================
  // Caching
  // ============================================================================

  private getCachedAssignment(key: string): ExperimentAssignment | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && expiry < Date.now()) {
      this.assignmentCache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }

    return this.assignmentCache.get(key) || null;
  }

  private cacheAssignment(key: string, assignment: ExperimentAssignment): void {
    this.assignmentCache.set(key, assignment);
    this.cacheExpiry.set(key, Date.now() + this.config.assignmentCacheTtl * 1000);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private log(message: string, data?: Record<string, any>): void {
    if (this.config.debug) {
      console.log(`[Experiments] ${message}`, data || '');
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.experimentCache.clear();
    this.assignmentCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get all running experiments
   */
  async getRunningExperiments(): Promise<Experiment[]> {
    return await this.convex.query('experiments:getByStatus' as any, {
      status: 'running',
    });
  }

  /**
   * Get experiments for a user
   */
  async getUserExperiments(userId: string): Promise<ExperimentAssignment[]> {
    return await this.convex.query('experimentAssignments:getByUser' as any, {
      userId,
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createExperimentManager(
  convex: ConvexHttpClient,
  config?: Partial<ExperimentManagerConfig>
): ExperimentManager {
  return new ExperimentManager(convex, config);
}
