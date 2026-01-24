/**
 * A/B Testing & Experiments Types
 * Type definitions for experiments, variants, and statistical analysis
 */

// ============================================================================
// Core Experiment Types
// ============================================================================

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  variants: Variant[];
  targetAudience?: TargetAudience;
  metrics: ExperimentMetric[];
  startDate: Date;
  endDate?: Date;
  status: ExperimentStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  type: ExperimentType;
  minimumSampleSize?: number;
  minimumRunDuration?: number; // in days
}

export interface Variant {
  id: string;
  name: string;
  description?: string;
  weight: number; // 0-100, must sum to 100 across all variants
  isControl: boolean;
  config: Record<string, any>;
}

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export type ExperimentType =
  | 'feature_flag'
  | 'ab_test'
  | 'multivariate'
  | 'holdout'
  | 'rollout';

// ============================================================================
// Targeting
// ============================================================================

export interface TargetAudience {
  /** Specific user tiers (e.g., 'basic', 'premium') */
  tiers?: string[];
  /** Cohorts based on signup date or behavior */
  cohorts?: string[];
  /** Percentage of eligible users to include (0-100) */
  percentOfUsers?: number;
  /** Country codes to include */
  countries?: string[];
  /** Platform types to include */
  platforms?: ('web' | 'ios' | 'android')[];
  /** Specific user IDs to force include */
  includeUserIds?: string[];
  /** Specific user IDs to force exclude */
  excludeUserIds?: string[];
  /** Custom filter rules */
  filters?: TargetFilter[];
}

export interface TargetFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';
  value: any;
}

// ============================================================================
// Metrics & Results
// ============================================================================

export interface ExperimentMetric {
  name: string;
  type: 'conversion' | 'revenue' | 'count' | 'duration' | 'custom';
  eventName: string;
  property?: string;
  isPrimary: boolean;
  minimumDetectableEffect?: number;
}

export interface ExperimentResults {
  experimentId: string;
  startDate: Date;
  endDate?: Date;
  variants: VariantResults[];
  winner?: string;
  statisticalSignificance: number;
  confidence: number;
  recommendedAction: 'continue' | 'stop_winner' | 'stop_loser' | 'inconclusive';
  sampleSize: number;
  durationDays: number;
}

export interface VariantResults {
  variantId: string;
  variantName: string;
  isControl: boolean;
  exposures: number;
  conversions: number;
  conversionRate: number;
  revenue?: number;
  revenuePerUser?: number;
  metrics: MetricResult[];
  confidence: ConfidenceInterval;
  pValue?: number;
  liftVsControl?: number;
}

export interface MetricResult {
  name: string;
  value: number;
  sampleSize: number;
  confidenceInterval: ConfidenceInterval;
  pValue?: number;
  isSignificant: boolean;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // e.g., 0.95 for 95%
}

// ============================================================================
// Assignment & Tracking
// ============================================================================

export interface ExperimentAssignment {
  userId: string;
  experimentId: string;
  variantId: string;
  assignedAt: Date;
  context?: AssignmentContext;
}

export interface AssignmentContext {
  platform?: string;
  version?: string;
  country?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface ExperimentEvent {
  userId: string;
  experimentId: string;
  variantId: string;
  eventType: 'exposure' | 'conversion';
  eventName?: string;
  value?: number;
  timestamp: Date;
  properties?: Record<string, any>;
}

// ============================================================================
// Sample Experiments
// ============================================================================

export const SAMPLE_EXPERIMENTS: Omit<Experiment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    name: 'Onboarding Flow Optimization',
    description: 'Test different onboarding experiences to improve completion rate',
    hypothesis: 'Simplifying KYC requirements for small deposits will increase onboarding completion',
    variants: [
      {
        id: 'control',
        name: 'Control',
        description: 'Current onboarding flow with full KYC required',
        weight: 34,
        isControl: true,
        config: { skipKycThreshold: 0, showProgressBar: false },
      },
      {
        id: 'variant_a',
        name: 'Skip KYC for Small Deposits',
        description: 'Allow first $100 deposit without KYC',
        weight: 33,
        isControl: false,
        config: { skipKycThreshold: 100, showProgressBar: false },
      },
      {
        id: 'variant_b',
        name: 'Gamified Progress Bar',
        description: 'Show gamified progress bar during onboarding',
        weight: 33,
        isControl: false,
        config: { skipKycThreshold: 0, showProgressBar: true },
      },
    ],
    metrics: [
      { name: 'Onboarding Completion', type: 'conversion', eventName: 'funnel.onboarding_step', property: 'completed', isPrimary: true, minimumDetectableEffect: 0.05 },
      { name: 'Time to Complete', type: 'duration', eventName: 'user.kyc_completed', property: 'durationSeconds', isPrimary: false },
      { name: 'First Deposit Rate', type: 'conversion', eventName: 'user.first_deposit', isPrimary: false },
    ],
    startDate: new Date(),
    status: 'draft',
    type: 'ab_test',
    minimumSampleSize: 1000,
    minimumRunDuration: 14,
  },
  {
    name: 'Trading UI Simplification',
    description: 'Test simplified trading UI to increase trade volume',
    hypothesis: 'A one-click trading option will increase trade frequency for casual traders',
    variants: [
      {
        id: 'control',
        name: 'Standard Order Form',
        description: 'Current order form with all options visible',
        weight: 34,
        isControl: true,
        config: { tradingMode: 'standard' },
      },
      {
        id: 'variant_a',
        name: 'One-Click Trading',
        description: 'Simplified one-click buy/sell buttons',
        weight: 33,
        isControl: false,
        config: { tradingMode: 'one_click' },
      },
      {
        id: 'variant_b',
        name: 'Advanced Trader Mode',
        description: 'Advanced UI with keyboard shortcuts and hotkeys',
        weight: 33,
        isControl: false,
        config: { tradingMode: 'advanced' },
      },
    ],
    metrics: [
      { name: 'Trades per User', type: 'count', eventName: 'trade.order_filled', isPrimary: true, minimumDetectableEffect: 0.1 },
      { name: 'Volume per User', type: 'revenue', eventName: 'trade.order_filled', property: 'amount', isPrimary: false },
      { name: 'Error Rate', type: 'count', eventName: 'trade.order_cancelled', isPrimary: false },
    ],
    targetAudience: {
      tiers: ['basic', 'intermediate'],
      percentOfUsers: 100,
    },
    startDate: new Date(),
    status: 'draft',
    type: 'ab_test',
    minimumSampleSize: 500,
    minimumRunDuration: 7,
  },
  {
    name: 'Copy Trading CTA Optimization',
    description: 'Test different copy trading CTAs to improve adoption',
    hypothesis: 'Personalized CTAs with trader names will increase copy trading adoption',
    variants: [
      {
        id: 'control',
        name: 'Follow Button',
        description: 'Generic "Follow" button',
        weight: 34,
        isControl: true,
        config: { ctaText: 'Follow', ctaStyle: 'default' },
      },
      {
        id: 'variant_a',
        name: 'Copy Trades Button',
        description: '"Copy Trades" button with copy icon',
        weight: 33,
        isControl: false,
        config: { ctaText: 'Copy Trades', ctaStyle: 'copy' },
      },
      {
        id: 'variant_b',
        name: 'Personalized CTA',
        description: 'Personalized "Auto-invest with {name}" button',
        weight: 33,
        isControl: false,
        config: { ctaText: 'Auto-invest with {traderName}', ctaStyle: 'personalized' },
      },
    ],
    metrics: [
      { name: 'Copy Trading Started', type: 'conversion', eventName: 'social.copy_started', isPrimary: true, minimumDetectableEffect: 0.08 },
      { name: 'Follow Rate', type: 'conversion', eventName: 'social.followed', isPrimary: false },
      { name: 'Allocation Amount', type: 'revenue', eventName: 'social.copy_started', property: 'allocation', isPrimary: false },
    ],
    startDate: new Date(),
    status: 'draft',
    type: 'ab_test',
    minimumSampleSize: 800,
    minimumRunDuration: 14,
  },
  {
    name: 'Points Earning Rate Experiment',
    description: 'Test different points earning strategies to increase engagement',
    hypothesis: 'Higher initial rewards will increase week-1 retention',
    variants: [
      {
        id: 'control',
        name: 'Current Rates',
        description: 'Standard points earning rates',
        weight: 34,
        isControl: true,
        config: { pointsMultiplier: 1, streakBonus: 1 },
      },
      {
        id: 'variant_a',
        name: '2x First Week',
        description: 'Double points for first week',
        weight: 33,
        isControl: false,
        config: { pointsMultiplier: 2, streakBonus: 1, multiplierDays: 7 },
      },
      {
        id: 'variant_b',
        name: 'Streak Emphasis',
        description: 'Higher streak bonus multiplier',
        weight: 33,
        isControl: false,
        config: { pointsMultiplier: 1, streakBonus: 2, maxStreakMultiplier: 5 },
      },
    ],
    targetAudience: {
      cohorts: ['new_users'],
      percentOfUsers: 100,
    },
    metrics: [
      { name: 'D7 Retention', type: 'conversion', eventName: 'session.started', isPrimary: true, minimumDetectableEffect: 0.05 },
      { name: 'Points Earned', type: 'count', eventName: 'engagement.points_earned', property: 'amount', isPrimary: false },
      { name: 'Streak Maintenance', type: 'conversion', eventName: 'engagement.streak_maintained', isPrimary: false },
    ],
    startDate: new Date(),
    status: 'draft',
    type: 'ab_test',
    minimumSampleSize: 2000,
    minimumRunDuration: 14,
  },
];

// ============================================================================
// Configuration
// ============================================================================

export interface ExperimentManagerConfig {
  /** Default confidence level for statistical tests (0-1) */
  defaultConfidenceLevel: number;
  /** Enable debug logging */
  debug: boolean;
  /** Cache assignment decisions for this many seconds */
  assignmentCacheTtl: number;
  /** Maximum number of experiments a user can be in simultaneously */
  maxConcurrentExperiments: number;
  /** Salt for hashing user assignments */
  hashSalt: string;
}

export const DEFAULT_EXPERIMENT_CONFIG: ExperimentManagerConfig = {
  defaultConfidenceLevel: 0.95,
  debug: false,
  assignmentCacheTtl: 300,
  maxConcurrentExperiments: 10,
  hashSalt: 'pull-experiments-v1',
};
