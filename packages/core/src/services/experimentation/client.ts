/**
 * A/B Testing Framework Client
 * Experimentation and feature flags for growth
 */

import * as crypto from "crypto";
import type {
  ExperimentationClientConfig,
  Logger,
  Experiment,
  ExperimentStatus,
  Variant,
  TargetingRules,
  TargetingRule,
  TargetingOperator,
  ExperimentAssignment,
  AssignmentContext,
  FeatureFlag,
  FeatureFlagEvaluation,
  EvaluationReason,
  ExperimentResults,
  VariantResults,
  MetricResults,
  ExperimentEvent,
  ExposureEvent,
  BucketResult,
  Override,
  Segment,
} from "./types";
import { ExperimentationError } from "./types";

// ============================================================================
// Experimentation Client
// ============================================================================

export class ExperimentationClient {
  private readonly projectId: string;
  private readonly apiKey: string;
  private readonly environment: string;
  private readonly defaultAttributes: Record<string, unknown>;
  private readonly timeout: number;
  private readonly logger: Logger;

  // In-memory caches (in production, use Redis)
  private readonly experiments: Map<string, Experiment> = new Map();
  private readonly featureFlags: Map<string, FeatureFlag> = new Map();
  private readonly assignments: Map<string, ExperimentAssignment> = new Map();
  private readonly overrides: Map<string, Override[]> = new Map();
  private readonly events: ExperimentEvent[] = [];

  constructor(config: ExperimentationClientConfig) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey ?? "";
    this.environment = config.environment ?? "development";
    this.defaultAttributes = config.defaultAttributes ?? {};
    this.timeout = config.timeout ?? 5000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Experimentation] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Experimentation] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Experimentation] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Experimentation] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Experiment Management
  // ==========================================================================

  /**
   * Create a new experiment
   */
  async createExperiment(
    experiment: Omit<Experiment, "experimentId" | "createdAt" | "updatedAt">
  ): Promise<Experiment> {
    const newExperiment: Experiment = {
      ...experiment,
      experimentId: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.experiments.set(newExperiment.key, newExperiment);

    this.logger.info("Experiment created", {
      experimentId: newExperiment.experimentId,
      key: newExperiment.key,
    });

    return newExperiment;
  }

  /**
   * Get experiment by key
   */
  async getExperiment(key: string): Promise<Experiment | null> {
    return this.experiments.get(key) ?? null;
  }

  /**
   * Update experiment
   */
  async updateExperiment(
    key: string,
    updates: Partial<Experiment>
  ): Promise<Experiment | null> {
    const experiment = this.experiments.get(key);
    if (!experiment) return null;

    const updated = {
      ...experiment,
      ...updates,
      experimentId: experiment.experimentId,
      key: experiment.key,
      updatedAt: new Date(),
    };

    this.experiments.set(key, updated);

    this.logger.info("Experiment updated", { key });

    return updated;
  }

  /**
   * Start experiment
   */
  async startExperiment(key: string): Promise<Experiment | null> {
    return this.updateExperiment(key, {
      status: "running",
      schedule: {
        startDate: new Date(),
      },
    });
  }

  /**
   * Stop experiment
   */
  async stopExperiment(key: string): Promise<Experiment | null> {
    return this.updateExperiment(key, {
      status: "completed",
      schedule: {
        ...this.experiments.get(key)?.schedule,
        endDate: new Date(),
      },
    });
  }

  /**
   * List experiments
   */
  async listExperiments(status?: ExperimentStatus): Promise<Experiment[]> {
    const all = Array.from(this.experiments.values());
    if (status) {
      return all.filter((e) => e.status === status);
    }
    return all;
  }

  // ==========================================================================
  // Variant Assignment
  // ==========================================================================

  /**
   * Get variant assignment for a user
   */
  async getAssignment(
    experimentKey: string,
    context: AssignmentContext
  ): Promise<ExperimentAssignment | null> {
    const experiment = this.experiments.get(experimentKey);
    if (!experiment || experiment.status !== "running") {
      return null;
    }

    // Check for overrides first
    const override = await this.getOverride(context.userId, experimentKey);
    if (override) {
      const variant = experiment.variants.find(
        (v) => v.key === override.variantKey
      );
      if (variant) {
        return {
          userId: context.userId,
          experimentKey,
          variantKey: variant.key,
          variant,
          assignedAt: new Date(),
          attributes: context.attributes ?? {},
        };
      }
    }

    // Force variant for testing
    if (context.forceVariant) {
      const variant = experiment.variants.find(
        (v) => v.key === context.forceVariant
      );
      if (variant) {
        return {
          userId: context.userId,
          experimentKey,
          variantKey: variant.key,
          variant,
          assignedAt: new Date(),
          attributes: context.attributes ?? {},
        };
      }
    }

    // Check cached assignment for sticky bucketing
    const cacheKey = `${context.userId}:${experimentKey}`;
    const cached = this.assignments.get(cacheKey);
    if (cached && experiment.traffic.stickyBucketing) {
      return cached;
    }

    // Check targeting
    const attributes = {
      ...this.defaultAttributes,
      ...context.attributes,
      userId: context.userId,
    };

    if (!this.evaluateTargeting(experiment.targeting, attributes)) {
      return null;
    }

    // Bucket user
    const bucket = this.bucketUser(
      context.userId,
      experimentKey,
      experiment.traffic.seed
    );

    // Check traffic allocation
    if (bucket.bucket >= experiment.traffic.percentage) {
      return null;
    }

    // Assign variant
    const variant = this.selectVariant(experiment.variants, bucket.bucket);
    if (!variant) return null;

    const assignment: ExperimentAssignment = {
      userId: context.userId,
      experimentKey,
      variantKey: variant.key,
      variant,
      assignedAt: new Date(),
      attributes,
    };

    // Cache assignment
    if (experiment.traffic.stickyBucketing) {
      this.assignments.set(cacheKey, assignment);
    }

    // Track exposure
    await this.trackExposure({
      userId: context.userId,
      experimentKey,
      variantKey: variant.key,
      timestamp: new Date(),
      attributes,
    });

    this.logger.debug("User assigned to variant", {
      userId: context.userId,
      experimentKey,
      variantKey: variant.key,
    });

    return assignment;
  }

  /**
   * Get variant value (convenience method)
   */
  async getVariant<T = unknown>(
    experimentKey: string,
    context: AssignmentContext,
    defaultValue: T
  ): Promise<T> {
    const assignment = await this.getAssignment(experimentKey, context);
    if (!assignment) return defaultValue;

    return (assignment.variant.payload as T) ?? defaultValue;
  }

  /**
   * Check if user is in experiment
   */
  async isInExperiment(
    experimentKey: string,
    context: AssignmentContext
  ): Promise<boolean> {
    const assignment = await this.getAssignment(experimentKey, context);
    return assignment !== null;
  }

  /**
   * Bucket user deterministically
   */
  private bucketUser(
    userId: string,
    experimentKey: string,
    seed?: string
  ): BucketResult {
    const key = `${seed ?? experimentKey}:${userId}`;
    const hash = crypto.createHash("md5").update(key).digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;

    return {
      inExperiment: true,
      bucket,
    };
  }

  /**
   * Select variant based on bucket
   */
  private selectVariant(variants: Variant[], bucket: number): Variant | null {
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback to control
    return variants.find((v) => v.isControl) ?? variants[0] ?? null;
  }

  // ==========================================================================
  // Feature Flags
  // ==========================================================================

  /**
   * Create feature flag
   */
  async createFeatureFlag(
    flag: Omit<FeatureFlag, "flagId" | "createdAt" | "updatedAt">
  ): Promise<FeatureFlag> {
    const newFlag: FeatureFlag = {
      ...flag,
      flagId: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.featureFlags.set(newFlag.key, newFlag);

    this.logger.info("Feature flag created", {
      flagId: newFlag.flagId,
      key: newFlag.key,
    });

    return newFlag;
  }

  /**
   * Evaluate feature flag
   */
  async evaluateFlag(
    flagKey: string,
    context: AssignmentContext
  ): Promise<FeatureFlagEvaluation> {
    const flag = this.featureFlags.get(flagKey);

    if (!flag) {
      return {
        flagKey,
        value: false,
        reason: "default",
      };
    }

    if (!flag.enabled) {
      return {
        flagKey,
        value: flag.defaultValue,
        reason: "disabled",
      };
    }

    const attributes = {
      ...this.defaultAttributes,
      ...context.attributes,
      userId: context.userId,
    };

    // Evaluate rules in order
    for (const rule of flag.rules) {
      if (this.evaluateTargeting(rule.targeting, attributes)) {
        // Check rollout percentage if specified
        if (rule.rolloutPercentage !== undefined) {
          const bucket = this.bucketUser(context.userId, flagKey);
          if (bucket.bucket < rule.rolloutPercentage) {
            return {
              flagKey,
              value: rule.value,
              reason: "rollout",
              ruleId: rule.ruleId,
            };
          }
        } else {
          return {
            flagKey,
            value: rule.value,
            reason: "targeting_match",
            ruleId: rule.ruleId,
          };
        }
      }
    }

    // Default targeting
    if (this.evaluateTargeting(flag.targeting, attributes)) {
      return {
        flagKey,
        value: flag.defaultValue,
        reason: "targeting_match",
      };
    }

    return {
      flagKey,
      value: flag.defaultValue,
      reason: "default",
    };
  }

  /**
   * Get boolean flag value (convenience method)
   */
  async isEnabled(
    flagKey: string,
    context: AssignmentContext
  ): Promise<boolean> {
    const evaluation = await this.evaluateFlag(flagKey, context);
    return Boolean(evaluation.value);
  }

  /**
   * Get string flag value
   */
  async getString(
    flagKey: string,
    context: AssignmentContext,
    defaultValue: string
  ): Promise<string> {
    const evaluation = await this.evaluateFlag(flagKey, context);
    return typeof evaluation.value === "string"
      ? evaluation.value
      : defaultValue;
  }

  /**
   * Get number flag value
   */
  async getNumber(
    flagKey: string,
    context: AssignmentContext,
    defaultValue: number
  ): Promise<number> {
    const evaluation = await this.evaluateFlag(flagKey, context);
    return typeof evaluation.value === "number"
      ? evaluation.value
      : defaultValue;
  }

  /**
   * Get JSON flag value
   */
  async getJSON<T = unknown>(
    flagKey: string,
    context: AssignmentContext,
    defaultValue: T
  ): Promise<T> {
    const evaluation = await this.evaluateFlag(flagKey, context);
    return (evaluation.value as T) ?? defaultValue;
  }

  // ==========================================================================
  // Targeting Evaluation
  // ==========================================================================

  /**
   * Evaluate targeting rules
   */
  private evaluateTargeting(
    targeting: TargetingRules,
    attributes: Record<string, unknown>
  ): boolean {
    if (targeting.rules.length === 0) {
      return targeting.defaultBehavior === "include";
    }

    for (const rule of targeting.rules) {
      const matches = this.evaluateRule(rule, attributes);
      if (rule.negate ? !matches : matches) {
        return true;
      }
    }

    return targeting.defaultBehavior === "include";
  }

  /**
   * Evaluate single targeting rule
   */
  private evaluateRule(
    rule: TargetingRule,
    attributes: Record<string, unknown>
  ): boolean {
    const value = attributes[rule.attribute];

    switch (rule.operator) {
      case "equals":
        return value === rule.value;

      case "not_equals":
        return value !== rule.value;

      case "contains":
        return String(value).includes(String(rule.value));

      case "not_contains":
        return !String(value).includes(String(rule.value));

      case "starts_with":
        return String(value).startsWith(String(rule.value));

      case "ends_with":
        return String(value).endsWith(String(rule.value));

      case "greater_than":
        return Number(value) > Number(rule.value);

      case "less_than":
        return Number(value) < Number(rule.value);

      case "greater_than_or_equal":
        return Number(value) >= Number(rule.value);

      case "less_than_or_equal":
        return Number(value) <= Number(rule.value);

      case "in":
        return Array.isArray(rule.value) && rule.value.includes(value);

      case "not_in":
        return Array.isArray(rule.value) && !rule.value.includes(value);

      case "regex":
        try {
          return new RegExp(String(rule.value)).test(String(value));
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  // ==========================================================================
  // Overrides
  // ==========================================================================

  /**
   * Set override for a user
   */
  async setOverride(
    userId: string,
    experimentKey: string,
    variantKey: string,
    createdBy: string,
    expiresAt?: Date
  ): Promise<Override> {
    const override: Override = {
      overrideId: crypto.randomUUID(),
      type: "user",
      targetId: userId,
      experimentKey,
      variantKey,
      createdAt: new Date(),
      expiresAt,
      createdBy,
    };

    const key = `${userId}:${experimentKey}`;
    const existing = this.overrides.get(key) ?? [];
    existing.push(override);
    this.overrides.set(key, existing);

    // Clear cached assignment
    this.assignments.delete(key);

    this.logger.info("Override set", {
      userId,
      experimentKey,
      variantKey,
    });

    return override;
  }

  /**
   * Get override for a user
   */
  async getOverride(
    userId: string,
    experimentKey: string
  ): Promise<Override | null> {
    const key = `${userId}:${experimentKey}`;
    const overrides = this.overrides.get(key) ?? [];

    // Get most recent non-expired override
    const now = new Date();
    const valid = overrides
      .filter((o) => !o.expiresAt || o.expiresAt > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return valid[0] ?? null;
  }

  /**
   * Remove override
   */
  async removeOverride(userId: string, experimentKey: string): Promise<void> {
    const key = `${userId}:${experimentKey}`;
    this.overrides.delete(key);
    this.assignments.delete(key);

    this.logger.info("Override removed", { userId, experimentKey });
  }

  // ==========================================================================
  // Event Tracking
  // ==========================================================================

  /**
   * Track experiment event
   */
  async trackEvent(event: Omit<ExperimentEvent, "eventId">): Promise<void> {
    const fullEvent: ExperimentEvent = {
      ...event,
      eventId: crypto.randomUUID(),
    };

    this.events.push(fullEvent);

    this.logger.debug("Event tracked", {
      userId: event.userId,
      experimentKey: event.experimentKey,
      eventName: event.eventName,
    });
  }

  /**
   * Track conversion event
   */
  async trackConversion(
    userId: string,
    experimentKey: string,
    value?: number
  ): Promise<void> {
    const assignment = this.assignments.get(`${userId}:${experimentKey}`);
    if (!assignment) return;

    await this.trackEvent({
      userId,
      experimentKey,
      variantKey: assignment.variantKey,
      eventName: "conversion",
      value,
      timestamp: new Date(),
    });
  }

  /**
   * Track exposure (internal)
   */
  private async trackExposure(exposure: ExposureEvent): Promise<void> {
    await this.trackEvent({
      userId: exposure.userId,
      experimentKey: exposure.experimentKey,
      variantKey: exposure.variantKey,
      eventName: "$exposure",
      timestamp: exposure.timestamp,
    });
  }

  // ==========================================================================
  // Results Analysis
  // ==========================================================================

  /**
   * Get experiment results
   */
  async getResults(experimentKey: string): Promise<ExperimentResults | null> {
    const experiment = this.experiments.get(experimentKey);
    if (!experiment) return null;

    // Get events for this experiment
    const experimentEvents = this.events.filter(
      (e) => e.experimentKey === experimentKey
    );

    // Group by variant
    const byVariant = new Map<string, ExperimentEvent[]>();
    for (const event of experimentEvents) {
      const existing = byVariant.get(event.variantKey) ?? [];
      existing.push(event);
      byVariant.set(event.variantKey, existing);
    }

    // Calculate results per variant
    const variantResults: VariantResults[] = experiment.variants.map(
      (variant) => {
        const events = byVariant.get(variant.key) ?? [];
        const exposures = events.filter((e) => e.eventName === "$exposure");
        const conversions = events.filter((e) => e.eventName === "conversion");

        const metrics: MetricResults[] = experiment.metrics.map((metric) => {
          const metricEvents = events.filter(
            (e) => e.eventName === metric.eventName
          );
          const value =
            metric.type === "conversion"
              ? conversions.length / Math.max(exposures.length, 1)
              : metricEvents.reduce((sum, e) => sum + (e.value ?? 0), 0);

          return {
            metricName: metric.name,
            metricType: metric.type,
            value,
            confidenceInterval: [value * 0.9, value * 1.1] as [number, number],
            isSignificant: false,
            sampleSize: exposures.length,
          };
        });

        return {
          variantKey: variant.key,
          variantName: variant.name,
          isControl: variant.isControl,
          participants: exposures.length,
          metrics,
        };
      }
    );

    // Determine recommendation
    const controlResults = variantResults.find((v) => v.isControl);
    const treatmentResults = variantResults.filter((v) => !v.isControl);

    let recommendation = {
      decision: "continue" as const,
      confidence: 0,
      reason: "Not enough data",
    };

    if (controlResults && treatmentResults.length > 0) {
      const primaryMetric = experiment.metrics.find((m) => m.isPrimary);
      if (primaryMetric) {
        const controlMetric = controlResults.metrics.find(
          (m) => m.metricName === primaryMetric.name
        );
        const bestTreatment = treatmentResults.reduce((best, current) => {
          const currentMetric = current.metrics.find(
            (m) => m.metricName === primaryMetric.name
          );
          const bestMetric = best.metrics.find(
            (m) => m.metricName === primaryMetric.name
          );
          return (currentMetric?.value ?? 0) > (bestMetric?.value ?? 0)
            ? current
            : best;
        });

        const treatmentMetric = bestTreatment.metrics.find(
          (m) => m.metricName === primaryMetric.name
        );

        if (controlMetric && treatmentMetric) {
          const uplift =
            (treatmentMetric.value - controlMetric.value) /
            Math.max(controlMetric.value, 0.001);

          if (uplift > 0.05) {
            recommendation = {
              decision: "winner",
              winningVariant: bestTreatment.variantKey,
              confidence: Math.min(treatmentMetric.sampleSize / 1000, 0.95),
              reason: `${bestTreatment.variantName} shows ${(uplift * 100).toFixed(1)}% uplift`,
            };
          }
        }
      }
    }

    return {
      experimentId: experiment.experimentId,
      experimentKey,
      status: experiment.status,
      startDate: experiment.schedule.startDate ?? experiment.createdAt,
      endDate: experiment.schedule.endDate,
      participants: variantResults.reduce((sum, v) => sum + v.participants, 0),
      variantResults,
      recommendation,
      calculatedAt: new Date(),
    };
  }

  // ==========================================================================
  // Segments
  // ==========================================================================

  /**
   * Check if user is in segment
   */
  async isInSegment(
    segment: Segment,
    context: AssignmentContext
  ): Promise<boolean> {
    const attributes = {
      ...this.defaultAttributes,
      ...context.attributes,
      userId: context.userId,
    };

    return this.evaluateTargeting(segment.rules, attributes);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get all feature flag evaluations for a user
   */
  async getAllFlags(
    context: AssignmentContext
  ): Promise<Map<string, FeatureFlagEvaluation>> {
    const results = new Map<string, FeatureFlagEvaluation>();

    for (const [key] of this.featureFlags) {
      const evaluation = await this.evaluateFlag(key, context);
      results.set(key, evaluation);
    }

    return results;
  }

  /**
   * Get all experiment assignments for a user
   */
  async getAllAssignments(
    context: AssignmentContext
  ): Promise<Map<string, ExperimentAssignment>> {
    const results = new Map<string, ExperimentAssignment>();

    for (const [key, experiment] of this.experiments) {
      if (experiment.status === "running") {
        const assignment = await this.getAssignment(key, context);
        if (assignment) {
          results.set(key, assignment);
        }
      }
    }

    return results;
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    return true;
  }
}

export default ExperimentationClient;
