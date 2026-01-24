/**
 * Agent Referral Earnings Workflow
 * Calculates and credits earnings to agents based on referred client trading volume
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

const {
  getReferralsForEarnings,
  creditReferralEarnings,
  updateReferralStatus,
  awardAgentPoints,
  sendAgentReferralNotification,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Input
export interface ReferralEarningsInput {
  agentId: string;
  commissionRate: number; // e.g., 0.001 for 0.1% of trading volume
  minVolumeThreshold: number; // Minimum volume to trigger payout
  runPeriodically?: boolean;
  periodHours?: number;
}

// Status
export interface ReferralEarningsStatus {
  agentId: string;
  phase: "initializing" | "fetching_referrals" | "calculating_earnings" | "crediting" | "completed" | "failed";
  referralsProcessed: number;
  totalReferrals: number;
  totalEarnings: number;
  totalVolume: number;
  lastRunAt?: string;
  nextRunAt?: string;
  errorMessage?: string;
}

export const getReferralEarningsStatusQuery = defineQuery<ReferralEarningsStatus>("getReferralEarningsStatus");

/**
 * Referral Earnings Workflow
 * Calculates earnings from referred clients' trading activity
 */
export async function referralEarningsWorkflow(input: ReferralEarningsInput): Promise<ReferralEarningsStatus> {
  const {
    agentId,
    commissionRate,
    minVolumeThreshold,
    runPeriodically = false,
    periodHours = 24,
  } = input;

  const status: ReferralEarningsStatus = {
    agentId,
    phase: "initializing",
    referralsProcessed: 0,
    totalReferrals: 0,
    totalEarnings: 0,
    totalVolume: 0,
  };

  setHandler(getReferralEarningsStatusQuery, () => status);

  try {
    await recordAuditLog({
      action: "realEstate.referral_earnings_started",
      resourceType: "realEstateAgents",
      resourceId: agentId,
      metadata: { commissionRate, minVolumeThreshold },
    });

    // =========================================================================
    // Step 1: Get all active referrals for this agent
    // =========================================================================
    status.phase = "fetching_referrals";

    const referrals = await getReferralsForEarnings(agentId);
    status.totalReferrals = referrals.length;

    if (referrals.length === 0) {
      status.phase = "completed";
      status.lastRunAt = new Date().toISOString();
      return status;
    }

    // =========================================================================
    // Step 2: Calculate and credit earnings for each referral
    // =========================================================================
    status.phase = "calculating_earnings";

    let volumeMilestoneReached = false;

    for (const referral of referrals) {
      // Skip if below minimum threshold
      if (referral.tradingVolume < minVolumeThreshold) {
        continue;
      }

      status.phase = "crediting";

      const earnings = await creditReferralEarnings(
        agentId,
        referral.referralId,
        referral.userId,
        referral.tradingVolume,
        commissionRate
      );

      status.referralsProcessed++;
      status.totalEarnings += earnings;
      status.totalVolume += referral.tradingVolume;

      // Check for volume milestones
      if (status.totalVolume >= 100000 && !volumeMilestoneReached) {
        volumeMilestoneReached = true;
        await awardAgentPoints(
          agentId,
          "referral_volume",
          500,
          "Referred clients reached $100K trading volume",
          referral.referralId
        );
      }
    }

    // =========================================================================
    // Step 3: Send notification if earnings were credited
    // =========================================================================
    if (status.totalEarnings > 0) {
      await sendAgentReferralNotification(
        agentId,
        "volume_milestone",
        "",
        {
          totalEarnings: status.totalEarnings,
          totalVolume: status.totalVolume,
          referralsActive: status.referralsProcessed,
        }
      );
    }

    // =========================================================================
    // Step 4: Complete and optionally schedule next run
    // =========================================================================
    status.phase = "completed";
    status.lastRunAt = new Date().toISOString();

    await recordAuditLog({
      action: "realEstate.referral_earnings_completed",
      resourceType: "realEstateAgents",
      resourceId: agentId,
      metadata: {
        referralsProcessed: status.referralsProcessed,
        totalEarnings: status.totalEarnings,
        totalVolume: status.totalVolume,
      },
    });

    // Run periodically if configured
    if (runPeriodically) {
      const nextRun = new Date(Date.now() + periodHours * 60 * 60 * 1000);
      status.nextRunAt = nextRun.toISOString();

      await sleep(`${periodHours} hours`);

      // Continue as new to prevent history buildup
      await continueAsNew<typeof referralEarningsWorkflow>(input);
    }

    return status;

  } catch (error) {
    status.phase = "failed";
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "realEstate.referral_earnings_failed",
      resourceType: "realEstateAgents",
      resourceId: agentId,
      metadata: { error: status.errorMessage },
    });

    throw error;
  }
}

/**
 * Batch process earnings for multiple agents
 */
export interface BatchEarningsInput {
  agentIds: string[];
  commissionRate: number;
  minVolumeThreshold: number;
}

export interface BatchEarningsStatus {
  phase: "processing" | "completed" | "failed";
  agentsProcessed: number;
  totalAgents: number;
  totalEarningsCredited: number;
  errors: string[];
}

export const getBatchEarningsStatusQuery = defineQuery<BatchEarningsStatus>("getBatchEarningsStatus");

export async function batchReferralEarningsWorkflow(input: BatchEarningsInput): Promise<BatchEarningsStatus> {
  const { agentIds, commissionRate, minVolumeThreshold } = input;

  const status: BatchEarningsStatus = {
    phase: "processing",
    agentsProcessed: 0,
    totalAgents: agentIds.length,
    totalEarningsCredited: 0,
    errors: [],
  };

  setHandler(getBatchEarningsStatusQuery, () => status);

  for (const agentId of agentIds) {
    try {
      const referrals = await getReferralsForEarnings(agentId);

      for (const referral of referrals) {
        if (referral.tradingVolume >= minVolumeThreshold) {
          const earnings = await creditReferralEarnings(
            agentId,
            referral.referralId,
            referral.userId,
            referral.tradingVolume,
            commissionRate
          );
          status.totalEarningsCredited += earnings;
        }
      }

      status.agentsProcessed++;
    } catch (error) {
      status.errors.push(`Agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  status.phase = status.errors.length > 0 ? "completed" : "completed";

  await recordAuditLog({
    action: "realEstate.batch_earnings_completed",
    resourceType: "system",
    resourceId: "batch_earnings",
    metadata: {
      agentsProcessed: status.agentsProcessed,
      totalEarnings: status.totalEarningsCredited,
      errors: status.errors.length,
    },
  });

  return status;
}
