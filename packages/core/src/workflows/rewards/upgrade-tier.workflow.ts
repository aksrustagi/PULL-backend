/**
 * Upgrade Tier Workflow
 * Handles tier upgrades, downgrades, and tier maintenance checks
 */

import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
  condition,
} from "@temporalio/workflow";

import type * as activities from "./gamification-activities";

// Activity proxies
const {
  getUserTier,
  getUserLifetimePoints,
  calculateTierForPoints,
  updateUserTier,
  getTierBenefits,
  grantTierBenefits,
  revokeTierBenefits,
  sendTierUpgradeNotification,
  sendTierDowngradeWarning,
  sendTierDowngradeNotification,
  sendTierMaintainedNotification,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// Types
// ============================================================================

export interface UpgradeTierInput {
  userId: string;
  /** Trigger type for the tier check */
  trigger: "points_earned" | "manual_check" | "scheduled" | "admin";
  /** Current points balance */
  currentPoints?: number;
  /** Force recalculation */
  forceRecalculate?: boolean;
}

export interface TierChange {
  previousTier: string;
  newTier: string;
  direction: "upgrade" | "downgrade" | "maintained";
  previousMultiplier: number;
  newMultiplier: number;
  benefitsChanged: string[];
}

export interface UpgradeTierStatus {
  workflowId: string;
  status: "checking" | "upgrading" | "downgrading" | "completed" | "failed";
  userId: string;
  trigger: string;
  // Tier info
  previousTier: string;
  newTier: string;
  tierChange: TierChange | null;
  // Points info
  lifetimePoints: number;
  currentPeriodPoints: number;
  pointsToNextTier: number;
  // Benefits
  benefitsGranted: string[];
  benefitsRevoked: string[];
  // Timing
  processedAt?: number;
  error?: string;
}

// Signals
export const manualTierOverrideSignal = defineSignal<[string, string]>(
  "manualTierOverride"
);

// Queries
export const getUpgradeTierStatusQuery = defineQuery<UpgradeTierStatus>(
  "getUpgradeTierStatus"
);

// Tier thresholds
const TIER_THRESHOLDS = [
  { tier: "diamond", points: 100000, multiplier: 2.5 },
  { tier: "platinum", points: 50000, multiplier: 2.0 },
  { tier: "gold", points: 25000, multiplier: 1.5 },
  { tier: "silver", points: 10000, multiplier: 1.25 },
  { tier: "bronze", points: 0, multiplier: 1.0 },
];

// ============================================================================
// Main Workflow
// ============================================================================

export async function upgradeTierWorkflow(
  input: UpgradeTierInput
): Promise<UpgradeTierStatus> {
  const { userId, trigger, currentPoints, forceRecalculate = false } = input;

  const workflowId = `tier_${userId}_${crypto.randomUUID()}`;

  const status: UpgradeTierStatus = {
    workflowId,
    status: "checking",
    userId,
    trigger,
    previousTier: "bronze",
    newTier: "bronze",
    tierChange: null,
    lifetimePoints: 0,
    currentPeriodPoints: 0,
    pointsToNextTier: 10000,
    benefitsGranted: [],
    benefitsRevoked: [],
  };

  // Track manual override
  let manualOverride: { tier: string; reason: string } | null = null;

  setHandler(getUpgradeTierStatusQuery, () => status);
  setHandler(manualTierOverrideSignal, (tier: string, reason: string) => {
    manualOverride = { tier, reason };
  });

  try {
    // =========================================================================
    // Step 1: Get current tier and points
    // =========================================================================
    const [currentTier, lifetimePoints] = await Promise.all([
      getUserTier(userId),
      getUserLifetimePoints(userId),
    ]);

    status.previousTier = currentTier?.tierLevel ?? "bronze";
    status.lifetimePoints = lifetimePoints;
    status.currentPeriodPoints = currentPoints ?? lifetimePoints;

    // =========================================================================
    // Step 2: Calculate appropriate tier
    // =========================================================================
    const calculatedTier = calculateTierFromPoints(lifetimePoints);
    status.newTier = calculatedTier.tier;
    status.pointsToNextTier = calculatedTier.pointsToNext;

    // =========================================================================
    // Step 3: Determine if tier change is needed
    // =========================================================================
    const previousTierInfo = TIER_THRESHOLDS.find(
      (t) => t.tier === status.previousTier
    ) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]!;

    const newTierInfo = TIER_THRESHOLDS.find(
      (t) => t.tier === status.newTier
    ) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]!;

    const previousIndex = TIER_THRESHOLDS.findIndex(
      (t) => t.tier === status.previousTier
    );
    const newIndex = TIER_THRESHOLDS.findIndex(
      (t) => t.tier === status.newTier
    );

    // Higher index = lower tier (array is ordered highest to lowest)
    let direction: "upgrade" | "downgrade" | "maintained";
    if (newIndex < previousIndex) {
      direction = "upgrade";
      status.status = "upgrading";
    } else if (newIndex > previousIndex) {
      direction = "downgrade";
      status.status = "downgrading";
    } else {
      direction = "maintained";
    }

    // =========================================================================
    // Step 4: Process tier change
    // =========================================================================
    if (direction === "upgrade") {
      // Grant new tier benefits
      const benefits = await getTierBenefits(status.newTier);
      const previousBenefits = await getTierBenefits(status.previousTier);

      const newBenefits = benefits.filter(
        (b) => !previousBenefits.some((pb) => pb.id === b.id)
      );

      for (const benefit of newBenefits) {
        await grantTierBenefits(userId, benefit);
        status.benefitsGranted.push(benefit.name);
      }

      // Update tier in database
      await updateUserTier(userId, status.newTier, lifetimePoints);

      // Send upgrade notification
      await sendTierUpgradeNotification(userId, {
        previousTier: status.previousTier,
        newTier: status.newTier,
        newMultiplier: newTierInfo.multiplier,
        newBenefits: status.benefitsGranted,
      });

      status.tierChange = {
        previousTier: status.previousTier,
        newTier: status.newTier,
        direction: "upgrade",
        previousMultiplier: previousTierInfo.multiplier,
        newMultiplier: newTierInfo.multiplier,
        benefitsChanged: status.benefitsGranted,
      };
    } else if (direction === "downgrade") {
      // Revoke benefits from higher tier
      const previousBenefits = await getTierBenefits(status.previousTier);
      const newBenefits = await getTierBenefits(status.newTier);

      const lostBenefits = previousBenefits.filter(
        (b) => !newBenefits.some((nb) => nb.id === b.id)
      );

      for (const benefit of lostBenefits) {
        await revokeTierBenefits(userId, benefit);
        status.benefitsRevoked.push(benefit.name);
      }

      // Update tier in database
      await updateUserTier(userId, status.newTier, lifetimePoints);

      // Send downgrade notification
      await sendTierDowngradeNotification(userId, {
        previousTier: status.previousTier,
        newTier: status.newTier,
        newMultiplier: newTierInfo.multiplier,
        lostBenefits: status.benefitsRevoked,
        pointsToRecover: previousTierInfo.points - lifetimePoints,
      });

      status.tierChange = {
        previousTier: status.previousTier,
        newTier: status.newTier,
        direction: "downgrade",
        previousMultiplier: previousTierInfo.multiplier,
        newMultiplier: newTierInfo.multiplier,
        benefitsChanged: status.benefitsRevoked,
      };
    } else {
      // Tier maintained
      status.tierChange = {
        previousTier: status.previousTier,
        newTier: status.newTier,
        direction: "maintained",
        previousMultiplier: previousTierInfo.multiplier,
        newMultiplier: newTierInfo.multiplier,
        benefitsChanged: [],
      };
    }

    // =========================================================================
    // Step 5: Record audit log
    // =========================================================================
    await recordAuditLog({
      userId,
      action: `tier_${direction}`,
      resourceType: "tier",
      resourceId: workflowId,
      metadata: {
        trigger,
        previousTier: status.previousTier,
        newTier: status.newTier,
        lifetimePoints,
        benefitsGranted: status.benefitsGranted,
        benefitsRevoked: status.benefitsRevoked,
      },
    });

    status.status = "completed";
    status.processedAt = Date.now();

    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId,
      action: "tier_upgrade_failed",
      resourceType: "tier",
      resourceId: workflowId,
      metadata: {
        error: status.error,
        trigger,
      },
    });

    throw error;
  }
}

// ============================================================================
// Batch Tier Check Workflow
// ============================================================================

export interface BatchTierCheckInput {
  batchSize?: number;
  checkDowngrades?: boolean;
}

export interface BatchTierCheckStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  totalChecked: number;
  upgraded: number;
  downgraded: number;
  maintained: number;
  errors: string[];
}

export const getBatchTierCheckStatusQuery = defineQuery<BatchTierCheckStatus>(
  "getBatchTierCheckStatus"
);

/**
 * Batch workflow to check all user tiers (for scheduled maintenance)
 */
export async function batchTierCheckWorkflow(
  input: BatchTierCheckInput = {}
): Promise<BatchTierCheckStatus> {
  const { batchSize = 100, checkDowngrades = true } = input;

  const runId = `tier_batch_${crypto.randomUUID()}`;

  const status: BatchTierCheckStatus = {
    runId,
    status: "running",
    startedAt: Date.now(),
    totalChecked: 0,
    upgraded: 0,
    downgraded: 0,
    maintained: 0,
    errors: [],
  };

  setHandler(getBatchTierCheckStatusQuery, () => status);

  try {
    // This would be implemented to iterate through all users
    // For now, this is a placeholder for the batch processing logic

    status.status = "completed";
    status.completedAt = Date.now();

    await recordAuditLog({
      userId: "system",
      action: "batch_tier_check",
      resourceType: "system",
      resourceId: runId,
      metadata: {
        totalChecked: status.totalChecked,
        upgraded: status.upgraded,
        downgraded: status.downgraded,
        maintained: status.maintained,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";
    status.errors.push(
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateTierFromPoints(points: number): {
  tier: string;
  multiplier: number;
  pointsToNext: number;
} {
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    const threshold = TIER_THRESHOLDS[i]!;
    if (points >= threshold.points) {
      const nextTier = TIER_THRESHOLDS[i - 1];
      const pointsToNext = nextTier
        ? nextTier.points - points
        : 0;

      return {
        tier: threshold.tier,
        multiplier: threshold.multiplier,
        pointsToNext: Math.max(0, pointsToNext),
      };
    }
  }

  return {
    tier: "bronze",
    multiplier: 1.0,
    pointsToNext: 10000 - points,
  };
}
