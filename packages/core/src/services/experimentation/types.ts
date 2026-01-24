/**
 * A/B Testing Framework Types
 * Types for growth experiments and feature flags
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ExperimentationClientConfig {
  projectId: string;
  apiKey?: string;
  environment?: "development" | "staging" | "production";
  defaultAttributes?: Record<string, unknown>;
  timeout?: number;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Experiment Types
// ============================================================================

export interface Experiment {
  experimentId: string;
  key: string;
  name: string;
  description: string;
  hypothesis: string;
  type: ExperimentType;
  status: ExperimentStatus;
  variants: Variant[];
  targeting: TargetingRules;
  metrics: ExperimentMetric[];
  traffic: TrafficAllocation;
  schedule: ExperimentSchedule;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type ExperimentType = "ab" | "multivariate" | "feature_flag" | "holdout";

export type ExperimentStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "archived";

export interface Variant {
  variantId: string;
  key: string;
  name: string;
  description?: string;
  isControl: boolean;
  weight: number; // Percentage 0-100
  payload?: Record<string, unknown>;
}

// ============================================================================
// Targeting Types
// ============================================================================

export interface TargetingRules {
  rules: TargetingRule[];
  defaultBehavior: "include" | "exclude";
}

export interface TargetingRule {
  ruleId: string;
  attribute: string;
  operator: TargetingOperator;
  value: unknown;
  negate?: boolean;
}

export type TargetingOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "in"
  | "not_in"
  | "regex"
  | "semver_gt"
  | "semver_lt"
  | "semver_eq";

// ============================================================================
// Traffic Allocation Types
// ============================================================================

export interface TrafficAllocation {
  percentage: number; // 0-100, percentage of users in experiment
  seed?: string; // For deterministic bucketing
  stickyBucketing?: boolean;
}

// ============================================================================
// Schedule Types
// ============================================================================

export interface ExperimentSchedule {
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface ExperimentMetric {
  metricId: string;
  name: string;
  type: MetricType;
  isPrimary: boolean;
  winningDirection: "increase" | "decrease";
  minimumDetectableEffect?: number;
  eventName?: string;
  property?: string;
  aggregation?: AggregationType;
}

export type MetricType =
  | "conversion"
  | "revenue"
  | "count"
  | "duration"
  | "ratio"
  | "custom";

export type AggregationType =
  | "sum"
  | "count"
  | "average"
  | "median"
  | "percentile_90"
  | "percentile_95"
  | "percentile_99"
  | "unique";

// ============================================================================
// Assignment Types
// ============================================================================

export interface ExperimentAssignment {
  userId: string;
  experimentKey: string;
  variantKey: string;
  variant: Variant;
  assignedAt: Date;
  attributes: Record<string, unknown>;
}

export interface AssignmentContext {
  userId: string;
  attributes?: Record<string, unknown>;
  forceVariant?: string;
}

// ============================================================================
// Feature Flag Types
// ============================================================================

export interface FeatureFlag {
  flagId: string;
  key: string;
  name: string;
  description?: string;
  type: FeatureFlagType;
  enabled: boolean;
  defaultValue: unknown;
  rules: FeatureFlagRule[];
  targeting: TargetingRules;
  createdAt: Date;
  updatedAt: Date;
}

export type FeatureFlagType = "boolean" | "string" | "number" | "json";

export interface FeatureFlagRule {
  ruleId: string;
  targeting: TargetingRules;
  value: unknown;
  rolloutPercentage?: number;
}

export interface FeatureFlagEvaluation {
  flagKey: string;
  value: unknown;
  reason: EvaluationReason;
  ruleId?: string;
}

export type EvaluationReason =
  | "default"
  | "targeting_match"
  | "rollout"
  | "disabled"
  | "override"
  | "error";

// ============================================================================
// Results Types
// ============================================================================

export interface ExperimentResults {
  experimentId: string;
  experimentKey: string;
  status: ExperimentStatus;
  startDate: Date;
  endDate?: Date;
  participants: number;
  variantResults: VariantResults[];
  recommendation?: ResultRecommendation;
  calculatedAt: Date;
}

export interface VariantResults {
  variantKey: string;
  variantName: string;
  isControl: boolean;
  participants: number;
  metrics: MetricResults[];
}

export interface MetricResults {
  metricName: string;
  metricType: MetricType;
  value: number;
  confidenceInterval: [number, number];
  uplift?: number;
  upliftConfidenceInterval?: [number, number];
  pValue?: number;
  isSignificant: boolean;
  sampleSize: number;
}

export interface ResultRecommendation {
  decision: "winner" | "loser" | "inconclusive" | "continue";
  winningVariant?: string;
  confidence: number;
  reason: string;
}

// ============================================================================
// Event Tracking Types
// ============================================================================

export interface ExperimentEvent {
  eventId: string;
  userId: string;
  experimentKey: string;
  variantKey: string;
  eventName: string;
  properties?: Record<string, unknown>;
  value?: number;
  timestamp: Date;
}

export interface ExposureEvent {
  userId: string;
  experimentKey: string;
  variantKey: string;
  timestamp: Date;
  attributes?: Record<string, unknown>;
}

// ============================================================================
// Bucketing Types
// ============================================================================

export interface BucketingConfig {
  seed: string;
  bucketingKey: string; // Usually userId
  trafficPercentage: number;
}

export interface BucketResult {
  inExperiment: boolean;
  bucket: number; // 0-99
  variantKey?: string;
}

// ============================================================================
// Override Types
// ============================================================================

export interface Override {
  overrideId: string;
  type: "user" | "segment" | "global";
  targetId: string; // userId or segmentId
  experimentKey: string;
  variantKey: string;
  createdAt: Date;
  expiresAt?: Date;
  createdBy: string;
}

// ============================================================================
// Segment Types
// ============================================================================

export interface Segment {
  segmentId: string;
  name: string;
  description?: string;
  rules: TargetingRules;
  estimatedSize?: number;
  createdAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class ExperimentationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "ExperimentationError";
  }
}
