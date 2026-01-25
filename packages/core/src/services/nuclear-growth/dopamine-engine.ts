/**
 * NUCLEAR GROWTH FEATURE #6: Dopamine Engineering
 *
 * Scientific engagement optimization using behavioral psychology.
 * Variable rewards, loss aversion, social validation, and more.
 *
 * WHY IT'S NUCLEAR:
 * - Creates genuine addiction loops
 * - Maximizes session time
 * - Drives daily return rate
 * - Optimizes conversion at every step
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const TriggerTypeSchema = z.enum([
  "variable_reward",     // Unpredictable rewards
  "near_miss",           // Almost won psychology
  "social_proof",        // Others are doing it
  "scarcity",            // Limited time/quantity
  "loss_aversion",       // Fear of missing out
  "progress",            // Completion drive
  "reciprocity",         // Give to receive
  "commitment",          // Sunk cost
  "authority",           // Expert validation
  "novelty",             // New and exciting
]);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export interface DopamineTrigger {
  id: string;
  type: TriggerType;
  name: string;
  description: string;

  // When to fire
  conditions: TriggerCondition[];

  // What happens
  actions: TriggerAction[];

  // Targeting
  userSegments?: string[];
  excludeSegments?: string[];

  // Timing
  cooldownMinutes: number;
  maxPerDay: number;
  activeHours?: { start: number; end: number };

  // A/B testing
  variants?: TriggerVariant[];
  isExperiment: boolean;

  // Analytics
  impressions: number;
  conversions: number;
  conversionRate: number;

  isActive: boolean;
  createdAt: number;
}

export interface TriggerCondition {
  type: string;
  operator: "equals" | "gt" | "lt" | "gte" | "lte" | "contains" | "not";
  value: any;
}

export interface TriggerAction {
  type: "notification" | "modal" | "toast" | "animation" | "sound" | "reward" | "highlight";
  content: Record<string, any>;
  delay?: number;
}

export interface TriggerVariant {
  id: string;
  name: string;
  weight: number; // % of traffic
  actions: TriggerAction[];
  conversions: number;
}

export interface UserEngagement {
  oduserId: string;

  // Session metrics
  totalSessions: number;
  totalSessionTime: number;
  averageSessionTime: number;
  longestSession: number;

  // Activity
  lastActiveAt: number;
  consecutiveDays: number;
  totalActiveDays: number;

  // Actions
  betsPlaced: number;
  betsWon: number;
  depositsCount: number;
  depositsTotal: number;

  // Engagement score (0-100)
  engagementScore: number;
  engagementTrend: "rising" | "stable" | "declining";

  // Trigger history
  triggersReceived: TriggerHistory[];

  // Predictions
  churnRisk: "low" | "medium" | "high";
  predictedLTV: number;
}

export interface TriggerHistory {
  triggerId: string;
  triggerType: TriggerType;
  receivedAt: number;
  interactedAt?: number;
  converted: boolean;
}

export interface RewardDrop {
  id: string;
  type: "bonus" | "free_bet" | "boost" | "entry" | "merch" | "badge";
  value: number | string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  probability: number;
  expiresIn?: number;
}

export interface EngagementCampaign {
  id: string;
  name: string;
  description: string;

  // Targeting
  targetSegment: string;
  estimatedReach: number;

  // Triggers
  triggers: DopamineTrigger[];

  // Goals
  goals: CampaignGoal[];

  // Timing
  startsAt: number;
  endsAt: number;
  status: "draft" | "active" | "paused" | "complete";

  // Results
  impressions: number;
  conversions: number;
  revenue: number;
  roi: number;
}

export interface CampaignGoal {
  metric: string;
  target: number;
  current: number;
  achieved: boolean;
}

// ============================================================================
// PRE-BUILT TRIGGERS
// ============================================================================

export const DOPAMINE_TRIGGERS: Record<string, Omit<DopamineTrigger, "id" | "impressions" | "conversions" | "conversionRate" | "createdAt">> = {
  // Variable Reward - Mystery Box
  mystery_box: {
    type: "variable_reward",
    name: "Mystery Box Drop",
    description: "Random reward after completing action",
    conditions: [
      { type: "action", operator: "equals", value: "bet_placed" },
      { type: "random", operator: "lt", value: 0.15 }, // 15% chance
    ],
    actions: [
      { type: "animation", content: { animation: "mystery_box" } },
      { type: "sound", content: { sound: "mystery" } },
      { type: "reward", content: { pool: "mystery_box" } },
    ],
    cooldownMinutes: 60,
    maxPerDay: 3,
    isActive: true,
    isExperiment: false,
  },

  // Near Miss - Close Call
  near_miss_parlay: {
    type: "near_miss",
    name: "Parlay Near Miss",
    description: "Show how close they were on parlay",
    conditions: [
      { type: "bet_result", operator: "equals", value: "loss" },
      { type: "bet_type", operator: "equals", value: "parlay" },
      { type: "legs_hit", operator: "gte", value: 0.8 }, // 80%+ legs hit
    ],
    actions: [
      { type: "modal", content: {
        title: "SO CLOSE! 😱",
        body: "You hit {{legs_hit}} of {{total_legs}} legs! That parlay was {{potential_win}} away from cashing!",
        cta: "Try Again with Insurance",
      }},
    ],
    cooldownMinutes: 30,
    maxPerDay: 5,
    isActive: true,
    isExperiment: false,
  },

  // Social Proof - Others Winning
  social_proof_wins: {
    type: "social_proof",
    name: "Others Winning Nearby",
    description: "Show recent wins from similar users",
    conditions: [
      { type: "session_time", operator: "gt", value: 120 }, // 2+ minutes
      { type: "bets_placed_session", operator: "equals", value: 0 },
    ],
    actions: [
      { type: "toast", content: {
        message: "🎉 {{winner_name}} just won ${{amount}} on {{team}}!",
        duration: 5000,
      }},
    ],
    cooldownMinutes: 5,
    maxPerDay: 20,
    isActive: true,
    isExperiment: false,
  },

  // Scarcity - Limited Boost
  scarcity_boost: {
    type: "scarcity",
    name: "Flash Boost",
    description: "Time-limited odds boost",
    conditions: [
      { type: "time_since_last_bet", operator: "gt", value: 3600 }, // 1 hour
      { type: "random", operator: "lt", value: 0.10 },
    ],
    actions: [
      { type: "notification", content: {
        title: "⚡ Flash Boost - 10 MIN ONLY",
        body: "+25% on your next bet! Expires soon...",
      }},
      { type: "highlight", content: { element: "place_bet_button", duration: 600 } },
    ],
    cooldownMinutes: 240,
    maxPerDay: 2,
    isActive: true,
    isExperiment: false,
  },

  // Loss Aversion - Streak Protection
  loss_aversion_streak: {
    type: "loss_aversion",
    name: "Streak in Danger",
    description: "Alert when streak might break",
    conditions: [
      { type: "active_streak", operator: "gte", value: 3 },
      { type: "bet_status", operator: "equals", value: "losing" },
    ],
    actions: [
      { type: "notification", content: {
        title: "🔥 Your {{streak_length}}-win streak is at risk!",
        body: "Cash out now to protect your streak, or let it ride!",
      }},
      { type: "highlight", content: { element: "cash_out_button" } },
    ],
    cooldownMinutes: 10,
    maxPerDay: 10,
    isActive: true,
    isExperiment: false,
  },

  // Progress - Achievement Unlock
  progress_achievement: {
    type: "progress",
    name: "Achievement Progress",
    description: "Show progress toward achievements",
    conditions: [
      { type: "achievement_progress", operator: "gte", value: 0.75 },
      { type: "achievement_progress", operator: "lt", value: 1 },
    ],
    actions: [
      { type: "toast", content: {
        message: "🏆 Almost there! {{progress}}% to '{{achievement_name}}'",
        duration: 4000,
      }},
    ],
    cooldownMinutes: 120,
    maxPerDay: 5,
    isActive: true,
    isExperiment: false,
  },

  // Reciprocity - Free Gift
  reciprocity_gift: {
    type: "reciprocity",
    name: "Surprise Gift",
    description: "Unexpected free reward",
    conditions: [
      { type: "days_since_signup", operator: "equals", value: 7 },
    ],
    actions: [
      { type: "modal", content: {
        title: "🎁 A Gift For You!",
        body: "Thanks for being part of our community. Here's a free $5 bet on us!",
        reward: { type: "free_bet", value: 5 },
      }},
      { type: "animation", content: { animation: "confetti" } },
    ],
    cooldownMinutes: 10080, // 7 days
    maxPerDay: 1,
    isActive: true,
    isExperiment: false,
  },

  // Commitment - Bet Slip Builder
  commitment_parlay: {
    type: "commitment",
    name: "Parlay Builder Nudge",
    description: "Encourage adding more legs",
    conditions: [
      { type: "bet_slip_legs", operator: "gte", value: 2 },
      { type: "bet_slip_legs", operator: "lt", value: 4 },
    ],
    actions: [
      { type: "toast", content: {
        message: "Add 1 more leg for a {{bonus_multiplier}}x parlay boost! 🚀",
        duration: 5000,
      }},
    ],
    cooldownMinutes: 10,
    maxPerDay: 10,
    isActive: true,
    isExperiment: false,
  },

  // Authority - Expert Pick
  authority_expert: {
    type: "authority",
    name: "Expert Pick Alert",
    description: "Show verified expert picked same",
    conditions: [
      { type: "bet_slip_has_selection", operator: "equals", value: true },
      { type: "expert_also_picked", operator: "equals", value: true },
    ],
    actions: [
      { type: "toast", content: {
        message: "✅ {{expert_name}} ({{win_rate}}% win rate) also likes this pick!",
        duration: 5000,
      }},
    ],
    cooldownMinutes: 5,
    maxPerDay: 15,
    isActive: true,
    isExperiment: false,
  },

  // Novelty - New Feature
  novelty_feature: {
    type: "novelty",
    name: "New Feature Intro",
    description: "Introduce new platform features",
    conditions: [
      { type: "feature_seen", operator: "equals", value: false },
    ],
    actions: [
      { type: "modal", content: {
        title: "✨ NEW: {{feature_name}}",
        body: "{{feature_description}}",
        cta: "Try It Now",
      }},
    ],
    cooldownMinutes: 1440, // 24 hours
    maxPerDay: 1,
    isActive: true,
    isExperiment: false,
  },
};

// ============================================================================
// REWARD POOLS
// ============================================================================

export const REWARD_POOLS: Record<string, RewardDrop[]> = {
  mystery_box: [
    { id: "r1", type: "bonus", value: 1, rarity: "common", probability: 0.40 },
    { id: "r2", type: "bonus", value: 2, rarity: "common", probability: 0.25 },
    { id: "r3", type: "free_bet", value: 1, rarity: "uncommon", probability: 0.15 },
    { id: "r4", type: "boost", value: "10%", rarity: "uncommon", probability: 0.10 },
    { id: "r5", type: "free_bet", value: 5, rarity: "rare", probability: 0.06 },
    { id: "r6", type: "boost", value: "25%", rarity: "rare", probability: 0.03 },
    { id: "r7", type: "free_bet", value: 25, rarity: "epic", probability: 0.008 },
    { id: "r8", type: "free_bet", value: 100, rarity: "legendary", probability: 0.002 },
  ],
  daily_spin: [
    { id: "d1", type: "bonus", value: 0.50, rarity: "common", probability: 0.50 },
    { id: "d2", type: "bonus", value: 1, rarity: "common", probability: 0.25 },
    { id: "d3", type: "free_bet", value: 1, rarity: "uncommon", probability: 0.12 },
    { id: "d4", type: "boost", value: "15%", rarity: "uncommon", probability: 0.08 },
    { id: "d5", type: "free_bet", value: 5, rarity: "rare", probability: 0.04 },
    { id: "d6", type: "free_bet", value: 50, rarity: "legendary", probability: 0.01 },
  ],
};

// ============================================================================
// DOPAMINE ENGINE SERVICE
// ============================================================================

export class DopamineEngineService {
  /**
   * Check if trigger should fire
   */
  shouldTrigger(
    trigger: DopamineTrigger,
    context: Record<string, any>,
    userHistory: TriggerHistory[]
  ): boolean {
    // Check if active
    if (!trigger.isActive) return false;

    // Check cooldown
    const lastTrigger = userHistory.find(h => h.triggerId === trigger.id);
    if (lastTrigger) {
      const cooldownMs = trigger.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastTrigger.receivedAt < cooldownMs) {
        return false;
      }
    }

    // Check max per day
    const today = new Date().toDateString();
    const todayTriggers = userHistory.filter(
      h => h.triggerId === trigger.id && new Date(h.receivedAt).toDateString() === today
    );
    if (todayTriggers.length >= trigger.maxPerDay) {
      return false;
    }

    // Check active hours
    if (trigger.activeHours) {
      const hour = new Date().getHours();
      if (hour < trigger.activeHours.start || hour > trigger.activeHours.end) {
        return false;
      }
    }

    // Check all conditions
    return trigger.conditions.every(condition => this.evaluateCondition(condition, context));
  }

  /**
   * Select reward from pool
   */
  selectReward(poolName: string): RewardDrop | null {
    const pool = REWARD_POOLS[poolName];
    if (!pool) return null;

    const random = Math.random();
    let cumulative = 0;

    for (const reward of pool) {
      cumulative += reward.probability;
      if (random <= cumulative) {
        return reward;
      }
    }

    return pool[0]; // Fallback to first
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore(metrics: {
    sessionCount: number;
    avgSessionTime: number;
    consecutiveDays: number;
    betsPerSession: number;
    depositFrequency: number;
    socialActions: number;
  }): number {
    // Weighted scoring
    const weights = {
      sessionCount: 0.15,
      avgSessionTime: 0.20,
      consecutiveDays: 0.25,
      betsPerSession: 0.15,
      depositFrequency: 0.15,
      socialActions: 0.10,
    };

    // Normalize each metric (0-100 scale)
    const normalized = {
      sessionCount: Math.min(metrics.sessionCount / 50, 1) * 100,
      avgSessionTime: Math.min(metrics.avgSessionTime / 30, 1) * 100, // 30 min max
      consecutiveDays: Math.min(metrics.consecutiveDays / 30, 1) * 100,
      betsPerSession: Math.min(metrics.betsPerSession / 10, 1) * 100,
      depositFrequency: Math.min(metrics.depositFrequency / 4, 1) * 100, // 4 per month max
      socialActions: Math.min(metrics.socialActions / 20, 1) * 100,
    };

    // Calculate weighted score
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += normalized[key as keyof typeof normalized] * weight;
    }

    return Math.round(score);
  }

  /**
   * Predict churn risk
   */
  predictChurnRisk(engagement: UserEngagement): "low" | "medium" | "high" {
    const daysSinceActive = (Date.now() - engagement.lastActiveAt) / (24 * 60 * 60 * 1000);

    // High risk indicators
    if (daysSinceActive > 7) return "high";
    if (engagement.engagementTrend === "declining" && engagement.engagementScore < 30) return "high";
    if (engagement.consecutiveDays === 0 && daysSinceActive > 3) return "high";

    // Medium risk indicators
    if (daysSinceActive > 3) return "medium";
    if (engagement.engagementTrend === "declining") return "medium";
    if (engagement.engagementScore < 50) return "medium";

    return "low";
  }

  /**
   * Get optimal trigger timing
   */
  getOptimalTriggerTime(
    triggerType: TriggerType,
    userTimezone: string
  ): { hour: number; dayOfWeek: number[] } {
    // Based on engagement data patterns
    const optimalTimes: Record<TriggerType, { hour: number; days: number[] }> = {
      variable_reward: { hour: 19, days: [0, 4, 5, 6] }, // Evening, weekends
      near_miss: { hour: 21, days: [0, 1, 2, 3, 4, 5, 6] }, // Late night
      social_proof: { hour: 18, days: [0, 4, 5, 6] }, // After work
      scarcity: { hour: 12, days: [0, 6] }, // Lunch, weekends
      loss_aversion: { hour: 20, days: [0, 1, 4, 5, 6] }, // Prime time
      progress: { hour: 10, days: [0, 1, 2, 3, 4, 5, 6] }, // Morning
      reciprocity: { hour: 9, days: [1, 2, 3, 4, 5] }, // Weekday morning
      commitment: { hour: 19, days: [0, 4, 5, 6] }, // Evening
      authority: { hour: 17, days: [0, 1, 4, 5, 6] }, // Game time
      novelty: { hour: 14, days: [1, 2, 3] }, // Midweek afternoon
    };

    const optimal = optimalTimes[triggerType];
    return { hour: optimal.hour, dayOfWeek: optimal.days };
  }

  /**
   * A/B test variant selection
   */
  selectVariant(trigger: DopamineTrigger): TriggerVariant | null {
    if (!trigger.variants || trigger.variants.length === 0) {
      return null;
    }

    const random = Math.random() * 100;
    let cumulative = 0;

    for (const variant of trigger.variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        return variant;
      }
    }

    return trigger.variants[0];
  }

  /**
   * Generate personalized notification
   */
  generatePersonalizedMessage(
    template: string,
    context: Record<string, any>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key]?.toString() ?? match;
    });
  }

  private evaluateCondition(condition: TriggerCondition, context: Record<string, any>): boolean {
    const value = context[condition.type];

    switch (condition.operator) {
      case "equals":
        return value === condition.value;
      case "gt":
        return value > condition.value;
      case "lt":
        return value < condition.value;
      case "gte":
        return value >= condition.value;
      case "lte":
        return value <= condition.value;
      case "contains":
        return Array.isArray(value) ? value.includes(condition.value) : String(value).includes(condition.value);
      case "not":
        return value !== condition.value;
      default:
        return false;
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createDopamineEngineService(): DopamineEngineService {
  return new DopamineEngineService();
}
